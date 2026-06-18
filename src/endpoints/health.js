/**
 * Health check endpoint
 * 用于测试 API 连接和 React dev server 代理
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { version: packageVersion } = require('../../package.json');

export function setupHealthEndpoint(app) {
    app.get('/api/ping', (_request, response) => {
        response.json({
            status: 'ok',
            message: 'EmberDesk API is running',
            timestamp: new Date().toISOString(),
            version: packageVersion,
        });
    });
}
