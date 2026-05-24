/* ============================================================
   試験モード · 限定题数 · 末尾批改
   暴露：window.ModuleTest
   接口：{ id, label, labelEn, mount, unmount, getStats, handleGlobalEnter }
   ------------------------------------------------------------
   三阶段：
   - idle    配置：题数 / 出题来源；点 START 进 running
   - running 顺序作答；不出即时反馈；末尾批改
   - done    成绩单：总分 / 分组得分 / 逐题清单
   ------------------------------------------------------------
   试题池：沿用 verb / grammar 模块当前过滤（級・詞類・活用 / 機能組・題型），
   不另立设置。每题作答后写回对应模块的 logAnswer / bumpWeight / mistakes，
   保持与单模块练习一致的统计与 SRS。
   ============================================================ */
(function(global){
'use strict';

const { escapeHtml, withRuby, shuffle } = global.UI;
const { CONJ_LIST, CONJ_LABEL, conjugate, conjugateKana, checkAnswer } = global.Engine;

const STAGE_IDLE    = 'idle';
const STAGE_RUNNING = 'running';
const STAGE_DONE    = 'done';

const COUNT_OPTIONS = [10, 20, 30, 50];

let rootEl  = null;
let stage   = STAGE_IDLE;
let session = null;   // { questions: [...], currentIdx, startedAt }
let userPick = null;  // cloze 暂存选择

function cfg() { return State.get().modules.test.config; }

/* ============================================================
   题池构造 — 继承 verb / grammar 模块的筛选
   ============================================================ */
function collectVerbCandidates() {
  const m = State.get().modules.verb;
  const VERBS = global.VERBS || [];
  const pool = VERBS.filter(w => m.levels[w.level] && m.types[w.type]);
  const conjs = CONJ_LIST.filter(c => m.conjs[c.key]).map(c => c.key);
  const items = [];
  for (const w of pool) for (const t of conjs) {
    items.push({ kind: 'verb', word: w, target: t });
  }
  return items;
}

function collectGrammarCandidates() {
  const m = State.get().modules.grammar;
  const GRAMMAR = global.GRAMMAR || [];
  const groups = Object.keys(m.groups).filter(g => m.groups[g]);
  const modes  = Object.keys(m.modes).filter(md => m.modes[md]);
  const validPatterns = GRAMMAR.filter(p => groups.includes(p.group));
  const items = [];
  for (const p of validPatterns) for (const mode of modes) {
    const arr = mode === 'cloze' ? (p.cloze || []) : (p.scramble || []);
    for (let i = 0; i < arr.length; i++) {
      items.push({ kind: mode, pattern: p, itemIndex: i });
    }
  }
  return items;
}

function pickDistractors(correct, n) {
  const GRAMMAR = global.GRAMMAR || [];
  const same = shuffle(GRAMMAR.filter(g =>
    correct.cluster && g.cluster === correct.cluster && g.id !== correct.id));
  const out = same.slice(0, n);
  if (out.length < n) {
    const others = shuffle(GRAMMAR.filter(g => g.cluster !== correct.cluster && g.id !== correct.id));
    for (const o of others) {
      if (out.length >= n) break;
      out.push(o);
    }
  }
  return out;
}

function buildQuestion(c) {
  if (c.kind === 'verb') {
    return { type: 'verb', word: c.word, target: c.target, answer: null };
  }
  if (c.kind === 'cloze') {
    const distractors = pickDistractors(c.pattern, 3);
    const options = shuffle([
      { pattern: c.pattern, isCorrect: true },
      ...distractors.map(d => ({ pattern: d, isCorrect: false })),
    ]);
    const item = c.pattern.cloze[c.itemIndex];
    return { type: 'cloze', pattern: c.pattern, itemIndex: c.itemIndex, item, options, answer: null };
  }
  if (c.kind === 'scramble') {
    const item = c.pattern.scramble[c.itemIndex];
    const displayTokens = shuffle(item.tokens.map((text, idx) => ({ text, idx })));
    const arrangement = new Array(item.tokens.length).fill(null);
    return { type: 'scramble', pattern: c.pattern, itemIndex: c.itemIndex, item, displayTokens, arrangement, answer: null };
  }
  return null;
}

function buildSession() {
  const c = cfg();
  const all = [];
  if (c.sources.verb)    all.push(...collectVerbCandidates());
  if (c.sources.grammar) all.push(...collectGrammarCandidates());
  if (all.length === 0) return null;
  const picked = [];
  const shuffled = shuffle(all);
  if (shuffled.length >= c.count) {
    picked.push(...shuffled.slice(0, c.count));
  } else {
    // 候选不够 → 把现有的全收 + 重洗补到 count
    picked.push(...shuffled);
    while (picked.length < c.count) {
      const more = shuffle(all);
      picked.push(...more.slice(0, c.count - picked.length));
    }
  }
  return {
    questions: picked.map(buildQuestion).filter(Boolean),
    currentIdx: 0,
    startedAt: Date.now(),
  };
}

/* ============================================================
   作答 → 写回原模块统计
   ============================================================ */
function recordToParentModule(q) {
  if (q.type === 'verb') {
    State.logAnswer('verb', q.answer.correct, { conj: q.target, type: q.word.type });
    const m = State.get().modules.verb;
    State.bumpWeight(m.weight, q.word.dict + '|' + q.target, q.answer.correct);
    if (!q.answer.correct) {
      State.pushMistake('verb', { wordDict: q.word.dict, target: q.target, userAns: q.answer.userValue });
    } else {
      m.mistakes = m.mistakes.filter(mk => !(mk.wordDict === q.word.dict && mk.target === q.target));
    }
  } else {
    const mode = q.type;  // 'cloze' | 'scramble'
    State.logAnswer('grammar', q.answer.correct, { group: q.pattern.group, mode });
    const m = State.get().modules.grammar;
    State.bumpWeight(m.weight, q.pattern.id + '|' + mode, q.answer.correct);
    if (!q.answer.correct) {
      State.pushMistake('grammar', { patternId: q.pattern.id, mode, itemIndex: q.itemIndex });
    } else {
      m.mistakes = m.mistakes.filter(mk =>
        !(mk.patternId === q.pattern.id && mk.mode === mode && mk.itemIndex === q.itemIndex));
    }
  }
  State.save();
}

function submitCurrent() {
  if (!session) return;
  const q = session.questions[session.currentIdx];
  if (!q || q.answer) return;
  if (q.type === 'verb') {
    const inp = rootEl && rootEl.querySelector('#test-input');
    if (!inp) return;
    const userValue = inp.value;
    if (!Engine.normalize(userValue)) { inp.focus(); return; }
    const correct = checkAnswer(userValue, q.word, q.target);
    q.answer = { correct, userValue, ts: Date.now() };
  } else if (q.type === 'cloze') {
    if (userPick == null) return;
    const correct = !!q.options[userPick].isCorrect;
    q.answer = { correct, userValue: userPick, ts: Date.now() };
  } else if (q.type === 'scramble') {
    if (q.arrangement.some(x => x == null)) return;
    const correct = q.arrangement.every((tokIdx, i) => tokIdx === i);
    q.answer = { correct, userValue: q.arrangement.slice(), ts: Date.now() };
  }
  recordToParentModule(q);
  userPick = null;
  if (session.currentIdx >= session.questions.length - 1) {
    finishSession();
  } else {
    session.currentIdx++;
    render();
    App.refreshStatus();
  }
}

function finishSession() {
  stage = STAGE_DONE;
  State.get().modules.test.lastResult = summarize();
  State.save();
  render();
  App.refreshStatus();
}

function summarize() {
  const qs = session.questions;
  const total = qs.length;
  const correct = qs.filter(q => q.answer && q.answer.correct).length;
  const verb  = qs.filter(q => q.type === 'verb');
  const cloze = qs.filter(q => q.type === 'cloze');
  const scram = qs.filter(q => q.type === 'scramble');
  return {
    total, correct,
    verbTotal: verb.length,  verbOk:  verb.filter(q  => q.answer && q.answer.correct).length,
    clozeTotal: cloze.length, clozeOk: cloze.filter(q => q.answer && q.answer.correct).length,
    scramTotal: scram.length, scramOk: scram.filter(q => q.answer && q.answer.correct).length,
    finishedAt: Date.now(),
    durationMs: Date.now() - session.startedAt,
  };
}

/* ============================================================
   渲染
   ============================================================ */
function render() {
  if (!rootEl) return;
  if (stage === STAGE_IDLE)         renderIdle();
  else if (stage === STAGE_RUNNING) renderRunning();
  else                              renderDone();
}

/* ====================== Idle (配置) ====================== */
function renderIdle() {
  const c = cfg();
  const t = State.get().modules.test;
  const verbCount = c.sources.verb    ? collectVerbCandidates().length    : 0;
  const gramCount = c.sources.grammar ? collectGrammarCandidates().length : 0;
  const poolTotal = verbCount + gramCount;

  const lastHtml = t.lastResult ? `
    <div class="test-last">
      <div class="test-last-head">前回 <span class="en">Last Result</span></div>
      <div class="test-last-body">
        <span class="big">${t.lastResult.correct}<span class="slash"> / </span>${t.lastResult.total}</span>
        <span class="pct">${t.lastResult.total ? Math.round(t.lastResult.correct * 100 / t.lastResult.total) : 0}%</span>
        <span class="when">${new Date(t.lastResult.finishedAt).toLocaleString()}</span>
      </div>
    </div>` : '';

  rootEl.innerHTML = `
    <article class="card">
      <div class="card-meta">
        <div class="no">TEST <strong>· 試験</strong></div>
        <div class="right">設定 · Setup</div>
      </div>

      <div class="test-config">
        <div class="cfg-section">
          <div class="cfg-label">問題数 <span class="en">Question Count</span></div>
          <div class="cfg-chips" id="cfg-count"></div>
        </div>
        <div class="cfg-section">
          <div class="cfg-label">出題範囲 <span class="en">Sources</span></div>
          <div class="cfg-chips" id="cfg-sources"></div>
          <div class="cfg-hint">
            沿用 動詞 / 文型 模块的筛选設定 · 当前候选 <strong id="pool-total">${poolTotal}</strong> 道
          </div>
        </div>
      </div>

      <div class="test-start-row">
        <button class="next-btn" id="test-start" type="button" ${poolTotal === 0 ? 'disabled' : ''}>
          開始<span class="arrow">→</span>
        </button>
      </div>

      ${lastHtml}
    </article>
  `;

  // 题数 chips
  const ccEl = rootEl.querySelector('#cfg-count');
  COUNT_OPTIONS.forEach(n => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'q-chip' + (c.count === n ? ' active' : '');
    b.textContent = String(n);
    b.addEventListener('click', () => {
      c.count = n;
      State.save();
      ccEl.querySelectorAll('.q-chip').forEach(x => x.classList.toggle('active', +x.textContent === n));
    });
    ccEl.appendChild(b);
  });

  // 来源 chips
  const csEl = rootEl.querySelector('#cfg-sources');
  const sourceMeta = [
    ['verb',    '動詞', () => collectVerbCandidates().length],
    ['grammar', '文型', () => collectGrammarCandidates().length],
  ];
  sourceMeta.forEach(([k, label, getCnt]) => {
    const cnt = getCnt();
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'q-chip' + (c.sources[k] ? ' active' : '');
    b.innerHTML = `${label} <span class="cnt">${cnt}</span>`;
    b.addEventListener('click', () => {
      c.sources[k] = !c.sources[k];
      b.classList.toggle('active', c.sources[k]);
      State.save();
      const newTotal = sourceMeta.reduce((s, [kk, , gc]) => s + (c.sources[kk] ? gc() : 0), 0);
      const totalEl = rootEl.querySelector('#pool-total');
      if (totalEl) totalEl.textContent = newTotal;
      const startBtn = rootEl.querySelector('#test-start');
      if (startBtn) startBtn.disabled = newTotal === 0;
    });
    csEl.appendChild(b);
  });

  const startBtn = rootEl.querySelector('#test-start');
  if (startBtn) startBtn.addEventListener('click', startSession);
}

function startSession() {
  session = buildSession();
  if (!session) return;
  stage = STAGE_RUNNING;
  userPick = null;
  render();
  App.refreshStatus();
}

/* ====================== Running (作答) ====================== */
function renderRunning() {
  const q = session.questions[session.currentIdx];
  const i = session.currentIdx;
  const total = session.questions.length;
  const pct = Math.round((i / total) * 100);
  const kind = q.type === 'verb' ? '動詞活用' : q.type === 'cloze' ? '穴埋め' : '並べ替え';

  const meta = `
    <div class="card-meta">
      <div class="no">${String(i + 1).padStart(2, '0')}<strong> · ${total}</strong></div>
      <div class="right">${kind}</div>
    </div>
    <div class="test-progress" aria-hidden="true"><div class="test-progress-bar" style="width:${pct}%"></div></div>
  `;
  let body = '';
  if (q.type === 'verb')          body = renderVerbQ(q);
  else if (q.type === 'cloze')    body = renderClozeQ(q);
  else                            body = renderScrambleQ(q);

  rootEl.innerHTML = `<article class="card">${meta}${body}</article>`;
  bindRunningEvents(q);
}

function renderVerbQ(q) {
  const s = State.get();
  const word = q.word;
  const wordHtml = s.ui.furigana ? withRuby(word.dict, word.kana) : escapeHtml(word.dict);
  return `
    <div class="target-row">
      <span class="line"></span>
      <span class="target">${CONJ_LABEL[q.target]}</span>
      <span class="line"></span>
    </div>
    <div class="use-text empty">&nbsp;</div>
    <div class="hero">
      <div class="q-word">${wordHtml}</div>
      <div class="q-zh ${s.ui.showZh ? '' : 'empty'}">${escapeHtml(word.zh || ' ')}</div>
    </div>
    <div class="answer-row">
      <div class="input-shell">
        <div class="input-side">答</div>
        <input id="test-input" type="text" inputmode="text" autocomplete="off"
               autocapitalize="off" autocorrect="off" spellcheck="false"
               enterkeyhint="next"
               placeholder="活用形を入力">
        <button class="submit-btn" id="test-submit" type="button">次へ<span class="arrow">→</span></button>
      </div>
      <div class="kbd-hint"><span class="kbd">Enter</span> · 次へ</div>
    </div>
  `;
}

function renderClozeQ(q) {
  const sentHtml = escapeHtml(q.item.sentence).replaceAll('___',
    '<span class="blank">　　　　</span>');
  let optsHtml = '';
  q.options.forEach((opt, i) => {
    const cls = i === userPick ? 'selected' : '';
    const checked = i === userPick ? 'true' : 'false';
    optsHtml += `
      <button class="choice ${cls}" data-i="${i}" type="button"
              role="radio" aria-checked="${checked}">
        <span class="marker">${'ABCD'[i]}.</span>${escapeHtml(opt.pattern.pattern)}
      </button>`;
  });
  return `
    <div class="grammar-stem">${sentHtml}</div>
    <div class="grammar-zh">${escapeHtml(q.item.zh || '')}</div>
    <div class="choices" role="radiogroup">${optsHtml}</div>
    <div class="next-row">
      <button class="submit-btn" id="test-submit" type="button" ${userPick == null ? 'disabled' : ''}>
        次へ<span class="arrow">→</span>
      </button>
    </div>
    <div class="kbd-hint"><span class="kbd">Enter</span> · 次へ</div>
  `;
}

function renderScrambleQ(q) {
  const slotsHtml = q.arrangement.map((tokIdx, i) => {
    if (tokIdx == null) {
      return `<button class="slot empty" data-slot="${i}" data-idx="${i+1}" type="button"></button>`;
    }
    return `<button class="slot filled" data-slot="${i}" type="button">${escapeHtml(q.item.tokens[tokIdx])}</button>`;
  }).join('');
  const bankHtml = q.displayTokens.map(t => {
    const used = q.arrangement.includes(t.idx);
    return `<button class="token ${used ? 'used' : ''}" data-bank="${t.idx}" type="button">${escapeHtml(t.text)}</button>`;
  }).join('');
  const allFilled = q.arrangement.every(x => x != null);
  return `
    <div class="scramble-zh">${escapeHtml(q.item.zh || '')}</div>
    <div class="slots">${slotsHtml}</div>
    <div class="token-bank">${bankHtml}</div>
    <div class="scramble-buttons">
      <button class="btn-secondary" id="test-clear" type="button">クリア</button>
      <button class="submit-btn" id="test-submit" type="button" ${allFilled ? '' : 'disabled'}>
        次へ<span class="arrow">→</span>
      </button>
    </div>
  `;
}

function bindRunningEvents(q) {
  if (q.type === 'verb') {
    const inp = rootEl.querySelector('#test-input');
    if (inp) {
      setTimeout(() => inp.focus(), 30);
      inp.addEventListener('keydown', e => {
        // IME 转换中 Enter 是「确认变换」而非提交
        if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) {
          e.preventDefault(); submitCurrent();
        }
      });
    }
    const sub = rootEl.querySelector('#test-submit');
    if (sub) sub.addEventListener('click', submitCurrent);
    return;
  }
  if (q.type === 'cloze') {
    rootEl.querySelectorAll('.choice').forEach(btn => {
      btn.addEventListener('click', () => {
        userPick = +btn.dataset.i;
        rootEl.querySelectorAll('.choice').forEach(b => {
          b.classList.remove('selected');
          b.setAttribute('aria-checked', 'false');
        });
        btn.classList.add('selected');
        btn.setAttribute('aria-checked', 'true');
        const sub = rootEl.querySelector('#test-submit');
        if (sub) sub.disabled = false;
      });
    });
    const sub = rootEl.querySelector('#test-submit');
    if (sub) sub.addEventListener('click', submitCurrent);
    return;
  }
  // scramble
  rootEl.querySelectorAll('.token').forEach(t => {
    t.addEventListener('click', () => {
      if (t.classList.contains('used')) return;
      const tokIdx = +t.dataset.bank;
      const arr = q.arrangement;
      const slotI = arr.findIndex(x => x == null);
      if (slotI < 0) return;
      arr[slotI] = tokIdx;
      render();
    });
  });
  rootEl.querySelectorAll('.slot.filled').forEach(s => {
    s.addEventListener('click', () => {
      q.arrangement[+s.dataset.slot] = null;
      render();
    });
  });
  const sub = rootEl.querySelector('#test-submit');
  if (sub) sub.addEventListener('click', submitCurrent);
  const cb = rootEl.querySelector('#test-clear');
  if (cb) cb.addEventListener('click', () => {
    q.arrangement.fill(null);
    render();
  });
}

