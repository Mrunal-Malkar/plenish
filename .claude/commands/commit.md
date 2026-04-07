# Commit

Stage and commit changes following the project conventions.

## Steps

1. Run `git status` and `git diff --stat HEAD` to understand what changed.
2. Run `npm run build` — fix any type errors before proceeding.
3. Identify the change type: `feat` / `fix` / `refactor` / `chore` / `docs`
4. Identify the scope (the feature area): `meals` / `ai` / `auth` / `db` / `ui` / `recommendations`
5. Stage only relevant source files — never `.env*`, `node_modules/`, or build artifacts.
6. Commit with the format: `<type>(<scope>): <short summary in English>`

## Rules
- One logical change per commit.
- Summary line under 72 characters.
- If multiple unrelated changes exist, ask the user which to stage first.
