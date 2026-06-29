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
            // Fall through to the deprecated Webpack middleware when the Vite bundle is absent.
            return next();
        }
        next();
    }

    return viteLibServeMiddleware;
}