/* ====================== Done (成绩单) ====================== */
function renderDone() {
  if (!session) {
    stage = STAGE_IDLE;
    render();
    return;
  }
  const sum = summarize();
  const pct = sum.total ? Math.round(sum.correct * 100 / sum.total) : 0;
  const pctCls = pct < 60 ? 'bad' : pct < 85 ? 'mid' : 'good';

  const breakdownCells = [];
  if (sum.verbTotal)  breakdownCells.push(['動詞',  sum.verbOk,  sum.verbTotal]);
  if (sum.clozeTotal) breakdownCells.push(['穴埋め', sum.clozeOk, sum.clozeTotal]);
  if (sum.scramTotal) breakdownCells.push(['並べ替え', sum.scramOk, sum.scramTotal]);
  const breakdownHtml = breakdownCells.length ? `
    <div class="test-breakdown">
      ${breakdownCells.map(([lbl, ok, t]) => {
        const p = t ? Math.round(ok * 100 / t) : 0;
        const cls = p < 60 ? 'bad' : p < 85 ? 'mid' : 'good';
        return `<div class="bd-cell">
          <div class="bd-label">${lbl}</div>
          <div class="bd-val">${ok}<span class="slash"> / </span>${t}</div>
          <div class="bd-pct ${cls}">${p}%</div>
        </div>`;
      }).join('')}
    </div>` : '';

  const reviewRows = session.questions.map((q, i) => {
    const ok = !!(q.answer && q.answer.correct);
    const cls = ok ? 'correct' : 'wrong';
    const stamp = ok ? '正' : '誤';
    let label = '', your = '', ans = '';
    if (q.type === 'verb') {
      label = `<span class="rr-type">VERB</span>${escapeHtml(q.word.dict)} → ${CONJ_LABEL[q.target]}`;
      ans = escapeHtml(conjugate(q.word, q.target) || '');
      const kn = conjugateKana(q.word, q.target);
      if (kn && kn !== conjugate(q.word, q.target)) ans += `<span class="kana-aux">${escapeHtml(kn)}</span>`;
      your = q.answer ? escapeHtml(q.answer.userValue) : '—';
    } else if (q.type === 'cloze') {
      label = `<span class="rr-type">CLOZE</span>${escapeHtml(q.pattern.pattern)}`;
      ans = escapeHtml(q.pattern.pattern);
      const chosen = (q.answer && q.options[q.answer.userValue]) || null;
      your = chosen ? escapeHtml(chosen.pattern.pattern) : '—';
    } else {
      label = `<span class="rr-type">SCRAMBLE</span>${escapeHtml(q.pattern.pattern)}`;
      ans = escapeHtml(q.item.tokens.join(''));
      your = q.answer
        ? escapeHtml(q.answer.userValue.map(idx => q.item.tokens[idx]).join(''))
        : '—';
    }
    return `
      <div class="test-result-row ${cls}">
        <div class="rr-head">
          <span class="rr-num">${String(i+1).padStart(2,'0')}</span>
          <span class="rr-stamp ${cls}">${stamp}</span>
          <span class="rr-label">${label}</span>
        </div>
        ${ok ? '' : `<div class="rr-detail">
          <div class="rr-line"><span class="rr-lbl">你的回答</span><code class="rr-your">${your}</code></div>
          <div class="rr-line"><span class="rr-lbl">正解</span><code class="rr-ans">${ans}</code></div>
        </div>`}
      </div>
    `;
  }).join('');

  const mins = Math.floor(sum.durationMs / 60000);
  const secs = Math.floor((sum.durationMs % 60000) / 1000);
  const durStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  rootEl.innerHTML = `
    <article class="card">
      <div class="card-meta">
        <div class="no">RESULT <strong>· 結果</strong></div>
        <div class="right">${durStr}</div>
      </div>

      <div class="test-score">
        <div class="score-pct ${pctCls}">${pct}<span class="unit">%</span></div>
        <div class="score-sub">${sum.correct} <span class="slash">/</span> ${sum.total} 正解</div>
      </div>

      ${breakdownHtml}

      <div class="section">
        <div class="section-head">
          <span class="glyph">明</span>
          <span class="glyph-en">Detail</span>
          <span class="line"></span>
        </div>
        <div class="test-result-list">${reviewRows}</div>
      </div>

      <div class="test-end-buttons">
        <button class="btn-secondary" id="test-restart" type="button">設定へ戻る</button>
        <button class="next-btn" id="test-again" type="button">もう一度<span class="arrow">→</span></button>
      </div>
    </article>
  `;

  const rb = rootEl.querySelector('#test-restart');
  if (rb) rb.addEventListener('click', () => {
    stage = STAGE_IDLE;
    session = null;
    userPick = null;
    render();
    App.refreshStatus();
  });
  const ab = rootEl.querySelector('#test-again');
  if (ab) ab.addEventListener('click', () => {
    startSession();
  });
}

