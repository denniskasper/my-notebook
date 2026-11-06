# Demo Sources

The four Sources the demo uses. Only the pasted text is committed; the others are added live in
the video (PDF upload, URL, and the Agent's web search). Research behind the choice:
`docs/research/demo-sources.md` on the `research/demo-sources` branch.

The keys (`notizen`, `ki-mig`, `wikipedia`, `bnetza`) are the ones `evals.json` refers to.

| Key | Kind | Source | Est. tokens | Licence |
| --- | --- | --- | --- | --- |
| `notizen` | Pasted text | [`sources/meine-notizen.md`](sources/meine-notizen.md), "Meine Notizen zur KI-Verordnung" | ~0.8K | Written for this repo |
| `ki-mig` | PDF | KI-MIG (KI-Marktüberwachungs- und Innovationsförderungs-Gesetz), consolidated text | ~15K | Public domain (§ 5 Abs. 1 UrhG) |
| `wikipedia` | URL | German Wikipedia, „Verordnung über künstliche Intelligenz" | ~7K–12K | CC BY-SA 4.0 |
| `bnetza` | URL, added by the Agent | Bundesnetzagentur press release of 29.07.2026 | ~1.5K | CC BY-ND 4.0 DE |

## `notizen`: Meine Notizen zur KI-Verordnung

- File: [`sources/meine-notizen.md`](sources/meine-notizen.md). The first line (`# …`) is the
  Source title; everything below it is pasted as the text.
- Facts only this Source has: the risk log with its three fields (Zweck, Risikoklasse,
  Kennzeichnung), first entry on 3 November 2026; the classification of My Notebook and its Agent
  as limited risk; the planned AI notice under the composer.

## `ki-mig`: KI-MIG (PDF)

- Link: https://www.gesetze-im-internet.de/ki-mig/KI-MIG.pdf (13 pages, text PDF). **Not
  committed**: download it before recording.
- Ausfertigung 22.07.2026, BGBl. 2026 I Nr. 223, in force 29.07.2026.
- Attribution (good practice, not required): „Quelle: www.gesetze-im-internet.de (BMJV/BfJ)".

## `wikipedia`: Verordnung über künstliche Intelligenz (URL)

- URL: https://de.wikipedia.org/wiki/Verordnung_%C3%BCber_k%C3%BCnstliche_Intelligenz
  (revision 271572808 of 2026-10-24 was checked).
- Attribution:

  > Quelle: Artikel „Verordnung über künstliche Intelligenz" aus der freien Enzyklopädie
  > Wikipedia (https://de.wikipedia.org/wiki/Verordnung_%C3%BCber_k%C3%BCnstliche_Intelligenz),
  > Lizenz: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.de).
  > Autorenliste: Versionsgeschichte des Artikels.

## `bnetza`: Bundesnetzagentur press release, 29.07.2026 (Agent target)

- URL: https://www.bundesnetzagentur.de/SharedDocs/Pressemitteilungen/DE/2026/20260729_KI_VO.html
- „Bundesnetzagentur übernimmt zentrale Rolle bei der Umsetzung der KI-Verordnung". Its title
  contains soft hyphens (U+00AD), which the URL import strips.
- Attribution: „Quelle: Bundesnetzagentur" (CC BY-ND 4.0 DE: quote unchanged, don't present
  edited text as theirs).

## Local copies for the seed script

`pnpm demo:seed` always adds `notizen`. To also seed the PDF and URL texts before their import
slices exist (or to work offline), put their extracted text into `demo/local/` (git-ignored), one
`.md` or `.txt` file per Source, with the title as the first line (`# KI-MIG`). See
[`README.md`](README.md).
