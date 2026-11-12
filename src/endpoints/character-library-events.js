import { characterLibraryChangeObserver } from '../character-library-change-observer.js';

/** The authenticated middleware owns identity; no path or identity from the URL. */
export function createCharacterLibraryEventsHandler(observer, { heartbeatMs = 15000 } = {}) {
    return (request, response) => {
        if (!request.user) return response.sendStatus(403);
        let unsubscribe;
        let heartbeat;
        let closed = false;
        function close() {
            if (closed) return;
            closed = true;
            clearInterval(heartbeat);
            unsubscribe?.();
            response.off('close', close);
            response.off('error', close);
            // Destroy rather than queue a final frame for a slow reader.
            response.destroy();
        }
        function send(frame) {
            if (closed) return;
            try {
                if (!response.write(frame)) close();
            } catch { close(); }
        }
        try {
            unsubscribe = observer.subscribe(request.user.directories, {
                invalidate: () => send('event: invalidate\ndata: {}\n\n'),
                close,
            });
        } catch (error) {
            return response.sendStatus(error.code === 'STREAM_LIMIT' ? 429 : 503);
        }
        response.on('close', close);
        response.on('error', close);
        try {
            response.status(200).set({
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-store, no-transform',
                'X-Accel-Buffering': 'no',
            });
            response.flushHeaders();
        } catch {
            close();
            return;
        }
        // Baseline and registration precede ready. Reconnect always means requery.
        send('event: ready\ndata: {}\n\n');
        if (!closed) {
            heartbeat = setInterval(() => send(': heartbeat\n\n'), heartbeatMs);
            heartbeat.unref();
        }
    };
}

export const characterLibraryEventsHandler = createCharacterLibraryEventsHandler(characterLibraryChangeObserver);
