import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';

// Only these are accepted for ticket attachments / update images, keyed by
// the MIME type the browser reports. Cloudinary enforces the same list on
// its side through the signed `allowed_formats` parameter.
export const ALLOWED_UPLOAD_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'application/pdf': ['.pdf'],
};

export const SCHOOL_FILE_FORMATS: Record<'soft' | 'scanned', string[]> = {
  soft: ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'],
  scanned: ['pdf', 'jpg', 'jpeg', 'png'],
};

export type UploadPurpose = 'attachment' | 'avatar';

export interface SignedUpload {
  uploadUrl: string; // POST multipart/form-data here, straight from the browser
  fields: Record<string, string>; // include every one of these in the form
}

// Cloudinary signed uploads: the API secret never leaves the server. We
// sign the upload parameters; the browser then sends the file directly to
// Cloudinary (it never passes through this backend) along with the
// signature. The response contains `secure_url`, which the frontend saves
// on the ticket / profile.
@Injectable()
export class StorageService {
  constructor(private config: ConfigService) {}

  private creds() {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (!cloudName || !apiKey || !apiSecret) {
      throw new BadRequestException(
        'File uploads are not configured yet (missing Cloudinary settings on the server).',
      );
    }
    return { cloudName, apiKey, apiSecret };
  }

  signUpload(userId: string, purpose: UploadPurpose): SignedUpload {
    const { cloudName, apiKey, apiSecret } = this.creds();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = purpose === 'avatar' ? 'tasked/avatars' : `tasked/attachments/${userId}`;
    const allowedFormats = purpose === 'avatar' ? 'jpg' : 'jpg,pdf';

    // Everything that is sent (except file, api_key and resource_type) must
    // be signed, sorted by name.
    const toSign: Record<string, string> = {
      allowed_formats: allowedFormats,
      folder,
      timestamp,
    };
    const base = Object.keys(toSign)
      .sort()
      .map((k) => `${k}=${toSign[k]}`)
      .join('&');
    const signature = createHash('sha1').update(base + apiSecret).digest('hex');

    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      fields: { ...toSign, api_key: apiKey, signature },
    };
  }

  // School files: a "soft copy" may be an Office document or PDF, a "scanned
  // copy" a PDF or image. Cloudinary enforces the same list via allowed_formats.
  signSchoolFile(schoolId: string, kind: 'soft' | 'scanned'): SignedUpload {
    const { cloudName, apiKey, apiSecret } = this.creds();
    const toSign: Record<string, string> = {
      allowed_formats: SCHOOL_FILE_FORMATS[kind].join(','),
      folder: `tasked/school-files/${schoolId}`,
      timestamp: Math.floor(Date.now() / 1000).toString(),
    };
    const base = Object.keys(toSign)
      .sort()
      .map((k) => `${k}=${toSign[k]}`)
      .join('&');
    const signature = createHash('sha1').update(base + apiSecret).digest('hex');
    return {
      uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`,
      fields: { ...toSign, api_key: apiKey, signature },
    };
  }
}
