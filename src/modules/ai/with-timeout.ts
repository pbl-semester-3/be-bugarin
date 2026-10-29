/// Jalankan promise dengan batas waktu. Jika lewat `ms`, reject sehingga
/// pemanggil bisa jatuh ke fallback deterministik (AI Gemini kadang lambat/hang).
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label = "AI"
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timeout setelah ${ms}ms`)), ms)
    ),
  ]);
}
