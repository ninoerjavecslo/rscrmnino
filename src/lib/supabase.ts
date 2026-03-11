import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string

// Use `npx supabase gen types typescript --project-id <id>` to generate a
// proper typed client when needed. Our Database type in types.ts uses
// application-level shapes; the supabase-js generic requires generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const supabase = createClient<any>(url, key)
