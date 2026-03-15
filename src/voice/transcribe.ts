import { OpenAI, toFile } from 'openai';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import prism from 'prism-media';
import type { Config } from '../config.js';

// ---------------------------------------------------------------------------
// Opus → WAV conversion
// ---------------------------------------------------------------------------

/**
 * Decode raw Opus frames (from Discord) to a 16kHz mono 16-bit PCM WAV buffer.
 *
 * Pipeline:
 *   Opus frames → prism-media OpusDecoder (48kHz stereo S16LE)
 *               → simple decimation downsample to 16kHz mono
 *               → WAV header + PCM data
 */
export async function opusFramesToWav(frames: Buffer[]): Promise<Buffer> {
  if (frames.length === 0) {
    return buildWav(Buffer.alloc(0), 16000, 1, 16);
  }

  // Decode Opus → 48kHz stereo S16LE using prism-media
  const decoder = new prism.opus.Decoder({ rate: 48000, channels: 2, frameSize: 960 });

  const pcmChunks: Buffer[] = [];
  const decodeDone = new Promise<void>((resolve, reject) => {
    decoder.on('data', (chunk: Buffer) => pcmChunks.push(chunk));
    decoder.on('end', resolve);
    decoder.on('error', reject);
  });

  for (const frame of frames) {
    decoder.write(frame);
  }
  decoder.end();

  await decodeDone;

  const pcm48kStereo = Buffer.concat(pcmChunks);
  const mono16k = downsampleStereoToMono(pcm48kStereo);
  return buildWav(mono16k, 16000, 1, 16);
}

/**
 * Downsample 48kHz stereo S16LE → 16kHz mono S16LE.
 * Uses simple 3:1 decimation with L+R averaging (no anti-alias filter, sufficient for speech).
 */
function downsampleStereoToMono(pcm48kStereo: Buffer): Buffer {
  // Each stereo frame = 4 bytes (left S16LE + right S16LE)
  const ratio = 3; // 48000 / 16000
  const numInputFrames = Math.floor(pcm48kStereo.length / 4);
  const numOutputSamples = Math.floor(numInputFrames / ratio);
  const out = Buffer.alloc(numOutputSamples * 2);

  for (let i = 0; i < numOutputSamples; i++) {
    const srcOffset = i * ratio * 4;
    const left = pcm48kStereo.readInt16LE(srcOffset);
    const right = pcm48kStereo.readInt16LE(srcOffset + 2);
    const mono = Math.trunc((left + right) / 2);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, mono)), i * 2);
  }

  return out;
}

function buildWav(pcmData: Buffer, sampleRate: number, channels: number, bitsPerSample: number): Buffer {
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const dataSize = pcmData.length;
  const wav = Buffer.alloc(44 + dataSize);

  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20); // PCM format
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  pcmData.copy(wav, 44);

  return wav;
}

// ---------------------------------------------------------------------------
// Transcriber
// ---------------------------------------------------------------------------

export class Transcriber {
  constructor(private config: Config) {}

  async transcribe(opusFrames: Buffer[]): Promise<string> {
    if (opusFrames.length === 0) return '';

    const wav = await opusFramesToWav(opusFrames);

    switch (this.config.stt.provider) {
      case 'local-whisper':
        return this.transcribeLocal(wav);
      case 'openai-whisper':
        return this.transcribeOpenAI(wav);
      case 'openai-compatible':
        return this.transcribeOpenAI(wav, this.config.stt.baseUrl);
      default:
        throw new Error(`Unknown STT provider: ${this.config.stt.provider}`);
    }
  }

  /**
   * Run the local `whisper` CLI (openai-whisper Python package).
   * Writes WAV to a temp file, runs whisper with --output_format txt, reads result.
   */
  private async transcribeLocal(wav: Buffer): Promise<string> {
    const tmpBase = path.join(os.tmpdir(), `clawcord-stt-${Date.now()}`);
    const tmpWav = `${tmpBase}.wav`;
    const tmpOutDir = `${tmpBase}-out`;

    await fs.mkdir(tmpOutDir, { recursive: true });
    await fs.writeFile(tmpWav, wav);

    try {
      await new Promise<void>((resolve, reject) => {
        const proc = spawn('whisper', [
          tmpWav,
          '--model', this.config.stt.model,
          '--output_format', 'txt',
          '--output_dir', tmpOutDir,
          '--language', 'en',
        ]);

        let stderr = '';
        proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

        proc.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            reject(new Error(`whisper exited ${code}: ${stderr.slice(-200)}`));
          }
        });
        proc.on('error', (err) => {
          reject(new Error(`Failed to spawn whisper: ${err.message}\nInstall: pip install openai-whisper`));
        });
      });

      const basename = path.basename(tmpWav, '.wav');
      const txtFile = path.join(tmpOutDir, `${basename}.txt`);
      const text = await fs.readFile(txtFile, 'utf-8');
      return text.trim();
    } finally {
      await fs.unlink(tmpWav).catch(() => undefined);
      await fs.rm(tmpOutDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }

  /**
   * Use the OpenAI Whisper API (or an openai-compatible endpoint).
   */
  private async transcribeOpenAI(wav: Buffer, baseURL?: string): Promise<string> {
    const openai = new OpenAI({
      apiKey: this.config.openai.apiKey ?? 'none',
      ...(baseURL ? { baseURL } : {}),
    });

    const file = await toFile(wav, 'audio.wav', { type: 'audio/wav' });
    const response = await openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'en',
    });

    return response.text.trim();
  }
}
