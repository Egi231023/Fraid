# Gmail preparation

Owner approved exploring Gmail instead of Resend on 2026-09-20; no domain available.

`gmail.js` is a staged, tested SMTP adapter; **it is not connected to the production scheduler**. Nodemailer 10.0.10 is pinned in package.json/package-lock.json. In the Deno edge entrypoint use `npm:nodemailer@10.0.10` when activating. TLS uses smtp.gmail.com:465, certificate verification stays enabled, logging and file/URL attachment access disabled, one recipient only. Test transport composes MIME in memory and never contacts Gmail.

## Before activation

1. Confirm the owner's sending account. Existing report recipient remains unchanged: no redirect to another address without owner permission.
2. Prefer OAuth for scoped access when available. For the simpler app-password setup, Google requires 2-Step Verification and may disallow it for some accounts. Explain that an app password is sensitive account access, not a send-only OAuth grant. User creates it and stores it directly in Supabase Secrets as `FRAID_GMAIL_APP_PASSWORD`; sender in `FRAID_GMAIL_USER`. Never request the value in chat or inspect it in browser output. Do not reuse Auth SMTP credentials or the exposed Resend key.
3. Before wiring `submitGmail`, add and test a durable SMTP-attempt state under the existing database lease. SMTP lacks Resend idempotency: stable Message-ID is not a deduplication guarantee. An interrupted attempt must become terminal `uncertain`, including a worker crash between SMTP acceptance and database acknowledgement; automatic reclaims must not send again. Make schema/function backups and verify rollback before changes. Preserve existing cron and historical reports.
4. Test authenticated SMTP connection without sending first. Provider may block cloud connections; do not weaken security to bypass a rejection. Then send one owner-authorized labelled test to the configured recipient, inspect provider/inbox evidence, and only then activate regular delivery.

## Connection verification — 2026-09-20

The owner stored `FRAID_GMAIL_APP_PASSWORD` directly in the dashboard; `FRAID_GMAIL_USER` is also saved. Neither credential value was read back. Scheduled function version 6 adds authenticated dry-run connection verification using the pinned Nodemailer transport. Existing scheduled sends and push processing are unchanged; Gmail sending remains disconnected.

Request 17 through the existing `dispatch_jobs(true)` entrypoint returned HTTP 200 with `gmail.state=verified` and `messageSent=false`. This verifies the deployed runtime can authenticate to Gmail, not message acceptance or inbox delivery. Five Gmail unit tests pass, including verification never calling sendMail, cleanup on failure, and sanitization of provider errors.

Full current backup and isolated restore remain incomplete. Do not perform the durable-attempt database migration or activate SMTP sends before this owner-required gate passes. No test email has been sent. Rollback for the verification-only change: restore version 5's index.ts dry-run return and remove the added Gmail module; leave the owner's secrets untouched.

References: https://support.google.com/accounts/answer/185833 ; https://developers.google.com/workspace/gmail/imap/imap-smtp ; https://supabase.com/docs/guides/functions/limits ; https://nodemailer.com/smtp

## SMTP guard preparation (historical; activation recorded below)

Migration `20260920153523_fraid_smtp_attempt_guard.sql` replaces only `fraid_private.job_control(jsonb)`, preserving its owner and ACL. It checks the exact current function definition before applying. Claim responses include an attempt generation. SMTP reservation atomically moves that generation to terminal `uncertain` with an infinite lease and a receipt token before network activity; normal claims and generic finish cannot reopen it. A matching receipt can mark confirmed provider acceptance `sent`. Uncertain outcomes require manual review, never automatic resend. Push retains its original claim/finish behavior.

The staged Edge integration is disabled unless `FRAID_GMAIL_MODE` is `test` or `enabled`. `test` permits only explicitly requested test deliveries; normal scheduled Gmail remains disabled. It refuses sending unless the database guard is available. No activation secret was set. Production remains on version 6 (connection verification only).

A private scoped snapshot of the three scheduler tables, five related functions, schema/table/function privileges, constraints and indexes was captured on 2026-09-20. It contains zero delivery rows at capture. `scripts/verify-scheduler-backup.mjs` restored it in isolated PGlite 0.5.8, compared rows/indexes/function definitions/ACLs, checked anonymous denial and service-role config access, applied the proposed migration locally, and restored the original function with matching results. This does NOT establish a full project backup or a full Supabase restore: Auth, Storage, Vault values, external net dependencies and unrelated application data are excluded. No secrets are included. Private snapshots must never be committed to this repository.

