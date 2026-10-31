#!/bin/bash
# Runs inside `eas env:exec <environment>` (see publish-ota.sh), so the
# EXPO_PUBLIC_* values of that EAS environment are in scope for the bundle.

set -euo pipefail

if [ -z "${EXPO_PUBLIC_API_URL:-}" ]; then
  echo "EXPO_PUBLIC_API_URL is empty in this EAS environment; refusing to export a bundle that 404s." >&2
  exit 1
fi

rm -rf dist
npx expo export --platform ios --platform android --source-maps

# The URL is inlined at export time, so a bundle built without it would still
# export cleanly. Look for it in the Hermes bytecode before anything is uploaded.
if ! grep -raqF "$EXPO_PUBLIC_API_URL" dist/_expo/static/js; then
  echo "Exported bundle does not contain $EXPO_PUBLIC_API_URL; not publishing." >&2
  exit 1
fi
