#!/usr/bin/env bash
# After Claude edits a .ts/.tsx file: run typecheck + tests of the package that file belongs to.
# Silent on success. On failure, exit 2 sends the output back to Claude.
set -uo pipefail

file=$(jq -r '.tool_input.file_path // empty')
[[ "$file" =~ \.(ts|tsx)$ ]] || exit 0

dir=$(dirname "$file")
while [[ "$dir" != "/" && ! -f "$dir/package.json" ]]; do dir=$(dirname "$dir"); done
[[ -f "$dir/package.json" ]] || exit 0
cd "$dir"

for script in typecheck test; do
  jq -e ".scripts.$script" package.json >/dev/null || continue
  if ! out=$(bun run "$script" 2>&1); then
    echo "[$script failed in $dir]" >&2
    echo "$out" | tail -40 >&2
    exit 2
  fi
done
exit 0
