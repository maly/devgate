"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createRunner = createRunner;
const node_child_process_1 = require("node:child_process");
function nowIso() {
    return new Date().toISOString();
}
function mergeState(base, patch) {
    return { ...base, ...patch };
}
function createRunner(options) {
    const spawnImpl = options.spawnImpl || node_child_process_1.spawn;
    const output = options.output;
    const onStateChange = options.onStateChange || (() => undefined);
    let activeStart = null;
    let state = {
        status: 'stopped',
        lastCommand: null,
        lastExitCode: null,
        lastError: null
    };
    const setState = (patch) => {
        state = mergeState(state, patch);
        onStateChange(state);
    };
    const buildArgs = (subcommandArgs) => [...options.cli.baseArgs, ...subcommandArgs];
    const renderCommand = (subcommandArgs) => `${options.cli.cmd} ${buildArgs(subcommandArgs).join(' ')}`;
    const logHeader = (subcommandArgs) => {
        output.appendLine('');
        output.appendLine(`[${nowIso()}] $ ${renderCommand(subcommandArgs)}`);
        output.show(true);
    };
    const attachOutput = (child) => {
        child.stdout?.on('data', (buf) => {
            output.appendLine(String(buf).replace(/\s+$/, ''));
        });
        child.stderr?.on('data', (buf) => {
            output.appendLine(String(buf).replace(/\s+$/, ''));
        });
    };
    const runOneShot = (subcommandArgs) => {
        logHeader(subcommandArgs);
        const args = buildArgs(subcommandArgs);
        setState({ lastCommand: subcommandArgs.join(' ') });
        return new Promise((resolve) => {
            const child = spawnImpl(options.cli.cmd, args, {
                cwd: options.cli.workspacePath || process.cwd(),
                shell: false
            });
            attachOutput(child);
            child.on('error', (err) => {
                setState({ status: 'error', lastError: err.message, lastExitCode: 1 });
                resolve({ ok: false, exitCode: 1 });
            });
            child.on('exit', (code) => {
                const exitCode = code ?? 1;
                if (exitCode !== 0) {
                    setState({ lastExitCode: exitCode, lastError: `Exit ${exitCode}` });
                    resolve({ ok: false, exitCode });
                    return;
                }
                setState({ lastExitCode: 0, lastError: null });
                resolve({ ok: true, exitCode: 0 });
            });
        });
    };
    const start = async (subcommandArgs) => {
        if (activeStart) {
            throw new Error('Devgate is already running from extension.');
        }
        logHeader(subcommandArgs);
        const args = buildArgs(subcommandArgs);
        setState({ status: 'starting', lastCommand: subcommandArgs.join(' '), lastError: null });
        const child = spawnImpl(options.cli.cmd, args, {
            cwd: options.cli.workspacePath || process.cwd(),
            shell: false
        });
        activeStart = child;
        attachOutput(child);
        child.on('error', (err) => {
            setState({ status: 'error', lastError: err.message, lastExitCode: 1 });
            activeStart = null;
        });
        child.on('spawn', () => {
            setState({ status: 'running', lastError: null, lastExitCode: 0 });
        });
        child.on('exit', (code, signal) => {
            const exitCode = code ?? (signal ? 1 : 0);
            if (state.status !== 'stopped') {
                setState({
                    status: exitCode === 0 ? 'stopped' : 'error',
                    lastExitCode: exitCode,
                    lastError: exitCode === 0 ? null : `Process exited (${exitCode}${signal ? `, ${signal}` : ''})`
                });
            }
            activeStart = null;
        });
    };
    const stop = async () => {
        if (!activeStart) {
            setState({ status: 'stopped' });
            return;
        }
        const child = activeStart;
        await new Promise((resolve) => {
            child.once('exit', () => resolve());
            child.kill('SIGTERM');
            setState({ status: 'stopped' });
        });
        activeStart = null;
    };
    return {
        runOneShot,
        start,
        stop,
        getState: () => ({ ...state })
    };
}
exports.default = { createRunner };
