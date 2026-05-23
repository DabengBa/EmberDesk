/**
 * Final Express error handler for uncaught route and middleware failures.
 * @param {Error} error Error object
 * @param {import('express').Request} request Request object
 * @param {import('express').Response} response Response object
 * @param {import('express').NextFunction} next Next function
 * @returns {import('express').Response|void} Error response
 */
export default function errorHandlerMiddleware(error, request, response, next) {
    console.error('Unhandled request error:', error);

    if (response.headersSent) {
        return next(error);
    }

    const acceptHeader = request.get('accept') ?? '';
    const explicitlyAcceptsJson = acceptHeader.includes('application/json') && !acceptHeader.includes('text/html');
    if (request.path.startsWith('/api/') || explicitlyAcceptsJson) {
        return response.status(500).json({ error: 'Internal Server Error' });
    }

    return response.status(500).type('text/plain').send('Internal Server Error');
}
