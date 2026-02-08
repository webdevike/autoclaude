import { LinearClient } from "@linear/sdk";
import type { Integration, ToolDefinition } from "@jarvis/core";

export class LinearIntegration implements Integration {
  name = "linear";
  private client: LinearClient | null = null;

  tools: ToolDefinition[] = [
    {
      name: "linear_search_issues",
      description: "Search Linear issues by query",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Search query for issues",
          },
        },
        required: ["query"],
      },
      execute: async (params) => {
        if (!this.client) return "Linear not initialized";
        const issues = await this.client.issueSearch({ query: params.query as string });
        const nodes = issues.nodes.slice(0, 10);
        const results = await Promise.all(
          nodes.map(async (i) => ({
            id: i.identifier,
            title: i.title,
            state: await i.state?.then((s) => s.name),
            priority: i.priority,
          })),
        );
        return JSON.stringify(results);
      },
    },
    {
      name: "linear_create_issue",
      description: "Create a new Linear issue",
      parameters: {
        type: "object",
        properties: {
          teamId: {
            type: "string",
            description: "The team ID to create the issue in",
          },
          title: {
            type: "string",
            description: "Issue title",
          },
          description: {
            type: "string",
            description: "Issue description (markdown)",
          },
          priority: {
            type: "number",
            description: "Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low",
          },
        },
        required: ["teamId", "title"],
      },
      execute: async (params) => {
        if (!this.client) return "Linear not initialized";
        const issue = await this.client.createIssue({
          teamId: params.teamId as string,
          title: params.title as string,
          description: params.description as string | undefined,
          priority: params.priority as number | undefined,
        });
        const created = await issue.issue;
        return `Created: ${created?.identifier} — ${created?.title}`;
      },
    },
    {
      name: "linear_list_teams",
      description: "List all Linear teams",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        if (!this.client) return "Linear not initialized";
        const teams = await this.client.teams();
        return JSON.stringify(
          teams.nodes.map((t) => ({
            id: t.id,
            name: t.name,
            key: t.key,
          })),
        );
      },
    },
    {
      name: "linear_my_issues",
      description: "List issues assigned to me",
      parameters: {
        type: "object",
        properties: {},
      },
      execute: async () => {
        if (!this.client) return "Linear not initialized";
        const me = await this.client.viewer;
        const issues = await me.assignedIssues({ first: 20 });
        const results = await Promise.all(
          issues.nodes.map(async (i) => ({
            id: i.identifier,
            title: i.title,
            state: await i.state?.then((s) => s.name),
            priority: i.priority,
          })),
        );
        return JSON.stringify(results);
      },
    },
  ];

  async initialize(config: Record<string, unknown>): Promise<void> {
    const apiKey =
      (config.apiKey as string) || process.env.LINEAR_API_KEY;
    if (!apiKey) {
      console.warn("[linear] No API key provided, integration disabled.");
      return;
    }
    this.client = new LinearClient({ apiKey });
    console.log("[linear] Initialized.");
  }

  async shutdown(): Promise<void> {
    this.client = null;
    console.log("[linear] Shutdown.");
  }
}
