# New Feature

Scaffold a new Plenish feature end-to-end following the established patterns.

## Steps

1. Check `docs/product_spec.md` and `docs/database_schema.md` for spec alignment before writing any code.

## Rules
- Follow the slot pattern: `RecentMeals.tsx` + `RecentMealsList.tsx` is the reference.
- styled-components only — no Tailwind.
- New tables always need RLS enabled and policies defined in the same migration file.
