# Client SDK for Chat and Studio, Agent SDK only for Agent mode

Chat and Studio outputs call Claude through the Anthropic Client SDK, and only Agent mode runs on the Claude Agent SDK. Chat and Studio need native Citations, exact token usage for the Budget guard and no subprocess per request; the Agent needs a multi-step tool loop with web search, hooks, Skills and run caps that the Agent SDK provides out of the box. Both sit behind one `llm` boundary in `src/platform/llm`, which tests replace with a scripted fake.

## Considered Options

- **Agent SDK for everything**: one engine, but every Chat answer would spawn the bundled Claude Code process, Citations would have to be imitated with markers, and usage would only be known per run.
- **Client SDK for everything** (its tool runner for the Agent): no subprocess, but web search caps, Skills, hooks and the turn/budget limits would all be rebuilt by hand.

## Consequences

- Agent tool handlers are plain functions in `modules/agent`; only the Agent SDK adapter wraps them into `tool()`. Swapping the Agent to the Client SDK tool runner means swapping the adapter, not the handlers.
- The production image must keep the Agent SDK's bundled Claude Code binary (glibc base, optional dependencies kept).
- The Agent marks Citations as `[[p:<passageId>]]` markers that the server validates, while Chat uses the Citations API; both end up as the same Citation snapshot.
