/**
 * Scripts to be done before starting the server for the first time.
 */
import { defaultConfigPath } from './config-file.ts';
import { prepareConfig } from './config-init.ts';

prepareConfig(defaultConfigPath());
