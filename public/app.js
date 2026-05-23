'use strict';

// ─── Noise buffer helper ────────────────────────────────────────────────────
function createNoiseBuffer(ctx) {
  const bufSize = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

// ─── AudioEngine ────────────────────────────────────────────────────────────
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.trackGains = {};
    this.sequencer = null; // set externally for deferred gain wiring
  }

  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.masterGain.connect(this.ctx.destination);

    // Wire gain nodes for any tracks added before audio init
    if (this.sequencer) {
      for (const track of this.sequencer.tracks) {
        if (!this.trackGains[track.id]) this._createTrackGain(track);
      }
    }
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') return this.ctx.resume();
  }

  _createTrackGain(track) {
    const g = this.ctx.createGain();
    g.gain.value = track.volume;
    g.connect(this.masterGain);
    this.trackGains[track.id] = g;
  }

  // velocity: 1, 2, or 3 → normalised gain 0.33, 0.67, 1.0
  _vel(v) { return v / 3; }

  trigger(instrument, time, velocity, trackId) {
    const fn = this[`_synth_${instrument}`];
    if (!fn) return;
    const dest = this.trackGains[trackId] || this.masterGain;
    fn.call(this, time, velocity, dest);
  }

  // ── Kick ─────────────────────────────────────────────────────────────────
  _synth_kick(time, vel, dest) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env); env.connect(dest);
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(40, time + 0.5);
    env.gain.setValueAtTime(this._vel(vel), time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.5);
    osc.start(time); osc.stop(time + 0.5);
  }

  // ── Snare ─────────────────────────────────────────────────────────────────
  _synth_snare(time, vel, dest) {
    const ctx = this.ctx;
    const gain = this._vel(vel);

    const bodyOsc = ctx.createOscillator();
    const bodyEnv = ctx.createGain();
    bodyOsc.frequency.value = 185;
    bodyEnv.gain.setValueAtTime(gain * 0.6, time);
    bodyEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.15);
    bodyOsc.connect(bodyEnv); bodyEnv.connect(dest);
    bodyOsc.start(time); bodyOsc.stop(time + 0.15);

    const noise = createNoiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1000;
    const noiseEnv = ctx.createGain();
    noiseEnv.gain.setValueAtTime(gain, time);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.2);
    noise.connect(hp); hp.connect(noiseEnv); noiseEnv.connect(dest);
    noise.start(time); noise.stop(time + 0.2);
  }

  // ── Closed Hi-Hat ─────────────────────────────────────────────────────────
  _synth_hihat_c(time, vel, dest) {
    const ctx = this.ctx;
    const noise = createNoiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 7000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(this._vel(vel) * 0.6, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(hp); hp.connect(env); env.connect(dest);
    noise.start(time); noise.stop(time + 0.04);
  }

  // ── Open Hi-Hat ───────────────────────────────────────────────────────────
  _synth_hihat_o(time, vel, dest) {
    const ctx = this.ctx;
    const noise = createNoiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 6000;
    const env = ctx.createGain();
    env.gain.setValueAtTime(this._vel(vel) * 0.55, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.4);
    noise.connect(hp); hp.connect(env); env.connect(dest);
    noise.start(time); noise.stop(time + 0.4);
  }

  // ── Clap ──────────────────────────────────────────────────────────────────
  _synth_clap(time, vel, dest) {
    const ctx = this.ctx;
    const gain = this._vel(vel);
    [0, 0.01, 0.02, 0.035].forEach(d => {
      const noise = createNoiseBuffer(ctx);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.5;
      const env = ctx.createGain();
      const t = time + d;
      env.gain.setValueAtTime(gain * 0.8, t);
      env.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
      noise.connect(bp); bp.connect(env); env.connect(dest);
      noise.start(t); noise.stop(t + 0.06);
    });
  }

  // ── High Tom ──────────────────────────────────────────────────────────────
  _synth_tom_hi(time, vel, dest) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env); env.connect(dest);
    osc.frequency.setValueAtTime(300, time);
    osc.frequency.exponentialRampToValueAtTime(150, time + 0.3);
    env.gain.setValueAtTime(this._vel(vel), time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.3);
    osc.start(time); osc.stop(time + 0.3);
  }

  // ── Low Tom ───────────────────────────────────────────────────────────────
  _synth_tom_lo(time, vel, dest) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.connect(env); env.connect(dest);
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(60, time + 0.45);
    env.gain.setValueAtTime(this._vel(vel), time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.45);
    osc.start(time); osc.stop(time + 0.45);
  }

  // ── Rimshot ───────────────────────────────────────────────────────────────
  _synth_rimshot(time, vel, dest) {
    const ctx = this.ctx;
    const gain = this._vel(vel);

    const click = ctx.createOscillator();
    const clickEnv = ctx.createGain();
    click.frequency.value = 800;
    clickEnv.gain.setValueAtTime(gain, time);
    clickEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.025);
    click.connect(clickEnv); clickEnv.connect(dest);
    click.start(time); click.stop(time + 0.025);

    const noise = createNoiseBuffer(ctx);
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 2000;
    const noiseEnv = ctx.createGain();
    noiseEnv.gain.setValueAtTime(gain * 0.4, time);
    noiseEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(hp); hp.connect(noiseEnv); noiseEnv.connect(dest);
    noise.start(time); noise.stop(time + 0.04);
  }

  // ── Cowbell ───────────────────────────────────────────────────────────────
  _synth_cowbell(time, vel, dest) {
    const ctx = this.ctx;
    const gain = this._vel(vel) * 0.25;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    osc1.type = osc2.type = 'square';
    osc1.frequency.value = 562;
    osc2.frequency.value = 845;

    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 1;

    const env = ctx.createGain();
    env.gain.setValueAtTime(gain, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + 0.5);

    osc1.connect(bp); osc2.connect(bp);
    bp.connect(env); env.connect(dest);
    osc1.start(time); osc2.start(time);
    osc1.stop(time + 0.5); osc2.stop(time + 0.5);
  }
}

