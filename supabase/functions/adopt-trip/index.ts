import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

function jsonOk(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders })
  if (req.method !== "POST") return jsonError("Method not allowed", 405)

  try {
    // ── 1. Identify caller from JWT ─────────────────────────────────────────
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) return jsonError("Unauthorized", 401)

    let callerId: string | null = null
    try {
      const token = authHeader.replace(/^Bearer\s+/i, "")
      const payloadB64Url = token.split(".")[1]
      const padding = "=".repeat((4 - (payloadB64Url.length % 4)) % 4)
      const payloadB64 = (payloadB64Url + padding).replace(/-/g, "+").replace(/_/g, "/")
      const payload = JSON.parse(atob(payloadB64))
      callerId = payload.sub ?? null
    } catch (err) {
      console.error("JWT decode error:", err)
    }

    if (!callerId) return jsonError("Could not identify caller from JWT", 401)

    // ── 2. Parse request ────────────────────────────────────────────────────
    const { share_token } = await req.json() as { share_token: string }
    if (!share_token) return jsonError("share_token required", 400)

    // ── 3. Admin client (bypasses RLS) ──────────────────────────────────────
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )

    // ── 4. Fetch original trip ──────────────────────────────────────────────
    const { data: originalTrip, error: tripErr } = await admin
      .from("trips")
      .select("*")
      .eq("share_token", share_token)
      .single()

    if (tripErr || !originalTrip) {
      console.error("Trip lookup failed:", tripErr?.message)
      return jsonError("Trip not found", 404)
    }

    // Don't let the owner clone their own trip
    if (originalTrip.owner_id === callerId) {
      return jsonError("You already own this trip", 409)
    }

    // ── 5. Fetch destinations ───────────────────────────────────────────────
    const { data: originalDests } = await admin
      .from("trip_destinations")
      .select("*")
      .eq("trip_id", originalTrip.id)
      .order("sort_order")

    const dests = (originalDests ?? []) as Record<string, unknown>[]
    const destIds = dests.map((d) => d.id as string)

    // ── 6. Fetch destination_items ──────────────────────────────────────────
    const allDestItemsRes = destIds.length > 0
      ? await admin
          .from("destination_items")
          .select("*, saved_item:saved_items(*)")
          .in("destination_id", destIds)
      : { data: [] }
    const allDestItems = (allDestItemsRes.data ?? []) as Record<string, unknown>[]

    // ── 7. Fetch trip_general_items ─────────────────────────────────────────
    const { data: giData } = await admin
      .from("trip_general_items")
      .select("*, saved_item:saved_items(*)")
      .eq("trip_id", originalTrip.id)
      .order("sort_order")
    const generalItems = (giData ?? []) as Record<string, unknown>[]

    // ── 8. Create new trip for the adopting user ────────────────────────────
    const { data: newTrip, error: newTripErr } = await admin
      .from("trips")
      .insert({
        owner_id: callerId,
        title: originalTrip.title,
        status: "aspirational",
        start_date: originalTrip.start_date,
        end_date: originalTrip.end_date,
        cover_image_url: originalTrip.cover_image_url,
        forked_from_trip_id: originalTrip.id,
      })
      .select("id")
      .single()

    if (newTripErr || !newTrip) {
      console.error("Failed to create trip:", newTripErr?.message)
      return jsonError("Failed to create trip", 500)
    }

    const newTripId = (newTrip as { id: string }).id

    // ── 9. Collect all unique saved_items to copy ───────────────────────────
    const uniqueItems = new Map<string, Record<string, unknown>>()
    for (const di of allDestItems) {
      const item = di.saved_item as Record<string, unknown>
      if (item?.id && !uniqueItems.has(item.id as string)) {
        uniqueItems.set(item.id as string, item)
      }
    }
    for (const gi of generalItems) {
      const item = gi.saved_item as Record<string, unknown>
      if (item?.id && !uniqueItems.has(item.id as string)) {
        uniqueItems.set(item.id as string, item)
      }
    }

    // ── 10. Copy saved_items with new owner ─────────────────────────────────
    const itemIdMap = new Map<string, string>() // original → new

    for (const [originalId, src] of uniqueItems) {
      const { data: newItem } = await admin
        .from("saved_items")
        .insert({
          user_id: callerId,
          source_type: src.source_type,
          source_url: src.source_url,
          image_url: src.image_url,
          title: src.title,
          description: src.description,
          site_name: src.site_name,
          location_name: src.location_name,
          location_lat: src.location_lat,
          location_lng: src.location_lng,
          location_place_id: src.location_place_id,
          category: src.category,
          notes: src.notes,
          tags: src.tags,
          is_archived: false,
        })
        .select("id")
        .single()

      if (newItem) itemIdMap.set(originalId, (newItem as { id: string }).id)
    }

    // ── 11. Copy destinations + their items ─────────────────────────────────
    for (const dest of dests) {
      const { data: newDest } = await admin
        .from("trip_destinations")
        .insert({
          trip_id: newTripId,
          location_name: dest.location_name,
          location_lat: dest.location_lat,
          location_lng: dest.location_lng,
          location_place_id: dest.location_place_id,
          image_url: dest.image_url,
          start_date: dest.start_date,
          end_date: dest.end_date,
          sort_order: dest.sort_order,
        })
        .select("id")
        .single()

      if (!newDest) continue
      const newDestId = (newDest as { id: string }).id

      const forThisDest = allDestItems.filter((di) => di.destination_id === dest.id)
      for (const di of forThisDest) {
        const newItemId = itemIdMap.get(di.item_id as string)
        if (!newItemId) continue
        await admin.from("destination_items").insert({
          destination_id: newDestId,
          item_id: newItemId,
          day_index: di.day_index,
          sort_order: di.sort_order,
        })
      }
    }

    // ── 12. Copy general items ──────────────────────────────────────────────
    for (const gi of generalItems) {
      const newItemId = itemIdMap.get(gi.item_id as string)
      if (!newItemId) continue
      await admin.from("trip_general_items").insert({
        trip_id: newTripId,
        item_id: newItemId,
        sort_order: gi.sort_order,
      })
    }

    console.log(`Trip ${originalTrip.id} adopted by ${callerId} → new trip ${newTripId}`)
    return jsonOk({ trip_id: newTripId })
  } catch (err) {
    console.error("adopt-trip error:", err)
    return jsonError(String(err), 500)
  }
})
