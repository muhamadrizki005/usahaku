# Asisten AI UMKM dengan Gemini

Implementasi pada branch `feat/gemini-business-assistant`, diperluas 31 Oktober 2026 sesuai permintaan pengguna. Implementasi Asisten tidak menambah migrasi atau dependency. Pengguna sudah membuat commit fitur dan menggabungkan `origin/main`; agent tidak melakukan commit, push atau deployment.

## Perilaku saat ini

Asisten menulis jawaban percakapan alami untuk ide barang/usaha, promosi/caption, layanan pelanggan, SOP, operasional, rencana belanja, penjelasan keuangan sederhana dan pembacaan data toko. Bukan lagi pemilih jawaban template. Operasional aplikasi tetap kategori toko; pengetahuan umum dapat membahas jenis UMKM lain tanpa membuat modul kategori baru.

Jawaban dibedakan menjadi **saran umum AI**, **ringkasan data toko**, dan **estimasi**. Ide, harga beli rekomendasi dan stok awal yang disarankan bukan harga pasar terkini atau stok aktual. Tidak ada browsing, tool eksekusi, pengiriman pesan, pembelian, atau kemampuan menulis produk/stok/transaksi. Tidak mengaku dapat menghitung laba aktual tanpa data HPP dan biaya. Jawaban AI umum tetap perlu diperiksa pengguna; validasi JSON bukan jaminan seluruh pendapat model benar.

### Pertanyaan balik secukupnya

- Maksimal satu **putaran** klarifikasi per percakapan, paling banyak dua pertanyaan singkat dalam putaran itu. Jika informasi cukup, langsung jawab tanpa klarifikasi.
- Setelah pengguna menjawab, model hanya diberi pilihan mode `answer`, tidak `clarification`. Anggaran yang sudah terbaca juga memaksa mode langsung menjawab.
- Jika detail lain belum ada, model diminta menyebut asumsi dan menyiapkan versi awal, bukan menanyakan lokasi/target/jenis toko berulang.
- Mode `answer` ditolak jika masih mengandung tanda tanya. Output yang mencoba bertanya lagi tidak ditampilkan sebagai jawaban sukses. Dengan demikian klarifikasi dibatasi baik di prompt, schema maupun validasi server.
- Contoh target: setelah "barang baru, anggarannya 1 juta, iya bantu aku", langsung tersedia daftar barang, perkiraan harga beli/satuan, jumlah awal dan total, tanpa meminta izin lagi.
- Batas ini berlaku satu percakapan penuh, termasuk jika berganti topik. Percakapan baru mengembalikan jatah klarifikasi. Ini sengaja lebih ketat agar tidak terjadi loop pertanyaan.

### Rencana belanja

Model mengusulkan maksimal delapan item beserta quantity (hingga tiga desimal), unit dan unitCost rupiah bulat. Server menghitung subtotal tiap baris secara half-up dan menjumlahkan memakai BigInt, bukan memakai total buatan model. UI menampilkan total, anggaran dari percakapan dan sisa cadangan. Jika usulan model melebihi budget yang terbaca, server menurunkan jumlah secara proporsional dengan pembulatan ke bawah: unit barang utuh tetap utuh, berat/volume atau jumlah yang semula pecahan memakai langkah 0,001. Harga satuan tidak diubah. Jumlah juga dibatasi sisa budget setelah pembulatan rupiah agar total tidak melampaui anggaran. Item yang tidak muat pada langkah minimumnya dihilangkan; kondisi tanpa alokasi dijelaskan. UI memberi keterangan eksplisit saat penyesuaian terjadi. Harga tetap perkiraan dan harus dicocokkan dengan pemasok; ini bukan pembelian atau perubahan stok.

Anggaran dibaca deterministik dari pesan, misalnya `anggarannya 1 juta`, `budget Rp1.000.000`, `modal sejuta` atau `budget 1,5 juta`. Jika tidak dikenali, jangan mengklaim budget tertentu sebagai fakta. Budget yang sudah diketahui diteruskan dalam konteks. Nilai tidak disimpan sebagai transaksi/stok baru.

## Percakapan dan privasi

