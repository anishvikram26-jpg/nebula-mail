import { NextResponse } from 'next/server';
import { getGoogleAuthorizationUrl } from '@/lib/auth/google';
import { generateAndStoreOAuthState } from '@/lib/auth/session';
import { getServerEnv } from '@/lib/config/env';

export async function GET() {
  try {
    const env = getServerEnv();

    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.redirect(
        new URL('/login?error=oauth_config_missing', env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Generate cryptographic state to prevent CSRF attacks
    const state = await generateAndStoreOAuthState();

    // Generate Google OAuth authorization URL
    const authUrl = getGoogleAuthorizationUrl(state);

    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error('[OAuth Init Error]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.redirect(new URL('/login?error=oauth_init_failed', 'http://localhost:3000'));
  }
}
