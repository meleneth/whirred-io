# GraphQL Auth Explosion Case Study, Part 7: GraphQL and Dataloader

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

LLM Disclaimer:
LLM's were used in the preperation of this series of articles. For the most part I try to call out per-article if it is particularly LLM heavy, but for the most part I'm trying to keep it human-written and avoid triggering people.

## GraphQL and Dataloader

Everything up to this point has been directly implementable via REST api. Now we get into systems as they are actually used, where we implement GraphQL.

GraphQL lets the requestor specify the shape of data they get back, and then handle the exact data they are interested in.

Dataloader is a bit of advanced wizardy that lets you fetch groups of related objects in one call. This works well with all of our previous layers - multi object fetching by ID, caches, AND async. At this point the only problem left is pagination, which is left to the reader.

The dataloader implementation is basically a drop-in on top of our fast rest API's. Our API's are fast because they are able to accept an array of multiple ID's and responses are cached by reasonable keys.

GraphQL locks this in, by making each type of data query be batched together for multiple retrieval, even if you are requesting multiple keys directly from the GraphQL query level.

For instance, this query

with these variables

will make very few requests inside the system, for basically any size of data.

this is really handwavy in theory, so let's break it down to specifics.

One request to load the Accounts, one request to load the Users, one request to load the Groups, and one request to load the GroupUsers.

## Actual GraphQL Batch Points

> LLM audit: integrated from INCOMING.md. Verify the referenced files against the original IAM demo repo before final publication.

The user-management service exposes the main GraphQL API in [`user-management-service/app/graphql/types/query_type.rb`](https://github.com/meleneth/iam-system-demo/blob/main/user-management-service/app/graphql/types/query_type.rb). The important entry points are:

- `account(id:, as:)`
- `accounts(ids:, as:)`
- `organization(id:, as:)`

The `accounts` field is the cleanest example of the desired shape. It uses GraphQL-Ruby Dataloader to collapse many logical account fetches into one source call:

```ruby
dataloader.with(Sources::AccountById, as: as, otel_ctx: otel_ctx)
  .load_all(ids)
  .then { |records| records.compact }
```

That matters because the nested GraphQL shape is where the old failure mode would reappear. An organization request can ask for accounts, account counts, user counts, and group counts. If each field resolver performs its own remote lookup, GraphQL becomes a very polite N+1 generator.

The intended shape is that nested types also use dataloader sources:

- [`user-management-service/app/graphql/types/account_type.rb`](https://github.com/meleneth/iam-system-demo/blob/main/user-management-service/app/graphql/types/account_type.rb) loads `users`, `users_count`, and `groups_count` through sources.
- [`user-management-service/app/graphql/types/organization_type.rb`](https://github.com/meleneth/iam-system-demo/blob/main/user-management-service/app/graphql/types/organization_type.rb) loads `accounts` and `accounts_count` through sources.

The API works because GraphQL batching lands on REST endpoints that already accept multiple ids, and those downstream services have cache boundaries that match ownership. The GraphQL layer does not magically make the distributed system cheap. It preserves the batching opportunities that the REST and Redis layers already made possible.

## Known Unevenness

> LLM audit: integrated from INCOMING.md. Keep this as an audit target for code review because not every source has the same batching quality.

The performance story is strongest where the code actually uses Dataloader batching, Redis set membership, cached organization expansion, and bounded authorization checks. Some sources are less optimized. For example, [`user-management-service/app/graphql/sources/accounts_with_parents_by_id.rb`](https://github.com/meleneth/iam-system-demo/blob/main/user-management-service/app/graphql/sources/accounts_with_parents_by_id.rb) still iterates per key, so it is not as clean as the chunked `AccountById` source.

That is useful to call out because "we use Dataloader" is not the same as "every resolver is batched correctly." The abstraction gives the system a place to batch. The implementation still has to take the opportunity.

Previous: [Part 6: Async MADNESS](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-6-async-madness)  
Next: [Part 8: Falcon](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-8-falcon)

