# Usahaku — Design System
**Dokumentasi visual untuk menyelaraskan desain Figma dengan implementasi v0**

Versi: 1.2 (23 Oktober 2026)
Produk: Usahaku — platform operasional untuk UMKM
Sumber palet: landing page proyek `usahaku-design-system` (`app/page.tsx`) dan screenshot landing yang diberikan pengguna pada 23 Oktober 2026. Nilai hex diambil dari kode; screenshot menentukan arah visualnya.

## 1. Tujuan

Palet acuan adalah **navy gelap sebagai latar dominan, putih untuk teks utama, turquoise untuk aksen, dan biru untuk tombol utama**, seperti landing pada screenshot. Panel memakai variasi navy/abu gelap. Ini menggantikan arahan sebelumnya yang menjadikan workspace terang dan teal gelap sebagai tampilan utama.

Panel putih dalam ilustrasi dashboard landing merupakan varian terang di dalam ilustrasi, bukan dasar warna seluruh aplikasi. Jangan mengambil warna panel ilustrasi tersebut sebagai alasan menjadikan semua halaman putih.

Revisi 1.2 mula-mula hanya memperbarui dokumen. Setelah itu pengguna menyetujui contoh dashboard gelap dan secara eksplisit meminta penerapan palet pada semua halaman serta komponen, termasuk login/signup/onboarding. Implementasi terbaru ada di worktree branch `feat/landing-palette-app`; pengguna kemudian menyetujui penggabungan versi ini ke `main`. Percobaan workspace terang di branch `preview/design-system-pages` sudah dibatalkan pengguna. Rincian penerapan dan pengujian: `docs/PALETTE-APP.md`.

Lebar landing 1800px dan navbar mengambang berbentuk pil adalah kebutuhan desain yang sudah ditetapkan. Dokumen ini mencatat keputusan tersebut, bukan meminta perubahan ukuran, bentuk navbar, atau tampilan website.

Prioritas:
1. Pertahankan hierarki, tata letak, dan fungsi tiap halaman.
2. Samakan warna, tipografi, border, radius, spacing, ikon, dan state komponen.
3. Jaga kontras dan keterbacaan.
4. Terapkan responsivitas untuk desktop, tablet, dan ponsel.
5. Hindari membuat semua section berwarna sama jika desain v0 memang membedakan konteksnya.

## 2. Prinsip visual

- **Modern, minimalis, dan profesional:** gunakan ruang kosong yang cukup, teks jelas, dan komponen yang tidak berlebihan.
- **Navy dominan:** latar `#1C222E`, panel `#273242` atau `#303640`, teks putih dan teks pendukung `#C5CBD5`.
- **Turquoise sebagai aksen:** `#24CBC5` untuk penekanan judul, label, tautan dan indikator aktif pada permukaan gelap.
- **Biru untuk aksi utama:** `#1835D9` dengan teks putih, mengikuti tombol Mulai Sekarang pada landing.
- **Border halus:** gunakan `#454D5B` atau putih transparan pada permukaan gelap; abu-biru dipakai pada varian terang.
- **Data harus terbaca:** tabel, dashboard, form, dan angka keuangan perlu kontras yang kuat.
- **Konsisten dalam pemakaian palet:** bedakan latar navy, aksen turquoise, dan aksi biru. Jangan mengganti tombol utama menjadi teal gelap hanya karena halaman bersifat operasional.

## 3. Color tokens

Nilai berikut mengambil warna landing sebagai sumber. Palet utama adalah varian gelap; tabel varian terang dan status menjadi pendukung. Warna lama pada halaman operasional bukan acuan utama revisi ini.

### Brand dan aksen

