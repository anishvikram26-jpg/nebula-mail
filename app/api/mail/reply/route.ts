import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { sendGmailMessage, isValidEmailAddress } from '@/lib/gmail/send';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to reply' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Bad Request: Missing reply payload' },
        { status: 400 }
      );
    }

    const {
      threadId,
      to,
      cc = [],
      bcc = [],
      subject = '',
      textBody = '',
      htmlBody = '',
      inReplyTo,
      references,
    } = body;

    if (!threadId) {
      return NextResponse.json(
        { error: 'Validation Error: threadId is required for replies.' },
        { status: 400 }
      );
    }

    if (!Array.isArray(to) || to.length === 0) {
      return NextResponse.json(
        { error: 'Validation Error: At least one recipient is required.' },
        { status: 400 }
      );
    }

    const allRecipients = [...to, ...cc, ...bcc];
    for (const email of allRecipients) {
      if (!isValidEmailAddress(email)) {
        return NextResponse.json(
          { error: `Validation Error: "${email}" is not a valid email address.` },
          { status: 400 }
        );
      }
    }

    const result = await sendGmailMessage({
      userId: user.id,
      to,
      cc: Array.isArray(cc) ? cc : [],
      bcc: Array.isArray(bcc) ? bcc : [],
      subject: (subject || '').trim(),
      textBody: (textBody || '').trim(),
      htmlBody: htmlBody ? htmlBody.trim() : undefined,
      threadId,
      inReplyTo: typeof inReplyTo === 'string' ? inReplyTo.trim() : undefined,
      references: typeof references === 'string' ? references.trim() : undefined,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown reply error';
    console.error('[Reply API Error]', errorMsg);

    return NextResponse.json(
      { error: 'Failed to send reply through Gmail API' },
      { status: 500 }
    );
  }
}
