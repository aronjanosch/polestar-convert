#!/usr/bin/env bash
# Playtest a pack one guide per process, several at a time: the same plays as
# `polestar playtest <pack>`, in a fraction of the time on a multi-core machine.
#
# Usage: tools/playtest-parallel.sh <pack dir> [--polestar <clone>] [--jobs N]
# Prints every play that is not ok and a summary; exit 1 when any is stuck or failed.

set -euo pipefail

pack=""
polestar="${POLESTAR:-./polestar}"
jobs=$(( $(nproc) * 5 / 8 ))
while [ $# -gt 0 ]; do
	case "$1" in
		--polestar) polestar="$2"; shift 2 ;;
		--jobs) jobs="$2"; shift 2 ;;
		*) pack="$1"; shift ;;
	esac
done
if [ -z "$pack" ] || [ ! -f "$pack/pack.json" ]; then
	echo "usage: tools/playtest-parallel.sh <pack dir> [--polestar <clone>] [--jobs N]" >&2
	exit 2
fi
pack="$(cd "$pack" && pwd)"
out="$(mktemp -d)"
trap 'rm -rf "$out"' EXIT

cd "$polestar"
ls "$pack/guides" | grep '\.guide$' | sed 's/\.guide$//' \
	| xargs -P "$jobs" -I{} sh -c 'node tools/polestar.js playtest "$0" --filter "/$2.guide" > "$1/$2.txt" 2>&1 || true' "$pack" "$out" {}

cat "$out"/*.txt | grep -vE '^(ok |playtest ok)' || true
plays=$(cat "$out"/*.txt | grep -c '^ok ' || true)
bad=$(cat "$out"/*.txt | grep -cE '^(stuck|fail) ' || true)
echo "parallel playtest: $(ls "$out" | wc -l) guides, $((plays + bad)) plays, $bad stuck or failed"
[ "$bad" -eq 0 ]
