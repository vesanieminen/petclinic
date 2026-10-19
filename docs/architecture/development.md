# Development View

**Question:** How is the code organized, built, and kept honest?  
**Artifacts:** this document, [`testing.md`](testing.md) (the testing half of this
view), `CLAUDE.md` (the short form an agent always has loaded)  
**Notation:** Markdown  
**For the agent:** the most important view, and the one to read **before writing
anything** in `src/main/java/`. Every rule here saves a correction in every use
case.

Most of what follows is **enforced executably** by
`src/test/java/ai/unifiedprocess/petclinic/ArchitectureTest.java` (ArchUnit, runs
with `./mvnw test`). Each rule names the section it comes from, so a failure
points straight back here. If you change a convention below, change the matching
rule in the same commit — a rule that contradicts this document is the rule
that's wrong.

These rules are the harness for use cases that have **not been written yet**, so
a rule may legitimately match no classes — on a branch where only UC-001 exists
there is no `domain` package to check. `src/test/resources/archunit.properties`
sets `archRule.failOnEmptyShould=false` for exactly that reason: a rule about
code that does not exist yet is vacuously satisfied, the same stance the
traceability sensors take towards a use case that is not `Done` yet.

## Technology stack

| Concern               | Choice                                               | Version      | Decided in                                                |
|-----------------------|------------------------------------------------------|--------------|-----------------------------------------------------------|
| Language / runtime    | Java                                                 | 25           | C-001                                                     |
| Application framework | Quarkus, Quarkus REST with Jackson                   | 3.40         | C-002                                                     |
| UI                    | Angular SPA (standalone components, signals)         | 22.2         | [ADR-002](adr/ADR-002-angular-spa-and-rest-api.md)        |
| Database access       | JPA: Hibernate ORM with Panache                      | Quarkus BOM  | [ADR-001](adr/ADR-001-jpa-with-panache.md)                |
| Schema migration      | Flyway                                               | Quarkus BOM  | [ADR-003](adr/ADR-003-flyway-owns-the-schema.md)          |
| Database              | PostgreSQL, local server on `localhost:5432`         | —            | C-005                                                     |
| Build                 | Maven (wrapper), single module                       | —            | —                                                         |
| Component tests       | Vitest through `ng test`                             | 5.0          | [ADR-006](adr/ADR-006-two-test-layers-merged-coverage.md) |
| Browser tests         | Playwright for Java                                  | 1.59         | [ADR-006](adr/ADR-006-two-test-layers-merged-coverage.md) |
| Architecture tests    | ArchUnit                                             | 1.5          | —                                                         |
| Coverage              | `quarkus-jacoco`, across both test layers            | Quarkus BOM  | —                                                         |
| Quality gate          | SonarQube Cloud                                      | —            | —                                                         |

Exact versions are in `pom.xml` and `frontend/package.json`, which win over this table.

## Module layout

Single Maven module, **package by feature** under
`ai.unifiedprocess.petclinic`. The features follow the use cases — `owner`,
`pet`, `visit`, `vet`, `welcome` — and each is one package with exactly two
sub-packages (`ArchitectureTest.featuresHaveOnlyApiAndDomain`):

- **`api`** — the REST resource and the records it returns. One resource per
  feature.
- **`domain`** — JPA entities and their `<Entity>Repository` (Panache), mapping
  the tables Flyway creates. **No Spring Data, no active record.**

`core/` holds `SpaRouting` and the shared error handling (`ErrorMapper`); the
Angular shell (`app.ts`) and one folder per feature live in `frontend/src/app/`.

```
src/main/java/ai/unifiedprocess/petclinic/
  <feature>/api/      <Feature>Resource + the records it returns
  <feature>/domain/   JPA entities + <Entity>Repository (Panache)
  core/               SpaRouting, ErrorMapper, CrashResource
src/main/resources/db/migration/     production schema
src/test/resources/db/migration/     test seed data (test classpath only)
frontend/src/app/                    app shell; <feature>/ pages and services; core/error/ ErrorPanel, error pages
```

