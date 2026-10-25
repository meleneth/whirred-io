# GraphQL at Scale: Evidence Appendix

This is an editorial verification record for [GraphQL at Scale](./graphql-at-scale-first-draft). It is not intended to turn the article into a benchmark report.

## Provenance and method

The newest relevant collection is `reports/raw/msp10-parent-comparison-prod-full-20261025/` in the local `iam-system-demo` evidence repository. It records source revision `175312ec2444ad6cc502e7622aa78911a893c883`, the full production benchmark stack, exact request and response files, runtime configuration, process-stability snapshots, independent correctness results, and complete Jaeger exports. The report describing it is `reports/msp10-parent-trace-comparison-2026-10-25.md`.

The narrower trace gallery collection is `reports/raw/article-traces-20261006T023020Z/`, revision `5b8cb7bda92d49668ba2e915262b8183985a2498`. It includes 13 selected single samples. The collector ran two workload warmups per profile. For cold samples it flushed only the four services' scoped Redis DB 1; it did not restart Rails or PostgreSQL. These traces are structural evidence and single-request latency observations, not replacements for the repeated matrix.

Repeated complete-walk measurements come from `reports/raw/article-20260917T075552Z/`, revision `21f58d0188ea1cebba97d3cfcd01a523edbdfcf0`, summarized in `reports/article-benchmark-run-2026-09-17.md`. Values are medians of three response measurements. Five of 17 collector cases failed; claims below retain that qualification.

Instrumentation retained workload roots, Net::HTTP client and Rack server spans, authorization/model boundaries, application `sql.active_record` executions, and one span per Redis pipeline. It omitted schema/setup SQL, controller phases, serialization/materialization spans, application-cache spans, and cache-hit SQL. Consequently, “SQL spans” below means retained application SQL spans, not every database protocol event.

## Claim-to-evidence map

### 1. Eight hierarchy requests: individual versus batch

- Scenario: eight target accounts from the 25-account `deep_chain` fixture; Redis off; targeted `/can`; production benchmark stack.
- Individual trace: `ddc0e4ac8687f9680f46a97b27139c72` (`hierarchy-individual`). Client duration 0.577079712 s; eight initiating requests; 172 returned account rows; 617 spans; 88 HTTP client spans; 144 application SQL spans.
- Batch trace: `78a6b1d94ada89ef33706b3fced65890` (`hierarchy-batch`). Client duration 0.096811509 s; one initiating request; 172 returned rows; 78 spans; 11 HTTP client spans; 18 SQL spans.
- Equality: both results have SHA-256 `328a4a079a11f7fb7be17a69e3eb19ad0501253ab1d7ec4e9301d9e3a41c53b7`.
- Assertion supported: set-shaped hierarchy retrieval can collapse repeated network and SQL work while preserving the result.
- Caveat: these are one measured sample per path in a warmed laboratory stack, not a historical deployed before/after or a throughput comparison.
- Useful waterfall: compare the eight repeated top-level hierarchy subtrees in `hierarchy-individual` with the single `accounts_with_parents` subtree in `hierarchy-batch`. Notice that downstream authorization, membership, hierarchy, and organization-context work contracts with the initiating request count.

### 2. Wide user management: full capabilities versus a targeted operation

