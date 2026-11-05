# My Notebook

A NotebookLM-style workspace: you collect sources in a notebook and work with them through source-grounded AI.

## Language

**Notebook**:
A workspace that holds a set of sources, the conversation about them and everything generated from them.
_Avoid_: Project, workspace, folder

**Source**:
A document added to a notebook (PDF, web page or pasted text) that AI answers must be grounded in.
_Avoid_: Document, file, upload

**Passage**:
A short, ordered stretch of a source's text (a paragraph or a few sentences) with a fixed position in that source; the smallest unit a citation can point to.
_Avoid_: Segment, chunk, snippet

**Citation**:
A reference in an AI answer that points to the exact passages of a source it relies on.
_Avoid_: Footnote, reference, link

**Note**:
A piece of text the user keeps in a notebook, written by hand or saved from an AI answer.
_Avoid_: Snippet, bookmark

**Chat**:
The conversation mode for fast questions and answers, grounded only in the notebook's enabled sources and backed by citations.
_Avoid_: Q&A, ask

**Agent**:
The conversation mode in which Claude works through several steps on its own, using tools on the notebook and the web.
_Avoid_: Assistant, bot, copilot

**Agent run**:
One pass of the Agent, from the Visitor's request to its final answer or its end (stopped or limit reached).
_Avoid_: Job, session, task

**Step**:
One action the Agent takes during an Agent run, such as searching the web, reading a source, adding a source or writing a note.
_Avoid_: Tool call, action

**Studio output**:
A structured artifact generated from a notebook's sources, such as a briefing, FAQ, quiz or mind map.
_Avoid_: Report, export, generation

**Audio Overview**:
A Studio output in which two voices discuss the notebook's sources like a podcast.
_Avoid_: Podcast, audio summary

**Visitor**:
The anonymous person who owns notebooks, recognized again by a cookie instead of an account.
_Avoid_: User, session, account

**Daily allowance**:
The amount of AI spend one Visitor may use per day (UI: *Tageskontingent*).
_Avoid_: Quota, credit, budget

**Demo budget**:
The overall limit on AI spend for the public demo, per day and in total, shared by all Visitors (UI: *Demo-Budget*).
_Avoid_: Quota, credit, allowance