The project is intentionally thin on layers — **no service, DTO, or mapper
layer** beyond `api` + `domain` unless a use case demands one. Put JPQL query
logic close to where it is used until duplication justifies extraction
([ADR-004](adr/ADR-004-package-by-feature-api-domain.md)).
No Java class is named `*Service` or `*Dto` (`ArchitectureTest.noServiceOrDtoLayer`);
a feature's Angular service only makes its HTTP calls.

## Cross-feature rule — and its one exception

Cross-feature reach-in goes through the other feature's `domain` package, not
its `api`.

**Exception — routing.** The shell (`app.ts`) and pages that aggregate actions
of other features (the owner details screen of UC-005 links to the add-pet,
edit-pet, and add-visit screens) may refer to other features' pages in
exactly two forms:

- a page's **route path** in a `routerLink` or `router.navigate(...)` — no
  import of the component, no method calls, no state reads; the
  path is only a routing key;
- the feature's **route parameter name**, which reaches the page as a component
  input. A route nested under another feature's
  route (`/owners/:ownerId/pets/new` under `/owners/:ownerId`) uses that
  feature's name rather than a second one for the same thing.

Anything else — a form, a service, a helper — is not shared across features
in `frontend/`; a richer interaction goes through the other feature's `domain`
package, read by the page's own resource. `ArchitectureTest.foreignApiIsNeverUsed` holds
this line; `core` is the shell and stays reachable from every feature.
`ArchitectureTest.domainDoesNotDependOnApi` keeps every `domain` off every `api`;
`ArchitectureTest.domainIsFreeOfRest` keeps JAX-RS out of `domain` altogether.

Because of that exception the *feature*-level dependency graph is cyclic by
design (`owner` → `visit` → `pet` → `owner`), so
`ArchitectureTest.noCyclesBetweenFeatures` slices on `(*).domain..` instead: the
`domain` packages have no cross-feature dependencies at all and must stay that
way.

## Data access (JPA)

- **Every repository implements `PanacheRepositoryBase`; entities are plain mapped
  classes** in their feature's `domain` (`ArchitectureTest.entitiesLiveInDomain`),
  none extending `PanacheEntityBase` (`ArchitectureTest.entitiesAreNotActiveRecords`),
  and nothing depends on Spring (`ArchitectureTest.noSpring`).
- **Queries are JPQL over the entities, through Panache, never native SQL.** No
  `createNativeQuery(...)` in `src/main`.
- **Associations a page shows load in the repository's query, via `join fetch`**:
  ```java
  public List<Pet> findByOwner(int ownerId) {
      return find("select p from Pet p join fetch p.type"
                      + " where p.ownerId = ?1 order by p.name", ownerId)
              .list();
  }
  ```
- **Parent→children collections use `left join fetch`** in one
  query to avoid N+1. Any repository feeding a grid with a to-many must do this
  — the vet directory with its specialties (UC-002) and the owner search results
  with their pet names (UC-004) both need it.
- **Lazy-loaded grids return `List<T>`** from a `findPage(int offset, int
  limit)`. The resource takes both as query parameters; the Angular page fetches
  the next chunk as the user scrolls (NFR-001/002).
- **Resources return records, never entities** (`ArchitectureTest.resourcesNeverReturnEntities`).
- **Entities stay validation-free.** No Bean Validation annotations, no
  constructor checks (`ArchitectureTest.domainIsValidationFree`) — the form is the validation boundary (see below and
  [ADR-005](adr/ADR-005-validation-in-the-form.md)).

## Persistence stereotype

Persistence classes are named `<Entity>Repository` and annotated `@ApplicationScoped` —
not `*Queries`, `*Dao`, `*Store`. The stereotype is not decoration:
`@ApplicationScoped` makes the repository a CDI bean, and only a bean gets
the `@Transactional` interceptor. A repository created with `new`
silently opts out.
`ArchitectureTest.repositoriesAreNamedAndScoped` checks the name, the scope, `PanacheRepositoryBase` and `domain`;
`ArchitectureTest.panacheRepositoriesAreRepositories` checks every Panache repository carries the name.

