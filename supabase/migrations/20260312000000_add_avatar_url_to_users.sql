-- Add avatar_url column to public.users so comment threads can display profile pictures.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Backfill existing rows from auth.users raw_user_meta_data
UPDATE public.users u
SET avatar_url = (
  SELECT raw_user_meta_data->>'avatar_url'
  FROM auth.users a
  WHERE a.id = u.id
)
WHERE u.avatar_url IS NULL;

-- Create or replace the trigger function that syncs auth → public.users on every login/signup.
-- This keeps avatar_url (and display_name/email) fresh.
CREATE OR REPLACE FUNCTION public.sync_user_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    display_name = COALESCE(EXCLUDED.display_name, public.users.display_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, public.users.avatar_url);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Attach trigger to auth.users (drop first to be idempotent)
DROP TRIGGER IF EXISTS trg_sync_user_profile ON auth.users;
CREATE TRIGGER trg_sync_user_profile
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_user_profile();
