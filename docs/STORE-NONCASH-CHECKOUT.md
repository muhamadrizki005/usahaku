# Perbaikan checkout QRIS dan e-wallet toko

Branch: `fix/store-noncash-checkout`, dari `origin/main` commit `3a43431`.

## Penyebab dan perubahan

Kasir mengirim `pointsRedeemed: 0` pada checkout biasa. Fungsi `checkout_pos` memiliki daftar field yang diterima secara ketat dan belum menerima field penukaran poin. Akibatnya transaksi ditolak dengan `22023 / Invalid checkout`, sebelum pembayaran atau stok dicatat. Ini berlaku untuk QRIS, e-wallet, transfer maupun tunai. Pesan sebelumnya hanya muncul di atas katalog dan dapat berada di luar layar saat pengguna menekan konfirmasi.

- Checkout biasa tidak lagi mengirim field penukaran yang tidak digunakan.
- Server action juga menormalkan field nol dari tab/client lama. Field lain tetap diteruskan untuk divalidasi database; harga, diskon, pajak, role, tenant, revisi dan request ID tidak diubah.
- Penukaran positif mengirim ID hadiah dan jumlah poin untuk diverifikasi database. Payload malformed ditolak sebelum RPC; field penukaran tidak dibuang diam-diam. Patch SQL memverifikasi hadiah yang disimpan owner, saldo dan member dalam usaha yang sama, kemudian mencatat saldo, ledger, transaksi dan stok secara atomik. Retry tidak menukar dua kali; refund penuh mengembalikan poin yang ditukar dan membalik poin perolehan sesuai aturan saldo yang sudah ada.
- Potongan poin diterapkan setelah diskon produk/keseluruhan dan sebelum pajak. Hadiah produk mengikuti harga setelah diskon serta jumlah barang di keranjang (maksimal satu unit hadiah). Struk memisahkan potongan poin dari diskon produk/keseluruhan.
- Jalur pengurangan poin dengan service role setelah checkout dihapus. Jalur itu tidak atomik, dapat terulang saat retry, dan menggunakan nama kolom ledger yang tidak sesuai. Perolehan poin yang sudah dihitung database tetap dipertahankan. Pembacaan saldo setelah checkout dibatasi ID usaha dan pelanggan.
- Pesan gagal ditambahkan dekat tombol konfirmasi dengan `role="alert"`. Fokus dan scroll diarahkan ke pesan tersebut. Keranjang tetap tersedia untuk kegagalan yang pasti; hasil yang belum pasti mempertahankan request ID dan penguncian retry yang sudah ada.

Checkout tanpa penukaran tidak memerlukan migrasi. Penukaran memerlukan `202611100006_store_point_redemptions.sql`; tidak mengubah nilai transaksi lama. Pembayaran non-tunai tetap dikonfirmasi manual; aplikasi tidak memproses dana.

**Status migrasi aktual:** pengguna memberikan definisi aktual `checkout_pos` dan `cancel_pos`; guard RBAC-nya sesuai baseline. Kegagalan awal pencocokan berhasil direproduksi dengan CRLF: helper lama menormalkan body fungsi tetapi belum needle pembanding. Helper kini menormalkan body, needle dan replacement; tes membuktikan versi lama gagal/rollback pada CRLF sedangkan versi baru berhasil pada LF dan CRLF. Setelah percobaan berikutnya pengguna melaporkan `42P01: relation sale does not exist`. Statement asal pesan kedua tersebut belum dapat dipastikan dari informasi yang diterima. Karena itu agent memeriksa keadaan aktual, bukan meminta pengulangan lagi: kolom aturan hadiah dan fungsi owner-only sudah tersedia, lalu checkout penukaran serta refund berhasil diuji langsung terhadap database. **Jangan ulang migrasi yang sudah terpasang.** Pernyataan awal agent bahwa seluruh perubahan pasti rollback dikoreksi setelah pemeriksaan aktual. Owner perlu menyimpan ulang aturan hadiah yang sebelumnya hanya berada di fallback browser.

## Pengujian 10 November 2026

- Typecheck `tsc --noEmit`: lulus.
- Build produksi `next build --webpack` pada snapshot terisolasi: lulus.
- Seluruh unit test: 132/132 lulus, termasuk varian LF/CRLF. Mencakup saldo kurang, aturan palsu, tagihan setelah potongan/pajak, hadiah produk pecahan, penukaran serentak, retry, pembatalan, program nonaktif, member nonaktif, role, isolasi usaha dan preservasi transaksi sebelum migrasi. Overload fungsi pengaturan poin ambigu diperbaiki dengan empat argumen eksplisit dan guard owner; fungsi tiga argumen tetap tersedia.
- `scripts/test-store-noncash.mjs`: lulus dengan server Next.js QA dan Supabase aktual. Mengirim HTTP ke server action `checkoutPos` setelah login kasir QA, bukan hanya memanggil helper/RPC. QRIS, e-wallet, tunai dan transfer masing-masing menghasilkan satu transaksi; retry mengembalikan transaksi yang sama; 20 stok awal menjadi 16 setelah empat checkout.
- Endpoint gambar QRIS: kasir QA mendapat HTTP 200; akun di luar usaha mendapat 404.
- `TEST_STORE_REDEMPTIONS=1` lulus terhadap server action pada build produksi lokal dan Supabase aktual. Pengaturan hadiah tersimpan melalui RPC owner, kasir tidak dapat mengubahnya. QRIS dan e-wallet masing-masing menukar 10 poin untuk voucher Rp1.000 dari belanja Rp10.000: pajak 11% menjadi Rp990, total Rp9.990, perolehan 9 poin. Saldo awal 100 menjadi 98 setelah dua transaksi. Retry tidak menukar/memperoleh poin dua kali. Hadiah palsu ditolak tanpa menambah transaksi. Refund owner mengembalikan saldo menjadi 99, retry refund hanya membuat satu ledger refund; kasir ditolak melakukan refund.
- Akun, usaha, aset QRIS dan data tes dibuat terpisah, kemudian dibersihkan hanya berdasarkan ID run. Snapshot usaha/transaksi/stok/pelanggan/ledger/pengaturan pembayaran yang sudah ada tetap sama.
- Tidak mengklaim pengujian klik browser/visual atau deployment Vercel. Pengujian HTTP memakai snapshot lokal yang terhubung ke Supabase aktual. Server QA agent port 3234 telah dimatikan; server pengguna tidak disentuh.

Jalankan skrip dengan `node --env-file=.env.local scripts/test-store-noncash.mjs` setelah server QA tersedia. `TEST_BASE_URL` mengatur origin; `TEST_ACTION_MANIFEST` menunjuk manifest server action build yang sama dengan server tersebut. Default skrip mengikuti snapshot QA lokal pada `.cache/store-noncash-qa`.

Environment, cache, build, data fixture dan `next-env.d.ts` tidak perlu masuk commit. Belum commit, push, merge atau deploy; Vercel baru mendapatkan perbaikan setelah perubahan di-merge dan deployment berhasil.
