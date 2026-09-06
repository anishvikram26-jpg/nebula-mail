/**
 * Zustand store for the AI assistant panel state.
 * Manages conversation messages, loading state, and panel visibility.
 * Does NOT duplicate mail state — all mail actions go through useMailStore().
 */

import { create } from 'zustand';
import type { AIAction } from '@/lib/ai/types';

export type MessageRole = 'user' | 'assistant';

export interface AssistantMessage {
  id: string;
  role: MessageRole;
  content: string;
  /** Structured action attached to this message (for display/dispatch) */
  action?: AIAction | null;
  /** ISO timestamp */
  timestamp: string;
  /** Whether this message represents an error */
  isError?: boolean;
}

export interface AssistantStoreState {
  /** Whether the assistant panel is visible */
  isOpen: boolean;
  /** Conversation history */
  messages: AssistantMessage[];
  /** Whether an AI request is in flight */
  isLoading: boolean;

  // ── Actions ────────────────────────────────────────────────────────────────
  togglePanel: () => void;
  openPanel: () => void;
  closePanel: () => void;
  addMessage: (msg: Omit<AssistantMessage, 'id' | 'timestamp'>) => void;
  setLoading: (loading: boolean) => void;
  clearMessages: () => void;
}

let _msgCounter = 0;
function nextId(): string {
  return `msg_${++_msgCounter}_${Date.now()}`;
}

export const useAssistantStore = create<AssistantStoreState>((set) => ({
  isOpen: false,
  messages: [],
  isLoading: false,

  togglePanel: () => set((state) => ({ isOpen: !state.isOpen })),
  openPanel: () => set({ isOpen: true }),
  closePanel: () => set({ isOpen: false }),

  addMessage: (msg) =>
    set((state) => ({
      messages: [
        ...state.messages,
        {
          ...msg,
          id: nextId(),
          timestamp: new Date().toISOString(),
        },
      ],
    })),

  setLoading: (loading) => set({ isLoading: loading }),

  clearMessages: () => set({ messages: [] }),
}));
