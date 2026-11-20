# Banana 🍌

Mobile-first social app for friend-verified relationship status. Expo (SDK 58, Expo Router) + Supabase (auth, Postgres + RLS, realtime, storage).

## Local setup

Requires Node 22, Docker and the Supabase CLI.

```bash
npm install
supabase start                 # local Supabase in Docker
cp .env.example .env.local     # fill in the publishable key printed by `supabase status`
npx expo start                 # press w for web, or scan the QR code with Expo Go
```

Sign in with a test number `+1 555 000 0001` … `0006`; the code is always `123456` (see `supabase/config.toml`). Real SMS needs Twilio credentials in the `[auth.sms.twilio]` section.

Invite links use `EXPO_PUBLIC_INVITE_BASE_URL` (set it to the production domain, e.g. `https://banana.app`, which should serve the web build so `/i/<token>` opens the invite page).

## Tests

```bash
supabase db reset && node --test tests/backend.test.mjs   # auth, friends, Bunch verification, privacy
supabase db reset && node --test tests/social.test.mjs    # Banana Split, Going Bananas, chat
supabase db reset && node tests/seed-social.mjs           # demo data: Ann + Bob Certified Ripe
```

## Layout

- `supabase/migrations/` — schema, RLS policies and RPCs (validator answers and set-up decisions are never readable by clients)
- `src/app/` — Expo Router screens: `(auth)`, `(tabs)` (Home, Friends, Bunch, Inbox, Me), `i/[token]` invite landing, `survey/[id]`, `setup/new`, `chat/[id]`, `tonight`, `settings`
- `src/components/` — banana UI kit (sticker badge, peel animation, status chips)
