import Phaser from "phaser";

/**
 * EnvironmentManager — bakes all environment textures via Canvas API.
 * No external assets needed. Call bakeTextures(scene) once before setupForWave.
 *
 * Textures produced (matching keys expected by MapObstacles fallback branches):
 *   env_wall_tile, wall_panel
 *   floor_hub, floor_factory, floor_server, floor_power,
 *   floor_control, floor_maintenance, floor_armory, floor_quarantine, floor_vault
 *   obs_crate, obs_barrel, obs_pillar, obs_generator, obs_pipe_h, obs_pipe_v
 *   env_server_rack, env_terminal, env_reactor, env_cooling, env_workbench, env_antenna
 *   env_conveyor_belt, env_tesla_coil, env_data_core, env_ventilation_fan
 *   env_hologram_table, env_fuel_cell, env_shield_pylon
 *   env_plasma_conduit, env_blast_furnace, env_ammo_rack
 *   lab_centrifuge, lab_specimen_jar, lab_table, lab_bio_reactor,
 *   lab_chem_hood, lab_scanner, lab_containment_tank
 *   env_floor_grate, env_cable_h, env_cable_v
 */
export class EnvironmentManager {
  private static _baked = false;

  static bakeTextures(scene: Phaser.Scene): void {
    if (this._baked) return;
    this._bakeWallTile(scene);
    this._bakeWallPanel(scene);
    this._bakeFloors(scene);
    this._bakeProps(scene);
    this._bakeDecorations(scene);
    this._bakeBossTextures(scene);
    this._bakeDestroyedProps(scene);
    this._baked = true;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private static _tex: Phaser.Textures.CanvasTexture | null = null;

  private static _canvas(scene: Phaser.Scene, key: string, w: number, h: number): CanvasRenderingContext2D | null {
    if (scene.textures.exists(key)) return null;
    const t = scene.textures.createCanvas(key, w, h) as Phaser.Textures.CanvasTexture;
    this._tex = t;
    return t.getContext();
  }

  private static _finish(_ctx: CanvasRenderingContext2D): void {
    this._tex?.refresh();
    this._tex = null;
  }

  // ── Wall tile (24px dark metal) ─────────────────────────────────────────────

  private static _bakeWallTile(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_wall_tile", 48, 48);
    if (!ctx) return;
    // Base dark metal
    ctx.fillStyle = "#1c2230";
    ctx.fillRect(0, 0, 48, 48);
    // Horizontal panel seams
    ctx.fillStyle = "#111820";
    ctx.fillRect(0, 23, 48, 2);
    // Top highlight
    ctx.fillStyle = "#2e3c50";
    ctx.fillRect(0, 0, 48, 3);
    // Rivet studs
    ctx.fillStyle = "#384858";
    for (const [rx, ry] of [[4,4],[44,4],[4,44],[44,44],[4,24],[44,24]]) {
      ctx.beginPath(); ctx.arc(rx, ry, 2, 0, Math.PI * 2); ctx.fill();
    }
    // Subtle teal edge glow
    const g = ctx.createLinearGradient(0, 0, 48, 0);
    g.addColorStop(0, "rgba(0,200,170,0.15)");
    g.addColorStop(1, "rgba(0,200,170,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 48, 48);
    this._finish(ctx);
  }

  private static _bakeWallPanel(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "wall_panel", 64, 24);
    if (!ctx) return;
    ctx.fillStyle = "#1a2436";
    ctx.fillRect(0, 0, 64, 24);
    // Two horizontal stripes
    ctx.fillStyle = "#0e1620";
    ctx.fillRect(0, 11, 64, 2);
    // Warning stripe pattern
    ctx.fillStyle = "rgba(255,170,0,0.18)";
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(i * 16, 0, 8, 24);
    }
    // Teal top edge
    ctx.fillStyle = "#00ccaa";
    ctx.fillRect(0, 0, 64, 2);
    this._finish(ctx);
  }

  // ── Floor tiles (64×64 tileable) ───────────────────────────────────────────

  private static _bakeFloors(scene: Phaser.Scene): void {
    type FloorDef = { base: string; grid: string; accent: string; pattern: "grid"|"hex"|"diagonal"|"circuit"|"diamond" };
    const defs: Record<string, FloorDef> = {
      floor_hub:         { base: "#0c0e18", grid: "#161a26", accent: "#4466cc", pattern: "grid" },
      floor_factory:     { base: "#0a140e", grid: "#122018", accent: "#00cc55", pattern: "hex" },
      floor_server:      { base: "#0a1018", grid: "#121c2c", accent: "#2277cc", pattern: "circuit" },
      floor_power:       { base: "#120e08", grid: "#201808", accent: "#cc6600", pattern: "diamond" },
      floor_control:     { base: "#100e06", grid: "#1e1a08", accent: "#ccaa00", pattern: "grid" },
      floor_maintenance: { base: "#0c1014", grid: "#181e24", accent: "#667788", pattern: "diagonal" },
      floor_armory:      { base: "#140a08", grid: "#221008", accent: "#cc3300", pattern: "diagonal" },
      floor_quarantine:  { base: "#0a1206", grid: "#141e08", accent: "#88cc00", pattern: "hex" },
      floor_vault:       { base: "#0e0c18", grid: "#18142a", accent: "#8833cc", pattern: "diamond" },
    };
    for (const [key, def] of Object.entries(defs)) {
      const ctx = this._canvas(scene, key, 64, 64);
      if (!ctx) continue;
      ctx.fillStyle = def.base;
      ctx.fillRect(0, 0, 64, 64);
      ctx.strokeStyle = def.grid;
      ctx.lineWidth = 1;
      switch (def.pattern) {
        case "grid":
          ctx.beginPath();
          ctx.moveTo(32, 0); ctx.lineTo(32, 64);
          ctx.moveTo(0, 32); ctx.lineTo(64, 32);
          ctx.stroke();
          break;
        case "diagonal":
          ctx.beginPath();
          ctx.moveTo(0, 0); ctx.lineTo(64, 64);
          ctx.moveTo(0, 32); ctx.lineTo(32, 64);
          ctx.moveTo(32, 0); ctx.lineTo(64, 32);
          ctx.stroke();
          break;
        case "circuit":
          ctx.beginPath();
          ctx.moveTo(0, 16); ctx.lineTo(48, 16); ctx.lineTo(48, 48); ctx.lineTo(64, 48);
          ctx.moveTo(16, 0); ctx.lineTo(16, 32); ctx.lineTo(64, 32);
          ctx.stroke();
          // Node dots
          ctx.fillStyle = def.accent + "88";
          ctx.beginPath(); ctx.arc(16, 16, 3, 0, Math.PI*2); ctx.fill();
          ctx.beginPath(); ctx.arc(48, 48, 3, 0, Math.PI*2); ctx.fill();
          break;
        case "hex":
          // Simplified hexagon outlines
          ctx.strokeStyle = def.grid;
          ctx.lineWidth = 1;
          this._hexOutline(ctx, 32, 32, 22);
          break;
        case "diamond":
          ctx.beginPath();
          ctx.moveTo(32, 0); ctx.lineTo(64, 32);
          ctx.lineTo(32, 64); ctx.lineTo(0, 32); ctx.closePath();
          ctx.stroke();
          break;
      }
      // Subtle accent dot center
      ctx.fillStyle = def.accent + "44";
      ctx.beginPath(); ctx.arc(32, 32, 2, 0, Math.PI*2); ctx.fill();
      this._finish(ctx);
    }
  }

  private static _hexOutline(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number): void {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 6;
      if (i === 0) ctx.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      else ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.stroke();
  }

  // ── Props ──────────────────────────────────────────────────────────────────

