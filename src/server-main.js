// native node modules
import fs from 'node:fs';
import path from 'node:path';
import util from 'node:util';
import dns from 'node:dns';
import process from 'node:process';
import http from 'node:http';
import https from 'node:https';

import cors from 'cors';
import { csrfSync } from 'csrf-sync';
import express from 'express';
import compression from 'compression';
import cookieSession from 'cookie-session';
import multer from 'multer';
import responseTime from 'response-time';
import helmet from 'helmet';
import bodyParser from 'body-parser';

// local library imports
import './fetch-patch.js';
import { serverDirectory } from './server-directory.js';

import { serverEvents, EVENT_NAMES } from './server-events.js';
import { loadPlugins } from './plugin-loader.js';
import {
    initUserStorage,
    getCookieSecret,
    getCookieSessionName,
    ensurePublicDirectoriesExist,
    getUserDirectoriesList,
    migrateSystemPrompts,
    migrateUserData,
    requireLoginMiddleware,
    setUserDataMiddleware,
    shouldRedirectToLogin,
    cleanUploads,
    getSessionCookieAge,
    verifySecuritySettings,
    loginPageMiddleware,
    setupPageMiddleware,
    settingsPageMiddleware,
    createLegacyLoginHtmlRedirectMiddleware,
    createLegacySetupHtmlRedirectMiddleware,
    needsSetup,
    migratePublicOverrides,
} from './users.js';

import getWebpackServeMiddleware from './middleware/webpack-serve.js';
import getViteLibServeMiddleware from './middleware/vite-lib-serve.js';
import { getReactLoginServeMiddleware } from './middleware/react-login-serve.js';
import basicAuthMiddleware from './middleware/basicAuth.js';
import getWhitelistMiddleware from './middleware/whitelist.js';
import accessLoggerMiddleware, { getAccessLogPath, migrateAccessLog } from './middleware/accessLogWriter.js';
import multerMonkeyPatch from './middleware/multerMonkeyPatch.js';
import initRequestProxy from './request-proxy.js';
import initPrivateRequestFilter from './private-request-filter.js';
import cacheBuster from './middleware/cacheBuster.js';
import corsProxyMiddleware from './middleware/corsProxy.js';
import errorHandlerMiddleware from './middleware/errorHandler.js';
import hostWhitelistMiddleware from './middleware/hostWhitelist.js';
import userCssMiddleware from './middleware/userCss.js';
import {
    CORS_PROXY_ROUTE,
    OAUTH_CALLBACK_ROUTE,
    disabledCorsProxyMiddleware,
    oauthCallbackMiddleware,
} from './express-route-compat.js';
import {
    getVersion,
    color,
    removeColorFormatting,
    getSeparator,
    safeReadFileSync,
    setupLogLevel,
    setWindowTitle,
    getConfigValue,
} from './util.js';
import { UPLOADS_DIRECTORY } from './constants.js';
import { REACT_LOGIN_BASE_PATH } from './react-login-feature.js';

// Routers
import { router as usersPublicRouter } from './endpoints/users-public.js';
import { init as statsInit, onExit as statsOnExit } from './endpoints/stats.js';
import { checkForNewContent } from './endpoints/content-manager.js';
import { init as settingsInit } from './endpoints/settings.js';
import { redirectDeprecatedEndpoints, ServerStartup, setupPrivateEndpoints, setupPublicEndpoints } from './server-startup.js';
import { diskCache } from './endpoints/characters.js';
import { migrateFlatSecrets } from './endpoints/secrets.js';
import { migrateGroupChatsMetadataFormat } from './endpoints/groups.js';
import { createServerStartupProfiler } from './server-startup-profiler.js';

// Unrestrict console logs display limit
util.inspect.defaultOptions.maxArrayLength = null;
util.inspect.defaultOptions.maxStringLength = null;
util.inspect.defaultOptions.depth = 4;

/** @type {import('./command-line.js').CommandLineArguments} */
const cliArgs = globalThis.COMMAND_LINE_ARGS;

if (!cliArgs.enableIPv6 && !cliArgs.enableIPv4) {
    console.error('error: You can\'t disable all internet protocols: at least IPv6 or IPv4 must be enabled.');
    process.exit(1);
}

// Set keep-alive preference for all HTTP/HTTPS requests.
http.globalAgent = new http.Agent({ keepAlive: cliArgs.enableKeepAlive });
https.globalAgent = new https.Agent({ keepAlive: cliArgs.enableKeepAlive });

