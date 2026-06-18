import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { TanStackRouterVite } from '@tanstack/router-vite-plugin';
import path from 'node:path';

export default defineConfig(({ mode }) => {
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

        plugins: [
            react(),
            TanStackRouterVite({
                routesDirectory: path.resolve(process.cwd(), 'app/routes'),
                generatedRouteTree: path.resolve(process.cwd(), 'app/routeTree.gen.ts'),
            }),
        ],

        resolve: {
            alias: {
                '@': path.resolve(process.cwd(), 'app'),
                '@sillytavern': path.resolve(process.cwd(), 'public/scripts'),
            },
        },

        server: {
            port: 3001,
            proxy: {
                '/api': {
                    target: 'http://localhost:3000',
                    changeOrigin: true,
                },
                '/lib.js': {
                    target: 'http://localhost:3000',
                    changeOrigin: true,
                },
            },
        },

        build: {
            outDir: 'app/dist',
            emptyOutDir: true,
        },
    };
});
