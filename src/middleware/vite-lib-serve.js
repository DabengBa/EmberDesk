import path from 'node:path';
import fs from 'node:fs';

/**
 * Middleware to serve the Vite-built lib.js file at /lib.js route.
 * @returns {import('express').RequestHandler}
 */
export default function getViteLibServeMiddleware() {
    /**
     * Serve /lib.js from the Vite build output directory.
     * @param {import('express').Request} req Request object.
     * @param {import('express').Response} res Response object.
     * @param {import('express').NextFunction} next Next function.
     * @type {import('express').RequestHandler}
     */
    function viteLibServeMiddleware(req, res, next) {
        if (req.method === 'GET' && req.path === '/lib.js') {
            const libPath = path.resolve(process.cwd(), 'dist/lib/lib.js');
            if (fs.existsSync(libPath)) {
                return res.sendFile(libPath);
            }
            return next();
        }
        // Serve only generated JS chunks, never arbitrary paths under dist/lib.
        const chunk = /^\/highlight-chunks\/([A-Za-z0-9_-]+\.js)$/.exec(req.path);
        if (req.method === 'GET' && chunk) {
            const chunkPath = path.resolve(process.cwd(), 'dist/lib/highlight-chunks', chunk[1]);
            if (fs.existsSync(chunkPath)) return res.sendFile(chunkPath);
        }
        next();
    }

    return viteLibServeMiddleware;
}
