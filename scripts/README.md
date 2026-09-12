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

The importer deliberately lists exact files from the September 12 UTC refresh (`article-traces-20260912T001449Z`).
Published JSON totals 2.67 MB; each file remains under 1 MB. The refresh retains Rack response completion but omits the previous controller, Thruster, and Puma phase spans.
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

Both capabilities excerpts come from enclosing requests that failed with an empty HTTP reply (curl exit 52); their selected roots recorded HTTP 200. Only the collection-capabilities failure was expected; the single-record source is listed as a collection failure. The manifest records both outcomes and the viewer labels both failures. The refresh was collected at revision `a11a5c7765a835566015e7f7fcf8b369a8cf8a0b` with an untracked report (`reports/showcase-trace-refresh-2026-09-11.md`); the working tree is marked dirty and the empty tracked-file patch hash is retained. Earlier benchmark timings are unchanged.
