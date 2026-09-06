import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { sendGmailMessage, isValidEmailAddress } from '@/lib/gmail/send';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to send emails' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => null);

    if (!body || typeof body !== 'object') {
      return NextResponse.json(
        { error: 'Bad Request: Missing or invalid JSON payload' },
        { status: 400 }
      );
    }

    const {
      to,
      cc = [],
      bcc = [],
      subject = '',
      textBody = '',
      htmlBody = '',
      threadId,
      inReplyTo,
      references,
    } = body;

    // Validate recipients
    if (!Array.isArray(to) || to.length === 0) {
      return NextResponse.json(
        { error: 'Validation Error: At least one recipient ("to") is required.' },
        { status: 400 }
      );
    }

    const allRecipients = [...to, ...cc, ...bcc];
    for (const email of allRecipients) {
      if (typeof email !== 'string' || !isValidEmailAddress(email)) {
        return NextResponse.json(
          { error: `Validation Error: "${email}" is not a valid email address.` },
          { status: 400 }
        );
      }
    }

    // Enforce reasonable length limits
    if (typeof subject === 'string' && subject.length > 998) {
      return NextResponse.json(
        { error: 'Validation Error: Subject exceeds maximum RFC limit of 998 characters.' },
        { status: 400 }
      );
    }

    if (typeof textBody === 'string' && textBody.length > 500000) {
      return NextResponse.json(
        { error: 'Validation Error: Message body exceeds allowed size limit.' },
        { status: 400 }
      );
    }

    // Call Gmail send service
    const result = await sendGmailMessage({
      userId: user.id,
      to,
      cc: Array.isArray(cc) ? cc : [],
      bcc: Array.isArray(bcc) ? bcc : [],
      subject: (subject || '').trim(),
      textBody: (textBody || '').trim(),
      htmlBody: htmlBody ? htmlBody.trim() : undefined,
      threadId: typeof threadId === 'string' ? threadId.trim() : undefined,
      inReplyTo: typeof inReplyTo === 'string' ? inReplyTo.trim() : undefined,
      references: typeof references === 'string' ? references.trim() : undefined,
    });

    return NextResponse.json({
      success: true,
      messageId: result.messageId,
      threadId: result.threadId,
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown sending error';
    console.error('[Send API Error]', errorMsg);

    if (errorMsg.includes('REAUTH_REQUIRED') || errorMsg.includes('NO_GOOGLE_ACCOUNT')) {
      return NextResponse.json(
        {
          error: 'Google OAuth re-authentication required to send emails.',
          code: 'REAUTH_REQUIRED',
        },
        { status: 403 }
      );
    }

    if (errorMsg.includes('HEADER_INJECTION_DETECTED')) {
      return NextResponse.json(
        { error: 'Security Error: Invalid line breaks detected in email headers.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to send email through Gmail. Please try again later.' },
      { status: 500 }
    );
  }
}
