import { EventEmitter } from 'events';
import { VoiceConnection, VoiceReceiver as DjsVoiceReceiver, EndBehaviorType } from '@discordjs/voice';
import { VoiceActivityDetector } from './vad.js';

export interface UtteranceEvent {
  userId: string;
  audioBuffer: Buffer[];
}

export interface ReceiverEvents {
  utterance: [event: UtteranceEvent];
}

export class VoiceReceiver extends EventEmitter {
  private connection: VoiceConnection;
  private vadMap = new Map<string, VoiceActivityDetector>();
  private active = false;

  constructor(connection: VoiceConnection) {
    super();
    this.connection = connection;
  }

  emit<K extends keyof ReceiverEvents>(event: K, ...args: ReceiverEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof ReceiverEvents>(event: K, listener: (...args: ReceiverEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  start(): void {
    if (this.active) return;
    this.active = true;

    const receiver: DjsVoiceReceiver = this.connection.receiver;

    receiver.speaking.on('start', (userId: string) => {
      console.log(`[receiver] User ${userId} started speaking`);

      if (!this.vadMap.has(userId)) {
        const vad = new VoiceActivityDetector();
        vad.on('speech_end', (frames) => {
          console.log(`[receiver] Utterance complete for user ${userId}, ${frames.length} frames`);
          this.emit('utterance', { userId, audioBuffer: frames });
        });
        this.vadMap.set(userId, vad);
      }

      const audioStream = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 1000 },
      });

      const vad = this.vadMap.get(userId)!;

      audioStream.on('data', (chunk: Buffer) => {
        vad.pushFrame(chunk);
      });

      audioStream.on('end', () => {
        console.log(`[receiver] Audio stream ended for user ${userId}`);
        vad.reset();
      });
    });

    receiver.speaking.on('end', (userId: string) => {
      console.log(`[receiver] User ${userId} stopped speaking`);
    });
  }

  stop(): void {
    if (!this.active) return;
    this.active = false;

    for (const vad of this.vadMap.values()) {
      vad.reset();
    }
    this.vadMap.clear();
  }
}
