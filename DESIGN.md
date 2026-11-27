# Dewi Sri — Arah Visual

## Identitas

Dewi Sri adalah teman digital bagi petani rumahan dan petani kecil di Indonesia. Ia membantu merawat kebun, tanaman, ikan, dan ayam dengan panduan yang terasa dekat, jelas, dan membumi.

## Karakter

Hangat, telaten, optimistis, dan akrab dengan keseharian tani Indonesia. Humor dan ekspresi maskot boleh hadir secukupnya; informasi perawatan tetap mudah dibaca dan tidak meremehkan pengalaman petani.

## Warna dan bentuk

- Hijau daun `#006A3E` untuk tindakan utama dan status berhasil.
- Hijau muda `#E8F4E9` untuk ruang kebun dan status tenang.
- Gading hangat `#FFF8F5` sebagai latar utama.
- Persik `#FFEADB` untuk aksen, batas, dan elemen yang terasa ramah.
- Cokelat tanah `#2B1704` untuk teks utama; abu-hijau `#6E7A70` untuk teks pendamping.
- Sudut membulat menandai kartu dan kontrol yang disentuh; ilustrasi kebun memberi suasana tanpa mengurangi kontras dan keterbacaan.

## Tipografi dan tata letak

Gunakan sans-serif bulat yang sudah tersedia di proyek, dengan bobot tegas untuk judul dan ukuran nyaman untuk isi. Aplikasi mengutamakan alur satu tangan di ponsel: navigasi bawah tetap mudah dijangkau, area sentuh lega, dan isi tidak tertutup bilah tetap. Pada layar lebar, pertahankan lebar baca yang terukur.

### Multi-Pet

Pet adalah budidaya nyata milik anggota; spesies adalah isi katalog bersama. Beranda mempertahankan habitat statis dan tiga aksi Rawat, Foto kondisi, Jadwal. Tab Tanaman/Ikan/Ayam hanya mengganti kategori. Tombol Pilih Pet memilih rekaman milik anggota; kategori kosong tidak menampilkan budidaya bawaan. Pet Saya berada di bawah Beranda, dengan pencarian nama/jenis/lokasi, filter kategori dan Aktif/Arsip. Nama Pet menjadi judul; jenis, mode, jumlah dan lokasi memberi konteks yang membedakan Pet sejenis.

Formulir tambah memakai kategori lalu jenis terbit, nama saran yang dapat diubah, mode, jumlah, lokasi opsional dan konfirmasi kepemilikan. Rawat Bersama membatasi satu jenis dan membedakan jumlah rekaman Pet dari jumlah tanaman/ekor. Tombol simpan melaporkan sukses sesudah respons backend. Indikator dilabeli catatan virtual. Ilustrasi yang tersedia tetap digunakan; jenis tanpa aset memakai simbol kategori dan nama yang benar. `PetVisual` terpisah dari kepemilikan agar renderer Layered 2D dapat ditambahkan kelak; tidak ada animasi baru pada tahap ini.

Daftar Pet memakai satu kolom di ponsel, dua pada layar menengah dan tiga ketika ruang cukup. Dialog mengikuti panel bawah yang sama, bergulir pada konten panjang dan terpusat pada desktop. Semua pilihan memakai input native, label terlihat, tombol minimal 44 px dan fokus keyboard. Konsep individual/kelompok dan kebijakan kegiatan bersama masih menunggu tinjauan pembimbing PKM.

### Tata letak adaptif

- Di bawah 768 px, layar anggota memakai alur satu kolom dan navigasi bawah selebar ruang yang tersedia, termasuk ponsel lanskap.
- Mulai 768 px, Beranda, perjalanan tani, riwayat konsultasi, dan formulir yang sesuai memakai kolom tambahan. Isi percakapan dan daftar panjang tetap memiliki lebar baca terukur.
- Mulai 1024 px, navigasi utama berpindah menjadi sidebar tetap. Beranda menempatkan spesies sebagai fokus di kolom utama, dengan jadwal dan progres di kolom pendamping. Composer Tanya Tani mengikuti pusat area isi, bukan pusat seluruh viewport.
- CMS internal memakai sidebar pada layar lebar dan menu yang dapat dibuka serta ditutup dengan keyboard pada layar hingga 860 px. Warna merek tetap sama, tetapi bidang kerja lebih tenang dan padat informasi daripada aplikasi anggota.

Ruang untuk navigasi bawah dan composer Tanya Tani mengikuti tinggi elemen yang sebenarnya, termasuk perubahan ukuran tulisan. Pada ponsel, composer menyambung langsung ke navigasi agar isi tidak terlihat melalui celah di antaranya. Kolom teks tumbuh mengikuti pertanyaan sampai batas tinggi layar, lalu dapat digulir di dalamnya. Ikon daftar CMS tetap berukuran tetap dan berada di tengah; nama, tanggal, serta status diberi ruang terpisah.

