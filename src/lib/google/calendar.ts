import { google } from "googleapis";
import type { calendar_v3 } from "googleapis";
import type { JWT } from "google-auth-library";

export interface ListEventsOptions {
  timeMin: string;
  timeMax: string;
  pageToken?: string;
}

/**
 * Paginate through all events in a calendar between timeMin and timeMax.
 * Yields every event in chronological order, handling continuation tokens
 * automatically. Caller provides an authenticated JWT from getGoogleAuth().
 */
export async function* listEvents(
  calendarId: string,
  opts: ListEventsOptions,
  auth: JWT
): AsyncGenerator<calendar_v3.Schema$Event> {
  const cal = google.calendar({ version: "v3", auth });

  let pageToken: string | undefined = opts.pageToken;

  do {
    const res = await cal.events.list({
      calendarId,
      timeMin: opts.timeMin,
      timeMax: opts.timeMax,
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 250,
      pageToken,
    });

    const items = res.data.items ?? [];
    for (const event of items) {
      yield event;
    }

    pageToken = res.data.nextPageToken ?? undefined;
  } while (pageToken);
}

/**
 * Collect all events into an array (convenience wrapper over listEvents).
 */
export async function fetchAllEvents(
  calendarId: string,
  opts: Omit<ListEventsOptions, "pageToken">,
  auth: JWT
): Promise<calendar_v3.Schema$Event[]> {
  const results: calendar_v3.Schema$Event[] = [];
  for await (const event of listEvents(calendarId, opts, auth)) {
    results.push(event);
  }
  return results;
}
