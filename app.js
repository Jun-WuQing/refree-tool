// ====== Page Routing ======
const $ = id => document.getElementById(id);
const qs = (sel, parent=document) => parent.querySelector(sel);
const qsa = (sel, parent=document) => parent.querySelectorAll(sel);
let pageHistory = ['home'];

function showPage(name) {
  pageHistory.push(name);
  qsa('.page').forEach(p => p.classList.remove('active'));
  const pageMap = { home:'page-home', newmatch:'page-newmatch', match:'page-match', rotation:'page-rotation', settings:'page-settings', help:'page-help' };
  const el = $(pageMap[name]);
  if (el) el.classList.add('active');
  if (name === 'match') { initMatchPage(); renderTabContent(); }
  if (name === 'rotation') initRotationPage();
  if (name === 'settings') renderSettings();
}

// ====== Init ======
let currentTab = 0, lineupTeamTab = 0, lineupSetTab = 1, selectedCheckTeam = 'A';

Store.on('warmup', renderWarmup);
Store.on('interSet', () => { renderInterSetBanner(); if (qs('#page-match.active')) renderTabContent(); });
Store.on('rotation', () => { if (qs('#page-rotation.active')) initRotationPage(); });
Store.on('timeout', renderTimeout);
Store.on('lineup', () => { if (qs('#page-match.active')) renderLineup(); });

document.addEventListener('DOMContentLoaded', () => {
  // Init - check if has data
  if (Store.teamA && Store.teamB) {
    // Go to match directly
    showPage('match');
  }
});

// ====== New Match ======
function onStartMatch() {
  const a = $('teamA-input').value.trim(), b = $('teamB-input').value.trim();
  if (!a || !b) return alert('请输入两队队名');
  Store.setTeams(a, b);
  showPage('match');
}

// ====== Match Main Page ======
function initMatchPage() {
  $('match-title').textContent = `${Store.teamA} vs ${Store.teamB}`;
  renderInterSetBanner();
  // Init lineup team tabs
  renderLineupTeamTabs();
  renderSetChips();
  renderLineup();
  renderWarmup();
  renderRotationEntry();
  // Select tab
  switchTab(currentTab);
}

function switchTab(idx) {
  currentTab = idx;
  qsa('.tab-item').forEach(t => t.classList.toggle('active', parseInt(t.dataset.tab) === idx));
  ['tab-warmup', 'tab-lineup', 'tab-rotation', 'tab-personal'].forEach((id, i) => {
    $(id).style.display = i === idx ? 'block' : 'none';
  });
  if (idx === 0) renderWarmup();
  if (idx === 1) { renderSetChips(); renderLineupTeamTabs(); renderLineup(); }
  if (idx === 2) renderRotationEntry();
}

function renderInterSetBanner() {
  const banner = $('inter-set-banner');
  if (!Store.interSetRunning && !Store.interSetFinished) { banner.style.display = 'none'; return; }
  banner.style.display = 'block';
  banner.className = 'inter-set-banner' + (Store.interSetFinished ? ' finished' : '');
  $('inter-set-text').textContent = Store.interSetFinished ? '局间休息结束！' : `局间休息 ${Store.interSetFormatted}`;
  const actions = $('inter-set-actions');
  if (Store.interSetFinished) {
    actions.innerHTML = '<button onclick="onProceedNextSet()">确定，开始下一局</button>';
  } else if (!Store.interSetMinimized) {
    actions.innerHTML = '<button class="light" onclick="Store.minimizeInterSet()">最小化</button><button class="danger" onclick="Store.skipInterSet()">跳过</button>';
  } else { actions.innerHTML = ''; }
}

function onProceedNextSet() {
  const next = Store.currentSet + 1;
  Store.ensureLineupForSet(next);
  Store.proceedToNextSet(
    Store.getLineup('A', next) || { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 },
    Store.getLineup('B', next) || { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 }
  );
  switchTab(2);
}

