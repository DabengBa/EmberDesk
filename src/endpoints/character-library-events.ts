import { characterLibraryChangeObserver } from '../character-library-change-observer.ts';
import type { Request, Response } from 'express';

/** The authenticated middleware owns identity; no path or identity from the URL. */
export function createCharacterLibraryEventsHandler(observer: Pick<typeof characterLibraryChangeObserver, 'subscribe'>, { heartbeatMs = 15000 }: { heartbeatMs?: number } = {}) {
    return (request: Request, response: Response) => {
        if (!request.user) return response.sendStatus(403);
        let unsubscribe: (() => void) | undefined;
        let heartbeat: NodeJS.Timeout | undefined;
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
        function send(frame: string) {
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
            return response.sendStatus((error as NodeJS.ErrnoException).code === 'STREAM_LIMIT' ? 429 : 503);
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
