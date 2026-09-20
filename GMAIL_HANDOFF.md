# Gmail preparation

Owner approved exploring Gmail instead of Resend on 2026-09-20; no domain available.

`gmail.js` is a staged, tested SMTP adapter; **it is not connected to the production scheduler**. Nodemailer 10.0.10 is pinned in package.json/package-lock.json. In the Deno edge entrypoint use `npm:nodemailer@10.0.10` when activating. TLS uses smtp.gmail.com:465, certificate verification stays enabled, logging and file/URL attachment access disabled, one recipient only. Test transport composes MIME in memory and never contacts Gmail.

## Before activation

1. Confirm the owner's sending account. Existing report recipient remains unchanged: no redirect to another address without owner permission.
2. Prefer OAuth for scoped access when available. For the simpler app-password setup, Google requires 2-Step Verification and may disallow it for some accounts. Explain that an app password is sensitive account access, not a send-only OAuth grant. User creates it and stores it directly in Supabase Secrets as `FRAID_GMAIL_APP_PASSWORD`; sender in `FRAID_GMAIL_USER`. Never request the value in chat or inspect it in browser output. Do not reuse Auth SMTP credentials or the exposed Resend key.
3. Before wiring `submitGmail`, add and test a durable SMTP-attempt state under the existing database lease. SMTP lacks Resend idempotency: stable Message-ID is not a deduplication guarantee. An interrupted attempt must become terminal `uncertain`, including a worker crash between SMTP acceptance and database acknowledgement; automatic reclaims must not send again. Make schema/function backups and verify rollback before changes. Preserve existing cron and historical reports.
4. Test authenticated SMTP connection without sending first. Provider may block cloud connections; do not weaken security to bypass a rejection. Then send one owner-authorized labelled test to the configured recipient, inspect provider/inbox evidence, and only then activate regular delivery.

Current live scheduler is unchanged and mail remains unconfigured. No Gmail message or new secret has been created. Gmail credentials, live transport compatibility and final delivery have not been tested.

References: https://support.google.com/accounts/answer/185833 ; https://developers.google.com/workspace/gmail/imap/imap-smtp ; https://supabase.com/docs/guides/functions/limits ; https://nodemailer.com/smtp