| Token | Hex | Penggunaan |
|---|---|---|
| `brand.navy` | `#1C222E` | Hero, section fitur gelap, footer gelap. **Acuan kode** |
| `brand.teal` | `#24CBC5` | Aksen turquoise pada heading/label di area gelap. **Acuan kode** |
| `brand.teal-strong` | `#117C75` | Grafik aktif pada ilustrasi dashboard landing. **Acuan kode** |
| `brand.teal-ui` | `#168D86` | Ikon dan teks teal pada mock dashboard. **Acuan kode** |
| `brand.blue` | `#1835D9` | Tombol CTA biru yang digunakan pada hero. **Acuan kode** |
| `brand.blue-hover` | `#132C9E` | Hover CTA biru navbar landing. **Acuan kode** |

### Surface dan teks utama: varian gelap

| Token | Nilai | Penggunaan |
|---|---|---|
| `surface.page` | `#1C222E` | Latar utama, mengikuti hero landing. |
| `surface.card` | `#273242` | Kartu, form, dan panel pada konteks gelap. |
| `surface.raised` | `#303640` | Panel yang perlu dibedakan dari latar utama. |
| `surface.navbar` | Hitam / 90% | Navbar landing; dropdown mobile hitam / 95%. |
| `text.primary` | `#FFFFFF` | Judul dan teks utama pada navy. |
| `text.secondary` | `#C5CBD5` | Deskripsi dan teks pendukung pada navy. |
| `text.muted` | Putih / 60% | Metadata dan teks tersier pada navy; uji kontras terhadap panel aktual. |
| `border.default` | `#454D5B` | Border panel gelap. |
| `border.subtle` | Putih / 10–20% | Garis pemisah dan outline pada area gelap. |

### Surface dan teks pendukung: varian terang

Gunakan hanya untuk area yang sengaja memerlukan permukaan terang, seperti ilustrasi dashboard pada landing. Varian ini bukan tema utama aplikasi.

| Token | Hex | Penggunaan |
|---|---|---|
| `light.surface.page` | `#F7F9FC` | Latar pada varian terang. **Acuan kode** |
| `light.surface.card` | `#FFFFFF` | Card, form, panel, tabel, dan modal varian terang. **Acuan kode** |
| `surface.dark-raised` | `#303640` | Panel luar/raised pada mockup di area gelap. **Acuan kode** |
| `surface.dark-card` | `#273242` | Card di dalam section gelap. **Acuan kode** |
| `surface.navbar` | `#000000` / 90% | Navbar landing; menu mobile memakai hitam / 95%. Warna akhir bergantung latar di bawah transparansi dan blur. **Acuan kode** |
| `light.text.primary` | `#1C222E` | Teks utama pada permukaan terang. |
| `light.text.secondary` | `#52627A` | Teks pendukung pada permukaan terang. |
| `light.text.muted` | `#667085` | Caption/helper/metadata dengan warna eksplisit, terutama ilustrasi landing. **Acuan kode** |
| `text.muted-token` | `#68758B` | Token global `--muted-foreground` pada mode terang, dipakai kelas `text-muted-foreground`. **Acuan kode** |
| `text.on-dark` | `#FFFFFF` | Heading dan teks utama di area gelap. |
| `text.on-dark-secondary` | `#C5CBD5` | Teks sekunder di area gelap. **Acuan kode** |
| `text.on-dark-opacity` | Putih / 45–80% | Variasi teks sekunder pada hero, navbar, dan footer. Tampilan akhirnya mengikuti warna latar. **Acuan kode** |
| `light.border.default` | `#DFE6F0` | Border card, input, pemisah tabel varian terang. **Acuan kode** |
| `border.dark` | `#454D5B` | Border panel pada area gelap. **Acuan kode** |

### Soft backgrounds dan status

