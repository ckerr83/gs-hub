# Team email sign-in

GS Hub now has `/sign-in`, email-link callbacks, invitation confirmation and a
shared Sign in / Sign out control. All screens and errors use the shared English
and Thai dictionaries. Supabase SSR cookie handling and existing browser/server
clients are reused; there is no secret or service-role key in the application.

The app requests email links with `shouldCreateUser: false`; it cannot create
accounts or enroll users. Every completed link is checked with `auth.getUser()`
and the existing `wine_can_read` membership helper before opening the database.
Wine API routes and private Storage remain independently protected by their
existing server checks and RLS. A Supabase identity without team membership has
no wine access. Signing out clears browser data through a full page navigation,
including other tabs receiving the Supabase sign-out event.

## Remaining Supabase setup

These changes do not configure your hosted Auth service or invite anyone by
using privileged credentials. A read-only settings check on 13 November 2026
confirmed that **email authentication is enabled but public sign-ups are still
enabled**. The application does not offer sign-up, but the provider setting must
also be disabled to make Auth account creation invite-only. Existing wine RLS
continues to deny unapproved users regardless of that setting.

In the same Supabase project as `.env.local`:

1. Open **Authentication → Sign In / Providers** (or **Configuration** in the
   current dashboard). Disable **Allow new users to sign up**; leave email
   authentication enabled. Do not enable anonymous sign-ins. Configure custom
   SMTP if your recipient is not permitted by Supabase's default email service.
   The default service restricts sending to project-team addresses; a business
   email being invited to GS Hub is not automatically a Supabase project member.
2. Open **Authentication → URL Configuration**. Set **Site URL** to the exact
   origin where you use GS Hub, for example `http://localhost:3000` during local
   development. Add that origin's `/auth/callback` and `/auth/confirm` URLs to
   **Redirect URLs**. For deployment use your actual HTTPS origin; avoid broad
   wildcard redirect URLs. Email templates below use Site URL, so it must point
   to the application you intend to sign in to.
3. In **Authentication → Email Templates**, replace **Invite user** with the
   contents of `email-templates/invitation.html` and **Magic Link** with
   `email-templates/magic-link.html`. Both use Supabase's token hash and the
   app's confirmation page. GET only shows a confirmation button, so email link
   previews do not consume invitations. The button POSTs the hash to
   `/auth/verify`, verifies its type, validates the email proof, writes SSR
   cookies and checks membership. Only `email` and `invite` types are accepted;
   this is not a password reset or public sign-up route.
4. Open **Authentication → Users → Add user → Send invitation** and invite the
   owner-approved first account: **chris@gsimport.co.th**. If this account
   already exists in this project, do not create a duplicate; proceed to step 5.
   An invitation alone does not grant wine access.
5. Run the complete `database/approve-chris.sql` file in **SQL Editor** as
   `postgres`. This small transaction looks up the exact approved address in
   `auth.users`, grants that user read/write team access, and displays the result.
   It raises an error if the Auth account does not exist, rather than creating
   an account or enrolling a different user. Running it again is safe. It does
   not touch wines, cost references, evidence or photos.
6. Open the invitation email and select **Continue**, then **Continue sign-in**
   on GS Hub. For later sessions, visit `/sign-in`, enter the invited address
   and request a sign-in link. If an invitation was opened before enrollment,
   finish step 5 and request a new sign-in link. Do not enable public sign-up as
   a workaround for missing invitations or email-delivery errors.

The standard PKCE callback `/auth/callback?code=...` is also supported for default
Supabase Magic Link templates. Open those links in the browser that requested
them; the verifier is kept in the existing SSR cookie storage. Custom templates
above use token-hash confirmation. Redirect destinations are fixed to the wine
page or an allowlisted error on `/sign-in`; URL parameters cannot supply an
external destination. Invalid/expired links never result in successful sign-in.
Confirmation POSTs require same-origin browser requests. Auth responses are
private/no-store and confirmation pages suppress referrers and indexing.

The enrollment SQL is **prepared, not applied by this update**. No invitation
was sent, provider settings changed or email delivery verified by this update.
The existing schema/import was reported completed by the owner in this chat;
row counts and live saves still require an authenticated session to verify.

## Verification

```sh
npm run lint
npm test
npm run build
```

Auth tests cover disabled account creation on link requests, email validation,
network errors/rate limits, identity and membership checks, unapproved users,
expired links, token-type validation, fixed redirect destinations, cross-origin
confirmation rejection, and exact first-account enrollment in local PostgreSQL.
Local production/browser checks cover translated sign-in and confirmation pages,
mobile layout, validation and rejected unauthenticated wine requests. Mocked
callbacks/local SQL do not prove live email delivery or successful real login.

After completing setup, verify a real email link, reload the wine page, and sign
in independently in another browser. Confirm edits persist across browsers,
stale saves conflict, unapproved users are denied, and sign-out removes visible
wine data. These live acceptance checks remain pending until setup is done.

Primary references: [Passwordless email sign-in](https://supabase.com/docs/guides/auth/auth-email-passwordless),
[SSR clients](https://supabase.com/docs/guides/auth/server-side/creating-a-client),
[email templates](https://supabase.com/docs/guides/auth/auth-email-templates),
[SMTP restrictions](https://supabase.com/docs/guides/auth/auth-smtp).

## Troubleshooting email requests

The sign-in form now distinguishes invitation/account failures, disabled email
sign-in, SMTP recipient restrictions, rate limits, blocked accounts and service
errors in English and Thai. Failed requests display only a bounded provider error
code (or HTTP status), never raw responses, credentials, cookies or tokens.

On 14 November 2026, one request for the owner-approved email reproduced
`otp_disabled`. This failed before session creation or the wine membership check.
With `shouldCreateUser: false`, Supabase can return this when the Auth account
has not been invited/created; its general error documentation also describes
this code as OTP sign-in being disabled. Confirm the exact email exists in
**Authentication → Users**, and confirm email sign-in is enabled. Invite the
address if it is missing, then apply `database/approve-chris.sql`. Do not enable
public registration to bypass this check. Email delivery remains unverified until
a link request succeeds for an invited account.

For `email_address_not_authorized`, configure a custom SMTP provider for business
recipients that Supabase's default mail service does not permit. For service
errors, inspect the project's Auth logs. The app continues to reject failed
requests; it does not fall back to browser-local wine data or report an email as
sent when Supabase rejected it.

References: [Auth error codes](https://supabase.com/docs/guides/auth/debugging/error-codes)
and [Supabase OTP account-creation checks](https://github.com/supabase/auth/blob/master/internal/api/otp.go).
