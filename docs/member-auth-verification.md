# Verifikasi autentikasi dan persistensi anggota

Tanggal pemeriksaan: 26 November 2026 (Asia/Jakarta).

## Implementasi

| Bagian | Hasil implementasi |
| --- | --- |
| Pendaftaran | Tertutup; hanya admin CMS dapat membuat anggota. Tidak ada endpoint register, tautan daftar, atau akses tamu. |
| Identitas login | Satu input menerima HP `08…`, username, atau email. Pasted `+62`/`62`, spasi dan tanda minus dinormalisasi. Username lowercase diawali huruf; kolom opsional disimpan NULL. |
| CMS | `/admin/members`: daftar MySQL, pencarian empat identitas/nama, filter status, 20 baris per halaman, tambah, ubah, aktif/nonaktif, reset terpisah dengan konfirmasi. Akun dengan role selain member tidak dikelola. |
| Password | Argon2id bersama modul admin; anggota 15–200 karakter, spasi/paste diperbolehkan, tanpa trim. Pembuatan/reset default wajib ganti; opsi pendampingan dapat menonaktifkannya. Tidak ada password bersama. |
| Reset darurat | Admin tidak perlu password lama. Password baru dikonfirmasi dan disampaikan privat; transaksi mengganti hash, mencabut sesi dan menulis audit tanpa kredensial. |
| Login pertama | `/change-password`; backend hanya mengizinkan inspeksi sesi, perubahan password dan logout sampai selesai. Perubahan memerlukan password saat ini dan menerbitkan sesi/CSRF baru. |
| Sesi | `member_sessions`, cookie `dewi_member`, Path `/api/v1`, HttpOnly, SameSite=Lax, Secure saat production. Token acak 256 bit hanya disimpan sebagai SHA-256. Default 24 jam, `MEMBER_SESSION_HOURS`. |
| Pemisahan admin | CLI dan `dewi_admin` tetap memakai mekanisme lama. Cookie, CSRF, role dan middleware terpisah. Logout anggota tidak menghapus sesi admin. |
| Kondisi akun | Setiap permintaan memeriksa role, status, revocation dan expiry. Nonaktif mencabut sesi tanpa menghapus riwayat; aktivasi kembali memerlukan login baru. |
| Konsistensi | Login/reset/change dan mutasi memakai kunci baris akun; sesi diperiksa ulang di dalam transaksi mutasi. Efek perawatan/jurnal dan penyelesaian jadwal atomik. |
| Aset | Seluruh state media katalog dipertahankan, termasuk normal, wilted, sick dan key tambahan. Foto pribadi berkas privat dengan metadata pemilik; tidak dilayani melalui endpoint publik. |

Expiry password sementara tidak diaktifkan saat provisioning (`NULL`); login menghormati timestamp expiry jika sudah ditetapkan. Tidak ada rotasi berkala, OTP, email verifikasi, SMTP, WhatsApp, atau penyedia RAG/analisis gambar.

## Persistensi dan tabel

21 tabel setelah perluasan manual: `users`, `roles`, `user_roles`, `user_preferences`, `cultivation_categories`, `species`, `media_assets`, `species_media`, `care_actions`, `species_care_actions`, `cultivation_guides`, `user_cultivations`, `care_schedules`, `care_logs`, `point_transactions`, `chat_conversations`, `chat_messages`, `app_settings`, `admin_audit_logs`, `admin_sessions`, `member_sessions`.

| Data sebelumnya di browser | Sumber server sekarang |
| --- | --- |
| Profil, avatar, daerah, fokus | `users`, `user_preferences`, `media_assets` |
| Ukuran teks, bahasa, suara, pengingat | Kolom terstruktur `user_preferences`; bahasa MVP Indonesia |
| Pet per jenis, metrik, kondisi, pilihan aktif | `user_cultivations`; JSON preferensi terbatas untuk pilihan jenis dan kategori |
| Perawatan dan jurnal | `care_logs`, efek aktif dari `species_care_actions` + `care_actions` |
| Jadwal harian dan penyelesaiannya | `care_schedules`, asosiasi log dan tanggal lokal jadwal |
| Jumlah rawat dan peringkat | Hitungan jurnal; ambang 3/6/10/20, dihitung server |
| Poin, reward dan streak | Ledger `point_transactions`; 5 poin per tanggal server, unique source mencegah klaim ganda |
| Riwayat konsultasi dan foto | `chat_conversations`, `chat_messages`, `media_assets` privat |

