# TaskEd Backend

NestJS + PostgreSQL API for TaskEd. This covers the core flow only (auth,
approval chain, tickets) per the phased build plan - calendar, forum,
AI chatbot, weather, and daily quote endpoints come next.

## 1. Prerequisites

- Node.js 20+
- PostgreSQL 14+ running locally (or a connection string to one)
- A Google Cloud project with an OAuth 2.0 Client ID (Web application)

## 2. Google OAuth setup (required before login will work)

1. Go to console.cloud.google.com > APIs & Services > Credentials.
2. Create an OAuth 2.0 Client ID, type "Web application".
3. Authorized redirect URI: `http://localhost:3000/auth/google/callback`
   (swap the host for wherever the backend is deployed).
4. Copy the Client ID and Client Secret into `.env` (see below).
5. This app double-checks the email domain server-side
   (`ALLOWED_EMAIL_DOMAIN`), so only `@deped.gov.ph` accounts get past
   the Google sign-in - even if someone's Google session isn't a
   Workspace account tied to the domain, they'll get rejected.

## 3. Configure

```bash
cp .env.example .env
# then fill in DB_* and GOOGLE_* values
```

## 4. Install & run

```bash
npm install
createdb tasked   # or however you provision the Postgres database
npm run start:dev
```

**Alternative**: `docker compose up -d --build` from the project root
runs Postgres + the backend together in one step - see the
top-level `DEPLOYMENT.md` for the full production path using this.

In development, `synchronize: true` (see `app.module.ts`) auto-creates
tables from the entities - fine for local work. A real, tested initial
migration already exists at `src/database/migrations/` (generated from
these entities and verified against a real Postgres instance), so
production should use that instead: set `NODE_ENV=production` (which
flips `synchronize` off automatically) and run `npm run migration:run`
before starting the server. The provided `Dockerfile` already does this
automatically on every container start - see `DEPLOYMENT.md`. If you
add or change entities later, generate a new migration
(`npm run migration:generate src/database/migrations/DescriptiveName`)
rather than relying on `synchronize` in production.

## 5. File storage (Cloudinary)

Ticket attachments, update images and profile pictures are stored on
Cloudinary (free plan is enough to start). Uploads are *signed*: the
frontend asks `POST /uploads/sign` (or `/uploads/sign-avatar`), the API
signs the parameters with the secret, and the browser sends the file
straight to Cloudinary - file bytes never pass through this API. Only
JPG and PDF are accepted (enforced by the signed `allowed_formats`).

Setup:

