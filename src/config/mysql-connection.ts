// Parser DATABASE_URL (mysql://) → opsi koneksi mysql2.
// Penting: mysql2 TIDAK memahami parameter `ssl-mode` di URL (diabaikan), padahal Aiven
// mewajibkan TLS. Jadi kita deteksi kebutuhan SSL dari URL/host dan set `ssl` eksplisit.

export type MysqlConnection = {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  ssl?: { rejectUnauthorized: boolean };
};

export function parseMysqlUrl(rawUrl: string): MysqlConnection {
  const u = new URL(rawUrl);
  const sslMode = (u.searchParams.get("ssl-mode") ?? "").toUpperCase();
  const sslRequired =
    sslMode === "REQUIRED" ||
    sslMode === "VERIFY_CA" ||
    sslMode === "VERIFY_IDENTITY" ||
    /aivencloud\.com$/i.test(u.hostname);

  return {
    host: decodeURIComponent(u.hostname),
    port: u.port ? Number(u.port) : 3306,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: decodeURIComponent(u.pathname.replace(/^\//, "")),
    // rejectUnauthorized: false = tetap terenkripsi, tanpa verifikasi CA (aman untuk dev/Aiven).
    ...(sslRequired ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}
