-- Weekly planning tables: weekly_plan and plan_meals

-- ─── Weekly Plan ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.weekly_plan (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  start_date  date NOT NULL,
  end_date    date NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.weekly_plan ENABLE ROW LEVEL SECURITY;

CREATE POLICY "weekly_plan: select own" ON public.weekly_plan
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "weekly_plan: insert own" ON public.weekly_plan
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "weekly_plan: update own" ON public.weekly_plan
  FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "weekly_plan: delete own" ON public.weekly_plan
  FOR DELETE USING (auth.uid() = user_id);

-- ─── Plan Meals ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.plan_meals (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id        uuid NOT NULL REFERENCES public.weekly_plan(id) ON DELETE CASCADE,
  recipe_id      uuid REFERENCES public.recipes(id) ON DELETE SET NULL,
  suggested_text text,
  day_of_week    int NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  meal_type      text NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner', 'snack')),
  status         text NOT NULL DEFAULT 'planned'
                   CHECK (status IN ('planned', 'eaten', 'skipped', 'replaced')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.plan_meals ENABLE ROW LEVEL SECURITY;

-- Access is gated through the weekly_plan owner
CREATE POLICY "plan_meals: select own" ON public.plan_meals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plan wp
      WHERE wp.id = plan_id AND wp.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_meals: insert own" ON public.plan_meals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.weekly_plan wp
      WHERE wp.id = plan_id AND wp.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_meals: update own" ON public.plan_meals
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plan wp
      WHERE wp.id = plan_id AND wp.user_id = auth.uid()
    )
  );

CREATE POLICY "plan_meals: delete own" ON public.plan_meals
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.weekly_plan wp
      WHERE wp.id = plan_id AND wp.user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS plan_meals_plan_day_idx
  ON public.plan_meals (plan_id, day_of_week, meal_type);
