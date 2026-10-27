"""Import complete curated Jaeger exports; run with the demo repo path."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
COLLECTION = 'msp10-all-users-single-scope-capabilities-vs-can-20261025'
SOURCE = Path(sys.argv[1]).expanduser() / 'reports/raw' / COLLECTION
OUT = ROOT / 'docs/public/traces/iam'
MAX_SOURCE_BYTES = 3_500_000
MAX_PUBLISHED_BYTES = 2_000_000
SELECTION = [
 ('msp10-all-users-slow', 'MSP all users · serial retrieval and full capabilities', 'msp10-all-users-slow/attempt-001/msp10-all-users-slow/trace.json'),
 ('msp10-all-users-fast-cold', 'MSP all users · batched retrieval and targeted authorization', 'msp10-all-users-fast-cold/attempt-001/msp10-all-users-fast-cold/trace.json'),
]
INDEX = {entry['id']: entry for entry in json.loads((SOURCE / 'trace-index.json').read_text())}
COLLECTION_METADATA = json.loads((SOURCE / 'collection.json').read_text())
manifest = []
for selection in SELECTION:
 slug, title, source = selection
 path = SOURCE / source
 assert path.stat().st_size < MAX_SOURCE_BYTES, f'Refusing oversized source: {source}'
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
 spans = trace['spans']
 assert len({s['spanID'] for s in spans}) == len(spans)
 encoded = json.dumps(data, separators=(',', ':'), ensure_ascii=False).encode() + b'\n'
 assert len(encoded) < MAX_PUBLISHED_BYTES, f'Published payload too large: {slug}'
 (OUT / (slug + '.json')).write_bytes(encoded)
 start = min(s['startTime'] for s in spans)
 end = max(s['startTime'] + s['duration'] for s in spans)
 manifest.append(dict(id=slug, title=title, file=f'/traces/iam/{slug}.json', bytes=len(encoded),
  spans=len(spans), duration=end-start, traceID=trace['traceID'],
  source=f'{COLLECTION}/{source}', kind='complete', rootSpanID=entry['parent_id'], sourceSpans=source_span_count,
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
