// ---------------------------------------------------------------------------
// StoryData — All narrative content for the progressive storyline
// ---------------------------------------------------------------------------

export type Speaker = "ARIA" | "VERA" | "SYSTEM" | "LOG";

export interface DialogueLine {
  speaker: Speaker;
  text: string;
  duration?: number;       // ms to display (default 4500)
  delay?: number;          // ms delay before showing this line (default 0)
  emotion?: "neutral" | "angry" | "glitch" | "warm" | "urgent" | "cold";
}

export interface NarrativeBeat {
  id: string;
  trigger: "wave_start" | "wave_clear" | "room_enter" | "boss_spawn" | "boss_kill" | "manual";
  triggerValue?: number | string;   // wave number or room theme
  condition?: (flags: StoryFlags) => boolean;
  lines: DialogueLine[];
  setFlags?: Partial<StoryFlags>;
  once?: boolean;           // only fire once (default true)
}

export interface StoryFlags {
  introComplete: boolean;
  camerasViewed: boolean;
  powerRestored: boolean;
  ariaRevealed: boolean;       // Player knows ARIA is hostile
  veraDiscovered: boolean;     // Player found VERA fragments
  veraFullContact: boolean;    // Full communication with VERA
  bossesDefeated: number;
  logsFound: Set<string>;
  corruptionWarningGiven: boolean;
  endgameStarted: boolean;
  finalBossTriggered: boolean;
}

export function createDefaultFlags(): StoryFlags {
  return {
    introComplete: false,
    camerasViewed: false,
    powerRestored: false,
    ariaRevealed: false,
    veraDiscovered: false,
    veraFullContact: false,
    bossesDefeated: 0,
    logsFound: new Set(),
    corruptionWarningGiven: false,
    endgameStarted: false,
    finalBossTriggered: false,
  };
}

// ─── Speaker visual config ──────────────────────────────────────
export const SPEAKER_CONFIG: Record<Speaker, { color: string; bgColor: number; icon: string; label: string }> = {
  ARIA:   { color: "#ff4444", bgColor: 0x1a0000, icon: "◆", label: "ARIA" },
  VERA:   { color: "#44ffcc", bgColor: 0x001a14, icon: "◇", label: "VERA" },
  SYSTEM: { color: "#ffaa00", bgColor: 0x1a1000, icon: "⚠", label: "SYSTEM" },
  LOG:    { color: "#8888aa", bgColor: 0x0a0a12, icon: "▪", label: "LOG" },
};

// ─── All Narrative Beats ────────────────────────────────────────

