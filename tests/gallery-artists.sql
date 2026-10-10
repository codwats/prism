-- Run in a DISPOSABLE Supabase project's SQL editor after supabase-schema.sql.
-- Never run on production. Fixtures roll back with everything else.
-- Run the whole file in one submission; any failed assertion aborts it.
-- Gallery artists, Alter Alley and commissions (#321). Each ticket's section
-- is self-contained: its own fixtures (distinct uuids), its own role switch.
BEGIN;

-- ---- Alter Alley (#322): 'alter' is an artwork type; unknown types are refused ----
INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('32200000-0000-0000-0000-000000000001', 'alter-uploader@example.invalid', now());

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '32200000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  INSERT INTO public.gallery_artworks (title, type, original_card_name, artist_name, uploader_id, image_path)
  VALUES ('Painted Sol Ring', 'alter', 'Sol Ring', 'Alter Hand',
          '32200000-0000-0000-0000-000000000001', '32200000-0000-0000-0000-000000000001/a.png');
  ASSERT (SELECT type FROM public.gallery_artworks WHERE title = 'Painted Sol Ring') = 'alter',
    'an uploader must be able to submit an alter';

  BEGIN
    INSERT INTO public.gallery_artworks (title, type, artist_name, uploader_id, image_path)
    VALUES ('Mystery', 'sculpture', 'Alter Hand',
            '32200000-0000-0000-0000-000000000001', '32200000-0000-0000-0000-000000000001/b.png');
    RAISE EXCEPTION 'an unknown artwork type was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
RESET ROLE;

ROLLBACK;
