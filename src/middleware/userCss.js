import path from 'node:path';
import fs from 'node:fs';

/**
 * Provides an Express middleware function that serves a user-defined CSS file from the data directory if it exists.
 * @type {import('express').Handler}
 */
export function userCssMiddleware(req, res, next) {
    if ((req.method === 'GET' || req.method === 'HEAD') && req.path === '/css/user.css') {
        const userCssPath = path.resolve(path.join(globalThis.DATA_ROOT, '_css', 'user.css'));
        let css = '';

        try {
            const stat = fs.statSync(userCssPath);
            if (stat.isFile()) {
                css = fs.readFileSync(userCssPath, 'utf8');
            }
        } catch {
            // Missing user CSS is an expected default state.
        }

        res.type('text/css').send(css);
        return;
    }
    next();
}

export default userCssMiddleware;
