# GraphQL Auth Explosion Case Study, Part 3: Multiple Object Authorization

Series: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/iam-system-demo)  
Overview: [GraphQL Auth Explosion Case Study](/articles/series/IAM-System-Demo/graphql-auth-explosion-case-study)

> Status: waiting on authorization implementation audit
>
> Publication work is intentionally paused pending the Part 3 audit in
> `TODO_FOR_ARTICLE.md` in the `iam-system-demo` repository. The current set-based
> multi-account authorization path must be checked against the intended downward-only
> inheritance and all-or-nothing collection semantics before it is presented as
> the finished solution.

## Multiple Object Authorization

Object retrieval fans out to Authorization checks. At each service level, an array of objects is being requested, and the entire request should fail if Authorization is missing for any of those objects. In our example system, Authorization is cumulative per parent account - if you have permission to the parent account, you have permission to the child account. The Authorization service supports a 'can' endpoint, to check if a given user has a specific permission for a type of object.

These are individual level grants, not a collection of all the grants a user has. They are cached in redis, and are checkable in a single pipelined redis call.

### The Single-Context Capability Shape

```mermaid
sequenceDiagram
  autonumber
  participant S as Calling Service
  participant AZ as Authorization Service

  S->>AZ: GET /capabilities/Account/:account_id<br/>pad-user-id: actor
  AZ-->>S: [account.read, account.users.read, ...]
  Note over S: Search the returned array for account.users.read
```

That response is bounded when a normal product request operates inside one account context. Organization-wide User Management changes the cardinality:

```mermaid
sequenceDiagram
  autonumber
  participant UM as User Management
  participant AZ as Authorization Service

  loop Once for every account represented in the result
    UM->>AZ: GET /capabilities/Account/:account_id<br/>pad-user-id: admin
    AZ-->>UM: complete capability array for account N
  end

  Note over UM,AZ: One cached single-context lookup becomes a multi-account fan-out
```

### Authority Flows Down the Account Tree

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

For a target account, only that account and its direct ancestor chain are relevant. A grant does not flow upward from a child or sideways into a sibling branch.

### Ask One Question About the Whole Set

```mermaid
sequenceDiagram
  autonumber
  participant S as Calling Service
  participant AZ as Authorization Service
  participant AS as Account Service
  participant G as Capability Grants

  S->>AZ: POST /can/Account/account.users.read<br/>{ scope_id: [A, B, C] }<br/>pad-user-id: admin
  AZ->>AS: POST /accounts_with_parents<br/>{ account_ids: [A, B, C] }<br/>pad-user-id: IAM_SYSTEM
  AS-->>AZ: { A: [...], B: [...], C: [...] }
  AZ->>G: find matching grants across ancestor scope IDs
  G-->>AZ: granted scope-ID set
  AZ-->>S: 200 only if A, B, and C are all covered<br/>otherwise 403 for the complete collection
```

The account IDs come from relationship queries, not an arbitrary list supplied by the user. The authorization call verifies the complete result as an invariant. It does not silently filter the collection down to whatever happens to pass.

Previous: [Part 2: Multiple Object Retrieval](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-2-multiple-object-retrieval)  
Next: [Part 4: Redis Cache, per service](/articles/series/IAM-System-Demo/graphql-auth-explosion-part-4-redis-cache-per-service)
