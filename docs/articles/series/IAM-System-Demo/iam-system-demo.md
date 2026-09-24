# GraphQL Auth Explosion Case Study

> Status: Draft

IAM System Demo is the concrete distributed Rails system behind this case study: the scaffold, service boundaries, ActiveResource remote models, account hierarchy, GraphQL access patterns, authorization checks, caching, async retrieval, and the failure modes that show up when all of those pieces start talking to each other.

## Developer Affordances

These are related to the IAM demo, but they are not numbered parts of the auth-explosion argument. They are the local tooling, scaffolding, and implementation affordances that made the system possible to build, inspect, and stress.

- [How I Scaffolded an Entire Distributed Platform in 10 Minutes](/articles/series/IAM-System-Demo/dev-affordances-distributed-platform-in-10-minutes)
- [ActiveResource and the Default Implementation that Astounded Me](/articles/series/IAM-System-Demo/dev-affordances-activeresource-default-implementation)
- [Explicit Authorization Contexts at the Model Boundary](/articles/series/IAM-System-Demo/dev-affordances-explicit-authorization-boundaries)
- [Extracting Cross-Service Models into Shared Gems](/articles/series/IAM-System-Demo/dev-affordances-cross-service-resource-gems)
- [Creating a Million Users](/articles/series/IAM-System-Demo/dev-affordances-creating-a-million-users)
- [Devcontainers for Local Distributed Systems](/articles/series/IAM-System-Demo/devcontainers-for-local-distributed-systems)
- [Foreman for Local Process Orchestration](/articles/series/IAM-System-Demo/foreman-for-local-process-orchestration)


## Case Study Spine

1. [Case Study Overview](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)
2. [Part 1: CTE](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-1-cte)
3. [Part 2: Multiple Object Retrieval](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval)
4. [Part 3: Multiple Object Authorization](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-3-multiple-object-authorization)
5. [Part 4: Redis Cache, per service](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-4-redis-cache-per-service)
6. [Part 5: Smart API's](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-5-smart-apis)
7. [Part 6: GraphQL and Dataloader](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-6-graphql-and-dataloader)
8. [Conclusion: Architecture Is Throughput](/articles/series/IAM-System-Demo/graphql-auth-explosion-conclusion)
9. [Future Explorations](/articles/series/IAM-System-Demo/graphql-auth-explosion-future-explorations)
10. [Project Timeline](/articles/series/IAM-System-Demo/graphql-auth-explosion-project-timeline)


## Measured Results and Traces

The [September 2026 benchmark summary](./graphql-auth-explosion-results) includes timings, ranges, failures, and measurement limits. The [trace gallery](./graphql-auth-explosion-traces) pairs small examples with a full interactive waterfall for each trace.
