-- ─── Enrich meal_logs ─────────────────────────────────────────────────────────
-- nutrition: sparse JSONB (only non-zero servings stored)
-- inferred_ingredients: temporary ingredient storage for unlinked meals

ALTER TABLE public.meal_logs
  ADD COLUMN IF NOT EXISTS nutrition            jsonb,
  ADD COLUMN IF NOT EXISTS inferred_ingredients text[];

-- ─── Per-user diet profile ────────────────────────────────────────────────────
-- Replaces hardcoded Nestle guidelines in the system prompt.
-- Defaults = Nestle Menu Planner values.

CREATE TABLE IF NOT EXISTS public.user_diet_profiles (
  id      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,

  -- Daily serving targets
  daily_targets jsonb NOT NULL DEFAULT '{
    "dairy":     {"min": 2, "max": 4},
    "fruit_veg": {"min": 4, "max": 5},
    "grains":    {"min": 4, "max": 6},
    "olive_oil": {"min": 3, "max": 6},
    "water":     {"min": 4, "max": 8}
  }',

  -- Weekly serving targets
  weekly_targets jsonb NOT NULL DEFAULT '{
    "fish":    {"min": 3},
    "legumes": {"min": 3},
    "meat":    {"max": 4},
    "eggs":    {"max": 4},
    "nuts":    {"min": 3, "max": 7}
  }',

  -- Restrictions (no_repeat_hours, occasional_foods, protein_rotation)
  restrictions jsonb NOT NULL DEFAULT '{
    "no_repeat_hours": 48,
    "occasional_foods": ["sweets","pastries","soft drinks","sausages","cold cuts"],
    "protein_rotation": ["white_meat","legumes","fish_blue","fish_white","red_meat"]
  }',

  -- Portion size defaults: food keyword -> { category, count }
  -- AI uses these for inference when user does not state quantities.
  serving_sizes jsonb NOT NULL DEFAULT '{
    "arepa":        {"category": "grains",      "count": 1},
    "huevo":        {"category": "eggs",        "count": 1},
    "queso":        {"category": "dairy",       "count": 1},
    "pollo":        {"category": "meat",        "count": 1},
    "carne molida": {"category": "meat",        "count": 1},
    "pasta":        {"category": "grains",      "count": 1},
    "arroz":        {"category": "grains",      "count": 1},
    "cuscus":       {"category": "grains",      "count": 1},
    "brocoli":      {"category": "vegetables",  "count": 1},
    "champinones":  {"category": "vegetables",  "count": 1},
    "mandarina":    {"category": "fruit",       "count": 1},
    "anchoas":      {"category": "fish",        "count": 1},
    "salmon":       {"category": "fish",        "count": 1},
    "pipas":        {"category": "nuts",        "count": 1},
    "lentejas":     {"category": "legumes",     "count": 1},
    "garbanzos":    {"category": "legumes",     "count": 1}
  }',

  -- Per-dish implicit ingredients this user always has (e.g. butter on arepas).
  -- Shape: { "arepa": ["mantequilla"], "cafe": ["leche entera"] }
  -- Active application in logMealTool is future work.
  implicit_ingredients jsonb NOT NULL DEFAULT '{}',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_diet_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "diet_profile: select own" ON public.user_diet_profiles
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "diet_profile: insert own" ON public.user_diet_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "diet_profile: update own" ON public.user_diet_profiles
  FOR UPDATE USING (auth.uid() = user_id);

-- ─── Auto-create default diet profile on new user ─────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_diet_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.user_diet_profiles (user_id)
  VALUES (NEW.id)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_user_created_diet_profile
  AFTER INSERT ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_diet_profile();
