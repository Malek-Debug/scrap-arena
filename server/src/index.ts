import { createServer } from "http";
import { WebSocketServer } from "ws";
import { GameServer } from "./GameServer.js";

const PORT = parseInt(process.env.PORT || "3001", 10);

const httpServer = createServer((req, res) => {
  // Health check / status endpoint
  if (req.url === "/health" || req.url === "/status") {
    const status = gameServer.getStatus();
    res.writeHead(200, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(JSON.stringify({
      status: "ok",
      uptime: process.uptime(),
      ...status,
    }));
    return;
  }

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  res.writeHead(404);
  res.end("Not Found");
});

const wss = new WebSocketServer({ server: httpServer });
const gameServer = new GameServer();

wss.on("connection", (ws, req) => {
  const origin = req.headers.origin || "unknown";
  console.log(`[WS] New connection from ${origin}`);

  gameServer.handleConnection(ws);
});

wss.on("error", (err) => {
  console.error("[WSS] Server error:", err);
});

httpServer.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════╗
║          SCRAP ARENA MULTIPLAYER SERVER          ║
╠══════════════════════════════════════════════════╣
║  Status:  ONLINE                                ║
║  Port:    ${String(PORT).padEnd(38)}║
║  WS:      ws://localhost:${String(PORT).padEnd(24)}║
║  Health:  http://localhost:${String(PORT)}/health${" ".repeat(Math.max(0, 16 - String(PORT).length))}║
╚══════════════════════════════════════════════════╝
  `);
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n[Server] Shutting down...");
  wss.close();
  httpServer.close();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("\n[Server] Terminating...");
  wss.close();
  httpServer.close();
  process.exit(0);
});
