# URL Resolver — Deployment Guide

## What this is
A headless Chromium service that resolves short URLs (Google Maps mobile links, t.co, etc.) to their final destination. Deployed on Google Cloud Run.

## Prerequisites
- Google Cloud CLI (`gcloud`) installed and authenticated
- A Google Cloud project (the same one used for Google Places/Maps APIs)
- Docker (only needed if building locally — Cloud Run can build from source)

## Step 1: Set up authentication

Create an API key for the service:
```bash
# Generate a random API key
openssl rand -hex 32
```
Save this key — you'll need it in two places.

## Step 2: Deploy to Cloud Run

From the `cloud-functions/url-resolver/` directory:

```bash
gcloud run deploy url-resolver \
  --source . \
  --region us-central1 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 30 \
  --max-instances 3 \
  --min-instances 0 \
  --no-allow-unauthenticated \
  --set-env-vars="RESOLVER_API_KEY=YOUR_API_KEY_HERE"
```

Replace `YOUR_API_KEY_HERE` with the key from Step 1.

Note the deployed URL (e.g., `https://url-resolver-XXXX-uc.a.run.app`).

## Step 3: Allow unauthenticated access (simpler auth via API key)

Since we're using API key auth (not IAM), allow unauthenticated HTTP access:
```bash
gcloud run services add-iam-policy-binding url-resolver \
  --region us-central1 \
  --member="allUsers" \
  --role="roles/run.invoker"
```

The API key in the `x-api-key` header prevents unauthorized use.

## Step 4: Add secrets to Supabase

In the Supabase Dashboard → Edge Functions → Secrets, add:
- `URL_RESOLVER_ENDPOINT` = the Cloud Run URL (e.g., `https://url-resolver-XXXX-uc.a.run.app`)
- `URL_RESOLVER_API_KEY` = the API key from Step 1

## Step 5: Test

```bash
# Test locally first
npm start
# In another terminal:
node test.js

# Test the deployed service
RESOLVER_URL=https://url-resolver-XXXX-uc.a.run.app RESOLVER_API_KEY=your-key node test.js
```

## Cost
- **Scale-to-zero:** No cost when idle (min-instances = 0)
- **Per request:** ~$0.00001 per invocation (512Mi, <10s)
- **Cold start:** ~3-5 seconds on first request (Chromium launch)
- **Warm request:** ~1-3 seconds
- **Estimated monthly cost at current usage:** <$1

## Allowed domains
Only these short-link domains are resolved (all others rejected with 403):
- maps.app.goo.gl
- goo.gl
- t.co
- vm.tiktok.com
- pin.it
- redd.it
- bit.ly
