import type { Prisma } from '@prisma/client';
import { ConflictError, ForbiddenError, NotFoundError, UnprocessableError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { decodeCursor, encodeCursor } from '../../common/pagination/pagination.js';
import { getPrisma } from '../../database/prisma.js';
import { EVENT_KEYS } from '../../platform/events/event-catalog.js';
import { emitEvent } from '../../platform/outbox/outbox.service.js';
import type { AuthContext } from '../auth/index.js';
import { publishPersistedMessage } from './realtime-hub.js';
import type { SendMessageInput } from './messaging.schema.js';

const MESSAGE_EDIT_WINDOW_MS = 15 * 60 * 1000;

const MESSAGE_INCLUDE = {
  sender: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      displayName: true,
      avatarFileId: true,
    },
  },
  attachments: true,
  receipts: true,
} satisfies Prisma.MessageInclude;

const CONVERSATION_INCLUDE = {
  members: {
    where: { leftAt: null },
    include: {
      user: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          displayName: true,
          avatarFileId: true,
          status: true,
        },
      },
    },
  },
  messages: {
    take: 1,
    orderBy: [{ createdAt: 'desc' as const }, { id: 'desc' as const }],
    include: MESSAGE_INCLUDE,
  },
} satisfies Prisma.ConversationInclude;

async function canMessageUser(senderId: string, targetId: string): Promise<boolean> {
  const prisma = getPrisma();
  const [sharedMembership, targetTalent, senderTalent, senderOrganisations, targetOrganisations] =
    await Promise.all([
      prisma.organisationMembership.count({
        where: {
          userId: senderId,
          status: 'ACTIVE',
          organisation: {
            memberships: { some: { userId: targetId, status: 'ACTIVE' } },
          },
        },
      }),
      prisma.talentProfile.findUnique({ where: { userId: targetId }, select: { id: true } }),
      prisma.talentProfile.findUnique({ where: { userId: senderId }, select: { id: true } }),
      prisma.organisationMembership.findMany({
        where: { userId: senderId, status: 'ACTIVE' },
        select: { organisationId: true },
      }),
      prisma.organisationMembership.findMany({
        where: { userId: targetId, status: 'ACTIVE' },
        select: { organisationId: true },
      }),
    ]);
  if (sharedMembership > 0) return true;
  if (targetTalent) {
    const organisations = senderOrganisations.map((row) => row.organisationId);
    if (
      await prisma.application.count({
        where: { talentProfileId: targetTalent.id, organisationId: { in: organisations }, screening: { is: { status: 'RELEASED_TO_COMPANY', releasedToCompanyAt: { not: null } } } },
      })
    ) {
      return true;
    }
  }
  if (senderTalent) {
    const organisations = targetOrganisations.map((row) => row.organisationId);
    if (
      await prisma.application.count({
        where: { talentProfileId: senderTalent.id, organisationId: { in: organisations }, screening: { is: { status: 'RELEASED_TO_COMPANY', releasedToCompanyAt: { not: null } } } },
      })
    ) {
      return true;
    }
  }
  return false;
}

async function validateMembers(
  creatorId: string,
  organisationId: string | null | undefined,
  requestedIds: string[],
) {
  const ids = [...new Set([creatorId, ...requestedIds])];
  const users = await getPrisma().user.findMany({
    where: { id: { in: ids }, status: 'ACTIVE' },
    select: { id: true },
  });
  if (users.length !== ids.length) {
    throw new NotFoundError(ErrorCode.NOT_FOUND, 'One or more conversation members were not found.');
  }
  if (organisationId) {
    const memberCount = await getPrisma().organisationMembership.count({
      where: { organisationId, userId: { in: ids }, status: 'ACTIVE' },
    });
    if (memberCount !== ids.length) {
      throw new NotFoundError(ErrorCode.NOT_FOUND, 'One or more conversation members were not found.');
    }
  } else {
    const allowed = await Promise.all(
      ids.filter((id) => id !== creatorId).map((id) => canMessageUser(creatorId, id)),
    );
    if (allowed.some((value) => !value)) {
      throw new NotFoundError(ErrorCode.NOT_FOUND, 'One or more conversation members were not found.');
    }
  }
  return ids;
}

