begin;
-- Qualify the outer Storage column: the inner catalog row also has a name.
alter policy product_current_image_read on storage.objects using (
  bucket_id='product-images' and exists(
    select 1 from public.catalog_products p
    where p.image_path=storage.objects.name
      and public.has_business_access(p.business_id)
      and (p.active or public.has_business_access(p.business_id,array['owner','admin']))
  )
);
notify pgrst,'reload schema';
commit;
