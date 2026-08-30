# Editorial Pass Handoff

Updated: 2026-08-30

## Goal

Prepare the complete whirred.io catalog for one coordinated, high-quality launch.
The GraphQL Auth Explosion case study is the flagship. Developer Affordances
supports it with implementation context, and the exception-handling article
provides a strong standalone entry point.

This is not a reduced-launch project. Every page advertised in navigation must
eventually meet the publication standard.

## How We Are Working

- Work one page at a time and collaborate closely on the factual story.
- Do not draft ahead of the author's intent.
- Inspect `iam-system-demo` for repository facts instead of asking the author to
  recall APIs, routes, code paths, or current configuration.
- Ask the author about intent, history, tradeoffs, and product semantics—the
  things code cannot answer.
- Use actual URL patterns, parameter names, response shapes, and fixed-revision
  source permalinks. Never put a merely plausible endpoint in a diagram.
- Keep prose readable and direct. Let diagrams use more horizontal space than
  body text.
- Distinguish observed traces, reproduced measurements, architectural inference,
  and historical recollection.
- Preserve the fact that this is a synthetic reconstruction of a known system
  architecture, not a claim about New Relic's current internal implementation.

## Central Case-Study Thesis

The architecture is optimized for the normal case: one logged-in user operating
inside one account context. A cached capability list for that account is bounded
and fast, even if searching it client-side is inelegant.

Organization-wide User Management has fundamentally different cardinality. One
administrator manages users distributed across many accounts, so object loads,
account lineage walks, and authorization checks multiply across service
boundaries. The full reconstruction eventually reproduced the known failure:
requests took minutes or failed before responding.

## Repository Locations

- Publication: `/home/meleneth/Documents/whirred-io`
- Working demo: `/home/meleneth/code/iam-system-demo`
- Demo evidence/audit backlog:
  `/home/meleneth/code/iam-system-demo/TODO_FOR_ARTICLE.md`

## Current Editorial Focus

We rewound from Part 3 to the overview because the overview is the bedrock for
the complete series. It must explain the system, ownership boundaries,
authorization lineage, and cardinality mismatch without drowning the reader in
implementation detail.

### Overview progress

- Removed the Git timeline from the overview.
- Moved it to the post-conclusion Project Timeline page.
- Corrected service ownership in “Meet My Straw Men”:
  - User Service owns Users and stores cross-service `account_id` values.
  - Group Service owns Groups and UserGroup memberships.
  - Authorization Service owns CapabilityGrants.
- Replaced awkward transitional prose in “How the System Works” with the core
  authorization invariant.
- Defined direct lineage precisely: target account plus its single ancestor path;
  never children, siblings, cousins, or unrelated organization accounts.
- Added a visual key for service/table diagrams.
- Made join tables visually distinct from owned tables using an amber palette.

The overview still needs a deliberate simplification pass. Proposed structure:

1. The cardinality problem in one paragraph.
2. Simplified service ownership/runtime diagram.
3. Account hierarchy and downward-only grant inheritance.
4. Normal single-context request versus organization-wide User Management.
5. How object retrieval, parent walking, and authorization multiply.
6. The series' solution layers.
7. Honest description of the synthetic reconstruction.
8. Reading map.

Likely removals or relocations: overly detailed table-field diagrams and other
material that obscures the central request shape.

## Page Status

### Part 1: CTE

Recently rewritten around the correct hierarchy operation.

- Removed the old SQL, which walked downward from every root and did not match
  the authorization problem.
- Shows the original cross-network `Account.find(parent_id)` loop.
- Explains an upward recursive CTE: anchor on target, join to parent, stop at the
  root, constrain parents to the organization account-ID set, order root-to-target.
- Includes a simplified teaching query and a fixed-commit permalink to the full
  set-based implementation.
- Includes before/after diagrams.
- Removed the useless right-side “On this page” outline.

Next Part 1 pass: author review for voice and precision. Confirm whether the
organization boundary explanation belongs here at its present depth.

### Part 2: Multiple Object Retrieval

Status: blocked on reproducible retrieval-mode benchmark.

The article now distinguishes the two real collection lookup shapes:

- multiple explicit primary keys, e.g. `GET /accounts?id[]=...`
- multiple records through multiple join keys, e.g.
  `GET /users?account_id[]=...`

These are constrained collection lookups, not generic searches.

The demo needs `IAM_DEMO_RETRIEVAL_MODE=serial|batched` on the same
full-organization workload. Exact implementation, equivalence-test, benchmark,
and trace requirements are in `iam-system-demo/TODO_FOR_ARTICLE.md`.

### Part 3: Multiple Object Authorization

Status: conceptually mapped, but blocked on implementation audit.

Agreed concepts:

- batched retrieval exposes the next authorization N+1
- normal single-account capability arrays do not compose into organization-wide
  User Management
- grants flow downward, never upward or sideways
- authorization is a set operation over query-generated account IDs
- all-or-nothing denial verifies an invariant; it is not record filtering
- Part 4 owns the detailed cache discussion

The current set-based authorization implementation triggered appropriate concern
because it may contain substantial LLM-generated work that has not received a
human security audit. Existing tests are encouraging but not sufficient.
`iam-system-demo/TODO_FOR_ARTICLE.md` contains the semantic audit, test gaps,
property-test proposal, and completion gate.

### Project Timeline

The old overview timeline now lives after the conclusion as its own draft page.
It is wired into the sidebar, articles index, series home, overview reading list,
and conclusion navigation.

## Diagram and Layout Work

- The overview has no right-side outline.
- Desktop layout uses the viewport rather than leaving a large centered outer
  gutter.
- The left navigation occupies the actual left edge.
- Overview prose is constrained to a readable measure.
- Overview diagrams break wider than the prose column.
- Dense Mermaid SVGs retain a useful minimum width instead of shrinking until
  labels are unreadable.
- Clicking any Mermaid diagram opens a full-screen diagram-only lightbox.
- Keyboard access: focus a diagram and press Enter or Space; close with Escape,
  the Close button, or the backdrop.

The author should continue visually checking layout changes in the browser.
Diagram rendering quality cannot be judged from a successful build alone.

## Evidence Already Present

The demo has runtime controls for:

- `AUTHORIZATION_CHECK_MODE=can|capabilities`
- `GLOBAL_IAM_DEMO_USE_REDIS=true|false`
- `IAM_DEMO_BATCH_SIZE`

Fixtures cover deep hierarchy, wide organization, dense account, and
10k/50k/100k fan-out workloads. Existing benchmarks reproduce minute-scale
full-organization requests and capabilities-mode failure, but final articles
still need controlled reruns with preserved configuration and trace artifacts.

## Build State

`npm run docs:build` passes. VitePress still reports the existing warning that
at least one minified client chunk exceeds 500 kB.

## Git Checkpoints

Existing checkpoints before this handoff:

- `whirred-io`: `c5fbed0 Refine IAM case study overview and diagrams`
- `iam-system-demo`: `55dec87 Document article evidence and audit work`

Unrelated pre-existing dirty files exist in both repositories. Continue staging
only files related to the editorial task. Do not stage `RECOMMENDATIONS.md`
unless explicitly requested.

## Resume Here

1. Open the overview in the browser and review from “Meet My Straw Men” through
   “Service/Table View.”
2. Decide which detailed diagrams stay in the overview and which move to a
   supporting page.
3. Build the concise normal-request versus User-Management cardinality diagram.
4. Finish the overview's narrative spine before returning to Part 3.
5. When returning to Part 3, do not endorse the current set-based algorithm until
   the audit in `TODO_FOR_ARTICLE.md` is complete.
