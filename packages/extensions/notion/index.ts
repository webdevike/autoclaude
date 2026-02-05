/**
 * Notion Extension for pi-mono
 *
 * Provides tools for searching and reading Notion pages.
 * Initializes from NOTION_API_KEY environment variable on session_start.
 */

import { Client } from "@notionhq/client";
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
          type: "text",
          text: "Notion not initialized. Check NOTION_API_KEY environment variable.",
        };
      }

      try {
        const results = await notion.search({
          query: params.query,
          page_size: 10,
        });

        if (results.results.length === 0) {
          return {
            type: "text",
            text: "No results found.",
          };
        }

        const formatted = results.results.map((r: any) => ({
          id: r.id,
          type: r.object,
          ...(r.object === "page" && "properties" in r
            ? { title: extractTitle(r) }
            : {}),
        }));

        return {
          type: "text",
          text: JSON.stringify(formatted, null, 2),
        };
      } catch (error) {
        return {
          type: "text",
          text: `Error searching: ${error instanceof Error ? error.message : "Unknown error"}`,
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
          type: "text",
          text: "Notion not initialized. Check NOTION_API_KEY environment variable.",
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
          type: "text",
          text: JSON.stringify(formatted, null, 2),
        };
      } catch (error) {
        return {
          type: "text",
          text: `Error reading page: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }
    },
  });

  // Register notion_create_page tool
  pi.registerTool({
    name: "notion_create_page",
    label: "Create Notion Page",
    description: "Create a new page in a Notion database",
    parameters: Type.Object({
      databaseId: Type.String({
        description: "Target database ID",
      }),
      title: Type.String({
        description: "Page title",
      }),
      content: Type.Optional(
        Type.String({
          description: "Page content as plain text",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!notion) {
        return {
          type: "text",
          text: "Notion not initialized. Check NOTION_API_KEY environment variable.",
        };
      }

      try {
        const page = await notion.pages.create({
          parent: { database_id: params.databaseId },
          properties: {
            title: {
              title: [{ text: { content: params.title } }],
            },
          },
          children: params.content
            ? [
                {
                  object: "block" as const,
                  type: "paragraph" as const,
                  paragraph: {
                    rich_text: [{ text: { content: params.content } }],
                  },
                },
              ]
            : [],
        });

        return {
          type: "text",
          text: `Created page: ${page.id}`,
        };
      } catch (error) {
        return {
          type: "text",
          text: `Error creating page: ${error instanceof Error ? error.message : "Unknown error"}`,
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
