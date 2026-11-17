import fs from 'node:fs';
import path from 'node:path';
import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import ipRegex from 'ip-regex';
import envPaths from 'env-paths';
import { color, getConfigValue, stringToBool } from './util.js';
import { initConfig } from './config-init.ts';

import type { ServerStartupResult } from './server-startup.ts';

export type ParsedArgv = {
    isGlobal: boolean; configPath: string; dataRoot: string | null;
    port: number | null; listen: boolean | null; listenAddressIPv6: string | null; listenAddressIPv4: string | null;
    enableIPv4: string | null; enableIPv6: string | null; dnsPreferIPv6: boolean | null; heartbeatInterval: number | null;
    browserLaunchEnabled: boolean | null; browserLaunchHostname: string | null; browserLaunchPort: number | null;
    browserLaunchAvoidLocalhost: boolean | null; enableCorsProxy: boolean | null; disableCsrf: boolean | null;
    ssl: boolean | null; certPath: string | null; keyPath: string | null; keyPassphrase: string | null;
    whitelistMode: boolean | null; basicAuthMode: boolean | null; enableKeepAlive: boolean | null;
    requestProxyEnabled: boolean | null; requestProxyUrl: string | null; requestProxyBypass: string[] | null;
};
export type CommandLineArguments = {
    configPath: string; dataRoot: string; port: number; listen: boolean; listenAddressIPv6: string; listenAddressIPv4: string;
    enableIPv4: boolean | string; enableIPv6: boolean | string; dnsPreferIPv6: boolean; heartbeatInterval: number;
    browserLaunchEnabled: boolean; browserLaunchHostname: string; browserLaunchPort: number; browserLaunchAvoidLocalhost: boolean;
    enableCorsProxy: boolean; disableCsrf: boolean; ssl: boolean; certPath: string; keyPath: string; keyPassphrase: string;
    whitelistMode: boolean; basicAuthMode: boolean; enableKeepAlive: boolean; requestProxyEnabled: boolean;
    requestProxyUrl: string; requestProxyBypass: string[]; getIPv4ListenUrl: () => URL; getIPv6ListenUrl: () => URL;
    getBrowserLaunchHostname: (result: ServerStartupResult) => Promise<string>; getBrowserLaunchUrl: (hostname: string) => URL;
};

/**
 * Phase 1 — Pure argv parsing, no side effects.
 * Reads argv, detects global mode, derives configPath.
 * @param {string[]} args Process startup arguments
 * @returns {ParsedArgv} Raw CLI arguments
 */
