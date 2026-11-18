import * as characterLibrary from '../character-library-panel';
import * as workspacePanels from '../workspace-panels';

export async function prepareWorkspacePanels(): Promise<void> {
    // Resolve to the same unbundled module as /script.js and its controllers.
    const bridgePath = '/scripts/workspace-panels-react-bridge.js';
    const { installWorkspacePanelsModule } = await import(/* @vite-ignore */ bridgePath);
    installWorkspacePanelsModule({ ...workspacePanels, ...characterLibrary });
}
