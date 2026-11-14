const { stripTypeScriptTypes } = require('node:module');

module.exports = function stripTypeScript(source) {
    return stripTypeScriptTypes(source, { mode: 'strip' });
};
