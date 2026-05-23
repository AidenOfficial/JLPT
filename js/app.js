/* ============================================================
   App 编排器
   - 模块切换 / 顶部 nav
   - 快速过滤（基于当前模块）
   - 状态条 + 详细统计 dialog
   - 设置 dialog（按模块切换内容）
   - 全局 Enter 处理
   暴露：window.App
   ============================================================ */
(function(global){
'use strict';

const { buildChips, openDialog, closeDialog, bindDialog, escapeHtml } = global.UI;

const MODULES = {
  verb:    () => global.ModuleVerb,
  grammar: () => global.ModuleGrammar,
  review:  () => global.ModuleReview,
};
const MODULE_ORDER = ['verb', 'grammar', 'review'];

let activeKey = 'verb';
let mountEl  = null;

/* ============================================================
   模块切换
   ============================================================ */
function switchModule(key) {
  if (!MODULES[key]) return;
  const cur = MODULES[activeKey]();
  if (cur && cur.unmount) cur.unmount();
  activeKey = key;
  State.get().activeModule = key;
  State.save();
  renderModuleNav();
  renderQuickRow();
  const next = MODULES[key]();
  if (next && next.mount) next.mount(mountEl);
  refreshStatus();
}

/* ============================================================
   顶部 nav
   ============================================================ */
function renderModuleNav() {
  const nav = document.getElementById('module-nav');
  if (!nav) return;
  nav.innerHTML = '';
  MODULE_ORDER.forEach(key => {
    const mod = MODULES[key]();
    if (!mod) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = activeKey === key ? 'active' : '';
    let badge = '';
    if (key === 'review') {
      const c = State.get().modules.verb.mistakes.length +
                State.get().modules.grammar.mistakes.length;
      if (c > 0) badge = `<span class="badge-count">${c}</span>`;
    }
    b.innerHTML = `<span class="ja">${mod.label}</span><span class="en">${mod.labelEn}</span>${badge}`;
    b.addEventListener('click', () => switchModule(key));
    nav.appendChild(b);
  });
}

/* ============================================================
   快速过滤行（顶部）— 按模块切内容
   ============================================================ */
function renderQuickRow() {
  const wrap = document.getElementById('quick-row');
  if (!wrap) return;
  const s = State.get();
  if (activeKey === 'verb') {
    wrap.innerHTML = `<span class="quick-label">Level</span><div class="quick-chips" id="quick-chips"></div>`;
    const m = s.modules.verb;
    const chips = document.getElementById('quick-chips');
    ['N5','N4','N3','N2'].forEach(l => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'q-chip' + (m.levels[l] ? ' active' : '');
      b.textContent = l;
      b.dataset.val = l;
      b.addEventListener('click', () => {
        m.levels[l] = !m.levels[l];
        b.classList.toggle('active', m.levels[l]);
        const inner = document.querySelector(`#chip-level [data-val="${l}"]`);
        if (inner) inner.classList.toggle('active', m.levels[l]);
        State.save();
      });
      chips.appendChild(b);
    });
    wrap.style.display = '';
  } else if (activeKey === 'grammar') {
    wrap.innerHTML = `<span class="quick-label">Group</span><div class="quick-chips" id="quick-chips"></div>`;
    const m = s.modules.grammar;
    const chips = document.getElementById('quick-chips');
    (global.GRAMMAR_GROUPS || []).forEach(g => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'q-chip' + (m.groups[g.id] ? ' active' : '');
      b.textContent = g.label;
      b.dataset.val = g.id;
      b.addEventListener('click', () => {
        m.groups[g.id] = !m.groups[g.id];
        b.classList.toggle('active', m.groups[g.id]);
        const inner = document.querySelector(`#chip-group [data-val="${g.id}"]`);
        if (inner) inner.classList.toggle('active', m.groups[g.id]);
        State.save();
      });
      chips.appendChild(b);
    });
    wrap.style.display = '';
  } else {
    wrap.style.display = 'none';
  }
}

/* ============================================================
   设置 dialog · 按当前模块定制 sections
   ============================================================ */
