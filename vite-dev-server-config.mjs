import { readFile } from 'node:fs/promises';

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

export function getDevServerConfig(env = process.env, getViteServer = () => undefined) {
    const backendOrigin = env.VITE_BACKEND_ORIGIN ?? DEFAULT_BACKEND_ORIGIN;
    const devPort = Number(env.VITE_DEV_PORT ?? DEFAULT_DEV_PORT);
    function stripIdentityHeaders(server) {
        server.on('proxyReq', proxyReq => {
            for (const header of proxyReq.getHeaderNames()) {
                if (header.startsWith('remote-') || header.startsWith('x-authentik-') ||
                    ['x-forwarded-for', 'x-real-ip', 'cf-connecting-ip', 'forwarded'].includes(header)) {
                    proxyReq.removeHeader(header);
                }
            }
        });
    }
    const common = { target: backendOrigin, changeOrigin: true, configure: stripIdentityHeaders };
    const proxy = Object.fromEntries(backendPaths.map(path => [path, {
        ...common,
    }]));

    const pages = {
        target: backendOrigin,
        changeOrigin: true,
        selfHandleResponse: true,
        configure(server) {
            stripIdentityHeaders(server);
            server.on('proxyReq', proxyReq => {
                proxyReq.removeHeader('if-none-match');
                proxyReq.removeHeader('if-modified-since');
            });
            server.on('proxyRes', async (upstream, req, res) => {
                const headers = { ...upstream.headers };
                const serveDevPage = async () => {
                    try {
                        const vite = getViteServer();
                        const source = await readFile(new URL('./index.html', import.meta.url), 'utf8');
                        const html = await vite.transformIndexHtml(req.url, source);
                        delete headers['content-length'];
                        delete headers['content-encoding'];
                        delete headers.etag;
                        delete headers['last-modified'];
                        headers['content-type'] = 'text/html; charset=utf-8';
                        headers['cache-control'] = 'no-store';
                        res.writeHead(200, headers);
                        upstream.resume();
                        return res.end(html);
                    } catch {
                        upstream.destroy();
                        res.writeHead(502);
                        return res.end('Unable to render development page');
                    }
                };
                if (upstream.statusCode === 200 && /^text\/html\b/i.test(headers['content-type'] ?? '') && req.method === 'GET') {
                    return serveDevPage();
                }
                if (upstream.statusCode === 503 && /^text\/plain\b/i.test(headers['content-type'] ?? '') && req.method === 'GET') {
                    const page = new URL(req.url, 'http://localhost').pathname.split('/')[1];
                    const expected = `React ${page} build is missing. Run "pnpm run build:react" and restart the server.`;
                    const chunks = [];
                    let size = 0;
                    const onData = chunk => {
                        chunks.push(chunk);
                        size += chunk.length;
                        if (size > 4096) {
                            upstream.removeListener('data', onData);
                            res.writeHead(503, headers);
                            for (const part of chunks) res.write(part);
                            upstream.pipe(res);
                        }
                    };
                    upstream.on('data', onData);
                    upstream.on('end', () => {
                        if (size > 4096) return;
                        if (Buffer.concat(chunks).toString() === expected) return serveDevPage();
                        res.writeHead(503, headers);
                        res.end(Buffer.concat(chunks));
                    });
                    return;
                }
                res.writeHead(upstream.statusCode, headers);
                upstream.pipe(res);
            });
        },
    };
    const workspace = {
        ...common,
        selfHandleResponse: true,
        configure(server) {
            stripIdentityHeaders(server);
            server.on('proxyReq', proxyReq => {
                proxyReq.removeHeader('if-none-match');
                proxyReq.removeHeader('if-modified-since');
                proxyReq.setHeader('accept-encoding', 'identity');
            });
            server.on('proxyRes', async (upstream, req, res) => {
                const headers = { ...upstream.headers };
                if (req.method !== 'GET' || upstream.statusCode !== 200 || !/^text\/html\b/i.test(headers['content-type'] ?? '')) {
                    res.writeHead(upstream.statusCode, headers);
                    return upstream.pipe(res);
                }
                try {
                    const chunks = [];
                    for await (const chunk of upstream) chunks.push(chunk);
                    const html = await getViteServer().transformIndexHtml(new URL(req.url, 'http://localhost').pathname, Buffer.concat(chunks).toString());
                    delete headers['content-length'];
                    delete headers['content-encoding'];
                    delete headers.etag;
                    delete headers['last-modified'];
                    headers['cache-control'] = 'no-store';
                    res.writeHead(200, headers);
                    return res.end(html);
                } catch {
                    res.writeHead(502);
                    return res.end('Unable to render development workspace');
                }
            });
        },
    };
    delete proxy['/login'];
    delete proxy['/setup'];
    delete proxy['/settings'];
    return {
        port: devPort,
        proxy: {
            '^/(?:\\?.*)?$': workspace,
            '^/(login|setup|settings)/?(?:\\?.*)?$': pages,
            ...proxy,
            '^/(?!@|app/|public/|node_modules/|__vite|virtual:)(?:.*)$': common,
        },
    };
}
