'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';

function AdminLoginClient() {
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, adminOnly: true }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(data.error || '登录失败');
        return;
      }
      window.location.replace(searchParams.get('redirect') || '/admin');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className='min-h-screen bg-white px-4 flex items-center justify-center text-gray-900'>
      <form onSubmit={submit} className='w-full max-w-md rounded-3xl border border-gray-200 bg-white p-10 shadow-xl space-y-5'>
        <h1 className='text-center text-2xl font-extrabold text-gray-900'>管理员登录</h1>
        <input required autoComplete='username' value={username} onChange={(event) => setUsername(event.target.value)} placeholder='用户名' className='w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600' />
        <input required type='password' autoComplete='current-password' value={password} onChange={(event) => setPassword(event.target.value)} placeholder='密码' className='w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-green-600' />
        {error && <p className='text-sm text-red-600'>{error}</p>}
        <button disabled={loading} className='w-full rounded-lg bg-green-600 py-3 font-semibold text-white disabled:opacity-60'>
          {loading ? '登录中...' : '登录'}
        </button>
      </form>
    </main>
  );
}

export default function AdminLoginPage() {
  return <Suspense fallback={<div className='min-h-screen bg-white' />}><AdminLoginClient /></Suspense>;
}
