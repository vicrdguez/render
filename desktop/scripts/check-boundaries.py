#!/usr/bin/env python3
"""Check that desktop path dependencies and bundled design inputs remain isolated."""
import json
import subprocess
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
metadata = json.loads(subprocess.check_output([
    "cargo", "metadata", "--manifest-path", str(root / "Cargo.toml"),
    "--no-deps", "--format-version", "1",
], text=True))
errors = []
for package in metadata["packages"]:
    manifest = Path(package["manifest_path"]).resolve()
    if not manifest.is_relative_to(root):
        errors.append(f"workspace member outside desktop: {manifest}")
    for dependency in package["dependencies"]:
        if dependency.get("path") and not Path(dependency["path"]).resolve().is_relative_to(root):
            errors.append(f"{package['name']} imports external project source: {dependency['path']}")
        if package["name"] == "render-core" and dependency["name"] in {"rune", "rune-kit", "rune-mermaid", "reqwest", "ureq", "render-host", "render-desktop"}:
            errors.append(f"core depends on UI or transport: {dependency['name']}")
        if package["name"] == "render-host" and dependency["name"] in {"rune", "render-desktop"}:
            errors.append(f"host adapter depends on UI: {dependency['name']}")
for name in ["keymap.toml", "ember-tokens.json"]:
    source = root.parent / "docs" / "ui" / name
    if source.exists() and source.read_bytes() != (root / "assets" / "design" / name).read_bytes():
        errors.append(f"bundled design input differs from accepted source: {name}")
if errors:
    print("\n".join(errors), file=sys.stderr)
    raise SystemExit(1)
print(f"Desktop boundaries and design inputs passed for {len(metadata['packages'])} workspace crates.")
