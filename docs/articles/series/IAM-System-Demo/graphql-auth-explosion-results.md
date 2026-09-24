# GraphQL Auth Explosion: Measured Results

Series: [GraphQL Auth Explosion Case Study](./iam-system-demo)

The September 17, 2026 production benchmark measured the full 17-case matrix on revision `21f58d0`. Twelve cases passed all collector checks. Three cases failed at the HTTP request, and two returned valid responses but failed because some Jaeger traces were incomplete. The tables below distinguish those outcomes; this is **not a fully passing benchmark matrix**.

The clearest completed comparisons are at the service boundaries: a depth-25 hierarchy took 0.792s through 25 parent requests versus 0.114s in one CTE request; the deep Organization walk took 23.673s with serial retrieval versus 2.076s batched. For the largest GraphQL fanout, the observed median was 244.037s with Redis disabled and 37.395s with warm Redis, but that case failed trace archival.

All times below are client elapsed seconds, shown as **median [minimum–maximum]** for three measured samples. Ratios compare medians of completed requests. Paginated totals sum HTTP request times across the whole walk, excluding pauses, warmups, and trace export. Redis-on “cold” means a Redis flush before the measured workload; “warm” follows a priming workload. PostgreSQL buffers and processes were not reset.

## Hierarchy traversal and smart APIs

With Redis disabled and actor authorization enabled, the recursive CTE kept a depth-25 traversal inside Account Service instead of making 25 client requests.

| Depth | Parent-by-parent GET | Hierarchy GET / CTE | Ratio | Client requests |
| --- | ---: | ---: | ---: | --- |
| 1 | 0.050 [0.044–0.061] | 0.095 [0.091–0.118] | 0.5× | 1 → 1 |
| 5 | 0.181 [0.172–0.200] | 0.097 [0.080–0.101] | 1.9× | 5 → 1 |
| 10 | 0.326 [0.311–0.362] | 0.087 [0.072–0.134] | 3.7× | 10 → 1 |
| 25 | 0.792 [0.786–0.792] | 0.114 [0.091–0.185] | 6.9× | 25 → 1 |

The depth-1 CTE request was slower. The advantage grew as the HTTP walk gained more steps. Both paths returned equivalent IDs and parent links. Batching multiple hierarchy targets removed another client-side loop:

| Target set | Individual hierarchy GETs | One batch POST | Ratio | Client requests |
| --- | ---: | ---: | ---: | --- |
| Deep, 8 targets | 0.628 [0.624–0.642] | 0.114 [0.097–0.116] | 5.5× | 8 → 1 |
| Deep, 25 targets | 1.926 [1.789–1.938] | 0.114 [0.104–0.123] | 16.9× | 25 → 1 |
| Wide, 8 targets | 0.645 [0.625–0.708] | 0.094 [0.072–0.113] | 6.9× | 8 → 1 |
| Wide, 251 targets | 18.960 [18.937–22.703] | 0.402 [0.400–0.674] | 47.2× | 251 → 1 |

In a separate Redis-on comparison, the depth-25 CTE median fell from 0.086s cold to 0.011s warm. That comparison includes application cache effects and is separate from the Redis-disabled table.

## Retrieval and authorization

The deep fixture contained 25 accounts and 500 users; wide contained 251 accounts and 5,020 users; sparse contained 401 accounts and 8,020 users. The retrieval cases used capabilities authorization and Redis disabled. Both deep paths completed, while both wide capabilities paths failed. The `/can` cases used batched retrieval with Redis disabled.

| Workload | Mode | Outcome | Seconds |
| --- | --- | --- | ---: |
| Deep | Serial, capabilities | 3/3 succeeded | 23.673 [21.907–25.449] |
| Deep | Batched, capabilities | 3/3 succeeded | 2.076 [2.050–2.366] |
| Wide | Serial, capabilities | 3/3 client timeouts | 180s deadline; no response |
| Wide | Batched, capabilities | 3/3 empty HTTP replies | 42.334 [42.000–43.612] to failure |
| Wide | Batched, `/can` | 3/3 succeeded | 1.989 [1.922–2.392] |
| Sparse | Batched, capabilities | 3/3 empty HTTP replies | 94.901 [94.678–105.928] to failure |
| Sparse | Batched, `/can` | 3/3 succeeded | 4.066 [3.910–4.802] |

