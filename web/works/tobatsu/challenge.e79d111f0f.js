/*
 * 讨伐任务 · 挑战
 *
 * 战斗中突然在画面上出一题，限时内完成才能接着撑；没完成就败北（game.js 的 toFall）。
 * 演出表那一格设成练习（onMiss: "practice"）的，失手只盖一枚「失手 · 练习」章、魅了加深，战斗照常。
 * onMiss: "card"（007 的冒险者卡，card.js）：失手不败北，扣几级（card.miss）；章上写「−n 级」。等级扣到 0 才输（card.js 叫 toFall）。
 * onMiss: "time"（008 的 21 点，blackjack.js）：失手不败北，罚时往后加 missSeconds 秒（默认 3）；章上写「+3 秒」。
 * place: "card"（定时出题）：点击 / 按住 / 连打出在冒险者卡上（卡在 HUD 左上角，被她拿走时在她手边——card.js 的 cardPoint）。
 *
 * 四种题，外观都是酒馆 UI 层（cream / ink / 橙红 / HUD 绿，墨线 + 实色投影 + 贴纸字，不发光不渐变），外圈 8 格刻度都是限时：
 *   点击「紧急印」：cream 圆章 + 橙红六角 +「点！」，点到就过
 *   按住「蓄力印」：同一枚章，六角是空的，按住时橙红从下往上灌满（按住 hold 秒），松手往回退；灌满才过
 *   拖动「斩线」：一条墨线描边的 cream 粗轨道（斜线 / 折线 / 弧线），起点一枚橙红六角滑块、终点墨线圆靶；
 *                拖着滑块沿轨道走，走过的灌成 HUD 绿；偏离轨道太远＝脱轨，滑块弹回上一个检查点；拖到终点斩开
 *   顺序「倒数印」（004 起，站主 2026-09-17）：几枚点击章上写着数字（count 枚：3、2、1、0），一枚隔 spread 秒错开砸在画面各处，
 *                限时内从大到小依次点；点错一枚＝失手。点到最后的 0 放一波爱心 + 一下粉色的「被魅惑」（fx.js）。
 *                zeroHold＝最后的 0 不是点，是按住灌满（zeroHoldChance 的概率）；
 *                最大的那个数字（一轮的起点）上挂一枚「START」小签（站主：几枚一起出来时分不清哪个最大），翻成「?」时收掉；
 *                decoys＝再混几枚深色的「诱饵」，一部分压住数字的一角（decoyCover 的比例）、其余散在空地上；
 *                点到诱饵不算输，而是全屏「混乱」confuse 秒：紫色模糊、画面发艳变色、半透明的她的大立绘挡在前面晃、题目跟着晃（fx.js）；
 *                hide＝每枚出现几秒后翻成「?」（诱饵也翻），只能靠记。翻过面的章一律是点击章的背面：按住的 0、诱饵都看不出来，
 *                按到了才翻回正面（站主 2026-09-18：点到之后才知道）
 *   连打「连打印」（004 起）：HUD 绿六角 +「×N」，限时内连点 taps 下。trap＝章下面藏一枚诱饵（true，或 0–1 的概率）：
 *                打完的那一刻露出来、停 trapStay 秒，多点一下就踩中（站主 2026-09-18）。
 *                trap: "accept"（007）：藏的是一块粉色的「接受榨取 −trapCost Lv」（trapText 换字），多点一下就被吸走那几级（card.js），
 *                她说 trapLine；没点、缩回去时说 resistLine。
 *                hideTaps（007 第 4 组）：章上只写「×?」，不告诉要点几下；tapsJitter＝实际次数在 taps 上下随机多少（整数）
 *   按住题写了 onHold（一份顺序题的参数）：第一次按下去的那一刻，同一波里再砸下一组顺序题——按着不能松，还得腾出手点数字
 * 出题时章砸下 + 一道 ink / HUD 斜纹警示条从远的那边屏幕边扫过来；最后 1 秒硬闪。
 * 完成：压下、星形飞散、贴纸字弹一下（拖动是一道光沿轨道扫过去，不弹字——站主 2026-09-17 取消了「斩」）。失手：变灰、裂开、「失手」章砸下、画面抖一下。
 *
 * 什么时候出、出哪种、限时多久：各委托演出表的 stage.challenge（每组可以单独改）；每种题的默认值与公共规矩：common.jsonc 的 challenge。
 * 同时出几题（组合）：演出表 kinds 里写 "点击+按住": 1 这样的键，就一次出这几题（各放各的位置、各自限时，限时乘 comboTime，默认 1.25）；
 * 全部完成才算过这一波，其中一题没完成就败北。按住 + 点击、拖动 + 点击要两根手指。
 * 公平：题压在所有演出上面；不出在 HUD、秒数、节奏轨、台词条、放弃按钮、左上角返回把手附近，同一波的题互相让开；同一时间只有一波；
 * 长按放弃中、cut-in 切进来时、数到 0 的余韵里、每组最后几秒不出新的；切到后台这一波作废（不算失手）。
 * fx.95ba3bedf1.js 问 I.challenge.active()：挑战在场时不开始新的特写。
 * 定时出题：每组的定时演出（sets[n - 1].script）里写 { "at": 秒, "fx": "挑战-按住"（或 "挑战-点击+拖动"）, "time": 限时, "hold": 按满秒数, "pool": 台词池 }，
 * 到点一定出（有题在场、cut-in 切进来时等一等再出）。
 * 定时出题还可以写 "place": "quit"＝章直接砸在底下的「放弃」按钮上（错落着排，像在引诱你去按放弃），
 * "stagger": 秒＝这一波的题一个接一个砸下来（每题的限时从它出现起算）。
 * 她的反应：演出表 challenge 格的 showLine（出题时）/ hitLine（一波全部完成时）是台词条的池；定时出题的 pool 盖过 showLine。
 * 地址加 ?challenge=test：每组前中后段、无尽战斗都 6–10 秒出一题（三种轮着），真机试手感用。
 * 这个文件挂在 game.6051d2b93f.js 的内部接口上（window.tobatsu._），不改流程。
 */