const app = express();
const startupProfiler = createServerStartupProfiler(process.env.EMBERDESK_STARTUP_PROFILE);
let webpackMiddleware;
const publicRoot = path.join(serverDirectory, 'public');

/**
 * Phase 2: Register Express middleware and static file routes.
 * @param {import('express').Express} app The Express app
 * @param {import('./command-line.js').CommandLineArguments} cli The CLI arguments
 */
async function registerMiddleware(app, cli) {
    app.use(helmet({
        contentSecurityPolicy: false,
    }));
    app.use(compression());
    app.use(responseTime());

    app.use(bodyParser.json({ limit: '500mb' }));
    app.use(bodyParser.urlencoded({ extended: true, limit: '500mb' }));

    // CORS Settings //
    const corsEnabled = getConfigValue('cors.enabled', true, 'boolean');
    if (corsEnabled) {
        const corsOrigin = getConfigValue('cors.origin', 'null');
        const corsMethods = getConfigValue('cors.methods', ['OPTIONS']);
        const corsAllowedHeaders = getConfigValue('cors.allowedHeaders', []);
        const corsExposedHeaders = getConfigValue('cors.exposedHeaders', []);
        const corsCredentials = getConfigValue('cors.credentials', false, 'boolean');
        const corsMaxAge = getConfigValue('cors.maxAge', null, 'number');

        /** @type {cors.CorsOptions} */
        const corsOptions = {
            origin: corsOrigin,
            methods: corsMethods,
            credentials: corsCredentials,
        };
        if (Array.isArray(corsAllowedHeaders) && corsAllowedHeaders.length > 0) {
            corsOptions.allowedHeaders = corsAllowedHeaders;
        }
        if (Array.isArray(corsExposedHeaders) && corsExposedHeaders.length > 0) {
            corsOptions.exposedHeaders = corsExposedHeaders;
        }
        if (corsMaxAge !== null && Number.isInteger(corsMaxAge)) {
            corsOptions.maxAge = corsMaxAge;
        }
        app.use(cors(corsOptions));
    }

    // Legacy: basicAuthMode is deprecated. Use enableUserAccounts instead.
    // Retained for backward compatibility; will show a browser-native prompt before the login page.
    if (cli.listen && cli.basicAuthMode) {
        app.use(basicAuthMiddleware);
    }

    if (cli.whitelistMode) {
        const whitelistMiddleware = await getWhitelistMiddleware();
        app.use(whitelistMiddleware);
    }

    app.use(hostWhitelistMiddleware);

    if (cli.listen) {
        app.use(accessLoggerMiddleware());
    }

    app.use(cookieSession({
        name: getCookieSessionName(),
        sameSite: 'lax',
        httpOnly: true,
        maxAge: getSessionCookieAge(),
        secret: getCookieSecret(globalThis.DATA_ROOT),
    }));

    app.use(setUserDataMiddleware);

    // CSRF Protection //
    if (!cli.disableCsrf) {
        const csrfSyncProtection = csrfSync({
            getTokenFromState: (req) => {
                if (!req.session) {
                    console.error('(CSRF error) getTokenFromState: Session object not initialized');
                    return;
                }
                return req.session.csrfToken;
            },
            getTokenFromRequest: (req) => {
                return req.headers['x-csrf-token']?.toString();
            },
            storeTokenInState: (req, token) => {
                if (!req.session) {
                    console.error('(CSRF error) storeTokenInState: Session object not initialized');
                    return;
                }
                req.session.csrfToken = token;
            },
            skipCsrfProtection: (req) => {
                return cli.enableCorsProxy ? /^\/proxy\//.test(req.path) : false;
            },
            size: 32,
        });

        app.get('/csrf-token', (req, res) => {
            res.json({
                'token': csrfSyncProtection.generateToken(req),
            });
        });

        // Customize the error message
        csrfSyncProtection.invalidCsrfTokenError.message = color.red('Invalid CSRF token. Please refresh the page and try again.');
        csrfSyncProtection.invalidCsrfTokenError.stack = undefined;

        app.use(csrfSyncProtection.csrfSynchronisedProtection);
    } else {
        console.warn('\nCSRF protection is disabled. This will make your server vulnerable to CSRF attacks.\n');
        app.get('/csrf-token', (req, res) => {
            res.json({
                'token': 'disabled',
            });
        });
    }

    // Static files
    // Host index page
    app.get('/', cacheBuster.middleware, async (request, response) => {
        if (await needsSetup()) {
            return response.redirect('/setup');
        }

        if (shouldRedirectToLogin(request)) {
            const query = request.url.split('?')[1];
            const redirectUrl = query ? `/login?${query}` : '/login';
            return response.redirect(redirectUrl);
        }

        return response.sendFile('index.html', { root: publicRoot });
    });

    // Callback endpoint for OAuth PKCE flows (e.g. OpenRouter)
    app.get(OAUTH_CALLBACK_ROUTE, oauthCallbackMiddleware);

    // Host setup page (first-time admin account creation)
    app.get('/setup', setupPageMiddleware);
    app.get('/setup.html', createLegacySetupHtmlRedirectMiddleware());

    // Host login page
    app.get('/login', loginPageMiddleware);
    app.get('/login.html', createLegacyLoginHtmlRedirectMiddleware());

    // Host settings route
    app.get('/settings', settingsPageMiddleware);

    // Host frontend assets
    const viteLibMiddleware = getViteLibServeMiddleware();
    app.use(viteLibMiddleware);
    webpackMiddleware = getWebpackServeMiddleware();
    app.use(webpackMiddleware);
    app.use(REACT_LOGIN_BASE_PATH, getReactLoginServeMiddleware());
    app.use(userCssMiddleware);
    app.use(express.static(path.join(serverDirectory, 'public'), {}));

    // Public API
    app.use('/api/users', usersPublicRouter);
    setupPublicEndpoints(app);

    // Everything below this line requires authentication
    app.use(requireLoginMiddleware);
    app.post('/api/ping', (request, response) => {
        if (request.query.extend && request.session) {
            request.session.touch = Date.now();
        }

        response.sendStatus(204);
    });

    if (cli.enableCorsProxy) {
        app.use(CORS_PROXY_ROUTE, corsProxyMiddleware);
    } else {
        app.use(CORS_PROXY_ROUTE, disabledCorsProxyMiddleware);
    }

    // File uploads
    const uploadsPath = path.join(cli.dataRoot, UPLOADS_DIRECTORY);
    app.use(multer({ dest: uploadsPath, limits: { fieldSize: 500 * 1024 * 1024 } }).single('avatar'));
    app.use(multerMonkeyPatch);

    app.get('/version', async function (_, response) {
        const data = await getVersion();
        response.send(data);
    });
}

