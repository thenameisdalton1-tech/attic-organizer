import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://naludqavakhabgsvnrzj.supabase.co'

const supabaseKey = 'sb_publishable_0wdygbafMLy5NzOsZ5yHWQ_i89uQMHf'

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
})
