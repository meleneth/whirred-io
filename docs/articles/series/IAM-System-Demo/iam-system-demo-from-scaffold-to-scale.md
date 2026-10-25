# Building, Breaking, and Refactoring a Distributed Rails IAM System

I built an identity-and-access-management demo as a distributed Rails system: separate services own accounts, users, organizations, groups, and authorization, while a sixth service presents the combined user-management experience. What began as a fast scaffold became an experiment in how convenient object-oriented APIs behave across real service boundaries.

Ordinary site capability checks and user management at managed-service-provider (MSP) scale impose very different amounts of work. An MSP view assembles users and memberships across many customer Accounts and applies policy throughout that collection.

The per-record retrieval path turns code that looks like ordinary model traversal into nested HTTP calls, repeated hierarchy walks, and repeated authorization checks. GraphQL composition multiplies that work when the same shape appears beneath nested fields.

Retrieval has to become batch shaped. Once it does, retrieving full capability sets for the entire batch reveals another oversized operation. The authorization layer must let callers ask directly for the permission decisions they actually need.

Each stage made another source of unnecessary work visible. The organizing question became:

> How much work does one application request create at every boundary it crosses?

## The system in one view

The system depends on four broad layers:

1. **Build the platform quickly.** Rails generators, containers, process orchestration, and ActiveResource made six services approachable enough to develop as one system.
2. **Expose the retrieval problem.** Account hierarchies, organization-wide retrieval, groups, and nested GraphQL queries exercise the expensive paths. The large synthetic dataset puts the experiment beyond trivial examples, while tracing makes local-looking model calls visible as work across services.
3. **Make retrieval batch shaped.** Recursive SQL replaced parent-by-parent traversal. Batch endpoints replaced record loops. GraphQL Dataloader could pass collections to APIs equipped to accept them. With retrieval operating on batches, the cost of fetching full capabilities across those batches became clear.
4. **Ask a smaller authorization question.** A batched, cached `/can` API answered the permission checks the caller needed. Authorization evaluated sets, and Redis caches followed service ownership.

These changes improved how the existing services cooperated. Once work became batch shaped, every layer had to preserve that shape for the next one. A GraphQL batch achieves little if the REST client loops over it, and a batch retrieval endpoint still creates excessive work if authorization performs a separate remote check for every returned record.

Batching also made the size of the authorization question harder to ignore. A caller checking a particular permission needs that decision; retrieving full capability sets for everyone in a collection asks the system to do substantially more work.

GraphQL remains useful for assembling the response. Its effectiveness depends on what the services underneath it let the caller ask for.

## Explicit authorization responsibilities

A request establishes an authorization context. Shared ActiveResource-based resource models propagate that context across service calls; they do not independently re-authorize returned records. The receiving service enforces access to its records through a shared model abstraction, using Authorization Service to evaluate permissions.

That split gives each piece a clear responsibility:

- the caller propagates the request's authorization context;
- the remote resource handles transport;
- the receiving service applies policy to its records;
- the authorization service evaluates permissions;
- traces show where the work actually ran.

Retrieval and authorization remain batched, while missing context and missing policy fail closed.

The active authorization model is Group-based. Capability grants belong to
Groups, users receive them through explicit memberships, and Authorization
Service resolves those memberships before evaluating a request. Physical
Account ancestry and explicit MSP provider relationships determine which
Account scopes a Group grant covers; provider affiliation alone grants nothing.

Seven small resource gems provide the shared cross-service client implementations, alongside the shared context and authorization machinery. This reduces client drift without moving ownership out of the data services.

## What the evidence establishes

Current code and focused tests establish the structural claims: retrieval accepts collections, recursive hierarchy work stays in Account Service, owner models evaluate one authoritative policy, relationship alternatives stay correlated per row, and MSP authorization is limited to the selected page. Checks cover both allows and denials; happy-path fixtures that grant both sides of an OR cannot establish permission separation by themselves.

The synthetic data factory provided a substantial setting for the experiments. Its requested batch size was not a measured scaling limit. Current claims describe which records a request reaches, which permissions it checks, and how much work those mechanisms create—not an independently verified total dataset size.

The practical lessons are:

- count boundary crossings, not just Ruby method calls;
- make collection retrieval batch shaped, then preserve those batches across boundaries;
- ask directly for the permission decisions the caller needs;
- keep policy enforcement with the service that owns the records;
- propagate authorization context explicitly across execution and transport boundaries;
- model grants through explicit Group membership instead of attaching them directly to Users;
- verify returned identities and exclusions alongside response time;
- distinguish structural evidence from timing and throughput measurements.

## Where to go next

The [case-study overview](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study) establishes the system and workload. The numbered articles explain recursive SQL, multiple-object retrieval and authorization, per-service caching, domain APIs, and GraphQL Dataloader.

The Developer Affordances articles cover the machinery around that journey: rapid scaffolding, ActiveResource, large data creation, containers, process orchestration, [explicit authorization boundaries](/articles/series/IAM-System-Demo/dev-affordances-explicit-authorization-boundaries), and [extracting the cross-service models into gems](/articles/series/IAM-System-Demo/dev-affordances-cross-service-resource-gems).

Making retrieval batch shaped exposed the cost of the authorization question. Narrowing that question made the batched work practical. The series follows how those discoveries changed the code, APIs, and performance of the system.
