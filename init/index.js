import { validateConfig } from '../config/index.js';
import { createInitModel } from './model.js';
import { validateRouteInput, validateNonInteractiveArgs } from './validate.js';
import { loadConfigWithRecovery, atomicSaveConfig, resolveConfigPath } from './io.js';
import { runWizard } from './wizard.js';

const DEFAULT_CONFIG_PATH = './devgate.json';

function mapStatusToCode(status, codeOverride = null) {
  if (codeOverride) {
    return codeOverride;
  }
  if (status === 'saved') return 'init_saved';
  if (status === 'cancelled') return 'init_cancelled';
  if (status === 'preview') return 'init_preview';
  return 'init_error';
}

function buildResult({
  status,
  code,
  message,
  changed,
  summary,
  savedPath,
  dryRun,
  details = {}
}) {
  const finalCode = mapStatusToCode(status, code);
  const isError = status === 'error';
  const exitCode = status === 'preview' ? 0 : isError ? 1 : 0;

  return {
    schema_version: '1',
    command: 'init',
    changed,
    added: summary.added,
    updated: summary.updated,
    removed: summary.removed,
    savedPath,
    dryRun: Boolean(dryRun),
    status,
    code: finalCode,
    message,
    details,
    exitCode
  };
}

function applyModeFixture(mode, resolvedPath) {
  const summary = { added: 0, updated: 0, removed: 0, changed: false };
  if (mode === 'saved') {
    return buildResult({ status: 'saved', message: 'Saved.', changed: true, summary: { ...summary, changed: true }, savedPath: resolvedPath, dryRun: false });
  }
  if (mode === 'cancelled') {
    return buildResult({ status: 'cancelled', message: 'Cancelled.', changed: false, summary, savedPath: null, dryRun: false });
  }
  if (mode === 'preview') {
    return buildResult({ status: 'preview', message: 'Preview only.', changed: false, summary, savedPath: resolvedPath, dryRun: true });
  }
  if (mode === 'invalid_args') {
    return buildResult({ status: 'error', code: 'init_invalid_args', message: 'Invalid arguments.', changed: false, summary, savedPath: null, dryRun: false });
  }
  if (mode === 'error') {
    return buildResult({ status: 'error', code: 'init_error', message: 'Command failed.', changed: false, summary, savedPath: null, dryRun: false });
  }
  return null;
}

function toRouteFromOptions(options) {
  return {
    alias: options.addAlias,
    target: {
      protocol: options.protocol,
      host: options.host,
      port: Number(options.port)
    }
  };
}

function toEditPatchFromOptions(options) {
  const patch = { target: {} };
  if (options.protocol !== undefined) patch.target.protocol = options.protocol;
  if (options.host !== undefined) patch.target.host = options.host;
  if (options.port !== undefined) patch.target.port = Number(options.port);
  return patch;
}

function validationMessage(validation) {
  if (!validation) return 'Validation failed.';
  if (validation.message) return validation.message;
  if (Array.isArray(validation.errors) && validation.errors.length > 0) return validation.errors.join('; ');
  return 'Validation failed.';
}

async function applyNonInteractiveAction({ options, model }) {
  const argsValidation = validateNonInteractiveArgs(options);
  if (!argsValidation.ok) {
    return { ok: false, code: 'init_invalid_args', message: argsValidation.message };
  }

  if (options.addAlias) {
    const routeValidation = validateRouteInput({
      alias: options.addAlias,
      protocol: options.protocol,
      host: options.host,
      port: options.port
    });
    if (!routeValidation.ok) {
      return { ok: false, code: 'init_invalid_args', message: validationMessage(routeValidation) };
    }
    const addRes = model.addRoute(toRouteFromOptions(options));
    if (!addRes.ok) {
      return { ok: false, code: 'init_invalid_args', message: addRes.message };
    }
    return { ok: true };
  }

  if (options.editAlias) {
    const existing = model.listRoutes().find((route) => route.alias === options.editAlias);
    if (!existing) {
      return { ok: false, code: 'init_error', message: `Alias '${options.editAlias}' not found. Use --add-alias first.` };
    }
    const routeValidation = validateRouteInput({
      alias: options.editAlias,
      protocol: options.protocol ?? existing.target.protocol,
      host: options.host ?? existing.target.host,
      port: options.port ?? existing.target.port
    });
    if (!routeValidation.ok) {
      return { ok: false, code: 'init_invalid_args', message: validationMessage(routeValidation) };
    }
    const editRes = model.editRoute(options.editAlias, toEditPatchFromOptions(options));
    if (!editRes.ok) {
      return { ok: false, code: 'init_error', message: editRes.message };
    }
    return { ok: true };
  }

  const removeRes = model.removeRoute(options.removeAlias);
  if (!removeRes.ok) {
    return { ok: false, code: 'init_error', message: removeRes.message };
  }
  return { ok: true };
}

