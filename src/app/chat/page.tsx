// src/app/chat/page.tsx
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
  agent?: { id: string; name?: string; email?: string } | null;
};

type ChatMessage = {
  id: string;
  senderType: SenderType;
  message: string;
  createdAt: string;
};

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export default function ChatPage() {
  const router = useRouter();

  // Auth/session
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ id: string; role: 'user' | 'agent'; name?: string; email?: string } | null>(null);

  // Sidebar conversations
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);

  // Active conversation
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeConvo, setActiveConvo] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamText, setStreamText] = useState('');
  const endRef = useRef<HTMLDivElement | null>(null);

  // Composer
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [creating, setCreating] = useState(false);
  const canSend = input.trim().length > 0 && !sending && activeConvo?.status !== 'closed';

  // AI typing/loading indicator
  const [aiPending, setAiPending] = useState(false);

  // Pusher single instance
  const pusherRef = useRef<Pusher | null>(null);

  // De-dupe inbound messages
  const seenIdsRef = useRef<Set<string>>(new Set());
  const pushIfNew = (msg: ChatMessage) => {
    if (seenIdsRef.current.has(msg.id)) return;
    seenIdsRef.current.add(msg.id);
    setMessages((prev) => [...prev, msg]);
  };

  // Boot auth
  useEffect(() => {
    const t = localStorage.getItem('token');
    const u = localStorage.getItem('user');
    if (!t || !u) {
      toast.error('Please log in first');
      router.push('/auth/login');
      return;
    }
    try {
      setToken(t);
      const parsed = JSON.parse(u);
      if (parsed.role !== 'user') {
        toast.error('Please use a user account to access /chat');
        router.push('/auth/login');
        return;
      }
      setUser({ id: parsed.id, role: parsed.role, name: parsed.name, email: parsed.email });
    } catch {
      toast.error('Invalid session, please log in again');
      router.push('/auth/login');
    }
  }, [router]);

  // Load conversations list
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        setLoadingConvos(true);
        const res = await fetch(`${API_BASE}/conversations`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (cancelled) return;
        const convos: Conversation[] = data.conversations || [];
        setConversations(convos);
        if (!activeId && convos.length) setActiveId(convos[0].id);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load conversations');
      } finally {
        if (!cancelled) setLoadingConvos(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]); // eslint-disable-line

  // Load a conversation thread
  useEffect(() => {
    if (!token || !activeId) {
      setActiveConvo(null);
      setMessages([]);
      setStreamText('');
      setAiPending(false);
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
        setAiPending(false);
      } catch (e) {
        console.error(e);
        toast.error('Failed to load conversation');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, activeId]);

  // Create pusher once per token
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

  // Subscribe to active conversation channel
  useEffect(() => {
    if (!pusherRef.current || !activeId) return;

    const channelName = `chat-${activeId}`;
    const ch = pusherRef.current.subscribe(channelName);

    const onStream = (p: { conversationId: string; delta: string }) => {
      if (p.conversationId !== activeId) return;
      setStreamText((prev) => prev + p.delta);
      // keep aiPending true while streaming; hidden by condition (!streamText) below
      queueMicrotask(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    };

    const onNew = (p: { conversationId: string; message: ChatMessage }) => {
      if (p.conversationId !== activeId) return;
      pushIfNew(p.message);
      setStreamText('');
      setAiPending(false); // final answer arrived
      queueMicrotask(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }));
    };

    const onAssigned = (p: { conversationId: string; agent: { id: string; name?: string; email?: string } }) => {
      if (p.conversationId !== activeId) return;
      setActiveConvo((prev) =>
        prev ? { ...prev, agentId: p.agent.id, agent: p.agent, status: 'active_human' } : prev
      );
      setConversations((prev) =>
        prev.map((c) => (c.id === p.conversationId ? { ...c, status: 'active_human', agentId: p.agent.id, agent: p.agent } : c))
      );
      toast.success(`Agent assigned: ${p.agent.name || p.agent.email || 'Agent'}`);
    };

    const onClosed = (p: { conversationId: string }) => {
      if (p.conversationId !== activeId) return;
      setActiveConvo((prev) => (prev ? { ...prev, status: 'closed' } : prev));
      setConversations((prev) => prev.map((c) => (c.id === p.conversationId ? { ...c, status: 'closed' } : c)));
      toast('Conversation closed', { icon: '🔒' });
    };

    const onBotMode = (p: { conversationId: string }) => {
      if (p.conversationId !== activeId) return;
      setActiveConvo((prev) => (prev ? { ...prev, status: 'bot', agentId: null, agent: null } : prev));
      setConversations((prev) =>
        prev.map((c) => (c.id === p.conversationId ? { ...c, status: 'bot', agentId: null, agent: null } : c))
      );
      setAiPending(false);
      setStreamText('');
      toast.success('Switched back to AI');
    };

    ch.bind('message:stream', onStream);
    ch.bind('message:new', onNew);
    ch.bind('agent:assigned', onAssigned);
    ch.bind('conversation:closed', onClosed);
    ch.bind('conversation:bot_mode', onBotMode);

    return () => {
      ch.unbind('message:stream', onStream);
      ch.unbind('message:new', onNew);
      ch.unbind('agent:assigned', onAssigned);
      ch.unbind('conversation:closed', onClosed);
      ch.unbind('conversation:bot_mode', onBotMode);
      pusherRef.current?.unsubscribe(channelName);
    };
  }, [activeId]);

  // Auto-scroll to bottom on message count change
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Status badge
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

  // Actions
  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    if (!token) {
      toast.error('Please log in again');
      router.push('/auth/login');
      return;
    }

    try {
      setSending(true);

      // First message: create a new conversation (server also triggers first AI)
      if (!activeId) {
        setCreating(true);
        const res = await fetch(`${API_BASE}/conversations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ message: text }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();

        const c: Conversation = {
          id: data.conversation.id,
          userId: user!.id,
          agentId: null,
          status: 'bot',
          createdAt: data.conversation.createdAt,
          updatedAt: data.conversation.createdAt,
          agent: null,
        };
        setActiveId(c.id);
        setActiveConvo(c);
        setConversations((prev) => [c, ...prev.filter((x) => x.id !== c.id)]);

        const first: ChatMessage = {
          id: data.message.id,
          senderType: 'user',
          message: text,
          createdAt: data.message.createdAt,
        };
        seenIdsRef.current.add(first.id);
        setMessages([first]);
        setInput('');
        setAiPending(true); // expect AI reply
        toast.success('Conversation created');
        return;
      }

      // Existing conversation: send message (server will broadcast my message + bot stream)
      const res = await fetch(`${API_BASE}/conversations/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ message: text, senderType: 'user' }),
      });
      if (!res.ok) throw new Error(await res.text());
      setInput('');
      // Expect bot reply when no agent assigned and status is bot or pending_human
      if (!activeConvo?.agentId && (activeConvo?.status === 'bot' || activeConvo?.status === 'pending_human')) {
        setAiPending(true);
      }
    } catch (e) {
      console.error(e);
      toast.error('Failed to send message');
    } finally {
      setSending(false);
      setCreating(false);
    }
  }

  async function handleEscalate() {
    if (!activeId || !token || !activeConvo) return;
    if (activeConvo.status !== 'bot') {
      toast('Already escalated/assigned/closed');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/conversations/${activeId}/escalate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setActiveConvo({ ...activeConvo, status: 'pending_human' });
      setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, status: 'pending_human' } : c)));
      toast.success('Escalation requested — waiting for an agent…');
    } catch (e) {
      console.error(e);
      toast.error('Failed to escalate');
    }
  }

  async function handleCancelEscalation() {
    if (!activeId || !token || !activeConvo) return;
    try {
      const res = await fetch(`${API_BASE}/conversations/${activeId}/deescalate`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setActiveConvo({ ...activeConvo, status: 'bot' });
      setConversations((prev) => prev.map((c) => (c.id === activeId ? { ...c, status: 'bot' } : c)));
      setAiPending(false);
      setStreamText('');
      toast.success('Escalation cancelled — back to AI');
    } catch (e) {
      console.error(e);
      toast.error('Failed to cancel');
    }
  }

  async function handleBackToAI() {
    if (!activeId || !token || !activeConvo) return;
    try {
      const res = await fetch(`${API_BASE}/conversations/${activeId}/back-to-bot`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(await res.text());
      setActiveConvo({ ...activeConvo, status: 'bot', agentId: null, agent: null });
      setConversations((prev) =>
        prev.map((c) => (c.id === activeId ? { ...c, status: 'bot', agentId: null, agent: null } : c))
      );
      setAiPending(false);
      setStreamText('');
      toast.success('Back to AI');
    } catch (e) {
      console.error(e);
      toast.error('Failed to switch back to AI');
    }
  }

  function newChat() {
    setActiveId(null);
    setActiveConvo(null);
    setMessages([]);
    setStreamText('');
    setAiPending(false);
    seenIdsRef.current.clear();
    setInput('');
  }

  const disabledInput = activeConvo?.status === 'closed';
  const showEscalate = activeConvo?.status === 'bot';
  const showCancel = activeConvo?.status === 'pending_human';
  const showBackToAI = activeConvo?.status === 'active_human';

  return (
    <div className="h-[100dvh] w-full flex text-gray-900">
      {/* Sidebar */}
      <aside className="w-80 border-r border-gray-200 flex flex-col">
        <div className="p-4 flex items-center justify-between">
          <h2 className="font-semibold">Your Conversations</h2>
          <button
            onClick={newChat}
            className="text-sm px-3 py-1.5 rounded-md bg-indigo-600 text-white hover:bg-indigo-700"
          >
            New chat
          </button>
        </div>
        <div className="px-4 pb-2">
          <div className="text-xs text-gray-500">Logged in as {user?.email}</div>
        </div>
        <div className="flex-1 overflow-auto">
          {loadingConvos ? (
            <div className="p-4 text-sm text-gray-500">Loading…</div>
          ) : conversations.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">No conversations yet.</div>
          ) : (
            <ul>
              {conversations.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setActiveId(c.id)}
                    className={`w-full text-left px-4 py-3 hover:bg-gray-50 flex items-center justify-between ${
                      activeId === c.id ? 'bg-gray-100' : ''
                    }`}
                  >
                    <div className="truncate">
                      <div className="font-medium truncate">Conversation</div>
                      <div className="text-xs text-gray-500 truncate">Status: {c.status.replace('_', ' ')}</div>
                    </div>
                    <span
                      className={`ml-2 h-2 w-2 rounded-full ${
                        c.status === 'bot'
                          ? 'bg-indigo-500'
                          : c.status === 'pending_human'
                          ? 'bg-amber-500'
                          : c.status === 'active_human'
                          ? 'bg-emerald-500'
                          : 'bg-gray-400'
                      }`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>

      {/* Chat panel */}
      <main className="flex-1 flex flex-col">
        {/* Header */}
        <div className="border-b border-gray-200 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="font-semibold">Support Chat</h1>
            {statusChip}
            {activeConvo?.agent && (
              <span className="text-sm text-gray-600">
                • Agent: <strong>{activeConvo.agent.name || activeConvo.agent.email}</strong>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showEscalate && (
              <button
                onClick={handleEscalate}
                className="px-3 py-1.5 rounded-md bg-amber-500 text-white text-sm hover:bg-amber-600"
              >
                Talk to Human
              </button>
            )}
            {showCancel && (
              <button
                onClick={handleCancelEscalation}
                className="px-3 py-1.5 rounded-md bg-gray-600 text-white text-sm hover:bg-gray-700"
              >
                Cancel request
              </button>
            )}
            {showBackToAI && (
              <button
                onClick={handleBackToAI}
                className="px-3 py-1.5 rounded-md bg-indigo-600 text-white text-sm hover:bg-indigo-700"
              >
                Back to AI
              </button>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-3">
          {activeId == null && (
            <div className="text-sm text-gray-500">Start a new chat from the left, then send your first message.</div>
          )}

          {messages.map((m) => {
            const isMine = m.senderType === 'user';
            const align = isMine ? 'items-end' : 'items-start';
            const bubble =
              m.senderType === 'user'
                ? 'bg-indigo-600 text-white'
                : m.senderType === 'agent'
                ? 'bg-emerald-100 text-emerald-900'
                : 'bg-gray-100 text-gray-900';
            const label = m.senderType === 'user' ? 'You' : m.senderType === 'agent' ? 'Agent' : 'Bot';

            return (
              <div key={m.id} className={`flex flex-col ${align}`}>
                <div className="text-xs text-gray-500 mb-1">{label}</div>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${bubble}`}>{m.message}</div>
              </div>
            );
          })}

          {/* Typing/Loading bubble (shows before streaming starts) */}
          {aiPending && !streamText && (
            <div className="flex flex-col items-start">
              <div className="text-xs text-gray-500 mb-1">Bot</div>
              <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-gray-100 text-gray-900">
                <span className="inline-flex items-center gap-1">
                  <span className="animate-pulse">●</span>
                  <span className="animate-pulse" style={{ animationDelay: '0.15s' }}>
                    ●
                  </span>
                  <span className="animate-pulse" style={{ animationDelay: '0.3s' }}>
                    ●
                  </span>
                </span>
              </div>
            </div>
          )}

          {/* Streaming bubble (replaces typing bubble once tokens arrive) */}
          {streamText && (
            <div className="flex flex-col items-start">
              <div className="text-xs text-gray-500 mb-1">Bot</div>
              <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-gray-100 text-gray-900 whitespace-pre-wrap">
                {streamText}
              </div>
            </div>
          )}

          <div ref={endRef} />
        </div>

        {/* Composer */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex gap-2">
            <input
              className="flex-1 px-4 py-3 rounded-xl border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder={activeConvo?.status === 'closed' ? 'Conversation is closed' : 'Type your message…'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (canSend) handleSend();
                }
              }}
              disabled={activeConvo?.status === 'closed' || creating}
            />
            <button
              onClick={handleSend}
              disabled={!canSend}
              className={`px-4 py-3 rounded-xl text-white bg-indigo-600 hover:bg-indigo-700 ${
                !canSend ? 'opacity-60 cursor-not-allowed' : ''
              }`}
            >
              {creating ? 'Starting…' : sending ? 'Sending…' : 'Send'}
            </button>
          </div>
          {activeConvo?.status === 'closed' && (
            <div className="text-xs text-gray-500 mt-2">This conversation has been closed.</div>
          )}
        </div>
      </main>
    </div>
  );
}
