# Geovit — Pemetaan Sensus

Aplikasi Next.js/TypeScript untuk lokasi sensus berbasis SLS. Menggunakan shadcn/ui + Radix, Leaflet + OpenStreetMap, PostgreSQL + Drizzle, Auth.js Credentials, dan ImageKit. Tidak menggunakan API Google Maps, geocoding, atau layanan rute.

## Menjalankan lokal

```sh
npm install
npm run db:local
```

Biarkan terminal PostgreSQL tetap berjalan. Perintah ini menjalankan PostgreSQL sungguhan secara lokal pada `127.0.0.1:55439`, tanpa memasang service sistem. Data disimpan di `.data/postgres`. Pada penggunaan pertama, konfigurasi acak dibuat di `.data/local-config.json` dan `.env.local` (file yang sudah ada tidak ditimpa).

Di terminal lain:

```sh
npm run db:push
npm run db:seed
npm run dev
```

Buka http://localhost:3000. Akun awal menggunakan `ADMIN_EMAIL` dan `ADMIN_PASSWORD` dari `.env.local`. Pada workspace yang sudah disiapkan, akses admin juga tersedia di `.data/admin-access.txt`. Jangan commit atau membagikan file konfigurasi rahasia tersebut.

Seed bersifat idempoten dan menyediakan 4 SLS serta 24 **lokasi ilustrasi**, bukan data sensus resmi. Jangan menjalankan seed contoh pada database produksi. Tanpa `DATABASE_URL`, aplikasi menampilkan mode contoh dengan kunjungan/komentar tersimpan di `.data/demo.json`; login dan pengubahan master data dinonaktifkan.

## Fitur

- Peta publik, zoom/pan, popup marker berwarna per SLS, clustering, pencarian nama/alamat, filter SLS/status, tampilan daftar dan responsif mobile.
- Detail `/location/{id}` dengan foto, koordinat yang dapat disalin, kunjungan, dan komentar yang langsung tampil.
- UUID pengunjung tersimpan di localStorage. Constraint unik PostgreSQL `(location_id, visitor_id)` mencegah kunjungan ganda. Menghapus penyimpanan browser atau berganti browser menghasilkan identitas baru.
- Komentar publik langsung tampil. Pengelola dapat menghapus komentar yang tidak sesuai. Nama dan isi dirender sebagai teks.
- Editor menambah/mengedit lokasi, memilih titik pada peta, memasukkan koordinat manual, mengunggah/menghapus foto master, dan menghapus komentar.
- Admin dapat melakukan seluruh tindakan editor, mengelola SLS, menambah/menghapus pengguna, menghapus lokasi, serta mengimpor CSV/XLSX.
- Import menampilkan preview dan error per baris. Hanya baris valid yang dikonfirmasi dikirim; server memvalidasi ulang semua baris dan menyimpannya dalam transaksi. Maksimal 1.000 baris / 5 MB per file.
- Foto development dan produksi diunggah ke ImageKit melalui server. Hanya JPG/PNG/WebP maksimal 5 MB; tipe dan signature file diverifikasi.

## Format import

```csv
kode_sls,judul,alamat,latitude,longitude,deskripsi
SLS-001,Rumah Ahmad,Jl. Cemara No. 1,-6.184,106.837,Lokasi sensus
```

Header sama digunakan pada lembar pertama Excel `.xlsx`. Kode SLS harus ada dan aktif. Latitude -90–90 dan longitude -180–180. Koordinat kosong ditolak. Template CSV tersedia pada tab Import data.

## Produksi

### Deploy ke Vercel

Next.js dideteksi otomatis oleh Vercel, jadi proyek ini tidak memerlukan `vercel.json`. Impor repository sebagai proyek baru, biarkan **Framework Preset** menjadi Next.js, **Install Command** `npm ci`, dan **Build Command** `npm run build`.

Tambahkan variabel berikut pada **Preview** dan **Production** di Project Settings → Environment Variables:

| Variabel | Nilai produksi |
| --- | --- |
| `DATABASE_URL` | URL PostgreSQL production, sebaiknya endpoint pooled dari Neon |
| `AUTH_SECRET` | Secret acak minimal 32 karakter |
| `AUTH_URL` | URL kanonis aplikasi, misalnya `https://geovit.vercel.app` |
| `IMAGEKIT_PRIVATE_KEY` | Private key ImageKit, server-only |
| `IMAGEKIT_UPLOAD_FOLDER` | Opsional; default `/geovit/locations` |

Gunakan database Preview terpisah dari Production. Setelah `DATABASE_URL` production tersedia, jalankan dari komputer tepercaya dengan environment production:

```sh
npm run db:push
npm run db:create-admin
```

