-- ─── Fix: infinite recursion in household_members RLS ────────────────────────
-- Policies on household_members that subquery household_members itself cause
-- Postgres to re-evaluate RLS on every row, producing infinite recursion.
-- Fix: introduce SECURITY DEFINER helper functions that bypass RLS, then
-- rebuild all affected policies to call those helpers instead.

-- ─── 1. Helper functions ──────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_household_member(
  p_household_id uuid,
  p_user_id      uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = p_household_id
      AND user_id      = p_user_id
      AND status       = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_household_admin(
  p_household_id uuid,
  p_user_id      uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.household_members
    WHERE household_id = p_household_id
      AND user_id      = p_user_id
      AND role         = 'admin'
      AND status       = 'active'
  );
$$;

-- ─── 2. household_members — fix recursive SELECT / UPDATE / DELETE policies ───

DROP POLICY IF EXISTS "household_members: select household admin" ON public.household_members;
DROP POLICY IF EXISTS "household_members: select co-members"      ON public.household_members;
DROP POLICY IF EXISTS "household_members: update admin"           ON public.household_members;
DROP POLICY IF EXISTS "household_members: delete admin"           ON public.household_members;

CREATE POLICY "household_members: select household admin" ON public.household_members
  FOR SELECT USING (public.is_household_admin(household_id, auth.uid()));

CREATE POLICY "household_members: select co-members" ON public.household_members
  FOR SELECT USING (public.is_household_member(household_id, auth.uid()));

CREATE POLICY "household_members: update admin" ON public.household_members
  FOR UPDATE USING (public.is_household_admin(household_id, auth.uid()));

CREATE POLICY "household_members: delete admin" ON public.household_members
  FOR DELETE USING (public.is_household_admin(household_id, auth.uid()));

-- ─── 3. households — fix recursive SELECT / UPDATE / DELETE policies ──────────

DROP POLICY IF EXISTS "households: select own"    ON public.households;
DROP POLICY IF EXISTS "households: update admin"  ON public.households;
DROP POLICY IF EXISTS "households: delete admin"  ON public.households;

CREATE POLICY "households: select own" ON public.households
  FOR SELECT USING (public.is_household_member(id, auth.uid()));

CREATE POLICY "households: update admin" ON public.households
  FOR UPDATE USING (public.is_household_admin(id, auth.uid()));

CREATE POLICY "households: delete admin" ON public.households
  FOR DELETE USING (public.is_household_admin(id, auth.uid()));

-- ─── 4. household_members — replace overly permissive INSERT policy ──────────
-- The original "insert auth" policy (00005) allows any authenticated user to
-- insert any row, including rows pointing to households they don't belong to.
-- This enables self-invite attacks via direct API calls, bypassing the
-- assertIsAdmin() guard in the server action.
-- Fix: allow inserts only when the caller is an admin of the target household,
-- or is bootstrapping their own admin row as the household creator (used by
-- createHousehold before the first member row exists).

DROP POLICY IF EXISTS "household_members: insert auth"  ON public.household_members;
DROP POLICY IF EXISTS "household_members: insert"       ON public.household_members;

CREATE POLICY "household_members: insert" ON public.household_members
  FOR INSERT WITH CHECK (
    -- Existing admins can invite new members
    public.is_household_admin(household_id, auth.uid())
    -- Bootstrap: the household creator can insert their own admin membership
    -- (called by createHousehold before any member row exists yet)
    OR (
      user_id  = auth.uid()
      AND role   = 'admin'
      AND status = 'active'
      AND EXISTS (
        SELECT 1 FROM public.households
        WHERE id = household_id AND created_by = auth.uid()
      )
    )
  );

-- ─── 5. meal_logs — fix shared-meal SELECT policy ────────────────────────────

DROP POLICY IF EXISTS "meal_logs: select own or shared" ON public.meal_logs;

CREATE POLICY "meal_logs: select own or shared" ON public.meal_logs
  FOR SELECT USING (
    user_id = auth.uid()
    OR (
      is_shared    = true
      AND public.is_household_member(household_id, auth.uid())
      AND id NOT IN (
        SELECT meal_log_id FROM public.meal_participants
        WHERE user_id = auth.uid() AND dismissed = true
      )
    )
  );
