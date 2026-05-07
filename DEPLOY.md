# Deploy TokenCalc to Vercel

Production checklist for shipping `prod` to Vercel + Supabase.

## 1. Supabase project

You're already on `cjwjkvsgkiajeasztntu` (TokenTracker). For a brand-new
project, run the migrations in order against any blank Supabase database:

```bash
supabase/migrations/0001_init.sql                          # base schema + RLS + auth trigger
supabase/migrations/0002_agent_snapshots_provider_period.sql  # multi-provider snapshots
supabase/migrations/0003_admin_lock.sql                    # email-locked admin
supabase/migrations/0004_user_disabled.sql                 # disable/re-enable column + guard
```

In the Supabase dashboard:

- **Authentication → Providers → Google**: enable. Add the Vercel preview
  + production URLs as authorized redirect URLs:
  - `https://<your-vercel-domain>.vercel.app/auth/callback`
  - `https://<custom-domain>/auth/callback` (if used)
- **Authentication → URL Configuration → Site URL**: set to the production URL.
- **Project Settings → API**: copy the URL, anon key, and service role key.

## 2. Vercel project

Import the repo at <https://github.com/viloljoshibigstep-cloud/Tokencalculator>
and select the `prod` branch as Production. Framework preset: **Next.js**.
Root directory: repo root. Build command and output directory: **default**
(`next build`).

### Environment variables

Set these in Vercel → Project Settings → Environment Variables, scoped to
**Production, Preview, and Development**:

| Variable | Source | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → API → Project URL | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → API → anon `public` key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → API → `service_role` key | **server-only**, never `NEXT_PUBLIC_*` |
| `NEXT_PUBLIC_APP_URL` | Your Vercel production URL, no trailing slash | `https://tokencalc.vercel.app` |

The first three are required. Everything else (auth, ingest, admin)
reads from these.

## 3. Google OAuth client (one-time)

Google Cloud Console → APIs & Services → Credentials → Create OAuth
client ID, type "Web application". Add as authorized redirect URIs:

- The Supabase callback (Supabase shows it on the Google provider page
  — looks like `https://<ref>.supabase.co/auth/v1/callback`)

Then paste the client ID + secret into Supabase Auth → Providers → Google.

## 4. Bigstep employees only — restrict signups

Supabase Auth currently allows any Google account. To restrict to
`@bigsteptech.com` emails, go to **Authentication → Email Templates →
Hooks** (or use a database trigger) and reject other domains. Quickest
inline option is to add a check in `handle_new_user` — say the word and
I'll add it as a 0005 migration.

## 5. Deploy

Push to `prod` (already what we're doing). Vercel auto-deploys on every
push. The first deploy will take ~2 minutes.

After deploy:

1. Open `https://<vercel-domain>/login` and sign in with Google.
2. Confirm you land on `/dashboard` and the sidebar shows **Team** (proof
   the email-based admin trigger fired).
3. Open `/onboarding`, copy the install one-liner, run it locally. Wait
   ~30 seconds and confirm `/tools` shows your detected providers.

## 6. Agent install command — production

The install one-liner needs to point at your production URL, not
localhost. The `/onboarding` page generates the right command using
`window.location.origin`, so users always get the deployed agent
pointing at the deployed server. Nothing to configure manually.

## 7. Things that will NOT work on Vercel without changes

- **Cron** — the agent.js file is a *user-installed* daemon (launchd on
  macOS, cron on Linux). It runs on the user's machine, not Vercel.
  Vercel itself only serves `/agent.js` + the ingest API. No Vercel
  cron is required.
- **Edge runtime** — `/api/ingest` and `/auth/callback` use
  `runtime = "nodejs"` because they need the Supabase service-role
  client. Don't switch them to edge; the auth.admin operations require
  Node.
- **Preview branches with auth** — preview URLs need to be added to
  Supabase's redirect allow-list manually, otherwise OAuth fails.

## 8. Post-deploy smoke test (60 seconds)

```bash
APP=https://<your-domain>

# Public surfaces
curl -sI $APP/login | head -1                              # 200
curl -sI $APP/agent.js | head -1                           # 200
curl -s   $APP/api/agent/health                            # {"ok":true,...}

# Auth gate
curl -sI -o /dev/null -w "%{http_code} %{redirect_url}\n" $APP/dashboard
# Expect: 307 https://<domain>/login

# Ingest auth
curl -sI -X POST $APP/api/ingest -H 'authorization: Bearer not-a-uuid' \
  -H 'content-type: application/json' --data '{"events":[]}' | head -1
# Expect: HTTP/2 401
```

If any of those fail, the most likely cause is a missing env var. Check
`SUPABASE_SERVICE_ROLE_KEY` is set at the project (not just preview)
scope.
