# Team sign-in verification

Passed:

- `npm run lint` with no ESLint warnings.
- `npm test`: 22 passing tests across team access and wine database.
- `npx tsc --noEmit`; existing TypeScript configuration unchanged.
- `npm run build`: successful production build, including all four auth routes.
- Auth tests ensure email requests set `shouldCreateUser: false`, failures/rate
  limits are not reported as success, callbacks verify identity and membership,
  unapproved accounts are denied, invalid/expired proofs fail, only email/invite
  token types are accepted, and callers cannot supply redirect destinations.
- Local PostgreSQL enrollment tests verify that the small first-user SQL refuses
  to run without the approved Auth account, creates no Auth users, enrolls only
  chris@gsimport.co.th, and is safe to rerun.
- Production HTTP checks: English and Thai sign-in SSR, correct HTML language,
  referrer suppression, missing callback proof redirects safely with 303 and
  private/no-store, cross-origin/missing-origin confirmation POSTs return 403,
  unsupported proof types redirect to an error, and invitation GET renders only
  a confirmation form. Unauthenticated wine requests still return 401.
- Desktop 1280 × 800 and mobile 390 × 844 inspected in the browser. Thai validation
  and labels render correctly, with no document overflow. Thai language survives
  reload. The wine page now presents a Sign in action instead of Retry when a
  session is missing. Invitation confirmation layout was also inspected.

Previews: `english-desktop.png`, `thai-mobile-validation.png`.

Live setup remains pending. Read-only Supabase Auth settings reported email
sign-in enabled and public sign-up still enabled. No provider settings were
changed, invitations sent, or team enrollments applied by this update. Email
receipt, valid real-session cookies, sign-out with a real account, authorized
wine row counts and cross-browser persistence have not been verified against
Supabase. See the module README for the exact setup and live acceptance steps.

## Email-request diagnosis — 14 November 2026

The original generic request error was reproduced once for the approved owner
email. Supabase returned `otp_disabled`; the page now shows an invitation/setup
message and that provider code. The request failed before a session or wine
membership check. A missing Auth invitation is a likely explanation in this
`shouldCreateUser: false` flow; account existence cannot be verified with the
public project key. Provider configuration must also be checked by an admin.

Lint, 24 tests and the production build passed after the diagnostic change.
Tests cover provider-code classification, safe code/status reporting, and
rejection of unsafe diagnostic values. The production server was restarted on
port 3002 and left running. Real email delivery and successful login are still
unverified. No public signup or automatic membership was added.
