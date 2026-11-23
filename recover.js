import process from 'node:process';
import { defaultConfigPath } from './src/config-file.ts';
import { initConfig } from './src/config-init.ts';

const userAccount = process.argv[2];
const userPassword = process.argv[3];


if (!userAccount) {
    console.error('A tool for recovering lost EmberDesk accounts. Uses the configured "dataRoot".');
    console.error('Usage: node recover.js [account] (password)');
    console.error('Example: node recover.js admin password');
    process.exit(1);
}

async function main() {
    initConfig(defaultConfigPath());
    const { recoverPassword } = await import('./src/recover-password.ts');
    await recoverPassword(userAccount, userPassword);
}

main();
