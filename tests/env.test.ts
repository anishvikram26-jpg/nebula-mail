import { describe, it, expect, beforeEach } from 'vitest';
import { validateServerEnv, getServerEnv } from '@/lib/config/env';

describe('Environment Variable Validation', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  it('should identify missing required variables', () => {
    delete process.env.GOOGLE_CLIENT_ID;
    delete process.env.GEMINI_API_KEY;

    const result = validateServerEnv();
    expect(result.valid).toBe(false);
    expect(result.missing).toContain('GOOGLE_CLIENT_ID');
    expect(result.missing).toContain('GEMINI_API_KEY');
  });

  it('should validate when all required variables are present', () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.GOOGLE_CLIENT_ID = 'test-client-id';
    process.env.GOOGLE_CLIENT_SECRET = 'test-client-secret';
    process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/api/auth/callback/google';
    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.SESSION_SECRET = 'test-session-secret-key-32-characters';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    const result = validateServerEnv();
    expect(result.valid).toBe(true);
    expect(result.missing).toHaveLength(0);

    const env = getServerEnv();
    expect(env.GOOGLE_CLIENT_ID).toBe('test-client-id');
    expect(env.GEMINI_API_KEY).toBe('test-gemini-key');
    expect(env.GEMINI_MODEL).toBe('gemini-3.6-flash');
  });

  it('should support GEMINI_MODEL override and remove GOOGLE_API_KEY ambiguity', async () => {
    const { getGeminiClient, resetGeminiClient } = await import('@/lib/ai/gemini');
    resetGeminiClient();

    process.env.GEMINI_API_KEY = 'test-gemini-key';
    process.env.GEMINI_MODEL = 'custom-gemini-model';
    process.env.GOOGLE_API_KEY = 'ambiguous-key';

    const env = getServerEnv();
    expect(env.GEMINI_MODEL).toBe('custom-gemini-model');

    // getGeminiClient() should eliminate GOOGLE_API_KEY from environment to avoid ambiguity
    getGeminiClient();
    expect(process.env.GOOGLE_API_KEY).toBeUndefined();

    resetGeminiClient();
  });
});
