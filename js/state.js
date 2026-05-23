/* ============================================================
   全局状态 + localStorage 持久化 + 模块通用工具
   暴露：window.State
   ------------------------------------------------------------
   v4 数据结构：
   {
     activeModule: 'verb' | 'grammar' | 'review',
     ui: { furigana, showZh, showExamples, mistakeOnly },
     modules: {
       verb:    { levels, types, conjs, answered, correct, streak, byConj, byType, weight, mistakes },
       grammar: { groups, modes,        answered, correct, streak, byGroup, byMode, weight, mistakes },
     }
   }
   - SRS-lite：错 → weight ×2 (cap 8)；对 → weight ÷2 (floor 0.25)
   - mistakes 顶部插入，截 200 条
   ============================================================ */
(function(global){
'use strict';

const STORAGE_KEY = 'jp_reviewer_v4';
const LEGACY_KEY  = 'jp_reviewer_v3';   // 自动迁移上一版数据

function defaultState() {
  return {
    activeModule: 'verb',
    ui: {
      furigana: true,
      showZh: true,
      showExamples: true,
      mistakeOnly: false,
    },
    modules: {
      verb: {
        levels: { N5:true, N4:true, N3:false, N2:false },
        types:  { godan:true, ichidan:true, suru:true, kuru:true },
        conjs:  Object.fromEntries(((global.Engine && global.Engine.CONJ_LIST) || []).map(c => [c.key, true])),
        answered: 0, correct: 0, streak: 0,
        byConj: {}, byType: {}, weight: {}, mistakes: [],
      },
      grammar: {
        groups: Object.fromEntries((global.GRAMMAR_GROUPS || []).map(g => [g.id, true])),
        modes:  { cloze: true, scramble: true },
        answered: 0, correct: 0, streak: 0,
        byGroup: {}, byMode: {}, weight: {}, mistakes: [],
      },
    },
  };
}

// 浅合并到默认状态（防御 schema 变化）
function mergeDefaults(loaded) {
  const def = defaultState();
  const out = Object.assign({}, def, loaded);
  out.ui = Object.assign({}, def.ui, loaded.ui || {});
  out.modules = Object.assign({}, def.modules, loaded.modules || {});
  for (const k of Object.keys(def.modules)) {
    out.modules[k] = Object.assign({}, def.modules[k], (loaded.modules || {})[k] || {});
    // 嵌套 dict 也要合并
    if (def.modules[k].levels) out.modules[k].levels = Object.assign({}, def.modules[k].levels, out.modules[k].levels || {});
    if (def.modules[k].types)  out.modules[k].types  = Object.assign({}, def.modules[k].types,  out.modules[k].types  || {});
    if (def.modules[k].conjs)  out.modules[k].conjs  = Object.assign({}, def.modules[k].conjs,  out.modules[k].conjs  || {});
    if (def.modules[k].groups) out.modules[k].groups = Object.assign({}, def.modules[k].groups, out.modules[k].groups || {});
    if (def.modules[k].modes)  out.modules[k].modes  = Object.assign({}, def.modules[k].modes,  out.modules[k].modes  || {});
    if (!out.modules[k].byConj)  out.modules[k].byConj  = {};
    if (!out.modules[k].byType)  out.modules[k].byType  = {};
    if (!out.modules[k].byGroup) out.modules[k].byGroup = {};
    if (!out.modules[k].byMode)  out.modules[k].byMode  = {};
    if (!out.modules[k].weight)  out.modules[k].weight  = {};
    if (!out.modules[k].mistakes) out.modules[k].mistakes = [];
  }
  return out;
}

// 从 v3 迁移到 v4
function migrateV3(v3) {
  const v4 = defaultState();
  if (v3.furigana !== undefined)     v4.ui.furigana = v3.furigana;
  if (v3.showZh !== undefined)       v4.ui.showZh = v3.showZh;
  if (v3.showExamples !== undefined) v4.ui.showExamples = v3.showExamples;
  if (v3.mistakeOnly !== undefined)  v4.ui.mistakeOnly = v3.mistakeOnly;
  v4.modules.verb = {
    levels:    Object.assign(v4.modules.verb.levels, v3.levels || {}),
    types:     Object.assign(v4.modules.verb.types,  v3.types || {}),
    conjs:     Object.assign(v4.modules.verb.conjs,  v3.conjs || {}),
    answered:  v3.answered || 0,
    correct:   v3.correct  || 0,
    streak:    v3.streak   || 0,
    byConj:    v3.byConj   || {},
    byType:    v3.byType   || {},
    weight:    v3.weight   || {},
    mistakes:  v3.mistakes || [],
  };
  return v4;
}

let state = defaultState();

function load() {
  try {
    let s = localStorage.getItem(STORAGE_KEY);
    if (s) {
      state = mergeDefaults(JSON.parse(s));
      return;
    }
    // 尝试旧版迁移
    s = localStorage.getItem(LEGACY_KEY);
    if (s) {
      state = migrateV3(JSON.parse(s));
      save();
      console.log('%c[state] v3 → v4 已迁移', 'color:#6b9b88');
    }
  } catch (e) {
    console.warn('[state] 读取失败，使用默认状态', e);
  }
}
function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
  catch (e) {}
}
function reset() {
  try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  state = defaultState();
}
function get() { return state; }

/* ============================================================
   SRS-lite 通用
   ============================================================ */
function bumpWeight(weightMap, key, correct) {
  if (correct) weightMap[key] = Math.max(0.25, (weightMap[key] || 1) / 2);
  else         weightMap[key] = Math.min(8,    (weightMap[key] || 1) * 2);
}
function logAnswer(modKey, correct, dims) {
  // dims: { conj: 'te', type: 'godan' } 或 { group: 'concession', mode: 'cloze' }
  const m = state.modules[modKey];
  m.answered++;
  if (correct) { m.correct++; m.streak++; }
  else         { m.streak = 0; }
  Object.entries(dims).forEach(([dim, val]) => {
    const bk = 'by' + dim.charAt(0).toUpperCase() + dim.slice(1);
    if (!m[bk]) m[bk] = {};
    if (!m[bk][val]) m[bk][val] = { ok:0, total:0 };
    m[bk][val].total++;
    if (correct) m[bk][val].ok++;
  });
}
function pushMistake(modKey, entry) {
  const m = state.modules[modKey];
  m.mistakes.unshift(Object.assign({ ts: Date.now() }, entry));
  if (m.mistakes.length > 200) m.mistakes.length = 200;
}

global.State = {
  load, save, reset, get,
  defaultState,
  bumpWeight, logAnswer, pushMistake,
};

})(window);
