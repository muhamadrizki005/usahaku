# Pencarian pelanggan dan navigasi dashboard

Branch: `fix/customer-search-navigation`.

## Perilaku pelanggan

- Kasir toko dan restoran memakai pencarian yang sama dengan formulir kunjungan salon.
- Memilih kategori Pelanggan di kasir langsung membuka daftar awal. Di salon, daftar dibuka saat field pencarian difokuskan/diklik.
- Maksimal 20 pelanggan aktif ditampilkan, diurutkan berdasarkan nama dan ID. Ini bukan seluruh pelanggan yang dimuat ke browser. Pencarian memeriksa seluruh pelanggan aktif usaha, termasuk yang tidak ada pada 20 pilihan awal.
- Satu huruf atau angka dapat digunakan. Pencarian nama tidak peka kapital; nomor awalan 08 dinormalisasi menjadi 628. Karakter `%`/`_` diperlakukan sebagai teks, bukan wildcard.
- Debounce 250 ms untuk kata pencarian. Permintaan kosong saat daftar dibuka tidak menunggu debounce. Respons dari pencarian lama atau field yang sudah ditutup diabaikan.
- Panah atas/bawah menyorot pilihan, Enter memilih tanpa submit formulir, Escape menutup daftar. Klik di luar menutup daftar. Setelah memilih, daftar ditutup dan pilihan dapat dicari ulang.
- UI kasir tetap menampilkan nomor dan saldo poin; salon hanya nama/nomor. Program poin dan aturan checkout tidak diubah.

## Database

Migrasi tambahan: `supabase/migrations/202611090001_customer_search_options.sql`.

Menambah `search_pos_customer_options(uuid,text)`, hanya fungsi baca. Fungsi lama dipertahankan untuk kompatibilitas. Tidak mengubah tabel, profil, saldo, atau transaksi lama.

Fungsi baru memeriksa `has_business_permission(target_id,'pos:view')` dan membatasi `business_id` serta `active`. Respons hanya `id`, `name`, `phone`, dan `points`, tanpa catatan atau riwayat pelanggan. Saldo dibaca dalam query yang sama, sehingga tidak perlu query tambahan yang sebelumnya tidak dapat membaca saldo untuk kasir karena RLS.

Migrasi sudah dijalankan pengguna dan diverifikasi pada Supabase aktual. Tidak perlu mengulang migrasi lama.

## Optimasi render

