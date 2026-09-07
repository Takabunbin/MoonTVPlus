'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function DevicePendingContent() {
  const searchParams = useSearchParams();
  const limitReached = searchParams.get('limitReached') === '1';

  return (
    <main className='min-h-screen flex items-center justify-center px-4'>
      <div className='w-full max-w-md rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-zinc-900 p-8 shadow-lg'>
        <h1 className='text-2xl font-bold text-center mb-4'>
          新设备等待批准
        </h1>

        <p className='text-sm text-gray-600 dark:text-gray-400 text-center leading-6'>
          当前设备已经完成账号验证，但尚未被管理员批准。
        </p>

        {limitReached && (
          <p className='mt-4 text-sm text-red-600 dark:text-red-400 text-center'>
            该账号已达到 3 台已批准设备上限，需要管理员先撤销旧设备。
          </p>
        )}

        <p className='mt-6 text-xs text-gray-500 dark:text-gray-500 text-center'>
          管理员批准后，请重新使用 Authentik 登录。
        </p>

        <a
          href='/login'
          className='mt-6 block w-full rounded-lg bg-green-600 py-3 text-center text-white font-medium'
        >
          返回登录
        </a>
      </div>
    </main>
  );
}

export default function DevicePendingPage() {
  return (
    <Suspense fallback={null}>
      <DevicePendingContent />
    </Suspense>
  );
}
