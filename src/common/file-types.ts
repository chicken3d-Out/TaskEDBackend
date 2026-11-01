import { BadRequestException } from '@nestjs/common';
import { Readable } from 'stream';
import { Response as ExpressResponse } from 'express';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024; // 20 MB

const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  csv: 'text/csv',
  txt: 'text/plain',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  zip: 'application/zip',
};

export const SCHOOL_FILE_FORMATS: Record<'soft' | 'scanned', string[]> = {
  soft: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  scanned: ['pdf', 'jpg', 'jpeg', 'png'],
};
// "My files": any ordinary document, spreadsheet, slide, image or archive.
export const PERSONAL_FILE_FORMATS = Object.keys(MIME);

export function extensionOf(fileName: string): string {
  return (fileName ?? '').toLowerCase().split('.').pop() ?? '';
}

// Browsers send file names as latin1 in multipart; restore UTF-8 names.
export function cleanFileName(name: string): string {
  let n = name ?? 'file';
  try {
    n = Buffer.from(n, 'latin1').toString('utf8');
  } catch {
    /* keep as is */
  }
  return n.replace(/[\\/\u0000-\u001f]/g, '-').slice(0, 180) || 'file';
}

export function assertAllowedFile(file: Express.Multer.File | undefined, allowed: string[]): { ext: string; mime: string; name: string } {
  if (!file) throw new BadRequestException('Choose a file to upload');
  if (file.size > MAX_UPLOAD_BYTES) throw new BadRequestException('That file is too large (20 MB maximum).');
  const name = cleanFileName(file.originalname);
  const ext = extensionOf(name);
  if (!allowed.includes(ext)) {
    throw new BadRequestException(`That file type is not accepted. Allowed: ${allowed.join(', ')}`);
  }
  return { ext, mime: MIME[ext] ?? 'application/octet-stream', name };
}

export function mimeFor(fileName: string): string {
  return MIME[extensionOf(fileName)] ?? 'application/octet-stream';
}

// Streams a fetch() Response body straight to the browser.
export function pipeToClient(res: ExpressResponse, source: Response, fileName: string, mime: string) {
  res.setHeader('Content-Type', mime);
  const len = source.headers.get('content-length');
  if (len) res.setHeader('Content-Length', len);
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`);
  res.setHeader('Cache-Control', 'private, no-store');
  if (!source.body) {
    res.end();
    return;
  }
  Readable.fromWeb(source.body as any).pipe(res);
}
