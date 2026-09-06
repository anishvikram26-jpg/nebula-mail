'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Mail, Sparkles, ShieldCheck, ArrowRight, AlertCircle, RefreshCw, KeyRound } from 'lucide-react';

function LoginContent() {
  const searchParams = useSearchParams();
  const errorParam = searchParams.get('error');
  const [isLoading, setIsLoading] = useState(false);

  const getErrorMessage = (code: string | null) => {
    switch (code) {
      case 'access_denied':
        return 'Sign in was cancelled or permission was denied. Please grant required Gmail permissions to continue.';
      case 'oauth_config_missing':
        return 'Google OAuth credentials are not configured. Please ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are provided in .env.local.';
      case 'invalid_oauth_state':
        return 'OAuth security validation failed (invalid state). Please try again.';
      case 'token_exchange_failed':
        return 'Failed to exchange authorization code for Google access token. Please check your credentials.';
      case 'profile_incomplete':
        return 'Unable to fetch user profile information from Google. Please ensure your Google account has an email address.';
      case 'missing_code_or_state':
        return 'Missing authorization code or security state from Google OAuth redirect.';
      default:
        return code ? `Authentication failed: ${decodeURIComponent(code)}` : null;
    }
  };

  const errorMessage = getErrorMessage(errorParam);

  return (
    <div className="relative flex min-h-screen w-full items-center justify-center overflow-hidden bg-slate-950 px-4 py-12 text-slate-100">
      {/* Dynamic Background Glows */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-violet-600/20 blur-3xl" />
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-80 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-500/10 blur-3xl" />

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md">
        {/* Header Branding */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-tr from-indigo-600 to-violet-500 shadow-lg shadow-indigo-500/30">
            <Mail className="h-7 w-7 text-white" />
          </div>
          <div className="flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-white">Nebula Mail</h1>
            <span className="rounded-full border border-indigo-500/30 bg-indigo-500/10 px-2.5 py-0.5 text-xs font-semibold text-indigo-400">
              AI Powered
            </span>
          </div>
          <p className="mt-2 text-sm text-slate-400">
            Production-quality intelligent email workspace connecting to your real Gmail account
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-6 shadow-2xl backdrop-blur-xl sm:p-8">
          {/* Error Alert */}
          {errorMessage && (
            <div className="mb-6 flex items-start gap-3 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-300">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" />
              <div className="flex-1">
                <p className="font-semibold text-red-200">Authentication Error</p>
                <p className="mt-1 text-xs leading-relaxed text-red-300/90">{errorMessage}</p>
              </div>
            </div>
          )}

          {/* Value Props */}
          <div className="mb-6 space-y-2.5 rounded-xl border border-slate-800 bg-slate-950/40 p-4 text-xs text-slate-300">
            <div className="flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Official Google OAuth 2.0 with offline access</span>
            </div>
            <div className="flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span>Context-aware AI copilot with direct UI controls</span>
            </div>
            <div className="flex items-center gap-2.5">
              <RefreshCw className="h-4 w-4 text-sky-400" />
              <span>Real-time mailbox sync and conversation threads</span>
            </div>
          </div>

          {/* Continue with Google Action */}
          <Link
            href="/api/auth/google"
            prefetch={false}
            onClick={() => setIsLoading(true)}
            className="group relative flex w-full items-center justify-center gap-3 rounded-xl bg-white px-5 py-3.5 text-sm font-semibold text-slate-900 shadow-lg shadow-white/5 transition duration-200 hover:bg-slate-100 hover:shadow-xl active:scale-[0.99]"
          >
            {isLoading ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin text-slate-700" />
                <span>Redirecting to Google...</span>
              </>
            ) : (
              <>
                {/* Google Official Multi-Color SVG Icon */}
                <svg className="h-5 w-5" viewBox="0 0 24 24">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.27 21.39 7.35 24 12 24z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.27A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.27V6.58H1.26A11.96 11.96 0 0 0 0 12c0 1.92.45 3.74 1.26 5.42l4.02-3.15z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.27 2.61 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                  />
                </svg>
                <span>Continue with Google</span>
                <ArrowRight className="ml-auto h-4 w-4 text-slate-400 transition-transform group-hover:translate-x-0.5" />
              </>
            )}
          </Link>

          {/* Setup Instructions Helper */}
          <div className="mt-6 border-t border-slate-800/80 pt-4 text-center">
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500">
              <KeyRound className="h-3.5 w-3.5 text-slate-400" />
              <span>Requires Gmail API enabled in Google Cloud Console</span>
            </div>
            <p className="mt-1 text-[11px] text-slate-600">
              Redirect URI: <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-400">http://localhost:3000/api/auth/callback/google</code>
            </p>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-slate-500">
          Built for the Nebula KnowLab Engineering Task • Strict Server-Side Security
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-400">
          <RefreshCw className="h-6 w-6 animate-spin text-indigo-400" />
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
