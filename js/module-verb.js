/* ============================================================
   动词活用模块
   暴露：window.ModuleVerb
   接口：{ id, label, labelEn, mount(root), unmount(), getStats(), startReviewMistake(m) }
   ============================================================ */
(function(global){
'use strict';

const { CONJ_LIST, CONJ_LABEL, CONJ_USE,
        conjugate, conjugateKana, acceptableAnswers, checkAnswer,
        ruleExplain, ruleGeneric } = global.Engine;
const { escapeHtml, withRuby, shuffle, weightedPick } = global.UI;

let rootEl = null;
let currentQ = null;        // { word, target }
let feedback = null;
let forcedNext = null;      // 来自错题复习模块

// 示例词池
const EXAMPLE_WORDS = {
  godan: [
    { dict:'飲む',  kana:'のむ' }, { dict:'書く',  kana:'かく' },
    { dict:'泳ぐ',  kana:'およぐ'}, { dict:'話す',  kana:'はなす' },
    { dict:'買う',  kana:'かう' }, { dict:'待つ',  kana:'まつ' },
    { dict:'取る',  kana:'とる' }, { dict:'遊ぶ',  kana:'あそぶ' },
    { dict:'死ぬ',  kana:'しぬ' },
  ],
  ichidan: [
    { dict:'食べる', kana:'たべる' },
    { dict:'見る',   kana:'みる' },
    { dict:'寝る',   kana:'ねる' },
  ],
  suru: [{ dict:'する', kana:'する' }],
  kuru: [{ dict:'来る', kana:'くる' }],
};
function getExamples(word, target) {
  const pool = shuffle((EXAMPLE_WORDS[word.type] || []).filter(e => e.dict !== word.dict));
  if (pool.length === 0) return [];
  if (word.type === 'godan') {
    const seen = new Set();
    const out = [];
    for (const ex of pool) {
      const last = ex.dict.slice(-1);
      if (seen.has(last)) continue;
      seen.add(last);
      const fake = Object.assign({}, ex, { type: 'godan' });
      out.push([ex.dict, conjugate(fake, target)]);
      if (out.length >= 2) break;
    }
    return out;
  }
  const ex = pool[0];
  const fake = Object.assign({}, ex, { type: word.type });
  return [[ex.dict, conjugate(fake, target)]];
}

function typeLabel(t) {
  return { godan:'五段', ichidan:'一段', suru:'三類(する)', kuru:'三類(来る)' }[t] || t;
}

/* ============================================================
   出题
   ============================================================ */
function pickNext() {
  const s = State.get();
  const m = s.modules.verb;
  const VERBS = global.VERBS;
  const pool = VERBS.filter(w => m.levels[w.level] && m.types[w.type]);
  const conjs = CONJ_LIST.filter(c => m.conjs[c.key]).map(c => c.key);
  if (pool.length === 0 || conjs.length === 0) return null;

  if (s.ui.mistakeOnly && m.mistakes.length > 0) {
    const cands = m.mistakes.filter(mk =>
      conjs.includes(mk.target) && pool.some(w => w.dict === mk.wordDict));
    if (cands.length > 0) {
      const mk = cands[Math.floor(Math.random() * cands.length)];
      const w = pool.find(v => v.dict === mk.wordDict);
      return { word: w, target: mk.target };
    }
  }

  const items = [];
  for (const w of pool) for (const t of conjs) {
    items.push({ word: w, target: t });
  }
  return weightedPick(items, it => m.weight[it.word.dict + '|' + it.target] || 1);
}

/* ============================================================
   答题
   ============================================================ */
function submitAnswer() {
  if (!currentQ) return;
  if (feedback) { nextQuestion(); return; }
  const inp = rootEl.querySelector('#answer-input');
  if (!inp) return;
  const userInput = inp.value;
  if (!Engine.normalize(userInput)) { inp.focus(); return; }

  const { word, target } = currentQ;
  const correct = checkAnswer(userInput, word, target);
  const expected = conjugate(word, target);
  const expectedKana = conjugateKana(word, target);

  const s = State.get();
  const m = s.modules.verb;
  State.logAnswer('verb', correct, { conj: target, type: word.type });
  State.bumpWeight(m.weight, word.dict + '|' + target, correct);
  if (!correct) {
    State.pushMistake('verb', { wordDict: word.dict, target, userAns: userInput });
  } else {
    // 答对时若错题集里存在则移除
    m.mistakes = m.mistakes.filter(mk => !(mk.wordDict === word.dict && mk.target === target));
  }

  feedback = {
    correct, expected,
    expectedKana: expectedKana && expectedKana !== expected ? expectedKana : null,
    userInput,
    rule: ruleExplain(word, target),
  };
  State.save();
  render();
  App.refreshStatus();
}

function nextQuestion() {
  if (forcedNext) {
    currentQ = forcedNext;
    forcedNext = null;
  } else {
    currentQ = pickNext();
  }
  feedback = null;
  render();
  App.refreshStatus();
}

function startReviewMistake(m) {
  const w = global.VERBS.find(v => v.dict === m.wordDict);
  if (!w) return false;
  forcedNext = { word: w, target: m.target };
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
          没有符合筛选的题目<br>
          <span style="font-family:var(--font-latin);font-style:italic;font-size:11px;color:var(--text-faint);letter-spacing:0.18em;">PLEASE ADJUST FILTERS</span>
        </div>
      </article>`;
    return;
  }

  const s = State.get();
  const m = s.modules.verb;
  const { word, target } = currentQ;
  const wordHtml = s.ui.furigana ? withRuby(word.dict, word.kana) : escapeHtml(word.dict);

  let html = `
    <article class="card">
      <div class="card-meta">
        <div class="no">No.<strong>${String(m.answered + 1).padStart(3, '0')}</strong></div>
        <div class="right">${typeLabel(word.type)} · ${word.level}</div>
      </div>

      <div class="target-row">
        <span class="line"></span>
        <span class="target">${CONJ_LABEL[target]}</span>
        <span class="line"></span>
      </div>
      <div class="use-text ${s.ui.showExamples ? '' : 'empty'}">${escapeHtml(CONJ_USE[target] || ' ')}</div>

      <div class="hero">
        <div class="q-word">${wordHtml}</div>
        <div class="q-zh ${s.ui.showZh ? '' : 'empty'}">${escapeHtml(word.zh || ' ')}</div>
      </div>
  `;

  if (!feedback && s.ui.showExamples) {
    const examples = getExamples(word, target);
    if (examples.length > 0) {
      const exHtml = examples.map(([from, to]) =>
        `<div class="ex"><span class="from">${escapeHtml(from)}</span><span class="arrow">→</span><span class="to">${escapeHtml(to)}</span></div>`
      ).join('');
      const rule = ruleGeneric(target, word.type);
      html += `
        <div class="section">
          <div class="section-head">
            <span class="glyph">例</span>
            <span class="glyph-en">Examples</span>
            <span class="line"></span>
          </div>
          <div class="examples">${exHtml}</div>
          <div class="rule-fold">
            <button class="rule-toggle" id="rule-toggle" type="button">
              <span class="caret">▶</span><span>Full Rule · 完整规则</span>
            </button>
            <div class="rule-content" id="rule-content">${escapeHtml(rule)}</div>
          </div>
        </div>
      `;
    }
  }

  if (!feedback) {
    html += `
      <div class="answer-row">
        <div class="input-shell">
          <div class="input-side">答</div>
          <input id="answer-input" type="text" inputmode="text" autocomplete="off"
                 autocapitalize="off" autocorrect="off" spellcheck="false"
                 placeholder="活用形を入力（汉字 or 仮名）">
          <button class="submit-btn" id="submit-btn" type="button">問<span class="arrow">→</span></button>
        </div>
        <div class="kbd-hint"><span class="kbd">Enter</span> · 提交</div>
      </div>
    `;
  } else {
    const cls = feedback.correct ? 'correct' : 'wrong';
    const stamp = feedback.correct ? '正' : '誤';
    const verdict = feedback.correct ? '正解' : '不正解';
    const verdictEn = feedback.correct ? 'Correct' : 'Incorrect';
    html += `
      <div class="feedback ${cls}">
        <div class="fb-head">
          <div class="fb-stamp">${stamp}</div>
          <div class="fb-verdict-text">
            <div class="fb-verdict">${verdict}</div>
            <div class="fb-verdict-en">${verdictEn}</div>
          </div>
        </div>
        ${!feedback.correct ? `<div class="fb-your">你输入：<code>${escapeHtml(feedback.userInput)}</code></div>` : ''}
        <div class="fb-answer">${escapeHtml(feedback.expected)}${feedback.expectedKana ? `<span class="kana">${escapeHtml(feedback.expectedKana)}</span>` : ''}</div>
        <div class="fb-rule">${escapeHtml(feedback.rule)}</div>

        <div class="allforms-wrap">
          <button class="allforms-toggle" id="allforms-toggle" type="button">
            <span class="caret">▶</span>
            <span>All Forms · <span class="ja">「${escapeHtml(word.dict)}」全活用</span></span>
          </button>
          <div class="allforms-table" id="allforms-table">${renderAllFormsTable(word, target)}</div>
        </div>
      </div>
      <div class="next-row">
        <button class="next-btn" id="next-btn" type="button">次へ<span class="arrow">→</span></button>
      </div>
      <div class="kbd-hint"><span class="kbd">Enter</span> · 继续</div>
    `;
  }

  html += '</article>';
  rootEl.innerHTML = html;

  // 绑定事件
  const inp = rootEl.querySelector('#answer-input');
  if (inp) {
    setTimeout(() => inp.focus(), 30);
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); submitAnswer(); }
    });
    rootEl.querySelector('#submit-btn').addEventListener('click', submitAnswer);
  }
  const nx = rootEl.querySelector('#next-btn');
  if (nx) {
    setTimeout(() => nx.focus(), 30);
    nx.addEventListener('click', nextQuestion);
  }
  const rt = rootEl.querySelector('#rule-toggle');
  if (rt) rt.addEventListener('click', () => {
    rt.classList.toggle('open');
    rootEl.querySelector('#rule-content').classList.toggle('open');
  });
  const aft = rootEl.querySelector('#allforms-toggle');
  if (aft) aft.addEventListener('click', () => {
    aft.classList.toggle('open');
    rootEl.querySelector('#allforms-table').classList.toggle('open');
  });
}

function renderAllFormsTable(word, highlightTarget) {
  let rows = '';
  CONJ_LIST.forEach(c => {
    const k = conjugate(word, c.key);
    const kn = conjugateKana(word, c.key);
    const kanaAux = kn && kn !== k ? `<span class="kana-aux">${escapeHtml(kn)}</span>` : '';
    const cls = c.key === highlightTarget ? 'hi' : '';
    rows += `<tr class="${cls}"><td>${c.label}</td><td>${escapeHtml(k || '')}${kanaAux}</td></tr>`;
  });
  return `<table>${rows}</table>`;
}

function mount(root) {
  rootEl = root;
  // 来自错题复习的强制下题
  if (forcedNext) {
    currentQ = forcedNext;
    forcedNext = null;
    feedback = null;
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
  const m = State.get().modules.verb;
  return {
    answered: m.answered, correct: m.correct, streak: m.streak,
    mistakes: m.mistakes.length,
  };
}

// 把 Enter 处理桥接给 app（在反馈状态下 Enter 进入下一题）
function handleGlobalEnter() {
  if (feedback) { nextQuestion(); return true; }
  return false;
}

global.ModuleVerb = {
  id: 'verb',
  label: '動詞活用',
  labelEn: 'Verbs',
  mount, unmount, getStats,
  startReviewMistake,
  handleGlobalEnter,
  hasFeedback: () => !!feedback,
};

})(window);
