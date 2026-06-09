# Articles

Working notes and case studies from building whirred.io systems.

## GraphQL Auth Explosion Case Study

The main spine: what went wrong in a distributed IAM-style system, why authorization checks multiplied, and how the implementation changed under real load.

- [Series Home](/articles/series/IAM-System-Demo/iam-system-demo)
- [Overview](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)
- [Part 1: CTE](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-1-cte)
- [Part 2: Multiple Object Retrieval](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval)
- [Part 3: Multiple Object Authorization](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-3-multiple-object-authorization)
- [Part 4: Redis Cache, per service](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-4-redis-cache-per-service)
- [Part 5: Smart APIs](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-5-smart-apis)
- [Part 6: Async MADNESS](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-6-async-madness)
- [Part 7: GraphQL and Dataloader](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-7-graphql-and-dataloader)
- [Part 8: Falcon](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-8-falcon)
- [Conclusion: Architecture Is Throughput](/articles/series/IAM-System-Demo/graphql-auth-explosion-conclusion)

## Developer Affordances

Supporting notes about the tooling and implementation affordances that made the system fast enough to build, inspect, or stress. These are adjacent to the case study, but they are not numbered parts of the auth-explosion narrative.

- [How I Scaffolded an Entire Distributed Platform in 10 Minutes](/articles/series/IAM-System-Demo/dev-affordances-distributed-platform-in-10-minutes)
- [ActiveResource and the Default Implementation that Astounded Me](/articles/series/IAM-System-Demo/dev-affordances-activeresource-default-implementation)
- [Creating a Million Users](/articles/series/IAM-System-Demo/dev-affordances-creating-a-million-users)
- [Devcontainers for Local Distributed Systems](/articles/series/IAM-System-Demo/devcontainers-for-local-distributed-systems)
- [Foreman for Local Process Orchestration](/articles/series/IAM-System-Demo/foreman-for-local-process-orchestration)

## Engineering Essays

Standalone engineering arguments that do not depend on the IAM case study.

- [Finer Points of Exception Handling](/articles/finer-points-exception-handling)
