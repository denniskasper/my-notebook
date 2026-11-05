# Demo sources: EU AI Act (KI-Verordnung)

Research date: 2026-11-05. Question: which official German-language sources on the EU AI Act
(Verordnung (EU) 2024/1689) can the Loom demo load as Sources, given that

- PDFs go through `unpdf` text extraction (scanned PDFs are rejected),
- URLs go through jsdom + Readability (HTML only, no JS execution),
- all enabled Sources of a Notebook go to Claude in long context with the Citations API, so they
  should fit comfortably in about 150K tokens, and fewer tokens is better (about $20 of API credit).

Token estimates use about 3.5 characters per token for German text, applied to the character
count of the extracted text (`pdftotext` for PDFs, tag-stripped HTML for pages). Treat them as
±20 %.

## Recommendation

| Role | Source | Size | Est. tokens | Licence |
| --- | --- | --- | --- | --- |
| PDF | KI-MIG, the German AI Act implementing law (gesetze-im-internet.de) | 13 pages, 52.7K chars | ~15K | Public domain (§ 5 Abs. 1 UrhG) |
| URL | German Wikipedia, "Verordnung über künstliche Intelligenz" | ~24.6K chars of body text, ~40.6K with footnotes | ~7K to ~12K | CC BY-SA 4.0 |
| Agent demo (added live) | Bundesnetzagentur press release of 29.07.2026 | ~5.2K chars | ~1.5K | CC BY-ND 4.0 DE |

Total: about 25K to 30K tokens per request with all three enabled, about a sixth of the
150K budget.

Why this combination:

- **Size.** The AI Act itself is about 190K tokens (see below). It is over the budget on its own
  and would use up the API credit fast. KI-MIG plus Wikipedia is about 25K tokens.
- **Licence.** KI-MIG is an official German statute, so it has no copyright protection
  (§ 5 Abs. 1 UrhG). Wikipedia is CC BY-SA 4.0 and needs a short attribution line (below).
  Neither raises a question about showing it in a public video.
- **Up to date.** Both cover the state after the July 2026 changes: the EU "Digital-Omnibus-Verordnung
  zur KI" and the German KI-MIG. The original Official Journal PDF of the AI Act predates the
  Omnibus, so its high-risk dates are no longer current.
- **Citations.** KI-MIG is a short statute numbered by paragraph (§ 1 to § 20), so citations
  land on specific provisions such as "§ 4 KI-Marktüberwachungskammer". Wikipedia gives the EU
  overview: risk classes, bans, timeline, the Omnibus, and implementation in Germany and Austria.
  The two complement each other: the EU picture comes from Wikipedia, German law from the PDF.
- **Agent story.** The Agent task "Wie ist der aktuelle Stand der Umsetzung in Deutschland?" can
  find the Bundesnetzagentur press release, a short, server-rendered page that explains
  KI-MIG in plain language. Answers can then cite both the statute and the authority.

If the PDF in the demo must be the AI Act itself, see the options under "Fallbacks".

## 1. AI Act, official German text (EUR-Lex / Official Journal)

- **Act:** Verordnung (EU) 2024/1689 vom 13. Juni 2024 (Verordnung über künstliche Intelligenz),
  ABl. L, 2024/1689, 12.7.2024.
- **EUR-Lex PDF URL (DE):** `https://eur-lex.europa.eu/legal-content/DE/TXT/PDF/?uri=OJ:L_202401689`
  (ELI: `http://data.europa.eu/eli/reg/2024/1689/oj/deu/pdf`).
- **Direct download that works without a browser:** the Publications Office Cellar, via content
  negotiation: `http://publications.europa.eu/resource/cellar/dc8116a1-3fe6-11ef-865a-01aa75ed71a1`
  with `Accept: application/pdf` and `Accept-Language: deu`. It resolves to
  `…/dc8116a1-3fe6-11ef-865a-01aa75ed71a1.0004.01/DOC_1`.
