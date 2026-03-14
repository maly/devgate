#!/usr/bin/env node

import cli from '../index.js';

const result = await cli.run();
process.exit(result.exitCode);
