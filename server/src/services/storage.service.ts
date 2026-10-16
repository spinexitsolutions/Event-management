import { promises as fs, createReadStream } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import { env } from '../config/env';
import { AppError } from '../lib/AppError';
import { randomToken } from '../lib/crypto';

/**
 * File storage. Production uses Cloudinary (STORAGE_DRIVER=cloudinary); development stores files on disk.
 *  - Public files: /uploads/<file> (local) or Cloudinary delivery URLs.
 *  - Private files (contracts, client uploads): never publicly addressable; streamed through an
 *    authorised API endpoint (local) or short-lived signed URLs (Cloudinary "authenticated" type).
 */
export const UPLOAD_ROOT = path.resolve(process.cwd(), env.UPLOAD_DIR);
const PUBLIC_DIR = path.join(UPLOAD_ROOT, 'public');
const PRIVATE_DIR = path.join(UPLOAD_ROOT, 'private');

if (env.STORAGE_DRIVER === 'cloudinary') {
  cloudinary.config({ cloud_name: env.CLOUDINARY_CLOUD_NAME, api_key: env.CLOUDINARY_API_KEY, api_secret: env.CLOUDINARY_API_SECRET, secure: true });
}

const SIGNATURES: { mime: string; kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; test: (b: Buffer) => boolean }[] = [
  { mime: 'image/jpeg', kind: 'IMAGE', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mime: 'image/png', kind: 'IMAGE', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mime: 'image/gif', kind: 'IMAGE', test: (b) => b.subarray(0, 4).toString('ascii') === 'GIF8' },
  { mime: 'image/webp', kind: 'IMAGE', test: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
  { mime: 'image/avif', kind: 'IMAGE', test: (b) => b.subarray(4, 12).toString('ascii').startsWith('ftypavi') },
  { mime: 'video/mp4', kind: 'VIDEO', test: (b) => b.subarray(4, 8).toString('ascii') === 'ftyp' && !b.subarray(8, 12).toString('ascii').startsWith('avi') },
  { mime: 'video/webm', kind: 'VIDEO', test: (b) => b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3 },
  { mime: 'application/pdf', kind: 'DOCUMENT', test: (b) => b.subarray(0, 5).toString('ascii') === '%PDF-' },
];

/** Detects the real file type from magic bytes (the client-supplied mimetype is not trusted). */
export function sniff(buf: Buffer) {
  return SIGNATURES.find((s) => s.test(buf)) ?? null;
}

export interface StoredFile {
  url: string;
  provider: 'local' | 'cloudinary';
  storageKey: string;
  mime: string;
  kind: 'IMAGE' | 'VIDEO' | 'DOCUMENT';
  sizeBytes: number;
  width?: number;
  height?: number;
}

export interface StoreOptions {
  isPrivate?: boolean;
  allow?: ('IMAGE' | 'VIDEO' | 'DOCUMENT')[];
}

export async function storeFile(buffer: Buffer, originalName: string, opts: StoreOptions = {}): Promise<StoredFile> {
  const type = sniff(buffer);
  const allow = opts.allow ?? ['IMAGE', 'VIDEO', 'DOCUMENT'];
  if (!type || !allow.includes(type.kind)) {
    throw new AppError(415, 'UNSUPPORTED_FILE', `Unsupported file type. Allowed: ${allow.map((k) => ({ IMAGE: 'JPG/PNG/WebP/AVIF/GIF', VIDEO: 'MP4/WebM', DOCUMENT: 'PDF' })[k]).join(', ')}`);
  }
  let data = buffer;
  let mime = type.mime;
  let width: number | undefined;
  let height: number | undefined;

  if (type.kind === 'IMAGE' && type.mime !== 'image/gif') {
    // Re-encode: strips metadata (EXIF/GPS), bounds dimensions, modern format.
    try {
      const out = await sharp(buffer, { limitInputPixels: 100_000_000 }).rotate().resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      data = out.data;
      mime = 'image/webp';
      width = out.info.width;
      height = out.info.height;
    } catch {
      throw new AppError(415, 'UNSUPPORTED_FILE', 'The image could not be processed. It may be corrupted.');
    }
  }

  const base = `${Date.now().toString(36)}-${randomToken(8)}`;
  const ext = { 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'application/pdf': 'pdf' }[mime] ?? 'bin';
  void originalName;

  if (env.STORAGE_DRIVER === 'cloudinary') {
    const resourceType = type.kind === 'VIDEO' ? 'video' : type.kind === 'IMAGE' ? 'image' : 'raw';
    const result = await new Promise<{ secure_url: string; public_id: string; width?: number; height?: number }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { resource_type: resourceType, folder: opts.isPrivate ? 'maison/private' : 'maison/media', public_id: base, type: opts.isPrivate ? 'authenticated' : 'upload' },
        (err, res) => (err || !res ? reject(err ?? new Error('Upload failed')) : resolve(res as never)),
      );
      stream.end(data);
    });
    return { url: opts.isPrivate ? '' : result.secure_url, provider: 'cloudinary', storageKey: `${resourceType}:${result.public_id}`, mime, kind: type.kind, sizeBytes: data.length, width: width ?? result.width, height: height ?? result.height };
  }

  const dir = opts.isPrivate ? PRIVATE_DIR : PUBLIC_DIR;
  await fs.mkdir(dir, { recursive: true });
  const filename = `${base}.${ext}`;
  await fs.writeFile(path.join(dir, filename), data);
  if (type.kind === 'IMAGE' && !opts.isPrivate && mime === 'image/webp') {
    // Small variant for thumbnails / srcset (…-sm.webp).
    const sm = await sharp(data).resize({ width: 800, withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
    await fs.writeFile(path.join(dir, `${base}-sm.webp`), sm);
  }
  return { url: opts.isPrivate ? '' : `/uploads/${filename}`, provider: 'local', storageKey: filename, mime, kind: type.kind, sizeBytes: data.length, width, height };
}

export async function deleteStored(provider: string, storageKey: string | null, isPrivate: boolean) {
  if (!storageKey) return;
  if (provider === 'cloudinary') {
    const [resourceType, publicId] = storageKey.split(':');
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: isPrivate ? 'authenticated' : 'upload' }).catch(() => undefined);
    return;
  }
  if (provider === 'local') {
    const dir = isPrivate ? PRIVATE_DIR : PUBLIC_DIR;
    const safe = path.basename(storageKey);
    await fs.unlink(path.join(dir, safe)).catch(() => undefined);
    await fs.unlink(path.join(dir, safe.replace(/\.webp$/, '-sm.webp'))).catch(() => undefined);
  }
}

/** For private files: returns a readable stream (local) or a 5-minute signed URL (Cloudinary). */
export function privateFileAccess(provider: string, storageKey: string, mime: string): { stream?: NodeJS.ReadableStream; redirect?: string } {
  if (provider === 'cloudinary') {
    const [resourceType, publicId] = storageKey.split(':');
    const format = mime === 'application/pdf' ? 'pdf' : undefined;
    return { redirect: cloudinary.utils.private_download_url(publicId, format ?? '', { resource_type: resourceType, type: 'authenticated', expires_at: Math.floor(Date.now() / 1000) + 300 }) };
  }
  return { stream: createReadStream(path.join(PRIVATE_DIR, path.basename(storageKey))) };
}

export const PUBLIC_UPLOAD_DIR = PUBLIC_DIR;
