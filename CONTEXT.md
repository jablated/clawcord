# CONTEXT.md — Session Log

> **Instructions for agents:** Update this file at the end of every session.
> Summarize what was completed, what's blocked, and proposed next steps.
> Keep it concise — this is the handoff doc, not a changelog.

---

## Last Session: 2026-03-15

### Completed
- **Phase 3 — Full voice loop, local Whisper + Piper TTS, multi-provider STT/TTS:**
  - `src/config.ts` — added STT/TTS provider env vars with sensible defaults
  - `src/voice/transcribe.ts` — replaced stub with real Opus→WAV pipeline using `prism-media` OpusDecoder + 3:1 decimation downsample to 16kHz mono; multi-provider STT routing (`local-whisper`, `openai-whisper`, `openai-compatible`)
  - `src/voice/speaker.ts` — new file; `Speaker` class with Piper TTS (piper binary → ffmpeg resampling → Discord AudioPlayer) and OpenAI/compatible TTS (MP3 → StreamType.Arbitrary)
  - `src/voice/receiver.ts` — removed EventEmitter abstraction; now directly wires the full loop on `speech_end`: transcribe → gateway sendMessage → speak; logs each step with `[voice]` prefix
  - `src/bot.ts` — `/join` creates all instances (Transcriber, GatewayClient, Speaker, VoiceReceiver), connects gateway, stores per-guild session; `/leave` cleans up all instances
  - `scripts/setup-piper.sh` — installs piper-tts and downloads default voice model
  - `.env.example` — comprehensive comments for all providers
  - `tests/voice/transcribe.test.ts` — 7 unit tests for Transcriber provider routing and error handling
- All 27 tests pass (`vitest run`), `tsc --noEmit` clean

### Architecture notes
- Audio pipeline: Discord Opus → prism-media OpusDecoder (48kHz stereo S16LE) → 3:1 decimation → 16kHz mono → WAV → Whisper
- Piper pipeline: piper `--output_raw` (22050Hz mono) → ffmpeg (48kHz stereo S16LE) → `StreamType.Raw` → Discord
- OpenAI TTS pipeline: MP3 buffer → `Readable.from()` → `StreamType.Arbitrary` (ffmpeg via prism-media) → Discord
- Session key format: `clawcord-{guildId}-{channelId}-{userId}`

### Blockers
- **Not yet live-tested** — needs a real Discord bot token + test server with voice channel
- **ffmpeg required** for Piper TTS resampling — should be pre-installed on any Linux deployment host
- **Piper model not downloaded** — run `scripts/setup-piper.sh` on the deploy host
- `openai-whisper` CLI must be installed (`pip install openai-whisper`) for `local-whisper` provider

### Proposed Next Steps (Phase 4)

1. **Live test** in a real Discord server
   - Set up `.env` with bot token + client ID
   - Register slash commands (`/join`, `/leave`)
   - Verify full pipeline: speak → transcribe → gateway → TTS → playback

2. **Docker Compose** deployment
   - Service: clawcord (Node 20+)
   - Mount piper model directory as volume
   - Environment file injection

3. **Robustness improvements**
   - Handle `speaker.speak()` errors gracefully (don't crash the receiver loop)
   - Add rate limiting / debounce per-user to avoid multiple simultaneous transcriptions
   - Log total latency (capture → transcribe → gateway → speak) per utterance

4. **Piper sample rate detection**
   - Currently hardcoded to 22050Hz in the ffmpeg resampler
   - Parse the `.onnx.json` model config to read `audio.sample_rate` dynamically

---

*Next agent: read CLAUDE.md + this file before touching any code.*
