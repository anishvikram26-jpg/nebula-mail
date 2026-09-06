import React from 'react';

export function MailListSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="divide-y divide-slate-800/60">
      {Array.from({ length: count }).map((_, index) => (
        <div
          key={index}
          className="flex animate-pulse items-center gap-4 px-4 py-3.5 sm:px-6"
        >
          {/* Avatar / Star placeholder */}
          <div className="h-8 w-8 shrink-0 rounded-full bg-slate-800/80" />

          {/* Text Content */}
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex items-center justify-between">
              <div className="h-4 w-32 rounded bg-slate-800" />
              <div className="h-3 w-16 rounded bg-slate-800/60" />
            </div>
            <div className="h-3.5 w-3/4 rounded bg-slate-800/80" />
            <div className="h-3 w-5/6 rounded bg-slate-800/40" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MailDetailSkeleton() {
  return (
    <div className="animate-pulse space-y-6 p-6 sm:p-8">
      {/* Header Skeleton */}
      <div className="space-y-3 border-b border-slate-800 pb-6">
        <div className="h-6 w-2/3 rounded bg-slate-800" />
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-slate-800" />
          <div className="space-y-1.5">
            <div className="h-4 w-40 rounded bg-slate-800" />
            <div className="h-3 w-48 rounded bg-slate-800/60" />
          </div>
        </div>
      </div>

      {/* Body Skeleton */}
      <div className="space-y-3 pt-2">
        <div className="h-4 w-full rounded bg-slate-800/60" />
        <div className="h-4 w-11/12 rounded bg-slate-800/60" />
        <div className="h-4 w-4/5 rounded bg-slate-800/60" />
        <div className="h-4 w-full rounded bg-slate-800/60" />
        <div className="h-4 w-2/3 rounded bg-slate-800/60" />
      </div>
    </div>
  );
}
