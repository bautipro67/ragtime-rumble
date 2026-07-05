/* ============================================================
   RAGTIME RUMBLE — Motor de audio
   Banda sonora de jazz/big-band generada en tiempo real con la
   Web Audio API (batería con swing, contrabajo caminante, acordes
   comping y melodía improvisada) + efectos de sonido sintetizados.
   ============================================================ */
(function () {
  let ctx = null, master = null, musicBus = null, sfxBus = null, comp = null;
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

    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  const now = () => ctx.currentTime;
  const mf = m => 440 * Math.pow(2, (m - 69) / 12);

  /* ---------- voces tonales ---------- */
  function tone(time, freq, dur, o) {
    o = o || {};
    const osc = ctx.createOscillator();
    osc.type = o.type || "triangle";
    osc.frequency.setValueAtTime(freq, time);
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
    if (o.vib) {
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vib; lg.gain.value = o.vibAmt || 4;
      lfo.connect(lg); lg.connect(osc.frequency);
      lfo.start(time); lfo.stop(time + dur + 0.05);
    }
    // a little detuned twin for fatness on leads
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
  const hat = (t, gain, open) => noiseHit(t, { dur: open ? 0.14 : 0.04, hp: 7500, gain });
  const ride = (t, gain) => noiseHit(t, { dur: 0.25, hp: 6500, lp: 13000, gain, rate: 1.0 });

  /* ============================================================
     SECUENCIADOR DE JAZZ
     ============================================================ */
  // tipos de acorde -> semitonos
  const CH = {
    maj7: [0, 4, 7, 11], min7: [0, 3, 7, 10], dom7: [0, 4, 7, 10], m7b5: [0, 3, 6, 10],
  };
  // Cada progresión: {root: midi grave, type}
  function P(root, type) { return { root, type }; }

  const TRACKS = {
    menu: {
      tempo: 124, drum: 0.9, intensity: 1, leadDens: 0.42, leadWave: "triangle", leadCut: 2400, compOct: 24,
      prog: [P(48, "maj7"), P(45, "min7"), P(50, "min7"), P(43, "dom7")],
      scale: [72, 74, 76, 79, 81, 84, 86], // C mayor pentatónica
    },
    shop: {
      tempo: 112, drum: 0.7, intensity: 0.9, leadDens: 0.5, leadWave: "square", leadCut: 1700, compOct: 24,
      prog: [P(48, "maj7"), P(57, "dom7"), P(50, "dom7"), P(43, "dom7")], // círculo de quintas juguetón
      scale: [72, 74, 76, 79, 81, 84],
    },
    battle: {
      tempo: 178, drum: 1.0, intensity: 1.6, leadDens: 0.62, leadWave: "sawtooth", leadCut: 2600, compOct: 24,
      prog: [P(45, "min7"), P(50, "min7"), P(40, "dom7"), P(45, "min7")], // vamp en La menor
      scale: [69, 72, 74, 75, 76, 79, 81, 84], // La menor pent + blue note (75)
    },
    boss: {
      tempo: 190, drum: 1.0, intensity: 1.9, leadDens: 0.68, leadWave: "sawtooth", leadCut: 3000, compOct: 24,
      prog: [P(44, "min7"), P(49, "min7"), P(39, "dom7"), P(44, "m7b5")], // más oscuro / final
      scale: [68, 71, 73, 74, 75, 78, 80, 83],
    },
    victory: {
      tempo: 150, drum: 0.95, intensity: 1.3, leadDens: 0.7, leadWave: "triangle", leadCut: 2600, compOct: 24,
      prog: [P(48, "maj7"), P(53, "maj7"), P(50, "min7"), P(43, "dom7")],
      scale: [72, 76, 79, 81, 84, 88],
    },
    // RÉQUIEM (jefe del código del Mausoleo): big-band fúnebre y feroz — campana, metales graves y doble tiempo
    finale: {
      tempo: 196, drum: 1.05, intensity: 2.3, leadDens: 0.8, leadWave: "sawtooth", leadCut: 3600, compOct: 12, bell: true, pad: true,
      prog: [P(41, "min7"), P(41, "min7"), P(46, "m7b5"), P(39, "dom7"), P(37, "maj7"), P(46, "min7"), P(39, "dom7"), P(39, "dom7")], // 8 compases en Fa menor
      scale: [65, 68, 70, 72, 73, 75, 77, 80, 82, 84], // Fa menor + blue notes
    },
  };

  let schedTimer = null, nextTime = 0, bar = 0, beat = 0, track = null, leadIdx = 3, trackName = null, trackTr = 0;

  function chordTones(c) { return CH[c.type].map(iv => c.root + iv + trackTr); }

  function bassNote(c, b, prog) {
    const r = c.root + trackTr;
    if (b === 0) return r;
    if (b === 1) return r + 7;
    if (b === 2) return r + 12;
    const next = prog[(bar + 1) % prog.length].root + trackTr;
    return next - 1; // aproximación cromática
  }

  function scheduleLead(t, swing, spb) {
    const scl = track.scale;
    [t, t + swing].forEach((st, i) => {
      if (Math.random() < track.leadDens) {
        const step = (Math.random() < 0.5 ? -1 : 1) * (Math.random() < 0.28 ? 2 : 1);
        leadIdx = Math.max(0, Math.min(scl.length - 1, leadIdx + step));
        tone(st, mf(scl[leadIdx] + trackTr), spb * (i ? 0.42 : 0.5), {
          type: track.leadWave, gain: 0.15, cutoff: track.leadCut, a: 0.01,
          vib: 5.5, vibAmt: track.intensity > 1.5 ? 5 : 3, fat: track.intensity > 1.3,
        });
      }
    });
  }

  function scheduleBeat(t, spb) {
    const swing = spb * 0.64;
    const prog = track.prog;
    const chord = prog[bar % prog.length];
    const dr = track.drum;

    ride(t, 0.18 * dr); ride(t + swing, 0.12 * dr);
    if (beat === 1 || beat === 3) { hat(t, 0.22 * dr, false); snare(t, 0.16 * dr); }
    kick(t, (beat === 0 ? 0.75 : 0.3) * dr);
    if (track.intensity > 1.4 && (beat === 0 || beat === 2)) snare(t + swing, 0.07 * dr);

    tone(t, mf(bassNote(chord, beat, prog)), spb * 0.92, { type: "triangle", gain: 0.34, cutoff: 520, a: 0.008 });

    if (beat === 0 || beat === 2) {
      chordTones(chord).forEach(m =>
        tone(t + swing, mf(m + track.compOct), spb * 0.45, { type: "triangle", gain: 0.11, a: 0.005 }));
    }
    // sección de metales en los temas intensos (acentos brillantes)
    if (track.intensity > 1.4 && beat === 3) {
      const ct = chordTones(chord);
      [ct[1], ct[2]].forEach(m =>
        tone(t + swing, mf(m + 12), spb * 0.5, { type: "sawtooth", gain: 0.09, a: 0.012, cutoff: 2300, fat: true, vib: 6, vibAmt: 4 }));
    }
    // tema final (RÉQUIEM): campana fúnebre cada 2 compases + metales graves a contratiempo + doble tiempo
    if (track.bell && beat === 0 && bar % 2 === 0) {
      tone(t, mf(33 + trackTr), 2.2, { type: "sine", gain: 0.3, a: 0.004 });
      tone(t, mf(40 + trackTr) + 1.7, 1.5, { type: "triangle", gain: 0.09, a: 0.004 });
    }
    // coro/pad sostenido del RÉQUIEM: voces que llenan cada compás bajo el big-band
    if (track.pad && beat === 0) {
      chordTones(chord).forEach(m => tone(t, mf(m + 12), spb * 3.8, { type: "sine", gain: 0.05, a: 0.5, cutoff: 1300 }));
      tone(t, mf(chord.root + trackTr + 24), spb * 3.8, { type: "triangle", gain: 0.035, a: 0.7, cutoff: 1100, vib: 4, vibAmt: 3 });
    }
    if (track.intensity >= 2) {
      if (beat === 0 || beat === 2) { const ct = chordTones(chord); tone(t, mf(ct[0]), spb * 0.65, { type: "sawtooth", gain: 0.12, cutoff: 900, fat: true, a: 0.015 }); }
      if (beat === 3) hat(t + spb * 0.32, 0.16 * dr, true);
    }
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
    bar = 0; beat = 0; leadIdx = 3; nextTime = now() + 0.08;
    schedTimer = setInterval(scheduler, 25);
  }

  /* stings musicales cortos (no loop): arranque y cambio de fase */
  function sting(name) {
    ensure();
    const t = now();
    if (name === "go") {
      [60, 64, 67, 72].forEach((m, i) =>
        tone(t + i * 0.075, mf(m + 12), 0.32, { type: "sawtooth", gain: 0.17, cutoff: 2600, fat: true, a: 0.01 }));
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
    switch (name) {
      case "shoot":
        tone(t, 880, 0.09, { type: "square", gain: 0.16, glide: 1500, bus: b, cutoff: 3000 });
        noiseHit(t, { dur: 0.04, hp: 3000, gain: 0.06, bus: b }); break;
      case "shootBig":
        tone(t, 320, 0.22, { type: "sawtooth", gain: 0.26, glide: 700, bus: b, cutoff: 2200 });
        noiseHit(t, { dur: 0.12, hp: 1200, gain: 0.12, bus: b }); break;
      case "jump":
        tone(t, 420, 0.14, { type: "square", gain: 0.14, glide: 240, bus: b }); break;
      case "dash":
        noiseHit(t, { dur: 0.18, hp: 800, lp: 5000, gain: 0.18, bus: b, rate: 0.7 }); break;
      case "hit": // jugador recibe daño
        tone(t, 200, 0.3, { type: "sawtooth", gain: 0.3, glide: 380, bus: b, cutoff: 1400 });
        noiseHit(t, { dur: 0.2, hp: 500, gain: 0.18, bus: b }); break;
      case "bosshit":
        noiseHit(t, { dur: 0.05, hp: 2000, gain: 0.08, bus: b }); break;
      case "parry":
        tone(t, 1320, 0.16, { type: "triangle", gain: 0.28, bus: b });
        tone(t + 0.04, 1760, 0.18, { type: "triangle", gain: 0.22, bus: b }); break;
      case "coin":
        tone(t, 1568, 0.08, { type: "square", gain: 0.16, bus: b });
        tone(t + 0.07, 2093, 0.12, { type: "square", gain: 0.16, bus: b }); break;
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
