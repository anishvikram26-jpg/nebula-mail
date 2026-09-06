'use client';

import React from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { Header } from '@/components/layout/header';
import { MailList } from '@/components/mail/mail-list';
import { EmailDetail } from '@/components/mail/email-detail';
import { ComposeModal } from '@/components/mail/compose-modal';
import { AssistantPanel } from '@/components/assistant/assistant-panel';
import { useMailStore } from '@/store/mail-store';

interface MailShellProps {
  user: {
    id: string;
    email: string;
    name: string | null;
    image: string | null;
  };
  children?: React.ReactNode;
}

export function MailShell({ user, children }: MailShellProps) {
  const { selectedEmailId } = useMailStore();

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 font-sans text-slate-100">
      {/* Route handler listener */}
      {children}

      {/* Left Navigation Sidebar */}
      <Sidebar user={user} />

      {/* Main Mail View Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        <main className="flex flex-1 overflow-hidden">
          {selectedEmailId ? (
            <EmailDetail emailId={selectedEmailId} />
          ) : (
            <MailList />
          )}
        </main>
      </div>

      {/* Right-side AI Assistant Panel */}
      <AssistantPanel />

      {/* Floating Compose Modal */}
      <ComposeModal />
    </div>
  );
}

