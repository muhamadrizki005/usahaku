# Urbanist dan navigasi dashboard

Persetujuan pengguna, 24 Oktober 2026: Urbanist untuk seluruh website; hapus garis bawah navbar dan menu horizontal dashboard; sejajarkan blok brand dengan sapaan; tampilkan ikon beserta nama pada sidebar. Setelah melihat preview, pengguna mengganti bentuk kapsul menjadi kotak bersudut membulat dan meminta sidebar didekatkan ke konten. Pertahankan Asisten Bisnis AI, tambahkan Produk/Pelanggan, dan hapus shortcut Search, Plus, serta Moon pada sidebar.

## Implementasi

- Font normal dan italic Urbanist variable 100–900 tersimpan lokal di `public/fonts/urbanist/`. `@font-face`, token sans, dan preload menggunakan file tersebut. Ukuran, weight, line-height, dan tracking yang sudah ada dipertahankan. Sumber font dan lisensi disertakan di folder font; Inter lama tetap sebagai aset historis.
- `DashboardBrand` menyamakan titik kiri blok brand dengan konten: ruang sidebar 224 px, padding konten 16 px, dan batas lebar konten yang sama. Sidebar dan konten kini terpusat sebagai satu area, dengan jarak 24 px, termasuk pada layar lebar. Selisih yang terukur pada Ringkasan adalah 0 px, termasuk saat konten terpusat pada layar besar.
- `DashboardSidebar` dipakai bersama oleh Ringkasan, Produk, Inventori, dan halaman yang memakai `DashboardSection`. Menu horizontal dan shortcut yang diminta dihapus dari keempat tampilan tersebut. Sidebar memakai radius 20 px, padding 12 px, dan tombol menu memakai radius 12 px. Label selalu terlihat dan tinggi tombol minimal 44 px. Sidebar dapat digulir pada layar pendek.
- Daftar navigasi berisi Ringkasan, Produk, Inventori, Kasir (POS), Transaksi, Pelanggan, Laporan, Asisten Bisnis AI, dan Pengaturan. Pengaturan tetap owner-only; daftar menu tetap disaring berdasarkan role. Menu prototipe Poin loyalitas tidak ditampilkan dalam daftar sembilan menu; route dan layanan lain tidak dikembangkan atau dihapus.
- Menu drawer tetap digunakan di HP/tablet sampai breakpoint sidebar desktop 1024 px. Produk/Inventori menggunakan menu drawer bersama, termasuk Escape, pengembalian fokus, dan pembatasan fokus di dalam drawer. Dropdown akun serta notifikasi tetap di kanan atas.
- Dua kartu Ringkasan diberi `min-width: 0` agar pergantian font tidak menyebabkan overflow pada 320 px. Susunan dan isi kartu dipertahankan.
- Aturan font aktif pada `AGENTS.md` dan `Usahaku_Design_System.md` diperbarui. Tes browser yang menyebut font Inter sekarang mengharapkan Urbanist; artefak baseline lama tidak ditulis ulang.

Tidak ada migrasi, perubahan schema, dependency, atau perubahan layanan penyimpanan/transaksi. Prop role pada halaman Produk dan Inventori hanya membawa role terverifikasi dari server ke navigasi UI.

## Hasil pengujian aktual

