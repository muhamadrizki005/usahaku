# Fondasi Barbershop / Salon

Catatan ini merekam tahap fondasi. Perkembangan operasional terbaru ada di [SALON-OPERATIONS.md](SALON-OPERATIONS.md); pernyataan fitur yang belum tersedia di bawah adalah kondisi saat fondasi dibuat.

Branch: `feat/salon-foundation`. Tahap ini mengaktifkan kategori salon pada onboarding, layanan, penata/terapis dan jadwal mingguan. Janji temu, DP, kasir, laporan salon, komisi, stok bahan salon dan booking publik belum termasuk.

## Cara menggunakan

1. Owner baru memilih Barbershop / Salon, mengisi identitas, lalu membuka setup. Kategori yang sudah tersimpan tidak dapat diganti melalui URL atau formulir.
2. Tambahkan layanan dengan nama, harga rupiah bulat, durasi 1 sampai 720 menit, dan status aktif/nonaktif. Harga 0 diperbolehkan. Field harga/durasi baru kosong dengan placeholder.
3. Tambahkan penata/terapis, pilih layanan yang dapat dikerjakan, dan isi jadwal kerja bila sudah diketahui. Tenaga layanan tidak otomatis memiliki akun login. Akun staf tetap melalui Staf & akses, khusus owner.
4. Atur jam usaha. Owner tetap satu-satunya pihak yang mengubah profil, logo dan jam operasional usaha. Pengaturan awal boleh dilengkapi kemudian.
5. Pada Summary, tekan Buka dashboard untuk menyelesaikan onboarding. Data setup sebelumnya sudah tersimpan sebagai draf; dashboard belum terbuka sebelum tindakan tersebut.
6. Setelah selesai, gunakan Layanan atau Penata & terapis pada navigasi dashboard. Pengaturan dan Staf & akses tetap pada tempatnya. Menu transaksi/POS toko tidak ditampilkan untuk salon; akses langsung diarahkan ke layanan.

## Jadwal dan layanan penata

- Zona waktu WIB (`Asia/Jakarta`), satu rentang kerja per hari awal. Jam tutup lebih kecil dari jam buka berarti hari berikutnya, misalnya Minggu 18.00 sampai Senin 02.00.
- Jam sama tidak berarti buka 24 jam dan ditolak. Jadwal yang tumpang tindih, termasuk pergantian Minggu ke Senin, ditolak. Validasi memakai validator jam yang sama pada TypeScript dan database.
- Semua hari nonaktif pada editor penata disimpan sebagai jadwal belum diatur (`null`). Penata masih dapat dibuat tanpa jadwal atau tanpa pilihan layanan.
- Jadwal penata dan jam usaha disimpan mandiri. Perubahan jam usaha tidak menghapus jadwal penata. Saat janji temu dikembangkan, slot layanan harus memakai irisan kedua jadwal tersebut; tahap ini belum membuat slot janji temu.
- Menonaktifkan layanan mempertahankan relasinya pada penata. Owner/admin masih melihat nama dan penanda nonaktif; kasir hanya melihat layanan/penata aktif beserta relasi layanan aktif.
- Tidak ada hapus permanen pada antarmuka. Nama layanan dan nama penata unik per usaha tanpa membedakan huruf besar/kecil. Dua orang dengan nama sama dapat memakai pembeda nama yang sesuai.

## Akses dan penyimpanan

Owner/admin mengelola layanan, daftar penata dan jadwal kerja. Kasir hanya membaca daftar aktif, tanpa akses mutasi atau audit. Role custom belum memperoleh akses salon. Hak kasir atas transaksi miliknya sendiri tetap dipertahankan untuk tahap pembayaran berikutnya.

Semua fungsi memeriksa kategori, keanggotaan aktif, kewajiban ganti kata sandi, status onboarding dan usaha. Owner dapat mengisi draf; staf belum boleh mengakses draf. Tabel memakai RLS dan tidak memberikan hak tulis langsung kepada pengguna. Relasi layanan memakai foreign key gabungan usaha dan resource agar layanan usaha lain tidak bisa dipasang pada penata.

Penyimpanan nama/status/relasi/jadwal penata berlangsung atomik. Revisi menolak editor tab lama; request ID dan kunci per usaha menjaga retry tanpa data/audit ganda. Gangguan dengan hasil belum pasti mempertahankan isi permintaan dan menonaktifkan edit hingga retry atau pemeriksaan ulang. UI tidak mengklaim berhasil jika hasil belum pasti.

Pembacaan RPC tidak terpotong oleh batas default 1.000 baris PostgREST. Batas tahap ini 5.000 layanan, 1.000 penata dan 100 pilihan layanan per penata; penambahan melebihi batas ditolak sebelum tersimpan.

## Migrasi dan pengujian

