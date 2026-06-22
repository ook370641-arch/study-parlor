export const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`enc:${s}`),
  decryptString: (b: Buffer) => {
    const str = b.toString()
    if (!str.startsWith('enc:')) throw new Error('Invalid encrypted data')
    return str.replace(/^enc:/, '')
  }
}

export const ipcMain = {
  handle: () => {}
}