export async function createConversation(
  auth: AuthContext,
  input: {
    organisationId?: string | null;
    type: 'DIRECT' | 'GROUP';
    title?: string | null;
    memberUserIds: string[];
  },
) {
  const memberIds = await validateMembers(auth.userId, input.organisationId, input.memberUserIds);
  if (input.type === 'DIRECT' && memberIds.length !== 2) {
    throw new UnprocessableError(
      ErrorCode.CONVERSATION_DIRECT_MEMBER_COUNT,
      'A direct conversation must have exactly two members.',
    );
  }
  if (input.type === 'GROUP' && (!input.organisationId || memberIds.length < 3 || !input.title)) {
    throw new UnprocessableError(
      ErrorCode.VALIDATION_FAILED,
      'A group conversation needs an organisation, title, and at least three members.',
    );
  }
  if (input.type === 'DIRECT') {
    const candidates = await getPrisma().conversation.findMany({
      where: {
        type: 'DIRECT',
        archivedAt: null,
        members: { some: { userId: auth.userId, leftAt: null } },
      },
      include: { members: { where: { leftAt: null }, select: { userId: true } } },
    });
    const existing = candidates.find((conversation) => {
      const stored = conversation.members.map((member) => member.userId).sort();
      return stored.length === 2 && stored.every((id, index) => id === [...memberIds].sort()[index]);
    });
    if (existing) {
      return getPrisma().conversation.findUniqueOrThrow({
        where: { id: existing.id },
        include: CONVERSATION_INCLUDE,
      });
    }
  }
  return getPrisma().$transaction(async (tx) => {
    const conversation = await tx.conversation.create({
      data: {
        organisationId: input.organisationId ?? null,
        type: input.type,
        title: input.title ?? null,
        createdById: auth.userId,
        members: {
          create: memberIds.map((userId) => ({
            userId,
            role: userId === auth.userId ? 'OWNER' : 'MEMBER',
          })),
        },
      },
      include: CONVERSATION_INCLUDE,
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.CONVERSATION_CREATED,
      aggregateType: 'Conversation',
      aggregateId: conversation.id,
      organisationId: input.organisationId ?? undefined,
      payload: { conversationId: conversation.id },
    });
    return conversation;
  });
}

export async function assertConversationMember(userId: string, conversationId: string) {
  const member = await getPrisma().conversationMember.findFirst({
    where: { conversationId, userId, leftAt: null },
    include: { conversation: true },
  });
  if (!member) {
    throw new NotFoundError(
      ErrorCode.CONVERSATION_NOT_FOUND,
      'That conversation was not found.',
    );
  }
  return member;
}

export async function listConversations(
  auth: AuthContext,
  query: { cursor?: string; limit: number; archived: boolean },
) {
  const decoded = query.cursor
    ? decodeCursor<{ updatedAt: string; id: string }>(query.cursor)
    : undefined;
  const cursorDate = decoded ? new Date(decoded.updatedAt) : undefined;
  const where: Prisma.ConversationWhereInput = {
    archivedAt: query.archived ? { not: null } : null,
    members: { some: { userId: auth.userId, leftAt: null } },
    ...(cursorDate && decoded
      ? {
          OR: [
            { updatedAt: { lt: cursorDate } },
            { updatedAt: cursorDate, id: { lt: decoded.id } },
          ],
        }
      : {}),
  };
  const rows = await getPrisma().conversation.findMany({
    where,
    include: CONVERSATION_INCLUDE,
    orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null,
  };
}

export async function getConversation(auth: AuthContext, conversationId: string) {
  await assertConversationMember(auth.userId, conversationId);
  return getPrisma().conversation.findUniqueOrThrow({
    where: { id: conversationId },
    include: CONVERSATION_INCLUDE,
  });
}

export async function listMessages(
  auth: AuthContext,
  conversationId: string,
  query: { cursor?: string; limit: number },
) {
  await assertConversationMember(auth.userId, conversationId);
  const decoded = query.cursor
    ? decodeCursor<{ createdAt: string; id: string }>(query.cursor)
    : undefined;
  const cursorDate = decoded ? new Date(decoded.createdAt) : undefined;
  const where: Prisma.MessageWhereInput = {
    conversationId,
    ...(cursorDate && decoded
      ? {
          OR: [
            { createdAt: { lt: cursorDate } },
            { createdAt: cursorDate, id: { lt: decoded.id } },
          ],
        }
      : {}),
  };
  const rows = await getPrisma().message.findMany({
    where,
    include: MESSAGE_INCLUDE,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit + 1,
  });
  const hasMore = rows.length > query.limit;
  const items = hasMore ? rows.slice(0, query.limit) : rows;
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.id }) : null,
  };
}

