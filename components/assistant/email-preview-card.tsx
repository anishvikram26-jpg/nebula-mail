'use client';

import React from 'react';
import { Mail, Clock, User } from 'lucide-react';

export interface EmailPreviewCardData {
  id: string;
  sender: string;
  subject: string;
  snippet: string;
  receivedAt: string;
  isRead: boolean;
}

interface EmailPreviewCardProps {
  email: EmailPreviewCardData;
  onSelect?: (id: string) => void;
}

function formatRelativeTime(iso: string): string {
  try {
    const date = new Date(iso);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

export function EmailPreviewCard({ email, onSelect }: EmailPreviewCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect?.(email.id)}
      className="w-full rounded-xl border border-slate-700/50 bg-slate-800/60 p-3 text-left transition hover:border-indigo-500/30 hover:bg-slate-800 active:scale-[0.99]"
    >
      {/* Sender + Time */}
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-violet-600 text-white">
            <User className="h-2.5 w-2.5" />
          </div>
          <span className={`truncate text-[11px] font-medium ${email.isRead ? 'text-slate-300' : 'text-white'}`}>
            {email.sender}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1 text-[10px] text-slate-500">
          <Clock className="h-2.5 w-2.5" />
          <span>{formatRelativeTime(email.receivedAt)}</span>
        </div>
      </div>

      {/* Subject */}
      <div className="flex items-start gap-1.5 mb-1">
        <Mail className="mt-0.5 h-3 w-3 shrink-0 text-slate-500" />
        <p className={`truncate text-[11px] ${email.isRead ? 'text-slate-400' : 'font-semibold text-slate-200'}`}>
          {email.subject || '(no subject)'}
        </p>
        {!email.isRead && (
          <span className="ml-auto shrink-0 h-1.5 w-1.5 rounded-full bg-indigo-400 mt-1" />
        )}
      </div>

      {/* Snippet */}
      {email.snippet && (
        <p className="line-clamp-2 text-[10px] text-slate-500 leading-relaxed pl-4">
          {email.snippet}
        </p>
      )}
    </button>
  );
}
