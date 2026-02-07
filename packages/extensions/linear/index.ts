/**
 * Linear Extension for pi-mono
 *
 * Provides tools for working with Linear issues and teams.
 * Initializes from LINEAR_API_KEY environment variable on session_start.
 */

import { LinearClient } from "@linear/sdk";
import { Type } from "@sinclair/typebox";
import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";

let linear: LinearClient | null = null;

export default function linearExtension(pi: ExtensionAPI) {
  // Initialize Linear client on session start
  pi.on("session_start", async () => {
    const apiKey = process.env.LINEAR_API_KEY;

    if (!apiKey) {
      console.warn("[linear] Missing LINEAR_API_KEY environment variable, extension disabled.");
      return;
    }

    linear = new LinearClient({ apiKey });
    console.log("[linear] Extension initialized.");
  });

  // Cleanup on shutdown
  pi.on("session_shutdown", async () => {
    linear = null;
    console.log("[linear] Extension shutdown.");
  });

  // Register linear_search_issues tool
  pi.registerTool({
    name: "linear_search_issues",
    label: "Search Linear Issues",
    description: "Search Linear issues by query",
    parameters: Type.Object({
      query: Type.String({
        description: "Search query for issues",
      }),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!linear) {
        return {
          content: [{ type: "text", text: "Linear not initialized. Check LINEAR_API_KEY environment variable." }],
          details: {},
        };
      }

      try {
        const issues = await linear.issueSearch({ query: params.query });
        const nodes = issues.nodes.slice(0, 10);

        if (nodes.length === 0) {
          return {
            content: [{ type: "text", text: "No issues found." }],
            details: {},
          };
        }

        const results = await Promise.all(
          nodes.map(async (i) => ({
            id: i.identifier,
            title: i.title,
            state: await i.state?.then((s) => s.name),
            priority: i.priority,
          }))
        );

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error searching issues: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });

  // Register linear_create_issue tool
  pi.registerTool({
    name: "linear_create_issue",
    label: "Create Linear Issue",
    description: "Create a new Linear issue",
    parameters: Type.Object({
      teamId: Type.String({
        description: "The team ID to create the issue in",
      }),
      title: Type.String({
        description: "Issue title",
      }),
      description: Type.Optional(
        Type.String({
          description: "Issue description (markdown)",
        })
      ),
      priority: Type.Optional(
        Type.Number({
          description: "Priority: 0=none, 1=urgent, 2=high, 3=medium, 4=low",
        })
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!linear) {
        return {
          content: [{ type: "text", text: "Linear not initialized. Check LINEAR_API_KEY environment variable." }],
          details: {},
        };
      }

      try {
        const issue = await linear.createIssue({
          teamId: params.teamId,
          title: params.title,
          description: params.description,
          priority: params.priority,
        });

        const created = await issue.issue;
        return {
          content: [{ type: "text", text: `Created: ${created?.identifier} — ${created?.title}` }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error creating issue: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });

  // Register linear_list_teams tool
  pi.registerTool({
    name: "linear_list_teams",
    label: "List Linear Teams",
    description: "List all Linear teams",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!linear) {
        return {
          content: [{ type: "text", text: "Linear not initialized. Check LINEAR_API_KEY environment variable." }],
          details: {},
        };
      }

      try {
        const teams = await linear.teams();
        const results = teams.nodes.map((t) => ({
          id: t.id,
          name: t.name,
          key: t.key,
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error listing teams: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });

  // Register linear_my_issues tool
  pi.registerTool({
    name: "linear_my_issues",
    label: "My Linear Issues",
    description: "List issues assigned to me",
    parameters: Type.Object({}),
    async execute(toolCallId, params, signal, onUpdate, ctx: ExtensionContext) {
      if (!linear) {
        return {
          content: [{ type: "text", text: "Linear not initialized. Check LINEAR_API_KEY environment variable." }],
          details: {},
        };
      }

      try {
        const me = await linear.viewer;
        const issues = await me.assignedIssues({ first: 20 });

        const results = await Promise.all(
          issues.nodes.map(async (i) => ({
            id: i.identifier,
            title: i.title,
            state: await i.state?.then((s) => s.name),
            priority: i.priority,
          }))
        );

        return {
          content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
          details: {},
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: `Error listing my issues: ${error instanceof Error ? error.message : "Unknown error"}` }],
          details: {},
        };
      }
    },
  });
}
