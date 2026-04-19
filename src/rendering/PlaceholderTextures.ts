import Phaser from "phaser";

/**
 * PlaceholderTextures — procedural pixel-art fallback textures.
 * Called by PreloaderScene when real asset files are missing.
 */

export function generatePlaceholders(scene: Phaser.Scene): void {
    genAgent(scene);
    genPlayer(scene);
    genEnemy(scene);
    genBoss(scene);
    genGuard(scene);
    genCollector(scene);
    genResource(scene);
    genScrap(scene);
    genProjectilePlayer(scene);
    genProjectileEnemy(scene);
    genProjectileTurret(scene);
    genBackgroundTile(scene);
    genTurret(scene);
    genSawblade(scene);
    genWelder(scene);
    genObstacles(scene);
  }

  /* ── backward-compat: 16×16 blue square ── */
function genAgent(scene: Phaser.Scene): void {
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);
    g.fillStyle(0x4488ff, 1);
    g.fillRect(0, 0, 16, 16);
    g.generateTexture("agent", 16, 16);
    g.destroy();
  }

  /* ── player 64×64 elite mech warrior, green tech ── */
function genPlayer(scene: Phaser.Scene): void {
    const S = 64;
    const cx = S / 2; // 32
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // ── FEET / THRUSTER PADS ──
    g.fillStyle(0x003311, 1);
    g.fillRect(13, 57, 16, 7);   // left foot shadow
    g.fillRect(36, 57, 16, 7);   // right foot shadow
    g.fillStyle(0x006633, 1);
    g.fillRect(12, 56, 16, 7);   // left foot
    g.fillRect(36, 56, 16, 7);   // right foot
    g.fillStyle(0x009944, 1);
    g.fillRect(13, 56, 14, 4);   // left foot top
    g.fillRect(37, 56, 14, 4);   // right foot top
    // Thruster glow ports
    g.fillStyle(0x663300, 1);
    g.fillCircle(18, 62, 3);
    g.fillCircle(24, 62, 3);
    g.fillCircle(40, 62, 3);
    g.fillCircle(46, 62, 3);
    g.fillStyle(0xff6600, 1);
    g.fillCircle(18, 62, 2);
    g.fillCircle(24, 62, 2);
    g.fillCircle(40, 62, 2);
    g.fillCircle(46, 62, 2);
    g.fillStyle(0xffaa00, 1);
    g.fillCircle(18, 62, 1);
    g.fillCircle(24, 62, 1);
    g.fillCircle(40, 62, 1);
    g.fillCircle(46, 62, 1);

    // ── LEGS ──
    g.fillStyle(0x006633, 1);
    g.fillRect(15, 46, 14, 12);  // left leg outer
    g.fillRect(35, 46, 14, 12);  // right leg outer
    g.fillStyle(0x009944, 1);
    g.fillRect(16, 47, 12, 8);   // left leg inner
    g.fillRect(36, 47, 12, 8);   // right leg inner
    g.fillStyle(0x00cc66, 1);
    g.fillRect(16, 47, 5, 4);    // left highlight
    g.fillRect(36, 47, 5, 4);    // right highlight
    // Knee joints
    g.fillStyle(0x003311, 1);
    g.fillCircle(22, 51, 5);
    g.fillCircle(42, 51, 5);
    g.fillStyle(0x006633, 1);
    g.fillCircle(22, 51, 4);
    g.fillCircle(42, 51, 4);
    g.fillStyle(0x009944, 1);
    g.fillCircle(22, 51, 3);
    g.fillCircle(42, 51, 3);
    g.fillStyle(0x00cc66, 1);
    g.fillCircle(21, 50, 1.5);
    g.fillCircle(41, 50, 1.5);

    // ── LEFT SHOULDER CANNON ──
    g.fillStyle(0x003311, 1);
    g.fillRect(0, 20, 16, 12);
    g.fillStyle(0x006633, 1);
    g.fillRect(1, 21, 14, 10);
    g.fillStyle(0x009944, 1);
    g.fillRect(2, 22, 12, 8);
    g.fillStyle(0x00cc66, 1);
    g.fillRect(2, 22, 5, 3);
    g.fillStyle(0x003311, 1);
    g.fillRect(0, 25, 3, 4);     // barrel tip
    g.fillStyle(0x00ff88, 0.6);
    g.fillCircle(1, 27, 2);      // barrel glow

    // ── RIGHT SHOULDER CANNON ──
    g.fillStyle(0x003311, 1);
    g.fillRect(48, 20, 16, 12);
    g.fillStyle(0x006633, 1);
    g.fillRect(49, 21, 14, 10);
    g.fillStyle(0x009944, 1);
    g.fillRect(50, 22, 12, 8);
    g.fillStyle(0x006633, 1);
    g.fillRect(57, 22, 5, 8);
    g.fillStyle(0x003311, 1);
    g.fillRect(61, 25, 3, 4);    // barrel tip
    g.fillStyle(0x00ff88, 0.6);
    g.fillCircle(63, 27, 2);     // barrel glow

    // ── SHOULDER ARMOR PLATES ──
    g.fillStyle(0x006633, 1);
    g.fillRect(10, 16, 12, 20);  // left plate shadow
    g.fillRect(42, 16, 12, 20);  // right plate shadow
    g.fillStyle(0x009944, 1);
    g.fillRect(11, 17, 10, 18);
    g.fillRect(43, 17, 10, 18);
    g.fillStyle(0x00cc66, 1);
    g.fillRect(11, 17, 4, 6);    // left highlight
    g.fillRect(43, 17, 4, 6);    // right highlight
    g.fillStyle(0x009944, 1);
    g.fillRect(19, 17, 3, 18);   // right-edge shadow of left plate
    g.fillStyle(0x006633, 1);
    g.fillRect(42, 17, 3, 18);   // left-edge shadow of right plate

    // ── MAIN TORSO ──
    g.fillStyle(0x003311, 1);
    g.fillRect(12, 16, 40, 34);  // shadow
    g.fillStyle(0x009944, 1);
    g.fillRect(13, 17, 38, 32);  // mid tone
    g.fillStyle(0x00cc66, 1);
    g.fillRect(14, 18, 34, 26);  // lighter center
    g.fillStyle(0x009944, 1);
    g.fillRect(44, 18, 8, 26);   // right shadow
    g.fillRect(14, 40, 34, 8);   // bottom shadow
    g.fillStyle(0x00dd77, 1);
    g.fillRect(15, 19, 9, 4);    // top-left highlight

    // ── CHEST REACTOR (bright green circles, inner glow) ──
    g.fillStyle(0x001a0d, 1);
    g.fillCircle(cx, 32, 11);
    g.fillStyle(0x003311, 1);
    g.fillCircle(cx, 32, 10);
    g.fillStyle(0x006633, 1);
    g.fillCircle(cx, 32, 8);
    g.fillStyle(0x009944, 1);
    g.fillCircle(cx, 32, 6);
    g.fillStyle(0x00cc66, 1);
    g.fillCircle(cx, 32, 4);
    g.fillStyle(0x00ff88, 1);
    g.fillCircle(cx, 32, 2.5);
    g.fillStyle(0x88ffcc, 1);
    g.fillCircle(cx - 1, 31, 1.2);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - 1, 31, 0.5);

    // ── HEAD ──
    g.fillStyle(0x003311, 1);
    g.fillRect(19, 3, 26, 14);
    g.fillStyle(0x009944, 1);
    g.fillRect(20, 4, 24, 12);
    g.fillStyle(0x00cc66, 1);
    g.fillRect(21, 5, 20, 10);
    g.fillStyle(0x009944, 1);
    g.fillRect(37, 5, 5, 10);    // right shadow
    g.fillStyle(0x00dd77, 1);
    g.fillRect(22, 6, 6, 2);     // highlight bevel

    // ── HEXAGONAL VISOR (glowing cyan) ──
    g.fillStyle(0x001111, 1);
    g.fillRect(23, 7, 18, 9);
    g.fillStyle(0x003333, 1);
    g.fillRect(24, 8, 16, 7);
    g.fillStyle(0x006666, 1);
    g.fillRect(25, 9, 14, 5);
    g.fillStyle(0x00aaaa, 1);
    g.fillRect(26, 10, 12, 3);
    g.fillStyle(0x00dddd, 1);
    g.fillRect(27, 11, 10, 2);
    g.fillStyle(0x00ffff, 1);
    g.fillRect(28, 11, 8, 1);
    g.fillStyle(0x88ffff, 1);
    g.fillRect(28, 11, 4, 1);
    // Hex corner cuts
    g.fillStyle(0x003311, 1);
    g.fillRect(23, 7, 2, 2);
    g.fillRect(39, 7, 2, 2);
    g.fillRect(23, 14, 2, 2);
    g.fillRect(39, 14, 2, 2);

    // ── ANTENNA with red warning light ──
    g.fillStyle(0x006633, 1);
    g.fillRect(30, 0, 4, 4);
    g.fillStyle(0x009944, 1);
    g.fillRect(31, 0, 2, 3);
    g.fillStyle(0xff0000, 1);
    g.fillCircle(32, 1, 2.5);
    g.fillStyle(0xff6666, 1);
    g.fillCircle(31, 1, 1);

    // ── CIRCUIT LINE PANEL DETAILS ──
    g.lineStyle(1, 0x008844, 0.8);
    g.lineBetween(14, 28, 26, 28);
    g.lineBetween(38, 28, 50, 28);
    g.lineBetween(14, 39, 26, 39);
    g.lineBetween(38, 39, 50, 39);
    g.lineBetween(14, 28, 14, 39);
    g.lineBetween(50, 28, 50, 39);
    // Circuit nodes
    g.fillStyle(0x00ff88, 1);
    g.fillCircle(14, 28, 1.5);
    g.fillCircle(50, 28, 1.5);
    g.fillCircle(14, 39, 1.5);
    g.fillCircle(50, 39, 1.5);
    g.fillCircle(26, 28, 1.5);
    g.fillCircle(38, 28, 1.5);

    // ── ARMOR RIVETS ──
    g.fillStyle(0x44ffaa, 1);
    const pRivets: number[][] = [
      [15, 20], [47, 20], [15, 44], [47, 44], [3, 24], [61, 24],
    ];
    for (const [rx, ry] of pRivets) {
      g.fillCircle(rx, ry, 1.5);
      g.fillStyle(0x88ffcc, 1);
      g.fillCircle(rx - 0.5, ry - 0.5, 0.5);
      g.fillStyle(0x44ffaa, 1);
    }

    // ── OUTLINES ──
    g.lineStyle(1, 0x003311, 1);
    g.strokeRect(13, 17, 38, 32);  // torso
    g.strokeRect(19, 3, 26, 14);   // head
    g.strokeRect(10, 16, 12, 20);  // left shoulder
    g.strokeRect(42, 16, 12, 20);  // right shoulder
    g.strokeRect(0, 20, 16, 12);   // left cannon mount
    g.strokeRect(48, 20, 16, 12);  // right cannon mount
    g.strokeRect(15, 46, 14, 12);  // left leg
    g.strokeRect(35, 46, 14, 12);  // right leg
    g.strokeRect(12, 56, 16, 7);   // left foot
    g.strokeRect(36, 56, 16, 7);   // right foot

    g.generateTexture("player", S, S);
    g.destroy();
  }

  /* ── enemy 48×48 aggressive combat drone, red ── */
function genEnemy(scene: Phaser.Scene): void {
    const S = 48;
    const cx = 24;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // ── BODY CORE — hexagonal chassis ──
    g.fillStyle(0x881111, 1);
    g.fillRect(cx - 12, 8, 24, 28);
    g.fillStyle(0xaa2222, 1);
    g.fillRect(cx - 10, 10, 20, 24);
    // Chassis highlight
    g.fillStyle(0xcc3333, 1);
    g.fillRect(cx - 8, 10, 8, 4);

    // ── LEGS — 4 mechanical spider legs ──
    g.fillStyle(0x661111, 1);
    // Top-left leg
    g.fillRect(cx - 18, 10, 8, 4);
    g.fillRect(cx - 20, 6, 4, 8);
    // Top-right leg
    g.fillRect(cx + 10, 10, 8, 4);
    g.fillRect(cx + 16, 6, 4, 8);
    // Bottom-left leg
    g.fillRect(cx - 18, 30, 8, 4);
    g.fillRect(cx - 20, 30, 4, 8);
    // Bottom-right leg
    g.fillRect(cx + 10, 30, 8, 4);
    g.fillRect(cx + 16, 30, 4, 8);
    // Leg joints
    g.fillStyle(0xcc4444, 1);
    g.fillCircle(cx - 12, 12, 2);
    g.fillCircle(cx + 12, 12, 2);
    g.fillCircle(cx - 12, 32, 2);
    g.fillCircle(cx + 12, 32, 2);

    // ── CORRUPTION VEINS — glowing red lines ──
    g.lineStyle(1, 0xff4444, 0.7);
    g.lineBetween(cx - 8, 14, cx - 16, 8);
    g.lineBetween(cx + 8, 14, cx + 16, 8);
    g.lineBetween(cx - 8, 30, cx - 16, 36);
    g.lineBetween(cx + 8, 30, cx + 16, 36);

    // ── CENTRAL EYE — red scanner ──
    g.fillStyle(0x220000, 1);
    g.fillCircle(cx, 22, 8);
    g.fillStyle(0x880000, 1);
    g.fillCircle(cx, 22, 7);
    g.fillStyle(0xcc0000, 1);
    g.fillCircle(cx, 22, 5);
    g.fillStyle(0xff0000, 1);
    g.fillCircle(cx, 22, 3.5);
    g.fillStyle(0xff4444, 1);
    g.fillCircle(cx - 1, 21, 1.5);
    g.fillStyle(0xff9999, 1);
    g.fillCircle(cx - 1, 21, 0.6);

    // ── ANTENNA — top sensor ──
    g.fillStyle(0x661111, 1);
    g.fillRect(cx - 1, 2, 2, 8);
    g.fillStyle(0xff2222, 1);
    g.fillCircle(cx, 2, 2);

    // ── WEAPON ARM — front mounted ──
    g.fillStyle(0x441111, 1);
    g.fillRect(cx - 3, 36, 6, 8);
    g.fillStyle(0x882222, 1);
    g.fillRect(cx - 2, 37, 4, 6);
    g.fillStyle(0xff4400, 0.6);
    g.fillCircle(cx, 44, 2);

    // ── PANEL LINES ──
    g.lineStyle(1, 0x661111, 0.6);
    g.lineBetween(cx, 10, cx, 34);
    g.lineBetween(cx - 10, 22, cx + 10, 22);

    // ── RIVETS ──
    g.fillStyle(0xff6644, 1);
    const rivets: number[][] = [[cx - 8, 14], [cx + 8, 14], [cx - 8, 30], [cx + 8, 30]];
    for (const [rx, ry] of rivets) {
      g.fillCircle(rx, ry, 1.2);
    }

    g.generateTexture("enemy", S, S);
    g.destroy();
  }

  /* ── guard 52×52 heavy armored tank-bot, purple ── */