- Dataset and result: `wide_org`, 251 accounts and 5,020 users. Both requests returned and independently verified 251 exact accounts and 5,020 exact users, including parents, account scopes, group memberships, totals, and cursor data.
- Full-capabilities trace: `568b3a7cc3a9422e89fa91a8fe140972` (`authorization-collection-capabilities`). Redis off, batched retrieval, HTTP 200, 12.993682 s, 18,406 spans, 2,319 HTTP client spans, 4,596 application SQL spans.
- Targeted trace: `7ec59a5953cb8b865b6de6bacd522b5e` (`authorization-collection-can`). Redis off, batched retrieval, HTTP 200, 3.356125 s, 560 spans, 88 HTTP client spans, 137 SQL spans.
- Trace structure: the capability run includes 760 calls each to `/accounts_with_parents`, `/organization_account_ids/for_account_ids`, and `/internal/auth/account_providers`. The targeted run includes 17 calls in each category. Both include six paged membership searches because 5,020 user IDs exceed the 1,000-item batch size.
- Authorization evaluated: Account objects require `account.read`; User objects require `account.users.read`; Groups and GroupUsers require `group.read`, with account grants covering owned groups under the contract. OrganizationAccount rows use per-record alternatives: `organization.read.accounts` on the organization or `account.read` on the account. In targeted mode this alternative is evaluated through `/internal/decisions`; ordinary single-requirement batches use `/can`.
- Assertion supported: when the caller needs a specific operation, permission-specific set evaluation avoids retrieving and correlating complete capability arrays per scope.
- Caveat: this pair is a controlled current-path comparison, not evidence of historical production latency. It is also a single sample, so span cardinality is stronger evidence than the exact speed ratio.
- Useful waterfall: `authorization-collection-capabilities` makes the repeated hierarchy/context pattern visually dominant. `authorization-collection-can` shows a much smaller number of wide subtrees. Inspect the Authorization Service SQL in the latter for a permission predicate and a set of candidate scope IDs.

### 3. End-to-end GraphQL MSP comparison

- Dataset: the full seed is reported as 1,000,000 users, but the measured deterministic `small_msp_10` fixture contains 11 users: one provider administrator and one user in each of ten one-account client organizations. The request retrieves the ten client users and separately requests all ten one-level client hierarchies. The million-user database is environmental context, not the number of candidates or returned rows.
- Request equivalence: request SHA-256 `285ad9bc9f10a70d454a0554065d1d7afd09edb342e55d5b3f2da2863047a691` in both profiles.
- Result equivalence: response SHA-256 `5bd1871402f7999a2e2e123b8526b39c0e5f249adbfdf1108ec067ebbac2c2ca`; HTTP 200; exact accounts, parent links, users, scopes, group memberships, total, and cursor checks passed.
- Serial/full-capabilities trace: `736dc3eefe6ce3bab01b5974822d7c33`. Redis disabled; hierarchy retrieval uses ten serial `Account.find` calls; client time 1.367033 s; 1,728 spans; 251 HTTP client spans; 408 application SQL spans; no Redis spans. The trace contains 33 account-capability evaluation spans.
- Batch/targeted trace: `cddc7aad21f43d3b1762000167016081`. All four scoped Redis DBs flushed immediately before measurement; one hierarchy API batch; client time 0.321200 s; 232 spans; 37 HTTP client spans; 35 SQL spans; 29 Redis pipelines containing 202 commands. Target checks include `account.users.read` for ten accounts and batched `account.read` checks for ten accounts; one-account provider control checks remain fixed overhead.
- Network shape at User Management: serial trace has 14 downstream requests—one managed-ID request, ten non-overlapping Account GETs, one User search, one GroupUser search, and one Group search. Optimized trace has five—one managed-ID request, one ten-account hierarchy POST, and the three user/group calls. Across all services the counts are 251 versus 37.
- SQL work: retained application SQL durations sum to 149.005 ms versus 17.786 ms. These sums are not wall time because spans can nest and overlap.
- Assertion supported: the complete optimized execution preserves the response while substantially reducing repeated cross-service work.
- Caveat: this is an intentionally combined worst-versus-best profile. It changes authorization mode, parent retrieval, and Redis state, so it cannot attribute the difference to one optimization. “Cold” covers Redis only; Rails, PostgreSQL, and Active Record process/query state were warm and stable.
- Useful waterfall: in `736dc...`, notice the serial sequence of ten Account GETs at the User Management boundary and the many repeated capability/hierarchy/context subtrees below them. In `cddc...`, notice one ten-account POST and set-width authorization spans. The five User Management calls are sequential in the recorded waterfall; the improvement here is batching, not claimed parallelism.

### 4. Cold versus warm cache on the wide organization workload

