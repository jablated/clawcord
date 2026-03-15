import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock prism-media before importing transcribe
// ---------------------------------------------------------------------------
vi.mock('prism-media', () => {
  const { Transform } = require('stream') as typeof import('stream');

  class FakeOpusDecoder extends Transform {
    constructor(_opts?: unknown) {
      super();
    }
    _transform(chunk: Buffer, _enc: string, cb: () => void) {
      // Echo input as "PCM": output 4x the data (simulate stereo 48kHz expansion)
      // For test purposes, just emit the raw bytes so the pipeline doesn't hang.
      this.push(chunk);
      cb();
    }
  }

  return {
    default: {
      opus: {
        Decoder: FakeOpusDecoder,
      },
    },
  };
});

// Mock child_process spawn
const mockSpawn = vi.fn();
vi.mock('child_process', () => ({ spawn: mockSpawn }));

// Mock fs promises
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue('Hello world');
const mockUnlink = vi.fn().mockResolvedValue(undefined);
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockRm = vi.fn().mockResolvedValue(undefined);

vi.mock('fs', () => ({
  promises: {
    writeFile: mockWriteFile,
    readFile: mockReadFile,
    unlink: mockUnlink,
    mkdir: mockMkdir,
    rm: mockRm,
  },
}));

// Mock openai
const mockTranscriptionsCreate = vi.fn().mockResolvedValue({ text: ' transcribed text ' });
vi.mock('openai', () => {
  return {
    OpenAI: vi.fn().mockImplementation(() => ({
      audio: {
        transcriptions: {
          create: mockTranscriptionsCreate,
        },
      },
    })),
    toFile: vi.fn().mockImplementation(async (buf: Buffer, name: string) => ({ buf, name })),
  };
});

// Import after all mocks are set up
const { Transcriber } = await import('../../src/voice/transcribe.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(provider: string, extras: Record<string, unknown> = {}) {
  return {
    stt: {
      provider,
      model: 'base.en',
      baseUrl: undefined,
      ...extras,
    },
    openai: { apiKey: 'test-key' },
    discord: { botToken: 'x', clientId: 'x' },
    gateway: { url: 'ws://localhost', token: undefined },
    tts: {
      provider: 'piper',
      voice: 'en_US-lessac-medium',
      piperPath: 'piper',
      piperModelDir: '~/.local/share/piper/models',
      baseUrl: undefined,
      openaiVoice: 'nova',
    },
  };
}

function makeSpawnMock(exitCode = 0) {
  const { EventEmitter } = require('events') as typeof import('events');
  const proc = new EventEmitter() as NodeJS.EventEmitter & {
    stderr: EventEmitter;
    stdin?: { write: () => void; end: () => void };
    stdout?: EventEmitter;
  };
  proc.stderr = new EventEmitter();
  setImmediate(() => proc.emit('close', exitCode));
  return proc;
}

const AUDIO_FRAMES = [Buffer.from([0x01, 0x02, 0x03, 0x04])];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Transcriber', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadFile.mockResolvedValue('Hello world');
    mockSpawn.mockReturnValue(makeSpawnMock(0));
    mockTranscriptionsCreate.mockResolvedValue({ text: ' transcribed text ' });
  });

  it('returns empty string for zero frames', async () => {
    const t = new Transcriber(makeConfig('local-whisper') as never);
    expect(await t.transcribe([])).toBe('');
  });

  describe('provider routing', () => {
    it('routes local-whisper to whisper CLI', async () => {
      const t = new Transcriber(makeConfig('local-whisper') as never);
      const result = await t.transcribe(AUDIO_FRAMES);

      expect(mockSpawn).toHaveBeenCalledOnce();
      const [cmd, args] = mockSpawn.mock.calls[0] as [string, string[]];
      expect(cmd).toBe('whisper');
      expect(args).toContain('--model');
      expect(args).toContain('base.en');
      expect(result).toBe('Hello world');
    });

    it('routes openai-whisper to OpenAI SDK', async () => {
      const t = new Transcriber(makeConfig('openai-whisper') as never);
      const result = await t.transcribe(AUDIO_FRAMES);

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockTranscriptionsCreate).toHaveBeenCalledOnce();
      expect(result).toBe('transcribed text');
    });

    it('routes openai-compatible to OpenAI SDK with custom baseURL', async () => {
      const t = new Transcriber(
        makeConfig('openai-compatible', { baseUrl: 'http://localhost:9000/v1' }) as never,
      );
      const result = await t.transcribe(AUDIO_FRAMES);

      expect(mockSpawn).not.toHaveBeenCalled();
      expect(mockTranscriptionsCreate).toHaveBeenCalledOnce();
      expect(result).toBe('transcribed text');
    });

    it('throws on unknown provider', async () => {
      const t = new Transcriber(makeConfig('bogus-provider') as never);
      await expect(t.transcribe(AUDIO_FRAMES)).rejects.toThrow('Unknown STT provider');
    });
  });

  it('returns empty string when whisper CLI produces empty output', async () => {
    mockReadFile.mockResolvedValue('   ');
    const t = new Transcriber(makeConfig('local-whisper') as never);
    const result = await t.transcribe(AUDIO_FRAMES);
    expect(result).toBe('');
  });

  it('propagates whisper CLI non-zero exit as error', async () => {
    mockSpawn.mockReturnValue(makeSpawnMock(1));
    const t = new Transcriber(makeConfig('local-whisper') as never);
    await expect(t.transcribe(AUDIO_FRAMES)).rejects.toThrow('whisper exited 1');
  });
});
