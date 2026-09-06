/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Phase 9 — Real-Time Gmail Sync Tests
 *
 * Tests cover:
 * 1. Pub/Sub envelope parsing & base64 decoding
 * 2. Malformed envelope rejection (400)
 * 3. Webhook security: token verification & OIDC bearer validation
 * 4. Secure user resolution by verified email (never trusts client userId)
 * 5. Unmapped email handling (safe 200 acknowledgment)
 * 6. Gmail users.watch() creation & state persistence
 * 7. Watch expiration / renewal logic (skips if valid > 24h, force renewal)
 * 8. Watch API endpoint authentication & safe responses
 * 9. Incremental history sync: messagesAdded (upsert Thread & Email)
 * 10. Incremental history sync: messagesDeleted (removes Email, updates Thread)
 * 11. Incremental history sync: labelsAdded (UNREAD, STARRED, custom)
 * 12. Incremental history sync: labelsRemoved (UNREAD, STARRED, custom)
 * 13. Expired history fallback: 404 triggers full mailbox sync recovery
 * 14. Idempotent processing
 * 15. Frontend store triggerRefresh & revalidation timestamp
 *
 * All Gmail API, Prisma, and Auth calls are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as authModule from '@/lib/auth/middleware';
import * as gmailClientModule from '@/lib/gmail/client';
import * as syncModule from '@/lib/gmail/sync';
import { setupGmailWatch, stopGmailWatch } from '@/lib/gmail/watch';
import { syncUserHistory } from '@/lib/gmail/history';
import { encodeBase64Url } from '@/lib/gmail/mime';
import { useMailStore } from '@/store/mail-store';
import { gmail_v1 } from 'googleapis';