| Token | Hex | Penggunaan |
|---|---|---|
| `surface.teal-soft` | `#E9FBF8` | Background status aktif/teal pada permukaan terang. **Acuan kode** |
| `surface.teal-tint` | `#E9FBF8` | Highlight ringan untuk item aktif. |
| `surface.blue-soft` | `#EEF2FF` | Pilihan/aksi biru yang membutuhkan background lembut. |
| `surface.warning` | `#FFF8E6` | Peringatan yang tidak bersifat fatal. **Acuan kode** |
| `text.warning` | `#A65200` | Teks peringatan pada background terang. **Acuan kode** |
| `surface.warning-feature` | `#FFF7E8` | Peringatan verifikasi pada section fitur landing. **Acuan kode** |
| `text.warning-feature` | `#7A4B18` | Teks peringatan pada `surface.warning-feature`. **Acuan kode** |
| `surface.danger` | `#FEF2F2` | Error atau kondisi gagal. |
| `text.danger` | `#B42318` | Teks error. |
| `surface.success` | `#E9FBF8` | Konfirmasi sukses pada permukaan terang. |
| `text.success` | `#117C75` | Teks/status sukses. |

### Aturan penggunaan warna

- Gunakan navy sebagai dasar palet dan variasi panel gelap untuk membedakan area, seperti landing pada screenshot.
- Teks utama pada navy berwarna putih; teks pendukung memakai `#C5CBD5`. Jangan memakai teks navy pada panel gelap.
- Turquoise `#24CBC5` adalah aksen, bukan latar dominan semua kartu atau pengganti warna tombol utama.
- Biru `#1835D9` adalah warna CTA utama. Tombol sekunder dapat memakai putih transparan dengan border putih transparan seperti Jelajahi Fitur.
- Teal `#117C75`/`#168D86` berasal dari ilustrasi dashboard landing. `#0F766E` adalah warna operasional lama; ketiganya bukan pengganti aksen turquoise atau CTA biru dalam palet utama baru.
- Saat varian terang memang digunakan, pakai token `light.*` dengan pasangan teks gelap. Jangan membawa teks putih ke kartu putih.
- Warna status harus konsisten: sukses/aktif = teal, peringatan = amber, error = merah, informasi/aksi pilihan = biru.
- Hindari teks abu-abu muda di atas latar putih atau teks navy gelap di atas card gelap.

### Ambient gradient background (dashboard)

Dashboard boleh menggunakan ambient gradient background yang lembut untuk menambahkan kedalaman visual tanpa mengubah identitas warna utama Usahaku.

**Tujuan visual**
- Mengadaptasi prinsip gradasi atmosferik dari referensi dashboard Rapport, bukan menyalin warna aslinya.
- Mempertahankan navy sebagai warna dominan dan menjaga tampilan tetap modern, minimalis, profesional, serta nyaman dilihat.
- Membuat latar terasa lebih hidup tanpa mengurangi keterbacaan konten dashboard.

**Aturan warna**
- Gunakan `surface.page` (`#1C222E`) sebagai warna dasar.
- Gunakan turquoise `#24CBC5` sebagai ambient glow dengan opacity rendah.
- Biru `#1835D9` boleh digunakan sebagai ambient glow sekunder dengan opacity rendah.
- Turunkan intensitas glow menggunakan transparansi hingga menyatu secara halus dengan warna dasar.
- Jangan memperkenalkan warna brand baru hanya untuk menghasilkan efek gradasi.
- Jangan mengubah token warna dasar, panel, teks, atau aksi utama yang sudah ditetapkan.

**Aturan implementasi**
- Gunakan kombinasi `radial-gradient()` dan warna dasar navy apabila sesuai dengan layout.
- Tempatkan glow secara strategis, misalnya di area kiri atas dan kanan bawah, dengan ukuran besar dan transisi transparan yang lembut.
- Gradient merupakan lapisan dekoratif pada background halaman, bukan pengganti warna panel/card.
- Pertahankan warna panel `#273242` dan `#303640`, border halus, serta kontras teks sesuai token yang berlaku.
- Hindari gradient yang terlalu terang, saturasi berlebihan, transisi warna yang terlihat keras, atau efek neon.
- Jangan menerapkan gradient secara otomatis ke setiap card, tabel, modal, input, dan komponen navigasi.
- Pastikan teks, grafik, angka finansial, dan kontrol interaktif tetap mudah dibaca.
- Pastikan background tetap konsisten dan responsif di desktop, tablet, serta mobile.

