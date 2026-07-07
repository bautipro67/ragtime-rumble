/* ============================================================
   RAGTIME RUMBLE — Jefes
   Cada jefe recibe el API del juego "G" y produce proyectiles y
   peligros a través de él. Varias fases con patrones distintos.
   API usada:
     G.player            -> {x,y,w,h}
     G.W, G.H, G.groundY
     G.spawnProj(opts)   -> proyectil enemigo
     G.spawnHazard(opts) -> peligro rectangular telegrafiado
     G.burst(x,y,opts)   -> partículas
     G.shake(n)
     G.rand(a,b) G.randi(a,b) G.pick(arr)
   ============================================================ */
(function () {
  const PINK = "#ff4fa3";
  const TAU = Math.PI * 2;
  function roundRectB(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  const star = (ctx, x, y, r, n) => { ctx.beginPath(); for (let i = 0; i < n * 2; i++) { const rr = i % 2 ? r * 0.45 : r, a = i * Math.PI / n - Math.PI / 2; ctx[i ? "lineTo" : "moveTo"](x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); };
  function gearShape(ctx, x, y, r, teeth) { ctx.beginPath(); for (let i = 0; i < teeth; i++) { const a0 = i / teeth * TAU, a1 = (i + 0.5) / teeth * TAU; ctx.lineTo(x + Math.cos(a0) * r, y + Math.sin(a0) * r); ctx.lineTo(x + Math.cos(a0 + 0.14) * r * 1.3, y + Math.sin(a0 + 0.14) * r * 1.3); ctx.lineTo(x + Math.cos(a1 - 0.14) * r * 1.3, y + Math.sin(a1 - 0.14) * r * 1.3); ctx.lineTo(x + Math.cos(a1) * r, y + Math.sin(a1) * r); } ctx.closePath(); }

  class Boss {
    constructor(G, cfg) {
      this.G = G;
      this.cfg = cfg;
      this.maxHp = cfg.hp;
      this.hp = cfg.hp;
      this.name = cfg.name;
      this.phase = 1;
      this.maxPhases = (cfg.thresholds || []).length + 1;
      this.shielded = false;
      this.t = 0;
      this.atkT = cfg.firstDelay != null ? cfg.firstDelay : 1.4;
      this.flash = 0;
      this.dead = false;
      this.dying = 0;
      this.timers = [];
      this.thresholds = cfg.thresholds || []; // fracciones de vida que disparan fase
      this.faceWobble = 0;
    }
    after(delay, fn) { this.timers.push({ at: this.t + delay, fn }); }
    runTimers() {
      for (let i = this.timers.length - 1; i >= 0; i--) {
        if (this.t >= this.timers[i].at) { const f = this.timers[i].fn; this.timers.splice(i, 1); f(); }
      }
    }
    // elige ataque ponderado pero NUNCA repite el anterior (menos aleatorio/injusto)
    choice(weights, fns) {
      let s = 0; for (const w of weights) s += w; let r = Math.random() * s, i = weights.length - 1;
      for (let k = 0; k < weights.length; k++) { r -= weights[k]; if (r < 0) { i = k; break; } }
      if (i === this._lastAtk && weights.length > 1) i = (i + 1) % weights.length; // evita repetir seguido
      this._lastAtk = i;
      return fns[i].call(this);
    }
    pPos() { const p = this.G.player; return { x: p.x + p.w / 2, y: p.y + p.h / 2 }; }
    aim(fx, fy, speed) {
      const p = this.pPos(); let dx = p.x - fx, dy = p.y - fy;
      const d = Math.hypot(dx, dy) || 1; return { vx: dx / d * speed, vy: dy / d * speed };
    }
    hit(d) {
      if (this.dead) return false;
      if (this.shielded) { this.flash = 0.04; if (Math.random() < 0.3) this.G.burst(this.getHitboxes()[0].x + this.G.rand(0, 80), this.getHitboxes()[0].y + 20, { n: 1, color: "#9fe0ff", smin: 1, smax: 3 }); return false; }
      this.hp -= d; this.flash = 0.05;
      if (this.thresholds.length && this.hp / this.maxHp <= this.thresholds[0]) {
        this.thresholds.shift(); this.phase++;
        if (this.onPhase) this.onPhase(this.phase);
        if (window.AUDIO && AUDIO.sting) AUDIO.sting("phase");
      }
      if (this.hp <= 0) { this.hp = 0; this.dead = true; this.dying = 1.6; if (this.G.hitStop) this.G.hitStop(0.14); }
      return true;
    }
    // escudo: invulnerable hasta que parres su núcleo rosa
    raiseShield() {
      if (this.shielded || this.dead) return;
      this.shielded = true; this.G.shake(8);
      const hb = this.getHitboxes()[0], bcx = hb.x + hb.w / 2;
      // el núcleo sale DELANTE del jefe (hacia el centro), NO dentro de su cuerpo, y a media altura cómoda
      let cx = bcx > this.G.W / 2 ? bcx - 165 : bcx + 165;
      cx = Math.max(200, Math.min(this.G.W - 200, cx));
      const cy = this.G.groundY - 140;
      if (this.atkT < 1.6) this.atkT = 1.6;   // respiro: el jefe no ataca mientras vas a por el parry
      this.G.spawnProj({ x: cx, y: cy, vx: 0, vy: 0, r: 22, shape: "ball", color: "#ff4fa3", parry: true, core: true, noFloor: true, life: 11, host: this, hostX: bcx, hostY: hb.y + hb.h / 2 });
      this.G.floatText && this.G.floatText(cx, cy - 36, "¡ESCUDO! salta y haz PARRY al núcleo rosa", "#9fe0ff");
      this.after(11, () => { if (this.shielded) this.breakShield(); }); // anti-bloqueo
    }
    breakShield() { this.shielded = false; this.flash = 0.1; this.G.shake(10); }
    update(dt) {
      this.t += dt;
      if (this.flash > 0) this.flash -= dt;
      this.faceWobble = Math.sin(this.t * 4) * 3;
      if (this.dead) { this.dying -= dt; return; }
      this.runTimers();
      this.atkT -= dt;
      if (this.atkT <= 0) { this.atkT = this.choose() * (this.G.diff ? this.G.diff.atk : 1); }
      if (this.behave) this.behave(dt);
    }
    // utilidades de dibujo
    eye(ctx, x, y, r) {
      const p = this.pPos(), a = Math.atan2(p.y - y, p.x - x);
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = Math.max(2.5, r * 0.2); ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(x, y, r * 0.82, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.moveTo(x, y); ctx.arc(x, y, r * 0.92, a - 0.5, a + 0.5); ctx.closePath(); ctx.fill();
    }
    outline(ctx, w) { ctx.strokeStyle = "#1a120a"; ctx.lineWidth = w || 5; ctx.stroke(); }
  }

  /* ============================================================
     1 — GENERAL ESPORO (hongo)
     ============================================================ */
  class SporeBoss extends Boss {
    constructor(G) {
      super(G, { hp: 640, name: "General Esporo", thresholds: [0.45], firstDelay: 1.2 });
      this.w = 200; this.h = 200;
      this.x = G.W - 320; this.y = G.groundY - this.h;
      this.hopVy = 0; this.baseX = this.x; this.hopT = 0;
    }
    getHitboxes() { return [{ x: this.x + 30, y: this.y + 40, w: this.w - 60, h: this.h - 40 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.45, 0.30, 0.25], [this.lobSpores, this.spray, this.minions]);
      return this.choice([1, 1], [this.bounceBurst, this.rainSpores]);
    }
    lobSpores() {
      const cx = this.x + this.w / 2, cy = this.y + 50;
      for (let i = 0; i < 3; i++) {
        this.after(i * 0.35, () => {
          const p = this.pPos();
          const vx = (p.x - cx) / 70 + this.G.rand(-1, 1);
          this.G.spawnProj({ x: cx, y: cy, vx, vy: -7 - Math.random() * 2, grav: 22, r: 16, shape: "spore", color: "#caa24a", parry: i === 1, bounce: false });
          this.G.sfx && this.G.sfx("shoot");
        });
      }
      return 1.7;
    }
    spray() {
      const cx = this.x + 30, cy = this.y + 90;
      for (let i = 0; i < 5; i++) {
        const a = Math.PI - 0.5 - i * 0.18;
        this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 6, vy: Math.sin(a) * 6, r: 12, shape: "spore", color: "#b98b3a" });
      }
      return 1.5;
    }
    minions() {
      const n = this.phase === 1 ? 2 : 1;
      for (let i = 0; i < n; i++) this.after(i * 0.5, () => {
        this.G.spawnProj({
          x: this.x + 40, y: this.G.groundY - 46, vx: -2.4, vy: 0, grav: 26, r: 22,
          shape: "walker", color: "#d98c5f", hp: 3, w: 44, h: 46, walk: true,
        });
      });
      return 2.1;
    }
    bounceBurst() {
      this.hopT = 0.001; this.hopVy = -15;
      this.after(0.55, () => {
        const cx = this.x + this.w / 2, cy = this.G.groundY - 20;
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI + i * (Math.PI / 9);
          this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5.5, vy: Math.sin(a) * 5.5, r: 12, shape: "spore", color: "#caa24a", parry: i === 5 });
        }
        this.G.shake(8); this.G.sfx && this.G.sfx("explode");
      });
      return 1.9;
    }
    rainSpores() {
      for (let i = 0; i < 6; i++) this.after(i * 0.22, () => {
        const x = this.G.rand(120, this.G.W - 120);
        this.G.spawnProj({ x, y: -20, vx: 0, vy: 4, grav: 12, r: 14, shape: "spore", color: "#caa24a", parry: i % 3 === 0 });
      });
      return 2.0;
    }
    behave(dt) {
      if (this.hopT > 0) {
        this.hopVy += 50 * dt; this.y += this.hopVy;
        const floor = this.G.groundY - this.h;
        if (this.y >= floor) { this.y = floor; this.hopT = 0; this.hopVy = 0; }
      }
    }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, gy = this.G.groundY;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, gy - 6, 108, 16, 0, 0, TAU); ctx.fill();
      // esporas flotando (ambiente)
      ctx.fillStyle = this.phase === 1 ? "rgba(202,162,74,0.5)" : "rgba(180,120,200,0.5)";
      for (let i = 0; i < 6; i++) { const mx = cx + Math.sin(this.t * 0.9 + i * 1.7) * 118 + (i - 3) * 34, my = this.y + 70 - ((this.t * 16 + i * 36) % 170); ctx.beginPath(); ctx.arc(mx, my, 2 + (i % 2), 0, TAU); ctx.fill(); }
      // brazos de goma
      const arm = Math.sin(this.t * 3) * 8;
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 11;
      ctx.beginPath(); ctx.moveTo(cx - 48, this.y + 150); ctx.quadraticCurveTo(cx - 88, this.y + 150 + arm, cx - 96, this.y + 182 + arm); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx + 48, this.y + 150); ctx.quadraticCurveTo(cx + 88, this.y + 150 - arm, cx + 96, this.y + 182 - arm); ctx.stroke();
      ctx.fillStyle = "#fff"; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.arc(cx - 96, this.y + 186 + arm, 12, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx + 96, this.y + 186 - arm, 12, 0, TAU); ctx.fill(); ctx.stroke();
      // tallo con sombreado a los lados
      const sg = ctx.createLinearGradient(cx - 60, 0, cx + 60, 0); sg.addColorStop(0, "#c2ad7e"); sg.addColorStop(0.45, flash ? "#fff" : "#f6ecd6"); sg.addColorStop(1, "#bda874");
      ctx.fillStyle = flash ? "#fff" : sg;
      ctx.beginPath(); ctx.moveTo(cx - 58, gy); ctx.quadraticCurveTo(cx - 70, this.y + 120, cx - 48, this.y + 104); ctx.lineTo(cx + 48, this.y + 104); ctx.quadraticCurveTo(cx + 70, this.y + 120, cx + 58, gy); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      // anillo del tallo (faldón del hongo)
      ctx.strokeStyle = "rgba(0,0,0,0.13)"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 46, this.y + 122); ctx.quadraticCurveTo(cx, this.y + 130, cx + 46, this.y + 122); ctx.stroke();
      // ---- copa del hongo (degradado radial = volumen) ----
      const capA = this.phase === 1 ? "#e0584a" : "#b552d8", capM = this.phase === 1 ? "#c0392b" : "#8c2bb0", capB = this.phase === 1 ? "#7f1e12" : "#531a70";
      const cg = ctx.createRadialGradient(cx - 30, this.y + 12, 12, cx, this.y + 64, 152); cg.addColorStop(0, flash ? "#fff" : capA); cg.addColorStop(0.62, flash ? "#fff" : capM); cg.addColorStop(1, flash ? "#eee" : capB);
      ctx.fillStyle = flash ? "#fff" : cg;
      ctx.beginPath(); ctx.moveTo(cx - 102, this.y + 104); ctx.quadraticCurveTo(cx, this.y - 48, cx + 102, this.y + 104); ctx.quadraticCurveTo(cx + 55, this.y + 134, cx, this.y + 132); ctx.quadraticCurveTo(cx - 55, this.y + 134, cx - 102, this.y + 104); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      // branquias bajo el borde de la copa
      ctx.strokeStyle = this.phase === 1 ? "rgba(90,20,12,0.5)" : "rgba(60,18,78,0.5)"; ctx.lineWidth = 2.5;
      for (let i = -4; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 8, this.y + 110); ctx.lineTo(cx + i * 21, this.y + 127); ctx.stroke(); }
      // brillo satinado
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(cx - 38, this.y + 52, 30, 14, -0.45, 0, TAU); ctx.fill();
      // manchas con relieve (sombra + cuerpo + reflejo)
      [[-58, 70, 15], [56, 72, 13], [-16, 92, 11], [40, 32, 10], [-2, 50, 18]].forEach(s => {
        const sxp = cx + s[0], syp = this.y + s[1], rr = s[2];
        ctx.fillStyle = "rgba(0,0,0,0.13)"; ctx.beginPath(); ctx.arc(sxp, syp + 2, rr, 0, TAU); ctx.fill();
        ctx.fillStyle = flash ? "#eee" : "#f3e7cf"; ctx.beginPath(); ctx.arc(sxp, syp, rr, 0, TAU); ctx.fill();
        ctx.strokeStyle = "rgba(0,0,0,0.14)"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.beginPath(); ctx.arc(sxp - rr * 0.3, syp - rr * 0.3, rr * 0.3, 0, TAU); ctx.fill();
      });
      // ---- gorra militar apoyada SOBRE la copa ----
      ctx.fillStyle = "rgba(0,0,0,0.16)"; ctx.beginPath(); ctx.ellipse(cx, this.y + 30, 50, 9, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#3a4a2a"; roundRectB(ctx, cx - 34, this.y - 10, 68, 28, 8); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.12)"; roundRectB(ctx, cx - 30, this.y - 6, 60, 8, 4); ctx.fill();
      ctx.fillStyle = flash ? "#eee" : "#2a3a1a"; roundRectB(ctx, cx - 46, this.y + 16, 92, 13, 5); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = "#ffd24a"; star(ctx, cx, this.y + 4, 9, 5); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a120a"; ctx.stroke();
      // ---- cara ----
      ctx.fillStyle = "rgba(200,90,70,0.32)"; ctx.beginPath(); ctx.arc(cx - 44, this.y + 162, 10, 0, TAU); ctx.arc(cx + 44, this.y + 162, 10, 0, TAU); ctx.fill();
      this.eye(ctx, cx - 26, this.y + 150, 17); this.eye(ctx, cx + 26, this.y + 150, 17);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(cx - 44, this.y + 130); ctx.lineTo(cx - 12, this.y + 142); ctx.moveTo(cx + 44, this.y + 130); ctx.lineTo(cx + 12, this.y + 142); ctx.stroke();
      ctx.fillStyle = "#5a1a14";
      if (this.phase === 1) { ctx.beginPath(); ctx.arc(cx, this.y + 176, 16, 0, Math.PI); ctx.closePath(); ctx.fill(); }
      else { ctx.beginPath(); ctx.moveTo(cx - 24, this.y + 174); for (let i = 0; i <= 6; i++) { const xx = cx - 24 + i * (48 / 6); ctx.lineTo(xx, this.y + 174 + (i % 2 ? 13 : 0)); } ctx.lineTo(cx + 24, this.y + 174); ctx.closePath(); ctx.fill(); }
      ctx.lineWidth = 3; ctx.strokeStyle = "#1a120a"; ctx.stroke();
    }
  }

  /* ============================================================
     2 — CAPITÁN SALMUERA (pirata del mar)
     ============================================================ */
  class PirateBoss extends Boss {
    constructor(G) {
      super(G, { hp: 800, name: "Capitán Salmuera", thresholds: [0.5], firstDelay: 1.3 });
      this.w = 190; this.h = 220;
      this.x = G.W - 300; this.y = G.groundY - this.h;
      this.bob = 0;
    }
    getHitboxes() { return [{ x: this.x + 20, y: this.y + 20, w: this.w - 40, h: this.h - 30 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.4, 0.32, 0.28], [this.cannonArc, this.straightShots, this.spouts]);
      return this.choice([0.4, 0.32, 0.28], [this.serpent, this.bubbles, this.cannonArc]);
    }
    cannonArc() {
      const cx = this.x + 20, cy = this.y + 70;
      for (let i = 0; i < 3; i++) this.after(i * 0.4, () => {
        const p = this.pPos();
        this.G.spawnProj({ x: cx, y: cy, vx: (p.x - cx) / 75, vy: -8, grav: 20, r: 18, shape: "ball", color: "#3a3a44", parry: i === 1 });
        this.G.shake(4); this.G.sfx && this.G.sfx("shootBig");
      });
      return 1.8;
    }
    straightShots() {
      // a la altura del pecho del jugador: se esquivan AGACHÁNDOSE o saltando (antes pasaban por encima sin tocar a nadie)
      const cx = this.x + 10, cy = this.y + 150;
      for (let i = 0; i < 4; i++) this.after(i * 0.22, () => {
        this.G.spawnProj({ x: cx, y: cy + this.G.rand(-20, 20), vx: -8.5, vy: 0, r: 13, shape: "ball", color: "#2a2a33", parry: i === 3 });
        this.G.sfx && this.G.sfx("shoot");
      });
      return 1.6;
    }
    spouts() {
      for (let i = 0; i < 3; i++) this.after(i * 0.5, () => {
        const x = this.G.rand(120, this.G.W - 360);
        this.G.spawnHazard({ x: x - 35, y: this.G.groundY - 260, w: 70, h: 260, telegraph: 0.7, active: 0.6, color: "#5fb6e0", type: "spout" });
      });
      return 2.2;
    }
    serpent() {
      const y = this.G.rand(this.G.groundY - 260, this.G.groundY - 120);
      this.G.spawnHazard({ x: -40, y, w: 90, h: 90, telegraph: 0.6, active: 0, color: PINK, type: "serpentWarn" });
      this.after(0.7, () => {
        this.G.spawnProj({ x: -80, y: y + 45, vx: 12, vy: 0, r: 46, shape: "serpent", color: "#2f8f5f", noFloor: true, life: 4 });
        this.G.shake(6);
      });
      return 2.4;
    }
    bubbles() {
      for (let i = 0; i < 5; i++) this.after(i * 0.25, () => {
        const x = this.G.rand(120, this.G.W - 120);
        this.G.spawnProj({ x, y: this.G.groundY + 10, vx: this.G.rand(-0.5, 0.5), vy: -2.6, grav: -1.5, r: 18, shape: "bubble", color: "#7fd0f0", parry: i % 2 === 0, noFloor: true, life: 5 });
      });
      return 2.0;
    }
    behave(dt) { this.bob = Math.sin(this.t * 2) * 8; }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, yy = this.y + this.bob, gy = this.G.groundY;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, gy - 6, 120, 16, 0, 0, TAU); ctx.fill();
      // patas de cangrejo
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 7; const lw = Math.sin(this.t * 4) * 5;
      [[-1, 0], [-1, 26], [1, 0], [1, 26]].forEach(p => { ctx.beginPath(); ctx.moveTo(cx + p[0] * 58, yy + 130); ctx.quadraticCurveTo(cx + p[0] * (104 + p[1]), yy + 140 + lw, cx + p[0] * (98 + p[1]), gy - 12); ctx.stroke(); });
      // barril/casco
      ctx.fillStyle = "#5a3a22"; roundRectB(ctx, cx - 82, gy - 72, 164, 66, 14); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = "#3a2614"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 82, gy - 40); ctx.lineTo(cx + 82, gy - 40); ctx.stroke();
      // cuerpo
      const bc1 = this.phase === 1 ? "#e06a4a" : "#c03a5a", bc2 = this.phase === 1 ? "#a8402a" : "#852240";
      const bg = ctx.createLinearGradient(0, yy, 0, yy + this.h); bg.addColorStop(0, flash ? "#fff" : bc1); bg.addColorStop(1, flash ? "#eee" : bc2);
      ctx.fillStyle = flash ? "#fff" : bg; ctx.beginPath(); ctx.ellipse(cx, yy + this.h / 2, this.w / 2, this.h / 2.3, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.beginPath(); ctx.ellipse(cx + 26, yy + this.h / 2 + 6, this.w / 3, this.h / 3, 0, 0, TAU); ctx.fill();
      // brazo + pinza-cañón
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(cx - 40, yy + 110); ctx.quadraticCurveTo(cx - 72, yy + 96, this.x - 4, yy + 86); ctx.stroke();
      ctx.fillStyle = flash ? "#fff" : bc2; ctx.beginPath(); ctx.ellipse(this.x - 2, yy + 84, 36, 26, -0.25, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(this.x - 18, yy + 80, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = "#3a3a3a"; ctx.beginPath(); ctx.arc(this.x - 18, yy + 80, 7, 0, TAU); ctx.fill();
      // tricornio + calavera
      ctx.fillStyle = flash ? "#fff" : "#241a12"; ctx.beginPath(); ctx.moveTo(cx - 62, yy + 30); ctx.quadraticCurveTo(cx, yy - 50, cx + 62, yy + 30); ctx.quadraticCurveTo(cx, yy + 6, cx - 62, yy + 30); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = "#e8e0c8"; ctx.beginPath(); ctx.arc(cx, yy - 4, 11, 0, TAU); ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = "#1a120a"; ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(cx - 4, yy - 5, 2.6, 0, TAU); ctx.arc(cx + 4, yy - 5, 2.6, 0, TAU); ctx.fill();
      // ojo + parche
      this.eye(ctx, cx + 26, yy + 72, 18);
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(cx - 26, yy + 70, 17, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 48, yy + 48); ctx.lineTo(cx - 6, yy + 60); ctx.stroke();
      ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx + 46, yy + 54); ctx.lineTo(cx + 12, yy + 62); ctx.stroke();
      // boca con dientes
      ctx.fillStyle = "#3a1410"; ctx.beginPath(); ctx.arc(cx, yy + 104, 16, 0, Math.PI); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.fillRect(cx - 11, yy + 104, 7, 7); ctx.fillRect(cx + 4, yy + 104, 7, 7);
    }
  }

  /* ============================================================
     3 — MADAME POLILLA (polilla bruja voladora)
     ============================================================ */
  class MothBoss extends Boss {
    constructor(G) {
      super(G, { hp: 880, name: "Madame Polilla", thresholds: [0.5], firstDelay: 1.4 });
      this.w = 170; this.h = 150;
      this.x = G.W / 2 - this.w / 2; this.y = 130;
      this.cx = this.x; this.wing = 0; this.tornadoX = 0;
    }
    getHitboxes() { return [{ x: this.x + 25, y: this.y + 20, w: this.w - 50, h: this.h - 30 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.4, 0.32, 0.28], [this.larvae, this.scales, this.dustBeam]);
      return this.choice([0.45, 0.55], [this.tornado, this.featherFan]);
    }
    larvae() {
      const cx = this.x + this.w / 2, cy = this.y + this.h - 10;
      for (let i = 0; i < 3; i++) this.after(i * 0.4, () => {
        this.G.spawnProj({ x: cx + this.G.rand(-30, 30), y: cy, vx: 0, vy: 1.5, r: 13, shape: "larva", color: "#9ad06a", homing: true, homeTime: 2.5, homeStr: 2.6, speed: 3.4 });
      });
      return 2.0;
    }
    scales() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.25 + i * 0.07);
        this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5.5, vy: Math.sin(a) * 5.5, r: 11, shape: "feather", color: "#c9a0e0", parry: i === 3 });
      }
      return 1.5;
    }
    dustBeam() {
      // rayo de polvo lunar que cae SOBRE el jugador (antes caía bajo la polilla y casi nunca amenazaba)
      const x = Math.max(140, Math.min(this.G.W - 140, this.pPos().x));
      this.G.spawnHazard({ x: x - 45, y: 60, w: 90, h: this.G.groundY - 60, telegraph: 0.8, active: 0.9, color: "#caa0ea", type: "beam", follow: false });
      return 2.0;
    }
    tornado() {
      const fromLeft = this.pPos().x > this.G.W / 2;
      const x0 = fromLeft ? -60 : this.G.W + 60;
      // activo 3.6 s: cruza la pantalla ENTERA (antes moría a mitad de camino sin llegar al jugador)
      this.G.spawnHazard({ x: x0 - 50, y: this.G.groundY - 220, w: 100, h: 220, telegraph: 0.7, active: 3.6, vx: fromLeft ? 6.2 : -6.2, color: "#b48ce0", type: "tornado" });
      return 2.6;
    }
    featherFan() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let k = 0; k < 2; k++) this.after(k * 0.5, () => {
        for (let i = 0; i < 12; i++) {
          const a = i * (TAU / 12) + k * 0.26;
          this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.5, vy: Math.sin(a) * 4.5, r: 10, shape: "feather", color: "#c9a0e0", parry: i === 0 });
        }
      });
      return 1.9;
    }
    behave(dt) {
      this.wing += dt * 14;
      // flota en seno
      this.x = (this.G.W / 2 - this.w / 2) + Math.sin(this.t * 1.1) * 240;
      this.y = 120 + Math.sin(this.t * 1.7) * 40;
    }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      const flap = Math.sin(this.wing) * 0.45 + 0.75;
      ctx.lineJoin = "round";
      // alas
      [[-1], [1]].forEach(s => {
        ctx.save(); ctx.translate(cx, cy); ctx.scale(s[0] * flap, 1);
        const wg = ctx.createLinearGradient(0, 0, 138, 0); wg.addColorStop(0, flash ? "#fff" : (this.phase === 1 ? "#8a5fb0" : "#6a3a92")); wg.addColorStop(1, flash ? "#eee" : (this.phase === 1 ? "#5a3580" : "#3f2060"));
        ctx.fillStyle = flash ? "#fff" : wg;
        ctx.beginPath(); ctx.moveTo(0, -14); ctx.quadraticCurveTo(130, -78, 138, -2); ctx.quadraticCurveTo(120, 78, 0, 44); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = flash ? "#eee" : "#2a1a3a"; ctx.beginPath(); ctx.moveTo(20, 24); ctx.quadraticCurveTo(80, 30, 100, 60); ctx.quadraticCurveTo(50, 56, 12, 40); ctx.closePath(); ctx.fill();
        ctx.fillStyle = "#e8c860"; ctx.beginPath(); ctx.arc(86, -16, 17, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = "#7a1020"; ctx.beginPath(); ctx.arc(86, -16, 8, 0, TAU); ctx.fill();
        ctx.fillStyle = "#caa0e0"; ctx.beginPath(); ctx.arc(50, -24, 7, 0, TAU); ctx.fill();
        ctx.restore();
      });
      // cuerpo peludo
      const bgc = ctx.createLinearGradient(0, cy - 50, 0, cy + 50); bgc.addColorStop(0, flash ? "#fff" : "#5a4660"); bgc.addColorStop(1, flash ? "#eee" : "#2e2238");
      ctx.fillStyle = flash ? "#fff" : bgc; ctx.beginPath(); ctx.ellipse(cx, cy, 32, 50, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.25)"; ctx.lineWidth = 3; for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx - 26, cy + i * 14); ctx.quadraticCurveTo(cx, cy + i * 14 + 4, cx + 26, cy + i * 14); ctx.stroke(); }
      // antenas emplumadas
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4;
      [[-1], [1]].forEach(s => { ctx.beginPath(); ctx.moveTo(cx + s[0] * 10, cy - 44); ctx.quadraticCurveTo(cx + s[0] * 36, cy - 86, cx + s[0] * 50, cy - 76); ctx.stroke(); for (let k = 0; k < 4; k++) { const t = k / 3, ax = cx + s[0] * (10 + 26 * t), ay = cy - 44 - 42 * t; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(ax + s[0] * 8, ay - 4); ctx.stroke(); } });
      // sombrerito de bruja
      ctx.fillStyle = flash ? "#fff" : "#1a1226"; ctx.beginPath(); ctx.moveTo(cx - 30, cy - 40); ctx.lineTo(cx + 8, cy - 96); ctx.lineTo(cx + 22, cy - 38); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = "#7a4fa0"; ctx.fillRect(cx + 1, cy - 60, 13, 8);
      // ojos + boca
      this.eye(ctx, cx - 14, cy - 14, 15); this.eye(ctx, cx + 14, cy - 14, 15);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy + 6, 6, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    }
  }

  /* ============================================================
     4 — EL COLECCIONISTA (jefe final, 3 fases)
     ============================================================ */
  class CollectorBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1180, name: "El Coleccionista", thresholds: [0.66, 0.33], firstDelay: 1.3 });
      this.w = 220; this.h = 260;
      this.x = G.W / 2 - this.w / 2; this.y = 70;
      this.spiralA = 0; this.eyeGlow = 0;
    }
    getHitboxes() { return [{ x: this.x + 30, y: this.y + 30, w: this.w - 60, h: this.h - 50 }]; }
    choose() {
      if (this.phase === 1) return this.choice([1, 1], [this.coins, this.fire]);
      if (this.phase === 2) return this.choice([0.4, 0.32, 0.28], [this.laser, this.hands, this.fire]);
      return this.choice([0.55, 0.45], [this.spiral, this.coins]);
    }
    coins() {
      const cx = this.x + this.w / 2, cy = this.y + 90;
      for (let i = 0; i < 5; i++) this.after(i * 0.18, () => {
        const p = this.pPos();
        this.G.spawnProj({ x: cx, y: cy, vx: (p.x - cx) / 80 + this.G.rand(-1.5, 1.5), vy: -9, grav: 20, r: 16, shape: "coin", color: "#f0c84a", parry: i % 2 === 0 });
        this.G.sfx && this.G.sfx("coin");
      });
      return 1.7;
    }
    fire() {
      const cx = this.x + this.w / 2, cy = this.y + 110;
      for (let i = 0; i < 3; i++) this.after(i * 0.45, () => {
        const v = this.aim(cx, cy, 5.2);
        this.G.spawnProj({ x: cx, y: cy, vx: v.vx, vy: v.vy, r: 16, shape: "fire", color: "#ff7a2a", homing: true, homeTime: 1.4, homeStr: 1.8, speed: 5.2 });
      });
      return 1.8;
    }
    laser() {
      const horizontal = Math.random() < 0.5;
      if (horizontal) {
        const y = this.G.rand(this.G.groundY - 240, this.G.groundY - 90);
        this.G.spawnHazard({ x: 0, y: y - 22, w: this.G.W, h: 44, telegraph: 0.9, active: 0.5, color: "#ff5a5a", type: "laser" });
      } else {
        for (let i = 0; i < 2; i++) {
          const x = this.G.rand(150, this.G.W - 150);
          this.G.spawnHazard({ x: x - 22, y: 0, w: 44, h: this.G.groundY, telegraph: 0.9 + i * 0.2, active: 0.5, color: "#ff5a5a", type: "laser" });
        }
      }
      return 1.9;
    }
    hands() {
      for (let i = 0; i < 3; i++) this.after(i * 0.45, () => {
        const x = this.G.rand(120, this.G.W - 120);
        this.G.spawnHazard({ x: x - 45, y: this.G.groundY - 150, w: 90, h: 150, telegraph: 0.7, active: 0.5, color: "#a04add", type: "hand" });
      });
      return 2.1;
    }
    spiral() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let k = 0; k < 14; k++) this.after(k * 0.1, () => {
        this.spiralA += 0.5;
        for (let arm = 0; arm < 3; arm++) {
          const a = this.spiralA + arm * (TAU / 3);
          this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.2, vy: Math.sin(a) * 4.2, r: 10, shape: "ball", color: "#c060ff", parry: k % 5 === 0 && arm === 0 });
        }
      });
      return 2.4;
    }
    behave(dt) {
      this.eyeGlow = (Math.sin(this.t * 6) * 0.5 + 0.5);
      this.x = (this.G.W / 2 - this.w / 2) + Math.sin(this.t * 0.8) * 120;
      this.y = 70 + Math.sin(this.t * 1.3) * 24;
    }
    onPhase(n) { this.G.shake(16); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2;
      const col = this.phase === 1 ? "#3a2356" : this.phase === 2 ? "#5a163e" : "#6a0c18";
      const col2 = this.phase === 1 ? "#241038" : this.phase === 2 ? "#3a0c28" : "#3a0610";
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      // llamas (fase 3)
      if (this.phase >= 3) for (let i = 0; i < 7; i++) { const fx = this.x + 24 + i * 28, fh = 22 + Math.abs(Math.sin(this.t * 8 + i)) * 26; ctx.fillStyle = i % 2 ? "#ff7a2a" : "#ffd24a"; ctx.beginPath(); ctx.moveTo(fx - 10, this.y + this.h); ctx.quadraticCurveTo(fx, this.y + this.h - fh, fx + 10, this.y + this.h); ctx.fill(); }
      // capa
      const cg = ctx.createLinearGradient(0, this.y, 0, this.y + this.h); cg.addColorStop(0, flash ? "#fff" : col); cg.addColorStop(1, flash ? "#eee" : col2);
      ctx.fillStyle = flash ? "#fff" : cg;
      ctx.beginPath(); ctx.moveTo(this.x + 24, this.y + 64); ctx.quadraticCurveTo(cx, this.y - 6, this.x + this.w - 24, this.y + 64); ctx.lineTo(this.x + this.w + 16, this.y + this.h); ctx.quadraticCurveTo(cx, this.y + this.h - 46, this.x - 16, this.y + this.h); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      // garras
      ctx.fillStyle = "#fff"; ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3;
      [[-1], [1]].forEach(s => { const hx = cx + s[0] * (this.w / 2 + 6), hy = this.y + this.h - 60 + Math.sin(this.t * 2 + s[0]) * 8; ctx.beginPath(); ctx.arc(hx, hy, 14, 0, TAU); ctx.fill(); ctx.stroke(); for (let k = -1; k <= 1; k++) { ctx.beginPath(); ctx.moveTo(hx + k * 6, hy + 8); ctx.lineTo(hx + k * 8, hy + 22); ctx.stroke(); } });
      // cuernos
      ctx.fillStyle = flash ? "#fff" : "#e8e0d0";
      [[-1], [1]].forEach(s => { ctx.beginPath(); ctx.moveTo(cx + s[0] * 42, this.y + 26); ctx.quadraticCurveTo(cx + s[0] * 86, this.y - 34, cx + s[0] * 54, this.y - 6); ctx.quadraticCurveTo(cx + s[0] * 52, this.y + 16, cx + s[0] * 42, this.y + 26); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke(); });
      // cara
      const fg = ctx.createLinearGradient(0, this.y + 40, 0, this.y + 160); fg.addColorStop(0, flash ? "#fff" : "#efe0c0"); fg.addColorStop(1, flash ? "#eee" : "#d8c098");
      ctx.fillStyle = flash ? "#fff" : fg; ctx.beginPath(); ctx.ellipse(cx, this.y + 96, 64, 72, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      // chistera con cinta $
      ctx.fillStyle = flash ? "#fff" : "#1a1018"; roundRectB(ctx, cx - 70, this.y + 26, 140, 14, 6); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke();
      roundRectB(ctx, cx - 46, this.y - 36, 92, 66, 8); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#7a1020"; ctx.fillRect(cx - 46, this.y + 8, 92, 14);
      ctx.fillStyle = "#ffd24a"; ctx.font = "bold 18px Georgia"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText("$", cx, this.y + 16); ctx.textBaseline = "alphabetic";
      // ojos brillantes
      const eg = 0.55 + this.eyeGlow * 0.45;
      [[-26], [26]].forEach(s => {
        const ex = cx + s[0], ey = this.y + 90;
        const glow = ctx.createRadialGradient(ex, ey, 1, ex, ey, 22); glow.addColorStop(0, `rgba(255,${70 - this.phase * 14},40,${eg})`); glow.addColorStop(1, "rgba(255,60,30,0)");
        ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(ex, ey, 22, 0, TAU); ctx.fill();
        ctx.fillStyle = `rgba(255,${95 - this.phase * 14},60,${eg + 0.2})`; ctx.beginPath(); ctx.ellipse(ex, ey, 13, 17, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(ex, ey + 3, 5, 0, TAU); ctx.fill();
      });
      // cejas
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 46, this.y + 70); ctx.lineTo(cx - 12, this.y + 82); ctx.moveTo(cx + 46, this.y + 70); ctx.lineTo(cx + 12, this.y + 82); ctx.stroke();
      // boca dentada
      ctx.fillStyle = "#2a0810"; ctx.beginPath(); ctx.moveTo(cx - 36, this.y + 130);
      for (let i = 0; i <= 7; i++) { const xx = cx - 36 + i * (72 / 7); ctx.lineTo(xx, this.y + 130 + (i % 2 ? 16 : 2)); }
      ctx.lineTo(cx + 36, this.y + 130); ctx.closePath(); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#1a120a"; ctx.stroke();
      ctx.fillStyle = "#fff"; for (let i = 0; i < 4; i++) ctx.fillRect(cx - 30 + i * 18, this.y + 130, 8, 8);
    }
  }

  /* ============================================================
     5 — DON TORNILLO (autómata de cuerda)
     ============================================================ */
  class RobotBoss extends Boss {
    constructor(G) {
      super(G, { hp: 860, name: "Don Tornillo", thresholds: [0.5], firstDelay: 1.3 });
      this.w = 200; this.h = 230; this.x = G.W - 330; this.y = G.groundY - this.h; this.wind = 0;
    }
    getHitboxes() { return [{ x: this.x + 24, y: this.y + 24, w: this.w - 48, h: this.h - 40 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.4, 0.32, 0.28], [this.rockets, this.gears, this.laser]);
      return this.choice([1, 1], [this.overload, this.boltRain]);
    }
    rockets() {
      const cx = this.x + 24, cy = this.y + 96;
      for (let i = 0; i < 3; i++) this.after(i * 0.42, () => {
        const v = this.aim(cx, cy, 3.2);
        this.G.spawnProj({ x: cx, y: cy, vx: v.vx, vy: v.vy, r: 14, shape: "rocket", color: "#d0563a", homing: true, homeTime: 1.5, homeStr: 1.5, speed: 4.4, parry: i === 1 });
        this.G.sfx && this.G.sfx("shootBig");
      });
      return 1.9;
    }
    gears() {
      for (let i = 0; i < 2; i++) this.after(i * 0.5, () =>
        this.G.spawnProj({ x: this.x + 30, y: this.G.groundY - 34, vx: -4.4, vy: -2, grav: 24, r: 24, shape: "gear", color: "#9099aa", bounce: 5 }));
      return 1.9;
    }
    laser() {
      const y = this.y + 70;
      this.G.spawnHazard({ x: 0, y: y - 22, w: this.G.W, h: 44, telegraph: 0.95, active: 0.5, color: "#ff5a5a", type: "laser" });
      return 2.0;
    }
    overload() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let i = 0; i < 12; i++) { const a = i * (TAU / 12); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.6, vy: Math.sin(a) * 4.6, r: 10, shape: "bolt", color: "#ffe24a", parry: i % 4 === 0 }); }
      this.G.shake(6); return 1.7;
    }
    boltRain() {
      this.G.shake(8);
      for (let i = 0; i < 7; i++) this.after(i * 0.18, () => { const x = this.G.rand(120, this.G.W - 120); this.G.spawnProj({ x, y: -20, vx: 0, vy: 5, grav: 10, r: 12, shape: "bolt", color: "#ffe24a", parry: i % 3 === 0 }); });
      return 2.0;
    }
    behave(dt) { this.wind += dt * 6; }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, gy = this.G.groundY;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, gy - 6, 110, 16, 0, 0, TAU); ctx.fill();
      // patas-resorte
      ctx.strokeStyle = "#5a5a6a"; ctx.lineWidth = 9;
      for (const sx of [-46, 46]) { ctx.beginPath(); for (let k = 0; k < 4; k++) { ctx.moveTo(cx + sx - 9, this.y + 150 + k * 18); ctx.lineTo(cx + sx + 9, this.y + 159 + k * 18); } ctx.stroke(); }
      ctx.fillStyle = "#3a3a48"; roundRectB(ctx, cx - 66, gy - 20, 40, 18, 4); ctx.fill(); roundRectB(ctx, cx + 26, gy - 20, 40, 18, 4); ctx.fill();
      // brazos-engranaje
      ctx.fillStyle = flash ? "#fff" : "#8a90a0";
      for (const s of [-1, 1]) { ctx.save(); ctx.translate(cx + s * (this.w / 2 + 4), this.y + 110); ctx.rotate(this.wind * s); gearShape(ctx, 0, 0, 24, 8); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = "#1a120a"; ctx.stroke(); ctx.fillStyle = "#3a3a48"; ctx.beginPath(); ctx.arc(0, 0, 8, 0, TAU); ctx.fill(); ctx.restore(); ctx.fillStyle = flash ? "#fff" : "#8a90a0"; }
      // cuerpo lata
      const bg = ctx.createLinearGradient(cx - 80, 0, cx + 80, 0); bg.addColorStop(0, "#9aa0b0"); bg.addColorStop(0.5, flash ? "#fff" : "#c2c8d6"); bg.addColorStop(1, "#888fa0");
      ctx.fillStyle = flash ? "#fff" : bg; roundRectB(ctx, cx - 80, this.y + 28, 160, 150, 18); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = "#6a7080"; for (const rx of [-70, 70]) for (const ry of [40, 160]) { ctx.beginPath(); ctx.arc(cx + rx, this.y + ry, 4, 0, TAU); ctx.fill(); }
      ctx.fillStyle = "#2a2e3a"; roundRectB(ctx, cx - 42, this.y + 118, 84, 42, 8); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = this.phase === 1 ? "#7af0a0" : "#ff6a4a"; ctx.fillRect(cx - 36, this.y + 150, 72 * (this.hp / this.maxHp), 6);
      // cabeza
      ctx.fillStyle = flash ? "#fff" : "#b6bcca"; roundRectB(ctx, cx - 46, this.y - 20, 92, 60, 12); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx, this.y - 20); ctx.lineTo(cx, this.y - 46); ctx.stroke();
      ctx.fillStyle = Math.sin(this.t * 10) > 0 ? "#ff5a5a" : "#7a2020"; ctx.beginPath(); ctx.arc(cx, this.y - 50, 6, 0, TAU); ctx.fill();
      this.eye(ctx, cx - 20, this.y + 8, 13); this.eye(ctx, cx + 20, this.y + 8, 13);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.strokeRect(cx - 24, this.y + 24, 48, 12);
      for (let i = 1; i < 5; i++) { ctx.beginPath(); ctx.moveTo(cx - 24 + i * 9.6, this.y + 24); ctx.lineTo(cx - 24 + i * 9.6, this.y + 36); ctx.stroke(); }
    }
  }

  /* ============================================================
     6 — ARLEQUÍN (caja de sorpresas)
     ============================================================ */
  class JesterBoss extends Boss {
    constructor(G) {
      super(G, { hp: 960, name: "Arlequín", thresholds: [0.5], firstDelay: 1.2 });
      this.w = 180; this.h = 210; this.x = G.W - 300; this.y = G.groundY - this.h; this.spiralA = 0;
    }
    getHitboxes() { return [{ x: this.x + 22, y: this.y + 14, w: this.w - 44, h: this.h - 24 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.4, 0.32, 0.28], [this.cards, this.balls, this.confetti]);
      return this.choice([1, 1], [this.boxes, this.pinwheel]);
    }
    cards() {
      const cx = this.x + 30, cy = this.y + 60;
      for (let i = 0; i < 5; i++) { const a = Math.PI - 0.5 - i * 0.18; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 6.2, vy: Math.sin(a) * 6.2, r: 11, shape: "card", color: "#f3e7cf", parry: i === 2 }); }
      return 1.5;
    }
    balls() {
      for (let i = 0; i < 3; i++) this.after(i * 0.4, () => this.G.spawnProj({ x: this.x + 30, y: this.y + 50, vx: -5, vy: -3, grav: 20, r: 18, shape: "ball", color: "#e0506a", bounce: 6, parry: i === 1 }));
      return 1.9;
    }
    confetti() {
      const cx = this.x + 24, cy = this.y + 80;
      for (let k = 0; k < 2; k++) this.after(k * 0.4, () => { for (let i = 0; i < 8; i++) { const a = Math.PI - 1.0 + i * 0.14, sp = this.G.rand(4, 7); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, shape: "confetti", color: this.G.pick(["#ff6a4a", "#ffd24a", "#4ad0e0", "#7af0a0", "#c08aff"]), parry: i === 4 }); } });
      return 1.8;
    }
    boxes() {
      for (let i = 0; i < 3; i++) this.after(i * 0.5, () => {
        const x = this.G.rand(160, this.G.W - 160);
        this.G.spawnHazard({ x: x - 30, y: this.G.groundY - 64, w: 60, h: 64, telegraph: 0.6, active: 0.45, color: "#c0392b", type: "hand" });
        this.after(0.7, () => { for (let j = 0; j < 8; j++) { const a = j * (TAU / 8); this.G.spawnProj({ x, y: this.G.groundY - 32, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, r: 9, shape: "ball", color: "#f0c84a", parry: j === 0 }); } });
      });
      return 2.3;
    }
    pinwheel() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let k = 0; k < 16; k++) this.after(k * 0.09, () => { this.spiralA += 0.42; for (let arm = 0; arm < 4; arm++) { const a = this.spiralA + arm * (TAU / 4); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, r: 9, shape: "ball", color: "#c08aff", parry: k % 5 === 0 && arm === 0 }); } });
      return 2.4;
    }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, gy = this.G.groundY, bob = Math.sin(this.t * 4) * 4;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, gy - 6, 100, 16, 0, 0, TAU); ctx.fill();
      const boxY = this.y + 96;
      ctx.fillStyle = flash ? "#fff" : "#c0392b"; roundRectB(ctx, cx - 72, boxY, 144, gy - boxY - 4, 10); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = "#f0c84a"; for (let i = 0; i < 3; i++) { const dx = cx - 48 + i * 48; ctx.beginPath(); ctx.moveTo(dx, boxY + 28); ctx.lineTo(dx + 16, boxY + 48); ctx.lineTo(dx, boxY + 68); ctx.lineTo(dx - 16, boxY + 48); ctx.closePath(); ctx.fill(); }
      ctx.strokeStyle = "#9a9aa8"; ctx.lineWidth = 8; ctx.beginPath(); for (let k = 0; k < 3; k++) { ctx.moveTo(cx - 10, boxY - 6 - k * 14); ctx.lineTo(cx + 10, boxY - 12 - k * 14); } ctx.stroke();
      // volante del cuello
      ctx.fillStyle = flash ? "#fff" : "#7a4fa0"; ctx.beginPath(); for (let i = 0; i < 9; i++) { const a = i / 8 * TAU; ctx.lineTo(cx + Math.cos(a) * 28, this.y + 58 + bob + Math.sin(a) * 16); } ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke();
      // cabeza
      ctx.fillStyle = flash ? "#fff" : "#f3e7cf"; ctx.beginPath(); ctx.arc(cx, this.y + 30 + bob, 40, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      // gorro de bufón
      const hc = this.phase === 1 ? ["#c0392b", "#2f6fb0", "#ffd24a"] : ["#7a1020", "#3a2a6a", "#c08a10"];
      [[-1, -30], [0, -48], [1, -30]].forEach(p => { ctx.fillStyle = hc[p[0] + 1]; ctx.beginPath(); ctx.moveTo(cx - 18, this.y + 6 + bob); ctx.lineTo(cx + p[0] * 30, this.y + p[1] + bob); ctx.lineTo(cx + 18, this.y + 6 + bob); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = "#e8d28a"; ctx.beginPath(); ctx.arc(cx + p[0] * 30, this.y + p[1] + bob, 6, 0, TAU); ctx.fill(); ctx.stroke(); });
      this.eye(ctx, cx - 15, this.y + 26 + bob, 13); this.eye(ctx, cx + 15, this.y + 26 + bob, 13);
      ctx.fillStyle = "#e06a8a"; ctx.beginPath(); ctx.arc(cx - 26, this.y + 38 + bob, 6, 0, TAU); ctx.arc(cx + 26, this.y + 38 + bob, 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx, this.y + 40 + bob, 14, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    }
  }

  /* ============================================================
     MUNDO 2
     ============================================================ */
  // 7 — CAPITÁN CÚMULO (dirigible, JEFE DE VUELO)
  class AirshipBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1000, name: "Capitán Cúmulo", thresholds: [0.5], firstDelay: 1.2 });
      this.w = 250; this.h = 150; this.x = G.W - 300; this.y = 170; this.sa = 0;
    }
    getHitboxes() { return [{ x: this.x + 26, y: this.y + 14, w: this.w - 52, h: this.h - 20 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.4, 0.32, 0.28], [this.volley, this.puffs, this.flak]);
      return this.choice([1, 1], [this.spiral, this.sweep]);
    }
    volley() {
      const cx = this.x + 6, cy = this.y + this.h / 2;
      for (let i = 0; i < 4; i++) this.after(i * 0.22, () => { this.G.spawnProj({ x: cx, y: cy + this.G.rand(-46, 46), vx: -8, vy: 0, r: 13, shape: "ball", color: "#3a3a44", parry: i === 3, noFloor: true }); this.G.sfx && this.G.sfx("shoot"); });
      return 1.7;
    }
    puffs() {
      const cx = this.x + 16, cy = this.y + this.h / 2;
      for (let i = 0; i < 3; i++) this.after(i * 0.4, () => { const v = this.aim(cx, cy, 3.0); this.G.spawnProj({ x: cx, y: cy, vx: v.vx, vy: v.vy, r: 16, shape: "ball", color: "#e2ecf5", homing: true, homeTime: 2, homeStr: 1.5, speed: 3.4, noFloor: true, parry: i === 1 }); });
      return 1.9;
    }
    flak() {
      const cx = this.x + 20, cy = this.y + this.h / 2;
      for (let i = 0; i < 8; i++) { const a = Math.PI - 0.7 + i * 0.2; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, r: 10, shape: "bolt", color: "#ffd24a", noFloor: true, parry: i === 4 }); }
      return 1.6;
    }
    spiral() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let k = 0; k < 14; k++) this.after(k * 0.09, () => { this.sa += 0.5; for (let arm = 0; arm < 3; arm++) { const a = this.sa + arm * (TAU / 3); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 3.8, vy: Math.sin(a) * 3.8, r: 9, shape: "ball", color: "#9ad0ff", noFloor: true, parry: k % 5 === 0 && arm === 0 }); } });
      return 2.3;
    }
    sweep() {
      // activo 3.8 s: la nube cruza TODA la pantalla (antes se disipaba a mitad y nunca alcanzaba al jugador pegado al borde)
      this.G.spawnHazard({ x: this.G.W + 40, y: 0, w: 80, h: this.G.H, telegraph: 0.7, active: 3.8, vx: -6.5, color: "#cfe2ef", type: "cloud" });
      return 2.6;
    }
    behave(dt) { this.y = 150 + Math.sin(this.t * 1.2) * 90; }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      // hélice
      ctx.save(); ctx.translate(this.x + this.w - 6, cy); ctx.rotate(this.t * 18); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; for (let i = 0; i < 3; i++) { const a = i * TAU / 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.cos(a) * 26, Math.sin(a) * 26); ctx.stroke(); } ctx.restore();
      // globo rayado
      const bg = ctx.createLinearGradient(0, this.y, 0, this.y + this.h); bg.addColorStop(0, flash ? "#fff" : "#d8534a"); bg.addColorStop(1, flash ? "#eee" : "#a83020");
      ctx.fillStyle = flash ? "#fff" : bg; ctx.beginPath(); ctx.ellipse(cx, cy - 8, this.w / 2, this.h / 2.1, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 8; for (let i = -1; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(cx + i * 42, cy - 8, 8, this.h / 2.2, 0, -1.2, 1.2); ctx.stroke(); }
      // góndola
      ctx.fillStyle = flash ? "#fff" : "#6a4a2a"; roundRectB(ctx, cx - 56, cy + 46, 112, 30, 8); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 40, cy + 40); ctx.lineTo(cx - 50, cy + 48); ctx.moveTo(cx + 40, cy + 40); ctx.lineTo(cx + 50, cy + 48); ctx.stroke();
      // cara (cúmulo gruñón)
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(cx - 36, cy - 6, 22, 0, TAU); ctx.arc(cx + 4, cy - 18, 18, 0, TAU); ctx.fill();
      this.eye(ctx, cx - 30, cy - 10, 13); this.eye(ctx, cx + 2, cy - 12, 13);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 44, cy - 24); ctx.lineTo(cx - 18, cy - 18); ctx.moveTo(cx - 12, cy - 26); ctx.lineTo(cx + 14, cy - 22); ctx.stroke();
      ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(cx - 14, cy + 14, 12, 1.05 * Math.PI, 1.95 * Math.PI); ctx.stroke();
    }
  }

  // 8 — CONDESA ESCARCHA (reina de hielo)
  class IceBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1000, name: "Condesa Escarcha", thresholds: [0.5], firstDelay: 1.3 });
      this.w = 180; this.h = 250; this.x = G.W - 300; this.y = G.groundY - this.h; this.sa = 0;
    }
    getHitboxes() { return [{ x: this.x + 28, y: this.y + 30, w: this.w - 56, h: this.h - 40 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.4, 0.32, 0.28], [this.icicles, this.shards, this.snow]);
      return this.choice([1, 1], [this.blizzard, this.beam]);
    }
    icicles() {
      for (let i = 0; i < 5; i++) this.after(i * 0.22, () => { const x = this.G.rand(120, this.G.W - 120); this.G.spawnHazard({ x: x - 14, y: 0, w: 28, h: 60, telegraph: 0.7, active: 0, color: "#bfe6ff", type: "icewarn" }); this.after(0.75, () => this.G.spawnProj({ x, y: -10, vx: 0, vy: 7, grav: 14, r: 12, shape: "icicle", color: "#bfe6ff", parry: i % 3 === 0 })); });
      return 2.1;
    }
    shards() {
      const cy = this.G.groundY - 14;
      for (let i = 0; i < 4; i++) this.after(i * 0.25, () => this.G.spawnProj({ x: this.x + 10, y: cy, vx: -7, vy: 0, r: 11, shape: "icicle", color: "#9fd8f0", noFloor: true, parry: i === 3 }));
      return 1.7;
    }
    snow() {
      const cx = this.x + 30, cy = this.y + 80;
      for (let i = 0; i < 9; i++) { const a = Math.PI * 0.5 + i * 0.16 + Math.PI * 0.4; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.4, vy: Math.sin(a) * 4.4, r: 10, shape: "snow", color: "#eaf6ff", parry: i === 4 }); }
      return 1.6;
    }
    blizzard() {
      for (let i = 0; i < 8; i++) this.after(i * 0.16, () => this.G.spawnProj({ x: this.G.W + 20, y: this.G.rand(60, this.G.groundY - 60), vx: -7, vy: 1.4, r: 9, shape: "snow", color: "#dff1ff", parry: i % 4 === 0 }));
      this.G.shake(5); return 2.0;
    }
    beam() {
      const y = this.y + 70;
      this.G.spawnHazard({ x: 0, y: y - 24, w: this.G.W, h: 48, telegraph: 0.95, active: 0.55, color: "#9fd8f0", type: "laser" });
      return 2.0;
    }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, this.G.groundY - 6, 104, 16, 0, 0, TAU); ctx.fill();
      // vestido
      const dg = ctx.createLinearGradient(0, this.y, 0, this.y + this.h); dg.addColorStop(0, flash ? "#fff" : "#bfe0f0"); dg.addColorStop(1, flash ? "#eee" : "#6fa8c8");
      ctx.fillStyle = flash ? "#fff" : dg; ctx.beginPath(); ctx.moveTo(cx, this.y + 60); ctx.lineTo(cx - 70, this.G.groundY - 6); ctx.lineTo(cx + 70, this.G.groundY - 6); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      for (let i = 0; i < 4; i++) { ctx.fillStyle = "#fff"; star(ctx, cx - 40 + i * 26, this.y + 150 + (i % 2) * 30, 7, 6); ctx.fill(); }
      // cabeza
      ctx.fillStyle = flash ? "#fff" : "#eaf6ff"; ctx.beginPath(); ctx.ellipse(cx, this.y + 50, 40, 46, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      // corona de hielo
      ctx.fillStyle = flash ? "#fff" : "#bfe6ff"; ctx.beginPath(); for (let i = 0; i <= 6; i++) { const x = cx - 36 + i * 12; ctx.lineTo(x, this.y + 14 - (i % 2 ? 22 : 0)); } ctx.lineTo(cx + 36, this.y + 18); ctx.lineTo(cx - 36, this.y + 18); ctx.closePath(); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#1a120a"; ctx.stroke();
      this.eye(ctx, cx - 15, this.y + 46, 14); this.eye(ctx, cx + 15, this.y + 46, 14);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 28, this.y + 30); ctx.lineTo(cx - 6, this.y + 38); ctx.moveTo(cx + 28, this.y + 30); ctx.lineTo(cx + 6, this.y + 38); ctx.stroke();
      ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 8, this.y + 66); ctx.lineTo(cx + 8, this.y + 66); ctx.stroke();
    }
  }

  // 9 — EL CRUPIER (jefe final del Mundo 2, 3 fases)
  class CroupierBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1340, name: "El Crupier", thresholds: [0.66, 0.33], firstDelay: 1.2 });
      this.w = 210; this.h = 250; this.x = G.W / 2 - this.w / 2; this.y = G.groundY - this.h; this.sa = 0; this.wheel = 0;
    }
    getHitboxes() { return [{ x: this.x + 30, y: this.y + 30, w: this.w - 60, h: this.h - 40 }]; }
    choose() {
      if (this.phase === 1) return this.choice([1, 1], [this.cards, this.dice]);
      if (this.phase === 2) return this.choice([0.4, 0.32, 0.28], [this.coins, this.roulette, this.dice]);
      return Math.random() < 0.55 ? this.roulette() : this.coins();
    }
    cards() {
      const cx = this.x + 30, cy = this.y + 80;
      for (let i = 0; i < 6; i++) { const a = Math.PI - 0.4 - i * 0.16; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 6.4, vy: Math.sin(a) * 6.4, r: 11, shape: "card", color: "#f3e7cf", parry: i === 2 }); }
      return 1.5;
    }
    dice() {
      for (let i = 0; i < 3; i++) this.after(i * 0.4, () => this.G.spawnProj({ x: this.x + 40, y: this.y + 40, vx: this.G.rand(-6, -3), vy: -4, grav: 22, r: 18, shape: "dice", color: "#fff", bounce: 6, parry: i === 1 }));
      return 1.9;
    }
    coins() {
      const cx = this.x + this.w / 2, cy = this.y + 70;
      for (let i = 0; i < 6; i++) this.after(i * 0.16, () => { const p = this.pPos(); this.G.spawnProj({ x: cx, y: cy, vx: (p.x - cx) / 80 + this.G.rand(-1.5, 1.5), vy: -9, grav: 20, r: 15, shape: "coin", color: "#f0c84a", parry: i % 2 === 0 }); this.G.sfx && this.G.sfx("coin"); });
      return 1.8;
    }
    roulette() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let k = 0; k < 16; k++) this.after(k * 0.09, () => { this.sa += 0.4; for (let arm = 0; arm < (this.phase >= 3 ? 4 : 3); arm++) { const a = this.sa + arm * (TAU / (this.phase >= 3 ? 4 : 3)); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, r: 9, shape: "ball", color: "#c060ff", parry: k % 5 === 0 && arm === 0 }); } });
      return 2.4;
    }
    behave(dt) { this.wheel += dt * 4; }
    onPhase() { this.G.shake(14); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, this.G.groundY - 6, 116, 16, 0, 0, TAU); ctx.fill();
      // ruleta detrás
      ctx.save(); ctx.translate(cx, this.y + 70); ctx.rotate(this.wheel); for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? "#7a1020" : "#1a120a"; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 96, i / 12 * TAU, (i + 1) / 12 * TAU); ctx.closePath(); ctx.fill(); } ctx.restore();
      ctx.fillStyle = "#caa24a"; ctx.beginPath(); ctx.arc(cx, this.y + 70, 98, 0, TAU); ctx.lineWidth = 6; ctx.strokeStyle = "#1a120a"; ctx.stroke();
      // tux
      const tc = this.phase === 1 ? "#2a2438" : this.phase === 2 ? "#3a1430" : "#4a0c18";
      ctx.fillStyle = flash ? "#fff" : tc; ctx.beginPath(); ctx.moveTo(cx - 64, this.y + this.h); ctx.lineTo(cx - 40, this.y + 96); ctx.lineTo(cx + 40, this.y + 96); ctx.lineTo(cx + 64, this.y + this.h); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = "#f3e7cf"; ctx.beginPath(); ctx.moveTo(cx - 14, this.y + 96); ctx.lineTo(cx, this.y + 150); ctx.lineTo(cx + 14, this.y + 96); ctx.closePath(); ctx.fill();
      ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.moveTo(cx, this.y + 104); ctx.lineTo(cx - 10, this.y + 112); ctx.lineTo(cx, this.y + 120); ctx.lineTo(cx + 10, this.y + 112); ctx.closePath(); ctx.fill();
      // cabeza
      ctx.fillStyle = flash ? "#fff" : "#e9d9b8"; ctx.beginPath(); ctx.ellipse(cx, this.y + 64, 42, 48, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      // chistera
      ctx.fillStyle = flash ? "#fff" : "#1a1018"; roundRectB(ctx, cx - 50, this.y + 18, 100, 12, 5); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke(); roundRectB(ctx, cx - 32, this.y - 22, 64, 44, 6); ctx.fill(); ctx.stroke();
      this.eye(ctx, cx - 15, this.y + 60, 13); this.eye(ctx, cx + 15, this.y + 60, 13);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 12, this.y + 84); ctx.lineTo(cx + 12, this.y + 84); ctx.stroke();
      // bigote
      ctx.beginPath(); ctx.moveTo(cx, this.y + 80); ctx.quadraticCurveTo(cx - 14, this.y + 78, cx - 20, this.y + 72); ctx.moveTo(cx, this.y + 80); ctx.quadraticCurveTo(cx + 14, this.y + 78, cx + 20, this.y + 72); ctx.stroke();
    }
  }

  /* ============================================================
     MUNDO 3 (más fases, más difícil, mecánica de escudo)
     ============================================================ */
  // 10 — EL TITIRITERO (3 fases, usa ESCUDO)
  class PuppeteerBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1240, name: "El Titiritero", thresholds: [0.66, 0.33], firstDelay: 1.2 });
      this.w = 200; this.h = 150; this.x = G.W / 2 - this.w / 2; this.y = 90; this.sa = 0;
    }
    getHitboxes() { return [{ x: this.x + 30, y: this.y + 16, w: this.w - 60, h: this.h - 26 }]; }
    choose() {
      if (this.phase === 1) return this.choice([1, 1], [this.scissors, this.puppets]);
      if (this.phase === 2) { if (!this.shielded && Math.random() < 0.5) { this.raiseShield(); return 2.2; } return this.choice([1, 1], [this.strings, this.scissors]); }
      return this.choice([1, 1], [this.spiral, this.strings]);
    }
    scissors() {
      const cx = this.x + this.w / 2, cy = this.y + this.h - 8;
      for (let k = 0; k < 2; k++) this.after(k * 0.4, () => { for (let i = 0; i < 6; i++) { const a = Math.PI * 0.25 + i * (Math.PI * 0.5 / 5) + k * 0.2; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5.5, vy: Math.sin(a) * 5.5, r: 11, shape: "card", color: "#cfd6e0", parry: i === 3 }); } });
      return 1.7;
    }
    puppets() {
      for (let i = 0; i < 3; i++) this.after(i * 0.5, () => this.G.spawnProj({ x: this.G.rand(160, this.G.W - 160), y: -10, vx: 0, vy: 3.5, grav: 10, r: 22, shape: "walker", color: "#b07a4a", hp: 4, walk: true }));
      return 2.1;
    }
    strings() {
      for (let i = 0; i < 4; i++) this.after(i * 0.3, () => { const x = this.G.rand(120, this.G.W - 120); this.G.spawnHazard({ x: x - 10, y: 0, w: 20, h: this.G.groundY, telegraph: 0.8, active: 0.4, color: "#e0d0a0", type: "laser" }); });
      return 2.0;
    }
    spiral() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let k = 0; k < 16; k++) this.after(k * 0.08, () => { this.sa += 0.45; for (let arm = 0; arm < 4; arm++) { const a = this.sa + arm * (TAU / 4); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.2, vy: Math.sin(a) * 4.2, r: 9, shape: "card", color: "#c9a0e0", parry: k % 5 === 0 && arm === 0 }); } });
      return 2.4;
    }
    behave(dt) { this.x = (this.G.W / 2 - this.w / 2) + Math.sin(this.t * 1.0) * 200; this.y = 90 + Math.sin(this.t * 1.6) * 26; }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      // hilos
      ctx.strokeStyle = "rgba(230,220,180,0.5)"; ctx.lineWidth = 1.5;
      for (const s of [-50, -18, 18, 50]) { ctx.beginPath(); ctx.moveTo(cx + s, 0); ctx.lineTo(cx + s * 0.6, cy); ctx.stroke(); }
      // barra de control
      ctx.strokeStyle = "#6a4a2a"; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(cx - 60, this.y + 6); ctx.lineTo(cx + 60, this.y + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, this.y - 6); ctx.lineTo(cx, this.y + 18); ctx.stroke();
      // cuerpo (manos enguantadas + capa)
      const col = flash ? "#fff" : (this.phase === 1 ? "#5a3a7a" : this.phase === 2 ? "#7a2a6a" : "#7a1a3a");
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(cx - 60, this.y + 30); ctx.quadraticCurveTo(cx, this.y + 6, cx + 60, this.y + 30); ctx.lineTo(cx + 70, this.y + this.h); ctx.quadraticCurveTo(cx, this.y + this.h - 26, cx - 70, this.y + this.h); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      // guantes
      ctx.fillStyle = "#fff"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * (this.w / 2 + 4), this.y + 70 + Math.sin(this.t * 3 + s) * 8, 14, 0, TAU); ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = "#1a120a"; ctx.stroke(); }
      // cara pálida
      ctx.fillStyle = flash ? "#fff" : "#e9d9c8"; ctx.beginPath(); ctx.ellipse(cx, this.y + 64, 34, 38, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.stroke();
      this.eye(ctx, cx - 12, this.y + 60, 12); this.eye(ctx, cx + 12, this.y + 60, 12);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(cx - 12, this.y + 60); ctx.lineTo(cx - 12, this.y + 50); ctx.moveTo(cx + 12, this.y + 60); ctx.lineTo(cx + 12, this.y + 50); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx, this.y + 78, 6, 0.1 * Math.PI, 0.9 * Math.PI); ctx.stroke();
    }
  }

  // 11 — QUIMERA (3 cabezas, 3 fases)
  class ChimeraBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1340, name: "Quimera", thresholds: [0.66, 0.33], firstDelay: 1.1 });
      this.w = 240; this.h = 200; this.x = G.W - 360; this.y = G.groundY - this.h;
    }
    getHitboxes() { return [{ x: this.x + 30, y: this.y + 30, w: this.w - 60, h: this.h - 40 }]; }
    choose() {
      if (this.phase === 1) return this.choice([1, 1], [this.fire, this.fireLob]);
      if (this.phase === 2) return this.choice([1, 1], [this.ice, this.fire]);
      return this.choice([1, 1], [this.bolts, this.ice]);
    }
    fire() {
      const cx = this.x + 30, cy = this.y + 50;
      for (let i = 0; i < 3; i++) this.after(i * 0.36, () => { const v = this.aim(cx, cy, 4.6); this.G.spawnProj({ x: cx, y: cy, vx: v.vx, vy: v.vy, r: 15, shape: "fire", color: "#ff7a2a", homing: true, homeTime: 1.3, homeStr: 1.7, speed: 4.6, parry: i === 1 }); });
      return 1.6;
    }
    fireLob() {
      const cx = this.x + 40, cy = this.y + 40;
      for (let i = 0; i < 4; i++) this.after(i * 0.28, () => { const p = this.pPos(); this.G.spawnProj({ x: cx, y: cy, vx: (p.x - cx) / 70, vy: -7, grav: 20, r: 14, shape: "fire", color: "#ff9a2a", parry: i === 2 }); });
      return 1.7;
    }
    ice() {
      for (let i = 0; i < 6; i++) this.after(i * 0.18, () => { const x = this.G.rand(120, this.G.W - 120); this.G.spawnProj({ x, y: -10, vx: 0, vy: 6, grav: 12, r: 12, shape: "icicle", color: "#bfe6ff", parry: i % 3 === 0 }); });
      const cy = this.G.groundY - 14;
      for (let i = 0; i < 3; i++) this.after(0.4 + i * 0.2, () => this.G.spawnProj({ x: this.x + 10, y: cy, vx: -7, vy: 0, r: 11, shape: "icicle", color: "#9fd8f0", noFloor: true }));
      return 2.0;
    }
    bolts() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let i = 0; i < 12; i++) { const a = i * (TAU / 12); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.8, vy: Math.sin(a) * 4.8, r: 10, shape: "bolt", color: "#ffe24a", parry: i % 4 === 0 }); }
      this.after(0.6, () => this.G.spawnHazard({ x: 0, y: this.y + 40, w: this.G.W, h: 40, telegraph: 0.8, active: 0.5, color: "#ffe24a", type: "laser" }));
      return 2.1;
    }
    onPhase() { this.G.shake(14); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, this.G.groundY - 6, 130, 18, 0, 0, TAU); ctx.fill();
      // cuerpo
      const bg = ctx.createLinearGradient(0, this.y, 0, this.y + this.h); bg.addColorStop(0, flash ? "#fff" : "#7a5a3a"); bg.addColorStop(1, flash ? "#eee" : "#4a3420");
      ctx.fillStyle = flash ? "#fff" : bg; ctx.beginPath(); ctx.ellipse(cx, this.y + this.h / 2 + 10, this.w / 2, this.h / 2.3, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      // patas
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 9; for (const s of [-70, -30, 40, 80]) { ctx.beginPath(); ctx.moveTo(cx + s, this.y + this.h - 30); ctx.lineTo(cx + s + 6, this.G.groundY - 6); ctx.stroke(); }
      // 3 cabezas (fuego, hielo, rayo) — la activa según fase resalta
      const heads = [["#d0402a", -56, this.phase === 1], ["#7fc8e8", 0, this.phase === 2], ["#e8c84a", 56, this.phase === 3]];
      for (const [c, dx, on] of heads) {
        ctx.fillStyle = flash ? "#fff" : c; ctx.beginPath(); ctx.arc(cx + dx, this.y + 28, on ? 30 : 24, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = on ? 6 : 4; ctx.stroke();
        this.eye(ctx, cx + dx - 8, this.y + 24, on ? 9 : 7); this.eye(ctx, cx + dx + 8, this.y + 24, on ? 9 : 7);
        ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.moveTo(cx + dx - 10, this.y + 40); for (let i = 0; i <= 4; i++) ctx.lineTo(cx + dx - 10 + i * 5, this.y + 40 + (i % 2 ? 6 : 0)); ctx.closePath(); ctx.fill();
      }
    }
  }

  // 12 — EL DIRECTOR (jefe final, 4 fases, usa ESCUDO)
  class DirectorBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1700, name: "El Director", thresholds: [0.75, 0.5, 0.25], firstDelay: 1.1 });
      this.w = 220; this.h = 250; this.x = G.W / 2 - this.w / 2; this.y = 70; this.sa = 0;
    }
    getHitboxes() { return [{ x: this.x + 34, y: this.y + 34, w: this.w - 68, h: this.h - 56 }]; }
    choose() {
      if (this.phase === 1) return this.choice([1, 1], [this.notes, this.baton]);
      if (this.phase === 2) return Math.random() < 0.4 ? this.notes() : this.baton();
      if (this.phase === 3) { if (!this.shielded && Math.random() < 0.5) { this.raiseShield(); return 2.2; } return this.crescendo(); }
      return this.choice([1, 1], [this.crescendo, this.finale]);
    }
    notes() {
      const cx = this.x + this.w / 2, cy = this.y + 90;
      for (let k = 0; k < 2; k++) this.after(k * 0.4, () => { for (let i = 0; i < 7; i++) { const a = Math.PI * 0.5 + (i - 3) * 0.2; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, r: 11, shape: "ball", color: "#1a120a", parry: i === 3 }); } });
      return 1.6;
    }
    baton() {
      for (let i = 0; i < 2; i++) this.after(i * 0.5, () => { const y = this.G.rand(this.G.groundY - 240, this.G.groundY - 90); this.G.spawnHazard({ x: 0, y: y - 20, w: this.G.W, h: 40, telegraph: 0.85, active: 0.45, color: "#ff5a5a", type: "laser" }); });
      return 1.9;
    }
    crescendo() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let k = 0; k < 18; k++) this.after(k * 0.08, () => { this.sa += 0.42; for (let arm = 0; arm < 4; arm++) { const a = this.sa + arm * (TAU / 4); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.4, vy: Math.sin(a) * 4.4, r: 9, shape: "ball", color: "#c060ff", parry: k % 5 === 0 && arm === 0 }); } });
      return 2.3;
    }
    finale() {
      for (let i = 0; i < 9; i++) this.after(i * 0.14, () => { const x = this.G.rand(80, this.G.W - 80); this.G.spawnProj({ x, y: -10, vx: 0, vy: 5, grav: 8, r: 11, shape: "ball", color: "#ff7a4a", parry: i % 3 === 0 }); });
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let i = 0; i < 16; i++) { const a = i * (TAU / 16); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, r: 9, shape: "ball", color: "#c060ff" }); }
      return 2.5;
    }
    behave(dt) { this.x = (this.G.W / 2 - this.w / 2) + Math.sin(this.t * 0.7) * 120; this.y = 70 + Math.sin(this.t * 1.2) * 22; }
    onPhase() { this.G.shake(16); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2;
      const col = ["#3a2356", "#5a163e", "#6a0c18", "#7a0810"][Math.min(3, this.phase - 1)];
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      // frac
      ctx.fillStyle = flash ? "#fff" : "#1a120a"; ctx.beginPath(); ctx.moveTo(this.x + 30, this.y + 70); ctx.quadraticCurveTo(cx, this.y + 6, this.x + this.w - 30, this.y + 70); ctx.lineTo(this.x + this.w + 6, this.y + this.h); ctx.quadraticCurveTo(cx, this.y + this.h - 40, this.x - 6, this.y + this.h); ctx.closePath(); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : col; ctx.beginPath(); ctx.moveTo(cx - 18, this.y + 80); ctx.lineTo(cx, this.y + this.h - 20); ctx.lineTo(cx + 18, this.y + 80); ctx.closePath(); ctx.fill();
      // batuta (brazo)
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 9; const ba = Math.sin(this.t * 6) * 0.6; ctx.save(); ctx.translate(this.x + 30, this.y + 90); ctx.rotate(ba); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-46, -10); ctx.stroke(); ctx.fillStyle = "#fff"; ctx.fillRect(-58, -14, 12, 8); ctx.restore();
      // cabeza
      ctx.fillStyle = flash ? "#fff" : "#e9d9b8"; ctx.beginPath(); ctx.ellipse(cx, this.y + 60, 42, 48, 0, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      // cuernos
      ctx.fillStyle = flash ? "#fff" : "#1a120a"; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(cx + s * 30, this.y + 28); ctx.quadraticCurveTo(cx + s * 64, this.y - 16, cx + s * 40, this.y + 6); ctx.closePath(); ctx.fill(); }
      this.eye(ctx, cx - 15, this.y + 56, 13); this.eye(ctx, cx + 15, this.y + 56, 13);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(cx - 28, this.y + 40); ctx.lineTo(cx - 6, this.y + 48); ctx.moveTo(cx + 28, this.y + 40); ctx.lineTo(cx + 6, this.y + 48); ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.moveTo(cx - 20, this.y + 78); for (let i = 0; i <= 8; i++) ctx.lineTo(cx - 20 + i * 5, this.y + 78 + (i % 2 ? 10 : 2)); ctx.closePath(); ctx.fill();
    }
  }

  /* ============================================================
     MUNDO 4 — EL VACÍO DE TINTA (jefes finales)
     ============================================================ */
  // 13 — EL CENTINELA (guardián, 3 fases, escudo)
  class SentinelBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1500, name: "El Centinela", thresholds: [0.66, 0.33], firstDelay: 1.2 });
      this.w = 200; this.h = 200; this.x = G.W / 2 - this.w / 2; this.y = 120; this.sa = 0;
    }
    getHitboxes() { return [{ x: this.x + 34, y: this.y + 34, w: this.w - 68, h: this.h - 68 }]; }
    choose() {
      if (this.phase === 1) return this.choice([1, 1], [this.beam, this.spikes]);
      if (this.phase === 2) { if (!this.shielded && Math.random() < 0.5) { this.raiseShield(); return 2.2; } return this.choice([1, 1], [this.blades, this.spikes]); }
      return this.choice([1, 1], [this.blades, this.beam]);
    }
    beam() {
      // a altura alcanzable por el jugador (antes salía a la altura del propio Centinela, arriba del todo, y JAMÁS tocaba a nadie)
      const y = this.G.rand(this.G.groundY - 240, this.G.groundY - 90);
      this.G.spawnHazard({ x: 0, y: y - 18, w: this.G.W, h: 36, telegraph: 0.9, active: 0.5, color: "#ff5a5a", type: "laser" }); return 2.0;
    }
    spikes() { const cx = this.x + this.w / 2, cy = this.y + this.h / 2; for (let i = 0; i < 12; i++) { const a = i * (TAU / 12); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.8, vy: Math.sin(a) * 4.8, r: 10, shape: "bolt", color: "#c060ff", parry: i % 4 === 0 }); } return 1.7; }
    blades() { const cx = this.x + this.w / 2, cy = this.y + this.h / 2; for (let k = 0; k < 14; k++) this.after(k * 0.09, () => { this.sa += 0.5; for (let arm = 0; arm < 3; arm++) { const a = this.sa + arm * (TAU / 3); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.4, vy: Math.sin(a) * 4.4, r: 11, shape: "gear", color: "#9099aa", parry: k % 5 === 0 && arm === 0 }); } }); return 2.3; }
    behave(dt) { this.x = (this.G.W / 2 - this.w / 2) + Math.sin(this.t * 0.9) * 180; this.y = 120 + Math.sin(this.t * 1.4) * 26; }
    onPhase() { this.G.shake(14); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      ctx.lineJoin = "round";
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(this.t * 0.6);
      ctx.fillStyle = flash ? "#fff" : (this.phase === 1 ? "#5a3a8a" : this.phase === 2 ? "#6a2a7a" : "#7a1a4a");
      for (let i = 0; i < 12; i++) { const a = i * (TAU / 12); ctx.beginPath(); ctx.moveTo(Math.cos(a) * 94, Math.sin(a) * 94); ctx.lineTo(Math.cos(a + 0.13) * 72, Math.sin(a + 0.13) * 72); ctx.lineTo(Math.cos(a - 0.13) * 72, Math.sin(a - 0.13) * 72); ctx.closePath(); ctx.fill(); }
      ctx.restore();
      ctx.fillStyle = flash ? "#fff" : "#2a1a3a"; ctx.beginPath(); ctx.arc(cx, cy, 72, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = "#e9d9c8"; ctx.beginPath(); ctx.arc(cx, cy, 50, 0, TAU); ctx.fill(); ctx.stroke();
      const p = this.pPos(), a = Math.atan2(p.y - cy, p.x - cx), ix = cx + Math.cos(a) * 18, iy = cy + Math.sin(a) * 18;
      ctx.fillStyle = this.phase >= 3 ? "#ff4a4a" : "#6a3aa0"; ctx.beginPath(); ctx.arc(ix, iy, 24, 0, TAU); ctx.fill(); ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.arc(ix, iy, 12, 0, TAU); ctx.fill();
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(ix - 4, iy - 5, 4, 0, TAU); ctx.fill();
    }
  }

  // 14 — LA PLUMA ERRANTE (jefe de vuelo, 2 fases)
  class PenBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1280, name: "La Pluma Errante", thresholds: [0.5], firstDelay: 1.2 });
      this.w = 210; this.h = 120; this.x = G.W - 300; this.y = 180; this.sa = 0;
    }
    getHitboxes() { return [{ x: this.x + 24, y: this.y + 12, w: this.w - 48, h: this.h - 24 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.4, 0.32, 0.28], [this.shots, this.drops, this.flak]);
      return this.choice([1, 1], [this.spiral, this.sweep]);
    }
    shots() { const cx = this.x + 6, cy = this.y + this.h / 2; for (let i = 0; i < 4; i++) this.after(i * 0.2, () => this.G.spawnProj({ x: cx, y: cy + this.G.rand(-42, 42), vx: -8.5, vy: 0, r: 12, shape: "ball", color: "#1a120a", parry: i === 3, noFloor: true })); return 1.6; }
    drops() { const cx = this.x + 16, cy = this.y + this.h / 2; for (let i = 0; i < 3; i++) this.after(i * 0.4, () => { const v = this.aim(cx, cy, 3.4); this.G.spawnProj({ x: cx, y: cy, vx: v.vx, vy: v.vy, r: 14, shape: "ball", color: "#3a2a6a", homing: true, homeTime: 1.8, homeStr: 1.6, speed: 3.6, noFloor: true, parry: i === 1 }); }); return 1.8; }
    flak() { const cx = this.x + 16, cy = this.y + this.h / 2; for (let i = 0; i < 8; i++) { const a = Math.PI - 0.7 + i * 0.2; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, r: 10, shape: "bolt", color: "#c060ff", noFloor: true, parry: i === 4 }); } return 1.6; }
    spiral() { const cx = this.x + this.w / 2, cy = this.y + this.h / 2; for (let k = 0; k < 14; k++) this.after(k * 0.09, () => { this.sa += 0.5; for (let arm = 0; arm < 3; arm++) { const a = this.sa + arm * (TAU / 3); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 3.8, vy: Math.sin(a) * 3.8, r: 9, shape: "ball", color: "#9ad0ff", noFloor: true, parry: k % 5 === 0 && arm === 0 }); } }); return 2.3; }
    sweep() { this.G.spawnHazard({ x: this.G.W + 40, y: 0, w: 90, h: this.G.H, telegraph: 0.7, active: 3.8, vx: -6.5, color: "#2a1a4a", type: "cloud" }); return 2.6; }   // 3.8 s: cruza toda la pantalla
    behave(dt) { this.y = 150 + Math.sin(this.t * 1.2) * 90; }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      ctx.lineJoin = "round";
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(-0.14 + Math.sin(this.t * 2) * 0.05);
      ctx.fillStyle = flash ? "#fff" : (this.phase === 1 ? "#3a2a6a" : "#5a1a4a");
      roundRectB(ctx, -100, -26, 178, 52, 20); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = "#e8c34a"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(22, -22); ctx.lineTo(62, -22); ctx.stroke();
      ctx.fillStyle = "#caa24a"; ctx.beginPath(); ctx.moveTo(-100, -22); ctx.lineTo(-150, 0); ctx.lineTo(-100, 22); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.fillRect(-128, -2, 28, 4);
      ctx.restore();
      this.eye(ctx, cx - 42, cy - 4, 12); this.eye(ctx, cx - 12, cy - 4, 12);
    }
  }

  // 15 — EL AUTOR (jefe FINAL, 5 fases, escudo + bullet-hell)
  class AuthorBoss extends Boss {
    constructor(G) {
      super(G, { hp: 2200, name: "El Autor", thresholds: [0.8, 0.6, 0.4, 0.2], firstDelay: 1.0 });
      this.w = 240; this.h = 270; this.x = G.W / 2 - this.w / 2; this.y = 70; this.sa = 0;
    }
    getHitboxes() { return [{ x: this.x + 50, y: this.y + 80, w: this.w - 100, h: this.h - 110 }]; }
    choose() {
      const p = this.phase;
      if (p === 1) return this.choice([1, 1], [this.ink, this.pen]);
      if (p === 2) return this.choice([1, 1], [this.pen, this.scribble]);
      if (p === 3) { if (!this.shielded && Math.random() < 0.5) { this.raiseShield(); return 2.2; } return this.scribble(); }
      if (p === 4) return this.choice([1, 1], [this.rain, this.ink]);
      return this.finale();
    }
    ink() { const cx = this.x + this.w / 2, cy = this.y + 110; for (let i = 0; i < 7; i++) { const a = Math.PI * 0.5 + (i - 3) * 0.2; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, r: 13, shape: "ball", color: "#1a120a", parry: i === 3 }); } return 1.6; }
    pen() { for (let i = 0; i < 2; i++) this.after(i * 0.5, () => { if (Math.random() < 0.5) { const x = this.G.rand(150, this.G.W - 150); this.G.spawnHazard({ x: x - 22, y: 0, w: 44, h: this.G.groundY, telegraph: 0.85, active: 0.5, color: "#ff5a5a", type: "laser" }); } else { const y = this.G.rand(this.G.groundY - 240, this.G.groundY - 90); this.G.spawnHazard({ x: 0, y: y - 20, w: this.G.W, h: 40, telegraph: 0.85, active: 0.5, color: "#ff5a5a", type: "laser" }); } }); return 1.9; }
    scribble() { const cx = this.x + this.w / 2, cy = this.y + this.h / 2; for (let k = 0; k < 18; k++) this.after(k * 0.08, () => { this.sa += 0.42; for (let arm = 0; arm < 4; arm++) { const a = this.sa + arm * (TAU / 4); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4.4, vy: Math.sin(a) * 4.4, r: 9, shape: "ball", color: "#c060ff", parry: k % 5 === 0 && arm === 0 }); } }); return 2.3; }
    rain() { for (let i = 0; i < 10; i++) this.after(i * 0.12, () => { const x = this.G.rand(80, this.G.W - 80); this.G.spawnProj({ x, y: -10, vx: 0, vy: 5, grav: 8, r: 11, shape: "ball", color: "#1a120a", parry: i % 3 === 0 }); }); return 2.0; }
    finale() {
      const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
      for (let i = 0; i < 18; i++) { const a = i * (TAU / 18); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 4, vy: Math.sin(a) * 4, r: 9, shape: "ball", color: "#ff7a4a", parry: i % 6 === 0 }); }
      for (let i = 0; i < 8; i++) this.after(i * 0.14, () => { const x = this.G.rand(80, this.G.W - 80); this.G.spawnProj({ x, y: -10, vx: 0, vy: 5, grav: 8, r: 10, shape: "ball", color: "#c060ff" }); });
      this.G.shake(8); return 2.5;
    }
    behave(dt) { this.x = (this.G.W / 2 - this.w / 2) + Math.sin(this.t * 0.6) * 100; this.y = 70 + Math.sin(this.t * 1.1) * 20; }
    onPhase() { this.G.shake(18); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, gy = this.G.groundY;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.25)"; ctx.beginPath(); ctx.ellipse(cx, gy - 6, 130, 18, 0, 0, TAU); ctx.fill();
      const col = ["#2a2356", "#3a1640", "#4a0c28", "#5a0818", "#6a0410"][Math.min(4, this.phase - 1)];
      ctx.fillStyle = flash ? "#fff" : col; roundRectB(ctx, cx - 92, this.y + 92, 184, this.h - 92, 26); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = flash ? "#fff" : "#1a120a"; roundRectB(ctx, cx - 46, this.y + 64, 92, 36, 8); ctx.fill();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.ellipse(cx, this.y + 64, 48, 12, 0, 0, TAU); ctx.fill();
      const ph = Math.sin(this.t * 3) * 8;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.ellipse(cx + 78, this.y + 12 + ph, 30, 22, 0.3, 0, TAU); ctx.fill(); ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.stroke();
      ctx.strokeStyle = "#caa24a"; ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(cx + 96, this.y + 24 + ph); ctx.lineTo(cx + 42, this.y + 72 + ph); ctx.stroke();
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx + 42, this.y + 72 + ph); ctx.lineTo(cx + 38, this.y + 84 + ph); ctx.stroke();
      this.eye(ctx, cx - 26, this.y + 150, 16); this.eye(ctx, cx + 26, this.y + 150, 16);
      ctx.strokeStyle = "#1a120a"; ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(cx - 46, this.y + 128); ctx.lineTo(cx - 12, this.y + 142); ctx.moveTo(cx + 46, this.y + 128); ctx.lineTo(cx + 12, this.y + 142); ctx.stroke();
      ctx.fillStyle = "#1a120a"; ctx.beginPath(); ctx.moveTo(cx - 30, this.y + 182); for (let i = 0; i <= 7; i++) ctx.lineTo(cx - 30 + i * (60 / 7), this.y + 182 + (i % 2 ? 14 : 2)); ctx.closePath(); ctx.fill();
    }
  }

  /* ============================================================
     JEFE SECRETO — EL DESCARTE (el primer boceto que El Autor borró)
     No está en BOSSES (no cuenta para el % ni los mapas normales).
     ============================================================ */
  class DiscardBoss extends Boss {
    constructor(G) {
      super(G, { hp: 2800, name: "El Descarte", thresholds: [0.8, 0.6, 0.4, 0.2], firstDelay: 1.3 });
      this.w = 150; this.h = 184;
      this.baseY = 96; this.x = G.W / 2 - this.w / 2; this.y = this.baseY;
      this.spinA = 0; this.glitch = 0;
    }
    cx() { return this.x + this.w / 2; }
    getHitboxes() { return [{ x: this.x + 22, y: this.y + 26, w: this.w - 44, h: this.h - 46 }]; }
    onPhase() { this.G.shake(12); this.glitch = 0.5; this.G.burst(this.cx(), this.y + 80, { n: 18, color: "#ff4fa3", smin: 2, smax: 7 }); }
    behave(dt) {
      this.spinA += dt * 1.2; if (this.glitch > 0) this.glitch -= dt;
      const sp = 0.55 + this.phase * 0.16;
      this.x = this.G.W / 2 - this.w / 2 + Math.sin(this.t * sp) * (210 + this.phase * 18);
      this.y = this.baseY + Math.sin(this.t * 1.6) * 22;
    }
    choose() {
      const p = this.phase;
      if (p === 1) return this.choice([1, 1], [this.scribble, this.inkRain]);
      if (p === 2) return this.choice([0.4, 0.32, 0.28], [this.scribble, this.eraseBeam, this.inkRain]);
      if (p === 3) { if (!this.shielded && Math.random() < 0.45) { this.raiseShield(); return 2.4; } return this.choice([1, 1], [this.crossShots, this.eraseBeam]); }
      if (p === 4) return this.choice([0.4, 0.32, 0.28], [this.spiral, this.crossShots, this.scribble]);
      return this.choice([0.38, 0.32, 0.3], [this.spiral, this.eraseBeam, this.inkRain]);
    }
    scribble() {
      const cx = this.cx(), cy = this.y + 84, n = this.phase >= 4 ? 3 : 2;
      for (let k = 0; k < n; k++) this.after(0.32 + k * 0.42, () => {
        const p = this.pPos(), base = Math.atan2(p.y - cy, p.x - cx), sp = 6.1 + this.phase * 0.22;
        for (let i = -2; i <= 2; i++) { const a = base + i * 0.17; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, r: 7, shape: "bolt", color: "#dfe2ee", parry: i === 0 }); }
        this.G.sfx("shoot");
      });
      return 2.0;
    }
    eraseBeam() {
      const fromLeft = this.pPos().x > this.G.W / 2;
      const y = Math.max(80, Math.min(this.G.groundY - 130, this.pPos().y - 45));
      this.G.spawnHazard({ x: fromLeft ? -130 : this.G.W + 20, y, w: 130, h: 116, telegraph: 0.85, active: 2.3, vx: fromLeft ? 6.6 : -6.6, color: "#ff9ec8", type: "cloud" });
      this.G.shake(6);
      return 2.4;
    }
    inkRain() {
      const n = 8 + (this.phase >= 3 ? 4 : 0);
      for (let i = 0; i < n; i++) this.after(i * 0.12, () => {
        const x = 70 + (i * 151) % (this.G.W - 140);
        this.G.spawnProj({ x, y: -20, vx: 0, vy: 4.5 + this.phase * 0.3, grav: 12, r: 12, shape: "confetti", color: "#2a2440", parry: i % 4 === 0 });
      });
      return 2.2;
    }
    crossShots() {
      for (let i = 0; i < 5; i++) this.after(i * 0.18, () => {
        const y = 120 + i * 88;
        this.G.spawnProj({ x: -20, y, vx: 5.4 + this.phase * 0.2, vy: 0, r: 7, shape: "bolt", color: "#cfd2e0" });
        this.G.spawnProj({ x: this.G.W + 20, y, vx: -(5.4 + this.phase * 0.2), vy: 0, r: 7, shape: "bolt", color: "#cfd2e0" });
        this.G.sfx("shoot");
      });
      return 2.3;
    }
    spiral() {
      const cx = this.cx(), cy = this.y + 84, arms = this.phase >= 5 ? 3 : 2;
      for (let k = 0; k < 10; k++) this.after(k * 0.1, () => {
        for (let a = 0; a < arms; a++) { const ang = this.spinA + a * (TAU / arms); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(ang) * 3.5, vy: Math.sin(ang) * 3.5, r: 8, shape: "ball", color: "#3a3458", parry: k % 5 === 0 && a === 0 }); }
        this.spinA += 0.5;
      });
      return 2.6;
    }
    draw(ctx) {
      const cx = this.cx(), x = this.x, y = this.y, fl = this.flash > 0;
      ctx.save();
      ctx.globalAlpha = 0.8 + Math.sin(this.t * 22) * 0.1 - (this.glitch > 0 ? Math.random() * 0.3 : 0);
      if (this.shielded) { ctx.shadowColor = "#ff4fa3"; ctx.shadowBlur = 22; }
      // cuerpo de tinta a medio borrar (varios trazos de lápiz desplazados)
      const body = () => roundRectB(ctx, x + 18, y + 22, this.w - 36, this.h - 40, 26);
      ctx.fillStyle = fl ? "#fff" : "#221d34"; body(); ctx.fill();
      ctx.strokeStyle = "#11101a"; ctx.lineWidth = 5; body(); ctx.stroke();
      // borrado: bandas claras que "comen" el cuerpo
      ctx.save(); body(); ctx.clip();
      for (let i = 0; i < 4; i++) { ctx.fillStyle = "rgba(243,227,200," + (0.05 + (i % 2) * 0.06) + ")"; const by = y + 30 + ((this.t * 40 + i * 46) % (this.h - 40)); ctx.fillRect(x + 10, by, this.w - 20, 10); }
      ctx.restore();
      // trazos sueltos de lápiz alrededor (sketchy)
      ctx.strokeStyle = "rgba(220,220,235,0.5)"; ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) { ctx.beginPath(); roundRectB(ctx, x + 14 - i * 2, y + 18 - i * 2, this.w - 28 + i * 4, this.h - 36 + i * 4, 28); ctx.stroke(); }
      // grietas rosa de goma de borrar
      ctx.strokeStyle = "#ff4fa3"; ctx.lineWidth = 3; ctx.beginPath();
      ctx.moveTo(cx - 30, y + 60); ctx.lineTo(cx - 8, y + 96); ctx.lineTo(cx - 24, y + 130);
      ctx.moveTo(cx + 26, y + 70); ctx.lineTo(cx + 6, y + 104); ctx.stroke();
      // un gran ojo (pie-cut) que te mira
      this.eye(ctx, cx, y + 78, 22);
      // boca cosida / tachada
      ctx.strokeStyle = "#11101a"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 26, y + 124); ctx.lineTo(cx + 26, y + 124); ctx.stroke();
      for (let i = -2; i <= 2; i++) { ctx.beginPath(); ctx.moveTo(cx + i * 12, y + 118); ctx.lineTo(cx + i * 12, y + 130); ctx.stroke(); }
      ctx.restore();
      // barra de fase mini
      ctx.fillStyle = "#11101a"; ctx.fillRect(cx - 40, y + 6, 80, 7);
      ctx.fillStyle = this.shielded ? "#ff4fa3" : "#e8e8f0"; ctx.fillRect(cx - 39, y + 7, 78 * Math.max(0, this.hp / this.maxHp), 5);
    }
  }
  /* ============================================================
     MUNDO EXTRA — EL REVERSO DE TINTA (historia aparte)
     16 · LA GEMELA — te ataca desde tu propio reflejo (mecánica espejo)
     ============================================================ */
  class TwinBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1000, name: "La Gemela", thresholds: [0.5], firstDelay: 1.2 });
      this.w = 150; this.h = 200; this.x = G.W / 2 - this.w / 2; this.y = G.groundY - this.h;
    }
    getHitboxes() { return [{ x: this.x + 22, y: this.y + 28, w: this.w - 44, h: this.h - 38 }]; }
    srcs() { const c = this.x + this.w / 2; return [c, this.G.W - c]; }  // el jefe y su reflejo
    choose() {
      if (this.phase === 1) return this.choice([0.42, 0.33, 0.25], [this.twinAim, this.beam, this.rainSym]);
      return this.choice([0.4, 0.3, 0.3], [this.twinVolley, this.beam, this.rainSym]);
    }
    twinAim() {
      const cy = this.y + 72;
      this.srcs().forEach((sx, k) => { const v = this.aim(sx, cy, 5.2); this.G.spawnProj({ x: sx, y: cy, vx: v.vx, vy: v.vy, r: 12, shape: "ball", color: "#bfe0ff", parry: k === 1 }); });
      return 1.3;
    }
    twinVolley() {
      for (let i = 0; i < 3; i++) this.after(i * 0.32, () => {
        const cy = this.y + 72;
        this.srcs().forEach((sx, k) => { const v = this.aim(sx, cy, 5.6); this.G.spawnProj({ x: sx, y: cy, vx: v.vx, vy: v.vy, r: 11, shape: "ball", color: "#9fd0ff", parry: i === 1 && k === 0 }); });
      });
      return 1.9;
    }
    beam() {
      const y = this.G.groundY - 70 - Math.random() * 190;
      this.G.spawnHazard({ x: 0, y: y - 13, w: this.G.W, h: 26, telegraph: 0.95, active: 0.4, type: "mirror", color: "#bfe0ff" });
      return 1.6;
    }
    rainSym() {
      for (let i = 0; i < 5; i++) this.after(i * 0.18, () => {
        const x = 130 + Math.random() * (this.G.W / 2 - 170);
        [x, this.G.W - x].forEach(px => this.G.spawnProj({ x: px, y: -20, vx: 0, vy: 4, grav: 12, r: 13, shape: "ball", color: "#bfe0ff", parry: i % 3 === 0 }));
      });
      return 1.9;
    }
    onPhase() { this.G.shake(12); }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, gy = this.G.groundY, y = this.y;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, gy - 6, 92, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#7a6aa0"; roundRectB(ctx, cx - 70, y - 6, 140, this.h + 6, 26); ctx.fill(); ctx.strokeStyle = "#1a1430"; ctx.lineWidth = 7; ctx.stroke();
      const g = ctx.createLinearGradient(cx - 56, 0, cx + 56, 0); g.addColorStop(0, "#cfe6ff"); g.addColorStop(0.5, flash ? "#fff" : "#9fc4e8"); g.addColorStop(1, "#bcd8f4");
      ctx.fillStyle = g; roundRectB(ctx, cx - 56, y + 8, 112, this.h - 22, 16); ctx.fill();
      ctx.save(); roundRectB(ctx, cx - 56, y + 8, 112, this.h - 22, 16); ctx.clip();
      ctx.fillStyle = "rgba(40,30,70,0.85)";
      ctx.beginPath(); ctx.ellipse(cx, y + 60, 30, 34, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.moveTo(cx - 34, y + this.h - 16); ctx.quadraticCurveTo(cx, y + 96, cx + 34, y + this.h - 16); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.35)"; ctx.lineWidth = 10; ctx.beginPath(); ctx.moveTo(cx - 40, y + this.h - 30); ctx.lineTo(cx + 30, y + 30); ctx.stroke();
      ctx.restore();
      if (this.phase >= 2) { ctx.strokeStyle = "#1a1430"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx, y + 20); ctx.lineTo(cx - 16, y + 70); ctx.lineTo(cx + 10, y + 120); ctx.lineTo(cx - 8, y + 170); ctx.moveTo(cx - 16, y + 70); ctx.lineTo(cx - 48, y + 90); ctx.moveTo(cx + 10, y + 120); ctx.lineTo(cx + 44, y + 110); ctx.stroke(); }
      this.eye(ctx, cx - 12, y + 58, 11); this.eye(ctx, cx + 12, y + 58, 11);
      ctx.fillStyle = "#1a1430"; ctx.fillRect(cx - 40, y - 20, 80, 7); ctx.fillStyle = this.shielded ? "#ff4fa3" : "#bfe0ff"; ctx.fillRect(cx - 39, y - 19, 78 * Math.max(0, this.hp / this.maxHp), 5);
    }
  }

  /* 17 · EL SIFÓN — invierte la gravedad y hace SUBIR la tinta */
  class SiphonBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1050, name: "El Sifón", thresholds: [0.6, 0.3], firstDelay: 1.4 });   // 2º jefe del Reverso: algo más de vida que La Gemela
      this.w = 180; this.h = 210; this.x = G.W - 330; this.y = G.groundY - this.h; this.bob = 0;
    }
    getHitboxes() { return [{ x: this.x + 26, y: this.y + 24, w: this.w - 52, h: this.h - 36 }]; }
    choose() {
      // fases 1 y 2 SIN inversión de gravedad (más justo); la inversión solo aparece en la fase final y es rara
      if (this.phase === 1) return this.choice([0.42, 0.34, 0.24], [this.geyser, this.spit, this.tide]);
      if (this.phase === 2) return this.choice([0.36, 0.34, 0.30], [this.geyser, this.spit, this.tide]);
      return this.choice([0.28, 0.36, 0.36], [this.flip, this.spit, this.geyser]);
    }
    geyser() {
      // dos columnas con un carril seguro claro en medio (telegrafiado de sobra)
      const lane = 360 + this.G.rand(-40, 40);
      for (const x of [lane - 230, lane + 230]) this.G.spawnHazard({ x: x - 30, y: this.G.groundY - 210, w: 60, h: 210, telegraph: 1.0, active: 0.5, type: "geyser", color: "#3a6a8a" });
      return 1.8;
    }
    spit() {
      const cx = this.x + 40, cy = this.y + 80, gs = this.G.gravSign ? this.G.gravSign() : 1;
      for (let i = 0; i < 4; i++) { const a = Math.PI - 0.5 - i * 0.22; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5.0, vy: Math.sin(a) * 5.0 * gs, r: 12, shape: "ball", color: "#5aa0c0", parry: i === 1 }); }
      return 1.6;
    }
    tide() {
      this.G.floatText && this.G.floatText(this.G.W / 2, 116, "¡TSUNAMI! salta la ola", "#9fd0ff");
      this.G.setInk && this.G.setInk(0.24, 2.6);   // marea visible (NO daña)
      this.G.spawnHazard({ x: this.G.W + 30, y: this.G.groundY - 116, w: 88, h: 116, telegraph: 1.1, active: 2.8, vx: -9, type: "wave", color: "#2f6a8a" });
      return 3.2;
    }
    flip() {
      // aviso claro (0.5 s) antes de invertir; dura solo 2.6 s; gotas lentas que parar/esquivar
      this.G.floatText && this.G.floatText(this.G.W / 2, 120, "¡SE INVIERTE LA GRAVEDAD!", "#bfe0ff");
      this.after(0.5, () => { this.G.setGrav && this.G.setGrav(-1); this.G.shake(8); });
      this.after(3.1, () => this.G.setGrav && this.G.setGrav(1));
      for (let i = 0; i < 3; i++) this.after(1.0 + i * 0.6, () => { const x = 180 + Math.random() * (this.G.W - 360); this.G.spawnProj({ x, y: this.G.groundY - 30, vx: 0, vy: -4, grav: -8, r: 13, shape: "ball", color: "#5aa0c0", parry: i === 1 }); });
      return 4.4;
    }
    onPhase(p) { this.G.shake(12); }   // sin escudo: el escudo + las inversiones lo hacía injusto
    behave(dt) { this.bob = Math.sin(this.t * 2) * 6; }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2, gy = this.G.groundY, y = this.y + this.bob;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.22)"; ctx.beginPath(); ctx.ellipse(cx, gy - 6, 100, 15, 0, 0, TAU); ctx.fill();
      const g = ctx.createRadialGradient(cx - 24, y + 60, 12, cx, y + 120, 150); g.addColorStop(0, flash ? "#fff" : "#4a86a8"); g.addColorStop(0.6, flash ? "#fff" : "#2f6a8a"); g.addColorStop(1, "#173648");
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(cx - 80, y + this.h - 10); ctx.quadraticCurveTo(cx - 96, y + 70, cx - 50, y + 50); ctx.quadraticCurveTo(cx, y + 24, cx + 50, y + 50); ctx.quadraticCurveTo(cx + 96, y + 70, cx + 80, y + this.h - 10); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#0e2230"; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = "#0e2230"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(cx - 40, y + 56); ctx.quadraticCurveTo(cx - 70, y + 6, cx - 30, y - 6); ctx.moveTo(cx + 40, y + 56); ctx.quadraticCurveTo(cx + 70, y + 6, cx + 30, y - 6); ctx.stroke();
      ctx.strokeStyle = "#4a86a8"; ctx.lineWidth = 6; ctx.stroke();
      ctx.fillStyle = flash ? "#fff" : "#11212c"; ctx.beginPath(); ctx.ellipse(cx, y + 58, 52, 14, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.18)"; ctx.beginPath(); ctx.ellipse(cx - 14, y + 54, 18, 5, -0.3, 0, TAU); ctx.fill();
      this.eye(ctx, cx - 22, y + 110, 16); this.eye(ctx, cx + 22, y + 110, 16);
      ctx.strokeStyle = "#0e2230"; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(cx, y + 152, 20, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
      ctx.fillStyle = "#0e2230"; ctx.fillRect(cx - 46, y + 6, 92, 8); ctx.fillStyle = this.shielded ? "#ff4fa3" : "#7ad0f0"; ctx.fillRect(cx - 45, y + 7, 90 * Math.max(0, this.hp / this.maxHp), 6);
    }
  }

  /* 18 · LA MANO ZURDA — el reverso de El Autor; borra con tinta blanca. Combina todo */
  class LeftHandBoss extends Boss {
    constructor(G) {
      super(G, { hp: 1700, name: "La Mano Zurda", thresholds: [0.72, 0.46, 0.2], firstDelay: 1.5 });
      this.w = 210; this.h = 220; this.x = G.W - 360; this.y = G.groundY - this.h; this.sway = 0;
    }
    getHitboxes() { return [{ x: this.x + 30, y: this.y + 26, w: this.w - 60, h: this.h - 40 }]; }
    choose() {
      if (this.phase === 1) return this.choice([0.4, 0.32, 0.28], [this.erase, this.mirrorRain, this.fan]);
      if (this.phase === 2) return this.choice([0.34, 0.33, 0.33], [this.erase, this.flip, this.fan]);
      if (this.phase === 3) return this.choice([0.34, 0.33, 0.33], [this.tide, this.mirrorRain, this.flip]);
      return this.choice([0.3, 0.3, 0.4], [this.erase, this.flip, this.fan]);
    }
    erase() {
      const fromLeft = Math.random() < 0.5;
      // muro BAJO que barre el suelo: se salta por encima (antes era de altura completa e inesquivable)
      // activo 2.0 s: recorre la pantalla ENTERA (antes moría a mitad y no llegaba al jugador del otro lado)
      this.G.spawnHazard({ x: fromLeft ? -70 : this.G.W + 10, y: this.G.groundY - 120, w: 56, h: 120, telegraph: 0.9, active: 2.0, vx: fromLeft ? 11 : -11, type: "erase", color: "#eae6f6" });
      return 1.9;
    }
    mirrorRain() {
      for (let i = 0; i < 6; i++) this.after(i * 0.16, () => { const x = 120 + Math.random() * (this.G.W / 2 - 150); [x, this.G.W - x].forEach(px => this.G.spawnProj({ x: px, y: -20, vx: 0, vy: 4.4, grav: 12, r: 12, shape: "ball", color: "#d8d2ee", parry: i % 3 === 0 })); });
      return 2.0;
    }
    fan() {
      const cx = this.x + this.w / 2, cy = this.y + 90;
      for (let i = 0; i < 9; i++) { const a = -Math.PI + 0.2 + i * (Math.PI - 0.4) / 8; this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5, vy: Math.sin(a) * 5, r: 11, shape: "ball", color: "#c8c0e8", parry: i === 4 }); }
      return 1.6;
    }
    flip() { this.G.setGrav && this.G.setGrav(-1); this.G.shake(10); this.G.floatText && this.G.floatText(this.G.W / 2, 120, "¡EL MUNDO SE INVIERTE!", "#eae6f6"); this.after(3.8, () => this.G.setGrav && this.G.setGrav(1)); this.after(0.5, () => this.fan()); return 4.2; }
    tide() {
      this.G.floatText && this.G.floatText(this.G.W / 2, 116, "¡TSUNAMI! salta la ola", "#d8d2ee");
      this.G.setInk && this.G.setInk(0.28, 2.6);
      this.G.spawnHazard({ x: this.G.W + 30, y: this.G.groundY - 122, w: 94, h: 122, telegraph: 1.1, active: 2.8, vx: -9, type: "wave", color: "#3a3358" });
      return 3.2;
    }
    onPhase(p) { this.G.shake(14); if (p === 3 && this.raiseShield) this.raiseShield(); }
    behave(dt) { this.sway = Math.sin(this.t * 1.6) * 10; }
    draw(ctx) {
      const flash = this.flash > 0, cx = this.x + this.w / 2 + this.sway, gy = this.G.groundY, y = this.y;
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.beginPath(); ctx.ellipse(this.x + this.w / 2, gy - 6, 110, 16, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#2a2440"; roundRectB(ctx, cx - 40, y + 150, 80, this.h - 140, 16); ctx.fill(); ctx.strokeStyle = "#100c1e"; ctx.lineWidth = 6; ctx.stroke();
      const g = ctx.createRadialGradient(cx - 24, y + 80, 14, cx, y + 110, 150); g.addColorStop(0, flash ? "#fff" : "#f2eefc"); g.addColorStop(0.7, flash ? "#fff" : "#d8d2ee"); g.addColorStop(1, "#9a92be");
      for (let i = 0; i < 4; i++) { const fx = cx - 42 + i * 28; ctx.fillStyle = g; roundRectB(ctx, fx - 10, y + 6 + (i === 0 || i === 3 ? 14 : 0), 20, 60, 10); ctx.fill(); ctx.strokeStyle = "#100c1e"; ctx.lineWidth = 5; ctx.stroke(); }
      ctx.fillStyle = g; roundRectB(ctx, cx + 48, y + 80, 24, 50, 12); ctx.fill(); ctx.strokeStyle = "#100c1e"; ctx.lineWidth = 5; ctx.stroke();
      ctx.fillStyle = g; roundRectB(ctx, cx - 60, y + 50, 120, 110, 30); ctx.fill(); ctx.strokeStyle = "#100c1e"; ctx.lineWidth = 6; ctx.stroke();
      ctx.save(); ctx.translate(cx - 72, y + 120); ctx.rotate(-0.5); ctx.fillStyle = "#fff"; roundRectB(ctx, -6, -50, 12, 64, 5); ctx.fill(); ctx.strokeStyle = "#100c1e"; ctx.lineWidth = 3; ctx.stroke(); ctx.fillStyle = "#cfc8e6"; ctx.beginPath(); ctx.moveTo(-6, 14); ctx.lineTo(6, 14); ctx.lineTo(0, 28); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
      this.eye(ctx, cx, y + 104, 20);
      ctx.strokeStyle = "rgba(40,30,70,0.5)"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 40, y + 70); ctx.lineTo(cx - 18, y + 96); ctx.moveTo(cx + 36, y + 80); ctx.lineTo(cx + 14, y + 110); ctx.stroke();
      ctx.fillStyle = "#100c1e"; ctx.fillRect(cx - 50, y + 38, 100, 8); ctx.fillStyle = this.shielded ? "#ff4fa3" : "#d8d2ee"; ctx.fillRect(cx - 49, y + 39, 98 * Math.max(0, this.hp / this.maxHp), 6);
    }
  }

  /* ============================================================
     RÉQUIEM — jefe del CÓDIGO del Mausoleo (53149900)
     La pieza que El Autor compuso y enterró. 4 movimientos:
     I. El Guardián de Mármol · II. El Enjambre de Reliquias
     III. El Órgano de Tinta  · IV. La Última Nota
     ============================================================ */
  class RequiemBoss extends Boss {
    constructor(G) {
      super(G, { hp: 2800, name: "RÉQUIEM", thresholds: [0.74, 0.46, 0.18], firstDelay: 1.7 });
      this.w = 250; this.h = 300; this.x = G.W - 410; this.y = G.groundY - this.h;
      this.morph = 0; this.swing = 0; this.baseX = this.x;
    }
    getHitboxes() {
      if (this.phase === 2) return [{ x: this.x + 40, y: this.y + 20, w: this.w - 80, h: this.h - 110 }];
      if (this.phase === 3) return [{ x: this.x + 14, y: this.y + 24, w: this.w - 28, h: this.h - 30 }];
      if (this.phase === 4) return [{ x: this.x + 30, y: this.y + 20, w: this.w - 60, h: this.h - 60 }];
      return [{ x: this.x + 52, y: this.y + 36, w: this.w - 104, h: this.h - 40 }];
    }
    hit(d) {
      const applied = super.hit(d);
      if (applied && !this.dead) this.recoil = Math.min(0.6, (this.recoil || 0) + 0.3);   // se estremece al ser herido
      if (this.dead && this.dying < 2.4) { this.dying = 2.8; this.deathT = 0; }            // final más largo y ceremonioso
      return applied;
    }
    choose() {
      if (this.phase === 1) return this.choice([0.28, 0.26, 0.26, 0.2], [this.gazeSweep, this.tombRow, this.choirNotes, this.urnToss]);
      if (this.phase === 2) return this.choice([0.36, 0.34, 0.3], [this.fatuoCage, this.maskDash, this.inkEchoAtk]);
      if (this.phase === 3) return this.choice([0.3, 0.26, 0.24, 0.2], [this.simonLanes, this.wallOfSound, this.bellowsWind, this.inkTide]);
      return this.choice([0.3, 0.26, 0.26, 0.18], [this.staffBarrage, this.parryDuel, this.spotlightSpiral, this.pageCut]);
    }
    /* --- I · LA MIRADA DE PIEDRA: columnas de luz que PETRIFICAN (te ralentizan) --- */
    gazeSweep() {
      const L2R = Math.random() < 0.5, xs = [70, 340, 610, 880];
      // ola secuencial SIN solaparse: cada columna se apaga antes de que encienda la siguiente (síguela andando)
      (L2R ? xs : xs.slice().reverse()).forEach((zx, i) =>
        this.after(i * 0.5, () => this.G.spawnHazard({ x: zx, y: 60, w: 220, h: this.G.groundY - 60, telegraph: 0.65, active: 0.4, type: "gaze", color: "#ffd66e" })));
      this.G.floatText && this.G.floatText(this.G.W / 2, 110, "¡LA MIRADA PETRIFICA! muévete con la ola", "#cfc8b8");
      return 3.0;
    }
    /* --- I · LÁPIDAS: la arena cambia — erupción y plataformas temporales --- */
    tombRow() {
      const p = this.pPos();
      [-150, 0, 150].forEach((ox, i) => {
        const tx = Math.max(90, Math.min(this.G.W - 90, p.x + ox));
        this.G.spawnHazard({ x: tx - 34, y: this.G.groundY - 100, w: 68, h: 100, telegraph: 0.7, active: 0.22, type: "quake", color: "#8a8478" });
        this.after(0.75 + i * 0.04, () => this.G.raiseTomb && this.G.raiseTomb(tx));
      });
      return 2.2;
    }
    /* --- I · CORO DE BUSTOS: notas que ONDULAN desde ambos lados --- */
    choirNotes() {
      this.G.floatText && this.G.floatText(this.G.W / 2, 110, "♩ el coro canta ♩", "#e8e2d4");
      for (let i = 0; i < 4; i++) this.after(i * 0.28, () => {
        const base = this.G.groundY - 120 - Math.random() * 210;
        this.G.spawnProj({ x: -20, y: base, vx: 4.8, vy: 0, r: 10, shape: "star", color: "#e8e2d4", noFloor: true, sine: { base, f: 5, a: 48, ph: i }, parry: i === 2 });
        this.G.spawnProj({ x: this.G.W + 20, y: base - 64, vx: -4.8, vy: 0, r: 10, shape: "star", color: "#cfc8e8", noFloor: true, sine: { base: base - 64, f: 5, a: 48, ph: i + 2 } });
      });
      return 2.5;
    }
    urnToss() {
      for (let i = 0; i < 2; i++) this.after(i * 0.5, () => {
        const c = this.getHitboxes()[0], p = this.pPos();
        this.G.spawnProj({ x: c.x + 30, y: c.y + 30, vx: (p.x - c.x) / 68, vy: -8.5, grav: 20, r: 15, shape: "spore", color: "#cdc5b4", parry: i === 1 });
      });
      return 2.0;
    }
    /* --- II · JAULA DE FATUOS: te rodean, se cierran… y hay UN hueco --- */
    fatuoCage() {
      const gap = Math.random() < 0.5 ? 0 : 4;   // el hueco SIEMPRE es lateral: se sale andando
      this.G.floatText && this.G.floatText(this.G.W / 2, 110, "¡JAULA DE FATUOS! sal por el hueco " + (gap === 0 ? "→" : "←"), "#7af0c0");
      for (let i = 0; i < 8; i++) {
        if (i === gap || i === 2) continue;      // sin fatuo bajo el suelo (no hay pinza imposible a ras de suelo)
        this.G.spawnProj({ x: this.G.W / 2, y: 200, vx: 0, vy: 0, r: 9, shape: "star", color: "#7af0c0", noFloor: true, life: 7, parry: i === (gap === 0 ? 7 : 5), cage: { a: i * (TAU / 8), r: 250, min: 118, shrink: 54, lockAt: 1.3 } });
      }
      return 3.6;
    }
    /* --- II · EMBESTIDA DE LA MÁSCARA: tres cargas con estela de tinta --- */
    maskDash() {
      for (let i = 0; i < 3; i++) {
        this.after(i * 0.95, () => { const c = this.getHitboxes()[0]; this.G.burst && this.G.burst(c.x + c.w / 2, c.y + 20, { n: 12, color: "#ff8ac0", smin: 2, smax: 6 }); });   // aviso: destello rosa ANTES de cargar
        this.after(i * 0.95 + 0.35, () => {
          const c = this.getHitboxes()[0], sx = c.x + c.w / 2, sy = c.y + 20, v = this.aim(sx, sy, 9.5);
          this.G.spawnProj({ x: sx, y: sy, vx: v.vx, vy: v.vy, r: 15, shape: "ball", color: "#ece6d8", noFloor: true, life: 0.9, trailC: "#14101e", parry: i === 1 });
        });
      }
      return 3.3;
    }
    /* --- II · TU ECO DE TINTA: un clon retardado copia tus movimientos --- */
    inkEchoAtk() {
      this.G.floatText && this.G.floatText(this.G.W / 2, 110, "¡TU ECO TE PERSIGUE! no dejes de moverte", "#ff4fa3");
      this.G.startEcho && this.G.startEcho(6.5);
      for (let i = 0; i < 3; i++) this.after(1 + i * 1.4, () => { const x = 120 + Math.random() * (this.G.W - 240); this.G.spawnProj({ x, y: -20, vx: 0, vy: 3.6, grav: 10, r: 12, shape: "ball", color: "#cfc8e8", parry: i === 1 }); });
      return 4.2;
    }
    /* --- III · SIMÓN DE CARRILES: memoriza el orden de las notas --- */
    simonLanes() {
      const lanes = [110, 322, 534, 746, 958, 1170].sort(() => Math.random() - 0.5).slice(0, 3);
      lanes.forEach((lx, k) => this.after(k * 0.5, () => {
        this.G.floatText && this.G.floatText(lx, 140, "♪", "#ffd24a");
        this.G.burst && this.G.burst(lx, 160, { n: 10, color: "#ffd24a", smin: 1, smax: 4, grav: -0.05 });
      }));
      lanes.forEach((lx, k) => this.after(2.1 + k * 0.55, () =>
        this.G.spawnHazard({ x: lx - 46, y: 56, w: 92, h: this.G.groundY - 116, telegraph: 0.5, active: 0.3, type: "pipe", color: "#8a7ab8" })));
      return 4.4;
    }
    /* --- III · MURO DE SONIDO: pared de notas con UN hueco --- */
    wallOfSound() {
      for (let k = 0; k < 2; k++) this.after(k * 1.4, () => {
        const hole = 1 + ((Math.random() * 2) | 0);   // el hueco siempre a altura de salto (no a 400px del suelo)
        for (let i = 0; i < 6; i++) {
          if (i === hole) { this.G.burst && this.G.burst(this.G.W - 60, this.G.groundY - 60 - i * 88, { n: 8, color: "#7af0a0", smin: 1, smax: 3 }); continue; }
          this.G.spawnProj({ x: this.G.W + 20, y: this.G.groundY - 60 - i * 88, vx: -5.4, vy: 0, r: 11, shape: "star", color: "#ffd24a", noFloor: true, parry: k === 0 && i === hole + 1 });
        }
      });
      return 3.2;
    }
    /* --- III · EL FUELLE: el órgano ASPIRA mientras escupe tinta --- */
    bellowsWind() {
      this.G.floatText && this.G.floatText(this.G.W / 2, 110, "¡EL FUELLE ASPIRA! rema contra el viento", "#9a8ec2");
      this.G.setWind && this.G.setWind(2.5, 2.8);
      const c = this.getHitboxes()[0];
      for (let i = 0; i < 5; i++) this.after(0.4 + i * 0.5, () => this.G.spawnProj({ x: c.x - 10, y: this.G.groundY - 30 - Math.random() * 130, vx: -4.2, vy: 0, r: 12, shape: "ball", color: "#38305a", noFloor: true, parry: i === 2 }));
      return 3.4;
    }
    inkTide() {
      this.G.floatText && this.G.floatText(this.G.W / 2, 116, "¡TSUNAMI! salta la ola", "#9f8ad0");
      this.G.setInk && this.G.setInk(0.26, 2.6);
      this.G.spawnHazard({ x: this.G.W + 30, y: this.G.groundY - 118, w: 90, h: 118, telegraph: 1.1, active: 2.8, vx: -9.5, type: "wave", color: "#2a2044" });
      return 3.1;
    }
    /* --- IV · PENTAGRAMA: 5 líneas, 3 se llenan de notas — colócate entre ellas --- */
    staffBarrage() {
      const ys = [70, 150, 230, 310, 390].map(o => this.G.groundY - o);
      ys.forEach(y => this.G.spawnHazard({ x: 0, y: y - 2, w: this.G.W, h: 4, telegraph: 1.1, active: 0.01, type: "laser", color: "#ffd24a" }));
      const hot = [0, 1, 2, 3, 4].sort(() => Math.random() - 0.5).slice(0, 3);
      hot.forEach(li => { for (let i = 0; i < 5; i++) this.after(1.2 + i * 0.24 + li * 0.08, () => this.G.spawnProj({ x: this.G.W + 20, y: ys[li], vx: -6.4, vy: 0, r: 9, shape: "star", color: "#ffd24a", noFloor: true, parry: li === hot[0] && i === 2 })); });
      return 3.4;
    }
    /* --- IV · DUELO DE COMPÁS: notas rosa que DEBES parry — se reflejan y le dañan --- */
    parryDuel() {
      this.G.floatText && this.G.floatText(this.G.W / 2, 110, "¡DUELO DE COMPÁS! devuélvele las notas (parry)", "#ff4fa3");
      for (let i = 0; i < 4; i++) this.after(i * 0.8, () => {
        const c = this.getHitboxes()[0], sx = c.x + c.w / 2, sy = c.y + c.h / 2, v = this.aim(sx, sy, 4.6);
        this.G.spawnProj({ x: sx, y: sy, vx: v.vx, vy: v.vy, r: 12, shape: "star", color: "#ff4fa3", noFloor: true, life: 4, parry: true, duel: true });
      });
      return 4.4;
    }
    /* --- IV · ESPIRAL DOBLE en sentidos opuestos --- */
    spotlightSpiral() {
      const c = this.getHitboxes()[0], cx = c.x + c.w / 2, cy = c.y + c.h / 2;
      for (let i = 0; i < 10; i++) this.after(i * 0.11, () => {
        for (const s of [1, -1]) { const a = s * (this.t * 2.2 + i * 0.66); this.G.spawnProj({ x: cx, y: cy, vx: Math.cos(a) * 5.2, vy: Math.sin(a) * 5.2, r: 9, shape: "star", color: "#ffd24a", parry: s === 1 && i % 5 === 0 }); }
      });
      return 2.9;
    }
    pageCut() {
      for (let i = 0; i < 5; i++) this.after(i * 0.16, () => { const c = this.getHitboxes()[0], v = this.aim(c.x + c.w / 2, c.y + c.h / 2, 7); this.G.spawnProj({ x: c.x + c.w / 2, y: c.y + c.h / 2, vx: v.vx, vy: v.vy, r: 11, shape: "card", color: "#f3ecd8", parry: i === 1 || i === 4 }); });
      return 2.3;
    }
    onPhase(p) {
      this.morph = 1; this.G.shake(18);
      if (p === 2) { this.w = 230; this.h = 240; this.raiseShield && this.raiseShield(); }
      if (p === 3) { this.w = 330; this.h = 330; this.x = this.G.W - 440; this.y = this.G.groundY - this.h; }
      if (p === 4) { this.w = 170; this.h = 170; }
      this.G.burst && this.G.burst(this.x + this.w / 2, this.y + this.h / 2, { n: 40, color: p === 4 ? "#ffd24a" : "#cfc8e8", smin: 2, smax: 9 });
    }
    behave(dt) {
      if (this.morph > 0) this.morph -= dt / 0.9;
      if (this.recoil > 0) this.recoil -= dt * 2.4;
      this.swing += dt;
      const gy = this.G.groundY;
      if (this.phase === 2) { this.x = this.baseX - 130 + Math.sin(this.t * 0.7) * 150; this.y = gy - this.h - 46 + Math.sin(this.t * 1.4) * 22; }
      else if (this.phase === 4) { this.x = this.baseX - 90 + Math.sin(this.t * 0.55) * 210; this.y = gy - 330 + Math.sin(this.t * 1.1) * 46; }
      else this.y = gy - this.h;
      // ambiente vivo por fase (motas, fuegos fatuos, gotas, ascuas)
      if (this.G.burst && Math.random() < 0.09) {
        const c = this.getHitboxes()[0];
        if (this.phase === 1) this.G.burst(c.x + Math.random() * c.w, c.y + c.h, { n: 1, color: "#cfc8b8", smin: 0.4, smax: 1.2, grav: 0.02 });
        else if (this.phase === 2) this.G.burst(c.x + Math.random() * c.w, c.y + c.h - 10, { n: 1, color: "#7af0c0", smin: 0.6, smax: 1.6, grav: -0.06 });
        else if (this.phase === 3) this.G.burst(c.x + Math.random() * c.w, c.y + 20, { n: 1, color: "#241c3a", smin: 1, smax: 2.4, grav: 0.12 });
        else this.G.burst(c.x + Math.random() * c.w, c.y + Math.random() * c.h, { n: 1, color: "#ffd24a", smin: 0.6, smax: 1.8, grav: -0.05 });
      }
    }
    draw(ctx) {
      const flash = this.flash > 0, gy = this.G.groundY;
      if (this.dead) { this.deathT = (this.deathT || 0) + 1 / 60; return this.drawDeath(ctx, this.x + this.w / 2, this.y + this.h / 2, gy); }
      const cx = this.x + this.w / 2 + (this.recoil || 0) * 24, y = this.y;   // se estremece hacia atrás al ser herido
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      if (this.phase !== 4) { ctx.fillStyle = "rgba(0,0,0,0.26)"; ctx.beginPath(); ctx.ellipse(cx, gy - 5, this.w * 0.46, 15, 0, 0, TAU); ctx.fill(); }
      // TELEGRAFÍA UNIVERSAL: un aro dorado se cierra sobre el jefe justo antes de cada ataque
      const tel = Math.max(0, 1 - this.atkT / 0.7);
      if (tel > 0.02 && this.morph <= 0) {
        const hb = this.getHitboxes()[0], bx = hb.x + hb.w / 2, by = hb.y + hb.h / 2;
        ctx.save(); ctx.globalCompositeOperation = "lighter";
        ctx.strokeStyle = `rgba(255,210,74,${tel * 0.55})`; ctx.lineWidth = 2 + tel * 4;
        ctx.beginPath(); ctx.arc(bx, by, 46 + (1 - tel) * 100, 0, TAU); ctx.stroke();
        ctx.strokeStyle = `rgba(255,240,190,${tel * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(bx, by, 28 + tel * 8, 0, TAU); ctx.stroke();
        ctx.restore();
      }
      // transformación entre movimientos: anillos de tinta + escala
      const mo = Math.max(0, this.morph);
      ctx.save();
      if (mo > 0) {
        ctx.translate(cx, y + this.h / 2); ctx.scale(1 + Math.sin(mo * Math.PI) * 0.1, 1 - Math.sin(mo * Math.PI) * 0.06); ctx.translate(-cx, -(y + this.h / 2));
        for (let i = 0; i < 3; i++) { ctx.strokeStyle = `rgba(207,200,232,${mo * 0.5 - i * 0.12})`; ctx.lineWidth = 5 - i; ctx.beginPath(); ctx.arc(cx, y + this.h / 2, (1 - mo) * 200 + i * 34 + 30, 0, TAU); ctx.stroke(); }
      }
      if (this.phase === 1) this.drawGuardian(ctx, cx, y, gy, flash);
      else if (this.phase === 2) this.drawSwarm(ctx, cx, y, flash);
      else if (this.phase === 3) this.drawOrgan(ctx, cx, y, gy, flash);
      else this.drawMask(ctx, cx, y, flash);
      ctx.restore();
      // barra de vida propia, con los 4 movimientos marcados
      ctx.fillStyle = "#0c0a14"; ctx.fillRect(cx - 58, y - 22, 116, 9);
      ctx.fillStyle = this.shielded ? "#ff4fa3" : "#ffd24a"; ctx.fillRect(cx - 57, y - 21, 114 * Math.max(0, this.hp / this.maxHp), 7);
      ctx.fillStyle = "#0c0a14"; [0.26, 0.54, 0.82].forEach(f => ctx.fillRect(cx - 57 + 114 * f, y - 22, 2, 9));
    }
    /* muerte: la máscara se resquebraja, las partituras se liberan y estalla en luz */
    drawDeath(ctx, cx, cy, gy) {
      const t = this.deathT || 0, k = Math.max(0, Math.min(1, this.dying / 2.8));
      ctx.lineJoin = "round";
      ctx.fillStyle = "rgba(0,0,0,0.24)"; ctx.beginPath(); ctx.ellipse(cx, gy - 5, 100 * k, 14 * k, 0, 0, TAU); ctx.fill();
      // fragmentos de máscara dorada saliendo disparados
      for (let i = 0; i < 10; i++) {
        const a = i * (TAU / 10), dist = t * (70 + i * 11), fx = cx + Math.cos(a) * dist, fy = cy + Math.sin(a) * dist - t * t * 22;
        ctx.save(); ctx.globalAlpha = k; ctx.translate(fx, fy); ctx.rotate(a + t * 3.2);
        ctx.fillStyle = i % 2 ? "#ffd24a" : "#ece6d8"; ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(9, 7); ctx.lineTo(-9, 7); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = "#14101e"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
      // partituras liberadas subiendo
      for (let i = 0; i < 6; i++) {
        const px = cx - 84 + i * 34, py = cy - t * (54 + i * 9);
        ctx.save(); ctx.globalAlpha = k * 0.9; ctx.translate(px, py); ctx.rotate(Math.sin(t * 2 + i) * 0.6);
        ctx.fillStyle = "#f3ecd8"; roundRectB(ctx, -8, -11, 16, 22, 3); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 2; ctx.stroke();
        ctx.strokeStyle = "#3a3040"; ctx.lineWidth = 1.3; for (let m = 0; m < 3; m++) { ctx.beginPath(); ctx.moveTo(-5, -5 + m * 5); ctx.lineTo(5, -5 + m * 5); ctx.stroke(); }
        ctx.restore();
      }
      // destello ceremonioso (fuerte al inicio, se apaga)
      const pulse = t < 0.25 ? t / 0.25 : Math.max(0, 1 - (t - 0.25) / 1.2);
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const fg = ctx.createRadialGradient(cx, cy, 6, cx, cy, 70 + t * 200); fg.addColorStop(0, `rgba(255,236,180,${pulse * 0.7})`); fg.addColorStop(1, "rgba(255,236,180,0)");
      ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, 70 + t * 200, 0, TAU); ctx.fill(); ctx.restore();
      if (t < 1.6) { ctx.fillStyle = `rgba(255,210,74,${0.9 - t / 1.6})`; ctx.font = "italic 22px Georgia"; ctx.textAlign = "center"; ctx.fillText("…silencio.", cx, cy - 80 - t * 20); }
    }
    /* I — estatua de mármol con farol (las grietas crecen al dañarla) */
    drawGuardian(ctx, cx, y, gy, flash) {
      const hpf = Math.max(0, (this.hp / this.maxHp - 0.74) / 0.26);
      // pedestal con la cifra grabada
      ctx.fillStyle = flash ? "#fff" : "#8a8478"; ctx.fillRect(cx - 105, gy - 34, 210, 34); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 5; ctx.strokeRect(cx - 105, gy - 34, 210, 34);
      ctx.fillStyle = "rgba(20,16,30,0.5)"; ctx.font = "bold 13px Georgia"; ctx.textAlign = "center"; ctx.fillText("5 3 1 4 9 9 0 0", cx, gy - 12);
      const mg = ctx.createLinearGradient(cx - 90, 0, cx + 90, 0); mg.addColorStop(0, "#b8b2a2"); mg.addColorStop(0.45, flash ? "#fff" : "#ece6d8"); mg.addColorStop(1, "#948e7e");
      // alas plegadas
      ctx.fillStyle = flash ? "#eee" : "#a8a292"; ctx.strokeStyle = "#14101e"; ctx.lineWidth = 6;
      [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(cx + s * 40, y + 60); ctx.quadraticCurveTo(cx + s * 128, y + 40, cx + s * 108, y + 210); ctx.quadraticCurveTo(cx + s * 70, y + 240, cx + s * 48, y + 220); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = "rgba(20,16,30,0.25)"; ctx.lineWidth = 2.5; for (let i = 1; i <= 3; i++) { ctx.beginPath(); ctx.moveTo(cx + s * (44 + i * 16), y + 70 + i * 8); ctx.quadraticCurveTo(cx + s * (52 + i * 18), y + 150, cx + s * (46 + i * 12), y + 208); ctx.stroke(); } ctx.strokeStyle = "#14101e"; ctx.lineWidth = 6; });
      // túnica
      ctx.fillStyle = mg; ctx.beginPath(); ctx.moveTo(cx - 74, gy - 30); ctx.quadraticCurveTo(cx - 86, y + 120, cx - 44, y + 66); ctx.quadraticCurveTo(cx, y + 40, cx + 44, y + 66); ctx.quadraticCurveTo(cx + 86, y + 120, cx + 74, gy - 30); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 6; ctx.stroke();
      ctx.strokeStyle = "rgba(20,16,30,0.22)"; ctx.lineWidth = 3; [[-30, 100], [0, 92], [30, 100]].forEach(p2 => { ctx.beginPath(); ctx.moveTo(cx + p2[0], y + p2[1]); ctx.lineTo(cx + p2[0] * 1.4, gy - 32); ctx.stroke(); });
      // capucha y rostro
      ctx.fillStyle = mg; ctx.beginPath(); ctx.arc(cx, y + 58, 46, Math.PI * 0.92, Math.PI * 2.08); ctx.quadraticCurveTo(cx + 30, y + 96, cx, y + 100); ctx.quadraticCurveTo(cx - 30, y + 96, cx - 45, y + 62); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 5.5; ctx.stroke();
      ctx.fillStyle = "#1a1626"; ctx.beginPath(); ctx.ellipse(cx, y + 66, 27, 30, 0, 0, TAU); ctx.fill();
      const gl = 0.55 + Math.sin(this.t * 4) * 0.25;
      ctx.fillStyle = `rgba(255,210,74,${gl})`; ctx.beginPath(); ctx.arc(cx - 10, y + 62, 4.5, 0, TAU); ctx.arc(cx + 10, y + 62, 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = `rgba(255,210,74,${gl * 0.5})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx - 10, y + 68); ctx.lineTo(cx - 10, y + 78); ctx.moveTo(cx + 10, y + 68); ctx.lineTo(cx + 10, y + 78); ctx.stroke();  // lágrimas de luz
      // grietas según el daño (el mármol se rompe)
      const cracks = Math.round((1 - hpf) * 5);
      ctx.strokeStyle = "#14101e"; ctx.lineWidth = 2.5;
      const CR = [[[-40, 130], [-24, 168], [-38, 205]], [[36, 120], [22, 158], [40, 196]], [[-8, 44], [4, 24]], [[-60, 190], [-40, 226]], [[54, 170], [64, 210]]];
      for (let i = 0; i < cracks; i++) { const path = CR[i]; ctx.beginPath(); ctx.moveTo(cx + path[0][0], y + path[0][1]); for (let k = 1; k < path.length; k++) ctx.lineTo(cx + path[k][0], y + path[k][1]); ctx.stroke(); }
      // farol colgante que oscila con cono de luz
      const sw = Math.sin(this.swing * 1.8) * 0.5, lx = cx - 96 + Math.sin(sw) * 60, ly = y + 130 + Math.cos(sw) * 34;
      ctx.strokeStyle = "#14101e"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 74, y + 96); ctx.lineTo(lx, ly); ctx.stroke();
      const lg = ctx.createRadialGradient(lx, ly, 4, lx, ly, 90); lg.addColorStop(0, "rgba(255,200,90,0.5)"); lg.addColorStop(1, "rgba(255,200,90,0)"); ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx, ly, 90, 0, TAU); ctx.fill();
      ctx.fillStyle = flash ? "#fff" : "#3a3446"; ctx.fillRect(lx - 11, ly - 16, 22, 30); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 3.5; ctx.strokeRect(lx - 11, ly - 16, 22, 30);
      ctx.fillStyle = `rgba(255,214,110,${0.7 + Math.sin(this.t * 9) * 0.3})`; ctx.fillRect(lx - 6, ly - 10, 12, 18);
      // halo de esquirlas de piedra orbitando la cabeza
      for (let i = 0; i < 5; i++) {
        const a = this.t * 0.9 + i * (TAU / 5), hx = cx + Math.cos(a) * 74, hy = y + 40 + Math.sin(a) * 20 - 14;
        ctx.save(); ctx.translate(hx, hy); ctx.rotate(a * 2); ctx.fillStyle = "#cfc8b8"; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 3); ctx.lineTo(-5, 3); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
      }
      // runas de la túnica: se ENCIENDEN cuando va a atacar
      const chg = Math.max(0, 1 - this.atkT / 0.6);
      if (chg > 0) { ctx.fillStyle = `rgba(255,210,74,${chg * 0.85})`; ctx.font = "bold 15px Georgia"; ctx.textAlign = "center"; ["✦", "♪", "✧"].forEach((r2, i) => ctx.fillText(r2, cx - 34 + i * 34, y + 150 + Math.sin(this.t * 6 + i) * 3)); }
      // incensarios colgando de las alas, con humo
      [-1, 1].forEach(s => {
        const sw2 = Math.sin(this.t * 2.2 + s) * 0.35, ix = cx + s * 106 + Math.sin(sw2) * 22, iy = y + 226 + Math.cos(sw2) * 8;
        ctx.strokeStyle = "#14101e"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(cx + s * 102, y + 200); ctx.lineTo(ix, iy); ctx.stroke();
        ctx.fillStyle = "#8a7a50"; ctx.beginPath(); ctx.arc(ix, iy, 8, 0, TAU); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = "rgba(210,200,230,0.3)"; for (let k = 1; k <= 3; k++) { ctx.beginPath(); ctx.arc(ix + Math.sin(this.t * 2 + k * 1.7) * 6, iy - 12 - k * 11, 4 + k * 1.6, 0, TAU); ctx.fill(); }
      });
    }
    /* II — máscara rota sobre cuerpo de tinta con reliquias orbitando */
    drawSwarm(ctx, cx, y, flash) {
      const cy = y + this.h / 2;
      // cuerpo de tinta viva
      const ig = ctx.createRadialGradient(cx, cy + 30, 10, cx, cy + 30, 110); ig.addColorStop(0, flash ? "#fff" : "#2e2648"); ig.addColorStop(1, "#0e0a1c");
      ctx.fillStyle = ig; ctx.beginPath();
      for (let i = 0; i <= 20; i++) { const a = i / 20 * TAU, r = 78 + Math.sin(a * 3 + this.t * 2.4) * 12; const px = cx + Math.cos(a) * r, py = cy + 34 + Math.sin(a) * r * 0.78; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
      ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 5; ctx.stroke();
      // goteo
      ctx.fillStyle = "#0e0a1c"; for (let i = 0; i < 4; i++) { const dx = cx - 54 + i * 36, dl = 14 + Math.sin(this.t * 3 + i * 2) * 10; ctx.beginPath(); ctx.ellipse(dx, cy + 100 + dl * 0.4, 5, 9 + dl * 0.35, 0, 0, TAU); ctx.fill(); }
      // reliquias de jefes caídos orbitando: urna, carta, engranaje, copo, pluma, seta
      for (let i = 0; i < 6; i++) {
        const a = this.t * 1.15 + i * (TAU / 6), rx = cx + Math.cos(a) * 118, ry = cy + 26 + Math.sin(a) * 66, sc = 0.85 + Math.sin(a) * 0.2;
        ctx.save(); ctx.translate(rx, ry); ctx.scale(sc, sc); ctx.rotate(Math.sin(this.t + i) * 0.4);
        ctx.strokeStyle = "#14101e"; ctx.lineWidth = 3;
        if (i === 0) { ctx.fillStyle = "#cdc5b4"; roundRectB(ctx, -9, -12, 18, 24, 5); ctx.fill(); ctx.stroke(); ctx.fillRect(-11, -14, 22, 5); }               // urna
        else if (i === 1) { ctx.fillStyle = "#efe7d6"; roundRectB(ctx, -8, -11, 16, 22, 3); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#c0392b"; ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill(); } // carta
        else if (i === 2) { ctx.fillStyle = "#8a90a0"; gearShape(ctx, 0, 0, 8, 7); ctx.fill(); ctx.stroke(); }                                                     // engranaje
        else if (i === 3) { ctx.strokeStyle = "#bfe6ff"; ctx.lineWidth = 3; for (let k = 0; k < 3; k++) { const ka = k * Math.PI / 3; ctx.beginPath(); ctx.moveTo(-Math.cos(ka) * 10, -Math.sin(ka) * 10); ctx.lineTo(Math.cos(ka) * 10, Math.sin(ka) * 10); ctx.stroke(); } } // copo
        else if (i === 4) { ctx.fillStyle = "#e0d8f8"; ctx.beginPath(); ctx.ellipse(0, 0, 5, 13, 0.5, 0, TAU); ctx.fill(); ctx.stroke(); }                          // pluma
        else { ctx.fillStyle = "#c0432f"; ctx.beginPath(); ctx.arc(0, -2, 10, Math.PI, 0); ctx.fill(); ctx.stroke(); ctx.fillStyle = "#f3e7cf"; ctx.fillRect(-4, -2, 8, 10); ctx.strokeRect(-4, -2, 8, 10); } // seta
        ctx.restore();
      }
      // cráneo que brilla DENTRO de la tinta (se intuye el guardián roto)
      const skg = 0.22 + Math.sin(this.t * 2.8) * 0.1;
      ctx.fillStyle = `rgba(236,230,216,${skg})`; ctx.beginPath(); ctx.ellipse(cx, cy + 30, 26, 30, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = `rgba(14,10,28,${skg * 2})`; ctx.beginPath(); ctx.arc(cx - 9, cy + 24, 5, 0, TAU); ctx.arc(cx + 9, cy + 24, 5, 0, TAU); ctx.fill();
      // cadenas espectrales que atan la máscara a las reliquias
      ctx.save(); ctx.strokeStyle = `rgba(207,200,232,${0.4 + Math.sin(this.t * 4) * 0.15})`; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
      for (const i of [0, 2, 4]) { const a = this.t * 1.15 + i * (TAU / 6); ctx.beginPath(); ctx.moveTo(cx, cy - 52); ctx.lineTo(cx + Math.cos(a) * 118, cy + 26 + Math.sin(a) * 66); ctx.stroke(); }
      ctx.setLineDash([]); ctx.restore();
      // media máscara de mármol flotando (mira al jugador)
      const tilt = Math.sin(this.t * 1.6) * 0.12;
      ctx.save(); ctx.translate(cx, cy - 52 + Math.sin(this.t * 2.2) * 8); ctx.rotate(tilt);
      ctx.fillStyle = flash ? "#fff" : "#ece6d8"; ctx.beginPath(); ctx.moveTo(-34, -40); ctx.quadraticCurveTo(38, -52, 36, 4); ctx.quadraticCurveTo(34, 42, 4, 46); ctx.lineTo(-12, 20); ctx.lineTo(-30, 26); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 5; ctx.stroke();
      ctx.strokeStyle = "rgba(20,16,30,0.4)"; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(-12, 20); ctx.lineTo(-2, -8); ctx.lineTo(-16, -24); ctx.stroke();
      ctx.restore();
      this.eye(ctx, cx + 8, cy - 58, 12);
      const gl = 0.5 + Math.sin(this.t * 5) * 0.3;
      ctx.fillStyle = `rgba(122,240,192,${gl})`; ctx.beginPath(); ctx.arc(cx - 18, cy - 62, 4, 0, TAU); ctx.fill();  // cuenca vacía con fuego fatuo
    }
    /* III — órgano colosal de tinta y hueso */
    drawOrgan(ctx, cx, y, gy, flash) {
      const puff = Math.sin(this.t * 3.4);
      // fuelle/cuerpo
      const og = ctx.createLinearGradient(cx - 160, 0, cx + 160, 0); og.addColorStop(0, "#241c3a"); og.addColorStop(0.5, flash ? "#fff" : "#38305a"); og.addColorStop(1, "#1a1430");
      ctx.fillStyle = og; roundRectB(ctx, cx - 158, y + 92, 316, this.h - 92, 26); ctx.fill(); ctx.strokeStyle = "#0c0a14"; ctx.lineWidth = 7; ctx.stroke();
      // tubos (respiran)
      const pipes = [[-126, 96], [-84, 150], [-42, 190], [0, 214], [42, 190], [84, 150], [126, 96]];
      pipes.forEach((p2, i) => {
        const ph = p2[1] + puff * (4 + i % 3 * 2), px = cx + p2[0];
        const pg = ctx.createLinearGradient(px - 17, 0, px + 17, 0); pg.addColorStop(0, "#4a4066"); pg.addColorStop(0.5, flash ? "#fff" : "#9a8ec2"); pg.addColorStop(1, "#4a4066");
        ctx.fillStyle = pg; roundRectB(ctx, px - 17, y + 108 - ph, 34, ph, 8); ctx.fill(); ctx.strokeStyle = "#0c0a14"; ctx.lineWidth = 5; ctx.stroke();
        ctx.fillStyle = "#ffd24a"; roundRectB(ctx, px - 17, y + 108 - ph, 34, 9, 4); ctx.fill(); ctx.lineWidth = 2.5; ctx.stroke();
        ctx.fillStyle = "#0c0a14"; ctx.beginPath(); ctx.ellipse(px, y + 104 - ph + 14, 8, 5 + Math.max(0, puff) * 2, 0, 0, TAU); ctx.fill();  // boca del tubo
      });
      // teclado como dentadura + tentáculos tocando
      ctx.fillStyle = "#efe7d6"; ctx.fillRect(cx - 140, gy - 74, 280, 30); ctx.strokeStyle = "#0c0a14"; ctx.lineWidth = 4; ctx.strokeRect(cx - 140, gy - 74, 280, 30);
      ctx.fillStyle = "#0c0a14"; for (let i = 0; i < 12; i++) { const kx = cx - 132 + i * 23, press = Math.sin(this.t * 6 + i * 1.9) > 0.8; ctx.fillRect(kx, gy - 74 + (press ? 4 : 0), 12, 16); }
      ctx.strokeStyle = "#14101e"; ctx.lineWidth = 8;
      [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(cx + s * 150, y + 170); ctx.quadraticCurveTo(cx + s * 210, gy - 130 + Math.sin(this.t * 3 + s) * 18, cx + s * 118, gy - 66); ctx.stroke(); ctx.fillStyle = "#38305a"; ctx.beginPath(); ctx.arc(cx + s * 118, gy - 66, 11, 0, TAU); ctx.fill(); ctx.strokeStyle = "#14101e"; });
      // la máscara preside el órgano, con candelabros
      ctx.save(); ctx.translate(cx, y + 66 + puff * 3);
      ctx.fillStyle = flash ? "#fff" : "#ece6d8"; ctx.beginPath(); ctx.moveTo(-30, -34); ctx.quadraticCurveTo(34, -44, 32, 2); ctx.quadraticCurveTo(30, 36, 2, 40); ctx.lineTo(-26, 22); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#0c0a14"; ctx.lineWidth = 4.5; ctx.stroke();
      ctx.restore();
      this.eye(ctx, cx + 6, y + 58, 11);
      [-1, 1].forEach(s => { const fx = cx + s * 170, fy = y + 74; ctx.strokeStyle = "#8a7a50"; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(fx, fy + 26); ctx.lineTo(fx, fy); ctx.stroke(); const fl = 0.6 + Math.sin(this.t * 11 + s) * 0.35; ctx.fillStyle = `rgba(255,190,80,${fl})`; ctx.beginPath(); ctx.ellipse(fx, fy - 9, 5, 10 + fl * 3, 0, 0, TAU); ctx.fill(); });
      // filigrana dorada del mueble
      ctx.strokeStyle = "rgba(255,210,74,0.55)"; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(cx - 140, y + 130); ctx.quadraticCurveTo(cx - 100, y + 112, cx - 60, y + 130); ctx.moveTo(cx + 140, y + 130); ctx.quadraticCurveTo(cx + 100, y + 112, cx + 60, y + 130); ctx.stroke();
      ctx.beginPath(); ctx.arc(cx - 100, y + 148, 9, 0, Math.PI); ctx.arc(cx + 100, y + 148, 9, 0, Math.PI); ctx.stroke();
      // pedales que suben y bajan solos
      for (let i = 0; i < 4; i++) { const px2 = cx - 54 + i * 36, pd = Math.sin(this.t * 5 + i * 2.4) > 0.5 ? 5 : 0; ctx.fillStyle = "#4a4066"; roundRectB(ctx, px2 - 12, gy - 40 + pd, 24, 14, 3); ctx.fill(); ctx.strokeStyle = "#0c0a14"; ctx.lineWidth = 2.5; ctx.stroke(); }
      // atril con la partitura del Réquiem encendida
      ctx.strokeStyle = "#8a7a50"; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 190, gy); ctx.lineTo(cx - 190, gy - 96); ctx.stroke();
      ctx.save(); ctx.translate(cx - 190, gy - 110); ctx.rotate(-0.12);
      ctx.fillStyle = "#f3ecd8"; roundRectB(ctx, -20, -26, 40, 52, 4); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 3; ctx.stroke();
      ctx.strokeStyle = "#3a3040"; ctx.lineWidth = 1.4; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(-14, -16 + k * 11); ctx.lineTo(14, -16 + k * 11); ctx.stroke(); }
      const ng = 0.5 + Math.sin(this.t * 7) * 0.3; ctx.fillStyle = `rgba(255,210,74,${ng})`; ctx.beginPath(); ctx.arc(Math.sin(this.t * 3.2) * 10, -16 + ((this.t * 2) % 1) * 40, 3, 0, TAU); ctx.fill();
      ctx.restore();
    }
    /* IV — la máscara dorada ardiente, batuta y partituras */
    drawMask(ctx, cx, y, flash) {
      const cy = y + this.h / 2;
      // aura dorada aditiva
      ctx.save(); ctx.globalCompositeOperation = "lighter";
      const ag = ctx.createRadialGradient(cx, cy, 8, cx, cy, 130); ag.addColorStop(0, "rgba(255,200,60,0.4)"); ag.addColorStop(1, "rgba(255,200,60,0)"); ctx.fillStyle = ag; ctx.beginPath(); ctx.arc(cx, cy, 130, 0, TAU); ctx.fill(); ctx.restore();
      // doble halo de serafín girando en sentidos opuestos
      ctx.save(); ctx.strokeStyle = `rgba(255,214,110,${0.5 + Math.sin(this.t * 3) * 0.2})`; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(cx, cy, 84, 30, this.t * 0.8, 0, TAU); ctx.stroke();
      ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(cx, cy, 62, 96, -this.t * 0.6, 0, TAU); ctx.stroke(); ctx.restore();
      // corona de cinco velas sobre la máscara
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i - 2) * 0.42, vx2 = cx + Math.cos(a) * 78, vy2 = cy + Math.sin(a) * 78;
        ctx.fillStyle = "#f3ecd8"; ctx.fillRect(vx2 - 2.5, vy2 - 8, 5, 12); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 1.6; ctx.strokeRect(vx2 - 2.5, vy2 - 8, 5, 12);
        const cf = 0.6 + Math.sin(this.t * 10 + i * 1.9) * 0.35; ctx.fillStyle = `rgba(255,190,80,${cf})`; ctx.beginPath(); ctx.ellipse(vx2, vy2 - 13, 3, 6 + cf * 2, 0, 0, TAU); ctx.fill();
      }
      // capa hecha jirones
      ctx.fillStyle = "#0c0a14"; ctx.beginPath(); ctx.moveTo(cx - 34, cy - 20);
      for (let i = 0; i <= 6; i++) { const tx = cx - 34 + i * 12, ty = cy + 60 + Math.sin(this.t * 5 + i * 1.6) * 14 + i % 2 * 12; ctx.lineTo(tx, ty); }
      ctx.lineTo(cx + 38, cy - 20); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 4; ctx.stroke();
      // partituras orbitando
      for (let i = 0; i < 7; i++) {
        const a = this.t * 1.7 + i * (TAU / 7), rx = cx + Math.cos(a) * 96, ry = cy + Math.sin(a) * 66;
        ctx.save(); ctx.translate(rx, ry); ctx.rotate(Math.sin(this.t * 2 + i) * 0.5);
        ctx.fillStyle = "#f3ecd8"; roundRectB(ctx, -9, -12, 18, 24, 3); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.strokeStyle = "#3a3040"; ctx.lineWidth = 1.4; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(-6, -6 + k * 6); ctx.lineTo(6, -6 + k * 6); ctx.stroke(); }
        ctx.fillStyle = "#14101e"; ctx.beginPath(); ctx.arc(2, -1, 2.4, 0, TAU); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(4.4, -1); ctx.lineTo(4.4, -9); ctx.stroke();
        ctx.restore();
      }
      // máscara dorada
      const mgold = ctx.createLinearGradient(cx - 40, cy - 50, cx + 30, cy + 40); mgold.addColorStop(0, flash ? "#fff" : "#ffe9a8"); mgold.addColorStop(0.55, "#ffd24a"); mgold.addColorStop(1, "#b8860f");
      ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.sin(this.t * 1.3) * 0.08);
      ctx.fillStyle = mgold; ctx.beginPath(); ctx.moveTo(-38, -46); ctx.quadraticCurveTo(44, -58, 42, 4); ctx.quadraticCurveTo(38, 48, 6, 54); ctx.lineTo(-16, 26); ctx.lineTo(-34, 32); ctx.closePath(); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 5; ctx.stroke();
      // llama sobre la máscara
      const fl = Math.sin(this.t * 9);
      ctx.fillStyle = `rgba(255,170,40,${0.75 + fl * 0.2})`; ctx.beginPath(); ctx.moveTo(-6, -46); ctx.quadraticCurveTo(-12 - fl * 4, -74, 0, -88 - fl * 6); ctx.quadraticCurveTo(12 + fl * 4, -72, 6, -46); ctx.closePath(); ctx.fill();
      ctx.fillStyle = `rgba(255,240,170,${0.8})`; ctx.beginPath(); ctx.ellipse(0, -62, 4, 10 + fl * 3, 0, 0, TAU); ctx.fill();
      ctx.restore();
      this.eye(ctx, cx + 8, cy - 8, 13);
      const gl2 = 0.6 + Math.sin(this.t * 6) * 0.3;
      ctx.fillStyle = `rgba(255,90,60,${gl2})`; ctx.beginPath(); ctx.arc(cx - 16, cy - 12, 4.5, 0, TAU); ctx.fill();
      // guante con batuta dirigiendo en forma de 8
      const ba = this.t * 2.6, bx = cx - 90 + Math.sin(ba) * 26, by = cy + 10 + Math.sin(ba * 2) * 18;
      ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(bx, by, 11, 0, TAU); ctx.fill(); ctx.strokeStyle = "#14101e"; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.strokeStyle = "#f3ecd8"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(bx, by - 4); ctx.lineTo(bx + Math.cos(ba) * 34, by - 18 + Math.sin(ba) * 12); ctx.stroke();
      ctx.strokeStyle = "#14101e"; ctx.lineWidth = 1.4; ctx.stroke();
    }
  }
  window.CODE_BOSS = { id: "requiem", name: "RÉQUIEM", subtitle: "La pieza que El Autor compuso… y enterró", color: "#ffd24a", transpose: 0, world: 0, mode: "ground", code: true, make: G => new RequiemBoss(G) };

  window.SECRET_BOSS = { id: "discard", name: "El Descarte", subtitle: "El primer boceto que El Autor borró", color: "#2e2746", transpose: -4, world: 4, mode: "ground", secret: true, make: G => new DiscardBoss(G) };

  window.BOSSES = [
    { id: "spore", name: "General Esporo", subtitle: "Hongo dictatorial del Bosque de Tinta", color: "#c0432f", transpose: 0, world: 1, mode: "ground", make: G => new SporeBoss(G) },
    { id: "pirate", name: "Capitán Salmuera", subtitle: "Pirata cangrejo de la Bahía Rancia", color: "#d4533a", transpose: 2, world: 1, mode: "ground", make: G => new PirateBoss(G) },
    { id: "robot", name: "Don Tornillo", subtitle: "Autómata de cuerda de la Fábrica Vieja", color: "#8a90a0", transpose: 3, world: 1, mode: "ground", make: G => new RobotBoss(G) },
    { id: "moth", name: "Madame Polilla", subtitle: "Bruja nocturna del Polvo Lunar", color: "#7a4fa0", transpose: 5, world: 1, mode: "ground", make: G => new MothBoss(G) },
    { id: "jester", name: "Arlequín", subtitle: "Bufón sin alma del Carnaval Perdido", color: "#c0392b", transpose: -3, world: 1, mode: "ground", make: G => new JesterBoss(G) },
    { id: "collector", name: "El Coleccionista", subtitle: "Dueño de todas las deudas", color: "#7a1020", transpose: -2, world: 1, mode: "ground", make: G => new CollectorBoss(G) },
    { id: "airship", name: "Capitán Cúmulo", subtitle: "Pirata del aire de los Cielos de Tinta", color: "#d8534a", transpose: 4, world: 2, mode: "flight", make: G => new AirshipBoss(G) },
    { id: "ice", name: "Condesa Escarcha", subtitle: "Reina helada del Pico Olvidado", color: "#6fa8c8", transpose: 7, world: 2, mode: "ground", make: G => new IceBoss(G) },
    { id: "croupier", name: "El Crupier", subtitle: "Banquero de almas del Casino Eterno", color: "#7a1020", transpose: -5, world: 2, mode: "ground", make: G => new CroupierBoss(G) },
    { id: "puppeteer", name: "El Titiritero", subtitle: "Amo de marionetas del Teatro Sombrío", color: "#5a3a7a", transpose: 6, world: 3, mode: "ground", make: G => new PuppeteerBoss(G) },
    { id: "chimera", name: "Quimera", subtitle: "Bestia de tres cabezas del Abismo", color: "#7a5a3a", transpose: 1, world: 3, mode: "ground", make: G => new ChimeraBoss(G) },
    { id: "director", name: "El Director", subtitle: "Maestro del Gran Final", color: "#7a0810", transpose: -7, world: 3, mode: "ground", make: G => new DirectorBoss(G) },
    { id: "sentinel", name: "El Centinela", subtitle: "Ojo guardián del Vacío de Tinta", color: "#6a3aa0", transpose: 8, world: 4, mode: "ground", make: G => new SentinelBoss(G) },
    { id: "pen", name: "La Pluma Errante", subtitle: "Pluma viva de la Mesa de Dibujo", color: "#3a2a6a", transpose: 3, world: 4, mode: "flight", make: G => new PenBoss(G) },
    { id: "author", name: "El Autor", subtitle: "La mano que os dibujó a todos", color: "#1a120a", transpose: -9, world: 4, mode: "ground", make: G => new AuthorBoss(G) },
    { id: "twin", name: "La Gemela", subtitle: "Tu reflejo en el espejo de tinta", color: "#8fb8d8", transpose: 4, world: 5, mode: "ground", make: G => new TwinBoss(G) },
    { id: "siphon", name: "El Sifón", subtitle: "Bombea la gravedad del Reverso", color: "#3a7a9a", transpose: 1, world: 5, mode: "ground", make: G => new SiphonBoss(G) },
    { id: "lefthand", name: "La Mano Zurda", subtitle: "La mano que borra lo que El Autor dibujó", color: "#b8a8d8", transpose: -6, world: 5, mode: "ground", make: G => new LeftHandBoss(G) },
  ];
})();
