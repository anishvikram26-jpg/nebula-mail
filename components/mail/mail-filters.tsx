'use client';

import React from 'react';
import { MailCheck, Star } from 'lucide-react';
import { useMailStore } from '@/store/mail-store';

export function MailFilters() {
  const { filters, setFilters } = useMailStore();

  const toggleUnread = () => {
    setFilters({ unreadOnly: !filters.unreadOnly });
  };

  const toggleStarred = () => {
    setFilters({ starredOnly: !filters.starredOnly });
  };

  return (
    <div className="flex items-center gap-2">
      {/* Unread Filter Chip */}
      <button
        type="button"
        onClick={toggleUnread}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
          filters.unreadOnly
            ? 'border-indigo-500/50 bg-indigo-500/15 text-indigo-300 shadow-sm shadow-indigo-500/10'
            : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
        }`}
      >
        <MailCheck className={`h-3.5 w-3.5 ${filters.unreadOnly ? 'text-indigo-400' : 'text-slate-400'}`} />
        <span>Unread</span>
      </button>

      {/* Starred Filter Chip */}
      <button
        type="button"
        onClick={toggleStarred}
        className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition ${
          filters.starredOnly
            ? 'border-amber-500/50 bg-amber-500/15 text-amber-300 shadow-sm shadow-amber-500/10'
            : 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
        }`}
      >
        <Star
          className={`h-3.5 w-3.5 ${
            filters.starredOnly ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
          }`}
        />
        <span>Starred</span>
      </button>
    </div>
  );
}
