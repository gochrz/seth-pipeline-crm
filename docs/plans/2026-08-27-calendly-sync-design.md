# Caslin Calendly Sync Design

Status: Approved on 2026-08-27

## Goal

Create or update a Caslin Pipeline lead whenever somebody books the Caslin Partner Intro Call at `https://calendly.com/ben-chrzanowski/caslin-partner-intro-call`. Keep the pipeline accurate when Calendly retries a notification, a booking is canceled, or an invitee reschedules.

## Confirmed source

The public funnel at `https://book.caslinpartnerprogram.com/book-call` embeds the exact Calendly event above. The Calendly embed lives in the GoHighLevel funnel, not in this pipeline repository.

## Considered approaches

### Direct Calendly webhook to Convex

Calendly sends booking and cancellation events to a Convex HTTP endpoint. Convex verifies the callback secret, fetches the authoritative scheduled-event record from Calendly, filters to the configured event type, and applies an idempotent database mutation.

This is the selected approach because it receives events even when nobody has the booking page open, includes cancellations and reschedules, and uses Calendly as the source of truth.

### Calendly embed browser event

The GoHighLevel booking page could listen for Calendly's browser event and call Convex. This is rejected because it depends on editable funnel code, does not reliably cover later cancellations, and does not provide enough trusted booking data on its own.

### Periodic Calendly polling

A scheduled job could repeatedly list recent Calendly events. This is rejected because it introduces delay, more API traffic, date-window edge cases, and more complicated duplicate handling than a webhook.

## Data model

Keep the existing public lead shape unchanged. Add a private `calendlyBookings` table that maps each Calendly invitee URI to one lead and records the scheduled event URI, event type URI, booking status, meeting time, and update timestamp.

The mapping table provides an indexed idempotency key and supports reschedules without exposing Calendly identifiers in the public board response.

## Booking behavior

For the configured Caslin event type, a new active booking creates a lead with these defaults:

- stage: Lead
- offer: Core
- closer: Ben
- value: 0
- source: Calendly
- next meeting: Calendly start time
- next step: Attend intro call
- contact fields: values supplied by the Calendly invitee

Repeated delivery of the same invitee event updates the existing mapping and lead instead of creating another lead. A rescheduled booking follows Calendly's old and new invitee references so the existing lead receives the new meeting time. A cancellation keeps the lead, clears its next meeting when it still matches the canceled booking, and adds one automatic history entry.

## Security and configuration

Expose only one POST route under `/webhooks/calendly`. Require a high-entropy callback secret and fetch the referenced Calendly resource with a server-side personal access token before writing data. Reject requests when the secret, access token, or configured event type URI is missing or incorrect.

Store `CALENDLY_ACCESS_TOKEN`, `CALENDLY_WEBHOOK_SECRET`, and `CALENDLY_EVENT_TYPE_URI` only in the Convex production environment. Do not place them in the repository, Vercel frontend environment, browser bundle, logs, or callback responses.

The existing public pipeline access remains unchanged in this phase.

## Failure handling

Return a non-success response for invalid secrets, malformed payloads, missing configuration, Calendly API failures, or unsupported events so Calendly can retry transient failures. Return success without writing for valid events belonging to a different Calendly event type.

Database writes are transactional and idempotent. The handler adds history entries only when the booking state actually changes.

## Verification

- prove new bookings create exactly one lead
- prove duplicate webhook delivery creates no duplicate
- prove cancellations retain the lead and clear the matching meeting
- prove reschedules update the same lead
- prove unrelated event types are ignored
- prove missing and incorrect secrets are rejected
- run all tests, linting, type checking, and the production build
- deploy the tested commit to Convex and Vercel production
- register the Calendly webhook for booking and cancellation events
- complete one controlled real booking and confirm it appears once in the public pipeline

