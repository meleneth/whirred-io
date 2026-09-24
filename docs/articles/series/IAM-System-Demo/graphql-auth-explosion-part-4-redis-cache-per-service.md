# GraphQL Auth Explosion Case Study, Part 4: Redis Cache, per Service

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

## Cache Derived Answers Where Their Facts Are Owned

The current implementation has four application-level Redis key shapes across three services. They do different jobs:

| Owner | Key shape | Cached answer |
| --- | --- | --- |
| Account Service | `account_with_parents:<account_id>` | One Account's physical hierarchy within its Organization |
| Organization Service | `account_ids_by_organization:<organization_id>` | Account IDs belonging to one Organization |
| Authorization Service | `group-grants-v2:can:<actor_id>:Account:<permission>:<account_id>` | One final Account permission decision |
| Authorization Service | `group-grants-v2:capabilities:<actor_id>:<scope_type>:<scope_id>` | Effective capability names for one scope |

All four use a 300-second TTL. The Account, Organization, and Authorization services cache answers derived from facts they own or from authorization evaluation they are responsible for. User Management does not copy those remote records into a second source-of-truth cache.

## Account hierarchies

Account Service reads hierarchy keys in a Redis pipeline. Misses are computed together with one set-shaped recursive SQL query, then written back in a pipeline. The cached value contains the client Account and its physical ancestors; it does not splice an MSP provider Account into the returned hierarchy.

Account Service also records each hierarchy key in `org_cachekeys:<organization_id>`. That secondary set identifies the hierarchy entries affected by an Organization, but the demo does not currently expose a general mutation path that consumes the set to invalidate them.

This cache removes repeated recursive-query work. It does not remove authorization: the service still evaluates the actor against the requested and returned Accounts before disclosing the hierarchy.

## Organization membership

Organization Service caches the Account ID list for each Organization under `account_ids_by_organization:<organization_id>`. Batched requests pipeline the reads, query all missed Organizations as a set, and pipeline the writes.

The cached list is a relationship fact, not proof that a caller may see it. Organization Service still applies its model policy to the requested Organization contexts. MSP provider relationships remain in the service's `msp_managed_organizations` table and are resolved through the narrow authorization-context endpoint; they are not inferred from this cache key.

## Group-based authorization decisions

Authorization Service no longer caches a set named `user_grants`. Active `capability_grants` belong to Groups, and the service resolves the actor's explicit Group memberships before matching grants.

For `/can` Account checks, the service pipelines final decisions using keys that include actor, scope type, permission, and target Account. Cache misses trigger the authoritative work: Group membership lookup, physical Account hierarchy retrieval, MSP provider-edge lookup, and matching Group-grant query. Both positive and negative results are cached.

The full-capabilities API uses a separate key containing actor, scope type, and scope ID. Redis failures are treated as cache misses or skipped writes; they do not replace the authoritative permission calculation. Failures to retrieve actual Group, hierarchy, or provider facts still fail the request.

The `group-grants-v2` namespace is intentional. Changing authorization semantics required a new prefix so answers computed by the superseded resolver could not survive into the corrected model.

## Consistency limits

These TTLs are not an immediate-revocation protocol. A removed membership, grant, provider relationship, or changed parent can remain represented by a cached derived answer until expiry. Layered caches can also make externally edited data take longer than one five-minute window to propagate through every derived result.

The demo's measured workload is create-then-read and does not implement a supported general mutation/invalidation workflow. A production design would need coordinated invalidation or versioning for the affected owner caches and Authorization Service's derived decisions. It would also need to define failure behavior when invalidation delivery is delayed.

## Measured evidence

The [application cache results](./graphql-auth-explosion-results#application-cache) show modest cold-versus-warm gains on the wide and dense Organization walks. The [cold and warm organization traces](./graphql-auth-explosion-traces#organization-retrieval-with-cold-and-warm-redis) make the current Redis pipelines and the authorization work around them visible. The separate [MSP scale results](./graphql-auth-explosion-results#graphql-msp-scale) show how those effects accumulate over paginated GraphQL walks.
