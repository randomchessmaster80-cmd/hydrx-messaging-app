import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wmdabljapzmzkqdithqn.supabase.co'
const supabaseAnonKey = 'sb_publishable_JVusV8goLC8r_xkV7EVvFQ_KhHmiIFP'
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function test() {
  const { data, error } = await supabase.from('messages').insert({ 
    sender_id: '0b294a1b-827e-4d80-bb06-1e1a21b3d9b9', 
    receiver_id: null,
    content: "Sent a GIF", 
    media_url: 'https://test.com/gif.gif', 
    media_type: 'image/gif' 
  })
  console.log("INSERT RESULT:", error || "Success")
}
test()
