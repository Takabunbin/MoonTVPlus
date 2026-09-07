'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

import { useSite } from '@/components/SiteProvider';

function LoginPageClient() {
  const { siteName } = useSite();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const value = searchParams.get('error');
    setError(value ? decodeURIComponent(value) : null);
  }, [searchParams]);

  return (
    <main className='min-h-screen bg-white px-4 flex items-center justify-center text-gray-900'>
      <section className='w-full max-w-md rounded-3xl border border-gray-200 bg-white p-10 shadow-xl'>
        <h1 className='mb-3 text-center text-3xl font-extrabold tracking-tight text-green-600'>
          {siteName}
        </h1>
        <p className='mb-8 text-center text-sm text-gray-600'>请使用 Authentik 账号登录</p>
        {error && <p className='mb-5 text-center text-sm text-red-600'>{error}</p>}
        <button
          type='button'
          onClick={() => { window.location.href = '/api/auth/oidc/login'; }}
          className='w-full rounded-lg bg-green-600 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-green-700'
        >
          使用 Authentik 登录
        </button>
      </section>
    </main>
  );
}

export default function LoginPage() {
  return <Suspense fallback={<div className='min-h-screen bg-white' />}><LoginPageClient /></Suspense>;
}
