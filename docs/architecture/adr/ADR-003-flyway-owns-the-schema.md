# ADR-003: Flyway owns the schema, and the entities map it

**Status:** Accepted   
**Date:** 2026-09-17   
**Affects:** Logical View, Development View, Physical View

## Context

[ADR-001](ADR-001-jpa-with-panache.md) maps Java entities onto a database schema,
so something has to define that schema. Three candidates: an ORM generating it
from entities (Hibernate could), a hand-maintained SQL file, or versioned
migrations. The entity model in [`../../entity_model.md`](../../entity_model.md)
is the specification; NFR-009 requires the schema to reproduce it exactly, which
means the schema needs to be reviewable as text next to that document.

## Decision

**Flyway migrations are the only way the schema is created or changed**
(C-006), in `src/main/resources/db/migration`. `quarkus-flyway` runs the
migrations when the application starts, and Hibernate's schema management is off
(`quarkus.hibernate-orm.schema-management.strategy=none`): entities only map the
result.

Test-only seed data is a separate migration on the test classpath
(`src/test/resources/db/migration/V2__seed_reference_data.sql`) so it can never
reach a production database.

## Consequences

- **The migrations are the schema DSL.** Changing one and not its entity
  leaves a stale mapping — the most common build surprise in this project,
  and one only the first test that reads the table catches.
- **A local PostgreSQL becomes a build dependency** (C-007): no database, no
  `@QuarkusTest`.
- **There is no generated code.** Nothing to regenerate, commit or exclude from
  analysis; every class under `src/main/java` is hand-written.
- **A schema change is reviewable as a diff** against the entity model, which is
  what makes NFR-009 checkable by a human in seconds.