Bootstrap mengecualikan isi chat/foto. Percakapan dan pesan dimuat dengan pagination; jurnal memuat 500 terbaru dalam bootstrap dan endpoint jurnal mendukung offset. React menyimpan state pribadi hanya di memori setelah sesi valid, membatalkan request lama saat pergantian sesi, dan membuang state saat logout. Kegagalan backend tidak memberi akses lewat profil lama.

## Bukti database langsung (baca-saja)

- Koneksi ke `dewi_sri` berhasil, 21 tabel terdeteksi.
- Keenam kolom perluasan `users` tersedia. `username` adalah `varchar(50)` ASCII case-insensitive, `phone_number` `varchar(16)` ASCII binary; keduanya mempunyai unique index.
- Primary key hash serta indeks user/revocation dan expiry `member_sessions` tersedia.
- API langsung: `/api/v1/health/database` 200; `/api/v1/health/member-schema` 200; katalog 200 dengan 11 spesies dan 6 kategori.
- `/api/v1/auth/me`, `/api/v1/member/bootstrap`, dan `/api/v1/admin/auth/me` tanpa sesi masing-masing 401.
- Tidak ada schema/seed yang dijalankan, akun dibuat, password diubah, atau aktivitas uji ditulis ke database asli.

Bila perluasan belum tersedia pada mesin lain, buka **phpMyAdmin → dewi_sri → SQL → Paste SQL → Go**, menggunakan `docs/database/04_member_auth.sql`. ALTER hanya sekali. Pada database yang sudah diperluas jangan jalankan skrip ini lagi. API melaporkan `SCHEMA_NOT_READY` secara aman, tanpa menghalangi katalog/admin lain.

## Pengujian otomatis

| Pemeriksaan | Bukti |
| --- | --- |
| Frontend TypeScript | `npm run lint` lulus |
| Frontend unit | `npm test`: 20 lulus |
| Frontend build | `npm run build` lulus |
| Backend TypeScript | `npm run typecheck` lulus |
| Backend unit/HTTP | `npm test`: 20 lulus, memakai mock SQL dan Argon2 nyata |
| Backend build | `npm run build` lulus |
| Browser | `npm run test:browser`: 30 lulus dalam 2,6 menit. Seluruh respons pribadi dan CMS dalam uji browser berupa fixture. Tidak ada uncaught page error pada skenario autentikasi/anggota yang diuji. |

Uji backend meliputi normalisasi HP dan nol awal, login ketiga identitas, generic denial untuk role/status/expiry, cookie dan sesi, CSRF, limiter, password wajib ganti dan rotasi sesi, provisioning/role/default preferences, konflik identitas, rollback, reset tanpa rahasia dalam audit, nonaktif/aktif tanpa menghidupkan sesi lama, efek metrik, idempotensi perawatan dan jadwal, kepemilikan rekaman/media, penolakan field role/points/assistant, serta error schema/koneksi yang disanitasi. Uji bawaan CLI dan katalog tetap lulus.

Uji browser memakai Chromium melalui Microsoft Edge pada 320×568, 360×800, 390×844, 430×932, 768×1024, 1024×768, 1366×768, 1440×900, dan 1920×1080 untuk login, password dan CMS anggota. Layar aplikasi lainnya diperiksa pada 320/768/1440. Tangkapan layar login, password, dan CMS 390/1440 ditinjau visual. Tidak ada angka Lighthouse/Core Web Vitals yang diukur atau diklaim.

Klik yang diuji: input login dan toggle password; submit login → password wajib ganti; URL jadwal tidak melewati pembatasan; submit password → Beranda; refresh mempertahankan sesi; profil A → logout → login B tanpa data A; error server → layar gagal; tambah CMS → anggota muncul; reset → submit; nonaktifkan → konfirmasi; edit → Escape mengembalikan fokus; menu mobile → buka/tutup dengan keyboard; pilih Pet katalog baru → rawat → jurnal server fixture; arsip menjaga riwayat; chat → kirim → riwayat → refresh → buka → lampirkan foto → panduan → hapus dengan konfirmasi. Pengujian baru juga memeriksa uncaught page errors.

## Pemeriksaan desain yang relevan

`GATE: OFF (no build active)` adalah keluaran skrip design-taste. Tidak ada build landing page yang diaktifkan; aturan landing page satu seksi per layar tidak diterapkan pada aplikasi. Pemeriksaan aplikasi dilakukan lewat Playwright dan peninjauan tangkapan layar di atas.

