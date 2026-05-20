#!/usr/bin/env node

/**
 * Xiaoqinglong Doctor
 * Local readiness checker for the Xiaozhi + LobeHub macOS bridge.
 * Uses Node.js built-ins only and never sends data off the machine.
 */

const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const isJson = process.argv.includes('--json');
const rootDir = process.cwd();

const results = {
  timestamp: new Date().toISOString(),
  node: { status: 'pending' },
  env: { status: 'pending' },
  files: { status: 'pending', checks: [] },
  lobe: { status: 'pending' },
  services: { status: 'pending', checks: [] }
};

let exitCode = 0;

function markFatal() {
  exitCode = 1;
}

function expandHome(value) {
  if (!value) return value;
  if (value === '~') return os.homedir();
  if (value.startsWith('~/')) return path.join(os.homedir(), value.slice(2));
  return value;
}

function parseEnvFile(filePath) {
  const env = {};
  const content = fs.readFileSync(filePath, 'utf8');

  for (const rawLine of content.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsAt = rawLine.indexOf('=');
    if (equalsAt === -1) continue;

    const key = rawLine.slice(0, equalsAt).trim();
    let value = rawLine.slice(equalsAt + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }

  return env;
}

function checkJsonFile(file, required) {
  const filePath = path.join(rootDir, file);
  if (!fs.existsSync(filePath)) {
    const status = required ? 'fail' : 'skipped';
    const check = { file, status };
    if (required) {
      check.error = 'Missing required JSON file';
      results.files.status = 'fail';
      markFatal();
    }
    results.files.checks.push(check);
    return;
  }

  try {
    JSON.parse(fs.readFileSync(filePath, 'utf8'));
    results.files.checks.push({ file, status: 'pass' });
  } catch (error) {
    results.files.checks.push({ file, status: 'fail', error: 'Invalid JSON' });
    results.files.status = 'fail';
    markFatal();
  }
}

const nodeVersion = process.version;
const majorVersion = Number.parseInt(nodeVersion.slice(1).split('.')[0], 10);
results.node = {
  status: majorVersion >= 18 ? 'pass' : 'fail',
  version: nodeVersion,
  required: '>=18'
};
if (results.node.status === 'fail') markFatal();

const envPath = path.join(rootDir, '.env');
const legacyEnvPath = path.join(rootDir, 'doubao-asr-frontdoor.env');
const envSources = [
  { name: 'doubao-asr-frontdoor.env', path: legacyEnvPath },
  { name: '.env', path: envPath },
];
let envVars = {};

for (const source of envSources) {
  if (fs.existsSync(source.path)) {
    envVars = { ...envVars, ...parseEnvFile(source.path) };
  }
}

const existingSources = envSources.filter((source) => fs.existsSync(source.path)).map((source) => source.name);
if (existingSources.length === 0) {
  results.env = { status: 'fail', message: '.env file missing' };
  markFatal();
} else {
  const requiredKeys = ['XIAOZHI_MCP_WS', 'DOUBAO_ASR_API_KEY', 'LOBE_AGENT_ID', 'XIAOQINGLONG_API_TOKEN'];
  const missingKeys = requiredKeys.filter((key) => !envVars[key]);

  results.env = {
    status: missingKeys.length === 0 ? 'pass' : 'fail',
    sources: existingSources,
    found: Object.keys(envVars).length,
    missing: missingKeys
  };
  if (results.env.status === 'fail') markFatal();
}

results.files.status = 'pass';
const requiredJsonFiles = [
  'package.json',
  'examples/jarvis-mode.example.json',
  'examples/xiaoqinglong-default-brain.example.json'
];
const optionalRuntimeJsonFiles = [
  'jarvis-mode.json',
  'xiaoqinglong-default-brain.json',
  'xiaoqinglong-ai-tasks.json',
  'xiaoqinglong-approvals.json'
];

for (const file of requiredJsonFiles) checkJsonFile(file, true);
for (const file of optionalRuntimeJsonFiles) checkJsonFile(file, false);

const defaultLobePath = '~/Library/Application Support/LobeHub/bin/lobe';
const lobeDisplayPath = envVars.LOBE_CLI_PATH || defaultLobePath;
const lobePath = expandHome(lobeDisplayPath);

if (!fs.existsSync(lobePath)) {
  results.lobe = {
    status: 'fail',
    source: envVars.LOBE_CLI_PATH ? 'LOBE_CLI_PATH' : 'default',
    path: lobeDisplayPath,
    message: 'LobeHub CLI was not found. Set LOBE_CLI_PATH if your install location is custom.'
  };
  markFatal();
} else {
  results.lobe = {
    status: 'pass',
    source: envVars.LOBE_CLI_PATH ? 'LOBE_CLI_PATH' : 'default',
    path: lobeDisplayPath
  };
}

async function probe(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve({ status: 'pass', code: res.statusCode });
    });

    req.on('error', (error) => resolve({ status: 'fail', error: error.code || error.message }));
    req.setTimeout(1000, () => {
      req.destroy();
      resolve({ status: 'fail', error: 'timeout' });
    });
  });
}