- **Caveat for the URL importer:** non-browser requests to `eur-lex.europa.eu` (curl, and
  likely the app's server-side fetch) got `HTTP 202` with an empty body, which looks like a bot
  challenge. **Do not use a EUR-Lex URL as a demo URL Source**, and download the PDF manually in
  a browser for the upload.
- **File checked:** 2,698,552 bytes, PDF 1.7, **144 pages**, A4, tagged. Produced by the
  Publications Office (Arbortext + PDFlib), with embedded Unicode fonts (EUAlbertina) and no page
  images. **Text PDF, not scanned.** `pdftotext` extracts clean German text.
- **Extracted size:** 664,344 characters, 83,702 words, so **about 190K tokens**:
  - recitals (Erwägungsgründe 1 to 180): ~280K chars, about 80K tokens
  - articles (Art. 1 to 113): ~332K chars, about 95K tokens
  - annexes (Anhang I to XIII): ~52K chars, about 15K tokens
- **Verdict:** too large for the budget (more than 150K tokens on its own), and outdated in parts:
  Verordnung (EU) 2026/1744 (Digital-Omnibus-Verordnung zur KI, ABl. L 2026/1744 vom 24.7.2026,
  in force on the third day after publication) amended Art. 113, among other provisions. The
  high-risk obligations now apply from **2 December 2027** (Annex III systems) and
  **2 August 2028** (Annex I systems). This was checked in the German Omnibus text from Cellar,
  `http://publications.europa.eu/resource/celex/32026R1744`.
  The Cellar did not return a consolidated version of 2024/1689 (CELEX `02024R1689-2026…`); one
  may not be published yet.
- **Licence:** EU legal acts published by the Publications Office fall under the Commission's reuse policy,
  [Commission Decision 2011/833/EU](http://publications.europa.eu/resource/celex/32011D0833).
  Art. 6: documents are reusable "without application", and the conditions may include the
  obligation "to acknowledge the source" and "not to distort the original meaning". The
  [Commission legal notice](https://commission.europa.eu/legal-notice_en) implements this as
  **CC BY 4.0** unless marked otherwise. Attribution: "© Europäische Union, https://eur-lex.europa.eu/".
  Only the Official Journal version is authentic. (The EUR-Lex legal notice page itself could
  not be fetched because of the same bot challenge, so this rests on the decision and the
  Commission notice.)

## 2. Smaller official German PDFs

| Document | URL | Pages | Chars | Est. tokens | Text PDF | Licence | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **KI-MIG** (KI-Marktüberwachungs- und Innovationsförderungs-Gesetz), consolidated text | https://www.gesetze-im-internet.de/ki-mig/KI-MIG.pdf | 13 | 52,719 | **~15K** | Yes (Apache FOP, generated 28.10.2026) | Public domain: official work under [§ 5 Abs. 1 UrhG](https://www.gesetze-im-internet.de/urhg/__5.html). Naming the source is good practice: "Quelle: www.gesetze-im-internet.de (BMJV/BfJ)". | Ausfertigung 22.07.2026, BGBl. 2026 I Nr. 223, in force 29.7.2026. Sections: Zuständige Behörden, KI-Marktüberwachungskammer (§ 4), Zentrale Anlaufstelle (§ 6), Beschwerdestelle (§ 8), Befugnisse (§ 11), KI-Reallabore (§ 13), Bußgelder (§ 15), Register (§ 20). HTML, XML and EPUB versions are also available on the same page. |
| Bundesnetzagentur, "Hinweispapier KI-Kompetenzen nach Artikel 4 KI-Verordnung" (June 2025) | https://www.bundesnetzagentur.de/DE/Fachthemen/Digitales/KI/_functions/Hinweispapier.pdf?__blob=publicationFile&v=2 | 7 | 15,509 | ~4.4K | Yes | CC BY-ND 4.0 DE (site [Impressum](https://www.bundesnetzagentur.de/DE/Service/Impressum/start.html)): attribution required, no modifications. | Narrow topic (Art. 4, AI literacy), non-binding guidance. Good for a "KI-Kompetenz" question; not an overview. |
| Bundesnetzagentur, factsheet "KI-Verordnung auf einen Blick" (Nov 2025) | https://www.bundesnetzagentur.de/DE/Fachthemen/Digitales/KI/_functions/factsheet.pdf?__blob=publicationFile&v=1 | 2 | 4,426 | ~1.3K | Yes | CC BY-ND 4.0 DE | Too short to be interesting. **Outdated:** says "ab August 2027 vollständig anwendbar", which predates the Omnibus. |
| Bundesnetzagentur, "Weiterführende Informationen zum Themenbereich KI" | https://www.bundesnetzagentur.de/SharedDocs/Downloads/DE/Sachgebiete/Digitales/KI/Hintergrundpapier.pdf?__blob=publicationFile&v=1 | 17 | 23,232 | ~6.6K | Yes (Word export) | CC BY-ND 4.0 DE | From March 2021, before the AI Act was adopted. Do not use. |
| Digital-Omnibus-Verordnung zur KI, (EU) 2026/1744 | `http://publications.europa.eu/resource/celex/32026R1744` (EUR-Lex: CELEX 32026R1744) | not checked (the Cellar returned XHTML only, no PDF stream by negotiation) | ~167K (XHTML text) | ~48K | Official Journal text PDF on EUR-Lex | CC BY 4.0 (Decision 2011/833/EU) | Amending act. Hard to read on its own ("Artikel 113 erhält folgende Fassung…"). Too large for its value in the demo. |

Searched for but not found as suitable German PDFs:

- **EPRS briefings** (European Parliament Research Service) on the AI Act are published in
  English. No German version was found.
- **Commission Q&A/factsheets**: the German pages on digital-strategy.ec.europa.eu are
  HTML and **machine-translated** (the page says so in a notice). No official German PDF factsheet was found.
- **BMDS** (Federal Ministry for Digital Affairs and State Modernisation, which leads on KI-MIG):
  only the draft bill from 11.09.2025 is available as a PDF
  (`bmds.bund.de/…/CDR_Anlage1-250911_RefE_KIVO-Durchführungsgesetz_Entwurf_barrierefrei.pdf`).
  It is outdated now that the final KI-MIG exists.

## 3. German Wikipedia article

- **URL:** https://de.wikipedia.org/wiki/Verordnung_%C3%BCber_k%C3%BCnstliche_Intelligenz
  (title "Verordnung über künstliche Intelligenz", page ID 12539131, not a redirect).
- **Revision checked:** 271572808, 2026-10-24. Wikitext is 51,152 bytes.
- **Length (rendered):** ~24.6K chars and ~3,350 words of body text before "Einzelnachweise",
  so **about 7K tokens**. With the footnotes (~90 references) it is ~40.6K chars, about
  **12K tokens**. Readability keeps the reference list, so expect the higher figure unless the
  importer drops `ol.references`.
- **Content:** Inhalt (risk classes, bans, high-risk systems, KI-Kompetenz, labelling),
  Marktüberwachung, Verfahren (legislative procedure, timeline, **Novellierung** = Omnibus
  2025/2026 with the new dates), Durchführung in den Mitgliedstaaten (**Deutschland: KI-MIG**,
  Österreich), Diskussion in Deutschland.
- **Readability:** the article HTML is server-rendered. The full text is in the initial
  response (381 KB, `div.mw-parser-output`), with no client-side rendering needed. Wikipedia is
  one of the reference cases Readability is tuned for. Expected noise: footnote markers like
  `[1]` inline, the infobox, and navigation boxes. Wikimedia asks for a descriptive `User-Agent`
  on automated requests, so set one in the fetcher.
- **Licence:** text is **CC BY-SA 4.0** (the page footer links
  `creativecommons.org/licenses/by-sa/4.0`).
- **Attribution** (following [Wikipedia:Weiternutzung](https://de.wikipedia.org/wiki/Wikipedia:Weiternutzung)):
  name the article, link it, point to the author list (version history), name the licence and
  link it. Suggested line for the video description and the Source detail view:

  > Quelle: Artikel „Verordnung über künstliche Intelligenz" aus der freien Enzyklopädie
  > Wikipedia (https://de.wikipedia.org/wiki/Verordnung_%C3%BCber_k%C3%BCnstliche_Intelligenz),
  > Lizenz: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.de).
  > Autorenliste: Versionsgeschichte des Artikels.

  ShareAlike only matters if adapted article text is redistributed, for example in the video
  itself. Short quoted citations in AI answers that show and link the source are fine with the
  line above.

## 4. Agent demo: current state of implementation in Germany

Pages a web search for "Umsetzung KI-Verordnung Deutschland Stand" or "KI-MIG Bundesnetzagentur" finds,
all HTML and fetchable without JS:

1. **Bundesnetzagentur press release, 29.07.2026: "Bundesnetzagentur übernimmt zentrale Rolle
   bei der Umsetzung der KI-Verordnung"** (recommended)
   https://www.bundesnetzagentur.de/SharedDocs/Pressemitteilungen/DE/2026/20260729_KI_VO.html
   - Server-rendered: a plain `curl` returns HTTP 200 and 62 KB with the full text in `<main>`.
     Main text is ~5.2K chars / 650 words, about **1.5K tokens**.
   - Content: KI-MIG takes effect on 29.07.2026. The Bundesnetzagentur becomes market surveillance
     authority, central contact point and complaints body. It covers the hybrid model (BaFin, state media
     authorities and other sector regulators keep their areas), the coordination and competence centre, a
     planned KI-Reallabor, and the already running KI-Service Desk.
   - Quirk: the title contains soft hyphens (`&shy;`, e.g. "über­nimmt"), which Readability
     keeps. Strip U+00AD when normalising text so citation quotes match what you search for.
   - Licence: CC BY-ND 4.0 DE (Impressum). Attribution "Quelle: Bundesnetzagentur". Quoting
     unchanged excerpts with the source named is fine; do not present edited text as theirs.
2. **Bundesnetzagentur KI-Service-Desk start page**
   https://www.bundesnetzagentur.de/DE/Fachthemen/Digitales/KI/start_ki.html
   - Server-rendered, with links to subpages (Marktüberwachung, Reallabore, Beschwerdestelle, FAQ).
   - **Weaker for "current state":** the summary still says the rules "gelten vollständig ab
     August 2027" (before the Omnibus), and the "Marktüberwachung" subpage still describes the
     implementing law as future ("soll", "künftig"). Treat it as a backup.
3. Primary legal source, if the agent prefers HTML over PDF: the KI-MIG HTML on gesetze-im-internet.de,
   https://www.gesetze-im-internet.de/ki-mig/BJNR0DF0B0026.html (public domain, server-rendered).
   It overlaps with the recommended PDF, so do not use both in the demo.

**Status as of November 2026, according to the sources above:**

- AI Act in force since 1.8.2024 and applying in stages. Bans and AI literacy since 2.2.2025,
  GPAI obligations since 2.8.2025, general application from 2.8.2026.
- EU Omnibus (VO (EU) 2026/1744) published 24.7.2026 and in force since 27.7.2026. It moves
  the high-risk obligations to 2.12.2027 (Annex III) and 2.8.2028 (Annex I).
- Germany: KI-MIG signed 22.07.2026, BGBl. 2026 I Nr. 223, in force 29.07.2026.
  The Bundesnetzagentur is the central market surveillance authority, contact point and complaints body. An
  independent KI-Marktüberwachungskammer (§ 4 KI-MIG) handles sensitive high-risk areas. BaFin
  and other sector regulators keep their remits. A KI-Reallabor is planned (§ 13 KI-MIG, EU
  deadline 2.8.2027), with no published start date. The KI-Service Desk is live.

## Fallbacks

- **Must show the AI Act itself:** paste selected articles from the EUR-Lex HTML as a
  Pasted Text Source, e.g. Art. 3 (definitions), Art. 5 (prohibited practices), Art. 50
  (transparency), Art. 99 (penalties), Art. 113 (dates). That is about 10K to 20K tokens. Same
  CC BY 4.0 attribution: "© Europäische Union, eur-lex.europa.eu". The full PDF (~190K tokens)
  only fits if the cap is raised and the budget allows it.
- **Second PDF for the demo:** the Bundesnetzagentur "Hinweispapier KI-Kompetenzen" (~4.4K tokens)
  is a cheap, on-topic addition. Show it with the attribution "Quelle: Bundesnetzagentur, CC BY-ND 4.0".

## Sources checked

- Official Journal PDF of VO (EU) 2024/1689 (DE), downloaded from the Cellar and analysed with
  `pdfinfo`/`pdffonts`/`pdftotext`.
- VO (EU) 2026/1744 (DE), Cellar XHTML: http://publications.europa.eu/resource/celex/32026R1744
- Commission Decision 2011/833/EU: http://publications.europa.eu/resource/celex/32011D0833
- Commission legal notice: https://commission.europa.eu/legal-notice_en
- KI-MIG: https://www.gesetze-im-internet.de/ki-mig/ (PDF downloaded and analysed)
- Bundesnetzagentur press release 29.07.2026, KI start page, Marktüberwachung subpage, Impressum,
  and the PDFs listed in section 2 (downloaded and analysed)
- Wikipedia API (`action=query&prop=info|revisions`) and the rendered article HTML;
  https://de.wikipedia.org/wiki/Wikipedia:Weiternutzung
- Commission page "KI-Gesetz" (DE, machine-translated):
  https://digital-strategy.ec.europa.eu/de/policies/regulatory-framework-ai
