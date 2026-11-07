#!/usr/bin/env python3
"""Check native rune trees against the fixed frame dimensions in the UI spec."""
import argparse
import json
import math
from pathlib import Path


def check(path):
    tree = json.loads(path.read_text())
    width, height = tree["viewport"]
    elements = tree["elements"]
    errors = []

    def element(key):
        matches = [item for item in elements if item.get("key") == key]
        if len(matches) != 1:
            errors.append(f"{key} must occur once, found {len(matches)}")
            return None
        return matches[0]

    def box(key, expected):
        item = element(key)
        if item and any(abs(a - b) > 1 for a, b in zip(item["rect"], expected)):
            errors.append(f"{key} has {item['rect']}, expected {expected}")

    box("frame.tabs", [0, 0, width, 36])
    box("frame.status", [0, height - 52, width, 26])
    box("frame.echo", [0, height - 26, width, 26])
    tracks = [item for item in elements if item.get("key") == "frame.track"]
    if tracks:
        box("frame.track", [0, 36, width, 40])
    columns = [item for item in elements if item.get("key") == "content.main"]
    if tracks and columns:
        if width >= 1264:
            text_x = math.floor(0.6 * (width - 1224)) + 264
        elif width >= 1180:
            text_x = 288 - max(0, 1184 - width)
        else:
            text_x = (width - 600) / 2
        for column in columns:
            if abs(column["rect"][0] - text_x) > 1 or abs(column["rect"][2] - 600) > 1:
                errors.append(f"text axis has {column['rect']}, expected x={text_x}, width=600")
    for title in (item for item in elements if item.get("key") == "brief.title"):
        if abs(title["rect"][0] - (48 if width >= 1180 else 44)) > 1 or abs(title["rect"][1] - 58) > 1:
            errors.append(f"Brief title violates its stage origin: {title['rect']}")
    stage = element("frame.stage")
    if stage:
        x, y, w, h = stage["rect"]
        if abs(x) > 1 or abs(w - width) > 1 or y < (76 if tracks else 36) - 1 or y + h > height - 51:
            errors.append(f"stage overlaps chrome or has wrong width: {stage['rect']}")
    for item in elements:
        if not all(math.isfinite(n) for n in item["rect"]):
            errors.append(f"non-finite layout: {item.get('key', item['path'])}")
    for item in (e for e in elements if e.get("key") == "frame.float"):
        x, y, w, h = item["rect"]
        if abs(x) > 1 or abs(w - width) > 1 or abs(y + h - (height - 52)) > 1 or h > height * 0.4 + 1:
            errors.append(f"float violates docking or 40 percent limit: {item['rect']}")
    if tree.get("warnings"):
        errors.append(f"native key warnings: {tree['warnings']}")
    texts = [e.get("text", "") for e in elements]
    if not any(texts):
        errors.append("native tree contains no text")
    return {"file": str(path), "viewport": [width, height], "elements": len(elements), "errors": errors}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("trees", nargs="+", type=Path)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    results = [check(path) for path in args.trees]
    report = json.dumps(results, indent=2)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(report + "\n")
    print(report)
    return int(any(result["errors"] for result in results))


if __name__ == "__main__":
    raise SystemExit(main())
