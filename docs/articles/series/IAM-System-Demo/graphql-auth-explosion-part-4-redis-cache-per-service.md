# GraphQL Auth Explosion Case Study, Part 4: Redis Cache, per service

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: ramblings

LLM Disclaimer:
LLM's were used in the preperation of this series of articles. For the most part I try to call out per-article if it is particularly LLM heavy, but for the most part I'm trying to keep it human-written and avoid triggering people.

## Redis Cache, per service

Each of the services that house objects has their own redis cache. These caches expire after 5 minutes, and we keep track of cache keys in a secondary key location such that if needed, specific caches could be expired when the data changes. This is not implemented, because we don't actually change data - we're just setting up having the data to be able to change it, actually changing it is out of scope.

Each system only caches it's own objects. Cacheing of objects on remote systems would make cache invalidation strategies difficult at best, so it is not allowed in the design.

## Concrete Redis Shapes

> LLM audit: integrated from INCOMING.md. Confirm the file paths and cache behavior against the original IAM demo repo before final publication.

There are two different Redis shapes doing different jobs. They should not be collapsed into one vague "we cache things" claim.

Organization Service caches organization membership expansion. In the actual project, the hot path is [`organization-service/app/controllers/organization_accounts_controller.rb`](https://github.com/meleneth/iam-system-demo/blob/main/organization-service/app/controllers/organization_accounts_controller.rb), especially the `for_account` flow. After validating the caller and checking authorization, the service resolves the organization/account relationship and then looks for a Redis key shaped like this:

`account_ids_by_organization:<organization_id>`

On a miss, it derives the account id list from the organization relationship, stores the JSON payload, and sets a 300 second TTL. That makes repeated organization summary requests reuse the same membership expansion instead of repeatedly walking the database relationship.

Authorization Service uses Redis differently. It caches grants as a set of allowed scope ids per user and permission, with keys shaped like this:

`user_grants:<user_id>:<permission>`

On a miss, [`authorization-service/lib/authorization/account_grant_checker.rb`](https://github.com/meleneth/iam-system-demo/blob/main/authorization-service/lib/authorization/account_grant_checker.rb) loads matching `CapabilityGrant` rows from the database, stores the scope ids in the Redis set, and expires the set after 300 seconds. The common path then becomes set membership instead of another relational query.

The important detail is that authorization checks are batched at the Redis protocol level. The checker pipelines many `SISMEMBER` checks together, so a list of account ids does not become one Redis round trip per account.

That is why the cache boundary matters. Organization Service caches the account ids it owns through organization membership. Authorization Service caches the grants it owns as permission sets. Neither service has to cache the other service's objects to make the request faster.

## What Is Still Not Solved

> LLM audit: integrated from INCOMING.md. This is a limitation note from the source project, not a guarantee about future implementations.

The TTL-backed paths use 300 second expiry, but full invalidation is not implemented here. That is acceptable for this demo because the workload is mostly about generating and reading enough data to expose retrieval shape. In a production system that mutates account membership or capability grants constantly, invalidation would become part of the design, not a footnote.

Previous: [Part 3: Multiple Object Authorization](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-3-multiple-object-authorization)  
Next: [Part 5: Smart API's](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-5-smart-apis)

