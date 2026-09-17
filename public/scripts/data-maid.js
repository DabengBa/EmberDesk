import { translate } from './i18n.js';
import { loadWorkspacePanelsModule } from './workspace-panels-react-bridge.js';

export function initDataMaid() {
    const dataMaidButton = document.getElementById('data_maid_button');
    if (!dataMaidButton) {
        console.warn('Data Maid button not found');
        return;
    }

    dataMaidButton.addEventListener('click', async () => {
        try {
            const module = await loadWorkspacePanelsModule();
            module.mountDataMaidDialog({ commands: { translate } });
        } catch (error) {
            console.error('Failed to mount Data Maid dialog:', error);
        }
    });
}
