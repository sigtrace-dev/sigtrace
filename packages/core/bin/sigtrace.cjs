#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);

if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
  console.log(`
Usage: npx sigtrace run <command>

Zero-configuration reactivity tracing loader. Run your serve/dev command prefixed with sigtrace to dynamically trace signals and reactivity without modifying any source code or config files.

Examples:
  npx sigtrace run ng serve
  npx sigtrace run yarn develop
  npx sigtrace run npm run start
  `);
  process.exit(0);
}

if (args[0] === 'run') {
  const targetCommand = args.slice(1);
  if (targetCommand.length === 0) {
    console.error('Error: Please specify the command to run. Example: npx sigtrace run ng serve');
    process.exit(1);
  }

  // Resolve preloader path
  const preloaderPath = path.resolve(__dirname, '../register.cjs');

  // Inject into NODE_OPTIONS
  const existingNodeOptions = process.env.NODE_OPTIONS || '';
  const newPreloadFlag = `-r "${preloaderPath}"`;
  
  if (!existingNodeOptions.includes('register.cjs')) {
    process.env.NODE_OPTIONS = (existingNodeOptions + ' ' + newPreloadFlag).trim();
  }

  console.log(`[SigTrace CLI] Injecting preloader: ${preloaderPath}`);
  console.log(`[SigTrace CLI] Spawning command: ${targetCommand.join(' ')}\n`);

  // Spawn the child process
  const child = spawn(targetCommand[0], targetCommand.slice(1), {
    stdio: 'inherit',
    shell: true,
    env: process.env
  });

  child.on('exit', (code) => {
    process.exit(code || 0);
  });

  child.on('error', (err) => {
    console.error('[SigTrace CLI] Failed to start command:', err);
    process.exit(1);
  });
} else {
  console.error(`Unknown command: "${args[0]}". Did you mean "npx sigtrace run <command>"?`);
  process.exit(1);
}
