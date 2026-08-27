#!/usr/bin/env bash
# Compare or update the vendored caveman skill with the current upstream file.

set -euo pipefail

UPSTREAM_REPO="JuliusBrussee/caveman"
UPSTREAM_PATH="skills/caveman/SKILL.md"
UPSTREAM_REF="${CAVEMAN_UPSTREAM_REF:-main}"
LOCAL_FILE="skill/SKILL.md"
MODE="${1:---check}"
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

cd "$REPO_ROOT"

if [[ "$MODE" != "--check" && "$MODE" != "--apply" ]]; then
  echo "Usage: bash scripts/sync-skill.sh [--check|--apply]" >&2
  exit 2
fi

if [[ ! -f "$LOCAL_FILE" ]]; then
  echo "ERROR: $LOCAL_FILE not found." >&2
  exit 1
fi

TEMP_DIRECTORY="$(mktemp -d)"
trap 'rm -rf "$TEMP_DIRECTORY"' EXIT
UPSTREAM_FILE="$TEMP_DIRECTORY/SKILL.md"
UPSTREAM_URL="https://raw.githubusercontent.com/$UPSTREAM_REPO/$UPSTREAM_REF/$UPSTREAM_PATH"

curl --fail --silent --show-error --location "$UPSTREAM_URL" --output "$UPSTREAM_FILE"
UPSTREAM_SHA="$(
  curl --fail --silent --show-error --location \
    "https://api.github.com/repos/$UPSTREAM_REPO/commits?path=$UPSTREAM_PATH&sha=$UPSTREAM_REF&per_page=1" |
    node -e 'let input=""; process.stdin.on("data", chunk => input += chunk); process.stdin.on("end", () => process.stdout.write(JSON.parse(input)[0].sha));'
)"

if cmp --silent "$UPSTREAM_FILE" "$LOCAL_FILE"; then
  echo "Vendored skill matches upstream commit $UPSTREAM_SHA."
  exit 0
fi

if [[ "$MODE" == "--check" ]]; then
  diff --unified "$LOCAL_FILE" "$UPSTREAM_FILE" || true
  echo "Vendored skill differs from upstream commit $UPSTREAM_SHA." >&2
  exit 1
fi

cp "$UPSTREAM_FILE" "$LOCAL_FILE"
echo "Updated $LOCAL_FILE from upstream commit $UPSTREAM_SHA."
