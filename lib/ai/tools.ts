/**
 * OpenAI tool definitions for the email copilot.
 *
 * These are the ONLY actions the AI is authorised to call.
 * Arguments are validated server-side before any action is dispatched.
 */

import type { ChatCompletionTool } from 'openai/resources/chat/completions';

export const AI_TOOLS: ChatCompletionTool[] = [
  // ── 1. navigate_folder ──────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'navigate_folder',
      description:
        'Navigate to a mail folder (inbox, sent, starred, drafts, trash). ' +
        'Use this when the user wants to switch to a different folder.',
      parameters: {
        type: 'object',
        properties: {
          folder: {
            type: 'string',
            enum: ['inbox', 'sent', 'starred', 'drafts', 'trash'],
            description: 'The target folder to navigate to.',
          },
        },
        required: ['folder'],
        additionalProperties: false,
      },
      strict: true,
    },
  },

  // ── 2. search_emails ────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'search_emails',
      description:
        'Search or filter the email list. Supports sender, keyword, date range (as a natural language phrase), ' +
        'read status, and starred status. Updates the main mail list. ' +
        'IMPORTANT: For date ranges, pass the user\'s phrase verbatim as datePhrase (e.g. "last 10 days", "this week"). ' +
        'Do NOT compute ISO dates yourself.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Keyword to search in subject, body snippet, or sender name.',
          },
          sender: {
            type: 'string',
            description: 'Filter by sender name or email address.',
          },
          datePhrase: {
            type: 'string',
            description:
              'Natural language date phrase. Supported values: ' +
              '"today", "yesterday", "this week", "last week", ' +
              '"this month", "last month", "last 7 days", "last 10 days", "last 30 days", ' +
              'or "last N days" for any N up to 365.',
          },
          unreadOnly: {
            type: 'boolean',
            description: 'If true, show only unread emails.',
          },
          starredOnly: {
            type: 'boolean',
            description: 'If true, show only starred emails.',
          },
          folder: {
            type: 'string',
            enum: ['inbox', 'sent', 'starred', 'drafts', 'trash'],
            description: 'Folder to search in. Defaults to current folder.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },

  // ── 3. select_email ─────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'select_email',
      description:
        'Find and open an email in the email detail view. ' +
        'The server will search the user\'s mailbox using the provided criteria and open the best match. ' +
        'Use this when the user says "open", "show me", "read", or "find" a specific email.',
      parameters: {
        type: 'object',
        properties: {
          sender: {
            type: 'string',
            description: 'Sender name or email address to search for.',
          },
          keyword: {
            type: 'string',
            description: 'Keyword to match in subject or body.',
          },
          selectLatest: {
            type: 'boolean',
            description: 'If true, select the most recent matching email.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },

  // ── 4. open_compose ─────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'open_compose',
      description:
        'Open the email compose window with optional pre-filled fields. ' +
        'This does NOT send the email — the user must review and click "Confirm Send". ' +
        'Use this when the user wants to write a new email.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'array',
            items: { type: 'string' },
            description: 'Recipient email addresses.',
          },
          cc: {
            type: 'array',
            items: { type: 'string' },
            description: 'CC email addresses.',
          },
          bcc: {
            type: 'array',
            items: { type: 'string' },
            description: 'BCC email addresses.',
          },
          subject: {
            type: 'string',
            description: 'Email subject line.',
          },
          body: {
            type: 'string',
            description: 'Email body text.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },

  // ── 5. prepare_reply ────────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'prepare_reply',
      description:
        'Prepare a reply to the currently open/selected email. ' +
        'Opens the compose window prefilled with reply context (recipient, Re: subject, thread ID). ' +
        'This does NOT send the reply — the user must confirm. ' +
        'Only call this when an email is currently open (check context).',
      parameters: {
        type: 'object',
        properties: {
          additionalNotes: {
            type: 'string',
            description: 'Optional extra text to pre-fill in the reply body.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },

  // ── 6. summarize_email ──────────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'summarize_email',
      description:
        'Summarize the currently open/selected email or thread. ' +
        'Only call this when an email is open (check context). ' +
        'The summary will be based solely on the actual email content from the context.',
      parameters: {
        type: 'object',
        properties: {
          scope: {
            type: 'string',
            enum: ['email', 'thread'],
            description: 'Whether to summarize just the current email or the entire thread.',
          },
        },
        required: [],
        additionalProperties: false,
      },
    },
  },

  // ── 7. propose_send_email ───────────────────────────────────────────────────
  {
    type: 'function',
    function: {
      name: 'propose_send_email',
      description:
        'Propose an email to be sent by pre-filling the compose panel. ' +
        'CRITICAL: This tool NEVER sends email directly. ' +
        'The human must review the compose panel and click "Confirm Send" before anything is sent. ' +
        'Use this when the user provides explicit to/subject/body details for a new email.',
      parameters: {
        type: 'object',
        properties: {
          to: {
            type: 'array',
            items: { type: 'string' },
            description: 'Recipient email addresses.',
          },
          cc: {
            type: 'array',
            items: { type: 'string' },
            description: 'CC email addresses.',
          },
          bcc: {
            type: 'array',
            items: { type: 'string' },
            description: 'BCC email addresses.',
          },
          subject: {
            type: 'string',
            description: 'Email subject line.',
          },
          body: {
            type: 'string',
            description: 'Email body text.',
          },
        },
        required: ['to', 'subject', 'body'],
        additionalProperties: false,
      },
    },
  },
];

/** Allowed tool names — used for server-side validation */
export const VALID_TOOL_NAMES = new Set([
  'navigate_folder',
  'search_emails',
  'select_email',
  'open_compose',
  'prepare_reply',
  'summarize_email',
  'propose_send_email',
] as const);
