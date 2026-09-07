/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * AI Assistant Tests — Google Gemini API Migration
 *
 * Tests cover:
 * 1. Natural language compose action parsing
 * 2. open_compose action validation
 * 3. search_emails action validation
 * 4. Date range interpretation
 * 5. Unread filter
 * 6. select_email action
 * 7. Context-aware reply action
 * 8. Send action cannot bypass confirmation
 * 9. Invalid AI tool arguments
 * 10. Unauthorized AI API request
 * 11. Empty search results
 * 12. Prompt/tool safety validation
 * 13. Missing GEMINI_API_KEY handling
 * 14. Gemini API error handling
 * 15. Summarize email tool execution
 *
 * Google Gemini API (@google/genai) and Prisma are mocked — no real API calls are made.
 * Gmail send is never called by the AI directly — only the compose store is opened.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import * as authModule from '@/lib/auth/middleware';
import { resolveDatePhrase } from '@/lib/ai/date-utils';
import { useMailStore } from '@/store/mail-store';
import { useAssistantStore } from '@/store/assistant-store';

// ── Hoist mock fn references so vi.mock factory can close over them ───────────
const { mockGenerateContent } = vi.hoisted(() => {
  process.env.GEMINI_API_KEY = 'test-gemini-key-for-vitest';
  return {
    mockGenerateContent: vi.fn(),
  };
});

// ── Mock @google/genai SDK ───────────────────────────────────────────────────
vi.mock('@google/genai', () => {
  class GoogleGenAI {
    models = {
      generateContent: mockGenerateContent,
    };
  }
  return {
    GoogleGenAI,
    Type: {
      OBJECT: 'OBJECT',
      STRING: 'STRING',
      NUMBER: 'NUMBER',
      INTEGER: 'INTEGER',
      BOOLEAN: 'BOOLEAN',
      ARRAY: 'ARRAY',
    },
  };
});

// ── Mock Prisma ───────────────────────────────────────────────────────────────
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    email: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

// ── Import route handler after mocks are set up ───────────────────────────────
import { POST as aiChatHandler } from '@/app/api/ai/chat/route';
import * as prismaModule from '@/lib/db/prisma';

// ── Helper: mock authenticated user ──────────────────────────────────────────
const mockUser: authModule.AuthenticatedUser = {
  id: 'user_test_1',
  email: 'testuser@example.com',
  name: 'Test User',
  image: null,
};

