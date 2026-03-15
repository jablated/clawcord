import {
  VoiceConnection,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  StreamType,
} from '@discordjs/voice';
import { spawn } from 'child_process';
import { Readable } from 'stream';
import os from 'os';
import path from 'path';
import OpenAI from 'openai';
import type { Config } from '../config.js';

const PIPER_INSTALL_INSTRUCTIONS = `
Piper not found. Install:
  pip install piper-tts
Download voice model:
  python3 -m piper.download --model en_US-lessac-medium --output-dir ~/.local/share/piper/models
`.trim();

export class Speaker {
  constructor(private connection: VoiceConnection, private config: Config) {}

  async speak(text: string): Promise<void> {
    if (!text.trim()) return;

    switch (this.config.tts.provider) {
      case 'piper':
        return this.speakPiper(text);
      case 'openai-tts':
        return this.speakOpenAI(text);
      case 'openai-compatible':
        return this.speakOpenAI(text, this.config.tts.baseUrl);
      default:
        throw new Error(`Unknown TTS provider: ${this.config.tts.provider}`);
    }
  }

  /**
   * Synthesize with Piper TTS (local binary).
   * Pipeline: echo text | piper --output_raw | ffmpeg (resample to 48kHz stereo) → Discord
   */
  private async speakPiper(text: string): Promise<void> {
    const piperPath = this.config.tts.piperPath;
    const modelDir = this.config.tts.piperModelDir.replace(/^~/, os.homedir());
    const modelFile = path.join(modelDir, `${this.config.tts.voice}.onnx`);

    const piper = spawn(piperPath, ['--model', modelFile, '--output_raw'], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    piper.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        console.error(`[voice] ${PIPER_INSTALL_INSTRUCTIONS}`);
      } else {
        console.error('[voice] Piper error:', err.message);
      }
    });

    piper.stdin.write(text);
    piper.stdin.end();

    // Piper outputs raw S16LE PCM at the model's native rate (22050Hz for lessac).
    // ffmpeg resamples to 48kHz stereo S16LE expected by @discordjs/voice StreamType.Raw
    const ffmpeg = spawn('ffmpeg', [
      '-f', 's16le', '-ar', '22050', '-ac', '1', '-i', 'pipe:0',
      '-f', 's16le', '-ar', '48000', '-ac', '2', 'pipe:1',
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    ffmpeg.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT') {
        console.error('[voice] ffmpeg not found. Install ffmpeg for Piper TTS resampling.');
      } else {
        console.error('[voice] ffmpeg error:', err.message);
      }
    });

    piper.stdout.pipe(ffmpeg.stdin);

    const player = createAudioPlayer();
    this.connection.subscribe(player);

    const resource = createAudioResource(ffmpeg.stdout as unknown as Readable, {
      inputType: StreamType.Raw,
    });

    player.play(resource);

    await new Promise<void>((resolve, reject) => {
      player.once(AudioPlayerStatus.Idle, () => resolve());
      player.once('error', (err) => reject(err));
      ffmpeg.once('error', (err) => reject(err));
    });
  }

  /**
   * Synthesize with OpenAI TTS (or an openai-compatible endpoint).
   * The API returns MP3 audio; we pass it through @discordjs/voice's Arbitrary stream type
   * which uses ffmpeg internally via prism-media.
   */
  private async speakOpenAI(text: string, baseURL?: string): Promise<void> {
    const openai = new OpenAI({
      apiKey: this.config.openai.apiKey ?? 'none',
      ...(baseURL ? { baseURL } : {}),
    });

    const response = await openai.audio.speech.create({
      model: 'tts-1',
      voice: this.config.tts.openaiVoice as 'nova',
      input: text,
    });

    const buffer = Buffer.from(await response.arrayBuffer());
    const readable = Readable.from(buffer);

    const player = createAudioPlayer();
    this.connection.subscribe(player);

    // StreamType.Arbitrary lets @discordjs/voice use ffmpeg/prism-media to handle MP3
    const resource = createAudioResource(readable, {
      inputType: StreamType.Arbitrary,
    });

    player.play(resource);

    await new Promise<void>((resolve, reject) => {
      player.once(AudioPlayerStatus.Idle, () => resolve());
      player.once('error', (err) => reject(err));
    });
  }
}
