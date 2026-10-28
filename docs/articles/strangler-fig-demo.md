# Replacing a Python Service with Go, One Request at a Time

A rewrite can return the same JSON and still do the wrong thing. A read might come from stale data. A write might happen twice. A shadow request might quietly mutate the database. Those are the failure modes I wanted to make visible in my [strangler fig demo](https://github.com/meleneth/strangler-fig-demo): a small Python service, a Go replacement, and a gateway that can move traffic between them while checking the effects of each step.

The application is intentionally small. Both services expose `GET /items` and `POST /items` against one Postgres table. That makes the migration mechanism, rather than business complexity, the thing to study. The generated project is self-contained: after generation, its Compose files, applications, scripts, and verifier run without the generator.

## Put the decision at the edge

```mermaid
flowchart LR
  Client --> Envoy
  Envoy -->|authoritative request| Python[Python legacy]
  Envoy -->|authoritative request| Go[Go candidate]
  Envoy -.->|shadow copy of legacy request| Go
  Python --> Postgres
  Go -->|authoritative writes only| Postgres
  Envoy --> OTel[OpenTelemetry collector]
  Python --> OTel
  Go --> OTel
  OTel --> Jaeger
```

Envoy selects the authoritative service using weighted clusters. A second, independent runtime setting controls what fraction of requests served by Python are also mirrored to Go. The client receives only the authoritative response. Envoy discards the mirror response. Candidate-authoritative requests are not mirrored back to candidate.

The gateway removes caller-supplied `X-Mobilis-Shadow` and mirror-target headers. Only its mirrored copy gets the shadow marker; backend HTTP ports are not published to the host. This is a trust boundary for the local Compose network, not a general authentication design. The [Envoy route](https://github.com/meleneth/strangler-fig-demo/blob/main/gateway/envoy.yaml) defines both the routing weights and the mirror policy.

## The candidate computes before it decides to commit

The Go handler parses and validates an item, then constructs an insert effect from the accepted values. It uses that same effect for the database operation and for telemetry. The shadow marker changes only the final commitment step: a mirrored request records its intended insert and skips the database call; an authoritative request commits and records the applied effect. There is no separate shadow implementation of the business rule in [the Go handler](https://github.com/meleneth/strangler-fig-demo/blob/main/candidate/internal/app/routes.go).

That distinction matters for writes. Sending two ordinary writes to a shared database would create duplicate effects, while comparing only the two HTTP responses would miss that error. The verifier checks a fresh insert against the response, the SQL and its bindings, the Postgres row and audit record, and the traced semantic effect. At full mirroring, it also compares the candidate's shadow intent to the authoritative effect and confirms that the shadow made no item database call.

The services share a deliberately narrow contract: valid `POST /items` requests contain exactly an integer `id` and a constrained string `name`; invalid requests return `400`, and duplicate IDs or names return `409` on authoritative writes. A shadow request does not check uniqueness, because Python may have committed the same insert by the time its mirror arrives. The demo therefore makes no claim that shadow conflict responses are equivalent.

## Different SQL, the same meaning

The frameworks make the difference visible. SQLAlchemy builds the Python query from `select(Item).order_by(Item.id)`; Go passes a literal query to pgx. These are the PostgreSQL statements produced by the current implementations for the item read:

**Python / SQLAlchemy**

```sql
SELECT items.id, items.name
FROM items ORDER BY items.id
```

**Go / pgx**

```sql
SELECT id, name FROM items ORDER BY id
```

The Python statement qualifies each column with `items`; Go does not. Both select the same two columns from the same table in ID order. The insert shows a more consequential difference. In one mirrored write from the live demo, SQLAlchemy's PostgreSQL driver statement and bindings were:

```sql
INSERT INTO items (id, name) VALUES (%(id)s::INTEGER, %(name)s::VARCHAR)
```

```json
{"id":300755834,"name":"demo_0ac61aed673b4386884057b507d15665"}
```

Go's [insert plan](https://github.com/meleneth/strangler-fig-demo/blob/90db170bb4b686060838e9d6ecc8e008204af72c/candidate/internal/app/items.go) produced the same write intent for the mirrored request, using positional arguments:

```sql
INSERT INTO items (id, name) VALUES ($1, $2)
```

```json
[300755834,"demo_0ac61aed673b4386884057b507d15665"]
```

The proof is in the bindings, not a string comparison. The [Python adapter](https://github.com/meleneth/strangler-fig-demo/blob/90db170bb4b686060838e9d6ecc8e008204af72c/legacy/src/service_legacy/items.py) records the actual driver statement and parameters after execution. Go records the exact statement and arguments passed to pgx; this shadow write recorded the same insert plan with `executed = false` and made no database call. In a later candidate-authoritative write, Go executed `INSERT INTO items (id, name) VALUES ($1, $2)` with bindings `[1070957264,"demo_d946d302e39f4131b20e6a1c1cf40bbb"]`.

We hand-implemented [`sql_meaning()`](https://github.com/meleneth/strangler-fig-demo/blob/90db170bb4b686060838e9d6ecc8e008204af72c/legacy/demo/sql_meaning.py#L27-L102) for this one-table contract. [SQLGlot](https://github.com/meleneth/strangler-fig-demo/blob/90db170bb4b686060838e9d6ecc8e008204af72c/legacy/demo/requirements.txt#L1) parses PostgreSQL into syntax trees and provides identifier normalization and schema qualification. Our function substitutes the captured named or positional bindings, handles the permitted qualification and casts, rejects unsupported forms, and produces comparable read and insert meanings. The verifier then compares those results with the expected query or item values. This is custom verification built on SQLGlot's parser, not equivalence supplied by the library.

The [live verifier](https://github.com/meleneth/strangler-fig-demo/blob/90db170bb4b686060838e9d6ecc8e008204af72c/legacy/demo/operations.py#L268-L288) also checks the independently instrumented database span against the recorded SQL meaning, the ordered read result against Postgres, and exactly one audited insert by the authoritative service. It rejects missing or extra application queries, changed projections, filters, ordering, limits, target tables, or bindings. The [regression tests](https://github.com/meleneth/strangler-fig-demo/blob/90db170bb4b686060838e9d6ecc8e008204af72c/legacy/demo/test_operations.py#L90-L117) deliberately introduce those drifts. This is a bounded check for one item contract, not a general proof that two arbitrary SQL programs are equivalent.

## Move authority in measured steps

Running `./demo` starts the selected Compose environment, resets the demo table, and executes this progression. The two numbers passed to `./migration` are **mirror percentage** and **candidate authority percentage**, in that order.

| Stage | Command | What it exercises |
| --- | --- | --- |
| Observe | `./migration 100 0` | Python serves every response; every eligible request is mirrored to Go. |
| Small cutover | `./migration 100 10` | Go serves about 10% of public requests; Python requests are still mirrored. |
| Wider cutover | `./migration 100 50` | Both implementations serve authoritative requests. |
| Complete cutover | `./migration 0 100` | Go serves everything, with no mirrors. |

Each stage runs `./exercise` and `./verify`. The exercise performs a health check, reads items, writes through the gateway, and reads again. The verifier makes its own correlated requests and examines the actual running services. The public weighted split is random; an internal verification listener walks all 100 selection buckets so the authority check does not depend on a lucky sample. The runtime settings are in memory, so restarting Envoy requires reapplying `./migration`.

The outage checks are useful too. At `100/0`, the verifier stops the Go candidate and confirms that Python still serves reads and writes, then restores the same candidate deployment and verifies mirroring again. At `0/100`, it stops the legacy HTTP server while checking Go. These are direct checks of the two endpoints of the rollout, rather than an assumption that the route configuration implies availability.

## What the evidence can and cannot say

The [current verifier](https://github.com/meleneth/strangler-fig-demo/blob/90db170bb4b686060838e9d6ecc8e008204af72c/legacy/demo/operations.py#L239-L310) gives each request a trace ID, retrieves its spans from Jaeger, and checks that gateway, backend, SQL, and effect spans have the expected ancestry. It independently reads Postgres and its write audit. It also tests malformed inputs, duplicate writes, and attempts to spoof the shadow header. A passing `./verify` means these particular read, write, SQL, routing, and trace contracts held for the local workload.

It does not prove equivalence for arbitrary application behavior. The demo has one table, deterministic insert intent, no updates or deletes, no external side effects, and no concurrent migration controller. Shadow mode does not model database constraints or contention. Telemetry includes item values, which would need careful handling for sensitive data. The point of the exercise is the discipline: transfer authority only after the candidate's observed behavior and effects are good enough for the workload being moved.

The complete source and instructions are in [meleneth/strangler-fig-demo](https://github.com/meleneth/strangler-fig-demo). Start with the [README](https://github.com/meleneth/strangler-fig-demo/blob/main/README.md), then inspect the [Envoy route](https://github.com/meleneth/strangler-fig-demo/blob/main/gateway/envoy.yaml), the [Python item handler](https://github.com/meleneth/strangler-fig-demo/blob/main/legacy/src/service_legacy/routes.py), the [Go item handler](https://github.com/meleneth/strangler-fig-demo/blob/main/candidate/internal/app/routes.go), and the [verifier](https://github.com/meleneth/strangler-fig-demo/blob/main/legacy/demo/operations.py) to see how the routing and evidence fit together.
