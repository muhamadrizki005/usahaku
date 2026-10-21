# Usahaku

## Acuan tampilan

Gunakan `C:\Projek Software\usahaku-design-system.zip` dengan palet asli tiap halaman: dashboard teal, login/onboarding biru. Jangan menyeragamkan warna berdasarkan handoff lama. Pertahankan landing 1800px, navbar sticky, fade saat scroll, dan Google sign-in yang diminta pengguna. Halaman baru memakai frame dan komponen sejenis dari ZIP. Catatan perbandingan dan batas verifikasi: `docs/UI-RESTORATION.md`.

## Menjalankan lokal (Windows / PowerShell)

1. Install dependensi: `npm.cmd install`.
2. Salin `.env.example` ke `.env.local` jika file tersebut belum ada. Isi URL dan publishable key Supabase milik proyek Anda. Legacy anon key juga didukung melalui `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Jalankan `npm.cmd run dev`, lalu buka http://localhost:3000.

Gunakan `npm.cmd` di PowerShell jika `npm` diblokir oleh execution policy. Restart server setelah mengubah env. Jika server sudah berjalan, cukup buka URL yang tampil di terminal.

Login dan pendaftaran memerlukan proyek Supabase yang aktif. Konfirmasi email tetap diwajibkan untuk registrasi email/password. Provider Google telah diaktifkan; tombol **Masuk dengan Google** dan **Daftar dengan Google** tersedia untuk owner. Login staf tetap memakai kode toko, username, dan kata sandi.

Isi `SUPABASE_SERVICE_ROLE_KEY` hanya di server untuk pengelolaan staf. Tambahkan `NEXT_PUBLIC_SITE_URL=http://localhost:3000` ke env saat menjalankan production lokal; pada deployment gunakan origin website publik. Nilai Supabase yang sudah ada tidak ditimpa. Origin website lokal ditambahkan hanya jika belum ada.

Di Supabase Auth URL Configuration, atur Site URL sesuai origin website dan izinkan callback untuk konfirmasi dan recovery, termasuk `http://localhost:3000/auth/callback` beserta query redirect yang dipakai aplikasi. Untuk pengujian di port 3100, izinkan origin/callback pengujian tersebut juga.

Aktivasi pendaftaran email/password menggunakan OTP: formulir sukses membuka `/signup/verify`, pengguna memasukkan kode dari email, lalu Supabase memverifikasi kode dan membuat sesi sebelum onboarding. Pada dashboard Supabase, template **Confirm sign up** harus menampilkan `{{ .Token }}`; template siap salin ada di `supabase/templates/confirm-signup.html`. Panduan Zoho Mail dan batas pengujian ada di `docs/ZOHO-SMTP-OTP.md`. File template lokal belum otomatis mengubah konfigurasi hosted Supabase.

Callback Google tetap memakai PKCE. Recovery owner tetap memakai tautan; template recovery server-side dapat menuju `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=recovery`. Callback lama tetap didukung untuk kompatibilitas. Jangan membagikan kode OTP atau tautan pemulihan.

Jika Supabase mengembalikan `over_email_send_rate_limit`, tunggu hingga batas pengiriman memungkinkan atau konfigurasi SMTP untuk kebutuhan registrasi publik. Jangan mematikan konfirmasi email agar tes terlihat lulus.

## Akun dan akses

- Owner: `/signup`, konfirmasi email, `/login`, lalu alur asli kategori, identitas usaha, setup, ringkasan, dan dashboard. Identitas disimpan melalui server; logo/deskripsi masih berupa draft pratinjau di browser sesuai prototipe.
- Staf: `/dashboard/settings/staff` membuka modal staf pada halaman setup asli. Owner membuat admin/kasir di sana; staf login melalui `/login?mode=staff` dengan kode toko, username, dan sandi sementara.
- Penggantian sandi: `/account/password`. Sandi baru minimal 10, maksimal 128 karakter. Sandi sementara ditampilkan kepada owner selama paling lama dua menit dan tidak disimpan di localStorage/sessionStorage atau log.
- Reset staf: hanya owner. Staf harus login kembali jika sesi dicabut, kemudian mengganti sandi sementara.
- Recovery owner: `/forgot-password`. Tautan valid membuka `/account/reset-password`; tiket pemulihan lokal berlaku paling lama 10 menit.
- Google OAuth: client ID/secret disimpan pada provider Supabase. Authorized redirect URI pada Google Cloud adalah callback Supabase `/auth/v1/callback`; Redirect URL pada Supabase adalah callback website `/auth/callback`. Owner baru melanjutkan onboarding, owner yang sudah memiliki usaha masuk dashboard. Pembatalan/tautan tidak valid menuju halaman error autentikasi.
- Kasir tetap memiliki scope transaksi **sendiri** untuk modul transaksi mendatang. Modul transaksi/produk/inventaris/POS belum dikembangkan menjadi operasi database pada tahap ini.
- Identitas usaha dan staf berasal dari database; data localStorage prototipe lama tidak diimpor otomatis.

## Database yang sudah ada

Migrasi `supabase/migrations/202610200001_foundation.sql` adalah baseline yang diadaptasi dari proyek asal, **bukan perintah menjalankannya ulang pada proyek Supabase yang sudah berisi tabel**. Tidak ada reset atau migrasi remote yang dijalankan dalam tahap ini.

Audit REST read-only: `node --env-file=.env.local scripts/audit-foundation.mjs`. Pemeriksaan katalog grants, policy, fungsi/trigger, dan keberadaan CLI migration history tersedia pada `supabase/audit-foundation.sql` untuk SQL Editor. Pengujian REST membuktikan perilaku akses aktual, tetapi bukan salinan katalog SQL lengkap.

Jangan commit `.env.local` atau membagikan service role key. Frontend hanya memakai publishable key atau legacy anon key.

## Pemeriksaan

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run test:backend
```

Untuk menjalankan hasil build, gunakan `npm.cmd run start`.

Tes backend membuat akun/usaha sementara dan menghapus hanya ID hasil run. Profil, membership, dan audit dua usaha demo dibandingkan sebelum/sesudah agar tetap identik. Jangan menggunakan kredensial akun demo untuk pengujian.

Tes browser menggunakan Microsoft Edge headless. Jalankan server produksi lokal di terminal terpisah setelah build:

```powershell
$env:NEXT_PUBLIC_SITE_URL='http://localhost:3100'
npm.cmd run start -- --hostname 127.0.0.1 --port 3100
```

Lalu `npm.cmd run test:e2e`. Hasil tersanitasi disimpan di `artifacts/accounts-e2e-result.json`, dengan pratinjau login/staf tanpa kredensial. Browser menguji token yang dibuat Admin API; itu tidak membuktikan email masuk ke inbox.

Untuk uji email nyata setelah SMTP dikonfigurasi, set `USAHAKU_TEST_EMAIL` ke Gmail milik sendiri, lalu jalankan `node --env-file=.env.local scripts/test-email.mjs`. Script memakai alias baru, bukan akun utama, dan membuka jendela browser agar pengguna memasukkan OTP dari inbox. Script menunggu konfirmasi hingga empat menit, lalu membersihkan akun tersebut. Jangan memakai alamat orang lain tanpa izin. Hasil tersedia di `artifacts/email-e2e-result.json`.
