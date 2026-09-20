# Mail and assistant release — 2026-09-20

## Implemented

- Existing scheduled report now includes UTF-8 CSV, formula-neutralized cells, notes about current rates and incomplete totals.
- Stable record pagination, bounded provider timeout, immutable retry payload and existing claim/idempotency mechanism retained.
- Scheduler response `accepted` means provider acceptance, **not confirmed delivery**. Existing internal database status `sent` retains its legacy meaning: transport/provider acceptance. Do not interpret it as inbox delivery.
- Machine-authenticated `{"test":true}` sends at most one successful test per previous-month key, to the private configured recipient only. It does not send stock push alerts or consume the regular monthly key. Invoke only after key rotation and sender verification. Never expose the Vault token.
- Mobile menu: Viac → Fraid pomocník. The text box is visibly disabled, with direct links to existing tools.
- `fraid-assistant` authenticates the user through Auth and checks active membership in the RLS-scoped database; no service-role access. Unknown and inactive identities are denied. Role is not accepted from the request.
- Assistant is intentionally fail-closed: zero AI requests allowed, no provider calls, no operational data retrieval, no chat persistence. Input bounds 2,000 characters / 8 KiB. Adding a secret cannot activate it.

## Still blocked / not implemented

- Resend dry run reports `mailConfigured:false`. Rotate the disclosed key; store the replacement in `RESEND_API_KEY` and a verified sender in `FRAID_MAIL_FROM` using Supabase Secrets. Do not use the disclosed key.
- Sender/domain verification and one real test email remain unverified. No delivery webhook is installed; confirm a test in Resend and recipient inbox before claiming successful delivery.
- AI is a disabled UI and authenticated integration entrypoint, **not a working model chat**. Provider and budget approval are required before implementing the provider adapter, shared atomic rate/budget counters, role-scoped retrieval, source attribution and deterministic report tools. Test prompt injection, ownership boundaries and provider failures before enabling it. Never give the model write tools. No paid service was activated.
- Existing scheduler still runs hourly, permits reports on the 15th from 08:00 Europe/Bratislava, and retries within that day. It has no cross-day catch-up. No duplicate cron job was created.

## Tests / rollback

Node tests cover payroll month rollover, incomplete/overlapping attendance, CSV UTF-8/formulas, identical retry payload/key, provider errors and network failure, assistant identity rejection, role spoofing, disabled state and request bounds. UI tests include the disabled assistant view. Provider calls in tests use synthetic in-memory transports only.

No schema migration or operational-record mutation is required for this release. Previous frontend and scheduler sources are recoverable from GitHub commit `38bc59aa04739588dbebe01413325ae5f2fa6604`. Roll back by redeploying those files; keep all current database policies and real records intact. Assistant may remain deployed because it is inert, or be disabled separately. Do not rerun historical SQL installation scripts.