// ── Mock Prisma ───────────────────────────────────────────────────────────────
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    syncState: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    thread: {
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    email: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// ── Mock Google Auth OAuth2 Client for OIDC Verification ──────────────────────
const mockVerifyIdToken = vi.fn();
vi.mock('googleapis', async () => {
  const actual = await vi.importActual<typeof import('googleapis')>('googleapis');
  class MockOAuth2 {
    verifyIdToken = mockVerifyIdToken;
  }
  return {
    ...actual,
    google: {
      ...actual.google,
      auth: {
        ...actual.google.auth,
        OAuth2: MockOAuth2,
      },
    },
  };
});

import { prisma } from '@/lib/db/prisma';
import { POST as watchHandler } from '@/app/api/mail/watch/route';
import { POST as webhookHandler } from '@/app/api/webhooks/gmail/route';

describe('Phase 9 — Real-Time Gmail Synchronization', () => {
  const mockUserId = 'user_realtime_123';
  const mockEmail = 'user@example.com';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GMAIL_PUBSUB_TOPIC = 'projects/test-project/topics/gmail-push';
    process.env.GOOGLE_PUBSUB_VERIFICATION_TOKEN = 'test-secret-token';
    process.env.PUBSUB_SERVICE_ACCOUNT_EMAIL = 'pubsub-service-account@test-project.iam.gserviceaccount.com';
    process.env.PUBSUB_VERIFICATION_AUDIENCE = 'https://app.example.com/api/webhooks/gmail';
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. Pub/Sub Webhook Security & Envelope Parsing
  // ─────────────────────────────────────────────────────────────────────────────
  describe('1. Pub/Sub Webhook Security & Parsing', () => {
    function buildPubSubRequest(
      payload: Record<string, unknown> | string,
      headers: Record<string, string> = {},
      queryParams = ''
    ) {
      const dataString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const base64Data = Buffer.from(dataString).toString('base64');
      const body = JSON.stringify({
        message: {
          data: base64Data,
          messageId: 'pubsub_msg_1001',
          publishTime: '2026-09-06T12:00:00Z',
        },
        subscription: 'projects/test-project/subscriptions/gmail-sub',
      });

      return new NextRequest(`http://localhost:3000/api/webhooks/gmail${queryParams}`, {
        method: 'POST',
        body,
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
      });
    }

    it('should accept request authenticated with valid verification token query param', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUserId,
        email: mockEmail,
      } as any);

      // Mock syncUserHistory returning success
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '1000',
      } as any);

      const req = buildPubSubRequest(
        { emailAddress: mockEmail, historyId: '1050' },
        {},
        '?token=test-secret-token'
      );

      const res = await webhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.acknowledged).toBe(true);
    });

    it('should accept request authenticated with valid OIDC Bearer token', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          email: 'pubsub-service-account@test-project.iam.gserviceaccount.com',
          aud: 'https://app.example.com/api/webhooks/gmail',
        }),
      });

      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUserId,
        email: mockEmail,
      } as any);

      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '1000',
      } as any);

      const req = buildPubSubRequest(
        { emailAddress: mockEmail, historyId: '1050' },
        { Authorization: 'Bearer valid-google-oidc-token' }
      );

      const res = await webhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.acknowledged).toBe(true);
    });

    it('should reject request when verification token does not match', async () => {
      const req = buildPubSubRequest(
        { emailAddress: mockEmail, historyId: '1050' },
        {},
        '?token=wrong-secret-token'
      );

      const res = await webhookHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('should reject request when OIDC service account email mismatches', async () => {
      mockVerifyIdToken.mockResolvedValue({
        getPayload: () => ({
          iss: 'https://accounts.google.com',
          email: 'attacker-service-account@evil.com',
          aud: 'https://app.example.com/api/webhooks/gmail',
        }),
      });

      const req = buildPubSubRequest(
        { emailAddress: mockEmail, historyId: '1050' },
        { Authorization: 'Bearer forged-oidc-token' }
      );

      const res = await webhookHandler(req);
      expect(res.status).toBe(401);
    });

    it('should reject malformed JSON envelope with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/gmail?token=test-secret-token', {
        method: 'POST',
        body: 'invalid-non-json{{',
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await webhookHandler(req);
      expect(res.status).toBe(400);
    });

    it('should reject missing message.data with 400', async () => {
      const req = new NextRequest('http://localhost:3000/api/webhooks/gmail?token=test-secret-token', {
        method: 'POST',
        body: JSON.stringify({ message: {} }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await webhookHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('message.data');
    });

    it('should reject notification with missing emailAddress with 400', async () => {
      const req = buildPubSubRequest(
        { historyId: '1050' },
        {},
        '?token=test-secret-token'
      );

      const res = await webhookHandler(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('emailAddress');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. User Resolution by Verified Email Address
  // ─────────────────────────────────────────────────────────────────────────────
  describe('2. User Resolution & Security', () => {
    it('should resolve local user by verified emailAddress and trigger history sync', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue({
        id: mockUserId,
        email: mockEmail,
      } as any);

      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '2000',
      } as any);

      const req = new NextRequest('http://localhost:3000/api/webhooks/gmail?token=test-secret-token', {
        method: 'POST',
        body: JSON.stringify({
          message: {
            data: Buffer.from(JSON.stringify({ emailAddress: 'USER@example.COM', historyId: '2050' })).toString('base64'),
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await webhookHandler(req);
      expect(res.status).toBe(200);

      // Verify Prisma was queried with normalized lowercase email
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: 'user@example.com' },
        select: { id: true, email: true },
      });
    });

    it('should safely acknowledge with 200 when email is not registered in system', async () => {
      vi.mocked(prisma.user.findUnique).mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/webhooks/gmail?token=test-secret-token', {
        method: 'POST',
        body: JSON.stringify({
          message: {
            data: Buffer.from(JSON.stringify({ emailAddress: 'unknown@example.com', historyId: '9999' })).toString('base64'),
          },
        }),
        headers: { 'Content-Type': 'application/json' },
      });

      const res = await webhookHandler(req);
      // Must return 200 to prevent Pub/Sub infinite retry loop
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.acknowledged).toBe(true);
      expect(json.message).toContain('not associated');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 3. Gmail Watch Service (lib/gmail/watch.ts) & API (/api/mail/watch)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('3. Gmail users.watch() Service & API', () => {
    it('should call users.watch, persist expiration, and return historyId', async () => {
      const mockWatchRes = {
        data: {
          historyId: '88888',
          expiration: '1799999999000', // timestamp in ms
        },
      };

      const mockGmail = {
        users: {
          watch: vi.fn().mockResolvedValue(mockWatchRes),
        },
      };

      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(
        mockGmail as unknown as gmail_v1.Gmail
      );

      vi.mocked(prisma.syncState.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.syncState.upsert).mockResolvedValue({} as any);

      const result = await setupGmailWatch(mockUserId);

      expect(result.success).toBe(true);
      expect(result.historyId).toBe('88888');
      expect(result.expiration).toBe(new Date(1799999999000).toISOString());
      expect(result.renewed).toBe(true);

      // Verify watch payload
      expect(mockGmail.users.watch).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          topicName: 'projects/test-project/topics/gmail-push',
          labelIds: ['INBOX'],
        },
      });

      // Verify SyncState persisted expiration
      expect(prisma.syncState.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId },
          update: expect.objectContaining({
            historyId: '88888',
            watchExpiration: new Date(1799999999000),
          }),
        })
      );
    });

    it('should skip renewal if current watch expiration has > 24 hours remaining', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000); // 5 days in future

      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '77777',
        watchExpiration: futureDate,
      } as any);

      const getGmailSpy = vi.spyOn(gmailClientModule, 'getGmailClient');

      const result = await setupGmailWatch(mockUserId);

      expect(result.success).toBe(true);
      expect(result.renewed).toBe(false);
      expect(result.historyId).toBe('77777');
      // Did not call Gmail API
      expect(getGmailSpy).not.toHaveBeenCalled();
    });

    it('should force renewal when options.force is true even if not expired', async () => {
      const futureDate = new Date(Date.now() + 5 * 24 * 60 * 1000);

      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '77777',
        watchExpiration: futureDate,
      } as any);

      const mockGmail = {
        users: {
          watch: vi.fn().mockResolvedValue({
            data: { historyId: '77778', expiration: String(Date.now() + 7 * 24 * 3600 * 1000) },
          }),
        },
      };
      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(mockGmail as any);
      vi.mocked(prisma.syncState.upsert).mockResolvedValue({} as any);

      const result = await setupGmailWatch(mockUserId, { force: true });
      expect(result.success).toBe(true);
      expect(result.renewed).toBe(true);
      expect(mockGmail.users.watch).toHaveBeenCalled();
    });

    it('should stop active watch and clear expiration in SyncState', async () => {
      const mockGmail = {
        users: {
          stop: vi.fn().mockResolvedValue({}),
        },
      };
      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(mockGmail as any);
      vi.mocked(prisma.syncState.updateMany).mockResolvedValue({ count: 1 });

      const result = await stopGmailWatch(mockUserId);
      expect(result.success).toBe(true);
      expect(mockGmail.users.stop).toHaveBeenCalledWith({ userId: 'me' });
      expect(prisma.syncState.updateMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        data: { watchExpiration: null },
      });
    });

    it('POST /api/mail/watch should reject unauthenticated request with 401', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/mail/watch', { method: 'POST' });
      const res = await watchHandler(req);

      expect(res.status).toBe(401);
    });

    it('POST /api/mail/watch should return safe watch status for authenticated user', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue({
        id: mockUserId,
        email: mockEmail,
        name: 'Test User',
        image: null,
      });

      const mockGmail = {
        users: {
          watch: vi.fn().mockResolvedValue({
            data: { historyId: '90001', expiration: '1800000000000' },
          }),
        },
      };
      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(mockGmail as any);
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue(null);
      vi.mocked(prisma.syncState.upsert).mockResolvedValue({} as any);

      const req = new NextRequest('http://localhost:3000/api/mail/watch', { method: 'POST' });
      const res = await watchHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.historyId).toBe('90001');
      // Never returns tokens
      expect(json.accessToken).toBeUndefined();
      expect(json.refreshToken).toBeUndefined();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 4. Gmail History API Incremental Synchronization (lib/gmail/history.ts)
  // ─────────────────────────────────────────────────────────────────────────────
  describe('4. Gmail History API Incremental Synchronization', () => {
    it('should process messagesAdded: fetch message, parse MIME, upsert Thread and Email', async () => {
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '5000',
      } as any);

      const mockRawMessage: gmail_v1.Schema$Message = {
        id: 'msg_history_new_1',
        threadId: 'thread_history_1',
        historyId: '5005',
        internalDate: '1700000000000',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'Realtime update message',
        payload: {
          headers: [
            { name: 'From', value: 'Sender <sender@example.com>' },
            { name: 'Subject', value: 'Realtime Update' },
          ],
          body: { data: encodeBase64Url('Hello from real-time sync!') },
        },
      };

      const mockGmail = {
        users: {
          history: {
            list: vi.fn().mockResolvedValue({
              data: {
                historyId: '5010',
                history: [
                  {
                    id: '5005',
                    messagesAdded: [{ message: { id: 'msg_history_new_1' } }],
                  },
                ],
              },
            }),
          },
          messages: {
            get: vi.fn().mockResolvedValue({ data: mockRawMessage }),
          },
        },
      };

      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(mockGmail as any);

      vi.mocked(prisma.thread.upsert).mockResolvedValue({ id: 'db_thread_h1' } as any);
      vi.mocked(prisma.email.upsert).mockResolvedValue({ id: 'db_email_h1' } as any);
      vi.mocked(prisma.email.count).mockResolvedValue(1);
      vi.mocked(prisma.thread.update).mockResolvedValue({} as any);
      vi.mocked(prisma.syncState.update).mockResolvedValue({} as any);

      const result = await syncUserHistory(mockUserId, '5010');

      expect(result.success).toBe(true);
      expect(result.messagesAdded).toBe(1);
      expect(result.newHistoryId).toBe('5010');

      // Verify email was upserted with compound key
      expect(prisma.email.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId_providerMessageId: {
              userId: mockUserId,
              providerMessageId: 'msg_history_new_1',
            },
          },
        })
      );

      // Verify SyncState historyId was updated
      expect(prisma.syncState.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId: mockUserId },
          data: expect.objectContaining({ historyId: '5010' }),
        })
      );
    });

    it('should process messagesDeleted: remove local email and update thread stats', async () => {
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '5010',
      } as any);

      const mockGmail = {
        users: {
          history: {
            list: vi.fn().mockResolvedValue({
              data: {
                historyId: '5020',
                history: [
                  {
                    id: '5015',
                    messagesDeleted: [{ message: { id: 'msg_to_delete_1' } }],
                  },
                ],
              },
            }),
          },
        },
      };

      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(mockGmail as any);

      vi.mocked(prisma.email.findUnique).mockResolvedValue({
        id: 'db_email_del_1',
        threadId: 'db_thread_del_1',
      } as any);
      vi.mocked(prisma.email.delete).mockResolvedValue({} as any);
      vi.mocked(prisma.email.count).mockResolvedValue(0);
      vi.mocked(prisma.thread.delete).mockResolvedValue({} as any);
      vi.mocked(prisma.syncState.update).mockResolvedValue({} as any);

      const result = await syncUserHistory(mockUserId, '5020');

      expect(result.success).toBe(true);
      expect(result.messagesDeleted).toBe(1);
      expect(prisma.email.delete).toHaveBeenCalledWith({
        where: { id: 'db_email_del_1' },
      });
    });

    it('should process labelsAdded and update read/starred state', async () => {
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '5020',
      } as any);

      const mockGmail = {
        users: {
          history: {
            list: vi.fn().mockResolvedValue({
              data: {
                historyId: '5030',
                history: [
                  {
                    id: '5025',
                    labelsAdded: [
                      {
                        message: { id: 'msg_label_1' },
                        labelIds: ['STARRED', 'IMPORTANT'],
                      },
                    ],
                  },
                ],
              },
            }),
          },
        },
      };

      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(mockGmail as any);

      vi.mocked(prisma.email.findUnique).mockResolvedValue({
        id: 'db_email_lbl_1',
        threadId: 'db_thread_lbl_1',
        labels: ['INBOX'],
      } as any);
      vi.mocked(prisma.email.update).mockResolvedValue({} as any);
      vi.mocked(prisma.email.count).mockResolvedValue(1);
      vi.mocked(prisma.thread.update).mockResolvedValue({} as any);
      vi.mocked(prisma.syncState.update).mockResolvedValue({} as any);

      const result = await syncUserHistory(mockUserId, '5030');

      expect(result.success).toBe(true);
      expect(result.labelsUpdated).toBe(1);

      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'db_email_lbl_1' },
        data: expect.objectContaining({
          labels: expect.arrayContaining(['INBOX', 'STARRED', 'IMPORTANT']),
          isStarred: true,
        }),
      });
    });

    it('should process labelsRemoved (UNREAD removed -> isRead = true)', async () => {
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '5030',
      } as any);

      const mockGmail = {
        users: {
          history: {
            list: vi.fn().mockResolvedValue({
              data: {
                historyId: '5040',
                history: [
                  {
                    id: '5035',
                    labelsRemoved: [
                      {
                        message: { id: 'msg_label_read' },
                        labelIds: ['UNREAD'],
                      },
                    ],
                  },
                ],
              },
            }),
          },
        },
      };

      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(mockGmail as any);

      vi.mocked(prisma.email.findUnique).mockResolvedValue({
        id: 'db_email_read_1',
        threadId: 'db_thread_read_1',
        labels: ['INBOX', 'UNREAD'],
      } as any);
      vi.mocked(prisma.email.update).mockResolvedValue({} as any);
      vi.mocked(prisma.email.count).mockResolvedValue(1);
      vi.mocked(prisma.thread.update).mockResolvedValue({} as any);
      vi.mocked(prisma.syncState.update).mockResolvedValue({} as any);

      const result = await syncUserHistory(mockUserId, '5040');

      expect(result.success).toBe(true);
      expect(result.labelsUpdated).toBe(1);

      expect(prisma.email.update).toHaveBeenCalledWith({
        where: { id: 'db_email_read_1' },
        data: expect.objectContaining({
          labels: ['INBOX'],
          isRead: true,
        }),
      });
    });

    it('should safely fall back to full mailbox sync when historyId is expired (404)', async () => {
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '1000', // ancient historyId
      } as any);

      const expiredError = new Error('HistoryId is too old or expired (404)');
      (expiredError as any).code = 404;

      const mockGmail = {
        users: {
          history: {
            list: vi.fn().mockRejectedValue(expiredError),
          },
        },
      };
      vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(mockGmail as any);

      // Spy on full sync fallback
      const fullSyncSpy = vi.spyOn(syncModule, 'syncUserMailbox').mockResolvedValue({
        success: true,
        synced: 15,
        threads: 10,
        latestHistoryId: '99999',
      });

      const result = await syncUserHistory(mockUserId, '99999');

      expect(result.success).toBe(true);
      expect(result.fullSyncFallback).toBe(true);
      expect(result.newHistoryId).toBe('99999');
      expect(fullSyncSpy).toHaveBeenCalledWith(mockUserId);
    });

    it('should be idempotent: redundant sync for same historyId returns without duplicate work', async () => {
      vi.mocked(prisma.syncState.findUnique).mockResolvedValue({
        userId: mockUserId,
        historyId: '6000',
      } as any);

      const result = await syncUserHistory(mockUserId, '6000');
      expect(result.success).toBe(true);
      expect(result.messagesAdded).toBe(0);
      expect(result.newHistoryId).toBe('6000');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // 5. Frontend Store & Revalidation
  // ─────────────────────────────────────────────────────────────────────────────
  describe('5. Frontend Real-time Store Revalidation', () => {
    it('triggerRefresh should update lastRefreshAt timestamp in mail store', () => {
      const initialRefresh = useMailStore.getState().lastRefreshAt;
      useMailStore.getState().triggerRefresh();
      const updatedRefresh = useMailStore.getState().lastRefreshAt;

      expect(updatedRefresh).toBeGreaterThan(initialRefresh);
      expect(updatedRefresh).toBeGreaterThan(0);
    });

    it('triggerRefresh must preserve open compose modal and compose draft state', () => {
      const store = useMailStore.getState();
      store.openCompose({
        to: 'colleague@example.com',
        subject: 'Draft subject',
        body: 'Important draft body text',
      });

      expect(useMailStore.getState().isComposeOpen).toBe(true);
      expect(useMailStore.getState().composeDraft.subject).toBe('Draft subject');

      // Trigger background real-time refresh
      store.triggerRefresh();

      // State is completely preserved
      expect(useMailStore.getState().isComposeOpen).toBe(true);
      expect(useMailStore.getState().composeDraft.to).toBe('colleague@example.com');
      expect(useMailStore.getState().composeDraft.subject).toBe('Draft subject');
      expect(useMailStore.getState().composeDraft.body).toBe('Important draft body text');
    });
  });
});