// ─── Sequencer ──────────────────────────────────────────────────────────────
class Sequencer {
  constructor(audioEngine) {
    this.audio = audioEngine;
    this.bpm = 120;
    this.swing = 0;
    this.beatsPerMeasure = 4;
    this.totalSteps = 16;
    this.tracks = [];

    this.isPlaying = false;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this._schedulerTimer = null;

    this.onStepChange = null; // UI callback
  }

  getStepDuration() {
    return (60 / this.bpm) / 4; // one 16th note in seconds
  }

  getSwingOffset(stepIndex) {
    if (stepIndex % 2 === 1) return this.swing * (this.getStepDuration() / 2);
    return 0;
  }

  addTrackOffline(instrument, label) {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const track = { id, instrument, label, volume: 0.8, muted: false,
                    steps: new Int8Array(this.totalSteps) };
    this.tracks.push(track);
    return track;
  }

  addTrack(instrument, label) {
    const track = this.addTrackOffline(instrument, label);
    this.audio._createTrackGain(track);
    return track;
  }

  removeTrack(trackId) {
    this.tracks = this.tracks.filter(t => t.id !== trackId);
    const g = this.audio.trackGains[trackId];
    if (g) { g.disconnect(); delete this.audio.trackGains[trackId]; }
  }

  setTotalSteps(n) {
    this.totalSteps = n;
    for (const track of this.tracks) {
      const next = new Int8Array(n);
      next.set(track.steps.slice(0, n));
      track.steps = next;
    }
  }

  _makeWorker() {
    const src = `let t; onmessage=e=>{if(e.data==='start')t=setInterval(()=>postMessage(0),25);else{clearInterval(t);t=null;}};`;
    const w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
    w.onmessage = () => this._schedule();
    return w;
  }

  start() {
    this.audio.init();
    this.audio.resume();

    for (const track of this.tracks) {
      if (!this.audio.trackGains[track.id]) this.audio._createTrackGain(track);
    }

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.audio.ctx.currentTime + 0.05;

    if (!this._worker) this._worker = this._makeWorker();
    this._worker.postMessage('start');
  }

  stop() {
    this.isPlaying = false;
    if (this._worker) this._worker.postMessage('stop');
    this.currentStep = 0;
  }

  _schedule() {
    const ctx = this.audio.ctx;
    const lookahead = ctx.currentTime + 0.1;

    while (this.nextStepTime < lookahead) {
      this._scheduleStep(this.currentStep, this.nextStepTime);
      this.nextStepTime += this.getStepDuration();
      this.currentStep = (this.currentStep + 1) % this.totalSteps;
    }
  }

