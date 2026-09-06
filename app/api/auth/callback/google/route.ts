import { NextRequest, NextResponse } from 'next/server';
import {
  exchangeCodeForTokens,
  getGoogleUserProfile,
} from '@/lib/auth/google';
import {
  validateAndClearOAuthState,
  createSessionToken,
  setSessionCookie,
} from '@/lib/auth/session';
import { prisma } from '@/lib/db/prisma';
import { getServerEnv } from '@/lib/config/env';

export async function GET(request: NextRequest) {
  const env = getServerEnv();
  const searchParams = request.nextUrl.searchParams;

  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const oauthError = searchParams.get('error');

  // Handle user cancellation or OAuth error from Google
  if (oauthError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(oauthError)}`, env.NEXT_PUBLIC_APP_URL)
    );
  }

  // Validate authorization code and state presence
  if (!code || !state) {
    return NextResponse.redirect(
      new URL('/login?error=missing_code_or_state', env.NEXT_PUBLIC_APP_URL)
    );
  }

  // Verify OAuth state to defend against CSRF attacks
  const isValidState = await validateAndClearOAuthState(state);
  if (!isValidState) {
    return NextResponse.redirect(
      new URL('/login?error=invalid_oauth_state', env.NEXT_PUBLIC_APP_URL)
    );
  }

  try {
    // Exchange authorization code for Google tokens
    const tokens = await exchangeCodeForTokens(code);

    if (!tokens.access_token) {
      return NextResponse.redirect(
        new URL('/login?error=token_exchange_failed', env.NEXT_PUBLIC_APP_URL)
      );
    }

    // Retrieve user profile information from Google
    const profile = await getGoogleUserProfile(tokens.access_token);

    if (!profile.email || !profile.id) {
      return NextResponse.redirect(
        new URL('/login?error=profile_incomplete', env.NEXT_PUBLIC_APP_URL)
      );
    }

    const expiresAt = tokens.expiry_date
      ? Math.floor(tokens.expiry_date / 1000)
      : null;

    // Database Integration: Upsert User and Account records
    const user = await prisma.user.upsert({
      where: { email: profile.email },
      update: {
        name: profile.name || undefined,
        image: profile.picture || undefined,
      },
      create: {
        email: profile.email,
        name: profile.name || null,
        image: profile.picture || null,
      },
    });

    // Check for existing account to preserve refreshToken if Google didn't reissue it
    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.id,
        },
      },
    });

    const finalRefreshToken = tokens.refresh_token || existingAccount?.refreshToken || null;

    await prisma.account.upsert({
      where: {
        provider_providerAccountId: {
          provider: 'google',
          providerAccountId: profile.id,
        },
      },
      update: {
        accessToken: tokens.access_token,
        refreshToken: finalRefreshToken,
        expiresAt,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope || null,
        idToken: tokens.id_token || null,
      },
      create: {
        userId: user.id,
        provider: 'google',
        providerAccountId: profile.id,
        accessToken: tokens.access_token,
        refreshToken: finalRefreshToken,
        expiresAt,
        tokenType: tokens.token_type || 'Bearer',
        scope: tokens.scope || null,
        idToken: tokens.id_token || null,
      },
    });

    // Establish cryptographically signed, HTTP-only session cookie
    const sessionToken = createSessionToken({
      userId: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    });

    await setSessionCookie(sessionToken);

    // Redirect to root mail application
    return NextResponse.redirect(new URL('/', env.NEXT_PUBLIC_APP_URL));
  } catch (error) {
    console.error(
      '[OAuth Callback Error]',
      error instanceof Error ? error.message : 'Unknown error during OAuth exchange'
    );
    return NextResponse.redirect(
      new URL('/login?error=oauth_exchange_error', env.NEXT_PUBLIC_APP_URL)
    );
  }
}
