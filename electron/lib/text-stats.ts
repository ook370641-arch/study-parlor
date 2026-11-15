export function countTextWords(body: string): number {
  const withoutUrls = body.replace(/https?:\/\/[^\s)]+/g, ' ')
  const han = withoutUrls.match(/\p{Script=Han}/gu)?.length ?? 0
  const words = withoutUrls
    .replace(/\p{Script=Han}/gu, ' ')
    .match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0
  return han + words
}