/* ============================================================
   模块契约
   ============================================================ */
function mount(root) {
  rootEl = root;
  render();
}
function unmount() {
  rootEl = null;
  // session / stage / userPick 全部保留：切换模块不丢测试进度
}
function getStats() {
  const t = State.get().modules.test;
  if (stage === STAGE_RUNNING && session) {
    const done = session.questions.slice(0, session.currentIdx).filter(q => q.answer);
    const ok = done.filter(q => q.answer.correct).length;
    return {
      answered: done.length, correct: ok, streak: 0, mistakes: 0,
      _phase: 'running', _idx: session.currentIdx, _total: session.questions.length,
    };
  }
  if (stage === STAGE_DONE && session) {
    return {
      answered: session.questions.length,
      correct: session.questions.filter(q => q.answer && q.answer.correct).length,
      streak: 0, mistakes: 0, _phase: 'done',
    };
  }
  if (t.lastResult) {
    return { answered: t.lastResult.total, correct: t.lastResult.correct, streak: 0, mistakes: 0, _phase: 'idle' };
  }
  return { answered: 0, correct: 0, streak: 0, mistakes: 0, _phase: 'idle' };
}
function handleGlobalEnter() {
  if (stage !== STAGE_RUNNING || !session) return false;
  const q = session.questions[session.currentIdx];
  if (!q || q.answer) return false;
  // verb：input 自己的 keydown 已处理（且全局 handler 跳过 INPUT 焦点）
  if (q.type === 'cloze' && userPick != null) { submitCurrent(); return true; }
  if (q.type === 'scramble' && q.arrangement.every(x => x != null)) { submitCurrent(); return true; }
  return false;
}

global.ModuleTest = {
  id: 'test',
  label: '試験',
  labelEn: 'Test',
  mount, unmount, getStats,
  handleGlobalEnter,
  hasFeedback: () => false,
};

})(window);
