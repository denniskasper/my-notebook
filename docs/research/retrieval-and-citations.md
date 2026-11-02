# Retrieval and citations approach

Research for issue #2 (map: issue #1). Researched 2026-11-02 against the official Anthropic docs and the pgvector README. Terms follow `GLOSSARY.md`.

**Question.** How should Chat ground answers in a Notebook's enabled Sources and return Citations that jump to the exact passage? Compare long context with prompt caching against embeddings/RAG (pgvector), and check whether Claude's Citations API fits. Weigh cost per question (~$20 API budget), Notebook size limits, latency, and how each option maps a Citation back to a PDF page or text span.

## Recommendation

**Use long context, prompt caching and the Citations API with *custom content* documents. Do not use a vector store in the MVP.**

1. **When a Source is ingested**, extract its text and split it into **passages**: a paragraph or a small group of sentences, each tagged with its page number and its character range in the extracted text. Store the passages in Postgres. A PDF counts as one Source, and so does a web page or a piece of pasted text.
2. **For each Chat request**, send every enabled Source as one `document` block of type `content`. The block's `content` array holds that Source's passages in order, one `text` block per passage. Set `citations: {enabled: true}` and put a `cache_control` breakpoint on the last document. Order the Sources deterministically (for example by creation time) so the cached prefix stays byte-identical.
3. **To resolve a Citation**, read `content_block_location {document_index, start_block_index, end_block_index}`. `document_index` points to a Source and the block range points to a run of passages. From the passages we get the page and character offsets, which the viewer scrolls to and highlights. The resolved passage ids are saved with the Chat message.
4. **Cap the enabled-Source tokens per Notebook** (for example about 150K tokens, counted at ingest) and show the user when the cap is reached. The Budget guard enforces this.
5. **Upgrade path if the cap starts to hurt:** add pgvector plus Postgres full-text retrieval, and send the top passages as `search_result` blocks. Citations then come back as `search_result_location` with the same block-index shape, so the citation-resolution code and the UI stay unchanged.

Why: on current models a warm cached question costs about the same as a RAG question (see the cost table). The Citations API returns verified pointers for free. Custom content gives us stable passage ids that map one-to-one to page and span. And we avoid adding a second vendor (embeddings) and a second retrieval system to a 7-day build.

## Key facts (with sources)

### Citations API

- All active models support Citations, and the feature is stable. Set `citations: {enabled: true}` on each document; it must be on for all documents or for none. [Citations]
- There are three document types, each with its own chunking and location format [Citations]:

  | Type | Chunking | Citation location |
  |---|---|---|
  | Plain text | Sentences | `char_location`: `start_char_index`/`end_char_index` (0-indexed, end exclusive) |
  | PDF | Sentences | `page_location`: `start_page_number`/`end_page_number` (1-indexed, end exclusive) |
  | Custom content | **None; your blocks are used as-is** | `content_block_location`: `start_block_index`/`end_block_index` (0-indexed, end exclusive) |

- Each Citation also carries `cited_text`, `document_index` and `document_title`. *"Citations are guaranteed to contain valid pointers to the provided documents."* [Citations]
- *"`cited_text` does not count toward your output tokens"*, and when passed back in later turns it does not count toward input tokens either. Enabling Citations adds *"a slight increase in input tokens"*. [Citations]
- Optional `title` and `context` fields reach the model but are never cited, so they are a good place for Source metadata. [Citations]
- *"Only text citations are currently supported"*. *"PDFs that are scans of documents and do not contain extractable text are not citable."* [Citations]
- **Incompatible with structured outputs.** Using `output_config.format` together with citation-enabled documents or `search_result` blocks returns a 400. The docs suggest asking for one line per field and parsing those lines yourself. [Citations] This matters for Studio outputs that need both JSON and Citations.
- Citations work with prompt caching. Put `cache_control` on the document blocks; the citation blocks in the response are not cached. [Citations]
- `search_result` blocks (stable, no beta header) can go in a tool result or directly in a user message, and their Citations come back as `search_result_location {source, title, search_result_index, start_block_index, end_block_index}`. [Search results]

### PDFs

- Each PDF page is passed to the model as extracted text **plus a page image**. Text costs *"1,500–3,000 tokens"* per page, and image tokens come on top of that. [PDF support]
- Limits: 600 pages per request (100 if the context window is under 1M tokens) and a 128 MB request size on the first-party API. Dense PDFs can fill the context window before reaching the page limit. [PDF support]
- With PDF documents, Citations give you **only a page range plus `cited_text`**, with no character offsets. Highlighting the exact span would then mean a fuzzy search for `cited_text` in the page's text layer. Custom content avoids that search, because we set the passage boundaries ourselves.

### Prompt caching and pricing

| Model | Input | 5m cache write | 1h cache write | Cache read | Output |
|---|---|---|---|---|---|
| Claude Opus 5.5 | $4 | $5 | $8 | $0.20 (0.05×) | $20 |
| Claude Sonnet 5.5 | $2 | $2.50 | $4 | $0.10 (0.05×) | $10 |
| Claude Haiku 5.5 (≤100K-token prompt) | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |
| Claude Haiku 5.5 (>100K-token prompt) | $0.50 | $0.625 | $1 | $0.05 | $2.50 |

All prices are per million tokens. [Pricing]

