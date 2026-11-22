import * as characterLibrary from '../character-library-panel';
import * as workspacePanels from '../workspace-panels';

export async function prepareWorkspacePanels(): Promise<void> {
    // Resolve to the same unbundled module as /script.js and its controllers.
    const bridgePath = new URL('/scripts/workspace-panels-react-bridge.js', location.href).href;
    const { installWorkspacePanelsModule } = await import(/* @vite-ignore */ bridgePath);
    installWorkspacePanelsModule({ ...workspacePanels, ...characterLibrary });
}
