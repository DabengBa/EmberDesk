import { createFileRoute } from '@tanstack/react-router';
import { SettingsSurface } from '@/components/settings/SettingsSurface';

export const Route = createFileRoute('/settings')({
    component: SettingsPage,
});

function SettingsPage() {
    return <SettingsSurface variant="page" />;
}
