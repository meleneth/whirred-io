# GraphQL Auth Explosion Case Study, Part 3: Multiple Object Authorization

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: Codex expansion draft

> Attribution: Codex generated the expansion in this draft from the current `meleneth/iam-system-demo` source and its commit history. This note is intentionally specific so the generated lines remain obvious until they are rewritten.

## Retrieval Batching Is Only Half the Problem

Once a service accepts a collection request, it must prove that the actor may read every scope represented in the result.

The naive implementation merely moves the N+1:

```text
one batched data request
  -> one authorization request per returned row
```

That is especially disastrous for users and group memberships. Twenty thousand users in one account do not represent twenty thousand independent authorization scopes. They represent one account scope repeated twenty thousand times.

The owning service therefore collapses returned rows to distinct account IDs before asking authorization-service anything.

In user-service the collection check is:

```ruby
account_ids = users.distinct.pluck(:account_id).map(&:to_s).uniq

User.user_can?(
  user_id: user_id,
  permission: "account.users.read",
  account_ids: account_ids
)
```

Groups collapse directly by `group.account_id`. Group membership rows first resolve their distinct `group_id` values to the owning groups, then collapse those groups to distinct account IDs.

This preserves the security invariant without paying per row:

> Every returned object must be covered by the decision, but the decision should be evaluated once per distinct authorization scope.

## Ask One Precise Question

The data service sends a single request:

```http
POST /can/Account/account.users.read
pad-user-id: <actor-user-id>
Content-Type: application/json

{
  "scope_id": [
    "account-1",
    "account-2",
    "account-3"
  ]
}
```

The semantics are all-or-nothing. Authorization-service returns success only when the permission is available for every requested scope. If even one requested account is unauthorized, the collection read is denied rather than returning a misleading partial collection.

That contract is verified directly in [`authorization-service/spec/requests/can_spec.rb`](https://github.com/meleneth/iam-system-demo/blob/main/authorization-service/spec/requests/can_spec.rb): a grant for one of two requested accounts is not enough.

## Parent Grants Make Each Scope a Hierarchy

Account authorization is inherited. A user can satisfy `account.users.read` through a grant on the requested account or on an ancestor in its parent line.

Conceptually, three requested accounts become three candidate hierarchies:

```text
root A -> parent A -> requested A
root B -> requested B
root C -> parent C -> requested C
```

Authorization-service obtains those parent chains from account-service in one batch. It does not walk `parent_account_id` itself and does not keep a second copy of account hierarchy records.

The original grant checker evaluates the hierarchies a level at a time:

1. Check the current candidate account from every unresolved hierarchy.
2. Remove hierarchies that found a matching grant.
3. Advance only the unresolved hierarchies to the next account.
4. Fail if any hierarchy runs out of candidates without a match.

This produces a bounded number of batch checks based on hierarchy depth, rather than one full serial walk per target account.

## Redis Turns the Batch Into Set Membership

Authorization-service caches the user's granted account scope IDs in a Redis set keyed by user and permission:

```text
user_grants:<user_id>:<permission>
```

The set is filled from `CapabilityGrant` rows on a miss and expires after 300 seconds. A batch of candidate accounts is checked with pipelined `SISMEMBER` operations:

```ruby
values = redis.pipelined do |pipe|
  account_ids.each do |id|
    pipe.sismember(user_grants_key, id)
  end
end
```

There may be many membership operations, but there is one Redis protocol round trip for the batch. With Redis disabled, the same semantic check is performed as one relational query over the candidate account IDs.

Later versions of the implementation cache the final derived authorization answer per user, permission, and account. That cache stores an authorization-service-owned answer, not copies of account-service's hierarchy data.

## The Dense Case Shows the Collapse

The dense benchmark returns:

```text
1 account
20,000 users
40,006 group membership rows
8 unique groups
approximately 5.7 MB of JSON
```

The result is large, but it does not generate tens of thousands of authorization requests. User and group collection reads collapse their rows to the distinct owning account scopes before calling `/can`.

That distinction is the difference between per-object security semantics and per-row network behavior. The former is required. The latter is optional and ruinous.

## Why “Load All Capabilities” Is a Different Shape

The repository includes `AUTHORIZATION_CHECK_MODE=capabilities` as a torture comparison. In that mode, data services fetch full capability arrays for the requested scopes and search those arrays for the one permission they need. Authorization-service deliberately rejects `/can` so the two designs cannot be mixed accidentally.

Both modes can preserve the same allow/deny semantics. They do not have the same cost or ownership story:

- `/can` asks authorization-service one precise policy question;
- capabilities mode asks for a broader policy representation and makes every caller interpret it.

The comparison matters because batching a broad answer does not make the answer narrow. Efficient transport cannot repair an API that performs unnecessary policy work.

## Do Not Escape Through `IAM_SYSTEM`

`IAM_SYSTEM` is a trusted internal identity used for narrow intra-IAM projections, such as authorization-service asking account-service for parent-chain facts. It is not a mechanism for converting a real actor's failed request into an authorized one.

The original actor ID must survive the request path until the final allow/deny decision. Internal services may gather relationship facts under a trusted system identity, but the permission being proved remains the real user's permission.

## Request Shape

Wrong:

```text
load collection
for each returned row:
  call authorization-service
```

Correct:

```text
load collection
collapse rows to distinct owning scopes
ask one precise batched authorization question
authorization-service resolves parent chains and grants in collections
allow only if every requested scope is covered
```

The authorization problem did not disappear. It was expressed at its natural cardinality.

Previous: [Part 2: Multiple Object Retrieval](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval)  
Next: [Part 4: Redis Cache, per service](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-4-redis-cache-per-service)