  private static _bakeProps(scene: Phaser.Scene): void {
    this._bakeCrate(scene);
    this._bakeBarrel(scene);
    this._bakePillar(scene);
    this._bakeGenerator(scene);
    this._bakePipeH(scene);
    this._bakePipeV(scene);
    this._bakeServerRack(scene);
    this._bakeTerminal(scene);
    this._bakeReactor(scene);
    this._bakeCooling(scene);
    this._bakeWorkbench(scene);
    this._bakeAntenna(scene);
    this._bakeConveyorBelt(scene);
    this._bakeTeslaCoil(scene);
    this._bakeDataCore(scene);
    this._bakeVentilationFan(scene);
    this._bakeHologramTable(scene);
    this._bakeFuelCell(scene);
    this._bakeShieldPylon(scene);
    this._bakePlasmaConduit(scene);
    this._bakeBlastFurnace(scene);
    this._bakeAmmoRack(scene);
    this._bakeCentrifuge(scene);
    this._bakeSpecimenJar(scene);
    this._bakeLabTable(scene);
    this._bakeBioReactor(scene);
    this._bakeChemHood(scene);
    this._bakeScanner(scene);
    this._bakeContainmentTank(scene);
  }

  private static _bakeCrate(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_crate", 77, 77);
    if (!ctx) return;
    // Body
    ctx.fillStyle = "#4a3822";
    ctx.fillRect(2, 2, 73, 73);
    // Metal corner brackets
    ctx.fillStyle = "#6a5838";
    ctx.fillRect(2, 2, 73, 8);   // top face
    ctx.fillRect(2, 67, 73, 8);  // bottom face
    ctx.fillStyle = "#888";
    for (const [bx, by, bw, bh] of [
      [2,2,10,10],[67,2,10,10],[2,67,10,10],[67,67,10,10],
    ]) { ctx.fillRect(bx, by, bw, bh); }
    // Cross brace
    ctx.strokeStyle = "#7a6844";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(2, 2); ctx.lineTo(77, 77);
    ctx.moveTo(77, 2); ctx.lineTo(2, 77);
    ctx.stroke();
    // Warning stripe
    ctx.fillStyle = "rgba(255,170,0,0.45)";
    ctx.fillRect(2, 34, 73, 9);
    // Border
    ctx.strokeStyle = "#8a7048";
    ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 73, 73);
    this._finish(ctx);
  }

  private static _bakeBarrel(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_barrel", 58, 58);
    if (!ctx) return;
    // Drum body
    const g = ctx.createRadialGradient(22, 22, 4, 29, 29, 28);
    g.addColorStop(0, "#556633"); g.addColorStop(1, "#2a3318");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(29, 29, 26, 0, Math.PI*2); ctx.fill();
    // Barrel rings
    ctx.strokeStyle = "#445522"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(29, 16, 24, 7, 0, 0, Math.PI*2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(29, 42, 24, 7, 0, 0, Math.PI*2); ctx.stroke();
    // Hazard stripe
    ctx.strokeStyle = "#ffaa00"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(29, 29, 20, 0, Math.PI*2); ctx.stroke();
    // Biohazard icon (simplified)
    ctx.fillStyle = "rgba(255,170,0,0.5)";
    ctx.beginPath(); ctx.arc(29, 29, 5, 0, Math.PI*2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakePillar(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_pillar", 62, 62);
    if (!ctx) return;
    // Base column
    const g = ctx.createLinearGradient(12, 0, 50, 0);
    g.addColorStop(0, "#2a3444"); g.addColorStop(0.4, "#4a5870"); g.addColorStop(1, "#1e2838");
    ctx.fillStyle = g;
    ctx.fillRect(12, 4, 38, 54);
    // Cap top / base
    ctx.fillStyle = "#5a6880";
    ctx.fillRect(6, 4, 50, 8);
    ctx.fillRect(6, 50, 50, 8);
    // Vertical flutes
    ctx.strokeStyle = "#384858"; ctx.lineWidth = 1;
    for (let fx = 18; fx < 54; fx += 8) {
      ctx.beginPath(); ctx.moveTo(fx, 12); ctx.lineTo(fx, 50); ctx.stroke();
    }
    // Teal accent lines
    ctx.strokeStyle = "#00ccaa"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(6, 8); ctx.lineTo(56, 8); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(6, 54); ctx.lineTo(56, 54); ctx.stroke();
    this._finish(ctx);
  }

  private static _bakeGenerator(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_generator", 91, 91);
    if (!ctx) return;
    ctx.fillStyle = "#1e2830";
    ctx.fillRect(4, 4, 83, 83);
    // Side vents
    ctx.fillStyle = "#141e28";
    for (let vy = 12; vy < 80; vy += 10) {
      ctx.fillRect(4, vy, 83, 5);
    }
    // Front panel
    ctx.fillStyle = "#2a3844";
    ctx.fillRect(18, 18, 55, 55);
    // Orange glow core
    const g = ctx.createRadialGradient(45, 45, 4, 45, 45, 22);
    g.addColorStop(0, "#ff9900"); g.addColorStop(0.5, "#ff440088"); g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(45, 45, 22, 0, Math.PI*2); ctx.fill();
    // Bolt holes
    ctx.fillStyle = "#111";
    for (const [bx, by] of [[10,10],[81,10],[10,81],[81,81]]) {
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI*2); ctx.fill();
    }
    // Border
    ctx.strokeStyle = "#ff6600"; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 83, 83);
    this._finish(ctx);
  }

  private static _bakePipeH(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_pipe_h", 178, 34);
    if (!ctx) return;
    // Pipe body
    const g = ctx.createLinearGradient(0, 0, 0, 34);
    g.addColorStop(0, "#3a4a5a"); g.addColorStop(0.3, "#5a6a7a"); g.addColorStop(0.7, "#4a5a6a"); g.addColorStop(1, "#1e2a3a");
    ctx.fillStyle = g;
    ctx.fillRect(0, 4, 178, 26);
    // Pipe highlights
    ctx.fillStyle = "#6a7a8a";
    ctx.fillRect(0, 4, 178, 4);
    ctx.fillStyle = "#1a2030";
    ctx.fillRect(0, 26, 178, 4);
    // Collar rings
    ctx.fillStyle = "#2a3848";
    for (const cx of [28, 89, 150]) {
      ctx.fillRect(cx - 5, 2, 10, 30);
      // Colored LED
      ctx.fillStyle = "#00ccaa";
      ctx.beginPath(); ctx.arc(cx, 17, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#2a3848";
    }
    this._finish(ctx);
  }

  private static _bakePipeV(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_pipe_v", 34, 178);
    if (!ctx) return;
    const g = ctx.createLinearGradient(0, 0, 34, 0);
    g.addColorStop(0, "#3a4a5a"); g.addColorStop(0.3, "#5a6a7a"); g.addColorStop(0.7, "#4a5a6a"); g.addColorStop(1, "#1e2a3a");
    ctx.fillStyle = g;
    ctx.fillRect(4, 0, 26, 178);
    ctx.fillStyle = "#6a7a8a";
    ctx.fillRect(4, 0, 4, 178);
    ctx.fillStyle = "#1a2030";
    ctx.fillRect(26, 0, 4, 178);
    ctx.fillStyle = "#2a3848";
    for (const cy of [28, 89, 150]) {
      ctx.fillRect(2, cy - 5, 30, 10);
      ctx.fillStyle = "#00ccaa";
      ctx.beginPath(); ctx.arc(17, cy, 3, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = "#2a3848";
    }
    this._finish(ctx);
  }

  private static _bakeServerRack(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_server_rack", 62, 115);
    if (!ctx) return;
    ctx.fillStyle = "#101820";
    ctx.fillRect(2, 2, 58, 111);
    // Server units
    for (let row = 0; row < 8; row++) {
      const sy = 6 + row * 13;
      ctx.fillStyle = row % 2 === 0 ? "#182030" : "#141828";
      ctx.fillRect(4, sy, 54, 11);
      // LED strip
      ctx.fillStyle = "#2255ff";
      ctx.fillRect(6, sy + 4, 30, 3);
      // Status LED
      ctx.fillStyle = row < 3 ? "#00ff88" : row < 6 ? "#2288ff" : "#ff4400";
      ctx.beginPath(); ctx.arc(52, sy + 5, 2, 0, Math.PI*2); ctx.fill();
    }
    // Frame
    ctx.strokeStyle = "#2255aa"; ctx.lineWidth = 2;
    ctx.strokeRect(2, 2, 58, 111);
    // Mounting rails
    ctx.fillStyle = "#2a3848";
    ctx.fillRect(2, 2, 6, 111);
    ctx.fillRect(54, 2, 6, 111);
    this._finish(ctx);
  }

  private static _bakeTerminal(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_terminal", 72, 62);
    if (!ctx) return;
    // Base
    ctx.fillStyle = "#1a2430";
    ctx.fillRect(4, 32, 64, 26);
    // Screen
    ctx.fillStyle = "#001a18";
    ctx.fillRect(8, 4, 56, 30);
    // Screen glow
    const g = ctx.createLinearGradient(8, 4, 64, 34);
    g.addColorStop(0, "#00ffaa22"); g.addColorStop(1, "#00aaffaa");
    ctx.fillStyle = g;
    ctx.fillRect(8, 4, 56, 30);
    // Scanlines
    ctx.strokeStyle = "rgba(0,255,170,0.08)"; ctx.lineWidth = 1;
    for (let ly = 8; ly < 32; ly += 4) {
      ctx.beginPath(); ctx.moveTo(8, ly); ctx.lineTo(64, ly); ctx.stroke();
    }
    // Text lines (green)
    ctx.fillStyle = "#00ff88";
    for (let tl = 0; tl < 3; tl++) {
      const tw = 10 + Math.floor(Math.random() * 20 + 20);
      ctx.fillRect(12, 10 + tl * 7, tw, 2);
    }
    // Cursor blink dot
    ctx.fillStyle = "#00ff88";
    ctx.fillRect(12, 25, 4, 5);
    // Keyboard
    ctx.fillStyle = "#2a3848";
    ctx.fillRect(12, 36, 48, 14);
    for (let kx = 0; kx < 6; kx++) {
      for (let ky = 0; ky < 2; ky++) {
        ctx.fillStyle = "#3a4858";
        ctx.fillRect(14 + kx * 7, 38 + ky * 6, 5, 4);
      }
    }
    ctx.strokeStyle = "#00ffaa"; ctx.lineWidth = 1;
    ctx.strokeRect(4, 2, 64, 58);
    this._finish(ctx);
  }

  private static _bakeReactor(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_reactor", 106, 106);
    if (!ctx) return;
    ctx.fillStyle = "#0a1a0e";
    ctx.fillRect(4, 4, 98, 98);
    // Outer ring
    ctx.strokeStyle = "#00ff88"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(53, 53, 44, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = "#00cc66"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(53, 53, 34, 0, Math.PI*2); ctx.stroke();
    // Spokes
    ctx.strokeStyle = "#00ff8844"; ctx.lineWidth = 1;
    for (let a = 0; a < Math.PI*2; a += Math.PI/4) {
      ctx.beginPath();
      ctx.moveTo(53 + Math.cos(a)*18, 53 + Math.sin(a)*18);
      ctx.lineTo(53 + Math.cos(a)*40, 53 + Math.sin(a)*40);
      ctx.stroke();
    }
    // Core glow
    const g = ctx.createRadialGradient(53, 53, 2, 53, 53, 18);
    g.addColorStop(0, "#00ff88"); g.addColorStop(0.5, "#00cc6688"); g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(53, 53, 18, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#001a0a";
    ctx.beginPath(); ctx.arc(53, 53, 6, 0, Math.PI*2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakeCooling(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_cooling", 82, 82);
    if (!ctx) return;
    ctx.fillStyle = "#101c24";
    ctx.fillRect(4, 4, 74, 74);
    // Fan blades
    ctx.strokeStyle = "#3a5a70"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(41, 41, 28, 0, Math.PI*2); ctx.stroke();
    for (let a = 0; a < Math.PI*2; a += Math.PI/3) {
      ctx.strokeStyle = "#4a6a80"; ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(41 + Math.cos(a)*8, 41 + Math.sin(a)*8);
      ctx.lineTo(41 + Math.cos(a+0.5)*26, 41 + Math.sin(a+0.5)*26);
      ctx.stroke();
    }
    // Hub
    ctx.fillStyle = "#5a7a8a";
    ctx.beginPath(); ctx.arc(41, 41, 7, 0, Math.PI*2); ctx.fill();
    ctx.fillStyle = "#8aabbb";
    ctx.beginPath(); ctx.arc(41, 41, 3, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#4488aa"; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 74, 74);
    this._finish(ctx);
  }

  private static _bakeWorkbench(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_workbench", 91, 53);
    if (!ctx) return;
    // Table surface
    ctx.fillStyle = "#3a2a18";
    ctx.fillRect(2, 8, 87, 38);
    // Metal surface highlight
    ctx.fillStyle = "#4a3a28";
    ctx.fillRect(2, 8, 87, 6);
    // Metal legs
    ctx.fillStyle = "#384858";
    ctx.fillRect(6, 46, 8, 7);
    ctx.fillRect(77, 46, 8, 7);
    // Tool outlines on surface
    ctx.strokeStyle = "#888"; ctx.lineWidth = 1;
    ctx.strokeRect(10, 14, 20, 8);   // box
    ctx.beginPath(); ctx.moveTo(38, 13); ctx.lineTo(38, 40); ctx.stroke(); // rod
    ctx.beginPath(); ctx.arc(60, 24, 8, 0, Math.PI*2); ctx.stroke();       // circle tool
    // Edge highlight
    ctx.strokeStyle = "#5a4a38"; ctx.lineWidth = 2;
    ctx.strokeRect(2, 8, 87, 38);
    this._finish(ctx);
  }

  private static _bakeAntenna(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_antenna", 48, 67);
    if (!ctx) return;
    // Base unit
    ctx.fillStyle = "#1e2838";
    ctx.fillRect(14, 44, 20, 18);
    // Mast
    ctx.fillStyle = "#3a4858";
    ctx.fillRect(22, 8, 4, 40);
    // Dish
    ctx.strokeStyle = "#4488ff"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(24, 22, 14, 5, -0.4, 0, Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(10, 22); ctx.lineTo(24, 10); ctx.lineTo(38, 22); ctx.stroke();
    // Signal rings
    ctx.strokeStyle = "#4488ff44"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(24, 6, 8, Math.PI, 2*Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(24, 6, 14, Math.PI, 2*Math.PI); ctx.stroke();
    // LED
    ctx.fillStyle = "#4488ff";
    ctx.beginPath(); ctx.arc(24, 6, 3, 0, Math.PI*2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakeConveyorBelt(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_conveyor_belt", 130, 38);
    if (!ctx) return;
    ctx.fillStyle = "#222c3a";
    ctx.fillRect(4, 8, 122, 22);
    // Belt surface slats
    ctx.fillStyle = "#2a3848";
    for (let bx = 4; bx < 126; bx += 14) {
      ctx.fillRect(bx, 8, 10, 22);
    }
    // Belt edge rails
    ctx.fillStyle = "#3a4858";
    ctx.fillRect(4, 6, 122, 4);
    ctx.fillRect(4, 28, 122, 4);
    // Rollers at each end
    ctx.fillStyle = "#4a5868";
    ctx.beginPath(); ctx.arc(12, 19, 9, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(118, 19, 9, 0, Math.PI*2); ctx.fill();
    // Arrow direction indicators
    ctx.fillStyle = "#ffaa00";
    for (let ax = 30; ax < 110; ax += 30) {
      ctx.beginPath();
      ctx.moveTo(ax, 19);
      ctx.lineTo(ax+10, 14);
      ctx.lineTo(ax+10, 24);
      ctx.closePath();
      ctx.fill();
    }
    this._finish(ctx);
  }

  private static _bakeTeslaCoil(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_tesla_coil", 53, 77);
    if (!ctx) return;
    // Base
    ctx.fillStyle = "#1a2438";
    ctx.fillRect(14, 54, 25, 18);
    // Coil stem
    ctx.fillStyle = "#2a3848";
    ctx.fillRect(22, 16, 9, 42);
    // Coil windings
    ctx.strokeStyle = "#4488ff"; ctx.lineWidth = 2;
    for (let wy = 18; wy < 54; wy += 8) {
      ctx.beginPath(); ctx.ellipse(26, wy, 10, 3, 0, 0, Math.PI*2); ctx.stroke();
    }
    // Top electrode
    ctx.fillStyle = "#5588ff";
    ctx.beginPath(); ctx.arc(26, 14, 8, 0, Math.PI*2); ctx.fill();
    // Spark glow
    const g = ctx.createRadialGradient(26, 14, 2, 26, 14, 12);
    g.addColorStop(0, "#aaccff88"); g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(26, 14, 12, 0, Math.PI*2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakeDataCore(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_data_core", 67, 67);
    if (!ctx) return;
    ctx.fillStyle = "#080f18";
    ctx.fillRect(4, 4, 59, 59);
    // Rings
    ctx.strokeStyle = "#00ffff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(33, 33, 24, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = "#00aaccaa"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(33, 33, 16, 0, Math.PI*2); ctx.stroke();
    // Core hex
    ctx.fillStyle = "#00ffff";
    this._hexOutline(ctx, 33, 33, 8);
    ctx.fillStyle = "#00ffff44";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i/6)*Math.PI*2 - Math.PI/6;
      if (i===0) ctx.moveTo(33+Math.cos(a)*8, 33+Math.sin(a)*8);
      else ctx.lineTo(33+Math.cos(a)*8, 33+Math.sin(a)*8);
    }
    ctx.closePath(); ctx.fill();
    // Orbiting dots
    ctx.fillStyle = "#00ffff";
    for (let i = 0; i < 4; i++) {
      const a = (i/4)*Math.PI*2;
      ctx.beginPath(); ctx.arc(33+Math.cos(a)*20, 33+Math.sin(a)*20, 2, 0, Math.PI*2); ctx.fill();
    }
    this._finish(ctx);
  }

  private static _bakeVentilationFan(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_ventilation_fan", 72, 72);
    if (!ctx) return;
    ctx.fillStyle = "#141e28";
    ctx.fillRect(4, 4, 64, 64);
    // Grate bars
    ctx.strokeStyle = "#2a3848"; ctx.lineWidth = 3;
    for (let fx = 10; fx < 68; fx += 10) {
      ctx.beginPath(); ctx.moveTo(fx, 4); ctx.lineTo(fx, 68); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(4, fx); ctx.lineTo(68, fx); ctx.stroke();
    }
    // Fan circle
    ctx.strokeStyle = "#4a6888"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(36, 36, 22, 0, Math.PI*2); ctx.stroke();
    // Fan blades
    for (let a = 0; a < Math.PI*2; a += Math.PI/2) {
      ctx.fillStyle = "#3a5870";
      ctx.beginPath();
      ctx.moveTo(36, 36);
      ctx.arc(36, 36, 20, a, a+Math.PI/3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = "#5a7888";
    ctx.beginPath(); ctx.arc(36, 36, 5, 0, Math.PI*2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakeHologramTable(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_hologram_table", 91, 67);
    if (!ctx) return;
    // Table
    ctx.fillStyle = "#1a2a2a";
    ctx.fillRect(4, 36, 83, 24);
    // Hologram projection zone
    ctx.fillStyle = "#002a2a";
    ctx.fillRect(20, 8, 51, 30);
    // Hologram lines
    ctx.strokeStyle = "#00ffcc44"; ctx.lineWidth = 1;
    for (let hy = 12; hy < 36; hy += 6) {
      ctx.beginPath(); ctx.moveTo(20, hy); ctx.lineTo(71, hy); ctx.stroke();
    }
    // Hologram shape (wireframe cube outline)
    ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 1;
    ctx.strokeRect(30, 12, 20, 18);
    ctx.beginPath();
    ctx.moveTo(30, 12); ctx.lineTo(36, 8);
    ctx.lineTo(56, 8); ctx.lineTo(56, 26);
    ctx.lineTo(50, 30);
    ctx.moveTo(56, 8); ctx.lineTo(50, 12);
    ctx.stroke();
    // Glow
    const g = ctx.createRadialGradient(45, 24, 4, 45, 24, 24);
    g.addColorStop(0, "#00ffcc22"); g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.fillRect(20, 8, 51, 30);
    ctx.strokeStyle = "#00ffcc88"; ctx.lineWidth = 2;
    ctx.strokeRect(4, 36, 83, 24);
    this._finish(ctx);
  }

  private static _bakeFuelCell(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_fuel_cell", 48, 62);
    if (!ctx) return;
    // Canister
    const g = ctx.createLinearGradient(6, 0, 42, 0);
    g.addColorStop(0, "#3a2010"); g.addColorStop(0.4, "#6a4020"); g.addColorStop(1, "#2a1808");
    ctx.fillStyle = g;
    ctx.fillRect(6, 6, 36, 50);
    // Top cap
    ctx.fillStyle = "#4a3020";
    ctx.fillRect(10, 4, 28, 8);
    ctx.beginPath(); ctx.arc(24, 4, 6, Math.PI, 0); ctx.fill();
    // Warning bands
    ctx.fillStyle = "rgba(255,100,0,0.4)";
    ctx.fillRect(6, 20, 36, 8);
    ctx.fillRect(6, 38, 36, 8);
    // Gauge
    ctx.strokeStyle = "#ff6600"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(24, 33, 10, Math.PI*0.7, Math.PI*0.3, false); ctx.stroke();
    ctx.fillStyle = "#ff6600";
    ctx.beginPath(); ctx.arc(24, 33, 4, 0, Math.PI*2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakeShieldPylon(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_shield_pylon", 53, 77);
    if (!ctx) return;
    // Base
    ctx.fillStyle = "#1a2050";
    ctx.fillRect(14, 58, 25, 14);
    // Column
    ctx.fillStyle = "#1e2858";
    ctx.fillRect(18, 14, 17, 48);
    // Emitter crystal top
    ctx.strokeStyle = "#4466ff"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(26, 4); ctx.lineTo(36, 18); ctx.lineTo(26, 28); ctx.lineTo(16, 18); ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "#3355ff44";
    ctx.beginPath();
    ctx.moveTo(26, 4); ctx.lineTo(36, 18); ctx.lineTo(26, 28); ctx.lineTo(16, 18); ctx.closePath();
    ctx.fill();
    // Shield rings
    const g = ctx.createRadialGradient(26, 20, 4, 26, 20, 16);
    g.addColorStop(0, "#4466ff22"); g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(26, 20, 16, 0, Math.PI*2); ctx.fill();
    // Glow dot
    ctx.fillStyle = "#aabbff";
    ctx.beginPath(); ctx.arc(26, 16, 3, 0, Math.PI*2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakePlasmaConduit(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_plasma_conduit", 125, 48);
    if (!ctx) return;
    ctx.fillStyle = "#1e1808";
    ctx.fillRect(4, 4, 117, 40);
    // Main conduit body
    const g = ctx.createLinearGradient(0, 8, 0, 40);
    g.addColorStop(0, "#4a3010"); g.addColorStop(0.5, "#7a5020"); g.addColorStop(1, "#3a2008");
    ctx.fillStyle = g;
    ctx.fillRect(4, 12, 117, 24);
    // Plasma glow inside
    const pg = ctx.createLinearGradient(4, 0, 121, 0);
    pg.addColorStop(0, "transparent"); pg.addColorStop(0.2, "#ff880044"); pg.addColorStop(0.8, "#ff880044"); pg.addColorStop(1, "transparent");
    ctx.fillStyle = pg;
    ctx.fillRect(4, 16, 117, 16);
    // End caps
    ctx.fillStyle = "#5a3818";
    ctx.fillRect(4, 10, 12, 28); ctx.fillRect(109, 10, 12, 28);
    // Plasma bolts
    ctx.strokeStyle = "#ff8800"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(16, 24); ctx.lineTo(35, 18); ctx.lineTo(50, 26); ctx.lineTo(70, 16); ctx.lineTo(90, 26); ctx.lineTo(109, 20);
    ctx.stroke();
    ctx.strokeStyle = "#ff440044"; ctx.lineWidth = 3;
    ctx.stroke();
    this._finish(ctx);
  }

  private static _bakeBlastFurnace(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_blast_furnace", 115, 106);
    if (!ctx) return;
    ctx.fillStyle = "#1a0e06";
    ctx.fillRect(4, 4, 107, 98);
    // Main furnace body
    ctx.fillStyle = "#2e1808";
    ctx.fillRect(10, 16, 95, 82);
    // Furnace opening
    ctx.fillStyle = "#ff4400";
    ctx.fillRect(28, 36, 59, 40);
    const fireG = ctx.createRadialGradient(57, 56, 6, 57, 56, 32);
    fireG.addColorStop(0, "#ffffff"); fireG.addColorStop(0.3, "#ffff00"); fireG.addColorStop(0.7, "#ff4400"); fireG.addColorStop(1, "#110400");
    ctx.fillStyle = fireG;
    ctx.fillRect(28, 36, 59, 40);
    // Top vent
    ctx.fillStyle = "#3a2010";
    ctx.fillRect(40, 4, 35, 16);
    ctx.strokeStyle = "#ff6600"; ctx.lineWidth = 2;
    ctx.strokeRect(40, 4, 35, 16);
    // Pipe stacks
    ctx.fillStyle = "#2a1808";
    for (const px of [20, 85]) {
      ctx.fillRect(px, 8, 12, 30);
      ctx.fillStyle = "#ff440044";
      ctx.fillRect(px+2, 8, 8, 30);
      ctx.fillStyle = "#2a1808";
    }
    ctx.strokeStyle = "#ff4400"; ctx.lineWidth = 3;
    ctx.strokeRect(4, 4, 107, 98);
    this._finish(ctx);
  }

  private static _bakeAmmoRack(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_ammo_rack", 96, 77);
    if (!ctx) return;
    ctx.fillStyle = "#1a1e10";
    ctx.fillRect(4, 4, 88, 69);
    // Rack frame
    ctx.strokeStyle = "#4a5828"; ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, 80, 61);
    // Ammo crates / shells stacked
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 5; col++) {
        const cx2 = 12 + col * 15;
        const cy = 14 + row * 18;
        ctx.fillStyle = "#3a4820";
        ctx.fillRect(cx2, cy, 11, 14);
        ctx.fillStyle = "#6a8828";
        ctx.fillRect(cx2+2, cy+1, 7, 4);
        ctx.strokeStyle = "#8aaa44"; ctx.lineWidth = 1;
        ctx.strokeRect(cx2, cy, 11, 14);
      }
    }
    // Warning label
    ctx.fillStyle = "rgba(255,200,0,0.35)";
    ctx.fillRect(4, 59, 88, 14);
    ctx.fillStyle = "#ffcc00";
    ctx.font = "bold 8px monospace";
    ctx.fillText("⚠ AMMO", 28, 70);
    this._finish(ctx);
  }

  // ── Lab equipment ──────────────────────────────────────────────────────────

  private static _bakeCentrifuge(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "lab_centrifuge", 62, 62);
    if (!ctx) return;
    ctx.fillStyle = "#0a1e1a";
    ctx.fillRect(4, 4, 54, 54);
    // Rotor
    ctx.strokeStyle = "#00ffcc"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(31, 31, 20, 0, Math.PI*2); ctx.stroke();
    // Rotor arms
    for (let a = 0; a < Math.PI*2; a += Math.PI/3) {
      ctx.strokeStyle = "#00ccaa"; ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(31, 31);
      ctx.lineTo(31 + Math.cos(a)*18, 31 + Math.sin(a)*18);
      ctx.stroke();
      // Sample tube
      ctx.fillStyle = "#00ff88";
      ctx.beginPath(); ctx.arc(31+Math.cos(a)*18, 31+Math.sin(a)*18, 3, 0, Math.PI*2); ctx.fill();
    }
    ctx.fillStyle = "#00ffcc";
    ctx.beginPath(); ctx.arc(31, 31, 4, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#00ffcc88"; ctx.lineWidth = 1;
    ctx.strokeRect(4, 4, 54, 54);
    this._finish(ctx);
  }

  private static _bakeSpecimenJar(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "lab_specimen_jar", 48, 62);
    if (!ctx) return;
    // Jar body
    ctx.fillStyle = "#0a2018";
    ctx.fillRect(8, 14, 32, 42);
    // Liquid fill
    const lg = ctx.createLinearGradient(8, 30, 40, 56);
    lg.addColorStop(0, "#00ff8844"); lg.addColorStop(1, "#00cc6688");
    ctx.fillStyle = lg;
    ctx.fillRect(10, 36, 28, 18);
    // Bubbles
    ctx.fillStyle = "#00ff88";
    for (const [bx, by, br] of [[16,40,2],[28,46,1.5],[22,38,1]] as [number,number,number][]) {
      ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI*2); ctx.fill();
    }
    // Lid
    ctx.fillStyle = "#2a3838";
    ctx.fillRect(8, 8, 32, 10);
    ctx.fillRect(12, 4, 24, 8);
    // Jar outline
    ctx.strokeStyle = "#00ff88"; ctx.lineWidth = 1;
    ctx.strokeRect(8, 14, 32, 42);
    this._finish(ctx);
  }

  private static _bakeLabTable(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "lab_table", 134, 53);
    if (!ctx) return;
    ctx.fillStyle = "#1a2a28";
    ctx.fillRect(4, 4, 126, 44);
    // Stainless surface
    const g = ctx.createLinearGradient(0, 4, 0, 30);
    g.addColorStop(0, "#2a3e3a"); g.addColorStop(1, "#1a2e2a");
    ctx.fillStyle = g;
    ctx.fillRect(4, 4, 126, 26);
    // Equipment outlines
    ctx.strokeStyle = "#3a5a58"; ctx.lineWidth = 1;
    ctx.strokeRect(10, 8, 24, 16);   // tray
    ctx.beginPath(); ctx.arc(50, 16, 7, 0, Math.PI*2); ctx.stroke();   // dish
    ctx.strokeRect(72, 8, 18, 14);  // box
    ctx.beginPath(); ctx.moveTo(100, 8); ctx.lineTo(100, 24); ctx.stroke(); // rod
    ctx.beginPath(); ctx.moveTo(110, 8); ctx.lineTo(120, 8); ctx.lineTo(125, 18); ctx.lineTo(110, 18); ctx.stroke(); // flask
    // Legs
    ctx.fillStyle = "#2a3838";
    ctx.fillRect(8, 30, 8, 18); ctx.fillRect(118, 30, 8, 18);
    ctx.strokeStyle = "#4a6a68"; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 126, 44);
    this._finish(ctx);
  }

  private static _bakeBioReactor(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "lab_bio_reactor", 91, 106);
    if (!ctx) return;
    ctx.fillStyle = "#081a0e";
    ctx.fillRect(4, 4, 83, 98);
    // Tank body
    const g = ctx.createLinearGradient(8, 0, 80, 0);
    g.addColorStop(0, "#102018"); g.addColorStop(0.5, "#183028"); g.addColorStop(1, "#0a1810");
    ctx.fillStyle = g;
    ctx.fillRect(10, 10, 71, 82);
    // Bio-fluid fill
    const fg = ctx.createLinearGradient(0, 40, 0, 90);
    fg.addColorStop(0, "#00ff4422"); fg.addColorStop(1, "#00cc3366");
    ctx.fillStyle = fg;
    ctx.fillRect(12, 50, 67, 40);
    // Bubbles
    ctx.fillStyle = "#00ff44";
    for (const [bx,by,br] of [[28,70,3],[50,60,2],[66,75,2.5],[38,80,1.5]] as [number,number,number][]) {
      ctx.beginPath(); ctx.arc(bx,by,br,0,Math.PI*2); ctx.fill();
    }
    // Top pipes
    ctx.fillStyle = "#2a3828";
    ctx.fillRect(28, 2, 10, 12); ctx.fillRect(53, 2, 10, 12);
    // Rings
    ctx.strokeStyle = "#00ff44"; ctx.lineWidth = 2;
    ctx.strokeRect(10, 10, 71, 82);
    // Gauge indicator
    ctx.strokeStyle = "#00cc44"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(45, 30, 14, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = "#00ff44"; ctx.font = "8px monospace";
    ctx.fillText("BIO", 37, 32);
    this._finish(ctx);
  }

  private static _bakeChemHood(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "lab_chem_hood", 106, 67);
    if (!ctx) return;
    ctx.fillStyle = "#0e1e1a";
    ctx.fillRect(4, 4, 98, 59);
    // Hood frame
    ctx.fillStyle = "#182a26";
    ctx.fillRect(8, 8, 90, 55);
    // Glass front panel (lower 60%)
    ctx.fillStyle = "#00ffcc11";
    ctx.fillRect(12, 28, 82, 32);
    ctx.strokeStyle = "#00ffcc44"; ctx.lineWidth = 1;
    ctx.strokeRect(12, 28, 82, 32);
    // Equipment inside
    ctx.strokeStyle = "#44ddaa"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(35, 42, 8, 0, Math.PI*2); ctx.stroke(); // flask
    ctx.strokeRect(58, 34, 16, 20); // tray
    ctx.beginPath(); ctx.moveTo(80, 30); ctx.lineTo(80, 58); ctx.stroke(); // rod
    // Airflow vents top
    ctx.fillStyle = "#2a3c38";
    for (let vx = 14; vx < 92; vx += 16) {
      ctx.fillRect(vx, 10, 10, 14);
    }
    ctx.strokeStyle = "#44ddaa"; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 98, 59);
    this._finish(ctx);
  }

  private static _bakeScanner(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "lab_scanner", 72, 72);
    if (!ctx) return;
    ctx.fillStyle = "#080e18";
    ctx.fillRect(4, 4, 64, 64);
    // Scan ring
    ctx.strokeStyle = "#4488ff"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(36, 36, 26, 0, Math.PI*2); ctx.stroke();
    ctx.strokeStyle = "#2255aa44"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(36, 36, 18, 0, Math.PI*2); ctx.stroke();
    // Scan beam wedge
    ctx.fillStyle = "#4488ff22";
    ctx.beginPath(); ctx.moveTo(36,36); ctx.arc(36,36,24,0,Math.PI/2); ctx.closePath(); ctx.fill();
    // Cross-hair
    ctx.strokeStyle = "#4488ff88"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(36-26, 36); ctx.lineTo(36+26, 36);
    ctx.moveTo(36, 36-26); ctx.lineTo(36, 36+26);
    ctx.stroke();
    // Target circles
    ctx.strokeStyle = "#4488ff";
    ctx.beginPath(); ctx.arc(36, 36, 6, 0, Math.PI*2); ctx.stroke();
    ctx.fillStyle = "#4488ff44";
    ctx.beginPath(); ctx.arc(36, 36, 6, 0, Math.PI*2); ctx.fill();
    ctx.strokeStyle = "#4488ff"; ctx.lineWidth = 2;
    ctx.strokeRect(4, 4, 64, 64);
    this._finish(ctx);
  }

  private static _bakeContainmentTank(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "lab_containment_tank", 62, 96);
    if (!ctx) return;
    // Tank body
    const g = ctx.createLinearGradient(6, 0, 56, 0);
    g.addColorStop(0, "#0e2418"); g.addColorStop(0.5, "#1a3826"); g.addColorStop(1, "#0a1c10");
    ctx.fillStyle = g;
    ctx.fillRect(6, 6, 50, 84);
    // Top / bottom caps
    ctx.fillStyle = "#2a4838";
    ctx.fillRect(6, 6, 50, 10); ctx.fillRect(6, 80, 50, 10);
    // Fluid
    const fl = ctx.createLinearGradient(0, 40, 0, 78);
    fl.addColorStop(0, "#00ff4422"); fl.addColorStop(1, "#00cc3355");
    ctx.fillStyle = fl;
    ctx.fillRect(10, 40, 42, 38);
    // Rings
    ctx.strokeStyle = "#00ff44"; ctx.lineWidth = 2;
    for (const ry of [24, 48, 66]) {
      ctx.beginPath(); ctx.ellipse(31, ry, 22, 5, 0, 0, Math.PI*2); ctx.stroke();
    }
    // Pipe
    ctx.fillStyle = "#2a4030";
    ctx.fillRect(27, 0, 8, 10);
    ctx.strokeStyle = "#00ff4488"; ctx.lineWidth = 1;
    ctx.strokeRect(6, 6, 50, 84);
    this._finish(ctx);
  }

  // ── Decoration assets ──────────────────────────────────────────────────────

  private static _bakeDecorations(scene: Phaser.Scene): void {
    // Floor grate
    {
      const ctx = this._canvas(scene, "env_floor_grate", 48, 48);
      if (ctx) {
        ctx.fillStyle = "#222233";
        ctx.fillRect(0, 0, 48, 48);
        ctx.strokeStyle = "#3a3a4a"; ctx.lineWidth = 2;
        for (let i = 0; i < 48; i += 8) {
          ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 48); ctx.stroke();
          ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(48, i); ctx.stroke();
        }
        ctx.strokeStyle = "#4a4a5a"; ctx.lineWidth = 1;
        ctx.strokeRect(2, 2, 44, 44);
        this._finish(ctx);
      }
    }
    // Cable horizontal
    {
      const ctx = this._canvas(scene, "env_cable_h", 80, 6);
      if (ctx) {
        ctx.fillStyle = "#222";
        ctx.fillRect(0, 1, 80, 4);
        ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(0, 3); ctx.lineTo(80, 3); ctx.stroke();
        // Cable connectors
        ctx.fillStyle = "#00ffcc";
        ctx.fillRect(0, 2, 4, 2); ctx.fillRect(76, 2, 4, 2);
        this._finish(ctx);
      }
    }
    // Cable vertical
    {
      const ctx = this._canvas(scene, "env_cable_v", 6, 80);
      if (ctx) {
        ctx.fillStyle = "#222";
        ctx.fillRect(1, 0, 4, 80);
        ctx.strokeStyle = "#444"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(3, 0); ctx.lineTo(3, 80); ctx.stroke();
        ctx.fillStyle = "#00ffcc";
        ctx.fillRect(2, 0, 2, 4); ctx.fillRect(2, 76, 2, 4);
        this._finish(ctx);
      }
    }
  }

  // ── Boss arena textures ────────────────────────────────────────────────────

  private static _bakeBossTextures(scene: Phaser.Scene): void {
    this._bakeBossFloor(scene);
    this._bakeBossCore(scene);
    this._bakeBossConduit(scene);
    this._bakeBossTerminal(scene);
  }

  private static _bakeBossFloor(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "floor_boss", 64, 64);
    if (!ctx) return;
    // Deep crimson base
    ctx.fillStyle = "#160008";
    ctx.fillRect(0, 0, 64, 64);
    // Diagonal slash pattern
    ctx.strokeStyle = "#2a0012"; ctx.lineWidth = 1;
    for (let i = -64; i < 128; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + 64, 64); ctx.stroke();
    }
    // Warning accent cross
    ctx.strokeStyle = "#ff006622"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(32, 0); ctx.lineTo(32, 64); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, 32); ctx.lineTo(64, 32); ctx.stroke();
    // Pulse dot
    ctx.fillStyle = "#ff004433";
    ctx.beginPath(); ctx.arc(32, 32, 3, 0, Math.PI * 2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakeBossCore(scene: Phaser.Scene): void {
    // 160×160 centrepiece texture for the boss arena reactor core
    const ctx = this._canvas(scene, "env_boss_core", 160, 160);
    if (!ctx) return;
    const cx = 80; const cy = 80;
    // Dark void background
    ctx.fillStyle = "#0a0006";
    ctx.fillRect(0, 0, 160, 160);
    // Outer ring
    ctx.strokeStyle = "#ff0066"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(cx, cy, 72, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#cc0044"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cx, cy, 56, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#880022"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, 40, 0, Math.PI * 2); ctx.stroke();
    // 8 spokes
    ctx.strokeStyle = "#ff006633"; ctx.lineWidth = 2;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * 22, cy + Math.sin(a) * 22);
      ctx.lineTo(cx + Math.cos(a) * 68, cy + Math.sin(a) * 68);
      ctx.stroke();
    }
    // Outer tick marks
    ctx.strokeStyle = "#ff0066"; ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r0 = 72; const r1 = 80;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      ctx.stroke();
    }
    // Core glow
    const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 36);
    g.addColorStop(0, "#ff66aa");
    g.addColorStop(0.4, "#ff006688");
    g.addColorStop(1, "transparent");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(cx, cy, 36, 0, Math.PI * 2); ctx.fill();
    // Center void
    ctx.fillStyle = "#0a0006";
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakeBossConduit(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_boss_conduit", 160, 32);
    if (!ctx) return;
    ctx.fillStyle = "#1a0006";
    ctx.fillRect(0, 0, 160, 32);
    // Main tube
    const g = ctx.createLinearGradient(0, 6, 0, 26);
    g.addColorStop(0, "#5a1028"); g.addColorStop(0.5, "#8a2040"); g.addColorStop(1, "#3a0818");
    ctx.fillStyle = g;
    ctx.fillRect(0, 6, 160, 20);
    // Energy plasma inside
    const pg = ctx.createLinearGradient(0, 0, 160, 0);
    pg.addColorStop(0, "transparent");
    pg.addColorStop(0.15, "#ff006655");
    pg.addColorStop(0.85, "#ff006655");
    pg.addColorStop(1, "transparent");
    ctx.fillStyle = pg;
    ctx.fillRect(0, 10, 160, 12);
    // Top highlight
    ctx.fillStyle = "#cc3366";
    ctx.fillRect(0, 6, 160, 3);
    // Shadow
    ctx.fillStyle = "#110004";
    ctx.fillRect(0, 23, 160, 3);
    // Collars
    ctx.fillStyle = "#3a0810";
    for (const cx2 of [20, 60, 100, 140]) {
      ctx.fillRect(cx2 - 4, 4, 8, 24);
      ctx.fillStyle = "#ff0066";
      ctx.beginPath(); ctx.arc(cx2, 16, 2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#3a0810";
    }
    this._finish(ctx);
  }

  private static _bakeBossTerminal(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "env_boss_terminal", 80, 70);
    if (!ctx) return;
    // Base
    ctx.fillStyle = "#1a0010";
    ctx.fillRect(4, 36, 72, 30);
    // Screen
    ctx.fillStyle = "#0a0008";
    ctx.fillRect(8, 4, 64, 34);
    // Red/crimson screen glow
    const g = ctx.createLinearGradient(8, 4, 72, 38);
    g.addColorStop(0, "#ff006622"); g.addColorStop(1, "#cc004488");
    ctx.fillStyle = g;
    ctx.fillRect(8, 4, 64, 34);
    // Scanlines
    ctx.strokeStyle = "rgba(255,0,80,0.07)"; ctx.lineWidth = 1;
    for (let ly = 8; ly < 36; ly += 4) {
      ctx.beginPath(); ctx.moveTo(8, ly); ctx.lineTo(72, ly); ctx.stroke();
    }
    // Skull/warning icon (simplified)
    ctx.fillStyle = "#ff0066";
    ctx.beginPath(); ctx.arc(40, 20, 8, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0a0008";
    ctx.beginPath(); ctx.arc(37, 18, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(43, 18, 2, 0, Math.PI * 2); ctx.fill();
    ctx.fillRect(36, 24, 8, 4);
    // "WARNING" text line
    ctx.fillStyle = "#ff4488"; ctx.font = "bold 6px monospace";
    ctx.fillText("WARNING", 16, 34);
    // Border
    ctx.strokeStyle = "#ff0066"; ctx.lineWidth = 2;
    ctx.strokeRect(4, 2, 72, 66);
    this._finish(ctx);
  }

  // ── Destroyed prop textures ────────────────────────────────────────────────

  private static _bakeDestroyedProps(scene: Phaser.Scene): void {
    this._bakeCrateDestroyed(scene);
    this._bakeGeneratorDestroyed(scene);
    this._bakeTerminalDestroyed(scene);
    this._bakeReactorDestroyed(scene);
    this._bakeBarrelDestroyed(scene);
    this._bakePillarDestroyed(scene);
    this._bakeFuelCellDestroyed(scene);
    this._bakeBioReactorDestroyed(scene);
    this._bakeShieldPylonDestroyed(scene);
  }

  private static _bakeCrateDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_crate_destroyed", 77, 77);
    if (!ctx) return;
    // Scorch mark base
    ctx.fillStyle = "#1a1208";
    ctx.fillRect(0, 0, 77, 77);
    // Broken boards
    ctx.strokeStyle = "#5a4020"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 8); ctx.lineTo(38, 44); ctx.lineTo(18, 72);
    ctx.moveTo(69, 12); ctx.lineTo(40, 36); ctx.lineTo(60, 70);
    ctx.stroke();
    // Scorch circles
    ctx.fillStyle = "#2a1804";
    ctx.beginPath(); ctx.arc(38, 38, 22, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#0a0600";
    ctx.beginPath(); ctx.arc(38, 38, 10, 0, Math.PI * 2); ctx.fill();
    // Debris pieces
    ctx.fillStyle = "#6a4828";
    for (const [px, py, pw, ph] of [[6,60,14,8],[48,64,18,6],[62,8,10,14],[4,30,8,12]] as number[][]) {
      ctx.fillRect(px, py, pw, ph);
    }
    this._finish(ctx);
  }

  private static _bakeGeneratorDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_generator_destroyed", 91, 91);
    if (!ctx) return;
    ctx.fillStyle = "#0e0e0e";
    ctx.fillRect(0, 0, 91, 91);
    // Melted casing
    ctx.fillStyle = "#181810";
    ctx.fillRect(8, 8, 75, 75);
    // Blast crater
    const g = ctx.createRadialGradient(45, 45, 4, 45, 45, 32);
    g.addColorStop(0, "#1a0800"); g.addColorStop(0.5, "#0e0600"); g.addColorStop(1, "#070400");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(45, 45, 32, 0, Math.PI * 2); ctx.fill();
    // Sparking wires
    ctx.strokeStyle = "#ff440055"; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(45, 45);
      ctx.lineTo(45 + Math.cos(a) * 28, 45 + Math.sin(a) * 28);
      ctx.stroke();
    }
    // Smoke stain rings
    ctx.strokeStyle = "#2a2a2a44"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(45, 45, 36, 0, Math.PI * 2); ctx.stroke();
    this._finish(ctx);
  }

  private static _bakeTerminalDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_terminal_destroyed", 72, 62);
    if (!ctx) return;
    ctx.fillStyle = "#0e1010";
    ctx.fillRect(0, 0, 72, 62);
    // Cracked screen
    ctx.fillStyle = "#000a08";
    ctx.fillRect(8, 4, 56, 30);
    // Crack lines across screen
    ctx.strokeStyle = "#ffffff22"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 4); ctx.lineTo(40, 20); ctx.lineTo(64, 34);
    ctx.moveTo(30, 4); ctx.lineTo(20, 34);
    ctx.stroke();
    // Shattered edge fragments
    ctx.fillStyle = "#112222";
    ctx.fillRect(8, 32, 14, 4);
    ctx.fillRect(50, 2, 6, 10);
    // Burn mark
    ctx.fillStyle = "#060e0c";
    ctx.beginPath(); ctx.arc(36, 18, 12, 0, Math.PI * 2); ctx.fill();
    // Broken keyboard
    ctx.fillStyle = "#141c1a";
    ctx.fillRect(12, 36, 48, 14);
    ctx.strokeStyle = "#223322"; ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, 72, 62);
    this._finish(ctx);
  }

  private static _bakeReactorDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_reactor_destroyed", 106, 106);
    if (!ctx) return;
    ctx.fillStyle = "#060c06";
    ctx.fillRect(0, 0, 106, 106);
    // Scorched body
    ctx.fillStyle = "#0a1008";
    ctx.fillRect(8, 8, 90, 90);
    // Cracked rings
    ctx.strokeStyle = "#004422"; ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath(); ctx.arc(53, 53, 40, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = "#003318"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(53, 53, 28, 0, Math.PI * 2); ctx.stroke();
    ctx.setLineDash([]);
    // Dead core — black
    ctx.fillStyle = "#030804";
    ctx.beginPath(); ctx.arc(53, 53, 16, 0, Math.PI * 2); ctx.fill();
    // Scorch radials
    ctx.strokeStyle = "#1a1a0844"; ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(53 + Math.cos(a) * 14, 53 + Math.sin(a) * 14);
      ctx.lineTo(53 + Math.cos(a) * 46, 53 + Math.sin(a) * 46);
      ctx.stroke();
    }
    this._finish(ctx);
  }

  private static _bakeBarrelDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_barrel_destroyed", 48, 67);
    if (!ctx) return;
    ctx.fillStyle = "#0e0a06";
    ctx.fillRect(0, 0, 48, 67);
    // Dented barrel silhouette — top blown off
    ctx.fillStyle = "#1e1208";
    ctx.fillRect(6, 22, 36, 40);
    // Blast rupture at top
    ctx.fillStyle = "#2e1a0a";
    ctx.fillRect(10, 16, 28, 12);
    // Radial blast crater
    const g = ctx.createRadialGradient(24, 24, 2, 24, 24, 18);
    g.addColorStop(0, "#1a0600"); g.addColorStop(1, "#070400");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(24, 24, 18, 0, Math.PI * 2); ctx.fill();
    // Shrapnel debris
    ctx.fillStyle = "#4a3010";
    for (const [px, py, pw, ph] of [[2, 2, 8, 4], [36, 5, 10, 5], [4, 56, 12, 6], [30, 58, 14, 5]] as number[][]) {
      ctx.fillRect(px, py, pw, ph);
    }
    // Chemical stain
    ctx.fillStyle = "rgba(180,120,0,0.15)";
    ctx.beginPath(); ctx.arc(24, 44, 16, 0, Math.PI * 2); ctx.fill();
    this._finish(ctx);
  }

  private static _bakePillarDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_pillar_destroyed", 38, 120);
    if (!ctx) return;
    ctx.fillStyle = "#0a0c10";
    ctx.fillRect(0, 0, 38, 120);
    // Cracked pillar base remains
    ctx.fillStyle = "#181c24";
    ctx.fillRect(4, 60, 30, 55);
    // Rubble pile from upper half
    ctx.fillStyle = "#1e2230";
    for (const [px, py, pw, ph] of [[0, 40, 16, 22], [18, 44, 20, 18], [5, 30, 12, 14], [22, 34, 14, 10]] as number[][]) {
      ctx.fillRect(px, py, pw, ph);
    }
    // Scorch at fracture point
    const g = ctx.createRadialGradient(19, 58, 2, 19, 58, 14);
    g.addColorStop(0, "#1a1000"); g.addColorStop(1, "#08080c");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(19, 58, 14, 0, Math.PI * 2); ctx.fill();
    // Crack lines
    ctx.strokeStyle = "#2a3040"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(10, 60); ctx.lineTo(16, 85); ctx.moveTo(24, 62); ctx.lineTo(28, 90);
    ctx.stroke();
    this._finish(ctx);
  }

  private static _bakeFuelCellDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_fuel_cell_destroyed", 48, 62);
    if (!ctx) return;
    ctx.fillStyle = "#0a0600";
    ctx.fillRect(0, 0, 48, 62);
    // Melted casing
    ctx.fillStyle = "#12100a";
    ctx.fillRect(4, 8, 40, 48);
    // Explosion center — orange glow scorch
    const g = ctx.createRadialGradient(24, 30, 2, 24, 30, 22);
    g.addColorStop(0, "#2a1200"); g.addColorStop(0.6, "#180800"); g.addColorStop(1, "#06040000");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(24, 30, 22, 0, Math.PI * 2); ctx.fill();
    // Leaked fuel burn mark
    ctx.fillStyle = "rgba(200,80,0,0.12)";
    ctx.fillRect(8, 38, 32, 20);
    // Ruptured cell debris
    ctx.fillStyle = "#3a2808";
    for (const [px, py, pw, ph] of [[2, 50, 10, 6], [34, 52, 12, 7], [2, 2, 14, 5], [32, 4, 14, 5]] as number[][]) {
      ctx.fillRect(px, py, pw, ph);
    }
    this._finish(ctx);
  }

  private static _bakeBioReactorDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_bio_reactor_destroyed", 77, 77);
    if (!ctx) return;
    ctx.fillStyle = "#060c06";
    ctx.fillRect(0, 0, 77, 77);
    // Cracked reactor chamber
    ctx.fillStyle = "#0c160c";
    ctx.fillRect(8, 8, 61, 61);
    // Bio containment breach — toxic green spill
    const g = ctx.createRadialGradient(38, 38, 3, 38, 38, 28);
    g.addColorStop(0, "#081808"); g.addColorStop(0.5, "#0a1a0a"); g.addColorStop(1, "#060c06");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(38, 38, 28, 0, Math.PI * 2); ctx.fill();
    // Toxic fluid spill — faint green
    ctx.fillStyle = "rgba(0,180,20,0.10)";
    ctx.fillRect(14, 42, 50, 24);
    // Crack network
    ctx.strokeStyle = "#1a301a"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(38, 10); ctx.lineTo(30, 30); ctx.lineTo(20, 42);
    ctx.moveTo(38, 10); ctx.lineTo(50, 28); ctx.lineTo(60, 44);
    ctx.stroke();
    // Debris chunks
    ctx.fillStyle = "#0e1e0e";
    for (const [px, py, pw, ph] of [[2, 2, 12, 8], [62, 4, 12, 8], [4, 66, 14, 8], [60, 64, 14, 8]] as number[][]) {
      ctx.fillRect(px, py, pw, ph);
    }
    this._finish(ctx);
  }

  private static _bakeShieldPylonDestroyed(scene: Phaser.Scene): void {
    const ctx = this._canvas(scene, "obs_shield_pylon_destroyed", 38, 91);
    if (!ctx) return;
    ctx.fillStyle = "#080814";
    ctx.fillRect(0, 0, 38, 91);
    // Base mount remains
    ctx.fillStyle = "#0e1020";
    ctx.fillRect(4, 68, 30, 20);
    // Broken upper emitter
    ctx.fillStyle = "#10142a";
    ctx.fillRect(8, 36, 22, 32);
    // Fried emitter head — scattered
    ctx.fillStyle = "#141830";
    ctx.fillRect(6, 28, 10, 10);
    ctx.fillRect(22, 24, 12, 12);
    ctx.fillRect(2, 16, 8, 8);
    // Shield overload scorch — faint blue residue
    const g = ctx.createRadialGradient(19, 38, 2, 19, 38, 18);
    g.addColorStop(0, "#0a0a2a"); g.addColorStop(1, "#04040e");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(19, 38, 18, 0, Math.PI * 2); ctx.fill();
    // Blue energy discharge trail
    ctx.strokeStyle = "rgba(60,80,220,0.25)"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, 44); ctx.lineTo(4, 62); ctx.moveTo(28, 42); ctx.lineTo(34, 60);
    ctx.stroke();
    this._finish(ctx);
  }

  // ── Public rubble spawner — called from MapObstacles._destroyObstacle ─────

  /**
   * Spawns a rubble/scorch sprite at the obstacle's position after destruction.
   * Returns the created sprite so MapObstacles can track it.
   */
  static spawnRubble(
    scene: Phaser.Scene,
    kind: string,
    x: number, y: number, w: number, h: number,
  ): Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle {
    const texMap: Partial<Record<string, string>> = {
      crate:       "obs_crate_destroyed",
      generator:   "obs_generator_destroyed",
      terminal:    "obs_terminal_destroyed",
      reactor:     "obs_reactor_destroyed",
      barrel:      "obs_barrel_destroyed",
      pillar:      "obs_pillar_destroyed",
      fuel_cell:   "obs_fuel_cell_destroyed",
      bio_reactor: "obs_bio_reactor_destroyed",
      shield_pylon:"obs_shield_pylon_destroyed",
    };
    const key = texMap[kind] ?? "obs_crate_destroyed";
    if (scene.textures.exists(key)) {
      const s = scene.add.sprite(x + w / 2, y + h / 2, key)
        .setDisplaySize(w, h)
        .setDepth(2)
        .setAlpha(0.85);
      // Slow fade — stays as a permanent scorch mark
      scene.tweens.add({ targets: s, alpha: 0.3, duration: 8000, ease: "Linear" });
      return s;
    }
    // Fallback — generic scorch rectangle
    const r = scene.add.rectangle(x + w / 2, y + h / 2, w, h, 0x111111, 0.6).setDepth(2);
    return r;
  }
}
