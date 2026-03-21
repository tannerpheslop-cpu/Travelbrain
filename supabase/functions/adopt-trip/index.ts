import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  })
}

Deno.serve(async (req) => {
  console.log("adopt-trip: function invoked, method:", req.method)

  if (req.method === "OPTIONS") {
    console.log("adopt-trip: CORS preflight")
    return new Response("ok", { headers: corsHeaders })
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405)
  }

  try {
    // ── Step 1: Parse authorization header ──────────────────────────────
    console.log("Step 1: checking authorization header")
    const authHeader = req.headers.get("Authorization")
    console.log("Step 1: Authorization header present:", !!authHeader)

    if (!authHeader) {
      console.error("Step 1 FAILED: no Authorization header")
      return jsonResponse({ error: "Unauthorized" }, 401)
    }

    // ── Step 2: Decode JWT to get caller ID ─────────────────────────────
    console.log("Step 2: decoding JWT")
    let callerId: string | null = null
    try {
      const token = authHeader.replace(/^Bearer\s+/i, "")
      const payloadB64Url = token.split(".")[1]
      const padding = "=".repeat((4 - (payloadB64Url.length % 4)) % 4)
      const payloadB64 = (payloadB64Url + padding).replace(/-/g, "+").replace(/_/g, "/")
      const payload = JSON.parse(atob(payloadB64))
      callerId = payload.sub ?? null
      console.log("Step 2: decoded callerId:", callerId)
    } catch (jwtErr) {
      console.error("Step 2 FAILED: JWT decode error:", (jwtErr as Error).message, (jwtErr as Error).stack)
    }

    if (!callerId) {
      console.error("Step 2 FAILED: callerId is null after decode")
      return jsonResponse({ error: "Could not identify caller from JWT" }, 401)
    }

    // ── Step 3: Parse request body ──────────────────────────────────────
    console.log("Step 3: parsing request body")
    const { share_token } = await req.json() as { share_token: string }
    console.log("Step 3: share_token:", share_token)

    if (!share_token) {
      console.error("Step 3 FAILED: missing share_token")
      return jsonResponse({ error: "share_token required" }, 400)
    }

    // ── Step 4: Create admin client ─────────────────────────────────────
    console.log("Step 4: creating admin client")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    console.log("Step 4: SUPABASE_URL present:", !!supabaseUrl, "SERVICE_ROLE_KEY present:", !!serviceRoleKey)

    const admin = createClient(
      supabaseUrl!,
      serviceRoleKey!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    console.log("Step 4: admin client created")

    // ── Step 5: Fetch original trip ─────────────────────────────────────
    console.log("Step 5: looking up trip by share_token:", share_token)
    const { data: originalTrip, error: tripErr } = await admin
      .from("trips")
      .select("*")
      .eq("share_token", share_token)
      .single()

    if (tripErr || !originalTrip) {
      console.error("Step 5 FAILED: trip lookup error:", tripErr?.message, tripErr?.code)
      return jsonResponse({ error: "Trip not found" }, 404)
    }
    console.log("Step 5: trip found, id:", originalTrip.id, "owner:", originalTrip.owner_id)

    // Don't let the owner clone their own trip
    if (originalTrip.owner_id === callerId) {
      console.log("Step 5: caller is the owner, rejecting")
      return jsonResponse({ error: "You already own this trip" }, 409)
    }

    // ── Step 6: Fetch destinations ──────────────────────────────────────
    console.log("Step 6: fetching destinations for trip:", originalTrip.id)
    const { data: originalDests, error: destsErr } = await admin
      .from("trip_destinations")
      .select("*")
      .eq("trip_id", originalTrip.id)
      .order("sort_order")

    if (destsErr) {
      console.error("Step 6: destinations fetch error:", destsErr.message)
    }

    const dests = (originalDests ?? []) as Record<string, unknown>[]
    const destIds = dests.map((d) => d.id as string)
    console.log("Step 6: found", dests.length, "destinations")

    // ── Step 7: Fetch destination_items ──────────────────────────────────
    console.log("Step 7: fetching destination_items for", destIds.length, "destinations")
    const allDestItemsRes = destIds.length > 0
      ? await admin
          .from("destination_items")
          .select("*, saved_item:saved_items(*)")
          .in("destination_id", destIds)
      : { data: [] }
    const allDestItems = (allDestItemsRes.data ?? []) as Record<string, unknown>[]
    console.log("Step 7: found", allDestItems.length, "destination items")

    // ── Step 8: Fetch trip_general_items ─────────────────────────────────
    console.log("Step 8: fetching trip_general_items")
    const { data: giData, error: giErr } = await admin
      .from("trip_general_items")
      .select("*, saved_item:saved_items(*)")
      .eq("trip_id", originalTrip.id)
      .order("sort_order")

    if (giErr) {
      console.error("Step 8: general items fetch error:", giErr.message)
    }
    const generalItems = (giData ?? []) as Record<string, unknown>[]
    console.log("Step 8: found", generalItems.length, "general items")

    // ── Step 9: Create new trip for the adopting user ────────────────────
    console.log("Step 9: creating new trip for caller:", callerId)
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
      console.error("Step 9 FAILED: create trip error:", newTripErr?.message, newTripErr?.code)
      return jsonResponse({ error: "Failed to create trip" }, 500)
    }

    const newTripId = (newTrip as { id: string }).id
    console.log("Step 9: new trip created:", newTripId)

    // ── Step 10: Collect all unique saved_items to copy ──────────────────
    console.log("Step 10: collecting unique saved items")
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
    console.log("Step 10: found", uniqueItems.size, "unique items to copy")

    // ── Step 11: Copy saved_items with new owner ────────────────────────
    console.log("Step 11: copying saved items")
    const itemIdMap = new Map<string, string>() // original → new

    for (const [originalId, src] of uniqueItems) {
      const { data: newItem, error: itemErr } = await admin
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

      if (itemErr) {
        console.error("Step 11: failed to copy item", originalId, ":", itemErr.message)
      }
      if (newItem) itemIdMap.set(originalId, (newItem as { id: string }).id)
    }
    console.log("Step 11: copied", itemIdMap.size, "items")

    // ── Step 12: Copy destinations + their items ────────────────────────
    console.log("Step 12: copying destinations")
    for (const dest of dests) {
      const { data: newDest, error: destErr } = await admin
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

      if (destErr) {
        console.error("Step 12: failed to copy destination", dest.id, ":", destErr.message)
      }
      if (!newDest) continue
      const newDestId = (newDest as { id: string }).id

      const forThisDest = allDestItems.filter((di) => di.destination_id === dest.id)
      console.log("Step 12: copying", forThisDest.length, "items for destination", dest.location_name)
      for (const di of forThisDest) {
        const newItemId = itemIdMap.get(di.item_id as string)
        if (!newItemId) continue
        const { error: diErr } = await admin.from("destination_items").insert({
          destination_id: newDestId,
          item_id: newItemId,
          day_index: di.day_index,
          sort_order: di.sort_order,
        })
        if (diErr) {
          console.error("Step 12: failed to link item to destination:", diErr.message)
        }
      }
    }
    console.log("Step 12: destinations copied")

    // ── Step 13: Copy general items ─────────────────────────────────────
    console.log("Step 13: copying general items")
    for (const gi of generalItems) {
      const newItemId = itemIdMap.get(gi.item_id as string)
      if (!newItemId) continue
      const { error: giInsertErr } = await admin.from("trip_general_items").insert({
        trip_id: newTripId,
        item_id: newItemId,
        sort_order: gi.sort_order,
      })
      if (giInsertErr) {
        console.error("Step 13: failed to copy general item:", giInsertErr.message)
      }
    }
    console.log("Step 13: general items copied")

    console.log(`adopt-trip: completed successfully — trip ${originalTrip.id} adopted by ${callerId} → ${newTripId}`)
    return jsonResponse({ trip_id: newTripId })
  } catch (err) {
    const error = err as Error
    console.error("adopt-trip CRASHED:", error.message)
    console.error("Stack trace:", error.stack)
    return jsonResponse({ error: error.message || String(err) }, 500)
  }
})
