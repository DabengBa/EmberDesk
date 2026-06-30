#!/usr/bin/env node

import {
    formatValidationGateSelection,
    selectValidationGates,
} from '../src/validation-gate-selector.js';

const inputs = process.argv.slice(2);
const selection = selectValidationGates(inputs);

process.stdout.write(formatValidationGateSelection(selection));