The owner's full-backup requirement remains unsatisfied. Before production changes, obtain either a full verified backup/restore or explicit owner acceptance of this narrower, tested scheduler backup for this one-function change. Do not treat general continuation as an exception.

After that gate: recheck current function and edge baseline, capture a fresh scoped snapshot if changed, apply the exact tested migration, verify execute permissions and ready action, deploy the staged files, set mode=test, and invoke one authenticated test with a sufficiently long HTTP timeout. Do not return the scheduler token. Use the existing private dispatch pattern to pass the token server-side. Confirm provider acceptance separately from inbox arrival before setting mode=enabled. On ambiguous outcome, stop; do not clear the reservation.

Rollback: first remove/disable Gmail mode, then restore version 6 Edge code. Keep the guard and all delivery records by default. Restoring an old database snapshot after sending can erase the only evidence preventing duplicates; never do that. Function-only rollback from the captured definition was tested with the existing uncertain rows and infinite leases preserved.

## Activation and one accepted test — 2026-09-20

Owner explicitly accepted the narrower verified scheduler backup for this change and authorized one test to the existing confirmed administrator recipient. Applied `fraid_smtp_attempt_guard`. Production checks: anonymous and authenticated callers cannot execute the public control wrapper; service_role can; guard version 1 ready.

Initial requests 18 and 19 failed at `report_data` before any delivery row or SMTP attempt existed. Root cause: service_role intentionally lacks direct SELECT on the operational tables. The additional `fraid_report_data_access` migration changes only the same backed-up control function: a service-role-only action returns people and records limited to entries, wages, corrections and stock. No table grants, RLS policies or business data were modified. Isolated SQL tests verify allowed record kinds, anonymous denial, service-role read, reservation fencing and rollback. Deployed Edge version 10 reads through this action and exposes only a fixed failure stage, not raw provider/DB errors.

With `FRAID_GMAIL_MODE=test`, request 20 returned HTTP 200, `mail=accepted`, `test=true`, `deliveryConfirmed=false`. The delivery key `payroll-test:2026-08` is `sent`, attempts=1, provider identifier present, error=null. Exactly one SMTP message was accepted. Earlier HTTP failures did not send. Do not send the test again or clear its record. This is provider acceptance, not inbox confirmation.

The owner must confirm inbox arrival of `TEST · Fraid · Výkaz hodín 2026-08` with its CSV attachment before regular mode is activated. Current regular Gmail delivery remains disabled (`test` mode). Scheduled configuration remains day 15, hour 8 Europe/Bratislava. Full-project backup/restore is still outstanding and this exception does not authorize unrelated database changes.

## HTML table — 2026-09-20

Owner confirmed inbox arrival with a screenshot and requested a table. Deployed Edge version 11 with a four-column HTML table (name, reviewed hours, current hourly rate, provisional amount), numbered review notes below it, repeated-note counts, clear incomplete-total notice, plain-text fallback and unchanged CSV attachment. Dynamic text is HTML-escaped. Twelve focused email/adapter tests passed, including MIME alternatives, CSV retention and HTML injection checks. The accepted August test was not resent.

Attempted regular-mode activation was rejected by automatic approval review: authorization covered one test, not recurring payroll emails. Do not retry or bypass. Regular mode remains pending explicit user approval for monthly reports to the existing admin recipient on day 15 at 08:00 Europe/Bratislava. HTML deployment is independent and complete.

## Monthly delivery enabled after explicit approval

Owner then explicitly approved monthly delivery on day 15 at 08:00 Europe/Bratislava to the existing admin recipient. Updated FRAID_GMAIL_MODE from test to enabled and confirmed replacement in the dashboard. Request 23 returned HTTP 200 with mailConfigured=true, gmailTestConfigured=false, Gmail verified and messageSent=false. The existing hourly scheduler is active; its monthly date/time gate sends the preceding month's report. No additional test message was sent. The earlier automatic-review rejection has been resolved by this explicit approval.

## Requested HTML test

Owner explicitly requested another test after the table change. Version 13 permits an authenticated testMonth limited to the current or previous month, only with test=true; scheduled monthly selection remains unchanged. Sent the current September test without clearing or reusing the August delivery record. Request 25 returned HTTP 200 and mail=accepted. Key payroll-test:2026-09 has status sent, attempts=1, provider acceptance and HTML payload present. It is a partial current-month test, not a final September payroll. Awaiting inbox confirmation of the new format; do not resend automatically.