`db:create-admin` hanya membuat atau memperbarui akun yang ditentukan oleh `ADMIN_EMAIL` dan `ADMIN_PASSWORD`; script ini tidak memasukkan lokasi contoh. Simpan kedua variabel tersebut hanya saat menjalankan script, tidak perlu ditambahkan ke Vercel setelah akun dibuat.

Lakukan deploy pertama sebagai Preview, periksa login, unggah foto, peta, komentar, dan PostgreSQL, lalu promosikan deployment tersebut ke Production. Vercel menyediakan environment variables per Preview dan Production; perubahan variabel memerlukan deploy baru agar dipakai aplikasi.

Salin `.env.example` ke konfigurasi host dan isi PostgreSQL, `AUTH_SECRET` acak, `AUTH_URL`, serta `IMAGEKIT_PRIVATE_KEY`. `DATABASE_URL` harus berupa URL lengkap, misalnya `postgresql://USER:PASSWORD@HOST:5432/DB_NAME`; jika formatnya tidak valid aplikasi aman masuk mode contoh dan tidak mencoba membuat koneksi. Folder upload diatur lewat `IMAGEKIT_UPLOAD_FOLDER` (default `/geovit/locations`). Ambil private key dari dashboard ImageKit, lalu simpan hanya di server; jangan menggunakan prefix `NEXT_PUBLIC_`. Public key dan URL endpoint tidak dibutuhkan untuk alur upload server ini: URL HTTPS dari respons ImageKit disimpan sebagai URL foto. Lihat [dokumentasi upload ImageKit](https://imagekit.io/docs/api-reference/upload-file/upload-file). Tanpa private key, upload mengembalikan pesan konfigurasi belum tersedia; tidak ada fallback penyimpanan lokal. Foto lama tetap dapat dibaca dari URL tersimpan. Menghapus foto master melepas referensi dari lokasi; file di Media Library ImageKit tidak otomatis dihapus.

```sh
npm run db:push
npm run build
npm start
```

Untuk membuat akun admin awal, set `ADMIN_EMAIL` dan `ADMIN_PASSWORD` (minimal 12 karakter). Script `db:seed` juga menambahkan data ilustrasi, sehingga buat akun admin secara terpisah dari script ini jika database berisi data produksi. Password tersimpan sebagai hash bcrypt; jangan memakai akun lokal di produksi.

API memverifikasi sesi dan membaca peran terbaru dari PostgreSQL pada setiap permintaan. Mutasi master hanya untuk peran yang berwenang. Query terparameterisasi; API mengembalikan maksimal 100 lokasi per halaman. Filter dan pagination diproses server. Index mencakup kode SLS, SLS lokasi, latitude/longitude, kunjungan, dan komentar. Clustering berlaku pada marker di halaman aktif. Daftar komentar/pengguna menampilkan maksimal 100 entri terbaru.

Pembatasan login/komentar dasar menggunakan memori proses. Untuk deployment dengan beberapa instance atau trafik publik tinggi, gunakan rate limiter terpusat pada reverse proxy/Redis. Gunakan HTTPS, backup PostgreSQL, dan batas ukuran request pada host. UUID browser bukan bukti identitas seseorang.

Tile OSM menggunakan URL resmi, attribution terlihat, cache browser standar, tanpa bulk download/offline prefetch. Ikuti [kebijakan tile OpenStreetMap](https://operations.osmfoundation.org/policies/tiles/). Untuk trafik besar, gunakan provider tile yang sesuai atau host sendiri. Toggle poligon menampilkan batas SLS yang disimpan oleh pengelola; verifikasi sumber batas sebelum digunakan sebagai referensi resmi.

## Struktur

- `src/components/map.tsx`: API map bebas provider; implementasi Leaflet dimuat lazy melalui `map-leaflet.tsx`.
- `src/components/explorer.tsx`: pencarian, peta publik, detail, komentar, login.
- `src/components/manager.tsx`: form editor, SLS, import, moderasi, pengguna.
- `src/components/ui/`: primitives shadcn/ui yang dapat dipakai ulang, dengan konfigurasi di `components.json`.
- `src/app/api/data/route.ts`: query publik dan mutasi tervalidasi dengan otorisasi.
- `src/app/api/upload/route.ts`: upload foto ke ImageKit, setelah autentikasi dan validasi file.
- `src/auth.ts`: Auth.js, bcrypt, sesi JWT dan otorisasi DB.
- `src/lib/schema.ts`: schema PostgreSQL dan index Drizzle.

## Verifikasi

```sh
npm run lint
npm run build
npm test
```

Test integrasi memerlukan server development berjalan dan PostgreSQL pada `.env.local`; menggunakan akun admin yang dikonfigurasi untuk membuat fixture terisolasi. Fixture dibersihkan setelah tes. Cakupan: otorisasi, kunjungan idempoten, moderasi komentar, transaksi import, koordinat, upload tidak valid, dan cascade deletion. Tanpa DATABASE_URL, tes integrasi dilewati; tes validasi tetap berjalan.
