-- Run with `npm run test:sql` (throwaway Docker database), or in any Supabase
-- project's SQL editor after supabase-schema.sql. Read-only: safe on production.
-- Checks the privileges and settings the database actually ends up with, which
-- tests/schema-rules.test.js can only read off the schema text (#357).
DO $$
DECLARE
  fn TEXT;
  unpinned TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'increment_gallery_download(uuid)',
    'update_own_gallery_artwork(uuid, text, text, text, text, text, boolean, text)',
    'update_own_gallery_artwork(uuid, text, text, text, text, text, boolean, text, boolean)'
  ] LOOP
    ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), fn || ' must not be callable by anon';
    ASSERT has_function_privilege('authenticated', fn, 'EXECUTE'), fn || ' must stay callable by authenticated';
  END LOOP;

  -- The anon SELECT policy on gallery_artworks calls it.
  ASSERT has_function_privilege('anon', 'is_gallery_admin()', 'EXECUTE'), 'is_gallery_admin must stay callable by anon';

  -- Trigger-only, as the #331 triggers.
  ASSERT NOT has_function_privilege('anon', 'gallery_likes_counter()', 'EXECUTE'), 'gallery_likes_counter must not be callable by anon';
  ASSERT NOT has_function_privilege('authenticated', 'gallery_likes_counter()', 'EXECUTE'), 'gallery_likes_counter must not be callable by authenticated';

  -- Ours only: an extension installed into public owns its own functions, and
  -- event-trigger functions (none in our schema) are Supabase's, e.g. rls_auto_enable.
  SELECT string_agg(p.oid::regprocedure::text, ', ') INTO unpinned
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND p.prorettype <> 'event_trigger'::regtype
    AND NOT ('search_path=public, pg_temp' = ANY (coalesce(p.proconfig, '{}')))
    AND NOT EXISTS (SELECT 1 FROM pg_depend d
                    WHERE d.classid = 'pg_proc'::regclass AND d.objid = p.oid AND d.deptype = 'e');
  ASSERT unpinned IS NULL, 'SECURITY DEFINER functions must pin search_path=public, pg_temp: ' || unpinned;
END $$;
