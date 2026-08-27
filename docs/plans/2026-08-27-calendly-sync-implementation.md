# Caslin Calendly Sync Implementation Plan

## Completion criteria

- The exact Caslin Partner Intro Call is the only Calendly event type that enters the pipeline.
- A new booking creates one Lead-stage record with the correct contact and meeting details.
- Duplicate delivery, cancellation, and rescheduling are idempotent and covered by automated tests.
- Calendly credentials and callback secrets remain server-side and uncommitted.
- The full test suite, linting, type checking, and production build pass.
- Convex and Vercel production deploy successfully.
- A controlled real Calendly booking appears exactly once and remains after reload.

## Task 1: Add test fixtures and failing backend tests

Describe Calendly booking input independently of the HTTP payload. Add failing Convex tests for create, duplicate delivery, cancellation, reschedule, and unrelated event types. Run the focused test file and confirm every new test fails because the sync behavior is absent.

## Task 2: Add the private booking mapping

Add the `calendlyBookings` table and indexes required to find an invitee mapping. Implement the smallest internal mutation that passes the booking lifecycle tests while preserving existing public lead behavior.

## Task 3: Add webhook parsing and configuration checks

Add focused tests for accepted Calendly payloads, malformed input, unsupported event names, and missing or incorrect callback secrets. Implement the HTTP route and a small parser after observing the expected failures.

## Task 4: Fetch and filter authoritative Calendly data

Use the server-side access token to fetch the scheduled event referenced by the webhook. Require the configured event type URI before calling the internal mutation. Keep all external data validation at the HTTP boundary.

## Task 5: Run local verification

Generate Convex bindings, run the focused tests, full suite, linting, type checking, and production build. Scan the changed files and commit for Calendly or Convex secrets.

## Task 6: Release the tested implementation

Commit and push the verified change to the GitHub main branch. Confirm the connected Vercel deployment and Convex function deployment are ready before changing Calendly.

## Task 7: Activate and prove the live subscription

Use the Ben-owned Calendly account to resolve the exact event type URI, store the three production environment values, and create one subscription for `invitee.created` and `invitee.canceled`. Make a controlled booking through the public Caslin page, confirm one lead appears, then cancel or reschedule it and confirm the same lead updates without duplication.