function confirmEndMatch() {
  if (confirm('结束比赛？数据将丢失。')) showPage('home');
}

// ====== Warmup ======
function renderWarmup() {
  if (Store.warmupIsCompleted) {
    $('warmup-done').style.display = 'flex';
    $('warmup-body').style.display = 'none';
    return;
  }
  $('warmup-done').style.display = 'none';
  $('warmup-body').style.display = 'flex';
  $('warmup-progress').style.width = `${((Store.warmupStageIndex+1)/3*100)}%`;
  qs('.stage-label', $('warmup-body')).textContent = `阶段 ${Store.warmupStageIndex+1} / 3`;
  $('warmup-stage-name').textContent = Store.warmupCurrentStageName;
  $('warmup-time').textContent = Store.warmupFormattedTime;
  $('warmup-timer').className = 'timer-circle' + (Store.warmupRunning && Store.warmupRemaining <= 10 ? ' warning' : '');
  const act = $('warmup-actions');
  if (Store.warmupPaused) {
    act.innerHTML = `<button class="btn-green" onclick="Store.warmupNextStage()">${Store.warmupStageIndex < 2 ? '下一环节' : '完成热身'}</button>`;
  } else if (!Store.warmupRunning) {
    act.innerHTML = '<button class="btn-primary" onclick="Store.warmupStart()">开始热身</button>';
  } else {
    act.innerHTML = '<button class="btn-outline" onclick="Store.warmupSkipStage()">跳过</button>';
  }
}

// ====== Lineup ======
function renderSetChips() {
  $('set-chips').innerHTML = [1,2,3,4,5].map(i =>
    `<span class="set-chip ${lineupSetTab === i ? 'active' : ''}" onclick="onSelectSet(${i})">第${i}局</span>`
  ).join('');
}
function renderLineupTeamTabs() {
  $('team-tabs').innerHTML = [
    `<span class="team-tab ${lineupTeamTab === 0 ? 'active' : ''}" onclick="lineupTeamTab=0;renderLineup();renderSetChips()">${Store.teamA || 'A队'}</span>`,
    `<span class="team-tab ${lineupTeamTab === 1 ? 'active' : ''}" onclick="lineupTeamTab=1;renderLineup();renderSetChips()">${Store.teamB || 'B队'}</span>`
  ].join('');
  $('copy-row').style.display = lineupSetTab > 1 ? 'block' : 'none';
}
function onSelectSet(n) {
  lineupSetTab = n;
  const team = lineupTeamTab === 0 ? 'A' : 'B';
  if (!Store.hasLineup(team, n) && n > 1) {
    const prev = Store.getPreviousLineup(team, n);
    if (prev) Store.setLineup(team, n, prev);
  }
  renderSetChips();
  renderLineup();
}
function onCopyPrevious() {
  const team = lineupTeamTab === 0 ? 'A' : 'B';
  const prev = Store.getPreviousLineup(team, lineupSetTab);
  if (prev) { Store.setLineup(team, lineupSetTab, prev); renderLineup(); }
}

function renderLineup() {
  const team = lineupTeamTab === 0 ? 'A' : 'B';
  const lineup = Store.getLineup(team, lineupSetTab) || { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 };
  for (let i = 1; i <= 6; i++) {
    const el = $(`pos-${i}`);
    const val = lineup[`pos${i}`] || 0;
    el.textContent = val > 0 ? val : '—';
    el.className = 'pos-number' + (val > 0 ? ' filled' : '');
  }
  renderLineupTeamTabs();
}

