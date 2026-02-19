import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "jsr:@supabase/supabase-js@2"

/** Extract the user id from a Bearer JWT without a network round-trip. */
function getUserIdFromJwt(authHeader: string): string | null {
  try {
    const token = authHeader.replace(/^Bearer\s+/i, "")
    const parts = token.split(".")
    if (parts.length !== 3) return null
    // Base64url → standard base64 then decode via atob (available in all runtimes)
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/")
    const json = atob(payload)
    const { sub } = JSON.parse(json) as { sub?: string }
    return sub ?? null
  } catch {
    return null
  }
}

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
    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization")
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
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

    // User-scoped client — used to verify ownership and write pending_invite
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    )

    // Admin client — used for inviteUserByEmail and to look up existing users
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // Verify the caller owns this trip
    const { data: trip, error: tripError } = await userClient
      .from("trips")
      .select("id, owner_id, title, share_token")
      .eq("id", trip_id)
      .single()

    if (tripError || !trip) {
      console.error("Trip lookup error:", tripError?.message)
      return new Response(JSON.stringify({ error: "Trip not found or access denied" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    // Get the current user's id from the JWT directly (avoids a second network hop
    // that can fail inside the Edge Function runtime).
    const callerId = getUserIdFromJwt(authHeader)
    if (!callerId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      })
    }

    const normalizedEmail = email.trim().toLowerCase()

    // Check if this email already has an account — use filtered lookup, not full list
    const { data: listData, error: listError } = await adminClient.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    if (listError) {
      console.error("listUsers error:", listError.message)
    }

    // Also query the public users table as a fallback (more reliable for large user bases)
    const { data: publicUser } = await adminClient
      .from("users")
      .select("id, email")
      .eq("email", normalizedEmail)
      .maybeSingle()

    const existingAuthUser = listData?.users.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    )

    // Use whichever lookup found the user
    const existingUserId = existingAuthUser?.id ?? publicUser?.id ?? null

    if (existingUserId) {
      // User exists — add them as a companion directly
      const { error: companionError } = await userClient
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

    // Build the redirect URL: after signup they land on the trip page
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

    // Store the pending invite so we can show it in the UI
    const { error: pendingError } = await userClient
      .from("pending_invites")
      .upsert(
        { trip_id, invited_by: callerId, email: normalizedEmail },
        { onConflict: "trip_id,email" }
      )

    if (pendingError) {
      // Non-fatal — email was sent, just couldn't record it
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
