'use client';

import { useEffect } from 'react';
import { useMailStore } from '@/store/mail-store';
import { MailFolder } from '@/lib/gmail/types';
import { notFound } from 'next/navigation';

const VALID_FOLDERS: MailFolder[] = ['inbox', 'sent', 'starred', 'drafts', 'trash'];

export function FolderRouteHandler({ folder }: { folder: string }) {
  const { setFolder } = useMailStore();
  const normalized = folder.toLowerCase() as MailFolder;

  const isValid = VALID_FOLDERS.includes(normalized);

  useEffect(() => {
    if (isValid) {
      setFolder(normalized);
    }
  }, [normalized, isValid, setFolder]);

  if (!isValid) {
    notFound();
  }

  return null;
}
