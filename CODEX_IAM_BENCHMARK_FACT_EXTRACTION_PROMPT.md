# Codex Prompt: Extract Raw IAM Performance Facts

Work in the `meleneth/iam-system-demo` repository. Read and obey `AGENTS.md` before doing anything else. Use the repository Compose wrappers (`./dc_dev`, `./dc_test`, or `./dc_prod`) exactly as instructed; do not invoke raw `docker compose` for these stacks.

## Objective

Build and run a reproducible benchmark campaign that extracts raw facts about the IAM demo's request phases. The output is evidence for a human-authored article series, not article prose.

Do not decide what the benchmarks “mean” beyond mechanically derived measurements. Do not write persuasive conclusions. Produce configurations, raw observations, calculation inputs, trace-derived request counts, and clearly labelled arithmetic so a human can interpret them later.

The central questions are:

1. What time is spent in each phase of the pathological account/user/group GraphQL requests?
2. How do single-record parent-account HTTP walks compare with owner-service recursive CTE and batched parent-chain paths?
3. How much Puma thread time and database-connection lease time overlaps downstream HTTP waiting?
4. Does Falcon materially change throughput, latency, memory, or connection demand when request shape is held constant?
5. Which gains come from batching, cache state, bounded concurrency, continuation size, or the web server?
6. At what point does increasing batch/page size stop helping because per-account hydration and serialization dominate?

## Preserve the Repository

- Begin with `git status --short`, current branch, current commit, and all local/remote branches.
- Preserve all existing user changes.
- Do not reset, clean, discard, or rewrite history.
- Do not merge or rebase branches unless explicitly required and explained.
- Search all branches and commit history for Falcon, `real_async`, `async-http`, Async semaphore work, Puma/Falcon shootouts, and existing benchmark artifacts before implementing anything.
- The repository currently has a `real_async` branch. Inspect it. Do not assume it is a Falcon branch: verify its server command, gems, HTTP client, and execution model.
- If there is no runnable Falcon variant, create a dedicated benchmark-only branch or worktree containing the minimum server/configuration change necessary. Do not mix request-shape refactors into the server comparison.
- Commit benchmark harness or instrumentation changes separately from server-variant changes, with precise commit messages.

## Fixed System Invariants

Do not bypass these while benchmarking:

- Real actor requests must remain real actor requests.
- Do not convert actor-scoped failures into `IAM_SYSTEM` calls.
- `/can` is the normal precise service-to-service authorization path.
- `AUTHORIZATION_CHECK_MODE=capabilities` is a separate torture comparison and must never be silently mixed with `/can` measurements.
- Each service continues to own its current records and cache boundaries.
- A Falcon comparison must run the same application behavior, fixture, request, cache mode, authorization mode, batch size, and downstream topology as its Puma control.

## First: Inventory What Already Exists

Before adding instrumentation, locate and summarize:

- `benchmark_demo.sh` and all benchmark-related scripts;
- `FINAL_ARCHITECTURE.md` and `REDIS_GRAPHQL_PERFORMANCE.md`;
- fixture manifests and existing timing CSV files;
- GraphQL queries for deep chain, wide organization, dense account, and MSP fanout;
- deliberate slow/slowest account routes;
- account parent-chain single and batch endpoints;
- `real_async` and any Falcon-related commits or branches;
- Puma thread/worker configuration;
- Rails database pool configuration in every participating service;
- HTTP client implementations used by ActiveResource/Faraday and whether they are scheduler-aware;
- OpenTelemetry, Jaeger, Prometheus, Grafana, Redis-exporter, Postgres-exporter, and process metrics already available.

Write the inventory to the run's `METHODOLOGY.md` with exact paths and commit SHAs.

## Benchmark Matrix

Use the existing deterministic fixtures wherever possible. Record exact fixture IDs and cardinalities. At minimum, run the following request shapes.

### Parent hierarchy shapes

1. Deliberate sequential HTTP parent walk (`slow`/`slowest` route as appropriate).
2. Single-account owner-service recursive CTE endpoint.
3. Batched `POST /accounts_with_parents` path.

Use available chain depths that approximate 1, 5, 10, and the deepest deterministic fixture. If those fixtures do not exist, create only the minimum deterministic benchmark fixture needed and record exactly how it was produced.

### GraphQL shapes

1. Small account control query.
2. Deep `accountWithParents` query.
3. Wide organization query.
4. Dense account query with users and groups.
5. MSP user-management continuation walk for 10k, 50k, and 100k fixtures when runtime permits.

### Operational dimensions

For each applicable request shape, vary one dimension at a time:

- server: Puma and Falcon;
- Redis: disabled, cold after flush, warm;
- authorization: `/can` and capabilities-only torture mode;
- batch/page size: 1, 100, 200, 500, 1,000, and 10,000 where the endpoint accepts it;
- offered concurrency: 1, 5, 10, 25, and 50 simultaneous clients, stopping safely if errors or resource exhaustion make higher levels meaningless.

Do not blindly run the full Cartesian product. Start with controls, identify invalid or redundant combinations, and document every omitted cell and why it was omitted. Never compare two runs that changed more than one intended variable.

## Repetition and Run Discipline

