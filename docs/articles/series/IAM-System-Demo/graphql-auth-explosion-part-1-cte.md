# GraphQL Auth Explosion Case Study, Part 1: Recursive SQL

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

## The Query Needs Facts from Two Owners

An Account stores only its immediate `parent_account_id`. Following that pointer through a remote model turns an ordinary-looking loop into one HTTP request and one database query per ancestor:

```ruby
accounts = [Account.find(target_account_id)]
accounts << Account.find(accounts.last.parent_account_id) while accounts.last.parent_account_id
```

For a three-Account lineage, that innocent loop produces a call trace shaped like this:

```text
Account.find(leaf)
└── GET Account Service /accounts/leaf
    └── SELECT accounts WHERE id = leaf

Account.find(parent)
└── GET Account Service /accounts/parent
    └── SELECT accounts WHERE id = parent

Account.find(root)
└── GET Account Service /accounts/root
    └── SELECT accounts WHERE id = root
```

That is the minimum shape of the walk: one service request and one Account lookup for every node in the lineage. Policy evaluation beneath each protected read adds more work. A deeper tree therefore creates a longer serial request chain before the caller can use the result.

Account Service can replace that loop with a recursive SQL CTE, but its database does not contain enough information to run the query safely by itself.

- Account Service owns the physical `parent_account_id` links.
- Organization Service owns the relationship rows that say which Accounts belong to an Organization.

The CTE needs both. The parent links tell it where to walk; the Organization membership IDs tell it which parent IDs the walk may admit. On a hierarchy cache miss, Account Service therefore obtains the Organization membership scope before it runs the CTE.

After discarding requested IDs that do not exist locally, Account Service enters an `IAM_SYSTEM` context and sends the remaining roots to Organization Service:

```http
POST /organization_account_ids/for_account_ids
Content-Type: application/json

{
  "account_ids": ["account-a", "account-b"]
}
```

Organization Service looks up the owning Organization for each requested Account and returns two correlated pieces of data: the complete membership-ID set for each relevant Organization, and a mapping from each requested root to its Organization.

```json
{
  "organizations": {
    "organization-1": ["account-a", "parent-a", "root-a"],
    "organization-2": ["account-b", "parent-b"]
  },
  "account_to_organization": {
    "account-a": "organization-1",
    "account-b": "organization-2"
  }
}
```

Those IDs are membership facts, not a hierarchy result. Organization Service neither follows `parent_account_id` nor orders the Accounts into lineages. The shared Organization Account client combines the two response maps so that Account Service receives, for each requested root, its Organization and that Organization's Account IDs.

Account Service then constructs one row in the CTE's `roots` relation for each requested Account:

```text
root_id   | organization_id | seed_ids
----------+-----------------+----------------------------------
account-a | organization-1  | {account-a,parent-a,root-a}
account-b | organization-2  | {account-b,parent-b}
```

The implementation calls the membership array `seed_ids`. It is not a set of traversal roots. Each `root_id` is the traversal root; its `seed_ids` are the Organization-owned boundary for that root.

The implementation is split across the [Account Service cache-miss and CTE path](https://github.com/meleneth/iam-system-demo/blob/d61eeae7bf0dcefd9e8630d54c38cd37170ae9ec/account-service/app/controllers/accounts_controller.rb#L97-L224), the [shared Organization Account client](https://github.com/meleneth/iam-system-demo/blob/d61eeae7bf0dcefd9e8630d54c38cd37170ae9ec/gems/organization-account-resource/lib/organization_account_resource.rb#L26-L40), and the [Organization Service membership lookup](https://github.com/meleneth/iam-system-demo/blob/d61eeae7bf0dcefd9e8630d54c38cd37170ae9ec/organization-service/app/controllers/organization_accounts_controller.rb#L29-L129).

## Then Traverse the Physical Hierarchy

Only after it has those correlated inputs can Account Service run the recursive query. The anchor is each requested Account. Every recursive step follows the current `parent_account_id`, but admits the parent only when its ID appears in that root's Organization membership set.

```sql
WITH RECURSIVE roots(root_id, organization_id, seed_ids) AS (
  VALUES (:root_id, :organization_id, :organization_account_ids)
),
account_ancestry(root_id, organization_id, id, parent_account_id, level, path) AS (
  SELECT roots.root_id,
         roots.organization_id,
         accounts.id,
         accounts.parent_account_id,
         0,
         ARRAY[accounts.id]::uuid[]
  FROM roots
  INNER JOIN accounts ON accounts.id = roots.root_id

  UNION ALL

  SELECT lineage.root_id,
         lineage.organization_id,
         parent.id,
         parent.parent_account_id,
         lineage.level + 1,
         lineage.path || parent.id
  FROM account_ancestry lineage
  INNER JOIN roots ON roots.root_id = lineage.root_id
  INNER JOIN accounts parent ON parent.id = lineage.parent_account_id
  WHERE parent.id = ANY(roots.seed_ids)
    AND NOT parent.id = ANY(lineage.path)
    AND lineage.level + 1 < 100
)
SELECT root_id, id, parent_account_id, level
FROM account_ancestry
ORDER BY root_id, level DESC;
```

The response contains each target and its direct ancestors, ordered from the topmost returned ancestor down to the target—not children, siblings, or every Account in the Organization. Because the endpoint accepts several roots, the query preserves `root_id`, `organization_id`, and `seed_ids` together. A root cannot borrow another root's Organization boundary.

The complete cache-miss path is:

```text
POST Account Service /accounts_with_parents       roots A, B
├── SELECT existing Account IDs                    A, B
├── POST Organization Service
│   /organization_account_ids/for_account_ids    IAM_SYSTEM
│   └── Organization membership sets
│       + root-to-Organization mapping
├── bind roots rows                              A + Org 1 + Org 1 IDs
│                                                    B + Org 2 + Org 2 IDs
├── execute one recursive CTE
└── return hierarchy for A and B in request order
```

This is not global ancestry discovery followed by an Organization filter. Organization scope is an input to the traversal. Referencing the `accounts` table in the join is how PostgreSQL follows a known parent edge; `parent.id = ANY(roots.seed_ids)` constrains every recursive edge as it is traversed.

The returned hierarchy is physical and client-local. MSP provider Accounts are authorization-only virtual ancestors evaluated inside Authorization Service. They are never inserted into the actor-facing Account hierarchy.

## Cached Facts Do Not Grant Access

Account Service caches owner-derived hierarchy payloads under `account_with_parents:<account_id>`. A cache hit can avoid both the Organization membership call and the CTE. It does not confer permission.

For a real actor, `GET /account_with_parents/:account_id` and the batched endpoint require `account.read` on the requested target and on every Account record returned, even when the hierarchy came from Redis. A child-only grant therefore cannot disclose unreadable ancestors. Authorization Service's hierarchy lookup is different: it uses `IAM_SYSTEM` to obtain restricted relationship facts needed to decide the original actor's permission.

The recursive CTE is an intentional part of the architecture. It replaces parent-by-parent network traversal while preserving the owning services' separate facts and the actor-facing authorization boundary.

Next: [Multiple Object Retrieval](./graphql-auth-explosion-part-2-multiple-object-retrieval)
