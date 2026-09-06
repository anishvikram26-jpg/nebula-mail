'use client';

import React, { useState } from 'react';
import { X, Send, Save, AlertCircle } from 'lucide-react';
import { useMailStore, SendEmailPayload } from '@/store/mail-store';
import { isValidEmailAddress } from '@/lib/gmail/validation';
import { SendConfirmation } from '@/components/mail/send-confirmation';
import { toast } from 'sonner';

export function ComposeModal() {
  const {
    isComposeOpen,
    closeCompose,
    composeDraft,
    updateComposeDraft,
    clearCompose,
    isSending,
    setSending,
    sendError,
    setSendError,
    isConfirmationOpen,
    pendingSendPayload,
    openConfirmation,
    closeConfirmation,
    setIsSyncing,
  } = useMailStore();

  const [showCc, setShowCc] = useState(!!composeDraft.cc);
  const [showBcc, setShowBcc] = useState(!!composeDraft.bcc);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [showClosePrompt, setShowClosePrompt] = useState(false);

  if (!isComposeOpen) return null;

  const hasUnsavedContent = Boolean(
    composeDraft.to.trim() ||
    composeDraft.subject.trim() ||
    composeDraft.body.trim()
  );

  const handleCloseClick = () => {
    if (hasUnsavedContent) {
      setShowClosePrompt(true);
    } else {
      clearCompose();
      closeCompose();
    }
  };

  // Parses comma or whitespace separated recipient input into list
  const parseRecipients = (raw: string): string[] => {
    return raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  };

  const handleInitiateSend = () => {
    setValidationError(null);
    setSendError(null);

    const toList = parseRecipients(composeDraft.to);
    const ccList = parseRecipients(composeDraft.cc);
    const bccList = parseRecipients(composeDraft.bcc);

    if (toList.length === 0) {
      setValidationError('Please specify at least one recipient in the "To" field.');
      return;
    }

    const invalidTo = toList.find((email) => !isValidEmailAddress(email));
    if (invalidTo) {
      setValidationError(`Invalid recipient address: "${invalidTo}"`);
      return;
    }

    const invalidCc = ccList.find((email) => !isValidEmailAddress(email));
    if (invalidCc) {
      setValidationError(`Invalid Cc address: "${invalidCc}"`);
      return;
    }

    const invalidBcc = bccList.find((email) => !isValidEmailAddress(email));
    if (invalidBcc) {
      setValidationError(`Invalid Bcc address: "${invalidBcc}"`);
      return;
    }

    const payload: SendEmailPayload = {
      to: toList,
      cc: ccList.length > 0 ? ccList : undefined,
      bcc: bccList.length > 0 ? bccList : undefined,
      subject: composeDraft.subject.trim(),
      textBody: composeDraft.body.trim(),
      threadId: composeDraft.threadId,
      inReplyTo: composeDraft.inReplyTo,
      references: composeDraft.references,
    };

    // Open human-in-the-loop confirmation modal
    openConfirmation(payload);
  };

  const handleConfirmedSend = async () => {
    if (!pendingSendPayload || isSending) return;

    setSending(true);
    setSendError(null);

    try {
      const endpoint = pendingSendPayload.threadId ? '/api/mail/reply' : '/api/mail/send';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingSendPayload),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to send email through Gmail.');
      }

      toast.success('Email sent successfully via Gmail!');
      closeConfirmation();
      clearCompose();
      closeCompose();

      // Trigger mailbox sync to fetch updated sent folder
      setIsSyncing(true, 'Updating Sent folder...');
      fetch('/api/mail/sync', { method: 'POST' }).finally(() => {
        setIsSyncing(false);
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Send error occurred';
      setSendError(msg);
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleSaveDraft = async (): Promise<boolean> => {
    setIsSavingDraft(true);
    try {
      const toList = parseRecipients(composeDraft.to);
      const ccList = parseRecipients(composeDraft.cc);
      const bccList = parseRecipients(composeDraft.bcc);

      const res = await fetch('/api/mail/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toList,
          cc: ccList,
          bcc: bccList,
          subject: composeDraft.subject,
          textBody: composeDraft.body,
          threadId: composeDraft.threadId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save draft.');
      }

      toast.success('Draft saved to Gmail');
      // Sync mailbox in background so Drafts folder reflects the new draft
      fetch('/api/mail/sync', { method: 'POST' }).catch(() => {});
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Draft could not be saved');
      return false;
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSaveAndClose = async () => {
    const success = await handleSaveDraft();
    if (success) {
      setShowClosePrompt(false);
      clearCompose();
      closeCompose();
    }
  };

  const handleDiscard = () => {
    setShowClosePrompt(false);
    clearCompose();
    closeCompose();
  };

  return (
    <>
      <div className="fixed bottom-0 right-4 z-40 w-full max-w-2xl rounded-t-2xl border border-slate-700/80 bg-slate-900 shadow-2xl shadow-black/80 backdrop-blur-2xl transition-all sm:right-8">
        {/* Compose Header Bar */}
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900 px-4 py-3 rounded-t-2xl">
          <h3 className="text-xs font-semibold text-white">
            {composeDraft.threadId ? 'Reply' : 'New Message'}
          </h3>
          <div className="flex items-center gap-1.5 text-slate-400">
            <button
              type="button"
              onClick={handleCloseClick}
              className="flex h-6 w-6 items-center justify-center rounded-md hover:bg-slate-800 hover:text-white"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Validation Error Alert */}
        {(validationError || sendError) && (
          <div className="mx-4 mt-3 flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
            <span>{validationError || sendError}</span>
          </div>
        )}

        {/* Form Fields */}
        <div className="p-4 space-y-2.5">
          {/* Recipient To */}
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
            <span className="w-12 text-xs font-medium text-slate-400">To:</span>
            <input
              type="text"
              value={composeDraft.to}
              onChange={(e) => updateComposeDraft({ to: e.target.value })}
              placeholder="recipient@example.com"
              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none"
            />
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              {!showCc && (
                <button
                  type="button"
                  onClick={() => setShowCc(true)}
                  className="hover:text-indigo-400"
                >
                  Cc
                </button>
              )}
              {!showBcc && (
                <button
                  type="button"
                  onClick={() => setShowBcc(true)}
                  className="hover:text-indigo-400"
                >
                  Bcc
                </button>
              )}
            </div>
          </div>

          {/* Recipient Cc */}
          {showCc && (
            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <span className="w-12 text-xs font-medium text-slate-400">Cc:</span>
              <input
                type="text"
                value={composeDraft.cc}
                onChange={(e) => updateComposeDraft({ cc: e.target.value })}
                placeholder="cc@example.com"
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>
          )}

          {/* Recipient Bcc */}
          {showBcc && (
            <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
              <span className="w-12 text-xs font-medium text-slate-400">Bcc:</span>
              <input
                type="text"
                value={composeDraft.bcc}
                onChange={(e) => updateComposeDraft({ bcc: e.target.value })}
                placeholder="bcc@example.com"
                className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>
          )}

          {/* Subject */}
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-2">
            <span className="w-12 text-xs font-medium text-slate-400">Subject:</span>
            <input
              type="text"
              value={composeDraft.subject}
              onChange={(e) => updateComposeDraft({ subject: e.target.value })}
              placeholder="Message subject"
              className="flex-1 bg-transparent text-xs text-white placeholder-slate-500 outline-none font-medium"
            />
          </div>

          {/* Message Body */}
          <div className="pt-1">
            <textarea
              rows={8}
              value={composeDraft.body}
              onChange={(e) => updateComposeDraft({ body: e.target.value })}
              placeholder="Write your email here..."
              className="w-full resize-none bg-transparent text-xs text-slate-200 placeholder-slate-500 outline-none leading-relaxed"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between border-t border-slate-800 bg-slate-950/60 px-4 py-3">
          <div className="flex items-center gap-2">
            {/* Send Button -> triggers Confirmation Modal */}
            <button
              type="button"
              onClick={handleInitiateSend}
              disabled={isSending}
              className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-95 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Send</span>
            </button>

            {/* Save Draft Button */}
            <button
              type="button"
              onClick={handleSaveDraft}
              disabled={isSavingDraft || isSending}
              className="flex items-center gap-1.5 rounded-xl border border-slate-800 px-3 py-2 text-xs font-medium text-slate-400 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{isSavingDraft ? 'Saving...' : 'Save Draft'}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={handleCloseClick}
            className="rounded-xl px-3 py-2 text-xs font-medium text-red-400 hover:bg-red-500/10"
          >
            Discard
          </button>
        </div>
      </div>

      {/* Save Draft Before Closing Modal */}
      {showClosePrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in">
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl space-y-4">
            <h3 className="text-sm font-semibold text-white">Save Draft to Gmail?</h3>
            <p className="text-xs text-slate-300 leading-relaxed">
              You have unsaved text in your email. Would you like to save this message to your Gmail Drafts before closing?
            </p>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                onClick={handleSaveAndClose}
                disabled={isSavingDraft}
                className="w-full rounded-xl bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:opacity-50"
              >
                {isSavingDraft ? 'Saving Draft...' : 'Save Draft & Close'}
              </button>
              <button
                type="button"
                onClick={handleDiscard}
                className="w-full rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2 text-xs font-medium text-red-400 hover:bg-red-500/20"
              >
                Discard Changes
              </button>
              <button
                type="button"
                onClick={() => setShowClosePrompt(false)}
                className="w-full rounded-xl border border-slate-800 px-4 py-2 text-xs font-medium text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Human-in-the-loop Send Confirmation Modal */}
      {isConfirmationOpen && pendingSendPayload && (
        <SendConfirmation
          payload={pendingSendPayload}
          isSending={isSending}
          onConfirm={handleConfirmedSend}
          onCancel={closeConfirmation}
        />
      )}
    </>
  );
}