- Cold trace: `370e5eb6fc80554911b894a10daabdd3` (`organization-cold`), 1.312831 s, 251 spans, 45 HTTP client spans, 46 application SQL spans, 30 Redis pipeline spans.
- Warm trace: `fe0070a3938e9216b201acf1ffc22339` (`organization-warm`), 0.974993 s, 173 spans, 34 HTTP client spans, 31 SQL spans, 18 Redis pipelines.
- Both returned the checked 251 accounts and 5,020 users.
- Assertion supported: Redis reuse removes authoritative work, but a warm result is not evidence of cold performance.
- Cache boundaries: authorization decisions/capability lists are actor-, scope-, and permission-specific; Account Service caches physical hierarchy results; Organization Service caches account-ID lists by organization. Entries have 300-second TTLs. The trace does not capture every cache event, only Redis pipelines.
- Caveat: the cold request followed two profile warmups and flushed only Redis DB 1. PostgreSQL buffers and Rails processes were not cold.

### 5. End-to-end GraphQL and pagination

- Deep-chain cold trace: `3b5219aa0e9aa41fda14898a19d827bb`, 0.272355 s, 169 spans, 26 HTTP client spans, 27 SQL spans, 21 Redis pipelines; 25 accounts and 500 users verified.
- Deep-chain warm trace: `4dd9b7b6bfe9d25ba345197c046a03ea`, 0.192221 s, 78 spans, 13 HTTP client spans, nine SQL spans, eight Redis pipelines; the same result was verified.
- MSP page trace: `1dda54855daa1ff10fec5fc2e0ced0eb`, 0.237430 s, 91 spans, 15 HTTP client spans, 13 SQL spans, nine Redis pipelines. The fixture has 9,999 managed client organizations, but batch size 200 bounds this response to one page: 200 candidate accounts, 200 authorized accounts, and 200 returned users. It is a warm-cache sample.
- Assertion supported: GraphQL composes the owning REST services through bounded DataLoader sources; the MSP page does not materialize the full fixture.
- Caveat: the MSP trace is not evidence that all 9,999 clients were returned in 0.237 s.

### 6. Substantial MSP complete walks

The September 17 repeated matrix recorded complete pagination walks. All values below are medians of three client measurements and returned the expected account totals.

| Fixture | Candidate/authorized/returned accounts | Redis-on cold | Redis-on warm | Batch size |
| --- | ---: | ---: | ---: | ---: |
| MSP 10k | 9,999 | 5.42 s | 2.93 s | 10,000 |
| MSP 50k | 49,999 | 30.15 s | 16.05 s | 10,000 |
| MSP 100k | 99,999 | 63.44 s | 37.40 s | 10,000 |

- Assertion supported: the laboratory completed these large fixed-dataset response walks with exact expected totals.
- Important qualification: the batch-10,000 cases are failed collector cases because some Jaeger traces lacked parents after the receiver rejected exports over its 4 MiB decompressed-message limit. Response and count checks succeeded, but these are response observations rather than passed full trace cases. They establish neither throughput nor production scalability.
- Alternative passed cases: the 9,999-account walk passed complete trace archival at batch sizes 1,000 and 200, with cold/warm medians of 13.56/5.06 s and 31.20/24.96 s respectively.

## Implementation locations

