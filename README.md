# Caslin Pipeline

A shared sales pipeline for Ben, Dylan, and Seth. The interface stays public and uses Convex for persistent, real-time data.

## What it supports

- Add, edit, move, and delete leads
- Shared updates across open browsers
- Meeting, closer, offer, and search filters
- Notes and automatic stage history
- CSV import and export
- Desktop and mobile layouts

## Local development

Install dependencies and start Convex:

```sh
pnpm install
pnpm convex:dev
```

In a second terminal, start the site:

```sh
pnpm dev
```

## Verification

```sh
pnpm test
pnpm lint
pnpm build
```

## Vercel

The Vercel project needs a `CONVEX_DEPLOY_KEY` environment variable from the matching Convex project. The production key must only be stored in Vercel, never committed to this repository.
