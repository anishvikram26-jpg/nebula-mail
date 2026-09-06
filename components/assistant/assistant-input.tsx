'use client';

import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import { Send, Loader2 } from 'lucide-react';

interface AssistantInputProps {
  onSend: (message: string) => void;
  isLoading: boolean;
  disabled?: boolean;
}

const PLACEHOLDER_EXAMPLES = [
  'Show me emails from the last 10 days…',
  'Reply to this email…',
  'Find emails from Sarah about the project…',
  'Send an email to john@example.com…',
  'Show unread emails from this week…',
];

export function AssistantInput({ onSend, isLoading, disabled }: AssistantInputProps) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);

  // Cycle placeholder text for discoverability
  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }, [value]);

  const handleSend = () => {
    const trimmed = value.trim();
    if (!trimmed || isLoading || disabled) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Send on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-slate-800/80 bg-slate-950/80 p-3">
      <div className="flex items-end gap-2 rounded-xl border border-slate-700/60 bg-slate-900/80 px-3 py-2 focus-within:border-indigo-500/50 focus-within:ring-1 focus-within:ring-indigo-500/20 transition-all">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDER_EXAMPLES[placeholderIdx]}
          disabled={isLoading || disabled}
          rows={1}
          className="flex-1 resize-none bg-transparent text-xs text-slate-200 placeholder-slate-600 outline-none leading-relaxed disabled:opacity-50"
          aria-label="Ask the AI assistant"
          id="assistant-input"
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!value.trim() || isLoading || disabled}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
          id="assistant-send-btn"
        >
          {isLoading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Send className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      <p className="mt-1.5 px-1 text-[10px] text-slate-600">
        Enter to send · Shift+Enter for new line
      </p>
    </div>
  );
}
