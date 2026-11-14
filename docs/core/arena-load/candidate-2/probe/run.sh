#!/usr/bin/env bash
set -euo pipefail
out=/tmp/arena-load/candidate-2/probe
repo=/Users/vr-osxs/dev/render-core
checkout="$out/checkout"
cleanup() {
  if [ -d "$checkout" ]; then
    git -C "$repo" worktree remove --force "$checkout"
  fi
}
trap cleanup EXIT
cd "$repo"
git fetch origin
git worktree add --detach "$checkout" origin/render-core
cd "$checkout"
printf 'commit: '; git rev-parse HEAD
/nix/var/nix/profiles/default/bin/nix develop -c typecheck | tee "$out/setup.log"
/nix/var/nix/profiles/default/bin/nix develop -c node "$out/registry.mjs" "$checkout" | tee "$out/registry.log"
/nix/var/nix/profiles/default/bin/nix develop -c node "$out/inventory.mjs" "$checkout" | tee "$out/inventory.log"
/nix/var/nix/profiles/default/bin/nix develop -c env test > "$out/baseline-tests.log" 2>&1
printf '\ncheckout source status before removal:\n'
git status --short
