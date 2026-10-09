-- Run in a DISPOSABLE Supabase project's SQL editor after supabase-schema.sql.
-- Never run on production. Fixtures and enforcement changes roll back together.
-- Run the whole file in one submission; any failed assertion aborts it.
-- The 25-cloud-PRISM cap (#209): refuses the 26th create, never an edit.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('29000000-0000-0000-0000-000000000001', 'member@example.invalid', now()),
  ('29000000-0000-0000-0000-000000000002', 'other@example.invalid', now());
INSERT INTO public.founders (user_id) VALUES
  ('29000000-0000-0000-0000-000000000001'),
  ('29000000-0000-0000-0000-000000000002');
UPDATE public.app_config SET value = 'true'::jsonb WHERE key = 'payment_enforcement';

-- 24 existing PRISMs for the member, and 25 for another account that must not count.
INSERT INTO public.prisms (id, user_id, name)
SELECT ('29000000-0000-0000-0001-' || lpad(n::text, 12, '0'))::uuid,
       '29000000-0000-0000-0000-000000000001', 'PRISM ' || n
FROM generate_series(1, 24) n;
INSERT INTO public.prisms (user_id, name)
SELECT '29000000-0000-0000-0000-000000000002', 'Other ' || n
FROM generate_series(1, 25) n;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '29000000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  ASSERT public.is_entitled(), 'fixture member must be entitled';

  INSERT INTO public.prisms (id, user_id, name) VALUES
    ('29000000-0000-0000-0001-000000000025', '29000000-0000-0000-0000-000000000001', 'PRISM 25');

  BEGIN
    INSERT INTO public.prisms (user_id, name) VALUES ('29000000-0000-0000-0000-000000000001', 'PRISM 26');
    RAISE EXCEPTION 'the 26th cloud PRISM was created';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  -- The client saves with an upsert, which is checked against the INSERT
  -- policy even when the row exists. At the cap it must still save.
  INSERT INTO public.prisms (id, user_id, name) VALUES
    ('29000000-0000-0000-0001-000000000001', '29000000-0000-0000-0000-000000000001', 'Renamed')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;
  ASSERT (SELECT name FROM public.prisms WHERE id = '29000000-0000-0000-0001-000000000001') = 'Renamed',
    'an upsert of an existing PRISM must save at the cap';

  -- Deleting one frees a place.
  DELETE FROM public.prisms WHERE id = '29000000-0000-0000-0001-000000000002';
  INSERT INTO public.prisms (user_id, name) VALUES ('29000000-0000-0000-0000-000000000001', 'PRISM 26');
  ASSERT (SELECT count(*) FROM public.prisms) = 25, 'member must see exactly their 25 PRISMs';
END $$;
RESET ROLE;
ROLLBACK;
