# Local role verification

1. Copy `dummy-credentials.example.json` to `dummy-credentials.local.json` at the repository root. The local file is ignored by Git; do not commit it.
2. Configure `DATABASE_URL` and `DIRECT_URL` for your **local** PostgreSQL database, apply migrations, and generate Prisma:

   ```sh
   npm run prisma:migrate:deploy --workspace @antara/api
   npm run prisma:generate --workspace @antara/api
   npm run seed:dummy --workspace @antara/api
   ```

3. Start the API with `ENFORCE_DUMMY_ALLOWLIST=true` and a non-production `NODE_ENV`. Start the frontend pointing at that API. Sign in through `/login` using the local file.

The seed command bcrypt-hashes passwords and upserts users by normalized email. It refuses to overwrite an existing non-dummy user, does nothing when the file is absent, and refuses production execution. All file entries are validated before writing users.

The allowlist is off by default and unconditionally disabled in production, even if the flag is set. When enabled locally, removing an email blocks that dummy user's next password login immediately. Missing or malformed files deny all dummy password logins. Ordinary users are unaffected. This does not revoke existing JWTs, refresh sessions, or Google sessions.

Credentials and Google sign-in both require real backend-issued tokens. The old tokenless JSON fallback and demo-cookie form bypass are no longer used. Google access still obeys `GOOGLE_ALLOWED_EMAILS`; existing database roles are preserved, new Google users become MEMBER. For an actual Google sign-in, configure the existing Google OAuth credentials and authorized callback URL; local callback simulations do not replace testing the Google provider itself.

## Browser tests

With the local API running and the three accounts seeded:

```sh
E2E_REAL_BACKEND=true npm run test --workspace @antara/web -- tests/login.spec.ts
```

The Playwright web server uses port 3100; start the test API with `FRONTEND_URL=http://localhost:3100` so browser API requests pass CORS. Override `API_URL` and `NEXT_PUBLIC_API_URL` together if the local backend uses a different port. These browser tests deliberately skip without `E2E_REAL_BACKEND=true`; they never fall back to frontend-only credentials.

## Dashboard scope

OWNER sees club-wide analytics. ADMIN uses the single `User.subsystemId`: tasks in that subsystem, worklogs on those tasks, and availability of its users. An unassigned ADMIN sees an empty scope. MEMBER sees assigned tasks and their own worklogs. The server reads current database roles/assignments, and all analytics cache keys and historical snapshot reads include the scope. The 15-minute refresh generates global, assigned ADMIN subsystem, and MEMBER personal snapshots. Each scope has a daily sample updated during the day; the latest eight samples appear chronologically. Global snapshots are never substituted. Snapshot completion hours measure logged effort per completed task, rather than elapsed calendar time.

Task subsystem names link to the existing subsystem page. Desktop sidebar collapse persists locally under `antara.sidebar.collapsed`. The platform container uses a responsive width capped at 1800px.

## Troubleshooting sign-in

Creating the local JSON file does not create database users. Run the migration and seed against the same development database used by the running API. Accounts seeded in an isolated test database will not exist in a hosted database. Do not seed these public dummy credentials into production.

The password eye button reveals/hides the value without submitting. Incorrect credentials, rate limiting, and an unavailable sign-in service now have distinct messages; backend downtime must not be mistaken for a password mismatch.
