import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { MailDetail, MailThreadDetail } from '@/lib/gmail/types';

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to view this email' },
        { status: 401 }
      );
    }

    const { id } = await context.params;

    if (!id) {
      return NextResponse.json(
        { error: 'Bad Request: Email ID is required' },
        { status: 400 }
      );
    }

    // Query email strictly constrained by userId to enforce multi-tenant isolation
    const email = await prisma.email.findFirst({
      where: {
        userId: user.id,
        OR: [{ id }, { providerMessageId: id }],
      },
      include: {
        thread: {
          include: {
            emails: {
              where: { userId: user.id },
              orderBy: { receivedAt: 'asc' },
            },
          },
        },
      },
    });

    if (!email) {
      return NextResponse.json(
        { error: 'Email not found' },
        { status: 404 }
      );
    }

    interface EmailRecord {
      id: string;
      providerMessageId: string;
      threadId: string;
      providerThreadId: string;
      sender: string;
      senderEmail: string;
      recipients: string;
      cc: string | null;
      bcc: string | null;
      subject: string;
      bodyText: string | null;
      bodyHtml: string | null;
      snippet: string | null;
      receivedAt: Date;
      sentAt: Date | null;
      isRead: boolean;
      isStarred: boolean;
      labels: string[];
    }

    const formatMessage = (msg: EmailRecord): MailDetail => ({
      id: msg.id,
      providerMessageId: msg.providerMessageId,
      threadId: msg.threadId,
      providerThreadId: msg.providerThreadId,
      sender: msg.sender,
      senderEmail: msg.senderEmail,
      recipients: msg.recipients ? msg.recipients.split(', ') : [],
      cc: msg.cc ? msg.cc.split(', ') : [],
      bcc: msg.bcc ? msg.bcc.split(', ') : [],
      subject: msg.subject,
      bodyText: msg.bodyText || '',
      bodyHtml: msg.bodyHtml || '',
      snippet: msg.snippet || '',
      receivedAt: msg.receivedAt.toISOString(),
      sentAt: msg.sentAt ? msg.sentAt.toISOString() : null,
      isRead: msg.isRead,
      isStarred: msg.isStarred,
      labels: msg.labels,
    });

    const threadDetail: MailThreadDetail = {
      id: email.thread.id,
      providerThreadId: email.thread.providerThreadId,
      snippet: email.thread.snippet,
      messageCount: email.thread.messageCount,
      hasUnread: email.thread.hasUnread,
      isStarred: email.thread.isStarred,
      lastMessageAt: email.thread.lastMessageAt.toISOString(),
      messages: email.thread.emails.map(formatMessage),
    };

    return NextResponse.json({
      email: formatMessage(email),
      thread: threadDetail,
    });
  } catch (error) {
    console.error('[Email Detail API Error]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to retrieve email details' },
      { status: 500 }
    );
  }
}