  _scheduleStep(stepIndex, time) {
    const scheduledTime = time + this.getSwingOffset(stepIndex);

    for (const track of this.tracks) {
      const vel = track.steps[stepIndex];
      if (vel > 0 && !track.muted) {
        this.audio.trigger(track.instrument, scheduledTime, vel, track.id);
      }
    }

    const delayMs = (scheduledTime - this.audio.ctx.currentTime) * 1000;
    setTimeout(() => {
      if (this.isPlaying && this.onStepChange) this.onStepChange(stepIndex);
    }, Math.max(0, delayMs));
  }
}

// ─── UI ─────────────────────────────────────────────────────────────────────
const PRESETS = [
  { instrument: 'kick',    label: '808 Kick'       },
  { instrument: 'snare',   label: '808 Snare'      },
  { instrument: 'hihat_c', label: 'Closed Hat'     },
  { instrument: 'hihat_o', label: 'Open Hat'       },
  { instrument: 'clap',    label: '808 Clap'       },
  { instrument: 'tom_hi',  label: 'High Tom'       },
  { instrument: 'tom_lo',  label: 'Low Tom'        },
  { instrument: 'rimshot', label: 'Rimshot'        },
  { instrument: 'cowbell', label: 'Cowbell'        },
];

class UI {
  constructor(seq) {
    this.seq = seq;
    this.activeStep = -1;
  }

  init() {
    this._bindTransport();
    this._buildDialog();
    this.seq.onStepChange = step => this._updatePlayhead(step);
    document.getElementById('add-track').addEventListener('click', () => {
      this.seq.audio.init();
      this._openForAdd();
    });
  }

  _initDefaultKit() {
    this._initSequencerDOM();
    const defaults = [
      { instrument: 'kick',    label: '808 Kick'  },
      { instrument: 'snare',   label: '808 Snare' },
      { instrument: 'hihat_c', label: 'Closed Hat'},
      { instrument: 'hihat_o', label: 'Open Hat'  },
      { instrument: 'clap',    label: '808 Clap'  },
    ];
    for (const d of defaults) {
      const track = this.seq.addTrackOffline(d.instrument, d.label);
      this._renderTrack(track);
    }
  }

  // Build the sticky header row + one step-row per step
  _initSequencerDOM() {
    const container = document.getElementById('track-list');
    container.innerHTML = '';

    const headerRow = document.createElement('div');
    headerRow.id = 'seq-header-row';
    headerRow.className = 'seq-row header-row';
    const corner = document.createElement('div');
    corner.className = 'step-label corner';
    headerRow.appendChild(corner);
    container.appendChild(headerRow);

    for (let i = 0; i < this.seq.totalSteps; i++) {
      container.appendChild(this._makeStepRow(i));
    }
  }

  _makeStepRow(i) {
    const row = document.createElement('div');
    row.className = 'seq-row step-row';
    row.dataset.step = i;
    if (i % 4 === 0) row.dataset.beat = 'true';
    const label = document.createElement('div');
    label.className = 'step-label';
    label.textContent = i + 1;
    row.appendChild(label);
    return row;
  }

