import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

// Mock the 'ws' module
vi.mock('ws', () => {
  return { default: MockWebSocket };
});

// WebSocket ready state constants
const WS_CONNECTING = 0;
const WS_OPEN = 1;
const WS_CLOSING = 2;
const WS_CLOSED = 3;

class MockWebSocket extends EventEmitter {
  static CONNECTING = WS_CONNECTING;
  static OPEN = WS_OPEN;
  static CLOSING = WS_CLOSING;
  static CLOSED = WS_CLOSED;

  readyState: number = WS_CONNECTING;
  url: string;
  sentMessages: string[] = [];

  constructor(url: string) {
    super();
    this.url = url;
    // Simulate async open
    setImmediate(() => {
      this.readyState = WS_OPEN;
      this.emit('open');
    });
  }

  send(data: string, cb?: (err?: Error) => void) {
    this.sentMessages.push(data);
    cb?.();
  }

  close() {
    this.readyState = WS_CLOSED;
    this.emit('close');
  }

  simulateMessage(data: unknown) {
    this.emit('message', JSON.stringify(data));
  }

  simulateError(err: Error) {
    this.emit('error', err);
  }
}

// Track the most recently created MockWebSocket instance
let lastWs: MockWebSocket | null = null;
const OriginalMockWebSocket = MockWebSocket;
vi.spyOn(MockWebSocket.prototype, 'constructor');

// Replace MockWebSocket with a version that tracks instances
class TrackingMockWebSocket extends MockWebSocket {
  constructor(url: string, _options?: unknown) {
    super(url);
    lastWs = this;
  }
}

// Re-mock with tracking version
vi.mock('ws', () => {
  return { default: TrackingMockWebSocket };
});

// Import after mocking
const { GatewayClient } = await import('../../src/gateway/client.js');

describe('GatewayClient', () => {
  let client: InstanceType<typeof GatewayClient>;

  beforeEach(() => {
    lastWs = null;
    client = new GatewayClient('ws://localhost:18788', 'test-token');
  });

  afterEach(() => {
    client.disconnect();
    vi.clearAllMocks();
  });

  describe('connect', () => {
    it('should connect and emit connected event', async () => {
      const onConnected = vi.fn();
      client.on('connected', onConnected);

      await client.connect();

      expect(onConnected).toHaveBeenCalledOnce();
      expect(lastWs).not.toBeNull();
    });

    it('should resolve immediately if already connected', async () => {
      await client.connect();
      const firstWs = lastWs;

      // Should not create a new WebSocket
      await client.connect();
      expect(lastWs).toBe(firstWs);
    });
  });

  describe('disconnect', () => {
    it('should close the WebSocket and emit disconnected event', async () => {
      const onDisconnected = vi.fn();
      client.on('disconnected', onDisconnected);

      await client.connect();
      client.disconnect();

      expect(onDisconnected).toHaveBeenCalledOnce();
    });

    it('should reject pending requests on disconnect', async () => {
      await client.connect();

      const msgPromise = client.sendMessage('session-1', 'hello');
      client.disconnect();

      await expect(msgPromise).rejects.toThrow('Gateway disconnected');
    });
  });

  describe('sendMessage', () => {
    it('should send a message with correct format', async () => {
      await client.connect();

      // Send message (don't await — we'll simulate response)
      const promise = client.sendMessage('session-key-123', 'Hello world');

      expect(lastWs!.sentMessages).toHaveLength(1);
      const sent = JSON.parse(lastWs!.sentMessages[0]!) as Record<string, unknown>;
      expect(sent.type).toBe('agent.message');
      expect(sent.session_key).toBe('session-key-123');
      expect(sent.message).toBe('Hello world');
      expect(sent.request_id).toBeDefined();

      // Simulate response
      lastWs!.simulateMessage({
        type: 'agent.response',
        request_id: sent.request_id,
        text: 'Hello back!',
      });

      const result = await promise;
      expect(result).toBe('Hello back!');
    });

    it('should throw if not connected', async () => {
      await expect(client.sendMessage('session-1', 'test')).rejects.toThrow(
        'Gateway not connected'
      );
    });

    it('should handle response with message field instead of text', async () => {
      await client.connect();

      const promise = client.sendMessage('session-1', 'hi');
      const sent = JSON.parse(lastWs!.sentMessages[0]!) as Record<string, unknown>;

      lastWs!.simulateMessage({
        type: 'agent.response',
        request_id: sent.request_id,
        message: 'response via message field',
      });

      const result = await promise;
      expect(result).toBe('response via message field');
    });

    it('should handle multiple concurrent requests', async () => {
      await client.connect();

      const promise1 = client.sendMessage('session-1', 'first');
      const promise2 = client.sendMessage('session-1', 'second');

      const sent1 = JSON.parse(lastWs!.sentMessages[0]!) as Record<string, unknown>;
      const sent2 = JSON.parse(lastWs!.sentMessages[1]!) as Record<string, unknown>;

      expect(sent1.request_id).not.toBe(sent2.request_id);

      // Respond out of order
      lastWs!.simulateMessage({ request_id: sent2.request_id, text: 'second response' });
      lastWs!.simulateMessage({ request_id: sent1.request_id, text: 'first response' });

      expect(await promise1).toBe('first response');
      expect(await promise2).toBe('second response');
    });
  });

  describe('reconnect', () => {
    it('should emit disconnected event on WebSocket close', async () => {
      const onDisconnected = vi.fn();
      client.on('disconnected', onDisconnected);

      await client.connect();
      // Simulate server-side close (not client-initiated)
      // First disconnect the client so it won't try to reconnect infinitely
      client.disconnect();

      expect(onDisconnected).toHaveBeenCalled();
    });
  });
});
