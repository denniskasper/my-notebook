---
name: quellen-recherche
description: Research the web for new or official material on the notebook's topic, add the best pages as Sources and compare them with the existing Sources in a Note. Use when the task asks to research the web, find current or official sources, or add sources.
---

# Quellen-Recherche

Work through these steps in order. The tools state their own limits; when a tool refuses because a limit is reached, go on with what you have.

1. **Check the Sources.** Call `list_sources`, then `read_source` on the Sources the task is about, to learn the topic and what the notebook already says (and how current it is).
2. **Search.** Use `WebSearch` with one precise query in the language of the topic, for example the subject plus "aktuell" or the name of the responsible authority. Search again only if the results miss the task (at most 3 searches per task).
3. **Read 3–4 candidates.** Pick the most promising results and read them with `read_web_page`. Prefer official sources (ministries, authorities, the EU, parliaments) and recent, dated pages over blogs, aggregators and paywalled pages. Skip pages that fail.
4. **Add the best, at most 2.** Add only the pages that clearly answer the task with `add_url_source`, best first. If the task asks for one Source, add one. Then read each added Source with `read_source` so you can cite it.
5. **Write the Note.** If the task asks for a Note, write one with `create_note`: a short Markdown comparison of what the added Sources say against the existing Sources (what is new, what changed, who is responsible for what), with a `[[p:<id>]]` marker after every statement taken from a Source.
6. **Answer.** Summarise the result in a few sentences with markers, name the added Sources, and list pages you read but did not add as plain links (their URL), never as markers.
