# Setup Zoho Mail untuk aktivasi OTP

Status 21 Oktober 2026: pengguna sudah menyimpan template Confirm sign up di dashboard Supabase. Pengujian email nyata melalui registrasi website berhasil: pengguna menerima dan memasukkan OTP, akun terkonfirmasi di Supabase, lalu login password berhasil. Akun uji baru sudah dibersihkan. Konfigurasi host/provider SMTP tidak diinspeksi langsung pada sesi ini. File template lokal tidak otomatis mengubah template proyek Supabase.

## 1. Zoho Mail

Buka pengaturan akun pengirim, bagian konfigurasi server/SMTP. Gunakan host yang ditampilkan untuk jenis akun dan datacenter akun tersebut, bukan menebak dari contoh. Dokumentasi memberi contoh `smtp.zoho.com` untuk akun personal/free organization dan `smtppro.zoho.com` untuk paid organization; wilayah lain bisa berbeda.

Siapkan alamat pengirim yang aktif, username berupa alamat lengkap, host SMTP, port 587/TLS atau 465/SSL sesuai konfigurasi, serta kredensial SMTP. Jika akun memakai autentikasi dua langkah, gunakan App Password. Pemilik akun membuat dan memasukkan kredensial langsung; jangan menulisnya di chat, repo, atau frontend.

## 2. Supabase — Custom SMTP

Pilih proyek yang URL-nya sama dengan `NEXT_PUBLIC_SUPABASE_URL` di `.env.local`. Pada Authentication, buka pengaturan email/Custom SMTP dan aktifkan custom SMTP:

| Isian | Nilai |
| --- | --- |
| Sender email | Alamat Zoho atau alias sah yang sama dengan akun pengirim |
| Sender name | Usahaku |
| Host | Host SMTP dari pengaturan Zoho akun ini |
| Port | 587 atau 465, sesuai pengaturan Zoho |
| Username | Alamat email Zoho lengkap |
| Password | Kredensial SMTP/App Password, dimasukkan langsung di dashboard |

Simpan dan periksa Auth Rate Limits. SMTP sendiri tetap memiliki batas Supabase dan batas pengiriman Zoho; jangan mematikan seluruh pembatasan.

## 3. Supabase — aktivasi OTP

- Tetap aktifkan **Confirm Email**.
- Pada Email Templates → **Confirm sign up**, atur subject `Kode aktivasi akun Usahaku` dan salin isi `supabase/templates/confirm-signup.html`.
- Template harus memakai `{{ .Token }}`, bukan hanya tautan `{{ .ConfirmationURL }}`. Jangan mengganti template recovery yang masih memakai tautan pemulihan terpisah.
- Pengguna meminta OTP **6 digit**. `.env.local` dan `.env.example` sekarang memakai `NEXT_PUBLIC_EMAIL_OTP_LENGTH=6`. Pengaturan hosted Supabase sebelumnya menghasilkan 8 digit dan belum diubah oleh agent: buka Authentication → Sign In / Providers → Email, ubah **Email OTP Length** menjadi **6**, lalu simpan. Kedua sisi harus sama sebelum menguji kode baru. Website tetap mendukung 6/8; restart/rebuild sesudah mengubah env. Jangan memotong OTP atau mengubah `{{ .Token }}` agar terlihat lebih pendek. Bila tersedia, atur masa berlaku OTP menjadi 600 detik dan interval kirim ulang minimal 60 detik. Pembatasan server tetap menjadi sumber kebenaran; cooldown browser hanya membantu pengguna.
- Site URL lokal tetap `http://localhost:3000`; callback Google/recovery tetap diizinkan. Pengujian produksi lokal menggunakan port 3100 bila dipilih.

## 4. Verifikasi

Daftar dengan alamat uji baru milik sendiri. Website harus membuka `/signup/verify`, email berisi angka OTP, dan kode yang benar membuka onboarding dengan sesi yang diakui server. Uji kode salah, kode bekas, kirim ulang, dan OTP kedaluwarsa. Uji login password sesudah aktivasi. Google dan akun demo tidak diubah.

`npm.cmd run test:e2e -- tests/browser/email-otp.spec.ts` memverifikasi OTP Supabase aktual lewat browser memakai token Admin API dan akun sementara; ini bukan bukti SMTP mengantarkan email ke inbox. Uji inbox hanya dilakukan sesudah pengaturan SMTP dan template dashboard selesai.

Hasil implementasi: build dan enam tes lokal lulus; suite browser akun/isolasi lulus dan data demo identik. Tes OTP terpisah lulus untuk penolakan login sebelum konfirmasi, kode salah, aktivasi dengan kode benar, sesi yang dikenali server, penolakan kode terpakai, dan login password setelah aktivasi. Seluruh akun uji OTP dihapus berdasarkan ID hasil tes saja. Rincian tanpa kredensial: `artifacts/email-otp-result.json`. Kedaluwarsa berdasarkan durasi konfigurasi dan kirim ulang nyata ke inbox belum diverifikasi.

Pengujian inbox aktual: `artifacts/email-e2e-result.json` mencatat registrasi diterima, user baru dibuat, OTP dikonfirmasi, login password sesudah aktivasi berhasil, dan pembersihan selesai. Pengguna mengonfirmasi bahwa OTP sudah dimasukkan pada browser uji. Permintaan email recovery juga diterima API, tetapi pengiriman/tautan recovery pada pengujian ini tidak dikonfirmasi pengguna dan tidak dianggap teruji penuh hanya dari respons API.

Pemeriksaan lanjutan: penghapusan/penggantian digit diperbaiki; kotak menerima paste dan autofill OTP. Kirim ulang sukses membersihkan kode lama, menampilkan respons netral untuk melindungi privasi akun, serta memberlakukan cooldown 60 detik yang tetap berlaku setelah reload. Respons 429 juga menyimpan cooldown; jam lokal hanya mengendalikan UI dan tidak memengaruhi validasi/kedaluwarsa Supabase. Operasi verify/resend tidak berjalan bersamaan. Navigasi ke onboarding hanya dilakukan jika verifikasi menghasilkan sesi, lalu pending email dihapus dari browser. Tanpa konteks email pendaftaran, halaman mengarahkan pengguna lewat tautan kembali yang sudah tersedia.

Tiga tes browser OTP lulus: satu memakai Auth hosted aktual (termasuk reload sesi dan penolakan replay melalui form), dua memakai fault injection untuk menguji UI saat OTP kedaluwarsa, SMTP/rate limit, jaringan gagal, dan respons tanpa sesi. Tes fault injection tidak mengirim email dan bukan bukti masa berlaku atau SMTP hosted. Desain/class visual halaman tetap dipertahankan.

Referensi: [Zoho SMTP](https://www.zoho.com/mail/help/zoho-smtp.html), [Supabase SMTP](https://supabase.com/docs/guides/auth/auth-smtp), [Supabase email templates](https://supabase.com/docs/guides/auth/auth-email-templates).
