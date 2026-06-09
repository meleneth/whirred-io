# GraphQL Auth Explosion Case Study

> Status: skeleton

IAM System Demo is the concrete distributed Rails system behind this case study: the scaffold, service boundaries, ActiveResource remote models, account hierarchy, GraphQL access patterns, authorization checks, caching, async retrieval, and the failure modes that show up when all of those pieces start talking to each other.

## Reading Order

1. [How I Scaffolded an Entire Distributed Platform in 10 Minutes](/articles/series/IAM-System-Demo/distributed-platform-in-10-minutes)
2. [ActiveResource and the Default Implementation that Astounded Me](/articles/series/IAM-System-Demo/activeresource-default-implementation)
3. [Case Study Overview](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)
4. [Creating a Million Users](/articles/series/IAM-System-Demo/creating-a-million-users)
5. [Part 1: CTE](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-1-cte)
6. [Part 2: Multiple Object Retrieval](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval)
7. [Part 3: Multiple Object Authorization](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-3-multiple-object-authorization)
8. [Part 4: Redis Cache, per service](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-4-redis-cache-per-service)
9. [Part 5: Smart API's](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-5-smart-apis)
10. [Part 6: Async MADNESS](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-6-async-madness)
11. [Part 7: GraphQL and Dataloader](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-7-graphql-and-dataloader)
12. [Part 8: Falcon](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-8-falcon)

## Planned Threads

- Service scaffolding and repo shape.
- Remote Rails models over HTTP with ActiveResource.
- Account hierarchy and `parent_account_id` authorization inheritance.
- GraphQL, DataLoader, and batched object retrieval.
- Cache boundaries, invalidation pressure, and tracing.

## Series Notes

Use this page as the stable table of contents. `IAM-System-Demo` remains in the URL because it is the project name, but the series itself is the GraphQL auth explosion case study.
