import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/config/env';

export async function GET(request: NextRequest) {
  await clearSessionCookie();
  const env = getServerEnv();

  const redirectUrl = request.nextUrl.searchParams.get('redirect') || '/login';
  return NextResponse.redirect(new URL(redirectUrl, env.NEXT_PUBLIC_APP_URL));
}

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ success: true });
}
