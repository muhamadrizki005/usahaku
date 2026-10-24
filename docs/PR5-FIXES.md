# Perbaikan PR #5 — 24 Oktober 2026

Branch `update-by-syhdn`, berdasarkan `0f85d59b4758972f6787f9e05a070cc75314175d`. Perubahan belum di-commit, di-push, atau di-merge. `main` dan `origin/main` tidak diubah.

## Perubahan

- Guard `requireOnboardingDraft` dipertahankan. Empat route onboarding mengembalikan owner usaha yang sudah selesai ke dashboard.
- Sidebar **Pengaturan** tetap menuju `/dashboard/settings`. Form profil/logo menggunakan komponen identitas dan server action yang sama, tanpa stepper atau tautan kembali ke onboarding. Editor jam operasional dipakai bersama oleh setup dan pengaturan toko, dengan validasi, revisi, dan RPC yang sudah tersedia.
- Dropdown akun **Staf & akses** tetap menuju `/dashboard/settings/staff`. Halaman ini sekarang memuat anggota usaha langsung dari server dan menggunakan komponen pengelolaan staf yang sama dengan setup, tanpa redirect ke onboarding. **Akun saya** tetap menuju `/account`. Posisi navigasi tidak diubah.
- Route pengaturan dan staf tetap memerlukan owner aktif yang sudah mengganti sandi sementara. Server action profil/jam/staf dan RPC yang sudah ada tetap membatasi perubahan ke owner usaha terkait. Tidak ada schema, migrasi, API, dependency, atau perubahan hak admin/kasir.
- X pada gambar QRIS membuang gambar dan mematikan QRIS pada draf. Simpan baru mengubah konfigurasi tersimpan. Batal/meninggalkan formulir tidak menyimpan draf. Gagal menulis penyimpanan browser mempertahankan modal dan konfigurasi sebelumnya. Jika QRIS merupakan satu-satunya metode, penghapusannya boleh disimpan tanpa metode aktif; progres pembayaran kembali belum diatur.
- Header kategori/identitas/setup menggunakan komponen bersama: pada layar kecil judul tengah dan nama lengkap disembunyikan sesuai breakpoint, avatar tetap ada; nama panjang dibatasi dan dipotong pada layar lebih lebar. Gaya desktop, warna, tipografi, serta ukuran logo PR dipertahankan.
- Preferensi reduced motion dipantau secara reaktif menggunakan `useSyncExternalStore`, dengan snapshot SSR yang stabil. Mode reduce menghentikan tilt, scale/press, putaran 3D, gerakan canvas, hover canvas, dan click cascade. Kedua sisi kartu berganti secara statis dengan ukuran tetap, termasuk melalui keyboard. Perubahan preferensi melepas engine/listener lama sebelum membuat engine sesuai preferensi baru. Animasi normal dipertahankan.
- `suppressHydrationWarning` global dihapus. Pengujian fresh render dan pergantian preferensi tidak menghasilkan hydration/page error. Status kasir pada sisi belakang kartu demo sekarang berbunyi **Contoh kasir aktif (ilustrasi)**; penanda ilustrasi pada sisi depan tetap ada.

## Verifikasi aktual

Build produksi dijalankan dalam checkout audit terisolasi `.cache/pr5-audit-head`, dengan source perubahan disalin dari branch kerja. Server uji memakai port 3205; server pengguna pada port 3000 tidak dihentikan. Semua server yang dimulai untuk pengujian sudah dihentikan setelah pengujian. Perubahan lokal awal `next-env.d.ts` dipulihkan persis dari salinan sebelum tes.

