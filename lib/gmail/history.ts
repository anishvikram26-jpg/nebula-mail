/**
 * Server-Side Gmail History API Incremental Synchronization
 *
 * Efficiently applies incremental mailbox changes (messages added/deleted,
 * labels added/removed) based on stored Gmail historyId.
 *
 * Fallback:
 * If the stored historyId is expired or rejected by Gmail (HTTP 404),
 * automatically recovers by falling back to a full mailbox sync.
 *
 * Idempotency:
 * Upserts all thread and email records to ensure re-processing the same
 * Pub/Sub notification does not create duplicate entries.
 */

import { getGmailClient } from '@/lib/gmail/client';
import { parseGmailMessage } from '@/lib/gmail/mime';
import { syncUserMailbox } from '@/lib/gmail/sync';
import { prisma } from '@/lib/db/prisma';
import { gmail_v1 } from 'googleapis';

export interface HistorySyncResult {
  success: boolean;
  messagesAdded: number;
  messagesDeleted: number;
  labelsUpdated: number;
  newHistoryId: string | null;
  fullSyncFallback?: boolean;
  error?: string;
}

/**
 * Checks whether an error from Gmail indicates an expired historyId.
 */
function isHistoryExpiredError(error: unknown): boolean {
  if (!error) return false;
  const msg = error instanceof Error ? error.message : String(error);
  const status = (error as { status?: number; code?: number })?.status ||
                 (error as { status?: number; code?: number })?.code;

  return (
    status === 404 ||
    msg.includes('404') ||
    msg.toLowerCase().includes('history id') ||
    msg.toLowerCase().includes('too old') ||
    msg.toLowerCase().includes('not found') ||
    msg.toLowerCase().includes('expired')
  );
}

/**
 * Incrementally synchronizes a user's mailbox starting from the stored historyId.
 */
