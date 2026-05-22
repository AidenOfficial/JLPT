/* ============================================================
   活用引擎 · 不硬编码任何变形结果
   暴露：window.Engine
   ============================================================ */
(function(global){
'use strict';

// 五段动词词尾的五行变换
const GODAN_A = { 'う':'わ','く':'か','ぐ':'が','す':'さ','つ':'た','ぬ':'な','ぶ':'ば','む':'ま','る':'ら' };
const GODAN_I = { 'う':'い','く':'き','ぐ':'ぎ','す':'し','つ':'ち','ぬ':'に','ぶ':'び','む':'み','る':'り' };
const GODAN_E = { 'う':'え','く':'け','ぐ':'げ','す':'せ','つ':'て','ぬ':'ね','ぶ':'べ','む':'め','る':'れ' };
const GODAN_O = { 'う':'お','く':'こ','ぐ':'ご','す':'そ','つ':'と','ぬ':'の','ぶ':'ぼ','む':'も','る':'ろ' };
const TE_MAP = { 'う':'って','つ':'って','る':'って','ぬ':'んで','ぶ':'んで','む':'んで','く':'いて','ぐ':'いで','す':'して' };
const TA_MAP = { 'う':'った','つ':'った','る':'った','ぬ':'んだ','ぶ':'んだ','む':'んだ','く':'いた','ぐ':'いだ','す':'した' };

const CONJ_LIST = [
  { key:'masu',              label:'ます形',   use:'礼貌肯定形（敬体）' },
  { key:'te',                label:'て形',     use:'中顿；请求；进行时连接' },
  { key:'ta',                label:'た形',     use:'过去式（普通体）' },
  { key:'nai',               label:'ない形',   use:'否定（普通体）' },
  { key:'potential',         label:'可能形',   use:'「能 / 会做某事」' },
  { key:'volitional',        label:'意志形',   use:'「…吧 / 让我…」 意志或提议' },
  { key:'imperative',        label:'命令形',   use:'强命令（不礼貌）' },
  { key:'prohibitive',       label:'禁止形',   use:'「不要…/别…」' },
  { key:'ba',                label:'ば条件',   use:'「如果…就…」 一般条件' },
  { key:'tara',              label:'たら形',   use:'「…的话 / …之后」 条件' },
  { key:'passive',           label:'受身形',   use:'被动 「被…」' },
  { key:'causative',         label:'使役形',   use:'「让 / 使…做」' },
  { key:'causative_passive', label:'使役受身', use:'「被迫做 / 不得不做」' },
  { key:'sonkei',            label:'尊敬語',   use:'抬高对方动作以示敬意（通式）' },
  { key:'kenjo',             label:'謙譲語',   use:'降低自己动作以示谦逊（通式）' },
];
const CONJ_LABEL = Object.fromEntries(CONJ_LIST.map(c => [c.key, c.label]));
const CONJ_USE   = Object.fromEntries(CONJ_LIST.map(c => [c.key, c.use]));

// 不规则
const SURU = {
  masu:'します', te:'して', ta:'した', nai:'しない',
  potential:'できる', volitional:'しよう',
  imperative:'しろ', prohibitive:'するな',
  ba:'すれば', tara:'したら',
  passive:'される', causative:'させる', causative_passive:'させられる',
  sonkei:'なさる', kenjo:'いたす',
};
const KURU_KJ = {
  masu:'来ます', te:'来て', ta:'来た', nai:'来ない',
  potential:'来られる', volitional:'来よう',
  imperative:'来い', prohibitive:'来るな',
  ba:'来れば', tara:'来たら',
  passive:'来られる', causative:'来させる', causative_passive:'来させられる',
  sonkei:'いらっしゃる', kenjo:'参る',
};
const KURU_KN = {
  masu:'きます', te:'きて', ta:'きた', nai:'こない',
  potential:'こられる', volitional:'こよう',
  imperative:'こい', prohibitive:'くるな',
  ba:'くれば', tara:'きたら',
  passive:'こられる', causative:'こさせる', causative_passive:'こさせられる',
  sonkei:'いらっしゃる', kenjo:'まいる',
};

function godanConjugate(surface, target, opts) {
  opts = opts || {};
  const stem = surface.slice(0, -1);
  const last = surface.slice(-1);
  switch (target) {
    case 'masu':       return stem + GODAN_I[last] + 'ます';
    case 'te':         return opts.teException ? (stem + 'って') : (stem + TE_MAP[last]);
    case 'ta':         return opts.teException ? (stem + 'った') : (stem + TA_MAP[last]);
    case 'nai':
      if (opts.naiException) return opts.naiException;
      return stem + GODAN_A[last] + 'ない';
    case 'potential':  return stem + GODAN_E[last] + 'る';
    case 'volitional': return stem + GODAN_O[last] + 'う';
    case 'imperative': return stem + GODAN_E[last];
    case 'prohibitive':return surface + 'な';
    case 'ba':         return stem + GODAN_E[last] + 'ば';
    case 'tara':       return opts.teException ? (stem + 'ったら') : (stem + TA_MAP[last] + 'ら');
    case 'passive':    return stem + GODAN_A[last] + 'れる';
    case 'causative':  return stem + GODAN_A[last] + 'せる';
    case 'causative_passive':
      if (last === 'す') return stem + GODAN_A[last] + 'せられる';
      return stem + GODAN_A[last] + 'される';
    case 'sonkei':     return 'お' + stem + GODAN_I[last] + 'になる';
    case 'kenjo':      return 'お' + stem + GODAN_I[last] + 'する';
  }
  return null;
}
function ichidanConjugate(surface, target) {
  const stem = surface.slice(0, -1);
  switch (target) {
    case 'masu':              return stem + 'ます';
    case 'te':                return stem + 'て';
    case 'ta':                return stem + 'た';
    case 'nai':               return stem + 'ない';
    case 'potential':         return stem + 'られる';
    case 'volitional':        return stem + 'よう';
    case 'imperative':        return stem + 'ろ';
    case 'prohibitive':       return surface + 'な';
    case 'ba':                return stem + 'れば';
    case 'tara':              return stem + 'たら';
    case 'passive':           return stem + 'られる';
    case 'causative':         return stem + 'させる';
    case 'causative_passive': return stem + 'させられる';
    case 'sonkei':            return 'お' + stem + 'になる';
    case 'kenjo':             return 'お' + stem + 'する';
  }
  return null;
}

function conjugate(word, target) {
  if (!word) return null;
  if (word.type === 'suru') return SURU[target];
  if (word.type === 'kuru') return KURU_KJ[target];
  const opts = { teException: !!word.teException, naiException: word.naiException };
  if (word.type === 'godan')   return godanConjugate(word.dict, target, opts);
  if (word.type === 'ichidan') return ichidanConjugate(word.dict, target);
  return null;
}
function conjugateKana(word, target) {
  if (!word) return null;
  if (word.type === 'suru') return SURU[target];
  if (word.type === 'kuru') return KURU_KN[target];
  const opts = { teException: !!word.teException, naiException: word.naiException };
  if (word.type === 'godan')   return godanConjugate(word.kana, target, opts);
  if (word.type === 'ichidan') return ichidanConjugate(word.kana, target);
  return null;
}
function acceptableAnswers(word, target) {
  const set = new Set();
  set.add(conjugate(word, target));
  set.add(conjugateKana(word, target));
  if (target === 'causative_passive' && word.type === 'godan') {
    const last = word.dict.slice(-1);
    if (last !== 'す') {
      const kjStem = word.dict.slice(0, -1);
      const knStem = word.kana.slice(0, -1);
      const knLast = word.kana.slice(-1);
      set.add(kjStem + GODAN_A[last]  + 'せられる');
      set.add(knStem + GODAN_A[knLast] + 'せられる');
    }
  }
  if (target === 'imperative' && word.type === 'suru') set.add('せよ');
  return [...set].filter(Boolean);
}

function normalize(s) {
  if (s == null) return '';
  s = String(s).trim().replace(/\s+/g, '');
  s = s.replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60));
  return s;
}
function checkAnswer(userInput, word, target) {
  const u = normalize(userInput);
  if (!u) return false;
  return acceptableAnswers(word, target).some(a => normalize(a) === u);
}

