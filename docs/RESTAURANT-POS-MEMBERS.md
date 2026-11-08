# Kasir dan member restoran/cafe

Branch `feat/restaurant-pos-members`, 8 November 2026. Cafe dan restoran memakai kategori `restaurant` yang sama. Tidak ada commit, push, merge atau deployment oleh agent.

## Perilaku

- Katalog menu dan pencarian/kategori di kiri, keranjang/pembayaran di kanan pada desktop; bertumpuk di layar sempit. Daftar pesanan berhalaman tetap tersedia di bawahnya. Keranjang kosong hanya menampilkan arahan memilih menu.
- Simpan pesanan sebelum mencatat pembayaran. Pesanan tersimpan tetap ada jika pengguna belum membayarnya atau memilih Pesanan baru; tindakan itu tidak membatalkan pesanan lama. Bayar/Ubah pada daftar membuka kembali pesanan di workbench.
- Makan di tempat boleh belum memilih meja, termasuk saat pembayaran. Jika memilih meja, kapasitas, status terpakai dan penguncian reservasi tetap diperiksa server. Reservasi tetap memerlukan meja dan kedatangan sebelum pelunasan.
- Kotak meja menampilkan status Tersedia, Terpakai, Reservasi, gabungan Terpakai/reservasi atau Nonaktif. X membuka konfirmasi hapus. Meja dikeluarkan dari daftar dengan `deleted_at`, tanpa menghapus snapshot/referensi riwayat. Pesanan terbuka atau reservasi reserved/seated menolak penghapusan. Nama meja yang sudah dihapus dapat dipakai meja baru dengan UUID berbeda.
- Revisi status: Ikon pensil (label aksesibel Edit meja) berada di kiri atas kotak, dropdown status di tengah antara Edit dan X di kanan atas. Edit langsung membuka formulir; klik nama tetap membuka detail. Pilihan manual Tersedia/Tidak tersedia memakai RPC khusus dan flag pemakaian fisik terpisah dari `active`. Pembayaran tidak membebaskan meja; owner/admin/kasir melepasnya setelah pelanggan pergi. Pesanan belum lunas dan reservasi tetap mengunci penerimaan pesanan baru. Flag aktif pengelola hanya bisa diubah owner/admin melalui Edit. Lihat `docs/RESTAURANT-MANUAL-TABLES.md` beserta migrasi 002?003. Grid menyesuaikan layar agar kontrol status tidak menutupi nama/X. Indikator bulat hijau menandai Tersedia; merah menandai Tidak tersedia, Terpakai atau Reservasi. Teks status tetap ditampilkan agar informasi tidak hanya bergantung warna. Header kotak memakai inset 12px yang simetris, kontrol setinggi 44px, celah minimal 8px, serta jarak antarkotak 16px.
- Dropdown Pelanggan/Non pelanggan memakai komponen POS toko. Member aktif dapat dicari berdasarkan nama/telepon, lalu ditampilkan nomor dan saldo poin. Tambah member membuka modal; hanya owner/admin atau izin pelanggan yang sesuai. Kasir tetap hanya mencari/memilih. Modal dipasang melalui portal dan shared ModalFrame agar tidak membentuk form bersarang; Escape, fokus dan scroll modal dipertahankan.
- Topbar dan menu responsif menambahkan Pelanggan sesuai izin. Asisten Bisnis AI tersedia untuk owner/admin restoran dengan floating panel yang sama seperti toko; reload menyembunyikannya. Tidak membuka AI pada salon atau kasir.
- AI membaca laporan penjualan selesai/refund usaha aktif; tidak memasukkan profil/kontak pelanggan/staf ke prompt. Ringkasan restoran tidak mengarang stok bahan baku/resep, DP belum lunas, pesanan terbuka atau laba. Nasihat umum tetap tersedia. Tidak menulis data atau menjalankan pembayaran.

## Poin

Pengaturan berada di Pengaturan, bagian Poin member restoran. Hanya owner yang dapat mengubahnya. Perolehan dan penukaran default nonaktif; nominal perolehan default Rp10.000 per poin, nilai penukaran default Rp0. Owner harus mengisi nilai positif sebelum mengaktifkan penukaran.

Perolehan saat pelunasan = floor(total akhir / nominal perolehan), seperti toko. DP sendiri tidak menghasilkan poin. Penukaran = jumlah poin bulat × nilai rupiah per poin; sesudah diskon pesanan, sebelum layanan/pajak. Tidak boleh melebihi saldo atau subtotal setelah diskon. Kasir boleh menukar saldo member tetapi tetap tidak boleh memberikan diskon pesanan. Pelanggan non-member tidak memperoleh/menukar poin.

Saldo dikunci bersama transaksi, disimpan dengan ledger, dan memakai request/revisi pembayaran yang sudah ada. Retry setelah respons putus tidak menggandakan transaksi/poin. Pembatalan penuh oleh owner/admin mengembalikan poin yang ditukar dan menarik poin yang diperoleh sebatas saldo tersedia, mengikuti perilaku toko; tidak membuat saldo negatif atau mengirim uang otomatis. Nilai historis transaksi tidak dihitung ulang setelah pengaturan berubah. Penukaran ini khusus restoran pada tahap ini; toko tetap pada implementasi yang sudah ada.

Struk memisahkan diskon pesanan dan potongan poin. Laporan memakai total/discount tersimpan, sehingga potongan poin tidak dikurangkan dua kali. Identitas member memakai foreign key gabungan usaha/customer; tidak menghubungkan transaksi lama berdasarkan nama/telepon.

## Migrasi

