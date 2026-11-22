-- Run with `npm run test:sql` (throwaway Docker database), or in a DISPOSABLE
-- Supabase project's SQL editor after supabase-schema.sql.
-- Never run on production. Fixtures roll back.
-- Token pack (#412): token choices are owner-only through the prism, free
-- (no Membership needed to add one), one row per deck a token is hand-added
-- for, go with their PRISM, and anon holds no privilege on the table.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('41200000-0000-0000-0000-000000000001', 'free@example.invalid', now()),
  ('41200000-0000-0000-0000-000000000002', 'other@example.invalid', now());
-- Enforcement on and no founders/subscriptions rows: neither user is entitled.
UPDATE public.app_config SET value = 'true'::jsonb WHERE key = 'payment_enforcement';
INSERT INTO public.prisms (id, user_id, name) VALUES
  ('41200000-0000-0000-0001-000000000001', '41200000-0000-0000-0000-000000000001', 'Mine'),
  ('41200000-0000-0000-0001-000000000002', '41200000-0000-0000-0000-000000000002', 'Theirs');
INSERT INTO public.token_choices (prism_id, kind, oracle_id, hidden) VALUES
  ('41200000-0000-0000-0001-000000000002', 'hidden', 'o-their-treasure', true);

DO $$
BEGIN
  ASSERT NOT has_table_privilege('anon', 'public.token_choices', 'SELECT'), 'anon must not read token_choices';
  ASSERT NOT has_table_privilege('anon', 'public.token_choices', 'INSERT'), 'anon must not write token_choices';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '41200000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  ASSERT NOT public.is_entitled(), 'fixture user must not be entitled';
  -- One row per deck a token is hand-added for.
  INSERT INTO public.token_choices (prism_id, kind, oracle_id, deck_id, name, included) VALUES
    ('41200000-0000-0000-0001-000000000001', 'added', 'o-copy', 'd1', 'Copy', true),
    ('41200000-0000-0000-0001-000000000001', 'added', 'o-copy', 'd2', 'Copy', true);
  INSERT INTO public.token_choices (prism_id, kind, oracle_id, paired_with) VALUES
    ('41200000-0000-0000-0001-000000000001', 'paired', 'o-treasure', 'o-dino');
  ASSERT (SELECT count(*) FROM public.token_choices) = 3, 'a user sees only their own token choices, and needs no Membership to add one';

  -- The client's upsert: the same (prism, kind, oracle_id, deck_id) updates in place.
  INSERT INTO public.token_choices (prism_id, kind, oracle_id, paired_with, updated_at) VALUES
    ('41200000-0000-0000-0001-000000000001', 'paired', 'o-treasure', NULL, now())
    ON CONFLICT (prism_id, kind, oracle_id, deck_id) DO UPDATE SET paired_with = EXCLUDED.paired_with, updated_at = EXCLUDED.updated_at;
  ASSERT (SELECT paired_with IS NULL FROM public.token_choices WHERE oracle_id = 'o-treasure'), 'an upsert updates the choice';
  INSERT INTO public.token_choices (prism_id, kind, oracle_id, deck_id, name, included) VALUES
    ('41200000-0000-0000-0001-000000000001', 'added', 'o-copy', 'd1', 'Copy', false)
    ON CONFLICT (prism_id, kind, oracle_id, deck_id) DO UPDATE SET included = EXCLUDED.included;
  ASSERT (SELECT array_agg(deck_id ORDER BY deck_id) FROM public.token_choices WHERE oracle_id = 'o-copy' AND included) = ARRAY['d2'],
    'unticking one deck leaves the other deck''s row alone';

  BEGIN
    INSERT INTO public.token_choices (prism_id, kind, oracle_id, name, included) VALUES
      ('41200000-0000-0000-0001-000000000001', 'added', 'o-nodeck', 'No deck', true);
    RAISE EXCEPTION 'stored a hand-added token with no deck';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  BEGIN
    INSERT INTO public.token_choices (prism_id, kind, oracle_id, hidden) VALUES
      ('41200000-0000-0000-0001-000000000002', 'hidden', 'o-sneaky', true);
    RAISE EXCEPTION 'added a token choice to another account''s PRISM';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    UPDATE public.token_choices SET prism_id = '41200000-0000-0000-0001-000000000002' WHERE oracle_id = 'o-copy';
    RAISE EXCEPTION 'moved a token choice into another account''s PRISM';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.token_choices (prism_id, kind, oracle_id) VALUES
      ('41200000-0000-0000-0001-000000000001', 'emblem', 'o-emblem');
    RAISE EXCEPTION 'stored a token choice of an unknown kind';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  UPDATE public.token_choices SET hidden = false WHERE oracle_id = 'o-their-treasure';
  DELETE FROM public.token_choices WHERE oracle_id = 'o-their-treasure';

  DELETE FROM public.prisms WHERE id = '41200000-0000-0000-0001-000000000001';
  ASSERT (SELECT count(*) FROM public.token_choices) = 0, 'deleting the PRISM removes its token choices';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT hidden FROM public.token_choices WHERE oracle_id = 'o-their-treasure'),
    'another account''s token choice must be untouched';
END $$;
ROLLBACK;
