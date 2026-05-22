/* ============================================================
   错题复习模块
   暴露：window.ModuleReview
   - 聚合各模块错题
   - 点击单条错题 → 切回对应模块，强制下题为该错题
   ============================================================ */
(function(global){
'use strict';

const { escapeHtml, fmtTs, showToast, copyToClipboard } = global.UI;

let rootEl = null;
let activeTab = 'all';   // 'all' | 'verb' | 'grammar'

function getCounts() {
  const s = State.get();
  return {
    verb:    s.modules.verb.mistakes.length,
    grammar: s.modules.grammar.mistakes.length,
    all:     s.modules.verb.mistakes.length + s.modules.grammar.mistakes.length,
  };
}

function collectMistakes() {
  const s = State.get();
  const out = [];
  if (activeTab === 'all' || activeTab === 'verb') {
    s.modules.verb.mistakes.forEach(m =>
      out.push(Object.assign({}, m, { _mod: 'verb' })));
  }
  if (activeTab === 'all' || activeTab === 'grammar') {
    s.modules.grammar.mistakes.forEach(m =>
      out.push(Object.assign({}, m, { _mod: 'grammar' })));
  }
  // 按时间倒序
  return out.sort((a, b) => (b.ts || 0) - (a.ts || 0));
}

/* ============================================================
   生成可复制到 AI 的错题分析上下文（Markdown 格式）
   ------------------------------------------------------------
   包含：自我介绍 + 询问目标 + 总体情况 + 弱点分布 + 全部错题明细
   ============================================================ */
function buildContextText() {
  const s = State.get();
  const v = s.modules.verb;
  const g = s.modules.grammar;

  // 当前 tab 的过滤
  const filterVerb    = activeTab === 'all' || activeTab === 'verb';
  const filterGrammar = activeTab === 'all' || activeTab === 'grammar';

  const vpct = v.answered ? Math.round(v.correct * 100 / v.answered) : 0;
  const gpct = g.answered ? Math.round(g.correct * 100 / g.answered) : 0;

  let out = '';
  out += '# 日语学习错题分析请求\n\n';
  out += '我在做日语 N5–N2 复习，下面是我最近的错题与统计数据。请帮我：\n\n';
  out += '1. **诊断共性弱点**：我反复在哪类活用 / 文型 / 词类上摔跤？是规则没记牢，还是混淆相似项？\n';
  out += '2. **指出错因模式**：列出错误中的"反复出现的根源"，比如某种音便、某个 cluster 的辨析。\n';
  out += '3. **给出针对性练习建议**：基于我的弱点，开 1 周的具体训练菜单。\n\n';

  out += '---\n\n';
  out += '## 整体情况\n\n';
  if (filterVerb)    out += `- **动词活用**：累计 ${v.answered} 题 · 正确率 ${vpct}% · 当前错题 ${v.mistakes.length} 道\n`;
  if (filterGrammar) out += `- **N2 文型**：累计 ${g.answered} 题 · 正确率 ${gpct}% · 当前错题 ${g.mistakes.length} 道\n`;
  out += '\n';

  // 弱点分布
  const weakLines = [];
  if (filterVerb) {
    Object.entries(v.byConj || {}).forEach(([k, vv]) => {
      if (vv.total < 3) return;
      weakLines.push({
        src: '动词·活用', label: Engine.CONJ_LABEL[k] || k,
        pct: Math.round(vv.ok * 100 / vv.total), total: vv.total
      });
    });
    Object.entries(v.byType || {}).forEach(([k, vv]) => {
      if (vv.total < 3) return;
      const lbl = ({godan:'五段', ichidan:'一段', suru:'する', kuru:'来る'})[k] || k;
      weakLines.push({
        src: '动词·词类', label: lbl,
        pct: Math.round(vv.ok * 100 / vv.total), total: vv.total
      });
    });
  }
  if (filterGrammar) {
    Object.entries(g.byGroup || {}).forEach(([k, vv]) => {
      if (vv.total < 3) return;
      const grp = (global.GRAMMAR_GROUPS || []).find(x => x.id === k);
      weakLines.push({
        src: '文型·功能组', label: grp ? grp.label : k,
        pct: Math.round(vv.ok * 100 / vv.total), total: vv.total
      });
    });
    Object.entries(g.byMode || {}).forEach(([k, vv]) => {
      if (vv.total < 3) return;
      const lbl = ({cloze:'穴埋め(辨析)', scramble:'並べ替え(排序)'})[k] || k;
      weakLines.push({
        src: '文型·题型', label: lbl,
        pct: Math.round(vv.ok * 100 / vv.total), total: vv.total
      });
    });
  }
  if (weakLines.length > 0) {
    weakLines.sort((a, b) => a.pct - b.pct);
    out += '## 弱点分布（按正确率升序，仅显示答过 ≥ 3 题的维度）\n\n';
    out += '| 维度 | 正确率 | 题数 |\n';
    out += '|---|---|---|\n';
    weakLines.forEach(w => {
      out += `| ${w.src} · ${w.label} | ${w.pct}% | ${w.total} |\n`;
    });
    out += '\n';
  }

  // 动词错题明细
  if (filterVerb && v.mistakes.length > 0) {
    out += `## 动词活用错题明细（${v.mistakes.length} 道）\n\n`;
    v.mistakes.forEach((m, i) => {
      const w = (global.VERBS || []).find(x => x.dict === m.wordDict);
      if (!w) return;
      const target = m.target;
      const correct = Engine.conjugate(w, target);
      const correctKana = Engine.conjugateKana(w, target);
      const kanaPart = (correctKana && correctKana !== correct) ? `（${correctKana}）` : '';
      const rule = Engine.ruleExplain(w, target);
      const typeLabel = ({godan:'五段', ichidan:'一段', suru:'する', kuru:'来る'})[w.type] || w.type;
      out += `### ${i + 1}. ${w.dict}（${w.kana}）→ ${Engine.CONJ_LABEL[target]}\n\n`;
      out += `- **词条**：${w.dict}（${w.kana}）· ${typeLabel} · ${w.level} · 「${w.zh}」\n`;
      out += `- **我的答案**：\`${m.userAns}\`\n`;
      out += `- **正确答案**：\`${correct}\`${kanaPart}\n`;
      if (rule) out += `- **规则**：${rule.replace(/\n+/g, ' / ')}\n`;
      out += '\n';
    });
  }

  // 文型错题明细
  if (filterGrammar && g.mistakes.length > 0) {
    out += `## N2 文型错题明细（${g.mistakes.length} 道）\n\n`;
    g.mistakes.forEach((m, i) => {
      const p = (global.GRAMMAR || []).find(x => x.id === m.patternId);
      if (!p) return;
      const modeLabel = ({ cloze: '穴埋め辨析', scramble: '並べ替え排序' })[m.mode] || m.mode;
      const grp = (global.GRAMMAR_GROUPS || []).find(x => x.id === p.group);
      out += `### ${i + 1}. ${p.pattern} · ${modeLabel}\n\n`;
      out += `- **功能组**：${grp ? grp.label : p.group}\n`;
      out += `- **cluster**：${p.cluster}（同簇还有其他相近文型，做辨析题时易混）\n`;
      if (m.mode === 'cloze') {
        const item = (p.cloze || [])[m.itemIndex];
        if (item) {
          out += `- **题面句子**：${item.sentence.replace('___', '【______】')}\n`;
          out += `- **中译**：${item.zh}\n`;
        }
      } else {
        const item = (p.scramble || [])[m.itemIndex];
        if (item) {
          out += `- **正确顺序**：${item.tokens.join(' / ')}（连读：${item.tokens.join('')}）\n`;
          out += `- **中译**：${item.zh}\n`;
        }
      }
      out += `- **接续**：${p.setsuzoku}\n`;
      out += `- **含义**：${p.meaning_zh}\n`;
      out += `- **语感**：${p.nuance_zh}\n\n`;
    });
  }

  out += '---\n\n';
  out += `_导出时间：${new Date().toLocaleString()}_\n`;
  return out;
}

async function handleCopyContext() {
  const text = buildContextText();
  const ok = await copyToClipboard(text);
  if (ok) {
    showToast('<span class="en">Copied</span>已复制 · 可粘贴到 AI 助手');
  } else {
    showToast('<span class="en">Failed</span>复制失败，请手动选取');
    console.log('=== 错题分析上下文 ===\n' + text);
  }
}

function renderMistake(m) {
  if (m._mod === 'verb') {
    const label = Engine.CONJ_LABEL[m.target] || m.target;
    return `
      <div class="mistake-row" data-mod="verb" data-id="${escapeHtml(m.wordDict)}" data-target="${escapeHtml(m.target)}">
        <div class="target">VERB · ${escapeHtml(label)}</div>
        <div class="body">
          ${escapeHtml(m.wordDict)}
          ${m.userAns ? `<span class="you">${escapeHtml(m.userAns)}</span>` : ''}
        </div>
        <div class="meta">${fmtTs(m.ts)}<span class="ts">${new Date(m.ts).toLocaleDateString()}</span></div>
        <div class="arrow-r">›</div>
      </div>`;
  }
  // grammar
  const p = (global.GRAMMAR || []).find(g => g.id === m.patternId);
  const pat = p ? p.pattern : m.patternId;
  const mode = ({ cloze: '穴埋め', scramble: '並べ替え' })[m.mode] || m.mode;
  return `
    <div class="mistake-row" data-mod="grammar" data-id="${escapeHtml(m.patternId)}" data-mode="${escapeHtml(m.mode)}" data-item="${m.itemIndex}">
      <div class="target">GRAMMAR · ${escapeHtml(mode)}</div>
      <div class="body">${escapeHtml(pat)}</div>
      <div class="meta">${fmtTs(m.ts)}<span class="ts">${new Date(m.ts).toLocaleDateString()}</span></div>
      <div class="arrow-r">›</div>
    </div>`;
}

function render() {
  if (!rootEl) return;
  const counts = getCounts();
  const items = collectMistakes();
  const tabs = `
    <div class="review-tabs">
      <button class="review-tab ${activeTab==='all'?'active':''}"     data-tab="all">全部 <span style="opacity:.5;font-size:11px;">${counts.all}</span></button>
      <button class="review-tab ${activeTab==='verb'?'active':''}"    data-tab="verb">動詞 <span style="opacity:.5;font-size:11px;">${counts.verb}</span></button>
      <button class="review-tab ${activeTab==='grammar'?'active':''}" data-tab="grammar">文型 <span style="opacity:.5;font-size:11px;">${counts.grammar}</span></button>
    </div>
  `;
  if (items.length === 0) {
    rootEl.innerHTML = `
      <article class="card">
        <div class="card-meta">
          <div class="no">REVIEW <strong>· 復習</strong></div>
          <div class="right">${counts.all} items</div>
        </div>
        ${tabs}
        <div class="review-empty">
          <span class="glyph">○</span>
          <div class="text">没有错题<br>继续练习就会有的</div>
          <span class="en">No Mistakes Yet</span>
        </div>
      </article>`;
    bindTabs();
    return;
  }

  rootEl.innerHTML = `
    <article class="card">
      <div class="card-meta">
        <div class="no">REVIEW <strong>· 復習</strong></div>
        <div class="right">${items.length} items</div>
      </div>
      ${tabs}
      <div class="review-actions">
        <div class="review-count"><strong>${items.length}</strong> 道错题待复习</div>
        <div class="actions-right">
          <button class="btn-secondary accent" id="copy-ctx-btn" type="button" title="复制错题与统计，粘贴给 AI 分析弱点">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2"/>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
            </svg>
            Copy → AI
          </button>
          <button class="btn-secondary" id="clear-btn" type="button">クリア</button>
        </div>
      </div>
      <div class="mistake-list">
        ${items.map(renderMistake).join('')}
      </div>
    </article>`;

  bindTabs();

  // 点击错题 → 跳到对应模块
  rootEl.querySelectorAll('.mistake-row').forEach(row => {
    row.addEventListener('click', () => {
      const mod = row.dataset.mod;
      if (mod === 'verb') {
        ModuleVerb.startReviewMistake({ wordDict: row.dataset.id, target: row.dataset.target });
        App.switchModule('verb');
      } else if (mod === 'grammar') {
        ModuleGrammar.startReviewMistake({
          patternId: row.dataset.id,
          mode: row.dataset.mode,
          itemIndex: +row.dataset.item,
        });
        App.switchModule('grammar');
      }
    });
  });

  const copyBtn = rootEl.querySelector('#copy-ctx-btn');
  if (copyBtn) copyBtn.addEventListener('click', handleCopyContext);

  const clearBtn = rootEl.querySelector('#clear-btn');
  if (clearBtn) clearBtn.addEventListener('click', () => {
    if (!confirm(`清空当前 tab（${activeTab}）的错题列表？`)) return;
    const s = State.get();
    if (activeTab === 'all' || activeTab === 'verb')    s.modules.verb.mistakes = [];
    if (activeTab === 'all' || activeTab === 'grammar') s.modules.grammar.mistakes = [];
    State.save();
    render();
    App.refreshStatus();
  });
}

function bindTabs() {
  rootEl.querySelectorAll('.review-tab').forEach(t => {
    t.addEventListener('click', () => {
      activeTab = t.dataset.tab;
      render();
    });
  });
}

function mount(root) {
  rootEl = root;
  render();
}
function unmount() { rootEl = null; }
function getStats() {
  const c = getCounts();
  return { answered: 0, correct: 0, streak: 0, mistakes: c.all };
}
function handleGlobalEnter() { return false; }

global.ModuleReview = {
  id: 'review',
  label: '復習',
  labelEn: 'Review',
  mount, unmount, getStats,
  handleGlobalEnter,
  hasFeedback: () => false,
};

})(window);
