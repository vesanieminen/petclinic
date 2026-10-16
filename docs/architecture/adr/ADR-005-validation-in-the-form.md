# ADR-005: Validation lives in the Angular form, not in the entity

**Status:** Accepted   
**Date:** 2026-09-17   
**Affects:** Logical View, Development View

## Context

Every use case that writes data states its validation as user-visible behaviour:
the offending field is marked, the message names the problem, and the user's
other entries survive (FR-023, and the alternative flows of UC-003, UC-006,
UC-007, UC-008, UC-009). Validation is therefore not only a guard against bad
data — it is a specified interaction.

Bean Validation annotations on the entities would put the rule in a second
place: an exception thrown after the fact, which the page would then have to
translate back into a field-level error message. Two implementations of the same
rule, one of which cannot produce the specified behaviour on its own.

## Decision

**The form is the validation boundary.** A feature's page builds an Angular
reactive form whose validators run field-level validation, and either
submits a valid form or surfaces field errors. A page also uses the form's
helpers for pushing a late error — one discovered only by a database lookup —
back onto a named field.

**The domain stays validation-free:** no annotations, no constructor checks.
`ArchitectureTest.domainIsValidationFree` enforces it.

## Consequences

- **The specified behaviour is the implementation,** not a translation of an
  exception into it.
- **An entity can be constructed in an invalid state** — in tests, for instance.
  Accepted: the database's `NOT NULL` and foreign keys are the backstop against
  a genuinely broken write.
- **The API is a second entry point without the form's validation**
  ([ADR-002](ADR-002-angular-spa-and-rest-api.md)). If any other client is ever
  given it, this decision has to be revisited before it is.
- **Rules that need the database stay in the resource** (duplicate pet name), which
  is why [`../process.md`](../process.md) documents that check-then-act
  explicitly.
