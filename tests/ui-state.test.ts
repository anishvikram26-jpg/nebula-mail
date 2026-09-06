import { describe, it, expect, beforeEach } from 'vitest';
import { useMailStore } from '@/store/mail-store';

describe('Mail Application UI & Store State', () => {
  beforeEach(() => {
    // Reset state before each test
    useMailStore.setState({
      currentFolder: 'inbox',
      selectedEmailId: null,
      searchQuery: '',
      filters: { unreadOnly: false, starredOnly: false },
      pagination: { page: 1, limit: 25, totalCount: 0, totalPages: 1 },
      isComposeOpen: false,
      composeDraft: { to: '', cc: '', bcc: '', subject: '', body: '' },
      isSyncing: false,
      isSidebarOpen: false,
    });
  });

  it('should switch folders and reset selected email and pagination', () => {
    const store = useMailStore.getState();
    store.selectEmail('msg_123');
    store.setPage(3);

    expect(useMailStore.getState().selectedEmailId).toBe('msg_123');
    expect(useMailStore.getState().pagination.page).toBe(3);

    // Switch to sent folder
    store.setFolder('sent');

    expect(useMailStore.getState().currentFolder).toBe('sent');
    expect(useMailStore.getState().selectedEmailId).toBeNull();
    expect(useMailStore.getState().pagination.page).toBe(1);
  });

  it('should update search query and reset pagination to first page', () => {
    const store = useMailStore.getState();
    store.setPage(4);

    store.setSearchQuery('quarterly report');

    expect(useMailStore.getState().searchQuery).toBe('quarterly report');
    expect(useMailStore.getState().pagination.page).toBe(1);
  });

  it('should toggle and reset filters properly', () => {
    const store = useMailStore.getState();

    store.setFilters({ unreadOnly: true });
    expect(useMailStore.getState().filters.unreadOnly).toBe(true);
    expect(useMailStore.getState().filters.starredOnly).toBe(false);

    store.setFilters({ starredOnly: true });
    expect(useMailStore.getState().filters.unreadOnly).toBe(true);
    expect(useMailStore.getState().filters.starredOnly).toBe(true);

    store.resetFilters();
    expect(useMailStore.getState().filters.unreadOnly).toBe(false);
    expect(useMailStore.getState().filters.starredOnly).toBe(false);
    expect(useMailStore.getState().searchQuery).toBe('');
  });

  it('should manage compose open, prefilled drafts, updates, and close actions', () => {
    const store = useMailStore.getState();

    expect(store.isComposeOpen).toBe(false);

    // Open with prefilled draft (as manual user or future AI action will)
    store.openCompose({
      to: 'sarah@example.com',
      subject: 'Meeting follow-up',
      body: 'Hi Sarah,\nGreat discussing the project.',
    });

    const activeState = useMailStore.getState();
    expect(activeState.isComposeOpen).toBe(true);
    expect(activeState.composeDraft.to).toBe('sarah@example.com');
    expect(activeState.composeDraft.subject).toBe('Meeting follow-up');

    // Update draft content
    store.updateComposeDraft({ body: 'Hi Sarah,\nUpdated message.' });
    expect(useMailStore.getState().composeDraft.body).toBe('Hi Sarah,\nUpdated message.');

    // Close compose
    store.closeCompose();
    expect(useMailStore.getState().isComposeOpen).toBe(false);
  });

  it('should manage human-in-the-loop confirmation modal state and payload', () => {
    const store = useMailStore.getState();

    expect(store.isConfirmationOpen).toBe(false);
    expect(store.pendingSendPayload).toBeNull();

    const samplePayload = {
      to: ['john@example.com'],
      subject: 'Meeting Tomorrow',
      textBody: 'Let us meet at 3pm.',
    };

    store.openConfirmation(samplePayload);

    const confirmationState = useMailStore.getState();
    expect(confirmationState.isConfirmationOpen).toBe(true);
    expect(confirmationState.pendingSendPayload).toEqual(samplePayload);

    store.closeConfirmation();
    expect(useMailStore.getState().isConfirmationOpen).toBe(false);
    expect(useMailStore.getState().pendingSendPayload).toBeNull();
  });

  it('should track sending progress and error states', () => {
    const store = useMailStore.getState();

    expect(store.isSending).toBe(false);
    expect(store.sendError).toBeNull();

    store.setSending(true);
    expect(useMailStore.getState().isSending).toBe(true);

    store.setSendError('Network error connecting to Gmail');
    expect(useMailStore.getState().sendError).toBe('Network error connecting to Gmail');

    store.setSending(false);
    store.setSendSuccess(true);
    expect(useMailStore.getState().isSending).toBe(false);
    expect(useMailStore.getState().sendSuccess).toBe(true);
  });

  it('should track synchronization state and messages', () => {
    const store = useMailStore.getState();

    store.setIsSyncing(true, 'Syncing messages from Gmail...');
    expect(useMailStore.getState().isSyncing).toBe(true);
    expect(useMailStore.getState().syncMessage).toBe('Syncing messages from Gmail...');

    store.setIsSyncing(false, null);
    expect(useMailStore.getState().isSyncing).toBe(false);
    expect(useMailStore.getState().syncMessage).toBeNull();
  });
});
