/**
 * Notion Extension for pi-mono
 *
 * Provides tools for searching and reading Notion pages.
 * Initializes from NOTION_API_KEY environment variable on session_start.
 */

import { Client } from "@notionhq/client";
import { markdownToBlocks } from "@tryfabric/martian";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

let notion: Client | null = null;

export default function notionExtension(pi: ExtensionAPI) {
  // Initialize Notion client on session start
  pi.on("session_start", async () => {
    const apiKey = process.env.NOTION_API_KEY;

    if (!apiKey) {
      console.warn("[notion] Missing NOTION_API_KEY environment variable, extension disabled.");
      return;
    }

    notion = new Client({ auth: apiKey });
    console.log("[notion] Extension initialized.");
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    notion = null;
    console.log("[notion] Extension shutdown.");
  });

  // Register notion_search tool
  pi.registerTool({
    name: "notion_search",
    label: "Search Notion",
    description: "Search Notion for pages and databases by query string",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query",
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!notion) {
        return {
          content: [{ type: "text", text: "Notion not initialized. Check NOTION_API_KEY environment variable." }],
          details: {},
        };
      }

      try {
        const results = await notion.search({
          query: params.query,
          page_size: 10,
        });

        if (results.results.length === 0) {
          return {
            content: [{ type: "text", text: "No results found." }],
            details: {},
          };
        }

        const formatted = results.results.map((r: any) => ({
          id: r.id,
          type: r.object,
          ...(r.object === "page" && "properties" in r
            ? { title: extractTitle(r) }
            : {}),
          ...(r.object === "database"
            ? { title: r.title?.map((t: any) => t.plain_text).join("") || "(untitled)" }
            : {}),
          ...(r.url ? { url: r.url } : {}),
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error searching: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });

  // Register notion_read_page tool
  pi.registerTool({
    name: "notion_read_page",
    label: "Read Notion Page",
    description: "Read the content blocks of a Notion page by ID",
    parameters: Type.Object({
      pageId: Type.String({
        description: "The Notion page ID",
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!notion) {
        return {
          content: [{ type: "text", text: "Notion not initialized. Check NOTION_API_KEY environment variable." }],
          details: {},
        };
      }

      try {
        const blocks = await notion.blocks.children.list({
          block_id: params.pageId,
        });

        const formatted = blocks.results.map((b: any) => ({
          id: b.id,
          ...("type" in b ? { type: b.type } : {}),
          ...("paragraph" in b
            ? { text: extractBlockText(b as Record<string, unknown>) }
            : {}),
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(formatted, null, 2) }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error reading page: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });

  // Register notion_list_databases tool
  pi.registerTool({
    name: "notion_list_databases",
    label: "List Notion Databases",
    description: "List all databases the integration has access to. Use this to find database IDs for creating pages.",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!notion) {
        return {
          content: [{ type: "text", text: "Notion not initialized. Check NOTION_API_KEY environment variable." }],
          details: {},
        };
      }

      try {
        const results = await notion.search({
          filter: { property: "object", value: "database" },
          page_size: 50,
        });

        if (results.results.length === 0) {
          return {
            content: [{ type: "text", text: "No databases found. Make sure databases are shared with the integration." }],
            details: {},
          };
        }

        const databases = results.results.map((db: any) => ({
          id: db.id,
          title: db.title?.map((t: any) => t.plain_text).join("") || "(untitled)",
          url: db.url,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(databases, null, 2) }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error listing databases: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });

  // Register notion_create_page tool
  pi.registerTool({
    name: "notion_create_page",
    label: "Create Notion Page",
    description: "Create a new page in Notion. Provide either databaseId (to add a row to a database) or parentPageId (to create a subpage under a page).",
    parameters: Type.Object({
      databaseId: Type.Optional(
        Type.String({
          description: "Target database ID (creates a database row)",
        })
      ),
      parentPageId: Type.Optional(
        Type.String({
          description: "Parent page ID (creates a subpage)",
        })
      ),
      title: Type.String({
        description: "Page title",
      }),
      content: Type.Optional(
        Type.String({
          description: "Page content in markdown. Supports headings (##, ###), bold (**text**), italic (*text*), bulleted lists (- item), numbered lists (1. item), horizontal rules (---), and plain paragraphs.",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!notion) {
        return {
          content: [{ type: "text", text: "Notion not initialized. Check NOTION_API_KEY environment variable." }],
          details: {},
        };
      }

      if (!params.databaseId && !params.parentPageId) {
        return {
          content: [{ type: "text", text: "Either databaseId or parentPageId is required. Use notion_list_databases to find available databases." }],
          details: {},
        };
      }

      try {
        const parent = params.databaseId
          ? { database_id: params.databaseId }
          : { page_id: params.parentPageId! };

        const properties = params.databaseId
          ? { title: { title: [{ text: { content: params.title } }] } }
          : { title: { title: [{ text: { content: params.title } }] } };

        const children = params.content
          ? markdownToBlocks(params.content) as any[]
          : [];

        const page = await notion.pages.create({
          parent: parent as any,
          properties,
          children,
        });

        return {
          content: [{ type: "text", text: `Created page: ${page.id}\nURL: ${(page as any).url}` }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error creating page: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });
}

function extractTitle(page: Record<string, unknown>): string {
  try {
    const props = page.properties as Record<string, unknown>;
    for (const val of Object.values(props)) {
      const prop = val as Record<string, unknown>;
      if (prop.type === "title") {
        const titleArr = prop.title as Array<{ plain_text: string }>;
        return titleArr?.[0]?.plain_text ?? "";
      }
    }
  } catch {
    // ignore
  }
  return "";
}

function extractBlockText(block: Record<string, unknown>): string {
  try {
    const para = block.paragraph as Record<string, unknown>;
    const richText = para?.rich_text as Array<{ plain_text: string }>;
    return richText?.map((t) => t.plain_text).join("") ?? "";
  } catch {
    return "";
  }
}
