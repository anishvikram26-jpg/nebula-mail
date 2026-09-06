import { describe, it, expect } from 'vitest';
import {
  decodeBase64Url,
  encodeBase64Url,
  parseEmailAddress,
  parseEmailList,
  sanitizeEmailHtml,
  parseGmailMessage,
} from '@/lib/gmail/mime';
import { gmail_v1 } from 'googleapis';

describe('MIME & Email Parser', () => {
  describe('Base64URL encoding and decoding', () => {
    it('should correctly encode and decode UTF-8 strings', () => {
      const original = 'Hello World! Special chars: ©, 🚀, & <test>';
      const encoded = encodeBase64Url(original);
      const decoded = decodeBase64Url(encoded);

      expect(decoded).toBe(original);
    });

    it('should handle empty or malformed strings gracefully', () => {
      expect(decodeBase64Url('')).toBe('');
      expect(encodeBase64Url('')).toBe('');
    });
  });

  describe('Email address parser', () => {
    it('should parse display names and email addresses correctly', () => {
      expect(parseEmailAddress('Alice Smith <alice@example.com>')).toEqual({
        name: 'Alice Smith',
        email: 'alice@example.com',
      });

      expect(parseEmailAddress('"Bob Jones" <bob@example.com>')).toEqual({
        name: 'Bob Jones',
        email: 'bob@example.com',
      });

      expect(parseEmailAddress('support@service.io')).toEqual({
        name: 'support@service.io',
        email: 'support@service.io',
      });

      expect(parseEmailAddress('<simple@test.com>')).toEqual({
        name: 'simple@test.com',
        email: 'simple@test.com',
      });
    });

    it('should parse comma-separated recipient lists', () => {
      const list = 'Alice <alice@test.com>, "Bob" <bob@test.com>, charlie@test.com';
      expect(parseEmailList(list)).toEqual([
        'alice@test.com',
        'bob@test.com',
        'charlie@test.com',
      ]);
    });
  });

  describe('HTML sanitization', () => {
    it('should remove malicious script tags and event handlers', () => {
      const dangerousHtml = `
        <div>
          <p>Hello User</p>
          <script>alert("hacked")</script>
          <img src="x" onerror="alert(1)" />
          <a href="javascript:alert('xss')">Click Here</a>
        </div>
      `;

      const clean = sanitizeEmailHtml(dangerousHtml);
      expect(clean).not.toContain('<script>');
      expect(clean).not.toContain('alert(');
      expect(clean).not.toContain('onerror');
      expect(clean).not.toContain('javascript:');
      expect(clean).toContain('<p>Hello User</p>');
    });

    it('should preserve safe formatting, links, and table layouts', () => {
      const safeHtml = `
        <div style="color: blue;">
          <h1>Welcome</h1>
          <p>This is a <b>bold</b> and <i>italic</i> email.</p>
          <a href="https://example.com">Website</a>
          <table><tr><td>Data Cell</td></tr></table>
        </div>
      `;

      const clean = sanitizeEmailHtml(safeHtml);
      expect(clean).toContain('<h1>Welcome</h1>');
      expect(clean).toContain('<b>bold</b>');
      expect(clean).toContain('<i>italic</i>');
      expect(clean).toContain('target="_blank"');
      expect(clean).toContain('rel="noopener noreferrer nofollow"');
      expect(clean).toContain('<table>');
    });
  });

  describe('Gmail message normalization', () => {
    it('should parse a plain text Gmail message', () => {
      const rawMessage: gmail_v1.Schema$Message = {
        id: 'msg_101',
        threadId: 'th_202',
        internalDate: '1700000000000',
        labelIds: ['INBOX', 'UNREAD'],
        snippet: 'Here is your monthly report',
        payload: {
          mimeType: 'text/plain',
          headers: [
            { name: 'From', value: 'Finance Team <finance@company.com>' },
            { name: 'To', value: 'CEO <ceo@company.com>' },
            { name: 'Subject', value: 'Monthly Financial Overview' },
            { name: 'Message-ID', value: '<msg101@company.com>' },
          ],
          body: {
            data: encodeBase64Url('Here is your monthly report for review.'),
          },
        },
      };

      const parsed = parseGmailMessage(rawMessage);
      expect(parsed.id).toBe('msg_101');
      expect(parsed.threadId).toBe('th_202');
      expect(parsed.sender).toBe('Finance Team');
      expect(parsed.senderEmail).toBe('finance@company.com');
      expect(parsed.recipients).toEqual(['ceo@company.com']);
      expect(parsed.subject).toBe('Monthly Financial Overview');
      expect(parsed.bodyText).toBe('Here is your monthly report for review.');
      expect(parsed.isRead).toBe(false);
      expect(parsed.isStarred).toBe(false);
      expect(parsed.labels).toContain('INBOX');
      expect(parsed.messageIdHeader).toBe('<msg101@company.com>');
    });

    it('should parse a multipart/alternative Gmail message', () => {
      const textContent = 'Plain text fallback';
      const htmlContent = '<p>Rich <strong>HTML</strong> email body</p>';

      const rawMessage: gmail_v1.Schema$Message = {
        id: 'msg_multipart',
        threadId: 'th_multipart',
        labelIds: ['INBOX', 'STARRED'],
        payload: {
          mimeType: 'multipart/alternative',
          headers: [
            { name: 'From', value: 'marketing@brand.com' },
            { name: 'To', value: 'user@example.com' },
            { name: 'Cc', value: 'manager@example.com' },
            { name: 'Subject', value: 'Special Offer' },
          ],
          parts: [
            {
              mimeType: 'text/plain',
              body: { data: encodeBase64Url(textContent) },
            },
            {
              mimeType: 'text/html',
              body: { data: encodeBase64Url(htmlContent) },
            },
          ],
        },
      };

      const parsed = parseGmailMessage(rawMessage);
      expect(parsed.id).toBe('msg_multipart');
      expect(parsed.bodyText).toBe(textContent);
      expect(parsed.bodyHtml).toContain('Rich <strong>HTML</strong> email body');
      expect(parsed.isRead).toBe(true);
      expect(parsed.isStarred).toBe(true);
      expect(parsed.cc).toEqual(['manager@example.com']);
    });

    it('should extract In-Reply-To and References headers for thread tracking', () => {
      const rawMessage: gmail_v1.Schema$Message = {
        id: 'reply_msg',
        threadId: 'th_conversation',
        payload: {
          headers: [
            { name: 'From', value: 'Dev <dev@test.com>' },
            { name: 'Subject', value: 'Re: Project Kickoff' },
            { name: 'In-Reply-To', value: '<original-msg-id@test.com>' },
            { name: 'References', value: '<root-id@test.com> <original-msg-id@test.com>' },
          ],
          body: {
            data: encodeBase64Url('Sounds great, see you tomorrow!'),
          },
        },
      };

      const parsed = parseGmailMessage(rawMessage);
      expect(parsed.inReplyToHeader).toBe('<original-msg-id@test.com>');
      expect(parsed.referencesHeader).toBe('<root-id@test.com> <original-msg-id@test.com>');
      expect(parsed.subject).toBe('Re: Project Kickoff');
    });
  });
});
