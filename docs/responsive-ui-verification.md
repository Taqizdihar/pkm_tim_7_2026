# Verifikasi antarmuka responsif — 27 November 2026

## Perbaikan layout Chrome — 27 November 2026

Pemeriksaan ulang mengikuti laporan overlap pada header/composer Tanya Tani serta ikon daftar dashboard CMS. Reproduksi awal pada Chrome menemukan textarea kosong memiliki tinggi 54 px tetapi scroll height 68 px, sehingga contoh pertanyaan terpotong. Ikon CMS berada di atas kontainernya karena aturan umum `article span` menimpa `display: grid`. Pada Beranda tablet/desktop, kartu jadwal dan perjalanan tani juga memakai baris grid yang bertumpuk.

Perubahan:

- Header Tanya Tani memakai kolom fleksibel untuk identitas dan kolom terpisah untuk Riwayat/Baru. Ikon tetap utuh, teks tidak bertabrakan, dan header layar pendek dipadatkan tanpa menghilangkan label tindakan.
- Composer ponsel menyambung ke navigasi bawah. Textarea tidak lagi memiliki pegangan resize manual, memakai tulisan minimal 16 px dan tumbuh mengikuti isi sampai batas tinggi viewport. Pertanyaan panjang dapat digulir di dalam input. Tinggi composer, navigasi, dan sinyal visual viewport menentukan ruang isi secara dinamis; inset area aman tetap dihitung terpisah.
- ResizeObserver dan listener perubahan font menjaga draft tetap terbaca saat lebar atau ukuran tulisan berubah. Perubahan tinggi navigasi tidak menyebabkan siklus pengukuran karena tinggi minimum bilah tidak bergantung pada hasil ukurannya.
- Ikon daftar CMS memakai bidang tetap 40×40 px dengan SVG di tengah. Nama/tanggal mempunyai kolom sendiri; status berada di bawah nama pada ponsel. Judul panel dan tautan dapat berpindah baris ketika ruang sempit.
- Kartu perjalanan tani Beranda dipindahkan ke baris grid tersendiri sehingga tidak menumpuk jadwal pada tablet/desktop.

Matriks tambahan: 360×800, 393×852, 412×915, 430×932, 667×375, 768×1024, 1024×768, 1440×900, dan 1920×1080. Ukuran ini mewakili area CSS ponsel yang disebutkan pengguna dan mode Responsive; pengujian tidak mengklaim memakai perangkat fisik Samsung/iPhone/Pixel. Matriks lama 320 px tetap menjadi bagian regresi.

Pengujian baru memeriksa delapan layar anggota, composer dengan pertanyaan pendek/panjang, tulisan besar 18 px, pemisahan kartu Beranda, dashboard/daftar anggota/Pet CMS, serta ikon yang tetap berada di tengah dengan nama panjang. Sinyal keyboard diuji melalui override visual viewport dan tinggi navigasi diuji dengan pembesaran teks; keyboard fisik iOS/Android tidak diuji. Seluruh API pribadi dan CMS memakai fixture HTTP, tanpa menulis data ke MySQL.

Hasil: `npm run lint`, 20 tes unit frontend, dan `npm run build` lulus. Seluruh 48 skenario browser Chrome lulus, kemudian satu skenario tambahan resize berkelanjutan lulus secara terpisah (49 skenario unik). Skenario terakhir menjaga draft yang sama pada lebar 320, 360, 393, 412, 430, 600, 601, 767, 768, 820, 860, 861, 1023, 1024, 1280, dan 1440 px, lalu mengubah ukuran tulisan pada 360 px tanpa resize tambahan. Tidak ada draft hilang, input pendek terpotong, overflow horizontal, atau error JavaScript pada pemeriksaan tersebut.

Screenshot disimpan di `.artifacts/responsive-2026-11-27/`, meliputi chat dan CMS pada 360/393/412/768/1440 px serta Beranda 768/1440 px. Artefak tidak disertakan dalam Git. Palet, ilustrasi, serta alur aplikasi dipertahankan; tidak ada aset atau dependensi baru. Warna placeholder kini memakai teks pendamping Tanya Tani agar tetap terbaca.

Pemeriksaan kualitas untuk area yang diubah, mengikuti panduan aplikasi dalam `AGENTS.md`:

