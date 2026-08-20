# GraphQL Auth Explosion Case Study, Part 5: Smart APIs

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: Codex expansion draft

> Attribution: Codex generated the expansion in this draft from the current `meleneth/iam-system-demo` source. This note is intentionally specific so the generated lines remain obvious until they are rewritten.

::: danger P0 publication blocker
The current MSP `continuance` implementation is numeric offset pagination mislabeled as continuation. It is invalid and must not be described as a successful design. See the repository-root `PUBLISH_BLOCKERS.md`. Remove this warning only after the implementation, tests, GraphQL progress calculation, benchmarks, and article text use a valid opaque keyset continuation contract.
:::

## “Smart” Means Ownership-Shaped

The account hierarchy is a tree, but each account row knows only its immediate parent. Organization membership is stored in a different service. Authorization needs the parent line constrained to the correct organization.

No generic CRUD endpoint answers that question efficiently.

The naive composition path is:

```text
given account ID
  -> find organization_account row
  -> find organization
  -> find every organization_account row for that organization
  -> hydrate accounts
  -> walk parent_account_id
```

Calling those endpoints correctly does not make the request shape good. A service API should expose the useful collection operation its owned data can answer.

## Organization Context for Many Accounts

Organization-service owns both organizations and `organization_accounts`. It exposes:

```http
POST /organization_account_ids/for_account_ids
pad-user-id: <actor or IAM_SYSTEM>
Content-Type: application/json

{
  "account_ids": ["account-1", "account-2"]
}
```

The response is compressed around the owned relationship:

```json
{
  "organizations": {
    "organization-A": ["account-1", "account-3", "account-4"],
    "organization-B": ["account-2", "account-5"]
  },
  "account_to_organization": {
    "account-1": "organization-A",
    "account-2": "organization-B"
  }
}
```

Repeated requested accounts in the same organization do not repeat the organization membership list. Account-service can use this one response to constrain the parent-chain query for every requested root.

Organization-service caches each membership list under:

```text
account_ids_by_organization:<organization_id>
```

The cache stays in organization-service because organization-service owns the relationship.

## Parent Chains for Many Accounts

Account-service exposes the matching collection operation:

```http
POST /accounts_with_parents
pad-user-id: IAM_SYSTEM
Content-Type: application/json

{
  "account_ids": ["account-1", "account-2"]
}
```

It uses the organization context above, executes one set-based recursive CTE for cache misses, and returns one ordered parent line per requested account.

Authorization-service uses this endpoint because it needs account hierarchy facts. It does not import the account table or maintain its own hierarchy projection.

This is what “move work to the owning service” means in practice: the service returns the derived answer that depends on its private data model without transferring ownership of the underlying records.

## Counts Are Their Own Operations

GraphQL frequently needs a count, not the underlying collection. Loading every row and calling `.length` would preserve correctness while destroying the request shape.

The services therefore expose grouped count operations:

```text
GET /accounts/users/counts?account_id[]=...
GET /accounts/groups/counts?account_id[]=...
GET /organizations/accounts/counts/:organization_id
```

The corresponding Dataloader sources return counts aligned with the account IDs requested by GraphQL.

This is another ownership-shaped API. A count is not merely a smaller serialization of a collection. It is a database aggregation that should happen beside the data.

## Continuation Is Part of the Contract

Some valid collection requests are too large for one response even after every internal operation is batched. The MSP user-management path therefore exposes continuation instead of pretending the entire managed estate is a reasonable response unit.

Organization-service's internal endpoint returns:

```json
{
  "msp_organization_id": "uuid",
  "msp_account_id": "uuid",
  "managed_account_ids": ["uuid", "uuid"],
  "total_count": 99999,
  "continuance": "1000"
}
```

The default internal page size is 1,000 and is tunable through `IAM_DEMO_BATCH_SIZE`.

The current implementation is not a valid continuation implementation: it converts the token to an integer and applies SQL `OFFSET`. That can skip or duplicate records when earlier rows change, grows more expensive on later pages, and leaks positional implementation details through a supposedly opaque token. This is a publication-blocking defect, not an acceptable demo shortcut.

The intended contract is an opaque, scope-bound keyset token identifying the last stable ordering key, plus snapshot/version information if traversal must represent one stable dataset across mutations. The client must pass the token through without parsing it, and progress reporting must not derive counts by converting the token to an integer.

That page is only the first boundary. User-management-service still has to hydrate users and groups for those account IDs through the collection APIs, and those services still authorize the distinct account scopes they return.

## Properties of a Useful Distributed API

The specialized endpoints in this system share four properties:

1. **They accept collections.** A caller can state the real operation without writing a remote loop.
2. **They preserve ownership.** The service derives answers from its own tables rather than exporting them for another service to reinterpret.
3. **They return only the needed shape.** Counts remain counts; relationship maps remain ID maps; authorization remains an allow/deny question.
4. **They expose operational bounds.** Chunk size, continuation, and cache TTL are visible design parameters rather than accidental failures.

“Smart API” does not mean a service that knows everything. It means a service boundary that exposes enough domain vocabulary to prevent every client from rebuilding the same expensive query over the network.

Previous: [Part 4: Redis Cache, per service](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-4-redis-cache-per-service)  
Next: [Part 6: Async MADNESS](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-6-async-madness)
