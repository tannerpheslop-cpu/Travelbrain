-- Fix infinite recursion in RLS policies between trips and companions.
--
-- The cycle was:
--   "Companions can read invited trips" (on trips) queries companions
--   → triggers "Trip owners can read companions" (on companions) which queries trips
--   → which triggers "Companions can read invited trips" again → ∞
--
-- Solution: use a SECURITY DEFINER function to check companion membership
-- without going through RLS on companions, breaking the cycle.

-- Helper: returns true if the given user is a companion on the given trip.
-- SECURITY DEFINER bypasses RLS on the companions table for this lookup only.
create or replace function public.is_companion(p_trip_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.companions
    where trip_id = p_trip_id and user_id = p_user_id
  );
$$;

-- Drop the recursive policy
drop policy if exists "Companions can read invited trips" on trips;

-- Re-create it using the security definer helper (no RLS evaluated on companions)
create policy "Companions can read invited trips"
  on trips for select
  using (public.is_companion(trips.id, auth.uid()));
