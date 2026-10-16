# ADR-002: An Angular SPA over a REST API instead of server-side views

**Status:** Accepted   
**Date:** 2026-09-17   
**Affects:** Process View, Development View, Physical View

## Context

The application is a small internal CRUD front end for a clinic's front desk:
forms, grids, and navigation, used on the clinic's own network. A separate
frontend would mean a second language, a second build, a second test stack, and
an API layer that exists only so the two halves can talk — and for an AI coding
agent, a second place for every use case to be half-implemented.
Against that, an Angular SPA over JSON is how most teams build such front ends.

The project also has to stay recognizable as PetClinic (C-009), which is a
server-rendered application in its original form — but parity lies in its
screens and URLs, not in its rendering model.

## Decision

Build the UI as an **Angular** single-page application in `frontend/` — one page
per use case, over a REST API under `/api` (C-003). Quarkus serves the built
frontend, and `core/SpaRouting` answers every other path with `index.html`.

The alternative kept open by the stack, **Qute** (server-rendered templates), is
not used here. If a screen ever needs it, it is
a new decision and a new ADR, not a quiet addition.

## Consequences

- **Two languages, two builds, one test run.** A use case is implemented in two halves but
  verified in one place, which is what makes the `UC<NNN><Name>Test` layer
  possible at all ([ADR-006](ADR-006-two-test-layers-merged-coverage.md)).
- **UI state lives in the browser.** The deployment is therefore
  stateless: scaling out needs no session affinity, and a reload loses an open
  form. See [`../physical.md`](../physical.md).
- **There is an API.** Anything that reaches the port can call it, which
  fits C-010's trusted-network assumption — and is also why breaking that
  assumption is a bigger change than it looks.
- **Angular conventions become code conventions:** `routerLink` for the menu,
  component styles for styling, `NotFoundPage` on the `**` route for a 404.
