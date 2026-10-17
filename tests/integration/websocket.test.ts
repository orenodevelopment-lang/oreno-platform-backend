import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { io as createClient, type Socket } from 'socket.io-client';
import { describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { getPrisma } from '../../src/database/prisma.js';
import { createSession } from '../../src/modules/auth/session.service.js';
import { installMessagingSocket } from '../../src/modules/messaging/messaging.socket.js';
import { createTestUser } from '../helpers/factories.js';

interface Ack {
  ok: boolean;
  data?: { message?: { id: string; body: string | null } };
  error?: { code: string; message: string };
}

function connectSocket(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createClient(url, {
      path: '/socket.io',
      transports: ['websocket'],
      forceNew: true,
      reconnection: false,
      auth: { token },
    });
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error('Timed out connecting realtime client.'));
    }, 5_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', (error) => {
      clearTimeout(timer);
      socket.close();
      reject(error);
    });
  });
}

function emitAck(socket: Socket, event: string, payload: unknown): Promise<Ack> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event} ack.`)), 5_000);
    socket.emit(event, payload, (ack: Ack) => {
      clearTimeout(timer);
      resolve(ack);
    });
  });
}

describe('authenticated messaging websocket', () => {
  it('authorises every room action and persists a message before delivery', async () => {
    const prisma = getPrisma();
    const [sender, recipient, outsider] = await Promise.all([
      createTestUser('socket-sender'),
      createTestUser('socket-recipient'),
      createTestUser('socket-outsider'),
    ]);
    const conversation = await prisma.conversation.create({
      data: {
        type: 'DIRECT',
        createdById: sender.id,
        members: {
          create: [
            { userId: sender.id, role: 'OWNER' },
            { userId: recipient.id, role: 'MEMBER' },
          ],
        },
      },
    });
    const [senderSession, recipientSession, outsiderSession] = await Promise.all([
      createSession({ userId: sender.id, mfaSatisfied: true }),
      createSession({ userId: recipient.id, mfaSatisfied: true }),
      createSession({ userId: outsider.id, mfaSatisfied: true }),
    ]);

    const server = createServer(createApp());
    const realtime = await installMessagingSocket(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}`;
    const sockets: Socket[] = [];
    try {
      await expect(connectSocket(url, 'invalid-session-token')).rejects.toMatchObject({
        message: 'SESSION_EXPIRED',
      });
      const [senderSocket, recipientSocket, outsiderSocket] = await Promise.all([
        connectSocket(url, senderSession.token),
        connectSocket(url, recipientSession.token),
        connectSocket(url, outsiderSession.token),
      ]);
      sockets.push(senderSocket, recipientSocket, outsiderSocket);

      expect(
        await emitAck(senderSocket, 'conversation:join', { conversationId: conversation.id }),
      ).toEqual({ ok: true });
      expect(
        await emitAck(recipientSocket, 'conversation:join', {
          conversationId: conversation.id,
        }),
      ).toEqual({ ok: true });
      expect(
        await emitAck(outsiderSocket, 'conversation:join', {
          conversationId: conversation.id,
        }),
      ).toMatchObject({ ok: false, error: { code: 'CONVERSATION_NOT_FOUND' } });
      expect(
        await emitAck(outsiderSocket, 'typing:start', { conversationId: conversation.id }),
      ).toMatchObject({ ok: false, error: { code: 'CONVERSATION_NOT_FOUND' } });

      const received = new Promise<{ id: string; body: string }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Timed out waiting for message:new.')), 5_000);
        recipientSocket.once('message:new', (payload: unknown) => {
          clearTimeout(timer);
          resolve(payload as { id: string; body: string });
        });
      });
      const sendAck = await emitAck(senderSocket, 'message:send', {
        conversationId: conversation.id,
        body: 'Persist before emitting.',
        fileIds: [],
      });
      expect(sendAck).toMatchObject({ ok: true });
      const messageId = sendAck.data?.message?.id;
      expect(messageId).toBeTruthy();
      const delivered = await received;
      expect(delivered).toMatchObject({ id: messageId, body: 'Persist before emitting.' });
      expect(
        await prisma.message.findUnique({ where: { id: messageId } }),
      ).toMatchObject({ id: messageId, conversationId: conversation.id, senderId: sender.id });
      expect(
        await emitAck(outsiderSocket, 'message:send', {
          conversationId: conversation.id,
          body: 'Forbidden',
          fileIds: [],
        }),
      ).toMatchObject({ ok: false, error: { code: 'CONVERSATION_NOT_FOUND' } });
    } finally {
      for (const socket of sockets) socket.close();
      await realtime.close();
      await new Promise<void>((resolve, reject) => {
        if (!server.listening) {
          resolve();
          return;
        }
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });
});
