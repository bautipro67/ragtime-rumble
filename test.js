/* ============================================================
   RAGTIME RUMBLE — Suite de pruebas automatizada
   Uso:  node test.js
   Simula DOM + Canvas2D + WebAudio + Gamepad y ejecuta de verdad
   el juego (menús, tienda, los 12 jefes, los 8 run-n-gun, 1 y 2
   jugadores, economía, desbloqueo de mundos y táctil) comprobando
   que no haya errores y que el comportamiento sea el esperado.
   ============================================================ */
"use strict";
const path = require("path");
const noop = () => {};
const DIR = __dirname;

let pass = 0, fail = 0; const fails = [];
function ok(cond, msg) { if (cond) { pass++; } else { fail++; fails.push(msg); console.log("   ✗ " + msg); } }
function section(t) { console.log("\n== " + t + " =="); }

/* ---------------- entorno simulado ---------------- */
let perf = 1, listeners = {}, raf = null, pad = null, store = {};
function makeCtx() {
  return new Proxy({}, { get(t, p) {
    if (p in t) return t[p];
    if (p === "measureText") return () => ({ width: 42 });
    if (p === "createLinearGradient" || p === "createRadialGradient") return () => ({ addColorStop: noop });
    return noop;
  }, set(t, p, v) { t[p] = v; return true; } });
}
const param = () => ({ value: 0, setValueAtTime: noop, exponentialRampToValueAtTime: noop, linearRampToValueAtTime: noop, setTargetAtTime: noop });
function makeAudioCtx() { return {
  get currentTime() { return perf; }, state: "running", sampleRate: 44100, destination: {}, resume: noop,
  createGain: () => ({ gain: param(), connect: noop }),
  createOscillator: () => ({ type: "sine", frequency: param(), detune: param(), connect: noop, start: noop, stop: noop }),
  createBufferSource: () => ({ buffer: null, playbackRate: param(), connect: noop, start: noop, stop: noop }),
  createBiquadFilter: () => ({ type: "lowpass", frequency: param(), Q: param(), connect: noop }),
  createDynamicsCompressor: () => ({ threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), connect: noop }),
  createBuffer: (c, l) => ({ getChannelData: () => new Float32Array(l) }),
}; }
function makePad() { return { connected: true, index: 0, buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0], vibrationActuator: { playEffect: () => Promise.resolve() } }; }
const ctx = makeCtx();
const canvas = { width: 1280, height: 720, getContext: () => ctx, addEventListener: (t, h) => (listeners[t] = listeners[t] || []).push(h), getBoundingClientRect: () => ({ left: 0, top: 0, width: 1280, height: 720 }), requestFullscreen: noop };
global.window = global;
global.document = { getElementById: () => canvas, addEventListener: (t, h) => (listeners[t] = listeners[t] || []).push(h), fullscreenElement: null, exitFullscreen: noop };
global.AudioContext = makeAudioCtx; global.webkitAudioContext = makeAudioCtx;
global.performance = { now: () => perf * 1000 };
global.requestAnimationFrame = cb => { raf = cb; return 1; };
function defaultSave(over) {
  return Object.assign({ coins: 999, ownedW: ["pea", "spread", "chaser", "charge", "lobber", "boomerang", "ray", "wave", "needle", "comet"], ownedC: ["heart", "twin", "coffee", "smoke", "whet", "magnet", "shield", "spring", "feather", "hourglass"], equipW: ["pea", "spread"], equipC: "heart", defeated: [], beatenNormal: [], grades: {}, collectedCoins: {}, rngDone: {}, difficulty: "regular", world: 1, coop: false, seenIntro: true, seenWorld: { 2: true, 3: true, 4: true }, finished: false }, over || {});
}
function installGlobals(save, withPad) {
  listeners = {};
  global.addEventListener = (t, h) => (listeners[t] = listeners[t] || []).push(h);
  pad = withPad ? makePad() : null;
  Object.defineProperty(global, "navigator", { value: { getGamepads: () => (pad ? [pad] : []), maxTouchPoints: withPad ? 0 : 5 }, configurable: true });
  store = { ["ragtime_slot_0"]: JSON.stringify(save) };
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
}
function loadAll() { for (const f of ["audio.js", "bosses.js", "game.js"]) { delete require.cache[require.resolve(path.join(DIR, f))]; require(path.join(DIR, f)); } }
function getSlot(i) { const v = store["ragtime_slot_" + i]; return v ? JSON.parse(v) : null; }
function getSave() { return getSlot(0); }

function dispatch(t, e) { (listeners[t] || []).forEach(h => h(e)); }
const kd = c => dispatch("keydown", { code: c, repeat: false, preventDefault: noop });
const ku = c => dispatch("keyup", { code: c });
const click = (x, y) => dispatch("mousedown", { clientX: x, clientY: y });
const ptr = (type, id, x, y) => dispatch(type, { pointerType: "touch", pointerId: id, clientX: x, clientY: y, preventDefault: noop });
function step(n = 1) { for (let i = 0; i < n; i++) { perf += 0.1; raf(perf * 1000); } }
// título -> selección de ranura -> elegir ranura 1 (centro 300,360). Si la partida es nueva queda en el prólogo.
function boot() { step(5); click(640, 400); step(3); click(300, 360); step(3); }
// acercarse a un NPC del mapa y hablar hasta agotar el diálogo (vuelve al mapa)
function talkTo(x, y) {
  global.__rr.setAvatar(x, y - 30); step(1);
  kd("KeyZ"); step(2); ku("KeyZ"); step(2);
  for (let i = 0; i < 14 && global.__rr.state === "talk"; i++) { kd("KeyZ"); step(2); ku("KeyZ"); step(2); }
}

const KEYS = ["KeyA", "KeyD", "ArrowUp", "ArrowDown", "KeyZ", "KeyC", "KeyV", "KeyQ", "KeyJ", "KeyL", "KeyI", "KeyK", "KeyU", "KeyO", "KeyP", "KeyM"];
function fuzz(frames) {
  kd("KeyX"); kd("KeyO");
  for (let i = 0; i < frames; i++) {
    if (Math.random() < 0.28) kd(KEYS[(Math.random() * KEYS.length) | 0]);
    if (Math.random() < 0.28) ku(KEYS[(Math.random() * KEYS.length) | 0]);
    if (Math.random() < 0.1) ku("KeyX"); else kd("KeyX");
    step(1);
  }
  KEYS.concat(["KeyX", "KeyO"]).forEach(ku);
}
function goMap() { // vuelve al mapa de forma fiable (despacha cartelas, cierra pausa/fin)
  for (let k = 0; k < 18 && global.__rr && global.__rr.state !== "map"; k++) {
    if (global.__rr.state === "story") { kd("KeyZ"); step(2); ku("KeyZ"); step(2); continue; }   // cartela de mundo -> Z
    kd("Escape"); step(2); ku("Escape"); step(1);   // mantener Esc un frame para que abra la pausa
    click(640, 504); step(1); click(640, 554); step(1); click(640, 624); step(1); click(640, 584); step(1);
    step(8);
  }
  step(2);
}
const leave = goMap;
function travelTo(x, y, wn) { for (let k = 0; k < 8 && getSave().world !== wn; k++) { goMap(); click(x, y); step(4); } }
function fightAt(x, y, diffx, frames) { goMap(); click(x, y); step(2); click(diffx, 410); step(1); step(40); fuzz(frames); leave(); }
function rngAt(x, y, frames) { goMap(); click(x, y); step(2); step(16); fuzz(frames); leave(); }

/* ============================================================
   PARTE 1 — Registros y cada jefe por separado
   ============================================================ */
function part1_registriesAndBosses() {
  section("Parte 1 · Registros y jefes");
  installGlobals(defaultSave(), false); loadAll();
  const B = global.BOSSES;
  ok(Array.isArray(B) && B.length === 18, "BOSSES tiene 18 jefes (15 + 3 del Reverso) (hay " + (B ? B.length : "?") + ")");
  const w = n => B.filter(b => b.world === n).length;
  ok(w(1) === 6 && w(2) === 3 && w(3) === 3 && w(4) === 3 && w(5) === 3, "reparto por mundo 6/3/3/3/3 (" + w(1) + "/" + w(2) + "/" + w(3) + "/" + w(4) + "/" + w(5) + ")");
  ok(B.filter(b => b.mode === "flight").length >= 2, "hay jefes de vuelo (" + B.filter(b => b.mode === "flight").length + ")");
  const ids = new Set(B.map(b => b.id));
  ok(ids.size === 18, "todos los id de jefe son únicos");

  const stubCtx = makeCtx();
  function stubG() {
    const P = [], H = [];
    return {
      W: 1280, H: 720, groundY: 624, player: { x: 220, y: 540, w: 40, h: 72 },
      diff: { atk: 1, hp: 1, tele: 1, dmgTo: 1, key: "regular" },
      rand: (a, b) => a + Math.random() * (b - a), randi: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), pick: a => a[(Math.random() * a.length) | 0],
      sfx: noop, shake: noop, floatText: noop, burst: noop,
      spawnProj: o => P.push(o), spawnHazard: o => H.push(o), _p: P, _h: H,
    };
  }
  for (const def of B) {
    try {
      const G = stubG(); const b = def.make(G);
      const hb = b.getHitboxes();
      ok(Array.isArray(hb) && hb.length > 0 && typeof hb[0].x === "number", def.id + ": getHitboxes válido");
      ok(b.maxHp > 0 && b.hp === b.maxHp, def.id + ": vida inicial > 0");
      let threw = null;
      for (let i = 0; i < 700; i++) { b.update(1 / 60); if (i % 40 === 0) b.draw(stubCtx); }
      b.draw(stubCtx);
      ok(G._p.length + G._h.length > 0, def.id + ": genera ataques");
      // muere al perder toda la vida
      b.hp = 1; b.shielded = false; b.hit(99999);
      ok(b.dead === true, def.id + ": muere al agotar la vida");
      for (let i = 0; i < 120; i++) b.update(1 / 60); // animación de K.O. sin errores
      ok(true, def.id + ": K.O. sin errores"); void threw;
    } catch (e) { ok(false, def.id + ": EXCEPCIÓN " + (e && e.message)); }
  }
}