- Hard gate: label dan bantuan terpisah, kontrol native, focus ring, dialog native/Escape, tanpa tautan pendaftaran/tamu; pengujian ukuran layar memeriksa overflow.
- Purpose gate: hijau untuk aksi/status, ikon Users untuk navigasi anggota, kartu untuk identitas dan tindakan per anggota; ilustrasi alat tani memakai aset proyek yang ada. Tidak membuat aset atau klaim baru.
- Liveliness: mengikuti DESIGN.md, ENERGY 2 / RHYTHM 2 / MOTION 1; fokus tiap layar adalah formulir atau daftar akun, tanpa animasi dekoratif baru.
- Craftsmanship: loading/error/empty tersedia, keberhasilan ditampilkan setelah respons server, layout mobile dan desktop mempertahankan pola aplikasi/CMS yang ada. Tidak mengklaim pemeriksaan visual menyeluruh untuk semua fitur katalog lama.

## Legacy LocalStorage

Kunci prototipe tetap ada tanpa dibaca aplikasi anggota: `dewi_sri_profile`, `dewi_sri_pets`, `dewi_sri_species_pets`, `dewi_sri_active_pet`, `dewi_sri_care_schedule`, `dewi_sri_care_journal`, `dewi_sri_care_count`, `dewi_sri_streak_real`, `dewi_sri_points`, `dewi_sri_last_claim_date`, `dewi_sri_daily_reward_date`, `dewi_sri_chat_history`.

Untuk cadangan lokal, buka DevTools → Application → Local Storage pada origin lama. Salin nilai kunci tersebut ke berkas JSON privat di luar repository, tanpa mengubahnya. Jangan memakai Clear site data. Cadangan mungkin berisi foto/profil pribadi; pemilik harus diverifikasi sebelum migrasi yang dibantu pengembang. Tidak ada migrasi/impor otomatis atau penghapusan data lama.

LocalStorage aktif hanya untuk `dewi_sri_catalog_v1`, cache katalog publik. Hook dan fungsi penyimpanan lama dipertahankan sebagai utilitas legacy dengan tes, tetapi tidak digunakan untuk autentikasi/persistensi anggota. Token dan CSRF tidak ditulis ke storage browser.

## Batas verifikasi dan tindak lanjut manual

- Alur tulis dari CMS sampai MySQL dan login anggota nyata belum diuji karena tidak membuat akun uji permanen pada database pengembang. Setelah pengelola siap, buat satu akun anggota sah melalui CMS dan jalankan skenario penerimaan A–G dari permintaan.
- Konkurensi transaksi diuji melalui idempotensi dan mock; pengujian beban/konkurensi multi-koneksi pada MySQL belum dilakukan. Arsitektur memakai kunci akun dan unique ledger/log keys.
- Private media content validation memiliki unit test Sharp bawaan dan HTTP ownership denial. Pengujian file privat nyata dengan dua akun di database tetap perlu dilakukan pada lingkungan uji yang diizinkan.
- Berkas privat tanpa referensi tidak dapat diunduh, tetapi belum ada garbage collector untuk menghapusnya dari disk. Backup MySQL dan direktori upload bersama-sama.
- Bootstrap jurnal dibatasi 500 terbaru; riwayat lebih tua tersedia melalui endpoint offset. Tidak ada impor data prototype, integrasi cuaca, analisis gambar AI, recovery otomatis atau push notification.
- Limiter in-memory cocok untuk satu proses. Deployment multi-instance memerlukan penyimpanan limiter bersama, HTTPS dan penyimpanan file persisten yang tidak dipublikasikan oleh web server.

## Menjalankan pada Windows PowerShell

Dari root proyek, terminal backend:

```powershell
Set-Location backend
npm install
# Gunakan .env lokal yang sudah ada; jangan menimpanya.
npm run typecheck
npm test
npm run build
npm run dev
```

Terminal frontend dari root proyek:

```powershell
npm install
npm run lint
npm test
npm run build
npm run test:browser
npm run dev
```

Gunakan `http://localhost:3000` sesuai `FRONTEND_ORIGIN`. Admin `/admin/login` → `/admin/members`; anggota `/login`. Health API: `http://127.0.0.1:3001/api/v1/health/database` dan `/api/v1/health/member-schema`. Untuk admin baru saja, jalankan `npm run admin:create` dari `backend`; perintah list/reset-password/disable tetap tersedia.

## Pengiriman Git

Perubahan dibuat pada `main`. SHA commit dan hasil push dicatat pada laporan akhir percakapan; tidak menaruh SHA commit itu sendiri di dalam dokumen sebelum commit dibuat. Tidak menyertakan `.env`, dump, hash sesi/password nyata, foto upload, atau artefak browser dalam commit.