function onEditPosition(pos) {
  const team = lineupTeamTab === 0 ? 'A' : 'B';
  const lineup = Store.getLineup(team, lineupSetTab) || { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 };
  const current = lineup[`pos${pos}`] || 0;
  $('pos-dialog-title').textContent = `${pos}号位 - 队员号码`;
  $('pos-dialog-input').value = current > 0 ? current : '';
  $('pos-dialog-input').dataset.pos = pos;
  $('pos-dialog-input').dataset.team = team;
  $('pos-dialog').style.display = 'flex';
  $('pos-dialog-input').focus();
}
function onPosDialogCancel() { $('pos-dialog').style.display = 'none'; }
function onPosDialogConfirm() {
  const input = $('pos-dialog-input');
  const pos = parseInt(input.dataset.pos);
  const team = input.dataset.team;
  const num = parseInt(input.value) || 0;
  const lineup = Store.getLineup(team, lineupSetTab) || { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 };
  lineup[`pos${pos}`] = num;
  Store.setLineup(team, lineupSetTab, lineup);
  renderLineup();
  $('pos-dialog').style.display = 'none';
}
function onSaveLineup() {}

// ====== Rotation Entry ======
function renderRotationEntry() {
  const has = Store.hasAnyLineup(Store.currentSet);
  $('rotation-empty').style.display = has ? 'none' : 'flex';
  $('rotation-entry').style.display = has ? 'flex' : 'none';
  $('rotation-empty-text').textContent = `请先在"站位"页面录入第${Store.currentSet}局站位`;
  $('rotation-entry-title').textContent = Store.isCheckMode ? '站位检查模式 - 确认双方站位' : '轮转跟踪模式';
  $('rotation-entry-subtitle').textContent = `第${Store.currentSet}局 · ${Store.receivingTeam === 'A' ? Store.teamA : Store.teamB}接发`;
  qs('.enter-btn', $('rotation-entry')).textContent = Store.isCheckMode ? '检查站位' : '进入轮转';
}
function onEnterRotation() {
  Store.ensureLineupForSet(Store.currentSet);
  const a = Store.getLineup('A', Store.currentSet) || { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 };
  const b = Store.getLineup('B', Store.currentSet) || { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 };
  Store.initRotation(a, b, Store.currentSet);
  showPage('rotation');
}

// ====== Rotation Full ======
let rotSubTeam = '', rotSubPos = 0, rotSubOrig = 0;

function initRotationPage() {
  if (Store.isCheckMode) { renderCheckMode(); } else { renderRotationMode(); }
}

// --- Check Mode ---
function renderCheckMode() {
  $('rot-check').style.display = 'flex';
  $('rot-mode').style.display = 'none';
  $('check-set-title').textContent = `第${Store.currentSet}局`;
  // Team names
  $('check-team-left').textContent = Store.teamA;
  $('check-team-right').textContent = Store.teamB;
  // Selection
  $('check-court-left').className = 'court-cell' + (selectedCheckTeam === 'A' ? ' selected' : '');
  $('check-court-right').className = 'court-cell' + (selectedCheckTeam === 'B' ? ' selected' : '');
  $('check-confirm-btn').textContent = `确认 · ${selectedCheckTeam === 'A' ? Store.teamA : Store.teamB}接发`;
  renderCheckGrids();
}

function renderCheckGrids() {
  const lineupA = Store.teamALineup || emptyL();
  const lineupB = Store.teamBLineup || emptyL();
  const serverNum = Store.serverPlayerNumber;
  const swapped = Store.checkSwapped;
  // swapped: 左=B(正向) 右=A(对称); 默认: 左=A(正向) 右=B(对称)
  const leftL = swapped ? lineupB : lineupA;
  const rightL = swapped ? lineupA : lineupB;
  const leftNums = [leftL.pos5, leftL.pos4, leftL.pos6, leftL.pos3, leftL.pos1, leftL.pos2];
  const rightNums = [rightL.pos2, rightL.pos1, rightL.pos3, rightL.pos6, rightL.pos4, rightL.pos5];
  $('check-left-grid').innerHTML = renderPlayerCells(leftNums, serverNum);
  $('check-right-grid').innerHTML = renderPlayerCells(rightNums, serverNum);
  $('check-team-left').textContent = swapped ? Store.teamB : Store.teamA;
  $('check-team-right').textContent = swapped ? Store.teamA : Store.teamB;
}