export function parseArgv(args: string[]): ParsedArgv {
    const cliArguments = yargs(hideBin(args))
        .usage('Usage: <your-start-script> [options]\nOptions that are not provided will be filled with config values.')
        .option('global', {
            type: 'boolean',
            default: null,
            describe: 'Use global data and config paths instead of the server directory',
        })
        .option('configPath', {
            type: 'string',
            default: null,
            describe: 'Path to the config file (only for standalone mode)',
        })
        .option('enableIPv6', {
            type: 'string',
            default: null,
            describe: 'Enables IPv6 protocol',
        })
        .option('enableIPv4', {
            type: 'string',
            default: null,
            describe: 'Enables IPv4 protocol',
        })
        .option('port', {
            type: 'number',
            default: null,
            describe: 'Sets the server listening port',
        })
        .option('dnsPreferIPv6', {
            type: 'boolean',
            default: null,
            describe: 'Prefers IPv6 for DNS\nYou should probably have the enabled if you\'re on an IPv6 only network',
        })
        .option('browserLaunchEnabled', {
            type: 'boolean',
            default: null,
            describe: 'Automatically launch EmberDesk in the browser',
        })
        .option('browserLaunchHostname', {
            type: 'string',
            default: null,
            describe: 'Sets the browser launch hostname, best left on \'auto\'.\nUse values like \'localhost\', \'st.example.com\'',
        })
        .option('browserLaunchPort', {
            type: 'number',
            default: null,
            describe: 'Overrides the port for browser launch with open your browser with this port and ignore what port the server is running on. -1 is use server port',
        })
        .option('browserLaunchAvoidLocalhost', {
            type: 'boolean',
            default: null,
            describe: 'Avoids using \'localhost\' for browser launch in auto mode.\nUse if you don\'t have \'localhost\' in your hosts file',
        })
        .option('listen', {
            type: 'boolean',
            default: null,
            describe: 'Whether to listen on all network interfaces',
        })
        .option('listenAddressIPv6', {
            type: 'string',
            default: null,
            describe: 'Specific IPv6 address to listen to',
        })
        .option('listenAddressIPv4', {
            type: 'string',
            default: null,
            describe: 'Specific IPv4 address to listen to',
        })
        .option('corsProxy', {
            type: 'boolean',
            default: null,
            describe: 'Enables CORS proxy',
        })
        .option('disableCsrf', {
            type: 'boolean',
            default: null,
            describe: 'Disables CSRF protection - NOT RECOMMENDED',
        })
        .option('ssl', {
            type: 'boolean',
            default: null,
            describe: 'Enables SSL',
        })
        .option('certPath', {
            type: 'string',
            default: null,
            describe: 'Path to SSL certificate file',
        })
        .option('keyPath', {
            type: 'string',
            default: null,
            describe: 'Path to SSL private key file',
        })
        .option('keyPassphrase', {
            type: 'string',
            default: null,
            describe: 'Passphrase for the SSL private key',
        })
        .option('whitelist', {
            type: 'boolean',
            default: null,
            describe: 'Enables whitelist mode',
        })
        .option('dataRoot', {
            type: 'string',
            default: null,
            describe: 'Root directory for data storage (only for standalone mode)',
        })
        .option('basicAuthMode', {
            type: 'boolean',
            default: null,
            describe: 'Enables basic authentication',
        })
        .option('enableKeepAlive', {
            type: 'boolean',
            default: null,
            describe: 'Enable HTTP/HTTPS keep-alive globally',
        })
        .option('requestProxyEnabled', {
            type: 'boolean',
            default: null,
            describe: 'Enables a use of proxy for outgoing requests',
        })
        .option('requestProxyUrl', {
            type: 'string',
            default: null,
            describe: 'Request proxy URL (HTTP or SOCKS protocols)',
        })
        .option('requestProxyBypass', {
            type: 'array',
            describe: 'Request proxy bypass list (space separated list of hosts)',
        })
        .option('heartbeatInterval', {
            type: 'number',
            default: null,
            describe: 'Interval in seconds to write a heartbeat file. 0 to disable.',
        })
        /* DEPRECATED options */
        .option('autorun', {
            type: 'boolean',
            default: null,
            describe: 'DEPRECATED: Use "browserLaunchEnabled" instead.',
        })
        .option('autorunHostname', {
            type: 'string',
            default: null,
            describe: 'DEPRECATED: Use "browserLaunchHostname" instead.',
        })
        .option('autorunPortOverride', {
            type: 'number',
            default: null,
            describe: 'DEPRECATED: Use "browserLaunchPort" instead.',
        })
        .option('avoidLocalhost', {
            type: 'boolean',
            default: null,
            describe: 'DEPRECATED: Use "browserLaunchAvoidLocalhost" instead.',
        })
        .parseSync();

    const isGlobal = globalThis.FORCE_GLOBAL_MODE ?? cliArguments.global ?? false;
    const defaultConfig = CommandLineParser.prototype.getDefaultConfig(isGlobal);

    if (isGlobal && cliArguments.configPath) {
        console.warn(color.yellow('Warning: "--configPath" argument is ignored in global mode'));
    }

    if (isGlobal && cliArguments.dataRoot) {
        console.warn(color.yellow('Warning: "--dataRoot" argument is ignored in global mode'));
    }

    const configPath = isGlobal
        ? defaultConfig.configPath
        : (cliArguments.configPath ?? defaultConfig.configPath);

    return {
        isGlobal,
        configPath,
        dataRoot: cliArguments.dataRoot ?? null,
        port: cliArguments.port ?? null,
        listen: cliArguments.listen ?? null,
        listenAddressIPv6: cliArguments.listenAddressIPv6 ?? null,
        listenAddressIPv4: cliArguments.listenAddressIPv4 ?? null,
        enableIPv4: cliArguments.enableIPv4 ?? null,
        enableIPv6: cliArguments.enableIPv6 ?? null,
        dnsPreferIPv6: cliArguments.dnsPreferIPv6 ?? null,
        heartbeatInterval: cliArguments.heartbeatInterval ?? null,
        browserLaunchEnabled: cliArguments.browserLaunchEnabled ?? cliArguments.autorun ?? null,
        browserLaunchHostname: cliArguments.browserLaunchHostname ?? cliArguments.autorunHostname ?? null,
        browserLaunchPort: cliArguments.browserLaunchPort ?? cliArguments.autorunPortOverride ?? null,
        browserLaunchAvoidLocalhost: cliArguments.browserLaunchAvoidLocalhost ?? cliArguments.avoidLocalhost ?? null,
        enableCorsProxy: cliArguments.corsProxy ?? null,
        disableCsrf: cliArguments.disableCsrf ?? null,
        ssl: cliArguments.ssl ?? null,
        certPath: cliArguments.certPath ?? null,
        keyPath: cliArguments.keyPath ?? null,
        keyPassphrase: cliArguments.keyPassphrase ?? null,
        whitelistMode: cliArguments.whitelist ?? null,
        basicAuthMode: cliArguments.basicAuthMode ?? null,
        enableKeepAlive: cliArguments.enableKeepAlive ?? null,
        requestProxyEnabled: cliArguments.requestProxyEnabled ?? null,
        requestProxyUrl: cliArguments.requestProxyUrl ?? null,
        // Preserve the existing CLI contract; yargs does not type array elements.
        requestProxyBypass: (cliArguments.requestProxyBypass as string[] | undefined) ?? null,
    };
}

