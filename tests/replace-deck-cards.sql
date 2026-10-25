-- Run with `npm run test:sql` (throwaway Docker database), or in a DISPOSABLE
-- Supabase project's SQL editor after supabase-schema.sql.
-- Never run on production. Fixtures roll back.
-- replace_deck_cards (#395): writes exactly the given rows, sleeve (#309)
-- included; an empty array clears the deck; SECURITY INVOKER plus RLS means a
-- caller who doesn't own the deck changes nothing.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('39500000-0000-0000-0000-000000000001', 'owner@example.invalid', now()),
  ('39500000-0000-0000-0000-000000000002', 'other@example.invalid', now());
INSERT INTO public.prisms (id, user_id, name) VALUES
  ('39500000-0000-0000-0001-000000000001', '39500000-0000-0000-0000-000000000001', 'Mine'),
  ('39500000-0000-0000-0001-000000000002', '39500000-0000-0000-0000-000000000002', 'Theirs');
INSERT INTO public.decks (id, prism_id, name) VALUES
  ('39500000-0000-0000-0002-000000000001', '39500000-0000-0000-0001-000000000001', 'A'),
  ('39500000-0000-0000-0002-000000000002', '39500000-0000-0000-0001-000000000001', 'B'),
  ('39500000-0000-0000-0002-000000000003', '39500000-0000-0000-0001-000000000002', 'C');
INSERT INTO public.deck_cards (deck_id, card_name) VALUES
  ('39500000-0000-0000-0002-000000000001', 'Old card'),
  ('39500000-0000-0000-0002-000000000002', 'Kept card'),
  ('39500000-0000-0000-0002-000000000003', 'Their card');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '39500000-0000-0000-0000-000000000001', true);
DO $$
DECLARE
  got TEXT;
BEGIN
  PERFORM public.replace_deck_cards('39500000-0000-0000-0002-000000000001', '[
    {"card_name": "Sol Ring", "quantity": 2, "sleeve": "s1"},
    {"card_name": "Atraxa, Praetors'' Voice", "is_commander": true},
    {"card_name": "Forest", "quantity": 30, "is_basic_land": true}
  ]'::jsonb, '2026-01-02T03:04:05Z');

  SELECT string_agg(format('%s|%s|%s|%s|%s|%s', card_name, quantity, is_commander,
                           is_basic_land, coalesce(sleeve, '-'), created_at = '2026-01-02T03:04:05Z'),
                    ';' ORDER BY card_name)
    INTO got FROM public.deck_cards WHERE deck_id = '39500000-0000-0000-0002-000000000001';
  ASSERT got = 'Atraxa, Praetors'' Voice|1|t|f|-|t;Forest|30|f|t|-|t;Sol Ring|2|f|f|s1|t',
    'replace must write exactly the given rows, got ' || coalesce(got, 'nothing');
  ASSERT (SELECT card_name FROM public.deck_cards WHERE deck_id = '39500000-0000-0000-0002-000000000002') = 'Kept card',
    'replacing one deck must not touch another deck''s cards';

  PERFORM public.replace_deck_cards('39500000-0000-0000-0002-000000000001', '[]'::jsonb);
  ASSERT NOT EXISTS (SELECT 1 FROM public.deck_cards WHERE deck_id = '39500000-0000-0000-0002-000000000001'),
    'an empty array must clear the deck';

  -- Another account's deck: the DELETE sees no rows, the INSERT fails RLS.
  BEGIN
    PERFORM public.replace_deck_cards('39500000-0000-0000-0002-000000000003',
      '[{"card_name": "Sneaky"}]'::jsonb);
    RAISE EXCEPTION 'wrote cards into another account''s deck';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM public.replace_deck_cards('39500000-0000-0000-0002-000000000003', '[]'::jsonb);
END $$;
RESET ROLE;

DO $$
BEGIN
  ASSERT (SELECT string_agg(card_name, ';') FROM public.deck_cards
          WHERE deck_id = '39500000-0000-0000-0002-000000000003') = 'Their card',
    'another account''s deck must keep its cards';
END $$;
ROLLBACK;
