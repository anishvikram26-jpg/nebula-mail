/**
 * Server-Side Gmail Watch Service
 *
 * Establishes and renews mailbox watch subscriptions via Gmail users.watch().
 * Changes in the user's mailbox publish notifications to the configured
 * Google Cloud Pub/Sub topic.
 *
 * Security:
 * - Authenticated strictly via user credentials.
 * - Server-only: OAuth tokens are never exposed to the client.
 * - Stores watchExpiration and historyId in Prisma SyncState.
 */

import { getGmailClient } from '@/lib/gmail/client';
import { prisma } from '@/lib/db/prisma';
import { getServerEnv } from '@/lib/config/env';

export interface WatchResult {
  success: boolean;
  historyId?: string | null;
  expiration?: string | null;
  renewed?: boolean;
  error?: string;
}

export interface WatchOptions {
  /** Force renewal even if existing watch has not expired */
  force?: boolean;
  /** Label IDs to watch (defaults to ['INBOX']) */
  labelIds?: string[];
}

/**
 * Creates or renews a Gmail watch subscription for the specified user.
 * Avoids unnecessary API calls if the current watch is valid for more than 24 hours.
 */
export async function setupGmailWatch(
  userId: string,
  options: WatchOptions = {}
): Promise<WatchResult> {
  const env = getServerEnv();
  const topicName = env.GMAIL_PUBSUB_TOPIC;

  if (!topicName || topicName.trim() === '') {
    return {
      success: false,
      error: 'GMAIL_PUBSUB_TOPIC is not configured in server environment',
    };
  }

  // Check existing watch expiration to avoid redundant renewals
  const syncState = await prisma.syncState.findUnique({
    where: { userId },
  });

  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;

  if (
    !options.force &&
    syncState?.watchExpiration &&
    syncState.watchExpiration.getTime() - now.getTime() > ONE_DAY_MS
  ) {
    return {
      success: true,
      historyId: syncState.historyId,
      expiration: syncState.watchExpiration.toISOString(),
      renewed: false,
    };
  }

  try {
    const gmail = await getGmailClient(userId);

    const watchResponse = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: topicName.trim(),
        labelIds: options.labelIds || ['INBOX'],
      },
    });

    const rawHistoryId = watchResponse.data.historyId || null;
    const rawExpiration = watchResponse.data.expiration;

    const watchExpiration = rawExpiration
      ? new Date(parseInt(rawExpiration, 10))
      : null;

    // Persist watch state and latest historyId in SyncState
    await prisma.syncState.upsert({
      where: { userId },
      update: {
        watchExpiration,
        historyId: rawHistoryId || undefined,
      },
      create: {
        userId,
        watchExpiration,
        historyId: rawHistoryId,
      },
    });

    return {
      success: true,
      historyId: rawHistoryId,
      expiration: watchExpiration ? watchExpiration.toISOString() : null,
      renewed: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Gmail watch error';
    console.error(`[Gmail Watch Error] User ${userId}:`, message);

    return {
      success: false,
      error: message,
    };
  }
}

/**
 * Stops an active Gmail watch subscription for the specified user.
 */
export async function stopGmailWatch(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const gmail = await getGmailClient(userId);

    await gmail.users.stop({
      userId: 'me',
    });

    await prisma.syncState.updateMany({
      where: { userId },
      data: {
        watchExpiration: null,
      },
    });

    return { success: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown watch stop error';
    console.error(`[Gmail Watch Stop Error] User ${userId}:`, message);
    return { success: false, error: message };
  }
}
