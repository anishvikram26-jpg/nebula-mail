'use client';

import React from 'react';
import { Star } from 'lucide-react';
import { MailListItem as MailItemType } from '@/lib/gmail/types';

interface MailListItemProps {
  email: MailItemType;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

function formatDisplayDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    const isThisYear = date.getFullYear() === now.getFullYear();
    if (isThisYear) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }

    return date.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return dateStr;
  }
}

export function MailListItem({ email, isSelected, onSelect }: MailListItemProps) {
  const isUnread = !email.isRead;

  return (
    <div
      onClick={() => onSelect(email.id)}
      className={`group relative flex cursor-pointer items-start gap-3.5 border-b border-slate-800/60 px-4 py-3.5 transition-colors sm:px-6 ${
        isSelected
          ? 'bg-indigo-600/10 border-indigo-500/30'
          : isUnread
          ? 'bg-slate-900/80 hover:bg-slate-850 hover:bg-slate-900'
          : 'bg-slate-950/30 hover:bg-slate-900/50'
      }`}
    >
      {/* Unread Status Indicator */}
      <div className="mt-1 flex h-4 w-4 shrink-0 items-center justify-center">
        {isUnread ? (
          <span className="h-2 w-2 rounded-full bg-indigo-400 shadow-sm shadow-indigo-400/50" />
        ) : (
          <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
        )}
      </div>

      {/* Star Icon */}
      <div className="mt-0.5 shrink-0 text-slate-500">
        <Star
          className={`h-4 w-4 transition-colors ${
            email.isStarred
              ? 'fill-amber-400 text-amber-400'
              : 'text-slate-600 hover:text-slate-400'
          }`}
        />
      </div>

      {/* Content Container */}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          {/* Sender */}
          <span
            className={`truncate text-xs ${
              isUnread ? 'font-bold text-white' : 'font-medium text-slate-300'
            }`}
          >
            {email.sender || email.senderEmail}
          </span>

          {/* Timestamp */}
          <span
            className={`shrink-0 text-[11px] ${
              isUnread ? 'font-semibold text-indigo-400' : 'text-slate-500'
            }`}
          >
            {formatDisplayDate(email.receivedAt)}
          </span>
        </div>

        {/* Subject Line */}
        <p
          className={`mt-0.5 truncate text-xs ${
            isUnread ? 'font-semibold text-slate-100' : 'text-slate-300'
          }`}
        >
          {email.subject || '(no subject)'}
        </p>

        {/* Preview Snippet */}
        <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 leading-relaxed">
          {email.snippet || 'No preview available'}
        </p>

        {/* Labels / Badges */}
        {email.labels && email.labels.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {email.labels
              .filter((l) => !['INBOX', 'UNREAD', 'SENT', 'CATEGORY_PERSONAL'].includes(l))
              .slice(0, 3)
              .map((label) => (
                <span
                  key={label}
                  className="rounded bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-medium text-slate-400"
                >
                  {label.toLowerCase()}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
