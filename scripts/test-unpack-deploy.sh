#!/bin/bash
# Post-deploy smoke test for Unpack Edge Functions.
# Run after deploying prepare-extraction or extract-chunk.
#
# Usage:
#   ./scripts/test-unpack-deploy.sh
#
# Requires: curl, node
# Reads SUPABASE_ANON_KEY from env or .env.local

set -e

SUPABASE_URL="https://jauohzeyvmitsclnmxwg.supabase.co"
ANON_KEY="${SUPABASE_ANON_KEY:-}"

# Try to read from .env.local if not set
if [ -z "$ANON_KEY" ]; then
  if [ -f .env.local ]; then
    ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY .env.local | cut -d= -f2)
  fi
fi

if [ -z "$ANON_KEY" ]; then
  echo "ERROR: SUPABASE_ANON_KEY not found. Set it in env or .env.local"
  exit 1
fi

# Wikivoyage: reliable for server-side fetch, never blocks bots, has travel content.
TEST_URL="https://en.wikivoyage.org/wiki/Tokyo"

# Use script directory for temp files (cross-platform safe)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PREP_FILE="$SCRIPT_DIR/.tmp_prep.json"
CHUNK_REQ_FILE="$SCRIPT_DIR/.tmp_chunk_req.json"
CHUNK_FILE="$SCRIPT_DIR/.tmp_chunk.json"
trap "rm -f '$PREP_FILE' '$CHUNK_REQ_FILE' '$CHUNK_FILE'" EXIT

echo "=== Testing prepare-extraction ==="
echo "URL: $TEST_URL"
echo ""

curl -s -X POST "$SUPABASE_URL/functions/v1/prepare-extraction" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"url\": \"$TEST_URL\"}" \
  -o "$PREP_FILE"

# Parse and validate, then write chunk request
node -e "
const fs = require('fs');
const path = require('path');
const prepFile = path.resolve(process.argv[1]);
const chunkReqFile = path.resolve(process.argv[2]);
const d = JSON.parse(fs.readFileSync(prepFile, 'utf-8'));
if (!d.success) {
  console.error('  prepare-extraction: FAILED (error: ' + (d.error || 'unknown') + ')');
  process.exit(1);
}
console.log('  prepare-extraction: SUCCESS (' + (d.totalChars || 0) + ' chars, ' + (d.chunks || []).length + ' chunks)');
const chunk = (d.chunks || [])[0] || '';
fs.writeFileSync(chunkReqFile, JSON.stringify({
  chunk: chunk.slice(0, 2000),
  title: d.title || 'Untitled',
  chunk_index: 0,
  total_chunks: 1,
}));
" "$PREP_FILE" "$CHUNK_REQ_FILE"

echo ""
echo "=== Testing extract-chunk ==="

curl -s -X POST "$SUPABASE_URL/functions/v1/extract-chunk" \
  -H "Authorization: Bearer $ANON_KEY" \
  -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" \
  -d @"$CHUNK_REQ_FILE" \
  -o "$CHUNK_FILE"

node -e "
const fs = require('fs');
const path = require('path');
const d = JSON.parse(fs.readFileSync(path.resolve(process.argv[1]), 'utf-8'));
if (!d.success) {
  console.error('  extract-chunk: FAILED (error: ' + (d.error || 'unknown') + ')');
  process.exit(1);
}
const items = d.items || [];
const cats = new Set();
items.forEach(item => {
  if (item.category) cats.add(item.category);
  (item.categories || []).forEach(c => cats.add(c));
});
console.log('  extract-chunk: SUCCESS (' + items.length + ' items, categories: ' + [...cats].sort().join(', ') + ')');
" "$CHUNK_FILE"

echo ""
echo "=== All smoke tests passed ==="