  // Add a column: header cell + one step-cell per existing step-row
  _renderTrack(track) {
    const header = document.createElement('div');
    header.className = 'track-header';
    header.dataset.trackId = track.id;

    // Volume fill bar (visual only — controlled by drag)
    const volBar = document.createElement('div');
    volBar.className = 'vol-bar';
    volBar.style.height = `${Math.round(track.volume * 100)}%`;

    const name = document.createElement('div');
    name.className = 'track-header-name';
    name.textContent = track.label;
    name.title = track.label;

    const btns = document.createElement('div');
    btns.className = 'track-header-btns';

    const muteBtn = document.createElement('button');
    muteBtn.className = 'mute-btn';
    muteBtn.textContent = 'M';
    muteBtn.title = 'Mute';
    muteBtn.addEventListener('click', () => {
      track.muted = !track.muted;
      muteBtn.classList.toggle('muted', track.muted);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove';
    removeBtn.addEventListener('click', () => {
      this.seq.removeTrack(track.id);
      header.remove();
      document.querySelectorAll(`.step-cell[data-track-id="${track.id}"]`).forEach(el => el.remove());
    });

    // Drag = volume, tap = open instrument picker for this track
    let dragStartY, dragStartVol, hasDragged;
    header.addEventListener('pointerdown', e => {
      dragStartY = undefined;
      if (e.target.closest('.mute-btn') || e.target.closest('.remove-btn')) return;
      dragStartY = e.clientY;
      dragStartVol = track.volume;
      hasDragged = false;
      header.setPointerCapture(e.pointerId);
      e.preventDefault();
    });
    header.addEventListener('pointermove', e => {
      if (dragStartY === undefined) return;
      const dy = dragStartY - e.clientY; // up = louder
      if (Math.abs(dy) > 5 || hasDragged) {
        hasDragged = true;
        track.volume = Math.max(0, Math.min(1, dragStartVol + dy / 120));
        const g = this.seq.audio.trackGains[track.id];
        if (g) g.gain.value = track.volume;
        volBar.style.height = `${Math.round(track.volume * 100)}%`;
      }
    });
    header.addEventListener('pointerup', e => {
      if (!hasDragged && dragStartY !== undefined) this._openForEdit(track, name);
      dragStartY = undefined;
    });
    header.addEventListener('pointercancel', () => { dragStartY = undefined; });

    btns.appendChild(muteBtn);
    btns.appendChild(removeBtn);
    header.appendChild(volBar);
    header.appendChild(name);
    header.appendChild(btns);
    document.getElementById('seq-header-row').appendChild(header);

    // Add one cell per step row
    document.querySelectorAll('.step-row').forEach(row => {
      const stepIdx = parseInt(row.dataset.step);
      if (isNaN(stepIdx)) return;
      row.appendChild(this._makeCell(track, stepIdx));
    });
  }

  _makeCell(track, stepIdx) {
    const cell = document.createElement('div');
    cell.className = `step-cell vel-${track.steps[stepIdx]}`;
    cell.dataset.trackId = track.id;
    cell.dataset.step = stepIdx;
    cell.addEventListener('click', () => {
      track.steps[stepIdx] = (track.steps[stepIdx] + 1) % 4;
      cell.className = `step-cell vel-${track.steps[stepIdx]}`;
    });
    return cell;
  }

  _rebuildGrids() {
    document.querySelectorAll('.step-row').forEach(r => r.remove());

    const container = document.getElementById('track-list');
    for (let i = 0; i < this.seq.totalSteps; i++) {
      container.appendChild(this._makeStepRow(i));
    }

    for (const track of this.seq.tracks) {
      document.querySelectorAll('.step-row').forEach(row => {
        const stepIdx = parseInt(row.dataset.step);
        row.appendChild(this._makeCell(track, stepIdx));
      });
    }

    this.activeStep = -1;
  }

  _updatePlayhead(step) {
    if (this.activeStep >= 0) {
      const prev = document.querySelector(`.step-row[data-step="${this.activeStep}"]`);
      if (prev) prev.classList.remove('active');
    }
    const curr = document.querySelector(`.step-row[data-step="${step}"]`);
    if (curr) curr.classList.add('active');
    this.activeStep = step;
  }

  _bindTransport() {
    const playBtn = document.getElementById('play-stop');

    playBtn.addEventListener('click', () => {
      if (this.seq.isPlaying) {
        this.seq.stop();
        playBtn.textContent = '▶ PLAY';
        playBtn.classList.remove('playing');
        if (this.activeStep >= 0) {
          const row = document.querySelector(`.step-row[data-step="${this.activeStep}"]`);
          if (row) row.classList.remove('active');
          this.activeStep = -1;
        }
      } else {
        this.seq.start();
        playBtn.textContent = '■ STOP';
        playBtn.classList.add('playing');
      }
    });

    const bpmRange = document.getElementById('bpm');
    const bpmNum = document.getElementById('bpm-num');
    const syncBpm = val => {
      const v = Math.min(200, Math.max(60, parseInt(val) || 120));
      this.seq.bpm = v;
      bpmRange.value = v;
      bpmNum.value = v;
    };
    bpmRange.addEventListener('input', e => syncBpm(e.target.value));
    bpmNum.addEventListener('change', e => syncBpm(e.target.value));

    const swingRange = document.getElementById('swing');
    const swingVal = document.getElementById('swing-val');
    swingRange.addEventListener('input', e => {
      this.seq.swing = parseInt(e.target.value) / 100;
      swingVal.textContent = `${e.target.value}%`;
    });

    document.getElementById('beats-per-measure').addEventListener('change', e => {
      this.seq.beatsPerMeasure = parseInt(e.target.value);
      this.seq.setTotalSteps(this.seq.beatsPerMeasure * 4);
      this._rebuildGrids();
    });

    document.getElementById('steps').addEventListener('change', e => {
      this.seq.setTotalSteps(parseInt(e.target.value));
      this._rebuildGrids();
    });
  }

  _buildDialog() {
    const dialog = document.getElementById('instrument-dialog');
    const title = dialog.querySelector('h2');
    const list = document.getElementById('preset-list');
    let editTarget = null; // track object when swapping, null when adding

    this._openForAdd = () => {
      editTarget = null;
      title.textContent = 'Add Instrument';
      dialog.showModal();
    };
    this._openForEdit = (track, nameEl) => {
      editTarget = { track, nameEl };
      title.textContent = 'Change Instrument';
      dialog.showModal();
    };

    const closeDialog = () => { editTarget = null; dialog.close(); };

    PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        if (editTarget) {
          editTarget.track.instrument = preset.instrument;
          editTarget.track.label = preset.label;
          editTarget.nameEl.textContent = preset.label;
          editTarget.nameEl.title = preset.label;
        } else {
          const track = this.seq.addTrack(preset.instrument, preset.label);
          this._renderTrack(track);
        }
        closeDialog();
      });
      list.appendChild(btn);
    });

    document.getElementById('dialog-cancel').addEventListener('click', closeDialog);
    dialog.addEventListener('click', e => { if (e.target === dialog) closeDialog(); });
  }
}

