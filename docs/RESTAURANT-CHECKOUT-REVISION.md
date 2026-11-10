# Kasir restoran, voucher dan pelanggan transaksi

Branch: `fix/restaurant-salon-checkout`, dari `origin/main` commit `2138235`.

Pengguna mengonfirmasi pembayaran cafe dan barber ternyata aman. Kode pembayaran barber tidak diubah pada revisi ini.

## Perilaku

- **Bayar sekarang** membuka pembayaran di container keranjang. Konfirmasi menjalankan `checkout_restaurant_cart`: pesanan dan pembayaran disimpan dalam satu transaksi database. Jika pembayaran gagal, pesanan baru ikut rollback. Pesanan yang sukses langsung berstatus dibayar, bukan tertinggal pada daftar pesanan belum lunas. Subtotal pratinjau diperiksa terhadap hasil server agar perubahan harga tidak diterima diam-diam.
- **Bayar nanti** menyimpan pesanan terbuka. Pelanggan/meja dapat memesan lagi dengan melanjutkan pesanan yang belum lunas tersebut.
- **Pesan lagi** pada tagihan lunas membuka keranjang baru dengan konteks pelanggan/meja sebelumnya. Tagihan lama dipertahankan. Staf hanya dapat melanjutkan tagihan yang memang boleh mereka akses. Kunci pemakaian meja sebelumnya dialihkan ke pesanan baru dalam transaksi yang sama, dengan guard pesanan aktif/reservasi tetap berlaku. Pembayaran tetap menahan meja sampai dilepas manual sesuai aturan sebelumnya.
- Pelanggan restoran memakai profil member minimal (nama, telepon, poin) melalui fungsi baca yang dibatasi role/usaha, tanpa membuka catatan atau riwayat pelanggan untuk kasir.
- Pilihan **Tukar poin** restoran memakai hadiah voucher/menu yang disimpan owner, sama dengan pola toko. Nominal dan biaya poin diverifikasi database; potongan terjadi setelah diskon dan sebelum biaya layanan/pajak. Perolehan poin membaca pengaturan program poin usaha. Fungsi lama nilai rupiah per poin tetap tersedia untuk kompatibilitas, tetapi kontrol kasir baru memakai hadiah.
- Pengaturan poin restoran memakai bagian program poin yang sudah ada. Panel pajak duplikat dihapus; pengaturan pajak/biaya layanan yang tersimpan di database ditempatkan pada container terakhir di halaman Pengaturan.
- Riwayat transaksi bersama untuk toko/restoran/salon memiliki kolom **Pelanggan**. Transaksi member menampilkan snapshot nama saat checkout; transaksi tanpa `customer_id` menampilkan **Pelanggan Umum**. Nama bebas lama tidak dipasangkan ulang ke member.

Pembayaran QRIS, transfer, e-wallet dan refund tetap dicatat setelah pemeriksaan manual; tidak memindahkan dana otomatis. Tidak mengubah transaksi lama, stok toko, kebijakan refund atau akses kasir atas transaksi petugas lain.

## Migrasi

`supabase/migrations/202611100007_restaurant_checkout_bundle.sql` menambah fungsi checkout/follow-up/member dan memperbarui dukungan hadiah/perolehan poin. Pengguna mengonfirmasi berhasil dijalankan. Tidak perlu mengulang 006 atau migrasi lain yang sudah terpasang. Patch menormalkan LF/CRLF dan mempertahankan pemeriksaan definisi fungsi sebelum perubahan.

## Verifikasi aktual

- Typecheck `tsc --noEmit`: lulus.
- Unit/database test: **135/135 lulus**, mencakup checkout atomik, pembayaran gagal, harga berubah, retry, voucher/menu hadiah, pesan lagi setelah lunas, pesanan ditunda, member, role, tenant dan label pelanggan transaksi.
- Fixture waktu salon diperbaiki memakai jam operasional uji yang jeda tutupnya jauh dari slot QA. Sebelumnya tes kadang gagal bila antrean melintasi jeda satu menit sekitar tengah malam; aturan produksi tidak diubah.
- Build produksi `next build --webpack`: lulus pada snapshot terisolasi. Build tambahan dengan route fixture visual sementara juga lulus. Route tersebut hanya ada di `.cache`, tidak masuk aplikasi utama.
- `scripts/test-restaurant-cart-checkout.mjs`: lulus melalui HTTP server action pada build produksi lokal dengan Supabase aktual. Menguji kasir membaca member tanpa catatan pribadi, pembayaran voucher Rp100.000 − Rp10.000 + pajak Rp9.900 = Rp99.900, rollback pada uang kurang, retry tanpa duplikasi, bayar nanti dari meja/tagihan lunas dan pelunasan tambahan, serta penolakan akses usaha lain.
- Semua akun/usaha/record uji dibuat terpisah lalu dihapus berdasarkan ID run. Hash snapshot data usaha yang sudah ada tetap sama sesudah cleanup.
- Pembayaran layanan salon dasar juga diuji langsung terhadap Supabase dengan `scripts/test-salon-prepaid.mjs`: lulus, fixture dibersihkan dan data lama tidak berubah.
- Pengujian klik/visual browser belum dijalankan: host akses browser tidak tersedia saat pemeriksaan. Tidak mengklaim QA visual desktop/ponsel atau verifikasi deployment Vercel. Perhitungan frontend, typecheck, build dan server action aktual sudah diperiksa.

Skrip aktual memerlukan server QA dan `TEST_BASE_URL`/`TEST_ACTION_MANIFEST` yang cocok dengan build server tersebut; default mengikuti snapshot `.cache/restaurant-salon-checkout-qa`, port 3236. Gunakan akun fixture terpisah dan jangan memakai data demo untuk tes.

Server QA agent dihentikan setelah pengujian. Jangan commit environment, `.cache`, `next-env.d.ts`, data wilayah mentah atau artefak tes. Belum commit, push, merge atau deploy. Vercel baru mendapatkan UI/alur baru setelah perubahan di-merge dan deployment berhasil. Owner perlu menyimpan aturan hadiah pada Pengaturan agar pilihan voucher muncul di kasir.
