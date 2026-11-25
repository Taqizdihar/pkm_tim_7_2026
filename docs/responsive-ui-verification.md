# Verifikasi antarmuka responsif — 25 November 2026

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
