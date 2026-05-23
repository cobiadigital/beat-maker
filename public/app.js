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

  start() {
    this.audio.init();
    this.audio.resume();

    // Ensure all offline tracks have gain nodes
    for (const track of this.tracks) {
      if (!this.audio.trackGains[track.id]) this.audio._createTrackGain(track);
    }

    this.isPlaying = true;
    this.currentStep = 0;
    this.nextStepTime = this.audio.ctx.currentTime + 0.05;
    this._schedulerTimer = setInterval(() => this._schedule(), 25);
  }

  stop() {
    this.isPlaying = false;
    clearInterval(this._schedulerTimer);
    this._schedulerTimer = null;
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
      this.seq.audio.init(); // ensure ctx exists before dialog
      document.getElementById('instrument-dialog').showModal();
    });
  }

  _initDefaultKit() {
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

  _renderTrack(track) {
    const row = document.createElement('div');
    row.className = 'track-row';
    row.dataset.trackId = track.id;

    // Label
    const label = document.createElement('div');
    label.className = 'track-label';
    label.textContent = track.label;

    // Controls
    const controls = document.createElement('div');
    controls.className = 'track-controls';

    const vol = document.createElement('input');
    vol.type = 'range'; vol.className = 'track-vol';
    vol.min = 0; vol.max = 1; vol.step = 0.01; vol.value = track.volume;
    vol.title = 'Volume';
    vol.addEventListener('input', e => {
      track.volume = parseFloat(e.target.value);
      const g = this.seq.audio.trackGains[track.id];
      if (g) g.gain.value = track.volume;
    });

    const muteBtn = document.createElement('button');
    muteBtn.className = 'mute-btn';
    muteBtn.textContent = 'M';
    muteBtn.title = 'Mute';
    muteBtn.addEventListener('click', () => {
      track.muted = !track.muted;
      muteBtn.classList.toggle('muted', track.muted);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'mute-btn';
    removeBtn.textContent = '✕';
    removeBtn.title = 'Remove track';
    removeBtn.style.fontSize = '9px';
    removeBtn.addEventListener('click', () => {
      this.seq.removeTrack(track.id);
      row.remove();
    });

    controls.appendChild(vol);
    controls.appendChild(muteBtn);
    controls.appendChild(removeBtn);

    // Step grid
    const grid = this._buildGrid(track);

    row.appendChild(label);
    row.appendChild(controls);
    row.appendChild(grid);

    document.getElementById('track-list').appendChild(row);
  }

  _buildGrid(track) {
    const grid = document.createElement('div');
    grid.className = 'step-grid';

    for (let i = 0; i < this.seq.totalSteps; i++) {
      const cell = this._buildCell(track, i);
      grid.appendChild(cell);
    }
    return grid;
  }

  _buildCell(track, i) {
    const cell = document.createElement('div');
    cell.className = `step-cell vel-${track.steps[i]}`;
    cell.dataset.step = i;
    if (i % 4 === 0) cell.dataset.beat = 'true';

    cell.addEventListener('click', () => {
      track.steps[i] = (track.steps[i] + 1) % 4;
      cell.className = `step-cell vel-${track.steps[i]}`;
      if (this.activeStep === i) cell.classList.add('active');
    });
    return cell;
  }

  _rebuildGrids() {
    document.querySelectorAll('.track-row').forEach(row => {
      const trackId = row.dataset.trackId;
      const track = this.seq.tracks.find(t => t.id === trackId);
      if (!track) return;

      const oldGrid = row.querySelector('.step-grid');
      if (!oldGrid) return;

      const newGrid = this._buildGrid(track);
      row.replaceChild(newGrid, oldGrid);
    });
  }

  _updatePlayhead(step) {
    document.querySelectorAll('.step-cell.active').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`.step-cell[data-step="${step}"]`).forEach(el => el.classList.add('active'));
    this.activeStep = step;
  }

  _bindTransport() {
    const playBtn = document.getElementById('play-stop');

    playBtn.addEventListener('click', () => {
      if (this.seq.isPlaying) {
        this.seq.stop();
        playBtn.textContent = '▶ PLAY';
        playBtn.classList.remove('playing');
        document.querySelectorAll('.step-cell.active').forEach(el => el.classList.remove('active'));
        this.activeStep = -1;
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
      const newTotal = this.seq.beatsPerMeasure * 4;
      document.getElementById('steps').value = newTotal <= 32 && newTotal >= 8 ? newTotal : this.seq.totalSteps;
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
    const list = document.getElementById('preset-list');

    PRESETS.forEach(preset => {
      const btn = document.createElement('button');
      btn.className = 'preset-btn';
      btn.textContent = preset.label;
      btn.addEventListener('click', () => {
        const track = this.seq.addTrack(preset.instrument, preset.label);
        this._renderTrack(track);
        dialog.close();
      });
      list.appendChild(btn);
    });

    document.getElementById('dialog-cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const audio = new AudioEngine();
  const seq = new Sequencer(audio);
  audio.sequencer = seq;

  const ui = new UI(seq);
  ui.init();
  ui._initDefaultKit();
});
