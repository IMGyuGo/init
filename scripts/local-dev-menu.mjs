import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import process from 'node:process';

const isWindows = process.platform === 'win32';
const root = process.cwd();
const entries = [
  { key: 'all', label: 'all', target: 'all', kind: 'toggle' },
  { key: 'i', label: 'infra', target: 'i', kind: 'toggle' },
  { key: 'a', label: 'backend/api', target: 'a', port: 3001, kind: 'toggle' },
  { key: 'f', label: 'frontend', target: 'f', port: 3000, kind: 'toggle' },
  { key: 'w', label: 'worker', target: 'w', kind: 'toggle' },
  { key: 'p', label: 'prisma', target: 'p', kind: 'run' },
];

let selected = 0;
const statuses = new Map();
const statusLabels = new Map();
const details = new Map();

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    socket.setTimeout(250);
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.on('error', () => resolve(false));
  });
}

async function refreshStatuses() {
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.port) {
        statuses.set(entry.key, await checkPort(entry.port));
      }
    }),
  );

  const infra = checkInfra();
  const worker = checkWorker();
  statuses.set('i', infra.running);
  statuses.set('w', worker.running);
  const allRunning = Boolean(statuses.get('i') && statuses.get('a') && statuses.get('f') && statuses.get('w'));
  const anyRunning = Boolean(statuses.get('i') || statuses.get('a') || statuses.get('f') || statuses.get('w'));
  statuses.set('all', allRunning);
  statusLabels.set('all', allRunning ? 'on' : anyRunning ? 'partial' : 'off');
  refreshDetails(infra, worker);
}

function runQuiet(command, args) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 2000,
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function checkInfra() {
  const runningOutput = runQuiet('docker', ['compose', '-f', 'infra/local/docker-compose.yml', 'ps', '--services', '--filter', 'status=running']);
  const runningServices = runningOutput.split(/\r?\n/).filter(Boolean);
  const expectedServices = ['postgres', 'redis', 'mailpit', 'localstack'];
  return {
    running: runningServices.length > 0,
    runningServices,
    expectedServices,
    allExpectedRunning: expectedServices.every((service) => runningServices.includes(service)),
  };
}

