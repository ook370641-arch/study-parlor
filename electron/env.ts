export type AppConfig = {
  apiKey: string
  baseUrl: string
  model: string
  libraryPath: string
}

export function loadEnv(env: Record<string, string | undefined>): AppConfig {
  const apiKey = env.KIMI_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing KIMI_API_KEY in .env')

  const libraryPath = env.STUDY_LIBRARY_PATH?.trim()
  if (!libraryPath) throw new Error('Missing STUDY_LIBRARY_PATH in .env')

  return {
    apiKey,
    baseUrl: (env.KIMI_BASE_URL?.trim()) || 'https://api.kimi.com/coding/v1',
    model:   (env.KIMI_MODEL?.trim())    || 'kimi-k2.6',
    libraryPath
  }
}