/**
 * Phase 4a: Run migrations, content checks, and plugin loading.
 * Returns cleanup resources as soon as they are available.
 * @returns {Promise<{cleanupPlugins: Function|null, diskCache: object, statsOnExit: Function, consoleTitle: string}>}
 */
async function collectCleanupResources() {
    startupProfiler.mark('preSetupTasks:start');
    const version = await getVersion();

    // Print formatted header
    console.log();
    console.log(`EmberDesk ${version.pkgVersion}`);
    if (version.gitBranch && version.commitDate) {
        const date = new Date(version.commitDate);
        const localDate = date.toLocaleString('en-US', { timeZoneName: 'short' });
        console.log(`Running '${version.gitBranch}' (${version.gitRevision}) - ${localDate}`);
        if (!version.isLatest && ['staging', 'release'].includes(version.gitBranch)) {
            console.log('INFO: Currently not on the latest commit.');
            console.log('      Run \'git pull\' to update. If you have any merge conflicts, run \'git reset --hard\' and \'git pull\' to reset your branch.');
        }
    }
    console.log();

    const directories = await startupProfiler.measure('getUserDirectoriesList', () => getUserDirectoriesList());
    await startupProfiler.measure('migrateGroupChatsMetadataFormat', () => migrateGroupChatsMetadataFormat(directories));
    await startupProfiler.measure('checkForNewContent', () => checkForNewContent(directories));
    await startupProfiler.measure('diskCache.verify', () => diskCache.verify(directories));
    await startupProfiler.measure('migrateFlatSecrets', () => Promise.resolve(migrateFlatSecrets(directories)));
    await startupProfiler.measure('cleanUploads', () => Promise.resolve(cleanUploads()));
    await startupProfiler.measure('migrateAccessLog', () => Promise.resolve(migrateAccessLog()));

    await startupProfiler.measure('settingsInit', () => settingsInit());
    await startupProfiler.measure('statsInit', () => statsInit());

    const pluginsDirectory = path.join(serverDirectory, 'plugins');
    const cleanupPlugins = await startupProfiler.measure('loadPlugins', () => loadPlugins(app, pluginsDirectory));
    const consoleTitle = process.title;

    return { cleanupPlugins, diskCache, statsOnExit, consoleTitle };
}

