# Tahap 3 — profil usaha dan setup

Perkembangan 22 Oktober 2026: tahap produk/inventori sudah diimplementasikan dan diuji; lihat [CATALOG-INVENTORY.md](./CATALOG-INVENTORY.md). Catatan di bawah merekam cakupan tahap 3 pada 21 Oktober, ketika produk masih berupa pratinjau.

Tanggal: 21 Oktober 2026, Asia/Jakarta. Integrasi menggunakan halaman identitas, modal jam, checklist, ringkasan, dan avatar usaha yang sudah ada. Palet dashboard teal, onboarding biru, Inter lokal, logo resmi Usahaku, dan susunan tampilan dipertahankan. Produk, inventaris, pembayaran operasional, dan POS belum dikembangkan.

## Implementasi

- [x] Nama, kontak, alamat jalan, kota/kabupaten, provinsi, dan deskripsi tersimpan di Supabase.
- [x] Owner dapat membuka kembali identitas dari `/onboarding/identity` atau `/dashboard/settings`. Admin/kasir tidak dapat mengedit profil atau jam, termasuk lewat RPC langsung.
- [x] Usaha lama tetap menggunakan `address` yang sudah ada; alamat tidak dipecah atau ditebak oleh migrasi. Owner melengkapi kota/provinsi saat mengedit. Tidak ada pembaruan massal data lama.
- [x] Logo opsional, upload/ganti/hapus; avatar tanpa logo atau gagal memuat memakai maksimal dua inisial nama usaha.
- [x] Nama dan logo tersimpan dipakai di ringkasan serta avatar dashboard yang sudah tersedia. Branding pada prototype produk/inventori/POS hanya membaca profil terverifikasi; tidak ada backend operasional baru.
- [x] Jam operasional tersimpan di database, bukan localStorage. Checklist jam dan staf memakai data server; staf nonaktif tidak dihitung selesai. Staf tetap opsional.
- [x] Produk dan pembayaran dalam setup masih pratinjau. Draft browser tidak menandai modul tersebut selesai atau dianggap sebagai data operasional pada ringkasan.
- [x] Konflik revisi profil/jam ditolak, sehingga tab lama tidak menimpa perubahan tab lain. Muat ulang setelah pesan konflik atau hasil penyimpanan yang belum pasti.

## Migrasi

`supabase/migrations/202610210001_profile_setup.sql` dijalankan oleh pengguna melalui SQL Editor dan dikonfirmasi berhasil. Kolom baru, registry asset, bucket privat `business-logos`, serta perilaku RPC/RLS sudah diverifikasi melalui API hosted. Tidak menjalankan ulang migrasi fondasi dan tidak mereset database. File ini bukan migrasi idempoten; jangan dijalankan ulang.

Penambahan: kolom profil terstruktur, `logo_path`, `profile_revision`, `operating_hours`, `hours_revision`; registry `business_logo_assets`; fungsi create/save profil, save jam, reserve/activate logo, serta claim cleanup. UPDATE langsung kolom profil oleh authenticated dicabut; penulisan memakai fungsi owner yang memeriksa usaha, status aktif, dan revisi. Bucket privat berisi PNG maksimal 2 MiB.

Riwayat migrasi Supabase CLI dan katalog SQL remote penuh belum diinspeksi langsung: service key REST bukan koneksi SQL. Konfirmasi SQL Editor dan pengujian perilaku bukan bukti bahwa tabel history CLI telah terisi.

## Aturan jam

- Zona waktu tetap **Asia/Jakarta (WIB)**, format 24 jam `HH:mm`.
- Satu interval dimulai per hari; minimal satu hari buka untuk menyimpan jadwal.
- Tutup lebih lambat dari buka: selesai pada hari yang sama. Contoh Senin 09:00–21:00.
- Tutup lebih awal dari buka: selesai **hari berikutnya**. Contoh Senin 22:00–02:00 mencakup Selasa 00:00–02:00; tampilan menambahkan `(+1 hari)`.
- Hari `Tutup` berarti tidak ada interval baru yang dimulai hari itu. Ekor interval hari sebelumnya tetap berlaku.
- Buka sama dengan tutup ditolak; bukan kode buka 24 jam. Buka 24 jam dan beberapa shift per hari belum didukung.
- Interval tidak boleh bertumpang tindih, termasuk Minggu menuju Senin. Batas persis bersambung diperbolehkan: Minggu 22:00–02:00 dan Senin 02:00–09:00.
- Validasi sama diterapkan di form, server action, dan fungsi/check database. Jadwal yang belum diisi tetap `null`; itu berbeda dari jadwal tersimpan yang valid.

## Keamanan dan kegagalan parsial logo

1. Server memeriksa PNG/JPEG/WebP asli, ukuran input maksimal 2 MiB, dimensi maksimal 4096×4096, dan gambar statis. Sharp menormalisasi orientasi, membatasi dimensi output 512px, menghapus metadata, dan menghasilkan PNG. Nama file pengguna tidak dipakai sebagai path.
2. Owner memesan ID/path UUID milik usahanya, lalu server mengunggah file baru tanpa overwrite. Akun browser tidak memiliki izin insert/update/delete Storage atau akses langsung registry.
3. RPC mengunci profil dan kandidat, memeriksa revisi serta keberadaan/metadata objek, kemudian secara atomik mengganti pointer. Logo lama baru menjadi `retired` sesudah commit.
4. Bila respons aktivasi hilang, server membaca ulang pointer. Jika hasil belum pasti, kandidat tidak langsung dihapus: transaksi remote mungkin masih berjalan. Profil/usahanya tidak dibatalkan atau dihapus.
5. Cleanup harus memakai `claim_business_logo_cleanup`. Claim mengunci profil dan asset, melindungi logo aktif, menunggu staging minimal 15 menit, dan menandainya `deleting` sebelum penghapusan fisik. Asset yang sudah di-claim tidak bisa diaktifkan kemudian. Urutan kunci konsisten mencegah race aktivasi/cleanup.
6. Kegagalan penghapusan tidak membatalkan logo baru yang sudah tersimpan. Status `deleting` dapat dicoba lagi, termasuk ketika file sudah terhapus tetapi pembaruan registry gagal. Tombstone `deleted` dipertahankan.
7. Penghapusan logo mengosongkan pointer terlebih dahulu. Tidak pernah menghapus file aktif sebelum perubahan database berhasil.

