'use client';

import React, { useState } from 'react';
import { Search, X } from 'lucide-react';
import { useMailStore } from '@/store/mail-store';

export function SearchBar() {
  const { searchQuery, setSearchQuery } = useMailStore();
  const [localQuery, setLocalQuery] = useState(searchQuery);
  const [prevSearchQuery, setPrevSearchQuery] = useState(searchQuery);

  // Sync state during rendering when store value changes without extra effect renders
  if (searchQuery !== prevSearchQuery) {
    setPrevSearchQuery(searchQuery);
    setLocalQuery(searchQuery);
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearchQuery(localQuery.trim());
  };

  const handleClear = () => {
    setLocalQuery('');
    setSearchQuery('');
  };

  return (
    <form onSubmit={handleSubmit} className="relative w-full max-w-md">
      <div className="relative flex items-center">
        <Search className="pointer-events-none absolute left-3.5 h-4 w-4 text-slate-400" />
        <input
          type="text"
          value={localQuery}
          onChange={(e) => setLocalQuery(e.target.value)}
          placeholder="Search mail by sender, subject, keyword..."
          className="h-10 w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-10 pr-9 text-xs text-slate-200 placeholder-slate-500 shadow-inner outline-none transition focus:border-indigo-500/50 focus:bg-slate-900 focus:ring-1 focus:ring-indigo-500/30"
        />
        {localQuery && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2.5 flex h-5 w-5 items-center justify-center rounded-md text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            title="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </form>
  );
}
