You MUST follow every step. Do not skip any.

## Step 1: Understand
Restate the task in one sentence. If anything is unclear — ASK the user now. Do not proceed with assumptions.

## Step 2: Research
- Read the official documentation for every library/API involved in this task.
- Use `web_search` or `web_fetch` to verify API methods, parameters, and behaviors you are not 100% certain about.
- Read existing code in the codebase that is related to this task. Use `grep` to find all relevant files.

## Step 3: Map Files
List every file that will be created or modified. For each:
- Path
- New or existing
- What changes

Verify no file will exceed 200 lines after changes. If it will — plan the split.

## Step 4: Define Interfaces
Write the exact function signatures, type definitions, API contracts, or component props BEFORE any implementation. Include:
- Parameter types and return types
- Error cases
- Pydantic schemas (if API endpoint)
- Props interface (if React component)

## Step 5: Check for Duplication
Search the codebase for:
- Similar functions that already exist
- Shared utilities that should be reused
- Patterns from existing features that this should follow

## Step 6: Identify Risks
- What could go wrong?
- Are there API limitations?
- Edge cases?
- What happens on error?

## Step 7: Test Plan
- What tests will you write?
- How will you verify the feature works?
- For UI: how will you visually verify?

## Step 8: STOP
Present the plan. Do NOT write code until the user says "go" or "proceed" or approves the plan.
