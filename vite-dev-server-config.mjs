const DEFAULT_BACKEND_ORIGIN = 'http://127.0.0.1:8000';
const DEFAULT_DEV_PORT = 3001;

const backendPaths = [
    '/api',
    '/lib.js',
    '/csrf-token',
    '/login',
    '/setup',
    '/settings',
    '/react/login',
    '/style.css',
    '/css',
    '/scripts',
    '/img',
    '/favicon.ico',
    '/manifest.json',
    '/webfonts',
    '/characters',
    '/backgrounds',
    '/User%20Avatars',
    '/assets',
    '/user/images',
];

export function getDevServerConfig(env = process.env) {
    const backendOrigin = env.VITE_BACKEND_ORIGIN ?? DEFAULT_BACKEND_ORIGIN;
    const devPort = Number(env.VITE_DEV_PORT ?? DEFAULT_DEV_PORT);
    const proxy = Object.fromEntries(backendPaths.map(path => [path, {
        target: backendOrigin,
        changeOrigin: true,
    }]));

    return { port: devPort, proxy };
}
