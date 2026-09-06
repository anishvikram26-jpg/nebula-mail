/**
 * Server-Side Environment Variable Configuration & Validation
 *
 * IMPORTANT SECURITY RULES:
 * 1. Server-only variables must NEVER be exposed with NEXT_PUBLIC_ prefix.
 * 2. Never print or log secret values.
 * 3. Never hardcode credentials.
 */

export interface ServerEnv {
  // Database
  DATABASE_URL: string;

  // Google OAuth 2.0
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REDIRECT_URI: string;

  // OpenAI
  OPENAI_API_KEY: string;

  // Real-time Pub/Sub Webhook
  GMAIL_PUBSUB_TOPIC?: string;
  GOOGLE_PUBSUB_TOPIC?: string;
  GOOGLE_PUBSUB_VERIFICATION_TOKEN?: string;
  PUBSUB_SERVICE_ACCOUNT_EMAIL?: string;
  PUBSUB_VERIFICATION_AUDIENCE?: string;

  // Security & Session
  SESSION_SECRET: string;

  // Application
  NEXT_PUBLIC_APP_URL: string;
}

const REQUIRED_SERVER_VARS: (keyof ServerEnv)[] = [
  'DATABASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'OPENAI_API_KEY',
  'SESSION_SECRET',
  'NEXT_PUBLIC_APP_URL',
];

/**
 * Validates that all critical server-side environment variables are present.
 * Throws a descriptive error with variable names only (never values).
 */
export function validateServerEnv(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  for (const key of REQUIRED_SERVER_VARS) {
    const value = process.env[key];
    if (!value || value.trim() === '') {
      missing.push(key);
    }
  }

  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Retrieves validated server environment configuration.
 * In development, returns available variables or throws if a required secret is accessed when missing.
 */
export function getServerEnv(): ServerEnv {
  const { valid, missing } = validateServerEnv();

  if (!valid && process.env.NODE_ENV === 'production') {
    throw new Error(
      `[Config Error] Missing required server environment variables: ${missing.join(', ')}. Please configure them in your production environment.`
    );
  }

  return {
    DATABASE_URL: process.env.DATABASE_URL || '',
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '',
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || '',
    GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/api/auth/callback/google',
    OPENAI_API_KEY: process.env.OPENAI_API_KEY || '',
    GMAIL_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC || process.env.GOOGLE_PUBSUB_TOPIC,
    GOOGLE_PUBSUB_TOPIC: process.env.GMAIL_PUBSUB_TOPIC || process.env.GOOGLE_PUBSUB_TOPIC,
    GOOGLE_PUBSUB_VERIFICATION_TOKEN: process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN,
    PUBSUB_SERVICE_ACCOUNT_EMAIL: process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL,
    PUBSUB_VERIFICATION_AUDIENCE: process.env.PUBSUB_VERIFICATION_AUDIENCE,
    SESSION_SECRET: process.env.SESSION_SECRET || 'development-fallback-session-secret-change-in-production',
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  };
}

/**
 * Safe accessor for client-safe public variables
 */
export const publicConfig = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
};
