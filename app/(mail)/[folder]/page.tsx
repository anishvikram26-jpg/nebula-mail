import { FolderRouteHandler } from '@/components/mail/folder-route-handler';

export default async function FolderPage({
  params,
}: {
  params: Promise<{ folder: string }>;
}) {
  const { folder } = await params;
  return <FolderRouteHandler folder={folder} />;
}
