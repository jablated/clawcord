import { OpenAI, toFile } from 'openai';

/**
 * Converts raw Opus frames to a minimal WAV buffer suitable for Whisper.
 *
 * TODO: Implement proper Opus → PCM decoding via prism-media, then pack as
 * 16-bit LE, 16kHz, mono WAV. For now this returns a stub WAV header so the
 * pipeline can be tested end-to-end without prism-media wired up.
 *
 * Full pipeline:
 *   Opus frames → OpusDecoder (prism-media) → 16kHz mono PCM → WAV header + data
 */
function opusFramesToWav(frames: Buffer[]): Buffer {
  // Concatenate all Opus frames
  const rawData = Buffer.concat(frames);

  // WAV header constants for 16kHz mono 16-bit PCM
  const sampleRate = 16000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;

  // Stub: treat raw Opus bytes as PCM data (incorrect but structurally valid WAV)
  // Replace this section with actual Opus → PCM decoding when prism-media is wired up
  const dataSize = rawData.length;
  const headerSize = 44;
  const wav = Buffer.alloc(headerSize + dataSize);

  // RIFF chunk
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataSize, 4);
  wav.write('WAVE', 8, 'ascii');

  // fmt sub-chunk
  wav.write('fmt ', 12, 'ascii');
  wav.writeUInt32LE(16, 16); // subchunk size
  wav.writeUInt16LE(1, 20);  // PCM format
  wav.writeUInt16LE(numChannels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);

  // data sub-chunk
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataSize, 40);
  rawData.copy(wav, 44);

  return wav;
}

export class Transcriber {
  private openai: OpenAI;

  constructor(openai: OpenAI) {
    this.openai = openai;
  }

  async transcribe(opusFrames: Buffer[]): Promise<string> {
    if (opusFrames.length === 0) {
      return '';
    }

    const wavBuffer = opusFramesToWav(opusFrames);

    const file = await toFile(wavBuffer, 'audio.wav', { type: 'audio/wav' });

    const response = await this.openai.audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'en',
    });

    return response.text.trim();
  }
}
