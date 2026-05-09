export type AppConfig = {
  apiKey: string
  baseUrl: string
  model: string
  libraryPath: string
}

export function loadEnv(env: Record<string, string | undefined>): AppConfig {
  const apiKey = env.KIMI_API_KEY?.trim()
  const PLACEHOLDERS = ['sk-kimi-replace-me', 'sk-kimi-...', 'your-api-key']
  if (!apiKey || PLACEHOLDERS.includes(apiKey)) {
    throw new Error('KIMI_API_KEY 未配置或仍是占位符。请编辑 .env 文件，将其替换为你的真实 API Key。')
  }

  const libraryPath = env.STUDY_LIBRARY_PATH?.trim()
  if (!libraryPath) throw new Error('Missing STUDY_LIBRARY_PATH in .env')

  let baseUrl = (env.KIMI_BASE_URL?.trim()) || 'https://api.kimi.com/coding/v1'
  baseUrl = baseUrl.replace(/\/$/, '')
  if (!baseUrl.endsWith('/v1')) baseUrl += '/v1'

  return {
    apiKey,
    baseUrl,
    model:   (env.KIMI_MODEL?.trim())    || 'kimi-k2.6',
    libraryPath
  }
}