`supabase/migrations/202611080001_restaurant_pos_members.sql` menambah kolom meja/member/poin, memperbarui constraint/index, fungsi pengaturan owner, penghapusan meja, save pelanggan restoran, save/pay/refund restoran. Patch fungsi memeriksa anchor body yang diharapkan sebelum menggantinya. Tidak mereset database, menghapus data demo/riwayat atau mengubah checkout toko/salon.

Pengguna sempat melaporkan `relation "sale" does not exist` saat SQL Editor. REST sesudahnya mendeteksi kolom dan fungsi baru; probe pada usaha uji baru berhasil melalui pembuatan member, pesanan tanpa meja, pembayaran/perolehan poin dan refund. E2E browser member/penukaran juga berhasil. Penyebab pesan SQL Editor awal belum berhasil direproduksi; jangan menjalankan ulang file awal yang tidak idempoten jika objeknya sudah ada.

## Verifikasi

- Seluruh 99 unit test lulus, termasuk PostgreSQL lokal untuk poin/checkout/refund, tenant/role, meja opsional, penghapusan meja dan harga dengan diskon/layanan/pajak. Typecheck dan build produksi webpack lulus.
- E2E Supabase aktual berhasil pada workbench baru: modal member tidak mengirim pesanan, telepon/point lookup, pembayaran tanpa meja, perolehan/penukaran, retry setelah respons pembayaran sengaja diputus, struk, meja aktif ditolak hapus, meja terhapus tidak kembali setelah reload, navigasi pelanggan, akses dua kasir dan usaha lain, serta persistensi login baru. Data lama sama dan fixture dibersihkan. Screenshot pada 320/390/768/1440px.
- Satu permintaan AI restoran ke Gemini menghasilkan HTTP 200 dengan jawaban terverifikasi. Run lain sempat melampaui timeout 10 detik milik klien tes; tes final menggunakan batas lebih panjang sesuai timeout provider aplikasi. Kegagalan/kuota provider tetap ditampilkan sebagai error, bukan dianggap data usaha kosong.
- Run browser final lulus seluruh alur, termasuk reset draf Pesanan baru, kotak meja/status/X pada 320/390/768/1440px, serta panel AI dalam viewport HP. Permintaan live AI pada run itu mengembalikan HTTP 502 yang ditangani sebagai error. Probe berikutnya dengan konteks restoran sintetis kembali mendapat HTTP 200, `finishReason=STOP`, dan lolos validasi draft. Error 502 sebelumnya tidak direproduksi pada probe; tidak mengklaim semua permintaan Gemini selalu berhasil dan tidak melonggarkan validasi angka/evidence.
- Regresi reservasi dengan makanan+DP dan pembayaran restoran lulus setelah selector mengikuti pembayaran inline; meliputi jam lintas tengah malam, pembayaran QRIS/transfer/e-wallet, setting revision, retry, refund, laporan CSV/PDF dan pembatasan akses. Regresi pelanggan toko juga lulus setelah selector membedakan toast dan status inline yang ditambahkan upstream.
- Dua tes lama sempat gagal pada hash snapshot tanpa rincian perbedaan. Pembanding diperjelas dengan serialisasi key objek yang kanonik dan diagnostik ID/nama field saja. Uji ulang lulus tanpa perubahan isi data lama; pemeriksaan tidak mengabaikan perubahan nilai/row.
- Revisi dropdown status lulus typecheck, build produksi dan `restaurant-table-availability.spec.ts` pada Supabase aktual. Tes memeriksa perubahan Tersedia/Tidak tersedia, form ubah meja, reload/login baru, penolakan perubahan meja terpakai, urutan Edit/status/X di bagian atas, dropdown di tengah, jarak terhadap nama/X dan overflow pada 320/390/768/1440/1920px. Fixture baru dibersihkan; bukti `.cache/restaurant-table-availability/`. Hasil tersebut mendahului perubahan pelepasan manual; pengujian revisi berikutnya dicatat di `docs/RESTAURANT-MANUAL-TABLES.md`.

Bukti lokal `.cache/restaurant-pos-members/` tidak perlu masuk commit. Akun/usaha fixture baru dibersihkan hanya menurut ID run; tidak memakai akun demo. Tes HP memakai emulasi Edge, belum perangkat fisik/Safari. Tidak menjalankan seluruh suite browser historis; hasil di atas berasal dari tes yang disebutkan. Tidak ada perubahan dependency, kredensial atau environment. File wilayah mentah pengguna tetap tidak disentuh.

Server QA agent pada port 3221 sudah dihentikan setelah pengujian. Server pengguna pada port 3000 tidak dihentikan.

## Pemeriksaan desain

Arah memakai dashboard dan komponen toko yang disetujui pengguna: ENERGY 1 / RHYTHM 1 / MOTION 1. Perubahan komposisi menu/keranjang, status/X meja, tombol member, AI dan navigasi diminta langsung. Panel, Poppins, warna, border, radius serta animasi normal mengikuti komponen bersama.

- Hard Gate PASS untuk scope: build/typecheck/unit serta E2E; empty/loading/error, keyboard Escape/fokus modal dan overflow diperiksa; tidak menambah aset atau klaim pemasaran.
- Purpose-Gate PASS: kolom menu/keranjang memisahkan pemilihan dan pembayaran; status meja berupa teks, X punya nama aksesibel dan konfirmasi; tidak menambah dekorasi.
- Liveliness PASS: hierarki katalog/keranjang dan aksen turquoise/biru mempertahankan motif dashboard; tidak mengubah font/palet.
- Craftsmanship PASS untuk scope: data/poin diverifikasi server, retry dan role diuji, komponen picker/modal dipakai ulang, screenshot desktop/HP diperiksa. Kontras WCAG yang dipakai: teks/panel 7,94:1; turquoise/panel 6,43:1; putih/tombol biru 8,24:1; error/navy 9,40:1.