function renderPlayerCells(nums, serverNum) {
  return nums.map(n => {
    const cls = (n > 0 ? ' filled' : '');
    return `<div class="player-cell${cls}">${n > 0 ? n : '—'}</div>`;
  }).join('');
}

function emptyL() { return { pos1:0, pos2:0, pos3:0, pos4:0, pos5:0, pos6:0 }; }

function selectCheckTeam(team) {
  selectedCheckTeam = team;
  renderCheckMode();
}

function onCheckSwap() {
  Store.setCheckSwapped(!Store.checkSwapped);
  renderCheckGrids();
}

function onConfirmReceiving() {
  Store.setReceivingTeam(selectedCheckTeam);
  renderRotationMode();
}

// --- Rotation Mode ---
function renderRotationMode() {
  $('rot-check').style.display = 'none';
  $('rot-mode').style.display = 'flex';
  $('rot-team-name').textContent = Store.receivingTeam === 'A' ? Store.teamA : Store.teamB;
  $('serving-tag').textContent = `${Store.receivingTeam === 'A' ? Store.teamB : Store.teamA} ${Store.serverPlayerNumber}号发球`;
  $('undo-btn').className = 'undo-btn' + (Store.canUndo ? '' : ' disabled');

  const isDouble = Store.rotationDisplayMode === 'double';
  $('rot-double').style.display = isDouble ? 'flex' : 'none';
  $('rot-single').style.display = isDouble ? 'none' : 'flex';
  $('rot-swap-btn').style.display = isDouble ? 'inline-block' : 'none';

  if (isDouble) {
    renderDoubleCourts();
  } else {
    renderSingleCourt();
  }
}

function renderDoubleCourts() {
  const serverNum = Store.serverPlayerNumber;
  const leftTeam = Store.rotationSwapped ? 'B' : 'A';
  const leftL = leftTeam === 'A' ? Store.teamALineup : Store.teamBLineup;
  const leftOld = leftTeam === 'A' ? Store.teamASubOld : Store.teamBSubOld;
  const leftNew = leftTeam === 'A' ? Store.teamASubNew : Store.teamBSubNew;
  const rightTeam = Store.rotationSwapped ? 'A' : 'B';
  const rightL = rightTeam === 'A' ? Store.teamALineup : Store.teamBLineup;
  const rightOld = rightTeam === 'A' ? Store.teamASubOld : Store.teamBSubOld;
  const rightNew = rightTeam === 'A' ? Store.teamASubNew : Store.teamBSubNew;

  $('rot-left-grid').innerHTML = buildPlayerObjs(leftL, [5,4,6,3,1,2], leftOld, leftNew, serverNum, leftTeam);
  $('rot-right-grid').innerHTML = buildPlayerObjs(rightL, [2,1,3,6,4,5], rightOld, rightNew, serverNum, rightTeam);
}

function renderSingleCourt() {
  const s = Store, lineup = s.currentReceivingLineup;
  const old = s.receivingSubOld, nw = s.receivingSubNew, sv = s.serverPlayerNumber, tm = s.receivingTeam;
  const front = buildPlayerObjs(lineup, [4,3,2], old, nw, sv, tm, true);
  const back = buildPlayerObjs(lineup, [5,6,1], old, nw, sv, tm, true);
  $('single-court-inner').innerHTML = `
    <div class="single-row"><span class="row-label">前排</span>${front}</div>
    <div class="single-row"><span class="row-label">后排</span>${back}</div>
  `;
}

