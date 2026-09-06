/**
 * AI Assistant types — Phase 8
 * Shared between server (chat route) and client (action dispatcher).
 * No OpenAI SDK types leak into this file — it stays isomorphic.
 */

import { MailFolder } from '@/lib/gmail/types';

// ── Context sent from the client to /api/ai/chat ─────────────────────────────

export interface AIContext {
  /** Which mail folder the user is currently viewing */
  currentFolder: MailFolder;
  /** Database ID of the email open in EmailDetail, or null */
  selectedEmailId: string | null;
  /** Display name of the selected email sender */
  selectedEmailSender?: string;
  /** Raw email address of the selected email sender */
  selectedEmailSenderEmail?: string;
  /** Subject line of the selected email */
  selectedEmailSubject?: string;
  /** Short preview snippet of the selected email */
  selectedEmailSnippet?: string;
  /** Gmail provider thread ID (for replies) */
  selectedEmailProviderThreadId?: string;
  /** Gmail provider message ID (for In-Reply-To header) */
  selectedEmailProviderMessageId?: string;
  /** Plain-text body excerpt (truncated server-side for safety) */
  selectedEmailBodyText?: string;
  /** Current search query string */
  searchQuery: string;
  /** Active filter state */
  filters: {
    unreadOnly: boolean;
    starredOnly: boolean;
  };
  /** Authenticated user's email address (for context) */
  userEmail?: string;
  /** Authenticated user's display name */
  userName?: string;
}

// ── Tool argument types ───────────────────────────────────────────────────────

export interface NavigateFolderArgs {
  folder: MailFolder;
}

export interface SearchEmailsArgs {
  /** Keyword search in subject, body, sender name */
  query?: string;
  /** Filter by sender name or email address */
  sender?: string;
  /**
   * Natural language date phrase passed through from user.
   * The server normalises this — the model must NOT compute dates itself.
   * Examples: "today", "this week", "last 10 days", "this month"
   */
  datePhrase?: string;
  /** ISO date string — computed server-side from datePhrase */
  dateFrom?: string;
  /** ISO date string — computed server-side from datePhrase */
  dateTo?: string;
  /** Show only unread emails */
  unreadOnly?: boolean;
  /** Show only starred emails */
  starredOnly?: boolean;
  /** Folder to search in (defaults to current folder) */
  folder?: MailFolder;
}

export interface SelectEmailArgs {
  /** Sender name or email to match */
  sender?: string;
  /** Keyword to find in subject or body */
  keyword?: string;
  /** If true, select the most recent matching email */
  selectLatest?: boolean;
}

export interface OpenComposeArgs {
  /** Recipient email addresses */
  to?: string[];
  cc?: string[];
  bcc?: string[];
  subject?: string;
  body?: string;
  /** Gmail thread ID — only set for replies */
  threadId?: string;
  /** In-Reply-To header value */
  inReplyTo?: string;
  /** References header value */
  references?: string;
}

export interface PrepareReplyArgs {
  /** Optional extra text to include in the reply draft body */
  additionalNotes?: string;
}

export interface SummarizeEmailArgs {
  /** Summarise the selected email or the full thread */
  scope?: 'email' | 'thread';
}

export interface ProposeSendEmailArgs {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}

// ── Discriminated union of all possible AI actions ───────────────────────────

export type AIAction =
  | { type: 'navigate_folder'; args: NavigateFolderArgs }
  | { type: 'search_emails'; args: SearchEmailsArgs }
  | {
      type: 'select_email';
      args: SelectEmailArgs & {
        /** Resolved by the server from Prisma — the actual DB email ID */
        resolvedEmailId: string | null;
      };
    }
  | { type: 'open_compose'; args: OpenComposeArgs }
  | { type: 'prepare_reply'; args: OpenComposeArgs }
  | { type: 'summarize_email'; args: SummarizeEmailArgs }
  | { type: 'propose_send_email'; args: OpenComposeArgs };

// ── Request / Response shapes ─────────────────────────────────────────────────

export interface AIChatRequest {
  message: string;
  context: AIContext;
}

export interface AIChatResponse {
  /** Human-readable message shown in the assistant chat panel */
  message: string;
  /** Structured action for the client dispatcher to execute, or null for text-only replies */
  action: AIAction | null;
}
