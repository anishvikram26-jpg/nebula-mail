'use client';

/**
 * Client-side AI action dispatcher.
 *
 * Translates structured AIAction objects returned by /api/ai/chat into
 * the appropriate useMailStore() calls. This is the ONLY place where AI
 * actions touch the Zustand store — there is no parallel mail state.
 *
 * The human-confirmation flow is preserved for all compose/send actions:
 * the AI calls openCompose() with prefilled data, and the existing
 * ComposeModal + SendConfirmation components handle the rest.
 */

import { useCallback } from 'react';
import { useMailStore } from '@/store/mail-store';
import type { AIAction, OpenComposeArgs } from '@/lib/ai/types';
import type { MailFolder } from '@/lib/gmail/types';

export function useActionDispatcher() {
  const {
    setFolder,
    selectEmail,
    setSearchQuery,
    setFilters,
    resetFilters,
    openCompose,
  } = useMailStore();

  const dispatch = useCallback(
    (action: AIAction): void => {
      switch (action.type) {
        // ── 1. Navigate to a folder ──────────────────────────────────────────
        case 'navigate_folder': {
          setFolder(action.args.folder as MailFolder);
          break;
        }

        // ── 2. Search / filter emails ────────────────────────────────────────
        case 'search_emails': {
          const { args } = action;

          // Navigate to target folder first, if specified
          if (args.folder) {
            setFolder(args.folder as MailFolder);
          }

          // Build combined search query from query and sender
          const queryParts: string[] = [];
          if (args.query) queryParts.push(args.query);
          if (args.sender) queryParts.push(args.sender);
          const searchString = queryParts.join(' ');

          // Reset first, then apply — ensures clean state
          resetFilters();

          if (searchString) {
            setSearchQuery(searchString);
          }

          // Apply filters (unread, starred, date range)
          const newFilters: {
            unreadOnly?: boolean;
            starredOnly?: boolean;
            dateFrom?: string;
            dateTo?: string;
          } = {};

          if (args.unreadOnly) newFilters.unreadOnly = true;
          if (args.starredOnly) newFilters.starredOnly = true;
          if (args.dateFrom) newFilters.dateFrom = args.dateFrom;
          if (args.dateTo) newFilters.dateTo = args.dateTo;

          if (Object.keys(newFilters).length > 0) {
            setFilters(newFilters);
          }
          break;
        }

        // ── 3. Select / open an email ────────────────────────────────────────
        case 'select_email': {
          const { resolvedEmailId } = action.args;
          if (resolvedEmailId) {
            selectEmail(resolvedEmailId);
          }
          break;
        }

        // ── 4. Open compose modal ────────────────────────────────────────────
        case 'open_compose': {
          openCompose(buildComposeDraft(action.args));
          break;
        }

        // ── 5. Prepare reply (uses existing compose infrastructure) ──────────
        case 'prepare_reply': {
          openCompose(buildComposeDraft(action.args));
          break;
        }

        // ── 6. Summarize email — no store action needed (text-only response) ─
        case 'summarize_email': {
          // The AI response message contains the summary text.
          // Nothing to dispatch to the store.
          break;
        }

        // ── 7. Propose send — opens compose with pre-filled data ─────────────
        // CRITICAL: This does NOT send the email. The user must click
        // "Confirm Send" in the existing ComposeModal/SendConfirmation.
        case 'propose_send_email': {
          openCompose(buildComposeDraft(action.args));
          break;
        }
      }
    },
    [setFolder, selectEmail, setSearchQuery, setFilters, resetFilters, openCompose]
  );

  return { dispatch };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildComposeDraft(args: OpenComposeArgs) {
  return {
    to: (args.to ?? []).join(', '),
    cc: (args.cc ?? []).join(', '),
    bcc: (args.bcc ?? []).join(', '),
    subject: args.subject ?? '',
    body: args.body ?? '',
    threadId: args.threadId,
    inReplyTo: args.inReplyTo,
    references: args.references,
  };
}
