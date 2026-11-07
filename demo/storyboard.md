# Storyboard: the Loom video

About **8½ minutes**, narrated in **German** (engineering terms stay as they are), recorded
against the live deployment with the real API key, in several takes cut together in Loom.
Decided in issue #24; every question asked in the video is in [`evals.json`](evals.json)
(the `scene` field), so the demo path is checked against the real API before recording.

| Time | Part |
| --- | --- |
| 0:00–0:30 | Intro: who, what, the live app |
| 0:30–5:30 | Product |
| 5:30–8:00 | Engineering and DevOps |
| 8:00–8:30 | Trade-offs, upgrade paths, what was cut |

## Product scenes

In MVP cut order: a cut feature drops its scene and the story still holds.

### P1 Empty → first answer (~60 s)

Create a Notebook, paste [`sources/meine-notizen.md`](sources/meine-notizen.md) as a text Source,
watch it go `processing → ready`.

- Ask: *„Ab wann gelten die Pflichten für Hochrisiko-KI-Systeme?"* (`p1-hochrisiko-fristen`).
  The answer streams in; click an amber Citation → the reader opens on the highlighted Passage.
- Ask the "not covered" question: *„Wie hoch sind die Strompreise für Rechenzentren in
  Deutschland?"* (`p1-nicht-abgedeckt`). The answer says the Sources don't cover it.

### P2 PDF + URL (~60 s)

Add the KI-MIG PDF and the Wikipedia URL live (see [`sources.md`](sources.md)), show
`processing → ready`. Switch the Wikipedia Source off and ask:

- *„Welche Behörde überwacht in Deutschland den Markt für KI-Systeme?"* (`p2-marktueberwachung`).
  The Citations land in KI-MIG and the notes only, none in the switched-off Source.

### P3 Cross-source answer → Note (~45 s)

Switch Wikipedia back on. Ask a question that needs several Sources:

- *„Welche Fristen gelten für Hochrisiko-KI-Systeme, wer überwacht sie in Deutschland, und was
  bedeutet das für mein Projekt?"* (`p3-quellenuebergreifend`). Citations land in Wikipedia,
  KI-MIG and the notes.

Save the answer as a Note; click a Citation inside the Note.

### P4 Agent run (~90 s)

Switch the composer to Agent and give it the task (`p4-agent-umsetzung`):

> *„Wie ist der aktuelle Stand der Umsetzung der KI-Verordnung in Deutschland? Füge eine aktuelle
> offizielle Quelle hinzu und halte die Zuständigkeiten in einer Notiz fest."*

Expected Steps: web search → adds the Bundesnetzagentur press release of 29.07.2026 as a URL
Source → writes a Note → final answer citing KI-MIG § 4 and the new Source.

### P5 Studio Briefing (~30 s)

Generate a Briefing from the enabled Sources and scroll through it.

### P6 Optional (~30 s)

Audio Overview, only if the stretch was built; otherwise the time goes to engineering.

## Engineering scenes

1. **Repo tour** (~30 s): `src/modules` boundaries, the `llm` boundary and its fake, the three
   ADRs in `docs/adr/`.
2. **Sandcastle** (~10 s): issue → agent → PR loop.
3. **PR → main → production** (~60 s): PR-title check, CI jobs, `code-review` output, the deploy
   job seeing `/api/health` report the new commit.
4. **Automatic rollback** (~30 s, pre-recorded): a real PR that breaks `/api/health`, merged then
   reverted; Swarm rolls back and the CI deploy goes red.
5. **SSRF rejection** (~5 s): add `http://169.254.169.254` as a URL Source → clear German error.
6. **Status page and uptime check** (~30 s); the backup runbook is only mentioned.

## Polish tiers

- **Must be polished and reliable:** Citation → Passage highlight, Chat streaming, the Agent Step
  timeline, Source status transitions, the three-panel layout.
- **May be rough:** Notebook rename/delete, the Notes editor beyond save + Citation click,
  states off the demo path, Briefing styling.
- **Tested but not shown:** token-cap rejection, scanned-PDF rejection.

## Recording

- A fallback Notebook is built **by hand in the UI** before recording. Visitors are cookie-bound
  and there is no production seed script; `pnpm demo:seed` is for local and e2e use only.
- Recording budget: about $3–5 of API credit.
- Attribution goes into the video description; see [`README.md`](README.md).
