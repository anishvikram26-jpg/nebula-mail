import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidEmailAddress,
  buildRfc2822Message,
  encodeBase64Url,
  sendGmailMessage,
  createGmailDraft,
} from '@/lib/gmail/send';
import * as clientModule from '@/lib/gmail/client';
import { gmail_v1 } from 'googleapis';

describe('Gmail Send & RFC 2822 Construction Service', () => {
  describe('Email Address Validation', () => {
    it('should validate correct standard email addresses', () => {
      expect(isValidEmailAddress('user@example.com')).toBe(true);
      expect(isValidEmailAddress('john.doe@company.org')).toBe(true);
      expect(isValidEmailAddress('user+tag@domain.co.uk')).toBe(true);
      expect(isValidEmailAddress('first_last-123@sub.domain.io')).toBe(true);
    });

    it('should reject invalid or malformed email addresses', () => {
      expect(isValidEmailAddress('')).toBe(false);
      expect(isValidEmailAddress('plainaddress')).toBe(false);
      expect(isValidEmailAddress('missingdomain@')).toBe(false);
      expect(isValidEmailAddress('@missinguser.com')).toBe(false);
      expect(isValidEmailAddress('user@domain with spaces.com')).toBe(false);
      expect(isValidEmailAddress('user@domain..com')).toBe(false);
      expect(isValidEmailAddress('user@.domain.com')).toBe(false);
      expect(isValidEmailAddress('user@domain.c')).toBe(false);
    });
  });

  describe('RFC 2822 Message Construction & Security', () => {
    it('should construct a valid plain text RFC 2822 message', () => {
      const raw = buildRfc2822Message({
        to: ['alice@example.com'],
        subject: 'Project Kickoff',
        textBody: 'Hello Alice,\nLet us begin the project.',
      });

      expect(raw).toContain('To: alice@example.com\r\n');
      expect(raw).toContain('Subject: Project Kickoff\r\n');
      expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"\r\n');
      expect(raw).toContain('MIME-Version: 1.0\r\n');
      expect(raw).toContain('Hello Alice,\nLet us begin the project.');
    });

    it('should construct multipart/alternative message when htmlBody is supplied', () => {
      const raw = buildRfc2822Message({
        to: ['bob@example.com'],
        cc: ['carol@example.com'],
        bcc: ['secret@example.com'],
        subject: 'Weekly Digest',
        textBody: 'Weekly update text',
        htmlBody: '<p>Weekly update HTML</p>',
      });

      expect(raw).toContain('To: bob@example.com\r\n');
      expect(raw).toContain('Cc: carol@example.com\r\n');
      expect(raw).toContain('Bcc: secret@example.com\r\n');
      expect(raw).toContain('Content-Type: multipart/alternative; boundary="');
      expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"\r\n');
      expect(raw).toContain('Content-Type: text/html; charset="UTF-8"\r\n');
      expect(raw).toContain('Weekly update text');
      expect(raw).toContain('<p>Weekly update HTML</p>');
    });

    it('should include In-Reply-To and References headers for reply threads', () => {
      const raw = buildRfc2822Message({
        to: ['sender@example.com'],
        subject: 'Re: Meeting Tomorrow',
        textBody: 'Sounds good!',
        inReplyTo: '<orig-message-id@mail.gmail.com>',
        references: '<orig-message-id@mail.gmail.com>',
      });

      expect(raw).toContain('Subject: Re: Meeting Tomorrow\r\n');
      expect(raw).toContain('In-Reply-To: <orig-message-id@mail.gmail.com>\r\n');
      expect(raw).toContain('References: <orig-message-id@mail.gmail.com>\r\n');
    });

    it('should prevent header injection by rejecting carriage returns and newlines in headers', () => {
      expect(() =>
        buildRfc2822Message({
          to: ['victim@example.com\r\nBcc: hacker@example.com'],
          subject: 'Legit Subject',
          textBody: 'Body text',
        })
      ).toThrow(/HEADER_INJECTION_DETECTED/i);

      expect(() =>
        buildRfc2822Message({
          to: ['victim@example.com'],
          subject: 'Legit Subject\r\nSubject: Overridden',
          textBody: 'Body text',
        })
      ).toThrow(/HEADER_INJECTION_DETECTED/i);

      expect(() =>
        buildRfc2822Message({
          to: ['victim@example.com'],
          cc: ['attacker@example.com\nAnother: Injected'],
          subject: 'Legit Subject',
          textBody: 'Body text',
        })
      ).toThrow(/HEADER_INJECTION_DETECTED/i);
    });
  });

  describe('Base64URL Encoding', () => {
    it('should encode strings into RFC 4648 Base64URL without + / or = characters', () => {
      const testString = 'Subject: Test\r\n\r\nHello ??? world >><<';
      const encoded = encodeBase64Url(testString);

      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
    });
  });

  describe('sendGmailMessage & createGmailDraft API integration', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should invoke users.messages.send with base64url encoded payload', async () => {
      const mockSend = vi.fn().mockResolvedValue({
        data: {
          id: 'gmail_msg_999',
          threadId: 'gmail_thread_888',
        },
      });

      vi.spyOn(clientModule, 'getGmailClient').mockResolvedValue({
        users: {
          messages: {
            send: mockSend,
          },
        },
      } as unknown as gmail_v1.Gmail);

      const result = await sendGmailMessage({
        userId: 'user_123',
        to: ['john@example.com'],
        subject: 'Meeting Tomorrow',
        textBody: 'Let us meet at 3pm.',
        threadId: 'gmail_thread_888',
      });

      expect(result.messageId).toBe('gmail_msg_999');
      expect(result.threadId).toBe('gmail_thread_888');
      expect(mockSend).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          raw: expect.any(String),
          threadId: 'gmail_thread_888',
        },
      });
    });

    it('should invoke users.drafts.create with message payload', async () => {
      const mockDraftCreate = vi.fn().mockResolvedValue({
        data: {
          id: 'draft_123',
          message: {
            id: 'msg_draft_456',
          },
        },
      });

      vi.spyOn(clientModule, 'getGmailClient').mockResolvedValue({
        users: {
          drafts: {
            create: mockDraftCreate,
          },
        },
      } as unknown as gmail_v1.Gmail);

      const result = await createGmailDraft({
        userId: 'user_123',
        to: ['draft_recipient@example.com'],
        subject: 'Draft Subject',
        textBody: 'Draft body text',
      });

      expect(result.draftId).toBe('draft_123');
      expect(result.messageId).toBe('msg_draft_456');
      expect(mockDraftCreate).toHaveBeenCalledWith({
        userId: 'me',
        requestBody: {
          message: {
            raw: expect.any(String),
            threadId: undefined,
          },
        },
      });
    });
  });
});
