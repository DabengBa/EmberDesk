import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import stylex from '@stylexjs/unplugin/vite';
import path from 'node:path';
import { getDevServerConfig } from './vite-dev-server-config.mjs';

/**
 * Shared Vite config for guarded React panel bundles (library-mode builds
 * emitted into app/dist). `name` is the panel basename used for the entry
 * (app/<name>.tsx), output file (assets/<name>.js), and CSS file.
 */
function reactPanelConfig(name: string): UserConfig {
    return {
        publicDir: false,
        define: {
            'process.env.NODE_ENV': JSON.stringify('production'),
        },
        plugins: [
            react(),
            stylex(),
        ],
        resolve: {
            alias: {
                '@': path.resolve(process.cwd(), 'app'),
                '@sillytavern': path.resolve(process.cwd(), 'public/scripts'),
            },
        },
        build: {
            lib: {
                entry: path.resolve(process.cwd(), `app/${name}.tsx`),
                formats: ['es'] as const,
                fileName: () => `assets/${name}.js`,
                cssFileName: name,
            },
            outDir: 'app/dist',
            emptyOutDir: false,
            rollupOptions: {
                external: [],
                output: {
                    assetFileNames: 'assets/[name][extname]',
                },
            },
        },
    };
}

export default defineConfig(({ mode }) => {
    let devServer: import('vite').ViteDevServer | undefined;
    const isLibBuild = mode === 'lib';
    const isLoginBuild = mode === 'login';
    const isCharacterLibraryPanelBuild = mode === 'character-library-panel';
    const isWorkspacePanelsBuild = mode === 'workspace-panels';

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
                },
            },
            resolve: {
                alias: {
                    '@sillytavern': path.resolve(process.cwd(), 'public/scripts'),
                },
            },
        };
    }

    if (isCharacterLibraryPanelBuild) {
        return reactPanelConfig('character-library-panel');
    }

    if (isWorkspacePanelsBuild) {
        return reactPanelConfig('workspace-panels');
    }

    // React application mode
    return {
        base: isLoginBuild ? '/react/login/' : '/',
        publicDir: false,
        appType: 'mpa',

        plugins: [
            { name: 'dev-page-proxy', configResolved(config) {
                if (config.command !== 'serve') return;
                const host = config.server.host;
                if (host !== undefined && host !== false && !['localhost', '127.0.0.1', '::1'].includes(String(host))) {
                    throw new Error('The Vite development proxy must listen on a loopback address.');
                }
            }, configureServer(server) {
                devServer = server;
                server.middlewares.use((req, res, next) => {
                    const match = /^\/react\/login\/assets\/(workspace-panels|character-library-panel)\.(js|css)(?:\?.*)?$/.exec(req.url ?? '');
                    if (!match || (req.method !== 'GET' && req.method !== 'HEAD')) return next();
                    if (match[2] === 'css') {
                        // Vite injects the panel's imported and StyleX styles with its module.
                        res.writeHead(200, { 'content-type': 'text/css; charset=utf-8', 'cache-control': 'no-store' });
                        return res.end();
                    }
                    res.writeHead(302, { location: `/app/${match[1]}.tsx`, 'cache-control': 'no-store' });
                    return res.end();
                });
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
            ...getDevServerConfig(process.env, () => devServer),
        },

        build: {
            outDir: 'app/dist',
            emptyOutDir: true,
        },
    };
});
