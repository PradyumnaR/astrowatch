"use client";

import { useCallback, useEffect, useState } from "react";

// One saved conversation per user per browser. Including the user id in
// the key means another account signing in on the same browser never
// picks up this user's conversation.
const storageKey = (userId: string) => `astrowatch:conversation:${userId}`;

function readStored(userId: string): string | null {
  try {
    return localStorage.getItem(storageKey(userId));
  } catch {
    return null; // storage blocked (e.g. some private modes)
  }
}

function writeStored(userId: string, conversationId: string): void {
  try {
    localStorage.setItem(storageKey(userId), conversationId);
  } catch {
    // Not fatal: the chat still works, it just won't survive a reload
  }
}

export function useConversation(userId: string | null | undefined) {
  const [conversationId, setConversationId] = useState<string | null>(null);

  // Read in an effect, not during render: localStorage doesn't exist when
  // Next.js renders this component on the server.
  useEffect(() => {
    if (!userId) {
      setConversationId(null);
      return;
    }
    let id = readStored(userId);
    if (!id) {
      id = crypto.randomUUID();
      writeStored(userId, id);
    }
    setConversationId(id);
  }, [userId]);

  const startNewConversation = useCallback(() => {
    if (!userId) return;
    const id = crypto.randomUUID();
    writeStored(userId, id);
    setConversationId(id);
  }, [userId]);

  return { conversationId, startNewConversation };
}
