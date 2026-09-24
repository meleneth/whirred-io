# GraphQL Auth Explosion Case Study, Part 3: Multiple Object Authorization

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)

Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

## Multiple Object Authorization

Object retrieval fans out to authorization checks. At each service level, an array of objects is being requested, and the entire request should fail if authorization is missing for any of those objects. In this system, users receive permissions through explicit Group memberships. An Account-scoped grant belonging to one of those Groups applies to that Account and its descendants. Authorization Service's `/can` endpoint answers one permission question for a complete set of targets.

The active grants are **Group-owned**, not user-owned. The actor's User ID still identifies the request, but Authorization Service first asks Group Service for that actor's Group IDs and then evaluates grants belonging to those Groups.

### The Single-Context Capability Shape

In a normal, non-User-Management product request, the user operates inside one
account context. In the optional full-capabilities mode, the calling service
asks for the actor's complete effective capability list for the account, then
checks the returned array for the capability it needs. Authorization Service
derives that list from Group memberships, Group-owned grants, and the Account's
physical and virtual ancestry. Because the request concerns one actor and one
account, the response is bounded:

```mermaid
sequenceDiagram
  autonumber
  participant S as Calling Service
  participant AZ as Authorization Service
  participant GS as Group Service

  S->>AZ: GET /capabilities/Account/:account_id<br/>pad-user-id: actor
  AZ->>GS: Resolve actor's Group memberships<br/>pad-user-id: IAM_SYSTEM_AUTH
  GS-->>AZ: group_id collection
  AZ-->>S: [account.read, account.users.read, ...]
  Note over S,AZ: Search the returned array<br/>for account.users.read
```

#### Organization-Wide User Management

The User Management page loads every user belonging to every account in the
organization. Unlike a normal request, its result therefore spans the entire
account tree instead of one account context. The following diagram shows the
consequence: after loading users across all of those accounts, User Management
repeats the same capability-list lookup for every account represented by those
users.

```mermaid
sequenceDiagram
  autonumber
  participant UM as User Management
  participant AZ as Authorization Service

  Note over UM,AZ: Every user from every account<br/>in the organization is being loaded
  Note over UM,AZ: Once for every account<br/>represented in the result
  loop
    UM->>AZ: GET /capabilities/Account/:account_id<br/>pad-user-id: admin
    AZ-->>UM: complete capability array for account N
  end

  Note over UM,AZ: One admin user's capabilities are checked<br/>across every represented account context
```

### Authority Flows Down the Account Tree

For a target account, authorization considers that account and its direct
ancestor chain. A grant on an ancestor applies downward to its descendants. A
grant does not flow upward from a child or sideways into a sibling branch:

```mermaid
flowchart TB
  Root[Root account<br/>grant: account.users.read]
  Left[Child account A]
  Right[Child account B]
  Leaf[Grandchild account A.1]

  Root -->|grant applies| Left
  Root -->|grant applies| Right
  Left -->|grant applies| Leaf

  Leaf -. does not grant upward .-> Left
  Left -. does not grant sideways .-> Right
```

### Ask One Question About the Whole Set

The account IDs come from relationship queries, not an arbitrary list supplied
by the user. Authorization therefore checks the complete query result as an
invariant: every account must be covered, or the entire request fails. It does
not silently filter the collection down to whatever happens to pass.

```mermaid
sequenceDiagram
  autonumber
  participant S as Calling Service
  participant AZ as Authorization Service
  participant GS as Group Service
  participant AS as Account Service
  participant OS as Organization Service
  participant DB as capability_grants

  S->>AZ: POST /can/Account/account.users.read<br/>{ scope_id: [A, B, C] }<br/>pad-user-id: admin
  AZ->>GS: Resolve admin's Group memberships<br/>pad-user-id: IAM_SYSTEM_AUTH
  GS-->>AZ: applicable group IDs
  AZ->>AS: POST /accounts_with_parents<br/>{ account_ids: [A, B, C] }<br/>pad-user-id: IAM_SYSTEM
  AS-->>AZ: { A: [...], B: [...], C: [...] }
  AZ->>OS: Resolve MSP provider edges<br/>pad-user-id: IAM_SYSTEM_AUTH
  OS-->>AZ: provider Account IDs, if any
  AZ->>DB: matching Group grants across physical and virtual scopes
  DB-->>AZ: granted scope-ID set
  AZ-->>S: 200 only if A, B, and C are all covered<br/>otherwise 403 for the complete collection
```

### Memberships Need Their Owning Groups

A `GroupUser` membership has a Group ID, not the Account ID needed for an
`account.users.read` check. Group Service reads each matching Group's `id`
and `account_id` before authorizing the membership collection. It checks the
Account IDs as a set first. If that check fails, it evaluates each Group using
`group.read` or `account.users.read` on the owning Account. A missing Group
is an error, not an implicitly authorized membership.

This Group lookup is separate from Authorization Service's lookup of the
**actor's Group memberships**, which identifies applicable grants. It is also
separate from loading full Group records for the response. The [complete
wide-organization trace](./graphql-auth-explosion-traces#authorization-inside-a-complete-organization-request)
shows the first lookup as `SQL Group Pluck` under
`GroupUser.collection.authorize`.

## Measured Evidence

The group-grant implementation was checked with direct and inherited allows, nonmembers, unrelated branches, mixed permissions and scopes, two independent MSPs, provider ancestry, Organization and Group scopes, collection all-or-nothing behavior, both authorization APIs, and Redis-enabled and disabled paths. The production gallery workloads then reran with exact response checks.

The [retrieval and authorization results](./graphql-auth-explosion-results#retrieval-and-authorization) distinguish successful capabilities-versus-`/can` comparisons from empty-HTTP-reply failures. Those timings are measurements of named workloads, not a substitute for the separate correctness matrix.


### Trace the Collection Request

The gallery shows the [complete wide-organization `/can` request](./graphql-auth-explosion-traces#authorization-inside-a-complete-organization-request), including its collection authorization batches. The much larger full-capabilities request is summarized there from the archived source trace; it is not offered as a live waterfall.