/* ============================================================
   PARTE 2 — Armas y amuletos (registro + disparo real)
   ============================================================ */
function part2_weaponsCharms() {
  section("Parte 2 · Armas y amuletos");
  installGlobals(defaultSave({ defeated: ["collector", "croupier"] }), false); loadAll();
  const weapons = ["pea", "spread", "chaser", "charge", "lobber", "boomerang", "ray", "wave", "needle", "comet"];
  const charms = ["heart", "twin", "coffee", "smoke", "whet", "magnet", "shield", "spring", "feather", "hourglass"];
  for (const wp of weapons) {
    try {
      installGlobals(defaultSave({ equipW: [wp, null], equipC: "heart" }), false); loadAll();
      boot();            // -> mapa
      click(360, 470); step(2); click(640, 410); step(1); step(40); // jefe Esporo (normal)
      kd("KeyX"); for (let i = 0; i < 80; i++) { if (i % 15 === 0) kd("KeyV"); step(1); if (i % 15 === 2) ku("KeyV"); } ku("KeyX");
      leave();
      ok(true, "arma '" + wp + "' dispara y EX sin errores");
    } catch (e) { ok(false, "arma '" + wp + "': EXCEPCIÓN " + (e && e.message)); }
  }
  for (const ch of charms) {
    try {
      installGlobals(defaultSave({ equipW: ["pea", null], equipC: ch }), false); loadAll();
      boot();
      click(360, 470); step(2); click(640, 410); step(1); step(40); fuzz(70); leave();
      ok(true, "amuleto '" + ch + "' equipado sin errores");
    } catch (e) { ok(false, "amuleto '" + ch + "': EXCEPCIÓN " + (e && e.message)); }
  }
}

/* ============================================================
   PARTE 3 — Recorrido completo 1 jugador (3 mundos)
   ============================================================ */
