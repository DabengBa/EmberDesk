import { defineConfig, normalizePath, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import stylex from '@stylexjs/unplugin/vite';
import path from 'node:path';
import { getDevServerConfig } from './vite-dev-server-config.mjs';

const workspaceEntries = {
    'workspace/runtime': '/app/compat/workspace-runtime.ts',
    'workspace/generation-service': '/app/lib/generation/service.ts',
    'workspace/generation-attempt': '/app/lib/generation/attempt-executor.ts',
};

function nativeWorkspaceEntries(): Plugin {
    const servicePath = normalizePath(path.resolve(process.cwd(), 'app/lib/generation/service.ts'));
    const devEntries = new Map(Object.entries(workspaceEntries).map(([name, source]) => [`/react/login/${name}.js`, source]));
    return {
        name: 'native-workspace-entries',
        enforce: 'pre',
        configureServer(server) {
            // Resolve these entries locally before the existing backend asset proxy.
            server.middlewares.use((req, _res, next) => {
                const url = req.url ?? '';
                const pathname = url.split('?')[0];
                const source = devEntries.get(pathname);
                if (source) req.url = source + url.slice(pathname.length);
                next();
            });
        },
        resolveId(source, importer) {
            const entry = devEntries.get(source);
            if (entry) return path.resolve(process.cwd(), `.${entry}`);
            const prefix = '../../../public/scripts/';
            // The service must use the original browser modules, not bundled copies of their state.
            if (importer && normalizePath(importer) === servicePath && source.startsWith(prefix)) {
                return { id: `/scripts/${source.slice(prefix.length)}`, external: 'absolute' };
            }
        },
    };
}

export default defineConfig(({ mode, command }) => {
    let devServer: import('vite').ViteDevServer | undefined;
    const isLibBuild = mode === 'lib';
    const isLoginBuild = mode === 'login';


    if (isLibBuild) {
        // Library mode for /lib.js
        return {
            build: {
                lib: {
                    entry: path.resolve(process.cwd(), 'public/lib.js'),
                    formats: ['es'] as const,
                    fileName: () => 'lib.js',
                },
                outDir: 'dist/lib',
                emptyOutDir: true,
                rollupOptions: {
                    external: [],
                    output: { chunkFileNames: 'highlight-chunks/[name]-[hash].js' },
                },
            },
            resolve: {
                alias: {
                    '@sillytavern': path.resolve(process.cwd(), 'public/scripts'),
                },
            },
        };
    }


    // React application mode
    return {
        base: isLoginBuild && command !== 'serve' ? '/react/login/' : '/',
        publicDir: false,
        appType: 'mpa',

        plugins: [
            nativeWorkspaceEntries(),
            { name: 'dev-page-proxy', configResolved(config) {
                if (config.command !== 'serve') return;
                const host = config.server.host;
                if (host !== undefined && host !== false && !['localhost', '127.0.0.1', '::1'].includes(String(host))) {
                    throw new Error('The Vite development proxy must listen on a loopback address.');
                }
            }, configureServer(server) {
                devServer = server;

            } },
            TanStackRouterVite({
                routesDirectory: path.resolve(process.cwd(), 'app/routes'),
                generatedRouteTree: path.resolve(process.cwd(), 'app/routeTree.gen.ts'),
                autoCodeSplitting: true,
            }),
            react(),
            stylex(),
        ],

        resolve: {
            alias: {
                '@': path.resolve(process.cwd(), 'app'),
                '@sillytavern': path.resolve(process.cwd(), 'public/scripts'),
            },
        },

        server: {
            // Native service imports are fetched through the backend proxy, not transformed by Vite.
            preTransformRequests: false,
            ...getDevServerConfig(process.env, () => devServer),
        },

        build: {
            outDir: 'app/dist',
            emptyOutDir: true,
            rolldownOptions: command === 'build' ? {
                input: {
                    index: path.resolve(process.cwd(), 'index.html'),
                    ...Object.fromEntries(Object.entries(workspaceEntries).map(([name, source]) => [name, path.resolve(process.cwd(), `.${source}`)])),
                },
                preserveEntrySignatures: 'strict',
                output: {
                    entryFileNames: chunk => Object.hasOwn(workspaceEntries, chunk.name)
                        ? '[name].js' : 'assets/[name]-[hash].js',
                },
            } : undefined,
        },
    };
});
