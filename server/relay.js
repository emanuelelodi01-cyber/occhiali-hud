// RayNeo HUD <-> Antigravity Session WebSocket Relay Server
// Listens on 127.0.0.1:3001 (proxied by Nginx at /api/ws)

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3001;

const pcSockets = new Set();
const hudSockets = new Set();
const controllerSockets = new Set();

// Rolling chat history buffer (persisted during container uptime)
const recentMessages = [];
const MAX_HISTORY = 60;

function addHistory(role, text) {
  if (!text || !text.trim()) return;
  recentMessages.push({
    id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    role: role, // 'user' or 'assistant'
    text: text.trim(),
    timestamp: Date.now()
  });
  if (recentMessages.length > MAX_HISTORY) {
    recentMessages.shift();
  }
}

let lastAgentStatus = {
  type: 'agent_status',
  status: 'idle',
  toolName: '',
  timestamp: Date.now()
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/health' || url.pathname === '/api/ws/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'online',
      time: new Date().toISOString(),
      pcClients: pcSockets.size,
      hudClients: hudSockets.size,
      controllerClients: controllerSockets.size,
      historyCount: recentMessages.length,
      lastStatus: lastAgentStatus
    }));
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

function broadcastToClients(obj, excludeWs = null) {
  const payload = JSON.stringify(obj);
  for (const client of [...hudSockets, ...controllerSockets]) {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastToHuds(obj) {
  const payload = JSON.stringify(obj);
  for (const client of hudSockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastToControllers(obj) {
  const payload = JSON.stringify(obj);
  for (const client of controllerSockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastToPcs(obj) {
  const payload = JSON.stringify(obj);
  for (const client of pcSockets) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const clientType = url.searchParams.get('client') || 'hud'; // 'pc', 'hud', 'controller'
  
  ws.isAlive = true;
  ws.clientType = clientType;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  if (clientType === 'pc') {
    pcSockets.add(ws);
    console.log(`[Relay] PC Bridge connected (${pcSockets.size} active)`);
    broadcastToClients({
      type: 'system',
      event: 'pc_status',
      online: true,
      timestamp: Date.now()
    });
  } else if (clientType === 'controller') {
    controllerSockets.add(ws);
    console.log(`[Relay] Controller client connected (${controllerSockets.size} active)`);
    ws.send(JSON.stringify({
      type: 'system',
      event: 'welcome',
      clientType: 'controller',
      pcOnline: pcSockets.size > 0,
      history: recentMessages,
      lastStatus: lastAgentStatus,
      timestamp: Date.now()
    }));
  } else {
    hudSockets.add(ws);
    console.log(`[Relay] HUD client connected (${hudSockets.size} active)`);
    ws.send(JSON.stringify({
      type: 'system',
      event: 'welcome',
      clientType: 'hud',
      pcOnline: pcSockets.size > 0,
      history: recentMessages,
      lastStatus: lastAgentStatus,
      timestamp: Date.now()
    }));
  }

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString('utf-8'));
      
      if (clientType === 'pc') {
        // Events from PC Bridge (Antigravity Assistant)
        if (data.type === 'agent_response') {
          addHistory('assistant', data.content);
          lastAgentStatus = { type: 'agent_status', status: 'idle', toolName: '', timestamp: Date.now() };
          broadcastToClients(data);
        } else if (data.type === 'agent_status') {
          lastAgentStatus = data;
          broadcastToClients(data);
        } else if (data.type === 'agent_thinking') {
          lastAgentStatus = { type: 'agent_status', status: 'thinking', thought: data.thought, timestamp: Date.now() };
          if (data.thought) {
            addHistory('thinking', data.thought);
          }
          broadcastToClients(data);
        } else if (data.type === 'agent_tool') {
          lastAgentStatus = { type: 'agent_status', status: 'tool_running', toolName: data.toolName, action: data.action, detail: data.detail, timestamp: Date.now() };
          addHistory('tool', data.display || `[${data.toolName}] ${data.action || ''}`);
          broadcastToClients(data);
        } else if (data.type === 'transcription_result') {
          if (data.text && !data.text.startsWith('⚠️')) {
            addHistory('user', data.text);
          }
          broadcastToClients(data);
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } else {
        // Events from HUD or Controller
        if (data.type === 'user_message') {
          console.log(`[Relay] User message from ${clientType}:`, data.text);
          addHistory('user', data.text);
          // Broadcast to PC and other UI clients so chat updates everywhere
          broadcastToPcs(data);
          broadcastToClients(data, ws);
        } else if (data.type === 'user_audio') {
          console.log(`[Relay] User audio stream from ${clientType}`);
          broadcastToPcs(data);
          broadcastToClients({
            type: 'agent_status',
            status: 'transcribing',
            timestamp: Date.now()
          });
        } else if (data.type === 'hud_command') {
          // Remote command from Controller to RayNeo HUD
          console.log(`[Relay] Remote HUD command from ${clientType}:`, data.command);
          broadcastToHuds(data);
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      }
    } catch (err) {
      console.warn('[Relay] Error parsing incoming message:', err.message);
    }
  });

  ws.on('close', () => {
    if (clientType === 'pc') {
      pcSockets.delete(ws);
      console.log(`[Relay] PC Bridge disconnected (${pcSockets.size} remaining)`);
      broadcastToClients({
        type: 'system',
        event: 'pc_status',
        online: pcSockets.size > 0,
        timestamp: Date.now()
      });
    } else if (clientType === 'controller') {
      controllerSockets.delete(ws);
      console.log(`[Relay] Controller disconnected (${controllerSockets.size} remaining)`);
    } else {
      hudSockets.delete(ws);
      console.log(`[Relay] HUD disconnected (${hudSockets.size} remaining)`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[Relay] Error on ${clientType} socket:`, err.message);
  });
});

// Ping interval to keep sockets alive through proxies/NAT
const interval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 25000);

wss.on('close', () => {
  clearInterval(interval);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[Relay] Antigravity Comms Relay listening on 0.0.0.0:${PORT}`);
});