/**
 * Phase 4b: Initialize request filter, request proxy, and compile frontend.
 * Runs after cleanup resources and signal handlers are in place.
 * @returns {Promise<void>}
 */
async function initRemainingServices() {
    const requestFilterOptions = {
        listen: cliArgs.listen,
        enabled: !!getConfigValue('privateAddressWhitelist.enabled', false, 'boolean'),
        privateAddressWhitelist: getConfigValue('privateAddressWhitelist.allowedRanges', ['127.0.0.0/8', '::1/128']),
        logBlocked: !!getConfigValue('privateAddressWhitelist.log.blockedRequests', true, 'boolean'),
        logAllowed: !!getConfigValue('privateAddressWhitelist.log.allowedRequests', false, 'boolean'),
        allowUnresolvedHosts: !!getConfigValue('privateAddressWhitelist.allowUnresolvedHosts', false, 'boolean'),
        enableKeepAlive: cliArgs.enableKeepAlive,
    };
    await startupProfiler.measure('initPrivateRequestFilter', () => Promise.resolve(initPrivateRequestFilter(requestFilterOptions)));

    await startupProfiler.measure('initRequestProxy', () => Promise.resolve(initRequestProxy({ enabled: cliArgs.requestProxyEnabled, url: cliArgs.requestProxyUrl, bypass: cliArgs.requestProxyBypass, enableKeepAlive: cliArgs.enableKeepAlive, privateRequestFilterEnabled: requestFilterOptions.enabled })));

    await startupProfiler.measure('webpackCompile', () => webpackMiddleware.runWebpackCompiler({ pruneCache: true }));
    startupProfiler.mark('preSetupTasks:end');
}

/**
 * Tasks that need to be run after the server starts listening.
 * @param {import('./server-startup.js').ServerStartupResult} result The result of the server startup
 * @returns {Promise<void>}
 */
async function postSetupTasks(result) {
    const browserLaunchHostname = await cliArgs.getBrowserLaunchHostname(result);
    const browserLaunchUrl = cliArgs.getBrowserLaunchUrl(browserLaunchHostname);
    const browserLaunchApp = String(getConfigValue('browserLaunch.browser', 'default') ?? '');

    if (cliArgs.browserLaunchEnabled) {
        try {
            // Keep this lazy so startup can continue even when browser launching is not available.
            const openModule = await import('open');
            const { default: open, apps } = openModule;

            function getBrowsers() {
                const isAndroid = process.platform === 'android';
                if (isAndroid) {
                    return {};
                }
                return {
                    'firefox': apps.firefox,
                    'chrome': apps.chrome,
                    'edge': apps.edge,
                    'brave': apps.brave,
                };
            }

            const validBrowsers = getBrowsers();
            const appName = validBrowsers[browserLaunchApp.trim().toLowerCase()];
            const openOptions = appName ? { app: { name: appName } } : {};

            console.log(`Launching in a browser: ${browserLaunchApp}...`);
            await open(browserLaunchUrl.toString(), openOptions);
        } catch (error) {
            console.error('Failed to launch the browser. Open the URL manually.', error);
        }
    }

    if (cliArgs.heartbeatInterval > 0) {
        // Convert seconds to milliseconds for the timer
        const intervalMs = cliArgs.heartbeatInterval * 1000;
        const heartbeatPath = path.join(globalThis.DATA_ROOT, 'heartbeat.json');

        console.log(`Heartbeat enabled. Updating ${color.green(heartbeatPath)} every ${cliArgs.heartbeatInterval} seconds`);

        const writeHeartbeat = () => {
            try {
                fs.writeFileSync(heartbeatPath, JSON.stringify({ timestamp: Date.now() }));
            } catch (err) {
                console.error(`Failed to write heartbeat file at ${color.green(heartbeatPath)}:`, err.message);
            }
        };

        // Write immediately
        writeHeartbeat();

        // Loop using the converted milliseconds
        setInterval(writeHeartbeat, intervalMs).unref();
    }

    setWindowTitle('EmberDesk WebServer');

    let logListen = 'EmberDesk is listening on';

    if (result.useIPv6 && !result.v6Failed) {
        logListen += color.green(
            ' IPv6: ' + cliArgs.getIPv6ListenUrl().host,
        );
    }

    if (result.useIPv4 && !result.v4Failed) {
        logListen += color.green(
            ' IPv4: ' + cliArgs.getIPv4ListenUrl().host,
        );
    }

    const goToLog = `Go to: ${color.blue(browserLaunchUrl)} to open EmberDesk`;
    const plainGoToLog = removeColorFormatting(goToLog);

    console.log(logListen);
    if (cliArgs.listen) {
        console.log();
        console.log('To limit connections to internal localhost only ([::1] or 127.0.0.1), change the setting in config.yaml to "listen: false".');
        console.log('Check the "access.log" file in the data directory to inspect incoming connections:', color.green(getAccessLogPath()));
    }
    console.log('\n' + getSeparator(plainGoToLog.length) + '\n');
    console.log(goToLog);
    console.log('\n' + getSeparator(plainGoToLog.length) + '\n');

    setupLogLevel();
    serverEvents.emit(EVENT_NAMES.SERVER_STARTED, { url: browserLaunchUrl });
    startupProfiler.mark('server:listening', {
        url: browserLaunchUrl.toString(),
    });
    startupProfiler.flush({
        browserLaunchUrl: browserLaunchUrl.toString(),
    });
}

