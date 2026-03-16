"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createStatusBarController = createStatusBarController;
const vscode = __importStar(require("vscode"));
const constants_js_1 = require("./constants.js");
function createStatusBarController() {
    const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 20);
    item.command = constants_js_1.COMMANDS.statusQuickActions;
    item.text = 'Devgate: Stopped';
    item.tooltip = 'Devgate is not running.';
    item.show();
    const iconFor = (status) => {
        if (status === 'running')
            return '$(play-circle)';
        if (status === 'starting')
            return '$(sync~spin)';
        if (status === 'error')
            return '$(error)';
        return '$(circle-slash)';
    };
    const labelFor = (status) => {
        if (status === 'running')
            return 'Running';
        if (status === 'starting')
            return 'Starting';
        if (status === 'error')
            return 'Error';
        return 'Stopped';
    };
    return {
        update(state, cliDisplay) {
            item.text = `${iconFor(state.status)} Devgate: ${labelFor(state.status)}`;
            item.tooltip = [
                `CLI: ${cliDisplay}`,
                `Status: ${labelFor(state.status)}`,
                state.lastCommand ? `Last: ${state.lastCommand}` : 'Last: n/a',
                state.lastError ? `Error: ${state.lastError}` : null
            ].filter(Boolean).join('\n');
        },
        dispose() {
            item.dispose();
        }
    };
}
exports.default = { createStatusBarController };
