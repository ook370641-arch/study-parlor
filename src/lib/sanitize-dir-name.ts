export function sanitizeDirName(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, '-')
    .replace(/-+/g, '-')
}