function genGuard(scene: Phaser.Scene): void {
    const S = 52;
    const cx = 26;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // ── CATERPILLAR TREADS ──
    g.fillStyle(0x220044, 1);
    g.fillRect(2, 38, 16, 11);               // left housing shadow
    g.fillStyle(0x441177, 1);
    g.fillRect(2, 38, 15, 10);
    g.fillStyle(0x330066, 1);
    g.fillRect(2, 38, 15, 4);                // top tread band
    g.lineStyle(1, 0x6633aa, 0.8);
    for (let tx = 4; tx <= 15; tx += 3) g.lineBetween(tx, 39, tx, 47);
    g.fillStyle(0x5511aa, 1);
    g.fillCircle(5, 47, 2.5);
    g.fillCircle(10, 47, 2.5);
    g.fillCircle(15, 47, 2.5);
    g.fillStyle(0x9955cc, 1);
    g.fillCircle(5, 47, 1.5);
    g.fillCircle(10, 47, 1.5);
    g.fillCircle(15, 47, 1.5);
    // Right tread
    g.fillStyle(0x220044, 1);
    g.fillRect(34, 38, 16, 11);
    g.fillStyle(0x441177, 1);
    g.fillRect(35, 38, 15, 10);
    g.fillStyle(0x330066, 1);
    g.fillRect(35, 38, 15, 4);
    g.lineStyle(1, 0x6633aa, 0.8);
    for (let tx = 37; tx <= 48; tx += 3) g.lineBetween(tx, 39, tx, 47);
    g.fillStyle(0x5511aa, 1);
    g.fillCircle(37, 47, 2.5);
    g.fillCircle(42, 47, 2.5);
    g.fillCircle(47, 47, 2.5);
    g.fillStyle(0x9955cc, 1);
    g.fillCircle(37, 47, 1.5);
    g.fillCircle(42, 47, 1.5);
    g.fillCircle(47, 47, 1.5);

    // ── MAIN ARMORED BODY ──
    g.fillStyle(0x330055, 1);
    g.fillRect(8, 14, 36, 26);
    g.fillStyle(0x7722cc, 1);
    g.fillRect(7, 13, 38, 26);
    g.fillStyle(0x9933ee, 1);
    g.fillRect(8, 14, 34, 20);
    g.fillStyle(0x5511aa, 1);
    g.fillRect(38, 14, 7, 25);               // right shadow
    g.fillRect(8, 30, 34, 8);               // bottom shadow
    g.fillStyle(0xaa55ff, 1);
    g.fillRect(9, 15, 8, 4);                 // highlight

    // ── SHOULDER PLATES ──
    g.fillStyle(0x5511aa, 1);
    g.fillRect(0, 16, 10, 18);
    g.fillStyle(0x7722cc, 1);
    g.fillRect(0, 15, 9, 17);
    g.fillStyle(0x9933ee, 1);
    g.fillRect(1, 16, 6, 12);
    g.fillStyle(0xaa55ff, 1);
    g.fillRect(1, 16, 3, 4);
    g.fillStyle(0x5511aa, 1);
    g.fillRect(42, 16, 10, 18);
    g.fillStyle(0x7722cc, 1);
    g.fillRect(43, 15, 9, 17);
    g.fillStyle(0x9933ee, 1);
    g.fillRect(43, 16, 5, 12);
    g.fillStyle(0x5511aa, 1);
    g.fillRect(47, 16, 5, 14);               // right shadow
    g.fillStyle(0xaa55ff, 1);
    g.fillRect(43, 16, 3, 4);

    // ── FRONT SHIELD PLATE with energy pattern ──
    g.fillStyle(0x440088, 1);
    g.fillRect(10, 3, 32, 12);
    g.fillStyle(0x6611bb, 1);
    g.fillRect(9, 2, 34, 12);
    g.fillStyle(0x8833dd, 1);
    g.fillRect(10, 3, 30, 9);
    g.fillStyle(0x9944ee, 1);
    g.fillRect(11, 4, 16, 6);
    // Energy stripes
    g.fillStyle(0xbb66ff, 0.5);
    g.fillRect(12, 4, 28, 1);
    g.fillRect(12, 7, 28, 1);
    g.fillRect(12, 10, 28, 1);
    // Energy nodes
    g.fillStyle(0xdd88ff, 1);
    g.fillCircle(17, 7, 1.5);
    g.fillCircle(26, 7, 1.5);
    g.fillCircle(35, 7, 1.5);
    g.fillStyle(0xeeccff, 1);
    g.fillCircle(17, 7, 0.6);
    g.fillCircle(26, 7, 0.6);
    g.fillCircle(35, 7, 0.6);

    // ── GUN BARREL pointing up ──
    g.fillStyle(0x330055, 1);
    g.fillRect(cx - 4, 0, 8, 4);
    g.fillStyle(0x7722cc, 1);
    g.fillRect(cx - 3, 0, 6, 4);
    g.fillStyle(0x9933ee, 1);
    g.fillRect(cx - 2, 0, 4, 3);
    g.fillStyle(0xbb55ff, 1);
    g.fillRect(cx - 2, 0, 2, 2);
    g.fillStyle(0x8800cc, 1);
    g.fillRect(cx - 4, 0, 8, 2);             // muzzle cap
    g.fillStyle(0xcc88ff, 0.8);
    g.fillRect(cx - 3, 0, 6, 1);             // muzzle glow

    // ── VISOR SLIT ──
    g.fillStyle(0x220033, 1);
    g.fillRect(11, 18, 30, 8);
    g.fillStyle(0x6611aa, 1);
    g.fillRect(12, 19, 28, 6);
    g.fillStyle(0x9933cc, 1);
    g.fillRect(13, 20, 26, 4);
    g.fillStyle(0xcc88ff, 1);
    g.fillRect(14, 21, 24, 2);
    g.fillStyle(0xeeccff, 1);
    g.fillRect(14, 21, 10, 1);

    // ── HEX PLATE DETAILS ──
    g.lineStyle(1, 0x5511aa, 0.5);
    for (let hy = 26; hy <= 36; hy += 5) {
      for (let hx = 10; hx <= 42; hx += 8) {
        g.strokeRect(hx, hy, 6, 4);
      }
    }
    // Panel lines
    g.lineStyle(1, 0x440088, 1);
    g.lineBetween(7, 28, 45, 28);
    g.lineBetween(cx, 14, cx, 38);
    // Rivets
    g.fillStyle(0xbb77ff, 1);
    const gRivets: number[][] = [
      [10, 16], [42, 16], [10, 36], [42, 36],
      [2, 18], [50, 18], [12, 4], [40, 4],
    ];
    for (const [rx, ry] of gRivets) {
      g.fillCircle(rx, ry, 1.5);
      g.fillStyle(0xddaaff, 1);
      g.fillCircle(rx - 0.5, ry - 0.5, 0.5);
      g.fillStyle(0xbb77ff, 1);
    }
    // Center indicator
    g.fillStyle(0x9922ff, 1);
    g.fillCircle(cx, 32, 3);
    g.fillStyle(0xcc88ff, 1);
    g.fillCircle(cx, 32, 2);
    g.fillStyle(0xeeccff, 1);
    g.fillCircle(cx - 0.5, 31.5, 1);
    // Outline
    g.lineStyle(1, 0x220044, 1);
    g.strokeRect(7, 13, 38, 26);
    g.strokeRect(9, 2, 34, 12);
    g.strokeRect(0, 15, 9, 17);
    g.strokeRect(43, 15, 9, 17);
    g.strokeRect(2, 38, 15, 10);
    g.strokeRect(35, 38, 15, 10);
    g.strokeRect(cx - 3, 0, 6, 4);

    g.generateTexture("guard", S, S);
    g.destroy();
  }

  /* ── collector 42×42 agile scavenger bot, teal ── */
function genCollector(scene: Phaser.Scene): void {
    const S = 42;
    const cx = 21, cy = 21;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // ── SPIDER LEGS (4 visible thin lines) ──
    g.lineStyle(2, 0x006644, 1);
    g.lineBetween(16, 20, 4, 10);
    g.lineBetween(4, 10, 2, 3);
    g.lineBetween(26, 20, 38, 10);
    g.lineBetween(38, 10, 40, 3);
    g.lineBetween(15, 25, 3, 35);
    g.lineBetween(3, 35, 1, 41);
    g.lineBetween(27, 25, 39, 35);
    g.lineBetween(39, 35, 41, 41);
    // Leg joints
    g.fillStyle(0x00ddaa, 1);
    g.fillCircle(4, 10, 2);
    g.fillCircle(38, 10, 2);
    g.fillCircle(3, 35, 2);
    g.fillCircle(39, 35, 2);
    g.fillStyle(0x00ffcc, 1);
    g.fillCircle(4, 10, 1);
    g.fillCircle(38, 10, 1);
    g.fillCircle(3, 35, 1);
    g.fillCircle(39, 35, 1);

    // ── CARGO HOLD (on back) ──
    g.fillStyle(0x003322, 1);
    g.fillRect(14, 29, 14, 9);
    g.fillStyle(0x006644, 1);
    g.fillRect(15, 29, 12, 8);
    g.fillStyle(0x009966, 1);
    g.fillRect(15, 29, 6, 3);
    g.lineStyle(1, 0x004433, 1);
    g.lineBetween(14, 33, 28, 33);
    g.fillStyle(0x00ffcc, 0.7);
    g.fillCircle(18, 31, 1);
    g.fillCircle(23, 31, 1);
    g.fillCircle(18, 35, 1);
    g.fillCircle(23, 35, 1);

    // ── MAIN ROUND BODY ──
    g.fillStyle(0x002211, 1);
    g.fillCircle(cx, cy, 12);
    g.fillStyle(0x004433, 1);
    g.fillCircle(cx, cy, 11);
    g.fillStyle(0x008866, 1);
    g.fillCircle(cx, cy, 10);
    g.fillStyle(0x00aa88, 1);
    g.fillCircle(cx, cy, 8);
    g.fillStyle(0x00cc99, 1);
    g.fillCircle(cx - 2, cy - 2, 5);
    g.fillStyle(0x00ddaa, 1);
    g.fillCircle(cx - 3, cy - 3, 3);

    // ── LARGE SENSOR EYE ──
    g.fillStyle(0x001a0d, 1);
    g.fillCircle(cx, cy, 7);
    g.fillStyle(0x003322, 1);
    g.fillCircle(cx, cy, 6);
    g.fillStyle(0x006644, 1);
    g.fillCircle(cx, cy, 5);
    g.fillStyle(0x00ccaa, 1);
    g.fillCircle(cx, cy, 3.5);
    g.fillStyle(0x00ffcc, 1);
    g.fillCircle(cx, cy, 2);
    g.fillStyle(0x88ffee, 1);
    g.fillCircle(cx - 1, cy - 1, 1);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - 1, cy - 1, 0.4);

    // ── MAGNETIC CLAW ARM (pointing forward/up) ──
    g.fillStyle(0x005533, 1);
    g.fillRect(cx - 3, 10, 6, 9);            // arm segment
    g.fillStyle(0x00aa88, 1);
    g.fillRect(cx - 2, 11, 4, 7);
    // Claw housing
    g.fillStyle(0x003322, 1);
    g.fillRect(cx - 5, 2, 10, 9);
    g.fillStyle(0x006644, 1);
    g.fillRect(cx - 4, 3, 8, 7);
    // Magnetic glow
    g.fillStyle(0x00ffcc, 0.35);
    g.fillCircle(cx, 5, 5);
    g.fillStyle(0x00ffcc, 0.7);
    g.fillCircle(cx, 5, 3);
    g.fillStyle(0x88ffee, 1);
    g.fillCircle(cx, 5, 1.5);
    // Claw prongs
    g.fillStyle(0x00aa88, 1);
    g.fillRect(cx - 6, 1, 2, 6);             // left prong
    g.fillRect(cx + 4, 1, 2, 6);             // right prong
    g.fillStyle(0x00ffcc, 1);
    g.fillRect(cx - 6, 1, 2, 2);             // left tip
    g.fillRect(cx + 4, 1, 2, 2);             // right tip

    // Outline
    g.lineStyle(1, 0x002211, 1);
    g.strokeCircle(cx, cy, 11);
    g.strokeRect(14, 29, 14, 9);
    g.strokeRect(cx - 5, 2, 10, 9);

    g.generateTexture("collector", S, S);
    g.destroy();
  }

  /* ── backward-compat: 16×16 yellow circle ── */
function genResource(scene: Phaser.Scene): void {
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);
    g.fillStyle(0xffcc00, 1);
    g.fillCircle(8, 8, 6);
    g.generateTexture("resource", 16, 16);
    g.destroy();
  }

  /* ── scrap 18×18 golden gear, 10 teeth ── */
