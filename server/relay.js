// RayNeo HUD <-> Antigravity Session WebSocket Relay Server
// Listens on 127.0.0.1:3001 (proxied by Nginx at /api/ws)

const http = require('http');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 3001;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname === '/health' || url.pathname === '/api/ws/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'online',
      time: new Date().toISOString(),
      pcClients: pcSockets.size,
      hudClients: hudSockets.size,
      lastMessage: lastAgentMessage ? {
        type: lastAgentMessage.type,
        preview: (lastAgentMessage.content || '').slice(0, 100),
        time: lastAgentMessage.timestamp
      } : null
    }));
  }
  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

const wss = new WebSocketServer({ server });

const pcSockets = new Set();
const hudSockets = new Set();
let lastAgentMessage = null;

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const clientType = url.searchParams.get('client') || 'hud'; // 'pc' or 'hud'
  
  ws.isAlive = true;
  ws.clientType = clientType;

  ws.on('pong', () => {
    ws.isAlive = true;
  });

  if (clientType === 'pc') {
    pcSockets.add(ws);
    console.log(`[Relay] PC Bridge connected (${pcSockets.size} active)`);
    // Notify HUDs that PC is online
    broadcastToHuds({
      type: 'system',
      event: 'pc_status',
      online: true,
      timestamp: Date.now()
    });
  } else {
    hudSockets.add(ws);
    console.log(`[Relay] HUD client connected (${hudSockets.size} active)`);
    // Inform new HUD of current PC status and last agent message
    ws.send(JSON.stringify({
      type: 'system',
      event: 'welcome',
      pcOnline: pcSockets.size > 0,
      lastMessage: lastAgentMessage,
      timestamp: Date.now()
    }));
  }

  ws.on('message', (raw) => {
    try {
      const data = JSON.parse(raw.toString('utf-8'));
      
      if (clientType === 'pc') {
        // Message or status from PC Antigravity agent -> broadcast to HUDs
        if (data.type === 'agent_response' || data.type === 'agent_status') {
          lastAgentMessage = data;
          broadcastToHuds(data);
        } else if (data.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } else {
        // Message from HUD (user spoke or typed) -> forward to PC
        if (data.type === 'user_message') {
          console.log(`[Relay] Relaying user prompt to PC: "${data.text}"`);
          broadcastToPcs(data);
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
      broadcastToHuds({
        type: 'system',
        event: 'pc_status',
        online: pcSockets.size > 0,
        timestamp: Date.now()
      });
    } else {
      hudSockets.delete(ws);
      console.log(`[Relay] HUD client disconnected (${hudSockets.size} remaining)`);
    }
  });

  ws.on('error', (err) => {
    console.error(`[Relay] Error on ${clientType} socket:`, err.message);
  });
});

function broadcastToHuds(obj) {
  const payload = JSON.stringify(obj);
  for (const client of hudSockets) {
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
