/**
 * POST /api/ai/chat
 *
 * Secure server-side AI chat endpoint using Google Gemini API (@google/genai).
 * - Authenticates the user via session cookie
 * - Accepts application context from the client (folder, selected email, filters)
 * - Fetches email detail from Prisma when needed (strictly scoped to userId)
 * - Calls Google Gemini via Gemini adapter with structured function declarations
 * - Validates and resolves tool arguments server-side
 * - Returns { message, action } — never raw LLM response
 *
 * SECURITY: GEMINI_API_KEY is server-only and never sent to the browser.
 * All DB access is scoped to the authenticated userId. AI-generated arguments
 * are validated before returning.
 */

import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { getCurrentUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { VALID_TOOL_NAMES } from '@/lib/ai/tools';
import { buildSystemPrompt } from '@/lib/ai/prompts';
import { resolveDatePhrase } from '@/lib/ai/date-utils';
import { generateAssistantResponse, generateEmailSummary } from '@/lib/ai/gemini-chat';
import type {
  AIChatRequest,
  AIChatResponse,
  AIAction,
  AIContext,
  SearchEmailsArgs,
  OpenComposeArgs,
  NavigateFolderArgs,
  SelectEmailArgs,
  PrepareReplyArgs,
} from '@/lib/ai/types';
import { MailFolder } from '@/lib/gmail/types';

const VALID_FOLDERS = new Set<MailFolder>(['inbox', 'sent', 'starred', 'drafts', 'trash']);

function isValidFolder(f: unknown): f is MailFolder {
  return typeof f === 'string' && VALID_FOLDERS.has(f as MailFolder);
}

function sanitizeStringArray(arr: unknown): string[] {
  if (!Array.isArray(arr)) return [];
  return arr.filter((x): x is string => typeof x === 'string' && x.length > 0);
}

function sanitizeOptionalString(val: unknown): string | undefined {
  return typeof val === 'string' && val.trim().length > 0 ? val.trim() : undefined;
}

/**
 * Validates and sanitizes raw tool arguments parsed from the Gemini response.
 * Never trusts model-generated arguments blindly.
 */
function validateToolArgs(toolName: string, rawArgs: Record<string, unknown>): AIAction | null {
  switch (toolName) {
    case 'navigate_folder': {
      if (!isValidFolder(rawArgs.folder)) return null;
      const args: NavigateFolderArgs = { folder: rawArgs.folder };
      return { type: 'navigate_folder', args };
    }

    case 'search_emails': {
      const args: SearchEmailsArgs = {
        query: sanitizeOptionalString(rawArgs.query),
        sender: sanitizeOptionalString(rawArgs.sender),
        datePhrase: sanitizeOptionalString(rawArgs.datePhrase),
        unreadOnly: rawArgs.unreadOnly === true,
        starredOnly: rawArgs.starredOnly === true,
        folder: isValidFolder(rawArgs.folder) ? rawArgs.folder : undefined,
      };
      // Resolve date phrase server-side
      if (args.datePhrase) {
        const range = resolveDatePhrase(args.datePhrase);
        if (range) {
          args.dateFrom = range.dateFrom;
          args.dateTo = range.dateTo;
        }
      }
      return { type: 'search_emails', args };
    }

    case 'select_email': {
      const args: SelectEmailArgs & { resolvedEmailId: string | null } = {
        sender: sanitizeOptionalString(rawArgs.sender),
        keyword: sanitizeOptionalString(rawArgs.keyword),
        selectLatest: rawArgs.selectLatest === true,
        resolvedEmailId: null, // resolved below in handler
      };
      return { type: 'select_email', args };
    }

    case 'open_compose': {
      const args: OpenComposeArgs = {
        to: sanitizeStringArray(rawArgs.to),
        cc: sanitizeStringArray(rawArgs.cc),
        bcc: sanitizeStringArray(rawArgs.bcc),
        subject: sanitizeOptionalString(rawArgs.subject),
        body: sanitizeOptionalString(rawArgs.body),
      };
      return { type: 'open_compose', args };
    }

    case 'prepare_reply': {
      const args: OpenComposeArgs = {}; // will be filled from context
      const notes = sanitizeOptionalString((rawArgs as PrepareReplyArgs).additionalNotes);
      if (notes) args.body = notes;
      return { type: 'prepare_reply', args };
    }

    case 'summarize_email': {
      return { type: 'summarize_email', args: { scope: rawArgs.scope === 'thread' ? 'thread' : 'email' } };
    }

    case 'propose_send_email': {
      const to = sanitizeStringArray(rawArgs.to);
      if (to.length === 0) return null;
      const subject = sanitizeOptionalString(rawArgs.subject);
      const body = sanitizeOptionalString(rawArgs.body);
      if (!subject || !body) return null;
      const args: OpenComposeArgs = {
        to,
        cc: sanitizeStringArray(rawArgs.cc),
        bcc: sanitizeStringArray(rawArgs.bcc),
        subject,
        body,
      };
      return { type: 'propose_send_email', args };
    }

    default:
      return null;
  }
}

/**
 * Resolves a select_email action by searching Prisma for the best matching email.
 * Strictly scoped to the authenticated userId.
 */
async function resolveSelectEmail(
  args: SelectEmailArgs,
  userId: string
): Promise<{ resolvedEmailId: string | null; message: string }> {
  try {
    const whereClause: Prisma.EmailWhereInput = { userId };

    if (args.sender && !args.keyword) {
      whereClause.OR = [
        { sender: { contains: args.sender, mode: 'insensitive' } },
        { senderEmail: { contains: args.sender, mode: 'insensitive' } },
      ];
    } else if (args.keyword && !args.sender) {
      whereClause.OR = [
        { subject: { contains: args.keyword, mode: 'insensitive' } },
        { snippet: { contains: args.keyword, mode: 'insensitive' } },
      ];
    } else if (args.sender && args.keyword) {
      whereClause.AND = [
        {
          OR: [
            { sender: { contains: args.sender, mode: 'insensitive' } },
            { senderEmail: { contains: args.sender, mode: 'insensitive' } },
          ],
        },
        {
          OR: [
            { subject: { contains: args.keyword, mode: 'insensitive' } },
            { snippet: { contains: args.keyword, mode: 'insensitive' } },
          ],
        },
      ];
    }

    const email = await prisma.email.findFirst({
      where: whereClause,
      orderBy: { receivedAt: 'desc' },
      select: { id: true, sender: true, subject: true },
    });

    if (!email) {
      const desc = [args.sender, args.keyword].filter(Boolean).join(' / ');
      return {
        resolvedEmailId: null,
        message: `I couldn't find an email matching "${desc}" in your mailbox.`,
      };
    }

    return {
      resolvedEmailId: email.id,
      message: `Opening "${email.subject || '(no subject)'}" from ${email.sender}.`,
    };
  } catch {
    return { resolvedEmailId: null, message: 'Failed to search for the email.' };
  }
}

/**
 * Resolves a prepare_reply action using the context of the currently open email.
 */
function buildReplyArgs(context: AIContext, additionalNotes?: string): OpenComposeArgs | null {
  if (
    !context.selectedEmailId ||
    !context.selectedEmailSenderEmail ||
    !context.selectedEmailSubject
  ) {
    return null;
  }

  const rawSubject = context.selectedEmailSubject;
  const replySubject = rawSubject.toLowerCase().startsWith('re:')
    ? rawSubject
    : `Re: ${rawSubject}`;

  const quoteHeader = context.selectedEmailBodyText
    ? `\n\nOn ${new Date().toLocaleDateString()}, ${context.selectedEmailSender || context.selectedEmailSenderEmail} wrote:\n${context.selectedEmailBodyText
        .split('\n')
        .map((l) => `> ${l}`)
        .join('\n')}`
    : '';

  const body = (additionalNotes ? additionalNotes + '\n' : '') + quoteHeader;

  return {
    to: [context.selectedEmailSenderEmail],
    subject: replySubject,
    body,
    threadId: context.selectedEmailProviderThreadId,
    inReplyTo: context.selectedEmailProviderMessageId,
    references: context.selectedEmailProviderMessageId,
  };
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── Authentication ─────────────────────────────────────────────────────────
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized: Please log in to use the AI assistant' },
      { status: 401 }
    );
  }

  // ── Parse request body ─────────────────────────────────────────────────────
  let body: AIChatRequest;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'Bad Request: Invalid JSON payload' },
      { status: 400 }
    );
  }

  const { message, context } = body;

  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return NextResponse.json(
      { error: 'Bad Request: message is required' },
      { status: 400 }
    );
  }

  if (message.length > 2000) {
    return NextResponse.json(
      { error: 'Bad Request: message exceeds maximum length of 2000 characters' },
      { status: 400 }
    );
  }

  // ── Enrich context with email detail from DB (server-side, scoped to userId) ─
  const enrichedContext: AIContext = { ...context };

  if (context?.selectedEmailId) {
    try {
      const dbEmail = await prisma.email.findFirst({
        where: {
          id: context.selectedEmailId,
          userId: user.id, // CRITICAL: scope to authenticated user
        },
        select: {
          sender: true,
          senderEmail: true,
          subject: true,
          snippet: true,
          bodyText: true,
          providerThreadId: true,
          providerMessageId: true,
        },
      });

      if (dbEmail) {
        enrichedContext.selectedEmailSender = dbEmail.sender;
        enrichedContext.selectedEmailSenderEmail = dbEmail.senderEmail;
        enrichedContext.selectedEmailSubject = dbEmail.subject;
        enrichedContext.selectedEmailSnippet = dbEmail.snippet ?? undefined;
        enrichedContext.selectedEmailProviderThreadId = dbEmail.providerThreadId;
        enrichedContext.selectedEmailProviderMessageId = dbEmail.providerMessageId;
        // Truncate body to avoid token bloat; keep it server-side safe
        if (dbEmail.bodyText) {
          enrichedContext.selectedEmailBodyText = dbEmail.bodyText.slice(0, 1500);
        }
      }
    } catch {
      // Non-fatal — context is still useful without the body
    }
  }

  enrichedContext.userEmail = user.email;
  enrichedContext.userName = user.name || undefined;

  // ── Build system prompt ────────────────────────────────────────────────────
  const systemPrompt = buildSystemPrompt(enrichedContext);

  // ── Call Gemini via Adapter ────────────────────────────────────────────────
  try {
    const geminiResult = await generateAssistantResponse({
      message: message.trim(),
      systemPrompt,
    });

    // ── Text-only response (no tool call) ────────────────────────────────────
    if (!geminiResult.functionCalls || geminiResult.functionCalls.length === 0) {
      const textContent =
        geminiResult.text?.trim() ||
        'I can help with that. Please provide more details.';
      return NextResponse.json<AIChatResponse>({
        message: textContent,
        action: null,
      });
    }

    // ── Tool call response ────────────────────────────────────────────────────
    const toolCall = geminiResult.functionCalls[0];
    const toolName = toolCall.name;

    // Reject unknown tool names
    if (!VALID_TOOL_NAMES.has(toolName as Parameters<typeof VALID_TOOL_NAMES.has>[0])) {
      console.warn('[AI Chat] Model called unknown tool:', toolName);
      return NextResponse.json<AIChatResponse>({
        message: 'The AI attempted an invalid action. Please try rephrasing your request.',
        action: null,
      });
    }

    // Parse and validate tool arguments
    let rawArgs: Record<string, unknown>;
    try {
      rawArgs =
        typeof toolCall.args === 'string'
          ? JSON.parse(toolCall.args)
          : (toolCall.args || {});
    } catch {
      return NextResponse.json<AIChatResponse>({
        message: 'The AI returned malformed arguments. Please try again.',
        action: null,
      });
    }

    const validatedAction = validateToolArgs(toolName, rawArgs);
    if (!validatedAction) {
      return NextResponse.json<AIChatResponse>({
        message: 'The AI returned invalid arguments. Please try rephrasing your request.',
        action: null,
      });
    }

    // ── Tool-specific server-side resolution ──────────────────────────────────

    // select_email: resolve matching email from Prisma
    if (validatedAction.type === 'select_email') {
      const { resolvedEmailId, message: resolveMsg } = await resolveSelectEmail(
        validatedAction.args,
        user.id
      );
      validatedAction.args.resolvedEmailId = resolvedEmailId;

      if (!resolvedEmailId) {
        return NextResponse.json<AIChatResponse>({
          message: resolveMsg,
          action: validatedAction,
        });
      }

      return NextResponse.json<AIChatResponse>({
        message: resolveMsg,
        action: validatedAction,
      });
    }

    // prepare_reply: build reply draft from email context
    if (validatedAction.type === 'prepare_reply') {
      if (!enrichedContext.selectedEmailId || !enrichedContext.selectedEmailSenderEmail) {
        return NextResponse.json<AIChatResponse>({
          message: 'Please open an email first before asking me to reply.',
          action: null,
        });
      }

      const notes = (rawArgs as { additionalNotes?: string }).additionalNotes;
      const replyArgs = buildReplyArgs(enrichedContext, notes);
      if (!replyArgs) {
        return NextResponse.json<AIChatResponse>({
          message: 'I need an open email to prepare a reply. Please select an email first.',
          action: null,
        });
      }

      return NextResponse.json<AIChatResponse>({
        message: `Reply compose opened for "${enrichedContext.selectedEmailSubject}". Review before sending.`,
        action: { type: 'prepare_reply', args: replyArgs },
      });
    }

    // summarize_email: model provides summary as text; no store action needed
    if (validatedAction.type === 'summarize_email') {
      if (!enrichedContext.selectedEmailId) {
        return NextResponse.json<AIChatResponse>({
          message: 'Please open an email first so I can summarize it.',
          action: null,
        });
      }

      const summary = await generateEmailSummary({
        prompt:
          'Please provide a concise 3-5 sentence summary of the currently open email described in the context. Focus on key information, action items, and tone. Do not invent any information not present in the context.',
        systemPrompt,
      });

      return NextResponse.json<AIChatResponse>({
        message: summary,
        action: validatedAction,
      });
    }

    // For all other actions, generate a friendly confirmation message
    const confirmationMessages: Record<string, string> = {
      navigate_folder: `Navigating to your ${(rawArgs.folder as string) || 'mailbox'}…`,
      search_emails: buildSearchMessage(validatedAction.args as SearchEmailsArgs),
      open_compose: buildComposeMessage(validatedAction.args as OpenComposeArgs),
      propose_send_email: `Compose opened — review your email and click Confirm Send when ready.`,
    };

    const responseMessage =
      geminiResult.text?.trim() ||
      confirmationMessages[toolName] ||
      'Done.';

    return NextResponse.json<AIChatResponse>({
      message: responseMessage,
      action: validatedAction,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown AI error';
    console.error('[AI Chat Error]', msg);

    if (msg.includes('GEMINI_API_KEY')) {
      return NextResponse.json(
        {
          error: 'AI Assistant configuration error: GEMINI_API_KEY is not configured.',
        },
        { status: 500 }
      );
    }

    // Never expose stack traces or internal errors
    return NextResponse.json(
      {
        error: 'The AI assistant is temporarily unavailable. Please try again.',
      },
      { status: 500 }
    );
  }
}

// ── Helper message builders ───────────────────────────────────────────────────

function buildSearchMessage(args: SearchEmailsArgs): string {
  const parts: string[] = [];
  if (args.sender) parts.push(`from ${args.sender}`);
  if (args.query) parts.push(`matching "${args.query}"`);
  if (args.datePhrase) parts.push(`from ${args.datePhrase}`);
  if (args.unreadOnly) parts.push('unread');
  if (args.starredOnly) parts.push('starred');
  if (parts.length === 0) return 'Refreshing your email list…';
  return `Searching for emails ${parts.join(', ')}…`;
}

function buildComposeMessage(args: OpenComposeArgs): string {
  const to = args.to?.join(', ');
  if (to) return `Compose opened. To: ${to} — review before sending.`;
  return 'Compose opened. Fill in the details and click Send when ready.';
}
