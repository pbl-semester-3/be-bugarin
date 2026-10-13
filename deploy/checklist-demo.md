# Checklist Pra-Demo

Lakukan **beberapa menit sebelum** demo (Render free tier tidur saat idle).

- [ ] Buka `https://api.bugarin.my.id/health` → `{"data":"ok"}` (membangunkan backend).
- [ ] Cek backend tidak error di log Render.
- [ ] Cek database Aiven aktif (tidak "power off").
- [ ] Akun uji siap: Admin (hasil seed), PT, Klien.
- [ ] Data terisi: klien ter-pairing, weekly plan, riwayat (kalau perlu, seed data uji).
- [ ] Cloudinary aktif (uji upload foto profil).
- [ ] Login Google klien berfungsi (bila didemokan).
- [ ] FE menunjuk `NEXT_PUBLIC_API_URL=https://api.bugarin.my.id`.
- [ ] Cron mingguan terdaftar (cron-job.org) — tidak wajib untuk demo harian.
- [ ] Buka FE beberapa saat sebelumnya agar tidak kena cold start.