/**
 * Phase 2a — Create config directory and initialize config file.
 * @param {string} configPath Path to the config file
 * @param {boolean} isGlobal Whether global mode is active
 */
export function prepareConfigFilesystem(configPath: string, isGlobal: boolean): void {
    if (isGlobal && !fs.existsSync(path.dirname(configPath))) {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }
    initConfig(configPath);
}

/**
 * Phase 2b — Create data root directory.
 * @param {string|null} dataRoot Path to the data root directory (null = skip)
 */
export function prepareDataRoot(dataRoot: string | null): void {
    if (!dataRoot) return;
    try {
        if (!fs.existsSync(dataRoot)) {
            fs.mkdirSync(dataRoot, { recursive: true });
        }
    } catch (err) {
        console.warn(color.yellow(`Warning: Failed to create data root directory at ${dataRoot}. Please make sure the path is correct and writable.`), err);
    }
}

/**
 * Phase 3 — Resolve final config by merging CLI overrides with config file values.
 * @param {ParsedArgv} argv Raw CLI arguments from parseArgv
 * @param {CommandLineArguments} defaultConfig Default config from getDefaultConfig
 * @returns {CommandLineArguments} Fully resolved config with URL helpers
 */
export function resolveConfig(argv: ParsedArgv, defaultConfig: CommandLineArguments): CommandLineArguments {
    const booleanAutoOptions = [true, false, 'auto'];

    const result: CommandLineArguments = {
        configPath: argv.configPath,
        dataRoot: argv.dataRoot ?? getConfigValue('dataRoot', defaultConfig.dataRoot),
        port: argv.port ?? getConfigValue('port', defaultConfig.port, 'number'),
        listen: argv.listen ?? getConfigValue('listen', defaultConfig.listen, 'boolean'),
        listenAddressIPv6: argv.listenAddressIPv6 ?? getConfigValue('listenAddress.ipv6', defaultConfig.listenAddressIPv6),
        listenAddressIPv4: argv.listenAddressIPv4 ?? getConfigValue('listenAddress.ipv4', defaultConfig.listenAddressIPv4),
        enableIPv4: stringToBool(argv.enableIPv4) ?? stringToBool(getConfigValue('protocol.ipv4', defaultConfig.enableIPv4)) ?? defaultConfig.enableIPv4,
        enableIPv6: stringToBool(argv.enableIPv6) ?? stringToBool(getConfigValue('protocol.ipv6', defaultConfig.enableIPv6)) ?? defaultConfig.enableIPv6,
        dnsPreferIPv6: argv.dnsPreferIPv6 ?? getConfigValue('dnsPreferIPv6', defaultConfig.dnsPreferIPv6, 'boolean'),
        heartbeatInterval: argv.heartbeatInterval ?? getConfigValue('heartbeatInterval', defaultConfig.heartbeatInterval, 'number'),
        browserLaunchEnabled: argv.browserLaunchEnabled ?? getConfigValue('browserLaunch.enabled', defaultConfig.browserLaunchEnabled, 'boolean'),
        browserLaunchHostname: argv.browserLaunchHostname ?? getConfigValue('browserLaunch.hostname', defaultConfig.browserLaunchHostname),
        browserLaunchPort: argv.browserLaunchPort ?? getConfigValue('browserLaunch.port', defaultConfig.browserLaunchPort, 'number'),
        browserLaunchAvoidLocalhost: argv.browserLaunchAvoidLocalhost ?? getConfigValue('browserLaunch.avoidLocalhost', defaultConfig.browserLaunchAvoidLocalhost, 'boolean'),
        enableCorsProxy: argv.enableCorsProxy ?? getConfigValue('enableCorsProxy', defaultConfig.enableCorsProxy, 'boolean'),
        disableCsrf: argv.disableCsrf ?? getConfigValue('disableCsrfProtection', defaultConfig.disableCsrf, 'boolean'),
        ssl: argv.ssl ?? getConfigValue('ssl.enabled', defaultConfig.ssl, 'boolean'),
        certPath: argv.certPath ?? getConfigValue('ssl.certPath', defaultConfig.certPath),
        keyPath: argv.keyPath ?? getConfigValue('ssl.keyPath', defaultConfig.keyPath),
        keyPassphrase: argv.keyPassphrase ?? getConfigValue('ssl.keyPassphrase', defaultConfig.keyPassphrase),
        whitelistMode: argv.whitelistMode ?? getConfigValue('whitelistMode', defaultConfig.whitelistMode, 'boolean'),
        basicAuthMode: argv.basicAuthMode ?? getConfigValue('basicAuthMode', defaultConfig.basicAuthMode, 'boolean'),
        enableKeepAlive: argv.enableKeepAlive ?? getConfigValue('enableKeepAlive', defaultConfig.enableKeepAlive, 'boolean'),
        requestProxyEnabled: argv.requestProxyEnabled ?? getConfigValue('requestProxy.enabled', defaultConfig.requestProxyEnabled, 'boolean'),
        requestProxyUrl: argv.requestProxyUrl ?? getConfigValue('requestProxy.url', defaultConfig.requestProxyUrl),
        requestProxyBypass: argv.requestProxyBypass ?? getConfigValue('requestProxy.bypass', defaultConfig.requestProxyBypass),
        getIPv4ListenUrl: function () {
            const isValid = ipRegex.v4({ exact: true }).test(this.listenAddressIPv4);
            return new URL(
                (this.ssl ? 'https://' : 'http://') +
                (this.listen ? (isValid ? this.listenAddressIPv4 : '0.0.0.0') : '127.0.0.1') +
                (':' + this.port),
            );
        },
        getIPv6ListenUrl: function () {
            const isValid = ipRegex.v6({ exact: true }).test(this.listenAddressIPv6);
            return new URL(
                (this.ssl ? 'https://' : 'http://') +
                (this.listen ? (isValid ? this.listenAddressIPv6 : '[::]') : '[::1]') +
                (':' + this.port),
            );
        },
        getBrowserLaunchHostname: async function ({ useIPv6, useIPv4 }) {
            if (this.browserLaunchHostname === 'auto') {
                if (useIPv6 && useIPv4) {
                    return this.browserLaunchAvoidLocalhost ? '[::1]' : 'localhost';
                }

                if (useIPv6) {
                    return '[::1]';
                }

                if (useIPv4) {
                    return '127.0.0.1';
                }
            }

            return this.browserLaunchHostname;
        },
        getBrowserLaunchUrl: function (hostname) {
            const browserLaunchPort = (this.browserLaunchPort >= 0) ? this.browserLaunchPort : this.port;
            return new URL(
                (this.ssl ? 'https://' : 'http://') +
                (hostname) +
                (':') +
                (browserLaunchPort),
            );
        },
    };

    if (!booleanAutoOptions.includes(result.enableIPv6)) {
        console.warn(color.red('`protocol: ipv6` option invalid'), '\n use:', booleanAutoOptions, '\n setting to:', defaultConfig.enableIPv6);
        result.enableIPv6 = defaultConfig.enableIPv6;
    }

    if (!booleanAutoOptions.includes(result.enableIPv4)) {
        console.warn(color.red('`protocol: ipv4` option invalid'), '\n use:', booleanAutoOptions, '\n setting to:', defaultConfig.enableIPv4);
        result.enableIPv4 = defaultConfig.enableIPv4;
    }

    return result;
}