- `npm.cmd run typecheck`: lulus.
- `npm.cmd test`: 20/20 lulus, termasuk pembatasan role, tenant, dan transaksi pada database lokal.
- `npm.cmd run build`: lulus.
- `tests/browser/dashboard-navigation.spec.ts`: 2/2 lulus. Chrome DevTools Protocol memastikan glyph judul benar-benar dirender font lokal Urbanist, bukan sekadar deklarasi CSS. Varian italic juga berhasil dimuat.
- Font diperiksa pada landing, login, signup, pemulihan, verifikasi, empat halaman onboarding, dashboard, Produk, Inventori, Pelanggan, Transaksi, Laporan, Asisten Bisnis AI, pengaturan toko/staf, dan akun pribadi.
- Tampilan diperiksa pada 320, 390, 768, 1024, 1366, 1920, dan 2560 px; tidak ada overflow horizontal. Sidebar pada 1024×480 tetap memungkinkan akses ke menu terakhir.
- Sembilan menu owner terlihat lengkap tanpa ikon shortcut Search/Plus/Moon. Logo dan sapaan sejajar dengan selisih 0 px pada 1024–2560 px. Border bawah header bernilai 0 px.
- Klik menu lintas modul, drawer HP, Escape/pengembalian fokus pada drawer Produk/Inventori, serta delapan menu admin lulus. Akses admin ke Pengaturan tetap ditolak oleh server.
- `tests/browser/dashboard-palette.spec.ts`: lulus setelah ekspektasi font dan selector batang grafik disesuaikan dengan tampilan saat ini; warna utama, tujuh batang grafik, menu akun, dan menu HP tetap terverifikasi.

Tes browser memakai akun/usaha baru dan membersihkan ID buatannya. Snapshot usaha yang sudah ada tetap identik. Bukti JSON dan screenshot tersimpan lokal di `.cache/urbanist-dashboard-results/`, sehingga tidak perlu dimasukkan ke commit. Browser pengujian adalah Edge/Chromium dengan emulasi viewport HP; belum diuji pada perangkat HP fisik atau Safari. Pengujian dijalankan di checkout terpisah agar server pengguna tidak terganggu.

## Pemeriksaan antislop pada perubahan ini

Arah visual berasal dari desain pengguna: palet gelap yang sudah disetujui, brand resmi, Urbanist yang diminta pengguna, dan sidebar membulat sesuai revisi pengguna. ENERGY 2 / RHYTHM 1 / MOTION 1: mempertahankan kepadatan dashboard, susunan kartu, dan gerakan yang sudah ada.

- **Hard Gate PASS:** tidak menambah klaim/data contoh pada produksi atau aset tanpa persetujuan; tidak ada overflow pada tujuh lebar uji; seluruh menu baru memiliki tujuan route, dapat diklik, dan pembatasan akses tetap bekerja. Preview memakai penanda data contoh yang sudah tersedia.
- **Purpose-Gate PASS:** font dan bentuk sidebar merupakan pilihan eksplisit pengguna. Ikon berasal dari navigasi yang sudah ada; ikon Asisten memakai simbol yang sebelumnya dipakai dashboard. Tidak menambah dekorasi, palet, atau animasi baru.
- **Liveliness PASS:** identitas brand dan aksen turquoise/biru dipertahankan; nama menu memperjelas fungsi ikon. Posisi brand dan konten memakai satu acuan, dan hierarki judul/kartu tetap mengikuti desain pengguna.
- **Craftsmanship PASS:** font custom terbukti dirender melalui CDP, menu diuji lewat klik dan keyboard, serta typecheck, unit test dan build berhasil. Tidak ada perubahan copy pemasaran, backend, atau perilaku transaksi.

## Revisi bentuk sidebar setelah preview

Pengguna membatalkan bentuk fully rounded karena terlihat kurang cocok dan terlalu jauh dari konten. Radius diganti menjadi 20 px, tombol 12 px, padding vertikal dipadatkan, dan jarak horizontal ditetapkan 24 px. Area sidebar/konten terpusat bersama sehingga sidebar tidak tertinggal di tepi kiri pada monitor lebar. Brand tetap sejajar dengan sapaan.

Typecheck, build, dan tes browser visual dijalankan ulang dan lulus. Tes mengukur radius 20 px, jarak 24 px, kesejajaran brand 0 px, sembilan menu, serta tidak adanya overflow pada 320?2560 px. Bukti revisi tersimpan lokal di `.cache/sidebar-rounded-preview/`; pengujian ini tidak membuat atau mengubah data akun/database.
