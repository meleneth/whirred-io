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

The importer lists exact files from the September 13 UTC refresh (`article-traces-20260913T085755Z`).
Published JSON totals 911,335 bytes; each file remains under 1 MB. This collection removes controller/action,
HTTP client/server and phase timings, Rack response lifecycle, serialization, and materialization spans at the source.
SQL, Redis commands/pipelines, application cache operations, authorization computations, and GraphQL operations remain.
The previous September 12 collection still included controller spans; the earlier README claim that it omitted them was incorrect.
Cross-service propagation uses context-only Rack and Net::HTTP helpers. Multiple spans may share the external initiating parent.
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

The serial capabilities workload completed successfully. The wide capabilities workload returned an empty HTTP reply
(curl 52); its selected 19-account group-membership authorization subtree completed without a recorded exception.
The matching `/can` excerpt is also rooted at `GroupUser.collection.authorize` and checks 19 scopes. It contains one
permission computation and one ancestry/membership lookup; the capabilities excerpt contains 19 of each.
Single-account excerpts come from different workloads and do not establish identical account identity because those
spans omit account IDs. The viewer labels the wide request failure. All ten seed workers were stopped and all five
queues were empty before collection. The manifest records the base revision and complete working-tree patch hash;
new helper files are included in that patch. Earlier benchmark timings are unchanged.