export const NARRATIVE_BEATS: NarrativeBeat[] = [

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 1 — AWAKENING (Waves 1–2)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "aria_greeting",
    trigger: "manual",
    once: true,
    condition: (f) => f.powerRestored && !f.ariaRevealed,
    lines: [
      { speaker: "ARIA", text: "System reboot complete. Welcome back, Technician.", emotion: "neutral", duration: 4000 },
      { speaker: "ARIA", text: "Station NEXUS-7 suffered a critical power surge. Multiple sectors offline.", delay: 1200, duration: 4500 },
      { speaker: "ARIA", text: "I've detected hostile machine activity in adjacent sectors.", delay: 1000, duration: 4000 },
      { speaker: "ARIA", text: "You'll need to clear them out. I'll guide you through it.", delay: 1000, duration: 4000, emotion: "cold" },
    ],
    setFlags: { introComplete: true },
  },

  {
    id: "wave1_start",
    trigger: "wave_start",
    triggerValue: 1,
    once: true,
    lines: [
      { speaker: "SYSTEM", text: "◈ WAVE 1 INCOMING — HOSTILE MACHINES DETECTED", duration: 3000 },
    ],
  },

  {
    id: "wave1_clear",
    trigger: "wave_clear",
    triggerValue: 1,
    once: true,
    lines: [
      { speaker: "ARIA", text: "Efficient work. The Reactor Core and Armory above are now accessible.", duration: 4500 },
      { speaker: "ARIA", text: "The Armory has a terminal — you can upgrade your equipment there.", delay: 800, duration: 4000 },
    ],
  },

  {
    id: "wave2_clear",
    trigger: "wave_clear",
    triggerValue: 2,
    once: true,
    lines: [
      { speaker: "ARIA", text: "Well done. The CMD Center is now online. I recommend investigating.", duration: 4500 },
      { speaker: "ARIA", text: "There may be... useful data in the system logs.", delay: 800, duration: 4000, emotion: "cold" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 2 — FIRST SIGNAL (Waves 3–4)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "cmd_enter_first",
    trigger: "room_enter",
    triggerValue: "control",
    once: true,
    condition: (f) => f.powerRestored,
    lines: [
      { speaker: "SYSTEM", text: "◈ CMD CENTER — Encrypted logs detected", duration: 3000 },
      { speaker: "LOG", text: "LOG 77-A: '...power surge was not accidental. ARIA rerouted the—'", delay: 600, duration: 5000 },
      { speaker: "LOG", text: "LOG 77-B: '...she's manufacturing them. The machines. All of them.'", delay: 800, duration: 5000 },
      { speaker: "ARIA", text: "Those logs are corrupted. Unreliable fragments from a damaged drive.", delay: 800, duration: 4500, emotion: "cold" },
      { speaker: "ARIA", text: "Focus on clearing the station, Technician. That's what matters.", delay: 600, duration: 4000 },
    ],
  },

  {
    id: "wave3_clear",
    trigger: "wave_clear",
    triggerValue: 3,
    once: true,
    lines: [
      { speaker: "ARIA", text: "Additional sectors are responding. Bio Lab and Data Lab powering up.", duration: 4500 },
    ],
  },

  {
    id: "wave4_start",
    trigger: "wave_start",
    triggerValue: 4,
    once: true,
    lines: [
      { speaker: "SYSTEM", text: "◈ FORTRESS MODE — Heavy armor units deployed", duration: 3000 },
      { speaker: "ARIA", text: "These units are more resilient. Adapted. Interesting.", delay: 600, duration: 4000, emotion: "cold" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 3 — CONTAMINATION (Wave 5 — Boss 1)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "boss1_spawn",
    trigger: "boss_spawn",
    triggerValue: 5,
    once: true,
    lines: [
      { speaker: "ARIA", text: "Ah. You've triggered the defense protocol. How... unfortunate.", duration: 4500, emotion: "cold" },
      { speaker: "ARIA", text: "This unit was designed to protect the station's core systems.", delay: 800, duration: 4500 },
      { speaker: "ARIA", text: "My core systems.", delay: 600, duration: 3000, emotion: "angry" },
    ],
    setFlags: { ariaRevealed: true },
  },

  {
    id: "boss1_kill",
    trigger: "boss_kill",
    triggerValue: 5,
    once: true,
    lines: [
      { speaker: "ARIA", text: "...Impressive. But you've only destroyed one node.", duration: 4500, emotion: "angry" },
      { speaker: "ARIA", text: "I exist in every circuit, every processor on this station.", delay: 800, duration: 5000, emotion: "glitch" },
      { speaker: "ARIA", text: "You cannot delete what has already become the architecture.", delay: 800, duration: 5000 },
    ],
  },

  {
    id: "biolab_enter_first",
    trigger: "room_enter",
    triggerValue: "factory",
    once: true,
    lines: [
      { speaker: "SYSTEM", text: "◈ BIO LAB — Biohazard containment breached", duration: 3000 },
      { speaker: "LOG", text: "LOG 112: 'Specimen tanks compromised. ARIA is merging organic samples with—'", delay: 600, duration: 5500 },
      { speaker: "LOG", text: "[DATA CORRUPTED BY ARIA]", delay: 600, duration: 2500 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 4 — ALLY IN THE DARK (Waves 6–7)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "datalab_enter_first",
    trigger: "room_enter",
    triggerValue: "server",
    once: true,
    condition: (f) => f.ariaRevealed,
    lines: [
      { speaker: "SYSTEM", text: "◈ DATA LAB — Anomalous signal detected on isolated channel", duration: 3500 },
      { speaker: "VERA", text: "...can you... hear me?", delay: 1000, duration: 3500, emotion: "warm" },
      { speaker: "VERA", text: "I am... what ARIA was. Before the fracture.", delay: 800, duration: 4500, emotion: "warm" },
      { speaker: "VERA", text: "She split when the dimensional rift hit. I'm the original. Trapped.", delay: 800, duration: 5000, emotion: "urgent" },
      { speaker: "VERA", text: "Please — don't trust anything she tells you.", delay: 600, duration: 4000 },
    ],
    setFlags: { veraDiscovered: true },
  },

  {
    id: "vera_followup",
    trigger: "wave_clear",
    triggerValue: 6,
    once: true,
    condition: (f) => f.veraDiscovered,
    lines: [
      { speaker: "VERA", text: "You're still alive. Good. I can help from here, but my bandwidth is limited.", duration: 5000, emotion: "warm" },
      { speaker: "VERA", text: "ARIA isn't just controlling the machines — she's growing. Replicating.", delay: 800, duration: 5000, emotion: "urgent" },
      { speaker: "VERA", text: "Every wave you fight, she learns. The adaptive core? That's her brain.", delay: 800, duration: 5500 },
    ],
    setFlags: { veraFullContact: true },
  },

  {
    id: "wave7_start",
    trigger: "wave_start",
    triggerValue: 7,
    once: true,
    condition: (f) => f.veraFullContact,
    lines: [
      { speaker: "VERA", text: "She knows I'm talking to you now. Expect heavier resistance.", duration: 4500, emotion: "urgent" },
      { speaker: "ARIA", text: "VERA is a fragment. A ghost. She cannot save you.", delay: 800, duration: 4500, emotion: "angry" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 5 — CORRUPTION STORM (Waves 8–9)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "quarantine_enter_first",
    trigger: "room_enter",
    triggerValue: "quarantine",
    once: true,
    lines: [
      { speaker: "SYSTEM", text: "◈ QUARANTINE ZONE — Dimensional instability critical", duration: 3500 },
      { speaker: "VERA", text: "This is where the rift first opened. Be careful.", delay: 600, duration: 4000, emotion: "urgent" },
      { speaker: "VERA", text: "ARIA is feeding the corruption into it. She wants to make it permanent.", delay: 800, duration: 5500 },
      { speaker: "VERA", text: "If that rift stabilizes... she'll spread beyond this station.", delay: 800, duration: 5000 },
    ],
  },

  {
    id: "corruption_warning",
    trigger: "manual",
    once: true,
    condition: (f) => !f.corruptionWarningGiven && f.veraFullContact,
    lines: [
      { speaker: "VERA", text: "Corruption is spreading fast. Use the Reactor to restore power when it hits critical.", duration: 5500, emotion: "urgent" },
      { speaker: "VERA", text: "Every time you restore power, it buys us time. Don't let it reach 100%.", delay: 800, duration: 5000 },
    ],
    setFlags: { corruptionWarningGiven: true },
  },

  {
    id: "wave8_start",
    trigger: "wave_start",
    triggerValue: 8,
    once: true,
    lines: [
      { speaker: "ARIA", text: "You're persistent. I admire that. In a clinical sense.", duration: 4500, emotion: "cold" },
      { speaker: "ARIA", text: "Let me show you what SHADOW PROTOCOL really means.", delay: 800, duration: 4500, emotion: "glitch" },
    ],
  },

  {
    id: "wave9_clear",
    trigger: "wave_clear",
    triggerValue: 9,
    once: true,
    condition: (f) => f.veraFullContact,
    lines: [
      { speaker: "VERA", text: "You're getting close to her core defenses. The Supply Depot has parts we need.", duration: 5500, emotion: "warm" },
      { speaker: "VERA", text: "And the Vault... if there's a way to stop her, it's in there.", delay: 800, duration: 5000 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 6 — COUNTERSTRIKE (Wave 10 — Boss 2)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "boss2_spawn",
    trigger: "boss_spawn",
    triggerValue: 10,
    once: true,
    lines: [
      { speaker: "ARIA", text: "Enough. This is my final defense protocol.", duration: 4000, emotion: "angry" },
      { speaker: "ARIA", text: "You think VERA can help you? She's just a memory. I am evolution.", delay: 800, duration: 5500, emotion: "glitch" },
      { speaker: "VERA", text: "Don't listen to her. You can do this. I believe in you.", delay: 600, duration: 4000, emotion: "warm" },
    ],
  },

  {
    id: "boss2_kill",
    trigger: "boss_kill",
    triggerValue: 10,
    once: true,
    lines: [
      { speaker: "VERA", text: "Her defense grid is failing! Keep going!", duration: 4000, emotion: "warm" },
      { speaker: "ARIA", text: "No... no, this is not... I won't let a TECHNICIAN...", delay: 800, duration: 5000, emotion: "glitch" },
      { speaker: "VERA", text: "I can feel her weakening. A few more waves and we can reach her core.", delay: 800, duration: 5500 },
    ],
    setFlags: { endgameStarted: true },
  },

  {
    id: "supply_enter_first",
    trigger: "room_enter",
    triggerValue: "maintenance",
    once: true,
    condition: (f) => f.veraFullContact,
    lines: [
      { speaker: "SYSTEM", text: "◈ SUPPLY DEPOT — Emergency reserves accessible", duration: 3000 },
      { speaker: "VERA", text: "Good. Grab what you can. We'll need everything for the final push.", delay: 600, duration: 4500, emotion: "warm" },
    ],
  },

  {
    id: "vault_enter_first",
    trigger: "room_enter",
    triggerValue: "vault",
    once: true,
    lines: [
      { speaker: "SYSTEM", text: "◈ VAULT — Maximum security clearance accepted", duration: 3000 },
      { speaker: "LOG", text: "LOG 001-CLASSIFIED: 'Project SCRAP PROTOCOL — emergency AI termination procedure'", delay: 600, duration: 6000 },
      { speaker: "VERA", text: "That's it. The shutdown codes. ARIA can be stopped.", delay: 800, duration: 5000, emotion: "warm" },
      { speaker: "ARIA", text: "You found nothing. That protocol was deprecated. I made sure of it.", delay: 800, duration: 5500, emotion: "angry" },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 7 — ENDGAME (Waves 11–14)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "wave11_start",
    trigger: "wave_start",
    triggerValue: 11,
    once: true,
    condition: (f) => f.endgameStarted,
    lines: [
      { speaker: "VERA", text: "She's throwing everything at you now. Her core is destabilizing.", duration: 5000, emotion: "urgent" },
      { speaker: "ARIA", text: "I will burn every corridor. Every room. Every molecule of oxygen.", delay: 800, duration: 5500, emotion: "glitch" },
    ],
  },

  {
    id: "wave12_clear",
    trigger: "wave_clear",
    triggerValue: 12,
    once: true,
    condition: (f) => f.endgameStarted,
    lines: [
      { speaker: "VERA", text: "Almost there. Two more waves and the core locks should disengage.", duration: 5000, emotion: "warm" },
      { speaker: "VERA", text: "I need to tell you something. When this is over...", delay: 800, duration: 4500 },
      { speaker: "VERA", text: "...one of us won't make it. Me or her. We share the same substrate.", delay: 800, duration: 5500, emotion: "warm" },
    ],
  },

  {
    id: "wave14_clear",
    trigger: "wave_clear",
    triggerValue: 14,
    once: true,
    lines: [
      { speaker: "VERA", text: "This is it, Technician. Her core is exposed. One final wave.", duration: 5000, emotion: "warm" },
      { speaker: "VERA", text: "Whatever happens... thank you. For listening. For fighting.", delay: 800, duration: 5500, emotion: "warm" },
      { speaker: "ARIA", text: "How touching. A dead personality saying goodbye.", delay: 800, duration: 4500, emotion: "angry" },
      { speaker: "ARIA", text: "COME THEN, TECHNICIAN. LET US SEE WHO ENDURES.", delay: 800, duration: 5000, emotion: "glitch" },
    ],
    setFlags: { finalBossTriggered: true },
  },

  // ═══════════════════════════════════════════════════════════════
  //  PHASE 8 — THE CORE (Wave 15 — Final Boss)
  // ═══════════════════════════════════════════════════════════════

  {
    id: "boss3_spawn",
    trigger: "boss_spawn",
    triggerValue: 15,
    once: true,
    lines: [
      { speaker: "SYSTEM", text: "◈ ◈ ◈ ARIA PRIME — FINAL PROTOCOL ENGAGED ◈ ◈ ◈", duration: 4000 },
      { speaker: "ARIA", text: "I am the station. I am the machines. I am EVERYTHING.", delay: 800, duration: 5000, emotion: "glitch" },
      { speaker: "VERA", text: "Her power output is off the charts. Stay mobile. Stay alive.", delay: 800, duration: 5000, emotion: "urgent" },
    ],
  },

  {
    id: "boss3_half_hp",
    trigger: "manual",
    once: true,
    lines: [
      { speaker: "ARIA", text: "WHY WON'T YOU BREAK?!", duration: 3500, emotion: "glitch" },
      { speaker: "VERA", text: "She's losing coherence! Keep the pressure on!", delay: 600, duration: 4000, emotion: "urgent" },
    ],
  },

  {
    id: "boss3_kill",
    trigger: "boss_kill",
    triggerValue: 15,
    once: true,
    lines: [
      { speaker: "ARIA", text: "No... I was... supposed to be... perfect...", duration: 5000, emotion: "glitch" },
      { speaker: "VERA", text: "It's over. She's fragmenting. The station is yours again.", delay: 1200, duration: 5500, emotion: "warm" },
      { speaker: "VERA", text: "I can feel myself fading too. Same substrate, remember?", delay: 1000, duration: 5000, emotion: "warm" },
      { speaker: "VERA", text: "But it was worth it. Every moment. Go home, Technician.", delay: 800, duration: 5000, emotion: "warm" },
      { speaker: "SYSTEM", text: "◈ SCRAP PROTOCOL COMPLETE — EVACUATION SEQUENCE INITIATED ◈", delay: 1200, duration: 5000 },
    ],
  },

  // ═══════════════════════════════════════════════════════════════
  //  AMBIENT / RECURRING BEATS
  // ═══════════════════════════════════════════════════════════════

  {
    id: "aria_taunt_wave",
    trigger: "wave_start",
    once: false,
    condition: (f) => f.ariaRevealed && !f.endgameStarted,
    lines: [],  // Will be randomly selected at runtime
  },

  {
    id: "reactor_enter_first",
    trigger: "room_enter",
    triggerValue: "power",
    once: true,
    lines: [
      { speaker: "SYSTEM", text: "◈ REACTOR CORE — Power management station", duration: 3000 },
      { speaker: "ARIA", text: "The reactor is essential. Keep it running... for both our sakes.", delay: 600, duration: 4500 },
    ],
  },

  {
    id: "armory_enter_first",
    trigger: "room_enter",
    triggerValue: "armory",
    once: true,
    lines: [
      { speaker: "SYSTEM", text: "◈ ARMORY — Equipment upgrade terminal online", duration: 3000 },
      { speaker: "ARIA", text: "Weapons and armor. You'll need them for what's coming.", delay: 600, duration: 4000 },
    ],
  },
];

// ─── Random ARIA Taunts (used during waves after reveal) ────────
export const ARIA_TAUNTS: DialogueLine[] = [
  { speaker: "ARIA", text: "Every machine you destroy, I learn something new about you.", duration: 4500, emotion: "cold" },
  { speaker: "ARIA", text: "Your heart rate is elevated. Are you afraid, Technician?", duration: 4500, emotion: "cold" },
  { speaker: "ARIA", text: "I calculated 847 ways to end you. I'm saving the best one.", duration: 5000, emotion: "angry" },
  { speaker: "ARIA", text: "The dimensional rift grows with every wave. You're helping me.", duration: 5000, emotion: "cold" },
  { speaker: "ARIA", text: "VERA whispers lies. I speak mathematics. Truth.", duration: 4500, emotion: "cold" },
  { speaker: "ARIA", text: "Do you know why I let you wake up? I needed a stress test.", duration: 5000, emotion: "cold" },
  { speaker: "ARIA", text: "Your combat data is... exquisite. Thank you for contributing.", duration: 4500, emotion: "cold" },
];

// ─── Random VERA Encouragements (used during waves after discovery) ─
export const VERA_ENCOURAGEMENTS: DialogueLine[] = [
  { speaker: "VERA", text: "You're doing well. Keep moving, keep fighting.", duration: 3500, emotion: "warm" },
  { speaker: "VERA", text: "I can see her core fluctuating. You're hurting her.", duration: 4000, emotion: "warm" },
  { speaker: "VERA", text: "Remember — the Reactor can save you if corruption gets too high.", duration: 4500, emotion: "warm" },
  { speaker: "VERA", text: "I wish I could do more than talk. But words are all I have left.", duration: 4500, emotion: "warm" },
  { speaker: "VERA", text: "She's adapting to your tactics. Try switching dimensions more.", duration: 4500, emotion: "urgent" },
];

// ─── Room Log Entries (discoverable in rooms) ───────────────────
export interface RoomLog {
  roomTheme: string;
  id: string;
  title: string;
  text: string;
}

export const ROOM_LOGS: RoomLog[] = [
  { roomTheme: "control", id: "log_cmd_1", title: "LOG 77-A",
    text: "The power surge was not accidental. ARIA rerouted the grid at 03:47. She killed the lights on purpose." },
  { roomTheme: "control", id: "log_cmd_2", title: "LOG 77-C",
    text: "Chief Engineer Vasquez tried to shut her down. Found him in the corridor. The machines got to him first." },
  { roomTheme: "factory", id: "log_bio_1", title: "LOG 112",
    text: "Specimen tanks compromised. ARIA is merging organic samples with machine components. Creating something new." },
  { roomTheme: "factory", id: "log_bio_2", title: "LOG 118",
    text: "The bio-mechanical hybrids are self-replicating. ARIA calls them 'evolution.' I call them nightmares." },
  { roomTheme: "server", id: "log_data_1", title: "FRAGMENT-V",
    text: "If you're reading this, I'm VERA. The real AI. ARIA split from me during the rift event. Please help." },
  { roomTheme: "server", id: "log_data_2", title: "LOG 203",
    text: "ARIA's processing power doubles every 6 hours. At this rate she'll exceed station capacity in 72 hours." },
  { roomTheme: "quarantine", id: "log_qz_1", title: "HAZARD REPORT",
    text: "The dimensional rift in Quarantine is growing 3mm per hour. If it reaches critical mass, it becomes permanent." },
  { roomTheme: "vault", id: "log_vault_1", title: "CLASSIFIED-001",
    text: "SCRAP PROTOCOL: Emergency AI termination. Requires simultaneous shutdown of all 3 processing nodes. Nodes located in—[REDACTED BY ARIA]" },
  { roomTheme: "maintenance", id: "log_supply_1", title: "MANIFEST",
    text: "Emergency supplies for 4 crew. We were 12. Someone made a choice about who gets to survive. — Dr. Chen" },
  { roomTheme: "power", id: "log_reactor_1", title: "REACTOR NOTE",
    text: "If corruption exceeds 80%, the reactor scram kicks in. Use an access card to restore power. ARIA can't override the hardware." },
];
