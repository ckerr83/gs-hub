import type { TranslationKey } from "@/lib/i18n/dictionaries";
import type { AccessError } from "./flow";
export const accessMessages: Record<AccessError, TranslationKey> = {
  email: "Enter a valid email address.",
  send: "We could not request a sign-in link. Check your invitation or contact your administrator.",
  invitation:
    "This address cannot sign in yet. Ask an administrator to check its invitation and email sign-in settings.",
  "email-delivery":
    "Supabase cannot send email to this address with its current email service. An administrator must configure SMTP.",
  "email-disabled":
    "Email sign-in is disabled in Supabase. Ask an administrator to enable it.",
  "account-blocked": "This account is blocked. Contact your administrator.",
  "email-service":
    "The sign-in service could not send the email. Ask an administrator to check Supabase Auth logs.",
  "rate-limit": "Too many requests. Wait a minute before trying again.",
  expired:
    "This sign-in link is invalid or expired. Request a new link and open it in the same browser.",
  unapproved:
    "This account does not have team access. Contact your administrator or sign out to use another account.",
  unavailable:
    "Sign-in is unavailable. Please try again or contact your administrator.",
  "sign-out": "Sign-out could not be confirmed. Please try again.",
};
