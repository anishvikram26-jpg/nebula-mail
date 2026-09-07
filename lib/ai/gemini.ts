/**
 * Server-Side Google Gemini Client
 *
 * Configures and initializes the official Google GenAI SDK (@google/genai).
 *
 * Security:
 * - Server-only: GEMINI_API_KEY is never exposed to the client or browser.
 * - Lazy initialization ensures missing keys fail cleanly with descriptive errors
 *   rather than crashing during module import.
 */

import { GoogleGenAI } from '@google/genai';

let _gemini: GoogleGenAI | null = null;

/**
 * Returns the singleton GoogleGenAI instance or throws a clear configuration error
 * if GEMINI_API_KEY is missing.
 */
export function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey || apiKey.trim() === '') {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  // Stop using GOOGLE_API_KEY for this app to eliminate ambiguity and prevent SDK warnings
  if ('GOOGLE_API_KEY' in process.env) {
    delete process.env.GOOGLE_API_KEY;
  }

  if (!_gemini) {
    _gemini = new GoogleGenAI({ apiKey: apiKey.trim() });
  }

  return _gemini;
}

/**
 * Resets the cached Gemini client instance (useful for tests).
 */
export function resetGeminiClient(): void {
  _gemini = null;
}

/**
 * Proxy export for `gemini` client so modules can import `{ gemini }` directly.
 * Evaluates getGeminiClient() lazily on first access.
 */
export const gemini: GoogleGenAI = new Proxy({} as GoogleGenAI, {
  get(_target, prop, receiver) {
    const client = getGeminiClient();
    const value = Reflect.get(client, prop, receiver);
    return typeof value === 'function' ? value.bind(client) : value;
  },
});