function genScrap(scene: Phaser.Scene): void {
    const S = 18;
    const cx = 9, cy = 9;
    const teeth = 10;
    const outerR = 8.5;
    const innerR = 6;
    const toothW = 2.5;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // Shadow teeth
    g.fillStyle(0xaa8800, 1);
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const tx = cx + Math.cos(angle) * outerR - toothW / 2 + 0.5;
      const ty = cy + Math.sin(angle) * outerR - toothW / 2 + 0.5;
      g.fillRect(tx, ty, toothW, toothW);
    }
    // Main gear teeth
    g.fillStyle(0xffcc00, 1);
    for (let i = 0; i < teeth; i++) {
      const angle = (i / teeth) * Math.PI * 2;
      const tx = cx + Math.cos(angle) * outerR - toothW / 2;
      const ty = cy + Math.sin(angle) * outerR - toothW / 2;
      g.fillRect(tx, ty, toothW, toothW);
    }
    // Central disc
    g.fillStyle(0xcc9900, 1);
    g.fillCircle(cx, cy, innerR);
    g.fillStyle(0xffcc00, 1);
    g.fillCircle(cx, cy, innerR - 0.5);
    g.fillStyle(0xffee44, 1);
    g.fillCircle(cx - 1.5, cy - 1.5, 3);    // highlight lobe
    // Inner hub
    g.fillStyle(0xcc9900, 1);
    g.fillCircle(cx, cy, 3);
    g.fillStyle(0x886600, 1);
    g.fillCircle(cx, cy, 2);
    g.fillStyle(0xffee55, 1);
    g.fillCircle(cx - 0.5, cy - 0.5, 0.6);

    g.generateTexture("scrap", S, S);
    g.destroy();
  }

  /* ── projectile_player 14×14 energy bolt, green diamond ── */
function genProjectilePlayer(scene: Phaser.Scene): void {
    const S = 14;
    const cx = 7, cy = 7;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    g.fillStyle(0x00ff88, 0.2);
    g.fillCircle(cx, cy, 6.5);              // outer glow
    g.fillStyle(0x007733, 1);
    g.fillTriangle(cx - 3, cy, cx, cy + 6, cx + 3, cy);
    g.fillTriangle(cx - 3, cy, cx, cy - 6, cx + 3, cy);
    g.fillStyle(0x00ff88, 1);
    g.fillTriangle(cx - 2, cy, cx, cy + 4, cx + 2, cy);
    g.fillTriangle(cx - 2, cy, cx, cy - 4, cx + 2, cy);
    g.fillStyle(0xaaffdd, 1);
    g.fillTriangle(cx - 1, cy, cx, cy + 2, cx + 1, cy);
    g.fillTriangle(cx - 1, cy, cx, cy - 2, cx + 1, cy);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx, cy, 0.8);

    g.generateTexture("projectile_player", S, S);
    g.destroy();
  }

  /* ── projectile_enemy 14×14 energy shard, red-orange spike ── */
function genProjectileEnemy(scene: Phaser.Scene): void {
    const S = 14;
    const cx = 7, cy = 7;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    g.fillStyle(0xff2200, 0.2);
    g.fillCircle(cx, cy, 6.5);              // outer glow
    g.fillStyle(0x660000, 1);
    g.fillTriangle(cx - 4, cy, cx, cy + 7, cx + 4, cy);
    g.fillTriangle(cx - 3, cy, cx, cy - 7, cx + 3, cy);
    g.fillStyle(0xff2200, 1);
    g.fillTriangle(cx - 2, cy, cx, cy + 5, cx + 2, cy);
    g.fillTriangle(cx - 2, cy, cx, cy - 5, cx + 2, cy);
    g.fillStyle(0xff6644, 1);
    g.fillTriangle(cx - 1, cy, cx, cy + 3, cx + 1, cy);
    g.fillTriangle(cx - 1, cy, cx, cy - 3, cx + 1, cy);
    // Side shards
    g.fillStyle(0xff4422, 1);
    g.fillTriangle(cx, cy - 1, cx + 5, cy, cx, cy + 1);
    g.fillTriangle(cx, cy - 1, cx - 5, cy, cx, cy + 1);
    g.fillStyle(0xff9988, 1);
    g.fillCircle(cx, cy, 1);

    g.generateTexture("projectile_enemy", S, S);
    g.destroy();
  }

  /* ── projectile_turret 14×14 heavy round, orange ── */
function genProjectileTurret(scene: Phaser.Scene): void {
    const S = 14;
    const cx = 7, cy = 7;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    g.fillStyle(0xff6600, 0.3);
    g.fillCircle(cx, cy, 6.5);              // outer glow
    g.fillStyle(0x884400, 1);
    g.fillCircle(cx, cy, 5.5);              // metal jacket
    g.fillStyle(0xff6600, 1);
    g.fillCircle(cx, cy, 4.5);
    g.fillStyle(0xffaa00, 1);
    g.fillCircle(cx, cy, 3);
    g.fillStyle(0xffcc44, 1);
    g.fillCircle(cx, cy, 1.8);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - 0.5, cy - 0.5, 0.8);
    g.lineStyle(1, 0xffcc44, 0.8);
    g.strokeCircle(cx, cy, 5);              // rim highlight

    g.generateTexture("projectile_turret", S, S);
    g.destroy();
  }

  /* ── background_tile 64×64 industrial floor with circuit traces ── */
function genBackgroundTile(scene: Phaser.Scene): void {
    const S = 64;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // Base fill
    g.fillStyle(0x0d0d1a, 1);
    g.fillRect(0, 0, S, S);
    // Panel variation per quadrant
    g.fillStyle(0x0f0f1e, 1);
    g.fillRect(0, 0, 32, 32);
    g.fillStyle(0x0b0b16, 1);
    g.fillRect(32, 32, 32, 32);
    g.fillStyle(0x0e0e1c, 1);
    g.fillRect(32, 0, 32, 32);
    g.fillStyle(0x0c0c18, 1);
    g.fillRect(0, 32, 32, 32);

    // Circuit board traces (thin cyan lines branching)
    g.lineStyle(1, 0x003344, 0.8);
    g.lineBetween(0, 16, 40, 16);
    g.lineBetween(0, 48, 32, 48);
    g.lineBetween(24, 32, 64, 32);
    g.lineBetween(16, 16, 16, 32);
    g.lineBetween(24, 16, 24, 8);
    g.lineBetween(8, 48, 8, 56);
    g.lineBetween(40, 32, 40, 48);
    g.lineBetween(48, 32, 48, 16);
    g.lineBetween(56, 32, 56, 48);

    // Circuit pads at junctions
    g.fillStyle(0x004466, 1);
    const pads: number[][] = [
      [16, 16], [24, 16], [16, 32], [40, 32],
      [40, 48], [8, 48], [8, 56], [48, 16],
      [48, 32], [56, 32], [56, 48],
    ];
    for (const [px, py] of pads) {
      g.fillCircle(px, py, 1.5);
      g.fillStyle(0x0066aa, 1);
      g.fillCircle(px - 0.5, py - 0.5, 0.5);
      g.fillStyle(0x004466, 1);
    }

    // Hex grid overlay
    g.lineStyle(1, 0x1a1a30, 0.6);
    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 4; col++) {
        const hx = col * 16 + (row % 2) * 8;
        const hy = row * 14 - 4;
        g.strokeRect(hx + 2, hy + 1, 12, 12);
      }
    }

    // Metal plate grid seams
    g.lineStyle(1, 0x1e1e2e, 0.5);
    for (let y = 0; y <= S; y += 16) g.lineBetween(0, y, S, y);
    for (let x = 0; x <= S; x += 16) g.lineBetween(x, 0, x, S);

    // Rivet dots at corners
    g.fillStyle(0x252535, 1);
    for (let y = 0; y <= S; y += 16) {
      for (let x = 0; x <= S; x += 16) {
        g.fillCircle(x, y, 1.5);
        g.fillStyle(0x353545, 1);
        g.fillCircle(x - 0.5, y - 0.5, 0.5);
        g.fillStyle(0x252535, 1);
      }
    }

    // Scorch / wear marks
    g.fillStyle(0x050508, 0.7);
    g.fillCircle(12, 52, 4);
    g.fillCircle(52, 12, 3);
    g.fillCircle(36, 44, 3.5);
    g.fillStyle(0x080810, 0.5);
    g.fillCircle(12, 52, 2);
    g.fillCircle(52, 12, 1.5);

    g.generateTexture("background_tile", S, S);
    g.destroy();
  }

  /* ── turret 48×48 defensive platform, grey/orange ── */
function genTurret(scene: Phaser.Scene): void {
    const S = 48;
    const cx = 24, cy = 24;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // ── HEXAGONAL BASE PLATFORM ──
    g.fillStyle(0x222222, 1);
    g.fillCircle(cx, cy + 5, 20);
    g.fillStyle(0x444444, 1);
    g.fillCircle(cx, cy + 4, 19);
    g.fillStyle(0x555555, 1);
    g.fillCircle(cx, cy + 4, 18);
    g.fillStyle(0x666666, 1);
    g.fillCircle(cx, cy + 4, 17);
    g.fillStyle(0x777777, 1);
    g.fillRect(8, cy + 4 - 10, 28, 18);    // flat center fill
    // Trim hex corners
    g.fillStyle(0x444444, 1);
    g.fillRect(5, cy - 7, 5, 5);
    g.fillRect(38, cy - 7, 5, 5);
    g.fillRect(5, cy + 6, 5, 5);
    g.fillRect(38, cy + 6, 5, 5);
    // Ring grooves
    g.lineStyle(1, 0x444444, 1);
    g.strokeCircle(cx, cy + 4, 13);
    g.lineStyle(1, 0x555555, 1);
    g.strokeCircle(cx, cy + 4, 8);
    // 6 bolts on hex perimeter
    g.fillStyle(0x888888, 1);
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 6;
      const bx = cx + Math.cos(angle) * 15;
      const by = (cy + 4) + Math.sin(angle) * 15;
      g.fillCircle(bx, by, 2);
      g.fillStyle(0x999999, 1);
      g.fillCircle(bx - 0.5, by - 0.5, 0.8);
      g.fillStyle(0x888888, 1);
    }

    // ── HEAT VENTS on sides ──
    g.fillStyle(0x444444, 1);
    g.fillRect(4, cy, 6, 8);
    g.fillRect(38, cy, 6, 8);
    g.fillStyle(0x333333, 1);
    g.fillRect(4, cy + 1, 5, 1);
    g.fillRect(4, cy + 3, 5, 1);
    g.fillRect(4, cy + 5, 5, 1);
    g.fillRect(38, cy + 1, 5, 1);
    g.fillRect(38, cy + 3, 5, 1);
    g.fillRect(38, cy + 5, 5, 1);
    g.fillStyle(0xff6600, 0.4);
    g.fillRect(4, cy + 1, 5, 1);
    g.fillRect(4, cy + 3, 5, 1);
    g.fillRect(38, cy + 1, 5, 1);
    g.fillRect(38, cy + 3, 5, 1);

    // ── BARREL ASSEMBLY (pointing north) ──
    g.fillStyle(0x444444, 1);
    g.fillRect(cx - 6, 3, 12, 30);          // housing shadow
    g.fillStyle(0x666666, 1);
    g.fillRect(cx - 5, 2, 10, 30);          // housing body
    g.fillStyle(0x777777, 1);
    g.fillRect(cx - 4, 3, 6, 26);
    g.fillStyle(0x888888, 1);
    g.fillRect(cx - 4, 3, 3, 8);            // highlight
    // Barrel tube
    g.fillStyle(0x333333, 1);
    g.fillRect(cx - 3, 2, 6, 22);
    g.fillStyle(0x555555, 1);
    g.fillRect(cx - 2, 3, 4, 20);
    // Barrel reinforcement rings
    g.fillStyle(0x555555, 1);
    g.fillRect(cx - 6, 12, 12, 3);
    g.fillRect(cx - 6, 20, 12, 3);
    g.fillStyle(0x777777, 1);
    g.fillRect(cx - 5, 12, 10, 1);
    g.fillRect(cx - 5, 20, 10, 1);
    // Muzzle tip (orange accent)
    g.fillStyle(0xff6600, 1);
    g.fillRect(cx - 5, 0, 10, 4);
    g.fillStyle(0xffaa00, 1);
    g.fillRect(cx - 4, 1, 8, 2);
    g.fillStyle(0x444444, 1);
    g.fillRect(cx - 3, 0, 6, 2);            // muzzle opening (dark)

    // ── TARGETING LASER (thin red line from barrel) ──
    g.lineStyle(1, 0xff0000, 0.8);
    g.lineBetween(cx, 0, cx, 3);

    // ── SENSOR / RADAR RING ──
    g.fillStyle(0x444444, 1);
    g.fillCircle(cx, cy + 4, 7);
    g.fillStyle(0xff6600, 1);
    g.fillCircle(cx, cy + 4, 5);
    g.fillStyle(0xffaa00, 1);
    g.fillCircle(cx, cy + 4, 3.5);
    g.fillStyle(0xffcc44, 1);
    g.fillCircle(cx - 1, cy + 3, 1.5);
    g.lineStyle(1, 0xffaa00, 0.5);
    g.strokeCircle(cx, cy + 4, 10);
    // Panel lines on base
    g.lineStyle(1, 0x444444, 1);
    g.lineBetween(cx - 5, cy, cx + 5, cy);
    g.lineBetween(cx - 13, cy + 4, cx - 8, cy + 4);
    g.lineBetween(cx + 8, cy + 4, cx + 13, cy + 4);
    // Outline
    g.lineStyle(1, 0x222222, 1);
    g.strokeRect(cx - 5, 2, 10, 30);
    g.strokeRect(cx - 5, 0, 10, 4);

    g.generateTexture("turret", S, S);
    g.destroy();
  }

  /* ── sawblade 44×44 spinning melee killer, silver/red ── */
