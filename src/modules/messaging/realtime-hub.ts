export interface PublishedMessage {
  conversationId: string;
  messageId: string;
  memberUserIds: string[];
  payload: unknown;
}

type Publisher = (message: PublishedMessage) => Promise<void> | void;

let publisher: Publisher | undefined;

export function registerRealtimePublisher(next: Publisher): () => void {
  publisher = next;
  return () => {
    if (publisher === next) publisher = undefined;
  };
}

export async function publishPersistedMessage(message: PublishedMessage): Promise<void> {
  await publisher?.(message);
}
