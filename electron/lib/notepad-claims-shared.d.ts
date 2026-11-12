export type SharedNotepadClaim = { claimedBy: string; claimedAt: string }

export function readClaimsFile(claimsFile: string): Record<string, SharedNotepadClaim>
export function writeClaimsFile(claimsFile: string, claims: Record<string, SharedNotepadClaim>): void
export function withClaimsLock<T>(claimsFile: string, callback: () => T): T
