import { createRootRoute, Outlet } from '@tanstack/react-router';
import '@astryxdesign/core/astryx.css';

export const Route = createRootRoute({
    component: () => (
        <>
            <Outlet />
        </>
    ),
});
