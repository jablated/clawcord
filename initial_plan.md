# clawcord — Initial Plan

**Project:** Discord Voice Bridge for OpenClaw  
**Status:** planning  
**Created:** 2026-03-15

---

## Objective

Build a Node.js/TypeScript Discord bot that bridges voice channels to the OpenClaw
agent system. Users speak in a Discord voice channel; the bot transcribes speech,
relays it to OpenClaw, and speaks the response back — creating a real-time
voice conversation with the AI.

---

## Architecture

```
Discord Voice Channel
    │
    ▼ (Opus audio stream per user)
@discordjs/voice  ←─── receiver.ts
    │
    ▼ (Opus frames)
prism-media ──────────── vad.ts (silence detection → utterance boundary)
    │
    ▼ (16kHz mono PCM/WAV)
OpenAI Whisper ──────── transcribe.ts
    │
    ▼ (text)
OpenClaw Gateway WS ─── gateway/client.ts
    │
    ▼ (agent response text)
TTS (OpenAI/Edge) ───── speaker.ts
    │
    ▼ (audio stream)
@discordjs/voice ──────────────────────────── back to Discord
```

---

## Tech Stack

| Layer | Choice | Rationale |
|---|---|---|
| Language | TypeScript (strict) | `@discordjs/voice` is written in TS; better type safety for audio stream types |
| Runtime | Node.js 20 LTS | Stable, nvm-managed, matches OpenClaw's env |
| Discord | discord.js v14 + @discordjs/voice | Official library, most maintained |
| STT | OpenAI Whisper API | Best accuracy, already have key. Local Whisper possible later |
| TTS | OpenAI TTS (nova voice) | Low latency, already have key. Kokoro local option in future |
| Gateway | WebSocket (ws) | Direct connection to OpenClaw Gateway at ws://localhost:18788 |
| Testing | Vitest | Fastest for ESM TypeScript, excellent mocking, active community |
| Linting | ESLint + @typescript-eslint | Standard |

---

## Milestones

### Phase 1 — Foundation
- [ ] Repo setup: TypeScript, ESLint, Vitest, package.json scripts
- [ ] Bot skeleton: Discord client, slash command `/join` and `/leave`
- [ ] Bot joins/leaves voice channel on command
- [ ] Basic logging (pino or console)

### Phase 2 — Audio Pipeline (Inbound)
- [ ] Capture per-user Opus stream via `@discordjs/voice` receiver
- [ ] Decode Opus → PCM via prism-media
- [ ] VAD: detect utterance boundaries (silence frame detection + 500ms timer fallback)
- [ ] Buffer utterance audio, export as 16kHz mono WAV
- [ ] Unit tests for VAD logic (mocked streams)

### Phase 3 — STT + Gateway
- [ ] Send WAV to OpenAI Whisper, get transcript
- [ ] OpenClaw Gateway WS client (connect, send `agent.message`, receive response)
- [ ] Session management: one session per user per voice channel
- [ ] Unit tests: mocked Whisper + mocked Gateway

### Phase 4 — TTS + Outbound Audio
- [ ] Convert agent response text → audio via OpenAI TTS
- [ ] Stream audio into Discord voice channel via `@discordjs/voice` AudioPlayer
- [ ] Queue multiple responses if they overlap
- [ ] Unit tests: mocked TTS output

### Phase 5 — Polish
- [ ] `/status` slash command (who's active, session info)
- [ ] Configurable STT/TTS provider (swap Whisper for local, OpenAI TTS for Kokoro)
- [ ] Error handling: graceful degradation when Gateway unreachable
- [ ] Docker compose for deployment alongside OpenClaw
- [ ] README with setup guide

---

## Open Questions

1. **Multi-user handling:** If two people speak at once, do we interleave or queue? Probably queue per-user, serialize to Gateway.
2. **Local Whisper:** Worth setting up from the start or defer? Defer — OpenAI API is fast enough and simpler to start.
3. **Bot identity:** Should the bot respond as "Elbereth" or a neutral voice? Configurable via Gateway session system prompt.
4. **Wake word:** Do we respond to everything said, or require a wake word? Start with everything (push-to-talk style), add wake word later.

---

## Resources

- [@discordjs/voice docs](https://discordjs.guide/voice)
- [OpenAI Whisper API](https://platform.openai.com/docs/api-reference/audio)
- [OpenClaw Gateway WS protocol](~/.openclaw/workspace/plans/) — infer from existing chat.py impl
- [Vitest docs](https://vitest.dev)

---

*Plan ID: 2026-03-15-clawcord*
