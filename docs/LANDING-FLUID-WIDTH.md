# Lebar konten landing

8 November 2026, branch `fix/landing-dashboard-width`. Pengguna meminta ruang kosong kiri/kanan tidak bertambah saat layar melebar, mengikuti dashboard. Permintaan ini menggantikan batas konten landing 1800px sebelumnya.

Container konten utama memakai lebar tersedia dengan gutter yang sama seperti shared dashboard shell: 16px pada ponsel, 24px mulai 640px, 32px mulai 1024px, 40px mulai 1280px, dan 48px mulai 1536px. Hero, kategori, fitur, cara memulai, CTA dan footer memakai aturan tersebut. Lebar paragraf untuk keterbacaan serta navbar pil tetap seperti sebelumnya. Warna, font, isi, animasi, backend dan autentikasi tidak diubah.

Pada viewport 2560px, tepi hero sebelumnya 380px per sisi dengan konten 1800px; sesudahnya 48px per sisi dengan konten 2464px. Pada 1920px konten menjadi 1824px. QA Edge pada 320/390/768/1440/1920/2560px tidak menemukan overflow horizontal atau page error. Typecheck lulus. Menu HP, navigasi anchor dan scroll diperiksa. Bukti sebelum/sesudah ada di `.cache/landing-edge-qa/`, tidak perlu masuk commit. QA memakai server pengguna yang sudah berjalan, tanpa menghentikannya; percobaan server agent keluar karena server tersebut sudah aktif.

Design read: mempertahankan dashboard/landing yang disetujui, ENERGY 1 / RHYTHM 1 / MOTION 1. Perubahan hanya menghilangkan batas lebar container, tanpa menambah motif atau gerakan.

- Hard Gate PASS untuk scope perubahan: pemeriksaan enam viewport, scroll dan interaksi menu; tidak ada aset atau klaim baru; warna dan tipografi tidak berubah.
- Purpose-Gate PASS: gutter mengikuti dashboard untuk memenuhi permintaan pengguna pada layar lebar.
- Liveliness PASS: hierarki, motif, aksen dan animasi yang disetujui tetap dipertahankan.
- Craftsmanship PASS untuk scope perubahan: typecheck, pengukuran geometri browser, pemeriksaan visual desktop/mobile dan navigasi anchor. Tidak mengubah business logic atau database.

Belum ada commit/push/merge oleh agent. Pengujian mobile memakai emulasi Edge, bukan perangkat fisik.
