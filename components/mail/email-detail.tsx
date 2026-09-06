'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, Star, Clock, User, AlertCircle, Reply } from 'lucide-react';
import { useMailStore } from '@/store/mail-store';
import { MailDetail, MailThreadDetail } from '@/lib/gmail/types';
import { MailDetailSkeleton } from '@/components/mail/loading-state';
import { ThreadView } from '@/components/mail/thread-view';

interface EmailDetailData {
  email: MailDetail;
  thread: MailThreadDetail;
}

export function EmailDetail({ emailId }: { emailId: string }) {
  const { selectEmail, openCompose } = useMailStore();
  const [data, setData] = useState<EmailDetailData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function fetchEmailDetail() {
      setIsLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/mail/${encodeURIComponent(emailId)}`);

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to load email (HTTP ${res.status})`);
        }

        const json: EmailDetailData = await res.json();
        if (isMounted) {
          setData(json);
        }
      } catch (err) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : 'Failed to retrieve email details');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    fetchEmailDetail();

    return () => {
      isMounted = false;
    };
  }, [emailId]);

  if (isLoading) {
    return (
      <div className="flex flex-1 flex-col overflow-y-auto bg-slate-950">
        <div className="border-b border-slate-800 p-4">
          <button
            type="button"
            onClick={() => selectEmail(null)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to list</span>
          </button>
        </div>
        <MailDetailSkeleton />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center bg-slate-950">
        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/10 text-red-400">
          <AlertCircle className="h-6 w-6" />
        </div>
        <h3 className="text-base font-semibold text-slate-200">Email Not Available</h3>
        <p className="mt-1 max-w-sm text-xs text-slate-400">{error || 'Email could not be found.'}</p>
        <button
          type="button"
          onClick={() => selectEmail(null)}
          className="mt-5 flex items-center gap-2 rounded-xl bg-slate-800 px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-700"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to list</span>
        </button>
      </div>
    );
  }

  const { email, thread } = data;

  const formattedDate = (() => {
    try {
      return new Date(email.receivedAt).toLocaleString([], {
        dateStyle: 'full',
        timeStyle: 'short',
      });
    } catch {
      return email.receivedAt;
    }
  })();

  const handleReply = () => {
    const rawSubject = email.subject || '';
    const replySubject = rawSubject.toLowerCase().startsWith('re:')
      ? rawSubject
      : `Re: ${rawSubject}`;

    const quoteText = email.bodyText
      ? email.bodyText
          .split('\n')
          .map((line) => `> ${line}`)
          .join('\n')
      : '';

    const quoteHeader = `\n\nOn ${formattedDate}, ${email.sender} <${email.senderEmail}> wrote:\n${quoteText}`;

    openCompose({
      to: email.senderEmail,
      subject: replySubject,
      body: quoteHeader,
      threadId: email.providerThreadId,
      inReplyTo: email.providerMessageId,
      references: email.providerMessageId,
    });
  };

  return (
    <div className="flex flex-1 flex-col overflow-y-auto bg-slate-950 text-slate-100">
      {/* Top Action Bar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/90 px-4 py-3 backdrop-blur-md sm:px-6">
        <button
          type="button"
          onClick={() => selectEmail(null)}
          className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleReply}
            className="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-95"
            title="Reply to sender"
          >
            <Reply className="h-3.5 w-3.5" />
            <span>Reply</span>
          </button>

          {email.labels && email.labels.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {email.labels
                .filter((l) => !['INBOX', 'UNREAD'].includes(l))
                .map((l) => (
                  <span
                    key={l}
                    className="rounded bg-slate-800 px-2 py-0.5 text-[10px] font-medium text-slate-400"
                  >
                    {l.toLowerCase()}
                  </span>
                ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Email Content */}
      <div className="mx-auto w-full max-w-4xl p-6 sm:p-8">
        {/* Subject Header */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              {email.subject || '(no subject)'}
            </h1>
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-400">
              <Clock className="h-3.5 w-3.5" />
              <span>{formattedDate}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Star
              className={`h-5 w-5 ${
                email.isStarred ? 'fill-amber-400 text-amber-400' : 'text-slate-600'
              }`}
            />
          </div>
        </div>

        {/* Sender & Recipient Information */}
        <div className="my-6 flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-indigo-600 to-violet-600 text-white shadow-md shadow-indigo-600/20">
            <User className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1 space-y-0.5">
            <div className="flex flex-wrap items-baseline gap-2">
              <span className="font-semibold text-sm text-white">{email.sender}</span>
              <span className="text-xs text-slate-400">&lt;{email.senderEmail}&gt;</span>
            </div>

            <div className="text-xs text-slate-400">
              <span className="text-slate-500">To: </span>
              <span>{email.recipients.join(', ') || 'undisclosed-recipients'}</span>
            </div>

            {email.cc && email.cc.length > 0 && (
              <div className="text-xs text-slate-400">
                <span className="text-slate-500">Cc: </span>
                <span>{email.cc.join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* Primary Email Body (Sanitized HTML or Plain Text) */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 shadow-sm">
          {email.bodyHtml ? (
            <div
              className="email-body prose prose-invert max-w-none text-sm text-slate-200 leading-relaxed overflow-x-auto"
              dangerouslySetInnerHTML={{ __html: email.bodyHtml }}
            />
          ) : (
            <pre className="whitespace-pre-wrap font-sans text-sm text-slate-200 leading-relaxed">
              {email.bodyText || 'No message content.'}
            </pre>
          )}
        </div>

        {/* Conversation Thread History */}
        {thread && thread.messages && (
          <ThreadView messages={thread.messages} activeMessageId={email.id} />
        )}

        {/* Quick Reply Action Bar at Bottom */}
        <div className="mt-8 flex items-center justify-between border-t border-slate-800/80 pt-6">
          <button
            type="button"
            onClick={handleReply}
            className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900/80 px-4 py-2.5 text-xs font-semibold text-slate-200 transition hover:border-indigo-500/50 hover:bg-indigo-600/10 hover:text-white"
          >
            <Reply className="h-4 w-4 text-indigo-400" />
            <span>Reply to {email.sender}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