- Caching matches on the prefix: any change to a byte in the prefix invalidates everything after it, and the render order is `tools` → `system` → `messages`. A cache read refreshes the TTL. The default TTL is 5 minutes; 1 hour is optional. A request can hold at most 4 breakpoints. [Prompt caching]
- **Consequence:** enabling or disabling a Source, or reordering Sources, changes the prefix and leads to a cold write. Keep the order stable and put the documents before the question and the Chat history.
- Opus 5.5, Sonnet 5.5 and Haiku 5.5 all have a 1M-token context window. [Models overview]

### Embeddings and pgvector

- *"Anthropic does not offer its own embedding model."* The docs point to Voyage AI (`voyage-4`, `voyage-4-lite`, 1024 dimensions by default, 32K-token context), which needs a separate API key and billing account. [Embeddings]
- pgvector 0.8.7 supports Postgres 13 and later. The `vector` type stores up to 16,000 dimensions, and HNSW and IVFFlat indexes support up to 2,000 (4,000 with `halfvec`). The README documents hybrid search with Postgres full-text search, using Reciprocal Rank Fusion or a cross-encoder to merge results. [pgvector]

## Cost per question (estimate)

Assumptions: the Notebook has **100K tokens** of enabled Source text, about 1K tokens of system prompt and question, and a **600-token** answer. Adaptive-thinking tokens are billed as output and come on top. Chat history growth is ignored.

| Approach | Sonnet 5.5 | Opus 5.5 | Haiku 5.5 |
|---|---|---|---|
| Long context, **cold** (5m cache write) | ≈ $0.26 | ≈ $0.51 | ≈ $0.013 |
| Long context, **warm** (cache read) | ≈ $0.016 | ≈ $0.032 | ≈ $0.001 |
| RAG, 8 × 500-token passages (≈5K input, uncached) | ≈ $0.016 + embeddings | ≈ $0.032 + embeddings | ≈ $0.001 + embeddings |

Derived from the pricing table above.

- Because cache reads cost 0.05× the input price on Sonnet 5.5 and Opus 5.5, **a warm long-context question costs about as much as a RAG question.** Long context costs more only on cold starts: the first question in a session, after more than 5 minutes idle, or after a change to the enabled Sources.
- Against the $20 budget on Sonnet 5.5, the worst case of a cold write on every question still allows about 75 questions at 100K tokens. A normal demo session (several questions within minutes) allows several hundred. Opus 5.5 roughly halves these numbers. The Budget guard should track `usage` per request (`cache_creation_input_tokens`, `cache_read_input_tokens`, output tokens).
- Cost grows linearly with Notebook size on cold writes, which is why the MVP caps Notebook size. RAG cost does not depend on Notebook size.

## Trade-offs

| | Long context + caching + Citations (recommended) | RAG (pgvector + embeddings) |
|---|---|---|
| Answer quality | The model sees every enabled Source, so summaries and "compare all" questions work | Only the top-k passages; misses anything the retriever did not rank |
| Notebook size | Capped by budget (~150K tokens suggested) and by the 1M context window | Practically unbounded |
| Cost | High on a cold write, low when warm | Low and flat, plus embedding cost at ingest and per query |
| Latency | A cold 100K-token prefill is slow; cache hits lower time-to-first-token | Small prompts, plus a query-embedding round trip |
| Citation mapping | Exact: block index → passage → page and char range | Exact as well, through `search_result` block indices |
| Build effort | Passage table and prompt assembly | Plus embedding pipeline, a second vendor key, index tuning, hybrid ranking |
| Figures and charts | Lost if we send extracted text instead of PDF blocks (images cannot be cited anyway) | Same |

Rejected variants:

- **Native PDF document blocks.** They give page-level Citations and visual understanding, but they cost image tokens on every page and return no character offsets. Their one advantage, understanding figures, cannot be cited in any case.
- **Plain-text documents** (one per Source, sentence chunking). They give exact `char_location` offsets, but we would have to map character offsets back to pages ourselves, and sentence chunking cannot be controlled. Custom content keeps passage boundaries under our control.

## Open points for the spec

- The model for Chat (Sonnet 5.5 vs Opus 5.5 vs Haiku 5.5) belongs to the model/budget decision. Haiku 5.5 makes long context almost free under 100K tokens, but its price per token is 5× higher above 100K.
- Studio outputs that need both JSON and Citations: use line-per-item output and parse it ourselves, because Citations do not work with structured outputs.
- The exact Notebook cap and what the UI shows when a Source would exceed it.
- Passage-splitting rules (target size, how headings are handled) belong in the Source-ingestion design.

## Sources

- [Citations] https://platform.claude.com/docs/en/build-with-claude/citations
- [Search results] https://platform.claude.com/docs/en/build-with-claude/search-results
- [PDF support] https://platform.claude.com/docs/en/build-with-claude/pdf-support
- [Prompt caching] https://platform.claude.com/docs/en/build-with-claude/prompt-caching
- [Pricing] https://platform.claude.com/docs/en/about-claude/pricing
- [Models overview] https://platform.claude.com/docs/en/about-claude/models/overview
- [Embeddings] https://platform.claude.com/docs/en/build-with-claude/embeddings
- [pgvector] https://github.com/pgvector/pgvector (README, v0.8.7)
