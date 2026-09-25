import { z } from "zod";
import { del, get, post, put } from "../http.js";
import { defineTool, ok, type Agendum } from "../tooling.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

function fail(err: unknown): Agendum {
  const text =
    err instanceof Error
      ? `calendar request failed: ${err.message}`
      : "calendar request failed";
  return { content: [{ type: "text", text }] };
}

const DATETIME = "Datetime as YYYY-MM-DD HH:MM:SS";

const recurrence = z
  .object({
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    interval: z.number().int().optional(),
    until_date: z.string().optional().describe(DATETIME),
    occurrences: z.number().int().optional(),
  })
  .optional();

export function registerCalendarTools(server: McpServer): void {
  defineTool(server, 
    "calendar_list_calendars",
    "List the calendars the user can access.",
    {},
    async () => {
      try {
        return ok(await get("/calendar/calendars"));
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "calendar_list_events",
    "List events on a calendar in a time range. Optional text search.",
    {
      calendarId: z.string(),
      start: z.string().describe(`Range start. ${DATETIME}`),
      end: z.string().describe(`Range end. ${DATETIME}`),
      search: z.string().optional(),
    },
    async ({ calendarId, start, end, search }) => {
      try {
        const params = new URLSearchParams({ start, end });
        if (search) params.set("search", search);
        return ok(await get(`/calendar/calendars/${calendarId}/events?${params}`));
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "calendar_create_event",
    "Create an event on a calendar.",
    {
      calendarId: z.string(),
      title: z.string(),
      startAt: z.string().describe(DATETIME),
      endAt: z.string().describe(DATETIME),
      description: z.string().optional(),
      location: z.string().optional(),
      isAllDay: z.boolean().optional(),
      timezone: z.string().optional().describe("IANA name, e.g. Asia/Kolkata"),
      recurrence,
    },
    async ({ calendarId, title, startAt, endAt, description, location, isAllDay, timezone, recurrence: rec }) => {
      try {
        return ok(
          await post(`/calendar/calendars/${calendarId}/events`, {
            title,
            start_at: startAt,
            end_at: endAt,
            ...(description ? { description } : {}),
            ...(location ? { location } : {}),
            ...(isAllDay !== undefined ? { is_all_day: isAllDay } : {}),
            ...(timezone ? { timezone } : {}),
            ...(rec ? { recurrence: rec } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "calendar_update_event",
    "Update an event. Only set the fields to change.",
    {
      eventId: z.string(),
      title: z.string().optional(),
      description: z.string().optional(),
      location: z.string().optional(),
      startAt: z.string().optional().describe(DATETIME),
      endAt: z.string().optional().describe(DATETIME),
      isAllDay: z.boolean().optional(),
      timezone: z.string().optional(),
    },
    async ({ eventId, title, description, location, startAt, endAt, isAllDay, timezone }) => {
      try {
        return ok(
          await put(`/calendar/events/${eventId}`, {
            ...(title !== undefined ? { title } : {}),
            ...(description !== undefined ? { description } : {}),
            ...(location !== undefined ? { location } : {}),
            ...(startAt !== undefined ? { start_at: startAt } : {}),
            ...(endAt !== undefined ? { end_at: endAt } : {}),
            ...(isAllDay !== undefined ? { is_all_day: isAllDay } : {}),
            ...(timezone !== undefined ? { timezone } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "calendar_delete_event",
    "Delete an event by id.",
    { eventId: z.string() },
    async ({ eventId }) => {
      try {
        return ok(await del(`/calendar/events/${eventId}`));
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "calendar_ai_assist",
    "Ask the calendar AI in plain language: schedule, reschedule, find free time, summarize. It reads the calendar and returns executable actions.",
    {
      calendarId: z.string(),
      message: z.string().describe("What to do, in plain language"),
      timezone: z.string().optional().describe("IANA name, e.g. Asia/Kolkata"),
    },
    async ({ calendarId, message, timezone }) => {
      try {
        return ok(
          await post(`/calendar/calendars/${calendarId}/ai/assist`, {
            message,
            ...(timezone ? { timezone } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );
}
