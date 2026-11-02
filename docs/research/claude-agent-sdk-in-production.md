# Claude Agent SDK in production

Research for issue #3 (map: #1). Question: what does running the Claude Agent SDK behind the
My Notebook web app require? It covers runtime on Dokploy, authentication (developer's
subscription in development, API key in production), custom tools that act on a **Notebook**,
Agent Skills, streaming to the browser, per-run cost for budget caps, concurrency and sandboxing.

Researched 2026-11-02 against the official Agent SDK docs (code.claude.com/docs/en/agent-sdk/*),
the Claude Code legal and authentication pages, and the Claude API pricing page. Quotes are
verbatim. Statements marked **(inference)** are my reading and are not stated in a source.

## Recommendation

Use the **TypeScript Agent SDK (`@anthropic-ai/claude-agent-sdk`) only for the Agent mode**, inside
the Next.js server (Node runtime) in the same Docker image, with these settings:

- `tools: []` (no built-in Bash/Read/Write/Edit) plus an **in-process MCP server** of Notebook tools.
  Add only `WebSearch`/`WebFetch` from the built-ins for web research.
- `permissionMode: "dontAsk"` with an explicit `allowedTools` list. Use `settingSources: ["project"]`
  with a dedicated agent `cwd` that holds only the shipped `.claude/skills/`. Set
  `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`.
- `includePartialMessages: true`, forwarded to the browser as SSE.
- Per run: `maxTurns`, `maxBudgetUsd`, an `AbortController` tied to client disconnect, and a cheap
  default model (Claude Sonnet 5.5 or Claude Haiku 5.5). Globally: a Postgres spend ledger fed from
  `total_cost_usd`, a concurrency cap of about 2 Agent runs, and a **Console spend limit on the
  production key** as the authoritative backstop.
- Auth: in development, the SDK runs under the developer's own Claude Code login (no
  `ANTHROPIC_API_KEY` set). In production, `ANTHROPIC_API_KEY` comes from a Dokploy secret. Never put
  a subscription token (`CLAUDE_CODE_OAUTH_TOKEN`) on the server.
- Keep **Chat** on the plain Client SDK (`@anthropic-ai/sdk`, Messages API with citations). It is
  cheaper and faster, needs no subprocess, and has native **Citations**. The Agent SDK earns its
  cost only where Claude works through several steps on its own.

## Findings

### 1. Runtime: a supervised subprocess, not a stateless API call

- "The Agent SDK spawns and supervises a `claude` CLI subprocess that owns a shell, a working
  directory, and session files on disk. Hosting it is not like hosting a stateless API wrapper."
  ([Hosting](https://code.claude.com/docs/en/agent-sdk/hosting))
- "One agent session maps to one subprocess. Running N concurrent sessions means N subprocesses."
  (Hosting)
- Runtime: "Node.js 18.14+ for the TypeScript SDK". "Both the TypeScript and Python SDKs bundle a
  native Claude Code binary … and the spawned CLI needs no separate Node.js install." "The bundled
  binary is pinned to the SDK package version, so updating the SDK is how you update the CLI."
  (Hosting)
- Docker pitfall: "The TypeScript SDK installs its binary through npm optional dependencies, so an
  install that skips them, for example `npm ci --omit=optional`, gets no binary even on a supported
  platform." ([Quickstart](https://code.claude.com/docs/en/agent-sdk/quickstart)) The binary must
  also match the image's architecture and libc ("Claude Code can't start from a binary that doesn't
  match the container's architecture or libc", Hosting). **(inference)** Use a glibc base image
  (Debian slim) unless the musl variant is verified. With Next.js `output: "standalone"`, check that
  file tracing copies the platform binary package, or mark the SDK as a server external package.
  Add a smoke test (`query` with `maxTurns: 1`) to CI.
- Resources: "1 GiB RAM, 5 GiB disk, and 1 CPU per agent is a reasonable starting point … Memory
  usage grows with session length and tool activity." (Hosting)
- Network: outbound HTTPS to the Anthropic API only (plus any MCP or web endpoints). "The subprocess
  itself does not listen on the network." (Hosting)
- Filesystem state: session transcripts under `~/.claude/projects/` (or `CLAUDE_CONFIG_DIR`),
  `CLAUDE.md` memory, and working-directory artifacts. "None of them survive a container restart."
  (Hosting) For My Notebook this is fine: the app keeps the Agent conversation in Postgres and needs
  no SDK resume across deploys. Set `persistSession: false` if you don't resume, or use a
  `SessionStore` adapter if you do.
- Session pattern: "Long-running sessions" fits a Dokploy container, one persistent container
  serving many short `query()` calls. TypeScript can pre-warm subprocesses with `startup()` or
  `prewarm()`. (Hosting)
- Limits to plan for: "No top-level session timeout. Set `maxTurns`". "Memory growth over long
  sessions". (Hosting)

### 2. Auth: subscription in development, API key in production

What the terms say:

- "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai
  login or rate limits for their products, including agents built on the Claude Agent SDK. Use the
  API key authentication methods described in the Quickstart instead."
  ([Overview](https://code.claude.com/docs/en/agent-sdk/overview), repeated in the Quickstart)
- "**Developers** building products or services that interact with Claude's capabilities, including
  those using the Agent SDK, should use API key authentication through Claude Console or a supported
  cloud provider. Anthropic does not permit third-party developers to offer Claude.ai login into
  their own applications, or to route requests through Free, Pro, Max, or Ultra plan credentials on
  behalf of their users." ([Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance))
- "Advertised usage limits for Pro, Max, and Ultra plans assume ordinary, individual usage of Claude
  Code and the Agent SDK." (Legal and compliance)
- API keys may be configured "in a development environment, secrets manager, or machine image for
  use by the customer's own authorized users — provided the resulting usage is billed to the key
  owner … and is not resold or intermediated." (Legal and compliance)

How credentials are picked
([Authentication precedence](https://code.claude.com/docs/en/authentication)): cloud provider env →
`ANTHROPIC_AUTH_TOKEN` → `ANTHROPIC_API_KEY` → `apiKeyHelper` → `CLAUDE_CODE_OAUTH_TOKEN` (from
`claude setup-token`, "a one-year OAuth token") → Anthropic profile → subscription `/login`. The SDK
subprocess reads the same chain. In production, "the subprocess reads `ANTHROPIC_API_KEY` from its
environment." (Hosting)

Consequences for My Notebook:

- **Development:** the developer runs the app locally, unset `ANTHROPIC_API_KEY`, and the SDK uses
  their own Claude Code login. This is one person using their own subscription on their own
  machine. It fits "ordinary, individual usage of … the Agent SDK" **(inference)**. Watch out:
  a stray `ANTHROPIC_API_KEY` in `.env` takes precedence and bills the API key instead.
  - **(inference)** Next.js loads `.env*` into `process.env`. In TypeScript, `env` "replaces the
    subprocess environment", so pass the env explicitly and leave the key out in development.
- **Production (public demo):** anonymous visitors trigger requests, so it **must** use an API key.
  Routing visitors through the subscription is the case the terms forbid. Never deploy
  `CLAUDE_CODE_OAUTH_TOKEN`.
- **Open ambiguity:** the legal page's section "Can customers offer Claude Code in their products?"
  says each end user must use their own credential when you run Claude Code "in your products or
  services (e.g. in hosted sandboxes or other agent infrastructure)". The Agent SDK overview, on the
  other hand, says the SDK is governed by the Commercial Terms "including when you use it to power
  products and services that you make available to your own customers and end users".
  **(inference)** The first section targets products that offer Claude Code itself. A free
  portfolio demo on the developer's own key, billed to them and not resold, fits the second.
  The risk is low but not zero. Mention it in the spec. The fallback is the Client SDK tool runner,
  which runs no Claude Code binary.

### 3. Custom tools on a Notebook (in-process MCP)

([Custom tools](https://code.claude.com/docs/en/agent-sdk/custom-tools))

- Define with `tool(name, description, zodShape, handler, extras?)`, wrap with
  `createSdkMcpServer({ name, version, tools })`, pass via `mcpServers`. "The server runs
  in-process inside your application, not as a separate process." The handlers can therefore use
  the app's Postgres client directly. No credentials enter the agent's environment.
- Tool names are `mcp__{server}__{tool}`. List them, or the `mcp__notebook__*` wildcard, in
  `allowedTools`.
- `tools: []` removes all built-ins ("Claude can only use your MCP tools"). A bare name in
  `disallowedTools` also removes a tool from context.
- `readOnlyHint: true` lets read tools run in parallel. Custom tools default to sequential.
- A thrown error becomes an error result and "the agent loop continues". Return `isError: true` to
  write the message Claude reads.
- `structuredContent` returns machine-readable data (TypeScript only).
- Tool search is on by default and defers MCP tool schemas. Use `alwaysLoad: true` for the few core
  tools.
- Per-tool `permission_policy: "always_ask" | "always_deny"` (TypeScript, SDK ≥ v0.3.301) routes
  calls to `canUseTool`. This could gate write tools (for example "save as **Note**") behind user
  approval.

Suggested tool set **(inference)**: `list_sources`, `search_sources` (retrieval over enabled
**Sources**, returning passage ids for **Citations**), `read_source_passage`, `create_note`, and
`create_studio_output`. Scope every tool to the current notebook id with a closure, so the model
cannot pass a different notebook id.

### 4. Agent Skills

([Skills](https://code.claude.com/docs/en/agent-sdk/skills))

- Skills are files only. "Unlike subagents … you create skills as files on disk. The SDK doesn't
  provide a programmatic API for registering them."
- Skills are discovered from `~/.claude/skills/` (user source) and `<cwd>/.claude/skills/` plus
  parents (project source). If you set `settingSources` explicitly, "include `'project'` to keep
  project … skills". Alternatively, load skills from a path with the `plugins` option.
- `skills: "all" | string[] | []` controls which skills can be invoked. "When you set `skills`, the
  SDK adds the Skill tool to `allowedTools` automatically. If you also pass an explicit `tools` list,
  include `"Skill"` in that list."
- Check that skills loaded via the `skills` array on the `system`/`init` message.
- For My Notebook: ship a repo directory, for example `agent/.claude/skills/<name>/SKILL.md` (such
  as a briefing writer or a quiz builder), use that directory as the agent's `cwd`, and set
  `settingSources: ["project"]`, `skills: [<names>]`, and `tools: ["Skill", "WebSearch", "WebFetch"]`.
  This is a visible AI showcase item at low cost: descriptions load at start, full content only when
  invoked.

### 5. Streaming to the browser

([Streaming output](https://code.claude.com/docs/en/agent-sdk/streaming-output))

- `includePartialMessages: true` yields `{ type: "stream_event", event }` messages that carry raw
  Messages API events: `content_block_start` (including `tool_use` with its name),
  `content_block_delta` (`text_delta`, `input_json_delta`), `content_block_stop`, `message_delta`,
  and `message_stop`. Complete `assistant` messages arrive as well, and a final `result` message.
- "Stream events are emitted for the main session only; token-level deltas from subagents aren't
  forwarded."
- A cut-off stream still delivers `message_stop`. If a tool block is still open at that point,
  treat its input as incomplete.
- **(inference)** Implementation: a Next.js Route Handler (`runtime = "nodejs"`) returns a
  `ReadableStream` as `text/event-stream`. It maps events to a small app protocol (`text`,
  `tool_start` with a German label, `tool_end`, `done` with cost, `error`). Abort the `query` when
  the request signal fires. Persist the final assistant message to Postgres.

### 6. Per-run cost and budget caps

([Cost tracking](https://code.claude.com/docs/en/agent-sdk/cost-tracking),
[Agent loop](https://code.claude.com/docs/en/agent-sdk/agent-loop))

- The `result` message carries `total_cost_usd`, `usage`, `modelUsage` (per model, with `costUSD`),
  and `num_turns`, on success **and** on error subtypes. `usage` excludes subagents;
  `total_cost_usd` and `modelUsage` include them.
- These are **estimates**: "The `total_cost_usd` and `costUSD` fields are client-side estimates, not
  authoritative billing data … computed locally from a price table bundled at build time." They can
  drift when "the installed SDK version does not recognize a model". Keep the SDK current. The
  `costBasis: "unknown"` field on `modelUsage` flags an unpriced model.
- Per-step `output_tokens` on assistant messages "is a placeholder". Read output tokens from the
  result.
- `maxBudgetUsd` stops the loop with the `error_max_budget_usd` subtype. The SDK checks it after
  each model response, so "spend can therefore pass the cap by up to the cost of that one response"
  plus running subagents. Leave headroom. `maxTurns` gives `error_max_turns`.
- A single-shot `query()` **throws** after yielding an error result, so wrap the loop in
  `try/catch`.
- After a crash, the `error_during_execution` result "may carry zeroed" cost. **(inference)** Charge
  the ledger a conservative fallback for such runs.
- The SDK caches prompts automatically. With API-key auth, the cache TTL is 5 minutes by default
  (`ENABLE_PROMPT_CACHING_1H` raises it).
- Authoritative numbers come from the Console Usage page or the Usage and Cost API. "Do not bill end
  users or trigger financial decisions from these fields." **(inference)** For a demo budget guard,
  an estimate plus the Console spend limit as a hard stop is adequate.

Prices (USD per million tokens; [Pricing](https://platform.claude.com/docs/en/about-claude/pricing)):

| Model | Input | 5m cache write | Cache hit | Output |
| - | - | - | - | - |
| Claude Opus 5.5 (`claude-opus-5-5`) | $4 | $5 | $0.20 | $20 |
| Claude Sonnet 5.5 (`claude-sonnet-5-5`) | $2 | $2.50 | $0.10 | $10 |
| Claude Haiku 5.5 (`claude-haiku-5-5`), prompts ≤ 100K | $0.10 | $0.125 | $0.01 | $0.50 |

Web search costs "$10 USD per 1,000 searches" plus tokens.

**(inference)** Rough cost of one Agent run on Sonnet 5.5: 5 turns, about 20K context mostly cached,
about 3K output. That is about $0.05 for the first uncached input, $0.01 for cache hits, and $0.03
for output, so roughly **$0.10 per run**, or about 200 runs on $20. Haiku 5.5 is about 20× cheaper.
Measure on real runs before setting caps.

### 7. Concurrency and sandboxing

- Concurrency: "agents per host = (host RAM - overhead) / (per-session RAM ceiling)", with 1 GiB as
  a floor. (Hosting) **(inference)** On a small VPS shared with Postgres, cap concurrent Agent runs
  at about 2 with an in-process semaphore and reject or queue the rest (HTTP 429 with a German
  message). Chat via the Client SDK needs no subprocess and is not limited the same way.
- Multi-tenant isolation in one container (Hosting): `settingSources: []` (or only `project` for the
  shipped skills), `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`, a per-tenant `CLAUDE_CONFIG_DIR`, and an
  explicit `cwd` on every `query()`. **(inference)** My Notebook has no real accounts, and with
  `tools: []` the agent cannot read the filesystem. One shared read-only agent `cwd` with the skills
  plus a temp `CLAUDE_CONFIG_DIR` is enough.
- Threat model ([Secure deployment](https://code.claude.com/docs/en/agent-sdk/secure-deployment)):
  prompt injection from content the agent processes (**Sources**, web pages). The main control here
  is **removing Bash and file tools** (`tools: []`). The agent can then act only through the
  Notebook tools, scoped to one notebook, plus web search and fetch. Remaining risk: injected text
  that makes the agent write misleading **Notes** or call web fetch on attacker URLs. **(inference)**
  Acceptable for a demo. Optionally gate write tools behind `always_ask`.
- Container hardening from the same guide that is cheap on Dokploy: non-root user, read-only root
  filesystem with tmpfs for `HOME`/`CLAUDE_CONFIG_DIR` and `/tmp`, memory and pids limits, and no
  secrets in the image. Use `permissionMode: "dontAsk"`, not `bypassPermissions`, which "can't be
  used when running as root" and should be reserved for isolated environments.
- Observability: the SDK reads OpenTelemetry env (`CLAUDE_CODE_ENABLE_TELEMETRY=1`, `OTEL_*`).
  "Prompt text and tool inputs are not included in exports by default." (Hosting) This is a DevOps
  showcase hook.

## Trade-offs

| Option | For | Against |
| - | - | - |
| **Agent SDK for Agent mode** (recommended) | Same harness as Claude Code. Skills, subagents, compaction, hooks, cost estimate and `maxBudgetUsd` built in. Matches the "AI skills (Claude Agent SDK)" showcase goal | Subprocess per run (about 1 GiB). Native binary in Docker. Cost is an estimate. Terms ambiguity on hosted use (§2). Heavier than needed for simple Q&A |
| Agent SDK for Chat as well | One code path | Slower, costlier, and no native document **Citations**. Chat needs grounding, not autonomy |
| Client SDK tool runner for everything | No subprocess, exact `usage` per response, native Citations, no terms ambiguity | Loses the Agent SDK showcase. Skills and compaction to build or wire yourself |
| Managed Agents | Anthropic hosts loop and sandbox | Less DevOps to show. Beta. Another billing surface for a $20 budget |

## Sources

- Agent SDK overview: https://code.claude.com/docs/en/agent-sdk/overview
- Hosting the Agent SDK: https://code.claude.com/docs/en/agent-sdk/hosting
- Quickstart: https://code.claude.com/docs/en/agent-sdk/quickstart
- Custom tools: https://code.claude.com/docs/en/agent-sdk/custom-tools
- Skills: https://code.claude.com/docs/en/agent-sdk/skills
- Streaming output: https://code.claude.com/docs/en/agent-sdk/streaming-output
- Cost tracking: https://code.claude.com/docs/en/agent-sdk/cost-tracking
- Agent loop (budget, result subtypes, permission modes): https://code.claude.com/docs/en/agent-sdk/agent-loop
- TypeScript reference (Options): https://code.claude.com/docs/en/agent-sdk/typescript
- Secure deployment: https://code.claude.com/docs/en/agent-sdk/secure-deployment
- Authentication: https://code.claude.com/docs/en/authentication
- Legal and compliance: https://code.claude.com/docs/en/legal-and-compliance
- Pricing: https://platform.claude.com/docs/en/about-claude/pricing
