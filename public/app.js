'use strict';

// ─── Helpers ────────────────────────────────────────────────────────────────
function createNoiseBuffer(ctx) {
  const bufSize = Math.floor(ctx.sampleRate * 0.5);
  const buf = ctx.createBuffer(1, bufSize, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  return src;
}

const _NOTE_NAMES = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
function noteToMidi(name) {
  const m = name.match(/^([A-G]#?)(-?\d+)$/);
  if (!m) return 60;
  return (parseInt(m[2]) + 1) * 12 + _NOTE_NAMES.indexOf(m[1]);
}
function midiToNote(n) {
  return `${_NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}
function hexToRgba(hex, a) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ─── AudioEngine ────────────────────────────────────────────────────────────
class AudioEngine {
  constructor() {
    this.ctx = null;
    this.masterGain = null;
    this.trackGains = {};
    this.sequencer = null;
  }

  init() {
    if (this.ctx) return;
    if (typeof Tone !== 'undefined') {
      Tone.start();
      this.ctx = Tone.getContext().rawContext;
    } else {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 0.85;
    this.masterGain.connect(this.ctx.destination);
    if (this.sequencer) {
      for (const track of this.sequencer.tracks) {
        if (!this.trackGains[track.id]) this._createTrackGain(track);
      }
      if (this.sequencer.tone) {
        for (const track of this.sequencer.tracks) {
          if (track.type === 'melody' && !this.sequencer.tone.synths[track.id]) {
            this.sequencer.tone.createSynth(track, this.trackGains[track.id]);
          }
        }
      }
    }
  }

  resume() {
    if (typeof Tone !== 'undefined') Tone.start();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _createTrackGain(track) {
    const g = this.ctx.createGain();
    g.gain.value = track.volume;
    g.connect(this.masterGain);
    this.trackGains[track.id] = g;
  }

  _vel(v) { return v / 3; }

  trigger(instrument, time, velocity, trackId) {
    const fn = this[`_synth_${instrument}`];
    if (!fn) return;
    fn.call(this, time, velocity, this.trackGains[trackId] || this.masterGain);
  }

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

// ─── ToneEngine ─────────────────────────────────────────────────────────────
class ToneEngine {
  constructor() { this.synths = {}; }

  createSynth(track, gainNode) {
    if (typeof Tone === 'undefined' || this.synths[track.id]) return;
    const synth = this._build(track.instrument);
    synth.connect(gainNode);
    this.synths[track.id] = synth;
  }

  _build(instrument) {
    let s;
    switch (instrument) {
      case 'synth_fm':
        s = new Tone.PolySynth(Tone.FMSynth);
        s.set({ harmonicity: 3, modulationIndex: 10,
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.6 },
          modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.5 } });
        break;
      case 'synth_am':
        s = new Tone.PolySynth(Tone.AMSynth);
        s.set({ harmonicity: 2,
          envelope: { attack: 0.01, decay: 0.12, sustain: 0.5, release: 0.6 } });
        break;
      case 'synth_mono':
        s = new Tone.MonoSynth();
        s.set({ oscillator: { type: 'sawtooth' }, filter: { Q: 6, rolloff: -24 },
          envelope: { attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.4 },
          filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.5,
            baseFrequency: 200, octaves: 3 } });
        break;
      default:
        s = new Tone.PolySynth(Tone.Synth);
        s.set({ oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.6 } });
    }
    return s;
  }

  trigger(trackId, note, time, velocity, noteDuration) {
    const synth = this.synths[trackId];
    if (!synth) return;
    try {
      synth.triggerAttackRelease(note, Math.max(0.02, noteDuration), time,
        Math.max(0.01, velocity / 3));
    } catch (e) {}
  }

  disposeSynth(trackId) {
    const s = this.synths[trackId];
    if (s) { try { s.dispose(); } catch (e) {} delete this.synths[trackId]; }
  }
}

// ─── Sequencer ──────────────────────────────────────────────────────────────
class Sequencer {
  constructor(audioEngine, toneEngine) {
    this.audio = audioEngine;
    this.tone = toneEngine;
    this.bpm = 120;
    this.swing = 0;
    this.beatsPerMeasure = 4;
    this.totalSteps = 16;
    this.tracks = [];
    this.isPlaying = false;
    this.currentStep = 0;
    this.nextStepTime = 0;
    this._worker = null;
    this.onStepChange = null;
  }

  getStepDuration() { return (60 / this.bpm) / 4; }

  getSwingOffset(stepIndex) {
    if (stepIndex % 2 === 1) return this.swing * (this.getStepDuration() / 2);
    return 0;
  }

  addTrackOffline(instrument, label, type = 'drum') {
    const id = `t_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const track = { id, type, instrument, label, volume: 0.5, muted: false,
                    colorIdx: 0, noteLength: 1.0, octaveShift: 0 };
    if (type === 'drum') {
      track.steps = new Int8Array(this.totalSteps);
    } else {
      track.notes = []; // [{step, note, vel, dur}]
    }
    this.tracks.push(track);
    return track;
  }

  addTrack(instrument, label, type = 'drum') {
    const track = this.addTrackOffline(instrument, label, type);
    this.audio._createTrackGain(track);
    if (type === 'melody') this.tone.createSynth(track, this.audio.trackGains[track.id]);
    return track;
  }

  removeTrack(trackId) {
    this.tracks = this.tracks.filter(t => t.id !== trackId);
    const g = this.audio.trackGains[trackId];
    if (g) { g.disconnect(); delete this.audio.trackGains[trackId]; }
    this.tone.disposeSynth(trackId);
  }

  setTotalSteps(n) {
    this.totalSteps = n;
    for (const track of this.tracks) {
      if (track.type === 'drum') {
        const next = new Int8Array(n);
        next.set(track.steps.slice(0, n));
        track.steps = next;
      } else {
        track.notes = (track.notes || []).filter(note => note.step < n);
      }
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
      if (track.type === 'melody' && !this.tone.synths[track.id]) {
        this.tone.createSynth(track, this.audio.trackGains[track.id]);
      }
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
    const stepDuration = this.getStepDuration();
    for (const track of this.tracks) {
      if (track.muted) continue;
      if (track.type === 'melody') {
        for (const n of (track.notes || [])) {
          if (n.step === stepIndex) {
            let noteName = n.note;
            if (track.octaveShift) {
              noteName = midiToNote(Math.max(0, Math.min(127,
                noteToMidi(noteName) + track.octaveShift * 12)));
            }
            const noteDur = stepDuration * (n.dur || 1) * 0.92;
            this.tone.trigger(track.id, noteName, scheduledTime, n.vel, noteDur);
          }
        }
      } else {
        const vel = track.steps[stepIndex];
        if (vel > 0) this.audio.trigger(track.instrument, scheduledTime, vel, track.id);
      }
    }
    const delayMs = (scheduledTime - this.audio.ctx.currentTime) * 1000;
    setTimeout(() => {
      if (this.isPlaying && this.onStepChange) this.onStepChange(stepIndex);
    }, Math.max(0, delayMs));
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────
const PIANO_ROLL_NOTES = [
  'C5','B4','A#4','A4','G#4','G4','F#4','F4','E4','D#4','D4','C#4',
  'C4','B3','A#3','A3','G#3','G3','F#3','F3','E3','D#3','D3','C#3','C3',
];

const TRACK_COLORS = ['#4a8fe8','#e84a8f','#4ae88f','#e8c44a','#ae4ae8','#4ae8d8'];

const NOTE_LENGTHS = [
  { mult: 0.25, label: 'S' },
  { mult: 0.5,  label: '½' },
  { mult: 1.0,  label: '1' },
  { mult: 2.0,  label: '2' },
  { mult: 4.0,  label: '4' },
];

const OCTAVE_SHIFTS = [-2, -1, 0, 1, 2];
const _fmtOct = o => o > 0 ? `+${o}` : `${o}`;

const DRUM_PRESETS = [
  { instrument: 'kick',    label: '808 Kick'   },
  { instrument: 'snare',   label: '808 Snare'  },
  { instrument: 'hihat_c', label: 'Closed Hat' },
  { instrument: 'hihat_o', label: 'Open Hat'   },
  { instrument: 'clap',    label: '808 Clap'   },
  { instrument: 'tom_hi',  label: 'High Tom'   },
  { instrument: 'tom_lo',  label: 'Low Tom'    },
  { instrument: 'rimshot', label: 'Rimshot'    },
  { instrument: 'cowbell', label: 'Cowbell'    },
];

const MELODY_PRESETS = [
  { instrument: 'synth_poly', label: 'Poly Synth', type: 'melody' },
  { instrument: 'synth_fm',   label: 'FM Synth',   type: 'melody' },
  { instrument: 'synth_am',   label: 'AM Synth',   type: 'melody' },
  { instrument: 'synth_mono', label: 'Mono Bass',  type: 'melody' },
];

// ─── UI ─────────────────────────────────────────────────────────────────────
class UI {
  constructor(seq) {
    this.seq = seq;
    this.activeStep = -1;
    this._currentView = 'beat';
    this._selectedMelodyTrackId = null;
    this._melColorIdx = 0;
    this._prBuilt = false;
  }

  init() {
    this._bindTransport();
    this._buildDialog();
    this._bindViewTabs();
    this.seq.onStepChange = step => this._updatePlayhead(step);
    document.getElementById('add-track').addEventListener('click', () => {
      this.seq.audio.init();
      if (this._currentView === 'melody') this._openSynthDialog(null);
      else this._openDrumDialog(null);
    });
  }

  _bindViewTabs() {
    document.querySelectorAll('.view-tab').forEach(btn => {
      btn.addEventListener('click', () => this._switchView(btn.dataset.view));
    });
  }

  _switchView(view) {
    this._currentView = view;
    document.getElementById('beat-view').classList.toggle('view-hidden', view !== 'beat');
    document.getElementById('melody-view').classList.toggle('view-hidden', view !== 'melody');
    document.querySelectorAll('.view-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.view === view));
    const addBtn = document.getElementById('add-track');
    addBtn.textContent = view === 'melody' ? '+ ADD SYNTH' : '+ ADD DRUM';

    if (view === 'melody' && !this._prBuilt) {
      this._buildPianoRoll();
      this._buildTracksBar();
      this._prBuilt = true;
    }
  }

  // ── Default kit ─────────────────────────────────────────────────────────────
  _initDefaultKit() {
    this._initBeatDOM();
    const defaults = [
      { instrument: 'kick',    label: '808 Kick'   },
      { instrument: 'snare',   label: '808 Snare'  },
      { instrument: 'hihat_c', label: 'Closed Hat' },
      { instrument: 'hihat_o', label: 'Open Hat'   },
      { instrument: 'clap',    label: '808 Clap'   },
    ];
    for (const d of defaults) {
      const track = this.seq.addTrackOffline(d.instrument, d.label, 'drum');
      this._renderDrumTrack(track);
    }
  }

  // ── Beat view ────────────────────────────────────────────────────────────────
  _initBeatDOM() {
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

  _renderDrumTrack(track) {
    const header = document.createElement('div');
    header.className = 'track-header';
    header.dataset.trackId = track.id;

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
    muteBtn.addEventListener('click', () => {
      track.muted = !track.muted;
      muteBtn.classList.toggle('muted', track.muted);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => {
      this.seq.removeTrack(track.id);
      header.remove();
      document.querySelectorAll(`.step-cell[data-track-id="${track.id}"]`).forEach(el => el.remove());
    });

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
      const dy = dragStartY - e.clientY;
      if (Math.abs(dy) > 5 || hasDragged) {
        hasDragged = true;
        track.volume = Math.max(0, Math.min(1, dragStartVol + dy / 120));
        const g = this.seq.audio.trackGains[track.id];
        if (g) g.gain.value = track.volume;
        volBar.style.height = `${Math.round(track.volume * 100)}%`;
      }
    });
    header.addEventListener('pointerup', () => {
      if (!hasDragged && dragStartY !== undefined) this._openDrumDialog({ track, nameEl: name });
      dragStartY = undefined;
    });
    header.addEventListener('pointercancel', () => { dragStartY = undefined; });

    btns.appendChild(muteBtn);
    btns.appendChild(removeBtn);
    header.appendChild(volBar);
    header.appendChild(name);
    header.appendChild(btns);
    document.getElementById('seq-header-row').appendChild(header);

    document.querySelectorAll('.step-row').forEach(row => {
      const stepIdx = parseInt(row.dataset.step);
      if (isNaN(stepIdx)) return;
      row.appendChild(this._makeDrumCell(track, stepIdx));
    });
  }

  _makeDrumCell(track, stepIdx) {
    const cell = document.createElement('div');
    cell.className = `step-cell vel-${track.steps[stepIdx]}`;
    cell.dataset.trackId = track.id;
    cell.dataset.step = stepIdx;

    let holdTimer = null, startX, startY;
    cell.addEventListener('contextmenu', e => e.preventDefault());
    cell.addEventListener('pointerdown', e => {
      startX = e.clientX; startY = e.clientY;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        this._showVelPicker(cell, track, stepIdx);
      }, 380);
    });
    cell.addEventListener('pointermove', e => {
      if (holdTimer && (Math.abs(e.clientX - startX) > 8 || Math.abs(e.clientY - startY) > 8)) {
        clearTimeout(holdTimer); holdTimer = null;
      }
    });
    cell.addEventListener('pointerup', () => {
      if (holdTimer) {
        clearTimeout(holdTimer); holdTimer = null;
        track.steps[stepIdx] = track.steps[stepIdx] > 0 ? 0 : 3;
        cell.className = `step-cell vel-${track.steps[stepIdx]}`;
      }
    });
    cell.addEventListener('pointercancel', () => { clearTimeout(holdTimer); holdTimer = null; });
    return cell;
  }

  _showVelPicker(cell, track, stepIdx, onSet) {
    this._closeVelPicker();
    const picker = document.createElement('div');
    picker.id = 'vel-picker';
    picker.className = 'vel-picker';

    [{ v: 1, label: 'LOW' }, { v: 2, label: 'MID' }, { v: 3, label: 'HIGH' }].forEach(({ v, label }) => {
      const btn = document.createElement('button');
      btn.className = `vel-opt vel-opt-${v}`;
      if (track.steps[stepIdx] === v) btn.classList.add('active');
      btn.textContent = label;
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        track.steps[stepIdx] = v;
        if (onSet) onSet(v); else cell.className = `step-cell vel-${v}`;
        this._closeVelPicker();
      });
      picker.appendChild(btn);
    });

    const rect = cell.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - 75;
    let top  = rect.top - 48;
    left = Math.max(4, Math.min(left, window.innerWidth - 154));
    if (top < 4) top = rect.bottom + 6;
    picker.style.left = `${left}px`;
    picker.style.top  = `${top}px`;
    document.body.appendChild(picker);

    const onOutside = e => { if (!picker.contains(e.target)) this._closeVelPicker(); };
    setTimeout(() => document.addEventListener('pointerdown', onOutside, { once: true }), 50);
    picker._outside = onOutside;
  }

  _closeVelPicker() {
    const p = document.getElementById('vel-picker');
    if (p) { if (p._outside) document.removeEventListener('pointerdown', p._outside); p.remove(); }
  }

  _rebuildBeatGrids() {
    document.querySelectorAll('.step-row').forEach(r => r.remove());
    const container = document.getElementById('track-list');
    for (let i = 0; i < this.seq.totalSteps; i++) {
      container.appendChild(this._makeStepRow(i));
    }
    for (const track of this.seq.tracks) {
      if (track.type !== 'drum') continue;
      document.querySelectorAll('.step-row').forEach(row => {
        const stepIdx = parseInt(row.dataset.step);
        if (!isNaN(stepIdx)) row.appendChild(this._makeDrumCell(track, stepIdx));
      });
    }
    this.activeStep = -1;
  }

  // ── Melody view / Piano roll ──────────────────────────────────────────────
  _buildTracksBar() {
    const bar = document.getElementById('melody-tracks-bar');
    bar.innerHTML = '';

    const melTracks = this.seq.tracks.filter(t => t.type === 'melody');
    if (melTracks.length === 0) {
      const empty = document.createElement('span');
      empty.className = 'melody-empty';
      empty.textContent = 'Tap + ADD SYNTH to add a melody track';
      bar.appendChild(empty);
      return;
    }

    melTracks.forEach(track => {
      const color = TRACK_COLORS[track.colorIdx % TRACK_COLORS.length];
      const chip = document.createElement('div');
      chip.className = 'mel-chip' + (track.id === this._selectedMelodyTrackId ? ' selected' : '');
      chip.style.borderColor = track.id === this._selectedMelodyTrackId ? color : '';

      const dot = document.createElement('span');
      dot.className = 'mel-chip-dot';
      dot.style.background = color;

      const nameEl = document.createElement('span');
      nameEl.className = 'mel-chip-name';
      nameEl.textContent = track.label;

      const muteBtn = document.createElement('button');
      muteBtn.className = 'mel-chip-mute' + (track.muted ? ' muted' : '');
      muteBtn.textContent = 'M';
      muteBtn.addEventListener('click', e => {
        e.stopPropagation();
        track.muted = !track.muted;
        muteBtn.classList.toggle('muted', track.muted);
      });

      const removeBtn = document.createElement('button');
      removeBtn.className = 'mel-chip-remove';
      removeBtn.textContent = '✕';
      removeBtn.addEventListener('click', e => {
        e.stopPropagation();
        this.seq.removeTrack(track.id);
        if (this._selectedMelodyTrackId === track.id) {
          const rem = this.seq.tracks.filter(t => t.type === 'melody');
          this._selectedMelodyTrackId = rem.length ? rem[0].id : null;
        }
        this._buildTracksBar();
        this._refreshPRNotes();
      });

      const lenBtn = document.createElement('button');
      lenBtn.className = 'mel-chip-ctrl';
      lenBtn.title = 'Note length (tap to cycle)';
      lenBtn.textContent = NOTE_LENGTHS.find(nl => nl.mult === (track.noteLength || 1))?.label ?? '1';
      lenBtn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = NOTE_LENGTHS.findIndex(nl => nl.mult === track.noteLength);
        track.noteLength = NOTE_LENGTHS[(idx + 1) % NOTE_LENGTHS.length].mult;
        lenBtn.textContent = NOTE_LENGTHS.find(nl => nl.mult === track.noteLength).label;
      });

      const octBtn = document.createElement('button');
      octBtn.className = 'mel-chip-ctrl mel-chip-ctrl-oct';
      octBtn.title = 'Octave shift (tap to cycle)';
      octBtn.textContent = _fmtOct(track.octaveShift || 0);
      octBtn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = OCTAVE_SHIFTS.indexOf(track.octaveShift);
        track.octaveShift = OCTAVE_SHIFTS[(idx + 1) % OCTAVE_SHIFTS.length];
        octBtn.textContent = _fmtOct(track.octaveShift);
      });

      let holdTimer = null;
      chip.addEventListener('pointerdown', e => {
        if (e.target.closest('.mel-chip-mute') || e.target.closest('.mel-chip-remove') ||
            e.target.closest('.mel-chip-ctrl')) return;
        holdTimer = setTimeout(() => {
          holdTimer = null;
          this._openSynthDialog({ track, nameEl });
        }, 400);
      });
      chip.addEventListener('pointerup', () => {
        if (holdTimer) {
          clearTimeout(holdTimer); holdTimer = null;
          this._selectedMelodyTrackId = track.id;
          this._buildTracksBar();
        }
      });
      chip.addEventListener('pointercancel', () => { clearTimeout(holdTimer); holdTimer = null; });

      chip.appendChild(dot);
      chip.appendChild(nameEl);
      chip.appendChild(lenBtn);
      chip.appendChild(octBtn);
      chip.appendChild(muteBtn);
      chip.appendChild(removeBtn);
      bar.appendChild(chip);
    });
  }

  _addMelodyTrack(preset) {
    this.seq.audio.init();
    const colorIdx = this._melColorIdx % TRACK_COLORS.length;
    this._melColorIdx++;
    const track = this.seq.addTrack(preset.instrument, preset.label, 'melody');
    track.colorIdx = colorIdx;
    this._selectedMelodyTrackId = track.id;
    this._buildTracksBar();
    this._refreshPRNotes();
  }

  _getSelectedMelodyTrack() {
    if (!this._selectedMelodyTrackId) return null;
    return this.seq.tracks.find(t => t.id === this._selectedMelodyTrackId) || null;
  }

  // ── Piano roll ────────────────────────────────────────────────────────────
  _buildPianoRoll() {
    const container = document.getElementById('piano-roll');
    container.innerHTML = '';
    const N = this.seq.totalSteps;

    // Sticky header: step numbers (flex layout)
    const headerRow = document.createElement('div');
    headerRow.id = 'pr-header-row';
    headerRow.className = 'pr-row pr-header-row';
    const corner = document.createElement('div');
    corner.className = 'pr-label';
    headerRow.appendChild(corner);
    for (let s = 0; s < N; s++) {
      const cell = document.createElement('div');
      cell.className = 'pr-header-cell' + (s % 4 === 0 ? ' beat-start' : '');
      cell.dataset.step = s;
      cell.textContent = s % 4 === 0 ? Math.floor(s / 4) + 1 : '';
      headerRow.appendChild(cell);
    }
    container.appendChild(headerRow);

    for (const note of PIANO_ROLL_NOTES) {
      container.appendChild(this._makePRRow(note, N));
    }

    this._refreshPRNotes();
  }

  _makePRRow(note, N) {
    if (N === undefined) N = this.seq.totalSteps;
    const isSharp = note.includes('#');
    const isC = note.startsWith('C') && !isSharp;
    const row = document.createElement('div');
    row.className = 'pr-row' + (isSharp ? ' sharp' : '') + (isC ? ' c-note' : '');
    row.dataset.note = note;

    const label = document.createElement('div');
    label.className = 'pr-label';
    if (isC) label.textContent = note;
    else if (!isSharp) label.textContent = note[0];
    row.appendChild(label);

    // Cells area: position:relative container for bg-cells and note blocks
    const area = document.createElement('div');
    area.className = 'pr-cells-area';
    area.dataset.note = note;
    area.style.minWidth = `${N * 18}px`;

    for (let s = 0; s < N; s++) {
      const bgCell = document.createElement('div');
      bgCell.className = 'pr-bg-cell' + (s % 4 === 0 ? ' beat-start' : '');
      bgCell.style.left = `${(s / N) * 100}%`;
      bgCell.style.width = `${(1 / N) * 100}%`;
      bgCell.dataset.step = s;
      bgCell.dataset.note = note;
      bgCell.addEventListener('pointerdown', e => {
        e.preventDefault();
        this._handleBgCellTap(note, s);
      });
      area.appendChild(bgCell);
    }

    row.appendChild(area);
    return row;
  }

  _handleBgCellTap(rowNote, stepIdx) {
    const track = this._getSelectedMelodyTrack();
    if (!track) return;
    const N = this.seq.totalSteps;

    const existing = track.notes.find(n => n.step === stepIdx);
    if (existing) {
      if (existing.note === rowNote) {
        // Same pitch: remove
        track.notes = track.notes.filter(n => n !== existing);
        document.querySelectorAll(
          `.pr-note-block[data-track-id="${track.id}"][data-step="${stepIdx}"]`
        ).forEach(el => el.remove());
      } else {
        // Different pitch: relocate to new row
        document.querySelectorAll(
          `.pr-note-block[data-track-id="${track.id}"][data-step="${stepIdx}"]`
        ).forEach(el => el.remove());
        existing.note = rowNote;
        const color = TRACK_COLORS[track.colorIdx % TRACK_COLORS.length];
        this._renderNoteBlock(track, existing, color, N);
      }
    } else {
      const noteObj = { step: stepIdx, note: rowNote, vel: 3, dur: track.noteLength || 1 };
      track.notes.push(noteObj);
      const color = TRACK_COLORS[track.colorIdx % TRACK_COLORS.length];
      this._renderNoteBlock(track, noteObj, color, N);
    }
  }

  _refreshPRNotes() {
    document.querySelectorAll('.pr-note-block').forEach(el => el.remove());
    const N = this.seq.totalSteps;
    for (const track of this.seq.tracks) {
      if (track.type !== 'melody') continue;
      const color = TRACK_COLORS[track.colorIdx % TRACK_COLORS.length];
      for (const noteObj of (track.notes || [])) {
        this._renderNoteBlock(track, noteObj, color, N);
      }
    }
  }

  _renderNoteBlock(track, noteObj, color, N) {
    const area = document.querySelector(`.pr-cells-area[data-note="${noteObj.note}"]`);
    if (!area) return null;

    const alpha = noteObj.vel === 1 ? 0.45 : noteObj.vel === 2 ? 0.72 : 1.0;
    const block = document.createElement('div');
    block.className = 'pr-note-block';
    block.style.left = `${(noteObj.step / N) * 100}%`;
    block.style.width = `${((noteObj.dur || 1) / N) * 100}%`;
    block.style.background = hexToRgba(color, alpha);
    block.dataset.trackId = track.id;
    block.dataset.step = noteObj.step;

    const lHandle = document.createElement('div');
    lHandle.className = 'pr-note-handle pr-note-handle-l';
    const rHandle = document.createElement('div');
    rHandle.className = 'pr-note-handle pr-note-handle-r';
    block.appendChild(lHandle);
    block.appendChild(rHandle);

    // Tap body = edit popup
    let tapTimer = null, tapStartX, tapStartY;
    block.addEventListener('pointerdown', e => {
      if (e.target.closest('.pr-note-handle')) return;
      e.stopPropagation();
      tapStartX = e.clientX; tapStartY = e.clientY;
      tapTimer = setTimeout(() => { tapTimer = null; }, 350);
    });
    block.addEventListener('pointermove', e => {
      if (tapTimer && (Math.abs(e.clientX - tapStartX) > 8 || Math.abs(e.clientY - tapStartY) > 8)) {
        clearTimeout(tapTimer); tapTimer = null;
      }
    });
    block.addEventListener('pointerup', e => {
      if (e.target.closest('.pr-note-handle')) return;
      if (tapTimer) {
        clearTimeout(tapTimer); tapTimer = null;
        this._showNoteEditPopup(block, track, noteObj, color, N);
      }
    });
    block.addEventListener('pointercancel', () => { clearTimeout(tapTimer); tapTimer = null; });

    // Left handle: move note
    this._bindHandleDrag(lHandle, 'move', block, track, noteObj, area, N);
    // Right handle: resize duration
    this._bindHandleDrag(rHandle, 'resize', block, track, noteObj, area, N);

    area.appendChild(block);
    return block;
  }

  _bindHandleDrag(handle, mode, block, track, noteObj, area, N) {
    let startX, startVal, areaW;

    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      startX = e.clientX;
      startVal = mode === 'move' ? noteObj.step : (noteObj.dur || 1);
      areaW = area.getBoundingClientRect().width;
    });

    handle.addEventListener('pointermove', e => {
      if (!handle.hasPointerCapture(e.pointerId)) return;
      const stepW = areaW / N;
      const dx = e.clientX - startX;

      if (mode === 'move') {
        const newStep = Math.max(0, Math.min(N - 1, Math.round(startVal + dx / stepW)));
        if (newStep !== noteObj.step) {
          const conflict = track.notes.some(
            n => n !== noteObj && n.step === newStep && n.note === noteObj.note
          );
          if (!conflict) {
            noteObj.step = newStep;
            block.dataset.step = newStep;
            block.style.left = `${(newStep / N) * 100}%`;
          }
        }
      } else {
        const newDur = Math.max(0.25, Math.round((startVal + dx / stepW) * 4) / 4);
        noteObj.dur = newDur;
        block.style.width = `${(newDur / N) * 100}%`;
      }
    });
  }

  _showNoteEditPopup(block, track, noteObj, color, N) {
    this._closeNoteEditPopup();
    const popup = document.createElement('div');
    popup.id = 'note-edit-popup';
    popup.className = 'note-edit-popup';

    [{ v: 1, label: 'LOW' }, { v: 2, label: 'MID' }, { v: 3, label: 'HIGH' }].forEach(({ v, label }) => {
      const btn = document.createElement('button');
      btn.className = `vel-opt vel-opt-${v}`;
      if (noteObj.vel === v) btn.classList.add('active');
      btn.textContent = label;
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        noteObj.vel = v;
        const alpha = v === 1 ? 0.45 : v === 2 ? 0.72 : 1.0;
        block.style.background = hexToRgba(color, alpha);
        this._closeNoteEditPopup();
      });
      popup.appendChild(btn);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'note-delete-btn';
    delBtn.textContent = 'DEL';
    delBtn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      track.notes = track.notes.filter(n => n !== noteObj);
      block.remove();
      this._closeNoteEditPopup();
    });
    popup.appendChild(delBtn);

    const rect = block.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - 100;
    let top  = rect.top - 50;
    left = Math.max(4, Math.min(left, window.innerWidth - 204));
    if (top < 4) top = rect.bottom + 6;
    popup.style.left = `${left}px`;
    popup.style.top  = `${top}px`;
    document.body.appendChild(popup);

    const onOutside = e => { if (!popup.contains(e.target)) this._closeNoteEditPopup(); };
    setTimeout(() => document.addEventListener('pointerdown', onOutside, { once: true }), 50);
    popup._outside = onOutside;
  }

  _closeNoteEditPopup() {
    const p = document.getElementById('note-edit-popup');
    if (p) { if (p._outside) document.removeEventListener('pointerdown', p._outside); p.remove(); }
  }

  // ── Playhead ────────────────────────────────────────────────────────────────
  _updatePlayhead(step) {
    if (this.activeStep >= 0) {
      document.querySelector(`.step-row[data-step="${this.activeStep}"]`)?.classList.remove('active');
      document.querySelector(`.pr-header-cell[data-step="${this.activeStep}"]`)?.classList.remove('playhead');
      document.querySelectorAll(`.pr-bg-cell[data-step="${this.activeStep}"]`).forEach(el => el.classList.remove('col-active'));
    }
    document.querySelector(`.step-row[data-step="${step}"]`)?.classList.add('active');
    document.querySelector(`.pr-header-cell[data-step="${step}"]`)?.classList.add('playhead');
    document.querySelectorAll(`.pr-bg-cell[data-step="${step}"]`).forEach(el => el.classList.add('col-active'));
    this.activeStep = step;
  }

  // ── Transport ───────────────────────────────────────────────────────────────
  _bindTransport() {
    const playBtn = document.getElementById('play-stop');
    playBtn.addEventListener('click', () => {
      if (this.seq.isPlaying) {
        this.seq.stop();
        playBtn.textContent = '▶ PLAY';
        playBtn.classList.remove('playing');
        if (this.activeStep >= 0) {
          document.querySelector(`.step-row[data-step="${this.activeStep}"]`)?.classList.remove('active');
          document.querySelector(`.pr-header-cell[data-step="${this.activeStep}"]`)?.classList.remove('playhead');
          document.querySelectorAll(`.pr-bg-cell[data-step="${this.activeStep}"]`).forEach(el => el.classList.remove('col-active'));
          this.activeStep = -1;
        }
      } else {
        this.seq.start();
        playBtn.textContent = '■ STOP';
        playBtn.classList.add('playing');
      }
    });

    const bpmRange = document.getElementById('bpm');
    const bpmNum   = document.getElementById('bpm-num');
    const syncBpm  = val => {
      const v = Math.min(200, Math.max(60, parseInt(val) || 120));
      this.seq.bpm = v;
      bpmRange.value = v;
      bpmNum.value = v;
    };
    bpmRange.addEventListener('input', e => syncBpm(e.target.value));
    bpmNum.addEventListener('change', e => syncBpm(e.target.value));

    const swingRange = document.getElementById('swing');
    const swingVal   = document.getElementById('swing-val');
    swingRange.addEventListener('input', e => {
      this.seq.swing = parseInt(e.target.value) / 100;
      swingVal.textContent = `${e.target.value}%`;
    });

    const onStepsChange = () => {
      this._rebuildBeatGrids();
      if (this._prBuilt) {
        this._buildPianoRoll();
        this._buildTracksBar();
      }
    };

    document.getElementById('beats-per-measure').addEventListener('change', e => {
      this.seq.beatsPerMeasure = parseInt(e.target.value);
      this.seq.setTotalSteps(this.seq.beatsPerMeasure * 4);
      onStepsChange();
    });

    document.getElementById('steps').addEventListener('change', e => {
      this.seq.setTotalSteps(parseInt(e.target.value));
      onStepsChange();
    });
  }

  // ── Dialog ──────────────────────────────────────────────────────────────────
  _buildDialog() {
    const dialog  = document.getElementById('instrument-dialog');
    const titleEl = document.getElementById('dialog-title');
    const list    = document.getElementById('preset-list');
    const closeDialog = () => dialog.close();

    this._openDrumDialog = (editTarget) => {
      titleEl.textContent = editTarget ? 'Change Drum' : 'Add Drum';
      list.innerHTML = '';
      DRUM_PRESETS.forEach(preset => {
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
            this.seq.audio.init();
            const track = this.seq.addTrack(preset.instrument, preset.label, 'drum');
            this._renderDrumTrack(track);
          }
          closeDialog();
        });
        list.appendChild(btn);
      });
      dialog.showModal();
    };

    this._openSynthDialog = (editTarget) => {
      titleEl.textContent = editTarget ? 'Change Synth' : 'Add Synth';
      list.innerHTML = '';
      MELODY_PRESETS.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
          if (editTarget) {
            this.seq.tone.disposeSynth(editTarget.track.id);
            editTarget.track.instrument = preset.instrument;
            editTarget.track.label = preset.label;
            editTarget.nameEl.textContent = preset.label;
            const g = this.seq.audio.trackGains[editTarget.track.id];
            if (g) this.seq.tone.createSynth(editTarget.track, g);
            this._buildTracksBar();
          } else {
            this._addMelodyTrack(preset);
          }
          closeDialog();
        });
        list.appendChild(btn);
      });
      dialog.showModal();
    };

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
  const PPQ = 96, ticksPerStep = PPQ / 4;
  const uspb = Math.round(60_000_000 / seq.bpm);
  const events = [];
  let melCh = 0;

  for (const track of seq.tracks) {
    if (track.type === 'melody') {
      if (melCh === 9) melCh++;
      const ch = melCh++ & 0x0F;
      for (const n of (track.notes || [])) {
        const mv = n.vel === 1 ? 55 : n.vel === 2 ? 82 : 110;
        const mn = Math.max(0, Math.min(127,
          noteToMidi(n.note) + (track.octaveShift || 0) * 12));
        const tick = n.step * ticksPerStep;
        const durTicks = Math.max(1, Math.round((n.dur || 1) * ticksPerStep) - 1);
        events.push({ tick, status: 0x90 | ch, note: mn, vel: mv });
        events.push({ tick: tick + durTicks, status: 0x80 | ch, note: mn, vel: 0 });
      }
    } else {
      const note = DRUM_NOTE[track.instrument];
      if (!note) continue;
      for (let s = 0; s < seq.totalSteps; s++) {
        const vel = track.steps[s];
        if (!vel) continue;
        const mv = vel === 1 ? 55 : vel === 2 ? 82 : 110;
        const tick = s * ticksPerStep;
        events.push({ tick, status: 0x99, note, vel: mv });
        events.push({ tick: tick + ticksPerStep - 1, status: 0x89, note, vel: 0 });
      }
    }
  }

  events.sort((a, b) => a.tick - b.tick || (a.status & 0xF0) - (b.status & 0xF0));

  const trk = [0x00, 0xFF, 0x51, 0x03,
    (uspb >> 16) & 0xFF, (uspb >> 8) & 0xFF, uspb & 0xFF];
  let cur = 0;
  for (const e of events) {
    trk.push(...vlq(e.tick - cur)); cur = e.tick;
    trk.push(e.status, e.note, e.vel);
  }
  const loopTick = seq.totalSteps * ticksPerStep;
  trk.push(...vlq(loopTick - cur), 0xFF, 0x2F, 0x00);

  return new Uint8Array([
    0x4D,0x54,0x68,0x64, 0,0,0,6, 0,0, 0,1,
    (PPQ >> 8) & 0xFF, PPQ & 0xFF,
    0x4D,0x54,0x72,0x6B,
    (trk.length >> 24)&0xFF, (trk.length >> 16)&0xFF,
    (trk.length >> 8)&0xFF, trk.length & 0xFF,
    ...trk,
  ]);
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
  const hLen = u32();
  u16(); // format
  const nTracks = u16();
  const ppq = u16();
  p = 8 + hLen;
  if (ppq & 0x8000) throw new Error('SMPTE timecode not supported');

  const drumHits = {};
  // melHits[ch] = [{step, note, vel, dur}]
  const melHits = {};
  // pending note-ons: pending[ch][midiNote] = {step, vel, startTick}
  const pending = {};
  let maxTick = 0;

  for (let t = 0; t < nTracks; t++) {
    if (p + 8 > dv.byteLength) break;
    if (u32() !== 0x4D54726B) throw new Error('Bad track chunk');
    const trkLen = u32();
    const trkEnd = Math.min(p + trkLen, dv.byteLength);
    let tick = 0, rs = 0;

    while (p < trkEnd) {
      tick += readVlq();
      if (p >= trkEnd) break;
      let sb = dv.getUint8(p);
      if (sb & 0x80) { rs = sb; p++; } else { sb = rs; }
      if (p >= trkEnd && sb !== 0xFF) break;

      if (sb === 0xFF) {
        const mtype = u8(), mlen = readVlq();
        if (mtype === 0x2F) { p = trkEnd; break; }
        skip(mlen, trkEnd);
      } else if (sb === 0xF0 || sb === 0xF7) {
        skip(readVlq(), trkEnd);
      } else {
        const type = sb & 0xF0, ch = sb & 0x0F;
        switch (type) {
          case 0x90: {
            if (p + 1 >= trkEnd) { p = trkEnd; break; }
            const note = u8(), vel = u8();
            if (vel > 0) {
              const step = Math.round(tick / (ppq / 4));
              const lv = vel > 100 ? 3 : vel > 64 ? 2 : 1;
              if (ch === 9) {
                const inst = NOTE_TO_INSTRUMENT[note];
                if (inst) {
                  if (!drumHits[inst]) drumHits[inst] = {};
                  if (!drumHits[inst][step]) drumHits[inst][step] = lv;
                }
              } else {
                if (!pending[ch]) pending[ch] = {};
                pending[ch][note] = { step, vel: lv, startTick: tick };
              }
              maxTick = Math.max(maxTick, tick);
            } else {
              // vel=0 = note-off
              if (ch !== 9 && pending[ch] && pending[ch][note]) {
                const { step, vel: lv, startTick } = pending[ch][note];
                const dur = Math.max(0.25, Math.round(((tick - startTick) / (ppq / 4)) * 4) / 4);
                if (!melHits[ch]) melHits[ch] = [];
                melHits[ch].push({ step, note: midiToNote(note), vel: lv, dur });
                delete pending[ch][note];
              }
            }
            break;
          }
          case 0x80: {
            if (p + 1 >= trkEnd) { p = trkEnd; break; }
            const note = u8(); u8(); // note-off velocity ignored
            if (ch !== 9 && pending[ch] && pending[ch][note]) {
              const { step, vel: lv, startTick } = pending[ch][note];
              const dur = Math.max(0.25, Math.round(((tick - startTick) / (ppq / 4)) * 4) / 4);
              if (!melHits[ch]) melHits[ch] = [];
              melHits[ch].push({ step, note: midiToNote(note), vel: lv, dur });
              delete pending[ch][note];
            }
            break;
          }
          case 0xA0: case 0xB0: case 0xE0: skip(2, trkEnd); break;
          case 0xC0: case 0xD0: skip(1, trkEnd); break;
          default: p = trkEnd;
        }
      }
    }
    p = trkEnd;
  }

  const sd = Math.ceil((maxTick / ppq) * 4);
  const totalSteps = sd <= 8 ? 8 : sd <= 16 ? 16 : 32;
  return { drumHits, melHits, totalSteps };
}

