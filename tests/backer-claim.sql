-- Run in a DISPOSABLE Supabase project's SQL editor after supabase-schema.sql.
-- Never run on production. Fixtures and enforcement changes roll back together.
-- Run the whole file in one submission; any failed assertion aborts it.
BEGIN;

INSERT INTO auth.users (id, email, email_confirmed_at) VALUES
  ('24000000-0000-0000-0000-000000000001', 'Backer@example.invalid', now()),
  ('24000000-0000-0000-0000-000000000002', 'unconfirmed@example.invalid', NULL),
  ('24000000-0000-0000-0000-000000000003', 'ordinary@example.invalid', now()),
  ('24000000-0000-0000-0000-000000000004', 'founder@example.invalid', now());
INSERT INTO public.backer_allowlist (email) VALUES
  ('backer@example.invalid'), ('unconfirmed@example.invalid'), ('founder@example.invalid')
ON CONFLICT DO NOTHING;
INSERT INTO public.founders (user_id) VALUES ('24000000-0000-0000-0000-000000000004');
UPDATE public.app_config SET value = 'true'::jsonb WHERE key = 'payment_enforcement';

DO $$
BEGIN
  ASSERT has_function_privilege('authenticated', 'public.claim_backer_membership()', 'EXECUTE');
  ASSERT NOT has_function_privilege('anon', 'public.claim_backer_membership()', 'EXECUTE');
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.backer_allowlist'::regclass);
  ASSERT NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'backer_allowlist');
END $$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000001', true);
DO $$
BEGIN
  ASSERT NOT public.is_entitled(), 'fixture must start without Membership';
  ASSERT public.claim_backer_membership(), 'verified normalized email must claim';
  ASSERT public.is_entitled(), 'claim must grant ordinary Founder entitlement';
  ASSERT NOT public.claim_backer_membership(), 'a repeat must be a no-op';
  ASSERT public.is_entitled(), 'repeat must preserve Membership';
  ASSERT NOT EXISTS (SELECT 1 FROM public.backer_allowlist), 'RLS must hide surveyed emails';
  BEGIN
    INSERT INTO public.backer_allowlist (email) VALUES ('injected@example.invalid');
    RAISE EXCEPTION 'authenticated user inserted an allowlist row';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;

SELECT set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000002', true);
DO $$
BEGIN
  ASSERT NOT public.claim_backer_membership(), 'unconfirmed email must not claim';
  ASSERT NOT public.is_entitled(), 'unconfirmed account must remain unentitled';
END $$;

SELECT set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000003', true);
DO $$
BEGIN
  ASSERT NOT public.claim_backer_membership(), 'unlisted email must not claim';
  ASSERT NOT public.is_entitled(), 'unlisted account must remain unentitled';
END $$;

SELECT set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000004', true);
DO $$
BEGIN
  ASSERT public.claim_backer_membership(), 'an existing Founder can consume their entry';
  ASSERT public.is_entitled(), 'Founder overlap must preserve Membership';
END $$;

RESET ROLE;
DO $$
BEGIN
  ASSERT (SELECT claimed_by = '24000000-0000-0000-0000-000000000001'::uuid
          AND claimed_at IS NOT NULL FROM public.backer_allowlist WHERE email = 'backer@example.invalid');
  ASSERT (SELECT claimed_at IS NULL FROM public.backer_allowlist WHERE email = 'unconfirmed@example.invalid');
END $$;
UPDATE auth.users SET email_confirmed_at = now()
WHERE id = '24000000-0000-0000-0000-000000000002';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000002', true);
DO $$ BEGIN
  ASSERT public.claim_backer_membership(), 'confirmation must make the unconsumed entry claimable';
  ASSERT public.is_entitled();
END $$;

-- Deleting a claimant must not recycle their already-consumed grant.
RESET ROLE;
DELETE FROM auth.users WHERE id = '24000000-0000-0000-0000-000000000001';
UPDATE auth.users SET email = 'backer@example.invalid'
WHERE id = '24000000-0000-0000-0000-000000000003';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '24000000-0000-0000-0000-000000000003', true);
DO $$ BEGIN
  ASSERT NOT public.claim_backer_membership(), 'a consumed email cannot grant a second account';
  ASSERT NOT public.is_entitled();
END $$;

SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN
    PERFORM public.claim_backer_membership();
    RAISE EXCEPTION 'anon executed the claim RPC';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;
ROLLBACK;