// ─── MIDI ────────────────────────────────────────────────────────────────────

const DRUM_NOTE = {
  kick: 36, snare: 38, hihat_c: 42, hihat_o: 46,
  clap: 39, tom_hi: 50, tom_lo: 45, rimshot: 37, cowbell: 56,
};
const NOTE_TO_INSTRUMENT = Object.fromEntries(
  Object.entries(DRUM_NOTE).map(([k, v]) => [v, k])
);
// Extra GM aliases → our instruments
Object.assign(NOTE_TO_INSTRUMENT, {
  35: 'kick', 40: 'snare', 44: 'hihat_c', 48: 'tom_hi',
  41: 'tom_lo', 43: 'tom_lo', 47: 'tom_lo',
});

function vlq(value) {
  const bytes = [];
  bytes.unshift(value & 0x7F);
  value >>= 7;
  while (value > 0) { bytes.unshift((value & 0x7F) | 0x80); value >>= 7; }
  return bytes;
}

function exportMidi(seq) {
  const PPQ = 96;
  const ticksPerStep = PPQ / 4; // 16th note = 24 ticks
  const uspb = Math.round(60_000_000 / seq.bpm);

  const events = [];
  for (const track of seq.tracks) {
    const note = DRUM_NOTE[track.instrument];
    if (!note) continue;
    for (let s = 0; s < seq.totalSteps; s++) {
      const vel = track.steps[s];
      if (!vel) continue;
      const midiVel = vel === 1 ? 55 : vel === 2 ? 82 : 110;
      const tick = s * ticksPerStep;
      events.push({ tick, status: 0x99, note, vel: midiVel });
      events.push({ tick: tick + ticksPerStep - 1, status: 0x89, note, vel: 0 });
    }
  }
  events.sort((a, b) => a.tick - b.tick || (a.status & 0xF0) - (b.status & 0xF0));

  const trk = [];
  // Tempo
  trk.push(0x00, 0xFF, 0x51, 0x03,
    (uspb >> 16) & 0xFF, (uspb >> 8) & 0xFF, uspb & 0xFF);
  let cur = 0;
  for (const e of events) {
    trk.push(...vlq(e.tick - cur));
    cur = e.tick;
    trk.push(e.status, e.note, e.vel);
  }
  // Loop back marker (one full measure)
  const loopTick = seq.totalSteps * ticksPerStep;
  trk.push(...vlq(loopTick - cur), 0xFF, 0x2F, 0x00);

  const bytes = [
    0x4D,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1,
    (PPQ >> 8) & 0xFF, PPQ & 0xFF,
    0x4D,0x54,0x72,0x6B,
    (trk.length >> 24)&0xFF, (trk.length >> 16)&0xFF,
    (trk.length >> 8)&0xFF, trk.length & 0xFF,
    ...trk,
  ];
  return new Uint8Array(bytes);
}

