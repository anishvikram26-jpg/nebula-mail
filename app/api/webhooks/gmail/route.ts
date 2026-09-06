/**
 * POST /api/webhooks/gmail
 *
 * Google Cloud Pub/Sub push notification endpoint for real-time Gmail events.
 *
 * Security Architecture:
 * 1. OIDC Token Authentication (Primary Production Mechanism):
 *    - Google Pub/Sub sends an OpenID Connect (OIDC) JWT in the `Authorization: Bearer <token>` header.
 *    - Validated against Google's public certificates using `google.auth.OAuth2.verifyIdToken`.
 *    - Verifies issuer (`https://accounts.google.com`), audience (if configured), and caller service account email.
 * 2. Shared Secret / Verification Token (Defense-in-Depth / Local Development):
 *    - Checked via `?token=` query parameter or `x-goog-pubsub-token` header against `GOOGLE_PUBSUB_VERIFICATION_TOKEN`.
 * 3. Verified User Resolution:
 *    - Never accepts or trusts arbitrary user IDs from the payload.
 *    - Strictly resolves the user from the verified `emailAddress` in the decoded Pub/Sub payload.
 * 4. Idempotency:
 *    - Processing an already-synced historyId or redundant push returns safely without duplicate emails.
 * 5. Safe Acknowledgment:
 *    - Returns 200 HTTP status code to acknowledge delivery and prevent infinite Pub/Sub redelivery loops.
 */

import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { prisma } from '@/lib/db/prisma';
import { getServerEnv } from '@/lib/config/env';
import { syncUserHistory } from '@/lib/gmail/history';

export interface PubSubEnvelope {
  message?: {
    data?: string;
    messageId?: string;
    publishTime?: string;
    attributes?: Record<string, string>;
  };
  subscription?: string;
}

export interface GmailPushData {
  emailAddress?: string;
  historyId?: string | number;
}

/**
 * Validates the authenticity of the Pub/Sub push notification request.
 */
