# Publication Blockers

These items are release gates for the whirred.io article series. They are not optional polish.

## P0 — Replace Numeric Offset Masquerading as MSP Continuation

Status: **OPEN — DO NOT PUBLISH THE CONTINUATION/PAGINATION CLAIMS**

Owner: unassigned

Affected series:

- GraphQL Auth Explosion Part 5: Smart APIs
- GraphQL Auth Explosion Part 7: GraphQL and Dataloader
- any overview, conclusion, benchmark, or diagram that presents MSP continuation as valid

### Violated invariant

A continuation token is opaque state describing where a stable traversal should resume. It must not be a numeric SQL offset, and callers must not parse or perform arithmetic on it.

### Current invalid implementation

`organization-service/app/controllers/internal/msp_managed_organizations_controller.rb` currently:

```ruby
offset = params.fetch(:continuance, 0).to_i
account_scope.offset(offset).limit(limit)
continuance = next_offset.to_s
```

`organization-service/spec/requests/msp_managed_organizations_spec.rb` explicitly expects a numeric token such as `"2"`, locking the invalid contract into tests.

`user-management-service/app/graphql/types/query_type.rb` calculates progress with:

```ruby
continuance.to_i + account_ids.length
```

That makes GraphQL dependent on the token's internal offset representation.

`benchmark_demo.sh` passes the numeric token through against static fixtures. Exact final cardinality on an immutable fixture does not validate continuation correctness under mutation and can mask the defect.

### Why this is invalid

- Inserting or deleting rows before a later page's offset can skip or duplicate records.
- Later pages make the database scan/discard increasingly large prefixes.
- The client-visible token exposes positional implementation detail.
- GraphQL cannot treat the token as opaque because progress arithmetic depends on it.
- The tests prove only static offset traversal, not continuation semantics.

### Required replacement

Implement deterministic keyset continuation:

1. Define a stable total ordering. If `account_id` is the ordering key, document that choice; use a composite key if the chosen ordering is not unique.
2. On the first page, query in that order and fetch `limit + 1` rows.
3. Encode the last returned ordering key in an opaque, versioned token.
4. Bind the token to the MSP account/query scope so it cannot be reused against another traversal.
5. Resume with a keyset predicate such as `account_id > last_account_id`, not `OFFSET`.
6. Validate malformed, tampered, expired, wrong-version, and wrong-scope tokens explicitly.
7. Decide whether cross-page mutation must provide snapshot consistency. If yes, include or reference a snapshot/version boundary; keyset pagination alone does not create a database snapshot across requests.
8. Track `loaded_count` independently from the token. The GraphQL layer must pass continuation through without parsing it.

### Required tests

- The first page returns a non-numeric opaque token when more data remains.
- Passing the token returns the next keyset page in deterministic order.
- No implementation path calls SQL `OFFSET` for continuation.
- The client/GraphQL layer never calls `to_i`, decodes, or performs arithmetic on the token.
- Deleting a record before the cursor between requests does not skip an unreturned preexisting record.
- Inserting a record before the cursor between requests does not duplicate a returned record.
- Mutation behavior after the cursor matches the explicitly chosen snapshot semantics.
- Tokens are rejected when malformed, tampered, wrong-version, expired if expiry is part of the contract, or used for another MSP scope.
- Exact traversal cardinality contains no duplicates for the deterministic 10k, 50k, and 100k fixtures.
- Benchmark validation compares the unique returned account-ID set with the fixture manifest, not only a running count.

### Publication exit criteria

This blocker may be closed only when:

- the implementation and tests satisfy the contract above;
- the full continuation benchmarks have been rerun;
- raw account-ID cardinality and uniqueness have been verified;
- Parts 5 and 7 describe the implemented contract rather than the invalid offset version;
- all temporary P0 warning blocks are removed in the same reviewed change that updates the article facts.

