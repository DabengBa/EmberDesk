import https from 'node:https';
import http from 'node:http';
import fs from 'node:fs';
import { color, urlHostnameToIPv6, getHasIP } from './util.ts';

import type { Express } from 'express';
import type { CommandLineArguments } from './command-line.ts';

export type ServerStartupResult = {
    v6Failed: boolean; v4Failed: boolean; v6Error?: unknown; v4Error?: unknown; useIPv6: boolean; useIPv4: boolean;
};

// Express routers
import { router as userDataRouter } from './user-files.ts';
import { router as usersPrivateRouter } from './endpoints/users-private-routes.ts';
import { router as usersAdminRouter } from './endpoints/users-admin-routes.ts';
import { router as imagesRouter } from './endpoints/images.ts';
import { router as openAiRouter } from './endpoints/openai.ts';
import { router as tokenizersRouter } from './endpoints/tokenizers.ts';
import { router as presetsRouter } from './endpoints/presets.ts';
import { router as secretsRouter } from './endpoints/secrets.ts';
import { router as thumbnailRouter } from './endpoints/thumbnails.ts';
import { router as assetsRouter } from './endpoints/assets.ts';
import { router as filesRouter } from './endpoints/files.ts';
import { router as charactersRouter } from './endpoints/characters.ts';
import { router as characterReplaceCoordinationRouter } from './endpoints/character-replace-coordination.ts';
import { router as chatsRouter } from './endpoints/chats.ts';
import { router as worldInfoRouter } from './endpoints/worldinfo-routes.ts';
import { router as contentManagerRouter } from './endpoints/content-manager.ts';
import { router as settingsRouter } from './endpoints/settings-routes.ts';
import { router as chatCompletionsRouter } from './endpoints/backends/chat-completions.ts';
import { router as backupsRouter } from './endpoints/backups.ts';
import { router as wireLogRouter } from './endpoints/wire-log.ts';
import { setupHealthEndpoint } from './endpoints/health.ts';

/**
 * Redirect deprecated API endpoints to their replacements.
 * @param {import('express').Express} app The Express app to use
 */
export function redirectDeprecatedEndpoints(app: Express): void {
    /**
     * Redirect a deprecated API endpoint URL to its replacement. Because fetch, form submissions, and $.ajax follow
     * redirects, this is transparent to client-side code.
     * @param {string} src The URL to redirect from.
     * @param {string} destination The URL to redirect to.
     */
    function redirect(src: string, destination: string): void {
        app.use(src, (req, res) => {
            console.warn(`API endpoint ${src} is deprecated; use ${destination} instead`);
            // HTTP 301 causes the request to become a GET. 308 preserves the request method.
            res.redirect(308, destination);
        });
    }

    redirect('/createcharacter', '/api/characters/create');
    redirect('/renamecharacter', '/api/characters/rename');
    redirect('/editcharacter', '/api/characters/edit');
    redirect('/editcharacterattribute', '/api/characters/edit-attribute');
    redirect('/v2/editcharacterattribute', '/api/characters/merge-attributes');
    redirect('/deletecharacter', '/api/characters/delete');
    redirect('/getcharacters', '/api/characters/all');
    redirect('/getonecharacter', '/api/characters/get');
    redirect('/getallchatsofcharacter', '/api/characters/chats');
    redirect('/importcharacter', '/api/characters/import');
    redirect('/dupecharacter', '/api/characters/duplicate');
    redirect('/exportcharacter', '/api/characters/export');
    redirect('/savechat', '/api/chats/save');
    redirect('/getchat', '/api/chats/get');
    redirect('/renamechat', '/api/chats/rename');
    redirect('/delchat', '/api/chats/delete');
    redirect('/exportchat', '/api/chats/export');
    redirect('/importchat', '/api/chats/import');
    redirect('/getworldinfo', '/api/worldinfo/get');
    redirect('/deleteworldinfo', '/api/worldinfo/delete');
    redirect('/importworldinfo', '/api/worldinfo/import');
    redirect('/editworldinfo', '/api/worldinfo/edit');
    redirect('/uploadimage', '/api/images/upload');
    redirect('/listimgfiles/:folder', '/api/images/list/:folder');
    redirect('/api/content/import', '/api/content/importURL');
}

/**
 * Setup the routers for the endpoints.
 * @param {import('express').Express} app The Express app to use
 */
export function setupPublicEndpoints(app: Express): void {
    setupHealthEndpoint(app);
}

/**
 * Setup the routers for the endpoints.
 * @param {import('express').Express} app The Express app to use
 */
export function setupPrivateEndpoints(app: Express): void {
    app.use('/', userDataRouter);
    app.use('/api/users', usersPrivateRouter);
    app.use('/api/users', usersAdminRouter);
    app.use('/api/images', imagesRouter);
    app.use('/api/openai', openAiRouter);
    app.use('/api/tokenizers', tokenizersRouter);
    app.use('/api/presets', presetsRouter);
    app.use('/api/secrets', secretsRouter);
    app.use('/thumbnail', thumbnailRouter);
    app.use('/api/assets', assetsRouter);
    app.use('/api/files', filesRouter);
    app.use('/api/characters', charactersRouter);
    app.use('/api/character-replace-coordination', characterReplaceCoordinationRouter);
    app.use('/api/chats', chatsRouter);
    app.use('/api/worldinfo', worldInfoRouter);
    app.use('/api/content', contentManagerRouter);
    app.use('/api/settings', settingsRouter);
    app.use('/api/backends/chat-completions', chatCompletionsRouter);
    app.use('/api/backups', backupsRouter);
    app.use('/api/wire-logs', wireLogRouter);
}

