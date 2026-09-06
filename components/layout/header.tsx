'use client';

import React from 'react';
import { Menu, RefreshCw, Sparkles } from 'lucide-react';
import { useMailStore } from '@/store/mail-store';
import { useAssistantStore } from '@/store/assistant-store';
import { SearchBar } from '@/components/mail/search-bar';
import { MailFilters } from '@/components/mail/mail-filters';

const FOLDER_TITLES: Record<string, string> = {
  inbox: 'Inbox',
  sent: 'Sent',
  starred: 'Starred',
  drafts: 'Drafts',
  trash: 'Trash',
  spam: 'Spam',
};

export function Header() {
  const { currentFolder, toggleSidebar, isSyncing, syncMessage } = useMailStore();
  const { togglePanel: toggleAssistant, isOpen: isAssistantOpen } = useAssistantStore();

  const title = FOLDER_TITLES[currentFolder] || 'Mailbox';

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-950/80 px-4 backdrop-blur-md sm:px-6">
      {/* Left: Mobile Toggle & Title */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={toggleSidebar}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-800 bg-slate-900 text-slate-400 hover:text-white md:hidden"
          aria-label="Open sidebar navigation"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="flex items-center gap-2.5">
          <h2 className="text-base font-bold text-white sm:text-lg">{title}</h2>
          {isSyncing && (
            <div className="flex items-center gap-1.5 rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-[11px] font-medium text-indigo-400">
              <RefreshCw className="h-3 w-3 animate-spin" />
              <span>{syncMessage || 'Syncing...'}</span>
            </div>
          )}
        </div>
      </div>

      {/* Center / Right: Search Bar, Filter Chips & AI Toggle */}
      <div className="flex items-center gap-3">
        <SearchBar />
        <div className="hidden sm:block">
          <MailFilters />
        </div>
        {/* AI Assistant Toggle */}
        <button
          type="button"
          onClick={toggleAssistant}
          id="ai-assistant-toggle"
          aria-label={isAssistantOpen ? 'Close AI assistant' : 'Open AI assistant'}
          title={isAssistantOpen ? 'Close AI Copilot' : 'Open AI Copilot'}
          className={`flex h-9 w-9 items-center justify-center rounded-xl border transition ${
            isAssistantOpen
              ? 'border-indigo-500/60 bg-indigo-600/20 text-indigo-400 shadow-sm shadow-indigo-600/20'
              : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-indigo-500/40 hover:text-indigo-400'
          }`}
        >
          <Sparkles className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}
