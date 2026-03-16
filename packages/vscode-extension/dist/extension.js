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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const constants_js_1 = require("./constants.js");
const cliResolver_js_1 = require("./cliResolver.js");
const devgateRunner_js_1 = require("./devgateRunner.js");
const statusBar_js_1 = require("./statusBar.js");
const commands_js_1 = require("./commands.js");
function getWorkspacePath() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return null;
    }
    return folders[0].uri.fsPath;
}
async function activate(context) {
    const output = vscode.window.createOutputChannel(constants_js_1.OUTPUT_CHANNEL_NAME);
    context.subscriptions.push(output);
    const cli = (0, cliResolver_js_1.resolveCli)({ workspacePath: getWorkspacePath() });
    output.appendLine(`[${new Date().toISOString()}] Devgate CLI resolved: ${cli.display}`);
    const status = (0, statusBar_js_1.createStatusBarController)();
    context.subscriptions.push(status);
    const runner = (0, devgateRunner_js_1.createRunner)({
        cli,
        output,
        onStateChange: (state) => status.update(state, cli.display)
    });
    status.update(runner.getState(), cli.display);
    (0, commands_js_1.registerCommands)({
        registerCommand: (id, handler) => vscode.commands.registerCommand(id, handler),
        showQuickPick: (items, options) => vscode.window.showQuickPick(items, options),
        showError: (message) => { void vscode.window.showErrorMessage(message); },
        showInfo: (message) => { void vscode.window.showInformationMessage(message); },
        runOneShot: runner.runOneShot,
        start: runner.start,
        stop: runner.stop,
        output,
        subscriptions: context.subscriptions
    });
    context.subscriptions.push({
        dispose: () => {
            void runner.stop();
        }
    });
}
async function deactivate() {
    return;
}
