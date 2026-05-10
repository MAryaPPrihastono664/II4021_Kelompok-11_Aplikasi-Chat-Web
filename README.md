# II4021_Kelompok-11_Aplikasi-Chat-Web
Aplikasi ini adalah aplikasi chat web yang dibuat untuk memenuhi tugas mata kuliah Kriptografi.

## Deskripsi Program
Aplikasi ini adalah platform chat berbasis web yang mengimplementasikan protokol JSON Web Token (JWT) untuk autentikasi pengguna, Eliptic Curve Diffie-Helmann (ECDH) untuk menghasilkan *shared secret*, dan Advanced Encryption Standard (AES) untuk enkripsi dan dekripsi pesan. Sistem ini menggunakan arsitektur klien-server di mana seluruh operasi kriptografi utama (ECDH, enkripsi pesan AES) berjalan secara lokal di sisi klien menggunakan Web Crypto API, sementara server hanya menangani autentikasi JWT kustom (ECDSA) dan meneruskan ciphertext.

## Teknologi yang Digunakan (Tech Stack)
- **Frontend:** Node.js
- **Backend:** Python, Docker, FastAPI, DOcker Compose
- **Database/Storage:** SQL
- **Kriptografi:** Web Crypto API (untuk sisi klien), algoritma ECDH, AES-GCM, Custom JWT berbasis ECDSA, dan library cryoptography python

## Dependensi
**Frontend:**
- `Node.js` (versi x.x.x)
- Package manager seperti `npm` atau `yarn`

**Backend:**
- `Python` (versi 3.x)
- Library Python (selengkapnya pada `requirements.txt`), antara lain: `cryptography`, `fastapi`, dll.

## Environment / Configuration
1. Buat file `.env` pada direktori root backend (atau frontend jika ada).
2. Isi variabel berikut:
   - `DATABASE_URL=...`
   - `API_URL=...`
   - (Tambahkan konfigurasi kunci publik/privat awal jika diperlukan)

## Tata Cara Menjalankan Program (Lokal)

### Menjalankan Backend
1. Masuk ke direktori `backend/`.
2. Buat virtual environment: `python -m venv venv`
3. Aktifkan virtual environment.
4. Install dependensi: `pip install -r requirements.txt`
5. Jalankan server: `uvicorn app.main:app --reload`

### Menjalankan Frontend
1. Masuk ke direktori `frontend/`.
2. Install dependensi: `npm install`
3. Jalankan development server: `npm run dev`

## Konfigurasi Docker (Bonus)
- Untuk menjalankan seluruh environment menggunakan Docker, gunakan perintah: 
  `docker-compose up --build -d`
- Aplikasi dapat diakses melalui `http://localhost:[PORT]`.

## Tautan Terkait
- **Video Demo:**
