# CLAUDE.md - Project Guidelines for AI Agents

## What This Project Is

`clawcord` is a Discord voice bridge for OpenClaw. It lets a Discord bot join
voice channels, transcribe speech (Whisper STT), relay to the OpenClaw Gateway,
and speak responses back (TTS → Discord audio stream).

## Git Commit Messages

Always reference issues in commit messages:
```
feat: add VAD silence detection

Closes #3
```
Prefixes: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `wip`

## Project Structure

```
src/
  bot.ts          - Discord client + slash command registration
  voice/
    receiver.ts   - Inbound audio capture from Discord
    vad.ts        - Voice activity detection (silence → end of utterance)
    transcribe.ts - Whisper STT integration
    speaker.ts    - TTS → outbound audio stream
  gateway/
    client.ts     - OpenClaw Gateway WebSocket client
  config.ts       - Env/config loading
tests/
  voice/          - Unit tests (mocked Discord streams)
  gateway/        - OpenClaw client tests
```

## Language & Tooling

- **TypeScript** — strict mode, ESM modules
- **Runtime:** Node.js 20+ (LTS)
- **Test framework:** Vitest (fast, native ESM, great mocking)
- **Linter:** ESLint + @typescript-eslint
- **Formatter:** Prettier

## Key Dependencies

| Package | Purpose |
|---|---|
| `discord.js` | Discord bot client |
| `@discordjs/voice` | Voice channel join/send/receive |
| `@discordjs/opus` | Opus codec |
| `openai` | Whisper STT + optional TTS |
| `ws` | WebSocket to OpenClaw Gateway |
| `prism-media` | Audio transcoding (Opus → PCM) |

## Testing

```bash
npm test           # run all tests
npm run test:watch # watch mode
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
```

Vitest is configured to mock `@discordjs/voice` — no real Discord connection needed for unit tests.

## Environment Variables

See `.env.example`. Required:
- `DISCORD_BOT_TOKEN`
- `DISCORD_CLIENT_ID`
- `OPENCLAW_GATEWAY_URL` (default: ws://localhost:18788)
- `OPENCLAW_GATEWAY_TOKEN` (optional)
- `OPENAI_API_KEY` (Whisper STT + optional TTS)

## Known Gotchas

- `@discordjs/voice` inbound audio is not officially documented by Discord — treat as best-effort
- Silence detection: Discord sends 5 frames of silence (0xF8, 0xFF, 0xFE) when user stops — use as VAD trigger
- Audio pipeline: Opus (Discord) → PCM (prism-media) → 16kHz mono WAV (Whisper)
- OpenClaw Gateway expects `agent.message` type messages with a session key