function genSawblade(scene: Phaser.Scene): void {
    const S = 44;
    const cx = 22, cy = 22;
    const outerR = 21;
    const innerR = 13;
    const teethCount = 12;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // Shadow teeth (offset)
    g.fillStyle(0x555555, 0.5);
    for (let i = 0; i < teethCount; i++) {
      const a1 = (i / teethCount) * Math.PI * 2;
      const a2 = ((i + 0.5) / teethCount) * Math.PI * 2;
      const a3 = ((i + 1) / teethCount) * Math.PI * 2;
      g.fillTriangle(
        cx + Math.cos(a1) * innerR + 0.8, cy + Math.sin(a1) * innerR + 0.8,
        cx + Math.cos(a2) * outerR + 0.8, cy + Math.sin(a2) * outerR + 0.8,
        cx + Math.cos(a3) * innerR + 0.8, cy + Math.sin(a3) * innerR + 0.8
      );
    }
    // Dark base teeth
    g.fillStyle(0x888888, 1);
    for (let i = 0; i < teethCount; i++) {
      const a1 = (i / teethCount) * Math.PI * 2;
      const a2 = ((i + 0.5) / teethCount) * Math.PI * 2;
      const a3 = ((i + 1) / teethCount) * Math.PI * 2;
      g.fillTriangle(
        cx + Math.cos(a1) * innerR, cy + Math.sin(a1) * innerR,
        cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR,
        cx + Math.cos(a3) * innerR, cy + Math.sin(a3) * innerR
      );
    }
    // Main silver teeth
    g.fillStyle(0xcccccc, 1);
    for (let i = 0; i < teethCount; i++) {
      const a1 = (i / teethCount) * Math.PI * 2;
      const a2 = ((i + 0.45) / teethCount) * Math.PI * 2;
      const a3 = ((i + 0.9) / teethCount) * Math.PI * 2;
      g.fillTriangle(
        cx + Math.cos(a1) * innerR, cy + Math.sin(a1) * innerR,
        cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR,
        cx + Math.cos(a3) * innerR, cy + Math.sin(a3) * innerR
      );
    }
    // Bright leading-edge highlights
    g.fillStyle(0xdddddd, 1);
    for (let i = 0; i < teethCount; i++) {
      const a1 = (i / teethCount) * Math.PI * 2;
      const a2 = ((i + 0.25) / teethCount) * Math.PI * 2;
      const amid = ((i + 0.45) / teethCount) * Math.PI * 2;
      g.fillTriangle(
        cx + Math.cos(a1) * (innerR + 2), cy + Math.sin(a1) * (innerR + 2),
        cx + Math.cos(a2) * (outerR - 1), cy + Math.sin(a2) * (outerR - 1),
        cx + Math.cos(amid) * (innerR + 1), cy + Math.sin(amid) * (innerR + 1)
      );
    }
    // Speed motion lines between teeth
    g.lineStyle(1, 0xaaaaaa, 0.4);
    for (let i = 0; i < teethCount; i++) {
      const a = ((i + 0.5) / teethCount) * Math.PI * 2;
      g.lineBetween(
        cx + Math.cos(a) * (innerR - 3), cy + Math.sin(a) * (innerR - 3),
        cx + Math.cos(a) * (innerR + 2), cy + Math.sin(a) * (innerR + 2)
      );
    }
    // Outer ring
    g.fillStyle(0x777777, 1);
    g.fillCircle(cx, cy, innerR);
    // Mid ring
    g.fillStyle(0x555555, 1);
    g.fillCircle(cx, cy, innerR - 2);
    // Inner hub
    g.fillStyle(0x888888, 1);
    g.fillCircle(cx, cy, 9);
    g.fillStyle(0x777777, 1);
    g.fillCircle(cx, cy, 8);
    g.fillStyle(0x666666, 1);
    g.fillCircle(cx - 1, cy - 1, 6);
    // Hub bolts (4)
    g.fillStyle(0xaaaaaa, 1);
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const bx = cx + Math.cos(angle) * 6.5;
      const by = cy + Math.sin(angle) * 6.5;
      g.fillCircle(bx, by, 1.5);
      g.fillStyle(0xcccccc, 1);
      g.fillCircle(bx - 0.5, by - 0.5, 0.5);
      g.fillStyle(0xaaaaaa, 1);
    }
    // Glowing red core eye
    g.fillStyle(0x550000, 1);
    g.fillCircle(cx, cy, 4.5);
    g.fillStyle(0xcc0000, 1);
    g.fillCircle(cx, cy, 3.5);
    g.fillStyle(0xff0000, 1);
    g.fillCircle(cx, cy, 2.5);
    g.fillStyle(0xff4444, 1);
    g.fillCircle(cx - 0.7, cy - 0.7, 1.2);
    g.fillStyle(0xff8888, 1);
    g.fillCircle(cx - 0.7, cy - 0.7, 0.5);

    g.lineStyle(1, 0x333333, 1);
    g.strokeCircle(cx, cy, innerR);

    g.generateTexture("sawblade", S, S);
    g.destroy();
  }

  /* ── welder 46×46 support repair bot, yellow/gold ── */
