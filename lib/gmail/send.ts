import { getGmailClient } from '@/lib/gmail/client';
import { encodeBase64Url } from '@/lib/gmail/mime';
import crypto from 'crypto';

export { encodeBase64Url };

export interface SendEmailOptions {
  userId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface SendResult {
  success: boolean;
  messageId: string;
  threadId: string;
}

export interface DraftResult {
  success: boolean;
  draftId: string;
  messageId: string;
}

import { isValidEmailAddress } from '@/lib/gmail/validation';
export { isValidEmailAddress };

/**
 * Sanitizes header values to completely prevent header injection attacks.
 * Throws an error if carriage return or newline characters are present.
 */
export function sanitizeHeader(value: string, headerName: string): string {
  if (!value) return '';
  if (/[\r\n]/.test(value)) {
    throw new Error(`HEADER_INJECTION_DETECTED: Invalid newline in ${headerName} header.`);
  }
  return value.trim();
}

/**
 * Encodes a subject string according to RFC 2047 for safe MIME transport.
 */
export function encodeMimeHeader(text: string): string {
  if (!text) return '';
  const sanitized = sanitizeHeader(text, 'Subject');

  // If text contains non-ASCII characters, encode as UTF-8 Base64 word
  if (/[^\x20-\x7E]/.test(sanitized)) {
    const base64 = Buffer.from(sanitized, 'utf8').toString('base64');
    return `=?UTF-8?B?${base64}?=`;
  }

  return sanitized;
}

/**
 * Constructs a standards-compliant RFC 2822 email string.
 */
export function buildRfc2822Message(options: {
  fromEmail?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  inReplyTo?: string;
  references?: string;
}): string {
  const { fromEmail, to, cc, bcc, subject, textBody, htmlBody, inReplyTo, references } = options;

  // 1. Guard against header injection across all header inputs
  const headersToCheck = [
    { name: 'To', list: to },
    { name: 'Cc', list: cc || [] },
    { name: 'Bcc', list: bcc || [] },
    { name: 'Subject', value: subject },
    { name: 'In-Reply-To', value: inReplyTo },
    { name: 'References', value: references },
    { name: 'From', value: fromEmail },
  ];

  for (const item of headersToCheck) {
    if (item.list) {
      for (const val of item.list) {
        if (/[\r\n]/.test(val)) {
          throw new Error(`HEADER_INJECTION_DETECTED: Invalid newline in ${item.name} header.`);
        }
      }
    } else if (item.value && /[\r\n]/.test(item.value)) {
      throw new Error(`HEADER_INJECTION_DETECTED: Invalid newline in ${item.name} header.`);
    }
  }

  // 2. Validate email addresses
  const allAddresses = [...to, ...(cc || []), ...(bcc || [])];
  for (const addr of allAddresses) {
    if (!isValidEmailAddress(addr)) {
      throw new Error(`INVALID_EMAIL: The address "${addr}" is invalid.`);
    }
  }

  const cleanTo = to.map((a) => sanitizeHeader(a, 'To')).join(', ');
  const encodedSubject = encodeMimeHeader(subject);

  const headers: string[] = [];

  if (fromEmail) {
    headers.push(`From: ${sanitizeHeader(fromEmail, 'From')}`);
  }

  headers.push(`To: ${cleanTo}`);
  headers.push(`Subject: ${encodedSubject}`);
  headers.push(`Date: ${new Date().toUTCString()}`);
  headers.push(`Message-ID: <${Date.now()}.${crypto.randomBytes(8).toString('hex')}@nebula.mail>`);
  headers.push('MIME-Version: 1.0');

  if (cc && cc.length > 0) {
    const cleanCc = cc.map((a) => sanitizeHeader(a, 'Cc')).join(', ');
    headers.push(`Cc: ${cleanCc}`);
  }

  if (bcc && bcc.length > 0) {
    const cleanBcc = bcc.map((a) => sanitizeHeader(a, 'Bcc')).join(', ');
    headers.push(`Bcc: ${cleanBcc}`);
  }

  if (inReplyTo) {
    headers.push(`In-Reply-To: ${sanitizeHeader(inReplyTo, 'In-Reply-To')}`);
  }

  if (references) {
    headers.push(`References: ${sanitizeHeader(references, 'References')}`);
  }

  // Construct body: if HTML is provided, construct multipart/alternative
  if (htmlBody && htmlBody.trim()) {
    const boundary = `boundary_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

    const parts = [
      `--${boundary}`,
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      textBody || '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 8bit',
      '',
      htmlBody,
      `--${boundary}--`,
      '',
    ];

    return `${headers.join('\r\n')}\r\n\r\n${parts.join('\r\n')}`;
  } else {
    headers.push('Content-Type: text/plain; charset="UTF-8"');
    headers.push('Content-Transfer-Encoding: 8bit');
    return `${headers.join('\r\n')}\r\n\r\n${textBody || ''}`;
  }
}

/**
 * Sends an email through the authenticated user's Gmail account via Gmail API users.messages.send.
 */
export async function sendGmailMessage(options: SendEmailOptions): Promise<SendResult> {
  const { userId, to, cc, bcc, subject, textBody, htmlBody, threadId, inReplyTo, references } =
    options;

  const gmail = await getGmailClient(userId);

  // Retrieve user's Google profile to set the From header correctly if available
  let senderEmail = 'me';
  try {
    if (typeof gmail.users?.getProfile === 'function') {
      const profileRes = await gmail.users.getProfile({ userId: 'me' });
      senderEmail = profileRes.data.emailAddress || 'me';
    }
  } catch {
    senderEmail = 'me';
  }

  if (!senderEmail) {
    throw new Error('SENDER_EMAIL_UNAVAILABLE: Could not determine user email address from Gmail.');
  }

  const rfc2822String = buildRfc2822Message({
    fromEmail: senderEmail,
    to,
    cc,
    bcc,
    subject,
    textBody,
    htmlBody,
    inReplyTo,
    references,
  });

  const raw = encodeBase64Url(rfc2822String);

  const res = await gmail.users.messages.send({
    userId: 'me',
    requestBody: {
      raw,
      threadId: threadId || undefined,
    },
  });

  const messageId = res.data.id || '';
  const resultThreadId = res.data.threadId || threadId || messageId;

  return {
    success: true,
    messageId,
    threadId: resultThreadId,
  };
}

/**
 * Saves an email draft to the user's Gmail account via users.drafts.create.
 */
export async function createGmailDraft(options: SendEmailOptions): Promise<DraftResult> {
  const { userId, to, cc, bcc, subject, textBody, htmlBody, threadId, inReplyTo, references } = options;

  const gmail = await getGmailClient(userId);

  let senderEmail = 'me';
  try {
    if (typeof gmail.users?.getProfile === 'function') {
      const profileRes = await gmail.users.getProfile({ userId: 'me' });
      senderEmail = profileRes.data.emailAddress || 'me';
    }
  } catch {
    senderEmail = 'me';
  }

  const rfc2822String = buildRfc2822Message({
    fromEmail: senderEmail,
    to: to.length > 0 ? to : ['undisclosed-recipients@gmail.com'],
    cc,
    bcc,
    subject: subject || '(Draft with no subject)',
    textBody: textBody || '',
    htmlBody,
    inReplyTo,
    references,
  });

  const raw = encodeBase64Url(rfc2822String);

  const res = await gmail.users.drafts.create({
    userId: 'me',
    requestBody: {
      message: {
        raw,
        threadId: threadId || undefined,
      },
    },
  });

  return {
    success: true,
    draftId: res.data.id || '',
    messageId: res.data.message?.id || '',
  };
}
