import { create } from 'zustand';
import { MailFolder } from '@/lib/gmail/types';

export interface ComposeDraft {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
  draftId?: string;
}

export interface SendEmailPayload {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  textBody: string;
  htmlBody?: string;
  threadId?: string;
  inReplyTo?: string;
  references?: string;
}

export interface MailFilters {
  unreadOnly: boolean;
  starredOnly: boolean;
  /** ISO date string — set by AI date-range search, cleared on resetFilters */
  dateFrom?: string;
  /** ISO date string — set by AI date-range search, cleared on resetFilters */
  dateTo?: string;
}

export interface MailPaginationState {
  page: number;
  limit: number;
  totalCount: number;
  totalPages: number;
  hasNextPage?: boolean;
  hasPrevPage?: boolean;
}

export interface MailStoreState {
  // Navigation & View
  currentFolder: MailFolder;
  selectedEmailId: string | null;
  isSidebarOpen: boolean;

  // Search & Filters
  searchQuery: string;
  filters: MailFilters;

  // Pagination
  pagination: MailPaginationState;

  // Compose Modal / Panel
  isComposeOpen: boolean;
  composeDraft: ComposeDraft;
  isSending: boolean;
  sendError: string | null;
  sendSuccess: boolean;

  // Human Confirmation Before Send
  isConfirmationOpen: boolean;
  pendingSendPayload: SendEmailPayload | null;

  // Synchronization
  isSyncing: boolean;
  syncMessage: string | null;

  // Actions (Used by both manual user interactions and future AI tools)
  setFolder: (folder: MailFolder) => void;
  selectEmail: (id: string | null) => void;
  setSearchQuery: (query: string) => void;
  setFilters: (filters: Partial<MailFilters>) => void;
  resetFilters: () => void;
  setPage: (page: number) => void;
  setPagination: (pagination: Partial<MailPaginationState>) => void;
  openCompose: (draft?: Partial<ComposeDraft>) => void;
  closeCompose: () => void;
  setComposeDraft: (draft: Partial<ComposeDraft>) => void;
  updateComposeDraft: (fields: Partial<ComposeDraft>) => void;
  clearCompose: () => void;
  resetComposeDraft: () => void;
  setSending: (isSending: boolean) => void;
  setSendError: (error: string | null) => void;
  setSendSuccess: (success: boolean) => void;
  openConfirmation: (payload: SendEmailPayload) => void;
  closeConfirmation: () => void;
  setIsSyncing: (isSyncing: boolean, message?: string | null) => void;
  toggleSidebar: () => void;
  setSidebarOpen: (isOpen: boolean) => void;
}

const DEFAULT_DRAFT: ComposeDraft = {
  to: '',
  cc: '',
  bcc: '',
  subject: '',
  body: '',
};

const DEFAULT_PAGINATION: MailPaginationState = {
  page: 1,
  limit: 25,
  totalCount: 0,
  totalPages: 1,
};

export const useMailStore = create<MailStoreState>((set) => ({
  currentFolder: 'inbox',
  selectedEmailId: null,
  isSidebarOpen: false,

  searchQuery: '',
  filters: {
    unreadOnly: false,
    starredOnly: false,
  },

  pagination: DEFAULT_PAGINATION,

  isComposeOpen: false,
  composeDraft: DEFAULT_DRAFT,
  isSending: false,
  sendError: null,
  sendSuccess: false,

  isConfirmationOpen: false,
  pendingSendPayload: null,

  isSyncing: false,
  syncMessage: null,

  setFolder: (folder) =>
    set({
      currentFolder: folder,
      selectedEmailId: null,
      pagination: { ...DEFAULT_PAGINATION },
    }),

  selectEmail: (id) => set({ selectedEmailId: id }),

  setSearchQuery: (query) =>
    set({
      searchQuery: query,
      pagination: { ...DEFAULT_PAGINATION },
    }),

  setFilters: (newFilters) =>
    set((state) => ({
      filters: { ...state.filters, ...newFilters },
      pagination: { ...state.pagination, page: 1 },
    })),

  resetFilters: () =>
    set({
      filters: { unreadOnly: false, starredOnly: false, dateFrom: undefined, dateTo: undefined },
      searchQuery: '',
      pagination: { ...DEFAULT_PAGINATION },
    }),

  setPage: (page) =>
    set((state) => ({
      pagination: { ...state.pagination, page },
    })),

  setPagination: (newPagination) =>
    set((state) => ({
      pagination: { ...state.pagination, ...newPagination },
    })),

  openCompose: (draft) =>
    set((state) => ({
      isComposeOpen: true,
      sendError: null,
      sendSuccess: false,
      composeDraft: draft ? { ...state.composeDraft, ...draft } : state.composeDraft,
    })),

  closeCompose: () =>
    set({
      isComposeOpen: false,
      isConfirmationOpen: false,
      pendingSendPayload: null,
      sendError: null,
    }),

  setComposeDraft: (draft) =>
    set((state) => ({
      composeDraft: { ...state.composeDraft, ...draft },
    })),

  updateComposeDraft: (fields) =>
    set((state) => ({
      composeDraft: { ...state.composeDraft, ...fields },
    })),

  clearCompose: () =>
    set({
      composeDraft: DEFAULT_DRAFT,
      sendError: null,
      sendSuccess: false,
      pendingSendPayload: null,
      isConfirmationOpen: false,
    }),

  resetComposeDraft: () =>
    set({
      composeDraft: DEFAULT_DRAFT,
      sendError: null,
      sendSuccess: false,
      pendingSendPayload: null,
      isConfirmationOpen: false,
    }),

  setSending: (isSending) => set({ isSending }),

  setSendError: (error) => set({ sendError: error, isSending: false }),

  setSendSuccess: (success) =>
    set({ sendSuccess: success, isSending: false, isConfirmationOpen: false }),

  openConfirmation: (payload) =>
    set({
      isConfirmationOpen: true,
      pendingSendPayload: payload,
    }),

  closeConfirmation: () =>
    set({
      isConfirmationOpen: false,
      pendingSendPayload: null,
    }),

  setIsSyncing: (isSyncing, message = null) =>
    set({ isSyncing, syncMessage: message }),

  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),

  setSidebarOpen: (isOpen) => set({ isSidebarOpen: isOpen }),
}));
