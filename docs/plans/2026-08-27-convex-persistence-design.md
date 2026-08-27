# Caslin Pipeline Convex Persistence Design

Status: Approved on 2026-08-27

## Goal

Preserve the current Caslin Pipeline interface and workflows while replacing temporary browser-only state with one shared, persistent Convex database. Keep the application public and do not add authentication in this phase.

## Current state

The production site is a single static HTML document. It stores leads through `window.storage`, which is not available in a normal browser and therefore falls back to memory for the current session. The new GitHub repository is empty, the existing Vercel project is not connected to Git, and the Convex project has an empty development deployment.

## Chosen approach

Use a small Vite and TypeScript application with the Convex browser client. Preserve the existing HTML structure, styling, labels, filters, drag-and-drop behavior, CSV tools, and drawer interactions. Split the recovered source into maintainable modules without redesigning the product.

This approach is preferred over loading Convex from a CDN inside one HTML file because it gives repeatable builds, generated API types, dependency locking, and reliable Vercel deployment. A React or Next.js rewrite is intentionally excluded because it adds risk without improving the requested behavior.

## Data model

Store each lead as one Convex document with these fields:

- name
- email
- phone
- source
- stage
- offer
- closer
- value
- last meeting date
- next meeting date and time
- next step
- notes with timestamp, text, and automatic-entry flag
- created and updated timestamps

The stage, offer, and closer values are validated against the values supported by the interface. The backend assigns timestamps and validates required text, lengths, monetary values, and imported data. The first version returns at most 1,000 leads to keep reads bounded; the interface will show a clear limit message if the board reaches that size.

## Backend interface

Expose only the operations the browser needs:

- subscribe to the current lead list
- create or update a lead
- move a lead to another stage and record the automatic history entry
- delete a lead
- import a bounded CSV batch

All registered Convex functions use argument and return validation. Mutations are transactional so a saved lead or stage move is either fully applied or not applied at all.

## Client data flow

The browser connects to the Convex URL supplied at build time and subscribes to the lead list. Convex pushes changes to every open browser session in real time. Existing filters and totals are calculated locally from the subscribed list.

Edits are submitted through Convex mutations. The interface shows a loading state before the first result, disables repeated saves while a request is active, and keeps the drawer open with a visible error if a save fails. There is no silent memory-only fallback because that could make a user believe unsaved data was persisted.

## Public access boundary

There is no login in this phase. Anyone who can reach the public URL can view, create, change, import, or delete leads. The implementation does not place a fake shared secret in browser code. Authentication and role-based access remain a future enhancement.

## Deployment design

Development uses the existing Convex development deployment. Production uses a production deployment in the same Ben-owned Convex project. The production deploy key is stored only as a Vercel environment variable.

The GitHub repository becomes the source of truth. Vercel is connected to the repository and builds with Convex's production deployment command so a future push updates the backend functions and frontend together. The existing `caslin-pipeline.vercel.app` domain remains attached to the Vercel project.

No existing data migration is planned because the observed production board is empty. CSV import remains available for any data that needs to be brought in later.

## Verification

Before production changes:

- test domain rules and CSV parsing with automated tests
- test Convex queries and mutations against a disposable local deployment
- run TypeScript checking, linting, automated tests, and the production build
- verify the interface visually at desktop and mobile widths
- verify create, edit, drag, notes, filters, import, export, and delete
- verify a created lead survives reload and appears in a second browser session
- confirm the GitHub repository contains no deploy keys or local environment files

After explicit production approval:

- create and configure the Convex production deployment
- connect the existing Vercel project to GitHub
- deploy the tested commit
- repeat the persistence and second-session checks on the public domain
- inspect Convex and Vercel logs for errors

## Rollback

Keep the current Vercel deployment available before promotion. If the new deployment fails verification, restore the prior Vercel deployment. Because the prior application does not persist shared data, any production Convex data created during the verification window must be exported before a rollback if it needs to be retained.
