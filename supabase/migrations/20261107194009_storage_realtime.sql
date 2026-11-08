-- File storage buckets with access rules, and realtime publication.
--
-- Path conventions (the first folders decide who can access a file):
--   course-materials/{course_id}/{any file name}
--   submissions/{assignment_id}/{student_id}/{any file name}
--   avatars/{user_id}/{any file name}

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('course-materials', 'course-materials', false, 52428800, array[
     'application/pdf',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.ms-powerpoint',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'text/plain', 'text/markdown',
     'image/png', 'image/jpeg', 'image/webp',
     'video/mp4', 'video/webm']),
  ('submissions', 'submissions', false, 26214400, array[
     'application/pdf',
     'application/msword',
     'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
     'application/vnd.openxmlformats-officedocument.presentationml.presentation',
     'application/zip', 'application/x-zip-compressed',
     'text/plain', 'text/markdown',
     'image/png', 'image/jpeg', 'image/webp']),
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- Same rule as the tables: active account and MFA satisfied.
create policy "unibook buckets require active account and mfa" on storage.objects
  as restrictive to authenticated
  using (bucket_id not in ('course-materials', 'submissions', 'avatars') or (select private.access_ok()))
  with check (bucket_id not in ('course-materials', 'submissions', 'avatars') or (select private.access_ok()));

-- Course materials: readable by anyone who can see the course, managed by its teacher or an admin.
create policy "read course materials" on storage.objects for select to authenticated
  using (bucket_id = 'course-materials'
         and private.can_view_course(private.try_uuid((storage.foldername(name))[1])));
create policy "upload course materials" on storage.objects for insert to authenticated
  with check (bucket_id = 'course-materials'
              and private.can_manage_course(private.try_uuid((storage.foldername(name))[1])));
create policy "update course materials" on storage.objects for update to authenticated
  using (bucket_id = 'course-materials'
         and private.can_manage_course(private.try_uuid((storage.foldername(name))[1])));
create policy "delete course materials" on storage.objects for delete to authenticated
  using (bucket_id = 'course-materials'
         and private.can_manage_course(private.try_uuid((storage.foldername(name))[1])));

-- Submissions: a student uploads into their own folder for a course they are enrolled in;
-- the course teacher (or an admin) can read them.
create policy "upload own submission files" on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions'
              and (storage.foldername(name))[2] = (select auth.uid())::text
              and private.is_enrolled(private.assignment_course(private.try_uuid((storage.foldername(name))[1]))));
create policy "read own or managed submission files" on storage.objects for select to authenticated
  using (bucket_id = 'submissions'
         and ((storage.foldername(name))[2] = (select auth.uid())::text
              or private.can_manage_course(private.assignment_course(private.try_uuid((storage.foldername(name))[1])))));
create policy "replace own submission files" on storage.objects for update to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "delete own submission files" on storage.objects for delete to authenticated
  using (bucket_id = 'submissions' and (storage.foldername(name))[2] = (select auth.uid())::text);

-- Avatars: public bucket (anyone with the URL can view); users manage only their own folder.
create policy "list avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars');
create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "update own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Realtime: the notification bell, hostel requests and hostel chat update live.
-- Realtime applies each subscriber's RLS, so users only receive their own rows.
alter publication supabase_realtime add table public.notifications, public.hostel_connections, public.hostel_messages;
