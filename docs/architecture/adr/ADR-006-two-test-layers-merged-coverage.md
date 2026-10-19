# ADR-006: Two test layers — use-case `*Test` and journey `*IT`

**Status:** Accepted   
**Date:** 2026-09-17   
**Affects:** Development View

## Context

Two things need verifying, and they are not the same thing. A **use case** is a
screen's behaviour: validation, notifications, navigation, ordering. A **test
case** is a journey across several use cases, and it is only convincing if a
real browser walks it.

Verifying everything in a browser is slow and flaky. Verifying everything
server-side never proves the application actually renders and responds in a
browser. Running both, but measuring coverage on only one, would push an agent
into writing duplicate use-case tests for code an end-to-end test already
covers.

## Decision

Two layers, distinguished by the class name suffix, which also decides the Maven
phase:

| Layer | Name | Runner | Scope |
|-------|------|--------|-------|
| `@QuarkusTest` + `BrowserTest` / REST Assured | `UC<NNN><Name>Test` | Surefire, `test` | one use case, its page in Playwright, its resource over `/api` — **the default** |
| `@QuarkusTest` + `BrowserTest` | `TC<NNN><Name>IT` | Failsafe, `verify` | a test case journey in a real browser |

Both run against a real PostgreSQL, the local server (NFR-007), and the built
frontend. `quarkus-jacoco` instruments the application in both phases and writes
**one report**, `target/jacoco-report`.

## Consequences

- **A line covered only by a Playwright `*IT` counts as covered,** so nobody
  writes a use-case test just to satisfy the gate. That is the whole point of
  the one report.
- **Only `./mvnw verify` produces the full report.** `./mvnw test` stops
  before the journeys — checking coverage after `test` shows a
  number that is wrong by construction.
- **Naming is load-bearing.** A use-case test called `*IT` never runs in
  `test`; a journey called `*Test` runs in the wrong phase and fails.
- **The journey layer stays small** — one class per specified test case, and no
  more — because it is the expensive one.
