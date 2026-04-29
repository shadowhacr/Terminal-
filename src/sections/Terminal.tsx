import React, { useEffect, useRef, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import './Terminal.css';
import { 
  Play, 
  Square, 
  Trash2, 
  Plus, 
  Terminal as TerminalIcon,
  Settings,
  Maximize2,
  Minimize2
} from 'lucide-react';

interface TerminalProps {
  sessionId?: string;
}

const Terminal: React.FC<TerminalProps> = ({ sessionId: propSessionId }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [sessionId, setSessionId] = useState(propSessionId || `session_${Date.now()}`);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const connectWebSocket = () => {
    const ws = new WebSocket(`ws://${window.location.host}/terminal?session=${sessionId}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (xtermRef.current) {
        xtermRef.current.writeln('\r\n\x1b[0;32m[+] Connected to Shadow Terminal\x1b[0m\r\n');
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'data' && xtermRef.current) {
          xtermRef.current.write(msg.data);
        } else if (msg.type === 'connected') {
          if (xtermRef.current && msg.message) {
            xtermRef.current.write(msg.message);
          }
        }
      } catch {
        if (xtermRef.current) {
          xtermRef.current.write(event.data);
        }
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (xtermRef.current) {
        xtermRef.current.writeln('\r\n\x1b[0;31m[-] Disconnected from server\x1b[0m');
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnected(false);
    };
  };

  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontSize: 14,
      fontFamily: '"Courier New", "Consolas", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#00ff41',
        cursor: '#00ff41',
        cursorAccent: '#0a0a0a',
        selectionBackground: 'rgba(0, 255, 65, 0.3)',
        black: '#0a0a0a',
        red: '#ff0040',
        green: '#00ff41',
        yellow: '#ffcc00',
        blue: '#0080ff',
        magenta: '#ff00ff',
        cyan: '#00ffff',
        white: '#e0e0e0',
        brightBlack: '#555555',
        brightRed: '#ff3366',
        brightGreen: '#33ff66',
        brightYellow: '#ffdd44',
        brightBlue: '#3380ff',
        brightMagenta: '#ff44ff',
        brightCyan: '#44ffff',
        brightWhite: '#ffffff',
      },
      allowTransparency: false,
      scrollback: 10000,
      rows: 24,
      cols: 80,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    term.writeln('\x1b[0;32m[*] Initializing Shadow Terminal...\x1b[0m');
    term.writeln('\x1b[0;32m[*] Press any key to connect...\x1b[0m\r\n');

    term.onData((data) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'input', data }));
      } else if (!isConnected) {
        connectWebSocket();
      }
    });

    term.onResize(({ cols, rows }) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'resize', cols, rows }));
      }
    });

    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Auto connect after a short delay
    setTimeout(() => {
      connectWebSocket();
    }, 500);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (wsRef.current) {
        wsRef.current.close();
      }
      term.dispose();
    };
  }, [sessionId]);

  const clearTerminal = () => {
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  const newSession = () => {
    const newId = `session_${Date.now()}`;
    setSessionId(newId);
    if (xtermRef.current) {
      xtermRef.current.clear();
    }
  };

  const disconnectSession = () => {
    if (wsRef.current) {
      wsRef.current.close();
    }
    setIsConnected(false);
  };

  const toggleFullscreen = () => {
    setIsFullscreen(!isFullscreen);
    setTimeout(() => {
      if (fitAddonRef.current) {
        fitAddonRef.current.fit();
      }
    }, 100);
  };

  const runQuickCommand = (cmd: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'input', data: cmd + '\r' }));
    }
  };

  const quickCommands = [
    { label: 'ls', cmd: 'ls -la' },
    { label: 'pwd', cmd: 'pwd' },
    { label: 'node -v', cmd: 'node -v' },
    { label: 'python -v', cmd: 'python --version' },
    { label: 'git --version', cmd: 'git --version' },
    { label: 'neofetch', cmd: 'neofetch 2>/dev/null || echo "Install neofetch"' },
  ];

  return (
    <div className={`terminal-wrapper ${isFullscreen ? 'fullscreen' : ''}`}>
      {/* Terminal Header */}
      <div className="terminal-header">
        <div className="terminal-header-left">
          <TerminalIcon size={16} className="header-icon" />
          <span className="terminal-title">Shadow Terminal</span>
          <span className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '● LIVE' : '○ OFFLINE'}
          </span>
        </div>
        <div className="terminal-header-right">
          <span className="session-id">{sessionId}</span>
          <button className="header-btn" onClick={() => setShowHelp(!showHelp)} title="Help">
            <Settings size={14} />
          </button>
          <button className="header-btn" onClick={newSession} title="New Session">
            <Plus size={14} />
          </button>
          <button className="header-btn" onClick={clearTerminal} title="Clear">
            <Trash2 size={14} />
          </button>
          <button className="header-btn" onClick={disconnectSession} title="Disconnect">
            <Square size={14} />
          </button>
          <button className="header-btn" onClick={toggleFullscreen} title="Fullscreen">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Quick Commands Bar */}
      <div className="quick-commands">
        {quickCommands.map((q) => (
          <button
            key={q.label}
            className="quick-cmd-btn"
            onClick={() => runQuickCommand(q.cmd)}
          >
            <Play size={10} />
            {q.label}
          </button>
        ))}
      </div>

      {/* Terminal Body */}
      <div className="terminal-body">
        <div ref={terminalRef} className="terminal-container" />
      </div>

      {/* Help Panel */}
      {showHelp && (
        <div className="help-panel">
          <h3>Shadow Terminal Commands</h3>
          <div className="help-grid">
            <div className="help-section">
              <h4>System</h4>
              <ul>
                <li><code>ls</code> - List files</li>
                <li><code>cd &lt;dir&gt;</code> - Change directory</li>
                <li><code>pwd</code> - Print working directory</li>
                <li><code>cat &lt;file&gt;</code> - View file</li>
                <li><code>touch &lt;file&gt;</code> - Create file</li>
                <li><code>rm &lt;file&gt;</code> - Remove file</li>
                <li><code>mkdir &lt;dir&gt;</code> - Create directory</li>
              </ul>
            </div>
            <div className="help-section">
              <h4>Development</h4>
              <ul>
                <li><code>git &lt;cmd&gt;</code> - Git commands</li>
                <li><code>node &lt;file&gt;</code> - Run Node.js</li>
                <li><code>python &lt;file&gt;</code> - Run Python</li>
                <li><code>npm &lt;cmd&gt;</code> - NPM commands</li>
                <li><code>pip &lt;cmd&gt;</code> - Pip commands</li>
                <li><code>gcc &lt;file&gt;</code> - Compile C</li>
              </ul>
            </div>
            <div className="help-section">
              <h4>Tools</h4>
              <ul>
                <li><code>curl &lt;url&gt;</code> - HTTP requests</li>
                <li><code>wget &lt;url&gt;</code> - Download files</li>
                <li><code>grep &lt;pattern&gt;</code> - Search text</li>
                <li><code>ps aux</code> - List processes</li>
                <li><code>top</code> - System monitor</li>
                <li><code>clear</code> - Clear screen</li>
              </ul>
            </div>
          </div>
          <button className="help-close" onClick={() => setShowHelp(false)}>
            Close
          </button>
        </div>
      )}
    </div>
  );
};

export default Terminal;
