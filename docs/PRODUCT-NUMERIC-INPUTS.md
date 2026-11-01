# Input angka produk

## Perbaikan ulang, 1 November 2026

Setelah integrasi modal produk, input kembali memakai `Number(e.target.value)` sehingga kosong menjadi nol. State teks dan validasi `productSchema` sebelum konversi dipulihkan. Placeholder harga/stok/minimum masing-masing `Contoh: 15000`, `Contoh: 10`, dan `Contoh: 5`. Field barcode dihapus dari tambah/edit; nilai barcode lama tetap dikirim tanpa diubah saat edit. Tidak menghapus kolom atau data barcode. SKU memakai ruang yang sebelumnya dibagi dengan barcode; desain modal lainnya dipertahankan.

Typecheck lulus. Tes browser Supabase aktual lulus (15,3 detik), meliputi input kosong/Backspace, placeholder, field barcode tidak ada, barcode lama tetap tersimpan setelah edit, validasi tanpa write, pecahan, reload dan nol eksplisit. Fixture dibersihkan, hash data lama identik dan pageErrors kosong. Server pengguna port 3000 digunakan; tidak menyalakan server tambahan. Build produksi tidak dijalankan pada perubahan ini. Bukti lokal di `.cache/product-numeric-input/` tidak untuk commit. Design read dan gate mengikuti desain form existing di bawah: ENERGY 1 / RHYTHM 1 / MOTION 0; tidak menambah warna atau animasi.

## Riwayat perbaikan sebelumnya

Pengguna pada 31 Oktober 2026 meminta angka nol awal di form tambah produk dihapus dan angka dapat dikosongkan saat diedit. Penyebabnya Number('') menghasilkan 0 pada setiap onChange. ProductEditor kini menyimpan harga, stok fisik awal dan minimum sebagai string lokal selama pengguna mengetik; konversi hanya setelah validasi productSchema yang sama dengan backend.

Form tambah dimulai kosong. Harga dan minimum stok wajib diisi, termasuk 0 jika nilainya memang nol. Stok fisik awal bersifat opsional; kosong dihitung 0 hanya saat simpan. Saat mengedit, nilai tersimpan tetap ditampilkan dan harga/minimum dapat dihapus lalu diganti. Stok fisik produk lama tetap disabled dan hanya berubah melalui Inventori dengan alasan, sesuai aturan sebelumnya.

Tidak mengubah schema, API, hak akses, SKU, gambar, palet atau layout. Form produk onboarding sebelumnya sudah memakai string dan tidak memiliki pemaksaan nol ini.

Verifikasi: typecheck dan production build lulus. Browser dengan Supabase aktual lulus (15,4 detik): tiga field mulai kosong, ketik 0 lalu Backspace lalu 10, penolakan harga/minimum kosong tanpa write, penolakan 4 desimal, penyimpanan 0,250 stok / 0,500 minimum, reload/edit harga dan minimum tanpa mengubah stok, harga 0 dan stok awal kosong tersimpan 0. Desktop dan 390px diperiksa, pageErrors kosong, fixture dibersihkan dan hash data lama identik. Bukti `.cache/product-numeric-input/results.json`, `blank-desktop.png` dan `mobile.png` bukan untuk commit. Server QA dihentikan dan next-env.d.ts lokal dipertahankan byte persis.

antislop during (session override). Design Read: perbaikan form operasional dalam desain Usahaku yang disetujui, ENERGY 1 / RHYTHM 1 / MOTION 0.

- Hard Gate PASS: build, browser aktual, validasi dan persistensi lulus; screenshot desktop/HP diperiksa tanpa overflow. Error angka memiliki role alert; tidak ada data atau aset rekaan.
- Purpose Gate PASS: hanya memperbaiki state input dan validasi; warna/font/komponen/spacing yang ada dipertahankan.
- Liveliness PASS: fokus form dan tombol simpan serta identitas Usahaku tetap sama; tidak menambah animasi.
- Craftsmanship PASS: pengetikan nyata, penghapusan, edit, nol sah, stok pecahan dan kegagalan tanpa write diuji; data demo tidak berubah.
