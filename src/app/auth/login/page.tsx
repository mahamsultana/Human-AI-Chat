'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'react-hot-toast';
import { useLoginMutation } from '@/services/auth/login';
import { FaEye, FaEyeSlash } from 'react-icons/fa';  // Import Eye icons

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);  // For toggling password visibility
  const router = useRouter();

  const { mutateAsync: login, isPending } = useLoginMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Ensure that both fields are not empty
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    try {
      const { token, user } = await login({ email, password });

      // Convert to a plain object before storing in localStorage
      const userPlainObject = { id: user.id, email: user.email, name: user.name, role: user.role };

      localStorage.setItem('token', token);
      localStorage.setItem('user', JSON.stringify(userPlainObject));

      // Show success toast and redirect to chat page
      

      if(user.role==='user')
      {
        toast.success('Login successful! Redirecting to chat...', {
        style: {
          background: '#1f2937',
          color: '#ffffff',
          borderRadius: '8px',
        },
      });
        setTimeout(() => {
        router.push('/chat');
      }, 2000);
      }
      
      else{
        toast.success('Login successful! Redirecting to admin...', {
        style: {
          background: '#1f2937',
          color: '#ffffff',
          borderRadius: '8px',
        },
      });
        setTimeout(() => {
        router.push('/admin');
      }, 2000);
      }

    } catch (error: any) {
      // Check if the error has a response (backend error)
      const errorMessage = error?.response?.data?.error || 'Failed to log in'; // Fallback to 'Failed to log in' if no error message
      toast.error(errorMessage, {
        style: {
          background: '#1f2937',
          color: '#ffffff',
          borderRadius: '8px',
        },
      });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 px-4 py-12">
      <div className="w-full max-w-md bg-white/95 backdrop-blur-lg rounded-2xl shadow-2xl p-8 transform transition-all duration-300 hover:shadow-3xl">
        <h2 className="text-3xl font-bold text-center text-gray-900 mb-8 tracking-tight">
          Log in to Your Account
        </h2>
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
              Email Address
            </label>
            <input
              id="email"
              type="email"
              className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              aria-required="true"
              aria-describedby="email-error"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition duration-200"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                aria-required="true"
                aria-describedby="password-error"
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-500"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            className={`w-full py-3 px-4 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition duration-200 transform hover:scale-105 ${
              isPending ? 'opacity-70 cursor-not-allowed' : ''
            }`}
            disabled={isPending}
            aria-busy={isPending}
          >
            {isPending ? 'Logging in...' : 'Log In'}
          </button>
        </form>
        <div className="text-center mt-6">
          <p className="text-sm text-gray-600">
            Don't have an account?{' '}
            <a
              href="/auth/signup"
              className="text-indigo-600 font-medium hover:text-indigo-800 transition duration-200"
            >
              Sign up
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
