/**
 * Application-level Gmail and Email types
 * These types provide clean domain separation so raw Google API objects
 * are not leaked throughout the frontend or UI components.
 */

export type MailFolder = 'inbox' | 'sent' | 'starred' | 'trash' | 'drafts' | 'spam';

export interface EmailAddress {
  name: string;
  email: string;
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface ParsedEmail {
  id: string; // Gmail message ID
  threadId: string; // Gmail thread ID
  sender: string; // Display name or formatted sender
  senderEmail: string; // Pure email address
  recipients: string[]; // List of recipient email addresses
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string; // Sanitized HTML
  snippet: string;
  receivedAt: Date;
  sentAt?: Date;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
  messageIdHeader?: string;
  inReplyToHeader?: string;
  referencesHeader?: string;
  historyId?: string;
}

export interface MailListItem {
  id: string; // Database ID
  providerMessageId: string;
  threadId: string; // Database thread ID
  providerThreadId: string;
  sender: string;
  senderEmail: string;
  recipients: string;
  subject: string;
  snippet: string;
  receivedAt: string; // ISO string
  sentAt?: string | null;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
}

export interface MailThreadDetail {
  id: string;
  providerThreadId: string;
  snippet: string | null;
  messageCount: number;
  hasUnread: boolean;
  isStarred: boolean;
  lastMessageAt: string;
  messages: MailDetail[];
}

export interface MailDetail {
  id: string;
  providerMessageId: string;
  threadId: string;
  providerThreadId: string;
  sender: string;
  senderEmail: string;
  recipients: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  bodyText: string;
  bodyHtml: string;
  snippet: string;
  receivedAt: string;
  sentAt?: string | null;
  isRead: boolean;
  isStarred: boolean;
  labels: string[];
}

export interface MailListPagination {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface MailListResponse {
  folder: MailFolder;
  emails: MailListItem[];
  pagination: MailListPagination;
}

export interface SyncStats {
  success: boolean;
  synced: number;
  threads: number;
  latestHistoryId?: string | null;
  error?: string;
}

export interface GmailApiError {
  code: number;
  message: string;
  status: string;
}
