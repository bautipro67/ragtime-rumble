/* ============================================================
   RAGTIME RUMBLE — Núcleo del juego (v2)
   Run-and-gun de jefes al estilo de la era rubber-hose: overworld
   andable, dificultades, súper de cartas + movimientos EX, parry,
   tienda con tendero, escenarios temáticos y soporte de mando.
   Todo el arte/música es original.
   ============================================================ */
(() => {
  "use strict";
  const cv = document.getElementById("game");
  const ctx = cv.getContext("2d");
  const W = 1280, H = 720, GROUND = 624;
  const TAU = Math.PI * 2;

  /* ---------------- utilidades ---------------- */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const randi = (a, b) => Math.floor(rand(a, b + 1));
  const pick = arr => arr[(Math.random() * arr.length) | 0];
  const circRect = (cx, cy, r, rx, ry, rw, rh) => {
    const nx = clamp(cx, rx, rx + rw), ny = clamp(cy, ry, ry + rh);
    const dx = cx - nx, dy = cy - ny; return dx * dx + dy * dy <= r * r;
  };
  const aabb = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

  /* ============================================================
     ENTRADA — teclado + mando, estado de acciones unificado
     ============================================================ */
  const KEYMAP = {
    left: ["ArrowLeft", "KeyA"], right: ["ArrowRight", "KeyD"],
    up: ["ArrowUp", "KeyW"], down: ["ArrowDown", "KeyS"],
    jump: ["KeyZ", "Space"], shoot: ["KeyX"], dash: ["KeyC"],
    super: ["KeyV", "KeyB"], lock: ["ShiftLeft", "ShiftRight"], swap: ["KeyQ", "Tab"],
    pause: ["KeyP", "Escape"], confirm: ["Enter", "KeyZ", "Space"], back: ["Backspace", "Escape"],
  };
  // Jugador 2 por teclado (lado derecho): IJKL mover · U salto · O disparo · P dash · M especial · ; fijar · , cambiar
  const KEYMAP2 = {
    left: ["KeyJ"], right: ["KeyL"], up: ["KeyI"], down: ["KeyK"],
    jump: ["KeyU"], shoot: ["KeyO"], dash: ["KeyP"], super: ["KeyM"],
    lock: ["Semicolon"], swap: ["Comma"], pause: ["Escape"], confirm: ["KeyU"], back: ["Period"],
  };
  const ACTIONS = ["left", "right", "up", "down", "jump", "shoot", "dash", "super", "lock", "swap", "pause", "confirm", "back", "navL", "navR", "navU", "navD"];
  // --- botones configurables (teclado J1 + mando) ---
  const REBIND = ["jump", "shoot", "dash", "super", "lock", "swap"];
  const REBIND_NAME = { jump: "Saltar / Parry", shoot: "Disparar", dash: "Dash / Esquivar", super: "Especial (EX/Súper)", lock: "Apuntado fijo", swap: "Cambiar arma" };
  const KEYMAP_DEF = {}; for (const k in KEYMAP) KEYMAP_DEF[k] = KEYMAP[k].slice();
  const PADMAP_DEF = { jump: 0, shoot: 2, dash: 1, super: 3, lock: 7, swap: 4 };
  let padMap = Object.assign({}, PADMAP_DEF);
  let capture = null, padCaptureArmed = false, keysFocus = 0;
  function applyBindings() {
    for (const a of REBIND) {
      KEYMAP[a] = (OPT.keys && OPT.keys[a]) ? [OPT.keys[a]] : KEYMAP_DEF[a].slice();
      padMap[a] = (OPT.pad && OPT.pad[a] != null) ? OPT.pad[a] : PADMAP_DEF[a];
    }
  }
  const KEY_LABELS = { Space: "Espacio", ShiftLeft: "⇧ Izq", ShiftRight: "⇧ Der", ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→", Enter: "Intro", Backspace: "Borrar", Escape: "Esc", Tab: "Tab", ControlLeft: "Ctrl", ControlRight: "Ctrl", AltLeft: "Alt", Semicolon: "; ", Comma: ",", Period: ".", Slash: "/", Minus: "-", Equal: "=" };
  function keyLabel(code) { if (!code) return "—"; if (KEY_LABELS[code]) return KEY_LABELS[code]; return code.replace(/^Key/, "").replace(/^Digit/, "").replace(/^Numpad/, "Num "); }
  const PAD_LABELS = ["Ⓐ", "Ⓑ", "Ⓧ", "Ⓨ", "LB", "RB", "LT", "RT", "Select", "Start", "L3", "R3", "▲", "▼", "◀", "▶"];
  function padLabel(i) { return i == null ? "—" : (PAD_LABELS[i] || ("B" + i)); }
  const downC = new Set();
  const IN = [{ now: {}, pressed: {}, stick: { x: 0, y: 0, mag: 0 } }, { now: {}, pressed: {}, stick: { x: 0, y: 0, mag: 0 } }];
  let stickAim = IN[0].stick;
  let lastPad = null;
  let edgesOn = true;
  const held = a => !!IN[0].now[a];
  const tapped = a => edgesOn && !!IN[0].pressed[a];

  let mouse = { x: -99, y: -99 }, mClicked = false;

  /* ---------------- táctil (móvil) ---------------- */
  let touchOn = false, lockToggle = false;
  const touchAct = {};
  const pointers = new Map();
  const stick = { id: null, cx: 176, cy: 556, kx: 176, ky: 556, vx: 0, vy: 0, mag: 0, r: 98 };
  const TBTN = [
    { act: "shoot", x: 1046, y: 616, r: 64, label: "DISPARO", col: "#ff8a3a" },
    { act: "jump", x: 1190, y: 598, r: 68, label: "SALTO", col: "#7af0a0" },
    { act: "dash", x: 1200, y: 456, r: 54, label: "DASH", col: "#62b0ff" },
    { act: "super", x: 1046, y: 470, r: 54, label: "ESP.", col: "#ffd24a" },
    { act: "swap", x: 918, y: 558, r: 48, label: "ARMA", col: "#c98aff" },
    { act: "lock", x: 104, y: 300, r: 50, label: "FIJAR", col: "#e0a0ff", toggle: true },
  ];
  const TPAUSE = { x: 1244, y: 42, r: 28 }, TFULL = { x: 1180, y: 42, r: 28 }, TMUTE = { x: 1116, y: 42, r: 28 };
  const inCircle = (p, c) => Math.hypot(p.x - c.x, p.y - c.y) <= c.r + 12;
  const isPlaying = () => state === "fight" || state === "rng";

  const codeKeys = [];   // teclas capturadas para el panel de CÓDIGO del Mausoleo
  let editingName = false, nameBuffer = "";   // editor del nombre del ranking (pantalla de Récords)
  addEventListener("keydown", e => {
    // editor de nombre del leaderboard: teclea tu alias y Enter
    if (editingName && !e.repeat) {
      if (e.preventDefault) e.preventDefault();
      if (e.code === "Enter" || e.code === "NumpadEnter") { const n = nameBuffer.trim().toUpperCase().slice(0, 12); if (n) { OPT.name = n; saveOpts(); lbCache = null; if (pendingLb) { pendingLb.name = n; lbPost(pendingLb); pendingLb = null; } } editingName = false; AUDIO.sfx("confirm"); }
      else if (e.code === "Escape") { editingName = false; AUDIO.sfx("select"); }
      else if (e.code === "Backspace") { nameBuffer = nameBuffer.slice(0, -1); AUDIO.sfx("select"); }
      else if (e.key && e.key.length === 1 && /[A-Za-z0-9 ._\-ÁÉÍÓÚÑáéíóúñ]/.test(e.key) && nameBuffer.length < 12) { nameBuffer += e.key; AUDIO.sfx("select"); }
      return;
    }
    if (state === "keys" && capture && capture.dev === "kb" && !e.repeat) {   // reasignar tecla
      if (e.preventDefault) e.preventDefault();
      if (e.code !== "Escape") { OPT.keys = OPT.keys || {}; OPT.keys[capture.action] = e.code; applyBindings(); saveOpts(); AUDIO.sfx("confirm"); } else AUDIO.sfx("select");
      capture = null; return;
    }
    if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Tab"].includes(e.code)) e.preventDefault();
    if (!e.repeat && state === "code") codeKeys.push(e.code);
    if (!e.repeat) {
      if (e.code === "KeyM") AUDIO.toggleMute();
      if (e.code === "KeyF") toggleFull();
      if (e.code === "Digit1" && state !== "code") { coop = false; OPT.coop = false; saveOpts(); AUDIO.sfx("select"); }
      if (e.code === "Digit2" && state !== "code") { coop = true; OPT.coop = true; saveOpts(); AUDIO.sfx("select"); }
    }
    downC.add(e.code); AUDIO.resume();
  });
  addEventListener("keyup", e => downC.delete(e.code));
  addEventListener("blur", () => downC.clear());
  addEventListener("gamepadconnected", e => { padIndex = e.gamepad.index; });
  function canvasPos(e) {
    const r = cv.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) };
  }
  cv.addEventListener("mousemove", e => { mouse = canvasPos(e); });
  cv.addEventListener("mousedown", e => { mouse = canvasPos(e); mClicked = true; AUDIO.resume(); });

  function setStick(p) {
    let dx = p.x - stick.cx, dy = p.y - stick.cy; const d = Math.hypot(dx, dy), max = stick.r;
    if (d > max) { dx = dx / d * max; dy = dy / d * max; }
    stick.kx = stick.cx + dx; stick.ky = stick.cy + dy;
    stick.mag = Math.min(1, d / max); stick.vx = dx / max; stick.vy = dy / max;
  }
  function controlAt(p) {
    for (const b of TBTN) if (inCircle(p, b)) return { type: "btn", b };   // los botones tienen prioridad
    if (inCircle(p, { x: stick.cx, y: stick.cy, r: stick.r + 40 }) || (p.x < W * 0.44 && p.y > H * 0.34)) return { type: "stick" };
    return null;
  }
  cv.addEventListener("pointerdown", e => {
    if (e.pointerType === "mouse") return;        // el ratón usa mousedown
    touchOn = true; AUDIO.resume();
    const p = canvasPos(e); if (e.preventDefault) e.preventDefault();
    if (inCircle(p, TFULL)) { toggleFull(); return; }
    if (inCircle(p, TMUTE)) { AUDIO.toggleMute(); return; }
    if (isPlaying()) {
      if (inCircle(p, TPAUSE)) { touchAct.pause = true; pointers.set(e.pointerId, "pause"); return; }
      const hit = controlAt(p);
      if (hit) {
        if (hit.type === "stick") { stick.id = e.pointerId; setStick(p); pointers.set(e.pointerId, "stick"); }
        else if (hit.b.toggle) { lockToggle = !lockToggle; AUDIO.sfx("select"); haptic(14); pointers.set(e.pointerId, "tap"); }
        else { touchAct[hit.b.act] = true; haptic(12); pointers.set(e.pointerId, hit.b.act); }
      }
      return;
    }
    mouse = p; mClicked = true;                    // menús/overlays: tocar = clic
  });
  cv.addEventListener("pointermove", e => {
    if (e.pointerType === "mouse") return;
    if (pointers.get(e.pointerId) === "stick") { setStick(canvasPos(e)); if (e.preventDefault) e.preventDefault(); }
  });
  function endPointer(e) {
    const role = pointers.get(e.pointerId); if (role === undefined) return;
    if (role === "stick") { stick.id = null; stick.mag = 0; stick.vx = stick.vy = 0; stick.kx = stick.cx; stick.ky = stick.cy; }
    else if (role === "pause") touchAct.pause = false;
    else if (role !== "tap") touchAct[role] = false;
    pointers.delete(e.pointerId);
  }
  cv.addEventListener("pointerup", endPointer);
  cv.addEventListener("pointercancel", endPointer);

  function toggleFull() {
    try {
      if (!document.fullscreenElement) {
        if (cv.requestFullscreen) cv.requestFullscreen();
        if (typeof screen !== "undefined" && screen.orientation && screen.orientation.lock) screen.orientation.lock("landscape").catch(() => { });
      } else if (document.exitFullscreen) document.exitFullscreen();
    } catch (e) { }
  }

  function readPad(idx) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = pads && pads[idx] && pads[idx].connected ? pads[idx] : null;
    if (idx === 0 && gp) lastPad = gp;
    const out = { dirs: { l: false, r: false, u: false, d: false }, btn: {}, ax: 0, ay: 0 };
    if (!gp) return out;
    const b = i => gp.buttons[i] && (gp.buttons[i].pressed || gp.buttons[i].value > 0.5);
    const dz = 0.35, lx = gp.axes[0] || 0, ly = gp.axes[1] || 0;
    out.ax = lx; out.ay = ly;
    out.dirs.l = lx < -dz || b(14); out.dirs.r = lx > dz || b(15);
    out.dirs.u = ly < -dz || b(12); out.dirs.d = ly > dz || b(13);
    // botones configurables (por defecto: A salto · X disparo · B dash · Y EX/Súper · RT apuntado · LB cambiar · Start pausa)
    const PM = padMap;
    out.btn = { jump: b(PM.jump), shoot: b(PM.shoot), dash: b(PM.dash), super: b(PM.super), lock: b(PM.lock), swap: b(PM.swap) || (PM.swap === 4 && b(5)), pause: b(9), confirm: b(PM.jump), back: b(PM.dash) };
    return out;
  }
  function padConnected() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (let i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) return true;
    return false;
  }
  function buildInput(pi, km, padIdx) {
    const I = IN[pi], primary = pi === 0, gp = readPad(padIdx);
    const kb = a => km && km[a] && km[a].some(c => downC.has(c));
    const n = {};
    n.left = kb("left") || gp.dirs.l; n.right = kb("right") || gp.dirs.r;
    n.up = kb("up") || gp.dirs.u; n.down = kb("down") || gp.dirs.d;
    n.jump = kb("jump") || gp.btn.jump; n.shoot = kb("shoot") || gp.btn.shoot;
    n.dash = kb("dash") || gp.btn.dash; n.super = kb("super") || gp.btn.super;
    n.lock = kb("lock") || gp.btn.lock; n.swap = kb("swap") || gp.btn.swap;
    n.pause = kb("pause") || gp.btn.pause; n.confirm = kb("confirm") || gp.btn.confirm; n.back = kb("back") || gp.btn.back;
    if (primary) {
      for (const a of ["jump", "shoot", "dash", "super", "swap", "pause"]) if (touchAct[a]) n[a] = true;
      if (lockToggle) n.lock = true;
      if (stick.mag > 0.25) { if (stick.vx < -0.4) n.left = true; if (stick.vx > 0.4) n.right = true; if (stick.vy < -0.4) n.up = true; if (stick.vy > 0.4) n.down = true; }
    }
    n.navL = n.left; n.navR = n.right; n.navU = n.up; n.navD = n.down;
    I.pressed = {};
    for (const a of ACTIONS) { if (n[a] && !I.now[a]) I.pressed[a] = true; }
    I.now = n;
    const mag = Math.hypot(gp.ax, gp.ay);
    if (primary && stick.mag > 0.3) I.stick = { x: stick.vx, y: stick.vy, mag: stick.mag };
    else I.stick = mag > 0.5 ? { x: gp.ax, y: gp.ay, mag } : { x: 0, y: 0, mag: 0 };
  }
  function pollInput() {
    // En co-op con mando: el MANDO es el Jugador 1 y el TECLADO (botones del antiguo J1) pasa a ser el Jugador 2.
    if (coop && padConnected()) { buildInput(0, null, 0); buildInput(1, KEYMAP, 1); }
    else { buildInput(0, KEYMAP, 0); buildInput(1, KEYMAP2, 1); }
    stickAim = IN[0].stick;
  }
  function haptic(ms) { try { if (touchOn && navigator.vibrate && OPT.shake !== false) navigator.vibrate(ms); } catch (e) { } }
  function rumble(dur, strong, weak) {
    try {
      if (lastPad && lastPad.vibrationActuator)
        lastPad.vibrationActuator.playEffect("dual-rumble", { duration: dur * 1000, strongMagnitude: strong, weakMagnitude: weak });
    } catch (e) { }
    // vibración en móvil solo para golpes fuertes (parry, daño, K.O.), no en cada disparo/moneda
    if (touchOn && strong >= 0.35) haptic(Math.min(70, Math.round(dur * 1000)));
  }

  /* ---------------- guardado (3 ranuras) ---------------- */
  const SLOT_KEY = i => "ragtime_slot_" + i, OLD_KEY = "ragtime_save_v3", NSLOTS = 3;
  const DEFAULT_SAVE = () => ({
    coins: 0, ownedW: ["pea"], ownedC: [], equipW: ["pea", null], equipC: null, equipSuper: "beam",
    defeated: [], beatenNormal: [], beatenExpert: [], grades: {}, collectedCoins: {}, rngDone: {}, difficulty: "regular", world: 1,
    seenIntro: false, seenWorld: {}, finished: false, secretFound: false, secretDefeated: false, secretHinted: false, achAwarded: [], reverseDone: false, requiemUnlocked: false, requiemDefeated: false,
    stats: { parries: 0, deaths: 0, kills: 0, playtime: 0 }, bossBest: {},
  });
  function rawSlot(i) { try { const s = JSON.parse(localStorage.getItem(SLOT_KEY(i))); if (s && s.ownedW) return s; } catch (e) { } return null; }
  // % de avance: armas + amuletos comprados + run-n-gun completados + jefes (Normal o más).
  // Los jefes en Sencillo no suman. El primer 100% (armas+amuletos+run-n-gun+jefes en Normal) NO necesita el secreto.
  // El +100% de maestría se reparte entre los 15 jefes en Experto + EL DESCARTE (16): sin el secreto NO se llega al 200%.
  function slotProgress(s) {
    // El Mundo Extra (Reverso, world 5) es BONUS: no entra en el medidor 0–200% (que mide el juego principal).
    const mainW = Object.keys(WEAPONS).filter(k => !WEAPONS[k].world5 && !WEAPONS[k].bonus);
    const mainC = Object.keys(CHARMS).filter(k => !CHARMS[k].world5 && !CHARMS[k].bonus);
    const W = mainW.length, C = mainC.length, R = RNG_LEVELS.length;
    const mainB = BOSSES.filter(b => b.world <= 4), B = mainB.length, mainIds = mainB.map(b => b.id);
    const N = W + C + R + B;
    const wpn = Math.min((s.ownedW || []).filter(k => mainW.includes(k)).length, W);
    const chm = Math.min((s.ownedC || []).filter(k => mainC.includes(k)).length, C);
    const rng = RNG_LEVELS.filter(L => (s.rngDone || {})[L.id]).length;
    const bn = (s.beatenNormal || []).filter(id => mainIds.includes(id)).length;
    const bx = (s.beatenExpert || []).filter(id => mainIds.includes(id)).length;
    const base = (wpn + chm + rng + bn) * (100 / N);
    const mastery = (bx + (s.secretDefeated ? 1 : 0)) * (100 / (B + 1));
    return Math.max(0, Math.min(200, Math.round(base + mastery)));
  }
  function slotInfo(i) { const s = rawSlot(i); if (!s) return { used: false }; return { used: true, world: s.world || 1, bosses: (s.defeated || []).length, coins: s.coins || 0, finished: !!s.finished, diff: s.difficulty || "regular", secret: !!s.secretDefeated, pct: slotProgress(s) }; }
  let currentSlot = 0;
  let save = DEFAULT_SAVE();        // provisional hasta elegir ranura
  function loadSlot(i) { currentSlot = i; save = Object.assign(DEFAULT_SAVE(), rawSlot(i) || {}); DIFF = DIFFS[save.difficulty] || DIFFS.regular; checkAch(true); }
  function persist() { try { localStorage.setItem(SLOT_KEY(currentSlot), JSON.stringify(save)); } catch (e) { } }
  function deleteSlot(i) { try { localStorage.removeItem(SLOT_KEY(i)); } catch (e) { } }
  // migración: lleva el guardado antiguo a la ranura 1 si está libre
  try { if (!localStorage.getItem(SLOT_KEY(0)) && localStorage.getItem(OLD_KEY)) localStorage.setItem(SLOT_KEY(0), localStorage.getItem(OLD_KEY)); } catch (e) { }

  /* ---------------- armas y amuletos ---------------- */
  const WEAPONS = {
    pea: { name: "Guisante", price: 0, color: "#ffd24a", desc: "Disparo recto y fiable.", ex: "Súper Haba: balazo perforante enorme." },
    spread: { name: "Dispersión", price: 4, color: "#ff8a3a", desc: "Abanico de 5 balas. Brutal de cerca.", ex: "Estrella: 8 balas en todas direcciones." },
    chaser: { name: "Rastreador", price: 5, color: "#7af0c0", desc: "Balas teledirigidas débiles.", ex: "Enjambre: 6 buscadoras a la vez." },
    charge: { name: "Carga", price: 5, color: "#62b0ff", desc: "Mantén para soltar un cañonazo.", ex: "Cañón: carga máxima instantánea." },
    lobber: { name: "Bombardero", price: 4, color: "#c98aff", desc: "Bombas en arco que rebotan.", ex: "Pepino: bombazo de daño masivo.", w: 1 },
    boomerang: { name: "Búmeran", price: 6, color: "#7af0c0", desc: "Va y vuelve: golpea a la ida y a la vuelta.", ex: "Aspas orbitando a tu alrededor.", w: 2 },
    ray: { name: "Rayo", price: 6, color: "#ff5a8a", desc: "Haz continuo de corto alcance. Demoledor de cerca.", ex: "Relámpago que barre la pantalla.", w: 2 },
    wave: { name: "Onda", price: 5, color: "#62b0ff", desc: "Onda ancha y lenta que atraviesa enemigos.", ex: "Maremoto perforante gigante.", w: 2 },
    needle: { name: "Aguja", price: 7, color: "#e0f0ff", desc: "Agujas rapidísimas que atraviesan a todos.", ex: "Lluvia de agujas perforantes.", w: 3 },
    comet: { name: "Cometa", price: 7, color: "#ff9a3a", desc: "Cometa lento y pesado que persigue. Mucho daño.", ex: "Tres cometas teledirigidos.", w: 3 },
    // exclusivas del Mundo Extra (botín de jefes del Reverso de Tinta)
    mirror: { name: "Espejo", price: 0, color: "#bfe0ff", desc: "Cada disparo lanza un gemelo reflejado.", ex: "Cruz de espejos en cuatro direcciones.", world5: true },
    random: { name: "Aleatoria", price: 0, color: "#c8a8ff", desc: "Ráfaga rápida: cada disparo es el de un arma distinta, al azar.", ex: "El EX de un arma al azar.", world5: true },
    // ARMA PROHIBIDA del código 67676767: rota a propósito (bonus = fuera del medidor 0–200% y de la tienda hasta poseerla)
    brass: { name: "La Orquesta", price: 0, color: "#ffd24a", desc: "Toda la big band tocando a la vez. Absurda, exagerada, prohibida.", ex: "Big Band: 12 notas doradas teledirigidas que barren TODO.", bonus: true },
  };
  const RANDOM_POOL = ["pea", "spread", "chaser", "lobber", "boomerang", "ray", "wave", "needle", "comet", "mirror"];
  const CHARMS = {
    heart: { name: "Corazón", price: 3, desc: "+1 de vida. Un pelín menos de daño." },
    twin: { name: "Corazón Doble", price: 6, desc: "+2 de vida. Bastante menos daño." },
    coffee: { name: "Café", price: 4, desc: "La súper se llena sola con el tiempo." },
    smoke: { name: "Bomba de Humo", price: 5, desc: "El dash te vuelve invencible." },
    whet: { name: "Piedra de Afilar", price: 4, desc: "El dash daña a los enemigos." },
    magnet: { name: "Imán", price: 4, desc: "Atrae las monedas de los run-n-gun.", w: 2 },
    shield: { name: "Escudo", price: 6, desc: "Bloquea un golpe. Se rehace solo tras 22 s.", w: 2 },
    spring: { name: "Resorte", price: 5, desc: "Doble salto: un 2.º salto ROSA (parry) con más impulso.", w: 2 },
    feather: { name: "Pluma", price: 5, desc: "Mantén salto al caer para planear.", w: 3 },
    hourglass: { name: "Reloj de Arena", price: 7, desc: "Empiezas cada combate con 2 cartas de súper.", w: 3 },
    // exclusivos del Mundo Extra (botín de jefes del Reverso de Tinta)
    ballast: { name: "Plomada", price: 0, desc: "Inmune a la gravedad invertida del Reverso.", world5: true },
    echo: { name: "Eco", price: 0, desc: "Un reflejo tuyo dispara copias débiles de tus balas.", world5: true },
    // recompensa dorada de RÉQUIEM (jefe del código del Mausoleo)
    god: { name: "Dios", price: 0, desc: "Cada 8 s te vuelves invencible durante 2 s.", bonus: true },
  };
  // Daño y cadencia del DISPARO NORMAL (centralizado para balance). dps = dmg/cd.
  // Ninguna arma debe superar al guisante (la gratuita) de forma notable.
  const WTUNE = {
    pea:       { dmg: 5,   cd: 0.12 },  // ~42 dps · referencia
    spread:    { dmg: 3.6, cd: 0.42 },  // abanico de 5, corto alcance
    chaser:    { dmg: 3.9, cd: 0.14 },  // teledirigida, cómoda pero floja (antes 3.6: quedaba corta)
    lobber:    { dmg: 15,  cd: 0.5  },  // arco + salpicadura (antes 21)
    boomerang: { dmg: 6,   cd: 0.55 },  // golpea ida y vuelta (5 la dejó infrautilizada; ~22 dps efectivo)
    ray:       { dmg: 1.7, cd: 0.05 },  // haz a quemarropa (antes 2.0)
    wave:      { dmg: 6,   cd: 0.55 },  // onda perforante multi-impacto (antes 9)
    needle:    { dmg: 3.0, cd: 0.09 },  // rápida y perforante (antes 4.0)
    comet:     { dmg: 12,  cd: 0.72 },  // teledirigido cómodo pero FLOJO (~17 dps): antes 22→18→12
    mirror:    { dmg: 3.2, cd: 0.12 },  // Espejo: 2 balas (recta + reflejo TELEDIRIGIDO) -> ~53 dps efectivo (antes 4.0/~66: eclipsaba a todo el arsenal)
    // (Aleatoria no tiene entrada propia: en cada disparo elige un arma del pool y usa SU tuning)
  };
  const playerMaxHp = () => 3 + (save.equipC === "heart" ? 1 : 0) + (save.equipC === "twin" ? 2 : 0);
  const damageMult = () => (save.equipC === "twin" ? 0.82 : save.equipC === "heart" ? 0.9 : 1) * (DIFF.dmgTo || 1);

  /* ---------------- dificultad ---------------- */
  const DIFFS = {
    simple: { key: "simple", name: "Sencillo", hp: 0.66, atk: 1.45, tele: 1.5, dmgTo: 1.05, reward: 0.6, pspeed: 0.76, color: "#7ad08a", blurb: "Para calentar: jefes blandos, lentos y muy telegrafiados." },
    regular: { key: "regular", name: "Normal", hp: 1.0, atk: 1.12, tele: 1.18, dmgTo: 1.0, reward: 1.0, pspeed: 0.9, color: "#ffd24a", blurb: "Equilibrado y justo: ataques legibles y esquivables." },
    expert: { key: "expert", name: "Experto", hp: 1.18, atk: 0.86, tele: 0.9, dmgTo: 1.0, reward: 1.6, pspeed: 1.0, color: "#ff6a4a", blurb: "Para virtuosos del jazz. Rápido, pero siempre justo." },
    locura: { key: "locura", name: "Locura", hp: 1.35, atk: 0.66, tele: 0.7, dmgTo: 1.0, reward: 2.4, pspeed: 1.12, color: "#c050ff", blurb: "Solo para dementes: ataques feroces y casi sin aviso. Bullet-hell." },
  };
  let DIFF = DIFFS[save.difficulty] || DIFFS.regular;

  /* ---------------- opciones (globales, no por ranura) ---------------- */
  const OPT_KEY = "ragtime_opts";
  let OPT = { music: 0.55, sfx: 0.85, shake: true, coop: false, keys: {}, pad: {}, skin: "classic", name: "PIP" };
  try { const o = JSON.parse(localStorage.getItem(OPT_KEY)); if (o) OPT = Object.assign(OPT, o); } catch (e) { }
  if (!OPT.keys) OPT.keys = {}; if (!OPT.pad) OPT.pad = {};
  applyBindings();
  function saveOpts() { try { localStorage.setItem(OPT_KEY, JSON.stringify(OPT)); } catch (e) { } }
  function applyOpts() { if (AUDIO.setVol) AUDIO.setVol(OPT.music, OPT.sfx); }
  applyOpts();

  /* ============================================================
     LEADERBOARD ONLINE — almacén JSON público con CORS (sin cuenta).
     El cliente LEE la lista, mezcla tu récord y la REESCRIBE recortada.
     Se desactiva solo en Node (tests); sin bin/clave usa el respaldo local.
     Si el bin muriera, se crea otro gratis (ver LEADERBOARD.md).
     ============================================================ */
  // LB_BIN (id del bin público) NO es secreto: leer la tabla es público.
  // LB_KEY es la Master Key de una cuenta jsonbin DEDICADA SOLO A ESTE JUEGO (ver LEADERBOARD.md).
  // Riesgo asumido: es pública; lo peor que puede pasar es que manipulen la tabla (se regenera).
  const LB_BIN = "6a4f2dd6da38895dfe440a51";
  const LB_KEY = "$2a$10$z6kEFSza0qx5gInWTZze4eBH9YIRjaWB0nz74YXeBk.ozXVmQqm/C";
  const LB_BASE = "https://api.jsonbin.io/v3/b/";
  const lbHasNet = () => typeof fetch === "function" && typeof process === "undefined";
  // modo mundial = todo-o-nada: sin Access Key configurada, el juego va en Salón de la Fama local
  const lbCanRead = () => LB_BIN && LB_KEY && lbHasNet();
  const lbCanWrite = () => LB_BIN && LB_KEY && lbHasNet();
  let lbCache = null, lbBusy = false, lbSource = "local", lbBoss = {}, pendingLb = null;
  // respaldo local: tabla con TUS mejores tiempos de rush por dificultad (si no hay red/bin)
  function lbLocal() {
    const b = rushBest(), me = (OPT.name || "TÚ").toUpperCase();
    return Object.keys(b).filter(k => typeof b[k] === "number")
      .map(k => ({ name: me, time: b[k], diff: k, mine: true }))
      .sort((a, z) => a.time - z.time).slice(0, 8);
  }
  function lbFetch() {
    if (typeof process !== "undefined") return;   // tests
    if (!lbCanRead()) { if (!lbCache) { lbCache = lbLocal(); lbSource = "local"; } return; }
    if (lbBusy || lbCache) return;
    lbBusy = true;
    try {
      fetch(LB_BASE + LB_BIN + "/latest", { headers: { "X-Bin-Meta": "false" } })
        .then(r => r.json()).then(j => {
          const rush = (j && Array.isArray(j.rush)) ? j.rush : (Array.isArray(j) ? j : []);
          // récord mundial por JEFE (se enseña en la ficha del Mausoleo)
          lbBoss = {};
          (j && Array.isArray(j.boss) ? j.boss : []).forEach(e => { if (e && e.id && typeof e.time === "number" && (!lbBoss[e.id] || e.time < lbBoss[e.id].time)) lbBoss[e.id] = e; });
          const me = (OPT.name || "").toUpperCase(), seen = new Set();
          lbCache = rush.filter(e => e && typeof e.time === "number")
            .sort((a, z) => a.time - z.time)
            .filter(e => { const n = String(e.name || "?").toUpperCase(); if (seen.has(n)) return false; seen.add(n); return true; })   // cada jugador UNA vez (su mejor tiempo)
            .slice(0, 8)
            .map(e => (me && String(e.name || "").toUpperCase() === me ? Object.assign({ mine: true }, e) : e));
          lbSource = "online"; lbBusy = false;
        }).catch(() => { lbCache = lbLocal(); lbSource = "local"; lbBusy = false; });
    } catch (e) { lbCache = lbLocal(); lbSource = "local"; lbBusy = false; }
  }
  function lbPost(entry) {
    if (!lbCanWrite()) return;
    try {
      fetch(LB_BASE + LB_BIN + "/latest", { headers: { "X-Bin-Meta": "false" } })
        .then(r => r.json()).catch(() => ({})).then(data => {
          data = (data && typeof data === "object" && !Array.isArray(data)) ? data : {};
          const rush = Array.isArray(data.rush) ? data.rush : [];
          const boss = Array.isArray(data.boss) ? data.boss : [];
          const e = Object.assign({ at: Date.now() }, entry);
          if (entry.mode === "rush") rush.push(e); else boss.push(e);
          const byTime = (a, z) => a.time - z.time;
          const keepRush = rush.filter(x => x && typeof x.time === "number").sort(byTime).slice(0, 100);
          const keepBoss = boss.filter(x => x && typeof x.time === "number").sort(byTime).slice(0, 200);
          return fetch(LB_BASE + LB_BIN, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": LB_KEY }, body: JSON.stringify({ rush: keepRush, boss: keepBoss }) });
        }).then(() => { lbCache = null; }).catch(() => {});
    } catch (e) {}
  }

  /* ============================================================
     ESTADO GLOBAL DE COMBATE + API para los jefes
     ============================================================ */
  let bullets = [], projs = [], hazards = [], parts = [], enemies = [], coins = [];
  let boss = null, bossDef = null, bossIndex = 0, platforms = [];
  let shake = 0, flashScreen = 0, hitStop = 0, bossHpChip = 0;
  // Mundo extra (El Reverso de Tinta): gravedad invertible + tinta que sube
  let rev = { grav: 1, inkOn: false, inkT: 0, inkDur: 0, inkPeak: GROUND, inkY: GROUND };
  // mecánicas únicas de RÉQUIEM: eco de tinta (clon retardado), viento de fuelle y lápidas temporales
  let echoTrail = [], echoT = 0, windFx = 0, windT = 0;
  const echoGhost = () => echoTrail.length > 55 ? echoTrail[echoTrail.length - 56] : null;
  let superArtFx = null;
  let worldW = W, cam = { x: 0 };
  let curMode = "boss", curIndex = 0, curLevel = null;

  const G = {
    W, H, groundY: GROUND, player: null, get diff() { return DIFF; },
    rand, randi, pick, sfx: n => AUDIO.sfx(n),
    shake: n => { shake = Math.max(shake, n); },
    hitStop: n => { hitStop = Math.max(hitStop, n); },
    spawnProj(o) {
      // los proyectiles enemigos se ralentizan en dificultades fáciles (más esquivables)
      const ps = DIFF.pspeed || 1;
      if (ps !== 1 && !o.parry) { if (o.vx) o.vx *= ps; if (o.vy) o.vy *= ps; }
      const p = Object.assign({
        x: 0, y: 0, vx: 0, vy: 0, r: 10, grav: 0, life: o.life || 6, maxLife: o.life || 6,
        shape: "ball", color: "#fff", parry: false, damage: 1, hp: 0, noFloor: false,
        spin: rand(0, TAU), t: 0, walk: false,
      }, o);
      // los ataques que CAEN desde arriba se marcan "aéreos": llevan sombra-aviso y caída limitada
      if (!p.noFloor && p.grav > 0 && p.vy >= 0 && p.y < 90) p.aerial = true;
      projs.push(p);
    },
    spawnHazard(o) {
      o = Object.assign({ x: 0, y: 0, w: 40, h: 40, telegraph: 0.7, active: 0.6, vx: 0, type: "beam", color: "#fff", t: 0 }, o);
      o.telegraph *= DIFF.tele;
      hazards.push(o);
    },
    burst(x, y, o) {
      o = o || {}; const n = o.n || 8;
      for (let i = 0; i < n; i++) {
        const a = o.dir != null ? o.dir + rand(-0.6, 0.6) : rand(0, TAU);
        const sp = rand(o.smin || 1, o.smax || 5);
        parts.push({
          x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - (o.up || 0), grav: o.grav == null ? 0.2 : o.grav,
          life: rand(o.lmin || 0.3, o.lmax || 0.7), max: 0.7, r: rand(o.rmin || 2, o.rmax || 5),
          color: o.color || "#fff", shape: o.shape || "dot",
        });
        if (parts.length > 520) parts.shift();
      }
    },
    floatText(x, y, text, color) {
      parts.push({ x, y, vx: 0, vy: -1.2, grav: 0, life: 0.9, max: 0.9, r: 0, color: color || "#fff", shape: "text", text });
    },
    // --- mecánicas del Reverso ---
    setGrav(s) { rev.grav = s; },
    gravSign() { return rev.grav; },
    setInk(frac, dur) { rev.inkOn = true; rev.inkT = 0; rev.inkDur = dur || 3; rev.inkPeak = GROUND - clamp(frac, 0, 0.6) * 300; },
    // --- mecánicas únicas de RÉQUIEM ---
    startEcho(dur) { echoT = Math.max(echoT, dur); echoTrail.length = 0; },
    setWind(fx, dur) { windFx = fx; windT = dur; },
    raiseTomb(x) { platforms.push({ x: x - 34, y: GROUND - 92, w: 68, h: 92, tomb: true, until: time + 5 }); this.burst(x, GROUND - 40, { n: 14, color: "#8a8478", smin: 2, smax: 6, up: 3 }); this.shake(6); },
  };

  /* estadísticas del combate (para la nota final) */
  let fightStats = { time: 0, parries: 0, supers: 0, hit: false };

  /* ============================================================
     JUGADOR
     ============================================================ */
  // paletas: J1 = taza crema/roja/púrpura · J2 = jarra azul/verde
  const PLAYER_PALS = [
    { head: "#f6ecd6", head2: "#e2d2ac", rim: "#efe2c2", liquid: "#8a2da0", liquid2: "#bd7ad8", straw: "#e8434f", short: "#c0392b", shortDk: "#8f2418", shoe: "#7a1f16", shoe2: "#b5462f", cheek: "rgba(232,120,120,0.5)" },
    { head: "#dceffb", head2: "#a9cce8", rim: "#cfe6fb", liquid: "#2a8a5a", liquid2: "#6ad0a0", straw: "#ffd24a", short: "#2f6fb0", shortDk: "#1f4d80", shoe: "#1a4a6a", shoe2: "#3a86b0", cheek: "rgba(120,180,232,0.5)" },
  ];
  /* ---------------- TRAJES de Pip (paletas desbloqueables, selector en el título) ---------------- */
  const SKINS = [
    { id: "classic", name: "Clásica", pal: PLAYER_PALS[0], req: null, hint: "de serie" },
    { id: "mint", name: "Menta", req: s => (s.defeated || []).length >= 6, hint: "vence 6 jefes",
      pal: { head: "#eafbe8", head2: "#bfe3c0", rim: "#d8f0d4", liquid: "#2a8a5a", liquid2: "#6ad0a0", straw: "#e8434f", short: "#2e7d5b", shortDk: "#1d5a3e", shoe: "#14483a", shoe2: "#2e8a68", cheek: "rgba(120,210,150,0.5)" } },
    { id: "royal", name: "Real", req: s => Object.values(s.grades || {}).includes("S"), hint: "saca una nota S",
      pal: { head: "#ffe9a0", head2: "#e0b64e", rim: "#fff2c8", liquid: "#7a1020", liquid2: "#c0392b", straw: "#7a1020", short: "#a8781e", shortDk: "#7a551a", shoe: "#5a3a10", shoe2: "#a8781e", cheek: "rgba(255,190,90,0.5)" } },
    { id: "reverse", name: "Reverso", req: s => !!(s.seenWorld && s.seenWorld[5]), hint: "cruza el espejo",
      pal: { head: "#dceffb", head2: "#a9cce8", rim: "#cfe6fb", liquid: "#14243a", liquid2: "#3a5a7a", straw: "#bfe0ff", short: "#3a3358", shortDk: "#241e40", shoe: "#1a1430", shoe2: "#4a4472", cheek: "rgba(160,190,240,0.5)" } },
    { id: "shadow", name: "Sombra", req: s => !!s.finished, hint: "termina el juego",
      pal: { head: "#3a3444", head2: "#241e30", rim: "#4a4458", liquid: "#ff4fa3", liquid2: "#ff9ec8", straw: "#ff4fa3", short: "#1a1626", shortDk: "#0e0c18", shoe: "#0a0812", shoe2: "#2a2438", cheek: "rgba(255,79,163,0.35)" } },
    { id: "marble", name: "Mármol", req: s => !!s.requiemDefeated, hint: "vence a RÉQUIEM",
      pal: { head: "#efe9dc", head2: "#cfc5b0", rim: "#f6f0e4", liquid: "#ffd24a", liquid2: "#ffe9a0", straw: "#ffd24a", short: "#8a8478", shortDk: "#5a5548", shoe: "#3a3630", shoe2: "#6a655a", cheek: "rgba(255,210,74,0.4)" } },
  ];
  function skinUnlocked(sk) { if (!sk.req) return true; for (let i = 0; i < NSLOTS; i++) { const s = rawSlot(i); if (s && sk.req(s)) return true; } return false; }
  function skinPal() { const sk = SKINS.find(s => s.id === OPT.skin) || SKINS[0]; return skinUnlocked(sk) ? sk.pal : SKINS[0].pal; }
  function cycleSkin() {
    const open = SKINS.filter(skinUnlocked);
    const cur = Math.max(0, open.findIndex(s => s.id === OPT.skin));
    OPT.skin = open[(cur + 1) % open.length].id; saveOpts(); AUDIO.sfx("select");
  }
  const player = {
    x: 180, y: GROUND - 72, w: 40, h: 72, vx: 0, vy: 0,
    onGround: false, facing: 1, jumps: 0, jumpHeld: false, duck: false,
    dashT: 0, dashCD: 0, dashDir: 1, fireT: 0, chargeT: 0, charging: false,
    hp: 3, inv: 0, super: 0, dead: false, weaponIdx: 0, walkT: 0, aimX: 1, aimY: 0, muzzle: 0,
    inp: 0, ghost: 0, idx: 0, pinkJump: 0, parryGlow: 0, coyote: 0, jumpBuf: 0, pCombo: 0,
    H(a) { return !!IN[this.inp].now[a]; },
    T(a) { return edgesOn && !!IN[this.inp].pressed[a]; },
    reset() {
      this.x = 180; this.y = GROUND - this.h; this.vx = 0; this.vy = 0;
      this.onGround = false; this.facing = 1; this.jumps = 0; this.duck = false;
      this.dashT = 0; this.dashCD = 0; this.fireT = 0; this.chargeT = 0; this.charging = false;
      this.hp = playerMaxHp(); this.inv = 1; this.super = save.equipC === "hourglass" ? 200 : 0; this.dead = false; this.ghost = 0; this.slowT = 0; this.godT = 0; this.godInv = 0;
      this.weaponIdx = 0; this.aimX = 1; this.aimY = 0; this.muzzle = 0; this.pinkJump = 0; this.parryGlow = 0; this.coyote = 0; this.jumpBuf = 0; this.pCombo = 0; this.landT = 0; this.stepPh = 1; this.dropT = 0; this.parryBuf = 0; this.skidT = 0; this._exN = false;
      this.shield = save.equipC === "shield"; this.flight = false; this.shrink = 0;
      this.pal = this.idx === 0 ? skinPal() : (PLAYER_PALS[this.idx] || PLAYER_PALS[0]);   // P1 viste su traje elegido
      lockToggle = false;
    },
    maxJumps() { return save.equipC === "spring" ? 2 : 1; },
    curWeapon() { return save.equipW[this.weaponIdx] || save.equipW[0] || "pea"; },
    box() {
      if (this.flight) { const s = this.shrink > 0 ? 0.45 : 0.8, bw = this.w * s, bh = this.h * s; return { x: this.x + (this.w - bw) / 2, y: this.y + (this.h - bh) / 2, w: bw, h: bh }; }
      if (this.duck && this.onGround) return { x: this.x + 5, y: this.y + 34, w: this.w - 10, h: this.h - 34 };
      return { x: this.x + 4, y: this.y + 4, w: this.w - 8, h: this.h - 8 };
    },
    update(dt, edge) {
      if (this.flight) return this.flightUpdate(dt, edge);
      const held = a => this.H(a), tapped = a => this.T(a), stickAim = IN[this.inp].stick;
      const f = dt * 60;
      if (this.ghost > 0) return this.ghostUpdate(dt);
      if (this.dead) { this.vy += 0.62 * f; this.y += this.vy * f; return; }
      const gs = (save.equipC === "ballast") ? 1 : rev.grav;  // gravedad efectiva (la Plomada ignora la inversión del Reverso)
      if (this.inv > 0) this.inv -= dt;
      if (this.slowT > 0) this.slowT -= dt;   // petrificado por la Mirada de Piedra
      if (this.godInv > 0) this.godInv -= dt;
      if (save.equipC === "god") { this.godT = (this.godT || 0) + dt; if (this.godT >= 8) { this.godT = 0; this.inv = Math.max(this.inv, 2); this.godInv = 2; flashScreen = Math.max(flashScreen, 0.14); AUDIO.sfx("parry"); G.floatText(this.x + this.w / 2, this.y - 30, "¡DIOS!", "#ffd24a"); G.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 22, color: "#ffd24a", smin: 2, smax: 8 }); } } else this.godT = 0;
      // aviso de EX lista (cruzas las 100 de súper): un toque de atención, sin spam
      if (this.super >= 100 && !this._exN) { this._exN = true; if (isPlaying()) G.floatText(this.x + this.w / 2, this.y - 26, "¡EX LISTA!", "#4ad0e0"); }
      else if (this.super < 100 && this._exN) this._exN = false;
      // amuleto Escudo: se recompone solo tras 22 s (antes solo valía 1 vez por combate — muy caro para eso)
      if (save.equipC === "shield" && !this.shield && !this.dead) {
        this.shieldT = (this.shieldT || 0) + dt;
        if (this.shieldT >= 22) { this.shieldT = 0; this.shield = true; AUDIO.sfx("parry"); G.floatText(this.x + this.w / 2, this.y - 20, "¡ESCUDO REHECHO!", "#7af0ff"); G.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 10, color: "#7af0ff", smin: 1, smax: 5 }); }
      } else this.shieldT = 0;
      if (this.dashCD > 0) this.dashCD -= dt;
      if (this.muzzle > 0) this.muzzle -= dt;
      if (this.pinkJump > 0) this.pinkJump -= dt;
      if (this.parryGlow > 0) this.parryGlow -= dt;
      if (this.landT > 0) this.landT -= dt;
      if (this.dropT > 0) this.dropT -= dt;
      if (this.skidT > 0) this.skidT -= dt;
      // parry buffer: si pulsaste salto JUSTO antes de tocar lo rosa, el parry sale igual
      if (this.parryBuf > 0) { this.parryBuf -= dt; if (this.tryParry()) this.parryBuf = 0; }

      const lock = held("lock");
      const L = held("left"), R = held("right"), U = held("up"), D = held("down");
      this.duck = this.onGround && D && !L && !R && !lock && this.dashT <= 0;

      if (this.dashT > 0) {
        this.dashT -= dt; this.vx = this.dashDir * 12; this.vy = 0;
        if (save.equipC === "smoke") this.inv = Math.max(this.inv, 0.02);
        if (save.equipC === "whet") this.whetHit();
      } else {
        let mv = 0;
        if (!lock && !this.duck) { if (L) mv -= 1; if (R) mv += 1; }
        // derrape de dibujo animado al girar en seco mientras corres
        if (mv !== 0 && this.onGround && mv !== this.facing && Math.abs(this.vx) > 3 && this.skidT <= 0) {
          this.skidT = 0.14;
          G.burst(this.x + this.w / 2 - mv * 14, this.y + this.h - 2, { n: 5, color: "#e8dcc0", smin: 1, smax: 3.5, up: 0.8, grav: 0.06, lmin: 0.2, lmax: 0.35 });
        }
        this.vx = mv * (this.slowT > 0 ? 2.3 : 4.4);
        if (mv !== 0) this.facing = mv;
        if (edge && tapped("dash") && this.dashCD <= 0) {
          this.dashT = 0.18; this.dashCD = 0.55; this.dashDir = this.facing;
          if (save.equipC === "smoke") this.inv = Math.max(this.inv, 0.2);
          AUDIO.sfx("dash"); G.burst(this.x + this.w / 2, this.y + this.h, { n: 8, color: "#fff", smin: 1, smax: 4, up: 1, grav: 0.1 });
        }
      }

      if (edge && tapped("jump")) {
        if (D && this.onGround && gs > 0 && this.y + this.h < GROUND - 2) {
          // ABAJO + salto sobre una plataforma (no el suelo): te dejas caer a través
          this.dropT = 0.2; this.onGround = false; this.vy = 3; this.y += 6; this.duck = false;
          G.burst(this.x + this.w / 2, this.y + this.h, { n: 5, color: "#e8dcc0", smin: 1, smax: 3, up: -0.5, lmin: 0.15, lmax: 0.3 });
        }
        else if (!this.onGround && this.tryParry()) { /* parry consumió el salto */ }
        else if (this.onGround || (this.coyote > 0 && this.jumps === 0)) { this.dashT = 0; this.vy = -15 * gs; this.jumps = 1; this.onGround = false; this.jumpHeld = true; this.coyote = 0; AUDIO.sfx("jump"); }   // el salto CANCELA el dash (dash-jump)
        else if (this.jumps < this.maxJumps()) {
          // segundo salto (amuleto Resorte): salto "rosa" estilo parry, con más impulso
          this.dashT = 0; this.vy = -16.5 * gs; this.jumps++; this.jumpHeld = true; this.pinkJump = 0.4; AUDIO.sfx("parry");
          flashScreen = Math.max(flashScreen, 0.06);
          G.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 14, color: "#ff7ab8", smin: 1.5, smax: 5, grav: 0.03 });
        }
        else { this.jumpBuf = 0.13; this.parryBuf = 0.12; } // buffers: el salto se ejecuta al aterrizar y el parry si algo rosa llega enseguida
      }
      if (!held("jump")) this.jumpHeld = false;
      if (!this.jumpHeld && this.vy * gs < 0 && this.dashT <= 0) this.vy *= 0.86;

      if (this.dashT <= 0) {
        this.vy += 0.62 * f * gs;
        // caída rápida: mantén ABAJO en el aire para bajar antes (más control para castigar o esquivar)
        if (!this.onGround && D && this.vy * gs > 0 && !L && !R) this.vy += 0.5 * f * gs;
        const capV = (!this.onGround && D) ? 21 : 17;
        if (this.vy * gs > capV) this.vy = capV * gs;
      }
      if (save.equipC === "feather" && gs > 0 && !this.onGround && this.vy > 0 && held("jump")) { this.vy = Math.min(this.vy, 2.3); if (Math.random() < 0.3) G.burst(this.x + this.w / 2, this.y + this.h, { n: 1, color: "#cfeaff", smin: 0.5, smax: 1.5, grav: -0.05 }); }
      this.x += this.vx * f; this.y += this.vy * f;
      this.x = clamp(this.x, 10, worldW - 10 - this.w);

      const prevBottom = this.y + this.h - this.vy * f;
      const wasAir = !this.onGround, fallV = this.vy * gs;
      this.onGround = false;
      if (gs > 0) {
        if (this.y + this.h >= GROUND) { this.y = GROUND - this.h; this.vy = 0; this.onGround = true; this.jumps = 0; }
        if (this.dropT <= 0) for (const p of platforms) {   // mientras dropT>0 se atraviesan las plataformas
          if (this.vy >= 0 && prevBottom <= p.y + 6 && this.y + this.h >= p.y && this.x + this.w > p.x && this.x < p.x + p.w) {
            this.y = p.y - this.h; this.vy = 0; this.onGround = true; this.jumps = 0;
          }
        }
      } else {
        const CEIL = 78;   // gravedad invertida: el "suelo" pasa a ser el techo
        if (this.y <= CEIL) { this.y = CEIL; this.vy = 0; this.onGround = true; this.jumps = 0; }
      }
      // aterrizaje: squash + nubecita de polvo (principio de animación) + golpecito de cámara si caes fuerte
      if (this.onGround && wasAir && fallV > 7) {
        this.landT = 0.14;
        if (fallV > 13) shake = Math.max(shake, 3);
        G.burst(this.x + this.w / 2, gs > 0 ? this.y + this.h : this.y, { n: 6, color: "#e8dcc0", smin: 1, smax: 3.5, up: gs > 0 ? 1 : -1, grav: 0.08 * gs, lmin: 0.2, lmax: 0.4 });
      }
      // buffer de salto al aterrizar + coyote time
      if (this.onGround && this.jumpBuf > 0) { this.dashT = 0; this.vy = -15 * gs; this.jumps = 1; this.onGround = false; this.jumpHeld = true; this.jumpBuf = 0; AUDIO.sfx("jump"); }
      this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);
      this.jumpBuf = Math.max(0, this.jumpBuf - dt);

      this.computeAim(lock, L, R, U, D);

      if (save.equipC === "coffee") this.super = Math.min(500, this.super + 14 * dt);
      // un solo botón "Especial": Súper con 5 cartas, EX con 1+
      if (edge && tapped("super")) {
        if (this.super >= 500 && !superArtFx) this.fireSuperArt();
        else if (this.super >= 100) this.fireEX();
        else AUDIO.sfx("deny");
      }

      if (edge && tapped("swap") && save.equipW[0] && save.equipW[1]) {
        this.weaponIdx ^= 1; AUDIO.sfx("select");
        G.floatText(this.x + this.w / 2, this.y - 10, WEAPONS[this.curWeapon()].name, "#fff");
      }

      this.shoot(dt);
      // ocio: si Pip se queda quieto, marca el compás (animación de espera)
      if (this.vx === 0 && this.onGround && !held("shoot") && !this.charging && !this.duck) this.idleT = (this.idleT || 0) + dt;
      else this.idleT = 0;
      if (this.vx !== 0 && this.onGround && !this.duck) {
        this.walkT += dt * 12;
        // polvillo en cada zancada (cuando el pie toca el suelo)
        const ph = Math.sign(Math.sin(this.walkT)) || 1;
        if (ph !== this.stepPh) { this.stepPh = ph; G.burst(this.x + this.w / 2 - this.facing * 12, gs > 0 ? this.y + this.h - 2 : this.y + 2, { n: 2, color: "#e8dcc0", smin: 0.5, smax: 2, up: 0.6 * gs, grav: 0.05 * gs, lmin: 0.15, lmax: 0.3 }); }
      } else this.walkT = 0;
    },
    flightUpdate(dt, edge) {
      const held = a => this.H(a), tapped = a => this.T(a), stickAim = IN[this.inp].stick;
      const f = dt * 60;
      if (this.ghost > 0) return this.ghostUpdate(dt);
      if (this.dead) { this.vy += 0.4 * f; this.y += this.vy * f; this.x -= 2 * f; return; }
      if (this.inv > 0) this.inv -= dt;
      if (this.dashCD > 0) this.dashCD -= dt;
      if (this.muzzle > 0) this.muzzle -= dt;
      if (this.pinkJump > 0) this.pinkJump -= dt;
      if (this.parryGlow > 0) this.parryGlow -= dt;
      if (this.shrink > 0) { this.shrink -= dt; this.inv = Math.max(this.inv, 0.02); }
      let mvx, mvy;
      if (stickAim.mag > 0.4) { mvx = stickAim.x; mvy = stickAim.y; }
      else { mvx = (held("right") ? 1 : 0) - (held("left") ? 1 : 0); mvy = (held("down") ? 1 : 0) - (held("up") ? 1 : 0); }
      const mag = Math.hypot(mvx, mvy); if (mag > 1) { mvx /= mag; mvy /= mag; }
      this.tilt = lerp(this.tilt || 0, mvy * 0.26, 0.16);   // alabeo suave al subir/bajar
      this.x += mvx * 4.9 * f; this.y += mvy * 4.9 * f;
      if (mvx) this.facing = Math.sign(mvx);
      this.x = clamp(this.x, cam.x + 6, cam.x + W - 6 - this.w);
      this.y = clamp(this.y, 44, H - 60 - this.h);
      // esquive (encoger)
      if (edge && tapped("dash") && this.dashCD <= 0) { this.shrink = 0.5; this.dashCD = 0.85; this.inv = Math.max(this.inv, 0.32); AUDIO.sfx("dash"); G.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 8, color: "#fff", smin: 1, smax: 4 }); }
      // parry con salto
      if (edge && tapped("jump")) this.tryParry();
      // en vuelo se dispara SOLO hacia delante (horizontal)
      this.aimX = this.facing; this.aimY = 0;
      // súper / EX
      if (save.equipC === "coffee") this.super = Math.min(500, this.super + 14 * dt);
      if (edge && tapped("super")) { if (this.super >= 500 && !superArtFx) this.fireSuperArt(); else if (this.super >= 100) this.fireEX(); else AUDIO.sfx("deny"); }
      if (edge && tapped("swap") && save.equipW[0] && save.equipW[1]) { this.weaponIdx ^= 1; AUDIO.sfx("select"); }
      this.shoot(dt);
    },
    computeAim(lock, L, R, U, D) {
      const stickAim = IN[this.inp].stick;
      let ax, ay;
      if (stickAim.mag > 0.5) {
        ax = Math.abs(stickAim.x) > 0.4 ? Math.sign(stickAim.x) : 0;
        ay = Math.abs(stickAim.y) > 0.4 ? Math.sign(stickAim.y) : 0;
      } else {
        ax = (R ? 1 : 0) - (L ? 1 : 0); ay = (D ? 1 : 0) - (U ? 1 : 0);
      }
      if (!lock && ay > 0 && this.onGround) ay = 0;
      if (ax === 0 && ay === 0) { ax = this.facing; ay = 0; }
      const m = Math.hypot(ax, ay) || 1;
      this.aimX = ax / m; this.aimY = ay / m;
    },
    shoot(dt) {
      const held = a => this.H(a);
      this.fireT -= dt;
      let wid = this.curWeapon();
      const shooting = held("shoot");
      // agachado también se dispara (cañón a ras de suelo, como en los clásicos)
      const mx = this.x + this.w / 2 + this.aimX * 26, my = this.y + (this.duck ? 50 : 26) + this.aimY * 20;
      if (save.equipC === "echo" && shooting) { this.echoT = (this.echoT || 0) - dt; if (this.echoT <= 0) { this.echoT = 0.32; bullets.push({ x: this.x + this.w / 2 - this.aimX * 28, y: my, vx: this.aimX * 12, vy: this.aimY * 12, r: 5, dmg: 2.4 * damageMult(), life: 1.2, color: "#cfe6ff", shape: "orb", homing: true }); } }
      if (wid === "charge") {
        if (shooting) { this.charging = true; this.chargeT += dt; }
        else if (this.charging) {
          this.charging = false;
          const c = clamp(this.chargeT / 0.9, 0, 1); this.chargeT = 0;
          this.muzzle = 0.08;
          bullets.push({ x: mx, y: my, vx: this.aimX * 16, vy: this.aimY * 16, r: lerp(6, 16, c), dmg: lerp(6, 34, c) * damageMult(), life: 1.0, color: c > 0.6 ? "#9fd0ff" : "#cfe6ff", shape: "charge", pierce: c > 0.6 });
          AUDIO.sfx(c > 0.5 ? "shootBig" : "shoot");
          G.burst(mx, my, { n: 6, color: "#bfe0ff", smin: 1, smax: 4 });
        }
        return;
      }
      if (!shooting || this.fireT > 0) return;
      const rnd = wid === "random"; if (rnd) wid = pick(RANDOM_POOL);   // Aleatoria: cada disparo, un arma del pool
      this.muzzle = 0.06;
      const dm = damageMult();
      if (wid === "pea") { this.fireT = WTUNE.pea.cd; bullets.push({ x: mx, y: my, vx: this.aimX * 15, vy: this.aimY * 15, r: 6, dmg: WTUNE.pea.dmg * dm, life: 0.95, color: "#ffe27a", shape: "pea" }); AUDIO.sfx("shoot"); }
      else if (wid === "spread") {
        this.fireT = WTUNE.spread.cd; const base = Math.atan2(this.aimY, this.aimX);
        for (let i = -2; i <= 2; i++) { const a = base + i * 0.2; bullets.push({ x: mx, y: my, vx: Math.cos(a) * 13, vy: Math.sin(a) * 13, r: 5, dmg: WTUNE.spread.dmg * dm, life: 0.34, color: "#ffae5a", shape: "pea" }); }
        AUDIO.sfx("shootBig");
      } else if (wid === "chaser") { this.fireT = WTUNE.chaser.cd; bullets.push({ x: mx, y: my, vx: this.aimX * 9, vy: this.aimY * 9, r: 6, dmg: WTUNE.chaser.dmg * dm, life: 2.6, color: "#7af0c0", shape: "orb", homing: true }); AUDIO.sfx("shoot"); }
      else if (wid === "lobber") { this.fireT = WTUNE.lobber.cd; bullets.push({ x: mx, y: my, vx: this.facing * 8, vy: -7, r: 10, dmg: WTUNE.lobber.dmg * dm, life: 2.2, color: "#c98aff", shape: "bomb", grav: 0.55, bounce: 1, splash: true }); AUDIO.sfx("shootBig"); }
      else if (wid === "boomerang") { this.fireT = WTUNE.boomerang.cd; bullets.push({ x: mx, y: my, vx: this.aimX * 13, vy: this.aimY * 13, r: 11, dmg: WTUNE.boomerang.dmg * dm, life: 1.3, color: "#7af0c0", shape: "boomerang", pierce: true, cd: 0, returns: true, t: 0, ox: this.aimX, oy: this.aimY, owner: this }); AUDIO.sfx("shootBig"); }
      else if (wid === "ray") { this.fireT = WTUNE.ray.cd; bullets.push({ x: mx, y: my, vx: this.aimX * 22, vy: this.aimY * 22, r: 5, dmg: WTUNE.ray.dmg * dm, life: 0.16, color: "#ff7ab0", shape: "ray", ang: Math.atan2(this.aimY, this.aimX) }); if (Math.random() < 0.4) AUDIO.sfx("shoot"); }
      else if (wid === "wave") { this.fireT = WTUNE.wave.cd; bullets.push({ x: mx, y: my, vx: this.aimX * 7, vy: this.aimY * 7, r: 20, dmg: WTUNE.wave.dmg * dm, life: 1.4, color: "#62b0ff", shape: "wave", pierce: true, cd: 0.12 }); AUDIO.sfx("shootBig"); }
      else if (wid === "needle") { this.fireT = WTUNE.needle.cd; bullets.push({ x: mx, y: my, vx: this.aimX * 17, vy: this.aimY * 17, r: 4, dmg: WTUNE.needle.dmg * dm, life: 1.0, color: "#eaf6ff", shape: "needle", ang: Math.atan2(this.aimY, this.aimX), pierce: true, cd: 0.1 }); if (Math.random() < 0.5) AUDIO.sfx("shoot"); }
      else if (wid === "comet") { this.fireT = WTUNE.comet.cd; bullets.push({ x: mx, y: my, vx: this.aimX * 7, vy: this.aimY * 7, r: 14, dmg: WTUNE.comet.dmg * dm, life: 3, color: "#ff9a3a", shape: "comet", homing: true }); AUDIO.sfx("shootBig"); }
      else if (wid === "mirror") { this.fireT = WTUNE.mirror.cd; const px = -this.aimY * 7, py = this.aimX * 7; bullets.push({ x: mx + px, y: my + py, vx: this.aimX * 15, vy: this.aimY * 15, r: 6, dmg: WTUNE.mirror.dmg * dm, life: 0.95, color: "#bfe0ff", shape: "pea" }); bullets.push({ x: mx - px, y: my - py, vx: this.aimX * 13, vy: this.aimY * 13, r: 6, dmg: WTUNE.mirror.dmg * dm, life: 1.7, color: "#9fd0ff", shape: "orb", homing: true }); AUDIO.sfx("shoot"); }
      else if (wid === "brass") {
        // La Orquesta (código 67676767): 3 notas doradas TELEDIRIGIDAS y PERFORANTES por ráfaga — exageradamente rota adrede
        this.fireT = 0.08;
        for (let i = -1; i <= 1; i++) bullets.push({ x: mx, y: my - i * 6, vx: this.aimX * 14, vy: this.aimY * 14 + i * 2.4, r: 8, dmg: 7 * dm, life: 1.6, color: "#ffd24a", shape: "orb", homing: true, pierce: true, cd: 0.14 });
        if (Math.random() < 0.6) AUDIO.sfx("shoot");
      }
      if (rnd) this.fireT = Math.min(this.fireT, 0.12);   // la Aleatoria dispara RÁPIDO aunque le toque un arma lenta
    },
    fireEX() {
      let wid = this.curWeapon(); if (wid === "random") wid = pick(RANDOM_POOL);
      const dm = damageMult();
      this.super -= 100; fightStats.supers++; this.muzzle = 0.12;
      const mx = this.x + this.w / 2 + this.aimX * 26, my = this.y + (this.duck ? 50 : 26) + this.aimY * 20;
      const a0 = Math.atan2(this.aimY, this.aimX);
      AUDIO.sfx("shootBig"); rumble(0.12, 0.4, 0.3); flashScreen = Math.max(flashScreen, 0.12);
      if (wid === "spread") { for (let i = 0; i < 8; i++) { const a = a0 + i * (TAU / 8); bullets.push({ x: mx, y: my, vx: Math.cos(a) * 12, vy: Math.sin(a) * 12, r: 8, dmg: 4.4 * dm, life: 0.8, color: "#ffd24a", shape: "orb" }); } }
      else if (wid === "chaser") { for (let i = 0; i < 6; i++) bullets.push({ x: mx, y: my, vx: rand(-6, 6), vy: rand(-8, -2), r: 8, dmg: 4 * dm, life: 3, color: "#7af0c0", shape: "orb", homing: true }); }
      else if (wid === "charge") bullets.push({ x: mx, y: my, vx: this.aimX * 18, vy: this.aimY * 18, r: 18, dmg: 26 * dm, life: 1.2, color: "#9fd0ff", shape: "charge", pierce: true, hits: 2 });
      else if (wid === "lobber") bullets.push({ x: mx, y: my, vx: this.facing * 9, vy: -8, r: 16, dmg: 28 * dm, life: 2.4, color: "#e0a0ff", shape: "bomb", grav: 0.5, bounce: 1, splash: true, pierce: true, hits: 4 });
      else if (wid === "boomerang") { for (let i = 0; i < 4; i++) { const a = a0 + i * (TAU / 4); bullets.push({ x: mx, y: my, vx: Math.cos(a) * 11, vy: Math.sin(a) * 11, r: 12, dmg: 5.5 * dm, life: 1.4, color: "#7af0c0", shape: "boomerang", pierce: true, cd: 0, returns: true, t: 0, ox: Math.cos(a), oy: Math.sin(a), owner: this }); } }
      else if (wid === "ray") { for (let i = 0; i < 5; i++) bullets.push({ x: mx, y: my, vx: this.aimX * 24, vy: this.aimY * 24 + (i - 2) * 1.2, r: 7, dmg: 3.4 * dm, life: 0.9, color: "#ff7ab0", shape: "ray", ang: a0, pierce: true, cd: 0 }); }
      else if (wid === "wave") bullets.push({ x: mx, y: my, vx: this.aimX * 8, vy: this.aimY * 8, r: 36, dmg: 6 * dm, life: 1.8, color: "#9fd0ff", shape: "wave", pierce: true, cd: 0 });
      else if (wid === "needle") { for (let i = 0; i < 7; i++) bullets.push({ x: mx, y: my, vx: this.aimX * 18 + (i - 3) * 0.7, vy: this.aimY * 18 + (i - 3) * 0.7, r: 5, dmg: 3.4 * dm, life: 1.1, color: "#eaf6ff", shape: "needle", ang: a0, pierce: true, cd: 0 }); }
      else if (wid === "comet") { for (let i = 0; i < 3; i++) bullets.push({ x: mx, y: my, vx: Math.cos(a0 + (i - 1) * 0.3) * 8, vy: Math.sin(a0 + (i - 1) * 0.3) * 8, r: 16, dmg: 11 * dm, life: 2.4, color: "#ff9a3a", shape: "comet", homing: true, pierce: true, cd: 0, hits: 3 }); }
      else if (wid === "mirror") { for (let k = -1; k <= 1; k++) bullets.push({ x: mx + (-this.aimY) * k * 18, y: my + this.aimX * k * 18, vx: this.aimX * 16, vy: this.aimY * 16, r: 9, dmg: 7 * dm, life: 1.0, color: "#bfe0ff", shape: "orb", pierce: true, cd: 0, hits: 3 }); }
      else if (wid === "brass") { for (let i = 0; i < 12; i++) { const a = a0 + i * (TAU / 12); bullets.push({ x: mx, y: my, vx: Math.cos(a) * 10, vy: Math.sin(a) * 10, r: 12, dmg: 9 * dm, life: 2.2, color: "#ffd24a", shape: "orb", homing: true, pierce: true, cd: 0.12, hits: 6 }); } }
      else bullets.push({ x: mx, y: my, vx: this.aimX * 18, vy: this.aimY * 18, r: 14, dmg: 18 * dm, life: 1.2, color: "#ffe27a", shape: "charge", pierce: true, hits: 3 });
      G.burst(mx, my, { n: 12, color: "#fff", smin: 2, smax: 6 });
    },
    fireSuperArt() {
      this.super = 0; fightStats.supers++; AUDIO.sfx("super"); flashScreen = 0.5; shake = 16; rumble(0.5, 0.9, 0.7);
      const art = save.equipSuper || "beam";
      if (art === "aegis") {
        this.inv = Math.max(this.inv, 3.0); this.shield = true;
        for (const o of projs) if (!o.core) o.dead = true;
        G.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 30, color: "#7af0ff", smin: 2, smax: 9 });
        G.floatText(this.x + this.w / 2, this.y - 10, "¡ÉGIDA!", "#7af0ff");
      } else if (art === "whirl") {
        this.inv = Math.max(this.inv, 0.8);
        if (this.hp < playerMaxHp()) this.hp++;
        const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
        for (const o of projs) if (!o.core && Math.hypot(o.x - cx, o.y - cy) < 210) o.dead = true;
        if (boss && !boss.dead) boss.hit(60);
        for (let i = 0; i < 26; i++) { const a = i / 26 * TAU; G.burst(cx + Math.cos(a) * 64, cy + Math.sin(a) * 64, { n: 1, color: "#ffd24a", smin: 2, smax: 6 }); }
        G.floatText(this.x + this.w / 2, this.y - 10, "¡TORBELLINO!", "#ffd24a");
      } else {
        superArtFx = { t: 0, dur: 1.0, dir: this.facing, who: this.idx };
        this.inv = Math.max(this.inv, 1.1);
      }
    },
    tryParry() {
      const bx = this.box();
      for (const o of players) if (o !== this && o.ghost && circRect(o.x + o.w / 2, o.y + o.h / 2, 48, bx.x - 16, bx.y - 16, bx.w + 32, bx.h + 32)) {
        o.ghost = 0; o.hp = 1; o.inv = 1.8; o.vy = -6; this.vy = -9; this.jumps = 1; this.inv = Math.max(this.inv, 0.3); this.parryGlow = 0.4;
        AUDIO.sfx("parry"); flashScreen = Math.max(flashScreen, 0.2); rumble(0.2, 0.4, 0.5);
        G.burst(o.x + o.w / 2, o.y + o.h / 2, { n: 22, color: "#9fe0ff", smin: 2, smax: 8 });
        G.floatText(o.x + o.w / 2, o.y - 16, "¡REVIVIDO!", "#9fe0ff"); return true;
      }
      for (const p of projs) {
        if (p.parry && circRect(p.x, p.y, p.r + 30, bx.x - 22, bx.y - 22, bx.w + 44, bx.h + 44)) {
          p.dead = true; this.vy = -11.5; this.jumps = 1; this.inv = Math.max(this.inv, 0.25); this.parryGlow = 0.4;
          this.pCombo++; fightStats.parries++;
          const cboBonus = 45 + Math.min(this.pCombo, 5) * 15;   // combo: cada parry seguido carga más súper
          this.super = Math.min(500, this.super + cboBonus);
          if (p.core && boss && boss.breakShield) boss.breakShield();
          if (p.duel && boss && !boss.dead) { boss.hit(52); G.burst(boss.getHitboxes()[0].x + 60, boss.getHitboxes()[0].y + 40, { n: 14, color: "#ffd24a", smin: 2, smax: 7 }); G.floatText(p.x, p.y - 30, "¡NOTA DEVUELTA!", "#ffd24a"); }
          hitStop = Math.max(hitStop, p.core ? 0.1 : 0.06);
          AUDIO.sfx("parry"); rumble(0.1, 0.2, 0.4); flashScreen = Math.max(flashScreen, 0.12);
          G.burst(p.x, p.y, { n: 16, color: "#ff8ac0", smin: 2, smax: 7 });
          G.floatText(p.x, p.y - 16, p.core ? "¡ESCUDO ROTO!" : (this.pCombo >= 2 ? "¡PARRY x" + this.pCombo + "!" : "¡PARRY!"), "#ff7ab8");
          return true;
        }
      }
      return false;
    },
    whetHit() {
      const b = this.box(), box = { x: b.x - 6, y: b.y - 6, w: b.w + 12, h: b.h + 12 };
      if (boss && !boss.dead) for (const hb of boss.getHitboxes()) if (aabb(box, hb)) { boss.hit(2.4); G.burst(this.x + this.facing * 30, this.y + 30, { n: 3, color: "#fff" }); }
      for (const p of projs) if (p.hp > 0 && circRect(p.x, p.y, p.r, box.x, box.y, box.w, box.h)) { p.hp -= 2; if (p.hp <= 0) killProj(p); }
    },
    hurt() {
      if (this.inv > 0 || this.dead) return;
      if (this.shield) { this.shield = false; this.inv = 0.9; AUDIO.sfx("parry"); flashScreen = 0.2; rumble(0.15, 0.4, 0.4); G.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 14, color: "#7af0ff", smin: 2, smax: 6 }); G.floatText(this.x + this.w / 2, this.y - 6, "¡ESCUDO!", "#7af0ff"); return; }
      this.hp--; this.inv = 1.4; this.pCombo = 0; fightStats.hit = true; AUDIO.sfx("hit"); shake = 12; flashScreen = 0.25; rumble(0.25, 0.7, 0.5);
      G.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 14, color: "#ff5a5a", smin: 2, smax: 6 });
      if (this.hp <= 0) {
        this.hp = 0; AUDIO.sfx("lose");
        if (coop) { this.ghost = 1; this.inv = 1; this.vx = 0; this.vy = -2; G.floatText(this.x + this.w / 2, this.y - 10, "¡revíveme!", "#9fe0ff"); }
        else { this.dead = true; this.vy = -10; this.vx = -this.facing * 4; }
      }
    },
    ghostUpdate(dt) {
      const f = dt * 60;
      this.inv = 1; this.shrink = 0; this.vx = 0; this.vy = 0;
      // el fantasma NO se controla: flota quieto donde caíste (se mece) hasta que el OTRO jugador te REVIVA con un parry
      const restY = GROUND - this.h - 38;
      this.y += (restY - this.y) * 0.05 * f;
      this.y = clamp(this.y, 60, GROUND - this.h);
    },
    drawGhost() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2 + Math.sin(time * 3) * 4;
      ctx.save(); ctx.globalAlpha = 0.55 + Math.sin(time * 6) * 0.15; ctx.lineJoin = "round";
      ctx.fillStyle = this.idx === 1 ? "#bfe0ff" : "#e8f0ff"; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(cx, cy - 6, 20, Math.PI, 0); ctx.lineTo(cx + 20, cy + 16);
      for (let i = 0; i < 4; i++) ctx.lineTo(cx + 20 - (i + 0.5) * 10, cy + 16 - (i % 2 ? 0 : 8)), ctx.lineTo(cx + 20 - (i + 1) * 10, cy + 16);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      pieEye(cx - 7, cy - 8, 5, 0); pieEye(cx + 7, cy - 8, 5, 0);
      // aureola
      ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(cx, cy - 28, 14, 5, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore();
      ctx.fillStyle = "#9fe0ff"; ctx.font = "bold 12px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText("P" + (this.idx + 1) + " — ¡parry para revivir!", cx, this.y - 14);
    },
    drawPlane() {
      const blink = this.inv > 0 && Math.floor(this.inv * 22) % 2 === 0;
      if (blink) return;
      const P = this.pal, s = this.shrink > 0 ? 0.55 : 1, cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      // humo del motor (nubecitas que quedan atrás)
      for (let i = 0; i < 3; i++) { const st = (time * 1.6 + i * 0.33) % 1; ctx.fillStyle = `rgba(230,225,215,${0.3 * (1 - st)})`; ctx.beginPath(); ctx.arc(cx - 42 - st * 26, cy + Math.sin(time * 6 + i * 2) * 4, 3 + st * 5, 0, TAU); ctx.fill(); }
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.tilt || 0); ctx.scale(s, s); ctx.lineJoin = "round"; ctx.lineCap = "round";
      // hélice
      ctx.save(); ctx.translate(34, 0); ctx.rotate(time * 30); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(0, 16); ctx.stroke(); ctx.restore();
      // alas
      ctx.fillStyle = P.short; roundRect(-18, -30, 26, 60, 6); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke();
      // fuselaje
      ctx.fillStyle = "#e8d28a"; ctx.beginPath(); ctx.moveTo(-34, -16); ctx.quadraticCurveTo(40, -18, 36, 0); ctx.quadraticCurveTo(40, 18, -34, 16); ctx.quadraticCurveTo(-44, 0, -34, -16); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      // cola
      ctx.fillStyle = P.short; ctx.beginPath(); ctx.moveTo(-30, -4); ctx.lineTo(-46, -22); ctx.lineTo(-30, -10); ctx.closePath(); ctx.fill(); ctx.stroke();
      // cabina (taza piloto)
      ctx.fillStyle = P.head; ctx.beginPath(); ctx.arc(0, -6, 15, 0, TAU); ctx.fill(); ctx.stroke();
      pieEye(-4, -8, 5, 0); pieEye(8, -8, 5, 0);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(2, -1, 4, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      if (this.parryGlow > 0) { ctx.globalAlpha = clamp(this.parryGlow / 0.4, 0, 1) * 0.85; ctx.fillStyle = "#ff4fa3"; ctx.beginPath(); ctx.arc(0, -6, 16, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      if (this.muzzle > 0) { ctx.fillStyle = "#fff6c0"; star(40, 0, 12, 6); ctx.fill(); }
      ctx.restore();
      if (this.shrink > 0) { ctx.strokeStyle = `rgba(180,240,255,${0.5 + Math.sin(time * 30) * 0.3})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, TAU); ctx.stroke(); }
    },
    draw() {
      if (this.ghost) return this.drawGhost();
      if (this.flight) return this.drawPlane();
      const blink = this.inv > 0 && this.godInv <= 0 && Math.floor(this.inv * 20) % 2 === 0;
      // la sombra cae sobre la PLATAFORMA que tienes debajo (no atraviesa hasta el suelo)
      let shY = GROUND;
      for (const pf of platforms) if (pf.x < this.x + this.w && pf.x + pf.w > this.x && pf.y >= this.y + this.h - 6 && pf.y < shY) shY = pf.y;
      const dsh = clamp(1 - (shY - (this.y + this.h)) / 420, 0.35, 1);
      ctx.fillStyle = `rgba(0,0,0,${0.28 * dsh})`;
      ctx.beginPath(); ctx.ellipse(this.x + this.w / 2, shY - 2, 28 * dsh, 8 * dsh, 0, 0, TAU); ctx.fill();
      // aura dorada del amuleto Dios (invencible)
      if (this.godInv > 0) {
        const cxp = this.x + this.w / 2, cyp = this.y + this.h / 2, pu = 0.6 + Math.sin(time * 10) * 0.3;
        ctx.save(); ctx.globalCompositeOperation = "lighter"; const gg = ctx.createRadialGradient(cxp, cyp, 6, cxp, cyp, 46); gg.addColorStop(0, `rgba(255,222,120,${pu * 0.5})`); gg.addColorStop(1, "rgba(255,222,120,0)"); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(cxp, cyp, 46, 0, TAU); ctx.fill(); ctx.restore();
        ctx.strokeStyle = `rgba(255,210,74,${0.6 + pu * 0.3})`; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.ellipse(cxp, this.y - 5, 16, 5, 0, 0, TAU); ctx.stroke();
      }
      // aro rosa de "salto parry" (amuleto Resorte)
      if (this.pinkJump > 0 || this.parryGlow > 0) { const k = clamp(Math.max(this.pinkJump, this.parryGlow) / 0.4, 0, 1); ctx.save(); ctx.globalAlpha = k * 0.9; ctx.strokeStyle = "#ff7ab8"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(this.x + this.w / 2, this.y + this.h / 2, 22 + (1 - k) * 30, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; ctx.restore(); }
      if (blink) return;
      const P = this.pal, cx = this.x + this.w / 2, duck = this.duck, top = this.y + (duck ? 22 : 0);
      const lean = clamp(this.vx * 0.5, -7, 7), air = !this.onGround, ang = Math.atan2(this.aimY, this.aimX);
      const swing = Math.sin(this.walkT);
      const gsP = (save.equipC === "ballast") ? 1 : rev.grav;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      // estelas de velocidad durante el dash
      if (this.dashT > 0) {
        ctx.save(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.lineCap = "round";
        for (let i = 0; i < 3; i++) { const ly2 = this.y + 16 + i * 20; ctx.globalAlpha = 0.45 - i * 0.12; ctx.beginPath(); ctx.moveTo(cx - this.dashDir * (28 + i * 12), ly2); ctx.lineTo(cx - this.dashDir * (62 + i * 18), ly2); ctx.stroke(); }
        ctx.restore(); ctx.globalAlpha = 1;
      }
      // ----- squash & stretch (pivote en los pies) -----
      let sqx = 1, sqy = 1;
      if (this.dashT > 0) { sqx = 1.16; sqy = 0.9; }
      else if (this.skidT > 0) { sqx = 1.1; sqy = 0.94; }   // derrape: se aplasta un poco
      else if (air) { sqy = 1 + clamp(Math.abs(this.vy) * 0.011, 0, 0.15); sqx = 2 - sqy; }
      if (this.landT > 0) { const k = clamp(this.landT / 0.14, 0, 1); sqy = 1 - 0.17 * k; sqx = 1 + 0.2 * k; }
      const pivY = gsP > 0 ? this.y + this.h : this.y;
      ctx.save(); ctx.translate(cx, pivY); ctx.scale(sqx, sqy); ctx.translate(-cx, -pivY);
      if (this.charging && this.chargeT > 0.72) ctx.translate((Math.random() - 0.5) * 1.8, (Math.random() - 0.5) * 1.4);   // tiembla al cargar al máximo
      const bobRun = (this.onGround && this.vx !== 0 && !duck) ? -Math.abs(Math.cos(this.walkT)) * 2.4 : 0;
      // ----- piernas (manguera de goma, con zancada y poses de aire) -----
      const legY = this.y + 48, footY = this.y + this.h;
      let lF, rF, lY = footY - 4, rY = footY - 4;
      if (duck) { lF = cx - 17; rF = cx + 17; }
      else if (this.dashT > 0) { lF = cx - 4 - this.dashDir * 14; rF = cx + 4 - this.dashDir * 20; lY = footY - 5; rY = footY - 9; }
      else if (air) {
        if (this.vy * gsP < 0) { lF = cx - 8 + this.facing * 4; rF = cx + 9 + this.facing * 5; lY = footY - 12; rY = footY - 7; }   // subiendo: recogidas
        else { lF = cx - 12 + this.facing * 7; rF = cx + 12 - this.facing * 2; lY = footY - 2; rY = footY - 9; }                     // cayendo: zancada
      }
      else {
        lF = cx - 11 - swing * 9; rF = cx + 11 + swing * 9; lY = footY - 4 - Math.max(0, swing) * 5; rY = footY - 4 - Math.max(0, -swing) * 5;
        if ((this.idleT || 0) > 3) rY -= Math.max(0, Math.sin(time * 6.6)) * 5;   // marca el compás con la punta del pie
      }
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 9;
      ctx.beginPath(); ctx.moveTo(cx - 6, legY); ctx.quadraticCurveTo(cx - 13, legY + 18, lF, lY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 6, legY); ctx.quadraticCurveTo(cx + 13, legY + 18, rF, rY); ctx.stroke();
      [[lF, lY], [rF, rY]].forEach(s => { ctx.save(); ctx.translate(s[0], s[1] + 1); ctx.scale(this.facing, 1); ctx.rotate(this.facing * swing * 0.08); ctx.fillStyle = P.shoe; ctx.beginPath(); ctx.ellipse(3, 0, 15, 8, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = "#1a120a"; ctx.stroke(); ctx.fillStyle = P.shoe2; ctx.beginPath(); ctx.ellipse(2, -3, 10, 3.5, 0, 0, TAU); ctx.fill(); ctx.restore(); });
      // ----- brazo libre (detrás del cuerpo): bombea al correr, se alza en el aire -----
      if (!duck) {
        const swA = air ? (this.vy * gsP < 0 ? -1.1 : 0.5) : swing * 0.9;
        ctx.save(); ctx.translate(cx - this.facing * 11, top + 30 + bobRun); ctx.rotate(this.facing * (0.5 + swA * 0.55));
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 8; ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(-3, 10, -1, 17); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-1, 19, 6, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.2; ctx.stroke();
        ctx.restore();
      }
      // ----- cuerpo (peto + tirantes) -----
      ctx.save(); ctx.translate(lean * 0.4, bobRun);
      const bgg = ctx.createLinearGradient(0, this.y + 28, 0, this.y + 58); bgg.addColorStop(0, P.short); bgg.addColorStop(1, P.shortDk);
      ctx.fillStyle = bgg; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5;
      roundRect(cx - 17, this.y + 28, 34, 30, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.14)"; roundRect(cx - 14, this.y + 30, 9, 24, 6); ctx.fill();
      ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(cx - 7, this.y + 44, 3, 0, TAU); ctx.arc(cx + 7, this.y + 44, 3, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 9, this.y + 30); ctx.lineTo(cx - 7, this.y + 14); ctx.moveTo(cx + 9, this.y + 30); ctx.lineTo(cx + 7, this.y + 14); ctx.stroke();
      ctx.restore();
      // ----- cabeza-taza (se inclina con la carrera y la caída) -----
      ctx.save(); ctx.translate(cx + lean, top + 22 + bobRun); ctx.rotate(lean * 0.012 + (air ? clamp(this.vy * gsP, -8, 8) * 0.008 * this.facing : 0));
      const hw = 24, hh = duck ? 30 : 40, hs = -this.facing;
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 9; ctx.beginPath(); ctx.arc(hs * (hw + 1), -2, 12, -1.15, 1.15); ctx.stroke();
      ctx.lineWidth = 4; ctx.strokeStyle = P.head2; ctx.beginPath(); ctx.arc(hs * (hw + 1), -2, 12, -1.15, 1.15); ctx.stroke();
      const hg = ctx.createLinearGradient(-hw, -hh, hw, hh); hg.addColorStop(0, P.head); hg.addColorStop(1, P.head2);
      ctx.fillStyle = hg; roundRect(-hw, -hh + 6, hw * 2, hh + 6, 15); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      const gl = ctx.createRadialGradient(-9, -hh + 16, 1, -9, -hh + 16, 24); gl.addColorStop(0, "rgba(255,255,255,0.5)"); gl.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gl; roundRect(-hw + 2, -hh + 8, hw * 2 - 4, hh, 14); ctx.fill();
      ctx.fillStyle = "rgba(0,0,0,0.08)"; roundRect(hw - 13, -hh + 9, 11, hh, 8); ctx.fill();
      ctx.fillStyle = P.rim; roundRect(-hw - 1, -hh - 2, hw * 2 + 2, 13, 8); ctx.fill(); ctx.lineWidth = 5; ctx.strokeStyle = "#1a120a"; ctx.stroke();
      // el líquido SE LADEA con la inercia (chapoteo) y la pajita se mece al revés
      const slosh = clamp(-this.vx * 1.1 - (air ? this.vy * gsP * 0.35 : 0), -6, 6);
      ctx.save(); ctx.translate(0, -hh + 4); ctx.rotate(slosh * 0.045);
      ctx.fillStyle = P.liquid; ctx.beginPath(); ctx.ellipse(slosh * 0.4, 0, hw - 5, 6 + Math.abs(slosh) * 0.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = P.liquid2; ctx.beginPath(); ctx.ellipse(-6 + slosh * 0.6, -1, 7, 2.4, 0, 0, TAU); ctx.fill();
      ctx.restore();
      const strawX = 15 - slosh * 0.7;
      ctx.strokeStyle = P.straw; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(8, -hh + 4); ctx.quadraticCurveTo(12, -hh - 7, strawX, -hh - 17); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(strawX, -hh - 17, 3.5, 0, TAU); ctx.fill();
      pieEye(-9, -hh + 23, 8.5, ang); pieEye(9, -hh + 23, 8.5, ang);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; const br = clamp(this.aimY, -1, 1) * 3;
      ctx.beginPath(); ctx.moveTo(-15, -hh + 14 + br); ctx.lineTo(-4, -hh + 12 - br); ctx.moveTo(15, -hh + 14 + br); ctx.lineTo(4, -hh + 12 - br); ctx.stroke();
      ctx.fillStyle = "#caa"; ctx.beginPath(); ctx.arc(0, -hh + 31, 3, 0, TAU); ctx.fill();
      ctx.fillStyle = P.cheek; ctx.beginPath(); ctx.arc(-15, -hh + 32, 4.5, 0, TAU); ctx.arc(15, -hh + 32, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.beginPath();
      if (duck) ctx.arc(0, -hh + 38, 5, 1.15 * Math.PI, 1.85 * Math.PI); else ctx.arc(0, -hh + 35, 6, 0.12 * Math.PI, 0.88 * Math.PI);
      ctx.stroke();
      if (this.parryGlow > 0) { ctx.globalAlpha = clamp(this.parryGlow / 0.4, 0, 1) * 0.85; ctx.fillStyle = "#ff4fa3"; roundRect(-hw - 1, -hh - 2, hw * 2 + 2, hh + 14, 13); ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 3; ctx.stroke(); ctx.globalAlpha = 1; }
      ctx.restore();
      // ----- brazo + arma (también agachado: el cañón queda a ras de suelo) -----
      {
        const sx = cx + this.facing * 5, sy = top + 28 + bobRun;
        const gx = cx + this.aimX * 30, gy = top + 28 + bobRun + this.aimY * 26;
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + gx) / 2, (sy + gy) / 2 + 7, gx, gy); ctx.stroke();
        ctx.strokeStyle = P.head; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo((sx + gx) / 2, (sy + gy) / 2 + 7, gx, gy); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(gx, gy, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
        const wc = WEAPONS[this.curWeapon()].color;
        ctx.save(); ctx.translate(gx, gy); ctx.rotate(ang);
        ctx.fillStyle = "#3a3a46"; roundRect(2, -7, 19, 14, 4); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = wc; roundRect(17, -5, 9, 10, 3); ctx.fill(); ctx.stroke();
        if (this.muzzle > 0) { ctx.fillStyle = "#fff6c0"; star(30, 0, 13, 6); ctx.fill(); ctx.fillStyle = "#ffd24a"; star(30, 0, 7, 6); ctx.fill(); }
        if (this.charging && this.chargeT > 0.15) { const c = clamp(this.chargeT / 0.9, 0, 1); ctx.fillStyle = `rgba(150,205,255,${0.4 + Math.sin(time * 20) * 0.3})`; ctx.beginPath(); ctx.arc(27, 0, 6 + c * 12, 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      // notas que tararea mientras espera
      if ((this.idleT || 0) > 3) {
        const nk = ((time * 0.7) % 1);
        ctx.save(); ctx.globalAlpha = Math.sin(nk * Math.PI) * 0.85;
        ctx.fillStyle = "#ffd24a"; ctx.font = "16px Georgia"; ctx.textAlign = "center";
        ctx.save(); ctx.translate(cx + this.facing * 20 + Math.sin(time * 2.5) * 4, this.y - 14 - nk * 22); ctx.rotate(Math.sin(time * 3) * 0.25); ctx.fillText(nk > 0.5 ? "♪" : "♩", 0, 0); ctx.restore();
        ctx.restore(); ctx.globalAlpha = 1;
      }
      ctx.restore();   // fin del squash & stretch
    },
  };
  /* ---------------- jugadores (1 o 2 en co-op) ---------------- */
  let coop = !!OPT.coop, player2 = null, players = [player];
  const aliveList = () => players.filter(p => !p.dead && !p.ghost);
  function bossAnchor() { if (boss) { const hb = boss.getHitboxes()[0]; return { x: hb.x + hb.w / 2, y: hb.y + hb.h / 2 }; } return { x: W / 2, y: GROUND }; }
  function nearestPlayer(pt) { const a = aliveList(); if (!a.length) return player; let best = a[0], bd = 1e18; for (const p of a) { const d = (p.x - pt.x) ** 2 + (p.y - pt.y) ** 2; if (d < bd) { bd = d; best = p; } } return best; }
  Object.defineProperty(G, "player", { get() { return nearestPlayer(bossAnchor()); } });
  function spawnPlayers(bx, by, flight) {
    if (coop) { if (!player2) player2 = Object.assign({}, player); players = [player, player2]; }
    else players = [player];
    players.forEach((p, i) => { p.idx = i; p.inp = i; p.reset(); p.flight = !!flight; p.x = bx + i * 80; p.y = by; });
  }

  /* ============================================================
     PROYECTILES / BALAS / PELIGROS / PARTÍCULAS
     ============================================================ */
  function killProj(p) {
    p.dead = true; G.burst(p.x, p.y, { n: 6, color: p.color, smin: 1, smax: 4 });
  }
  let bossHitSfxT = 0;

  function updateProjs(dt) {
    const f = dt * 60;
    for (const o of projs) {
      o.t += dt; o.life -= dt; o.spin += dt * 6;
      const tgt = nearestPlayer({ x: o.x, y: o.y }), tc = { x: tgt.x + tgt.w / 2, y: tgt.y + tgt.h / 2 };
      if (o.homing && o.homeTime > 0) {
        o.homeTime -= dt;
        const tx = tc.x - o.x, ty = tc.y - o.y, d = Math.hypot(tx, ty) || 1;
        o.vx = lerp(o.vx, tx / d * (o.speed || 4), clamp((o.homeStr || 2) * dt, 0, 1));
        o.vy = lerp(o.vy, ty / d * (o.speed || 4), clamp((o.homeStr || 2) * dt, 0, 1));
      }
      if (o.walk) { const dir = Math.sign(tc.x - o.x) || -1; o.vx = lerp(o.vx, dir * 2.6, 0.1); }
      o.vy += o.grav * f; if (o.aerial && o.vy > 7) o.vy = 7; o.x += o.vx * f; o.y += o.vy * f;
      if (o.sine) o.y = o.sine.base + Math.sin(o.t * o.sine.f + (o.sine.ph || 0)) * o.sine.a;   // notas que ondulan
      if (o.cage) {   // jaula de fatuos: rodean al jugador, se cierran y disparan hacia dentro
        const c = o.cage;
        if (!c.lock) { c.cx = tc.x; c.cy = tc.y; if (o.t >= c.lockAt) c.lock = true; }
        c.r = Math.max(c.min, c.r - c.shrink * dt);
        o.x = c.cx + Math.cos(c.a) * c.r; o.y = Math.min(GROUND - 14, c.cy + Math.sin(c.a) * c.r);
        if (c.lock && c.r <= c.min) { const d = Math.hypot(c.cx - o.x, c.cy - o.y) || 1; o.vx = (c.cx - o.x) / d * 4.7; o.vy = (c.cy - o.y) / d * 4.7; o.cage = null; }
      }
      if (o.trailC && Math.random() < 0.55) G.burst(o.x, o.y, { n: 1, color: o.trailC, smin: 1, smax: 3, grav: 0.02 });
      if (!o.noFloor && o.y + o.r >= GROUND) {
        if (o.bounce) { o.y = GROUND - o.r; o.vy *= -0.5; o.bounce--; }
        else if (o.walk) { o.y = GROUND - o.r; o.vy = 0; }
        else killProj(o);
      }
      if (o.x < -120 || o.x > worldW + 120 || o.y > H + 140 || o.life <= 0) o.dead = true;
      if (!o.dead) for (const p of players) {
        if (p.inv <= 0 && !p.dead && !p.ghost) { const pb = p.box(); if (circRect(o.x, o.y, o.r, pb.x, pb.y, pb.w, pb.h)) { p.hurt(); if (!o.noFloor && !o.walk) o.dead = true; break; } }
      }
    }
    projs = projs.filter(o => !o.dead);
  }

  // objetivo más cercano POR DELANTE de la bala (jefe o enemigos del run-n-gun)
  function nearestTarget(x, y, vx) {
    let best = null, bd = 560 * 560; const dir = Math.sign(vx || 1);
    const consider = (ex, ey) => { if ((ex - x) * dir < -40) return; const d = (ex - x) * (ex - x) + (ey - y) * (ey - y); if (d < bd) { bd = d; best = { x: ex, y: ey }; } };
    for (const e of enemies) if (!e.dead) consider(e.x, e.y);
    for (const o of projs) if (o.hp > 0) consider(o.x, o.y);
    return best;
  }
  function updateBullets(dt) {
    const f = dt * 60;
    for (const b of bullets) {
      b.life -= dt;
      if (b.cd > 0) b.cd -= dt;
      if (b.homing) {
        let tx, ty, ok = false;
        if (boss && !boss.dead) { const hb = boss.getHitboxes()[0]; tx = hb.x + hb.w / 2 - b.x; ty = hb.y + hb.h / 2 - b.y; ok = true; }
        else { const t = nearestTarget(b.x, b.y, b.vx); if (t) { tx = t.x - b.x; ty = t.y - b.y; ok = true; } }
        if (ok) { const d = Math.hypot(tx, ty) || 1; b.vx = lerp(b.vx, tx / d * 10, 0.1); b.vy = lerp(b.vy, ty / d * 10, 0.1); }
      }
      if (b.returns) { // búmeran: sale y regresa al jugador más cercano
        b.t += dt; b.spin = (b.spin || 0) + dt * 22;
        if (b.t > 0.38) { const o = nearestPlayer({ x: b.x, y: b.y }), tx = (o.x + o.w / 2) - b.x, ty = (o.y + o.h / 2) - b.y, d = Math.hypot(tx, ty) || 1; b.vx = lerp(b.vx, tx / d * 15, 0.14); b.vy = lerp(b.vy, ty / d * 15, 0.14); if (d < 28 && b.t > 0.6) b.dead = true; }
      }
      if (b.grav) b.vy += b.grav * f;
      b.x += b.vx * f; b.y += b.vy * f;
      if (b.bounce && b.y + b.r >= GROUND) { b.y = GROUND - b.r; b.vy *= -0.6; b.vx *= 0.7; b.bounce--; }
      if (b.x < cam.x - 80 || b.x > cam.x + W + 80 || b.y > H + 80 || b.life <= 0) { if (!b.returns) { b.dead = true; continue; } }
      const canHit = b.cd === undefined || b.cd <= 0;
      if (canHit && boss && !boss.dead) {
        for (const hb of boss.getHitboxes()) {
          if (circRect(b.x, b.y, b.r, hb.x, hb.y, hb.w, hb.h)) {
            boss.hit(b.dmg); for (const pl of players) pl.super = Math.min(500, pl.super + b.dmg * 0.4 * (coop ? 0.7 : 1));
            G.burst(b.x, b.y, { n: 4, color: "#fff", smin: 1, smax: 3 });
            if (bossHitSfxT <= 0) { AUDIO.sfx("bosshit"); bossHitSfxT = 0.05; }
            if (b.splash) G.burst(b.x, b.y, { n: 10, color: b.color, smin: 2, smax: 6 });
            if (b.cd !== undefined || b.pierce) b.cd = 0.14;   // re-impacto limitado (antes pierce+cd indefinido golpeaba cada frame)
            if (b.hits !== undefined && --b.hits <= 0) b.dead = true;   // presupuesto de impactos: acota EX perforantes/teledirigidas
            if (!b.pierce) b.dead = true;
            break;
          }
        }
      }
      if (!b.dead) for (const o of projs) {
        if (o.hp > 0 && circRect(b.x, b.y, b.r, o.x - o.r, o.y - o.r, o.r * 2, o.r * 2)) {
          o.hp -= b.dmg; G.burst(b.x, b.y, { n: 3, color: "#fff" });
          if (o.hp <= 0) killProj(o);
          if (!b.pierce) { b.dead = true; break; }
        }
      }
    }
    bullets = bullets.filter(b => !b.dead);
    if (bossHitSfxT > 0) bossHitSfxT -= dt;
  }

  function updateHazards(dt) {
    const f = dt * 60;
    for (const h of hazards) {
      h.t += dt;
      if (h.telegraph > 0) { h.telegraph -= dt; continue; }
      if (h.active > 0) {
        h.active -= dt; h.x += (h.vx || 0) * f;
        if (h.type === "gaze") { // la Mirada de Piedra no golpea: PETRIFICA (te vuelve lento)
          for (const p of players) if (!p.dead && !p.ghost && aabb(p.box(), h)) { if (!(p.slowT > 0)) G.floatText(p.x + p.w / 2, p.y - 14, "¡PETRIFICADO!", "#cfc8b8"); p.slowT = Math.max(p.slowT || 0, 1.3); }
        }
        else if (h.type !== "serpentWarn") for (const p of players) if (p.inv <= 0 && !p.dead && !p.ghost && aabb(p.box(), h)) p.hurt();
        if ((h.type === "spout" || h.type === "tornado") && Math.random() < 0.6) G.burst(h.x + rand(0, h.w), h.y + rand(0, h.h * 0.3), { n: 1, color: h.color, smin: 0.5, smax: 2, grav: -0.1 });
      } else h.dead = true;
    }
    hazards = hazards.filter(h => !h.dead);
  }
  // El Reverso: la marea de tinta sube y baja (oleada esquivable con un salto) y daña a quien sumerja los pies
  function updateReverse(dt) {
    if (rev.inkOn) {
      // sube LENTO (telegrafiado) y baja RÁPIDO: así un solo salto la libra y aterrizar es seguro
      rev.inkT += dt; const u = rev.inkT / rev.inkDur, env = u < 0.5 ? u / 0.5 : Math.max(0, 1 - (u - 0.5) / 0.22);
      rev.inkY = GROUND - env * (GROUND - rev.inkPeak);
      if (rev.inkT >= rev.inkDur) { rev.inkOn = false; rev.inkY = GROUND; }
      // la marea visible NO daña: el peligro es la OLA que barre el suelo y se SALTA (hazard tipo "wave")
    } else rev.inkY = GROUND;
  }

  function updateSuperArt(dt) {
    if (!superArtFx) return;
    const b = superArtFx, p = players[b.who] || player, by = p.y + p.h / 2;
    const rx = b.dir > 0 ? p.x : cam.x, rw = b.dir > 0 ? (cam.x + W) - p.x : (p.x + p.w - cam.x);
    const rect = { x: rx, y: by - 55, w: rw, h: 110 };
    if (boss && !boss.dead) for (const hb of boss.getHitboxes()) if (aabb(rect, hb)) boss.hit(64 * dt);
    for (const e of enemies) if (!e.dead && circRect(e.x, e.y, e.r, rect.x, rect.y, rect.w, rect.h)) { e.hp -= 64 * dt; if (e.hp <= 0) { e.dead = true; G.burst(e.x, e.y, { n: 10, color: e.color }); } }
    for (const o of projs) if (!o.parry && circRect(o.x, o.y, o.r, rect.x, rect.y, rect.w, rect.h)) o.dead = true;
    if (Math.random() < 0.8) G.burst(rand(rect.x, rect.x + rect.w), by + rand(-40, 40), { n: 1, color: "#fff", smin: 1, smax: 5 });
    b.t += dt; if (b.t >= b.dur) superArtFx = null;
  }

  function updateParts(dt) {
    const f = dt * 60;
    for (const p of parts) { p.life -= dt; p.vy += (p.grav || 0) * f; p.x += p.vx * f; p.y += p.vy * f; }
    parts = parts.filter(p => p.life > 0);
  }

  /* ---------------- dibujo ---------------- */
  function drawProjs() {
    // sombra-aviso en el suelo para los ataques que caen desde arriba (más fáciles de reaccionar)
    for (const o of projs) if (o.aerial && o.y < GROUND - 24) {
      const k = clamp(1 - (GROUND - o.y) / 560, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.3 + k * 0.5; ctx.fillStyle = o.parry ? "#ff4fa3" : "#ff5a4a";
      ctx.beginPath(); ctx.ellipse(o.x, GROUND - 4, o.r + 5 + k * 7, 4 + k * 3, 0, 0, TAU); ctx.fill();
      ctx.globalAlpha = 0.5 + k * 0.4; ctx.strokeStyle = o.parry ? "#ff9ec8" : "#ffd24a"; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore();
    }
    for (const o of projs) {
      // hilo del núcleo de escudo a su jefe (deja claro que es suyo aunque salga por delante)
      if (o.core && o.hostX != null) { ctx.save(); ctx.strokeStyle = `rgba(255,90,170,${0.3 + Math.sin(time * 10) * 0.15})`; ctx.lineWidth = 3; ctx.setLineDash([6, 7]); ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.hostX, o.hostY); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
      ctx.save(); ctx.translate(o.x, o.y);
      if (o.parry) { ctx.fillStyle = `rgba(255,90,170,${0.25 + Math.sin(time * 12) * 0.15})`; ctx.beginPath(); ctx.arc(0, 0, o.r + 8, 0, TAU); ctx.fill(); }
      ctx.fillStyle = o.parry ? "#ff4fa3" : o.color; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3;
      if (o.shape === "serpent") {
        for (let i = 0; i < 6; i++) { ctx.fillStyle = o.color; ctx.beginPath(); ctx.arc(-i * 34, Math.sin(time * 6 - i * 0.6) * 14, o.r - i * 4, 0, TAU); ctx.fill(); ctx.stroke(); }
        ctx.fillStyle = "#2f8f5f"; ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(12, -10, 7, 0, TAU); ctx.fill();
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(14, -10, 3, 0, TAU); ctx.fill();
      } else if (o.shape === "walker") {
        ctx.rotate(Math.sin(o.t * 8) * 0.1);
        ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#7a3a1a"; ctx.fillRect(-o.r, -o.r - 6, o.r * 2, 8);
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-6, 0, 5, 0, TAU); ctx.arc(7, 0, 5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#000"; ctx.beginPath(); ctx.arc(-6, 1, 2.4, 0, TAU); ctx.arc(7, 1, 2.4, 0, TAU); ctx.fill();
      } else if (o.shape === "gear") {
        ctx.rotate(o.spin * 2); ctx.beginPath();
        for (let i = 0; i < 9; i++) { const a0 = i / 9 * TAU, a1 = (i + 0.5) / 9 * TAU; ctx.lineTo(Math.cos(a0) * o.r, Math.sin(a0) * o.r); ctx.lineTo(Math.cos(a0 + 0.13) * o.r * 1.3, Math.sin(a0 + 0.13) * o.r * 1.3); ctx.lineTo(Math.cos(a1 - 0.13) * o.r * 1.3, Math.sin(a1 - 0.13) * o.r * 1.3); ctx.lineTo(Math.cos(a1) * o.r, Math.sin(a1) * o.r); }
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#3a3a48"; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.34, 0, TAU); ctx.fill();
      } else if (o.shape === "rocket") {
        ctx.rotate(Math.atan2(o.vy, o.vx));
        ctx.beginPath(); ctx.moveTo(o.r, 0); ctx.lineTo(-o.r * 0.6, o.r * 0.7); ctx.lineTo(-o.r, 0); ctx.lineTo(-o.r * 0.6, -o.r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(-o.r, 0); ctx.lineTo(-o.r - 10 - Math.random() * 6, 0); ctx.lineTo(-o.r, 5); ctx.fill();
      } else if (o.shape === "bolt") {
        ctx.rotate(o.spin); star(0, 0, o.r + 2, 6); ctx.fillStyle = "#fff6c0"; ctx.fill(); star(0, 0, o.r, 6); ctx.fillStyle = o.parry ? "#ff4fa3" : o.color; ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      } else if (o.shape === "card") {
        ctx.rotate(o.spin); roundRect(-o.r * 0.7, -o.r, o.r * 1.4, o.r * 2, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = o.parry ? "#ff4fa3" : "#c0392b"; ctx.beginPath(); ctx.moveTo(0, -o.r * 0.4); ctx.lineTo(o.r * 0.4, 0); ctx.lineTo(0, o.r * 0.4); ctx.lineTo(-o.r * 0.4, 0); ctx.closePath(); ctx.fill();
      } else if (o.shape === "confetti") {
        ctx.rotate(o.spin * 3); ctx.fillRect(-o.r * 0.7, -o.r * 0.7, o.r * 1.4, o.r * 1.4); ctx.lineWidth = 2; ctx.strokeRect(-o.r * 0.7, -o.r * 0.7, o.r * 1.4, o.r * 1.4);
      } else if (o.shape === "icicle") {
        ctx.rotate(Math.atan2(o.vy, o.vx) - Math.PI / 2); ctx.beginPath(); ctx.moveTo(0, o.r * 1.4); ctx.lineTo(-o.r * 0.7, -o.r); ctx.lineTo(o.r * 0.7, -o.r); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(0, o.r); ctx.lineTo(-o.r * 0.25, -o.r * 0.6); ctx.lineTo(o.r * 0.1, -o.r * 0.6); ctx.closePath(); ctx.fill();
      } else if (o.shape === "dice") {
        ctx.rotate(o.spin); roundRect(-o.r, -o.r, o.r * 2, o.r * 2, 4); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#1a120a"; [[-0.4, -0.4], [0.4, 0.4], [-0.4, 0.4], [0.4, -0.4], [0, 0]].forEach(p => { ctx.beginPath(); ctx.arc(p[0] * o.r, p[1] * o.r, o.r * 0.16, 0, TAU); ctx.fill(); });
      } else if (o.shape === "snow") {
        ctx.rotate(o.spin); ctx.strokeStyle = o.parry ? "#ff4fa3" : "#bfe6ff"; ctx.lineWidth = 2.5; for (let i = 0; i < 3; i++) { ctx.rotate(Math.PI / 3); ctx.beginPath(); ctx.moveTo(-o.r, 0); ctx.lineTo(o.r, 0); ctx.stroke(); } ctx.fillStyle = "#eaf6ff"; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.35, 0, TAU); ctx.fill();
      } else {
        ctx.rotate(o.spin);
        if (o.shape === "bubble") ctx.globalAlpha = 0.8;
        ctx.beginPath(); ctx.arc(0, 0, o.r, 0, TAU); ctx.fill(); ctx.stroke();
        if (o.shape === "coin") { ctx.fillStyle = "#fff6c0"; ctx.font = "bold 14px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", 0, 1); }
        if (o.shape === "fire") { ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(0, 0, o.r * 0.5, 0, TAU); ctx.fill(); }
        if (o.shape === "larva") { ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(-3, -2, 2, 0, TAU); ctx.arc(4, -2, 2, 0, TAU); ctx.fill(); }
        if (o.shape === "feather") { ctx.strokeStyle = "#1a120a"; ctx.beginPath(); ctx.moveTo(-o.r, 0); ctx.lineTo(o.r, 0); ctx.stroke(); }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }
  }
  function drawHazards() {
    for (const h of hazards) {
      ctx.save();
      if (h.telegraph > 0) {
        const a = 0.25 + Math.sin(time * 18) * 0.2;
        ctx.fillStyle = h.type === "serpentWarn" ? `rgba(255,90,170,${a})` : `rgba(255,80,80,${a})`;
        if (h.type === "tornado" || h.type === "serpentWarn") { ctx.beginPath(); ctx.arc(h.x + h.w / 2, h.y + h.h / 2, 26 + Math.sin(time * 10) * 6, 0, TAU); ctx.fill(); }
        else ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.setLineDash([8, 8]); ctx.strokeStyle = "#ff5a5a"; ctx.lineWidth = 3; ctx.strokeRect(h.x, h.y, h.w, h.h);
      } else if (h.type === "tornado") {
        for (let i = 0; i < 6; i++) { const yy = h.y + (h.h / 6) * i, ww = h.w * (0.5 + 0.5 * Math.sin(time * 8 + i)); ctx.fillStyle = i % 2 ? "#cdb0ee" : "#b48ce0"; ctx.fillRect(h.x + (h.w - ww) / 2 + Math.sin(time * 10 + i) * 8, yy, ww, h.h / 6); }
      } else if (h.type === "laser") {
        ctx.fillStyle = "#ff7a7a"; ctx.fillRect(h.x, h.y, h.w, h.h); ctx.fillStyle = "#fff"; ctx.fillRect(h.x, h.y + h.h * 0.35, h.w, h.h * 0.3);
      } else if (h.type === "cloud") {
        ctx.fillStyle = "#e8f2fa"; for (let yy = 0; yy < h.h; yy += 46) { const wob = Math.sin(time * 6 + yy) * 8; ctx.beginPath(); ctx.arc(h.x + h.w / 2 + wob, h.y + yy + 23, 30, 0, TAU); ctx.arc(h.x + h.w / 2 - 18 + wob, h.y + yy + 30, 22, 0, TAU); ctx.arc(h.x + h.w / 2 + 18 + wob, h.y + yy + 30, 22, 0, TAU); ctx.fill(); }
        ctx.fillStyle = "rgba(120,150,200,0.25)"; ctx.fillRect(h.x, h.y, h.w, h.h);
      } else if (h.type === "gaze") {   // Mirada de Piedra: columna de luz dorada que petrifica
        const gg2 = ctx.createLinearGradient(h.x, 0, h.x + h.w, 0);
        gg2.addColorStop(0, "rgba(255,214,110,0)"); gg2.addColorStop(0.5, `rgba(255,214,110,${0.3 + Math.sin(time * 14) * 0.08})`); gg2.addColorStop(1, "rgba(255,214,110,0)");
        ctx.fillStyle = gg2; ctx.fillRect(h.x, h.y, h.w, h.h);
        ctx.fillStyle = "rgba(255,240,190,0.6)";
        for (let k = 0; k < 4; k++) { const sy2 = h.y + ((time * 130 + k * 97) % h.h); ctx.fillRect(h.x + h.w * (0.3 + (k % 3) * 0.2), sy2, 3, 12); }
        ctx.fillStyle = "rgba(255,214,110,0.45)"; ctx.beginPath(); ctx.ellipse(h.x + h.w / 2, h.y + h.h - 5, h.w * 0.5, 8, 0, 0, TAU); ctx.fill();
      } else if (h.type === "wave") {   // ola de tinta enroscada (avanza a la izquierda) con cresta de espuma
        const wx = h.x, wy = h.y, ww = h.w, wh = h.h;
        const wg = ctx.createLinearGradient(0, wy, 0, wy + wh); wg.addColorStop(0, shade(h.color, 1.45)); wg.addColorStop(0.5, h.color); wg.addColorStop(1, shade(h.color, 0.55));
        ctx.fillStyle = wg; ctx.strokeStyle = "#0e2230"; ctx.lineWidth = 3.5; ctx.lineJoin = "round";
        ctx.beginPath();
        ctx.moveTo(wx + ww, wy + wh); ctx.lineTo(wx + ww, wy + 30);
        ctx.quadraticCurveTo(wx + ww * 0.74, wy - 4, wx + ww * 0.46, wy + 12);    // hombro de la ola
        ctx.quadraticCurveTo(wx + ww * 0.14, wy + 24, wx + ww * 0.24, wy + 46);   // exterior del rizo
        ctx.quadraticCurveTo(wx + ww * 0.34, wy + 64, wx + ww * 0.08, wy + 60);   // labio del rizo
        ctx.quadraticCurveTo(wx - 8, wy + 74, wx + 16, wy + wh);                  // cae a la base
        ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = shade(h.color, 0.4); ctx.beginPath(); ctx.ellipse(wx + ww * 0.26, wy + 42, 13, 17, -0.5, 0, TAU); ctx.fill();   // hueco del rizo
        ctx.fillStyle = "#eaf6ff";
        for (const fp of [[0.5, 8, 5], [0.66, 4, 4], [0.36, 6, 4], [0.2, 16, 4]]) { ctx.beginPath(); ctx.arc(wx + ww * fp[0], wy + fp[1] + Math.sin(time * 7 + fp[0] * 9) * 3, fp[2], 0, TAU); ctx.fill(); }
        ctx.fillStyle = "rgba(234,246,255,0.8)"; ctx.beginPath(); ctx.arc(wx + ww * 0.1, wy + 56, 3.5, 0, TAU); ctx.arc(wx + ww * 0.3, wy + 30, 3, 0, TAU); ctx.fill();
      } else { ctx.fillStyle = h.color; ctx.fillRect(h.x, h.y, h.w, h.h); ctx.fillStyle = "rgba(255,255,255,0.4)"; ctx.fillRect(h.x + h.w * 0.3, h.y, h.w * 0.18, h.h); }
      ctx.restore();
    }
  }
  function drawBullets() {
    for (const b of bullets) {
      ctx.save(); ctx.translate(b.x, b.y); ctx.fillStyle = b.color; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2;
      // halo aditivo: las balas relucen como en un dibujo animado de los 30
      ctx.save(); ctx.globalCompositeOperation = "lighter"; ctx.globalAlpha = 0.55;
      const gl = ctx.createRadialGradient(0, 0, 0, 0, 0, b.r * 2.6);
      gl.addColorStop(0, b.color); gl.addColorStop(0.5, b.color); gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(0, 0, b.r * 2.6, 0, TAU); ctx.fill(); ctx.restore();
      if (b.shape === "bomb") { ctx.rotate(time * 8); roundRect(-b.r, -b.r, b.r * 2, b.r * 2, 4); ctx.fill(); ctx.stroke(); }
      else if (b.shape === "boomerang") { ctx.rotate(b.spin || 0); ctx.lineWidth = 5; ctx.strokeStyle = b.color; ctx.beginPath(); ctx.moveTo(-b.r, b.r * 0.4); ctx.quadraticCurveTo(0, -b.r, b.r, b.r * 0.4); ctx.stroke(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.5; ctx.stroke(); }
      else if (b.shape === "ray") { ctx.rotate(b.ang || 0); ctx.fillStyle = "#fff"; ctx.fillRect(-b.r * 2.4, -b.r * 0.5, b.r * 4.8, b.r); ctx.fillStyle = b.color; ctx.fillRect(-b.r * 2.4, -b.r * 0.28, b.r * 4.8, b.r * 0.56); }
      else if (b.shape === "wave") { ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.ellipse(0, 0, b.r * 0.6, b.r, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 3; ctx.strokeStyle = "#cfeaff"; ctx.stroke(); }
      else if (b.shape === "needle") { ctx.rotate(b.ang || 0); ctx.fillStyle = "#fff"; ctx.fillRect(-b.r * 3, -1.6, b.r * 6, 3.2); ctx.fillStyle = b.color; ctx.fillRect(b.r * 1.4, -1.6, b.r * 1.8, 3.2); }
      else if (b.shape === "comet") { ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(-b.r, 0); ctx.lineTo(-b.r - 18 - Math.random() * 8, -5); ctx.lineTo(-b.r - 16, 0); ctx.lineTo(-b.r - 18 - Math.random() * 8, 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = b.color; ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill(); ctx.stroke(); }
      else { ctx.beginPath(); ctx.arc(0, 0, b.r, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.7)"; ctx.beginPath(); ctx.arc(-b.r * 0.3, -b.r * 0.3, b.r * 0.35, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  function drawParts() {
    for (const p of parts) {
      const a = clamp(p.life / p.max, 0, 1); ctx.globalAlpha = a;
      if (p.shape === "text") { ctx.fillStyle = p.color; ctx.font = "bold 22px Georgia"; ctx.textAlign = "center"; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.strokeText(p.text, p.x, p.y); ctx.fillText(p.text, p.x, p.y); }
      else { ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * a + 0.5, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
  }
  function drawSuperArt() {
    const b = superArtFx, p = players[b.who] || player, by = p.y + p.h / 2;
    const x = b.dir > 0 ? p.x + 20 : cam.x, w = b.dir > 0 ? (cam.x + W) - p.x - 20 : (p.x + 20 - cam.x);
    const k = Math.sin(b.t / b.dur * Math.PI), hh = 50 * k + 8;
    const g = ctx.createLinearGradient(0, by - hh, 0, by + hh);
    g.addColorStop(0, "rgba(120,220,255,0)"); g.addColorStop(0.5, `rgba(180,240,255,${0.9 * k})`); g.addColorStop(1, "rgba(120,220,255,0)");
    ctx.fillStyle = g; ctx.fillRect(x, by - hh, w, hh * 2);
    ctx.fillStyle = `rgba(255,255,255,${k})`; ctx.fillRect(x, by - hh * 0.4, w, hh * 0.8);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  // ojo "pie-cut" clásico: blanco con pupila negra y una cuña blanca que mira al objetivo
  function pieEye(x, y, r, ang) {
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = Math.max(2, r * 0.26); ctx.stroke();
    ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, TAU); ctx.fill();
    const a = ang == null ? -0.7 : ang;
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.92, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
  }
  function star(x, y, r, n) {
    ctx.beginPath();
    for (let i = 0; i < n * 2; i++) { const rr = i % 2 ? r * 0.45 : r, a = i * Math.PI / n - Math.PI / 2; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath();
  }
  // engranaje pequeño centrado en 0,0 (para adornos mecánicos)
  function gearIcon(r) {
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a0 = i / 8 * TAU, a1 = (i + 0.5) / 8 * TAU;
      ctx.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
      ctx.lineTo(Math.cos(a0 + 0.12) * r * 1.35, Math.sin(a0 + 0.12) * r * 1.35);
      ctx.lineTo(Math.cos(a1 - 0.12) * r * 1.35, Math.sin(a1 - 0.12) * r * 1.35);
      ctx.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
    }
    ctx.closePath();
  }
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16); let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    return `rgb(${Math.round(r * f)},${Math.round(g * f)},${Math.round(b * f)})`;
  }

  /* ============================================================
     ESCENARIOS TEMÁTICOS POR JEFE
     ============================================================ */
  /* ============================================================
     RUN-N-GUN (única fuente de monedas)
     ============================================================ */
  const RNG_LEVELS = [
    { id: "forest", name: "Sendero del Bosque", theme: "spore", width: 4200, goalX: 4000, world: 1, mode: "ground" },
    { id: "dock", name: "Muelle Tambaleante", theme: "pirate", width: 4600, goalX: 4400, world: 1, mode: "ground" },
    { id: "factory", name: "Cinta de la Fábrica", theme: "robot", width: 5000, goalX: 4800, world: 1, mode: "ground" },
    { id: "skyway", name: "Autopista del Cielo", theme: "sky", width: 5000, goalX: 4800, world: 2, mode: "flight" },
    { id: "glacier", name: "Grieta Glacial", theme: "ice", width: 4600, goalX: 4400, world: 2, mode: "ground" },
    { id: "casino", name: "Callejón del Casino", theme: "casino", width: 5000, goalX: 4800, world: 2, mode: "ground" },
    { id: "theater", name: "Bambalinas", theme: "theater", width: 5200, goalX: 5000, world: 3, mode: "ground" },
    { id: "abyss", name: "Vuelo del Abismo", theme: "void", width: 5200, goalX: 5000, world: 3, mode: "flight" },
    { id: "drawingboard", name: "Mesa de Dibujo", theme: "ink", width: 5400, goalX: 5200, world: 4, mode: "ground" },
  ];
  const TUTORIAL = { id: "tutorial", name: "Escuela de Tinta", theme: "spore", width: 2900, goalX: 2700, world: 1, mode: "ground", tutorial: true };
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function aimFromTo(x0, y0, x1, y1, sp) { const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy) || 1; return { vx: dx / d * sp, vy: dy / d * sp }; }
  function mkEnemy(type, x, y, col) {
    const e = { type, x, y, x0: x, baseY: y, t: 0, vx: 0, vy: 0, dead: false, color: col };
    if (type === "blob") return Object.assign(e, { r: 22, hp: 6, vx: -1.4 });
    if (type === "turret") return Object.assign(e, { r: 24, hp: 12, fireT: rand(0.6, 1.6) });
    if (type === "runner") return Object.assign(e, { r: 18, hp: 7, spd: 2.5 + rand(0, 0.8) });   // carga hacia ti por el suelo
    if (type === "diver") return Object.assign(e, { r: 18, hp: 5, diving: false });               // vuela y se LANZA en picado
    return Object.assign(e, { r: 18, hp: 4, vx: -1.7 }); // flyer
  }
  function buildRng(level, seed) {
    const rnd = mulberry32(seed); enemies = []; coins = []; platforms = [];
    const wend = level.width - 360;
    const col = { spore: "#6aa84a", pirate: "#c0506a", robot: "#9a6ac0", ice: "#8fd0e8", casino: "#c060a0" }[level.theme] || "#6aa84a";
    if (level.mode === "flight") {
      for (let x = 560; x < wend; x += 300 + rnd() * 200) enemies.push(mkEnemy("flyer", x, 90 + rnd() * (H - 240), col));
      for (let i = 0; i < 5; i++) { const x = 740 + i * ((wend - 740) / 5) + (rnd() * 120 - 60), y = 110 + rnd() * (H - 260), id = level.id + ":" + i; coins.push({ x, y, id, got: !!save.collectedCoins[id] }); }
      return;
    }
    // plataformas variadas (alturas y tamaños distintos, a veces escalonadas en pareja)
    for (let x = 560; x < wend; x += 320 + rnd() * 200) {
      const h1 = 70 + rnd() * 70, w1 = 110 + rnd() * 90;
      platforms.push({ x, y: GROUND - h1, w: w1, h: 22 });
      if (rnd() < 0.4) platforms.push({ x: x + w1 + 36 + rnd() * 60, y: GROUND - (h1 + 70 + rnd() * 60), w: 90 + rnd() * 60, h: 22 });
    }
    // enemigos: mezcla curada por tema (corredores, buceadores, torretas, etc.)
    const mix = {
      spore: ["blob", "runner", "flyer", "turret", "blob", "diver"],
      pirate: ["runner", "blob", "diver", "turret", "flyer", "runner"],
      robot: ["turret", "runner", "turret", "flyer", "blob", "diver"],
      ice: ["flyer", "diver", "runner", "blob", "turret", "flyer"],
      casino: ["runner", "diver", "turret", "flyer", "runner", "blob"],
    }[level.theme] || ["blob", "runner", "turret", "flyer", "diver", "blob"];
    let mi = 0;
    for (let x = 520; x < wend; x += 320 + rnd() * 190) {
      const ty = mix[mi % mix.length]; mi++;
      const ec = ty === "turret" ? "#7a5a9a" : ty === "diver" ? "#c0506a" : col;
      const y = ty === "flyer" ? GROUND - 200 - rnd() * 80 : ty === "diver" ? GROUND - 240 - rnd() * 60 : GROUND - 44;
      enemies.push(mkEnemy(ty, x, y, ec));
      if (rnd() < 0.22) enemies.push(mkEnemy(ty === "flyer" || ty === "diver" ? "blob" : "flyer", x + 72, ty === "flyer" || ty === "diver" ? GROUND - 44 : GROUND - 230, ec)); // pequeño clúster
    }
    for (let i = 0; i < 5; i++) {
      const x = 720 + i * ((wend - 720) / 5) + (rnd() * 100 - 50);
      const high = rnd() < 0.5, y = high ? GROUND - 175 - rnd() * 75 : GROUND - 56;
      const id = level.id + ":" + i;
      coins.push({ x, y, id, got: !!save.collectedCoins[id] });
    }
  }
  function updateEnemies(dt) {
    const f = dt * 60;
    for (const e of enemies) {
      if (e.dead) continue;
      if (e.x < cam.x - 240 || e.x > cam.x + W + 240) continue;
      e.t += dt;
      const tgt = nearestPlayer({ x: e.x, y: e.y }), tcx = tgt.x + tgt.w / 2, tcy = tgt.y + tgt.h / 2;
      if (e.type === "blob") { e.vy += 0.6 * f; e.x += e.vx * f; e.y += e.vy * f; if (e.y + e.r >= GROUND) { e.y = GROUND - e.r; e.vy = 0; } if (e.x < e.x0 - 95) e.vx = Math.abs(e.vx); if (e.x > e.x0 + 95) e.vx = -Math.abs(e.vx); }
      else if (e.type === "turret") { e.vy += 0.6 * f; e.y += e.vy * f; if (e.y + e.r >= GROUND) { e.y = GROUND - e.r; e.vy = 0; } e.fireT -= dt; if (e.fireT <= 0 && Math.abs(e.x - tcx) < 620) { e.fireT = 1.7; const v = aimFromTo(e.x, e.y - 8, tcx, tcy, 4.0); G.spawnProj({ x: e.x, y: e.y - 8, vx: v.vx, vy: v.vy, r: 9, shape: "ball", color: "#9a6ac0", noFloor: true }); AUDIO.sfx("shoot"); } }
      else if (e.type === "runner") { e.vy += 0.6 * f; const dir = Math.sign(tcx - e.x) || -1; e.x += dir * e.spd * f; e.y += e.vy * f; if (e.y + e.r >= GROUND) { e.y = GROUND - e.r; e.vy = 0; } e.face = dir; }
      else if (e.type === "diver") { if (!e.diving && Math.abs(e.x - tcx) < 300 && e.y < tcy - 24) { e.diving = true; const v = aimFromTo(e.x, e.y, tcx, tcy, 5.6); e.vx = v.vx; e.vy = v.vy; AUDIO.sfx("shoot"); } if (e.diving) { e.x += e.vx * f; e.y += e.vy * f; if (e.y + e.r >= GROUND) { e.y = GROUND - e.r; e.diving = false; e.vy = 0; e.baseY = e.y; } } else { e.x += -1.5 * f; e.y = e.baseY + Math.sin(e.t * 3) * 30; } }
      else { e.x += e.vx * f; e.y = e.baseY + Math.sin(e.t * 3) * 42; }
      for (const p of players) if (p.inv <= 0 && !p.dead && !p.ghost) { const pb = p.box(); if (circRect(e.x, e.y, e.r - 4, pb.x, pb.y, pb.w, pb.h)) p.hurt(); }
      for (const b of bullets) {
        if (b.dead) continue;
        if (circRect(b.x, b.y, b.r, e.x - e.r, e.y - e.r, e.r * 2, e.r * 2)) {
          e.hp -= b.dmg; for (const pl of players) pl.super = Math.min(500, pl.super + b.dmg * 0.3); G.burst(b.x, b.y, { n: 3, color: "#fff" });
          if (!b.pierce) b.dead = true;
          if (e.hp <= 0) { e.dead = true; G.burst(e.x, e.y, { n: 12, color: e.color, smin: 2, smax: 6 }); AUDIO.sfx("explode"); }
        }
      }
    }
    enemies = enemies.filter(e => !e.dead);
  }
  function updateCoins(dt) {
    const f = dt * 60, mag = save.equipC === "magnet";
    for (const c of coins) {
      if (c.got) continue;
      const tgt = nearestPlayer({ x: c.x, y: c.y }), pb = tgt.box(), pcx = pb.x + pb.w / 2, pcy = pb.y + pb.h / 2;
      if (mag) { const d = Math.hypot(pcx - c.x, pcy - c.y); if (d < 300) { c.x += (pcx - c.x) / d * 6 * f; c.y += (pcy - c.y) / d * 6 * f; } }   // imán con más alcance y tirón
      for (const p of players) { if (p.dead || p.ghost) continue; const b = p.box(); if (circRect(c.x, c.y, 16, b.x, b.y, b.w, b.h)) { c.got = true; save.collectedCoins[c.id] = 1; save.coins++; persist(); AUDIO.sfx("coin"); G.floatText(c.x, c.y - 12, "+1 ◎", "#ffd24a"); rumble(0.08, 0.2, 0.3); break; } }
    }
  }
  function bodyGrad(r, col) { const g = ctx.createRadialGradient(-r * 0.35, -r * 0.42, r * 0.2, 0, 0, r * 1.28); g.addColorStop(0, shade(col, 1.4)); g.addColorStop(0.55, col); g.addColorStop(1, shade(col, 0.58)); return g; }
  function drawEnemies() {
    const ink = "#1a120a";
    for (const e of enemies) {
      if (e.x < cam.x - 80 || e.x > cam.x + W + 80) continue;
      // los ojos siguen al jugador más cercano (mirada con intención)
      const tp = nearestPlayer({ x: e.x, y: e.y });
      const ea = Math.atan2((tp.y + tp.h / 2) - e.y, (tp.x + tp.w / 2) - e.x);
      ctx.save(); ctx.translate(e.x, e.y); ctx.lineJoin = "round"; ctx.lineCap = "round";
      // sombra en el suelo para los terrestres
      if (e.type === "blob" || e.type === "runner" || e.type === "turret") { ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(0, GROUND - e.y, e.r * 0.95, 6, 0, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = ink; ctx.lineWidth = 3;
      if (e.type === "blob") {
        const sq = Math.sin(e.t * 8) * 2;
        ctx.fillStyle = bodyGrad(e.r, e.color); ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r - sq, 0, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.moveTo(-5, e.r - sq - 2); ctx.quadraticCurveTo(0, e.r + 6, 5, e.r - sq - 2); ctx.fill();   // goteo
        ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r - sq, 0, 0, TAU); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.28)"; ctx.beginPath(); ctx.ellipse(-e.r * 0.34, -e.r * 0.4, e.r * 0.26, e.r * 0.16, -0.5, 0, TAU); ctx.fill();   // brillo
        pieEye(-7, -4, 5, ea); pieEye(7, -4, 5, ea);
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-12, -11); ctx.lineTo(-3, -8); ctx.moveTo(12, -11); ctx.lineTo(3, -8); ctx.stroke();   // ceño
        ctx.beginPath(); ctx.arc(0, 5, 4, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
      }
      else if (e.type === "turret") {
        const rec = e.fireT > 1.45 ? (e.fireT - 1.45) * 18 : 0;              // retroceso del cañonazo
        const arm2 = e.fireT < 0.4 && e.fireT > 0;                            // aviso: va a disparar
        ctx.fillStyle = "#4a4a58"; roundRect(-e.r, -2, e.r * 2, e.r + 2, 6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.12)"; ctx.fillRect(-e.r + 4, 0, e.r * 2 - 8, 3);
        // engranaje que gira en el lateral
        ctx.save(); ctx.translate(e.r - 4, 6); ctx.rotate(time * 2.4); ctx.fillStyle = "#6a6a7a"; gearIcon(6); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
        ctx.fillStyle = bodyGrad(e.r - 2, e.color); ctx.beginPath(); ctx.arc(0, -2, e.r - 4, Math.PI, 0); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
        ctx.fillStyle = "#3a3340"; roundRect(-4, -e.r - 9 + rec, 8, 13, 2); ctx.fill(); ctx.stroke();   // cañón (con recoil)
        ctx.fillStyle = arm2 ? `rgba(255,90,90,${0.5 + Math.sin(time * 20) * 0.5})` : "#ffd24a"; ctx.beginPath(); ctx.arc(0, -e.r - 9 + rec, 2.6, 0, TAU); ctx.fill();
        if (rec > 2) { ctx.fillStyle = "#fff6c0"; star(0, -e.r - 14, 7, 5); ctx.fill(); }
        pieEye(-6, -2, 4.5, ea); pieEye(6, -2, 4.5, ea);
      }
      else if (e.type === "runner") {
        const fc = e.face || -1, run = Math.sin(e.t * 18) * 4;
        // líneas de velocidad tras él
        ctx.strokeStyle = "rgba(255,255,255,0.3)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-fc * (e.r + 4), -6); ctx.lineTo(-fc * (e.r + 16), -6); ctx.moveTo(-fc * (e.r + 2), 2); ctx.lineTo(-fc * (e.r + 12), 2); ctx.stroke();
        ctx.save(); ctx.rotate(fc * 0.12);   // se inclina hacia delante al correr
        ctx.strokeStyle = ink; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-8, e.r - 4); ctx.lineTo(-8 - run, e.r + 9); ctx.lineTo(-8 - run + fc * 4, e.r + 9); ctx.moveTo(8, e.r - 4); ctx.lineTo(8 + run, e.r + 9); ctx.lineTo(8 + run + fc * 4, e.r + 9); ctx.stroke();
        ctx.fillStyle = bodyGrad(e.r, e.color); ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r - 2, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.ellipse(-e.r * 0.3, -e.r * 0.42, e.r * 0.22, e.r * 0.14, -0.5, 0, TAU); ctx.fill();
        pieEye(fc * 4 - 6, -5, 5, ea); pieEye(fc * 4 + 6, -5, 5, ea);
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(fc * 4 - 11, -12); ctx.lineTo(fc * 4 - 2, -9); ctx.moveTo(fc * 4 + 11, -12); ctx.lineTo(fc * 4 + 2, -9); ctx.stroke();
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(fc * 3, 7, 7, 0, Math.PI); ctx.fill(); ctx.fillStyle = "#fff"; for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(fc * 3 + i * 5 - 2, 7); ctx.lineTo(fc * 3 + i * 5, 12); ctx.lineTo(fc * 3 + i * 5 + 2, 7); ctx.fill(); }
        ctx.restore();
      }
      else if (e.type === "diver") {
        const fl = Math.sin(e.t * 16) * 10;
        // estela al lanzarse en picado
        if (e.diving) { ctx.strokeStyle = "rgba(255,140,140,0.4)"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-e.vx * 3, -e.vy * 3); ctx.lineTo(-e.vx * 7, -e.vy * 7); ctx.stroke(); ctx.beginPath(); ctx.moveTo(8 - e.vx * 4, 4 - e.vy * 4); ctx.lineTo(8 - e.vx * 8, 4 - e.vy * 8); ctx.stroke(); }
        ctx.fillStyle = shade(e.color, 0.66); ctx.strokeStyle = ink; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(-e.r + 2, -2); ctx.quadraticCurveTo(-e.r - 22, -fl - 6, -e.r - 6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(e.r - 2, -2); ctx.quadraticCurveTo(e.r + 22, -fl - 6, e.r + 6, 8); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = bodyGrad(e.r, e.color); ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r - 5, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.2)"; ctx.beginPath(); ctx.ellipse(-e.r * 0.3, -e.r * 0.35, e.r * 0.2, e.r * 0.12, -0.5, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(-4, 6); ctx.lineTo(4, 6); ctx.lineTo(0, 16); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke();
        pieEye(-6, -3, 5, ea); pieEye(6, -3, 5, ea);
        if (e.diving) { ctx.strokeStyle = "rgba(255,90,90,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, e.r + 5, 0, TAU); ctx.stroke(); }
      }
      else {
        const fl = Math.sin(e.t * 12) * 8;
        ctx.fillStyle = "rgba(220,235,255,0.55)"; ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
        [-1, 1].forEach(s => { ctx.save(); ctx.translate(s * (e.r - 2), -2); ctx.rotate(s * (-0.5 - fl * 0.03)); ctx.beginPath(); ctx.ellipse(s * 8, 0, 10, 5, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore(); });   // alas
        ctx.fillStyle = bodyGrad(e.r, e.color); ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r - 4, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = ink; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.beginPath(); ctx.ellipse(-e.r * 0.3, -e.r * 0.4, e.r * 0.2, e.r * 0.12, -0.5, 0, TAU); ctx.fill();
        ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-4, -e.r + 2); ctx.quadraticCurveTo(-8, -e.r - 6, -10, -e.r - 8); ctx.moveTo(4, -e.r + 2); ctx.quadraticCurveTo(8, -e.r - 6, 10, -e.r - 8); ctx.stroke();
        ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(-10, -e.r - 8, 2, 0, TAU); ctx.arc(10, -e.r - 8, 2, 0, TAU); ctx.fill();   // antenas
        pieEye(-6, -2, 5); pieEye(6, -2, 5);
      }
      ctx.restore();
    }
  }
  function drawCoins() {
    for (const c of coins) {
      if (c.got || c.x < cam.x - 40 || c.x > cam.x + W + 40) continue;
      const yb = c.y + Math.sin(time * 4 + c.x) * 4;
      const spin = Math.cos(time * 3.2 + c.x * 0.05);   // gira sobre su eje
      ctx.save(); ctx.translate(c.x, yb);
      // halo suave
      const hg2 = ctx.createRadialGradient(0, 0, 4, 0, 0, 24); hg2.addColorStop(0, "rgba(255,220,110,0.30)"); hg2.addColorStop(1, "rgba(255,220,110,0)");
      ctx.fillStyle = hg2; ctx.beginPath(); ctx.arc(0, 0, 24, 0, TAU); ctx.fill();
      ctx.scale(Math.max(0.18, Math.abs(spin)), 1);
      const cg3 = ctx.createLinearGradient(-13, -15, 13, 15); cg3.addColorStop(0, "#ffe27a"); cg3.addColorStop(1, "#d8a828");
      ctx.fillStyle = cg3; ctx.beginPath(); ctx.ellipse(0, 0, 13, 15, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#a8820f"; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = "rgba(255,248,220,0.7)"; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.ellipse(0, 0, 9.5, 11.5, 0, 0, TAU); ctx.stroke();
      if (Math.abs(spin) > 0.4) { ctx.fillStyle = "#7a5a10"; ctx.font = "bold 16px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", 0, 1); ctx.textBaseline = "alphabetic"; }
      ctx.restore();
      // destello estrellado ocasional
      const tw2 = (time * 0.9 + c.x * 0.013) % 1;
      if (tw2 < 0.12) { ctx.save(); ctx.translate(c.x + 8, yb - 10); ctx.rotate(time * 2); ctx.globalAlpha = Math.sin(tw2 / 0.12 * Math.PI); ctx.fillStyle = "#fff"; star(0, 0, 5, 4); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; }
    }
  }
  function themeSky(theme) { return { spore: ["#8fd07a", "#4f8a3e"], pirate: ["#6fb6d8", "#2a5e86"], robot: ["#b0a890", "#5a5240"], sky: ["#bfe2f5", "#5f9fd0"], ice: ["#cfeefc", "#7fb0d0"], casino: ["#3a1a44", "#160a20"], theater: ["#3a2a52", "#160f24"], void: ["#2a1442", "#080410"], ink: ["#3a3550", "#0c0a14"] }[theme] || ["#8fd07a", "#4f8a3e"]; }
  function drawRngBg(camX, theme) {
    const sky = themeSky(theme);
    const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
    // sol/luna tenue
    ctx.fillStyle = "rgba(255,250,222,0.22)"; ctx.beginPath(); ctx.arc(W - 190, 116, 66, 0, TAU); ctx.fill();
    // nubes (parallax lento)
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    for (let i = 0; i < 6; i++) { const cx = ((i * 360 - camX * 0.15) % (W + 400) + W + 400) % (W + 400) - 200, cy = 60 + i * 28; cloud(cx, cy, 56 + i * 7); }
    // colinas LEJANAS (capa extra de profundidad)
    ctx.fillStyle = shade(sky[1], 0.78);
    for (let i = 0; i < 7; i++) { const hx = ((i * 340 - camX * 0.28) % (W + 680) + W + 680) % (W + 680) - 340; ctx.beginPath(); ctx.moveTo(hx - 160, GROUND); ctx.quadraticCurveTo(hx, GROUND - 140, hx + 160, GROUND); ctx.fill(); }
    // colinas cercanas (color por tema)
    ctx.fillStyle = theme === "robot" ? "#7a7264" : theme === "ice" ? "#bfe0ee" : theme === "casino" ? "#3a2450" : theme === "pirate" ? "#2a6a7a" : "#3a6a3a";
    for (let i = 0; i < 8; i++) { const hx = ((i * 280 - camX * 0.45) % (W + 560) + W + 560) % (W + 560) - 280; ctx.beginPath(); ctx.moveTo(hx - 120, GROUND); ctx.quadraticCurveTo(hx, GROUND - 200, hx + 120, GROUND); ctx.fill(); }
  }
  function drawRngFg(level) {
    const gc = { spore: "#3a6a2a", pirate: "#5a4a2a", robot: "#454048", ice: "#6f96b0", casino: "#3a2440", theater: "#241a34", void: "#1a0e2a", ink: "#26223a" }[level.theme] || "#3a6a2a";
    ctx.fillStyle = gc; ctx.fillRect(cam.x - 20, GROUND, W + 40, H - GROUND);
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.fillRect(cam.x - 20, GROUND, W + 40, 8);
    ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 2;
    for (let x = Math.floor(cam.x / 70) * 70; x < cam.x + W; x += 70) { ctx.beginPath(); ctx.moveTo(x, GROUND + 10); ctx.lineTo(x - 12, H); ctx.stroke(); }
    // pequeños adornos del suelo (matas/púas según el tema)
    ctx.fillStyle = { spore: "#3a8a2a", pirate: "#7a5a2a", robot: "#5a5468", ice: "#bfe6f4", casino: "#7a3a6a" }[level.theme] || "#3a8a2a";
    for (let x = Math.floor(cam.x / 150) * 150; x < cam.x + W + 40; x += 150) { ctx.beginPath(); ctx.moveTo(x, GROUND + 1); ctx.lineTo(x - 7, GROUND - 14); ctx.lineTo(x, GROUND - 6); ctx.lineTo(x + 7, GROUND - 16); ctx.lineTo(x + 14, GROUND + 1); ctx.closePath(); ctx.fill(); }
    for (const p of platforms) {
      if (p.x > cam.x + W + 40 || p.x + p.w < cam.x - 40) continue;
      ctx.fillStyle = "#5a3a22"; roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(p.x + 6, p.y + 4, p.w - 12, 4);
    }
    // meta
    const gx = level.goalX;
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(gx, GROUND); ctx.lineTo(gx, GROUND - 180); ctx.stroke();
    ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(gx, GROUND - 180); ctx.lineTo(gx + 64, GROUND - 162); ctx.lineTo(gx, GROUND - 144); ctx.closePath(); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
    bigText("META", gx + 30, GROUND - 158, 16, "#1a120a");
  }

  function drawSky(camX, theme) {
    const sky = themeSky(theme);
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    if (theme === "casino") { ctx.fillStyle = "#ffeeb0"; for (let i = 0; i < 40; i++) { const x = ((i * 131 - camX * 0.3) % (W + 200) + W + 200) % (W + 200) - 100, y = (i * 53) % H; ctx.globalAlpha = 0.3 + 0.7 * Math.abs(Math.sin(time * 2 + i)); ctx.fillRect(x, y, 3, 3); } ctx.globalAlpha = 1; }
    for (let layer = 0; layer < 2; layer++) { const fac = layer ? 0.5 : 0.25, sz = layer ? 70 : 48; ctx.fillStyle = layer ? "rgba(255,255,255,0.55)" : "rgba(255,255,255,0.32)"; for (let i = 0; i < 6; i++) { const x = ((i * 240 - camX * fac) % (W + 480) + W + 480) % (W + 480) - 240, y = 60 + layer * 110 + (i * 37) % 150; cloud(x, y, sz + (i % 3) * 10); } }
    if (theme === "ice") { ctx.fillStyle = "rgba(255,255,255,0.85)"; for (let i = 0; i < 30; i++) { const x = ((i * 97 - camX * 0.6) % (W + 200) + W + 200) % (W + 200) - 100, y = (time * 40 + i * 60) % H; ctx.fillRect(x, y, 2, 2); } }
  }
  // arena de RÉQUIEM: un escenario distinto por movimiento (panteón → cripta rota → foso de tinta → escenario final)
  function drawRequiemScene() {
    const ph = boss ? boss.phase : 1;
    if (ph === 1) {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, "#2e2840"); g.addColorStop(1, "#0e0a16");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
      // rosetón con luz de luna
      ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = "#4a4066"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(W / 2, 150, 92, 0, TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = i * (TAU / 8); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2, 150); ctx.lineTo(W / 2 + Math.cos(a) * 92, 150 + Math.sin(a) * 92); ctx.stroke(); }
      const mg = ctx.createRadialGradient(W / 2, 150, 8, W / 2, 480, 560); mg.addColorStop(0, "rgba(206,220,255,0.16)"); mg.addColorStop(1, "rgba(206,220,255,0)"); ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(W / 2 - 92, 150); ctx.lineTo(W / 2 - 300, GROUND); ctx.lineTo(W / 2 + 300, GROUND); ctx.lineTo(W / 2 + 92, 150); ctx.fill(); ctx.restore();
      // columnas con capitel
      for (const cxp of [120, 400, 880, 1160]) {
        const colg = ctx.createLinearGradient(cxp - 34, 0, cxp + 34, 0); colg.addColorStop(0, "#241e38"); colg.addColorStop(0.5, "#4a4266"); colg.addColorStop(1, "#241e38");
        ctx.fillStyle = colg; ctx.fillRect(cxp - 34, 96, 68, GROUND - 96);
        ctx.fillStyle = "#3a3454"; ctx.fillRect(cxp - 46, 76, 92, 26); ctx.fillRect(cxp - 46, GROUND - 30, 92, 30);
        ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 3; for (const off of [-18, 0, 18]) { ctx.beginPath(); ctx.moveTo(cxp + off, 104); ctx.lineTo(cxp + off, GROUND - 32); ctx.stroke(); }
      }
      // candelabros
      for (const fx of [260, 640, 1020]) { ctx.strokeStyle = "#8a7a50"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(fx, GROUND); ctx.lineTo(fx, GROUND - 120); ctx.stroke(); const fl = 0.6 + Math.sin(time * 9 + fx) * 0.35; ctx.fillStyle = `rgba(255,190,80,${fl})`; ctx.beginPath(); ctx.ellipse(fx, GROUND - 132, 5, 11 + fl * 4, 0, 0, TAU); ctx.fill(); const lg = ctx.createRadialGradient(fx, GROUND - 130, 4, fx, GROUND - 130, 70); lg.addColorStop(0, "rgba(255,190,80,0.16)"); lg.addColorStop(1, "rgba(255,190,80,0)"); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(fx, GROUND - 130, 70, 0, TAU); ctx.fill(); }
      // suelo de mármol ajedrezado
      ctx.fillStyle = "#1c1830"; ctx.fillRect(0, GROUND, W, H - GROUND);
      for (let x = 0; x < W; x += 80) { if ((x / 80) % 2 === 0) { ctx.fillStyle = "rgba(255,255,255,0.05)"; ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x + 80, GROUND); ctx.lineTo(x + 68, H); ctx.lineTo(x - 12, H); ctx.fill(); } }
      ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(0, GROUND, W, 5);
    } else if (ph === 2) {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, "#1c1430"); g.addColorStop(1, "#060410");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
      // columnas ROTAS e inclinadas
      [[120, -0.06, 0.55], [400, 0.09, 0.34], [880, -0.11, 0.42], [1160, 0.05, 0.6]].forEach(c => {
        ctx.save(); ctx.translate(c[0], GROUND); ctx.rotate(c[1]);
        const hgt = (GROUND - 96) * c[2];
        ctx.fillStyle = "#2e2848"; ctx.fillRect(-34, -hgt, 68, hgt);
        ctx.strokeStyle = "#14101e"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-34, -hgt); ctx.lineTo(-10, -hgt - 16); ctx.lineTo(12, -hgt - 4); ctx.lineTo(34, -hgt - 12); ctx.lineTo(34, -hgt); ctx.stroke();
        ctx.restore();
      });
      // fuegos fatuos flotando
      for (let i = 0; i < 8; i++) { const fx = (i * 173 + time * 12) % W, fy = 140 + (i * 67) % 300 + Math.sin(time * 1.8 + i) * 16, gl = 0.35 + Math.sin(time * 4 + i * 1.7) * 0.25; ctx.fillStyle = `rgba(122,240,192,${gl})`; ctx.beginPath(); ctx.arc(fx, fy, 4, 0, TAU); ctx.fill(); ctx.fillStyle = `rgba(122,240,192,${gl * 0.3})`; ctx.beginPath(); ctx.arc(fx, fy, 11, 0, TAU); ctx.fill(); }
      // escombros y suelo agrietado
      ctx.fillStyle = "#141024"; ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = "#221c38"; [[200, 26], [560, 18], [980, 30], [760, 14]].forEach(d => { ctx.beginPath(); ctx.moveTo(d[0] - d[1], GROUND); ctx.lineTo(d[0], GROUND - d[1]); ctx.lineTo(d[0] + d[1], GROUND); ctx.fill(); });
      ctx.strokeStyle = "rgba(122,240,192,0.2)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(340, GROUND + 10); ctx.lineTo(430, GROUND + 34); ctx.moveTo(430, GROUND + 34); ctx.lineTo(390, H); ctx.moveTo(860, GROUND + 8); ctx.lineTo(780, GROUND + 40); ctx.stroke();
    } else if (ph === 3) {
      const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, "#120e24"); g.addColorStop(1, "#040208");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
      // vórtice de tinta girando
      ctx.save(); ctx.translate(W / 2, 250);
      for (let i = 0; i < 5; i++) { ctx.strokeStyle = `rgba(90,74,140,${0.24 - i * 0.035})`; ctx.lineWidth = 22 - i * 3; ctx.beginPath(); const a0 = time * (0.5 + i * 0.12) + i * 1.3; ctx.arc(0, 0, 90 + i * 66, a0, a0 + 4.2); ctx.stroke(); }
      ctx.restore();
      // tubos de órgano gigantes al fondo
      for (let i = 0; i < 9; i++) { const px = 90 + i * 140, phg = 180 + Math.abs(4 - i) * -14 + (i % 2) * 40; ctx.fillStyle = "rgba(58,48,90,0.55)"; ctx.fillRect(px - 26, GROUND - 60 - phg, 52, phg); ctx.fillStyle = "rgba(255,210,74,0.18)"; ctx.fillRect(px - 26, GROUND - 60 - phg, 52, 8); }
      // tinta subiendo por las paredes
      ctx.fillStyle = "rgba(20,14,36,0.9)"; ctx.beginPath(); ctx.moveTo(0, GROUND);
      for (let x = 0; x <= W; x += 40) ctx.lineTo(x, GROUND - 44 - Math.sin(x * 0.02 + time * 2.2) * 14);
      ctx.lineTo(W, GROUND); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#0a0716"; ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = "rgba(154,138,208,0.2)"; for (let x = 0; x < W; x += 34) ctx.fillRect(x, GROUND + Math.sin(time * 3 + x * 0.08) * 3, 20, 3);
    } else {
      // Movimiento IV: oscuridad y un único foco dorado
      ctx.fillStyle = "#070508"; ctx.fillRect(0, 0, W, H);
      const sx2 = boss ? boss.x + boss.w / 2 : W / 2;
      const sp = ctx.createRadialGradient(sx2, 120, 30, sx2, GROUND, 620); sp.addColorStop(0, "rgba(255,206,90,0.22)"); sp.addColorStop(1, "rgba(255,206,90,0)");
      ctx.fillStyle = sp; ctx.beginPath(); ctx.moveTo(sx2 - 70, 0); ctx.lineTo(sx2 - 330, GROUND); ctx.lineTo(sx2 + 330, GROUND); ctx.lineTo(sx2 + 70, 0); ctx.fill();
      // motas doradas suspendidas
      for (let i = 0; i < 16; i++) { const mx = (i * 97 + time * (5 + i % 4)) % W, my = 100 + (i * 71) % 420 + Math.sin(time * 1.5 + i) * 10, gl = 0.25 + Math.sin(time * 3 + i * 1.4) * 0.2; ctx.fillStyle = `rgba(255,210,74,${gl})`; ctx.beginPath(); ctx.arc(mx, my, 1.8, 0, TAU); ctx.fill(); }
      // suelo negro reflectante con borde dorado
      ctx.fillStyle = "#0b090e"; ctx.fillRect(0, GROUND, W, H - GROUND);
      ctx.fillStyle = "rgba(255,210,74,0.35)"; ctx.fillRect(0, GROUND, W, 3);
      const rf = ctx.createLinearGradient(0, GROUND, 0, GROUND + 70); rf.addColorStop(0, "rgba(255,206,90,0.12)"); rf.addColorStop(1, "rgba(255,206,90,0)");
      ctx.fillStyle = rf; ctx.beginPath(); ctx.moveTo(sx2 - 200, GROUND); ctx.lineTo(sx2 + 200, GROUND); ctx.lineTo(sx2 + 130, GROUND + 70); ctx.lineTo(sx2 - 130, GROUND + 70); ctx.fill();
    }
    // plataformas: losas de mármol fijas + LÁPIDAS temporales que levanta el Guardián
    for (const p of platforms) {
      if (p.tomb) {
        const lifeK = clamp((p.until - time) / 5, 0, 1);
        ctx.save(); ctx.globalAlpha = 0.45 + lifeK * 0.55;
        ctx.fillStyle = "#8a8478"; ctx.beginPath(); ctx.moveTo(p.x, p.y + p.h); ctx.lineTo(p.x, p.y + 20); ctx.arc(p.x + p.w / 2, p.y + 20, p.w / 2, Math.PI, 0); ctx.lineTo(p.x + p.w, p.y + p.h); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#14101e"; ctx.lineWidth = 4; ctx.stroke();
        ctx.strokeStyle = "rgba(20,16,30,0.55)"; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(p.x + p.w / 2, p.y + 26); ctx.lineTo(p.x + p.w / 2, p.y + 48); ctx.moveTo(p.x + p.w / 2 - 9, p.y + 33); ctx.lineTo(p.x + p.w / 2 + 9, p.y + 33); ctx.stroke();
        if (lifeK < 0.4) { ctx.strokeStyle = "rgba(20,16,30,0.6)"; ctx.beginPath(); ctx.moveTo(p.x + 12, p.y + 30); ctx.lineTo(p.x + 26, p.y + 52); ctx.lineTo(p.x + 16, p.y + 74); ctx.stroke(); }
        ctx.restore();
      } else {
        ctx.fillStyle = "#b0aa9a"; roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 4; ctx.stroke();
        ctx.fillStyle = "rgba(255,210,74,0.45)"; ctx.fillRect(p.x + 5, p.y + 3, p.w - 10, 3);
      }
    }
    // motivo unificador (todas las fases): un pentagrama tenue arriba con notas doradas que pasan flotando
    ctx.save(); ctx.globalAlpha = 0.05; ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2;
    for (let i = 0; i < 5; i++) { const ly = 104 + i * 20; ctx.beginPath(); ctx.moveTo(50, ly); ctx.lineTo(W - 50, ly); ctx.stroke(); }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = 0.13; ctx.fillStyle = "#ffd24a"; ctx.font = "24px Georgia"; ctx.textAlign = "center";
    for (let i = 0; i < 4; i++) { const nx = ((i * 337 + time * (16 + i * 5)) % (W + 140)) - 70, ny = 112 + (i % 4) * 20 + Math.sin(time * 1.5 + i) * 5; ctx.fillText(i % 2 ? "♪" : "♩", nx, ny); }
    ctx.restore();
    // polvo de mausoleo cayendo en todas las fases
    ctx.fillStyle = "rgba(210,200,230,0.2)";
    for (let i = 0; i < 10; i++) { const dx = (i * 131 + time * 9) % W, dy = (i * 97 + time * (17 + i % 5)) % GROUND; ctx.fillRect(dx, dy, 2, 2); }
  }
  function drawScene(def) {
    if (def && def.id === "requiem") return drawRequiemScene();
    const id = def ? def.id : "spore";
    const sky = { spore: ["#8fd07a", "#4f8a3e"], pirate: ["#6fb6d8", "#2a5e86"], moth: ["#2a2350", "#0e0a26"], collector: ["#5a1230", "#1a0410"], puppeteer: ["#3a2a52", "#160f24"], chimera: ["#5a2a2a", "#180a0a"], director: ["#2a1030", "#100410"], sentinel: ["#3a2a5a", "#0c0818"], pen: ["#2a2450", "#0a0818"], author: ["#241f3a", "#060410"], discard: ["#3a2f55", "#0a0712"], robot: ["#b0a890", "#5a5240"], jester: ["#4a2440", "#180a18"], ice: ["#cfeefc", "#7fb0d0"], croupier: ["#3a1a44", "#160a20"], twin: ["#aebcd8", "#3a4666"], siphon: ["#2a4a5c", "#0c1a24"], lefthand: ["#c8c4bc", "#4a4854"] }[id] || ["#7a6a9a", "#2a2440"];
    const g = ctx.createLinearGradient(0, 0, 0, GROUND); g.addColorStop(0, sky[0]); g.addColorStop(1, sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, GROUND);
    if (id === "moth" || id === "collector") { ctx.fillStyle = "rgba(255,255,255,0.85)"; for (let i = 0; i < 40; i++) { const x = (i * 137.5 + 30) % W, y = (i * 53) % (GROUND - 120); ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(time + i)); ctx.fillRect(x, y, 2, 2); } ctx.globalAlpha = 1; }
    if (id === "moth") { ctx.fillStyle = "#f3e9c0"; ctx.beginPath(); ctx.arc(1050, 150, 70, 0, TAU); ctx.fill(); ctx.fillStyle = sky[0]; ctx.beginPath(); ctx.arc(1085, 135, 60, 0, TAU); ctx.fill(); }
    // nubes
    ctx.fillStyle = "rgba(255,255,255,0.25)";
    for (let i = 0; i < 4; i++) { const cx = ((time * 12 + i * 360) % (W + 300)) - 150, cy = 80 + i * 36; cloud(cx, cy, 60 + i * 8); }
    // bruma de horizonte (profundidad)
    const hz = ctx.createLinearGradient(0, GROUND - 170, 0, GROUND); hz.addColorStop(0, "rgba(255,240,210,0)"); hz.addColorStop(1, "rgba(255,236,200,0.16)");
    ctx.fillStyle = hz; ctx.fillRect(0, GROUND - 170, W, 170);
    // colinas lejanas (profundidad universal con parallax) — para que ninguna escena quede plana
    for (let layer = 0; layer < 2; layer++) {
      ctx.fillStyle = shade(sky[1], layer === 0 ? 0.82 : 0.6); ctx.globalAlpha = layer === 0 ? 0.55 : 0.8;
      const off = -(cam.x * (0.08 + layer * 0.1)) % 400, baseY = GROUND - 70 - layer * 46;
      ctx.beginPath(); ctx.moveTo(-120, GROUND);
      for (let x = -120; x <= W + 120; x += 56) { const hh = Math.sin((x + off + layer * 180) * 0.0095) * 34 + Math.cos(x * 0.021) * 16; ctx.lineTo(x, baseY + hh); }
      ctx.lineTo(W + 120, GROUND); ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // motas de polvo/polen flotando (look de dibujo animado)
    ctx.fillStyle = "rgba(255,240,200,0.22)";
    for (let i = 0; i < 14; i++) { const mx = (i * 97 + time * (7 + i % 5)) % W, my = 110 + (i * 71) % (GROUND - 200) + Math.sin(time * 1.3 + i) * 9; ctx.beginPath(); ctx.arc(mx, my, 1.7, 0, TAU); ctx.fill(); }
    drawParallax(id);
    // suelo temático con degradado
    const gc = { spore: "#3a6a2a", pirate: "#5a4a2a", moth: "#241a3a", collector: "#3a1018", puppeteer: "#241a34", chimera: "#2a1414", director: "#2a0a18", sentinel: "#241a3a", pen: "#221c38", author: "#1a1630", discard: "#1a1430", robot: "#454048", jester: "#2a1424", ice: "#6f96b0", croupier: "#3a2440", twin: "#2e3550", siphon: "#1e3540", lefthand: "#3a3844" }[id] || "#3a2716";
    const gg = ctx.createLinearGradient(0, GROUND, 0, H); gg.addColorStop(0, gc); gg.addColorStop(1, shade(gc, 0.55));
    ctx.fillStyle = gg; ctx.fillRect(0, GROUND, W, H - GROUND);
    ctx.fillStyle = "rgba(255,255,255,0.1)"; ctx.fillRect(0, GROUND, W, 5); ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.fillRect(0, GROUND + 5, W, 3);
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 2;
    for (let x = 20; x < W; x += 70) { ctx.beginPath(); ctx.moveTo(x, GROUND + 10); ctx.lineTo(x - 12, H); ctx.stroke(); }
    for (const p of platforms) {
      ctx.fillStyle = id === "moth" || id === "collector" ? "#5a4a7a" : "#5a3a22"; roundRect(p.x, p.y, p.w, p.h, 6); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.fillRect(p.x + 6, p.y + 4, p.w - 12, 4);
    }
  }
  function cloud(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r * 0.6, 0, TAU); ctx.arc(x + r * 0.6, y + 6, r * 0.5, 0, TAU); ctx.arc(x - r * 0.6, y + 8, r * 0.45, 0, TAU); ctx.fill(); }
  function drawParallax(id) {
    ctx.save();
    if (id === "spore") {
      ctx.fillStyle = "#2f5a24"; for (let i = 0; i < 6; i++) { const x = 80 + i * 220; ctx.beginPath(); ctx.moveTo(x - 40, GROUND); ctx.lineTo(x, GROUND - 150 - (i % 2) * 40); ctx.lineTo(x + 40, GROUND); ctx.fill(); }
      ctx.fillStyle = "#c0432f"; for (let i = 0; i < 5; i++) { const x = 180 + i * 240; ctx.beginPath(); ctx.ellipse(x, GROUND - 30, 30, 18, 0, Math.PI, 0); ctx.fill(); ctx.fillStyle = "#e9d9b8"; ctx.fillRect(x - 6, GROUND - 30, 12, 30); ctx.fillStyle = "#c0432f"; }
    } else if (id === "pirate") {
      ctx.fillStyle = "rgba(255,255,255,0.18)"; for (let i = 0; i < 8; i++) { const x = (time * 20 + i * 180) % (W + 120) - 60; ctx.beginPath(); ctx.ellipse(x, GROUND - 12 + Math.sin(time * 2 + i) * 4, 60, 10, 0, 0, TAU); ctx.fill(); }
      ctx.strokeStyle = "#2a1c10"; ctx.lineWidth = 8; for (let i = 0; i < 3; i++) { const x = 200 + i * 420; ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, GROUND - 220); ctx.stroke(); ctx.fillStyle = "#b03050"; ctx.fillRect(x, GROUND - 210, 70, 50); }
    } else if (id === "moth") {
      ctx.fillStyle = "#1a1430"; for (let i = 0; i < 5; i++) { const x = i * 300; ctx.beginPath(); ctx.moveTo(x - 60, GROUND); ctx.quadraticCurveTo(x + 80, GROUND - 260, x + 220, GROUND); ctx.fill(); }
    } else if (id === "collector") {
      ctx.fillStyle = "#2a0810"; for (let i = 0; i < 6; i++) { const x = 60 + i * 230; ctx.fillRect(x, GROUND - 320, 50, 320); ctx.fillRect(x - 8, GROUND - 330, 66, 16); }
      ctx.fillStyle = "rgba(255,80,40,0.12)"; for (let i = 0; i < 5; i++) { const x = 150 + i * 240; ctx.beginPath(); ctx.arc(x, GROUND - 100, 60, 0, TAU); ctx.fill(); }
    } else if (id === "robot") {
      // fábrica: chimeneas humeantes + engranajes girando al fondo
      ctx.fillStyle = "#4a4438"; for (const x of [140, 480, 940, 1180]) { ctx.fillRect(x - 24, GROUND - 280, 48, 280); ctx.fillRect(x - 32, GROUND - 292, 64, 14); for (let s = 0; s < 2; s++) { const st = (time * 0.4 + s * 0.5 + x * 0.001) % 1; ctx.fillStyle = `rgba(180,175,160,${0.25 * (1 - st)})`; ctx.beginPath(); ctx.arc(x + Math.sin(time + s) * 6, GROUND - 300 - st * 60, 10 + st * 16, 0, TAU); ctx.fill(); } ctx.fillStyle = "#4a4438"; }
      for (const g2 of [[320, 200, 44, 1], [700, 150, 60, -0.7], [1060, 230, 36, 1.3]]) { ctx.save(); ctx.translate(g2[0], GROUND - g2[1]); ctx.rotate(time * 0.5 * g2[3]); ctx.fillStyle = "rgba(90,84,70,0.7)"; gearIcon(g2[2]); ctx.fill(); ctx.fillStyle = "#3a3428"; ctx.beginPath(); ctx.arc(0, 0, g2[2] * 0.4, 0, TAU); ctx.fill(); ctx.restore(); }
    } else if (id === "jester") {
      // carnaval perdido: carpa a rayas + noria parada
      ctx.save(); ctx.translate(980, GROUND);
      ctx.strokeStyle = "#5a3040"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(0, -150, 110, 0, TAU); ctx.stroke();
      for (let i = 0; i < 8; i++) { const a = i * (TAU / 8) + time * 0.12; ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(Math.cos(a) * 110, -150 + Math.sin(a) * 110); ctx.stroke(); ctx.fillStyle = i % 2 ? "#7a2a3a" : "#8a5a2a"; roundRect(Math.cos(a) * 110 - 10, -150 + Math.sin(a) * 110 - 6, 20, 16, 4); ctx.fill(); }
      ctx.strokeStyle = "#5a3040"; ctx.beginPath(); ctx.moveTo(-70, 0); ctx.lineTo(0, -150); ctx.lineTo(70, 0); ctx.stroke();
      ctx.restore();
      for (let i = 0; i < 3; i++) { const x = 130 + i * 250; ctx.fillStyle = i % 2 ? "#6a2434" : "#54445c"; ctx.beginPath(); ctx.moveTo(x - 90, GROUND); ctx.quadraticCurveTo(x, GROUND - 210, x + 90, GROUND); ctx.fill(); ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(x, GROUND - 196); ctx.lineTo(x + 22, GROUND - 188); ctx.lineTo(x, GROUND - 180); ctx.fill(); }
    } else if (id === "ice") {
      // pico helado: montañas nevadas + pinos escarchados
      for (const m of [[200, 300], [560, 380], [980, 330], [1220, 260]]) { ctx.fillStyle = "#5a7a96"; ctx.beginPath(); ctx.moveTo(m[0] - 170, GROUND); ctx.lineTo(m[0], GROUND - m[1]); ctx.lineTo(m[0] + 170, GROUND); ctx.fill(); ctx.fillStyle = "#e8f4fc"; ctx.beginPath(); ctx.moveTo(m[0] - 44, GROUND - m[1] + 78); ctx.lineTo(m[0], GROUND - m[1]); ctx.lineTo(m[0] + 44, GROUND - m[1] + 78); ctx.lineTo(m[0] + 20, GROUND - m[1] + 64); ctx.lineTo(m[0] - 20, GROUND - m[1] + 72); ctx.fill(); }
      ctx.fillStyle = "#9fc4d8"; for (const x of [90, 420, 760, 1150]) { for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x - 26 + k * 4, GROUND - k * 24); ctx.lineTo(x, GROUND - 40 - k * 26); ctx.lineTo(x + 26 - k * 4, GROUND - k * 24); ctx.fill(); } }
    } else if (id === "croupier") {
      // casino eterno: letreros de neón + naipes gigantes apoyados
      const neon = 0.6 + Math.sin(time * 5) * 0.4;
      ctx.fillStyle = "#241024"; for (const x of [150, 620, 1080]) ctx.fillRect(x - 60, GROUND - 300, 120, 300);
      ctx.strokeStyle = `rgba(255,80,160,${neon})`; ctx.lineWidth = 3; for (const x of [150, 1080]) { roundRect(x - 42, GROUND - 270, 84, 40, 8); ctx.stroke(); bigText("$", x, GROUND - 240, 24, `rgba(255,210,74,${neon})`); }
      ctx.strokeStyle = `rgba(120,220,255,${1 - neon * 0.6})`; roundRect(620 - 42, GROUND - 270, 84, 40, 8); ctx.stroke(); bigText("777", 620, GROUND - 242, 20, `rgba(120,220,255,${0.4 + neon * 0.5})`);
      for (const c2 of [[350, -0.14, "♠"], [880, 0.12, "♥"]]) { ctx.save(); ctx.translate(c2[0], GROUND - 60); ctx.rotate(c2[1]); ctx.fillStyle = "#efe6d4"; roundRect(-46, -120, 92, 130, 10); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = c2[2] === "♥" ? "#c0392b" : "#1a120a"; ctx.font = "bold 44px Georgia"; ctx.textAlign = "center"; ctx.fillText(c2[2], 0, -46); ctx.restore(); }
    } else if (id === "puppeteer") {
      // teatro sombrío: marionetas colgando de sus hilos
      for (const p2 of [[220, 130, 0.3], [560, 90, 0.55], [1010, 150, 0.2]]) {
        const sw3 = Math.sin(time * 1.2 + p2[2] * 9) * 0.09;
        ctx.save(); ctx.translate(p2[0], 0); ctx.rotate(sw3);
        ctx.strokeStyle = "rgba(200,190,220,0.35)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, p2[1]); ctx.stroke();
        ctx.fillStyle = "rgba(40,30,58,0.9)"; ctx.beginPath(); ctx.arc(0, p2[1] + 16, 15, 0, TAU); ctx.fill(); roundRect(-11, p2[1] + 28, 22, 34, 8); ctx.fill();
        ctx.strokeStyle = "rgba(40,30,58,0.9)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-10, p2[1] + 38); ctx.lineTo(-22, p2[1] + 56 + Math.sin(time * 2 + p2[0]) * 4); ctx.moveTo(10, p2[1] + 38); ctx.lineTo(22, p2[1] + 52); ctx.stroke();
        ctx.restore();
      }
    } else if (id === "chimera") {
      // abismo: estalactitas + huesos y cráneos entre la penumbra
      ctx.fillStyle = "#3a1c1c"; for (let i = 0; i < 7; i++) { const x = 60 + i * 190; ctx.beginPath(); ctx.moveTo(x - 34, 0); ctx.lineTo(x, 90 + (i % 3) * 46); ctx.lineTo(x + 34, 0); ctx.fill(); }
      ctx.fillStyle = "rgba(220,205,185,0.5)";
      for (const b2 of [[240, 14], [620, 10], [1000, 16]]) { ctx.save(); ctx.translate(b2[0], GROUND - 8); ctx.rotate(0.3); roundRect(-b2[1] * 2, -3, b2[1] * 4, 6, 3); ctx.fill(); ctx.beginPath(); ctx.arc(-b2[1] * 2, 0, 5, 0, TAU); ctx.arc(b2[1] * 2, 0, 5, 0, TAU); ctx.fill(); ctx.restore(); }
    } else if (id === "director") {
      // el gran final: focos de tramoya cruzados + andamios
      ctx.strokeStyle = "rgba(90,20,40,0.8)"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(0, 70); ctx.lineTo(W, 70); ctx.stroke();
      for (const x of [180, 520, 900, 1180]) { ctx.fillStyle = "#2a0a18"; roundRect(x - 16, 54, 32, 30, 6); ctx.fill(); const sa = Math.sin(time * 0.7 + x) * 0.24; ctx.save(); ctx.translate(x, 84); ctx.rotate(sa); const sg3 = ctx.createLinearGradient(0, 0, 0, 420); sg3.addColorStop(0, "rgba(255,120,80,0.14)"); sg3.addColorStop(1, "rgba(255,120,80,0)"); ctx.fillStyle = sg3; ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-70, 420); ctx.lineTo(70, 420); ctx.lineTo(12, 0); ctx.fill(); ctx.restore(); }
    } else if (id === "sentinel") {
      // vacío de tinta: esquirlas flotantes + ojos que parpadean en la oscuridad
      for (let i = 0; i < 6; i++) { const x = 110 + i * 210, y = 150 + (i * 97) % 260 + Math.sin(time * 1.1 + i) * 12; ctx.save(); ctx.translate(x, y); ctx.rotate(time * 0.3 + i); ctx.fillStyle = "rgba(90,70,140,0.5)"; ctx.beginPath(); ctx.moveTo(0, -20); ctx.lineTo(12, 0); ctx.lineTo(0, 20); ctx.lineTo(-12, 0); ctx.closePath(); ctx.fill(); ctx.restore(); }
      for (let i = 0; i < 4; i++) { const bl = Math.sin(time * 0.8 + i * 2.3); if (bl > 0.3) { const x = 190 + i * 300, y = 120 + (i * 130) % 240; ctx.fillStyle = `rgba(200,160,255,${(bl - 0.3) * 0.5})`; ctx.beginPath(); ctx.ellipse(x, y, 14, 7 * bl, 0, 0, TAU); ctx.fill(); ctx.fillStyle = "rgba(20,10,30,0.9)"; ctx.beginPath(); ctx.arc(x, y, 3.5, 0, TAU); ctx.fill(); } }
    } else if (id === "author") {
      // la mesa de dibujo: lápices gigantes, tintero y hojas
      ctx.save(); ctx.translate(180, GROUND); ctx.rotate(-0.5);
      ctx.fillStyle = "#c8a032"; ctx.fillRect(0, -18, 300, 36); ctx.fillStyle = "#e8cf90"; ctx.beginPath(); ctx.moveTo(0, -18); ctx.lineTo(-46, 0); ctx.lineTo(0, 18); ctx.fill(); ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.moveTo(-46, 0); ctx.lineTo(-28, -8); ctx.lineTo(-28, 8); ctx.fill();
      ctx.restore();
      ctx.fillStyle = "#16122a"; roundRect(960, GROUND - 130, 110, 130, 14); ctx.fill(); ctx.fillStyle = "#0a0818"; ctx.beginPath(); ctx.ellipse(1015, GROUND - 130, 40, 12, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(240,236,224,0.16)"; for (const s2 of [[420, -0.1], [700, 0.14]]) { ctx.save(); ctx.translate(s2[0], GROUND - 40); ctx.rotate(s2[1]); ctx.fillRect(-80, -110, 160, 110); ctx.strokeStyle = "rgba(90,80,120,0.4)"; ctx.lineWidth = 2; for (let l2 = 0; l2 < 4; l2++) { ctx.beginPath(); ctx.moveTo(-64, -88 + l2 * 22); ctx.lineTo(64, -88 + l2 * 22); ctx.stroke(); } ctx.restore(); }
    } else if (id === "twin") {
      // el reverso del espejo: isla invertida colgando del cielo + esquirlas
      ctx.fillStyle = "rgba(140,170,210,0.30)"; ctx.beginPath(); ctx.moveTo(340, 0); ctx.quadraticCurveTo(640, 190, 940, 0); ctx.fill();
      ctx.fillStyle = "rgba(160,190,230,0.24)"; for (const t2 of [[480, 60], [700, 84], [820, 40]]) { ctx.beginPath(); ctx.moveTo(t2[0], t2[1]); ctx.lineTo(t2[0] + 12, t2[1] + 34); ctx.lineTo(t2[0] - 12, t2[1] + 34); ctx.fill(); }
      for (let i = 0; i < 5; i++) { const x = 150 + i * 240, y = 200 + (i * 83) % 200 + Math.sin(time * 1.3 + i) * 10; ctx.save(); ctx.translate(x, y); ctx.rotate(time * 0.4 + i * 1.2); ctx.strokeStyle = "rgba(200,225,255,0.5)"; ctx.lineWidth = 2; ctx.strokeRect(-11, -15, 22, 30); ctx.restore(); }
    } else if (id === "siphon") {
      // sala de bombeo: tuberías con válvulas y gotas que SUBEN
      ctx.strokeStyle = "#2a5a72"; ctx.lineWidth = 16; ctx.lineCap = "butt";
      ctx.beginPath(); ctx.moveTo(90, GROUND); ctx.lineTo(90, 180); ctx.lineTo(360, 180); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(W - 90, GROUND); ctx.lineTo(W - 90, 240); ctx.lineTo(W - 380, 240); ctx.stroke();
      ctx.strokeStyle = "#1a3a4a"; ctx.lineWidth = 3; for (const v of [[90, 320], [W - 90, 380]]) { ctx.save(); ctx.translate(v[0], v[1]); ctx.rotate(time * 0.8); ctx.beginPath(); ctx.arc(0, 0, 14, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.moveTo(0, -14); ctx.lineTo(0, 14); ctx.stroke(); ctx.restore(); }
      ctx.fillStyle = "rgba(120,200,240,0.5)"; for (let i = 0; i < 8; i++) { const x = 160 + i * 130, y = GROUND - ((time * 60 + i * 88) % (GROUND - 120)); ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + 4, y + 8, x, y + 12); ctx.quadraticCurveTo(x - 4, y + 8, x, y); ctx.fill(); }
    } else if (id === "lefthand") {
      // borrones blancos: el mundo a medio borrar
      ctx.fillStyle = "rgba(240,238,230,0.14)"; for (const e2 of [[240, 200, 90, -0.3], [640, 330, 120, 0.2], [1040, 180, 80, 0.5]]) { ctx.save(); ctx.translate(e2[0], e2[1]); ctx.rotate(e2[3]); ctx.beginPath(); ctx.ellipse(0, 0, e2[2], e2[2] * 0.36, 0, 0, TAU); ctx.fill(); ctx.restore(); }
      ctx.strokeStyle = "rgba(240,238,230,0.22)"; ctx.lineWidth = 8; ctx.lineCap = "round";
      for (const l2 of [[180, 420, 340, 380], [760, 460, 950, 420], [420, 140, 560, 120]]) { ctx.beginPath(); ctx.moveTo(l2[0], l2[1]); ctx.lineTo(l2[2], l2[3]); ctx.stroke(); }
      // virutas de goma de borrar cayendo... hacia arriba
      ctx.fillStyle = "rgba(235,230,220,0.4)"; for (let i = 0; i < 7; i++) { const x = 120 + i * 170, y = GROUND - ((time * 30 + i * 120) % (GROUND - 100)); ctx.save(); ctx.translate(x, y); ctx.rotate(time * 2 + i); ctx.fillRect(-5, -2, 10, 4); ctx.restore(); }
    } else if (id === "discard") {
      // los márgenes: bolas de papel arrugado + tachones
      for (const p2 of [[200, 40], [560, 28], [980, 46], [1160, 30]]) {
        ctx.save(); ctx.translate(p2[0], GROUND - p2[1] * 0.7); ctx.fillStyle = "rgba(225,218,200,0.28)"; ctx.beginPath();
        for (let k = 0; k <= 9; k++) { const a = k / 9 * TAU, rr = p2[1] * (0.8 + Math.sin(a * 4 + p2[0]) * 0.2); ctx[k ? "lineTo" : "moveTo"](Math.cos(a) * rr, Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(160,150,130,0.35)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-p2[1] * 0.5, -p2[1] * 0.2); ctx.lineTo(p2[1] * 0.3, p2[1] * 0.3); ctx.stroke();
        ctx.restore();
      }
      ctx.strokeStyle = "rgba(255,158,200,0.20)"; ctx.lineWidth = 6; ctx.lineCap = "round";
      for (const l2 of [[300, 200], [820, 260]]) { for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(l2[0] - 60, l2[1] + k * 14); ctx.lineTo(l2[0] + 60, l2[1] + k * 14 - 6); ctx.stroke(); } }
    }
    ctx.restore();
  }
  function vignetteAndGrain() {
    // viñeta cálida (look sepia de proyector viejo)
    const vg = ctx.createRadialGradient(W / 2, H * 0.46, 220, W / 2, H / 2, 800);
    vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(0.7, "rgba(30,16,6,0.18)"); vg.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
    // parpadeo de película
    const flick = 0.03 + Math.random() * 0.05;
    ctx.fillStyle = `rgba(255,238,200,${flick * 0.5})`; ctx.fillRect(0, 0, W, H);
    // grano
    ctx.fillStyle = "rgba(255,255,255,0.045)";
    for (let i = 0; i < 80; i++) ctx.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 2, 2);
    // arañazos verticales ocasionales
    if (Math.random() < 0.4) { ctx.fillStyle = "rgba(255,255,255,0.07)"; const sx = (Math.random() * W) | 0; ctx.fillRect(sx, 0, 1, H); }
    // polvo/motas oscuras de película
    ctx.fillStyle = "rgba(20,10,4,0.06)";
    for (let i = 0; i < 26; i++) ctx.fillRect((Math.random() * W) | 0, (Math.random() * H) | 0, 2, 2);
    // tinte sepia cálido para unificar la paleta (cartoon de los años 30)
    ctx.fillStyle = "rgba(120,68,18,0.05)"; ctx.fillRect(0, 0, W, H);
    // "pelo" de proyector ocasional
    if (Math.random() < 0.05) { ctx.strokeStyle = "rgba(20,12,4,0.45)"; ctx.lineWidth = 1; const hx = (Math.random() * W) | 0; ctx.beginPath(); ctx.moveTo(hx, 0); ctx.quadraticCurveTo(hx + 10, H * 0.45, hx - 6, H); ctx.stroke(); }
  }
  function drawCurtain(x) {
    for (let i = 0; i < 5; i++) { const w = 30; ctx.fillStyle = i % 2 ? "#7a1420" : "#5a0d14"; ctx.beginPath(); ctx.moveTo(x + i * w, 0); ctx.quadraticCurveTo(x + i * w + w / 2, 60, x + i * w, H); ctx.lineTo(x + i * w + w, H); ctx.quadraticCurveTo(x + i * w + w + w / 2, 60, x + i * w + w, 0); ctx.fill(); }
  }
  function theaterBg(tint) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, shade(tint, 0.55)); g.addColorStop(0.62, shade(tint, 0.3)); g.addColorStop(1, "#120b07");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // rayos de sol art-deco desde arriba-centro (giran muy lento)
    ctx.save(); ctx.translate(W / 2, -30); ctx.globalAlpha = 0.09;
    for (let i = 0; i < 24; i++) { ctx.fillStyle = i % 2 ? shade(tint, 1.55) : "#ffe9b0"; const a0 = i / 24 * TAU + time * 0.04, a1 = (i + 1) / 24 * TAU + time * 0.04; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a0) * 1500, Math.sin(a0) * 1500); ctx.lineTo(Math.cos(a1) * 1500, Math.sin(a1) * 1500); ctx.closePath(); ctx.fill(); }
    ctx.restore(); ctx.globalAlpha = 1;
    // foco/spotlight de dos tonos
    const sp = ctx.createRadialGradient(W / 2, 110, 50, W / 2, 340, 820); sp.addColorStop(0, "rgba(255,242,205,0.26)"); sp.addColorStop(0.5, "rgba(255,238,195,0.08)"); sp.addColorStop(1, "rgba(255,240,200,0)");
    ctx.fillStyle = sp; ctx.fillRect(0, 0, W, H);
    // suelo de escenario con tablones en perspectiva
    const fy = H - 64; ctx.fillStyle = shade(tint, 0.2); ctx.fillRect(0, fy, W, H - fy);
    ctx.fillStyle = "rgba(255,240,200,0.06)"; ctx.fillRect(0, fy, W, 4);
    ctx.strokeStyle = "rgba(0,0,0,0.28)"; ctx.lineWidth = 2;
    for (let x = -240; x < W + 240; x += 96) { ctx.beginPath(); ctx.moveTo(x, fy); ctx.lineTo((x - W / 2) * 2.5 + W / 2, H); ctx.stroke(); }
    // cortinas laterales + valance festoneado con borlas
    drawCurtain(0); drawCurtain(W - 150);
    ctx.fillStyle = "#7a1420"; ctx.beginPath(); for (let x = 0; x <= W; x += 70) { ctx.moveTo(x, 0); ctx.arc(x + 35, 0, 38, 0, Math.PI); } ctx.fill();
    ctx.fillStyle = "#ffd24a"; for (let x = 35; x <= W; x += 70) { ctx.beginPath(); ctx.arc(x, 38, 4.5, 0, TAU); ctx.fill(); }
  }

  /* ============================================================
     HUD
     ============================================================ */
  // placa art-deco oscura (para HUD/menús): fondo translúcido + doble borde + remaches dorados
  function decoPanel(x, y, w, h, accent) {
    accent = accent || "#ffd24a";
    ctx.fillStyle = "rgba(18,11,7,0.6)"; roundRect(x, y, w, h, 12); ctx.fill();
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; roundRect(x, y, w, h, 12); ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 1.5; roundRect(x + 4, y + 4, w - 8, h - 8, 9); ctx.stroke();
    ctx.fillStyle = accent;
    for (const c of [[x + 12, y + 12], [x + w - 12, y + 12], [x + 12, y + h - 12], [x + w - 12, y + h - 12]]) { star(c[0], c[1], 3.2, 5); ctx.fill(); }
  }
  // marco ornamental art-deco alrededor de toda la pantalla (mapa/menús)
  function decoFrame(accent) {
    accent = accent || "#ffd24a"; const m = 9;
    ctx.strokeStyle = "rgba(18,11,6,0.9)"; ctx.lineWidth = 14; ctx.strokeRect(m, m, W - 2 * m, H - 2 * m);
    ctx.strokeStyle = accent; ctx.lineWidth = 2; ctx.strokeRect(m + 7, m + 7, W - 2 * m - 14, H - 2 * m - 14);
    for (const [cx, cy, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
      ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, sy);
      ctx.fillStyle = accent; ctx.beginPath(); ctx.moveTo(5, 5); ctx.lineTo(46, 5); ctx.lineTo(5, 46); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#1a120a"; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(13 + k * 10, 13 + k * 10, 2.2, 0, TAU); ctx.fill(); }
      ctx.restore();
    }
  }
  function drawPlayerHud(p, ox, oy, label) {
    if (label) { ctx.fillStyle = p.idx === 1 ? "#9fd0ff" : "#ffd24a"; ctx.font = "bold 12px Trebuchet MS"; ctx.textAlign = "left"; ctx.fillText(label, ox, oy + 2); }
    const lx = ox + (label ? 24 : 4), mh = playerMaxHp();
    for (let i = 0; i < mh; i++) {
      const x = lx + 12 + i * 26, y = oy + 4, on = i < p.hp;
      ctx.save();
      // el último corazón LATE cuando queda solo uno
      if (on && p.hp === 1) { const hb2 = 1 + Math.max(0, Math.sin(time * 5.5)) * 0.22; ctx.translate(x, y + 7); ctx.scale(hb2, hb2); ctx.translate(-x, -(y + 7)); }
      ctx.fillStyle = p.ghost ? "#7a7a8a" : on ? "#e8434f" : "rgba(0,0,0,0.3)"; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(x, y + 5); ctx.bezierCurveTo(x, y - 4, x - 10, y - 4, x - 10, y + 3); ctx.bezierCurveTo(x - 10, y + 11, x, y + 14, x, y + 18); ctx.bezierCurveTo(x, y + 14, x + 10, y + 11, x + 10, y + 3); ctx.bezierCurveTo(x + 10, y - 4, x, y - 4, x, y + 5); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    const cards = Math.floor(p.super / 100), frac = (p.super % 100) / 100;
    for (let i = 0; i < 5; i++) {
      const x = lx + i * 22, y = oy + 28;
      ctx.fillStyle = "rgba(0,0,0,0.4)"; roundRect(x, y, 18, 13, 4); ctx.fill();
      if (i < cards) { ctx.fillStyle = i === 4 ? `hsl(${(time * 200) % 360},90%,62%)` : "#4ad0e0"; roundRect(x + 1.5, y + 1.5, 15, 10, 3); ctx.fill(); }
      else if (i === cards) { ctx.fillStyle = "#2a7a86"; roundRect(x + 1.5, y + 1.5, 15 * frac, 10, 3); ctx.fill(); }
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; roundRect(x, y, 18, 13, 4); ctx.stroke();
    }
  }
  function drawHUD() {
    // a 1 de vida: latido rojo en los bordes de la pantalla
    const low = players.some(p => !p.dead && !p.ghost && p.hp === 1);
    if (low) {
      const pu = 0.5 + Math.sin(time * 5.5) * 0.5;
      const lg5 = ctx.createRadialGradient(W / 2, H / 2, 330, W / 2, H / 2, 760);
      lg5.addColorStop(0, "rgba(200,30,30,0)"); lg5.addColorStop(1, `rgba(200,30,30,${0.12 + pu * 0.14})`);
      ctx.fillStyle = lg5; ctx.fillRect(0, 0, W, H);
    }
    decoPanel(14, 12, 326, coop ? 198 : 124);
    drawPlayerHud(player, 26, 24, coop ? "P1" : "");
    if (coop && player2) drawPlayerHud(player2, 26, 96, "P2");
    const cards = Math.floor(player.super / 100), ty = coop ? 166 : 96;
    ctx.textAlign = "left"; ctx.font = "bold 13px Trebuchet MS";
    ctx.fillStyle = cards >= 5 ? "#ffd24a" : "#f3e3c0";
    ctx.fillText(cards >= 5 ? "¡SÚPER! Especial (V/Ⓨ)" : cards >= 1 ? "EX listo · Especial (V/Ⓨ)" : "carga la súper…", 26, ty);
    ctx.fillStyle = "#f3e3c0"; ctx.font = "bold 14px Trebuchet MS";
    ctx.fillText("◗ " + WEAPONS[player.curWeapon()].name + (save.equipW[1] ? "  (Q/LB)" : ""), 26, ty + 20);
    // combo de parry (cuanto más alto, más súper por parry)
    const pcb = Math.max(player.pCombo || 0, player2 ? (player2.pCombo || 0) : 0);
    if (pcb >= 2) { const k = 1 + Math.sin(time * 10) * 0.06; ctx.save(); ctx.translate(W / 2, 92); ctx.scale(k, k); bigText("PARRY x" + pcb, 0, 0, 30, "#ff7ab8"); ctx.restore(); }
    // contador de monedas del run-n-gun
    if (curMode === "rng" && curLevel) {
      const got = coins.filter(c => c.got).length;
      ctx.textAlign = "right"; ctx.fillStyle = "#ffd24a"; ctx.font = "bold 20px Georgia";
      ctx.fillText("◎ " + got + "/5", W - 28, 40);
      ctx.fillStyle = "#f3e3c0"; ctx.font = "13px Trebuchet MS"; ctx.fillText(curLevel.name + " — ¡a la meta!", W - 28, 62);
    }

    if (boss) {
      // SIN barra de vida en pelea (estilo Cuphead): solo el nombre — cuánto le queda se revela al caer o al morir tú
      const nm = boss.name, nw = Math.max(240, nm.length * 14 + 70), ncy = 22;
      ctx.fillStyle = "rgba(18,11,7,0.8)"; ctx.beginPath();
      ctx.moveTo(W / 2 - nw / 2, ncy - 15); ctx.lineTo(W / 2 + nw / 2, ncy - 15); ctx.lineTo(W / 2 + nw / 2 + 16, ncy); ctx.lineTo(W / 2 + nw / 2, ncy + 15); ctx.lineTo(W / 2 - nw / 2, ncy + 15); ctx.lineTo(W / 2 - nw / 2 - 16, ncy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#f3e3c0"; ctx.font = "bold 22px Georgia"; ctx.textAlign = "center"; ctx.fillText(nm, W / 2, ncy + 7);
      // etiqueta de dificultad + cronómetro (para cazar la nota de tiempo y los récords)
      ctx.fillStyle = DIFF.color; ctx.font = "bold 13px Trebuchet MS"; ctx.textAlign = "right"; ctx.fillText(DIFF.name.toUpperCase(), W - 28, 36);
      ctx.fillStyle = "rgba(243,231,207,0.8)"; ctx.font = "bold 15px Georgia"; ctx.fillText("⏱ " + fightStats.time.toFixed(1) + " s", W - 28, 57);
      if (rushActive) ctx.fillText("RUSH " + (rushIdx + 1) + "/15 · " + rushTime.toFixed(1) + " s", W - 28, 78);
    }
    // guía del tutorial
    if (curMode === "rng" && curLevel && curLevel.tutorial) {
      const px = player.x;
      const msg = px < 360 ? "Muévete con ◀ ▶ (o stick)"
        : px < 760 ? "Salta con Z / Ⓐ  ·  (el amuleto Resorte da un 2.º salto)"
          : px < 1180 ? "Mantén X / Ⓧ para DISPARAR a los enemigos"
            : px < 1620 ? "Esquiva con C/Ⓑ (dash) · salta DURANTE el dash · ABAJO en el aire = caer rápido"
              : px < 2360 ? "Salta sobre lo ROSA y pulsa salto otra vez: ¡PARRY!"
                : "¡Genial! Corre hasta la META →";
      ctx.textAlign = "center"; ctx.fillStyle = "rgba(20,12,8,0.82)"; roundRect(W / 2 - 270, 70, 540, 40, 10); ctx.fill(); ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; ctx.stroke();
      bigText(msg, W / 2, 97, 17, "#ffd24a");
    }
  }

  function drawTouchControls() {
    if (!touchOn) return;
    ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineJoin = "round";
    // botones de esquina (pantalla / silenciar / pausa)
    const corner = [[TFULL, "⛶"], [TMUTE, AUDIO.isMuted && AUDIO.isMuted() ? "🔇" : "🔊"]];
    if (isPlaying()) corner.push([TPAUSE, "II"]);
    for (const [c, lbl] of corner) {
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = "rgba(20,12,8,0.62)"; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.fill(); ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, TAU); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.font = "bold 18px Trebuchet MS"; ctx.fillText(lbl, c.x, c.y + 1);
    }
    if (isPlaying()) {
      // joystick: base con anillo + perilla que sigue al dedo
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
      ctx.fillStyle = "rgba(20,12,8,0.42)"; ctx.beginPath(); ctx.arc(stick.cx, stick.cy, stick.r, 0, TAU); ctx.fill(); ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(stick.cx, stick.cy, stick.r, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(stick.cx, stick.cy, stick.r - 16, 0, TAU); ctx.stroke();
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
      ctx.fillStyle = stick.mag > 0.1 ? "#ffe9b8" : "rgba(243,231,207,0.95)"; ctx.beginPath(); ctx.arc(stick.kx, stick.ky, 48, 0, TAU); ctx.fill(); ctx.restore();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(stick.kx, stick.ky, 48, 0, TAU); ctx.stroke();
      ctx.fillStyle = "rgba(26,18,10,0.7)"; ctx.font = "bold 12px Trebuchet MS"; ctx.fillText("MOVER", stick.cx, stick.cy + stick.r - 16);
      // botones de acción
      for (const b of TBTN) {
        const active = b.toggle ? lockToggle : !!touchAct[b.act];
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,0.55)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 3;
        ctx.fillStyle = active ? b.col : "rgba(24,16,12,0.6)"; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
        ctx.restore();
        if (active) { ctx.globalAlpha = 0.5; ctx.lineWidth = 8; ctx.strokeStyle = b.col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
        ctx.lineWidth = 4; ctx.strokeStyle = active ? "#fff" : b.col; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.stroke();
        ctx.fillStyle = active ? "#1a120a" : "#fff"; ctx.font = "bold " + Math.round(b.r * 0.34) + "px Trebuchet MS"; ctx.fillText(b.label, b.x, b.y + 1);
      }
    }
    ctx.restore();
  }

  /* ============================================================
     OVERWORLD (mapa andable)
     ============================================================ */
  const avatar = { x: 200, y: 560, vx: 0, vy: 0, face: 1, bob: 0 };
  const ISLE = { x: 90, y: 150, w: W - 180, h: 460 };
  const MAPS = {
    1: [
      { kind: "tutorial", x: 150, y: 400 }, { kind: "shop", x: 220, y: 560 }, { kind: "rush", x: 150, y: 235 }, { kind: "gallery", x: 285, y: 300 },
      { kind: "boss", idx: 0, x: 360, y: 470 }, { kind: "rng", rid: 0, x: 470, y: 345 },
      { kind: "boss", idx: 1, x: 560, y: 470 }, { kind: "boss", idx: 2, x: 700, y: 360 },
      { kind: "rng", rid: 1, x: 820, y: 475 }, { kind: "boss", idx: 3, x: 950, y: 360 },
      { kind: "rng", rid: 2, x: 640, y: 245 }, { kind: "boss", idx: 4, x: 1055, y: 455 },
      { kind: "boss", idx: 5, x: 1115, y: 250 }, { kind: "travel", to: 2, x: 1190, y: 560 },
    ],
    2: [
      { kind: "travel", to: 1, x: 130, y: 560 }, { kind: "shop", x: 290, y: 560 },
      { kind: "boss", idx: 6, x: 440, y: 300 }, { kind: "rng", rid: 3, x: 580, y: 200 },
      { kind: "boss", idx: 7, x: 740, y: 470 }, { kind: "rng", rid: 4, x: 900, y: 320 },
      { kind: "boss", idx: 8, x: 1060, y: 300 }, { kind: "rng", rid: 5, x: 1150, y: 490 },
      { kind: "travel", to: 3, x: 1200, y: 150 },
    ],
    3: [
      { kind: "travel", to: 2, x: 130, y: 560 }, { kind: "shop", x: 290, y: 560 },
      { kind: "boss", idx: 9, x: 470, y: 300 }, { kind: "rng", rid: 6, x: 630, y: 470 },
      { kind: "boss", idx: 10, x: 790, y: 360 }, { kind: "rng", rid: 7, x: 950, y: 230 },
      { kind: "boss", idx: 11, x: 1100, y: 320 }, { kind: "travel", to: 4, x: 1190, y: 150 },
    ],
    4: [
      { kind: "travel", to: 3, x: 130, y: 560 }, { kind: "shop", x: 290, y: 560 },
      { kind: "boss", idx: 12, x: 470, y: 330 }, { kind: "rng", rid: 8, x: 640, y: 480 },
      { kind: "boss", idx: 13, x: 820, y: 300 }, { kind: "boss", idx: 14, x: 1080, y: 330 },
    ],
    5: [
      { kind: "travel", to: 4, x: 130, y: 560, back: true }, { kind: "shop", x: 300, y: 540 },
      { kind: "boss", idx: 15, x: 480, y: 320 }, { kind: "boss", idx: 16, x: 760, y: 430 },
      { kind: "boss", idx: 17, x: 1060, y: 300 },
    ],
  };
  // puzzle del jefe secreto (Mundo 4): pisar 3 manchas borradas en el orden correcto
  const SECRET_GLYPHS = [{ x: 200, y: 212, n: "I" }, { x: 420, y: 212, n: "II" }, { x: 640, y: 212, n: "III" }, { x: 860, y: 212, n: "IV" }, { x: 1080, y: 212, n: "V" }];
  // centro (III) · las dos puntas izq/der (I, V) · y los restantes de derecha a izquierda (IV, II)
  const SECRET_ORDER = [2, 0, 4, 3, 1];
  let puzzleStep = 0, puzzleOn = -1, puzzleFlash = 0;
  function mapNodes() {
    const base = MAPS[save.world] || MAPS[1];
    let nodes = base;
    if (save.world === 4 && save.secretFound) nodes = nodes.concat([{ kind: "secret", x: 640, y: 384 }]);
    // portal al MUNDO EXTRA desde CUALQUIER mundo principal (una vez desbloqueado)
    if (save.world >= 1 && save.world <= 4 && world5Open()) nodes = nodes.concat([{ kind: "travel", to: 5, x: 1210, y: 476, noPath: true, extra: true }]);
    return nodes;
  }
  function nearestNode() {
    let best = null, bd = 1e9;
    for (const n of mapNodes()) { const d = Math.hypot(n.x - avatar.x, n.y - (avatar.y + 30)); if (d < bd) { bd = d; best = n; } }
    return bd < 80 ? best : null;
  }
  function rngProgress(rid) { const lv = RNG_LEVELS[rid]; let c = 0; for (let i = 0; i < 5; i++) if (save.collectedCoins[lv.id + ":" + i]) c++; return c; }
  function enterNode(n) {
    if (n.kind === "shop") { AUDIO.sfx("confirm"); AUDIO.music("shop"); setState("shop"); }
    else if (n.kind === "tutorial") { AUDIO.sfx("confirm"); startTutorial(); }
    else if (n.kind === "rush") { AUDIO.sfx("confirm"); pendingRush = true; setState("diffselect"); }
    else if (n.kind === "gallery") { AUDIO.sfx("confirm"); focus = 0; setState("gallery"); }
    else if (n.kind === "rng") { AUDIO.sfx("confirm"); startRng(n.rid); }
    else if (n.kind === "travel") {
      const to = n.back ? (save.prevWorld || 1) : n.to;
      if (!travelOpen(to)) { AUDIO.sfx("deny"); return; }
      AUDIO.sfx("confirm");
      if (to === 5) save.prevWorld = save.world;   // recuerda de dónde vienes para poder volver
      save.world = to; avatar.x = to === 1 ? 1100 : 220; avatar.y = 540;
      if (to === 5 && !save.seenWorld[5]) { save.seenWorld[5] = true; persist(); showStory(STORY.reverseIntro, () => setState("map")); }
      else if (to > 1 && to < 5 && !save.seenWorld[to] && STORY.world[to]) { save.seenWorld[to] = true; persist(); showStory([STORY.world[to]], () => setState("map")); }
      else persist();
    } else if (n.kind === "secret") { AUDIO.sfx("confirm"); AUDIO.sting && AUDIO.sting("phase"); showStory(STORY.secretIntro, () => startSecretBoss()); }
    else if (unlocked(n.idx)) { AUDIO.sfx("confirm"); pendingRush = false; pendingBoss = n.idx; setState("diffselect"); }
    else AUDIO.sfx("deny");
  }
  const MAP_OPT = { x: 30, y: 24, w: 132, h: 34 }, MAP_HOME = { x: 172, y: 24, w: 132, h: 34 };
  function updateMap(dt, edge) {
    const f = dt * 60;
    let mvx = (held("right") ? 1 : 0) - (held("left") ? 1 : 0);
    let mvy = (held("down") ? 1 : 0) - (held("up") ? 1 : 0);
    if (stickAim.mag > 0.4) { mvx = Math.abs(stickAim.x) > 0.3 ? stickAim.x : 0; mvy = Math.abs(stickAim.y) > 0.3 ? stickAim.y : 0; }
    const m = Math.hypot(mvx, mvy) || 1; avatar.vx = mvx / m * 3.4; avatar.vy = mvy / m * 3.4;
    if (mvx || mvy) { avatar.x += avatar.vx * f; avatar.y += avatar.vy * f; avatar.bob += dt * 12; if (mvx) avatar.face = Math.sign(mvx); } else avatar.bob = 0;
    avatar.x = clamp(avatar.x, ISLE.x + 20, ISLE.x + ISLE.w - 20);
    avatar.y = clamp(avatar.y, ISLE.y + 20, ISLE.y + ISLE.h - 10);
    // botones del mapa: Opciones (⚙️ / Q·LB) y volver al Inicio (🏠)
    if (edge && tapped("swap")) { openOptions("map"); return; }
    if (mClicked && pointIn(mouse, MAP_OPT)) { openOptions("map"); return; }
    if (mClicked && pointIn(mouse, MAP_HOME)) { AUDIO.sfx("confirm"); AUDIO.music("menu"); setState("title"); return; }
    const n = nearestNode(), npc = nearestNpc();
    if (edge && tapped("confirm")) { if (npc) openTalk(npc); else if (n) enterNode(n); }
    for (const nd of mapNodes()) if (Math.hypot(mouse.x - nd.x, mouse.y - nd.y) < 50 && mClicked) { avatar.x = nd.x; avatar.y = nd.y + 30; enterNode(nd); }
    for (const c of worldNpcs()) if (Math.hypot(mouse.x - c.x, mouse.y - c.y) < 40 && mClicked) { avatar.x = c.x; avatar.y = c.y + 30; openTalk(c); }
    // puzzle del jefe secreto: pisar las 3 manchas en el orden correcto
    if (puzzleFlash > 0) puzzleFlash -= dt;
    if (save.world === 4 && !save.secretFound) {
      let on = -1;
      for (let i = 0; i < SECRET_GLYPHS.length; i++) if (Math.hypot(SECRET_GLYPHS[i].x - avatar.x, SECRET_GLYPHS[i].y - (avatar.y + 30)) < 40) on = i;
      if (on !== puzzleOn) {
        if (on !== -1) {
          if (on === SECRET_ORDER[puzzleStep]) {
            puzzleStep++; puzzleFlash = 0.6; AUDIO.sfx("select");
            if (puzzleStep >= SECRET_ORDER.length) { save.secretFound = true; persist(); AUDIO.sting && AUDIO.sting("phase"); flashScreen = 0.6; shake = 16; }
          } else if (puzzleStep > 0) { AUDIO.sfx("deny"); puzzleStep = 0; }
        }
        puzzleOn = on;
      }
    }
  }
  function drawMap() {
    const wld = save.world;
    const PA = { 1: { sea: ["#3a86b0", "#1d4a6a"], sand: "#c8a86a", grass: "#6fae4a", edge: "#3a6a2a", path: "#caa86a" }, 2: { sea: ["#5a7aa0", "#28304a"], sand: "#cfe0ee", grass: "#e8f2fa", edge: "#9fc0d8", path: "#bcd4e6" }, 3: { sea: ["#3a2a4a", "#140a1e"], sand: "#5a4a6a", grass: "#3a2a52", edge: "#7a5a9a", path: "#9a7aba" }, 4: { sea: ["#241f3a", "#070510"], sand: "#3a3450", grass: "#1e1a30", edge: "#5a4a82", path: "#7a6aaa" }, 5: { sea: ["#aebcd8", "#3a4666"], sand: "#8a7aa8", grass: "#2e2850", edge: "#7060a0", path: "#b8a6d8" } }[wld];
    const sea = ctx.createLinearGradient(0, 0, 0, H); sea.addColorStop(0, PA.sea[0]); sea.addColorStop(1, PA.sea[1]);
    ctx.fillStyle = sea; ctx.fillRect(0, 0, W, H);
    // olas/destellos en el agua
    ctx.fillStyle = "rgba(255,255,255,0.12)"; for (let i = 0; i < 18; i++) { const x = (time * 16 + i * 110) % (W + 120) - 60, y = 70 + (i * 53) % (H - 110); ctx.fillRect(x, y, 26 + (i % 3) * 8, 3); }
    // profundidad del mar: nubes lejanas, islotes al fondo y gaviotas
    ctx.fillStyle = "rgba(255,255,255,0.14)"; for (let i = 0; i < 5; i++) { const cx2 = ((time * 6 + i * 320) % (W + 320)) - 160; cloud(cx2, 56 + (i % 2) * 28, 48 + i * 6); }
    for (const f of [[140, 150, 58], [W - 170, 132, 70], [W - 330, 545, 48], [210, 560, 44]]) { ctx.fillStyle = shade(PA.sea[1], 0.72); ctx.beginPath(); ctx.ellipse(f[0], f[1], f[2], f[2] * 0.42, 0, 0, TAU); ctx.fill(); ctx.fillStyle = shade(PA.sea[1], 1.15); ctx.beginPath(); ctx.ellipse(f[0], f[1] - f[2] * 0.14, f[2] * 0.66, f[2] * 0.2, 0, 0, TAU); ctx.fill(); }
    ctx.strokeStyle = "rgba(20,16,12,0.4)"; ctx.lineWidth = 2; for (let i = 0; i < 6; i++) { const bx2 = (time * 26 + i * 230) % (W + 80) - 40, by2 = 86 + (i * 41) % 130; ctx.beginPath(); ctx.moveTo(bx2 - 8, by2); ctx.quadraticCurveTo(bx2, by2 - 6, bx2 + 1, by2); ctx.quadraticCurveTo(bx2 + 1, by2 - 6, bx2 + 9, by2); ctx.stroke(); }
    // barquito de vapor cruzando el horizonte
    {
      const bx3 = ((time * 22) % (W + 300)) - 150, by3 = 96 + Math.sin(time * 1.7) * 3;
      ctx.save(); ctx.translate(bx3, by3); ctx.lineJoin = "round";
      for (let s = 0; s < 3; s++) { const st = (time * 0.7 + s * 0.33) % 1; ctx.fillStyle = `rgba(235,230,220,${0.35 * (1 - st)})`; ctx.beginPath(); ctx.arc(6 - st * 22, -26 - st * 12, 3 + st * 5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = shade(PA.sea[1], 1.6); ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(24, 0); ctx.quadraticCurveTo(20, 10, 12, 10); ctx.lineTo(-12, 10); ctx.quadraticCurveTo(-20, 10, -24, 0); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(20,14,10,0.7)"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = shade(PA.sea[1], 1.9); roundRect(-10, -12, 20, 12, 2); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#c0392b"; ctx.fillRect(2, -24, 6, 12); ctx.strokeRect(2, -24, 6, 12);
      ctx.restore();
    }
    // rosa de los vientos (decorativa, esquina del mar)
    ctx.save(); ctx.translate(1208, 648); ctx.globalAlpha = 0.85;
    ctx.strokeStyle = shade(PA.sea[1], 1.4); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 30, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, 21, 0, TAU); ctx.stroke();
    for (let i = 0; i < 8; i++) { const a = i * (TAU / 8) - Math.PI / 2, lng = i % 2 === 0; ctx.fillStyle = lng ? "#ffd24a" : shade(PA.sea[1], 1.3); ctx.beginPath(); ctx.moveTo(Math.cos(a) * (lng ? 30 : 18), Math.sin(a) * (lng ? 30 : 18)); ctx.lineTo(Math.cos(a + 0.2) * 6, Math.sin(a + 0.2) * 6); ctx.lineTo(Math.cos(a - 0.2) * 6, Math.sin(a - 0.2) * 6); ctx.closePath(); ctx.fill(); }
    ctx.fillStyle = "#ffd24a"; ctx.font = "bold 11px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("N", 0, -38); ctx.textBaseline = "alphabetic";
    ctx.restore();
    // isla con relieve (sombra + playa + hierba + claro + textura)
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.4)"; ctx.shadowBlur = 26; ctx.shadowOffsetY = 12;
    ctx.fillStyle = PA.sand; roundRect(ISLE.x - 16, ISLE.y - 16, ISLE.w + 32, ISLE.h + 32, 92); ctx.fill();
    ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.16)"; roundRect(ISLE.x - 16, ISLE.y - 16, ISLE.w + 32, 16, 80); ctx.fill();
    ctx.fillStyle = PA.grass; roundRect(ISLE.x, ISLE.y, ISLE.w, ISLE.h, 72); ctx.fill();
    ctx.strokeStyle = PA.edge; ctx.lineWidth = 5; ctx.stroke();
    ctx.save(); ctx.beginPath(); roundRect(ISLE.x, ISLE.y, ISLE.w, ISLE.h, 72); ctx.clip();
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.beginPath(); ctx.ellipse(W / 2, ISLE.y + ISLE.h * 0.42, ISLE.w * 0.42, ISLE.h * 0.32, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "rgba(0,0,0,0.05)"; for (let i = 0; i < 46; i++) { const x = ISLE.x + (i * 137.5) % ISLE.w, y = ISLE.y + (i * 89) % ISLE.h; ctx.beginPath(); ctx.arc(x, y, 2.5, 0, TAU); ctx.fill(); }
    ctx.restore();
    // luciérnagas / destellos flotando sobre la isla (detalle con vida, color por mundo)
    const fcol = { 1: "#ffe27a", 2: "#bfe6ff", 3: "#d8a8ff", 4: "#ff9ec8", 5: "#cfe0ff" }[wld] || "#ffe27a";
    for (let i = 0; i < 12; i++) {
      const fx = ISLE.x + 40 + ((i * 173 + time * (14 + i % 4) * (i % 2 ? 1 : -1)) % (ISLE.w - 80) + (ISLE.w - 80)) % (ISLE.w - 80);
      const fy = ISLE.y + 50 + (i * 91) % (ISLE.h - 90) + Math.sin(time * 1.6 + i) * 10, gl = 0.4 + Math.sin(time * 3 + i * 1.7) * 0.4;
      ctx.globalAlpha = gl * 0.7; ctx.fillStyle = fcol; ctx.beginPath(); ctx.arc(fx, fy, 4, 0, TAU); ctx.fill();
      ctx.globalAlpha = gl; ctx.beginPath(); ctx.arc(fx, fy, 1.6, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
    const nodes = mapNodes();
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const pathNodes = nodes.filter(n => !n.noPath);
    const drawPath = (lw, col) => { ctx.strokeStyle = col; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(pathNodes[0].x, pathNodes[0].y); for (let i = 1; i < pathNodes.length; i++) ctx.lineTo(pathNodes[i].x, pathNodes[i].y); ctx.stroke(); };
    drawPath(22, shade(PA.path, 0.7)); drawPath(15, PA.path);
    ctx.save(); ctx.setLineDash([2, 16]); ctx.lineDashOffset = -time * 26; drawPath(3, shade(PA.path, 0.55)); ctx.restore();
    if (wld === 2) { for (const t of [[180, 300], [420, 240], [980, 470], [1150, 360]]) { ctx.fillStyle = "#dff0fb"; ctx.beginPath(); ctx.moveTo(t[0] - 14, t[1] + 14); ctx.lineTo(t[0], t[1] - 20); ctx.lineTo(t[0] + 14, t[1] + 14); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#9fc0d8"; ctx.lineWidth = 2; ctx.stroke(); } }
    else if (wld === 3) { for (const t of [[180, 300], [420, 240], [980, 470], [1150, 360], [560, 250]]) { ctx.fillStyle = "#9a6ad0"; ctx.beginPath(); ctx.moveTo(t[0], t[1] - 22); ctx.lineTo(t[0] + 10, t[1]); ctx.lineTo(t[0], t[1] + 16); ctx.lineTo(t[0] - 10, t[1]); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#5a3a8a"; ctx.lineWidth = 2; ctx.stroke(); } }
    else if (wld === 4) { ctx.fillStyle = "#0e0a1a"; for (const t of [[180, 300], [420, 250], [980, 470], [1160, 360], [560, 240], [760, 520]]) { ctx.beginPath(); ctx.arc(t[0], t[1], 16, 0, TAU); for (let k = 0; k < 6; k++) { const a = k * (TAU / 6); ctx.arc(t[0] + Math.cos(a) * 22, t[1] + Math.sin(a) * 22, 6, 0, TAU); } ctx.fill(); } }
    else if (wld === 5) { for (const t of [[180, 300], [430, 240], [980, 470], [1150, 360], [580, 250], [760, 520]]) { ctx.save(); ctx.translate(t[0], t[1]); ctx.rotate(time * 0.5 + t[0]); ctx.fillStyle = "rgba(207,224,255,0.7)"; ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(9, 0); ctx.lineTo(0, 16); ctx.lineTo(-9, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#7a6aa0"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); } }
    else { ctx.fillStyle = "#2f6a2a"; for (const t of [[150, 290], [320, 250], [900, 470], [560, 250], [1180, 380]]) { ctx.beginPath(); ctx.arc(t[0], t[1], 18, 0, TAU); ctx.fill(); ctx.fillStyle = "#5a3a1a"; ctx.fillRect(t[0] - 4, t[1] + 10, 8, 14); ctx.fillStyle = "#2f6a2a"; } }
    const near = nearestNode();
    for (const nd of nodes) {
      const fc = near === nd;
      if (nd.kind === "shop") {
        ctx.save(); if (fc) { ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 20; }
        // humo de la chimenea
        for (let s = 0; s < 3; s++) { const st = (time * 0.5 + s * 0.33) % 1; ctx.fillStyle = `rgba(230,225,215,${0.4 * (1 - st)})`; ctx.beginPath(); ctx.arc(nd.x + 26 + Math.sin(time * 2 + s * 2) * 4, nd.y - 66 - st * 30, 4 + st * 6, 0, TAU); ctx.fill(); }
        ctx.fillStyle = "#5a3a1c"; roundRect(nd.x + 20, nd.y - 66, 12, 18, 2); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke();
        const sg = ctx.createLinearGradient(0, nd.y - 38, 0, nd.y + 18); sg.addColorStop(0, "#8a5a2e"); sg.addColorStop(1, "#6a3e1c");
        ctx.fillStyle = sg; roundRect(nd.x - 36, nd.y - 38, 72, 56, 8); ctx.fill(); ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 5 : 4; ctx.stroke();
        // tejado
        ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.moveTo(nd.x - 44, nd.y - 38); ctx.lineTo(nd.x, nd.y - 64); ctx.lineTo(nd.x + 44, nd.y - 38); ctx.fill(); ctx.stroke();
        // toldo a rayas
        for (let a2 = 0; a2 < 5; a2++) { ctx.fillStyle = a2 % 2 ? "#e8e0c8" : "#c0392b"; ctx.beginPath(); const ax = nd.x - 30 + a2 * 12; ctx.moveTo(ax, nd.y - 12); ctx.lineTo(ax + 12, nd.y - 12); ctx.lineTo(ax + 12, nd.y - 4); ctx.arc(ax + 6, nd.y - 4, 6, 0, Math.PI); ctx.lineTo(ax, nd.y - 4); ctx.closePath(); ctx.fill(); }
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(nd.x - 30, nd.y - 12); ctx.lineTo(nd.x + 30, nd.y - 12); ctx.stroke();
        // ventana iluminada
        const wg = 0.75 + Math.sin(time * 3) * 0.2;
        ctx.fillStyle = `rgba(255,220,130,${wg})`; roundRect(nd.x - 14, nd.y + 0, 28, 14, 3); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(nd.x, nd.y); ctx.lineTo(nd.x, nd.y + 14); ctx.stroke();
        ctx.restore();
        bigText("TIENDA", nd.x, nd.y + 34, 14, "#fff");
      } else if (nd.kind === "tutorial") {
        ctx.save(); if (fc) { ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 20; }
        const tg2 = ctx.createLinearGradient(0, nd.y - 32, 0, nd.y + 20); tg2.addColorStop(0, "#3a7fc4"); tg2.addColorStop(1, "#255a94");
        ctx.fillStyle = tg2; roundRect(nd.x - 30, nd.y - 32, 60, 52, 8); ctx.fill(); ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 5 : 4; ctx.stroke();
        // campanita de escuela encima
        ctx.fillStyle = "#5a3a1c"; ctx.beginPath(); ctx.moveTo(nd.x - 12, nd.y - 32); ctx.lineTo(nd.x, nd.y - 46); ctx.lineTo(nd.x + 12, nd.y - 32); ctx.fill(); ctx.lineWidth = 3; ctx.stroke();
        const bell = Math.sin(time * 4) * (fc ? 0.4 : 0.12);
        ctx.save(); ctx.translate(nd.x, nd.y - 38); ctx.rotate(bell); ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(0, 2, 4.5, Math.PI, 0); ctx.lineTo(5, 6); ctx.lineTo(-5, 6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.6; ctx.stroke(); ctx.restore();
        ctx.restore();
        const qb = Math.sin(time * 3) * 3;
        bigText("?", nd.x, nd.y + 6 + qb, 30, "#fff"); bigText("TUTORIAL", nd.x, nd.y + 36, 13, "#fff");
      } else if (nd.kind === "rush") {
        ctx.save(); if (fc) { ctx.shadowColor = "#ff6a4a"; ctx.shadowBlur = 22; }
        const rg2 = ctx.createLinearGradient(0, nd.y - 30, 0, nd.y + 22); rg2.addColorStop(0, "#9a1c30"); rg2.addColorStop(1, "#5a0a16");
        ctx.fillStyle = rg2; roundRect(nd.x - 30, nd.y - 30, 60, 52, 8); ctx.fill(); ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 5 : 4; ctx.stroke();
        // llamas lamiendo el borde superior
        for (let f2 = 0; f2 < 4; f2++) { const fx2 = nd.x - 21 + f2 * 14, fl2 = 6 + Math.abs(Math.sin(time * 5 + f2 * 1.7)) * 8; ctx.fillStyle = f2 % 2 ? "#ff8a3a" : "#ffd24a"; ctx.beginPath(); ctx.moveTo(fx2 - 5, nd.y - 30); ctx.quadraticCurveTo(fx2, nd.y - 30 - fl2, fx2 + 5, nd.y - 30); ctx.fill(); }
        ctx.restore();
        bigText("⚔️", nd.x, nd.y + 6, 26, "#fff"); bigText("BOSS RUSH", nd.x, nd.y + 36, 12, "#ffd24a");
      } else if (nd.kind === "gallery") {
        ctx.save(); if (fc) { ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 20; }
        // mausoleo con frontón y columnas
        ctx.fillStyle = "#4a3a5a"; roundRect(nd.x - 32, nd.y - 26, 64, 48, 6); ctx.fill(); ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 5 : 4; ctx.stroke();
        ctx.fillStyle = "#5a4a6e"; ctx.beginPath(); ctx.moveTo(nd.x - 40, nd.y - 26); ctx.lineTo(nd.x, nd.y - 48); ctx.lineTo(nd.x + 40, nd.y - 26); ctx.closePath(); ctx.fill(); ctx.lineWidth = 3.5; ctx.stroke();
        ctx.fillStyle = "#6a5a80"; for (const cx3 of [-22, -8, 8, 22]) { ctx.fillRect(nd.x + cx3 - 4, nd.y - 22, 8, 40); ctx.strokeStyle = "rgba(20,16,30,0.6)"; ctx.lineWidth = 2; ctx.strokeRect(nd.x + cx3 - 4, nd.y - 22, 8, 40); }
        // puerta con brillo fantasmal
        const gg2 = 0.4 + Math.sin(time * 2.4) * 0.25;
        ctx.fillStyle = `rgba(122,240,192,${gg2})`; ctx.beginPath(); ctx.moveTo(nd.x - 6, nd.y + 18); ctx.lineTo(nd.x - 6, nd.y - 2); ctx.arc(nd.x, nd.y - 2, 6, Math.PI, 0); ctx.lineTo(nd.x + 6, nd.y + 18); ctx.closePath(); ctx.fill();
        ctx.restore();
        bigText("MAUSOLEO", nd.x, nd.y + 36, 11, "#e0c2f0");
      } else if (nd.kind === "travel" && nd.extra) {
        // portal al Reverso: espejo de pie con remolino plateado
        const bv = Math.sin(time * 2 + nd.x) * 2.5;
        ctx.save(); ctx.translate(nd.x, nd.y + bv); if (fc) { ctx.shadowColor = "#bfe0ff"; ctx.shadowBlur = 26; }
        ctx.fillStyle = "#8a76b8"; ctx.beginPath(); ctx.ellipse(0, -8, 30, 40, 0, 0, TAU); ctx.fill();
        ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 5 : 4; ctx.stroke();
        ctx.fillStyle = "#141024"; ctx.beginPath(); ctx.ellipse(0, -8, 23, 33, 0, 0, TAU); ctx.fill();
        // remolino interior
        ctx.save(); ctx.beginPath(); ctx.ellipse(0, -8, 23, 33, 0, 0, TAU); ctx.clip();
        for (let sp2 = 0; sp2 < 4; sp2++) { ctx.strokeStyle = `rgba(191,224,255,${0.5 - sp2 * 0.1})`; ctx.lineWidth = 3 - sp2 * 0.5; ctx.beginPath(); const a0 = time * (1.2 + sp2 * 0.3) + sp2 * 1.6; ctx.arc(0, -8, 5 + sp2 * 7, a0, a0 + 3.6); ctx.stroke(); }
        ctx.fillStyle = "rgba(255,255,255,0.8)"; ctx.beginPath(); ctx.arc(Math.sin(time * 3) * 10, -8 + Math.cos(time * 2.3) * 14, 2, 0, TAU); ctx.fill();
        ctx.restore();
        // patas del espejo
        ctx.strokeStyle = "#5a4a7a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-14, 26); ctx.lineTo(-20, 38); ctx.moveTo(14, 26); ctx.lineTo(20, 38); ctx.stroke();
        ctx.restore();
        bigText("EL ESPEJO", nd.x, nd.y + 56, 13, "#bfe0ff");
      } else if (nd.kind === "travel") {
        const open = travelOpen(nd.to), bv = Math.sin(time * 2 + nd.x) * 2.5;
        // ondas de agua bajo el casco
        ctx.strokeStyle = "rgba(255,255,255,0.5)"; ctx.lineWidth = 2;
        for (const wv of [[-30, 0], [4, 0.9], [26, 1.7]]) { const wk2 = (time * 1.4 + wv[1]) % 1; ctx.globalAlpha = 0.55 * (1 - wk2); ctx.beginPath(); ctx.arc(nd.x + wv[0], nd.y + 24, 6 + wk2 * 10, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke(); }
        ctx.globalAlpha = 1;
        ctx.save(); ctx.translate(nd.x, nd.y + bv); ctx.rotate(Math.sin(time * 1.6 + nd.x) * 0.03);
        if (fc) { ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 20; }
        // mástil
        ctx.strokeStyle = "#5a3a1e"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(0, -44); ctx.lineTo(0, 6); ctx.stroke();
        // vela hinchada que ondea
        const wob2 = Math.sin(time * 3 + nd.x) * 3;
        ctx.fillStyle = open ? "#f3e3c0" : "#8a8a8a"; ctx.beginPath(); ctx.moveTo(4, -40); ctx.quadraticCurveTo(30 + wob2, -24, 4, -6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.strokeStyle = "rgba(120,90,50,0.4)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(6, -32); ctx.quadraticCurveTo(20 + wob2 * 0.7, -24, 6, -13); ctx.stroke();
        // banderín ondeando
        const fl3 = Math.sin(time * 6 + nd.x) * 2.5;
        ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.moveTo(0, -44); ctx.quadraticCurveTo(-8, -42 + fl3 * 0.5, -15, -40 + fl3); ctx.lineTo(-8, -37); ctx.lineTo(0, -36); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.6; ctx.stroke();
        // casco curvo con tablones y ojo de buey
        const hullG = ctx.createLinearGradient(0, 2, 0, 22); hullG.addColorStop(0, open ? "#a8763a" : "#5a5a5a"); hullG.addColorStop(1, open ? "#6a441e" : "#3a3a3a");
        ctx.fillStyle = hullG; ctx.beginPath(); ctx.moveTo(-34, 2); ctx.lineTo(34, 2); ctx.quadraticCurveTo(30, 22, 18, 22); ctx.lineTo(-18, 22); ctx.quadraticCurveTo(-30, 22, -34, 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 4 : 3.5; ctx.stroke();
        ctx.strokeStyle = "rgba(26,18,10,0.45)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-30, 9); ctx.lineTo(30, 9); ctx.moveTo(-26, 15); ctx.lineTo(26, 15); ctx.stroke();
        ctx.fillStyle = "#ffd24a"; ctx.fillRect(-34, 1, 68, 3);
        ctx.fillStyle = "#9fd0ff"; ctx.beginPath(); ctx.arc(0, 13, 3.5, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.restore();
        bigText(open ? (nd.back ? "VOLVER ⛵" : "MUNDO " + nd.to) : "🔒", nd.x, nd.y + 46, 14, "#fff");
      } else if (nd.kind === "rng") {
        const lv = RNG_LEVELS[nd.rid], got = rngProgress(nd.rid), fly = lv.mode === "flight";
        ctx.save(); if (fc) { ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 20; }
        const ng = ctx.createRadialGradient(nd.x - 9, nd.y - 10, 4, nd.x, nd.y, 34);
        ng.addColorStop(0, fly ? "#5a9ad0" : "#48a068"); ng.addColorStop(1, fly ? "#2a5a88" : "#1e5a36");
        ctx.fillStyle = ng; ctx.beginPath(); ctx.arc(nd.x, nd.y, 32, 0, TAU); ctx.fill();
        ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 6 : 4; ctx.stroke();
        if (fc) { ctx.save(); ctx.translate(nd.x, nd.y); ctx.rotate(time * 1.2); ctx.setLineDash([5, 9]); ctx.strokeStyle = "rgba(255,210,74,0.8)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 0, 39, 0, TAU); ctx.stroke(); ctx.setLineDash([]); ctx.restore(); }
        ctx.restore();
        // icono: avioncito con hélice o botas corriendo
        if (fly) {
          ctx.save(); ctx.translate(nd.x, nd.y + Math.sin(time * 3 + nd.x) * 2); ctx.lineJoin = "round";
          ctx.fillStyle = "#e8d28a"; ctx.beginPath(); ctx.moveTo(-14, -4); ctx.quadraticCurveTo(16, -7, 15, 0); ctx.quadraticCurveTo(16, 7, -14, 4); ctx.quadraticCurveTo(-18, 0, -14, -4); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.fillStyle = "#c0392b"; roundRect(-6, -11, 9, 22, 3); ctx.fill(); ctx.stroke();
          ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.save(); ctx.translate(16, 0); ctx.rotate(time * 26); ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(0, 8); ctx.stroke(); ctx.restore();
          ctx.restore();
        } else {
          const rn = Math.sin(time * 5 + nd.x) * 1.6;
          ctx.save(); ctx.translate(nd.x + rn, nd.y); ctx.lineJoin = "round"; ctx.lineCap = "round";
          // flecha de carrera bien legible + líneas de velocidad
          ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(-4, -11); ctx.lineTo(13, 0); ctx.lineTo(-4, 11); ctx.lineTo(-4, 4); ctx.lineTo(-12, 4); ctx.lineTo(-12, -4); ctx.lineTo(-4, -4); ctx.closePath(); ctx.fill();
          ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
          ctx.strokeStyle = "rgba(255,240,200,0.75)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-16, -7); ctx.lineTo(-22, -7); ctx.moveTo(-15, 0); ctx.lineTo(-23, 0); ctx.moveTo(-16, 7); ctx.lineTo(-22, 7); ctx.stroke();
          ctx.restore();
        }
        bigText(lv.name, nd.x, nd.y + 52, 12, "#fff");
        // arco de 5 moneditas con el progreso
        for (let ci = 0; ci < 5; ci++) {
          const ca = -Math.PI / 2 + (ci - 2) * 0.42, cx4 = nd.x + Math.cos(ca) * 44, cy4 = nd.y + Math.sin(ca) * 44, has = ci < got;
          ctx.fillStyle = has ? "#f0c84a" : "rgba(0,0,0,0.35)"; ctx.beginPath(); ctx.arc(cx4, cy4, 5.5, 0, TAU); ctx.fill();
          ctx.strokeStyle = has ? "#a8820f" : "rgba(255,255,255,0.3)"; ctx.lineWidth = 1.8; ctx.stroke();
        }
        if (got === 5) bigText("✓", nd.x + 32, nd.y - 30, 15, "#7af0a0");
      } else if (nd.kind === "secret") {
        ctx.save(); ctx.shadowColor = "#ff4fa3"; ctx.shadowBlur = 26;
        const pr = 30 + Math.sin(time * 5) * 4;
        ctx.fillStyle = "#0a0712"; ctx.beginPath(); ctx.arc(nd.x, nd.y, pr, 0, TAU); ctx.fill();
        ctx.strokeStyle = fc ? "#fff" : "#ff4fa3"; ctx.lineWidth = fc ? 6 : 4; ctx.stroke(); ctx.restore();
        ctx.strokeStyle = "#ff4fa3"; ctx.lineWidth = 3; for (let i = 0; i < 5; i++) { const a = time * 1.5 + i * (TAU / 5); ctx.beginPath(); ctx.moveTo(nd.x, nd.y); ctx.lineTo(nd.x + Math.cos(a) * (pr - 6), nd.y + Math.sin(a) * (pr - 6)); ctx.stroke(); }
        bigText(save.secretDefeated ? "★" : "?", nd.x, nd.y + 9, 28, "#ff9ec8");
        bigText("¿· ? ·?", nd.x, nd.y + 52, 12, "#ff9ec8");
      } else {
        const def = BOSSES[nd.idx], unl = unlocked(nd.idx), done = save.defeated.includes(def.id), grade = save.grades[def.id];
        const men = unl && !done ? Math.sin(time * 2.6 + nd.x) * 2 : 0;   // los pendientes "respiran"
        ctx.save(); if (fc) { ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 22; }
        // marco del medallón con bisel
        const mg2 = ctx.createRadialGradient(nd.x - 10, nd.y - 12, 6, nd.x, nd.y, 42); mg2.addColorStop(0, "#7a5430"); mg2.addColorStop(1, "#432a12");
        ctx.fillStyle = mg2; ctx.beginPath(); ctx.arc(nd.x, nd.y, 40, 0, TAU); ctx.fill();
        ctx.fillStyle = unl ? shade(def.color, 0.82) : "#33312f"; ctx.beginPath(); ctx.arc(nd.x, nd.y, 33, 0, TAU); ctx.fill();
        ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 6 : 4; ctx.beginPath(); ctx.arc(nd.x, nd.y, 40, 0, TAU); ctx.stroke(); ctx.shadowBlur = 0;
        ctx.fillStyle = "#ffd24a"; for (let i = 0; i < 8; i++) { const a = i * (TAU / 8) + 0.39; ctx.beginPath(); ctx.arc(nd.x + Math.cos(a) * 40, nd.y + Math.sin(a) * 40, 2.6, 0, TAU); ctx.fill(); }   // remaches
        // carita del jefe: mirada, ceño y sonrisilla de villano
        ctx.fillStyle = unl ? def.color : "#555"; ctx.beginPath(); ctx.arc(nd.x, nd.y - 2 + men, 21, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke();
        if (unl) {
          const lx2 = clamp((avatar.x - nd.x) * 0.02, -2, 2), ly2 = clamp((avatar.y - nd.y) * 0.02, -1.5, 1.5);
          ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(nd.x - 7, nd.y - 5 + men, 6, 0, TAU); ctx.arc(nd.x + 7, nd.y - 5 + men, 6, 0, TAU); ctx.fill();
          ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(nd.x - 7 + lx2, nd.y - 4 + ly2 + men, 3, 0, TAU); ctx.arc(nd.x + 7 + lx2, nd.y - 4 + ly2 + men, 3, 0, TAU); ctx.fill();
          if (!done) { ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(nd.x - 13, nd.y - 14 + men); ctx.lineTo(nd.x - 3, nd.y - 10 + men); ctx.moveTo(nd.x + 13, nd.y - 14 + men); ctx.lineTo(nd.x + 3, nd.y - 10 + men); ctx.stroke(); }
          ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.2; ctx.beginPath();
          if (done) ctx.arc(nd.x, nd.y + 5 + men, 6, 0.15 * Math.PI, 0.85 * Math.PI);
          else { ctx.moveTo(nd.x - 6, nd.y + 8 + men); ctx.quadraticCurveTo(nd.x, nd.y + 5 + men, nd.x + 6, nd.y + 8 + men); }
          ctx.stroke();
        } else {
          // cadenas cruzadas sobre el medallón bloqueado
          ctx.strokeStyle = "#7a7468"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(nd.x - 30, nd.y - 24); ctx.lineTo(nd.x + 30, nd.y + 24); ctx.moveTo(nd.x + 30, nd.y - 24); ctx.lineTo(nd.x - 30, nd.y + 24); ctx.stroke();
          ctx.strokeStyle = "rgba(20,14,8,0.6)"; ctx.lineWidth = 1.5;
          for (let k2 = -3; k2 <= 3; k2++) { ctx.beginPath(); ctx.arc(nd.x + k2 * 9, nd.y + k2 * 7.2, 3.2, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.arc(nd.x - k2 * 9, nd.y + k2 * 7.2, 3.2, 0, TAU); ctx.stroke(); }
        }
        ctx.restore();
        if (def.mode === "flight") bigText("✈", nd.x + 30, nd.y - 24, 16, "#cfe6ff");
        bigText(unl ? def.name : "???", nd.x, nd.y + 56, 13, "#fff");
        if (done) {
          // sello de victoria con mini-laurel
          ctx.fillStyle = "#1e5a36"; ctx.beginPath(); ctx.arc(nd.x + 30, nd.y - 28, 11, 0, TAU); ctx.fill();
          ctx.strokeStyle = "#7af0a0"; ctx.lineWidth = 2; ctx.stroke();
          bigText("✓", nd.x + 30, nd.y - 22, 15, "#7af0a0");
          if (grade) { ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(nd.x - 30, nd.y - 28, 11, 0, TAU); ctx.fill(); ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2; ctx.stroke(); bigText(grade, nd.x - 30, nd.y - 22, 14, "#ffd24a"); }
        }
        if (!unl) bigText("🔒", nd.x, nd.y + 6, 22, "#fff");
      }
    }
    // puzzle del jefe secreto: las 5 manchas borradas, OCULTAS hasta que un personaje (El Borrón) te las revele
    if (wld === 4 && !save.secretFound && (save.secretHinted || puzzleStep > 0)) {
      for (let i = 0; i < SECRET_GLYPHS.length; i++) {
        const g = SECRET_GLYPHS[i], done = SECRET_ORDER.indexOf(i) < puzzleStep, pulse = 0.5 + Math.sin(time * 3 + i) * 0.5;
        ctx.save(); ctx.globalAlpha = done ? 0.95 : 0.28 + pulse * 0.18;
        ctx.fillStyle = done ? "#ff4fa3" : "#0e0a1a"; ctx.beginPath();
        for (let k = 0; k < 9; k++) { const a = k / 9 * TAU, rr = 17 + Math.sin(a * 3 + i) * 5; ctx[k ? "lineTo" : "moveTo"](g.x + Math.cos(a) * rr, g.y + Math.sin(a) * rr); }
        ctx.closePath(); ctx.fill();
        if (done) { ctx.fillStyle = "#fff"; star(g.x, g.y, 5, 5); ctx.fill(); }
        ctx.restore();
      }
    }
    // gente de tinta del mundo (NPCs)
    const nearNpc = nearestNpc();
    for (const c of worldNpcs()) drawNpc(c, c === nearNpc);
    drawAvatar();
    if (near && !nearNpc) {
      let label, sub;
      if (near.kind === "shop") { label = "Emporio de Porky"; sub = "Z/Ⓐ para comprar armas y amuletos"; }
      else if (near.kind === "tutorial") { label = "Escuela de Tinta"; sub = "Z/Ⓐ — aprende los controles"; }
      else if (near.kind === "rush") { const bt = rushBest()[save.difficulty]; label = "⚔️ Boss Rush"; sub = bt != null ? ("Mejor: " + bt.toFixed(1) + " s · Z/Ⓐ para retar" ) : "Z/Ⓐ — los 15 jefes a contrarreloj"; }
      else if (near.kind === "gallery") { label = "🏛️ Mausoleo"; sub = "Z/Ⓐ — repite jefes y mira tus récords"; }
      else if (near.kind === "travel") { const dest = near.back ? (save.prevWorld || 1) : near.to; const open = travelOpen(dest); label = near.back ? "Volver ⛵" : (near.to === 5 ? "MUNDO EXTRA ⛵" : "Viajar al Mundo " + near.to + " ⛵"); sub = open ? "Z/Ⓐ para viajar" : (near.to === 2 ? "Vence al Coleccionista" : near.to === 3 ? "Vence al Crupier" : near.to === 4 ? "Vence al Director" : "Termina el juego (El Autor)"); }
      else if (near.kind === "rng") { label = RNG_LEVELS[near.rid].name; sub = RNG_LEVELS[near.rid].mode === "flight" ? "Z/Ⓐ — ¡nivel de VUELO! junta ◎" : "Z/Ⓐ — corre, dispara y junta ◎"; }
      else if (near.kind === "secret") { label = save.secretDefeated ? "El Descarte (vencido)" : "¿· EL DESCARTE ·?"; sub = "Z/Ⓐ — jefe SECRETO · muy difícil"; }
      else { label = unlocked(near.idx) ? BOSSES[near.idx].name : "Bloqueado"; sub = unlocked(near.idx) ? "Z/Ⓐ para retar" : "Vence al jefe anterior"; }
      ctx.fillStyle = "rgba(20,12,8,0.85)"; roundRect(clamp(near.x - 130, 8, W - 268), near.y - 116, 260, 50, 10); ctx.fill();
      ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; ctx.stroke();
      const lx = clamp(near.x, 138, W - 138);
      bigText(label, lx, near.y - 94, 17, "#ffd24a"); ctx.font = "12px Trebuchet MS"; ctx.fillStyle = "#f3e3c0"; ctx.textAlign = "center"; ctx.fillText(sub, lx, near.y - 76);
    }
    // viñeta del mapa
    const mv = ctx.createRadialGradient(W / 2, H / 2, 280, W / 2, H / 2, 820); mv.addColorStop(0, "rgba(0,0,0,0)"); mv.addColorStop(1, "rgba(0,0,0,0.4)"); ctx.fillStyle = mv; ctx.fillRect(0, 0, W, H);
    decoFrame();
    // cinta de cabecera
    const ti = wld === 5 ? "MUNDO EXTRA" : wld === 4 ? "EL VACÍO DE TINTA" : wld === 3 ? "TEATRO DEL ABISMO" : wld === 2 ? "ARCHIPIÉLAGO DE LOS CIELOS" : "ISLA RAGTIME";
    ctx.fillStyle = "#7a1420"; ctx.beginPath(); ctx.moveTo(W / 2 - 240, 12); ctx.lineTo(W / 2 + 240, 12); ctx.lineTo(W / 2 + 262, 36); ctx.lineTo(W / 2 + 240, 60); ctx.lineTo(W / 2 - 240, 60); ctx.lineTo(W / 2 - 262, 36); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; ctx.stroke();
    bigText(ti, W / 2, 46, wld === 1 ? 28 : 23, "#ffd24a");
    coinTag(W - 150, 36, save.coins);
    // botones del mapa: Opciones y volver al Inicio
    [[MAP_OPT, "⚙ Opciones"], [MAP_HOME, "🏠 Inicio"]].forEach(mb => {
      const r = mb[0], hov = pointIn(mouse, r);
      ctx.fillStyle = hov ? "rgba(255,210,74,0.92)" : "rgba(18,10,18,0.72)"; roundRect(r.x, r.y, r.w, r.h, 9); ctx.fill();
      ctx.strokeStyle = hov ? "#ffd24a" : "rgba(255,255,255,0.4)"; ctx.lineWidth = 2; roundRect(r.x, r.y, r.w, r.h, 9); ctx.stroke();
      bigText(mb[1], r.x + r.w / 2, r.y + 23, 15, hov ? "#1a120a" : "#f3e7cf");
    });
    ctx.textAlign = "left"; ctx.fillStyle = "#e8e0c8"; ctx.font = "13px Trebuchet MS";
    ctx.fillText("Camina ◀▶▲▼/stick · Z/Ⓐ entrar y HABLAR con la gente 💬 · ⛵ viaja · monedas en run-n-gun · M silenciar · F pantalla", 22, H - 18);
  }
  function drawAvatar() {
    const x = avatar.x, y = avatar.y, moving = avatar.bob !== 0;
    const bob = Math.abs(Math.sin(avatar.bob)) * 5, sw = Math.sin(avatar.bob) * 6;
    const blink = (time % 4.1) > 3.94;
    // sombra que respira con el paso
    ctx.fillStyle = "rgba(0,0,0,0.28)"; ctx.beginPath(); ctx.ellipse(x, y + 17, 17 - bob * 0.6, 5 - bob * 0.35, 0, 0, TAU); ctx.fill();
    // polvillo al caminar (nubecitas que quedan atrás)
    if (moving) {
      const pk = (avatar.bob % Math.PI) / Math.PI;
      ctx.fillStyle = `rgba(240,230,205,${0.35 * (1 - pk)})`;
      ctx.beginPath(); ctx.arc(x - avatar.face * (10 + pk * 16), y + 14, 3 + pk * 4, 0, TAU); ctx.fill();
    }
    ctx.save(); ctx.translate(x, y - bob); ctx.rotate(moving ? avatar.face * 0.06 : 0); ctx.lineJoin = "round"; ctx.lineCap = "round";
    // piernas con zancada + zapatones
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-5, 6); ctx.quadraticCurveTo(-8 - sw * 0.5, 11, -7 - sw, 16); ctx.moveTo(5, 6); ctx.quadraticCurveTo(8 + sw * 0.5, 11, 7 + sw, 16); ctx.stroke();
    ctx.fillStyle = "#7a1f16"; ctx.beginPath(); ctx.ellipse(-7 - sw, 17 - (sw > 3 ? 3 : 0), 8, 4, 0, 0, TAU); ctx.ellipse(7 + sw, 17 - (sw < -3 ? 3 : 0), 8, 4, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1a120a"; ctx.stroke();
    // peto con degradado y botones
    const ag = ctx.createLinearGradient(0, -4, 0, 8); ag.addColorStop(0, "#c0392b"); ag.addColorStop(1, "#8f2418");
    ctx.fillStyle = ag; roundRect(-11, -4, 22, 12, 5); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3.5; ctx.stroke();
    ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(-4, 1, 1.6, 0, TAU); ctx.arc(4, 1, 1.6, 0, TAU); ctx.fill();
    // bracitos de goma balanceándose
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.moveTo(-10, -2); ctx.quadraticCurveTo(-15, 3, -13 + sw * 0.7, 8); ctx.moveTo(10, -2); ctx.quadraticCurveTo(15, 3, 13 - sw * 0.7, 8); ctx.stroke();
    // cabeza-taza con asa, brillo y pajita
    const hs = -avatar.face;
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(hs * 15, -16, 7, -1.1, 1.1); ctx.stroke();
    ctx.lineWidth = 3; ctx.strokeStyle = "#e2d2ac"; ctx.beginPath(); ctx.arc(hs * 15, -16, 7, -1.1, 1.1); ctx.stroke();
    const hg = ctx.createLinearGradient(-15, -30, 15, -2); hg.addColorStop(0, "#f6ecd6"); hg.addColorStop(1, "#e2d2ac");
    ctx.fillStyle = hg; roundRect(-15, -30, 30, 28, 9); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.35)"; roundRect(-12, -27, 7, 20, 4); ctx.fill();
    ctx.fillStyle = "#efe2c2"; roundRect(-15, -33, 30, 8, 5); ctx.fill(); ctx.lineWidth = 3.5; ctx.strokeStyle = "#1a120a"; ctx.stroke();
    ctx.fillStyle = "#8a2da0"; ctx.beginPath(); ctx.ellipse(0, -29, 11, 3, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = "#bd7ad8"; ctx.beginPath(); ctx.ellipse(-4, -30, 4, 1.3, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#e8434f"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(5, -29); ctx.lineTo(9 + avatar.face * 2, -40); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(9 + avatar.face * 2, -40, 2.2, 0, TAU); ctx.fill();
    if (blink) { ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-10, -15); ctx.lineTo(-2, -15); ctx.moveTo(2, -15); ctx.lineTo(10, -15); ctx.stroke(); }
    else { pieEye(-6, -15, 5.5, avatar.face > 0 ? 0 : Math.PI); pieEye(6, -15, 5.5, avatar.face > 0 ? 0 : Math.PI); }
    ctx.fillStyle = "rgba(232,120,120,0.45)"; ctx.beginPath(); ctx.arc(-11, -9, 2.6, 0, TAU); ctx.arc(11, -9, 2.6, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, -9, 4, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
    ctx.restore();
  }

  /* ---------------- helpers de UI ---------------- */
  const pointIn = (m, r) => m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
  function bigText(t, x, y, size, color, align) {
    ctx.font = `bold ${size}px Georgia`; ctx.textAlign = align || "center"; ctx.textBaseline = "alphabetic";
    ctx.lineJoin = "round"; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = size * 0.14; ctx.strokeText(t, x, y); ctx.fillStyle = color; ctx.fillText(t, x, y);
  }
  function coinTag(x, y, n) {
    ctx.fillStyle = "#f0c84a"; ctx.beginPath(); ctx.arc(x, y, 16, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke();
    ctx.fillStyle = "#7a5a10"; ctx.font = "bold 16px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", x, y + 1);
    ctx.textBaseline = "alphabetic"; if (n !== "") { ctx.fillStyle = "#fff"; ctx.font = "bold 26px Georgia"; ctx.textAlign = "left"; ctx.fillText("× " + n, x + 24, y + 9); }
  }
  // bombillas de marquesina parpadeando por el borde de un cartel (coords locales)
  function marqueeBulbs(x, y, w, h) {
    const pts = [];
    for (let bx = x + 26; bx <= x + w - 26; bx += 36) { pts.push([bx, y + 11]); pts.push([bx, y + h - 11]); }
    for (let by = y + 40; by <= y + h - 40; by += 36) { pts.push([x + 11, by]); pts.push([x + w - 11, by]); }
    for (const p of pts) {
      const on = Math.sin(time * 6 + p[0] * 0.045 + p[1] * 0.11) > -0.1;
      if (on) { ctx.fillStyle = "rgba(255,224,140,0.35)"; ctx.beginPath(); ctx.arc(p[0], p[1], 6.5, 0, TAU); ctx.fill(); }
      ctx.fillStyle = on ? "#ffe9a0" : "#4a3a28"; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = "rgba(26,18,10,0.8)"; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }
  // mascota de portada: Pip (o su gemela azul) de cuerpo entero saludando (pies en 0,0)
  function drawMascot(x, y, idx, face) {
    const P = (idx === 0 ? skinPal() : PLAYER_PALS[idx]) || PLAYER_PALS[0], bob = Math.sin(time * 2.3 + idx * 2) * 3.5;
    const blink = ((time + idx * 1.7) % 4.6) > 4.42;
    ctx.save(); ctx.translate(x, y); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 2, 30, 8, 0, 0, TAU); ctx.fill();
    ctx.translate(0, -bob);
    // piernas de goma + zapatones
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 8;
    ctx.beginPath(); ctx.moveTo(-7, -28); ctx.quadraticCurveTo(-13, -14, -15, -5); ctx.moveTo(7, -28); ctx.quadraticCurveTo(13, -14, 15, -5); ctx.stroke();
    for (const s of [-15, 15]) {
      ctx.fillStyle = P.shoe; ctx.beginPath(); ctx.ellipse(s + face * 3, -4, 14, 7.5, 0, 0, TAU); ctx.fill();
      ctx.lineWidth = 3.5; ctx.strokeStyle = "#1a120a"; ctx.stroke();
      ctx.fillStyle = P.shoe2; ctx.beginPath(); ctx.ellipse(s + face * 2, -7, 9, 3, 0, 0, TAU); ctx.fill();
    }
    // peto con tirantes y botones
    const bg = ctx.createLinearGradient(0, -56, 0, -26); bg.addColorStop(0, P.short); bg.addColorStop(1, P.shortDk);
    ctx.fillStyle = bg; roundRect(-16, -56, 32, 30, 9); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4.5; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.14)"; roundRect(-13, -53, 8, 22, 5); ctx.fill();
    ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(-6, -42, 2.8, 0, TAU); ctx.arc(6, -42, 2.8, 0, TAU); ctx.fill();
    // brazo en jarra + brazo saludando (manguera de goma)
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(-13 * face, -52); ctx.quadraticCurveTo(-26 * face, -44, -19 * face, -32); ctx.stroke();
    const wa = Math.sin(time * 5 + idx) * 0.45;
    ctx.save(); ctx.translate(13 * face, -54); ctx.rotate(face > 0 ? (-0.9 + wa * 0.5) : (0.9 - wa * 0.5));
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(12 * face, -10, 20 * face, -20); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(22 * face, -22, 7, 0, TAU); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
    ctx.restore();
    // cabeza-taza
    ctx.save(); ctx.translate(0, -60); ctx.rotate(Math.sin(time * 2.3 + idx * 2) * 0.05);
    const hw = 23, hh = 42, hs = -face;
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 8.5; ctx.beginPath(); ctx.arc(hs * (hw + 1), -hh / 2 + 4, 11, -1.15, 1.15); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = P.head2; ctx.beginPath(); ctx.arc(hs * (hw + 1), -hh / 2 + 4, 11, -1.15, 1.15); ctx.stroke();
    const hg = ctx.createLinearGradient(-hw, -hh, hw, 0); hg.addColorStop(0, P.head); hg.addColorStop(1, P.head2);
    ctx.fillStyle = hg; roundRect(-hw, -hh, hw * 2, hh, 14); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
    const gl = ctx.createRadialGradient(-8, -hh + 10, 1, -8, -hh + 10, 22); gl.addColorStop(0, "rgba(255,255,255,0.5)"); gl.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gl; roundRect(-hw + 2, -hh + 2, hw * 2 - 4, hh - 4, 12); ctx.fill();
    ctx.fillStyle = P.rim; roundRect(-hw - 1, -hh - 7, hw * 2 + 2, 12, 7); ctx.fill(); ctx.lineWidth = 4.5; ctx.strokeStyle = "#1a120a"; ctx.stroke();
    ctx.fillStyle = P.liquid; ctx.beginPath(); ctx.ellipse(0, -hh - 1, hw - 5, 5.5, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = P.liquid2; ctx.beginPath(); ctx.ellipse(-6, -hh - 2, 6.5, 2.2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = P.straw; ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(7 * face, -hh - 1); ctx.lineTo(13 * face, -hh - 19); ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(13 * face, -hh - 19, 3.2, 0, TAU); ctx.fill();
    // cara: ojos pie-cut (parpadean), cejas, mofletes y sonrisa
    const eyeY = -hh + 20, ang = face > 0 ? 0.5 : Math.PI - 0.5;
    if (blink) { ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-14, eyeY); ctx.lineTo(-3, eyeY); ctx.moveTo(3, eyeY); ctx.lineTo(14, eyeY); ctx.stroke(); }
    else { pieEye(-8, eyeY, 8, ang); pieEye(8, eyeY, 8, ang); }
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-14, eyeY - 11); ctx.lineTo(-4, eyeY - 13); ctx.moveTo(14, eyeY - 11); ctx.lineTo(4, eyeY - 13); ctx.stroke();
    ctx.fillStyle = P.cheek; ctx.beginPath(); ctx.arc(-15, eyeY + 9, 4.5, 0, TAU); ctx.arc(15, eyeY + 9, 4.5, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, eyeY + 9, 6.5, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }
  // notas musicales flotando hacia arriba (ambiente de las pantallas de menú)
  function floatingNotes(n, col) {
    ctx.save(); ctx.textAlign = "center"; ctx.font = "26px Georgia";
    for (let i = 0; i < n; i++) {
      const ny = H + 30 - ((time * (26 + (i % 3) * 9) + i * 173) % (H + 120));
      const nx = 70 + (i * 199) % (W - 140) + Math.sin(time * 1.4 + i * 2.1) * 22;
      const k = clamp((H - ny) / H, 0, 1);
      ctx.globalAlpha = 0.16 * Math.sin(k * Math.PI);
      ctx.fillStyle = col || "#ffd24a";
      ctx.save(); ctx.translate(nx, ny); ctx.rotate(Math.sin(time * 2 + i) * 0.25); ctx.fillText(i % 3 === 2 ? "♫" : i % 2 ? "♪" : "♩", 0, 0); ctx.restore();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function drawButtonRect(r, label, fc) {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = fc ? 18 : 8; ctx.shadowOffsetY = 3;
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    if (fc) { g.addColorStop(0, "#e25848"); g.addColorStop(1, "#a8281c"); } else { g.addColorStop(0, "#8a1a26"); g.addColorStop(1, "#5a0d14"); }
    ctx.fillStyle = g; roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.restore();
    ctx.fillStyle = "rgba(255,255,255,0.14)"; roundRect(r.x + 5, r.y + 4, r.w - 10, r.h * 0.42, 8); ctx.fill();
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; roundRect(r.x, r.y, r.w, r.h, 12); ctx.stroke();
    if (fc) { ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2.5; roundRect(r.x + 3.5, r.y + 3.5, r.w - 7, r.h - 7, 9); ctx.stroke(); }
    bigText(label, r.x + r.w / 2, r.y + r.h / 2 + 8, 22, fc ? "#fff" : "#ffe9cf");
  }
  function navList(n, edge) {
    if (!edge) return;
    if (tapped("navD") || tapped("navR")) { focus = (focus + 1) % n; AUDIO.sfx("select"); }
    if (tapped("navU") || tapped("navL")) { focus = (focus - 1 + n) % n; AUDIO.sfx("select"); }
  }

  /* ============================================================
     TIENDA (Porky's Emporium)
     ============================================================ */
  function shopCards() {
    const cards = [];
    const wk = Object.keys(WEAPONS).filter(k => (!WEAPONS[k].world5 && !WEAPONS[k].bonus) || (save.ownedW || []).includes(k));
    const ck = Object.keys(CHARMS).filter(k => (!CHARMS[k].world5 && !CHARMS[k].bonus) || (save.ownedC || []).includes(k));
    const rows = Math.max(Math.ceil(wk.length / 2), Math.ceil(ck.length / 2), 1);
    const x0 = 56, y0 = 196, cw = 232, gx = 12, gy = 9, ch = Math.min(80, Math.floor((632 - y0) / rows) - gy);
    wk.forEach((k, i) => cards.push({ x: x0 + (i % 2) * (cw + gx), y: y0 + ((i / 2) | 0) * (ch + gy), w: cw, h: ch, kind: "w", id: k }));
    const x1 = 580;
    ck.forEach((k, i) => cards.push({ x: x1 + (i % 2) * (cw + gx), y: y0 + ((i / 2) | 0) * (ch + gy), w: cw, h: ch, kind: "c", id: k }));
    cards.push({ x: W / 2 - 292, y: H - 72, w: 272, h: 48, kind: "superart" });
    cards.push({ x: W / 2 + 24, y: H - 72, w: 268, h: 48, kind: "back" });
    return cards;
  }
  function updateShop(dt, edge) {
    const cards = shopCards();
    if (edge) {
      if (tapped("navR")) { focus = (focus + 1) % cards.length; AUDIO.sfx("select"); }
      if (tapped("navL")) { focus = (focus - 1 + cards.length) % cards.length; AUDIO.sfx("select"); }
      if (tapped("navD")) { focus = (focus + 2) % cards.length; AUDIO.sfx("select"); }
      if (tapped("navU")) { focus = (focus - 2 + cards.length) % cards.length; AUDIO.sfx("select"); }
      if (tapped("back") || tapped("pause")) { AUDIO.sfx("confirm"); AUDIO.music("menu"); setState("map"); return; }
    }
    cards.forEach((c, i) => { if (pointIn(mouse, c)) { focus = i; if (mClicked) activateShop(c); } });
    if (edge && tapped("confirm")) activateShop(cards[focus]);
  }
  function activateShop(c) {
    if (!c) return;
    if (c.kind === "back") { AUDIO.sfx("confirm"); AUDIO.music("menu"); setState("map"); return; }
    if (c.kind === "superart") { AUDIO.sfx("confirm"); focus = Math.max(0, SUPER_ARTS.findIndex(a => a.id === (save.equipSuper || "beam"))); setState("superart"); return; }
    if (c.kind === "w") {
      const owned = save.ownedW.includes(c.id);
      if (!owned) { if (save.coins >= WEAPONS[c.id].price) { save.coins -= WEAPONS[c.id].price; save.ownedW.push(c.id); persist(); AUDIO.sfx("buy"); } else AUDIO.sfx("deny"); }
      else {
        const idx = save.equipW.indexOf(c.id);
        if (idx >= 0) { if (save.equipW.filter(Boolean).length > 1) { save.equipW[idx] = null; AUDIO.sfx("select"); } else AUDIO.sfx("deny"); }
        else { const slot = save.equipW.indexOf(null); if (slot >= 0) save.equipW[slot] = c.id; else save.equipW[1] = c.id; AUDIO.sfx("confirm"); }
        if (!save.equipW[0] && save.equipW[1]) { save.equipW[0] = save.equipW[1]; save.equipW[1] = null; }
        persist();
      }
    } else {
      const owned = save.ownedC.includes(c.id);
      if (!owned) { if (save.coins >= CHARMS[c.id].price) { save.coins -= CHARMS[c.id].price; save.ownedC.push(c.id); persist(); AUDIO.sfx("buy"); } else AUDIO.sfx("deny"); }
      else { save.equipC = (save.equipC === c.id) ? null : c.id; persist(); AUDIO.sfx("confirm"); }
    }
  }
  function drawShop() {
    // pared de madera del emporio (tablones con veta)
    const wall = ctx.createLinearGradient(0, 0, 0, H); wall.addColorStop(0, "#4a3018"); wall.addColorStop(0.55, "#33210f"); wall.addColorStop(1, "#1c1207");
    ctx.fillStyle = wall; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(0,0,0,0.22)"; ctx.lineWidth = 2; for (let x = 64; x < W; x += 116) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 150); ctx.stroke(); }
    ctx.strokeStyle = "rgba(255,220,160,0.05)"; for (let x = 67; x < W; x += 116) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H - 150); ctx.stroke(); }
    // alcoba del tendero: estantería con tarros al fondo
    drawShopShelves(1066, 150, 208, 296);
    // foco cálido sobre el expositor
    const lamp = ctx.createRadialGradient(W / 2 - 120, 120, 40, W / 2 - 120, 340, 780); lamp.addColorStop(0, "rgba(255,214,130,0.22)"); lamp.addColorStop(1, "rgba(255,214,130,0)"); ctx.fillStyle = lamp; ctx.fillRect(0, 0, W, H);
    vignetteAndGrain();
    drawBunting();
    drawHangingLamp(1170, 0, 150);
    drawShopkeeper(1170, 500, 1.5);
    // mostrador de madera con veta + brillo
    ctx.fillStyle = "#43290f"; ctx.fillRect(0, H - 150, W, 150);
    const ctr = ctx.createLinearGradient(0, H - 150, 0, H - 128); ctr.addColorStop(0, "#6a4524"); ctr.addColorStop(1, "#3a2614"); ctx.fillStyle = ctr; ctx.fillRect(0, H - 150, W, 18);
    ctx.fillStyle = "rgba(255,230,180,0.10)"; ctx.fillRect(0, H - 150, W, 4);
    ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 2; for (let x = 40; x < W; x += 96) { ctx.beginPath(); ctx.moveTo(x, H - 132); ctx.lineTo(x - 12, H); ctx.stroke(); }
    // alfombra
    ctx.fillStyle = "#6a1c22"; roundRect(W / 2 - 300, H - 30, 600, 26, 8); ctx.fill(); ctx.fillStyle = "#8a2a30"; roundRect(W / 2 - 288, H - 26, 576, 8, 4); ctx.fill();
    // cartel colgante de madera con el nombre
    ctx.strokeStyle = "#7a5a30"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W / 2 - 198, 12); ctx.lineTo(W / 2 - 170, 46); ctx.moveTo(W / 2 + 198, 12); ctx.lineTo(W / 2 + 170, 46); ctx.stroke();
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 5; ctx.fillStyle = "#5a3a1e"; roundRect(W / 2 - 230, 44, 460, 52, 12); ctx.fill(); ctx.restore();
    ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; roundRect(W / 2 - 230, 44, 460, 52, 12); ctx.stroke();
    ctx.strokeStyle = "rgba(255,210,74,0.4)"; ctx.lineWidth = 1.5; roundRect(W / 2 - 222, 50, 444, 40, 9); ctx.stroke();
    bigText("EMPORIO DE PORKY", W / 2, 80, 30, "#ffd24a");
    coinTag(108, 44, save.coins);
    shopHeader("🔫  ARMAS", 56, 184, 200);
    shopHeader("🧿  AMULETOS", 580, 184, 250);
    const cards = shopCards();
    let focused = cards[focus];
    cards.forEach((c, i) => {
      const fc = focus === i;
      if (c.kind === "back") { drawButtonRect(c, "◀  VOLVER A LA ISLA", fc); return; }
      if (c.kind === "superart") { drawButtonRect(c, "★ SÚPER ARTES", fc); return; }
      const isW = c.kind === "w", data = isW ? WEAPONS[c.id] : CHARMS[c.id];
      const owned = isW ? save.ownedW.includes(c.id) : save.ownedC.includes(c.id);
      const equipped = isW ? save.equipW.includes(c.id) : save.equipC === c.id;
      const col = isW ? data.color : "#e8434f";
      ctx.save();
      ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = fc ? 16 : 6; ctx.shadowOffsetY = 4;
      const cg = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
      if (equipped) { cg.addColorStop(0, "#3f6f4a"); cg.addColorStop(1, "#234a30"); }
      else if (owned) { cg.addColorStop(0, "#4a3a22"); cg.addColorStop(1, "#2c2012"); }
      else { cg.addColorStop(0, "#352a1a"); cg.addColorStop(1, "#1f1710"); }
      ctx.fillStyle = cg; roundRect(c.x, c.y, c.w, c.h, 10); ctx.fill();
      ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = "rgba(255,240,205,0.10)"; roundRect(c.x + 4, c.y + 4, c.w - 8, c.h * 0.4, 7); ctx.fill();
      ctx.strokeStyle = fc ? "#ffd24a" : equipped ? "#7af0a0" : owned ? "#b89050" : "#1a120a"; ctx.lineWidth = fc ? 4.5 : 3; roundRect(c.x, c.y, c.w, c.h, 10); ctx.stroke();
      if (fc) { ctx.strokeStyle = "rgba(255,210,74,0.5)"; ctx.lineWidth = 1.5; roundRect(c.x + 3.5, c.y + 3.5, c.w - 7, c.h - 7, 7); ctx.stroke(); }
      // ficha redonda con icono real del objeto
      const tx = c.x + 30, ty = c.y + Math.min(40, c.h * 0.5);
      ctx.fillStyle = "rgba(0,0,0,0.32)"; ctx.beginPath(); ctx.arc(tx, ty, 19, 0, TAU); ctx.fill();
      ctx.fillStyle = shade(col, 0.32); ctx.beginPath(); ctx.arc(tx, ty, 17.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(tx, ty, 17.5, 0, TAU); ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.22)"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(tx, ty, 15, 1.1, 2.5); ctx.stroke();
      ctx.save(); ctx.translate(tx, ty); drawShopIcon(c.kind, c.id, col); ctx.restore();
      // nombre + descripción
      ctx.textAlign = "left"; ctx.fillStyle = "#fff5e0"; ctx.font = "bold 16px Trebuchet MS"; ctx.fillText(data.name, c.x + 56, c.y + 24);
      ctx.font = "11px Trebuchet MS"; ctx.fillStyle = "#d6c6a6"; wrap(data.desc, c.x + 56, c.y + 41, c.w - 64, 12.5);
      // estado / precio
      if (equipped) {
        ctx.fillStyle = "#1e7a44"; ctx.beginPath(); ctx.moveTo(c.x + c.w - 44, c.y); ctx.lineTo(c.x + c.w, c.y); ctx.lineTo(c.x + c.w, c.y + 44); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#7af0a0"; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.save(); ctx.translate(c.x + c.w - 14, c.y + 14); ctx.rotate(Math.PI / 4); ctx.fillStyle = "#eafff0"; ctx.font = "bold 9px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText("EQUIP", 0, 3); ctx.restore();
      } else if (owned) {
        ctx.fillStyle = "#cdb070"; ctx.font = "italic 11px Trebuchet MS"; ctx.textAlign = "right"; ctx.fillText("comprado · toca para equipar", c.x + c.w - 10, c.y + c.h - 9);
      } else {
        const afford = save.coins >= data.price, px = c.x + c.w - 12, py = c.y + c.h - 11;
        ctx.fillStyle = afford ? "#f0c84a" : "#6a4a3a"; ctx.beginPath(); ctx.arc(px - 24, py - 4, 8.5, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = afford ? "#7a5a10" : "#2a1c14"; ctx.font = "bold 11px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", px - 24, py - 3); ctx.textBaseline = "alphabetic";
        ctx.fillStyle = afford ? "#ffe07a" : "#c08070"; ctx.font = "bold 15px Trebuchet MS"; ctx.textAlign = "right"; ctx.fillText(data.price, px, py);
      }
      ctx.restore();
    });
    // pergamino superior: ficha del objeto enfocado (nombre · descripción · EX)
    if (focused && (focused.kind === "w" || focused.kind === "c")) {
      const data = focused.kind === "w" ? WEAPONS[focused.id] : CHARMS[focused.id];
      const bw = 600, bx = W / 2 - bw / 2, by = 100, bh = 56;
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4;
      ctx.fillStyle = "#efe2c4"; roundRect(bx, by, bw, bh, 10); ctx.fill(); ctx.restore();
      ctx.strokeStyle = "#7a5a30"; ctx.lineWidth = 3; roundRect(bx, by, bw, bh, 10); ctx.stroke();
      ctx.strokeStyle = "rgba(120,90,48,0.5)"; ctx.lineWidth = 1.4; roundRect(bx + 5, by + 5, bw - 10, bh - 10, 7); ctx.stroke();
      ctx.textAlign = "left"; ctx.fillStyle = "#3a2410"; ctx.font = "bold 16px Trebuchet MS"; ctx.fillText(data.name, bx + 18, by + 23);
      ctx.fillStyle = "#5a4428"; ctx.font = "12.5px Trebuchet MS"; ctx.fillText(data.desc, bx + 18, by + 40);
      if (focused.kind === "w" && data.ex) { ctx.fillStyle = "#9a5a10"; ctx.font = "italic 11px Trebuchet MS"; ctx.textAlign = "right"; ctx.fillText("EX · " + data.ex, bx + bw - 16, by + 23); }
    }
  }
  function drawShopkeeper(x, y, sc) {
    sc = sc || 1;
    const bob = Math.sin(time * 2) * 2, blink = (time % 4.2) > 4.0, br = 1 + Math.sin(time * 2) * 0.012;
    ctx.save(); ctx.translate(x, y + bob); ctx.scale(sc, sc * br); ctx.lineJoin = "round"; ctx.lineCap = "round";
    // brazo izquierdo apoyado en el mostrador
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(-40, 46); ctx.quadraticCurveTo(-66, 58, -72, 82); ctx.stroke();
    ctx.strokeStyle = "#7a5a3a"; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.moveTo(-40, 46); ctx.quadraticCurveTo(-66, 58, -72, 82); ctx.stroke();
    ctx.fillStyle = "#f0a894"; ctx.beginPath(); ctx.arc(-73, 86, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
    // brazo derecho puliendo una jarra (movimiento circular con trapo)
    const hx2 = 56 + Math.cos(time * 4.2) * 6, hy2 = 26 + Math.sin(time * 4.2) * 5;
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 11; ctx.beginPath(); ctx.moveTo(40, 44); ctx.quadraticCurveTo(58, 44, hx2, hy2); ctx.stroke();
    ctx.strokeStyle = "#7a5a3a"; ctx.lineWidth = 6.5; ctx.beginPath(); ctx.moveTo(40, 44); ctx.quadraticCurveTo(58, 44, hx2, hy2); ctx.stroke();
    // la jarra que pule + destello cuando queda limpia
    ctx.fillStyle = "#9fc4e8"; roundRect(hx2 - 8, hy2 - 22, 18, 22, 4); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(hx2 + 12, hy2 - 11, 5, -1.1, 1.1); ctx.stroke();
    ctx.fillStyle = "#f0a894"; ctx.beginPath(); ctx.arc(hx2, hy2, 8, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = "#e8dcc0"; ctx.beginPath(); ctx.arc(hx2 - 3, hy2 - 6, 5.5, 0, TAU); ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke();   // trapo
    if ((time % 2.6) > 2.3) { ctx.fillStyle = "#fff"; star(hx2 + 4, hy2 - 26, 6, 4); ctx.fill(); }
    ctx.fillStyle = "#7a5a3a"; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; roundRect(-46, 24, 92, 80, 14); ctx.fill(); ctx.stroke();        // cuerpo
    ctx.fillStyle = "#e8dcc0"; roundRect(-26, 30, 52, 70, 10); ctx.fill(); ctx.stroke();                                                      // peto del delantal
    // orejas con tic nervioso
    ctx.fillStyle = "#e89a86"; [-1, 1].forEach(s => { const tw = (Math.floor(time * 0.8) % 4 === (s > 0 ? 1 : 3)) ? Math.sin(time * 22) * 0.12 : 0; ctx.save(); ctx.translate(s * 28, -36); ctx.rotate(tw * s); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(s * 20, -16); ctx.lineTo(s * 12, 12); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore(); }); // orejas
    ctx.fillStyle = "#f0a894"; ctx.beginPath(); ctx.ellipse(0, -10, 48, 42, 0, 0, TAU); ctx.fill(); ctx.stroke();                              // cabeza
    ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.moveTo(0, 24); ctx.lineTo(-15, 15); ctx.lineTo(-15, 33); ctx.closePath(); ctx.moveTo(0, 24); ctx.lineTo(15, 15); ctx.lineTo(15, 33); ctx.closePath(); ctx.fill(); ctx.stroke(); // pajarita
    ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(0, 24, 3.5, 0, TAU); ctx.fill();
    ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-16, -16, 9, 0, TAU); ctx.arc(16, -16, 9, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.stroke(); // ojos
    ctx.fillStyle = "#1a120a"; ctx.strokeStyle = "#1a120a"; if (blink) { ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-22, -16); ctx.lineTo(-10, -16); ctx.moveTo(10, -16); ctx.lineTo(22, -16); ctx.stroke(); } else { ctx.beginPath(); ctx.arc(-14, -15, 4, 0, TAU); ctx.arc(18, -15, 4, 0, TAU); ctx.fill(); }
    ctx.fillStyle = "rgba(216,120,110,0.5)"; ctx.beginPath(); ctx.arc(-30, 2, 7, 0, TAU); ctx.arc(30, 2, 7, 0, TAU); ctx.fill();                  // mejillas
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(-24, -28); ctx.lineTo(-9, -25); ctx.moveTo(24, -28); ctx.lineTo(9, -25); ctx.stroke(); ctx.lineCap = "butt"; // cejas
    ctx.fillStyle = "#d88a76"; ctx.beginPath(); ctx.ellipse(0, 6, 18, 12, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#1a120a"; ctx.stroke();        // hocico
    ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(-6, 6, 2.6, 0, TAU); ctx.arc(6, 6, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = "#d8ccae"; roundRect(-20, 56, 40, 30, 6); ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = "#1a120a"; ctx.stroke();           // bolsillo del delantal
    ctx.fillStyle = "#f0c84a"; ctx.beginPath(); ctx.arc(0, 62, 7, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = "#7a5a10"; ctx.font = "bold 9px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", 0, 62); ctx.textBaseline = "alphabetic"; // moneda en el bolsillo
    ctx.restore();
  }
  // ------- adornos del Emporio -------
  function drawBunting() {
    const cols = ["#c0392b", "#e0a32e", "#2e7d5b", "#2a6a9a"];
    ctx.strokeStyle = "rgba(0,0,0,0.4)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 8); for (let x = 0; x <= W; x += 60) ctx.quadraticCurveTo(x + 30, 18, x + 60, 8); ctx.stroke();
    for (let i = 0, x = 18; x < W; x += 40, i++) { ctx.fillStyle = cols[i % cols.length]; ctx.beginPath(); ctx.moveTo(x - 12, 11); ctx.lineTo(x + 12, 11); ctx.lineTo(x, 30); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "rgba(0,0,0,0.3)"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.moveTo(x - 7, 12); ctx.lineTo(x + 2, 12); ctx.lineTo(x - 3, 20); ctx.closePath(); ctx.fill(); }
  }
  function drawShopShelves(x, y, w, h) {
    ctx.fillStyle = "rgba(0,0,0,0.30)"; roundRect(x, y, w, h, 8); ctx.fill();
    ctx.strokeStyle = "#3a2614"; ctx.lineWidth = 6; roundRect(x, y, w, h, 8); ctx.stroke();
    const jars = ["#7ab0c0", "#c08a4a", "#9a7ac0", "#7ac08a", "#c07a9a", "#b0c07a"];
    for (let r = 0; r < 2; r++) {
      const sy = y + 78 + r * 116;
      ctx.fillStyle = "#5a3a20"; ctx.fillRect(x + 10, sy, w - 20, 12); ctx.fillStyle = "rgba(255,230,180,0.12)"; ctx.fillRect(x + 10, sy, w - 20, 3);
      for (let j = 0; j < 3; j++) {
        const jx = x + 40 + j * ((w - 80) / 2), col = jars[(r * 3 + j) % jars.length];
        ctx.fillStyle = col; ctx.globalAlpha = 0.8; roundRect(jx - 13, sy - 34, 26, 34, 6); ctx.fill(); ctx.globalAlpha = 1;
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; roundRect(jx - 13, sy - 34, 26, 34, 6); ctx.stroke();
        ctx.fillStyle = "#caa86a"; roundRect(jx - 10, sy - 41, 20, 9, 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.22)"; ctx.fillRect(jx - 9, sy - 30, 5, 24);
      }
    }
  }
  function drawHangingLamp(x, topY, len) {
    const g = ctx.createRadialGradient(x, topY + len, 10, x, topY + len + 120, 240); g.addColorStop(0, "rgba(255,212,128,0.32)"); g.addColorStop(1, "rgba(255,212,128,0)"); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, topY + len + 90, 240, 0, TAU); ctx.fill();
    ctx.strokeStyle = "#2a1c10"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, topY); ctx.lineTo(x, topY + len - 26); ctx.stroke();
    ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.moveTo(x - 30, topY + len); ctx.lineTo(x + 30, topY + len); ctx.lineTo(x + 18, topY + len - 30); ctx.lineTo(x - 18, topY + len - 30); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#3a2a18"; ctx.beginPath(); ctx.moveTo(x - 30, topY + len); ctx.lineTo(x + 30, topY + len); ctx.lineTo(x + 23, topY + len - 8); ctx.lineTo(x - 23, topY + len - 8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#ffe6a0"; ctx.beginPath(); ctx.arc(x, topY + len - 1, 7, 0, TAU); ctx.fill();
  }
  function shopHeader(label, x, y, w) {
    ctx.fillStyle = "#5a3a1e"; roundRect(x - 8, y - 22, w, 32, 8); ctx.fill();
    ctx.strokeStyle = "#caa86a"; ctx.lineWidth = 2; roundRect(x - 8, y - 22, w, 32, 8); ctx.stroke();
    ctx.fillStyle = "#f3e3c0"; ctx.font = "bold 20px Georgia"; ctx.textAlign = "left"; ctx.textBaseline = "alphabetic"; ctx.fillText(label, x + 4, y);
  }
  // mini-emblema de cada arma/amuleto dibujado dentro de la ficha (centro en 0,0; ~±14 px)
  function drawShopIcon(kind, id, col) {
    const ink = "#1a120a"; ctx.lineJoin = "round"; ctx.lineCap = "round"; ctx.strokeStyle = ink; ctx.fillStyle = col; ctx.lineWidth = 2;
    if (kind === "w") {
      switch (id) {
        case "pea": ctx.fillStyle = "#4a4a58"; roundRect(-13, -4, 12, 8, 2); ctx.fill(); ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(4, 0, 5, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = col; ctx.globalAlpha = 0.6; ctx.beginPath(); ctx.moveTo(9, -3); ctx.lineTo(13, -3); ctx.moveTo(9, 3); ctx.lineTo(13, 3); ctx.stroke(); ctx.globalAlpha = 1; break;
        case "spread": for (let i = -2; i <= 2; i++) { ctx.save(); ctx.rotate(i * 0.34); ctx.beginPath(); ctx.arc(8, 0, 3.2, 0, TAU); ctx.fillStyle = col; ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = ink; ctx.stroke(); ctx.restore(); } ctx.fillStyle = "#4a4a58"; ctx.beginPath(); ctx.arc(-10, 0, 4, 0, TAU); ctx.fill(); ctx.stroke(); break;
        case "chaser": ctx.strokeStyle = col; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(1, 2, 9, -2.2, 0.5); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(10, 4); ctx.lineTo(14, 1); ctx.lineTo(12, 8); ctx.closePath(); ctx.fill(); ctx.beginPath(); ctx.arc(-6, -5, 3.6, 0, TAU); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = ink; ctx.stroke(); break;
        case "charge": ctx.fillStyle = col; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = col; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.7; for (const r of [11, 13.5]) { ctx.beginPath(); ctx.arc(0, 0, r, -0.6, 0.6); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, r, Math.PI - 0.6, Math.PI + 0.6); ctx.stroke(); } ctx.globalAlpha = 1; break;
        case "lobber": ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.setLineDash([3, 2]); ctx.beginPath(); ctx.moveTo(-12, 7); ctx.quadraticCurveTo(-2, -14, 10, 5); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.beginPath(); ctx.arc(9, 6, 5, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(11, 1); ctx.lineTo(13, -3); ctx.stroke(); break;
        case "boomerang": ctx.strokeStyle = col; ctx.lineWidth = 5.5; ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(2, 4); ctx.lineTo(12, -6); ctx.stroke(); ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.stroke(); break;
        case "ray": ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(3, -13); ctx.lineTo(-6, 2); ctx.lineTo(0, 2); ctx.lineTo(-3, 13); ctx.lineTo(9, -3); ctx.lineTo(2, -3); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.6; ctx.stroke(); break;
        case "wave": ctx.strokeStyle = col; ctx.lineWidth = 2.6; for (const r of [5, 9, 13]) { ctx.beginPath(); ctx.arc(-7, 0, r, -1.0, 1.0); ctx.stroke(); } break;
        case "needle": ctx.strokeStyle = col; ctx.lineWidth = 2.2; for (const yy of [-6, 0, 6]) { ctx.beginPath(); ctx.moveTo(-12, yy); ctx.lineTo(8, yy); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(8, yy - 2.4); ctx.lineTo(13, yy); ctx.lineTo(8, yy + 2.4); ctx.closePath(); ctx.fill(); } break;
        case "comet": ctx.fillStyle = col; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(-13, 8); ctx.quadraticCurveTo(-2, 2, 7, -2); ctx.quadraticCurveTo(-2, 7, -13, 8); ctx.fill(); ctx.globalAlpha = 1; ctx.beginPath(); ctx.arc(7, -3, 5.5, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = "#fff"; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(5, -5, 1.7, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; break;
        case "mirror": ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.5; ctx.setLineDash([2, 2]); ctx.beginPath(); ctx.moveTo(0, -13); ctx.lineTo(0, 13); ctx.stroke(); ctx.setLineDash([]); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-4, 0); ctx.lineTo(-12, -6); ctx.lineTo(-12, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(4, 0); ctx.lineTo(12, -6); ctx.lineTo(12, 6); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case "random": ctx.fillStyle = col; roundRect(-11, -11, 22, 22, 4); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a120a"; roundRect(-11, -11, 22, 22, 4); ctx.stroke(); ctx.fillStyle = "#1a120a"; for (const p of [[-5, -5], [5, -5], [0, 0], [-5, 5], [5, 5]]) { ctx.beginPath(); ctx.arc(p[0], p[1], 2, 0, TAU); ctx.fill(); } break;
        case "brass": ctx.strokeStyle = col; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.moveTo(-13, 2); ctx.lineTo(3, 2); ctx.stroke(); ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(3, 2); ctx.lineTo(13, -6); ctx.lineTo(13, 10); ctx.closePath(); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = ink; ctx.stroke(); ctx.fillStyle = ink; for (const vx2 of [-9, -5, -1]) ctx.fillRect(vx2, -4, 2, 5); ctx.fillStyle = "#fff"; star(9, -9, 3.5, 4); ctx.fill(); break;
        default: ctx.beginPath(); ctx.arc(0, 0, 7, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.stroke();
      }
    } else {
      const heart = (ox, oy, s) => { ctx.beginPath(); ctx.moveTo(ox, oy + 4.5 * s); ctx.bezierCurveTo(ox - 7 * s, oy - 3 * s, ox - 3 * s, oy - 8 * s, ox, oy - 3 * s); ctx.bezierCurveTo(ox + 3 * s, oy - 8 * s, ox + 7 * s, oy - 3 * s, ox, oy + 4.5 * s); ctx.closePath(); ctx.fill(); ctx.stroke(); };
      ctx.fillStyle = "#e8434f"; ctx.strokeStyle = ink;
      switch (id) {
        case "heart": heart(0, 0, 1.7); break;
        case "twin": heart(-5, 2, 1.15); heart(6, -2, 1.15); break;
        case "coffee": ctx.fillStyle = "#e8dcc0"; roundRect(-9, -3, 14, 13, 2); ctx.fill(); ctx.stroke(); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(7, 3, 4, -1.2, 1.2); ctx.stroke(); ctx.fillStyle = "#5a3a20"; roundRect(-7, -1, 10, 4, 1); ctx.fill(); ctx.strokeStyle = "#d8c8a8"; ctx.lineWidth = 1.6; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.moveTo(-4, -6); ctx.quadraticCurveTo(-6, -9, -3, -12); ctx.moveTo(1, -6); ctx.quadraticCurveTo(3, -9, 0, -12); ctx.stroke(); ctx.globalAlpha = 1; break;
        case "smoke": ctx.fillStyle = "#cfd8e0"; for (const p of [[-6, 2, 5], [2, 4, 5], [5, -2, 5], [-2, -3, 5], [0, 1, 6]]) { ctx.beginPath(); ctx.arc(p[0], p[1], p[2], 0, TAU); ctx.fill(); } ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 1, 9.5, 0, TAU); ctx.stroke(); break;
        case "whet": ctx.save(); ctx.rotate(-0.3); ctx.fillStyle = "#8a98a8"; roundRect(-12, -3, 22, 7, 2); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); ctx.fillStyle = "#fff8c0"; star(7, -6, 4, 4); ctx.fill(); break;
        case "magnet": ctx.strokeStyle = "#d23a3a"; ctx.lineWidth = 6; ctx.beginPath(); ctx.arc(0, -1, 8, Math.PI, 0); ctx.stroke(); ctx.strokeStyle = ink; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.arc(0, -1, 8, Math.PI, 0); ctx.stroke(); ctx.fillStyle = "#cfd8e0"; ctx.fillRect(-11, -1, 6, 7); ctx.fillRect(5, -1, 6, 7); ctx.strokeRect(-11, -1, 6, 7); ctx.strokeRect(5, -1, 6, 7); break;
        case "shield": ctx.fillStyle = "#8fb8e0"; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, -7); ctx.lineTo(9, 3); ctx.quadraticCurveTo(9, 10, 0, 13); ctx.quadraticCurveTo(-9, 10, -9, 3); ctx.lineTo(-9, -7); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, 8); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.stroke(); break;
        case "spring": ctx.strokeStyle = "#b8b8c0"; ctx.lineWidth = 2.6; ctx.beginPath(); for (let i = 0; i <= 24; i++) { const t = i / 24, yy = -11 + t * 22, xx = Math.sin(t * Math.PI * 4) * 6; i ? ctx.lineTo(xx, yy) : ctx.moveTo(xx, yy); } ctx.stroke(); break;
        case "feather": ctx.save(); ctx.rotate(0.5); ctx.fillStyle = "#e0f0ff"; ctx.beginPath(); ctx.ellipse(0, 0, 5, 12, 0, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = ink; ctx.stroke(); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 12); ctx.stroke(); ctx.restore(); break;
        case "hourglass": ctx.fillStyle = "#e8dcc0"; ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-8, -11); ctx.lineTo(8, -11); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(-8, 11); ctx.lineTo(8, 11); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.strokeStyle = "#7a5a30"; ctx.lineWidth = 2.6; ctx.beginPath(); ctx.moveTo(-9, -12); ctx.lineTo(9, -12); ctx.moveTo(-9, 12); ctx.lineTo(9, 12); ctx.stroke(); ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.moveTo(-4, -8); ctx.lineTo(4, -8); ctx.lineTo(0, -2); ctx.closePath(); ctx.fill(); break;
        case "ballast": ctx.fillStyle = "#8a98a8"; ctx.beginPath(); ctx.moveTo(-9, -2); ctx.lineTo(9, -2); ctx.lineTo(6, 11); ctx.lineTo(-6, 11); ctx.closePath(); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a120a"; ctx.stroke(); ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, -8, 4, 0, TAU); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, -4); ctx.lineTo(0, -2); ctx.stroke(); break;
        case "echo": ctx.strokeStyle = "#9fc4e8"; ctx.lineWidth = 2; for (const rr of [4, 8, 12]) { ctx.globalAlpha = 1 - (rr - 4) / 16; ctx.beginPath(); ctx.arc(2, 0, rr, -1.2, 1.2); ctx.stroke(); } ctx.globalAlpha = 1; ctx.fillStyle = "#cfe6ff"; ctx.beginPath(); ctx.arc(-6, 0, 3, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.4; ctx.stroke(); break;
        case "god": for (let i = 0; i < 8; i++) { const a = i * (TAU / 8); ctx.strokeStyle = "rgba(255,210,74,0.85)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(Math.cos(a) * 7, 3 + Math.sin(a) * 7); ctx.lineTo(Math.cos(a) * 13, 3 + Math.sin(a) * 13); ctx.stroke(); } ctx.fillStyle = "#fff8d0"; ctx.beginPath(); ctx.arc(0, 3, 6, 0, TAU); ctx.fill(); ctx.lineWidth = 1.6; ctx.strokeStyle = "#1a120a"; ctx.stroke(); ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.ellipse(0, -8, 9, 3.4, 0, 0, TAU); ctx.stroke(); ctx.lineWidth = 1.2; ctx.strokeStyle = "#1a120a"; ctx.stroke(); break;
        default: heart(0, 0, 1.5);
      }
    }
    ctx.lineCap = "butt";
  }
  function wrap(text, x, y, maxw, lh) {
    const words = text.split(" "); let line = "", yy = y;
    for (const w of words) { const test = line + w + " "; if (ctx.measureText(test).width > maxw && line) { ctx.fillText(line, x, yy); line = w + " "; yy += lh; } else line = test; }
    ctx.fillText(line, x, yy);
  }

  /* ============================================================
     SELECCIÓN DE DIFICULTAD
     ============================================================ */
  let pendingBoss = 0, pendingRush = false;
  function expertUnlocked() { return pendingRush || expertUnlockedFor(BOSSES[pendingBoss] ? BOSSES[pendingBoss].world : 1); }
  function diffButtons() {
    const top = [{ k: "simple" }, { k: "regular" }, { k: "expert" }].map((d, i) => ({ x: 180 + i * 320, y: 296, w: 280, h: 206, k: d.k }));
    top.push({ x: 180, y: 522, w: 920, h: 66, k: "locura" });   // 4ª opción: barra ancha
    return top;
  }
  function updateDiff(dt, edge) {
    const btns = diffButtons();
    navList(btns.length, edge);
    btns.forEach((b, i) => { if (pointIn(mouse, b)) { focus = i; if (mClicked) chooseDiff(b.k); } });
    if (edge && tapped("confirm")) chooseDiff(btns[focus].k);
    if (edge && (tapped("back") || tapped("pause"))) { AUDIO.sfx("select"); pendingRush = false; setState("map"); }
  }
  function chooseDiff(k) {
    if ((k === "expert" || k === "locura") && !expertUnlocked()) { AUDIO.sfx("deny"); return; }
    DIFF = DIFFS[k]; save.difficulty = k; persist(); AUDIO.sfx("confirm");
    if (pendingRush) { pendingRush = false; startRush(); } else startBoss(pendingBoss);
  }
  function drawDiff() {
    theaterBg(pendingRush ? "#7a1020" : BOSSES[pendingBoss].color); vignetteAndGrain();
    bigText("ELIGE TU RETO", W / 2, 136, 48, "#ffd24a");
    ctx.strokeStyle = "rgba(255,210,74,0.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 240, 154); ctx.lineTo(W / 2 - 30, 154); ctx.moveTo(W / 2 + 30, 154); ctx.lineTo(W / 2 + 240, 154); ctx.stroke();
    ctx.fillStyle = "#ffd24a"; star(W / 2, 152, 7, 5); ctx.fill();
    bigText(pendingRush ? "⚔️ BOSS RUSH — los 15 jefes seguidos a contrarreloj" : ("contra " + BOSSES[pendingBoss].name), W / 2, 192, 24, "#fff");
    const expOk = expertUnlocked();
    const GLYPH = { simple: "☘", regular: "♪", expert: "🔥", locura: "☠" }, STARS = { simple: 1, regular: 2, expert: 3, locura: 4 };
    diffButtons().forEach((b, i) => {
      const d = DIFFS[b.k], fc = focus === i, locked = (b.k === "expert" || b.k === "locura") && !expOk;
      ctx.save();
      if (fc && !locked) { ctx.translate(b.x + b.w / 2, b.y + b.h / 2); ctx.rotate(Math.sin(time * 3) * 0.008); ctx.translate(-(b.x + b.w / 2), -(b.y + b.h / 2)); ctx.shadowColor = d.color; ctx.shadowBlur = 28; }
      if (b.k === "locura") {   // barra ancha (dificultad demente)
        const lg2 = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
        if (locked) { lg2.addColorStop(0, "#241628"); lg2.addColorStop(1, "#160c1a"); } else { lg2.addColorStop(0, shade(d.color, 0.34)); lg2.addColorStop(1, shade(d.color, 0.16)); }
        ctx.fillStyle = lg2; roundRect(b.x, b.y, b.w, b.h, 14); ctx.fill();
        ctx.strokeStyle = fc ? (locked ? "#888" : d.color) : "#1a120a"; ctx.lineWidth = fc ? 6 : 4; roundRect(b.x, b.y, b.w, b.h, 14); ctx.stroke(); ctx.shadowBlur = 0;
        // pulso eléctrico en el borde cuando está abierta
        if (!locked) { ctx.save(); ctx.setLineDash([10, 14]); ctx.lineDashOffset = -time * 60; ctx.strokeStyle = `rgba(220,140,255,${0.35 + Math.sin(time * 6) * 0.2})`; ctx.lineWidth = 2; roundRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8, 10); ctx.stroke(); ctx.restore(); }
        const shk = (fc && !locked) ? Math.sin(time * 30) * 1.2 : 0;
        bigText("☠ " + d.name, b.x + 118 + shk, b.y + 44, 30, locked ? "#888" : d.color);
        if (locked) { ctx.fillStyle = "#ffb0a0"; ctx.font = "bold 15px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText("🔒 Desbloquea el Experto de este mundo para abrir la Locura", b.x + b.w / 2, b.y + b.h / 2 + 16); }
        else { ctx.textAlign = "left"; ctx.fillStyle = "#f3e3c0"; ctx.font = "14px Trebuchet MS"; ctx.fillText(d.blurb, b.x + 260, b.y + 30); ctx.fillStyle = "#dcc0ee"; ctx.font = "12px Trebuchet MS"; ctx.fillText("Vida ×" + d.hp.toFixed(2) + "  ·  ataques mucho más rápidos  ·  proyectiles veloces  ·  casi sin aviso", b.x + 260, b.y + 50); }
        ctx.restore(); return;
      }
      const cg2 = ctx.createLinearGradient(0, b.y, 0, b.y + b.h);
      if (locked) { cg2.addColorStop(0, "#2a2428"); cg2.addColorStop(1, "#1a1618"); } else { cg2.addColorStop(0, shade(d.color, 0.36)); cg2.addColorStop(1, shade(d.color, 0.18)); }
      ctx.fillStyle = cg2; roundRect(b.x, b.y, b.w, b.h, 16); ctx.fill();
      ctx.strokeStyle = fc ? (locked ? "#888" : d.color) : "#1a120a"; ctx.lineWidth = fc ? 7 : 4; roundRect(b.x, b.y, b.w, b.h, 16); ctx.stroke(); ctx.shadowBlur = 0;
      // medallón con el glifo de la dificultad
      const my2 = b.y + 4, bounce = fc && !locked ? Math.sin(time * 5) * 3 : 0;
      ctx.fillStyle = shade(locked ? "#555555" : d.color, 0.55); ctx.beginPath(); ctx.arc(b.x + b.w / 2, my2 + bounce, 27, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.strokeStyle = locked ? "#777" : d.color; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(b.x + b.w / 2, my2 + bounce, 21, 0, TAU); ctx.stroke();
      bigText(GLYPH[b.k], b.x + b.w / 2, my2 + 9 + bounce, 26, locked ? "#888" : "#fff");
      bigText(d.name, b.x + b.w / 2, b.y + 72, 34, locked ? "#888" : d.color);
      // estrellas de intensidad
      for (let s2 = 0; s2 < 4; s2++) {
        const sx4 = b.x + b.w / 2 - 42 + s2 * 28, on2 = s2 < STARS[b.k];
        ctx.fillStyle = on2 && !locked ? "#ffd24a" : "rgba(0,0,0,0.35)"; star(sx4, b.y + 92, 9, 5); ctx.fill();
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.8; ctx.stroke();
      }
      ctx.fillStyle = "#f3e3c0"; ctx.font = "15px Trebuchet MS"; ctx.textAlign = "center"; wrapC(d.blurb, b.x + b.w / 2, b.y + 120, b.w - 40, 19);
      ctx.fillStyle = "#cfe0d0"; ctx.font = "13px Trebuchet MS";
      ctx.fillText("Vida del jefe ×" + d.hp.toFixed(2) + "  ·  ataques " + (d.atk < 1 ? "+rápidos" : d.atk > 1 ? "+lentos" : "normales"), b.x + b.w / 2, b.y + 178);
      if (locked) { ctx.fillStyle = "rgba(0,0,0,0.55)"; roundRect(b.x, b.y, b.w, b.h, 16); ctx.fill(); bigText("🔒", b.x + b.w / 2, b.y + 104, 42, "#fff"); ctx.fillStyle = "#ffb0a0"; ctx.font = "bold 14px Trebuchet MS"; wrapC("Vence a TODOS los jefes en Normal para desbloquear", b.x + b.w / 2, b.y + 144, b.w - 30, 18); }
      ctx.restore();
    });
    bigText("Z/Ⓐ confirmar   ·   Esc/Ⓑ volver", W / 2, 624, 18, "#caa");
  }
  function wrapC(text, x, y, maxw, lh) { ctx.textAlign = "center"; const words = text.split(" "); let line = "", yy = y; for (const w of words) { const test = line + w + " "; if (ctx.measureText(test).width > maxw && line) { ctx.fillText(line.trim(), x, yy); line = w + " "; yy += lh; } else line = test; } ctx.fillText(line.trim(), x, yy); }

  /* ============================================================
     FLUJO DE COMBATE
     ============================================================ */
  function resetWorld() { bullets = []; projs = []; hazards = []; parts = []; enemies = []; coins = []; superArtFx = null; platforms = []; cam.x = 0; rev.grav = 1; rev.inkOn = false; rev.inkY = GROUND; echoT = 0; echoTrail.length = 0; windT = 0; windFx = 0; }
  function startBoss(idx) {
    curMode = "boss"; curIndex = idx; bossDef = BOSSES[idx]; bossIndex = idx; worldW = W;
    resetWorld();
    if (bossDef.id === "moth" || bossDef.id === "collector") platforms = [{ x: 230, y: GROUND - 150, w: 170, h: 22 }, { x: W - 400, y: GROUND - 150, w: 170, h: 22 }, { x: W / 2 - 90, y: GROUND - 270, w: 180, h: 22 }];
    else if (bossDef.id === "pirate" || bossDef.id === "robot") platforms = [{ x: 380, y: GROUND - 160, w: 160, h: 22 }, { x: W - 560, y: GROUND - 160, w: 160, h: 22 }];
    else if (bossDef.id === "jester") platforms = [{ x: W / 2 - 110, y: GROUND - 150, w: 220, h: 22 }];
    else if (bossDef.id === "ice") platforms = [{ x: 300, y: GROUND - 150, w: 160, h: 22 }, { x: W - 460, y: GROUND - 150, w: 160, h: 22 }];
    const fl = bossDef.mode === "flight"; if (fl) platforms = [];
    spawnPlayers(fl ? 150 : 170, fl ? H / 2 - player.h / 2 : GROUND - player.h, fl);
    boss = bossDef.make(G);
    boss.maxHp = Math.round(boss.maxHp * DIFF.hp); boss.hp = boss.maxHp;
    winDrop = ""; musPhase = 1;
    fightStats = { time: 0, parries: 0, supers: 0, hit: false };
    setState("intro"); introStage = 0;
    AUDIO.music((bossDef.id === "collector" || bossDef.id === "croupier") ? "boss" : "battle", { transpose: bossDef.transpose || 0 });
    AUDIO.sting && AUDIO.sting("go");
  }
  function startSecretBoss() {
    curMode = "boss"; curIndex = -2; bossDef = SECRET_BOSS; bossIndex = -2; worldW = W;
    resetWorld();
    platforms = [{ x: 250, y: GROUND - 160, w: 150, h: 22 }, { x: W - 400, y: GROUND - 160, w: 150, h: 22 }];
    spawnPlayers(170, GROUND - player.h, false);
    boss = SECRET_BOSS.make(G);
    boss.maxHp = Math.round(boss.maxHp * DIFF.hp); boss.hp = boss.maxHp;
    musPhase = 1;
    fightStats = { time: 0, parries: 0, supers: 0, hit: false };
    setState("intro"); introStage = 0;
    AUDIO.music("boss", { transpose: SECRET_BOSS.transpose || 0 });
    AUDIO.sting && AUDIO.sting("go");
  }
  /* ---- Boss Rush: los 15 jefes seguidos a contrarreloj ---- */
  let rushActive = false, rushIdx = 0, rushTime = 0, rushResult = "", rushRecord = false, musPhase = 1;
  const RUSH_KEY = "ragtime_rush";
  function rushBest() { try { return JSON.parse(localStorage.getItem(RUSH_KEY)) || {}; } catch (e) { return {}; } }
  function startRush() { rushActive = true; rushIdx = 0; rushTime = 0; rushResult = ""; rushRecord = false; startBoss(0); }
  function rushAdvance() {
    rushIdx++;
    if (rushIdx >= BOSSES.filter(b => b.world <= 4).length) {   // el Boss Rush son los 15 jefes principales (el Reverso queda aparte)
      const b = rushBest(), k = DIFF.key; rushRecord = (b[k] == null || rushTime < b[k]);
      if (rushRecord) {
        b[k] = rushTime; try { localStorage.setItem(RUSH_KEY, JSON.stringify(b)); } catch (e) { }
        const entry = { mode: "rush", diff: k, time: +rushTime.toFixed(1), name: OPT.name || "PIP" };
        // si aún no elegiste nombre, el récord ESPERA a que lo firmes en la pantalla de victoria
        if (entry.name === "PIP") pendingLb = entry; else lbPost(entry);
      }
      rushActive = false; rushResult = "win"; flashScreen = 0.5; AUDIO.music("victory"); setState("rushdone");
    } else startBoss(rushIdx);
  }
  function rushDie() { rushActive = false; rushResult = "lose"; AUDIO.stop(); AUDIO.sfx("lose"); setState("rushdone"); }
  function startRng(idx) {
    if (idx < 0 || !RNG_LEVELS[idx]) return startTutorial(); // salvaguarda (p. ej. reintentar el tutorial)
    curMode = "rng"; curIndex = idx; curLevel = RNG_LEVELS[idx]; bossDef = null; boss = null;
    worldW = curLevel.width; resetWorld();
    buildRng(curLevel, idx * 7919 + 11);
    const fl = curLevel.mode === "flight";
    spawnPlayers(fl ? 140 : 80, fl ? H / 2 - player.h / 2 : GROUND - player.h, fl);
    fightStats = { time: 0, parries: 0, supers: 0, hit: false };
    rngStartCoins = save.coins;
    setState("rngintro");
    AUDIO.music("battle", { transpose: (idx * 4) % 12 });
    AUDIO.sting && AUDIO.sting("go");
  }
  function buildTutorial() {
    enemies = []; coins = []; platforms = [{ x: 1480, y: GROUND - 150, w: 170, h: 22 }];
    enemies.push(mkEnemy("blob", 1060, GROUND - 44, "#6aa84a"));
    enemies.push(mkEnemy("blob", 1260, GROUND - 44, "#6aa84a"));
    for (let i = 0; i < 5; i++) { const x = 900 + i * 170, id = "tutorial:" + i; coins.push({ x, y: GROUND - 56, id, got: !!save.collectedCoins[id] }); }
  }
  function startTutorial() {
    curMode = "rng"; curIndex = -1; curLevel = TUTORIAL; bossDef = null; boss = null;
    worldW = TUTORIAL.width; resetWorld(); buildTutorial();
    spawnPlayers(80, GROUND - player.h, false);
    fightStats = { time: 0, parries: 0, supers: 0, hit: false }; rngStartCoins = save.coins;
    setState("rngintro"); AUDIO.music("menu");
  }
  function completeRng() {
    if (curLevel.tutorial) { AUDIO.sfx("confirm"); AUDIO.music("menu"); setState("map"); return; }
    const bonus = 3; save.coins += bonus; save.rngDone[curLevel.id] = true;
    save.stats.playtime += fightStats.time; save.stats.parries += fightStats.parries; persist();
    rngBonus = bonus; AUDIO.music("victory"); AUDIO.sfx("ko"); rumble(0.4, 0.8, 0.8); setState("rngwon");
  }
  function retry() { if (curMode === "rng") { if (curIndex < 0 || (curLevel && curLevel.tutorial)) startTutorial(); else startRng(curIndex); } else if (bossDef && bossDef.secret) startSecretBoss(); else if (bossDef && bossDef.code) startCodeBoss(); else startBoss(curIndex); }
  function bossesOf(w) { const a = []; BOSSES.forEach((b, i) => { if (b.world === w) a.push(i); }); return a; }
  function rngOf(w) { const a = []; RNG_LEVELS.forEach((l, i) => { if (l.world === w) a.push(i); }); return a; }
  function world2Open() { return save.defeated.includes("collector"); }
  function world3Open() { return save.defeated.includes("croupier"); }
  function world4Open() { return save.defeated.includes("director"); }
  function world5Open() { return !!save.finished; }   // El Reverso se abre al terminar el juego (vencer a El Autor)
  function travelOpen(to) { return to <= 1 ? true : to === 2 ? world2Open() : to === 3 ? world3Open() : to === 4 ? world4Open() : world5Open(); }
  function unlocked(i) {
    const w = BOSSES[i].world;
    if (!travelOpen(w)) return false;
    const wb = bossesOf(w), pos = wb.indexOf(i);
    if (pos === 0) return true;
    if (pos < wb.length - 1) return save.defeated.includes(BOSSES[wb[pos - 1]].id);
    return wb.slice(0, -1).every(gi => save.defeated.includes(BOSSES[gi].id));
  }
  function expertUnlockedFor(w) { return bossesOf(w).every(gi => save.beatenNormal.includes(BOSSES[gi].id)); }
  // botín exclusivo del Reverso: cada jefe suelta un arma/amuleto que SOLO se consigue aquí
  function grantReverseDrop(id) {
    const drops = { twin: { w: "mirror" }, siphon: { c: "ballast" }, lefthand: { w: "random", c: "echo" } }[id];
    if (!drops) return; winDrop = "";
    if (drops.w && !save.ownedW.includes(drops.w)) { save.ownedW.push(drops.w); winDrop = WEAPONS[drops.w].name; }
    if (drops.c && !save.ownedC.includes(drops.c)) { save.ownedC.push(drops.c); winDrop = (winDrop ? winDrop + " + " : "") + CHARMS[drops.c].name; }
  }
  function computeGrade() {
    const mh = playerMaxHp(); let pts = 0;
    pts += player.hp >= mh ? 2 : player.hp / mh >= 0.6 ? 1 : 0;
    pts += fightStats.parries >= 1 ? 1 : 0;
    pts += fightStats.time <= (bossDef.id === "collector" ? 80 : 55) ? 1 : 0;
    pts += DIFF.key === "locura" ? 2 : DIFF.key === "expert" ? 1 : DIFF.key === "simple" ? -1 : 0;
    return pts >= 5 ? "S" : pts >= 4 ? "A" : pts >= 2 ? "B" : pts >= 1 ? "C" : "D";
  }

  /* ============================================================
     MÁQUINA DE ESTADOS
     ============================================================ */
  let state = "title", time = 0, stateT = 0, focus = 0, introStage = 0, winGrade = "B", rngBonus = 0, rngStartCoins = 0, winDrop = "";
  // transición de IRIS (el círculo que se abre, marca de la casa en los cartoons de los 30)
  let iris = 0, irisCX = W / 2, irisCY = H / 2; const IRIS_DUR = 0.45;
  function setState(s) {
    const wasPaused = state === "paused";
    state = s; stateT = 0; iris = IRIS_DUR;
    // el iris se abre CENTRADO EN TI al entrar en combate (más cine)
    if (s === "intro" || s === "rngintro") { irisCX = clamp(player.x + player.w / 2 - cam.x, 120, W - 120); irisCY = clamp(player.y + player.h / 2, 120, H - 120); }
    else { irisCX = W / 2; irisCY = H / 2; }
    // en pausa la banda toca BAJITO desde el foso; al volver, a plena voz
    if (s === "paused") { if (AUDIO.setVol) AUDIO.setVol(OPT.music * 0.35, OPT.sfx); }
    else if (wasPaused) applyOpts();
    focus = (s === "diffselect") ? ["simple", "regular", "expert", "locura"].indexOf(save.difficulty) : 0; if (focus < 0) focus = 1;
  }

  /* ============================================================
     HISTORIA (todo original)
     ============================================================ */
  const STORY = {
    prologue: [
      { t: "RAGTIME RUMBLE", x: "En los tinteros de un viejo estudio de animación vive la gente de tinta de la Isla Ragtime. Bailan al compás del jazz... hasta que cae la noche.", c: "#ffd24a" },
      { t: "El trato", x: "Una noche, El COLECCIONISTA —un diablillo cobrador— engaña a Pip, nuestra tacita, para que firme un contrato. Si no lo rompe antes del amanecer, su alma será suya.", c: "#ff6a4a" },
      { t: "Tu misión", x: "Para romper el contrato, Pip debe vencer a todos los deudores del Coleccionista. ¡Corre, dispara y haz parry! El telón se levanta...", c: "#7af0a0" },
    ],
    world: {
      2: { t: "Los Cielos de Tinta", x: "El Coleccionista era solo un peón. Sobre las nubes, el Capitán Cúmulo y la Condesa Escarcha sirven a una banca mayor: el CASINO ETERNO del Crupier.", c: "#9fd0ff" },
      3: { t: "El Teatro del Abismo", x: "Tras el casino se alza un teatro sin fondo. El Titiritero y la Quimera actúan para EL DIRECTOR, que dirige esta función macabra entre las sombras.", c: "#c08aff" },
      4: { t: "La Mesa de Dibujo", x: "La verdad: todo —vosotros, la isla, el jazz— fue DIBUJADO. Más allá del telón aguarda EL AUTOR, la mano que os atrapó en la tinta para que el dibujo no acabe jamás.", c: "#e0d0ff" },
    },
    ending: [
      { t: "¡FIN DE LA FUNCIÓN!", x: "El Autor suelta la pluma. El contrato se emborrona y se deshace en gotas de tinta que caen como lluvia.", c: "#ffd24a" },
      { t: "Libres", x: "Por primera vez, la gente de tinta elige su propio compás. La Isla Ragtime vuelve a sonar... pero ahora la música es SUYA.", c: "#7af0a0" },
      { t: "FIN", x: "Gracias por jugar a RAGTIME RUMBLE.  ·  un homenaje original a la era rubber-hose  ·  arte, jefes y música 100% originales.", c: "#ff6a4a" },
    ],
    secretIntro: [
      { t: "Algo entre los renglones", x: "Las manchas se abren. De los márgenes del Vacío surge una figura a medio dibujar, temblando como un trazo que alguien quiso borrar.", c: "#ff9ec8" },
      { t: "EL DESCARTE", x: "Fue el PRIMER boceto del Autor. Lo consideró un error y lo borró antes de empezar la historia. Pero la tinta recuerda... y quiere terminar su dibujo.", c: "#ff4fa3" },
    ],
    secret: [
      { t: "Terminado", x: "El Descarte deja de temblar. Por fin alguien lo vio entero. Sonríe —o lo intenta— y se deja borrar, esta vez en paz.", c: "#ff9ec8" },
      { t: "Una página en blanco", x: "Donde el Autor solo veía un error, tú viste un personaje. Quizá ninguna criatura de tinta sea un descarte.", c: "#7af0a0" },
      { t: "★ SECRETO COMPLETADO ★", x: "Has vencido al jefe oculto de RAGTIME RUMBLE. Muy poca gente de tinta llega hasta aquí.", c: "#ffd24a" },
    ],
    // ---- MUNDO EXTRA: EL REVERSO DE TINTA (historia aparte) ----
    reverseIntro: [
      { t: "EL REVERSO DE TINTA", x: "La función terminó, pero una gota cae al REVÉS. Pip mira el charco y su reflejo no la imita: le hace señas para que cruce al otro lado del tintero.", c: "#bfe0ff" },
      { t: "Al otro lado del espejo", x: "Bajo la isla existe su Reverso: un mundo dado la vuelta donde la tinta SUBE y la gravedad miente. Aquí viven los reflejos, hartos de copiar.", c: "#9fc4e8" },
      { t: "La Mano Zurda", x: "Si El Autor dibujó el mundo con la derecha, alguien lo BORRA con la izquierda. Cruza el espejo, vence a tu reflejo y enfréntate a la Mano Zurda.", c: "#c8a8ff" },
    ],
    requiemIntro: [
      { t: "La losa se abre", x: "Las ocho cifras giran como engranajes. Bajo el Mausoleo no hay huesos: hay PARTITURAS. Miles. Y una figura de mármol que las custodia desde antes del primer dibujo.", c: "#ffd24a" },
      { t: "RÉQUIEM", x: "Es la última pieza que El Autor compuso… y la enterró por miedo a terminarla. Cuatro movimientos. Nadie ha escuchado el final y quien lo intenta pasa a formar parte del coro.", c: "#c0392b" },
      { t: "Cuarto movimiento", x: "El guardián alza su farol. La campana da la hora que no existe. Que empiece la función… por última vez.", c: "#b8a8e0" },
    ],
    requiemWin: [
      { t: "Silencio", x: "La última nota suena… y se apaga. La máscara dorada sonríe por primera vez: alguien escuchó la pieza ENTERA y sigue en pie.", c: "#ffd24a" },
      { t: "El descanso del guardián", x: "RÉQUIEM deposita su farol sobre la lápida sin nombre. Ya no custodia una obra inacabada: ahora es solo música, libre, en el aire de la isla.", c: "#b8a8e0" },
      { t: "★ LA OBRA MAESTRA ★", x: "Has vencido a RÉQUIEM, el jefe del código. Te llevas su BATUTA dorada: ahora cada parry tuyo dirige dos notas contra el enemigo. La cifra 53149900 queda grabada en tu leyenda.", c: "#7af0a0" },
    ],
    reverseEnding: [
      { t: "El trazo que faltaba", x: "La Mano Zurda suelta la goma de borrar. El Reverso deja de tirar hacia arriba y, por un instante, los dos mundos se miran de frente, iguales.", c: "#bfe0ff" },
      { t: "Reflejos libres", x: "Tu reflejo te imita una última vez: una reverencia. Ya no copia por obligación, sino porque quiere. El espejo se vuelve una simple ventana.", c: "#9fd0ff" },
      { t: "★ MUNDO EXTRA COMPLETADO ★", x: "Has terminado el Mundo Extra. Tuyas por cruzar al otro lado: el Espejo, la Aleatoria, la Plomada y el Eco.", c: "#ffd24a" },
    ],
  };
  let storyCards = [], storyIdx = 0, storyThen = null;
  function showStory(cards, then) { storyCards = cards; storyIdx = 0; storyThen = then || (() => setState("map")); setState("story"); }
  function updateStory(dt, edge) {
    if (edge && (tapped("confirm") || tapped("jump") || mClicked)) {
      AUDIO.sfx("select"); storyIdx++;
      if (storyIdx >= storyCards.length) { const t = storyThen; storyThen = null; t(); }
    }
  }
  function drawStory() {
    theaterBg("#2a1e3a"); floatingNotes(6, "#b8a0d8"); vignetteAndGrain();
    const card = storyCards[Math.min(storyIdx, storyCards.length - 1)] || { t: "", x: "", c: "#fff" };
    const k = clamp(stateT / 0.4, 0, 1);
    ctx.save(); ctx.globalAlpha = k;
    // marco con esquineras
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 24; ctx.shadowOffsetY = 8;
    ctx.fillStyle = "rgba(12,8,16,0.82)"; roundRect(170, 180, W - 340, 320, 18); ctx.fill(); ctx.restore();
    ctx.strokeStyle = card.c; ctx.lineWidth = 4; roundRect(170, 180, W - 340, 320, 18); ctx.stroke();
    ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1.5; roundRect(180, 190, W - 360, 300, 14); ctx.stroke();
    ctx.fillStyle = card.c; for (const c of [[192, 202], [W - 192, 202], [192, 478], [W - 192, 478]]) { star(c[0], c[1], 6, 5); ctx.fill(); }
    bigText(card.t, W / 2, 270, 48, card.c);
    ctx.fillStyle = "#f3e7cf"; ctx.font = "22px Trebuchet MS"; ctx.textAlign = "center";
    wrapC(card.x, W / 2, 330, W - 460, 32);
    ctx.globalAlpha = 0.6 + Math.sin(time * 4) * 0.4;
    bigText("▶ continuar  (Z / Ⓐ / clic)", W / 2, 470, 18, "#caa");
    ctx.restore();
    // contador de cartelas
    ctx.globalAlpha = 1; ctx.textAlign = "center"; ctx.fillStyle = "#8a7a9a"; ctx.font = "13px Trebuchet MS";
    ctx.fillText((Math.min(storyIdx, storyCards.length - 1) + 1) + " / " + storyCards.length, W / 2, 492);
  }

  /* ============================================================
     PERSONAJES (gente de tinta) — cuentan la historia y los jefes
     ============================================================ */
  const NPCS = {
    1: [
      { x: 330, y: 215, name: "Abuela Sol", col: "#ffce6a", kind: "granny", lines: [
        "Bienvenida, tacita. Soy la farolera de la Isla Ragtime; enciendo el jazz cada amanecer.",
        "El COLECCIONISTA te engañó con su contrato, ¿verdad? A muchos nos pasó. Rómpelo antes del alba.",
        "El General Esporo es puro humo y esporas: salta sus bombas. Y el Capitán Salmuera... cuidado con sus surtidores.",
      ] },
      { x: 980, y: 210, name: "Renacuajo", col: "#7af0c0", kind: "tadpole", lines: [
        "¡Eh, eh! ¿Vas a pelear con TODOS los jefes? ¡Qué valiente!",
        "Don Tornillo es un autómata de cuerda: se acelera cuando le bajas la vida. ¡No te confíes!",
      ] },
    ],
    2: [
      { x: 760, y: 560, name: "Capitán Brisa", col: "#9fd0ff", kind: "sailor", lines: [
        "Marinero del aire retirado, a tu servicio. Estos cielos eran libres antes del CASINO ETERNO.",
        "El Crupier apuesta tu alma en cada mano. El Capitán Cúmulo pelea volando; la Condesa Escarcha te congela: no te quedes quieto.",
      ] },
    ],
    3: [
      { x: 300, y: 235, name: "La Acomodadora", col: "#c08aff", kind: "usher", lines: [
        "Chsss... la función va a empezar. EL DIRECTOR lo observa todo desde las sombras.",
        "El Titiritero te ata con hilos y alza un escudo: parry su núcleo rosa. La Quimera tiene tres cabezas y tres ataques.",
      ] },
    ],
    4: [
      { x: 230, y: 300, name: "Eco de Tinta", col: "#bfa8e0", kind: "wisp", lines: [
        "Has llegado al VACÍO DE TINTA, donde el Autor guarda todo lo que dibujó.",
        "El Centinela es su ojo guardián; la Pluma Errante, su mano que vuela. Pero aquí hay algo más viejo que ellos...",
      ] },
      { x: 770, y: 560, name: "El Borrón Parlante", col: "#ff9ec8", secret: true, kind: "blot", lines: [
        "psst... ¿tú también lo oyes? Hay un boceto que el Autor BORRÓ antes de empezar la historia.",
        "Sus restos laten en cinco manchas, ahí, en fila. Casi nadie las ve. Tú sí, ahora.",
        "Para despertarlo, písalas como el Autor confesó su culpa: primero el CORAZÓN del medio.",
        "Luego tiende las manos a sus dos EXTREMOS: el de tu IZQUIERDA y después el de tu DERECHA.",
        "Y arrepiéntete de las que falten, volviendo de DERECHA a IZQUIERDA. Entonces verás a EL DESCARTE.",
      ] },
    ],
  };
  function worldNpcs() { return NPCS[save.world] || []; }
  function nearestNpc() { let best = null, bd = 66; for (const c of worldNpcs()) { const d = Math.hypot(c.x - avatar.x, c.y - (avatar.y + 30)); if (d < bd) { bd = d; best = c; } } return best; }
  let talkNpc = null, talkLine = 0;
  function openTalk(npc) {
    talkNpc = npc; talkLine = 0; AUDIO.sfx("select"); setState("talk");
    if (npc.secret && !save.secretHinted) { save.secretHinted = true; persist(); } // un personaje REVELA las manchas
  }
  function updateTalk(dt, edge) {
    if (!edge) return;
    if (tapped("back") || tapped("pause")) { talkNpc = null; setState("map"); return; }
    if (tapped("confirm") || tapped("jump") || mClicked) {
      talkLine++; AUDIO.sfx("select");
      if (!talkNpc || talkLine >= talkNpc.lines.length) { talkNpc = null; setState("map"); }
    }
  }
  // dibuja un personaje de tinta con diseño propio según su "kind" (origen en 0,0)
  function drawNpcBody(kind, col, t) {
    ctx.lineJoin = "round"; ctx.lineCap = "round"; const ink = "#1a120a";
    if (kind === "tadpole") {
      ctx.strokeStyle = col; ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(9, 6); ctx.quadraticCurveTo(22 + Math.sin(t * 8) * 4, 11, 16, 19); ctx.stroke();
      ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(0, 0, 15, 0, TAU); ctx.fill(); ctx.stroke();
      pieEye(-5, -3, 5); pieEye(6, -3, 5); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 5, 5, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke(); return;
    }
    if (kind === "wisp") {
      ctx.globalAlpha = 0.86; ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-13, 4); ctx.quadraticCurveTo(-15, -20, 0, -20); ctx.quadraticCurveTo(15, -20, 13, 4);
      for (let i = 0; i < 4; i++) { const xx = 13 - i * 8.6; ctx.quadraticCurveTo(xx - 2.2, 4 + (i % 2 ? 8 : 14) + Math.sin(t * 6 + i) * 2, xx - 4.3, 4); }
      ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.globalAlpha = 1; pieEye(-5, -8, 5); pieEye(5, -8, 5); return;
    }
    if (kind === "blot") {
      ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = 3; ctx.beginPath();
      for (let i = 0; i <= 12; i++) { const a = i / 12 * TAU, rr = 15 + Math.sin(a * 3 + t) * 4 + (a > Math.PI ? 4 : 0), px = Math.cos(a) * rr, py = Math.sin(a) * rr; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(-6, 16, 3, 0, TAU); ctx.arc(7, 18, 2.4, 0, TAU); ctx.fill();
      pieEye(-5, -4, 5); pieEye(6, -4, 5); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 4, 6, 0.05 * Math.PI, 0.95 * Math.PI); ctx.stroke(); return;
    }
    const tall = kind === "usher";
    ctx.fillStyle = col; ctx.strokeStyle = ink; ctx.lineWidth = 3.5; roundRect(-13, tall ? -20 : -14, 26, tall ? 38 : 32, 11); ctx.fill(); ctx.stroke();
    pieEye(-5, tall ? -8 : -4, 4.5); pieEye(5, tall ? -8 : -4, 4.5);
    if (kind === "granny") {
      // chal sobre los hombros
      ctx.fillStyle = "#8a5a7a"; ctx.beginPath(); ctx.moveTo(-14, -8); ctx.quadraticCurveTo(0, -2, 14, -8); ctx.lineTo(12, 2); ctx.quadraticCurveTo(0, 7, -12, 2); ctx.closePath(); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#cfa86a"; ctx.beginPath(); ctx.arc(0, -16, 7, 0, TAU); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-5, -4, 4, 0, TAU); ctx.arc(5, -4, 4, 0, TAU); ctx.moveTo(-1, -4); ctx.lineTo(1, -4); ctx.stroke();
      // farol colgando de un bastón, que se mece
      const sw2 = Math.sin(t * 1.8) * 0.14;
      ctx.save(); ctx.translate(15, -12); ctx.rotate(sw2);
      ctx.strokeStyle = "#5a3a1c"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 14); ctx.stroke();
      const lgl = 0.34 + Math.sin(t * 4) * 0.14;
      ctx.fillStyle = `rgba(255,220,120,${lgl})`; ctx.beginPath(); ctx.arc(0, 19, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = "#ffd24a"; roundRect(-4.5, 14, 9, 10, 2.5); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2; ctx.stroke();
      ctx.restore();
    } else if (kind === "sailor") {
      ctx.fillStyle = "#26324a"; roundRect(-13, -22, 26, 9, 3); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#26324a"; ctx.beginPath(); ctx.ellipse(0, -13, 15, 4, 0, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#ffd24a"; ctx.beginPath(); ctx.arc(0, -18, 2.5, 0, TAU); ctx.fill();
      // barba de espuma + pipa con humo
      ctx.fillStyle = "#e8e4da"; ctx.beginPath(); ctx.moveTo(-8, 3); ctx.quadraticCurveTo(0, 12 + Math.sin(t * 2) * 1, 8, 3); ctx.quadraticCurveTo(4, 6, 0, 5); ctx.quadraticCurveTo(-4, 6, -8, 3); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.8; ctx.stroke();
      ctx.strokeStyle = "#5a3a1c"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(6, 4); ctx.lineTo(13, 7); ctx.stroke();
      ctx.fillStyle = "#7a4a26"; ctx.beginPath(); ctx.arc(14, 8, 3.2, 0, TAU); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 1.6; ctx.stroke();
      for (let s2 = 0; s2 < 2; s2++) { const st2 = (t * 0.6 + s2 * 0.5) % 1; ctx.fillStyle = `rgba(235,230,220,${0.4 * (1 - st2)})`; ctx.beginPath(); ctx.arc(14 + Math.sin(t * 3 + s2 * 2) * 2, 3 - st2 * 14, 2 + st2 * 3, 0, TAU); ctx.fill(); }
    } else if (kind === "usher") {
      ctx.fillStyle = "#7a1420"; roundRect(-9, -27, 18, 8, 3); ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#ffd24a"; ctx.fillRect(-9, -20, 18, 2);
      // linterna de acomodadora con haz parpadeante
      const fk = 0.2 + Math.abs(Math.sin(t * 0.9)) * 0.14;
      ctx.fillStyle = `rgba(255,250,200,${fk})`; ctx.beginPath(); ctx.moveTo(21, 2); ctx.lineTo(42, -6 + Math.sin(t * 1.4) * 3); ctx.lineTo(42, 12); ctx.lineTo(21, 8); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#cfd2e0"; ctx.fillRect(14, 2, 7, 6); ctx.strokeStyle = ink; ctx.lineWidth = 1.5; ctx.strokeRect(14, 2, 7, 6);
    }
  }
  function drawNpc(npc, near) {
    const x = npc.x, y = npc.y, bob = Math.sin(time * 3 + x) * 3;
    ctx.save(); ctx.translate(x, y - bob); ctx.lineJoin = "round";
    ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, 20, 15, 4, 0, 0, TAU); ctx.fill();
    drawNpcBody(npc.kind, npc.col, time);
    ctx.restore();
    if (near) { ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.font = "bold 20px Georgia"; ctx.textAlign = "center"; const by = y - 34 + Math.sin(time * 6) * 2; ctx.strokeText("💬", x, by); ctx.fillText("💬", x, by); }
    ctx.fillStyle = "#f3e7cf"; ctx.font = "bold 11px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText(npc.name, x, y + 34);
  }
  function drawTalk() {
    drawMap();
    ctx.fillStyle = "rgba(8,6,14,0.45)"; ctx.fillRect(0, 0, W, H);
    const npc = talkNpc; if (!npc) return;
    const line = npc.lines[Math.min(talkLine, npc.lines.length - 1)] || "";
    const bx = 120, by = H - 190, bw = W - 240, bh = 132;
    decoPanel(bx, by, bw, bh, npc.col);
    ctx.save(); ctx.translate(bx + 58, by + 70); ctx.scale(1.8, 1.8); ctx.lineJoin = "round"; drawNpcBody(npc.kind, npc.col, time); ctx.restore();
    bigText(npc.name, bx + 124, by + 36, 22, npc.col);
    ctx.fillStyle = "#f3e7cf"; ctx.font = "18px Trebuchet MS"; wrapL(line, bx + 124, by + 70, bw - 170, 26);
    ctx.globalAlpha = 0.6 + Math.sin(time * 4) * 0.4; ctx.textAlign = "right"; ctx.fillStyle = "#caa"; ctx.font = "13px Trebuchet MS";
    ctx.fillText((talkLine + 1) + "/" + npc.lines.length + "   ▶ Z/Ⓐ", bx + bw - 18, by + bh - 14); ctx.globalAlpha = 1;
  }
  function wrapL(text, x, y, maxw, lh) { ctx.textAlign = "left"; const words = text.split(" "); let ln = "", yy = y; for (const w of words) { const t = ln + w + " "; if (ctx.measureText(t).width > maxw && ln) { ctx.fillText(ln.trim(), x, yy); ln = w + " "; yy += lh; } else ln = t; } ctx.fillText(ln.trim(), x, yy); }

  /* ============================================================
     LOGROS — derivados del progreso, agregados de las 3 ranuras
     ============================================================ */
  const worldBossIds = w => BOSSES.filter(b => b.world === w).map(b => b.id);
  const ACHIEVEMENTS = [
    { id: "first", icon: "🎬", name: "Primer telón", desc: "Vence a tu primer jefe.", check: s => (s.defeated || []).length >= 1 },
    { id: "w1", icon: "🌳", name: "Isla a salvo", desc: "Vence a los 6 jefes del Mundo 1.", check: s => worldBossIds(1).every(id => (s.defeated || []).includes(id)) },
    { id: "w2", icon: "☁️", name: "Cielos despejados", desc: "Completa el Mundo 2.", check: s => worldBossIds(2).every(id => (s.defeated || []).includes(id)) },
    { id: "w3", icon: "🎭", name: "Función terminada", desc: "Completa el Mundo 3.", check: s => worldBossIds(3).every(id => (s.defeated || []).includes(id)) },
    { id: "w4", icon: "🖋️", name: "Vacío conquistado", desc: "Completa el Mundo 4.", check: s => worldBossIds(4).every(id => (s.defeated || []).includes(id)) },
    { id: "finish", icon: "🏁", name: "Fin de la función", desc: "Vence a El Autor y libera la isla.", check: s => !!s.finished },
    { id: "expert1", icon: "🔥", name: "Virtuoso", desc: "Vence a un jefe en dificultad Experto.", check: s => (s.beatenExpert || []).length >= 1 },
    { id: "expertAll", icon: "🎩", name: "Maestro del jazz", desc: "Vence a los 15 jefes en Experto.", check: s => BOSSES.filter(b => b.world <= 4).every(b => (s.beatenExpert || []).includes(b.id)) },
    { id: "rankS", icon: "⭐", name: "Calificación perfecta", desc: "Consigue una S en cualquier jefe.", check: s => Object.values(s.grades || {}).includes("S") },
    { id: "weapons", icon: "🔫", name: "Arsenal completo", desc: "Compra las 10 armas.", check: s => Object.keys(WEAPONS).filter(k => !WEAPONS[k].world5 && !WEAPONS[k].bonus).every(k => (s.ownedW || []).includes(k)) },
    { id: "charms", icon: "🧿", name: "Coleccionista", desc: "Compra los 10 amuletos.", check: s => Object.keys(CHARMS).filter(k => !CHARMS[k].world5 && !CHARMS[k].bonus).every(k => (s.ownedC || []).includes(k)) },
    { id: "rng", icon: "🏃", name: "Corredor incansable", desc: "Completa los 9 run-n-gun.", check: s => RNG_LEVELS.every(L => (s.rngDone || {})[L.id]) },
    { id: "secret", icon: "🩹", name: "Lo que el Autor borró", desc: "Encuentra y vence al jefe secreto.", check: s => !!s.secretDefeated },
    { id: "full", icon: "💯", name: "Doscientos por cien", desc: "Alcanza el 200% de completado.", check: s => slotProgress(s) >= 200 },
    { id: "parries", icon: "🎐", name: "Manos de seda", desc: "Haz 100 parrys en total.", check: s => (s.stats && s.stats.parries || 0) >= 100 },
    { id: "coins", icon: "💰", name: "Bolsillos llenos", desc: "Recoge 30 monedas de los run-n-gun.", check: s => Object.keys(s.collectedCoins || {}).length >= 30 },
    { id: "rushdone", icon: "🏃", name: "Maratoniano", desc: "Completa el Boss Rush al menos una vez.", check: () => Object.keys(rushBest()).length > 0 },
    { id: "speed", icon: "⏱️", name: "Velocista", desc: "Vence a un jefe en menos de 20 s.", check: s => Object.values(s.bossBest || {}).some(t => t > 0 && t < 20) },
    { id: "allS", icon: "🏅", name: "Leyenda del ragtime", desc: "Consigue nota S en TODOS los jefes.", check: s => BOSSES.every(b => (s.grades || {})[b.id] === "S") },
    { id: "veteran", icon: "🎖️", name: "Veterano", desc: "Vence a 30 jefes en total (cuentan repetidos).", check: s => (s.stats && s.stats.kills || 0) >= 30 },
    // --- Mundo Extra: El Reverso de Tinta ---
    { id: "cross", icon: "🪞", name: "Cruzar el espejo", desc: "Entra en el Reverso de Tinta.", check: s => !!(s.seenWorld && s.seenWorld[5]) },
    { id: "twinDown", icon: "👯", name: "Cara a cara", desc: "Vence a La Gemela, tu propio reflejo.", check: s => (s.defeated || []).includes("twin") },
    { id: "reverseDone", icon: "🔄", name: "El otro lado", desc: "Completa el Reverso (vence a La Mano Zurda).", check: s => !!s.reverseDone },
    { id: "lefthandX", icon: "✋", name: "Zurdo de verdad", desc: "Vence a La Mano Zurda en Experto.", check: s => (s.beatenExpert || []).includes("lefthand") },
    { id: "revGear", icon: "🎁", name: "Botín del Reverso", desc: "Consigue las 4 piezas exclusivas del Mundo Extra.", check: s => ["mirror", "random"].every(w => (s.ownedW || []).includes(w)) && ["ballast", "echo"].every(c => (s.ownedC || []).includes(c)) },
    { id: "requiem", icon: "🎼", name: "La Última Nota", desc: "Descifra el código del Mausoleo y vence a RÉQUIEM.", check: s => !!s.requiemDefeated },
  ];
  function achUnlocked(a) { for (let i = 0; i < NSLOTS; i++) { const s = rawSlot(i); if (s && a.check(s)) return true; } return false; }
  function achRects() { return ACHIEVEMENTS.map((a, i) => ({ a, x: 112 + (i % 2) * 532, y: 122 + ((i / 2) | 0) * 43, w: 508, h: 39 })); }
  function updateAchievements(dt, edge) { if (edge && (tapped("confirm") || tapped("back") || tapped("pause") || mClicked)) { AUDIO.sfx("select"); setState("title"); } }
  function drawAchievements() {
    theaterBg("#2a2440"); vignetteAndGrain();
    const got = ACHIEVEMENTS.filter(achUnlocked).length;
    bigText("LOGROS", W / 2, 66, 42, "#ffd24a");
    // barra de progreso general
    const pw = 380, px0 = W / 2 - pw / 2;
    ctx.fillStyle = "#141020"; roundRect(px0, 82, pw, 12, 6); ctx.fill();
    const pg = ctx.createLinearGradient(px0, 0, px0 + pw, 0); pg.addColorStop(0, "#c8a040"); pg.addColorStop(1, "#7af0a0");
    ctx.fillStyle = pg; roundRect(px0, 82, Math.max(8, pw * got / ACHIEVEMENTS.length), 12, 6); ctx.fill();
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; roundRect(px0, 82, pw, 12, 6); ctx.stroke();
    bigText(got + " / " + ACHIEVEMENTS.length, W / 2, 111, 15, got === ACHIEVEMENTS.length ? "#7af0a0" : "#caa");
    for (const r of achRects()) {
      const un = achUnlocked(r.a);
      const ug = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (un) { ug.addColorStop(0, "rgba(56,44,80,0.95)"); ug.addColorStop(1, "rgba(36,27,54,0.95)"); } else { ug.addColorStop(0, "rgba(18,13,22,0.82)"); ug.addColorStop(1, "rgba(12,9,16,0.82)"); }
      ctx.fillStyle = ug; roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
      ctx.strokeStyle = un ? "#ffd24a" : "#3a3346"; ctx.lineWidth = un ? 2.5 : 2; ctx.stroke();
      // medallón del icono
      ctx.fillStyle = un ? "#5a4a1e" : "#241e2c"; ctx.beginPath(); ctx.arc(r.x + 30, r.y + r.h / 2, 15, 0, TAU); ctx.fill();
      ctx.strokeStyle = un ? "#ffd24a" : "#3a3346"; ctx.lineWidth = 2; ctx.stroke();
      ctx.globalAlpha = un ? 1 : 0.4; ctx.font = "18px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText(un ? r.a.icon : "🔒", r.x + 30, r.y + r.h / 2 + 1); ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = un ? "#ffd24a" : "#8a7f95"; ctx.font = "bold 15px Trebuchet MS"; ctx.fillText(r.a.name, r.x + 58, r.y + 17);
      ctx.fillStyle = un ? "#f3e7cf" : "#6a6276"; ctx.font = "11px Trebuchet MS"; ctx.fillText(r.a.desc, r.x + 58, r.y + 31);
      if (un) {
        ctx.fillStyle = "#7af0a0"; ctx.font = "bold 18px Trebuchet MS"; ctx.textAlign = "right"; ctx.fillText("✓", r.x + r.w - 16, r.y + r.h / 2 + 6);
        // destello que recorre la placa de vez en cuando
        const sk = ((time * 0.35 + r.y * 0.01) % 1);
        if (sk < 0.18) { ctx.save(); ctx.beginPath(); roundRect(r.x, r.y, r.w, r.h, 10); ctx.clip(); ctx.fillStyle = "rgba(255,240,200,0.10)"; const sx3 = r.x + (sk / 0.18) * r.w; ctx.beginPath(); ctx.moveTo(sx3 - 20, r.y); ctx.lineTo(sx3 + 6, r.y); ctx.lineTo(sx3 - 14, r.y + r.h); ctx.lineTo(sx3 - 40, r.y + r.h); ctx.fill(); ctx.restore(); }
      }
      ctx.globalAlpha = 1;
    }
    bigText("Z/Ⓐ o Esc/Ⓑ — volver", W / 2, H - 22, 16, "#caa");
  }
  // avisos emergentes "¡Logro desbloqueado!"
  let achToasts = [];
  function checkAch(silent) {
    if (!save.achAwarded) save.achAwarded = [];
    let changed = false;
    for (const a of ACHIEVEMENTS) {
      if (a.check(save) && !save.achAwarded.includes(a.id)) {
        save.achAwarded.push(a.id); changed = true;
        if (!silent) { achToasts.push({ icon: a.icon, name: a.name, t: 3.6 }); if (AUDIO.sting) AUDIO.sting("phase"); }
      }
    }
    if (changed) persist();
  }
  function updateToasts(dt) { for (const t of achToasts) t.t -= dt; achToasts = achToasts.filter(t => t.t > 0); }
  function drawToasts() {
    for (let i = 0; i < achToasts.length; i++) {
      const t = achToasts[i], k = clamp(Math.min((3.6 - t.t) / 0.25, t.t / 0.4), 0, 1), wbox = 322;
      const x = W - 16 - wbox * k, y = 86 + i * 60;
      ctx.save(); ctx.globalAlpha = k;
      decoPanel(x, y, wbox, 50, "#ffd24a");
      ctx.font = "26px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillStyle = "#fff"; ctx.fillText(t.icon, x + 30, y + 26); ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left"; ctx.fillStyle = "#ffd24a"; ctx.font = "bold 11px Trebuchet MS"; ctx.fillText("¡LOGRO DESBLOQUEADO!", x + 56, y + 20);
      ctx.fillStyle = "#f3e7cf"; ctx.font = "bold 15px Trebuchet MS"; ctx.fillText(t.name, x + 56, y + 39);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }

  /* ============================================================
     OPCIONES (volumen, sacudida)
     ============================================================ */
  let optFrom = "title";
  function openOptions(from) { optFrom = from; focus = 0; AUDIO.sfx("select"); setState("options"); }
  const OPT_ROWS = 5;
  function adjustOpt(i, d) {
    if (i === 4) { AUDIO.sfx("confirm"); setState("keys"); return; }
    if (i === 0) OPT.music = clamp(Math.round((OPT.music + d * 0.1) * 10) / 10, 0, 1);
    else if (i === 1) OPT.sfx = clamp(Math.round((OPT.sfx + d * 0.1) * 10) / 10, 0, 1);
    else if (i === 2) OPT.shake = !OPT.shake;
    else if (i === 3) { OPT.coop = !OPT.coop; coop = OPT.coop; }
    applyOpts(); saveOpts(); AUDIO.sfx("select");
  }
  function updateOptions(dt, edge) {
    if (!edge) return;
    if (tapped("navD")) { focus = (focus + 1) % OPT_ROWS; AUDIO.sfx("select"); }
    if (tapped("navU")) { focus = (focus + OPT_ROWS - 1) % OPT_ROWS; AUDIO.sfx("select"); }
    const d = (tapped("navR") ? 1 : 0) - (tapped("navL") ? 1 : 0);
    if (d) adjustOpt(focus, d);
    for (let i = 0; i < OPT_ROWS; i++) {
      const ry = 214 + i * 66;
      if (pointIn(mouse, { x: W / 2 - 250, y: ry - 6, w: 500, h: 50 })) focus = i;
      if (i === 4) { if (mClicked && pointIn(mouse, { x: W / 2 - 250, y: ry - 6, w: 500, h: 50 })) adjustOpt(4); continue; }
      if (mClicked && pointIn(mouse, { x: W / 2 - 70, y: ry, w: 44, h: 40 })) adjustOpt(i, -1);
      if (mClicked && pointIn(mouse, { x: W / 2 + 226, y: ry, w: 44, h: 40 })) adjustOpt(i, 1);
    }
    if (tapped("confirm") && focus === 4) { adjustOpt(4); return; }
    if (tapped("confirm") || tapped("back") || tapped("pause") || (mClicked && pointIn(mouse, { x: W / 2 - 110, y: H - 62, w: 220, h: 42 }))) { saveOpts(); AUDIO.sfx("select"); setState(optFrom); }
  }
  function drawOptions() {
    theaterBg("#241f33"); floatingNotes(5); vignetteAndGrain();
    decoPanel(W / 2 - 330, 66, 660, 76);
    bigText("OPCIONES", W / 2, 118, 42, "#ffd24a");
    const rows = [
      ["♫  Música", Math.round(OPT.music * 100) + "%", OPT.music, true],
      ["🔊  Efectos", Math.round(OPT.sfx * 100) + "%", OPT.sfx, true],
      ["📳  Sacudida de pantalla", OPT.shake ? "Sí" : "No", OPT.shake ? 1 : 0, false],
      ["👥  2 jugadores (co-op)", OPT.coop ? "Sí" : "No", OPT.coop ? 1 : 0, false],
      ["🎛  Configurar botones", "abrir  ▶", 0, false, true],
    ];
    rows.forEach((r, i) => {
      const ry = 214 + i * 66, sel = focus === i;
      // fila-placa
      ctx.fillStyle = sel ? "rgba(255,210,74,0.13)" : "rgba(12,8,18,0.45)"; roundRect(W / 2 - 250, ry - 6, 500, 50, 10); ctx.fill();
      ctx.strokeStyle = sel ? "#ffd24a" : "rgba(255,255,255,0.09)"; ctx.lineWidth = sel ? 2.5 : 1.5; roundRect(W / 2 - 250, ry - 6, 500, 50, 10); ctx.stroke();
      if (sel) { const ak = Math.sin(time * 6) * 3; bigText("▶", W / 2 - 272 + ak, ry + 28, 20, "#ffd24a"); }
      bigText(r[0], W / 2 - 130, ry + 26, 19, sel ? "#ffd24a" : "#f3e7cf");
      if (r[4]) { bigText(r[1], W / 2 + 132, ry + 28, 20, sel ? "#ffd24a" : "#7af0c0"); return; }
      bigText("◀", W / 2 - 48, ry + 30, 26, sel ? "#ffd24a" : "#caa"); bigText("▶", W / 2 + 248, ry + 30, 26, sel ? "#ffd24a" : "#caa");
      if (r[3]) {
        // deslizador con muescas y tirador de rombo
        const bw = 240, bx = W / 2 + 8;
        ctx.fillStyle = "#141020"; roundRect(bx, ry + 14, bw, 12, 6); ctx.fill();
        const sg = ctx.createLinearGradient(bx, 0, bx + bw, 0); sg.addColorStop(0, "#7a5a18"); sg.addColorStop(1, sel ? "#ffd24a" : "#c8a040");
        ctx.fillStyle = sg; roundRect(bx, ry + 14, Math.max(8, bw * r[2]), 12, 6); ctx.fill();
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; roundRect(bx, ry + 14, bw, 12, 6); ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.25)"; for (let k = 1; k < 10; k++) ctx.fillRect(bx + k * bw / 10, ry + 16, 1.5, 8);
        const kx = bx + bw * r[2];
        ctx.save(); ctx.translate(kx, ry + 20); ctx.rotate(Math.PI / 4);
        ctx.fillStyle = sel ? "#ffe9a0" : "#e8cf90"; ctx.fillRect(-8, -8, 16, 16); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.strokeRect(-8, -8, 16, 16); ctx.restore();
        bigText(r[1], W / 2 + 292, ry + 27, 15, "#fff");
      } else {
        // interruptor de palanca
        const sw = 64, sx2 = W / 2 + 96, on = !!r[2];
        ctx.fillStyle = on ? "#2e6a44" : "#5a2430"; roundRect(sx2, ry + 8, sw, 26, 13); ctx.fill();
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; roundRect(sx2, ry + 8, sw, 26, 13); ctx.stroke();
        const knobX = sx2 + (on ? sw - 14 : 14);
        ctx.fillStyle = "#f3e7cf"; ctx.beginPath(); ctx.arc(knobX, ry + 21, 11, 0, TAU); ctx.fill(); ctx.stroke();
        bigText(r[1], sx2 + sw + 42, ry + 28, 19, on ? "#7af0a0" : "#ff8a7a");
      }
    });
    bigText("Con mando: el mando es J1 y el teclado (Z/X/C…) pasa a ser J2", W / 2, 214 + 5 * 66 - 6, 13, "#9fd0ff");
    drawButtonRect({ x: W / 2 - 110, y: H - 62, w: 220, h: 42 }, "Volver", true);
    bigText("▲▼ elegir   ·   ◀▶ ajustar   ·   Z/Ⓐ/Esc volver", W / 2, H - 20, 14, "#caa");
  }
  /* ---- configurar botones (teclado J1 + mando) ---- */
  const KEYS_RESET = { x: W / 2 - 224, y: 588, w: 210, h: 44 }, KEYS_BACK = { x: W / 2 + 14, y: 588, w: 210, h: 44 };
  function keyRow(i) { return { x: W / 2 - 300, y: 178 + i * 58, w: 600, h: 48 }; }
  function startCapture(a, dev) { capture = { action: a, dev }; padCaptureArmed = false; AUDIO.sfx("select"); }
  function updateKeys(dt, edge) {
    if (capture && capture.dev === "pad") {   // captura de botón de mando
      const gp = (navigator.getGamepads ? navigator.getGamepads() : [])[0];
      if (gp && gp.buttons) {
        const idx = gp.buttons.findIndex(b => b && (b.pressed || b.value > 0.5));
        if (idx < 0) padCaptureArmed = true;
        else if (padCaptureArmed) { OPT.pad = OPT.pad || {}; OPT.pad[capture.action] = idx; applyBindings(); saveOpts(); AUDIO.sfx("confirm"); capture = null; }
      }
      if (edge && tapped("pause")) capture = null;
      return;
    }
    if (capture) { if (edge && tapped("pause")) capture = null; return; }   // capturando teclado (lo resuelve el listener)
    if (edge) {
      if (tapped("navD")) { keysFocus = (keysFocus + 1) % REBIND.length; AUDIO.sfx("select"); }
      if (tapped("navU")) { keysFocus = (keysFocus - 1 + REBIND.length) % REBIND.length; AUDIO.sfx("select"); }
      if (tapped("confirm")) startCapture(REBIND[keysFocus], "kb");
      else if (tapped("dash")) startCapture(REBIND[keysFocus], "pad");
      else if (tapped("back") || tapped("pause")) { AUDIO.sfx("select"); setState("options"); return; }
    }
    for (let i = 0; i < REBIND.length; i++) {
      const r = keyRow(i);
      if (pointIn(mouse, r)) keysFocus = i;
      if (mClicked && pointIn(mouse, { x: r.x + 250, y: r.y, w: 160, h: r.h })) startCapture(REBIND[i], "kb");
      if (mClicked && pointIn(mouse, { x: r.x + 428, y: r.y, w: 172, h: r.h })) startCapture(REBIND[i], "pad");
    }
    if (mClicked && pointIn(mouse, KEYS_RESET)) { OPT.keys = {}; OPT.pad = {}; applyBindings(); saveOpts(); AUDIO.sfx("confirm"); }
    if (mClicked && pointIn(mouse, KEYS_BACK)) { AUDIO.sfx("select"); setState("options"); }
  }
  function drawKeys() {
    theaterBg("#241f33"); vignetteAndGrain();
    decoPanel(W / 2 - 360, 40, 720, 92);
    bigText("CONFIGURAR BOTONES", W / 2, 86, 36, "#ffd24a");
    bigText("Clic en una celda (o Intro=teclado · C/Ⓑ=mando) y pulsa la nueva entrada", W / 2, 116, 14, "#caa");
    ctx.textAlign = "left"; ctx.fillStyle = "#9fd0ff"; ctx.font = "bold 14px Trebuchet MS";
    ctx.fillText("ACCIÓN", W / 2 - 292, 162); ctx.textAlign = "center"; ctx.fillText("⌨ TECLADO", W / 2 - 20, 162); ctx.fillText("🎮 MANDO", W / 2 + 214, 162);
    for (let i = 0; i < REBIND.length; i++) {
      const a = REBIND[i], r = keyRow(i), sel = keysFocus === i;
      ctx.fillStyle = sel ? "rgba(255,210,74,0.10)" : (i % 2 ? "rgba(12,8,18,0.4)" : "rgba(20,14,30,0.4)"); roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
      ctx.strokeStyle = sel ? "#ffd24a" : "#3a3346"; ctx.lineWidth = sel ? 3 : 1.5; roundRect(r.x, r.y, r.w, r.h, 10); ctx.stroke();
      if (sel) { const ak = Math.sin(time * 6) * 3; bigText("▶", r.x - 18 + ak, r.y + 32, 18, "#ffd24a"); }
      ctx.textAlign = "left"; ctx.fillStyle = sel ? "#ffd24a" : "#f3e7cf"; ctx.font = "bold 16px Trebuchet MS"; ctx.fillText(REBIND_NAME[a], r.x + 18, r.y + 30);
      const kbCap = capture && capture.action === a && capture.dev === "kb", pdCap = capture && capture.action === a && capture.dev === "pad";
      const kx = r.x + 250, px = r.x + 428;
      // celdas de latón (como el teclado del Mausoleo)
      for (const cell of [[kx, 150, kbCap, keyLabel(KEYMAP[a] && KEYMAP[a][0])], [px, 162, pdCap, padLabel(padMap[a])]]) {
        const kg = ctx.createLinearGradient(0, r.y + 8, 0, r.y + 40);
        if (cell[2]) { kg.addColorStop(0, "#ffe9a0"); kg.addColorStop(1, "#e0b64e"); } else { kg.addColorStop(0, "#2a2138"); kg.addColorStop(1, "#171020"); }
        ctx.fillStyle = kg; roundRect(cell[0], r.y + 8, cell[1], 32, 7); ctx.fill();
        ctx.strokeStyle = cell[2] ? "#ffd24a" : "#4a4258"; ctx.lineWidth = cell[2] ? 2.5 : 1.5; roundRect(cell[0], r.y + 8, cell[1], 32, 7); ctx.stroke();
        bigText(cell[2] ? "…" : cell[3], cell[0] + cell[1] / 2, r.y + 30, 15, cell[2] ? "#1a120a" : "#fff");
      }
    }
    bigText("El movimiento sigue en WASD / flechas y la cruceta del mando", W / 2, 560, 13, "#9fd0ff");
    drawButtonRect(KEYS_RESET, "↺ Restablecer", false);
    drawButtonRect(KEYS_BACK, "◀ Volver", true);
    if (capture) { ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H); bigText(capture.dev === "kb" ? "Pulsa una tecla…" : "Pulsa un botón del mando…", W / 2, H / 2 - 6, 34, "#ffd24a"); bigText("(Esc para cancelar)", W / 2, H / 2 + 34, 16, "#caa"); }
  }

  /* ============================================================
     SÚPER ARTES (elige 1 de 3, se usa con 5 cartas)
     ============================================================ */
  const SUPER_ARTS = [
    { id: "beam", name: "Rayo Ragtime", icon: "⚡", col: "#9fd0ff", desc: "Un haz enorme que barre la pantalla. Gran daño." },
    { id: "aegis", name: "Égida de Tinta", icon: "🛡️", col: "#7af0ff", desc: "Invencible ~3 s y limpia todos los proyectiles. Defensiva." },
    { id: "whirl", name: "Torbellino", icon: "🌀", col: "#ffd24a", desc: "Golpe de área, limpia balas cercanas y cura 1 de vida." },
  ];
  function superRect(i) { return { x: 140 + i * 340, y: 230, w: 300, h: 260 }; }
  function pickSuper(i) { save.equipSuper = SUPER_ARTS[i].id; persist(); AUDIO.sfx("confirm"); }
  function updateSuperPick(dt, edge) {
    if (!edge) return;
    if (tapped("navR")) { focus = (focus + 1) % SUPER_ARTS.length; AUDIO.sfx("select"); }
    if (tapped("navL")) { focus = (focus - 1 + SUPER_ARTS.length) % SUPER_ARTS.length; AUDIO.sfx("select"); }
    for (let i = 0; i < SUPER_ARTS.length; i++) { if (pointIn(mouse, superRect(i))) { focus = i; if (mClicked) pickSuper(i); } }
    if (tapped("confirm")) pickSuper(focus);
    if (tapped("back") || tapped("pause")) { AUDIO.sfx("confirm"); AUDIO.music("shop"); setState("shop"); }
  }
  function drawSuperPick() {
    theaterBg("#1f2a3a"); vignetteAndGrain();
    bigText("SÚPER ARTES", W / 2, 108, 46, "#ffd24a");
    bigText("Elige la súper que usarás con 5 cartas (V/Ⓨ)", W / 2, 150, 18, "#caa");
    SUPER_ARTS.forEach((a, i) => {
      const r = superRect(i), sel = focus === i, eq = save.equipSuper === a.id;
      ctx.save(); if (sel) { ctx.shadowColor = a.col; ctx.shadowBlur = 24; }
      ctx.fillStyle = eq ? shade(a.col, 0.3) : "#241f2e"; roundRect(r.x, r.y, r.w, r.h, 14); ctx.fill();
      ctx.strokeStyle = sel ? a.col : (eq ? "#ffd24a" : "#1a120a"); ctx.lineWidth = sel ? 6 : 4; ctx.stroke(); ctx.shadowBlur = 0;
      bigText(a.icon, r.x + r.w / 2, r.y + 80, 56, "#fff");
      bigText(a.name, r.x + r.w / 2, r.y + 124, 23, a.col);
      ctx.fillStyle = "#f3e7cf"; ctx.font = "14px Trebuchet MS"; ctx.textAlign = "center"; wrapC(a.desc, r.x + r.w / 2, r.y + 158, r.w - 36, 20);
      if (eq) bigText("✓ EQUIPADA", r.x + r.w / 2, r.y + r.h - 18, 16, "#7af0a0");
      ctx.restore();
    });
    bigText("◀ ▶ elegir   ·   Z/Ⓐ equipar   ·   Esc/Ⓑ volver", W / 2, H - 34, 16, "#caa");
  }

  /* ============================================================
     MAUSOLEO (galería de jefes, con repetición) + RÉCORDS
     ============================================================ */
  const RECORDS_BTN = { x: W - 240, y: 26, w: 212, h: 40 };
  function galRect(i) { const col = i % 5, row = (i / 5) | 0; return { x: 110 + col * 212, y: 158 + row * 138, w: 196, h: 120 }; }
  function fmtTime(s) { s = Math.max(0, Math.round(s || 0)); const m = (s / 60) | 0; return m > 0 ? (m + "m " + (s % 60) + "s") : (s + "s"); }
  function galleryReplay(i) { if (unlocked(i)) { AUDIO.sfx("confirm"); pendingRush = false; pendingBoss = i; setState("diffselect"); } else AUDIO.sfx("deny"); }
  /* ---- panel de CÓDIGO del Mausoleo (53149900 despierta a RÉQUIEM) ---- */
  const CODE_BTN = { x: 28, y: 26, w: 212, h: 40 };
  const REQ_CODE = "53149900", BRASS_CODE = "67676767";
  let codeInput = "", codeWrong = 0;
  function codeRects() {
    const r = [], kw = 78, gap = 14, x0 = W / 2 - (kw * 3 + gap * 2) / 2, y0 = 268;
    for (let i = 1; i <= 9; i++) r.push({ d: String(i), x: x0 + ((i - 1) % 3) * (kw + gap), y: y0 + (((i - 1) / 3) | 0) * (kw + gap), w: kw, h: kw });
    r.push({ d: "del", x: x0, y: y0 + 3 * (kw + gap), w: kw, h: kw });
    r.push({ d: "0", x: x0 + kw + gap, y: y0 + 3 * (kw + gap), w: kw, h: kw });
    return r;
  }
  function codePress(d) {
    if (d === "del") { codeInput = codeInput.slice(0, -1); AUDIO.sfx("select"); return; }
    if (codeInput.length >= 8) return;
    codeInput += d; AUDIO.sfx("select");
    if (codeInput.length === 8) {
      if (codeInput === REQ_CODE) {
        save.requiemUnlocked = true; persist();
        AUDIO.sting && AUDIO.sting("phase"); flashScreen = 0.55; shake = 16;
        showStory(STORY.requiemIntro, startCodeBoss);
      } else if (codeInput === BRASS_CODE) {
        // 67676767: LA ORQUESTA — el arma prohibida, exageradamente rota
        codeInput = "";
        const had = save.ownedW.includes("brass");
        if (!had) { save.ownedW.push("brass"); if (!save.equipW[1]) save.equipW[1] = "brass"; }
        persist();
        AUDIO.sfx("buy"); AUDIO.sting && AUDIO.sting("phase"); flashScreen = 0.55; shake = 14;
        showStory([{
          t: "¡LA ORQUESTA!",
          x: had ? "La losa zumba un riff conocido: la big band ya toca para ti. (Si la soltaste, re-equípala en la tienda.)"
                 : "Las ocho cifras silban un riff prohibido y de la grieta sale UN ARMA EXAGERADA: toda la orquesta disparando a la vez. Queda equipada en tu segunda ranura. Úsala con vergüenza.",
          c: "#ffd24a",
        }], () => setState("gallery"));
      } else { AUDIO.sfx("deny"); codeWrong = 0.7; codeInput = ""; }
    }
  }
  function updateCode(dt, edge) {
    if (codeWrong > 0) codeWrong -= dt;
    while (codeKeys.length) {
      const k = codeKeys.shift();
      if (/^(Digit|Numpad)[0-9]$/.test(k)) codePress(k.slice(-1));
      else if (k === "Backspace") codePress("del");
      else if (k === "Escape") { AUDIO.sfx("select"); setState("gallery"); return; }
    }
    if (edge && (tapped("back") || tapped("pause"))) { AUDIO.sfx("select"); setState("gallery"); return; }
    for (const r of codeRects()) if (mClicked && pointIn(mouse, r)) codePress(r.d);
  }
  function drawCode() {
    theaterBg("#241828"); vignetteAndGrain();
    const shx = codeWrong > 0 ? Math.sin(time * 60) * 5 : 0;
    bigText("LA LÁPIDA SIN NOMBRE", W / 2, 76, 36, "#ffd24a");
    ctx.fillStyle = "#cbb"; ctx.font = "italic 15px Trebuchet MS"; ctx.textAlign = "center";
    ctx.fillText("Ocho cifras duermen grabadas en el mármol. La cuenta correcta despierta lo enterrado.", W / 2, 108);
    // velas que flanquean la losa
    for (const s of [-1, 1]) {
      const cx6 = W / 2 + s * 290, fl5 = 0.6 + Math.sin(time * 8 + s * 2) * 0.3;
      ctx.fillStyle = "#c8bc9c"; roundRect(cx6 - 7, 158, 14, 46, 3); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "rgba(200,188,156,0.7)"; ctx.beginPath(); ctx.ellipse(cx6 - 5, 160, 4, 7, 0.5, 0, TAU); ctx.fill();   // gota de cera
      ctx.fillStyle = `rgba(255,190,80,${fl5})`; ctx.beginPath(); ctx.ellipse(cx6, 148 - fl5 * 3, 4.5, 10 + fl5 * 4, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff2c0"; ctx.beginPath(); ctx.ellipse(cx6, 152, 2, 4.5, 0, 0, TAU); ctx.fill();
      const lg4 = ctx.createRadialGradient(cx6, 150, 4, cx6, 150, 80); lg4.addColorStop(0, "rgba(255,190,80,0.2)"); lg4.addColorStop(1, "rgba(255,190,80,0)");
      ctx.fillStyle = lg4; ctx.beginPath(); ctx.arc(cx6, 150, 80, 0, TAU); ctx.fill();
    }
    // lápida con las 8 ranuras
    ctx.save(); ctx.translate(shx, 0);
    const slG = ctx.createLinearGradient(0, 140, 0, 226); slG.addColorStop(0, "#9a9488"); slG.addColorStop(1, "#6e685c");
    ctx.fillStyle = slG; roundRect(W / 2 - 240, 140, 480, 86, 12); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = "rgba(20,16,30,0.35)"; ctx.lineWidth = 2; roundRect(W / 2 - 228, 150, 456, 66, 8); ctx.stroke();
    // grabados: cruces y musgo
    ctx.fillStyle = "rgba(20,16,30,0.4)"; ctx.font = "12px Georgia"; ctx.textAlign = "center";
    ctx.fillText("✝", W / 2 - 214, 162); ctx.fillText("✝", W / 2 + 214, 162);
    ctx.fillStyle = "rgba(90,130,70,0.5)"; ctx.beginPath(); ctx.ellipse(W / 2 - 230, 220, 16, 7, 0.4, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.ellipse(W / 2 + 222, 146, 12, 5, -0.4, 0, TAU); ctx.fill();
    for (let i = 0; i < 8; i++) {
      const sx2 = W / 2 - 204 + i * 52;
      ctx.fillStyle = codeWrong > 0 ? "rgba(190,60,60,0.4)" : "rgba(20,16,30,0.34)"; roundRect(sx2, 158, 44, 50, 6); ctx.fill();
      if (codeInput[i] != null) bigText(codeInput[i], sx2 + 22, 196, 32, "#ffd24a");
      else { ctx.fillStyle = "rgba(255,210,74,0.25)"; ctx.fillRect(sx2 + 12, 198, 20, 3); }
    }
    ctx.restore();
    // teclado de latón
    for (const r of codeRects()) {
      const hov = pointIn(mouse, r);
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = hov ? 14 : 6; ctx.shadowOffsetY = 3;
      const kg = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (hov) { kg.addColorStop(0, "#e0b64e"); kg.addColorStop(1, "#9a742a"); } else { kg.addColorStop(0, "#5a4a34"); kg.addColorStop(1, "#332a1c"); }
      ctx.fillStyle = kg; roundRect(r.x, r.y, r.w, r.h, 12); ctx.fill(); ctx.restore();
      ctx.strokeStyle = hov ? "#ffd24a" : "#14101e"; ctx.lineWidth = 3; roundRect(r.x, r.y, r.w, r.h, 12); ctx.stroke();
      bigText(r.d === "del" ? "⌫" : r.d, r.x + r.w / 2, r.y + r.h / 2 + 10, 28, hov ? "#1a120a" : "#f3e7cf");
    }
    if (codeWrong > 0) bigText("La losa no se mueve…", W / 2, 250, 16, "#ff8a7a");
    bigText("Esc/Ⓑ — volver al Mausoleo", W / 2, H - 20, 15, "#caa");
  }
  let reqPhase = 1;
  function startCodeBoss() {
    curMode = "boss"; curIndex = -3; bossDef = window.CODE_BOSS; bossIndex = -3; worldW = W;
    resetWorld();
    platforms = [{ x: 240, y: GROUND - 158, w: 150, h: 22 }, { x: W - 396, y: GROUND - 158, w: 150, h: 22 }];
    spawnPlayers(170, GROUND - player.h, false);
    boss = window.CODE_BOSS.make(G);
    boss.maxHp = Math.round(boss.maxHp * DIFF.hp); boss.hp = boss.maxHp;
    winDrop = ""; reqPhase = 1;
    fightStats = { time: 0, parries: 0, supers: 0, hit: false };
    setState("intro"); introStage = 0;
    AUDIO.music("finale");
    AUDIO.sting && AUDIO.sting("go");
  }
  function updateGallery(dt, edge) {
    const n = BOSSES.length;
    if (edge) {
      if (tapped("navR")) { focus = (focus + 1) % n; AUDIO.sfx("select"); }
      if (tapped("navL")) { focus = (focus - 1 + n) % n; AUDIO.sfx("select"); }
      if (tapped("navD")) { focus = (focus + 5) % n; AUDIO.sfx("select"); }
      if (tapped("navU")) { focus = (focus - 5 + n) % n; AUDIO.sfx("select"); }
      if (tapped("confirm")) galleryReplay(focus);
      if (tapped("swap")) { AUDIO.sfx("confirm"); setState("records"); }
      if (tapped("back") || tapped("pause")) { AUDIO.sfx("select"); AUDIO.music("menu"); setState("map"); return; }
    }
    for (let i = 0; i < n; i++) if (pointIn(mouse, galRect(i))) { focus = i; if (mClicked) galleryReplay(i); }
    if (mClicked && pointIn(mouse, RECORDS_BTN)) { AUDIO.sfx("confirm"); setState("records"); }
    if (mClicked && pointIn(mouse, CODE_BTN)) {
      AUDIO.sfx("confirm");
      if (save.requiemUnlocked) showStory(STORY.requiemIntro, startCodeBoss);
      else { codeInput = ""; codeWrong = 0; codeKeys.length = 0; setState("code"); }
    }
  }
  function drawGallery() {
    theaterBg("#241828"); vignetteAndGrain();
    // polvo en suspensión + fuegos fatuos del mausoleo
    for (let i = 0; i < 8; i++) { const fx = (i * 173 + time * 10) % W, fy = 120 + (i * 67) % 380 + Math.sin(time * 1.6 + i) * 12, gl = 0.2 + Math.sin(time * 3 + i * 1.7) * 0.15; ctx.fillStyle = `rgba(122,240,192,${Math.max(0, gl)})`; ctx.beginPath(); ctx.arc(fx, fy, 2.5, 0, TAU); ctx.fill(); }
    bigText("MAUSOLEO", W / 2, 60, 40, "#ffd24a");
    bigText("Repite jefes y revive su historia", W / 2, 92, 15, "#caa");
    drawButtonRect(RECORDS_BTN, "📊 Récords (Q/LB)", false);
    drawButtonRect(CODE_BTN, save.requiemUnlocked ? "🎼 RÉQUIEM" : "🔑 CÓDIGO", save.requiemUnlocked);
    if (save.requiemDefeated) bigText("✓", CODE_BTN.x + CODE_BTN.w + 16, CODE_BTN.y + 28, 20, "#7af0a0");
    for (let i = 0; i < BOSSES.length; i++) {
      const r = galRect(i), def = BOSSES[i], unl = unlocked(i), done = save.defeated.includes(def.id), grade = save.grades[def.id], fc = focus === i;
      ctx.save(); if (fc) { ctx.shadowColor = "#ffd24a"; ctx.shadowBlur = 20; }
      // lápida con arco de piedra
      const arch = () => { ctx.beginPath(); ctx.moveTo(r.x, r.y + r.h); ctx.lineTo(r.x, r.y + 30); ctx.quadraticCurveTo(r.x, r.y, r.x + 40, r.y); ctx.lineTo(r.x + r.w - 40, r.y); ctx.quadraticCurveTo(r.x + r.w, r.y, r.x + r.w, r.y + 30); ctx.lineTo(r.x + r.w, r.y + r.h); ctx.closePath(); };
      const sg2 = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (done) { sg2.addColorStop(0, "#3d3252"); sg2.addColorStop(1, "#251e38"); } else { sg2.addColorStop(0, "#241c30"); sg2.addColorStop(1, "#151020"); }
      ctx.fillStyle = sg2; arch(); ctx.fill();
      ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 5 : 3; arch(); ctx.stroke(); ctx.shadowBlur = 0;
      // grietas de la piedra
      ctx.strokeStyle = "rgba(0,0,0,0.35)"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(r.x + 14, r.y + r.h - 8); ctx.lineTo(r.x + 26, r.y + r.h - 26); ctx.moveTo(r.x + r.w - 12, r.y + 40); ctx.lineTo(r.x + r.w - 26, r.y + 56); ctx.stroke();
      const px = r.x + r.w / 2, py = r.y + 44;
      // busto en marco oval
      ctx.fillStyle = "#141020"; ctx.beginPath(); ctx.ellipse(px, py, 31, 33, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = done ? "#c8a032" : "#3a3346"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = unl ? def.color : "#3a3a3a"; ctx.beginPath(); ctx.arc(px, py, 24, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke();
      if (unl) {
        ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(px - 8, py - 4, 6, 0, TAU); ctx.arc(px + 8, py - 4, 6, 0, TAU); ctx.fill();
        ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(px - 8, py - 2, 3, 0, TAU); ctx.arc(px + 8, py - 2, 3, 0, TAU); ctx.fill();
        if (done) { ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py + 8, 5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke(); }
      } else {
        // telaraña en la esquina + candado
        ctx.strokeStyle = "rgba(200,200,220,0.25)"; ctx.lineWidth = 1;
        for (let k2 = 0; k2 < 4; k2++) { ctx.beginPath(); ctx.moveTo(r.x + 2, r.y + 6); ctx.lineTo(r.x + 2 + Math.cos(k2 * 0.5) * 34, r.y + 6 + Math.sin(k2 * 0.5) * 34); ctx.stroke(); }
        for (let k2 = 1; k2 < 3; k2++) { ctx.beginPath(); ctx.arc(r.x + 2, r.y + 6, k2 * 12, 0, 1.55); ctx.stroke(); }
        bigText("🔒", px, py + 7, 22, "#fff");
      }
      bigText(unl ? def.name : "???", px, r.y + 94, 14, unl ? "#f3e7cf" : "#888");
      // vela encendida para los vencidos
      if (done) {
        const cx5 = r.x + r.w - 20, cy5 = r.y + 30, fl4 = 0.6 + Math.sin(time * 9 + i) * 0.35;
        ctx.fillStyle = "#e8dcc0"; roundRect(cx5 - 4, cy5 - 8, 8, 16, 2); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.6; ctx.stroke();
        ctx.fillStyle = `rgba(255,190,80,${fl4})`; ctx.beginPath(); ctx.ellipse(cx5, cy5 - 14, 3, 6 + fl4 * 2, 0, 0, TAU); ctx.fill();
        const lg3 = ctx.createRadialGradient(cx5, cy5 - 13, 2, cx5, cy5 - 13, 26); lg3.addColorStop(0, "rgba(255,190,80,0.22)"); lg3.addColorStop(1, "rgba(255,190,80,0)");
        ctx.fillStyle = lg3; ctx.beginPath(); ctx.arc(cx5, cy5 - 13, 26, 0, TAU); ctx.fill();
      }
      // sello de lacre con la nota
      if (grade) { ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(r.x + 18, r.y + 22, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.stroke(); ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(r.x + 18, r.y + 22, 9.5, 0, TAU); ctx.stroke(); bigText(grade, r.x + 18, r.y + 27, 14, "#ffd24a"); }
      ctx.restore();
    }
    lbFetch();
    const d = BOSSES[focus], unl = unlocked(focus), bt = save.bossBest[d.id], wr = lbBoss[d.id];
    ctx.fillStyle = "rgba(20,12,8,0.72)"; roundRect(80, H - 88, W - 160, 62, 12); ctx.fill(); ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2; ctx.stroke();
    bigText(unl ? d.name : "Jefe bloqueado", W / 2, H - 60, 20, "#ffd24a");
    ctx.fillStyle = "#f3e7cf"; ctx.font = "13px Trebuchet MS"; ctx.textAlign = "center";
    ctx.fillText(unl ? (d.subtitle + (bt ? "   ·   mejor tiempo: " + fmtTime(bt) : "") + (save.grades[d.id] ? "   ·   nota " + save.grades[d.id] : "") + (wr ? "   ·   🌐 mundial " + fmtTime(wr.time) + " (" + String(wr.name || "?").slice(0, 10).toUpperCase() + ")" : "")) : "Vence al jefe anterior para desbloquearlo", W / 2, H - 40);
    bigText(unl ? "Z/Ⓐ — repetir combate    ·    Esc/Ⓑ volver" : "Esc/Ⓑ volver", W / 2, H - 16, 13, "#caa");
  }
  const NAME_BTN = { x: W - 262, y: 26, w: 234, h: 40 };
  function updateRecords(dt, edge) {
    if (editingName) return;   // mientras escribes tu nombre, la pantalla no navega
    if (mClicked && pointIn(mouse, NAME_BTN)) { editingName = true; nameBuffer = OPT.name === "PIP" ? "" : (OPT.name || ""); AUDIO.sfx("select"); return; }
    if (edge && (tapped("confirm") || tapped("back") || tapped("pause") || tapped("swap"))) { AUDIO.sfx("select"); setState("gallery"); }
    else if (mClicked) { AUDIO.sfx("select"); setState("gallery"); }
  }
  function drawRecords() {
    theaterBg("#1c2230"); vignetteAndGrain();
    bigText("🏆", W / 2, 66, 34, "#ffd24a");
    bigText("RÉCORDS", W / 2, 106, 44, "#ffd24a");
    ctx.strokeStyle = "rgba(255,210,74,0.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 180, 122); ctx.lineTo(W / 2 + 180, 122); ctx.stroke();
    // placa de estadísticas
    decoPanel(W / 2 - 300, 142, 600, 216);
    const st = save.stats || { parries: 0, deaths: 0, kills: 0, playtime: 0 };
    const rows = [["🎩 Jefes vencidos", String(st.kills)], ["🎐 Parrys totales", String(st.parries)], ["💀 Caídas", String(st.deaths)], ["⏱ Tiempo en combate", fmtTime(st.playtime)]];
    rows.forEach((r, i) => {
      const y = 188 + i * 46;
      if (i) { ctx.strokeStyle = "rgba(255,255,255,0.08)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(W / 2 - 260, y - 28); ctx.lineTo(W / 2 + 260, y - 28); ctx.stroke(); }
      ctx.textAlign = "left"; ctx.font = "bold 21px Trebuchet MS"; ctx.fillStyle = "#caa"; ctx.fillText(r[0], W / 2 - 260, y);
      ctx.textAlign = "right"; ctx.fillStyle = "#ffe9a0"; ctx.fillText(r[1], W / 2 + 260, y);
    });
    const rb = rushBest();
    decoPanel(W / 2 - 460, 382, 920, 118, "#ff8a5a");
    bigText("⚔️ BOSS RUSH — mejores tiempos", W / 2, 414, 22, "#ffd24a");
    [["Sencillo", "simple", "#7ad08a"], ["Normal", "regular", "#ffd24a"], ["Experto", "expert", "#ff6a4a"]].forEach((d, i) => {
      const x = W / 2 - 300 + i * 300 + 150;
      bigText(d[0], x, 446, 16, d[2]);
      bigText(rb[d[1]] != null ? fmtTime(rb[d[1]]) : "—", x, 482, 26, rb[d[1]] != null ? "#7af0a0" : "#666");
      if (rb[d[1]] != null) bigText("🏅", x - 78, 482, 20, "#ffd24a");
    });
    // ---- LEADERBOARD (mundial vía jsonbin, o Salón de la Fama local) ----
    lbFetch();
    const online = lbSource === "online", acc = online ? "#9fd0ff" : "#ffd24a";
    const px3 = W / 2 - 460, py3 = 514, pw3 = 920, ph3 = 152;
    decoPanel(px3, py3, pw3, ph3, acc);
    // cabecera en cinta con icono que late
    const ttl = online ? "TOP MUNDIAL · BOSS RUSH" : "SALÓN DE LA FAMA · tus récords";
    const cw3 = ttl.length * 8.4 + 120, hx = W / 2;
    ctx.fillStyle = online ? "#12324a" : "#3a2a10"; ctx.beginPath();
    ctx.moveTo(hx - cw3 / 2, py3 - 2); ctx.lineTo(hx + cw3 / 2, py3 - 2); ctx.lineTo(hx + cw3 / 2 + 16, py3 + 15); ctx.lineTo(hx + cw3 / 2, py3 + 32); ctx.lineTo(hx - cw3 / 2, py3 + 32); ctx.lineTo(hx - cw3 / 2 - 16, py3 + 15); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = acc; ctx.lineWidth = 2; ctx.stroke();
    const ib = 1 + Math.sin(time * 3) * 0.12;
    ctx.save(); ctx.translate(hx - cw3 / 2 + 24, py3 + 15); ctx.scale(ib, ib); ctx.font = "18px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(online ? "🌐" : "🏆", 0, 0); ctx.textBaseline = "alphabetic"; ctx.restore();
    bigText(ttl, hx + 22, py3 + 21, 17, acc);
    if (!lbCache || !lbCache.length) {
      // estado vacío con carácter
      ctx.textAlign = "center"; ctx.fillStyle = "#9aa8bc"; ctx.font = "italic 16px Trebuchet MS";
      ctx.fillText(online ? "La pista de baile está vacía…" : "Aún no has puesto ningún tiempo de Boss Rush.", hx, py3 + 82);
      bigText(online ? "¡completa el BOSS RUSH y sé la primera leyenda!" : "¡corre el ⚔️ Boss Rush y estrena tu salón!", hx, py3 + 112, 16, "#ffd24a");
      // tacita triste
      ctx.save(); ctx.translate(hx, py3 + 60); ctx.globalAlpha = 0.5; ctx.lineJoin = "round";
      ctx.fillStyle = "#f6ecd6"; roundRect(-10, -12, 20, 22, 6); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(-4, -3, 1.6, 0, TAU); ctx.arc(4, -3, 1.6, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(0, 6, 3, 1.15 * Math.PI, 1.85 * Math.PI); ctx.stroke(); ctx.restore(); ctx.globalAlpha = 1;
    } else {
      const rows = lbCache.slice(0, 5), rx2 = W / 2 - 300, rw2 = 600, rowH = 20;
      const MED = ["#ffd24a", "#d6dde6", "#cd8a4a"];
      rows.forEach((e, i) => {
        const y2 = py3 + 50 + i * rowH, top3 = i < 3;
        // fondo de fila; la tuya resaltada
        if (e.mine) { ctx.fillStyle = "rgba(122,240,160,0.14)"; roundRect(rx2 - 6, y2 - 13, rw2 + 12, 18, 8); ctx.fill(); ctx.strokeStyle = "#7af0a0"; ctx.lineWidth = 1.5; ctx.stroke(); }
        else { ctx.fillStyle = i % 2 ? "rgba(255,255,255,0.03)" : "rgba(10,16,26,0.30)"; roundRect(rx2, y2 - 12, rw2, 16, 7); ctx.fill(); }
        if (i === 0) { const sk = (time * 0.55) % 1; if (sk < 0.22) { ctx.save(); ctx.beginPath(); roundRect(rx2, y2 - 12, rw2, 16, 7); ctx.clip(); ctx.fillStyle = "rgba(255,240,200,0.13)"; const sxg = rx2 + (sk / 0.22) * rw2; ctx.beginPath(); ctx.moveTo(sxg - 16, y2 - 12); ctx.lineTo(sxg + 4, y2 - 12); ctx.lineTo(sxg - 10, y2 + 4); ctx.lineTo(sxg - 30, y2 + 4); ctx.fill(); ctx.restore(); } }
        // medalla: taza para el podio, círculo numerado para el resto
        const mx = rx2 + 17, my = y2 - 4;
        if (top3) {
          ctx.save(); ctx.translate(mx, my + (i === 0 ? Math.sin(time * 3) * 0.8 : 0)); ctx.lineJoin = "round";
          ctx.fillStyle = MED[i]; roundRect(-8, -9, 16, 17, 4); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.8; ctx.stroke();
          ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(0, -8, 6, 1.6, 0, 0, TAU); ctx.fill();
          ctx.fillStyle = "#1a120a"; ctx.font = "bold 9px Trebuchet MS"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), 0, 1); ctx.textBaseline = "alphabetic"; ctx.restore();
        } else {
          ctx.fillStyle = "#3a4658"; ctx.beginPath(); ctx.arc(mx, my, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.6; ctx.stroke();
          ctx.fillStyle = "#cfe0f0"; ctx.font = "bold 11px Trebuchet MS"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(String(i + 1), mx, my + 1); ctx.textBaseline = "alphabetic";
        }
        // nombre (+ "TÚ" si es tuya)
        ctx.textAlign = "left"; ctx.fillStyle = e.mine ? "#aaf0c0" : (i === 0 ? "#ffe9a0" : "#f3e7cf"); ctx.font = "bold 14px Trebuchet MS";
        ctx.fillText(String(e.name || "?").slice(0, 12).toUpperCase(), rx2 + 36, y2 + 1);
        if (e.mine) { ctx.fillStyle = "#7af0a0"; ctx.font = "bold 10px Trebuchet MS"; ctx.fillText("◄ TÚ", rx2 + 36 + ctx.measureText(String(e.name || "?").slice(0, 12).toUpperCase()).width + 44, y2 + 1); }
        // chip de dificultad
        const dko = DIFFS[e.diff], dnm = dko ? dko.name : "?";
        ctx.font = "bold 10px Trebuchet MS"; ctx.textAlign = "center";
        const chw = dnm.length * 6.4 + 16, chx = rx2 + 372;
        ctx.save(); ctx.globalAlpha = 0.9; ctx.fillStyle = "rgba(0,0,0,0.35)"; roundRect(chx - chw / 2, y2 - 11, chw, 14, 7); ctx.fill();
        ctx.strokeStyle = dko ? dko.color : "#888"; ctx.lineWidth = 1.2; ctx.stroke(); ctx.restore();
        ctx.fillStyle = dko ? dko.color : "#888"; ctx.fillText(dnm.toUpperCase(), chx, y2 + 0.5);
        // tiempo
        ctx.textAlign = "right"; ctx.fillStyle = i === 0 ? "#ffd24a" : "#cfe0f0"; ctx.font = "bold 15px Georgia";
        ctx.fillText(fmtTime(e.time), rx2 + rw2 - 10, y2 + 1);
      });
      // pie: fuente de datos + empujón
      ctx.textAlign = "center"; ctx.font = "italic 11.5px Trebuchet MS"; ctx.fillStyle = "#8fa8c5";
      ctx.fillText(online ? "🌐 clasificación mundial en vivo · ¡bate el récord del Boss Rush!" : "guardado en tu dispositivo · conéctate para competir en el mundial", hx, py3 + ph3 - 12);
    }
    // botón para elegir TU nombre del ranking
    drawButtonRect(NAME_BTN, "✏️ " + (OPT.name || "PIP"), editingName);
    ctx.fillStyle = "#8fa8c5"; ctx.font = "italic 11px Trebuchet MS"; ctx.textAlign = "center";
    ctx.fillText("tu nombre en el ranking", NAME_BTN.x + NAME_BTN.w / 2, NAME_BTN.y + NAME_BTN.h + 14);
    bigText("Z/Ⓐ o Esc/Ⓑ — volver al Mausoleo", W / 2, H - 40, 16, "#caa");
    drawNameModal();
  }
  // modal de edición del nombre (compartido por Récords y la victoria del Boss Rush)
  function drawNameModal() {
    if (!editingName) return;
    ctx.fillStyle = "rgba(6,4,10,0.72)"; ctx.fillRect(0, 0, W, H);
    decoPanel(W / 2 - 260, H / 2 - 110, 520, 210, "#9fd0ff");
    bigText("✏️ TU NOMBRE EN EL RANKING", W / 2, H / 2 - 66, 22, "#9fd0ff");
    // campo con caret parpadeante
    ctx.fillStyle = "#10141e"; roundRect(W / 2 - 190, H / 2 - 38, 380, 52, 10); ctx.fill();
    ctx.strokeStyle = "#9fd0ff"; ctx.lineWidth = 2.5; roundRect(W / 2 - 190, H / 2 - 38, 380, 52, 10); ctx.stroke();
    const shown = nameBuffer.toUpperCase();
    ctx.font = "bold 28px Georgia"; ctx.textAlign = "center"; ctx.fillStyle = "#ffe9a0";
    const caret = Math.floor(time * 2.5) % 2 === 0 ? "▏" : " ";
    ctx.fillText((shown || " ") + caret, W / 2, H / 2 - 1);
    ctx.fillStyle = "#8fa8c5"; ctx.font = "12px Trebuchet MS";
    ctx.fillText(shown.length + "/12 letras · así te verán en el TOP mundial", W / 2, H / 2 + 34);
    bigText("Intro — guardar   ·   Esc — cancelar", W / 2, H / 2 + 74, 16, "#caa");
  }

  /* ============================================================
     SELECCIÓN DE RANURA (3 partidas)
     ============================================================ */
  let confirmDelete = -1;
  function slotRects() { return [0, 1, 2].map(i => ({ x: 150 + i * 330, y: 200, w: 300, h: 320, i })); }
  function pickSlot(i) {
    loadSlot(i); AUDIO.sfx("confirm"); AUDIO.music("menu"); confirmDelete = -1;
    if (!save.seenIntro) { save.seenIntro = true; persist(); showStory(STORY.prologue, () => setState("map")); }
    else setState("map");
  }
  function updateSlots(dt, edge) {
    const cards = slotRects();
    if (confirmDelete >= 0) {
      const c = cards[confirmDelete];
      const si = { x: c.x + 30, y: c.y + c.h - 64, w: 110, h: 44 }, no = { x: c.x + c.w - 140, y: c.y + c.h - 64, w: 110, h: 44 };
      if (mClicked && pointIn(mouse, si)) { deleteSlot(confirmDelete); AUDIO.sfx("buy"); confirmDelete = -1; }
      else if (mClicked && pointIn(mouse, no)) { AUDIO.sfx("select"); confirmDelete = -1; }
      else if (edge && (tapped("back") || tapped("pause"))) { AUDIO.sfx("select"); confirmDelete = -1; }
      return;
    }
    if (edge && (tapped("back") || tapped("pause"))) { AUDIO.sfx("select"); setState("title"); return; }
    if (edge) {
      if (tapped("navR")) { focus = (focus + 1) % 3; AUDIO.sfx("select"); }
      if (tapped("navL")) { focus = (focus - 1 + 3) % 3; AUDIO.sfx("select"); }
      if (tapped("confirm")) { pickSlot(focus); return; }
    }
    for (const c of cards) {
      if (pointIn(mouse, c)) focus = c.i;
      const del = { x: c.x + c.w - 40, y: c.y + 8, w: 34, h: 34 };
      if (slotInfo(c.i).used && mClicked && pointIn(mouse, del)) { confirmDelete = c.i; AUDIO.sfx("select"); return; }
      if (mClicked && pointIn(mouse, c)) { pickSlot(c.i); return; }
    }
  }
  function drawSlotCup(cx, cy, used) {
    const bob = used ? Math.sin(time * 2.5 + cx) * 2.5 : 0;
    const blink = used && ((time + cx * 0.01) % 4.4) > 4.24;
    ctx.save(); ctx.translate(cx, cy - bob); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.fillStyle = "rgba(0,0,0,0.3)"; ctx.beginPath(); ctx.ellipse(0, 32 + bob, 24, 6, 0, 0, TAU); ctx.fill();
    // asa
    ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(-25, -2, 10, -1.15, 1.15); ctx.stroke();
    if (used) { ctx.lineWidth = 3.5; ctx.strokeStyle = "#e2d2ac"; ctx.beginPath(); ctx.arc(-25, -2, 10, -1.15, 1.15); ctx.stroke(); }
    // taza con degradado + tapa líquida + pajita
    const g = ctx.createLinearGradient(-22, -26, 22, 24); g.addColorStop(0, used ? "#f6ecd6" : "#5a5060"); g.addColorStop(1, used ? "#e2d2ac" : "#443c50");
    ctx.fillStyle = g; roundRect(-22, -26, 44, 52, 12); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.28)"; roundRect(-18, -22, 10, 42, 6); ctx.fill();
    ctx.fillStyle = used ? "#efe2c2" : "#4a4256"; roundRect(-23, -32, 46, 10, 6); ctx.fill(); ctx.lineWidth = 3.5; ctx.stroke();
    ctx.fillStyle = used ? "#8a2da0" : "#3a3444"; ctx.beginPath(); ctx.ellipse(0, -27, 18, 4.5, 0, 0, TAU); ctx.fill();
    if (used) {
      ctx.fillStyle = "#bd7ad8"; ctx.beginPath(); ctx.ellipse(-5, -28, 6, 2, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#e8434f"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(7, -27); ctx.lineTo(13, -42); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(13, -42, 2.8, 0, TAU); ctx.fill();
      if (blink) { ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-13, -4); ctx.lineTo(-3, -4); ctx.moveTo(3, -4); ctx.lineTo(13, -4); ctx.stroke(); }
      else { pieEye(-8, -4, 6.5, -0.5); pieEye(8, -4, 6.5, -0.5); }
      ctx.fillStyle = "rgba(232,120,120,0.5)"; ctx.beginPath(); ctx.arc(-14, 6, 3.5, 0, TAU); ctx.arc(14, 6, 3.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(0, 7, 6, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
    } else {
      const pu = 0.5 + Math.sin(time * 3) * 0.3;
      ctx.fillStyle = `rgba(180,170,200,${pu})`; ctx.font = "bold 30px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("+", 0, -1); ctx.textBaseline = "alphabetic";
    }
    ctx.restore();
  }
  function drawSlots() {
    theaterBg("#2a2440"); floatingNotes(6); vignetteAndGrain();
    bigText("ELIGE TU PARTIDA", W / 2, 122, 46, "#ffd24a");
    // filigrana bajo el título
    ctx.strokeStyle = "rgba(255,210,74,0.55)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(W / 2 - 210, 140); ctx.lineTo(W / 2 - 26, 140); ctx.moveTo(W / 2 + 26, 140); ctx.lineTo(W / 2 + 210, 140); ctx.stroke();
    ctx.fillStyle = "#ffd24a"; ctx.save(); ctx.translate(W / 2, 140); ctx.rotate(Math.PI / 4); ctx.fillRect(-6, -6, 12, 12); ctx.restore();
    bigText(coop ? "▶ 2 JUGADORES" : "▶ 1 JUGADOR", W / 2, 172, 18, coop ? "#9fd0ff" : "#7af0a0");
    for (const c of slotRects()) {
      const info = slotInfo(c.i), fc = focus === c.i;
      ctx.save();
      ctx.save(); ctx.shadowColor = fc ? "#ffd24a" : "rgba(0,0,0,0.55)"; ctx.shadowBlur = fc ? 26 : 14; ctx.shadowOffsetY = fc ? 0 : 8;
      const tg = ctx.createLinearGradient(0, c.y, 0, c.y + c.h);
      if (info.used) { tg.addColorStop(0, "#3f3358"); tg.addColorStop(1, "#241d38"); } else { tg.addColorStop(0, "#282136"); tg.addColorStop(1, "#1a1526"); }
      ctx.fillStyle = tg; roundRect(c.x, c.y, c.w, c.h, 16); ctx.fill(); ctx.restore();
      ctx.strokeStyle = fc ? "#ffd24a" : "#1a120a"; ctx.lineWidth = fc ? 5 : 4; roundRect(c.x, c.y, c.w, c.h, 16); ctx.stroke();
      ctx.strokeStyle = fc ? "rgba(255,210,74,0.5)" : "rgba(255,210,74,0.18)"; ctx.lineWidth = 1.5; roundRect(c.x + 6, c.y + 6, c.w - 12, c.h - 12, 12); ctx.stroke();
      // perforaciones de entrada de teatro en los laterales
      ctx.fillStyle = "rgba(10,7,16,0.85)";
      for (let py = c.y + 28; py < c.y + c.h - 20; py += 24) { ctx.beginPath(); ctx.arc(c.x, py, 4.5, 0, TAU); ctx.arc(c.x + c.w, py, 4.5, 0, TAU); ctx.fill(); }
      // cabecera en cinta
      ctx.fillStyle = "#7a1420"; ctx.beginPath();
      ctx.moveTo(c.x + 44, c.y + 24); ctx.lineTo(c.x + c.w - 44, c.y + 24); ctx.lineTo(c.x + c.w - 32, c.y + 42); ctx.lineTo(c.x + c.w - 44, c.y + 60); ctx.lineTo(c.x + 44, c.y + 60); ctx.lineTo(c.x + 32, c.y + 42); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 2; ctx.stroke();
      bigText("RANURA " + (c.i + 1), c.x + c.w / 2, c.y + 49, 20, "#ffd24a");
      drawSlotCup(c.x + c.w / 2, c.y + 116, info.used);
      if (info.used) {
        // % de avance (centro): Sencillo no suma · todo Normal = 100% · jefes en Experto hasta 200%
        const p = info.pct, pcol = p >= 200 ? "#ff6a4a" : p >= 100 ? "#ffd24a" : "#7af0c0";
        bigText(p + "%", c.x + c.w / 2, c.y + 180, 34, pcol);
        ctx.fillStyle = "#b9a9c9"; ctx.font = "bold 10px Trebuchet MS"; ctx.textAlign = "center"; ctx.fillText("COMPLETADO", c.x + c.w / 2, c.y + 193);
        // barra 0..200 con marca del 100% en la mitad
        const bx0 = c.x + 36, bw = c.w - 72, by0 = c.y + 201;
        ctx.fillStyle = "#1a1228"; roundRect(bx0, by0, bw, 9, 4); ctx.fill();
        ctx.fillStyle = pcol; roundRect(bx0, by0, Math.max(3, bw * p / 200), 9, 4); ctx.fill();
        ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(bx0 + bw / 2, by0 - 3); ctx.lineTo(bx0 + bw / 2, by0 + 12); ctx.stroke();
        // detalles
        ctx.fillStyle = "#f3e3c0"; ctx.font = "bold 15px Trebuchet MS"; ctx.textAlign = "center";
        ctx.fillText("Mundo " + info.world + "/5   ·   Jefes " + info.bosses + "/" + BOSSES.length, c.x + c.w / 2, c.y + 234);
        ctx.fillStyle = "#ffd24a"; ctx.fillText("◎ " + info.coins, c.x + c.w / 2, c.y + 256);
        ctx.fillStyle = (DIFFS[info.diff] || {}).color || "#fff"; ctx.font = "13px Trebuchet MS";
        ctx.fillText(((DIFFS[info.diff] || {}).name || "") + (info.finished ? "  ·  ✓ FIN" : "") + (info.secret ? "  ·  ★" : ""), c.x + c.w / 2, c.y + 278);
        ctx.fillStyle = "#7a1420"; ctx.beginPath(); ctx.arc(c.x + c.w - 23, c.y + 25, 14, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#fff"; ctx.font = "bold 18px Trebuchet MS"; ctx.textBaseline = "middle"; ctx.fillText("×", c.x + c.w - 23, c.y + 26); ctx.textBaseline = "alphabetic";
      } else {
        ctx.setLineDash([6, 6]); ctx.strokeStyle = "rgba(122,240,160,0.5)"; ctx.lineWidth = 2; roundRect(c.x + 40, c.y + 178, c.w - 80, 46, 10); ctx.stroke(); ctx.setLineDash([]);
        bigText("Partida nueva", c.x + c.w / 2, c.y + 208, 20, "#7af0a0");
        ctx.fillStyle = "#8a7f95"; ctx.font = "italic 12px Trebuchet MS"; ctx.textAlign = "center";
        ctx.fillText("una butaca libre te espera…", c.x + c.w / 2, c.y + 252);
      }
      if (confirmDelete === c.i) {
        ctx.fillStyle = "rgba(10,7,16,0.9)"; roundRect(c.x, c.y, c.w, c.h, 16); ctx.fill(); ctx.strokeStyle = "#ff6a4a"; ctx.lineWidth = 4; ctx.stroke();
        bigText("¿Borrar?", c.x + c.w / 2, c.y + 140, 30, "#ff6a4a");
        drawButtonRect({ x: c.x + 30, y: c.y + c.h - 64, w: 110, h: 44 }, "Sí", false);
        drawButtonRect({ x: c.x + c.w - 140, y: c.y + c.h - 64, w: 110, h: 44 }, "No", false);
      }
      ctx.restore();
    }
    bigText("◀ ▶ elegir  ·  Z/Ⓐ confirmar  ·  Esc/Ⓑ volver", W / 2, H - 40, 18, "#caa");
  }

  let last = performance.now(), acc = 0; const STEP = 1 / 60;
  function frame(now) {
    requestAnimationFrame(frame);
    let dt = (now - last) / 1000; last = now; if (dt > 0.25) dt = 0.25;
    time += dt; pollInput();
    acc += dt; let steps = 0;
    while (acc >= STEP) { update(STEP, steps === 0); if (steps === 0) mClicked = false; acc -= STEP; if (++steps > 5) { acc = 0; break; } }
    render();
  }
  function update(dt, edge) {
    edgesOn = edge; stateT += dt;
    if (iris > 0) iris -= dt;
    updateToasts(dt); checkAch(false);
    if (hitStop > 0) { hitStop = Math.max(0, hitStop - dt); if (state === "fight" || state === "rng") return; } // micro-congelación (impacto)
    if (shake > 0) shake = Math.max(0, shake - dt * 60);
    if (flashScreen > 0) flashScreen -= dt;
    updateParts(dt);
    if (state === "title") {
      const tr = { x: W / 2 - 180, y: 478, w: 360, h: 36 };
      const hr = { x: W / 2 - 344, y: 638, w: 212, h: 40 };
      const lr = { x: W / 2 - 106, y: 638, w: 212, h: 40 };
      const or = { x: W / 2 + 132, y: 638, w: 212, h: 40 };
      if (edge && mClicked && pointIn(mouse, tr)) { coop = !coop; OPT.coop = coop; saveOpts(); AUDIO.sfx("select"); }
      else if (edge && mClicked && pointIn(mouse, hr)) { AUDIO.resume(); AUDIO.music("menu"); AUDIO.sfx("confirm"); showStory(STORY.prologue, () => setState("title")); }
      else if (edge && ((mClicked && pointIn(mouse, lr)) || tapped("swap"))) { AUDIO.resume(); AUDIO.music("menu"); AUDIO.sfx("confirm"); setState("achievements"); }
      else if (edge && ((mClicked && pointIn(mouse, or)) || tapped("lock"))) { AUDIO.resume(); AUDIO.music("menu"); openOptions("title"); }
      else if (edge && mClicked && pointIn(mouse, { x: 24, y: 630, w: 254, h: 50 })) { AUDIO.resume(); cycleSkin(); }   // selector de traje
      else if (edge && (tapped("confirm") || mClicked)) { AUDIO.resume(); AUDIO.music("menu"); AUDIO.sfx("confirm"); setState("slots"); }
    }
    else if (state === "slots") updateSlots(dt, edge);
    else if (state === "story") updateStory(dt, edge);
    else if (state === "talk") updateTalk(dt, edge);
    else if (state === "achievements") updateAchievements(dt, edge);
    else if (state === "options") updateOptions(dt, edge);
    else if (state === "keys") updateKeys(dt, edge);
    else if (state === "superart") updateSuperPick(dt, edge);
    else if (state === "gallery") updateGallery(dt, edge);
    else if (state === "code") updateCode(dt, edge);
    else if (state === "records") updateRecords(dt, edge);
    else if (state === "map") updateMap(dt, edge);
    else if (state === "shop") updateShop(dt, edge);
    else if (state === "diffselect") updateDiff(dt, edge);
    else if (state === "intro") updateIntro(dt, edge);
    else if (state === "fight") updateFight(dt, edge);
    else if (state === "rngintro") { if (stateT > 1.2) setState("rng"); }
    else if (state === "rng") updateRng(dt, edge);
    else if (state === "paused") updatePause(dt, edge);
    else if (state === "won") updateEnd(dt, edge, true);
    else if (state === "rngwon") updateRngWon(dt, edge);
    else if (state === "lost") updateEnd(dt, edge, false);
    else if (state === "rushdone") updateRushDone(dt, edge);
  }
  function updateRng(dt, edge) {
    if (edge && tapped("pause")) { setState("paused"); AUDIO.sfx("select"); return; }
    fightStats.time += dt;
    const flight = curLevel.mode === "flight";
    if (flight && aliveList().length) cam.x = Math.min(worldW - W, cam.x + 2.6 * dt * 60); // auto-scroll
    if (curLevel.tutorial && player.x > 1720 && player.x < 2520 && !projs.some(p => p.parry)) G.spawnProj({ x: clamp(player.x + 240, 0, worldW), y: GROUND - 135, vx: 0, vy: 0, r: 16, shape: "ball", color: "#ff4fa3", parry: true, noFloor: true, life: 12 });
    for (const p of players) p.update(dt, edge);
    updateBullets(dt); updateEnemies(dt); updateProjs(dt); updateHazards(dt); updateCoins(dt); updateSuperArt(dt);
    if (!flight) { const a = aliveList(); if (a.length) { let ax = 0; for (const p of a) ax += p.x + p.w / 2; cam.x = clamp(ax / a.length - W * 0.42, 0, Math.max(0, worldW - W)); } }
    if (coop) for (const p of players) p.x = clamp(p.x, cam.x + 6, cam.x + W - 6 - p.w); // ambos en pantalla
    const lost = coop ? players.every(p => p.ghost || p.dead) : (player.dead && player.y > H + 100);
    if (lost) { AUDIO.stop(); AUDIO.sfx("lose"); setState("lost"); return; }
    const reached = flight ? cam.x >= worldW - W - 2 : aliveList().some(p => p.x + p.w / 2 >= curLevel.goalX);
    if (reached) completeRng();
  }
  function updateRngWon(dt, edge) {
    if (edge && tapped("confirm")) { AUDIO.sfx("confirm"); AUDIO.music("menu"); setState("map"); }
    const r = { x: W / 2 - 130, y: 560, w: 260, h: 48 }; if (pointIn(mouse, r) && mClicked) { AUDIO.sfx("confirm"); AUDIO.music("menu"); setState("map"); }
  }
  function updateIntro(dt, edge) {
    if (introStage === 0 && stateT > 2.0) { introStage = 1; stateT = 0; AUDIO.sfx("ready"); }
    else if (introStage === 1 && stateT > 1.1) setState("fight");
  }
  function updateFight(dt, edge) {
    if (edge && tapped("pause")) { setState("paused"); AUDIO.sfx("select"); return; }
    fightStats.time += dt;
    if (rushActive) rushTime += dt;
    for (const p of players) p.update(dt, edge);
    if (boss) boss.update(dt);
    // RÉQUIEM: cada movimiento sube el tono de la música y hay un fogonazo de transición
    if (boss && bossDef && bossDef.code && boss.phase !== reqPhase) { reqPhase = boss.phase; flashScreen = Math.max(flashScreen, 0.4); AUDIO.music("finale", { transpose: [0, 2, 3, 5][reqPhase - 1] || 0 }); }
    // TODOS los jefes: al cambiar de fase la banda SUBE un semitono (la pelea se siente más urgente)
    else if (boss && bossDef && boss.phase !== musPhase) {
      musPhase = boss.phase;
      const trk = (bossDef.secret || bossDef.id === "collector" || bossDef.id === "croupier") ? "boss" : "battle";
      AUDIO.music(trk, { transpose: (bossDef.transpose || 0) + (boss.phase - 1) });
    }
    updateReverse(dt); if (boss && boss.dead) rev.grav = 1;   // al morir el jefe, el mundo vuelve a su sitio
    // eco de tinta: un clon retardado repite TUS movimientos y castiga quedarse quieto
    if (echoT > 0) {
      echoT -= dt;
      echoTrail.push({ x: player.x, y: player.y, f: player.facing });
      if (echoTrail.length > 240) echoTrail.shift();
      const g = echoGhost();
      if (g) for (const p of players) { if (p.inv <= 0 && !p.dead && !p.ghost) { const b = p.box(); if (b.x < g.x + 34 && b.x + b.w > g.x + 6 && b.y < g.y + 66 && b.y + b.h > g.y + 8) p.hurt(); } }
      if (echoT <= 0) echoTrail.length = 0;
    }
    // fuelle: viento que aspira hacia el órgano
    if (windT > 0) {
      windT -= dt;
      for (const p of players) if (!p.dead && !p.ghost) p.x = clamp(p.x + windFx * dt * 60, 10, worldW - 10 - p.w);
      if (Math.random() < 0.6) parts.push({ x: rand(0, W), y: rand(90, GROUND - 12), vx: windFx * 9, vy: 0, grav: 0, life: 0.35, max: 0.35, r: 2, color: "#cfc8e8", shape: "dot" });
    }
    platforms = platforms.filter(p => !p.tomb || time < p.until);   // las lápidas se desmoronan
    updateBullets(dt); updateProjs(dt); updateHazards(dt); updateSuperArt(dt);
    if (boss && boss.dead && boss.dying <= 0) {
      if (rushActive) { AUDIO.sfx("ko"); rumble(0.5, 0.9, 0.9); rushAdvance(); return; } // Boss Rush: al siguiente
      if (bossDef.secret) { // jefe secreto: no cuenta para el % ni las notas; epílogo propio
        save.secretDefeated = true; persist();
        AUDIO.sfx("ko"); rumble(0.7, 1.0, 1.0); flashScreen = 0.7;
        showStory(STORY.secret, () => { AUDIO.music("menu"); setState("title"); });
        return;
      }
      if (bossDef.code) { // RÉQUIEM: epílogo propio; tampoco cuenta para el %
        save.requiemDefeated = true;
        if (!save.ownedC.includes("god")) save.ownedC.push("god");   // recompensa dorada exclusiva (amuleto Dios)
        persist();
        AUDIO.sfx("ko"); rumble(0.7, 1.0, 1.0); flashScreen = 0.7;
        showStory(STORY.requiemWin, () => { AUDIO.music("menu"); setState("gallery"); });
        return;
      }
      if (!save.defeated.includes(bossDef.id)) save.defeated.push(bossDef.id);
      if (DIFF.key !== "simple" && !save.beatenNormal.includes(bossDef.id)) save.beatenNormal.push(bossDef.id);
      if ((DIFF.key === "expert" || DIFF.key === "locura") && !save.beatenExpert.includes(bossDef.id)) save.beatenExpert.push(bossDef.id);
      if (bossDef.world === 5) grantReverseDrop(bossDef.id);
      winGrade = computeGrade();
      if (!save.grades[bossDef.id] || "DCBAS".indexOf(winGrade) > "DCBAS".indexOf(save.grades[bossDef.id])) save.grades[bossDef.id] = winGrade;
      save.stats.kills++; save.stats.parries += fightStats.parries; save.stats.playtime += fightStats.time;
      if (!save.bossBest[bossDef.id] || fightStats.time < save.bossBest[bossDef.id]) { save.bossBest[bossDef.id] = fightStats.time; lbPost({ mode: "boss", id: bossDef.id, diff: DIFF.key, time: +fightStats.time.toFixed(1), name: OPT.name || "PIP" }); }
      persist();
      AUDIO.sfx("ko"); rumble(0.6, 1.0, 1.0);
      if (bossDef.id === "author") { save.finished = true; persist(); flashScreen = 0.6; showStory(STORY.ending, () => { AUDIO.music("menu"); setState("title"); }); }
      else if (bossDef.id === "lefthand") { save.reverseDone = true; persist(); flashScreen = 0.6; showStory(STORY.reverseEnding, () => { AUDIO.music("menu"); setState("title"); }); }
      else { AUDIO.music("victory"); setState("won"); }
    }
    if (boss && boss.dead && Math.random() < 0.3) { const hb = boss.getHitboxes()[0]; G.burst(hb.x + rand(0, hb.w), hb.y + rand(0, hb.h), { n: 6, color: pick(["#ffd24a", "#ff7a2a", "#fff"]), smin: 2, smax: 6 }); shake = Math.max(shake, 5); }
    const lost = coop ? players.every(p => p.ghost || p.dead) : (player.dead && player.y > H + 100);
    if (lost && (!boss || !boss.dead)) { if (rushActive) { rushDie(); return; } save.stats.deaths++; save.stats.parries += fightStats.parries; save.stats.playtime += fightStats.time; persist(); AUDIO.stop(); AUDIO.sfx("lose"); setState("lost"); }
  }
  function updatePause(dt, edge) {
    if (edge && tapped("pause")) { setState(curMode === "rng" ? "rng" : "fight"); return; }
    const items = ["Reanudar", "Opciones", "Reintentar", "Abandonar"];
    navList(items.length, edge);
    if (edge && tapped("confirm")) doPause(focus);
    items.forEach((t, i) => { const r = { x: W / 2 - 130, y: 300 + i * 60, w: 260, h: 48 }; if (pointIn(mouse, r)) { focus = i; if (mClicked) doPause(i); } });
  }
  function doPause(i) { if (i === 1) { openOptions("paused"); return; } AUDIO.sfx("confirm"); if (i === 0) setState(curMode === "rng" ? "rng" : "fight"); else if (i === 2) retry(); else { AUDIO.music("menu"); setState("map"); } }
  function updateEnd(dt, edge, won) {
    if (won && boss && Math.random() < 0.05) { const hb = boss.getHitboxes()[0]; G.burst(hb.x + rand(0, hb.w), hb.y + rand(0, hb.h), { n: 4, color: pick(["#ffd24a", "#fff"]) }); }
    const items = won ? ["Continuar"] : ["Reintentar", "A la isla"];
    navList(items.length, edge);
    if (edge && tapped("confirm")) doEnd(focus, won);
    const y0 = won ? 600 : 470;
    items.forEach((t, i) => { const r = { x: W / 2 - 130, y: y0 + i * 60, w: 260, h: 48 }; if (pointIn(mouse, r)) { focus = i; if (mClicked) doEnd(i, won); } });
  }
  function doEnd(i, won) { AUDIO.sfx("confirm"); if (won) { AUDIO.music("menu"); setState("map"); } else { if (i === 0) retry(); else { AUDIO.music("menu"); setState("map"); } } }

  /* ============================================================
     RENDER
     ============================================================ */
  function render() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, W, H);
    const sh = OPT.shake ? shake : 0;
    const sx = sh ? rand(-sh, sh) : 0, sy = sh ? rand(-sh, sh) : 0;
    ctx.save(); ctx.translate(sx, sy);
    if (state === "title") drawTitle();
    else if (state === "slots") drawSlots();
    else if (state === "story") drawStory();
    else if (state === "talk") drawTalk();
    else if (state === "achievements") drawAchievements();
    else if (state === "options") drawOptions();
    else if (state === "keys") drawKeys();
    else if (state === "superart") drawSuperPick();
    else if (state === "gallery") drawGallery();
    else if (state === "code") drawCode();
    else if (state === "records") drawRecords();
    else if (state === "map") drawMap();
    else if (state === "shop") drawShop();
    else if (state === "diffselect") drawDiff();
    else {
      const flight = (curMode === "boss" && bossDef && bossDef.mode === "flight") || (curMode === "rng" && curLevel && curLevel.mode === "flight");
      if (flight) drawSky(cam.x, curMode === "rng" ? curLevel.theme : "sky");
      else if (curMode === "rng" && curLevel) drawRngBg(cam.x, curLevel.theme);
      ctx.save(); ctx.translate(-cam.x, 0);
      // capa de "juice" universal para jefes: temblor al golpe, respiración, tambaleo de muerte y pulso de impacto
      const juiceBoss = b => {
        const hb = b.getHitboxes && b.getHitboxes()[0];
        if (!hb) { b.draw(ctx); return; }
        const bx = hb.x + hb.w / 2, bcy = hb.y + hb.h / 2, rad = Math.max(hb.w, hb.h) * 0.72;
        ctx.save();
        if (b.flash > 0.02 && !b.dead) ctx.translate(rand(-2.5, 2.5), rand(-1.8, 1.8));
        let rot = 0, s = 1 + Math.sin(b.t * 2.1) * 0.012;   // respiración sutil
        // anticipación: se agazapa un pelín justo antes de cada ataque (telegrafía universal)
        const wind = !b.dead && b.atkT > 0 && b.atkT < 0.3 ? 1 - b.atkT / 0.3 : 0;
        if (wind > 0) s -= 0.05 * Math.sin(wind * Math.PI);
        if (b.dead) { rot = Math.sin(time * 13) * 0.055 * clamp(b.dying / 1.6, 0, 1); s = 1; }
        ctx.translate(bx, hb.y + hb.h); ctx.rotate(rot); ctx.scale(2 - s, s); ctx.translate(-bx, -(hb.y + hb.h));
        b.draw(ctx);
        ctx.restore();
        if (b.flash > 0) {
          ctx.save(); ctx.globalCompositeOperation = "lighter";
          const fg2 = ctx.createRadialGradient(bx, bcy, 8, bx, bcy, rad);
          fg2.addColorStop(0, `rgba(255,255,255,${clamp(b.flash * 6, 0, 0.45)})`); fg2.addColorStop(1, "rgba(255,255,255,0)");
          ctx.fillStyle = fg2; ctx.beginPath(); ctx.arc(bx, bcy, rad, 0, TAU); ctx.fill(); ctx.restore();
        }
      };
      if (flight) {
        if (curMode === "rng") { drawCoins(); drawEnemies(); ctx.fillStyle = "#1a120a"; for (let yy = 0; yy < H; yy += 30) { ctx.fillStyle = (Math.floor(yy / 30) % 2) ? "#fff" : "#1a120a"; ctx.fillRect(worldW - 30, yy, 30, 30); } }
        if (boss) juiceBoss(boss);
      } else if (curMode === "rng") { drawRngFg(curLevel); drawCoins(); drawEnemies(); }
      else { drawScene(bossDef); if (boss) { const hb = boss.getHitboxes()[0]; if (hb) { ctx.save(); ctx.fillStyle = "rgba(0,0,0,0.26)"; ctx.beginPath(); ctx.ellipse(hb.x + hb.w / 2, GROUND - 4, Math.max(40, hb.w * 0.52), 13, 0, 0, TAU); ctx.fill(); ctx.restore(); } juiceBoss(boss); } }
      if (boss && boss.shielded) { const hb = boss.getHitboxes()[0], bx = hb.x + hb.w / 2, by = hb.y + hb.h / 2, r = Math.max(hb.w, hb.h) * 0.75; ctx.save(); ctx.strokeStyle = `rgba(159,224,255,${0.5 + Math.sin(time * 8) * 0.25})`; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.stroke(); ctx.fillStyle = "rgba(159,224,255,0.10)"; ctx.beginPath(); ctx.arc(bx, by, r, 0, TAU); ctx.fill(); ctx.restore(); }
      drawHazards(); drawProjs();
      if (superArtFx) drawSuperArt();
      for (const p of players) if (!p.dead || p.y < H + 100) p.draw();
      // eco de tinta: tu clon retardado (RÉQUIEM II)
      if (echoT > 0) { const g = echoGhost(); if (g) {
        ctx.save(); ctx.globalAlpha = 0.7 + Math.sin(time * 9) * 0.12; ctx.lineJoin = "round";
        ctx.fillStyle = "#14101e"; ctx.strokeStyle = "#2e2648"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(g.x + 20, g.y + 18, 17, Math.PI, 0); ctx.lineTo(g.x + 37, g.y + 62); ctx.quadraticCurveTo(g.x + 20, g.y + 74, g.x + 3, g.y + 62); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.fillStyle = "#0a0714"; ctx.beginPath(); ctx.ellipse(g.x + 20, g.y + 14, 13, 5, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = "#ff4fa3"; ctx.beginPath(); ctx.arc(g.x + 13 + g.f * 4, g.y + 26, 3, 0, TAU); ctx.arc(g.x + 27 + g.f * 4, g.y + 26, 3, 0, TAU); ctx.fill();
        if (Math.random() < 0.3) parts.push({ x: g.x + 8 + Math.random() * 24, y: g.y + 66, vx: 0, vy: 1.4, grav: 0.06, life: 0.4, max: 0.4, r: 2.2, color: "#14101e", shape: "dot" });
        ctx.restore();
      } }
      drawBullets(); drawParts();
      // El Reverso: marea de tinta que sube + pista de gravedad invertida
      if (rev.inkY < GROUND - 2) {
        const iy = rev.inkY, ig = ctx.createLinearGradient(0, iy, 0, H); ig.addColorStop(0, "rgba(40,60,90,0.58)"); ig.addColorStop(1, "rgba(10,20,40,0.82)");
        ctx.fillStyle = ig; ctx.fillRect(cam.x - 20, iy, W + 40, H - iy);
        ctx.fillStyle = "rgba(180,220,255,0.5)"; for (let xx = cam.x; xx < cam.x + W; xx += 26) ctx.fillRect(xx, iy + Math.sin(time * 4 + xx * 0.05) * 3, 16, 3);
      }
      if (rev.grav < 0) { ctx.fillStyle = "rgba(150,180,255,0.07)"; ctx.fillRect(cam.x - 20, 0, W + 40, H); ctx.fillStyle = "rgba(190,224,255,0.55)"; for (let xx = cam.x + 30; xx < cam.x + W; xx += 90) { ctx.beginPath(); ctx.moveTo(xx, 94); ctx.lineTo(xx - 9, 82); ctx.lineTo(xx + 9, 82); ctx.closePath(); ctx.fill(); } }
      // RÉQUIEM IV: oscuridad total — solo el foco del jefe y tu propia luz alumbran
      if (bossDef && bossDef.code && boss && boss.phase === 4 && !boss.dead) {
        const holes = [];
        const hb = boss.getHitboxes()[0]; holes.push([hb.x + hb.w / 2, hb.y + hb.h / 2, 235]);
        for (const p of players) if (!p.dead && !p.ghost) holes.push([p.x + p.w / 2, p.y + p.h / 2, 165]);
        // cada nota/bala ARDE en la oscuridad: nunca esquivas a ciegas
        for (const o of projs) { if (holes.length > 42) break; holes.push([o.x, o.y, 46]); }
        for (const b2 of bullets) { if (holes.length > 54) break; holes.push([b2.x, b2.y, 34]); }
        ctx.save(); ctx.beginPath(); ctx.rect(cam.x - 20, -20, W + 40, H + 40);
        for (const h2 of holes) { ctx.moveTo(h2[0] + h2[2], h2[1]); ctx.arc(h2[0], h2[1], h2[2], 0, TAU); }
        ctx.fillStyle = "rgba(4,3,8,0.74)"; ctx.fill("evenodd");
        for (let k = 0; k < Math.min(3, holes.length); k++) { const h2 = holes[k]; const gr = ctx.createRadialGradient(h2[0], h2[1], h2[2] * 0.55, h2[0], h2[1], h2[2]); gr.addColorStop(0, "rgba(4,3,8,0)"); gr.addColorStop(1, "rgba(4,3,8,0.74)"); ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(h2[0], h2[1], h2[2], 0, TAU); ctx.fill(); }
        ctx.restore();
      }
      ctx.restore();
      vignetteAndGrain(); drawHUD();
      if (state === "intro") drawIntro();
      if (state === "rngintro") drawRngIntro();
      if (state === "paused") drawPause();
      if (state === "won") drawWon();
      if (state === "rngwon") drawRngWon();
      if (state === "lost") drawLost();
      if (state === "rushdone") drawRushDone();
    }
    if (flashScreen > 0) { ctx.fillStyle = `rgba(255,255,255,${clamp(flashScreen, 0, 0.6)})`; ctx.fillRect(-sx, -sy, W, H); }
    ctx.restore();
    // iris de cine que se ABRE al entrar en cada pantalla
    if (iris > 0) {
      const k = 1 - clamp(iris / IRIS_DUR, 0, 1), ir = 70 + Math.pow(k, 1.6) * 1480;
      const icx = irisCX, icy = irisCY;
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.arc(icx, icy, ir, 0, TAU);
      ctx.fillStyle = "#0a0710"; ctx.fill("evenodd");
      ctx.strokeStyle = "rgba(255,210,74,0.85)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(icx, icy, ir, 0, TAU); ctx.stroke();
      ctx.restore();
    }
    drawToasts();
    drawTouchControls();
    if (!touchOn && AUDIO.isMuted && AUDIO.isMuted()) { ctx.fillStyle = "#fff"; ctx.font = "12px Trebuchet MS"; ctx.textAlign = "right"; ctx.fillText("🔇 (M)", W - 14, H - 14); }
  }
  function drawDecoFrame() {
    ctx.save(); ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 4; ctx.strokeRect(22, 22, W - 44, H - 44);
    ctx.lineWidth = 1.5; ctx.strokeStyle = "rgba(255,210,74,0.5)"; ctx.strokeRect(30, 30, W - 60, H - 60);
    ctx.fillStyle = "#ffd24a"; for (const c of [[22, 22], [W - 22, 22], [22, H - 22], [W - 22, H - 22]]) { ctx.beginPath(); ctx.arc(c[0], c[1], 9, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  function drawTitle() {
    theaterBg("#3a2a5a");
    // rayos giratorios tras el cartel
    ctx.save(); ctx.translate(W / 2, 252); ctx.rotate(time * 0.15); ctx.globalAlpha = 0.16;
    for (let i = 0; i < 24; i++) { ctx.rotate(TAU / 24); ctx.fillStyle = i % 2 ? "#ffd24a" : "#ff7a3a"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-46, -760); ctx.lineTo(46, -760); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    // dos focos de teatro que barren el escenario
    ctx.save(); ctx.globalCompositeOperation = "lighter";
    for (const s of [[-1, 0.35], [1, 0.5]]) {
      const a = Math.sin(time * s[1]) * 0.42 + s[0] * 0.24;
      ctx.save(); ctx.translate(W / 2 + s[0] * 440, H + 40); ctx.rotate(a);
      const g = ctx.createLinearGradient(0, 0, 0, -860); g.addColorStop(0, "rgba(255,240,190,0.17)"); g.addColorStop(1, "rgba(255,240,190,0)");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-26, 0); ctx.lineTo(-100, -860); ctx.lineTo(100, -860); ctx.lineTo(26, 0); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
    floatingNotes(8);
    drawDecoFrame(); vignetteAndGrain();
    // cartel-marquesina con bombillas
    ctx.save(); ctx.translate(W / 2, 258);
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.6)"; ctx.shadowBlur = 28; ctx.shadowOffsetY = 12;
    ctx.fillStyle = "rgba(16,9,26,0.78)"; roundRect(-436, -140, 872, 250, 26); ctx.fill(); ctx.restore();
    ctx.strokeStyle = "#ffd24a"; ctx.lineWidth = 4; roundRect(-436, -140, 872, 250, 26); ctx.stroke();
    ctx.strokeStyle = "rgba(255,210,74,0.4)"; ctx.lineWidth = 1.5; roundRect(-414, -118, 828, 206, 18); ctx.stroke();
    marqueeBulbs(-436, -140, 872, 250);
    ctx.restore();
    // wordmark kinético: cada letra rebota y gira un pelín, con doble sombra + degradado dorado
    const drawWord = (txt, cy, top, bot, size) => {
      ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.font = `bold ${size}px Georgia`; ctx.lineJoin = "round";
      const widths = [...txt].map(chl => ctx.measureText(chl).width * 0.96);
      let x = W / 2 - widths.reduce((a, b) => a + b, 0) / 2;
      [...txt].forEach((chl, i) => {
        const lx = x + widths[i] / 2; x += widths[i];
        const ly = cy + Math.sin(time * 2.4 + i * 0.7) * 5;
        ctx.save(); ctx.translate(lx, ly); ctx.rotate(Math.sin(time * 2 + i * 0.9) * 0.05);
        ctx.fillStyle = "rgba(20,10,4,0.5)"; ctx.font = `bold ${size}px Georgia`; ctx.fillText(chl, 4, 6);   // sombra proyectada
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = size * 0.125; ctx.strokeText(chl, 0, 0);
        const lg = ctx.createLinearGradient(0, -size / 2, 0, size / 2); lg.addColorStop(0, top); lg.addColorStop(0.55, shade(top, 0.92)); lg.addColorStop(1, bot);
        ctx.fillStyle = lg; ctx.fillText(chl, 0, 0);
        ctx.restore();
      });
      ctx.restore();
    };
    drawWord("RAGTIME", 212, "#ffe9a0", "#ff9a3a", 100);
    drawWord("RUMBLE", 308, "#ffe07a", "#ff5a4a", 100);
    // destellos sobre el logo
    for (const s of [[-360, 152, 0], [368, 240, 1.4], [-180, 330, 2.6], [300, 148, 3.4]]) {
      const tw = Math.max(0, Math.sin(time * 2.2 + s[2]));
      if (tw > 0.5) { ctx.save(); ctx.translate(W / 2 + s[0], s[1]); ctx.rotate(time); ctx.globalAlpha = (tw - 0.5) * 2; ctx.fillStyle = "#fff"; star(0, 0, 4 + tw * 6, 4); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; }
    }
    bigText("· un brawl de tinta y jazz ·", W / 2, 356, 24, "#f3e3c0");
    // mascotas flanqueando el cartel
    drawMascot(120, 470, 0, 1);
    drawMascot(W - 120, 470, 1, -1);
    // llamada a la acción con pulso
    const pk = 1 + Math.sin(time * 4) * 0.035;
    ctx.save(); ctx.translate(W / 2, 442); ctx.scale(pk, pk);
    ctx.globalAlpha = 0.65 + Math.sin(time * 4) * 0.3;
    bigText("Pulsa Z / Ⓐ  o  haz clic para empezar", 0, 0, 29, "#fff"); ctx.restore(); ctx.globalAlpha = 1;
    // selector de jugadores (pastilla clicable)
    const tr = { x: W / 2 - 180, y: 478, w: 360, h: 36 }, trHov = pointIn(mouse, tr);
    ctx.fillStyle = trHov ? "rgba(255,210,74,0.2)" : "rgba(10,6,16,0.55)"; roundRect(tr.x, tr.y, tr.w, tr.h, 18); ctx.fill();
    ctx.strokeStyle = coop ? "#9fd0ff" : "#7af0a0"; ctx.lineWidth = 2.5; roundRect(tr.x, tr.y, tr.w, tr.h, 18); ctx.stroke();
    bigText(coop ? "▶ 2 JUGADORES  (toca para cambiar)" : "▶ 1 JUGADOR  (toca para cambiar)", W / 2, tr.y + 25, 17, coop ? "#9fd0ff" : "#7af0a0");
    // panel de controles
    ctx.fillStyle = "rgba(10,6,16,0.5)"; roundRect(W / 2 - 420, 526, 840, 66, 12); ctx.fill();
    ctx.strokeStyle = "rgba(255,210,74,0.3)"; ctx.lineWidth = 1.5; roundRect(W / 2 - 420, 526, 840, 66, 12); ctx.stroke();
    ctx.font = "14px Trebuchet MS"; ctx.fillStyle = "#e0d0b0"; ctx.textAlign = "center";
    ctx.fillText("Teclado:  Mover WASD/◀▶ · Saltar Z · DISPARAR X · Dash C · Especial V · Apuntado MAYÚS · Cambiar Q", W / 2, 552);
    ctx.fillText("Mando:  Saltar Ⓐ · DISPARAR Ⓧ · Dash Ⓑ · EX/Súper Ⓨ · Apuntado RT · Cambiar LB/RB", W / 2, 576);
    bigText("¿Primera vez? Entra en el nodo TUTORIAL de la isla", W / 2, 616, 15, "#7af0c0");
    ctx.font = "12px Trebuchet MS"; ctx.fillStyle = "#a89478"; ctx.textAlign = "center";
    ctx.fillText("5 mundos · 18 jefes (+2 secretos) · súper artes · boss rush · mausoleo · logros · co-op · todo 100% original", W / 2, 694);
    // botonera inferior
    const hr = { x: W / 2 - 344, y: 638, w: 212, h: 40 }, lr = { x: W / 2 - 106, y: 638, w: 212, h: 40 }, or = { x: W / 2 + 132, y: 638, w: 212, h: 40 };
    [[hr, "📖 Historia"], [lr, "🏆 Logros (Q)"], [or, "⚙ Opciones (⇧)"]].forEach(bt => {
      const r = bt[0], hov = pointIn(mouse, r);
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = hov ? 16 : 7; ctx.shadowOffsetY = 3;
      const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
      if (hov) { g.addColorStop(0, "#e2b449"); g.addColorStop(1, "#a87b1e"); } else { g.addColorStop(0, "#3a2c50"); g.addColorStop(1, "#241a34"); }
      ctx.fillStyle = g; roundRect(r.x, r.y, r.w, r.h, 11); ctx.fill(); ctx.restore();
      ctx.strokeStyle = hov ? "#ffe9a0" : "rgba(255,210,74,0.45)"; ctx.lineWidth = 2; roundRect(r.x, r.y, r.w, r.h, 11); ctx.stroke();
      bigText(bt[1], r.x + r.w / 2, r.y + 27, 16, hov ? "#1a120a" : "#f3e7cf");
    });
    // selector de TRAJE (esquina inferior izquierda): clic para cambiar
    {
      const skr = { x: 24, y: 630, w: 254, h: 50 }, hov = pointIn(mouse, skr);
      const sk = SKINS.find(s => s.id === OPT.skin && skinUnlocked(s)) || SKINS[0];
      const nOpen = SKINS.filter(skinUnlocked).length;
      ctx.save(); ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = hov ? 14 : 6; ctx.shadowOffsetY = 3;
      ctx.fillStyle = hov ? "rgba(255,210,74,0.18)" : "rgba(12,8,18,0.7)"; roundRect(skr.x, skr.y, skr.w, skr.h, 12); ctx.fill(); ctx.restore();
      ctx.strokeStyle = hov ? "#ffd24a" : "rgba(255,210,74,0.4)"; ctx.lineWidth = 2; roundRect(skr.x, skr.y, skr.w, skr.h, 12); ctx.stroke();
      // mini-taza con la paleta del traje actual
      ctx.save(); ctx.translate(skr.x + 28, skr.y + 27); ctx.lineJoin = "round";
      ctx.fillStyle = sk.pal.head; roundRect(-11, -13, 22, 25, 6); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = sk.pal.liquid; ctx.beginPath(); ctx.ellipse(0, -12, 8.5, 2.4, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = sk.pal.straw; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(4, -12); ctx.lineTo(7, -19); ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(-4, -3, 1.8, 0, TAU); ctx.arc(4, -3, 1.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(0, 2, 3, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.restore();
      ctx.textAlign = "left"; ctx.fillStyle = "#ffd24a"; ctx.font = "bold 14px Trebuchet MS"; ctx.fillText("👕 Traje: " + sk.name, skr.x + 52, skr.y + 21);
      ctx.fillStyle = "#b9a998"; ctx.font = "11px Trebuchet MS"; ctx.fillText(nOpen + "/" + SKINS.length + " · clic para cambiar · se ganan jugando", skr.x + 52, skr.y + 38);
    }
    ctx.textAlign = "right"; ctx.fillStyle = "#6a5a4a"; ctx.font = "12px Trebuchet MS"; ctx.fillText("v1.5.5", W - 16, H - 12); ctx.textAlign = "center";
  }
  function drawIntro() {
    ctx.fillStyle = "rgba(0,0,0,0.45)"; ctx.fillRect(0, 0, W, H);
    // barras de tinta diagonales que entran barriendo (transición de cine)
    const wk = clamp(stateT / 0.35, 0, 1), we = 1 - Math.pow(1 - wk, 3);
    ctx.save();
    ctx.fillStyle = "rgba(10,6,14,0.85)";
    ctx.beginPath(); ctx.moveTo(-W + we * W, 0); ctx.lineTo(-W + we * W + 160, 0); ctx.lineTo(-W + we * W + 60, H); ctx.lineTo(-W + we * W - 100, H); ctx.fill();
    ctx.beginPath(); ctx.moveTo(2 * W - we * W, H); ctx.lineTo(2 * W - we * W - 160, H); ctx.lineTo(2 * W - we * W - 60, 0); ctx.lineTo(2 * W - we * W + 100, 0); ctx.fill();
    ctx.restore();
    if (introStage === 0) {
      const k = clamp(stateT / 0.4, 0, 1);
      ctx.save(); ctx.translate(W / 2, H / 2 - 14); ctx.rotate(time * 0.1); ctx.globalAlpha = 0.13 * k;
      for (let i = 0; i < 20; i++) { ctx.rotate(TAU / 20); ctx.fillStyle = i % 2 ? bossDef.color : "#ffd24a"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-40, -720); ctx.lineTo(40, -720); ctx.closePath(); ctx.fill(); }
      ctx.restore(); ctx.globalAlpha = 1;
      ctx.save(); ctx.translate(W / 2, H / 2 - 20); ctx.scale(k, k);
      ctx.fillStyle = "rgba(14,8,18,0.72)"; roundRect(-388, -92, 776, 176, 18); ctx.fill();
      ctx.strokeStyle = bossDef.color; ctx.lineWidth = 4; roundRect(-388, -92, 776, 176, 18); ctx.stroke();
      ctx.strokeStyle = "rgba(255,210,74,0.4)"; ctx.lineWidth = 1.5; roundRect(-380, -84, 760, 160, 14); ctx.stroke();
      ctx.fillStyle = "#ffd24a"; for (const c of [[-372, -76], [372, -76], [-372, 68], [372, 68]]) { star(c[0], c[1], 5, 5); ctx.fill(); }
      bigText("UN NUEVO RIVAL", 0, -48, 34, "#ffd24a");
      bigText(bossDef.name, 0, 24, 60, "#fff"); ctx.restore();
      bigText(bossDef.subtitle, W / 2, H / 2 + 92, 22, "#f3e3c0");
    } else {
      const k = 1 + Math.sin(clamp(stateT / 1.1, 0, 1) * Math.PI) * 0.3; ctx.save(); ctx.translate(W / 2, H / 2); ctx.scale(k, k);
      bigText("¿LISTO?", 0, -30, 56, "#fff"); bigText("¡A PELEAR!", 0, 50, 72, "#ff6a4a"); ctx.restore();
    }
  }
  function drawPause() {
    ctx.fillStyle = "rgba(0,0,0,0.62)"; ctx.fillRect(0, 0, W, H);
    const pv = ctx.createRadialGradient(W / 2, H / 2, 200, W / 2, H / 2, 760); pv.addColorStop(0, "rgba(0,0,0,0)"); pv.addColorStop(1, "rgba(0,0,0,0.5)");
    ctx.fillStyle = pv; ctx.fillRect(0, 0, W, H);
    floatingNotes(5, "#9a8ac0");
    decoPanel(W / 2 - 190, 156, 380, 420);
    bigText("⏸", W / 2, 208, 30, "#caa");
    bigText("PAUSA", W / 2, 258, 56, "#ffd24a");
    ["Reanudar", "Opciones", "Reintentar", "Abandonar"].forEach((t, i) => drawButtonRect({ x: W / 2 - 130, y: 300 + i * 60, w: 260, h: 48 }, t, focus === i));
  }
  function drawWon() {
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
    // confeti cayendo
    const CONF = ["#ffd24a", "#ff6a4a", "#7af0a0", "#9fd0ff", "#ff8ac0"];
    for (let i = 0; i < 46; i++) {
      const sp = 55 + (i % 5) * 24, cxp = (i * 167 + 40) % W + Math.sin(time * 1.6 + i) * 26;
      const cyp = ((time * sp + i * 131) % (H + 80)) - 40;
      ctx.save(); ctx.translate(cxp, cyp); ctx.rotate(time * (2 + (i % 3)) + i);
      ctx.fillStyle = CONF[i % 5]; ctx.fillRect(-4.5, -2.5, 9, 5); ctx.restore();
    }
    const kk = 1 + Math.max(0, 0.35 - stateT) * 1.6;   // golpe de entrada
    ctx.save(); ctx.translate(W / 2, 118); ctx.scale(kk, kk); ctx.rotate(Math.sin(time * 3) * 0.02);
    bigText("¡K.O.!", 0, 12, 86, "#ffd24a"); ctx.restore();
    // tarjeta de resultados
    const cx = W / 2, cw = 560, cardX = cx - cw / 2, cardY = 170, ch = 360;
    ctx.fillStyle = "#f3e7cf"; roundRect(cardX, cardY, cw, ch, 14); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = "#1a120a"; ctx.fillRect(cardX, cardY, cw, 44);
    bigText("PARTE DE COMBATE", cx, cardY + 31, 22, "#ffd24a");
    // nota grande
    ctx.save(); ctx.translate(cardX + cw - 90, cardY + 130); const gp = 1 + Math.sin(time * 5) * 0.04; ctx.scale(gp, gp);
    const gcol = { S: "#ffd24a", A: "#7af0a0", B: "#62b0ff", C: "#c8b8a0", D: "#a08a70" }[winGrade] || "#fff";
    // laureles a los lados del sello
    ctx.strokeStyle = "#7a5a10"; ctx.fillStyle = "#c8a032"; ctx.lineWidth = 2;
    for (const s of [-1, 1]) {
      for (let l = 0; l < 6; l++) {
        const a = Math.PI / 2 + s * (0.5 + l * 0.32);
        const lx = Math.cos(a) * 66 * s * s, ly = Math.sin(a) * 66;
        ctx.save(); ctx.translate(s * Math.abs(lx), -ly + 40); ctx.rotate(s * (0.6 + l * 0.3));
        ctx.beginPath(); ctx.ellipse(0, 0, 11, 4.5, 0, 0, TAU); ctx.fill(); ctx.stroke(); ctx.restore();
      }
    }
    if (winGrade === "S") { ctx.save(); ctx.rotate(time * 1.2); ctx.globalAlpha = 0.35; for (let i = 0; i < 8; i++) { ctx.rotate(TAU / 8); ctx.fillStyle = "#ffe9a0"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-9, -86); ctx.lineTo(9, -86); ctx.closePath(); ctx.fill(); } ctx.restore(); ctx.globalAlpha = 1; }
    ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(0, 0, 56, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = gcol; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 49, 0, TAU); ctx.stroke();
    bigText(winGrade, 0, 26, 80, gcol); ctx.restore();
    bigText("NOTA", cardX + cw - 90, cardY + 210, 18, "#1a120a");
    // desglose de la nota + qué falta para la S
    const mh = playerMaxHp();
    const gHp = player.hp >= mh ? 2 : player.hp / mh >= 0.6 ? 1 : 0;
    const gPar = fightStats.parries >= 1 ? 1 : 0;
    const tlim = bossDef.id === "collector" ? 80 : 55;
    const gTm = fightStats.time <= tlim ? 1 : 0;
    const gDf = DIFF.key === "expert" ? 1 : DIFF.key === "simple" ? -1 : 0;
    const gx = cardX + cw - 90;
    ctx.textAlign = "center"; ctx.font = "bold 12px Trebuchet MS";
    [["Vida", gHp], ["Parry", gPar], ["Tiempo", gTm], ["Dif.", gDf]].forEach((p, i) => {
      ctx.fillStyle = p[1] > 0 ? "#2a7a3a" : p[1] < 0 ? "#a03020" : "#8a7a5a";
      ctx.fillText(p[0] + "  " + (p[1] >= 0 ? "+" : "") + p[1], gx, cardY + 232 + i * 17);
    });
    if (winGrade !== "S") {
      const miss = [];
      if (gDf < 1) miss.push("Experto"); if (gHp < 2) miss.push("sin daño"); if (!gPar) miss.push("1 parry"); if (!gTm) miss.push("≤" + tlim + "s");
      ctx.fillStyle = "#7a1420"; ctx.font = "italic 11px Trebuchet MS"; wrapC("Para S: " + miss.join(" · "), gx, cardY + 232 + 4 * 17 + 12, 170, 13);
    }
    const rows = [
      ["Rival", bossDef.name],
      ["Dificultad", DIFF.name],
      ["Tiempo", fightStats.time.toFixed(1) + " s"],
      ["Parrys", String(fightStats.parries)],
      ["Súper / EX usados", String(fightStats.supers)],
      ["¿Sin daño?", fightStats.hit ? "no" : "¡impecable!"],
    ];
    ctx.textAlign = "left"; ctx.font = "bold 20px Trebuchet MS";
    rows.forEach((r, i) => {
      const y = cardY + 88 + i * 36;
      ctx.fillStyle = "#5a4a2a"; ctx.fillText(r[0], cardX + 30, y);
      ctx.fillStyle = "#1a120a"; ctx.fillText(r[1], cardX + 250, y);
    });
    if (winDrop) bigText("🎁 ¡Nuevo botín del Reverso: " + winDrop + "!", cx, cardY + ch - 44, 16, "#7af0a0");
    const wb = bossesOf(bossDef.world);
    const justExpert = DIFF.key !== "simple" && expertUnlockedFor(bossDef.world) && bossDef.id === BOSSES[wb[wb.length - 1]].id;
    if (justExpert) bigText("¡EXPERTO DESBLOQUEADO EN ESTE MUNDO!", cx, cardY + ch - 16, 17, "#ff6a4a");
    else bigText("Las monedas se ganan en los run-n-gun (→)", cx, cardY + ch - 16, 15, "#5a4a2a");
    drawButtonRect({ x: cx - 130, y: 600, w: 260, h: 48 }, "Continuar", focus === 0);
  }
  function drawLost() {
    ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "rgba(90,10,20,0.14)"; ctx.fillRect(0, 0, W, H);
    // goterones de tinta cayendo desde arriba
    ctx.fillStyle = "rgba(10,6,14,0.9)";
    for (let i = 0; i < 9; i++) {
      const dx = 70 + i * (W - 140) / 8 + Math.sin(i * 3) * 30;
      const dl = 40 + ((stateT * (60 + i * 17)) % 260) + Math.sin(time + i) * 8;
      ctx.beginPath(); ctx.moveTo(dx - 9, 0); ctx.quadraticCurveTo(dx - 8, dl * 0.7, dx, dl);
      ctx.quadraticCurveTo(dx + 8, dl * 0.7, dx + 9, 0); ctx.fill();
      ctx.beginPath(); ctx.arc(dx, dl + 6, 4.5, 0, TAU); ctx.fill();
    }
    ctx.save(); ctx.translate(W / 2, 208); ctx.rotate(Math.sin(time * 1.6) * 0.02);
    bigText("HAS CAÍDO", 0, 0, 74, "#ff5a5a"); ctx.restore();
    bigText("Ni modo… ¡otra ronda!", W / 2, 262, 24, "#f3e3c0");
    // tarjeta estilo Cuphead: ¿cuánto le quedaba al jefe?
    if (curMode === "boss" && boss && bossDef) {
      const prog = clamp(1 - boss.hp / boss.maxHp, 0, 1);
      const k = clamp((stateT - 0.3) / 0.9, 0, 1), fillK = prog * (1 - Math.pow(1 - k, 3));   // la barra se rellena animada
      decoPanel(W / 2 - 300, 300, 600, 138, bossDef.color);
      bigText("¡ASÍ LO DEJASTE!", W / 2, 332, 22, "#ffd24a");
      const bx2 = W / 2 - 250, bw2 = 500, by2 = 350;
      ctx.fillStyle = "rgba(0,0,0,0.5)"; roundRect(bx2, by2, bw2, 18, 9); ctx.fill();
      const pg2 = ctx.createLinearGradient(bx2, 0, bx2 + bw2, 0); pg2.addColorStop(0, "#ff5a4a"); pg2.addColorStop(0.6, "#ff8a3a"); pg2.addColorStop(1, "#ffd24a");
      ctx.fillStyle = pg2; roundRect(bx2 + 2, by2 + 2, Math.max(4, (bw2 - 4) * fillK), 14, 7); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; roundRect(bx2, by2, bw2, 18, 9); ctx.stroke();
      // banderines de fase a lo largo del camino
      const total = boss.maxPhases || 2;
      for (let i = 1; i < total; i++) {
        const fx2 = bx2 + bw2 * (i / total), reached = boss.phase > i;
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(fx2, by2 - 12); ctx.lineTo(fx2, by2 + 4); ctx.stroke();
        ctx.fillStyle = reached ? "#7af0a0" : "#5a5060"; ctx.beginPath(); ctx.moveTo(fx2, by2 - 12); ctx.lineTo(fx2 + 12, by2 - 7); ctx.lineTo(fx2, by2 - 2); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      // calavera del jefe en la meta + marcador de taza donde te quedaste
      ctx.fillStyle = bossDef.color; ctx.beginPath(); ctx.arc(bx2 + bw2 + 20, by2 + 9, 13, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx2 + bw2 + 15, by2 + 6, 3.5, 0, TAU); ctx.arc(bx2 + bw2 + 25, by2 + 6, 3.5, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(bx2 + bw2 + 16, by2 + 7, 1.8, 0, TAU); ctx.arc(bx2 + bw2 + 26, by2 + 7, 1.8, 0, TAU); ctx.fill();
      const mkx = bx2 + 2 + (bw2 - 4) * fillK;
      ctx.save(); ctx.translate(mkx, by2 - 8 + Math.sin(time * 4) * 2); ctx.lineJoin = "round";
      ctx.fillStyle = "#f6ecd6"; roundRect(-8, -14, 16, 16, 5); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.fillStyle = "#8a2da0"; ctx.beginPath(); ctx.ellipse(0, -13, 6, 2, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(-3, -7, 1.6, 0, TAU); ctx.arc(3, -7, 1.6, 0, TAU); ctx.fill();
      ctx.restore();
      const pct = Math.round(prog * 100);
      ctx.fillStyle = "#f3e7cf"; ctx.font = "bold 16px Trebuchet MS"; ctx.textAlign = "center";
      ctx.fillText("Le quitaste el " + pct + "%  ·  fase " + boss.phase + "/" + total + (pct >= 85 ? "   ¡ESTUVO CERCA!" : pct >= 50 ? "   ¡ya casi!" : ""), W / 2, by2 + 52);
      ctx.fillStyle = "#b9a9c9"; ctx.font = "italic 12px Trebuchet MS";
      ctx.fillText(bossDef.name + " respira aliviado… por ahora.", W / 2, by2 + 74);
    }
    ["Reintentar", "A la isla"].forEach((t, i) => drawButtonRect({ x: W / 2 - 130, y: 470 + i * 60, w: 260, h: 48 }, t, focus === i));
  }
  const RUSH_NAME_BTN = { x: W / 2 - 160, y: 534, w: 320, h: 42 };
  function updateRushDone(dt, edge) {
    if (editingName) return;   // escribiendo tu nombre: la pantalla espera
    if (pendingLb && mClicked && pointIn(mouse, RUSH_NAME_BTN)) { editingName = true; nameBuffer = ""; AUDIO.sfx("select"); return; }
    if (edge && (tapped("confirm") || tapped("back") || tapped("pause") || mClicked)) {
      if (pendingLb) { lbPost(pendingLb); pendingLb = null; }   // sin firmar: publica como PIP para no perder el récord
      AUDIO.sfx("confirm"); AUDIO.music("menu"); setState("map");
    }
  }
  function drawRushDone() {
    ctx.fillStyle = "rgba(0,0,0,0.66)"; ctx.fillRect(0, 0, W, H);
    const win = rushResult === "win";
    if (win) {
      const CONF = ["#ffd24a", "#ff6a4a", "#7af0a0", "#9fd0ff"];
      for (let i = 0; i < 36; i++) { const sp = 60 + (i % 4) * 26, cxp = (i * 191 + 60) % W, cyp = ((time * sp + i * 149) % (H + 80)) - 40; ctx.save(); ctx.translate(cxp, cyp); ctx.rotate(time * 2 + i); ctx.fillStyle = CONF[i % 4]; ctx.fillRect(-4, -2, 8, 4); ctx.restore(); }
      // trofeo
      ctx.save(); ctx.translate(W / 2, 108); ctx.lineJoin = "round";
      ctx.fillStyle = "#ffd24a"; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.moveTo(-24, -28); ctx.lineTo(24, -28); ctx.lineTo(18, 6); ctx.quadraticCurveTo(0, 18, -18, 6); ctx.closePath(); ctx.fill(); ctx.stroke();
      for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(s * 27, -12, 9, s > 0 ? -0.8 : Math.PI - 0.8, s > 0 ? 1.5 : Math.PI + 1.5); ctx.stroke(); }
      ctx.fillRect(-7, 12, 14, 10); ctx.strokeRect(-7, 12, 14, 10);
      ctx.fillStyle = "#c8a032"; roundRect(-18, 22, 36, 9, 3); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    bigText(win ? "¡BOSS RUSH COMPLETO!" : "RUSH TERMINADO", W / 2, 180, win ? 58 : 52, win ? "#ffd24a" : "#ff7a6a");
    bigText(win ? "¡Venciste a los 15 jefes seguidos!" : ("Jefes vencidos: " + rushIdx + " / " + BOSSES.filter(b => b.world <= 4).length), W / 2, 248, 26, "#f3e7cf");
    const mins = Math.floor(rushTime / 60), secs = (rushTime % 60).toFixed(1);
    bigText("⏱ " + (mins > 0 ? mins + " m " : "") + secs + " s", W / 2, 312, 32, "#fff");
    const b = rushBest()[DIFF.key];
    if (win && rushRecord) bigText("★ ¡NUEVO RÉCORD! (" + DIFF.name + ")", W / 2, 362, 24, "#7af0a0");
    else if (b != null) bigText("Mejor (" + DIFF.name + "): " + b.toFixed(1) + " s", W / 2, 362, 20, "#caa");
    drawButtonRect({ x: W / 2 - 130, y: 470, w: 260, h: 48 }, "A la isla", true);
    // récord sin firmar: ¡ponle tu nombre antes de publicarlo al mundo!
    if (pendingLb) {
      const pu = 0.75 + Math.sin(time * 4) * 0.25;
      ctx.save(); ctx.globalAlpha = pu; drawButtonRect(RUSH_NAME_BTN, "✏️ FIRMAR MI RÉCORD", false); ctx.restore(); ctx.globalAlpha = 1;
      ctx.fillStyle = "#9fd0ff"; ctx.font = "italic 12px Trebuchet MS"; ctx.textAlign = "center";
      ctx.fillText("tu tiempo irá al TOP mundial — elige el nombre con el que aparecerá", W / 2, RUSH_NAME_BTN.y + RUSH_NAME_BTN.h + 16);
    }
    drawNameModal();
  }

  function drawRngIntro() {
    ctx.fillStyle = "rgba(0,0,0,0.4)"; ctx.fillRect(0, 0, W, H);
    // líneas de velocidad
    ctx.strokeStyle = "rgba(255,240,200,0.28)"; ctx.lineWidth = 3; ctx.lineCap = "round";
    for (let i = 0; i < 12; i++) {
      const ly = 90 + i * ((H - 160) / 11), lw2 = 60 + ((i * 77) % 130);
      const lx = ((time * (700 + (i % 4) * 160)) % (W + 400)) - 200;
      ctx.beginPath(); ctx.moveTo(lx, ly); ctx.lineTo(lx - lw2, ly); ctx.stroke();
    }
    const k = 1 + Math.sin(clamp(stateT / 1.2, 0, 1) * Math.PI) * 0.25;
    ctx.save(); ctx.translate(W / 2, H / 2 - 10); ctx.scale(k, k); ctx.rotate(-0.03);
    bigText(curLevel.mode === "flight" ? "¡A VOLAR!" : "¡A CORRER!", 0, 0, 70, "#ffd24a"); ctx.restore();
    bigText(curLevel.name + " — junta las 5 ◎ y llega a la meta", W / 2, H / 2 + 60, 22, "#f3e3c0");
  }
  function drawRngWon() {
    ctx.fillStyle = "rgba(0,0,0,0.55)"; ctx.fillRect(0, 0, W, H);
    bigText("¡NIVEL SUPERADO!", W / 2, 160, 64, "#ffd24a");
    const got = coins.filter(c => c.got).length;
    const cw = 520, cardX = W / 2 - cw / 2, cardY = 220, ch = 280;
    ctx.fillStyle = "#f3e7cf"; roundRect(cardX, cardY, cw, ch, 14); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
    ctx.fillStyle = "#1a120a"; ctx.fillRect(cardX, cardY, cw, 42); bigText("BOTÍN", W / 2, cardY + 30, 22, "#ffd24a");
    const rows = [["Nivel", curLevel.name], ["Monedas del nivel", got + " / 5  ◎"], ["Bonus por completar", "+" + rngBonus + "  ◎"], ["Tiempo", fightStats.time.toFixed(1) + " s"], ["Monedas totales", String(save.coins) + "  ◎"]];
    ctx.textAlign = "left"; ctx.font = "bold 20px Trebuchet MS";
    rows.forEach((r, i) => { const y = cardY + 84 + i * 36; ctx.fillStyle = "#5a4a2a"; ctx.fillText(r[0], cardX + 30, y); ctx.fillStyle = "#1a120a"; ctx.fillText(r[1], cardX + 300, y); });
    drawButtonRect({ x: W / 2 - 130, y: 560, w: 260, h: 48 }, "Continuar", true);
  }

  // arrancar
  // hook de solo lectura para pruebas automatizadas (inerte en el juego)
  window.__rr = { get state() { return state; }, get world() { return save.world; }, get coins() { return save.coins; }, get mode() { return curMode; }, progress: s => slotProgress(s), wtune: WTUNE, setAvatar: (x, y) => { avatar.x = x; avatar.y = y; }, achStatus: () => ACHIEVEMENTS.map(a => ({ id: a.id, got: achUnlocked(a) })), rush: () => ({ active: rushActive, idx: rushIdx }), killBoss: () => { if (boss) { boss.hp = 0; boss.dead = true; boss.dying = 0; } },
    fireSuperTest: art => { save.equipSuper = art; player.super = 500; player.inv = 0; player.shield = false; player.hp = 1; superArtFx = null; player.fireSuperArt(); return { beam: !!superArtFx, inv: player.inv, shield: !!player.shield, hp: player.hp }; },
    get coop() { return coop; }, inp: i => Object.assign({}, IN[i].now),
    parryTest: () => { player.super = 0; projs.length = 0; projs.push({ x: player.x + player.w / 2, y: player.y + player.h / 2, r: 14, parry: true, dead: false, hp: 0 }); player.tryParry(); return { combo: player.pCombo, gain: player.super }; },
    hurtTest: () => { player.inv = 0; player.shield = false; player.hp = 3; player.hurt(); return player.pCombo; },
    exDamage: wid => { save.equipW = [wid, null]; player.weaponIdx = 0; player.super = 100; bullets.length = 0; player.aimX = 1; player.aimY = 0; player.x = 200; player.y = GROUND - player.h; player.fireEX(); let t = 0; for (const b of bullets) t += b.dmg; return t; },
    // daño EFECTIVO de una EX: la dispara contra un jefe sintético y suma el daño real (incluye re-impactos de pierce/homing) durante 'secs'
    exEffective: (wid, secs) => { const saved = boss; let dealt = 0; boss = { dead: false, dying: 0, getHitboxes: () => [{ x: 600, y: GROUND - 200, w: 160, h: 200 }], hit: d => { dealt += d; } }; bullets.length = 0; projs.length = 0; save.equipW = [wid, null]; player.weaponIdx = 0; player.super = 100; player.x = 420; player.y = GROUND - player.h; player.facing = 1; player.aimX = 1; player.aimY = 0; player.fireEX(); const dt = 1 / 60, n = Math.round((secs || 4) * 60); for (let i = 0; i < n; i++) updateBullets(dt); boss = saved; return dealt; },
    rngTypes: theme => { const lvl = RNG_LEVELS.find(l => l.theme === theme && l.mode !== "flight") || RNG_LEVELS[0]; buildRng(lvl, 12345); return { enemies: [...new Set(enemies.map(e => e.type))], platforms: platforms.length, coins: coins.length }; },
    // amuleto Dios: al llegar a los 8 s, el update real del jugador debe darle ~2 s de invencibilidad
    godTest: () => { save.equipC = "god"; player.dead = false; player.ghost = 0; player.flight = false; player.slowT = 0; player.inv = 0; player.godInv = 0; player.godT = 7.85; player.x = 300; player.y = GROUND - player.h; for (let i = 0; i < 12; i++) player.update(1 / 60, false); save.equipC = null; return { inv: +player.inv.toFixed(2), godInv: +player.godInv.toFixed(2) }; } };
  requestAnimationFrame(frame);
})();