The completed deep comparison shows an **11.4×** lower median with batched retrieval. The wide and sparse capabilities failures cannot be used as completed latency comparisons against `/can`. All nine failing samples closed or timed out without returning an account collection. The collection did not establish the mechanism behind the empty replies. The `/can` measurements show successful requests at those sizes, subject to the [authorization semantics audit in Part 3](./graphql-auth-explosion-part-3-multiple-object-authorization).

## Application cache

Both Organization walks below used batched `/can`, batch size 1000, and complete partition walks. The dense account contained 20,000 users.

| Fixture | Cold Redis | Warm Redis | Cold/warm ratio |
| --- | ---: | ---: | ---: |
| Wide organization | 1.106 [1.078–1.417] | 0.874 [0.767–0.877] | 1.3× |
| Dense account | 3.498 [3.171–3.584] | 3.018 [2.969–3.369] | 1.2× |

These small samples show a modest cache benefit in both fixtures; they do not establish concurrency or tail-latency effects.

## GraphQL MSP scale

These multi-organization fanout walks used batched `/can` and batch size 10000. Every measured response passed the response checker and returned the expected 9,999, 49,999, or 99,999 accounts. Both cases supplying this table **failed the collector's trace completeness check**: five of 63 traces in the Redis-off case and two of 189 in the Redis-on case lacked required parent spans. The timings are valid response observations, not passed full-case results.

| Returned accounts (pages) | Redis off | Redis cold | Redis warm | Off/warm ratio |
| --- | ---: | ---: | ---: | ---: |
| 9,999 (1) | 8.732 [8.647–8.833] | 5.423 [5.369–5.745] | 2.933 [2.402–3.030] | 3.0× |
| 49,999 (5) | 79.035 [78.313–80.400] | 30.152 [28.558–30.429] | 16.051 [15.910–16.598] | 4.9× |
| 99,999 (10) | 244.037 [239.336–246.410] | 63.436 [62.003–65.890] | 37.395 [34.235–37.549] | 6.5× |

The missing Jaeger parents persisted on re-query. During each affected request, the OpenTelemetry collector logged a dropped export after Jaeger's OTLP receiver rejected a message above its 4 MiB decompressed limit. The timing match supports this as the trace gap's cause; the logs do not identify the exact missing span IDs.

## Batch boundaries

For the same 9,999-account GraphQL fanout with Redis enabled, reducing pages improved both cold and warm totals. The batch-200 and batch-1000 cases passed all collector checks; the batch-10000 case has the trace archival failure described above.

| Batch size | Pages | Cold | Warm | Collector case |
| --- | ---: | ---: | ---: | --- |
| 200 | 50 | 31.197 [30.819–34.003] | 24.956 [24.272–25.716] | Passed |
| 1000 | 10 | 13.564 [12.450–13.965] | 5.055 [5.008–5.058] | Passed |
| 10000 | 1 | 5.423 [5.369–5.745] | 2.933 [2.402–3.030] | Trace archival failed |

The observed warm total fell by 8.5× from batch 200 to 10000. The test did not measure peak memory, concurrent throughput, or the cost of much larger responses under load.

## Measurement scope and source data

The production stack ran on an AMD Ryzen 9 7940HS host with 8 cores / 16 threads and about 61 GiB RAM. The run used an existing production fixture manifest, passed both smoke cases and all 17 per-case sampled live authorization gates, and completed collection of all 17 cases. Five cases failed the full collector criteria. The gate and response checks did **not** provide an independent audit of every returned identity. Three samples per comparison do not establish tail latency or a maximum supported dataset.

The [machine-readable September 17 summary](/traces/iam/benchmark-summary.json) includes the sample groups and collector case status; the [collection status](/traces/iam/collection-status.json) lists the five failed cases. The [trace gallery](./graphql-auth-explosion-traces) uses separate September 24 requests to illustrate the refactored call structure; those samples do not replace this benchmark. The invalid September 10 dataset is superseded and should not be used for current comparisons.
