# clawcord 🎙️💀

> Discord voice bridge for [OpenClaw](https://github.com/openclaw/openclaw). Speak in a voice channel, get an AI response back.

## What It Does

clawcord is a Discord bot that sits in a voice channel and connects it to an OpenClaw AI agent:

```
You speak → Discord → Whisper (STT) → OpenClaw Agent → TTS → You hear a response
```

- Joins/leaves voice channels on command (`/join`, `/leave`)
- Detects when you stop speaking (VAD — silence frame detection + timer fallback)
- Transcribes your speech via OpenAI Whisper
- Relays the text to your OpenClaw Gateway and gets an AI response
- Speaks the response back into the voice channel via TTS

## Status

| Phase | Status | Description |
|---|---|---|
| 1 — Foundation | ✅ Done | TypeScript setup, bot skeleton, slash commands |
| 2 — Audio Pipeline | ✅ Done | VAD, Opus capture, transcriber stub, Gateway client |
| 3 — Full Loop | 🚧 Next | Opus→WAV, wire STT→Gateway→TTS, live audio output |
| 4 — TTS Outbound | 📋 Planned | Speak responses back into voice channel |
| 5 — Polish | 📋 Planned | Docker, `/status` command, local TTS (Kokoro) option |

## Requirements

- Node.js 20+ (LTS)
- An OpenClaw Gateway running locally (default: `ws://localhost:18788`)
- Discord bot with voice permissions
- OpenAI API key (for Whisper STT + TTS)

## Setup

```bash
# Clone and install
git clone https://github.com/jablated/clawcord
cd clawcord
npm install

# Configure
cp .env.example .env
# Edit .env with your tokens

# Dev mode
npm run dev
```

## Environment Variables

```bash
DISCORD_BOT_TOKEN=       # From Discord Developer Portal
DISCORD_CLIENT_ID=       # Your bot's Application ID
OPENCLAW_GATEWAY_URL=ws://localhost:18788  # OpenClaw Gateway address
OPENCLAW_GATEWAY_TOKEN=  # Optional auth token
OPENAI_API_KEY=          # For Whisper STT and TTS

# Optional: swap in a local TTS server (e.g. Kokoro)
# TTS_BASE_URL=http://192.168.0.x:8880/v1
# TTS_VOICE=af_heart
```

## Discord Bot Setup

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new Application
3. Under **Bot**: enable **Server Members Intent** and **Message Content Intent**
4. Under **OAuth2 → URL Generator**: select scopes `bot` + `applications.commands`, permissions `Connect`, `Speak`, `Use Voice Activity`
5. Invite the bot to your server with the generated URL
6. Copy the bot token to your `.env`

## Development

```bash
npm run dev          # Watch mode
npm test             # Run tests
npm run typecheck    # TypeScript check
npm run lint         # ESLint
```

## Architecture

```
src/
  bot.ts              Discord client + slash commands
  config.ts           Env var loading
  voice/
    receiver.ts       Per-user Opus stream capture
    vad.ts            Voice activity detection
    transcribe.ts     Whisper STT
    speaker.ts        TTS → outbound audio (Phase 4)
  gateway/
    client.ts         OpenClaw Gateway WebSocket client
tests/
  voice/vad.test.ts
  gateway/client.test.ts
```

## How VAD Works

Discord sends 5 silent Opus frames (`0xF8 0xFF 0xFE`) when a user stops speaking. clawcord detects this pattern and treats it as the end of an utterance. A 700ms timer fires as a fallback in case silence frames aren't received. The buffered frames are then sent to Whisper.

## Roadmap / Open Questions

- **Multi-user:** Queue utterances per user, serialize to Gateway
- **Wake word:** Currently responds to everything — add optional wake word support
- **Local STT:** Swap Whisper API for local Whisper (faster, no cost)
- **Local TTS:** Kokoro on GTX 1070 for near-zero latency responses
- **Bot identity:** Configurable via OpenClaw Gateway session system prompt

## Related

- [OpenClaw](https://github.com/openclaw/openclaw) — the AI agent platform this bridges to
- [Local TTS Plan](~/.openclaw/workspace/plans/active/2026-03-15-local-tts.md) — Kokoro on GTX 1070
