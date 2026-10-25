# GraphQL Auth Explosion Case Study, Part 3: Multiple Object Authorization

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

## Ask the Permission Question You Need

Batch retrieval fixes transport shape. It also reveals the next multiplier: a caller that needs one decision can still ask Authorization Service for every effective capability on every scope in the batch.

That broad capabilities API remains useful at an application boundary. A screen operating in one Account context may genuinely need to know which controls to show. For example, the caller supplies a seeded Account admin as the actor and asks for that user's complete effective capability set on one Account:

```http
GET /capabilities/Account/account-a
pad-user-id: user-42
```

```json
[
  "account.read",
  "account.users.create",
  "account.users.read",
  "group.create"
]
```

That is the full Account-scoped set created for an admin by the demo's seed projection. Membership in the Account's Users Group supplies `account.read` and `account.users.read`; membership in its Admins Group supplies `account.users.create` and `group.create`. The endpoint also includes applicable Account-scoped grants inherited through the Account hierarchy or a validated MSP provider path.

The response contains permission names, not grant records or an explanation of which Group and scope supplied each permission. Group-scoped permissions such as `group.modify` are returned when asking about the relevant Group. Organization-scoped permissions such as `organization.read` and `organization.accounts.create` are returned when asking about the Organization. They are not omitted Account capabilities; they belong to different authorization targets. An actor with no applicable Account grant receives an empty array.

The same seeded admin has this complete Organization-scoped set:

```http
GET /capabilities/Organization/organization-1
pad-user-id: user-42
```

```json
[
  "organization.accounts.create",
  "organization.read",
  "organization.read.accounts"
]
```

The Users Group supplies the two read permissions. The Admins Group supplies `organization.accounts.create`.

For a Group owned by that Account, the effective Group response contains both direct Group grants and the Account permissions that cover the Group:

```http
GET /capabilities/Group/group-1
pad-user-id: user-42
```

```json
[
  "account.read",
  "account.users.create",
  "account.users.read",
  "group.create",
  "group.modify",
  "group.read"
]
```

`group.modify` is a direct grant on that Group. `group.read` may be direct, and is also implied for the Group by `account.users.read` on the Group's actual owning Account. The remaining entries are the effective Account permissions inherited by the Group target.

That is useful when the caller really needs the whole set. It is the wrong default for an owning service that already knows its policy. User Service does not need every capability on 500 Accounts to protect a User collection; it needs to know whether the actor has `account.users.read` on those Accounts. The [capabilities endpoint and response shape](https://github.com/meleneth/iam-system-demo/blob/d61eeae7bf0dcefd9e8630d54c38cd37170ae9ec/authorization-service/app/controllers/capabilities_controller.rb#L1-L19) are separate from the narrow decision path.

The internal workhorse is therefore a narrow, batched request:

```http
POST /can/Account/account.users.read
pad-user-id: <actor-id>
Content-Type: application/json

{"scope_id":["account-a","account-b","account-c"]}
```

`/can` returns `200` only when every nonempty target in the chunk is allowed. Otherwise it returns `403`. It deliberately does not say which target failed, so callers must not treat a denied chunk as a per-target decision map. An empty normalized Account target set is denied; that rule is separate from returning an ordinary empty data page or a zero count after the relevant container has been authorized.

## Grants, Memberships, and Account Coverage

Capability grants belong to Groups. The real actor in `pad-user-id` is not replaced with an internal identity while the decision is made. Authorization Service uses `IAM_SYSTEM_AUTH` only to ask Group Service for the actor's explicit memberships and the owning Account of a Group. A grant applies only when the actor is a member of the same Group named by that grant.

For an Account target, Authorization Service considers the target's physical ancestry and any validated MSP provider edges. An Account-scoped grant applies downward to descendants. Provider affiliation alone grants nothing, and MSP access uses ordinary Account permissions rather than a special MSP role.

For unresolved permission-cache entries, the authorization trace is shaped like this:

```text
Owning data service
└── POST Authorization Service
    /can/Account/account.users.read
    actor: real actor; targets: A, B, C
    ├── read cached decisions for actor + permission + target
    └── evaluate unresolved targets
        ├── Account Service: physical hierarchy for A, B, C
        │   identity: IAM_SYSTEM
        ├── Organization Service: validated MSP provider edges
        │   identity: IAM_SYSTEM_AUTH
        ├── Group Service: explicit memberships for the real actor
        │   identity: IAM_SYSTEM_AUTH
        ├── capability_grants: matching permission on covered scopes
        ├── cache one boolean per actor + permission + target
        └── return 200 only if A, B, and C are covered
```

The internal identities authorize those restricted fact lookups; they do not replace the real actor whose memberships and grants are being evaluated. A permission-cache hit can skip the hierarchy, provider, membership, and grant work for that target.

Group rows and membership rows each have one authoritative model policy: `group.read` on the referenced Group. Authorization Service evaluates that Group question using either an exact `group.read` grant or `account.users.read` covering the Group's actual owning Account. The membership lookup that makes a grant applicable is different from the owning-Account lookup used to evaluate Group coverage.

## One Policy Can Contain a Real OR

One policy per protected object type prevents competing model declarations. It does not mean every domain rule has one branch.

An `OrganizationAccount` is a relationship row, and its authoritative read policy is evaluated per row:

```text
can(actor, organization.read.accounts, row.organization_id)
OR
can(actor, account.read, row.account_id)
```

For a collection, every row must pass its own predicate. One row may pass through the Organization branch while another passes through the Account branch. This is not the same as “all Organizations are allowed, or all Accounts are allowed.”

Neither branch grants the other underlying permission. Reading the relationship through `organization.read.accounts` does not make `/can/Account/account.read` succeed. Reading it through `account.read` does not make `/can/Organization/organization.read.accounts` succeed. The permission name is exactly `organization.read.accounts`.

Public `/can` cannot express this mixed per-row OR because its result is all-or-nothing for one permission and scope type. In precise mode, `AuthorizedModel` sends only the two questions required by this relationship policy to `POST /internal/decisions`. The response correlates one boolean with each scope type, scope ID, and permission. The endpoint rejects reserved IAM actors, empty or oversized requests, unsupported questions, and malformed or uncorrelated responses. In capabilities mode, the same row decisions are derived from the batched capability responses.

## Keep the Batch Through Enforcement

Owning models resolve authorization targets from the records they loaded, deduplicate those targets, and evaluate them in configurable chunks. This preserves the batch without treating SQL projections as proof. A `pluck` can be an efficient way to obtain the Group IDs or Account IDs a policy needs; authorization still depends on what was projected, which records it represents, and whether actor, permission, target, and relationship correlation survive.

The important shape is now consistent:

1. retrieve records in collections;
2. derive the policy targets from owner-controlled fields;
3. ask the smallest permission question that answers that policy;
4. reject the whole protected collection when any row fails.

This is why batching retrieval exposed an authorization problem rather than finishing the optimization. The transport became set-shaped first. Then the authorization question had to become appropriately small while preserving that set shape.

Next: [Redis Cache, per Service](./graphql-auth-explosion-part-4-redis-cache-per-service)
