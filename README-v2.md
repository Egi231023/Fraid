# Fraid v2 — live release, 2026-09-20

## Production state

The original https://egi231023.github.io/Fraid/ entry now redirects to authenticated `v2/`. The production code release is `472cf586e01670472821c0f3cf4f3cc9f2ff0db2`. Operational writes are enabled in Supabase project `arbvuovtqntagfpfqfgp`.

The owner-confirmed, verified account is linked to the existing Eugen profile as administrator, with an audit record. The owner explicitly approved staff registering later. Preserve their existing profiles and history; after email verification, the administrator links an account in **Tím → Profil**. An unlinked account has no access to operational records. Never approve merely by matching a name or being the first registrant.

The legacy Fraid JSON row is no longer accessible to anonymous or ordinary authenticated users. Biogreens retains its existing legacy access and its data was verified unchanged. Old committed PINs no longer grant access to Fraid. Existing old browser tabs must be refreshed to load the new app.

## Functionality

Email/password authentication, database-enforced roles and ownership, per-record persistence, optimistic versions, idempotency, audit history, attendance corrections, availability-based draft scheduling, sales dates and separate tips, recipe costing from known quantities/prices, inventory movements, checklist templates and completion, notes, staff profiles and CSV exports are implemented.

Opening hours and capacity require administrator confirmation; draft tasks are not asserted to be established café rules. Missing recipe costs remain unknown. Automated stock deductions from sales are not inferred.

`v2/?demo=1` is a synthetic, read-only demonstration and never writes real operational data.

## Verification actually performed

- Eight Node tests and JavaScript syntax checks passed for the release.
- Transactional database tests cover anonymous/unapproved denial, ownership, role escalation, idempotency, optimistic-version conflicts, stock quantities, shift collisions, sale dates/duplicates and atomic batches. Fixtures were rolled back.
- Deferred-registration SQL test proves that unverified/unlinked accounts are denied and later administrator linking preserves existing attendance history without granting administrator privileges.
- The complete cutover was rehearsed and rolled back before execution. Fresh backup restoration and exact import preservation were checked inside the real cutover transaction.
- Real owner login through the secure browser flow succeeded. All main sections loaded with transferred data. The original URL redirects to v2; the current script loads without the staging notice. At the tested desktop viewport there was no horizontal document overflow.
- `db/verify-live.sql` passed after activation: legacy anonymous Fraid read/write denied, old subscription access scoped to Biogreens, Biogreens records unchanged, release active.
- No synthetic test records or test profiles remained. Original imported data: 4 profiles, 26 attendance entries, 9 shifts, 7 recipes, 1 sale, 50 notes, 1 idea and 4 wage records. New real user activity after activation must be preserved, not mistaken for test fixtures.
- A 15-minute scheduled job flags stale attendance for review; it does not invent departure times.

Not yet verified: physical mobile-device layout, separate-session concurrency/load testing, offline browser recovery, delivery of registration mail to non-owner staff, and actual push delivery. No notification-send test was performed.

The security advisor reports leaked-password protection disabled. Enabling it remains a configuration follow-up; do not purchase a plan or change billing automatically. Reference: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Notifications

`fraid-v2-push` authenticates through Auth getUser and checks approved membership/admin permissions. It uses private VAPID environment secrets, a separate RLS-protected subscription table and an allowed push-provider list. Its gateway JWT check is disabled because authentication is explicitly performed in the handler.

Legacy `send-push` version 6 retains its previous gateway JWT setting but now restricts service-role delivery to Biogreens employee IDs. It cannot send to Fraid's old subscriptions. Its previous source is preserved privately in `fraid_backup.edge_function_versions`.

## Backup and recovery

Protected `fraid_backup` schema contains the pre-v2 snapshots and the fresh `cutover_data`, `cutover_push`, `cutover_policies` snapshots. Public, anonymous and authenticated roles have no access. Exact restoration was rehearsed into temporary tables.

`db/cutover.sql` has been EXECUTED. Do not rerun it. Setup SQL files are applied source, not CLI migration-history entries.

For an incident, `db/rollback.sql` disables writes while preserving new records and the tightened permissions. Keep the v2 interface available and deploy a corrected v2 version. Never restore the old public access policies or blindly overwrite post-cutover data with a snapshot. Reconcile newer records and audit history before any data restoration.

`db/verify-live.sql` verifies the current access boundaries without committing an operational write. `db/verify-migration.sql` is the historical pre-cutover comparison and is not a post-live record-count test.


## Payroll and stock expiry (2026-09-20)

Administrácia → Výplaty shows all profiles for a selected month and exports CSV. It uses stored current hourly rates and labels that basis; it is a reviewable hours/payment estimate, not a payslip. Open/invalid attendance, overlapping entries, pending corrections and missing rates prevent a final amount for that person. No hours or rates are invented.

Stock items optionally store `expiryDate` (nearest batch) and `expiryWarningDays` (default 3, configurable 0–90). The owner must update the nearest date when that batch is consumed; this release does not model separate batch quantities. Empty stock is excluded from expiry alerts. Validation is enforced by a database trigger.

`fraid-reports-and-expiry` runs hourly through pg_cron and pg_net; the Edge handler gates delivery to 08:00 or later in Europe/Bratislava. Payroll is due on the 15th for the previous month. Expiry digests are daily, to subscribed active administrators only. Leases and per-period/per-device delivery keys prevent concurrent duplicate attempts. Resend idempotency keys protect mail retries. Attempts are bounded to five; failures are retained for review. Web Push cannot guarantee exactly-once transport after an interrupted acknowledgement; the daily notification tag replaces the same day's displayed alert.

Recipient and scheduler token are private database configuration. The Edge endpoint rejects calls without the Vault-generated token and checks it through a service-role-only RPC. The frontend cannot invoke scheduled delivery or read credentials. Notification payloads contain stock labels/dates; payroll is sent only to the owner's configured email.

**Mail is NOT active:** the authenticated dry run reported `mailConfigured:false`, `pushConfigured:true`. To enable mail, configure `RESEND_API_KEY` and `FRAID_MAIL_FROM` in Supabase Edge Function secrets using a verified Resend sender. Never commit these values. No paid plan is authorized by default. Verify a real delivery before claiming email delivery works. Login email configuration is separate from operational reports.

The owner currently has no registered v2 push device. On the installed mobile app, use Sklad → Zapnúť notifikácie na tomto zariadení. A web manifest is included for standalone installation. Physical iOS notification delivery still requires verification.

Validation: 13 Node tests passed; rollback-only database checks verified invalid expiry rejection, machine API isolation, scheduler token validation, leases/deduplication and administrator-only delivery status. Scheduler dry run returned HTTP 200 without sending mail/push. Backup tables `fraid_backup.pre_reports_records` and `pre_reports_people` preserve data before installation. `db/reports-and-expiry.sql` is applied; do not rerun it. To pause dispatch safely, deactivate the named cron job; data and in-app reports remain available.

Security advisor: private scheduler tables intentionally deny access without policies; pg_net is non-relocatable and reports extension metadata in public while its API lives in net. Existing leaked-password-protection configuration warning remains.
