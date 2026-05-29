// ====== 全局状态管理 ======
const Store = {
  teamA: '', teamB: '',
  lineups: { A: {}, B: {} },
  receivingTeam: 'A',
  teamALineup: { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 },
  teamBLineup: { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 },
  undoStack: [],
  currentSet: 1,
  isCheckMode: true,
  rotationDisplayMode: 'double',
  checkSwapped: false,
  rotationSwapped: false,

  teamASubOld: null, teamASubNew: null,
  teamBSubOld: null, teamBSubNew: null,

  interSetSeconds: 120, interSetRunning: false, interSetFinished: false, interSetMinimized: false,
  warmupStageIndex: 0, warmupRemaining: 120, warmupRunning: false, warmupPaused: false,
  timeoutSeconds: 30, timeoutRunning: false, timeoutFinished: false,

  _listeners: {},
  _timers: {},

  on(ev, fn) { if (!this._listeners[ev]) this._listeners[ev] = []; this._listeners[ev].push(fn); },
  off(ev, fn) { if (!this._listeners[ev]) return; this._listeners[ev] = this._listeners[ev].filter(f => f !== fn); },
  emit(ev) { (this._listeners[ev] || []).forEach(fn => fn(ev)); },

  _save() {
    try { localStorage.setItem('volley_data', JSON.stringify({
      teamA: this.teamA, teamB: this.teamB, lineups: this.lineups,
      rotationDisplayMode: this.rotationDisplayMode,
    })); } catch(e) {}
  },
  _load() {
    try {
      const d = JSON.parse(localStorage.getItem('volley_data'));
      if (d) { this.teamA = d.teamA || ''; this.teamB = d.teamB || ''; this.lineups = d.lineups || { A: {}, B: {} }; if (d.rotationDisplayMode) this.rotationDisplayMode = d.rotationDisplayMode; }
    } catch(e) {}
  },

  setTeams(a, b) { this.teamA = a; this.teamB = b; this._save(); },

  getLineup(team, set) { return this.lineups[team]?.[set] || null; },
  setLineup(team, set, lineup) {
    if (!this.lineups[team]) this.lineups[team] = {};
    this.lineups[team][set] = { ...lineup }; this._save(); this.emit('lineup');
  },
  getPreviousLineup(team, set) { return set > 1 ? this.getLineup(team, set - 1) : null; },
  ensureLineupForSet(set) {
    ['A','B'].forEach(team => { if (!this.getLineup(team, set) && set > 1) { const p = this.getPreviousLineup(team, set); if (p) this.setLineup(team, set, p); } });
  },
  hasLineup(team, set) { const l = this.getLineup(team, set); return l && (l.pos1||l.pos2||l.pos3||l.pos4||l.pos5||l.pos6) > 0; },
  hasAnyLineup(set) { return this.hasLineup('A', set) || this.hasLineup('B', set); },

  initRotation(teamA, teamB, setNum) {
    this.teamALineup = { ...teamA }; this.teamBLineup = { ...teamB };
    this.currentSet = setNum; this.undoStack = []; this.isCheckMode = true;
    this.teamASubOld = this.teamASubNew = null; this.teamBSubOld = this.teamBSubNew = null;
    if (setNum > 1) this.receivingTeam = this.receivingTeam === 'A' ? 'B' : 'A';
    this.checkSwapped = false; this.rotationSwapped = false; this.emit('rotation');
  },
  get currentReceivingLineup() { return this.receivingTeam === 'A' ? this.teamALineup : this.teamBLineup; },
  get serverPlayerNumber() { const s = this.receivingTeam === 'A' ? this.teamBLineup : this.teamALineup; return s.pos1; },
  get receivingSubOld() { return this.receivingTeam === 'A' ? this.teamASubOld : this.teamBSubOld; },
  get receivingSubNew() { return this.receivingTeam === 'A' ? this.teamASubNew : this.teamBSubNew; },
  setReceivingTeam(team) { this.receivingTeam = team; this.isCheckMode = false; this.checkSwapped = false; this.emit('rotation'); },

  switchPossession() {
    this.undoStack.push({ receivingTeam: this.receivingTeam, teamALineup: { ...this.teamALineup }, teamBLineup: { ...this.teamBLineup } });
    if (this.undoStack.length > 2) this.undoStack.shift();
    if (this.receivingTeam === 'A') this.teamALineup = this._rotate(this.teamALineup); else this.teamBLineup = this._rotate(this.teamBLineup);
    this.receivingTeam = this.receivingTeam === 'A' ? 'B' : 'A'; this.emit('rotation');
  },
  _rotate(l) { return { pos1:l.pos2, pos2:l.pos3, pos3:l.pos4, pos4:l.pos5, pos5:l.pos6, pos6:l.pos1 }; },
  undo() { if (this.undoStack.length === 0) return; const s = this.undoStack.pop(); this.receivingTeam = s.receivingTeam; this.teamALineup = s.teamALineup; this.teamBLineup = s.teamBLineup; this.emit('rotation'); },
  get canUndo() { return this.undoStack.length > 0; },

  applyTeamSubstitution(team, oldNum, newNum) {
    if (team === 'A') { this.teamASubOld = oldNum; this.teamASubNew = newNum; }
    else { this.teamBSubOld = oldNum; this.teamBSubNew = newNum; }
    this.emit('rotation');
  },
  clearTeamSub(team) { if (team === 'A') { this.teamASubOld = this.teamASubNew = null; } else { this.teamBSubOld = this.teamBSubNew = null; } this.emit('rotation'); },
  applySubstitution(oldNum, newNum) { this.applyTeamSubstitution(this.receivingTeam, oldNum, newNum); },
  clearCurrentSub() { this.clearTeamSub(this.receivingTeam); },

  centerSymmetric(l) { return { pos1:l.pos5, pos2:l.pos4, pos3:l.pos3, pos4:l.pos2, pos5:l.pos1, pos6:l.pos6 }; },

  // ---- Warmup ----
  warmupStageNames: ['4号位扣球', '2号位扣球', '发球'],
  get warmupIsCompleted() { return this.warmupStageIndex >= 3; },
  get warmupCurrentStageName() { return this.warmupStageIndex < 3 ? this.warmupStageNames[this.warmupStageIndex] : '热身完成'; },
  get warmupFormattedTime() { return `${String(Math.floor(this.warmupRemaining/60)).padStart(2,'0')}:${String(this.warmupRemaining%60).padStart(2,'0')}`; },
  warmupStart() {
    if (this.warmupRunning || this.warmupPaused) return;
    this.warmupRunning = true; this.warmupRemaining = 120;
    this._clearTimer('warmup');
    const start = Date.now();
    this._timers.warmup = setInterval(() => {
      const rem = 120 - Math.floor((Date.now() - start) / 1000);
      if (rem <= 0) { this.warmupRemaining=0; this._clearTimer('warmup'); this.warmupRunning=false; this.warmupPaused=true; this._alarm(); this.emit('warmup'); return; }
      this.warmupRemaining = rem; this.emit('warmup');
    }, 200);
    this.emit('warmup');
  },
  warmupNextStage() {
    if (this.warmupStageIndex < 2) {
      this.warmupStageIndex++; this.warmupPaused=false; this.warmupRunning=true; this.warmupRemaining=120;
      this._clearTimer('warmup');
      const start = Date.now();
      this._timers.warmup = setInterval(() => {
        const rem = 120 - Math.floor((Date.now() - start) / 1000);
        if (rem <= 0) { this.warmupRemaining=0; this._clearTimer('warmup'); this.warmupRunning=false; this.warmupPaused=true; this._alarm(); this.emit('warmup'); return; }
        this.warmupRemaining = rem; this.emit('warmup');
      }, 200);
    } else { this.warmupStageIndex = 3; this.warmupPaused = false; this.warmupRunning = false; }
    this.emit('warmup');
  },
  warmupSkipStage() { this._clearTimer('warmup'); this.warmupRemaining=0; this.warmupRunning=false; this.warmupPaused=true; this._alarm(); this.emit('warmup'); },
  warmupReset() { this._clearTimer('warmup'); this.warmupStageIndex=0; this.warmupRemaining=120; this.warmupRunning=false; this.warmupPaused=false; this.emit('warmup'); },

  // ---- Inter-set ----
  get interSetFormatted() { return `${String(Math.floor(this.interSetSeconds/60)).padStart(2,'0')}:${String(this.interSetSeconds%60).padStart(2,'0')}`; },
  endSet() {
    this.interSetSeconds=120; this.interSetRunning=true; this.interSetFinished=false; this.interSetMinimized=false;
    this._clearTimer('interSet');
    const start = Date.now();
    this._timers.interSet = setInterval(() => {
      const rem = 120 - Math.floor((Date.now() - start) / 1000);
      if (rem <= 0) { this.interSetSeconds=0; this._clearTimer('interSet'); this.interSetRunning=false; this.interSetFinished=true; this._alarm(); this.emit('interSet'); return; }
      this.interSetSeconds = rem; this.emit('interSet');
    }, 200);
    this.emit('interSet');
  },
  skipInterSet() { this._clearTimer('interSet'); this.interSetSeconds=0; this.interSetRunning=false; this.interSetFinished=true; this._alarm(); this.emit('interSet'); },
  minimizeInterSet() { this.interSetMinimized=true; this.emit('interSet'); },
  restoreInterSet() { this.interSetMinimized=false; this.emit('interSet'); },
  cancelInterSetAlarm() { this.interSetFinished=false; if (this.interSetRunning) { this._clearTimer('interSet'); this.interSetRunning=false; } this.emit('interSet'); },
  proceedToNextSet(teamA, teamB) {
    this._clearTimer('interSet'); this.interSetRunning=false; this.interSetFinished=false; this.interSetMinimized=false;
    this.currentSet++; this.teamALineup={...teamA}; this.teamBLineup={...teamB};
    this.undoStack=[]; this.isCheckMode=true; this.teamASubOld=this.teamASubNew=null; this.teamBSubOld=this.teamBSubNew=null;
    this.receivingTeam = this.receivingTeam === 'A' ? 'B' : 'A'; this.emit('rotation'); this.emit('interSet');
  },

  // ---- Timeout ----
  get timeoutFormatted() { return `00:${String(this.timeoutSeconds).padStart(2,'0')}`; },
  startTimeout() {
    if (this.timeoutRunning) return;
    this.timeoutRunning=true; this.timeoutFinished=false; this.timeoutSeconds=30;
    this._clearTimer('timeout');
    const start = Date.now();
    this._timers.timeout = setInterval(() => {
      const rem = 30 - Math.floor((Date.now() - start) / 1000);
      if (rem <= 0) { this.timeoutSeconds=0; this._clearTimer('timeout'); this.timeoutRunning=false; this.timeoutFinished=true; this._alarm(); this.emit('timeout'); return; }
      this.timeoutSeconds = rem; this.emit('timeout');
    }, 200);
    this.emit('timeout');
  },
  cancelTimeout() { this._clearTimer('timeout'); this.timeoutRunning=false; this.timeoutFinished=false; this.emit('timeout'); },

  setRotationDisplayMode(mode) { this.rotationDisplayMode = mode; this._save(); this.emit('settings'); },
  setCheckSwapped(v) { this.checkSwapped = v; this.emit('rotation'); },
  setRotSwapped(v) { this.rotationSwapped = v; this.emit('rotation'); },

  _alarm() {
    try { navigator.vibrate?.(500); } catch(e) {}
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator(); const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880; gain.gain.value = 0.3;
      osc.start(); osc.stop(ctx.currentTime + 0.3);
    } catch(e) {}
  },

  _clearTimer(key) { if (this._timers[key]) { clearInterval(this._timers[key]); delete this._timers[key]; } },
};

Store._load();
