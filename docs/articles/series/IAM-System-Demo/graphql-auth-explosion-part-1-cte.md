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

