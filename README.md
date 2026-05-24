# Aiden の 日本語復習

Local and PWA-ready.
全本地、可离线、PWA Ready。

---

## 是什么 · What it is

五个模块，覆盖 N5–N2 的复习节奏：

5 modules covering JLPT N5–N2.

| 模块 | 内容 |
|---|---|
| **動詞活用** Verbs | 五段 / 一段 / する / 来る × 15 种活用形（ます・て・た・ない・可能・意志・命令・禁止・ば・たら・受身・使役・使役受身・尊敬・謙譲）。判分接受汉字与假名，引擎按规则推导而**不存任何活用结果**。 |
| **文型** Grammar | 10 个功能组、564 个文型（N5 86 / N4 103 / N3 143 / N2 232）；两种题型：穴埋め（4 选 1 辨析，干扰项从同 cluster 抽）+ 並べ替え（token bank 排序）。N5–N4 仅闪卡数据，无穴埋め / 並べ替え 题目。 |
| **学習** Learn | 闪卡模式：新卡正反同显 → 「未掌握」入复习池 / 「已掌握」永久跳过；复习卡先盖住 → 翻面后「まだ」(weight ×2 留池) / 「覚えた」(移出)。回顾窗里两路：「開始復習」+ 「履歴を見る」(掌握 / 未掌握清单)。**不依赖真实时间**——Web 没主动推送，硬上 Ebbinghaus 会塌成"积压式洪水"，故只保留弱 SRS（按错过次数加权）。 |
| **試験** Test | 限定题数（10/20/30/50）+ 混合 verb / grammar。中途无即时反馈、末尾出成绩单 + 逐题清单 + 自动写回各模块错题本。 |
| **復習** Review | 聚合 verb / grammar 错题，点条直达原题，按时间倒序。一键导出 Markdown 上下文（含统计 + 弱点 + 错题明细）给 AI 助手做诊断。 |

---

## 如何运行 · Run

无构建、无包管理器，三种方式任选其一：

```bash
# 直接 file://
open index.html         # macOS
xdg-open index.html     # Linux
start index.html        # Windows

# 任意静态服务（推荐 — PWA / Service Worker 需要 http(s)）
python3 -m http.server 8765
# → http://127.0.0.1:8765
```

所有进度持久化在 `localStorage` (`jp_reviewer_v4`)；清浏览器数据会重置。
The Progress storage in the `localStorage`.

---

## 安装为 App · Install as PWA

通过 `python3 -m http.server`（或任何 http(s) origin）打开后，浏览器地址栏会出现「安装」图标：

- **Chrome / Edge** 桌面：点地址栏右侧「⊕」装为独立窗口。
- **Safari iOS** ：分享 → 添加到主屏幕。
- **Safari macOS 17+** ：菜单 File → 添加到 Dock。

离线后仍可使用：Service Worker 缓存了 app shell（HTML / CSS / JS / 数据 / 图标）。外部字体（Zen Old Mincho / Zen Kaku Gothic / EB Garamond，从 jsDelivr 拉取）首次联网时取得后由浏览器自动复用；Apple 平台不下载 web font，直接用 Hiragino。

发布新版本：bump `service-worker.js` 的 `CACHE_VERSION`，下次 activate 会清掉旧缓存。

---

## 目录 · Layout

```
index.html              入口；script defer 顺序固定，load order 决定 window.* 挂载链
styles.css              设计 tokens（:root 顶端）+ 全部样式；约 1500 行单文件
manifest.webmanifest    PWA 元信息
service-worker.js       cache-first app shell + network-first 导航回退
icon.svg                墨と朱「和」字印章
data/
  verbs.js              window.VERBS
  grammar.js            window.GRAMMAR_GROUPS + 空的 window.GRAMMAR
  grammar-<group>.js    各功能组分别 push 到 window.GRAMMAR（含 N2 完整 cloze/scramble）
  grammar-n<5..3>.js    闪卡专用 — N5/N4/N3 等级补全；只含核心字段无 cloze/scramble
  grammar-n2-extra.js   N2 大纲补遗
js/
  fonts.js              非 Apple 平台的 web font 切换控制
  engine.js             window.Engine — 活用引擎（规则推导，含 self-test）
  state.js              window.State — localStorage + SRS-lite + 通用工具
  ui-shared.js          window.UI — escapeHtml / withRuby / dialog / chips / toast / 剪贴板
  module-verb.js        window.ModuleVerb
  module-grammar.js     window.ModuleGrammar
  module-learn.js       window.ModuleLearn — 闪卡 + 弱 SRS
  module-test.js        window.ModuleTest
  module-review.js      window.ModuleReview
  app.js                window.App — 模块编排 / nav / 设置 / 状态条
```

