Run this checklist after completing any task. Every check must pass.

## 1. File Size
```bash
find backend/src frontend/src -name '*.py' -o -name '*.ts' -o -name '*.tsx' | while read f; do
  lines=$(wc -l < "$f")
  if [ "$lines" -gt 200 ]; then echo "FAIL: $f has $lines lines (max 200)"; fi
done
```
If any file exceeds 200 lines — split it now.

## 2. Dead Code
```bash
cd backend && uv run ruff check . --select F401,F841
cd frontend && pnpm biome check . 2>&1 | grep -i "unused"
```
Fix every unused import and variable.

## 3. Lint Clean
```bash
cd backend && uv run ruff check .
cd frontend && pnpm biome check .
```
Zero errors, zero warnings.

## 4. Tests Pass
```bash
cd backend && uv run pytest -x -v
cd frontend && pnpm test
```
All tests must pass. If any fail — fix before reporting done.

## 5. Build Succeeds
```bash
cd frontend && pnpm build
```
Must complete without errors. TypeScript strict checking catches type issues here.

## 6. No Hardcoded Values
```bash
grep -rn "localhost\|127\.0\.0\.1\|hardcoded\|TODO\|FIXME\|HACK" backend/src/ frontend/src/ --include='*.py' --include='*.ts' --include='*.tsx' | grep -v node_modules | grep -v __pycache__
```
Review every match. Replace with config references.

## 7. No Duplicate Code
Search for any function or component that has a near-duplicate elsewhere. If found — extract shared logic.

## 8. Cross-Reference Check
For every new file created, verify:
- It is imported/used somewhere (not orphaned)
- Its imports all resolve to existing files
- The barrel export (`index.ts` / `__init__.py`) includes it if needed

Report results to the user. If all checks pass, say "All checks passed." If any fail, fix them before reporting.