1. Create a free account at https://cloudinary.com.
2. On the Dashboard copy **Cloud name**, **API Key** and **API Secret**
   into `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
   `CLOUDINARY_API_SECRET`.
3. In Cloudinary go to **Settings, Security** and turn on **Allow
   delivery of PDF and ZIP files** (it is off by default on new
   accounts, and PDFs will not open without it).

## 6. Seed schools

Ticket routing depends on Teachers and AOs being tied to real school
records. Edit `src/database/seeds/seed-schools.ts` with your actual
Schools Division of Leyte list, then:

```bash
npm run seed:schools
```

(Longer-term this probably wants a proper admin UI for managing
schools/districts, but a seed script unblocks development now.)

## 7. Bootstrap the first Administrator

The approval chain requires an Administrator to approve AO accounts -
but nobody exists yet to approve the very first Administrator. Have
that person sign in once via Google (so their user row is created),
then run:

```bash
npm run promote:admin -- someone@deped.gov.ph
```

This directly marks them APPROVED + ADMINISTRATOR in the database.
Every other account goes through the normal in-app approval flow.

## 8. How the pieces fit together

- **Auth**: `GET /auth/google` starts the OAuth flow; Google redirects
  to `GET /auth/google/callback`, which issues a JWT and redirects to
  `${FRONTEND_URL}/auth/callback?token=...`. The frontend grabs that
  token, stores it, and attaches it as `Authorization: Bearer <token>`
  on every request from then on.
- **Registration**: after first login the user exists but has no role
  yet. `POST /users/register` completes their profile. They then sit
  in `PENDING` until the right approver (`GET /users/pending-approvals`,
  `POST /users/:id/approve`) signs off.
- **Tickets**: `POST /tickets` (teachers only), `GET /tickets` (results
  vary by role - see `TicketsService.findAllFor`), `GET /tickets/:id`,
  `POST /tickets/:id/updates` (comments/status changes/attachment
  requests), `POST /tickets/:id/attachments` (teacher uploads).
- **Calendar & Announcements**: one `CalendarEvent` entity backs both,
  per the spec ("every announcement with a date should also appear as
  a calendar event, and vice versa"). `GET /calendar` (everyone,
  chronological), `GET /calendar/announcements` (only
  `isAnnouncement: true` and still upcoming), `POST/PATCH/DELETE
  /calendar` (Administrator and Admin Office public-post accounts
  only). A daily cron (`CalendarService.sendUpcomingReminders`, 7am)
  notifies every approved AO about events landing within 2 days -
  AOs are the only role that gets calendar reminders, per the spec.
- **Forum (AO-only end to end)**: `GET/POST /forum/questions`,
  `GET /forum/questions/:id` (question + flat replies, frontend
  builds the thread tree from `parentReply`), `POST
  /forum/questions/:id/replies` (optional `parentReplyId` for
  threading), and toggle-able voting via `POST
  /forum/questions/:id/vote` / `POST /forum/replies/:id/vote`
  (`{ value: 1 | -1 }` - casting the same value again removes the
  vote, the opposite value flips it). Every route in
  `ForumController` is gated to `Role.ADMIN_OFFICER` - nobody else can
  read or write forum content, matching the "AO only, end to end"
  decision.
- **Weather**: `GET /weather?lat=&lon=` proxies Open-Meteo (free, no
  API key) and returns current conditions plus six 2-hour buckets
  covering the next 12 hours, each with a peak precipitation
  probability - matches the spec's "chance of rain in 2-hour
  increments". Swap `WeatherService.baseUrl` if the division
  standardizes on a different provider (e.g. a PAGASA-backed API)
  later.
- **Realtime**: connect a Socket.IO client to the backend, emit
  `join` with the user's id right after connecting, then listen for
  `notification` events.
- **File uploads**: `POST /uploads/sign` (`{ fileName, contentType }` ->
  `{ uploadUrl, fields }`) - the frontend POSTs the file plus `fields`
  to `uploadUrl` (Cloudinary), then passes the returned `secure_url`
  to the existing `POST /tickets/:id/attachments` or
  `POST /tickets/:id/updates` (`imageUrl`) endpoints, same as before.
- **Profile editing**: `PATCH /users/me` also accepts `schoolId`
  (Teachers only - lets them update their home school, matching the
  spec's editable-fields list) alongside `name`/`district`/`designation`.
- **AI Chatbot**: `POST /chatbot/message` (`{ message, history? }` ->
  `{ reply }`) proxies OpenRouter using `deepseek/deepseek-v4-flash:free`
  by default (override with `OPENROUTER_MODEL` - OpenRouter's free
  lineup shifts, so check
  https://openrouter.ai/collections/free-models before assuming this
  slug is still current). Every request is grounded with a static
  system prompt describing how TaskEd works, plus a live summary of
  the requesting user's own visible tickets (reusing
  `TicketsService.findAllFor`, so it respects the same role-based
  visibility as the Tickets screen). Requires `OPENROUTER_API_KEY` in
  `.env` - get one at https://openrouter.ai/keys. General-purpose
  questions unrelated to TaskEd are still answered - it's not locked
  to only ticket/system topics.

## 9. Known gaps to fill in next

- **File storage is public-read by design**: Cloudinary files are
  delivered as public URLs so they work directly in `<img>`/`<a>`
  tags. Uploads still require a signature from this API (so nobody can
  write without going through the app), but anyone with a file's URL can view
  it - fine for ticket attachments in a closed internal tool, but worth
  knowing if this ever needs to be more restrictive (switch to
  presigned GET URLs generated per-view instead).
- **Push notifications**: the Socket.IO gateway covers in-app realtime.
  Mobile push (FCM via Capacitor) is a phase-2 item per the spec.
- **Socket auth**: the gateway trusts whatever `userId` a client sends
  on `join` - fine for local dev, but verify the JWT on socket connect
  before this goes anywhere near production.
- **Calendar reminders are naive**: the cron marks `reminderSent` once
  and never re-notifies - fine for a single T-2-day heads-up, but if
  you want multiple reminder cadences (T-7, T-1, etc.) this needs a
  small rework (e.g. a separate reminders-sent join table instead of
  one boolean).
- **Forum vote counters are denormalized**: `upvotes`/`downvotes` on
  `ForumQuestion`/`ForumReply` are updated inside a transaction on
  every vote, which is correct but means a concurrency bug would show
  up as a wrong count rather than a crash - fine for this scale, but
  worth knowing if the forum ever gets busy.
- **Chatbot has no persisted history**: conversation history is
  entirely client-side (sent back on each request) - there's no
  server-side chat log. Fine for a first pass; add a `ChatMessage`
  entity later if you want history to survive a page refresh or want
  an audit trail of what the assistant told people.
- **Chatbot cost/rate limiting**: nothing currently caps how often a
  user can call `/chatbot/message`. OpenRouter's free tier has its own
  rate limits that will surface as errors if hit, but there's no
  app-level throttling yet.
