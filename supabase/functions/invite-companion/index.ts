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
  console.log("invite-companion: function invoked, method:", req.method)

  if (req.method === "OPTIONS") {
    console.log("invite-companion: CORS preflight")
    return new Response("ok", { headers: corsHeaders })
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
      const payloadB64 = (payloadB64Url + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/")
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
    const { email, trip_id } = await req.json() as { email: string; trip_id: string }
    console.log("Step 3: email:", email, "trip_id:", trip_id)

    if (!email || !trip_id) {
      console.error("Step 3 FAILED: missing email or trip_id")
      return jsonResponse({ error: "email and trip_id are required" }, 400)
    }

    // ── Step 4: Create admin client ─────────────────────────────────────
    console.log("Step 4: creating admin client")
    const supabaseUrl = Deno.env.get("SUPABASE_URL")
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")
    console.log("Step 4: SUPABASE_URL present:", !!supabaseUrl, "SERVICE_ROLE_KEY present:", !!serviceRoleKey)

    const adminClient = createClient(
      supabaseUrl!,
      serviceRoleKey!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    console.log("Step 4: admin client created")

    // ── Step 5: Look up trip and verify ownership ───────────────────────
    console.log("Step 5: looking up trip:", trip_id)
    const { data: trip, error: tripError } = await adminClient
      .from("trips")
      .select("id, owner_id, title, share_token")
      .eq("id", trip_id)
      .single()

    if (tripError || !trip) {
      console.error("Step 5 FAILED: trip lookup error:", tripError?.message, tripError?.code)
      return jsonResponse({ error: "Trip not found" }, 404)
    }
    console.log("Step 5: trip found, owner_id:", trip.owner_id)

    // ── Step 6: Check ownership ─────────────────────────────────────────
    console.log("Step 6: checking ownership — caller:", callerId, "owner:", trip.owner_id)
    if (trip.owner_id !== callerId) {
      console.error("Step 6 FAILED: ownership mismatch")
      return jsonResponse({ error: "Access denied: you don't own this trip" }, 403)
    }
    console.log("Step 6: ownership confirmed")

    // ── Step 7: Normalize email and look up existing user ───────────────
    const normalizedEmail = email.trim().toLowerCase()
    console.log("Step 7: looking up user by email:", normalizedEmail)

    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (listError) {
      console.error("Step 7: listUsers error:", listError.message)
    } else {
      console.log("Step 7: listUsers returned", listData?.users?.length, "users")
    }

    // Also query the public users table as a fallback
    console.log("Step 7b: querying public users table")
    const { data: publicUser, error: publicUserError } = await adminClient
      .from("users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle()

    if (publicUserError) {
      console.error("Step 7b: public users query error:", publicUserError.message)
    }
    console.log("Step 7b: public user found:", !!publicUser, publicUser?.id)

    const existingAuthUser = listData?.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    )
    console.log("Step 7: auth user found:", !!existingAuthUser, existingAuthUser?.id)

    const existingUserId = existingAuthUser?.id ?? publicUser?.id ?? null
    console.log("Step 7: resolved existingUserId:", existingUserId)

    if (existingUserId) {
      // ── Step 8a: Add existing user as companion ─────────────────────
      console.log("Step 8a: inserting companion — trip_id:", trip_id, "user_id:", existingUserId)
      const { error: companionError } = await adminClient
        .from("companions")
        .insert({ trip_id, user_id: existingUserId, role: "companion" })

      if (companionError) {
        console.error("Step 8a FAILED: companion insert error:", companionError.message, companionError.code, companionError.details)
        if (companionError.code === "23505") {
          return jsonResponse({ error: "This person is already a companion on this trip." }, 409)
        }
        return jsonResponse({ error: companionError.message }, 500)
      }

      console.log("Step 8a: companion added successfully")
      return jsonResponse({ result: "added", user_id: existingUserId })
    }

    // ── Step 8b: Invite new user ──────────────────────────────────────
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://travel-brain.vercel.app"
    const redirectTo = `${siteUrl}/trip/${trip_id}`
    console.log("Step 8b: inviting new user:", normalizedEmail, "redirect:", redirectTo)

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { redirectTo, data: { invited_to_trip_id: trip_id } }
    )

    if (inviteError) {
      console.error("Step 8b FAILED: inviteUserByEmail error:", inviteError.message)
      return jsonResponse({ error: inviteError.message }, 500)
    }

    console.log("Step 8b: invite sent, user id:", inviteData?.user?.id)

    // ── Step 9: Store pending invite (non-fatal) ────────────────────────
    console.log("Step 9: storing pending invite")
    const { error: pendingError } = await adminClient
      .from("pending_invites")
      .upsert(
        { trip_id, invited_by: callerId, email: normalizedEmail },
        { onConflict: "trip_id,email" }
      )

    if (pendingError) {
      console.error("Step 9: pending invite error (non-fatal):", pendingError.message)
    } else {
      console.log("Step 9: pending invite stored")
    }

    console.log("invite-companion: completed successfully (invited)")
    return jsonResponse({ result: "invited" })
  } catch (err) {
    const error = err as Error
    console.error("invite-companion CRASHED:", error.message)
    console.error("Stack trace:", error.stack)
    return jsonResponse({ error: error.message || String(err) }, 500)
  }
})
