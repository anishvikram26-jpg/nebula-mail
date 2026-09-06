import { ReactNode } from 'react';
import { requireAuth } from '@/lib/auth/middleware';
import { MailShell } from '@/components/layout/mail-shell';

export default async function MailLayout({ children }: { children: ReactNode }) {
  // Enforces server-side authentication: redirects to /login if unauthenticated
  const user = await requireAuth();

  return <MailShell user={user}>{children}</MailShell>;
}