| Pengujian | Hasil |
| --- | --- |
| `npm.cmd run typecheck` | Lulus |
| `npm.cmd test` | 20/20 lulus, termasuk SQL tenant/role, revisi, jam lintas malam, lifecycle logo, dan guard penyelesaian onboarding |
| `npm.cmd run build` | Lulus; seluruh route berhasil dibangun |
| `catalog.spec.ts` yang sebelumnya gagal | Lulus; usaha selesai tetap ditolak ke setup, pengujian modal setup menggunakan usaha draf terpisah |
| `setup-controls.spec.ts` yang sebelumnya gagal | Lulus; upload PNG/JPEG/WebP, X sebelum simpan, batal, simpan/reload, QRIS sebagai satu-satunya metode, progres, serta simulasi storage penuh |
| `pr5-fixes.spec.ts`: pengaturan/staf | Lulus; guard empat route, tombol sidebar/dropdown, pembuatan staf, profil dan logo WebP, jam Minggu 22.00–02.00, reload, logout–login, dan sesi browser baru |
| `pr5-fixes.spec.ts`: isolasi | Lulus; admin/kasir ditolak route pengaturan/staf dan RPC profil/jam/logo; owner lain tidak membaca/mengubah usaha pertama atau mengambil logonya (HTTP 403) |
| `pr5-fixes.spec.ts`: header | Lulus dengan nama owner panjang pada kategori/identitas/setup di 320, 390, 768, dan 1440 px; tidak bertumpuk atau overflow |
| `pr5-fixes.spec.ts`: motion | Lulus; mode normal bergerak, mode reduce statis tanpa canvas/cascade berulang, flip pointer/keyboard bekerja, dan perubahan preferensi langsung direspons; ukuran kartu tetap |
| Browser landing mobile | Lulus 320/390 px: menu dapat dibuka dan tautan Fitur dapat diklik, anchor menggulir halaman, scroll fade menampilkan konten; tidak ada overflow, hydration error, atau layout shift awal terukur |
| `scripts/test-profile-setup.mjs` terhadap Supabase aktual | Lulus: konflik revisi, larangan direct UPDATE, overlap jam, isolasi tenant, logo private, dua penggantian bersamaan, pembersihan logo, dan akses staf nonaktif |
| Harness autentikasi ulang | Lulus: login staf, wajib mengganti sandi sementara, pembatasan kasir/onboarding, penonaktifan akses, logout, serta penolakan anonim |

Pengujian memakai akun/usaha baru. Semua ID dan file yang dibuat run pengujian dibersihkan. Snapshot data usaha lama tetap identik; pengujian backend profil juga membandingkan anggota, audit staf, dan aset logo usaha lama.

Pada run awal tes tambahan, ada dua kesalahan ekspektasi harness: endpoint logo memang menolak tenant lain dengan 403, serta tombol menu bernama **Buka navigasi**. Ekspektasi diperbaiki berdasarkan perilaku yang benar dan tes diulang hingga lulus; pemeriksaan isolasi tidak dilonggarkan.

Bukti tersimpan di `artifacts/pr5-fixes/`, `artifacts/setup-controls/results.json`, dan `artifacts/catalog/browser-results.json`. Hasil backend profil serta autentikasi disalin ke `artifacts/pr5-fixes/backend-results.json` dan `auth-results.json`.

## Batas verifikasi

- Browser QA menggunakan Microsoft Edge/Chromium dengan viewport laptop dan emulasi HP; belum diuji pada perangkat HP fisik atau Safari.
- Profil, logo, dan jam operasional tersimpan melalui Supabase dan diverifikasi dari sesi baru. Konfigurasi pembayaran setup masih menggunakan localStorage per ID usaha sesuai implementasi yang sudah ada. Perbaikan QRIS menjamin perilaku Simpan/reload pada browser tersebut; sinkronisasi pembayaran lintas browser bukan bagian perubahan ini.
- Pengujian autentikasi memakai akun uji terkonfirmasi melalui admin API sehingga tidak mengirim email OTP sungguhan dan tidak menjalankan consent Google kembali.
- Tidak ada pekerjaan tertunda dalam perbaikan yang diminta. PR belum di-merge.
