import type { Server as HttpServer } from 'node:http';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { z } from 'zod';
import { isAppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { createModuleLogger } from '../../common/logging/logger.js';
import { MetricName, setGauge } from '../../common/observability/metrics.js';
import { loadConfig } from '../../config/index.js';
import { getKeyValue, isKeyValueConfigured } from '../../database/key-value.js';
import { resolveSession } from '../auth/session.service.js';
import {
  assertConversationMember,
  markDelivered,
  markReadForUser,
  sendMessageForUser,
} from './messaging.service.js';
import { sendMessageSchema } from './messaging.schema.js';
import { registerRealtimePublisher } from './realtime-hub.js';

interface SocketAck {
  ok: boolean;
  data?: unknown;
  error?: { code: string; message: string; fieldErrors?: Record<string, string[]> };
}

interface ClientToServerEvents {
  'conversation:join': (input: { conversationId: string }, ack: (value: SocketAck) => void) => void;
  'conversation:leave': (input: { conversationId: string }, ack: (value: SocketAck) => void) => void;
  'message:send': (
    input: { conversationId: string; body?: string | null; fileIds?: string[] },
    ack: (value: SocketAck) => void,
  ) => void;
  'message:read': (input: { conversationId: string }, ack: (value: SocketAck) => void) => void;
  'typing:start': (input: { conversationId: string }, ack: (value: SocketAck) => void) => void;
  'typing:stop': (input: { conversationId: string }, ack: (value: SocketAck) => void) => void;
}

interface ServerToClientEvents {
  'message:new': (payload: unknown) => void;
  'message:read': (payload: unknown) => void;
  'typing:start': (payload: { conversationId: string; userId: string }) => void;
  'typing:stop': (payload: { conversationId: string; userId: string }) => void;
}

interface SocketData {
  userId: string;
  sessionId: string;
}

const log = createModuleLogger('messaging.socket');
const conversationInputSchema = z.object({ conversationId: z.string().uuid() }).strict();
const socketMessageSchema = conversationInputSchema.extend({
  body: z.string().trim().min(1).max(20_000).nullable().optional(),
  fileIds: z.array(z.string().uuid()).max(10).default([]),
});

function cookieValue(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    if (key !== name) continue;
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function safeError(error: unknown): SocketAck {
  if (isAppError(error)) {
    return {
      ok: false,
      error: {
        code: error.code,
        message: error.expose ? error.message : 'The realtime request could not be completed.',
        ...(error.fieldErrors ? { fieldErrors: error.fieldErrors } : {}),
      },
    };
  }
  log.error({ err: error }, 'realtime handler failed');
  return {
    ok: false,
    error: { code: ErrorCode.INTERNAL_ERROR, message: 'The realtime request could not be completed.' },
  };
}

export async function installMessagingSocket(
  server: HttpServer,
): Promise<{ close: () => Promise<void> }> {
  const config = loadConfig();
  const io = new Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>(server, {
    path: '/socket.io',
    cors: {
      origin: config.allowedOrigins.length > 0 ? [...config.allowedOrigins] : !config.isProduction,
      credentials: true,
    },
    maxHttpBufferSize: 1_000_000,
    pingTimeout: 20_000,
    pingInterval: 25_000,
  });

  let redisClients:
    | { publisher: ReturnType<typeof getKeyValue>; subscriber: ReturnType<typeof getKeyValue> }
    | undefined;
  if (isKeyValueConfigured()) {
    const publisher = getKeyValue().duplicate();
    const subscriber = getKeyValue().duplicate();
    await Promise.all([publisher.connect(), subscriber.connect()]);
    io.adapter(createAdapter(publisher, subscriber));
    redisClients = { publisher, subscriber };
  }

  io.use((socket, next) => {
    const authToken =
      typeof socket.handshake.auth['token'] === 'string'
        ? socket.handshake.auth['token']
        : undefined;
    const token =
      cookieValue(socket.handshake.headers.cookie, config.session.cookieName) ?? authToken;
    if (!token) {
      next(new Error(ErrorCode.UNAUTHENTICATED));
      return;
    }
    resolveSession(token)
      .then((resolution) => {
        if (resolution.outcome !== 'valid') {
          next(new Error(ErrorCode.SESSION_EXPIRED));
          return;
        }
        if (!resolution.value.session.mfaSatisfied) {
          next(new Error(ErrorCode.TWO_FACTOR_REQUIRED));
          return;
        }
        socket.data.userId = resolution.value.user.id;
        socket.data.sessionId = resolution.value.session.id;
        next();
      })
      .catch(() => next(new Error(ErrorCode.UNAUTHENTICATED)));
  });

  let connectionCount = 0;
  io.on('connection', (socket) => {
    connectionCount += 1;
    setGauge(MetricName.SOCKET_CONNECTIONS, connectionCount);
    void socket.join(`user:${socket.data.userId}`);

    socket.on('conversation:join', async (input, ack) => {
      try {
        const parsed = conversationInputSchema.parse(input);
        await assertConversationMember(socket.data.userId, parsed.conversationId);
        await socket.join(`conversation:${parsed.conversationId}`);
        ack({ ok: true });
      } catch (error) {
        ack(safeError(error));
      }
    });

    socket.on('conversation:leave', async (input, ack) => {
      try {
        const parsed = conversationInputSchema.parse(input);
        await assertConversationMember(socket.data.userId, parsed.conversationId);
        await socket.leave(`conversation:${parsed.conversationId}`);
        ack({ ok: true });
      } catch (error) {
        ack(safeError(error));
      }
    });

    socket.on('message:send', async (input, ack) => {
      try {
        const parsed = socketMessageSchema.parse(input);
        const body = sendMessageSchema.parse({ body: parsed.body, fileIds: parsed.fileIds });
        const message = await sendMessageForUser(
          socket.data.userId,
          parsed.conversationId,
          body,
        );
        ack({ ok: true, data: { message } });
      } catch (error) {
        ack(safeError(error));
      }
    });

    socket.on('message:read', async (input, ack) => {
      try {
        const parsed = conversationInputSchema.parse(input);
        const receipt = await markReadForUser(socket.data.userId, parsed.conversationId);
        io.to(`conversation:${parsed.conversationId}`).emit('message:read', receipt);
        ack({ ok: true, data: { receipt } });
      } catch (error) {
        ack(safeError(error));
      }
    });

    const typing = async (
      event: 'typing:start' | 'typing:stop',
      input: { conversationId: string },
      ack: (value: SocketAck) => void,
    ) => {
      try {
        const parsed = conversationInputSchema.parse(input);
        await assertConversationMember(socket.data.userId, parsed.conversationId);
        socket.to(`conversation:${parsed.conversationId}`).emit(event, {
          conversationId: parsed.conversationId,
          userId: socket.data.userId,
        });
        ack({ ok: true });
      } catch (error) {
        ack(safeError(error));
      }
    };
    socket.on('typing:start', (input, ack) => void typing('typing:start', input, ack));
    socket.on('typing:stop', (input, ack) => void typing('typing:stop', input, ack));

    socket.on('disconnect', () => {
      connectionCount = Math.max(0, connectionCount - 1);
      setGauge(MetricName.SOCKET_CONNECTIONS, connectionCount);
    });
  });

  const unregisterPublisher = registerRealtimePublisher(async (published) => {
    await Promise.all(
      published.memberUserIds.map(async (userId) => {
        const room = `user:${userId}`;
        io.to(room).emit('message:new', published.payload);
        const sockets = await io.in(room).fetchSockets();
        if (sockets.length > 0) await markDelivered(published.messageId, userId);
      }),
    );
  });

  return {
    async close(): Promise<void> {
      unregisterPublisher();
      await new Promise<void>((resolve) => io.close(() => resolve()));
      if (redisClients) {
        await Promise.allSettled([
          redisClients.publisher.quit(),
          redisClients.subscriber.quit(),
        ]);
      }
    },
  };
}
