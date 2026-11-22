import { supabase, requireUser } from './supabase.js';

const BUCKET = 'inv-product-images';
const MAX_BYTES = 5 * 1024 * 1024;
const SIGNED_URL_TTL = 60 * 60;
const URL_REFRESH_MARGIN = 5 * 60;
const urls = new Map();
const inflight = new Map();

const safeStem = (id) => String(id).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 100);
const validPath = (path, userId) => {
  if (typeof path !== 'string' || path.includes('..')) return false;
  const parts = path.split('/');
  return parts.length === 3 && parts[0] === userId
    && /^[a-zA-Z0-9_-]{1,100}$/.test(parts[1])
    && /^photo\.(webp|jpe?g|png)$/i.test(parts[2]);
};

export const photosSupported = () => !!supabase?.storage;

export function photoPath(productId, userId, mime = 'image/webp') {
  if (!userId) return null;
  const ext = mime === 'image/png' ? 'png' : mime === 'image/jpeg' ? 'jpg' : 'webp';
  return `${userId}/${safeStem(productId)}/photo.${ext}`;
}

export async function downscale(file, { max = 800, quality = 0.82 } = {}) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Image canvas is unavailable.');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close?.();
    const webp = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
    if (webp?.type === 'image/webp') return webp;
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (jpeg?.type === 'image/jpeg') return jpeg;
    throw new Error('This browser cannot encode product photos.');
  } catch (err) {
    console.error('Downscaling failed', err);
    if (['image/webp', 'image/jpeg', 'image/png'].includes(file?.type) && file.size <= MAX_BYTES) return file;
    throw new Error('Could not prepare this image. Choose a JPG, PNG or WebP image under 5 MB.');
  }
}

export async function savePhoto(productId, blob) {
  if (!blob) return null;
  try {
    const user = await requireUser();
    const mime = blob.type || 'application/octet-stream';
    if (!['image/webp', 'image/jpeg', 'image/png'].includes(mime) || blob.size > MAX_BYTES) {
      throw new Error('Product photos must be WebP, JPEG or PNG and no larger than 5 MB.');
    }
    const path = photoPath(productId, user.id, mime);
    const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
      upsert: true, contentType: mime, cacheControl: '3600',
    });
    if (error) throw error;
    forget(path);
    return path;
  } catch (err) {
    console.error('Saving the photo failed', err);
    return null;
  }
}

export async function photoURL(product) {
  const path = product?.imagePath;
  if (!path) return null;
  try {
    const user = await requireUser();
    if (!validPath(path, user.id)) return null;
    const cached = urls.get(path);
    if (cached && cached.expiresAt > Date.now() + URL_REFRESH_MARGIN) return cached.url;
    if (inflight.has(path)) return inflight.get(path);
    const request = (async () => {
      try {
        const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL);
        if (error) throw error;
        const url = data?.signedUrl || null;
        if (url) urls.set(path, { url, expiresAt: Date.now() + SIGNED_URL_TTL * 1000 });
        return url;
      } catch (err) {
        console.error('Loading the photo failed', err);
        return null;
      } finally {
        inflight.delete(path);
      }
    })();
    inflight.set(path, request);
    return request;
  } catch {
    return null;
  }
}

export const cachedPhotoURL = (product) => {
  const cached = urls.get(product?.imagePath);
  return cached && cached.expiresAt > Date.now() + URL_REFRESH_MARGIN ? cached.url : null;
};

function forget(path) {
  inflight.delete(path);
  urls.delete(path);
}

export async function deletePhoto(product) {
  const path = product?.imagePath;
  if (!path) return;
  try {
    const user = await requireUser();
    if (!validPath(path, user.id)) return;
    forget(path);
    const { error } = await supabase.storage.from(BUCKET).remove([path]);
    if (error) throw error;
  } catch (err) {
    console.error('Deleting the photo failed', err);
  }
}
