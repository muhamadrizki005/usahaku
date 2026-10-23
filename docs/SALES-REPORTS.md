# Laporan dan ekspor toko

Pengguna menyetujui tahap laporan toko pada 23 Oktober 2026: tanggal WIB, metode pembayaran, omzet/diskon/transaksi/unit, pembatalan/refund manual, produk terlaris, CSV dan PDF. Tidak termasuk laba, HPP, pajak baru, gateway pembayaran atau operasional restoran/salon.

## Implementasi

- [x] `/dashboard/reports` memakai kerangka `DashboardSection`, kartu metrik dashboard, serta gaya tabel/field yang sudah ada. Tidak mengubah palet, typography, landing, navigation atau halaman lain.
- [x] Default 7 hari kalender termasuk hari ini dalam WIB. Tanggal awal/akhir inklusif; query database menggunakan awal WIB sampai awal hari setelah tanggal akhir, dengan batas akhir eksklusif. Validasi tanggal kalender tahun 2000–2100, urutan dan maksimal 366 hari. Query berulang/array untuk filter ditolak. Metode: semua/tunai/QRIS/transfer.
- [x] Fungsi baca `read_sales_report` memeriksa role aktif owner/admin dan usaha toko. Semua SELECT memakai business ID terverifikasi. Data penjualan dan refund dibaca dalam satu snapshot database agar perubahan bersamaan tidak menghasilkan ringkasan/tabel dari kondisi berbeda. Tidak memakai service key untuk pembacaan website/ekspor.
- [x] Omzet = subtotal dikurangi diskon untuk transaksi selesai saja; rata-rata transaksi dibulatkan half-up ke rupiah. Jumlah produk mempertahankan 3 desimal. Penjumlahan memakai BigInt agar akumulasi uang/jumlah tidak kehilangan presisi ketika melewati Number.MAX_SAFE_INTEGER.
- [x] Pembatalan dikeluarkan dari periode penjualan asal menggunakan status saat laporan diambil, termasuk bila pembatalannya terjadi sesudah periode itu. Refund manual memakai tanggal pembatalan, termasuk transaksi yang penjualan asalnya berada di periode sebelumnya. Refund ditampilkan terpisah dan tidak dikurangi dua kali dari omzet. Ini bukan laporan arus kas atau laba.
- [x] Produk terlaris dikelompokkan menurut ID dan satuan dari snapshot penjualan selesai. Nama/SKU dari snapshot terbaru dalam hasil; tidak mengambil harga/nama katalog saat ini. Bisa diurutkan berdasarkan jumlah atau nilai barang sebelum diskon transaksi. Satuan berbeda tidak dikonversi atau dianggap setara.
- [x] Ringkasan metode pembayaran, tabel penjualan, tabel pembatalan/refund dan produk. Tabel layar maksimal 25 baris per halaman; ekspor/cetak memakai seluruh hasil filter, bukan halaman yang terlihat.
- [x] Fungsi mengembalikan JSON agar tidak terpotong batas default 1.000 baris REST. Batas eksplisit 20.000 penjualan atau 20.000 refund per hasil; jika terlampaui, seluruh laporan ditolak dan pengguna diminta mempersempit tanggal. Tidak ada truncation diam-diam.
- [x] `/api/reports/sales` menghasilkan CSV UTF-8 BOM dengan bagian metadata, ringkasan, penjualan, refund dan produk. Nilai uang rupiah bulat; field berisi koma, kutip atau newline di-quote. Teks dengan awalan formula/tabs dilindungi apostrof. CSV memakai snapshot terbaru saat unduhan, dengan waktu pengambilan. Penjualan dibatalkan menampilkan total asli dan omzet diakui nol.
- [x] Tombol **Cetak / Simpan PDF** memakai dialog cetak browser (pilih Save as PDF), bukan download PDF server otomatis. Salinan cetak memakai data yang sama dengan layar, seluruh baris, layout A4 landscape, header tabel berulang dan navigasi/form disembunyikan. Tidak ada format baru pada halaman lain atau global CSS override.
- [x] Halaman laporan owner/admin saja. CSV memeriksa sesi/role/active/must-change-password setiap request; respons CSV/error `private, no-store`, `nosniff`, `Vary: Cookie`. Anonim 401, kasir/nonaktif/wajib ganti sandi 403; API tidak menerima business ID klien sebagai konteks akses. Kasir tetap memakai riwayat transaksi sendiri yang sudah ada.