`supabase/migrations/202611040002_salon_foundation.sql` menambah tabel salon, relasi, audit/request, policy serta fungsi. Constraint kategori diperluas dan fungsi pembentukan profil ditambahkan dukungan kategori barbershop. Tidak ada reset, perpindahan kategori usaha lama atau perubahan nilai transaksi. Seluruh file dibungkus transaksi; migrasi lama tidak perlu diulang. Pengguna mengonfirmasi berhasil diterapkan pada 4 November 2026; file tersebut tidak diubah setelah disampaikan.

Typecheck, build produksi webpack dan seluruh 88 tes unit/PostgreSQL lokal lulus. Tes baru mencakup durasi/harga, lintas tengah malam/pergantian minggu, rollback relasi/jadwal invalid, revisi, retry, nama duplikat, draft, penonaktifan, forced password change, role/antarusaha, 1.006 baris terbaca lengkap, batas 5.000 layanan, dan perbandingan usaha toko/restoran sebelum-sesudah migrasi.

Tes browser fondasi salon pada build produksi dan Supabase aktual lulus: onboarding/back/guard Summary, layanan dan jadwal penata, jadwal bertumpang tindih ditolak, penata tidak membuat akun login, edit oleh admin, revisi tab lama ditolak, respons simpan terputus lalu retry menghasilkan satu data, kasir hanya baca, owner usaha lain ditolak, penonaktifan mempertahankan relasi, sesi baru mempertahankan data, akses Pengaturan/Staf serta pencabutan akses. Fixture dibersihkan dan hash data lama tetap sama, tanpa page error. Percobaan awal berhenti karena akun pembanding fixture belum memiliki nomor kontak; fixture diperbaiki, lalu tes lulus.

Regresi browser diskon/keranjang toko serta operasional restoran lulus. Tes profil lama `tests/browser/profile-setup.spec.ts` berhenti pada baseline tipografi: masih mengharapkan Urbanist, sedangkan instruksi proyek terkini memakai Poppins. Suite tersebut memerlukan pembaruan baseline tersendiri. Alur penuh profil pada suite lama belum terverifikasi pada run ini; tes salon memeriksa font Poppins termuat, penyimpanan jam usaha owner 22.00 sampai 02.00, persistensi setelah reload, dan penolakan perubahan jam oleh admin.

## Desain

Reading this as: formulir operasional salon untuk owner/admin dan daftar baca untuk kasir, memakai dashboard Usahaku yang telah disetujui, ENERGY 1 / RHYTHM 1 / MOTION 1. Tidak ada animasi baru. Poppins, navy/panel, aksen turquoise, tombol biru, ambient background serta posisi navigasi bersama dipertahankan. Ikon gunting menyatakan layanan salon; ikon orang menyatakan tenaga layanan.

Komponen form/modal restoran dan editor jam yang tersedia dipakai kembali. Tabel mempertahankan informasi nama, harga, durasi/status atau layanan/jadwal dan bergulir di dalam kontainernya pada ponsel. Ringkasan hanya menampilkan jumlah resource tersimpan, tanpa statistik penjualan/janji temu yang belum tersedia. Bukti QA berada di `.cache/salon-foundation/`, tidak untuk commit. Agen tidak melakukan commit, push, merge atau deployment.

Pada modal penata, baris jam ditumpuk pada layar kecil agar format native 12-jam beserta AM/PM tetap terbaca. Properti ini hanya diaktifkan untuk editor salon; susunan editor jam usaha/restoran sebelumnya dipertahankan.

Tes salon dijalankan ulang pada build akhir dan lulus. Dialog serta input jam diperiksa pada 320/390/768/1440 px: tidak ada overflow dokumen/dialog, nilai lintas malam tetap tersimpan, menu mobile berfungsi dan Escape menutup dialog. Screenshot atas/bawah modal diperiksa, termasuk AM/PM pada layar 320 px. Server QA port 3221 sudah dihentikan; server pengguna tidak disentuh. Artefak tes lama yang sempat berubah dikembalikan, hasil run disimpan di cache QA.

Delivery gate untuk UI fondasi salon:

- Hard Gate PASS: build/typecheck, 88 tes lokal dan tes browser salon lulus; formulir/validasi/simpan/retry/empty state, akses dan viewport diuji, tanpa data demo baru. Kontras teks pada panel diverifikasi dengan rumus WCAG: teks sekunder 7,94:1, turquoise 6,43:1, muted 5,37:1, pesan error 7,64:1, putih pada tombol biru 8,24:1.
- Purpose Gate PASS: Poppins, logo, warna, ambient background, panel dan posisi navigasi berasal dari desain yang disetujui; ikon gunting/orang menunjukkan layanan/penata. Tidak ada aset atau efek dekoratif baru.
- Liveliness PASS: ENERGY 1 / RHYTHM 1 / MOTION 1; fokus halaman pada daftar layanan atau penata, form mengelompokkan nama/status/keahlian/jadwal, tombol simpan memakai aksi utama biru.
- Craftsmanship PASS: revisi/retry, persistensi sesi baru, hak owner/admin/kasir, isolasi usaha, penonaktifan, keyboard/modal, screenshot HP/desktop serta preservasi data diperiksa. Kegagalan suite profil historis dicatat terpisah di atas dan tidak diklaim lulus.
