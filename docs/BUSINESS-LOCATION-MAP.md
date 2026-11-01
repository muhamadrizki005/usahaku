# Pemilihan titik lokasi usaha

Branch implementasi: `feat/business-location-map`. Form identitas onboarding dan Pengaturan toko tetap memakai tampilan saat ini. Kontrol Lokasi usaha berada tepat di atas Detail Alamat, memakai modal/form existing. Tidak ada perubahan produk, POS, inventori, laporan atau navigasi.

## Perilaku

- Lokasi peta opsional. Pengisian empat dropdown CSV secara manual tetap tersedia tanpa API key atau saat layanan peta bermasalah.
- Saat modal dibuka, lokasi perangkat langsung diminta melalui izin browser (satu pengambilan, bukan pelacakan terus-menerus). Jika diizinkan, peta menuju lokasi tersebut dan memuat alamatnya. Pengguna tetap bisa mencari alamat (tombol Cari/Enter), memilih hasil, mengeklik peta, menggeser pin, atau mengulangi lewat tombol Gunakan lokasi perangkat.
- Lokasi perangkat memakai high accuracy, tanpa cache lama, dan timeout 10 detik. Akurasi tetap bergantung pada perangkat/browser. Saat izin ditolak atau timeout, pencarian/pin manual tetap berfungsi. Callback GPS lama tidak boleh menimpa pilihan manual, dan modal tertutup mengabaikannya. Koordinat tersimpan tidak berubah sampai pengguna mengonfirmasi dan menyimpan profil.
- Pilihan di modal belum mengubah profil/form luar. Batal, Tutup atau Escape menutup modal dan mengabaikan perubahan serta respons yang masih berjalan.
- Gunakan lokasi ini mengisi formulir dan koordinat. Simpan profil adalah satu-satunya langkah yang menulisnya ke database.
- Provinsi/kota/kecamatan/desa dicocokkan berurutan dengan CSV. Tidak memakai fuzzy matching atau menebak kota/kabupaten yang namanya ambigu. Wilayah yang tidak cocok dikosongkan dan pengguna diminta melengkapinya. Ketepatan dan kelengkapan alamat bergantung pada data penyedia; tidak dijanjikan lengkap hingga desa di semua titik.
- Reverse yang belum lengkap dilengkapi melalui Geoapify `boundaries/part-of` untuk wilayah yang benar-benar mencakup titik. Kode Kemendagri dipakai jika tersedia dan cocok dengan ID CSV. Tanpa kode, nama kabupaten/kota yang sama bisa dibedakan hanya jika kecamatan dalam batas tersebut cocok secara unik pada hierarki CSV. Kode yang menunjuk beberapa wilayah tidak dipilih secara acak. Jika layanan batas gagal/kuotanya habis, hasil parsial tetap ditampilkan dan field kosong dilengkapi manual.
- Contoh yang dilaporkan pengguna: `-7.329249, 108.203538`. Reverse awal hanya menyebut Tasikmalaya, sehingga kota/kabupaten ambigu. Setelah lookup batas, hasil nyata menjadi Jawa Barat / Kota Tasikmalaya / Cihideung / Cilembang. Browser memverifikasi empat field ini terisi setelah Gunakan lokasi ini.
- Modal peta memakai varian lebar 900 px pada desktop, tetap dibatasi viewport HP. Klik/drag pin mempertahankan zoom yang dipilih; zoom ke detail hanya saat memilih hasil pencarian atau lokasi perangkat. Empat nilai wilayah ditampilkan dalam preview sebelum diterapkan. Memilih hasil pencarian juga melakukan reverse pada titiknya agar detail administrasi dilengkapi.
- Detail alamat bisa diperbaiki pengguna, termasuk nomor bangunan/patokan. Mengganti wilayah secara manual menghapus koordinat draft untuk menghindari titik lama yang tidak sesuai dengan wilayah baru.
- Hapus titik hanya menghapus koordinat pada formulir, mempertahankan alamat. Setelah Simpan, kedua koordinat menjadi null; tanpa Simpan, konfigurasi lama tetap berlaku.
- Respons reverse yang usang diabaikan, request sebelumnya dibatalkan. Modal tidak bisa menerapkan respons yang gagal/belum selesai. Gagal memuat tile menyediakan Muat ulang peta; alamat tetap dapat diisi manual.

## Konfigurasi dan layanan

```env
GEOAPIFY_API_KEY=your_server_key
```

Simpan hanya pada `.env.local`/konfigurasi server. Jangan memakai prefix NEXT_PUBLIC atau memasukkan key ke Git. API key yang diberikan pengguna diuji tanpa dicetak.