## Migrasi

`supabase/migrations/202610230001_sales_reports.sql` sudah dijalankan pengguna dan diverifikasi melalui Supabase aktual pada 23 Oktober 2026. Hanya menambah fungsi baca laporan serta indeks refund; tidak mengubah tabel/data transaksi, stok, pelanggan atau demo. Tidak perlu menjalankan ulang migrasi ini maupun migrasi lama, atau reset database.

## Status pengujian

- [x] `npm.cmd test`: 18 tes lokal lulus. Tes baru PostgreSQL/PGlite menjalankan migrasi lengkap, memeriksa batas WIB tepat, metode, pembatalan menurut tanggal asal, refund menurut tanggal pembatalan, role/tenant, nonaktif/wajib ganti sandi, hasil 1.001 baris dan penolakan hasil di atas 20.000.
- [x] Tes perhitungan: uang dan pecahan yang akumulasinya melewati batas integer aman JS, rata-rata, peringkat jumlah/nilai, validasi tanggal/array/metode, BOM/quote/formula CSV.
- [x] TypeScript dan build produksi lulus.
- [x] Migrasi tersedia di Supabase website; fungsi berhasil dipanggil dengan sesi owner/admin terverifikasi.
- [x] `scripts/test-reports.mjs`: pengujian Supabase aktual lulus dengan akun baru, checkout/cancel asli lalu penempatan waktu hanya pada ID uji, role/tenant, hasil 1.001 transaksi dan snapshot seluruh data usaha lama sesudah cleanup. Contoh batas WIB: omzet Rp3.250, diskon Rp500 dan refund periode lama Rp5.000 tepat, tanpa pengurangan ganda.
- [x] `tests/browser/reports.spec.ts`: satu skenario end-to-end lulus (48 detik): halaman/filter/ranking, CSV, tanggal invalid/kosong, private export, peran/antarusaha, nonaktif, mobile 390px, pagination dan seluruh baris cetak PDF. Data uji dibersihkan dan snapshot data sebelumnya tetap identik.
- [x] `scripts/verify-report-pdf.mjs`: PDF aktual 6 halaman memuat seluruh 33 transaksi uji, termasuk 30 referensi tambahan yang diverifikasi satu per satu, tanpa catatan profil privat. Keenam halaman dirender dan diinspeksi visual: header tabel berulang, referensi panjang membungkus di sel, tidak ada teks terpotong atau bertumpuk. Tampilan desktop dan mobile juga diinspeksi. Poppler portabel tersedia di cache QA, bukan dependency aplikasi. Sumber paket: [Poppler Windows](https://github.com/oschwartz10612/poppler-windows).

Hasil tersimpan di `artifacts/reports/`: `backend-results.json`, `browser-results.json`, `pdf-results.json`, screenshot desktop/mobile, CSV, PDF dan render tiap halaman. Semua pemeriksaan tahap ini selesai; tidak ada migrasi tambahan yang menunggu pengguna. Akun/data demo tetap utuh; cleanup hanya menyentuh ID yang dibuat oleh tes.

## Perintah verifikasi setelah migrasi

```powershell
node --env-file=.env.local scripts/test-reports.mjs
$env:TEST_BASE_URL='http://localhost:3000'
node --env-file=.env.local node_modules/@playwright/test/cli.js test tests/browser/reports.spec.ts
node scripts/verify-report-pdf.mjs
```

Poppler dapat diarahkan melalui env `REPORT_PDF_TOOLS` ke folder bin berisi `pdfinfo`, `pdftotext`, `pdftoppm`; Windows memakai `.exe`. Paket portable cache saat ini tidak perlu di-commit. Bukti PDF QA berisi data uji, bukan data pengguna asli.