function importMidi(buffer) {
  const dv = new DataView(buffer);
  let p = 0;
  const u32 = () => { const v = dv.getUint32(p); p += 4; return v; };
  const u16 = () => { const v = dv.getUint16(p); p += 2; return v; };
  const u8  = () => dv.getUint8(p++);
  const readVlq = () => {
    let v = 0, b;
    do { b = u8(); v = (v << 7) | (b & 0x7F); } while (b & 0x80);
    return v;
  };
  const skip = (n, end) => { p = Math.min(p + n, end); };

  if (u32() !== 0x4D546864) throw new Error('Not a MIDI file');
  const hLen = u32(); // usually 6, but skip exactly what the file says
  u16(); // format
  const nTracks = u16();
  const ppq = u16();
  p = 8 + hLen; // jump past any non-standard header bytes
  if (ppq & 0x8000) throw new Error('SMPTE timecode not supported');

  const hits = {};
  let maxTick = 0;

  for (let t = 0; t < nTracks; t++) {
    if (p + 8 > dv.byteLength) break;
    if (u32() !== 0x4D54726B) throw new Error('Bad track chunk');
    const trkLen = u32();
    const trkEnd = Math.min(p + trkLen, dv.byteLength);
    let tick = 0, rs = 0;

    while (p < trkEnd) {
      tick += readVlq();
      if (p >= trkEnd) break; // delta consumed remaining bytes (malformed)

      let sb = dv.getUint8(p);
      if (sb & 0x80) { rs = sb; p++; } else { sb = rs; }
      if (p >= trkEnd && sb !== 0xFF) break;

      if (sb === 0xFF) {
        const mtype = u8();
        const mlen = readVlq();
        if (mtype === 0x2F) { p = trkEnd; break; } // end of track
        skip(mlen, trkEnd);
      } else if (sb === 0xF0 || sb === 0xF7) {
        skip(readVlq(), trkEnd);
      } else {
        const type = sb & 0xF0, ch = sb & 0x0F;
        switch (type) {
          case 0x90: {
            if (p + 1 >= trkEnd) { p = trkEnd; break; }
            const note = u8(), vel = u8();
            if (ch === 9 && vel > 0) {
              const inst = NOTE_TO_INSTRUMENT[note];
              if (inst) {
                const step = Math.round(tick / (ppq / 4));
                const lv = vel > 100 ? 3 : vel > 64 ? 2 : 1;
                if (!hits[inst]) hits[inst] = {};
                if (!hits[inst][step]) hits[inst][step] = lv;
                maxTick = Math.max(maxTick, tick);
              }
            }
            break;
          }
          case 0x80: case 0xA0: case 0xB0: case 0xE0: skip(2, trkEnd); break;
          case 0xC0: case 0xD0: skip(1, trkEnd); break;
          default: p = trkEnd;
        }
      }
    }
    p = trkEnd;
  }

  const stepsDetected = Math.ceil((maxTick / ppq) * 4);
  const totalSteps = stepsDetected <= 8 ? 8 : stepsDetected <= 16 ? 16 : 32;
  return { hits, totalSteps };
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const audio = new AudioEngine();
  const seq = new Sequencer(audio);
  audio.sequencer = seq;

  // Resume AudioContext when returning to the tab (mobile screen-lock / app-switch)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') audio.resume();
  });

  const ui = new UI(seq);
  ui.init();
  ui._initDefaultKit();

  // MIDI export
  document.getElementById('midi-export').addEventListener('click', () => {
    const bytes = exportMidi(seq);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'beat.mid'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  // MIDI import
  document.getElementById('midi-import').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const { hits, totalSteps } = importMidi(evt.target.result);

        // Clear existing tracks and grid
        for (const track of [...seq.tracks]) seq.removeTrack(track.id);
        seq.totalSteps = totalSteps;
        ui._initSequencerDOM();

        // Rebuild the steps selector to match
        const stepsEl = document.getElementById('steps');
        if ([8, 16, 32].includes(totalSteps)) stepsEl.value = totalSteps;

        // Add a track for each instrument found
        const LABEL = {
          kick: '808 Kick', snare: '808 Snare', hihat_c: 'Closed Hat',
          hihat_o: 'Open Hat', clap: '808 Clap', tom_hi: 'High Tom',
          tom_lo: 'Low Tom', rimshot: 'Rimshot', cowbell: 'Cowbell',
        };
        for (const [inst, stepMap] of Object.entries(hits)) {
          audio.init(); // ensure ctx exists
          const track = seq.addTrack(inst, LABEL[inst] || inst);
          for (const [step, lv] of Object.entries(stepMap)) {
            if (step < totalSteps) track.steps[step] = lv;
          }
          ui._renderTrack(track);
        }
      } catch (err) {
        alert(`Could not read MIDI file: ${err.message}`);
      }
      e.target.value = ''; // allow re-importing the same file
    };
    reader.readAsArrayBuffer(file);
  });
});