- Record hardware, CPU count, RAM, kernel, Ruby version, Rails version, server versions, container versions, and current git SHAs.
- Record every environment variable that changes execution, including thread count, worker count, database pool, Redis toggle, authorization mode, and `IAM_DEMO_BATCH_SIZE`.
- Use a fixed warmup policy.
- Run at least five measured repetitions for short cases and at least three for expensive cases unless runtime makes that prohibitive.
- Record individual samples; do not retain only averages.
- Use explicit per-request and per-run timeouts.
- Record failures, GraphQL errors, curl failures, and partial continuation walks as data. Never discard an outlier without preserving it and explaining the exclusion.
- Avoid unrelated workloads on the machine during the campaign and record known contamination.

## Instrument the Thread/Connection/HTTP Overlap

This is a primary deliverable, not an optional detail.

For each relevant service request, capture timestamps or spans sufficient to reconstruct:

- request accepted;
- Puma thread or Falcon fiber begins work;
- database connection checkout;
- each local SQL query begins and ends;
- each downstream HTTP request begins and ends;
- database connection checkin;
- response serialization begins and ends;
- response completes.

Determine empirically whether a database connection remains checked out while the request waits on sequential downstream HTTP. Do not infer this solely from framework documentation.

If existing OpenTelemetry spans do not expose checkout/checkin, add narrowly scoped benchmark instrumentation using supported ActiveSupport/ActiveRecord hooks or a minimal wrapper. Keep the instrumentation identical across Puma and Falcon. Measure and report its overhead with an instrumentation-on/off control.

For every sample, calculate:

```text
request_duration
database_connection_lease_duration
total_downstream_http_wait
overlap(database_connection_lease, downstream_http_wait)
number_of_downstream_http_requests
number_of_local_sql_queries
```

Also sample each participating database pool at a fixed interval:

```text
pool_size
busy
idle
waiting
dead
```

## Resource and Trace Facts

Collect, at minimum:

- latency: individual, median, P95, P99, maximum;
- throughput: completed requests per second;
- HTTP/GraphQL errors and timeouts;
- response bytes;
- process CPU and RSS for every service;
- Puma workers/threads or Falcon process/fiber configuration;
- database pool utilization and checkout wait;
- database query count and time by service;
- downstream HTTP request count and time by caller/callee;
- Redis operation count, hits, misses, and time;
- continuation pages, accounts returned, users returned, membership rows returned, and unique groups returned;
- serialization time when measurable;
- trace IDs or stable links for representative fastest, median, P95, slowest successful, and failed samples.

Validate cardinalities from response bodies. A fast response that silently returned fewer accounts is not a successful benchmark.

## Deployment-Capacity Arithmetic

Produce a mechanical capacity table for offered rates of 1, 5, 10, 20, 50, and 100 top-level requests per second.

For each measured request shape and server, include the observed inputs and calculate:

```text
mean_in_flight = request_rate * mean_request_duration
p95_in_flight_sizing = request_rate * p95_request_duration
db_connections_from_observed_lease = request_rate * mean_connection_lease_duration
db_connections_at_p95_lease = request_rate * p95_connection_lease_duration
```

For Puma, also calculate an explicitly labelled planning estimate:

```text
required_thread_slots = ceil(p95_in_flight_sizing / target_utilization)
required_instances = ceil(required_thread_slots / threads_per_instance)
```

Use target utilizations of 50%, 70%, and 80%. This is a sizing model, not a benchmark observation; keep derived values visibly separate from raw facts.

For Falcon, do not pretend fibers eliminate database demand. Report separately:

- observed sustainable concurrent fibers;
- observed database connections;
- whether fibers retained connections during HTTP waits;
- CPU, memory, and latency at each offered load;
- the first saturated resource.

If Falcon's HTTP path does not actually yield because the client is blocking, state that as an observed implementation fact with evidence.

## Required Artifact Layout

Create a timestamped directory under:

```text
data/development/benchmark-runs/<timestamp>-server-request-shape/
```

It must contain:

```text
MANIFEST.json
METHODOLOGY.md
FACTS.md
ANOMALIES.md
raw/timings.csv
raw/requests.csv
raw/resources.csv
raw/db_pool.csv
raw/db_connection_leases.csv
raw/downstream_http.csv
raw/trace_summary.csv
raw/redis.csv
raw/configuration/
raw/responses/
raw/traces/
```

`MANIFEST.json` must include repository SHA, branch, dirty status, server variant, commands, environment, fixture manifest, artifact checksums, and run start/end timestamps.

`FACTS.md` must contain only:

- labelled raw-fact tables;
- clearly labelled derived arithmetic;
- links/paths to the underlying CSV rows and trace artifacts;
- factual discrepancies between expected and observed behavior.

Do not put recommendations, rhetorical framing, or article prose in `FACTS.md`.

## Verification

Before reporting completion:

- rerun any automated tests affected by instrumentation or server configuration;
- verify every CSV has a header and consistent column count;
- verify manifest checksums;
- verify all reported percentiles can be recomputed from raw samples;
- verify response cardinalities;
- verify Puma and Falcon controls differ only in documented server/client configuration;
- identify every benchmark claim that could not be measured and explain the blocker;
- show `git status --short` and list every created commit.

## Final Response

Return a concise index of:

1. branches/commits inspected;
2. benchmark commits created;
3. commands used;
4. artifact directory;
5. completed and omitted matrix cells;
6. measurement failures or validity warnings;
7. direct links/paths to `FACTS.md`, raw CSVs, and representative traces.

Do not summarize the architectural lesson. The human author will do that after reviewing the evidence.

