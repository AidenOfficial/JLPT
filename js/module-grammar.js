/* ============================================================
   N2 文型模块
   暴露：window.ModuleGrammar
   ------------------------------------------------------------
   题型：
   - cloze    穴埋め辨析（句子挖空，4 选 1，干扰项从同 cluster 抽）
   - scramble 並べ替え（token bank 点击填入 slot；全填后判正确顺序）
   ============================================================ */
(function(global){
'use strict';

const { escapeHtml, shuffle, weightedPick } = global.UI;
const GRAMMAR = global.GRAMMAR || [];
const GROUPS  = global.GRAMMAR_GROUPS || [];
const GROUP_LABEL = Object.fromEntries(GROUPS.map(g => [g.id, g.label]));
const MODES = {
  cloze:    { label: '穴埋め',   en: 'Cloze' },
  scramble: { label: '並べ替え', en: 'Reorder' },
};

let rootEl   = null;
let currentQ = null;        // { pattern, mode, item, itemIndex, options?, displayTokens? }
let feedback = null;
let forcedNext = null;
// scramble 用：
let arrangement = [];       // 长度 = tokens.length，元素是 token index 或 null
let userPick = null;        // cloze 用户选择的 patternId

function patternById(id) { return GRAMMAR.find(g => g.id === id); }

/* ============================================================
   辨析干扰项：同 cluster 抽 3，不够则从其他 cluster 补
   ============================================================ */
function pickDistractors(correct, n) {
  n = n || 3;
  const same = shuffle(GRAMMAR.filter(g => g.cluster === correct.cluster && g.id !== correct.id));
  const distractors = same.slice(0, n);
  if (distractors.length < n) {
    const others = shuffle(GRAMMAR.filter(g => g.cluster !== correct.cluster && g.id !== correct.id));
    for (const o of others) {
      if (distractors.length >= n) break;
      distractors.push(o);
    }
  }
  return distractors;
}

/* ============================================================
   出题
   ============================================================ */
function pickNext() {
  const s = State.get();
  const m = s.modules.grammar;
  const groups = Object.keys(m.groups).filter(g => m.groups[g]);
  const modes  = Object.keys(m.modes).filter(md => m.modes[md]);
  if (!groups.length || !modes.length) return null;

  const validPatterns = GRAMMAR.filter(p => groups.includes(p.group));
  if (!validPatterns.length) return null;

  // 候选 (pattern, mode) 对
  const items = [];
  for (const p of validPatterns) for (const mode of modes) {
    const arr = mode === 'cloze' ? (p.cloze || []) : (p.scramble || []);
    if (!arr.length) continue;
    items.push({ pattern: p, mode });
  }
  if (!items.length) return null;

  // 错题优先
  if (s.ui.mistakeOnly && m.mistakes.length > 0) {
    const cands = m.mistakes.filter(mk =>
      modes.includes(mk.mode) &&
      validPatterns.some(p => p.id === mk.patternId));
    if (cands.length > 0) {
      const mk = cands[Math.floor(Math.random() * cands.length)];
      const p = patternById(mk.patternId);
      return buildQuestion(p, mk.mode, mk.itemIndex);
    }
  }

  const pickedPair = weightedPick(items, it => m.weight[it.pattern.id + '|' + it.mode] || 1);
  return buildQuestion(pickedPair.pattern, pickedPair.mode);
}

function buildQuestion(pattern, mode, itemIndex) {
  const arr = mode === 'cloze' ? pattern.cloze : pattern.scramble;
  if (itemIndex == null) itemIndex = Math.floor(Math.random() * arr.length);
  const item = arr[itemIndex];

  if (mode === 'cloze') {
    const distractors = pickDistractors(pattern, 3);
    const options = shuffle([
      { pattern, isCorrect: true },
      ...distractors.map(d => ({ pattern: d, isCorrect: false })),
    ]);
    return { pattern, mode, item, itemIndex, options };
  } else {
    // scramble：打乱显示顺序
    const displayTokens = shuffle(item.tokens.map((text, idx) => ({ text, idx })));
    arrangement = new Array(item.tokens.length).fill(null);
    return { pattern, mode, item, itemIndex, displayTokens };
  }
}

/* ============================================================
   答题
   ============================================================ */
function submitCloze() {
  if (!currentQ || userPick == null) return;
  const correct = currentQ.options[userPick].isCorrect;
  recordResult(correct);
  feedback = { correct, pickedIndex: userPick };
  State.save();
  render();
  App.refreshStatus();
}

function submitScramble() {
  if (!currentQ) return;
  if (arrangement.some(x => x == null)) return;
  // arrangement[i] 应该等于 i（tokens 原本就是按正确顺序排列的）
  const correct = arrangement.every((tokIdx, i) => tokIdx === i);
  recordResult(correct);
  feedback = { correct, arrangement: arrangement.slice() };
  State.save();
  render();
  App.refreshStatus();
}

function recordResult(correct) {
  const s = State.get();
  const m = s.modules.grammar;
  const key = currentQ.pattern.id + '|' + currentQ.mode;
  State.logAnswer('grammar', correct, { group: currentQ.pattern.group, mode: currentQ.mode });
  State.bumpWeight(m.weight, key, correct);
  if (!correct) {
    State.pushMistake('grammar', {
      patternId: currentQ.pattern.id,
      mode: currentQ.mode,
      itemIndex: currentQ.itemIndex,
    });
  } else {
    // 答对：清掉同一题的错题记录
    m.mistakes = m.mistakes.filter(mk =>
      !(mk.patternId === currentQ.pattern.id &&
        mk.mode === currentQ.mode &&
        mk.itemIndex === currentQ.itemIndex));
  }
}

function nextQuestion() {
  if (forcedNext) {
    currentQ = buildQuestion(patternById(forcedNext.patternId), forcedNext.mode, forcedNext.itemIndex);
    forcedNext = null;
  } else {
    currentQ = pickNext();
  }
  feedback = null;
  userPick = null;
  render();
  App.refreshStatus();
}

function startReviewMistake(m) {
  if (!patternById(m.patternId)) return false;
  forcedNext = m;
  if (!rootEl) return true;
  nextQuestion();
  return true;
}

/* ============================================================
   渲染
   ============================================================ */
function render() {
  if (!rootEl) return;
  if (!currentQ) currentQ = pickNext();
  if (!currentQ) {
    rootEl.innerHTML = `
      <article class="card">
        <div class="empty-state">
          <span class="glyph">○</span>
          没有符合筛选的文型<br>
          <span style="font-family:var(--font-latin);font-style:italic;font-size:11px;color:var(--text-faint);letter-spacing:0.18em;">PLEASE ADJUST FILTERS</span>
        </div>
      </article>`;
    return;
  }
  const m = State.get().modules.grammar;
  const meta = `
    <div class="card-meta">
      <div class="no">No.<strong>${String(m.answered + 1).padStart(3, '0')}</strong></div>
      <div class="right">${GROUP_LABEL[currentQ.pattern.group] || ''} · ${currentQ.pattern.level || 'N2'}</div>
    </div>
    <div class="target-row">
      <span class="line"></span>
      <span class="target">${MODES[currentQ.mode].label}</span>
      <span class="line"></span>
    </div>
    <div class="use-text">${escapeHtml(MODES[currentQ.mode].en)}</div>
  `;
  let body = '';
  if (currentQ.mode === 'cloze') body = renderCloze();
  else                            body = renderScramble();
  rootEl.innerHTML = `<article class="card">${meta}${body}</article>`;
  bindEvents();
}

/* ====================== Cloze 渲染 ====================== */
function renderCloze() {
  const { pattern, item, options } = currentQ;
  // 把 ___ 替换成 blank 占位（配对文型如 やら〜やら / にしろ〜にせよ 等会有 2 个 ___）
  let sentHtml;
  if (!feedback) {
    sentHtml = escapeHtml(item.sentence).replaceAll('___',
      '<span class="blank">　　　　</span>');
  } else {
    // 用 pattern 填上空（高亮）— 多 ___ 时所有空均填入同一文型
    const filled = `<span class="blank filled">${escapeHtml(pattern.pattern.replace(/^〜/, ''))}</span>`;
    sentHtml = escapeHtml(item.sentence).replaceAll('___', filled);
  }

  let optsHtml = '';
  options.forEach((opt, i) => {
    let cls = '';
    let ann = '';
    if (feedback) {
      if (opt.isCorrect) cls = 'correct';
      else if (i === userPick) cls = 'wrong-pick';
      ann = `<span class="ann">${escapeHtml(opt.pattern.meaning_zh || '')}</span>`;
    } else if (i === userPick) {
      cls = 'selected';
    }
    optsHtml += `
      <button class="choice ${cls}" data-i="${i}" type="button" ${feedback ? 'disabled' : ''}>
        <span class="marker">${'ABCD'[i]}.</span>${escapeHtml(opt.pattern.pattern)}
        ${ann}
      </button>`;
  });

  let html = `
    <div class="grammar-stem">${sentHtml}</div>
    <div class="grammar-zh">${escapeHtml(item.zh || '')}</div>
    <div class="choices">${optsHtml}</div>
  `;

  if (!feedback) {
    html += `
      <div class="next-row">
        <button class="submit-btn" id="submit-btn" type="button" ${userPick==null ? 'disabled' : ''}>
          解答<span class="arrow">→</span>
        </button>
      </div>
    `;
  } else {
    html += renderClozeFeedback();
  }
  return html;
}

function renderClozeFeedback() {
  const { pattern, options } = currentQ;
  const cls = feedback.correct ? 'correct' : 'wrong';
  const stamp = feedback.correct ? '正' : '誤';
  const verdict = feedback.correct ? '正解' : '不正解';
  const verdictEn = feedback.correct ? 'Correct' : 'Incorrect';

  // 簇辨析对比表
  let clusterRows = '';
  const all = [pattern, ...options.filter(o => !o.isCorrect).map(o => o.pattern)];
  // 去重
  const seen = new Set();
  const uniq = all.filter(p => seen.has(p.id) ? false : (seen.add(p.id), true));
  uniq.forEach(p => {
    const hi = p.id === pattern.id ? 'hi' : '';
    clusterRows += `
      <div class="cluster-row ${hi}">
        <div class="pat">${escapeHtml(p.pattern)}</div>
        <div class="nuance">${escapeHtml(p.nuance_zh || p.meaning_zh || '')}</div>
      </div>`;
  });

  // 示例（来自当前 pattern）
  const exHtml = (pattern.examples || []).slice(0, 2).map(e =>
    `<div class="ex"><span class="to">${escapeHtml(e.jp)}</span></div>
     <div class="grammar-zh" style="margin-top:2px;margin-bottom:10px;padding-left:0;">${escapeHtml(e.zh)}</div>`
  ).join('');

  return `
    <div class="feedback ${cls}">
      <div class="fb-head">
        <div class="fb-stamp">${stamp}</div>
        <div class="fb-verdict-text">
          <div class="fb-verdict">${verdict}</div>
          <div class="fb-verdict-en">${verdictEn}</div>
        </div>
      </div>
      <div class="fb-answer">${escapeHtml(pattern.pattern)}</div>
      <div class="fb-rule">
<strong>接续：</strong>${escapeHtml(pattern.setsuzoku || '')}
<strong>含义：</strong>${escapeHtml(pattern.meaning_zh || '')}
<strong>语感：</strong>${escapeHtml(pattern.nuance_zh || '')}
      </div>

      <div class="cluster-table">
        <h4>Cluster · 簇内辨析</h4>
        ${clusterRows}
      </div>

      ${exHtml ? `
      <div class="section">
        <div class="section-head">
          <span class="glyph">例</span>
          <span class="glyph-en">Examples</span>
          <span class="line"></span>
        </div>
        ${exHtml}
      </div>` : ''}
    </div>
    <div class="next-row">
      <button class="next-btn" id="next-btn" type="button">次へ<span class="arrow">→</span></button>
    </div>
    <div class="kbd-hint"><span class="kbd">Enter</span> · 继续</div>
  `;
}

/* ====================== Scramble 渲染 ====================== */
function renderScramble() {
  const { pattern, item, displayTokens } = currentQ;
  const slotsHtml = arrangement.map((tokIdx, i) => {
    if (tokIdx == null) {
      return `<button class="slot empty" data-slot="${i}" data-idx="${i+1}" type="button"></button>`;
    }
    let cls = 'filled';
    if (feedback) cls = (tokIdx === i) ? 'correct' : 'wrong';
    return `<button class="slot ${cls}" data-slot="${i}" type="button">${escapeHtml(item.tokens[tokIdx])}</button>`;
  }).join('');

  const bankHtml = displayTokens.map(t => {
    const used = arrangement.includes(t.idx);
    return `<button class="token ${used ? 'used' : ''}" data-bank="${t.idx}" type="button">${escapeHtml(t.text)}</button>`;
  }).join('');

  let html = `
    <div class="scramble-zh">${escapeHtml(item.zh || '')}</div>
    <div class="slots">${slotsHtml}</div>
    <div class="token-bank">${bankHtml}</div>
  `;

  if (!feedback) {
    const allFilled = arrangement.every(x => x != null);
    html += `
      <div class="scramble-buttons">
        <button class="btn-secondary" id="reset-btn" type="button">クリア</button>
        <button class="submit-btn" id="submit-btn" type="button" ${allFilled ? '' : 'disabled'}>
          解答<span class="arrow">→</span>
        </button>
      </div>
    `;
  } else {
    const cls = feedback.correct ? 'correct' : 'wrong';
    const stamp = feedback.correct ? '正' : '誤';
    const verdict = feedback.correct ? '正解' : '不正解';
    const verdictEn = feedback.correct ? 'Correct' : 'Incorrect';
    const correctSentence = item.tokens.join('');
    html += `
      <div class="feedback ${cls}">
        <div class="fb-head">
          <div class="fb-stamp">${stamp}</div>
          <div class="fb-verdict-text">
            <div class="fb-verdict">${verdict}</div>
            <div class="fb-verdict-en">${verdictEn}</div>
          </div>
        </div>
        <div class="fb-answer">${escapeHtml(correctSentence)}</div>
        <div class="fb-rule">
<strong>核心文型：</strong>${escapeHtml(pattern.pattern)}
<strong>接续：</strong>${escapeHtml(pattern.setsuzoku || '')}
<strong>含义：</strong>${escapeHtml(pattern.meaning_zh || '')}
<strong>语感：</strong>${escapeHtml(pattern.nuance_zh || '')}
        </div>
      </div>
      <div class="next-row">
        <button class="next-btn" id="next-btn" type="button">次へ<span class="arrow">→</span></button>
      </div>
      <div class="kbd-hint"><span class="kbd">Enter</span> · 继续</div>
    `;
  }
  return html;
}

/* ============================================================
   事件绑定 — 局部，不引发上层重渲
   ============================================================ */
function bindEvents() {
  if (currentQ.mode === 'cloze' && !feedback) {
    rootEl.querySelectorAll('.choice').forEach(btn => {
      btn.addEventListener('click', e => {
        const i = +btn.dataset.i;
        userPick = i;
        // 局部更新 selected class
        rootEl.querySelectorAll('.choice').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        const sub = rootEl.querySelector('#submit-btn');
        if (sub) sub.disabled = false;
      });
    });
    const sub = rootEl.querySelector('#submit-btn');
    if (sub) sub.addEventListener('click', submitCloze);
  }
  if (currentQ.mode === 'scramble' && !feedback) {
    rootEl.querySelectorAll('.token').forEach(t => {
      t.addEventListener('click', e => {
        if (t.classList.contains('used')) return;
        const tokIdx = +t.dataset.bank;
        // 找第一个空 slot
        const slotI = arrangement.findIndex(x => x == null);
        if (slotI < 0) return;
        arrangement[slotI] = tokIdx;
        render();
      });
    });
    rootEl.querySelectorAll('.slot.filled').forEach(s => {
      s.addEventListener('click', () => {
        const slotI = +s.dataset.slot;
        arrangement[slotI] = null;
        render();
      });
    });
    const sub = rootEl.querySelector('#submit-btn');
    if (sub) sub.addEventListener('click', submitScramble);
    const rb = rootEl.querySelector('#reset-btn');
    if (rb) rb.addEventListener('click', () => {
      arrangement = arrangement.map(() => null);
      render();
    });
  }
  const nx = rootEl.querySelector('#next-btn');
  if (nx) {
    setTimeout(() => nx.focus(), 30);
    nx.addEventListener('click', nextQuestion);
  }
}

function mount(root) {
  rootEl = root;
  // 来自错题复习的强制下题
  if (forcedNext) {
    currentQ = buildQuestion(patternById(forcedNext.patternId), forcedNext.mode, forcedNext.itemIndex);
    forcedNext = null;
    feedback = null;
    userPick = null;
  } else if (!currentQ) {
    currentQ = pickNext();
  }
  render();
}
function unmount() {
  rootEl = null;
  // 状态全部保留：切换模块不丢答题进度
}
function getStats() {
  const m = State.get().modules.grammar;
  return {
    answered: m.answered, correct: m.correct, streak: m.streak,
    mistakes: m.mistakes.length,
  };
}
function handleGlobalEnter() {
  if (feedback) { nextQuestion(); return true; }
  return false;
}

global.ModuleGrammar = {
  id: 'grammar',
  label: '文型',
  labelEn: 'Grammar',
  mount, unmount, getStats,
  startReviewMistake,
  handleGlobalEnter,
  hasFeedback: () => !!feedback,
};

})(window);
