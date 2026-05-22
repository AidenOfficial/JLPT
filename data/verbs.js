/* ============================================================
   动词数据 · 扩词参考 schema
   ------------------------------------------------------------
   {
     dict:  '書く',                  // 辞书形（含汉字）
     kana:  'かく',                  // 全假名读法
     type:  'godan' | 'ichidan' | 'suru' | 'kuru',
     level: 'N5' | 'N4' | 'N3' | 'N2',
     zh:    '写',                    // 中文释义
     teException: true,              // [可选] て / た 形音便例外（如 行く）
     naiException: 'ない',           // [可选] 否定形不规则（如 ある）
     tags:  ['自动词']               // [可选] 后续模块 B 使用
   }
   ============================================================ */
window.VERBS = [
  // ========== N5 一段 ==========
  { dict:'食べる', kana:'たべる', type:'ichidan', level:'N5', zh:'吃' },
  { dict:'見る',   kana:'みる',   type:'ichidan', level:'N5', zh:'看' },
  { dict:'起きる', kana:'おきる', type:'ichidan', level:'N5', zh:'起床' },
  { dict:'寝る',   kana:'ねる',   type:'ichidan', level:'N5', zh:'睡觉' },
  { dict:'出る',   kana:'でる',   type:'ichidan', level:'N5', zh:'出去' },
  { dict:'いる',   kana:'いる',   type:'ichidan', level:'N5', zh:'(生物)在' },
  { dict:'着る',   kana:'きる',   type:'ichidan', level:'N5', zh:'穿(上衣)' },
  { dict:'教える', kana:'おしえる',type:'ichidan',level:'N5', zh:'教' },
  { dict:'開ける', kana:'あける', type:'ichidan', level:'N5', zh:'打开' },
  { dict:'閉める', kana:'しめる', type:'ichidan', level:'N5', zh:'关上' },
  // ========== N5 五段（标准）==========
  { dict:'飲む',   kana:'のむ',   type:'godan',   level:'N5', zh:'喝' },
  { dict:'聞く',   kana:'きく',   type:'godan',   level:'N5', zh:'听 / 问' },
  { dict:'話す',   kana:'はなす', type:'godan',   level:'N5', zh:'说话' },
  { dict:'読む',   kana:'よむ',   type:'godan',   level:'N5', zh:'读' },
  { dict:'書く',   kana:'かく',   type:'godan',   level:'N5', zh:'写' },
  { dict:'買う',   kana:'かう',   type:'godan',   level:'N5', zh:'买' },
  { dict:'待つ',   kana:'まつ',   type:'godan',   level:'N5', zh:'等' },
  { dict:'会う',   kana:'あう',   type:'godan',   level:'N5', zh:'见面' },
  { dict:'言う',   kana:'いう',   type:'godan',   level:'N5', zh:'说' },
  { dict:'取る',   kana:'とる',   type:'godan',   level:'N5', zh:'拿' },
  { dict:'作る',   kana:'つくる', type:'godan',   level:'N5', zh:'制作' },
  { dict:'分かる', kana:'わかる', type:'godan',   level:'N5', zh:'懂' },
  { dict:'泳ぐ',   kana:'およぐ', type:'godan',   level:'N5', zh:'游泳' },
  { dict:'死ぬ',   kana:'しぬ',   type:'godan',   level:'N5', zh:'死' },
  { dict:'遊ぶ',   kana:'あそぶ', type:'godan',   level:'N5', zh:'玩' },
  // 例外
  { dict:'行く',   kana:'いく',   type:'godan',   level:'N5', zh:'去', teException:true },
  { dict:'ある',   kana:'ある',   type:'godan',   level:'N5', zh:'(无生物)在', naiException:'ない' },
  // 看似一段实为五段
  { dict:'帰る',   kana:'かえる', type:'godan',   level:'N5', zh:'回家（看似一段）' },
  { dict:'入る',   kana:'はいる', type:'godan',   level:'N5', zh:'进入（看似一段）' },
  { dict:'知る',   kana:'しる',   type:'godan',   level:'N5', zh:'知道（看似一段）' },
  { dict:'切る',   kana:'きる',   type:'godan',   level:'N5', zh:'切（看似一段）' },
  { dict:'要る',   kana:'いる',   type:'godan',   level:'N5', zh:'需要（看似一段）' },
  // 不规则
  { dict:'する',   kana:'する',   type:'suru',    level:'N5', zh:'做' },
  { dict:'来る',   kana:'くる',   type:'kuru',    level:'N5', zh:'来' },

  // ========== N4 ==========
  { dict:'走る',   kana:'はしる', type:'godan',   level:'N4', zh:'跑（看似一段）' },
  { dict:'探す',   kana:'さがす', type:'godan',   level:'N4', zh:'寻找' },
  { dict:'急ぐ',   kana:'いそぐ', type:'godan',   level:'N4', zh:'急 / 快' },
  { dict:'選ぶ',   kana:'えらぶ', type:'godan',   level:'N4', zh:'选择' },
  { dict:'運ぶ',   kana:'はこぶ', type:'godan',   level:'N4', zh:'搬运' },
  { dict:'押す',   kana:'おす',   type:'godan',   level:'N4', zh:'推' },
  { dict:'引く',   kana:'ひく',   type:'godan',   level:'N4', zh:'拉 / 查' },
  { dict:'答える', kana:'こたえる',type:'ichidan',level:'N4', zh:'回答' },
  { dict:'比べる', kana:'くらべる',type:'ichidan',level:'N4', zh:'比较' },
  { dict:'伝える', kana:'つたえる',type:'ichidan',level:'N4', zh:'传达' },
  { dict:'決める', kana:'きめる', type:'ichidan', level:'N4', zh:'决定' },
  { dict:'貸す',   kana:'かす',   type:'godan',   level:'N4', zh:'借出' },
  { dict:'借りる', kana:'かりる', type:'ichidan', level:'N4', zh:'借入' },
  { dict:'喋る',   kana:'しゃべる',type:'godan',  level:'N4', zh:'闲聊（看似一段）' },
  { dict:'焦る',   kana:'あせる', type:'godan',   level:'N4', zh:'焦急（看似一段）' },
  { dict:'滑る',   kana:'すべる', type:'godan',   level:'N4', zh:'滑（看似一段）' },

  // ========== N3 ==========
  { dict:'握る',   kana:'にぎる', type:'godan',   level:'N3', zh:'握（看似一段）' },
  { dict:'蹴る',   kana:'ける',   type:'godan',   level:'N3', zh:'踢（看似一段）' },
  { dict:'減る',   kana:'へる',   type:'godan',   level:'N3', zh:'减少（看似一段）' },
  { dict:'戻る',   kana:'もどる', type:'godan',   level:'N3', zh:'返回' },
  { dict:'含む',   kana:'ふくむ', type:'godan',   level:'N3', zh:'包含' },
  { dict:'整える', kana:'ととのえる',type:'ichidan',level:'N3',zh:'整理' },
  { dict:'認める', kana:'みとめる',type:'ichidan',level:'N3', zh:'承认' },
  { dict:'勧める', kana:'すすめる',type:'ichidan',level:'N3', zh:'推荐' },

  // ========== N2 ==========
  { dict:'競る',   kana:'せる',   type:'godan',   level:'N2', zh:'竞争（看似一段）' },
  { dict:'携わる', kana:'たずさわる',type:'godan',level:'N2', zh:'从事' },
  { dict:'貫く',   kana:'つらぬく',type:'godan',  level:'N2', zh:'贯穿' },
  { dict:'損なう', kana:'そこなう',type:'godan',  level:'N2', zh:'损害' },
  { dict:'催す',   kana:'もよおす',type:'godan',  level:'N2', zh:'举办' },
  { dict:'省みる', kana:'かえりみる',type:'ichidan',level:'N2',zh:'反省' },
  { dict:'試みる', kana:'こころみる',type:'ichidan',level:'N2',zh:'尝试' },
];
