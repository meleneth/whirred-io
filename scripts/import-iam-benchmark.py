#!/usr/bin/env python3
"""Publish selected complete-walk benchmark samples from an IAM collection."""

import argparse
import csv
import json
import re
import statistics
from collections import Counter, defaultdict
from pathlib import Path


def outcome(row):
    if "outcome" in row:
        return row["outcome"]
    note = row.get("notes", "")
    match = re.search(r"outcome=([^ ]+)", note)
    return match.group(1) if match else ("ok" if row.get("http_code") == "200" else "unknown")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("collection", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    collection = args.collection.resolve()
    metadata = json.loads((collection / "collection.json").read_text())
    status = json.loads((collection / "collection_status.json").read_text())
    groups = defaultdict(list)

    for path in sorted(collection.glob("*/attempt-001/timings.csv")):
        case = path.parent.parent.name
        if case.startswith("smoke-"):
            continue
        with path.open(newline="") as source:
            for row in csv.DictReader(source):
                label = row.get("label", row.get("case", ""))
                if case.startswith("hierarchies-"):
                    pass
                elif label.startswith("graphql_") and "_fanout_full_walk_" in label:
                    label = re.sub(r"_[123]$", "", label)
                elif re.fullmatch(r"organization_user_management_partition_[123]_full_walk", label):
                    label = "organization_user_management_partition_full_walk"
                elif label.startswith("graphql_dense_"):
                    label = "graphql_dense"
                else:
                    continue
                phase = row["phase"]
                if phase == "warm_prime":
                    continue
                mode = row.get("mode", row.get("retrieval_mode"))
                groups[(case, label, phase, mode)].append(row)

    result = {
        "collection": str(Path("reports/raw") / collection.name),
        "revision": metadata["revision"],
        "matrix_sha256": metadata["matrix_sha256"],
        "manifest_sha256": metadata["manifest_sha256"],
        "stack": metadata["stack"],
        "started_at": metadata["started_at"],
        "completed_cases": status["completed_cases"],
        "failed_cases": status["failed_cases"],
        "units": "seconds; client elapsed time; complete walks sum HTTP request times",
        "groups": [],
    }
    for (case, label, phase, mode), rows in sorted(groups.items()):
        values = [float(row.get("duration_seconds", row.get("time_total"))) for row in rows]
        item = {
            "case": case,
            "collector_case_passed": case not in status["failed_cases"],
            "label": label,
            "phase": phase,
            "mode": mode,
            "n": len(values),
            "median": statistics.median(values),
            "minimum": min(values),
            "maximum": max(values),
            "outcomes": dict(Counter(outcome(row) for row in rows)),
        }
        if "request_count" in rows[0]:
            item["requests"] = sorted({int(row["request_count"]) for row in rows})
        result["groups"].append(item)

    args.output.write_text(json.dumps(result, indent=2) + "\n")


if __name__ == "__main__":
    main()
