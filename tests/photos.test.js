import { describe, it, expect, beforeEach, vi } from 'vitest';
const storage = {
  upload: vi.fn(async () => ({ error: null })),
  createSignedUrl: vi.fn(async () => ({ data: { signedUrl: 'https://signed.example/photo' }, error: null })),
  remove: vi.fn(async () => ({ error: null })),
};
const bucket = { upload: storage.upload, createSignedUrl: storage.createSignedUrl, remove: storage.remove };
const auth = { getUser: vi.fn(async () => ({ data: { user: { id: 'user-123' } }, error: null })) };
vi.mock('../src/lib/supabase.js', () => ({
  supabase: { auth, storage: { from: vi.fn(() => bucket) } },
  requireUser: async () => ({ id: 'user-123' }),
}));
import { photoPath, savePhoto, deletePhoto, photoURL, cachedPhotoURL } from '../src/lib/photos.js';

beforeEach(() => {
  storage.upload.mockClear();
  storage.createSignedUrl.mockClear();
  storage.remove.mockClear();
});

describe('Supabase product photo storage', () => {
  it('builds an account-scoped, safe object path', () => {
    expect(photoPath('product-1', 'user-123')).toBe('user-123/product-1/photo.webp');
    expect(photoPath('../../escape', 'user-123')).toBe('user-123/______escape/photo.webp');
  });

  it('uploads WebP to the private inventory bucket with upsert', async () => {
    const path = await savePhoto('p-1', new Blob(['image'], { type: 'image/webp' }));
    expect(path).toBe('user-123/p-1/photo.webp');
    expect(storage.upload).toHaveBeenCalledWith(path, expect.any(Blob), {
      upsert: true, contentType: 'image/webp', cacheControl: '3600',
    });
  });

  it('rejects oversized or unsupported images without uploading', async () => {
    const path = await savePhoto('p-2', new Blob(['x'], { type: 'text/plain' }));
    expect(path).toBeNull();
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('uses signed URLs and caches them', async () => {
    const product = { imagePath: 'user-123/p-1/photo.webp' };
    expect(await photoURL(product)).toBe('https://signed.example/photo');
    expect(cachedPhotoURL(product)).toBe('https://signed.example/photo');
    expect(storage.createSignedUrl).toHaveBeenCalledWith(product.imagePath, 3600);
  });

  it('never reads or deletes another account path', async () => {
    const product = { imagePath: 'other-user/p-1/photo.webp' };
    expect(await photoURL(product)).toBeNull();
    await deletePhoto(product);
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('deletes only the current user object', async () => {
    await deletePhoto({ imagePath: 'user-123/p-1/photo.webp' });
    expect(storage.remove).toHaveBeenCalledWith(['user-123/p-1/photo.webp']);
  });
});
