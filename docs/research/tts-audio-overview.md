# Research: TTS provider for Audio Overview

Ticket: [#5](https://github.com/denniskasper/my-notebook/issues/5) · Map: [#1](https://github.com/denniskasper/my-notebook/issues/1) · Researched 2026-11-02

**Question.** Which text-to-speech provider should voice the two-speaker **Audio Overview**? This note compares the options on German voice quality, two distinct voices, cost per minute, latency and API shape, and licensing. It also covers how Claude scripts the dialogue and how the audio gets stitched together.

**Sources.** Official provider docs and pricing pages, plus the model cards and READMEs of the open models, all read on 2026-11-02. None of the pages carries a date stamp unless one is noted. Where a page did not render, the fact is marked *unverified*.

## Recommendation

**Use Gemini TTS (`gemini-3.8-flash-tts`) through the Gemini API, in multi-speaker mode with two prebuilt voices.** Keep **ElevenLabs Text to Dialogue (Eleven v4)** as the drop-in alternative if Gemini's German sounds worse in a listening test.

Why:

- **It produces two speakers natively in one request.** Single-request multi-speaker generation "supports up to 2 speakers using prebuilt voices", which is exactly the Audio Overview format.
- **German is GA.** Gemini TTS supports German, and there are 30 prebuilt voices to pick a contrasting pair from.
- **It is free for the demo, and cheap if paid.** The free tier is "Free of charge". The paid rate is $9 per 1M audio tokens at 25 tokens per second, which works out to **≈ $0.014 per minute**, or about $0.14 for a 10-minute overview. That keeps TTS cost negligible next to the ~$20 Claude budget.
- **One provider key, server-side, with no new infrastructure.** It needs no GPU on the VPS.

Trade-offs to accept:

- Free-tier content "used to improve our products". That is fine for demo sources, but say so in the README. Enabling billing switches this off.
- Free-tier RPM/RPD for the TTS models is not published. It is only visible per project in AI Studio. A burst of generations could hit 429s, so the Audio Overview job needs a retry with backoff.
- The 3.8 prices double on 2027-01-01 to $18 per 1M audio tokens (≈ $0.027/min). That is still cheap.
- OpenAI's usage policy requires telling users that a TTS voice is AI-generated. Gemini has no equivalent rule on the pages read, but the UI should still label the Audio Overview as AI-generated ("KI-generiert").

## Comparison

| Provider / model | German | Two voices in one call | Cost per minute (≈) | Free tier | Licensing notes |
|---|---|---|---|---|---|
| **Gemini `gemini-3.8-flash-tts`** (GA) | Yes | **Yes, max 2 speakers** | **$0.014** (2026), $0.027 (2027) | Yes, "Free of charge", content used for training | Standard Gemini API terms |
| Gemini `gemini-3.8-flash-lite-tts` | Yes | Yes | $0.009 (2026) | Yes | same |
| ElevenLabs Eleven v4 / v3, Text to Dialogue | Yes | **Yes, per-turn `voice_id`**, up to 10 voices | $0.08 (v4/v3/Multilingual v2), $0.04 (Turbo/Flash) | 10k credits/month ≈ 10 min, **no commercial licence** | Commercial use from Starter ($6/month) |
| OpenAI `gpt-4o-mini-tts` | Works, but "voices are currently optimized for English" | No, one voice per request | not stated per minute; $0.60/1M text in + $12/1M audio out | None | **Deprecated, shuts down 2027-01-06**; must disclose that the voice is AI |
| Azure Neural / DragonHD | Yes: DragonHD Seraphina and Florian (GA), plus multilingual voices | Multi-talker voice exists **but en-US only, Preview** | *unverified* (price cells did not render; a quotas example uses "$15 per million characters") | 0.5M characters/month (F0) | Standard terms; custom voice is limited access |
| Google Cloud TTS Chirp 3 HD | Yes (de-DE GA) | No, one voice per request | *unverified* (pricing page did not render) | *unverified* | — |
| Self-hosted Piper | 8 de_DE voices (e.g. thorsten, kerstin, ramona) | No, but can synthesize per turn | VPS CPU only | — | Engine GPL-3.0; voice repo MIT, check each voice |
| Self-hosted XTTS-v2 | Yes (17 languages) | No (cloning, not dialogue) | needs GPU | — | Coqui Public Model License (not open commercial) |
| Dia (Nari Labs) | **No, English only** | Yes (`[S1]`/`[S2]`) | GPU (~4.4 GB VRAM) | — | Apache-2.0 |
| Kokoro-82M | **No German** | No | — | — | Apache-2.0 |
| VibeVoice | TTS code removed by Microsoft; Realtime-0.5B has only "experimental" German, single voice | — | — | — | MIT; "not recommended" for real-world use |

The per-minute cost is derived. For Gemini, 25 audio tokens per second makes 1,500 tokens per minute; at $9 per 1M that is $0.0135. For ElevenLabs, the pricing page itself states "$0.08/minute" with the conversion "10,000 ≈ 10 min" (about 1,000 characters per minute).

### Gemini TTS: details

- **Models.** `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts`, both supporting single-speaker, multi-speaker, voice design and voice replication. The older `gemini-3.1-flash-tts-preview` and `gemini-2.5-pro-preview-tts` are also listed. The Cloud docs call the 3.8 models "Generally Available (GA)". Sources: [AI Studio speech generation](https://aistudio.google.com/docs/speech-generation), [Cloud Gemini-TTS](https://docs.cloud.google.com/text-to-speech/docs/gemini-tts).
- **Request shape.** `speech_config.speakers = [{speaker: "Anna", voice: "Kore"}, {speaker: "Ben", voice: "Puck"}]`. Each turn is a content item annotated with `speech_metadata` (`speaker`, optional `style`). The Cloud API names the equivalent `multiSpeakerVoiceConfig`. More than two speakers, or custom voices, need one call per turn. Source: AI Studio speech generation.
- **Output.** A unary call returns WAV (RIFF header, 24 kHz, mono, 16-bit PCM). Streaming (`stream: true`) returns headerless `audio/l16` at 24 kHz. Source: AI Studio speech generation.
- **Limits.** "Input token limit: 8,192"; "Output token limit: 16,384". At 25 tokens per second that is ≈ 655 s of audio per request, matching the Cloud doc's "Approximately 655 seconds", beyond which audio is truncated. Sources: [model page](https://aistudio.google.com/docs/models/gemini-3.8-flash-tts), Cloud Gemini-TTS.
- **Pricing.** For the 3.8 Flash TTS model, text input is $0.50 per 1M tokens and audio output $9.00 per 1M tokens until 2026-12-31, then $1.00 and $18.00. For 3.8 Flash-Lite, audio output is $6.00, then $12.00. Batch is half price. The free tier is "Free of charge", with "Content used to improve our products"; on paid, content is "not used". Source: [Gemini pricing](https://aistudio.google.com/docs/pricing). The TTS rows come from a long page that was read partly via extraction.
- **Rate limits.** There is no per-model table; "view active limits in AI Studio". Source: [rate limits](https://aistudio.google.com/docs/rate-limits).
- **Region.** Germany is a supported region, with no free-tier restriction found. Source: [available regions](https://aistudio.google.com/docs/available-regions).

### ElevenLabs: details

- **Text to Dialogue.** `POST /v1/text-to-dialogue` with `inputs: [{text, voice_id}, …]` and `model_id` (default `eleven_v3`; docs "recommend Eleven v4"). Up to 10 unique voices. Supports audio tags such as `[curious]`. `output_format` defaults to `mp3_44100_128`. The docs say to keep the total at "2,000 characters per request" (≈ 2 minutes of audio), so a 10-minute overview needs about 5 requests. Use `previous_request_ids`/`next_request_ids` for continuity across them. A WebSocket stream is also available. Sources: [Text to Dialogue](https://elevenlabs.io/docs/capabilities/text-to-dialogue), [API reference](https://elevenlabs.io/docs/api-reference/text-to-dialogue/convert).
- **German.** Supported by v4, v3, Multilingual v2 and Flash v2.5, but not Flash v2 (English only). Source: [models](https://elevenlabs.io/docs/overview/models).
- **Pricing.** The API is billed per 1K characters: v4/v3/Multilingual v2 at $0.08, Turbo/Flash at $0.04. The free plan gives 10k credits per month. The "Commercial License" starts with the Starter plan ($6/month), and the FAQ says "commercial usage rights are only available with paid plans". Sources: [API pricing](https://elevenlabs.io/pricing/api), [pricing](https://elevenlabs.io/pricing).
- **Latency.** Flash ~75–100 ms, v4 Turbo ~100 ms median (the pricing and models pages give slightly different figures). Latency does not matter for an asynchronous Studio output.

### OpenAI: details

- `tts-1` ($15 per 1M characters), `tts-1-hd` ($30 per 1M characters) and `gpt-4o-mini-tts` are **deprecated and shut down 2027-01-06**. The successor (`gpt-realtime-2.1-mini`) "isn't a supported model for `/v1/audio/speech`". This rules OpenAI out for anything meant to outlive the demo.
- There are 13 voices, and "voices are currently optimized for English". It is one voice per request.
- "Our usage policies require you to provide a clear disclosure to end users that the TTS voice they are hearing is AI-generated."
- Sources: [TTS guide](https://developers.openai.com/api/docs/guides/text-to-speech), [pricing](https://developers.openai.com/api/docs/pricing).

### Azure: details

- F0 gives "0.5 million characters free per month" for Neural voices. The paid price cells did not render.
- German HD voices are `de-de-Seraphina:DragonHDLatestNeural` and `de-de-Florian:DragonHDLatestNeural` (GA).
- Multi-talker (`<mstts:dialog>`/`<mstts:turn>`) exists only as `en-us-MultiTalker-Ava-Andrew`, in Preview. That leaves no native German dialogue.
- A real-time request is capped at 10 minutes of audio. The batch synthesis API, which can go longer, is not available on F0.
- Sources: [pricing](https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/), [HD voices](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/high-definition-voices), [quotas](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-services-quotas-and-limits), [SSML voice](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/speech-synthesis-markup-voice).

### Self-hosted: details

- **Piper** is the only realistic CPU-only German option. It has 8 de_DE voices, the engine is GPL-3.0, the voice repo is MIT, and Thorsten's datasets are CC0. It sounds clearly more robotic than the cloud options and has no dialogue mode. Note the README line "The Open Home Foundation is looking for maintainers for Piper!" Sources: [piper1-gpl](https://github.com/OHF-Voice/piper1-gpl), [piper-voices](https://huggingface.co/rhasspy/piper-voices), [Thorsten-Voice](https://github.com/thorstenMueller/Thorsten-Voice).
- The rest drop out. Dia is English only and needs a GPU ([repo](https://github.com/nari-labs/dia)). Kokoro has no German ([VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)). XTTS-v2 needs a GPU and uses the CPML ([card](https://huggingface.co/coqui/XTTS-v2)). Microsoft removed the VibeVoice TTS code ([repo](https://github.com/microsoft/VibeVoice)).
- A GPU on the VPS is out of scope for a 7-day build, so self-hosting is only a fallback (Piper, per turn).

## Scripting the dialogue with Claude

1. **Script step (Claude).** Feed the notebook's enabled sources, or a summary of them for long notebooks, to Claude. Ask for **structured output**: `{ title, turns: [{ speaker: "A" | "B", text, style? }] }`. Write in German. One host explains, the other asks questions. Target ~1,000 characters per minute, so ~6,000–8,000 characters for a 6–8 minute overview, which stays under one Gemini request's ≈ 655 s ceiling. Store the script, since it can double as a transcript in the UI.
2. **Voice step (Gemini).** Map speakers A and B to two contrasting prebuilt voices (pick by listening; e.g. `Kore` "Firm" + `Puck` "Upbeat"). Send the turns as annotated content items in **one multi-speaker request**. If the script runs longer than about 10 minutes of audio, or a request fails, split it at turn boundaries into chunks of ~3–4 minutes, voice each chunk, and keep the same voice mapping.
3. **Stitch.** Each chunk is 24 kHz mono 16-bit PCM. Strip the WAV headers, concatenate the PCM, write one WAV header, then optionally transcode to MP3/Opus with `ffmpeg` (one line in the Docker image) to shrink the file about 10×. A single chunk needs no stitching. Store the file (DB blob or volume) and serve it to an `<audio>` element.
4. **Job shape.** Run it as an asynchronous background job, a few seconds to a minute or so, with status on the Studio output (pending, ready, failed) and retry with backoff on 429s.

**With ElevenLabs instead,** step 2 becomes `POST /v1/text-to-dialogue` in chunks of ≤ 2,000 characters with `voice_id` per turn, chained with `previous_request_ids`. Step 3 is the same, but with MP3 output, so join it with `ffmpeg -f concat` or request `pcm_24000` and join it like the Gemini audio.

## Open points for the spec

- Do a 1-minute German listening test of Gemini 3.8 Flash TTS against ElevenLabs v4 before committing. It costs nothing on either free tier.
- Decide whether the free tier's training-data use is acceptable for the demo, or whether billing should be enabled (cost ≈ cents).
- Budget guard: count TTS minutes per anonymous session next to Claude tokens.
