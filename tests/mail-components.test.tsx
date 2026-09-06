import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MailListItem } from '@/components/mail/mail-list-item';
import { EmptyState } from '@/components/mail/empty-state';
import { MailListItem as MailItemType } from '@/lib/gmail/types';

describe('Mail Components', () => {
  describe('MailListItem Component', () => {
    const mockEmail: MailItemType = {
      id: 'db_msg_1',
      providerMessageId: 'gmail_1',
      threadId: 'db_th_1',
      providerThreadId: 'gmail_th_1',
      sender: 'Alice Smith',
      senderEmail: 'alice@example.com',
      recipients: 'user@example.com',
      subject: 'Quarterly Financials',
      snippet: 'Please find attached the financial review...',
      receivedAt: new Date().toISOString(),
      sentAt: null,
      isRead: false,
      isStarred: true,
      labels: ['INBOX', 'STARRED'],
    };

    it('should render sender, subject, snippet, and trigger onSelect on click', () => {
      const handleSelect = vi.fn();

      render(
        <MailListItem
          email={mockEmail}
          isSelected={false}
          onSelect={handleSelect}
        />
      );

      expect(screen.getByText('Alice Smith')).toBeInTheDocument();
      expect(screen.getByText('Quarterly Financials')).toBeInTheDocument();
      expect(screen.getByText('Please find attached the financial review...')).toBeInTheDocument();

      // Click the row
      fireEvent.click(screen.getByText('Alice Smith'));
      expect(handleSelect).toHaveBeenCalledWith('db_msg_1');
    });
  });

  describe('EmptyState Component', () => {
    it('should render folder empty state with refresh action', () => {
      const handleRetry = vi.fn();

      render(
        <EmptyState
          type="folder"
          folder="inbox"
          onRetry={handleRetry}
        />
      );

      expect(screen.getByText('Your Inbox is empty')).toBeInTheDocument();

      const refreshBtn = screen.getByRole('button', { name: /refresh mail/i });
      fireEvent.click(refreshBtn);
      expect(handleRetry).toHaveBeenCalled();
    });

    it('should render search empty state with search query and clear action', () => {
      const handleClear = vi.fn();

      render(
        <EmptyState
          type="search"
          searchQuery="unknown-keyword"
          onClearSearch={handleClear}
        />
      );

      expect(screen.getByText('No matching emails')).toBeInTheDocument();
      expect(screen.getByText('unknown-keyword')).toBeInTheDocument();

      const clearBtn = screen.getByRole('button', { name: /clear search/i });
      fireEvent.click(clearBtn);
      expect(handleClear).toHaveBeenCalled();
    });
  });
});