function renderSettings() {
  const s = State.get();
  const sec = id => document.getElementById(id);

  // verb 部分
  const verbSecs = ['sec-verb-level','sec-verb-type','sec-verb-conj'];
  // grammar 部分
  const gramSecs = ['sec-gram-group','sec-gram-mode'];

  if (activeKey === 'verb') {
    verbSecs.forEach(id => { const el = sec(id); if (el) el.style.display = ''; });
    gramSecs.forEach(id => { const el = sec(id); if (el) el.style.display = 'none'; });
  } else if (activeKey === 'grammar') {
    verbSecs.forEach(id => { const el = sec(id); if (el) el.style.display = 'none'; });
    gramSecs.forEach(id => { const el = sec(id); if (el) el.style.display = ''; });
  } else {
    // review：都不显示，只显示 UI 选项
    [...verbSecs, ...gramSecs].forEach(id => { const el = sec(id); if (el) el.style.display = 'none'; });
  }

  // 动词部分 chips
  if (activeKey === 'verb') {
    const mv = s.modules.verb;
    buildChips('chip-level', ['N5','N4','N3','N2'],
      l => mv.levels[l],
      (l, span) => {
        mv.levels[l] = !mv.levels[l];
        span.classList.toggle('active', mv.levels[l]);
        const q = document.querySelector(`#quick-chips [data-val="${l}"]`);
        if (q) q.classList.toggle('active', mv.levels[l]);
        State.save();
      }, l => l, l => l);
    buildChips('chip-type',
      [['godan','五段'],['ichidan','一段'],['suru','する'],['kuru','来る']],
      ([k]) => mv.types[k],
      ([k], span) => {
        mv.types[k] = !mv.types[k];
        span.classList.toggle('active', mv.types[k]);
        State.save();
      }, ([,v]) => v, ([k]) => k);
    buildChips('chip-conj',
      Engine.CONJ_LIST.map(c => [c.key, c.label]),
      ([k]) => mv.conjs[k],
      ([k], span) => {
        mv.conjs[k] = !mv.conjs[k];
        span.classList.toggle('active', mv.conjs[k]);
        State.save();
      }, ([,v]) => v, ([k]) => k);
  }

  // 文型部分 chips
  if (activeKey === 'grammar') {
    const mg = s.modules.grammar;
    buildChips('chip-group',
      (global.GRAMMAR_GROUPS || []).map(g => [g.id, g.label]),
      ([k]) => mg.groups[k],
      ([k], span) => {
        mg.groups[k] = !mg.groups[k];
        span.classList.toggle('active', mg.groups[k]);
        const q = document.querySelector(`#quick-chips [data-val="${k}"]`);
        if (q) q.classList.toggle('active', mg.groups[k]);
        State.save();
      }, ([,v]) => v, ([k]) => k);
    buildChips('chip-mode',
      [['cloze','穴埋め'],['scramble','並べ替え']],
      ([k]) => mg.modes[k],
      ([k], span) => {
        mg.modes[k] = !mg.modes[k];
        span.classList.toggle('active', mg.modes[k]);
        State.save();
      }, ([,v]) => v, ([k]) => k);
  }

  // 通用 UI toggles
  const toggles = [
    { key: 'showExamples', label: '示例 / Examples',   desc: '答前显示用法说明与范例（动词模块）' },
    { key: 'furigana',     label: '振仮名 / Furigana', desc: '汉字上方显示假名读音' },
    { key: 'showZh',       label: '釋義 / Meaning',    desc: '关掉以挑战「看到日语想中文」' },
    { key: 'mistakeOnly',  label: '誤題 / Mistakes',   desc: '仅从最近错题抽取（适用于动词与文型）' },
  ];
  const togglesEl = document.getElementById('toggles');
  togglesEl.innerHTML = '';
  toggles.forEach(t => {
    const row = document.createElement('div');
    row.className = 'toggle-row';
    row.setAttribute('role', 'switch');
    row.setAttribute('tabindex', '0');
    row.setAttribute('aria-checked', s.ui[t.key] ? 'true' : 'false');
    row.setAttribute('aria-label', t.label);
    row.innerHTML = `
      <div>
        <div class="label">${t.label}</div>
        <div class="desc">${t.desc}</div>
      </div>
      <div class="toggle ${s.ui[t.key] ? 'on' : ''}" aria-hidden="true"></div>
    `;
    const tog = row.querySelector('.toggle');
    const flip = () => {
      s.ui[t.key] = !s.ui[t.key];
      tog.classList.toggle('on', s.ui[t.key]);
      row.setAttribute('aria-checked', s.ui[t.key] ? 'true' : 'false');
      State.save();
      // 影响显示的开关需重渲当前模块
      const m = MODULES[activeKey]();
      if (m && m.mount && rootElCache()) {
        m.mount(rootElCache());
      }
    };
    row.addEventListener('click', flip);
    row.addEventListener('keydown', e => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
    });
    togglesEl.appendChild(row);
  });
}

function rootElCache() { return mountEl; }

/* ============================================================
   状态条
   ============================================================ */
function refreshStatus() {
  const m = MODULES[activeKey]();
  if (!m) return;
  const st = m.getStats();
  const total = st.answered;
  const ok = st.correct;
  const pct = total ? Math.round(ok * 100 / total) : 0;
  const pctCls = total < 5 ? '' : pct < 60 ? 'bad' : pct < 85 ? '' : 'good';
  const el = document.getElementById('status');
  if (!el) return;
  if (activeKey === 'review') {
    el.innerHTML = `
      <span>復習モード</span>
      <span class="sep">·</span>
      <span>誤 ${st.mistakes}</span>
    `;
    return;
  }
  el.innerHTML = `
    <span>№ ${String(total).padStart(3, '0')}</span>
    <span class="sep">·</span>
    <span>連 ${st.streak}</span>
    <span class="sep">·</span>
    <span class="pct ${pctCls}">${pct}%</span>
    <span class="sep">·</span>
    <span>誤 ${st.mistakes}</span>
    <button class="btn-link" type="button" id="open-stats">Stats →</button>
  `;
  const ob = document.getElementById('open-stats');
  if (ob) ob.addEventListener('click', () => openDialog('dlg-stats', renderStats));
  // 同步 nav 上的徽标
  renderModuleNav();
}