Room chat tetap memakai komponen dashboard, Urbanist, navy, aksen turquoise dan biru yang disetujui. Bubble pengguna di kanan, jawaban di kiri; composer di bawah, log pesan memiliki scroll sendiri. Enter mengirim, Shift+Enter baris baru; draft selama pending dipertahankan dan retry tidak menggandakan bubble gagal. Sumber terverifikasi dapat dibuka pada details. Pesan AI dirender sebagai teks/Markdown sederhana melalui React, tanpa HTML mentah atau eval.

UI menyimpan maksimal sepuluh pertukaran pesan di memori halaman. Konteks server berisi tiga pasangan pertanyaan/balasan terakhir dan status klarifikasi/budget, dengan tanda tangan HMAC terikat user, usaha, periode dan key server; berlaku satu jam dan diperbarui saat jawaban sukses. Browser tidak boleh mengirim sejarah role/system atau counter klarifikasi sendiri. Pemalsuan, peminjaman token akun/usaha lain, perubahan periode dan expiry ditolak. Tidak ada riwayat chat permanen di database/localStorage. Reload, Percakapan baru atau ganti periode mengosongkan konteks frontend.

Key tanda tangan diturunkan dari key server memakai domain pemisah, user dan usaha. API key tidak berada dalam token atau bundle browser. Token bukan terenkripsi: pengguna dapat membaca konteks percakapannya sendiri. Key berubah akan membatalkan konteks lama; mulai percakapan baru untuk melanjutkan.

Ke Google dikirim pertanyaan, beberapa balasan yang telah dihasilkan, periode, ringkasan angka/alias produk dan budget pengguna. ID usaha/user/produk, SKU, nama pelanggan/staf, kontak dan transaksi mentah tidak dikirim otomatis. Histori menyimpan teks model sebelum placeholder fakta diganti nama produk, sehingga nama produk privat dari database tidak bocor melalui balasan historis. Pesan pengguna sendiri bisa mengandung informasi pribadi; UI meminta pengguna tidak menuliskannya.

## Akses dan keakuratan data

`POST /api/assistant` memeriksa Origin, JSON, body maksimum 64KB, pertanyaan 3 sampai 600 karakter dan token konteks maksimum 48.000 karakter. Properti seperti businessId, history, role atau counter client ditolak. Sesi diverifikasi melalui Supabase getUser dan membership aktif owner/admin yang bukan wajib ganti sandi, pada usaha toko yang sudah menyelesaikan onboarding. Kasir/anonim/nonaktif/draft ditolak. RLS/RPC tetap berlaku; service key tidak dipakai membaca data website.

Penjualan memakai RPC `read_sales_report` dan perhitungan existing BigInt. Penjualan dibatalkan dikeluarkan dari tanggal asal; refund manual dipisah menurut tanggal pembatalan, tidak dikurangi dua kali. Stok dibaca saat ini (maksimal 5.000 produk), bukan historis. Penjualan/stok bukan satu snapshot bersama; waktu masing-masing ditampilkan pada sumber.

Pada basis `store_data`, angka di narasi wajib memakai placeholder fakta yang ada dan dirender server menjadi kalimat fakta lengkap. Fact ID asing, placeholder palsu, duplikasi dan angka bebas pada narasi data toko ditolak. Saran umum dan simulasi diberi label berbeda, bukan dianggap catatan database. Pembacaan data yang gagal tidak diganti angka nol: Asisten masih boleh membantu topik umum dengan peringatan bahwa data toko tidak tersedia. Penolakan izin database tetap menghentikan permintaan.

## Konfigurasi

Di `.env.local` (jangan commit atau kirim key ke chat):

```dotenv
GEMINI_API_KEY=isi_key_asli_di_file_lokal
GEMINI_MODEL=gemini-3.5-flash-lite
```