export async function runInit(options = {}) {
  const configPath = options.configPath || DEFAULT_CONFIG_PATH;
  const resolvedPath = resolveConfigPath(configPath);
  const modeFixture = options.mode ? applyModeFixture(options.mode, resolvedPath) : null;
  if (modeFixture) return modeFixture;

  const loadResult = await loadConfigWithRecovery({
    configPath,
    chooseCleanTemplate: options.chooseCleanTemplate === true,
    confirmRecovery: options.confirmRecovery === true,
    deps: options.deps
  });

  if (!loadResult.ok) {
    return buildResult({
      status: 'error',
      code: loadResult.code || 'init_error',
      message: `${loadResult.message} Next: run 'devgate init --dry-run' or fix config manually.`,
      changed: false,
      summary: { added: 0, updated: 0, removed: 0, changed: false },
      savedPath: null,
      dryRun: options.dryRun,
      details: { configPath: resolvedPath }
    });
  }

  const model = createInitModel(loadResult.config);
  const details = { configPath: resolvedPath };

  if (options.nonInteractive) {
    const nonInteractive = await applyNonInteractiveAction({ options, model });
    if (!nonInteractive.ok) {
      return buildResult({
        status: 'error',
        code: nonInteractive.code,
        message: `${nonInteractive.message} Next: run 'devgate init --help'.`,
        changed: false,
        summary: model.getSummary(),
        savedPath: null,
        dryRun: options.dryRun,
        details
      });
    }
  } else {
    const wizardResult = await runWizard({
      model,
      validateRouteInput,
      deps: options.deps || {}
    });
    details.guidedFirstRoute = Boolean(wizardResult?.details?.guidedFirstRoute);
    details.removeConfirmed = Boolean(wizardResult?.details?.removeConfirmed);
    details.validationErrors = Number(wizardResult?.details?.validationErrors || 0);

    if (wizardResult.status === 'cancelled') {
      return buildResult({
        status: 'cancelled',
        message: 'Initialization cancelled by user.',
        changed: model.getSummary().changed,
        summary: model.getSummary(),
        savedPath: null,
        dryRun: options.dryRun,
        details
      });
    }
  }

  const summary = model.getSummary();
  const finalConfig = model.toConfig();
  const overallValidation = validateConfig(finalConfig);
  if (!overallValidation.valid) {
    return buildResult({
      status: 'error',
      code: 'init_error',
      message: `${overallValidation.errors.join('; ')} Next: fix route inputs and retry.`,
      changed: summary.changed,
      summary,
      savedPath: null,
      dryRun: options.dryRun,
      details
    });
  }

  if (options.dryRun) {
    return buildResult({
      status: 'preview',
      message: 'Preview generated, no files were changed.',
      changed: summary.changed,
      summary,
      savedPath: resolvedPath,
      dryRun: true,
      details
    });
  }

  const serialized = `${JSON.stringify(finalConfig, null, 2)}\n`;
  const saved = await atomicSaveConfig({ configPath: resolvedPath, content: serialized, deps: options.deps });
  if (!saved.ok) {
    return buildResult({
      status: 'error',
      code: 'init_error',
      message: `${saved.message || 'Failed to save config.'} Next: close file locks and retry.`,
      changed: summary.changed,
      summary,
      savedPath: null,
      dryRun: false,
      details: { ...details, originalUnchanged: saved.originalUnchanged }
    });
  }

  return buildResult({
    status: 'saved',
    message: 'Configuration saved. Next: run `devgate setup` then `devgate start`.',
    changed: summary.changed,
    summary,
    savedPath: resolvedPath,
    dryRun: false,
    details
  });
}

export default { runInit };
