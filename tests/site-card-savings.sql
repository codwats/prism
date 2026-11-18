-- site_card_savings(): copies each card saves across every synced PRISM.
-- Run with `npm run test:sql`. Fixtures roll back with the transaction.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('15000000-0000-0000-0000-000000000001', 'saver-a@example.invalid', now()),
  ('15000000-0000-0000-0000-000000000002', 'saver-b@example.invalid', now());

INSERT INTO public.prisms (id, user_id, name) VALUES
  ('15100000-0000-0000-0000-000000000001', '15000000-0000-0000-0000-000000000001', 'A'),
  ('15100000-0000-0000-0000-000000000002', '15000000-0000-0000-0000-000000000002', 'B');

-- PRISM A: two standalone decks and a two-variant split group.
INSERT INTO public.decks (id, prism_id, name, split_group_id) VALUES
  ('15200000-0000-0000-0000-000000000001', '15100000-0000-0000-0000-000000000001', 'One', NULL),
  ('15200000-0000-0000-0000-000000000002', '15100000-0000-0000-0000-000000000001', 'Two', NULL),
  ('15200000-0000-0000-0000-000000000003', '15100000-0000-0000-0000-000000000001', 'Var 1', '15300000-0000-0000-0000-000000000001'),
  ('15200000-0000-0000-0000-000000000004', '15100000-0000-0000-0000-000000000001', 'Var 2', '15300000-0000-0000-0000-000000000001'),
  ('15200000-0000-0000-0000-000000000005', '15100000-0000-0000-0000-000000000002', 'B One', NULL),
  ('15200000-0000-0000-0000-000000000006', '15100000-0000-0000-0000-000000000002', 'B Two', NULL);

INSERT INTO public.deck_cards (deck_id, card_name, quantity, is_basic_land, sleeve) VALUES
  -- Sol Ring in One, Two and both variants: 3 logical decks, 1 copy needed, 2 saved.
  ('15200000-0000-0000-0000-000000000001', 'Sol Ring', 1, false, NULL),
  ('15200000-0000-0000-0000-000000000002', 'Sol Ring', 1, false, NULL),
  ('15200000-0000-0000-0000-000000000003', 'Sol Ring', 1, false, NULL),
  ('15200000-0000-0000-0000-000000000004', 'Sol Ring', 1, false, NULL),
  -- Only in the split group's variants: one logical deck, nothing saved.
  ('15200000-0000-0000-0000-000000000003', 'Arcane Signet', 1, false, NULL),
  ('15200000-0000-0000-0000-000000000004', 'Arcane Signet', 1, false, NULL),
  -- Relentless Rats: 5 copies in One as two sleeve rows (3+2), 3 in Two: 3 saved.
  ('15200000-0000-0000-0000-000000000001', 'Relentless Rats', 3, false, NULL),
  ('15200000-0000-0000-0000-000000000001', 'Relentless Rats', 2, false, 'sep'),
  ('15200000-0000-0000-0000-000000000002', 'Relentless Rats', 3, false, NULL),
  -- Basic lands never count.
  ('15200000-0000-0000-0000-000000000001', 'Forest', 10, true, NULL),
  ('15200000-0000-0000-0000-000000000002', 'Forest', 10, true, NULL),
  -- PRISM B: Sol Ring saves 1 more; sharing across PRISMs saves nothing.
  ('15200000-0000-0000-0000-000000000005', 'Sol Ring', 1, false, NULL),
  ('15200000-0000-0000-0000-000000000006', 'Sol Ring', 1, false, NULL),
  ('15200000-0000-0000-0000-000000000005', 'Arcane Signet', 1, false, NULL);

DO $$
DECLARE
  got JSONB := (SELECT jsonb_object_agg(card_name, saved_copies) FROM public.site_card_savings());
BEGIN
  ASSERT got = '{"Sol Ring": 3, "Relentless Rats": 3}'::jsonb, format('unexpected savings: %s', got);
  ASSERT NOT has_function_privilege('anon', 'public.site_card_savings()', 'EXECUTE'), 'anon must not read site savings';
  ASSERT NOT has_function_privilege('authenticated', 'public.site_card_savings()', 'EXECUTE'), 'authenticated must not read site savings';
  ASSERT has_function_privilege('service_role', 'public.site_card_savings()', 'EXECUTE'), 'service_role reads site savings';
END $$;

ROLLBACK;