async function validateAttachments(userId: string, fileIds: string[]): Promise<string[]> {
  const ids = [...new Set(fileIds)];
  if (ids.length === 0) return [];
  const files = await getPrisma().fileObject.findMany({
    where: {
      id: { in: ids },
      ownerId: userId,
      category: 'MESSAGE_ATTACHMENT',
      status: 'READY',
    },
    select: { id: true },
  });
  if (files.length !== ids.length) {
    throw new NotFoundError(ErrorCode.FILE_NOT_FOUND, 'One or more attachments were not found.');
  }
  return ids;
}

export async function sendMessageForUser(
  userId: string,
  conversationId: string,
  input: SendMessageInput,
) {
  const membership = await assertConversationMember(userId, conversationId);
  if (membership.conversation.archivedAt) {
    throw new UnprocessableError(
      ErrorCode.CONVERSATION_ARCHIVED,
      'That conversation is archived.',
    );
  }
  const fileIds = await validateAttachments(userId, input.fileIds);
  const result = await getPrisma().$transaction(async (tx) => {
    const members = await tx.conversationMember.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });
    const recipientIds = members
      .map((member) => member.userId)
      .filter((memberId) => memberId !== userId);
    const message = await tx.message.create({
      data: {
        conversationId,
        senderId: userId,
        kind: fileIds.length > 0 && !input.body ? 'FILE' : 'TEXT',
        body: input.body ?? null,
        attachments: { create: fileIds.map((fileId) => ({ fileId })) },
        receipts: { create: recipientIds.map((recipientId) => ({ userId: recipientId })) },
      },
      include: MESSAGE_INCLUDE,
    });
    if (fileIds.length > 0) {
      await tx.fileUsage.createMany({
        data: fileIds.map((fileId) => ({
          fileId,
          resourceType: 'Message',
          resourceId: message.id,
          field: 'attachment',
        })),
      });
    }
    await tx.conversation.update({
      where: { id: conversationId },
      data: { lastMessageAt: message.createdAt },
    });
    await tx.conversationMember.updateMany({
      where: { conversationId, userId: { in: recipientIds }, leftAt: null },
      data: { unreadCount: { increment: 1 } },
    });
    await emitEvent(tx, {
      eventKey: EVENT_KEYS.MESSAGE_SENT,
      aggregateType: 'Message',
      aggregateId: message.id,
      organisationId: membership.conversation.organisationId ?? undefined,
      payload: { messageId: message.id, conversationId },
    });
    return { message, memberUserIds: members.map((member) => member.userId) };
  });
  await publishPersistedMessage({
    conversationId,
    messageId: result.message.id,
    memberUserIds: result.memberUserIds,
    payload: result.message,
  });
  return result.message;
}

export async function sendMessage(
  auth: AuthContext,
  conversationId: string,
  input: SendMessageInput,
) {
  return sendMessageForUser(auth.userId, conversationId, input);
}

