# Fraid completion checkpoint — 2026-09-20

Do not interpret this checkpoint as full production acceptance.

## Verified current baseline

- Remote baseline: `4ad1a5eb59d415c4714594a362db9d6e99d012e3`.
- Correct Supabase project is healthy, Postgres 17.6; Fraid v2 release enabled.
- Six public Fraid tables have RLS enabled. Read-only SQL assertions passed for anonymous legacy Fraid denial, anonymous v2 permission denial, unapproved record/audit denial and prohibition of direct profile updates. Biogreens legacy availability preserved. No operational writes made during these checks.
- Exactly one stale attendance job (15-minute schedule) and one reports/expiry job (hourly).
- Scheduled reports v2 and assistant v1 exist. Stored scheduler health says mail not configured, push configured; this is not delivery evidence.
- Backup tables exist, but their existence is NOT proof of a complete current recoverable backup. A fresh isolated restore test was not performed in this pass. Migration history is empty despite existing schema: do not rerun installation scripts.

## Fixes in this change set

- Shared single/batch/retry write handling preserves the original idempotency payload for ambiguous network/provider failures. Only explicit database rejection clears it. A failed pre-send sessionStorage write stops submission.
- Confirmed batch writes remain successful even if refresh fails; user gets separate refresh warning.
- Sign-out errors are no longer silently treated as successful sign-out.
- Closing checklist uses selected revenue date, counts each approved evening task once, excludes void checks, and does not claim revenue saving completes tasks. Historical checklist-template versioning is NOT implemented.
- Recipe cost rejects invalid/negative/non-finite unit prices and quantities. Time parser rejects invalid hours/minutes.

## Remaining gates, priority and acceptance criteria

| Priority | Area | State / next acceptance gate |
|---|---|---|
| P0 | Auth SMTP and redirect configuration | Blocked on authenticated management settings and securely entered replacement SMTP credential. Must verify actual sender, Site URL, redirect allowlist and template; complete real email → password reset → login on intended account. No shared chat secrets. |
| P0 | Backup and rollback | Pending full current backup and isolated restore, grants/functions/storage coverage; must pass before DB changes. No DB migrations in this pass. |
| P0 | User-role API acceptance | Database read-only assertions passed; real signed employee/admin HTTP sessions and two-device integration not yet tested in this pass. |
| P1 | Persistence | Mocked response-loss/idempotency tests pass; real two-device simultaneous writes and offline UI recovery remain unverified. |
| P1 | Attendance | Overnight shifts/break rules not agreed; current server refuses previous-day checkout. Do not infer hours. Attendance display/export and payroll need one consistent reviewed-time calculation. |
| P1 | Payroll | Missing wage with zero entries can leave partial totals insufficiently flagged. Current rates are disclosed, not historical rates. Needs historical-rate policy and regression tests before claiming complete payouts. |
| P1 | Inventory | Single nearest expiry exists; per-lot inventory not implemented. Requires safe schema/API migration and reconciliation. |
| P1 | Closing | Selected-date display fixed; atomic completion requirements and historical task definitions remain to be implemented without inventing business rules. |
| P1 | Mail | Gmail adapter staged only. Durable uncertain SMTP-attempt handling required before activation. Scheduler lacks missed-day catch-up. Provider delivery/bounce proof and one labelled admin report still required. |
| P1 | Notifications | Physical iPhone/PWA permission and delivery tests pending; do not call configured keys proof of functioning notifications. |
| P2 | AI | Read-only assistant is disabled. Provider approval/configuration, scoped retrieval, shared quota enforcement and actual role-isolation tests required before activation. |
| P2 | Mobile | Existing responsive CSS retained; physical keyboard/safe-area and narrow viewport acceptance remains pending. |

## Security findings

- Leaked-password protection disabled: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection
- pg_net public extension metadata warning remains; do not relocate shared extension blindly.
- RLS without policies on three private scheduler tables is intentional deny-all, not a reason to open access.

## Rollback

This patch is frontend-only, uses the existing RPC contracts and preserves the database and Edge Function versions. Revert only this change set on the then-current main branch after checking concurrent changes; do not reset other user work or restore legacy permissive policies. Regression tests use synthetic in-memory data and do not send mail.
