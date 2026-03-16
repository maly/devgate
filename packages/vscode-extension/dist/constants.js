"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.COMMANDS = exports.OUTPUT_CHANNEL_NAME = void 0;
exports.localCliPath = localCliPath;
const node_path_1 = __importDefault(require("node:path"));
exports.OUTPUT_CHANNEL_NAME = 'Devgate';
exports.COMMANDS = Object.freeze({
    init: 'devgate.init',
    setup: 'devgate.setup',
    start: 'devgate.start',
    startForce: 'devgate.startForce',
    stop: 'devgate.stop',
    doctor: 'devgate.doctor',
    domainStatus: 'devgate.domainStatus',
    domainSetup: 'devgate.domainSetup',
    domainTeardown: 'devgate.domainTeardown',
    statusQuickActions: 'devgate.statusQuickActions'
});
function localCliPath(workspacePath) {
    return node_path_1.default.join(workspacePath, 'cli', 'bin', 'devgate.js');
}
