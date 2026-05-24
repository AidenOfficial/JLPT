/* ============================================================
   闪卡 学習モジュール
   暴露：window.ModuleLearn
   ------------------------------------------------------------
   设计选择：
   - 不依赖真实时间。Web 端没有可靠的推送/同步，硬上 Ebbinghaus
     会让"间隔到期"在用户跳过几天后塌成一次性洪水，反而毁掉节奏。
   - 简化为两态 + 弱 SRS：
       未见            cards[id] 不存在 → 抽到时按"新卡"出
       learning        用户标过"未掌握"，进入复习池
       mastered        用户标过"已掌握"，永久跳过
   - 弱 SRS：每个 learning 卡有 weight（错过累计），weighted 抽样
     时 weight 越高越频繁；"还不会" → weight ×= 2（cap 8），
     "已掌握" → 移出 learning 池。

   两种 phase：
   - 'learn'  — 新卡：正反同显；按钮 已掌握 / 未掌握
   - 'review' — 复习卡：先盖住，翻面后再答；按钮 还不会 / 已掌握

   优先级：learning > 新卡 > 空。
   ============================================================ */
(function(global){
'use strict';

const { escapeHtml, weightedPick } = global.UI;

let rootEl = null;
let currentCard = null;

function gram()   { return global.GRAMMAR || []; }
function groups() { return global.GRAMMAR_GROUPS || []; }
function groupLabel(id) {
  const g = groups().find(x => x.id === id);
  return g ? g.label : id;
}

function activePatterns() {
  const m = State.get().modules.learn;
  return gram().filter(p =>
    (m.groups[p.group] !== false) &&
    (m.levels[p.level || 'N2'] !== false)
  );
}

function learningOf(active) {
  const m = State.get().modules.learn;
  return active.filter(p => {
    const c = m.cards[p.id];
    return c && c.status === 'learning';
  });
}

function newOf(active) {
  const m = State.get().modules.learn;
  return active.filter(p => !m.cards[p.id]);
}

function pickNext() {
  const active = activePatterns();
  if (!active.length) return null;

  const learning = learningOf(active);
  if (learning.length > 0) {
    const m = State.get().modules.learn;
    const pick = weightedPick(learning, p => (m.cards[p.id].weight || 1));
    return { pattern: pick, phase: 'review', revealed: false };
  }

  const news = newOf(active);
  if (news.length > 0) {
    const p = news[Math.floor(Math.random() * news.length)];
    return { pattern: p, phase: 'learn', revealed: true };
  }
  return null;
}

function recountStatus() {
  const m = State.get().modules.learn;
  let learn = 0, master = 0;
  for (const id in m.cards) {
    const c = m.cards[id];
    if (c.status === 'learning') learn++;
    else if (c.status === 'mastered') master++;
  }
  m.learningCount = learn;
  m.masteredCount = master;
}

function bumpWeight(c) {
  c.weight = Math.min(8, (c.weight || 1) * 2);
}

function act(patternId, action, opts) {
  opts = opts || {};
  const m = State.get().modules.learn;
  const c = m.cards[patternId];

  if (action === 'mastered') {
    m.cards[patternId] = { status: 'mastered', weight: 1 };
  } else if (action === 'learning') {
    m.cards[patternId] = { status: 'learning', weight: 1 };
  } else if (action === 'fail') {
    // review 中"还不会"：weight ×2，留在 learning 池
    if (c && c.status === 'learning') bumpWeight(c);
    else m.cards[patternId] = { status: 'learning', weight: 2 };
  } else if (action === 'pass') {
    // review 中"已掌握" — 等价于 'mastered'，单独一名便于读懂
    m.cards[patternId] = { status: 'mastered', weight: 1 };
  } else if (action === 'forget') {
    // 历史窗"忘掉/移出"：清除卡片状态，回到"未见"
    delete m.cards[patternId];
  }

  // 只统计真正的答题，管理操作（来自历史窗）不计入
  if (opts.count !== false) m.answered++;
  recountStatus();
  State.save();
}

function setHTML(el, html) { if (el) el.innerHTML = html; }

function render() {
  if (!rootEl) return;
  if (!currentCard) currentCard = pickNext();

  if (!currentCard) {
    setHTML(rootEl, renderEmpty());
    bindEvents();
    return;
  }

  const { pattern, phase, revealed } = currentCard;
  const m = State.get().modules.learn;
  const active = activePatterns();
  const totalActive = active.length;
  const learn = learningOf(active).length;
  const news  = newOf(active).length;

  const meta = `
    <div class="card-meta">
      <div class="no">${phase === 'review' ? '復習' : '新規'}</div>
      <div class="right">
        ${escapeHtml(groupLabel(pattern.group))} · ${escapeHtml(pattern.level || 'N2')}
        <button class="learn-queue-link" id="open-queue" type="button" aria-label="回顾">▤ 回顾</button>
      </div>
    </div>
    <div class="learn-progress">
      <span class="lp-cell"><span class="lp-num">${news}</span><span class="lp-lab">新規</span></span>
      <span class="lp-sep">·</span>
      <span class="lp-cell"><span class="lp-num">${learn}</span><span class="lp-lab">復習</span></span>
      <span class="lp-sep">·</span>
      <span class="lp-cell"><span class="lp-num">${m.masteredCount}</span><span class="lp-lab">已掌握</span></span>
      <span class="lp-sep">·</span>
      <span class="lp-cell"><span class="lp-num">${totalActive}</span><span class="lp-lab">候補</span></span>
    </div>
  `;

  let body = '';
  if (phase === 'review' && !revealed) body = renderReviewFront();
  else                                  body = renderFull();

  setHTML(rootEl, `<article class="card learn-card">${meta}${body}</article>`);
  bindEvents();
}

function renderEmpty() {
  const m = State.get().modules.learn;
  const active = activePatterns().length;
  const total = gram().length;
  let msg, sub;
  if (!total) {
    msg = '尚未载入语法数据';
    sub = 'GRAMMAR DATA EMPTY';
  } else if (!active) {
    msg = '当前筛选下没有语法';
    sub = 'PLEASE ADJUST FILTERS';
  } else if (m.masteredCount >= active) {
    msg = '全部已掌握 ✓';
    sub = 'ALL CARDS MASTERED';
  } else {
    msg = '暂时没有可学的卡';
    sub = 'NOTHING TO REVIEW';
  }
  return `
    <article class="card">
      <div class="empty-state">
        <span class="glyph">○</span>
        ${escapeHtml(msg)}<br>
        <span style="font-family:var(--font-latin);font-style:italic;font-size:11px;color:var(--text-faint);letter-spacing:0.18em;">${escapeHtml(sub)}</span>
        <div style="margin-top:18px;">
          <button class="btn-link" id="open-queue-empty" type="button">查看回顾 →</button>
        </div>
      </div>
    </article>
  `;
}

/* ====================== 复习正面（盖住） ====================== */
function renderReviewFront() {
  const { pattern } = currentCard;
  return `
    <div class="learn-front">
      <div class="target-row">
        <span class="line"></span>
        <span class="target">${escapeHtml(pattern.pattern || '')}</span>
        <span class="line"></span>
      </div>
      <div class="learn-prompt">何の意味？接続は？</div>
    </div>
    <div class="next-row">
      <button class="submit-btn" id="reveal-btn" type="button">答え<span class="arrow">→</span></button>
    </div>
    <div class="kbd-hint"><span class="kbd">Enter</span> · 翻面</div>
  `;
}

/* ====================== 全显 ====================== */
function renderFull() {
  const { pattern, phase } = currentCard;
  const exHtml = (pattern.examples || []).slice(0, 3).map(function(e) {
    return '<div class="ex"><span class="to">' + escapeHtml(e.jp) + '</span></div>' +
           '<div class="grammar-zh" style="margin-top:2px;margin-bottom:10px;padding-left:0;">' + escapeHtml(e.zh) + '</div>';
  }).join('');

  const head = `
    <div class="target-row">
      <span class="line"></span>
      <span class="target">${escapeHtml(pattern.pattern || '')}</span>
      <span class="line"></span>
    </div>
    <div class="fb-rule">
<strong>接续：</strong>${escapeHtml(pattern.setsuzoku || '—')}
<strong>含义：</strong>${escapeHtml(pattern.meaning_zh || '—')}
<strong>语感：</strong>${escapeHtml(pattern.nuance_zh || '—')}
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
  `;

  let buttons;
  if (phase === 'learn') {
    buttons = `
      <div class="learn-actions two-cols">
        <button class="learn-btn fail" id="act-learning" type="button">
          <span class="lb-ja">未掌握</span>
          <span class="lb-en">Not yet · 入復習</span>
        </button>
        <button class="learn-btn pass" id="act-mastered" type="button">
          <span class="lb-ja">已掌握</span>
          <span class="lb-en">Got it · 飛ばす</span>
        </button>
      </div>
      <div class="kbd-hint"><span class="kbd">1</span> 未掌握 · <span class="kbd">2</span> 已掌握</div>
    `;
  } else {
    buttons = `
      <div class="learn-actions two-cols">
        <button class="learn-btn fail" id="act-fail" type="button">
          <span class="lb-ja">まだ</span>
          <span class="lb-en">Not yet · 再出</span>
        </button>
        <button class="learn-btn pass" id="act-pass" type="button">
          <span class="lb-ja">覚えた</span>
          <span class="lb-en">Got it · 已掌握</span>
        </button>
      </div>
      <div class="kbd-hint"><span class="kbd">1</span> まだ · <span class="kbd">2</span> 覚えた</div>
    `;
  }
  return head + buttons;
}

/* ============================================================
   事件
   ============================================================ */
function bindEvents() {
  const qLink = rootEl.querySelector('#open-queue');
  if (qLink) qLink.addEventListener('click', openChoice);
  const qEmpty = rootEl.querySelector('#open-queue-empty');
  if (qEmpty) qEmpty.addEventListener('click', openChoice);
  if (!currentCard) return;
  const { pattern, phase, revealed } = currentCard;
  if (phase === 'review' && !revealed) {
    const rb = rootEl.querySelector('#reveal-btn');
    if (rb) {
      rb.addEventListener('click', function() {
        currentCard.revealed = true;
        render();
      });
      setTimeout(function() { rb.focus(); }, 30);
    }
    return;
  }
  const learning = rootEl.querySelector('#act-learning');
  if (learning) learning.addEventListener('click', function() { doAction(pattern.id, 'learning'); });
  const mastered = rootEl.querySelector('#act-mastered');
  if (mastered) mastered.addEventListener('click', function() { doAction(pattern.id, 'mastered'); });
  const fail = rootEl.querySelector('#act-fail');
  if (fail) fail.addEventListener('click', function() { doAction(pattern.id, 'fail'); });
  const pass = rootEl.querySelector('#act-pass');
  if (pass) pass.addEventListener('click', function() { doAction(pattern.id, 'pass'); });
}

function doAction(patternId, action) {
  act(patternId, action);
  currentCard = pickNext();
  render();
  App.refreshStatus();
}

/* ============================================================
   键盘
   ============================================================ */
function handleGlobalEnter() {
  if (!currentCard) return false;
  if (currentCard.phase === 'review' && !currentCard.revealed) {
    currentCard.revealed = true;
    render();
    return true;
  }
  return false;
}

function handleGlobalKey(e) {
  if (!currentCard) return false;
  if (currentCard.phase === 'review' && !currentCard.revealed) return false;
  const { pattern, phase } = currentCard;
  if (e.key === '1') {
    if (phase === 'learn') doAction(pattern.id, 'learning');
    else                   doAction(pattern.id, 'fail');
    return true;
  }
  if (e.key === '2') {
    if (phase === 'learn') doAction(pattern.id, 'mastered');
    else                   doAction(pattern.id, 'pass');
    return true;
  }
  return false;
}

/* ============================================================
   回顧 · 选择窗 + 历史清单 dialog
   ============================================================ */
function openChoice() {
  global.UI.openDialog('dlg-learn-choice', bindChoice);
}

function bindChoice() {
  const startBtn = document.getElementById('choice-start-review');
  const histBtn  = document.getElementById('choice-view-history');
  if (startBtn && !startBtn._bound) {
    startBtn._bound = true;
    startBtn.addEventListener('click', startReview);
  }
  if (histBtn && !histBtn._bound) {
    histBtn._bound = true;
    histBtn.addEventListener('click', function() {
      global.UI.closeDialog('dlg-learn-choice');
      setTimeout(openQueue, 240);
    });
  }
}

// 「开始复习」：关窗，让 learn 模块按默认优先级（learning > new）继续抽题
function startReview() {
  global.UI.closeDialog('dlg-learn-choice');
  setTimeout(function() {
    currentCard = pickNext();
    if (rootEl) render();
    App.refreshStatus();
  }, 50);
}

function openQueue() {
  global.UI.openDialog('dlg-learn-queue', renderQueue);
}

function renderQueue() {
  const body = document.getElementById('queue-body');
  if (!body) return;
  const m = State.get().modules.learn;
  const all = gram();
  const learning = [];
  const mastered = [];
  for (const p of all) {
    const c = m.cards[p.id];
    if (!c) continue;
    if (c.status === 'learning') learning.push({ p, c });
    else if (c.status === 'mastered') mastered.push({ p, c });
  }
  // learning 按 weight 倒序（错越多越靠前）
  learning.sort((a, b) => (b.c.weight || 1) - (a.c.weight || 1));
  // mastered 任意顺序，按 id 稳定排
  mastered.sort((a, b) => a.p.id.localeCompare(b.p.id));

  function rowHtml(item, kind) {
    const { p, c } = item;
    const lvlGroup = (p.level || 'N2') + ' · ' + groupLabel(p.group);
    const wTag = (kind === 'learning' && (c.weight || 1) > 1)
      ? `<span class="q-stage">错 ×${c.weight}</span>` : '';
    const actions = kind === 'learning' ? `
      <button class="q-act primary" data-id="${escapeHtml(p.id)}" data-act="review-now">立即復習</button>
      <button class="q-act" data-id="${escapeHtml(p.id)}" data-act="to-mastered">→ 已掌握</button>
      <button class="q-act" data-id="${escapeHtml(p.id)}" data-act="forget">移出</button>
    ` : `
      <button class="q-act primary" data-id="${escapeHtml(p.id)}" data-act="to-learning">重新學</button>
      <button class="q-act" data-id="${escapeHtml(p.id)}" data-act="forget">移出</button>
    `;
    return `
      <div class="q-row">
        <div class="q-main">
          <div class="q-pattern">${escapeHtml(p.pattern || '')}</div>
          <div class="q-meta">
            <span>${escapeHtml(lvlGroup)}</span>
            ${wTag}
          </div>
          <div class="q-gloss">${escapeHtml(p.meaning_zh || '')}</div>
        </div>
        <div class="q-actions">${actions}</div>
      </div>
    `;
  }

  const learningCount = learning.length;
  const masteredCount = mastered.length;
  const newCount = newOf(activePatterns()).length;

  body.innerHTML = `
    <div class="q-summary">
      <span class="q-sum-cell"><b>${newCount}</b> 新規</span>
      <span class="q-sum-cell"><b>${learningCount}</b> 復習中</span>
      <span class="q-sum-cell"><b>${masteredCount}</b> 已掌握</span>
    </div>
    <div class="sheet-section">
      <div class="sec-title">復習中 <span class="en">Learning · ${learningCount}</span></div>
      ${learningCount ? learning.map(it => rowHtml(it, 'learning')).join('')
                      : '<div class="q-empty">暂无复习中卡片</div>'}
    </div>
    <div class="sheet-section">
      <div class="sec-title">已掌握 <span class="en">Mastered · ${masteredCount}</span></div>
      ${masteredCount ? mastered.map(it => rowHtml(it, 'mastered')).join('')
                      : '<div class="q-empty">暂无已掌握卡片</div>'}
    </div>
  `;

  body.querySelectorAll('.q-act').forEach(btn => {
    btn.addEventListener('click', function() {
      const id = btn.getAttribute('data-id');
      const a  = btn.getAttribute('data-act');
      handleQueueAction(id, a);
    });
  });
}

function handleQueueAction(patternId, action) {
  if (action === 'review-now') {
    // 把这张 pattern 作为下一题
    const p = gram().find(x => x.id === patternId);
    if (p) currentCard = { pattern: p, phase: 'review', revealed: false };
    global.UI.closeDialog('dlg-learn-queue');
    setTimeout(function() { if (rootEl) render(); App.refreshStatus(); }, 50);
    return;
  }
  if (action === 'to-mastered')  act(patternId, 'mastered', { count: false });
  else if (action === 'to-learning') act(patternId, 'learning', { count: false });
  else if (action === 'forget')      act(patternId, 'forget',   { count: false });

  // 当前显示卡若被改 → 重新挑
  if (currentCard && currentCard.pattern && currentCard.pattern.id === patternId) {
    currentCard = null;
  }
  renderQueue();
  if (rootEl) render();
  App.refreshStatus();
}

/* ============================================================
   生命周期
   ============================================================ */
function mount(root) {
  rootEl = root;
  recountStatus();
  if (!currentCard) currentCard = pickNext();
  render();
}

// 设置 / quick-row 筛选变化时调用：只在当前卡被筛掉时才换题，
// 否则保留 currentCard 让用户答完。
function applyFilterChange() {
  recountStatus();
  const active = activePatterns();
  if (currentCard) {
    const stillValid = active.some(p => p.id === currentCard.pattern.id);
    if (!stillValid) currentCard = pickNext();
  } else {
    currentCard = pickNext();
  }
  if (rootEl) render();
}
function unmount() { rootEl = null; }
function getStats() {
  const m = State.get().modules.learn;
  const active = activePatterns();
  return {
    answered: m.answered,
    correct:  m.masteredCount,
    streak:   0,
    mistakes: m.learningCount,
    _active:   active.length,
    _mastered: m.masteredCount,
    _learning: m.learningCount,
    _due:      m.learningCount,   // 兼容 app.js 状态条
    _new:      newOf(active).length,
  };
}

global.ModuleLearn = {
  id: 'learn',
  label: '学習',
  labelEn: 'Learn',
  mount: mount,
  unmount: unmount,
  getStats: getStats,
  handleGlobalEnter: handleGlobalEnter,
  handleGlobalKey: handleGlobalKey,
  applyFilterChange: applyFilterChange,
};

})(window);
