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

  try {
    const authHeader = req.headers.get("Authorization")
    console.log("Authorization header present:", !!authHeader)

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Decode the JWT payload to extract caller's user ID.
    // JWT tokens use URL-safe base64 (- instead of +, _ instead of /),
    // so we must replace those before calling atob(), and add padding.
    let callerId: string | null = null
    try {
      const token = authHeader.replace(/^Bearer\s+/i, "")
      const payloadB64Url = token.split(".")[1]
      // Add base64 padding if needed
      const padding = "=".repeat((4 - (payloadB64Url.length % 4)) % 4)
      const payloadB64 = (payloadB64Url + padding)
        .replace(/-/g, "+")
        .replace(/_/g, "/")
      const payload = JSON.parse(atob(payloadB64))
      callerId = payload.sub ?? null
      console.log("Decoded callerId:", callerId)
    } catch (jwtErr) {
      console.error("JWT decode error:", jwtErr)
    }

    if (!callerId) {
      return new Response(JSON.stringify({ error: "Could not identify caller from JWT" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const { email, trip_id } = await req.json() as { email: string; trip_id: string }

    if (!email || !trip_id) {
      return new Response(JSON.stringify({ error: "email and trip_id are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Admin client — bypasses RLS entirely. We enforce ownership manually below.
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Look up trip via adminClient, then manually verify the caller owns it.
    const { data: trip, error: tripError } = await adminClient
      .from("trips")
      .select("id, owner_id, title, share_token")
      .eq("id", trip_id)
      .single()

    if (tripError || !trip) {
      console.error("Trip lookup error:", tripError?.message)
      return new Response(JSON.stringify({ error: "Trip not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    if (trip.owner_id !== callerId) {
      console.error("Ownership check failed: owner", trip.owner_id, "caller", callerId)
      return new Response(JSON.stringify({ error: "Access denied: you don't own this trip" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Check if this email already has an account
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (listError) {
      console.error("listUsers error:", listError.message)
    }

    // Also query the public users table as a fallback
    const { data: publicUser } = await adminClient
      .from("users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle()

    const existingAuthUser = listData?.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    )

    const existingUserId = existingAuthUser?.id ?? publicUser?.id ?? null

    if (existingUserId) {
      // User exists — add them as a companion using adminClient (bypasses RLS)
      const { error: companionError } = await adminClient
        .from("companions")
        .insert({ trip_id, user_id: existingUserId, role: "companion" })

      if (companionError) {
        console.error("Companion insert error:", companionError.message, companionError.code)
        if (companionError.code === "23505") {
          return new Response(
            JSON.stringify({ error: "This person is already a companion on this trip." }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          )
        }
        return new Response(
          JSON.stringify({ error: companionError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        )
      }

      return new Response(
        JSON.stringify({ result: "added", user_id: existingUserId }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    // User doesn't exist — send invite email and store pending invite
    const siteUrl = Deno.env.get("SITE_URL") ?? "https://travel-brain.vercel.app"
    const redirectTo = `${siteUrl}/trip/${trip_id}`

    console.log("Inviting new user:", normalizedEmail, "redirect:", redirectTo)

    const { data: inviteData, error: inviteError } = await adminClient.auth.admin.inviteUserByEmail(
      normalizedEmail,
      { redirectTo, data: { invited_to_trip_id: trip_id } }
    )

    if (inviteError) {
      console.error("inviteUserByEmail error:", inviteError.message)
      return new Response(
        JSON.stringify({ error: inviteError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      )
    }

    console.log("Invite sent successfully, user id:", inviteData?.user?.id)

    // Store the pending invite via adminClient (non-fatal if it fails)
    const { error: pendingError } = await adminClient
      .from("pending_invites")
      .upsert(
        { trip_id, invited_by: callerId, email: normalizedEmail },
        { onConflict: "trip_id,email" }
      )

    if (pendingError) {
      console.error("Failed to store pending invite:", pendingError.message)
    }

    return new Response(
      JSON.stringify({ result: "invited" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  } catch (err) {
    console.error("invite-companion error:", err)
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    )
  }
})