**Prinsip utama:** Ambient gradient memperkaya latar navy, bukan menggantikan palet utama Usahaku. Intensitas, posisi, dan perpaduan warnanya harus ditentukan berdasarkan komposisi layout serta kontras visual, bukan meniru warna referensi secara literal.
<<<<<<< HEAD

=======
>>>>>>> bff74af8c73e257329988f5819cd9da374ba93ce
### Perilaku tema pada implementasi saat ini

Palet target mengikuti warna eksplisit landing pada screenshot, bukan palet grayscale bawaan perangkat. Kode saat ini masih memiliki aturan `.dark` dan `prefers-color-scheme`; revisi dokumen ini tidak mengubah aturan tersebut. Jika nanti palet diterapkan, bedakan target desain dari perilaku tema yang masih ada dan jangan membiarkan token otomatis mengganti navy/turquoise/biru menjadi grayscale.

## 4. Typography

### Font

- **Font utama: Urbanist**, sesuai persetujuan pengguna 24 Oktober 2026 untuk seluruh website. Dimuat lokal melalui `@font-face` dari `public/fonts/urbanist/UrbanistVariable.woff2`, dengan varian italic lokal dan preload font normal pada layout. Pertahankan ukuran, weight, line-height, dan letter-spacing yang sudah ada.
- Gunakan satu keluarga font utama di Figma untuk UI, form, dashboard, tabel, dan navigasi.
- Jangan menggunakan Source Serif 4 atau Geist Mono sebagai font UI utama kecuali ada kebutuhan khusus yang jelas. Keduanya tersedia di konfigurasi kode, tetapi tampilan landing page didominasi sans-serif.

### Skala tipografi

| Gaya | Ukuran acuan | Weight | Penggunaan |
|---|---:|---:|---|
| Display/Hero | 56–72 px desktop; 38–48 px mobile | 600–700 | Headline utama landing page |
| H1 halaman | 32–40 px | 600–700 | Judul halaman |
| H2 section | 28–36 px | 600–700 | Judul section |
| H3/card | 18–22 px | 600 | Judul card |
| Body | 14–16 px | 400 | Isi utama |
| Body small | 12–14 px | 400 | Deskripsi, helper text |
| Caption/metadata | 11–12 px | 400–500 | Tanggal, label tambahan |
| Eyebrow/overline | 10–12 px | 600 | Label kecil dengan letter spacing |

- Gunakan line-height yang nyaman: body sekitar 1.5–1.75; heading sekitar 1.05–1.25.
- Hero dapat memakai tracking negatif yang halus; jangan terapkan tracking ketat pada semua teks.
- Hindari terlalu banyak ukuran font dalam satu halaman.

## 5. Layout dan spacing

Gunakan skala spacing berbasis kelipatan 4 atau 8 px.

| Token | Nilai | Penggunaan |
|---|---:|---|
| `space-1` | 4 px | Jarak ikon dan label yang rapat |
| `space-2` | 8 px | Jarak elemen kecil |
| `space-3` | 12 px | Padding komponen ringkas |
| `space-4` | 16 px | Jarak standar |
| `space-5` | 20 px | Jarak antar-elemen |
| `space-6` | 24 px | Padding card standar |
| `space-8` | 32 px | Jarak antar-kelompok |
| `space-10` | 40 px | Jarak antar-section yang rapat |
| `space-12` | 48 px | Jarak section |
| `space-16` | 64 px | Section besar |

### Container

- Lebar konten landing desktop: maksimum `1800px`, sesuai kebutuhan yang sudah ditetapkan pengguna. Navbar memiliki container tersendiri; tidak harus selebar konten landing.
- Padding horizontal: sekitar `20px` mobile, `32px` tablet, dan `48px` desktop besar.
- Form onboarding dan dashboard harus memiliki lebar baca yang wajar; jangan melebar tanpa batas.
- Gunakan grid yang responsif. Jangan memaksa tiga kolom pada layar sempit.
- Pertahankan alignment antar-heading, deskripsi, card, dan CTA.