- R-03 / C-4 PASS: matriks Chrome, resize berkelanjutan, input panjang, tulisan besar, dan lanskap memeriksa reflow serta pemisahan kontrol; screenshot chat 360/1440, CMS 393, dan Beranda 768 ditinjau visual.
- R-25 PASS: placeholder `#506458` di atas `#fafcf6` memiliki rasio kontras 6,15:1, dihitung dengan luminansi relatif WCAG.
- R-24 / R-26 / R-32 / R-39 PASS: kontrol tetap memakai elemen native dan label yang sudah ada; regresi Chrome mencakup navigasi, pengiriman pertanyaan, formulir CMS, menu keyboard, Escape, fokus dialog, serta reduced motion.
- R-27 / R-35 PASS: fixture katalog 503 menampilkan fallback yang jujur, keadaan input kosong/panjang diperiksa, dan pemeriksaan build serta browser lulus.
- R-17 / R-18 / R-23 / R-33 / R-36 / R-38 PASS: diff tidak menambah aset, klaim produk, statistik, atau testimoni; fixture hanya berada di pengujian; perubahan sumber ditulis langsung dengan patch.
- Purpose-Gate / C-1 / C-3 PASS: grid memisahkan identitas, tindakan, ikon, dan isi agar tidak bertabrakan; bayangan tipis composer menandai batas isi yang dapat digulir. Tidak ada bagian pemasaran atau efek dekoratif baru.
- Liveliness / R-37 PASS: ENERGY 2 / RHYTHM 2 / MOTION 1 serta motif daun, ilustrasi spesies, dan palet gading/hijau mengikuti `DESIGN.md`; spesies tetap menjadi fokus Beranda.
- Quality Locks / C-2 / C-5 PASS: hierarki judul, radius, ikon, dan bahasa tindakan mengikuti komponen aplikasi yang ada; tidak ada dependensi baru atau klaim performa/perangkat fisik yang tidak diukur.

Untuk menjalankan pemeriksaan yang sama melalui Google Chrome pada Windows PowerShell dari root:

```powershell
$env:PLAYWRIGHT_CHANNEL = 'chrome'
npm run lint
npm test
npm run build
npm run test:browser
```

## Panel bawah — 26 November 2026

Dialog bersama kini menjadi panel bawah selebar layar pada lebar hingga 600 px, termasuk pilihan spesies, perawatan, panduan, cuaca, editor jadwal, pemilih foto, informasi/pengaturan, konfirmasi hapus percakapan, serta formulir anggota CMS. Desktop tetap memakai dialog di tengah.

Panel meluncur naik selama 280 ms saat dibuka. Pegangan atas mendukung mouse, pen, dan sentuhan; pada sentuhan, area isi noninteraktif juga bisa ditarik saat posisi gulir berada di atas. Tarikan yang cukup jauh atau cepat menutup panel dengan gerak turun 220 ms; tarikan pendek dan pembatalan gestur mengembalikannya selama 200 ms. Gerak langsung mengikuti pointer tanpa pembaruan state React per frame. Tidak ada dependensi animasi baru.

Area gulir dan kontrol formulir tetap memakai interaksi native. Pegangan tetap terlihat saat isi digulir, mempunyai target 44 px dan dapat ditekan dengan keyboard. Escape/backdrop, perangkap fokus native, pengembalian fokus, dan penguncian gulir latar dipertahankan. `prefers-reduced-motion` menonaktifkan animasi otomatis; drag langsung tetap mengikuti tindakan pengguna. Formulir CMS menolak penutupan saat menyimpan. Perubahan ke layout desktop membatalkan drag dan membersihkan transform.

Delapan skenario browser baru telah lulus secara terpisah: seluruh varian anggota pada 320/390 px, animasi masuk dan drag keluar, tarikan pendek/horizontal, Escape/backdrop/keyboard dan fokus, event sentuhan melalui CDP, scroll konten panjang, reduced motion, resize desktop, serta pencegahan tutup saat CMS menyimpan. Pengujian memakai fixture HTTP tanpa menulis ke MySQL. Tangkapan layar `.artifacts/sheet-beranda-care.png` dan `.artifacts/sheet-chat_ai-photo.png` ditinjau visual. Sentuhan diuji lewat emulasi Chromium/Edge, bukan perangkat fisik iOS/Android.

Pemeriksaan regresi sesudah perubahan: `npm run lint`, 20 tes unit frontend, dan `npm run build` lulus; `npm run test:browser` meluluskan seluruh 38 skenario dalam 5,1 menit, mencakup alur anggota dan CMS yang sudah ada.

Pemeriksaan desain: motif dan palet proyek dipertahankan; pegangan menandai arah drag dan gerak hanya menjelaskan pembukaan/penutupan panel. Kontrol native, fokus terlihat, target sentuh, scroll, pembatalan, dan error JavaScript diperiksa lewat skenario tersebut. Tidak membuat aset visual atau mengubah alur backend.

## Tata letak

