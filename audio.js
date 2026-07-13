/* ============================================================
   RAGTIME RUMBLE — Motor de audio (v2)
   Banda sonora de jazz/big-band generada en tiempo real con la
   Web Audio API. Cada tema tiene un MOTIVO compuesto (la "llamada")
   y compases de improvisación por frases (la "respuesta"), batería
   con swing, fills y platillos, contrabajo caminante con notas
   fantasma, comping sin fundamentales (3ª+7ª+color), y capas por
   tema: clarinete (isla), piano stride (tienda), pedal de metales
   (jefes), campanas (victoria) y timbales (RÉQUIEM).
   Todos los efectos de sonido siguen sintetizados al vuelo.
   ============================================================ */
(function () {
  let ctx = null, master = null, musicBus = null, sfxBus = null, comp = null;
  let echoBus = null;   // envío de eco (solo si el navegador tiene createDelay)
  let noiseBuf = null;
  let muted = false;
  let musicVol = 0.55, sfxVol = 0.85;

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
    comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 22; comp.ratio.value = 4;
    comp.attack.value = 0.004; comp.release.value = 0.18;
    musicBus = ctx.createGain(); musicBus.gain.value = musicVol;
    sfxBus = ctx.createGain(); sfxBus.gain.value = sfxVol;
    musicBus.connect(comp); sfxBus.connect(comp);
    comp.connect(master); master.connect(ctx.destination);

    // eco slap-back con retroalimentación filtrada (da "sala de teatro" a los solos)
    if (ctx.createDelay) {
      echoBus = ctx.createGain(); echoBus.gain.value = 0.26;
      const d = ctx.createDelay(0.8); d.delayTime.value = 0.23;
      const fb = ctx.createGain(); fb.gain.value = 0.32;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 2200;
      echoBus.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(musicBus);
    }

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const now = () => ctx.currentTime;
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);
  const J = () => (Math.random() - 0.5) * 0.011;   // micro-desfase humano

  /* ---------- voces tonales ---------- */
  function tone(time, freq, dur, o) {
    o = o || {};
    const osc = ctx.createOscillator();
    osc.type = o.type || "triangle";
    osc.frequency.setValueAtTime(freq, time);
    if (osc.detune) osc.detune.value = o.det != null ? o.det : (Math.random() - 0.5) * 7;  // afinación humana
    if (o.glide) {
      osc.frequency.setValueAtTime(o.glide, time);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq), time + 0.05);
    }
    const g = ctx.createGain();
    const peak = o.gain == null ? 0.3 : o.gain;
    const a = o.a == null ? 0.006 : o.a;
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(peak, time + a);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    let node = osc;
    if (o.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass"; f.frequency.value = o.cutoff; f.Q.value = o.q || 0.7;
      osc.connect(f); node = f;
    }
    node.connect(g);
    g.connect(o.bus || musicBus);
    if (o.echo && echoBus) g.connect(echoBus);
    if (o.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vib; lg.gain.value = o.vibAmt || 4;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(time); lfo.stop(time + dur + 0.05);
    }
    // gemelo desafinado para engordar los leads
    if (o.fat) {
      const o2 = ctx.createOscillator();
      o2.type = osc.type; o2.frequency.setValueAtTime(freq * 1.005, time);
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.0001, time);
      g2.gain.exponentialRampToValueAtTime(peak * 0.6, time + a);
      g2.gain.exponentialRampToValueAtTime(0.0001, time + dur);
      o2.connect(g2); g2.connect(o.bus || musicBus);
      o2.start(time); o2.stop(time + dur + 0.06);
    }
    osc.start(time); osc.stop(time + dur + 0.06);
  }

  /* ---------- percusión ---------- */
  function noiseHit(time, p) {
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    s.playbackRate.value = p.rate || 1;
    const g = ctx.createGain();
    g.gain.setValueAtTime(p.gain, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + p.dur);
    let node = s;
    if (p.hp) { const f = ctx.createBiquadFilter(); f.type = "highpass"; f.frequency.value = p.hp; node.connect(f); node = f; }
    if (p.lp) { const f = ctx.createBiquadFilter(); f.type = "lowpass"; f.frequency.value = p.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(p.bus || musicBus);
    s.start(time); s.stop(time + p.dur + 0.03);
  }
  const kick = (t, gain) => {
    const o = ctx.createOscillator(); o.type = "sine";
    o.frequency.setValueAtTime(150, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.13);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.22);
  };
  const snare = (t, gain) => { noiseHit(t, { dur: 0.18, hp: 1400, gain }); tone(t, 190, 0.1, { type: "triangle", gain: gain * 0.3 }); };
  const stick = (t, gain) => { tone(t, 620, 0.05, { type: "triangle", gain: gain * 0.8 }); noiseHit(t, { dur: 0.03, hp: 2600, gain: gain * 0.5 }); }; // rim-click de escobilla
  const hat = (t, gain, open) => noiseHit(t, { dur: open ? 0.14 : 0.04, hp: 7500, gain });
  const ride = (t, gain) => noiseHit(t, { dur: 0.25, hp: 6500, lp: 13000, gain, rate: 1.0 });
  const crash = (t, gain) => noiseHit(t, { dur: 0.85, hp: 3400, lp: 11500, gain, rate: 0.9 });
  const tom = (t, f0, gain) => { const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.62, t + 0.16); const g = ctx.createGain(); g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2); o.connect(g); g.connect(musicBus); o.start(t); o.stop(t + 0.22); noiseHit(t, { dur: 0.05, hp: 900, lp: 4000, gain: gain * 0.3 }); };
  const timpani = (t, midi, gain) => { tone(t, mf(midi), 0.9, { type: "sine", gain, a: 0.004 }); noiseHit(t, { dur: 0.3, hp: 60, lp: 500, gain: gain * 0.5, rate: 0.5 }); };

  /* ============================================================
     SECUENCIADOR DE JAZZ
     ============================================================ */
  // tipos de acorde -> semitonos
  const CH = {
    maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], m7b5: [0, 3, 6, 10],
  };
  // Cada progresión: {root: midi grave, type}
  function P(root, type) { return { root, type }; }

  /* Cada tema define:
     · prog/scale: armonía y escala del solista
     · motif: 2 compases COMPUESTOS (16 corcheas con swing; null = silencio)
              que suenan en los compases 0-1 de cada frase de 4 ("llamada")
     · style: "swing" (ride + walking) o "stride" (oom-pah ragtime)
     · capas: clar (clarinete), bellArp (campanitas), pedal (metal grave),
              wash (chasquido de tabla de lavar), bell/pad/timp (RÉQUIEM) */
  const TRACKS = {
    menu: {
      tempo: 126, drum: 0.85, intensity: 1, leadDens: 0.5, leadWave: "triangle", leadCut: 2400, compOct: 24,
      style: "swing", clar: true, leadEcho: true,
      prog: [P(48, "maj7"), P(45, "min7"), P(50, "min7"), P(43, "dom7"), P(48, "maj7"), P(53, "maj7"), P(50, "min7"), P(43, "dom7")],
      scale: [72, 74, 76, 79, 81, 84, 86], // C mayor pentatónica
      motif: [4, null, 3, null, 1, 2, 3, null, 2, null, 0, null, 1, null, null, null],
    },
    shop: {
      tempo: 116, drum: 0.6, intensity: 0.9, leadDens: 0.55, leadWave: "square", leadCut: 1700, compOct: 24,
      style: "stride", wash: true,
      prog: [P(48, "maj7"), P(57, "dom7"), P(50, "dom7"), P(43, "dom7")], // círculo de quintas juguetón
      scale: [72, 74, 76, 79, 81, 84],
      motif: [5, null, 4, 5, 3, null, 2, null, 3, 4, null, 2, 0, null, null, null],
    },
    battle: {
      tempo: 178, drum: 1.0, intensity: 1.6, leadDens: 0.62, leadWave: "sawtooth", leadCut: 2600, compOct: 24,
      style: "swing",
      prog: [P(45, "min7"), P(50, "min7"), P(40, "dom7"), P(45, "min7")], // vamp en La menor
      scale: [69, 72, 74, 75, 76, 79, 81, 84], // La menor pent + blue note (75)
      motif: [7, null, 5, 7, null, 4, 5, null, 3, null, 4, 5, null, 7, null, null],
    },
    boss: {
      tempo: 190, drum: 1.0, intensity: 1.9, leadDens: 0.68, leadWave: "sawtooth", leadCut: 3000, compOct: 24,
      style: "swing", pedal: true,
      prog: [P(44, "min7"), P(49, "min7"), P(39, "dom7"), P(44, "m7b5")], // más oscuro / final
      scale: [68, 71, 73, 74, 75, 78, 80, 83],
      motif: [0, null, null, 2, 1, null, 3, null, 5, null, 4, null, 3, 2, 1, null],
    },
    victory: {
      tempo: 152, drum: 0.95, intensity: 1.3, leadDens: 0.7, leadWave: "triangle", leadCut: 2600, compOct: 24,
      style: "swing", bellArp: true, leadEcho: true,
      prog: [P(48, "maj7"), P(53, "maj7"), P(50, "min7"), P(43, "dom7")],
      scale: [72, 76, 79, 81, 84, 88],
      motif: [2, null, 4, null, 5, null, 4, 2, 3, null, 5, null, 4, null, null, null],
    },
    // LA DISONANCIA (jefe final secreto): el ANTI-JAZZ — ostinato con trítono, sirenas
    // de terror, clústeres de segunda menor, tom marcial y la banda tocando con furia.
    // Compuesto para que la pelea más difícil del juego SUENE como el fin del mundo con swing.
    diss: (() => {
      // ══ EL TEMA DE LA DISONANCIA ══ una canción que cuenta su historia en 5 movimientos.
      // Regla nº1: ELLA NO SWINGUEA (straight) — todo el juego baila; ella marcha. Anti-jazz.
      // 0. AMENAZA — latido, campanadas y el riff a lo lejos. Su pregunta suena UNA vez, en la niebla.
      // I. FURIA — la CÉLULA del tema martillea subiendo un peldaño por compás. Tarareable al 2º compás.
      // II. OBSESIÓN — la misma célula una 3ª menor arriba Y A DOS VOCES en 4ᵃˢ: la idea fija se multiplica.
      // III. EL CORAZÓN — la banda calla. La célula a MITAD de velocidad, cajita de música: el tema, llorando.
      // IV. DESAFÍO — la célula UNA OCTAVA arriba, coro en 3ᵃˢ, batería al máximo: se niega a desaparecer.
      //     …y el V7 final la ARRASTRA a empezar otra vez. Su bucle es su condena.
      // LA CÉLULA: "ta-ta-TAAA · da-da-dum" — dos golpes, salto a la octava, y cae por el
      // trítono. Se repite subiendo un peldaño cada compás (la reconoces al 2º compás y
      // ya la estás tarareando). Su nota "equivocada" (el trítono, 3) acaba siendo la
      // sensible que EMPUJA la canción a volver a empezar: lo roto era el motor.
      const TEMA = [
        0, 0, 6, null, 4, null, 3, 2,         // FA-FA-¡FA'! … DO … si-sib (la célula)
        1, 1, 6, null, 4, null, 3, 2,         // desde LAb: la misma célula, un paso arriba
        2, 2, 6, null, 4, null, 3, 2,         // desde SIb: ya la conoces, ya la esperas
        3, 3, 6, null, 4, null, 5, 4,         // ¡desde el TRÍTONO! y la cola SUBE: la pregunta
        5, null, 4, null, 3, null, 4, null,   // Eb… Do… si… do… — el eco suspira
        5, 6, null, 5, 7, null, 6, null,      // trepa con esperanza…
        8, null, 7, 6, 5, null, 4, 3,         // …y se despeña en cascada hasta su herida
        3, null, 3, 3, null, 4, null, null,   // si·si-si → DO: el trítono EMPUJA a empezar de nuevo
      ];
      // EL CORAZÓN canta LA MISMA célula a mitad de velocidad: el tema, llorando
      const LAMENTO = [
        0, null, null, null, 6, null, null, null,   // "yo…"        (la célula, estirada)
        4, null, null, null, 3, null, 2, null,      // "…también…"  (su caída, en voz baja)
        1, null, null, null, 6, null, null, null,   // "…quería…"
        4, null, null, 3, null, null, 2, null,      // "…sonar…"
        5, null, null, null, 4, null, null, null,   // el anhelo sube
        3, null, null, null, 4, null, null, null,   // la cicatriz… y el paso siguiente
        8, null, null, 7, null, 6, null, null,      // un suspiro agudo
        6, null, null, null, null, null, null, null,// …y descansa en Fa: casi paz
      ];
      const AMENAZA = [
        3, null, null, null, null, null, null, null,     // el TRÍTONO solo, como una campanada más
        null, null, null, null, 6, null, 5, null,        // …dos pasos que se acercan en la niebla…
        3, null, null, null, null, null, null, null,     // la pregunta, otra vez. Nadie contesta.
        3, 3, null, 3, null, null, 6, null,              // …martillea bajito. YA VIENE.
      ];
      // el bucle ÉPICO i–VI–VII / i–VI–V7: Fm Fm Db Eb7 · Fm Db C7 C7 (el V7 tira de vuelta al inicio)
      const FURIA_PROG = [P(41, "min7"), P(41, "min7"), P(37, "maj7"), P(39, "dom7"), P(41, "min7"), P(37, "maj7"), P(48, "dom7"), P(48, "dom7")];
      return {
        tempo: 200, drum: 1.1, intensity: 2.6, leadDens: 0.85, leadWave: "sawtooth", leadCut: 4200, compOct: 12,
        style: "swing", straight: true, pedal: true, bell: true, pad: true, timp: true, dissX: true, leadEcho: true,
        scale: [65, 68, 70, 71, 72, 75, 77, 80, 82, 84],   // Fa menor + TRÍTONO (71) + blue notes
        riff: [0, 0, 3, 0, 6, 5, 3, 1],                     // el bajo con el trítono clavado en el corazón
        prog: FURIA_PROG,
        sections: [
          { bars: 4, omen: true, drum: 0.45, prog: FURIA_PROG, mel: AMENAZA },                  // 0. AMENAZA
          { bars: 8, prog: FURIA_PROG, mel: TEMA, drum: 1.1 },                                  // I. FURIA
          { bars: 8, prog: FURIA_PROG, mel: TEMA, tr: 3, drum: 1.2, harm: -5 },                 // II. OBSESIÓN (a 2 voces en 4ᵃˢ)
          { bars: 8, soft: true, drum: 0.28, mel: LAMENTO,                                       // III. EL CORAZÓN
            prog: [P(44, "maj7"), P(41, "min7"), P(46, "min7"), P(39, "dom7"), P(44, "maj7"), P(49, "maj7"), P(46, "min7"), P(39, "dom7")] },
          { bars: 8, prog: FURIA_PROG, mel: TEMA, lift: 12, drum: 1.35, harm: -3 },             // IV. DESAFÍO (coro en 3ᵃˢ)
        ],
      };
    })(),
    // RÉQUIEM (jefe del código del Mausoleo): big-band fúnebre y feroz — campana, metales graves y doble tiempo
    finale: {
      tempo: 196, drum: 1.05, intensity: 2.3, leadDens: 0.8, leadWave: "sawtooth", leadCut: 3600, compOct: 12, bell: true, pad: true, timp: true,
      style: "swing",
      prog: [P(41, "min7"), P(41, "min7"), P(46, "m7b5"), P(39, "dom7"), P(37, "maj7"), P(46, "min7"), P(39, "dom7"), P(39, "dom7")], // 8 compases en Fa menor
      scale: [65, 68, 70, 72, 73, 75, 77, 80, 82, 84], // Fa menor + blue notes
      motif: [9, null, 8, 7, null, 5, null, 3, 4, 5, null, 7, null, 8, null, null],
    },
  };

  let schedTimer = null, nextTime = 0, bar = 0, beat = 0, track = null, leadIdx = 3, trackName = null, trackTr = 0;
  let phrase = { rest: 0, notes: 0, dir: 1 };   // estado del solista (frases con respiración)
  let curSec = null, curSecBar = 0;             // sección actual de una CANCIÓN por secciones (track.sections)

  function chordTones(c) { return CH[c.type].map(iv => c.root + iv + trackTr); }
  // voicing de jazz sin fundamental: 3ª + 7ª + una nota de color (9ª o 5ª)
  function compVoicing(c) {
    const iv = CH[c.type], r = c.root + trackTr;
    const color = Math.random() < 0.5 ? r + 14 : r + iv[2];
    return [r + iv[1], r + iv[3], color];
  }

  function bassNote(c, b, prog) {
    const r = c.root + trackTr;
    if (b === 0) return r;
    if (b === 1) return Math.random() < 0.5 ? r + CH[c.type][1] : r + 7;   // 3ª o 5ª
    if (b === 2) return Math.random() < 0.3 ? r + 7 : r + 12;
    const next = prog[(bar + 1) % prog.length].root + trackTr;
    return Math.random() < 0.5 ? next - 1 : next + 1; // aproximación cromática por abajo o por arriba
  }

  /* --- solista: motivo compuesto (compases 0-1) + frases improvisadas (2-3) --- */
  function scheduleLead(t, swing, spb) {
    const scl = track.scale, N = scl.length;
    // ---- CANCIÓN POR SECCIONES: la melodía está ESCRITA nota a nota (cuenta una historia) ----
    if (curSec && curSec.mel) {
      const soft = !!curSec.soft, omen = !!curSec.omen;
      [t, t + swing].forEach((st, i) => {
        const slot = curSecBar * 8 + beat * 2 + i;
        const v = curSec.mel[slot];
        if (v == null) return;
        const midi = scl[Math.min(v, N - 1)] + trackTr + (curSec.tr || 0) + (curSec.lift || 0);
        const nxt = curSec.mel[slot + 1];
        const dur = spb * (nxt == null ? 1.05 : (i ? 0.45 : 0.52));   // si la frase respira, la nota canta más larga
        tone(st + J() * 0.4, mf(midi), dur, {
          type: soft && !omen ? "triangle" : track.leadWave,
          gain: omen ? 0.12 : soft ? 0.17 : 0.18,
          cutoff: omen ? 1400 : soft ? 2000 : track.leadCut, a: omen ? 0.04 : soft ? 0.025 : 0.01,
          vib: soft ? 4.5 : 5.5, vibAmt: soft ? 3 : 5, fat: !soft && !omen, echo: true,
        });
        // VOZ DE ARMONÍA: una segunda trompeta canta en paralelo (3ᵃˢ o 4ᵗᵃˢ) — el tema se hace CORO
        if (curSec.harm != null && !soft) tone(st + J() * 0.4 + 0.012, mf(midi + curSec.harm), dur * 0.92, {
          type: track.leadWave, gain: 0.09, cutoff: track.leadCut * 0.8, a: 0.012, vib: 5.5, vibAmt: 4, echo: true,
        });
        // en el corazón, una campanita dobla la melodía una octava arriba (cajita de música)
        if (soft && !omen && nxt == null) tone(st + 0.02, mf(midi + 12), dur * 0.8, { type: "sine", gain: 0.06, a: 0.01, echo: true });
      });
      return;
    }
    const gLead = { type: track.leadWave, cutoff: track.leadCut, a: 0.01, vib: 5.5, vibAmt: track.intensity > 1.5 ? 5 : 3, fat: track.intensity > 1.3, echo: !!track.leadEcho };
    [t, t + swing].forEach((st, i) => {
      // ---- LLAMADA: el motivo del tema, tal cual fue "compuesto" ----
      if (track.motif && bar % 4 < 2) {
        const mi = (bar % 4) * 8 + beat * 2 + i;
        const sIdx = track.motif[mi];
        if (sIdx != null) {
          const last = mi === 15 || track.motif[mi + 1] === undefined;
          tone(st + J() * 0.5, mf(scl[Math.min(sIdx, N - 1)] + trackTr), spb * (last ? 1.1 : (i ? 0.45 : 0.55)), Object.assign({}, gLead, { gain: 0.17 }));
          leadIdx = Math.min(sIdx, N - 1);   // la improvisación arranca donde acabó el motivo
        }
        return;
      }
      // ---- RESPUESTA: improvisación por frases, con respiraciones ----
      if (phrase.rest > 0) { phrase.rest--; return; }
      if (phrase.notes <= 0) {
        if (Math.random() > track.leadDens) { phrase.rest = 1; return; }   // respira
        phrase.notes = 3 + ((Math.random() * 6) | 0);
        phrase.dir = Math.random() < 0.5 ? -1 : 1;
        if (Math.random() < 0.4) leadIdx = Math.max(0, Math.min(N - 1, leadIdx + (Math.random() < 0.5 ? -2 : 2)));
      }
      if (Math.random() < 0.22) phrase.dir *= -1;                          // giro melódico
      leadIdx = Math.max(0, Math.min(N - 1, leadIdx + phrase.dir * (Math.random() < 0.15 ? 2 : 1)));
      if (leadIdx === 0 || leadIdx === N - 1) phrase.dir *= -1;
      phrase.notes--;
      const last = phrase.notes === 0;
      tone(st + J() * 0.5, mf(scl[leadIdx] + trackTr), spb * (last ? 0.95 : (i ? 0.42 : 0.5)), Object.assign({}, gLead, { gain: 0.14 }));
      if (last) phrase.rest = 1 + ((Math.random() * 3) | 0);               // respira tras la frase
    });
  }

  /* --- un beat de STRIDE (tienda): oom-pah de piano ragtime --- */
  function strideBeat(t, spb, chord) {
    const dr = track.drum;
    // escobilla ligera en cada corchea + rim-click en 2 y 4
    hat(t + J(), 0.1 * dr, false); hat(t + spb * 0.64 + J(), 0.07 * dr, false);
    if (beat === 1 || beat === 3) stick(t + J(), 0.16 * dr);
    if (beat === 0) kick(t, 0.4 * dr);
    if (beat === 0 || beat === 2) {
      // "oom": bajo en fundamental (1) y quinta (3)
      tone(t + J(), mf(chord.root + trackTr + (beat === 2 ? 7 : 0)), spb * 0.85, { type: "triangle", gain: 0.36, cutoff: 520, a: 0.008 });
    } else {
      // "pah": acorde a contratiempo, seco
      compVoicing(chord).forEach(m => tone(t + J(), mf(m + track.compOct), spb * 0.3, { type: "triangle", gain: 0.12, a: 0.004 }));
    }
    if (track.wash) noiseHit(t + spb * 0.64, { dur: 0.025, hp: 8200, gain: 0.05 * dr });   // tabla de lavar
  }

  /* --- un beat de SWING: ride, walking bass, Charleston, capas --- */
  function swingBeat(t, spb, chord, prog) {
    const swing = spb * (track.straight ? 0.5 : 0.64);
    const omen = !!(curSec && curSec.omen);   // sección de PRESAGIO: campanadas y el riff a lo lejos
    const soft = !!(curSec && curSec.soft) || omen;   // sección íntima: la banda casi calla y habla el corazón
    const dr = track.drum * (curSec && curSec.drum != null ? curSec.drum : 1);
    const fill = bar % 4 === 3 && beat === 3 && !soft;   // remate al final de cada frase de 4 compases

    // platillo de entrada de sección (en canciones por secciones, al arrancar CADA movimiento)
    if (beat === 0 && (curSec ? curSecBar === 0 && !omen : bar % 8 === 0)) crash(t, 0.12 * dr);
    if (omen) {
      // PRESAGIO: solo un latido de bombo y un tambor de guerra lejano
      if (beat === 0) kick(t, 0.55 * dr);
      if (beat === 2) tom(t + J(), 92, 0.3);
    } else if (track.straight) {
      // LA DISONANCIA NO SWINGUEA: metrónomo marcial de corcheas rectas — el anti-jazz
      hat(t + J(), (beat === 0 ? 0.24 : 0.16) * dr, false); hat(t + swing + J(), 0.12 * dr, false);
      if (beat === 1 || beat === 3) snare(t + J(), 0.24 * dr);
      kick(t, (beat === 0 || beat === 2 ? 0.8 : 0.12) * dr);
      if (beat === 2) kick(t + swing, 0.42 * dr);   // el empujón del "y" de 3: la máquina no respira
      if (fill) { tom(t + J(), 220, 0.2 * dr); tom(t + spb * 0.33, 170, 0.2 * dr); tom(t + spb * 0.66, 125, 0.24 * dr); }
    } else {
      // patrón de ride clásico: negra en cada tiempo + "skip" en 2 y 4
      ride(t + J(), (beat === 0 ? 0.2 : 0.15) * dr);
      if (beat === 1 || beat === 3) ride(t + swing + J(), 0.11 * dr);
      if (beat === 1 || beat === 3) { hat(t, 0.2 * dr, false); snare(t + J(), 0.14 * dr); }
      kick(t, (beat === 0 ? 0.7 : 0.26) * dr);
      // notas fantasma de caja (comping de batería)
      if (track.intensity > 1.2 && Math.random() < 0.3) snare(t + swing + J(), 0.05 * dr);
      if (track.intensity > 1.4 && (beat === 0 || beat === 2) && Math.random() < 0.5) snare(t + swing, 0.07 * dr);
      if (fill) { tom(t + J(), 220, 0.2 * dr); tom(t + spb * 0.33, 170, 0.2 * dr); tom(t + spb * 0.66, 125, 0.24 * dr); }
    }

    // contrabajo: ostinato COMPUESTO (riff con carácter) o caminante clásico
    if (omen && track.riff) {
      // el riff a MEDIA MÁQUINA: solo la primera nota de cada tiempo, acechando
      if (beat === 0 || beat === 2) tone(t + J(), mf(chord.root + trackTr + track.riff[beat * 2]), spb * 0.9, { type: "sawtooth", gain: 0.22, cutoff: 560, a: 0.012 });
    } else if (soft) {
      if (beat === 0 || beat === 2) tone(t + J(), mf(chord.root + trackTr), spb * 1.8, { type: "triangle", gain: 0.2, cutoff: 420, a: 0.03 });
    } else if (track.riff) {
      const r0 = chord.root + trackTr;
      tone(t + J(), mf(r0 + track.riff[beat * 2]), spb * 0.52, { type: "sawtooth", gain: 0.3, cutoff: 720, a: 0.006 });
      tone(t + swing + J(), mf(r0 + track.riff[beat * 2 + 1]), spb * 0.42, { type: "sawtooth", gain: 0.24, cutoff: 720, a: 0.006 });
    } else {
      tone(t + J(), mf(bassNote(chord, beat, prog)), spb * 0.92, { type: "triangle", gain: 0.34, cutoff: 520, a: 0.008 });
      if (beat === 3 && Math.random() < 0.3) tone(t + swing, mf(chord.root + trackTr), spb * 0.3, { type: "triangle", gain: 0.13, cutoff: 480, a: 0.006 });
    }

    // comping Charleston (dos variantes alternadas por compás) — en el presagio la banda aún no entra
    const v = bar % 2;
    if (!omen && ((v === 0 && (beat === 0 || beat === 2)) || (v === 1 && (beat === 1 || beat === 2)))) {
      compVoicing(chord).forEach(m =>
        tone(t + swing + J(), mf(m + track.compOct), spb * 0.4, { type: "triangle", gain: 0.1, a: 0.005 }));
    }

    // sección de metales en los temas intensos (acentos brillantes)
    if (track.intensity > 1.4 && beat === 3 && !soft) {
      const ct = chordTones(chord);
      [ct[1], ct[2]].forEach(m =>
        tone(t + swing, mf(m + 12), spb * 0.5, { type: "sawtooth", gain: 0.09, a: 0.012, cutoff: 2300, fat: true, vib: 6, vibAmt: 4 }));
    }
    // pedal de metal grave (temas de jefe): tensión sostenida
    if (track.pedal && (beat === 0 || beat === 2) && !soft) {
      tone(t, mf(chord.root + trackTr - 12), spb * 0.9, { type: "sawtooth", gain: 0.1, cutoff: 460, a: 0.02, fat: true });
    }
    // clarinete cálido (isla): nota larga de color en cada compás
    if (track.clar && beat === 0) {
      const iv = CH[chord.type];
      const m = chord.root + trackTr + (bar % 2 ? iv[3] : iv[1]) + 12;
      tone(t + spb * 0.5, mf(m), spb * 3.2, { type: "triangle", gain: 0.055, a: 0.09, cutoff: 1800, vib: 4.5, vibAmt: 3, echo: true });
    }
    // arpegio de campanitas (victoria)
    if (track.bellArp && beat === 0) {
      chordTones(chord).slice(0, 3).forEach((m, i) =>
        tone(t + i * spb * 0.25, mf(m + 24), 0.5, { type: "sine", gain: 0.08, a: 0.004, echo: true }));
    }
    // tema final (RÉQUIEM): campana fúnebre cada 2 compases + coro/pad + timbales
    // en el PRESAGIO dobla en CADA compás: el reloj que anuncia lo que viene
    if (track.bell && beat === 0 && (bar % 2 === 0 || omen)) {
      tone(t, mf(33 + trackTr), 2.2, { type: "sine", gain: omen ? 0.34 : 0.3, a: 0.004 });
      tone(t, mf(40 + trackTr) + 1.7, 1.5, { type: "triangle", gain: 0.09, a: 0.004 });
    }
    if (track.pad && beat === 0) {
      chordTones(chord).forEach(m => tone(t, mf(m + 12), spb * 3.8, { type: "sine", gain: 0.05, a: 0.5, cutoff: 1300 }));
      tone(t, mf(chord.root + trackTr + 24), spb * 3.8, { type: "triangle", gain: 0.035, a: 0.7, cutoff: 1100, vib: 4, vibAmt: 3 });
    }
    if (track.timp && bar % 4 === 0 && beat === 0 && !soft) {
      for (let i = 0; i < 5; i++) timpani(t + i * 0.07, chord.root + trackTr - 12, 0.09 + i * 0.02);
    }
    // LA DISONANCIA: sirena de terror que TREPA cada 4 compases + clúster de 2ª menor + tom marcial
    if (track.dissX && !soft) {
      if (bar % 4 === 3 && beat === 0)
        tone(t, mf(chord.root + trackTr + 18), spb * 3.6, { type: "sawtooth", gain: 0.07, glide: mf(chord.root + trackTr + 11), cutoff: 2800, a: 0.35, vib: 7.5, vibAmt: 10, echo: true });
      if (beat === 2) {
        tone(t + swing, mf(chord.root + trackTr + 13), spb * 0.85, { type: "triangle", gain: 0.05, a: 0.06, cutoff: 1500 });
        tone(t + swing, mf(chord.root + trackTr + 12), spb * 0.85, { type: "triangle", gain: 0.05, a: 0.06, cutoff: 1500 });
      }
      if (beat === 1) tom(t + swing, 92, 0.24);
      if (bar % 8 === 7 && beat === 3) { crash(t, 0.16); crash(t + swing, 0.1); }   // remate antes de repetir el ciclo
    }
    if (track.intensity >= 2 && !soft) {
      if (beat === 0 || beat === 2) { const ct = chordTones(chord); tone(t, mf(ct[0]), spb * 0.65, { type: "sawtooth", gain: 0.12, cutoff: 900, fat: true, a: 0.015 }); }
      if (beat === 3) hat(t + spb * 0.32, 0.16 * dr, true);
    }
  }

  function scheduleBeat(t, spb) {
    const swing = spb * (track.straight ? 0.5 : 0.64);   // straight: corcheas RECTAS (el anti-jazz de LA DISONANCIA)
    // canción por SECCIONES: cada sección tiene su progresión, melodía escrita y dinámica
    curSec = null; curSecBar = bar;
    if (track.sections) {
      const total = track.sections.reduce((a, s) => a + s.bars, 0);
      let bb = bar % total;
      for (const s of track.sections) { if (bb < s.bars) { curSec = s; curSecBar = bb; break; } bb -= s.bars; }
    }
    const prog = (curSec && curSec.prog) || track.prog;
    const chord = prog[(curSec ? curSecBar : bar) % prog.length];
    if (track.style === "stride") strideBeat(t, spb, chord);
    else swingBeat(t, spb, chord, prog);
    scheduleLead(t, swing, spb);
  }

  function scheduler() {
    if (!track) return;
    const spb = 60 / track.tempo;
    while (nextTime < now() + 0.12) {
      scheduleBeat(nextTime, spb);
      beat++; if (beat >= 4) { beat = 0; bar++; }
      nextTime += spb;
    }
  }

  function startTrack(name, opts) {
    ensure();
    const tr = (opts && opts.transpose) || 0;
    if (trackName === name && trackTr === tr && schedTimer) return;
    stopMusic();
    track = TRACKS[name]; trackName = name; trackTr = tr;
    if (!track) return;
    bar = 0; beat = 0; leadIdx = 3; phrase = { rest: 0, notes: 0, dir: 1 }; nextTime = now() + 0.08;
    schedTimer = setInterval(scheduler, 25);
  }

  /* stings musicales cortos (no loop): arranque y cambio de fase */
  function sting(name) {
    ensure();
    const t = now();
    if (name === "go") {
      [60, 64, 67, 72].forEach((m, i) =>
        tone(t + i * 0.075, mf(m + 12), 0.32, { type: "sawtooth", gain: 0.17, cutoff: 2600, fat: true, a: 0.01 }));
      crash(t + 0.3, 0.1);
    } else if (name === "phase") {
      [0, 3, 7, 10].forEach(iv =>
        tone(t, mf(50 + iv), 0.6, { type: "sawtooth", gain: 0.12, cutoff: 1800, fat: true }));
      kick(t, 0.7);
      noiseHit(t, { dur: 0.4, hp: 300, lp: 4000, gain: 0.2 });
    }
  }
  function stopMusic() {
    if (schedTimer) { clearInterval(schedTimer); schedTimer = null; }
    track = null; trackName = null;
  }

  /* ============================================================
     EFECTOS DE SONIDO
     ============================================================ */
  function sfx(name) {
    if (!ctx) return;
    const t = now(), b = sfxBus;
    // variación de tono humana en los sonidos de combate (los de UI se dejan estables)
    const pv = 0.96 + Math.random() * 0.08;
    switch (name) {
      case "shoot":
        tone(t, 880 * pv, 0.09, { type: "square", gain: 0.16, glide: 1500 * pv, bus: b, cutoff: 3000 });
        noiseHit(t, { dur: 0.04, hp: 3000, gain: 0.06, bus: b, rate: pv }); break;
      case "shootBig":
        tone(t, 320 * pv, 0.22, { type: "sawtooth", gain: 0.26, glide: 700 * pv, bus: b, cutoff: 2200 });
        noiseHit(t, { dur: 0.12, hp: 1200, gain: 0.12, bus: b, rate: pv }); break;
      case "jump":
        tone(t, 420 * pv, 0.14, { type: "square", gain: 0.14, glide: 240 * pv, bus: b }); break;
      case "dash":
        noiseHit(t, { dur: 0.18, hp: 800, lp: 5000, gain: 0.18, bus: b, rate: 0.7 * pv }); break;
      case "hit": // jugador recibe daño
        tone(t, 200 * pv, 0.3, { type: "sawtooth", gain: 0.3, glide: 380 * pv, bus: b, cutoff: 1400 });
        noiseHit(t, { dur: 0.2, hp: 500, gain: 0.18, bus: b }); break;
      case "bosshit":
        noiseHit(t, { dur: 0.05, hp: 2000, gain: 0.08, bus: b, rate: pv }); break;
      case "parry":
        tone(t, 1320 * pv, 0.16, { type: "triangle", gain: 0.28, bus: b });
        tone(t + 0.04, 1760 * pv, 0.18, { type: "triangle", gain: 0.22, bus: b }); break;
      case "coin":
        tone(t, 1568 * pv, 0.08, { type: "square", gain: 0.16, bus: b });
        tone(t + 0.07, 2093 * pv, 0.12, { type: "square", gain: 0.16, bus: b }); break;
      case "super":
        tone(t, 130, 0.6, { type: "sawtooth", gain: 0.3, glide: 60, bus: b, cutoff: 2600 });
        for (let i = 0; i < 5; i++) tone(t + i * 0.05, mf(64 + i * 5), 0.4, { type: "square", gain: 0.12, bus: b }); break;
      case "explode":
        noiseHit(t, { dur: 0.5, hp: 200, lp: 3000, gain: 0.32, bus: b, rate: 0.5 });
        tone(t, 90, 0.5, { type: "sawtooth", gain: 0.25, glide: 200, bus: b, cutoff: 800 }); break;
      case "select":
        tone(t, 660, 0.06, { type: "square", gain: 0.14, bus: b }); break;
      case "confirm":
        tone(t, 660, 0.08, { type: "square", gain: 0.16, bus: b });
        tone(t + 0.07, 990, 0.12, { type: "square", gain: 0.16, bus: b }); break;
      case "buy":
        tone(t, 784, 0.08, { type: "triangle", gain: 0.18, bus: b });
        tone(t + 0.08, 1175, 0.1, { type: "triangle", gain: 0.18, bus: b });
        tone(t + 0.16, 1568, 0.16, { type: "triangle", gain: 0.18, bus: b }); break;
      case "deny":
        tone(t, 200, 0.18, { type: "square", gain: 0.18, glide: 260, bus: b }); break;
      case "ready":
        tone(t, 523, 0.5, { type: "sawtooth", gain: 0.2, bus: b, cutoff: 2000, fat: true }); break;
      case "ko": {
        const seq = [523, 659, 784, 1047];
        seq.forEach((f, i) => tone(t + i * 0.12, f, 0.5, { type: "square", gain: 0.2, bus: b, fat: true }));
        kick(t, 0.6); break;
      }
      case "lose":
        tone(t, 392, 0.5, { type: "sawtooth", gain: 0.22, bus: b, cutoff: 1500 });
        tone(t + 0.25, 311, 0.5, { type: "sawtooth", gain: 0.22, bus: b, cutoff: 1400 });
        tone(t + 0.5, 233, 0.8, { type: "sawtooth", gain: 0.22, bus: b, cutoff: 1200 }); break;
    }
  }

  /* ============================================================
     API pública
     ============================================================ */
  window.AUDIO = {
    resume() { ensure(); if (ctx.state === "suspended") ctx.resume(); },
    music: startTrack,
    stop: stopMusic,
    sfx,
    sting,
    toggleMute() {
      ensure(); muted = !muted;
      master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.02);
      return muted;
    },
    isMuted() { return muted; },
    setVol(m, s) {
      if (m != null) musicVol = Math.max(0, Math.min(1, m));
      if (s != null) sfxVol = Math.max(0, Math.min(1, s));
      if (ctx) { musicBus.gain.setTargetAtTime(musicVol, now(), 0.02); sfxBus.gain.setTargetAtTime(sfxVol, now(), 0.02); }
    },
    get vols() { return { music: musicVol, sfx: sfxVol }; },
    get ready() { return !!ctx; },
  };
})();
