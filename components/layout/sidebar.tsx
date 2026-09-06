'use client';

import React from 'react';
import Link from 'next/link';
import {
  Inbox,
  Send,
  Star,
  FileText,
  Trash2,
  PenSquare,
  RefreshCw,
  LogOut,
  Mail,
  User as UserIcon,
  X,
} from 'lucide-react';
import { useMailStore } from '@/store/mail-store';
import { MailFolder } from '@/lib/gmail/types';

interface SidebarProps {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
}

interface NavItem {
  id: MailFolder;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'inbox', label: 'Inbox', href: '/inbox', icon: Inbox },
  { id: 'sent', label: 'Sent', href: '/sent', icon: Send },
  { id: 'starred', label: 'Starred', href: '/starred', icon: Star },
  { id: 'drafts', label: 'Drafts', href: '/drafts', icon: FileText },
  { id: 'trash', label: 'Trash', href: '/trash', icon: Trash2 },
];

export function Sidebar({ user }: SidebarProps) {
  const {
    currentFolder,
    setFolder,
    openCompose,
    isSyncing,
    setIsSyncing,
    isSidebarOpen,
    setSidebarOpen,
  } = useMailStore();

  const handleManualSync = async () => {
    if (isSyncing) return;
    setIsSyncing(true, 'Syncing mailbox...');

    try {
      const res = await fetch('/api/mail/sync', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Mail sync failed');
      }
      setIsSyncing(false, 'Mailbox synced successfully');
    } catch (err) {
      console.error('Manual sync error:', err);
      setIsSyncing(false, 'Sync encountered an error');
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isSidebarOpen && (
        <div
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-800/80 bg-slate-950/95 backdrop-blur-xl transition-transform duration-200 md:static md:translate-x-0 ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/80 px-5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/30">
              <Mail className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-sm text-white">Nebula Mail</span>
              <span className="block text-[10px] font-medium text-indigo-400">Gmail Connected</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 md:hidden"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Compose Action Button */}
        <div className="p-4">
          <button
            type="button"
            onClick={() => {
              openCompose();
              setSidebarOpen(false);
            }}
            className="group flex w-full items-center justify-center gap-2.5 rounded-xl bg-indigo-600 px-4 py-3 text-xs font-semibold text-white shadow-lg shadow-indigo-600/20 transition duration-150 hover:bg-indigo-500 active:scale-[0.99]"
          >
            <PenSquare className="h-4 w-4 transition-transform group-hover:rotate-6" />
            <span>Compose Email</span>
          </button>
        </div>

        {/* Folder Navigation Items */}
        <nav className="flex-1 space-y-1 px-3">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = currentFolder === item.id;

            return (
              <Link
                key={item.id}
                href={item.href}
                onClick={() => {
                  setFolder(item.id);
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-medium transition-colors ${
                  isActive
                    ? 'bg-indigo-600/15 text-indigo-300 font-semibold shadow-sm'
                    : 'text-slate-400 hover:bg-slate-900 hover:text-slate-200'
                }`}
              >
                <Icon
                  className={`h-4 w-4 ${
                    isActive ? 'text-indigo-400' : 'text-slate-500'
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Manual Sync Trigger */}
        <div className="px-4 py-2">
          <button
            type="button"
            onClick={handleManualSync}
            disabled={isSyncing}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/60 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin text-indigo-400' : 'text-slate-400'}`} />
            <span>{isSyncing ? 'Syncing...' : 'Sync with Gmail'}</span>
          </button>
        </div>

        {/* User Profile & Sign Out Footer */}
        <div className="border-t border-slate-800/80 p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5 min-w-0">
              {user.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.image}
                  alt={user.name || 'User'}
                  className="h-8 w-8 rounded-full border border-slate-700 object-cover"
                />
              ) : (
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-800 text-slate-300">
                  <UserIcon className="h-4 w-4" />
                </div>
              )}

              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-slate-200">{user.name || 'User'}</p>
                <p className="truncate text-[10px] text-slate-500">{user.email}</p>
              </div>
            </div>

            <Link
              href="/api/auth/logout"
              prefetch={false}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-red-400"
              title="Sign Out"
            >
              <LogOut className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
