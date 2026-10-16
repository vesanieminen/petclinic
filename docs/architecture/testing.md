# Testing

Read this **before writing or modifying any test** under `src/test/java/`.

## Two test layers — the class suffix picks the Maven phase

| Layer                 | Suffix  | Runs in         | Framework                                              | Skill                               |
|-----------------------|---------|-----------------|--------------------------------------------------------|-------------------------------------|
| Use case test         | `*Test` | `./mvnw test`   | Playwright for Java (`BrowserTest`), REST Assured      | `aiup-angular-jpa:spring-boot-test` |
| Journey test          | `*IT`   | `./mvnw verify` | Playwright for Java (`BrowserTest`)                    | `aiup-angular-jpa:playwright-test`  |

Surefire picks up `*Test`, Failsafe picks up `*IT` (both plugins are declared in
`pom.xml`). A use case test named `*IT` or a journey test named `*Test` runs in the wrong
phase, and `TestLayerConventionsTest` fails the build when one does. The rule is worth enforcing because the
failure is otherwise silent: nothing errors, the wrong Maven plugin simply never picks the class up, and a test
that never runs reports as passing. `*Test` is for use cases, in a browser or not; `*IT` is for test cases (`TC-*`),
the end-to-end journeys.
Angular component specs (`*.spec.ts`, Vitest via `npm test` in `frontend/`, skill `aiup-angular-jpa:vitest-test`) sit
beside the component; the traceability sensors do not see them.

## Framework

- **`@QuarkusTest`** (`quarkus-junit`) is the default for use case
  tests — it starts the application, its REST API and the built Angular frontend on a random port, no
  separate server.
  Reference: https://quarkus.io/guides/getting-started-testing
- Page tests extend `BrowserTest` and drive headless Chromium (or use REST Assured alone for tests of the API, in
  which case `@QuarkusTest` is all they need). Build the frontend first (`cd frontend && npm run build`).
  They run inside the Quarkus application and use the same local PostgreSQL as the rest of the tests.
- **Use the `aiup-angular-jpa:spring-boot-test` skill** to scaffold a test for a use case. Prefer it over
  hand-rolling — it knows the conventions in this file (locators, `@UseCase`, naming, etc.).

## Test class naming — `UC<NNN><UseCaseName>Test`

Tests that verify a use case are named after the use case, **not** the page. Format:
`UC<NNN><UseCaseNameInPascalCase>Test`, e.g `UC001ViewWelcomePageTest`, `UC004FindOwnersByLastNameTest`,
`UC007AddPetToOwnerTest`. The `NNN` matches the `UC-NNN-*.md` file in `docs/use_cases/`.

If a page is touched by multiple use cases, write one `UC<NNN>…Test` class per use case rather than one `XxxPageTest`
covering all of them. Keep the test file in the **package of the feature under test** and name the class after the UC.

**Exception — cross-cutting tests.** `ArchitectureTest` (the ArchUnit rules behind
[`development.md`](development.md)) and `PetclinicApplicationTests` verify no single use case, so they sit in the
root package under their own names. Everything that *does* verify a use case follows the format above.

## `@UseCase` on every test method

Every `@Test` method that verifies UC behaviour must carry `ai.unifiedprocess.petclinic.UseCase` **on the method**
(never on the class — the annotation is `@Target(METHOD)` and cannot go on a class):

```java
@Test
@UseCase(id = "UC-004", scenario = "A2: Exactly One Match", businessRules = "BR-001")
void exactlyOneMatchNavigatesDirectlyToOwnerDetails() { ... }
```

- `id` — required, matches a `docs/use_cases/UC-NNN-*.md` file.
- `scenario` — optional, defaults to `"Main Success Scenario"`. Set it for alternative flows (`"A1: Validation Errors"`,
  `"A2: Owner not found"`).
