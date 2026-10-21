# Tipografi onboarding

Permintaan pengguna, 21 Oktober 2026: mendekatkan tipografi kategori/identitas usaha ke screenshot tanpa mengubah palet, layout, komponen, atau backend.

## Temuan dan perubahan

`--font-sans` mendeklarasikan Inter, tetapi tidak ada @font-face atau font loader. Chrome DevTools Protocol `CSS.getPlatformFontsForNode` membuktikan glyph sebenarnya memakai Times New Roman, termasuk varian Bold pada judul; daftar `document.fonts` kosong. Nama Inter pada computed font-family saja tidak membuktikan font termuat.

Font Inter Variable normal bobot 100–900 diambil dari sumber resmi Inter dan disimpan lokal bersama lisensi SIL OFL. `app/globals.css` memuat @font-face, body menerapkan font-family yang dideklarasikan, dan root layout melakukan preload. Fallback sans-serif disediakan jika file gagal dimuat. Build/runtime tidak perlu mengambil font dari Google/CDN.

Setelah font termuat, proporsi/hierarki sudah mendekati screenshot. Tidak ada perubahan angka typography pada komponen onboarding maupun kelas layout/palet. Perubahan pemenggalan baris merupakan akibat lebar glyph Inter yang benar.

## Pengukuran

Seluruh angka berikut tetap sama sebelum dan sesudah; font render berubah dari Times New Roman ke Inter Variable.

| Elemen | Ukuran | Weight | Line-height | Letter-spacing |
| --- | --- | --- | --- | --- |
| Judul kategori | 36px | 600 | 40px | -0.9px |
| Deskripsi kategori | 16px | 400 | 28px | normal |
| Judul kartu kategori | 16px | 600 | 24px | normal |
| Deskripsi kartu kategori | 14px | 400 | 24px | normal |
| Fitur kartu kategori | 12px | 600 | 16px | normal |
| Tombol onboarding | 14px | 600 | 20px | normal |
| Judul identitas | 36px | 600 | 40px | normal |
| Deskripsi identitas | 16px | 400 | 24px | normal |
| Judul kartu informasi | 18px | 600 | 28px | normal |
| Deskripsi kartu informasi | 14px | 400 | 20px | normal |
| Label form identitas | 14px | 500 | 20px | normal |

## Perbandingan dan batas verifikasi

- Pasangan screenshot kategori/identitas: viewport 1280×665 CSS px, zoom 100%, DPR 1; identitas tambahan pada 2560×1330. Semua pasangan memakai ukuran/zoom sama.
- Pengguna tidak mengingat zoom screenshot referensi. Skala asli referensi tidak dapat dipastikan dari JPEG yang juga menyertakan bingkai browser dan perbedaan resolusi. Tidak mengklaim pencocokan pixel atau pengukuran ukuran CSS langsung dari gambar referensi.
- `artifacts/typography/comparison.html` menyajikan sebelum/sesudah, screenshot referensi asli, dan tabel metrics. `before.json` dan `after.json` memuat font platform aktual, viewport, zoom, CSS metrics, warna, dan geometri sampel.
- CDP memastikan semua sampel judul, deskripsi, kartu, label, dan tombol memakai font Inter yang dimuat. Warna, border, size, weight, line-height, dan tracking sampel dibandingkan dan tetap sama. Pengecekan seluler 390×844 tidak menemukan overflow horizontal.
- Build/TypeScript lulus. Screenshot memakai akun uji baru dan hanya ID hasil tes yang dihapus. Tidak ada perubahan schema/API/backend atau akun demo.

Sumber font: https://rsms.me/inter/ dan https://github.com/rsms/inter. Lisensi lokal: `public/fonts/inter/LICENSE.txt`.
