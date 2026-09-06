import { getGmailClient } from '@/lib/gmail/client';
import { parseGmailMessage } from '@/lib/gmail/mime';
import { SyncStats } from '@/lib/gmail/types';
import { prisma } from '@/lib/db/prisma';

export interface SyncOptions {
  maxResultsPerFolder?: number;
  folders?: ('INBOX' | 'SENT' | 'DRAFT')[];
}

/**
 * Synchronizes the user's Gmail messages and threads with the local PostgreSQL database.
 * Upserts all records to ensure idempotency and prevent duplicate entries.
 */
export async function syncUserMailbox(
  userId: string,
  options: SyncOptions = {}
): Promise<SyncStats> {
  const maxResults = options.maxResultsPerFolder || 50;
  const targetFolders = options.folders || ['INBOX', 'SENT', 'DRAFT'];

  const gmail = await getGmailClient(userId);

  let totalSynced = 0;
  const processedThreadIds = new Set<string>();
  let highestHistoryId: string | null = null;

  for (const folder of targetFolders) {
    try {
      // List message IDs for the target folder
      const listRes = await gmail.users.messages.list({
        userId: 'me',
        labelIds: [folder],
        maxResults,
      });

      const messageSummaries = listRes.data.messages || [];

      // Fetch each message in full and upsert
      for (const summary of messageSummaries) {
        if (!summary.id) continue;

        try {
          const msgRes = await gmail.users.messages.get({
            userId: 'me',
            id: summary.id,
            format: 'full',
          });

          const rawMessage = msgRes.data;
          const parsed = parseGmailMessage(rawMessage);

          if (!parsed.id || !parsed.threadId) continue;

          // Track latest historyId
          if (parsed.historyId) {
            if (!highestHistoryId || BigInt(parsed.historyId) > BigInt(highestHistoryId)) {
              highestHistoryId = parsed.historyId;
            }
          }

          // 1. Upsert Thread record first
          const thread = await prisma.thread.upsert({
            where: {
              userId_providerThreadId: {
                userId,
                providerThreadId: parsed.threadId,
              },
            },
            update: {
              snippet: parsed.snippet,
              historyId: parsed.historyId || undefined,
              isStarred: parsed.isStarred ? true : undefined,
              hasUnread: !parsed.isRead ? true : undefined,
              lastMessageAt: parsed.receivedAt,
            },
            create: {
              userId,
              providerThreadId: parsed.threadId,
              snippet: parsed.snippet,
              historyId: parsed.historyId,
              hasUnread: !parsed.isRead,
              isStarred: parsed.isStarred,
              lastMessageAt: parsed.receivedAt,
              messageCount: 1,
            },
          });

          processedThreadIds.add(thread.id);

          // 2. Upsert Email record
          await prisma.email.upsert({
            where: {
              userId_providerMessageId: {
                userId,
                providerMessageId: parsed.id,
              },
            },
            update: {
              subject: parsed.subject,
              snippet: parsed.snippet,
              bodyText: parsed.bodyText,
              bodyHtml: parsed.bodyHtml,
              isRead: parsed.isRead,
              isStarred: parsed.isStarred,
              labels: parsed.labels,
              receivedAt: parsed.receivedAt,
              sentAt: parsed.sentAt || null,
            },
            create: {
              userId,
              threadId: thread.id,
              providerMessageId: parsed.id,
              providerThreadId: parsed.threadId,
              sender: parsed.sender,
              senderEmail: parsed.senderEmail,
              recipients: parsed.recipients.join(', '),
              cc: parsed.cc.length > 0 ? parsed.cc.join(', ') : null,
              bcc: parsed.bcc.length > 0 ? parsed.bcc.join(', ') : null,
              subject: parsed.subject,
              bodyText: parsed.bodyText,
              bodyHtml: parsed.bodyHtml,
              snippet: parsed.snippet,
              receivedAt: parsed.receivedAt,
              sentAt: parsed.sentAt || null,
              isRead: parsed.isRead,
              isStarred: parsed.isStarred,
              labels: parsed.labels,
            },
          });

          totalSynced++;
        } catch (msgErr) {
          // If an individual message fails, log cleanly without aborting the entire sync batch
          console.error(`[Sync] Failed to process message ${summary.id}:`, msgErr instanceof Error ? msgErr.message : 'Unknown');
        }
      }
    } catch (folderErr) {
      console.error(`[Sync] Failed to list messages for label ${folder}:`, folderErr instanceof Error ? folderErr.message : 'Unknown');
    }
  }

  // 3. Recalculate message counts for affected threads
  for (const threadId of processedThreadIds) {
    try {
      const count = await prisma.email.count({
        where: { threadId },
      });
      const unreadCount = await prisma.email.count({
        where: { threadId, isRead: false },
      });
      const starredCount = await prisma.email.count({
        where: { threadId, isStarred: true },
      });

      await prisma.thread.update({
        where: { id: threadId },
        data: {
          messageCount: count,
          hasUnread: unreadCount > 0,
          isStarred: starredCount > 0,
        },
      });
    } catch {
      // Ignore count update errors
    }
  }

  // 4. Update user SyncState
  try {
    await prisma.syncState.upsert({
      where: { userId },
      update: {
        lastSyncedAt: new Date(),
        historyId: highestHistoryId || undefined,
      },
      create: {
        userId,
        lastSyncedAt: new Date(),
        historyId: highestHistoryId,
      },
    });
  } catch (syncStateErr) {
    console.error('[Sync] Failed to update sync state:', syncStateErr instanceof Error ? syncStateErr.message : 'Unknown');
  }

  return {
    success: true,
    synced: totalSynced,
    threads: processedThreadIds.size,
    latestHistoryId: highestHistoryId,
  };
}