function checkWorker() {
  if (isWindows) {
    const command = [
      "Get-CimInstance Win32_Process",
      "Where-Object { $_.CommandLine -and $_.CommandLine -match 'backend[\\\\/]worker' -and $_.CommandLine -match 'npm|tsx|node' }",
      'Select-Object -First 1 -ExpandProperty ProcessId',
    ].join(' | ');
    const processId = runQuiet('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command]);
    return { running: Boolean(processId), processId };
  }

  const result = spawnSync('pgrep', ['-f', 'backend/worker.*(npm|tsx|node)'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  const processId = result.status === 0 ? result.stdout.trim().split(/\r?\n/)[0] : '';
  return { running: Boolean(processId), processId };
}

function refreshDetails(infra, worker) {
  const apiRunning = Boolean(statuses.get('a'));
  const frontendRunning = Boolean(statuses.get('f'));
  const dbReachable = infra.runningServices.includes('postgres') || checkPortSync(5432);
  const localstackReachable = infra.runningServices.includes('localstack') || checkPortSync(14566);
  const queueStatus = checkQueueStatus(localstackReachable);
  const prismaStatus = checkPrismaStatus();

  details.set('all', [
    `health: api ${apiRunning ? 'reachable' : 'down'}, frontend ${frontendRunning ? 'reachable' : 'down'}`,
    `db: ${dbReachable ? 'reachable' : 'down'}`,
    `queue: ${queueStatus}`,
    `prisma: ${prismaStatus}`,
    `restart: ${dbReachable ? 'none' : 'start infra first'}`,
  ]);

  details.set('i', [
    `db: ${dbReachable ? 'reachable' : 'down'}`,
    `queue: ${queueStatus}`,
    `services: ${infra.runningServices.length}/${infra.expectedServices.length} running`,
    `restart: restart api/worker after db restart`,
  ]);

  details.set('a', [
    `health: ${apiRunning ? 'reachable' : 'down'}`,
    `db: ${dbReachable ? 'reachable' : 'down'}`,
    `prisma: ${prismaStatus}`,
    `restart: needed after prisma generate/migrate or db restart`,
  ]);

  details.set('f', [
    `health: ${frontendRunning ? 'reachable' : 'down'}`,
    `api: ${apiRunning ? 'reachable' : 'down'}`,
    `restart: usually not needed when backend changes`,
  ]);

  details.set('w', [
    `health: ${worker.running ? `process ${worker.processId}` : 'down'}`,
    `db: ${dbReachable ? 'reachable' : 'down'}`,
    `queue: ${queueStatus}`,
    `prisma: ${prismaStatus}`,
    `restart: needed after prisma generate/migrate or db restart`,
  ]);

  details.set('p', [
    'prisma: generate + migrate + seed',
    `db: ${dbReachable ? 'reachable' : 'down'}`,
    `client: ${prismaStatus}`,
    'restart: api/worker should be restarted after schema/client changes',
  ]);
}

function checkQueueStatus(localstackReachable) {
  if (!localstackReachable) return 'unknown';

  const output = runQuiet('docker', [
    'compose',
    '-f',
    'infra/local/docker-compose.yml',
    'exec',
    '-T',
    'localstack',
    'awslocal',
    '--endpoint-url=http://localhost:4566',
    'sqs',
    'list-queues',
  ]);

  if (!output) return 'unknown';
  return output.includes('init-ai-jobs') ? 'ok' : 'missing';
}

function checkPrismaStatus() {
  const clientPath = `${root}/backend/api/node_modules/.prisma/client/index.d.ts`;
  return fs.existsSync(clientPath) ? 'client generated' : 'client missing';
}

function checkPortSync(port) {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      `const net=require('net');const s=net.createConnection({host:'127.0.0.1',port:${port}},()=>{s.destroy();process.exit(0)});s.setTimeout(250,()=>{s.destroy();process.exit(1)});s.on('error',()=>process.exit(1));`,
    ],
    { stdio: 'ignore' },
  );
  return result.status === 0;
}

function clear() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function statusText(entry) {
  if (entry.kind === 'run') return 'run';
  if (statusLabels.has(entry.key)) return statusLabels.get(entry.key);
  const running = statuses.get(entry.key);
  return running ? 'on' : 'off';
}

function render() {
  clear();
  console.log('Final Weapon local dev menu');
  console.log('');
  console.log('↑/↓ move · Enter toggle/run · r refresh · q quit');
  console.log('');
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const marker = index === selected ? '>' : ' ';
    const number = `${index + 1}.`;
    console.log(`${marker} ${number.padStart(2)} ${entry.label.padEnd(16)} ${statusText(entry)}`);
  }
  console.log('');
  renderDetails(entries[selected]);
}

function renderDetails(entry) {
  console.log(`Details: ${entry.label}`);
  const rows = details.get(entry.key) ?? [];
  for (const row of rows) {
    console.log(`- ${row}`);
  }
}

function runFw(action, target) {
  const command = isWindows ? 'powershell' : 'bash';
  const args = isWindows
    ? ['-ExecutionPolicy', 'Bypass', '-File', 'fw.ps1', action, target]
    : ['fw.sh', action, target];

  process.stdin.setRawMode(false);
  process.stdin.pause();
  spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  process.stdin.resume();
  process.stdin.setRawMode(true);
}

async function toggleSelected() {
  const entry = entries[selected];
  if (entry.kind === 'run') {
    runFw('p', entry.target);
    return;
  }

  const running = entry.key === 'all'
    ? statusLabels.get('all') === 'on'
    : Boolean(statuses.get(entry.key));
  runFw(running ? 'down' : 'up', entry.target);
}

async function main() {
  await refreshStatuses();
  render();

  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (key) => {
    if (key === '\u0003' || key === 'q') {
      process.stdin.setRawMode(false);
      process.stdout.write('\n');
      process.exit(0);
    }

    if (key === '\u001b[A') {
      selected = (selected - 1 + entries.length) % entries.length;
    } else if (key === '\u001b[B') {
      selected = (selected + 1) % entries.length;
    } else if (key === '\r' || key === '\n') {
      await toggleSelected();
      await refreshStatuses();
    } else if (key === 'r') {
      await refreshStatuses();
    }

    render();
  });
}

main().catch((error) => {
  process.stdin.setRawMode(false);
  console.error(error);
  process.exit(1);
});
