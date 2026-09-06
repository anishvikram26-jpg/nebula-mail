import { describe, it, expect, beforeEach } from 'vitest';
import {
  createSessionToken,
  verifySessionToken,
} from '@/lib/auth/session';
import { getGoogleAuthorizationUrl, GMAIL_SCOPES } from '@/lib/auth/google';

describe('OAuth 2.0 Configuration & Utilities', () => {
  beforeEach(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/callback/google';
    process.env.SESSION_SECRET = 'test-session-secret-key-at-least-32-chars-long';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
  });

  it('should generate Google OAuth URL with required scopes and offline access', () => {
    const state = 'test-crypto-state-value';
    const authUrl = getGoogleAuthorizationUrl(state);

    expect(authUrl).toContain('accounts.google.com');
    expect(authUrl).toContain('access_type=offline');
    expect(authUrl).toContain('prompt=consent');
    expect(authUrl).toContain(`state=${state}`);

    // Verify Gmail scopes are requested
    for (const scope of GMAIL_SCOPES) {
      expect(authUrl).toContain(encodeURIComponent(scope));
    }
  });

  it('should create and verify cryptographically signed session tokens', () => {
    const payload = {
      userId: 'user_123',
      email: 'alex@example.com',
      name: 'Alex Mercer',
      image: 'https://example.com/avatar.jpg',
    };

    const token = createSessionToken(payload, 3600);
    expect(token).toBeTypeOf('string');
    expect(token.split('.')).toHaveLength(2);

    const verified = verifySessionToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.userId).toBe('user_123');
    expect(verified?.email).toBe('alex@example.com');
    expect(verified?.name).toBe('Alex Mercer');
    expect(verified?.image).toBe('https://example.com/avatar.jpg');
    expect(verified?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it('should reject tampered session tokens', () => {
    const payload = {
      userId: 'user_123',
      email: 'alex@example.com',
    };

    const token = createSessionToken(payload, 3600);
    const [data, sig] = token.split('.');

    // Tamper with data
    const tamperedToken = `${data}extra.${sig}`;
    expect(verifySessionToken(tamperedToken)).toBeNull();

    // Tamper with signature
    const badSigToken = `${data}.${sig}bad`;
    expect(verifySessionToken(badSigToken)).toBeNull();
  });

  it('should reject expired session tokens', () => {
    const payload = {
      userId: 'user_expired',
      email: 'expired@example.com',
    };

    // Token expired 10 seconds ago
    const token = createSessionToken(payload, -10);
    expect(verifySessionToken(token)).toBeNull();
  });

  it('should reject invalid or malformed tokens', () => {
    expect(verifySessionToken('')).toBeNull();
    expect(verifySessionToken('invalid')).toBeNull();
    expect(verifySessionToken('a.b.c')).toBeNull();
  });
});
