/* ============================================================
   N5–N2 文型数据 · 顶层壳
   ------------------------------------------------------------
   本文件只定义 10 个功能分组 (GRAMMAR_GROUPS)。
   具体 patterns 由两组文件 push 到 window.GRAMMAR：
     - data/grammar-<group-id>.js — N2 完整数据（含 cloze / scramble）
     - data/grammar-n5.js / -n4.js / -n3.js / -n2-extra.js — 闪卡补全
       这些条目只含核心字段（无 cloze / scramble），文型测验模块自动跳过。
   ============================================================
   词条 schema:
   {
     id:            'nimokakawarazu',
     pattern:       '〜にもかかわらず',
     group:         '<group-id>',           // 必须是 GRAMMAR_GROUPS 中的 id
     cluster:       '<group-id>_<sub>',     // 近义簇 — 辨析题抽干扰项的依据
     level:         'N2',
     setsuzoku:     'N / V普通形 + にもかかわらず',
     meaning_zh:    '尽管…还是…',
     nuance_zh:     '正式书面语；强烈对比；客观叙述',
     examples: [ { jp, zh } ],
     cloze:    [ { sentence: '...___...', zh } ],     // ___ 标记空位
     scramble: [ { tokens: [...], pattern_index, zh } ] // tokens 是正确顺序
   }
   ============================================================ */

window.GRAMMAR_GROUPS = [
  { id: 'time',        label: '时间·相次', en: 'Time / Sequence' },
  { id: 'cause',       label: '原因·理由', en: 'Cause / Reason' },
  { id: 'concession',  label: '逆接·让步', en: 'Concession' },
  { id: 'condition',   label: '条件·假定', en: 'Condition' },
  { id: 'addition',    label: '并列·添加', en: 'Addition' },
  { id: 'emphasis',    label: '强调·限定', en: 'Emphasis / Limit' },
  { id: 'judgement',   label: '判断·必然', en: 'Judgement' },
  { id: 'stance',      label: '立场·观点', en: 'Viewpoint' },
  { id: 'manner',      label: '样态·推量', en: 'Manner / Conjecture' },
  { id: 'possibility', label: '可能·难易', en: 'Possibility' },
];

// 占位：实际 patterns 由 data/grammar-<group>.js 各文件 append
window.GRAMMAR = window.GRAMMAR || [];
