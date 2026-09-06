import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth/middleware';
import { prisma } from '@/lib/db/prisma';
import { MailFolder, MailListItem, MailListResponse } from '@/lib/gmail/types';
import { Prisma } from '@prisma/client';

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized: Please log in to view emails' },
        { status: 401 }
      );
    }

    const { searchParams } = request.nextUrl;
    const folder = (searchParams.get('folder')?.toLowerCase() || 'inbox') as MailFolder;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '25', 10)));
    const search = searchParams.get('search')?.trim() || '';
    const unreadOnly = searchParams.get('unread') === 'true';
    const starredOnly = searchParams.get('starred') === 'true';

    // Construct Prisma where clause strictly scoped to the authenticated user
    const where: Prisma.EmailWhereInput = {
      userId: user.id,
    };

    // Apply folder filter
    switch (folder) {
      case 'inbox':
        where.labels = { has: 'INBOX' };
        break;
      case 'sent':
        where.labels = { has: 'SENT' };
        break;
      case 'starred':
        where.isStarred = true;
        break;
      case 'trash':
        where.labels = { has: 'TRASH' };
        break;
      case 'drafts':
        where.labels = { has: 'DRAFT' };
        break;
      default:
        where.labels = { has: 'INBOX' };
        break;
    }

    // Unread filter
    if (unreadOnly) {
      where.isRead = false;
    }

    // Starred filter
    if (starredOnly) {
      where.isStarred = true;
    }

    // Text search filter
    if (search) {
      where.OR = [
        { subject: { contains: search, mode: 'insensitive' } },
        { sender: { contains: search, mode: 'insensitive' } },
        { senderEmail: { contains: search, mode: 'insensitive' } },
        { snippet: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Execute paginated query and count in parallel
    const [totalCount, rawEmails] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          providerMessageId: true,
          threadId: true,
          providerThreadId: true,
          sender: true,
          senderEmail: true,
          recipients: true,
          subject: true,
          snippet: true,
          receivedAt: true,
          sentAt: true,
          isRead: true,
          isStarred: true,
          labels: true,
        },
      }),
    ]);

    const totalPages = Math.ceil(totalCount / limit) || 1;

    const emails: MailListItem[] = rawEmails.map((email) => ({
      id: email.id,
      providerMessageId: email.providerMessageId,
      threadId: email.threadId,
      providerThreadId: email.providerThreadId,
      sender: email.sender,
      senderEmail: email.senderEmail,
      recipients: email.recipients,
      subject: email.subject,
      snippet: email.snippet || '',
      receivedAt: email.receivedAt.toISOString(),
      sentAt: email.sentAt ? email.sentAt.toISOString() : null,
      isRead: email.isRead,
      isStarred: email.isStarred,
      labels: email.labels,
    }));

    const response: MailListResponse = {
      folder,
      emails,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('[Mail List API Error]', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json(
      { error: 'Failed to retrieve email list' },
      { status: 500 }
    );
  }
}
