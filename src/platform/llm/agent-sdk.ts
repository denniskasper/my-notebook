import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createSdkMcpServer,
  query,
  tool,
  type HookCallbackMatcher,
  type HookEvent,
  type HookInput,
  type HookJSONOutput,
  type SDKMessage,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { MODELS } from './models';
import type {
  AgentOutcome,
  AgentRequest,
  AgentStreamEvent,
  AgentWebSearch,
  LlmUsage,
} from './types';

// The in-process MCP server's name; its tools reach the model as `mcp__notebook__<tool>`.
const SERVER = 'notebook';
// The built-in tools the Agent gets: web search (on Anthropic's side) and Skills.
const WEB_SEARCH = 'WebSearch';
const SKILL = 'Skill';
// Plugin Skills are named `<plugin>:<skill>`; plugins ship only the research Skill.
const SKILLS = ['notebook:quellen-recherche'];

const webSearchInputSchema = z.object({ query: z.string() }).loose();

const OUTCOMES: Record<SDKResultMessage['subtype'], AgentOutcome> = {
  success: 'complete',
  error_max_turns: 'max_turns',
  error_max_budget_usd: 'max_budget',
  error_during_execution: 'failed',
  error_max_structured_output_retries: 'failed',
};

type ApiUsage = {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
};

function toUsage(usage: ApiUsage): LlmUsage {
  return {
    model: MODELS.agent,
    inputTokens: usage.input_tokens ?? 0,
    outputTokens: usage.output_tokens ?? 0,
    cacheReadTokens: usage.cache_read_input_tokens ?? 0,
    cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
  };
}

/**
 * The Agent SDK adapter (ADR 0001): a fresh `query()` per Agent run. Its only
 * built-in tools are web search (behind the request's gate) and Skills (only
 * the request's plugins); the notebook tools run on an in-process MCP server.
 * No settings from disk, no saved session, and a throwaway config dir.
 */
export async function* runAgentWithSdk(
  apiKey: string,
  request: AgentRequest,
  { signal }: { signal: AbortSignal },
): AsyncGenerator<AgentStreamEvent> {
  signal.throwIfAborted();
  const configDir = await mkdtemp(join(tmpdir(), 'agent-run-'));
  const abortController = new AbortController();
  const abort = () => abortController.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });

  const server = createSdkMcpServer({
    name: SERVER,
    alwaysLoad: true,
    tools: request.tools.map((agentTool) =>
      tool(agentTool.name, agentTool.description, agentTool.input, async (input) => {
        const result = await agentTool.run(input);
        return {
          content: [{ type: 'text' as const, text: result.text }],
          ...(result.isError && { isError: true }),
        };
      }),
    ),
  });

  const run = query({
    prompt: request.prompt,
    options: {
      model: MODELS.agent,
      systemPrompt: request.system,
      tools: request.webSearch ? [WEB_SEARCH, SKILL] : [SKILL],
      mcpServers: { [SERVER]: server },
      strictMcpConfig: true,
      allowedTools: [
        ...request.tools.map((t) => `mcp__${SERVER}__${t.name}`),
        ...(request.webSearch ? [WEB_SEARCH] : []),
      ],
      // Only the shipped plugin's Skills, not Claude Code's bundled ones.
      plugins: (request.plugins ?? []).map((path) => ({ type: 'local' as const, path })),
      skills: request.plugins?.length ? SKILLS : [],
      ...(request.webSearch && { hooks: webSearchHooks(request.webSearch) }),
      // Anything not allowed above is refused, never asked about.
      permissionMode: 'dontAsk',
      settingSources: [],
      persistSession: false,
      maxTurns: request.maxTurns,
      maxBudgetUsd: request.maxBudgetUsd,
      includePartialMessages: true,
      abortController,
      cwd: configDir,
      // Replaces the environment: the key and a writable, throwaway home, nothing else of the app's.
      env: {
        PATH: process.env.PATH,
        HOME: configDir,
        CLAUDE_CONFIG_DIR: configDir,
        ANTHROPIC_API_KEY: apiKey,
        CLAUDE_AGENT_SDK_CLIENT_APP: 'my-notebook',
      },
    },
  });

  // Input tokens arrive with message_start, output tokens with message_delta.
  let callUsage: ApiUsage = {};
  let usage: LlmUsage = toUsage({});
  try {
    for await (const message of run) {
      for (const event of toEvents(message)) {
        if (event.type === 'start') {
          callUsage = event.usage;
        } else if (event.type === 'end') {
          const finished = toUsage({ ...callUsage, ...withoutNulls(event.usage) });
          usage = sum(usage, finished);
          yield { type: 'usage', usage: finished };
        } else if (event.type === 'result') {
          yield {
            type: 'finished',
            outcome: OUTCOMES[event.result.subtype],
            costUsd: event.result.total_cost_usd,
            usage,
          };
        } else {
          yield event;
        }
      }
    }
    // The SDK may end quietly on abort; the caller expects a throw.
    signal.throwIfAborted();
  } finally {
    signal.removeEventListener('abort', abort);
    run.close();
    await rm(configDir, { recursive: true, force: true });
  }
}

/**
 * Hooks around the built-in web search: the gate may refuse a search before
 * it runs (the Agent sees the reason as the tool's error) and hears how it went.
 */
function webSearchHooks(gate: AgentWebSearch): Partial<Record<HookEvent, HookCallbackMatcher[]>> {
  const proceed: HookJSONOutput = { continue: true };
  const on = (hook: (input: HookInput) => HookJSONOutput): HookCallbackMatcher[] => [
    { matcher: WEB_SEARCH, hooks: [async (input) => hook(input)] },
  ];
  return {
    PreToolUse: on((input) => {
      if (input.hook_event_name !== 'PreToolUse') return proceed;
      const parsed = webSearchInputSchema.safeParse(input.tool_input);
      const refused = gate.begin(input.tool_use_id, parsed.success ? parsed.data.query : '');
      if (refused === null) return proceed;
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: refused,
        },
      };
    }),
    PostToolUse: on((input) => {
      if (input.hook_event_name === 'PostToolUse') gate.end(input.tool_use_id, true);
      return proceed;
    }),
    PostToolUseFailure: on((input) => {
      if (input.hook_event_name === 'PostToolUseFailure') gate.end(input.tool_use_id, false);
      return proceed;
    }),
  };
}

type SdkEvent =
  | AgentStreamEvent
  | { type: 'start'; usage: ApiUsage }
  | { type: 'end'; usage: ApiUsage }
  | { type: 'result'; result: SDKResultMessage };

function toEvents(message: SDKMessage): SdkEvent[] {
  if (message.type === 'result') return [{ type: 'result', result: message }];
  // Only the main loop's own stream; complete assistant messages repeat it.
  if (message.type !== 'stream_event' || message.parent_tool_use_id !== null) return [];
  const { event } = message;
  switch (event.type) {
    case 'message_start':
      return [{ type: 'start', usage: event.message.usage }];
    case 'message_delta':
      return [{ type: 'end', usage: event.usage }];
    case 'content_block_start':
      return event.content_block.type === 'text' ? [{ type: 'text_block' }] : [];
    case 'content_block_delta':
      return event.delta.type === 'text_delta' ? [{ type: 'text', text: event.delta.text }] : [];
    default:
      return [];
  }
}

function withoutNulls(usage: ApiUsage): ApiUsage {
  return Object.fromEntries(Object.entries(usage).filter(([, value]) => value !== null));
}

function sum(a: LlmUsage, b: LlmUsage): LlmUsage {
  return {
    model: a.model,
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
    cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
  };
}