function genWelder(scene: Phaser.Scene): void {
    const S = 46;
    const cx = 23;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // ── MAIN BODY ──
    g.fillStyle(0x443300, 1);
    g.fillRect(8, 10, 24, 28);              // shadow
    g.fillStyle(0xcc8800, 1);
    g.fillRect(7, 9, 24, 28);
    g.fillStyle(0xffaa00, 1);
    g.fillRect(8, 10, 20, 22);
    g.fillStyle(0xcc8800, 1);
    g.fillRect(24, 10, 7, 22);              // right shadow
    g.fillRect(8, 28, 20, 8);               // bottom shadow
    g.fillStyle(0xffdd00, 1);
    g.fillRect(9, 11, 7, 4);               // highlight

    // ── SAFETY WARNING STRIPES (yellow + black chevron belt) ──
    g.fillStyle(0xffdd00, 1);
    g.fillRect(8, 28, 24, 8);              // yellow belt base
    g.fillStyle(0x111100, 1);
    for (let s = 0; s < 6; s++) {
      for (let d = 0; d < 8; d++) {
        if ((s + Math.floor(d * 0.5)) % 2 === 0) {
          g.fillRect(8 + s * 4 + Math.floor(d * 0.5), 28 + d, 2, 1);
        }
      }
    }

    // ── UTILITY ARMS ──
    g.fillStyle(0xcc8800, 1);
    g.fillRect(2, 14, 8, 6);
    g.fillStyle(0xffaa00, 1);
    g.fillRect(2, 14, 6, 4);
    g.fillStyle(0x886600, 1);
    g.fillRect(8, 14, 2, 6);
    g.fillStyle(0xcc8800, 1);
    g.fillRect(37, 14, 6, 6);
    g.fillStyle(0xffaa00, 1);
    g.fillRect(37, 14, 4, 4);

    // ── WELDING TORCH ARM ──
    g.fillStyle(0x886600, 1);
    g.fillCircle(31, 19, 4);                // arm joint
    g.fillStyle(0xcc8800, 1);
    g.fillCircle(31, 19, 3);
    g.fillStyle(0xffaa00, 1);
    g.fillCircle(31, 19, 2);
    // Arm body extending right
    g.fillStyle(0x886600, 1);
    g.fillRect(31, 16, 13, 7);
    g.fillStyle(0xcc8800, 1);
    g.fillRect(31, 16, 12, 6);
    g.fillStyle(0xffaa00, 1);
    g.fillRect(31, 16, 6, 3);
    g.fillStyle(0x665500, 1);
    g.fillRect(37, 21, 7, 3);               // nozzle
    g.fillStyle(0x998800, 1);
    g.fillRect(37, 21, 6, 2);

    // ── WELDING ARC / SPARK at tip ──
    g.fillStyle(0xffaa00, 0.6);
    g.fillCircle(44, 21, 5);
    g.fillStyle(0xffcc00, 0.9);
    g.fillCircle(44, 21, 3.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(44, 21, 2);
    g.fillStyle(0xffffaa, 1);
    g.fillCircle(44, 21, 1);
    // Spark rays
    g.lineStyle(1, 0xffff00, 0.8);
    g.lineBetween(44, 16, 44, 19);
    g.lineBetween(44, 23, 44, 26);
    g.lineBetween(40, 21, 42, 21);
    g.lineBetween(46, 19, 44, 21);
    g.lineBetween(46, 23, 44, 21);

    // ── HEAD ──
    g.fillStyle(0x443300, 1);
    g.fillRect(10, 2, 16, 8);
    g.fillStyle(0xcc8800, 1);
    g.fillRect(9, 1, 16, 8);
    g.fillStyle(0xffaa00, 1);
    g.fillRect(10, 2, 12, 6);
    g.fillStyle(0xcc8800, 1);
    g.fillRect(20, 2, 5, 6);
    // Visor
    g.fillStyle(0x222200, 1);
    g.fillRect(11, 3, 12, 5);
    g.fillStyle(0x006655, 1);
    g.fillRect(12, 4, 10, 3);
    g.fillStyle(0x00cccc, 1);
    g.fillRect(13, 4, 8, 2);
    g.fillStyle(0xaaffff, 1);
    g.fillRect(13, 4, 4, 1);

    // ── TOOL BELT GADGET BUTTONS ──
    g.fillStyle(0xff4400, 1);
    g.fillCircle(12, 18, 1.5);
    g.fillStyle(0x00cc88, 1);
    g.fillCircle(17, 18, 1.5);
    g.fillStyle(0x4488ff, 1);
    g.fillCircle(22, 18, 1.5);
    g.fillStyle(0xffffff, 0.8);
    g.fillCircle(12, 17.5, 0.5);
    g.fillCircle(17, 17.5, 0.5);
    g.fillCircle(22, 17.5, 0.5);
    // Panel lines
    g.lineStyle(1, 0xaa7700, 1);
    g.lineBetween(8, 16, 31, 16);
    g.lineBetween(cx - 8, 10, cx - 8, 28);
    // Rivets
    g.fillStyle(0xffdd66, 1);
    const wRivets: number[][] = [[9, 11], [29, 11], [9, 36], [29, 36]];
    for (const [rx, ry] of wRivets) {
      g.fillCircle(rx, ry, 1.5);
      g.fillStyle(0xffee99, 1);
      g.fillCircle(rx - 0.5, ry - 0.5, 0.5);
      g.fillStyle(0xffdd66, 1);
    }
    // Outline
    g.lineStyle(1, 0x443300, 1);
    g.strokeRect(7, 9, 24, 28);
    g.strokeRect(9, 1, 16, 8);
    g.strokeRect(31, 16, 12, 6);
    g.strokeRect(2, 14, 8, 6);

    g.generateTexture("welder", S, S);
    g.destroy();
  }

  /* ── boss 72×72 massive machine overlord, dark red/metal ── */
function genBoss(scene: Phaser.Scene): void {
    const S = 72;
    const cx = 36;
    const g = scene.add.graphics({ x: 0, y: 0 }).setVisible(false);

    // ── DEEP SHADOW LAYER ──
    g.fillStyle(0x111111, 1);
    g.fillRect(10, 10, 54, 62);

    // ── 4 CORNER WEAPON / ARM MOUNTS ──
    // Top-left
    g.fillStyle(0x222222, 1);
    g.fillRect(2, 6, 18, 14);
    g.fillStyle(0x444444, 1);
    g.fillRect(3, 7, 16, 12);
    g.fillStyle(0x555555, 1);
    g.fillRect(3, 7, 8, 5);
    g.fillStyle(0x333333, 1);
    g.fillRect(14, 7, 5, 12);
    g.fillStyle(0xff4400, 1);
    g.fillRect(2, 2, 6, 6);
    g.fillStyle(0xff8800, 0.8);
    g.fillCircle(5, 5, 2.5);
    // Top-right
    g.fillStyle(0x222222, 1);
    g.fillRect(52, 6, 18, 14);
    g.fillStyle(0x444444, 1);
    g.fillRect(53, 7, 16, 12);
    g.fillStyle(0x555555, 1);
    g.fillRect(53, 7, 8, 5);
    g.fillStyle(0x333333, 1);
    g.fillRect(60, 7, 8, 12);
    g.fillStyle(0xff4400, 1);
    g.fillRect(64, 2, 6, 6);
    g.fillStyle(0xff8800, 0.8);
    g.fillCircle(67, 5, 2.5);
    // Bottom-left
    g.fillStyle(0x222222, 1);
    g.fillRect(2, 54, 18, 14);
    g.fillStyle(0x444444, 1);
    g.fillRect(3, 55, 16, 12);
    g.fillStyle(0x555555, 1);
    g.fillRect(3, 55, 8, 4);
    g.fillStyle(0x333333, 1);
    g.fillRect(14, 55, 5, 12);
    g.fillStyle(0xff4400, 1);
    g.fillRect(3, 66, 12, 5);
    g.fillStyle(0xff8800, 1);
    g.fillRect(5, 67, 8, 4);
    g.fillStyle(0xffcc00, 1);
    g.fillCircle(9, 69, 2);
    // Bottom-right
    g.fillStyle(0x222222, 1);
    g.fillRect(52, 54, 18, 14);
    g.fillStyle(0x444444, 1);
    g.fillRect(53, 55, 16, 12);
    g.fillStyle(0x555555, 1);
    g.fillRect(53, 55, 8, 4);
    g.fillStyle(0x333333, 1);
    g.fillRect(62, 55, 8, 12);
    g.fillStyle(0xff4400, 1);
    g.fillRect(57, 66, 12, 5);
    g.fillStyle(0xff8800, 1);
    g.fillRect(59, 67, 8, 4);
    g.fillStyle(0xffcc00, 1);
    g.fillCircle(63, 69, 2);

    // ── MAIN CENTRAL BODY ──
    g.fillStyle(0x110000, 1);
    g.fillRect(12, 12, 48, 50);
    g.fillStyle(0x333333, 1);
    g.fillRect(13, 13, 46, 48);
    g.fillStyle(0x555555, 1);
    g.fillRect(14, 14, 38, 38);
    g.fillStyle(0x333333, 1);
    g.fillRect(48, 14, 11, 47);             // right shadow
    g.fillRect(14, 48, 38, 12);             // bottom shadow
    g.fillStyle(0x666666, 1);
    g.fillRect(15, 15, 10, 5);             // top-left highlight

    // ── EXPOSED GEARS at joints ──
    // Top-left gear
    g.fillStyle(0x442200, 1);
    g.fillCircle(20, 18, 5);
    g.fillStyle(0x886622, 1);
    g.fillCircle(20, 18, 3);
    g.fillStyle(0xaa8833, 1);
    g.fillCircle(19, 17, 1.5);
    g.fillStyle(0x664400, 1);
    for (let i = 0; i < 6; i++) {
      const ga = (i / 6) * Math.PI * 2;
      g.fillRect(20 + Math.cos(ga) * 4 - 1, 18 + Math.sin(ga) * 4 - 1, 2, 2);
    }
    // Top-right gear
    g.fillStyle(0x442200, 1);
    g.fillCircle(52, 18, 5);
    g.fillStyle(0x886622, 1);
    g.fillCircle(52, 18, 3);
    g.fillStyle(0xaa8833, 1);
    g.fillCircle(51, 17, 1.5);
    g.fillStyle(0x664400, 1);
    for (let i = 0; i < 6; i++) {
      const ga = (i / 6) * Math.PI * 2;
      g.fillRect(52 + Math.cos(ga) * 4 - 1, 18 + Math.sin(ga) * 4 - 1, 2, 2);
    }

    // ── SKULL-LIKE VISOR / HEAD PLATE (2 glowing red eyes) ──
    g.fillStyle(0x110000, 1);
    g.fillRect(17, 14, 38, 16);
    g.fillStyle(0x330000, 1);
    g.fillRect(18, 15, 36, 14);
    g.fillStyle(0x550000, 1);
    g.fillRect(19, 16, 34, 12);
    // Left eye socket
    g.fillStyle(0x000000, 1);
    g.fillRect(20, 17, 14, 10);
    g.fillStyle(0xff0000, 1);
    g.fillRect(21, 18, 12, 8);
    g.fillStyle(0xff4444, 1);
    g.fillRect(22, 19, 8, 5);
    g.fillStyle(0xff8888, 1);
    g.fillRect(22, 19, 4, 2);
    // Skull socket corner cuts
    g.fillStyle(0x110000, 1);
    g.fillRect(20, 17, 2, 2);
    g.fillRect(32, 17, 2, 2);
    g.fillRect(20, 25, 2, 2);
    g.fillRect(32, 25, 2, 2);
    // Right eye socket
    g.fillStyle(0x000000, 1);
    g.fillRect(38, 17, 14, 10);
    g.fillStyle(0xff0000, 1);
    g.fillRect(39, 18, 12, 8);
    g.fillStyle(0xff4444, 1);
    g.fillRect(40, 19, 8, 5);
    g.fillStyle(0x880000, 1);
    g.fillRect(46, 19, 5, 8);              // right eye shadow
    g.fillStyle(0xff8888, 1);
    g.fillRect(40, 19, 4, 2);
    g.fillStyle(0x110000, 1);
    g.fillRect(38, 17, 2, 2);
    g.fillRect(50, 17, 2, 2);
    g.fillRect(38, 25, 2, 2);
    g.fillRect(50, 25, 2, 2);
    // Nose bridge
    g.fillStyle(0x330000, 1);
    g.fillRect(34, 19, 4, 8);

    // ── ENERGY CORE (center of body) ──
    g.fillStyle(0x110000, 1);
    g.fillCircle(cx, 44, 13);
    g.fillStyle(0x330000, 1);
    g.fillCircle(cx, 44, 12);
    g.fillStyle(0x660000, 1);
    g.fillCircle(cx, 44, 10);
    g.fillStyle(0xcc0000, 1);
    g.fillCircle(cx, 44, 8);
    g.fillStyle(0xff0000, 1);
    g.fillCircle(cx, 44, 6);
    g.fillStyle(0xff4400, 1);
    g.fillCircle(cx, 44, 4);
    g.fillStyle(0xff8800, 1);
    g.fillCircle(cx, 44, 2.5);
    g.fillStyle(0xffcc00, 1);
    g.fillCircle(cx, 44, 1.5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(cx - 0.5, 43.5, 0.8);

    // ── ENERGY CANNON pointing upward ──
    g.fillStyle(0x110000, 1);
    g.fillRect(cx - 5, 0, 10, 14);
    g.fillStyle(0x333333, 1);
    g.fillRect(cx - 4, 0, 8, 14);
    g.fillStyle(0x555555, 1);
    g.fillRect(cx - 3, 0, 5, 10);
    g.fillStyle(0x666666, 1);
    g.fillRect(cx - 3, 0, 2, 5);
    // Energy charge rings
    g.fillStyle(0xcc0000, 1);
    g.fillRect(cx - 5, 3, 10, 2);
    g.fillStyle(0xff0000, 1);
    g.fillRect(cx - 4, 3, 8, 1);
    g.fillStyle(0xcc0000, 1);
    g.fillRect(cx - 5, 8, 10, 2);
    g.fillStyle(0xff0000, 1);
    g.fillRect(cx - 4, 8, 8, 1);
    // Muzzle
    g.fillStyle(0xff4400, 1);
    g.fillRect(cx - 5, 0, 10, 3);
    g.fillStyle(0xff8800, 1);
    g.fillCircle(cx, 1, 3);
    g.fillStyle(0xffcc00, 1);
    g.fillCircle(cx, 1, 1.5);

    // ── HEAVY PANEL LINES ──
    g.lineStyle(1, 0x220000, 1);
    g.lineBetween(13, cx, 59, cx);
    g.lineBetween(cx, 30, cx, 61);
    g.lineBetween(13, 30, 59, 30);
    g.lineBetween(13, 50, 59, 50);
    g.lineBetween(20, 30, 20, 60);
    g.lineBetween(52, 30, 52, 60);

    // ── ARMOR RIVETS ──
    g.fillStyle(0xff4444, 1);
    const bRivets: number[][] = [
      [14, 14], [58, 14], [14, 60], [58, 60],
      [14, 36], [58, 36], [36, 30], [36, 60],
      [22, 14], [50, 14], [22, 60], [50, 60],
    ];
    for (const [rx, ry] of bRivets) {
      g.fillCircle(rx, ry, 2);
      g.fillStyle(0xff8888, 1);
      g.fillCircle(rx - 0.5, ry - 0.5, 0.8);
      g.fillStyle(0xff4444, 1);
    }

    // ── OUTLINES ──
    g.lineStyle(2, 0x110000, 1);
    g.strokeRect(13, 13, 46, 48);          // main body
    g.lineStyle(1, 0x110000, 1);
    g.strokeRect(2, 6, 18, 14);
    g.strokeRect(52, 6, 18, 14);
    g.strokeRect(2, 54, 18, 14);
    g.strokeRect(52, 54, 18, 14);
    g.strokeRect(cx - 4, 0, 8, 14);        // cannon

    g.generateTexture("boss", S, S);
    g.destroy();
  }

  // ─── MAP OBSTACLE TEXTURES ─────────────────────────────────
function genObstacles(scene: Phaser.Scene): void {
    _genCrate(scene);
    _genPipeH(scene);
    _genPipeV(scene);
    _genGenerator(scene);
    _genBarrel(scene);
    _genPillar(scene);
    // City environment textures
    _genWallTile(scene);
    _genServerRack(scene);
    _genTerminal(scene);
    _genReactor(scene);
    _genCooling(scene);
    _genWorkbench(scene);
    _genAntenna(scene);
    _genFloorGrate(scene);
    _genCableH(scene);
    _genCableV(scene);
    _genWarningStripe(scene);
    _genPlasmaConduit(scene);
    _genBlastFurnace(scene);
    _genAmmoRack(scene);
    _genContainmentTank(scene);
    _genAllFloorTiles(scene);
    _genWallPanel(scene);
    _genDoorFrame(scene);

    // ─── Conveyor Belt ───
    let g: Phaser.GameObjects.Graphics = scene.add.graphics().setVisible(false);
    g.fillStyle(0x444455, 1);
    g.fillRect(0, 0, 80, 24);
    g.fillStyle(0x333344, 1);
    g.fillRect(0, 0, 80, 3); g.fillRect(0, 21, 80, 3); // rails
    g.fillStyle(0xffaa00, 0.6);
    // Arrow chevrons
    for (let ax = 8; ax < 72; ax += 20) {
      g.fillTriangle(ax, 12, ax + 8, 6, ax + 8, 18);
    }
    g.lineStyle(1, 0x555566, 0.5);
    g.strokeRect(0, 0, 80, 24);
    g.generateTexture("env_conveyor_belt", 80, 24);
    g.destroy();

    // ─── Tesla Coil ───
    g = scene.add.graphics().setVisible(false);
    // Base plate
    g.fillStyle(0x445566, 1);
    g.fillRect(4, 40, 24, 8);
    g.fillStyle(0x556677, 1);
    g.fillRect(6, 42, 20, 4);
    // Metal rod
    g.fillStyle(0x667788, 1);
    g.fillRect(13, 12, 6, 30);
    g.fillStyle(0x778899, 1);
    g.fillRect(14, 14, 4, 26);
    // Coil rings
    g.lineStyle(1, 0x8899aa, 0.7);
    g.strokeCircle(16, 20, 8);
    g.strokeCircle(16, 28, 7);
    g.strokeCircle(16, 36, 6);
    // Top sphere (glowing blue)
    g.fillStyle(0x2244aa, 1);
    g.fillCircle(16, 8, 8);
    g.fillStyle(0x4488ff, 1);
    g.fillCircle(16, 8, 6);
    g.fillStyle(0x88bbff, 1);
    g.fillCircle(16, 7, 3);
    g.fillStyle(0xccddff, 0.8);
    g.fillCircle(15, 6, 1.5);
    // Electric sparks
    g.lineStyle(1, 0x88ccff, 0.6);
    g.lineBetween(10, 6, 4, 2);
    g.lineBetween(22, 6, 28, 2);
    g.lineBetween(16, 2, 16, -2);
    g.generateTexture("env_tesla_coil", 32, 48);
    g.destroy();

    // ─── Data Core ───
    g = scene.add.graphics().setVisible(false);
    // Outer shell
    g.fillStyle(0x112233, 1);
    g.fillRect(4, 4, 32, 32);
    g.fillStyle(0x1a3344, 1);
    g.fillRect(6, 6, 28, 28);
    // Circuit lines
    g.lineStyle(1, 0x00aacc, 0.5);
    g.lineBetween(8, 12, 20, 12); g.lineBetween(20, 12, 20, 8);
    g.lineBetween(32, 16, 24, 16); g.lineBetween(24, 16, 24, 24);
    g.lineBetween(12, 32, 12, 24); g.lineBetween(12, 24, 16, 24);
    g.lineBetween(8, 28, 16, 28); g.lineBetween(28, 8, 28, 16);
    // Core center (bright)
    g.fillStyle(0x005577, 1);
    g.fillCircle(20, 20, 8);
    g.fillStyle(0x0088aa, 1);
    g.fillCircle(20, 20, 6);
    g.fillStyle(0x00ccff, 1);
    g.fillCircle(20, 20, 4);
    g.fillStyle(0x88eeff, 0.8);
    g.fillCircle(19, 19, 2);
    // Edge frame
    g.lineStyle(1, 0x00ccff, 0.3);
    g.strokeRect(4, 4, 32, 32);
    g.generateTexture("env_data_core", 40, 40);
    g.destroy();

    // ─── Ventilation Fan ───
    g = scene.add.graphics().setVisible(false);
    // Outer casing
    g.fillStyle(0x556666, 1);
    g.fillCircle(22, 22, 20);
    g.fillStyle(0x445555, 1);
    g.fillCircle(22, 22, 18);
    // Fan blades (4 blades)
    g.fillStyle(0x778888, 0.9);
    for (let b = 0; b < 4; b++) {
      const angle = (b / 4) * Math.PI * 2;
      const bx = 22 + Math.cos(angle) * 4;
      const by = 22 + Math.sin(angle) * 4;
      const ex = 22 + Math.cos(angle) * 15;
      const ey = 22 + Math.sin(angle) * 15;
      const perp = angle + Math.PI / 2;
      const pw = 5;
      g.fillTriangle(
        bx + Math.cos(perp) * 2, by + Math.sin(perp) * 2,
        bx - Math.cos(perp) * 2, by - Math.sin(perp) * 2,
        ex + Math.cos(perp) * pw, ey + Math.sin(perp) * pw
      );
    }
    // Center hub
    g.fillStyle(0x667777, 1);
    g.fillCircle(22, 22, 5);
    g.fillStyle(0x889999, 1);
    g.fillCircle(22, 22, 3);
    // Outer ring
    g.lineStyle(2, 0x667777, 0.8);
    g.strokeCircle(22, 22, 19);
    g.generateTexture("env_ventilation_fan", 44, 44);
    g.destroy();

    // ─── Hologram Table ───
    g = scene.add.graphics().setVisible(false);
    // Table surface
    g.fillStyle(0x223333, 1);
    g.fillRect(4, 16, 48, 20);
    g.fillStyle(0x1a2a2a, 1);
    g.fillRect(6, 18, 44, 16);
    // Table legs
    g.fillStyle(0x334444, 1);
    g.fillRect(8, 34, 4, 6); g.fillRect(44, 34, 4, 6);
    // Holographic projection (cyan glow above table)
    g.fillStyle(0x00ffcc, 0.15);
    g.fillRect(12, 4, 32, 14);
    g.fillStyle(0x00ffcc, 0.25);
    g.fillRect(16, 8, 24, 8);
    // Hologram scan lines
    g.lineStyle(1, 0x00ffcc, 0.3);
    for (let hy = 5; hy < 16; hy += 3) {
      g.moveTo(14, hy); g.lineTo(42, hy);
    }
    g.strokePath();
    // Display dot
    g.fillStyle(0x88ffee, 0.6);
    g.fillCircle(28, 11, 3);
    // Edge trim
    g.lineStyle(1, 0x00aa88, 0.4);
    g.strokeRect(4, 16, 48, 20);
    g.generateTexture("env_hologram_table", 56, 40);
    g.destroy();

    // ─── Fuel Cell ───
    g = scene.add.graphics().setVisible(false);
    // Canister body
    g.fillStyle(0x664422, 1);
    g.fillRect(6, 6, 16, 24);
    g.fillStyle(0x885533, 1);
    g.fillRect(8, 8, 12, 20);
    // Top cap
    g.fillStyle(0x776633, 1);
    g.fillRect(8, 4, 12, 4);
    // Bottom cap
    g.fillStyle(0x776633, 1);
    g.fillRect(8, 28, 12, 4);
    // Hazard stripe
    g.fillStyle(0xffaa00, 0.6);
    g.fillRect(8, 14, 12, 3);
    g.fillStyle(0x332200, 0.6);
    g.fillRect(8, 17, 12, 2);
    g.fillStyle(0xffaa00, 0.6);
    g.fillRect(8, 19, 12, 3);
    // Center glow (orange-red)
    g.fillStyle(0xff6600, 0.5);
    g.fillCircle(14, 18, 5);
    g.fillStyle(0xff8844, 0.7);
    g.fillCircle(14, 17, 3);
    // Warning symbol (!)
    g.fillStyle(0xff4400, 0.8);
    g.fillRect(13, 10, 2, 4);
    g.fillRect(13, 15, 2, 1);
    g.generateTexture("env_fuel_cell", 28, 36);
    g.destroy();

    // ─── Shield Pylon ───
    g = scene.add.graphics().setVisible(false);
    // Base
    g.fillStyle(0x334466, 1);
    g.fillRect(8, 40, 16, 8);
    g.fillStyle(0x445577, 1);
    g.fillRect(10, 42, 12, 4);
    // Pillar shaft
    g.fillStyle(0x445577, 1);
    g.fillRect(12, 14, 8, 28);
    g.fillStyle(0x556688, 1);
    g.fillRect(13, 16, 6, 24);
    // Shield ring at top (glowing blue)
    g.lineStyle(2, 0x4488ff, 0.8);
    g.strokeCircle(16, 10, 10);
    g.lineStyle(1, 0x88bbff, 0.4);
    g.strokeCircle(16, 10, 13);
    // Energy core
    g.fillStyle(0x2266cc, 1);
    g.fillCircle(16, 10, 5);
    g.fillStyle(0x4488ff, 1);
    g.fillCircle(16, 10, 3.5);
    g.fillStyle(0xaaccff, 0.7);
    g.fillCircle(15, 9, 1.5);
    // Pylon lights
    g.fillStyle(0x4488ff, 0.6);
    g.fillCircle(16, 22, 1.5);
    g.fillCircle(16, 30, 1.5);
    g.fillCircle(16, 38, 1.5);
    g.generateTexture("env_shield_pylon", 32, 48);
    g.destroy();
  }

  /** 48×48 industrial steel crate — rusty iron, orange hazard stripe */
function _genCrate(scene: Phaser.Scene): void {
    const S = 48;
    const g = scene.add.graphics().setVisible(false);
    // Shadow base
    g.fillStyle(0x1a0800, 1);
    g.fillRect(2, 2, S, S);
    // Rust-iron body
    g.fillStyle(0x4a2a10, 1);
    g.fillRect(0, 0, S, S);
    g.fillStyle(0x603318, 1);
    g.fillRect(0, 0, S, S - 4);
    // Top panel lighter
    g.fillStyle(0x7a4422, 1);
    g.fillRect(2, 2, S - 4, 8);
    // Right / bottom shadow
    g.fillStyle(0x2e1608, 1);
    g.fillRect(S - 10, 2, 8, S - 4);
    g.fillRect(2, S - 10, S - 4, 8);
    // Rust wear patches
    g.fillStyle(0x361408, 0.65);
    g.fillCircle(14, 36, 7);
    g.fillCircle(38, 14, 5);
    g.fillCircle(30, 42, 4);
    // Metal banding
    g.fillStyle(0x2e1608, 1);
    g.fillRect(0, 14, S, 4);
    g.fillRect(0, S - 18, S, 4);
    // Hazard warning stripe
    g.fillStyle(0xff8800, 0.55);
    g.fillRect(0, S - 14, S, 10);
    g.fillStyle(0x220c00, 0.55);
    for (let s = 0; s < 7; s++) {
      if (s % 2 === 0) g.fillRect(s * 7, S - 14, 7, 10);
    }
    // Cross straps (welded seams)
    g.lineStyle(2, 0x3a1c0c, 0.80);
    g.lineBetween(4, 4, S - 4, S - 4);
    g.lineBetween(S - 4, 4, 4, S - 4);
    // Corner rivets
    g.fillStyle(0x8a5a30, 1);
    for (const [bx, by] of [[5, 5], [S - 5, 5], [5, S - 5], [S - 5, S - 5]]) {
      g.fillCircle(bx, by, 3);
      g.fillStyle(0x3a1c0c, 1);
      g.fillCircle(bx, by, 1.5);
      g.fillStyle(0x8a5a30, 1);
    }
    // Outline
    g.lineStyle(2, 0x1a0800, 1);
    g.strokeRect(1, 1, S - 2, S - 2);
    g.generateTexture("obs_crate", S, S);
    g.destroy();
  }

  /** 128×24 horizontal pipe */
function _genPipeH(scene: Phaser.Scene): void {
    const W = 128, H = 24;
    const g = scene.add.graphics().setVisible(false);
    // Pipe body
    g.fillStyle(0x556677, 1);
    g.fillRect(0, 4, W, H - 8);
    // Highlight
    g.fillStyle(0x778899, 0.6);
    g.fillRect(0, 5, W, 4);
    // Shadow
    g.fillStyle(0x334455, 0.6);
    g.fillRect(0, H - 9, W, 4);
    // Joints
    g.fillStyle(0x667788, 1);
    for (let x = 0; x < W; x += 32) {
      g.fillRect(x, 2, 6, H - 4);
      g.fillStyle(0x445566, 1);
      g.fillRect(x + 2, 4, 2, H - 8);
      g.fillStyle(0x667788, 1);
    }
    g.lineStyle(1, 0x445566, 0.8);
    g.strokeRect(0, 3, W, H - 6);
    g.generateTexture("obs_pipe_h", W, H);
    g.destroy();
  }

  /** 24×128 vertical pipe */
function _genPipeV(scene: Phaser.Scene): void {
    const W = 24, H = 128;
    const g = scene.add.graphics().setVisible(false);
    g.fillStyle(0x556677, 1);
    g.fillRect(4, 0, W - 8, H);
    g.fillStyle(0x778899, 0.6);
    g.fillRect(5, 0, 4, H);
    g.fillStyle(0x334455, 0.6);
    g.fillRect(W - 9, 0, 4, H);
    // Joints
    g.fillStyle(0x667788, 1);
    for (let y = 0; y < H; y += 32) {
      g.fillRect(2, y, W - 4, 6);
      g.fillStyle(0x445566, 1);
      g.fillRect(4, y + 2, W - 8, 2);
      g.fillStyle(0x667788, 1);
    }
    g.lineStyle(1, 0x445566, 0.8);
    g.strokeRect(3, 0, W - 6, H);
    g.generateTexture("obs_pipe_v", W, H);
    g.destroy();
  }

  /** 56×56 destructible power generator — dark steel, orange energy core */
function _genGenerator(scene: Phaser.Scene): void {
    const S = 56;
    const cx = S / 2;
    const g = scene.add.graphics().setVisible(false);
    // Shadow base
    g.fillStyle(0x110800, 1);
    g.fillRect(4, 4, S - 8, S - 8);
    // Main housing — dark charcoal metal
    g.fillStyle(0x2a1a0a, 1);
    g.fillRect(5, 5, S - 10, S - 10);
    g.fillStyle(0x3a2410, 1);
    g.fillRect(6, 6, S - 12, S - 12);
    // Top highlight panel
    g.fillStyle(0x4a3418, 1);
    g.fillRect(7, 7, S - 14, 10);
    // Right / bottom shadow
    g.fillStyle(0x1a0e06, 1);
    g.fillRect(S - 18, 7, 10, S - 14);
    g.fillRect(7, S - 18, S - 14, 10);
    // Warning hazard stripe
    g.fillStyle(0xffaa00, 0.70);
    g.fillRect(6, 36, S - 12, 6);
    g.fillStyle(0x221100, 1);
    for (let s = 0; s < 12; s++) {
      if (s % 2 === 0) g.fillRect(6 + s * 4, 36, 4, 6);
    }
    // Exhaust vent slots
    g.fillStyle(0x0e0704, 1);
    for (let v = 0; v < 3; v++) {
      g.fillRect(8, 13 + v * 5, 12, 3);
      g.fillRect(S - 20, 13 + v * 5, 12, 3);
    }
    // Energy core — orange/amber glow
    g.fillStyle(0x220800, 1);
    g.fillCircle(cx, cx, 13);
    g.fillStyle(0x661a00, 1);
    g.fillCircle(cx, cx, 11);
    g.fillStyle(0xcc4400, 0.90);
    g.fillCircle(cx, cx, 9);
    g.fillStyle(0xff6600, 1);
    g.fillCircle(cx, cx, 7);
    g.fillStyle(0xff9900, 1);
    g.fillCircle(cx, cx, 5);
    g.fillStyle(0xffcc44, 0.90);
    g.fillCircle(cx, cx, 3);
    g.fillStyle(0xffffff, 0.70);
    g.fillCircle(cx - 1, cx - 1, 1.2);
    // Corner bolts
    g.fillStyle(0x775533, 1);
    const boltPos = [[7, 7], [S - 7, 7], [7, S - 7], [S - 7, S - 7]];
    for (const [bx, by] of boltPos) {
      g.fillCircle(bx, by, 2.5);
      g.fillStyle(0x998866, 1);
      g.fillCircle(bx - 0.5, by - 0.5, 0.8);
      g.fillStyle(0x775533, 1);
    }
    // Outline
    g.lineStyle(2, 0x110800, 1);
    g.strokeRect(4, 4, S - 8, S - 8);
    g.generateTexture("obs_generator", S, S);
    g.destroy();
  }

  /** 32×32 destructible barrel */
function _genBarrel(scene: Phaser.Scene): void {
    const S = 32;
    const cx = S / 2;
    const g = scene.add.graphics().setVisible(false);
    // Body
    g.fillStyle(0x886633, 1);
    g.fillCircle(cx, cx, 14);
    // Highlight
    g.fillStyle(0xaa8844, 0.6);
    g.fillCircle(cx - 3, cx - 3, 8);
    // Metal bands
    g.lineStyle(2, 0x665522, 0.9);
    g.strokeCircle(cx, cx, 14);
    g.strokeCircle(cx, cx, 10);
    // Hazard symbol
    g.fillStyle(0xff6600, 0.8);
    g.fillTriangle(cx, cx - 6, cx - 5, cx + 4, cx + 5, cx + 4);
    g.fillStyle(0x221100, 1);
    g.fillCircle(cx, cx + 1, 2);
    g.generateTexture("obs_barrel", S, S);
    g.destroy();
  }

  /** 36×36 indestructible metal pillar */
function _genPillar(scene: Phaser.Scene): void {
    const S = 36;
    const cx = S / 2;
    const g = scene.add.graphics().setVisible(false);
    // Base shadow
    g.fillStyle(0x445566, 0.5);
    g.fillCircle(cx + 1, cx + 1, 15);
    // Main body
    g.fillStyle(0x667788, 1);
    g.fillCircle(cx, cx, 14);
    // Highlight
    g.fillStyle(0x8899aa, 0.6);
    g.fillCircle(cx - 3, cx - 3, 8);
    // Top cap
    g.fillStyle(0x99aabb, 0.8);
    g.fillCircle(cx, cx, 6);
    // Bolt ring
    g.lineStyle(1, 0x556677, 0.8);
    g.strokeCircle(cx, cx, 10);
    // 4 rivets
    g.fillStyle(0x556677, 1);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      g.fillCircle(cx + Math.cos(a) * 10, cx + Math.sin(a) * 10, 2);
    }
    g.generateTexture("obs_pillar", S, S);
    g.destroy();
  }

  // ─── City Environment Textures ─────────────────────────────

  /** 16×16 dark metal lab wall panel for tiling walls */
function _genWallTile(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    g.fillStyle(0x1a1e28, 1);
    g.fillRect(0, 0, 16, 16);
    // Highlight edges (top, left)
    g.fillStyle(0x2c3448, 1);
    g.fillRect(0, 0, 16, 1);
    g.fillRect(0, 0, 1, 16);
    // Shadow edges (bottom, right)
    g.fillStyle(0x0c0e14, 1);
    g.fillRect(0, 15, 16, 1);
    g.fillRect(15, 0, 1, 16);
    // Corner rivets (dark teal)
    g.fillStyle(0x334455, 1);
    g.fillCircle(3, 3, 1.5);
    g.fillCircle(12, 3, 1.5);
    g.fillCircle(3, 12, 1.5);
    g.fillCircle(12, 12, 1.5);
    g.generateTexture("env_wall_tile", 16, 16);
    g.destroy();
  }

  /** 36×72 tall server rack with blinking LED indicators */
function _genServerRack(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Side rails
    g.fillStyle(0x334455, 1);
    g.fillRect(0, 0, 3, 72);
    g.fillRect(33, 0, 3, 72);
    // Housing
    g.fillStyle(0x1a2233, 1);
    g.fillRect(2, 2, 32, 68);
    // Frame
    g.lineStyle(1, 0x2a3344, 1);
    g.strokeRect(2, 2, 32, 68);
    // Top panel
    g.fillStyle(0x2a3344, 1);
    g.fillRect(4, 2, 28, 4);
    // Server slots + LEDs
    const slotYs = [8, 24, 40, 56];
    const ledColors = [0x00ff44, 0x4488ff, 0xff4400];
    for (let s = 0; s < slotYs.length; s++) {
      const sy = slotYs[s];
      g.fillStyle(0x0d1520, 1);
      g.fillRect(4, sy, 28, 12);
      for (let l = 0; l < 3; l++) {
        g.fillStyle(ledColors[(s + l) % 3], 1);
        g.fillCircle(28 + l * 2, sy + 6, 2);
      }
    }
    // Ventilation slits
    g.lineStyle(1, 0x151f2a, 1);
    g.lineBetween(6, 20, 30, 20);
    g.lineBetween(6, 36, 30, 36);
    g.lineBetween(6, 52, 30, 52);
    g.generateTexture("env_server_rack", 36, 72);
    g.destroy();
  }

  /** 44×36 control terminal with glowing screen */
function _genTerminal(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Base housing
    g.fillStyle(0x223322, 1);
    g.fillRect(2, 12, 40, 22);
    // Screen (dark green)
    g.fillStyle(0x003311, 1);
    g.fillRect(6, 2, 32, 18);
    // Screen glow layers
    g.fillStyle(0x00ff88, 0.4);
    g.fillRect(8, 4, 28, 14);
    g.fillStyle(0x44ffaa, 0.3);
    g.fillRect(10, 6, 24, 10);
    // Fake text lines
    g.fillStyle(0x00cc66, 0.7);
    g.fillRect(10, 7, 18, 1);
    g.fillRect(10, 10, 22, 1);
    g.fillRect(10, 13, 14, 1);
    // Keyboard
    g.fillStyle(0x334433, 1);
    g.fillRect(8, 22, 28, 8);
    // Keyboard dots (3×2 grid)
    g.fillStyle(0x445544, 1);
    for (let kr = 0; kr < 2; kr++) {
      for (let kc = 0; kc < 3; kc++) {
        g.fillRect(12 + kc * 8, 24 + kr * 3, 2, 2);
      }
    }
    // Side buttons
    g.fillStyle(0x446644, 1);
    g.fillCircle(4, 18, 2);
    g.fillCircle(40, 18, 2);
    // Base stand
    g.fillStyle(0x2a3a2a, 1);
    g.fillRect(14, 32, 16, 4);
    g.generateTexture("env_terminal", 44, 36);
    g.destroy();
  }

  /** 64×64 reactor core with intense inner glow */
function _genReactor(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Outer housing
    g.fillStyle(0x1a2a1a, 1);
    g.fillCircle(32, 32, 30);
    // Housing ring
    g.lineStyle(3, 0x2a3a2a, 1);
    g.strokeCircle(32, 32, 30);
    // Inner containment
    g.fillStyle(0x003311, 1);
    g.fillCircle(32, 32, 22);
    // Core glow layers
    g.fillStyle(0x00ff44, 0.4);
    g.fillCircle(32, 32, 18);
    g.fillStyle(0x44ff88, 0.5);
    g.fillCircle(32, 32, 12);
    g.fillStyle(0x88ffbb, 0.7);
    g.fillCircle(32, 32, 7);
    g.fillStyle(0xccffdd, 0.9);
    g.fillCircle(32, 32, 3);
    // Energy lines at cardinal directions
    g.lineStyle(1, 0x00ff44, 0.3);
    g.lineBetween(32, 32, 60, 32);  // 0°
    g.lineBetween(32, 32, 32, 4);   // 90° (up)
    g.lineBetween(32, 32, 4, 32);   // 180°
    g.lineBetween(32, 32, 32, 60);  // 270° (down)
    // Warning marks (small triangles at cardinal points)
    g.fillStyle(0xffaa00, 0.6);
    g.fillTriangle(60, 28, 60, 36, 64, 32);   // right
    g.fillTriangle(28, 4, 36, 4, 32, 0);      // top
    g.fillTriangle(4, 28, 4, 36, 0, 32);      // left
    g.fillTriangle(28, 60, 36, 60, 32, 64);   // bottom
    // Bolts around ring
    g.fillStyle(0x3a4a3a, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      g.fillCircle(32 + Math.cos(a) * 28, 32 + Math.sin(a) * 28, 2);
    }
    // Outline
    g.lineStyle(2, 0x112211, 1);
    g.strokeCircle(32, 32, 31);
    g.generateTexture("env_reactor", 64, 64);
    g.destroy();
  }

  /** 48×48 industrial cooling unit with fan */
function _genCooling(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Housing
    g.fillStyle(0x334455, 1);
    g.fillRect(2, 2, 44, 44);
    // Frame
    g.lineStyle(2, 0x445566, 1);
    g.strokeRect(2, 2, 44, 44);
    // Fan circle
    g.fillStyle(0x223344, 1);
    g.fillCircle(24, 24, 18);
    // Fan blades (4 rotated 90° apart)
    g.fillStyle(0x556677, 1);
    g.fillTriangle(24, 24, 18, 10, 30, 10);  // top
    g.fillTriangle(24, 24, 38, 18, 38, 30);  // right
    g.fillTriangle(24, 24, 30, 38, 18, 38);  // bottom
    g.fillTriangle(24, 24, 10, 30, 10, 18);  // left
    // Center hub
    g.fillStyle(0x667788, 1);
    g.fillCircle(24, 24, 5);
    g.fillStyle(0x778899, 1);
    g.fillCircle(24, 24, 3);
    // Vent slots
    g.lineStyle(1, 0x223344, 1);
    g.lineBetween(8, 4, 40, 4);
    g.lineBetween(8, 44, 40, 44);
    // Corner screws
    g.fillStyle(0x556677, 1);
    g.fillCircle(6, 6, 2);
    g.fillCircle(42, 6, 2);
    g.fillCircle(6, 42, 2);
    g.fillCircle(42, 42, 2);
    g.generateTexture("env_cooling", 48, 48);
    g.destroy();
  }

  /** 56×32 assembly workstation */
function _genWorkbench(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Table top
    g.fillStyle(0x554433, 1);
    g.fillRect(2, 8, 52, 20);
    // Surface highlight
    g.fillStyle(0x665544, 1);
    g.fillRect(4, 8, 48, 3);
    // Legs
    g.fillStyle(0x443322, 1);
    g.fillRect(6, 26, 6, 6);
    g.fillRect(44, 26, 6, 6);
    // Tools on surface
    g.fillStyle(0x888888, 1);
    g.fillRect(10, 12, 14, 2);   // wrench
    g.fillStyle(0x999999, 1);
    g.fillCircle(32, 14, 3);     // gear
    g.fillStyle(0xaaaaaa, 1);
    g.fillRect(38, 11, 8, 3);    // bar
    // Vice/clamp
    g.fillStyle(0x667788, 1);
    g.fillRect(8, 9, 4, 6);
    // Under-shelf
    g.fillStyle(0x443322, 1);
    g.fillRect(8, 20, 40, 2);
    g.generateTexture("env_workbench", 56, 32);
    g.destroy();
  }

  /** 28×40 communication antenna/dish */
function _genAntenna(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Pole
    g.fillStyle(0x556677, 1);
    g.fillRect(12, 15, 4, 25);
    // Base
    g.fillStyle(0x445566, 1);
    g.fillRect(8, 35, 12, 5);
    // Dish (triangle approximation)
    g.fillStyle(0x667788, 1);
    g.fillTriangle(2, 18, 14, 2, 26, 18);
    // Dish surface highlight
    g.fillStyle(0x778899, 0.5);
    g.fillTriangle(4, 16, 14, 4, 24, 16);
    // Signal waves (approximated arcs)
    g.lineStyle(1, 0x4488ff, 0.4);
    g.beginPath();
    g.arc(20, 8, 6, -Math.PI / 4, Math.PI / 4);
    g.strokePath();
    g.beginPath();
    g.arc(20, 8, 10, -Math.PI / 4, Math.PI / 4);
    g.strokePath();
    // LED
    g.fillStyle(0x00ff44, 1);
    g.fillCircle(14, 15, 2);
    // Brace
    g.lineStyle(1, 0x556677, 1);
    g.lineBetween(14, 15, 6, 28);
    g.generateTexture("env_antenna", 28, 40);
    g.destroy();
  }

  /** 48×48 ventilation floor grate */
function _genFloorGrate(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Background
    g.fillStyle(0x222233, 1);
    g.fillRect(0, 0, 48, 48);
    // Horizontal grate bars
    g.fillStyle(0x333344, 1);
    for (let y = 3; y <= 45; y += 6) {
      g.fillRect(0, y, 48, 2);
    }
    // Vertical grate bars
    for (let x = 3; x <= 45; x += 6) {
      g.fillRect(x, 0, 2, 48);
    }
    // Center vent
    g.fillStyle(0x111122, 1);
    g.fillCircle(24, 24, 8);
    // Inner ring
    g.lineStyle(1, 0x333344, 1);
    g.strokeCircle(24, 24, 8);
    // Frame
    g.lineStyle(1, 0x444455, 1);
    g.strokeRect(1, 1, 46, 46);
    g.generateTexture("env_floor_grate", 48, 48);
    g.destroy();
  }

  /** 80×6 horizontal cable bundle */
function _genCableH(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Main cable
    g.fillStyle(0x334455, 1);
    g.fillRect(0, 1, 80, 4);
    // Highlight
    g.fillStyle(0x445566, 1);
    g.fillRect(0, 1, 80, 1);
    // Shadow
    g.fillStyle(0x223344, 1);
    g.fillRect(0, 4, 80, 1);
    // Cable ties
    g.fillStyle(0x556677, 1);
    g.fillRect(10, 0, 3, 6);
    g.fillRect(30, 0, 3, 6);
    g.fillRect(50, 0, 3, 6);
    g.fillRect(70, 0, 3, 6);
    g.generateTexture("env_cable_h", 80, 6);
    g.destroy();
  }

  /** 6×80 vertical cable bundle */
function _genCableV(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Main cable
    g.fillStyle(0x334455, 1);
    g.fillRect(1, 0, 4, 80);
    // Highlight
    g.fillStyle(0x445566, 1);
    g.fillRect(1, 0, 1, 80);
    // Shadow
    g.fillStyle(0x223344, 1);
    g.fillRect(4, 0, 1, 80);
    // Cable ties
    g.fillStyle(0x556677, 1);
    g.fillRect(0, 10, 6, 3);
    g.fillRect(0, 30, 6, 3);
    g.fillRect(0, 50, 6, 3);
    g.fillRect(0, 70, 6, 3);
    g.generateTexture("env_cable_v", 6, 80);
    g.destroy();
  }

  /** 96×8 hazard floor marking with diagonal stripes */
function _genWarningStripe(scene: Phaser.Scene): void {
    const g = scene.add.graphics().setVisible(false);
    // Background
    g.fillStyle(0x222200, 1);
    g.fillRect(0, 0, 96, 8);
    // Diagonal stripes (alternating bands)
    g.fillStyle(0xffaa00, 0.7);
    for (let x = 0; x < 96; x += 12) {
      g.fillRect(x, 0, 6, 8);
    }
    g.generateTexture("env_warning_stripe", 96, 8);
    g.destroy();
  }

  /** 80×32 plasma conduit — thick industrial pipe with glowing orange core and seam bolts */
function _genPlasmaConduit(scene: Phaser.Scene): void {
    const W = 80, H = 32; const g = scene.add.graphics().setVisible(false);
    // Outer pipe body (dark steel)
    g.fillStyle(0x2a2a3a, 1);
    g.fillRect(0, 4, W, H - 8);
    // Main pipe barrel
    g.fillStyle(0x3a3a4a, 1);
    g.fillRect(0, 6, W, H - 12);
    // Top/bottom edge highlights
    g.fillStyle(0x555566, 1);
    g.fillRect(0, 6, W, 2);
    g.fillStyle(0x1a1a2a, 1);
    g.fillRect(0, H - 8, W, 2);
    // Plasma core (bright orange glow channel)
    g.fillStyle(0xff6600, 0.15);
    g.fillRect(0, 12, W, 8);
    g.fillStyle(0xff8800, 0.35);
    g.fillRect(0, 13, W, 6);
    g.fillStyle(0xffaa44, 0.6);
    g.fillRect(0, 14, W, 4);
    g.fillStyle(0xffcc88, 0.8);
    g.fillRect(0, 15, W, 2);
    // Segment seam bolts (every 20px)
    for (let bx = 10; bx < W; bx += 20) {
      g.fillStyle(0x556677, 1);
      g.fillRect(bx - 1, 6, 2, H - 12);
      // Bolt circles
      g.fillStyle(0x6677aa, 1);
      g.fillCircle(bx, 8, 2.5);
      g.fillCircle(bx, H - 8, 2.5);
    }
    // Pipe endcaps
    g.fillStyle(0x445566, 1);
    g.fillRect(0, 4, 5, H - 8);
    g.fillRect(W - 5, 4, 5, H - 8);
    g.fillStyle(0x667788, 1);
    g.fillRect(0, 6, 3, H - 12);
    g.fillRect(W - 3, 6, 3, H - 12);
    g.generateTexture("env_plasma_conduit", W, H);
    g.destroy();
  }

  /** 88×80 blast furnace — massive industrial foundry with glowing mouth and brick surround */
function _genBlastFurnace(scene: Phaser.Scene): void {
    const W = 88, H = 80; const g = scene.add.graphics().setVisible(false);
    // Brick body
    g.fillStyle(0x3a2218, 1);
    g.fillRect(4, 8, W - 8, H - 8);
    // Brick pattern
    const brickW = 14, brickH = 8;
    for (let row = 0; row < Math.ceil((H - 16) / brickH); row++) {
      const offset = row % 2 === 0 ? 0 : brickW / 2;
      for (let col = -1; col < Math.ceil((W - 8) / brickW) + 1; col++) {
        const bx = 4 + col * brickW + offset;
        const by = 8 + row * brickH;
        if (bx > W - 4 || bx + brickW < 4) continue;
        g.lineStyle(1, 0x221208, 0.6);
        g.strokeRect(Math.max(4, bx), by, Math.min(brickW - 1, W - 4 - Math.max(4, bx)), brickH - 1);
      }
    }
    // Top chimney stacks
    g.fillStyle(0x2a1a10, 1);
    g.fillRect(12, 0, 12, 18);
    g.fillRect(64, 0, 12, 18);
    // Chimney tops
    g.fillStyle(0x1a1010, 1);
    g.fillRect(10, 0, 16, 4);
    g.fillRect(62, 0, 16, 4);
    // Smoke from chimneys
    g.fillStyle(0x4a3a30, 0.4);
    g.fillCircle(18, 0, 7);
    g.fillCircle(70, 0, 7);
    // Main furnace opening (center)
    g.fillStyle(0x220600, 1);
    g.fillRect(20, 28, 48, 32);
    // Furnace glow layers (lava/fire)
    g.fillStyle(0xff2200, 0.25);
    g.fillRect(20, 28, 48, 32);
    g.fillStyle(0xff4400, 0.4);
    g.fillRect(22, 32, 44, 24);
    g.fillStyle(0xff6600, 0.5);
    g.fillRect(26, 36, 36, 16);
    g.fillStyle(0xffaa00, 0.6);
    g.fillRect(30, 40, 28, 10);
    g.fillStyle(0xffdd88, 0.7);
    g.fillRect(34, 44, 20, 5);
    // Furnace arch outline
    g.lineStyle(2, 0x553322, 0.8);
    g.strokeRect(20, 28, 48, 32);
    // Side control panels
    g.fillStyle(0x1a2020, 1);
    g.fillRect(2, 32, 14, 20);
    g.fillRect(W - 16, 32, 14, 20);
    // Panel indicators
    for (let i = 0; i < 3; i++) {
      g.fillStyle(i === 0 ? 0xff4400 : i === 1 ? 0xffaa00 : 0x00ff88, 1);
      g.fillCircle(9, 37 + i * 6, 2.5);
      g.fillCircle(W - 9, 37 + i * 6, 2.5);
    }
    // Bottom base
    g.fillStyle(0x1a1010, 1);
    g.fillRect(0, H - 10, W, 10);
    g.fillStyle(0x2a2020, 1);
    g.fillRect(2, H - 8, W - 4, 6);
    g.generateTexture("env_blast_furnace", W, H);
    g.destroy();
  }

  /** 72×56 ammo rack — military green storage rack with compartmentalized shells */
function _genAmmoRack(scene: Phaser.Scene): void {
    const W = 72, H = 56; const g = scene.add.graphics().setVisible(false);
    // Frame
    g.fillStyle(0x1a2200, 1);
    g.fillRect(0, 0, W, H);
    g.fillStyle(0x2a3300, 1);
    g.fillRect(2, 2, W - 4, H - 4);
    // Frame border
    g.lineStyle(2, 0x334400, 1);
    g.strokeRect(0, 0, W, H);
    // Rack dividers (4 columns, 3 rows = 12 slots)
    const slotW = (W - 6) / 4, slotH = (H - 6) / 3;
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const sx = 3 + col * slotW, sy = 3 + row * slotH;
        // Slot background
        g.fillStyle(0x111600, 1);
        g.fillRect(sx, sy, slotW - 1, slotH - 1);
        // Shell in slot (cylindrical ammo)
        const shellX = sx + (slotW - 8) / 2;
        const shellY = sy + 2;
        // Shell body (brass)
        g.fillStyle(0xcc9900, 1);
        g.fillRect(shellX, shellY + 6, 8, slotH - 12);
        // Shell tip (steel)
        g.fillStyle(0xaaaacc, 1);
        g.fillRect(shellX + 1, shellY, 6, 8);
        g.fillTriangle(shellX + 1, shellY, shellX + 4, shellY - 5, shellX + 7, shellY);
        // Primer base
        g.fillStyle(0x886600, 1);
        g.fillRect(shellX, shellY + slotH - 14, 8, 4);
        g.fillStyle(0xff4400, 0.6);
        g.fillCircle(shellX + 4, shellY + slotH - 12, 2);
      }
    }
    // Warning label
    g.fillStyle(0xffcc00, 0.7);
    g.fillRect(2, H - 10, W - 4, 8);
    g.fillStyle(0x111100, 1);
    // Hazard stripes on label
    for (let lx = 0; lx < W - 4; lx += 10) {
      g.fillStyle(0x111100, 0.8);
      g.fillRect(2 + lx, H - 10, 5, 8);
    }
    g.generateTexture("env_ammo_rack", W, H);
    g.destroy();
  }

  /** 48×72 containment tank — tall cylindrical specimen tank with green bio-fluid and creature */
