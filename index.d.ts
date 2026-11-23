/// <reference path="./src/shared-browser-modules.d.ts" />
/// <reference path="./src/types/byaf.d.ts" />
import { EventEmitter } from 'node:events';
import type {} from 'cookie-session'; // Load its Express.Request augmentation.
import { CsrfSyncedToken } from 'csrf-sync';
import { UserDirectoryList } from './src/user-types.ts';
import { User } from './src/user-storage.ts';
import { CommandLineArguments } from './src/command-line.ts';
import { EVENT_NAMES } from './src/server-events.ts';

/**
 * Event payload for SERVER_STARTED event.
 */
export interface ServerStartedEvent {
    /**
     * The URL the server is listening on.
     */
    url: URL;
}

/**
 * Map of all server events to their payload types.
 */
export interface ServerEventMap {
    [EVENT_NAMES.SERVER_STARTED]: [ServerStartedEvent];
}

declare global {
    namespace NodeJS {
        export interface Process {
            /**
             * A global instance of the server events emitter.
             */
            serverEvents: EventEmitter<ServerEventMap>;
        }
    }

    namespace CookieSessionInterfaces {
        export interface CookieSessionObject {
            /**
             * The CSRF token for the session.
             */
            csrfToken: CsrfSyncedToken;
            /**
             * Authenticated user handle.
             */
            handle: string | null;
            /**
             * Account version tag: shake256 derivative of password hash and salt.
             */
            version: string | null;
            /**
             * Last time the session was extended.
             */
            touch: number;
        }
    }

    namespace Express {
        export interface Request {
            user: {
                profile: User;
                directories: UserDirectoryList;
            };
        }
    }

    /**
     * The root directory for user data.
     */
    var DATA_ROOT: string;

    /**
     * Parsed command line arguments.
     */
    var COMMAND_LINE_ARGS: CommandLineArguments;
}
