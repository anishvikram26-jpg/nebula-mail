'use client';

import React from 'react';
import { Bot, User } from 'lucide-react';
import type { AssistantMessage } from '@/store/assistant-store';

interface AssistantMessageProps {
  message: AssistantMessage;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function AssistantMessageBubble({ message }: AssistantMessageProps) {
  const isUser = message.role === 'user';

  return (
    <div
      className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}
    >
      {/* Avatar */}
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          isUser
            ? 'bg-indigo-600 text-white'
            : message.isError
            ? 'bg-red-500/20 text-red-400'
            : 'bg-gradient-to-br from-violet-600 to-indigo-600 text-white'
        }`}
      >
        {isUser ? (
          <User className="h-3.5 w-3.5" />
        ) : (
          <Bot className="h-3.5 w-3.5" />
        )}
      </div>

      {/* Bubble */}
      <div className={`max-w-[82%] space-y-1 ${isUser ? 'items-end' : 'items-start'} flex flex-col`}>
        <div
          className={`rounded-2xl px-3.5 py-2.5 text-xs leading-relaxed ${
            isUser
              ? 'rounded-tr-sm bg-indigo-600 text-white'
              : message.isError
              ? 'rounded-tl-sm border border-red-500/20 bg-red-500/10 text-red-300'
              : 'rounded-tl-sm border border-slate-700/60 bg-slate-800/80 text-slate-200'
          }`}
        >
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
        <time className="px-1 text-[10px] text-slate-600">
          {formatTime(message.timestamp)}
        </time>
      </div>
    </div>
  );
}