/**
 * Provides a command line arguments parser.
 */
export class CommandLineParser {
    /**
     * Gets the default configuration values.
     * @param {boolean} isGlobal If the configuration is global or not
     * @returns {CommandLineArguments} Default configuration values
     */
    getDefaultConfig(isGlobal: boolean): CommandLineArguments {
        const appPaths = envPaths('EmberDesk', { suffix: '' });
        const configPath = isGlobal ? path.join(appPaths.data, 'config.yaml') : './config.yaml';
        const dataPath = isGlobal ? path.join(appPaths.data, 'data') : './data';
        return Object.freeze({
            configPath: configPath,
            dataRoot: dataPath,
            port: 8000,
            listen: false,
            listenAddressIPv6: '[::]',
            listenAddressIPv4: '0.0.0.0',
            enableIPv4: true,
            enableIPv6: false,
            dnsPreferIPv6: false,
            heartbeatInterval: 0,
            browserLaunchEnabled: false,
            browserLaunchHostname: 'auto',
            browserLaunchPort: -1,
            browserLaunchAvoidLocalhost: false,
            enableCorsProxy: false,
            disableCsrf: false,
            ssl: false,
            certPath: 'certs/cert.pem',
            keyPath: 'certs/privkey.pem',
            keyPassphrase: '',
            whitelistMode: true,
            basicAuthMode: false,
            enableKeepAlive: false,
            requestProxyEnabled: false,
            requestProxyUrl: '',
            requestProxyBypass: [],
            getIPv4ListenUrl: function () {
                throw new Error('getIPv4ListenUrl is not implemented');
            },
            getIPv6ListenUrl: function () {
                throw new Error('getIPv6ListenUrl is not implemented');
            },
            getBrowserLaunchHostname: async function () {
                throw new Error('getBrowserLaunchHostname is not implemented');
            },
            getBrowserLaunchUrl: function () {
                throw new Error('getBrowserLaunchUrl is not implemented');
            },
        });
    }

    /**
     * Parses command line arguments.
     * Arguments that are not provided will be filled with config values.
     * @param {string[]} args Process startup arguments.
     * @returns {CommandLineArguments} Parsed command line arguments.
     */
    parse(args: string[]): CommandLineArguments {
        const argv = parseArgv(args);
        const defaultConfig = this.getDefaultConfig(argv.isGlobal);
        prepareConfigFilesystem(argv.configPath, argv.isGlobal);
        const resolvedDataRoot = argv.isGlobal
            ? defaultConfig.dataRoot
            : (argv.dataRoot ?? getConfigValue('dataRoot', defaultConfig.dataRoot));
        prepareDataRoot(resolvedDataRoot);
        return resolveConfig({ ...argv, dataRoot: resolvedDataRoot }, defaultConfig);
    }
}
