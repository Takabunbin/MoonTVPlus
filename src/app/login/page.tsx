import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { parseAuthInfo } from '@/lib/auth';

type LoginPageProps = { searchParams: Promise<{ error?: string }> };

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { error } = await searchParams;
  if (error) {
    return <main className='min-h-screen bg-white' />;
  }

  const auth = parseAuthInfo((await cookies()).get('auth')?.value);
  redirect(auth ? '/' : '/api/auth/oidc/login');
}
