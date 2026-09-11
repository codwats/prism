-- Run in a DISPOSABLE Supabase project's SQL editor after supabase-schema.sql.
-- Never run on production: it deletes app_logs rows. Fixtures roll back with
-- the transaction. Run the whole file in one submission; a failed assertion
-- aborts it.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('14000000-0000-0000-0000-000000000001', 'logger@example.invalid', now());

-- Three ages either side of the boundary, and one row belonging to nobody.
INSERT INTO public.app_logs (user_id, level, message, created_at) VALUES
  ('14000000-0000-0000-0000-000000000001', 'info',  'today',        now()),
  ('14000000-0000-0000-0000-000000000001', 'error', 'day 29',       now() - interval '29 days'),
  ('14000000-0000-0000-0000-000000000001', 'error', 'day 31',       now() - interval '31 days'),
  (NULL,                                   'info',  'orphan day 31', now() - interval '31 days');

DO $$
BEGIN
  -- No client may call a SECURITY DEFINER function that mass-deletes.
  ASSERT NOT has_function_privilege('anon', 'public.prune_app_logs(integer)', 'EXECUTE'),
    'anon must not be able to prune app_logs';
  ASSERT NOT has_function_privilege('authenticated', 'public.prune_app_logs(integer)', 'EXECUTE'),
    'authenticated must not be able to prune app_logs';
  ASSERT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.prune_app_logs(integer)'::regprocedure),
    'prune_app_logs must be SECURITY DEFINER';
  ASSERT (SELECT proconfig::text LIKE '%search_path=public, pg_temp%'
          FROM pg_proc WHERE oid = 'public.prune_app_logs(integer)'::regprocedure),
    'prune_app_logs must pin its search_path';
END $$;

-- A nonsense window must refuse rather than delete everything.
DO $$
DECLARE
  v_refused BOOLEAN := false;
BEGIN
  BEGIN
    PERFORM public.prune_app_logs(0);
  EXCEPTION WHEN raise_exception THEN
    v_refused := true;
  END;
  ASSERT v_refused, 'prune_app_logs must refuse a zero-day window';
  ASSERT (SELECT count(*) FROM public.app_logs) = 4, 'a refused prune must delete nothing';
END $$;

DO $$
DECLARE
  v_deleted INTEGER;
BEGIN
  v_deleted := public.prune_app_logs();

  ASSERT v_deleted = 2, format('default window must delete both 31-day rows, deleted %s', v_deleted);
  ASSERT EXISTS (SELECT 1 FROM public.app_logs WHERE message = 'today'),
    'a row from today must survive';
  ASSERT EXISTS (SELECT 1 FROM public.app_logs WHERE message = 'day 29'),
    'a row inside the window must survive';
  ASSERT NOT EXISTS (SELECT 1 FROM public.app_logs WHERE message = 'day 31'),
    'a row past the window must be deleted';
  ASSERT NOT EXISTS (SELECT 1 FROM public.app_logs WHERE message = 'orphan day 31'),
    'a user_id NULL row past the window must be deleted too';

  -- Re-running must be a no-op, which is what makes a nightly schedule safe.
  ASSERT public.prune_app_logs() = 0, 'a second prune must delete nothing';

  -- An explicit window narrower than the default still works.
  ASSERT public.prune_app_logs(1) = 1, 'a one-day window must take the 29-day row';
  ASSERT (SELECT count(*) FROM public.app_logs) = 1, 'only today''s row may remain';
END $$;

-- The nightly job exists, once, and points at this function.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    ASSERT (SELECT count(*) FROM cron.job WHERE jobname = 'prune-app-logs') = 1,
      'there must be exactly one prune-app-logs job';
    ASSERT (SELECT command LIKE '%prune_app_logs%' FROM cron.job WHERE jobname = 'prune-app-logs'),
      'the job must call prune_app_logs';
  ELSE
    RAISE NOTICE 'pg_cron not installed here; schedule assertions skipped';
  END IF;
END $$;

ROLLBACK;
