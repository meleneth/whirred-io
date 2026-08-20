# GraphQL Auth Explosion Case Study, Part 7: GraphQL and Dataloader

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: Codex expansion draft

> Attribution: Codex generated the expansion in this draft from the current `meleneth/iam-system-demo` source, benchmark documentation, and commit history. This note is intentionally specific so the generated lines remain obvious until they are rewritten.

## GraphQL Does Not Remove the Network

GraphQL lets a caller describe the result graph it wants. The execution layer still has to turn that graph into service calls.

This query crosses accounts, users, group memberships, and groups:

```graphql
query GetAccounts($ids: [ID!]!, $as: ID!) {
  accounts(ids: $ids, as: $as) {
    id
    name
    users {
      id
      email
      accountId
      groups {
        id
        name
      }
    }
  }
}
```

```json
{
  "ids": [
    "845705e1-d59e-441d-9a66-432b8c211754",
    "cd56c690-e39e-46c0-bca6-94bde44fb85a"
  ],
  "as": "ad6b8ead-f107-40a8-904f-7c203d71bc70"
}
```

A naive resolver produces this request graph:

```text
for each account:
  fetch account
  fetch its users
  for each user:
    fetch group memberships
    for each membership:
      fetch group
```

GraphQL has not caused that N+1, but it makes expressing the graph easy enough that the implementation must defend every boundary.

## Dataloader Collects Keys Before Fetching

The `accounts` field hands all requested IDs to one source:

```ruby
dataloader
  .with(Sources::AccountById, as: as, otel_ctx: otel_ctx)
  .load_all(ids)
  .then { |records| records.compact }
```

Nested fields do the same thing. `AccountType#users` does not immediately call user-service. It registers the account ID with `Sources::UsersByAccountId`. GraphQL-Ruby runs the source after sibling resolvers have registered their keys.

The source then receives the collection of account IDs, partitions it in groups of 200, and sends `POST /users/search` with `account_id: []`. The response is regrouped by account ID and aligned with the original keys.

That turns this:

```text
one users request per account field
```

into this:

```text
one users request per bounded account-ID partition
```

## User Groups Are a Batched Remote Join

`UserType#groups` registers user IDs with `Sources::GroupsByUserId`. That source performs two collection phases:

```text
user IDs
  -> POST /group_users/search in 200-user chunks
  -> deduplicate referenced group IDs
  -> POST /groups/search in 200-group chunks
  -> rebuild groups-by-user
```

The composition service is performing a join across service boundaries, but it is joining collections rather than walking rows.

This is the core systems truth of the series:

> Dataloader works when every downstream layer can preserve the collection it discovers.

If `group-service` only exposed `GET /group_users/:id`, Dataloader would have nothing useful to batch into. The REST work in Parts 2 and 3 is what makes the GraphQL layer cheap enough to exist.

## Authorization Follows the Same Collection Shape

Each owning service authorizes the data it returns:

- account-service checks `account.read` over distinct account IDs;
- user-service checks `account.users.read` over distinct user account IDs;
- group-service checks `account.users.read` over the accounts owning groups and memberships.

The GraphQL service forwards the real actor through `pad-user-id`. It does not fetch all data as `IAM_SYSTEM` and filter afterward.

The request shape therefore remains batched through policy enforcement:

```text
Dataloader keys
  -> service search collection
  -> distinct owning account scopes
  -> one batched /can question
  -> batched parent-chain and grant evaluation
```

## The MSP Query Makes Pagination Explicit

The current large-fanout query is:

```graphql
query MspUserManagement(
  $mspAccountId: ID!,
  $as: ID!,
  $continuance: String
) {
  mspUserManagement(
    mspAccountId: $mspAccountId,
    as: $as,
    continuance: $continuance
  ) {
    loadedCount
    totalCount
    continuance
    accounts {
      id
      users {
        id
        email
        accountId
        groups {
          id
          name
        }
      }
    }
  }
}
```

User-management-service first obtains a page of managed account IDs from organization-service. The default is 1,000 IDs. It verifies `msp.admin.users` in the MSP organization context, then lets the normal nested sources hydrate and authorize users and groups for those accounts.

The returned continuance becomes the next GraphQL request. Pagination is not “left to the reader”; it is part of the request contract because the complete graph is too large to be one reliable response unit.

## What the Benchmark Actually Proves

The dense query returns one account, 20,000 users, 40,006 group memberships, eight unique groups, and roughly 5.7 MB of JSON in about 11 seconds in the recorded full benchmark.

The continuation benchmark walked:

| Fixture | Pages | Accounts | Warm time |
| --- | ---: | ---: | ---: |
| 10k MSP fanout | 10 | 9,999 | 46.276s |
| 50k MSP fanout | 50 | 49,999 | 281.135s |
| 100k MSP fanout | 100 | 99,999 | 686.220s |

The claim is not constant-time GraphQL. The claim is that the pathological graph remains a partitioned collection-retrieval problem rather than degenerating into an HTTP request per returned row.

Once batching removes the accidental work, the remaining cost is honest: payload hydration, authorization over distinct scopes, JSON construction, serialization, and transfer.

## Dataloader Is an Opportunity, Not a Guarantee

The source tree contains useful counterexamples:

- `AccountsWithParentsById` still loops over keys and calls `Account.with_parents` once per key.
- `AccountHierarchiesResolver` similarly maps IDs through the single-account parent endpoint.
- `OrganizationType#accounts` chunks account IDs but does its calls directly rather than through a Dataloader source.
- `AccountById` batches correctly, but its concurrency implementation has to manage mutable ActiveResource headers and tracing context.

Merely inheriting from `GraphQL::Dataloader::Source` does not make a fetch implementation batched. The source must consume its complete key set with collection APIs.

This is also why banning Dataloader because authorization is difficult would have been exactly backward. Authorization had to become collection-shaped regardless. Once it did, Dataloader was the natural mechanism for preserving that shape through GraphQL field resolution.

## The Complete Request Shape

For a page of MSP-managed accounts, the important flow is:

```text
GraphQL page
  -> organization-service: managed account-ID page
  -> authorization-service: MSP organization capability
  -> user-service: users by account-ID partitions
       -> authorization-service: account.users.read for distinct scopes
  -> group-service: memberships by user-ID partitions
       -> authorization-service: account.users.read for distinct scopes
  -> group-service: groups by group-ID partitions
       -> authorization-service: account.users.read for distinct scopes
  -> GraphQL response + continuance
```

GraphQL is doing its job here: it gives the caller a useful graph. Dataloader is doing its job: it discovers collections of related keys. The distributed system still has to do the engineering work of honoring those collections all the way down.

Previous: [Part 6: Async MADNESS](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-6-async-madness)  
Next: [Part 8: Falcon](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-8-falcon)

