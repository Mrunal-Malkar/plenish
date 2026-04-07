# DB Migrate

Create and apply a new Supabase migration.

## Steps

1. Check `docs/database_schema.md` to understand the current schema before making changes.
2. Create the next migration file in `supabase/migrations/` — filename: `<next_number>_<description>.sql` (check existing files for the current highest number).
3. Include in the migration: `CREATE TABLE`, `ENABLE ROW LEVEL SECURITY`, RLS policies, and indexes.
4. Update `docs/database_schema.md` to reflect the new tables or changes.
5. Apply: run `supabase db push` if the CLI is available, otherwise remind the user to run it manually in the Supabase SQL editor.
