'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronUp, User, Clock } from 'lucide-react';
import { MailDetail } from '@/lib/gmail/types';

interface ThreadViewProps {
  messages: MailDetail[];
  activeMessageId: string;
}

export function ThreadView({ messages, activeMessageId }: ThreadViewProps) {
  // Store expanded state for each message; by default, newest (last) message is expanded
  const [expandedMap, setExpandedMap] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    messages.forEach((msg, idx) => {
      // Expand the active message or the last message by default
      initial[msg.id] = msg.id === activeMessageId || idx === messages.length - 1;
    });
    return initial;
  });

  const toggleExpand = (id: string) => {
    setExpandedMap((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleString([], {
        dateStyle: 'medium',
        timeStyle: 'short',
      });
    } catch {
      return dateStr;
    }
  };

  if (messages.length <= 1) {
    return null; // Single message does not need thread conversation accordion
  }

  return (
    <div className="mt-8 space-y-4 border-t border-slate-800 pt-6">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
          Conversation History ({messages.length} messages)
        </h4>
        <button
          type="button"
          onClick={() => {
            const allExpanded = Object.values(expandedMap).every(Boolean);
            const next: Record<string, boolean> = {};
            messages.forEach((m) => {
              next[m.id] = !allExpanded;
            });
            setExpandedMap(next);
          }}
          className="text-[11px] text-indigo-400 hover:text-indigo-300 transition"
        >
          {Object.values(expandedMap).every(Boolean) ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      <div className="space-y-3">
        {messages.map((msg, index) => {
          const isExpanded = !!expandedMap[msg.id];
          const isLatest = index === messages.length - 1;

          return (
            <div
              key={msg.id}
              className={`rounded-xl border transition-colors ${
                isLatest
                  ? 'border-indigo-500/40 bg-slate-900/60'
                  : 'border-slate-800/80 bg-slate-950/40'
              }`}
            >
              {/* Message Header Bar */}
              <div
                onClick={() => toggleExpand(msg.id)}
                className="flex cursor-pointer items-center justify-between p-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-slate-200">
                        {msg.sender || msg.senderEmail}
                      </span>
                      {isLatest && (
                        <span className="rounded bg-indigo-500/20 px-1.5 py-0.2 text-[10px] font-medium text-indigo-300">
                          Latest
                        </span>
                      )}
                    </div>
                    {!isExpanded && (
                      <p className="truncate text-[11px] text-slate-500">{msg.snippet}</p>
                    )}
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="h-3 w-3" />
                    {formatMessageTime(msg.receivedAt)}
                  </span>
                  <button
                    type="button"
                    className="p-1 text-slate-400 hover:text-slate-200"
                    aria-label={isExpanded ? 'Collapse' : 'Expand'}
                  >
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Message Expanded Body */}
              {isExpanded && (
                <div className="border-t border-slate-800/60 p-5">
                  <div className="mb-4 text-xs text-slate-400">
                    <p>
                      <span className="font-medium text-slate-500">To: </span>
                      {msg.recipients.join(', ') || 'undisclosed-recipients'}
                    </p>
                    {msg.cc.length > 0 && (
                      <p className="mt-0.5">
                        <span className="font-medium text-slate-500">Cc: </span>
                        {msg.cc.join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Sanitized HTML or Plaintext Render */}
                  {msg.bodyHtml ? (
                    <div
                      className="email-content text-xs text-slate-200 leading-relaxed overflow-x-auto"
                      dangerouslySetInnerHTML={{ __html: msg.bodyHtml }}
                    />
                  ) : (
                    <pre className="whitespace-pre-wrap font-sans text-xs text-slate-300 leading-relaxed">
                      {msg.bodyText}
                    </pre>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
