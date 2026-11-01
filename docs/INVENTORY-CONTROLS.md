# Arah koreksi stok

## Alur terbaru, 1 November 2026

Satu tombol utama di header: **Catat perubahan stok**. Tombol **Sesuaikan stok fisik** di baris kondisi dihapus. Judul formulir, jumlah, alasan dan tombol simpan diselaraskan dengan perubahan stok umum. Pilihan Masuk/Keluar tetap menentukan delta bertanda; Keluar aktif tetap merah. Semua penulisan baru dari formulir memakai jenis `in`/`out` sesuai arah. Riwayat `adjustment`/Hitung fisik yang sudah ada tetap ditampilkan tanpa diubah. Schema/API dan otorisasi owner/admin tetap sama.

Tes browser `inventory-controls.spec.ts` diperbarui untuk memastikan hanya satu tombol utama, delta pecahan masuk/keluar tersimpan dan diaudit, alasan wajib, overdraw/invalid/nol ditolak, batal tidak menulis, serta layout empat lebar tetap sesuai. Bukti lokal di `.cache/inventory-controls/` tidak untuk commit.

Hasil aktual: typecheck lulus; tes browser Supabase lulus (17,7 detik), tanpa page error. Persistensi setelah reload, audit masuk/keluar dan viewport 320/390/768/1366px lulus; screenshot 390px diperiksa. Fixture dibersihkan dan hash data lama tetap identik. Tes memakai server pengguna yang sudah berjalan di port 3000; tidak menyalakan server tambahan. Build produksi tidak dijalankan pada perubahan ini.

Design read: mempertahankan tombol utama dan panel existing, menghilangkan akses duplikat sesuai permintaan pengguna. ENERGY 1 / RHYTHM 1 / MOTION 0. Gate untuk perubahan ini: copy menjelaskan tindakan stok tanpa klaim baru; warna/font/radius/layout existing dipertahankan; kontrol Masuk/Keluar dan validasi memakai layanan yang sudah ada. Bukti verifikasi alur baru dicatat pada hasil tes browser.

## Riwayat implementasi sebelumnya

Perubahan 31 Oktober 2026 pada branch fix/inventory-adjustment-controls: hapus pintasan Catat stok keluar di baris kondisi inventori, pertahankan Sesuaikan stok fisik, dan letakkan dua tombol Masuk/Keluar di kanan input koreksi jumlah. Pintasan Catat stok masuk di header tetap ada.

Jumlah dimasukkan positif, mendukung koma/titik dan maksimal tiga desimal. Pilihan Masuk/Keluar menentukan delta bertanda serta pratinjau stok. Input mulai kosong, nilai nol tidak dapat disimpan, alasan tetap wajib, dan pengurangan di bawah nol diblokir. Perubahan hanya disimpan ketika pengguna menekan Simpan penyesuaian. Kontrol terkunci selama penyimpanan.

Koreksi dari Sesuaikan stok fisik tetap memakai kind adjustment dengan delta positif/negatif dan riwayat Hitung fisik. Pintasan Catat stok masuk tetap memakai kind in; pilihan Keluar pada mode ini memakai kind out. Tidak mengubah schema, API, role/tenant, stok POS atau data demo.

Grid panel memakai satu kolom minmax(0,1fr) sebelum breakpoint XL serta min-w-0 pada kedua panel, karena pemeriksaan screenshot menemukan panel sebelumnya melampaui lebar layar kecil. Warna, font dan layout desktop dua kolom dipertahankan.

Verifikasi: typecheck dan build produksi lulus. Tes browser inventory-controls.spec.ts dengan Supabase aktual lulus (15,5 detik), mencakup penghapusan tombol, pratinjau +/- tanpa write, koreksi +2,25 dan -1,25 beserta audit, reload, alasan wajib, stok negatif, input negatif/empat desimal/huruf/nol, pembatalan, pintasan stok masuk, dan batas nyata input/tombol/form pada 320/390/768/1366px. Screenshot HP diperiksa ulang setelah perbaikan grid. PageErrors kosong, fixture dibersihkan dan hash data lama identik. Server QA dihentikan; next-env.d.ts dan ZIP lokal pengguna dipertahankan. Bukti di .cache/inventory-controls/ bukan untuk commit.

antislop during (session override). Design Read: koreksi stok dalam desain Usahaku yang sudah disetujui, ENERGY 1 / RHYTHM 1 / MOTION 0.

- Hard Gate PASS: build, klik simpan/batal/arah, validasi, data audit dan viewport diuji; kedua tombol 44px tinggi dan bisa dioperasikan keyboard dengan aria-pressed. Screenshot HP tidak lagi terpotong.
- Purpose Gate PASS: dua tombol menunjukkan arah koreksi sesuai permintaan, bukan dekorasi. Tidak ada warna, aset, font atau gerakan baru.
- Liveliness PASS: hierarki pratinjau stok, field/alasan serta tombol simpan memakai komponen dan identitas yang sama.
- Craftsmanship PASS: perubahan aktual dan kegagalan tanpa write diperiksa dengan akun terpisah; data demo tidak berubah dan server tes dimatikan.
