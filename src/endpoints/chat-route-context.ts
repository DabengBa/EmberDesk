import type { DatabaseSync } from 'node:sqlite';
import type { Request } from 'express';
import type { UserDirectoryList } from '../user-types.ts';

// JS state gates return an actual database only on the successful branch.
type WriteState =
    | { ok: true; blocked?: false; db: DatabaseSync }
    | { ok: false; blocked?: boolean; reason?: string };
type ReadState =
    | { ok: true; db: DatabaseSync }
    | { ok: false; reason?: string };
type LegacyContext = typeof import('./chats.ts').chatRouteContext;

// Type-only dependency view; no runtime import of the compatibility router.
export type ChatRouteContext = Omit<LegacyContext, 'getCanonicalChatWriteState' | 'getCanonicalChatReadState' | 'getBackupFunction' | 'reconcileCanonicalChatSources'> & {
    getCanonicalChatWriteState: (request: Request) => Promise<WriteState>;
    getCanonicalChatReadState: (request: Request) => Promise<ReadState>;
    getBackupFunction: (handle: string | null) => ReturnType<LegacyContext['getBackupFunction']>;
    // Runtime supports an absent groupChats directory; its shared declaration
    // still requires that historical field. Do not invent it on the request.
    reconcileCanonicalChatSources: (options: { db: DatabaseSync; directories: UserDirectoryList; ownerType: 'character'; ownerId: string }) => ReturnType<LegacyContext['reconcileCanonicalChatSources']>;
};
