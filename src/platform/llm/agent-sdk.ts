import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  createSdkMcpServer,
  query,
  tool,
  type SDKMessage,
  type SDKResultMessage,
} from '@anthropic-ai/claude-agent-sdk';

import { MODELS } from './models';
import type { AgentOutcome, AgentRequest, AgentStreamEvent, LlmUsage } from './types';

// The in-process MCP server's name; its tools reach the model as `mcp__notebook__<tool>`.
const SERVER = 'notebook';

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
 * The Agent SDK adapter (ADR 0001): a fresh `query()` per Agent run, with no
 * built-in tools, only the notebook tools on an in-process MCP server, no
 * settings or Skills from disk, no saved session, and a throwaway config dir.
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
      tools: [],
      mcpServers: { [SERVER]: server },
      strictMcpConfig: true,
      allowedTools: request.tools.map((t) => `mcp__${SERVER}__${t.name}`),
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
