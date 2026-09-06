import React from 'react';
import { Mail, Search, AlertCircle, RefreshCw } from 'lucide-react';
import { MailFolder } from '@/lib/gmail/types';

interface EmptyStateProps {
  type: 'folder' | 'search' | 'error';
  folder?: MailFolder;
  searchQuery?: string;
  errorMessage?: string;
  onRetry?: () => void;
  onClearSearch?: () => void;
}

export function EmptyState({
  type,
  folder = 'inbox',
  searchQuery = '',
  errorMessage = '',
  onRetry,
  onClearSearch,
}: EmptyStateProps) {
  if (type === 'error') {
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">Unable to load messages</h3>
        <p className="mt-1.5 max-w-sm text-xs leading-relaxed text-slate-400">
          {errorMessage || 'There was an issue retrieving your email records. Please try again.'}
        </p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="mt-5 flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700 active:scale-95"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Retry</span>
          </button>
        )}
      </div>
    );
  }

  if (type === 'search') {
    return (
      <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/80 text-slate-400">
          <Search className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">No matching emails</h3>
        <p className="mt-1.5 max-w-sm text-xs text-slate-400">
          No results found for &ldquo;<span className="text-slate-300 font-medium">{searchQuery}</span>&rdquo;.
          Try searching with different terms or check your spelling.
        </p>
        {onClearSearch && (
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-5 rounded-xl border border-slate-700 bg-slate-800/60 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
          >
            Clear search
          </button>
        )}
      </div>
    );
  }

  const folderNames: Record<MailFolder, string> = {
    inbox: 'Inbox',
    sent: 'Sent',
    starred: 'Starred',
    drafts: 'Drafts',
    trash: 'Trash',
    spam: 'Spam',
  };

  return (
    <div className="flex min-h-[380px] flex-col items-center justify-center p-8 text-center">
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-400">
        <Mail className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-slate-200">
        Your {folderNames[folder] || folder} is empty
      </h3>
      <p className="mt-1.5 max-w-sm text-xs text-slate-400">
        {folder === 'inbox'
          ? 'You have caught up on all messages! Click "Sync Mail" in the sidebar to refresh from Gmail.'
          : `No emails found in your ${folderNames[folder] || folder} folder.`}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-5 flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-medium text-slate-200 transition hover:bg-slate-700"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          <span>Refresh Mail</span>
        </button>
      )}
    </div>
  );
}
