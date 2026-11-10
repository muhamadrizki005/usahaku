# Demo publik dari landing

Branch: `feat/public-business-demo`. Demo toko, restoran/cafe, dan salon dapat dibuka lewat **Coba demo** pada landing tanpa login. Pilihan kategori menggunakan modal landing yang sama; modal memakai `ModalFrame` agar Escape, fokus, dan scroll halaman ditangani seperti modal aplikasi lainnya.

## Batas fitur

- `/demo/toko`, `/demo/restoran`, dan `/demo/salon` membuka Ringkasan. `?view=kasir` membuka keranjang kategori yang sama. `/demo` mengarah ke toko; kategori tidak dikenal menghasilkan 404.
- Perpindahan Ringkasan/kasir hanya memakai navigasi dashboard yang sudah ada (topbar atau menu mobile); tidak ada tombol tab tambahan di area konten.
- Ringkasan menampilkan tujuh transaksi dummy berstatus selesai. Grafik omzet menggunakan `calculateRevenueTrend` dan `RevenueApexChart` yang dipakai dashboard, bukan nilai kosong atau transaksi Supabase. Nilai statistik/pemeringkatan dihitung dari fixture ini.
- Kasir hanya menampilkan katalog contoh, pencarian/filter, tambah ke keranjang, tambah/kurangi jumlah 1–99, hapus, dan total. Salon memakai layanan serta produk contoh; tidak membuat janji temu. Tidak ada penerimaan uang, pembuatan pesanan, penentuan meja, perubahan stok, DP, atau pembayaran.
- **Bayar** dan navigasi fitur lainnya membuka modal **Daftar untuk melanjutkan**, dengan tautan daftar/masuk dan pilihan melanjutkan demo. AI langsung membuka modal, tanpa memunculkan chat atau memanggil Gemini. Pengaturan, akun, notifikasi, transaksi, pelanggan, menu/produk, laporan, inventori, reservasi, dan penata juga dibatasi.
- Keranjang hanya ada dalam memori komponen. Ringkasan/kasir pada kategori sama mempertahankan state selama navigasi React; reload, pindah kategori, atau meninggalkan demo memulai ulang. Tidak ada localStorage, cookie demo, atau akun demo yang dibuat.

## Pemisahan data dan tampilan

`lib/public-demo.ts` berisi fixture dan perhitungan keranjang. Komponen publik tidak mengimpor server action operasional, tidak membuat Supabase client, dan tidak memakai sesi pengguna sebagai akun demo. ID contoh bukan UUID data usaha. Area demo tidak memperbarui sesi Supabase di proxy, sehingga dapat dipakai tanpa konfigurasi/koneksi database dan tidak mengganti cookie akun yang sedang login. Pengecualian ini hanya untuk `/demo` dan `/demo/…`; guard dashboard serta API tetap berlaku.

Chrome dashboard menyediakan pilihan `prefetchEnabled={false}` khusus demo; dashboard asli tetap memakai perilaku sebelumnya. Dengan demikian hover/fokus navigasi demo tidak mengambil halaman dashboard terlindungi. Modal daftar tetap berupa pembatas interaksi demo; keamanan data asli tetap ditangani autentikasi, server, dan RLS yang sudah ada.

Warna, font, radius, panel, grafik, serta navigasi mengikuti komponen/design system saat ini. Tidak menambah palet, gambar, dependency, atau schema. `RevenueApexChart` mendapat pilihan animasi yang default-nya tetap aktif; demo menyesuaikannya dengan perubahan `prefers-reduced-motion` melalui hook yang sudah tersedia.

## Pengujian

Tes unit mencakup fixture seluruh kategori, transaksi selesai/diagram tujuh hari WIB, total keranjang, batas jumlah, penghapusan, fixture tidak berubah, serta proxy publik yang tidak menulis cookie. Skenario Playwright disediakan pada `tests/browser/public-demo.spec.ts` untuk alur landing, tiga kategori, keranjang, modal pembayaran/AI, refresh, serta tidak ada permintaan operasional/Supabase.

Pengujian dilakukan di checkout `.cache/public-demo-qa` dengan instalasi pnpm frozen-lockfile terpisah. Typecheck, 122 tes unit/database, dan build produksi lulus. Tes HTTP pada server produksi QA memverifikasi ringkasan/kasir ketiga kategori tanpa login, fixture transaksi selesai dan wadah grafik, katalog dan keranjang kosong, tampilan fitur terkunci, cookie tidak ditulis ulang, redirect `/demo`, serta 404 kategori asing. Dashboard asli tetap meminta login; API Asisten tetap mengembalikan 401 untuk pengguna anonim dan 403 untuk origin asing.

Tidak memakai akun atau data demo Supabase yang sudah ada. Server QA memakai konfigurasi publik placeholder, tanpa service-role/Gemini key, dan telah dimatikan. Pemeriksaan browser melalui Computer Use terhenti karena alat tidak dapat memverifikasi URL jendela Windows; suite Playwright belum dijalankan sebagai pengganti. Karena itu click-through, fokus modal, pergantian kategori/keranjang secara interaktif, tampilan grafik setelah JavaScript, serta viewport HP/desktop masih perlu verifikasi browser; hasil HTTP dan tes logika tidak diklaim sebagai pengganti tes tersebut. Delivery gate visual/interaksi R-35 belum dinyatakan lulus. Tidak ada commit, push, merge, atau deploy oleh agent.

### Sinkronisasi folder utama

Setelah pengguna menemukan `Cannot resolve react-apexcharts`, dependency yang sudah tercantum dalam manifest/lockfile dipasang di folder utama dengan `npm install --no-save --ignore-scripts --no-audit --no-fund`. `react-apexcharts`, `apexcharts`, dan `exceljs` sebelumnya belum ada pada `node_modules` utama. Manifest serta kedua lockfile tidak berubah; server milik pengguna tidak dihentikan. Typecheck langsung (`tsc --noEmit`) dan 122 tes unit/database di folder utama lulus. Demo di server pengguna `localhost:3000` juga merespons tanpa error modul; halaman Ringkasan dan Kasir toko terlihat di browser pada percobaan berikutnya. Uji klik lanjutan tertahan karena alat mendeteksi input pengguna yang sedang aktif pada jendela yang sama; ini belum dianggap click-through lengkap.
