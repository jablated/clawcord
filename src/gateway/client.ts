import { EventEmitter } from 'events';
import WebSocket from 'ws';

const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 1000;

interface GatewayMessage {
  type: string;
  session_key?: string;
  message?: string;
  text?: string;
  request_id?: string;
  [key: string]: unknown;
}

interface PendingRequest {
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface GatewayClientEvents {
  connected: [];
  disconnected: [];
  error: [err: Error];
}

export class GatewayClient extends EventEmitter {
  private url: string;
  private token: string | undefined;
  private ws: WebSocket | null = null;
  private pendingRequests = new Map<string, PendingRequest>();
  private retryCount = 0;
  private destroyed = false;
  private requestCounter = 0;

  constructor(url: string, token?: string) {
    super();
    this.url = url;
    this.token = token;
  }

  emit<K extends keyof GatewayClientEvents>(event: K, ...args: GatewayClientEvents[K]): boolean {
    return super.emit(event, ...args);
  }

  on<K extends keyof GatewayClientEvents>(event: K, listener: (...args: GatewayClientEvents[K]) => void): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  once<K extends keyof GatewayClientEvents>(event: K, listener: (...args: GatewayClientEvents[K]) => void): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      const headers: Record<string, string> = {};
      if (this.token) {
        headers['Authorization'] = `Bearer ${this.token}`;
      }

      const ws = new WebSocket(this.url, { headers });
      this.ws = ws;

      ws.once('open', () => {
        console.log('[gateway] Connected to OpenClaw Gateway');
        this.retryCount = 0;
        this.emit('connected');
        resolve();
      });

      ws.once('error', (err) => {
        console.error('[gateway] WebSocket error:', err.message);
        this.emit('error', err);
        reject(err);
      });

      ws.on('message', (data: WebSocket.RawData) => {
        this.handleMessage(data.toString());
      });

      ws.on('close', () => {
        console.log('[gateway] Disconnected from OpenClaw Gateway');
        this.ws = null;
        this.emit('disconnected');

        if (!this.destroyed) {
          this.scheduleReconnect();
        }
      });
    });
  }

  disconnect(): void {
    this.destroyed = true;
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    // Reject any pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timer);
      pending.reject(new Error('Gateway disconnected'));
      this.pendingRequests.delete(id);
    }
  }

  async sendMessage(sessionKey: string, message: string): Promise<string> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error('Gateway not connected');
    }

    const requestId = `req_${++this.requestCounter}_${Date.now()}`;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('Gateway request timed out'));
      }, 30_000);

      this.pendingRequests.set(requestId, { resolve, reject, timer });

      const payload: GatewayMessage = {
        type: 'agent.message',
        session_key: sessionKey,
        message,
        request_id: requestId,
      };

      this.ws!.send(JSON.stringify(payload), (err) => {
        if (err) {
          clearTimeout(timer);
          this.pendingRequests.delete(requestId);
          reject(err);
        }
      });
    });
  }

  private handleMessage(raw: string): void {
    let msg: GatewayMessage;
    try {
      msg = JSON.parse(raw) as GatewayMessage;
    } catch {
      console.warn('[gateway] Received non-JSON message:', raw);
      return;
    }

    const requestId = msg['request_id'] as string | undefined;
    if (requestId && this.pendingRequests.has(requestId)) {
      const pending = this.pendingRequests.get(requestId)!;
      clearTimeout(pending.timer);
      this.pendingRequests.delete(requestId);

      const text = (msg['text'] ?? msg['message'] ?? '') as string;
      pending.resolve(text);
    }
  }

  private scheduleReconnect(): void {
    if (this.retryCount >= MAX_RETRIES) {
      console.error('[gateway] Max reconnect attempts reached, giving up');
      return;
    }

    const backoff = BASE_BACKOFF_MS * Math.pow(2, this.retryCount);
    this.retryCount++;
    console.log(`[gateway] Reconnecting in ${backoff}ms (attempt ${this.retryCount}/${MAX_RETRIES})...`);

    setTimeout(() => {
      if (!this.destroyed) {
        this.connect().catch((err: unknown) => {
          console.error('[gateway] Reconnect failed:', err);
        });
      }
    }, backoff);
  }
}