export async function editMessage(
  auth: AuthContext,
  conversationId: string,
  messageId: string,
  input: { body: string; expectedUpdatedAt: Date },
) {
  await assertConversationMember(auth.userId, conversationId);
  const message = await getPrisma().message.findFirst({
    where: { id: messageId, conversationId, senderId: auth.userId, deletedAt: null },
  });
  if (!message) throw new NotFoundError(ErrorCode.MESSAGE_NOT_FOUND, 'That message was not found.');
  if (Date.now() - message.createdAt.getTime() > MESSAGE_EDIT_WINDOW_MS) {
    throw new UnprocessableError(ErrorCode.MESSAGE_NOT_EDITABLE, 'The edit window has closed.');
  }
  const changed = await getPrisma().message.updateMany({
    where: { id: messageId, updatedAt: input.expectedUpdatedAt },
    data: { body: input.body, editedAt: new Date() },
  });
  if (changed.count === 0) {
    throw new ConflictError(ErrorCode.STALE_WRITE, 'The message changed. Refresh and try again.');
  }
  return getPrisma().message.findUniqueOrThrow({
    where: { id: messageId },
    include: MESSAGE_INCLUDE,
  });
}

export async function deleteMessage(
  auth: AuthContext,
  conversationId: string,
  messageId: string,
  expectedUpdatedAt: Date,
) {
  await assertConversationMember(auth.userId, conversationId);
  const message = await getPrisma().message.findFirst({
    where: { id: messageId, conversationId, senderId: auth.userId, deletedAt: null },
  });
  if (!message) throw new NotFoundError(ErrorCode.MESSAGE_NOT_FOUND, 'That message was not found.');
  if (Date.now() - message.createdAt.getTime() > MESSAGE_EDIT_WINDOW_MS) {
    throw new UnprocessableError(ErrorCode.MESSAGE_NOT_EDITABLE, 'The delete window has closed.');
  }
  const changed = await getPrisma().message.updateMany({
    where: { id: messageId, updatedAt: expectedUpdatedAt },
    data: { body: null, deletedAt: new Date(), deletedById: auth.userId },
  });
  if (changed.count === 0) {
    throw new ConflictError(ErrorCode.STALE_WRITE, 'The message changed. Refresh and try again.');
  }
}

export async function markReadForUser(userId: string, conversationId: string) {
  await assertConversationMember(userId, conversationId);
  const now = new Date();
  await getPrisma().$transaction(async (tx) => {
    await tx.conversationMember.update({
      where: { conversationId_userId: { conversationId, userId } },
      data: { lastReadAt: now, unreadCount: 0 },
    });
    await tx.messageReceipt.updateMany({
      where: { userId, readAt: null, message: { conversationId, createdAt: { lte: now } } },
      data: { readAt: now, deliveredAt: now },
    });
  });
  return { conversationId, userId, readAt: now };
}

export async function markRead(auth: AuthContext, conversationId: string) {
  return markReadForUser(auth.userId, conversationId);
}

export async function markDelivered(messageId: string, userId: string): Promise<void> {
  await getPrisma().messageReceipt.updateMany({
    where: { messageId, userId, deliveredAt: null },
    data: { deliveredAt: new Date() },
  });
}

export async function archiveConversation(
  auth: AuthContext,
  conversationId: string,
  reason: string,
) {
  const member = await assertConversationMember(auth.userId, conversationId);
  if (member.role !== 'OWNER' && member.role !== 'ADMIN') {
    throw new ForbiddenError(
      ErrorCode.CONVERSATION_NOT_A_MEMBER,
      'Only a conversation owner can archive it.',
    );
  }
  return getPrisma().conversation.update({
    where: { id: conversationId },
    data: { archivedAt: new Date(), archivedReason: reason },
    include: CONVERSATION_INCLUDE,
  });
}

export async function leaveConversation(auth: AuthContext, conversationId: string): Promise<void> {
  const member = await assertConversationMember(auth.userId, conversationId);
  if (member.conversation.type === 'DIRECT') {
    throw new UnprocessableError(
      ErrorCode.CONVERSATION_CONTENT_RESTRICTED,
      'Direct conversations cannot be left; mute or archive them instead.',
    );
  }
  await getPrisma().conversationMember.update({
    where: { conversationId_userId: { conversationId, userId: auth.userId } },
    data: { leftAt: new Date(), unreadCount: 0 },
  });
}