## 6. Radius, border, dan elevation

| Komponen | Radius acuan |
|---|---|
| Input dan tombol kecil | 8–12 px |
| Button utama | 10–12 px |
| Card standar | 16 px |
| Card besar / panel fitur | 20–28 px |
| Modal | 16–24 px |
| Badge | Pill / radius penuh |

- Border default: `1px solid #454D5B` atau putih transparan pada permukaan gelap; `#DFE6F0` pada varian terang.
- Border area gelap: gunakan garis tipis transparan putih atau `#454D5B`.
- Gunakan shadow ringan untuk mengangkat card dari latar, bukan shadow hitam yang tebal.
- Hindari menambahkan border dan shadow tebal sekaligus pada setiap komponen.

## 7. Komponen UI

### Button

**Primary**
- Background biru `#1835D9`, mengikuti CTA utama landing; hover `#132C9E`.
- Teks putih dengan weight 600.
- Tinggi target desktop sekitar 40–48 px.
- Radius 10–12 px.

**Secondary**
- Pada palet utama gelap, background putih transparan dengan border putih transparan, seperti Jelajahi Fitur.
- Pada varian terang, background putih dengan border `#DFE6F0`.
- Teks `text.primary`.
- Untuk area gelap, gunakan background putih transparan dan border putih transparan.

**Text button**
- Tanpa background dominan.
- Gunakan turquoise `#24CBC5` pada permukaan gelap, mengikuti tautan Coba demo.

**Interactive states**
- Hover harus terlihat jelas: perubahan warna background/border atau sedikit perubahan brightness.
- Active/pressed harus memberi feedback visual.
- Focus keyboard harus memiliki focus ring yang terlihat.
- Disabled harus terlihat nonaktif tetapi teksnya tetap terbaca.
- Semua tombol yang tampak interaktif harus benar-benar memiliki aksi.

### Cards

- Latar `#273242` atau `#303640` pada palet utama gelap; putih hanya pada varian terang.
- Border tipis `#454D5B`/putih transparan pada panel gelap, `#DFE6F0` pada panel terang.
- Padding standar 20–24 px.
- Judul, deskripsi, dan aksi harus memiliki hierarki jelas.
- Untuk section gelap, gunakan `surface.dark-card` atau transparansi putih yang halus, bukan card putih kecuali memang berupa preview UI.

### Inputs dan form

- Palet utama: background panel gelap, teks putih, border `#454D5B`, label/placeholder dengan pasangan warna yang terbaca.
- Varian terang: background putih, teks navy, border `#DFE6F0`.
- Tinggi input umumnya 42–48 px.
- Label berada di atas input.
- Helper text/error ditempatkan dekat dengan field terkait.
- Focus state memakai turquoise atau biru yang terlihat jelas terhadap permukaannya.
- Error menggunakan merah; jangan mengandalkan warna saja—tambahkan pesan teks.

### Navigation

- Navbar landing tetap mengambang berbentuk pil, berada tetap di atas layar saat scroll, dengan latar hitam transparan dan menu mobile. Bentuk dan perilaku ini merupakan keputusan desain yang sudah ditetapkan.
- Pada palet utama gelap, item aktif memakai aksen turquoise; highlight dapat memakai turquoise transparan. Navbar landing tetap mempertahankan warna yang sudah ada.
- Item hover harus berubah secara halus.
- Pastikan ikon memiliki ukuran dan alignment konsisten.
- Pada mobile, navigasi harus berubah menjadi menu/drawer yang bisa dibuka dan ditutup.

### Badges dan status

