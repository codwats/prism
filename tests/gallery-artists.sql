-- Run in a DISPOSABLE Supabase project's SQL editor after supabase-schema.sql.
-- Never run on production. Fixtures roll back with the transaction.
-- Run the whole file in one submission; any failed assertion aborts it.
-- Each section is self-contained: its own fixtures, its own BEGIN…ROLLBACK.

-- ============================================
-- Artist claims (#323): "This is me", approve/reject, private contacts
-- ============================================
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('32300000-0000-0000-0000-00000000000a', 'claimant@example.invalid', now()),
  ('32300000-0000-0000-0000-00000000000b', 'rival@example.invalid', now()),
  ('32300000-0000-0000-0000-00000000000c', 'owner@example.invalid', now()),
  ('32300000-0000-0000-0000-00000000000d', 'admin@example.invalid', now());
INSERT INTO public.gallery_admins (user_id) VALUES ('32300000-0000-0000-0000-00000000000d');
-- X is an unclaimed Attribution; Y is already an Artist owned by C.
INSERT INTO public.gallery_artists (id, name, user_id) VALUES
  ('32300000-0000-0000-0001-000000000001', 'Unclaimed X', NULL),
  ('32300000-0000-0000-0001-000000000002', 'Claimed Y', '32300000-0000-0000-0000-00000000000c');
INSERT INTO public.gallery_artist_contacts (artist_id, commission_email) VALUES
  ('32300000-0000-0000-0001-000000000002', 'owner-business@example.invalid');

DO $$
DECLARE fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.approve_gallery_artist_claim(uuid)',
    'public.reject_gallery_artist_claim(uuid)',
    'public.list_gallery_artist_claims()'
  ] LOOP
    ASSERT has_function_privilege('authenticated', fn, 'EXECUTE'), fn || ' must be callable by authenticated';
    ASSERT NOT has_function_privilege('anon', fn, 'EXECUTE'), fn || ' must not be callable by anon';
  END LOOP;
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gallery_artist_claims'::regclass);
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.gallery_artist_contacts'::regclass);
END $$;

-- ---- Claimant A ----
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '32300000-0000-0000-0000-00000000000a', true);
DO $$
BEGIN
  INSERT INTO public.gallery_artist_claims (artist_id, user_id) VALUES
    ('32300000-0000-0000-0001-000000000001', '32300000-0000-0000-0000-00000000000a');

  BEGIN
    INSERT INTO public.gallery_artist_claims (artist_id, user_id) VALUES
      ('32300000-0000-0000-0001-000000000001', '32300000-0000-0000-0000-00000000000b');
    RAISE EXCEPTION 'A filed a claim in B''s name';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.gallery_artist_claims (artist_id, user_id) VALUES
      ('32300000-0000-0000-0001-000000000002', '32300000-0000-0000-0000-00000000000a');
    RAISE EXCEPTION 'A claimed an already-claimed artist';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.gallery_artist_claims (artist_id, user_id, status) VALUES
      ('32300000-0000-0000-0001-000000000001', '32300000-0000-0000-0000-00000000000a', 'approved');
    RAISE EXCEPTION 'A filed a self-approved claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    INSERT INTO public.gallery_artist_claims (artist_id, user_id) VALUES
      ('32300000-0000-0000-0001-000000000001', '32300000-0000-0000-0000-00000000000a');
    RAISE EXCEPTION 'A filed a duplicate pending claim';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  BEGIN
    PERFORM public.list_gallery_artist_claims();
    RAISE EXCEPTION 'non-admin listed claims';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.approve_gallery_artist_claim(
      (SELECT id FROM public.gallery_artist_claims LIMIT 1));
    RAISE EXCEPTION 'non-admin approved a claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.reject_gallery_artist_claim(
      (SELECT id FROM public.gallery_artist_claims LIMIT 1));
    RAISE EXCEPTION 'non-admin rejected a claim';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  ASSERT (SELECT count(*) FROM public.gallery_artist_contacts) = 0,
    'A must not read another Artist''s contacts';
END $$;

-- ---- Rival B files on the same artist ----
SELECT set_config('request.jwt.claim.sub', '32300000-0000-0000-0000-00000000000b', true);
DO $$
BEGIN
  INSERT INTO public.gallery_artist_claims (artist_id, user_id) VALUES
    ('32300000-0000-0000-0001-000000000001', '32300000-0000-0000-0000-00000000000b');
  ASSERT (SELECT count(*) FROM public.gallery_artist_claims) = 1, 'B must see only their own claim';
END $$;

-- ---- Owner C reads their own contacts row ----
SELECT set_config('request.jwt.claim.sub', '32300000-0000-0000-0000-00000000000c', true);
DO $$
BEGIN
  ASSERT (SELECT commission_email FROM public.gallery_artist_contacts) = 'owner-business@example.invalid',
    'the owning Artist must read their contacts row';
  ASSERT (SELECT count(*) FROM public.gallery_artist_contacts) = 1, 'owner sees only their own';
