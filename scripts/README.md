# IAM trace gallery

The gallery publishes **two complete Jaeger workload traces** as JSON, plus SVG previews. A workload can include several HTTP requests. The gallery page shows static previews; the interactive browser fetches one selected JSON trace at a time. Larger historical authorization workloads remain source evidence for written observations and are not imported into the live browser.

Reimport from the local evidence repository and regenerate SVG previews:

```sh
python3 scripts/import-iam-traces.py ~/code/iam-system-demo
node scripts/render-trace-previews.mjs
node --test tests/trace-model.test.mjs
npm run docs:build
```

The importer uses `msp10-all-users-single-scope-capabilities-vs-can-20261025`, collected from revision `d72408d854fd33055678c66b59b393cb235dfb33` on the production stack. The source collection and request outcomes are recorded in each manifest entry. These October 25 requests show the corrected single-scope serial/full-capabilities/no-cache and batched/targeted/cold-cache execution shapes; the September 17 repeated benchmark measurements are published separately.

To regenerate the public benchmark summary from the September 17 raw collection:

```sh
python3 scripts/import-iam-benchmark.py ~/code/iam-system-demo/reports/raw/article-20260917T075552Z docs/public/traces/iam/benchmark-summary.json
```

The summary includes complete-walk response times and hierarchy comparisons, plus failed-case status. It excludes smoke samples, page-level duplicates, and warmup requests. See the results page for the distinction between request success and trace archival success.

Each published source must be under 3.5 MB and each compact JSON output under 2 MB. All spans in a chosen exported trace are retained, with original tags, logs, references, warnings, and process metadata. The importer removes JSON whitespace only. The manifest records source and output hashes. The SVG renderer shows every recorded span nested beneath its parent, with siblings in start order. No span-kind filtering is applied.

The current collection propagates Net::HTTP trace context without emitting outbound client spans. Receiving API server spans remain connected to the caller's active request, DataLoader batch, or retained authorization boundary, with executed application SQL beneath them. Schema and setup queries, query-cache hits, controller/action, connect-only, serialization, materialization, generic authorized-resource, GraphQL lifecycle, and application-cache spans were excluded at the source. Named workload and authorization-boundary spans and Redis pipelines remain. ActiveRecord's per-request query cache stayed enabled; Solid Cache was removed.

The browser is at `graphql-auth-explosion-trace-browser` in the IAM series. Its `trace` query parameter selects a manifest ID and `span` selects a span ID. It accepts no arbitrary remote URL. It renders the complete parent/child waterfall and exposes SQL statements, tags, logs, references, warnings, and process metadata. Jaeger timestamps and durations are microseconds. A span envelope is not the client HTTP elapsed time.

Two workload warmup passes preceded each profile's measurements. The importer verifies identical Puma PID/start-tick snapshots before warmup, after warmup, and after measurement. Cold Redis samples clear only Redis DB 1; Rails and PostgreSQL were not restarted. All 20 PostgreSQL instances retained their process identities and all ten seed workers remained stopped. Client elapsed times and HTTP outcomes are in the manifest.

Both published requests succeeded and passed exact deterministic fixture checks. Their request and response files are byte-identical. The pair is a structural comparison and a pair of single-request latency observations, not a repeated latency benchmark or an isolation of any one optimization. The full pagination walk was not rerun.

HTTP display labels preserve descriptive operation names and append recorded method/path tags; raw operation names and export hashes remain intact. Selecting a SQL span displays its full `db.statement`. SVG previews use the same labels as the browser.
