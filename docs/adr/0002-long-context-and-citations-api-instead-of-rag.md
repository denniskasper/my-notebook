# Long context and the Citations API instead of a vector store

Every answer sends all of a Notebook's enabled Sources to Claude as custom-content documents, one block per Passage, with prompt caching and the Citations API; there is no vector store and no retrieval step. A Notebook's enabled Sources are capped at a token limit (80K by default) so prompts stay cheap and inside the model's price step. This makes every Citation point at an exact Passage by construction, removes a whole retrieval pipeline from a three-day build, and fits the demo's handful of Sources.

## Considered Options

- **Vector store / RAG** (pgvector, chunk embeddings, top-k retrieval): scales to large Notebooks, but adds an embedding provider, retrieval tuning and citations that can only point at retrieved chunks.

## Consequences

- Notebooks are limited in size; adding or enabling a Source past the cap is rejected.
- The upgrade path is pgvector plus Postgres full-text search, with the retrieved Passages sent as `search_result` blocks so Citations keep working.
