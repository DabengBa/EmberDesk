/**
 * Add all the libraries that you want to expose to the client here.
 * They are bundled by Vite and exposed at /lib.js.
 */
import lodash from 'lodash';
import Fuse from 'fuse.js';
import DOMPurify from 'dompurify';
import highlightCore from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import cssLanguage from 'highlight.js/lib/languages/css';
import graphql from 'highlight.js/lib/languages/graphql';
import handlebars from 'highlight.js/lib/languages/handlebars';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import python from 'highlight.js/lib/languages/python';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import localforage from 'localforage';
import Handlebars from 'handlebars';
import css from '@adobe/css-tools';
import Bowser from 'bowser';
import DiffMatchPatch from 'diff-match-patch';
import { isProbablyReaderable, Readability } from '@mozilla/readability';
import SVGInject from '@iconfu/svg-inject';
import showdown from 'showdown';
import moment from 'moment';
import seedrandom from 'seedrandom';
import * as Popper from '@popperjs/core';
import droll from 'droll';
import chalk from 'chalk';
import yaml from 'yaml';
import * as chevrotain from 'chevrotain';
import { gzipSync, gzip } from 'fflate';


// Use a separate instance: importing the full registry later must not mutate it
// until its languages can be installed in the original autodetection order.
const hljs = highlightCore.newInstance();
for (const [name, grammar] of Object.entries({ bash, css: cssLanguage, graphql, handlebars, javascript, json, python, typescript, xml })) {
    hljs.registerLanguage(name, grammar);
}
let fullLanguages;
hljs.loadAllLanguages = () => fullLanguages ??= import('highlight.js').then(({ default: full }) => {
    const existing = new Map(hljs.listLanguages().map(name => [name, hljs.getLanguage(name).rawDefinition]));
    for (const name of existing.keys()) hljs.unregisterLanguage(name);
    for (const name of full.listLanguages()) {
        hljs.registerLanguage(name, existing.get(name) ?? full.getLanguage(name).rawDefinition);
        existing.delete(name);
    }
    for (const [name, grammar] of existing) hljs.registerLanguage(name, grammar);
}).catch(error => {
    fullLanguages = undefined;
    throw error;
});



export default {
    lodash,
    Fuse,
    DOMPurify,
    hljs,
    localforage,
    Handlebars,
    css,
    Bowser,
    DiffMatchPatch,
    Readability,
    isProbablyReaderable,
    SVGInject,
    showdown,
    moment,
    seedrandom,
    Popper,
    droll,
    chalk,
    yaml,
    chevrotain,
    gzipSync,
    gzip,
};

export {
    lodash,
    Fuse,
    DOMPurify,
    hljs,
    localforage,
    Handlebars,
    css,
    Bowser,
    DiffMatchPatch,
    Readability,
    isProbablyReaderable,
    SVGInject,
    showdown,
    moment,
    seedrandom,
    Popper,
    droll,
    chalk,
    yaml,
    chevrotain,
    gzipSync,
    gzip,
};
