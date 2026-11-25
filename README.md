# ZONA — Chat × Circles × Live Social Map

Aplikasi **Social Hangout & Circle Messenger** lintas platform yang menggabungkan:
1. **Kecepatan Chat WhatsApp** (*offline-first*, balasan cepat, *voice note*, reaksi emoji),
2. **Circles & Voice Lounge ala Discord Lite** (kanal topik rapi + masuk ruang suara 1-tap via LiveKit WebRTC),
3. **UI Ekspresif & Live Social Map ala Snapchat** (avatar hidup, 3 mode privasi `Tepat / Area / Ghost`, *Quick Snap* 24 jam, dan fitur **Pin Ajak Kumpul → Auto Channel**).

## Dukungan 4 OS + Web (1 Monorepo)
| Platform | Paket | Status |
| :--- | :--- | :--- |
| **Web PWA (Windows & macOS PC)** | [`apps/web`](apps/web) — Vite + React + MapLibre GL + PWA | Siap jalan (**Mode Demo Lokal** aktif bawaan) |
| **Desktop Native (macOS `.dmg` & Windows `.exe`)** | [`apps/desktop`](apps/desktop) — Tauri v2 (~10 MB) membungkus `apps/web` | Siap build lokal / GitHub Actions |
| **iPhone (iOS) & Android** | [`apps/mobile`](apps/mobile) — Expo React Native berbagi `@zona/shared` | Siap `expo start` / EAS Build |
| **Shared Core Logic** | [`packages/shared`](packages/shared) — Types, Zustand Store, Fuzzy Map Privacy Math | 100% teruji unit test (`vitest`) |
| **Cloud Backend** | [`supabase/`](supabase) — PostgreSQL + PostGIS + RLS + Edge Function LiveKit | Siap `supabase db push` |

---

## Menjalankan Secara Lokal (Mode Demo Tanpa Kredensial)

```bash
pnpm install

# 1. Jalankan versi Web PWA (PC Windows/macOS & browser mobile)
pnpm dev:web

# 2. Jalankan versi Mobile (iPhone & Android lewat Expo)
pnpm dev:mobile

# 3. Jalankan versi Desktop Native (macOS / Windows — butuh Rust toolchain)
pnpm dev:desktop

# Verifikasi TypeScript, unit tests, dan production web bundle
pnpm typecheck
pnpm test
pnpm build:web
```

## Build Installer Desktop (macOS & Windows)
* **Otomatis lewat GitHub Actions:** Buka tab **Actions** → **CI & Cross-Platform Builds** → klik **Run workflow** untuk menghasilkan installer `.dmg` (macOS) dan `.exe`/`.msi` (Windows) tanpa perlu memiliki kedua PC sekaligus.
* **Lokal:** Jalankan `pnpm build:desktop` di mesin macOS (untuk `.dmg`) atau Windows (untuk `.exe`/`.msi`).

## Menghubungkan ke Supabase & LiveKit Asli
1. Salin `.env.example` ke `apps/web/.env.local` dan `apps/mobile/.env.local`, ubah `DEMO_MODE=false` lalu isi kredensial Supabase & LiveKit.
2. Terapkan skema database & fungsi PostGIS dari `supabase/migrations/0001_initial_schema.sql`.
3. Deploy Edge Function `supabase/functions/livekit-token/index.ts` dan set secrets `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`.
