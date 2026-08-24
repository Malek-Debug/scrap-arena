import WebSocket from "ws";

const SERVER_URL = "ws://localhost:3001";
const COLORS = { reset: "\x1b[0m", green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", cyan: "\x1b[36m" };
let passed = 0, failed = 0, warnings = 0;

function pass(test: string) { passed++; console.log(`${COLORS.green}  ✓ ${test}${COLORS.reset}`); }
function fail(test: string, reason?: string) { failed++; console.log(`${COLORS.red}  ✗ ${test}${reason ? `: ${reason}` : ""}${COLORS.reset}`); }
function warn(msg: string) { warnings++; console.log(`${COLORS.yellow}  ⚠ ${msg}${COLORS.reset}`); }
function section(title: string) { console.log(`\n${COLORS.cyan}━━━ ${title} ━━━${COLORS.reset}`); }

interface TestClient {
  ws: WebSocket;
  id: string;
  name: string;
  messages: any[];
  roomCode: string;
}

function createClient(name: string): Promise<TestClient> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(SERVER_URL);
    const client: TestClient = { ws, id: "", name, messages: [], roomCode: "" };
    ws.on("open", () => resolve(client));
    ws.on("message", (data) => {
      try { client.messages.push(JSON.parse(data.toString())); } catch {}
    });
    ws.on("error", reject);
    setTimeout(() => reject(new Error("Connection timeout")), 5000);
  });
}

function send(client: TestClient, msg: any) {
  client.ws.send(JSON.stringify(msg));
}

function waitForMessage(client: TestClient, type: string, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const existing = client.messages.find(m => m.type === type);
    if (existing) {
      client.messages.splice(client.messages.indexOf(existing), 1);
      return resolve(existing);
    }
    const start = Date.now();
    const interval = setInterval(() => {
      const msg = client.messages.find(m => m.type === type);
      if (msg) {
        clearInterval(interval);
        client.messages.splice(client.messages.indexOf(msg), 1);
        resolve(msg);
      } else if (Date.now() - start > timeout) {
        clearInterval(interval);
        reject(new Error(`Timeout waiting for '${type}' on ${client.name} (got: [${client.messages.map(m => m.type).join(", ")}])`));
      }
    }, 20);
  });
}

function drainMessages(client: TestClient, type: string): any[] {
  const found: any[] = [];
  for (let i = client.messages.length - 1; i >= 0; i--) {
    if (client.messages[i].type === type) {
      found.push(client.messages.splice(i, 1)[0]);
    }
  }
  return found.reverse();
}

function clearMessages(client: TestClient) { client.messages = []; }
function sleep(ms: number): Promise<void> { return new Promise(r => setTimeout(r, ms)); }

