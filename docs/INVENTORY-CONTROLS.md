# Arah koreksi stok

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
