# Fraid v2 — implementation checkpoint, 2026-09-20

## Deployment status (read first)

- **Production cutover NOT performed.** GitHub integration write access was restored on 2026-09-20. This release publishes the additive `v2/` preview for browser and account setup checks; it does not redirect the existing app or activate operational writes.
- Original root `index.html` and `sw.js` remain unchanged at GitHub commit `de31dc45c628986cb9dfc3cbe2d03f16c2b9f7b5`.
- Supabase project `arbvuovtqntagfpfqfgp`: additive v2 schema, import, RPCs, scheduled stale-entry check, and authenticated push endpoint are installed. The `fraid_private.release.live` switch remains **false**; operational writes are blocked.
- Both Fraid and Biogreens use `public.fraid_data`. The old open policies are still present to avoid an uncoordinated outage. **Existing production security vulnerabilities are not yet resolved.**
- Owner-confirmed, email-verified Auth account is now linked to the existing Eugen profile as administrator, with an audit record. Remaining staff may register and be mapped after cutover, as explicitly approved by the owner. Do not use old public PINs to bootstrap access.

## Implemented

Self-hosted, pinned Supabase JS 2.116.0; email/password auth UI with account approval; independent JSON record rows with typed collections; server-side role and ownership checks; separate wages; serialized atomic writes and optimistic versions; idempotency and retry recovery; audit trail; server clock with Europe/Bratislava timezone; requested/supervised attendance corrections; availability-based draft planning; adjustable capacity/hours; daily sales with explicit date, separate tips and cash count; recipes with unit-aware costs and original images; stock movements and inventory; minimum-stock purchase export; approved vs proposed checklist tasks; notes, team management and navigation; CSV formula neutralization; HTML escaping and CSP.

Existing avatars and logo were extracted from the original source. Import preserves all original record fields. PINs are excluded from the v2 directory and hourly rates are isolated in owner/admin-readable wage records.

`v2/?demo=1` uses synthetic fixtures only and refuses writes. It is the read-only preview route after GitHub Pages publishes this release. Staff email/password registration needs real configuration and delivery verification; never mark it tested merely from SQL checks.

## Validation performed

- `npm test`: 8 passing tests, covering Slovak dates, strict numeric parsing, unit conversions, planning availability/collisions, hours, safe CSV and simulated DOM navigation/edit dialogs. **DOM simulation is not a real mobile-browser visual test.**
- `npm run check`: JavaScript syntax checks pass.
- `tests/database.sql`: exercised actual installed PostgreSQL functions in a transaction and rolled back all fixture users/data. Covered anon and unapproved denials, wage/attendance/audit isolation, role-escalation denial, repeated request deduplication, stale-version rejection, stock arithmetic/negative-stock rejection, parallel staff shifts, duplicate person shift rejection, past sale date, duplicate daily sale rejection, and atomic failed batch rollback.
- `db/verify-migration.sql`: restored backups into temporary tables and compared exact rows; compared imported legacy array records with originals. Counts: 4 people, 26 entries, 9 shifts, 7 recipes, 1 sale, 50 notes, 1 idea, 4 wage records and settings.
- Supabase security advisor returned no lints; this does not validate the intentionally unchanged legacy policies.
- Confirmed zero test fixture people/records remained, zero Auth users, original source data unchanged and release gate off.
- Unauthenticated POST to the new push endpoint returned HTTP 401. No message-send action was invoked.
- Real-device visual testing, authenticated end-to-end test, concurrent separate-session load test, real email confirmation, and actual push delivery are outstanding. No notifications were sent to staff.

## Backups and recovery

Protected database schema `fraid_backup` contains `pre_v2_data_20260920`, `pre_v2_push_20260920` and `pre_v2_policies_20260920`; public/anon/authenticated access is revoked. The original source remains in Git history. `db/verify-migration.sql` verifies a restore into temporary tables without overwriting production.

`db/rollback.sql` stops v2 writes while preserving new data and security. Never automatically revert to open legacy policies. A post-cutover restore must reconcile newer rows, not blindly overwrite them.

## Resume sequence

1. GitHub write access has been restored. Publish and verify the additive preview release; do not activate production until the following gates pass.
2. Publish the additive `v2/` preview while leaving the root app intact. Verify desktop and mobile UI, network failures, user login and registration. Configure Supabase Site URL/allowed redirects and working email delivery for that preview; shared project changes must not disrupt Biogreens.
3. User identifies the administrator's email; they create/verify their account securely. Link the verified Auth user ID to the confirmed existing employee profile and set role admin via an audited privileged operation. Never grant admin to the first registrant automatically. Owner explicitly approved staff registering after cutover. Preserve active unlinked profiles and link verified accounts later in Team; never grant access merely by matching a name.
4. Recheck source data and import freshness. Review `db/cutover.sql`: it locks legacy data, snapshots again, imports recent changes, restricts only the Fraid legacy row, restricts old push rows and enables v2. Do not execute before real login/UI gates pass. The script is a **reviewable draft**, not an already exercised production cutover.
5. Before cutover, review the existing `send-push` Edge Function: it uses service-role access to all old subscriptions. It must be filtered to Biogreens employee IDs when Fraid switches to v2. This old endpoint has NOT been changed. Simply tightening table RLS will not constrain service-role reads.
6. In the same release, replace root with a redirect to `./v2/`, stop distributing old login code, run cutover after final guards, and verify old anonymous Fraid read/write denial, new employee/admin access, and unchanged Biogreens behavior. Old committed PINs must be regarded as invalid, not merely hidden.
7. Confirm scheduled stale-entry checks run after activation. The job runs every 15 minutes but is a no-op before release. It marks prior-day open entries; it never guesses paid time.

## Notes

- `db/install.sql`, `batch.sql`, `push.sql`, `stale-check.sql` are applied setup scripts, not generated Supabase CLI migration history. Do not blindly rerun `install.sql` or `push.sql` on the current project (policy/table names already exist).
- Edge `fraid-v2-push` has gateway JWT verification disabled because its handler explicitly calls Supabase Auth `getUser()` and checks approved membership/role before every action. It uses environment-held VAPID secrets, pinned dependency, provider host allowlist and a separate per-user RLS table. It never trusts an anon key as user authentication.
- Push registration is available; sending a stored note is admin-only at the endpoint. No automatic broad staff message is triggered during migration or tests.
- Unknown legacy recipe quantities remain intact and are not guessed. Editing requests structured quantity/unit values. Cost stays unavailable until stock linkage and valid prices exist.
- Shift hours are copied from the old generator as an unconfirmed configuration, not asserted as current business hours. Capacity starts at the former single-person behavior until owner confirmation.

## Entry-point update

The original welcome and home screens link directly to `v2/`. The authenticated v2 view explicitly warns that records are a migrated snapshot and operational writes remain disabled. Remove this preparation notice only as part of the verified production cutover.
