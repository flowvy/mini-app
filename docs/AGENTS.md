# Documentation instructions

Applies to `docs/` and repository-facing prose.

- Verify claims against code, manifests, migrations, tests, and current command output before
  editing. Code and executable configuration win when prose disagrees.
- `PROJECT_STATE.md` contains verified present facts, known risks, latest checks, and the next action.
  `ROADMAP.md` (when present) contains intent. Do not mix planned behavior into the implemented list.
- Keep document ownership distinct: `PRODUCT` describes actors/journeys, `TESTING` evidence,
  `SECURITY` trust/invariants, `INTEGRATIONS` external contracts, and `OPERATIONS` runtime procedures.
  Link to canonical details instead of copying status lists across them.
- `ARCHITECTURE.md` explains stable responsibilities, trust boundaries, and data flows. Avoid brittle
  full file inventories, line numbers, route counts, dependency patch versions, and copied code.
- `DEV_ENVIRONMENT.md` must use commands that work from the stated directory and distinguish safe
  local mock mode from real Telegram/provider integration.
- Treat `api-remnawave.json` as a repository snapshot, not automatically current. For external API
  claims, record provider/product version, primary source URL, and verification date.
- Update docs in the same change as a contract, configuration, setup, migration, operational, or
  user-visible behavior change. Link to one canonical explanation instead of duplicating it.
- Write concise Russian prose for project status/onboarding and preserve English identifiers,
  commands, paths, and public API names. Use relative Markdown links and descriptive headings.
- Never include secrets, real identifiers, raw init data, production URLs, private payloads, or
  instructions that destroy local data. Mark placeholders unmistakably.
- When a check was not run, say exactly what was blocked; do not turn assumptions into facts.
