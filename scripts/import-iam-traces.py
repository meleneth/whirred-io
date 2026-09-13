"""Import curated Jaeger exports and explicitly identified complete subtrees; run with the demo repo path."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
COLLECTION = 'article-traces-20260913T094922Z'
SOURCE = Path(sys.argv[1]).expanduser() / 'reports/raw' / COLLECTION
OUT = ROOT / 'docs/public/traces/iam'
SELECTION = [
 ('hierarchy-walk', 'Parent-by-parent · depth 5', 'hierarchies-redis-off/attempt-001/hierarchy-walk/trace.json'),
 ('hierarchy-cte', 'One hierarchy GET · depth 5', 'hierarchies-redis-off/attempt-001/hierarchy-cte/trace.json'),
 ('hierarchy-individual', 'Eight individual hierarchy GETs', 'hierarchies-redis-off/attempt-001/hierarchy-individual/trace.json'),
 ('hierarchy-batch', 'One batch POST · eight targets', 'hierarchies-redis-off/attempt-001/hierarchy-batch/trace.json'),
 ('organization-cold', 'Organization · cold Redis', 'cache-wide-can/attempt-001/organization-cold/trace.json'),
 ('organization-warm', 'Organization · warm Redis', 'cache-wide-can/attempt-001/organization-warm/trace.json'),
 ('graphql-cold', 'Deep GraphQL · cold Redis', 'graphql-cache-b1000/attempt-001/graphql-cold/trace.json'),
 ('graphql-warm', 'Deep GraphQL · warm Redis', 'graphql-cache-b1000/attempt-001/graphql-warm/trace.json'),
 ('graphql-msp', 'MSP GraphQL · warm page, batch 200', 'graphql-cache-b200/attempt-001/graphql-msp/trace.json'),
 ('authorization-record-capabilities', 'One account · full capabilities', 'retrieval-deep-serial/attempt-001/authorization-record-capabilities/trace.json', '503e35eb6690738f'),
 ('authorization-record-can', 'Same account · /can account.read', 'hierarchies-redis-off/attempt-001/authorization-record-can/trace.json', 'e5a0289e74e4b029'),
 ('authorization-collection-capabilities', '19-account group membership authorization · full capabilities', 'retrieval-wide-batched/attempt-001/authorization-collection-capabilities/trace.json', '21640c11321c4923'),
 ('authorization-collection-can', '19-account group membership authorization · /can', 'auth-wide-can/attempt-001/authorization-collection-can/trace.json', '4c164a4bd9b9da5d'),
]
INDEX = {entry['id']: entry for entry in json.loads((SOURCE / 'trace-index.json').read_text())}
COLLECTION_METADATA = json.loads((SOURCE / 'collection.json').read_text())
manifest = []
for selection in SELECTION:
 slug, title, source, *roots = selection
 path = SOURCE / source
 assert path.stat().st_size < (180_000_000 if roots else 1_500_000), f'Refusing oversized source: {source}'
 entry = INDEX[slug]
 assert entry['status'] == 'archived'
 status = json.loads(path.with_suffix('.status.json').read_text())
 assert status['status'] == 'archived'
 raw = path.read_bytes()
 data = json.loads(raw)
 assert len(data['data']) == 1
 trace = data['data'][0]
 assert trace['traceID'] == entry['trace_id']
 source_span_count = len(trace['spans'])
 result = json.loads(path.with_name('result.json').read_text())
 profile = path.parent.parent
 processes = [json.loads((profile / f'processes-{phase}.json').read_text()) for phase in ['before-warmup', 'after-warmup', 'after-measurement']]
 assert processes[0] == processes[1] == processes[2], f'Rails restarted: {slug}'
 warmups = json.loads((profile / 'warmup-results.json').read_text())
 assert len(warmups) >= 2
 assert source_span_count == status['span_count']
 if roots:
  root_id = roots[0]
  by_id = {span['spanID']: span for span in trace['spans']}
  assert root_id in by_id
  children = {}
  for span in trace['spans']:
   for ref in span.get('references', []):
    if ref['refType'] == 'CHILD_OF' and ref['traceID'] == trace['traceID']:
     children.setdefault(ref['spanID'], []).append(span['spanID'])
  included = set()
  pending = [root_id]
  while pending:
   span_id = pending.pop()
   if span_id in included:
    continue
   included.add(span_id)
   pending.extend(children.get(span_id, []))
  # Preserve original span objects, including the root's external parent reference.
  trace['spans'] = [span for span in trace['spans'] if span['spanID'] in included]
  processes = {span['processID'] for span in trace['spans']}
  trace['processes'] = {key: value for key, value in trace['processes'].items() if key in processes}
 spans = trace['spans']
 assert len({s['spanID'] for s in spans}) == len(spans)
 encoded = json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode() + b'\n'
 assert len(encoded) < 1_000_000, f'Published payload too large: {slug}'
 (OUT / (slug + '.json')).write_bytes(encoded)
 start = min(s['startTime'] for s in spans)
 end = max(s['startTime'] + s['duration'] for s in spans)
 manifest.append(dict(id=slug, title=title, file=f'/traces/iam/{slug}.json', bytes=len(encoded),
  spans=len(spans), duration=end-start, traceID=trace['traceID'], source=f'{COLLECTION}/{source}',
  kind='subtree' if roots else 'complete', rootSpanID=roots[0] if roots else None, sourceSpans=source_span_count,
  sourceRequestOutcome=entry.get('request_outcome', 'ok'), expectedFailure=entry.get('expected_failure', False),
  sourceRevision=COLLECTION_METADATA['revision'], sourceWorkingTreeDirty=bool((SOURCE / 'working-tree.patch').read_text().strip()),
  railsProcessesStable=True, warmupSamples=len(warmups), activeRecordQueryCache=True, solidCache=False,
  sourceClientElapsedSeconds=result.get('client_elapsed_seconds', result.get('duration_seconds')),
  sourceHttpStatus=result.get('http_status', 200 if result.get('outcome') == 'ok' else None),
  workingTreePatchSha256=hashlib.sha256((SOURCE / 'working-tree.patch').read_bytes()).hexdigest(),
  sourceBytes=len(raw), sourceSha256=hashlib.sha256(raw).hexdigest(), sha256=hashlib.sha256(encoded).hexdigest()))
(ROOT / 'docs/.vitepress/theme/data/iam-traces.json').write_text(json.dumps(manifest, indent=2) + '\n')
(OUT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(f'{len(manifest)} trace examples, {sum(m["bytes"] for m in manifest):,} published bytes.')
