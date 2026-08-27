# Caslin Pipeline Convex Persistence Implementation Plan

## Completion criteria

- The recovered interface and every existing workflow remain available.
- Leads persist in Convex and synchronize between two browser sessions.
- The repository builds from a clean checkout without committed secrets.
- Automated domain, CSV, and Convex function tests pass.
- Type checking, linting, and the production build pass.
- Desktop and mobile browser checks pass without console or network failures.
- GitHub contains the tested source and Vercel production is unchanged until the final approval gate.

## Task 1: Establish the repository and test harness

Create the Vite, TypeScript, Vitest, ESLint, and Convex configuration. Ignore local environment files and generated credentials. Install exact dependency versions and confirm the empty test runner and type checker execute.

## Task 2: Implement domain behavior test-first

Write failing tests for stages, values, date status, lead normalization, and input limits. Run each failing test before adding the minimum implementation. Refactor only while the suite remains green.

## Task 3: Implement CSV behavior test-first

Write failing tests for quoted fields, embedded commas and line breaks, valid imports, missing names, stage mapping, and exports. Add the parser and serializer only after each expected failure is observed.

## Task 4: Implement the Convex backend test-first

Create failing in-memory Convex tests for an empty list, create, update, stage movement with history, delete, bounded import, invalid input, and missing-document errors. Add the schema and public functions with complete argument and return validators. Keep the list bounded and ordered by the update timestamp.

## Task 5: Rebuild the recovered interface

Move the recovered structure and styling into the Vite application without redesigning it. Connect it to a typed data adapter. Preserve keyboard controls, drawer behavior, drag-and-drop, filters, totals, meeting logging, notes, and CSV controls. Add visible loading and save-error states.

## Task 6: Verify locally

Generate Convex types against a disposable local deployment. Run linting, TypeScript checking, all tests, the production build, and a source scan for secrets. Start the frontend and backend, then use a real browser to verify the full workflow at desktop and mobile widths.

## Task 7: Prove shared persistence

Create a representative lead in one browser session, confirm it in a second session, reload both sessions, move and edit the lead, add a note, and confirm the updates synchronize. Exercise CSV import and export, then delete test data and confirm the board is empty again.

## Task 8: Prepare the remote delivery

Commit the verified implementation and push it to `gochrz/seth-pipeline-crm`. Confirm the pushed commit and repository contents. Stop before connecting Vercel or creating the production Convex deployment.

## Task 9: Production approval and release

Present the verified commit, tests, preview evidence, required Ben-owned Convex production key, and exact Vercel changes. After immediate approval, configure Convex production, connect the existing Vercel project to GitHub, deploy, and verify the public domain. Keep the previous Vercel deployment available for rollback.
