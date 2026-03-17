import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://pvnueomejrdhlqqjwzla.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB2bnVlb21lanJkaGxxcWp3emxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM3ODY0NDUsImV4cCI6MjA4OTM2MjQ0NX0.ab2nB7sz_R-0oVD2YD1FjUzr5SU4qnhv2W5pdZj9rEs'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