function _genContainmentTank(scene: Phaser.Scene): void {
    const W = 48, H = 72; const g = scene.add.graphics().setVisible(false);
    // Tank base
    g.fillStyle(0x1a1a2a, 1);
    g.fillRect(4, H - 10, W - 8, 10);
    g.fillStyle(0x2a2a3a, 1);
    g.fillRect(6, H - 8, W - 12, 7);
    // Tank body (thick glass cylinder)
    g.fillStyle(0x0a1a0a, 1);
    g.fillRect(8, 8, W - 16, H - 18);
    // Glass outer wall
    g.fillStyle(0x112211, 0.8);
    g.fillRect(8, 8, W - 16, H - 18);
    // Bio fluid fill (glowing green)
    g.fillStyle(0x00aa44, 0.2);
    g.fillRect(10, 10, W - 20, H - 22);
    g.fillStyle(0x00cc55, 0.3);
    g.fillRect(12, 14, W - 24, H - 26);
    // Fluid bubbles
    for (let i = 0; i < 5; i++) {
      const bx = 14 + (i * 5) % (W - 28);
      const by = 18 + (i * 11) % (H - 32);
      g.fillStyle(0x44ff88, 0.25);
      g.fillCircle(bx, by, 2 + i % 2);
    }
    // Specimen silhouette (simple creature shape)
    g.fillStyle(0x00ff66, 0.5);
    // Body
    g.fillEllipse(W / 2, H / 2, 12, 16);
    // Eyes (two bright dots)
    g.fillStyle(0xffffff, 0.9);
    g.fillCircle(W / 2 - 3, H / 2 - 3, 2);
    g.fillCircle(W / 2 + 3, H / 2 - 3, 2);
    g.fillStyle(0xff2200, 0.8);
    g.fillCircle(W / 2 - 3, H / 2 - 3, 1);
    g.fillCircle(W / 2 + 3, H / 2 - 3, 1);
    // Tentacles
    g.lineStyle(1, 0x00ff66, 0.4);
    g.lineBetween(W/2 - 4, H/2 + 8, W/2 - 8, H/2 + 16);
    g.lineBetween(W/2,     H/2 + 8, W/2,     H/2 + 18);
    g.lineBetween(W/2 + 4, H/2 + 8, W/2 + 8, H/2 + 16);
    g.strokePath();
    // Glass reflections (bright edge)
    g.fillStyle(0x44aa44, 0.2);
    g.fillRect(8, 8, 3, H - 18);
    g.fillStyle(0x88ffaa, 0.15);
    g.fillRect(9, 10, 2, H - 22);
    // Tank top cap
    g.fillStyle(0x2a3a2a, 1);
    g.fillRect(6, 4, W - 12, 8);
    // Pressure valve at top
    g.fillStyle(0x3a4a3a, 1);
    g.fillRect(W/2 - 5, 0, 10, 6);
    g.fillStyle(0x44bb66, 1);
    g.fillCircle(W / 2, 3, 3);
    // Metal bands around tank
    g.lineStyle(2, 0x2a3a2a, 0.8);
    g.strokeRect(8, 8, W - 16, H - 18);
    g.lineStyle(1, 0x3a4a3a, 0.4);
    g.lineBetween(8, H / 2, W - 8, H / 2);
    g.strokePath();
    g.generateTexture("lab_containment_tank", W, H);
    g.destroy();
  }