- `businessRules` — optional array of BR IDs. One rule as `businessRules = "BR-001"`, several as
  `businessRules = {"BR-001", "BR-002"}` — **never** as one comma-separated string `"BR-001, BR-002"`.
  `UseCaseTraceabilityTest` rejects anything that is not a bare `BR-NNN` identifier.

- **Placement** — `@UseCase` belongs on a method of a `UC<NNN><Name>Test`, even for a use case that needs a browser,
  and nowhere else; the `NNN` in the class name must match the `id` it annotates. A journey test does not borrow it to claim one of the use cases it walks through;
  that is what `@TestCase` is for. `UseCaseTraceabilityTest` enforces both halves.

This is the machine-readable spec → test link. `docs/` is the source of truth, so every test points at the exact spec
element it covers.

## `@TestCase` on every journey test

Every `TC<NNN><Name>IT` class must carry `ai.unifiedprocess.petclinic.TestCase` **on the class** (never on a method —
the annotation is `@Target(TYPE)`), because a test case has exactly one coverage unit: the journey.

```java
@TestCase(id = "TC-003", useCases = {"UC-003", "UC-004", "UC-007", "UC-009"})
@QuarkusTest
class TC003VisitBookedForNewCustomerIT extends BrowserTest { ... }
```

- `id` — required, matches a `docs/test_cases/TC-NNN-*.md` file, and must agree with the `NNN` in the class name.
- `useCases` — required, the journey's itinerary: exactly the use cases the document's Flow table links, no more and no
  fewer. This is the part the class name cannot express, and it is what the annotation is for — add a step to the Flow
  without adding it here and `TestCaseTraceabilityTest` says so.

The two annotations split cleanly: `@UseCase` on a method of a `UC<NNN>…Test`, `@TestCase` on a `TC<NNN>…IT` class.
Each sensor rejects its own annotation anywhere else.

## The traceability sensors

`docs/` is the source of truth, and four sensors make that claim checkable. All run in `./mvnw test`, all read the
documents from disk rather than trusting a summary, and all list every violation at once so the failure reads as a
work list:

| Sensor                         | Reads                                        | Links the two sides by         |
|--------------------------------|----------------------------------------------|--------------------------------|
| `UseCaseTraceabilityTest`      | `docs/use_cases/` ↔ `@UseCase` methods       | the `@UseCase` annotation      |
| `TestCaseTraceabilityTest`     | `docs/test_cases/` ↔ `TC<NNN>…IT` classes    | the class name and `@TestCase` |
| `BusinessRuleTraceabilityTest` | `docs/business_rules.md` ↔ `docs/use_cases/` | the `GR-NNN` id and its link   |
| `RequirementTraceabilityTest`  | `docs/requirements.md` ↔ `docs/use_cases/`   | the `**Requirements:**` line   |

The shared markdown handling (the `**Status:**` pattern, the file scan, the violation report) lives in
`SpecDocuments`, so the document format is described in one place.

All six sensor classes — these four and the two ArchUnit classes, `ArchitectureTest` and `TestLayerConventionsTest` —
carry the JUnit tag `sensor`. `./mvnw -q test -Dgroups=sensor` runs them alone, in seconds and without Docker: the
sensor classes are not `@QuarkusTest`s, so they need no database or frontend build. It is the run the Stop hook asks for
(ADR-011); the full suite remains the definition of done.

### Use cases — `UseCaseTraceabilityTest`

It reads
every `docs/use_cases/*.md` and every `@UseCase` annotation on the test classpath and compares the two, in both
directions.

**Referential integrity** — applies to every use case, whatever its status. An annotation may not point at something
that does not exist:

- every `id` resolves to a `docs/use_cases/UC-NNN-*.md` file,
- every `scenario` is either the main success scenario or a literal `### A1: …` heading in that file,
- every `businessRules` entry is a `BR-NNN` identifier and a literal `### BR-NNN: …` heading in that file.

So renaming an alternative flow in a spec breaks the build until the annotations follow. That is the point.

