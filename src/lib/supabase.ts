import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://jauohzeyvmitsclnmxwg.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImphdW9oemV5dm1pdHNjbG5teHdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyNjg0NzYsImV4cCI6MjA4Njg0NDQ3Nn0.LXuEcSJrxT0-3FhLQ6_yVoD7L5TIPtkj2MKScZCHqWg'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
