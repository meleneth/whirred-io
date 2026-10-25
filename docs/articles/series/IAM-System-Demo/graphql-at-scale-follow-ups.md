# GraphQL at Scale: Follow-up Article Opportunities

- **Authorization projection versus evaluation** — When a complete capability list is the right API, when a targeted decision is better, and how correlated all-or-nothing and per-target results preserve policy semantics.
- **Batch-shaped REST services** — Array filters, bounded request sizes, response correlation, completeness checks, pagination, and why batching belongs at the data-owning service.
- **GraphQL DataLoader across HTTP boundaries** — What DataLoader collects, how the sources chunk work, where bounded parallelism helps, and why DataLoader cannot repair a record-shaped downstream API.
- **Recursive CTEs for many hierarchy roots** — The `roots` CTE, cycle and depth guards, organization boundaries, and correlation of one result hierarchy to each requested account.
- **Authorization caches and revocation** — Actor/permission/target keys, owner-derived hierarchy caches, cold/partial/warm behavior, and the invalidation protocol a mutable production system would require.
- **Tracing distributed authorization** — Trace propagation through fibers and threads, semantic span names, SQL and Redis capture, oversized trace failures, and the difference between structural evidence and latency evidence.
- **Shared resource gems as service contracts** — How the ActiveResource gems propagate actor context and expose batch operations without moving authorization policy out of the receiving service.