Profil teks dan Storage bukan satu transaksi. Jika teks berhasil disimpan tetapi pergantian logo gagal, teks tetap tersimpan dan form memberi peringatan. Saat pembuatan usaha, kegagalan logo tetap mempertahankan usaha dengan fallback inisial dan pemberitahuan di setup.

Website memakai `/api/business/{id}/logo`, bukan URL publik atau signed URL. Proxy memeriksa pengguna, membership, wajib ganti sandi, dan status aktif pada setiap permintaan; respons `private, no-store`. Download internal memakai nonce baru untuk melewati cache CDN. Pengujian awal mendapati URL Storage yang sudah pernah diunduh masih mengembalikan gambar setelah staf nonaktif; pengujian RLS memakai permintaan baru tanpa cache. File yang sudah diunduh tentu tidak dapat ditarik kembali dari perangkat pengguna. Referensi cache: [Supabase Smart CDN](https://supabase.com/docs/guides/storage/cdn/smart-cdn).

## Pemeliharaan

Simpan/ganti/hapus profil mencoba cleanup asset usaha terkait. Untuk staging tertinggal atau penghapusan yang terus gagal, jalankan di server tepercaya:

```powershell
node --env-file=.env.local scripts/cleanup-business-logos.mjs
```

Script memproses maksimal 100 kandidat per eksekusi melalui claim yang sama. Jalankan kembali bila antrean melebihi batch. Tidak memilih berdasarkan nama file atau menghapus seluruh bucket. Kunci service role hanya di server.

- [ ] Penjadwalan rutin cleanup pada hosting produksi belum dipasang; infrastruktur hosting/scheduler belum ditentukan. Cleanup saat penyimpanan dan perintah maintenance sudah tersedia.

## Bukti pengujian

- `npm run build` dan TypeScript lolos.
- `npm test`: 11 tes lokal lolos, termasuk migrasi pada PostgreSQL PGlite, RLS/grants, batas role, revisi, jam lintas minggu, serta simulasi upload gagal, respons commit hilang, dan cleanup gagal.
- `scripts/test-profile-setup.mjs`: tes Supabase aktual lolos; dua profil, persistensi, akses silang ditolak, revisi, jam, private Storage, kegagalan aktivasi kandidat belum diunggah, race penggantian, cleanup, admin dan penonaktifan. Snapshot seluruh usaha/anggota/audit/registry yang ada sebelum rangkaian ini identik setelah tes. Hasil: `artifacts/profile-setup/backend-results.json`.
- `scripts/test-supabase.mjs`: regresi fondasi akun/role/nonaktif lolos, data demo tetap identik.
- Lima tes browser akhir lolos: regresi akun, dua skenario UI OTP, OTP hosted, dan rangkaian profil/setup. Rangkaian profil juga diuji lagi dengan decode gambar sungguhan, fallback ketika request gambar gagal, batas 2 MiB, dan JPEG yang dinormalisasi menjadi PNG; lolos. Hasil terakhir: `artifacts/profile-setup/browser-results.json`, `artifacts/accounts-e2e-result.json`, serta hasil OTP yang sudah tersedia.
- Metrik judul, deskripsi, kartu, label, dan tombol identitas dibandingkan dengan baseline `artifacts/typography/after.json` pada 1280×665, skala perangkat 1 dan zoom 100%; font, ukuran, weight, line-height, tracking, warna, dan radius cocok. Inter benar-benar termuat. Bukti: `artifacts/profile-setup/ui-preservation.json` dan screenshot `identity-approved-viewport.png`. Dashboard tetap teal; screenshot ringkasan/setup/dashboard memakai 1440×1000.
- Pengujian tahap ini tidak mengirim OTP/recovery ke inbox pribadi dan tidak membuktikan pengiriman email produksi.

Tes hanya membuat akun dan usaha baru. Cleanup memilih ID milik run tersebut, termasuk ID yang mungkin sudah ter-commit sebelum assertion gagal. Data demo dan usaha pengguna dipertahankan.

Operasi tulis profil, jam, dan aktivasi logo diberi batas waktu 15 detik serta tidak dicoba ulang otomatis. Respons yang terputus bukan bukti transaksi dibatalkan: form meminta pemeriksaan ulang, dan siklus logo mempertahankan kandidat untuk rekonsiliasi/cleanup yang terkunci. Lockfile npm dan pnpm diselaraskan; Sharp adalah dependensi langsung, bukan hanya dependensi transitif Next.

Dukungan WebP (23 Oktober 2026): input WebP statis diterima bersama PNG/JPEG, tetap maksimal 2 MiB dan 4096 x 4096. Server menormalisasi ke PNG; storage, policy akses, dan lifecycle penggantian gambar tetap sama. Verifikasi aktual fungsi server: WebP/PNG/JPEG berhasil diproses, transparansi WebP dipertahankan, isi palsu/MIME lain/file terlalu besar/dimensi berlebih ditolak; TypeScript lulus.
