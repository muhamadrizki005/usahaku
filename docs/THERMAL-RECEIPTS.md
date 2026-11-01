# Struk kasir

Struk toko dan restoran memakai komponen `components/sale-receipt.tsx` yang sama untuk tampilan layar dan cetak. Ukuran dasar 80 mm, latar putih, teks gelap, tipografi monospace, nama usaha di tengah, serta garis putus-putus/dobel mengikuti permintaan pengguna. Halaman dashboard lainnya tetap memakai desain yang sudah disetujui.

Data identitas usaha berasal dari profil yang tersimpan. Baris produk, harga, diskon, pajak, kasir, pelanggan, pembayaran, dan kembalian berasal dari snapshot transaksi. Tabel barang berisi Nama Barang, Qty beserta satuan, Harga/U, serta Total setelah diskon. Harga per unit sebelum diskon tetap dicoret bila ada diskon produk. Total Item menghitung jumlah baris produk, bukan penjumlahan kuantitas: satu baris beras 0,25 kg berarti 1 item; beras dan susu berarti 2 item. Nama panjang membungkus dalam kolom dan footer memakai label TOTAL BAYAR. Transaksi dibatalkan tetap memiliki struk, nomor yang sama, alasan, dan konfirmasi pengembalian dana manual.

Footer berisi ucapan terima kasih dan instruksi menyimpan bukti pembayaran. Tidak ada akun Instagram contoh atau kebijakan retur yang dibuat untuk toko. Pengaturan footer khusus belum termasuk pekerjaan ini.

## Nomor transaksi

Migrasi tambahan: `supabase/migrations/202611010004_receipt_numbers.sql`.

- Format baru `TRX-KODETOKO-YYYYMMDD-0001`; UUID tetap menjadi primary key dan parameter URL transaksi.
- Nomor urut per usaha dan hari kalender WIB, dimulai 0001. Setelah 9999 menjadi 10000, tanpa pemotongan digit.
- Trigger database menetapkan nomor saat transaksi berhasil dibuat, baik dari POS toko maupun pembayaran pesanan restoran. Tidak ada penghitung di browser.
- Counter memakai upsert atomik per usaha/hari. Checkout, nomor, stok, dan pencatatan idempotensi berada dalam transaksi database yang sama. Kegagalan/rollback tidak mengonsumsi nomor.
- Retry dengan operation ID yang sama mengembalikan transaksi yang sama. Pembatalan tidak menghapus, mengganti, atau menggunakan ulang nomor.
- Nomor tidak dapat diubah. Tabel counter tidak dapat dibaca/diubah langsung oleh owner, admin, atau kasir; akses transaksi tetap mengikuti RLS yang sudah ada.
- Migrasi tidak menomori ulang transaksi lama: nilai baru tetap null dan tampilan memakai kode UUID lama. Tidak ada perubahan nilai transaksi atau data demo.
- Halaman riwayat, detail/struk, notifikasi POS, ringkasan, serta referensi laporan/CSV memakai `saleCode()` yang sama.

## Cetak

Tombol Cetak struk tetap memanggil dialog cetak browser. Pilih printer/kertas 80 mm, skala 100%, margin minimum/tanpa margin, serta matikan header/footer tambahan browser. Halaman A4/PDF tetap berisi struk selebar 80 mm; tidak ada deteksi otomatis printer atau jaminan ukuran fisik pada driver yang belum diuji. Pengguna printer 58 mm mungkin perlu menyesuaikan skala; pilihan ukuran 58 mm belum ditambahkan.

Pratinjau hanya mencetak struk, tanpa navbar, sidebar, tombol, atau formulir pembatalan. Teks panjang membungkus dalam lebar kertas dan baris item dijaga agar tidak terpotong antarhalaman.

## Verifikasi

- `tests/receipt-numbers.test.ts`: migrasi pada PostgreSQL lokal/PGlite, data lama, nomor WIB lintas tengah malam, counter usaha berbeda, rollback, retry, pembatalan, larangan akses langsung/ubah nomor, dan urutan melebihi 9999.
- `tests/browser/thermal-receipts.spec.ts`: Supabase aktual memakai akun terpisah, enam checkout paralel, tiga retry paralel, akses kasir/antarusaha, diskon/pajak/pecahan, reload, desktop 1440 px dan HP 390/320 px, mode cetak/PDF, serta struk pembatalan. Fixture dibersihkan dan hash data usaha yang sudah ada diperiksa tetap sama.
- Regresi POS dan diskon/pajak memakai spesifikasi browser yang sudah ada. Artefak visual hanya disimpan di `.cache/thermal-receipts/`, tidak untuk commit.

Printer thermal fisik belum diuji.
