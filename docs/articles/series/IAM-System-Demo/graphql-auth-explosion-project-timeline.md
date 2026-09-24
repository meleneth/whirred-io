# GraphQL Auth Explosion Case Study: Project Timeline

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: draft

This timeline was extracted from the project Git history.

The initial build dates are 2025. The publication-oriented correctness,
benchmark, and shared-gem work resumed in September 2026.

## July 13–14: Bootstrapping the Service Skeleton

Commits: .gitignore, Rails builder Dockerfile, then five Rails services appear: user-service, account-service, authorization-service, organization-service, user-management-service.
Then the repo fills in the shared plumbing: Docker/db package fixes, RSpec installs, OpenTelemetry integration, GraphQL gems, compose wrappers, env files, commands, system config, and the first models/migrations/scripts.
Story: this is the “turn an empty repo into a multi-service Rails system” phase.

## July 14–18: Make the First End-to-End Demo Work

Commits like User requires Account, Orgs, Accounts, and Users all create, Generate 100k random users, and Add awesome_print... CTE query.
Then the UI/frontdoor gets wired up, account filtering appears, and the first auth checks go live with User#can().
Story: the project stops being just scaffolding and becomes a working IAM demo with users, accounts, orgs, and authorization behavior.

## July 20–21: Push into Async/Event-Driven Scale

The log switches to SNS/SQS, an eventstream-based user creator, queue workers, and a million-user stress attempt.
One commit explicitly says the million-user run failed because LocalStack blew up, followed by a switch to goaws and brute-force worker fixes.
Story: the demo is now being stress-tested as a distributed system, and the infrastructure limits start showing up.

## July 23–August 8: Harden the Data Model and Reduce Chatter

README/doc updates land, then the account hierarchy query gets refined, organization filtering and caching appear, grant caching lands, MultiFetchCache is implemented, and the system stops loading users everywhere just to do auth checks.
There’s also a production config fix for SECRET_KEY_BASE.
Story: this looks like the “make it less fragile and less chatty” phase, with a lot of attention on query shape, caching, and operational correctness.

## August 13–21: Add Groups and Move the UI onto GraphQL

A new group-service shows up, group creation is wired in, and the user-management UI starts integrating users and groups.
Then the repo moves hard into GraphQL: single-account queries, accountWithParents, group types, organization queries, raw multi-account queries, dataloader refactors, CSRF skipping for GraphQL, and async chunked retrieval.
Story: the app is expanding its IAM model beyond users/accounts/orgs into groups, while the UI/query layer is being rebuilt around batched GraphQL access.

## August 28–September 2: Final Optimization and Cleanup

This is the tuning phase: UUID array bind params, tracer fixes, an attempted “real async” pass, a primary-key correction and revert, POST span reshaping, and finally aggregated counts for accounts, users, and groups.
Story: once the shape of the system is in place, the remaining work is about performance, tracing, and getting the query surfaces into a better final form.

## September 2026: Correct the Authorization Model

The publication audit exposed authorization rules that were inconsistent
across single records, collections, hierarchy responses, GraphQL fields, and
MSP pages. The implementation was brought back to explicit invariants:
all-or-nothing collections, downward-only physical Account inheritance,
authorization-only MSP provider edges, and policy enforcement in the service
that owns each record.

Capability grants moved from Users to Groups. Authorization Service now asks
Group Service for an actor's explicit memberships and evaluates the grants
owned by those Groups. Organization and Group grants retain exact scopes;
ordinary Account capabilities cover physical descendants and explicitly linked
MSP clients. There is no implicit MSP role or provider-membership allow.

## September 17, 2026: Collect the Full Benchmark

The production-shaped 17-case matrix recorded hierarchy, retrieval,
authorization, cache, and GraphQL comparisons with explicit response and trace
failures. Those results remain tied to revision `21f58d0`; failed requests are
reported as failures instead of being turned into latency wins.

## September 21–24, 2026: Make the Boundaries Explicit

`AuthorizationContext`, `AuthorizedResource`, and `AuthorizedModel` made actor
propagation and owning-service enforcement shared behavior. The context was
then reduced to one actor ID, and mixed batched authorization regained its
all-or-nothing contract.

Finally, seven concrete cross-service models moved into resource gems and all
local gems were organized under `gems/`. A clean production trace collection
at revision `4e00444` verified the refactored request paths; revision `42f2ec4`
then reorganized the packages without changing behavior.


Back to: [Series Home](/articles/series/IAM-System-Demo/iam-system-demo)
