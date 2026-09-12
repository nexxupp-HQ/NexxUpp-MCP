import { z } from "zod";
import { get, post } from "../http.js";
import { defineTool } from "../tooling.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type Agendum = { content: { type: "text"; text: string }[] };

function ok(value: unknown): Agendum {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function fail(err: unknown): Agendum {
  const text =
    err instanceof Error ? `nws request failed: ${err.message}` : "nws request failed";
  return { content: [{ type: "text", text }] };
}

const cell = z.object({
  property_id: z.string(),
  value: z.unknown().optional(),
});

export function registerNwsTools(server: McpServer): void {
  defineTool(server, 
    "nws_search",
    "Full-text search across NWS stations. Narrow with stationId when known.",
    {
      query: z.string(),
      stationId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ query, stationId, limit }) => {
      try {
        return ok(
          await post("/nws/tools/search", {
            query,
            ...(stationId ? { station_id: stationId } : {}),
            ...(limit !== undefined ? { limit } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_summarize_station",
    "Summarize everything in an NWS station: pages, tasks, databases.",
    { stationId: z.string() },
    async ({ stationId }) => {
      try {
        return ok(await post("/nws/tools/summarize-station", { station_id: stationId }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_create_task",
    "Create a task in an NWS station.",
    {
      stationId: z.string(),
      title: z.string(),
      status: z.enum(["todo", "doing", "done"]).optional(),
      pageId: z.string().optional(),
      dueAt: z
        .string()
        .optional()
        .describe("Due date as YYYY-MM-DD HH:MM:SS"),
    },
    async ({ stationId, title, status, pageId, dueAt }) => {
      try {
        return ok(
          await post("/nws/tools/create-task", {
            station_id: stationId,
            title,
            ...(status ? { status } : {}),
            ...(pageId ? { page_id: pageId } : {}),
            ...(dueAt ? { due_at: dueAt } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_open_page_for_event",
    "Open (or create) the NWS page linked to a calendar event.",
    {
      eventId: z.string(),
      stationId: z.string(),
      title: z.string().optional(),
      templateSlug: z.string().optional(),
    },
    async ({ eventId, stationId, title, templateSlug }) => {
      try {
        return ok(
          await post("/nws/tools/open-page-for-event", {
            event_id: eventId,
            station_id: stationId,
            ...(title ? { title } : {}),
            ...(templateSlug ? { template_slug: templateSlug } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_search_blocks",
    "Search page blocks inside NWS stations.",
    {
      query: z.string(),
      stationId: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    async ({ query, stationId, limit }) => {
      try {
        return ok(
          await post("/nws/tools/search-blocks", {
            query,
            ...(stationId ? { station_id: stationId } : {}),
            ...(limit !== undefined ? { limit } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_read_database",
    "Read an NWS database schema plus rows, optionally through a view.",
    {
      databaseId: z.string(),
      viewId: z.string().optional(),
    },
    async ({ databaseId, viewId }) => {
      try {
        return ok(
          await post("/nws/tools/read-database", {
            database_id: databaseId,
            ...(viewId ? { view_id: viewId } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_upsert_rows",
    "Create or update NWS database rows. Omit row_id to insert; set it to update. Read the database first for property ids.",
    {
      databaseId: z.string(),
      rows: z.array(
        z.object({
          row_id: z.string().optional().describe("Set to update, omit to insert"),
          cells: z.array(cell),
          sort_order: z.number().int().optional(),
          linked_task_id: z.string().optional(),
        })
      ),
    },
    async ({ databaseId, rows }) => {
      try {
        return ok(await post("/nws/tools/upsert-rows", { database_id: databaseId, rows }));
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_create_chart",
    "Create a chart block on an NWS page from a data source payload.",
    {
      pageId: z.string(),
      chartType: z.string(),
      source: z.unknown().describe("Chart data source payload"),
      axis: z.unknown().optional(),
      parentId: z.string().optional(),
      sortOrder: z.number().int().optional(),
    },
    async ({ pageId, chartType, source, axis, parentId, sortOrder }) => {
      try {
        return ok(
          await post("/nws/tools/create-chart", {
            page_id: pageId,
            chart_type: chartType,
            source,
            ...(axis !== undefined ? { axis } : {}),
            ...(parentId ? { parent_id: parentId } : {}),
            ...(sortOrder !== undefined ? { sort_order: sortOrder } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_apply_template_blocks",
    "Append template blocks to an NWS page.",
    {
      pageId: z.string(),
      blocks: z.array(
        z.object({
          block_type: z.string(),
          content: z.unknown().optional(),
          props: z.unknown().optional(),
          parent_id: z.string().optional(),
          sort_order: z.number().int(),
        })
      ),
    },
    async ({ pageId, blocks }) => {
      try {
        return ok(
          await post("/nws/tools/apply-template-blocks", { page_id: pageId, blocks })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_summarize_database",
    "Summarize an NWS database's contents, optionally through a view.",
    {
      databaseId: z.string(),
      viewId: z.string().optional(),
    },
    async ({ databaseId, viewId }) => {
      try {
        return ok(
          await post("/nws/tools/summarize-database", {
            database_id: databaseId,
            ...(viewId ? { view_id: viewId } : {}),
          })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_station_assist",
    "Ask the NWS station AI to act: create/update pages, tasks, reminders, invites. Describe the goal in plain language.",
    {
      stationId: z.string(),
      message: z.string().describe("What to do, in plain language"),
    },
    async ({ stationId, message }) => {
      try {
        return ok(
          await post(`/nws/stations/${stationId}/ai/assist`, { message })
        );
      } catch (err) {
        return fail(err);
      }
    }
  );

  defineTool(server, 
    "nws_list_stations",
    "List the NWS stations the user can access.",
    {},
    async () => {
      try {
        return ok(await get("/nws/stations"));
      } catch (err) {
        return fail(err);
      }
    }
  );
}
