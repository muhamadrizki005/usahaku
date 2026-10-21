# Tahap 1–2: fondasi dan akun

Konteks: 20 Oktober 2026, Asia/Jakarta. Implementasi berada di `usahaku-design-system`. Proyek asal dan akun demo tidak dimodifikasi. Tidak ada pekerjaan operasional produk, inventaris, atau POS; route yang sudah ada hanya diberi pemeriksaan akses server.

## Tahap 1 — rekonsiliasi

- [x] Audit stack dan penyimpanan browser pada implementasi tujuan.
- [x] Verifikasi kedua env menunjuk proyek Supabase yang sama tanpa menampilkan/menimpa nilainya.
- [x] Verifikasi kolom fondasi melalui REST: businesses, business_members, staff_audit_logs, serta RPC melalui perilaku pengujian.
- [x] Pertahankan baseline SQL, RLS, trigger audit, dan RPC dari proyek asal sebagai referensi lokal; tidak menjalankan ulang CREATE TABLE.
- [x] Adaptasi client server/admin, validasi, otorisasi, Server Actions, dan tes secara selektif.
- [x] Konfirmasi dua usaha demo lama masih tersedia; tes backend memastikan profil, anggota, dan audit tetap identik.
- [ ] Inspeksi katalog SQL remote secara langsung dan verifikasi history migrasi CLI. Service key REST bukan akses SQL; query read-only tersedia di `supabase/audit-foundation.sql`.

## Tahap 2 — implementasi

- [x] Form registrasi/login owner dan kirim ulang konfirmasi; callback kode PKCE dan token_hash.
- [x] Alur aktivasi OTP: pendaftaran sukses menuju halaman verifikasi; kode salah/terpakai ditolak, kode benar membuat sesi server. Atas permintaan pengguna, env/form diubah ke 6 digit; tampilan tetap mendukung 6/8 tanpa mengganti palet.
- [ ] Samakan **Email OTP Length = 6** pada provider Email di dashboard Supabase, lalu uji ulang kode baru. Pengujian inbox sebelumnya lulus saat konfigurasi masih 8 digit.
- [x] Pembuatan usaha melalui RPC atomik; satu usaha per owner, kategori toko/warung.
- [x] Pemeriksaan sesi, membership, status aktif, wajib ganti sandi, dan role di server.
- [x] Owner membuat admin/kasir dengan username unik per usaha tanpa email pribadi staf.
- [x] Login staf dengan kode toko, username, dan sandi sementara.
- [x] Perubahan sandi meminta sandi saat ini; flag wajib ganti dibuka hanya melalui server.
- [x] Reset staf, aktif/nonaktif, logout, dan audit; operasi terhadap ID staf usaha lain ditolak.
- [x] Recovery owner dengan tiket signed HttpOnly; logout setelah perubahan sandi recovery.
- [x] Uji browser hosted: login/logout owner, konfirmasi melalui token uji, cookie setelah reload, usaha, admin/kasir, sandi sementara/reset, nonaktif/aktif dengan sesi lama, manipulasi role/ID, dan recovery owner termasuk penolakan tautan terpakai.
- [x] Hak kasir untuk transaksi sendiri dipertahankan sebagai policy eksplisit dan diuji; modul transaksi belum dibangun.
- [x] Pengiriman aktivasi OTP nyata sampai inbox, konfirmasi melalui browser oleh pengguna, dan login password sesudah aktivasi. Pengujian memakai alias baru milik pengguna dan akun uji sudah dihapus. Bukti: `artifacts/email-e2e-result.json`.
- [ ] Pengiriman/tautan recovery nyata sampai inbox, kirim ulang OTP nyata, dan kedaluwarsa berdasarkan waktu konfigurasi. API recovery menerima permintaan, tetapi itu bukan bukti inbox/tautan recovery.
- [x] Template OTP Confirm sign up disimpan pengguna di dashboard Supabase dan berhasil dipakai dalam uji inbox. Konfigurasi host/provider SMTP tidak diinspeksi langsung.

## Bukti pengujian

- Build dan TypeScript lulus.
- Enam tes lokal lulus, termasuk PostgreSQL PGlite untuk grants/RLS, dua tenant, role, audit, forced password change, dan nonaktif.
- Tes SDK hosted Supabase lulus: dua usaha, pembatasan admin/kasir, larangan eskalasi, wajib ganti sandi, dan penonaktifan sesi. Data uji SDK dibersihkan; data demo identik.
- Satu rangkaian pengujian browser end-to-end lulus dalam sekitar 56 detik. Rincian tersedia pada `artifacts/accounts-e2e-result.json`; check email pengiriman tetap false dan tidak dianggap lulus hanya karena rangkaian akun lainnya lulus.
- Hasil email nyata tersedia pada `artifacts/email-e2e-result.json`. Token dari Admin API adalah bukti callback/Auth, bukan bukti pengiriman email.

## Tindakan eksternal yang masih dibutuhkan

1. Aktivasi OTP inbox sudah berhasil. Selanjutnya verifikasi kirim ulang/kedaluwarsa OTP dan recovery nyata bila diperlukan; pastikan kuota/SMTP memadai untuk pengujian berulang. Kegagalan kuota pada percobaan sebelumnya tetap merupakan riwayat, bukan status kegagalan pengujian terbaru. Alamat/akun asli tidak diubah/reset.
2. Verifikasi Site URL/redirect allowlist dan template email sesuai README. Env produksi wajib memiliki NEXT_PUBLIC_SITE_URL.
3. Jika diperlukan verifikasi katalog/migration history lengkap, jalankan query audit read-only melalui SQL Editor. Jangan menjalankan ulang migrasi fondasi pada database yang sama.

Tidak ada klaim produk, stok, POS, atau laporan siap operasional. Ukuran landing 1800px, navbar sticky, dan animasi scroll dipertahankan.
