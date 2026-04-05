#!/bin/bash
# Deploy youji-headless-fetch to Google Cloud Run
#
# Prerequisites:
#   gcloud auth login
#   gcloud config set project [YOUR_GCP_PROJECT_ID]
#   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com
#
# Usage:
#   cd services/headless-fetch
#   bash deploy.sh

set -euo pipefail

REGION="us-east1"
SERVICE_NAME="youji-headless-fetch"

echo "=== Deploying $SERVICE_NAME to Cloud Run ($REGION) ==="

# Generate API secret
API_SECRET=$(openssl rand -hex 32)
echo "Generated API secret: $API_SECRET"
echo "(Save this — it goes into prepare-extraction's environment as HEADLESS_API_SECRET)"
echo ""

# Build and deploy
gcloud run deploy "$SERVICE_NAME" \
  --source . \
  --region "$REGION" \
  --platform managed \
  --allow-unauthenticated \
  --memory 1Gi \
  --cpu 1 \
  --timeout 30s \
  --max-instances 3 \
  --min-instances 0 \
  --set-env-vars "HEADLESS_API_SECRET=$API_SECRET"

# Get service URL
SERVICE_URL=$(gcloud run services describe "$SERVICE_NAME" --region "$REGION" --format='value(status.url)')
echo ""
echo "=== Deployment complete ==="
echo "Service URL: $SERVICE_URL"
echo "API Secret:  $API_SECRET"
echo ""
echo "Save these two values. They go into prepare-extraction as:"
echo "  HEADLESS_FETCH_URL=$SERVICE_URL"
echo "  HEADLESS_API_SECRET=$API_SECRET"
echo ""

# Smoke test
echo "=== Running smoke test ==="
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$SERVICE_URL/fetch" \
  -H "Content-Type: application/json" \
  -H "x-api-secret: $API_SECRET" \
  -d '{"url": "https://www.foratravel.com/guides/YBHRW7/chengdu-by-heart-a-3-day-itinerary-in-chinas-chillest-city-jocelyn-heng"}')

HTTP_CODE=$(echo "$RESPONSE" | tail -1)
BODY=$(echo "$RESPONSE" | head -n -1)

echo "HTTP status: $HTTP_CODE"
echo "Response (first 200 chars): $(echo "$BODY" | head -c 200)"

SUCCESS=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('success',''))" 2>/dev/null || echo "parse_error")
CONTENT_LEN=$(echo "$BODY" | python3 -c "import sys,json; print(json.load(sys.stdin).get('contentLength',0))" 2>/dev/null || echo "0")

if [ "$SUCCESS" = "True" ] && [ "$CONTENT_LEN" -gt 10000 ] 2>/dev/null; then
  echo "Smoke test PASSED (contentLength: $CONTENT_LEN)"
else
  echo "Smoke test FAILED — check the response above"
fi