async function runProbes() {
  const frontdoorPort = envVars.XIAOQINGLONG_FRONTDOOR_PORT || '43173';
  const panelPort = envVars.XIAOQINGLONG_PANEL_PORT || '43174';
  const services = [
    { name: 'Frontdoor Health', url: `http://127.0.0.1:${frontdoorPort}/health` },
    { name: 'Mission Control API', url: `http://127.0.0.1:${frontdoorPort}/api/mission-control` },
    { name: 'Control Panel', url: `http://127.0.0.1:${panelPort}/` }
  ];

  let allPass = true;
  for (const service of services) {
    const result = await probe(service.url);
    results.services.checks.push({ name: service.name, url: service.url, ...result });
    if (result.status !== 'pass') allPass = false;
  }

  results.services.status = allPass ? 'online' : 'partial/offline';
}

function statusLabel(status) {
  if (status === 'pass' || status === 'online') return '[OK]';
  if (status === 'fail') return '[FAIL]';
  return '[WARN]';
}

function printReport() {
  console.log('\nXiaoqinglong Readiness Report\n');
  console.log(`${statusLabel(results.node.status)} Node.js:  ${results.node.version} (required ${results.node.required})`);

  const envMessage = results.env.status === 'pass'
    ? 'Configured'
    : (results.env.message || `Missing keys: ${results.env.missing.join(', ')}`);
  console.log(`${statusLabel(results.env.status)} .env:     ${envMessage}`);

  console.log(`${statusLabel(results.files.status)} Files:    ${results.files.status === 'pass' ? 'Healthy' : 'Issues detected'}`);
  for (const check of results.files.checks) {
    if (check.status === 'fail') console.log(`   - ${check.file}: ${check.error}`);
  }

  console.log(`${statusLabel(results.lobe.status)} Lobe CLI: ${results.lobe.path || 'unknown'}`);
  if (results.lobe.status === 'fail') console.log(`   - ${results.lobe.message}`);

  const servicesMessage = results.services.status === 'online' ? 'Online' : 'Some services are offline';
  console.log(`${statusLabel(results.services.status)} Services: ${servicesMessage}`);
  for (const check of results.services.checks) {
    const mark = check.status === 'pass' ? 'online' : 'off';
    console.log(`   - [${mark.padEnd(6)}] ${check.name} (${check.url})`);
  }

  console.log('\n------------------------------------------------');
  if (exitCode === 0) {
    if (results.services.status !== 'online') {
      console.log('Local configuration is valid.');
      console.log('Tip: start services with "npm run start:frontdoor", "npm run start:panel", and "npm run start:bridge".');
    } else {
      console.log('System is ready and services are online.');
    }
  } else {
    console.log('Please fix the issues above before running the bridge.');
  }
  console.log('');
}

(async () => {
  await runProbes();

  if (isJson) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    printReport();
  }

  process.exit(exitCode);
})();