async function run() {
  console.log(`\n${COLORS.yellow}╔══════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.yellow}║   SCRAP ARENA MULTIPLAYER - INTEGRATION TEST SUITE      ║${COLORS.reset}`);
  console.log(`${COLORS.yellow}╚══════════════════════════════════════════════════════════╝${COLORS.reset}\n`);

  // ═══════════════════════════════════════════════════════════════════════════
  section("1. SERVER CONNECTION");
  // ═══════════════════════════════════════════════════════════════════════════

  let c1: TestClient, c2: TestClient, c3: TestClient, c4: TestClient;
  try {
    c1 = await createClient("Player1");
    pass("Client 1 connected via WebSocket");
  } catch (e: any) {
    fail("Client 1 connection", e.message);
    console.log("\n  Server not running. Start: cd server && npx tsx src/index.ts");
    process.exit(1);
  }
  try {
    c2 = await createClient("Player2");
    c3 = await createClient("Player3");
    c4 = await createClient("Player4");
    pass("Clients 2-4 connected (4 simultaneous WebSocket connections)");
  } catch (e: any) {
    fail("Multiple connections", e.message);
    process.exit(1);
  }

  // Health endpoint
  try {
    const resp = await fetch("http://localhost:3001/health");
    const data = await resp.json();
    if (data.status === "ok") pass("HTTP /health endpoint returns {status: 'ok'}");
    else fail("Health endpoint", JSON.stringify(data));
  } catch (e: any) { fail("Health endpoint", e.message); }

  // ═══════════════════════════════════════════════════════════════════════════
  section("2. LOBBY - CREATE & JOIN ROOM");
  // ═══════════════════════════════════════════════════════════════════════════

  send(c1, { type: "create_room", playerName: "Player1" });
  try {
    await waitForMessage(c1, "room_created", 3000);
    const c1Joined = await waitForMessage(c1, "room_joined", 3000);
    c1.id = c1Joined.playerId;
    c1.roomCode = c1Joined.roomCode;
    if (c1.roomCode && c1.roomCode.length === 5 && c1.id) {
      pass(`Room created: code=${c1.roomCode}, hostId=${c1.id}`);
    } else {
      fail("Room creation", `code=${c1.roomCode}, id=${c1.id}`);
    }
  } catch (e: any) { fail("Room creation", e.message); process.exit(1); }

  // Join 3 more players
  send(c2, { type: "join_room", roomCode: c1.roomCode, playerName: "Player2" });
  const c2Joined = await waitForMessage(c2, "room_joined", 3000);
  c2.id = c2Joined.playerId;

  send(c3, { type: "join_room", roomCode: c1.roomCode, playerName: "Player3" });
  const c3Joined = await waitForMessage(c3, "room_joined", 3000);
  c3.id = c3Joined.playerId;

  send(c4, { type: "join_room", roomCode: c1.roomCode, playerName: "Player4" });
  const c4Joined = await waitForMessage(c4, "room_joined", 3000);
  c4.id = c4Joined.playerId;

  if (c2.id && c3.id && c4.id) {
    pass(`4 players joined room (IDs: ${[c1.id, c2.id, c3.id, c4.id].join(", ")})`);
  } else {
    fail("Room join", `Missing IDs: c2=${c2.id}, c3=${c3.id}, c4=${c4.id}`);
  }

  // Verify player_joined notifications received by host
  await sleep(100);
  const joinNotifs = drainMessages(c1, "player_joined");
  if (joinNotifs.length >= 3) pass(`Host received ${joinNotifs.length} player_joined notifications`);
  else fail("Join notifications to host", `Got ${joinNotifs.length}, expected 3`);

  // Room full rejection
  let c5: TestClient | null = null;
  try {
    c5 = await createClient("Player5");
    send(c5, { type: "join_room", roomCode: c1.roomCode, playerName: "Player5" });
    const errMsg = await waitForMessage(c5, "error", 2000);
    if (errMsg.code === "ROOM_FULL") pass("5th player rejected: ROOM_FULL");
    else fail("Full room rejection", `code=${errMsg.code}`);
  } catch (e: any) { fail("Full room test", e.message); }
  c5?.ws.close();

  // Invalid room code
  let c6: TestClient | null = null;
  try {
    c6 = await createClient("Player6");
    send(c6, { type: "join_room", roomCode: "ZZZZZ", playerName: "Player6" });
    const errMsg = await waitForMessage(c6, "error", 2000);
    if (errMsg.code === "ROOM_NOT_FOUND") pass("Invalid room code rejected: ROOM_NOT_FOUND");
    else fail("Invalid room", `code=${errMsg.code}`);
  } catch (e: any) { fail("Invalid room test", e.message); }
  c6?.ws.close();

  // ═══════════════════════════════════════════════════════════════════════════
  section("3. CHARACTER SELECTION & READY STATE");
  // ═══════════════════════════════════════════════════════════════════════════
  clearMessages(c1); clearMessages(c2); clearMessages(c3); clearMessages(c4);

  send(c1, { type: "select_character", characterId: "assault" });
  send(c2, { type: "select_character", characterId: "sentinel" });
  send(c3, { type: "select_character", characterId: "phantom" });
  send(c4, { type: "select_character", characterId: "engineer" });
  await sleep(200);

  const c1CharMsgs = c1.messages.filter(m => m.type === "character_selected");
  if (c1CharMsgs.length >= 3) pass(`Character selection broadcasts (${c1CharMsgs.length} received by host)`);
  else fail("Character selection sync", `Host got ${c1CharMsgs.length} notifications`);

  // Invalid character (Validation.ts rejects, GameServer sends error)
  clearMessages(c1);
  send(c1, { type: "select_character", characterId: "hacker" });
  await sleep(100);
  const invalidCharErr = c1.messages.find(m => m.type === "error");
  if (invalidCharErr) pass("Invalid characterId rejected with error response");
  else warn("Invalid characterId - no error received (may be silently dropped)");

  // Ready state
  clearMessages(c1); clearMessages(c2); clearMessages(c3); clearMessages(c4);
  send(c2, { type: "ready", ready: true });
  send(c3, { type: "ready", ready: true });
  send(c4, { type: "ready", ready: true });
  await sleep(200);

  const readyNotifs = c1.messages.filter(m => m.type === "player_ready");
  if (readyNotifs.length >= 3) pass(`Ready state sync: host received ${readyNotifs.length} player_ready messages`);
  else fail("Ready state sync", `Got ${readyNotifs.length} notifications`);

  // Non-host cannot start match
  clearMessages(c2);
  send(c2, { type: "start_match" });
  await sleep(200);
  const c2Start = c2.messages.find(m => m.type === "match_starting" || m.type === "match_started");
  if (!c2Start) pass("Non-host start_match rejected (no match_starting received)");
  else fail("Non-host authorization", "Match started from non-host");

  // ═══════════════════════════════════════════════════════════════════════════
  section("4. MATCH START");
  // ═══════════════════════════════════════════════════════════════════════════
  clearMessages(c1); clearMessages(c2); clearMessages(c3); clearMessages(c4);

  send(c1, { type: "start_match" });

  // Countdown
  try {
    const countdown = await waitForMessage(c1, "match_starting", 3000);
    if (countdown.countdown === 3) pass("Countdown initiated: 3 seconds");
    else fail("Countdown value", `Expected 3, got ${countdown.countdown}`);
  } catch (e: any) { fail("Countdown", e.message); }

  // Match started
  let matchStarted: any;
  try {
    matchStarted = await waitForMessage(c1, "match_started", 8000);
    if (matchStarted.players?.length === 4) pass("match_started received with 4 players");
    else fail("Match start", `players.length = ${matchStarted.players?.length}`);
  } catch (e: any) { fail("Match start", e.message); process.exit(1); }

  // Verify all clients received match_started
  try {
    await waitForMessage(c2, "match_started", 2000);
    await waitForMessage(c3, "match_started", 2000);
    await waitForMessage(c4, "match_started", 2000);
    pass("All 4 clients received match_started");
  } catch (e: any) { fail("Match start broadcast", e.message); }

  // Match config
  if (matchStarted.killLimit === 20) pass("Kill limit = 20");
  else fail("Kill limit", `${matchStarted.killLimit}`);

  if (matchStarted.matchDuration === 300000) pass("Match duration = 300000ms (5 min)");
  else fail("Match duration", `${matchStarted.matchDuration}`);

  // Unique spawn positions
  const spawns = matchStarted.players.map((p: any) => `${Math.round(p.position.x)},${Math.round(p.position.y)}`);
  const uniqueSpawns = new Set(spawns);
  if (uniqueSpawns.size === 4) pass("4 unique spawn positions assigned");
  else fail("Spawn uniqueness", `Only ${uniqueSpawns.size} unique out of 4`);

  // Game state ticking
  await sleep(250);
  const ticks = c1.messages.filter(m => m.type === "game_state");
  if (ticks.length >= 3) pass(`Game loop running: ${ticks.length} game_state updates in 250ms (~20 tps)`);
  else fail("Game loop", `Only ${ticks.length} game_state in 250ms`);

  // Verify state structure
  const sample = ticks[ticks.length - 1];
  const hasFields = sample.tick > 0 && sample.players?.length === 4 && typeof sample.matchTime === "number" && Array.isArray(sample.projectiles) && Array.isArray(sample.pickups);
  if (hasFields) pass("game_state structure valid: tick, players[4], projectiles[], pickups[], matchTime");
  else fail("game_state structure", JSON.stringify({ tick: sample.tick, players: sample.players?.length, matchTime: sample.matchTime }));

  // ═══════════════════════════════════════════════════════════════════════════
  section("5. MOVEMENT SYNCHRONIZATION");
  // ═══════════════════════════════════════════════════════════════════════════
  clearMessages(c1); clearMessages(c2); clearMessages(c3); clearMessages(c4);

  // P1 moves right for 500ms
  for (let i = 0; i < 10; i++) {
    send(c1, { type: "input", seq: i + 1, moveX: 1, moveY: 0, aimAngle: 0, shooting: false, ability: false, dash: false });
    await sleep(50);
  }

  // P2 moves up for 500ms
  for (let i = 0; i < 10; i++) {
    send(c2, { type: "input", seq: i + 1, moveX: 0, moveY: -1, aimAngle: Math.PI, shooting: false, ability: false, dash: false });
    await sleep(50);
  }
  await sleep(300);

  // Verify P1's movement visible to P2
  const c2States = c2.messages.filter(m => m.type === "game_state");
  if (c2States.length > 0) {
    const latest = c2States[c2States.length - 1];
    const p1State = latest.players.find((p: any) => p.id === c1.id);
    const origP1 = matchStarted.players.find((p: any) => p.id === c1.id);
    if (p1State && (p1State.velocityX > 0 || p1State.x > origP1.position.x)) {
      pass("P1 movement visible to P2 (position/velocity update)");
    } else {
      fail("P1→P2 movement sync", `vx=${p1State?.velocityX}, x=${p1State?.x}`);
    }
  } else {
    fail("Movement sync", "P2 received no game_state");
  }

  // Verify P2's movement visible to P1
  const c1States = c1.messages.filter(m => m.type === "game_state");
  if (c1States.length > 0) {
    const latest = c1States[c1States.length - 1];
    const p2State = latest.players.find((p: any) => p.id === c2.id);
    const origP2 = matchStarted.players.find((p: any) => p.id === c2.id);
    if (p2State && (p2State.velocityY < 0 || p2State.y < origP2.position.y)) {
      pass("P2 movement visible to P1 (negative Y velocity or position change)");
    } else {
      fail("P2→P1 movement sync", `vy=${p2State?.velocityY}, y=${p2State?.y}`);
    }
  }

  // Cross-client consistency
  if (c1States.length > 0 && c2States.length > 0) {
    const s1 = c1States[c1States.length - 1];
    const s2 = c2States[c2States.length - 1];
    const p1_in_s1 = s1.players.find((p: any) => p.id === c1.id);
    const p1_in_s2 = s2.players.find((p: any) => p.id === c1.id);
    if (p1_in_s1 && p1_in_s2) {
      const drift = Math.abs(p1_in_s1.x - p1_in_s2.x) + Math.abs(p1_in_s1.y - p1_in_s2.y);
      if (drift < 100) pass(`Server authoritative consistency: position drift=${drift.toFixed(1)}`);
      else warn(`Position drift between clients: ${drift.toFixed(1)} (different ticks)`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("6. COMBAT - SHOOTING, HIT DETECTION, DAMAGE");
  // ═══════════════════════════════════════════════════════════════════════════

  // Wait for invulnerability to expire
  console.log("  Waiting for invulnerability to expire (2.5s)...");
  await sleep(2500);
  clearMessages(c1); clearMessages(c2); clearMessages(c3); clearMessages(c4);

  // Get current positions
  await sleep(100);
  let posState = c1.messages.filter(m => m.type === "game_state");
  let latest = posState[posState.length - 1];
  let p1Pos = latest?.players?.find((p: any) => p.id === c1.id);
  let p4Pos = latest?.players?.find((p: any) => p.id === c4.id);

  let combatWorked = false;
  if (p1Pos && p4Pos) {
    let angle = Math.atan2(p4Pos.y - p1Pos.y, p4Pos.x - p1Pos.x);
    let distance = Math.sqrt((p4Pos.x - p1Pos.x) ** 2 + (p4Pos.y - p1Pos.y) ** 2);
    console.log(`  Initial distance P1→P4: ${distance.toFixed(0)}px`);

    // Phase 1: Close the gap to point-blank range (obstacles may block at distance)
    if (distance > 250) {
      console.log("  Closing distance to point-blank...");
      for (let i = 0; i < 300; i++) {
        send(c1, {
          type: "input", seq: 50 + i,
          moveX: Math.cos(angle),
          moveY: Math.sin(angle),
          aimAngle: angle,
          shooting: false,
          ability: false, dash: false
        });
        await sleep(50);

        // Re-read positions every 2s and check distance
        if (i > 0 && i % 40 === 0) {
          const checkState = c1.messages.filter(m => m.type === "game_state");
          const cs = checkState[checkState.length - 1];
          if (cs) {
            const cp1 = cs.players.find((p: any) => p.id === c1.id);
            const cp4 = cs.players.find((p: any) => p.id === c4.id);
            if (cp1 && cp4) {
              distance = Math.sqrt((cp4.x - cp1.x) ** 2 + (cp4.y - cp1.y) ** 2);
              angle = Math.atan2(cp4.y - cp1.y, cp4.x - cp1.x);
              if (distance < 250) break;
            }
          }
        }
      }

      // Re-read positions after approach
      await sleep(100);
      const newState = c1.messages.filter(m => m.type === "game_state");
      const ns = newState[newState.length - 1];
      if (ns) {
        p1Pos = ns.players.find((p: any) => p.id === c1.id);
        p4Pos = ns.players.find((p: any) => p.id === c4.id);
        if (p1Pos && p4Pos) {
          distance = Math.sqrt((p4Pos.x - p1Pos.x) ** 2 + (p4Pos.y - p1Pos.y) ** 2);
          angle = Math.atan2(p4Pos.y - p1Pos.y, p4Pos.x - p1Pos.x);
        }
      }
      console.log(`  After approach: distance=${distance.toFixed(0)}px`);
    }

    // Phase 2: Shoot at P4
    clearMessages(c1); clearMessages(c4);
    for (let i = 0; i < 60; i++) {
      send(c1, {
        type: "input", seq: 300 + i,
        moveX: distance > 400 ? Math.cos(angle) * 0.5 : 0,
        moveY: distance > 400 ? Math.sin(angle) * 0.5 : 0,
        aimAngle: angle,
        shooting: true,
        ability: false, dash: false
      });
      await sleep(55);
    }
    await sleep(500);

    const hits = c1.messages.filter(m => m.type === "player_hit" && m.targetId === c4.id);
    if (hits.length > 0) {
      combatWorked = true;
      pass(`Hit detection: ${hits.length} hits on P4`);
      const lastHit = hits[hits.length - 1];
      if (lastHit.damage > 0) pass(`Damage applied: ${lastHit.damage} per hit`);
      else fail("Damage value", `damage=${lastHit.damage}`);
      if (typeof lastHit.newHp === "number") pass(`HP tracking: target HP=${lastHit.newHp}`);
      else fail("HP in hit event", "missing newHp");
      if (lastHit.attackerId === c1.id) pass("Attacker ID correct in hit event");
      else fail("Attacker ID", `${lastHit.attackerId} vs ${c1.id}`);
    } else {
      fail("Hit detection", `No player_hit events (distance=${distance.toFixed(0)}, range=800)`);
    }

    // Kill check
    const kills = c1.messages.filter(m => m.type === "player_killed" && m.victimId === c4.id);
    if (kills.length > 0) {
      pass(`Kill: ${kills[0].killerId} eliminated P4 (score=${kills[0].killerScore})`);
      const killFeed = c1.messages.filter(m => m.type === "kill_feed");
      if (killFeed.length > 0) pass(`Kill feed: "${killFeed[0].killerName} → ${killFeed[0].victimName}"`);
      else fail("Kill feed", "No kill_feed event");
    } else if (combatWorked) {
      warn("No kill yet (P4 survived) - will finish in death/respawn section");
    }
  } else {
    fail("Combat setup", "Could not get player positions");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("7. ABILITIES & DASH");
  // ═══════════════════════════════════════════════════════════════════════════
  clearMessages(c1); clearMessages(c2); clearMessages(c3); clearMessages(c4);

  // P1 (assault) activate ability
  send(c1, { type: "input", seq: 500, moveX: 0, moveY: 0, aimAngle: 0, shooting: false, ability: true, dash: false });
  await sleep(300);

  const abilityUsed = c1.messages.filter(m => m.type === "ability_used");
  if (abilityUsed.length > 0) {
    pass(`Ability activated: ${abilityUsed[0].abilityId} by ${abilityUsed[0].playerId}`);
  } else {
    warn("Ability may be on cooldown (assault CD=18s) - testing cooldown enforcement");
  }

  // Cooldown: immediate re-use should fail
  clearMessages(c1);
  send(c1, { type: "input", seq: 501, moveX: 0, moveY: 0, aimAngle: 0, shooting: false, ability: true, dash: false });
  await sleep(100);
  const abilityAgain = c1.messages.filter(m => m.type === "ability_used" && m.playerId === c1.id);
  if (abilityAgain.length === 0) pass("Ability cooldown enforced (no second activation)");
  else fail("Ability cooldown", "Fired twice");

  // P3 (phantom) dash
  clearMessages(c3);
  send(c3, { type: "input", seq: 600, moveX: 1, moveY: 0, aimAngle: 0, shooting: false, ability: false, dash: true });
  await sleep(200);
  const c3States2 = c3.messages.filter(m => m.type === "game_state");
  if (c3States2.length > 0) {
    pass("Dash input processed (game state continues after dash)");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("8. DEATH & RESPAWN");
  // ═══════════════════════════════════════════════════════════════════════════
  clearMessages(c1); clearMessages(c2); clearMessages(c3); clearMessages(c4);

  await sleep(150);
  posState = c1.messages.filter(m => m.type === "game_state");
  latest = posState[posState.length - 1];
  const targetPlayer = latest?.players?.find((p: any) => p.id === c4.id);
  const attackerPos2 = latest?.players?.find((p: any) => p.id === c1.id);

  let killConfirmed = false;

  // Check if P4 was already killed in section 6
  if (targetPlayer && !targetPlayer.alive) {
    pass("P4 already killed in combat section");
    killConfirmed = true;
  } else if (targetPlayer && attackerPos2) {
    // P4 still alive - need to kill them
    let killAngle = Math.atan2(targetPlayer.y - attackerPos2.y, targetPlayer.x - attackerPos2.x);
    let killDist = Math.sqrt((targetPlayer.x - attackerPos2.x) ** 2 + (targetPlayer.y - attackerPos2.y) ** 2);
    console.log(`  Pursuing P4 (distance: ${killDist.toFixed(0)}px)...`);

    clearMessages(c1); clearMessages(c4);

    // Move toward while shooting
    for (let i = 0; i < 200; i++) {
      send(c1, {
        type: "input", seq: 700 + i,
        moveX: Math.cos(killAngle) * 0.9,
        moveY: Math.sin(killAngle) * 0.9,
        aimAngle: killAngle,
        shooting: killDist < 700,
        ability: false, dash: false
      });
      await sleep(50);

      // Check for kill
      const killMsg = c1.messages.find(m => m.type === "player_killed" && m.victimId === c4.id);
      if (killMsg) {
        killConfirmed = true;
        pass(`Kill achieved: P1 killed P4 (score=${killMsg.killerScore})`);
        break;
      }

      // Re-read positions every 2 seconds to re-aim
      if (i > 0 && i % 40 === 0) {
        const st = c1.messages.filter(m => m.type === "game_state");
        const s = st[st.length - 1];
        if (s) {
          const a = s.players.find((p: any) => p.id === c1.id);
          const t = s.players.find((p: any) => p.id === c4.id);
          if (a && t && t.alive) {
            killAngle = Math.atan2(t.y - a.y, t.x - a.x);
            killDist = Math.sqrt((t.x - a.x) ** 2 + (t.y - a.y) ** 2);
          } else if (t && !t.alive) {
            killConfirmed = true;
            pass("P4 killed (detected in game_state)");
            break;
          }
        }
      }
    }

    if (!killConfirmed) {
      const hits = c1.messages.filter(m => m.type === "player_hit" && m.targetId === c4.id);
      if (hits.length > 0) {
        warn(`${hits.length} hits on P4 but no kill (survived)`);
        // Check state to see if P4 died
        const finalState = c1.messages.filter(m => m.type === "game_state");
        const fs = finalState[finalState.length - 1];
        const p4f = fs?.players?.find((p: any) => p.id === c4.id);
        if (p4f && !p4f.alive) { killConfirmed = true; pass("P4 confirmed dead in final state"); }
        else fail("Kill completion", `P4 hp=${p4f?.hp}`);
      } else {
        fail("Kill attempt", "No hits landed after extended pursuit");
      }
    }
  } else {
    fail("Death/respawn setup", "P4 not in game state");
  }

  // Respawn
  if (killConfirmed) {
    console.log("  Waiting for respawn (3.5s)...");
    clearMessages(c1);
    await sleep(3500);

    const respawnMsg = c1.messages.find(m => m.type === "player_respawned" && m.playerId === c4.id);
    if (respawnMsg) {
      pass(`Respawn: P4 at (${Math.round(respawnMsg.position.x)}, ${Math.round(respawnMsg.position.y)})`);
      if (respawnMsg.hp > 0) pass(`HP reset on respawn: hp=${respawnMsg.hp}`);
      else fail("Respawn HP", `hp=${respawnMsg.hp}`);
    } else {
      fail("Respawn", "No player_respawned within 3.5s");
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("9. SCORE & MATCH TIMER");
  // ═══════════════════════════════════════════════════════════════════════════
  clearMessages(c1);
  await sleep(200);
  const scoreStates = c1.messages.filter(m => m.type === "game_state");
  if (scoreStates.length > 0) {
    const gs = scoreStates[scoreStates.length - 1];
    const p1Score = gs.players.find((p: any) => p.id === c1.id);
    if (p1Score) {
      pass(`Score state: score=${p1Score.score}, deaths=${p1Score.deaths}`);
    } else fail("Score state", "P1 not in game_state");

    if (gs.matchTime > 0 && gs.matchTime < 300000) pass(`Match timer: ${(gs.matchTime / 1000).toFixed(1)}s remaining`);
    else fail("Match timer", `matchTime=${gs.matchTime}`);
  } else {
    fail("Score/timer", "No game_state");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("10. PING/PONG & LATENCY");
  // ═══════════════════════════════════════════════════════════════════════════

  // Measure actual RTT (not including artificial sleeps)
  const rtts: number[] = [];
  for (let i = 0; i < 20; i++) {
    const rtt = await new Promise<number>((resolve) => {
      const ts = Date.now() + i;
      const start = performance.now();
      const handler = (data: any) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === "pong" && msg.timestamp === ts) {
          c2.ws.removeListener("message", handler);
          resolve(performance.now() - start);
        }
      };
      c2.ws.on("message", handler);
      c2.ws.send(JSON.stringify({ type: "ping", timestamp: ts }));
      setTimeout(() => { c2.ws.removeListener("message", handler); resolve(-1); }, 2000);
    });
    if (rtt >= 0) rtts.push(rtt);
    await sleep(55); // respect rate limit
  }

  if (rtts.length >= 15) {
    rtts.sort((a, b) => a - b);
    const min = rtts[0];
    const max = rtts[rtts.length - 1];
    const avg = rtts.reduce((s, v) => s + v, 0) / rtts.length;
    const median = rtts[Math.floor(rtts.length / 2)];
    const p95 = rtts[Math.floor(rtts.length * 0.95)];
    pass(`Ping/pong (${rtts.length} samples): min=${min.toFixed(1)}ms avg=${avg.toFixed(1)}ms median=${median.toFixed(1)}ms p95=${p95.toFixed(1)}ms max=${max.toFixed(1)}ms`);
    if (avg < 5) pass("Localhost latency excellent (<5ms avg)");
    else if (avg < 50) pass("Latency acceptable (<50ms avg)");
    else fail("Latency", `avg=${avg.toFixed(1)}ms - too high for localhost`);
  } else {
    fail("Ping/pong", `Only ${rtts.length}/20 pongs received`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("11. DISCONNECT HANDLING");
  // ═══════════════════════════════════════════════════════════════════════════
  clearMessages(c1); clearMessages(c2); clearMessages(c3);

  c4.ws.close();
  await sleep(300);

  const leftMsg = c1.messages.find(m => m.type === "player_left" && m.playerId === c4.id);
  if (leftMsg) pass("player_left broadcast when P4 disconnects");
  else fail("Disconnect notification", "No player_left for P4");

  // Match continues
  clearMessages(c1);
  send(c1, { type: "input", seq: 900, moveX: 0.5, moveY: 0, aimAngle: 0, shooting: false, ability: false, dash: false });
  await sleep(200);
  const postDisc = c1.messages.filter(m => m.type === "game_state");
  if (postDisc.length > 0) {
    const count = postDisc[postDisc.length - 1].players.length;
    if (count === 3) pass("Match continues with 3 players");
    else warn(`Player count: ${count} (expected 3)`);
  } else {
    fail("Post-disconnect game loop", "No game_state");
  }

  // ═══════════════════════════════════════════════════════════════════════════
  section("12. SECURITY VALIDATION");
  // ═══════════════════════════════════════════════════════════════════════════

  // Malformed JSON
  clearMessages(c1);
  c1.ws.send("not valid json {{{{");
  await sleep(100);
  const jsonErr = c1.messages.find(m => m.type === "error" && m.code === "INVALID_MESSAGE");
  if (jsonErr) pass("Malformed JSON → INVALID_MESSAGE error");
  else fail("Malformed JSON", "No error response");

  // Movement > 1.01
  clearMessages(c1);
  c1.ws.send(JSON.stringify({ type: "input", seq: 998, moveX: 50, moveY: 50, aimAngle: 0, shooting: false, ability: false, dash: false }));
  await sleep(100);
  const moveErr = c1.messages.find(m => m.type === "error");
  if (moveErr) pass("moveX/Y=50 rejected (>1.01 validation)");
  else fail("Movement validation", "No error for oversized movement");

  // Non-finite values
  clearMessages(c1);
  c1.ws.send(JSON.stringify({ type: "input", seq: 997, moveX: null, moveY: 0, aimAngle: 0, shooting: false, ability: false, dash: false }));
  await sleep(100);
  const nanErr = c1.messages.find(m => m.type === "error");
  if (nanErr) pass("Non-finite value (null) rejected");
  else fail("Type validation", "No error for null moveX");

  // Missing fields
  clearMessages(c1);
  c1.ws.send(JSON.stringify({ type: "input", seq: 996 }));
  await sleep(100);
  const missingErr = c1.messages.find(m => m.type === "error");
  if (missingErr) pass("Missing input fields rejected");
  else fail("Missing fields", "No error");

  // Oversized message
  clearMessages(c1);
  const oversized = JSON.stringify({ type: "input", seq: 995, moveX: 0, moveY: 0, aimAngle: 0, shooting: false, ability: false, dash: false, extra: "x".repeat(2100) });
  c1.ws.send(oversized);
  await sleep(100);
  const sizeErr = c1.messages.find(m => m.type === "error");
  if (sizeErr) pass(`Oversized message (${oversized.length} bytes) rejected`);
  else fail("Size validation", "No error for >2048 bytes");

  // Unknown type
  clearMessages(c1);
  c1.ws.send(JSON.stringify({ type: "hack_game", data: "evil" }));
  await sleep(100);
  const unkErr = c1.messages.find(m => m.type === "error");
  if (unkErr) pass("Unknown message type rejected");
  else fail("Unknown type", "No error");

  // Rate limiting (use c3 which hasn't been spamming)
  clearMessages(c3);
  for (let i = 0; i < 50; i++) {
    send(c3, { type: "input", seq: 2000 + i, moveX: 0, moveY: 0, aimAngle: 0, shooting: false, ability: false, dash: false });
  }
  await sleep(300);
  const rateErr = c3.messages.find(m => m.type === "error" && m.code === "RATE_LIMITED");
  if (rateErr) pass("Rate limiting triggered: RATE_LIMITED error after burst of 50");
  else warn("Rate limit not triggered (50 messages may fit within timing window)");

  // ═══════════════════════════════════════════════════════════════════════════
  section("13. MATCH END");
  // ═══════════════════════════════════════════════════════════════════════════
  clearMessages(c1); clearMessages(c2); clearMessages(c3);

  // c1, c2, c3 remain. Disconnect c3 → 2 left (≥ MIN=2, continues)
  c3.ws.close();
  await sleep(300);

  // Disconnect c2 → 1 left (< MIN=2, match ends)
  clearMessages(c1);
  c2.ws.close();
  await sleep(500);

  const matchEnd = c1.messages.find(m => m.type === "match_ended");
  if (matchEnd) {
    pass("Match ended: players < MIN_PLAYERS_TO_START");
    if (matchEnd.results?.length > 0) pass(`Results: ${matchEnd.results.length} player(s) ranked`);
    if (matchEnd.winnerId) pass(`Winner: ${matchEnd.winnerId}`);
  } else {
    clearMessages(c1);
    await sleep(400);
    const stillGoing = c1.messages.filter(m => m.type === "game_state");
    if (stillGoing.length === 0) pass("Match ended (no more game_state)");
    else fail("Match end", "Still running with 1 player");
  }

  c1.ws.close();
  await sleep(200);

  // ═══════════════════════════════════════════════════════════════════════════
  section("14. FRESH MATCH LIFECYCLE");
  // ═══════════════════════════════════════════════════════════════════════════

  let f1: TestClient, f2: TestClient;
  try {
    f1 = await createClient("FreshP1");
    f2 = await createClient("FreshP2");
    pass("New connections established");
  } catch (e: any) {
    fail("Fresh connections", e.message);
    printSummary(); return;
  }

  send(f1, { type: "create_room", playerName: "FreshP1" });
  const f1Join = await waitForMessage(f1, "room_joined", 3000);
  f1.id = f1Join.playerId;
  f1.roomCode = f1Join.roomCode;

  send(f2, { type: "join_room", roomCode: f1.roomCode, playerName: "FreshP2" });
  const f2Join = await waitForMessage(f2, "room_joined", 3000);
  f2.id = f2Join.playerId;

  send(f1, { type: "select_character", characterId: "phantom" });
  send(f2, { type: "select_character", characterId: "engineer" });
  send(f2, { type: "ready", ready: true });
  await sleep(100);

  send(f1, { type: "start_match" });
  try {
    const freshStart = await waitForMessage(f1, "match_started", 8000);
    if (freshStart.players.length === 2) pass("Fresh match: created → joined → ready → started (2 players)");
    else fail("Fresh match", `players=${freshStart.players.length}`);
  } catch (e: any) { fail("Fresh match", e.message); }

  await sleep(400);
  const freshStates = f1.messages.filter(m => m.type === "game_state");
  if (freshStates.length >= 5) pass(`Game loop: ${freshStates.length} ticks in 400ms`);
  else fail("Fresh game loop", `${freshStates.length} ticks`);

  // Both players active
  clearMessages(f1); clearMessages(f2);
  send(f1, { type: "input", seq: 1, moveX: 1, moveY: 0, aimAngle: 0, shooting: true, ability: false, dash: false });
  send(f2, { type: "input", seq: 1, moveX: -1, moveY: 0, aimAngle: Math.PI, shooting: true, ability: false, dash: false });
  await sleep(200);

  const f1s = f1.messages.filter(m => m.type === "game_state");
  const f2s = f2.messages.filter(m => m.type === "game_state");
  if (f1s.length > 0 && f2s.length > 0) pass("Both clients receiving state during gameplay");
  else fail("Dual updates", `f1=${f1s.length}, f2=${f2s.length}`);

  f1.ws.close();
  f2.ws.close();

  // ═══════════════════════════════════════════════════════════════════════════
  section("15. SERVER STABILITY");
  // ═══════════════════════════════════════════════════════════════════════════
  await sleep(200);

  try {
    const resp = await fetch("http://localhost:3001/health");
    const data = await resp.json();
    if (data.status === "ok") pass(`Server stable after all tests (uptime=${data.uptime?.toFixed(1)}s)`);
    else fail("Server stability", JSON.stringify(data));
  } catch (e: any) { fail("Server stability", e.message); }

  // Stress: rapid connect/disconnect
  try {
    const stress: TestClient[] = [];
    for (let i = 0; i < 8; i++) {
      stress.push(await createClient(`Stress${i}`));
    }
    for (const s of stress) s.ws.close();
    await sleep(200);
    const postStress = await fetch("http://localhost:3001/health");
    const pd = await postStress.json();
    if (pd.status === "ok") pass("Stress: 8 rapid connect/disconnect, server OK");
    else fail("Stress test", JSON.stringify(pd));
  } catch (e: any) { fail("Stress test", e.message); }

  printSummary();
}

function printSummary() {
  const total = passed + failed;
  console.log(`\n${COLORS.yellow}╔══════════════════════════════════════════════════════════╗${COLORS.reset}`);
  console.log(`${COLORS.yellow}║  FINAL RESULTS                                          ║${COLORS.reset}`);
  console.log(`${COLORS.yellow}╠══════════════════════════════════════════════════════════╣${COLORS.reset}`);
  console.log(`${COLORS.yellow}║${COLORS.reset}  ${COLORS.green}PASSED: ${passed}${COLORS.reset}`);
  console.log(`${COLORS.yellow}║${COLORS.reset}  ${failed > 0 ? COLORS.red : COLORS.green}FAILED: ${failed}${COLORS.reset}`);
  if (warnings > 0) console.log(`${COLORS.yellow}║${COLORS.reset}  ${COLORS.yellow}WARNINGS: ${warnings}${COLORS.reset}`);
  console.log(`${COLORS.yellow}║${COLORS.reset}  TOTAL: ${total}`);
  console.log(`${COLORS.yellow}╠══════════════════════════════════════════════════════════╣${COLORS.reset}`);
  if (failed === 0) {
    console.log(`${COLORS.yellow}║${COLORS.reset}  ${COLORS.green}STATUS: ALL TESTS PASSED - MULTIPLAYER READY${COLORS.reset}`);
  } else {
    console.log(`${COLORS.yellow}║${COLORS.reset}  ${COLORS.red}STATUS: ${failed} FAILURE(S) NEED FIXING${COLORS.reset}`);
  }
  console.log(`${COLORS.yellow}╚══════════════════════════════════════════════════════════╝${COLORS.reset}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

run().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
