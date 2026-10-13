import { Resend } from "resend";
import { env } from "../../config/env";

// Provider email (Resend) untuk kode reset sandi.
// Fallback: bila RESEND_API_KEY/RESEND_FROM belum diisi, kode hanya di-log (cukup untuk dev).
const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendPasswordResetEmail(to: string, kode: string): Promise<void> {
  const from = env.RESEND_FROM;

  if (!resend || !from) {
    console.log(`[RESET] Kode untuk ${to}: ${kode} (email belum dikonfigurasi — RESEND_API_KEY/RESEND_FROM kosong)`);
    return;
  }

  try {
    await resend.emails.send({
      from,
      to,
      subject: "Kode Reset Kata Sandi Bugarin",
      text: `Kode verifikasi Anda: ${kode}\n\nKode berlaku 15 menit dan hanya bisa dipakai sekali. Jangan bagikan kode ini kepada siapa pun.`,
      html: `<p>Kode verifikasi Anda: <strong style="font-size:20px;letter-spacing:2px">${kode}</strong></p>
<p>Kode berlaku <strong>15 menit</strong> dan hanya bisa dipakai sekali. Jangan bagikan kode ini kepada siapa pun.</p>`,
    });
  } catch (err) {
    console.error(`[RESET] Gagal mengirim email ke ${to}:`, err);
  }
}
