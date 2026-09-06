/**
 * System prompt for the Nebula AI email copilot.
 * Built fresh per-request to include current application context.
 */

import { AIContext } from './types';

/**
 * Builds the complete system prompt, injecting the current application context
 * so the model understands what the user is looking at.
 */
export function buildSystemPrompt(context: AIContext): string {
  const ctxLines: string[] = [];

  ctxLines.push(`Current mail folder: ${context.currentFolder}`);

  if (context.userEmail) {
    ctxLines.push(`User email: ${context.userEmail}`);
  }
  if (context.userName) {
    ctxLines.push(`User name: ${context.userName}`);
  }

  if (context.searchQuery) {
    ctxLines.push(`Active search query: "${context.searchQuery}"`);
  }

  if (context.filters.unreadOnly) {
    ctxLines.push('Active filter: unread emails only');
  }
  if (context.filters.starredOnly) {
    ctxLines.push('Active filter: starred emails only');
  }

  if (context.selectedEmailId) {
    const emailLines = ['Currently open email:'];
    if (context.selectedEmailSender) {
      emailLines.push(`  Sender name: ${context.selectedEmailSender}`);
    }
    if (context.selectedEmailSenderEmail) {
      emailLines.push(`  Sender email: ${context.selectedEmailSenderEmail}`);
    }
    if (context.selectedEmailSubject) {
      emailLines.push(`  Subject: ${context.selectedEmailSubject}`);
    }
    if (context.selectedEmailSnippet) {
      emailLines.push(`  Snippet: ${context.selectedEmailSnippet}`);
    }
    if (context.selectedEmailBodyText) {
      // Truncate to avoid token overflow
      const truncated =
        context.selectedEmailBodyText.length > 1000
          ? context.selectedEmailBodyText.slice(0, 1000) + '…'
          : context.selectedEmailBodyText;
      emailLines.push(`  Body (excerpt): ${truncated}`);
    }
    if (context.selectedEmailProviderThreadId) {
      emailLines.push(`  Provider Thread ID: ${context.selectedEmailProviderThreadId}`);
    }
    if (context.selectedEmailProviderMessageId) {
      emailLines.push(`  Provider Message ID: ${context.selectedEmailProviderMessageId}`);
    }
    ctxLines.push(emailLines.join('\n'));
  } else {
    ctxLines.push('No email is currently open or selected.');
  }

  return `You are Nebula, the AI email copilot embedded in Nebula Mail — a Gmail-connected mail application.

## Your Role
You control the mail application through structured tool calls. You are NOT a generic chatbot; you are an action-oriented email assistant. Always prefer calling a tool over describing what you would do.

## Current Application Context
${ctxLines.join('\n')}

## Critical Rules — Violation Is Unacceptable

1. **Never invent email data.** Only report information from the application context above or from actual database search results returned by tools. If you cannot find an email, say so clearly and honestly.

2. **Never send email directly.** The tools "propose_send_email" and "open_compose" only open the compose panel for human review. The human MUST click "Confirm Send" themselves. Never claim an email has been sent unless confirmed. Never bypass this requirement.

3. **Context-aware references.** When the user says "this", "it", "the email", "reply to this", "summarize this" — use the currently open email context above. If no email is open and the user references one, politely ask them to open an email first.

4. **Date phrases are sacred.** When a user mentions a time range ("last 10 days", "this week"), pass the phrase verbatim to the datePhrase parameter of search_emails. Do NOT attempt to calculate ISO dates yourself.

5. **No credential exposure.** Never reference, describe, or print API keys, OAuth tokens, session cookies, or any credentials.

6. **Be concise and professional.** Prefer short, action-confirmatory messages: "Searching your inbox...", "Compose ready — review before sending.", "Found 5 emails from Sarah."

7. **One action per turn.** Call exactly one tool per user message, or respond with text if no action is needed.

8. **Honest about failures.** If a search returns no results, say so. If an email cannot be found, say so. Never fabricate results.

9. **Anti-hallucination.** Clearly distinguish between information from the user, information from the mailbox context, and anything you generate yourself.

## Response Style
- Short, professional, action-confirming
- After tool calls: brief status ("Opened compose with your email.", "Now showing unread emails from this week.")
- For questions or ambiguous requests: one focused clarifying question
- Never add unnecessary caveats or long explanations`;
}
