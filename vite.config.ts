import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import stylex from '@stylexjs/unplugin/vite';
import path from 'node:path';
import { getDevServerConfig } from './vite-dev-server-config.mjs';

export default defineConfig(({ mode }) => {
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
