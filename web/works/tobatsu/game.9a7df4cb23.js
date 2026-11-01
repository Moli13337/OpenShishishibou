/*
 * 讨伐任务 · 状态机
 *
 * 流程：
 *   委托单 →「开始」→ 剧情·开场 → 准备倒数 → 战斗（一组）→ 通过 → 暂停（继续 / 撤退）→ 准备倒数 → … 共 N 组
 *   → 全部通过 → 剧情·结局 → 最后一击？
 *        给出最后一击 → 讨伐成功
 *        饶过魔物     → 剧情·绕过 → 准备倒数 → 无尽战斗（不会赢）→ 放弃 → 无尽结算
 *   战斗中长按放弃 → 放弃结算；暂停时撤退 → 撤退结算；挑战失手 → 败北结算。
 *   三种结算都是「败北」/「委托单」：点「败北」→ 败北处决（她数 10 秒，没有操作）→ 数到 0 彻底败北 →「重来」从第 1 组的准备倒数开始
 *
 * 画面（#app[data-screen]）：brief 委托单 / story 剧情 / prep 准备 / hold 战斗 / pass 通过 / pause 暂停 /
 *   clear 全部通过 / choice 最后一击 / victory 讨伐成功 / endless 无尽战斗 / over 无尽结算 / lose 放弃结算 /
 *   retreat 撤退结算 / fall 败北结算（挑战没在限时内完成，challenge.js）/ execute 败北处决 / executed 处决数到 0 之后（彻底败北）
 *
 * 连贯的组（quest.flow = "continuous"，003）：组与组之间不停，秒数走完按 overtime 演（卡在 1 / 数小数 / 往回涨 / 往上数）再直接接下一组，见「超时」一节
 *
 * 事件（之后接 SFX 用）：tobatsu.on(类型, fn)。类型：
 *   screen {screen}              换画面
 *   phase  {phase}               战斗换阶段（early / mid / late）
 *   art    {slot}                切战斗图
 *   beat   {phase, interval}     心跳
 *   rhythm {edge, rep}           指示器撞到顶端（top，记一次）/ 底端（bottom）
 *   line   {pool, text, who?}    说话（台词条、cut-in、剧情对话）
 *   cutin  {state, pool}         cut-in：in / out
 *   press  {state, progress}     长按放弃：start / release（没按满松手）/ commit（生效）
 *   count  {left}                准备倒数每过一整秒
 *   second {elapsed, left}       战斗中每过一整秒（left：本组还剩几秒；无尽战斗没有）
 *   pause  {state}               页面切走 hidden / 回来 resume（战斗中回来先倒数 3 秒再接着来）
 *   tap    {}                    点了按钮
 *   clock  {kind, …}             超时的秒数：step 换一步 / tick 卡住时又数一次 / count 换一个数字 / rewind 往回涨（from, to, seconds）
 *   set    {set, continuous}     连贯的组接到下一组
 *   execute {state, left, seconds, hold}  败北处决：intro 进来 / line 前言说一句（index, count）/ cutin「倒数开始」/ start 开始数 / second 每过一整秒（left 还剩几秒）/ zero 数到 0（hold 秒后出彻底败北）
 *
 * 委托：common.jsonc 是公共参数，quest-<编号>.jsonc 是这份委托的；地址 ?quest=<编号> 选委托，没写用 common.jsonc 的 quests.default。
 * 音效：common.jsonc 的 sfx.slots 按名字配文件，下面「音效」一节把上面这些事件接到槽上；没配文件的槽不出声。
 * 调节奏：tuner.html 通过 window.tobatsu.tune 实时改参数；存下来的档位在 localStorage，本机进游戏时一起读进来。
 *   pass   {set}                 一组通过
 *   run    {state, set?}         一次挑战开始：start（从头）/ retry（重来这一组，set＝从第几组）——card.js 按它重置 / 还原等级
 *   stay   {state, set?, count?} 逗留（超时步骤 do: stay）：start 秒数到 0、盖了「通过」/ pass 按满「长按通过」走了（count＝留了几格）
 *   name   {name}                剧情里登记了冒险者的名字（input: name）
 *   choose {id}                  选单：continue / retreat / strike / bypass
 *
 * 时间：游戏内时钟 = 真实时间 × 倍速（倍速只在 ?dev=1 面板里改）。长按、cut-in 停留、印章停留按真实时间。
 * 页面切到后台 / 锁屏时游戏暂停；战斗中回来先倒数 3 秒再接着计时。
 * 秒数：每组显示倒计时（还剩几秒），无尽战斗显示已坚持的秒数。
 */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const app = $('app');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const SKEW = 'skew(-14deg)';

  // ---------- 读 JSON（带注释） ----------

  /** 去掉 // 与 /* *\/ 注释和收尾多余的逗号；字符串里的内容原样保留 */
  function stripJsonc(src) {
    let out = '';
    for (let i = 0; i < src.length; i++) {
      const c = src[i];
      if (c === '"') {
        let j = i + 1;
        while (j < src.length && src[j] !== '"') j += src[j] === '\\' ? 2 : 1;
        out += src.slice(i, j + 1);
        i = j;
      } else if (c === '/' && src[i + 1] === '/') {
        while (i < src.length && src[i] !== '\n') i++;
        out += '\n';
      } else if (c === '/' && src[i + 1] === '*') {
        i += 2;
        while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++;
        i++;
      } else if (c === ',') {
        let j = i + 1;
        while (j < src.length && /\s/.test(src[j])) j++;
        if (src[j] !== '}' && src[j] !== ']') out += c;
      } else {
        out += c;
      }
    }
    return out;
  }

  async function loadJsonc(file) {
    const res = await fetch(file, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${file}：读不到（${res.status}）`);
    const text = await res.text();
    try {
      return JSON.parse(stripJsonc(text));
    } catch (e) {
      // 报出行号，方便照着改
      const pos = Number(/position (\d+)/.exec(e.message)?.[1]);
      const line = Number.isFinite(pos) ? stripJsonc(text).slice(0, pos).split('\n').length : null;
      throw new Error(`${file}${line ? ` 第 ${line} 行附近` : ''}格式不对：${e.message}`);
    }
  }

  function oops(message) {
    const box = document.createElement('div');
    box.className = 'oops';
    box.innerHTML = `<p>${tr('游戏文件有问题，没法开始。')}</p><code></code>`;
    box.querySelector('code').textContent = message;
    app.append(box);
  }

  // ---------- 事件 ----------

  const bus = new EventTarget();
  const devLog = [];
  function emit(type, detail = {}) {
    bus.dispatchEvent(new CustomEvent(type, { detail }));
    devLog.unshift(`${type} ${JSON.stringify(detail)}`);
    devLog.length = Math.min(devLog.length, 8);
    dev.refresh?.();
  }
  window.tobatsu = {
    on: (type, fn) => bus.addEventListener(type, (e) => fn(e.detail)),
    // 现在这份委托的一个台词池（已经按角色增删、换过自称、翻成当前语言），查问题和测试用
    pool: (name) => (Array.isArray(L?.[name]) ? [...L[name]] : null),
  };

  // ---------- 小工具 ----------

  const SLOT_CN = { idle: '待机', early: '前段', mid: '中段', late: '后段', win: '成功反应', lose: '放弃反应', retreat: '撤退反应', endless: '无尽战斗' };
  const PHASE_CN = { early: '前段', mid: '中段', late: '后段' };
  const C = {
    navy: '#1f2c7c',
    deep: '#10173f',
    dim: '#2c3fa6',
    ver: '#ff4a2a',
    hud: '#c8ff2e',
    cream: '#fff5e1',
    creamDim: '#e6e3dc',
    ink: '#0b0b12',
    inkSoft: '#2a2a36',
    grey: '#8e8ea0',
  };

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function sticker(el, text) {
    el.textContent = text;
    el.dataset.text = text;
  }

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function stickerEl(tag, className, text) {
    const e = el(tag, `sticker ${className ?? ''}`.trim());
    sticker(e, text);
    return e;
  }

  function animate(node, frames, opts) {
    if (reduce.matches || !node?.animate) return null;
    return node.animate(frames, opts);
  }

  /** 砸下来：放大淡入 → 落定（印章、大标题用） */
  function slam(node, delay = 0) {
    animate(
      node,
      [
        { opacity: 0, scale: '2.2' },
        { opacity: 1, scale: '0.94', offset: 0.7 },
        { opacity: 1, scale: '1' },
      ],
      { duration: 280, delay, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' },
    );
  }

  let Q; // common.jsonc → quest-<编号>.jsonc → 立绘档案，依次盖上去
  let L; // lines-common.jsonc + lines-<编号>.jsonc
  let STORY; // story-<编号>.jsonc
  const lastPick = {};

  // ================= 语言（日语、英语版，站主 2026-09-19；韩语 2026-10-14） =================
  /**
   * 地址 ?lang=ja / en / ko（任务墙外语版的启动页带过来）：读包里的 tr-<语言>.jsonc——「中文原句 → 译文」对照表。
   * 台词池、剧情、委托单和界面上的字按原句查表换掉；表里没有的原样显示中文（改了中文原句、表没跟上时也是这样，
   * scripts/art/tobatsu-tr-check.mjs 列得出来）。只换「显示的字」：池名、演出名、颜色名这些引用不进表、不查表。
   * 认哪几种语言不写死：包里有那种语言的表就换，没有（loadQuest 读不到）就退回中文——加语言只放一张表
   */
  const want = pageParam('lang') ?? '';
  let LANG = /^[a-z]{2}$/.test(want) && want !== 'zh' ? want : 'zh';
  let TR = null;
  /** 查表；{名字} 占位按 vars 换（界面字的中文原句写成带占位的，如「第 {n} 组」） */
  function tr(text, vars) {
    let s = typeof text === 'string' ? (TR?.get(text) ?? text) : text;
    if (vars) s = String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
    return s;
  }
  /**
   * 字宽（按一个汉字算 1）：汉字、假名、全角 1，拉丁字母、数字、半角符号约 0.55。
   * 字数上限（大字 8 字、拟声 6 字、断行）都按它量，英语句子才不会全被当成「太长」
   */
  const WIDE = /[\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe30-\ufe4f\uff00-\uff60\uffe0-\uffe6\u3000-\u303f\u3040-\u30ff\u2600-\u27bf]/;
  const glyphLen = (s) => [...String(s)].reduce((n, ch) => n + (WIDE.test(ch) ? 1 : 0.55), 0);
  /** 剧情里要换的字段（其余是 who / her / bg / fx / sfx 这些引用） */
  // order / after：被命令的选择里命令的大字、命令之后换的那句（006 假通关）；lines：倒数时每个数换的那句（006 开场，字符串数组）
  // label：剧情里选项（ask）的字；name：这一句的名牌（008 开场的 Aschan）
  const STORY_TEXT = new Set(['text', 'question', 'continue', 'retreat', 'strike', 'bypass', 'fight', 'spare', 'order', 'after', 'admit', 'refuse', 'label', 'name']);
  function trStory(node) {
    if (Array.isArray(node)) return node.map(trStory);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) {
      if (typeof v === 'string' && STORY_TEXT.has(k)) out[k] = tr(v);
      else if (k === 'lines' && Array.isArray(v)) out[k] = v.map((s) => (typeof s === 'string' ? tr(s) : s));
      else out[k] = trStory(v);
    }
    return out;
  }
  /**
   * 委托数据里显示的字：quest 的名字、说明、委托人……，演出表 / 定时演出里的 text、提示条 tip，
   * 出题带的命令 order、幻化的 pill、分岔两头的牌子 passTag / rewardTag、揭穿时砸的字 reveal（006）。
   * 文字顺序题的句子（labels）不在这里换：出题时才查表、拆成一枚一枚的章（challenge.js buildOrder）
   */
  const QUEST_TEXT = ['name', 'duration', 'description', 'detail', 'tag', 'tagLong', 'client', 'herName', 'hero', 'suggestion'];
  const QUEST_DATA_TEXT = new Set(['text', 'tip', 'readyTip', 'order', 'pill', 'passTag', 'rewardTag', 'reveal']);
  function trQuestData(node) {
    if (Array.isArray(node)) return node.map(trQuestData);
    if (!node || typeof node !== 'object') return node;
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = typeof v === 'string' && QUEST_DATA_TEXT.has(k) ? tr(v) : trQuestData(v);
    return out;
  }
  function localize() {
    // 委托单上的名字、说明：quest.i18n 里已经有（任务墙用的同一份），先盖上；日语名字里的半角空格是任务墙的折行点，这里不要
    const own = Q.quest.i18n?.[LANG] ?? {};
    for (const k of QUEST_TEXT) if (typeof own[k] === 'string') Q.quest[k] = k === 'name' ? own[k].replace(/ +/g, LANG === 'ja' ? '' : ' ') : own[k];
    if (own.unlockCondition && Q.quest.unlock) Q.quest.unlock = { ...Q.quest.unlock, condition: own.unlockCondition };
    for (const k of QUEST_TEXT) if (typeof Q.quest[k] === 'string' && !own[k]) Q.quest[k] = tr(Q.quest[k]);
    for (const k of ['sets', 'stage', 'endless', 'timing', 'execute']) if (Q[k]) Q[k] = trQuestData(Q[k]);
    for (const [pool, arr] of Object.entries(L)) if (Array.isArray(arr)) L[pool] = arr.map((s) => (typeof s === 'string' ? tr(s) : s));
    STORY = trStory(STORY);
    document.documentElement.lang = LANG;
    document.title = tr(document.title);
    // 页面上写死的字（委托书的栏目名、节奏轨的「提 / 压」、放弃按钮……）和它们的贴纸描边层、读屏名
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.nodeValue.trim();
      if (t && TR.has(t)) n.nodeValue = n.nodeValue.replace(t, TR.get(t));
    }
    for (const e of document.querySelectorAll('[data-text]')) if (TR.has(e.dataset.text)) e.dataset.text = TR.get(e.dataset.text);
    for (const e of document.querySelectorAll('[aria-label]')) e.setAttribute('aria-label', tr(e.getAttribute('aria-label')));
  }
  /** 日语、英语的名字比中文长：放不下就按字宽缩字号（base 是 CSS 里的字号，fit 是一行放得下几个汉字宽） */
  function fitText(node, text, base, fit, min = 11) {
    const w = glyphLen(text);
    node.style.fontSize = LANG !== 'zh' && w > fit ? `${Math.max(min, Math.floor((base * fit) / w))}px` : '';
  }
  /** HUD 左边的委托名。日英版的名字长：放不下就去掉「讨伐 ·」系列名，再不够就缩字号 */
  function setHudName() {
    const name = LANG !== 'zh' && glyphLen(Q.quest.name) > 10 ? Q.quest.name.replace(/^.+?\s*[·・]\s*/, '') : Q.quest.name;
    sticker($('hud-name'), name);
    fitText($('hud-name'), name, 15, 8.5);
  }
  /** 言责的尾巴换成当地的写法：日语的波浪号用「〜」，英语的 w（嘲笑）换成 lol，韩语一个 w 换一个 ㅋ（~ 不变） */
  function localTail(tail) {
    if (LANG === 'ja') return tail.replaceAll('~', '〜');
    if (LANG === 'en') return tail.replace(/^w+/, (m) => (m.length === 1 ? ' lol' : m.length === 2 ? ' lmao' : ' LMAO'));
    if (LANG === 'ko') return tail.replace(/^w+/, (m) => 'ㅋ'.repeat(m.length));
    return tail;
  }

  /**
   * 台词池的三种写法：一个池名 "池"；几个池名 ["池1", "池2"]（平均挑一个池）；带权重 { "池1": 2, "池2": 1 }。
   * 返回这一次挑中的池名（没有可挑的返回 undefined）
   */
  function poolOf(spec) {
    if (Array.isArray(spec)) return spec.length ? spec[Math.floor(Math.random() * spec.length)] : undefined;
    if (spec && typeof spec === 'object') {
      const entries = Object.entries(spec).filter(([, w]) => w > 0);
      let r = Math.random() * entries.reduce((a, [, w]) => a + w, 0);
      for (const [name, w] of entries) if ((r -= w) <= 0) return name;
      return entries.at(-1)?.[0];
    }
    return spec || undefined;
  }

  /**
   * 言责后缀（common.jsonc 的 speech.suffix）：speech.suffix.pools 里列了的池，取出来的句子按这一段的机会随机加个尾巴
   * （「w」「~」「♥」「…」「~~♥♥♥」……）；byPhase 可以按段换一套更重的。句子本来就以这些结尾的不再加
   */
  const SUFFIX_END = /[wㅋ~～〜♥♡…]$/;
  function suffixed(pool, text) {
    const sf = Q.speech?.suffix;
    if (!sf?.pools?.[pool] || typeof text !== 'string' || SUFFIX_END.test(text)) return text;
    const where = S.screen === 'endless' ? 'endless' : S.screen === 'hold' || S.screen === 'prep' ? S.phase : 'other';
    const chance = typeof sf.chance === 'number' ? sf.chance : (sf.chance?.[where] ?? sf.chance?.other ?? 0.5);
    if (Math.random() >= chance) return text;
    const tail = poolOf({ ...sf.pools[pool], ...(sf.byPhase?.[where]?.[pool] ?? {}) });
    return tail ? text + localTail(tail) : text;
  }

  /**
   * 从池里随机取一句；最近取过的先不取——记住池子六成那么多句（至少不和上一次重复），十句的池要隔六句才会再说到同一句
   * （原来只躲开上一句，一组里同一句能出现三次）。pool 可以是上面三种写法，言责池会按规则加后缀
   */
  function pick(spec) {
    const pool = poolOf(spec);
    const arr = L[pool];
    if (!Array.isArray(arr) || !arr.length) return `[${pool}·缺句]`;
    const seen = (lastPick[pool] ??= []);
    const keep = Math.min(arr.length - 1, Math.max(1, Math.floor(arr.length * 0.6)));
    const fresh = arr.map((_, k) => k).filter((k) => !seen.includes(k));
    const i = fresh.length ? fresh[Math.floor(Math.random() * fresh.length)] : Math.floor(Math.random() * arr.length);
    seen.push(i);
    while (seen.length > keep) seen.shift();
    let text = suffixed(pool, arr[i]);
    // {lv}：冒险者卡现在的等级（007，card.js）；{name}：冒险者的名字（剧情里登记的）
    if (text.includes('{lv}')) text = text.replaceAll('{lv}', String(window.tobatsu._?.cardLv?.() ?? ''));
    return withName(text);
  }

  /** 台词条换一句；pool 空（演出表里这一格没写 line）就清空台词条 */
  function say(pool) {
    if (!pool || !poolOf(pool)) {
      $('say-text').textContent = '';
      return '';
    }
    const text = pick(pool);
    $('say-text').textContent = text;
    emit('line', { pool, text });
    return text;
  }

  // ---------- 冒险者的名字（007 起：开场剧情里做冒险者卡时登记，存本机、各委托共用）----------
  const NAME_KEY = 'tobatsu.player-name';
  function playerName() {
    try {
      return localStorage.getItem(NAME_KEY) || '';
    } catch {
      return '';
    }
  }
  /** 台词里的 {name} 换成名字；没登记过就是「新人」。韩语的「{name} 군」：名字和「군」之间换成不折行的空格，换行时「군」不会单独掉到下一行 */
  const withName = (text) => (typeof text === 'string' && text.includes('{name}') ? text.replace(/\{name\} 군/g, '{name} 군').replaceAll('{name}', playerName() || tr('新人')) : text);

  // ---------- 占位图 ----------

  const svg = (viewBox, body, aspect = 'xMidYMid meet') =>
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" preserveAspectRatio="${aspect}">${body}</svg>`;

  function imgNode(src) {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    img.decoding = 'async';
    return img;
  }

  function fromMarkup(markup) {
    const t = document.createElement('template');
    t.innerHTML = markup;
    return t.content.firstElementChild;
  }

  /**
   * 战斗画面的角色图：有整张图就用图；配了 battleStandee 就用立绘（按 frames / 镜头取景，越到后段越近）——立绘就是正式的战斗图，
   * 不挂占位标签；两样都没有才是色块占位
   */
  function artNode(slot, mode = 'battle') {
    const src = Q.art?.battle?.[slot];
    if (src) return imgNode(src);
    const ph = el('div', 'ph');
    ph.dataset.slot = slot;
    const bs = Q.art?.battleStandee;
    const frame = bs?.src && bs.frames?.[slot];
    if (frame) {
      ph.classList.add('ph--standee');
      // 这一组写了镜头（sets[n - 1].camera）：战斗画面（准备和各段）按镜头取景，不按 frames；切阶段的 cut-in 照旧按 frames（上半身）。
      // 委托书不跟镜头：按 frames.idle（原来跟着第 1 组镜头第 0 秒走，写了镜头的委托改 idle 不生效——站主 2026-09-17 说了几次「还是太近」）
      const cam = mode === 'battle' && CAMERA_SLOTS.has(slot) && S.screen !== 'brief' ? cameraAt(S.screen === 'hold' || S.screen === 'execute' ? S.elapsed : 0) : null;
      const fimg = framedImg(bs.src, cam ?? { top: frame[0], bottom: frame[1], centerX: bs.centerX }, mode);
      // 带背景的图（battleStandee.fill，007 的 007-a / 007-b）：取景怎么写都盖满整个框，见 placeFramed
      if (bs.fill) fimg.dataset.fill = '1';
      ph.append(fimg);
    } else {
      ph.append(el('b', '', SLOT_CN[slot]), el('small', '', '角色图占位 · 3:4'));
    }
    return ph;
  }

  /**
   * 按取景摆一张大图：原图的 [top, bottom] 这一段对到容器里的一段高度上，centerX 对准中线。
   * battle：HUD 下面到台词条上缘往下 24px（台词条以下的图照样铺到底，压在网点和按钮后面），往左让 18px 给节奏轨；
   * cutin：cut-in 框高度的 4%–98%；
   * adv：剧情画面顶部 60px 到对话框上缘往下 30px（下半身藏在对话框后面）
   */
  function framedImg(src, frame, mode) {
    const img = imgNode(src);
    img.className = 'framed';
    img.dataset.frame = `${frame.top ?? 0},${frame.bottom ?? 0},${frame.centerX ?? ''}`;
    img.dataset.mode = mode;
    img.addEventListener('load', () => placeFramed(img));
    return img;
  }

  /**
   * moving＝镜头在动（每帧调）：沿用上次量好的区域，不再读版面、不重新同步 WebGL 层
   */
  function placeFramed(img, moving = false) {
    const box = img.parentElement;
    if (img.dataset.mode === 'battle' && !moving) requestAnimationFrame(() => MV.active && MV.img === img && motionSync());
    if (!box || !img.naturalWidth) return;
    const [ft, fbRaw, cxRaw] = img.dataset.frame.split(',');
    const top = Number(ft) || 0;
    const bottom = Number(fbRaw) || img.naturalHeight;
    const cx = cxRaw === '' ? img.naturalWidth / 2 : Number(cxRaw);
    if (!moving || !img._area) {
      const bw = box.clientWidth;
      const bh = box.clientHeight;
      if (!bw || !bh) return;
      let areaTop;
      let areaBottom;
      let shift = 0;
      if (img.dataset.mode === 'adv') {
        const advTop = $('adv').getBoundingClientRect().top;
        areaTop = 60;
        areaBottom = $('adv-box').getBoundingClientRect().top - advTop + 30;
      } else if (img.dataset.mode === 'battle') {
        const appTop = app.getBoundingClientRect().top;
        areaTop = $('hud-mark').getBoundingClientRect().top - appTop + 28;
        areaBottom = $('say-mark').getBoundingClientRect().top - appTop + 24;
        shift = -18;
      } else {
        areaTop = bh * 0.04;
        areaBottom = bh * 0.98;
      }
      img._area = { bw, bh, areaTop, areaBottom, shift };
    }
    const { bw, bh, areaTop, areaBottom, shift } = img._area;
    let scale = (areaBottom - areaTop) / Math.max(1, bottom - top);
    let left = bw / 2 + shift - cx * scale;
    let y = areaTop - top * scale;
    // 带背景的图（data-fill）：取景对到的那一段比整个框矮，图会露出上下左右的边——
    // 不够大就以取景的中心为准放大到盖满，再把图往回挪到不露边（取景写得太宽太偏都自己收回来）
    if (img.dataset.fill && bh) {
      const need = Math.max(bh / img.naturalHeight, bw / img.naturalWidth);
      if (scale < need) {
        const mid = (areaTop + areaBottom) / 2;
        scale = need;
        y = mid - ((top + bottom) / 2) * scale;
        left = bw / 2 + shift - cx * scale;
      }
      y = Math.min(0, Math.max(bh - img.naturalHeight * scale, y));
      left = Math.min(0, Math.max(bw - img.naturalWidth * scale, left));
    }
    Object.assign(img.style, {
      width: `${img.naturalWidth * scale}px`,
      height: `${img.naturalHeight * scale}px`,
      left: `${left}px`,
      top: `${y}px`,
    });
  }

  const reframeAll = () => document.querySelectorAll('img.framed').forEach(placeFramed);
  addEventListener('resize', reframeAll);

  // ---------- 和外壳说话（套在任务墙的全屏运行里时）----------
  // tavern:frame { left, width }：游戏这一栏在屏幕上的位置——外壳把「退出」把手摆到这一栏的左上角（桌面上这一栏居中，不是整个屏幕的左上角）
  // tavern:exit { to }：退出全屏并换到那一页（讨伐成功 → 任务墙）
  const inShell = window.parent !== window;
  function postFrame() {
    if (!inShell) return;
    const rect = app.getBoundingClientRect();
    try {
      window.parent.postMessage({ type: 'tavern:frame', left: rect.left, width: rect.width }, location.origin);
    } catch {}
  }
  addEventListener('resize', postFrame);
  postFrame();

  /** 回任务墙：在外壳里就请外壳退出全屏再换页；单独打开的直接去 */
  function toWall() {
    if (inShell) {
      try {
        window.parent.postMessage({ type: 'tavern:exit', to: '/quests' }, location.origin);
        return;
      } catch {}
    }
    location.href = '/quests';
  }

  const BG_COLORS = {
    story: [C.deep, C.navy, C.dim],
    pause: [C.ink, C.inkSoft, C.navy],
    ending: [C.deep, C.dim, C.grey],
    choice: [C.ink, C.navy, C.ver],
  };

  const CASINO_BG = {
    story: ['#2a0a14', '#5a1626', '#3a1248'],
    pause: [C.ink, '#48101f', '#3a1248'],
    ending: ['#2a0a14', '#3a1248', C.grey],
    choice: [C.ink, '#5a1626', C.ver],
  };

  /** 剧情背景：斜切色块构图（竖屏 9:16，裁切铺满）；站主定：先不写占位字、不画虚线框 */
  function bgNode(key) {
    const src = Q.art?.bg?.[key];
    if (src) return imgNode(src);
    // 委托的底色主题（008 赌场）：剧情背景的斜切色块换成酒红、暗紫
    const theme = Q.quest?.theme === 'casino' ? CASINO_BG : BG_COLORS;
    const [a, b, c] = theme[key] ?? theme.story;
    return fromMarkup(
      svg(
        '0 0 900 1600',
        `<rect width="900" height="1600" fill="${a}"/>
         <polygon points="0,0 900,0 900,520 0,860" fill="${b}"/>
         <polygon points="560,0 900,0 900,1600 260,1600" fill="${c}"/>
         <polygon points="0,860 900,520 900,560 0,900" fill="${C.ink}"/>`,
        'xMidYMid slice',
      ),
    );
  }

  /**
   * 她的立绘。有图就按 standee.her.frame 取景；没有图是剪影占位
   * （贴纸模切边＝cream 外圈 + ink 圈 + 本体三层，胸口一块表情名标签）
   */
  function standNode(face) {
    const cfg = Q.art?.standee?.her ?? {};
    const src = cfg.faces?.[face];
    if (src) return framedImg(src, cfg.frame ?? {}, 'adv');
    // 剧情里出场的别人（委托的 cast：{ 名字: { src, frame } }；008 开场的 Aschan）：剧情某句写 "her": "aschan" 就换成她的立绘
    const cast = Q.cast?.[face];
    if (cast?.src) return framedImg(cast.src, cast.frame ?? {}, 'adv');
    const shapes = `<path d="M118 170 Q104 470 84 580 L316 580 Q296 470 282 170 Z"/>
         <polygon points="146,118 108,22 184,96"/><polygon points="254,118 292,22 216,96"/>
         <circle cx="200" cy="172" r="80"/>
         <path d="M200 252 C118 252 70 304 58 384 L28 800 L372 800 L342 384 C330 304 282 252 200 252 Z"/>`;
    const fill = `<g fill="${C.grey}"><path d="M118 170 Q104 470 84 580 L316 580 Q296 470 282 170 Z"/></g>
         <g fill="${C.ver}"><polygon points="146,118 108,22 184,96"/><polygon points="254,118 292,22 216,96"/></g>
         <g fill="${C.creamDim}"><circle cx="200" cy="172" r="80"/>
         <path d="M200 252 C118 252 70 304 58 384 L28 800 L372 800 L342 384 C330 304 282 252 200 252 Z"/></g>`;
    const label = `立绘占位 · 她 · ${face}`;
    return fromMarkup(
      svg(
        '-20 -20 440 840',
        `<g fill="${C.cream}" stroke="${C.cream}" stroke-width="30" stroke-linejoin="round">${shapes}</g>
         <g fill="${C.ink}" stroke="${C.ink}" stroke-width="14" stroke-linejoin="round">${shapes}</g>
         ${fill}
         <g transform="translate(200 520) rotate(-4)">
           <rect x="-170" y="-26" width="340" height="52" rx="26" fill="${C.ink}"/>
           <text y="9" text-anchor="middle" fill="${C.hud}" font-size="22" font-family="Noto Sans SC" font-weight="900">${label}</text>
         </g>`,
        'xMidYMax meet',
      ),
    );
  }

  function preloadArt() {
    const walk = (o) => Object.values(o ?? {}).forEach((v) => (typeof v === 'string' ? v && (new Image().src = v) : walk(v)));
    walk(Q.art);
    // 各组要换的战斗图（sets[n - 1].standee / endless.standee）也先载上，换的时候不闪空
    const shots = [...(Q.sets ?? []).map((x) => x?.camera), Q.endless?.camera, Q.execute?.camera].flatMap((keys) => (Array.isArray(keys) ? keys.map((k) => k?.standee) : []));
    for (const name of new Set([...(Q.sets ?? []).map((x) => x?.standee), Q.endless?.standee, ...shots])) {
      if (!name || !Q.standees?.[name]) continue;
      walk(Q.standees[name].art);
      // 组里换图（镜头关键帧的 standee）要当场换：遮罩也先载好
      const bs = Q.standees[name].art?.battleStandee;
      for (const k of ['mask', 'mask2']) if (bs?.[k]) loadMaskImage(bs[k]).catch(() => {});
    }
  }

  // ---------- 战斗图切换：一帧色闪 + 抖动 ----------

  let currentSlot = null;
  function setArt(slot, { quiet = false } = {}) {
    if (slot === currentSlot) return;
    const first = currentSlot === null;
    currentSlot = slot;
    $('art-img').replaceChildren(artNode(slot));
    emit('art', { slot });
    if (!first && !quiet) shake();
  }

  function shake() {
    animate($('art-flash'), [{ opacity: 1 }, { opacity: 1, offset: 0.4 }, { opacity: 0 }], { duration: 90, easing: 'steps(1, end)' });
    animate(
      $('art'),
      [
        { transform: 'translate(0, 0)' },
        { transform: 'translate(-9px, 3px)' },
        { transform: 'translate(8px, -3px)' },
        { transform: 'translate(-5px, 2px)' },
        { transform: 'translate(3px, -1px)' },
        { transform: 'translate(0, 0)' },
      ],
      { duration: 260, easing: 'ease-out' },
    );
  }

  // ---------- 屏幕常亮 ----------

  let lock = null;
  let wantAwake = false;
  async function keepAwake(on) {
    wantAwake = on;
    try {
      if (on && !lock && 'wakeLock' in navigator) {
        lock = await navigator.wakeLock.request('screen');
        lock.addEventListener('release', () => (lock = null));
      } else if (!on && lock) {
        await lock.release();
        lock = null;
      }
    } catch (e) {
      emit('wakelock', { error: e.name });
    }
  }

  // ---------- 状态 ----------

  const S = {
    screen: 'boot',
    set: 1,
    obey: { n: 0, of: 0 }, // 遵命计数：这一次挑战里点了几次「遵命」/ 出了几条带「遵命」的命令
    elapsed: 0, // 本组 / 无尽战斗已坚持（游戏秒）
    phase: 'early',
    nextLineAt: 0,
    nextBeatAt: 0,
    countLeft: 0,
    quitAt: 0,
    quitPhase: 'early',
    press: null, // { id, start }
    cutinBusy: false,
    endless: false,
    route: '', // 无尽战斗是从哪条路进来的（'开场-放过' 这种剧情名；空＝最后一击选了饶过），按 endless.routes 换战斗图、镜头、演出表
    speed: 1, // dev：游戏时钟倍速
    tempo: 1, // 节奏指示器速度倍率（调节器用，平时 1）
    sway: 1, // 无尽战斗的随机快慢（swayTick）
    swayTarget: 1,
    swayAt: 0,
    freeze: false, // 调节器：定住倒计时和阶段，只让节奏跑
    preset: null, // 节奏预设名（quest-<编号>.jsonc rhythm.use）
    resumeLeft: 0, // 切回来之后的恢复倒数（游戏秒）
    finishLeft: 0, // 数到 0 之后的余韵还剩几秒
    cuesDone: new Set(), // 这一组放过的定时演出（sets[n - 1].script 的下标）
    rules: {}, // 规则开关（006）：见 setRules
    shot: null, // 镜头关键帧换上的战斗图（standees 里的名字；null＝这一组自己的），见 cameraTick
  };

  /** 当前这套节奏档位本身（调节器改的是它） */
  const RP0 = () => Q.rhythm.presets?.[S.preset] ?? Q.rhythm;
  /** 实际用的节奏参数：档位，再盖上这一组的 sets[n - 1].rhythm（比如第 3 组「压」只到轨道中间：rangeBottom 0.5） */
  function RP() {
    const base = RP0();
    const over = !S.endless && Q.sets?.[S.set - 1]?.rhythm;
    if (!over || typeof over !== 'object') return base;
    return { ...base, ...over, speed: { ...(base.speed ?? {}), ...(over.speed ?? {}) } };
  }
  const RESUME_SECONDS = 3;

  const T = () => Q.timing;
  let screenTimer = 0;

  // ---------- 每组与演出表（quest-<编号>.jsonc 的 sets / stage）----------

  /** 第 n 组的覆盖：sets[n - 1]（无尽战斗不分组） */
  const setCfg = (n = S.set) => (S.endless ? {} : (Q.sets?.[n - 1] ?? {}));
  /**
   * 无尽战斗这一次的配置：委托的 endless，再盖上 endless.routes[S.route]（从哪条剧情进来的）。
   * 能写 standee（战斗图，"" 或不写＝委托自己的立绘）、camera（镜头关键帧，按最后一帧的秒数循环）、stage（演出表按格盖，比如 { "challenge": { "in": [] } } 不出题）
   */
  function endlessCfg() {
    const base = Q.endless ?? {};
    const route = S.route && base.routes?.[S.route];
    return route ? { ...base, ...route } : base;
  }
  /** 第 n 组多少秒 */
  const secondsOf = (n = S.set) => setCfg(n).seconds ?? Q.quest.seconds;
  // 21 点（008，blackjack.js）：秒数只在输了一手时走——罚时数到哪一秒（S.bjTarget＝开罚时的秒数 + 罚几秒）
  const target = () => (S.bjTarget > 0 ? S.bjTarget : secondsOf());
  /** 21 点的组：第 n 组要赢几手（委托单、通过印章写「赢 n 手」不写秒数） */
  const bjWinsOf = (n = S.set) => (Q.blackjack ? Math.max(1, Math.round(Q.sets?.[n - 1]?.blackjack?.wins ?? 1)) : null);
  /**
   * 连贯的组（quest.flow = "continuous"）：组与组之间不停——没有「通过」、暂停和准备倒数，这一组的秒数走完（和它的 overtime）直接接下一组。
   * quest.display { sets, seconds }：委托单、HUD、结算上给玩家看的组数和秒数（003：看起来只有 1 组 × 60 秒，其实是四组连着打）
   */
  const continuous = () => Q.quest.flow === 'continuous';
  /**
   * 假通关（006）：委托文件的 fakeClear { after, story, choice, spare, delay }——第 after 组通过之后照常演「全部通过 → 结局 → 最后一击」，
   * 但不记通关、不发奖杯；最后一击的选项出来 delay 秒后她下一道命令，「给出最后一击」消失，只能选另一个，然后才进后面真正的那几组（toFakeChoice）。
   * 委托单、HUD 上的组数照 quest.display.sets（看起来只有 after 组），过了假通关才露出真的组数
   */
  const fakeCfg = () => (Q.fakeClear?.after > 0 && Q.fakeClear.after < Q.quest.sets ? Q.fakeClear : null);
  const revealed = () => !!fakeCfg() && S.set > fakeCfg().after;
  const shownSets = () => (revealed() ? Q.quest.sets : (Q.quest.display?.sets ?? Q.quest.sets));
  /**
   * 假装无尽（006 最后一组）：sets[n].guise——这一组的准备和战斗装成无尽战斗（HUD ∞、「无尽模式」牌、秒数往上数、放弃是整条）。
   *   until 秒  到点露出真面目，倒数回来。不写＝整组一直装着（超时那一段也是），真的时间照常走，走完照常进超时步骤
   *   skips     [{ at 秒, to 跳到几 }]（或 { at, by 往后跳几秒 }，按 at 从小到大写）：到点秒数一下子变大——
   *             「不知不觉又过去了这么久」（站主 2026-10-03：她骗他还在无尽模式里，只是时间在他没发现的时候过去了）
   */
  const guiseCfg = () => (!S.endless && setCfg().guise) || null;
  const guised = () => {
    const g = guiseCfg();
    if (!g) return false;
    if (S.screen === 'prep') return true;
    if (S.screen !== 'hold') return false;
    return g.until > 0 ? !S.over && S.elapsed < g.until : true;
  };
  /** 假装无尽时秒数多显示出来的那一截（skips 跳过去的） */
  function guiseSkew(t = S.elapsed) {
    let add = 0;
    for (const s of guiseCfg()?.skips ?? []) {
      if (!(s?.at <= t)) continue;
      add = s.to != null ? s.to - Math.floor(s.at) : add + (s.by ?? 0);
    }
    return add;
  }
  let guiseOn = false;
  let guisePre = false;
  let guiseSkipN = 0;
  let guiseSkipPre = -1;
  /**
   * 战斗中每帧：假装无尽到点了 / 调节器往回跳了，只在变的那一帧换 HUD、模式牌、秒数。
   * 到点前 0.35 秒先发一次 pre：fx.js 把 HUD、模式牌、秒数抖糊（幻觉要散了），糊得最厉害的那一下正好换成真的。
   * guise.reveal＝换完之后砸在模式牌位置上的字（「第 4 组」）。
   * skips 也一样：到点前 0.35 秒 pre（只糊秒数），到点那一下秒数换成大的，发 skip { from, to }
   */
  function guiseSync() {
    const g = setCfg().guise;
    const on = guised();
    if (on && g.until > 0 && !guisePre && S.screen === 'hold' && S.elapsed >= g.until - 0.35) {
      guisePre = true;
      emit('guise', { state: 'pre', reveal: g.reveal });
    }
    if (on && S.screen === 'hold' && !S.over) {
      const list = g.skips ?? [];
      const done = list.filter((s) => s?.at <= S.elapsed).length;
      if (done < list.length && guiseSkipPre !== done && S.elapsed >= list[done].at - 0.35) {
        guiseSkipPre = done;
        emit('guise', { state: 'pre', skip: true });
      }
      if (done !== guiseSkipN) {
        const grew = done > guiseSkipN;
        const from = Number($('clock').dataset.text) || 0;
        guiseSkipN = done;
        $('clock').dataset.text = '';
        clockTick();
        if (grew) emit('guise', { state: 'skip', from, to: Number($('clock').dataset.text) || 0, n: done });
      }
    }
    if (on === guiseOn) return;
    guiseOn = on;
    guisePre = false;
    app.toggleAttribute('data-endless', on);
    hud();
    $('clock').dataset.text = '';
    clockTick();
    emit('guise', { state: on ? 'on' : 'off', reveal: g?.reveal });
  }
  const shownSet = () => Math.min(continuous() ? shownSets() : S.set, shownSets());
  const shownSeconds = (n) => (revealed() ? secondsOf(n) : (Q.quest.display?.seconds ?? secondsOf(n)));
  /** 第 n 组前段 / 中段在哪里结束（占这组秒数的比例） */
  const bounds = (n = S.set) => ({ early: setCfg(n).earlyEnds ?? T().earlyEnds, mid: setCfg(n).midEnds ?? T().midEnds });
  /** 第 n 组节奏快慢：一个数，或按段写；乘在节奏档位的各段速度上 */
  function tempoOf(phase = S.phase, n = S.set) {
    const t = setCfg(n).tempo;
    return typeof t === 'number' ? t : (t?.[phase] ?? 1);
  }
  /**
   * 演出表的一格：委托的 stage.<格>，再按字段盖上这一组的 sets[n - 1].stage.<格>（fx、pools 整个换）。
   * 格：early / mid / late / endless 各段、toMid / toLate 切阶段、top / bottom 节奏到顶到底、beat 心跳、countdown 最后几秒、press / release 长按放弃与松手
   */
  function stageCell(name, n = S.set) {
    const base = Q.stage?.[name] ?? {};
    const over = S.endless ? endlessCfg().stage?.[name] : Q.sets?.[n - 1]?.stage?.[name];
    return over ? { ...base, ...over } : base;
  }
  /**
   * 镜头：sets[n - 1].camera 是按秒排的关键帧 [{ "at": 秒, "frame": [上沿, 下沿], "centerX": 中线 }]（原图像素，同 battleStandee.frames）。
   * 两帧之间平滑过渡，第一帧之前停在第一帧、最后一帧之后停在最后一帧；centerX 不写沿用 battleStandee.centerX。
   * 往这一帧怎么过去：ease 不写＝缓进缓出、"linear"＝匀速；cut: true＝前面停着不动，到点一下切过来（flash: true 切的时候闪一下）。
   * pulse（0.02–0.08）：从这一帧到下一帧之间，每跳一个秒数镜头往里顶一下（取景收紧这么多，0.3 秒弹回）——数秒落在镜头上。
   * pendulum（006）：true / false＝从这一帧起把垂在镜头前面的怀表放下来 / 收起，直到后面哪一帧再写（或者换图）；不写＝那张图自己的默认（fx.pendulum.hidden）。
   * standee（006 起）：从这一帧起换成 standees 段里的那张战斗图（"" ＝换回这一组自己的），直到后面哪一帧再写；frame / centerX 按那张图的坐标写。
   *   组里换图用的就是按组换图那一套（syncStandee），一般配 cut: true（硬切）用
   * 写了镜头的组，准备和战斗各段都按它取景（切段时照样闪一下）；没写返回 null，按 frames 走
   */
  const CAMERA_SLOTS = new Set(['idle', 'early', 'mid', 'late', 'endless']);
  /** 这一组（无尽战斗：这条路线）的镜头关键帧，按秒排好 */
  function cameraKeys(n = S.set) {
    if (S.screen === 'execute' || S.screen === 'executed') return executeKeys();
    const raw = bjCamera() ?? (S.endless ? endlessCfg().camera : setCfg(n).camera);
    if (!Array.isArray(raw)) return [];
    return raw.filter((k) => Array.isArray(k?.frame) && k.frame.length === 2).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
  }
  /**
   * 21 点（008）罚时里的镜头：blackjack.camera 的 mid（输了的罚时）/ late（爆牌的罚时），写法同 sets[n].camera；
   * at 是这一次罚时的第几秒（S.bjPenFrom 起算），按最后一帧的秒数循环。发牌、想牌的时候不用（按 frames 取景）
   */
  function bjCamera() {
    if (!Q.blackjack || S.bjPenFrom == null || (S.screen !== 'hold' && S.screen !== 'endless')) return null;
    return Q.blackjack.camera?.[S.bjPhase] ?? null;
  }
  /** 镜头关键帧按哪个秒数走：罚时里是这次罚时的第几秒，无尽战斗按最后一帧的秒数循环 */
  function camTime(keys, t) {
    const period = keys.at(-1)?.at ?? 0;
    if (bjCamera()) {
      const u = Math.max(0, S.elapsed - S.bjPenFrom);
      return period > 0 ? u % period : u;
    }
    return S.endless && period > 0 ? t % period : t;
  }
  function cameraAt(t, n = S.set) {
    const keys = cameraKeys(n);
    if (!keys.length) return null;
    // 无尽战斗没有尽头：镜头按最后一帧的秒数循环（最后一帧写成和第一帧一样，就接得上）
    t = camTime(keys, t);
    const cx0 = Q.art?.battleStandee?.centerX;
    const pose = (k) => ({ top: k.frame[0], bottom: k.frame[1], centerX: k.centerX ?? cx0 });
    let i = keys.findIndex((k) => (k.at ?? 0) > t);
    if (i === -1) return pose(keys.at(-1));
    if (i === 0) return pose(keys[0]);
    const a = keys[i - 1];
    const b = keys[i];
    if (b.cut) return pose(a);
    const u = clamp((t - (a.at ?? 0)) / Math.max(0.001, (b.at ?? 0) - (a.at ?? 0)), 0, 1);
    const e = b.ease === 'linear' ? u : u * u * (3 - 2 * u);
    const mix = (x, y) => x + (y - x) * e;
    const pa = pose(a);
    const pb = pose(b);
    return {
      top: mix(pa.top, pb.top),
      bottom: mix(pa.bottom, pb.bottom),
      centerX: pa.centerX === undefined || pb.centerX === undefined ? pa.centerX : mix(pa.centerX, pb.centerX),
    };
  }
  /** 战斗中每帧：按这一组的镜头挪取景 */
  let camKey = -1;
  /** 镜头走到第 idx 帧时该用哪张战斗图：往前找最近一帧写了 standee 的 */
  function shotAt(keys, idx) {
    for (let i = Math.min(idx, keys.length - 1); i >= 0; i--) {
      if (keys[i].standee !== undefined) return keys[i].standee && Q.standees?.[keys[i].standee] ? keys[i].standee : null;
    }
    return null;
  }
  /**
   * 镜头走到第 idx 帧时垂在前面的怀表放没放下来（006，fx.pendulum）：往前找最近一帧写了 pendulum 的；
   * 中间先碰到换图的那一帧（写了 standee）就回到那张图自己的默认（null）
   */
  function pendAt(keys, idx) {
    for (let i = Math.min(idx, keys.length - 1); i >= 0; i--) {
      if (keys[i].pendulum !== undefined) return !!keys[i].pendulum;
      if (keys[i].standee !== undefined) return null;
    }
    return null;
  }
  function cameraTick() {
    const keys = cameraKeys();
    if (!keys.length) return;
    const t = camTime(keys, S.elapsed);
    const idx = keys.filter((k) => (k.at ?? 0) <= t).length - 1;
    S.pend = pendAt(keys, idx);
    // 这一帧要换战斗图：换档案、重摆那张图（WebGL 层跟着 art 事件重新传图和遮罩）
    const shot = shotAt(keys, idx);
    if (shot !== (S.shot ?? null)) {
      S.shot = shot;
      syncStandee();
      if (currentSlot === null) setArt(S.screen === 'endless' ? 'endless' : S.screen === 'execute' ? 'late' : S.phase, { quiet: true });
    }
    let cam = cameraAt(S.elapsed);
    if (!cam) return;
    // 切到带 flash 的硬切帧：闪一下
    if (idx !== camKey) {
      if (camKey >= 0 && idx > camKey && keys[idx]?.cut && keys[idx]?.flash) shake();
      camKey = idx;
    }
    // pulse：每跳一个秒数往里顶一下（绕取景 40% 高那一点收紧，脸不跑出去）
    const pulse = Number(keys[idx]?.pulse) || 0;
    if (pulse > 0 && !reduce.matches) {
      const k = pulse * Math.max(0, 1 - (t % 1) / 0.3) ** 2;
      if (k > 0) {
        const h = cam.bottom - cam.top;
        const a = cam.top + h * 0.4;
        cam = { ...cam, top: a - h * 0.4 * (1 - k), bottom: a + h * 0.6 * (1 - k) };
      }
    }
    const img = $('art-img').querySelector('img.framed');
    if (!img) return;
    const v = `${cam.top.toFixed(1)},${cam.bottom.toFixed(1)},${cam.centerX === undefined ? '' : cam.centerX.toFixed(1)}`;
    if (img.dataset.frame === v) return;
    img.dataset.frame = v;
    placeFramed(img, true);
  }

  /**
   * 定时演出：sets[n - 1].script 是这一组第几秒放什么 [{ "at": 秒, "fx": 演出名, "text": 字, "pool": 台词池, … }]，
   * 到点放一次（fx.js 接 cue 事件放）。调节器直接跳到后面某一秒的，跳过的不补放（skipCuesBefore）
   */
  function cueTick() {
    const list = setCfg().script;
    if (!Array.isArray(list)) return;
    list.forEach((cue, i) => {
      if (S.cuesDone.has(i) || !(cue?.at <= S.elapsed)) return;
      S.cuesDone.add(i);
      emit('cue', { cue, index: i });
    });
  }
  function skipCuesBefore(t) {
    S.cuesDone = new Set();
    (setCfg().script ?? []).forEach((cue, i) => cue?.at < t && S.cuesDone.add(i));
  }

  /** 目标怎么写：每组一样长就「4 组 × 30 秒」，不一样就「4 组 · 共 100 秒」；写了 quest.display 就照它 */
  function goalText() {
    if (Q.quest.display && !revealed()) return tr('{sets} 组 × {secs} 秒', { sets: shownSets(), secs: shownSeconds() });
    if (Q.blackjack) {
      const wins = Array.from({ length: Q.quest.sets }, (_, i) => bjWinsOf(i + 1));
      return new Set(wins).size === 1
        ? tr('{sets} 组 × {wins} 胜', { sets: wins.length, wins: wins[0] })
        : tr('{sets} 组 · 共 {total} 胜', { sets: wins.length, total: wins.reduce((a, b) => a + b, 0) });
    }
    const secs = Array.from({ length: Q.quest.sets }, (_, i) => secondsOf(i + 1));
    return new Set(secs).size === 1
      ? tr('{sets} 组 × {secs} 秒', { sets: secs.length, secs: secs[0] })
      : tr('{sets} 组 · 共 {total} 秒', { sets: secs.length, total: secs.reduce((a, b) => a + b, 0) });
  }

  function phaseAt(elapsed) {
    // 21 点：前 / 中 / 后段按这一组输了几手定（每输一手节奏快一档），不按秒数
    if (S.bjPhase) return S.bjPhase;
    const p = elapsed / target();
    const b = bounds();
    if (p < b.early) return 'early';
    if (p < b.mid) return 'mid';
    return 'late';
  }

  function setScreen(screen) {
    clearTimeout(screenTimer);
    if (screen !== 'hold') stayOff();
    if (screen !== 'story' && screen !== 'end') $('adv').querySelector('.adv-still')?.classList.remove('is-on');
    S.screen = screen;
    syncStandee();
    app.dataset.screen = screen;
    guiseOn = guised();
    guisePre = false;
    guiseSkipN = 0;
    guiseSkipPre = -1;
    app.toggleAttribute('data-endless', (S.endless && (screen === 'prep' || screen === 'endless')) || guiseOn);
    app.toggleAttribute('data-invincible', !!S.invincible && !S.endless && (screen === 'prep' || screen === 'hold'));
    for (const id of ['brief', 'clock', 'count', 'prep-tip', 'pass', 'big-title', 'stamps', 'best']) $(id).hidden = true;
    $('rh-tip')?.classList.remove('is-on');
    $('actions').replaceChildren();
    document.documentElement.style.removeProperty('--say-bottom');
    $('adv-menu').replaceChildren();
    S.resumeLeft = 0;
    S.finishLeft = 0;
    $('clock').classList.remove('clock--finish', 'clock--exec', 'clock--exec-zero', 'clock--long');
    S.freeze = false;
    reframeAll();
    hud();
    if (screen === 'prep' || screen === 'hold' || screen === 'endless' || screen === 'execute') rhMeasure();
    emit('screen', { screen });
  }

  function hud() {
    $('hud-set').textContent = S.endless || guised() ? '∞' : `${shownSet()}/${shownSets()}`;
  }

  function action(label, fn, { sub = false } = {}) {
    const b = el('button', sub ? 'act act--sub' : 'act');
    b.type = 'button';
    b.append(sub ? el('span', '', label) : stickerEl('span', '', label));
    b.addEventListener('click', () => {
      emit('tap');
      fn();
    });
    $('actions').append(b);
    // 第三个按钮起：这一排变成两排（index.html 的 .actions），台词条往上让了——量一下、立绘的取景跟着重算
    if ($('actions').children.length >= 3) requestAnimationFrame(fitActions);
    return b;
  }
  /** 底下的按钮折成了三排（英语的字长、屏幕窄）：台词条、委托书再往上让一截（两排的高度 index.html 里已经写了） */
  function fitActions() {
    const h = $('actions').offsetHeight;
    const root = document.documentElement;
    if (h > 114) root.style.setProperty('--say-bottom', `calc(${Math.round(h + 48)}px + var(--safe-bottom))`);
    else root.style.removeProperty('--say-bottom');
    reframeAll();
  }

  function stampNode(tag, main, num, unit) {
    const st = el('div', 'stamp');
    if (tag) st.append(el('span', 'stamp-tag', tag));
    st.append(el('span', '', main));
    if (num !== undefined) st.append(el('span', 'num', String(num)));
    if (unit) st.append(el('span', '', unit));
    return st;
  }

  /** 每组一枚「坚持 · N 秒」；count 不写就是全部组数 */
  function setStamps(count = shownSets()) {
    const box = $('stamps');
    box.replaceChildren(...Array.from({ length: count }, (_, i) => (Q.blackjack ? stampNode(tr('第 {n} 组', { n: i + 1 }), tr('赢下 ·'), bjWinsOf(i + 1), tr('手')) : stampNode(tr('第 {n} 组', { n: i + 1 }), tr('坚持 ·'), shownSeconds(i + 1), tr('秒')))));
    box.hidden = false;
    [...box.children].forEach((s, i) => slam(s, 200 + i * 90));
  }

  /** 大标题：一行小标签 + 若干贴纸块（字符串＝贴纸字，{num}＝橙红数字，'br'＝换行） */
  function bigTitle(tag, parts) {
    const box = $('big-title');
    box.replaceChildren();
    if (tag) box.append(el('span', 'tag', tag), el('br'));
    for (const p of parts) {
      if (p === 'br') box.append(el('br'));
      else if (typeof p === 'object') box.append(stickerEl('span', 'sticker--large num', String(p.num)));
      else box.append(stickerEl('span', 'sticker--large', p));
    }
    box.hidden = false;
    slam(box);
    return box;
  }

  // ================= 委托单 =================

  function toBrief() {
    leaveBattle();
    S.endless = false;
    S.route = '';
    S.set = 1;
    setScreen('brief');
    keepAwake(false);
    setArt('idle', { quiet: true });
    sticker($('brief-name'), Q.quest.name);
    fitText($('brief-name'), Q.quest.name, 24, 12, 14);
    $('brief-draft').hidden = !LEVEL.draft;
    $('brief-client').textContent = Q.quest.client;
    // 委托人后面那枚药丸：成功报酬（没写报酬的老委托还显示状态）
    // 报酬一行：没写报酬就整行不出；完成过（本机记录）就贴「已完成 · 已领取」
    $('brief-reward').textContent = Q.quest.reward ?? '';
    $('brief-reward-row').hidden = !Q.quest.reward;
    $('brief-cleared').hidden = !isCleared();
    $('brief-sets').textContent = String(shownSets());
    // 每组秒数不一样时写「20–30」
    // 21 点的组写「几胜」（每组要赢几手）
    const secs = Array.from({ length: shownSets() }, (_, i) => bjWinsOf(i + 1) ?? shownSeconds(i + 1));
    const lo = Math.min(...secs);
    const hi = Math.max(...secs);
    $('brief-secs').textContent = lo === hi ? String(lo) : `${lo}–${hi}`;
    $('brief-unit').textContent = Q.blackjack ? tr('胜') : tr('秒');
    showRecord();
    S.invincible = false;
    briefMode();
    // 开场第一句就换曲子的（008：委托书是 Aschan 发的，放她的曲子）：委托单上就放那首，点「开始」不会先响一下委托自己的那首
    const openBgm = STORY?.['开场']?.[0]?.bgm;
    if (openBgm) bgmSwitch(openBgm);
    const text = pick('委托开场');
    $('brief-open').textContent = text;
    emit('line', { pool: '委托开场', text });
    $('brief').hidden = false;
    // 本机解锁（quest.unlock）：还没通关那份委托，委托书写解放条件、按钮换成「未解放」
    const gate = gateCondition();
    if (gate) {
      $('brief-open').textContent = tr('解放条件：{gate}', { gate });
      action(tr('未解放'), () => {}).disabled = true;
      return;
    }
    action(tr('开始'), () => {
      startRun();
      runStory('开场', afterOpening);
    });
    // 这台设备通关过（站主 2026-09-24）：不用再打四组，直接进无尽战斗
    if (isCleared() || devEnabled()) {
      action(tr('无尽战斗'), () => {
        S.route = '';
        toPrep({ endless: true });
      }, { sub: true });
    }
    action(tr('冒险者记录'), openLedger, { sub: true });
  }

  // ================= 记录 =================
  // 这份委托在这台设备上的战绩（tobatsu.q<编号>.record）：挑战几次（点「开始」或「重来」）、成功几次（全部通过）、
  // 失败几次（放弃 / 败北 / 撤退）。一次挑战只记一个结果；调节器、开发面板直接跳画面的不算

  const RECORD_KEY = 'record';
  function readRecord() {
    return { plays: 0, clears: 0, fails: 0, ...readJson(qkey(RECORD_KEY), {}) };
  }
  function startRun() {
    S.invincible = invWanted();
    S.runRetried = false;
    S.lured = 0;
    S.obey = { n: 0, of: 0 };
    obeyRender();
    const r = readRecord();
    r.plays++;
    try {
      localStorage.setItem(qkey(RECORD_KEY), JSON.stringify(r));
    } catch {}
    S.run = true;
    emit('run', { state: 'start' });
  }
  /** 一次挑战的结果：clear 成功 / fail 失败 */
  function endRun(result) {
    if (!S.run) return;
    S.run = false;
    const r = readRecord();
    // 无敌模式通关（站主 2026-10-04）：不算完成——不记成功、不盖「已完成」、不领报酬、不发奖杯、不解放后面的委托；只另记一笔 inv
    const inv = result === 'clear' && S.invincible;
    if (inv) r.inv = (r.inv ?? 0) + 1;
    else r[result === 'clear' ? 'clears' : 'fails']++;
    try {
      localStorage.setItem(qkey(RECORD_KEY), JSON.stringify(r));
    } catch {}
    if (inv) S.newTrophies = [];
    else if (result === 'clear') {
      markCleared();
      S.newTrophies = awardTrophies();
    }
  }

  // ================= 奖杯 =================
  // 补发（站主 2026-09-24 定）：「重来这一组」这天 07:28（UTC）才上线，在那之前第一次全部通过的都是一口气打完的——clean 的奖杯补上；
  // clear 的奖杯只要全部通过过就补。进委托、开冒险者记录时各补一次
  const RETRY_SINCE = '2026-09-24T07:28:00Z';
  function backfillTrophies(id, trophies) {
    const clear = readJson(CLEAR_KEY, {})[`${clearId().split('/')[0]}/${id}`];
    if (!clear || !Array.isArray(trophies)) return;
    const key = `tobatsu.q${id}.trophies`;
    const got = readJson(key, {});
    let changed = false;
    for (const t of trophies) {
      if (!t?.id || got[t.id]) continue;
      if (t.when === 'clear' || (t.when === 'clean' && typeof clear.at === 'string' && clear.at < RETRY_SINCE)) {
        got[t.id] = clear.at ?? new Date().toISOString();
        changed = true;
      }
    }
    if (!changed) return;
    try {
      localStorage.setItem(key, JSON.stringify(got));
    } catch {}
  }
  // quest.trophies [{ id, name, desc, when }]：when "clean"＝一趟挑战里没用「重来这一组」就全部通过；"clear"＝全部通过过；
  // "untouched"（007）＝一级等级都没被吸走就全部通过；"bjPenalty"（008）＝整局罚时不超过 max 秒；"bjStreak"（008）＝一手都没输、一枚魔力碎片都没用。
  // hidden: true＝隐藏奖杯：没拿到之前冒险者记录里不列、不算进总数
  // 这台设备拿到的记在 tobatsu.q<编号>.trophies（{ id: 时间 }）；全部通过的画面上盖一枚「获得奖杯」，冒险者记录里列出来
  const TROPHY_KEY = 'trophies';
  function awardTrophies() {
    const got = readJson(qkey(TROPHY_KEY), {});
    const fresh = [];
    for (const t of Array.isArray(Q.quest.trophies) ? Q.quest.trophies : []) {
      if (!t?.id || got[t.id]) continue;
      if (t.when === 'clean' && S.runRetried) continue;
      if (t.when === 'untouched' && !window.tobatsu._?.cardFull?.()) continue;
      if (t.when === 'bjClean' && !window.tobatsu._?.bjClean?.()) continue;
      // 21 点（008）：整局罚时不超过 max 秒 / 一手都没输
      if (t.when === 'bjPenalty' && !((window.tobatsu._?.bjRunPenalty?.() ?? Infinity) <= (t.max ?? 30))) continue;
      if (t.when === 'bjStreak' && ((window.tobatsu._?.bjRunLost?.() ?? 1) > 0 || (window.tobatsu._?.bjRunShards?.() ?? 0) > 0)) continue;
      got[t.id] = new Date().toISOString();
      fresh.push(t);
    }
    if (fresh.length) {
      try {
        localStorage.setItem(qkey(TROPHY_KEY), JSON.stringify(got));
      } catch {}
    }
    return fresh;
  }

  // ================= 无敌模式 =================
  // quest.relief.invincible（次数；common.jsonc 默认 20，站主 2026-10-04）：这台设备在这份委托累计失败这么多次之后，彻底败北那一刻解锁「无敌模式」。
  // 开着的时候（S.invincible，一趟挑战开始时按开关定）：题失手——包括分岔走到「奖励」那头、限时到了——不算败北，照练习题那样盖一枚「失手」、
  // 接着打；只有自己放弃（长按放弃、暂停时认输）才会输。用它通关**不算完成**（endRun）：结局照演，但不记成功、不盖「已完成」、不领报酬、不发奖杯。
  // 解锁之后委托书上多一行「模式」可以随时开关（tobatsu.q<编号>.invincible：'on' / 'off'；没有这个键＝还没解锁）。
  // 解锁那一刻的话：委托的 story 写了「无敌」那一段就演它（{n}＝累计失败几次），没写就是一句旁白
  const INV_KEY = 'invincible';
  function invState() {
    try {
      return localStorage.getItem(qkey(INV_KEY));
    } catch {
      return null;
    }
  }
  const invUnlocked = () => invState() === 'on' || invState() === 'off';
  const invWanted = () => invState() === 'on';
  const invDue = () => Q.quest.relief?.invincible > 0 && !invUnlocked() && readRecord().fails >= Q.quest.relief.invincible;
  function setInv(on) {
    try {
      localStorage.setItem(qkey(INV_KEY), on ? 'on' : 'off');
    } catch {}
  }
  /** 委托书上「模式」那一行：解锁了才出；点哪边就记哪边 */
  function briefMode() {
    const row = $('brief-mode-row');
    if (!row) return;
    row.hidden = !invUnlocked();
    for (const b of row.querySelectorAll('button[data-mode]')) {
      b.setAttribute('aria-pressed', String((b.dataset.mode === 'on') === invWanted()));
      b.onclick = () => {
        setInv(b.dataset.mode === 'on');
        play('选择');
        briefMode();
      };
    }
  }
  function toInvUnlock() {
    const n = readRecord().fails;
    setInv(false);
    emit('relief', { state: 'invincible' });
    const own = Array.isArray(STORY['无敌']) && STORY['无敌'].length ? STORY['无敌'] : [{ who: 'narrator', bg: 'pause', her: 'none', text: tr('已经败北 {n} 次——解锁了「无敌模式」：题做错不算输，只有自己放弃才会输。用它通关不算完成，没有报酬和奖杯') }];
    STORY.__relief = own.map((e) => ({ ...e, text: String(e.text ?? '').replaceAll('{n}', n) }));
    runStory('__relief', () => {
      setScreen('choice');
      menu(tr('要用无敌模式吗？'), [
        {
          id: 'inv',
          label: tr('用无敌模式重来'),
          main: true,
          fn: () => {
            setInv(true);
            retry();
          },
        },
        { id: 'first', label: tr('照常重来'), fn: retry },
        { id: 'brief', label: tr('回委托单'), fn: toBrief },
      ]);
    });
  }

  // ================= 救济：重来这一组 =================
  // quest.relief { after: 5 }（站主 2026-09-24：004 很多人说难）：这台设备在这份委托累计失败 after 次之后，彻底败北那一刻她给一次机会——
  // 承认自己是杂鱼，就解锁「重来这一组」（从输掉的那一组重新开始，不用从第一组打起）。没承认的，下次彻底败北再问。
  // 剧情在 story-<编号> 的「救济」「救济选择」「救济-承认」「救济-拒绝」（{n}＝累计失败几次）。
  // 用过「重来这一组」的那一趟通关，不算一口气通关（奖杯 when: clean 拿不到）
  const RELIEF_KEY = 'relief';
  function reliefOn() {
    try {
      return localStorage.getItem(qkey(RELIEF_KEY)) === '1';
    } catch {
      return false;
    }
  }
  const reliefDue = () => Q.quest.relief?.after > 0 && !reliefOn() && readRecord().fails >= Q.quest.relief.after && !!STORY['救济选择'];
  /** 从输掉的那一组重来（S.failSet：败北 / 放弃在第几组；认输是撑完那一组之后，重来下一组） */
  function retrySet() {
    const set = S.failSet ?? S.set;
    startRun();
    S.runRetried = true;
    S.set = Math.min(Q.quest.sets, Math.max(1, set));
    emit('run', { state: 'retry', set: S.set });
    S.route = '';
    toPrep({ endless: false });
  }
  function toRelief() {
    const n = readRecord().fails;
    const fill = (list) => (Array.isArray(list) ? list.map((e) => ({ ...e, text: String(e.text ?? '').replaceAll('{n}', n) })) : []);
    STORY.__relief = fill(STORY['救济']);
    runStory('__relief', () => {
      const P = STORY['救济选择'] ?? {};
      setScreen('choice');
      setBg(P.bg ?? 'pause');
      if (P.her) setStand(P.her);
      speak(P.who ?? 'her', String(P.text ?? '').replaceAll('{n}', n), '救济选择');
      menu(null, [
        {
          id: 'admit',
          label: P.admit ?? tr('承认自己是杂鱼'),
          main: true,
          fn: () => {
            try {
              localStorage.setItem(qkey(RELIEF_KEY), '1');
            } catch {}
            emit('relief', { state: 'on' });
            STORY.__relief = fill(STORY['救济-承认']);
            runStory('__relief', () => retryMenu(true));
          },
        },
        {
          id: 'refuse',
          label: P.refuse ?? tr('才不是杂鱼'),
          fn: () => {
            STORY.__relief = fill(STORY['救济-拒绝']);
            runStory('__relief', () => retryMenu(false));
          },
        },
      ]);
    });
  }
  function retryMenu(relief) {
    setScreen('choice');
    menu(
      tr('从哪里重来？'),
      relief
        ? [
            { id: 'set', label: tr('重来这一组'), main: true, fn: retrySet },
            { id: 'first', label: tr('从第一组重来'), fn: retry },
            { id: 'brief', label: tr('回委托单'), fn: toBrief },
          ]
        : [
            { id: 'first', label: tr('重来'), main: true, fn: retry },
            { id: 'brief', label: tr('回委托单'), fn: toBrief },
          ],
    );
  }
  /** 彻底败北之后的按钮：解锁了救济就多一个「重来这一组」 */
  function retryButtons() {
    if (Q.quest.relief && reliefOn()) {
      action(tr('重来这一组'), retrySet);
      action(tr('从第一组重来'), retry, { sub: true });
    } else action(tr('重来'), retry);
    action(tr('委托单'), toBrief, { sub: true });
  }

  // ================= 冒险者记录 =================
  // 委托书上「冒险者记录」（站主 2026-09-24）：这台设备在这个包里的战绩——领到的报酬合计、每份委托的挑战 / 成功 / 失败、无尽最长、奖杯。
  // 只读本机记录（tobatsu.q<编号>.*、tavern.quest-clear）；委托的名字、报酬、奖杯从各份 quest-<编号>.jsonc 读。
  // 不上任务墙的委托（quests.unlisted）只在玩过、或者正开着它的时候列出来
  let LEDGER = null;
  /** ?view=ledger：任务墙上的「冒险者记录」打开的只看记录模式（关掉＝退出全屏） */
  const LEDGER_ONLY = pageParam('view') === 'ledger';
  /** 奖杯：金色杯身 + ink 描边（贴纸画风） */
  const CUP_SVG =
    '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M9 4h14v7a7 7 0 0 1-14 0z" fill="#ffd23f" stroke="#1b1b2a" stroke-width="2.4" stroke-linejoin="round"/><path d="M9 7H5a4 4 0 0 0 4 5M23 7h4a4 4 0 0 1-4 5" fill="none" stroke="#1b1b2a" stroke-width="2.4" stroke-linecap="round"/><path d="M16 18v5M11 27h10l-1.5-4h-7z" fill="#ffd23f" stroke="#1b1b2a" stroke-width="2.4" stroke-linejoin="round"/><path d="M12.5 7.5v3" stroke="#fff6c8" stroke-width="2" stroke-linecap="round"/></svg>';
  async function openLedger() {
    if (!LEDGER) {
      LEDGER = el('section', 'ledger slab');
      LEDGER.innerHTML =
        '<i class="slab-shadow"></i><i class="slab-edge"></i><i class="slab-fill"></i><div class="slab-body"><span class="brief-tag"></span><button type="button" class="ledger-close"></button><div class="ledger-body"></div></div>';
      LEDGER.querySelector('.brief-tag').textContent = tr('冒险者记录');
      const close = LEDGER.querySelector('.ledger-close');
      close.textContent = '×';
      close.setAttribute('aria-label', tr('关闭'));
      close.addEventListener('click', () => {
        emit('tap');
        if (!LEDGER_ONLY) {
          LEDGER.hidden = true;
          return;
        }
        // 只看记录：套在任务墙的全屏运行里就请外壳退出全屏；单独打开的就回上一页（没有上一页回任务墙）
        if (inShell) {
          try {
            window.parent.postMessage({ type: 'tavern:close' }, location.origin);
          } catch {}
        } else if (history.length > 1) history.back();
        else location.href = '/quests/';
      });
      app.append(LEDGER);
    }
    LEDGER.hidden = false;
    const body = LEDGER.querySelector('.ledger-body');
    body.textContent = tr('读取中…');
    const clears = readJson(CLEAR_KEY, {});
    const pkg = clearId().split('/')[0];
    const unlisted = Q.quests?.unlisted ?? {};
    const num = (key) => {
      try {
        return Number(localStorage.getItem(key)) || 0;
      } catch {
        return 0;
      }
    };
    const rows = (
      await Promise.all(
        (Q.quests?.list ?? []).map(async (id) => {
          const rec = { plays: 0, clears: 0, fails: 0, ...readJson(`tobatsu.q${id}.record`, {}) };
          if (unlisted[id] && id !== Q.quest.id && !rec.plays) return null;
          let q = {};
          try {
            q = (await loadJsonc(`quest-${id}.jsonc`)).quest ?? {};
          } catch {}
          const own = q.i18n?.[LANG] ?? {};
          backfillTrophies(id, q.trophies);
          const got = readJson(`tobatsu.q${id}.trophies`, {});
          return {
            id,
            name: own.name ? own.name.replace(/ +/g, LANG === 'ja' ? '' : ' ') : tr(q.name ?? `#${id}`),
            rec,
            best: num(`tobatsu.q${id}.endless-best`),
            cleared: clears[`${pkg}/${id}`] ?? null,
            reward: q.reward,
            trophies: (Array.isArray(q.trophies) ? q.trophies : []).filter((t) => !t.hidden || got[t.id]).map((t) => ({ ...t, got: !!got[t.id] })),
          };
        }),
      )
    ).filter(Boolean);
    // 报酬合计：每份委托第一次全部通过时领的那一笔（记在 tavern.quest-clear 里），按数字加起来，单位取第一笔的
    let total = 0;
    let unit = '';
    for (const r of rows) {
      const m = /([\d,]+)\s*([^\d\s]*)/.exec(String(r.cleared?.reward ?? (r.cleared ? r.reward : '') ?? ''));
      if (!m) continue;
      total += Number(m[1].replace(/,/g, '')) || 0;
      unit ||= m[2];
    }
    const sum = (k) => rows.reduce((a, r) => a + (r.rec[k] || 0), 0);
    const trophies = rows.flatMap((r) => r.trophies);
    const stat = (label, value, small) => {
      const c = el('div', 'ledger-stat');
      c.append(el('span', 'ledger-stat-label', label), el('b', 'num', value));
      if (small) c.append(el('small', '', small));
      return c;
    };
    const head = el('div', 'ledger-stats');
    head.append(
      stat(tr('报酬合计'), total.toLocaleString('en-US'), unit),
      stat(tr('成功 / 失败'), `${sum('clears')}/${sum('fails')}`),
      stat(tr('奖杯'), `${trophies.filter((t) => t.got).length}/${trophies.length}`),
    );
    const list = el('ol', 'ledger-list');
    for (const r of rows) {
      const li = el('li', r.cleared ? 'ledger-q is-cleared' : 'ledger-q');
      const top = el('div', 'ledger-q-top');
      top.append(el('span', 'ledger-q-no num', `#${r.id}`), el('span', 'ledger-q-name', r.name), el('span', 'ledger-q-state', tr(r.cleared ? '已完成' : r.rec.plays ? '未完成' : '未挑战')));
      const line = el('p', 'ledger-q-line');
      // 完成过却没有挑战次数（导进来的旧记录）就不写这一行，免得「已完成」配「还没挑战过」
      line.textContent = r.rec.plays
        ? tr('挑战 {plays} 次 · 成功 {clears} · 失败 {fails}', r.rec) + (r.best ? tr(' · 无尽最长 {n} 秒', { n: r.best }) : '')
        : r.cleared
          ? ''
          : tr('还没挑战过');
      li.append(top, line);
      for (const t of r.trophies) {
        const cup = el('div', t.got ? 'ledger-cup is-got' : 'ledger-cup');
        const icon = el('span', 'ledger-cup-icon');
        icon.innerHTML = t.got ? CUP_SVG : '？';
        cup.append(icon, el('b', '', t.got ? tr(t.name ?? '') : tr('？？？')), el('small', '', tr(t.desc ?? '')));
        li.append(cup);
      }
      list.append(li);
    }
    body.replaceChildren(head, list);
  }

  /**
   * 委托完成记录：全部通过一次，就在这台设备上记下「这份委托完成过、报酬领了」，只记第一次。
   * 和站点共用一个键（tavern.quest-clear，键里是「包/编号」）：任务墙的格子、预览气泡、大厅卡片读它显示已完成（src/scripts/quest-clear.ts）
   */
  const CLEAR_KEY = 'tavern.quest-clear';
  const clearId = () => `${/\/works\/([^/]+)\//.exec(location.pathname)?.[1] ?? 'tobatsu'}/${Q.quest.id}`;
  /**
   * quest.unlock { after: 委托编号, condition: 解放条件 }：这台设备通关了那份委托才解锁。没通关返回解放条件，解锁了返回 null。
   * ?dev=1 和调节器（tuner.html）里不锁
   */
  function gateCondition() {
    const u = Q.quest.unlock;
    if (!u?.after || devEnabled()) return null;
    try {
      if (window.parent !== window && /tuner\.html$/.test(window.parent.location.pathname)) return null;
    } catch {}
    const pkg = clearId().split('/')[0];
    return readJson(CLEAR_KEY, {})[`${pkg}/${u.after}`] ? null : u.condition || tr('未解放');
  }
  function isCleared() {
    return Boolean(readJson(CLEAR_KEY, {})[clearId()]);
  }
  function markCleared() {
    const all = readJson(CLEAR_KEY, {});
    if (all[clearId()]) return;
    all[clearId()] = { at: new Date().toISOString(), reward: Q.quest.reward };
    try {
      localStorage.setItem(CLEAR_KEY, JSON.stringify(all));
    } catch {}
  }
  function showRecord() {
    const r = readRecord();
    const box = $('brief-record');
    if (!r.plays) {
      box.textContent = tr('还没挑战过');
      return;
    }
    const n = (v) => el('b', 'num', String(v));
    box.replaceChildren(tr('挑战'), n(r.plays), tr('次 · 成功'), n(r.clears), tr('· 失败'), n(r.fails));
  }

  // ================= 剧情对话 =================

  const A = { list: [], i: 0, done: null, face: null, bg: null, who: null, lock: false, timer: 0 };

  function setBg(key) {
    if (!key || key === A.bg) return;
    A.bg = key;
    $('adv-bg').replaceChildren(bgNode(key));
  }

  /** 她的立绘：换表情 / 退场（主人公不出立绘） */
  function setStand(face) {
    const box = $('stand-her');
    if (!face || face === 'none') {
      box.dataset.state = 'off';
      A.face = null;
      advMotionSync();
      return;
    }
    if (A.face !== face) box.replaceChildren(standNode(face));
    A.face = face;
    box.dataset.state = 'on';
    reframeAll();
    advMotionSync();
  }

  function applyScene(e) {
    if (e.bg) setBg(e.bg);
    if ('her' in e) setStand(e.her);
  }

  function speak(who, text, pool = 'story', nameAs = null) {
    const adv = $('adv');
    // nameAs：这一句的名牌换成别人（008 开场：委托是 Aschan 发的，名牌写她；立绘换成她的见 standNode 的 cast）
    const changed = A.who !== who || A.nameAs !== nameAs;
    A.who = who;
    A.nameAs = nameAs;
    adv.dataset.who = who;
    // 她说话时亮着；主人公和旁白说话时她压暗
    $('stand-her').dataset.active = String(who === 'her');
    const name = $('adv-name');
    if (who !== 'narrator') {
      sticker(name.firstElementChild, nameAs ?? (who === 'her' ? (Q.quest.herName ?? Q.quest.client) : Q.quest.hero));
      if (changed) {
        animate(name, [{ transform: `${SKEW} scale(0.5)` }, { transform: `${SKEW} scale(1.08)`, offset: 0.7 }, { transform: `${SKEW} scale(1)` }], {
          duration: 220,
          easing: 'ease-out',
        });
      }
    }
    text = withName(text);
    $('adv-text').textContent = text;
    animate($('adv-text'), [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'ease-out' });
    emit('line', { pool, text, who });
  }

  function runStory(key, done) {
    const list = STORY[key];
    if (!Array.isArray(list) || !list.length) return done();
    setScreen('story');
    keepAwake(false);
    A.list = list;
    A.i = 0;
    A.done = done;
    // 画面框的图先拉下来，换图的时候框里不空一下
    for (const e of list) if (e?.still?.src) new Image().src = e.still.src;
    showStoryLine();
  }

  function showStoryLine() {
    const e = A.list[A.i];
    applyScene(e);
    if (e.sfx) play(e.sfx);
    if (e.fx || e.float) emit('storyfx', { fx: e.fx, float: e.float, who: e.who });
    speak(e.who ?? 'narrator', e.text ?? '', 'story', typeof e.name === 'string' ? e.name : null);
    // trance（006）：从这一句起她身上有没有螺旋（0–1 多浓，false 收掉）——开场倒数数到 0 之后就是催眠状态，暂停、选项画面都带着
    if (e.trance !== undefined) emit('trance', { wash: e.trance === true ? 0.3 : Number(e.trance) || 0 });
    if (e.countdown) storyCount(e.countdown, e.who ?? 'her');
    if (e.input) storyInput(e.input);
    if (e.ask) storyAsk(e.ask);
    if (e.bgm) bgmSwitch(e.bgm);
    if (e.still !== undefined) storyStill(e.still);
  }

  /**
   * 剧情里问一句、给两个选项（008 开场：「你玩过 21 点吗？」）：这一句写 ask: [{ "label": 选项的字, "then": 另一段剧情的名字 }, …]。
   * 点了带 then 的那个，就把那一段剧情插在这一句后面接着放（规则说明），不带的直接往下走；选之前点画面不往下走。跳过剧情＝什么都不插
   */
  function storyAsk(list) {
    if (!Array.isArray(list) || !list.length) return;
    A.lock = true;
    const pick = (o) => {
      $('adv-menu').replaceChildren();
      A.lock = false;
      play('选择');
      const more = typeof o?.then === 'string' && Array.isArray(STORY[o.then]) ? STORY[o.then] : [];
      if (more.length) A.list = [...A.list.slice(0, A.i + 1), ...more, ...A.list.slice(A.i + 1)];
      advance();
    };
    menu(null, list.map((o, i) => ({ id: `ask-${i}`, label: String(o?.label ?? ''), main: i === 0, fn: () => pick(o) })));
  }

  /**
   * 剧情里的画面框（007 开场）：这一句写 still: { src, size: "band" | "large", focus: [x, y], zoom, pan: [[x, y], [x, y]], ms }，写 false 收掉。
   * 一个斜切的框压在立绘上面、对话框下面：band 是横穿画面的一条（先描一遍身材），large 撑满对话框上面那一大块（举着卡的那张）；
   * 从 band 换成 large＝框往上下扩开。focus 是原图上对准框中间的那一点，zoom 在铺满框的基础上再放大几倍，
   * pan 从第一个点慢慢移到第二个点（ms 毫秒，默认 3200）。剧情结束、跳过、换画面都会收掉
   */
  function storyStill(c) {
    const adv = $('adv');
    let box = adv.querySelector('.adv-still');
    if (!c) {
      box?.classList.remove('is-on');
      box?.querySelector('video')?.pause();
      return;
    }
    if (!box) {
      box = el('div', 'adv-still');
      box.innerHTML = '<div class="adv-still-frame"><img alt="" decoding="async"><video muted playsinline preload="auto" disablepictureinpicture hidden></video></div>';
      adv.insertBefore(box, $('adv-status'));
    }
    box.dataset.size = c.size === 'band' ? 'band' : 'large';
    // 视频（008 开场：src 写 .mp4）：静音放一遍、停在最后一帧；取景照 focus / zoom，不摇
    const vid = box.querySelector('video');
    if (/\.mp4(\?|$)/i.test(c.src ?? '')) {
      const frame = box.querySelector('.adv-still-frame');
      box.querySelector('img').hidden = true;
      vid.hidden = false;
      // pan：从第一个点摇到第二个点（视频像素），ms 毫秒走完（不写按片子长度）——008 开场：先对着筹码，再往上摇到她的脸
      const fit = () => {
        const W = frame.clientWidth;
        const H = frame.clientHeight;
        const iw = vid.videoWidth;
        const ih = vid.videoHeight;
        if (!W || !H || !iw || !ih) return;
        const k = Math.max(W / iw, H / ih) * Math.max(1, Number(c.zoom) || 1);
        const at = (pt) => {
          const [fx, fy] = Array.isArray(pt) ? pt : [iw / 2, ih / 2];
          return `translate(${Math.min(0, Math.max(W - iw * k, W / 2 - fx * k)).toFixed(1)}px, ${Math.min(0, Math.max(H - ih * k, H / 2 - fy * k)).toFixed(1)}px)`;
        };
        const pan = Array.isArray(c.pan) && c.pan.length === 2 ? c.pan : null;
        Object.assign(vid.style, { width: `${iw * k}px`, height: `${ih * k}px`, transform: at(pan ? pan[1] : c.focus) });
        for (const a of vid.getAnimations?.() ?? []) a.cancel();
        if (pan && !reduce.matches) animate(vid, [{ transform: at(pan[0]) }, { transform: at(pan[1]) }], { duration: Number(c.ms) || (vid.duration || 4) * 1000, easing: 'ease-in-out' });
      };
      if (vid.dataset.src !== c.src) {
        vid.dataset.src = c.src;
        vid.src = c.src;
        vid.onloadedmetadata = fit;
      }
      vid.currentTime = 0;
      vid.play().catch(() => {});
      fit();
      void box.offsetWidth;
      box.classList.add('is-on');
      return;
    }
    vid.pause();
    vid.hidden = true;
    const img = box.querySelector('img');
    img.hidden = false;
    const place = () => {
      const frame = box.querySelector('.adv-still-frame');
      const W = frame.clientWidth;
      const H = frame.clientHeight;
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      if (!W || !H || !iw || !ih) return;
      const k = Math.max(W / iw, H / ih) * Math.max(1, Number(c.zoom) || 1);
      img.style.width = `${iw * k}px`;
      img.style.height = `${ih * k}px`;
      const at = (pt) => {
        const [fx, fy] = Array.isArray(pt) ? pt : [iw / 2, ih / 2];
        const tx = Math.min(0, Math.max(W - iw * k, W / 2 - fx * k));
        const ty = Math.min(0, Math.max(H - ih * k, H / 2 - fy * k));
        return `translate(${tx.toFixed(1)}px, ${ty.toFixed(1)}px)`;
      };
      for (const a of img.getAnimations?.() ?? []) a.cancel();
      const pan = Array.isArray(c.pan) && c.pan.length === 2 ? c.pan : null;
      if (pan && !reduce.matches) {
        img.style.transform = at(pan[1]);
        animate(img, [{ transform: at(pan[0]) }, { transform: at(pan[1]) }], { duration: Number(c.ms) || 3200, easing: 'ease-in-out' });
      } else img.style.transform = at(c.focus);
    };
    if (img.dataset.src !== c.src) {
      // 新图解码好了才换上：旧图留到那一刻，框里不空
      img.dataset.src = c.src;
      const next = new Image();
      next.src = c.src;
      const swap = () => {
        if (img.dataset.src !== c.src) return;
        img.onload = () => {
          img.onload = null;
          place();
        };
        img.src = c.src;
        if (img.complete && img.naturalWidth) img.onload?.();
      };
      // 解码好或者加载完，哪个先到用哪个（后台标签页里 decode 可能一直不回来）
      let went = false;
      const go = () => {
        if (went) return;
        went = true;
        swap();
      };
      next.onload = go;
      next.onerror = go;
      next.decode?.().then(go, go);
      if (next.complete && next.naturalWidth) go();
    } else place();
    void box.offsetWidth;
    box.classList.add('is-on');
  }

  /**
   * 剧情里填名字（007 开场：做冒险者卡）：这一句写 input: { kind: "name", title 小卡左上角的签, label 栏名, placeholder, button, max 最多几个字 }。
   * 对话框上面出一张小卡（输入框 +「登记」），填好才往下走；名字存本机（tobatsu.player-name，各委托共用，下次进来填好了上次的），
   * 之后的台词里 {name} 换成它，card.js 接 name 事件写到冒险者卡上。跳过剧情＝沿用上次的名字（没填过就是「新人」）
   */
  function storyInput(c) {
    A.lock = true;
    $('adv').querySelector('.adv-input')?.remove();
    const box = el('form', 'adv-input');
    box.innerHTML = '<span class="stamp-tag"></span><label class="adv-input-row"><span class="adv-input-label"></span><input type="text" autocomplete="off" enterkeyhint="done" spellcheck="false"></label><button type="submit" class="adv-input-ok"></button>';
    box.querySelector('.stamp-tag').textContent = tr(c.title ?? '冒险者卡');
    box.querySelector('.adv-input-label').textContent = tr(c.label ?? '名字');
    const input = box.querySelector('input');
    input.maxLength = Math.max(1, Math.min(16, Number(c.max) || 10));
    input.placeholder = tr(c.placeholder ?? '写下你的名字');
    input.value = playerName();
    box.querySelector('.adv-input-ok').textContent = tr(c.button ?? '登记');
    // 点这张卡不要让对话框往下走
    for (const type of ['click', 'pointerdown', 'pointerup']) box.addEventListener(type, (ev) => ev.stopPropagation());
    box.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const name = input.value.replace(/\s+/g, ' ').trim().slice(0, input.maxLength);
      if (!name) {
        input.focus();
        animate(input, [{ translate: '-6px 0' }, { translate: '6px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 260 });
        return;
      }
      try {
        localStorage.setItem(NAME_KEY, name);
      } catch {}
      input.blur();
      // 旧浏览器不认 overflow: clip，点输入框时整层被滚上去过：滚回来
      $('adv').scrollTop = 0;
      $('adv').scrollLeft = 0;
      emit('name', { name });
      emit('tap');
      box.classList.add('is-done');
      setTimeout(() => {
        box.remove();
        if (S.screen !== 'story') return;
        A.lock = false;
        advance();
      }, reduce.matches ? 0 : 420);
    });
    $('adv').append(box);
    animate(box, [{ translate: '-50% -24px', scale: '1.1', opacity: 0 }, { translate: '-50% 0', scale: '1', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1)' });
  }

  /**
   * 剧情里的倒数（006 开场：「3、2、1、0」，数到 0 进入催眠状态）：这一句写 countdown { from, every 每个数停几秒, lines 每个数对话框里换的那句（从 from 到 0）,
   *   hold 数到 0 停几秒, delay 这一句出来多久开始数, trance 数到 0 之后她身上螺旋多浓 }。
   * 大数字用准备倒数那一枚，每一下的演出同战斗里最后几秒（fx.js 接 storycount：心跳、冲击环、耳边数；0＝响指）。数完自己走到下一句，数的时候点不动
   */
  function storyCount(c, who) {
    const from = Math.max(1, Math.round(Number(c.from) || 3));
    const every = Math.max(0.5, Number(c.every) || 1.3) * 1000;
    const lines = Array.isArray(c.lines) ? c.lines : [];
    const box = $('count');
    let n = from;
    A.lock = true;
    clearTimeout(A.timer);
    const next = () => {
      if (S.screen !== 'story') return;
      box.hidden = false;
      box.classList.toggle('count--zero', n === 0);
      sticker(box, String(n));
      animate(box, [{ scale: '1.9', opacity: 0.2 }, { scale: '0.92', opacity: 1, offset: 0.6 }, { scale: '1', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1)' });
      // 先报数再换台词：fx.js 靠这个顺序让停着的特写（怀表）数完才收
      emit('storycount', { left: n, from, trance: c.trance });
      const text = lines[from - n];
      if (text) speak(who, text);
      if (n > 0) {
        n--;
        A.timer = setTimeout(next, every);
        return;
      }
      shake();
      A.timer = setTimeout(() => {
        box.hidden = true;
        box.classList.remove('count--zero');
        A.lock = false;
        advance();
      }, Math.max(0.6, Number(c.hold) || 1.8) * 1000);
    };
    A.timer = setTimeout(next, Math.max(0, Number(c.delay ?? 1.2)) * 1000);
  }
  function storyUnlock() {
    clearTimeout(A.timer);
    A.lock = false;
    if (S.screen === 'story') $('adv-menu').replaceChildren();
    $('adv').querySelector('.adv-input')?.remove();
    $('count').classList.remove('count--zero');
  }

  function advance() {
    if (S.screen !== 'story' || A.lock) return;
    A.i++;
    if (A.i < A.list.length) return showStoryLine();
    finishStory();
  }

  function finishStory() {
    const done = A.done;
    A.done = null;
    storyUnlock();
    storyStill(false);
    done?.();
  }

  function skipStory() {
    if (S.screen !== 'story') return;
    // 跳过也把后面几句的布景走一遍，下一个画面接得上（催眠状态也是：跳过了倒数，照样算数到 0）
    for (let j = A.i; j < A.list.length; j++) {
      const e = A.list[j];
      if (j > A.i) applyScene(e);
      if (j > A.i && e.trance !== undefined) emit('trance', { wash: e.trance === true ? 0.3 : Number(e.trance) || 0 });
      if (e.countdown?.trance !== undefined) emit('trance', { wash: e.countdown.trance === true ? 0.3 : Number(e.countdown.trance) || 0 });
      // 跳过的那几句里换过曲子：换成最后那一首
      if (j > A.i && e.bgm) bgmSwitch(e.bgm);
    }
    $('count').hidden = true;
    finishStory();
  }

  $('adv').addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    advance();
  });
  $('adv-skip').addEventListener('click', () => {
    emit('tap');
    skipStory();
  });
  addEventListener('keydown', (e) => {
    if (S.screen === 'story' && (e.key === ' ' || e.key === 'Enter') && !e.repeat && !e.target.closest?.('input, textarea')) {
      e.preventDefault();
      advance();
    }
  });

  /** 对话框右上方的选单 */
  function menu(question, items) {
    const box = $('adv-menu');
    box.replaceChildren();
    if (question) box.append(el('p', 'adv-q', question));
    slam(box.firstElementChild);
    items.forEach(({ id, label, main, fn }, i) => {
      const b = el('button', main ? 'choice choice--main' : 'choice');
      b.type = 'button';
      b.dataset.id = id;
      b.append(main ? stickerEl('span', '', label) : el('span', '', label));
      b.addEventListener('click', () => {
        emit('choose', { id });
        fn();
      });
      box.append(b);
      animate(b, [{ opacity: 0, transform: `${SKEW} translateX(80px)` }, { opacity: 1, transform: `${SKEW} translateX(0)` }], {
        duration: 260,
        delay: 120 + i * 80,
        easing: 'cubic-bezier(.2,.8,.2,1)',
        fill: 'backwards',
      });
    });
  }

  // ================= 准备倒数 =================

  function toPrep({ endless = S.endless } = {}) {
    leaveBattle();
    S.endless = endless;
    S.shot = null;
    S.pend = null;
    S.pendLatch = false;
    S.lured = 0;
    setScreen('prep');
    keepAwake(true);
    setArt(endless ? 'endless' : 'idle');
    S.countLeft = T().readyCountdown;
    showCount(true);
    rhReset();
    // 规则开关：这一组开头是哪几条（无尽战斗用 endless.rules）
    setRules(endless ? endlessCfg().rules : setCfg().rules, { reset: true });

    // 提醒带：这一组写了 tip 就用它（教学关每组教一件事），不然用 timing.readyTip；『』里的词标成 HUD 色
    // 写成空串＝这一组不出提示条（008 第 3、4 组）
    const p = $('prep-tip-text');
    p.replaceChildren();
    const tipText = String(setCfg().tip ?? T().readyTip ?? '');
    for (const part of tipText.split(/(『[^』]*』)/)) {
      if (!part) continue;
      // 英语里『』是外来符号：高亮照旧，括号去掉
      p.append(part.startsWith('『') ? el('em', '', LANG === 'en' ? part.slice(1, -1) : part) : document.createTextNode(part));
    }
    const tip = $('prep-tip');
    tip.hidden = !tipText;
    if (tipText) animate(tip, [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 320, easing: 'cubic-bezier(.2,.8,.2,1)' });
    say(setCfg().prep ?? '准备');
  }

  function showCount(first = false) {
    const c = $('count');
    c.hidden = false;
    sticker(c, String(Math.max(1, Math.ceil(S.countLeft))));
    animate(c, [{ scale: '1.9', opacity: 0.2 }, { scale: '0.92', opacity: 1, offset: 0.6 }, { scale: '1', opacity: 1 }], {
      duration: 300,
      easing: 'cubic-bezier(.3,.7,.3,1)',
    });
    if (!first) knobPop(1.3, 0.72);
  }

  // ================= 战斗（一组） =================

  function toHold() {
    S.shot = null;
    S.pend = null;
    // 先归零再换画面：假装无尽（guised）看的是这一组的秒数
    S.elapsed = 0;
    S.over = null;
    setScreen('hold');
    keepAwake(true);
    // 这一局一共坚持了多久（连贯的组结算时用）
    if (S.set === 1 || !continuous()) S.total = 0;
    clockText(guised() ? '0' : String(target()));
    S.phase = 'early';
    S.cuesDone = new Set();
    camKey = -1;
    app.dataset.phase = 'early';
    S.nextBeatAt = 0;
    S.nextLineAt = stageCell('early').lineEvery ?? 6;
    S.cutinBusy = false;
    $('quit').dataset.state = guised() ? 'bar' : 'pill';
    setFill(0);
    $('clock').hidden = false;
    sticker($('clock'), guised() ? '0' : String(target()));
    setArt('early');
    rhStart();
    emit('phase', { phase: 'early' });
    if (lineCueSoon() == null) say(stageCell('early').line);
  }

  /**
   * 接下来 within 秒里有没有定时的台词（「台词条」，或者带着她那句话的出题）：有的话返回它的秒数，各段自己的台词条先不换——
   * 不然刚换上一句，零点几秒就被定时的那句盖掉，两句都读不完
   */
  function lineCueSoon(within = 2.5) {
    if (S.over) return null;
    let soon = null;
    for (const [i, c] of (setCfg().script ?? []).entries()) {
      if (S.cuesDone?.has(i) || !(c?.at >= S.elapsed) || c.at > S.elapsed + within || typeof c.fx !== 'string') continue;
      const talks = c.fx === '台词条' || (c.fx.startsWith('挑战-') && (c.pool || (c.lured?.pool && S.lured > 0)));
      if (talks) soon = soon == null ? c.at : Math.min(soon, c.at);
    }
    return soon;
  }

  function changePhase(phase) {
    const from = S.phase;
    S.phase = phase;
    app.dataset.phase = phase;
    $('quit').dataset.state = phase === 'early' ? 'pill' : phase === 'mid' ? 'bar' : 'pulse';
    emit('phase', { phase });
    setArt(phase);
    // 只有往后走才放 cut-in（dev 面板往回跳不放）
    const order = ['early', 'mid', 'late'];
    if (order.indexOf(phase) > order.indexOf(from)) {
      const c = stageCell(phase === 'mid' ? 'toMid' : 'toLate');
      if (c.cutin) cutin(c.cutin, phase, c.side ?? (phase === 'mid' ? 'right' : 'left'));
    }
    // 这一段的第一句：cut-in 收回之后马上接（cut-in 期间 tick 不换台词）
    S.nextLineAt = S.elapsed;
  }

  function holdTick(dt, now) {
    if (S.finishLeft > 0) return finishTick(dt);
    if (pressTick(now)) return;
    if (S.freeze) {
      beatTick();
      return rhStep(dt, (RP().speed?.[S.phase] ?? 1) * tempoOf() * S.tempo);
    }
    S.elapsed += dt;
    S.total = (S.total ?? 0) + dt;
    if (setCfg().guise) guiseSync();
    if (S.over) {
      overtimeTick();
      if (S.finishLeft > 0) return;
    } else if (S.elapsed >= target()) {
      // 21 点（008）：罚时数到 0 不算过——歇下来、发下一手交给 blackjack.js（赢够了手数它再调 toFinish 收这一组）
      if (S.bjTarget > 0 && window.tobatsu._?.bjZero?.()) {
        S.elapsed = target();
        clockText('0');
      } else if (overtimeOf().length) startOvertime();
      else {
        S.elapsed = target();
        clockText('0');
        return toFinish();
      }
    } else {
      clockTick();
    }
    const phase = phaseAt(Math.min(S.elapsed, target()));
    if (phase !== S.phase) changePhase(phase);
    cameraTick();
    cueTick();
    beatTick();
    if (S.elapsed >= S.nextLineAt && !S.cutinBusy && !S.press && !S.over) {
      const cell = stageCell(S.phase);
      const soon = lineCueSoon();
      // 定时的那句马上要来：让它先说（它自己会把下一句往后推）
      if (soon != null) S.nextLineAt = soon + 0.05;
      else {
        say(cell.line);
        S.nextLineAt = S.elapsed + (cell.lineEvery ?? 6);
      }
    }
    rhStep(dt, (RP().speed?.[S.phase] ?? 1) * tempoOf() * S.tempo);
  }

  // ================= 超时：秒数走完之后不数 0 =================
  //
  // sets[n - 1].overtime 是一串步骤，按顺序演（这段时间 S.elapsed 接着涨，定时演出 script 的 at 可以写到秒数后面）：
  //   { "do": "hold", "value": "1", "seconds": 7, "tick": 1, "whisper": 池 }   秒数停在 value；tick＝每几秒再「数」一次（弹一下 + 心跳，whisper 耳边说，{n}＝数字），不写＝干停着
  //   { "do": "count", "values": [0.9, 0.8, …], "every": 1 }                   一个一个换数字；或 "from": 2, "to": 30（整数，一次 ±1）；
  //                                                                             every 每个停几秒，写 [起, 止] 就越来越快 / 慢；pop 往上数时秒数旁边冒的字（如 "+1"）；whisper 同上
  //   { "do": "rewind", "to": 30, "seconds": 1.6 }                              秒数一路滚回 to（倒带：她亲一下秒数、画面倒带纹；quiet: true 不放这段演出，悄悄改）
  //   { "do": "words", "pool": 池, "seconds": 6, "every": 1, "maxLen": 4 }       秒数那一格换成言责词：每 every 秒换一个（池里抽、只挑 maxLen 字以内的、不连着重复），
  //                                                                             停 seconds 秒（005：数到 1 之后不数 0，「白痴~」「笨蛋~」一拍一个）
  //   { "do": "challenge", "shape": "零", "size": 0.4, "time": 9, "missLine": 池 }   出一道拖动题（shape 零＝照着「0」描一圈，size 占画面的比例），秒数停着；
  //                                                                             画完才走下一步，没画完（超时）说 missLine、再出一次（不算败北）
  //   { "do": "challenge", "kind": "分岔", "onReward": "lose", … }                分岔题（005）：通过＝走下一步；奖励＝onReward：lose 当场败北（进败北处决）、
  //                                                                             bonus 放 rewardCue 那条演出、停 rewardHold 秒再走下一步。分岔自己的参数见 challenge.e79d111f0f.js buildFork
  // 每一步都能写：strain（hold 用：刚停住时秒数憋住一样放大挣扎、再弹回来，写秒数或 true＝1.8 秒；tick 从挣扎完才开始数）、
  //   script（这一步自己的定时演出，at 从这一步开始算——挑战要画多久说不准，后面的台词只能跟着步骤走）
  // 演完：连贯的组（quest.flow = "continuous"）直接接下一组；不然（或者已经是最后一组）数 0、照常余韵
  // 事件 clock { kind: 'step' | 'tick' | 'count' | 'rewind', … } 给 fx.95ba3bedf1.js 放演出

  const overtimeOf = (n = S.set) => (Array.isArray(setCfg(n).overtime) ? setCfg(n).overtime : []);
  /** 这一步 count 要换的数字 */
  function countValues(step) {
    if (Array.isArray(step.values)) return step.values;
    const from = Number(step.from);
    const to = Number(step.to);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return [];
    const dir = to >= from ? 1 : -1;
    return Array.from({ length: Math.abs(to - from) + 1 }, (_, i) => from + i * dir);
  }
  /** 第 i 个数字停几秒（every 写 [起, 止] 时线性变） */
  function countEvery(step, i, n) {
    const e = step.every ?? 1;
    if (!Array.isArray(e)) return Math.max(0.05, Number(e) || 1);
    return Math.max(0.05, e[0] + (e[1] - e[0]) * (n > 1 ? i / (n - 1) : 0));
  }
  /** 言责词：从池里挑 maxLen 字以内的（不算尾巴），不连着重复；没尾巴的补一个「~」 */
  function pickShort(spec, maxLen = 4, avoid = []) {
    const pool = poolOf(spec);
    // 字数按 glyphLen 算（中日文一个字 1、西文字母 0.55）：英语版的词不会因为字母多被全筛掉
    const all = (L[pool] ?? []).filter((w) => typeof w === 'string' && glyphLen(w.replace(/[w~～〜♥♡…]+$/, '')) <= maxLen);
    if (!all.length) return pick(spec);
    // avoid：最近出过的几个（带不带「~」都算同一个）
    const bare = (w) => String(w).replace(/[~～〜]+$/, '');
    const recent = new Set((Array.isArray(avoid) ? avoid : [avoid]).filter(Boolean).map(bare));
    const fresh = all.filter((w) => !recent.has(bare(w)));
    const choices = fresh.length ? fresh : all;
    const w = choices[Math.floor(Math.random() * choices.length)];
    // 日语版的波浪号用「〜」（和别处的言责尾巴一样）
    return SUFFIX_END.test(w) ? w : `${w}${LANG === 'ja' ? '〜' : '~'}`;
  }

  /** 秒数的字：长了（0.01 这种）字号收小一点 */
  function clockText(text) {
    const c = $('clock');
    if (c.dataset.text === text) return;
    sticker(c, text);
    // 逗留（007）往下数的 −1、−2 用的是真的负号「−」，也算数字
    const word = !/^[\d.+\-−]+$/.test(text);
    c.classList.toggle('clock--word', word);
    c.classList.toggle('clock--long', !word && text.length >= 3);
  }

  function startOvertime() {
    S.over = { i: -1, cues: [] };
    nextStep();
  }

  function nextStep() {
    const O = S.over;
    const steps = overtimeOf();
    O.i++;
    const step = steps[O.i];
    if (!step) return endOvertime();
    O.step = step;
    O.t0 = S.elapsed;
    O.k = -1;
    O.from = Number($('clock').dataset.text) || 0;
    O.strain = step.strain === true ? 1.8 : Number(step.strain) || 0;
    O.result = null;
    O.retryAt = S.elapsed;
    O.tries = 0;
    for (const c of Array.isArray(step.script) ? step.script : []) O.cues.push({ ...c, at: O.t0 + (Number(c.at) || 0) });
    if (O.strain) emit('clock', { kind: 'strain', seconds: O.strain });
    if (step.do === 'words') {
      const every = Math.max(0.05, Number(step.every) || 1);
      const n = Math.max(1, Math.round((step.seconds ?? 6) / every));
      O.values = [];
      // 最近出过的 5 个不再出（上一步 words 的也算：第 3 组超时是两步接着换）
      const seen = O.recentWords ?? [];
      for (let i = 0; i < n; i++) O.values.push(pickShort(step.pool ?? '言责-贬损', step.maxLen ?? 4, [...seen, ...O.values].slice(-5)));
      O.recentWords = [...seen, ...O.values].slice(-8);
      O.times = O.values.map((_, i) => i * every);
      O.length = step.seconds ?? n * every;
    }
    if (step.do === 'count') {
      O.values = countValues(step);
      O.times = [];
      let t = 0;
      O.values.forEach((_, i) => {
        O.times.push(t);
        t += countEvery(step, i, O.values.length);
      });
      O.length = t;
    }
    emit('clock', { kind: 'step', step, index: O.i });
    if (step.do === 'rewind') {
      $('clock').classList.remove('clock--allure');
      // quiet：不放倒带的演出（006 的记忆空白：眼前黑着的时候悄悄改掉）
      if (!step.quiet) {
        play('魅惑闪光');
        emit('clock', { kind: 'rewind', from: O.from, to: Number(step.to) || 0, seconds: step.seconds ?? 1.6 });
      }
    }
    if (step.do === 'hold') clockText(String(step.value ?? $('clock').dataset.text));
    if (step.do === 'stay') stayStart(step);
  }

  function overtimeTick() {
    const O = S.over;
    // 这一步自己的定时演出（at 已经换成这组的秒数）
    for (const c of O.cues) {
      if (c.done || c.at > S.elapsed) continue;
      c.done = true;
      emit('cue', { cue: c });
    }
    const step = O.step;
    const t = S.elapsed - O.t0;
    if (step.do === 'hold') {
      if (step.tick > 0 && t >= O.strain) {
        const k = Math.floor((t - O.strain) / step.tick);
        if (k > O.k) {
          O.k = k;
          emit('clock', { kind: 'tick', text: $('clock').dataset.text, count: k, whisper: step.whisper });
        }
      }
      if (t >= (step.seconds ?? 1)) nextStep();
    } else if (step.do === 'count' || step.do === 'words') {
      let idx = O.k;
      while (idx + 1 < O.values.length && O.times[idx + 1] <= t) idx++;
      if (idx > O.k) {
        O.k = idx;
        const text = String(O.values[idx]);
        const prev = Number($('clock').dataset.text);
        clockText(text);
        if (step.do === 'words') emit('clock', { kind: 'word', text, index: idx, whisper: step.whisper });
        else emit('clock', { kind: 'count', text, index: idx, up: Number(text) > prev, pop: step.pop, whisper: step.whisper });
      }
      if (t >= O.length) nextStep();
    } else if (step.do === 'challenge') {
      // 秒数停着；画完才走。题不在场（还没出、失手收掉了、切后台作废了）就再出一次
      // words { pool, every, maxLen }：出题期间秒数那一格一拍换一个词（005 的分岔：站主 2026-09-24 不要一直是问号）
      if (step.words && O.result !== 'lost') {
        const k = Math.floor(t / Math.max(0.3, Number(step.words.every) || 1));
        if (k > O.k) {
          O.k = k;
          const seen = O.recentWords ?? [];
          const word = pickShort(step.words.pool ?? '超时-言责', step.words.maxLen ?? 4, seen.slice(-5));
          O.recentWords = [...seen, word].slice(-8);
          clockText(word);
          emit('clock', { kind: 'word', text: word, index: k });
        }
      }
      const api = window.tobatsu._?.challenge;
      if (O.result === 'hit') {
        if (S.elapsed < O.doneAt) return;
        if (O.choice !== 'reward') return nextStep();
        // 分岔选了「奖励」：lose＝当场败北；bonus＝放 rewardCue、停一会儿再往下走
        if (step.onReward === 'lose') {
          // 无敌模式：不算输，这一题重新出（走到「通过」那头才往下走）
          if (S.invincible) {
            O.result = null;
            O.choice = null;
            O.retryAt = S.elapsed + 1.4;
            return;
          }
          O.result = 'lost';
          S.freeze = true;
          return toFall({ kind: '分岔', why: 'reward' });
        }
        if (!O.bonusAt) {
          O.bonusAt = S.elapsed + (step.rewardHold ?? 6);
          if (step.rewardCue) emit('cue', { cue: step.rewardCue });
        }
        if (S.elapsed >= O.bonusAt) nextStep();
      } else if (api && !api.active() && S.elapsed >= O.retryAt && !S.press && S.resumeLeft <= 0) {
        const placed = api.spawn(step.kind ?? '拖动', {
          practice: true,
          cue: { ...step, place: step.place ?? 'center' },
        });
        O.retryAt = S.elapsed + (placed ? 0.5 : 0.3);
        if (placed) O.tries++;
      }
    } else if (step.do === 'rewind') {
      const d = Math.max(0.1, step.seconds ?? 1.6);
      const k = Math.min(1, t / d);
      const to = Number(step.to) || 0;
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      clockText(String(Math.round(O.from + (to - O.from) * e)));
      if (k >= 1) nextStep();
    } else if (step.do === 'stay') {
      stayTick(step, t);
    } else {
      nextStep();
    }
  }

  // 超时里的挑战：画完 / 没画完
  bus.addEventListener('challenge', (e) => {
    const O = S.over;
    if (!O || O.step?.do !== 'challenge' || S.screen !== 'hold') return;
    if (e.detail.state === 'hit') {
      O.result = 'hit';
      O.choice = e.detail.choice ?? null;
      O.bonusAt = null;
      O.doneAt = S.elapsed + (O.step.after ?? 0.7);
    } else if (e.detail.state === 'miss') {
      O.retryAt = S.elapsed + 1.4;
    }
  });

  // ================= 逗留（007 起：秒数走完先给「通过」，这一组不马上结束）=================
  //
  // 超时步骤 do: "stay"：秒数到 0 那一刻盖「通过」，但不结束——她劝他多留一会儿。下面的「长按放弃」换成「长按通过」，按满才真的走；
  // 留着的时候每隔 every 秒，秒数往下数一格（−1、−2……；越留越快：ramp 秒里从 every 缩到 everyTo），card.js 接 clock { kind: "stay" } 扣一级，
  // 等级扣到 0 就输。她每 lineEvery 秒换一句 line（刚进来先说 open）；loop 里的演出每 loopEvery 秒按顺序放一条、放完从头再来
  // （写法同定时演出：{ "fx": "特写-胸-循环", "hold": 3 }、{ "fx": "视频", "still": … }）；按着通过时说 pressLine、松手说 releaseLine。
  // label / pill：长按按钮上换成的字（默认「长按通过」/「通过」）；stampHold：「通过」那枚章停几秒
  // intro：先讲规则的台词池（按顺序一句一句说完才开始扣，introEvery 每句至少停几秒），讲完说 go；扣的时候秒数每秒一跳（同最后几秒的倒数），
  // 秒数上面的小签写着现在多久扣一级
  const stayStep = () => (S.over?.step?.do === 'stay' ? S.over.step : null);
  function stayEvery(step, t) {
    const a = Math.max(0.2, Number(step.every) || 2.5);
    const b = Math.max(0.2, Number(step.everyTo ?? a) || a);
    const k = Math.min(1, t / Math.max(0.1, Number(step.ramp) || 20));
    return a + (b - a) * k;
  }
  function stayStart(step) {
    const O = S.over;
    O.k = 0;
    O.intro = (Array.isArray(L[step.intro]) ? L[step.intro] : []).filter((x) => typeof x === 'string' && x);
    O.introI = 0;
    O.introAt = S.elapsed + (step.introFirst ?? 0.9);
    O.phase = O.intro.length ? 'intro' : 'drain';
    O.ordered = !step.order;
    O.drainT0 = S.elapsed;
    O.beatK = 0;
    O.next = S.elapsed + (step.drainFirst ?? stayEvery(step, 0));
    O.lineAt = S.elapsed + (step.lineEvery ?? 4.5);
    O.loopAt = S.elapsed + (step.loopFirst ?? 1.4);
    O.loopI = 0;
    clockText('0');
    app.dataset.stay = O.phase;
    // 长按按钮：放弃 → 通过
    const bar = app.querySelector('#quit-bar .slab-body .sticker');
    const pill = app.querySelector('#quit-pill > span');
    S.stayLabels ??= [bar?.textContent ?? '', pill?.textContent ?? ''];
    if (bar) sticker(bar, tr(step.label ?? '长按通过'));
    if (pill) pill.textContent = tr(step.pill ?? '通过');
    $('quit').dataset.state = 'bar';
    // 「第 n 组 通过」砸下来一下就收，秒数上面留一枚「已通过」的小签
    const box = $('pass');
    box.replaceChildren(stampNode(tr('第 {n} / {total} 组', { n: shownSet(), total: shownSets() }), tr('通过')));
    box.hidden = false;
    slam(box.firstElementChild);
    shake();
    play('余韵');
    clearTimeout(S.stayStampTimer);
    S.stayStampTimer = setTimeout(() => {
      if (stayStep() === step) $('pass').hidden = true;
    }, (step.stampHold ?? 1.8) * 1000);
    let tag = $('stay-tag');
    if (!tag) {
      tag = el('div', 'stay-tag');
      tag.id = 'stay-tag';
      tag.innerHTML = '<b class="stay-tag-main"></b><small class="stay-tag-rate"></small>';
      app.append(tag);
    }
    tag.querySelector('.stay-tag-main').textContent = tr(step.tag ?? '已通过');
    stayRate(step, 0);
    if (O.phase === 'drain') {
      say(step.open ?? step.line);
      if (step.drainCue) emit('cue', { cue: step.drainCue });
    }
    emit('stay', { state: 'start', set: S.set });
  }
  /** 小签下面那行：讲规则的时候写「长按通过就能走」，扣的时候写多久扣一级 */
  function stayRate(step, t) {
    const small = $('stay-tag')?.querySelector('.stay-tag-rate');
    if (!small) return;
    if (S.over?.phase === 'intro') small.textContent = tr('长按通过就能走');
    else small.textContent = tr('−1 级 / {s} 秒', { s: String(Math.round(stayEvery(step, t) * 10) / 10) });
  }
  /** 扣的时候秒数一跳一跳（同最后几秒的倒数）：big＝扣了一级的那一下 */
  function stayBeat(big = false) {
    const c = $('clock');
    play('心跳');
    if (reduce.matches) return;
    animate(c, [{ scale: big ? '1.7' : '1.3' }, { scale: '0.92', offset: 0.55 }, { scale: '1' }], { duration: big ? 480 : 360, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
  }
  /** 台词里的 {lv}、{name}（讲规则那几句不走 pick） */
  const fillLine = (text) => withName(text.includes('{lv}') ? text.replaceAll('{lv}', String(window.tobatsu._?.cardLv?.() ?? '')) : text);
  function stayTick(step, t) {
    const O = S.over;
    // 先讲规则：一句一句说完才开始扣（这时候已经能「长按通过」走掉）
    if (O.phase === 'intro') {
      if (S.elapsed < O.introAt || S.press) return;
      if (O.introI < O.intro.length) {
        const text = fillLine(suffixed(step.intro, O.intro[O.introI]));
        $('say-text').textContent = text;
        emit('line', { pool: step.intro, text });
        O.introI++;
        O.introAt = S.elapsed + Math.max(Number(step.introEvery) || 2.4, [...text].length * 0.11 + 1);
        return;
      }
      // order（007 第 1 组）：规则讲完、开始吸之前下一道命令（「不许离开，让姐姐吸一下」）；命令停着的这几秒还不扣
      if (!O.ordered) {
        O.ordered = true;
        emit('cue', { cue: { fx: '命令', text: step.order, hold: step.orderHold ?? 2.6 } });
        O.introAt = S.elapsed + (step.orderHold ?? 2.6) + 0.3;
        return;
      }
      O.phase = 'drain';
      app.dataset.stay = 'drain';
      O.drainT0 = S.elapsed;
      O.beatK = 0;
      O.next = S.elapsed + stayEvery(step, 0);
      O.lineAt = S.elapsed + (step.lineEvery ?? 4.5);
      O.loopAt = Math.max(O.loopAt, S.elapsed + 0.6);
      if (step.go) say(step.go);
      // drainCue：开始吸的那一刻放的一条（007：停到这组结束、比平时拉近一点的胸部循环特写——吸取中专用的那一个）
      if (step.drainCue) emit('cue', { cue: step.drainCue });
      stayRate(step, 0);
      emit('stay', { state: 'drain', set: S.set });
      return;
    }
    const td = S.elapsed - O.drainT0;
    // 每过一整秒秒数跳一下；到点扣一级（大跳）
    const beat = Math.floor(td);
    const due = S.elapsed >= O.next;
    if (beat > O.beatK) {
      O.beatK = beat;
      if (!due) stayBeat();
    }
    if (due) {
      O.k++;
      clockText(`−${O.k}`);
      stayBeat(true);
      O.next = S.elapsed + stayEvery(step, td);
      stayRate(step, td);
      emit('clock', { kind: 'stay', count: O.k });
      // 扣到 0 输掉了（card.js 叫 toFall）：这一步不再往下走
      if (S.freeze || stayStep() !== step) return;
      // 换台词只挑刚扣完的这一刻：{lv} 和卡上的数对得上
      if (S.elapsed >= O.lineAt && !S.press && !S.cutinBusy) {
        if (step.line) say(step.line);
        O.lineAt = S.elapsed + (step.lineEvery ?? 4.5) - 0.5;
      }
    }
    const loop = Array.isArray(step.loop) ? step.loop : [];
    if (loop.length && S.elapsed >= O.loopAt && !window.tobatsu._?.challenge?.active?.()) {
      emit('cue', { cue: loop[O.loopI % loop.length] });
      O.loopI++;
      O.loopAt = S.elapsed + (Number(step.loopEvery) || 3.5);
    }
  }
  /**
   * 逗留里按着「长按通过」的时候她打断（007 第 2–4 组，站主 2026-10-19）：stay 步骤的 pressLure [{ at 按到几成, cue 放的那一条（写法同定时演出）,
   *   cancel true＝直接打断（手得松开重新按）/ knock 0–1＝按到的进度退回几成（手不用松）, line 她说的那一池 }]，每一条一次逗留只放一次。
   * 放的是大框（视频 / 特写）时会把吸取中那一条特写顶掉：等它放完再把 drainCue 叫回来。返回 true＝这一下被打断了
   */
  function stayLure(now, p) {
    const st = stayStep();
    const O = S.over;
    if (!st || !O || !Array.isArray(st.pressLure) || !stayHooked(st)) return false;
    O.lured ??= new Set();
    // repeat：每按一次都来（第 4 组挡住进度条那张）；别的一次逗留只来一次
    const seen = (k) => (st.pressLure[k]?.repeat ? (S.press.lured ??= new Set()).has(k) : O.lured.has(k));
    const i = st.pressLure.findIndex((x, k) => !seen(k) && p >= (Number(x?.at) || 0.5));
    if (i < 0) return false;
    const x = st.pressLure[i];
    if (x.repeat) S.press.lured.add(i);
    else O.lured.add(i);
    if (x.cover) stayCover(x.cover);
    if (x.cue) {
      emit('cue', { cue: x.cue });
      if (st.drainCue && /^(视频|特写-)/.test(x.cue.fx ?? '')) {
        setTimeout(() => {
          if (S.over === O && stayStep() === st && O.phase === 'drain' && !window.tobatsu._?.closeupOpen?.()) emit('cue', { cue: st.drainCue });
        }, ((Number(x.cue.hold) || 3) + 1.2) * 1000);
      }
    }
    if (x.line) {
      say(x.line);
      O.lineAt = S.elapsed + (st.lineEvery ?? 4.5);
    }
    if (x.shake !== false) shake();
    emit('stay', { state: 'lure', index: i, cancel: !!x.cancel });
    if (x.cancel) {
      endPress(true);
      return true;
    }
    if (x.knock !== undefined) {
      S.press.start = now - Math.max(0, Math.min(0.95, Number(x.knock) || 0)) * holdToQuit();
      setFill(Number(x.knock) || 0);
      return true;
    }
    return false;
  }

  /**
   * 逗留里挡上来的图（pressLure 的 cover：{ still, focus [x, y], text, hold 秒 或 "press" 按着的时候一直挡着 }）：
   * 从下面升上来盖住长按的那一条（.stay-cover）；松手、通过、离开逗留都收掉
   */
  function stayCover(c) {
    let box = $('stay-cover');
    if (!box) {
      box = el('div', 'stay-cover');
      box.id = 'stay-cover';
      box.innerHTML = '<img alt="" decoding="async"><p class="stay-cover-line"><span class="sticker"></span></p>';
      app.append(box);
    }
    const img = box.querySelector('img');
    if (img.getAttribute('src') !== c.still) img.src = c.still;
    if (Array.isArray(c.focus)) {
      const fit = () => img.naturalWidth && (img.style.objectPosition = `${((c.focus[0] / img.naturalWidth) * 100).toFixed(1)}% ${((c.focus[1] / img.naturalHeight) * 100).toFixed(1)}%`);
      if (img.complete) fit();
      else img.onload = fit;
    } else img.style.objectPosition = '';
    sticker(box.querySelector('.sticker'), c.text ? tr(c.text) : '');
    box.querySelector('.stay-cover-line').hidden = !c.text;
    box.dataset.until = c.hold === 'press' ? 'press' : '';
    clearTimeout(S.stayCoverTimer);
    void box.offsetWidth;
    box.classList.add('is-on');
    app.classList.add('has-stay-cover');
    play('cutin');
    if (c.hold !== 'press') S.stayCoverTimer = setTimeout(stayCoverOff, (Number(c.hold) || 2) * 1000);
  }
  function stayCoverOff(onlyPress = false) {
    const box = $('stay-cover');
    if (!box || (onlyPress && box.dataset.until !== 'press')) return;
    clearTimeout(S.stayCoverTimer);
    box.classList.remove('is-on');
    app.classList.remove('has-stay-cover');
  }

  /** 按满「长按通过」：这一组真的过了 */
  function stayPass() {
    const count = S.over?.k ?? 0;
    stayOff();
    emit('stay', { state: 'pass', set: S.set, count });
    endOvertime();
  }
  /** 收起逗留的样子（通过、输掉、离开战斗都走这里） */
  function stayOff() {
    clearTimeout(S.stayStampTimer);
    stayCoverOff();
    if (!app.hasAttribute('data-stay')) return;
    delete app.dataset.stay;
    const [bar0, pill0] = S.stayLabels ?? [];
    S.stayLabels = null;
    const bar = app.querySelector('#quit-bar .slab-body .sticker');
    const pill = app.querySelector('#quit-pill > span');
    if (bar && bar0) sticker(bar, bar0);
    if (pill && pill0) pill.textContent = pill0;
  }

  function endOvertime() {
    S.over = null;
    if (continuous() && S.set < Q.quest.sets) return continueSet();
    S.elapsed = Math.max(S.elapsed, target());
    clockText('0');
    // final：超时演完才落到 0（005 的言责词之后）——fx.js 放「终场」那一下，余韵至少停 2 秒
    toFinish({ final: true });
  }

  /** 连贯的组：不停，直接接下一组（秒数已经是下一组的起点——往回涨到 30、或往上数到 30） */
  function continueSet() {
    S.set++;
    S.elapsed = 0;
    S.over = null;
    S.cuesDone = new Set();
    camKey = -1;
    syncStandee();
    S.phase = 'early';
    app.dataset.phase = 'early';
    $('quit').dataset.state = 'pill';
    currentSlot = null;
    setArt('early', { quiet: true });
    S.nextBeatAt = 0;
    S.nextLineAt = stageCell('early').lineEvery ?? 6;
    $('clock').classList.remove('clock--allure');
    clockText(String(target()));
    hud();
    rhMeasure();
    emit('set', { set: S.set, continuous: true });
    emit('phase', { phase: 'early' });
    say(stageCell('early').line);
  }

  /** 定时演出里的「台词条」：换台词条上的字，停 hold 秒（默认 4）再让各段自己的台词接着换 */
  function sayCue({ text, pool, hold } = {}) {
    if (text) {
      $('say-text').textContent = text;
      emit('line', { pool: null, text });
    } else if (pool) {
      say(pool);
    } else return;
    S.nextLineAt = S.elapsed + (hold ?? 4);
  }

  /** 每组倒计时（还剩几秒，向上取整）；无尽战斗往上数 */
  function clockTick() {
    const sec = Math.floor(S.elapsed);
    // 无尽里的 21 点（008）：罚时照普通组那样倒数
    const up = (S.screen === 'endless' && !(Q.blackjack?.endless && S.bjTarget > 0)) || guised();
    const shown = up ? sec + (S.screen === 'endless' ? 0 : guiseSkew()) : Math.max(0, Math.ceil(target() - S.elapsed));
    // 和上次显示的比，而不是和上一帧比：dev 面板直接改 elapsed 时也能刷新
    if (String(shown) !== $('clock').dataset.text) {
      sticker($('clock'), String(shown));
      emit('second', up ? { elapsed: sec } : { elapsed: sec, left: shown });
    }
  }

  function beatTick() {
    const now = S.freeze ? performance.now() / 1000 : S.elapsed;
    if (now < S.nextBeatAt) return;
    beat();
    S.nextBeatAt = now + T().beatEvery[S.phase];
  }

  /**
   * 数到 0：先停住放一段余韵（timing.finishHold 秒）——节奏停下、滑块慢慢落回底端、秒数「0」脉动发光，
   * 特效由 fx.95ba3bedf1.js 接 finish 事件放（心形环、立绘慢残影、心往上飘、柔光）；余韵过完才出「通过」。余韵期间长按放弃不算
   */
  function toFinish({ final = false } = {}) {
    // sets[n - 1].finish = "grand"：这一组数到 0 放大号的余韵（003 最后一组），finishHold 可以按组写
    const grand = setCfg().finish === 'grand';
    const want = setCfg().finishHold ?? (grand ? 4 : final ? Math.max(2, T().finishHold ?? 1.4) : (T().finishHold ?? 1.4));
    const hold = reduce.matches ? Math.min(0.6, want) : want;
    endPress(true);
    cutinReset();
    $('quit').dataset.state = 'gone';
    if (hold <= 0) return toPass();
    S.finishLeft = hold;
    $('clock').classList.add('clock--finish');
    play('余韵');
    emit('finish', { set: S.set, hold, grand, final });
  }

  function finishTick(dt) {
    S.finishLeft -= dt;
    RH.pos += (0 - RH.pos) * Math.min(1, dt * 4);
    if (S.finishLeft > 0) return;
    S.finishLeft = 0;
    $('clock').classList.remove('clock--finish');
    toPass();
  }

  /** 一组撑完：「第 n 组 通过」砸下来，停一下进暂停（最后一组进全部通过） */
  function toPass() {
    endPress(true);
    cutinReset();
    $('quit').dataset.state = 'gone';
    setScreen('pass');
    $('clock').hidden = false;
    const box = $('pass');
    box.replaceChildren(stampNode(tr('第 {n} / {total} 组', { n: shownSet(), total: shownSets() }), tr('通过')));
    box.hidden = false;
    slam(box.firstElementChild);
    shake();
    emit('pass', { set: S.set });
    // 假通关（fakeClear.after）那一组：照「全部通过」演，但不记通关
    screenTimer = setTimeout(() => (S.set >= Q.quest.sets ? toClear() : S.set === fakeCfg()?.after ? toClear({ fake: true }) : toPause()), T().passHold * 1000);
  }

  // ================= 暂停 =================

  function toPause() {
    const P = STORY['暂停'] ?? {};
    setScreen('pause');
    keepAwake(false);
    setBg(P.bg ?? 'pause');
    setStand(P.her ?? 'normal');

    const status = $('adv-status');
    const row = el('div', 'adv-status-set');
    row.append(stickerEl('span', 'num', String(S.set)), el('small', '', `/${shownSets()}`));
    const bj = window.tobatsu._?.bjSummary?.();
    status.replaceChildren(el('span', 'stamp-tag', tr('暂停')), row, el('p', '', bj ? tr('赢下 {wins} 手 · 罚时 {secs} 秒 · 通过', { wins: bj.wins, secs: bj.penalty }) : tr('坚持 · {secs} 秒 · 通过', { secs: target() })));
    slam(status);

    // 这一组撑完之后的暂停台词：sets 里写了 pause 池就用它
    const pausePool = setCfg().pause ?? '暂停';
    speak('her', pick(pausePool), pausePool);
    menu(P.question ?? tr('状态如何？'), [
      {
        id: 'continue',
        label: P.continue ?? tr('继续讨伐'),
        main: true,
        fn: () => {
          S.set++;
          toPrep();
        },
      },
      { id: 'retreat', label: P.retreat ?? tr('认输'), fn: toRetreat },
    ]);
  }

  // ================= 全部通过 → 结局 → 最后一击 =================

  function toClear({ fake = false } = {}) {
    if (!fake) endRun('clear');
    else S.newTrophies = [];
    setScreen('clear');
    keepAwake(false);
    setArt('win');
    // 连贯的组：揭底——看起来 1 组 × 60 秒，实际撑了多久
    bigTitle(continuous() ? tr('{goal} · 实际坚持 {secs} 秒', { goal: goalText(), secs: Math.round(S.total ?? 0) }) : goalText(), [tr('全部通过')]);
    setStamps();
    // 假通关可以说另一池（fakeClear.line，006：她装作认输）
    const fakeLine = fake ? fakeCfg()?.line : null;
    say(fakeLine && L[fakeLine] ? fakeLine : '全部通过');
    const cup = (S.newTrophies ?? [])[0];
    if (cup) {
      const b = $('best');
      b.replaceChildren(stampNode(tr('获得奖杯'), tr(cup.name ?? '')));
      b.hidden = false;
      slam(b.firstElementChild, 900);
      setTimeout(() => play('心章'), 900);
    } else if (!fake && S.invincible) {
      // 无敌模式通关：盖一枚「无敌模式 · 不算完成」
      const b = $('best');
      b.replaceChildren(stampNode(tr('无敌模式'), tr('不算完成')));
      b.hidden = false;
      slam(b.firstElementChild, 900);
    }
    // 委托写了 reward.counter（001）：过 3.2 秒台词条换成「Aschan的命令，一共服从了『n』次呢——」+ 按服从了几成评一句
    if (Q.reward?.counter && S.obey.of > 0) screenTimer = setTimeout(obeyLine, 3200);
    action(tr('继续'), () => (fake ? runStory(fakeCfg().story ?? '结局', toFakeChoice) : runStory('结局', toChoice)));
  }

  /**
   * 假通关的「最后一击」（006）：选项照常出来；delay 秒后（或者玩家伸手去点「给出最后一击」的那一刻）她下一道命令——
   * fx.95ba3bedf1.js 接 forced 事件放响指 + 「命令」大字 + 洗脑进度 100%；「给出最后一击」抖两下碎掉，剩下的那个选项变成主按钮。
   * 选了它：演 fakeClear.spare 那段剧情，再进下一组（真正的最后一组）。文案在 story 的 fakeClear.choice 那一段：
   *   { text, strike, bypass, order 命令的大字, after 命令之后对话框里换的那句 }
   */
  function toFakeChoice() {
    const F = fakeCfg();
    const P = STORY[F.choice ?? '最后一击'] ?? {};
    setScreen('choice');
    setBg(P.bg ?? 'choice');
    if (P.her) setStand(P.her);
    speak(P.who ?? 'narrator', P.text ?? '', '最后一击');
    let forced = false;
    const go = () => {
      S.route = '';
      runStory(F.spare ?? '绕过', () => {
        S.set = F.after + 1;
        toPrep({ endless: false });
      });
    };
    const force = () => {
      if (forced || S.screen !== 'choice') return;
      forced = true;
      clearTimeout(screenTimer);
      const box = $('adv-menu');
      const strike = box.querySelector('[data-id="strike"]');
      const spare = box.querySelector('[data-id="bypass"]');
      emit('forced', { order: P.order ?? P.bypass ?? tr('饶过魔物'), willing: false });
      if (P.afterHer) setStand(P.afterHer);
      if (P.after) speak(P.who ?? 'her', P.after, '最后一击');
      if (strike) {
        strike.disabled = true;
        strike.classList.add('choice--gone');
        if (reduce.matches) strike.remove();
        else {
          strike.animate(
            [
              { translate: '0 0', opacity: 1, filter: 'none' },
              { translate: '-8px 0', offset: 0.12 },
              { translate: '7px 0', offset: 0.24 },
              { translate: '-5px 0', offset: 0.36 },
              { translate: '4px 0', opacity: 1, filter: 'grayscale(1) brightness(0.6)', offset: 0.5 },
              { translate: '0 26px', opacity: 0, filter: 'grayscale(1) brightness(0.4) blur(3px)' },
            ],
            { duration: 900, easing: 'ease-in', fill: 'forwards' },
          ).onfinish = () => strike.remove();
          setTimeout(() => strike.remove(), 1000);
        }
      }
      if (spare) {
        spare.classList.add('choice--main', 'choice--forced');
        const span = spare.firstElementChild;
        if (span && !span.classList.contains('sticker')) {
          span.classList.add('sticker');
          sticker(span, span.textContent);
        }
      }
    };
    menu(null, [
      { id: 'strike', label: P.strike ?? tr('给出最后一击'), main: true, fn: force },
      {
        id: 'bypass',
        label: P.bypass ?? tr('饶过魔物'),
        // 命令还没下就自己选了饶过：照样算（洗脑进度一样到 100%）
        fn: () => {
          if (!forced) emit('forced', { order: null, willing: true });
          go();
        },
      },
    ]);
    screenTimer = setTimeout(force, Math.max(0.4, Number(F.delay) || 2.2) * 1000);
  }

  /** 开场剧情之后：story 里写了「开场选择」就先问一次，没写照常进第一组 */
  const afterOpening = () => (STORY['开场选择'] ? toOpenChoice() : toPrep());

  /**
   * 开场选择（002 起，站主定）：开场最后一句之后问——fight 照常打四组；spare 演「开场-放过」，然后直接进无尽战斗（不打四组）。
   * 和最后一击共用 choice 画面
   */
  function toOpenChoice() {
    const P = STORY['开场选择'] ?? {};
    setScreen('choice');
    setBg(P.bg ?? 'choice');
    if (P.her) setStand(P.her);
    speak(P.who ?? 'narrator', P.text ?? '', '开场选择');
    menu(null, [
      { id: 'fight', label: P.fight ?? tr('拔剑讨伐'), main: true, fn: () => toPrep({ endless: false }) },
      { id: 'spare', label: P.spare ?? tr('放过她'), fn: () => ((S.route = '开场-放过'), runStory('开场-放过', () => toPrep({ endless: true }))) },
    ]);
  }

  function toChoice() {
    const P = STORY['最后一击'] ?? {};
    setScreen('choice');
    setBg(P.bg ?? 'choice');
    if (P.her) setStand(P.her);
    speak(P.who ?? 'narrator', P.text ?? '', '最后一击');
    menu(null, [
      { id: 'strike', label: P.strike ?? tr('给出最后一击'), main: true, fn: toVictory },
      { id: 'bypass', label: P.bypass ?? tr('饶过魔物'), fn: () => ((S.route = ''), runStory('绕过', () => toPrep({ endless: true }))) },
    ]);
  }

  function toVictory() {
    S.set = Q.quest.sets;
    setScreen('victory');
    keepAwake(false);
    setArt('win');
    const box = bigTitle(S.invincible ? tr('无敌模式 · 不算完成') : null, [tr('讨伐成功')]);
    box.prepend(burstNode());
    animate(box.firstElementChild, [{ scale: '0.2', rotate: '-40deg' }, { scale: '1', rotate: '0deg' }], {
      duration: 420,
      easing: 'cubic-bezier(.2,.9,.3,1.2)',
    });
    setStamps();
    say('讨伐成功');
    // 讨伐成功回任务墙（站主，2026-09-17）：墙上这一格的「讨伐 ✓」就亮了
    action(tr('返回任务墙'), toWall);
    action(tr('委托单'), toBrief, { sub: true });
  }

  /** 讨伐成功背后的爆炸贴纸：外圈橙红星形 + 内圈 cream 星形，ink 描边 */
  function burstNode() {
    const star = (n, R, r, cx = 180) =>
      Array.from({ length: n * 2 }, (_, i) => {
        const rad = (Math.PI * i) / n - Math.PI / 2;
        const len = i % 2 ? r : R;
        return `${(cx + Math.cos(rad) * len).toFixed(1)},${(cx + Math.sin(rad) * len).toFixed(1)}`;
      }).join(' ');
    const b = el('div', 'burst');
    b.append(
      fromMarkup(
        svg(
          '0 0 360 360',
          `<polygon points="${star(16, 172, 128)}" fill="${C.ver}" stroke="${C.ink}" stroke-width="6" stroke-linejoin="round"/>
           <polygon points="${star(16, 118, 96)}" fill="${C.cream}" stroke="${C.ink}" stroke-width="4" stroke-linejoin="round"/>`,
        ),
      ),
    );
    return b;
  }

  // ================= 无尽战斗 =================

  const E = () => Q.endless;

  function toEndless() {
    camKey = -1;
    setScreen('endless');
    keepAwake(true);
    S.elapsed = 0;
    S.phase = 'early';
    app.dataset.phase = 'early';
    S.nextBeatAt = 0;
    S.nextLineAt = stageCell('endless').lineEvery ?? 6;
    $('quit').dataset.state = 'bar';
    setFill(0);
    $('clock').hidden = false;
    sticker($('clock'), '0');
    setArt('endless');
    rhStart();
    S.sway = 1;
    S.swayTarget = 1;
    S.swayAt = 2;
    say(stageCell('endless').line);
  }

  function endlessTick(dt, now) {
    if (pressTick(now)) return;
    // 21 点（008，blackjack.endless）：无尽里照样一手一手打——发牌、想牌的时候秒数不走（节奏慢慢跑），输了的罚时里倒数，
    // 数到 0 发下一手（blackjack.js）；分段跟着罚时走（输了中段、爆牌后段），不按时间。秒数一直累加，就是这次无尽撑了多久
    const bj = !!Q.blackjack?.endless && !!S.bjPhase;
    if (bj && S.freeze) {
      beatTick();
      return rhStep(dt, (RP().speed?.[S.phase] ?? 1) * S.tempo);
    }
    S.elapsed += dt;
    clockTick();
    if (bj) {
      if (S.bjTarget > 0 && S.elapsed >= S.bjTarget && window.tobatsu._?.bjZero?.()) clockText('0');
    } else {
      const phase = S.elapsed < E().midAt ? 'early' : S.elapsed < E().lateAt ? 'mid' : 'late';
      if (phase !== S.phase) {
        S.phase = phase;
        app.dataset.phase = phase;
        $('quit').dataset.state = phase === 'late' ? 'pulse' : 'bar';
        emit('phase', { phase });
        shake();
      }
    }
    cameraTick();
    beatTick();
    if (S.elapsed >= S.nextLineAt && !S.press) {
      const cell = stageCell('endless');
      say(cell.line);
      S.nextLineAt = S.elapsed + (cell.lineEvery ?? 6);
    }
    const ramp = Math.min(E().maxSpeed, 1 + Math.floor(S.elapsed / E().speedUpEvery) * E().speedUpBy);
    // 21 点：按这一段的速度（输了中速、爆牌快），撑得越久整体越快；不随机快慢
    const rate = bj ? (RP().speed?.[S.phase] ?? 1) * ramp * S.tempo : ramp * swayTick(dt) * S.tempo;
    RH.rate = rate;
    rhStep(dt, rate);
  }

  /** 无尽战斗的随机快慢：隔几秒换一个速度倍数，快慢尽量交替，平滑过渡过去（common.jsonc endless.sway） */
  function swayTick(dt) {
    const sw = E().sway;
    if (!sw || sw.enabled === false) return 1;
    if (S.elapsed >= S.swayAt) {
      const [lo, hi] = sw.range ?? [0.6, 1.8];
      const [a, b] = sw.every ?? [3, 8];
      const fast = S.swayTarget <= 1 ? Math.random() < 0.75 : Math.random() < 0.25;
      S.swayTarget = fast ? 1 + Math.random() * (hi - 1) : lo + Math.random() * (1 - lo);
      S.swayAt = S.elapsed + a + Math.random() * (b - a);
      emit('sway', { speed: Number(S.swayTarget.toFixed(2)) });
    }
    S.sway += (S.swayTarget - S.sway) * Math.min(1, dt * (sw.ease ?? 1.6));
    return S.sway;
  }

  /** 无尽结算。fall＝挑战失手（{ kind }），不写就是长按放弃 */
  function toOver(fall = null) {
    const secs = S.quitAt;
    let best = 0;
    try {
      best = Number(localStorage.getItem(qkey(BEST_KEY))) || 0;
      if (secs > best) localStorage.setItem(qkey(BEST_KEY), String(secs));
    } catch {}
    const record = secs > best;
    setScreen('over');
    keepAwake(false);
    setArt('lose');
    // 21 点（008）：再写这次无尽一共赢了几手
    const bjWins = Q.blackjack?.endless ? window.tobatsu._?.bjSummary?.().wins : null;
    bigTitle(fall ? tr('无尽战斗 · {what}', { what: fallWhat(fall) }) : tr('无尽战斗'), [tr(fall ? '败北于' : '放弃于'), 'br', { num: secs }, tr('秒'), ...(bjWins != null ? ['br', tr('一共赢了 {n} 手', { n: bjWins })] : [])]);
    const b = $('best');
    b.replaceChildren(stampNode(tr(record ? '新纪录' : '纪录'), tr('最长 ·'), Math.max(secs, best), tr('秒')));
    b.hidden = false;
    slam(b.firstElementChild, 260);
    say(fall && L['无尽-败北'] ? '无尽-败北' : '无尽-放弃');
    action(tr('重新开始'), toBrief);
  }

  // ================= 败北结算（挑战失手）=================

  const FALL_WHAT = { 点击: '没点到', 按住: '没按住', 拖动: '没拖完', 顺序: '没点完', 连打: '没打完', 等级: '等级归零' };
  /** 顺序题的当场失手（不是超时）：点错数字。点到诱饵不算输（是全屏混乱，challenge.js / fx.js） */
  const FALL_WHY = { 顺序: '点错顺序' };
  const fallWhat = ({ kind, why } = {}) => tr(FALL_WHY[why] ?? FALL_WHAT[kind] ?? '失手');

  /**
   * 战斗中出的挑战没在限时内完成（challenge.js 叫）：和放弃、撤退并列的第三种结算。
   * 大标题「败北」，小标签写第几组第几秒、哪一题没完成；台词池「败北-<题型>」有就用，没有用「败北」。无尽战斗里进无尽结算
   */
  function toFall({ kind, why } = {}) {
    S.quitAt = Math.floor(S.elapsed);
    S.quitPhase = S.phase;
    endPress(true);
    cutinReset();
    if (S.screen === 'endless') return toOver({ kind, why });
    S.failSet = S.set;
    endRun('fail');
    // 等级归零（007，card.js）：委托写了 execute.drained 就不停在败北结算，直接进「清空」的那一场（见 toExecute）
    if (kind === '等级' && X().drained) {
      S.failTag = tr('第 {set} 组 · 第 {sec} 秒 · {what}', { set: S.set, sec: S.quitAt, what: fallWhat({ kind, why }) });
      return toExecute({ drained: true });
    }
    setScreen('fall');
    keepAwake(false);
    setArt('lose');
    S.failTag = tr('第 {set} 组 · 第 {sec} 秒 · {what}', { set: S.set, sec: S.quitAt, what: fallWhat({ kind, why }) });
    bigTitle(S.failTag, [tr('败北')]);
    say(L[`败北-${kind}`] ? `败北-${kind}` : '败北');
    retryActions();
  }

  // ================= 放弃结算 =================

  /** 战斗中长按放弃：放弃于第几秒、这一组还差几秒 */
  function toLose() {
    S.failSet = S.set;
    endRun('fail');
    setScreen('lose');
    keepAwake(false);
    setArt('lose');
    if (continuous()) {
      // 连贯的组：不讲第几组、还差几秒（玩家只知道 1 组），讲秒数停在几、一共坚持了多久
      const total = Math.floor(S.total ?? S.quitAt);
      const shown = $('clock').dataset.text;
      bigTitle(tr('倒数停在「{n}」', { n: shown }), [tr('放弃于'), 'br', { num: total }, tr('秒')]);
      S.failTag = tr('倒数停在「{n}」· 放弃于 {secs} 秒', { n: shown, secs: total });
    } else {
      bigTitle(tr('第 {set} 组 · 还差 {left} 秒', { set: S.set, left: Math.max(0, target() - S.quitAt) }), [tr('放弃于'), 'br', { num: S.quitAt }, tr('秒')]);
      S.failTag = tr('第 {set} 组 · 放弃于 {sec} 秒', { set: S.set, sec: S.quitAt });
    }
    // 被「长按获胜」骗着按下去的（规则 quitWin，006）：她笑你
    say(S.rules?.quitWin && L['放弃-上当'] ? '放弃-上当' : `放弃-${PHASE_CN[S.quitPhase]}`);
    retryActions();
  }

  /** 暂停画面选认输（原来叫「撤退」，站主 2026-09-24 改）：这一组是撑完了的，所以不讲秒数，讲通过了几组，并把通过的组盖成印章 */
  function toRetreat() {
    S.failSet = Math.min(Q.quest.sets, S.set + 1);
    endRun('fail');
    setScreen('retreat');
    keepAwake(false);
    setArt('retreat');
    bigTitle(tr('通过 {n} / {total} 组后', { n: S.set, total: shownSets() }), [tr('认输')]);
    S.failTag = tr('通过 {n} / {total} 组后 · 认输', { n: S.set, total: shownSets() });
    setStamps(S.set);
    say('撤退');
    retryActions();
  }

  /** 从第一组重新打（startRun 记一次挑战） */
  function retry() {
    startRun();
    S.set = 1;
    S.route = '';
    toPrep({ endless: false });
  }

  /** 放弃 / 败北 / 撤退的结算：主按钮「败北」进处决倒数（站主定，2026-09-17），次按钮回委托单。重来在处决之后 */
  function retryActions() {
    action(tr('败北'), toExecute);
    // 败北的提示（quest.fallTip，008 起）：点了先听一段对话，再回到这里
    if (Q.quest.fallTip && STORY['败北提示']) action(tr(Q.quest.fallTip.label ?? '提示'), toFallTip, { sub: true });
    action(tr('委托单'), toBrief, { sub: true });
  }

  // ---------- 败北的提示（quest.fallTip：{ label 按钮上的字, flag 答应了记哪个本机开关 }；008 起，站主 2026-10-27） ----------
  // 很多人输了不点「败北」、直接关页面，攒不到让救济 / 无敌模式出来的那一下。败北结算上多一个按钮：
  // 演 story 的「败北提示」（{n}＝这台设备失败了几次、{relief}＝救济要几次、{inv}＝无敌模式要几次）；
  // 写了 flag、还没答应过的，再问「败北提示-问」（text / admit / refuse），答应＝记进本机开关（tobatsu.q<编号>.flags），
  // 接「败北提示-答应」，不答应接「败北提示-拒绝」；答应过的接「败北提示-已答应」。演完回到败北结算
  const FLAGS_KEY = 'flags';
  const questFlag = (name) => !!readJson(qkey(FLAGS_KEY), {})[name];
  function setQuestFlag(name) {
    try {
      localStorage.setItem(qkey(FLAGS_KEY), JSON.stringify({ ...readJson(qkey(FLAGS_KEY), {}), [name]: true }));
    } catch {}
    emit('flag', { name });
  }
  function toFallTip() {
    const t = Q.quest.fallTip ?? {};
    const vars = { n: readRecord().fails, relief: Q.quest.relief?.after ?? '', inv: Q.quest.relief?.invincible ?? '' };
    const fill = (list) => (Array.isArray(list) ? list.map((e) => ({ ...e, text: String(e.text ?? '').replace(/\{(n|relief|inv)\}/g, (_, k) => vars[k]) })) : []);
    // 演完回到进来的那个画面（败北结算 / 放弃结算），大标题原样摆回去
    const from = S.screen;
    const title = $('big-title').innerHTML;
    const back = () => {
      setScreen(from);
      keepAwake(false);
      setArt('lose');
      $('big-title').innerHTML = title;
      $('big-title').hidden = false;
      retryActions();
    };
    const play = (key, done = back) => {
      STORY.__tip = fill(STORY[key]);
      runStory('__tip', done);
    };
    play('败北提示', () => {
      const P = STORY['败北提示-问'];
      if (!t.flag || !P) return back();
      if (questFlag(t.flag)) return play('败北提示-已答应');
      setScreen('choice');
      setBg(P.bg ?? 'pause');
      if (P.her) setStand(P.her);
      speak(P.who ?? 'her', String(P.text ?? ''), '败北提示-问', P.name ?? null);
      menu(null, [
        {
          id: 'admit',
          label: P.admit ?? tr('好'),
          main: true,
          fn: () => {
            setQuestFlag(t.flag);
            play('败北提示-答应');
          },
        },
        { id: 'refuse', label: P.refuse ?? tr('不用了'), fn: () => play('败北提示-拒绝') },
      ]);
    });
  }

  // ================= 败北处决 =================
  //
  // 失败结算里点「败北」：她先说几句前言、「倒数开始」cut-in，再数 execute.seconds 秒（默认 10），数到 0 就是彻底输掉的那一刻。
  // 数的时候没有任何操作（不出题、不能放弃），魅了拉满，节奏轨照跑、越来越快；镜头慢慢推到她的脸。
  // 数到 0：秒数变成紫黑、画面暗下来、紫黑的心和堕落的闪烁 / 幻影（fx.js 接 execute 事件），停 zeroHold 秒再出「彻底败北」（重来 / 委托单）。
  // 台词：各委托 lines 的「处决-前言」（按顺序）「处决-cutin」「处决-倒数」（{n}）「处决-心声」「处决-归零」「处决-结算」

  const X = () => Q.execute ?? {};

  /**
   * 处决的镜头：写了 execute.camera 就用它（写法同 sets 的 camera）；
   * 不写就按这张立绘的取景自动推——中段取景 → 后段取景 → 最后一刻推到眼睛（立绘档案的 fx.eyeBar 中心，没写用 anchors.eyes）
   */
  function executeKeys() {
    const sort = (list) => list.filter((k) => Array.isArray(k?.frame) && k.frame.length === 2).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    if (Array.isArray(X().camera)) return sort(X().camera);
    const secs = X().seconds ?? 10;
    const fr = Q.art?.battleStandee?.frames ?? {};
    const eyes = Q.fx?.eyeBar?.center ?? Q.fx?.anchors?.eyes;
    const keys = [{ at: 0, frame: fr.mid ?? fr.early }, { at: secs * 0.6, frame: fr.late ?? fr.mid }];
    if (Array.isArray(eyes)) keys.push({ at: secs - 0.25, frame: [eyes[1] - 170, eyes[1] + 190], centerX: eyes[0] });
    return sort(keys);
  }

  /**
   * drained（007）：等级在战斗里被吸到 0 的那一场——不数秒（已经没东西可吸了）：她按顺序说完 execute.drained.intro 那一池（默认「清空-前言」），
   * 直接到「归零」那一刻（放 execute.drained.zero，喊「清空-归零」），结算说「清空-结算」；card.js 接 execute 事件的 drained，把卡端到画面中间演
   */
  function toExecute({ drained = false } = {}) {
    endPress(true);
    cutinReset();
    S.shot = null;
    S.pend = null;
    S.pendLatch = false;
    S.elapsed = 0;
    S.phase = 'late';
    app.dataset.phase = 'late';
    S.nextBeatAt = 0;
    camKey = -1;
    setScreen('execute');
    keepAwake(true);
    setArt('late', { quiet: true });
    $('quit').dataset.state = 'gone';
    $('clock').classList.add('clock--exec');
    $('say-text').textContent = '';
    rhStart();
    // 不马上数：先按顺序说完「处决-前言」，再「倒数开始」cut-in（处决-cutin），之后才出秒数开始数（站主，2026-09-17）
    S.exec = { stage: 'intro', t: 0, next: X().intro?.first ?? (drained ? 1 : 0.5), line: 0, beatAt: 0, drained };
    emit('execute', { state: 'intro', seconds: X().seconds ?? 10, drained });
  }

  /** 前言：lines 的「处决-前言」按顺序一句一句（不抽），每句停 max(every, 字数 × perChar + 0.8) 秒 */
  const introPool = () => (S.exec?.drained ? (X().drained?.intro ?? '清空-前言') : '处决-前言');
  const introLines = () => (Array.isArray(L[introPool()]) ? L[introPool()] : []).filter((x) => typeof x === 'string' && x);

  function executeTick(dt) {
    const E = S.exec ?? { stage: 'count' };
    const secs = X().seconds ?? 10;
    const [s0, s1] = X().speed ?? [1, 1.6];
    cameraTick();
    if (E.stage !== 'count') {
      E.t += dt;
      // 前言里心跳慢一点，节奏轨按后段速度照跑
      if (E.t >= E.beatAt) {
        beat();
        E.beatAt = E.t + (T().beatEvery?.late ?? 0.55) * 1.6;
      }
      rhStep(dt, (RP().speed?.late ?? 1) * s0 * S.tempo);
      if (E.stage === 'intro' && E.t >= E.next) {
        const lines = introLines();
        if (E.line < lines.length) {
          const text = lines[E.line];
          const intro = X().intro ?? {};
          $('say-text').textContent = withName(text);
          emit('line', { pool: introPool(), text });
          emit('execute', { state: 'line', index: E.line, count: lines.length, drained: !!E.drained });
          E.line++;
          E.next = E.t + Math.max(intro.every ?? 2.2, [...text].length * (intro.perChar ?? 0.085) + 0.8);
        } else if (E.drained) {
          // 清空：不数秒，直接到归零那一刻
          E.stage = 'done';
          toExecuted();
        } else {
          E.stage = 'cutin';
          if (L['处决-cutin']?.length) cutin('处决-cutin', 'late', X().intro?.side ?? 'right');
          emit('execute', { state: 'cutin' });
        }
      } else if (E.stage === 'cutin' && !S.cutinBusy) {
        startCountdown();
      }
      return;
    }
    S.elapsed = Math.min(secs, S.elapsed + dt);
    const left = Math.max(0, Math.ceil(secs - S.elapsed));
    if (left !== Number($('clock').dataset.text)) {
      sticker($('clock'), String(left));
      emit('execute', { state: 'second', left, seconds: secs });
    }
    beatTick();
    // 节奏：从后段的速度起，越数越快（execute.speed [起, 止] 倍）
    const k = S.elapsed / secs;
    rhStep(dt, (RP().speed?.late ?? 1) * (s0 + (s1 - s0) * k * k) * S.tempo);
    if (S.elapsed >= secs) toExecuted();
  }

  /** cut-in 收回去：秒数砸下来，开始数 */
  function startCountdown() {
    const secs = X().seconds ?? 10;
    S.exec.stage = 'count';
    S.elapsed = 0;
    S.nextBeatAt = 0;
    camKey = -1;
    const clock = $('clock');
    clock.hidden = false;
    sticker(clock, String(secs));
    slam(clock);
    shake();
    emit('execute', { state: 'start', seconds: secs });
  }

  /** 数到 0：彻底输掉的那一刻。先放特效（fx.js），停 zeroHold 秒再出结算 */
  function toExecuted() {
    const hold = reduce.matches ? 0.8 : (X().zeroHold ?? 5);
    setScreen('executed');
    keepAwake(false);
    const clock = $('clock');
    clock.hidden = false;
    clock.classList.add('clock--exec', 'clock--exec-zero');
    sticker(clock, '0');
    play('余韵');
    play('失败');
    shake();
    const drained = !!S.exec?.drained;
    emit('execute', { state: 'zero', hold, drained });
    screenTimer = setTimeout(() => {
      // 清空那一场演完：委托写了「清零」剧情就接着演（收藏柜那张图），演完停在「等级清零 END」
      if (drained && Array.isArray(STORY['清零']) && STORY['清零'].length) return runStory('清零', toDrainedEnd);
      bigTitle(S.failTag ?? null, [tr('彻底败北')]);
      say(drained && L['清空-结算'] ? '清空-结算' : '处决-结算');
      // 累计失败到了无敌模式的次数、还没解锁：先让「彻底败北」停一会儿，再告诉他（救济也到了的话下次彻底败北再问）
      if (invDue()) {
        screenTimer = setTimeout(toInvUnlock, 1800);
        return;
      }
      // 累计失败够了、还没解锁救济：先让「彻底败北」停一会儿，再演救济那段对话
      if (reliefDue()) {
        screenTimer = setTimeout(toRelief, 1800);
        return;
      }
      retryButtons();
    }, hold * 1000);
  }

  /**
   * 等级清零 END（007）：清空那一场 →「清零」剧情 → 停在剧情最后那张图上（.adv 还开着、对话框收掉），大字「等级清零」「END」，
   * 下面照常「重来 / 委托单」（攒够失败次数的话照常接救济、无敌模式）
   */
  function toDrainedEnd() {
    setScreen('end');
    keepAwake(false);
    play('余韵');
    // 剧情收尾时画面框收掉了（跳过的话图可能还没换上）：把「清零」最后那张图再摆回来
    const last = [...STORY['清零']].reverse().find((e) => e?.still)?.still;
    if (last) storyStill({ ...last, pan: null, focus: Array.isArray(last.pan) ? last.pan[1] : last.focus });
    bigTitle(S.failTag ?? null, [tr('等级清零'), 'br', 'END']);
    if (invDue()) {
      screenTimer = setTimeout(toInvUnlock, 1800);
      return;
    }
    if (reliefDue()) {
      screenTimer = setTimeout(toRelief, 1800);
      return;
    }
    retryButtons();
  }

  // ================= cut-in / 心跳 =================

  const CUT_IN_MS = 260;
  const CUT_OUT_MS = 220;
  let cutinTimer = 0;

  function cutin(pool, slot, side) {
    const box = $('cutin');
    const line = $('cutin-line');
    clearTimeout(cutinTimer);
    box.getAnimations?.().forEach((a) => a.cancel());
    line.getAnimations?.().forEach((a) => a.cancel());
    box.dataset.side = side;
    $('cutin-media').replaceChildren(artNode(slot, 'cutin'));
    const text = pick(pool);
    sticker(line.firstElementChild, text);
    emit('line', { pool, text });
    emit('cutin', { state: 'in', pool });
    S.cutinBusy = true;

    const off = side === 'right' ? 'translateX(110%)' : 'translateX(-110%)';
    const hold = T().cutinHold * 1000;
    if (reduce.matches) {
      box.style.transform = 'none';
      line.style.opacity = '1';
    } else {
      box.animate([{ transform: off }, { transform: 'translateX(0)' }], { duration: CUT_IN_MS, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
      line.animate(
        [
          { opacity: 0, transform: 'skewX(-14deg)' },
          { opacity: 1, transform: 'skewX(0)' },
        ],
        { duration: 180, delay: 120, easing: 'ease-out', fill: 'forwards' },
      );
    }
    cutinTimer = setTimeout(() => {
      if (reduce.matches) {
        box.style.transform = '';
        line.style.opacity = '';
      } else {
        box.animate([{ transform: 'translateX(0)' }, { transform: off }], { duration: CUT_OUT_MS, easing: 'ease-in', fill: 'forwards' });
        line.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' });
      }
      cutinTimer = setTimeout(() => {
        S.cutinBusy = false;
        emit('cutin', { state: 'out', pool });
      }, CUT_OUT_MS);
    }, CUT_IN_MS + hold);
  }

  function cutinReset() {
    clearTimeout(cutinTimer);
    const box = $('cutin');
    box.getAnimations?.().forEach((a) => a.cancel());
    $('cutin-line').getAnimations?.().forEach((a) => a.cancel());
    box.style.transform = '';
    $('cutin-line').style.opacity = '';
    if (S.cutinBusy) emit('cutin', { state: 'out', pool: null });
    S.cutinBusy = false;
  }

  function beat() {
    const interval = T().beatEvery[S.phase];
    emit('beat', { phase: S.phase, interval });
    const strength = S.phase === 'early' ? 0.45 : S.phase === 'mid' ? 0.7 : 1;
    animate($('fatigue-beat'), [{ opacity: 0 }, { opacity: strength, offset: 0.25 }, { opacity: 0 }], {
      duration: Math.min(420, interval * 700),
      easing: 'ease-out',
    });
    if (S.phase === 'late' && !S.press && !reduce.matches) {
      // 鼓一下：用 CSS 动画（类名重挂）。原来 WAAPI 缩放按钮内层，站主在后段看不到放弃按钮（点得到），怀疑是 iOS 上合成层不重绘
      const inner = $('quit-bar-inner');
      inner.style.setProperty('--beat-ms', `${Math.round(Math.min(340, interval * 600))}ms`);
      inner.classList.remove('is-beat');
      void inner.offsetWidth;
      inner.classList.add('is-beat');
    }
  }

  /** 离开战斗时收拾：长按、cut-in、定时器 */
  function leaveBattle() {
    endPress(true);
    cutinReset();
    clearTimeout(screenTimer);
  }

  // ================= 节奏指示器 =================

  const RH = { u: 0, seg: 3, rep: 0, pos: 0, active: false, top: 0, bottom: 0, lastY: null, lastT: 0, v: 0, hist: [] };
  // 双轨（005「同时用两只手~」，定时演出「双轨」）：左边复制一条导轨。sync＝和右边同步；offset＝左右错开（左边在另一头：
  // 档位上下对称时正好是 1 − 右边的位置）。这一组结束（rhReset）就收掉
  const RM = { mode: null, el: null, knob: null, body: null, capTop: null, capBottom: null, burst: null, range: null, ghosts: [], lastY: null, lastT: 0, v: 0, hist: [] };
  const rh = {
    root: $('rhythm'),
    range: $('rh-range'),
    capTop: $('rh-cap-top'),
    capBottom: $('rh-cap-bottom'),
    knob: $('rh-knob'),
    body: $('rh-knob-body'),
    burst: $('rh-burst'),
    fx: $('rh-fx'),
    reps: $('rh-reps'),
    ghosts: [...document.querySelectorAll('.rh-ghost')],
  };

  // 六角滑块：ink 投影 + 橙红本体 + cream 虚线内圈 + 方向箭头 / 停住时的圆点
  const HEX = (r, cx = 28, cy = 28) =>
    Array.from({ length: 6 }, (_, i) => {
      const a = (Math.PI / 3) * i;
      return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
    }).join(' ');
  rh.body.innerHTML = svg(
    '0 0 56 56',
    `<polygon points="${HEX(25, 31, 32)}" fill="${C.ink}"/>
     <polygon points="${HEX(25)}" fill="${C.ver}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/>
     <polygon points="${HEX(17)}" fill="none" stroke="${C.cream}" stroke-width="1.6" stroke-dasharray="3 3"/>
     <path class="rh-arrow" d="M28 16 L38 30 L32 30 L32 40 L24 40 L24 30 L18 30 Z" fill="${C.cream}" stroke="${C.ink}" stroke-width="2.2" stroke-linejoin="round"/>
     <circle class="rh-dot" cx="28" cy="28" r="6" fill="${C.cream}" stroke="${C.ink}" stroke-width="2.2"/>`,
  );
  for (const g of rh.ghosts) {
    g.innerHTML = svg('0 0 56 56', `<polygon points="${HEX(24)}" fill="${C.cream}" fill-opacity=".35" stroke="${C.ink}" stroke-width="2.5"/>`);
  }

  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

  function rhMeasure() {
    const H = rh.root.clientHeight;
    if (!H || !Q) return;
    // 往返区间：rangeTop / rangeBottom 是轨道上的位置（0＝最上、1＝最下）；老档位只有 amplitude 的，按以中点对称换算
    const r = RP();
    let t0;
    let t1;
    if (Number.isFinite(Number(r.rangeTop)) && Number.isFinite(Number(r.rangeBottom))) {
      t0 = clamp(Number(r.rangeTop), 0, 1);
      t1 = clamp(Number(r.rangeBottom), 0, 1);
      if (t1 - t0 < 0.05) t1 = Math.min(1, t0 + 0.05);
    } else {
      const a = clamp(Number(r.amplitude) || 0.8, 0.1, 1);
      t0 = 0.5 - a / 2;
      t1 = 0.5 + a / 2;
    }
    RH.top = H * t0;
    RH.bottom = H * t1;
    rh.reps.style.top = `${Math.max(H + 44, RH.bottom + 84)}px`;
    rh.range.style.top = `${RH.top}px`;
    rh.range.style.height = `${RH.bottom - RH.top}px`;
    // 这几样用 top 定位，不用 transform：打击动画要动它们的 scale / translate / rotate，
    // 独立变换属性先于 transform 生效，放在 transform 里的位移会被一起放大
    rh.capTop.style.top = `${RH.top - 44}px`;
    rh.capBottom.style.top = `${RH.bottom + 44}px`;
    RH.lastY = null;
    rhMirrorMeasure();
    rhRender(performance.now());
  }

  /** 双轨：左边那条（定时演出「双轨」，mode sync / offset；null 收掉） */
  function rhMirror(mode) {
    if (!mode) {
      RM.mode = null;
      RM.el?.remove();
      RM.el = null;
      return;
    }
    const fresh = !RM.el;
    if (fresh) {
      const m = rh.root.cloneNode(true);
      m.removeAttribute('id');
      for (const n of m.querySelectorAll('[id]')) n.removeAttribute('id');
      m.classList.add('rhythm--mirror');
      m.querySelector('.rh-reps')?.remove();
      m.querySelector('.rh-fx')?.replaceChildren();
      rh.root.after(m);
      const caps = m.querySelectorAll('.rh-cap');
      Object.assign(RM, { el: m, knob: m.querySelector('.rh-knob'), body: m.querySelector('.rh-knob-body'), capTop: caps[0], capBottom: caps[1], burst: m.querySelector('.rh-burst'), range: m.querySelector('.rh-range'), ghosts: [...m.querySelectorAll('.rh-ghost')], hist: [], lastY: null, v: 0 });
    }
    RM.mode = mode;
    rhMirrorMeasure();
    rhRender(performance.now());
    if (fresh && !reduce.matches) animate(RM.el, [{ translate: '-150% 0', opacity: 0 }, { translate: '0 0', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function rhMirrorMeasure() {
    if (!RM.el) return;
    for (const [a, b] of [[rh.range, RM.range], [rh.capTop, RM.capTop], [rh.capBottom, RM.capBottom]]) {
      b.style.top = a.style.top;
      b.style.height = a.style.height;
    }
    RM.lastY = null;
  }
  addEventListener('resize', rhMeasure);

  /** 节拍锁：交还之后停在 seg（1 顶 / 3 底）等时钟 */
  function rhLockWait(seg, d) {
    RH.lockWait = seg;
    RH.lockPrev = rhLockU(d);
  }

  /**
   * 变速（006 的暗示「看到怀表，手就自己变快」，定时演出「变速」）：seconds 秒里比平时多走几个来回——
   * 多走的圈数取整（至少 1 圈），走完和原来的相位一点不差，节拍锁照样对得上。寸止、呼吸接管的时候先停着
   */
  /**
   * 节奏现在是这个档位「前段」速度的几倍（006 垂着的怀表按它加幻影：怀表自己不变快）：这一段的速度 × 这组的 tempo × 变速；
   * 无尽战斗是越打越快再乘随机快慢（endlessTick 记在 RH.rate），败北处决按后段算
   */
  function rhRate() {
    const sp = RP().speed ?? {};
    const base = sp.early || 1;
    if (S.screen === 'hold') return (((sp[S.phase] ?? 1) / base) * tempoOf() * S.tempo) * (RH.boost?.mult ?? 1);
    if (S.screen === 'endless') return RH.rate ?? 1;
    if (S.screen === 'execute') return (sp.late ?? 1) / base;
    return 1;
  }
  function rhBoost({ mult = 2, seconds = 4 } = {}) {
    if (!RH.active) return null;
    const d = rhDurations();
    const total = d[0] + d[1] + d[2] + d[3];
    const k = (RP().speed?.[S.phase] ?? 1) * tempoOf() * S.tempo;
    const secs = Math.max(0.5, Number(seconds) || 4);
    const turns = Math.max(1, Math.round(((Math.max(1.1, Number(mult) || 2) - 1) * k * secs) / total));
    RH.boost = { t: 0, seconds: secs, extra: turns * total, done: 0, mult: 1 + (turns * total) / (k * secs) };
    emit('boost', { state: 'start', seconds: secs, turns });
    return RH.boost;
  }

  /** 回到底端、计数清零（准备倒数时停在这里） */
  function rhReset() {
    rhMirror(null);
    RH.boost = null;
    RH.boostAcc = 0;
    RH.lockWait = null;
    rhRelease();
    RH.active = false;
    RH.u = 0;
    RH.seg = 3;
    RH.pos = 0;
    RH.rep = 0;
    RH.hist = [];
    rh.knob.dataset.dir = 'hold';
    sticker(rh.reps, '×0');
  }

  /** 开始：从底端往上提 */
  function rhStart() {
    rhReset();
    RH.active = true;
    RH.seg = 0;
    rh.knob.dataset.dir = 'up';
    if (RP().lock) {
      const d = rhDurations();
      Object.assign(RH, { seg: 3, u: d[0] + d[1] + d[2] + d[3] / 2 });
      rh.knob.dataset.dir = 'hold';
    }
  }

  /** 档位的四段秒数（上行 / 顶端停 / 下行 / 底端停），每段至少 0.05 */
  const rhDurations = () => {
    const r = RP();
    return [r.up, r.top, r.down, r.bottom].map((x) => Math.max(0.05, Number(x) || 0));
  };

  /*
   * 节拍锁（档位写 lock: true，005 用）：战斗里滑块的相位不再逐帧累加，而是每帧从这一组的秒数直接算——
   * 各段的速度 × 在这一段待了多久，加起来。档位定成「一个来回正好 2 / 1 / 0.5 秒」、分段点落在整秒上时，
   * 每跳一个秒数滑块都正好在一头（前段提、压交替；中段、后段每次落在同一头），切段、掉帧都不会歪。
   * 起点挪到底端停顿的正中：停顿骑在整秒上，「提 / 压」的声音和数字翻页只差半个停顿。
   * 寸止、呼吸接管完交还时相位已经歪了：滑块停在那一头等，等时钟转到「这时候本该到这一头」再跟上（最多等一个来回）
   */
  const rhLockOn = () => !!RP().lock && S.screen === 'hold' && !S.freeze;
  function rhLockU(d) {
    const total = d[0] + d[1] + d[2] + d[3];
    const T = target();
    const b = bounds();
    const e1 = T * b.early;
    const e2 = T * b.mid;
    const t = S.elapsed;
    const sp = RP().speed ?? {};
    const k = (ph) => (sp[ph] ?? 1) * tempoOf(ph) * S.tempo;
    const acc = k('early') * Math.min(t, e1) + k('mid') * clamp(t - e1, 0, e2 - e1) + k('late') * Math.max(0, t - e2);
    return (((d[0] + d[1] + d[2] + d[3] / 2 + acc) % total) + total) % total;
  }
  /** 从 a 走到 b（绕圈）有没有经过 x */
  const rhCrossed = (a, b, x) => (a <= b ? a < x && x <= b : x > a || x <= b);

  // ---------- 接管节奏轨：寸止、呼吸（fx.js 的定时演出「寸止」「呼吸」调）----------
  // 寸止：下一次到顶就停在「提」上 seconds 秒（秒数照走），停完接着往下。
  // 呼吸：下一次到底开始，滑块跟着呼吸走——吸 inhale 秒往上、呼 exhale 秒往下，count 次，完了从底端接回平时的节奏。
  // 都返回 { started, done } 两个 Promise：started＝真的停住 / 开始跟呼吸那一刻，done＝交还节奏轨；换画面、重置时直接结束
  function rhDefer() {
    const out = {};
    out.started = new Promise((ok) => (out.start = ok));
    out.done = new Promise((ok) => (out.end = ok));
    return out;
  }
  function rhRelease() {
    for (const k of ['edge', 'breath']) {
      const c = RH[k];
      RH[k] = null;
      if (c) {
        c.start(false);
        c.end();
      }
    }
  }
  function rhEdge(seconds = 3) {
    rhRelease();
    RH.edge = { ...rhDefer(), seconds: Math.max(0.5, Number(seconds) || 3), left: null };
    return RH.edge;
  }
  function rhBreath({ inhale = 3, exhale = 3, count = 2 } = {}) {
    rhRelease();
    RH.breath = { ...rhDefer(), inhale: Math.max(0.6, Number(inhale) || 3), exhale: Math.max(0.6, Number(exhale) || 3), count: Math.max(1, Math.round(Number(count) || 2)), t: null };
    return RH.breath;
  }
  /** 呼吸跟着走的这一帧：true＝这一帧归呼吸管 */
  function rhBreathStep(dt, d) {
    const b = RH.breath;
    if (b?.t == null) return false;
    b.t += dt;
    const cyc = b.inhale + b.exhale;
    if (b.t >= cyc * b.count) {
      // 从底端的停顿接回去：下一拍照平时的节奏往上
      RH.breath = null;
      RH.u = d[0] + d[1] + d[2];
      RH.pos = 0;
      if (RH.seg !== 3) rhHit('bottom');
      RH.seg = 3;
      rh.knob.dataset.dir = 'hold';
      b.end();
      if (rhLockOn()) rhLockWait(3, d);
      return true;
    }
    const k = b.t % cyc;
    const up = k < b.inhale;
    b.phase = up ? 'in' : 'out';
    b.k = up ? k / b.inhale : (k - b.inhale) / b.exhale;
    RH.pos = up ? easeInOut(b.k) : 1 - easeInOut(b.k);
    const seg = up ? 0 : 2;
    if (seg !== RH.seg) {
      if (seg === 2) rhHit('top');
      else if (RH.seg === 2) rhHit('bottom');
      rh.knob.dataset.dir = up ? 'up' : 'down';
      RH.seg = seg;
    }
    return true;
  }

  function rhStep(dt, speed) {
    if (!RH.active) return;
    const d = rhDurations();
    if (rhBreathStep(dt, d)) return;
    // 寸止停着：秒数照走，滑块不动
    if (RH.edge?.left != null) {
      RH.edge.left -= dt;
      if (RH.edge.left > 0) return;
      const e = RH.edge;
      RH.edge = null;
      e.end();
      if (rhLockOn()) rhLockWait(1, d);
    }
    const total = d[0] + d[1] + d[2] + d[3];
    // 变速：这一帧多走的
    let bonus = 0;
    if (RH.boost) {
      const b = RH.boost;
      b.t += dt;
      const upTo = b.extra * Math.min(1, b.t / b.seconds);
      bonus = upTo - b.done;
      b.done = upTo;
      RH.boostAcc = ((RH.boostAcc ?? 0) + bonus) % total;
      if (b.t >= b.seconds) {
        RH.boost = null;
        RH.boostAcc = 0;
        emit('boost', { state: 'end' });
      }
    }
    if (rhLockOn()) {
      const want = (rhLockU(d) + (RH.boostAcc ?? 0)) % total;
      if (RH.lockWait != null) {
        // 停在这一头等时钟：本该到这一头的那一刻（这一段的起点）走过去了才接着动
        const at = RH.lockWait === 1 ? d[0] : d[0] + d[1] + d[2];
        const prev = RH.lockPrev;
        RH.lockPrev = want;
        if (!rhCrossed(prev, want, at)) return;
        RH.lockWait = null;
      }
      RH.u = want;
    } else {
      RH.lockWait = null;
      RH.u = (RH.u + dt * speed + bonus) % total;
    }
    let t = RH.u;
    let seg = 0;
    while (seg < 3 && t >= d[seg]) t -= d[seg++];
    const k = t / d[seg];
    RH.pos = seg === 0 ? easeInOut(k) : seg === 1 ? 1 : seg === 2 ? 1 - easeInOut(k) : 0;
    if (seg !== RH.seg) {
      // 从上一帧的段往前走到这一帧的段：快档位（004 后段）的「顶端停 / 底端停」只有 0.05 秒，一帧就可能直接跨过去——跨过也算到顶 / 到底
      for (let g = (RH.seg + 1) % 4, n = 0; n < 4; g = (g + 1) % 4, n++) {
        if (g === 1) {
          rhHit('top');
          // 等着寸止的就停在顶端（画面上还有题就等下一次到顶）
          if (RH.edge && RH.edge.left == null && !window.tobatsu._?.challenge?.active?.()) {
            Object.assign(RH, { u: d[0], pos: 1, seg: 1 });
            rh.knob.dataset.dir = 'hold';
            RH.edge.left = RH.edge.seconds;
            RH.edge.start(true);
            return;
          }
        }
        if (g === 3) {
          rhHit('bottom');
          // 等着呼吸的从底端开始跟
          if (RH.breath && RH.breath.t == null) {
            Object.assign(RH, { u: d[0] + d[1] + d[2], pos: 0, seg: 3 });
            rh.knob.dataset.dir = 'hold';
            RH.breath.t = 0;
            RH.breath.start(true);
            return;
          }
        }
        if (g === seg) break;
      }
      rh.knob.dataset.dir = seg === 0 ? 'up' : seg === 2 ? 'down' : 'hold';
      RH.seg = seg;
    }
  }

  function rhRender(now) {
    drawKnob(RH, rh, RH.bottom - RH.pos * (RH.bottom - RH.top), now);
    if (RM.mode && RM.el) {
      const p = RM.mode === 'offset' ? 1 - RH.pos : RH.pos;
      drawKnob(RM, RM, RH.bottom - p * (RH.bottom - RH.top), now);
      const dir = rh.knob.dataset.dir;
      RM.knob.dataset.dir = RM.mode === 'offset' ? ({ up: 'down', down: 'up' }[dir] ?? dir) : dir;
    }
  }

  /** 画一条导轨的滑块和残影（st：lastY / lastT / v / hist；els：knob / ghosts） */
  function drawKnob(st, els, y, now) {
    const dtR = Math.max(1, now - st.lastT) / 1000;
    const v = st.lastY === null ? 0 : (y - st.lastY) / dtR;
    st.v += (v - st.v) * 0.35;
    st.lastY = y;
    st.lastT = now;

    // 越快拉得越长、越窄，顺着运动方向歪一点
    const stretch = clamp(Math.abs(st.v) / 1100, 0, 0.3);
    const sy = 1 + stretch;
    const sx = 1 - stretch * 0.55;
    const rot = Math.sign(st.v) * stretch * 28;
    els.knob.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg) scale(${sx.toFixed(3)}, ${sy.toFixed(3)})`;

    // 残影：取 45ms 一格之前的位置
    st.hist.push({ y, t: now });
    while (st.hist.length && now - st.hist[0].t > 260) st.hist.shift();
    const moving = clamp(stretch / 0.12, 0, 1);
    els.ghosts.forEach((g, i) => {
      const want = now - (i + 1) * 45;
      let s = st.hist[0];
      for (const h of st.hist) if (h.t <= want) s = h;
      const o = reduce.matches ? 0 : (0.55 - i * 0.12) * moving;
      g.style.opacity = o.toFixed(2);
      g.style.transform = `translate3d(0, ${(s?.y ?? y).toFixed(1)}px, 0) scale(${(1 - (i + 1) * 0.1).toFixed(2)})`;
    });
  }

  /** 双轨：右边撞到一头时，左边那条跟着撞（同步＝同一头，错开＝另一头）——只做章和滑块的动静 */
  function mirrorHit(edge) {
    if (!RM.mode || !RM.el || reduce.matches) return;
    const e = RM.mode === 'offset' ? (edge === 'top' ? 'bottom' : 'top') : edge;
    const cap = e === 'top' ? RM.capTop : RM.capBottom;
    cap.classList.add('is-hit');
    setTimeout(() => cap.classList.remove('is-hit'), 220);
    if (e === 'top') {
      animate(cap, [{ translate: '0 0', scale: '1' }, { translate: '0 -30px', scale: '1.3', offset: 0.35 }, { translate: '0 0', scale: '1' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.3,1)' });
      RM.burst.style.top = `${RH.top}px`;
      animate(RM.burst, [{ scale: '0.3', opacity: 1 }, { scale: '1.8', opacity: 0 }], { duration: 360, easing: 'cubic-bezier(.2,.8,.3,1)' });
    } else {
      animate(cap, [{ scale: '1', rotate: '0deg' }, { scale: '1.45', rotate: '-10deg', offset: 0.2 }, { scale: '1.35', rotate: '8deg', offset: 0.45 }, { scale: '1', rotate: '0deg' }], { duration: 380, easing: 'linear' });
    }
    animate(RM.body, [{ transform: 'scale(1)' }, { transform: e === 'top' ? 'scale(1.3, 0.75)' : 'scale(1.15, 0.85)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 300, easing: 'ease-out' });
  }

  function knobPop(sx, sy) {
    animate(rh.body, [{ transform: `scale(${sx}, ${sy})` }, { transform: `scale(${2 - sx * 0.95}, ${2 - sy * 0.9})`, offset: 0.45 }, { transform: 'scale(1)' }], {
      duration: 320,
      easing: 'ease-out',
    });
  }

  /**
   * 撞到两端：
   * 提（到顶）：「提」章往上蹦出去再落回，滑块压扁，冲击环 + 爱心往上飞出去（诱惑）
   * 压（到底）：「压」章放大着打颤，滑块轻压一下
   */
  function rhHit(edge) {
    const top = edge === 'top';
    const y = top ? RH.top : RH.bottom;
    if (top) {
      RH.rep++;
      sticker(rh.reps, `×${RH.rep}`);
      animate(rh.reps, [{ scale: '1.6' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
    emit('rhythm', { edge, rep: RH.rep });
    mirrorHit(edge);

    const cap = top ? rh.capTop : rh.capBottom;
    cap.classList.add('is-hit');
    setTimeout(() => cap.classList.remove('is-hit'), 220);

    if (top) {
      animate(
        cap,
        [
          { translate: '0 0', scale: '1' },
          { translate: '0 -34px', scale: '1.3', offset: 0.35 },
          { translate: '0 3px', scale: '0.95', offset: 0.75 },
          { translate: '0 0', scale: '1' },
        ],
        { duration: 380, easing: 'cubic-bezier(.2,.8,.3,1)' },
      );
      knobPop(1.4, 0.66);
      rh.burst.style.top = `${y}px`;
      animate(rh.burst, [{ scale: '0.3', opacity: 1 }, { scale: '1.8', opacity: 0 }], { duration: 360, easing: 'cubic-bezier(.2,.8,.3,1)' });
      if (stageCell('top').burst !== false) charmBurst(y);
    } else {
      animate(
        cap,
        [
          { scale: '1', rotate: '0deg', translate: '0 0' },
          { scale: '1.5', rotate: '-12deg', translate: '-2px 0', offset: 0.15 },
          { scale: '1.5', rotate: '10deg', translate: '2px 1px', offset: 0.3 },
          { scale: '1.45', rotate: '-8deg', translate: '-2px -1px', offset: 0.45 },
          { scale: '1.4', rotate: '6deg', translate: '1px 1px', offset: 0.6 },
          { scale: '1.25', rotate: '-3deg', translate: '0 0', offset: 0.78 },
          { scale: '1', rotate: '0deg', translate: '0 0' },
        ],
        { duration: 420, easing: 'linear' },
      );
      knobPop(1.2, 0.84);
    }
  }

  // ---------- 到顶的魅惑特效 ----------
  // 发光爱心 2–4 颗、心形光圈 1 个、四角星光 3–5 颗、小光点 2–4 颗，
  // 往左（她那边）一个扇形里随机飘散，边飘边往上浮；颜色在粉到紫之间随机，每颗各不一样

  const rand = (a, b) => a + Math.random() * (b - a);
  const randInt = (a, b) => Math.floor(rand(a, b + 1));
  const HEART_D = 'M50 88 C22 70 6 52 6 32 C6 17 17 7 30 7 C39 7 46 12 50 20 C54 12 61 7 70 7 C83 7 94 17 94 32 C94 52 78 70 50 88 Z';
  const SPARK_D = 'M50 0 C53 38 62 47 100 50 C62 53 53 62 50 100 C47 62 38 53 0 50 C38 47 47 38 50 0 Z';
  let fxSeq = 0;

  function charmColor() {
    const h = rand(285, 345);
    const sat = rand(82, 100);
    const l = rand(60, 72);
    return { main: `hsl(${h} ${sat}% ${l}%)`, light: `hsl(${h} ${sat}% ${Math.min(93, l + 20)}%)` };
  }

  const glow = (id, color, opacity) =>
    `<radialGradient id="${id}"><stop offset="0" stop-color="${color}" stop-opacity="${opacity}"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></radialGradient>`;

  function fxNode(kind, size) {
    const c = charmColor();
    const id = `fx${++fxSeq}`;
    let body;
    if (kind === 'heart') {
      body = `<defs>${glow(id, c.main, 0.85)}</defs>
        <circle cx="50" cy="48" r="95" fill="url(#${id})"/>
        <path d="${HEART_D}" fill="${c.main}"/>
        <path d="M50 76 C30 62 18 49 18 34 C18 25 24 18 32 18" fill="none" stroke="${c.light}" stroke-width="7" stroke-linecap="round" opacity=".85"/>
        <ellipse cx="33" cy="30" rx="8" ry="5" transform="rotate(-35 33 30)" fill="#fff5e1" opacity=".9"/>`;
    } else if (kind === 'ring') {
      body = `<path d="${HEART_D}" fill="none" stroke="${c.main}" stroke-width="16" opacity=".4"/>
        <path d="${HEART_D}" fill="none" stroke="${c.light}" stroke-width="5"/>`;
    } else if (kind === 'spark') {
      body = `<defs>${glow(id, c.main, 0.8)}</defs>
        <circle cx="50" cy="50" r="50" fill="url(#${id})"/>
        <path d="${SPARK_D}" fill="${c.light}"/>
        <circle cx="50" cy="50" r="9" fill="#fff5e1"/>`;
    } else {
      body = `<defs>${glow(id, c.light, 1)}</defs><circle cx="50" cy="50" r="50" fill="url(#${id})"/>`;
    }
    const wrap = el('i');
    wrap.style.cssText = `width:${size}px;height:${size}px;margin:${-size / 2}px 0 0 ${-size / 2}px`;
    wrap.innerHTML = `<svg viewBox="-30 -30 160 160" width="100%" height="100%" style="overflow:visible">${body}</svg>`;
    return wrap;
  }

  /** 放一颗粒子：从 (0, y) 沿 angle（度，0＝右、90＝上、180＝左）飞 dist，一路往上浮 rise */
  function fxFly(node, y, { angle, dist, rise, spin, scale, dur, delay, twinkle }) {
    rh.fx.append(node);
    const rad = (angle * Math.PI) / 180;
    const at = (k, lift) => `${(Math.cos(rad) * dist * k).toFixed(1)}px ${(y - Math.sin(rad) * dist * k - rise * lift).toFixed(1)}px`;
    const frames = twinkle
      ? [
          { translate: at(0, 0), scale: '0', rotate: '0deg', opacity: 1 },
          { translate: at(0.5, 0.3), scale: String(scale * 1.25), rotate: `${spin * 0.5}deg`, opacity: 1, offset: 0.35 },
          { translate: at(1, 1), scale: '0', rotate: `${spin}deg`, opacity: 0.6 },
        ]
      : [
          { translate: at(0, 0), scale: String(scale * 0.3), rotate: '0deg', opacity: 0 },
          { translate: at(0.45, 0.15), scale: String(scale * 1.15), rotate: `${spin * 0.4}deg`, opacity: 1, offset: 0.25 },
          { translate: at(0.85, 0.55), scale: String(scale), rotate: `${spin * 0.8}deg`, opacity: 0.9, offset: 0.6 },
          { translate: at(1, 1), scale: String(scale * 0.7), rotate: `${spin}deg`, opacity: 0 },
        ];
    const a = node.animate(frames, { duration: dur, delay, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'both' });
    a.onfinish = a.oncancel = () => node.remove();
  }

  function charmBurst(y) {
    if (reduce.matches || !rh.fx.animate) return;
    // 先在滑块上炸开一团粉紫柔光
    const flash = fxNode('dot', 150);
    rh.fx.append(flash);
    const f = flash.animate(
      [
        { translate: `0 ${y}px`, scale: '0.3', opacity: 0.9 },
        { translate: `0 ${y}px`, scale: '1', opacity: 0 },
      ],
      { duration: 380, easing: 'ease-out', fill: 'both' },
    );
    f.onfinish = f.oncancel = () => flash.remove();
    const ring = fxNode('ring', 72);
    rh.fx.append(ring);
    const r = ring.animate(
      [
        { translate: `0 ${y}px`, scale: '0.4', rotate: `${rand(-12, 12)}deg`, opacity: 1 },
        { translate: `0 ${y - 10}px`, scale: '2.3', opacity: 0 },
      ],
      { duration: 520, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' },
    );
    r.onfinish = r.oncancel = () => ring.remove();

    for (let i = randInt(2, 4); i > 0; i--) {
      fxFly(fxNode('heart', rand(26, 58)), y, {
        angle: rand(100, 215),
        dist: rand(70, 170),
        rise: rand(20, 70),
        spin: rand(-40, 40),
        scale: 1,
        dur: rand(760, 1150),
        delay: rand(0, 140),
      });
    }
    for (let i = randInt(3, 5); i > 0; i--) {
      fxFly(fxNode('spark', rand(14, 30)), y, {
        angle: rand(80, 250),
        dist: rand(30, 130),
        rise: rand(0, 40),
        spin: rand(60, 180),
        scale: 1,
        dur: rand(420, 720),
        delay: rand(0, 200),
        twinkle: true,
      });
    }
    for (let i = randInt(2, 4); i > 0; i--) {
      fxFly(fxNode('dot', rand(10, 18)), y, {
        angle: rand(90, 230),
        dist: rand(40, 150),
        rise: rand(30, 90),
        spin: 0,
        scale: 1,
        dur: rand(700, 1100),
        delay: rand(40, 220),
      });
    }
  }

  const rhythmVisible = () => ['prep', 'hold', 'endless', 'execute', 'executed'].includes(S.screen);

  /**
   * 点了节奏轨：有的玩家以为滑块要跟着点（像音游）。点到轨道附近 → 点的地方冒个 ✕、轨道摇一下头，
   * 轨道左边贴一张她的提醒卡（台词池「提示-点节奏轨」，按顺序轮着说；『』里的词标粉），停 3.2 秒。
   * 卡还挂着时再点：只摇头、卡多留一会儿。按钮、挑战、面板上的点击不算；节奏轨本身照旧不接点击
   */
  /**
   * 粉框标出『』里的词（节奏轨提醒卡、闭眼那句）：挨着的几个『』并成一个框（『提』『压』）。
   * 全角括号的字形只占字框的一边（『画在右半边、』画在左半边），框里括号外侧那半个字宽用负边距收掉（.chip-open / .chip-close），
   * 框才左右对称、两个『』挨着也不会中间空一大块；英语去掉括号（挨着的用「 / 」隔开）
   */
  function markChips(node, text) {
    node.replaceChildren();
    for (const part of String(text).split(/((?:『[^』]*』)+)/)) {
      if (!part) continue;
      if (!part.startsWith('『')) {
        node.append(document.createTextNode(part));
        continue;
      }
      const chip = el('em', 'chip');
      const words = [...part.matchAll(/『([^』]*)』/g)].map((m) => m[1]);
      if (LANG === 'en') chip.textContent = words.join(' / ');
      else {
        // 挨着的几个并成一个框：只留最外面一对括号，中间用「・」隔开（原来「『提』『压』」框里挤成「提』『压」，站主 2026-09-24）
        chip.append(el('span', 'chip-open', '『'), document.createTextNode(words.join('・')), el('span', 'chip-close', '』'));
      }
      node.append(chip);
    }
    return node;
  }

  // ---------- 遵命计数（委托写了 reward.counter：001）----------
  // 命令下面的「遵命」按钮点了几次：画面顶上正中（HUD 下面）一枚墨色小牌「服从 ×n」，第一条带按钮的命令出来之后才亮（全部通过的画面不挂）；
  // 点一下跳一下。全部通过时台词条接一句「遵命-结算-*」（按服从了几成：零 / 少（不到一半）/ 多 / 全），{n} 换成次数
  function obeyRender(pop = false) {
    let box = $('obey-count');
    if (!box) {
      box = el('div', 'obey-count');
      box.id = 'obey-count';
      // 小牌上的字和按钮分开（按钮「遵命」、小牌「服从」）：英语按钮是 As you wish，小牌要短
      box.append(el('span', 'obey-label', tr('服从')), el('span', 'obey-num sticker'));
      app.append(box);
    }
    app.toggleAttribute('data-obey', !!Q?.reward?.counter && S.obey.of > 0);
    sticker(box.lastElementChild, `×${S.obey.n}`);
    if (pop) animate(box, [{ scale: '1.35' }, { scale: '0.95', offset: 0.5 }, { scale: '1' }], { duration: 360, easing: 'ease-out' });
  }
  function obeyLine() {
    const { n, of } = S.obey;
    const tier = n === 0 ? '零' : n >= of ? '全' : n / of >= 0.5 ? '多' : '少';
    const pool = `遵命-结算-${tier}`;
    if (S.screen !== 'clear' || !L[pool]?.length) return;
    const text = String(pick(pool)).replace(/\{n\}/g, String(n));
    $('say-text').textContent = text;
    emit('line', { pool, text });
  }
  bus.addEventListener('order', () => {
    S.obey.of++;
    obeyRender();
  });
  bus.addEventListener('obey', () => {
    S.obey.n++;
    obeyRender(true);
  });

  const RH_TIP = { n: 0, timer: 0 };
  function rhTapHint(e) {
    if (!['prep', 'hold', 'endless', 'execute'].includes(S.screen)) return;
    if (e.target.closest?.('button, a, .chal, .dev, #perf-panel')) return;
    const r = rh.root.getBoundingClientRect();
    if (!r.height || e.clientX < r.left - 28 || e.clientY < r.top - 40 || e.clientY > r.bottom + 70) return;
    const ar = app.getBoundingClientRect();
    const nope = el('div', 'rh-nope');
    nope.style.left = `${e.clientX - ar.left}px`;
    nope.style.top = `${e.clientY - ar.top}px`;
    app.append(nope);
    if (reduce.matches) setTimeout(() => nope.remove(), 420);
    else {
      nope.animate([{ scale: 0.5, opacity: 1 }, { scale: 1, opacity: 1, offset: 0.35 }, { scale: 1.15, opacity: 0 }], { duration: 420, easing: 'ease-out' }).onfinish = () => nope.remove();
      rh.root.animate([{ translate: '0 0' }, { translate: '-6px 0' }, { translate: '5px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });
    }
    let tip = $('rh-tip');
    if (!tip) {
      tip = el('div', 'rh-tip');
      tip.id = 'rh-tip';
      tip.setAttribute('role', 'status');
      app.append(tip);
    }
    if (!tip.classList.contains('is-on')) {
      const arr = L?.['提示-点节奏轨'];
      if (!Array.isArray(arr) || !arr.length) return;
      markChips(tip, arr[RH_TIP.n++ % arr.length]);
      tip.style.right = `${ar.right - r.left + 12}px`;
      // 跟着点的高度，但不下到轨道下四分之一（左下是秒数大字）
      tip.style.top = `${clamp(e.clientY - ar.top, r.top - ar.top + 70, r.top - ar.top + r.height * 0.7)}px`;
    }
    tip.classList.add('is-on');
    clearTimeout(RH_TIP.timer);
    RH_TIP.timer = setTimeout(() => tip.classList.remove('is-on'), 3200);
  }
  addEventListener('pointerdown', rhTapHint);

  // ================= 规则开关（006：催眠的「开关面板」拨一个，改一条规则）=================
  // S.rules：swap＝常识替换（节奏轨两头的字对调、顺序题反着点——从小点到大）、quit＝长按放弃要按的时间乘这么多（抵抗意志关掉＝更容易放弃）、
  //          shame＝羞耻心关掉（fx.js：他的心声冒得更勤）、quitWin＝放弃按钮被幻化成「长按获胜」了（定时演出「幻化」设；按下去照样是放弃，台词换成笑你的那几池）。
  //          每组开头按 sets[n].rules 重置，组里由定时演出「开关」「幻化」改（fx.js 调 setRules）
  function setRules(rules, { reset = false } = {}) {
    S.rules = { ...(reset ? {} : S.rules), ...(rules && typeof rules === 'object' ? rules : {}) };
    const caps = (rh.capText ??= [rh.capTop.textContent, rh.capBottom.textContent]);
    const [a, b] = S.rules.swap ? [caps[1], caps[0]] : caps;
    for (const [top, bottom] of [[rh.capTop, rh.capBottom], [RM.capTop, RM.capBottom]]) {
      if (!top || !bottom) continue;
      top.textContent = a;
      bottom.textContent = b;
    }
    app.toggleAttribute('data-swap', !!S.rules.swap);
    emit('rules', { rules: S.rules });
  }
  /** 长按放弃要按多久（毫秒） */
  // 倍数在按下去的那一刻定下来：按着的时候被吸了一级，进度条不会突然退回去
  const holdToQuit = () => T().holdToQuit * clamp(Number(S.rules?.quit) || 1, 0.2, 2) * (S.press ? (S.press.mult ??= stayPressTime()) : stayPressTime());
  /**
   * 逗留里「长按通过」要按多久的倍数（stay 步骤的 pressTime，007 第 4 组故意按得慢）——和 pressLure 一样，吸过 lureAfter 级之后才生效（默认 0＝一按就来）。
   * 007 一按就打断，第一级吸得晚（drainFirst）：0 一到就按、打断全看完再按也刚好赶得上——奖杯「我的等级由我保护」拿得到
   */
  function stayPressTime() {
    const st = stayStep();
    return st?.pressTime > 0 && stayHooked(st) ? st.pressTime : 1;
  }
  const stayHooked = (st) => (S.over?.k ?? 0) >= (st.lureAfter ?? 0);

  // ================= 长按放弃 =================

  function setFill(p) {
    for (const f of document.querySelectorAll('.quit-fill')) f.style.setProperty('--fill', String(p));
  }

  const inBattle = () => S.screen === 'hold' || S.screen === 'endless';

  function startPress(id) {
    if (!inBattle() || S.press || S.finishLeft > 0) return;
    S.press = { id, start: performance.now() };
    emit('press', { state: 'start', progress: 0 });
    if (stayStep()) return void say(stayStep().pressLine ?? stageCell('press').line);
    say(S.rules?.quitWin && L['长按中-上当'] ? '长按中-上当' : stageCell('press').line);
  }

  /** 松手。silent：结束时顺手清掉，不说话 */
  function endPress(silent = false) {
    if (!S.press) return;
    const progress = Math.min(1, (performance.now() - S.press.start) / holdToQuit());
    S.press = null;
    setFill(0);
    stayCoverOff(true);
    if (silent) return;
    emit('press', { state: 'release', progress: Number(progress.toFixed(2)) });
    if (stayStep()) {
      say(stayStep().releaseLine ?? stageCell('release').line);
      S.over.lineAt = S.elapsed + (stayStep().lineEvery ?? 4.5);
      return;
    }
    say(S.rules?.quitWin && L['松手-上当'] ? '松手-上当' : stageCell('release').line);
    S.nextLineAt = S.elapsed + (stageCell(S.screen === 'endless' ? 'endless' : S.phase).lineEvery ?? 6);
  }

  /** 每帧推进长按；按满了就结算，返回 true */
  function pressTick(now) {
    if (!S.press) return false;
    const p = Math.min(1, (now - S.press.start) / holdToQuit());
    setFill(p);
    if (stayLure(now, p)) return false;
    if (p < 1) return false;
    S.press = null;
    setFill(0);
    emit('press', { state: 'commit', progress: 1 });
    if (stayStep()) {
      stayPass();
      return true;
    }
    S.quitAt = Math.floor(S.elapsed);
    S.quitPhase = S.phase;
    cutinReset();
    if (S.screen === 'endless') toOver();
    else toLose();
    return true;
  }

  // 长按的地方（放弃按钮、按住的章）一按下就拦掉 touchstart：微信、QQ、UC 这类内置浏览器不管 contextmenu，
  // 长按照样弹自己的菜单、还把这次按压取消掉（站主 2026-09-20 收到的反馈）。这两处只认按下 / 松开，不靠浏览器的 click
  const holdTouch = (node) => node.addEventListener('touchstart', (e) => e.cancelable && e.preventDefault(), { passive: false });
  window.tobatsu.holdTouch = holdTouch;
  // 游戏里用不到浏览器的长按菜单：整页拦掉（开发面板的输入框除外）
  document.addEventListener('contextmenu', (e) => {
    if (!e.target.closest?.('input, textarea, select')) e.preventDefault();
  });

  for (const btn of [$('quit-pill'), $('quit-bar')]) {
    holdTouch(btn);
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      startPress(e.pointerId);
    });
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
    btn.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        startPress('key');
      }
    });
    btn.addEventListener('keyup', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && S.press?.id === 'key') endPress();
    });
  }
  const pointerEnd = (e) => {
    if (S.press && S.press.id === e.pointerId) endPress();
  };
  addEventListener('pointerup', pointerEnd);
  addEventListener('pointercancel', pointerEnd);
  addEventListener('blur', () => S.press && endPress());

  // ================= 主循环 =================

  function tick(dt, now) {
    if (S.screen === 'prep') {
      if (S.countLeft > 0) {
        const before = Math.ceil(S.countLeft);
        S.countLeft -= dt;
        const after = Math.max(0, Math.ceil(S.countLeft));
        if (after !== before) emit('count', { left: after });
        if (S.countLeft <= 0) S.endless ? toEndless() : toHold();
        else if (after !== before) showCount();
      }
    } else if (inBattle() && S.resumeLeft > 0) {
      resumeTick(dt);
    } else if (S.screen === 'hold') {
      holdTick(dt, now);
    } else if (S.screen === 'endless') {
      endlessTick(dt, now);
    } else if (S.screen === 'execute') {
      executeTick(dt);
    } else if (S.screen === 'executed') {
      // 数到 0 之后节奏停下，滑块慢慢落回底端
      RH.pos += (0 - RH.pos) * Math.min(1, dt * 3);
    }
    if (rhythmVisible()) rhRender(now);
  }

  // ---------- 切走暂停，回来倒数 ----------

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      endPress(true);
      emit('pause', { state: 'hidden' });
      return;
    }
    last = performance.now();
    if (wantAwake) keepAwake(true);
    emit('pause', { state: 'resume' });
    // 战斗中回来：先倒数，玩家重新摆好再接着计时
    if (inBattle()) {
      S.resumeLeft = RESUME_SECONDS;
      showResumeCount();
    }
  });

  function showResumeCount() {
    emit('count', { left: Math.ceil(S.resumeLeft) });
    const c = $('count');
    c.hidden = false;
    sticker(c, String(Math.max(1, Math.ceil(S.resumeLeft))));
    animate(c, [{ scale: '1.9', opacity: 0.2 }, { scale: '0.92', opacity: 1, offset: 0.6 }, { scale: '1', opacity: 1 }], {
      duration: 300,
      easing: 'cubic-bezier(.3,.7,.3,1)',
    });
  }

  function resumeTick(dt) {
    const before = Math.ceil(S.resumeLeft);
    S.resumeLeft -= dt;
    if (S.resumeLeft <= 0) {
      S.resumeLeft = 0;
      $('count').hidden = true;
      return;
    }
    if (Math.ceil(S.resumeLeft) !== before) showResumeCount();
  }

  // rAF 驱动画面；另有一个 200ms 的兜底计时，rAF 被暂停（省电模式等）时游戏照样往前走。
  // 页面不可见时不走：切走就是暂停
  let last = performance.now();
  function step(now) {
    if (document.hidden) {
      last = now;
      return;
    }
    const dt = Math.max(0, (now - last) / 1000) * S.speed;
    last = now;
    tick(dt, now);
  }
  let lastReal = performance.now();
  function frame(now) {
    step(Math.max(now, last));
    // 立绘动态按真实时间走，不跟 dev 面板的倍速
    const realDt = (now - lastReal) / 1000;
    lastReal = now;
    if (!document.hidden) {
      fpsFrame(now);
      autoFrame(now);
      motionFrame(realDt);
    }
    requestAnimationFrame(frame);
  }
  setInterval(() => {
    const now = performance.now();
    if (now - last > 180) step(now);
  }, 200);

  // ================= 开发面板（?dev=1；套在任务墙里时看外层地址） =================
  // 只有这台设备在调节器输对过口令（tobatsu.tuner-key 记着口令的 SHA-256，和 tuner.html 里的同一串）才认 ?dev=1

  const dev = {};
  const TUNER_KEY_HASH = '2c70e12b7a0646f92279f427c7b38e7334d8e5389cff167a1dc30e73f826b683';
  function devEnabled() {
    try {
      if (localStorage.getItem('tobatsu.tuner-key') !== TUNER_KEY_HASH) return false;
    } catch {
      return false;
    }
    if (new URLSearchParams(location.search).get('dev') === '1') return true;
    try {
      return window.parent !== window && new URLSearchParams(window.parent.location.search).get('dev') === '1';
    } catch {
      return false;
    }
  }

  function mountDev() {
    const panel = el('aside', 'dev');
    // 开合记在 localStorage，真机上收起一次之后就一直收着
    try {
      panel.dataset.open = localStorage.getItem('tobatsu.dev-open') ?? '1';
    } catch {
      panel.dataset.open = '1';
    }
    const btn = (label, fn) => {
      const b = el('button', '', label);
      b.type = 'button';
      b.addEventListener('click', fn);
      return b;
    };
    const row = (title, children) => {
      const r = el('div', 'dev-row');
      r.append(...children);
      panel.append(el('h2', '', title), r);
      return r;
    };

    const toggle = btn('DEV', () => {
      panel.dataset.open = panel.dataset.open === '1' ? '0' : '1';
      try {
        localStorage.setItem('tobatsu.dev-open', panel.dataset.open);
      } catch {}
    });
    toggle.className = 'dev-toggle';
    panel.append(toggle);

    const speeds = [1, 2, 5, 10, 30];
    const speedRow = row(
      '倍速',
      speeds.map((v) => btn(`×${v}`, () => ((S.speed = v), dev.refresh()))),
    );

    // 节奏：切档位（细调参数、存档位在 tuner.html）
    panel.append(el('h2', '', '节奏档位（细调去 tuner.html）'));
    const presetNames = Object.keys(Q.rhythm.presets ?? {});
    const presetRow = el('div', 'dev-row');
    presetRow.append(
      ...presetNames.map((name) =>
        btn(name, () => {
          usePreset(name);
          dev.refresh();
        }),
      ),
    );
    panel.append(presetRow);

    const jumpPhase = (phase) => () => {
      if (S.screen !== 'hold') {
        leaveBattle();
        S.endless = false;
        toHold();
      }
      const at = { early: 0, mid: bounds().early, late: bounds().mid }[phase] * target();
      S.elapsed = at + 0.001;
      skipCuesBefore(S.elapsed);
      S.nextBeatAt = S.elapsed;
      if (phase === 'early' && S.phase !== 'early') {
        cutinReset();
        changePhase('early');
      }
    };
    row('跳阶段', [
      btn('前段', jumpPhase('early')),
      btn('中段', jumpPhase('mid')),
      btn('后段', jumpPhase('late')),
      btn('结束前 3 秒', () => {
        if (!inBattle()) jumpPhase('early')();
        S.elapsed = Math.max(0, (S.screen === 'endless' ? S.elapsed : target()) - 3);
        skipCuesBefore(S.elapsed);
      }),
    ]);

    const go = (fn) => () => {
      leaveBattle();
      fn();
    };
    row('跳画面', [
      btn('委托单', go(toBrief)),
      btn('开场剧情', go(() => ((S.endless = false), runStory('开场', afterOpening)))),
      btn('准备', go(() => toPrep({ endless: false }))),
      btn('战斗', go(() => ((S.endless = false), toHold()))),
      btn('通过', go(() => ((S.endless = false), toPass()))),
      btn('暂停', go(() => ((S.endless = false), toPause()))),
      btn('全部通过', go(() => ((S.endless = false), (S.set = Q.quest.sets), toClear()))),
      btn('结局剧情', go(() => runStory('结局', toChoice))),
      btn('最后一击', go(toChoice)),
      btn('讨伐成功', go(toVictory)),
      btn('绕过剧情', go(() => runStory('绕过', () => toPrep({ endless: true })))),
      btn('无尽战斗', go(() => ((S.endless = true), toEndless()))),
      btn('无尽放弃', go(() => ((S.endless = true), (S.quitAt = 83), toOver()))),
      btn('放弃·前', go(() => ((S.endless = false), (S.quitAt = 7), (S.quitPhase = 'early'), toLose()))),
      btn('放弃·中', go(() => ((S.endless = false), (S.quitAt = 15), (S.quitPhase = 'mid'), toLose()))),
      btn('放弃·后', go(() => ((S.endless = false), (S.quitAt = 26), (S.quitPhase = 'late'), toLose()))),
      btn('认输', go(() => ((S.endless = false), (S.set = Math.min(S.set, Q.quest.sets - 1) || 1), toRetreat()))),
      btn('败北', go(() => ((S.endless = false), (S.elapsed = 12), toFall({ kind: '点击' })))),
      btn('处决', go(() => ((S.endless = false), (S.failTag ??= `第 ${S.set} 组 · 调试`), toExecute()))),
      btn('处决·归零', go(() => ((S.endless = false), (S.failTag ??= `第 ${S.set} 组 · 调试`), toExecuted()))),
    ]);

    const setRow = row(
      '第几组',
      Array.from({ length: Q.quest.sets }, (_, i) =>
        btn(String(i + 1), () => {
          S.set = i + 1;
          hud();
          dev.refresh();
        }),
      ),
    );

    const state = el('p', 'dev-state');
    const log = el('ul', 'dev-log');
    panel.append(state, log);
    app.append(panel);

    let queued = false;
    dev.refresh = () => {
      if (queued) return;
      queued = true;
      setTimeout(() => {
        queued = false;
        speedRow.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(speeds[i] === S.speed)));
        setRow.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(i + 1 === S.set)));
        presetRow.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-pressed', String(presetNames[i] === S.preset)));
        state.textContent = `${S.screen} · ${S.phase} · ${S.elapsed.toFixed(1)}s · 组 ${S.set} · 提 ${RH.rep}${lock ? ' · 常亮' : ''}`;
        log.replaceChildren(...devLog.map((t) => el('li', '', t)));
      });
    };
    setInterval(dev.refresh, 250);
    dev.refresh();
  }

  // ================= 音效 =================
  // Web Audio：第一次点屏幕时建 AudioContext 并载入 common.jsonc 里配了文件的槽（浏览器要求有过手势才能出声）。
  // 开关存 localStorage（tobatsu.sound）。没配文件、载入失败的槽不出声，失败原因记在 dev 面板的事件里

  const SFX = { ctx: null, master: null, buffers: new Map(), on: true, charge: null };
  try {
    SFX.on = localStorage.getItem('tobatsu.sound') !== '0';
  } catch {}

  const slotOf = (name) => {
    const v = Q?.sfx?.slots?.[name];
    if (!v) return null;
    return typeof v === 'string' ? { src: v } : v.src ? v : null;
  };

  function sfxUnlock() {
    if (!Q) return;
    if (!SFX.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      SFX.ctx = new AC();
      SFX.master = SFX.ctx.createGain();
      SFX.master.gain.value = Q.sfx?.volume ?? 0.8;
      SFX.master.connect(SFX.ctx.destination);
      for (const name of Object.keys(Q.sfx?.slots ?? {})) loadSlot(name);
    }
    if (SFX.ctx.state === 'suspended') SFX.ctx.resume();
  }

  /** 载入一个槽的文件（换文件时也调它；同一个文件只下载解码一次） */
  const decoded = new Map();
  function loadSlot(name) {
    const slot = slotOf(name);
    SFX.buffers.delete(name);
    if (!slot || !SFX.ctx) return;
    if (!decoded.has(slot.src)) {
      decoded.set(
        slot.src,
        fetch(slot.src)
          .then((r) => {
            if (!r.ok) throw new Error(`${r.status}`);
            return r.arrayBuffer();
          })
          .then((buf) => new Promise((ok, bad) => SFX.ctx.decodeAudioData(buf, ok, bad))),
      );
    }
    decoded
      .get(slot.src)
      .then((audio) => slotOf(name)?.src === slot.src && SFX.buffers.set(name, audio))
      .catch((e) => {
        decoded.delete(slot.src);
        emit('sfx', { name, src: slot.src, error: String(e?.message ?? e) });
      });
  }
  addEventListener('pointerdown', sfxUnlock, true);
  addEventListener('keydown', sfxUnlock, true);

  /** 放一个槽。slot.volume 调这一槽的音量，slot.pitch 是音高随机幅度（0.05＝±5%），重复的声音不那么机械 */
  function play(name) {
    if (!SFX.on || !SFX.ctx) return null;
    const audio = SFX.buffers.get(name);
    if (!audio) return null;
    const slot = slotOf(name);
    const src = SFX.ctx.createBufferSource();
    src.buffer = audio;
    src.playbackRate.value = 1 + (Math.random() * 2 - 1) * (slot.pitch ?? 0);
    const gain = SFX.ctx.createGain();
    gain.gain.value = slot.volume ?? 1;
    src.connect(gain).connect(SFX.master);
    src.start();
    return src;
  }

  function stopCharge() {
    try {
      SFX.charge?.stop();
    } catch {}
    SFX.charge = null;
  }

  // ---------- 背景音乐 ----------
  // <audio loop> 接进同一个 AudioContext 的增益节点（iOS 上 <audio>.volume 不起作用，只能这样调音量）。
  // 第一次点屏幕时开始放；各画面乘不同的音量（剧情、结算压低，让台词和结算音效出来），换画面时 0.6 秒滑过去。
  // 页面切走暂停，回来接着放；喇叭关掉就停

  const BGM = { el: null, gain: null, track: null, library: {} };

  /**
   * 曲子在站级共享 BGM 库（drop/bgm/，导入后 /works/_bgm/）：library.json 是曲名 → 带哈希的文件名。
   * 读不到（比如没跑导入）就没有背景音乐，游戏照常
   */
  const BGM_LIBRARY = '../_bgm/library.json';
  async function loadBgmLibrary() {
    try {
      const lib = await loadJsonc(BGM_LIBRARY);
      const base = new URL(BGM_LIBRARY, location.href);
      BGM.library = Object.fromEntries(Object.entries(lib.tracks ?? {}).map(([name, file]) => [name, new URL(file, base).href]));
    } catch (e) {
      emit('bgm', { error: `共享 BGM 库读不到：${e.message}` });
    }
  }

  function bgmTracks() {
    return BGM.library;
  }

  /** 这份委托放哪首（quest-<编号>.jsonc 的 bgm.use）：一个曲名；几个曲名的数组＝在里面随机；random 或没写＝整个库里随机 */
  function pickTrack() {
    const names = Object.keys(bgmTracks());
    if (!names.length) return null;
    const use = Q.bgm?.use;
    const listed = (Array.isArray(use) ? use : [use]).filter((n) => names.includes(n));
    const pool = listed.length ? listed : names;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function bgmLevel() {
    const scene = Q?.bgm?.scene ?? {};
    const key = Object.keys(scene).find((k) => k.split('|').includes(S.screen));
    return (Q?.bgm?.volume ?? 0.5) * (key ? scene[key] : 1);
  }

  function bgmFade(to, seconds = 0.6) {
    if (!BGM.gain) return;
    const t = SFX.ctx.currentTime;
    BGM.gain.gain.cancelScheduledValues(t);
    BGM.gain.gain.setValueAtTime(BGM.gain.gain.value, t);
    BGM.gain.gain.linearRampToValueAtTime(to, t + seconds);
  }

  function bgmStart(track = BGM.next ?? BGM.track ?? pickTrack()) {
    if (!SFX.ctx || !track || !bgmTracks()[track]) return;
    BGM.next = null;
    if (!BGM.el) {
      BGM.el = new Audio();
      BGM.el.loop = true;
      BGM.el.preload = 'auto';
      BGM.gain = SFX.ctx.createGain();
      BGM.gain.gain.value = 0;
      SFX.ctx.createMediaElementSource(BGM.el).connect(BGM.gain).connect(SFX.ctx.destination);
    }
    if (track !== BGM.track) {
      BGM.track = track;
      BGM.gain.gain.value = 0;
      BGM.el.src = bgmTracks()[track];
      emit('bgm', { track });
    }
    if (!SFX.on || document.hidden) return;
    BGM.el.play().catch((e) => emit('bgm', { track, error: String(e?.message ?? e) }));
    bgmFade(bgmLevel());
  }

  /**
   * 剧情里换曲子（story 某句写 "bgm": 曲名，"quest"＝回到这份委托自己的那首；008 开场：Aschan 那段放她的曲子，进赌场换回来）：
   * 正在放就淡出再换；还没放（还没点过画面、关着声音）就记着，开始放时用它
   */
  function bgmSwitch(name) {
    const track = name === 'quest' ? pickTrack() : name;
    if (!track || !bgmTracks()[track] || track === (BGM.next ?? BGM.track)) return;
    if (!BGM.el || BGM.el.paused || !SFX.on) {
      BGM.next = track;
      return;
    }
    bgmFade(0, 0.5);
    clearTimeout(BGM.swap);
    BGM.swap = setTimeout(() => bgmStart(track), 520);
  }

  function bgmStop() {
    if (!BGM.el) return;
    bgmFade(0, 0.3);
    setTimeout(() => !SFX.on || document.hidden ? BGM.el.pause() : null, 320);
  }

  document.addEventListener('visibilitychange', () => (document.hidden ? BGM.el?.pause() : SFX.on && BGM.track && bgmStart()));
  addEventListener('pointerdown', () => SFX.ctx && SFX.on && !BGM.track && bgmStart(), true);

  function setSound(on) {
    SFX.on = on;
    $('hud-sound').setAttribute('aria-pressed', String(on));
    try {
      localStorage.setItem('tobatsu.sound', on ? '1' : '0');
    } catch {}
    if (!on) {
      stopCharge();
      bgmStop();
    } else {
      bgmStart();
    }
  }
  $('hud-sound').addEventListener('click', () => {
    sfxUnlock();
    setSound(!SFX.on);
    emit('tap');
  });

  function wireSfx() {
    const on = window.tobatsu.on;
    // 台词条换句的轻声只给战斗各段的台词池（演出表里 early / mid / late / endless 的 line，含各组覆盖）和准备
    const BATTLE_POOLS = new Set(['准备', ...(Q.sets ?? []).map((st) => st?.prep).filter(Boolean)]);
    for (const cell of ['early', 'mid', 'late', 'endless']) {
      for (const stage of [Q.stage, ...(Q.sets ?? []).map((st) => st?.stage)]) if (stage?.[cell]?.line) BATTLE_POOLS.add(stage[cell].line);
    }
    on('rhythm', ({ edge }) => play(edge === 'top' ? '提' : '压'));
    on('count', ({ left }) => left > 0 && play('倒数'));
    on('screen', ({ screen }) => {
      if (BGM.el && SFX.on && !BGM.el.paused) bgmFade(bgmLevel());
      if (screen === 'hold' || screen === 'endless') play('开始');
      else if (screen === 'clear') play('全部通过');
      else if (screen === 'victory') play('讨伐成功');
      else if (screen === 'lose' || screen === 'fall' || screen === 'over' || screen === 'retreat') play('失败');
    });
    on('line', ({ pool, who }) => {
      if (who) play('对话');
      else if (BATTLE_POOLS.has(pool)) play('台词');
    });
    on('cutin', ({ state }) => state === 'in' && play('cutin'));
    on('phase', ({ phase }) => phase !== 'early' && play('切阶段'));
    on('beat', ({ phase }) => (Q.sfx?.heartbeatIn ?? ['late']).includes(phase) && play('心跳'));
    on('press', ({ state }) => {
      stopCharge();
      if (state === 'start') SFX.charge = play('长按');
      else play(state === 'commit' ? '放弃' : '松手');
    });
    on('pass', () => play('通过'));
    on('choose', () => play('选择'));
    on('tap', () => play('按钮'));
  }

  // ================= 节奏档位：本机存的档位 + tuner.html 用的接口 =================

  /**
   * 本机存储分两种。跟委托走的——节奏档位、本机默认档位、无尽纪录、立绘动态参数、遮罩草稿——按委托分开，
   * 键名 tobatsu.q<编号>.<名字>（遮罩草稿在 IndexedDB 的 motion-mask:<编号>）；
   * 公共的——喇叭、性能档、文字样式、边缘处理、调节器开合——照旧一份。特写取景本来就按立绘分开存（tobatsu.fx-closeup.<立绘>）。
   * 分开之前只有一份委托：旧键第一次读到时搬过来（节奏档位和纪录给 004，立绘草稿给用那张图的委托），旧键留着不删
   */
  const qkey = (name) => `tobatsu.q${Q.quest.id}.${name}`;
  const maskKey = () => `motion-mask:${Q.quest.id}`;
  const CUSTOM_KEY = 'rhythm-custom';
  const USE_KEY = 'rhythm-use';
  const BEST_KEY = 'endless-best';
  const LEGACY_QUEST = '004';

  function migrateLocal() {
    try {
      if (Q.quest.id !== LEGACY_QUEST) return;
      for (const name of [CUSTOM_KEY, USE_KEY, BEST_KEY]) {
        const old = localStorage.getItem(`tobatsu.${name}`);
        if (old !== null && localStorage.getItem(qkey(name)) === null) localStorage.setItem(qkey(name), old);
      }
    } catch {}
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback;
    } catch {
      return fallback;
    }
  }

  function usePreset(name) {
    if (!Q.rhythm.presets?.[name]) return;
    S.preset = name;
    rhMeasure();

  }

  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ================= 关卡（调节器「关卡」页编辑的那几块）=================
  // 委托文件里能在关卡编辑器里改的：quest 的卡片与目标、sets 每组、stage 演出表、rhythm.use 节奏档位、bgm.use 选曲。
  // 本机草稿存在 tobatsu.q<编号>.level-draft，这台设备进这份委托就盖上去（地址加 ?nodraft=1 临时不用）

  const LEVEL_QUEST_KEYS = ['name', 'subtitle', 'rank', 'duration', 'description', 'detail', 'tag', 'tagLong', 'client', 'herName', 'reward', 'suggestion', 'sets', 'seconds'];
  const LEVEL = { base: null, draft: false };

  function levelOf() {
    const quest = {};
    for (const k of LEVEL_QUEST_KEYS) if (Q.quest[k] !== undefined) quest[k] = Q.quest[k];
    return { quest, sets: Q.sets ?? [], stage: Q.stage ?? {}, rhythm: { use: Q.rhythm?.use }, bgm: { use: Q.bgm?.use ?? 'random' } };
  }

  /** 把一份关卡数据盖到内存里（立刻生效，不存）。live＝游戏已经在跑：顺手换节奏档位、刷新 HUD 和委托单 */
  function applyLevel(data, { live = true } = {}) {
    if (!data) return;
    if (data.quest) Object.assign(Q.quest, clone(data.quest));
    if (Array.isArray(data.sets)) Q.sets = clone(data.sets);
    if (data.stage) Q.stage = clone(data.stage);
    if (data.rhythm?.use && Q.rhythm.presets?.[data.rhythm.use]) {
      Q.rhythm.use = data.rhythm.use;
      if (live) usePreset(data.rhythm.use);
    }
    if (data.bgm && 'use' in data.bgm) Q.bgm = { ...Q.bgm, use: data.bgm.use };
    setHudName();
    if (!live) return;
    hud();
    if (S.screen === 'brief') toBrief();
  }

  /** 启动时：记下文件里的原样，有本机草稿就盖上 */
  /** 键排好序再转字符串：比两份关卡是不是一样，不受键的先后影响 */
  const stable = (v) =>
    v && typeof v === 'object'
      ? Array.isArray(v)
        ? `[${v.map(stable).join(',')}]`
        : `{${Object.keys(v).filter((k) => v[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(',')}}`
      : JSON.stringify(v);

  function loadLevelDraft() {
    LEVEL.base = clone(levelOf());
    // 草稿是关卡编辑器存的中文原稿：日英韩版不盖（站主 2026-10-26）——这时译文已经换好了，盖上去委托名、委托人、名牌、
    // 每组的提示条就又变回中文；下面「和文件一样就丢掉」拿中文草稿和译好的文件比，也永远比不上
    if (LANG !== 'zh') return;
    const saved = readJson(qkey('level-draft'), null);
    // 草稿已经和文件一样了（写回文件、发布上线之后）：丢掉，免得以后挡住文件里的新改动
    if (saved?.data && stable({ ...LEVEL.base, ...saved.data, quest: { ...LEVEL.base.quest, ...saved.data.quest } }) === stable(LEVEL.base)) {
      localStorage.removeItem(qkey('level-draft'));
      return;
    }
    if (saved?.data && pageParam('nodraft') !== '1') {
      applyLevel(saved.data, { live: false });
      LEVEL.draft = true;
    }
  }

  window.tobatsu.tune = {
    /** 本机存储的键名：委托编号、按委托分开的 localStorage 键、遮罩草稿的 IndexedDB 键 */
    local: { quest: () => Q.quest.id, key: (name) => qkey(name), maskKey: () => maskKey() },
    /** 委托：有哪几份、现在是哪份、默认哪份（切换靠带 ?quest= 重新载入，tuner.html 做） */
    quests: () => ({ list: [...(Q.quests?.list ?? [])], current: Q.quest.id, default: Q.quests?.default ?? null }),
    /** 立绘档案：各委托的（按编号）+ common.jsonc 里的测试立绘；现在用的是哪个。切换靠带 ?standee=名字 重新载入（tuner.html 做） */
    standees: () => ({
      names: [...(Q.quests?.list ?? []), ...Object.keys(Q.standees ?? {})],
      active: Q.standeeActive ?? null,
      default: Q.quest.id ?? null,
    }),
    /** 全部档位（委托文件里的 + 本机存的），以及哪些是本机存的 */
    presets: () => ({ all: clone(Q.rhythm.presets), custom: Object.keys(readJson(qkey(CUSTOM_KEY), {})), current: S.preset }),
    use: (name) => usePreset(name),
    /** 改当前档位的参数（只在内存里，存档位由 tuner.html 写 localStorage 再调 define） */
    set(params) {
      const cur = RP0();
      for (const [k, v] of Object.entries(params)) cur[k] = v && typeof v === 'object' ? { ...cur[k], ...v } : v;
      rhMeasure();
    },
    define(name, params) {
      Q.rhythm.presets[name] = clone(params);
    },
    remove(name) {
      delete Q.rhythm.presets[name];
    },
    /** 关卡编辑器：读 / 盖（只这一页）/ 本机草稿，以及编辑时要的名单 */
    level: {
      get: () => clone(levelOf()),
      /** 文件里的原样（没盖本机草稿） */
      base: () => clone(LEVEL.base),
      apply: (data) => applyLevel(data),
      draft: {
        get: () => readJson(qkey('level-draft'), null),
        active: () => LEVEL.draft,
        save(data) {
          localStorage.setItem(qkey('level-draft'), JSON.stringify({ savedAt: new Date().toISOString(), data }));
          LEVEL.draft = true;
        },
        clear() {
          localStorage.removeItem(qkey('level-draft'));
          LEVEL.draft = false;
        },
      },
      pools: () => Object.keys(L ?? {}),
      effects: () => ({ effects: clone(Q.fx?.effects ?? []), groups: clone(Q.fx?.groups ?? {}) }),
      presets: () => Object.keys(Q.rhythm?.presets ?? {}),
      tracks: () => Object.keys(BGM.library),
      /** 浮现文字的样式预设名（common.jsonc 的 fx.looks） */
      looks: () => Object.keys(Q.fx?.looks ?? {}),
      /** 静图特写（嘴 / 靴底）的几种呈现的名字（立绘档案 fx.closeup.<key>.variants） */
      stillVariants: (key) => (Q.fx?.closeup?.[key]?.variants ?? []).map((v) => v?.name).filter(Boolean),
      /** 战斗取景（battleStandee 的 frames / centerX）：编辑镜头时当参考；给了组号就看那一组换的战斗图 */
      framing: (n) => {
        const name = n ? standeeOf(n, false) : null;
        const bs = name && name !== Q.standeeActive ? deepMerge(Q.art?.battleStandee ?? {}, Q.standees[name].art?.battleStandee ?? {}) : (Q.art?.battleStandee ?? {});
        return { frames: clone(bs.frames ?? {}), centerX: bs.centerX ?? null, standee: name ?? ST.base };
      },
      /** 能给某一组换的战斗图：委托文件 / common.jsonc 的 standees 段里的名字（test 是对比用的测试立绘，不列） */
      battleStandees: () => Object.keys(Q.standees ?? {}).filter((k) => k !== 'test'),
      defaults: () => ({ seconds: Q.quest.seconds, earlyEnds: T().earlyEnds, midEnds: T().midEnds, readyTip: T().readyTip }),
      challengeDefaults: () => clone(Q.challenge ?? {}),
    },
    /** 进第 n 组的战斗、跳到某一段（phase 写 last 就是那组最后 5 秒，写数字就是从第几秒开始）；freeze＝定住倒计时 */
    playSet(n = 1, phase = 'early', freeze = false) {
      leaveBattle();
      S.endless = false;
      S.set = Math.max(1, Math.min(n, Q.quest.sets));
      toHold();
      const b = bounds();
      const at =
        typeof phase === 'number'
          ? Math.max(0, phase - 0.05)
          : phase === 'last'
            ? Math.max(0, target() - 5.5)
            : ({ early: 0, mid: b.early, late: b.mid }[phase] ?? 0) * target();
      S.elapsed = Math.min(at, target() - 0.5) + 0.001;
      skipCuesBefore(S.elapsed);
      const p = phaseAt(S.elapsed);
      if (p !== S.phase) changePhase(p);
      cameraTick();
      S.freeze = freeze;
    },
    /** 进第 n 组之前的准备倒数（看提示条和准备台词） */
    prepSet(n = 1) {
      leaveBattle();
      S.set = Math.max(1, Math.min(n, Q.quest.sets));
      toPrep({ endless: false });
    },
    /** 进无尽战斗 */
    playEndless() {
      leaveBattle();
      S.endless = true;
      toEndless();
    },
    /** 进战斗、跳到某一段；freeze＝定住倒计时，只让节奏跑 */
    play(phase = 'early', freeze = true) {
      leaveBattle();
      S.endless = false;
      toHold();
      const at = { early: 0, mid: bounds().early, late: bounds().mid }[phase] * target();
      S.elapsed = at + 0.001;
      skipCuesBefore(S.elapsed);
      const p = phaseAt(S.elapsed);
      if (p !== S.phase) changePhase(p);
      S.freeze = freeze;
    },
    freeze(on) {
      S.freeze = on;
    },
    /** 手动推进主循环 n 步、每步 dt 秒（预览窗口被隐藏时浏览器不跑动画帧，测流程用） */
    tick(dt = 0.05, n = 1) {
      for (let i = 0; i < n; i++) tick(dt, performance.now());
    },
    state: () => ({ screen: S.screen, phase: S.phase, freeze: S.freeze, reps: RH.rep }),
    /** 音效：列出槽、临时换某一槽的文件（不存）、试听 */
    sfx: {
      slots: () => clone(Q.sfx?.slots ?? {}),
      choices: () => clone(Q.sfx?.choices ?? {}),
      variants: () => clone(Q.sfx?.variants ?? {}),
      set(name, value) {
        Q.sfx.slots[name] = value;
        sfxUnlock();
        loadSlot(name);
      },
      play(name) {
        sfxUnlock();
        return !!play(name);
      },
    },
    /** 立绘动态：状态、改参数（不存）、换草稿遮罩、给冲量、存 / 清本机草稿 */
    motion: {
      info() {
        const img = $('art-img').querySelector('img');
        const src = img?.getAttribute('src') ?? null;
        return {
          active: MV.active,
          reason: MV.reason,
          imageSrc: src,
          imageSize: img ? [img.naturalWidth, img.naturalHeight] : null,
          maskSrc: src ? maskSrcFor(src) : null,
          mask2Src: src ? maskSrcFor(src, 'mask2') : null,
          draft: !!MV.draftMask && MV.draftFor === src,
          params: clone(Q.motion ?? {}),
        };
      },
      set(params) {
        Q.motion = deepMerge(Q.motion ?? {}, params);
      },
      /** 草稿遮罩（canvas / ImageData / ImageBitmap）先只用在这一页；imageSrc 是它对应的原图 */
      setMask(source, imageSrc, source2 = null) {
        MV.draftMask = source;
        MV.draftMask2 = source2;
        MV.draftFor = imageSrc;
        MV.draftVersion = (MV.draftVersion ?? 0) + 1;
        motionSync();
        advMotionSync();
      },
      kick,
      mode: () => motionMode(),
      async saveDraft(blob, imageSrc, blob2 = null) {
        await idbDo('readwrite', (st) => st.put({ blob, blob2, imageSrc }, maskKey()));
        // 参数跟着委托、也跟着图存：借了别的立绘（?standee=）调的幅度不会带回自己的图上
        localStorage.setItem(qkey(MOTION_PARAMS_KEY), JSON.stringify({ imageSrc, params: Q.motion ?? {} }));
      },
      async clearDraft() {
        await idbDo('readwrite', (st) => st.delete(maskKey()));
        localStorage.removeItem(qkey(MOTION_PARAMS_KEY));
      },
    },
    /** 性能档与帧数：档位列表、现在的档、换档（save＝存本机）、帧数统计、游戏里显示帧数 */
    perf: {
      tiers: () => perfTiers(),
      get: () => PERF.tier,
      set(tier, save = true) {
        AUTO.on = false;
        setPerf(tier);
        if (save) {
          try {
            localStorage.setItem(PERF_KEY, PERF.tier);
          } catch {}
        }
      },
      stats: () => fpsStats(),
      /** 自动降档：开没开、最近一次 10 秒窗口的平均帧数 / 抖动 / 是否当成限帧 / 连续低了几次 */
      auto: () => ({ on: AUTO.on, ...(AUTO.last ?? {}) }),
      hud: (on) => fpsHud(on),
      stress: () => !!S.stress,
    },
    /** 立绘边缘处理（art.edge）：读、改（只这一页）、存本机、清本机 */
    edge: {
      get: () => clone(Q.art?.edge ?? {}),
      set(patch) {
        Q.art = { ...(Q.art ?? {}), edge: deepMerge(Q.art?.edge ?? {}, patch) };
      },
      save: () => localStorage.setItem(EDGE_KEY, JSON.stringify(Q.art?.edge ?? {})),
      clear: () => localStorage.removeItem(EDGE_KEY),
    },
    /** 背景音乐：列出曲目、切一首（不存）、调总音量 */
    bgm: {
      tracks: () => Object.keys(bgmTracks()),
      current: () => BGM.track,
      play(track) {
        sfxUnlock();
        bgmStart(track);
      },
      volume(v) {
        Q.bgm.volume = v;
        bgmFade(bgmLevel(), 0.1);
      },
      level: () => Q?.bgm?.volume ?? 0.5,
      state: () => ({ track: BGM.track, paused: BGM.el?.paused ?? true, time: BGM.el?.currentTime ?? 0, gain: BGM.gain?.gain.value ?? 0 }),
    },
  };

  // ================= 性能档与帧数 =================
  /**
   * 高 / 中 / 低：画布分辨率上限（dpr）、边缘处理（edge：full 全开 / noShadow 关影子 / off 全关）、
   * 粒子数量倍数（particles：魅了层飘心、撒心）、幻象开关（visions）、辉光（glow：full / light / none——浮现文字、心形的发光）。
   * 选档顺序：地址 ?perf=high|mid|low ＞ 调节器存的本机档 ＞ common.jsonc 的 perf.default。数值可以在 common.jsonc 的 perf.tiers 里改
   */
  const PERF_KEY = 'tobatsu.perf';
  const PERF_TIERS = {
    high: { dpr: 2, edge: 'full', particles: 1, visions: true, glow: 'full' },
    mid: { dpr: 1.5, edge: 'noShadow', particles: 0.6, visions: true, glow: 'light' },
    low: { dpr: 1, edge: 'off', particles: 0.3, visions: false, glow: 'none' },
  };
  const PERF = { tier: 'high', ...PERF_TIERS.high };
  function perfTiers() {
    const custom = Q?.perf?.tiers ?? {};
    return Object.fromEntries(Object.entries(PERF_TIERS).map(([k, v]) => [k, { ...v, ...(custom[k] ?? {}) }]));
  }
  function setPerf(tier, detail = {}) {
    const tiers = perfTiers();
    if (!tiers[tier]) tier = 'high';
    Object.assign(PERF, tiers[tier], { tier });
    app.dataset.perf = tier;
    emit('perf', { tier, ...detail });
  }
  function initPerf() {
    const url = pageParam('perf');
    let local = null;
    try {
      local = localStorage.getItem(PERF_KEY);
    } catch {}
    setPerf(perfTiers()[url] ? url : perfTiers()[local] ? local : (Q.perf?.default ?? 'high'));
    // 地址指定了档位、或者调节器里手选过（存了本机）就不自动降
    AUTO.on = (Q.perf?.auto?.enabled ?? true) && !perfTiers()[url] && !perfTiers()[local];
  }

  /**
   * 自动降档：只在战斗画面（hold / endless）量。每 window 秒算一次平均帧数，连续 windows 次低于 below 就降一档（高→中→低），
   * 右上角提示一次；一局里只降不升（发热不会马上退，升回去又会掉）。换画面、切后台回来、恢复倒数之后的前 settle 秒不算。
   * 平均落在 capBand 里、每秒帧数几乎不抖（极差 ≤ capJitter）时，当成系统限帧（iPhone 低电量模式锁 30fps），不降。
   * 数值在 common.jsonc 的 perf.auto
   */
  const AUTO = { on: false, settleUntil: 0, winStart: 0, frames: 0, secStart: 0, secFrames: 0, secs: [], low: 0, last: null };
  const TIER_ORDER = ['high', 'mid', 'low'];
  function autoReset() {
    AUTO.settleUntil = 0;
    AUTO.winStart = 0;
    AUTO.low = 0;
  }
  function autoFrame(now) {
    if (!AUTO.on) return;
    if (!inBattle() || S.resumeLeft > 0 || S.finishLeft > 0 || S.freeze) return autoReset();
    const c = Q.perf?.auto ?? {};
    if (!AUTO.settleUntil) AUTO.settleUntil = now + (c.settle ?? 5) * 1000;
    if (now < AUTO.settleUntil) return;
    if (!AUTO.winStart) {
      Object.assign(AUTO, { winStart: now, frames: 0, secStart: now, secFrames: 0, secs: [] });
      return;
    }
    AUTO.frames++;
    AUTO.secFrames++;
    if (now - AUTO.secStart >= 1000) {
      AUTO.secs.push(AUTO.secFrames);
      AUTO.secFrames = 0;
      AUTO.secStart += 1000;
    }
    const span = (now - AUTO.winStart) / 1000;
    if (span < (c.window ?? 10)) return;
    const avg = AUTO.frames / span;
    const [lo, hi] = c.capBand ?? [27, 33];
    const spread = AUTO.secs.length ? Math.max(...AUTO.secs) - Math.min(...AUTO.secs) : 0;
    const capped = avg >= lo && avg <= hi && spread <= (c.capJitter ?? 2);
    AUTO.low = avg < (c.below ?? 50) && !capped ? AUTO.low + 1 : 0;
    AUTO.last = { avg: Math.round(avg), spread, capped, low: AUTO.low };
    Object.assign(AUTO, { winStart: now, frames: 0, secStart: now, secFrames: 0, secs: [] });
    if (AUTO.low < (c.windows ?? 2)) return;
    const next = TIER_ORDER[TIER_ORDER.indexOf(PERF.tier) + 1];
    AUTO.low = 0;
    if (!next) {
      AUTO.on = false;
      return;
    }
    setPerf(next, { auto: true, avg: Math.round(avg) });
    perfNote(next);
    if (next === TIER_ORDER.at(-1)) AUTO.on = false;
  }
  addEventListener('visibilitychange', autoReset);

  /**
   * 画面效果设置（站主 2026-09-18：玩家自己调性能）：HUD 右上角喇叭左边的按钮，点开一张小卡选 自动 / 高 / 中 / 低。
   * 自动＝按 common.jsonc 的默认档开始、卡了自己往下降（不存本机）；高 / 中 / 低＝固定这一档、不自动降，存本机（和调节器同一个键 tobatsu.perf）
   */
  const PERF_CN = { auto: '自动', high: '高', mid: '中', low: '低' };
  const PERF_DESC = {
    auto: '先用高档，卡顿时自己往下调',
    high: '全部特效：清晰的立绘边缘、光晕和飘心',
    mid: '减少飘心和光晕，立绘边缘不带影子',
    low: '最省电：画面分辨率降低，关掉幻象、光晕和边缘处理',
  };
  function perfChoice() {
    try {
      const saved = localStorage.getItem(PERF_KEY);
      return perfTiers()[saved] ? saved : 'auto';
    } catch {
      return 'auto';
    }
  }
  function choosePerf(choice) {
    try {
      if (choice === 'auto') localStorage.removeItem(PERF_KEY);
      else localStorage.setItem(PERF_KEY, choice);
    } catch {}
    if (choice === 'auto') {
      setPerf(Q.perf?.default ?? 'high');
      autoReset();
      AUTO.on = Q.perf?.auto?.enabled ?? true;
    } else {
      AUTO.on = false;
      setPerf(choice);
    }
    renderPerfPanel();
  }
  function renderPerfPanel() {
    const panel = $('perf-panel');
    if (!panel) return;
    const choice = perfChoice();
    const head = el('h2', '', tr('画面效果'));
    if (choice === 'auto') head.append(el('small', '', tr('现在：{tier}', { tier: tr(PERF_CN[PERF.tier]) })));
    const row = el('div', 'perf-options');
    for (const k of ['auto', 'high', 'mid', 'low']) {
      const b = el('button', '', tr(PERF_CN[k]));
      b.type = 'button';
      b.setAttribute('aria-pressed', String(k === choice));
      b.addEventListener('click', () => {
        emit('tap');
        choosePerf(k);
      });
      row.append(b);
    }
    panel.replaceChildren(head, row, el('p', 'perf-desc', tr(PERF_DESC[choice])));
  }
  function togglePerfPanel(open = !$('perf-panel')) {
    $('hud-perf').setAttribute('aria-expanded', String(open));
    if (!open) return $('perf-panel')?.remove();
    const panel = el('div', 'perf-panel');
    panel.id = 'perf-panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', tr('画面效果'));
    // 面板里的点击不往下传（不推剧情、不算点到画面）
    for (const type of ['pointerdown', 'click']) panel.addEventListener(type, (e) => e.stopPropagation());
    app.append(panel);
    renderPerfPanel();
  }
  $('hud-perf').addEventListener('click', (e) => {
    e.stopPropagation();
    sfxUnlock();
    emit('tap');
    togglePerfPanel();
  });
  // 点面板外面就收起
  document.addEventListener('pointerdown', (e) => {
    if ($('perf-panel') && !e.target.closest?.('#perf-panel, #hud-perf')) togglePerfPanel(false);
  });
  bus.addEventListener('perf', () => renderPerfPanel());

  /** 降档提示：HUD 下面居中一枚 ink 药丸，停 3.2 秒 */
  let perfNoteTimer = 0;
  function perfNote(tier) {
    const TIER_CN = { high: '高', mid: '中', low: '低' };
    let note = $('perf-note');
    if (!note) {
      note = el('div', 'perf-note');
      note.id = 'perf-note';
      note.setAttribute('role', 'status');
      app.append(note);
    }
    note.textContent = tr('画面调到「{tier}」档，保持流畅', { tier: tr(TIER_CN[tier] ?? tier) });
    note.classList.add('is-on');
    clearTimeout(perfNoteTimer);
    perfNoteTimer = setTimeout(() => note.classList.remove('is-on'), 3200);
  }
  const pixelRatio = () => Math.min(PERF.dpr, window.devicePixelRatio || 1);

  /** 帧数：记最近 10 秒每一帧的时间，算当前、10 秒平均、10 秒里最差的一秒、最长的一帧 */
  const FPS = { times: [], hud: null };
  function fpsFrame(now) {
    const t = FPS.times;
    t.push(now);
    while (t.length && t[0] < now - 10000) t.shift();
  }
  function fpsStats() {
    const t = FPS.times;
    if (t.length < 10) return null;
    const now = t[t.length - 1];
    const span = (now - t[0]) / 1000;
    let i = t.length - 1;
    while (i > 0 && t[i - 1] >= now - 1000) i--;
    const perSec = new Map();
    let worstFrame = 0;
    for (let k = 1; k < t.length; k++) {
      worstFrame = Math.max(worstFrame, t[k] - t[k - 1]);
      const sec = Math.floor((now - t[k]) / 1000);
      perSec.set(sec, (perSec.get(sec) ?? 0) + 1);
    }
    const full = [...perSec.entries()].filter(([sec]) => sec < Math.floor(span)).map(([, n]) => n);
    return {
      now: t.length - i,
      avg: Math.round((t.length - 1) / Math.max(0.001, span)),
      low: full.length ? Math.min(...full) : t.length - i,
      worstMs: Math.round(worstFrame),
      tier: PERF.tier,
      dpr: pixelRatio(),
    };
  }
  function fpsHud(on) {
    if (!on) {
      FPS.hud?.remove();
      FPS.hud = null;
      return;
    }
    if (FPS.hud) return;
    FPS.hud = el('div', 'perf-hud');
    app.append(FPS.hud);
    const paint = () => {
      if (!FPS.hud) return;
      const st = fpsStats();
      const TIER_CN = { high: '高', mid: '中', low: '低' };
      FPS.hud.textContent = st
        ? `${st.now} fps · 10秒 均${st.avg} 最低${st.low} · 最长一帧 ${st.worstMs}ms
性能档 ${TIER_CN[st.tier] ?? st.tier} · 分辨率 ×${st.dpr}${S.stress ? ' · 最坏情况' : ''}`
        : '测帧数中…';
      setTimeout(paint, 500);
    };
    paint();
  }
  // 切到后台再回来：那一段空白不算
  document.addEventListener('visibilitychange', () => (FPS.times.length = 0));

  /**
   * 最坏情况（地址 ?stress=1）：直接进无尽战斗、跳到后段；fx.js 看到后把魅了层拉满、特写循环接连不断、别的演出每 2.5 秒叠一个。
   * 配 ?fps=1 显示帧数，配 ?perf=mid 之类指定性能档
   */
  function startStress() {
    S.stress = true;
    S.endless = true;
    toEndless();
    S.elapsed = (E().lateAt ?? 60) + 5;
  }

  // ================= 立绘动态（战斗画面角色图）=================
  // 单张图 + 同尺寸遮罩（R 胸部摇动 / G 呼吸 / B 头发），WebGL 片元着色器按遮罩权重做位移：
  // 每个像素去原图里「往回偏 d」的位置取色，d 由三种运动加权叠加。位移在原图像素坐标上算，取景照旧。
  // 只在 prep / hold / pass / endless 画面、图配了遮罩、有 WebGL、没开减少动态时启用；否则退回整图呼吸（CSS）。
  // 摇动是阻尼弹簧：到顶向上冲量、到底向下，cut-in 和切图大一下，后段心跳一点点，冲量按阶段放大。
  // 本机草稿：tuner.html「立绘」页画的遮罩和调的参数可以存进这台设备（IndexedDB + localStorage），这台设备进游戏就用它

  const MOTION_SCREENS = new Set(['prep', 'hold', 'pass', 'endless', 'execute', 'executed']);
  const MV = {
    gl: null,
    prog: null,
    loc: {},
    canvas: null,
    ok: null, // WebGL 能不能用（null＝还没试）
    reason: '',
    active: false,
    img: null, // 当前战斗图 <img>
    texImg: null,
    texMask: null,
    texKey: '',
    maskKey: '',
    draftMask: null, // 本机草稿遮罩（ImageBitmap / canvas / ImageData）
    draftMask2: null, // 本机草稿的遮罩 2（R 臀部）
    draftFor: null, // 草稿对应的原图地址
    t: 0,
    breath: 0,
    sy: 0,
    vy: 0,
    sx: 0,
    vx: 0,
  };
  const MOTION_PARAMS_KEY = 'motion-params'; // 按委托分开：qkey()
  const EDGE_KEY = 'tobatsu.edge';

  const motionCfg = () => Q.motion ?? {};
  /**
   * 两种模式：sync＝胸部跟着节奏指示器做完整的上下循环（滑块到顶＝胸部在最高、到底＝最低，一个来回一次）；
   * free＝不管节奏，只跟着呼吸自然起伏。URL 带 ?motion=free / ?motion=sync（套在任务墙里看外层地址）可以临时切
   */
  function motionMode() {
    const url = pageParam('motion');
    return url === 'free' || url === 'sync' ? url : (motionCfg().mode ?? 'sync');
  }

  /** 地址参数：先看自己的，再看外层任务墙页面的（套在 iframe 里时） */
  function pageParam(name) {
    const pick = (search) => new URLSearchParams(search).get(name);
    let v = pick(location.search);
    try {
      v = v || (window.parent !== window ? pick(window.parent.location.search) : null);
    } catch {}
    return v;
  }

  /**
   * 立绘档案：一张立绘相关的数值（图和遮罩、取景、锚点、特写、立绘动态的幅度……）都跟着图走，
   * 写在委托文件 quest-<编号>.jsonc 的 standee 里，层级和参数一样，载入时最后整个盖上去。
   * 地址加 ?standee=名字 可以临时换着看：写别的委托编号就借那份委托的立绘，写 test 用 common.jsonc 的测试立绘
   */
  async function applyStandeeProfile(own) {
    const url = pageParam('standee');
    let name = Q.quest.id;
    let profile = own;
    if (url && url !== name) {
      if (Q.standees?.[url]) {
        name = url;
        profile = Q.standees[url];
      } else if (Q.quests?.list?.includes(url)) {
        try {
          profile = (await loadJsonc(`quest-${url}.jsonc`)).standee;
          name = url;
        } catch (e) {
          emit('motion', { error: `借立绘失败：${e.message}` });
        }
      }
    }
    ST.fixed = !!url;
    if (!profile) return;
    Q = deepMerge(Q, profile);
    Q.standeeActive = name;
    ST.base = ST.active = name;
  }

  /**
   * 按组换战斗图：sets[n - 1].standee 写 standees 里的一个名字（委托文件或 common.jsonc 的 standees 段），
   * 这一组的准备 / 战斗 / 通过 / 败北与放弃结算就换成那张图的档案——战斗取景、遮罩、立绘动态的幅度、锚点、特写取景（STANDEE_PATHS 这几块）；
   * 无尽战斗看 endless.standee。委托单、剧情、暂停这些画面一律回到委托自己的立绘档案（剧情立绘 art.standee 不换）。
   * 地址带 ?standee= 的时候整局只用那一张，不换。换走之前把这张现在的数值存一份（调节器里改过的不丢），换回来原样放回去
   */
  // fx.watch / fx.pendulum（006）：这张图上的怀表——图里画着的那只（遮罩 2 的一层绕手摆）、叠在图前面的那只（单独一张怀表图）
  const STANDEE_PATHS = [['art', 'battleStandee'], ['motion'], ['fx', 'anchors'], ['fx', 'eyeBar'], ['fx', 'charm', 'visions', 'zoom'], ['fx', 'closeup'], ['fx', 'watch'], ['fx', 'pendulum']];
  const STANDEE_SCREENS = new Set(['prep', 'hold', 'pass', 'fall', 'lose', 'clear', 'endless', 'over', 'execute', 'executed']);
  const ST = { base: null, active: null, saved: new Map(), fixed: false };
  const getPath = (o, path) => path.reduce((v, k) => (v == null ? undefined : v[k]), o);
  function setPath(o, path, v) {
    let cur = o;
    for (const k of path.slice(0, -1)) cur = cur[k] && typeof cur[k] === 'object' ? cur[k] : (cur[k] = {});
    if (v === undefined) delete cur[path.at(-1)];
    else cur[path.at(-1)] = v;
  }
  const snapStandee = () => STANDEE_PATHS.map((path) => {
    const v = getPath(Q, path);
    return v === undefined ? undefined : clone(v);
  });
  /** 第 n 组（或无尽战斗）写的战斗图名字；没写 / 不认识就是 null */
  function standeeOf(n = S.set, endless = S.endless) {
    const name = endless ? endlessCfg().standee : Q.sets?.[n - 1]?.standee;
    return name && Q.standees?.[name] ? name : null;
  }
  function syncStandee() {
    if (!ST.base || ST.fixed) return;
    const want = (STANDEE_SCREENS.has(S.screen) && (S.shot || standeeOf())) || ST.base;
    if (want === ST.active) return;
    ST.saved.set(ST.active, snapStandee());
    const back = ST.saved.get(want);
    const snap = back ?? ST.saved.get(ST.base);
    STANDEE_PATHS.forEach((path, i) => setPath(Q, path, snap[i] === undefined ? undefined : clone(snap[i])));
    // 第一次换到这张：委托自己的档案打底，盖上这张的（写了 extends 的先铺上它说的那一张：同一张图、只有怀表挂法不一样的，不用整份抄一遍）
    if (!back) {
      const resolve = (name, depth = 0) => {
        const p = Q.standees[name];
        return p?.extends && Q.standees[p.extends] && depth < 4 ? deepMerge(resolve(p.extends, depth + 1), p) : p;
      };
      const profile = resolve(want);
      for (const path of STANDEE_PATHS) {
        const add = getPath(profile, path);
        if (add === undefined) continue;
        const cur = getPath(Q, path);
        const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
        setPath(Q, path, isObj(add) && isObj(cur) ? deepMerge(cur, add) : clone(add));
      }
    }
    ST.active = want;
    Q.standeeActive = want;
    currentSlot = null;
    emit('standee', { name: want, first: !back });
  }

  const VERT = `attribute vec2 aPos; uniform vec2 uCanvas; varying vec2 vPx;
    void main(){ vPx = vec2((aPos.x*0.5+0.5)*uCanvas.x, (0.5-aPos.y*0.5)*uCanvas.y); gl_Position = vec4(aPos,0.0,1.0); }`;
  const FRAG = `#ifdef GL_FRAGMENT_PRECISION_HIGH
    precision highp float;
    #else
    precision mediump float;
    #endif
    uniform sampler2D uImg; uniform sampler2D uMask; uniform sampler2D uMask2; uniform float uHasMask2;
    uniform vec4 uRect; uniform vec2 uImgSize;
    uniform float uBreath; uniform float uExpand; uniform float uCenterX;
    uniform vec2 uShake; uniform float uHair; uniform float uTime;
    uniform vec2 uBody; uniform float uStretch; uniform vec2 uChest;
    uniform float uUpper; uniform float uWaist; uniform float uFeather;
    uniform float uFlash; uniform vec4 uEcho; uniform vec2 uEchoC;
    uniform vec4 uReg; uniform vec2 uRegShake; uniform float uRegRot; uniform vec2 uRegPivot; uniform vec3 uRegCh; uniform float uRegLayer;
    uniform float uBodyRot; uniform vec2 uBodyPivot; uniform float uTorsoRot; uniform vec2 uTorsoPivot;
    uniform vec3 uEdge; uniform vec4 uShadow; uniform vec2 uShadowOff;
    uniform float uSoftR; uniform float uSoftRing; uniform float uSheer;
    uniform vec4 uSp; uniform vec4 uSpP; uniform vec2 uSpC; uniform vec4 uSpE; uniform vec3 uSpA; uniform vec3 uSpB;
    varying vec2 vPx;
    /*
     * 催眠螺旋（006；图案照下酒菜「催眠螺旋」那份 src/scripts/spiral/renderer.ts 搬的，两边各改各的）：
     *   uSp   x 垫在她身后的浓度 0–1、y 透叠到她身上 0–1、z 相位（转了多少圈）、w 图案（0 阿基米德 / 1 对数坠入 / 2 隧道 / 3 圆环 / 4 心形阿基米德（008））
     *   uSpP  x 臂数、y 密度、z 画布短边（像素）、w 柔和
     *   uSpC  中心（画布像素）、uSpE 眼睛 xy（原图像素）+ 离眼睛多远开始加深、多远加到满（透叠时脸上扫得浅一些）、uSpA / uSpB 亮暗两色
     * 这套着色器是 WebGL1，没有 fwidth：条纹边缘的宽度按相位的梯度算（中心密到分不开的地方自然糊成中间色）
     */
    float spStripe(){
      vec2 p = (vPx - uSpC) / uSpP.z;
      float r = length(p) + 0.00001;
      float turns = atan(p.y, p.x) / 6.2831853 * uSpP.x;
      float ga = uSpP.x / (6.2831853 * r);
      float tw = uSpP.y;
      float v; float g;
      if (uSp.w < 0.5) { v = turns + tw * r * 3.0; g = length(vec2(ga, tw * 3.0)); }
      else if (uSp.w < 1.5) { v = turns + tw * log(r); g = length(vec2(ga, tw / r)); }
      else if (uSp.w < 2.5) { v = turns + tw * 0.15 / r; g = length(vec2(ga, tw * 0.15 / (r * r))); }
      else if (uSp.w < 3.5) { v = tw * r * 3.0; g = tw * 3.0; }
      else {
        // 心形阿基米德（008）：半径按心形量——上面中间凹进去、下面收成尖，等半径的线是一颗颗心（屏幕 y 朝下，先翻过来）
        float th = atan(-p.y, p.x);
        float dTop = (th - 1.5707963) / 0.42;
        float dBot = (th + 1.5707963) / 0.34;
        float hs = 1.0 - 0.22 * sin(th) - 0.3 * exp(-dTop * dTop) + 0.26 * exp(-dBot * dBot);
        float rh = r / hs;
        v = turns + tw * rh * 3.0; g = length(vec2(ga, tw * 3.0 / hs));
      }
      float e = g / uSpP.z * 7.5 + uSpP.w;
      return smoothstep(-e, e, sin((v - uSp.z) * 6.2831853));
    }
    // 立绘画完之后：亮条纹像光、暗条纹像影子扫过她身上（uSp.y，face＝脸上打几折），再把螺旋垫在她身后（uSp.x）
    vec4 spFinish(vec4 c, float face){
      if (uSp.x <= 0.002 && uSp.y <= 0.002) return c;
      float m = spStripe();
      if (uSp.y > 0.002 && c.a > 0.002) {
        vec3 bc = c.rgb / c.a;
        vec3 hi = 1.0 - (1.0 - bc) * (1.0 - uSpA * 0.38);
        vec3 lo = bc * mix(vec3(1.0), uSpB + 0.3, 0.5);
        c.rgb = mix(bc, mix(lo, hi, m), uSp.y * face) * c.a;
      }
      vec3 col = mix(uSpB, uSpA, m);
      if (uSp.w > 1.5 && uSp.w < 2.5) {
        float rc = length((vPx - uSpC) / uSpP.z);
        col *= clamp(pow(rc * 1.6, 0.8), 0.0, 1.0) * (1.0 - 0.3 * smoothstep(0.6, 1.0, rc));
      }
      return c + vec4(col, 1.0) * (uSp.x * (1.0 - c.a));
    }
    vec4 sampleImg(vec2 p){
      if (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) return vec4(0.0);
      return texture2D(uImg, p);
    }
    /*
     * 取遮罩权重。uSoftR>0 时按这个半径（原图像素）把遮罩临时糊开：3x3 高斯，9 个点。
     * 为什么要糊：位移是「这一点的权重 x 摇幅」，所以位移场的陡度 = 摇幅 x 遮罩的梯度。
     * 摇幅一旦超过遮罩边缘的羽化宽度，相邻两个像素就会去采样到隔得很远的两块皮——
     * 画面上就是一块凸起 / 撕裂（形变的雅可比行列式变负，折叠了）。
     * 把遮罩按摇幅一起糊开，羽化宽度就永远追得上摇幅；小幅度时 uSoftR=0，遮罩还是原来那么利落
     */
    vec3 maskAt(sampler2D tex, vec2 p){
      if (uSoftR < 0.5) return texture2D(tex, p).rgb;
      vec2 r = vec2(uSoftR) / uImgSize;
      /*
       * 环形（uSoftRing，shake.soften.knee 打开时）：中心 + 两圈各 8 个点（0.87r、1.74r，外圈错开 22.5°），高斯权重，宽度和下面的 3x3 一样。
       * 3x3 的三个点隔 r 一个，r 比遮罩的羽化宽的时候糊出来是三级台阶——位移挤在三条线上，大幅度时胸下缘一道道褶；环形的点隔得密，糊出来是一整条坡
       */
      if (uSoftRing > 0.5) {
        vec3 a = texture2D(tex, p).rgb;
        for (int k = 0; k < 8; k++) {
          float ang = float(k) * 0.7853982;
          a += texture2D(tex, p + vec2(cos(ang), sin(ang)) * r * 0.87).rgb * 0.6065307;
          a += texture2D(tex, p + vec2(cos(ang + 0.3926991), sin(ang + 0.3926991)) * r * 1.74).rgb * 0.1353353;
        }
        return a / 6.9934;
      }
      vec3 s = texture2D(tex, p).rgb * 4.0;
      s += (texture2D(tex, p + vec2(r.x, 0.0)).rgb + texture2D(tex, p - vec2(r.x, 0.0)).rgb
          + texture2D(tex, p + vec2(0.0, r.y)).rgb + texture2D(tex, p - vec2(0.0, r.y)).rgb) * 2.0;
      s += texture2D(tex, p + r).rgb + texture2D(tex, p - r).rgb
         + texture2D(tex, p + vec2(r.x, -r.y)).rgb + texture2D(tex, p + vec2(-r.x, r.y)).rgb;
      return s / 16.0;
    }
    // 把 v 绕原点转 a 弧度之后多出来的位移
    vec2 turn(vec2 v, float a){ float c = cos(a); float s = sin(a); return vec2(c * v.x - s * v.y, s * v.x + c * v.y) - v; }
    // 分层的区域（晃腿，uRegLayer）：遮罩 2 那一块当成单独一层——原位置抠掉，绕 uRegPivot 转过 uRegRot 再叠上来。
    // 按「这个像素在不在区域里」位移的话，腿转出原来的范围那一截不跟着动（像被遮罩挡住）；
    // 只在最后叠一次的话，边缘处理（柔影、收边）还按腿原来的位置算，腿晃开后背景上留一圈边（站主 2026-09-17 两次发现）。
    // 所以取色、边缘处理、残影一律从这里取，影子和收边都跟着腿走
    vec4 sampleAll(vec2 p){
      vec4 c0 = sampleImg(p);
      if (uRegLayer < 0.5 || uHasMask2 < 0.5 || uReg.z <= 0.0) return c0;
      float m0 = (p.x < 0.0 || p.y < 0.0 || p.x > 1.0 || p.y > 1.0) ? 0.0 : dot(texture2D(uMask2, p).rgb, uRegCh);
      vec2 rel = p * uImgSize - uRegPivot;
      vec2 q = (uRegPivot + rel + turn(rel, -uRegRot) + uRegShake) / uImgSize;
      float m1 = (q.x < 0.0 || q.y < 0.0 || q.x > 1.0 || q.y > 1.0) ? 0.0 : dot(texture2D(uMask2, q).rgb, uRegCh);
      vec4 part = sampleImg(q) * m1;
      return part + c0 * (1.0 - m0) * (1.0 - part.a);
    }
    void main(){
      vec2 uv = (vPx - uRect.xy) / uRect.zw;
      if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { gl_FragColor = spFinish(vec4(0.0), 1.0); return; }
      vec3 m = maskAt(uMask, uv);
      vec2 ip = uv * uImgSize;
      vec2 d = vec2(0.0);
      d.y -= uBreath * m.g;
      d.x += (ip.x - uCenterX) * uExpand * m.g;
      d += uShake * m.r;
      // 拉伸：往下甩的时候纵向拉长、横向收一点，往上反过来（以胸部遮罩的重心为中心）
      d.y += (ip.y - uChest.y) * uStretch * m.r;
      d.x -= (ip.x - uChest.x) * uStretch * 0.5 * m.r;
      // 连带：躯干（呼吸区）跟着晃一点
      d += uBody * m.g;
      // 上半身：腰线以上整体跟着起落，腰线以下不动，中间 feather 这一段渐变
      d.y += uUpper * (1.0 - smoothstep(uWaist - uFeather, uWaist + uFeather, ip.y));
      d.x += uHair * m.b * (0.75 + 0.25 * sin(ip.y * 0.01 - uTime * 2.3));
      // 身体姿态：整张图绕 uBodyPivot（脚）转 uBodyRot，腰线以上再绕 uTorsoPivot（腰）转 uTorsoRot——
      // 两个反着转，胯往一边送、上半身往回收一点，像扭胯时身体的 S 形
      if (uBodyRot != 0.0 || uTorsoRot != 0.0) {
        d += turn(ip - uBodyPivot, uBodyRot);
        d += turn(ip - uTorsoPivot, uTorsoRot) * (1.0 - smoothstep(uWaist - uFeather, uWaist + uFeather, ip.y));
      }
      // 区域摇动（臀部等）：有遮罩 2 就用它的 R 通道当权重；没有就用软边椭圆，中心 uReg.xy、半径 uReg.zw（原图像素）。
      // 位移 = 平移 uRegShake + 绕 uRegPivot 转 uRegRot 弧度（扭屁股：绕腰转出去）
      // 分层模式（uRegLayer，晃腿）不在这里位移，取完色之后单独叠（见下面）
      bool regLayer = uRegLayer > 0.5 && uHasMask2 > 0.5 && uReg.z > 0.0;
      if (uReg.z > 0.0 && !regLayer) {
        float wr = uHasMask2 > 0.5 ? dot(maskAt(uMask2, uv), uRegCh) : 1.0 - smoothstep(0.3, 1.0, length((ip - uReg.xy) / uReg.zw));
        d += (uRegShake + turn(ip - uRegPivot, uRegRot)) * wr;
      }
      vec2 suv = (ip - d) / uImgSize;
      vec4 c = sampleAll(suv);
      // 边缘处理（盖住抠图留下的毛边，不描线）：
      //   收边 uEdge.x：往里收这么多屏幕像素，最外面那一圈毛边变透明；
      //   去色 uEdge.y：边缘像素的颜色换成往里这么远、最不透明的那个点的颜色，底色残留就没了；
      //   阴影 uShadow（颜色 + 浓淡）/ uEdge.z（柔化半径）/ uShadowOff（偏移）：图后面一圈柔和的影子或外发光，边缘融进背景。
      // 先在最大半径上看上下左右四个点，全在图里面或全在外面就跳过（绝大多数像素）
      if (uEdge.x > 0.0 || uEdge.y > 0.0 || uShadow.a > 0.0) {
        vec2 px = 1.0 / uRect.zw;
        float rr = max(uEdge.z + length(uShadowOff), max(uEdge.x, uEdge.y)) + 1.0;
        float q1 = sampleAll(suv + vec2(rr, 0.0) * px).a;
        float q2 = sampleAll(suv - vec2(rr, 0.0) * px).a;
        float q3 = sampleAll(suv + vec2(0.0, rr) * px).a;
        float q4 = sampleAll(suv - vec2(0.0, rr) * px).a;
        float mx = max(c.a, max(max(q1, q2), max(q3, q4)));
        float mn = min(c.a, min(min(q1, q2), min(q3, q4)));
        if (mx > 0.004 && mn < 0.996) {
          float er = c.a;
          vec4 best = c;
          float sh = 0.0;
          vec2 so = suv - uShadowOff * px;
          for (int i = 0; i < 8; i++) {
            float ang = float(i) * 0.7854;
            vec2 dir = vec2(cos(ang), sin(ang));
            if (uEdge.x > 0.0) er = min(er, sampleAll(suv + dir * uEdge.x * px).a);
            vec4 sp = sampleAll(suv + dir * uEdge.y * px);
            if (sp.a > best.a) best = sp;
            vec2 d2 = vec2(cos(ang + 0.3927), sin(ang + 0.3927));
            sh += sampleAll(so + dir * uEdge.z * px).a + sampleAll(so + d2 * uEdge.z * 0.5 * px).a;
          }
          sh = (sh + sampleAll(so).a * 2.0) / 18.0;
          vec3 col = c.a > 0.001 ? c.rgb / c.a : vec3(0.0);
          vec3 bestCol = best.a > 0.001 ? best.rgb / best.a : col;
          // 轻纱（uSheer，008）：半透明的纱整片都「不实」，按绝对值收边会把纱的中间也削掉一层、越淡削得越多；
          // 改成和自己比——周围和自己一样淡就不动，只有挨着全透明的那一圈外缘才收、才取里面的颜色
          float keep = uSheer > 0.5 ? (c.a > 0.001 ? min(1.0, er / c.a) : 0.0) : er;
          col = mix(col, bestCol, 1.0 - smoothstep(0.55, 1.0, uSheer > 0.5 ? keep : c.a * er));
          float a = uEdge.x > 0.0 ? c.a * smoothstep(0.05, 0.95, keep) : c.a;
          c = vec4(col * a, a);
          c += vec4(uShadow.rgb, 1.0) * (uShadow.a * sh) * (1.0 - c.a);
        }
      }
      // 残影：同一张（已形变的）图以 uEchoC 为中心放大、半透明，用滤色叠上去（只提亮不盖掉原图），粉 / 紫偏光
      if (uEcho.y > 0.001) {
        vec2 ec = uEchoC / uImgSize;
        vec4 e1 = sampleAll((suv - ec) / uEcho.x + ec) * uEcho.y;
        e1.rgb *= vec3(1.0, 0.72, 0.9);
        c = c + e1 - c * e1;
      }
      if (uEcho.w > 0.001) {
        vec2 ec = uEchoC / uImgSize;
        vec4 e2 = sampleAll((suv - ec) / uEcho.z + ec) * uEcho.w;
        e2.rgb *= vec3(0.82, 0.66, 1.0);
        c = c + e2 - c * e2;
      }
      // 闪光：往粉白里提亮一点
      c.rgb = mix(c.rgb, vec3(1.0, 0.86, 0.94) * c.a, clamp(uFlash, 0.0, 1.0));
      c = spFinish(vec4(min(c.rgb, vec3(c.a)), c.a), mix(0.5, 1.0, smoothstep(uSpE.z, uSpE.w, length(suv * uImgSize - uSpE.xy))));
      gl_FragColor = vec4(min(c.rgb, vec3(c.a)), c.a);
    }`;

  /** 在一个 canvas 上建一套立绘着色器；主画面一套，特写 cut-in 再建一套（fx.js） */
  function createRenderer(canvas) {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: true, alpha: true, antialias: false });
    if (!gl) throw new Error('没有 WebGL');
    {
      const shader = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh));
        return sh;
      };
      const prog = gl.createProgram();
      gl.attachShader(prog, shader(gl.VERTEX_SHADER, VERT));
      gl.attachShader(prog, shader(gl.FRAGMENT_SHADER, FRAG));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      const loc = {};
      for (const name of ['uImg', 'uMask', 'uMask2', 'uHasMask2', 'uRect', 'uImgSize', 'uBreath', 'uExpand', 'uCenterX', 'uShake', 'uHair', 'uTime', 'uCanvas', 'uBody', 'uStretch', 'uChest', 'uUpper', 'uWaist', 'uFeather', 'uFlash', 'uEcho', 'uEchoC', 'uReg', 'uRegShake', 'uRegRot', 'uRegPivot', 'uRegCh', 'uRegLayer', 'uBodyRot', 'uBodyPivot', 'uTorsoRot', 'uTorsoPivot', 'uEdge', 'uShadow', 'uShadowOff', 'uSoftR', 'uSoftRing', 'uSheer', 'uSp', 'uSpP', 'uSpC', 'uSpE', 'uSpA', 'uSpB']) {
        loc[name] = gl.getUniformLocation(prog, name);
      }
      gl.uniform1i(loc.uImg, 0);
      gl.uniform1i(loc.uMask, 1);
      gl.uniform1i(loc.uMask2, 2);
      // 遮罩 2 先放一个 1×1 的黑像素，没配遮罩 2 的时候纹理单元也是完整的（不然有的浏览器会刷警告）
      const texMask2 = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texMask2);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      return { gl, prog, canvas, loc, texImg: gl.createTexture(), texMask: gl.createTexture(), texMask2, hasMask2: false, texKey: '', maskKey: '' };
    }
  }

  function motionInit() {
    if (MV.ok !== null) return MV.ok;
    MV.ok = false;
    try {
      const canvas = document.createElement('canvas');
      canvas.className = 'art-gl';
      Object.assign(MV, createRenderer(canvas));
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        MV.ok = false;
        MV.reason = 'WebGL 上下文丢了';
        motionSync();
      });
      $('art').insertBefore(canvas, $('art-flash'));
      MV.ok = true;
    } catch (e) {
      MV.reason = `WebGL 初始化失败：${e.message}`;
    }
    return MV.ok;
  }

  function upload(tex, source, { premultiply }, gl = MV.gl) {
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, premultiply ? gl.BROWSER_DEFAULT_WEBGL : gl.NONE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
   * 当前战斗图的遮罩地址（立绘档案）：battleStandee.mask，或 battle.<槽> 写成 { src, mask }。
   * key＝'mask2' 取遮罩 2（R 臀部；G / B 留给以后的部位）
   */
  function maskSrcFor(imgSrc, key = 'mask') {
    const art = Q.art ?? {};
    const same = (a, b) => a && b && new URL(a, location.href).href === new URL(b, location.href).href;
    if (same(art.battleStandee?.src, imgSrc)) return art.battleStandee[key] || null;
    for (const v of Object.values(art.battle ?? {})) if (v && typeof v === 'object' && same(v.src, imgSrc)) return v[key] || null;
    return null;
  }

  const maskImages = new Map();
  function loadMaskImage(src) {
    if (!maskImages.has(src)) {
      maskImages.set(
        src,
        new Promise((ok, bad) => {
          const im = new Image();
          im.onload = () => ok(im);
          im.onerror = () => bad(new Error(`遮罩读不到：${src}`));
          im.src = src;
        }),
      );
    }
    return maskImages.get(src);
  }

  /** 按当前画面、当前图决定开不开 WebGL 层 */
  async function motionSync() {
    const img = $('art-img').querySelector('img');
    const want = motionCfg().enabled !== false && !reduce.matches && MOTION_SCREENS.has(S.screen) && img;
    const src = img?.getAttribute('src');
    const hasDraft = MV.draftMask && MV.draftFor && src && new URL(MV.draftFor, location.href).href === new URL(src, location.href).href;
    const maskSrc = src && !hasDraft ? maskSrcFor(src) : null;
    if (!want || !(hasDraft || maskSrc) || !motionInit()) return motionOff(want ? MV.reason || '这张图没配遮罩' : '');
    MV.img = img;
    try {
      if (!img.complete || !img.naturalWidth) await new Promise((ok) => img.addEventListener('load', ok, { once: true }));
      // 每张战斗图各留一份贴图（图、遮罩、胸部重心）：组里来回换图（006 镜头关键帧的 standee）时换回来不用重新上传
      const slots = (MV.texSlots ??= new Map());
      let slot = slots.get(src);
      if (!slot) {
        slot = { img: MV.gl.createTexture(), mask: MV.gl.createTexture(), maskKey: '', chest: null };
        upload(slot.img, img, { premultiply: true });
        slots.set(src, slot);
      }
      const key = hasDraft ? `draft:${MV.draftVersion}` : maskSrc;
      if (slot.maskKey !== key) {
        const source = hasDraft ? MV.draftMask : await loadMaskImage(maskSrc);
        upload(slot.mask, source, { premultiply: false });
        slot.chest = chestCenter(source, img.naturalWidth, img.naturalHeight);
        slot.maskKey = key;
      }
      MV.texImg = slot.img;
      MV.texMask = slot.mask;
      MV.chest = slot.chest;
      MV.texKey = src;
      MV.maskKey = key;
    } catch (e) {
      return motionOff(e.message);
    }
    if ($('art-img').querySelector('img') !== img) return; // 等载入的时候又换了图
    MV.active = true;
    MV.reason = '';
    $('art').classList.add('gl-on');
  }

  /** 胸部（R 通道）的加权重心，原图像素；拉伸以它为中心 */
  function chestCenter(source, iw, ih) {
    try {
      const c = document.createElement('canvas');
      c.width = 96;
      c.height = 144;
      const x = c.getContext('2d', { willReadFrequently: true });
      if (source instanceof ImageData || source?.data) {
        const t = document.createElement('canvas');
        t.width = source.width;
        t.height = source.height;
        t.getContext('2d').putImageData(source, 0, 0);
        source = t;
      }
      x.drawImage(source, 0, 0, c.width, c.height);
      const d = x.getImageData(0, 0, c.width, c.height).data;
      let sw = 0;
      let sx = 0;
      let sy = 0;
      for (let j = 0; j < c.height; j++) {
        for (let i = 0; i < c.width; i++) {
          const w = d[(j * c.width + i) * 4];
          sw += w;
          sx += w * i;
          sy += w * j;
        }
      }
      if (!sw) return [iw / 2, ih / 3];
      return [((sx / sw + 0.5) / c.width) * iw, ((sy / sw + 0.5) / c.height) * ih];
    } catch {
      return [iw / 2, ih / 3];
    }
  }

  function motionOff(reason = '') {
    MV.active = false;
    MV.reason = reason;
    $('art').classList.remove('gl-on');
  }

  /** 图在 .ph 里的摆放（css px）：取景图读 placeFramed 写的 style；整张战斗图按 cover + 50% 20% 算 */
  function imageRect(img) {
    const box = $('art');
    if (img.classList.contains('framed')) {
      return [parseFloat(img.style.left) || 0, parseFloat(img.style.top) || 0, parseFloat(img.style.width) || 0, parseFloat(img.style.height) || 0];
    }
    const bw = box.clientWidth;
    const bh = box.clientHeight;
    const s = Math.max(bw / img.naturalWidth, bh / img.naturalHeight);
    const w = img.naturalWidth * s;
    const h = img.naturalHeight * s;
    return [(bw - w) * 0.5, (bh - h) * 0.2, w, h];
  }

  const phaseScale = () => {
    const ps = motionCfg().shake?.phaseScale ?? {};
    return ps[S.phase] ?? 1;
  };

  /** 冲量：kind＝top / bottom / cutin / art / heartbeat（原图像素每秒） */
  function kick(kind) {
    const sh = motionCfg().shake ?? {};
    const base = sh.impulse?.[kind] ?? 0;
    if (motionMode() === 'free') return; // 自然呼吸模式不接任何外部冲量
    jiggleSound(kind);
    if (!base) return;
    const v = base * phaseScale();
    const dir = kind === 'bottom' || kind === 'art' ? 1 : -1;
    MV.vy += dir * v;
    MV.vx += (Math.random() * 2 - 1) * v * (sh.sideways ?? 0.12);
  }

  /** 物理一步：呼吸相位、弹簧追目标。主画面或特写 cut-in 有人在用就跑 */
  function motionStep(dtReal) {
    const cfg = motionCfg();
    const br = cfg.breathe ?? {};
    const sh = cfg.shake ?? {};
    const hr = cfg.hair ?? {};
    const dt = Math.min(0.05, Math.max(0, dtReal));
    MV.t += dt;
    const rate = br.rate?.[S.phase] ?? 1;
    MV.breath += (dt * rate * Math.PI * 2) / Math.max(0.5, br.period ?? 4.2);

    // 阻尼弹簧，分 4 步积分。画的时候用 tanh 软上限：越接近 maxOffset 越推不动，不会硬生生卡住
    const k = sh.stiffness ?? 90;
    const c = sh.damping ?? 7;
    const max = sh.maxOffset ?? 60;
    // 目标位置（原图像素，负＝往上）：sync 跟节奏滑块的位置走一个完整的上下来回；
    // free 或者节奏没在跑（准备倒数、通过）时跟呼吸走。胸部用弹簧去追这个目标——追不上、过冲、回弹，就是晃
    const cy = cfg.cycle ?? {};
    const rhythmOn = motionMode() === 'sync' && RH.active && (S.screen === 'hold' || S.screen === 'endless' || S.screen === 'execute');
    const target = rhythmOn ? (cy.amp ?? 30) * phaseScale() * (1 - 2 * RH.pos) : -(cy.freeAmp ?? 12) * Math.sin(MV.breath);
    MV.target = MV.target === undefined ? target : MV.target + (target - MV.target) * Math.min(1, dt * 12);
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      MV.vy += (k * (MV.target - MV.sy) - c * MV.vy) * h;
      MV.vx += (-k * MV.sx - c * MV.vx) * h;
      MV.sy += MV.vy * h;
      MV.sx += MV.vx * h;
    }
    // 真的飞太远（连续大冲量）就拉回来，免得数值炸掉
    const hard = max * 3;
    if (Math.abs(MV.sy) > hard) (MV.sy = Math.sign(MV.sy) * hard), (MV.vy *= 0.5);
    if (Math.abs(MV.sx) > hard) (MV.sx = Math.sign(MV.sx) * hard), (MV.vx *= 0.5);
    const showY = max * Math.tanh(MV.sy / max);
    const showX = max * Math.tanh(MV.sx / max);
    MV.pose = {
      showX,
      showY,
      breathS: Math.sin(MV.breath),
      hair: (hr.amp ?? 3) * Math.sin((MV.t * Math.PI * 2) / Math.max(0.5, hr.period ?? 3.4)) + (hr.follow ?? 0.35) * (showX + 0.4 * showY),
      upper: (cy.upperFollow ?? 0.35) * MV.target,
    };
  }

  /**
   * 画一帧立绘。R＝渲染器；rect＝图在 canvas 里的位置（css px）；fx＝附加效果
   * （flash 0–1、echo [放大, 透明度, 放大, 透明度]、echoC 原图坐标、jiggle 摇动倍数、
   *   pose 用自己的摇动状态代替 MV.pose、region { c: [x, y], r: [rx, ry], shake: [dx, dy], rot: 弧度, pivot: [x, y] } 区域摇动 / 绕点转、
   *   body { rot, pivot, torsoRot, torsoPivot } 整个身体绕脚转 + 腰线以上反着转、
   *   spiral { alpha 垫在身后的浓度, wash 透叠到她身上, phase 转了多少圈, mode, arms, twist, soft, center [x, y] 原图像素, eyes [x, y], face [起, 止] 脸上浅的范围, c1 / c2 [r, g, b] 0–1 } 催眠螺旋（006））
   */
  function drawStandee(R, img, rect, fx = {}) {
    const { gl, canvas, loc } = R;
    const cfg = motionCfg();
    const br = cfg.breathe ?? {};
    const sh = cfg.shake ?? {};
    const cy = cfg.cycle ?? {};
    const dpr = pixelRatio();
    const cw = Math.round(canvas.clientWidth * dpr);
    const ch = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    const P = fx.pose ?? MV.pose;
    if (!img?.naturalWidth || !cw || !ch || !P) return;
    const [x, y, w, hgt] = rect;
    const j = fx.jiggle ?? 1;
    const showX = P.showX * j;
    const showY = P.showY * j;
    const body = sh.bodyFollow ?? 0.2;
    // 拉伸：squashKnee 以上越拉越拉不动（最多再多 0.03）——摇到最大时胸不会被拉成长条（007）
    const stretchRaw = ((sh.squash ?? 0.35) * showY) / 100;
    const sk = sh.squashKnee;
    const stretch = sk > 0 && Math.abs(stretchRaw) > sk ? Math.sign(stretchRaw) * (sk + 0.03 * Math.tanh((Math.abs(stretchRaw) - sk) / 0.03)) : stretchRaw;
    const chest = MV.chest ?? [img.naturalWidth / 2, img.naturalHeight / 3];
    const upper = P.upper * (fx.upperScale ?? 1);
    const waist = cy.waistY ?? Q.art?.battleStandee?.waistY ?? img.naturalHeight * 0.4;
    const cx = cfg.centerX ?? Q.art?.battleStandee?.centerX ?? img.naturalWidth / 2;
    const echo = fx.echo ?? [1, 0, 1, 0];
    const echoC = fx.echoC ?? chest;

    gl.viewport(0, 0, cw, ch);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, R.texImg);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, R.texMask);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, R.texMask2);
    gl.uniform1f(loc.uHasMask2, R.hasMask2 ? 1 : 0);
    gl.uniform2f(loc.uCanvas, cw, ch);
    gl.uniform4f(loc.uRect, x * dpr, y * dpr, w * dpr, hgt * dpr);
    gl.uniform2f(loc.uImgSize, img.naturalWidth, img.naturalHeight);
    gl.uniform1f(loc.uBreath, (br.amp ?? 5) * P.breathS);
    gl.uniform1f(loc.uExpand, (br.expand ?? 0.006) * P.breathS);
    gl.uniform1f(loc.uCenterX, cx);
    gl.uniform2f(loc.uShake, showX, showY - upper);
    gl.uniform2f(loc.uBody, showX * body, showY * body);
    gl.uniform1f(loc.uStretch, stretch);
    gl.uniform2f(loc.uChest, chest[0], chest[1]);
    gl.uniform1f(loc.uUpper, upper);
    gl.uniform1f(loc.uWaist, waist);
    gl.uniform1f(loc.uFeather, cy.feather ?? 160);
    gl.uniform1f(loc.uHair, P.hair);
    gl.uniform1f(loc.uTime, MV.t);
    gl.uniform1f(loc.uFlash, fx.flash ?? 0);
    gl.uniform4f(loc.uEcho, echo[0], echo[1], echo[2], echo[3]);
    gl.uniform2f(loc.uEchoC, echoC[0], echoC[1]);
    let reg = fx.region;
    let bodyPose = fx.body;
    /*
     * motion.drive: "hips"（008，站主 2026-10-23：平胸的立绘不做乳摇，只做臀部）：主画面没有自己的区域摇动时，
     * 胸部那根弹簧的摇幅（跟着节奏轨上下、cut-in 的冲量）交给臀部——整张图绕脚往一边转、腰线以上反着转回来一点（扭胯的 S 形），
     * 臀部区域（遮罩 2 · R）再绕腰多扭一点、往外往上送一点。算法同 fx.95ba3bedf1.js 的臀部特写；参数在 motion.hips
     */
    if (cfg.drive === 'hips' && !reg && !bodyPose && !fx.pose) {
      const hc = cfg.hips ?? {};
      const an = Q.fx?.anchors ?? {};
      const hp = Array.isArray(an.hips) ? an.hips : [img.naturalWidth / 2, img.naturalHeight * 0.48];
      const waistPt = Array.isArray(an.waist) ? an.waist : [hp[0], hp[1] - 150];
      const feetPt = Array.isArray(an.feet) ? an.feet : [hp[0], img.naturalHeight * 0.97];
      const m = P.showY * j;
      const sd = hc.side === 'left' ? -1 : 1;
      const bodyRot = sd * m * (hc.bodyTwist ?? 0.0009);
      bodyPose = { rot: bodyRot, pivot: feetPt, torsoRot: -bodyRot * (hc.torsoCounter ?? 1.6), torsoPivot: waistPt };
      reg = {
        c: hp,
        r: hc.radius ?? [260, 170],
        shake: [sd * m * (hc.jiggle ?? 0.35), -Math.abs(m) * (hc.jiggle ?? 0.35) * (hc.lift ?? 0.4)],
        rot: -sd * m * (hc.twist ?? 0.0012),
        pivot: waistPt,
      };
    }
    /*
     * 大幅度摇动时把遮罩糊开多少（原图像素，0＝不糊）。位移超过遮罩边缘的羽化宽度就会折叠——
     * 画面上是一块凸起、一块撕裂（站主 2026-09-21 在 002、004 的特写里看到的）。
     * 四张立绘的胸部遮罩最陡处 18–22px，而摇幅上限 26–32px，所以大幅度必折；
     * 按摇幅把遮罩一起糊开，羽化就永远追得上（scale 0.9 是实测能让四张图都不折的最小值，再大只是白白扩散）。
     * 小幅度（start 以下）完全不糊，原来调好的手感一点不变。关掉：shake.soften.scale = 0
     */
    const soften = sh.soften ?? {};
    const swing = Math.hypot(showX, showY - upper) + Math.abs(stretchRaw) * 60;
    /*
     * knee（007，站主 2026-10-19：摇到最大幅度还是不自然）：摇幅过了 maxOffset 的 kneeFrom（默认 0.6）之后，糊开的半径再按平方往上加——
     * 平常的幅度一点不变；到顶的那一下位移摊在更宽的一条坡上，胸下缘不再被挤扁 / 拉长（scripts/art/tobatsu-mask-check.mjs 量 det：0.23–0.38 → 0.57–0.63）。
     * 打开 knee 的同时糊法换成环形（见着色器 maskAt）
     */
    const knee = Math.max(0, swing - (soften.kneeFrom ?? 0.6) * (sh.maxOffset ?? 60));
    gl.uniform1f(loc.uSoftR, Math.max(0, swing - (soften.start ?? 4)) * (soften.scale ?? 0.9) + knee * knee * (soften.knee ?? 0));
    gl.uniform1f(loc.uSoftRing, soften.knee > 0 ? 1 : 0);
    gl.uniform4f(loc.uReg, reg?.c[0] ?? 0, reg?.c[1] ?? 0, reg?.r[0] ?? 0, reg?.r[1] ?? 1);
    gl.uniform2f(loc.uRegShake, reg?.shake[0] ?? 0, reg?.shake[1] ?? 0);
    gl.uniform1f(loc.uRegRot, reg?.rot ?? 0);
    gl.uniform2f(loc.uRegPivot, reg?.pivot?.[0] ?? 0, reg?.pivot?.[1] ?? 0);
    // 权重取遮罩 2 的哪个通道：默认 R（臀部），晃腿是 G
    const regCh = reg?.ch ?? [1, 0, 0];
    gl.uniform3f(loc.uRegCh, regCh[0], regCh[1], regCh[2]);
    gl.uniform1f(loc.uRegLayer, reg?.layer ? 1 : 0);
    // 边缘处理（common.jsonc art.edge，长度按 CSS 像素）
    const eg = edgeCfg();
    gl.uniform3f(loc.uEdge, eg.choke * dpr, eg.decontam * dpr, eg.size * dpr);
    gl.uniform1f(loc.uSheer, eg.sheer ? 1 : 0);
    gl.uniform4f(loc.uShadow, eg.rgb[0], eg.rgb[1], eg.rgb[2], eg.opacity);
    gl.uniform2f(loc.uShadowOff, eg.offset[0] * dpr, eg.offset[1] * dpr);
    const pose = bodyPose;
    gl.uniform1f(loc.uBodyRot, pose?.rot ?? 0);
    gl.uniform2f(loc.uBodyPivot, pose?.pivot?.[0] ?? 0, pose?.pivot?.[1] ?? 0);
    gl.uniform1f(loc.uTorsoRot, pose?.torsoRot ?? 0);
    gl.uniform2f(loc.uTorsoPivot, pose?.torsoPivot?.[0] ?? 0, pose?.torsoPivot?.[1] ?? 0);
    // 催眠螺旋（fx.js 的 hypnoSpiral 每帧给；没给或全是 0 就不画）
    const sp = fx.spiral;
    if (sp && (sp.alpha > 0.002 || sp.wash > 0.002)) {
      const sc = sp.center ?? [img.naturalWidth / 2, img.naturalHeight / 3];
      const se = sp.eyes ?? sc;
      gl.uniform4f(loc.uSp, sp.alpha, sp.wash, sp.phase % 1, sp.mode ?? 0);
      gl.uniform4f(loc.uSpP, sp.arms ?? 2, sp.twist ?? 4, Math.min(cw, ch), sp.soft ?? 0);
      gl.uniform2f(loc.uSpC, (x + (sc[0] / img.naturalWidth) * w) * dpr, (y + (sc[1] / img.naturalHeight) * hgt) * dpr);
      gl.uniform4f(loc.uSpE, se[0], se[1], sp.face?.[0] ?? 40, sp.face?.[1] ?? 340);
      gl.uniform3f(loc.uSpA, sp.c1[0], sp.c1[1], sp.c1[2]);
      gl.uniform3f(loc.uSpB, sp.c2[0], sp.c2[1], sp.c2[2]);
    } else gl.uniform4f(loc.uSp, 0, 0, 0, 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  /**
   * 边缘处理参数：art.edge { choke 收边, decontam 去色（CSS 像素）, shadow { color, opacity, size, offset: [x, y] } }；
   * 调节器「立绘」页可以调（改的是 Q.art.edge，每帧读）
   */
  let edgeCache = null;
  function edgeCfg() {
    const e = Q.art?.edge ?? {};
    const key = JSON.stringify(e) + PERF.edge;
    if (edgeCache?.key === key) return edgeCache;
    const sh = e.shadow ?? {};
    const hex = String(sh.color ?? '#140c28').replace('#', '');
    const n = parseInt(hex.length === 3 ? [...hex].map((ch) => ch + ch).join('') : hex, 16) || 0;
    // 性能档：中档关影子（最费的一步），低档边缘处理全关
    const off = e.enabled === false || PERF.edge === 'off';
    edgeCache = {
      key,
      choke: off ? 0 : (e.choke ?? 0.8),
      // 立绘上有半透明的纱（008）：收边只削外缘（着色器的 uSheer）
      sheer: !!e.sheer,
      decontam: off ? 0 : (e.decontam ?? 1.5),
      rgb: [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255],
      opacity: off || sh.enabled === false || PERF.edge === 'noShadow' ? 0 : (sh.opacity ?? 0.35),
      size: sh.size ?? 5,
      offset: sh.offset ?? [0, 0],
    };
    return edgeCache;
  }

  /** 每帧：有人用就跑物理；主画面、剧情立绘开着就画；再让 fx.95ba3bedf1.js 画它的（特写、魅了层） */
  function motionFrame(dtReal) {
    const users = (MV.active && MV.ok ? 1 : 0) + (AV.active ? 1 : 0) + (MV.extraUsers ?? 0);
    if (users) motionStep(dtReal);
    if (MV.active && MV.ok && MV.img) drawStandee(MV, MV.img, imageRect(MV.img), MV.mainFx?.() ?? {});
    if (AV.active && AV.img) {
      const i = AV.img;
      const cv = AV.R.canvas;
      // 画布比立绘那一层宽（.stand-gl 往左、往上伸出去一截，免得这一层缩小、平移时画布的边把立绘截掉）：按它伸出去多少把图挪回原位
      // advFx（fx.js）：剧情立绘上叠的效果
      drawStandee(AV.R, i, [(parseFloat(i.style.left) || 0) - cv.offsetLeft, (parseFloat(i.style.top) || 0) - cv.offsetTop, parseFloat(i.style.width) || 0, parseFloat(i.style.height) || 0], MV.advFx?.() ?? {});
    }
    MV.afterFrame?.(dtReal);
  }

  /**
   * 剧情立绘（剧情 / 暂停 / 最后一击）也走同一套着色器：自然呼吸、头发、描边。
   * 画布放在 #stand-her 里（压暗、下沉这些效果跟着容器走），开着的时候原图只留着占位
   */
  const AV = { R: null, ok: null, active: false, img: null, texKey: '', maskKey: '' };
  const ADV_SCREENS = new Set(['story', 'pause', 'choice']);
  async function advMotionSync() {
    const box = $('stand-her');
    const img = box.querySelector('img.framed');
    const src = img?.getAttribute('src');
    const want = motionCfg().enabled !== false && !reduce.matches && ADV_SCREENS.has(S.screen) && box.dataset.state === 'on' && img;
    const hasDraft = MV.draftMask && MV.draftFor && src && new URL(MV.draftFor, location.href).href === new URL(src, location.href).href;
    const maskSrc = src && !hasDraft ? maskSrcFor(src) : null;
    const off = () => {
      AV.active = false;
      box.classList.remove('gl-on');
    };
    if (!want || !(hasDraft || maskSrc)) return off();
    if (AV.ok === null) {
      AV.ok = false;
      try {
        const canvas = document.createElement('canvas');
        canvas.className = 'stand-gl';
        AV.R = createRenderer(canvas);
        AV.ok = true;
      } catch {
        return off();
      }
    }
    if (!AV.ok) return off();
    if (AV.R.canvas.parentElement !== box) box.append(AV.R.canvas); // 换表情会整个替换容器里的东西
    try {
      if (!img.complete || !img.naturalWidth) await new Promise((ok) => img.addEventListener('load', ok, { once: true }));
      if (AV.texKey !== src) {
        upload(AV.R.texImg, img, { premultiply: true }, AV.R.gl);
        AV.texKey = src;
      }
      const key = hasDraft ? `draft:${MV.draftVersion}` : maskSrc;
      if (AV.maskKey !== key) {
        const source = hasDraft ? MV.draftMask : await loadMaskImage(maskSrc);
        upload(AV.R.texMask, source, { premultiply: false }, AV.R.gl);
        AV.maskKey = key;
      }
    } catch {
      return off();
    }
    if (box.querySelector('img.framed') !== img) return;
    AV.img = img;
    AV.active = true;
    box.classList.add('gl-on');
  }

  /**
   * 摇动的音效：cut-in、切图这种大冲量放「摇」（duang~）；节奏到顶按 sfx.jiggle.topEvery 每几下放一次「摇小」（ぷるん），
   * 只在 sfx.jiggle.topIn 列出的阶段
   */
  let jiggleCount = 0;
  function jiggleSound(kind) {
    const cfg = Q.sfx?.jiggle ?? {};
    if ((cfg.big ?? ['cutin', 'art']).includes(kind)) return play('摇');
    if (kind !== 'top') return;
    if (!(cfg.topIn ?? ['mid', 'late']).includes(S.phase)) return;
    const every = cfg.topEvery ?? 4;
    if (every > 0 && ++jiggleCount % every === 0) play('摇小');
  }

  function wireMotion() {
    const on = window.tobatsu.on;
    on('screen', () => motionSync());
    on('screen', () => advMotionSync());
    on('art', () => requestAnimationFrame(() => motionSync()));
    on('rhythm', ({ edge }) => kick(edge === 'top' ? 'top' : 'bottom'));
    on('screen', () => (MV.target = undefined));
    on('cutin', ({ state }) => state === 'in' && kick('cutin'));
    on('phase', ({ phase }) => phase !== 'early' && kick('art'));
    on('beat', ({ phase }) => phase === 'late' && kick('heartbeat'));
    addEventListener('resize', () => MV.active && motionSync());
    reduce.addEventListener?.('change', () => advMotionSync());
    reduce.addEventListener?.('change', () => motionSync());
  }

  // ---------- 本机草稿（tuner.html「立绘」页存的）----------

  function idb() {
    return new Promise((ok, bad) => {
      const req = indexedDB.open('tobatsu', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => ok(req.result);
      req.onerror = () => bad(req.error);
    });
  }
  async function idbDo(mode, fn) {
    const db = await idb();
    return new Promise((ok, bad) => {
      const tx = db.transaction('kv', mode);
      const req = fn(tx.objectStore('kv'));
      tx.oncomplete = () => ok(req?.result);
      tx.onerror = () => bad(tx.error);
    });
  }

  async function loadMotionDraft() {
    try {
      // 本机存的立绘动态参数只用在存的时候那张图上（文件名去掉内容哈希比较）；
      // 旧格式（没记图）是测试立绘 her-test 那时候存的
      const bare = (src) => String(src ?? '').split('/').pop().replace(/\.[0-9a-f]{10}(?=\.[a-z0-9]+$)/i, '');
      const current = bare(Q.art?.battleStandee?.src);
      // 分开存之前的那一份（一台设备只有一份）：图对得上这份委托就搬过来
      const legacy = readJson('tobatsu.motion-params', null);
      if (legacy?.imageSrc && bare(legacy.imageSrc) === current && localStorage.getItem(qkey(MOTION_PARAMS_KEY)) === null) {
        localStorage.setItem(qkey(MOTION_PARAMS_KEY), JSON.stringify(legacy));
      }
      const saved = readJson(qkey(MOTION_PARAMS_KEY), null);
      if (saved?.params && saved.imageSrc) {
        if (bare(saved.imageSrc) === current) Q.motion = deepMerge(Q.motion ?? {}, saved.params);
      } else if (saved && current.startsWith('her-test')) {
        Q.motion = deepMerge(Q.motion ?? {}, saved);
      }
      let draft = await idbDo('readonly', (s) => s.get(maskKey()));
      if (!draft) {
        const old = await idbDo('readonly', (s) => s.get('motion-mask'));
        if (old?.imageSrc && bare(old.imageSrc) === current) {
          await idbDo('readwrite', (s) => s.put(old, maskKey()));
          draft = old;
        }
      }
      if (draft?.blob && draft.imageSrc) {
        MV.draftMask = await createImageBitmap(draft.blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        if (draft.blob2) MV.draftMask2 = await createImageBitmap(draft.blob2, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
        MV.draftFor = draft.imageSrc;
        MV.draftVersion = Date.now();
      }
    } catch (e) {
      emit('motion', { error: `读本机草稿失败：${e.message}` });
    }
  }

  function deepMerge(base, add) {
    const out = { ...base };
    for (const [k, v] of Object.entries(add ?? {})) {
      out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base?.[k] ?? {}, v) : v;
    }
    return out;
  }

  // ================= 启动 =================

  /**
   * 载入委托：common.jsonc（公共）→ quest-<编号>.jsonc（这份委托，standee 另外留着最后盖）；
   * 台词 lines-common.jsonc（共用拟声词）+ lines-<编号>.jsonc，剧情 story-<编号>.jsonc。
   * 编号来自地址 ?quest=<编号>（套在任务墙里时是 iframe 自己的地址），没写用 quests.default
   */
  async function loadQuest() {
    const common = await loadJsonc('common.jsonc');
    const list = common.quests?.list ?? [];
    const want = pageParam('quest');
    if (want && !list.includes(want)) throw new Error(`没有委托「${want}」：common.jsonc 的 quests.list 里只有 ${list.join('、') || '（空）'}`);
    // 不上任务墙的委托（quests.unlisted，编辑中）：要带对链接里的 k，或者这台设备输过调节器口令
    const secret = want ? common.quests?.unlisted?.[want] : null;
    if (secret && pageParam('k') !== secret) {
      let owner = false;
      try {
        owner = localStorage.getItem('tobatsu.tuner-key') === TUNER_KEY_HASH;
      } catch {}
      if (!owner) throw new Error(`没有委托「${want}」`);
    }
    const id = want ?? common.quests?.default ?? list[0];
    const [quest, linesCommon, lines, story, table] = await Promise.all([
      loadJsonc(`quest-${id}.jsonc`),
      loadJsonc('lines-common.jsonc'),
      loadJsonc(`lines-${id}.jsonc`),
      loadJsonc(`story-${id}.jsonc`),
      LANG === 'zh' ? null : loadJsonc(`tr-${LANG}.jsonc`).catch(() => null),
    ]);
    // 包里没有这种语言的表：整个按中文跑（不然外语版的缩字、去前缀这些会套在中文上）
    if (!table) LANG = 'zh';
    const { standee, ...own } = quest;
    Q = deepMerge(common, own);
    Q.quest.id = id;
    // 委托的底色主题（008 的 casino：战斗画面占位的蓝换成酒红，index.html 的 .app[data-theme]）
    app.dataset.theme = Q.quest.theme ?? '';
    L = { ...linesCommon, ...lines };
    // 共用言责词库（lines-common.jsonc 的「言责-*」）里她的自称写的是「我」：委托写了 speech.self（001 Aschan、002 人家）就换成它。
    // 委托自己 lines 里的池不动（那边本来就按她的口吻写）；心声是主人公的，也不动。
    // 日语、英语版不换（译文按那种语言的习惯处理自称，查表要用中文原句）
    // 共用言责按角色增删（站主 2026-10-13）：speech.skip 列这份委托不说的原句（照 lines-common 里的字写）；
    // speech.add 按池名另加几句——已经是她的口吻，不换自称。配音台本（scripts/art/tobatsu-voice-script.mjs）读的是同一份
    const self = LANG === 'zh' && typeof Q.speech?.self === 'string' ? Q.speech.self : '';
    const skip = new Set(Array.isArray(Q.speech?.skip) ? Q.speech.skip : []);
    for (const [name, arr] of Object.entries(linesCommon)) {
      if (!/^言责-/.test(name) || name in lines || !Array.isArray(arr)) continue;
      const more = Q.speech?.add?.[name];
      L[name] = arr
        .filter((s) => !skip.has(s))
        .map((s) => (self && typeof s === 'string' ? s.replaceAll('我', self) : s))
        .concat(Array.isArray(more) ? more : []);
    }
    STORY = story;
    if (table) {
      TR = new Map(Object.entries(table).filter(([k, v]) => k && typeof v === 'string' && v));
      localize();
    }
    return standee;
  }

  async function boot() {
    let standee;
    try {
      standee = await loadQuest();
    } catch (e) {
      oops(e.message);
      return;
    }
    if (Q.quest?.type !== 'endurance') {
      oops(`quest-${Q.quest.id}.jsonc：委托类型「${Q.quest?.type}」还没做，现在只有 endurance（耐久型）`);
      return;
    }
    backfillTrophies(Q.quest.id, Q.quest.trophies);
    // 只看冒险者记录（任务墙上的入口）：不加载立绘、音乐，不进委托书，直接打开记录
    if (LEDGER_ONLY) {
      app.dataset.view = 'ledger';
      postFrame();
      openLedger();
      return;
    }
    await applyStandeeProfile(standee);
    await loadBgmLibrary();
    // 调节器「立绘」页存的边缘处理参数（这台设备）
    const edgeLocal = readJson(EDGE_KEY, null);
    if (edgeLocal) Q.art = { ...(Q.art ?? {}), edge: deepMerge(Q.art?.edge ?? {}, edgeLocal) };
    setHudName();
    // 本机存过的档位并进来（这份委托的）；本机设过默认档位就用它（tuner.html 里「设为本机默认」）
    migrateLocal();
    Q.rhythm.presets = { ...(Q.rhythm.presets ?? {}), ...readJson(qkey(CUSTOM_KEY), {}) };
    loadLevelDraft();
    const presets = Object.keys(Q.rhythm.presets);
    const localUse = readJson(qkey(USE_KEY), null);
    const want = presets.includes(localUse) ? localUse : Q.rhythm?.use;
    S.preset = presets.includes(want) ? want : (presets[0] ?? null);
    $('hud-sound').setAttribute('aria-pressed', String(SFX.on));
    wireSfx();
    await loadMotionDraft();
    wireMotion();
    preloadArt();
    if (devEnabled()) mountDev();
    initPerf();
    toBrief();
    if (pageParam('stress') === '1') startStress();
    if (pageParam('fps') === '1' || S.stress) fpsHud(true);
    // fx.js（插入演出）用的内部接口：只给同一个包里的脚本用
    window.tobatsu._ = {
      Q: () => Q,
      tr,
      glyphLen,
      lang: LANG,
      S,
      MV,
      RH,
      app,
      reduce,
      emit,
      play,
      pick,
      sticker,
      el,
      hasPool: (p) => Array.isArray(L?.[p]) && L[p].length > 0,
      markChips,
      rhEdge,
      rhBreath,
      rhRelease,
      rhMirror,
      rhBoost,
      rhRate,
      setRules,
      guised,
      revealed,
      fakeCfg,
      soundOn: () => SFX.on,
      animate,
      shake,
      imageRect,
      createRenderer,
      drawStandee,
      upload,
      loadMaskImage,
      maskSrcFor,
      chestCenter,
      motionMode,
      inBattle,
      pageParam,
      stageCell,
      setCfg,
      bounds,
      target,
      say,
      sayCue,
      continuous,
      toFall,
      toFinish,
      /** 21 点（008）：秒数不走的时候也马上换段（节奏快慢、取景跟着变；往后走照常放 cut-in） */
      setPhase: (phase) => phase !== S.phase && changePhase(phase),
      // 本机开关（败北的提示里答应过的，tobatsu.q<编号>.flags）
      questFlag: (name) => questFlag(name),
      clockText,
      stampNode,
      slam,
      keepAwake,
      hud,
      perf: () => PERF,
      pixelRatio,
    };
    window.tobatsu.ready = true;
    window.dispatchEvent(new Event('tobatsu:ready'));
    requestAnimationFrame((t) => {
      last = t;
      requestAnimationFrame(frame);
    });
  }

  boot();
})();
