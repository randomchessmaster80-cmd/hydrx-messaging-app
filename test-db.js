import { createClient } from '@supabase/supabase-js'
import fs from 'fs'

const supabaseUrl = 'https://wmdabljapzmzkqdithqn.supabase.co'
const supabaseAnonKey = 'sb_publishable_JVusV8goLC8r_xkV7EVvFQ_KhHmiIFP'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data, error } = await supabase.from('messages').select('*').limit(5)
  console.log("FETCH MESSAGES ERROR?:", error ? error : "Success, keys: " + Object.keys(data[0] || {}))
}
test()