## Transaction boundary

**The repository is the transaction boundary**
([ADR-009](adr/ADR-009-repository-is-the-transaction-boundary.md)). Every
repository carries `@Transactional` at class level, so every method, read or
write, runs in a transaction (`ArchitectureTest.repositoriesAreTransactional`):

```java

@ApplicationScoped
@Transactional
public class PetRepository implements PanacheRepositoryBase<Pet, Integer> {

    public Integer insert(Pet pet) { …}
}
```

- **Never in a resource** (`ArchitectureTest.resourcesAreNotTransactional`). What a
  resource returns must already be loaded, so nothing lazy is left for Jackson. A resource calls repository methods one
  after the other; it does not wrap them.
- **A use case needing two statements to succeed together** gets one
  `@Transactional` method in the feature's `domain` package that performs both —
  not two calls from the resource. What that means at runtime is in
  [`process.md`](process.md#transaction-boundaries).

## Angular page and REST resource conventions

- **One resource per feature, in its `api` package, under `/api/`.**
  `ArchitectureTest.resourcesLiveInApi` checks the package and the `<Feature>Resource` name;
  `ArchitectureTest.resourcesAreUnderApi` checks the path, since `SpaRouting` answers every other path with the app.
- **One page per use case, per route, inside the shell.** Every route in
  `app.routes.ts` renders in the shell's `<router-outlet>`, so the drawer and
  header stay usable on every screen (NFR-005). Put
  the UC id in the class doc comment so grep from a failing test lands on the right
  file.
- **State only for what the template reads.** Dependencies through `inject()`;
  what changes is a `signal`; built-in control flow (`@if`, `@for`). HTTP calls
  go through the feature's service.
- **Route parameters are component inputs.** `withComponentInputBinding()` binds
  `:ownerId` to `ownerId = input.required<string>()`, so parameter names cannot drift
  between pages. **Check the route table for a route that already names the
  parameter before adding a parameterized route** — `ownerId`
  serves every route under `/owners/…`, whichever feature owns the page.
- **Styling — never `style="…"` or a `[style]` binding.** Always
  a class in the component's styles (`styles` / `styleUrl`), plain CSS;
  `src/styles.css` holds only the page-wide basics. If unsure, ask
  rather than falling back to inline styles.
- **Main menu — the `menu` in `app.ts`, rendered in the drawer.** Not tabs, not
  links in the header. Each entry is a `routerLink` with `routerLinkActive` inside
  `<nav aria-label="Main menu">`, for active-route highlighting and a11y semantics.
  The header holds only the drawer toggle, logo, and title.
- **Validation lives in the form, not the domain.** Every entity a use case
  writes has an `<entity>-form.ts` — shared where several use cases edit the same
  entity — built on a reactive form whose validators run the use case's
  field-level rules; it emits a populated value on success or shows
  field errors on failure. It also exposes helpers so a page can put a late
  error — one discovered only by a database lookup, such as a duplicate name —
  back onto the right control (`setErrors`). A page calls the API only after validation
  passes, and never validates by hand.
- **The form enforces the lengths of the entity model.** Every text column has a
  length in [`../entity_model.md`](../entity_model.md) and a matching `VARCHAR`
  in the migration; the form mirrors it with `Validators.maxLength(n)` and the
  `maxlength` attribute, plus the error message shown under the field. An
  over-long value is then a field error rather than a constraint violation on
  the error page.
- **The server holds no session state.** What the user is working on lives in
  the page's signals and form; a reload or deep link works from the URL alone,
  `SpaRouting` answering it with the app.
- **`NotFoundException` in the resource for missing entities.** Throwing
  `jakarta.ws.rs.NotFoundException` from the resource — e.g. when a
  lookup by path parameter returns empty — is the canonical way to surface a
    404. `ErrorMapper` answers it with its message, which the page shows in
         `ErrorPanel`; a path the router does not know renders `NotFoundPage`.
- **Error pages render inside the shell.** The shell stays functional so the
  user is never stranded (NFR-005). `NotFoundPage` handles
  the `**` route (unknown paths), `CrashPage`
  handles `/oups` (`/api/oups`, HTTP 500). Both delegate rendering to
  `ErrorPanel`, and neither shows a stack trace — message only (NFR-004).

## Flyway

- Production migrations: `src/main/resources/db/migration/V*.sql`. They
  reproduce [`../entity_model.md`](../entity_model.md) exactly (NFR-009) — the
  migrations effectively *are* the schema DSL.
- Test seed data: `src/test/resources/db/migration/` (test classpath only —
  Flyway picks both up when tests run).
- **After changing a migration**, change the entity mapping by hand to match —
  nothing regenerates it.

## Build

```bash
./mvnw quarkus:dev              # run locally against the local PostgreSQL; npm start in frontend/
cd frontend && npm run build    # the bundle Quarkus serves — browser tests need it
cd frontend && npm test         # Vitest component tests
./mvnw test                     # *Test: API and browser tests, ArchUnit, traceability sensors
./mvnw test -Dgroups=sensor     # only ArchUnit and the traceability sensors, no database
./mvnw verify                   # additionally *IT: Playwright, and the merged coverage report
```

What `verify` does, in order:

1. **`initialize`** — `vb-postgres ensure petclinic_test`, where `vb-postgres` is
   installed: the local PostgreSQL server runs and the test database exists.
2. **`process-resources`** — copies `frontend/dist/petclinic/browser`, the bundle
   `npm run build` left there; Maven does not build the frontend itself.
3. **`test`** (Surefire) — every `*Test`, `quarkus-jacoco` recording coverage.
4. **`verify`** (Failsafe) — every `*IT`, recording into the same coverage data.
5. **Coverage** — `quarkus-jacoco` writes
   `target/jacoco-report/jacoco.xml`, the report Sonar reads.

**The local PostgreSQL server must be running** for `test` and `verify` (C-007).
The exception is `test -Dgroups=sensor`: it starts no application and
runs only the six classes tagged `sensor`, none a `@QuarkusTest`, so it
needs no database.

CI is `.github/workflows/build.yml`: the hook smoke test, the frontend build and tests, then `mvn -B verify`,
on every push to `main` and every pull request. SonarCloud analysis runs afterward only when the
repository has a `SONAR_TOKEN` secret and `SONAR_PROJECT_KEY` and `SONAR_ORGANIZATION` Actions variables.
These must belong to the repository's own SonarCloud project; forks need no SonarCloud configuration
to build and test. When enabled, analysis failures still fail CI. The scanner reads coverage from
`target/jacoco-report/jacoco.xml`. `.github/workflows/aiup-generate.yml`
is the dispatch hook for AI Unified Process Studio and is not edited by hand.

## Agent guardrails

The traceability sensors and the ArchUnit rules are post-hoc — they catch drift
once somebody runs them. The Claude Code hooks in `.claude/hooks/`, wired up by
`.claude/settings.json`, cover what a test cannot reach: that the sensors ran in
this session, and that a `Status:` line was audited before it was set
([ADR-010](adr/ADR-010-hooks-guard-the-session.md),
[ADR-011](adr/ADR-011-guards-read-state-and-demand-evidence.md)):

| Hook                       | Event                          | What it does                                                                                                                                                                              |
|----------------------------|--------------------------------|-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `session-start.sh`         | `SessionStart`                 | records the commit the session started on and when, drops the previous session's markers, and takes a first reading of every `Status:` line                                              |
| `guard-spec-status.sh`     | `PreToolUse` (Edit, Write)     | refuses an edit that sets a `Status:` to `Done`, `Tested` or `Automated` unless a coverage audit of that specification finished in this session after the last change under `src/`        |
| `check-spec-status.sh`     | `PostToolUse` (every tool)     | rereads every `Status:` line after each tool call and reports one that now asserts coverage without an audit behind it — whichever tool changed it, `sed` and heredocs included           |
| `record-coverage-check.sh` | `SubagentStop` (`uc-coverage`) | records that `aiup-angular-jpa:coverage-check` audited a UC or TC: the evidence the two guards above ask for                                                                               |
| `record-sensor-run.sh`     | `PostToolUse` (Bash)           | after a Maven `test` / `verify`, records the change set the sensors saw — if, and only if, every sensor's Surefire report is fresh and green                                              |
| `require-sensors.sh`       | `Stop`                         | refuses to end a turn while `src/`, `docs/` or `pom.xml` changed and the sensors have not run since the newest change, or while a hook changed and `smoke.sh` has not                     |

Two rules shape them. **A guard reads the repository, not the tool call**: the
status check compares the files with what it saw last, so it holds for an edit
made through Bash as much as for one made through Edit. **Evidence is
positive**: a sensor run counts because `target/surefire-reports/TEST-*.xml`
says every sensor ran and passed after the change, never because the console
showed no failure — so a run in the background, piped through `tail`, narrowed
with `-Dtest=`, or skipped leaves no marker. An audit counts because the
`uc-coverage` agent finished, not because a status change said it did.

The run the Stop hook asks for is `./mvnw -q test -Dgroups=sensor`: the five
sensor classes carry the JUnit tag `sensor`, and none of them is a `@QuarkusTest`,
so it takes seconds and needs neither the database nor a frontend build.
A full `./mvnw test` or `verify` counts too.

`.claude/hooks/smoke.sh` exercises all of them against a throwaway repository,
records its own green run for the Stop hook, and runs in CI before the Maven
build; run it after changing one.

`.claude/settings.json` also allows the Maven build, the smoke test and
read-only git, so a fresh clone can satisfy the hooks without a permission
prompt, and denies edits under `target/`: build output is
rebuilt, never hand-edited. `.claude/settings.local.json` is gitignored, so
a clone gets the shared guardrails and none of the personal permission grants.

The rule for adding another: **if it can be checked by reading the repository, it
is a test, not a hook.** Hooks fire only inside a Claude Code session; an ArchUnit
rule binds CI, every editor, and every contributor.

## Coverage

Coverage is what the quality gate measures, and it spans **both** test layers
([ADR-006](adr/ADR-006-two-test-layers-merged-coverage.md)). Because
`quarkus-jacoco` records both into one data file, a line reached only by a Playwright `*IT` counts as
covered — **do not add a use-case test just to cover something a journey test
already exercises.** Only `./mvnw verify` covers both layers; `./mvnw
test` reports `*Test` alone, and only the Java backend is measured. The gate wants
80 % on new code.

## Testing

The test conventions are the other half of this view and live in
[`testing.md`](testing.md): the two layers and what the class suffix decides,
`UC<NNN><Name>Test` naming, the `@UseCase` and `@TestCase` annotations, the
traceability sensors, `BrowserTest`, REST Assured and the Vitest specs, and what you
must **not** do. Read it before writing or changing anything under
`src/test/java/`.

## Definition of done for a use case

1. The `UC-NNN-*.md` specification is the input; where code and specification
   disagree, the specification wins (C-008).
2. The code follows the conventions above; `./mvnw test` passes, ArchUnit
   included, and so does `npm test` in `frontend/`.
3. At least one test per use case, each `@Test` carrying `@UseCase` (NFR-006).
4. `./mvnw verify` is green and coverage has not dropped.
5. The `Status:` line is updated only after a coverage check.
6. If the change contradicts a view in this folder, the view changes with it —
   and a decision that could have gone the other way gets an [ADR](adr).
