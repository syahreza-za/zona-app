# ZONA — Panduan Produksi & Publish (Checklist 15 Menit)

Panduan ringkas untuk meluncurkan **ZONA** secara real-time lintas perangkat: **Web PWA**, **macOS (`.dmg`)**, **Windows (`.exe` / `.msi`)**, **Android (`.apk` / `.aab`)**, dan **iOS (`TestFlight` / App Store)** dari 1 backend Supabase + LiveKit Cloud.

---

## Step 1 — Setup Supabase Cloud Gratis (5 Menit)

1. Buat proyek baru di [supabase.com](https://supabase.com) (pilih region **Singapore `ap-southeast-1`** untuk latensi rendah di Indonesia).
2. Buka **SQL Editor**, lalu jalankan ketiga file migrasi berikut secara berurutan:
   - `supabase/migrations/0001_initial_schema.sql` (tabel inti, PostGIS, RLS, RPC `get_circle_map_members` & `create_hangout_pin`)
   - `supabase/migrations/0002_storage_and_safety.sql` (bucket `zona-media`, reactions, block/report, RPC `create_circle_with_defaults` & `join_circle_by_invite`)
   - `supabase/migrations/0003_delete_account_push_and_cron.sql` (edit/hapus pesan, `push_tokens`, `delete_own_account`, & pembersihan otomatis 24 jam)
3. Aktifkan **Realtime** di Dashboard Supabase → **Database → Replication** untuk tabel:
   - `messages`, `channels`, `hangout_pins`, `hangout_rsvps`
4. Aktifkan **Authentication → Providers**:
   - Email/Password (aktif default)
   - Opsional: **Google** & **Apple** OAuth (masukkan URL deploy Web PWA di *Redirect URLs*).
5. Catat **Project URL** (`SUPABASE_URL`) dan **Anon Public Key** (`SUPABASE_ANON_KEY`) dari **Settings → API**.
6. Deploy 2 Edge Functions lewat Supabase CLI:
   ```bash
   npx supabase login
   npx supabase link --project-ref <PROJECT_REF>
   npx supabase functions deploy livekit-token
   npx supabase functions deploy send-push
   ```

---

## Step 2 — Setup LiveKit Cloud Gratis untuk Voice Lounge (2 Menit)

1. Buat proyek gratis di [cloud.livekit.io](https://cloud.livekit.io) (free tier mencakup 50 GB/bulan).
2. Ambil `LIVEKIT_URL` (`wss://<project>.livekit.cloud`), `LIVEKIT_API_KEY`, dan `LIVEKIT_API_SECRET`.
3. Simpan sebagai secret Supabase Edge Functions:
   ```bash
   npx supabase secrets set \
     LIVEKIT_URL="wss://<project>.livekit.cloud" \
     LIVEKIT_API_KEY="<API_KEY>" \
     LIVEKIT_API_SECRET="<API_SECRET>"
   ```

---

## Step 3 — Deploy Web PWA Gratis ke Vercel atau Cloudflare Pages (3 Menit)

### Opsi A — Vercel (Direkomendasikan)
1. Import repo `syahreza-za/zona-app` di [vercel.com/new](https://vercel.com/new).
2. Set **Root Directory** ke `apps/web` (konfigurasi SPA & header `sw.js` sudah otomatis dibaca dari `apps/web/vercel.json`).
3. Tambahkan **Environment Variables**:
   ```env
   VITE_SUPABASE_URL=https://<project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<SUPABASE_ANON_KEY>
   VITE_LIVEKIT_URL=wss://<project>.livekit.cloud
   ```
4. Klik **Deploy** → Web PWA siap dibuka dan di-install di Chrome/Safari/Edge!

### Opsi B — Cloudflare Pages
1. Hubungkan repo GitHub di **Cloudflare Pages**.
2. **Build command:** `pnpm install && pnpm build:web`
3. **Build output directory:** `apps/web/dist` (`apps/web/public/_redirects` sudah otomatis menangani routing SPA).
4. Tambahkan 3 environment variables yang sama (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_LIVEKIT_URL`).

---

## Step 4 — Build Installer macOS (`.dmg`) & Windows (`.exe` / `.msi`) via 1 Klik GitHub Actions (3 Menit)

1. Di GitHub repo → **Settings → Secrets and variables → Actions**, tambahkan Repository Secrets:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_LIVEKIT_URL`
2. Jalankan build dengan salah satu cara:
   - **Manual 1-Klik:** Buka tab **Actions → CI & Cross-Platform Builds → Run workflow**.
   - **Release Tag Otomatis:**
     ```bash
     git tag v0.2.0
     git push origin v0.2.0
     ```
3. Setelah selesai (~8 menit), unduh installer langsung dari **Workflow Artifacts** (atau Draft Release):
   - `ZONA-macOS-dmg` → file `.dmg` siap pasang di macOS
   - `ZONA-Windows-exe-msi` → file `.exe` & `.msi` siap pasang di Windows

---

## Step 5 — Build Mobile Android (`.apk` / `.aab`) & iOS (`TestFlight`) via EAS Build (2 Menit)

1. Install & login EAS CLI:
   ```bash
   npm install -g eas-cli
   eas login
   ```
2. Masuk ke direktori mobile dan inisialisasi proyek Expo (1 kali saja):
   ```bash
   cd apps/mobile
   eas init
   ```
3. Simpan environment variables Supabase agar HP tersambung ke backend yang sama dengan Web/PC:
   ```bash
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_URL --value "https://<project-ref>.supabase.co"
   eas secret:create --scope project --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<SUPABASE_ANON_KEY>"
   ```
4. Jalankan build sesuai target:
   - **Android `.apk` langsung install di HP (Internal / Teman):**
     ```bash
     eas build --platform android --profile preview
     ```
   - **Android `.aab` untuk Google Play Store:**
     ```bash
     eas build --platform android --profile production
     ```
   - **iOS `.ipa` untuk TestFlight & App Store:**
     ```bash
     eas build --platform ios --profile production
     eas submit --platform ios --latest
     ```