- Gunakan pill kecil dengan padding horizontal 8–12 px.
- Status sukses: teal-soft + teks teal gelap.
- Status menunggu: amber-soft + teks amber gelap.
- Status gagal: merah-soft + teks merah gelap.
- Status informasi: blue-soft + teks biru gelap.
- Sertakan teks status; jangan memakai warna sebagai satu-satunya indikator.

### Modal / dialog

- Overlay gelap transparan.
- Panel mengikuti konteks: `surface.card`/`surface.raised` untuk palet utama gelap, putih untuk varian terang yang disengaja.
- Header modal memuat judul dan tombol close.
- Footer aksi konsisten: tombol sekunder di kiri dan tombol utama di kanan pada desktop; susun vertikal jika layar sempit.
- Batasi tinggi modal dan gunakan scroll di dalam panel bila konten panjang.
- Jangan sampai konten modal melebar melewati viewport.

### Data table dan dashboard

- Palet utama: latar navy, panel/table gelap, teks putih dan sekunder `#C5CBD5`.
- Header tabel memakai variasi panel gelap; jika varian terang digunakan, gunakan token `light.*` secara lengkap.
- Border pemisah halus, row height konsisten, kolom rata.
- Angka finansial mudah dipindai; gunakan format rupiah yang konsisten.
- Peringatan stok atau pembayaran memakai warna status yang relevan.
- Pada mobile, ubah tabel menjadi layout yang tetap terbaca atau gunakan scroll horizontal hanya pada area tabel bila benar-benar diperlukan—hindari overflow seluruh halaman.

## 8. Aturan warna per area halaman

### Landing page
- Header: navbar mengambang berbentuk pil, hitam / 90% dengan blur; dropdown mobile hitam / 95%, teks putih dan CTA biru.
- Hero: `#1C222E`, teks putih, aksen `#24CBC5`, CTA biru `#1835D9`.
- Bar manfaat: surface gelap/kontras sesuai layout.
- Section kategori dan sebagian section konten: terang dengan card putih.
- Section fitur dan footer: dark navy.
- Jangan meratakan semua section menjadi putih atau semua menjadi navy.

### Login, signup, dan onboarding
- Palet acuan bila diminta diterapkan: navy, panel gelap, teks putih, aksen turquoise dan aksi biru, mengikuti landing.
- Permintaan implementasi terbaru mencakup login/signup. Pertahankan layout dan alur akun; sesuaikan warna form, link, status dan modal dengan palet yang sudah disetujui.
- Untuk onboarding, jangan mengasumsikan workspace terang sebagai target utama; target palet baru mengikuti landing. Susunan langkah/form tetap dipertahankan jika nanti penerapan diminta.
- Form harus fokus pada keterbacaan dan tidak terlalu padat.

### Dashboard, Produk, Inventori, dan POS
- Target palet mengikuti landing: navy `#1C222E`, panel `#273242`/`#303640`, teks putih dan sekunder `#C5CBD5`.
- Sidebar dan topbar harus konsisten di seluruh halaman.
- Gunakan turquoise `#24CBC5` untuk aksen/indikator aktif dan biru `#1835D9` untuk aksi utama. Teal gelap operasional lama bukan warna utama target baru.
- Amber/merah hanya untuk warning dan error.
- Pertahankan hierarki informasi dan keterbacaan tabel saat menerjemahkan palet landing ke area kerja. Jangan menambahkan elemen hero, animasi, atau mengubah layout untuk mengganti warna.

## 9. Responsive behavior

Desain harus bekerja pada desktop, tablet, dan ponsel.

### Desktop
- Gunakan layout multi-kolom bila kontennya mendukung.
- Pertahankan lebar maksimum container.
- Sidebar dashboard dapat tampil permanen dan dapat di-collapse.

### Tablet
- Kurangi jumlah kolom jika card mulai sempit.
- Pertahankan jarak dan ukuran teks yang nyaman disentuh.
- Sidebar boleh berubah menjadi drawer atau versi compact.