END $$;
RESET ROLE;

-- ---- Anonymous visitor ----
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  BEGIN
    ASSERT (SELECT count(*) FROM public.gallery_artist_contacts) = 0, 'anon read contacts';
  EXCEPTION WHEN insufficient_privilege THEN NULL; -- no grant at all is fine too
  END;
  BEGIN
    ASSERT (SELECT count(*) FROM public.gallery_artist_claims) = 0, 'anon read claims';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

-- A claim filed on Y before C's link was set by hand: approving it must fail.
INSERT INTO public.gallery_artist_claims (id, artist_id, user_id) VALUES
  ('32300000-0000-0000-0002-000000000001', '32300000-0000-0000-0001-000000000002', '32300000-0000-0000-0000-00000000000b'),
  ('32300000-0000-0000-0002-000000000002', '32300000-0000-0000-0001-000000000002', '32300000-0000-0000-0000-00000000000a');

-- ---- Admin D ----
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '32300000-0000-0000-0000-00000000000d', true);
DO $$
DECLARE
  a_claim UUID;
  b_claim UUID;
BEGIN
  ASSERT (SELECT count(*) FROM public.list_gallery_artist_claims()) = 4, 'admin lists every pending claim';
  ASSERT (SELECT claimant_email FROM public.list_gallery_artist_claims()
          WHERE claimant_id = '32300000-0000-0000-0000-00000000000a'
            AND artist_id = '32300000-0000-0000-0001-000000000001') = 'claimant@example.invalid',
    'list must carry the claimant''s account email';
  ASSERT (SELECT artist_name FROM public.list_gallery_artist_claims()
          WHERE claimant_id = '32300000-0000-0000-0000-00000000000a'
            AND artist_id = '32300000-0000-0000-0001-000000000001') = 'Unclaimed X',
    'list must carry the artist name';

  SELECT id INTO a_claim FROM public.gallery_artist_claims
    WHERE user_id = '32300000-0000-0000-0000-00000000000a' AND artist_id = '32300000-0000-0000-0001-000000000001';
  SELECT id INTO b_claim FROM public.gallery_artist_claims
    WHERE user_id = '32300000-0000-0000-0000-00000000000b' AND artist_id = '32300000-0000-0000-0001-000000000001';

  PERFORM public.approve_gallery_artist_claim(a_claim);
  ASSERT (SELECT user_id FROM public.gallery_artists WHERE id = '32300000-0000-0000-0001-000000000001')
    = '32300000-0000-0000-0000-00000000000a', 'approve must link the account to the existing row';
  ASSERT (SELECT name FROM public.gallery_artists WHERE id = '32300000-0000-0000-0001-000000000001')
    = 'Unclaimed X', 'approve must not change the credit';
  ASSERT (SELECT status FROM public.gallery_artist_claims WHERE id = a_claim) = 'approved';
  ASSERT (SELECT reviewed_by FROM public.gallery_artist_claims WHERE id = a_claim)
    = '32300000-0000-0000-0000-00000000000d';
  ASSERT (SELECT status FROM public.gallery_artist_claims WHERE id = b_claim) = 'rejected',
    'approve must reject rival pending claims';
  ASSERT (SELECT commission_email FROM public.gallery_artist_contacts
          WHERE artist_id = '32300000-0000-0000-0001-000000000001') = 'claimant@example.invalid',
    'approve must seed the commission email from the claimant''s account';

  BEGIN
    PERFORM public.approve_gallery_artist_claim(b_claim);
    RAISE EXCEPTION 'approved a rejected claim';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;

  BEGIN
    PERFORM public.approve_gallery_artist_claim('32300000-0000-0000-0002-000000000001');
    RAISE EXCEPTION 'approved a claim on an already-claimed artist';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
  ASSERT (SELECT user_id FROM public.gallery_artists WHERE id = '32300000-0000-0000-0001-000000000002')
    = '32300000-0000-0000-0000-00000000000c', 'a failed approve must leave the owner in place';

  PERFORM public.reject_gallery_artist_claim('32300000-0000-0000-0002-000000000002');
  ASSERT (SELECT status FROM public.gallery_artist_claims
          WHERE id = '32300000-0000-0000-0002-000000000002') = 'rejected', 'reject must reject';
END $$;

-- ---- The new Artist A reads their seeded contacts; rival B still can't ----
SELECT set_config('request.jwt.claim.sub', '32300000-0000-0000-0000-00000000000a', true);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.gallery_artist_contacts
          WHERE artist_id = '32300000-0000-0000-0001-000000000001') = 1,
    'the new Artist must read their contacts row';
END $$;
SELECT set_config('request.jwt.claim.sub', '32300000-0000-0000-0000-00000000000b', true);
DO $$
BEGIN
  ASSERT (SELECT count(*) FROM public.gallery_artist_contacts) = 0, 'B must not read contacts';
END $$;
RESET ROLE;
ROLLBACK;
