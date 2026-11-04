import { BadRequestException } from '@nestjs/common';

// Files are not uploaded to TaskEd. People keep them in their own cloud
// storage and paste the share link. Only links to well-known document
// storage are accepted, so a shared link cannot send colleagues elsewhere.
const ALLOWED_HOSTS = [
  'drive.google.com',
  'docs.google.com',
  'onedrive.live.com',
  '1drv.ms',
  'sharepoint.com', // also matches *.sharepoint.com
];

export function cleanLink(raw: string | undefined): string {
  let u: URL;
  try {
    u = new URL((raw ?? '').trim());
  } catch {
    throw new BadRequestException('Paste a valid link.');
  }
  const host = u.hostname.toLowerCase();
  const ok = ALLOWED_HOSTS.some((h) => host === h || host.endsWith('.' + h));
  if (u.protocol !== 'https:' || u.username || u.password || !ok) {
    throw new BadRequestException(
      'Use a share link from Google Drive, Google Docs, OneDrive or SharePoint (it starts with https://).',
    );
  }
  const link = u.toString();
  if (link.length > 1500) throw new BadRequestException('That link is too long.');
  return link;
}

// One Drive folder link per person (Settings). Google Drive links must point
// to a folder; an empty value clears it.
export function cleanFolderLink(raw: string | undefined): string | null {
  if (!(raw ?? '').trim()) return null;
  const link = cleanLink(raw);
  const u = new URL(link);
  if (u.hostname === 'drive.google.com' && !/\/folders\/[A-Za-z0-9_-]+/.test(u.pathname)) {
    throw new BadRequestException('Paste the link of a Google Drive folder (it contains /folders/).');
  }
  return link;
}