/**
 * Utilities for starting the express server.
 */
export class ServerStartup {
    /**
     * Creates a new ServerStartup instance.
     * @param {import('express').Express} app The Express app to use
     * @param {import('./command-line.ts').CommandLineArguments} cliArgs The command-line arguments
     */
    declare app: Express;
    declare cliArgs: CommandLineArguments;

    constructor(app: Express, cliArgs: CommandLineArguments) {
        this.app = app;
        this.cliArgs = cliArgs;
    }

    /**
     * Prints a fatal error message and exits the process.
     * @param {string} message
     */
    #fatal(message: string): never {
        console.error(color.red(message));
        process.exit(1);
    }

    /**
     * Checks if the error was caused by an occupied port.
     * @param {unknown} error
     * @returns {error is NodeJS.ErrnoException}
     */
    #isAddressInUseError(error: unknown): error is NodeJS.ErrnoException {
        return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EADDRINUSE';
    }

    /**
     * Gets a readable listen address for an IP version.
     * @param {URL} url The URL to listen on
     * @param {number} ipVersion The IP version to use
     * @returns {string}
     */
    #getListenAddress(url: URL, ipVersion: number): string {
        const host = ipVersion === 6 ? urlHostnameToIPv6(url.hostname) : url.hostname;
        return `${host}:${Number(url.port || (this.cliArgs.ssl ? 443 : 80))}`;
    }

    /**
     * Builds a user-facing error for an occupied port.
     * @param {URL} url The URL that failed to bind
     * @param {number} ipVersion The IP version that failed
     * @returns {string}
     */
    #getAddressInUseMessage(url: URL, ipVersion: number): string {
        const listenAddress = this.#getListenAddress(url, ipVersion);
        return `Address ${listenAddress} is already in use. Another EmberDesk instance may already be running. Stop the other process or change "port" in config.jsonc.`;
    }

    /**
     * Checks if SSL options are valid. If not, it will print an error message and exit the process.
     * @returns {void}
     */
    #verifySslOptions(): void {
        if (!this.cliArgs.ssl) return;

        if (!this.cliArgs.certPath) {
            this.#fatal('Error: SSL certificate path is required when using HTTPS. Check your config');
        }

        if (!this.cliArgs.keyPath) {
            this.#fatal('Error: SSL key path is required when using HTTPS. Check your config');
        }

        if (!fs.existsSync(this.cliArgs.certPath)) {
            this.#fatal('Error: SSL certificate path does not exist');
        }

        if (!fs.existsSync(this.cliArgs.keyPath)) {
            this.#fatal('Error: SSL key path does not exist');
        }
    }

    /**
     * Creates an HTTPS server.
     * @param {URL} url The URL to listen on
     * @param {number} ipVersion the ip version to use
     * @returns {Promise<void>} A promise that resolves when the server is listening
     */
    #createHttpsServer(url: URL, ipVersion: number): Promise<void> {
        this.#verifySslOptions();
        return new Promise((resolve, reject) => {
            /** @type {import('https').ServerOptions} */
            const sslOptions = {
                cert: fs.readFileSync(this.cliArgs.certPath),
                key: fs.readFileSync(this.cliArgs.keyPath),
                passphrase: String(this.cliArgs.keyPassphrase ?? ''),
            };
            const server = https.createServer(sslOptions, this.app);
            server.on('error', reject);
            server.on('listening', resolve);

            let host = url.hostname;
            if (ipVersion === 6) host = urlHostnameToIPv6(url.hostname);
            server.listen({
                host: host,
                port: Number(url.port || 443),
                // see https://nodejs.org/api/net.html#serverlisten for why ipv6Only is used
                ipv6Only: true,
            });
        });
    }

    /**
     * Creates an HTTP server.
     * @param {URL} url The URL to listen on
     * @param {number} ipVersion the ip version to use
     * @returns {Promise<void>} A promise that resolves when the server is listening
     */
    #createHttpServer(url: URL, ipVersion: number): Promise<void> {
        return new Promise((resolve, reject) => {
            const server = http.createServer(this.app);
            server.on('error', reject);
            server.on('listening', resolve);

            let host = url.hostname;
            if (ipVersion === 6) host = urlHostnameToIPv6(url.hostname);
            server.listen({
                host: host,
                port: Number(url.port || 80),
                // see https://nodejs.org/api/net.html#serverlisten for why ipv6Only is used
                ipv6Only: true,
            });
        });
    }

    /**
     * Starts the server using http or https depending on config
     * @param {boolean} useIPv6 If use IPv6
     * @param {boolean} useIPv4 If use IPv4
     * @returns {Promise<[boolean, boolean, unknown, unknown]>} A promise that resolves with an array of booleans indicating if the server failed to start on IPv6 and IPv4, respectively, and the corresponding errors
     */
    async #startHTTPorHTTPS(useIPv6: boolean, useIPv4: boolean): Promise<[boolean, boolean, unknown, unknown]> {
        let v6Failed = false;
        let v4Failed = false;
        let v6Error: unknown;
        let v4Error: unknown;

        const createFunc = this.cliArgs.ssl ? this.#createHttpsServer.bind(this) : this.#createHttpServer.bind(this);

        if (useIPv6) {
            try {
                await createFunc(this.cliArgs.getIPv6ListenUrl(), 6);
            } catch (error) {
                console.error('Warning: failed to start server on IPv6');
                if (this.#isAddressInUseError(error)) {
                    console.error(this.#getAddressInUseMessage(this.cliArgs.getIPv6ListenUrl(), 6));
                } else {
                    console.error(error);
                }

                v6Failed = true;
                v6Error = error;
            }
        }

        if (useIPv4) {
            try {
                await createFunc(this.cliArgs.getIPv4ListenUrl(), 4);
            } catch (error) {
                console.error('Warning: failed to start server on IPv4');
                if (this.#isAddressInUseError(error)) {
                    console.error(this.#getAddressInUseMessage(this.cliArgs.getIPv4ListenUrl(), 4));
                } else {
                    console.error(error);
                }

                v4Failed = true;
                v4Error = error;
            }
        }

        return [v6Failed, v4Failed, v6Error, v4Error];
    }

    /**
     * Handles the case where the server failed to start on one or both protocols.
     * @param {ServerStartupResult} result The results of the server startup
     * @returns {void}
     */
    #handleServerListenFail({ v6Failed, v4Failed, v6Error, v4Error, useIPv6, useIPv4 }: ServerStartupResult): void {
        if (v6Failed && !useIPv4) {
            if (this.#isAddressInUseError(v6Error)) {
                this.#fatal('Error: Startup aborted because IPv6 is the only enabled protocol and its listen port is already in use.');
            }
            this.#fatal('Error: Failed to start server on IPv6 and IPv4 disabled');
        }

        if (v4Failed && !useIPv6) {
            if (this.#isAddressInUseError(v4Error)) {
                this.#fatal('Error: Startup aborted because IPv4 is the only enabled protocol and its listen port is already in use.');
            }
            this.#fatal('Error: Failed to start server on IPv4 and IPv6 disabled');
        }

        if (v6Failed && v4Failed) {
            if (this.#isAddressInUseError(v6Error) && this.#isAddressInUseError(v4Error)) {
                this.#fatal('Error: Failed to start server because the configured IPv6 and IPv4 listen ports are already in use.');
            }
            this.#fatal('Error: Failed to start server on both IPv6 and IPv4');
        }
    }

    /**
     * Performs the server startup.
     * @returns {Promise<ServerStartupResult>} A promise that resolves with an object containing the results of the server startup
     */
    async start(): Promise<ServerStartupResult> {
        let useIPv6 = (this.cliArgs.enableIPv6 === true);
        let useIPv4 = (this.cliArgs.enableIPv4 === true);

        if (this.cliArgs.enableIPv6 === 'auto' || this.cliArgs.enableIPv4 === 'auto') {
            const ipQuery = await getHasIP();
            let hasIPv6 = false, hasIPv4 = false;

            hasIPv6 = this.cliArgs.listen ? ipQuery.hasIPv6Any : ipQuery.hasIPv6Local;
            if (this.cliArgs.enableIPv6 === 'auto') {
                useIPv6 = hasIPv6;
            }
            if (hasIPv6) {
                if (useIPv6) {
                    console.log(color.green('IPv6 support detected'));
                } else {
                    console.log('IPv6 support detected (but disabled)');
                }
            }

            hasIPv4 = this.cliArgs.listen ? ipQuery.hasIPv4Any : ipQuery.hasIPv4Local;
            if (this.cliArgs.enableIPv4 === 'auto') {
                useIPv4 = hasIPv4;
            }
            if (hasIPv4) {
                if (useIPv4) {
                    console.log(color.green('IPv4 support detected'));
                } else {
                    console.log('IPv4 support detected (but disabled)');
                }
            }

            if (this.cliArgs.enableIPv6 === 'auto' && this.cliArgs.enableIPv4 === 'auto') {
                if (!hasIPv6 && !hasIPv4) {
                    console.error('Both IPv6 and IPv4 are not detected');
                    process.exit(1);
                }
            }
        }

        if (!useIPv6 && !useIPv4) {
            console.error('Both IPv6 and IPv4 are disabled or not detected');
            process.exit(1);
        }

        const [v6Failed, v4Failed, v6Error, v4Error] = await this.#startHTTPorHTTPS(useIPv6, useIPv4);
        const result = { v6Failed, v4Failed, v6Error, v4Error, useIPv6, useIPv4 };
        this.#handleServerListenFail(result);
        return result;
    }
}
