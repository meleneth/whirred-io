# IAM trace gallery

The site serves curated Jaeger exports and clearly labeled complete subtree excerpts as static files. It fetches one
trace when its gallery waterfall approaches the viewport, or when the standalone viewer opens.

Reimport from the local evidence repository and regenerate SVG previews:

```sh
python3 scripts/import-iam-traces.py ~/code/iam-system-demo
node scripts/render-trace-previews.mjs
node --test tests/trace-model.test.mjs
npm run docs:build
```

The importer selects `article-traces-20260913T094922Z`, collected from committed
revision `232d52d` after rebuilding the service images. Published JSON totals 1,809,282 bytes.
HTTP client spans cover direct Net::HTTP, Faraday, and ActiveResource calls, with API
server spans and executed application SQL beneath them. Schema/setup queries, query-cache
hits, controller/action, connect-only phases, serialization, and materialization spans are
excluded at the source. Redis commands/pipelines and application cache operations remain.
ActiveRecord per-request query caching remains enabled; Solid Cache is removed.
The previous September 12 collection retained controller spans; the original README claim
that it omitted them was incorrect. Earlier September 13 collections are superseded.
Whole-trace sources must be under 1.5 MB. Four explicitly named authorization
examples permit larger sources (under 180 MB) and extract a chosen root with every
CHILD_OF descendant. Original span objects and root parent references are retained;
ancestors, siblings, and unused process entries are omitted. Every published JSON
file must remain under 1 MB. The manifest includes source and output hashes. The regression
check keeps the combined published trace JSON below 4 MB. Changing the selection
also requires reselecting authorization root span IDs from the new exports and updating the gallery's captions, byte totals, and comparisons.

Gallery waterfalls use indentation instead of depth numbers. Both interactive waterfalls and downloadable SVGs show every recorded span beneath its parent, with siblings in chronological order. No span-kind filtering is applied. The interactive
viewer renders all spans as a parent/child waterfall and keeps all original tags,
logs, references, warnings, and process metadata available. Times are interpreted
as Jaeger microseconds. Individual span envelopes are not benchmark HTTP totals.

The viewer lives on `graphql-auth-explosion-trace-browser` in the IAM series.
Its `trace` query parameter selects a manifest ID; `span` selects an exported span
ID. Unknown trace IDs produce a recoverable error. No arbitrary remote URLs are
fetched and no server or external tracing service is required.

Two workload warmup passes precede each profile's measurements. The importer verifies
identical Puma PID/start-tick snapshots before warmup, after warmup, and after measurement.
Cold Redis samples clear only Redis DB 1, without restarting Rails or PostgreSQL. All
20 PostgreSQL instances retained their original process identities; all ten seed workers
remained stopped. Client elapsed times and HTTP outcomes are included in both manifests.

The serial capabilities request completed. The wide capabilities request still returned
an empty reply (curl 52) after warming; the viewer labels it as failed. Its selected
19-account group-membership authorization subtree completed, with 19 hierarchy and 19
membership HTTP requests versus one of each under `/can`. Both excerpts authorize the
same GroupUser lookup. Single-record excerpts now identify the same account through
`scope.id`. Selected subtree durations remain separate from enclosing client elapsed time.
The manifest's source-working-tree flag reflects the archived tracked patch; runtime code
was committed before building, while unrelated untracked reports remained in the repo.
The historical September 10 benchmark matrix is unchanged.

HTTP display labels are derived from recorded method/path tags; raw operation names,
queries, span objects, and export hashes remain intact. Selecting a SQL span displays its
full `db.statement`. SVG previews use the same endpoint labels as the interactive viewer.