function _genAllFloorTiles(scene: Phaser.Scene): void {
    const tiles: { key: string; base: number; grout: number; accent: number; pattern: "none"|"stripe"|"dot"|"cross"|"hex"; accentAlpha: number }[] = [
      { key: "floor_hub",         base: 0x0e1020, grout: 0x181a30, accent: 0x4488ff, pattern: "dot",    accentAlpha: 0.45 },
      { key: "floor_factory",     base: 0x0c1610, grout: 0x142410, accent: 0x00ee66, pattern: "cross",  accentAlpha: 0.40 },
      { key: "floor_server",      base: 0x0c1018, grout: 0x141e2c, accent: 0x2288ff, pattern: "dot",    accentAlpha: 0.40 },
      { key: "floor_power",       base: 0x12100a, grout: 0x221808, accent: 0xff8800, pattern: "stripe", accentAlpha: 0.45 },
      { key: "floor_control",     base: 0x14120c, grout: 0x221e0c, accent: 0xffcc00, pattern: "cross",  accentAlpha: 0.40 },
      { key: "floor_maintenance", base: 0x0e1014, grout: 0x1a1e24, accent: 0x6699aa, pattern: "stripe", accentAlpha: 0.35 },
      { key: "floor_armory",      base: 0x140a08, grout: 0x261210, accent: 0xff4422, pattern: "cross",  accentAlpha: 0.40 },
      { key: "floor_quarantine",  base: 0x0c1408, grout: 0x141e08, accent: 0x88dd00, pattern: "stripe", accentAlpha: 0.50 },
      { key: "floor_vault",       base: 0x0e0c18, grout: 0x181028, accent: 0xaa44ff, pattern: "dot",    accentAlpha: 0.38 },
    ];

    for (const t of tiles) {
      const S = 64;
      const g = scene.add.graphics().setVisible(false);
      // Tile base (deep dark)
      g.fillStyle(t.base, 1);
      g.fillRect(0, 0, S, S);
      // Grout joint lines (slightly lighter dark)
      g.fillStyle(t.grout, 1);
      g.fillRect(0, S - 2, S, 2);
      g.fillRect(S - 2, 0, 2, S);
      // Very subtle surface variation (lighter corner)
      g.fillStyle(0xffffff, 0.03);
      g.fillRect(2, 2, S / 2 - 2, S / 2 - 2);
      // Accent pattern (vivid colored detail — pops on dark)
      if (t.pattern === "dot") {
        g.fillStyle(t.accent, t.accentAlpha);
        g.fillCircle(S / 2, S / 2, 4);
        g.fillCircle(14, 14, 2.5);
        g.fillCircle(S - 14, S - 14, 2.5);
      } else if (t.pattern === "stripe") {
        g.lineStyle(2, t.accent, t.accentAlpha);
        g.lineBetween(2, S / 2, S - 4, S / 2);
        g.strokePath();
      } else if (t.pattern === "cross") {
        g.lineStyle(1, t.accent, t.accentAlpha);
        g.lineBetween(2, S / 2, S - 4, S / 2);
        g.lineBetween(S / 2, 2, S / 2, S - 4);
        g.strokePath();
      }
      g.generateTexture(t.key, S, S);
      g.destroy();
    }
  }