Tanya Tani memakai header dan tombol lampiran/kirim yang ringkas dengan nama aksesibel. Kartu sambutan mempertahankan ilustrasi tanaman; setelah pertanyaan dikirim, ruang utama dipakai percakapan. Asal jawaban ditulis per pesan, sehingga panduan lokal tidak dianggap hasil AI. Anggota yang masuk dapat langsung mengirim pertanyaan atau foto saat AI diaktifkan; pratinjau foto dan pilihan jenis yang belum diketahui tetap tersedia. Label AI menjelaskan fitur tanpa checkbox atau panel persetujuan, mengikuti permintaan pemilik untuk presentasi. Pembatasan ID akun demo juga dinonaktifkan. CMS hanya menampilkan status aman dan uji koneksi manual.

Rincian implementasi dan hasil pemeriksaan ada di [`docs/responsive-ui-verification.md`](docs/responsive-ui-verification.md).

## Rasa gerak

Gerakan singkat menegaskan aksi pengguna—merawat, memilih peliharaan, atau membuka konsultasi. Hormati `prefers-reduced-motion`; animasi dekoratif tidak boleh menghalangi isi atau kontrol.

Pada layar hingga 600 px, semua dialog menjadi panel bawah yang meluncur naik saat dibuka. Pegangan di atas panel dapat ditarik ke bawah untuk menutup; tarikan pendek mengembalikan panel ke posisinya. Isi tetap dapat digulir, dan tarikan pada isi hanya mengambil alih saat posisi gulir berada di atas. Escape, tombol tutup, fokus keyboard, dan preferensi pengurangan gerak tetap didukung. Dialog pada layar lebih lebar tetap berada di tengah.

## Kejujuran produk

Data cuaca contoh, sesi lokal, saran berbasis aturan, dan diagnosis foto simulasi harus diberi label yang jujur sampai penyedia layanan benar-benar tersambung. Jangan menyatakan email terkirim, akun terverifikasi, cuaca langsung, atau AI memeriksa foto tanpa layanan tersebut.

## Pengguna dan navigasi

Fokus penggunaan pada ponsel, termasuk pengguna ibu-ibu yang memerlukan tulisan nyaman, label langsung, dan area sentuh besar. Empat tujuan utama selalu terlihat: Beranda, Jadwal, Tanya Tani, dan Profil. Rawat, Foto kondisi, dan Jadwal mendapat akses yang sama jelasnya di beranda. Tombol kategori Tanaman, Ikan, dan Ayam mengganti kategori tanpa membuat Pet; Pilih Pet membuka daftar budidaya milik anggota.

Gunakan bahasa Indonesia yang singkat dan sopan. Tulisan isi memakai ukuran sekitar 16 px, dapat diperbesar melalui Profil. Kontrol sentuh minimal 44 px. Dialog menahan fokus, dapat ditutup dengan Escape, dan mengembalikan fokus ke pembukanya.

## Aset dan komposisi

Tanaman harus dikenali jenisnya dan tidak diberi mata, hidung, atau wajah. Hewan memakai proporsi alami tanpa topi atau aksesori. Pertahankan ilustrasi spesies yang transparan. Kartu utama Tanaman, Ikan, dan Ayam memakai latar warna polos yang lembut tanpa pemandangan kebun, kolam, atau kandang. Tiga kartu aksi beranda memakai ikon garis hijau berbentuk penyiram tanaman, kamera, dan kalender; ikon tidak menggantikan label.

ENERGY 2 / RHYTHM 2 / MOTION 1. Kehangatan berasal dari warna daun, bahan terakota, dan ilustrasi spesies. Spesies menjadi fokus visual pada kartu utama, kartu aksi dikelompokkan setara, lalu catatan harian mendapat ruang baca tersendiri. Gerak hanya berupa respons singkat saat hover atau tekan. Tidak ada karakter melayang atau animasi dekoratif berulang.

Ikon garis dipakai untuk mengenali tindakan dan tujuan navigasi. Latar krem di atas ilustrasi menjaga kontras nama spesies. Sorgum dengan catatan air rendah ditampilkan berdaun kuning dan layu; setelah Siram dicatat, ilustrasinya kembali hijau. Perubahan ini menggambarkan progres latihan lokal, bukan diagnosis kondisi tanaman nyata. Sudut bundar menyatukan elemen yang disentuh; lingkaran hanya untuk ikon kecil, bukan seluruh komponen.

Latar beranda memakai langit biru muda dan awan putih lembut, mengikuti referensi dashboard terbaru. Langit memudar ke krem di sekitar bagian bawah habitat agar kegiatan dan catatan tetap tenang dibaca. Label kepala halaman memakai hijau gelap, sementara kontrol kategori memakai bidang putih yang cukup pekat untuk menjaga kontras.
