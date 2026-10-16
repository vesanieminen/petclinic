# ADR-001: JPA with Panache instead of jOOQ

**Status:** Accepted   
**Date:** 2026-09-17   
**Affects:** Logical View, Development View

## Context

The original Spring PetClinic uses Spring Data JPA. This re-implementation needs
a persistence approach that an AI coding agent can be held to: the specifications
state exact queries, orderings, and "load this in one query" rules (UC-002
BR-002, UC-004 BR-002, UC-005 BR-001/002, NFR-001/002), and an agent must not be
free to satisfy them with a lazy-loading side effect nobody can see in the code.

With an ORM, what actually reaches the database is the product of mappings,
fetch types, and a session lifecycle. Reviewing generated code then means
reviewing what the framework will do with it — which is precisely the kind of
implicit behaviour an agent gets wrong and a reviewer misses.
jOOQ would avoid it, at the price of a code generator in the build and an idiom
no Quarkus guide uses.

## Decision

Use **JPA through Hibernate ORM with Panache**, constrained so the query a page
runs is written in one known place. No Spring Data, no active record.

- Domain types are hand-written `@Entity` classes mapping the tables Flyway
  creates; resources return records shaped for the page, never entities.
- To-many data loads with `left join fetch` in the same query.
- Persistence classes are still called `<Entity>Repository` and annotated
  `@ApplicationScoped`, implementing `PanacheRepositoryBase<E, ID>`.

`ArchitectureTest.noSpring`, `entitiesAreNotActiveRecords`,
`repositoriesAreNamedAndScoped` and `resourcesNeverReturnEntities` enforce this.

## Consequences

- **The query in the code is the JPQL, not the SQL.** Review and
  specification compare directly; the N+1 discussions in
  [`../process.md`](../process.md) are checked in the SQL log, not guessed.
- **No code generation, and no compile-time check.** A wrong column name fails
  the first test that reads it, so a migration and its entity change together
  ([ADR-003](ADR-003-flyway-owns-the-schema.md)).
- **No dirty checking, cascade or lazy loading outside a repository.** Every write is an explicit
  statement. For the five single-statement writes this application has, that is
  a simplification, not a cost.
- **The SQL is PostgreSQL-specific.** Accepted: C-005 names one database.