function part3_fullSolo() {
  section("Parte 3 · Recorrido completo (1 jugador, 15 jefes + 9 run-n-gun)");
  const allBosses = ["spore", "pirate", "robot", "moth", "jester", "collector", "airship", "ice", "croupier", "puppeteer", "chimera", "director", "sentinel", "pen", "author"];
  try {
    installGlobals(defaultSave({ defeated: allBosses.slice(), beatenNormal: allBosses.slice(), equipW: ["needle", "comet"], equipC: "smoke" }), false); loadAll();
    boot();
    // tutorial
    click(150, 400); step(2); step(16); fuzz(120); leave();
    // Mundo 1: 6 jefes + 3 run-n-gun
    fightAt(360, 470, 640, 70); fightAt(560, 470, 640, 70); fightAt(700, 360, 640, 70);
    fightAt(950, 360, 640, 70); fightAt(1055, 455, 640, 70); fightAt(1115, 250, 640, 70);
    rngAt(470, 345, 120); rngAt(820, 475, 120); rngAt(640, 245, 120);
    travelTo(1190, 560, 2); ok(getSave().world === 2, "viaje a Mundo 2");
    // Mundo 2: 3 jefes (incl. vuelo) + 3 run-n-gun
    fightAt(440, 300, 320, 80); fightAt(740, 470, 640, 70); fightAt(1060, 300, 960, 80);
    rngAt(580, 200, 130); rngAt(900, 320, 120); rngAt(1150, 490, 120);
    travelTo(1200, 150, 3); ok(getSave().world === 3, "viaje a Mundo 3");
    // Mundo 3: 3 jefes + 2 run-n-gun
    fightAt(470, 300, 640, 80); fightAt(790, 360, 960, 80); fightAt(1100, 320, 640, 90);
    rngAt(630, 470, 120); rngAt(950, 230, 130);
    travelTo(1190, 150, 4); ok(getSave().world === 4, "viaje al Mundo final (4)");
    // Mundo 4: 3 jefes finales + 1 run-n-gun (se abandonan, no se mata al Autor)
    fightAt(470, 330, 640, 90); fightAt(820, 300, 320, 90); fightAt(1080, 330, 640, 100);
    rngAt(640, 480, 130);
    ok(true, "recorrido solo (4 mundos) completado sin excepciones");
  } catch (e) { ok(false, "recorrido solo: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 4 — Co-op 2 jugadores
   ============================================================ */
function part4_coop() {
  section("Parte 4 · Co-op (2 jugadores)");
  const allBosses = ["spore", "pirate", "robot", "moth", "jester", "collector", "airship", "ice", "croupier", "puppeteer", "chimera", "director", "sentinel", "pen", "author"];
  try {
    installGlobals(defaultSave({ defeated: allBosses.slice(), beatenNormal: allBosses.slice(), equipW: ["charge", "lobber"], equipC: "twin" }), false);
    store["ragtime_opts"] = JSON.stringify({ coop: true }); loadAll();
    boot();
    ok(global.__rr.coop === true, "co-op activado desde opciones (OPT.coop)");
    fightAt(360, 470, 640, 120);                 // jefe M1 con 2 jugadores (fuzz mueve a ambos)
    rngAt(470, 345, 150);                          // run-n-gun co-op
    travelTo(1190, 560, 2); travelTo(1200, 150, 3); travelTo(1190, 150, 4);
    ok(getSave().world === 4, "co-op: viaje encadenado al Mundo final (4)");
    fightAt(470, 330, 640, 120);                  // Centinela (escudo), 2 jugadores
    fightAt(820, 300, 320, 120);                  // Pluma Errante (vuelo), 2 jugadores
    ok(true, "co-op completado sin excepciones");
  } catch (e) { ok(false, "co-op: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 5 — Economía y flujo de victoria
   ============================================================ */
function part5_economy() {
  section("Parte 5 · Economía (monedas solo en run-n-gun) y victoria");
  try {
    installGlobals(defaultSave({ coins: 0, defeated: [], beatenNormal: [], equipW: ["needle", null], equipC: "twin", difficulty: "simple" }), false); loadAll();
    boot();
    // pelea contra Esporo disparando recto (sin moverse) -> debe poder ganarse
    click(360, 470); step(2); click(320, 410); step(1); step(40);
    kd("KeyX");
    for (let i = 0; i < 300; i++) { if (i % 22 === 0) kd("KeyZ"); if (i % 22 === 1) ku("KeyZ"); step(1); }
    ku("KeyX");
    click(640, 624); step(3);                      // "Continuar" de la victoria
    const sv = getSave();
    ok(sv.defeated.includes("spore"), "se puede vencer a un jefe (Esporo derrotado)");
    ok(sv.coins === 0, "los JEFES no dan monedas (coins=" + sv.coins + ")");
    ok(sv.grades.spore, "se guarda una nota del combate (" + sv.grades.spore + ")");
  } catch (e) { ok(false, "economía (jefe): EXCEPCIÓN " + (e && e.stack || e)); }
  // RUN-N-GUN debe dar monedas (carga limpia + Bomba de Humo para avanzar vivo)
  try {
    installGlobals(defaultSave({ coins: 0, defeated: [], beatenNormal: [], equipW: ["pea", null], equipC: "smoke" }), false); loadAll();
    boot();
    const before = getSave().coins;
    click(470, 345); step(2); step(16);            // forest run-n-gun
    kd("KeyX"); kd("KeyD");
    for (let i = 0; i < 420; i++) { if (i % 10 === 0) kd("KeyC"); if (i % 10 === 3) ku("KeyC"); step(1); }  // dash + avanzar a la meta
    ku("KeyX"); ku("KeyD"); ku("KeyC");
    click(640, 584); step(3);
    const after = getSave().coins;
    ok(after > before, "los RUN-N-GUN sí dan monedas (" + before + " -> " + after + ")");
  } catch (e) { ok(false, "economía (run-n-gun): EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 6 — Desbloqueo de mundos (puertas)
   ============================================================ */
function part6_gating() {
  section("Parte 6 · Desbloqueo de mundos");
  try {
    installGlobals(defaultSave({ defeated: [] }), false); loadAll();
    boot();
    click(1190, 560); step(3);
    ok(getSave().world === 1, "Mundo 2 BLOQUEADO sin vencer al Coleccionista");
  } catch (e) { ok(false, "gating M2: EXCEPCIÓN " + (e && e.message)); }
  try {
    installGlobals(defaultSave({ defeated: ["spore", "pirate", "robot", "moth", "jester", "collector"] }), false); loadAll();
    boot();
    click(1190, 560); step(3);
    ok(getSave().world === 2, "Mundo 2 SE ABRE tras vencer al Coleccionista");
    click(1200, 150); step(3);
    ok(getSave().world === 2, "Mundo 3 BLOQUEADO sin vencer al Crupier");
  } catch (e) { ok(false, "gating M3: EXCEPCIÓN " + (e && e.message)); }
}

/* ============================================================
   PARTE 7 — Mando y táctil
   ============================================================ */
function part7_padTouch() {
  section("Parte 7 · Mando y táctil");
  // mando
  try {
    installGlobals(defaultSave({ defeated: ["collector", "croupier"] }), true); loadAll();
    boot();
    click(360, 470); step(2); click(640, 410); step(1); step(40);
    for (let i = 0; i < 90; i++) { for (const b of pad.buttons) { b.pressed = Math.random() < 0.25; b.value = b.pressed ? 1 : 0; } pad.buttons[2].pressed = true; pad.axes[0] = Math.sin(i * 0.3); pad.axes[1] = Math.cos(i * 0.2); step(1); }
    for (const b of pad.buttons) { b.pressed = false; b.value = 0; } pad.axes[0] = pad.axes[1] = 0;
    leave();
    ok(true, "mando: combate sin errores");
  } catch (e) { ok(false, "mando: EXCEPCIÓN " + (e && e.message)); }
  // táctil
  try {
    installGlobals(defaultSave({ defeated: ["collector", "croupier"] }), false); loadAll();
    step(5); ptr("pointerdown", 1, 640, 400); ptr("pointerup", 1, 640, 400); step(3);  // tocar para empezar -> ranuras
    ptr("pointerdown", 1, 300, 360); ptr("pointerup", 1, 300, 360); step(3);            // tocar ranura 1
    ptr("pointerdown", 2, 360, 470); ptr("pointerup", 2, 360, 470); step(2);            // tocar jefe
    ptr("pointerdown", 3, 640, 410); ptr("pointerup", 3, 640, 410); step(1); step(40);  // dificultad
    ptr("pointerdown", 5, 104, 300); ptr("pointerup", 5, 104, 300); step(2);            // botón FIJAR (antes lo tapaba el stick)
    ok(global.__rr.inp(0).lock === true, "el botón FIJAR es alcanzable y activa el apuntado");
    ptr("pointerdown", 10, 1045, 575);  // mantener disparo
    ptr("pointerdown", 11, 200, 560);   // joystick
    for (let i = 0; i < 80; i++) { ptr("pointermove", 11, 170 + Math.cos(i * 0.3) * 70, 558 + Math.sin(i * 0.4) * 60); if (i % 20 === 0) { ptr("pointerdown", 12, 1170, 612); ptr("pointerup", 12, 1170, 612); } step(1); }
    ptr("pointerup", 10, 0, 0); ptr("pointerup", 11, 0, 0);
    leave();
    ok(true, "táctil: joystick + botones sin errores");
  } catch (e) { ok(false, "táctil: EXCEPCIÓN " + (e && e.message)); }
}

/* ============================================================
   PARTE 8 — Sanidad de balance (tiempos de combate razonables)
   ============================================================ */
function part8_balance() {
  section("Parte 8 · Sanidad de balance");
  installGlobals(defaultSave(), false); loadAll();
  const B = global.BOSSES;
  // estima TTK con ~50 dps base por dificultad Normal (hp*1.0)
  const dps = 50;
  for (const w of [1, 2, 3, 4]) {
    const hps = B.filter(b => b.world === w).map(b => b.make({ W: 1280, H: 720, groundY: 624, player: { x: 0, y: 0, w: 1, h: 1 }, diff: { atk: 1 }, rand: () => 0, randi: () => 0, pick: a => a[0], sfx: noop, shake: noop, spawnProj: noop, spawnHazard: noop, burst: noop, floatText: noop }).maxHp);
    const ttk = hps.map(h => h / dps);
    const okRange = ttk.every(t => t >= 8 && t <= 50);
    ok(okRange, "Mundo " + w + ": TTK a 50 dps en 8-50 s (" + ttk.map(t => t.toFixed(0)).join(", ") + ")");
  }
}

/* ============================================================
   PARTE 9 — Historia (prólogo, botón y final)
   ============================================================ */
function part9_story() {
  section("Parte 9 · Historia");
  try {
    installGlobals(defaultSave({ seenIntro: false }), false); loadAll();
    boot();                 // empezar -> prólogo la primera vez
    ok(global.__rr.state === "story", "el prólogo aparece al empezar por primera vez");
    for (let i = 0; i < 8 && global.__rr.state === "story"; i++) { kd("KeyZ"); step(2); ku("KeyZ"); step(2); }
    ok(global.__rr.state === "map", "tras el prólogo se entra al mapa");
    ok(getSave().seenIntro === true, "el prólogo no se repite (seenIntro=true)");
  } catch (e) { ok(false, "prólogo: EXCEPCIÓN " + (e && e.stack || e)); }
  try {
    installGlobals(defaultSave(), false); loadAll();
    step(5); click(478, 646); step(3);                 // botón "📖 Historia" (mitad izquierda)
    ok(global.__rr.state === "story", "el botón de historia abre las cartelas");
    for (let i = 0; i < 8 && global.__rr.state === "story"; i++) { kd("KeyZ"); step(2); ku("KeyZ"); step(2); }
    ok(global.__rr.state === "title", "la historia vuelve al título al terminar");
  } catch (e) { ok(false, "botón historia: EXCEPCIÓN " + (e && e.stack || e)); }
  // cartela de mundo al viajar por primera vez
  try {
    installGlobals(defaultSave({ defeated: ["collector"], seenWorld: {} }), false); loadAll();
    boot();
    travelTo(1190, 560, 2);
    ok(getSave().seenWorld && getSave().seenWorld[2] === true, "se marca la cartela del Mundo 2 al viajar");
  } catch (e) { ok(false, "cartela de mundo: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 10 — Ranuras de partida (3 slots, estilo Cuphead)
   ============================================================ */
function part10_slots() {
  section("Parte 10 · Ranuras de partida");
  // (a) la selección aparece al pulsar jugar; elegir una ranura con datos continúa
  try {
    installGlobals(defaultSave({ world: 3, defeated: ["spore", "collector", "croupier"], coins: 123 }), false); loadAll();
    step(5); click(640, 400); step(3);
    ok(global.__rr.state === "slots", "al pulsar JUGAR aparece la selección de ranura");
    click(300, 360); step(3);                       // elegir ranura 1 (con datos -> continúa)
    ok(global.__rr.state === "map", "elegir una ranura con partida continúa al mapa");
    ok(getSave().world === 3, "carga el progreso guardado de esa ranura");
  } catch (e) { ok(false, "ranura con datos: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) elegir una ranura vacía inicia partida nueva (con prólogo)
  try {
    installGlobals(defaultSave(), false); delete store["ragtime_slot_0"]; loadAll();
    step(5); click(640, 400); step(3);
    click(630, 360); step(3);                       // ranura 2 (vacía) -> partida nueva
    for (let i = 0; i < 8 && global.__rr.state === "story"; i++) { kd("KeyZ"); step(2); ku("KeyZ"); step(2); }
    ok(global.__rr.state === "map", "elegir una ranura vacía inicia partida nueva");
    ok(getSlot(1) && getSlot(1).world === 1, "la partida nueva arranca en el Mundo 1 y se guarda en su ranura");
  } catch (e) { ok(false, "ranura vacía: EXCEPCIÓN " + (e && e.stack || e)); }
  // (c) cada ranura es independiente (jugar en la 1 no toca la 2 ni la 3)
  try {
    installGlobals(defaultSave(), false); delete store["ragtime_slot_0"]; loadAll();
    step(5); click(640, 400); step(3); click(300, 360); step(3);
    for (let i = 0; i < 8 && global.__rr.state === "story"; i++) { kd("KeyZ"); step(2); ku("KeyZ"); step(2); }
    ok(getSlot(0) && getSlot(0).world === 1, "se escribe la ranura elegida (1)");
    ok(getSlot(1) === null && getSlot(2) === null, "las otras ranuras siguen vacías");
  } catch (e) { ok(false, "ranuras independientes: EXCEPCIÓN " + (e && e.stack || e)); }
  // (d) borrar una ranura la deja vacía (con confirmación)
  try {
    installGlobals(defaultSave({ world: 2 }), false); loadAll();
    step(5); click(640, 400); step(3);
    ok(getSlot(0) !== null, "la ranura 1 tiene datos antes de borrar");
    click(150 + 300 - 23, 200 + 25); step(2);       // tocar la "×" -> pide confirmación
    click(150 + 30 + 55, 200 + 320 - 64 + 22); step(2);   // botón "Sí"
    ok(getSlot(0) === null, "borrar deja la ranura vacía");
  } catch (e) { ok(false, "borrar ranura: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 11 — Porcentaje de avance por ranura
   ============================================================ */
function part11_progress() {
  section("Parte 11 · Porcentaje de avance");
  try {
    installGlobals(defaultSave(), false); loadAll();
    const pct = s => global.__rr.progress(s);
    const allW = ["pea", "spread", "chaser", "charge", "lobber", "boomerang", "ray", "wave", "needle", "comet"];
    const allC = ["heart", "twin", "coffee", "smoke", "whet", "magnet", "shield", "spring", "feather", "hourglass"];
    const allRng = { forest: 1, dock: 1, factory: 1, skyway: 1, glacier: 1, casino: 1, theater: 1, abyss: 1, drawingboard: 1 };
    const allB = global.BOSSES.map(b => b.id);
    const base = o => Object.assign({ ownedW: [], ownedC: [], rngDone: {}, beatenNormal: [], beatenExpert: [] }, o);
    ok(pct(base({})) === 0, "una ranura sin nada = 0%");
    ok(pct(base({ ownedW: allW, ownedC: allC, rngDone: allRng, beatenNormal: allB })) === 100, "100% NO necesita el jefe secreto (todo en Normal = 100%)");
    ok(pct(base({ ownedW: allW, ownedC: allC, rngDone: allRng, beatenNormal: allB, beatenExpert: allB })) < 200, "Experto completo SIN el secreto no llega al 200% (" + pct(base({ ownedW: allW, ownedC: allC, rngDone: allRng, beatenNormal: allB, beatenExpert: allB })) + ")");
    ok(pct(base({ ownedW: allW, ownedC: allC, rngDone: allRng, beatenNormal: allB, beatenExpert: allB, secretDefeated: true })) === 200, "Experto completo + jefe secreto vencido = 200%");
    ok(pct(base({ ownedW: allW, ownedC: allC, rngDone: allRng, beatenNormal: [], beatenExpert: [] })) === Math.round(29 * 100 / 44), "jefes en Sencillo no suman (solo armas+amuletos+run-n-gun)");
    ok(pct(base({ ownedC: allC })) === Math.round(10 * 100 / 44) && pct(base({ ownedC: allC })) > 0, "los amuletos suman al porcentaje");
    const half = pct(base({ ownedW: allW, ownedC: allC, rngDone: allRng, beatenNormal: allB.slice(0, 8), beatenExpert: allB.slice(0, 8) }));
    ok(half > 100 && half < 200, "mitad de jefes en Experto: entre 100% y 200% (" + half + ")");
    ok(pct(base({ ownedW: allW, ownedC: allC, rngDone: Object.assign({ tutorial: 1 }, allRng), beatenNormal: allB })) === 100, "el tutorial no cuenta como run-n-gun");
    ok(pct(base({ ownedW: ["pea"] })) >= 0 && pct(base({ ownedW: ["pea"] })) < 10, "partida recién empezada: porcentaje bajo");
  } catch (e) { ok(false, "porcentaje: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 12 — Balance de daño de armas (disparo normal)
   ============================================================ */
function part12_weaponBalance() {
  section("Parte 12 · Balance de daño de armas");
  try {
    installGlobals(defaultSave(), false); loadAll();
    const WT = global.__rr.wtune, dps = w => WT[w].dmg / WT[w].cd, peaDps = dps("pea");
    ok(Math.abs(peaDps - 41.7) < 2, "el guisante (referencia) ~42 dps (" + peaDps.toFixed(0) + ")");
    let worst = "pea", worstDps = peaDps;
    for (const w of Object.keys(WT)) {
      const d = dps(w); if (d > worstDps) { worstDps = d; worst = w; }
      ok(d <= peaDps * 1.05, "'" + w + "' no supera al guisante (" + d.toFixed(0) + " dps)");
      ok(d >= 8, "'" + w + "' sigue siendo útil (" + d.toFixed(0) + " dps)");
    }
    ok(worstDps <= peaDps * 1.05, "ningún arma sobrepasa la referencia (peor: " + worst + " " + worstDps.toFixed(0) + " dps)");
    // reducciones concretas
    ok(WT.lobber.dmg <= 16, "bombardero reducido (es " + WT.lobber.dmg + ")");
    ok(WT.needle.dmg <= 3.2, "aguja reducida (es " + WT.needle.dmg + ")");
    ok(WT.wave.dmg <= 7, "onda reducida (es " + WT.wave.dmg + ")");
    ok(WT.comet.dmg <= 18, "cometa reducido (es " + WT.comet.dmg + ")");
    // EX nerfeados: el daño total de cada EX no debe ser excesivo
    const exes = Object.keys(WT).map(w => ({ w, d: global.__rr.exDamage(w) }));
    const worstEx = exes.reduce((a, b) => b.d > a.d ? b : a);
    ok(worstEx.d <= 40, "ningún EX hace daño total excesivo (peor: " + worstEx.w + " " + worstEx.d.toFixed(0) + ")");
    ok(global.__rr.exDamage("lobber") <= 30 && global.__rr.exDamage("comet") <= 36, "los EX más fuertes (bombardero/cometa) están reducidos");
    // EX por daño EFECTIVO (incluye re-impactos de pierce/homing; el estallido solo no basta)
    const eff = Object.keys(WT).concat(["charge"]).reduce((o, w) => (o[w] = global.__rr.exEffective(w, 4), o), {});
    const worstEff = Object.entries(eff).reduce((a, b) => b[1] > a[1] ? b : a);
    ok(worstEff[1] <= 160, "ningún EX demuele de un golpe (efectivo peor: " + worstEff[0] + " " + worstEff[1].toFixed(0) + ")");
    ok(eff.comet <= 130, "la EX del cometa ya no hace daño efectivo absurdo (" + eff.comet.toFixed(0) + ", antes ~726)");
    ok(eff.lobber <= 130, "la EX del bombardero acotada por daño efectivo (" + eff.lobber.toFixed(0) + ")");
    const effVals = Object.values(eff).sort((a, b) => a - b), med = effVals[Math.floor(effVals.length / 2)] || 1;
    ok(worstEff[1] <= med * 5.5, "el EX más fuerte no excede ~x5 la mediana (x" + (worstEff[1] / med).toFixed(1) + ")");
  } catch (e) { ok(false, "balance de armas: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 13 — Justicia de jefes (anti-repetición de ataques)
   ============================================================ */
function part13_bossFairness() {
  section("Parte 13 · Justicia de jefes");
  try {
    installGlobals(defaultSave(), false); loadAll();
    const noop = () => {};
    const stub = { W: 1280, H: 720, groundY: 624, player: { x: 300, y: 300, w: 40, h: 72 }, diff: { atk: 1, tele: 1, pspeed: 1 }, rand: (a, b) => (a + b) / 2, randi: () => 0, pick: a => a[0], sfx: noop, shake: noop, spawnProj: noop, spawnHazard: noop, burst: noop, floatText: noop };
    const b = global.BOSSES[0].make(stub);
    const A = function () { return 0; }, B = function () { return 1; }, C = function () { return 2; };
    let prev = -1, rep = 0;
    for (let i = 0; i < 500; i++) { const v = b.choice([0.4, 0.32, 0.28], [A, B, C]); if (v === prev) rep++; prev = v; }
    ok(rep === 0, "un jefe nunca repite ataque seguido con 3 opciones (repeticiones=" + rep + ")");
    prev = -1; rep = 0;
    for (let i = 0; i < 500; i++) { const v = b.choice([1, 1], [A, B]); if (v === prev) rep++; prev = v; }
    ok(rep === 0, "ni con 2 opciones (repeticiones=" + rep + ")");
    const seen = new Set(); for (let i = 0; i < 200; i++) seen.add(b.choice([1, 1, 1], [A, B, C]));
    ok(seen.size === 3, "sigue usando toda la variedad de ataques (" + seen.size + "/3)");
  } catch (e) { ok(false, "justicia de jefes: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 14 — Jefe secreto (El Descarte) + puzzle de las manchas
   ============================================================ */
function part14_secretBoss() {
  section("Parte 14 · Jefe secreto (El Descarte)");
  // (a) el objeto del jefe secreto existe, es secret y NO está en BOSSES
  try {
    installGlobals(defaultSave(), false); loadAll();
    const SB = global.SECRET_BOSS;
    ok(SB && SB.id === "discard" && SB.secret === true, "existe El Descarte (secret:true)");
    ok(global.BOSSES.length === 18 && !global.BOSSES.some(b => b.id === "discard"), "El Descarte no está en BOSSES (hay 18: 15 + 3 del Reverso; el secreto va aparte)");
    const noop = () => {};
    const stub = { W: 1280, H: 720, groundY: 624, player: { x: 300, y: 540, w: 40, h: 72 }, diff: { atk: 1, hp: 1, tele: 1, dmgTo: 1, pspeed: 1, key: "regular" }, rand: (a, b) => a + Math.random() * (b - a), randi: () => 0, pick: a => a[0], sfx: noop, shake: noop, floatText: noop, burst: noop, spawnProj: noop, spawnHazard: noop };
    const ctx = makeCtx(), b = SB.make(stub);
    ok(b.maxHp >= 2000, "es MUY difícil (mucha vida: " + b.maxHp + ")");
    ok((b.cfg.thresholds || []).length === 4, "tiene 5 fases");
    for (let ph = 1; ph <= 5; ph++) { b.phase = ph; for (let i = 0; i < 12; i++) { b.choose(); b.update(1 / 60); b.draw(ctx); } }
    ok(true, "instanciar/atacar/dibujar El Descarte en sus 5 fases sin errores");
  } catch (e) { ok(false, "objeto secreto: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) el puzzle de las 3 manchas (III·I·II) desbloquea y se puede entrar a luchar
  try {
    const all = global.BOSSES.map(x => x.id);
    installGlobals(defaultSave({ defeated: all, beatenNormal: all, world: 4, equipW: ["needle", null] }), false); loadAll();
    boot();
    ok(global.__rr.state === "map" && getSave().world === 4, "en el mapa del Mundo final (4)");
    const Gl = [{ x: 200, y: 212 }, { x: 420, y: 212 }, { x: 640, y: 212 }, { x: 860, y: 212 }, { x: 1080, y: 212 }], order = [2, 0, 4, 3, 1];
    const tread = idx => { global.__rr.setAvatar(Gl[idx].x, Gl[idx].y - 30); step(2); global.__rr.setAvatar(640, 560); step(1); };
    for (const idx of [0, 1, 3, 4]) tread(idx);   // secuencia incorrecta
    ok(!getSave().secretFound, "una secuencia incorrecta NO desbloquea (puzzle exige el orden exacto)");
    for (const idx of order) tread(idx);          // secuencia correcta
    ok(getSave().secretFound === true, "pisar las 5 manchas en la secuencia correcta desbloquea al jefe secreto");
    click(640, 384); step(3);                       // nodo secreto -> cartelas de intro
    for (let i = 0; i < 6 && global.__rr.state === "story"; i++) { kd("KeyZ"); step(2); ku("KeyZ"); step(2); }
    ok(global.__rr.state === "intro" || global.__rr.state === "fight", "se entra al combate secreto (" + global.__rr.state + ")");
    step(80); fuzz(60); leave();
    ok(!getSave().defeated.includes("discard") && !getSave().beatenNormal.includes("discard"), "el secreto no contamina derrotados/Normal (ni el %)");
  } catch (e) { ok(false, "puzzle secreto: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 15 — Personajes de tinta (NPCs) en cada mapa
   ============================================================ */
function part15_npcs() {
  section("Parte 15 · Personajes (NPCs)");
  const npc0 = { 1: [330, 215], 2: [760, 560], 3: [300, 235], 4: [230, 300] };
  for (const wld of [1, 2, 3, 4]) {
    try {
      installGlobals(defaultSave({ world: wld }), false); loadAll();
      boot();
      ok(global.__rr.state === "map", "Mundo " + wld + ": en el mapa");
      talkTo(npc0[wld][0], npc0[wld][1]);
      ok(global.__rr.state === "map", "Mundo " + wld + ": hablar con un personaje (historia/jefes) y volver al mapa sin errores");
    } catch (e) { ok(false, "NPC Mundo " + wld + ": EXCEPCIÓN " + (e && e.stack || e)); }
  }
  // el personaje secreto del Mundo 4 REVELA las manchas del puzzle
  try {
    installGlobals(defaultSave({ world: 4 }), false); loadAll();
    boot();
    ok(!getSave().secretHinted, "las manchas están ocultas hasta hablar con El Borrón");
    talkTo(770, 560);   // El Borrón Parlante
    ok(getSave().secretHinted === true, "El Borrón Parlante revela el puzzle del jefe secreto (secretHinted)");
  } catch (e) { ok(false, "NPC secreto: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 16 — Núcleos de escudo parryables y alcanzables
   ============================================================ */
function part16_shieldCores() {
  section("Parte 16 · Núcleos de escudo");
  installGlobals(defaultSave(), false); loadAll();
  const noop = () => {};
  const mkStub = () => { const P = []; return { W: 1280, H: 720, groundY: 624, player: { x: 600, y: 540, w: 40, h: 72 }, diff: { atk: 1, tele: 1, pspeed: 1, hp: 1 }, rand: (a, b) => (a + b) / 2, randi: () => 0, pick: a => a[0], sfx: noop, shake: noop, floatText: noop, burst: noop, spawnProj: o => P.push(o), spawnHazard: noop, _p: P }; };
  const check = (def, label) => {
    try {
      const G = mkStub(), b = def.make(G); b.raiseShield();
      const core = G._p.find(p => p.core);
      ok(core && core.parry === true, label + ": el escudo crea un núcleo PARRYABLE");
      ok(core && core.y >= G.groundY - 160, label + ": el núcleo está a altura CÓMODA de un salto normal (a " + (core ? Math.round(G.groundY - core.y) : "?") + "px del suelo, no en el ápice)");
    } catch (e) { ok(false, label + " escudo: EXCEPCIÓN " + (e && e.stack || e)); }
  };
  for (const id of ["puppeteer", "director", "sentinel", "author"]) check(global.BOSSES.find(b => b.id === id), id);
  check(global.SECRET_BOSS, "El Descarte");
}

/* ============================================================
   PARTE 17 — Logros (apartado en el título)
   ============================================================ */
function part17_achievements() {
  section("Parte 17 · Logros");
  // (a) UI: abrir los Logros desde el título (Q/LB) y volver
  try {
    installGlobals(defaultSave(), false); loadAll();
    step(5);
    kd("KeyQ"); step(2); ku("KeyQ"); step(2);
    ok(global.__rr.state === "achievements", "se abren los Logros desde el título (Q/LB)");
    kd("KeyZ"); step(2); ku("KeyZ"); step(2);
    ok(global.__rr.state === "title", "se vuelve al título desde los Logros");
  } catch (e) { ok(false, "UI logros: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) sin progreso = 0 logros; partida al 200% = todos
  try {
    installGlobals(defaultSave(), false); delete store["ragtime_slot_0"]; loadAll();
    const st0 = global.__rr.achStatus();
    ok(st0.length >= 12 && st0.every(a => !a.got), "sin progreso: 0 logros conseguidos");
    const all = global.BOSSES.map(b => b.id);
    const allW = ["pea", "spread", "chaser", "charge", "lobber", "boomerang", "ray", "wave", "needle", "comet"];
    const allC = ["heart", "twin", "coffee", "smoke", "whet", "magnet", "shield", "spring", "feather", "hourglass"];
    const rngDone = {}; for (const L of ["forest", "dock", "factory", "skyway", "glacier", "casino", "theater", "abyss", "drawingboard"]) rngDone[L] = 1;
    const grades = {}; all.forEach(id => grades[id] = "S");
    const collectedCoins = {}; for (let i = 0; i < 40; i++) collectedCoins["c:" + i] = 1;
    installGlobals(defaultSave({ defeated: all, beatenNormal: all, beatenExpert: all, ownedW: allW.concat(["mirror", "random"]), ownedC: allC.concat(["ballast", "echo", "god"]), rngDone, finished: true, secretDefeated: true, reverseDone: true, requiemDefeated: true, seenWorld: { 2: true, 3: true, 4: true, 5: true }, grades, collectedCoins, stats: { parries: 200, deaths: 5, kills: 40, playtime: 500 }, bossBest: { spore: 10 } }), false);
    store["ragtime_rush"] = JSON.stringify({ regular: 100 }); loadAll();
    const st = global.__rr.achStatus();
    ok(st.every(a => a.got), "partida 200% completa: TODOS los logros (" + st.filter(a => a.got).length + "/" + st.length + ")");
  } catch (e) { ok(false, "lógica logros: EXCEPCIÓN " + (e && e.stack || e)); }
  // (c) logros concretos: Experto (1) vs Maestro (15)
  try {
    installGlobals(defaultSave({ beatenExpert: ["spore"] }), false); loadAll();
    const st = global.__rr.achStatus(), f = id => st.find(a => a.id === id).got;
    ok(f("expert1") && !f("expertAll"), "Virtuoso (1 jefe en Experto) sí; Maestro (15) todavía no");
  } catch (e) { ok(false, "logro experto: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 18 — Boss Rush (15 jefes a contrarreloj)
   ============================================================ */
function part18_bossRush() {
  section("Parte 18 · Boss Rush");
  try {
    installGlobals(defaultSave({ world: 1 }), false); loadAll();
    boot();
    ok(global.__rr.state === "map", "en el mapa del Mundo 1");
    click(150, 235); step(3);                       // nodo Boss Rush -> dificultad
    ok(global.__rr.state === "diffselect", "el nodo Boss Rush abre la selección de dificultad");
    click(640, 410); step(3);                       // Normal -> empieza el rush
    ok(global.__rr.rush().active && global.__rr.state === "intro", "empieza el Boss Rush en el jefe 1");
    for (let n = 0; n < 16; n++) {
      for (let g = 0; g < 80 && global.__rr.state !== "fight" && global.__rr.state !== "rushdone"; g++) step(2);
      if (global.__rr.state === "rushdone") break;
      global.__rr.killBoss(); step(4);
    }
    ok(global.__rr.state === "rushdone", "tras vencer a los 15 jefes se llega a los resultados");
    const best = JSON.parse(store["ragtime_rush"] || "{}");
    ok(best.regular != null, "se guarda el mejor tiempo del Boss Rush (Normal)");
    ok(!getSave().defeated.includes("spore"), "el rush NO cuenta como derrotar jefes en el progreso normal");
    kd("KeyZ"); step(2); ku("KeyZ"); step(2);
    ok(global.__rr.state === "map", "se vuelve a la isla tras el rush");
  } catch (e) { ok(false, "boss rush: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 19 — Súper Artes (elige 1 de 3) y feel (coyote/buffer)
   ============================================================ */
function part19_superArts() {
  section("Parte 19 · Súper Artes");
  // (a) selector: tienda -> Súper Artes -> equipar -> volver
  try {
    installGlobals(defaultSave(), false); loadAll(); boot();
    click(220, 560); step(3);
    ok(global.__rr.state === "shop", "se entra a la tienda");
    click(484, 672); step(3);
    ok(global.__rr.state === "superart", "el botón ★ Súper Artes abre el selector");
    click(630, 360); step(2);
    ok(getSave().equipSuper === "aegis", "se equipa la Súper Arte elegida (Égida)");
    kd("Escape"); step(2); ku("Escape"); step(2);
    ok(global.__rr.state === "shop", "se vuelve a la tienda");
  } catch (e) { ok(false, "selector súper: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) efecto de cada Súper Arte
  try {
    installGlobals(defaultSave(), false); loadAll(); boot();
    const beam = global.__rr.fireSuperTest("beam"); ok(beam.beam, "Rayo: crea el haz que barre la pantalla");
    const aegis = global.__rr.fireSuperTest("aegis"); ok(aegis.inv >= 2.5 && aegis.shield, "Égida: invencibilidad + escudo");
    const whirl = global.__rr.fireSuperTest("whirl"); ok(whirl.hp >= 2, "Torbellino: cura vida (de 1 a " + whirl.hp + ")");
  } catch (e) { ok(false, "efecto súper: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 20 — Co-op desde opciones + mando como J1
   ============================================================ */
function part20_coopInput() {
  section("Parte 20 · Co-op + mando como J1");
  // (a) OPT.coop activa el co-op
  try {
    installGlobals(defaultSave(), false); store["ragtime_opts"] = JSON.stringify({ coop: true }); loadAll();
    ok(global.__rr.coop === true, "el co-op se activa desde opciones (OPT.coop)");
    installGlobals(defaultSave(), false); store["ragtime_opts"] = JSON.stringify({ coop: false }); loadAll();
    ok(global.__rr.coop === false, "el co-op se desactiva desde opciones");
  } catch (e) { ok(false, "toggle co-op: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) con MANDO + co-op: mando = J1, teclado (botones del antiguo J1) = J2
  try {
    installGlobals(defaultSave(), true); store["ragtime_opts"] = JSON.stringify({ coop: true }); loadAll();
    pad.buttons[0].pressed = true; step(2);                 // A del mando = saltar
    ok(global.__rr.inp(0).jump === true, "el MANDO controla al Jugador 1");
    pad.buttons[0].pressed = false; step(1);
    kd("KeyZ"); step(2);                                    // Z (salto del antiguo J1) -> J2
    ok(global.__rr.inp(1).jump === true && !global.__rr.inp(0).jump, "el TECLADO (botones del antiguo J1) controla al Jugador 2");
    ku("KeyZ"); step(1);
  } catch (e) { ok(false, "remapeo mando/teclado: EXCEPCIÓN " + (e && e.stack || e)); }
  // (c) SIN mando + co-op: teclado P1 = J1, teclado P2 (IJKL/U) = J2
  try {
    installGlobals(defaultSave(), false); store["ragtime_opts"] = JSON.stringify({ coop: true }); loadAll();
    kd("KeyZ"); step(2); ok(global.__rr.inp(0).jump === true, "sin mando: teclado P1 (Z) es el Jugador 1"); ku("KeyZ"); step(1);
    kd("KeyU"); step(2); ok(global.__rr.inp(1).jump === true, "sin mando: teclado P2 (U) es el Jugador 2"); ku("KeyU"); step(1);
  } catch (e) { ok(false, "teclado 2 jugadores: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 21 — Mausoleo (galería + repetir) y Récords
   ============================================================ */
function part21_gallery() {
  section("Parte 21 · Mausoleo y récords");
  const all = global.BOSSES.map(b => b.id);
  // (a) abrir Mausoleo y Récords desde el mapa
  try {
    installGlobals(defaultSave({ defeated: all, beatenNormal: all, world: 1 }), false); loadAll(); boot();
    click(285, 300); step(3);
    ok(global.__rr.state === "gallery", "el nodo Mausoleo abre la galería de jefes");
    click(1146, 46); step(3);
    ok(global.__rr.state === "records", "se abren los Récords desde el Mausoleo");
    kd("KeyZ"); step(2); ku("KeyZ"); step(2);
    ok(global.__rr.state === "gallery", "Récords vuelve al Mausoleo");
    kd("Escape"); step(2); ku("Escape"); step(2);
    ok(global.__rr.state === "map", "el Mausoleo vuelve al mapa");
  } catch (e) { ok(false, "mausoleo UI: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) repetir un jefe desde el Mausoleo y registrar estadísticas al vencer
  try {
    installGlobals(defaultSave({ defeated: all, beatenNormal: all, world: 1 }), false); loadAll(); boot();
    click(285, 300); step(3);                                   // galería (foco 0 = Esporo)
    kd("KeyZ"); step(2); ku("KeyZ"); step(2);                   // repetir -> dificultad
    ok(global.__rr.state === "diffselect", "se puede REPETIR un jefe desde el Mausoleo");
    click(640, 410); step(3);                                   // Normal -> combate
    for (let g = 0; g < 80 && global.__rr.state !== "fight"; g++) step(2);
    global.__rr.killBoss(); for (let g = 0; g < 40 && global.__rr.state === "fight"; g++) step(2);
    ok(getSave().stats.kills >= 1, "al vencer se registra en estadísticas (jefes vencidos)");
    ok(getSave().bossBest && Object.keys(getSave().bossBest).length >= 1, "se guarda el mejor tiempo del jefe");
  } catch (e) { ok(false, "repetir+stats: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 22 — Combo de parry
   ============================================================ */
function part22_parryCombo() {
  section("Parte 22 · Combo de parry");
  try {
    installGlobals(defaultSave(), false); loadAll();
    const a = global.__rr.parryTest(), b = global.__rr.parryTest(), c = global.__rr.parryTest();
    ok(a.combo === 1 && b.combo === 2 && c.combo === 3, "parrys encadenados suben el combo (1·2·3)");
    ok(b.gain > a.gain && c.gain > b.gain, "cada parry del combo carga MÁS súper (" + a.gain + " < " + b.gain + " < " + c.gain + ")");
    ok(global.__rr.hurtTest() === 0, "recibir daño reinicia el combo");
    ok(global.__rr.parryTest().combo === 1, "tras el golpe, el combo empieza de cero");
  } catch (e) { ok(false, "combo de parry: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 23 — Run-n-gun mejorados (enemigos y diseño)
   ============================================================ */
function part23_runNgun() {
  section("Parte 23 · Run-n-gun mejorados");
  try {
    installGlobals(defaultSave(), false); loadAll();
    const seen = new Set();
    for (const th of ["spore", "pirate", "robot", "ice", "casino"]) {
      const r = global.__rr.rngTypes(th);
      r.enemies.forEach(t => seen.add(t));
      ok(r.platforms >= 3 && r.coins === 5, th + ": tiene plataformas variadas y 5 monedas");
    }
    ok(seen.has("runner"), "aparecen enemigos CORREDOR (cargan por el suelo)");
    ok(seen.has("diver"), "aparecen enemigos BUCEADOR (se lanzan en picado)");
    ok(seen.size >= 4, "hay variedad de enemigos (" + seen.size + " tipos: " + [...seen].join(", ") + ")");
  } catch (e) { ok(false, "run-n-gun: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 24 — Mundo Extra: El Reverso de Tinta
   ============================================================ */
function part24_reverseWorld() {
  section("Parte 24 · Mundo Extra (El Reverso de Tinta)");
  // (a) los 3 jefes atacan/se dibujan en TODAS sus fases sin error y usan las mecánicas nuevas
  try {
    installGlobals(defaultSave(), false); loadAll();
    let gravCalled = false, inkCalled = false;
    const stub = { W: 1280, H: 720, groundY: 624, player: { x: 300, y: 540, w: 40, h: 72 }, diff: { atk: 1, tele: 1, pspeed: 1, hp: 1, dmgTo: 1, key: "regular" }, rand: (a, b) => a + Math.random() * (b - a), randi: () => 0, pick: a => a[0], sfx: noop, shake: noop, floatText: noop, burst: noop, spawnProj: noop, spawnHazard: noop, setGrav: () => { gravCalled = true; }, gravSign: () => 1, setInk: () => { inkCalled = true; } };
    const ctx2 = makeCtx();
    for (const id of ["twin", "siphon", "lefthand"]) {
      const def = global.BOSSES.find(b => b.id === id); ok(def && def.world === 5, id + " existe en el Mundo 5");
      const b = def.make(stub), phases = (b.cfg.thresholds || []).length + 1;
      for (let ph = 1; ph <= phases; ph++) { b.phase = ph; for (let i = 0; i < 26; i++) { b.choose(); b.update(1 / 60); b.draw(ctx2); } }
      for (let i = 0; i < 80; i++) { b.update(1 / 60); b.draw(ctx2); }   // vacía timers diferidos (p.ej. el setGrav del Sifón, avisado 0.5 s antes)
    }
    ok(true, "los 3 jefes del Reverso atacan/se dibujan en todas sus fases sin errores");
    ok(gravCalled, "algún jefe del Reverso INVIERTE la gravedad (setGrav)");
    ok(inkCalled, "algún jefe del Reverso hace SUBIR la tinta (setInk)");
  } catch (e) { ok(false, "jefes Reverso: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) desbloqueo al terminar el juego + cada jefe suelta su botín exclusivo (solo aquí)
  const mainIds = global.BOSSES.filter(b => b.world <= 4).map(b => b.id);
  function setupRev(extra) { installGlobals(defaultSave(Object.assign({ finished: true, world: 5, seenIntro: true, seenWorld: { 2: 1, 3: 1, 4: 1, 5: 1 }, defeated: mainIds.slice(), beatenNormal: mainIds.slice(), ownedW: ["pea"], ownedC: [] }, extra || {})), false); loadAll(); boot(); }
  function enterKill(x, y) { goMap(); click(x, y); step(2); click(640, 410); step(2); for (let i = 0; i < 120 && global.__rr.state !== "fight"; i++) { if (global.__rr.state === "intro") { kd("KeyZ"); step(1); ku("KeyZ"); } step(2); } global.__rr.killBoss(); step(8); }
  try {
    setupRev();
    ok(global.__rr.world === 5, "el Reverso es accesible al terminar el juego (finished)");
    enterKill(480, 320);
    ok(getSave().defeated.includes("twin"), "se vence a La Gemela");
    ok((getSave().ownedW || []).includes("mirror"), "La Gemela suelta el ARMA Espejo (solo botín de jefe)");
  } catch (e) { ok(false, "Gemela: EXCEPCIÓN " + (e && e.stack || e)); }
  try {
    setupRev({ defeated: mainIds.concat(["twin"]), ownedW: ["pea", "mirror"] });
    enterKill(760, 430);
    ok(getSave().defeated.includes("siphon"), "se vence a El Sifón");
    ok((getSave().ownedC || []).includes("ballast"), "El Sifón suelta el AMULETO Plomada");
  } catch (e) { ok(false, "Sifón: EXCEPCIÓN " + (e && e.stack || e)); }
  try {
    setupRev({ defeated: mainIds.concat(["twin", "siphon"]), ownedW: ["pea", "mirror"], ownedC: ["ballast"] });
    enterKill(1060, 300);
    ok(getSave().defeated.includes("lefthand"), "se vence a La Mano Zurda (final del Reverso)");
    ok((getSave().ownedW || []).includes("random") && (getSave().ownedC || []).includes("echo"), "La Mano Zurda suelta el arma Aleatoria + Eco");
    ok(getSave().reverseDone === true, "completar La Mano Zurda marca el Reverso terminado");
  } catch (e) { ok(false, "Mano Zurda: EXCEPCIÓN " + (e && e.stack || e)); }
  // (c) el Reverso es BONUS: no entra en el medidor 0–200%, y existen sus 5 logros nuevos
  try {
    installGlobals(defaultSave(), false); loadAll();
    const ach = global.__rr.achStatus().map(a => a.id);
    ok(["cross", "twinDown", "reverseDone", "lefthandX", "revGear"].every(id => ach.includes(id)), "están los 5 logros nuevos del Reverso");
    const pct = global.__rr.progress({ ownedW: ["mirror", "random"], ownedC: ["ballast", "echo"], defeated: ["twin", "siphon", "lefthand"], beatenNormal: ["twin", "siphon", "lefthand"], beatenExpert: ["twin", "siphon", "lefthand"] });
    ok(pct === 0, "el contenido del Reverso NO suma al 0–200% (es bonus): " + pct + "%");
    ok(global.__rr.exEffective("random", 3) > 0, "el arma Aleatoria dispara de verdad (EX de un arma al azar hace daño)");
    const g = global.__rr.godTest();
    ok(g.inv > 1.5 && g.godInv > 1.5, "el amuleto Dios da ~2 s de invencibilidad (inv=" + g.inv + ")");
  } catch (e) { ok(false, "bonus/logros Reverso: EXCEPCIÓN " + (e && e.stack || e)); }
  // (d) justicia: la barra de borrado de la Mano Zurda es un MURO BAJO saltable, no de altura completa
  try {
    installGlobals(defaultSave(), false); loadAll();
    const HZ = []; const stub2 = { W: 1280, H: 720, groundY: 624, player: { x: 300, y: 540, w: 40, h: 72 }, diff: { atk: 1, tele: 1, pspeed: 1 }, rand: (a, b) => (a + b) / 2, randi: () => 0, pick: a => a[0], sfx: noop, shake: noop, floatText: noop, burst: noop, spawnProj: noop, spawnHazard: o => HZ.push(o), setGrav: noop, gravSign: () => 1, setInk: noop };
    const lh = global.BOSSES.find(b => b.id === "lefthand").make(stub2); lh.erase();
    const wall = HZ.find(h => h.type === "erase");
    ok(wall && wall.h <= 140 && wall.y >= 624 - 140, "la barra de borrado es un muro BAJO saltable (alto=" + (wall ? wall.h : "?") + ", no ~" + (624 - 70) + ")");
    // el TSUNAMI (tide) es una ola baja que barre el suelo y se salta (no una marea a todo lo ancho)
    HZ.length = 0; lh.tide(); const lwave = HZ.find(h => h.type === "wave");
    ok(lwave && lwave.h <= 140 && lwave.vx !== 0 && lwave.y >= 624 - 140, "el tsunami de la Mano Zurda es una OLA que barre y se salta (alto=" + (lwave ? lwave.h : "?") + ")");
    HZ.length = 0; const sf = global.BOSSES.find(b => b.id === "siphon").make(stub2); sf.tide(); const swave = HZ.find(h => h.type === "wave");
    ok(swave && swave.h <= 140 && swave.vx !== 0 && swave.y >= 624 - 140, "el tsunami de El Sifón es una OLA que barre y se salta (alto=" + (swave ? swave.h : "?") + ")");
  } catch (e) { ok(false, "olas/muro Reverso: EXCEPCIÓN " + (e && e.stack || e)); }
  // (e) el MUNDO EXTRA es accesible desde CUALQUIER mundo (portal) una vez terminado el juego
  try {
    const mainIds = global.BOSSES.filter(b => b.world <= 4).map(b => b.id);
    installGlobals(defaultSave({ finished: true, world: 1, seenIntro: true, seenWorld: { 2: 1, 3: 1, 4: 1, 5: 1 }, defeated: mainIds.slice() }), false); loadAll(); boot(); goMap();
    ok(getSave().world === 1, "empezamos en el Mundo 1");
    click(1210, 476); step(4);                     // portal al Mundo Extra (visible en todos los mundos)
    ok(getSave().world === 5, "el portal lleva al Mundo Extra desde el Mundo 1");
    ok(getSave().prevWorld === 1, "recuerda el mundo de origen para poder volver");
  } catch (e) { ok(false, "portal Mundo Extra: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 25 — Dificultad Locura
   ============================================================ */
function part25_locura() {
  section("Parte 25 · Dificultad Locura");
  const mainIds = global.BOSSES.filter(b => b.world <= 4).map(b => b.id);
  // (a) con el Experto desbloqueado se puede elegir Locura, y ganar en Locura cuenta como Experto
  try {
    installGlobals(defaultSave({ seenIntro: true, world: 1, defeated: mainIds.slice(), beatenNormal: mainIds.slice() }), false); loadAll(); boot();
    goMap(); click(360, 470); step(2);                 // primer jefe (Esporo) -> dificultad
    ok(global.__rr.state === "diffselect", "se abre la selección de dificultad");
    click(640, 555); step(2);                          // barra LOCURA
    for (let i = 0; i < 90 && global.__rr.state !== "fight"; i++) { if (global.__rr.state === "intro") { kd("KeyZ"); step(1); ku("KeyZ"); } step(2); }
    ok(getSave().difficulty === "locura", "se elige Locura (desbloqueada por tener el Experto del mundo)");
    global.__rr.killBoss(); step(8);
    ok(getSave().beatenExpert.includes("spore"), "ganar en Locura cuenta también como Experto");
  } catch (e) { ok(false, "Locura jugable: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) sin el Experto del mundo, Locura está bloqueada (deniega)
  try {
    installGlobals(defaultSave({ seenIntro: true, world: 1, defeated: [], beatenNormal: [] }), false); loadAll(); boot();
    goMap(); click(360, 470); step(2);
    ok(global.__rr.state === "diffselect", "diffselect abierto (sin Experto)");
    click(640, 555); step(3);
    ok(global.__rr.state === "diffselect", "Locura está bloqueada sin el Experto del mundo (no entra al combate)");
  } catch (e) { ok(false, "Locura bloqueada: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 26 — RÉQUIEM (jefe del código del Mausoleo: 53149900)
   ============================================================ */
function part26_requiem() {
  section("Parte 26 · RÉQUIEM (jefe del código)");
  // (a) registro + los 4 movimientos atacan/se dibujan sin errores
  try {
    installGlobals(defaultSave(), false); loadAll();
    const RB = global.CODE_BOSS;
    ok(RB && RB.id === "requiem" && RB.code === true, "existe RÉQUIEM (code:true)");
    ok(!global.BOSSES.some(b => b.id === "requiem"), "no está en BOSSES (no cuenta para el % ni el rush)");
    const P = []; let echoU = false, windU = false, tombU = false;
    const stub = { W: 1280, H: 720, groundY: 624, player: { x: 300, y: 540, w: 40, h: 72 }, diff: { atk: 1, tele: 1, pspeed: 1, hp: 1, dmgTo: 1, key: "regular" }, rand: (a, b) => a + Math.random() * (b - a), randi: () => 0, pick: a => a[0], sfx: noop, shake: noop, floatText: noop, burst: noop, spawnProj: o => P.push(o), spawnHazard: o => P.push(o), setGrav: noop, gravSign: () => 1, setInk: noop, startEcho: () => { echoU = true; }, setWind: () => { windU = true; }, raiseTomb: () => { tombU = true; } };
    const ctx2 = makeCtx(), b = RB.make(stub);
    ok(b.maxHp >= 2500, "es el jefe con más vida del juego (" + b.maxHp + ")");
    ok((b.cfg.thresholds || []).length === 3, "tiene 4 movimientos (fases)");
    for (let ph = 1; ph <= 4; ph++) {
      b.phase = ph; if (ph > 1) b.onPhase(ph);
      for (let i = 0; i < 40; i++) { b.choose(); b.update(1 / 60); b.draw(ctx2); }
      for (let i = 0; i < 130; i++) { b.update(1 / 60); b.draw(ctx2); }   // vacía timers diferidos
    }
    ok(true, "los 4 movimientos atacan y se dibujan sin errores");
    ok(P.some(p => p.parry), "sus patrones incluyen proyectiles ROSA parryables");
    ok(P.some(p => p.core), "el 2º movimiento saca un núcleo de escudo");
    // mecánicas ÚNICAS que ningún otro jefe tiene
    ok(P.some(p => p.type === "gaze"), "I: la Mirada de Piedra PETRIFICA (hazard gaze)");
    ok(tombU, "I: levanta LÁPIDAS que cambian la arena (plataformas temporales)");
    ok(P.some(p => p.sine), "I: el coro lanza notas que ONDULAN (movimiento sinusoidal)");
    ok(echoU, "II: invoca TU ECO de tinta (clon retardado)");
    ok(P.some(p => p.cage), "II: la JAULA DE FATUOS rodea al jugador y se cierra");
    ok(windU, "III: el FUELLE aspira con viento");
    ok(P.some(p => p.duel), "IV: DUELO DE COMPÁS (notas que se devuelven con parry)");
    // justicia: garantías de esquivabilidad
    const TAU2 = Math.PI * 2, cages = P.filter(p => p.cage);
    ok(cages.length > 0, "jaula generada");
    ok(cages.every(p => { const norm = ((p.cage.a % TAU2) + TAU2) % TAU2; return Math.abs(norm - Math.PI / 2) > 0.3; }), "la jaula NUNCA pone un fatuo bajo el suelo (sin pinza imposible)");
    ok(cages.every(p => p.cage.min >= 110), "la jaula se detiene a distancia esquivable (min ≥ 110)");
    const gazes = P.filter(p => p.type === "gaze");
    ok(gazes.every(g => g.active <= 0.45), "la Mirada es una ola secuencial (columnas cortas, sin solaparse)");
    // muerte ceremoniosa: morir por daño (no killBoss) alarga el final y se dibuja sin errores
    b.phase = 4; b.shielded = false; b.hp = 4; b.hit(999);
    ok(b.dead && b.dying > 2, "la muerte de RÉQUIEM es larga y ceremoniosa (dying=" + b.dying.toFixed(1) + ")");
    for (let i = 0; i < 80; i++) b.draw(ctx2);
    ok(true, "la secuencia de muerte se dibuja sin errores");
  } catch (e) { ok(false, "RÉQUIEM stub: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) el panel de código: uno erróneo NO abre nada; 53149900 despierta a RÉQUIEM; vencerlo da el logro
  try {
    installGlobals(defaultSave(), false); loadAll(); boot();
    goMap(); click(285, 300); step(3);
    ok(global.__rr.state === "gallery", "se entra al Mausoleo");
    click(134, 46); step(2);
    ok(global.__rr.state === "code", "el botón 🔑 CÓDIGO abre el panel de la lápida");
    const typeCode = s => { for (const ch of s) { kd("Digit" + ch); step(1); ku("Digit" + ch); step(1); } };
    typeCode("11111111"); step(3);
    ok(global.__rr.state === "code" && !getSave().requiemUnlocked, "un código erróneo no abre la losa");
    typeCode("53149900"); step(3);
    ok(getSave().requiemUnlocked === true, "53149900 desbloquea a RÉQUIEM");
    ok(global.__rr.state === "story", "al acertar arranca su historia");
    for (let i = 0; i < 10 && global.__rr.state === "story"; i++) { kd("KeyZ"); step(2); ku("KeyZ"); step(2); }
    for (let i = 0; i < 90 && global.__rr.state !== "fight"; i++) { if (global.__rr.state === "intro") { kd("KeyZ"); step(1); ku("KeyZ"); } step(2); }
    ok(global.__rr.state === "fight", "empieza el combate contra RÉQUIEM");
    global.__rr.killBoss(); step(10);
    ok(getSave().requiemDefeated === true, "vencerlo queda registrado (requiemDefeated)");
    ok((getSave().ownedC || []).includes("god"), "suelta la recompensa dorada exclusiva: el amuleto Dios");
    ok(global.__rr.state === "story", "al vencerlo suena su epílogo");
    for (let i = 0; i < 10 && global.__rr.state === "story"; i++) { kd("KeyZ"); step(2); ku("KeyZ"); step(2); }
    ok(global.__rr.state === "gallery", "el epílogo devuelve al Mausoleo");
    const ach = global.__rr.achStatus().find(a => a.id === "requiem");
    ok(ach && ach.got === true, "se otorga el logro 🎼 La Última Nota");
  } catch (e) { ok(false, "código Mausoleo: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   PARTE 27 — Configurar botones + Opciones/Inicio desde el mapa
   ============================================================ */
function part27_controls() {
  section("Parte 27 · Configurar botones + Opciones/Inicio en el mapa");
  // (a) Opciones desde el mapa y navegación al configurador
  try {
    installGlobals(defaultSave(), false); loadAll(); boot(); goMap();
    ok(global.__rr.state === "map", "estamos en el mapa");
    click(96, 41); step(3);                        // botón ⚙ Opciones (esquina sup. izq.)
    ok(global.__rr.state === "options", "el botón ⚙ del mapa abre Opciones");
    for (let i = 0; i < 4; i++) { kd("ArrowDown"); step(2); ku("ArrowDown"); step(2); }   // fila 5 = Configurar botones
    kd("Enter"); step(2); ku("Enter"); step(3);
    ok(global.__rr.state === "keys", "Opciones → Configurar botones abre el configurador");
  } catch (e) { ok(false, "opciones/keys: EXCEPCIÓN " + (e && e.stack || e)); }
  // (b) reasignar una tecla (Saltar → N) persiste, y Restablecer la borra
  try {
    kd("Enter"); step(2); ku("Enter"); step(2);    // foco 0 = Saltar → capturar teclado
    kd("KeyN"); step(3);                            // pulsar la nueva tecla
    ok(JSON.parse(store["ragtime_opts"]).keys.jump === "KeyN", "reasignar Saltar a N se guarda en opciones");
    // Restablecer: clic en el botón ↺ (izquierda de la fila inferior)
    click(640 - 224 + 105, 588 + 22); step(3);
    ok(!(JSON.parse(store["ragtime_opts"]).keys || {}).jump, "Restablecer borra las reasignaciones");
  } catch (e) { ok(false, "rebind: EXCEPCIÓN " + (e && e.stack || e)); }
  // (c) el botón 🏠 del mapa vuelve al Inicio
  try {
    installGlobals(defaultSave(), false); loadAll(); boot(); goMap();
    click(238, 41); step(3);
    ok(global.__rr.state === "title", "el botón 🏠 del mapa vuelve a la pantalla de inicio");
  } catch (e) { ok(false, "inicio desde mapa: EXCEPCIÓN " + (e && e.stack || e)); }
}

/* ============================================================
   EJECUCIÓN
   ============================================================ */
console.log("RAGTIME RUMBLE — suite de pruebas\n----------------------------------");
const t0 = Date.now();
[part1_registriesAndBosses, part2_weaponsCharms, part3_fullSolo, part4_coop, part5_economy, part6_gating, part7_padTouch, part8_balance, part9_story, part10_slots, part11_progress, part12_weaponBalance, part13_bossFairness, part14_secretBoss, part15_npcs, part16_shieldCores, part17_achievements, part18_bossRush, part19_superArts, part20_coopInput, part21_gallery, part22_parryCombo, part23_runNgun, part24_reverseWorld, part25_locura, part26_requiem, part27_controls].forEach(fn => {
  try { fn(); } catch (e) { ok(false, fn.name + ": EXCEPCIÓN GLOBAL " + (e && e.stack || e)); }
});
console.log("\n----------------------------------");
console.log("Pruebas superadas: " + pass + " · fallidas: " + fail + " · " + ((Date.now() - t0) / 1000).toFixed(1) + "s");
if (fail) { console.log("\nFALLOS:"); fails.forEach(f => console.log(" - " + f)); console.log("\nRESULTADO: ❌ HAY FALLOS"); }
else console.log("\nRESULTADO: ✅ TODO CORRECTO");
process.exit(fail ? 1 : 0);
