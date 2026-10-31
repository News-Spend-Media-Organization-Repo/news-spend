#!/bin/bash
# Publish an OTA update with its sourcemaps uploaded to Sentry.
#
# Usage: bun run ota:publish <preview|production> "<message>"
#
# Exports once, uploads that export's maps, then publishes the same export with
# --skip-bundler. Letting `eas update` bundle on its own would produce a bundle
# whose Metro debug IDs were never uploaded, which is why OTA errors in Sentry
# showed raw main.jsbundle offsets.
#
# Run from a clean checkout on Node 24 (the default Node cannot load app.config).
# Needs SENTRY_AUTH_TOKEN in the environment; SENTRY_URL too if the org's region
# host differs from the app.json default.

set -euo pipefail

branch="${1:-}"
message="${2:-}"

case "$branch" in
  preview | production) ;;
  *)
    echo "Usage: $0 <preview|production> \"<message>\"" >&2
    exit 1
    ;;
esac

if [ -z "$message" ]; then
  echo "An update message is required." >&2
  exit 1
fi

if [ -z "${SENTRY_AUTH_TOKEN:-}" ]; then
  echo "SENTRY_AUTH_TOKEN is not set; the update would ship without sourcemaps." >&2
  exit 1
fi

cd "$(dirname "$0")/.."

eas env:exec "$branch" "bash scripts/ota-export.sh"

# The uploader exits 0 even when it finds nothing to upload, so read its output.
upload_log="$(mktemp)"
SENTRY_ORG="${SENTRY_ORG:-news-spend-media}" \
  SENTRY_PROJECT="${SENTRY_PROJECT:-news-spend-media}" \
  npx sentry-expo-upload-sourcemaps dist 2>&1 | tee "$upload_log"

if grep -q "Uploaded 0 of" "$upload_log" || ! grep -q "Uploaded bundles and sourcemaps to Sentry successfully" "$upload_log"; then
  echo "Sourcemaps were not uploaded; not publishing." >&2
  exit 1
fi

eas update --branch "$branch" --environment "$branch" --platform all \
  --skip-bundler -m "$message" --non-interactive
