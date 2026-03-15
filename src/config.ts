import { config as loadDotenv } from 'dotenv';

loadDotenv();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue: string): string {
  return process.env[key] ?? defaultValue;
}

function optionalEnvMaybe(key: string): string | undefined {
  return process.env[key] || undefined;
}

export const config = {
  discord: {
    botToken: requireEnv('DISCORD_BOT_TOKEN'),
    clientId: requireEnv('DISCORD_CLIENT_ID'),
  },
  gateway: {
    url: optionalEnv('OPENCLAW_GATEWAY_URL', 'ws://localhost:18788'),
    token: optionalEnvMaybe('OPENCLAW_GATEWAY_TOKEN'),
  },
  openai: {
    apiKey: optionalEnvMaybe('OPENAI_API_KEY'),
  },
  stt: {
    // Provider: "local-whisper" | "openai-whisper" | "openai-compatible"
    provider: optionalEnv('STT_PROVIDER', 'local-whisper'),
    // Whisper model size for local-whisper, or model name for openai-compatible
    model: optionalEnv('STT_MODEL', 'base.en'),
    // Base URL for openai-compatible STT (e.g. http://192.168.0.x:9000/v1)
    baseUrl: optionalEnvMaybe('STT_BASE_URL'),
  },
  tts: {
    // Provider: "piper" | "openai-tts" | "openai-compatible"
    provider: optionalEnv('TTS_PROVIDER', 'piper'),
    // Piper voice model name (e.g. en_US-lessac-medium)
    voice: optionalEnv('TTS_VOICE', 'en_US-lessac-medium'),
    // Path to piper binary
    piperPath: optionalEnv('TTS_PIPER_PATH', 'piper'),
    // Directory containing piper .onnx voice model files
    piperModelDir: optionalEnv('TTS_PIPER_MODEL_DIR', '~/.local/share/piper/models'),
    // Base URL for openai-compatible TTS (e.g. http://192.168.0.x:8880/v1)
    baseUrl: optionalEnvMaybe('TTS_BASE_URL'),
    // Voice name for openai / openai-compatible TTS
    openaiVoice: optionalEnv('TTS_OPENAI_VOICE', 'nova'),
  },
};

export type Config = typeof config;
