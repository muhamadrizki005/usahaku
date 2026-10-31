# Dropdown lokasi usaha

Formulir identitas onboarding dan Pengaturan toko memakai komponen `BusinessLocationFields` yang sama. Keempat field bisa dicari dengan mengetik, lalu dipilih dari hasil CSV: Provinsi, Kota/Kabupaten, Kecamatan, Kelurahan/Desa. Field turunan tidak dapat dibuka sebelum induknya dipilih. Mengganti provinsi mengosongkan kota, kecamatan dan desa; mengganti kota mengosongkan kecamatan/desa; mengganti kecamatan mengosongkan desa. Memilih ulang nilai yang sama mempertahankan turunannya.

Kecamatan/desa belum diwajibkan untuk menjaga kompatibilitas profil lama. Jika diisi, server memvalidasi kesesuaiannya dengan induk. Hasil ketikan bukan teks lokasi bebas; pengguna memilih hasil daftar. Escape atau berpindah fokus tanpa memilih mengembalikan tampilan ke pilihan tersimpan dalam form. Keyboard ArrowUp/ArrowDown/Enter/Escape didukung, dengan label, `combobox`, `listbox`, dan active descendant.

Pilihan berasal dari empat CSV yang disediakan pengguna, disalin ke `data/indonesia/` bersama lisensi MIT sumber. `scripts/generate-indonesia-regions.mjs` menghasilkan JSON wilayah dasar, kecamatan, desa, dan manifest jumlah/hash. Jalankan dari root proyek:

```powershell
node scripts/generate-indonesia-regions.mjs
```

Dataset berisi 37 provinsi, 514 kota/kabupaten, 7.277 kecamatan, dan 83.761 kelurahan/desa. README sumber menyatakan Papua Barat Daya belum tersedia. Implementasi mengikuti dataset tersebut; tidak menambahkan wilayah rekaan atau mengklaim data lengkap/terbaru. Tidak perlu API wilayah eksternal atau dependency baru.

Data kecamatan/desa hanya diimpor oleh server. Endpoint internal `/api/regions?level=district&parent=3273` atau `level=village&parent=327302` hanya mengirim anak dari satu wilayah, bukan keseluruhan dataset desa. Data ini publik dan tidak berisi data usaha. Request dibatalkan saat induk berubah; respons lama diabaikan. Loading menonaktifkan field dan kegagalan menyediakan tombol Coba lagi. Dataset besar tidak dimasukkan ke bundle client.

Database menyimpan nama provinsi/kota serta kecamatan/desa. Label membedakan `Kab. Bandung` dan `Kota Bandung`; nama lama `Bandung` tidak ditebak sebagai salah satunya. Data tersimpan yang belum cocok diberi keterangan `(tersimpan)`. Pasangan lama yang tidak diubah tetap bisa disimpan saat owner memperbarui informasi lain. Setelah lokasi dipilih ulang, pasangan harus sesuai CSV.

Migrasi tambahan `202610310005_business_location_details.sql` menambah `businesses.district`/`village` dengan default kosong. RPC baru `create_business_profile_with_location` dan `save_business_profile_with_location` memakai fungsi profil lama untuk guard owner/tenant/revision. Penulisan profil dan detail lokasi berada dalam satu transaksi; kegagalan membatalkan semuanya. Alamat gabungan berurutan jalan, desa, kecamatan, kota, provinsi (maksimal 500 karakter). RPC lama tetap tersedia untuk kompatibilitas. Pengguna mengonfirmasi migrasi berhasil dijalankan; tes browser berikutnya membuktikan penulisan aktual.

Server actions pembuatan dan perubahan profil memvalidasi pasangan provinsi/kota sebelum menulis data. Pengecualian lokasi lama dibandingkan dengan usaha yang dibaca server dari sesi, bukan nilai pembanding dari klien. Guard owner, revision, dan tenant yang sudah ada dipertahankan. Perubahan ini tidak menambahkan constraint wilayah pada RPC/database; validasi baru berlaku di server actions website.

## Pengujian

