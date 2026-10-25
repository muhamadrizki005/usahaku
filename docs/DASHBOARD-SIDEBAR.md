# Sidebar dashboard yang konsisten

Implementasi 25 Oktober 2026 pada branch `fix/dashboard-sidebar-consistency`, berasal dari `feat/dashboard-ambient-gradient`. Perubahan ambient yang sudah disetujui dibawa serta; main tidak di-merge, commit atau push.

## Arah dan penyebab

Design Read: pertahankan navy, panel, aksen turquoise, Urbanist, serta isi halaman yang disetujui. Sidebar dibuat lebih ringkas dengan satu posisi yang tetap saat navigasi. ENERGY 1 / RHYTHM 1 / MOTION 0 untuk perubahan kerangka ini; animasi isi yang sudah ada tidak diubah.

Audit menemukan frame halaman 1656/1556/1536px yang berbeda, sidebar POS sendiri selebar 256px, serta Pengaturan/Staf tanpa sidebar. Pada desktop 1920px, sidebar berpindah dari x152 menjadi x202/x212; POS berada di x0. Escape pada drawer POS juga tidak menutup menu.

## Perubahan

- `DashboardShell` dipasang pada layout dashboard setelah `requireBusiness()`. Sidebar/topbar bertahan saat navigasi antarmodul. Preview memakai shell yang sama dengan data ilustrasi yang sudah diberi label.
- Frame maksimum 1680px, sidebar 216px, radius eksplisit 16px, padding panel 12px, baris minimal 44px, ikon 18px, jarak konten 24px. Logo/wordmark sejajar dengan awal konten. Penggunaan radius eksplisit menghindari `rounded-2xl` yang menghasilkan 21,6px dari token proyek.
- Semua halaman memakai sidebar yang sama, termasuk POS, Pengaturan, dan Staf. Isi, formulir, keranjang, serta tindakan backend tetap dipakai; frame dan header duplikat dihapus.
- Pengaturan tetap di sidebar. Staf & akses serta Akun saya tetap di dropdown akun. Identitas anggota/usaha berasal dari guard server. Owner/admin/kasir tetap memakai daftar izin yang sama.
- Drawer bersama 288px dengan batas 85vw, penutupan Escape, fokus keyboard kembali ke tombol pembuka, penguncian scroll, dan penutupan otomatis ketika beralih ke desktop.
- Data notifikasi Ringkasan diteruskan ke shell tanpa permintaan data baru pada setiap halaman. Di luar Ringkasan, notifikasi diberi keterangan sebagai data Ringkasan terakhir; jika belum dimuat, kondisi itu ditampilkan secara eksplisit. Popup notifikasi pada HP dibatasi margin viewport.
- Pengaturan profil memakai komponen identitas dalam mode embedded. Onboarding tetap memakai header/kerangka semula. Akses staf tetap owner-only pada server.
- Tidak ada migrasi, dependency baru, perubahan API, role/RLS, maupun operasi pada data demo. Ambient gradient yang disetujui tetap digunakan sekali melalui shared layout.

## Pengujian

- Typecheck dan build produksi lulus. Unit/database lokal 20/20 lulus.
- Lima tes browser lulus: dua tes `dashboard-navigation.spec.ts`, `pos.spec.ts`, dan dua tes `pr5-fixes.spec.ts`. Meliputi font yang benar-benar dirender, shell yang tidak di-remount saat klik menu, sembilan menu owner/delapan admin, guard onboarding, profil/logo/WebP/jam lintas tengah malam yang persisten setelah reload dan login/sesi baru, serta akses staf terpisah.
- POS diuji melalui website: barcode/stok pecahan, tunai/kembalian, QRIS/transfer manual, diskon, struk cetak, checkout dengan respons terputus dan retry idempoten, pembatalan oleh admin, riwayat kasir sendiri, penolakan usaha lain, serta penonaktifan kasir. Semua lulus. Reduced motion landing juga tetap lulus.
- Audit final 37 sampel meliputi sembilan halaman pada 1366/1920/768/390px serta Staf pada 1920px. Desktop selalu lebar 216px/radius 16px dan x24 pada 1366px, x144 pada 1920px. Drawer selalu 288px pada 768/390px. Tidak ada overflow horizontal atau page error.
- Pada 320/390/768px dengan tinggi 480px: siklus Tab/Shift+Tab tetap dalam drawer, menu terakhir dapat dijangkau lewat scroll, Escape mengembalikan fokus, scroll badan dipulihkan, resize ke desktop menutup drawer, dan notifikasi tetap dalam viewport. Print menyembunyikan chrome dan menonaktifkan gradient; struk tetap dicetak melalui portal cetak yang sudah ada.
- Dua tes navigasi awal gagal karena token radius menghasilkan 21,6px; implementasi dikoreksi ke radius eksplisit 16px dan suite browser diulang, lalu 5/5 lulus. Pengukuran akhir memverifikasi radius itu pada seluruh halaman desktop.
- Semua akun/usaha pengujian baru dibersihkan. Snapshot usaha lama tetap identik. Berkas lokal pengguna `Usahaku_Design_System.md` dan `next-env.d.ts` dipertahankan identik dengan cadangan sebelum tugas.

Bukti screenshot dan hasil mentah berada di `.cache/sidebar-consistency-after/`; tidak perlu dimasukkan ke commit. Hasil suite akun/POS ada di checkout uji terisolasi `.cache/urbanist-dashboard-preview/`. Server pengujian dihentikan setelah selesai; server pengguna tidak dihentikan.

## Batas verifikasi

Pengujian menggunakan Edge/Chromium dengan emulasi viewport HP, bukan HP fisik atau Safari. Modul Asisten Bisnis AI yang belum diimplementasikan tetap merupakan tampilan yang sudah ada; pekerjaan ini tidak menambah fungsi modul tersebut.

## Antislop delivery gate untuk perubahan ini

- Hard Gate PASS: kerangka bersama diperiksa lewat navigasi aktual desktop/mobile, keyboard, scroll, print, akun terpisah, dan build; tidak menambah data atau klaim aktivitas palsu.
- Purpose-Gate PASS: ikon mempertahankan arti tiap modul dari navigasi yang sudah disetujui. Radius 16px membedakan panel sidebar dari baris 12px; glow mempertahankan permintaan pengguna sebelumnya. Tidak menambah animasi, dekorasi, atau palet baru.
- Liveliness PASS: ENERGY 1 / RHYTHM 1 / MOTION 0 sesuai perbaikan kerangka; judul/konten menjadi fokus, ruang 24px memisahkan navigasi dari pekerjaan, aksen turquoise menandai halaman aktif. Logo dan Urbanist mempertahankan identitas Usahaku.
- Craftsmanship PASS: preview Ringkasan, POS, dan HP diperiksa secara visual, frame tetap saat pindah modul, menu memakai data anggota terverifikasi, dan seluruh pemeriksaan di atas lulus. Penilaian ini mencakup perbaikan sidebar/shell, bukan audit ulang seluruh fitur/prototipe aplikasi.