// ─── Init ────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const audio = new AudioEngine();
  const tone  = new ToneEngine();
  const seq   = new Sequencer(audio, tone);
  audio.sequencer = seq;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') audio.resume();
  });

  const ui = new UI(seq);
  ui.init();
  ui._initDefaultKit();

  document.getElementById('midi-export').addEventListener('click', () => {
    const bytes = exportMidi(seq);
    const url = URL.createObjectURL(new Blob([bytes], { type: 'audio/midi' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'beat.mid'; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  });

  document.getElementById('midi-import').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const { drumHits, melHits, totalSteps } = importMidi(evt.target.result);

        for (const track of [...seq.tracks]) seq.removeTrack(track.id);
        seq.totalSteps = totalSteps;
        ui._initBeatDOM();

        const stepsEl = document.getElementById('steps');
        if ([8, 16, 32].includes(totalSteps)) stepsEl.value = totalSteps;

        audio.init();

        const DRUM_LABEL = {
          kick: '808 Kick', snare: '808 Snare', hihat_c: 'Closed Hat',
          hihat_o: 'Open Hat', clap: '808 Clap', tom_hi: 'High Tom',
          tom_lo: 'Low Tom', rimshot: 'Rimshot', cowbell: 'Cowbell',
        };
        for (const [inst, stepMap] of Object.entries(drumHits)) {
          const track = seq.addTrack(inst, DRUM_LABEL[inst] || inst, 'drum');
          for (const [step, lv] of Object.entries(stepMap)) {
            if (step < totalSteps) track.steps[step] = lv;
          }
          ui._renderDrumTrack(track);
        }

        let melIdx = 0;
        for (const [, noteArr] of Object.entries(melHits)) {
          const colorIdx = ui._melColorIdx % TRACK_COLORS.length;
          ui._melColorIdx++;
          const track = seq.addTrack('synth_poly', `Melody ${++melIdx}`, 'melody');
          track.colorIdx = colorIdx;
          for (const { step, note, vel, dur } of noteArr) {
            const s = parseInt(step);
            if (s < totalSteps) track.notes.push({ step: s, note, vel, dur: dur || 1 });
          }
        }

        if (!ui._selectedMelodyTrackId) {
          const first = seq.tracks.find(t => t.type === 'melody');
          if (first) ui._selectedMelodyTrackId = first.id;
        }

        if (ui._prBuilt) {
          ui._buildPianoRoll();
          ui._buildTracksBar();
        }
      } catch (err) {
        alert(`Could not read MIDI file: ${err.message}`);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  });
});