function _genWallPanel(scene: Phaser.Scene): void {
    const S = 32;
    const g = scene.add.graphics().setVisible(false);
    // Dark steel panel body
    g.fillStyle(0x1c2030, 1);
    g.fillRect(0, 0, S, S);
    // Top-left highlight (slightly lighter)
    g.fillStyle(0x2c3448, 1);
    g.fillRect(0, 0, S, 2);
    g.fillRect(0, 0, 2, S);
    // Bottom-right shadow (very dark)
    g.fillStyle(0x0e1018, 1);
    g.fillRect(0, S - 2, S, 2);
    g.fillRect(S - 2, 0, 2, S);
    // Inner panel recess
    g.fillStyle(0x18202e, 1);
    g.fillRect(3, 3, S - 6, S - 6);
    // Corner bolts (dark teal-ish)
    g.fillStyle(0x224466, 1);
    g.fillCircle(6, 6, 2);
    g.fillCircle(S - 6, 6, 2);
    g.fillCircle(6, S - 6, 2);
    g.fillCircle(S - 6, S - 6, 2);
    g.generateTexture("wall_panel", S, S);
    g.destroy();
  }
function _genDoorFrame(scene: Phaser.Scene): void {
    const W = 20, H = 64;
    const g = scene.add.graphics().setVisible(false);
    // Dark navy door frame
    g.fillStyle(0x0e1422, 1);
    g.fillRect(0, 0, W, H);
    // Left edge highlight (steel)
    g.fillStyle(0x2a3a4e, 1);
    g.fillRect(0, 0, 3, H);
    // Shadow right edge
    g.fillStyle(0x080c14, 1);
    g.fillRect(W - 2, 0, 2, H);
    // Frame bolts
    g.fillStyle(0x334466, 1);
    g.fillRect(4, 6, W - 8, 3);
    g.fillRect(4, H - 9, W - 8, 3);
    // LED status strip (green = open)
    g.fillStyle(0x00cc55, 0.9);
    g.fillRect(6, H / 2 - 10, 8, 20);
    g.fillStyle(0x00ff77, 1);
    g.fillRect(8, H / 2 - 6, 4, 12);
    g.generateTexture("door_frame", W, H);
    g.destroy();
  }