export async function syncUserHistory(
  userId: string,
  targetHistoryId?: string
): Promise<HistorySyncResult> {
  // 1. Retrieve current sync state
  const syncState = await prisma.syncState.findUnique({
    where: { userId },
  });

  // If no previous history baseline exists, perform full sync
  if (!syncState?.historyId) {
    console.log(`[Gmail History] No baseline historyId for user ${userId}. Performing full sync.`);
    const fullSyncStats = await syncUserMailbox(userId);
    return {
      success: fullSyncStats.success,
      messagesAdded: fullSyncStats.synced,
      messagesDeleted: 0,
      labelsUpdated: 0,
      newHistoryId: fullSyncStats.latestHistoryId || null,
      fullSyncFallback: true,
      error: fullSyncStats.error,
    };
  }

  const startHistoryId = syncState.historyId;

  // If targetHistoryId is supplied and already <= startHistoryId, no new events to fetch
  if (targetHistoryId) {
    try {
      if (BigInt(targetHistoryId) <= BigInt(startHistoryId)) {
        return {
          success: true,
          messagesAdded: 0,
          messagesDeleted: 0,
          labelsUpdated: 0,
          newHistoryId: startHistoryId,
        };
      }
    } catch {
      // If BigInt comparison fails, proceed with query
    }
  }

  let gmail: gmail_v1.Gmail;
  try {
    gmail = await getGmailClient(userId);
  } catch (clientErr) {
    const msg = clientErr instanceof Error ? clientErr.message : 'Failed to obtain Gmail client';
    return {
      success: false,
      messagesAdded: 0,
      messagesDeleted: 0,
      labelsUpdated: 0,
      newHistoryId: startHistoryId,
      error: msg,
    };
  }

  let pageToken: string | undefined = undefined;
  let highestHistoryId: string = startHistoryId;
  let messagesAdded = 0;
  let messagesDeleted = 0;
  let labelsUpdated = 0;
  const affectedThreadIds = new Set<string>();

  // Up to 10 pages of history to prevent execution timeouts
  const MAX_PAGES = 10;
  let pageCount = 0;

  try {
    do {
      pageCount++;
      const res: { data: gmail_v1.Schema$ListHistoryResponse } = await gmail.users.history.list({
        userId: 'me',
        startHistoryId,
        pageToken,
        historyTypes: ['messageAdded', 'messageDeleted', 'labelAdded', 'labelRemoved'],
        maxResults: 100,
      });

      if (res.data.historyId) {
        if (!highestHistoryId || BigInt(res.data.historyId) > BigInt(highestHistoryId)) {
          highestHistoryId = res.data.historyId;
        }
      }

      const historyRecords = res.data.history || [];

      for (const record of historyRecords) {
        if (record.id) {
          try {
            if (BigInt(record.id) > BigInt(highestHistoryId)) {
              highestHistoryId = record.id;
            }
          } catch {
            // Ignore BigInt parse error
          }
        }

        // ── 1. Handle Messages Added ──────────────────────────────────────────
        if (record.messagesAdded && record.messagesAdded.length > 0) {
          for (const item of record.messagesAdded) {
            const messageId = item.message?.id;
            if (!messageId) continue;

            try {
              const msgRes = await gmail.users.messages.get({
                userId: 'me',
                id: messageId,
                format: 'full',
              });

              const parsed = parseGmailMessage(msgRes.data);
              if (!parsed.id || !parsed.threadId) continue;

              // Upsert Thread
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

              affectedThreadIds.add(thread.id);

              // Upsert Email
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

              messagesAdded++;
            } catch (err) {
              console.error(`[Gmail History] Error fetching added message ${messageId}:`, err);
            }
          }
        }

        // ── 2. Handle Messages Deleted ────────────────────────────────────────
        if (record.messagesDeleted && record.messagesDeleted.length > 0) {
          for (const item of record.messagesDeleted) {
            const messageId = item.message?.id;
            if (!messageId) continue;

            try {
              const existingEmail = await prisma.email.findUnique({
                where: {
                  userId_providerMessageId: {
                    userId,
                    providerMessageId: messageId,
                  },
                },
                select: { id: true, threadId: true },
              });

              if (existingEmail) {
                affectedThreadIds.add(existingEmail.threadId);
                await prisma.email.delete({
                  where: { id: existingEmail.id },
                });
                messagesDeleted++;
              }
            } catch (err) {
              console.error(`[Gmail History] Error deleting message ${messageId}:`, err);
            }
          }
        }

        // ── 3. Handle Labels Added ────────────────────────────────────────────
        if (record.labelsAdded && record.labelsAdded.length > 0) {
          for (const item of record.labelsAdded) {
            const messageId = item.message?.id;
            const addedLabels = item.labelIds || [];
            if (!messageId || addedLabels.length === 0) continue;

            try {
              const existingEmail = await prisma.email.findUnique({
                where: {
                  userId_providerMessageId: {
                    userId,
                    providerMessageId: messageId,
                  },
                },
                select: { id: true, threadId: true, labels: true },
              });

              if (existingEmail) {
                const combinedLabels = Array.from(
                  new Set([...existingEmail.labels, ...addedLabels])
                );
                const isRead = !combinedLabels.includes('UNREAD');
                const isStarred = combinedLabels.includes('STARRED');

                await prisma.email.update({
                  where: { id: existingEmail.id },
                  data: {
                    labels: combinedLabels,
                    isRead,
                    isStarred,
                  },
                });

                affectedThreadIds.add(existingEmail.threadId);
                labelsUpdated++;
              }
            } catch (err) {
              console.error(`[Gmail History] Error updating labels added for ${messageId}:`, err);
            }
          }
        }

        // ── 4. Handle Labels Removed ──────────────────────────────────────────
        if (record.labelsRemoved && record.labelsRemoved.length > 0) {
          for (const item of record.labelsRemoved) {
            const messageId = item.message?.id;
            const removedLabels = new Set(item.labelIds || []);
            if (!messageId || removedLabels.size === 0) continue;

            try {
              const existingEmail = await prisma.email.findUnique({
                where: {
                  userId_providerMessageId: {
                    userId,
                    providerMessageId: messageId,
                  },
                },
                select: { id: true, threadId: true, labels: true },
              });

              if (existingEmail) {
                const updatedLabels = existingEmail.labels.filter(
                  (label) => !removedLabels.has(label)
                );
                const isRead = !updatedLabels.includes('UNREAD');
                const isStarred = updatedLabels.includes('STARRED');

                await prisma.email.update({
                  where: { id: existingEmail.id },
                  data: {
                    labels: updatedLabels,
                    isRead,
                    isStarred,
                  },
                });

                affectedThreadIds.add(existingEmail.threadId);
                labelsUpdated++;
              }
            } catch (err) {
              console.error(`[Gmail History] Error updating labels removed for ${messageId}:`, err);
            }
          }
        }
      }

      pageToken = res.data.nextPageToken || undefined;
    } while (pageToken && pageCount < MAX_PAGES);

    // ── 5. Recalculate Stats for Affected Threads ───────────────────────────
    for (const threadId of affectedThreadIds) {
      try {
        const count = await prisma.email.count({
          where: { threadId },
        });

        if (count === 0) {
          // If no messages remain in thread, delete thread
          await prisma.thread.delete({
            where: { id: threadId },
          });
        } else {
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
        }
      } catch (countErr) {
        console.error(`[Gmail History] Error updating thread ${threadId}:`, countErr);
      }
    }

    // ── 6. Update SyncState with Highest Processed HistoryId ────────────────
    const finalHistoryId = targetHistoryId || highestHistoryId;

    await prisma.syncState.update({
      where: { userId },
      data: {
        historyId: finalHistoryId,
        lastSyncedAt: new Date(),
      },
    });

    return {
      success: true,
      messagesAdded,
      messagesDeleted,
      labelsUpdated,
      newHistoryId: finalHistoryId,
    };
  } catch (error) {
    // ── 7. Handle Expired History Fallback ───────────────────────────────────
    if (isHistoryExpiredError(error)) {
      console.warn(
        `[Gmail History] History expired for user ${userId} (startHistoryId=${startHistoryId}). Falling back to full sync.`
      );

      const fullSyncStats = await syncUserMailbox(userId);

      return {
        success: fullSyncStats.success,
        messagesAdded: fullSyncStats.synced,
        messagesDeleted: 0,
        labelsUpdated: 0,
        newHistoryId: fullSyncStats.latestHistoryId || null,
        fullSyncFallback: true,
        error: fullSyncStats.error,
      };
    }

    const message = error instanceof Error ? error.message : 'Unknown history sync error';
    console.error(`[Gmail History Error] User ${userId}:`, message);

    return {
      success: false,
      messagesAdded,
      messagesDeleted,
      labelsUpdated,
      newHistoryId: startHistoryId,
      error: message,
    };
  }
}
