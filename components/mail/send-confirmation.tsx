'use client';

import React from 'react';
import { Send, X, AlertTriangle, RefreshCw } from 'lucide-react';
import { SendEmailPayload } from '@/store/mail-store';

interface SendConfirmationProps {
  payload: SendEmailPayload;
  isSending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function SendConfirmation({
  payload,
  isSending,
  onConfirm,
  onCancel,
}: SendConfirmationProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700/80 bg-slate-900 p-6 shadow-2xl shadow-black/80">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Ready to send this email?</h3>
              <p className="text-xs text-slate-400">
                Please review the recipient and contents before transmitting to Gmail.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isSending}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Email Summary Details */}
        <div className="mt-5 space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
          <div>
            <span className="font-semibold text-slate-400">To: </span>
            <span className="font-mono text-slate-200">{payload.to.join(', ')}</span>
          </div>

          {payload.cc && payload.cc.length > 0 && (
            <div>
              <span className="font-semibold text-slate-400">Cc: </span>
              <span className="font-mono text-slate-200">{payload.cc.join(', ')}</span>
            </div>
          )}

          {payload.bcc && payload.bcc.length > 0 && (
            <div>
              <span className="font-semibold text-slate-400">Bcc: </span>
              <span className="font-mono text-slate-200">{payload.bcc.join(', ')}</span>
            </div>
          )}

          <div>
            <span className="font-semibold text-slate-400">Subject: </span>
            <span className="font-medium text-white">{payload.subject || '(no subject)'}</span>
          </div>

          <div className="border-t border-slate-800/80 pt-2.5">
            <span className="block font-semibold text-slate-400 mb-1">Body Preview:</span>
            <div className="max-h-36 overflow-y-auto whitespace-pre-wrap rounded-lg bg-slate-900 p-2.5 font-sans text-slate-300 leading-relaxed text-[11px]">
              {payload.textBody || '(empty body)'}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSending}
            className="rounded-xl border border-slate-700 px-4 py-2 text-xs font-medium text-slate-300 transition hover:bg-slate-800 hover:text-white disabled:opacity-50"
          >
            Edit & Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isSending}
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition hover:bg-indigo-500 disabled:opacity-50 active:scale-95"
          >
            {isSending ? (
              <>
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                <span>Sending via Gmail...</span>
              </>
            ) : (
              <>
                <Send className="h-3.5 w-3.5" />
                <span>Confirm & Send</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
