# Perbaikan UI/UX tinggi–sedang

Branch `fix/ui-ux-priority`, dibuat 1 November 2026 tanpa commit, push, atau merge. Perubahan stok dan diskon/pajak yang sebelumnya belum di-commit tetap dipertahankan; salinan pembanding lokal ada di `.cache/ui-ux-priority/baseline/`. Branch ini belum merupakan diff PR yang terpisah dari pekerjaan sebelumnya sampai perubahan dasarnya di-commit.

## Cakupan

1. **Kasir HP:** grid dan anak flex dibatasi `min-width:0`; nama panjang membungkus di keranjang. Kartu katalog juga menggunakan track `minmax(0,1fr)` agar ukuran intrinsik namanya tidak menggeser scroll container ke samping.
2. **Topbar:** menu tengah mengikuti ruang flex, tanpa absolute. Pada lebar di bawah 1536px, menu lengkap memakai drawer yang sudah ada. Pada desktop lebar menu horizontal tetap tersedia; role dan tujuan navigasi tetap sama. Sidebar tidak dipindahkan.
3. **Modal produk:** X, Batal, backdrop dan Escape tidak menutup modal ketika request simpan berlangsung; input terkunci. Penjaga ref mencegah klik simpan ganda sebelum render berikutnya.
4. **Fokus modal:** modal produk memakai native `dialog`, fokus awal ke input, Tab/Shift+Tab dibatasi dan fokus dikembalikan ke pemicu. Modal setup memakai dialog native dengan kontrol tutup yang mengikuti status simpan. Dropdown kategori tetap bisa dioperasikan di dalamnya.
5. **Login/signup HP:** urutan visual menampilkan formulir sebelum promosi. Komposisi dua kolom desktop, aset, ukuran font dan palet dipertahankan.
6. **Tabel HP:** produk, inventori, pelanggan dan transaksi memakai ringkasan baris berlabel di bawah 640px. Harga, stok/status dan tindakan tersedia tanpa harus menemukan scroll horizontal. Desktop tetap tabel. Pagination pelanggan/transaksi membungkus di layar sempit.
7. **Pembayaran:** konfigurasi setup, ringkasan, Pengaturan dan POS berasal dari server yang sama. Owner mengelola metode; admin/kasir hanya membaca dan menggunakan metode aktif. E-wallet yang belum didukung tidak lagi ditawarkan sebagai metode yang bisa diaktifkan. QRIS melalui aplikasi e-wallet tetap dapat dicatat sebagai QRIS manual.
8. **Kasir dan pelanggan:** aksi Tambah pelanggan hanya tampil untuk owner/admin. Kasir tetap bisa mencari dan memilih pelanggan aktif; layanan backend tetap memeriksa role.

Breadcrumb, warna status stok nol, ukuran checkbox dan temuan rendah tidak diubah. Tidak ada redesign palet/typography atau perubahan hak akses produk, stok, diskon maupun laporan.

## Migrasi dan aturan pembayaran

- `202611010002_business_payments.sql`: tabel konfigurasi dan aset QR, bucket privat `business-payment-qr`, RLS, RPC owner-only, versi konfigurasi serta pemeriksaan metode pada checkout.
- `202611010003_optional_payment_methods.sql`: mempertahankan kemampuan menonaktifkan seluruh metode, termasuk menghapus QRIS ketika QRIS satu-satunya metode. Kasir menampilkan status belum ada metode aktif dan tombol checkout tidak dapat digunakan sampai owner mengaktifkan metode.

Pengguna mengonfirmasi kedua migrasi berhasil. Migrasi sebelumnya tidak diulang; tidak ada reset atau backfill transaksi/demo. Usaha tanpa konfigurasi server tetap memiliki metode manual bawaan seperti sebelumnya sampai owner menyimpan konfigurasi eksplisit.

Pengaturan pembayaran dapat diedit melalui Pengaturan setelah onboarding selesai, tanpa membuka kembali onboarding. Draf pembayaran lama dalam localStorage dipertahankan; jika belum ada konfigurasi server, draf dapat dimuat saat editor dibuka tetapi harus diperiksa/disimpan secara eksplisit. Checklist/ringkasan hanya membaca konfigurasi server. Semua metode nonaktif mengembalikan langkah pembayaran ke belum selesai, tanpa menghapus draf usaha atau membuka dashboard otomatis.

