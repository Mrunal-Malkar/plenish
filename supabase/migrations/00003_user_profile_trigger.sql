-- Auto-create a public.users profile row whenever a new user signs up via auth.users.
-- This is required because meal_logs, recipes, weekly_plan all FK reference public.users.
-- Without this trigger, any authenticated user who never had a public.users row
-- will get a FK violation on their first INSERT into any of those tables.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, default_language)
  VALUES (
    NEW.id,
    NEW.email,
    'es'  -- default language per schema
  )
  ON CONFLICT (id) DO NOTHING;  -- idempotent: safe to run if row already exists
  RETURN NEW;
END;
$$;

-- Drop and recreate to ensure idempotency on re-runs
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