Buat key melalui [Google AI Studio](https://aistudio.google.com/api-keys), lalu restart server lokal. Model dapat diganti dengan ID model yang tersedia pada proyek. Tidak ada fallback otomatis ke model lain atau janji layanan gratis. Tanpa key, UI menampilkan status belum dikonfigurasi dan tombol nonaktif; API 503.

REST `generateContent` dipanggil lewat fetch dengan host Google tetap, header `x-goog-api-key` dan structured JSON output. Output maksimal 2.048 token; timeout provider 45 detik. Tidak ada retry provider otomatis. Respons safety/terpotong/schema salah ditolak; error Google tidak dibocorkan. Header respons private/no-store/nosniff/Vary Cookie. Detail referensi: [API resmi](https://ai.google.dev/api/generate-content), [structured outputs](https://ai.google.dev/gemini-api/docs/structured-output), [keamanan key](https://ai.google.dev/gemini-api/docs/api-key).

Batas aplikasi tetap enam permintaan/menit/anggota, enam puluh/jam/usaha, satu aktif/anggota. Limiter saat ini memori proses lokal: restart mereset dan beberapa instance tidak berbagi limit. Sebelum deployment perlu limiter persisten bersama dan peninjauan kuota/biaya/retensi provider. Deployment tetap ditunda atas permintaan pengguna.

## Pengujian

- Typecheck, production build dan 35/35 tes unit/database lulus pada 31 Oktober 2026, termasuk build setelah perapian teks rincian barang.
- Delapan tes versi umum meliputi parsing anggaran Indonesia (termasuk balasan singkat setelah klarifikasi), klarifikasi terbatas, token konteks/tamper/akun/tenant/periode/expiry, retensi counter setelah histori terpotong, perhitungan rencana pecahan, penyesuaian jumlah agar muat dalam budget, angka toko terverifikasi dan kontrak multi-turn provider.
- Suite browser dengan provider simulasi lulus: percakapan satu putaran lalu rencana satu juta; penolakan klarifikasi kedua, receipt palsu/lintas akun, role nonaktif/kasir/draft/wajib ganti sandi, tenant lain, Origin/body/pertanyaan tidak valid, quota/network/output tidak valid, retry, draft saat pending, Enter/Shift+Enter, periode, reset, sumber, navigasi dan lima viewport. Ringkasan penjualan aktual Rp4.500 dan stok 0,5 kg diperiksa dari data fixture di Supabase, bukan angka palsu UI.
- Suite Gemini aktual lulus tanpa HTTP stub: klarifikasi kebutuhan, balasan persis `barang baru, anggarannya 1 juta, iya bantu aku` langsung menghasilkan daftar estimasi konkret, total Rp705.000 dengan sisa Rp295.000; pertanyaan stok kemudian memakai fakta 0,5 kg dari database; permintaan caption menghasilkan teks promosi umum tanpa pertanyaan lanjutan. Empat panggilan provider melalui website lulus, tanpa page error. Angka rencana itu contoh output estimasi pada run tersebut, bukan harga pasar terverifikasi.
- Screenshot Gemini aktual diperiksa pada desktop 1366×900 dan mobile 390×844: rincian dan total terbaca, composer dapat dipakai, tidak ada horizontal overflow. Pemeriksaan navigasi dashboard terpisah juga lulus dua tes pada pengerjaan versi umum ini.
- Semua tes hosted memakai akun/usaha baru. Cleanup berhasil dan snapshot usaha/member/produk/pergerakan stok/transaksi yang sudah ada tidak berubah. Tidak ada data demo yang diedit.

Temuan saat pengujian aktual: model pernah memberi label `store_data` pada klarifikasi tanpa angka/fakta. Server sekarang memperlakukannya sebagai saran umum hanya jika tidak ada evidence, placeholder atau digit; klaim angka toko tetap wajib memakai fakta terverifikasi. Model juga pernah mengusulkan Rp1.080.000 untuk budget satu juta. Penyesuaian jumlah di server dan tes invariant budget ditambahkan setelah temuan itu. Kedua kegagalan awal tidak dianggap hasil lulus; hasil di atas berasal dari run sesudah perbaikan.

Tes browser umum memakai Supabase aktual dengan akun baru, provider disimulasikan lewat preload `tests/fixtures/gemini-preload.cjs` di server QA terisolasi. Preload hanya bisa berjalan dengan mode eksplisit dan key dummy; tidak diimpor aplikasi. Tes Google nyata harus opt-in `USAHAKU_GEMINI_LIVE=1` karena menghabiskan kuota. Simulasi tidak boleh diklaim sebagai bukti kualitas Gemini nyata. Bukti berada di `.cache/assistant-local/` dan `.cache/urbanist-dashboard-preview/.cache/assistant-*`, bukan untuk commit.

## Arah desain dan pemeriksaan

### Verifikasi setelah integrasi main, 31 Oktober 2026

- Diuji setelah commit pengguna `f03bf53`, dengan perubahan main sampai `5684bc7` sudah tergabung. Working tree aplikasi tetap dipertahankan; hanya tes navigasi Asisten dan catatan ini diperbarui.
- Dependency di checkout QA terisolasi dipasang ulang memakai `npm ci` sesuai `package-lock.json`, termasuk GSAP yang ditambahkan landing di main. Sebelum dependency terpasang, build QA gagal menemukan GSAP; sesudah instalasi production build lulus. Pengguna perlu menyelaraskan dependency lokalnya setelah mengambil perubahan main.
- Typecheck dan 35/35 tes unit/database lulus. Suite browser provider simulasi dengan Supabase aktual lulus, ditambah akses lewat sidebar desktop dan menu mobile. Tes memeriksa pathname sehingga parameter `?category=toko` dari navigasi baru tetap diterima. Locator tes Gemini aktual mengikuti sidebar sekunder baru.
- Suite Gemini aktual dijalankan ulang sesudah merge dan lulus empat panggilan: kebutuhan awal, rencana belanja setelah jawaban budget satu juta, stok terverifikasi dan caption umum. Cleanup akun/usaha uji berhasil; snapshot data lama tetap sama dan tidak ada page error.
- Bukti integrasi disimpan pada `.cache/assistant-local/merge-browser-results.json` dan `merge-live-results.json`, tidak untuk commit. Semua server pengujian agent dihentikan setelah selesai; server pengguna tidak disentuh.

antislop during, session override. ENERGY 1 / RHYTHM 1 / MOTION 0. Room chat dan warna/font dipertahankan; hanya isi jawaban lebih alami, label basis/estimasi dan daftar rencana belanja ditambahkan. List item/total mengikuti gaya rincian transaksi yang sudah ada; tidak membuat tema, aset atau animasi baru.

Delivery gate, lingkup perubahan halaman Asisten:

- Hard Gate PASS: build dan browser aktual berjalan; lima viewport diuji tanpa overflow; tombol, keyboard, pending/empty/error/retry/reset/periode/sumber diperiksa; output model menjadi teks React, angka database berasal dari server dan estimasi berlabel. Kontras putih pada biru 8,24:1 dan teks sekunder pada panel 7,94:1; label amber mengikuti panel gelap yang sama. Tidak ada aset atau klaim aktivitas baru yang dibuat.
- Purpose Gate PASS: background, Urbanist dan logo memakai persetujuan desain yang sudah ada. Tidak menambah gradient, glow, badge dekoratif atau motion. Ikon kirim, reset dan scroll menunjuk tindakan yang benar-benar tersedia.
- Liveliness PASS: ENERGY 1 / RHYTHM 1 / MOTION 0 dipertahankan. Log percakapan menjadi fokus, rincian belanja disusun mengikuti isi jawaban, aksen tombol biru dan identitas logo/turquoise tetap dari UI sebelumnya.
- Craftsmanship PASS: inspeksi screenshot desktop/mobile dan tes interaksi menunjukkan rincian/total/composer terbaca dan dapat dipakai; tidak ada redesign halaman lain, schema, dependency, routing, atau operasi tulis data usaha baru. Keakuratan semua saran bebas model tetap merupakan batas AI, bukan jaminan dari tes ini.
# Floating chat launcher, 31 Oktober 2026

Pembaruan drag: launcher dapat digeser memakai mouse atau sentuhan (Pointer Events dengan pointer capture). Gerakan kurang dari 6px tetap dianggap klik; drag tidak mengaktifkan/menutup chat setelah dilepas. Pointer cancellation/lost capture dibersihkan. Tombol panah memindahkan launcher 16px sebagai alternatif keyboard. Posisi dibatasi ke viewport dengan margin 16px dan tidak disimpan melewati refresh.

Panel mengikuti posisi launcher, memilih ruang di atas/bawah atau samping saat cukup, menyesuaikan tinggi bila sempit, lalu membatasi seluruh kotak ke viewport. Resize, orientasi, visual viewport/keyboard dan pinch viewport menghitung ulang batas launcher/panel. Buka/tutup, percakapan, navigasi halaman, role dan backend tetap seperti versi sebelumnya.

Verifikasi tambahan: typecheck/build dan 46 tes unit/SQL lulus; dua tes geometri mencakup empat sudut, posisi jauh di luar layar, viewport sempit/landscape dan offset visual viewport. Suite floating browser lulus 21 detik: drag mouse saat chat tertutup tidak membuka panel, drag ke empat sudut saat terbuka tidak menutupnya, panel dan launcher tetap di dalam layar, tombol panah, resize empat lebar dan gestur sentuh native emulasi Chromium diuji. HP fisik belum diuji. Pemeriksaan visual memakai screenshot desktop/HP yang dihasilkan suite; tidak menambah desain atau animasi baru.

Pengguna meminta tombol sidebar Asisten Bisnis AI menjadi sakelar tampil/sembunyi tombol floating. Setiap refresh browser kembali tersembunyi. State hanya React pada shared DashboardShell, tidak disimpan di localStorage/sessionStorage/cookie/database. Perpindahan halaman dashboard melalui navigasi klien mempertahankan launcher, panel dan percakapan. Logout atau pergantian identitas usaha/member membongkar komponen; percakapan tidak dibawa ke akun lain.

- Klik sidebar atau menu mobile: tampilkan/sembunyikan launcher tanpa mengganti URL; aria-pressed mencerminkan state. Menyembunyikan launcher ikut menutup panel.
- Klik launcher kanan bawah: buka/tutup panel chat nonmodal. Tutup panel/Escape mengembalikan fokus ke launcher; tombol floating tetap tersedia. Halaman di belakang panel tetap dapat digunakan.
- Panel memakai BusinessAssistant yang sama dengan halaman penuh, termasuk API, batas penggunaan, signed conversation, error/retry, periode, sumber data dan percakapan baru. ID form unik agar halaman penuh dan panel dapat ada bersamaan tanpa label bertabrakan. Rute /dashboard/assistant tetap tersedia untuk akses langsung.
- Logo resmi, navy/panel/turquoise/biru, font dan komponen chat dipertahankan. Panel menyesuaikan viewport, area aman dan visual viewport saat keyboard berubah; composer dapat digulir jika ruang sempit. Tidak ada animasi baru.
- Hak akses tetap seperti sebelumnya: owner/admin toko. Kasir tidak mendapat tombol dan ditolak API; restoran tidak diaktifkan untuk data Asisten melalui perubahan UI ini. Backend tidak diubah. Layout mengirim boolean konfigurasi saja, tanpa API key.

Verifikasi: typecheck, build dan 44 tes unit/SQL lulus. Suite floating browser lulus (17,9 detik), regresi Asisten/API lulus (56,3 detik), menggunakan Supabase aktual dan provider Gemini simulasi berkunci dummy, tanpa kuota Gemini nyata. Sidebar/mobile, tanpa navigasi, draft/jawaban lintas halaman, tutup/Escape/fokus, hide/show, reload reset, admin/kasir, HTTP 403, serta viewport 320/390/768/1440 diuji. Regresi halaman penuh juga mencakup error provider, retry, rate limit, bukti data, isolasi tenant dan lima viewport. Hash data lama identik, cleanup fixture selesai. Bukti pada .cache/assistant-floating/, tidak untuk commit. Screenshot desktop dan 320px diperiksa; keyboard HP fisik belum diuji.

antislop active: during (session override). Design Read: panel bantuan nonmodal untuk UMKM dalam desain Usahaku yang disetujui, ENERGY 1 / RHYTHM 1 / MOTION 0.

- Hard Gate PASS: build dan pengujian browser aktual lulus; kontrol memiliki aksi, fokus/Escape diuji, panel/composer berada dalam viewport dan tidak membuat overflow horizontal. Tidak membuat klaim, data, aset atau font baru.
- Purpose Gate PASS: posisi floating kanan bawah dan shadow membedakan panel bantuan dari halaman kerja sesuai permintaan; logo resmi menjadi launcher. Tidak menambah palet atau gerakan dekoratif.
- Liveliness PASS: chat menjadi fokus saat dibuka; aksen biru/turquoise dan ruang panel mengikuti komponen chat yang sudah disetujui.
- Craftsmanship PASS: screenshot desktop/HP diperiksa; state refresh dan perpindahan halaman diuji, API/role tetap dilindungi dan data demo tidak berubah. Gemini menggunakan simulasi pada tes ini, bukan pengujian model live. Regresi meja restoran lulus 32,6 detik; tes widget final termasuk mode cetak lulus 19,2 detik. Server QA dihentikan sesudah pengujian.