QRIS diunggah ke path baru, divalidasi/dekode ulang PNG/JPEG/WebP di server (maksimal 2 MB) dan disimpan sebagai PNG privat. Konfigurasi lama tetap aktif jika upload/commit gagal. Commit tidak pasti direkonsiliasi sebelum dinyatakan sukses. Gambar lama baru diklaim untuk cleanup sesudah konfigurasi berpindah; file aktif tidak boleh diklaim, dan staging mendapat jeda 15 menit. URL QR memeriksa sesi serta RLS setiap permintaan, tanpa public URL atau signed URL jangka panjang.

Klik X pada gambar hanya mengubah formulir: QRIS nonaktif dan preview hilang. Batal/reload tanpa simpan mempertahankan konfigurasi sebelumnya. Simpan berhasil memutus referensi gambar dan menonaktifkan QRIS secara atomik. Request checkout menyertakan versi konfigurasi; perubahan metode saat keranjang masih terbuka ditolak sebelum pencatatan pembayaran. Replay transaksi yang sudah dicatat tetap berfungsi meski konfigurasi kemudian berubah.

## Verifikasi

- Typecheck dan 59 tes unit/database lulus. Tes baru mencakup semua metode nonaktif, owner/admin/kasir, isolasi tenant, revisi, gambar belum terunggah, cleanup file aktif/staging, stale checkout, metode nonaktif dan idempotensi.
- Tes browser delapan perbaikan lulus pada Supabase aktual: konfigurasi setup terbaca di browser baru, gambar privat menolak sesi anonim, header 1024/1280/1366/1440/1536/1920px, keranjang dan tindakan tabel 320/390px, fokus keyboard, semua jalur penutupan saat pending, penghapusan gambar sebelum/sesudah simpan, konflik revisi tanpa kehilangan gambar lama, serta checkout kasir.
- Form login/signup diuji pada 320/390/768/1440px. Regresi POS, diskon/pajak dan input angka produk lulus. Tes setup disesuaikan dengan custom dropdown yang sudah ada dan penyimpanan server; kasus QRIS sebagai metode terakhir diuji ulang.
- Build produksi webpack dilakukan pada salinan sumber terpisah untuk menjaga server pengguna. Bukti/screenshot berada di `.cache/ui-ux-priority/`; bukan untuk commit. Hasil putaran akhir dicatat setelah pengujian selesai.

Putaran akhir: setup-controls lulus (34,2 detik), autentikasi responsif lulus (2,2 detik), serta perbaikan prioritas terintegrasi lulus (43,3 detik). Regresi POS, diskon/pajak dan input angka produk sebelumnya lulus masing-masing 44,2 / 37,3 / 18,3 detik. Typecheck dan build produksi versi akhir lulus. Seluruh 59 tes unit/database lulus. Tes prioritas mencatat `pageErrors: []`, `cleanup: true`, dan `legacyUnchanged: true`.

Pengujian menemukan hydration mismatch tambahan pada timestamp produk ketika SSR dan browser melewati batas menit. Halaman produk dan POS kini menerima satu snapshot waktu dari server; tidak memakai suppressHydrationWarning. Tes browser memajukan jam klien dua menit dan tetap lulus tanpa mismatch. Tidak mengubah font, palet, atau format waktu WIB.

Tidak ada server baru yang dinyalakan untuk tes ini: browser memakai server pengguna port 3000. Build berjalan terpisah tanpa menimpa `.next` pengguna. File generated `next-env.d.ts` pengguna dipertahankan dari salinan awal. Breadcrumb dan dua temuan rendah tetap tertunda sesuai cakupan.

Akun uji dibuat terpisah. Cleanup hanya ID dan objek Storage milik run tersebut; pemeriksaan hash data usaha lama pada tes prioritas memastikan data lama identik. Tidak memanggil Gemini atau mengirim email aktivasi pada tes ini. Perangkat fisik, keyboard virtual iOS/Safari dan seluruh kombinasi data tidak diuji.

## Antislop

During (session override). Design read: perbaiki kegagalan ukuran, navigasi dan state dalam identitas Usahaku yang sudah disetujui, ENERGY 1 / RHYTHM 1 / MOTION 0. Tidak memperkenalkan font, warna, dekorasi atau animasi baru. Gate: kontrol punya fungsi/label, sumber pembayaran nyata dan terisolasi, tidak ada sukses palsu ketika save gagal, fokus dan state pending diuji, screenshot HP diperiksa, serta data uji dibersihkan.
