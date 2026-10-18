-- Run with `npm run test:sql` (throwaway Docker database), or in a DISPOSABLE
-- Supabase project's SQL editor after supabase-schema.sql.
-- Never run on production. Fixtures roll back.
-- Swap Queue (#364): Planned swaps are owner-only, follow their deck, only
-- Members add them, and anon holds no privilege on the table.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('36400000-0000-0000-0000-000000000001', 'member@example.invalid', now()),
  ('36400000-0000-0000-0000-000000000002', 'other@example.invalid', now()),
  ('36400000-0000-0000-0000-000000000003', 'lapsed@example.invalid', now());
UPDATE public.app_config SET value = 'true'::jsonb WHERE key = 'payment_enforcement';
INSERT INTO public.founders (user_id) VALUES
  ('36400000-0000-0000-0000-000000000001'),
  ('36400000-0000-0000-0000-000000000002');
INSERT INTO public.prisms (id, user_id, name) VALUES
  ('36400000-0000-0000-0001-000000000001', '36400000-0000-0000-0000-000000000001', 'Mine'),
  ('36400000-0000-0000-0001-000000000002', '36400000-0000-0000-0000-000000000002', 'Theirs'),
  ('36400000-0000-0000-0001-000000000003', '36400000-0000-0000-0000-000000000003', 'Lapsed');
INSERT INTO public.decks (id, prism_id, name) VALUES
  ('36400000-0000-0000-0002-000000000001', '36400000-0000-0000-0001-000000000001', 'A'),
  ('36400000-0000-0000-0002-000000000002', '36400000-0000-0000-0001-000000000002', 'B'),
  ('36400000-0000-0000-0002-000000000003', '36400000-0000-0000-0001-000000000003', 'C');
INSERT INTO public.planned_swaps (prism_id, deck_id, incoming) VALUES
  ('36400000-0000-0000-0001-000000000002', '36400000-0000-0000-0002-000000000002', 'Their card'),
  ('36400000-0000-0000-0001-000000000003', '36400000-0000-0000-0002-000000000003', 'Kept card');

DO $$
BEGIN
  ASSERT NOT has_table_privilege('anon', 'public.planned_swaps', 'SELECT'), 'anon must not read planned_swaps';
  ASSERT NOT has_table_privilege('anon', 'public.planned_swaps', 'INSERT'), 'anon must not write planned_swaps';
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '36400000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  INSERT INTO public.planned_swaps (id, prism_id, deck_id, incoming, outgoing) VALUES
    ('36400000-0000-0000-0003-000000000001', '36400000-0000-0000-0001-000000000001', '36400000-0000-0000-0002-000000000001', 'Farseek', 'Cultivate');
  ASSERT (SELECT count(*) FROM public.planned_swaps) = 1, 'a member sees only their own Planned swaps';

  BEGIN
    INSERT INTO public.planned_swaps (prism_id, deck_id, incoming) VALUES
      ('36400000-0000-0000-0001-000000000002', '36400000-0000-0000-0002-000000000002', 'Sneaky');
    RAISE EXCEPTION 'queued a Planned swap in another account''s PRISM';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.planned_swaps (prism_id, deck_id, incoming) VALUES
      ('36400000-0000-0000-0001-000000000001', '36400000-0000-0000-0002-000000000002', 'Sneaky');
    RAISE EXCEPTION 'queued a Planned swap for another account''s deck';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.planned_swaps SET note = 'x' WHERE incoming = 'Their card';
  DELETE FROM public.planned_swaps WHERE incoming = 'Their card';

  DELETE FROM public.decks WHERE id = '36400000-0000-0000-0002-000000000001';
  ASSERT (SELECT count(*) FROM public.planned_swaps) = 0, 'deleting the deck removes its Planned swaps';
END $$;
RESET ROLE;

-- A Lapse: no new Planned swaps, but the queue stays readable and editable
-- (gate adding, never access), and nothing is deleted for them.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '36400000-0000-0000-0000-000000000003', true);
DO $$
BEGIN
  ASSERT NOT public.is_entitled(), 'fixture user must not be entitled';
  BEGIN
    INSERT INTO public.planned_swaps (prism_id, deck_id, incoming) VALUES
      ('36400000-0000-0000-0001-000000000003', '36400000-0000-0000-0002-000000000003', 'New card');
    RAISE EXCEPTION 'a non-Member queued a Planned swap';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  ASSERT (SELECT count(*) FROM public.planned_swaps) = 1, 'a non-Member still sees their queue';
  UPDATE public.planned_swaps SET note = 'still mine' WHERE incoming = 'Kept card';
  ASSERT (SELECT note FROM public.planned_swaps WHERE incoming = 'Kept card') = 'still mine',
    'a non-Member can still edit their queue';
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT note IS NULL FROM public.planned_swaps WHERE incoming = 'Their card'),
    'another account''s Planned swap must be untouched';
END $$;
ROLLBACK;
