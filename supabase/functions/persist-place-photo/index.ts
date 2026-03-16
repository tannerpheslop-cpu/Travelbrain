import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    })
  }

  try {
    const { placeId, photoUrl } = await req.json()

    if (!placeId || typeof placeId !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'placeId'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    if (!photoUrl || typeof photoUrl !== "string") {
      return new Response(
        JSON.stringify({ error: "Missing or invalid 'photoUrl'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Admin client for storage operations (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    const admin = createClient(supabaseUrl, serviceRoleKey)

    const storagePath = `${placeId}.jpg`

    // Check if file already exists — return existing URL
    const { data: existing } = await admin.storage
      .from("place-photos")
      .list("", { search: storagePath, limit: 1 })

    if (existing && existing.length > 0 && existing[0].name === storagePath) {
      const { data: urlData } = admin.storage
        .from("place-photos")
        .getPublicUrl(storagePath)

      return new Response(
        JSON.stringify({ url: urlData.publicUrl, cached: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Fetch image bytes from Google CDN
    const imageRes = await fetch(photoUrl, {
      signal: AbortSignal.timeout(15000),
    })

    if (!imageRes.ok) {
      console.log(`[persist-place-photo] Google fetch failed: ${imageRes.status} for placeId=${placeId}`)
      return new Response(
        JSON.stringify({ error: `Failed to fetch image: ${imageRes.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const imageBlob = await imageRes.blob()

    // Validate it's actually an image (not a placeholder HTML page)
    const contentType = imageRes.headers.get("content-type") ?? ""
    if (!contentType.startsWith("image/")) {
      console.log(`[persist-place-photo] Not an image: ${contentType} for placeId=${placeId}`)
      return new Response(
        JSON.stringify({ error: "Response is not an image" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    // Upload to Supabase Storage
    const { error: uploadError } = await admin.storage
      .from("place-photos")
      .upload(storagePath, imageBlob, {
        contentType: contentType || "image/jpeg",
        upsert: true,
      })

    if (uploadError) {
      console.log(`[persist-place-photo] Upload failed: ${uploadError.message} for placeId=${placeId}`)
      return new Response(
        JSON.stringify({ error: `Upload failed: ${uploadError.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      )
    }

    const { data: urlData } = admin.storage
      .from("place-photos")
      .getPublicUrl(storagePath)

    console.log(`[persist-place-photo] Persisted placeId=${placeId} → ${urlData.publicUrl}`)

    return new Response(
      JSON.stringify({ url: urlData.publicUrl, cached: false }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  } catch (error) {
    console.log(`[persist-place-photo] Unexpected error: ${error}`)
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    )
  }
})