function renderStats() {
  const s = State.get();
  const m = s.modules[activeKey === 'review' ? 'verb' : activeKey];
  // 当前模块的统计 + 弱点
  const items = [];
  if (activeKey === 'verb' || activeKey === 'review') {
    Object.entries(s.modules.verb.byConj || {}).forEach(([k, v]) => {
      if (v.total < 3) return;
      items.push({ label: '活用 · ' + (Engine.CONJ_LABEL[k] || k), pct: Math.round(v.ok*100/v.total), total: v.total });
    });
    Object.entries(s.modules.verb.byType || {}).forEach(([k, v]) => {
      if (v.total < 3) return;
      items.push({ label: '词类 · ' + (({godan:'五段',ichidan:'一段',suru:'する',kuru:'来る'})[k] || k), pct: Math.round(v.ok*100/v.total), total: v.total });
    });
  }
  if (activeKey === 'grammar' || activeKey === 'review') {
    Object.entries(s.modules.grammar.byGroup || {}).forEach(([k, v]) => {
      if (v.total < 3) return;
      const g = (global.GRAMMAR_GROUPS || []).find(x => x.id === k);
      items.push({ label: '文型组 · ' + (g ? g.label : k), pct: Math.round(v.ok*100/v.total), total: v.total });
    });
    Object.entries(s.modules.grammar.byMode || {}).forEach(([k, v]) => {
      if (v.total < 3) return;
      items.push({ label: '题型 · ' + (({cloze:'穴埋め',scramble:'並べ替え'})[k] || k), pct: Math.round(v.ok*100/v.total), total: v.total });
    });
  }
  items.sort((a, b) => a.pct - b.pct);

  const weakHtml = items.length === 0
    ? '<div class="weak-empty">每个维度至少答 3 题<br>才会显示薄弱项</div>'
    : `<div class="weak-list">${items.map(i => {
        const cls = i.pct < 60 ? 'bad' : i.pct < 85 ? 'mid' : 'good';
        return `<div class="weak-item">
          <span class="lbl">${i.label}<span class="num">${i.total}</span></span>
          <span class="pct ${cls}">${i.pct}%</span>
        </div>`;
      }).join('')}</div>`;

  // 顶部 4 格用当前模块的总数
  const cur = MODULES[activeKey]().getStats();
  const total = cur.answered;
  const pct = total ? Math.round(cur.correct * 100 / total) : 0;

  document.getElementById('stats-body').innerHTML = `
    <div class="stats-grid">
      <div class="stat-cell"><div class="v">${total}</div><div class="l">total</div></div>
      <div class="stat-cell"><div class="v">${pct}%</div><div class="l">accuracy</div></div>
      <div class="stat-cell"><div class="v">${cur.streak}</div><div class="l">streak</div></div>
      <div class="stat-cell"><div class="v">${cur.mistakes}</div><div class="l">errors</div></div>
    </div>
    <div class="sheet-section">
      <div class="sec-title">弱点 <span class="en">Weakness</span></div>
      ${weakHtml}
    </div>
  `;
}

/* ============================================================
   初始化
   ============================================================ */
function init() {
  State.load();
  Engine.runSelfTest();

  mountEl = document.getElementById('mount');
  activeKey = State.get().activeModule || 'verb';
  if (!MODULES[activeKey]) activeKey = 'verb';

  // 顶栏 buttons
  document.getElementById('btn-settings').addEventListener('click', () => {
    openDialog('dlg-settings', renderSettings);
  });
  bindDialog('dlg-settings', 'settings-close');
  bindDialog('dlg-stats',    'stats-close');
  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!confirm('确定重置所有进度（错题/统计/SRS权重）？该操作不可撤销。')) return;
    State.reset();
    activeKey = 'verb';
    closeDialog('dlg-settings');
    renderModuleNav();
    renderQuickRow();
    MODULES.verb().mount(mountEl);
    refreshStatus();
  });

  // 全局 Enter — 反馈后下一题
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (document.querySelector('dialog[open]')) return;
    const m = MODULES[activeKey]();
    if (m && m.handleGlobalEnter && m.handleGlobalEnter()) e.preventDefault();
  });

  // 首次渲染
  renderModuleNav();
  renderQuickRow();
  MODULES[activeKey]().mount(mountEl);
  refreshStatus();
}

global.App = {
  init,
  switchModule,
  refreshStatus,
};

})(window);

// 启动
window.addEventListener('DOMContentLoaded', () => App.init());