/**
 * Registers a not-found error response if a not-found error page exists. Should only be called after all other middlewares have been registered.
 */
function apply404Middleware() {
    const notFoundWebpage = safeReadFileSync(path.join(globalThis.DATA_ROOT, '_errors', 'url-not-found.html')) ?? '';
    app.use((req, res) => {
        res.status(404).send(notFoundWebpage);
    });
}

/**
 * Sets the DNS resolution order based on the command line arguments.
 */
function setDnsResolutionOrder() {
    try {
        if (cliArgs.dnsPreferIPv6) {
            dns.setDefaultResultOrder('ipv6first');
            console.log('Preferring IPv6 for DNS resolution');
        } else {
            dns.setDefaultResultOrder('ipv4first');
            console.log('Preferring IPv4 for DNS resolution');
        }
    } catch (error) {
        console.warn('Failed to set DNS resolution order.', error);
    }
}

/**
 * Phase 1: Data-layer initialization. No Express dependency.
 * @returns {Promise<void>}
 */
async function initDataPhase() {
    await startupProfiler.measure('initUserStorage', () => initUserStorage(globalThis.DATA_ROOT));
    await startupProfiler.measure('setDnsResolutionOrder', () => Promise.resolve(setDnsResolutionOrder()));
    await startupProfiler.measure('ensurePublicDirectoriesExist', () => ensurePublicDirectoriesExist());
    await startupProfiler.measure('migrateUserData', () => migrateUserData());
    await startupProfiler.measure('migrateSystemPrompts', () => migrateSystemPrompts());
    await startupProfiler.measure('migratePublicOverrides', () => migratePublicOverrides());
    await startupProfiler.measure('verifySecuritySettings', () => verifySecuritySettings());
}

/**
 * Creates a one-shot cleanup handler for graceful shutdown.
 * @param {{cleanupPlugins: Function|null, diskCache: object, statsOnExit: Function, consoleTitle: string}} resources
 * @returns {() => Promise<void>}
 */
function createCleanupHandler(resources) {
    let isExiting = false;
    return async function exitProcess() {
        if (isExiting) return;
        isExiting = true;
        await resources.statsOnExit();
        if (typeof resources.cleanupPlugins === 'function') {
            await resources.cleanupPlugins();
        }
        resources.diskCache.dispose();
        setWindowTitle(resources.consoleTitle);
        process.exit();
    };
}

async function main() {
    startupProfiler.mark('bootstrap:start');
    await initDataPhase();
    await registerMiddleware(app, cliArgs);
    redirectDeprecatedEndpoints(app);
    setupPrivateEndpoints(app);
    const resources = await collectCleanupResources();
    const exitProcess = createCleanupHandler(resources);
    process.on('SIGINT', exitProcess);
    process.on('SIGTERM', exitProcess);
    process.on('uncaughtException', (err) => {
        console.error('Uncaught exception:', err);
        exitProcess();
    });
    await initRemainingServices();
    app.use(errorHandlerMiddleware);
    await startupProfiler.measure('apply404Middleware', () => Promise.resolve(apply404Middleware()));
    const result = await startupProfiler.measure('serverStartup.start', () => new ServerStartup(app, cliArgs).start());
    await postSetupTasks(result);
}

main().catch((error) => {
    startupProfiler.mark('bootstrap:error', {
        message: String(error?.message ?? error),
    });
    startupProfiler.flush({
        error: String(error?.stack ?? error),
    });
    throw error;
});
