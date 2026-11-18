import { createFileRoute } from '@tanstack/react-router';
import { WorkspaceHost } from '../components/workspace/WorkspaceHost';

export const Route = createFileRoute('/')({
    component: WorkspaceHost,
});
