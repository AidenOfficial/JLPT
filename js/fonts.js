/* ============================================================
   Web font 加载控制
   - Apple 平台跳过：Hiragino 已经完美，不下载也不切换
   - 其他平台：先用本地 Yu Mincho / Yu Gothic / Cambria 兜底渲染；
     后台预下 Zen Old Mincho / Zen Kaku Gothic New / EB Garamond；
     等用户下一次「页面变化」（#mount 内容刷新）的瞬间，
     在**同一帧**给 <html> 加 .fonts-loaded class——字体与内容
     一起替换，避免凝视同一界面时字突然变样的不适感
   - jsDelivr 5s 内未加载即把 link href 切到 unpkg
   ============================================================ */
(function(global) {
'use strict';

function isAppleDevice() {
  const p = navigator.platform || '';
  const u = navigator.userAgent || '';
  return /Mac|iPhone|iPad|iPod/.test(p) || /Macintosh|iPhone|iPad/.test(u);
}

if (isAppleDevice()) return;  // index.html 内联检测应已跳过；双保险

let _ready = false;
let _applied = false;

function apply() {
  if (_applied) return;
  _applied = true;
  document.documentElement.classList.add('fonts-loaded');
}

/* ---------- 预下载常见字符（命中相应 unicode-range chunk） ---------- */
function preload() {
  if (!document.fonts || !document.fonts.load) {
    _ready = true;
    return;
  }
  // 覆盖：基本假名 / 常用日文汉字 / N2 高频汉字 / 拉丁基本字母数字
  const jp = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをんアイウエオカキクケコ一二三四五六七八九十日月人本語年時間出入大小高低中上下来行食飲書読見聞言話思知考味意活用形助詞副詞名詞動詞条件原因結果可能受身使役命令意向過去現在未来正誤級辞典';
  const lt = 'AaBbCcDdEeFfGgHhIiJjKkLlMmNnOoPpQqRrSsTtUuVvWwXxYyZz0123456789';
  const targets = [
    ['500 16px "Zen Old Mincho"', jp],
    ['700 16px "Zen Old Mincho"', '正解誤級活用'],
    ['400 16px "Zen Kaku Gothic New"', jp],
    ['500 16px "Zen Kaku Gothic New"', '助詞副詞名詞動詞'],
    ['italic 400 16px "EB Garamond"', lt],
  ];
  Promise.all(targets.map(([f, t]) =>
    document.fonts.load(f, t).catch(() => null)
  )).then(() => { _ready = true; tryApplyOnNextTransition(); });
}

/* ---------- CDN 候补：jsDelivr 失败 → unpkg ---------- */
function setupFallback() {
  const links = Array.from(document.querySelectorAll('link[data-webfont]'));
  if (!links.length) return;
  setTimeout(() => {
    links.forEach(l => {
      if (!l.sheet) {
        l.href = l.href.replace(
          'cdn.jsdelivr.net/npm/@fontsource/',
          'unpkg.com/@fontsource/'
        );
      }
    });
  }, 5000);
}

/* ---------- 在「页面变化」时同步 swap 字体 ----------
   监听 #mount 子节点变更——所有 quiz 模块 nextQuestion/mount/render
   都通过替换 #mount.innerHTML 推进，正是用户视觉上的「页面变化」节点。
   ---------------------------------------------------------- */
let _observer = null;
function tryApplyOnNextTransition() {
  if (_applied || !_ready) return;
  if (_observer) return;  // 已经在等
  const mount = document.getElementById('mount');
  if (!mount) {
    // DOM 还没准备好；下个 tick 再试
    requestAnimationFrame(tryApplyOnNextTransition);
    return;
  }
  _observer = new MutationObserver(() => {
    if (_ready && !_applied) {
      apply();
      _observer.disconnect();
      _observer = null;
    }
  });
  _observer.observe(mount, { childList: true, subtree: false });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setupFallback();
    preload();
  });
} else {
  setupFallback();
  preload();
}

})(window);
