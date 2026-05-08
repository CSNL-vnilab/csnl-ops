import { google } from "googleapis";

// SA-based JWT auth for Google APIs.
// Reads GOOGLE_SERVICE_ACCOUNT_EMAIL + GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.
// Default scopes: calendar.readonly.
export function getGoogleAuth(
  scopes: string[] = ["https://www.googleapis.com/auth/calendar.readonly"]
) {
  return new google.auth.JWT({
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    scopes,
  });
}
