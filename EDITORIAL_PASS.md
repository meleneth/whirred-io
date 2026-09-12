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
- Prepare readers before each diagram: explain the rule, workload, and contrast
  they are about to see. Do not put essential interpretation after the diagram.
- Use the same visual language consistently across the series. Grey Mermaid
  notes are captions or callouts; loop frames mean that the enclosed requests
  repeat. Put the repetition wording in a note immediately before the loop and
  use a bare `loop` marker so Mermaid does not add bracketed loop-header text.
- Add deliberate `<br/>` breaks to long Mermaid notes. Do not rely on Mermaid's
  inaccurate text-width calculation to keep the grey background around a long
  single-line caption.
- Use the VitePress side-by-side previous/next pager only. Do not add inline
  `Previous:` or `Next:` links at the bottom of article content.
- Distinguish observed traces, reproduced measurements, architectural inference,
  and historical recollection.
- Preserve the fact that this is a synthetic reconstruction of a known system
  architecture, not a claim about New Relic's current internal implementation.

## Central Case-Study Thesis

Be wildly allergic to N+1 behavior, especially when an object accessor hides a
cross-network request that performs more hierarchy, database, and authorization
work behind it.

The architecture is optimized for the normal case: one logged-in user operating
inside one account context. Organization-wide User Management is fundamentally
different because it loads every user belonging to every account in the
organization and therefore crosses many authorization contexts at once.

The numbered parts preserve the historical solution order, but must not read as
a showcase for this specific stack. Every part should identify the
one-record-at-a-time behavior, explain its multiplier, say which boundary the
change removes or contains, and name the expensive shape that still remains.
The full reconstruction eventually reproduced the known failure: requests took
minutes or failed before responding.

## Repository Locations

- Publication: `/home/meleneth/Documents/whirred-io`
- Working demo: `/home/meleneth/code/iam-system-demo`
- Demo evidence/audit backlog:
  `/home/meleneth/code/iam-system-demo/TODO_FOR_ARTICLE.md`

## Current Editorial Focus

The active editing pass has moved from the rebuilt GraphQL and Dataloader
teaching sequence to the conclusion. That article is now Part 6 and retains its
implementation and trace-evidence gate in
`iam-system-demo/TODO_FOR_ARTICLE.md`.

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

### Part 4: Redis Cache, per service

Status: implementation issues addressed; waiting on controlled cache evidence.

The current article distinguishes the two actual cache shapes:

- Organization Service caches organization membership as account-ID lists.
- Authorization Service caches allowed scope IDs per user and permission.

It also states the ownership rule: each service caches data it owns rather than
copying remote service objects into its cache. The missing invalidation path is
not conceptually difficult: mutation emits an event, a worker consumes it and
force-expires the affected cache entry, and the next read rebuilds from the
source of truth.

The dead `AccountGrantChecker` path has been removed. The live
`Capabilities#account_ids_with_permission` path now pipelines multi-account
cache reads and computed-miss writes, preserves positive and negative entries,
and falls back to authoritative computation on Redis pipeline failure. The
remaining gate is the controlled Redis-disabled/cold/warm evidence described in
`iam-system-demo/TODO_FOR_ARTICLE.md`. Event-driven invalidation remains an
explicit production requirement and demo non-goal.

### Part 5: Smart APIs

Status: implementation issues addressed; waiting on trace evidence.

The current draft begins with account ancestry and then combines Organization
Service membership lookup, the Account Service CTE, and both services' caches.
The next pass must determine the actual “smart API” lesson and keep Part 5 from
repeating the detailed CTE and cache mechanics already owned by Parts 1 and 4.

Both GraphQL hierarchy paths now use the existing batch API, map results by the
returned target account rather than positional response order, preserve caller
ordering and duplicates, propagate headers/context, and truthfully instrument
one downstream hierarchy request. The remaining gate is preserved before/after
trace evidence described in `iam-system-demo/TODO_FOR_ARTICLE.md`.

### Part 6: GraphQL and Dataloader

Status: blocked on Dataloader consistency and request-shape audit.

The article currently overstates the implementation as approximately one
request per object type. `OrganizationType#accounts` manually chunks rather
than using a source, `OrgAccountsCount` cannot batch more than one organization,
several count sources accept but do not apply the actor identity, and nested
Group resolution has two dependent request stages. The article also retains a
stale warning about the hierarchy source fixed during Part 5.

The source, schema, actor-propagation, chunking, failure-policy, diagram, and
trace-evidence requirements are recorded under GraphQL and Dataloader in
`iam-system-demo/TODO_FOR_ARTICLE.md`.

The article now uses the real wide-organization nested query and diagrams four
distinct ideas: requested object-tree shape, naïve cross-network N+1, actual
collection-shaped REST stages, and Dataloader collect/fetch/regroup behavior.
It explicitly shows the dependent GroupUser-to-Group stages and qualifies
request counts by configured batch size rather than promising one request for
arbitrary cardinality. Continue reviewing these diagrams and examples before
returning to the conclusion.

### Removed from the numbered spine

Async Madness and Falcon were removed to keep the already-long series focused
on cross-network N+1 behavior, batching, authorization, and request cardinality.
Bounded concurrency remains an implementation detail. Falcon remains valuable
and historically motivated the Ruby 3 migration, but it is outside this case
study's argument.

### Project Timeline

The old overview timeline now lives after the conclusion as its own draft page.
It is wired into the sidebar, articles index, series home, overview reading list,
and conclusion navigation.

## Diagram and Layout Work

- Right-side “On this page” outlines are disabled globally for every article.
- Desktop layout uses the viewport rather than leaving a large centered outer
  gutter.
- The left navigation occupies the actual left edge.
- Article prose is constrained to a readable measure.
- Diagrams break wider than the prose column consistently across articles.
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

1. Continue reviewing the conclusion for the author's voice and the portable
   cross-network N+1 lesson.
2. Keep direct claims and avoid formulaic “the problem was not X, it was Y”
   framing.
3. Let the technical record demonstrate the author's ability; avoid
   self-congratulatory explanation.
4. Revisit Part 6 diagrams visually in the browser before publication because
   the VitePress build does not validate Mermaid parsing.
5. Add measured evidence to blocked parts only after their demo completion gates
   are satisfied.
