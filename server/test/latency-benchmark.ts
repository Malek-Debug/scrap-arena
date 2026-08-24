import WebSocket from "ws";

const SERVER_URL = "ws://localhost:3001";
const NUM_PINGS = 50;

async function run() {
  console.log("\n═══ SCRAP ARENA - RAW WEBSOCKET LATENCY BENCHMARK ═══\n");
  console.log(`Target: ${SERVER_URL}`);
  console.log(`Measurements: ${NUM_PINGS} ping/pong round-trips\n`);

  // Connect and join a room (ping only works inside a room)
  const ws = new WebSocket(SERVER_URL);
  await new Promise<void>((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });

  // Create a room so the Room handler processes pings
  ws.send(JSON.stringify({ type: "create_room", playerName: "LatencyTest" }));
  await new Promise<void>(resolve => {
    ws.on("message", function handler(data) {
      const msg = JSON.parse(data.toString());
      if (msg.type === "room_joined") {
        ws.removeListener("message", handler);
        resolve();
      }
    });
  });

  console.log("Connected and joined room. Starting measurements...\n");

  const rtts: number[] = [];

  for (let i = 0; i < NUM_PINGS; i++) {
    const rtt = await measurePing(ws, i);
    rtts.push(rtt);
    // Space pings to stay under rate limit (20/sec = 50ms minimum gap)
    await sleep(55);
  }

  // Statistics
  rtts.sort((a, b) => a - b);
  const min = rtts[0];
  const max = rtts[rtts.length - 1];
  const avg = rtts.reduce((s, v) => s + v, 0) / rtts.length;
  const median = rtts[Math.floor(rtts.length / 2)];
  const p95 = rtts[Math.floor(rtts.length * 0.95)];
  const p99 = rtts[Math.floor(rtts.length * 0.99)];

  console.log("─── Results ───────────────────────────────────────");
  console.log(`  Samples:  ${rtts.length}`);
  console.log(`  Min:      ${min.toFixed(2)} ms`);
  console.log(`  Max:      ${max.toFixed(2)} ms`);
  console.log(`  Average:  ${avg.toFixed(2)} ms`);
  console.log(`  Median:   ${median.toFixed(2)} ms`);
  console.log(`  P95:      ${p95.toFixed(2)} ms`);
  console.log(`  P99:      ${p99.toFixed(2)} ms`);
  console.log("───────────────────────────────────────────────────");

  // Distribution
  console.log("\n  Distribution:");
  const buckets = [1, 2, 5, 10, 20, 50, 100, 500];
  for (const threshold of buckets) {
    const count = rtts.filter(r => r <= threshold).length;
    const pct = (count / rtts.length * 100).toFixed(0);
    const bar = "█".repeat(Math.round(count / rtts.length * 30));
    console.log(`    ≤${String(threshold).padStart(4)}ms: ${String(count).padStart(3)}/${rtts.length} (${pct.padStart(3)}%) ${bar}`);
    if (count === rtts.length) break;
  }

  // Assessment
  console.log("\n─── Assessment ────────────────────────────────────");
  if (avg < 5) {
    console.log("  ✓ EXCELLENT: Sub-5ms average on localhost");
    console.log("  ✓ The 306ms in integration test was a TEST ARTIFACT");
    console.log("    (caused by await sleep(300) before checking response)");
  } else if (avg < 20) {
    console.log("  ✓ GOOD: Under 20ms average latency");
  } else if (avg < 50) {
    console.log("  ⚠ ACCEPTABLE: Under 50ms, playable but investigate");
  } else {
    console.log("  ✗ HIGH LATENCY: Over 50ms on localhost, investigate server");
  }
  console.log("───────────────────────────────────────────────────\n");

  ws.close();
  process.exit(0);
}

function measurePing(ws: WebSocket, seq: number): Promise<number> {
  return new Promise((resolve) => {
    const timestamp = Date.now() + seq; // unique identifier
    const start = performance.now();

    const handler = (data: WebSocket.Data) => {
      const msg = JSON.parse(data.toString());
      if (msg.type === "pong" && msg.timestamp === timestamp) {
        ws.removeListener("message", handler);
        const end = performance.now();
        resolve(end - start);
      }
    };

    ws.on("message", handler);
    ws.send(JSON.stringify({ type: "ping", timestamp }));

    // Timeout after 5s
    setTimeout(() => {
      ws.removeListener("message", handler);
      resolve(5000);
    }, 5000);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

run().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
