# AIUP PetClinic

A demo project accompanying a talk on **Spec-Driven Development with the AI Unified Process (AIUP)**.

It revisits the classic [Spring PetClinic](https://github.com/spring-projects/spring-petclinic) sample, but built from
the ground up using specifications first — use cases, an entity model, and UI flows — and then letting AI assistants
implement the code against those specs.

## AI Unified Process

Spec-Driven Development (SDD) flips the usual "prompt and pray" workflow on its head. Instead of asking an AI to produce
code from a one-line request, you invest upfront in a precise, machine-readable specification of what the system should
do. The AI then works *against* that spec — generating code, tests, and documentation that can be verified against a
stable source of truth.

The [**AI Unified Process (AIUP)**](https://unifiedprocess.ai/) is a lightweight adaptation of the Unified Process for
AI-assisted development. It keeps the artifacts that matter — use cases, domain models, architectural decisions — and
drops the ceremony that doesn't. The result is a workflow where humans stay in charge of *intent* and AI handles the
mechanical translation to code.

This repository is the running example used in the talk.

## Branches

The repository has two branches, marking the beginning and the end of the demo.

| Branch  | Description                                                                                                                                                              |
|---------|--------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `start` | The state right after reverse-engineering the original Spring PetClinic. All ten use cases are specified in [`docs/`](docs/), but only UC-001 (welcome page) is built. **This is where the live demo begins.** |
| `main`  | The end state: every use case implemented against those specifications, covered by use-case tests and a Playwright end-to-end journey.                                    |

`main` is a single commit on top of `start`, so the whole demo is one diff:

```bash
git diff start main
```

To follow along yourself, start from the beginning:

```bash
git switch start
```

Or create your own branch from it and let your AI assistant implement the remaining use cases:

```bash
git switch -c my-experiment start
```

## Stack

- **Java 25**
- **Quarkus 3.40** — REST API (Quarkus REST + Jackson)
- **Angular 22** — UI, in `frontend/`
- **Hibernate ORM with Panache** — JPA
- **Flyway** — database migrations
- **PostgreSQL** (a local server for the application and the tests)

## Specs

The specifications that drive the implementation live in [`docs/`](docs/) and are the source of truth — when the code
and a use case disagree, the use case wins:

- [`docs/vision.md`](docs/vision.md) — the problem and the goals
- [`docs/requirements.md`](docs/requirements.md) — functional and non-functional requirements
- [`docs/entity_model.md`](docs/entity_model.md) — the domain model as a Mermaid ER diagram
- [`docs/use_cases.puml`](docs/use_cases.puml) — PlantUML use case diagram
- [`docs/use_cases/`](docs/use_cases) — one specification per use case
- [`docs/business_rules.md`](docs/business_rules.md) — the rules several use cases share, referenced by id from each of them
- [`docs/test_cases/`](docs/test_cases) — end-to-end journeys spanning several use cases
- [`docs/architecture/`](docs/architecture) — the 4+1 views (logical, process, development, physical), the code and
  test conventions the generated code must follow, and the ADRs behind them

The link between specs and code is enforced by tests, the *sensors*: `UseCaseTraceabilityTest` checks that every
`@UseCase` annotation points at a use case, flow, and business rule that really exists, `TestCaseTraceabilityTest` does
the same for the test cases, `BusinessRuleTraceabilityTest` keeps the shared business rules and the use cases that
reference them in agreement, and `RequirementTraceabilityTest` does the same for the requirements. Together with the
ArchUnit rules in `ArchitectureTest` and `TestLayerConventionsTest` they run in seconds, without a database:
`./mvnw -q test -Dgroups=sensor`. What each sensor checks is in
[`docs/architecture/testing.md`](docs/architecture/testing.md#the-traceability-sensors), and how they fit into the
harness is in [`docs/architecture/README.md`](docs/architecture/README.md#the-harness) and
[ADR-007](docs/architecture/adr/ADR-007-traceability-sensors.md).

The guardrails an AI coding agent works under are part of the repository too: the Claude Code hooks in
[`.claude/`](.claude) refuse to end a turn while changed code or specs are unverified, and
[ADR-010](docs/architecture/adr/ADR-010-hooks-guard-the-session.md) explains why that is a hook and not a test.

## Running locally

PostgreSQL must be running on localhost:5432 (`vb-postgres start`) — for the application and the tests.

```bash
./mvnw quarkus:dev
cd frontend && npm start
```

The application is then available at <http://localhost:4200>.

## Tests

```bash
(cd frontend && npm run build && npm test)   # build the frontend the browser tests need, run Vitest
./mvnw test     # use-case tests and the traceability sensors (*Test)
./mvnw verify   # additionally runs the Playwright browser tests (*IT)
```

## Structure

```
docs/       — specifications (the source of truth)
src/main/   — implementation derived from the specs
frontend/   — the Angular frontend derived from the specs
src/test/   — tests verifying the implementation against the specs
```

## License

Licensed under the [Apache License, Version 2.0](LICENSE).