/* ============================================================
   规则解释（中文）
   ============================================================ */
function ruleExplain(word, target) {
  if (!word) return '';
  if (word.type === 'suru') return SURU_RULE[target] || '';
  if (word.type === 'kuru') return KURU_RULE[target] || '';
  if (word.type === 'godan') return godanRuleDesc(word.dict.slice(-1), target, word);
  if (word.type === 'ichidan') return ICHIDAN_RULE[target] || '';
  return '';
}
function ruleGeneric(target, type) {
  if (type === 'suru') return SURU_RULE[target] || '';
  if (type === 'kuru') return KURU_RULE[target] || '';
  if (type === 'godan') return godanGenericRule(target);
  if (type === 'ichidan') return ICHIDAN_RULE[target] || '';
  return '';
}
function godanGenericRule(target) {
  switch (target) {
    case 'masu': return '五段动词：词尾「う段」→ 同行的「い段」+ ます。\n例：飲(の)む → 飲(の)みます';
    case 'te': return 'て形按词尾分类（音便）：\n  う・つ・る → って（促音便）\n  ぬ・ぶ・む → んで（撥音便+浊化）\n  く → いて　　ぐ → いで\n  す → して\n例外：行く → 行って（く 但走促音便）';
    case 'ta': return 'た形音便规则与て形相同，把 て/で 改为 た/だ。';
    case 'nai': return '五段动词：词尾「う段」→「あ段」+ ない。\n注意：う 结尾 → わ（例：買う→買わない）。\nある 是例外：直接 → ない（不是 あらない）。';
    case 'potential': return '五段动词：词尾「う段」→「え段」+ る。\n可能形整体变为一段动词。';
    case 'volitional': return '五段动词：词尾「う段」→「お段」+ う。';
    case 'imperative': return '五段动词：词尾「う段」→「え段」单独（不加任何后缀）。';
    case 'prohibitive': return '禁止形 = 辞书形 + な。所有动词通用。';
    case 'ba': return '五段动词：词尾「う段」→「え段」+ ば。';
    case 'tara': return 'たら形 = た形 + ら。音便规则与た形相同。';
    case 'passive': return '五段动词：词尾「う段」→「あ段」+ れる。';
    case 'causative': return '五段动词：词尾「う段」→「あ段」+ せる。';
    case 'causative_passive': return '五段动词：词尾「う段」→「あ段」+ される（短形）。\n或 +せられる（长形，两者通常都接受）。\n注：す结尾不可用短形（×さされる），只能 ~させられる。';
    case 'sonkei': return '尊敬语通式：お + ます形词干 + になる。\n注：高频动词常用词汇化形（食べる→召し上がる等）。';
    case 'kenjo': return '谦让语通式：お + ます形词干 + する。\n注：高频动词常用词汇化形（言う→申す等）。';
  }
  return '';
}
function godanRuleDesc(last, target, word) {
  switch (target) {
    case 'masu': return `五段词尾「${last}」段 → 「${GODAN_I[last]}」段 + ます。`;
    case 'te':
      if (word.teException) return `「${word.dict}」是 て形 例外：く 不走 イ音便，而是 → って。`;
      if ('うつる'.includes(last)) return 'う・つ・る → って（促音便）。\n例外：行く → 行って。';
      if ('ぬぶむ'.includes(last)) return 'ぬ・ぶ・む → んで（撥音便 + 浊化）。';
      if (last === 'く') return 'く → いて（イ音便）。';
      if (last === 'ぐ') return 'ぐ → いで（イ音便 + 浊化）。';
      if (last === 'す') return 'す → して（无音便，直接接 て）。';
      return '';
    case 'ta':
      if (word.teException) return `「${word.dict}」是 た形 例外：く → った（而非 いた）。`;
      return 'た形音便与て形相同，将 て/で 改为 た/だ。';
    case 'nai':
      if (word.naiException) return `「${word.dict}」否定不规则：直接是「${word.naiException}」。`;
      if (last === 'う') return 'う 结尾五段：う → わ + ない。';
      return `五段词尾「${last}」段 → 「${GODAN_A[last]}」段 + ない。`;
    case 'potential': return `五段词尾「${last}」段 → 「${GODAN_E[last]}」段 + る。\n可能形整体变为一段动词。`;
    case 'volitional': return `五段词尾「${last}」段 → 「${GODAN_O[last]}」段 + う。`;
    case 'imperative': return `五段词尾「${last}」段 → 「${GODAN_E[last]}」段（单独，无后缀）。`;
    case 'prohibitive':return '禁止形：辞书形 + な。';
    case 'ba':         return `五段词尾「${last}」段 → 「${GODAN_E[last]}」段 + ば。`;
    case 'tara':       return 'たら形 = た形 + ら。';
    case 'passive':    return `五段词尾「${last}」段 → 「${GODAN_A[last]}」段 + れる。`;
    case 'causative':  return `五段词尾「${last}」段 → 「${GODAN_A[last]}」段 + せる。`;
    case 'causative_passive':
      if (last === 'す') return 'す 结尾五段无短形（×さされる），只能 ~させられる。';
      return `短形：词尾「${last}」段 → 「${GODAN_A[last]}」段 + される。\n长形 ~せられる 也接受。`;
    case 'sonkei': return '尊敬语通式：お + ます形词干 + になる。';
    case 'kenjo':  return '谦让语通式：お + ます形词干 + する。';
  }
  return '';
}
const ICHIDAN_RULE = {
  masu:'一段动词：去 る + ます。', te:'一段动词：去 る + て。',
  ta:'一段动词：去 る + た。',     nai:'一段动词：去 る + ない。',
  potential:'一段动词：去 る + られる（标准）。\n口语 ら抜き：去 る + れる，本工具按标准形判分。',
  volitional:'一段动词：去 る + よう。', imperative:'一段动词：去 る + ろ。',
  prohibitive:'禁止形：辞书形 + な。', ba:'一段动词：去 る + れば。',
  tara:'一段动词：去 る + たら。',     passive:'一段动词：去 る + られる（与可能形同形）。',
  causative:'一段动词：去 る + させる。', causative_passive:'一段动词：去 る + させられる。',
  sonkei:'尊敬语通式：お + 一段词干（去 る）+ になる。',
  kenjo:'谦让语通式：お + 一段词干（去 る）+ する。',
};
const SURU_RULE = {
  masu:'する → します。', te:'する → して。', ta:'する → した。', nai:'する → しない。',
  potential:'する → できる（词汇化的可能形）。', volitional:'する → しよう。',
  imperative:'する → しろ。（书面：せよ）', prohibitive:'する + な → するな。',
  ba:'する → すれば。', tara:'する → したら。',
  passive:'する → される。', causative:'する → させる。',
  causative_passive:'する → させられる。',
  sonkei:'する → なさる（词汇化）。', kenjo:'する → いたす（词汇化）。',
};
const KURU_RULE = {
  masu:'来(く)る → 来(き)ます。词干元音 く→き。',
  te:'来(く)る → 来(き)て。', ta:'来(く)る → 来(き)た。',
  nai:'来(く)る → 来(こ)ない。词干元音 く→こ。',
  potential:'来(く)る → 来(こ)られる。', volitional:'来(く)る → 来(こ)よう。',
  imperative:'来(く)る → 来(こ)い。', prohibitive:'来る + な → 来るな。',
  ba:'来(く)る → 来(く)れば。词干仍读 く。', tara:'来(き)た + ら → 来(き)たら。',
  passive:'来(く)る → 来(こ)られる。', causative:'来(く)る → 来(こ)させる。',
  causative_passive:'来(く)る → 来(こ)させられる。',
  sonkei:'来る → いらっしゃる（词汇化）。', kenjo:'来る → 参(まい)る（词汇化）。',
};

