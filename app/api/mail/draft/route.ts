import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { createGmailDraft } from '@/lib/gmail/send';
import { getGmailClient } from '@/lib/gmail/client';

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to save drafts' },
        { status: 401 }
      );
    }

    const body = await request.json().catch(() => ({}));
    const {
      to = [],
      cc = [],
      bcc = [],
      subject = '',
      textBody = '',
      htmlBody = '',
      threadId,
    } = body;

    const toList = Array.isArray(to) ? to : typeof to === 'string' && to ? [to] : [];
    const ccList = Array.isArray(cc) ? cc : typeof cc === 'string' && cc ? [cc] : [];
    const bccList = Array.isArray(bcc) ? bcc : typeof bcc === 'string' && bcc ? [bcc] : [];

    const draft = await createGmailDraft({
      userId: user.id,
      to: toList,
      cc: ccList,
      bcc: bccList,
      subject: subject || '',
      textBody: textBody || '',
      htmlBody: htmlBody || undefined,
      threadId: threadId || undefined,
    });

    return NextResponse.json({
      success: true,
      draftId: draft.draftId,
      messageId: draft.messageId,
    });
  } catch (error) {
    console.error('[Draft Save API Error]', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { error: 'Failed to save email draft to Gmail' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const draftId = searchParams.get('id');

    if (!draftId) {
      return NextResponse.json(
        { error: 'Draft ID is required' },
        { status: 400 }
      );
    }

    const gmail = await getGmailClient(user.id);
    await gmail.users.drafts.delete({
      userId: 'me',
      id: draftId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Draft Delete API Error]', error instanceof Error ? error.message : 'Unknown');
    return NextResponse.json(
      { error: 'Failed to delete draft from Gmail' },
      { status: 500 }
    );
  }
}
