// Storage and SQL cannot share a transaction. Never eagerly delete a candidate
// after an uncertain response: activation may still have committed remotely.
export type LogoLifecycleOperations<T> = {
  reserve: () => Promise<{ id: string; path: string }>
  upload: (path: string) => Promise<void>
  activate: (id: string) => Promise<T>
  reconcile: (path: string) => Promise<T | null>
  cleanup: () => Promise<boolean>
}
export async function replaceLogoSafely<T>(operations: LogoLifecycleOperations<T>): Promise<{ value?: T; warning?: string; error?: string }> {
  let candidate: { id: string; path: string }
  try { candidate = await operations.reserve(); await operations.upload(candidate.path) }
  catch { return { error: 'Logo belum berhasil diunggah. Logo sebelumnya tetap digunakan; coba lagi nanti.' } }
  let value: T
  try { value = await operations.activate(candidate.id) }
  catch {
    let recovered: T | null = null
    try { recovered = await operations.reconcile(candidate.path) } catch { /* Keep candidate for guarded cleanup. */ }
    if (!recovered) return { error: 'Status penyimpanan logo belum pasti atau profil sudah berubah. Muat ulang sebelum mencoba lagi; file lama tidak dihapus.' }
    value = recovered
  }
  let clean = false
  try { clean = await operations.cleanup() } catch { /* A committed logo remains successful. */ }
  return { value, ...(clean ? {} : { warning: 'Logo sudah tersimpan. Pembersihan file lama akan dicoba kembali.' }) }
}
