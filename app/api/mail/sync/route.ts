import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { syncUserMailbox } from '@/lib/gmail/sync';

export async function POST() {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to synchronize mailbox' },
        { status: 401 }
      );
    }

    // Trigger mailbox synchronization for authenticated user
    const stats = await syncUserMailbox(user.id);

    return NextResponse.json({
      success: true,
      synced: stats.synced,
      threads: stats.threads,
      latestHistoryId: stats.latestHistoryId || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown sync error';
    console.error('[Mail Sync API Error]', message);

    if (message.includes('REAUTH_REQUIRED') || message.includes('NO_GOOGLE_ACCOUNT')) {
      return NextResponse.json(
        {
          error: 'Google account authentication required. Please sign in again with Google.',
          code: 'REAUTH_REQUIRED',
        },
        { status: 403 }
      );
    }

    return NextResponse.json(
      {
        error: 'Failed to synchronize with Gmail API. Please check your connection and try again.',
        code: 'SYNC_FAILED',
      },
      { status: 500 }
    );
  }
}
