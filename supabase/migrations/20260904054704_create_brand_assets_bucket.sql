-- Public, read-only brand assets. The application only reads versioned files
-- from this bucket; uploads are performed by an administrator/service role.
-- No storage.objects write policy is intentionally created for app users.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'brand-assets',
  'brand-assets',
  true,
  1048576,
  array['image/png']
)
on conflict (id) do update
set name = excluded.name,
    public = true,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
