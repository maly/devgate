"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCommandMap = buildCommandMap;
const constants_js_1 = require("./constants.js");
function buildCommandMap() {
    return {
        [constants_js_1.COMMANDS.init]: { id: constants_js_1.COMMANDS.init, title: 'Devgate: Init', args: ['init'], mode: 'oneshot' },
        [constants_js_1.COMMANDS.setup]: { id: constants_js_1.COMMANDS.setup, title: 'Devgate: Setup', args: ['setup'], mode: 'oneshot' },
        [constants_js_1.COMMANDS.start]: { id: constants_js_1.COMMANDS.start, title: 'Devgate: Start', args: ['start'], mode: 'start' },
        [constants_js_1.COMMANDS.startForce]: { id: constants_js_1.COMMANDS.startForce, title: 'Devgate: Start (Force)', args: ['start', '--force'], mode: 'start' },
        [constants_js_1.COMMANDS.stop]: { id: constants_js_1.COMMANDS.stop, title: 'Devgate: Stop', args: [], mode: 'stop' },
        [constants_js_1.COMMANDS.doctor]: { id: constants_js_1.COMMANDS.doctor, title: 'Devgate: Doctor', args: ['doctor'], mode: 'oneshot' },
        [constants_js_1.COMMANDS.domainStatus]: { id: constants_js_1.COMMANDS.domainStatus, title: 'Devgate: Domain Status', args: ['domain', 'status'], mode: 'oneshot' },
        [constants_js_1.COMMANDS.domainSetup]: { id: constants_js_1.COMMANDS.domainSetup, title: 'Devgate: Domain Setup', args: ['domain', 'setup'], mode: 'oneshot' },
        [constants_js_1.COMMANDS.domainTeardown]: { id: constants_js_1.COMMANDS.domainTeardown, title: 'Devgate: Domain Teardown', args: ['domain', 'teardown'], mode: 'oneshot' }
    };
}
exports.default = { buildCommandMap };
