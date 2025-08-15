// src/app/agent/page.tsx
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Pusher from 'pusher-js';
import { toast } from 'react-hot-toast';

type SenderType = 'user' | 'bot' | 'agent';
type ConversationStatus = 'bot' | 'pending_human' | 'active_human' | 'closed';

type Conversation = {
  id: string;
  userId: string;
  agentId: string | null;
  status: ConversationStatus;
  createdAt: string;
  updatedAt: string;
  user?: { id: string; name?: string; email?: string };
  agent?: { id: string; name?: string; email?: string } | null;
};

type ChatMessage = {
  id: string;
  senderType: SenderType;
  message: string;
  createdAt: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function AgentConsole() {
  const router = useRouter();

  // auth
  const [token, setToken] = useState<string | null>(null);
  const [agent, setAgent] = useState<{ id: string; role: 'agent'; name?: string; email?: string } | null>(null);

  // data
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);

  // active chat
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamText, setStreamText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // compose
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);

  // sockets
  const pusherRef = useRef<Pusher | null>(null);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pushIfNew = (m: ChatMessage) => {
    if (seenIdsRef.current.has(m.id)) return;
    seenIdsRef.current.add(m.id);
    setMessages((prev) => [...prev, m]);
  };

  // --- auth bootstrap (agent only) ---
  useEffect(() => {
    const t = localStorage.getItem('token');
    const uStr = localStorage.getItem('user');
    if (!t || !uStr) {
      toast.error('Please log in as an agent');
      router.push('/auth/login');
      return;
    }
    try {
      const u = JSON.parse(uStr);
      if (u.role !== 'agent') {
        toast.error('This page is for agents only.');
        router.push('/auth/login');
        return;
      }
      setToken(t);
      setAgent({ id: u.id, role: 'agent', name: u.name, email: u.email });
    } catch {
      toast.error('Invalid session, please log in again');
      router.push('/auth/login');
    }
  }, [router]);

  // --- fetch conversations (assigned + pending) ---
  async function fetchConversations(currentActive?: string | null) {
    if (!token) return;
    try {
      setLoadingConvos(true);
      const res = await fetch(`${API_BASE}/conversations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      const convos: Conversation[] = data.conversations || [];
      setConversations(convos);

      if (currentActive) {
        // keep active selection if still present
        if (convos.find((c) => c.id === currentActive)) return;
        setActiveId(null);
        setActiveConvo(null);
        setMessages([]);
        setStreamText('');
        seenIdsRef.current.clear();
      } else if (!activeId && convos.length) {
        // auto select first assigned if any, else leave none selected
        const firstAssigned = convos.find((c) => c.agentId === agent?.id && c.status === 'active_human');
        if (firstAssigned) setActiveId(firstAssigned.id);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to load conversations');
    } finally {
      setLoadingConvos(false);
    }
  }

  useEffect(() => {
    if (!token || !agent) return;
    fetchConversations(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, agent?.id]);

  // --- load selected conversation thread ---
  useEffect(() => {
    if (!token || !activeId) {
      setActiveConvo(null);
      setMessages([]);
      setStreamText('');
      seenIdsRef.current.clear();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/conversations/${activeId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        setActiveConvo(data.conversation);
        const msgs: ChatMessage[] = data.messages || [];
        setMessages(msgs);
        seenIdsRef.current = new Set(msgs.map((m) => m.id));
        setStreamText('');
      } catch (e) {
        console.error(e);
        toast.error('Failed to load conversation');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, activeId]);

  // --- pusher: create once ---
  useEffect(() => {
    if (!token) return;
    if (pusherRef.current) return;
    const p = new Pusher(process.env.NEXT_PUBLIC_PUSHER_KEY as string, {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER,
      channelAuthorization: {
        endpoint: '/api/pusher/auth',
        transport: 'ajax',
        headers: { Authorization: `Bearer ${token}` },
      },
    });
    pusherRef.current = p;
    return () => {
      p.disconnect();
      pusherRef.current = null;
    };
  }, [token]);

  // --- subscribe: presence-agents (for new escalations) ---
  useEffect(() => {
    if (!pusherRef.current) return;
    const ch = pusherRef.current.subscribe('presence-agents');
    const onEscalation = (_p: { conversationId: string; userId: string }) => {
      fetchConversations(activeId);
      toast('New escalation request', { icon: '📣' });
    };
    ch.bind('escalation:requested', onEscalation);
    return () => {
      ch.unbind('escalation:requested', onEscalation);
      pusherRef.current?.unsubscribe('presence-agents');
    };
  }, [activeId]);

  // --- subscribe: agent-{agentId} (receive messages and streams) ---
  useEffect(() => {
    if (!pusherRef.current || !agent?.id) return;
    const name = `agent-${agent.id}`;
    const ch = pusherRef.current.subscribe(name);

    const onStream = (p: { conversationId: string; delta: string }) => {
      if (p.conversationId !== activeId) return;
      setStreamText((prev) => prev + p.delta);
      queueMicrotask(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    };
    const onNew = (p: { conversationId: string; message: ChatMessage }) => {
      if (p.conversationId !== activeId) return;
      pushIfNew(p.message);
      setStreamText('');
      queueMicrotask(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    };

    const onReleased = (p: { conversationId: string }) => {
      // user/agent released back to bot
      if (activeId && p.conversationId === activeId) {
        setActiveConvo((prev) => (prev ? { ...prev, status: 'bot', agentId: null } : prev));
      }
      fetchConversations(activeId);
      toast('Conversation released back to AI', { icon: '♻️' });
    };

    ch.bind('message:stream', onStream);
    ch.bind('message:new', onNew);
    ch.bind('conversation:released', onReleased);

    return () => {
      ch.unbind('message:stream', onStream);
      ch.unbind('message:new', onNew);
      ch.unbind('conversation:released', onReleased);
      pusherRef.current?.unsubscribe(name);
    };
  }, [agent?.id, activeId]);

  // --- derived lists ---
  const pending = useMemo(
    () => conversations.filter((c) => c.status === 'pending_human' && !c.agentId),
    [conversations]
  );
  const assigned = useMemo(
    () => conversations.filter((c) => c.agentId === agent?.id && c.status === 'active_human'),
    [conversations, agent?.id]
  );

  // --- actions ---
  async function handleAccept(conversationId: string) {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/conversations/${conversationId}/accept`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Conversation accepted');
      await fetchConversations(conversationId);
      setActiveId(conversationId);
    } catch (e) {
      console.error(e);
      toast.error('Failed to accept conversation');
    }
  }

  async function handleSend() {
    if (!token || !activeId || !activeConvo) return;
    const text = input.trim();
    if (!text) return;

    if (activeConvo.status !== 'active_human' || activeConvo.agentId !== agent?.id) {
      toast('You must accept this conversation to chat.', { icon: '⚠️' });
      return;
    }

    try {
      setSending(true);
      const res = await fetch(`${API_BASE}/conversations/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, senderType: 'agent' }),
      });
      if (!res.ok) throw new Error(await res.text());
      setInput('');
      // Don't push my own message; rely on server broadcast to avoid duplicates
    } catch (e) {
      console.error(e);
      toast.error('Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function handleReleaseToAI() {
    if (!token || !activeId || !activeConvo) return;
    try {
      const res = await fetch(`${API_BASE}/conversations/${activeId}/back-to-bot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      toast.success('Released back to AI');
      await fetchConversations(activeId);
    } catch (e) {
      console.error(e);
      toast.error('Failed to release');
    }
  }

  // --- UI helpers ---
  const statusChip = useMemo(() => {
    const s = activeConvo?.status;
    if (!s) return null;
    const styles: Record<ConversationStatus, string> = {
      bot: 'bg-indigo-100 text-indigo-700',
      pending_human: 'bg-amber-100 text-amber-700',
      active_human: 'bg-emerald-100 text-emerald-700',
      closed: 'bg-gray-200 text-gray-700',
    };
    return <span className={`px-2 py-1 rounded text-xs font-medium ${styles[s]}`}>{s.replace('_', ' ')}</span>;
  }, [activeConvo?.status]);

  const canSend = Boolean(
    input.trim() && activeConvo?.status === 'active_human' && activeConvo.agentId === agent?.id && !sending
  );

  return (
    <div className="h-[100dvh] w-full flex text-gray-900">
      {/* Left panel: queues */}
      <aside className="w-96 border-r border-gray-200 flex flex-col">
        <div className="p-4">
          <h1 className="text-lg font-semibold">Agent Console</h1>
          <div className="text-xs text-gray-500 mt-1">Signed in as {agent?.email || agent?.id}</div>
        </div>

        <div className="px-4 py-2 border-t border-gray-200">
          <h2 className="text-sm font-medium">Pending requests</h2>
        </div>
        <div className="flex-1 overflow-auto">
          {loadingConvos ? (
            <div className="p-4 text-sm text-gray-500">Loading…</div>
          ) : pending.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No pending requests</div>
          ) : (
            <ul className="divide-y">
              {pending.map((c) => (
                <li key={c.id} className="px-4 py-3">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{c.user?.name || c.user?.email || c.userId}</div>
                      <div className="text-xs text-gray-500 truncate">#{c.id.slice(0, 8)}</div>
                    </div>
                    <button
                      onClick={() => handleAccept(c.id)}
                      className="ml-3 px-3 py-1.5 rounded-md bg-emerald-600 text-white text-sm hover:bg-emerald-700"
                    >
                      Accept
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="px-4 py-2 border-t border-gray-200">
          <h2 className="text-sm font-medium">Assigned to me</h2>
        </div>
        <div className="h-48 overflow-auto">
          {assigned.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No active chats</div>
          ) : (
            <ul>
              {assigned.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between ${
                      activeId === c.id ? 'bg-gray-100' : ''
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-medium truncate">{c.user?.name || c.user?.email || c.userId}</div>
                      <div className="text-xs text-gray-500 truncate">#{c.id.slice(0, 8)}</div>
                    </div>
                    <span className="ml-2 h-2 w-2 rounded-full bg-emerald-500" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Right panel: chat */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="font-semibold">Chat</h2>
            {statusChip}
            {activeConvo?.user && (
              <span className="text-sm text-gray-600">
                • User: <strong>{activeConvo.user.name || activeConvo.user.email || activeConvo.userId}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {activeConvo?.status === 'active_human' && activeConvo.agentId === agent?.id && (
              <button
                onClick={handleReleaseToAI}
                className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700"
              >
                Release to AI
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {!activeId ? (
            <div className="text-sm text-gray-500">Pick a pending request or an assigned conversation to start.</div>
          ) : (
            <>
              {messages.map((m) => {
                const isMine = m.senderType === 'agent';
                const align = isMine ? 'items-end' : 'items-start';
                const bubble =
                  m.senderType === 'agent'
                    ? 'bg-emerald-600 text-white'
                    : m.senderType === 'user'
                    ? 'bg-gray-100 text-gray-900'
                    : 'bg-indigo-100 text-indigo-900';
                const label = m.senderType === 'agent' ? 'You' : m.senderType === 'user' ? 'User' : 'Bot';
                return (
                  <div key={m.id} className={`flex flex-col ${align}`}>
                    <div className="text-xs text-gray-500 mb-1">{label}</div>
                    <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${bubble}`}>{m.message}</div>
                  </div>
                );
              })}

              {/* If any stream text arrives on agent channel, show it */}
              {streamText && (
                <div className="flex flex-col items-start">
                  <div className="text-xs text-gray-500 mb-1">Streaming</div>
                  <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-gray-100 text-gray-900 whitespace-pre-wrap">
                    {streamText}
                  </div>
                </div>
              )}

              <div ref={endRef} />
            </>
          )}
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex gap-2">
            <input
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              placeholder={
                activeConvo?.status === 'active_human'
                  ? 'Type your message…'
                  : activeConvo?.status === 'pending_human'
                  ? 'Accept the conversation to start chatting'
                  : activeConvo?.status === 'bot'
                  ? 'User is with AI. Accept a pending conversation from the left.'
                  : 'Conversation is closed'
              }
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) handleSend();
                }
              }}
              disabled={
                !activeConvo ||
                activeConvo.status !== 'active_human' ||
                activeConvo.agentId !== agent?.id ||
                sending
              }
            />
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={`px-4 py-3 rounded-xl text-white bg-emerald-600 hover:bg-emerald-700 ${
                !canSend ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
