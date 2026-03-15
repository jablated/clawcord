import { VoiceConnection, VoiceReceiver as DjsVoiceReceiver, EndBehaviorType } from '@discordjs/voice';
import { VoiceActivityDetector } from './vad.js';
import type { Transcriber } from './transcribe.js';
import type { Speaker } from './speaker.js';
import type { GatewayClient } from '../gateway/client.js';

export class VoiceReceiver {
  private vadMap = new Map<string, VoiceActivityDetector>();
  private active = false;

  constructor(
    private connection: VoiceConnection,
    private transcriber: Transcriber,
    private gatewayClient: GatewayClient,
    private speaker: Speaker,
    private guildId: string,
    private channelId: string,
  ) {}

  start(): void {
    if (this.active) return;
    this.active = true;

    const receiver: DjsVoiceReceiver = this.connection.receiver;

    receiver.speaking.on('start', (userId: string) => {
      console.log(`[voice] User ${userId} started speaking`);

      if (!this.vadMap.has(userId)) {
        const vad = new VoiceActivityDetector();
        vad.on('speech_end', (frames) => {
          this.handleUtterance(userId, frames).catch((err: unknown) => {
            console.error(`[voice] Pipeline error for user ${userId}:`, err);
          });
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
        console.log(`[voice] Audio stream ended for user ${userId}`);
        vad.reset();
      });
    });

    receiver.speaking.on('end', (userId: string) => {
      console.log(`[voice] User ${userId} stopped speaking`);
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

  private async handleUtterance(userId: string, frames: Buffer[]): Promise<void> {
    console.log(`[voice] Utterance from ${userId}: ${frames.length} Opus frames`);

    const text = await this.transcriber.transcribe(frames);
    if (!text) {
      console.log(`[voice] No speech detected for ${userId}, skipping`);
      return;
    }

    console.log(`[voice] Transcribed (${userId}): "${text}"`);

    const sessionKey = `clawcord-${this.guildId}-${this.channelId}-${userId}`;
    const response = await this.gatewayClient.sendMessage(sessionKey, text);
    if (!response) {
      console.log(`[voice] Empty response from gateway for ${userId}`);
      return;
    }

    console.log(`[voice] Gateway response: "${response}"`);
    await this.speaker.speak(response);
  }
}
