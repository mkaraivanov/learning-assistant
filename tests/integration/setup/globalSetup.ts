import { createClient } from '@supabase/supabase-js'

export default async function globalSetup() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !key) {
    throw new Error(
      'Integration tests require NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.test.local'
    )
  }

  // Verify connection
  const client = createClient(url, key)
  const { error } = await client.from('items').select('id').limit(1)

  if (error && error.code !== 'PGRST116') {
    throw new Error(`Supabase connection failed: ${error.message}`)
  }
}
