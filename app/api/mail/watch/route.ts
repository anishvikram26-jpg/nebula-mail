/**
 * POST /api/mail/watch
 *
 * Authenticated endpoint to establish or renew a Gmail mailbox watch subscription.
 *
 * Security:
 * - Requires an active user session.
 * - Server-only credentials; never returns access/refresh tokens.
 * - Respects watch expiration to avoid unnecessary calls.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { setupGmailWatch, stopGmailWatch } from '@/lib/gmail/watch';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to manage mailbox watch' },
        { status: 401 }
      );
    }

    let force = false;
    let action = 'start';

    try {
      const body = await request.json();
      if (body && typeof body === 'object') {
        force = body.force === true;
        if (body.action === 'stop') action = 'stop';
      }
    } catch {
      // Empty or non-JSON body is acceptable for standard POST /api/mail/watch
    }

    if (action === 'stop') {
      const stopResult = await stopGmailWatch(user.id);
      if (!stopResult.success) {
        return NextResponse.json(
          { error: stopResult.error || 'Failed to stop watch' },
          { status: 500 }
        );
      }
      return NextResponse.json({ success: true, stopped: true });
    }

    const result = await setupGmailWatch(user.id, { force });

    if (!result.success) {
      return NextResponse.json(
        {
          error: result.error || 'Failed to establish Gmail watch',
          code: 'WATCH_SETUP_FAILED',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      expiration: result.expiration,
      historyId: result.historyId,
      renewed: result.renewed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown watch error';
    console.error('[Mail Watch API Error]', message);

    return NextResponse.json(
      {
        error: 'Failed to manage Gmail watch subscription',
        code: 'WATCH_ERROR',
      },
      { status: 500 }
    );
  }
}
