import { createClient } from '@supabase/supabase-js'

// I will paste your real keys here once you send them!
const supabaseUrl = 'https://wmdabljapzmzkqdithqn.supabase.co'
const supabaseAnonKey = 'sb_publishable_JVusV8goLC8r_xkV7EVvFQ_KhHmiIFP'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
