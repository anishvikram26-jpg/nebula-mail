'use client';

import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useMailStore } from '@/store/mail-store';
import { MailListItem as MailItemType, MailListResponse } from '@/lib/gmail/types';
import { MailListItem } from '@/components/mail/mail-list-item';
import { MailListSkeleton } from '@/components/mail/loading-state';
import { EmptyState } from '@/components/mail/empty-state';

export function MailList() {
  const {
    currentFolder,
    selectedEmailId,
    selectEmail,
    searchQuery,
    setSearchQuery,
    filters,
    pagination,
    setPage,
    setPagination,
    isSyncing,
  } = useMailStore();

  const [emails, setEmails] = useState<MailItemType[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  useEffect(() => {
    let ignore = false;
    const controller = new AbortController();

    async function loadEmails() {
      try {
        const params = new URLSearchParams({
          folder: currentFolder,
          page: pagination.page.toString(),
          limit: pagination.limit.toString(),
        });

        if (searchQuery) params.set('search', searchQuery);
        if (filters.unreadOnly) params.set('unread', 'true');
        if (filters.starredOnly) params.set('starred', 'true');
        if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
        if (filters.dateTo) params.set('dateTo', filters.dateTo);

        const res = await fetch(`/api/mail/list?${params.toString()}`, {
          signal: controller.signal,
        });

        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${res.status}: Failed to load emails`);
        }

        const data: MailListResponse = await res.json();
        if (!ignore) {
          setEmails(data.emails || []);
          setPagination(data.pagination);
          setError(null);
          setIsLoading(false);
        }
      } catch (err) {
        if (!ignore && (err as Error).name !== 'AbortError') {
          setError(err instanceof Error ? err.message : 'Failed to retrieve emails');
          setEmails([]);
          setIsLoading(false);
        }
      }
    }

    loadEmails();

    return () => {
      ignore = true;
      controller.abort();
    };
  }, [
    currentFolder,
    pagination.page,
    pagination.limit,
    searchQuery,
    filters.unreadOnly,
    filters.starredOnly,
    filters.dateFrom,
    filters.dateTo,
    isSyncing,
    refreshTrigger,
    setPagination,
  ]);

  const handleRefresh = () => {
    setIsLoading(true);
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-slate-950">
      {/* List Toolbar / Pagination Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800/80 bg-slate-900/40 px-4 py-2.5 sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400">
            {pagination.totalCount > 0 ? (
              <>
                Showing{' '}
                <span className="font-semibold text-slate-200">
                  {(pagination.page - 1) * pagination.limit + 1}–
                  {Math.min(pagination.page * pagination.limit, pagination.totalCount)}
                </span>{' '}
                of <span className="font-semibold text-slate-200">{pagination.totalCount}</span>
              </>
            ) : (
              '0 messages'
            )}
          </span>
        </div>

        {/* Pagination Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={handleRefresh}
            disabled={isLoading}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
            title="Refresh list"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          </button>

          <div className="h-3.5 w-[1px] bg-slate-800" />

          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setPage(pagination.page - 1);
            }}
            disabled={pagination.page <= 1 || isLoading}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
            title="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>

          <span className="px-1 text-xs text-slate-500">
            {pagination.page} / {pagination.totalPages || 1}
          </span>

          <button
            type="button"
            onClick={() => {
              setIsLoading(true);
              setPage(pagination.page + 1);
            }}
            disabled={pagination.page >= (pagination.totalPages || 1) || isLoading}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:cursor-not-allowed disabled:opacity-30"
            title="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Main List Container */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <MailListSkeleton count={8} />
        ) : error ? (
          <EmptyState
            type="error"
            errorMessage={error}
            onRetry={handleRefresh}
          />
        ) : emails.length === 0 ? (
          searchQuery ? (
            <EmptyState
              type="search"
              searchQuery={searchQuery}
              onClearSearch={() => setSearchQuery('')}
            />
          ) : (
            <EmptyState
              type="folder"
              folder={currentFolder}
              onRetry={handleRefresh}
            />
          )
        ) : (
          <div>
            {emails.map((email) => (
              <MailListItem
                key={email.id}
                email={email}
                isSelected={selectedEmailId === email.id}
                onSelect={(id) => selectEmail(id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
