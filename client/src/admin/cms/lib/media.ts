import { useQuery } from '@tanstack/react-query';
import { api, ApiError, ensureCsrf } from '@/lib/api';
import type { MediaAsset, MediaMeta } from './types';

export interface MediaQuery {
  page?: number;
  limit?: number;
  q?: string;
  kind?: 'IMAGE' | 'VIDEO' | 'DOCUMENT' | '';
  folder?: string;
}

export function useMediaList(query: MediaQuery, enabled = true) {
  return useQuery({
    queryKey: ['cms-media', query],
    queryFn: async () => {
      const r = await api.getPaged<MediaAsset[]>('/admin/media', { ...query, kind: query.kind || undefined, folder: query.folder || undefined });
      return { items: r.data, meta: r.meta as unknown as MediaMeta };
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

export interface UploadResult {
  data: MediaAsset[];
  meta?: { errors?: { filename: string; message: string }[] };
}

/** Uploads with progress events (XMLHttpRequest), sending the CSRF double-submit header. */
export async function uploadWithProgress(path: string, form: FormData, onProgress?: (fraction: number) => void): Promise<UploadResult> {
  const token = await ensureCsrf();
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', api.url(path));
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-CSRF-Token', token);
    xhr.setRequestHeader('Accept', 'application/json');
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onerror = () => reject(new ApiError(0, 'NETWORK_ERROR', 'Network error — check your connection and try again.'));
    xhr.onload = () => {
      let json: { data?: unknown; meta?: unknown; error?: { code?: string; message?: string; details?: unknown } } | null = null;
      try {
        json = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve({ data: (json?.data ?? []) as MediaAsset[], meta: json?.meta as UploadResult['meta'] });
      else reject(new ApiError(xhr.status, json?.error?.code ?? 'HTTP_ERROR', json?.error?.message ?? (xhr.status === 413 ? 'The file is too large' : `Upload failed (${xhr.status})`), json?.error?.details));
    };
    xhr.send(form);
  });
}

export const ACCEPT_MEDIA = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml,video/mp4,video/webm';
export const ACCEPT_IMAGES = 'image/jpeg,image/png,image/webp,image/gif,image/avif,image/svg+xml';
export const ACCEPT_VIDEOS = 'video/mp4,video/webm';

export const isVideoUrl = (u: string) => /\.(mp4|webm|mov)(\?|$)/i.test(u);
export const youTubeOrVimeo = (u: string) => /^https:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com|player\.vimeo\.com)\//i.test(u);