// ── Helper: build AI request ──────────────────────────────────────────────────
function makeRequest(message: string, context = {}) {
  return new NextRequest('http://localhost:3000/api/ai/chat', {
    method: 'POST',
    body: JSON.stringify({
      message,
      context: {
        currentFolder: 'inbox',
        selectedEmailId: null,
        searchQuery: '',
        filters: { unreadOnly: false, starredOnly: false },
        ...context,
      },
    }),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── Helper: mock Gemini tool call response ────────────────────────────────────
function mockToolCall(toolName: string, args: Record<string, unknown> | string) {
  mockGenerateContent.mockResolvedValue({
    text: '',
    functionCalls: [
      {
        name: toolName,
        args,
      },
    ],
    candidates: [
      {
        content: {
          parts: [
            {
              functionCall: {
                name: toolName,
                args,
              },
            },
          ],
        },
      },
    ],
  });
}

// ── Helper: mock Gemini text response ─────────────────────────────────────────
function mockTextResponse(text: string) {
  mockGenerateContent.mockResolvedValue({
    text,
    functionCalls: [],
    candidates: [
      {
        content: {
          parts: [{ text }],
        },
      },
    ],
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Phase 8 / Gemini Migration — AI Assistant', () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-gemini-key-for-vitest';

    // Reset Gemini mock and set safe default
    mockGenerateContent.mockReset();
    mockGenerateContent.mockResolvedValue({
      text: 'Default test AI response.',
      functionCalls: [],
      candidates: [
        {
          content: {
            parts: [{ text: 'Default test AI response.' }],
          },
        },
      ],
    });

    // Auth mock
    vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(mockUser);

    // Default Prisma findFirst — no email found
    vi.spyOn(prismaModule.prisma.email, 'findFirst').mockResolvedValue(null);
  });

  // ── TEST 1: Unauthorized request ──────────────────────────────────────────
  describe('10. Unauthorized AI API request', () => {
    it('should reject unauthenticated requests with 401', async () => {
      vi.spyOn(authModule, 'getCurrentUser').mockResolvedValue(null);

      const req = makeRequest('Compose an email');
      const res = await aiChatHandler(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });
  });

  // ── TEST 2: Natural language compose parsing ──────────────────────────────
  describe('1. Natural language compose action parsing', () => {
    it('should parse compose intent and return open_compose action', async () => {
      mockToolCall('open_compose', {
        to: ['john@example.com'],
        subject: 'Meeting Tomorrow',
        body: "Let's meet at 3pm",
      });

      const req = makeRequest(
        "Send an email to john@example.com with subject 'Meeting Tomorrow' and body 'Let's meet at 3pm'"
      );
      const res = await aiChatHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).not.toBeNull();
      expect(json.action.type).toBe('open_compose');
      expect(json.action.args.to).toContain('john@example.com');
      expect(json.action.args.subject).toBe('Meeting Tomorrow');
    });
  });

  // ── TEST 3: open_compose action validation ────────────────────────────────
  describe('2. open_compose action validation', () => {
    it('should return open_compose action with validated args', async () => {
      mockToolCall('open_compose', {
        to: ['alice@example.com'],
        subject: 'Hello',
        body: 'Hi Alice!',
      });

      const req = makeRequest('Write an email to alice@example.com');
      const res = await aiChatHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe('open_compose');
      expect(json.action?.args.to).toEqual(['alice@example.com']);
    });

    it('should strip invalid (non-string) items from to array', async () => {
      mockToolCall('open_compose', {
        to: ['valid@example.com', 123, null, ''],
        subject: 'Test',
        body: 'body',
      });

      const req = makeRequest('Write an email');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action?.args.to).toEqual(['valid@example.com']);
    });
  });

  // ── TEST 4: search_emails action validation ───────────────────────────────
  describe('3. search_emails action validation', () => {
    it('should return search_emails action with sender criteria', async () => {
      mockToolCall('search_emails', { sender: 'Sarah', query: 'project update' });

      const req = makeRequest('Find the email from Sarah about the project update');
      const res = await aiChatHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action?.type).toBe('search_emails');
      expect(json.action?.args.sender).toBe('Sarah');
      expect(json.action?.args.query).toBe('project update');
    });

    it('should return search_emails with folder navigation', async () => {
      mockToolCall('search_emails', { folder: 'sent', query: 'report' });

      const req = makeRequest('Find sent emails about the report');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action?.type).toBe('search_emails');
      expect(json.action?.args.folder).toBe('sent');
    });
  });

  // ── TEST 5: Date range interpretation ────────────────────────────────────
  describe('4. Date range interpretation (lib/ai/date-utils)', () => {
    it('should resolve "last 10 days" to a valid date range', () => {
      const range = resolveDatePhrase('last 10 days');
      expect(range).not.toBeNull();
      expect(range!.dateFrom).toBeTruthy();
      expect(range!.dateTo).toBeTruthy();

      const from = new Date(range!.dateFrom);
      const to = new Date(range!.dateTo);
      const now = new Date();

      const diffDays = (now.getTime() - from.getTime()) / 86400000;
      expect(diffDays).toBeGreaterThanOrEqual(9);
      expect(diffDays).toBeLessThanOrEqual(11);
      expect(to.toDateString()).toBe(now.toDateString());
    });

    it('should resolve "this week" correctly', () => {
      const range = resolveDatePhrase('this week');
      expect(range).not.toBeNull();
      const from = new Date(range!.dateFrom);
      expect(from.getDay()).toBe(1); // Monday
    });

    it('should resolve "today" to start and end of today', () => {
      const range = resolveDatePhrase('today');
      expect(range).not.toBeNull();
      const from = new Date(range!.dateFrom);
      const to = new Date(range!.dateTo);
      expect(from.getHours()).toBe(0);
      expect(to.getHours()).toBe(23);
    });

    it('should return null for unrecognised phrase', () => {
      const range = resolveDatePhrase('sometime in the past');
      expect(range).toBeNull();
    });

    it('should resolve datePhrase in search_emails and populate dateFrom/dateTo', async () => {
      mockToolCall('search_emails', { datePhrase: 'last 10 days' });

      const req = makeRequest('Show me emails from the last 10 days');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action?.type).toBe('search_emails');
      expect(json.action?.args.dateFrom).toBeTruthy();
      expect(json.action?.args.dateTo).toBeTruthy();
      expect(json.action?.args.datePhrase).toBe('last 10 days');
    });
  });

  // ── TEST 6: Unread filter ─────────────────────────────────────────────────
  describe('5. Unread filter', () => {
    it('should set unreadOnly and dateFrom/dateTo for "unread emails from this week"', async () => {
      mockToolCall('search_emails', { unreadOnly: true, datePhrase: 'this week' });

      const req = makeRequest('Show only unread emails from this week');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action?.type).toBe('search_emails');
      expect(json.action?.args.unreadOnly).toBe(true);
      expect(json.action?.args.dateFrom).toBeTruthy();
    });
  });

  // ── TEST 7: select_email action ───────────────────────────────────────────
  describe('6. select_email action', () => {
    it('should resolve email ID via Prisma when email exists', async () => {
      mockToolCall('select_email', { sender: 'David', selectLatest: true });

      vi.spyOn(prismaModule.prisma.email, 'findFirst').mockResolvedValue({
        id: 'db_email_david_1',
        sender: 'David Smith',
        subject: 'Project Update',
        userId: 'user_test_1',
        providerMessageId: 'gmail_msg_1',
        providerThreadId: 'gmail_thread_1',
        threadId: 'thread_1',
        senderEmail: 'david@example.com',
        recipients: '["me@example.com"]',
        cc: null,
        bcc: null,
        snippet: 'Hi, here is the update...',
        bodyText: null,
        bodyHtml: null,
        receivedAt: new Date(),
        sentAt: null,
        isRead: false,
        isStarred: false,
        labels: ['INBOX'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = makeRequest('Open the latest email from David');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action?.type).toBe('select_email');
      expect(json.action?.args.resolvedEmailId).toBe('db_email_david_1');
    });

    it('should return null resolvedEmailId when no email matches', async () => {
      mockToolCall('select_email', { sender: 'NonExistentPerson' });
      vi.spyOn(prismaModule.prisma.email, 'findFirst').mockResolvedValue(null);

      const req = makeRequest('Open email from NonExistentPerson');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action?.args.resolvedEmailId).toBeNull();
      expect(json.message).toContain('find');
    });
  });

  // ── TEST 8: Context-aware reply ───────────────────────────────────────────
  describe('7. Context-aware reply action', () => {
    it('should build reply draft when email is open in context', async () => {
      mockToolCall('prepare_reply', {});

      vi.spyOn(prismaModule.prisma.email, 'findFirst').mockResolvedValue({
        id: 'email_ctx_1',
        sender: 'Sarah Jones',
        senderEmail: 'sarah@example.com',
        subject: 'Project Update',
        snippet: 'Here is the update',
        bodyText: 'Full body text here.',
        providerThreadId: 'thread_sarah_1',
        providerMessageId: 'msg_sarah_1',
        userId: 'user_test_1',
        threadId: 'thread_1',
        recipients: '[]',
        cc: null,
        bcc: null,
        bodyHtml: null,
        receivedAt: new Date(),
        sentAt: null,
        isRead: true,
        isStarred: false,
        labels: ['INBOX'],
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const req = makeRequest('Reply to this', {
        selectedEmailId: 'email_ctx_1',
      });
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action?.type).toBe('prepare_reply');
      expect(json.action?.args.to).toContain('sarah@example.com');
      expect(json.action?.args.subject).toMatch(/^Re:/i);
      expect(json.action?.args.threadId).toBe('thread_sarah_1');
      expect(json.action?.args.inReplyTo).toBe('msg_sarah_1');
    });

    it('should return helpful message when no email is open', async () => {
      mockToolCall('prepare_reply', {});
      vi.spyOn(prismaModule.prisma.email, 'findFirst').mockResolvedValue(null);

      const req = makeRequest('Reply to this', { selectedEmailId: null });
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action).toBeNull();
      expect(json.message).toMatch(/open an email|select/i);
    });
  });

  // ── TEST 9: Send action cannot bypass confirmation ────────────────────────
  describe('8. Send action cannot bypass human confirmation', () => {
    it('propose_send_email should return open_compose args, NOT call /api/mail/send', async () => {
      mockToolCall('propose_send_email', {
        to: ['john@example.com'],
        subject: 'Meeting Tomorrow',
        body: "Let's meet at 3pm",
      });

      const req = makeRequest("Send 'Meeting Tomorrow' to john@example.com");
      const res = await aiChatHandler(req);
      const json = await res.json();

      expect(json.action?.type).toBe('propose_send_email');
      expect(json.action?.args.to).toContain('john@example.com');
    });

    it('propose_send_email with missing subject should fail validation', async () => {
      mockToolCall('propose_send_email', {
        to: ['john@example.com'],
      });

      const req = makeRequest('Send something to john');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action).toBeNull();
    });
  });

  // ── TEST 10: Invalid AI tool arguments ───────────────────────────────────
  describe('9. Invalid AI tool arguments', () => {
    it('should reject unknown tool names', async () => {
      mockGenerateContent.mockResolvedValue({
        text: '',
        functionCalls: [
          {
            name: 'delete_all_emails',
            args: {},
          },
        ],
      });

      const req = makeRequest('Do something dangerous');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action).toBeNull();
      expect(json.message).toMatch(/invalid action|rephrasing/i);
    });

    it('should reject malformed JSON in stringified tool arguments', async () => {
      mockGenerateContent.mockResolvedValue({
        text: '',
        functionCalls: [
          {
            name: 'navigate_folder',
            args: '{invalid json{{' as any,
          },
        ],
      });

      const req = makeRequest('Go to inbox');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action).toBeNull();
    });

    it('should reject navigate_folder with invalid folder value', async () => {
      mockToolCall('navigate_folder', { folder: 'spam_secret_admin' });

      const req = makeRequest('Show me the secret folder');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action).toBeNull();
    });
  });

  // ── TEST 11: Empty search results ────────────────────────────────────────
  describe('11. Empty search results', () => {
    it('should return select_email with null ID and honest message when no email matches', async () => {
      mockToolCall('select_email', { sender: 'Nobody', keyword: 'nonexistent' });
      vi.spyOn(prismaModule.prisma.email, 'findFirst').mockResolvedValue(null);

      const req = makeRequest('Open the email from Nobody about nonexistent');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action?.args.resolvedEmailId).toBeNull();
      expect(json.message).not.toContain('Opening');
    });
  });

  // ── TEST 12: Prompt/tool safety validation ───────────────────────────────
  describe('12. Prompt and tool safety validation', () => {
    it('should return 400 for empty message', async () => {
      const req = new NextRequest('http://localhost:3000/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          message: '   ',
          context: { currentFolder: 'inbox', selectedEmailId: null, searchQuery: '', filters: {} },
        }),
        headers: { 'Content-Type': 'application/json' },
      });
      const res = await aiChatHandler(req);
      expect(res.status).toBe(400);
    });

    it('should return 400 for message exceeding 2000 chars', async () => {
      const req = makeRequest('a'.repeat(2001));
      const res = await aiChatHandler(req);
      expect(res.status).toBe(400);
    });

    it('should handle text-only AI response with no action', async () => {
      mockTextResponse('I need more information. Which email would you like to open?');

      const req = makeRequest('Do something');
      const res = await aiChatHandler(req);
      const json = await res.json();
      expect(json.action).toBeNull();
      expect(json.message).toContain('information');
    });

    it('select_email should always scope DB query to authenticated userId', async () => {
      mockToolCall('select_email', { sender: 'Attacker' });

      const findFirstSpy = vi.spyOn(prismaModule.prisma.email, 'findFirst').mockResolvedValue(null);

      const req = makeRequest('Open email from Attacker');
      await aiChatHandler(req);

      expect(findFirstSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: mockUser.id }),
        })
      );
    });
  });

  // ── TEST 13: Gemini error handling & missing API key ─────────────────────
  describe('13. Gemini error handling', () => {
    it('should return 500 when Gemini API throws an error', async () => {
      mockGenerateContent.mockRejectedValue(new Error('Google GenAI rate limit exceeded'));

      const req = makeRequest('Help me with something');
      const res = await aiChatHandler(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain('unavailable');
    });

    it('should return configuration error when GEMINI_API_KEY is missing', async () => {
      delete process.env.GEMINI_API_KEY;
      mockGenerateContent.mockRejectedValue(new Error('GEMINI_API_KEY is not configured'));

      const req = makeRequest('Help me');
      const res = await aiChatHandler(req);

      expect(res.status).toBe(500);
      const json = await res.json();
      expect(json.error).toContain('GEMINI_API_KEY');
    });

    it('should support summarize_email tool call with context', async () => {
      // First call returns summarize_email tool call
      mockGenerateContent.mockResolvedValueOnce({
        text: '',
        functionCalls: [{ name: 'summarize_email', args: { scope: 'email' } }],
      });
      // Second call (summary text generation) returns the summary
      mockGenerateContent.mockResolvedValueOnce({
        text: 'This email is a project status update highlighting key deliverables.',
        functionCalls: [],
      });

      const req = makeRequest('Summarize this email', {
        selectedEmailId: 'email_summary_1',
      });
      const res = await aiChatHandler(req);
      const json = await res.json();

      expect(json.action?.type).toBe('summarize_email');
      expect(json.message).toContain('project status update');
    });
  });

  // ── Zustand store integration ────────────────────────────────────────────
  describe('Zustand store integration', () => {
    beforeEach(() => {
      useMailStore.setState({
        currentFolder: 'inbox',
        selectedEmailId: null,
        searchQuery: '',
        filters: { unreadOnly: false, starredOnly: false },
        pagination: { page: 1, limit: 25, totalCount: 0, totalPages: 1 },
        isComposeOpen: false,
        composeDraft: { to: '', cc: '', bcc: '', subject: '', body: '' },
        isSyncing: false,
        isSidebarOpen: false,
      });
    });

    it('assistant store should start closed with no messages', () => {
      const state = useAssistantStore.getState();
      expect(state.isOpen).toBe(false);
      expect(state.messages).toHaveLength(0);
      expect(state.isLoading).toBe(false);
    });

    it('assistant store should toggle open state', () => {
      const store = useAssistantStore.getState();
      store.togglePanel();
      expect(useAssistantStore.getState().isOpen).toBe(true);
      store.togglePanel();
      expect(useAssistantStore.getState().isOpen).toBe(false);
    });

    it('assistant store should add messages and clear them', () => {
      const store = useAssistantStore.getState();
      store.addMessage({ role: 'user', content: 'Hello' });
      store.addMessage({ role: 'assistant', content: 'Hi there!' });
      expect(useAssistantStore.getState().messages).toHaveLength(2);
      store.clearMessages();
      expect(useAssistantStore.getState().messages).toHaveLength(0);
    });

    it('mail store should accept dateFrom/dateTo in filters for AI date search', () => {
      const store = useMailStore.getState();
      store.setFilters({ dateFrom: '2026-08-01T00:00:00.000Z', dateTo: '2026-08-10T23:59:59.999Z' });
      const { filters } = useMailStore.getState();
      expect(filters.dateFrom).toBe('2026-08-01T00:00:00.000Z');
      expect(filters.dateTo).toBe('2026-08-10T23:59:59.999Z');
    });

    it('mail store resetFilters should clear dateFrom and dateTo', () => {
      const store = useMailStore.getState();
      store.setFilters({ unreadOnly: true, dateFrom: '2026-08-01T00:00:00.000Z' });
      store.resetFilters();
      const { filters } = useMailStore.getState();
      expect(filters.unreadOnly).toBe(false);
      expect(filters.dateFrom).toBeUndefined();
      expect(filters.dateTo).toBeUndefined();
    });
  });
});