**Coverage** — applies only to a use case whose `Status:` is `Done` or `Tested`. Such a use case must have a test for
its main success scenario, for *every* alternative flow, and for *every* business rule. Any other status (`Draft`,
`Specified`, …) is exempt, because this project writes the specification before the code and an unimplemented use case
is a normal intermediate state, not a defect.

The consequence is that **the `Status:` line is an assertion, not a label**. Setting it to `Done` switches the sensor
on for that use case; if the tests are not there, `./mvnw test` says so and names each gap. Use
`aiup-angular-jpa:coverage-check` before you change a status line.

When the sensor fails, the honest fixes are to write the missing test or to correct the status — never to weaken the
check.

### Business rules — `BusinessRuleTraceabilityTest`

This one links two documents rather than a document and a test. A rule several use cases share is stated once in
[`../business_rules.md`](../business_rules.md) as `GR-NNN`; each use case keeps its own `BR-NNN` heading and says which
shared rule it realizes. That saves the rule from being written down twice — but only while both sides still point at
each other, and markdown enforces nothing. What the sensor checks:

- every `GR-NNN` a use case references is a `## GR-NNN: …` heading in the catalogue,
- every link into the catalogue from anywhere under `docs/` lands on a heading that really exists — so a rule cannot be
  renamed without the documents pointing at it following along,
- the `**Realized by:**` line of a rule names exactly the use case rules that reference it, in both directions: a claim
  nobody honours fails, and a reference nobody claims fails too,
- the summary table at the top agrees with the rules below it — that table is the one duplication the catalogue keeps,
  which is why it is the one that has to be checked,
- every rule in the catalogue is realized by **at least two** use cases. A rule one use case needs belongs in that use
  case, where it is read together with the flow it constrains.

There is no status line here and nothing is exempt: unlike a use case, a shared rule has no "not written yet" state —
it exists or it does not.

### Requirements — `RequirementTraceabilityTest`

The first arrow of `Requirement → Use Case → … → Test`. Every use case names the requirements it realizes in a
`**Requirements:** [FR-014, FR-015, C-011](../requirements.md)` line right after its `**Status:**` — the format the
`aiup-core:use-case-spec` skill writes and `aiup-core:spec-review` reads — and
[`../requirements.md`](../requirements.md) mirrors it in a *Use Cases* column, so the trace reads from either end.
What the sensor checks:

- every id a use case lists is a row of the catalogue, and every use case the catalogue names exists,
- the *Use Cases* cell of a requirement names exactly the use cases whose `**Requirements:**` line lists it — in both
  directions, as with the `**Realized by:**` line of a shared rule,
- every `FR-NNN` is realized by at least one use case, and every use case realizes at least one `FR-NNN`. An `NFR-NNN`
  or `C-NNN` may stand without one (`—`): it constrains how the system is built or tested, and the architecture
  answers for it, not a use case,
- the requirements a `GR-NNN` comes from (the *From* column of the business rule catalogue) are listed by the use
  cases applying that rule, so the chain through `business_rules.md` does not skip a link,
- a requirement's status follows its use cases: *Verified* when every one is `Done` or `Tested`, *Implemented* when
  every one is at least `Implemented` — the same derivation `spec-review` reports as `REQ_STATUS_DRIFT`.

The link is made in the use case; the column is its mirror. When a use case starts realizing a requirement, add the id
to its `**Requirements:**` line and the use case to the requirement's row, and the sensor confirms the two agree.

### Test cases — `TestCaseTraceabilityTest`

A test case has one coverage unit — the journey — realized by one class named `TC<NNN><Name>IT` and carrying
`@TestCase`. The name and the annotation are both links, and the sensor makes them agree rather than letting either
drift: the id is checked against the class name, and `useCases` against the Flow table. That itinerary is the
annotation's
reason to exist — without it the annotation would only restate the class name, which is a second place for the same fact
to go wrong. What the sensor checks:

