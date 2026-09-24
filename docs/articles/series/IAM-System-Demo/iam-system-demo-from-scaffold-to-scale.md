# Building, Breaking, and Refactoring a Distributed Rails IAM System

I built an identity-and-access-management demo as a distributed Rails system: separate services own accounts, users, organizations, groups, and authorization, while a sixth service presents the combined user-management experience. What began as a fast scaffold became an experiment in how convenient object-oriented APIs behave across real service boundaries.

The original system handled capability checks for the site just fine. The problem emerged in user management at the scale of a managed service provider (MSP), where one provider manages access across many customer accounts. Retrieving users and memberships across those account hierarchies meant assembling large collections of related records and applying permissions throughout.

The retrieval path worked one record at a time. Code that looked like ordinary model traversal produced nested HTTP calls, repeated hierarchy walks, and repeated authorization checks. As GraphQL assembled the result, requests could take minutes or fail to finish.

The solution emerged in stages. First, retrieval had to become batch shaped. Once it did, retrieving full capability sets for the entire batch revealed itself as untenable. That made the next change clear: let callers ask directly for the permission decisions they actually needed.

Each stage made another source of unnecessary work visible. The organizing question became:

> How much work does one application request create at every boundary it crosses?

## The process in one view

The system moved through four broad stages:

1. **Build the platform quickly.** Rails generators, containers, process orchestration, and ActiveResource made six services approachable enough to develop as one system.
2. **Expose the retrieval problem.** Account hierarchies, organization-wide retrieval, groups, and nested GraphQL queries exercised the expensive paths. A million-user dataset put the experiments beyond trivial examples, while OpenTelemetry traces showed how local-looking model calls expanded into work across services.
3. **Make retrieval batch shaped.** Recursive SQL replaced parent-by-parent traversal. Batch endpoints replaced record loops. GraphQL Dataloader could pass collections to APIs equipped to accept them. With retrieval operating on batches, the cost of fetching full capabilities across those batches became clear.
4. **Ask a smaller authorization question.** A batched, cached `/can` API answered the permission checks the caller needed. Authorization evaluated sets, and Redis caches followed service ownership.

These changes improved how the existing services cooperated. Once work became batch shaped, every layer had to preserve that shape for the next one. A GraphQL batch achieves little if the REST client loops over it, and a batch retrieval endpoint still creates excessive work if authorization performs a separate remote check for every returned record.

Batching also made the size of the authorization question harder to ignore. A caller checking a particular permission needs that decision; retrieving full capability sets for everyone in a collection asks the system to do substantially more work.

GraphQL remains useful for assembling the response. Its effectiveness depends on what the services underneath it let the caller ask for.

## What the refactor produced

The latest refactor made the authorization boundary explicit in code. A request establishes an authorization context. Shared ActiveResource-based resource models propagate that context across service calls; they do not independently re-authorize returned records. The receiving service enforces access to its records through a shared model abstraction, using the authorization service to evaluate permissions.

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

The repeated cross-service model definitions were then extracted into seven small resource gems, alongside the shared context and authorization machinery. Services now depend on common implementations instead of maintaining copies that gradually diverge in behavior.

## What the evidence says

The [measured results](/articles/series/IAM-System-Demo/graphql-auth-explosion-results) include explicit failures. A newer [trace gallery](/articles/series/IAM-System-Demo/graphql-auth-explosion-traces) follows ten complete workloads through hierarchy traversal, batch retrieval, collection authorization, Redis behavior, and GraphQL service calls.

These capture different stages of the system and need to be read with the implementation and fixtures that produced them. New traces do not retroactively validate older benchmark runs.

Correctness is part of that evidence. An authorization bug found before publication prompted a review of the authorization invariants and seed data. Checks need to establish both which records an actor receives and which records they must not receive.

The million-user dataset provided a substantial setting for the experiments. It was not a measured scaling limit. The results describe particular workloads within that dataset: which records a request reaches, which permissions it checks, and how much work those operations create.

The practical lessons are:

- count boundary crossings, not just Ruby method calls;
- make collection retrieval batch shaped, then preserve those batches across boundaries;
- ask directly for the permission decisions the caller needs;
- keep policy enforcement with the service that owns the records;
- propagate authorization context explicitly across execution and transport boundaries;
- model grants through explicit Group membership instead of attaching them directly to Users;
- verify returned identities and exclusions alongside response time;
- retain failed requests and incomplete traces as evidence.

## Where to go next

The [case-study overview](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study) establishes the system and the original failure. The numbered articles follow the changes through recursive SQL, multiple-object retrieval and authorization, per-service caching, smarter APIs, and GraphQL Dataloader. The [measured results](/articles/series/IAM-System-Demo/graphql-auth-explosion-results) and [trace gallery](/articles/series/IAM-System-Demo/graphql-auth-explosion-traces) contain the evidence and its limits.

The Developer Affordances articles cover the machinery around that journey: rapid scaffolding, ActiveResource, large data creation, containers, process orchestration, [explicit authorization boundaries](/articles/series/IAM-System-Demo/dev-affordances-explicit-authorization-boundaries), and [extracting the cross-service models into gems](/articles/series/IAM-System-Demo/dev-affordances-cross-service-resource-gems).

Making retrieval batch shaped exposed the cost of the authorization question. Narrowing that question made the batched work practical. The series follows how those discoveries changed the code, APIs, and performance of the system.