- `requireAccount`, resolusi role, dan pembacaan profil usaha berbagi hasil dalam satu render server menggunakan React `cache`. Pemeriksaan permission spesifik setiap halaman/action tetap berjalan. Tidak ada cache global atau TTL lintas pengguna. [React cache](https://react.dev/reference/react/cache).
- Ringkasan toko/salon dan kasir toko/restoran memulai pembacaan independen secara paralel sesudah otorisasi. Pembacaan reservasi/pesanan yang memiliki dependensi tetap berurutan.
- Menu utama, sidebar dan menu mobile melakukan prefetch saat pointer masuk, fokus keyboard, atau awal sentuhan. Tujuannya sama persis dengan URL navigasi, termasuk query kategori. Toggle AI tidak melakukan prefetch.
- `app/dashboard/loading.tsx` memberi status loading selama data halaman dimuat, sambil mempertahankan layout bersama. Dynamic routes tetap memerlukan data server; prefetch tidak menjamin perpindahan instan. [Next.js prefetching](https://nextjs.org/docs/app/guides/prefetching).

Tidak ada perubahan region Vercel/Supabase, cache finansial jangka panjang, otorisasi, atau desain navigasi. Pembacaan seluruh riwayat penjualan/katalog yang sudah ada belum diganti menjadi pagination pada pekerjaan ini.

## Pengujian aktual

- Typecheck lulus. Build produksi default Turbopack lulus. Seluruh 103 tes unit/database lulus.
- Tes PostgreSQL baru memakai seluruh migrasi proyek: daftar kosong maksimal 20, satu karakter, nomor 08, pelanggan di luar daftar awal, input panjang/wildcard, pelanggan nonaktif, poin, role tanpa izin, kasir, anon dan isolasi usaha; data sebelum migrasi tetap sama.
- Supabase aktual, akun/usahanya terpisah: toko, restoran dan salon mengembalikan 20 pilihan awal, pencarian `z` menemukan satu pelanggan di luar daftar awal, pencarian telepon berfungsi; akses ke usaha lain ditolak.
- Kasir QA aktual menerima proyeksi terbatas dan saldo 37 poin; tidak dapat membaca baris pelanggan lengkap/catatan. Akses setelah nonaktif dan akses antarusaha ditolak.
- Browser Brave pada build produksi lokal: login QA, daftar awal kasir, satu huruf, pemilihan dengan panah/Enter, navigasi Kasir → Produk → Kasir, logout toko → login salon tanpa konteks usaha lama, pencarian salon dan pengisian nama/telepon lulus.
- Simulasi HP 390px: dropdown salon berada dalam modal, daftar bisa dipilih dan field nama/telepon terisi. Formulir ditutup tanpa menyimpan kunjungan; tidak ada checkout.
- Tes browser lama disesuaikan terhadap role aksesibilitas `combobox`/`option`; seluruh suite E2E otomatis lama belum dijalankan ulang pada pekerjaan ini. Pengujian browser di atas dilakukan manual melalui kontrol browser.
- Browser lokal menampilkan 404 script Vercel Analytics dan peringatan preload font dari konfigurasi yang sudah ada. Tidak diubah dalam scope ini.
- Akun kasir QA dan tiga usaha/owner QA dibersihkan. Server port 3222 dihentikan. Data demo tidak diedit.

Belum ada angka perbandingan latency sebelum/sesudah di Vercel. Perubahan kode belum dipush/deploy, sehingga website Vercel belum memakai implementasi ini.

## Integrasi upstream 9 November 2026

- Branch dimajukan ke `origin/main` pada `8fd41d0` (fast-forward, tanpa commit baru). Perubahan lokal dicadangkan dalam stash `Backup customer search before upstream integration`, lalu diterapkan kembali.
- Konflik `components/salon-appointments.tsx` diselesaikan dengan mempertahankan foto layanan dan notifikasi dari upstream, serta mengganti pencarian lama dengan `CustomerSearch`. Perubahan `dashboard-shell.tsx` tergabung otomatis dan diperiksa.
- Typecheck, seluruh 103 tes unit/database, dan build produksi Turbopack diulang setelah integrasi; semuanya lulus. Pemeriksaan diff tidak menemukan marker konflik atau whitespace error.
- Percobaan browser setelah integrasi terhenti oleh alat kontrol browser yang tidak dapat memastikan URL aktif Windows. Pengujian browser pada bagian sebelumnya adalah hasil sebelum integrasi; belum dapat dinyatakan lulus ulang setelah integrasi.
- Tidak ada commit/push oleh agen. Stash cadangan tetap disimpan, bukan untuk diterapkan ulang di atas hasil yang sudah tergabung. Server QA dan fixture dibersihkan setelah percobaan browser.

## Pemeriksaan UI dalam scope

- Fungsi PASS: pencarian kosong/satu huruf, pilihan keyboard/klik dan penutupan diuji melalui browser; permission/proyeksi diuji di database.
- Gaya PASS: palet/typography tetap memakai komponen kasir yang ada; tidak ada aset atau susunan navigasi baru.
- Responsif PASS: daftar dibatasi tinggi, teks dapat membungkus, kontrol pilihan minimal 44px; modal 390px diperiksa.
- Data PASS: pilihan berasal dari server, tidak ada nilai bisnis rekaan atau perubahan checkout; semua fixture memakai usaha QA terpisah.
