# ZONA

Aplikasi komunikasi dan hangout lintas platform untuk circle pertemanan dekat — menggabungkan kecepatan chat harian, struktur Circle & Voice Lounge, dan Peta Sosial dengan kontrol privasi server-side.

## Platform & Struktur Monorepo (`pnpm` workspaces)

| Paket | Platform & Teknologi |
| :--- | :--- |
| [`packages/shared`](packages/shared) | Core types, Zustand state, message grouping, spatial map clustering, deterministic fuzzy privacy (`exact`/`fuzzy`/`ghost`), dan Supabase client |
| [`apps/web`](apps/web) | Web App & PWA (Vite + React + TypeScript + Vanilla CSS Design Tokens Light & Dark + Dexie IndexedDB + MapLibre GL + LiveKit WebRTC) |
| [`apps/desktop`](apps/desktop) | Tauri v2 wrapper untuk installer native macOS (`.dmg`) & Windows (`.exe`/`.msi`) + GitHub Actions matrix build |
| [`apps/mobile`](apps/mobile) | Expo Development Build (React Native + TypeScript, 4-tab native navigation, Light & Dark parity, floating voice pill) |
| [`supabase/`](supabase) | PostgreSQL + PostGIS + RLS + Edge Functions (`livekit-token`, `send-push`) + `pg_cron` 24h cleanup + permanent account deletion RPC |

## Menjalankan Secara Lokal

```bash
pnpm install

# Web PWA (Desktop & Mobile Browser)
pnpm dev:web

# Mobile (iOS & Android via Expo)
pnpm dev:mobile

# Desktop Native (macOS / Windows — membutuhkan Rust toolchain)
pnpm dev:desktop

# Verifikasi menyeluruh
pnpm typecheck
pnpm test
pnpm build:web
```

## Menghubungkan ke Supabase & LiveKit Produksi

1. Salin `.env.example` ke `apps/web/.env.local` dan `apps/mobile/.env.local`, lalu isi `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, dan `VITE_LIVEKIT_URL`.
2. Jalankan migrasi SQL secara berurutan:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_storage_and_safety.sql`
   - `supabase/migrations/0003_delete_account_push_and_cron.sql`
3. Deploy Edge Functions `supabase/functions/livekit-token` dan `supabase/functions/send-push`, lalu atur secrets `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, dan `FCM_SERVER_KEY`.
