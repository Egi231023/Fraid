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
