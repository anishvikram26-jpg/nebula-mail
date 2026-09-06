import sanitizeHtml from 'sanitize-html';
import { gmail_v1 } from 'googleapis';
import { EmailAddress, ParsedEmail } from '@/lib/gmail/types';

/**
 * Decodes Gmail base64url encoded strings to UTF-8
 */
export function decodeBase64Url(base64UrlStr: string): string {
  if (!base64UrlStr) return '';
  let base64 = base64UrlStr.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  try {
    return Buffer.from(base64, 'base64').toString('utf8');
  } catch {
    return '';
  }
}

/**
 * Encodes a string to base64url format
 */
export function encodeBase64Url(str: string): string {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Extracts display name and pure email address from standard email headers.
 * Example: "Alice Smith <alice@example.com>" -> { name: "Alice Smith", email: "alice@example.com" }
 */
export function parseEmailAddress(raw: string): EmailAddress {
  if (!raw) return { name: '', email: '' };

  const match = raw.match(/^(?:"?([^"]*)"?\s)?(?:<?(.+@[^>]+)>?)$/);
  if (match) {
    const name = match[1]?.trim() || '';
    const email = match[2]?.trim().toLowerCase() || '';
    return { name: name || email, email };
  }

  const clean = raw.trim().replace(/[<>]/g, '');
  return { name: clean, email: clean.toLowerCase() };
}

/**
 * Parses multiple comma-separated email addresses into a list of strings
 */
export function parseEmailList(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => parseEmailAddress(entry.trim()).email)
    .filter(Boolean);
}

/**
 * Sanitizes HTML content from emails to prevent XSS attacks while preserving formatting.
 */
export function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml) return '';

  return sanitizeHtml(rawHtml, {
    allowedTags: [
      'p', 'div', 'span', 'br', 'hr',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'b', 'i', 'strong', 'em', 'u', 's', 'strike', 'sub', 'sup',
      'blockquote', 'pre', 'code',
      'ul', 'ol', 'li',
      'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td',
      'a', 'img',
    ],
    allowedAttributes: {
      a: ['href', 'name', 'target', 'rel', 'style', 'class'],
      img: ['src', 'alt', 'title', 'width', 'height', 'style', 'class'],
      div: ['style', 'class', 'align'],
      span: ['style', 'class'],
      p: ['style', 'class', 'align'],
      table: ['style', 'class', 'width', 'height', 'border', 'cellpadding', 'cellspacing', 'align'],
      td: ['style', 'class', 'width', 'height', 'colspan', 'rowspan', 'align', 'valign'],
      th: ['style', 'class', 'width', 'height', 'colspan', 'rowspan', 'align', 'valign'],
      tr: ['style', 'class', 'align', 'valign'],
    },
    allowedSchemes: ['http', 'https', 'mailto', 'data', 'cid'],
    transformTags: {
      a: (tagName, attribs) => {
        return {
          tagName,
          attribs: {
            ...attribs,
            target: '_blank',
            rel: 'noopener noreferrer nofollow',
          },
        };
      },
    },
  });
}

/**
 * Recursively extracts plain text and HTML bodies from MIME parts.
 */
function extractBodiesFromParts(parts: gmail_v1.Schema$MessagePart[]): {
  text: string;
  html: string;
} {
  let text = '';
  let html = '';

  for (const part of parts) {
    const mimeType = part.mimeType || '';

    // If direct body content is available
    if (part.body?.data) {
      const decoded = decodeBase64Url(part.body.data);
      if (mimeType.startsWith('text/plain') && !text) {
        text = decoded;
      } else if (mimeType.startsWith('text/html') && !html) {
        html = decoded;
      }
    }

    // Recursively process nested MIME sub-parts
    if (part.parts && part.parts.length > 0) {
      const nested = extractBodiesFromParts(part.parts);
      if (!text && nested.text) text = nested.text;
      if (!html && nested.html) html = nested.html;
    }
  }

  return { text, html };
}

/**
 * Parses a raw Gmail API message resource into a normalized, sanitized ParsedEmail structure.
 */
export function parseGmailMessage(message: gmail_v1.Schema$Message): ParsedEmail {
  const headers = message.payload?.headers || [];

  const getHeader = (name: string): string => {
    const header = headers.find((h) => h.name?.toLowerCase() === name.toLowerCase());
    return header?.value?.trim() || '';
  };

  const rawFrom = getHeader('From');
  const parsedFrom = parseEmailAddress(rawFrom);

  const rawTo = getHeader('To');
  const recipients = parseEmailList(rawTo);

  const rawCc = getHeader('Cc');
  const cc = parseEmailList(rawCc);

  const rawBcc = getHeader('Bcc');
  const bcc = parseEmailList(rawBcc);

  const subject = getHeader('Subject') || '(no subject)';
  const dateHeader = getHeader('Date');
  const messageIdHeader = getHeader('Message-ID');
  const inReplyToHeader = getHeader('In-Reply-To');
  const referencesHeader = getHeader('References');

  let receivedAt: Date;
  if (message.internalDate) {
    receivedAt = new Date(parseInt(message.internalDate, 10));
  } else if (dateHeader) {
    const parsed = new Date(dateHeader);
    receivedAt = isNaN(parsed.getTime()) ? new Date() : parsed;
  } else {
    receivedAt = new Date();
  }

  let bodyText = '';
  let bodyHtml = '';

  // Extract body from single-part or multipart payload
  if (message.payload?.body?.data) {
    const mimeType = message.payload.mimeType || 'text/plain';
    const decoded = decodeBase64Url(message.payload.body.data);
    if (mimeType.includes('text/html')) {
      bodyHtml = decoded;
    } else {
      bodyText = decoded;
    }
  }

  if (message.payload?.parts && message.payload.parts.length > 0) {
    const extracted = extractBodiesFromParts(message.payload.parts);
    if (extracted.text) bodyText = extracted.text;
    if (extracted.html) bodyHtml = extracted.html;
  }

  // Fallback: if only HTML exists, create a basic text version
  if (!bodyText && bodyHtml) {
    bodyText = bodyHtml
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  const sanitizedHtml = sanitizeEmailHtml(bodyHtml);
  const labels = message.labelIds || [];
  const isRead = !labels.includes('UNREAD');
  const isStarred = labels.includes('STARRED');

  return {
    id: message.id || '',
    threadId: message.threadId || message.id || '',
    sender: parsedFrom.name || parsedFrom.email || 'Unknown Sender',
    senderEmail: parsedFrom.email || '',
    recipients,
    cc,
    bcc,
    subject,
    bodyText: bodyText.trim(),
    bodyHtml: sanitizedHtml,
    snippet: message.snippet || bodyText.slice(0, 150) || '',
    receivedAt,
    sentAt: labels.includes('SENT') ? receivedAt : undefined,
    isRead,
    isStarred,
    labels,
    messageIdHeader: messageIdHeader || undefined,
    inReplyToHeader: inReplyToHeader || undefined,
    referencesHeader: referencesHeader || undefined,
    historyId: message.historyId || undefined,
  };
}