- every `**Status:**` is one of `Draft`, `Reviewed`, `Approved`, `Automated`, `Obsolete`,
- every `[UC-NNN](../use_cases/…)` link in a Flow row resolves to a file that really exists and really is that use case,
- a test case whose status is `Automated` has a `TC<NNN>…IT` class on the test classpath,
- every `TC<NNN>…IT` class has a test case document behind it — no orphan journeys,
- every `TC<NNN>…IT` class carries `@TestCase`, and nothing else does,
- the annotated `id` agrees with the class name,
- the annotated `useCases` are real use cases and are exactly the ones the Flow table links,
- an `Automated` test case only walks through use cases that are themselves `Done` or `Tested`; a green end-to-end test
  standing on a `Draft` use case means one of the two status lines is lying.

As with use cases, `Automated` is the assertion that switches the sensor on. Everything below it is exempt, because
this project writes the test case before the test.

## Test base class

Page tests extend `ai.unifiedprocess.petclinic.BrowserTest`:

- Launches headless Chromium once per class and opens a fresh `page` per test, closing both afterwards — subclasses
  manage none of this; the base class is the one place. Subclasses declare `@QuarkusTest`; there is no per-test rollback.
- Is the place for canonical seed-data IDs as constants (`OWNER_FRANKLIN_ID`, `OWNER_COLEMAN_ID`, `PET_SAMANTHA_ID`,
  `PET_MAX_ID`, …) that match
  `src/test/resources/db/migration/V2__seed_reference_data.sql`. Add a constant there when a new test needs another
  seed row — never hard-code a numeric ID in a test.
- For not-found / error flows open the location string, `open("owners/999999")`, and assert what the page shows
  (the error panel, or `NotFoundPage` for an unknown route).
- Tests that never open a page (`PetclinicApplicationTests`) do not extend it; `@QuarkusTest` and REST Assured do.

Test seed data lives **only** on the test classpath (`src/test/resources/db/migration/V2__seed_reference_data.sql`). Do
**not** put seed data under `src/main/resources/db/migration/`.

## Core Playwright and REST Assured API

- `open("")` — loads the route in the browser; `page` is the scope for every locator.
  `open("owners/6")` for parameterized routes.
- `locator.fill(...)` / `locator.click()` / `locator.selectOption(...)` — act through the real browser to
  simulate user interaction. Prefer this over evaluating JavaScript in the page.
- `page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Find Owner"))` — query the rendered page. Others:
    - `getByRole(...)` with an accessible name — preferred.
    - `getByLabel("Last name")` — a form field by its label.
    - `getByText(...)` — rendered text that has no role of its own.
    - `filter(new Locator.FilterOptions().setHasText(...))`, `nth(int)` — narrow a list.
      Locators are strict: acting on one that matches several elements throws. **Avoid `first()`.**
- `parent.getByRole(...)` — scope the query to a sub-tree rooted at `parent`.
- `locator.press("Enter")` / `page.keyboard().press("Control+S")`
  — simulate keyboard shortcuts.
- `given().when().get("/api/…").then().statusCode(200)` — REST Assured for the API; `@QuarkusTest` sets the port.

## No direct field access — use locators

Component state lives in the browser. Tests must **never** access component fields directly (Vitest specs included). Use
Playwright locators to find elements in the rendered page. This decouples the test from the template's layout and exercises
the render path end-to-end.

- Find input fields by label: `page.getByLabel("Last name")`
- Find buttons by name: `page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Find Owner"))`
- Find a table (usually one per page): `page.getByRole(AriaRole.TABLE)`
- Scope to a parent: `menu.getByRole(AriaRole.LINK)`
- Verify rendered text: `assertThat(page.getByText("Jane Doe")).isVisible()`

Interact through the locator:

```java
page.getByLabel("First Name").fill("Jane");
page.getByRole(AriaRole.BUTTON, new Page.GetByRoleOptions().setName("Add Owner")).click();
page.getByLabel("Type").selectOption("dog");
```

Check validation state via the locator:

