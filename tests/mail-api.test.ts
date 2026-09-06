import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET as mailListHandler } from '@/app/api/mail/list/route';
import { GET as mailDetailHandler } from '@/app/api/mail/[id]/route';
import { POST as mailSyncHandler } from '@/app/api/mail/sync/route';
import { POST as mailSendHandler } from '@/app/api/mail/send/route';
import { POST as mailDraftHandler } from '@/app/api/mail/draft/route';
import { POST as mailReplyHandler } from '@/app/api/mail/reply/route';
import { NextRequest } from 'next/server';
import * as authModule from '@/lib/auth/middleware';
import * as sendModule from '@/lib/gmail/send';

const mockAuthenticatedUser: authModule.AuthenticatedUser = {
  id: 'usr_1',
  email: 'sender@example.com',
  name: 'Test Sender',
  image: null,
};

describe('Mail API Endpoints', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('Authentication Enforcement', () => {
    it('should reject unauthenticated requests to /api/mail/list with 401', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/mail/list?folder=inbox');
      const res = await mailListHandler(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('should reject unauthenticated requests to /api/mail/[id] with 401', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/mail/msg_123');
      const res = await mailDetailHandler(req, {
        params: Promise.resolve({ id: 'msg_123' }),
      });

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('should reject unauthenticated requests to /api/mail/sync with 401', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(null);

      const res = await mailSyncHandler();

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('should reject unauthenticated requests to /api/mail/send with 401', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/mail/send', {
        method: 'POST',
        body: JSON.stringify({ to: ['user@example.com'], subject: 'Hi', textBody: 'Hello' }),
      });
      const res = await mailSendHandler(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('should reject unauthenticated requests to /api/mail/draft with 401', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/mail/draft', {
        method: 'POST',
        body: JSON.stringify({ subject: 'Draft', textBody: 'Hello' }),
      });
      const res = await mailDraftHandler(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('should reject unauthenticated requests to /api/mail/reply with 401', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(null);

      const req = new NextRequest('http://localhost:3000/api/mail/reply', {
        method: 'POST',
        body: JSON.stringify({ threadId: 'thread_1', to: ['user@example.com'] }),
      });
      const res = await mailReplyHandler(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });
  });

  describe('Send Route Validation & Execution', () => {
    it('should reject requests with missing recipients with 400', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(mockAuthenticatedUser);

      const req = new NextRequest('http://localhost:3000/api/mail/send', {
        method: 'POST',
        body: JSON.stringify({ to: [], subject: 'Hello' }),
      });
      const res = await mailSendHandler(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('At least one recipient');
    });

    it('should reject requests with invalid recipient email format with 400', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(mockAuthenticatedUser);

      const req = new NextRequest('http://localhost:3000/api/mail/send', {
        method: 'POST',
        body: JSON.stringify({ to: ['invalid-address-without-at'], subject: 'Hello' }),
      });
      const res = await mailSendHandler(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('not a valid email address');
    });

    it('should send email successfully for authenticated user with valid payload', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(mockAuthenticatedUser);

      vi.spyOn(sendModule, 'sendGmailMessage').mockResolvedValue({
        messageId: 'gmail_msg_send_123',
        threadId: 'gmail_thread_send_123',
        success: true,
      });

      const req = new NextRequest('http://localhost:3000/api/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          to: ['john@example.com'],
          subject: 'Meeting Tomorrow',
          textBody: 'Let us meet at 3pm.',
        }),
      });
      const res = await mailSendHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.messageId).toBe('gmail_msg_send_123');
    });
  });

  describe('Draft & Reply Route Execution', () => {
    it('should save draft successfully for authenticated user', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(mockAuthenticatedUser);

      vi.spyOn(sendModule, 'createGmailDraft').mockResolvedValue({
        draftId: 'draft_456',
        messageId: 'msg_draft_456',
        success: true,
      });

      const req = new NextRequest('http://localhost:3000/api/mail/draft', {
        method: 'POST',
        body: JSON.stringify({
          to: ['recipient@example.com'],
          subject: 'Drafted idea',
          textBody: 'Notes here',
        }),
      });
      const res = await mailDraftHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.draftId).toBe('draft_456');
    });

    it('should reject reply when threadId is missing', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(mockAuthenticatedUser);

      const req = new NextRequest('http://localhost:3000/api/mail/reply', {
        method: 'POST',
        body: JSON.stringify({
          to: ['recipient@example.com'],
          subject: 'Re: test',
        }),
      });
      const res = await mailReplyHandler(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('threadId is required');
    });

    it('should send reply when threadId and valid payload are provided', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(mockAuthenticatedUser);

      vi.spyOn(sendModule, 'sendGmailMessage').mockResolvedValue({
        messageId: 'msg_reply_789',
        threadId: 'thread_123',
        success: true,
      });

      const req = new NextRequest('http://localhost:3000/api/mail/reply', {
        method: 'POST',
        body: JSON.stringify({
          threadId: 'thread_123',
          to: ['recipient@example.com'],
          subject: 'Re: Project update',
          textBody: 'Got it, thanks!',
        }),
      });
      const res = await mailReplyHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.messageId).toBe('msg_reply_789');
    });
  });
});
