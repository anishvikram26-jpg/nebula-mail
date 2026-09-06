import { FolderRouteHandler } from '@/components/mail/folder-route-handler';

export default function MailRootPage() {
  // Default mail view displays Inbox
  return <FolderRouteHandler folder="inbox" />;
}