```java
assertThat(page.getByLabel("Telephone")).hasClass(Pattern.compile("ng-invalid"));
assertThat(page.getByText("not found")).isVisible();
```

## Scoping with `parent.getByRole()` vs. page-wide `page.getByRole()`

Use `parent.getByRole(…)` when the page contains multiple elements with the same role (e.g. two `h3`
elements, or fields with the same label in different forms). Page-wide `page.getByRole(…)` is fine when the role or
name is unique on the page.

## Positive vs. negative locator assertions

**Component should exist** — assert the locator is visible:

```java
assertThat(page.getByRole(AriaRole.IMG,
        new Page.GetByRoleOptions().setName("Pets at the clinic"))).isVisible();
```

**Component should NOT exist** — Angular's `@if` removes it from the DOM rather than hiding it, so verify the locator matches
nothing:

```java
assertThat(page.getByRole(AriaRole.TABLE)).hasCount(0);
```

## No public test-only getters

Do **not** add test-only hooks to pages so tests can reach their internals (`data-testid` attributes, test-only
endpoints, public fields, etc.). Tests use locators.

## Assertions

- **Never `assertNotNull` on a locator.** A locator is only a query and cannot be null — the
  assertion is vacuous and proves nothing about rendering. Use a locator assertion to verify the element is in the page.
- **Always go through `assertThat(locator)`**, which waits and names the locator in the failure:
  ```java
  assertThat(page.getByRole(AriaRole.IMG,
          new Page.GetByRoleOptions().setName("Pets at the clinic"))).isVisible();
  open("");
  assertThat(page).hasTitle("Welcome");
  ```
  `assertTrue(locator.isVisible())` checks once, before Angular may have rendered, so it is flaky and the CI
  failure is uninformative.
- **Never `.allTextContents().stream().anyMatch(...)`.** Narrow the locator instead (`filter`, scoping) — the failure message
  is informative.
- **Rendered-state assertions** go through `page.getByText(…)`, `page.getByRole(AriaRole.HEADING, …)`, etc. and assert with `hasText(…)` so
  the
  render path is exercised end-to-end.
- **Navigation assertions** check
  `assertThat(page).hasURL(…)`, not domain state pulled back out of the page.

## Integration test configuration

The `%test` profile in `src/main/resources/application.properties` points at a local PostgreSQL, the `petclinic_test`
database on localhost:5432 (`vb-postgres start`; a Maven profile starts it where installed), cleaned and migrated at
start with the seed. `./mvnw quarkus:dev` (with `npm start` in `frontend/`) does the same against `postgres`.

## Playwright `*IT` tests

Journey tests are the second layer, not a replacement for use case tests. Rules that differ from the above:

- Class name `TC<NNN><TestCaseName>IT` for a test case document under
  `docs/test_cases/` (e.g. `TC003VisitBookedForNewCustomerIT`). Journey tests go in
  `ai.unifiedprocess.petclinic.e2e`. A use case test is a `UC<NNN>…Test` even when it needs a browser —
  `TestLayerConventionsTest` rejects a `UC…IT`.
- Extend `ai.unifiedprocess.petclinic.BrowserTest`, annotate
  `@QuarkusTest`; `BrowserTest` injects the server's URL (`@TestHTTPResource`). Playwright for Java
  (`com.microsoft.playwright:playwright`, test scope) is already in `pom.xml`.
- Locate elements by role, label and text (`page.getByRole`, `page.getByLabel`, …)
  — never raw `page.locator(...)`, never `Thread.sleep`.
- No `@Transactional` rollback across a real HTTP round-trip: data a test creates is cleaned up in `@AfterEach`
  (through the UI or targeted deletes, idempotent). A test case's **Postconditions** section is the cleanup contract.
- `@TestCase` on the class, as above; `@UseCase` does not appear here.
- Run with `./mvnw verify` (all) or `./mvnw verify -Dit.test=TC003VisitBookedForNewCustomerIT`;
  set `PWDEBUG=1` to watch the browser in the Playwright Inspector.