- GraphQL schema and resolvers: `user-management-service/app/graphql/user_management_service_schema.rb`; `types/query_type.rb`; `types/account_type.rb`; `types/user_type.rb`; `types/msp_managed_account_type.rb`; `resolvers/account_hierarchies_resolver.rb`.
- DataLoader sources: `user-management-service/app/graphql/sources/account_by_id.rb`, `accounts_with_parents_by_id.rb`, `users_by_account_id.rb`, and `groups_by_user_id.rb`. `AccountById` chunks at `IamDemo.batch_size` and has a bounded four-thread chunk pool; the traced ten-account hierarchy path is one chunk, so the article does not credit concurrency for that comparison.
- REST resource interfaces: `gems/account-resource/lib/account_resource.rb`, `user-resource/lib/user_resource.rb`, `group-resource/lib/group_resource.rb`, `group-user-resource/lib/group_user_resource.rb`, and `organization-account-resource/lib/organization_account_resource.rb`.
- Shared request boundary: `gems/authorized-resource/lib/authorized_resource/base.rb` propagates the current actor; receiving services enforce model policy through `gems/authorized-resource/lib/authorized_model.rb`.
- Authorization client: `gems/authorized-resource/lib/authorized_resource/authorization_client.rb`. Capability mode retrieves maps by scope; `/can` groups targets by scope type and capability; alternative policies use the correlated internal decision endpoint.
- Authorization endpoints and set evaluation: `authorization-service/app/controllers/can_controller.rb`, `app/controllers/internal/decisions_controller.rb`, and `lib/authorization/capabilities.rb`. Relevant methods are `account_ids_with_permission`, `organization_ids_with_permission`, `group_ids_with_permission`, `canonical_account_ids_with_permission`, and `account_scope_ids_for`.
- Current grant SQL shape: `canonical_account_ids_with_permission` builds the union of each target's physical hierarchy and virtual provider ancestry, then issues one `CapabilityGrant` query constrained by the actor's group IDs, `scope_type = 'Account'`, candidate scope IDs, and the requested permission. Organization decisions use an analogous permission-specific query. Full `for_account` capability retrieval intentionally selects all permissions across the effective scopes.
- Hierarchy CTE and caches: `account-service/app/controllers/accounts_controller.rb`. `compute_accounts_with_parents` uses `WITH RECURSIVE roots(...)` and correlates results by `root_id`; Account Redis keys are target-specific and associated with an organization invalidation set.
- MSP ownership and pagination: `organization-service/app/controllers/internal/msp_managed_organizations_controller.rb`; provider facts for authorization are exposed only through `organization-service/app/controllers/internal/auth/account_contexts_controller.rb` under `IAM_SYSTEM_AUTH`.
- Context semantics: `gems/authorization-context/lib/authorization_context.rb`, `authorization-service/lib/authorization/account_context_client.rb`, and `group_context_client.rb`. Context activation restores the previous nested context in `ensure`.
- Benchmark definitions and correctness: `benchmarks/article_matrix.json`, `scripts/refresh_article_traces.rb`, `scripts/gallery_correctness.rb`, and `scripts/authorization_correctness_gate.rb`.

## Correctness evidence and limitations

The selected gallery checks derive expected identities from the fixture manifest, not from `/can`, capability enumeration, or privileged runtime enumeration. The October 25 pair checks exact returned accounts, parent links, users, account scopes, group memberships, totals, and cursors. Focused runtime evidence in `reports/authorization-correctness/batched-account-runtime-audit-2026-09-16.md` independently verifies an allowed descendant, a denied sibling, and a denied foreign MSP account across cold, warm, and partial-cache states. The cold `/can` request produced one permission-specific grant query and cached `true`, `false`, `false` per target.

These checks support the particular fixed-fixture decisions; they are not a proof of the entire authorization system. Specific limitations and concerns:

- The demo trusts GraphQL's `as` argument and the `pad-user-id`, `IAM_SYSTEM`, and `IAM_SYSTEM_AUTH` header values. It has no production authentication or signed workload identity boundary.
- Fixed benchmark data avoids concurrent mutation. General grant/membership revocation and coordinated cache invalidation are explicitly outside the project. External data edits can remain observable through layered 300-second caches for more than one TTL window.
- `/can` is all-or-nothing for a homogeneous target batch. The correlated `/internal/decisions` endpoint is deliberately allowlisted to two alternative-policy questions. The article must not describe either as an unrestricted general policy API.
- Missing, duplicate, cyclic, malformed, or over-depth hierarchy facts fail closed in the inspected implementation, but passing tests and fixture gates are evidence, not formal verification.
- The MSP endpoint's `total_count` is managed-relationship metadata disclosed after provider ownership and provider `account.read` checks; only the current page is materialized and authorized. It is not a count of an independently filtered authorized subset.

## Claims not verified

- No production traffic, concurrency, throughput, saturation, cost, or availability claim was verified.
- No historical trace captures the original deployed implementation. Current serial/full-capabilities profiles reproduce the expensive shapes, but they do not establish historical latency.
- The traces do not isolate how much of the October 25 improvement comes from retrieval batching, targeted authorization, or Redis; that experiment changes all three.
- No claim that GraphQL is faster than REST—or vice versa—is supported or needed. GraphQL is the composition entry point and REST is the owning-service interface in the measured system.
- No evidence shows that a million records were candidates or returned in any featured request. The million-user seed is the surrounding database; candidate and return counts are stated per scenario above.
