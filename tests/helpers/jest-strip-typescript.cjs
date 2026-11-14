const { readFileSync } = require('node:fs');
const stripTypeScript = require('./strip-typescript.cjs');
const transformerSource = readFileSync(__filename, 'utf8');
const stripSource = readFileSync(require.resolve('./strip-typescript.cjs'), 'utf8');

module.exports = {
    getCacheKey(source, filename, options) {
        // Jest's default key omits the transformer and its required helper.
        return JSON.stringify([
            source, filename, options.configString, options.instrument,
            process.versions.node, transformerSource, stripSource,
        ]);
    },
    process(source) {
        return { code: stripTypeScript(source) };
    },
};
