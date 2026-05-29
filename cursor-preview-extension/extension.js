const vscode = require('vscode');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT_RANGE_START = 7457;
const PORT_RANGE_END = 7476;
const REGISTRY_DIR = path.join(os.homedir(), '.ecodia-preview');
const REGISTRY_FILE = path.join(REGISTRY_DIR, 'instances.json');

function readRegistry() {
  try { return JSON.parse(fs.readFileSync(REGISTRY_FILE, 'utf8')); }
  catch { return {}; }
}

function writeRegistry(reg) {
  fs.mkdirSync(REGISTRY_DIR, { recursive: true });
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(reg, null, 2));
}

function pruneRegistry() {
  const reg = readRegistry();
  let changed = false;
  for (const pid of Object.keys(reg)) {
    try { process.kill(Number(pid), 0); }
    catch { delete reg[pid]; changed = true; }
  }
  if (changed) writeRegistry(reg);
  return reg;
}

function registerSelf(port) {
  const reg = pruneRegistry();
  reg[process.pid] = {
    port,
    ide: vscode.env.appName || 'unknown',
    workspaceRoots: (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath),
    startedAt: new Date().toISOString(),
  };
  writeRegistry(reg);
}

function unregisterSelf() {
  const reg = readRegistry();
  delete reg[process.pid];
  writeRegistry(reg);
}

const ROUTER_PATH = path.join(__dirname, 'router.js');
const SWEEPER_PATH = path.join(__dirname, 'sweeper.js');
const IDE_BRIDGE_PATH = path.join(__dirname, 'ide-bridge.js');

async function openPreview(filePath) {
  // Hot-reload router.js on every request so routing tweaks land without window reload
  delete require.cache[require.resolve(ROUTER_PATH)];
  const router = require(ROUTER_PATH);
  await router.openPreview(filePath, vscode);
}

function loadSweeper() {
  delete require.cache[require.resolve(SWEEPER_PATH)];
  return require(SWEEPER_PATH);
}

function loadIdeBridge() {
  // Hot-reload so route changes land without Reload Window.
  delete require.cache[require.resolve(IDE_BRIDGE_PATH)];
  return require(IDE_BRIDGE_PATH);
}

function tryListen(server) {
  return new Promise((resolve, reject) => {
    let port = PORT_RANGE_START;
    const attempt = () => {
      const onError = (e) => {
        server.off('listening', onListening);
        if (e.code === 'EADDRINUSE' && port < PORT_RANGE_END) {
          port += 1;
          setImmediate(attempt);
        } else {
          reject(e);
        }
      };
      const onListening = () => {
        server.off('error', onError);
        resolve(port);
      };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, '127.0.0.1');
    };
    attempt();
  });
}

function activate(context) {
  const sweeper = loadSweeper();
  const sweeperHandle = sweeper.init(vscode);

  const server = http.createServer((req, res) => {
    const json = (status, payload) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };

    // Focusless IDE-control surface. All /ide/* routes are handled by the
    // hot-reloaded bridge module so we can iterate the API without Reload
    // Window. See ide-bridge.js for the full route table.
    if (req.url && req.url.startsWith('/ide/')) {
      try {
        const bridge = loadIdeBridge();
        bridge.handle(req, res, vscode);
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e && e.message || e) }));
      }
      return;
    }

    if (req.method === 'POST' && req.url === '/open-preview') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const { path: filePath } = JSON.parse(body);
          if (!filePath) { res.writeHead(400); res.end('missing path'); return; }
          await openPreview(filePath);
          res.writeHead(200); res.end('ok');
        } catch (e) {
          res.writeHead(500); res.end(String(e && e.message || e));
        }
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/sweep-claude-tabs') {
      let body = '';
      req.on('data', c => body += c);
      req.on('end', async () => {
        try {
          const opts = body ? JSON.parse(body) : {};
          const fresh = loadSweeper();
          const result = await fresh.sweep(vscode, opts);
          json(200, { ok: true, ide: vscode.env.appName, ...result });
        } catch (e) {
          json(500, { ok: false, error: String(e && e.message || e) });
        }
      });
      return;
    }

    if (req.method === 'GET' && req.url === '/list-claude-tabs') {
      try {
        const fresh = loadSweeper();
        const tabs = [];
        for (const group of vscode.window.tabGroups.all) {
          for (const tab of group.tabs) {
            if (!fresh.isClaudeCodeTab(tab)) continue;
            tabs.push({
              label: tab.label,
              active: tab.isActive,
              pinned: tab.isPinned,
              dirty: tab.isDirty,
              viewColumn: tab.group?.viewColumn,
              viewType: tab.input?.viewType,
            });
          }
        }
        json(200, { ok: true, ide: vscode.env.appName, count: tabs.length, tabs });
      } catch (e) {
        json(500, { ok: false, error: String(e && e.message || e) });
      }
      return;
    }

    res.writeHead(404); res.end();
  });

  tryListen(server).then(port => {
    registerSelf(port);
    console.log(`[ecodia-preview] listening on 127.0.0.1:${port} (${vscode.env.appName})`);
  }).catch(e => console.error('[ecodia-preview] failed to bind:', e));

  context.subscriptions.push({
    dispose: () => {
      try { server.close(); } catch {}
      try { sweeperHandle.dispose(); } catch {}
      unregisterSelf();
    }
  });
}

function deactivate() { unregisterSelf(); }

module.exports = { activate, deactivate };