function buildPlayerObjs(lineup, positions, subOld, subNew, serverNum, team, isSingle) {
  if (!lineup) lineup = emptyL();
  const getVal = (l, p) => { switch(p) { case 1:return l.pos1; case 2:return l.pos2; case 3:return l.pos3; case 4:return l.pos4; case 5:return l.pos5; case 6:return l.pos6; } return 0; };
  return positions.map(pos => {
    const orig = getVal(lineup, pos);
    const displayed = (subOld != null && subNew != null && orig === subOld) ? subNew : orig;
    const cls = (displayed > 0 ? ' filled' : '') + (serverNum && displayed > 0 && displayed === serverNum && team !== Store.receivingTeam ? ' server' : '') + (subNew != null && displayed > 0 && displayed === subNew ? ' sub' : '');
    const tag = isSingle ? 'div' : 'div';
    return `<${tag} class="${isSingle ? 'player-slot' : 'player-cell'}${cls}" onclick="onPlayerTap(${pos},${orig},${displayed},'${team}')">${displayed > 0 ? displayed : '—'}</${tag}>`;
  }).join('');
}

function onRotSwap() {
  Store.rotationSwapped = !Store.rotationSwapped;
  renderDoubleCourts();
}

function onUndo() { Store.undo(); if (!Store.isCheckMode) renderRotationMode(); }

function onSwitchPossession() { Store.switchPossession(); renderRotationMode(); }

function closeRotation() {
  Store.checkSwapped = false;
  Store.rotationSwapped = false;
  showPage('match');
}

// --- Player Tap → Substitution ---
function onPlayerTap(pos, orig, displayed, team) {
  const subNew = team === 'A' ? Store.teamASubNew : Store.teamBSubNew;
  if (subNew != null && displayed === subNew) {
    Store.clearTeamSub(team);
  } else {
    rotSubTeam = team; rotSubPos = pos; rotSubOrig = orig;
    $('sub-title').textContent = `替换 ${orig}号 球员`;
    $('sub-desc').textContent = `由 ${orig > 0 ? orig + '号' : '空位'} 替换为:`;
    $('sub-input').value = '';
    $('sub-dialog').style.display = 'flex';
    $('sub-input').focus();
  }
}
function onSubCancel() { $('sub-dialog').style.display = 'none'; }
function onSubConfirm() {
  const n = parseInt($('sub-input').value) || 0;
  if (n > 0 && n !== rotSubOrig) Store.applyTeamSubstitution(rotSubTeam, rotSubOrig, n);
  $('sub-dialog').style.display = 'none';
}

// --- Timeout ---
function renderTimeout() {
  if (!Store.timeoutRunning && !Store.timeoutFinished) { $('timeout-overlay').style.display = 'none'; return; }
  $('timeout-time').textContent = Store.timeoutFormatted;
  $('timeout-circle').className = 'timeout-circle' + (Store.timeoutSeconds <= 5 && Store.timeoutRunning ? ' warning' : '');
  $('timeout-done').style.display = Store.timeoutFinished ? 'block' : 'none';
  qs('.timeout-close-btn', $('timeout-overlay')).textContent = Store.timeoutFinished ? '关闭' : '取消暂停';
}
function onStartTimeout() { Store.startTimeout(); $('timeout-overlay').style.display = 'flex'; }
function onTimeoutTap() { Store.cancelTimeout(); $('timeout-overlay').style.display = 'none'; }
function onEndSet() { if (confirm('确认结束本局? 将进入2分钟局间休息。')) { Store.endSet(); closeRotation(); } }

// ====== Settings ======
function renderSettings() {
  const mode = Store.rotationDisplayMode;
  $('radio-single').className = 'radio-check' + (mode === 'single' ? ' checked' : '');
  $('radio-double').className = 'radio-check' + (mode === 'double' ? ' checked' : '');
  $('dot-single').style.display = mode === 'single' ? 'block' : 'none';
  $('dot-double').style.display = mode === 'double' ? 'block' : 'none';
}
function setDisplayMode(mode) {
  Store.setRotationDisplayMode(mode);
  renderSettings();
}

// ====== Tab Content Switch ======
function renderTabContent() {
  // Just refresh the current tab
  switchTab(currentTab);
}
