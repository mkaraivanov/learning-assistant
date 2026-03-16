import { createClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function resetItems() {
  const client = getAdminClient()
  await client.from('items').delete().neq('id', '00000000-0000-0000-0000-000000000000')
}

export async function seedItem(data: Record<string, unknown>) {
  const client = getAdminClient()
  const { data: item, error } = await client.from('items').insert(data).select().single()
  if (error) throw new Error(`Failed to seed item: ${error.message}`)
  return item
}