/* ============================================================
   自检
   ============================================================ */
const SELF_TESTS = [
  ['書く','godan','te','書いて'], ['泳ぐ','godan','te','泳いで'],
  ['話す','godan','te','話して'], ['買う','godan','te','買って'],
  ['待つ','godan','te','待って'], ['取る','godan','te','取って'],
  ['死ぬ','godan','te','死んで'], ['遊ぶ','godan','te','遊んで'],
  ['飲む','godan','te','飲んで'],
  ['行く','godan','te','行って',{teException:true}],
  ['食べる','ichidan','te','食べて'],
  ['食べる','ichidan','potential','食べられる'],
  ['書く','godan','potential','書ける'],
  ['買う','godan','nai','買わない'],
  ['ある','godan','nai','ない',{naiException:'ない'}],
  ['帰る','godan','te','帰って'], ['入る','godan','te','入って'],
  ['する','suru','masu','します'], ['する','suru','potential','できる'],
  ['来る','kuru','nai','来ない'], ['来る','kuru','imperative','来い'],
  ['話す','godan','causative_passive','話させられる'],
  ['書く','godan','causative_passive','書かされる'],
];
function runSelfTest() {
  let ok = 0, fail = 0;
  const fails = [];
  for (const t of SELF_TESTS) {
    const [dict, type, target, expected, extra] = t;
    const word = Object.assign({ dict, kana: dict, type }, extra || {});
    const got = conjugate(word, target);
    if (got === expected) ok++;
    else { fail++; fails.push({ dict, type, target, expected, got }); }
  }
  console.log(`%c[活用引擎自检] ${ok}/${ok+fail} 通过`,
    `color:${fail ? '#c84a39' : '#6b9b88'};font-weight:bold;letter-spacing:.05em`);
  if (fail) console.table(fails);
  return { ok, fail, fails };
}

global.Engine = {
  CONJ_LIST, CONJ_LABEL, CONJ_USE,
  conjugate, conjugateKana, acceptableAnswers,
  normalize, checkAnswer,
  ruleExplain, ruleGeneric,
  runSelfTest,
};

})(window);
