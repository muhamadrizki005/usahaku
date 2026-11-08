# Integrasi pembaruan restoran, 8 November 2026

Resolusi merge `origin/main` (commit `cb6e049`, perubahan fitur `c470f7d`) ke `feat/restaurant-pos-members` setelah commit fitur lokal `ed780c4`. Tidak mengubah migrasi yang sudah dijalankan dan tidak membuat migrasi baru.

- `restaurant-forms.tsx`: mempertahankan grid meja, pensil/status/X, indikator, penahanan setelah pembayaran, pengaturan status manual, akses kasir terbatas, pemeriksaan revisi dan retry. Menggabungkan editor/list menu terbaru: foto, diskon persen, serta konfirmasi penonaktifan menu dengan riwayat tetap tersimpan. State proses penghapusan menu dan meja terpisah agar tidak berbenturan.
- `restaurant-orders.tsx`: mempertahankan katalog kiri/keranjang kanan, member/poin, meja opsional, dan pembayaran server. Menampilkan label diskon dari pembaruan terbaru tanpa mengembalikan form pesanan lama atau mewajibkan meja. Metadata browser dimuat melalui effect setelah hidrasi, bukan dibaca pada render awal server/client yang berbeda.
- `restaurant-onboarding.tsx`: mempertahankan checklist/spacing terbaru dan komponen pembuatan meja berkelompok dari main. Guard onboarding dan penyimpanan melalui action/database yang ada tetap digunakan. Halaman operasional meja memakai kontrol manual setelah onboarding selesai.
- Ringkasan restoran dan aturan password terbaru dari main dipertahankan. Tes password tetap memuat assertion akses halaman meja bagi kasir dari branch fitur.

## Batasan perubahan dari upstream

Foto menu dan metadata harga dasar/persentase diskon pada commit upstream memakai `localStorage`, bukan storage/schema Supabase. Harga menu yang sudah dipotong disimpan sebagai `restaurant_menu.price`; checkout tetap memakai harga yang diverifikasi server. Metadata diskon/harga dasar dan foto belum otomatis tersedia pada browser/perangkat lain. Merge ini tidak mengklaimnya sebagai implementasi diskon produk lengkap seperti toko, tidak membuat migrasi finansial baru, dan tidak memindahkan data browser ke database tanpa rancangan tersendiri.

## Verifikasi

Typecheck dan build produksi lulus. Suite unit dengan concurrency 2: 100/101 lulus. Kegagalan `salon-operations.test.ts` sama dengan sebelum merge: fixture slot/jeda berada di luar jam buka dan assertion `/slot/` tidak cocok dengan pesan `Slot ...`. Modul/tes salon tidak diubah untuk menyembunyikan kegagalan tersebut.

Pengujian browser memakai akun/usaha baru dan membersihkan hanya ID fixture. Tes meja diperluas untuk memeriksa edit dan pembuatan kelompok saat onboarding, foto/diskon menu dan label kasir, serta mempertahankan pemeriksaan pembayaran, pelepasan manual kasir, reservasi, role, persistensi dan lima viewport. Ketiga tes browser `reservation-booking.spec.ts`, `restaurant-pos-members.spec.ts`, dan `restaurant-table-availability.spec.ts` lulus pada build hasil merge dengan Supabase aktual (sekitar 2,9 menit). Snapshot data lama tidak berubah; tidak ada page error. Foto/diskon, pembuatan kelompok dan edit meja onboarding diuji melalui UI; server tetap memeriksa harga checkout, role, isolasi usaha serta pelepasan/kunci meja. Permintaan Gemini di regresi mendapat 502 yang ditangani sebagai error, tanpa menjanjikan semua permintaan AI berhasil. Server QA port 3221 dimatikan setelah pengujian; server pengguna tidak dihentikan. Artefak/bukti tersimpan di `.cache/restaurant-merge/` dan direktori QA yang sudah ada; tidak perlu masuk commit.

Desain memakai komponen/palet yang sudah disetujui dan UI terbaru main; tidak menambah aset/dekorasi atau mengubah navigasi. Nama aksesibel, indikator teks/warna dan ukuran kontrol meja dipertahankan. Konflik diselesaikan tanpa commit, push, atau mengubah data demo.
