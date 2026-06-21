import { supabase } from './supabase';

export const MEDIA_BUCKET = 'media';

export function appendCacheSignature(url: string, signature: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.set('v', signature);
    return parsed.toString();
  } catch {
    const joiner = url.includes('?') ? '&' : '?';
    return `${url}${joiner}v=${encodeURIComponent(signature)}`;
  }
}

export function inferMediaType(file: File): 'image' | 'video' {
  return file.type.startsWith('video') ? 'video' : 'image';
}

function buildStoragePath(file: File): string {
  const extension = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : '';
  const baseName = file.name
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const safeName = baseName || 'media';
  const suffix = extension ? `.${extension}` : '';
  return `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}-${safeName}${suffix}`;
}

function explainStorageError(error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (normalized.includes('bucket not found')) {
    return new Error('Supabase Storage bucket "media" was not found. Create a public bucket named "media".');
  }

  if (normalized.includes('row-level security') || normalized.includes('permission') || normalized.includes('unauthorized')) {
    return new Error(
      'Supabase Storage blocked the upload. Add an INSERT policy for authenticated users on storage.objects where bucket_id = "media".',
    );
  }

  if (normalized.includes('exceeded the maximum allowed size') || normalized.includes('maximum file size')) {
    return new Error(
      'The file exceeds the Supabase Storage limit. Large videos should be compressed before upload.',
    );
  }

  return new Error(message || 'Supabase Storage upload failed.');
}

export async function uploadToSupabaseStorage(file: File): Promise<{ publicUrl: string; path: string }> {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  const path = buildStoragePath(file);
  const { error: uploadError } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
    cacheControl: '3600',
    contentType: file.type || undefined,
    upsert: false,
  });

  if (uploadError) {
    throw explainStorageError(uploadError);
  }

  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) {
    throw new Error('Supabase Storage did not return a public media URL.');
  }

  return { publicUrl: data.publicUrl, path };
}

export async function removeFromSupabaseStorage(path: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).remove([path]);
  if (error) throw error;
}

export function getSupabaseStoragePath(publicUrl: string): string | null {
  try {
    const parsed = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${MEDIA_BUCKET}/`;
    const markerIndex = parsed.pathname.indexOf(marker);

    if (markerIndex === -1) return null;
    return decodeURIComponent(parsed.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}
