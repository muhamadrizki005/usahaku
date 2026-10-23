# Penyelesaian onboarding

Perubahan 23 Oktober 2026 sesuai permintaan pengguna. Desain halaman dipertahankan; tambahan UI hanya dialog konfirmasi keluar, status proses/gagal pada tombol penyelesaian, dan penghapusan tombol X duplikat di bawah unggahan logo.

## Alur

- Kembali dari Identity pada onboarding menuju `/onboarding`.
- Kembali dari Setup menuju Identity; Kembali dari Summary menuju Setup.
- Kembali dari kategori membuka dialog konfirmasi. Batal tetap di kategori; konfirmasi menuju landing `/` tanpa logout atau menghapus data.
- Identitas, logo, produk, jam, dan staf yang sudah disimpan tetap berada di database. Memiliki membership/usaha belum berarti onboarding selesai.
- Usaha baru memiliki `onboarding_completed_at = null`. Owner dapat melanjutkan pengaturan; halaman dashboard dan aksi operasional yang memakai `requireBusiness` ditahan. Login ulang owner diarahkan ke Summary. Staf menunggu owner menyelesaikan pengaturan.
- Tombol Buka dashboard pada Summary menjalankan server action dan RPC `complete_business_onboarding` dengan business ID dari sesi terverifikasi. Hanya owner aktif yang tidak wajib ganti sandi dapat menyelesaikan. Validasi identitas dasar wajib; logo, produk, jam, pembayaran, dan staf tetap opsional. RPC idempoten, tidak membuat usaha kedua, dan tidak mengubah tanggal selesai saat dicoba ulang.
- Dashboard terbuka setelah database mengonfirmasi penyelesaian. Gagal/timeout menampilkan pesan dan mempertahankan draf; mencoba ulang aman. Akses ekspor laporan juga ditolak selama draf.
- Pengaturan profil dari dashboard tetap memakai Simpan perubahan dan tombol Kembali menuju dashboard. Navigasi onboarding tidak mengubah perilaku halaman pengaturan ini.

Data yang belum dikirim melalui tombol simpan bukan data tersimpan. Dialog tidak menjanjikan bahwa file logo yang baru dipilih atau perubahan form yang belum disimpan sudah masuk database.

## Migrasi

`supabase/migrations/202610230002_onboarding_completion.sql` sudah dikonfirmasi dijalankan pengguna. Penambahan kolom memakai default pada usaha yang sudah ada agar akses usaha lama tetap berjalan, lalu default dilepas agar usaha baru menjadi draf. Tidak menghapus usaha, anggota, produk, stok, transaksi, atau file. Tidak ada reset atau pengulangan migrasi lama.

Karena sebelumnya belum ada penanda penyelesaian, usaha yang sudah ada sebelum migrasi dipertahankan sebagai selesai; tidak menebak atau menurunkan statusnya berdasarkan isi profil.

## Pengujian aktual

- 19 tes lokal lulus, termasuk PostgreSQL/PGlite: data usaha lama tetap sama, usaha baru draf, update langsung kolom selesai ditolak, owner usaha lain/admin/nonaktif ditolak, penyelesaian owner dan pengulangan idempoten lulus.
- TypeScript dan build produksi lulus.
- Pengujian `tests/browser/profile-setup.spec.ts` melalui website dan Supabase aktual lulus: navigasi Kembali, batal/konfirmasi keluar, hanya satu tombol hapus logo, penolakan URL dashboard/CSV sebelum selesai, login sesi baru kembali ke Summary, profil/logo tersimpan, jam lintas tengah malam, dan tombol selesai membuka dashboard dengan penanda database terisi.
- Regresi profil, revisi dua tab, logo gagal/ganti/hapus, isolasi proxy logo, dan pencabutan akses staf lulus. Ukuran/font/warna identitas sesuai baseline Inter yang disetujui. Hasil di `artifacts/profile-setup/browser-results.json`.
- Akun uji baru dibersihkan dan snapshot akun/data demo yang dipantau tes tetap identik.

Fixture suite katalog/POS/pelanggan/laporan kini menyelesaikan onboarding melalui RPC owner sebelum menguji fitur dashboard; tidak memakai service key untuk membuka penanda pada fixture tersebut.

## Pemeriksaan dialog baru

Antislop during dipilih pengguna untuk sesi ini. Arah visual berasal dari onboarding yang sudah disetujui: Inter lokal, biru `#1835d9`, teks `#1c222e`/`#667085`, dan modal putih dengan radius yang sama dengan modal setup. ENERGY 1 / RHYTHM 1 / MOTION 1 untuk dialog konfirmasi ini: singkat, tanpa animasi atau dekorasi tambahan. Bayangan dan backdrop membedakan dialog dari halaman yang sementara tidak aktif; ikon X berfungsi menutup dialog. Tidak ada perubahan arah visual halaman lain.

Tombol dialog memiliki target sentuh minimal 44px; tombol aksi ditumpuk pada layar sempit. Fokus dimulai pada lanjutkan pengaturan, Tab ditahan di dialog, Escape menutup dan mengembalikan fokus ke tombol pemicu. Teks hanya menjanjikan penyimpanan data yang memang sudah disimpan. Kontras teks terhadap putih dihitung: `#667085` 4,97:1, `#1c222e` 15,94:1, putih terhadap biru 8,24:1. Tidak menambah klaim, aset, navigasi, atau dekorasi pemasaran.

Uji akhir browser lulus setelah penyempurnaan target sentuh: fokus awal, Escape dan pengembalian fokus terverifikasi; dialog pada 320/768/1440px tidak overflow. Ketiga screenshot `artifacts/profile-setup/exit-dialog-*.png` diinspeksi visual, teks dan tombol terbaca serta tidak terpotong. Pemeriksaan dibatasi pada perubahan yang diminta, tanpa mendesain ulang komponen lama.