---

## 模块契约 · Module contract

`app.js` 通过统一接口在 5 个模块间切换：

```js
{
  id, label, labelEn,
  mount(rootEl),
  unmount(),                          // 不清状态：切换模块保留当前题
  getStats() -> { answered, correct, streak, mistakes },
  handleGlobalEnter() -> bool,        // true = consumed
  startReviewMistake?(record)         // verb / grammar：从错题列表跳转出题
}
```

加新模块就照这个 shape 写一个 `js/module-xxx.js`，挂到 `window.ModuleXxx`，然后在 `app.js` 的 `MODULES` 和 `MODULE_ORDER` 注册一下。

---

## 数据格式 · Data shapes

### 动词 verbs.js

```js
{
  dict: '飲む',           // 辞书形
  kana: 'のむ',           // 全假名
  type: 'godan',          // godan | ichidan | suru | kuru
  level: 'N5',            // N5 | N4 | N3 | N2
  zh: '喝',
  teException: true,      // 行く 类
  naiException: 'ない',   // ある 类
}
```

引擎按 `type` + 词尾五段推导，绝不硬编码活用结果。

### 文型 grammar-<group>.js

```js
{
  id: 'nimokakawarazu',
  pattern: '〜にもかかわらず',
  group: 'concession',             // 必须是 GRAMMAR_GROUPS 中存在的 id
  cluster: 'concession_despite',   // 穴埋め干扰项从同 cluster 抽
  level: 'N2',
  setsuzoku: 'N / V普通形 + にもかかわらず',
  meaning_zh: '尽管…还是…',
  nuance_zh: '正式书面语；强烈对比；客观叙述',
  examples: [{ jp, zh }],
  cloze:    [{ sentence: '...___...', zh }],
  scramble: [{ tokens: [...], pattern_index, zh }],   // tokens 按正确顺序存
}
```

---

## 状态 · State

- 全部存 `localStorage[jp_reviewer_v4]`
- 旧版本数据：v3 → v4 自动迁移
- **SRS-lite** (verb / grammar)：答错 → weight ×2（cap 8）；答对 → weight ÷2（floor 0.25）。出题用 `UI.weightedPick` 加权抽样。
- **学習弱 SRS**：复习卡选"还不会" → weight ×2（cap 8）；"已掌握" → 移出 learning 池。不依赖真实时间。
- 错题：顶部插入，截 200 条；同题答对会自动从错题集移除。

---

## 设计系统 · Design

`:root` 顶端的 CSS 变量是单一来源：

- 墨 `--ink #0a0908` / 和纸 `--washi-*` / 朱 `--vermillion #c84a39` / 翠 `--jade #6b9b88`
- 字体链：Apple 走 Hiragino；非 Apple 在下一次 `#mount` 内容变化时切换到 Zen 系列（避免 in-place 重排扰动用户）
- 触屏：扩大点击判定但不放大视觉
- 尊重 `prefers-reduced-motion`

---

## 常见任务 · Common changes

- **加一个动词**：push 到 `data/verbs.js`。
- **加一条文型**：push 到对应 `data/grammar-<group>.js`，挑选或新建 `cluster`（同 cluster 互为穴埋め干扰项，所以应当真正易混）。
- **加一种活用形**：扩 `engine.js` 的 `CONJ_LIST` + `godanConjugate` / `ichidanConjugate` / `SURU` / `KURU_*`，补 rule 字符串，加 row 到 `SELF_TESTS`。`State.defaultState()` 会自动让现有用户启用新形。
- **加一个模块**：新建 `js/module-xxx.js` → 注册到 `app.js` `MODULES` / `MODULE_ORDER` → script defer 挂到 `index.html`。
- **bump schema**：改 `STORAGE_KEY`，写 `migrate<old>()` 在 `load()` 里调用（参照 v3→v4 路径）。

---

## License

私人项目，未指定 license。代码以 MIT 风格借用 / 学习随意，但请别照抄成商业品。
