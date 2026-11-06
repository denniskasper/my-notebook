# Demo fixtures

One fixture set feeds the local and e2e seed data, the AI evals and the Loom recording.

| File | What it is |
| --- | --- |
| [`sources/meine-notizen.md`](sources/meine-notizen.md) | The pasted-text Source „Meine Notizen zur KI-Verordnung" (first line is the title) |
| [`sources.md`](sources.md) | All four demo Sources: the PDF link (not committed), the Wikipedia URL, the Bundesnetzagentur press release, with attribution |
| [`evals.json`](evals.json) | About ten eval questions with the Sources to enable, the Sources the Citations must land in and the key facts; validated by `src/demo/evals.ts` |
| [`storyboard.md`](storyboard.md) | The video, scene by scene |
| `local/` | Git-ignored: your local copies of the PDF and URL texts for the seed script |

## Seed a demo Notebook (local and e2e only)

```sh
pnpm demo:seed                       # new Visitor; prints how to set its cookie
pnpm demo:seed --visitor <VISITOR_ID> # into your own Visitor (the `visitor` cookie's value)
```

It creates a Notebook „KI-Verordnung" with the demo notes as a ready text Source, plus one text
Source per `.md`/`.txt` file in `demo/local/` (first line `# <title>`, then the text), for
example the text of the KI-MIG PDF or the Wikipedia article. It prints
`{"visitorId":…,"notebookId":…}` on stdout.

The seed refuses to run with `NODE_ENV=production` or against a database that isn't on
`localhost`. Production gets no seed: the fallback Notebook for the recording is built by hand in
the UI.

## Evals

Every question asked in the video is in `evals.json` (its `scene` names the storyboard scene),
including the one the Sources don't cover (`expectedSources: []`), so the demo path is checked
against the real API before recording. A key fact counts as found if the answer contains any of
its `anyOf` strings.

## Attribution

Use these in the video description; the app itself has no attribution field (the reader links
each Source's origin).

- Wikipedia:

  > Quelle: Artikel „Verordnung über künstliche Intelligenz" aus der freien Enzyklopädie
  > Wikipedia (https://de.wikipedia.org/wiki/Verordnung_%C3%BCber_k%C3%BCnstliche_Intelligenz),
  > Lizenz: CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/deed.de).
  > Autorenliste: Versionsgeschichte des Artikels.

- Bundesnetzagentur press release (CC BY-ND 4.0 DE): „Quelle: Bundesnetzagentur"
- KI-MIG (public domain, § 5 Abs. 1 UrhG): „Quelle: www.gesetze-im-internet.de (BMJV/BfJ)"