Leaflet 1.9.4 dipakai untuk render, marker dan drag. Peta memakai Geoapify raster `osm-carto`, dengan atribusi Geoapify/OpenStreetMap dan Leaflet tetap terlihat. Key tetap di server, termasuk saat mengambil gambar tile. Impor aset pin mendukung URL string dari Turbopack maupun bentuk static image object. Referensi: [Leaflet](https://leafletjs.com/reference.html), [Geoapify map tiles](https://apidocs.geoapify.com/docs/maps/map-tiles/), [reverse geocoding](https://apidocs.geoapify.com/docs/geocoding/reverse-geocoding/).

- `POST /api/location`: pencarian/reverse terautentikasi; owner yang belum mempunyai usaha juga dapat memakai peta saat onboarding. Staf/admin/kasir, anggota nonaktif dan akun wajib ganti sandi ditolak. Parameter divalidasi ketat; endpoint provider tetap, bukan URL dari klien. Pesan kegagalan tidak mengembalikan body error/key provider. Hasil dikembalikan sebagai data minimal; tidak disisipkan sebagai HTML.
- `GET /api/map-tiles/[z]/[x]/[y]`: proxy raster owner-only dengan validasi koordinat tile. Cache upstream server 24 jam dan browser private 24 jam; URL browser tidak berisi API key.
- Pembatasan per user/per proses: 25 geocode dan 240 permintaan tile per menit. Ini perlindungan dasar per instance, bukan kuota global lintas server; penggunaan Geoapify tetap mengikuti paket akun. Pencarian dijalankan eksplisit, tidak setiap ketikan. Reverse dilakukan saat klik/drag selesai, bukan tiap frame.
- Satu reverse yang parsial dapat menggunakan dua request provider (alamat dan batas administrasi); pemilihan hasil pencarian juga membutuhkan reverse. Ini menambah pemakaian kredit dan waktu respons dibanding versi awal. Lookup batas diberi timeout 8 detik dan tidak menghalangi hasil parsial jika gagal. Referensi: [Geoapify containing administrative areas](https://apidocs.geoapify.com/how-to/location-analysis/containing-administrative-area).
- Pencarian dan koordinat titik dikirim ke Geoapify; tile yang dimuat juga memperlihatkan area peta kepada penyedia. Informasi ini ditampilkan dekat peta. Izin lokasi perangkat diminta ketika pengguna membuka modal peta, sesuai permintaan pengguna untuk langsung menuju lokasi saat ini.
- Koordinat dibatasi bounding box Indonesia (-11,5..6,5 latitude; 94,5..141,5 longitude). Hasil geocode negara lain ditolak. Bounding box bukan pemeriksaan polygon batas negara. Nama wilayah tetap divalidasi terhadap CSV saat menyimpan.

## Penyimpanan

Migrasi tambahan `202610310006_business_map_coordinates.sql` menambah `businesses.latitude` dan `longitude` nullable dengan constraint berpasangan/rentang. RPC baru `create_business_profile_with_map`/`save_business_profile_with_map` membungkus fungsi profil yang sudah ada. Guard owner, isolasi tenant, revision dan draft onboarding tetap berlaku. Profil/alamat/koordinat ditulis dalam transaksi yang sama; koordinat tidak valid membatalkan perubahan lain. Migrasi lama tidak diulang. Pengguna mengonfirmasi migrasi tambahan berhasil diterapkan.

RPC lama dipertahankan untuk kompatibilitas. Seperti sebelumnya, kecocokan nama wilayah berlaku pada server actions website; database menegakkan akses dan validitas koordinat, bukan reverse geocoding wilayah.

## Validasi aktual

- Typecheck, build, dan 55 tes unit lulus. Tes mencakup pencocokan CSV tanpa menebak, kode Kemendagri, Tasikmalaya yang ambigu, kegagalan boundaries, koordinat kosong/invalid/berpasangan, fixed provider endpoint, redaksi error provider, akses owner/tenant/revision serta rollback pembuatan/perubahan profil.
- `tests/browser/business-map.spec.ts` memakai Geoapify sungguhan untuk reverse titik publik Bandung, pencarian jalan, dan raster tile. Respons autofill lengkap/error/race disimulasikan secara eksplisit dalam bagian fixture agar kasus tidak bergantung pada perubahan data provider.
- Browser menguji cancel, pin drag (satu reverse request), respons lambat/gagal, autofill, simpan/reload/login browser baru, hapus titik sebelum/sesudah simpan, wilayah tidak lengkap, perubahan manual yang mengosongkan pin, login admin/kasir dengan API/RPC ditolak, owner lain ditolak mengubah usaha, serta onboarding akun baru dengan koordinat sebagai draf.
- `map-auto-location.spec.ts` lulus: saat modal dibuka, Geolocation API langsung dipanggil; koordinat browser simulasi mengarahkan pin dan autofill tanpa menekan tombol lokasi lagi. Penolakan dan timeout disimulasikan, pencarian manual tetap berfungsi, callback GPS lama tidak menimpa hasil manual, serta callback setelah Escape diabaikan. Ini pengujian mekanisme izin/browser, bukan klaim akurasi GPS perangkat nyata.
- Lebar 320/390/768/1366 diperiksa: modal tidak keluar horizontal, peta menyesuaikan ukuran, kontrol dapat digunakan. Screenshot di `.cache/business-location-map/` merupakan bukti lokal, bukan bahan commit.
- Akun/data uji dibuat terpisah, lalu dibersihkan hanya berdasarkan ID run. Hash usaha lama dibandingkan sebelum/sesudah. Tidak ada key pada URL browser dan tidak ada error JavaScript pada run lulus.
- Regresi `business-regions.spec.ts` dan `restaurant.spec.ts` memeriksa alur manual tanpa titik, persistence, guard onboarding dan pembatasan role yang sudah tersedia.
- Ditemukan ketidakstabilan hash CSV setelah checkout Windows karena LF menjadi CRLF. Generator dan tes kini menormalisasi BOM/CRLF sebelum menghitung hash teks; isi wilayah tidak diubah.

## Antislop Delivery Gate (lingkup perubahan peta)

Design read: kontrol lokasi mendahului alamat, memakai modal, input, border, radius, font dan tombol proyek. ENERGY 1 / RHYTHM 1 / MOTION 1. Peta geografis disediakan penyedia; bukan desain ulang panel atau brand.

- R-02 PASS: copy kontrol baru tanpa em dash.
- R-03 PASS: batas modal/overflow diuji pada empat lebar di atas.
- R-17/R-18 PASS: tidak ada angka marketing atau testimonial baru; koordinat berasal dari titik/fixture yang jelas.
- R-23 PASS: ikon pin memakai aset standar Leaflet untuk fungsi peta yang diminta; tidak membuat logo/aset brand baru.
- R-24 PASS: tautan atribusi provider/OSM/Leaflet valid dan relevan.
- R-25 PASS: teks putih dan `#C5CBD5` pada panel `#273242` mengikuti kontras existing (12,95:1 dan 7,94:1); error memakai token existing.
- R-26 PASS: pencarian, pemilihan/drag, apply/cancel, save, clear dan reload diuji.
- R-27 PASS: loading, kosong, error, retry, pin belum dipilih dan apply disabled tersedia.
- R-28 PASS: tidak menambah FAQ.
- R-32 PASS: modal native existing menjaga fokus; search Enter, marker/peta keyboard Leaflet, tombol dan Escape tersedia; pemilihan alamat juga bisa lewat pencarian/tombol tanpa drag.
- R-33 PASS: source diedit melalui patch; generator hanya menghasilkan data wilayah.
- R-34 PASS: tidak menambah atau mengubah tema.
- R-35 PASS: build dan click-through aktual dijalankan, dengan fixture dibedakan dari panggilan provider sungguhan.
- R-36/R-38 PASS: batas akurasi, quota per instance dan data provider dinyatakan; tidak mengklaim reverse selalu lengkap/akurat.
- R-37 PASS: arah desain dan dials dicatat, gaya modal existing dipertahankan.
- Purpose gate PASS: peta/marker menampilkan lokasi yang dipilih; tidak menambah gradient, glow, badge, ilustrasi atau animasi dekoratif. Perpindahan view tidak memakai animasi.
- Liveliness PASS: titik yang dipilih menjadi fokus modal; input, peta, hasil dan konfirmasi terpisah jelas; aksen/tombol proyek dipertahankan.
- C-1/C-2/C-3 PASS: setiap kontrol melayani pemilihan lokasi; tidak menambah bagian pengisi.
- C-4 PASS: manual fallback, loading/error, draft/persisted, desktop/mobile dan keyboard memiliki jalur yang jelas.
- C-5 PASS: hasil dan keterbatasan didukung test/provider aktual; fixture diberi label dalam tes dan screenshot.
- R-05/R-11/R-15/R-16/R-20/R-21/R-29/R-30/R-31 PASS: layout form, palet, font dan navigasi existing dipertahankan; gaya kontrol baru mengikuti modal proyek.
