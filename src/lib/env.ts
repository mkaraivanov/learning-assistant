function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

export const env = {
  supabaseUrl: requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
  supabaseAnonKey: requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  supabaseServiceKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  openaiApiKey: requireEnv('OPENAI_API_KEY'),
  llmProvider: process.env.LLM_PROVIDER ?? 'claude',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  youtubeApiKey: process.env.YOUTUBE_API_KEY,
  assemblyaiApiKey: process.env.ASSEMBLYAI_API_KEY,
  assemblyaiWebhookSecret: process.env.ASSEMBLYAI_WEBHOOK_SECRET,
  appUrl: requireEnv('NEXT_PUBLIC_APP_URL'),
  apiSecretKey: process.env.API_SECRET_KEY,
} as const
