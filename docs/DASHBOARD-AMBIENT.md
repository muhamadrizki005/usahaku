# Ambient background dashboard

Implementasi 25 Oktober 2026 pada branch `feat/dashboard-ambient-gradient`, berdasarkan aturan ambient gradient yang ditambahkan pengguna ke `Usahaku_Design_System.md` dan referensi Rapport.

## Komposisi dan cakupan

Navy `#1C222E` tetap menjadi warna dasar. Setelah pengguna menilai versi awal terlalu samar, radial turquoise `#24CBC5` diperkuat: alpha pusat 0,48, berhenti di 0,30 pada 26% dan 0,12 pada 52%, lalu transparan pada 78%. Pusat berada di luar kiri atas kanvas (-12rem, -8rem), sehingga puncak paling terang tidak berada di bawah konten. Biru `#1835D9` menjadi penyeimbang di kanan bawah dengan alpha pusat 0,20 dan transisi 0,085. Pada mobile, alpha pusat turun menjadi 0,36 untuk turquoise dan 0,16 untuk biru, dengan ukuran/posisi tersendiri.

`DashboardAmbient` dipasang sekali pada layout `/dashboard`. CSS bersama mendefinisikan gradasi dan melukiskannya pada main halaman langsung, sehingga warna dasar main tetap navy dan komponen halaman tidak perlu menduplikasi deklarasi radial. Route preview memakai komponen yang sama. Landing, login, akun pribadi dan onboarding berada di luar scope ini.

Gradasi berupa background CSS statis: tidak ada elemen overlay dekoratif, animasi, canvas, filter blur tambahan, atau perubahan hit-testing. Lapisan ini tidak mengubah token panel, font Urbanist, border, radius, grafik, tabel, maupun warna tombol. Aturan print menghapus gradasi dan menggunakan latar kertas putih.

Tidak ada perubahan routing, otorisasi, business logic, database, dependency, ataupun sumber data. Pemanggilan `requireBusiness()` tetap dilakukan sebelum layout dirender. Perubahan lokal pengguna pada `Usahaku_Design_System.md` dan `next-env.d.ts` dipertahankan persis; dokumen design system dibaca sebagai acuan, tidak ditulis ulang.

## Hasil pemeriksaan

- Typecheck: lulus.
- Unit/database lokal: 20/20 lulus.
- Build produksi: lulus.
- Regresi browser: `dashboard-navigation.spec.ts` dan `dashboard-palette.spec.ts`, 3/3 lulus. Meliputi preview, sidebar/menu HP, font aktual, navigasi modul, dan akses owner/admin setelah onboarding.
- QA ambient pada 320, 390, 768, 1366, 1600 dan 1920 px: lulus. Satu wrapper dan dua radial terdeteksi; base navy tetap `rgb(28,34,46)`; tidak ada overflow horizontal, perubahan tinggi dokumen, hydration/page error, atau gangguan menu/scroll/sticky header.
- Sampel style dan geometri seluruh header, judul, section, nav, tombol dan tabel yang terlihat tetap identik saat background image dimatikan/dinyalakan pada viewport yang sama.
- Reduced motion tidak mengubah komposisi atau memulai gerakan. Emulasi print memastikan background image hilang dan lapisan dasar menjadi putih.
- Pada versi awal, kontras dihitung dari dua alpha maksimum 0,13/0,09. Untuk revisi yang lebih tegas, pengecekan menggunakan piksel latar hasil render di posisi teks yang sebenarnya. Pada enam viewport, 356 rentang teks diperiksa; tidak ditemukan kegagalan kontras baru dibanding latar navy. Nilai terendah di antara sampel yang memenuhi ambang semula adalah 4,80:1. Pengecekan ini bukan audit ulang seluruh teks pada semua halaman aplikasi.
- Sampel piksel latar desktop (x=4, y=120) berubah dari `[28,34,46]` tanpa gradasi menjadi `[28,46,57]` pada versi awal, lalu `[29,75,83]` pada versi tegas. Mobile berubah dari `[28,47,58]` pada versi awal menjadi `[29,67,76]`. Panel tetap memakai warna dan style yang sama.

QA dijalankan di checkout terisolasi dengan Edge/Chromium dan emulasi viewport HP. Tes akun memakai akun/usaha baru, membersihkan data buatannya, dan snapshot usaha lama tetap identik. Tidak ada uji perangkat HP fisik atau Safari. Server uji dimatikan setelah selesai; server pengguna tidak dihentikan.

Bukti awal berada di `.cache/dashboard-ambient-results/`. Bukti revisi berada di `.cache/dashboard-ambient-strong/`: `previous-1600.png`/`previous-390.png` adalah versi tipis sebelumnya; `after-1600.png`/`after-390.png` adalah versi tegas. `before-*.png` adalah latar navy tanpa background image. `results.json` dan `contrast.json` merekam hasil pemeriksaan. Bukti ini tidak perlu dimasukkan ke commit.

## Antislop delivery gate

Arah berasal dari permintaan pengguna: atmosfer Rapport dengan identitas Usahaku. Untuk lapisan ambient ini: ENERGY 1 / RHYTHM 1 / MOTION 0. Komposisi memberi kedalaman pada ruang latar dan mempertahankan hierarki konten yang sudah ada.

- **Hard Gate PASS:** tidak menambah aset, data contoh atau klaim pada produksi; overflow, interaksi, scroll dan keterbacaan diuji pada enam ukuran layar.
- **Purpose-Gate PASS:** glow diminta pengguna dan memakai dua warna brand yang diizinkan. Turquoise menjadi fokus atmosferik, biru hanya penyeimbang yang lebih redup; deklarasi tidak diterapkan ke setiap panel atau kontrol.
- **Liveliness PASS:** posisi glow asimetris dan responsif memberi kedalaman tanpa mengubah struktur, isi atau identitas dashboard.
- **Craftsmanship PASS:** style/geometri komponen dibandingkan sebelum–sesudah; font, menu, role, print, build, dan pemeriksaan browser berhasil. Preview diperiksa secara visual pada desktop/mobile.

## Verifikasi revisi intensitas

Build dijalankan ulang dan lulus. QA ambient di enam lebar, pemeriksaan style/geometri, scroll, menu, reduced motion, dan print lulus. Pemeriksaan kontras memakai screenshot dengan glyph teks disembunyikan sementara untuk membaca warna latar di posisi teks; transisi CSS dinonaktifkan selama pengambilan sampel agar glyph yang sedang memudar tidak terbaca sebagai background. Tes browser `dashboard-palette.spec.ts` juga dijalankan ulang dan lulus. Perubahan revisi hanya pada CSS ambient dan laporan ini; panel, header, typography, komponen dan backend tetap sama. Antislop delivery gate tetap PASS untuk cakupan revisi ini.