- `npm.cmd run typecheck` dan `npm.cmd run build` lulus.
- `npm.cmd test`: 50/50 lulus, termasuk tes relasi empat tingkat wilayah, migrasi/rollback, serta regresi otorisasi dan isolasi database yang sudah ada.
- `tests/browser/business-regions.spec.ts`: menguji onboarding baru, pencarian/hasil kosong, field turunan terkunci, filter induk, pemisahan Kab./Kota, reset turunan, retry saat API gagal, penolakan request server yang dipalsukan menjadi pasangan lintas provinsi maupun desa di luar kecamatan, penyimpanan empat field, reload, login browser baru, serta lokasi lama tanpa penebakan.
- Browser menguji keyboard Enter/Escape dan batas dropdown tanpa horizontal overflow pada lebar 320, 390, 768, 1366 px. Bukti lokal di `.cache/business-regions/`; bukan file yang perlu di-commit.
- Regresi browser `restaurant.spec.ts` lulus: onboarding restoran, guard draf/selesai, menu/meja/pesanan, pembayaran retry, struk, laporan, pembatasan owner/admin/kasir, serta persistensi profil pada login baru. Hasil lokal `.cache/restaurant/browser-results.json` mencatat cleanup dan data lama tidak berubah.
- Akun dan usaha uji dibuat terpisah. Cleanup hanya memakai ID dari run tersebut; hash baris usaha yang sudah ada dibandingkan sebelum/sesudah.
- Selector lokasi pada tes accounts/profile/restaurant diperbarui dari input teks menjadi dropdown. Jangan mengartikan perubahan selector sebagai bukti seluruh suite tersebut telah dijalankan; hasil run aktual dicatat terpisah.

## Antislop Delivery Gate, lingkup field lokasi

Design read: mempertahankan form, label, panel, font, dan dropdown yang sudah digunakan proyek; urutan provinsi lalu kota mengikuti dependensi data. ENERGY 1 / RHYTHM 1 / MOTION 1 untuk perubahan ini; bukan desain ulang halaman.

- R-02 PASS: teks field baru tidak memakai em dash.
- R-03 PASS: browser memeriksa batas dropdown dan overflow pada empat lebar di atas.
- R-17 PASS: jumlah 37/514 berasal dari CSV dan diperiksa tes unit.
- R-18 PASS: tidak menambahkan testimonial.
- R-23 PASS: tidak membuat aset visual atau navigasi baru.
- R-24 PASS: tidak menambahkan tautan navigasi.
- R-25 PASS: label putih dan teks pilihan `#C5CBD5` memakai panel `#273242`; rasio kontras dihitung dengan luminansi relatif WCAG dan melebihi 4,5:1.
- R-26 PASS: browser memilih provinsi/kota, mereset pilihan, memvalidasi dan menyimpan profil nyata.
- R-27 PASS: hasil pencarian kosong, field turunan disabled, loading/pending, error validasi, serta retry saat daftar gagal dimuat tersedia.
- R-28 PASS: tidak menambahkan FAQ.
- R-32 PASS: label terhubung dengan input; focus ring, active descendant dan keyboard panah/Enter/Escape tersedia dan diuji.
- R-33 PASS: perubahan source diterapkan melalui patch, bukan script penulisan ulang UI; generator hanya menghasilkan data wilayah.
- R-34 PASS: tidak menambahkan atau mengubah kontrol tema.
- R-35 PASS: build dan click-through browser aktual dijalankan.
- R-36 PASS: dokumen membatasi klaim validasi pada server actions dan menyatakan kekurangan dataset.
- R-37 PASS: arah perubahan mengikuti form serta dropdown existing, dengan dials eksplisit di atas.
- R-38 PASS: nama wilayah berasal dari CSV; data uji hanya pada akun uji terpisah.
- Purpose gate PASS: tidak menambahkan gradient, ikon, font, grid dekoratif, panah CTA, badge, glass, glow atau ilustrasi; popup existing mengambang agar pilihan tidak menggeser form.
- Liveliness PASS: hierarki form existing dipertahankan; fokus perubahan pada pemilihan lokasi, jarak field memisahkan label/kontrol, aksen turquoise untuk interaksi.
- C-1/C-2/C-3 PASS: empat field melayani lokasi usaha, mempertahankan gaya form proyek.
- C-4 PASS: empty/legacy/error/persisted state dan empat viewport diuji.
- C-5 PASS: sumber, jumlah wilayah, batas validasi, dan hasil tes dicatat secara spesifik.
- R-05/R-11/R-15/R-16 PASS: susunan form, radius, tombol simpan, dan copy existing dipertahankan.
- R-20/R-21/R-29/R-30/R-31 PASS: warna, font dan panel mengikuti Usahaku; tidak memperkenalkan tema atau layout lain.
