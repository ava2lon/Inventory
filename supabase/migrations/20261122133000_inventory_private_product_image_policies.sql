-- Inventory product images: private, user-scoped Storage access.
-- Create the private bucket "inv-product-images" in Supabase Storage before enabling uploads.
-- Object paths must be {auth.uid()}/{productId}/{filename}.

create policy "Inventory images: read own objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'inv-product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Inventory images: upload own objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'inv-product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Inventory images: update own objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'inv-product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'inv-product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy "Inventory images: delete own objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'inv-product-images'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);