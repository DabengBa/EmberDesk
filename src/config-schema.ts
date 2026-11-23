import { z } from 'zod';

const protocolEnabled = z.union([z.boolean(), z.enum(['auto', 'true', 'false'])]);
const size = z.union([z.string(), z.number()]);
const corsList = z.union([z.string(), z.array(z.string())]);

// Optional keys allow sparse configs; defaults are loaded from the commented template.
export const configSchema = z.looseObject({
    dataRoot: z.string().nullish(),
    listen: z.boolean().nullish(),
    listenAddress: z.looseObject({
        ipv4: z.string().nullish(),
        ipv6: z.string().nullish(),
    }).nullish(),
    protocol: z.looseObject({
        ipv4: protocolEnabled.nullish(),
        ipv6: protocolEnabled.nullish(),
    }).nullish(),
    dnsPreferIPv6: z.boolean().nullish(),
    browserLaunch: z.looseObject({
        enabled: z.boolean().nullish(),
        browser: z.string().nullish(),
        hostname: z.string().nullish(),
        port: z.number().nullish(),
        avoidLocalhost: z.boolean().nullish(),
    }).nullish(),
    port: z.number().nullish(),
    heartbeatInterval: z.number().nullish(),
    enableKeepAlive: z.boolean().nullish(),
    ssl: z.looseObject({
        enabled: z.boolean().nullish(),
        certPath: z.string().nullish(),
        keyPath: z.string().nullish(),
        keyPassphrase: z.string().nullish(),
    }).nullish(),
    whitelistMode: z.boolean().nullish(),
    enableForwardedWhitelist: z.boolean().nullish(),
    whitelist: z.array(z.string()).nullish(),
    whitelistDockerHosts: z.boolean().nullish(),
    enableCorsProxy: z.boolean().nullish(),
    cors: z.looseObject({
        enabled: z.boolean().nullish(),
        origin: z.union([z.string(), z.array(z.string()), z.boolean()]).nullish(),
        methods: corsList.nullish(),
        allowedHeaders: corsList.nullish(),
        exposedHeaders: corsList.nullish(),
        credentials: z.boolean().nullish(),
        maxAge: z.number().nullish(),
    }).nullish(),
    requestProxy: z.looseObject({
        enabled: z.boolean().nullish(),
        url: z.string().nullish(),
        bypass: z.array(z.string()).nullish(),
    }).nullish(),
    enableUserAccounts: z.boolean().nullish(),
    enableDiscreetLogin: z.boolean().nullish(),
    features: z.looseObject({
        storage: z.looseObject({
            canonicalSqlite: z.looseObject({
                enabled: z.boolean().nullish(),
                shadowImport: z.boolean().nullish(),
            }).nullish(),
        }).nullish(),
    }).nullish(),
    sso: z.looseObject({
        autheliaAuth: z.boolean().nullish(),
        authentikAuth: z.boolean().nullish(),
        trustedProxies: z.array(z.string()).nullish(),
    }).nullish(),
    hostWhitelist: z.looseObject({
        enabled: z.boolean().nullish(),
        scan: z.boolean().nullish(),
        hosts: z.array(z.string()).nullish(),
    }).nullish(),
    privateAddressWhitelist: z.looseObject({
        enabled: z.boolean().nullish(),
        allowUnresolvedHosts: z.boolean().nullish(),
        log: z.looseObject({
            blockedRequests: z.boolean().nullish(),
            allowedRequests: z.boolean().nullish(),
        }).nullish(),
        allowedRanges: z.array(z.string()).nullish(),
    }).nullish(),
    sessionTimeout: z.number().nullish(),
    disableCsrfProtection: z.boolean().nullish(),
    securityOverride: z.boolean().nullish(),
    logging: z.looseObject({
        enableAccessLog: z.boolean().nullish(),
        minLogLevel: z.number().nullish(),
    }).nullish(),
    rateLimiting: z.looseObject({
        preferRealIpHeader: z.boolean().nullish(),
        basicAuthMaxAttempts: z.number().nullish(),
        accountsLoginMaxAttempts: z.number().nullish(),
        accountsLoginLockoutDuration: z.number().nullish(),
        accountsSetupMaxAttempts: z.number().nullish(),
        accountsRecoverMaxAttempts: z.number().nullish(),
    }).nullish(),
    forwardedHeaders: z.looseObject({
        xRealIp: z.boolean().nullish(),
        xForwardedFor: z.boolean().nullish(),
        cfConnectingIp: z.boolean().nullish(),
    }).nullish(),
    backups: z.looseObject({
        allowFullDataBackup: z.boolean().nullish(),
        common: z.looseObject({
            numberOfBackups: z.number().nullish(),
        }).nullish(),
        chat: z.looseObject({
            enabled: z.boolean().nullish(),
            checkIntegrity: z.boolean().nullish(),
            maxTotalBackups: z.number().nullish(),
            throttleInterval: z.number().nullish(),
        }).nullish(),
    }).nullish(),
    thumbnails: z.looseObject({
        enabled: z.boolean().nullish(),
        format: z.string().nullish(),
        quality: z.number().nullish(),
        dimensions: z.looseObject({
            avatar: z.tuple([z.number(), z.number()]).nullish(),
        }).nullish(),
    }).nullish(),
    performance: z.looseObject({
        lazyLoadCharacters: z.boolean().nullish(),
        memoryCacheCapacity: size.nullish(),
        useDiskCache: z.boolean().nullish(),
        requestCompression: z.looseObject({
            enabled: z.boolean().nullish(),
            minPayloadSize: size.nullish(),
            maxPayloadSize: size.nullish(),
            timeout: z.number().nullish(),
        }).nullish(),
    }).nullish(),
    cacheBuster: z.looseObject({
        enabled: z.boolean().nullish(),
        userAgentPattern: z.string().nullish(),
    }).nullish(),
    allowKeysExposure: z.boolean().nullish(),
    skipContentCheck: z.boolean().nullish(),
    whitelistImportDomains: z.array(z.string()).nullish(),
    enableDownloadableTokenizers: z.boolean().nullish(),
    promptPlaceholder: z.string().nullish(),
    openai: z.looseObject({
        randomizeUserId: z.boolean().nullish(),
    }).nullish(),
    mistral: z.looseObject({
        enablePrefix: z.boolean().nullish(),
    }).nullish(),
    enableServerPlugins: z.boolean().nullish(),
    enableServerPluginsAutoUpdate: z.boolean().nullish(),
    basicAuthMode: z.boolean().nullish(),
    perUserBasicAuth: z.boolean().nullish(),
    basicAuthUser: z.looseObject({
        username: z.string().nullish(),
        password: z.string().nullish(),
    }).nullish(),
    cookieSecret: z.string().nullish(),
});

export type AppConfig = z.infer<typeof configSchema>;
