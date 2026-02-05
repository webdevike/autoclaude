import { Client } from "@notionhq/client";
import type { Integration, ToolDefinition } from "@jarvis/core";

export class NotionIntegration implements Integration {
  name = "notion";
  private client: Client | null = null;

  tools: ToolDefinition[] = [
    {
      name: "notion_search",
      description:
        "Search Notion for pages and databases by query string",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query",
          },
        },
        required: ["query"],
      },
      execute: async (params) => {
        if (!this.client) return "Notion not initialized";
        const results = await this.client.search({
          query: params.query as string,
          page_size: 10,
        });
        return JSON.stringify(
          results.results.map((r) => ({
            id: r.id,
            type: r.object,
            ...(r.object === "page" && "properties" in r
              ? { title: extractTitle(r) }
              : {}),
          })),
        );
      },
    },
    {
      name: "notion_read_page",
      description: "Read the content blocks of a Notion page by ID",
      parameters: {
        type: "object",
        properties: {
          pageId: {
            type: "string",
            description: "The Notion page ID",
          },
        },
        required: ["pageId"],
      },
      execute: async (params) => {
        if (!this.client) return "Notion not initialized";
        const blocks = await this.client.blocks.children.list({
          block_id: params.pageId as string,
        });
        return JSON.stringify(
          blocks.results.map((b) => ({
            id: b.id,
            ...("type" in b ? { type: b.type } : {}),
            ...("paragraph" in b ? { text: extractBlockText(b as Record<string, unknown>) } : {}),
          })),
        );
      },
    },
    {
      name: "notion_create_page",
      description:
        "Create a new page in a Notion database",
      parameters: {
        type: "object",
        properties: {
          databaseId: {
            type: "string",
            description: "Target database ID",
          },
          title: {
            type: "string",
            description: "Page title",
          },
          content: {
            type: "string",
            description: "Page content as plain text",
          },
        },
        required: ["databaseId", "title"],
      },
      execute: async (params) => {
        if (!this.client) return "Notion not initialized";
        const page = await this.client.pages.create({
          parent: { database_id: params.databaseId as string },
          properties: {
            title: {
              title: [{ text: { content: params.title as string } }],
            },
          },
          children: params.content
            ? [
                {
                  object: "block",
                  type: "paragraph",
                  paragraph: {
                    rich_text: [
                      { text: { content: params.content as string } },
                    ],
                  },
                },
              ]
            : [],
        });
        return `Created page: ${page.id}`;
      },
    },
  ];

  async initialize(config: Record<string, unknown>): Promise<void> {
    const apiKey =
      (config.apiKey as string) || process.env.NOTION_API_KEY;
    if (!apiKey) {
      console.warn("[notion] No API key provided, integration disabled.");
      return;
    }
    this.client = new Client({ auth: apiKey });
    console.log("[notion] Initialized.");
  }

  async shutdown(): Promise<void> {
    this.client = null;
    console.log("[notion] Shutdown.");
  }
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
