# GraphQL Auth Explosion Case Study, Part 4: Redis Cache, per Service

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

## Cache Answers Where Their Facts Are Owned

The current implementation uses four application-level Redis key shapes across three services:

| Owner | Key shape | Cached answer |
| --- | --- | --- |
| Account Service | `account_with_parents:<account_id>` | One Account's physical, Organization-bounded hierarchy |
| Organization Service | `account_ids_by_organization:<organization_id>` | Account IDs belonging to one Organization |
| Authorization Service | `group-grants-v2:can:<actor_id>:Account:<permission>:<account_id>` | One derived Account permission decision |
| Authorization Service | `group-grants-v2:capabilities:<actor_id>:<scope_type>:<scope_id>` | Derived capability names for one scope |

All four use five-minute TTLs. The important boundary is not Redis itself. Account Service caches Account hierarchy facts it derives from data it owns. Organization Service caches Organization membership it owns. Authorization Service caches permission answers it is responsible for deriving. User Management does not turn remote domain records into a second source of truth.

## Hierarchy and Membership Caches

Account Service reads hierarchy keys in a Redis pipeline. On misses, it obtains the relevant membership scopes from Organization Service and computes every missed root with one set-shaped recursive CTE. It writes the resulting physical hierarchies back in a pipeline.

A hit avoids that Organization call and CTE execution. It does not bypass the actor-facing policy: a real actor still needs `account.read` on the requested Account and every returned ancestor. The cached hierarchy contains facts, not permission.

Organization Service likewise pipelines `account_ids_by_organization` reads and queries all missed Organizations as a set. Callers still need the policy required by the endpoint disclosing that membership. A relationship row allowed through `organization.read.accounts` cannot be reused as an `account.read` allow, and the reverse is also false.

Account Service records hierarchy keys in `org_cachekeys:<organization_id>`, an index that could identify entries affected by an Organization change. The demo has no supported general mutation and invalidation workflow that consumes this index.

## Decision Caches

For Account `/can` checks, Authorization Service's decision key includes the actor, scope type, permission, and target Account. This identity matters: an allow for `account.read` is not an allow for `account.users.read`, and an Organization relationship decision is not an Account decision.

On a miss, Authorization Service resolves the actor's explicit Group memberships, physical Account ancestry, any validated MSP provider edges, and matching Group-owned grants. Positive and negative final decisions are cached. Full capability arrays use a separate key because they answer a different question.

Redis failures become misses or skipped writes; they do not replace authoritative evaluation. Failures to retrieve required membership, hierarchy, provider, or grant facts fail the request.

## Consistency Limits

TTL caches are not an immediate-revocation protocol. A removed membership, grant, provider relationship, or changed parent may remain represented by a cached derived answer until expiry. The demo evaluates fixed data and does not prove complete invalidation behavior.

A production design would need versioning or coordinated invalidation for each affected owner cache and for Authorization Service's derived decisions. It would also need explicit failure behavior for delayed invalidation delivery. Those are consistency requirements, not performance conclusions that can be inferred from the presence of Redis.

Next: [Smart APIs](./graphql-auth-explosion-part-5-smart-apis)
