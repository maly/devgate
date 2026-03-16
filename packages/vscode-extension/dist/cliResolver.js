"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveCli = resolveCli;
const node_fs_1 = __importDefault(require("node:fs"));
const constants_js_1 = require("./constants.js");
function resolveCli(options) {
    const exists = options.existsSync || node_fs_1.default.existsSync;
    const workspacePath = options.workspacePath;
    if (workspacePath) {
        const localPath = (0, constants_js_1.localCliPath)(workspacePath);
        if (exists(localPath)) {
            return {
                kind: 'local',
                cmd: 'node',
                baseArgs: [localPath],
                workspacePath,
                display: `local:${localPath}`
            };
        }
    }
    return {
        kind: 'global',
        cmd: 'devgate',
        baseArgs: [],
        workspacePath,
        display: 'global:devgate'
    };
}
exports.default = { resolveCli };
