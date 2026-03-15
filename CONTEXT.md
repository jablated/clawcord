# CONTEXT.md — Session Log

> **Instructions for agents:** Update this file at the end of every session.
> Summarize what was completed, what's blocked, and proposed next steps.
> Keep it concise — this is the handoff doc, not a changelog.

---

## Last Session: 2026-03-15

### Completed
- Project created as `clawcord` — Discord voice bridge for OpenClaw
- Full TypeScript project scaffold (strict mode, ESM, Vitest, ESLint)
- **Phase 1 — Bot skeleton:**
  - `src/config.ts` — env var loading and validation
  - `src/bot.ts` — Discord client with `/join` and `/leave` slash commands
  - Bot joins/leaves voice channels on command, graceful shutdown
- **Phase 2 — Audio pipeline (inbound):**
  - `src/voice/vad.ts` — Voice Activity Detector using Discord's silence frames (0xF8, 0xFF, 0xFE) + 700ms fallback timer
  - `src/voice/receiver.ts` — captures per-user Opus streams, uses VAD to emit `utterance` events
  - `src/voice/transcribe.ts` — Whisper STT stub (Opus→WAV conversion is stubbed, API call wired)
  - `src/gateway/client.ts` — OpenClaw Gateway WebSocket client with reconnect logic
- Unit tests: `tests/voice/vad.test.ts`, `tests/gateway/client.test.ts`
- TypeScript compiles clean (`tsc --noEmit` passes)
- Pushed to https://github.com/jablated/clawcord

### Blockers
- **Opus → WAV conversion is stubbed** — `transcribe.ts` has a TODO where `prism-media` needs to decode Opus frames to PCM and write a proper 16kHz mono WAV buffer before Whisper can process it. This is the critical missing piece for Phase 3.
- **Bot not yet deployed/tested live** — needs a real Discord bot token + test server. See `.env.example`.
- **npm PATH issue on this host** — running `npm test` directly fails with Node path errors; use `source ~/.nvm/nvm.sh && nvm use default && npx vitest run` instead.

### Proposed Next Steps (Phase 3)

1. **Fix Opus → WAV pipeline** (`src/voice/transcribe.ts`)
   - Use `prism-media` to transcode Opus frames to raw PCM
   - Write a WAV header (16kHz, mono, 16-bit) and pass to Whisper
   - Test with a real `.ogg` file (we have one at `~/.openclaw/media/inbound/`)

2. **Wire up the full loop** (`src/voice/receiver.ts` + `src/gateway/client.ts`)
   - On `utterance` event: transcribe → send to OpenClaw Gateway → get response
   - Feed response text to TTS → stream audio back into voice channel

3. **Create `src/voice/speaker.ts`**
   - OpenAI TTS (or local Kokoro) → audio buffer
   - Stream into Discord voice channel via `AudioPlayer` + `createAudioResource`

4. **Live test in a Discord server**
   - Need: bot token, client ID, test server with voice channel
   - Register slash commands, join a channel, speak, verify transcription in logs

5. **Docker compose** for deployment alongside OpenClaw on a LAN host

---

*Next agent: read CLAUDE.md + this file before touching any code.*
