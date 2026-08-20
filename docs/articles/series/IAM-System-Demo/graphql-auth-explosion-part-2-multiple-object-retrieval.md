# GraphQL Auth Explosion Case Study, Part 2: Multiple Object Retrieval

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: Codex expansion draft

> Attribution: Codex generated the expansion in this draft from the current `meleneth/iam-system-demo` source and its commit history. This note is intentionally specific so the generated lines remain obvious until they are rewritten.

## Remote Models Are Still Remote

ActiveResource makes a remote record look enough like an ActiveRecord model that it becomes easy to forget where the method call goes.

The demo keeps a deliberately pathological implementation in [`user-management-service/app/controllers/accounts_controller.rb`](https://github.com/meleneth/iam-system-demo/blob/main/user-management-service/app/controllers/accounts_controller.rb):

```ruby
org_accounts = OrganizationAccount.find(
  :all,
  params: { organization_id: @organization.id }
)

@organization_accounts = org_accounts.map do |org_account|
  Account.find(org_account.account_id)
end
```

That `map` is an HTTP request generator. If the organization has `N` accounts, the composition service performs `N` serial account-service calls just to hydrate the account rows.

No amount of elegance in the local object interface changes the network equation:

```text
single-object API: N objects -> N HTTP requests
collection API:    N objects -> ceil(N / batch_size) HTTP requests
```

## Collection-Shaped REST Endpoints

The owning services expose explicit filtered search endpoints:

| Service | Endpoint | Collection filters |
| --- | --- | --- |
| account-service | `POST /accounts/search` | `id: []` |
| user-service | `POST /users/search` | `account_id: []`, `id: []` |
| group-service | `POST /groups/search` | `account_id: []`, `id: []`, `name: []` |
| group-service | `POST /group_users/search` | `group_id: []`, `user_id: []`, `id: []` |

For accounts, the controller is intentionally boring:

```ruby
def search
  filters = params.permit(id: [])
  raise BadFilterError unless filters.present?

  results = Account.where(*filters)
  authorize_account_collection_read!(results)
  render json: results
end
```

The important feature is not clever query code. It is that the public service contract accepts a collection. That lets PostgreSQL perform one set-based lookup and gives the service one place to authorize the returned collection.

The corresponding ActiveResource client sends the filter as JSON:

```ruby
def self.search(params)
  raw = connection.post(
    "/accounts/search",
    params.to_json,
    headers.merge(
      "Accept" => "application/json",
      "Content-Type" => "application/json"
    )
  )

  ActiveSupport::JSON.decode(raw.body).map { |attrs| new(attrs) }
end
```

## Preserve the Collection Through Every Hop

The useful unit is not merely “a SQL query that accepts an array.” The array has to survive every layer:

```text
GraphQL field keys
  -> Dataloader source
  -> ActiveResource/Faraday request
  -> service controller
  -> authorization scope collection
  -> SQL WHERE id IN (...)
```

If any layer turns the array back into `ids.map { |id| find(id) }`, the N+1 returns. This is why adding Dataloader later cannot repair a downstream API that only understands one ID at a time.

## Bounded Batches, Not Infinite Requests

Collection-oriented does not mean “put the entire customer into one HTTP request.” The current GraphQL sources generally chunk IDs in groups of 200. The MSP continuation endpoint defaults to 1,000 account IDs per page and permits the environment to tune that maximum.

Those values are operational dials, not architectural truths. A batch is bounded by:

- request and response size;
- database parameter limits;
- downstream authorization work;
- serialization and memory cost;
- acceptable latency for one failure/retry unit.

The architectural requirement is that changing the batch size should alter the number of partitions, not force a rewrite of the retrieval model.

## Dedupe, Reindex, and Regroup

A batch source also has to preserve caller semantics.

`Sources::AccountById` normalizes and deduplicates requested IDs before making downstream calls:

```ruby
wanted_ids = keys.map(&:to_s)
uniq_ids = wanted_ids.uniq
```

After the calls return, it indexes records by ID and reconstructs the result in the original key order:

```ruby
by_id = records.index_by { |account| account.id.to_s }
wanted_ids.map { |id| by_id[id] }
```

`Sources::UsersByAccountId` performs a different regrouping. It fetches users for many accounts at once, groups the response by `account_id`, and returns one user array for each requested account key.

`Sources::GroupsByUserId` is a two-stage collection join:

1. Fetch `group_users` for many user IDs.
2. Deduplicate all referenced group IDs.
3. Fetch those groups in batches.
4. Reconstruct the groups belonging to each user.

This is application-side joining, but it is not application-side row walking. Each remote relation is fetched as a collection from the service that owns it.

## What This Changes

The slow organization view does this:

```text
load organization membership
for each account ID:
  load one account
```

The batched version does this:

```text
load organization membership
partition account IDs
for each partition:
  load an account collection
reindex by account ID
```

The number of returned records may be identical. The number of network dependencies is not.

This is the basic invariant the rest of the system builds upon: engineer the operation around collections first. Caching, async execution, and GraphQL can preserve or amplify that shape, but none of them can substitute for it.

Previous: [Part 1: CTE](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-1-cte)  
Next: [Part 3: Multiple Object Authorization](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-3-multiple-object-authorization)