Aplikasi anggota memakai konten satu kolom dan navigasi bawah di ponsel. Pada 768 px, Beranda menempatkan pilihan spesies serta aksi perawatan di samping ringkasan jadwal dan progres. Pada 1024 px, navigasi berpindah ke sidebar 228 px (250 px mulai 1440 px), sementara area isi tetap dapat menyusut. Halaman Jadwal memiliki panel ringkasan di samping daftar pada desktop. Riwayat percakapan, Profil, Ubah profil, dan Perjalanan merawat memakai grid ketika ruang cukup; jurnal tetap memakai lebar baca terukur. Welcome memakai komposisi terbelah pada desktop; formulir profil lokal tetap sempit dan mudah dibaca.

Composer Tanya Tani dibatasi lebar 720 px. Pada desktop posisinya dihitung dari pusat area isi setelah sidebar; pada ponsel ia berada di atas navigasi bawah. Dialog bawaan memakai elemen `dialog`, dengan batas tinggi viewport, Escape, dan pengembalian fokus. Tombol navigasi utama berbagi definisi layar aktif untuk Beranda, Jadwal, Tanya Tani, dan Profil, termasuk layar turunannya.

CMS memakai sidebar dengan identitas administrator pada desktop. Pada lebar 860 px ke bawah, tombol Menu membuka panel navigasi; Escape menutupnya dan mengembalikan fokus. Dashboard memakai angka API yang sudah tersedia. Status terbit, draf, arsip, aktif, dan nonaktif memiliki label serta warna yang berbeda. Form Pet dikelompokkan menjadi informasi dasar, penerbitan, ilustrasi, dan tindakan. Pratinjau berkas muncul sebelum unggah; API dan penyimpanan backend tidak diubah.

## Pemeriksaan yang dijalankan

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run lint` | Lulus |
| `npm test` | 20 uji lulus |
| `npm run build` | Lulus |
| `npm run test:browser` | 10 uji Chromium/Edge lulus dengan fixture HTTP terisolasi |
| Audit 12 layar anggota pada 320×568, 360×800, 390×844, 430×932, 768×1024, 1024×768, 1280×720, 1366×768, 1440×900, dan 1920×1080 | Tidak ditemukan overflow horizontal atau tumpang tindih composer dengan navigasi |
| Tanya Tani pada 667×375 (ponsel lanskap) | Tidak ditemukan overflow horizontal atau tumpang tindih composer dengan navigasi |
| CMS pada 320, 390, 768, 1440, dan 1920 px | Navigasi, formulir, publikasi Pet, tindakan, panduan, pengaturan, dan logout lulus melalui fixture; tangkapan layar 1920 px diperiksa secara visual |

Uji browser anggota juga memeriksa tautan langsung `?screen=`, tombol navigasi, Back browser, dialog pilihan spesies yang ditutup dengan Escape serta pengembalian fokus, dan pilihan ukuran tulisan besar. Uji CMS memeriksa menu ponsel dengan Enter dan Escape. Alur publikasi Pet baru, tindakan perawatan, pengarsipan, dan catatan lokal memakai fixture HTTP; tidak ada data MySQL pengembang yang diubah.

Pasangan teks baru yang diperiksa dengan rumus kontras WCAG 2.x mencakup teks pendamping CMS `#55685b` di atas `#f4f7f1` (5,52:1), label navigasi `#3f5749` di atas `#eef5ed` (7,08:1), dan status draf `#765114` di atas `#fff0d8` (6,33:1). Fokus keyboard tetap diberi outline yang terlihat.

Tangkapan layar pemeriksaan berada di `.artifacts/responsive-review/` (diabaikan Git), termasuk `beranda-390.png`, `beranda-768.png`, `beranda-1440.png`, `chat_ai-1440.png`, `pengaturan-1440.png`, `admin-dashboard-390.png`, `admin-dashboard-1440.png`, `admin-dashboard-1920.png`, `admin-pet-edit-390.png`, dan `admin-login-1440-final.png`. Gambar awal untuk perbandingan sebelum perubahan tidak diambil. Tangkapan layar utama memakai respons katalog 503 yang disengaja agar fallback lokal teruji; karena itu pesan katalog tidak tersedia tampak di bagian atas.

## Batas pemeriksaan

Browser zoom asli 125%, 150%, dan 200% serta keyboard virtual perangkat fisik belum diuji. Lebar viewport kecil dan pilihan tulisan besar sudah diuji sebagai pemeriksaan reflow terkait. CMS tidak diuji dengan kredensial atau isi MySQL langsung; autentikasi dan perubahan data diverifikasi melalui fixture, sedangkan backend tidak diubah. Cuaca langsung, analisis foto AI, sinkronisasi akun, dan notifikasi perangkat tetap belum terhubung.
