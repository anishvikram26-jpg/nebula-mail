import crypto from 'crypto';
import { cookies } from 'next/headers';
import { getServerEnv } from '@/lib/config/env';

export interface SessionPayload {
  userId: string;
  email: string;
  name?: string | null;
  image?: string | null;
  iat?: number;
  exp?: number;
}

export const SESSION_COOKIE_NAME = 'nebula_session';
export const OAUTH_STATE_COOKIE_NAME = 'oauth_state';
const DEFAULT_EXPIRATION_SECONDS = 60 * 60 * 24 * 30; // 30 days

/**
 * Base64URL encoding helper
 */
function base64UrlEncode(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

/**
 * Base64URL decoding helper
 */
function base64UrlDecode(str: string): string {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Signs a payload using HMAC-SHA256 with SESSION_SECRET
 */
export function createSessionToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  expiresInSeconds: number = DEFAULT_EXPIRATION_SECONDS
): string {
  const env = getServerEnv();
  const now = Math.floor(Date.now() / 1000);
  const fullPayload: SessionPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const payloadString = JSON.stringify(fullPayload);
  const encodedPayload = base64UrlEncode(payloadString);

  const signature = crypto
    .createHmac('sha256', env.SESSION_SECRET)
    .update(encodedPayload)
    .digest('base64url');

  return `${encodedPayload}.${signature}`;
}

/**
 * Verifies and decodes a signed session token. Returns null if invalid or expired.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  try {
    if (!token || typeof token !== 'string') return null;

    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [encodedPayload, signature] = parts;
    const env = getServerEnv();

    const expectedSignature = crypto
      .createHmac('sha256', env.SESSION_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (sigBuffer.length !== expectedBuffer.length) {
      return null;
    }

    if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      return null;
    }

    const payload: SessionPayload = JSON.parse(base64UrlDecode(encodedPayload));
    const now = Math.floor(Date.now() / 1000);

    if (payload.exp && payload.exp < now) {
      return null; // Expired
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Sets the session cookie on Next.js response/cookies store.
 */
export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: DEFAULT_EXPIRATION_SECONDS,
  });
}

/**
 * Retrieves and validates the current session payload from cookies.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  return verifySessionToken(token);
}

/**
 * Removes the session cookie.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Generates and stores a cryptographic OAuth state parameter in a short-lived HTTP-only cookie.
 */
export async function generateAndStoreOAuthState(): Promise<string> {
  const state = crypto.randomBytes(32).toString('hex');
  const cookieStore = await cookies();

  cookieStore.set(OAUTH_STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 10, // 10 minutes
  });

  return state;
}

/**
 * Validates the returned OAuth state parameter against the stored cookie and clears the cookie.
 */
export async function validateAndClearOAuthState(stateToValidate: string): Promise<boolean> {
  const cookieStore = await cookies();
  const storedState = cookieStore.get(OAUTH_STATE_COOKIE_NAME)?.value;

  cookieStore.delete(OAUTH_STATE_COOKIE_NAME);

  if (!storedState || !stateToValidate) return false;

  const storedBuffer = Buffer.from(storedState);
  const toValidateBuffer = Buffer.from(stateToValidate);

  if (storedBuffer.length !== toValidateBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(storedBuffer, toValidateBuffer);
}
