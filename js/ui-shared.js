/* ============================================================
   共享 UI 工具
   暴露：window.UI
   ============================================================ */
(function(global){
'use strict';

// HTML 转义（防 XSS / 防误解释）
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, ch =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
}

// 振假名 ruby 包装：dict 含汉字、kana 全平假
function withRuby(dict, kana) {
  if (!dict || !kana) return escapeHtml(dict || '');
  if (dict === kana) return escapeHtml(dict);
  let i = 0;
  while (i < dict.length && i < kana.length && dict[dict.length-1-i] === kana[kana.length-1-i]) i++;
  const kj = dict.slice(0, dict.length-i);
  const og = dict.slice(dict.length-i);
  const rd = kana.slice(0, kana.length-i);
  if (!kj || kj === rd) return escapeHtml(dict);
  return `<ruby>${escapeHtml(kj)}<rt>${escapeHtml(rd)}</rt></ruby>${escapeHtml(og)}`;
}

// Fisher-Yates 洗牌
function shuffle(a) {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]];
  }
  return r;
}

// 权重抽样
function weightedPick(items, weightFn) {
  if (!items.length) return null;
  let total = 0;
  const weights = items.map(it => { const w = weightFn(it); total += w; return w; });
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/* ============================================================
   Dialog 控制（原生 <dialog>）
   ============================================================ */
function openDialog(id, onOpen) {
  const d = typeof id === 'string' ? document.getElementById(id) : id;
  if (!d) return;
  if (onOpen) onOpen();
  if (!d.open) {
    d.showModal();
    requestAnimationFrame(() => d.classList.add('shown'));
  }
}
function closeDialog(d) {
  d = typeof d === 'string' ? document.getElementById(d) : d;
  if (!d || !d.open) return;
  d.classList.remove('shown');
  setTimeout(() => { if (d.open) d.close(); }, 220);
}
function bindDialog(id, closeBtnId) {
  const d = document.getElementById(id);
  if (!d) return;
  // 点击空白处关闭
  d.addEventListener('click', e => { if (e.target === d) closeDialog(d); });
  if (closeBtnId) {
    const btn = document.getElementById(closeBtnId);
    if (btn) btn.addEventListener('click', () => closeDialog(d));
  }
  d.addEventListener('cancel', e => { e.preventDefault(); closeDialog(d); });
}

/* ============================================================
   局部更新的 chip 列表
   - 点击只切自身 active class，绝不重渲整组
   - onToggle(item, span) 自行决定额外副作用
   ============================================================ */
function buildChips(elOrId, items, isActive, onToggle, getLabel, getValAttr) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return;
  el.innerHTML = '';
  items.forEach(it => {
    const btn = document.createElement('button');
    btn.type = 'button';
    const active = isActive(it);
    btn.className = 'chip' + (active ? ' active' : '');
    btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    btn.textContent = getLabel(it);
    if (getValAttr) btn.setAttribute('data-val', getValAttr(it));
    btn.addEventListener('click', () => {
      onToggle(it, btn);
      btn.setAttribute('aria-pressed', btn.classList.contains('active') ? 'true' : 'false');
    });
    el.appendChild(btn);
  });
}

/* ============================================================
   日期格式化（用于错题列表）
   ============================================================ */
function fmtTs(ts) {
  const d = new Date(ts);
  const now = new Date();
  const diff = (now - d) / 1000;
  if (diff < 60)       return Math.max(1, Math.floor(diff)) + 's';
  if (diff < 3600)     return Math.floor(diff / 60) + 'm';
  if (diff < 86400)    return Math.floor(diff / 3600) + 'h';
  if (diff < 86400*7)  return Math.floor(diff / 86400) + 'd';
  return `${d.getMonth()+1}/${d.getDate()}`;
}

/* ============================================================
   Toast 通知（单例）
   ============================================================ */
function showToast(htmlOrText, ms) {
  let t = document.getElementById('app-toast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'app-toast';
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.innerHTML = htmlOrText;
  requestAnimationFrame(() => t.classList.add('show'));
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), ms || 2200);
}

/* ============================================================
   剪贴板（file:// 不支持 navigator.clipboard，需 execCommand fallback）
   ============================================================ */
async function copyToClipboard(text) {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fall through */ }
  // fallback：选中临时 textarea，execCommand('copy')
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) {
    return false;
  }
}

global.UI = {
  escapeHtml, withRuby, shuffle, weightedPick,
  openDialog, closeDialog, bindDialog,
  buildChips, fmtTs,
  showToast, copyToClipboard,
};

})(window);
