# Aplikasi Chat Web — II4021 (Kelompok 11)

Aplikasi chat berbasis web dengan pendekatan **enkripsi ujung-ke-ujung berorientasi klien**: pesan disimpan di server hanya sebagai **ciphertext** beserta **IV** dan opsional **MAC**, sehingga backend bertindak sebagai relai penyimpanan tanpa dapat membaca isi percakapan asalkan implementasi klien digunakan dengan benar.

Secara teknis, pengguna mendaftar dengan pasangan kunci **ECDH P-256** di browser; **private key** pengguna dienkripsi dengan **AES-GCM** setelah derivasi kunci dari kata sandi (PBKDF2 melalui Web Crypto). Server menyimpan hash kata sandi dengan **bcrypt** (per-user salt), **public key** teks, blob **encrypted_private_key**, dan metadata **kdf_params**. Pertukaran pesan memakai derivasi kunci sesi (HKDF atas shared secret ECDH) dan **AES-GCM** untuk payload chat.

Autentikasi API memakai **JWT** yang ditandatangani secara manual dengan kurva eliptis (**ES256 / ES384 / ES512**) menggunakan modul `cryptography` dan implementasi JWS kustom (`jwt_lib`). Token dibubuhi klaim standar (`sub`, `iat`, `exp`). Notifikasi pesan baru dapat didorong ke klien melalui **WebSocket** (`ConnectionManager` pada FastAPI).

Basis data **PostgreSQL** menyimpan skema relasional (pengguna, pesan terenkripsi). Lapisan data memakai **SQLAlchemy 2.x async** dan driver **asyncpg**; migrasi dapat dikelola dengan **Alembic** (tersedia di dependensi backend).

---

## Stack teknologi & versi runtime

| Lapisan | Teknologi | Versi / catatan |
|--------|-----------|------------------|
| Orkestrasi lokal | Docker Compose | Berkas `docker-compose.yml` di root repo |
| Basis data | PostgreSQL | **16** (`postgres:16-alpine`) |
| Backend | Python | **3.12** (`python:3.12-alpine` pada Dockerfile backend) |
| Backend | FastAPI, Uvicorn[standard], Pydantic, pydantic-settings | Deklarasi di `backend/requirements.txt` (tanpa pin semver ketat di repo) |
| Backend | SQLAlchemy[asyncio], Alembic, asyncpg | Idem |
| Backend | bcrypt, passlib[bcrypt], cryptography, python-jose, python-multipart, python-dotenv | Idem |
| Pengujian backend | pytest, pytest-asyncio, httpx | Idem |
| Frontend | Node.js | **20** (`node:20-alpine` pada Dockerfile frontend) |
| Frontend | Next.js | **16.2.4** (`frontend/package.json`) |
| Frontend | React / React DOM | **19.2.4** |
| Frontend | TypeScript | **^5** |
| Frontend | Tailwind CSS / ESLint | **^4** / **^9** (dev); `eslint-config-next` **16.2.4** |

Versi paket Python mengikuti apa yang terpasang dari `requirements.txt` pada build image; untuk reproducibilitas penuh pertimbangkan mengunci versi dengan `pip-compile` atau menyimpan `requirements.lock`.

---

## Lingkungan: berkas `.env` dan `.env.example`

Docker Compose memuat variabel dari berkas **`.env`** di root proyek (lihat `env_file` pada tiap service). Duplikat template berikut:

```bash
cp .env.example .env
```

Lalu sesuaikan nilai sensitif (kata sandi DB, kunci JWT, origin CORS). Ringkasan variabel di `.env.example`:

| Variabel | Peran |
|----------|--------|
| `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` | Kredensial dan nama database untuk container PostgreSQL. Harus konsisten dengan bagian kredensial di `DATABASE_URL`. |
| `POSTGRES_PORT` | Port host yang dipetakan ke Postgres (default `5432`). |
| `BACKEND_PORT`, `FRONTEND_PORT` | Port host untuk API FastAPI (`8000`) dan Next.js (`3000`). |
| `DATABASE_URL` | URL async SQLAlchemy untuk backend. Di Docker gunakan hostname service **`db`** (bukan `localhost`), misalnya `postgresql+asyncpg://USER:PASS@db:5432/DBNAME`. |
| `CORS_ORIGINS` | Daftar origin yang diizinkan middleware CORS, dipisah koma jika lebih dari satu. Untuk frontend lokal: `http://localhost:3000` (sesuaikan port jika diubah). |
| `JWT_EXP_SECONDS` | Umur token akses dalam detik. |
| `JWT_DEFAULT_ALG` | Algoritma penandatanganan JWT default (`ES256`, `ES384`, atau `ES512`). |
| `JWT_KEYS_JSON` | JSON yang memetakan algoritma ke pasangan kunci: untuk tiap `ES*` wajib ada `private_b64` dan `public_b64` berisi **PEM** yang di-*encode* Base64 (bukan raw DER mentah). **Peringatan di template:** untuk pengembangan, contoh yang sama sering dipakai untuk beberapa kurva; di produksi gunakan pasangan kunci yang sesuai per algoritma. |
| `NEXT_PUBLIC_API_URL` | URL basis API yang dibaca browser (Next.js public env). Untuk akses dari mesin host saat stack Docker berjalan: `http://localhost:8000` (atau `http://127.0.0.1:8000`) mengarah ke port yang dipetakan ke backend. |

Tanpa `.env` yang valid (terutama `JWT_KEYS_JSON` dan DB), container backend tidak akan bisa menginisialisasi otentikasi atau koneksi basis data dengan benar.

---

## Menjalankan aplikasi (Docker)

Dari root repositori, setelah `.env` siap:

```bash
docker compose up --build
```

- **Frontend:** `http://localhost:${FRONTEND_PORT:-3000}`
- **Backend API:** `http://localhost:${BACKEND_PORT:-8000}`
- **PostgreSQL:** host `localhost`, port `${POSTGRES_PORT:-5432}`

Untuk menghentikan stack:

```bash
docker compose down
```

Data Postgres bertahan di volume bernama `pgdata` kecuali volume tersebut dihapus secara eksplisit.

---

## Menguji backend (`pytest`)

**Menjalankan aplikasi (API + frontend + basis data) tetap lewat Docker** seperti bagian di atas. Instruksi virtual environment di bawah hanya untuk **menjalankan tes otomatis** di mesin host, supaya paket dari `requirements.txt` tidak bercampur dengan Python sistem.

Dari folder **`backend/`**, buat dan aktifkan virtual environment:

```bash
cd backend
python -m venv .venv
```

| Platform | Aktivasi |
|----------|-----------|
| Windows (PowerShell) | `.\.venv\Scripts\Activate.ps1` |
| Windows (cmd) | `.venv\Scripts\activate.bat` |
| Linux / macOS | `source .venv/bin/activate` |

Setelah aktif (biasanya prompt menampilkan `(.venv)`):

```bash
pip install -r requirements.txt
```

Pengujian memakai **`backend/pytest.ini`** (`testpaths = test`, `pythonpath = .`). Contoh untuk modul JWT: hanya menguji `app.jwt_lib` dengan kunci EC di memori — **stack aplikasi, PostgreSQL, dan `.env` tidak perlu dijalankan untuk tes tersebut.**

```bash
cd backend
python -m pytest test/test_jwt.py -v
```

---

## Struktur repositori (ringkas)

- `backend/` — FastAPI, otentikasi JWT, WebSocket, model SQLAlchemy.
- `frontend/` — Next.js (App Router), Web Crypto untuk ECDH/AES-GCM/PBKDF2.
- `db/init.sql` — skrip inisialisasi yang di-mount ke Postgres pada pertama kali jalan.
- `docker-compose.yml` — layanan `db`, `backend`, `frontend`.
