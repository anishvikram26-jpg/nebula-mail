'use client';

/**
 * AssistantPanel — AI Copilot sidebar panel.
 *
 * Right-side panel on desktop, full-width drawer on mobile.
 * Integrates with:
 *   - useAssistantStore  → messages, loading, open state
 *   - useMailStore       → reads current context for AI requests
 *   - useActionDispatcher → dispatches AI actions back to mail store
 */

import React, { useEffect, useRef } from 'react';
import {
  Bot,
  X,
  Sparkles,
  Trash2,
  ChevronRight,
} from 'lucide-react';
import { useAssistantStore } from '@/store/assistant-store';
import { useMailStore } from '@/store/mail-store';
import { AssistantMessageBubble } from './assistant-message';
import { AssistantInput } from './assistant-input';
import { useActionDispatcher } from './action-dispatcher';
import type { AIContext, AIChatResponse } from '@/lib/ai/types';

// ── Suggestion chips ──────────────────────────────────────────────────────────
const SUGGESTIONS = [
  'Show unread emails from this week',
  'Find emails from the last 10 days',
  'Open the latest email',
  'Show starred emails',
];

export function AssistantPanel() {
  const { isOpen, messages, isLoading, togglePanel, closePanel, addMessage, setLoading, clearMessages } =
    useAssistantStore();
  const {
    currentFolder,
    selectedEmailId,
    searchQuery,
    filters,
  } = useMailStore();
  const { dispatch } = useActionDispatcher();

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to newest message
  useEffect(() => {
    if (isOpen && messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  // Build context from current Zustand state
  function buildContext(): AIContext {
    return {
      currentFolder,
      selectedEmailId,
      searchQuery,
      filters: {
        unreadOnly: filters.unreadOnly,
        starredOnly: filters.starredOnly,
      },
    };
  }

  const handleSend = async (userMessage: string) => {
    if (isLoading) return;

    // Add user message to conversation
    addMessage({ role: 'user', content: userMessage });
    setLoading(true);

    try {
      const context = buildContext();

      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, context }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(
          errorData.error || `Request failed (HTTP ${res.status})`
        );
      }

      const data: AIChatResponse = await res.json();

      // Add assistant response to conversation
      addMessage({
        role: 'assistant',
        content: data.message,
        action: data.action,
      });

      // Dispatch the action to the Zustand store
      if (data.action) {
        dispatch(data.action);
      }
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Something went wrong. Please try again.';
      addMessage({
        role: 'assistant',
        content: msg,
        isError: true,
      });
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        onClick={closePanel}
        aria-hidden="true"
      />

      {/* Panel */}
      <aside
        id="ai-assistant-panel"
        className="
          fixed inset-y-0 right-0 z-50 flex w-80 flex-col
          border-l border-slate-800/80
          bg-slate-950/95 backdrop-blur-xl
          shadow-2xl shadow-black/60
          md:static md:z-auto md:shadow-none
          animate-in slide-in-from-right-4 duration-200
        "
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center justify-between border-b border-slate-800/80 px-4 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-md shadow-indigo-600/30">
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <p className="text-xs font-bold text-white">Nebula AI</p>
              <p className="text-[10px] text-indigo-400">Email Copilot</p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={clearMessages}
                className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition"
                title="Clear conversation"
                id="assistant-clear-btn"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={togglePanel}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition"
              title="Close assistant"
              id="assistant-close-btn"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* ── Context badge ───────────────────────────────────────────────── */}
        <div className="shrink-0 border-b border-slate-800/60 px-4 py-2">
          <div className="flex items-center gap-1.5 text-[10px] text-slate-500">
            <Bot className="h-3 w-3" />
            <span>
              Viewing:{' '}
              <span className="font-medium text-slate-400 capitalize">{currentFolder}</span>
              {selectedEmailId && (
                <> · <span className="text-indigo-400">Email open</span></>
              )}
            </span>
          </div>
        </div>

        {/* ── Message area ────────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 ? (
            <EmptyState onSuggestion={handleSend} />
          ) : (
            <>
              {messages.map((msg) => (
                <AssistantMessageBubble key={msg.id} message={msg} />
              ))}

              {/* Typing indicator */}
              {isLoading && (
                <div className="flex items-center gap-2.5">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-600 to-indigo-600">
                    <Bot className="h-3.5 w-3.5 text-white" />
                  </div>
                  <div className="flex items-center gap-1 rounded-2xl rounded-tl-sm border border-slate-700/60 bg-slate-800/80 px-3.5 py-2.5">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:0ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* ── Input ───────────────────────────────────────────────────────── */}
        <AssistantInput onSend={handleSend} isLoading={isLoading} />
      </aside>
    </>
  );
}

// ── Empty state with suggestion chips ────────────────────────────────────────

function EmptyState({ onSuggestion }: { onSuggestion: (s: string) => void }) {
  return (
    <div className="space-y-5 pt-2">
      <div className="text-center space-y-2">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 shadow-lg shadow-indigo-600/30">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
        <h3 className="text-sm font-semibold text-white">Nebula AI Copilot</h3>
        <p className="text-[11px] text-slate-400 leading-relaxed max-w-[220px] mx-auto">
          Ask me to search, compose, reply to, or summarize your emails.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider px-1">
          Try asking…
        </p>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSuggestion(s)}
            className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2.5 text-left text-xs text-slate-300 transition hover:border-indigo-500/30 hover:bg-slate-800 hover:text-white active:scale-[0.99]"
          >
            <span>{s}</span>
            <ChevronRight className="h-3.5 w-3.5 shrink-0 text-slate-600" />
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-amber-500/15 bg-amber-500/5 p-3 text-[10px] text-amber-300/80 leading-relaxed">
        <strong className="font-semibold">Note:</strong> The AI will always ask you to confirm before sending any email.
      </div>
    </div>
  );
}