async function authenticatePubSubWebhook(
  request: NextRequest
): Promise<{ authorized: boolean; reason?: string; method?: 'oidc' | 'token' | 'dev' }> {
  const env = getServerEnv();
  const authHeader = request.headers.get('authorization');
  const queryToken = request.nextUrl.searchParams.get('token');
  const customHeaderToken = request.headers.get('x-goog-pubsub-token');

  const configuredSecret = env.GOOGLE_PUBSUB_VERIFICATION_TOKEN;
  const configuredAudience = env.PUBSUB_VERIFICATION_AUDIENCE;
  const configuredServiceAccount = env.PUBSUB_SERVICE_ACCOUNT_EMAIL;

  // 1. Check Shared Secret / Token verification (if token provided or secret configured)
  const candidateToken = queryToken || customHeaderToken;
  if (candidateToken && configuredSecret) {
    if (candidateToken === configuredSecret) {
      return { authorized: true, method: 'token' };
    }
    return { authorized: false, reason: 'Provided verification token does not match' };
  }

  // 2. Check OIDC Bearer Token (Standard Google Cloud Pub/Sub Push Authentication)
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();

    // If candidate token matches secret directly in bearer header, accept as token auth
    if (configuredSecret && bearerToken === configuredSecret) {
      return { authorized: true, method: 'token' };
    }

    try {
      const oauth2Client = new google.auth.OAuth2();
      const ticket = await oauth2Client.verifyIdToken({
        idToken: bearerToken,
        audience: configuredAudience || undefined,
      });

      const payload = ticket.getPayload();
      if (!payload) {
        return { authorized: false, reason: 'Invalid OIDC token payload' };
      }

      // Verify token issuer
      const validIssuers = ['https://accounts.google.com', 'accounts.google.com'];
      if (!payload.iss || !validIssuers.includes(payload.iss)) {
        return { authorized: false, reason: `Untrusted token issuer: ${payload.iss}` };
      }

      // If a specific service account is configured, ensure the token email matches
      if (configuredServiceAccount && payload.email !== configuredServiceAccount) {
        return {
          authorized: false,
          reason: `Service account mismatch: expected ${configuredServiceAccount}, received ${payload.email}`,
        };
      }

      return { authorized: true, method: 'oidc' };
    } catch (oidcErr) {
      const msg = oidcErr instanceof Error ? oidcErr.message : 'OIDC verification failed';
      // If a secret is required and OIDC verification fails, reject
      if (configuredSecret || configuredAudience || configuredServiceAccount) {
        return { authorized: false, reason: `OIDC validation error: ${msg}` };
      }
    }
  }

  // 3. If any security mechanism is configured, reject requests that provide neither
  const securityConfigured = Boolean(
    configuredSecret || configuredAudience || configuredServiceAccount
  );

  if (securityConfigured) {
    return { authorized: false, reason: 'Missing authentication credentials (OIDC token or verification token)' };
  }

  // 4. In development without credentials configured, allow request with informational notice
  if (process.env.NODE_ENV !== 'production') {
    return { authorized: true, method: 'dev' };
  }

  // Reject unauthenticated requests in production
  return { authorized: false, reason: 'Authentication required' };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Authenticate Request ────────────────────────────────────────────────
  const auth = await authenticatePubSubWebhook(request);
  if (!auth.authorized) {
    console.warn('[Gmail Webhook] Unauthorized request:', auth.reason);
    return NextResponse.json(
      { error: 'Unauthorized', message: auth.reason },
      { status: 401 }
    );
  }

  // ── 2. Parse Pub/Sub Envelope ─────────────────────────────────────────────
  let body: PubSubEnvelope;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request: Invalid JSON envelope' },
      { status: 400 }
    );
  }

  if (!body || !body.message || typeof body.message.data !== 'string') {
    return NextResponse.json(
      { error: 'Bad Request: Missing or invalid message.data field' },
      { status: 400 }
    );
  }

  // ── 3. Decode base64 Pub/Sub Payload ───────────────────────────────────────
  let decodedPayload: string;
  try {
    decodedPayload = Buffer.from(body.message.data, 'base64').toString('utf8');
  } catch {
    return NextResponse.json(
      { error: 'Bad Request: Failed to decode base64 message.data' },
      { status: 400 }
    );
  }

  let pushData: GmailPushData;
  try {
    pushData = JSON.parse(decodedPayload);
  } catch {
    return NextResponse.json(
      { error: 'Bad Request: Payload is not valid JSON' },
      { status: 400 }
    );
  }

  const { emailAddress, historyId } = pushData;

  if (!emailAddress || typeof emailAddress !== 'string' || !emailAddress.includes('@')) {
    return NextResponse.json(
      { error: 'Bad Request: Missing or invalid emailAddress in notification' },
      { status: 400 }
    );
  }

  if (!historyId) {
    return NextResponse.json(
      { error: 'Bad Request: Missing historyId in notification' },
      { status: 400 }
    );
  }

  // ── 4. Resolve Local User by Verified Email Address ────────────────────────
  // SECURITY: Strictly match against local database user by verified email; never trust client-supplied userId.
  const normalizedEmail = emailAddress.trim().toLowerCase();

  const user = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true },
  });

  if (!user) {
    // Return 200 to acknowledge delivery and prevent Pub/Sub infinite retry loop
    console.info(`[Gmail Webhook] Received notification for unregistered email: ${normalizedEmail}. Acknowledging.`);
    return NextResponse.json({
      acknowledged: true,
      message: 'Email address not associated with any active user.',
    });
  }

  // ── 5. Incremental History Synchronization ────────────────────────────────
  try {
    const historyResult = await syncUserHistory(user.id, String(historyId));

    return NextResponse.json({
      acknowledged: true,
      user: user.email,
      historyId: String(historyId),
      syncResult: historyResult,
    });
  } catch (syncError) {
    const message = syncError instanceof Error ? syncError.message : 'Unknown sync error';
    console.error(`[Gmail Webhook Error] Failed to sync history for user ${user.id}:`, message);

    // Return 500 so Pub/Sub retries transient database or network failures
    return NextResponse.json(
      { error: 'Internal error during incremental sync', message },
      { status: 500 }
    );
  }
}
