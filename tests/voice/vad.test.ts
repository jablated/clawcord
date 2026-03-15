import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VoiceActivityDetector } from '../../src/voice/vad.js';

const SILENCE_FRAME = Buffer.from([0xf8, 0xff, 0xfe]);
const AUDIO_FRAME = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);

describe('VoiceActivityDetector', () => {
  let vad: VoiceActivityDetector;

  beforeEach(() => {
    vi.useFakeTimers();
    vad = new VoiceActivityDetector();
  });

  afterEach(() => {
    vad.reset();
    vi.useRealTimers();
  });

  describe('silence frame detection', () => {
    it('should emit speech_start when audio frame is received', () => {
      const onStart = vi.fn();
      vad.on('speech_start', onStart);

      vad.pushFrame(AUDIO_FRAME);

      expect(onStart).toHaveBeenCalledOnce();
    });

    it('should emit speech_end after 5 silence frames', () => {
      const onEnd = vi.fn<[Buffer[]], void>();
      vad.on('speech_end', onEnd);

      // Start speaking
      vad.pushFrame(AUDIO_FRAME);
      vad.pushFrame(AUDIO_FRAME);

      // Push 5 silence frames
      for (let i = 0; i < 5; i++) {
        vad.pushFrame(SILENCE_FRAME);
      }

      expect(onEnd).toHaveBeenCalledOnce();
    });

    it('should not emit speech_end before 5 silence frames', () => {
      const onEnd = vi.fn();
      vad.on('speech_end', onEnd);

      vad.pushFrame(AUDIO_FRAME);

      // Only 4 silence frames — not enough
      for (let i = 0; i < 4; i++) {
        vad.pushFrame(SILENCE_FRAME);
      }

      expect(onEnd).not.toHaveBeenCalled();
    });

    it('should not emit speech_end if not currently speaking', () => {
      const onEnd = vi.fn();
      vad.on('speech_end', onEnd);

      // Push silence frames without speaking first
      for (let i = 0; i < 10; i++) {
        vad.pushFrame(SILENCE_FRAME);
      }

      expect(onEnd).not.toHaveBeenCalled();
    });

    it('should reset silence count on new audio frame', () => {
      const onEnd = vi.fn();
      vad.on('speech_end', onEnd);

      vad.pushFrame(AUDIO_FRAME);

      // 4 silence frames
      for (let i = 0; i < 4; i++) {
        vad.pushFrame(SILENCE_FRAME);
      }

      // New audio frame resets silence count
      vad.pushFrame(AUDIO_FRAME);

      // 4 more silence frames — total would be 8 but count reset
      for (let i = 0; i < 4; i++) {
        vad.pushFrame(SILENCE_FRAME);
      }

      // Still not 5 consecutive silence frames
      expect(onEnd).not.toHaveBeenCalled();
    });
  });

  describe('timer fallback', () => {
    it('should emit speech_end after 700ms silence timer', () => {
      const onEnd = vi.fn();
      vad.on('speech_end', onEnd);

      vad.pushFrame(AUDIO_FRAME);
      vad.pushFrame(AUDIO_FRAME);

      // Advance timer by 700ms
      vi.advanceTimersByTime(700);

      expect(onEnd).toHaveBeenCalledOnce();
    });

    it('should reset timer when new audio arrives', () => {
      const onEnd = vi.fn();
      vad.on('speech_end', onEnd);

      vad.pushFrame(AUDIO_FRAME);

      // Advance 500ms (not enough)
      vi.advanceTimersByTime(500);
      expect(onEnd).not.toHaveBeenCalled();

      // New frame resets timer
      vad.pushFrame(AUDIO_FRAME);

      // Advance another 500ms — total 1000ms but timer reset at 500ms
      vi.advanceTimersByTime(500);
      expect(onEnd).not.toHaveBeenCalled();

      // Advance to 700ms past last frame
      vi.advanceTimersByTime(200);
      expect(onEnd).toHaveBeenCalledOnce();
    });

    it('should not fire timer if silence frames already ended speech', () => {
      const onEnd = vi.fn();
      vad.on('speech_end', onEnd);

      vad.pushFrame(AUDIO_FRAME);

      // End via silence frames
      for (let i = 0; i < 5; i++) {
        vad.pushFrame(SILENCE_FRAME);
      }

      expect(onEnd).toHaveBeenCalledOnce();

      // Timer should be cleared — advancing time should not fire again
      vi.advanceTimersByTime(1000);
      expect(onEnd).toHaveBeenCalledOnce();
    });
  });

  describe('audio buffering', () => {
    it('should buffer audio frames during speech', () => {
      const onEnd = vi.fn<[Buffer[]], void>();
      vad.on('speech_end', onEnd);

      const frame1 = Buffer.from([0x01, 0x02]);
      const frame2 = Buffer.from([0x03, 0x04]);
      const frame3 = Buffer.from([0x05, 0x06]);

      vad.pushFrame(frame1);
      vad.pushFrame(frame2);
      vad.pushFrame(frame3);

      vi.advanceTimersByTime(700);

      expect(onEnd).toHaveBeenCalledOnce();
      const frames = onEnd.mock.calls[0]![0];
      expect(frames).toHaveLength(3);
      expect(frames[0]).toEqual(frame1);
      expect(frames[1]).toEqual(frame2);
      expect(frames[2]).toEqual(frame3);
    });

    it('should not include silence frames in buffered audio', () => {
      const onEnd = vi.fn<[Buffer[]], void>();
      vad.on('speech_end', onEnd);

      vad.pushFrame(AUDIO_FRAME);
      vad.pushFrame(SILENCE_FRAME);
      vad.pushFrame(SILENCE_FRAME);
      vad.pushFrame(SILENCE_FRAME);
      vad.pushFrame(SILENCE_FRAME);
      vad.pushFrame(SILENCE_FRAME);

      const frames = onEnd.mock.calls[0]![0];
      expect(frames).toHaveLength(1);
      expect(frames[0]).toEqual(AUDIO_FRAME);
    });

    it('should clear buffer between utterances', () => {
      const onEnd = vi.fn<[Buffer[]], void>();
      vad.on('speech_end', onEnd);

      const frame1 = Buffer.from([0x01]);
      const frame2 = Buffer.from([0x02]);

      // First utterance
      vad.pushFrame(frame1);
      vi.advanceTimersByTime(700);

      // Second utterance
      vad.pushFrame(frame2);
      vi.advanceTimersByTime(700);

      expect(onEnd).toHaveBeenCalledTimes(2);
      expect(onEnd.mock.calls[0]![0]).toHaveLength(1);
      expect(onEnd.mock.calls[0]![0][0]).toEqual(frame1);
      expect(onEnd.mock.calls[1]![0]).toHaveLength(1);
      expect(onEnd.mock.calls[1]![0][0]).toEqual(frame2);
    });
  });
});
