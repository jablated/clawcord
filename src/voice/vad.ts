import { EventEmitter } from 'events';

// Discord sends these 3-byte silence frames when a user stops speaking
const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);
const SILENCE_FRAME_THRESHOLD = 5; // Discord sends ~5 of these in a row
const SILENCE_TIMER_MS = 700; // fallback silence timer

export interface VadEvents {
  speech_start: [];
  speech_end: [frames: Buffer[]];
}

export class VoiceActivityDetector extends EventEmitter {
  private frames: Buffer[] = [];
  private speaking = false;
  private silenceCount = 0;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  emit<K extends keyof VadEvents>(event: K, ...args: VadEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof VadEvents>(event: K, listener: (...args: VadEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof VadEvents>(event: K, listener: (...args: VadEvents[K]) => void): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  /**
   * Feed an Opus audio frame into the VAD.
   * Call this for every frame received from Discord.
   */
  pushFrame(frame: Buffer): void {
    if (this.isSilenceFrame(frame)) {
      this.silenceCount++;
      if (this.speaking && this.silenceCount >= SILENCE_FRAME_THRESHOLD) {
        this.endSpeech();
      }
      return;
    }

    // Non-silence frame: user is speaking
    this.silenceCount = 0;
    this.resetSilenceTimer();

    if (!this.speaking) {
      this.speaking = true;
      this.frames = [];
      this.emit('speech_start');
    }

    this.frames.push(frame);
  }

  private isSilenceFrame(frame: Buffer): boolean {
    return (
      frame.length === SILENCE_FRAME.length &&
      frame[0] === SILENCE_FRAME[0] &&
      frame[1] === SILENCE_FRAME[1] &&
      frame[2] === SILENCE_FRAME[2]
    );
  }

  private resetSilenceTimer(): void {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
    }
    this.silenceTimer = setTimeout(() => {
      if (this.speaking) {
        this.endSpeech();
      }
    }, SILENCE_TIMER_MS);
  }

  private endSpeech(): void {
    if (!this.speaking) return;

    this.speaking = false;
    this.silenceCount = 0;

    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }

    const buffered = this.frames;
    this.frames = [];
    this.emit('speech_end', buffered);
  }

  reset(): void {
    this.speaking = false;
    this.silenceCount = 0;
    this.frames = [];
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}
