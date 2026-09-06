import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncUserMailbox } from '@/lib/gmail/sync';
import { prisma } from '@/lib/db/prisma';
import * as gmailClientModule from '@/lib/gmail/client';
import { encodeBase64Url } from '@/lib/gmail/mime';
import { gmail_v1 } from 'googleapis';

// Mock Prisma
vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    thread: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
    email: {
      upsert: vi.fn(),
      count: vi.fn(),
    },
    syncState: {
      upsert: vi.fn(),
    },
  },
}));

describe('Gmail Sync Service', () => {
  const mockUserId = 'user_test_123';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should synchronize Inbox messages and upsert threads and emails idempotently', async () => {
    const mockRawMessage: gmail_v1.Schema$Message = {
      id: 'gmail_msg_001',
      threadId: 'gmail_thread_001',
      historyId: '99001',
      internalDate: '1700000000000',
      labelIds: ['INBOX', 'UNREAD'],
      snippet: 'Welcome to Nebula Mail',
      payload: {
        headers: [
          { name: 'From', value: 'Nebula <hello@nebulaknowlab.com>' },
          { name: 'To', value: 'Test User <test@example.com>' },
          { name: 'Subject', value: 'Welcome!' },
        ],
        body: {
          data: encodeBase64Url('Welcome to your new AI-powered email inbox.'),
        },
      },
    };

    const mockGmail = {
      users: {
        messages: {
          list: vi.fn().mockImplementation(({ labelIds }: { labelIds: string[] }) => {
            if (labelIds.includes('INBOX')) {
              return Promise.resolve({
                data: {
                  messages: [{ id: 'gmail_msg_001', threadId: 'gmail_thread_001' }],
                },
              });
            }
            return Promise.resolve({ data: { messages: [] } });
          }),
          get: vi.fn().mockResolvedValue({
            data: mockRawMessage,
          }),
        },
      },
    };

    vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(
      mockGmail as unknown as gmail_v1.Gmail
    );

    // Mock thread upsert return
    vi.mocked(prisma.thread.upsert).mockResolvedValue({
      id: 'db_thread_1',
      userId: mockUserId,
      providerThreadId: 'gmail_thread_001',
      snippet: 'Welcome to Nebula Mail',
      historyId: '99001',
      messageCount: 1,
      hasUnread: true,
      isStarred: false,
      lastMessageAt: new Date(1700000000000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.email.upsert).mockResolvedValue({
      id: 'db_email_1',
      userId: mockUserId,
      threadId: 'db_thread_1',
      providerMessageId: 'gmail_msg_001',
      providerThreadId: 'gmail_thread_001',
      sender: 'Nebula',
      senderEmail: 'hello@nebulaknowlab.com',
      recipients: 'test@example.com',
      cc: null,
      bcc: null,
      subject: 'Welcome!',
      bodyText: 'Welcome to your new AI-powered email inbox.',
      bodyHtml: '',
      snippet: 'Welcome to Nebula Mail',
      receivedAt: new Date(1700000000000),
      sentAt: null,
      isRead: false,
      isStarred: false,
      labels: ['INBOX', 'UNREAD'],
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    vi.mocked(prisma.email.count).mockResolvedValue(1);
    vi.mocked(prisma.thread.update).mockResolvedValue({
      id: 'db_thread_1',
      userId: mockUserId,
      providerThreadId: 'gmail_thread_001',
      snippet: 'Welcome to Nebula Mail',
      historyId: '99001',
      messageCount: 1,
      hasUnread: true,
      isStarred: false,
      lastMessageAt: new Date(1700000000000),
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.syncState.upsert).mockResolvedValue({
      id: 'sync_1',
      userId: mockUserId,
      historyId: '99001',
      lastSyncedAt: new Date(),
      watchExpiration: null,
      watchResourceId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await syncUserMailbox(mockUserId, {
      maxResultsPerFolder: 10,
      folders: ['INBOX'],
    });

    expect(result.success).toBe(true);
    expect(result.synced).toBe(1);
    expect(result.threads).toBe(1);
    expect(result.latestHistoryId).toBe('99001');

    // Verify Thread upsert was called with unique compound key
    expect(prisma.thread.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_providerThreadId: {
            userId: mockUserId,
            providerThreadId: 'gmail_thread_001',
          },
        },
      })
    );

    // Verify Email upsert was called with unique compound key
    expect(prisma.email.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId_providerMessageId: {
            userId: mockUserId,
            providerMessageId: 'gmail_msg_001',
          },
        },
      })
    );

    // Verify SyncState was updated
    expect(prisma.syncState.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: mockUserId },
      })
    );
  });

  it('should handle empty mailbox folders gracefully', async () => {
    const mockGmail = {
      users: {
        messages: {
          list: vi.fn().mockResolvedValue({ data: { messages: [] } }),
        },
      },
    };

    vi.spyOn(gmailClientModule, 'getGmailClient').mockResolvedValue(
      mockGmail as unknown as gmail_v1.Gmail
    );

    const result = await syncUserMailbox(mockUserId, {
      folders: ['INBOX', 'SENT'],
    });

    expect(result.success).toBe(true);
    expect(result.synced).toBe(0);
    expect(result.threads).toBe(0);
  });
});
