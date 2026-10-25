# IAM trace gallery

The gallery publishes **ten complete Jaeger workload traces** as JSON, plus SVG previews. A workload can include several HTTP requests. The gallery page shows static previews; the interactive browser fetches one selected JSON trace at a time. Large authorization workloads remain source evidence for written observations and are not imported into the live browser.

Reimport from the local evidence repository and regenerate SVG previews:

```sh
python3 scripts/import-iam-traces.py ~/code/iam-system-demo
node scripts/render-trace-previews.mjs
node --test tests/trace-model.test.mjs
npm run docs:build
```

The importer uses `article-traces-20260924T213536Z`, collected from clean revision `4e00444` on the production stack. The source collection and request outcomes are recorded in each manifest entry. These September 24 requests are examples for inspecting call structure; the September 17 benchmark measurements are published separately.

To regenerate the public benchmark summary from the September 17 raw collection:

```sh
python3 scripts/import-iam-benchmark.py ~/code/iam-system-demo/reports/raw/article-20260917T075552Z docs/public/traces/iam/benchmark-summary.json
```

The summary includes complete-walk response times and hierarchy comparisons, plus failed-case status. It excludes smoke samples, page-level duplicates, and warmup requests. See the results page for the distinction between request success and trace archival success.

Each published source must be under 3.5 MB, each compact JSON output under 2 MB, and the combined JSON under 6 MB. The larger traces include the shared resource/model authorization boundaries. All spans in a chosen request are retained, with original tags, logs, references, warnings, and process metadata. The importer removes JSON whitespace only. The manifest records source and output hashes. The SVG renderer shows every recorded span nested beneath its parent, with siblings in start order. No span-kind filtering is applied.

HTTP client spans cover direct Net::HTTP, Faraday, and ActiveResource calls, with API server spans and executed application SQL beneath them. Schema and setup queries, query-cache hits, controller/action, connect-only, serialization, materialization, and application-cache spans were excluded at the source. Named workload and authorization spans and Redis pipelines remain. ActiveRecord's per-request query cache stayed enabled; Solid Cache was removed. The earlier September 12 collection retained controller spans despite a README claim to the contrary; September 13 collections are superseded.

The browser is at `graphql-auth-explosion-trace-browser` in the IAM series. Its `trace` query parameter selects a manifest ID and `span` selects a span ID. It accepts no arbitrary remote URL. It renders the complete parent/child waterfall and exposes SQL statements, tags, logs, references, warnings, and process metadata. Jaeger timestamps and durations are microseconds. A span envelope is not the client HTTP elapsed time.

Two workload warmup passes preceded each profile's measurements. The importer verifies identical Puma PID/start-tick snapshots before warmup, after warmup, and after measurement. Cold Redis samples clear only Redis DB 1; Rails and PostgreSQL were not restarted. All 20 PostgreSQL instances retained their process identities and all ten seed workers remained stopped. Client elapsed times and HTTP outcomes are in the manifest.

The archived full-capabilities wide request ended with an empty HTTP reply (curl 52) after 89.648262 seconds. Its complete trace has 84,519 spans. The complete published `/can` request succeeded and exposes the set-oriented authorization work, including the new shared model/resource boundaries. This is a structural comparison, not a successful full-request latency comparison; the trace does not establish why the capabilities connection closed. The selected successful responses passed exact fixture checks. The full pagination walk was not rerun.

HTTP display labels preserve descriptive operation names and append recorded method/path tags; raw operation names and export hashes remain intact. Selecting a SQL span displays its full `db.statement`. SVG previews use the same labels as the browser.