### Mobile
- Semua layout multi-kolom berubah menjadi satu kolom bila diperlukan.
- Padding horizontal sekitar 16–20 px.
- Heading menggunakan ukuran yang lebih kecil dan tidak overflow.
- Tombol penting mudah disentuh; target area interaksi idealnya sekitar 44 px.
- Navbar menjadi menu mobile yang berfungsi.
- Modal menyesuaikan viewport; tidak boleh ada form atau tombol yang terpotong.
- Hindari horizontal page overflow.
- Tabel panjang memakai pendekatan mobile yang jelas.
- Urutan konten tetap logis dan CTA utama tetap mudah ditemukan.

## 10. Ikon dan ilustrasi

- Gunakan ikon bergaya outline yang konsisten, seperti Lucide.
- Ukuran ikon umum 16–20 px; ikon fitur 20–24 px.
- Gunakan warna brand atau muted sesuai konteks.
- Jangan mencampur emoji, ikon filled, dan ikon outline secara acak.
- Screenshot/mock dashboard pada landing page harus dianggap ilustrasi produk, bukan data real, dan diberi keterangan jika diperlukan.

## 11. Accessibility

- Pastikan kontras teks dan background memadai.
- Jangan memakai warna saja untuk membedakan status.
- Semua elemen interaktif harus memiliki hover, focus, active, dan disabled state yang terlihat.
- Berikan label yang jelas untuk input dan tombol ikon.
- Sediakan focus ring untuk navigasi keyboard.
- Hindari font terlalu kecil untuk informasi penting.

## 12. Design tokens untuk Figma

Buat Color Styles atau Variables dengan nama konsisten, misalnya:

- `Brand/Navy`
- `Brand/Teal`
- `Brand/Teal Strong`
- `Brand/Blue`
- `Surface/Page`
- `Surface/Card`
- `Surface/Dark Raised`
- `Surface/Dark Card`
- `Surface/Teal Soft`
- `Surface/Warning`
- `Surface/Danger`
- `Text/Primary`
- `Text/Secondary`
- `Text/Muted`
- `Text/On Dark`
- `Border/Default`
- `Border/Dark`
- `Status/Success`
- `Status/Warning`
- `Status/Error`
- `Status/Info`

Buat Text Styles seperti `Display`, `Heading/H1`, `Heading/H2`, `Heading/H3`, `Body/Default`, `Body/Small`, `Caption`, dan `Overline`.

Gunakan komponen Figma dengan variants untuk button (`Primary`, `Secondary`, `Text`, `Disabled`), input (`Default`, `Focus`, `Error`, `Disabled`), badge/status, card, navbar, sidebar item, dan modal.

## 13. Prompt penggunaan dokumen ini

Saat menerapkan sistem ini pada file Figma yang sudah ada:

> Use the approved Usahaku dark dashboard example and landing palette: dominant navy #1C222E, panels #273242/#303640, white primary text, secondary text #C5CBD5, turquoise accents #24CBC5, and blue primary actions #1835D9. The user authorized this palette across all pages and components, including login, signup, onboarding, and operational pages. Preserve layouts, typography, copy, the 1800px landing container, floating pill navbar, logo, backend and access controls. Keep the landing's white dashboard illustration as an intentional light variant and printed reports/receipts on white paper with dark text. Keep changes isolated from main until authorized to merge.

## 14. Catatan implementasi

- Dokumen ini menyelaraskan desain Figma dengan warna dan pola yang terlihat pada landing page v0; tidak semua token telah didefinisikan sebagai CSS variables dalam kode.
- Jika token Figma dan token CSS nantinya dibuat, pastikan nama dan nilai keduanya disinkronkan.
- Jangan mengubah warna hanya berdasarkan screenshot yang terkompresi; gunakan hex token yang tercantum di dokumen.
- Sebelum penerapan luas, bandingkan satu halaman contoh dengan landing referensi: dominasi navy, pasangan teks putih/sekunder, aksen turquoise, dan CTA biru. Pastikan varian terang tidak kembali menjadi tema utama tanpa permintaan pengguna.
