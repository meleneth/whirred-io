# GraphQL Auth Explosion Case Study, Part 1: CTE

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: Codex expansion draft

> Attribution: Codex generated the expansion in this draft from the current `meleneth/iam-system-demo` source and its commit history. This note is intentionally specific so the generated lines remain obvious until they are rewritten.

## The First Network N+1

Accounts form a hierarchy through `parent_account_id`. A grant on a parent account applies to its descendants, so authorization frequently needs the complete parent line for an account.

The deliberately slow implementation in [`user-management-service/app/controllers/accounts_controller.rb`](https://github.com/meleneth/iam-system-demo/blob/main/user-management-service/app/controllers/accounts_controller.rb) makes the failure visible:

```ruby
@account = Account.find(params[:id])
@accounts = [@account]
current_account = @account

while current_account.parent_account_id
  parent_account = Account.find(current_account.parent_account_id)
  @accounts << parent_account
  current_account = parent_account
end
```

`Account` is an ActiveResource model in this service. Every `find` in that loop is not an in-process model lookup; it is another HTTP request to account-service. A hierarchy 13 levels deep therefore means 13 serial network dependencies before the caller can answer a question the account database already has enough information to answer.

That is the first systems rule in this series:

> A relationship stored in one service's database should be traversed by that service, not rediscovered one network hop at a time by every caller.

## Why the HTTP Walk Multiplies Deployment Size

The parent loop is worse than “several requests are slower than one request.” Under a conventional threaded Rails deployment, the top-level request occupies a Puma thread for its complete lifetime. Once that request has touched a local database, the thread may also retain a checked-out database connection until Rails returns the request and clears the thread's leased connection.

The bad sequence is therefore:

```text
Puma accepts request and assigns one thread
  -> service performs a local database lookup
  -> database connection is leased to that execution context
  -> service waits for parent HTTP request 1
  -> service waits for parent HTTP request 2
  -> service waits for parent HTTP request 3
  -> ...
  -> response completes
Puma thread and leased database connection become reusable
```

The CPU may be almost idle during the external waits. Capacity is still consumed. The scarce resources are concurrency slots: Puma threads, database connections, HTTP connections, and a request's share of every downstream service.

Little's Law gives the first-order deployment cost:

```text
in-flight requests = arrival rate x average request time
```

For a parent walk:

```text
request time ~= local work + (parent depth x downstream round-trip time)
```

For example, assume:

- 20 incoming requests per second;
- 10 sequential parent requests;
- 50 ms per internal HTTP round trip;
- 10 ms of other request work;
- five Puma threads per instance;
- a 70% target utilization rather than planning for total saturation.

The serial path takes approximately:

```text
10 ms + (10 x 50 ms) = 510 ms
```

At 20 requests per second, it requires approximately:

```text
20 x 0.510 = 10.2 simultaneously occupied request slots
10.2 / 0.70 = 14.6 provisioned slots
ceil(14.6 / 5 threads per instance) = 3 Puma instances
```

If each occupied request context also retains a database connection, the service needs roughly 15 available connections across those instances merely to sustain that illustrative load at the target utilization.

Replace the ten-hop parent walk with one 60 ms owner-service operation and the same model becomes:

```text
20 x 0.060 = 1.2 simultaneously occupied request slots
1.2 / 0.70 = 1.7 provisioned slots
ceil(1.7 / 5 threads per instance) = 1 Puma instance
```

The CTE has not saved 450 ms only for the person waiting on one response. In this example it has removed two thirds of the required Puma deployment and most of the associated database-pool demand.

The exact result depends on measured latency, pool behavior, thread counts, and arrival distribution. The equation is the important part: serial network latency multiplies directly into the number of occupied server slots.

## Puma Versus Falcon Does Not Change the Query Count

Falcon can suspend a fiber while a scheduler-aware HTTP client waits for I/O, allowing another fiber to make progress without dedicating another operating-system thread to the wait. That can make the server-thread term much cheaper than Puma's thread-per-active-request model.

It does not automatically make the retained database connection cheap.

If a suspended request still owns a checked-out database connection, the approximate database demand remains:

```text
database connections required ~= arrival rate x time connection remains leased
```

Falcon produces the large economic win only when all of the relevant conditions hold:

- downstream HTTP is scheduler-aware and actually yields;
- code does not block the reactor through an incompatible client;
- database connections are released before long external waits or the pool is sized for suspended fibers;
- downstream services can accept the increased concurrency;
- the request has already been batched so concurrency is not amplifying an N+1.

The `real_async` branch is evidence that these conditions cannot be assumed. It added `async-http` and semaphore-based fetching, still ran the Rails application through Puma, and the attempted “real async” implementation was later reverted.

That creates a measurable Puma/Falcon question, but it does not rescue the parent loop. With either server, ten sequential parent calls are still ten downstream requests, ten opportunities for failure, and ten loads imposed on account-service. The CTE removes the work. Falcon can only change how expensively the caller waits for work that remains.

## Put the Traversal Where the Data Lives

PostgreSQL can walk the self-referential relationship with a recursive CTE. The first version started at one account and recursively followed `parent_account_id` upward:

```sql
WITH RECURSIVE account_ancestry(id, parent_account_id, name, level) AS (
  SELECT id, parent_account_id, name, 0 AS level
  FROM accounts
  WHERE id = $1

  UNION ALL

  SELECT parent.id,
         parent.parent_account_id,
         parent.name,
         account_ancestry.level + 1
  FROM accounts parent
  INNER JOIN account_ancestry
    ON account_ancestry.parent_account_id = parent.id
)
SELECT id, parent_account_id, name, level
FROM account_ancestry
ORDER BY level DESC
```

One database query replaces the serial HTTP walk. The result is flat because that is what the rest of the system needs: an ordered list of candidate account scopes to check for inherited grants.

## Organization Membership Is Part of the Boundary

Account-service owns accounts and parent links, but organization-service owns the fact that an account belongs to an organization. The parent traversal must not silently cross into an account from another organization.

That means account-service cannot answer the complete constrained query from its database alone. On a cache miss it asks organization-service for the organization context of the requested account IDs. The batch endpoint returns a compressed result:

```json
{
  "organizations": {
    "organization-uuid": ["account-1", "account-2", "account-3"]
  },
  "account_to_organization": {
    "account-3": "organization-uuid"
  }
}
```

Account-service then supplies those organization-owned account IDs as the allowed seed set for its local recursive query. Each service answers the part it owns:

- organization-service answers which accounts belong to the organization;
- account-service answers how those accounts are connected through `parent_account_id`.

Neither service copies the other's tables.

## From One Root to Many Roots

The current implementation in [`account-service/app/controllers/accounts_controller.rb`](https://github.com/meleneth/iam-system-demo/blob/main/account-service/app/controllers/accounts_controller.rb) accepts many root account IDs at once through `POST /accounts_with_parents`.

It builds a `roots` relation containing each requested account, its organization, and the organization account-ID set. A single recursive CTE then walks the parent chain for every root:

```sql
WITH RECURSIVE roots(root_id, organization_id, seed_ids) AS (
  VALUES
    ($1::uuid, $2::uuid, $3::uuid[]),
    ($4::uuid, $5::uuid, $6::uuid[])
),
account_ancestry(root_id, organization_id, id, parent_account_id, name, level) AS (
  SELECT roots.root_id,
         roots.organization_id,
         accounts.id,
         accounts.parent_account_id,
         accounts.name,
         0 AS level
  FROM roots
  INNER JOIN accounts ON accounts.id = roots.root_id

  UNION ALL

  SELECT account_ancestry.root_id,
         account_ancestry.organization_id,
         parents.id,
         parents.parent_account_id,
         parents.name,
         account_ancestry.level + 1
  FROM account_ancestry
  INNER JOIN roots ON roots.root_id = account_ancestry.root_id
  INNER JOIN accounts parents ON parents.id = account_ancestry.parent_account_id
  WHERE parents.id = ANY(roots.seed_ids)
)
SELECT root_id, organization_id, id, parent_account_id, name, level
FROM account_ancestry
ORDER BY root_id, level DESC
```

The returned rows are grouped by `root_id` so callers receive one hierarchy per requested account. This is the same transition the rest of the series keeps making: not a faster single-object operation, but an operation whose natural input and output are collections.

## Caching Without Moving Ownership

Account-service caches each computed parent line under:

```text
account_with_parents:<account_id>
```

The read and write operations are pipelined, so a batch of roots does not become one Redis round trip per root. Misses are computed together with the set-based CTE and cached for 300 seconds.

The cache remains inside account-service because account-service owns the account hierarchy. Authorization-service may ask for parent lines, but it does not cache account records as though it owned them. It caches only authorization answers derived from them.

That distinction becomes load-bearing later. Caching is not permission to smear domain ownership across services.

## Request Shape

Before:

```text
caller
  -> GET account
  -> GET parent
  -> GET grandparent
  -> ... until parent_account_id is nil
```

After:

```text
caller
  -> POST parent chains for [account IDs]
       -> organization-service batch membership lookup
       -> one set-based recursive CTE for cache misses
       -> pipelined cache fill
  <- one hierarchy per requested account
```

The database did not merely make the same loop faster. It removed the network loop from the architecture.

Previous: [Case Study Overview](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)  
Next: [Part 2: Multiple Object Retrieval](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval)
