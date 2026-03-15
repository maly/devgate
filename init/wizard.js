import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function toPort(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : value;
}

function createDefaultUi() {
  const rl = readline.createInterface({ input, output });
  return {
    async chooseAction() {
      const answer = await rl.question('Choose action (add/edit/remove/list/save/cancel): ');
      return String(answer || '').trim().toLowerCase();
    },
    async promptRoute(defaults = {}) {
      const alias = await rl.question(`Alias${defaults.alias ? ` [${defaults.alias}]` : ''}: `);
      const protocol = await rl.question(`Protocol (http/https)${defaults.protocol ? ` [${defaults.protocol}]` : ''}: `);
      const host = await rl.question(`Host${defaults.host ? ` [${defaults.host}]` : ''}: `);
      const portRaw = await rl.question(`Port${defaults.port ? ` [${defaults.port}]` : ''}: `);
      return {
        alias: alias || defaults.alias,
        protocol: protocol || defaults.protocol,
        host: host || defaults.host,
        port: toPort(portRaw || defaults.port)
      };
    },
    async promptAlias(label = 'Alias') {
      return rl.question(`${label}: `);
    },
    async confirm(message) {
      const answer = await rl.question(`${message} [y/N]: `);
      return ['y', 'yes'].includes(String(answer || '').trim().toLowerCase());
    },
    async close() {
      rl.close();
    }
  };
}

function toRoute(routeInput) {
  return {
    alias: routeInput.alias,
    target: {
      protocol: routeInput.protocol,
      host: routeInput.host,
      port: Number(routeInput.port)
    }
  };
}

async function promptAndAddRoute({ ui, model, validateRouteInput, details }) {
  const routeInput = await ui.promptRoute();
  const valid = validateRouteInput(routeInput);
  if (!valid.ok) {
    details.validationErrors += 1;
    return;
  }
  const addRes = model.addRoute(toRoute(routeInput));
  if (!addRes.ok && addRes.code === 'alias_exists') {
    const switchToEdit = await ui.confirm(`Alias '${routeInput.alias}' exists. Edit it instead?`);
    if (!switchToEdit) {
      details.validationErrors += 1;
      return;
    }
    model.editRoute(routeInput.alias, { target: toRoute(routeInput).target });
  }
}

async function editRoute({ ui, model, validateRouteInput, details }) {
  const alias = await ui.promptAlias('Alias to edit');
  const current = model.listRoutes().find((route) => route.alias === alias);
  if (!current) {
    details.validationErrors += 1;
    return;
  }
  const routeInput = await ui.promptRoute({
    alias: current.alias,
    protocol: current.target.protocol,
    host: current.target.host,
    port: current.target.port
  });
  const valid = validateRouteInput(routeInput);
  if (!valid.ok) {
    details.validationErrors += 1;
    return;
  }
  model.editRoute(alias, { target: toRoute(routeInput).target });
}

async function removeRoute({ ui, model, details }) {
  const alias = await ui.promptAlias('Alias to remove');
  const confirm = await ui.confirm(`Remove alias '${alias}'?`);
  if (!confirm) {
    return;
  }
  details.removeConfirmed = true;
  const res = model.removeRoute(alias);
  if (!res.ok) {
    details.validationErrors += 1;
  }
}

export async function runWizard({
  model,
  validateRouteInput,
  deps = {}
} = {}) {
  const ui = deps.ui || createDefaultUi();
  const details = {
    guidedFirstRoute: false,
    removeConfirmed: false,
    validationErrors: 0
  };

  try {
    if (model.listRoutes().length === 0) {
      details.guidedFirstRoute = true;
      await promptAndAddRoute({ ui, model, validateRouteInput, details });
    }

    while (true) {
      const action = await ui.chooseAction();
      if (action === 'add') {
        await promptAndAddRoute({ ui, model, validateRouteInput, details });
        continue;
      }
      if (action === 'edit') {
        await editRoute({ ui, model, validateRouteInput, details });
        continue;
      }
      if (action === 'remove') {
        await removeRoute({ ui, model, details });
        continue;
      }
      if (action === 'list') {
        // no-op for orchestrator; CLI handles rendering if needed
        continue;
      }
      if (action === 'save') {
        return { status: 'saved', details };
      }
      if (action === 'cancel') {
        const summary = model.getSummary();
        if (summary.changed) {
          const confirmCancel = await ui.confirm('Discard unsaved changes and cancel?');
          if (!confirmCancel) {
            continue;
          }
        }
        return { status: 'cancelled', details };
      }
      details.validationErrors += 1;
    }
  } finally {
    if (typeof ui.close === 'function') {
      await ui.close();
    }
  }
}

export default { runWizard };
