import fs from 'node:fs';
import path from 'node:path';
import { default as git, CheckRepoActions } from 'simple-git';
import { sync as commandExistsSync } from 'command-exists';
import { getConfigValue, color } from './util.js';

/**
 * Automatically update all git plugins in the plugins directory.
 * @param {string} pluginsPath Path to plugins directory
 * @param {object} [options]
 * @param {boolean} [options.autoUpdate] Override for auto-update config. If omitted, reads from config.
 */
export async function updatePlugins(pluginsPath, options) {
    const shouldAutoUpdate = options?.autoUpdate ?? getConfigValue('enableServerPluginsAutoUpdate', true, 'boolean');
    if (!shouldAutoUpdate) {
        return;
    }

    const directories = fs.readdirSync(pluginsPath)
        .filter(file => !file.startsWith('.'))
        .filter(file => fs.statSync(path.join(pluginsPath, file)).isDirectory());

    if (directories.length === 0) {
        return;
    }

    console.log(color.blue('Auto-updating server plugins... Set'), color.yellow('enableServerPluginsAutoUpdate: false'), color.blue('in config.yaml to disable this feature.'));

    if (!commandExistsSync('git')) {
        console.error(color.red('Git is not installed. Please install Git to enable auto-updating of server plugins.'));
        return;
    }

    let pluginsToUpdate = 0;

    for (const directory of directories) {
        try {
            const pluginPath = path.join(pluginsPath, directory);
            const pluginRepo = git(pluginPath);

            const isRepo = await pluginRepo.checkIsRepo(CheckRepoActions.IS_REPO_ROOT);
            if (!isRepo) {
                continue;
            }

            await pluginRepo.fetch();
            const commitHash = await pluginRepo.revparse(['HEAD']);
            const trackingBranch = await pluginRepo.revparse(['--abbrev-ref', '@{u}']);
            const log = await pluginRepo.log({
                from: commitHash,
                to: trackingBranch,
            });

            if (log.total === 0) {
                continue;
            }

            pluginsToUpdate++;
            await pluginRepo.pull();
            const latestCommit = await pluginRepo.revparse(['HEAD']);
            console.log(`Plugin ${color.green(directory)} updated to commit ${color.cyan(latestCommit)}`);
        } catch (error) {
            console.error(color.red(`Failed to update plugin ${directory}: ${error.message}`));
        }
    }

    if (pluginsToUpdate === 0) {
        console.log('All plugins are up to date.');
    }
}
