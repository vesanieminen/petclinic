# ADR-009: The repository is the transaction boundary

**Status:** Accepted   
**Date:** 2026-09-17   
**Affects:** Process View, Development View   
**Supersedes:** relying on auto-commit with no transaction declared anywhere

## Context

Every use case in this application writes exactly one row with one statement, so
the JDBC connection's auto-commit mode would do: a single statement is atomic in
PostgreSQL, and nothing can be half-written. Declaring nothing at all is
therefore defensible — the transaction boundary exists, it is simply nowhere in
the code.

That is a bad shape to hand an AI coding agent. If nothing in the source says
where a transaction begins, the first use case that needs two statements gets
them as two calls from a resource, each committing on its own — and it looks exactly
like every use case before it. An implicit boundary cannot be reviewed, and it
cannot be enforced.

The question is not *whether* transactions exist but *where they are declared*.
Two candidates: the resource, which knows the use case, or the repository, which
knows the data. A transactional resource invites returning entities and letting
Jackson walk their lazy associations — queries nobody wrote.

## Decision

**Declare transactions on the repository.**

- `@Transactional` at class level on every `*Repository`, reads and writes alike.
- **Never `@Transactional` in an `api` package.** A resource calls repository methods
  in sequence; it does not wrap them.
- A use case that needs two statements to succeed together gets **one**
  `@Transactional` method in the feature's `domain` package that does both.

`ArchitectureTest.repositoriesAreTransactional` and `resourcesAreNotTransactional`
enforce it; [`../development.md`](../development.md#transaction-boundary) states
it.

## Consequences

- **The boundary is visible and checkable.** An agent adding a repository method
  inherits the class's annotation, and a repository without one fails the build.
- **Nothing lazy leaves the repository.** A collection its query did not load
  fails with `LazyInitializationException` in the resource, in the first test.
- **Behaviour is the same as auto-commit today.** One statement per transaction
  either way — this buys a declared place to put the second statement when it
  arrives, not a fix for a bug.
- **A screen's reads are still separate transactions**, and deliberately so:
  wrapping them would mean holding a transaction across the rendering of a page.
  [`../process.md`](../process.md#transaction-boundaries) says what that costs.
- **The check-then-act on duplicate pet names stays two transactions** with a
  click between them. The database's unique index is what closes that race — an
  interaction cannot be made atomic by annotating it.