(() => {
  'use strict';

  const start = () => {
    const T = window.tobatsu;
    const I = T._;
    const { S, MV, app, reduce, play, el, animate } = I;
    const Q = I.Q;
    const base = () => Q().challenge ?? {};
    const rand = (a, b) => a + Math.random() * (b - a);
    const C_INK = '#0b0b12';
    const C_CREAM = '#fff5e1';
    const C_HUD = '#c8ff2e';

    // 诱饵（006）：单独的一枚诱饵章，只在定时出题里用（「挑战-诱饵」）——点了不算失手，算「上钩」；不点，到时间自己收掉
    const KINDS = ['点击', '按住', '拖动', '顺序', '连打', '分岔', '诱饵'];
    const WORD = { 点击: '点！', 按住: '按住', 拖动: '拖', 顺序: '顺序', 连打: '连打', 分岔: '选', 诱饵: '诱饵' };
    /** 完成时弹的字；拖动不弹（站主：取消「斩」） */
    const DONE_WORD = { 点击: '命中', 按住: '蓄满', 顺序: '归零', 连打: '击破' };
    const SHAPES = ['斜线', '折线', '弧线', '零'];
    const TICKS = 8;
    /** 分岔题从定时出题 / 超时步骤那一条带过来的参数 */
    const FORK_KEYS = ['passSide', 'tug', 'lureEvery', 'slideBack', 'slideOn', 'lurePool', 'passLine', 'rewardLine', 'timeoutLine', 'onReward', 'rewardCue', 'track', 'passTag', 'rewardTag'];
    let uid = 0;

    // 图层：压在演出层（z 15）、特写（z 14）上面；HUD、节奏轨这些本来就避开，不用再压它们
    const layer = el('div', 'chal-layer');
    app.append(layer);

    /** list：画面上的题（同一波可以有好几题）；placing：正在摆的这一波（摆后面的题时让开前面的） */
    const C = { list: [], placing: null, nextAt: null, lastEnd: -Infinity, lastPos: null, test: I.pageParam('challenge') === 'test' };
    const busy = () => C.list.length > 0;

    /** ?challenge=test 时的一格：前中后段、无尽战斗都出，6–10 秒一题，三种题都有 */
    const TEST_CELL = { in: ['early', 'mid', 'late', 'endless'], every: [6, 10], first: 3, kinds: { 点击: 1, 按住: 1, 拖动: 1, 顺序: 1, 连打: 1 }, onMiss: 'defeat' };
    const cell = () => (C.test ? { ...I.stageCell('challenge'), ...TEST_CELL } : I.stageCell('challenge'));
    /** 某种题的参数：common.jsonc 的默认值，盖上演出表格里写的 */
    const params = (kind, c = cell()) => ({ ...(base()[kind] ?? {}), ...(c[kind] ?? {}) });
    const every = (c) => (Array.isArray(c.every) ? c.every : [c.every ?? 15, c.every ?? 15]);
    const TIME_DEFAULT = { 点击: 2.5, 按住: 4, 拖动: 4.5, 顺序: 3.5, 连打: 3, 分岔: 60, 诱饵: 4 };
    /** 题型键：「点击」或组合「点击+按住」→ 题型数组；不认识的返回 null */
    const kindsOf = (key) => {
      const list = String(key ?? '').split('+').map((x) => x.trim());
      return list.length && list.every((k) => KINDS.includes(k)) ? list : null;
    };

    /** 她在台词条上说一句，并让这一句多留一会儿（不被各段的台词条马上换掉） */
    function sayLine(pool) {
      if (!pool) return;
      I.say(pool);
      S.nextLineAt = Math.max(S.nextLineAt ?? 0, S.elapsed + 2.5);
    }

    function pickWeighted(weights, allowed) {
      const ok = typeof allowed === 'function' ? allowed : (k) => allowed.includes(k);
      const entries = Object.entries(weights ?? {}).filter(([k, w]) => w > 0 && ok(k));
      const total = entries.reduce((a, [, w]) => a + w, 0);
      if (!total) return null;
      let r = Math.random() * total;
      for (const [k, w] of entries) if ((r -= w) <= 0) return k;
      return entries.at(-1)[0];
    }

    // ---------- 什么时候出 ----------

    function due() {
      const c = cell();
      const list = c.in ?? [];
      const where = S.screen === 'endless' ? 'endless' : S.phase;
      if (!list.includes(where)) return;
      const [lo] = every(c);
      if (C.nextAt === null) C.nextAt = Math.max(0, c.first ?? lo);
      if (S.elapsed < C.nextAt || S.elapsed - C.lastEnd < (base().gap ?? 4)) return;
      if (S.press || S.cutinBusy || S.finishLeft > 0 || S.resumeLeft > 0 || S.freeze) return;
      // 寸止（等着到顶 / 停着）、呼吸跟着走的时候不出新题：让玩家专心在现实里的动作上
      if (I.RH?.edge || I.RH?.breath) return;
      const key = pickWeighted(c.kinds ?? { 点击: 1 }, (k) => !!kindsOf(k) && !k.includes('诱饵'));
      if (!key) return;
      const kinds = kindsOf(key);
      // 每组最后几秒不出：留够限时 + 失手停顿，不会和「数到 0」撞上
      if (S.screen === 'hold') {
        const longest = Math.max(...kinds.map((k) => timeOf(k, c, null, kinds.length > 1)));
        const need = Math.max(base().quiet ?? 3, longest + (base().missHold ?? 0.8) + 0.5);
        if (I.target() - S.elapsed < need) return;
      }
      if (!spawn(kinds)) C.nextAt = S.elapsed + 1; // 这会儿没地方放，过一秒再看
    }

    // ---------- 放在哪 ----------

    /** 要让开的东西（app 坐标，已经外扩 avoid） */
    function obstacles() {
      const box = app.getBoundingClientRect();
      const avoid = base().avoid ?? 14;
      const rects = [];
      const add = (node) => {
        if (!node || node.hidden) return;
        const cs = getComputedStyle(node);
        if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
        const b = node.getBoundingClientRect();
        if (!b.width || !b.height) return;
        rects.push({ l: b.left - box.left - avoid, t: b.top - box.top - avoid, r: b.right - box.left + avoid, b: b.bottom - box.top + avoid });
      };
      const hud = app.querySelector('.hud');
      for (const ch of C.placing ?? []) for (const node of ch.parts ? ch.parts.map((x) => x.node) : [ch.node]) add(node);
      for (const node of [hud, app.querySelector('#rhythm'), app.querySelector('#clock'), app.querySelector('#say'), app.querySelector('#quit-pill'), app.querySelector('#quit-bar'), app.querySelector('.card-hud')]) add(node);
      // 左上角壳的返回把手在 iframe 外面，量不到：按它最大时的样子让开
      const hudBottom = hud ? hud.getBoundingClientRect().bottom - box.top : 48;
      rects.push({ l: -avoid, t: -avoid, r: 130 + avoid, b: hudBottom + 16 + avoid });
      return { rects, w: box.width, h: box.height };
    }

    /** 找一块能放下 2hw × 2hh 的空地，返回中心点；尽量离上一题 140px 以上 */
    /** 画面正中那一块：HUD 下缘到放弃按钮上缘，左右留边（出题 place: center） */
    function centerArea() {
      const box = app.getBoundingClientRect();
      const edge = base().edge ?? 22;
      const top = (app.querySelector('.hud')?.getBoundingClientRect().bottom ?? box.top + 48) - box.top + 6;
      const quit = app.querySelector('#quit-bar')?.getBoundingClientRect();
      const bottom = (quit?.height ? quit.top - box.top : box.height - 110) - 6;
      return { x: box.width / 2, y: (top + bottom) / 2, w: box.width - edge * 2, h: bottom - top };
    }

    function findSpot(hw, hh) {
      const { rects, w, h } = obstacles();
      const edge = base().edge ?? 22;
      const blocked = (x, y) => rects.some((q) => x + hw > q.l && x - hw < q.r && y + hh > q.t && y - hh < q.b);
      const [x0, x1, y0, y1] = [edge + hw, w - edge - hw, edge + hh, h - edge - hh];
      if (x1 < x0 || y1 < y0) return null;
      let best = null;
      for (let i = 0; i < 60; i++) {
        const x = rand(x0, x1);
        const y = rand(y0, y1);
        if (blocked(x, y)) continue;
        const far = C.lastPos ? Math.hypot(x - C.lastPos.x, y - C.lastPos.y) : Infinity;
        if (far >= 140) return { x, y };
        if (!best || far > best.far) best = { x, y, far };
      }
      return best;
    }

    // ---------- 画：共用的零件 ----------

    const HEX = (rr, cx, cy) =>
      Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i;
        return `${(cx + Math.cos(a) * rr).toFixed(1)},${(cy + Math.sin(a) * rr).toFixed(1)}`;
      }).join(' ');

    /** 外圈一格刻度：从正上方顺时针，第 i 格，格与格之间留一道缝（120×120 的坐标） */
    function tickPath(i, r0 = 49, r1 = 58, gap = 9) {
      const a0 = ((-90 + (360 / TICKS) * i + gap / 2) * Math.PI) / 180;
      const a1 = ((-90 + (360 / TICKS) * (i + 1) - gap / 2) * Math.PI) / 180;
      const p = (r, a) => `${(60 + Math.cos(a) * r).toFixed(2)} ${(60 + Math.sin(a) * r).toFixed(2)}`;
      return `M${p(r1, a0)} A${r1} ${r1} 0 0 1 ${p(r1, a1)} L${p(r0, a1)} A${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
    }

    /**
     * 一枚章（120×120 坐标）：刻度 + 实色投影 + cream 圆 + 六角（点击 / 拖动是橙红的；按住是空的，里面一块橙红从下往上灌）+ 虚线内圈 + 失手裂痕。
     * disc：cream 圆的半径；hex：六角的半径
     */
    /** 诱饵章中间的心（120×120 坐标，和六角差不多大） */
    const HEART = 'M60 86 C31 67 28 50 34 41 C41 31 55 32 60 43 C65 32 79 31 86 41 C92 50 89 67 60 86 Z';
    const C_PURPLE = '#a86bff';

    function stampSvg(kind, { disc = 40, hex = 27 } = {}) {
      const id = `chal-${++uid}`;
      const empty = kind === '按住';
      const hexPts = HEX(hex, 60, 60);
      // 诱饵：深蓝黑的圆 + 紫色虚线内圈 + 紫边黑心；没有刻度（它不限时，一眼和要点的章分开）
      if (kind === '诱饵') {
        return `
        <circle class="chal-shadow" cx="62.5" cy="64" r="${disc}" fill="${C_INK}"/>
        <circle class="chal-disc" cx="60" cy="60" r="${disc}" stroke="${C_INK}" stroke-width="3"/>
        <circle cx="60" cy="60" r="${disc - 6}" fill="none" stroke="${C_PURPLE}" stroke-width="1.8" stroke-dasharray="3 3"/>
        <path class="chal-heart" d="${HEART}" stroke="${C_PURPLE}" stroke-width="3" stroke-linejoin="round"/>
        <g class="chal-crack" fill="none" stroke="${C_INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="40,26 54,50 47,61 66,84 62,98"/>
        </g>`;
      }
      return `
        <g class="chal-ticks">${Array.from({ length: TICKS }, (_, i) => `<path class="chal-tick" d="${tickPath(i)}"/>`).join('')}</g>
        <circle class="chal-shadow" cx="62.5" cy="64" r="${disc}" fill="${C_INK}"/>
        <circle class="chal-disc" cx="60" cy="60" r="${disc}" stroke="${C_INK}" stroke-width="3"/>
        ${empty ? `<clipPath id="${id}"><polygon points="${hexPts}"/></clipPath>` : ''}
        <polygon class="chal-hex${empty ? ' chal-hex--empty' : ''}" points="${hexPts}" stroke="${C_INK}" stroke-width="3" stroke-linejoin="round"/>
        ${empty ? `<g clip-path="url(#${id})"><path class="chal-fill" d="" data-top="${60 - hex}" data-bottom="${60 + hex}"/></g><polygon points="${hexPts}" fill="none" stroke="${C_INK}" stroke-width="3" stroke-linejoin="round"/>` : ''}
        <polygon points="${HEX(hex * 0.7, 60, 60)}" fill="none" stroke="${C_CREAM}" stroke-width="1.8" stroke-dasharray="3 3"/>
        <g class="chal-crack" fill="none" stroke="${C_INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="40,26 54,50 47,61 66,84 62,98"/>
          <polyline points="86,34 71,55 79,66 64,74"/>
        </g>`;
    }

    function wordEl(kind) {
      const w = el('span', 'chal-word sticker');
      const text = I.tr(WORD[kind] ?? kind);
      I.sticker(w, text);
      // 章里的字按两个汉字宽排的（「点！」「按住」）；日语、英语长一点的（タップ！、SWIPE）按字宽缩小，不溢出章外
      const g = I.glyphLen(text);
      if (g > 2.2) w.style.fontSize = `calc(var(--art) * ${((0.2 * 2.2) / g).toFixed(3)})`;
      return w;
    }

    /** 出题时一道斜切警示条（ink / HUD 斜纹）从远的那边屏幕边扫向题 */
    function streak(pos) {
      if (reduce.matches) return;
      const w = app.clientWidth;
      const band = el('div', 'chal-streak');
      const fromLeft = pos.x > w / 2;
      band.style.top = `${pos.y}px`;
      band.style.left = fromLeft ? '-20px' : `${pos.x}px`;
      band.style.width = `${fromLeft ? pos.x + 20 : w - pos.x + 20}px`;
      band.style.transformOrigin = fromLeft ? '0 50%' : '100% 50%';
      layer.prepend(band);
      const a = band.animate(
        [
          { transform: 'scaleX(0)', opacity: 1 },
          { transform: 'scaleX(1)', opacity: 1, offset: 0.55 },
          { transform: 'scaleX(1)', opacity: 0 },
        ],
        { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' },
      );
      a.onfinish = a.oncancel = () => band.remove();
    }

    const SPARK_D = 'M50 0 C53 38 62 47 100 50 C62 53 53 62 50 100 C47 62 38 53 0 50 C38 47 47 38 50 0 Z';
    /** 完成：几片 cream / HUD 星形往外飞 */
    function shards(pos) {
      if (reduce.matches) return;
      for (let i = 0; i < 7; i++) {
        const s = el('span', 'chal-shard');
        const size = rand(14, 26);
        s.style.width = s.style.height = `${size}px`;
        s.style.left = `${pos.x}px`;
        s.style.top = `${pos.y}px`;
        s.innerHTML = `<svg viewBox="0 0 100 100"><path d="${SPARK_D}" fill="${i % 3 === 0 ? C_HUD : C_CREAM}" stroke="${C_INK}" stroke-width="9" stroke-linejoin="round"/></svg>`;
        layer.append(s);
        const ang = (Math.PI * 2 * i) / 7 + rand(-0.3, 0.3);
        const dist = rand(52, 96);
        const a = s.animate(
          [
            { transform: 'translate(-50%, -50%) scale(0.4) rotate(0deg)', opacity: 1 },
            { transform: `translate(calc(-50% + ${Math.cos(ang) * dist}px), calc(-50% + ${Math.sin(ang) * dist}px)) scale(1) rotate(${rand(90, 200)}deg)`, opacity: 0 },
          ],
          { duration: rand(320, 420), easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'both' },
        );
        a.onfinish = a.oncancel = () => s.remove();
      }
    }

    /** 一个贴纸字弹一下再往上散（「命中」「蓄满」「归零」「击破」） */
    function popWord(pos, text) {
      const w = el('span', 'chal-pop sticker');
      I.sticker(w, text);
      w.style.left = `${pos.x}px`;
      w.style.top = `${pos.y}px`;
      layer.append(w);
      if (reduce.matches) {
        setTimeout(() => w.remove(), 600);
        return;
      }
      const a = w.animate(
        [
          { transform: 'translate(-50%, -50%) scale(0.4)', opacity: 0 },
          { transform: 'translate(-50%, -110%) scale(1.18)', opacity: 1, offset: 0.35 },
          { transform: 'translate(-50%, -120%) scale(1)', opacity: 1, offset: 0.7 },
          { transform: 'translate(-50%, -150%) scale(1)', opacity: 0 },
        ],
        { duration: 620, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' },
      );
      a.onfinish = a.oncancel = () => w.remove();
    }

    const stopSound = (ch) => {
      for (const t of [ch, ...(ch.parts ?? [])]) {
        try {
          t.sound?.stop();
        } catch {}
        t.sound = null;
      }
    };

    // ---------- 点击 / 按住：一枚章 ----------

    /** 套在怀表上的环（place: "watch"，006）：只有外圈刻度和一圈 cream 线，中间空着——表盘看得见；字挪到环下面 */
    function ringSvg() {
      return `
        <g class="chal-ticks">${Array.from({ length: TICKS }, (_, i) => `<path class="chal-tick" d="${tickPath(i)}"/>`).join('')}</g>
        <circle cx="60" cy="60" r="45" fill="none" stroke="${C_INK}" stroke-width="7"/>
        <circle class="chal-ring" cx="60" cy="60" r="45" fill="none" stroke="${C_CREAM}" stroke-width="3.2" stroke-dasharray="7 4"/>
        <g class="chal-crack" fill="none" stroke="${C_INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="40,26 54,50 47,61 66,84 62,98"/>
        </g>`;
    }
    /** 怀表上的章多大：环的内圈（45 / 120 × 1.5 × size）正好比表盘大一圈 */
    const watchSize = (wp, pad = 8) => Math.max(72, Math.min(190, (wp.r + pad) / 0.5625));

    /** at：指定位置（引诱放弃那种），不找空地 */
    function buildStamp(kind, p, at = null) {
      const size = p.size ?? (kind === '按住' ? 84 : 76);
      const hit = Math.max(size, p.hit ?? size + 28);
      const box = Math.max(hit, size * 1.5);
      const pos = at ?? findSpot(box / 2, box / 2);
      if (!pos) return null;
      const node = el('button', `chal chal--${kind === '按住' ? 'hold' : 'tap'}`);
      node.type = 'button';
      node.setAttribute('aria-label', I.tr('挑战：{what}', { what: I.tr(WORD[kind]) }));
      node.style.setProperty('--box', `${box}px`);
      node.style.setProperty('--art', `${size * 1.5}px`);
      node.style.left = `${pos.x}px`;
      node.style.top = `${pos.y}px`;
      const body = el('span', 'chal-body');
      body.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true">${p.ring ? ringSvg() : stampSvg(kind)}</svg>`;
      body.append(wordEl(kind));
      if (p.ring) node.classList.add('chal--ring');
      node.append(body);
      layer.append(node);
      return { node, body, pos, size, ticks: [...body.querySelectorAll('.chal-tick')], fill: body.querySelector('.chal-fill') };
    }

    /**
     * 单独的一枚诱饵（定时出题「挑战-诱饵」，006 第 2 组挂在怀表上）：样子就是顺序题里的那种紫心章。
     * 点了＝上钩（S.lured + 1，fx.js 接 lured：全屏混乱 confuse 秒——默认 9，要盖得住后面那道顺序题；顺序题写了 lured 的还会换成那一套），
     * 不点＝到时间自己化掉（resisted）。两种都不算失手
     */
    function buildLure(p, at = null) {
      const size = p.size ?? 76;
      const box = size * 1.08;
      const pos = at ?? findSpot(box / 2, box / 2);
      if (!pos) return null;
      const part = makePart(layer, { kind: '诱饵', pos, box, size });
      part.node.classList.add('chal--lure');
      part.node.style.visibility = '';
      part.shown = true;
      return { node: part.node, body: part.body, pos, size, ticks: [], part };
    }
    function wireLure(ch) {
      const end = (state) => {
        if (ch.over || ch.wave.lost) return false;
        ch.over = true;
        ch.node.disabled = true;
        ch.wave.left--;
        I.emit('challenge', { state, kind: ch.kind, x: ch.pos.x, y: ch.pos.y, seconds: ch.p.confuse });
        return true;
      };
      const go = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (performance.now() < ch.start || !end('lured')) return;
        S.lured = (S.lured ?? 0) + 1;
        play('魅惑闪光');
        I.shake();
        animate(ch.body, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 280, easing: 'ease-out', fill: 'forwards' });
        if (ch.p.luredLine) sayLine(ch.p.luredLine);
        resolve(ch, 300);
      };
      ch.node.addEventListener('pointerdown', go);
      ch.node.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go(e));
      ch.timeout = () => {
        if (!end('resisted')) return;
        // 这一颗忍住了：后面那道顺序题照普通的出、她也不说「还是碰了」（上一颗碰过的不带到这里）
        S.lured = 0;
        animate(ch.body, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.4)', opacity: 0 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
        if (ch.p.resistLine) sayLine(ch.p.resistLine);
        resolve(ch, 280);
      };
    }

    function wireTap(ch) {
      ch.node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        succeed(ch);
      });
      ch.node.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          succeed(ch);
        }
      });
    }

    /**
     * 按住：按下开始灌，松手往回退（退得比灌快一半）；手指可以在章上稍微挪，捕获住不会丢。
     * t 是一枚章（node / fill）：按住题本身，或顺序题里要按住的 0。canStart 不过（还没轮到它）就叫 t.onEarly
     */
    function makeHold(t, holdSec, { canStart, onStart, onFull }) {
      t.holdSec = Math.max(0.2, holdSec);
      t.progress = 0;
      t.holding = null;
      t.born = performance.now();
      // track（挂在怀表上的按住，006 第 4 组）：章跟着怀表摆，按着的手指 / 鼠标也得跟着——指针离开章就不灌、还往回退，挪回来接着灌
      const where = (e) => {
        t.px = e.clientX;
        t.py = e.clientY;
      };
      const onIt = () => {
        if (!t.track || t.holding === null || t.holding === 'key' || t.px === undefined) return true;
        const r = t.node.getBoundingClientRect();
        // 要按在表盘上才算（trackR＝表盘半径多一点）：手停在原地不跟的话，表一摆走就断
        return Math.hypot(t.px - (r.left + r.width / 2), t.py - (r.top + r.height / 2)) <= (t.p?.trackR ?? r.width * 0.3);
      };
      if (t.track) t.node.addEventListener('pointermove', where);
      const down = (id) => {
        if (t.over || t.done || t.holding !== null) return;
        if (canStart && !canStart()) return t.onEarly?.();
        if (t.flipped) peekPart(t);
        t.touched = true;
        t.downAt = performance.now();
        t.holding = id;
        t.node.classList.add('chal--holding');
        t.sound = play('挑战蓄力');
        onStart?.();
      };
      const up = (id) => {
        if (t.holding !== id) return;
        t.holding = null;
        t.node.classList.remove('chal--holding');
        try {
          t.sound?.stop();
        } catch {}
        t.sound = null;
        // 点了就松（不到 0.3 秒）：多半是没看出要按住——当场提示一次
        if (!t.done && !t.over && !t.hinted && performance.now() - t.downAt < 300) {
          t.hinted = true;
          holdHint(t);
        }
      };
      t.node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          t.node.setPointerCapture(e.pointerId);
        } catch {}
        where(e);
        down(e.pointerId);
      });
      // 安卓长按会弹系统菜单、打断按住：拦掉（放弃按钮也是这样）；内置浏览器不管 contextmenu，一按下就拦 touchstart
      t.node.addEventListener('contextmenu', (e) => e.preventDefault());
      T.holdTouch?.(t.node);
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) t.node.addEventListener(type, (e) => up(e.pointerId));
      t.node.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          down('key');
        }
      });
      t.node.addEventListener('keyup', (e) => (e.key === 'Enter' || e.key === ' ') && up('key'));
      const top = Number(t.fill.dataset.top);
      const bottom = Number(t.fill.dataset.bottom);
      t.holdFrame = (dt) => {
        if (t.done) return;
        const on = t.holding !== null && onIt();
        if (t.track) t.node.classList.toggle('chal--drift', t.holding !== null && !on);
        t.progress = Math.max(0, Math.min(1, t.progress + (on ? dt : -dt * 1.5) / t.holdSec));
        // 还没按过：水位自己涨到五成半再退回去（约 1.1 秒一次，淡一点），看得出「按住会蓄力」，不像一枚灰掉的章；
        // 翻成「?」的不演示（背面要靠记，演示了就露底）；减少动态时不演示
        const ghost = !t.touched && !t.flipped && t.progress === 0 && !reduce.matches;
        const shown = ghost ? 0.55 * (0.5 - 0.5 * Math.cos((performance.now() - t.born) * 0.0057)) : t.progress;
        t.fill.style.opacity = ghost ? '0.75' : '';
        // 水位：从六角底下往上涨，满了盖过顶角；水面一道小波浪左右晃（灌到一半的时候才有）
        const level = bottom + 2 - (bottom - top + 4) * shown;
        const wave = shown > 0.02 && shown < 0.98 && !reduce.matches ? 2.6 * Math.sin(performance.now() * 0.012) : 0;
        t.fill.setAttribute('d', shown > 0 ? `M26 ${bottom + 3} L26 ${level.toFixed(1)} Q43 ${(level - wave).toFixed(1)} 60 ${level.toFixed(1)} T94 ${level.toFixed(1)} L94 ${bottom + 3} Z` : '');
        if (t.progress >= 1) onFull();
      };
    }

    /**
     * 按住的章点了就松：章左右抖一下，头顶（太靠上就放脚下）冒一枚「按住不放！」小贴纸，停 1.5 秒。
     * 同一枚章只提示一次；本来就会按住的人看不到它（站主 2026-09-20：不少人没看出灰的那枚要按住，直接玩 004 的更是）
     */
    function holdHint(t) {
      if (!reduce.matches) t.node.animate([{ translate: '0 0' }, { translate: '-7px 0' }, { translate: '6px 0' }, { translate: '-3px 0' }, { translate: '0 0' }], { duration: 320, easing: 'ease-out' });
      const lr = layer.getBoundingClientRect();
      const r = t.node.getBoundingClientRect();
      const below = r.top - lr.top < 130;
      const tip = el('div', below ? 'chal-hint chal-hint--below' : 'chal-hint');
      const w = el('span', 'sticker');
      I.sticker(w, I.tr('按住不放！'));
      tip.append(w);
      tip.style.left = `${Math.min(lr.width - 90, Math.max(90, r.left - lr.left + r.width / 2))}px`;
      tip.style.top = `${below ? r.bottom - lr.top + 8 : r.top - lr.top - 8}px`;
      layer.append(tip);
      const ms = 1500;
      if (reduce.matches) return void setTimeout(() => tip.remove(), ms);
      tip.animate(
        [
          { scale: '1.5', opacity: 0 },
          { scale: '0.95', opacity: 1, offset: 0.1 },
          { scale: '1', opacity: 1, offset: 0.16 },
          { scale: '1', opacity: 1, offset: 0.85 },
          { scale: '0.9', opacity: 0 },
        ],
        { duration: ms, easing: 'ease-out' },
      ).onfinish = () => tip.remove();
    }

    function wireHold(ch, p) {
      // ch.track 在 spawn 里已经定了（挂在怀表上的按住）
      makeHold(ch, p.hold ?? 1.2, { onStart: () => ambush(ch), onFull: () => succeed(ch) });
      ch.frame = ch.holdFrame;
    }

    /**
     * 按住题写了 onHold（顺序题的参数：count / decoys / hide / zeroHold / time / pool）：第一次按下去的那一刻，
     * 同一波里再砸下一组顺序题（站主 2026-09-17：先出按住，一按下去就来一波 2、1、0，手忙脚乱）。放不下就算了
     */
    function ambush(ch) {
      const q = ch.p.onHold;
      if (ch.ambushed || !q || typeof q !== 'object' || ch.wave.lost) return;
      ch.ambushed = true;
      const p = { ...params('顺序'), ...q };
      C.placing = [ch];
      const add = buildOrder('顺序', p);
      C.placing = null;
      if (!add) return;
      const now = performance.now();
      Object.assign(add, { kind: '顺序', p, wave: ch.wave, over: false, time: (q.time > 0 ? q.time : timeOf('顺序')) * 1000 + add.extra, start: now, last: now });
      ch.wave.left++;
      wireOrder(add);
      C.list.push(add);
      play('挑战出现');
      I.shake();
      streak(add.pos);
      if (q.pool) sayLine(q.pool);
    }

    // ---------- 顺序：几枚写着数字的章（+ 诱饵）----------

    /**
     * 顺序题的 n 个位置：画面上一个个 box 大小的格子（格间 gap），去掉挡着 HUD / 秒数 / 节奏轨 / 台词条 / 放弃按钮的，随机挑 n 格再各自抖一点。
     * 一枚一枚随机找空地的话，6–8 枚在手机上常常摆不下（后面的挤不进缝里）；格子摆得满。格子原点随机试几次，取能放最多的那次
     */
    function orderSpots(n, box, gap) {
      const { rects, w, h } = obstacles();
      const edge = base().edge ?? 22;
      const half = box / 2;
      const step = box + gap;
      const blocked = (x, y) => rects.some((q) => x + half > q.l && x - half < q.r && y + half > q.t && y - half < q.b);
      let best = [];
      for (let t = 0; t < 8; t++) {
        const ox = edge + half + Math.random() * Math.max(0, (w - edge * 2 - box) % step);
        const oy = edge + half + Math.random() * step;
        const list = [];
        // 砖墙一样隔行错开半格：比方格摆得满，看着也不像一排排键盘
        for (let row = 0, y = oy; y <= h - edge - half; row++, y += step * 0.87) {
          for (let x = ox + (row % 2 ? -step / 2 : 0); x <= w - edge - half; x += step) if (x >= edge + half && !blocked(x, y)) list.push({ x, y });
        }
        if (list.length > best.length) best = list;
      }
      if (best.length < n) return null;
      best.sort(() => Math.random() - 0.5);
      return best.slice(0, n).map((q) => ({ x: q.x + rand(-gap / 3, gap / 3), y: q.y + rand(-gap / 3, gap / 3) }));
    }

    /**
     * 章上写的是一个词（英语版的文字顺序题）：按字宽把字号缩小到章里放得下（--fit，index.html 的 .chal--char 用它）。
     * 一个汉字、假名算 1，拉丁字母约 0.55；1.9 个字宽以内不缩
     */
    function fitWord(node, label) {
      const w = [...String(label ?? '')].reduce((n, c) => n + (/[\u2e80-\uffff]/.test(c) ? 1 : 0.55), 0);
      node.style.setProperty('--fit', Math.min(1, 1.9 / Math.max(1, w)).toFixed(3));
    }

    /** 顺序题的一枚章（点击 / 按住的 0 / 诱饵）：先藏着，tick 到它的出现时间再砸下来 */
    function makePart(parent, { kind, pos, box, size, n = null, label = n }) {
      const decoy = kind === '诱饵';
      const btn = el('button', `chal ${decoy ? 'chal--decoy' : `chal--num ${kind === '按住' ? 'chal--hold' : 'chal--tap'}`}`);
      btn.type = 'button';
      btn.setAttribute('aria-label', decoy ? I.tr('挑战：诱饵（别点）') : I.tr('挑战：顺序 {n}', { n: label }));
      btn.style.setProperty('--box', `${box}px`);
      btn.style.setProperty('--art', `${size * 1.5}px`);
      btn.style.left = `${pos.x}px`;
      btn.style.top = `${pos.y}px`;
      btn.style.visibility = 'hidden';
      const body = el('span', 'chal-body');
      // 正面（点击 / 按住的 0 / 诱饵）+ 背面（翻成「?」以后：一律是点击章，看不出是按住还是诱饵）。刻度两面都有，背面的一起走
      body.innerHTML = `<svg viewBox="0 0 120 120" aria-hidden="true"><g class="chal-front">${stampSvg(kind)}</g><g class="chal-back">${stampSvg('点击')}</g></svg>`;
      const word = el('span', `chal-word chal-word--num sticker${decoy ? ' chal-word--decoy' : ''}`);
      I.sticker(word, decoy ? '' : String(label));
      fitWord(word, label);
      body.append(word);
      btn.append(body);
      parent.append(btn);
      return { node: btn, body, pos, n, label, decoy, word, done: false, shown: false, ticks: [...body.querySelectorAll('.chal-tick')], fill: body.querySelector('.chal-fill') };
    }

    /**
     * 数字 count - 1 … 0 各一枚，按格子随机摆开（放不下就整组缩小一点再摆，最小到 0.74 倍；再不行少几个数字）。
     * 一枚隔 spread 秒冒出来（先后打乱）；zeroHold＝最后的 0 要按住。诱饵 decoys 枚：各压住一枚数字的一角，紧跟在那枚后面冒出来。
     * 返回的 node 是一个 0 大小的容器（整波变灰、最后 1 秒硬闪都挂在它上面），parts 是每一枚章；extra＝错开出现和按住多给的限时（毫秒）
     */
    function buildOrder(kind, p) {
      // labels（006「常识改变」）：章上不写数字，写一句话的每个字（「我想堕落」：「我」是 START，按这句话的顺序点）。
      // 写一句，或几句的数组（随机挑一句）；2–6 个字、不能有重复的字。数字先落下来，morph 秒后抖一下变成字（写 false＝直接是字）。
      // 日语、英语版：这句话先查对照表（tr-<语言>.jsonc），再拆成一枚一枚的章——日语和中文一样一个字一枚（「堕ちたい」）；
      // 译文里写了「|」的按它分，一段一枚（英语一个词一枚："I|want|to|fall"）。拆出来还是要 2–6 枚、不重复，不然这一题退回数字
      const pieces = (t) => {
        const s = String(I.tr(String(t)));
        return s.includes('|') ? s.split('|').map((x) => x.trim()).filter(Boolean) : [...s.replace(/\s+/g, '')];
      };
      const phrases = (Array.isArray(p.labels) ? p.labels : p.labels ? [p.labels] : []).map(pieces).filter((cs) => cs.length >= 2 && cs.length <= 6 && new Set(cs).size === cs.length);
      let chars = phrases.length ? phrases[Math.floor(Math.random() * phrases.length)] : null;
      const count = chars ? chars.length : Math.max(2, Math.min(6, Math.round(p.count ?? 4)));
      const decoys = Math.max(0, Math.min(6, Math.round(p.decoys ?? 0)));
      let spots = null;
      let size = p.size ?? 66;
      let hit = Math.max(size, p.hit ?? size + 26);
      let box = Math.max(hit, size * 1.5);
      // 诱饵里有几枚不压数字、自己占一格空地（decoyCover＝压住数字的比例，默认一半）
      let free = decoys - Math.round(decoys * Math.max(0, Math.min(1, p.decoyCover ?? 0.5)));
      // 摆不下时：先让散放的诱饵也改成压在数字上（不占格子），再缩小，再少几个数字（最少 3 个）——画面太矮（电脑上横着的窗口）总比这一题不出好
      let nums = count;
      for (;;) {
        for (const sc of [1, 0.87, 0.74]) {
          for (const gap of [18, 6]) {
            spots = orderSpots(nums + free, box * sc, gap);
            if (spots) break;
          }
          if (spots) {
            [size, hit, box] = [size * sc, hit * sc, box * sc];
            break;
          }
        }
        if (spots || (free === 0 && nums <= Math.min(3, count))) break;
        if (free > 0) free--;
        else nums--;
      }
      if (!spots) return null;
      // 摆不下、少了几枚：这句话就写不全了，退回数字
      if (chars && nums !== chars.length) chars = null;
      const morph = chars && p.morph !== false && !reduce.matches ? Math.max(0.2, Number(p.morph) || 0.6) * 1000 : 0;
      const node = el('div', 'chal-order');
      layer.append(node);
      const spread = Math.max(0, p.spread ?? 0.2) * 1000;
      const zeroHold = p.zeroHold > 0 && Math.random() < (p.zeroHoldChance ?? 1) ? p.zeroHold : 0;
      const turns = Array.from({ length: nums }, (_, i) => i).sort(() => Math.random() - 0.5);
      const parts = [];
      // 反着点（p.reverse，或规则开关「常识替换」S.rules.swap，006）：章上的数字倒过来写——从 0 点到最大的；
      // 里面的先后（START 挂在哪枚、最后一枚要不要按住）一点不变，只是看到的数字反了
      const reverse = p.reverse ?? !!S.rules?.swap;
      for (let i = 0; i < nums; i++) {
        const n = nums - 1 - i;
        const holdZero = n === 0 && zeroHold > 0;
        const part = makePart(node, { kind: holdZero ? '按住' : '点击', pos: spots[i], box, size, n, label: chars && !morph ? chars[i] : reverse ? nums - 1 - n : n });
        if (chars) {
          part.final = chars[i];
          if (!morph) part.node.classList.add('chal--char');
        }
        part.delay = turns[i] * spread;
        if (holdZero) part.holdSec = zeroHold;
        // 最大的数字：一轮的起点，挂「START」
        if (i === 0) {
          part.node.classList.add('chal--start');
          part.node.append(el('span', 'chal-start', 'START'));
        }
        parts.push(part);
      }
      const dBox = size * 1.08;
      const fakes = [];
      const lastDelay = Math.max(0, ...parts.map((x) => x.delay));
      // 散放的诱饵：各占一格空地，混在数字中间陆续冒出来
      for (let k = 0; k < free; k++) {
        const fake = makePart(node, { kind: '诱饵', pos: spots[nums + k], box: dBox, size });
        fake.delay = rand(0, lastDelay + spread * 0.5);
        fakes.push(fake);
      }
      // 压角的诱饵：圆心离被压的那枚 0.55–0.68 个格子——压住它外圈和一角，中间的数字还看得见、点得到，紧跟在那枚后面冒出来。
      // 能点到的范围就是看得到的深色圆（圆形按钮），不会比看到的大
      const { rects, w, h } = obstacles();
      const edge = base().edge ?? 22;
      const under = [...parts].sort(() => Math.random() - 0.5);
      for (let k = 0; k < decoys - free; k++) {
        const target = under[k % under.length];
        let pick = null;
        for (let t = 0; t < 16 && !pick; t++) {
          const a = rand(0, Math.PI * 2);
          const d = box * rand(0.55, 0.68);
          const x = Math.max(edge + dBox / 2, Math.min(w - edge - dBox / 2, target.pos.x + Math.cos(a) * d));
          const y = Math.max(edge + dBox / 2, Math.min(h - edge - dBox / 2, target.pos.y + Math.sin(a) * d));
          const cand = { x, y };
          const inRect = rects.some((q) => x > q.l && x < q.r && y > q.t && y < q.b);
          const tooClose = parts.some((o) => o !== target && Math.hypot(o.pos.x - x, o.pos.y - y) < box * 0.5) || fakes.some((f) => Math.hypot(f.pos.x - x, f.pos.y - y) < dBox);
          if (!inRect && !tooClose && Math.hypot(target.pos.x - x, target.pos.y - y) > box * 0.45) pick = cand;
          else if (t === 15) pick = cand;
        }
        const fake = makePart(node, { kind: '诱饵', pos: pick, box: dBox, size });
        fake.delay = target.delay + Math.max(90, spread * 0.6);
        fakes.push(fake);
      }
      parts.push(...fakes);
      const first = parts.find((x) => x.n === nums - 1);
      const lastShown = Math.max(0, ...parts.map((x) => x.delay));
      const extra = lastShown + zeroHold * 1000 + (morph ? morph + 500 : 0);
      // 整句（点完之后蹦出来、变成他的心声）：一个词一枚的（英语）中间加空格
      const spaced = chars?.some((c) => /^[\x00-\x7f]{2,}$/.test(c));
      return { node, parts, body: null, pos: first.pos, size, count: nums, next: nums - 1, ticks: [], extra, phrase: chars ? chars.join(spaced ? ' ' : '') : null, morphAt: morph ? lastShown + morph : 0 };
    }

    /** 幻化：数字抖几下、糊开，变成字（已经点掉的不管）。点的先后一点没变——只是看到的东西被她换掉了 */
    function morphParts(ch) {
      ch.morphed = true;
      play('魅惑闪光');
      I.emit('challenge', { state: 'morph', kind: ch.kind, x: ch.pos.x, y: ch.pos.y });
      for (const part of ch.parts) {
        if (part.final === undefined) continue;
        part.label = part.final;
        const swap = () => {
          part.node.classList.add('chal--char');
          if (!part.flipped) I.sticker(part.word, String(part.final));
          fitWord(part.word, part.final);
        };
        if (part.done) continue;
        animate(
          part.word,
          [
            { translate: '-50% -50%', filter: 'blur(0) hue-rotate(0deg)', scale: '1' },
            { translate: 'calc(-50% - 4px) -50%', offset: 0.12 },
            { translate: 'calc(-50% + 4px) -50%', offset: 0.24 },
            { translate: 'calc(-50% - 3px) -50%', offset: 0.36 },
            { translate: '-50% -50%', filter: 'blur(4px) hue-rotate(80deg)', scale: '1.3', offset: 0.5 },
            { translate: '-50% -50%', filter: 'blur(0) hue-rotate(0deg)', scale: '1' },
          ],
          { duration: 460, easing: 'ease-in-out' },
        );
        setTimeout(swap, 230);
      }
    }

    function wireOrder(ch) {
      for (const part of ch.parts) {
        if (part.holdSec) {
          // 要按住的 0：轮到它才开始灌；没轮到就按＝点错顺序
          makeHold(part, part.holdSec, { canStart: () => !ch.over && !ch.wave.lost && ch.next === part.n, onFull: () => finishPart(ch, part) });
          part.onEarly = () => tapOrder(ch, part);
          continue;
        }
        const go = (e) => {
          e.preventDefault();
          e.stopPropagation();
          tapOrder(ch, part);
        };
        part.node.addEventListener('pointerdown', go);
        part.node.addEventListener('keydown', (e) => (e.key === 'Enter' || e.key === ' ') && go(e));
      }
      ch.frame = (dt) => {
        for (const part of ch.parts) part.holdFrame?.(dt);
      };
    }

    /** 点了一枚：诱饵 / 不是现在该点的数字＝失手；对了就弹掉这一枚 */
    function tapOrder(ch, part) {
      if (ch.over || part.done || ch.wave.lost || !part.shown) return;
      if (part.decoy) return tapDecoy(ch, part);
      if (part.n !== ch.next) {
        ch.missWhy = '顺序';
        ch.missAt = part;
        peekPart(part);
        part.node.classList.add('chal--wrong');
        return miss(ch);
      }
      finishPart(ch, part);
    }

    /**
     * 点到诱饵：不算输（站主 2026-09-17），这一枚化开，全屏「混乱」confuse 秒（fx.js 画）——限时照走，混乱里还得接着点。
     * 再点到别的诱饵，混乱从那一下重新算；台词条说 decoyLine
     */
    function tapDecoy(ch, part) {
      springDecoy(part, ch.kind, ch.p);
    }

    /** 踩中一枚诱饵（顺序题里的、连打下面藏的）：翻回正面、化开、全屏混乱 confuse 秒（站主 2026-09-18：原来 3.2 秒太短，碰不到下一波，加倍） */
    function springDecoy(part, kind, p = params('顺序')) {
      part.done = true;
      part.node.disabled = true;
      peekPart(part);
      animate(part.body, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
      play('魅惑闪光');
      I.shake();
      I.emit('challenge', { state: 'decoy', kind, x: part.pos.x, y: part.pos.y, seconds: Math.max(0.5, p.confuse ?? 6.4) });
      if (p.decoyLine) sayLine(p.decoyLine);
    }

    /** 这一枚过了（点对 / 按满）；点到 0 这一波就过了 */
    function finishPart(ch, part) {
      if (part.done || ch.over) return;
      part.done = true;
      try {
        part.sound?.stop();
      } catch {}
      part.sound = null;
      part.node.disabled = true;
      part.node.classList.remove('chal--holding');
      part.node.classList.add('chal--hit');
      animate(part.body, [{ transform: 'translate(2px, 3px) scale(0.96)' }, { transform: 'translate(2px, 3px) scale(1.14)', opacity: 1, offset: 0.4 }, { transform: 'scale(0.5)', opacity: 0 }], {
        duration: 260,
        easing: 'ease-out',
        fill: 'forwards',
      });
      shards(part.pos);
      ch.next--;
      if (ch.next >= 0) {
        play('挑战推进');
        I.emit('challenge', { state: 'step', kind: ch.kind, n: part.n, x: part.pos.x, y: part.pos.y });
        return;
      }
      ch.pos = part.pos;
      succeed(ch);
    }

    /** 到出现时间：砸下来 */
    function revealPart(part, now) {
      part.shown = true;
      part.shownAt = now;
      part.node.style.visibility = '';
      animate(part.body, [{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(0.96)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], {
        duration: part.decoy ? 200 : 260,
        easing: 'cubic-bezier(.3,.7,.3,1)',
      });
    }

    /** hide：翻成「?」，只露点击章的背面（按住的 0、诱饵都一样，按到了 peekPart 才翻回来）；最大那枚上的「START」一起收掉（站主：翻面之后只能靠记） */
    function flipPart(part) {
      part.flipped = true;
      I.sticker(part.word, '?');
      part.word.classList.remove('chal-word--decoy');
      part.node.classList.add('chal--flip');
      part.node.querySelector('.chal-start')?.remove();
    }

    /** 翻过面的章被按到：翻回正面——按住的 0 露出空六角开始灌、诱饵露出心、点错的露出数字 */
    function peekPart(part) {
      if (!part.flipped || part.peeked) return;
      part.peeked = true;
      part.node.classList.add('chal--peek');
      I.sticker(part.word, part.decoy ? '' : String(part.label ?? part.n));
    }

    // ---------- 连打：一枚章点很多下 ----------

    function buildMash(kind, p, at = null) {
      const ch = buildStamp(kind, p, at);
      if (!ch) return null;
      ch.node.classList.add('chal--mash');
      const jitter = Math.max(0, Math.round(p.tapsJitter ?? 0));
      ch.taps = Math.max(2, Math.round(p.taps ?? 8) + Math.floor(Math.random() * (jitter * 2 + 1)) - jitter);
      ch.hideTaps = !!p.hideTaps;
      ch.word = ch.body.querySelector('.chal-word');
      ch.word.classList.add('chal-word--num');
      I.sticker(ch.word, ch.hideTaps ? '×?' : `×${ch.taps}`);
      // trap: "accept"（007）：章下面藏的是一块「接受榨取 −n Lv」——打完的那一刻露出来，多点一下就被吸走 n 级（card.js 的 drainShow）
      if (p.trap === 'accept') {
        const btn = el('button', 'chal-accept');
        btn.type = 'button';
        btn.innerHTML = `<span class="chal-accept-word sticker"></span><b class="chal-accept-cost num"></b>`;
        I.sticker(btn.querySelector('.chal-accept-word'), I.tr(p.trapText ?? '接受榨取'));
        btn.querySelector('.chal-accept-cost').textContent = `−${Math.max(1, Math.round(p.trapCost ?? 3))} Lv`;
        btn.style.left = `${ch.pos.x}px`;
        btn.style.top = `${ch.pos.y}px`;
        btn.style.visibility = 'hidden';
        layer.insertBefore(btn, ch.node);
        ch.acceptBtn = btn;
      } else if (p.trap === true || (typeof p.trap === 'number' && Math.random() < p.trap)) {
        const s = ch.size * 0.9;
        ch.trapPart = makePart(layer, { kind: '诱饵', pos: ch.pos, box: s * 1.05, size: s });
        layer.insertBefore(ch.trapPart.node, ch.node);
      }
      return ch;
    }

    /** 连打打完的那一刻：藏着的诱饵露出来，停 trapStay 秒再淡掉；这期间多点一下就踩中 */
    function armTrap(ch) {
      if (ch.acceptBtn) return armAccept(ch);
      const t = ch.trapPart;
      if (!t) return;
      // 打完的连打章还要淡出一会儿，按钮让开（禁用的按钮照样吃点击，点不到下面的诱饵）
      ch.node.style.pointerEvents = 'none';
      t.node.style.visibility = '';
      t.shown = true;
      t.live = true;
      setTimeout(() => {
        if (!t.live) return;
        t.live = false;
        t.node.disabled = true;
        animate(t.node, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
        setTimeout(() => t.node.remove(), reduce.matches ? 0 : 220);
      }, Math.max(0.3, ch.p.trapStay ?? 1.5) * 1000);
    }

    /** 「接受榨取」露出来 trapStay 秒（默认 1.3）：这期间多点一下就答应了；没点就缩回去，她说 resistLine */
    function armAccept(ch) {
      const btn = ch.acceptBtn;
      ch.node.style.pointerEvents = 'none';
      btn.style.visibility = '';
      ch.acceptLive = true;
      if (!reduce.matches) animate(btn, [{ transform: 'translate(-50%, -50%) scale(0.5)', opacity: 0 }, { transform: 'translate(-50%, -50%) scale(1.08)', opacity: 1, offset: 0.6 }, { transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }], { duration: 220, easing: 'cubic-bezier(.3,.7,.3,1)' });
      setTimeout(() => {
        if (!ch.acceptLive) return;
        ch.acceptLive = false;
        btn.disabled = true;
        if (ch.p.resistLine) sayLine(ch.p.resistLine);
        I.emit('challenge', { state: 'refuse', kind: ch.kind });
        animate(btn, [{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
        setTimeout(() => btn.remove(), reduce.matches ? 0 : 220);
      }, Math.max(0.3, ch.p.trapStay ?? 1.3) * 1000);
    }

    function wireTrap(ch) {
      const btn = ch.acceptBtn;
      if (btn) {
        btn.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!ch.acceptLive) return;
          ch.acceptLive = false;
          btn.disabled = true;
          play('魅惑闪光');
          I.emit('challenge', { state: 'accept', kind: ch.kind, levels: Math.max(1, Math.round(ch.p.trapCost ?? 3)), x: ch.pos.x, y: ch.pos.y });
          if (ch.p.trapLine) sayLine(ch.p.trapLine);
          animate(btn, [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 }, { transform: 'translate(-50%, -50%) scale(1.5)', opacity: 0 }], { duration: 300, easing: 'ease-out', fill: 'forwards' });
          setTimeout(() => btn.remove(), reduce.matches ? 0 : 320);
        });
        return;
      }
      const t = ch.trapPart;
      if (!t) return;
      t.node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!t.live) return;
        t.live = false;
        springDecoy(t, ch.kind);
        setTimeout(() => t.node.remove(), 320);
      });
    }

    /** 每按一下（几根手指一起也算）减一，数字跟着跳；减到 0 过 */
    function wireMash(ch) {
      const once = () => {
        if (ch.over || ch.wave.lost || performance.now() < ch.start) return;
        ch.taps--;
        if (ch.taps <= 0) return succeed(ch);
        // hideTaps：一直是「×?」，点到哪一下才过只有打完才知道
        if (!ch.hideTaps) I.sticker(ch.word, `×${ch.taps}`);
        play('挑战推进');
        animate(ch.body, [{ transform: 'translate(2px, 3px) scale(0.9)' }, { transform: 'scale(1.07)', offset: 0.5 }, { transform: 'scale(1)' }], { duration: 120, easing: 'ease-out' });
      };
      ch.node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        once();
      });
      ch.node.addEventListener('keydown', (e) => {
        if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) {
          e.preventDefault();
          once();
        }
      });
    }

    // ---------- 拖动：一条轨道 ----------

    /** 轨道的形状（中心在 0,0 的折线点），走向和镜像随机；零＝一个竖着的椭圆，从正上方起笔往左逆时针描一圈再多走一点（rx / ry 给半径） */
    function shapePoints(shape, { rx = 60, ry = 95 } = {}) {
      let pts;
      if (shape === '零') {
        const n = 96;
        return Array.from({ length: n + 1 }, (_, i) => {
          const a = ((-90 - (405 * i) / n) * Math.PI) / 180;
          return [Math.cos(a) * rx, Math.sin(a) * ry];
        });
      }
      if (shape === '折线') {
        const w = 108;
        const hh = 40;
        pts = [
          [-w / 2, -hh],
          [w / 2, -hh],
          [-w / 2, hh],
          [w / 2, hh],
        ];
      } else if (shape === '弧线') {
        const r = 74;
        pts = Array.from({ length: 25 }, (_, i) => {
          const a = Math.PI + (Math.PI * i) / 24;
          return [Math.cos(a) * r, Math.sin(a) * r + r / 2];
        });
      } else {
        const len = 190;
        const a = (rand(22, 32) * Math.PI) / 180;
        pts = [
          [(-Math.cos(a) * len) / 2, (Math.sin(a) * len) / 2],
          [(Math.cos(a) * len) / 2, (-Math.sin(a) * len) / 2],
        ];
      }
      if (Math.random() < 0.5) pts = pts.map(([x, y]) => [-x, y]);
      if (shape !== '斜线' && Math.random() < 0.5) pts = pts.map(([x, y]) => [x, -y]);
      if (Math.random() < 0.5) pts = pts.reverse();
      return pts;
    }

    /** 每隔 step 像素取一个点，记下走到这里的累计长度 */
    function resample(pts, step = 3) {
      const xs = [pts[0][0]];
      const ys = [pts[0][1]];
      const cum = [0];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1];
        const [bx, by] = pts[i];
        const len = Math.hypot(bx - ax, by - ay);
        const n = Math.max(1, Math.round(len / step));
        for (let k = 1; k <= n; k++) {
          xs.push(ax + ((bx - ax) * k) / n);
          ys.push(ay + ((by - ay) * k) / n);
          cum.push(cum.at(-1) + len / n);
        }
      }
      return { xs, ys, cum, total: cum.at(-1) };
    }

    /** 拖动题的卡形把手（120×120 的坐标）：外圈刻度照旧是限时，中间一张米色小卡写着现在的等级 */
    function cardKnobSvg() {
      const lv = I.cardLv?.() ?? '';
      return `
        <g class="chal-ticks">${Array.from({ length: TICKS }, (_, i) => `<path class="chal-tick" d="${tickPath(i)}"/>`).join('')}</g>
        <g transform="rotate(-8 60 60)">
          <rect x="24" y="38" width="76" height="50" rx="7" fill="${C_INK}"/>
          <rect class="chal-disc" x="20" y="34" width="76" height="50" rx="7" stroke="${C_INK}" stroke-width="3.5"/>
          <rect x="27" y="41" width="62" height="6" rx="2" fill="${C_INK}" opacity="0.18"/>
          <text x="30" y="74" font-family="var(--font-num)" font-size="13" fill="${C_INK}">Lv</text>
          <text x="48" y="77" font-family="var(--font-num)" font-size="26" fill="#1f2c7c">${lv}</text>
        </g>
        <g class="chal-crack" fill="none" stroke="${C_INK}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="40,26 54,50 47,61 66,84 62,98"/>
        </g>`;
    }

    /** 从卡到特写的一条 S 形曲线（三次贝塞尔）：先往下坠、再横着拐进特写，拖的路长一点 */
    function cardRoute(from, to) {
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const c1 = { x: from.x + dx * 0.05, y: from.y + dy * 0.95 };
      const c2 = { x: to.x - dx * 0.85, y: to.y + Math.min(60, Math.abs(dy) * 0.2) };
      return Array.from({ length: 33 }, (_, i) => {
        const k = i / 32;
        const a = (1 - k) ** 3;
        const b = 3 * (1 - k) ** 2 * k;
        const c = 3 * (1 - k) * k * k;
        const d = k ** 3;
        return [a * from.x + b * c1.x + c * c2.x + d * to.x, a * from.y + b * c1.y + c * c2.y + d * to.y];
      });
    }

    function buildDrag(kind, p) {
      const width = p.width ?? 18;
      const knob = p.knob ?? 84;
      const pad = knob / 2 + 6;
      const shapes = Object.keys(p.shapes ?? {}).length ? p.shapes : { 斜线: 1, 折线: 1, 弧线: 1 };
      // 按权重排好形状的先后；放不下就换下一个
      const order = [];
      const left = { ...shapes };
      for (let s = pickWeighted(left, SHAPES); s; s = pickWeighted(left, SHAPES)) {
        order.push(s);
        delete left[s];
      }
      // route（007）：轨道是写好的一串点（app 坐标），比如从冒险者卡弯到开着的特写画框——不随机、不找空地
      if (Array.isArray(p.route)) order.splice(0, order.length, '路线');
      for (const shape of order) {
        // 放在画面正中（place: center）：HUD 下面到放弃按钮上面这一块，size 是占这块高度的比例（零的轨道用）
        const area = p.center ? centerArea() : null;
        const ry = area ? Math.max(40, (area.h / 2 - pad) * Math.min(1, p.size ?? 0.5)) : undefined;
        const rx = area ? Math.max(34, Math.min(ry * 0.62, area.w / 2 - pad)) : undefined;
        const pts = shape === '路线' ? p.route : shapePoints(shape, { rx, ry });
        const xs = pts.map((q) => q[0]);
        const ys = pts.map((q) => q[1]);
        const [minX, maxX, minY, maxY] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const hw = (maxX - minX) / 2 + pad;
        const hh = (maxY - minY) / 2 + pad;
        const pos = shape === '路线' ? { x: (minX + maxX) / 2, y: (minY + maxY) / 2 } : area ? { x: area.x, y: area.y } : findSpot(hw, hh);
        if (!pos) continue;
        // 轨道在自己的画布里：画布左上角在 (pos.x - hw, pos.y - hh)
        const ox = hw - (minX + maxX) / 2;
        const oy = hh - (minY + maxY) / 2;
        const local = pts.map(([x, y]) => [x + ox, y + oy]);
        const path = resample(local);
        const d = `M${local.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`;
        const node = el('div', shape === '零' ? 'chal-drag chal-drag--zero' : 'chal-drag');
        node.style.left = `${pos.x - hw}px`;
        node.style.top = `${pos.y - hh}px`;
        node.style.width = `${hw * 2}px`;
        node.style.height = `${hh * 2}px`;
        const [sx, sy] = local[0];
        const [ex, ey] = local.at(-1);
        // 走向提示：轨道上三个小折角，指向终点
        const chevrons = [0.3, 0.55, 0.8]
          .map((f) => {
            const i = Math.max(0, path.cum.findIndex((c) => c >= path.total * f));
            const j = Math.min(path.xs.length - 1, i + 2);
            const ang = (Math.atan2(path.ys[j] - path.ys[i], path.xs[j] - path.xs[i]) * 180) / Math.PI;
            return `<path class="chal-chevron" d="M-4 -5 L3 0 L-4 5" transform="translate(${path.xs[i].toFixed(1)} ${path.ys[i].toFixed(1)}) rotate(${ang.toFixed(1)})"/>`;
          })
          .join('');
        const scale = knob / 120;
        node.innerHTML = `<svg width="${hw * 2}" height="${hh * 2}" viewBox="0 0 ${hw * 2} ${hh * 2}" aria-hidden="true">
          <path class="chal-track-shadow" d="${d}" transform="translate(3 4)" stroke-width="${width + 5}"/>
          <path class="chal-track-edge" d="${d}" stroke-width="${width + 5}"/>
          <path class="chal-track" d="${d}" stroke-width="${width}"/>
          <path class="chal-track-done" d="${d}" stroke-width="${width - 7}" stroke-dasharray="0 ${path.total.toFixed(1)}"/>
          ${chevrons}
          <g class="chal-goal" transform="translate(${ex.toFixed(1)} ${ey.toFixed(1)})">
            <circle r="17" fill="${C_INK}" transform="translate(2 3)"/>
            <circle class="chal-goal-disc" r="17" stroke="${C_INK}" stroke-width="3"/>
            <circle r="10" fill="none" stroke="${C_INK}" stroke-width="2"/>
            <circle r="4" fill="${C_INK}"/>
          </g>
          <path class="chal-slash" d="${d}" stroke-width="${width - 2}" stroke-dasharray="0 ${(path.total * 2).toFixed(1)}"/>
          <g class="chal-knob" transform="translate(${sx.toFixed(1)} ${sy.toFixed(1)})">
            <g class="chal-pulse"><g transform="scale(${scale.toFixed(3)}) translate(-60 -60)">${p.route ? cardKnobSvg() : stampSvg(kind, { disc: 32, hex: 22 })}</g></g>
          </g>
          <circle class="chal-grab" r="${Math.max(knob / 2, 40)}" cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}"/>
        </svg>`;
        layer.append(node);
        const word = wordEl(kind);
        word.classList.add('chal-word--drag');
        word.style.left = `${sx}px`;
        word.style.top = `${sy}px`;
        // 卡形把手上已经写着字，不另外挂「拖」
        if (!p.route) node.append(word);
        const svg = node.firstElementChild;
        return {
          node,
          body: svg.querySelector('.chal-pulse'),
          svg,
          word,
          path,
          ox: pos.x - hw,
          oy: pos.y - hh,
          knobEl: svg.querySelector('.chal-knob'),
          grab: svg.querySelector('.chal-grab'),
          doneEl: svg.querySelector('.chal-track-done'),
          slash: svg.querySelector('.chal-slash'),
          ticks: [...svg.querySelectorAll('.chal-tick')],
          pos: { x: pos.x - hw + sx, y: pos.y - hh + sy },
          size: knob,
          shape,
        };
      }
      return null;
    }


    // ---------- 分岔（005）：一个岔路口，两头「通过」「奖励」 ----------
    // 往「通过」：松手就往回滑，拖着的时候隔一会儿被猛拽回去一截（她在耳边劝你回头，奖励那头冒一串心）；
    // 往「奖励」：下坡——松手自己往前溜，越往里魅了越深、心越多（fx.js 听 fork 事件）。拖到哪一头的尽头就是选了哪一头。
    // 刚离开岔口（两边都没走出去多远）可以随便换边；限时到了还没选＝选了奖励（犹豫就是答案）。
    // 参数：passSide 通过在哪边（left / right，不写随机）、tug 每次拽回去全长的几成、lureEvery [起, 止] 隔几秒拽一次、
    //       slideBack / slideOn 松手时往回滑 / 往前溜的速度（像素每秒）、lurePool 被拽时她说的、passLine / rewardLine / timeoutLine 选定时说的、
    //       onReward 选了奖励怎么办（lose＝当场败北；不写＝什么也不做，交给超时步骤或 rewardCue）、rewardCue 选了奖励时放的一条定时演出
    function buildFork(kind, p) {
      const area = centerArea();
      const knob = p.knob ?? 84;
      const pad = knob / 2 + 12;
      // track: "heart"（005）：心形，比 Y 字大——左边贴到画面边上（留出滑块的半径），右边停在节奏轨左边一点（轨道线不压到节奏轨上，
      // 滑块走到最右时可以探过去一点），竖向拉长一点
      const heart = p.track === 'heart';
      // track: "spiral"（006）：一条阿基米德螺旋——岔口在螺旋中段（正下方），往外大半圈走到「通过」，往里不到一圈被吸进中心是「奖励」
      const whirl = p.track === 'spiral';
      let ax = area.x;
      let w = Math.max(180, Math.min(area.w - pad * 2, 330));
      if (heart) {
        const box = app.getBoundingClientRect();
        const rail = app.querySelector('#rhythm')?.getBoundingClientRect();
        const lb = (base().edge ?? 22) - 14 + knob / 2;
        const rb = rail?.width ? rail.left - box.left - 8 : box.width - lb;
        w = Math.max(220, Math.min(rb - lb, 330));
        ax = (lb + rb) / 2;
      }
      const h = heart
        ? Math.max(220, Math.min(area.h - pad * 2 - 40, w * 0.904 * 1.15))
        : whirl
          ? Math.max(220, Math.min(area.h - pad * 2 - 40, w))
          : Math.max(200, Math.min(area.h - pad * 2, 380) * Math.min(1, p.size ?? 0.8));
      const hw = w / 2 + pad;
      const hh = h / 2 + pad;
      let J = [hw, hh + h * 0.42];
      const passLeft = p.passSide === 'left' ? true : p.passSide === 'right' ? false : Math.random() < 0.5;
      const ends = { left: [hw - w * 0.42, hh - h * 0.4], right: [hw + w * 0.42, hh - h * 0.4] };
      const curve = (a, b, bend) => {
        const cx = (a[0] + b[0]) / 2 + bend;
        const cy = (a[1] + b[1]) / 2 + 36;
        return Array.from({ length: 33 }, (_, i) => {
          const t = i / 32;
          const u = 1 - t;
          return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]];
        });
      };
      const sideOf = (which) => (which === 'pass' ? (passLeft ? 'left' : 'right') : passLeft ? 'right' : 'left');
      let pts;
      let rest = [];
      if (heart) {
        // 心形线 x = 16 sin³t、y = −(13 cos t − 5 cos 2t − 2 cos 3t − cos 4t)（宽 32、高约 28.9）：心尖（t = π）是岔口，
        // 左右两半各沿外沿往上走到一边的心顶（t = ±0.9，两个终点离得开）；心顶到中间凹口那一小段画成虚线，把心补齐
        const hx = (t) => 16 * Math.sin(t) ** 3;
        const hy = (t) => -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
        const P = (t) => [hw + hx(t) * (w / 32), hh + (hy(t) - 2.535) * (h / 28.93)];
        const run = (a, b, n) => Array.from({ length: n + 1 }, (_, i) => P(a + ((b - a) * i) / n));
        J = P(Math.PI);
        const halves = { right: run(Math.PI, 0.9, 64), left: run(Math.PI, 2 * Math.PI - 0.9, 64) };
        pts = { pass: halves[sideOf('pass')], reward: halves[sideOf('reward')] };
        rest = [run(0.9, 0, 14), run(2 * Math.PI - 0.9, 2 * Math.PI, 14)];
      } else if (whirl) {
        // r = b·θ：中心 θ = 0，岔口在 60% 半径处，往外再走 0.62 圈到头；圈与圈隔 2πb（轨道宽 24，中间留得出缝）
        const rOut = Math.min(w, h) / 2;
        const turnsOut = 0.62;
        const b = (rOut * 0.4) / (turnsOut * 2 * Math.PI);
        const tJ = (rOut * 0.6) / b;
        const tEnd = rOut / b;
        const dir = passLeft ? 1 : -1;
        // 起始角：让岔口落在正下方（和别的分岔一样从下面起手）
        const a0 = Math.PI / 2 - dir * tJ;
        const P = (t) => [hw + Math.cos(a0 + dir * t) * b * t, hh + Math.sin(a0 + dir * t) * b * t];
        const run = (a, z, n) => Array.from({ length: n + 1 }, (_, i) => P(a + ((z - a) * i) / n));
        J = P(tJ);
        pts = { pass: run(tJ, tEnd, 72), reward: run(tJ, 0.35, 96) };
      } else {
        pts = {
          pass: curve(J, ends[sideOf('pass')], sideOf('pass') === 'left' ? -44 : 44),
          reward: curve(J, ends[sideOf('reward')], sideOf('reward') === 'left' ? -44 : 44),
        };
      }
      const d = (list) => `M${list.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L')}`;
      const width = p.width ?? (heart ? 24 : whirl ? 22 : 20);
      const pass = resample(pts.pass);
      const reward = resample(pts.reward);
      const [px, py] = pts.pass.at(-1);
      const [rx, ry] = pts.reward.at(-1);
      const node = el('div', 'chal-drag chal-fork');
      node.style.left = `${ax - hw}px`;
      node.style.top = `${area.y - hh}px`;
      node.style.width = `${hw * 2}px`;
      node.style.height = `${hh * 2}px`;
      const scale = knob / 120;
      // 奖励那条轨上一串心（站主 2026-09-24：原来三颗小心太简陋）：由小到大、黑描边 + 投影 + 高光，
      // 一波一波朝终点跳（CSS 按 --i 错开），滑块走过去时那一颗啵地炸开（wireFork → fork 事件 heartHit）
      const heartAt = heart || whirl ? [0.16, 0.31, 0.46, 0.61, 0.76] : [0.3, 0.55, 0.8];
      const heartMarks = heartAt.map((f, n) => {
        const i = Math.max(0, reward.cum.findIndex((c) => c >= reward.total * f));
        return { at: reward.cum[i], x: reward.xs[i], y: reward.ys[i], s: (heart ? 0.3 : 0.26) + n * 0.045 };
      });
      const hearts = heartMarks
        .map(
          (m, n) => `<g class="chal-fork-hh" style="--i:${n}" transform="translate(${m.x.toFixed(1)} ${m.y.toFixed(1)}) scale(${m.s.toFixed(3)})">
            <g class="chal-fork-hh-in">
              <path d="${HEART}" transform="translate(-55 -54)" fill="${C_INK}"/>
              <path class="chal-fork-hh-body" d="${HEART}" transform="translate(-60 -58)" stroke="${C_INK}" stroke-width="6" stroke-linejoin="round"/>
              <ellipse cx="-11" cy="-10" rx="7" ry="4.5" fill="#fff" opacity=".85" transform="rotate(-35 -11 -10)"/>
            </g>
          </g>`,
        )
        .join('');
      if (heart) node.classList.add('chal-fork--heart');
      if (whirl) node.classList.add('chal-fork--spiral');
      node.innerHTML = `<svg width="${hw * 2}" height="${hh * 2}" viewBox="0 0 ${hw * 2} ${hh * 2}" aria-hidden="true">
          ${rest.map((r) => `<path class="chal-fork-rest" d="${d(r)}" stroke-width="${(width * 0.5).toFixed(1)}"/>`).join('')}
          <path class="chal-track-shadow" d="${d(pts.pass)}" transform="translate(3 4)" stroke-width="${width + 5}"/>
          <path class="chal-track-shadow" d="${d(pts.reward)}" transform="translate(3 4)" stroke-width="${width + 5}"/>
          <path class="chal-track-edge" d="${d(pts.pass)}" stroke-width="${width + 5}"/>
          <path class="chal-track-edge" d="${d(pts.reward)}" stroke-width="${width + 5}"/>
          <path class="chal-track" d="${d(pts.pass)}" stroke-width="${width}"/>
          <path class="chal-track chal-fork-reward" d="${d(pts.reward)}" stroke-width="${width}"/>
          <path class="chal-track-done" data-side="pass" d="${d(pts.pass)}" stroke-width="${width - 7}" stroke-dasharray="0 ${pass.total.toFixed(1)}"/>
          <path class="chal-track-done chal-fork-done-reward" data-side="reward" d="${d(pts.reward)}" stroke-width="${width - 7}" stroke-dasharray="0 ${reward.total.toFixed(1)}"/>
          ${hearts}
          <g class="chal-goal" transform="translate(${px.toFixed(1)} ${py.toFixed(1)})">
            <circle r="19" fill="${C_INK}" transform="translate(2 3)"/>
            <circle class="chal-goal-disc" r="19" stroke="${C_INK}" stroke-width="3"/>
            <circle r="11" fill="none" stroke="${C_INK}" stroke-width="2"/>
            <circle r="4" fill="${C_INK}"/>
          </g>
          <g class="chal-goal chal-fork-goal-reward" transform="translate(${rx.toFixed(1)} ${ry.toFixed(1)})">
            <path d="${HEART}" transform="translate(-58 -56) scale(0.95)" fill="${C_INK}"/>
            <path d="${HEART}" transform="translate(-60 -59) scale(0.95)" stroke="${C_INK}" stroke-width="3" class="chal-fork-heart-goal"/>
          </g>
          <g class="chal-knob" transform="translate(${J[0].toFixed(1)} ${J[1].toFixed(1)})">
            <g class="chal-pulse"><g transform="scale(${scale.toFixed(3)}) translate(-60 -60)">${stampSvg(kind, { disc: 32, hex: 22 })}</g></g>
          </g>
          <circle class="chal-grab" r="${Math.max(knob / 2, 42)}" cx="${J[0].toFixed(1)}" cy="${J[1].toFixed(1)}"/>
        </svg>`;
      layer.append(node);
      // 两头的牌子
      const tag = (text, x, y, cls) => {
        const t = el('span', `chal-fork-tag ${cls} sticker`);
        I.sticker(t, I.tr(text));
        t.style.left = `${x}px`;
        t.style.top = `${y - 40}px`;
        node.append(t);
        return t;
      };
      // 两头牌子上的字能换（006：醒来 / 沉下去）
      tag(p.passTag ?? '通过', px, py, 'chal-fork-tag--pass');
      tag(p.rewardTag ?? '奖励', rx, ry, 'chal-fork-tag--reward');
      const word = wordEl(kind);
      word.classList.add('chal-word--drag');
      word.style.left = `${J[0]}px`;
      word.style.top = `${J[1]}px`;
      node.append(word);
      const svg = node.firstElementChild;
      return {
        node,
        body: svg.querySelector('.chal-pulse'),
        svg,
        word,
        branches: { pass, reward },
        J,
        ox: ax - hw,
        oy: area.y - hh,
        rewardEnd: { x: ax - hw + rx, y: area.y - hh + ry },
        knobEl: svg.querySelector('.chal-knob'),
        grab: svg.querySelector('.chal-grab'),
        doneEls: { pass: svg.querySelector('[data-side="pass"]'), reward: svg.querySelector('[data-side="reward"]') },
        heartMarks: heartMarks.map((m, n) => ({ ...m, el: svg.querySelectorAll('.chal-fork-hh')[n], hit: false })),
        ticks: [...svg.querySelectorAll('.chal-tick')],
        pos: { x: ax - hw + J[0], y: area.y - hh + J[1] },
        size: knob,
      };
    }

    function wireFork(ch, p) {
      const B = ch.branches;
      const tol = p.tolerance ?? 64;
      const JUNCTION = 28;
      const GOAL = 18;
      ch.side = null;
      ch.t = 0;
      ch.dragging = null;
      ch.lureIn = 1.2;
      const at = (side, t) => {
        const br = B[side];
        const i = Math.max(0, br.cum.findIndex((c) => c >= t));
        return [br.xs[i], br.ys[i]];
      };
      const place = () => {
        const [x, y] = ch.side ? at(ch.side, ch.t) : ch.J;
        ch.knobEl.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        ch.grab.setAttribute('cx', x.toFixed(1));
        ch.grab.setAttribute('cy', y.toFixed(1));
        ch.word.style.left = `${x}px`;
        ch.word.style.top = `${y}px`;
        for (const side of ['pass', 'reward']) ch.doneEls[side].setAttribute('stroke-dasharray', `${(ch.side === side ? ch.t : 0).toFixed(1)} ${B[side].total.toFixed(1)}`);
        ch.pos = { x: ch.ox + x, y: ch.oy + y };
        // 奖励那条轨上的心：走过去就炸开（炸过的不再回来）
        if (ch.side === 'reward') {
          for (const m of ch.heartMarks ?? []) {
            if (m.hit || ch.t < m.at) continue;
            m.hit = true;
            m.el?.classList.add('is-hit');
            I.emit('fork', { heartHit: true, x: ch.ox + m.x, y: ch.oy + m.y });
          }
        }
      };
      const finish = (choice, timeout = false) => {
        if (ch.over) return;
        ch.over = true;
        stopSound(ch);
        ch.node.classList.remove('chal--urgent', 'chal--holding');
        ch.node.classList.add(choice === 'pass' ? 'chal--hit' : 'chal--reward');
        if (choice === 'pass') {
          play('挑战斩');
          shards(ch.pos);
        } else {
          play('魅惑闪光');
        }
        popWord({ x: ch.pos.x, y: ch.pos.y - ch.size * 0.45 }, I.tr(choice === 'pass' ? (p.passTag ?? '通过') : (p.rewardTag ?? '奖励')));
        I.emit('fork', { done: choice, x: ch.pos.x, y: ch.pos.y });
        I.emit('challenge', { state: 'hit', kind: '分岔', choice, timeout, x: ch.pos.x, y: ch.pos.y });
        sayLine(timeout ? (p.timeoutLine ?? p.rewardLine) : choice === 'pass' ? p.passLine : p.rewardLine);
        ch.wave.left--;
        resolve(ch, 480);
        // 定时出题（不是超时步骤）：选了奖励按 onReward / rewardCue 办；超时步骤里由 game.6051d2b93f.js 按那一步的 onReward 办
        if (choice === 'reward' && !ch.wave.practice) {
          if (p.onReward === 'lose') {
            S.freeze = true;
            setTimeout(() => I.toFall({ kind: '分岔', why: 'reward' }), 1000);
          } else if (p.rewardCue) I.emit('cue', { cue: p.rewardCue });
        }
      };
      const lure = () => {
        play('挑战脱轨');
        animate(ch.body, [{ transform: 'translate(0, 0)' }, { transform: 'translate(-6px, 3px)', offset: 0.25 }, { transform: 'translate(5px, -2px)', offset: 0.55 }, { transform: 'translate(0, 0)' }], { duration: 320 });
        I.emit('fork', { lure: true, pool: p.lurePool, x: ch.rewardEnd.x, y: ch.rewardEnd.y });
      };
      const release = (id) => {
        if (ch.dragging === null || ch.dragging !== id) return;
        ch.dragging = null;
        ch.node.classList.remove('chal--holding');
      };
      ch.grab.addEventListener('pointerdown', (e) => {
        if (ch.over || ch.dragging !== null) return;
        e.preventDefault();
        e.stopPropagation();
        ch.dragging = e.pointerId;
        try {
          ch.grab.setPointerCapture(e.pointerId);
        } catch {}
        ch.node.classList.add('chal--holding', 'chal--grabbed');
      });
      ch.grab.addEventListener('pointermove', (e) => {
        if (ch.dragging !== e.pointerId || ch.over) return;
        const r = ch.svg.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        // 在岔口附近两边都能选；走出去了就只在这一边上找（能往回退，退回岔口再换边）
        const sides = !ch.side || ch.t < JUNCTION ? ['pass', 'reward'] : [ch.side];
        let best = null;
        for (const side of sides) {
          const br = B[side];
          const cur = side === ch.side ? ch.t : 0;
          for (let i = 0; i < br.xs.length; i++) {
            if (br.cum[i] < cur - 90 || br.cum[i] > cur + 90) continue;
            const dd = Math.hypot(x - br.xs[i], y - br.ys[i]);
            if (!best || dd < best.dd) best = { side, i, dd };
          }
        }
        if (!best || best.dd > tol) return;
        ch.side = best.side;
        ch.t = B[best.side].cum[best.i];
        if (ch.t < 2) ch.side = null;
        place();
        if (ch.side && ch.t >= B[ch.side].total - GOAL) finish(ch.side);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ch.grab.addEventListener(type, (e) => release(e.pointerId));
      ch.grab.addEventListener('touchmove', (e) => ch.dragging !== null && e.preventDefault(), { passive: false });
      ch.frame = (dt) => {
        if (ch.over) return;
        if (ch.dragging === null && ch.side) {
          // 松手：通过那边往回滑，奖励那边往前溜
          if (ch.side === 'pass') ch.t = Math.max(0, ch.t - (p.slideBack ?? 150) * dt);
          else ch.t = Math.min(B.reward.total, ch.t + (p.slideOn ?? 55) * dt);
          if (ch.t <= 0) ch.side = null;
          place();
          if (ch.side === 'reward' && ch.t >= B.reward.total - GOAL) return finish('reward');
        }
        // 拖着往通过走：隔一会儿被拽回去一截
        if (ch.side === 'pass' && ch.t > JUNCTION) {
          ch.lureIn -= dt;
          if (ch.lureIn <= 0) {
            const [lo, hi] = Array.isArray(p.lureEvery) ? p.lureEvery : [1.4, 2.2];
            ch.lureIn = rand(lo, hi);
            ch.t = Math.max(0, ch.t - B.pass.total * (p.tug ?? 0.2));
            if (ch.t <= 0) ch.side = null;
            place();
            lure();
          }
        }
        const k = ch.side ? ch.t / B[ch.side].total : 0;
        if (Math.abs(k - (ch.lastK ?? -1)) > 0.03 || ch.side !== ch.lastSide) {
          ch.lastK = k;
          ch.lastSide = ch.side;
          I.emit('fork', { k, side: ch.side, x: ch.pos.x, y: ch.pos.y });
        }
      };
      ch.timeout = () => finish('reward', true);
    }

    /** 拖动：抓住滑块沿轨道走；只往前算；离轨道超过 tolerance 就脱轨，弹回上一个检查点（全长 checkpoints 等分） */
    function wireDrag(ch, p) {
      const tol = p.tolerance ?? 46;
      const cps = Math.max(1, p.checkpoints ?? 4);
      ch.idx = 0;
      ch.dragging = null;
      ch.passed = 0;
      const place = () => {
        const { xs, ys, cum, total } = ch.path;
        const x = xs[ch.idx];
        const y = ys[ch.idx];
        ch.knobEl.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)})`);
        ch.grab.setAttribute('cx', x.toFixed(1));
        ch.grab.setAttribute('cy', y.toFixed(1));
        ch.word.style.left = `${x}px`;
        ch.word.style.top = `${y}px`;
        ch.doneEl.setAttribute('stroke-dasharray', `${cum[ch.idx].toFixed(1)} ${total.toFixed(1)}`);
        ch.pos = { x: ch.ox + x, y: ch.oy + y };
      };
      // 走到离终点不到终点靶的半径（17px）就算到了：手指停在靶里、差一点没压到线尾也行
      const GOAL = 17;
      const release = (id) => {
        if (ch.dragging === null || ch.dragging !== id) return;
        ch.dragging = null;
        ch.node.classList.remove('chal--holding');
      };
      const slip = () => {
        const { cum, total } = ch.path;
        const back = (Math.floor((cum[ch.idx] / total) * cps) * total) / cps;
        ch.idx = Math.max(0, cum.findIndex((c) => c >= back - 0.01));
        ch.passed = Math.floor((cum[ch.idx] / total) * cps);
        const id = ch.dragging;
        release(id);
        try {
          ch.grab.releasePointerCapture(id);
        } catch {}
        place();
        play('挑战脱轨');
        ch.node.classList.remove('chal--slip');
        void ch.node.offsetWidth;
        ch.node.classList.add('chal--slip');
      };
      ch.grab.addEventListener('pointerdown', (e) => {
        if (ch.over || ch.dragging !== null) return;
        e.preventDefault();
        e.stopPropagation();
        ch.dragging = e.pointerId;
        try {
          ch.grab.setPointerCapture(e.pointerId);
        } catch {}
        ch.node.classList.add('chal--holding', 'chal--grabbed');
      });
      ch.grab.addEventListener('pointermove', (e) => {
        if (ch.dragging !== e.pointerId || ch.over) return;
        const r = ch.svg.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const { xs, ys, cum, total } = ch.path;
        const from = cum[ch.idx] - 30;
        const to = cum[ch.idx] + 80;
        let best = -1;
        let bd = Infinity;
        for (let i = 0; i < xs.length; i++) {
          if (cum[i] < from) continue;
          if (cum[i] > to) break;
          const dd = Math.hypot(x - xs[i], y - ys[i]);
          if (dd < bd) {
            bd = dd;
            best = i;
          }
        }
        if (bd > tol) return slip();
        if (best <= ch.idx) return;
        ch.idx = best;
        place();
        const passed = Math.floor((cum[ch.idx] / total) * cps);
        if (passed > ch.passed && cum[ch.idx] < total - GOAL) play('挑战推进');
        ch.passed = passed;
        if (cum[ch.idx] >= total - GOAL) {
          ch.idx = xs.length - 1;
          place();
          succeed(ch);
        }
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) ch.grab.addEventListener(type, (e) => release(e.pointerId));
      // 保险：不认 touch-action 的内置浏览器（微信、QQ 这类）也别把拖动当成页面滑动——拖着的时候拦掉 touchmove
      ch.grab.addEventListener('touchmove', (e) => ch.dragging !== null && e.preventDefault(), { passive: false });
    }

    /**
     * 「放弃」按钮上的几个位置（place: "quit"）：中后段放弃是一整条宽按钮，就沿着它从左到右错落着排（高低不齐、左右抖一点）；
     * 前段只有右下角的小药丸，就压在它上面、一个比一个往左上。按钮不在画面上返回 null（照常找空地）
     */
    function quitSpots(n) {
      const box = app.getBoundingClientRect();
      // 看放弃按钮现在是哪种形态（game.js 按段切：前段药丸、中后段整条）；刚切过去时还在过渡，不量透明度
      const state = app.querySelector('#quit')?.dataset.state;
      const target = state === 'pill' ? app.querySelector('#quit-pill') : state === 'bar' || state === 'pulse' ? app.querySelector('#quit-bar') : null;
      if (!target || !target.offsetWidth) return null;
      // 按布局位置算（不含 transform）：刚从药丸切成整条时，整条还在从下面滑上来的过渡里
      let l = 0;
      let t = 0;
      for (let n = target; n && n !== app; n = n.offsetParent) {
        l += n.offsetLeft;
        t += n.offsetTop;
      }
      const w = target.offsetWidth;
      const r = { height: target.offsetHeight };
      const clampX = (x) => Math.max(52, Math.min(box.width - 52, x));
      const clampY = (y) => Math.max(60, Math.min(box.height - 64, y));
      return Array.from({ length: n }, (_, i) =>
        w > 160
          ? { x: clampX(l + w * (0.17 + (0.66 * i) / Math.max(1, n - 1)) + rand(-18, 18)), y: clampY(t + 6 + (i % 2 ? -30 : 0) + rand(-8, 8)) }
          : { x: clampX(l + w / 2 - i * 62 + rand(-10, 10)), y: clampY(t + r.height / 2 - i * 38 + rand(-8, 8)) },
      );
    }

    // ---------- 一波从出到收 ----------

    /** 某种题这一次的限时（秒）：cue（定时出题）写的 > 演出表 / common.jsonc；组合里的题乘 comboTime */
    function timeOf(kind, c = cell(), cue = null, combo = false) {
      const t = cue?.time > 0 ? cue.time : (params(kind, c).time ?? TIME_DEFAULT[kind]);
      return combo ? t * (c.comboTime ?? base().comboTime ?? 1.25) : t;
    }

    /**
     * 出一波：kinds 一个或几个题型（同时出），也可以直接写「点击+按住」。
     * cue＝定时出题那一条：time / hold 盖过演出表和 common.jsonc 的，pool 是她出题时说的。有一题放不下就整波不出（返回 null，过一会儿再试）
     */
    function spawn(kinds, { practice, cue } = {}) {
      if (typeof kinds === 'string') kinds = kindsOf(kinds);
      if (busy() || !kinds?.length) return null;
      const c = cell();
      const combo = kinds.length > 1;
      // 无敌模式（S.invincible，game.js）：每一波都当练习题——失手不败北；章上写「无敌」不写「练习」
      const drill = practice ?? c.onMiss === 'practice';
      const inv = !!S.invincible && S.screen !== 'endless';
      // 扣级（007）：失手不败北，card.js 按 card.miss 扣等级；练习、无敌照旧优先
      const drain = !drill && !inv && (cue?.onMiss ?? c.onMiss) === 'card';
      // 罚时加秒（008 的 21 点）：失手不败北，blackjack.js 接 challenge { state: 'miss', addSec } 把罚时往后加
      const addSec = !drill && !inv && !drain && (cue?.onMiss ?? c.onMiss) === 'time' ? Math.max(1, Math.round(Number(cue?.missSeconds ?? c.missSeconds) || 3)) : 0;
      // 定时出题可以写 miss（这一题失手扣几级，盖过 card.miss）和 missTag（章上的小签，比如挡吸取的写「没挡住」）
      const wave = { left: kinds.length, practice: drill || inv || drain || addSec > 0, inv: inv && !drill, drain, addSec, missLv: cue?.miss, missTag: cue?.missTag, missLine: cue?.missLine ?? c.missLine, hitLine: cue?.hitLine, lost: false };
      // 先放拖动（占地方最大）、再放单枚的章；顺序最后放：它按格子摆，能把剩下的空当填满（先放它的话散开的几枚会把单枚章挤得没地方）
      const room = (k) => (k === '分岔' ? 3 : k === '拖动' ? 2 : k === '顺序' ? 0 : 1);
      const order = [...kinds].sort((a, b) => room(b) - room(a));
      const placed = [];
      const spots = cue?.place === 'quit' ? quitSpots(order.length) : null;
      // place: "watch"（006）：点击 / 诱饵挂在怀表上、跟着它摆（fx.js 的 watchPoint）。怀表这会儿不在画面上：先把它叫出来（watchSummon），
      // 这一次不出、等定时出题那边过 0.3 秒再试——绝不落到别的地方去（站主 2026-10-03：诱饵没跟着怀表走）。这张图根本没配怀表才照常找空地
      let wp = null;
      if (cue?.place === 'watch') {
        wp = I.watchPoint?.() ?? null;
        if (!wp && I.watchSummon?.(1.2)) return null;
        I.watchSummon?.(1.2);
      }
      // place: "card"（007）：出在冒险者卡上（card.js 的 cardPoint；卡不在画面上就照常找空地）
      const cp = cue?.place === 'card' ? (I.cardPoint?.() ?? null) : null;
      let hardPool = null;
      C.placing = placed;
      for (const [idx, kind] of order.entries()) {
        const p = { ...params(kind, c) };
        if (cue?.hold > 0) p.hold = cue.hold;
        // 超时步骤出的题（game.js）：指定形状、大小、放正中
        if (cue?.shape) p.shapes = { [cue.shape]: 1 };
        if (cue?.size > 0) p.size = cue.size;
        if (cue?.place === 'center') p.center = true;
        // route: "卡→特写"（007 第 2 组）：从冒险者卡沿着一条弯弯的曲线拖到开着的胸部特写里；特写还没开（或正在进出）就这一次不出、等一下再试
        if (cue?.route === '卡→特写' && kind === '拖动') {
          const from = I.cardPoint?.();
          const to = I.closeupAim?.();
          if (!from || !to) {
            for (const x of placed) x.node.remove();
            C.placing = null;
            return null;
          }
          p.route = cardRoute(from, to);
          p.goalHearts = true;
        }
        if (cue?.shape === '零') p.checkpoints = Math.max(p.checkpoints ?? 4, 8);
        // 定时出题可以单独写：顺序的几个数字 / 诱饵 / 翻面 / 错开 / 按住的 0，连打的下数，按住的 onHold
        for (const k of ['count', 'decoys', 'hide', 'spread', 'zeroHold', 'zeroHoldChance', 'reverse', 'taps', 'tapsJitter', 'hideTaps', 'trap', 'trapStay', 'trapCost', 'trapText', 'trapLine', 'onHold', 'labels', 'morph', 'luredLine', 'resistLine', 'confuse', ...FORK_KEYS]) if (cue?.[k] !== undefined) p[k] = cue[k];
        // 上过钩（这一组点过怀表上的诱饵，S.lured）：顺序题换成 lured 里写的那一套（更多数字、诱饵、翻面、限时、她说的那句）
        const hard = S.lured > 0 && kind === '顺序' ? (cue?.lured ?? p.lured) : null;
        if (hard && typeof hard === 'object') {
          Object.assign(p, hard);
          hardPool = hard.pool ?? hardPool;
        }
        const onWatch = wp && (kind === '点击' || kind === '诱饵' || kind === '按住') ? { x: wp.x, y: wp.y } : null;
        const onCard = cp && (kind === '点击' || kind === '按住' || kind === '连打') ? { x: cp.x, y: cp.y } : null;
        if (onWatch) Object.assign(p, kind === '点击' ? { ring: true, size: watchSize(wp), hit: watchSize(wp) * 1.1 } : { size: Math.max(64, Math.min(150, wp.r * 2.3)), trackR: wp.r * 1.1 });
        const ch =
          kind === '分岔' ? buildFork(kind, p)
          : kind === '拖动' ? buildDrag(kind, p)
          : kind === '顺序' ? buildOrder(kind, p)
          : kind === '连打' ? buildMash(kind, p, onCard ?? spots?.[idx])
          : kind === '诱饵' ? buildLure(p, onWatch)
          : buildStamp(kind, p, onWatch ?? onCard ?? spots?.[idx]);
        if (!ch) {
          for (const x of placed) x.node.remove();
          C.placing = null;
          return null;
        }
        const secs = hard?.time > 0 ? hard.time * (combo ? (c.comboTime ?? base().comboTime ?? 1.25) : 1) : timeOf(kind, c, cue, combo);
        Object.assign(ch, { kind, p, wave, over: false, time: secs * 1000 + (ch.extra ?? 0), follow: !!onWatch, track: !!onWatch && kind === '按住', order: cue?.order ?? null, place: onCard ? 'card' : null });
        placed.push(ch);
      }
      C.placing = null;
      const now = performance.now();
      // stagger：一个接一个砸下来；出现之前藏着、点不到，限时从出现起算。砸在放弃上的那种按左中右打乱一下先后
      const gap = Math.max(0, cue?.stagger ?? 0) * 1000;
      const turn = spots ? placed.map((_, i) => i).sort(() => Math.random() - 0.5) : placed.map((_, i) => i);
      for (const [i, ch] of placed.entries()) {
        const delay = gap * turn.indexOf(i);
        Object.assign(ch, { start: now + delay, last: now + delay });
        if (ch.kind === '点击') wireTap(ch);
        else if (ch.kind === '按住') wireHold(ch, ch.p);
        else if (ch.kind === '顺序') wireOrder(ch);
        else if (ch.kind === '连打') {
          wireMash(ch);
          wireTrap(ch);
        }
        else if (ch.kind === '分岔') wireFork(ch, ch.p);
        else if (ch.kind === '诱饵') wireLure(ch);
        else wireDrag(ch, ch.p);
        const land = () => {
          if (!C.list.includes(ch) || ch.over) return;
          ch.node.style.visibility = '';
          if (!spots) streak(ch.pos);
          if (delay) {
            play('挑战出现');
            I.shake();
          }
          // 顺序：每一枚到自己的时间才砸下来（tick 里 revealPart）
          if (ch.parts) return;
          animate(
            ch.kind === '拖动' || ch.kind === '分岔' ? ch.node : ch.body,
            [
              { transform: `scale(${ch.kind === '拖动' || ch.kind === '分岔' ? 1.15 : 1.6})`, opacity: 0 },
              { transform: 'scale(0.96)', opacity: 1, offset: 0.7 },
              { transform: 'scale(1)', opacity: 1 },
            ],
            { duration: 280, easing: 'cubic-bezier(.3,.7,.3,1)' },
          );
        };
        if (delay) {
          ch.node.style.visibility = 'hidden';
          setTimeout(land, delay);
        } else land();
      }
      C.list = placed;
      C.lastPos = placed.at(-1).pos;
      play('挑战出现');
      I.emit('challenge', { state: 'show', kinds, kind: kinds[0], practice: wave.practice, watch: !!wp });
      sayLine(hardPool ?? cue?.pool ?? c.showLine);
      // 诱饵写了 luredLine / resistLine：碰没碰有了结果她才说话，这之前各段的台词条先不换（不然刚换上一句就被那句盖掉）
      const lureTalk = placed.find((x) => x.kind === '诱饵' && (x.p.luredLine || x.p.resistLine));
      if (lureTalk) S.nextLineAt = Math.max(S.nextLineAt ?? 0, S.elapsed + lureTalk.time / 1000 + 0.3);
      // order（006）：出题的同时下一道命令（不带「遵命」按钮），大字放在画面上面一点，不挡题
      if (cue?.order) I.command?.({ text: String(cue.order), hold: cue.orderHold ?? 1.8, reward: false, y: cue.orderY ?? 0.2 });
      return placed;
    }

    function tick(now) {
      for (const ch of C.list) {
        if (ch.over || now < ch.start) continue;
        const dt = Math.min(0.1, (now - ch.last) / 1000);
        ch.last = now;
        const left = 1 - (now - ch.start) / ch.time;
        const lit = Math.ceil(Math.max(0, left) * TICKS);
        // 顺序：每一枚都有自己的一圈刻度，一起走（原来只有第一枚在走——站主发现后面的一直是空的）
        for (const ticks of ch.parts ? ch.parts.map((x) => x.ticks) : [ch.ticks]) ticks.forEach((t, i) => t.classList.toggle('is-off', i % TICKS >= lit));
        ch.node.classList.toggle('chal--urgent', now - ch.start > ch.time - 1000);
        // 挂在怀表上的：题在场就一直把怀表留在画面上（不管镜头切到哪），跟着它摆。
        // 真的找不到表了（超过半秒）：这一题悄悄收掉，不算失手
        if (ch.follow) {
          I.watchSummon?.(0.6);
          const q = I.watchPoint?.();
          if (q) {
            ch.lostAt = 0;
            ch.pos = { x: q.x, y: q.y };
            ch.node.style.left = `${q.x.toFixed(1)}px`;
            ch.node.style.top = `${q.y.toFixed(1)}px`;
          } else if (!ch.lostAt) ch.lostAt = now;
          else if (now - ch.lostAt > 500) {
            if (ch.timeout) ch.timeout();
            else {
              ch.over = true;
              ch.node.disabled = true;
              ch.wave.left--;
              resolve(ch, 120);
            }
            continue;
          }
        }
        if (ch.morphAt && !ch.morphed && now >= ch.start + ch.morphAt) morphParts(ch);
        if (ch.parts) {
          for (const part of ch.parts) {
            if (!part.shown && now >= ch.start + part.delay) revealPart(part, now);
            // hide：这一枚出现 hide 秒后还没点就翻成「?」
            if (ch.p.hide > 0 && part.shown && !part.flipped && !part.done && now - part.shownAt > ch.p.hide * 1000) flipPart(part);
          }
        }
        ch.frame?.(dt);
        if (!ch.over && left <= 0) (ch.timeout ? ch.timeout() : miss(ch));
      }
    }

    function succeed(ch) {
      if (ch.over || !C.list.includes(ch) || ch.wave.lost) return;
      ch.over = true;
      stopSound(ch);
      if (ch.node.tagName === 'BUTTON') ch.node.disabled = true;
      ch.node.classList.remove('chal--urgent', 'chal--holding');
      ch.node.classList.add('chal--hit');
      play(ch.kind === '拖动' ? '挑战斩' : '挑战命中');
      I.emit('challenge', { state: 'hit', kind: ch.kind, x: ch.pos.x, y: ch.pos.y, phrase: ch.phrase ?? undefined, place: ch.place ?? undefined });
      if (ch.order) I.emit('challenge', { state: 'obeyed', kind: ch.kind });
      armTrap(ch);
      if (ch.kind === '顺序') {
        // 最后一枚（0）已经在 tapOrder 里弹掉了；剩下的诱饵缩掉
        for (const part of ch.parts) {
          if (part.done) continue;
          part.node.disabled = true;
          animate(part.body, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.4)', opacity: 0 }], { duration: 240, easing: 'ease-in', fill: 'forwards' });
        }
      } else if (ch.kind === '拖动') {
        const total = ch.path.total;
        if (!reduce.matches && ch.slash.animate) {
          ch.slash.animate(
            [
              { strokeDasharray: `0 ${total * 2}`, strokeDashoffset: 0, opacity: 1 },
              { strokeDasharray: `${total * 0.45} ${total * 2}`, strokeDashoffset: -total * 0.55, opacity: 1, offset: 0.6 },
              { strokeDasharray: `${total * 0.1} ${total * 2}`, strokeDashoffset: -total, opacity: 0 },
            ],
            { duration: 300, easing: 'ease-out', fill: 'forwards' },
          );
        }
        animate(ch.body, [{ transform: 'scale(1)' }, { transform: 'scale(1.3)', opacity: 1, offset: 0.4 }, { transform: 'scale(0.4)', opacity: 0 }], { duration: 300, fill: 'forwards' });
      } else if (ch.p.ring) {
        // 套在怀表上的环（站主 2026-10-03）：点了之后整个环往上升起、同时淡掉——表已经摆走了，在原地缩掉显得割裂；往上飘像翻白眼
        animate(ch.body, [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(-34px) scale(1.06)', opacity: 0.85, offset: 0.3 }, { transform: 'translateY(-150px) scale(0.92)', opacity: 0 }], {
          duration: 760,
          easing: 'cubic-bezier(.3,.6,.4,1)',
          fill: 'forwards',
        });
      } else {
        animate(ch.body, [{ transform: 'translate(2px, 3px) scale(0.96)' }, { transform: 'translate(2px, 3px) scale(1.12)', opacity: 1, offset: 0.4 }, { transform: 'scale(0.5)', opacity: 0 }], {
          duration: 300,
          easing: 'ease-out',
          fill: 'forwards',
        });
      }
      if (!ch.p.ring) shards(ch.pos);
      if (DONE_WORD[ch.kind] && !ch.p.ring) popWord({ x: ch.pos.x, y: ch.pos.y - ch.size * 0.35 }, ch.phrase ?? I.tr(DONE_WORD[ch.kind]));
      // 这一波全做完了她才说一句
      if (--ch.wave.left === 0) sayLine(ch.wave.hitLine ?? cell().hitLine);
      // 拖进特写里（route，007）：终点那儿冒一把心
      if (ch.p.goalHearts && ch.path) {
        const g = { x: ch.ox + ch.path.xs.at(-1), y: ch.oy + ch.path.ys.at(-1) };
        I.heartSpray?.(g.x, g.y, { count: 12, spread: 90, rise: 70, size: [12, 26] });
        I.charmBoost?.(0.15);
        play('接触');
      }
      resolve(ch, reduce.matches ? 200 : ch.p.ring ? 780 : 340);
    }

    function miss(ch) {
      if (ch.over) return;
      ch.over = true;
      stopSound(ch);
      if (ch.node.tagName === 'BUTTON') ch.node.disabled = true;
      for (const part of ch.parts ?? []) part.node.disabled = true;
      ch.trapPart?.node.remove();
      ch.acceptBtn?.remove();
      ch.node.classList.remove('chal--urgent', 'chal--holding');
      ch.node.classList.add('chal--miss');
      play('挑战失手');
      I.shake();
      const lost = ch.wave.drain || (S.screen === 'endless' && I.cardMiss) ? Math.max(0, Math.round(ch.wave.missLv ?? I.cardMiss?.() ?? 0)) : 0;
      const tag = ch.wave.inv ? I.tr('无敌') : lost > 0 ? I.tr('−{n} 级', { n: lost }) : ch.wave.addSec ? I.tr('+{n} 秒', { n: ch.wave.addSec }) : ch.wave.missTag ? I.tr(ch.wave.missTag) : ch.wave.practice ? I.tr('练习') : S.screen === 'endless' ? I.tr('无尽') : null;
      const stamp = I.stampNode(tag, I.tr('失手'));
      const wrap = el('div', 'chal-miss');
      // 顺序：「失手」盖在点错的那枚上；超时就盖在该点还没点的那枚上
      const at = ch.parts ? (ch.missAt ?? ch.parts.find((x) => x.n === ch.next) ?? ch.parts[0]).pos : ch.pos;
      wrap.style.left = `${at.x}px`;
      wrap.style.top = `${at.y}px`;
      wrap.append(stamp);
      layer.append(wrap);
      I.slam(stamp);
      // 无尽战斗（站主 2026-09-24）：失手不算输——和点到诱饵一样全屏迷惑一阵，魅了加深，战斗照常（无尽战斗只有自己放弃才结束）
      const endless = S.screen === 'endless';
      I.emit('challenge', { state: 'miss', kind: ch.kind, why: ch.missWhy, practice: ch.wave.practice || endless, drain: lost > 0 ? lost : undefined, addSec: ch.wave.addSec || undefined, place: ch.place ?? undefined });
      if (endless) {
        I.emit('challenge', { state: 'decoy', kind: ch.kind, x: at.x, y: at.y, seconds: Math.max(0.5, base().endlessConfuse ?? 4.5) });
        ch.wave.left--;
        resolve(ch, 900, wrap);
        return;
      }
      if (ch.wave.practice) {
        if (ch.wave.missLine) I.say(ch.wave.missLine);
        ch.wave.left--;
        resolve(ch, 900, wrap);
        return;
      }
      // 败北：这一波别的题也停住，时间停住（节奏照跑），停一下再进结算
      ch.wave.lost = true;
      for (const other of C.list) {
        if (other === ch || other.over) continue;
        other.over = true;
        stopSound(other);
        if (other.node.tagName === 'BUTTON') other.node.disabled = true;
        for (const part of other.parts ?? []) part.node.disabled = true;
        other.node.classList.remove('chal--urgent', 'chal--holding');
        other.node.classList.add('chal--miss');
      }
      S.freeze = true;
      setTimeout(() => C.list.includes(ch) && I.toFall({ kind: ch.kind, why: ch.missWhy }), (base().missHold ?? 0.8) * 1000);
    }

    /** 收掉这一题；这一波都收完了就排下一波 */
    function resolve(ch, delay, extra) {
      setTimeout(() => {
        if (!C.list.includes(ch)) return;
        const gone = () => {
          ch.node.remove();
          extra?.remove();
        };
        // 淡出 160ms 再删；不等动画回调（后台标签页里动画不走，回调不来）
        animate(ch.node, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
        if (extra) animate(extra, [{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards' });
        setTimeout(gone, reduce.matches ? 0 : 170);
        C.list = C.list.filter((x) => x !== ch);
        if (busy()) return;
        C.lastEnd = S.elapsed;
        const [lo, hi] = every(cell());
        C.nextAt = S.elapsed + rand(lo, hi);
      }, delay);
    }

    /** 作废（换画面、切到后台）：不算失手，画面上的全清掉 */
    function cancel() {
      for (const ch of C.list) stopSound(ch);
      C.list = [];
      layer.replaceChildren();
    }

    // ---------- 接事件 ----------

    const on = T.on;
    on('screen', ({ screen }) => {
      cancel();
      if (screen === 'hold' || screen === 'endless') {
        C.nextAt = null;
        C.lastEnd = -Infinity;
      }
    });
    on('pause', ({ state }) => {
      if (state !== 'hidden' || !busy()) return;
      cancel();
      C.lastEnd = S.elapsed;
      C.nextAt = S.elapsed + (base().gap ?? 4);
    });
    on('finish', () => cancel());

    // 定时出题（「挑战-点击」「挑战-点击+按住」）：到点出；有题在场、长按放弃中、cut-in 切进来时，每 0.3 秒再试一次，最多等 4 秒（还得是同一组的战斗里）
    on('cue', ({ cue }) => {
      const kinds = kindsOf(/^挑战-(.+)$/.exec(cue?.fx ?? '')?.[1]);
      if (!kinds) return;
      const set = S.set;
      let tries = 0;
      const attempt = () => {
        if (!I.inBattle() || S.set !== set || S.finishLeft > 0 || tries++ > 13) return;
        const wait = busy() || S.press || S.cutinBusy || S.resumeLeft > 0;
        if (wait || !spawn(kinds, { cue })) setTimeout(attempt, 300);
      };
      attempt();
    });

    const prevAfter = MV.afterFrame;
    MV.afterFrame = (dt) => {
      prevAfter?.(dt);
      if (!I.inBattle()) return;
      if (busy()) tick(performance.now());
      else due();
    };

    // game.6051d2b93f.js 的超时步骤（do: challenge）也从这里出题
    I.challenge = { active: busy, spawn: (kind, opts) => (I.inBattle() ? spawn(kind, opts) : null) };
    T.tune.challenge = {
      /** 在战斗里马上出一波（调节器试放）：kind 写「点击」或「点击+按住」；opts.practice＝失手不败北、opts.cue＝当成定时出题（time / hold / count / decoys / hide） */
      spawn: (kind = '点击', opts = {}) => (I.inBattle() ? !!spawn(kind, opts) : false),
      active: busy,
      /** 测试出题：每组前中后段、无尽都 6–10 秒一题（同地址 ?challenge=test） */
      test: (on) => {
        C.test = !!on;
        C.nextAt = null;
      },
      testing: () => C.test,
      kinds: () => [...KINDS],
      /** 调试：现在第一题的状态（按住的进度、拖动走到哪），count＝这一波画面上还有几题 */
      state: () => {
        const ch = C.list[0];
        return ch
          ? {
              kind: ch.kind,
              progress: ch.progress,
              idx: ch.idx,
              total: ch.path?.total,
              shape: ch.shape,
              next: ch.next,
              taps: ch.taps,
              parts: ch.parts?.map((x) => ({ n: x.n, decoy: x.decoy, done: x.done, shown: x.shown, hold: !!x.holdSec, x: x.pos.x, y: x.pos.y })),
              over: ch.over,
              count: C.list.length,
              kinds: C.list.map((x) => x.kind),
            }
          : null;
      },
    };
  };

  if (window.tobatsu?.ready) start();
  else window.addEventListener('tobatsu:ready', start, { once: true });
})();
