# Source ingestion with locations

Research for [#4](https://github.com/denniskasper/my-notebook/issues/4) (map: [#1](https://github.com/denniskasper/my-notebook/issues/1)). Researched 2026-11-02.

**Question:** How do we turn PDFs, web pages (URLs) and pasted text into **Source** text and keep positions (page, offsets), so that a **Citation** can open the exact passage in a source viewer? Which TypeScript libraries should do PDF text extraction and URL readability extraction, and how does their output fit the citation mechanism?

## Recommendation

1. **Ingest every Source into one canonical form that we own:** normalized plain text plus an ordered list of **segments** (paragraphs or sentences). Each segment stores `charStart`/`charEnd` into the Source text. PDF segments also store `page`, and optionally the pdf.js text-item range on that page. The source viewer and the citation mechanism both use this one form.
2. **Send Sources to Claude as text we extracted ourselves, not as raw PDFs.** Use *custom content* `document` blocks, or `search_result` blocks if #2 retrieves chunks. Make each content block one stored segment. Claude returns `content_block_location` or `search_result_location` with block indices. A block index maps directly to a segment, which gives us page and character range. We never have to fuzzy-match `cited_text`.
   - Pasted text can also go in as a `text/plain` document. Claude then returns `char_location` offsets that point directly into our stored text. That works, but one block-based path for all Source types is simpler.
3. **PDF:** use **unpdf** (MIT; bundles a serverless PDF.js build) on the server. Use `extractText` for per-page text and `extractTextItems` for positioned items. In the viewer, use **pdfjs-dist** with its `TextLayer` to render the page and highlight the cited items. Pin the same PDF.js major version on both sides so the text items match. Use `inspectPages` to detect scanned PDFs and reject them in v1 (no OCR).
4. **URL:** fetch the page on the server with SSRF guards. Parse it with **jsdom**, extract the article with **@mozilla/readability** (Apache-2.0, mature), and sanitize the HTML with DOMPurify. Store the extracted article as the Source text, and have the viewer show our stored copy, not the live page. **Defuddle** (MIT, built-in Markdown output) is a drop-in alternative if Readability's output proves too aggressive, but its README calls it "very much a work in progress".
5. **Pasted text:** normalize (Unicode NFC, `\n` line endings) and store it as-is. Segment it the same way.

## Key facts from primary sources

### Claude citations (Anthropic docs)

Source: <https://platform.claude.com/docs/en/build-with-claude/citations>

- There are three citable document types, each with its own location format:
  - **PDF:** "page number range (1-indexed)". Citation `type: "page_location"` with `start_page_number` and `end_page_number` ("exclusive").
  - **Plain text:** "character index range (0-indexed)". `type: "char_location"` with `start_char_index` and `end_char_index`, exclusive end.
  - **Custom content:** "content block index range (0-indexed) corresponding to the original content list provided". `type: "content_block_location"` with `start_block_index` and `end_block_index`, exclusive end. The source shape is `{"type":"content","content":[{"type":"text","text":"..."}]}`.
- Chunking: "For PDFs: Text is extracted … and content is chunked into sentences." "For plain text documents: Content is chunked into sentences." "For custom content documents: Your provided content blocks are used as-is and no further chunking is done."
- Granularity tip: "if you want Claude to be able to cite specific sentences from your RAG chunks, you should put each RAG chunk into a plain text document. Otherwise, if you do not want any further chunking … put RAG chunks into custom content document(s)."
- Scans: "PDFs that are scans of documents and do not contain extractable text are not citable." "Citing images from PDFs is not currently supported."
- `title` and `context` "are passed to the model but not used toward cited content". `context` can hold metadata as text or stringified JSON. We can use it for the Source id.
- `cited_text` "does not count toward output tokens", and it is not counted as input when it is passed back in later turns.
- Citations work with prompt caching (put `cache_control` on the document blocks), token counting and batches.
- Citations **cannot** be combined with structured outputs (`output_config.format`). That combination returns a 400 error.
- Citations must be enabled on all documents in a request or on none of them.
- .docx and .xlsx files must be converted to plain text first. .md and .csv files can be sent as `text/plain`.

Source: <https://platform.claude.com/docs/en/build-with-claude/search-results>

- A `search_result` block has `source`, `title` and `content: [{type:"text",…}]`. Citations come back as `type: "search_result_location"` with `search_result_index`, `start_block_index` and `end_block_index`. These blocks can be returned from a tool or passed as top-level content. That makes them a good fit if #2 retrieves chunks rather than sending whole Sources.

### Claude PDF support

Source: <https://platform.claude.com/docs/en/build-with-claude/pdf-support>

- PDF sources can be a URL, base64 data or a Files API `file_id`.
- Limits: the maximum request size is "128 MB on the first-party Claude API". The maximum is "600 [pages] (100 when the request's context window is under 1M tokens)". Encrypted and password-protected PDFs are not supported.
- "The system converts each page of the document into an image. The text from each page is extracted and provided alongside each page's image." "Each page typically uses 1,500–3,000 tokens."
- So native PDF documents give **page-level** citation locations only, with no offsets inside the page. Every page is also billed as image tokens.

### PDF text extraction (TypeScript)

| Library | License | Engine | Per-page text | Positions | Notes |
|---|---|---|---|---|---|
| **unpdf** ([repo](https://github.com/unjs/unpdf)) | MIT | Serverless PDF.js build (README: "built from PDF.js v6.4.299") | `extractText(data)` returns `text: string[]` (one per page) unless `mergePages` | `extractTextItems` returns `str, x, y, width, height, fontSize, fontFamily, dir, hasEOL` | `inspectPages` reports `textLength`, `imageCoverage` and more, which flags scans. `definePDFJSModule` swaps in `pdfjs-dist`. Node 24+. |
| **pdf-parse v2** ([repo](https://github.com/mehmet-kozan/pdf-parse)) | Apache-2.0 | Appears to be PDF.js (inferred from worker and exception names; the README does not say) | `getText({ partial })` | Not documented | Also tables and screenshots. A per-page text array is not shown in the README. |
| **pdfjs-dist** ([repo](https://github.com/mozilla/pdf.js)) | Apache-2.0 | PDF.js itself | `page.getTextContent()` returns `TextContent` | Text items carry `str, dir, transform, width, height, fontName, hasEOL` (used in `src/display/text_layer.js`) | Exports `TextLayer` (`constructor({ textContentSource, container, viewport })`) for a selectable text overlay in the viewer. `getTextContent` replaces all whitespace with U+0020 ([API](https://mozilla.github.io/pdf.js/api/draft/module-pdfjsLib-PDFPageProxy.html)). |
| **mupdf.js** ([repo](https://github.com/ArtifexSoftware/mupdf.js)) | **AGPL-3.0** or commercial | MuPDF (WASM) | `toStructuredText().asText()` | Rich bounding boxes, `page.search()` returns quads | AGPL applies to network services, so it would force our app to be AGPL. Strong extraction, but its license is the cost. |

None of these libraries does OCR.

Why use unpdf and pdfjs-dist together: both are PDF.js. Text items extracted on the server and items rendered by `TextLayer` in the browser come from the same algorithm. So a stored "page N, items i..j" or "page N, chars a..b in the page's joined item text" can be highlighted by walking the `TextLayer`'s spans. Version drift between the two could shift item boundaries, so pin the versions. As a fallback, re-locate the segment text on the page by string search.

### URL readability extraction (TypeScript)

| Library | License | API | Output | Notes |
|---|---|---|---|---|
| **@mozilla/readability** ([repo](https://github.com/mozilla/readability)) | Apache-2.0 | `new Readability(doc).parse()` | `title, content (HTML), textContent, length, excerpt, byline, dir, siteName, lang, publishedTime` | Needs a DOM in Node (jsdom). The README "strongly" recommends DOMPurify on the output for untrusted input. `parse()` mutates the DOM. `isProbablyReaderable()` is a quick pre-check. |
| **defuddle** ([repo](https://github.com/kepano/defuddle)) | MIT | `Defuddle(document, url, { markdown: true })` from `defuddle/node` (linkedom or jsdom) | `content` (HTML or Markdown), `title, author, published, site, wordCount, schemaOrgData …` | "More forgiving, removes fewer uncertain elements". README: "very much a work in progress". ESM only. Can call an external API for X/Twitter pages (`useAsync: false` disables it). |
| **jsdom** ([repo](https://github.com/jsdom/jsdom)) | MIT | DOM for Node | n/a | Scripts in the HTML are not executed by default. |
| **turndown** ([repo](https://github.com/mixmark-io/turndown)) | MIT | `new TurndownService().turndown(html)` | Markdown | Only needed if we want Markdown from Readability. Tables need `turndown-plugin-gfm`. |

## How this fits the citation mechanism (and #2)

| Option | Location Claude returns | Can it open the exact passage? | Cost / constraints |
|---|---|---|---|
| A. Raw PDF as `document` (base64 or `file_id`) | `page_location` (page range) + `cited_text` | Page only. The passage must be found by fuzzy-matching `cited_text` against the page text. | 1.5–3k tokens per page (image + text). 600-page cap. Not usable for URL or pasted Sources. |
| B. Our text as `text/plain` document | `char_location` into exactly the string we sent | Yes, if the string we send is our stored text (or a slice with a known offset) | Sentence-level granularity for free. The PDF page is recovered from our segment table. |
| **C. Our segments as custom content or `search_result` blocks** | Block index range | **Yes, deterministically:** block index → segment → page + char range | We control the granularity. Use sentence segments (for example `Intl.Segmenter` with `granularity: "sentence"`) to match B's precision, or paragraphs for fewer, larger citations. Works for whole-Source and retrieved-chunk designs. |

Recommended: **C**. B is acceptable for whole-document sends. A is a fallback for PDFs we cannot extract text from, but scanned PDFs are not citable even in A, so it adds little.

## Proposed stored shape (sketch)

```ts
type Source = { id; notebookId; kind: "pdf" | "url" | "text"; title; text: string; pageCount?: number; url?: string; contentHtml?: string };
type Segment = { sourceId; ordinal: number; charStart: number; charEnd: number; page?: number; pageCharStart?: number; pageCharEnd?: number };
```

A Citation stores `(sourceId, segment ordinal range)` and resolves to a highlight: PDF pages through the TextLayer, URL and pasted text through character ranges over the stored text.

## Trade-offs and risks

- **We own extraction quality.** With option C, Claude sees only our PDF.js text, not the page images. Multi-column layouts, tables and figures can come out garbled, and charts are invisible. Option A sees images but cites by page only. A later hybrid is possible: send page images as plain image blocks, uncited, next to the cited text blocks.
- **Scanned PDFs:** none of the TS libraries does OCR, and Claude cannot cite scans either. v1 should detect them (`inspectPages`) and refuse them with a clear message.
- **Whitespace and normalization:** `getTextContent` collapses whitespace to spaces. Normalize once at ingestion and compute every offset on the normalized text. Never recompute offsets on raw text.
- **Viewer alignment:** server and client PDF.js versions must match, or highlights drift. String-search fallback mitigates this.
- **URL fetching** is an SSRF surface: block private and loopback ranges, enforce timeouts and size caps, and follow only a few redirects. Pages that need JavaScript to render, or that sit behind paywalls, extract poorly with jsdom. Accept that in v1, and show a "could not extract" error when Readability returns null or very short text.
- **Licenses:** stay with MIT and Apache-2.0 libraries. Avoid mupdf.js unless the project accepts AGPL.
- **Structured outputs:** citations cannot be combined with `output_config.format`. Studio outputs that need JSON must either run without citations or use the docs' "field: value lines" pattern.

## Unverified / open

- pdf-parse v2's exact per-page API, and whether it is built on PDF.js, were not confirmed from its README. This does not affect the recommendation.
- Whether the published `pdfjs-dist` npm entry re-exports `TextLayer` the same way the source does should be checked in `node_modules` when we build the viewer (the source `src/pdf.js` exports it).
- Readability versus Defuddle quality on our real target pages has not been measured. A one-hour spike on about 10 URLs would settle it.
