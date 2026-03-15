import { config as loadDotenv } from 'dotenv';

loadDotenv();

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optionalEnv(key: string, defaultValue?: string): string | undefined {
  return process.env[key] ?? defaultValue;
}

export const config = {
  discord: {
    botToken: requireEnv('DISCORD_BOT_TOKEN'),
    clientId: requireEnv('DISCORD_CLIENT_ID'),
  },
  gateway: {
    url: optionalEnv('OPENCLAW_GATEWAY_URL', 'ws://localhost:18788') as string,
    token: optionalEnv('OPENCLAW_GATEWAY_TOKEN'),
  },
  openai: {
    apiKey: optionalEnv('OPENAI_API_KEY'),
  },
  tts: {
    baseUrl: optionalEnv('TTS_BASE_URL'),
    voice: optionalEnv('TTS_VOICE', 'nova') as string,
  },
} as const;

export type Config = typeof config;
