import express from 'express';
import { WebSocketServer } from 'ws';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import pty from 'node-pty';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const USER_DATA_DIR = path.join(__dirname, '..', 'user-data');
if (!fs.existsSync(USER_DATA_DIR)) {
  fs.mkdirSync(USER_DATA_DIR, { recursive: true });
}

const ACTIVE_SESSIONS_FILE = path.join(__dirname, '..', 'user-data', 'sessions.json');
if (!fs.existsSync(ACTIVE_SESSIONS_FILE)) {
  fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify({}));
}

function loadSessions() {
  try {
    return JSON.parse(fs.readFileSync(ACTIVE_SESSIONS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function saveSessions(sessions) {
  fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

const sessions = new Map();

function getShell() {
  if (process.platform === 'win32') {
    return 'powershell.exe';
  }
  const shells = ['/bin/bash', '/bin/sh', '/usr/bin/bash', '/usr/bin/sh'];
  for (const shell of shells) {
    if (fs.existsSync(shell)) {
      return shell;
    }
  }
  return 'bash';
}

function createSession(id) {
  const sessionDir = path.join(USER_DATA_DIR, 'home', id);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const shell = getShell();
  const ptyProcess = pty.spawn(shell, [], {
    name: 'xterm-256color',
    cols: 80,
    rows: 24,
    cwd: sessionDir,
    env: {
      ...process.env,
      TERM: 'xterm-256color',
      HOME: sessionDir,
      USER: 'shadow',
      HOSTNAME: 'shadow-terminal',
      PS1: '\\[\\e[0;32m\\]shadow@shadow-terminal:~\\$ \\[\\e[0m\\]',
      PATH: `${process.env.PATH}:/usr/bin:/usr/local/bin`,
    }
  });

  return { ptyProcess, sessionDir };
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionId = url.searchParams.get('session') || `session_${Date.now()}`;
  
  console.log(`New connection: ${sessionId}`);
  
  let session;
  if (sessions.has(sessionId)) {
    session = sessions.get(sessionId);
  } else {
    session = createSession(sessionId);
    sessions.set(sessionId, session);
    
    const savedSessions = loadSessions();
    savedSessions[sessionId] = {
      created: new Date().toISOString(),
      lastActive: new Date().toISOString(),
      dir: session.sessionDir,
    };
    saveSessions(savedSessions);
  }

  const { ptyProcess } = session;

  ptyProcess.onData((data) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'data', data }));
    }
  });

  ptyProcess.onExit(({ exitCode, signal }) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(JSON.stringify({ type: 'exit', exitCode, signal }));
    }
    sessions.delete(sessionId);
  });

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      
      switch (msg.type) {
        case 'input':
          ptyProcess.write(msg.data);
          break;
        case 'resize':
          ptyProcess.resize(msg.cols, msg.rows);
          break;
        case 'command':
          handleCommand(ws, msg, session);
          break;
      }
    } catch (err) {
      ptyProcess.write(message.toString());
    }
    
    const savedSessions = loadSessions();
    if (savedSessions[sessionId]) {
      savedSessions[sessionId].lastActive = new Date().toISOString();
      saveSessions(savedSessions);
    }
  });

  ws.on('close', () => {
    console.log(`Connection closed: ${sessionId}`);
  });

  ws.send(JSON.stringify({ 
    type: 'connected', 
    sessionId,
    message: '\r\n\x1b[0;32m=== Shadow Terminal v1.0 ===\x1b[0m\r\n'
  }));
});

async function handleCommand(ws, msg, session) {
  const { command, args = [] } = msg;
  
  switch (command) {
    case 'list-sessions': {
      const saved = loadSessions();
      ws.send(JSON.stringify({ 
        type: 'command-result', 
        command: 'list-sessions',
        data: Object.entries(saved).map(([id, info]) => ({ id, ...info }))
      }));
      break;
    }
    
    case 'get-system-info': {
      const info = {
        platform: process.platform,
        arch: process.arch,
        nodeVersion: process.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpus: os.cpus().length,
        hostname: os.hostname(),
        loadavg: os.loadavg(),
        totalmem: os.totalmem(),
        freemem: os.freemem(),
      };
      ws.send(JSON.stringify({ type: 'command-result', command: 'system-info', data: info }));
      break;
    }
    
    case 'file-exists': {
      const filePath = path.join(session.sessionDir, msg.path || '');
      const exists = fs.existsSync(filePath);
      ws.send(JSON.stringify({ type: 'command-result', command: 'file-exists', data: { path: msg.path, exists } }));
      break;
    }
    
    case 'read-file': {
      try {
        const filePath = path.join(session.sessionDir, msg.path || '');
        const content = fs.readFileSync(filePath, 'utf8');
        ws.send(JSON.stringify({ type: 'command-result', command: 'read-file', data: { path: msg.path, content } }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
      break;
    }
    
    case 'write-file': {
      try {
        const filePath = path.join(session.sessionDir, msg.path || '');
        fs.writeFileSync(filePath, msg.content);
        ws.send(JSON.stringify({ type: 'command-result', command: 'write-file', data: { path: msg.path, success: true } }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
      break;
    }
    
    case 'delete-file': {
      try {
        const filePath = path.join(session.sessionDir, msg.path || '');
        fs.unlinkSync(filePath);
        ws.send(JSON.stringify({ type: 'command-result', command: 'delete-file', data: { path: msg.path, success: true } }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
      break;
    }
    
    case 'list-files': {
      try {
        const dirPath = path.join(session.sessionDir, msg.path || '');
        if (!fs.existsSync(dirPath)) {
          ws.send(JSON.stringify({ type: 'command-result', command: 'list-files', data: [] }));
          return;
        }
        const files = fs.readdirSync(dirPath).map(name => {
          const fullPath = path.join(dirPath, name);
          const stats = fs.statSync(fullPath);
          return {
            name,
            isDirectory: stats.isDirectory(),
            size: stats.size,
            modified: stats.mtime.toISOString(),
            permissions: stats.mode.toString(8).slice(-3),
          };
        });
        ws.send(JSON.stringify({ type: 'command-result', command: 'list-files', data: files }));
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
      break;
    }
    
    case 'install-package': {
      try {
        const { packageManager, packageName } = msg;
        const installDir = path.join(session.sessionDir, msg.dir || '.');
        let installCmd;
        
        switch (packageManager) {
          case 'npm':
            installCmd = `npm install ${packageName} 2>&1`;
            break;
          case 'pip':
            installCmd = `pip install ${packageName} 2>&1`;
            break;
          case 'git':
            installCmd = `git clone ${packageName} 2>&1`;
            break;
          default:
            ws.send(JSON.stringify({ type: 'error', message: 'Unknown package manager' }));
            return;
        }
        
        const child = spawn('sh', ['-c', installCmd], { cwd: installDir });
        
        child.stdout.on('data', (data) => {
          ws.send(JSON.stringify({ type: 'data', data: data.toString() }));
        });
        
        child.stderr.on('data', (data) => {
          ws.send(JSON.stringify({ type: 'data', data: data.toString() }));
        });
        
        child.on('close', (code) => {
          ws.send(JSON.stringify({ type: 'command-result', command: 'install-package', data: { packageName, exitCode: code } }));
        });
      } catch (err) {
        ws.send(JSON.stringify({ type: 'error', message: err.message }));
      }
      break;
    }
    
    default:
      ws.send(JSON.stringify({ type: 'error', message: `Unknown command: ${command}` }));
  }
}

const distPath = path.join(__dirname, '..', 'dist');
app.use(express.static(distPath));

app.get('/{*splat}', (req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Shadow Terminal running on port ${PORT}`);
});
