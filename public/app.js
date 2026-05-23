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
  const pitch = _NOTE_NAMES.indexOf(m[1]);
  return (parseInt(m[2]) + 1) * 12 + pitch;
}
function midiToNote(n) {
  return `${_NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
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
  constructor() {
    this.synths = {};
  }

  createSynth(track, gainNode) {
    if (typeof Tone === 'undefined' || this.synths[track.id]) return;
    const synth = this._build(track.instrument);
    synth.connect(gainNode);
    this.synths[track.id] = synth;
  }

  _build(instrument) {
    let synth;
    switch (instrument) {
      case 'synth_fm':
        synth = new Tone.PolySynth(Tone.FMSynth);
        synth.set({
          harmonicity: 3, modulationIndex: 10,
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.4, release: 0.6 },
          modulationEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.5 },
        });
        break;
      case 'synth_am':
        synth = new Tone.PolySynth(Tone.AMSynth);
        synth.set({
          harmonicity: 2,
          envelope: { attack: 0.01, decay: 0.12, sustain: 0.5, release: 0.6 },
        });
        break;
      case 'synth_mono':
        synth = new Tone.MonoSynth();
        synth.set({
          oscillator: { type: 'sawtooth' },
          filter: { Q: 6, type: 'lowpass', rolloff: -24 },
          envelope: { attack: 0.005, decay: 0.15, sustain: 0.6, release: 0.4 },
          filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.4, release: 0.5,
            baseFrequency: 200, octaves: 3 },
        });
        break;
      default: // synth_poly
        synth = new Tone.PolySynth(Tone.Synth);
        synth.set({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.6 },
        });
    }
    return synth;
  }

  trigger(trackId, note, time, velocity, stepDuration) {
    const synth = this.synths[trackId];
    if (!synth) return;
    try {
      synth.triggerAttackRelease(note, Math.max(0.05, stepDuration * 0.8), time,
        Math.max(0.01, velocity / 3));
    } catch (e) { /* ignore scheduling errors on note change */ }
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
                    steps: new Int8Array(this.totalSteps) };
    if (type === 'melody') track.noteSteps = new Array(this.totalSteps).fill(null);
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
      const next = new Int8Array(n);
      next.set(track.steps.slice(0, n));
      track.steps = next;
      if (track.type === 'melody') {
        const nn = new Array(n).fill(null);
        const prev = track.noteSteps || [];
        for (let i = 0; i < Math.min(n, prev.length); i++) nn[i] = prev[i];
        track.noteSteps = nn;
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
      const vel = track.steps[stepIndex];
      if (vel > 0 && !track.muted) {
        if (track.type === 'melody') {
          const note = track.noteSteps ? track.noteSteps[stepIndex] : null;
          if (note) this.tone.trigger(track.id, note, scheduledTime, vel, stepDuration);
        } else {
          this.audio.trigger(track.instrument, scheduledTime, vel, track.id);
        }
      }
    }

    const delayMs = (scheduledTime - this.audio.ctx.currentTime) * 1000;
    setTimeout(() => {
      if (this.isPlaying && this.onStepChange) this.onStepChange(stepIndex);
    }, Math.max(0, delayMs));
  }
}

// ─── Constants ───────────────────────────────────────────────────────────────
const MELODY_NOTES = [
  'C3','D3','E3','F3','G3','A3','B3',
  'C4','D4','E4','F4','G4','A4','B4',
  'C5','D5','E5',
];

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
      { instrument: 'kick',    label: '808 Kick'   },
      { instrument: 'snare',   label: '808 Snare'  },
      { instrument: 'hihat_c', label: 'Closed Hat' },
      { instrument: 'hihat_o', label: 'Open Hat'   },
      { instrument: 'clap',    label: '808 Clap'   },
    ];
    for (const d of defaults) {
      const track = this.seq.addTrackOffline(d.instrument, d.label, 'drum');
      this._renderTrack(track);
    }
  }

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

  _renderTrack(track) {
    const header = document.createElement('div');
    header.className = `track-header${track.type === 'melody' ? ' melody-track' : ''}`;
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

    document.querySelectorAll('.step-row').forEach(row => {
      const stepIdx = parseInt(row.dataset.step);
      if (isNaN(stepIdx)) return;
      row.appendChild(this._makeCell(track, stepIdx));
    });
  }

  _makeCell(track, stepIdx) {
    return track.type === 'melody'
      ? this._makeMelodyCell(track, stepIdx)
      : this._makeDrumCell(track, stepIdx);
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

  _makeMelodyCell(track, stepIdx) {
    const cell = document.createElement('div');
    const vel = track.steps[stepIdx];
    cell.className = `step-cell mel-cell vel-${vel}`;
    cell.dataset.trackId = track.id;
    cell.dataset.step = stepIdx;

    const noteLabel = document.createElement('span');
    noteLabel.className = 'note-label';
    const existingNote = (track.noteSteps || [])[stepIdx];
    if (existingNote) noteLabel.textContent = existingNote;
    cell.appendChild(noteLabel);

    let holdTimer = null, startX, startY;
    cell.addEventListener('contextmenu', e => e.preventDefault());
    cell.addEventListener('pointerdown', e => {
      startX = e.clientX; startY = e.clientY;
      holdTimer = setTimeout(() => {
        holdTimer = null;
        this._showNotePicker(cell, track, stepIdx);
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
        const on = track.steps[stepIdx] > 0;
        if (on) {
          track.steps[stepIdx] = 0;
          if (track.noteSteps) track.noteSteps[stepIdx] = null;
          cell.className = 'step-cell mel-cell vel-0';
          noteLabel.textContent = '';
        } else {
          track.steps[stepIdx] = 3;
          if (track.noteSteps) track.noteSteps[stepIdx] = 'C4';
          cell.className = 'step-cell mel-cell vel-3';
          noteLabel.textContent = 'C4';
          this._showNotePicker(cell, track, stepIdx);
        }
      }
    });
    cell.addEventListener('pointercancel', () => { clearTimeout(holdTimer); holdTimer = null; });
    return cell;
  }

  // ── Velocity picker (drums) ────────────────────────────────────────────────
  _showVelPicker(cell, track, stepIdx) {
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
        cell.className = `step-cell vel-${v}`;
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

  // ── Note picker (melody) ───────────────────────────────────────────────────
  _showNotePicker(cell, track, stepIdx) {
    this._closeNotePicker();
    this._closeVelPicker();

    const picker = document.createElement('div');
    picker.id = 'note-picker';
    picker.className = 'note-picker';

    // Velocity row
    const velRow = document.createElement('div');
    velRow.className = 'note-picker-vel-row';
    [{ v: 1, label: 'pp' }, { v: 2, label: 'mf' }, { v: 3, label: 'ff' }].forEach(({ v, label }) => {
      const btn = document.createElement('button');
      btn.className = `vel-opt vel-opt-${v}`;
      if (track.steps[stepIdx] === v) btn.classList.add('active');
      btn.textContent = label;
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        track.steps[stepIdx] = v;
        cell.className = `step-cell mel-cell vel-${v}`;
        cell.appendChild(cell.querySelector('.note-label'));
        velRow.querySelectorAll('.vel-opt').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      velRow.appendChild(btn);
    });
    picker.appendChild(velRow);

    // Note grid
    const noteGrid = document.createElement('div');
    noteGrid.className = 'note-grid';
    const currentNote = (track.noteSteps || [])[stepIdx];
    MELODY_NOTES.forEach(note => {
      const btn = document.createElement('button');
      btn.className = 'note-btn';
      if (note === currentNote) btn.classList.add('active');
      if (note.startsWith('C')) btn.classList.add('note-c');
      btn.textContent = note;
      btn.addEventListener('pointerdown', e => {
        e.stopPropagation();
        if (track.noteSteps) track.noteSteps[stepIdx] = note;
        if (track.steps[stepIdx] === 0) track.steps[stepIdx] = 3;
        cell.className = `step-cell mel-cell vel-${track.steps[stepIdx]}`;
        const lbl = cell.querySelector('.note-label');
        if (lbl) { lbl.textContent = note; cell.appendChild(lbl); }
        noteGrid.querySelectorAll('.note-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
      noteGrid.appendChild(btn);
    });
    picker.appendChild(noteGrid);

    // Off button
    const offBtn = document.createElement('button');
    offBtn.className = 'note-off-btn';
    offBtn.textContent = 'OFF';
    offBtn.addEventListener('pointerdown', e => {
      e.stopPropagation();
      track.steps[stepIdx] = 0;
      if (track.noteSteps) track.noteSteps[stepIdx] = null;
      cell.className = 'step-cell mel-cell vel-0';
      const lbl = cell.querySelector('.note-label');
      if (lbl) lbl.textContent = '';
      this._closeNotePicker();
    });
    picker.appendChild(offBtn);

    // Position
    const rect = cell.getBoundingClientRect();
    const pw = 236;
    let left = rect.left + rect.width / 2 - pw / 2;
    let top  = rect.top - 10 - picker.offsetHeight;
    left = Math.max(4, Math.min(left, window.innerWidth - pw - 4));
    // Position after append so we know the height
    picker.style.left = `${left}px`;
    picker.style.top  = `${rect.top - 195}px`;
    document.body.appendChild(picker);

    // Reposition after render
    requestAnimationFrame(() => {
      const ph = picker.offsetHeight;
      let t = rect.top - ph - 8;
      if (t < 4) t = rect.bottom + 6;
      t = Math.max(4, Math.min(t, window.innerHeight - ph - 4));
      picker.style.top = `${t}px`;
    });

    const onOutside = e => { if (!picker.contains(e.target)) this._closeNotePicker(); };
    setTimeout(() => document.addEventListener('pointerdown', onOutside, { once: true }), 50);
    picker._outside = onOutside;
  }

  _closeNotePicker() {
    const p = document.getElementById('note-picker');
    if (p) { if (p._outside) document.removeEventListener('pointerdown', p._outside); p.remove(); }
  }

  // ── Grid management ────────────────────────────────────────────────────────
  _rebuildGrids() {
    document.querySelectorAll('.step-row').forEach(r => r.remove());
    const container = document.getElementById('track-list');
    for (let i = 0; i < this.seq.totalSteps; i++) {
      container.appendChild(this._makeStepRow(i));
    }
    for (const track of this.seq.tracks) {
      document.querySelectorAll('.step-row').forEach(row => {
        const stepIdx = parseInt(row.dataset.step);
        if (!isNaN(stepIdx)) row.appendChild(this._makeCell(track, stepIdx));
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

  // ── Transport ──────────────────────────────────────────────────────────────
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

  // ── Dialog ─────────────────────────────────────────────────────────────────
  _buildDialog() {
    const dialog = document.getElementById('instrument-dialog');
    const title  = dialog.querySelector('h2');
    const list   = document.getElementById('preset-list');
    let editTarget = null;

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

    const makeSection = (sectionTitle, presets) => {
      const section = document.createElement('div');
      section.className = 'preset-section';
      const heading = document.createElement('div');
      heading.className = 'preset-section-title';
      heading.textContent = sectionTitle;
      section.appendChild(heading);
      const grid = document.createElement('div');
      grid.className = 'preset-grid';
      presets.forEach(preset => {
        const btn = document.createElement('button');
        btn.className = 'preset-btn';
        btn.textContent = preset.label;
        btn.addEventListener('click', () => {
          const newType = preset.type || 'drum';
          if (editTarget) {
            const { track, nameEl } = editTarget;
            // Handle type change
            if (track.type === 'melody' && newType !== 'melody') {
              this.seq.tone.disposeSynth(track.id);
              delete track.noteSteps;
              track.type = 'drum';
              document.querySelectorAll(`.step-cell[data-track-id="${track.id}"]`).forEach(el => el.remove());
              document.querySelectorAll('.step-row').forEach(row => {
                const si = parseInt(row.dataset.step);
                if (!isNaN(si)) row.appendChild(this._makeDrumCell(track, si));
              });
              const hdr = document.querySelector(`.track-header[data-track-id="${track.id}"]`);
              if (hdr) hdr.classList.remove('melody-track');
            } else if (track.type !== 'melody' && newType === 'melody') {
              track.type = 'melody';
              track.noteSteps = new Array(this.seq.totalSteps).fill(null);
              const g = this.seq.audio.trackGains[track.id];
              if (g) this.seq.tone.createSynth({ ...track, instrument: preset.instrument }, g);
              document.querySelectorAll(`.step-cell[data-track-id="${track.id}"]`).forEach(el => el.remove());
              document.querySelectorAll('.step-row').forEach(row => {
                const si = parseInt(row.dataset.step);
                if (!isNaN(si)) row.appendChild(this._makeMelodyCell(track, si));
              });
              const hdr = document.querySelector(`.track-header[data-track-id="${track.id}"]`);
              if (hdr) hdr.classList.add('melody-track');
            } else if (track.type === 'melody') {
              // melody → melody swap
              this.seq.tone.disposeSynth(track.id);
              track.instrument = preset.instrument;
              const g = this.seq.audio.trackGains[track.id];
              if (g) this.seq.tone.createSynth(track, g);
            }
            track.instrument = preset.instrument;
            track.label = preset.label;
            nameEl.textContent = preset.label;
            nameEl.title = preset.label;
          } else {
            const track = this.seq.addTrack(preset.instrument, preset.label, newType);
            this._renderTrack(track);
          }
          closeDialog();
        });
        grid.appendChild(btn);
      });
      section.appendChild(grid);
      list.appendChild(section);
    };

    makeSection('DRUMS', DRUM_PRESETS);
    makeSection('MELODY SYNTHS', MELODY_PRESETS);

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
  const PPQ = 96;
  const ticksPerStep = PPQ / 4;
  const uspb = Math.round(60_000_000 / seq.bpm);

  const events = [];
  let melCh = 0;

  for (const track of seq.tracks) {
    if (track.type === 'melody') {
      // Skip channel 9 (reserved for drums in General MIDI)
      if (melCh === 9) melCh++;
      const ch = melCh & 0x0F;
      for (let s = 0; s < seq.totalSteps; s++) {
        const vel = track.steps[s];
        const note = (track.noteSteps || [])[s];
        if (!vel || !note) continue;
        const midiVel = vel === 1 ? 55 : vel === 2 ? 82 : 110;
        const midiNote = Math.max(0, Math.min(127, noteToMidi(note)));
        const tick = s * ticksPerStep;
        events.push({ tick, status: 0x90 | ch, note: midiNote, vel: midiVel });
        events.push({ tick: tick + ticksPerStep - 1, status: 0x80 | ch, note: midiNote, vel: 0 });
      }
      melCh++;
    } else {
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
  }

  events.sort((a, b) => a.tick - b.tick || (a.status & 0xF0) - (b.status & 0xF0));

  const trk = [];
  trk.push(0x00, 0xFF, 0x51, 0x03,
    (uspb >> 16) & 0xFF, (uspb >> 8) & 0xFF, uspb & 0xFF);
  let cur = 0;
  for (const e of events) {
    trk.push(...vlq(e.tick - cur));
    cur = e.tick;
    trk.push(e.status, e.note, e.vel);
  }
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
  const hLen = u32();
  u16(); // format
  const nTracks = u16();
  const ppq = u16();
  p = 8 + hLen;
  if (ppq & 0x8000) throw new Error('SMPTE timecode not supported');

  const drumHits = {};   // inst → { step → vel }
  const melHits  = {};   // ch   → { step → { note, vel } }
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
        const mtype = u8();
        const mlen  = readVlq();
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
                if (!melHits[ch]) melHits[ch] = {};
                if (!melHits[ch][step]) melHits[ch][step] = { note: midiToNote(note), vel: lv };
              }
              maxTick = Math.max(maxTick, tick);
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
        const { drumHits, melHits, totalSteps } = importMidi(evt.target.result);

        for (const track of [...seq.tracks]) seq.removeTrack(track.id);
        seq.totalSteps = totalSteps;
        ui._initSequencerDOM();

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
          ui._renderTrack(track);
        }

        let melIdx = 0;
        for (const [, stepMap] of Object.entries(melHits)) {
          const track = seq.addTrack('synth_poly', `Melody ${++melIdx}`, 'melody');
          for (const [step, { note, vel }] of Object.entries(stepMap)) {
            if (step < totalSteps) {
              track.steps[step] = vel;
              track.noteSteps[step] = note;
            }
          }
          ui._renderTrack(track);
        }
      } catch (err) {
        alert(`Could not read MIDI file: ${err.message}`);
      }
      e.target.value = '';
    };
    reader.readAsArrayBuffer(file);
  });
});
