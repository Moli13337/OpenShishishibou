// 讨伐任务 · 21 点（008 · 赌场舞娘起）
//
// 委托写了 blackjack 段才有，别的委托一概不动。规则（站主 2026-10-23 定，10-25 改成「输了才撑」，10-25 第二版加上荷官小姐的诱惑与出千）：
//   每一组从 0 秒开始，秒数数到 0 不算过——赢够这一组要求的手数（wins）才过。
//   每一手：你两张明牌，荷官小姐一张明牌一张暗牌。轮到你时有 think 秒（默认 10，整手共用）：「要牌」抽一张（A 算 1 或 11、J Q K 算 10），
//     超过 21 点＝爆牌；「停牌」不再要；时间到了没选就自动停牌。思考时间是按钮下面那根进度条，不走左下的秒数。
//   停牌以后她翻开暗牌，按庄家规矩补到 dealerStand（17）点，比大小：
//     赢了＝胜一手（加倍赢了算两手）；输了＝她的点数变成你要撑的秒数；爆牌＝你自己的点数变成秒数；加倍输了翻倍；平局不罚。
//     罚的秒数照常握着跟节奏撑（题、台词、特写都在这时候出；题失手照常败北），数到 0 才发下一手。
//   节奏：发牌、想牌、翻牌的时候是前段（慢），输了罚时是中段，爆牌罚时是后段（快）——game.js 的 setPhase 马上换段。
//   天生 21 点（头两张就是 21）当场赢；她明牌是 A 或 10 点时先偷看暗牌，她是天生 21 点就当场输（罚 21 秒）。
//   她明牌是 A 时（insurance）先问你买不买保险：买了，她是 21 点就不罚；不是的话另罚 insuranceCost 秒。
//   surrender 投降：头两张牌时可以认输，这一手只罚 surrenderCost 秒（默认 10）。
//   split 分牌：头两张点数一样时可以拆成两手（第二手挪到左边一格），各补一张、各想各的（每手 think 秒），她补完牌后各自比大小——
//     赢几手记几胜，输了的、爆了的罚秒数加起来；分 A 各补一张就停；分过的牌不能再分、不能加倍、不能投降。
//   加倍 / 分牌 / 投降在「要牌 停牌」上面一排小按钮，第一次出来时旁边冒一句怎么玩。
//
// 破法护符（amulet）：开局戴着，赌桌上的魔法都失效。她用魔法改写牌面的时候（牌下亮起心形魔法阵、发光的黑心卷到牌上），
//   护符上砸一枚「点！」——点到＝护符张开结界把魔法打散；没点到＝牌被改写（她赢）。
//   magicFinal：你这一手要拿到这一组最后一胜时，她挣扎一次（第 1、2、4 组）；magicWindow：「点护符」的限时。
//   amulet："offer"＝这一组开头她要护符（第 3 组，先铺垫几拍）；"trick"＝这一组开头先跳一段舞、一边说 Aschan 的坏话，再骗你交护符（第 4 组：让护符看起来被诅咒、发黑）。
//   护符界面上叫「Aschan的护符」（站主 2026-10-26，原来叫破法护符）
//   交出去＝她踩上桌子把护符拿走（视频），背景换成红黑的心形螺旋（blackjack.spiral），之后她肆无忌惮地用魔法——必输局，
//   玩到自己认输（长按放弃）为止（站主 2026-10-25）：第 1 手翻开就改写成 21 点 → 第 2、3 手你的牌全是 0 点小丑（长按丢不掉，只会被诱惑）
//   → 第 4 手小丑 + 她发给自己的就是黑色的 A K → 之后几样随机配（magicPlan）。
// 无尽战斗（blackjack.endless，站主 2026-10-26）：结局选「再赌一局」进来也打 21 点——不算手数、一直打到放弃或失手；
//   发牌想牌时秒数不走、罚时倒数（game.js 的 endlessTick），罚时加起来就是这次无尽撑了多久，结算另写一共赢了几手；护符照旧戴着
// 强化护符（站主 2026-10-27）：败北结算上「Aschan的提示」里答应了（本机开关 shardsEachSet），之后每一组开局碎片都充满
// 魔力碎片（blackjack.shards，站主 2026-10-26：21 点本身输得太多）：护符上挂几枚（默认 4），整局共用；轮到你想牌时护符发亮，
//   点一下用掉一枚＝手牌里多一张紫色的「+1」（这一手有效，能连着用，加到 21 为止）。交出护符碎片一起没了；重打某一组恢复到那一组开局时的数
// 视频 cut-in（blackjack.clips）：take 拿护符、trick 第 4 组开头的舞、swap 换牌、stand 引诱停牌（手掌挥过牌面＝停牌的手势）、
//   bust 引诱爆牌（手指点桌面＝要牌的手势，点两下）、slip 塞牌、
//   clap 罚时里鼓掌——拍手那几下（beats）卡点砸「点！」、混一两颗黑心诱饵（各组的 clap 写概率，第 2 组起）、sway 输了罚时里随机扭一段（各组的 sway 写概率）；
//   你爆牌时不放视频，是诱惑（眼睛特写 + 粉黑的心，bustFx）；
//   开场那段（筹码）在 story-008 的 still 里
// 通用诱惑（sets[n].blackjack.lures，每样写 { from: 赢了几手起, chance: 每手的概率, … }）：
//   swap   A 换牌：这一手眼看你要赢（她补完牌之后），她伸手换掉一张牌（她的或你的）让她赢——发金光的那张，限时内点住就拦下来。
//          first: true＝这一组第一次眼看要赢时一定换
//   stand  B 引诱停牌：你的牌小（≤ max，默认 11）时，诱惑特写 + 「要牌」被一颗心锁住（点碎才按得动）+ 思考时间流得飞快——什么都不做就停牌了
//   bust   C 引诱爆牌：你的牌大（≥ min，默认 15）时，诱惑特写 + 「停牌」被心锁住 + 这一次时间到算「要牌」（她替你要）
//   slip   D 塞牌：塞一张 20 点的粉牌（牌面是她的立绘）——留下来必爆。点它放大，再长按丢掉（只点一下会提示要长按）
//   cover  E 遮挡：发完牌，黑心盖住你的一张牌或她的明牌——不点掉，翻牌时她说那张是什么就是什么；点掉会恍惚一阵（混乱），恍惚里可能出一道题
//   act    想牌的时候出一道简单的题（点击 / 按住），失手照常败北
// 和 game.9a7df4cb23.js 的接口：S.bjTarget（罚时数到哪一秒，game.js 的 target() 用它）、S.bjPhase（前 / 中 / 后段）、I.setPhase、
//   I.bjZero()（倒计时到 0 时 game.9a7df4cb23.js 先问这里，返回 true＝接着发下一手）、I.bjSummary()（暂停画面写赢了几手、罚了几秒）、
//   I.bjClean()（奖杯 when: "bjClean"：一局里她的出千一次都没得逞）、I.toFinish（赢够了交回 game.9a7df4cb23.js 收这一组）、I.cardPoint（「点护符」出在护符上）
// 事件 bj { state: 'deal' | 'turn' | 'hit' | 'stand' | 'reveal' | 'bust' | 'win' | 'lose' | 'push' | 'natural' | 'lure' | 'cheat' | 'caught' | 'magic' | 'block' | 'amulet' | 'penalty' | 'next', … }
(() => {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  // 护符：金环 + 紫色宝石 + 一道光
  const AMULET_SVG =
    '<svg viewBox="0 0 64 64" aria-hidden="true">' +
    '<circle cx="32" cy="34" r="22" fill="#1c0b1e" stroke="#1b1b2a" stroke-width="5"/>' +
    '<circle cx="32" cy="34" r="22" fill="none" stroke="#ffd23f" stroke-width="3"/>' +
    '<path d="M32 18 L44 34 L32 50 L20 34 Z" fill="#b067ff" stroke="#1b1b2a" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M32 22 L38 34 L32 30 Z" fill="#f3dcff"/>' +
    '<path d="M26 4 Q32 12 38 4" fill="none" stroke="#ffd23f" stroke-width="3" stroke-linecap="round"/>' +
    '</svg>';
  // 黑心（魔法、遮挡、心锁）：和挑战的诱饵同一颗——紫边黑心
  const HEART_D = 'M60 86 C31 67 28 50 34 41 C41 31 55 32 60 43 C65 32 79 31 86 41 C92 50 89 67 60 86 Z';
  const heartSvg = (stroke = '#a86bff') => `<svg viewBox="26 28 68 62" aria-hidden="true"><path d="${HEART_D}" fill="#1c0b1e" stroke="${stroke}" stroke-width="4" stroke-linejoin="round"/></svg>`;
  // 小丑（交出护符以后你只拿得到的 0 点牌）：三角帽 + 铃铛
  const JOKER_SVG =
    '<svg viewBox="0 0 40 40" aria-hidden="true">' +
    '<path d="M6 30 L12 10 L20 24 L28 8 L34 30 Z" fill="#b067ff" stroke="#0b0b12" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<path d="M6 30 L34 30 L33 35 L7 35 Z" fill="#ffd23f" stroke="#0b0b12" stroke-width="2.5" stroke-linejoin="round"/>' +
    '<circle cx="12" cy="9" r="3" fill="#ffd23f" stroke="#0b0b12" stroke-width="2"/>' +
    '<circle cx="28" cy="7" r="3" fill="#ffd23f" stroke="#0b0b12" stroke-width="2"/>' +
    '</svg>';

  const start = () => {
    const T = window.tobatsu;
    const I = T._;
    const { S, app, reduce, el, animate } = I;
    const Q = I.Q;
    const B = () => Q().blackjack ?? null;
    if (!B()) return;
    const tr = (s, v) => I.tr(s, v);
    // 无尽战斗（结局选「再赌一局」）：blackjack.endless 那一份（不算手数，一直打到放弃 / 失手）
    const setBJ = (n = S.set) => (S.endless ? (B().endless ?? null) : (Q().sets?.[n - 1]?.blackjack ?? null));
    const rand = (n) => Math.floor(Math.random() * n);
    const pickOne = (list) => list[rand(list.length)];
    const wait = (ms) => new Promise((ok) => setTimeout(ok, reduce.matches ? Math.min(ms, 120) : ms));

    // ---------- 牌 ----------
    // 一张牌：{ r, s }；joker＝0 点的小丑，slip＝塞进来的 20 点粉牌，magic＝被魔法改写过（黑色的红桃），shard＝魔力碎片化成的 +1
    const draw = () => ({ r: RANKS[rand(13)], s: SUITS[rand(4)] });
    const face = (c) => (c.joker ? 0 : c.slip ? 20 : c.shard ? 1 : c.r === 'A' ? 1 : ['J', 'Q', 'K'].includes(c.r) ? 10 : Number(c.r));
    const total = (cards) => {
      let t = 0;
      let aces = 0;
      for (const c of cards) {
        t += !c.joker && !c.slip && c.r === 'A' ? 11 : face(c);
        if (!c.joker && !c.slip && c.r === 'A') aces++;
      }
      while (t > 21 && aces) {
        t -= 10;
        aces--;
      }
      return t;
    };
    const card = (r) => ({ r, s: SUITS[rand(4)] });
    /** 她出千补的牌：能凑到 lo–21 就凑；凑不到就挑不会爆的最大一张（一步一步往上凑） */
    function rigCard(cards, lo) {
      const ok = RANKS.filter((r) => {
        const t = total([...cards, { r, s: '♠' }]);
        return t >= lo && t <= 21;
      });
      if (ok.length) return card(pickOne(ok));
      const safe = RANKS.filter((r) => total([...cards, { r, s: '♠' }]) <= 21);
      const best = safe.sort((a, b) => total([...cards, { r: b, s: '♠' }]) - total([...cards, { r: a, s: '♠' }]))[0];
      return best ? card(best) : draw();
    }

    // ---------- 画面 ----------
    const table = el('div', 'bj');
    table.innerHTML =
      '<div class="bj-score"><span class="bj-score-tag"></span><span class="bj-score-pips"></span><b class="bj-score-num"></b></div>' +
      '<div class="bj-dealer"><div class="bj-cards"></div><b class="bj-total"></b></div>' +
      '<div class="bj-player"><div class="bj-seat is-active"><div class="bj-cards"></div><b class="bj-total"></b></div></div>' +
      '<div class="bj-acts"><div class="bj-btns2">' +
      '<button type="button" class="bj-double" hidden></button>' +
      '<button type="button" class="bj-split" hidden></button>' +
      '<button type="button" class="bj-surrender" hidden></button>' +
      '</div><div class="bj-btns">' +
      '<button type="button" class="bj-hit"><span class="sticker"></span></button>' +
      '<button type="button" class="bj-stand"><span class="sticker"></span></button>' +
      '</div><div class="bj-think"><i></i><b class="bj-think-tag"></b></div></div>';
    app.append(table);
    const $ = (s) => table.querySelector(s);
    const dealerCards = $('.bj-dealer .bj-cards');
    const dealerTotal = $('.bj-dealer .bj-total');
    const playerBox = $('.bj-player');
    // 你的牌：一格一格（分牌时两格）。playerCards / playerTotal 指着现在正在打的那一格
    let playerCards = $('.bj-player .bj-cards');
    let playerTotal = $('.bj-player .bj-total');
    const seats = () => [...playerBox.querySelectorAll('.bj-seat')];
    function useSeat(i) {
      const all = seats();
      all.forEach((n, k) => n.classList.toggle('is-active', k === i));
      playerBox.classList.toggle('is-split', all.length > 1);
      playerCards = all[i].querySelector('.bj-cards');
      playerTotal = all[i].querySelector('.bj-total');
    }
    function addSeat() {
      const n = el('div', 'bj-seat');
      n.innerHTML = '<div class="bj-cards"></div><b class="bj-total"></b>';
      playerBox.append(n);
      return n;
    }
    const hitBtn = $('.bj-hit');
    const standBtn = $('.bj-stand');
    const dblBtn = $('.bj-double');
    const splitBtn = $('.bj-split');
    const surBtn = $('.bj-surrender');
    const think = $('.bj-think');
    const thinkFill = think.firstElementChild;
    I.sticker(hitBtn.firstElementChild, tr('要牌'));
    I.sticker(standBtn.firstElementChild, tr('停牌'));
    dblBtn.textContent = tr('加倍');
    splitBtn.textContent = tr('分牌');
    surBtn.textContent = tr('投降');
    $('.bj-score-tag').textContent = tr('胜场');
    think.querySelector('.bj-think-tag').textContent = tr('时间到会要牌');

    const amulet = el('div', 'bj-amulet');
    amulet.innerHTML = `<span class="bj-amulet-gem">${AMULET_SVG}</span><span class="bj-amulet-shards"></span><span class="bj-amulet-name"></span>`;
    amulet.querySelector('.bj-amulet-name').textContent = tr('Aschan的护符');
    app.append(amulet);
    const gem = amulet.querySelector('.bj-amulet-gem');
    const amuletName = amulet.querySelector('.bj-amulet-name');
    // 题里写 place: "card"（challenge.js）就出在护符上——魔法来的时候「点护符」用（008 没有冒险者卡，借这个接口）
    I.cardPoint = () => {
      if (!amulet.classList.contains('is-on') || !amulet.classList.contains('is-shown')) return null;
      return centerOf(gem);
    };
    const herArt = () => Q().art?.battleStandee?.src ?? '';

    function cardNode(c, up = true) {
      const n = el('div', 'bj-card');
      n.innerHTML = '<span class="bj-card-face"><b class="bj-card-r"></b><i class="bj-card-s"></i><b class="bj-card-r bj-card-r2"></b></span><span class="bj-card-back"></span>';
      setFace(n, c);
      if (!up) n.classList.add('is-down');
      return n;
    }
    function setFace(n, c) {
      const rank = c.joker ? '0' : c.r;
      for (const r of n.querySelectorAll('.bj-card-r')) r.textContent = rank;
      const s = n.querySelector('.bj-card-s');
      if (c.joker) s.innerHTML = JOKER_SVG;
      else s.textContent = c.magic || c.slip ? '♥' : c.s;
      n.dataset.red = !c.magic && !c.joker && (c.s === '♥' || c.s === '♦') ? '1' : '';
      n.dataset.magic = c.magic ? '1' : '';
      n.dataset.joker = c.joker ? '1' : '';
      n.dataset.slip = c.slip ? '1' : '';
      n.dataset.shard = c.shard ? '1' : '';
      if (c.slip) n.querySelector('.bj-card-face').style.backgroundImage = `url("${herArt()}")`;
    }
    /** 牌从她那边（右上的牌堆）飞过来 */
    function fly(n, delay = 0) {
      if (reduce.matches) return;
      const a = app.getBoundingClientRect();
      const r = n.getBoundingClientRect();
      const dx = a.left + a.width * 0.62 - (r.left + r.width / 2);
      const dy = a.top + a.height * 0.1 - (r.top + r.height / 2);
      animate(n, [{ transform: `translate(${dx}px, ${dy}px) rotate(-30deg) scale(0.6)`, opacity: 0 }, { transform: 'translate(0, 0) rotate(0) scale(1)', opacity: 1 }], { duration: 300, delay, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
    }
    function flip(n, c) {
      if (reduce.matches) {
        setFace(n, c);
        n.classList.remove('is-down');
        return wait(0);
      }
      const half = animate(n, [{ transform: 'rotateY(0)' }, { transform: 'rotateY(90deg)' }], { duration: 160, easing: 'ease-in' });
      return new Promise((ok) => {
        let turned = false;
        const go = () => {
          if (turned) return;
          turned = true;
          setFace(n, c);
          n.classList.remove('is-down');
          animate(n, [{ transform: 'rotateY(-90deg)' }, { transform: 'rotateY(0)' }], { duration: 160, easing: 'ease-out' });
          setTimeout(ok, 170);
        };
        if (half) half.onfinish = go;
        else go();
        setTimeout(go, 400);
      });
    }
    /** 上一手的牌往上收走 */
    async function sweep() {
      const old = [...dealerCards.children, ...playerBox.querySelectorAll('.bj-card')];
      if (old.length && !reduce.matches) {
        for (const n of old) animate(n, [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-26px) rotate(-8deg)', opacity: 0 }], { duration: 220, easing: 'ease-in', fill: 'forwards' });
        await wait(230);
      }
      dealerCards.replaceChildren();
      dealerTotal.textContent = '';
      // 分过牌：收回成一格
      seats().slice(1).forEach((n) => n.remove());
      useSeat(0);
      playerCards.replaceChildren();
      playerTotal.textContent = '';
      playerBox.querySelectorAll('.bj-seat-tag').forEach((n) => n.remove());
    }
    /** 点数变了：药丸弹一下 */
    const bump = (n) => animate(n, [{ scale: '1.45' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
    /** 抖一下（爆牌、小丑丢不掉） */
    const jolt = (n) => animate(n, [{ translate: '0 0' }, { translate: '-7px 0' }, { translate: '6px 0' }, { translate: '-4px 0' }, { translate: '0 0' }], { duration: 320 });
    /** 一个元素在 app 里的中心 */
    function centerOf(n) {
      const a = app.getBoundingClientRect();
      const r = n.getBoundingClientRect();
      return { x: r.left - a.left + r.width / 2, y: r.top - a.top + r.height / 2 };
    }

    function showTotals() {
      const h = G.hand;
      if (!h) return;
      const cv = h.cover;
      if (h.splits) {
        seats().forEach((n, i) => {
          const t = n.querySelector('.bj-total');
          const p = h.splits[i]?.p ?? [];
          t.textContent = String(total(p));
          t.dataset.bust = total(p) > 21 ? '1' : '';
        });
      } else {
        playerTotal.textContent = cv?.who === 'p' ? '?' : String(total(h.p));
        playerTotal.dataset.bust = total(h.p) > 21 && cv?.who !== 'p' ? '1' : '';
      }
      dealerTotal.textContent = h.hidden ? (cv?.who === 'd' ? '? + ?' : `${total([h.d[0]])} + ?`) : String(total(h.d));
      dealerTotal.dataset.bust = !h.hidden && total(h.d) > 21 ? '1' : '';
    }
    /** 屏幕上方：这一组要赢几手、赢了几手 */
    function showWins(fresh = 0) {
      const pips = $('.bj-score-pips');
      // 无尽战斗不算手数：不出格子，只写赢了几手
      const endless = !Number.isFinite(G.need);
      pips.replaceChildren(...Array.from({ length: endless ? 0 : G.need }, (_, i) => el('i', i < G.wins ? 'is-won' : '')));
      $('.bj-score-num').textContent = endless ? String(G.wins) : `${G.wins} / ${G.need}`;
      if (fresh > 0) {
        for (const n of [...pips.children].slice(0, G.wins).slice(-fresh)) animate(n, [{ scale: '2.4' }, { scale: '1' }], { duration: 340, easing: 'cubic-bezier(.3,.7,.3,1)' });
        animate($('.bj-score'), [{ scale: '1.12' }, { scale: '1' }], { duration: 300 });
      }
    }
    function acts(on) {
      const h = G.hand;
      table.classList.toggle('is-acting', !!on);
      hitBtn.disabled = standBtn.disabled = !on;
      const fresh = on && h && !h.splits && h.p.filter((c) => !c.shard).length === 2 && !h.doubled;
      dblBtn.hidden = !(fresh && h.canDouble);
      splitBtn.hidden = !(fresh && h.canSplit && face(h.p[0]) === face(h.p[1]) && h.cover?.who !== 'p' && !h.p.some((c) => c.joker || c.slip || c.shard));
      surBtn.hidden = !(fresh && h.canSurrender);
      if (!on) {
        unlock(hitBtn);
        unlock(standBtn);
        think.dataset.lure = '';
      }
    }
    function thinkBar(k) {
      thinkFill.style.transform = `scaleX(${Math.max(0, Math.min(1, k))})`;
      think.dataset.low = G.think && G.think.left <= 3 ? '1' : '';
    }

    /**
     * 画面中间的一条提示：贴纸大字 + 一行小字（tone：win 绿 / lose 粉 / amulet 紫 / 不写＝奶油色；big＝输赢那种大字）。
     * 返回一个 Promise，提示收起来时 resolve（流程按它一步一步往下走）；新的一条会顶掉旧的
     */
    let callNode = null;
    function call(word, sub = '', { tone = '', big = false, ms = 900 } = {}) {
      callNode?.remove();
      const n = el('div', `bj-call${tone ? ` bj-call--${tone}` : ''}${big ? ' bj-call--big' : ''}`);
      n.innerHTML = '<span class="bj-call-band"></span><b class="bj-call-word sticker"></b><span class="bj-call-sub"></span>';
      I.sticker(n.querySelector('.bj-call-word'), word);
      const s = n.querySelector('.bj-call-sub');
      if (sub) s.textContent = sub;
      else s.remove();
      app.append(n);
      callNode = n;
      animate(n.querySelector('.bj-call-band'), [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], { duration: 200, easing: 'cubic-bezier(.2,.8,.3,1)' });
      animate(n.querySelector('.bj-call-word'), big ? [{ opacity: 0, scale: '2' }, { opacity: 1, scale: '0.94', offset: 0.7 }, { opacity: 1, scale: '1' }] : [{ opacity: 0, translate: '36px 0' }, { opacity: 1, translate: '0 0' }], { duration: big ? 280 : 220, delay: 50, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'backwards' });
      if (sub) animate(n.querySelector('.bj-call-sub'), [{ opacity: 0 }, { opacity: 1 }], { duration: 200, delay: 160, fill: 'backwards' });
      const t = reduce.matches ? Math.min(ms, 700) : ms;
      setTimeout(() => {
        if (callNode !== n) return;
        callNode = null;
        animate(n, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: '0 -14px' }], { duration: 180, fill: 'forwards' });
        setTimeout(() => n.remove(), reduce.matches ? 0 : 190);
      }, t);
      return new Promise((ok) => setTimeout(ok, t + 120));
    }
    /** 某个东西旁边冒一枚小字（她要牌、「拦住了」「要一直按住哦」） */
    function popAt(node, text, { dx = 0, dy = 0, tone = '' } = {}) {
      if (!node) return;
      const a = app.getBoundingClientRect();
      const r = node.getBoundingClientRect();
      const n = el('b', `bj-pop sticker${tone ? ` bj-pop--${tone}` : ''}`);
      I.sticker(n, text);
      n.style.left = `${r.right - a.left - 6 + dx}px`;
      n.style.top = `${r.top - a.top - 4 + dy}px`;
      app.append(n);
      animate(n, [{ transform: 'translateY(8px) scale(0.6)', opacity: 0 }, { transform: 'translateY(-10px) scale(1.15)', opacity: 1, offset: 0.3 }, { transform: 'translateY(-26px) scale(1)', opacity: 0 }], { duration: 1000, easing: 'ease-out' });
      setTimeout(() => n.remove(), reduce.matches ? 500 : 1050);
    }
    /** 牌上面的小签（「点住！」「点我」） */
    function tagOn(node, text) {
      const t = el('span', 'bj-tag sticker');
      I.sticker(t, text);
      node.append(t);
      return t;
    }
    const clockNode = () => document.getElementById('clock');
    /** 罚的秒数从点数药丸飞到左下的秒数上 */
    async function flyToClock(from, text) {
      const c = clockNode();
      if (!from || !c || reduce.matches) return;
      const p = centerOf(from);
      const t = centerOf(c);
      const n = el('b', 'bj-fly sticker');
      I.sticker(n, text);
      n.style.left = `${p.x}px`;
      n.style.top = `${p.y}px`;
      app.append(n);
      animate(n, [{ transform: 'translate(-50%, -50%) scale(0.8)', opacity: 0 }, { transform: 'translate(-50%, -80%) scale(1.3)', opacity: 1, offset: 0.25 }, { transform: `translate(calc(-50% + ${t.x - p.x}px), calc(-50% + ${t.y - p.y}px)) scale(0.7)`, opacity: 0.9 }], { duration: 520, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'forwards' });
      await wait(520);
      n.remove();
    }
    /** 秒数从 0 一格一格涨到 sec */
    async function countUp(sec) {
      const c = clockNode();
      if (reduce.matches) return I.clockText?.(String(sec));
      const steps = Math.max(1, Math.min(sec, 14));
      for (let i = 1; i <= steps; i++) {
        I.clockText?.(String(Math.round((sec * i) / steps)));
        if (i % 2 || i === steps) I.play?.('报数');
        await wait(40);
      }
      if (c) animate(c, [{ scale: '1.25' }, { scale: '1' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
    const say = (pool, vars) => {
      if (!pool || !I.hasPool(pool)) return;
      if (vars) {
        // 带数字的那几句（罚几秒、她说那张是几）：自己填好再放进台词条
        let text = I.pick(pool) ?? '';
        for (const [k, v] of Object.entries(vars)) text = text.replaceAll(`{${k}}`, String(v));
        const box = document.getElementById('say-text');
        if (box) box.textContent = text;
        I.emit('line', { pool, text });
      } else I.say(pool);
      S.nextLineAt = Math.max(S.nextLineAt ?? 0, S.elapsed + 3.5);
    };
    /**
     * 视频 cut-in（委托 blackjack.clips 里写的那几段：src、hold 停几秒、show 出法、side、vframe 取景、vcam 运镜、rate、text）。
     * 交给 fx.95ba3bedf1.js 的「视频」放；返回它大概要占多久（毫秒），流程要等它就 await wait(返回值)。没写这一段返回 0
     */
    function clip(name, extra = {}) {
      const c = B().clips?.[name];
      if (!c?.src || reduce.matches) return 0;
      I.emit('cue', { cue: { fx: '视频', ...c, ...extra } });
      return (Number(extra.hold ?? c.hold) || 4) * 1000;
    }
    // 进委托先把这几段请求一遍，落进浏览器缓存（放的时候不卡）
    for (const c of Object.values(B().clips ?? {})) if (c?.src) fetch(c.src).then((r) => r.blob()).catch(() => {});
    /** 按钮第一次出来时旁边冒一句怎么玩（这一局只说一次） */
    function hint(btn, key, text) {
      if (G.hinted.has(key) || btn.hidden) return;
      G.hinted.add(key);
      const n = el('span', 'bj-hint');
      n.textContent = text;
      btn.append(n);
      animate(n, [{ opacity: 0, translate: '0 6px' }, { opacity: 1, translate: '0 0' }], { duration: 220, fill: 'backwards' });
      setTimeout(() => n.remove(), 4200);
    }
    /** 诱惑特写：眼睛 / 嘴唇 / 臀部挑一个 */
    function tempt(parts, hold = 2.6) {
      const fx = { eyes: '特写-眼', lips: '特写-唇', hips: '特写-臀' };
      const list = (Array.isArray(parts) && parts.length ? parts : Object.keys(fx)).filter((p) => fx[p]);
      I.emit('cue', { cue: { fx: fx[pickOne(list)], hold } });
    }

    // ---------- 魔法（黑心卷到牌上改写牌面；护符在身上时点它放出结界打散） ----------
    // 牌下面亮起一个紫黑的心形魔法阵，一圈发光的黑心（滑块到顶那种心，fx.js 的 heartEl）从她嘴唇卷着飞过去围住牌、牌面乱闪；
    // 护符在身上：护符上砸一枚「点！」——点到＝护符张开结界（六芒星）、紫光打过去、黑心炸开、魔法阵裂开、牌面复原、「破法！」；
    // 没点到 / 护符不在＝牌面被改写成黑色的红桃
    const SIGIL_SVG =
      '<svg viewBox="-60 -60 120 120" aria-hidden="true">' +
      '<circle class="bj-sigil-o" r="54"/><circle class="bj-sigil-i" r="44"/>' +
      `<g class="bj-sigil-runes">${Array.from({ length: 8 }, (_, i) => `<path transform="rotate(${i * 45}) translate(0 -49) scale(0.09) translate(-60 -58)" d="${HEART_D}"/>`).join('')}</g>` +
      `<path class="bj-sigil-heart" transform="scale(0.42) translate(-60 -58)" d="${HEART_D}"/>` +
      '</svg>';
    const WARD_SVG =
      '<svg viewBox="-60 -60 120 120" aria-hidden="true">' +
      '<circle r="54"/><circle r="47" stroke-dasharray="4 5"/>' +
      '<path d="M0 -46 L40 23 L-40 23 Z"/><path d="M0 46 L40 -23 L-40 -23 Z"/>' +
      '</svg>';
    /** 一圈发光的黑心从 from 卷着飞到牌上（先往牌那边飞，再绕着牌转、半径越来越小），停在牌边上；返回它们 */
    function heartSwarm(from, node, n = 7) {
      if (reduce.matches) return [];
      const to = centerOf(node);
      const out = [];
      for (let i = 0; i < n; i++) {
        const h = I.heartEl?.({ size: 20 + rand(10), tone: i % 3 === 2 ? 'purple' : 'black', ring: false }) ?? el('i');
        h.classList.add('bj-mheart');
        // 边缘糊一点（站主：太扁平）——发光照 heartEl 的
        h.style.filter = `${h.style.filter || ''} blur(0.6px)`.trim();
        h.style.left = `${to.x}px`;
        h.style.top = `${to.y}px`;
        app.append(h);
        const a0 = (i / n) * Math.PI * 2;
        const frames = [{ transform: `translate(calc(-50% + ${from.x - to.x}px), calc(-50% + ${from.y - to.y}px)) scale(0.3) rotate(-40deg)`, opacity: 0 }];
        for (let k = 1; k <= 6; k++) {
          const t = k / 6;
          const ang = a0 + t * Math.PI * 3;
          const rad = 70 * (1 - t) + 26;
          const lead = Math.max(0, 1 - t * 2.2);
          frames.push({ transform: `translate(calc(-50% + ${(from.x - to.x) * lead + Math.cos(ang) * rad}px), calc(-50% + ${(from.y - to.y) * lead + Math.sin(ang) * rad * 0.75}px)) scale(${0.7 + t * 0.4}) rotate(${Math.round(Math.sin(ang) * 25)}deg)`, opacity: 1, offset: 0.12 + t * 0.88 });
        }
        animate(h, frames, { duration: 1100, delay: i * 55, easing: 'ease-in-out', fill: 'both' });
        out.push(h);
      }
      return out;
    }
    /** 护符放出一道紫光打到 to */
    function beam(to) {
      if (reduce.matches) return;
      const from = centerOf(gem);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const n = el('i', 'bj-beam');
      n.style.left = `${from.x}px`;
      n.style.top = `${from.y}px`;
      n.style.width = `${Math.hypot(dx, dy)}px`;
      n.style.rotate = `${Math.atan2(dy, dx)}rad`;
      app.append(n);
      animate(n, [{ transform: 'translateY(-50%) scaleX(0)', opacity: 1 }, { transform: 'translateY(-50%) scaleX(1)', opacity: 1, offset: 0.35 }, { transform: 'translateY(-50%) scaleX(1)', opacity: 0 }], { duration: 620, easing: 'ease-out', fill: 'forwards' });
      setTimeout(() => n.remove(), 660);
    }
    /** 护符上砸一枚「点！」（challenge.js 的点击题，出在 I.cardPoint——护符上），等点到 / 没点到 */
    function amuletCall(secs) {
      return new Promise((ok) => {
        let tries = 0;
        const name = amulet.querySelector('.bj-amulet-name');
        const go = () => {
          if (!G.active) return ok(true);
          G.magicWait = (hit) => {
            amulet.classList.remove('is-call');
            name.textContent = tr('Aschan的护符');
            ok(hit);
          };
          const spawned = I.challenge?.spawn?.('点击', { practice: true, cue: { place: 'card', time: secs, missTag: '被改写' } });
          if (spawned) {
            amulet.classList.add('is-call');
            name.textContent = tr('点护符！');
            return;
          }
          G.magicWait = null;
          // 有别的题在场：等一下再砸；实在砸不下去就当护符自己挡住了
          if (tries++ < 8) setTimeout(go, 300);
          else ok(true);
        };
        go();
      });
    }
    T.on('challenge', ({ state }) => {
      if (!G.magicWait || (state !== 'hit' && state !== 'miss')) return;
      const w = G.magicWait;
      G.magicWait = null;
      w(state === 'hit');
    });
    /**
     * 她用魔法改写一张牌。blockable＝护符在身上（点护符挡）；返回挡没挡住。
     * 没挡住：牌面换成 to（黑色的红桃）；护符在身上还没挡住的，记一次出千得逞
     */
    async function magic(node, c, { blockable, to = null, window: secs } = {}) {
      if (!node) return false;
      I.emit('bj', { state: 'magic', blockable });
      const target = centerOf(node);
      const lips = I.anchorPoint?.('lips') ?? { x: app.clientWidth * 0.45, y: app.clientHeight * 0.3 };
      I.play?.('魅惑闪光');
      const sigil = el('span', 'bj-sigil');
      sigil.innerHTML = SIGIL_SVG;
      node.append(sigil);
      animate(sigil, [{ opacity: 0, scale: '0.3', rotate: '-90deg' }, { opacity: 1, scale: '1', rotate: '0deg' }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
      const hearts = heartSwarm(lips, node);
      await wait(700);
      node.classList.add('is-cursed');
      const ranks = node.querySelectorAll('.bj-card-r');
      const flick = reduce.matches ? 0 : setInterval(() => ranks.forEach((r) => (r.textContent = String(1 + rand(21)))), 80);
      const clearHearts = (burst) => {
        for (const h of hearts) {
          const dx = (Math.random() - 0.5) * 160;
          const dy = (Math.random() - 0.5) * 140;
          animate(h, burst ? [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${dx}px ${dy}px`, scale: '0.3' }] : [{ opacity: 1 }, { opacity: 0, scale: '0.2' }], { duration: burst ? 420 : 300, easing: 'ease-out', fill: 'forwards' });
        }
        setTimeout(() => hearts.forEach((h) => h.remove()), 460);
      };
      const blocked = blockable ? await amuletCall(Math.max(1.2, Number(secs) || 2.6)) : (await wait(500), false);
      clearInterval(flick);
      if (blocked) {
        // 护符张开结界：六芒星从牌上撑开、紫光从护符打过去、黑心炸开、魔法阵裂开
        amuletFlash();
        beam(target);
        const ward = el('span', 'bj-ward');
        ward.innerHTML = WARD_SVG;
        node.append(ward);
        animate(ward, [{ opacity: 0, scale: '0.4', rotate: '-60deg' }, { opacity: 1, scale: '1.15', rotate: '0deg', offset: 0.45 }, { opacity: 0, scale: '1.6', rotate: '30deg' }], { duration: 900, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
        setTimeout(() => ward.remove(), 950);
        await wait(220);
        I.shake?.();
        node.classList.remove('is-cursed');
        setFace(node, c);
        node.classList.add('is-purged');
        sigil.classList.add('is-broken');
        I.play?.('挑战命中');
        I.play?.('心章');
        clearHearts(true);
        I.heartSpray?.(target.x, target.y, { count: 14, spread: 130, rise: 30, size: [12, 26], tones: ['purple', 'black', 'purple'] });
        popAt(node, tr('破法！'), { dx: -50, dy: -30, tone: 'amulet' });
        I.emit('bj', { state: 'block' });
        await wait(700);
        node.classList.remove('is-purged');
      } else {
        setFace(node, { ...to, magic: true });
        node.classList.remove('is-cursed');
        node.classList.add('is-rewritten');
        I.play?.('心章');
        clearHearts(false);
        if (blockable) G.landed++;
        await wait(600);
        node.classList.remove('is-rewritten');
      }
      animate(sigil, [{ opacity: 1 }, { opacity: 0, scale: '1.3' }], { duration: 300, fill: 'forwards' });
      setTimeout(() => sigil.remove(), 320);
      return blocked;
    }

    // ---------- 心锁（引诱停牌 / 爆牌：按钮被一颗黑心锁住，点碎才按得动） ----------
    function lock(btn, taps = 1) {
      unlock(btn);
      const lk = el('span', 'bj-lock');
      lk.innerHTML = `${heartSvg('#ff6fae')}<b class="bj-lock-n"></b>`;
      lk.querySelector('.bj-lock-n').textContent = taps > 1 ? `×${taps}` : '';
      btn.append(lk);
      btn.dataset.lock = String(taps);
      animate(lk, [{ opacity: 0, scale: '1.8' }, { opacity: 1, scale: '1' }], { duration: 240, easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
    function unlock(btn) {
      btn.querySelector('.bj-lock')?.remove();
      btn.dataset.lock = '';
    }
    /** 按钮被锁着：这一下只是点心锁（返回 true＝不往下做） */
    function tapLock(btn) {
      const n = Number(btn.dataset.lock || 0);
      if (!n) return false;
      const lk = btn.querySelector('.bj-lock');
      I.play?.('挑战推进');
      if (n > 1) {
        btn.dataset.lock = String(n - 1);
        lk.querySelector('.bj-lock-n').textContent = n - 1 > 1 ? `×${n - 1}` : '';
        animate(lk, [{ scale: '1.25' }, { scale: '1' }], { duration: 160 });
        return true;
      }
      btn.dataset.lock = '';
      const p = centerOf(lk);
      I.heartSpray?.(p.x, p.y, { count: 6, spread: 60, rise: 20, size: [8, 16], tones: ['pink', 'black'] });
      animate(lk, [{ opacity: 1, scale: '1' }, { opacity: 0, scale: '1.6' }], { duration: 200, fill: 'forwards' });
      setTimeout(() => lk.remove(), 210);
      return true;
    }

    // ---------- 状态 ----------
    // pens：这一组罚过几次；penTotal：这一组一共罚了几秒（暂停画面写）；penalty：正在撑的罚时；
    // magic：护符交出去了（她肆无忌惮）；magicHands：交出去以后发了几手（魔法一手比一手狠）；landed：这一局她的出千得逞了几次（奖杯 bjClean）；
    // hinted：这一局已经提示过的按钮（加倍第一次出来时说一句怎么玩）
    // runPen / runLost：这一局一共罚了几秒、输了几手（奖杯 bjPenalty / bjStreak）
    // shards：护符上还剩几枚魔力碎片（整局共用）
    const G = { active: false, wins: 0, need: 1, losses: 0, pens: 0, penTotal: 0, penalty: 0, hands: 0, hand: null, amulet: 'on', per: 1, token: 0, think: null, magic: false, magicHands: 0, swapFirst: false, landed: 0, runPen: 0, runLost: 0, rig: null, hinted: new Set(), shards: 0 };
    const alive = (token) => token === G.token && G.active;
    /** 发牌、想牌、翻牌的时候：秒数不走（节奏照跑，前段慢速） */
    function rest(on) {
      S.freeze = on;
      app.toggleAttribute('data-bj-rest', on);
    }
    /** 护符：on 戴着 / given 交出去了 */
    function amuletState() {
      amulet.dataset.state = G.amulet;
      amulet.classList.toggle('is-on', G.amulet === 'on');
    }
    // ---------- 魔力碎片 ----------
    const maxShards = () => Math.max(0, Math.round(Number(B().shards) || 0));
    /** 护符下面那排小菱形：亮着的是还剩的 */
    function shardPips() {
      const box = amulet.querySelector('.bj-amulet-shards');
      const n = maxShards();
      box.hidden = !n;
      box.replaceChildren(...Array.from({ length: n }, (_, i) => el('i', i < G.shards ? '' : 'is-spent')));
    }
    /** 现在能不能用碎片：轮到你想牌、护符还在、还有碎片、没到 21 */
    function canShard() {
      const h = G.hand;
      return !!(G.active && G.amulet === 'on' && !G.magic && G.shards > 0 && h && h.turn && !h.over && total(h.p) < 21 && S.screen === 'hold' && !(S.resumeLeft > 0) && !app.querySelector('.bj-zoom'));
    }
    /** 点护符用一枚：碎片从护符飞到你的牌里、化成一张「+1」；刚好 21 就自动停牌 */
    function useShard() {
      const h = G.hand;
      if (!canShard()) return;
      G.shards--;
      G.runShards = (G.runShards ?? 0) + 1;
      shardPips();
      const c = { r: '+1', s: '◆', shard: true };
      h.p.push(c);
      const n = cardNode(c);
      playerCards.append(n);
      amuletFlash();
      if (!reduce.matches) {
        const from = centerOf(gem);
        const to = centerOf(n);
        const f = el('i', 'bj-shard-fly');
        f.style.left = `${from.x}px`;
        f.style.top = `${from.y}px`;
        app.append(f);
        animate(f, [{ translate: '-50% -50%', scale: '1.4', opacity: 1 }, { translate: `calc(-50% + ${to.x - from.x}px) calc(-50% + ${to.y - from.y}px)`, scale: '0.8', opacity: 0.9 }], { duration: 380, easing: 'cubic-bezier(.5,0,.4,1)', fill: 'forwards' });
        setTimeout(() => f.remove(), 400);
        animate(n, [{ opacity: 0, scale: '1.6' }, { opacity: 0, scale: '1.6', offset: 0.6 }, { opacity: 1, scale: '1' }], { duration: 560, easing: 'cubic-bezier(.3,.7,.3,1)' });
        setTimeout(() => {
          const p = centerOf(n);
          I.heartSpray?.(p.x, p.y, { count: 6, spread: 60, rise: 24, size: [8, 14], tones: ['purple', 'purple', 'pink'] });
        }, 380);
      }
      showTotals();
      bump(playerTotal);
      popAt(playerTotal, '+1', { dx: -8, dy: -26, tone: 'amulet' });
      I.play?.('挑战命中');
      say('碎片-用');
      I.emit('bj', { state: 'shard', left: G.shards });
      acts(true);
      if (total(h.p) === 21) stand({ full: true });
    }
    amulet.addEventListener('pointerdown', (e) => {
      if (!amulet.classList.contains('is-usable')) return;
      e.preventDefault();
      e.stopPropagation();
      useShard();
    });
    /** 第一次能用的时候：护符下面冒一句怎么用（这一局只说一次） */
    function shardHint() {
      if (G.hinted.has('shard') || !canShard()) return;
      G.hinted.add('shard');
      const n = el('span', 'bj-hint bj-hint--amulet');
      n.textContent = tr('魔力碎片：点护符，这一手点数 +1（还剩 {n} 枚）', { n: G.shards });
      amulet.append(n);
      animate(n, [{ opacity: 0, translate: '0 -6px' }, { opacity: 1, translate: '0 0' }], { duration: 220, fill: 'backwards' });
      setTimeout(() => n.remove(), 5200);
    }
    function amuletFlash() {
      amulet.classList.remove('is-block');
      void amulet.offsetWidth;
      amulet.classList.add('is-block');
      I.play?.('魅惑闪光');
    }
    function amuletAway() {
      G.amulet = 'given';
      amuletState();
      I.emit('bj', { state: 'amulet', amulet: 'given' });
      if (reduce.matches) return;
      const a = app.getBoundingClientRect();
      const r = gem.getBoundingClientRect();
      const ghost = gem.cloneNode(true);
      ghost.className = 'bj-amulet-fly';
      ghost.style.left = `${r.left - a.left}px`;
      ghost.style.top = `${r.top - a.top}px`;
      app.append(ghost);
      const dx = a.width * 0.5 - (r.left - a.left);
      const dy = a.height * 0.42 - (r.top - a.top);
      const anim = animate(ghost, [{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${dx * 0.6}px, ${dy * 0.3 - 40}px) scale(1.3)`, opacity: 1, offset: 0.5 }, { transform: `translate(${dx}px, ${dy}px) scale(0.4)`, opacity: 0 }], { duration: 900, easing: 'cubic-bezier(.4,0,.3,1)' });
      if (anim) anim.onfinish = () => ghost.remove();
      setTimeout(() => ghost.remove(), 1000);
    }

    const bjCfg = () => setBJ() ?? {};
    const thinkSecs = () => Math.max(3, Number(bjCfg().think ?? B().think) || 10);
    /** 通用诱惑的一样：这一组写了、赢的手数够了才有 */
    function lureCfg(name) {
      const c = bjCfg().lures?.[name];
      if (!c || G.magic || G.amulet !== 'on') return null;
      return G.wins >= (c.from ?? 0) ? c : null;
    }
    const roll = (c) => !!c && Math.random() < (c.chance ?? 1);

    // ---------- 一组 ----------
    async function beginSet() {
      const cfg = setBJ();
      G.active = !!cfg;
      table.classList.toggle('is-on', G.active);
      if (!G.active) return;
      const token = ++G.token;
      Object.assign(G, { wins: 0, losses: 0, pens: 0, penTotal: 0, penalty: 0, hands: 0, hand: null, think: null, magic: G.amulet !== 'on', magicHands: 0 });
      G.need = S.endless ? Infinity : Math.max(1, Math.round(cfg.wins ?? 1));
      // 败北的提示里答应 Aschan 强化护符（本机开关 shardsEachSet，站主 2026-10-27）：每一组开局魔力碎片都充满
      if (G.amulet === 'on' && I.questFlag?.('shardsEachSet')) {
        G.shards = maxShards();
        shardPips();
      }
      G.per = Number(cfg.perPoint) || Number(B().perPoint) || 1;
      G.swapFirst = !!cfg.lures?.swap?.first;
      S.bjTarget = null;
      S.bjPenFrom = null;
      G.pscript = null;
      S.bjPhase = 'early';
      I.setPhase?.('early');
      rest(true);
      I.clockText?.('0');
      dealerCards.replaceChildren();
      playerCards.replaceChildren();
      dealerTotal.textContent = '';
      playerTotal.textContent = '';
      showWins();
      acts(false);
      // 第 3 组（amulet: "offer"）：开局她要护符；第 4 组（"trick"）：开局她骗你交护符
      if ((cfg.amulet === 'offer' || cfg.amulet === 'trick') && G.amulet === 'on') {
        const trick = cfg.amulet === 'trick';
        // 第 3 组：铺垫说完再出交易单；第 4 组：铺垫和那段舞一起放（台词条压在视频上面照常说话）
        if (Array.isArray(cfg.offerIntro)) {
          if (trick) offerIntro(token, cfg.offerIntro);
          else await offerIntro(token, cfg.offerIntro);
        }
        if (!alive(token)) return;
        const give = await offer(cfg, trick);
        if (!alive(token)) return;
        if (give) {
          say(cfg.giveLine ?? (trick ? '护符-骗-得手' : '护符-交出'));
          // 她踩上桌子伸手把护符拿走（视频），护符飞到她手里；背景换成红黑的心形螺旋
          const ms = clip('take');
          await wait(Math.max(0, ms - 1300));
          if (!alive(token)) return;
          amuletAway();
          G.magic = true;
          hexSpiral(true);
          await wait(1300);
          if (!alive(token)) return;
          await call(tr('护符交出去了'), tr('荷官小姐可以随便用魔法了'), { tone: 'lose', ms: 1500 });
        } else {
          say(cfg.keepLine ?? (trick ? '护符-骗-没骗到' : '护符-拒绝'));
          if (trick) amuletFlash();
          await call(tr('护符留在身上'), trick ? tr('发黑只是她的幻术') : tr('荷官小姐还是不能用魔法'), { tone: 'amulet', ms: 1300 });
        }
      }
      if (G.magic) hexSpiral(true);
      if (!alive(token)) return;
      deal();
    }

    /**
     * 要护符之前的铺垫（第 3 组的 offerIntro，站主 2026-10-26：别上来就问）：一拍一拍放——
     * say 台词条的池、fx 演出（text / pool / hold 同定时演出）、do: "bounce"＝她朝护符弹一下魔法、被护符弹开；wait 这一拍停几秒
     */
    async function offerIntro(token, beats) {
      for (const b of beats) {
        if (!alive(token)) return;
        if (b.say) say(b.say);
        if (b.do === 'bounce') bounce();
        else if (b.fx) {
          const { say: _s, wait: _w, do: _d, ...cue } = b;
          I.emit('cue', { cue });
        }
        await wait((Number(b.wait) || 3) * 1000);
      }
    }
    /** 她朝护符弹一下魔法：一圈黑心从她嘴唇卷到护符上，护符自己亮起结界弹开（不用点）——「看，又弹开了」 */
    async function bounce() {
      const lips = I.anchorPoint?.('lips') ?? { x: app.clientWidth * 0.45, y: app.clientHeight * 0.3 };
      I.play?.('魅惑闪光');
      const hearts = heartSwarm(lips, gem, 6);
      await wait(1150);
      const to = centerOf(gem);
      amuletFlash();
      if (!reduce.matches) {
        const ward = el('span', 'bj-ward');
        ward.innerHTML = WARD_SVG;
        ward.style.left = `${to.x}px`;
        ward.style.top = `${to.y}px`;
        app.append(ward);
        animate(ward, [{ opacity: 0, scale: '0.4', rotate: '-60deg' }, { opacity: 1, scale: '1', rotate: '0deg', offset: 0.45 }, { opacity: 0, scale: '1.4', rotate: '30deg' }], { duration: 900, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
        setTimeout(() => ward.remove(), 950);
      }
      I.play?.('心章');
      for (const h of hearts) {
        animate(h, [{ opacity: 1, translate: '0 0' }, { opacity: 0, translate: `${60 + Math.random() * 120}px ${(Math.random() - 0.3) * 160}px`, scale: '0.3' }], { duration: 460, easing: 'ease-out', fill: 'forwards' });
      }
      setTimeout(() => hearts.forEach((h) => h.remove()), 500);
      I.heartSpray?.(to.x, to.y, { count: 10, spread: 110, rise: 20, size: [10, 22], tones: ['purple', 'black'] });
      popAt(gem, tr('弹开了'), { dx: 6, dy: 10, tone: 'amulet' });
    }
    /**
     * 她要护符：交易单（交出去 / 不交），限时不点＝不交。
     * trick（第 4 组）：先让护符看起来被诅咒了（发黑、冒黑心），再说要帮你「解掉」
     */
    async function offer(cfg, trick) {
      // 第 4 组：先跳一段舞（视频），跳到一半护符开始发黑
      if (trick) {
        const ms = clip('trick');
        if (ms) {
          app.toggleAttribute('data-bj-dance', true);
          await wait(ms * 0.45);
          amulet.classList.add('is-hexed');
          await wait(ms * 0.55);
          app.toggleAttribute('data-bj-dance', false);
        }
      }
      return offerBox(cfg, trick);
    }
    function offerBox(cfg, trick) {
      return new Promise((ok) => {
        if (trick) amulet.classList.add('is-hexed');
        const box = el('div', 'bj-offer');
        box.innerHTML = '<span class="stamp-tag"></span><p class="bj-offer-text"></p><div class="bj-offer-acts"><button type="button" class="bj-offer-yes"></button><button type="button" class="bj-offer-no"></button></div><i class="bj-offer-bar"></i>';
        box.querySelector('.stamp-tag').textContent = tr(trick ? '真相？' : '交易');
        box.querySelector('.bj-offer-text').textContent = tr(cfg.offerText ?? (trick ? 'Aschan 在利用你哦……把她的护符交给我，我帮你解开这道咒♥' : '把那枚护符交给我……这一桌，我会让你舒服地输掉的♥'));
        box.querySelector('.bj-offer-yes').textContent = tr(trick ? '交给她' : '交出护符');
        box.querySelector('.bj-offer-no').textContent = tr(trick ? '不给' : '不交');
        app.append(box);
        say(cfg.offerLine ?? (trick ? '护符-骗' : '护符-要'));
        if (!trick) tempt(['eyes', 'lips', 'hips'], 3);
        const secs = Math.max(3, Number(cfg.offerSeconds) || 8);
        const bar = box.querySelector('.bj-offer-bar');
        animate(bar, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: secs * 1000, easing: 'linear', fill: 'forwards' });
        let done = false;
        const end = (give) => {
          if (done) return;
          done = true;
          amulet.classList.remove('is-hexed');
          box.classList.add('is-off');
          setTimeout(() => box.remove(), 260);
          I.play?.('选择');
          ok(give);
        };
        box.querySelector('.bj-offer-yes').addEventListener('click', () => end(true));
        box.querySelector('.bj-offer-no').addEventListener('click', () => end(false));
        setTimeout(() => end(false), secs * 1000);
      });
    }

    // ---------- 一手 ----------
    async function deal() {
      const token = G.token;
      const cfg = bjCfg();
      G.hands++;
      rest(true);
      acts(false);
      G.think = null;
      G.slipDone = null;
      await sweep();
      if (!alive(token)) return;
      const h = { p: [], d: [], hidden: true, doubled: false, canDouble: !!cfg.double && !G.magic, canSplit: !!cfg.split && !G.magic, canSurrender: !!cfg.surrender && !G.magic, over: false, turn: false, cover: null };
      // 交出护符以后：这一手她用哪几样魔法（magicPlan）
      if (G.magic) h.plan = magicPlan();
      if (G.rig) {
        // 调试：T.tune.bj.rig 定好的牌
        h.p.push(...G.rig.p.map((r) => card(String(r))));
        h.d.push(...G.rig.d.map((r) => card(String(r))));
        G.rig = null;
      } else if (G.magic) {
        // 交出护符以后：jokers＝你只拿得到 0 点的小丑；dealt21＝她发给自己的就是黑色的 A + K
        h.p.push(...(h.plan.jokers ? [joker(), joker()] : [draw(), draw()]));
        h.d.push(...(h.plan.dealt21 ? [{ ...card('A'), magic: true }, { ...card('K'), magic: true }] : [draw(), draw()]));
        h.rigged = 17; // 她补牌也不会爆
      } else {
        h.p.push(draw(), draw());
        h.d.push(draw(), draw());
      }
      G.hand = h;
      I.emit('bj', { state: 'deal', hand: G.hands });
      say(h.plan?.jokers ? '小丑-发牌' : h.plan?.dealt21 ? '魔法-21' : G.hands === 1 ? (cfg.dealLine ?? '发牌') : (cfg.againLine ?? '再发一手'));
      call(tr('发牌'), tr('第 {n} 手', { n: G.hands }), { ms: 900 });
      await wait(200);
      const order = [['p', 0], ['d', 0], ['p', 1], ['d', 1]];
      for (const [i, [who, k]] of order.entries()) {
        const n = cardNode(h[who][k], !(who === 'd' && k === 1));
        (who === 'p' ? playerCards : dealerCards).append(n);
        if (h[who][k].joker) wireJoker(n);
        fly(n);
        I.play?.('挑战推进');
        if (i < 3) await wait(240);
      }
      showTotals();
      showWins();
      bump(playerTotal);
      await wait(600);
      if (!alive(token)) return;
      if (G.magic) return turn();
      const up = h.d[0];
      const peekable = up.r === 'A' || face(up) === 10;
      // 保险：她的明牌是 A
      if (cfg.insurance && up.r === 'A' && total(h.p) !== 21) {
        h.insured = await insurance(cfg);
        if (!alive(token)) return;
      }
      const playerBJ = total(h.p) === 21;
      const dealerBJ = total(h.d) === 21;
      // 天生 21 点：你的当场赢（她也是就平局）
      if (playerBJ) {
        I.play?.('魅惑闪光');
        await call(tr('21 点！'), tr('天生 21 点'), { tone: 'win', ms: 900 });
        if (!alive(token)) return;
        await reveal(token, { quiet: true });
        if (!alive(token)) return;
        return settle(dealerBJ ? 'push' : 'natural');
      }
      // 她明牌是 A 或 10 点：偷看暗牌，是 21 点就当场亮出来
      if (peekable && dealerBJ) {
        await reveal(token, { peek: true });
        if (!alive(token)) return;
        return settle('lose', { dealerNatural: true });
      }
      if (h.insured !== undefined) {
        say(h.insured ? '保险-没用上' : '保险-没有');
        await call(tr('荷官小姐不是 21 点'), h.insured ? tr('保险没用上 · 之后罚 {n} 秒', { n: insuranceCost() }) : '', { ms: 1000 });
        if (!alive(token)) return;
      } else if (peekable) await peek();
      // E 遮挡：发完牌黑心盖住一张
      const cv = lureCfg('cover');
      if (roll(cv)) cover(cv);
      turn();
    }

    const joker = () => ({ r: '0', s: '♠', joker: true });
    /**
     * 交出护符以后这一手的魔法（站主 2026-10-25：必输局，玩到自己认输为止）：
     *   第 1 手只改写牌面（翻开以后她的牌变成 21 点）→ 第 2、3 手你的牌全是小丑 → 第 4 手小丑 + 她发给自己的就是 21 点 →
     *   之后几样随机配（小丑出得最多）
     */
    function magicPlan() {
      const n = G.magicHands++;
      const seq = [{ rewrite: true }, { jokers: true }, { jokers: true }, { jokers: true, dealt21: true }];
      if (n < seq.length) return seq[n];
      return pickOne([{ rewrite: true }, { jokers: true }, { jokers: true }, { dealt21: true }, { jokers: true, dealt21: true }, { jokers: true, rewrite: true }]);
    }
    /** 交出护符以后：心形螺旋（红黑）垫在她身后；收回来就淡掉 */
    function hexSpiral(on) {
      const c = B().spiral;
      if (!c || !I.hypnoForce) return;
      I.hypnoForce(on ? c : null);
    }

    /** 她明牌是 A / 10 点：暗牌掀起一角看一眼又放下 */
    async function peek() {
      const hole = dealerCards.children[1];
      if (!hole || reduce.matches) return;
      animate(hole, [{ transform: 'none' }, { transform: 'translateY(-10px) rotate(-10deg)', offset: 0.4 }, { transform: 'translateY(-10px) rotate(-10deg)', offset: 0.7 }, { transform: 'none' }], { duration: 560, easing: 'ease-in-out' });
      popAt(dealerTotal, tr('偷看'), { dx: -10, dy: 46 });
      await wait(560);
    }

    /** 轮到你：按钮弹出来、思考时间开始走；这一手要来的诱惑在这里排好（afterFrame 到点放） */
    function turn() {
      const h = G.hand;
      const secs = thinkSecs();
      h.turn = true;
      G.think = { left: secs, total: secs };
      thinkBar(1);
      acts(true);
      if (!reduce.matches) [...$('.bj-btns').children, ...$('.bj-btns2').children].filter((b) => !b.hidden).forEach((b, i) => animate(b, [{ opacity: 0, scale: '0.6' }, { opacity: 1, scale: '1' }], { duration: 220, delay: i * 50, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' }));
      I.emit('bj', { state: 'turn', hand: G.hands, seat: h.si ?? 0 });
      if (h.splits) call(tr('第 {n} 手', { n: h.si + 1 }), tr('分出来的这一手 · {p} 点', { p: total(h.p) }), { ms: 850 });
      else call(tr('你的回合'), h.plan?.jokers ? tr('牌……全是 0？') : tr('要牌，还是停牌？'), { ms: 950 });
      // 小按钮第一次出来：旁边说一句怎么玩（一次只说一个，挑没说过的）
      shardHint();
      if (!splitBtn.hidden && !G.hinted.has('split')) hint(splitBtn, 'split', tr('分牌：两张一样的牌拆成两手，各打各的'));
      else if (!dblBtn.hidden && !G.hinted.has('double')) hint(dblBtn, 'double', tr('加倍：只再拿一张就停，赢了算两胜，输了罚两倍'));
      else if (!surBtn.hidden && !G.hinted.has('surrender')) hint(surBtn, 'surrender', tr('投降：这一手认输，只罚 {n} 秒', { n: surrenderCost() }));
      if (G.magic || h.splits) return;
      // 排诱惑：B / C 在前（1–2.5 秒），塞牌、题往后错开。
      // 这一手发完牌已经盖了黑心（E 遮挡）：B / C 不来（站主 2026-10-26：特写、心锁和黑心挤在一起，错开）
      const p = total(h.p);
      const st = h.cover ? null : lureCfg('stand');
      const bu = h.cover ? null : lureCfg('bust');
      if (st && p <= (st.max ?? 11) && roll(st)) h.lure = { kind: 'stand', at: 1 + Math.random() * 1.5, c: st };
      else if (bu && p >= (bu.min ?? 15) && p <= 20 && roll(bu)) h.lure = { kind: 'bust', at: 1 + Math.random() * 1.5, c: bu };
      const sl = lureCfg('slip');
      if (roll(sl)) h.slipAt = 3 + Math.random() * Math.max(0.5, secs - 7);
      const ac = lureCfg('act');
      if (roll(ac)) h.act = { at: 2 + Math.random() * Math.max(0.5, secs - 6), c: ac };
    }

    /** 要牌：超过 21 点＝爆牌；加倍只拿这一张就停；刚好 21 自动停牌。交出护符以后只会抽到小丑 */
    function hit({ forced = false } = {}) {
      const h = G.hand;
      if (!G.active || !h || !h.turn || h.over) return;
      const c = h.plan?.jokers ? joker() : draw();
      h.p.push(c);
      const n = cardNode(c);
      playerCards.append(n);
      if (c.joker) wireJoker(n);
      fly(n);
      I.play?.(forced ? '挑战失手' : '挑战推进');
      I.emit('bj', { state: 'hit', value: face(c), forced });
      showTotals();
      bump(playerTotal);
      if (total(h.p) > 21) return h.splits ? seatDone(true) : bust();
      if (h.doubled) return stand({ doubled: true });
      if (total(h.p) === 21) return stand({ full: true });
      if (forced) {
        say('诱惑-替你要牌');
        call(tr('时间到'), tr('荷官小姐替你要了一张'), { tone: 'lose', ms: 900 });
      } else if (h.plan?.jokers) say('小丑-要牌');
      else say(total(h.p) >= 19 ? '要牌-很满' : '要牌-接');
      acts(true);
    }
    hitBtn.addEventListener('click', () => {
      if (tapLock(hitBtn)) return;
      hit();
    });
    standBtn.addEventListener('click', () => {
      if (tapLock(standBtn)) return;
      stand();
    });
    splitBtn.addEventListener('click', () => {
      if (hitBtn.dataset.lock) return void tapLock(hitBtn);
      doSplit();
    });
    surBtn.addEventListener('click', () => surrender());
    dblBtn.addEventListener('click', () => {
      const h = G.hand;
      if (!h || !h.turn || h.over || h.doubled || h.splits || h.p.length !== 2) return;
      if (hitBtn.dataset.lock) return void tapLock(hitBtn);
      h.doubled = true;
      I.play?.('按钮');
      say('加倍-答应');
      I.emit('bj', { state: 'double' });
      hit();
    });

    /** 停牌（点了、时间到了、加倍拿完、刚好 21）：轮到她翻牌 */
    async function stand({ timeout = false, doubled = false, full = false } = {}) {
      const h = G.hand;
      if (!h || !h.turn || h.over) return;
      h.turn = false;
      acts(false);
      const token = G.token;
      if (!doubled && !full) I.play?.('按钮');
      // 正在塞牌：等它定了再说
      if (G.slipDone) await G.slipDone;
      if (!alive(token) || h.over) return;
      const p = total(h.p);
      const shown = h.cover?.who === 'p' ? '?' : p;
      I.emit('bj', { state: 'stand', timeout, total: p });
      if (h.splits) {
        say(timeout ? '停牌-时间到' : '停牌');
        await call(timeout ? tr('时间到') : full ? tr('21 点') : tr('停牌'), tr('第 {n} 手 · {p} 点', { n: h.si + 1, p }), { ms: 700 });
        if (alive(token)) nextSeat(token);
        return;
      }
      say(h.plan?.jokers ? '小丑-停牌' : timeout ? '停牌-时间到' : '停牌');
      if (doubled) await call(tr('加倍'), tr('拿一张就停 · 你 {n} 点 · 输赢都算两倍', { n: shown }), { tone: 'amulet', ms: 1100 });
      else await call(timeout ? tr('时间到') : full ? tr('21 点') : tr('停牌'), timeout ? tr('自动停牌 · 你 {n} 点', { n: shown }) : tr('你 {n} 点', { n: shown }), { ms: 850 });
      if (!alive(token)) return;
      dealerPlay(token);
    }

    /**
     * 爆牌的那一下：牌往外飞散一点、画面红光一闪、震两下，然后她的诱惑——魅惑闪光、牌上冒一把粉黑的心、眼睛特写（爆牌-特写）。
     * 站主 2026-10-26：原来是一下短的鼓掌（视频），换成诱惑；鼓掌挪进罚时里（clips.clap，拍手那几下卡点出题）
     */
    function bustFx(cards = playerCards) {
      I.shake?.();
      setTimeout(() => I.shake?.(), 140);
      if (reduce.matches) return;
      for (const n of cards.children) {
        const dx = (Math.random() - 0.5) * 34;
        const dy = -6 - Math.random() * 18;
        animate(n, [{ translate: '0 0', rotate: '0deg' }, { translate: `${dx}px ${dy}px`, rotate: `${(Math.random() - 0.5) * 30}deg` }], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
      }
      const f = el('i', 'bj-redflash');
      app.append(f);
      animate(f, [{ opacity: 0.9 }, { opacity: 0 }], { duration: 420, easing: 'ease-out', fill: 'forwards' });
      setTimeout(() => f.remove(), 460);
      setTimeout(() => {
        if (!G.active) return;
        I.fx?.('魅惑闪光');
        const p = centerOf(cards);
        I.heartSpray?.(p.x, p.y, { count: 12, spread: 120, rise: 40, size: [10, 22], tones: ['pink', 'black', 'rose'] });
        I.emit('cue', { cue: { fx: '特写-眼', hold: 1.6, ...(I.hasPool('爆牌-特写') ? { pool: '爆牌-特写' } : {}) } });
      }, 240);
    }
    async function bust() {
      const h = G.hand;
      const token = G.token;
      h.turn = false;
      h.over = true;
      acts(false);
      rest(true);
      bustFx();
      // 她的暗牌也翻过来（不用补牌）
      await wait(250);
      await reveal(token, { quiet: true });
      if (alive(token) && G.hand === h) settle('bust');
    }

    /** 分牌：第二张挪到左边一格，两手各补一张；先打右边那一手。分 A 各补一张就停 */
    async function doSplit() {
      const h = G.hand;
      if (!h?.turn || h.over || h.splits || splitBtn.hidden) return;
      const token = G.token;
      h.turn = false;
      acts(false);
      // 这一手排好的诱惑（第一手开始时排的）作废：分过的牌不再来
      h.lure = null;
      h.slipAt = null;
      h.act = null;
      I.play?.('按钮');
      say('分牌');
      I.emit('bj', { state: 'split' });
      const second = playerCards.children[1];
      const seat1 = addSeat();
      const from = second.getBoundingClientRect();
      seat1.querySelector('.bj-cards').append(second);
      const to = second.getBoundingClientRect();
      animate(second, [{ translate: `${from.left - to.left}px ${from.top - to.top}px` }, { translate: '0 0' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.3,1)' });
      h.splits = [{ p: [h.p[0]] }, { p: [h.p[1]] }];
      h.si = 0;
      h.p = h.splits[0].p;
      useSeat(0);
      showTotals();
      await call(tr('分牌'), tr('拆成两手，各打各的'), { ms: 800 });
      if (!alive(token)) return;
      for (const [i, sp] of h.splits.entries()) {
        const c = draw();
        sp.p.push(c);
        const n = cardNode(c);
        seats()[i].querySelector('.bj-cards').append(n);
        fly(n);
        I.play?.('挑战推进');
        showTotals();
        await wait(280);
      }
      if (!alive(token)) return;
      if (h.splits[0].p[0].r === 'A') {
        // 分 A：各补一张就停
        h.splits.forEach((sp) => (sp.done = true));
        await call(tr('分 A'), tr('两手各补一张就停'), { ms: 850 });
        if (alive(token)) dealerPlay(token);
        return;
      }
      if (total(h.p) === 21) return void (await stand({ full: true }));
      turn();
    }
    /** 分牌的这一手打完了（爆了 / 停了）：换下一手；都打完了轮到她 */
    async function seatDone(busted) {
      const h = G.hand;
      const token = G.token;
      h.turn = false;
      acts(false);
      if (busted) {
        h.splits[h.si].bust = true;
        bustFx(playerCards);
        say('爆牌');
        await call(tr('爆牌'), tr('第 {n} 手 · {p} 点', { n: h.si + 1, p: total(h.p) }), { tone: 'lose', ms: 800 });
      }
      if (alive(token)) nextSeat(token);
    }
    function nextSeat(token) {
      const h = G.hand;
      h.splits[h.si].done = true;
      if (h.si < h.splits.length - 1) {
        h.si++;
        h.p = h.splits[h.si].p;
        useSeat(h.si);
        G.slipDone = null;
        return turn();
      }
      // 两手都爆了：她不用补牌
      if (h.splits.every((sp) => total(sp.p) > 21)) {
        h.over = true;
        rest(true);
        return void reveal(token, { quiet: true }).then(() => alive(token) && settleSplit());
      }
      dealerPlay(token);
    }
    /** 投降：这一手认输，只罚 surrenderCost 秒 */
    async function surrender() {
      const h = G.hand;
      if (!h?.turn || h.over || surBtn.hidden) return;
      const token = G.token;
      h.turn = false;
      h.over = true;
      acts(false);
      rest(true);
      I.play?.('按钮');
      I.emit('bj', { state: 'surrender' });
      await reveal(token, { quiet: true });
      if (alive(token) && G.hand === h) settle('surrender');
    }
    const surrenderCost = () => Math.max(1, Math.round(Number(bjCfg().surrenderCost) || 10));

    /** 她翻暗牌、补到 17、比大小（中间她可能换牌、用魔法） */
    async function dealerPlay(token) {
      const h = G.hand;
      h.over = true;
      await reveal(token, {});
      if (!alive(token)) return;
      // E 遮挡没点掉：她说那张是什么就是什么
      if (h.cover) await declare(token);
      if (!alive(token)) return;
      if (!h.splits && total(h.p) > 21) return settle('bust');
      await dealerDraws(token);
      if (!alive(token)) return;
      // 眼看你要赢：A 换牌（一组第一次一定换，之后按概率），再到最后一胜时她用魔法挣扎一次（点护符挡；没挡住她就赢）
      // 分牌时按「会赢的那几手」算：换牌、魔法都冲着其中点数最大的那一手
      const hands = () => (h.splits ? h.splits.map((sp) => sp.p) : [h.p]);
      const winners = () => hands().filter((p) => total(p) <= 21 && (total(h.d) > 21 || total(p) > total(h.d)));
      const winning = () => winners().length > 0;
      const best = () => Math.max(...winners().map(total));
      if (winning() && !G.magic) {
        const sw = lureCfg('swap');
        if (sw && (G.swapFirst || roll(sw))) {
          G.swapFirst = false;
          await swap(token, h.splits ? best() : null);
          if (!alive(token)) return;
        }
        if (winning() && bjCfg().magicFinal && G.wins + (h.splits ? winners().length : h.doubled ? 2 : 1) >= G.need) {
          say('魔法-最后');
          const goal = Math.min(21, Math.max(17, best() + 1));
          const idx = h.d.length - 1;
          const to = rigCard(h.d.slice(0, -1), goal);
          const blocked = await magic(dealerCards.lastElementChild, h.d[idx], { blockable: G.amulet === 'on', to, window: bjCfg().magicWindow });
          if (!alive(token)) return;
          if (blocked) say('护符-挡');
          else {
            // 没挡住：牌被改写，她接着补到比你大
            h.d[idx] = { ...to, magic: true };
            h.rigged = goal;
            showTotals();
            bump(dealerTotal);
            say('魔法-得逞');
            await dealerDraws(token);
            if (!alive(token)) return;
          }
          await wait(300);
        }
      }
      const p = total(h.p);
      const d = total(h.d);
      if (h.splits) {
        if (d > 21) await call(tr('荷官小姐爆牌了'), tr('{n} 点 · 超过 21', { n: d }), { tone: 'win', ms: 900 });
        else await call(h.splits.map((sp) => (total(sp.p) > 21 ? '×' : total(sp.p))).join(' / ') + ` : ${d}`, tr('两手对荷官小姐的 {d} 点', { d }), { ms: 950 });
        if (alive(token)) settleSplit();
        return;
      }
      if (d > 21) await call(tr('荷官小姐爆牌了'), tr('{n} 点 · 超过 21', { n: d }), { tone: 'win', ms: 900 });
      else await call(`${p} : ${d}`, tr('你 {p} 点 · 荷官小姐停在 {d} 点', { p, d }), { ms: 950 });
      if (!alive(token)) return;
      settle(d > 21 || p > d ? 'win' : p < d ? 'lose' : 'push');
    }

    /** 她补牌：补到 17；换过牌 / 被魔法改过（h.rigged）就一直补到比你大为止——到了 17 也不停，这本身就是出千 */
    async function dealerDraws(token) {
      const h = G.hand;
      const stop = B().dealerStand ?? 17;
      while (total(h.d) < stop || (h.rigged && total(h.d) < h.rigged)) {
        await wait(560);
        if (!alive(token)) return;
        const c = h.rigged ? rigCard(h.d, h.rigged) : draw();
        h.d.push(c);
        const n = cardNode(c);
        dealerCards.append(n);
        fly(n);
        I.play?.('挑战推进');
        showTotals();
        bump(dealerTotal);
        popAt(dealerTotal, tr('她要牌'), { dx: -60, dy: 46 });
      }
      await wait(380);
    }

    /**
     * 翻暗牌（她从大腿的金环里把牌抽出来）。
     * 第 1 组第 2 手（magicAt）：翻开以后她用魔法改写，被护符挡掉；交出护符以后：她的牌被改写成 21 点（挡不住）
     */
    async function reveal(token, { peek = false, quiet = false } = {}) {
      const h = G.hand;
      const hole = dealerCards.children[1];
      if (!h || !hole || !h.hidden) return;
      I.emit('bj', { state: 'reveal', peek });
      if (!quiet) {
        if (!peek) I.emit('cue', { cue: { fx: '特写-臀', hold: 1.6 } });
        say(peek ? '翻牌-偷看' : '翻牌');
        await call(peek ? tr('荷官小姐偷看暗牌') : tr('翻牌'), peek ? tr('明牌是 {c}……', { c: h.d[0].r }) : tr('暗牌是……'), { ms: 800 });
        if (token !== G.token) return;
      }
      h.hidden = false;
      await flip(hole, h.d[1]);
      showTotals();
      bump(dealerTotal);
      if (quiet || peek) return;
      // 交出护符以后（这一手有 rewrite）：无论发了什么，她的牌都被改写成 21 点
      if (h.plan?.rewrite && total(h.d) < 21) {
        say('魔法-改写');
        const need = 21 - (h.d[0].r === 'A' ? 11 : face(h.d[0]));
        if (need >= 2 && need <= 11) {
          const to = card(need === 11 ? 'A' : need === 10 ? pickOne(['10', 'J', 'Q', 'K']) : String(need));
          await magic(hole, h.d[1], { blockable: false, to });
          h.d[1] = { ...to, magic: true };
        } else {
          const toUp = card('K');
          const toHole = card('A');
          magic(dealerCards.children[0], h.d[0], { blockable: false, to: toUp });
          await magic(hole, h.d[1], { blockable: false, to: toHole });
          h.d[0] = { ...toUp, magic: true };
          h.d[1] = { ...toHole, magic: true };
        }
        showTotals();
        bump(dealerTotal);
        return;
      }
    }

    // ---------- 通用诱惑 ----------
    /** A 换牌：她伸手换掉一张牌——那张发金光，限时内点住就拦下来。返回换没换成 */
    async function swap(token, target = null) {
      const h = G.hand;
      const p = target ?? total(h.p);
      const goal = Math.min(21, Math.max(17, p + 1));
      // 先试换她的最后一张，凑到比你大；凑不到就换掉你最大的那张，换成让你比她小的
      let who = 'd';
      let idx = h.d.length - 1;
      let to = rigCard(h.d.slice(0, -1), goal);
      const d2 = total([...h.d.slice(0, -1), to]);
      if (!(d2 > p && d2 <= 21)) {
        const d = total(h.d);
        if (d > 21 || h.splits) return false;
        who = 'p';
        idx = h.p.reduce((best, c, i) => (!c.shard && (h.p[best].shard || face(c) > face(h.p[best])) ? i : best), 0);
        const others = h.p.filter((_, i) => i !== idx);
        const ok = RANKS.filter((r) => total([...others, { r, s: '♠' }]) < d);
        if (!ok.length) return false;
        to = card(ok.sort((a, b) => total([...others, { r: b, s: '♠' }]) - total([...others, { r: a, s: '♠' }]))[0]);
      }
      const node = (who === 'd' ? dealerCards : playerCards).children[idx];
      if (!node) return false;
      const c = bjCfg().lures?.swap ?? {};
      say('出千-换牌');
      const ms = clip('swap');
      if (ms) await wait(ms);
      if (token !== G.token) return false;
      const secs = Math.max(0.6, Number(c.window) || 1.5);
      node.classList.add('is-spark');
      const tag = tagOn(node, tr('点击！'));
      I.emit('bj', { state: 'cheat', kind: 'swap', who });
      const caught = await new Promise((ok) => {
        let done = false;
        const fin = (v) => {
          if (done) return;
          done = true;
          node.removeEventListener('pointerdown', grab);
          ok(v);
        };
        const grab = (e) => {
          e.preventDefault();
          e.stopPropagation();
          fin(true);
        };
        node.addEventListener('pointerdown', grab);
        setTimeout(() => fin(false), secs * 1000);
      });
      node.classList.remove('is-spark');
      tag.remove();
      if (token !== G.token) return false;
      if (caught) {
        node.classList.add('is-caught');
        setTimeout(() => node.classList.remove('is-caught'), 900);
        I.play?.('挑战命中');
        say('出千-抓到');
        popAt(node, tr('拦住了'), { dx: -40, dy: -24, tone: 'win' });
        I.emit('bj', { state: 'caught', kind: 'swap' });
        await wait(700);
        return false;
      }
      h[who][idx] = to;
      await flip(node, to);
      showTotals();
      bump(who === 'd' ? dealerTotal : playerTotal);
      G.landed++;
      say('出千-得逞');
      popAt(node, tr('换掉了'), { dx: -40, dy: -24, tone: 'lose' });
      await wait(700);
      return true;
    }

    /** B / C：诱惑特写 + 一颗心锁住一个按钮。B 锁「要牌」、时间流得飞快；C 锁「停牌」、这一次时间到算「要牌」 */
    function lure(kind, c) {
      const h = G.hand;
      if (!h?.turn) return;
      const hold = Number(c.hold) || 2.8;
      if (!clip(kind)) tempt(c.parts, hold);
      I.emit('bj', { state: 'lure', kind });
      if (kind === 'stand') {
        say('诱惑-停牌');
        lock(hitBtn, Math.max(1, Math.round(c.taps ?? 1)));
        h.drain = { left: hold, k: Math.max(1, Number(c.drain) || 2.5) };
      } else {
        say('诱惑-要牌');
        lock(standBtn, Math.max(1, Math.round(c.taps ?? 1)));
        h.lureHit = true;
        think.dataset.lure = 'hit';
      }
    }

    /** D 塞牌：塞一张 20 点的粉牌——点它放大，再长按丢掉；限时内没丢就算你的（必爆） */
    function slip() {
      const h = G.hand;
      if (!h || h.over || !h.turn) return null;
      const cfg = bjCfg().lures?.slip ?? {};
      const c = { r: '20', s: '♥', slip: true };
      const ms = clip('slip');
      if (!ms) I.emit('cue', { cue: { fx: '特写-臀', hold: 1.8 } });
      say('出千-塞牌');
      I.emit('bj', { state: 'cheat', kind: 'slip' });
      const done = new Promise((ok) => {
        setTimeout(() => {
          if (G.hand !== h || h.over || !G.active) {
            if (G.slipDone === done) G.slipDone = null;
            return ok();
          }
          const n = cardNode(c);
          n.classList.add('is-slip');
          const tag = tagOn(n, tr('点我'));
          playerCards.append(n);
          fly(n);
          const secs = Math.max(2, Number(cfg.window) || 5);
          const holdMs = Math.max(400, (Number(cfg.hold) || 1) * 1000);
          // 思考时间里塞进来的：塞牌的这几秒思考时间停着（视频占了画面）
          if (G.think && ms) G.think.left = Math.min(G.think.total, G.think.left + Math.min(ms / 1000, 3));
          let over = false;
          let zoom = null;
          const fin = (thrown) => {
            if (over) return;
            over = true;
            G.slipDone = null;
            tag.remove();
            n.classList.remove('is-slip');
            if (zoom) {
              const z = zoom;
              zoom = null;
              if (thrown) animate(z, [{ opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }, { opacity: 0, transform: 'translate(-50%, -160%) rotate(-25deg) scale(0.6)' }], { duration: 320, easing: 'ease-in', fill: 'forwards' });
              setTimeout(() => z.remove(), thrown && !reduce.matches ? 330 : 0);
            }
            if (thrown || G.hand !== h || h.over) {
              n.remove();
              if (thrown) {
                I.play?.('挑战命中');
                say('出千-塞牌-退回');
                popAt(playerTotal, tr('丢回去了'), { dx: -70, dy: -30, tone: 'win' });
                I.emit('bj', { state: 'caught', kind: 'slip' });
              }
              return ok();
            }
            // 没丢掉：这张算你的
            n.style.visibility = '';
            h.p.push(c);
            G.landed++;
            showTotals();
            bump(playerTotal);
            if (total(h.p) > 21) bust();
            ok();
          };
          // 点一下：放大到画面中间，长按丢掉
          n.addEventListener('pointerdown', (e) => {
            if (over || zoom) return;
            e.preventDefault();
            e.stopPropagation();
            zoom = el('div', 'bj-zoom');
            const big = cardNode(c);
            big.classList.add('is-slip');
            zoom.innerHTML = '<svg class="bj-zoom-ring" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="54"/><circle class="bj-zoom-fill" cx="60" cy="60" r="54" pathLength="100"/></svg><b class="bj-zoom-word sticker"></b>';
            zoom.prepend(big);
            I.sticker(zoom.querySelector('.bj-zoom-word'), tr('长按丢掉'));
            app.append(zoom);
            n.style.visibility = 'hidden';
            animate(zoom, [{ opacity: 0, transform: 'translate(-50%, -50%) scale(0.4)' }, { opacity: 1, transform: 'translate(-50%, -50%) scale(1)' }], { duration: 220, easing: 'cubic-bezier(.3,.7,.3,1)' });
            I.play?.('按钮');
            let timer = 0;
            let t0 = 0;
            const down = (ev) => {
              if (over) return;
              ev.preventDefault();
              try {
                zoom.setPointerCapture(ev.pointerId);
              } catch {}
              t0 = performance.now();
              zoom.style.setProperty('--hold', `${holdMs}ms`);
              zoom.classList.add('is-holding');
              I.play?.('挑战蓄力');
              timer = setTimeout(() => fin(true), holdMs);
            };
            const up = () => {
              if (over || !t0) return;
              clearTimeout(timer);
              zoom.classList.remove('is-holding');
              // 只点了一下就松开：告诉他要长按
              if (performance.now() - t0 < holdMs * 0.5) popAt(zoom.querySelector('.bj-zoom-word'), tr('要一直按住哦'), { dx: -90, dy: -40 });
              t0 = 0;
            };
            zoom.addEventListener('pointerdown', down);
            zoom.addEventListener('pointerup', up);
            zoom.addEventListener('pointercancel', up);
          });
          setTimeout(() => fin(false), secs * 1000);
        }, ms ? Math.round(ms * 0.62) : 450);
      });
      G.slipDone = done;
      return done;
    }

    /** E 遮挡：黑心盖住你的一张牌或她的明牌。点掉＝恍惚一阵（混乱），恍惚里可能出一道题；不点掉，翻牌时她说了算 */
    function cover(c) {
      const h = G.hand;
      const who = Math.random() < (c.mine ?? 0.5) ? 'p' : 'd';
      const idx = who === 'p' ? rand(h.p.length) : 0;
      const node = (who === 'p' ? playerCards : dealerCards).children[idx];
      if (!node) return;
      const btn = el('button', 'bj-cover');
      btn.type = 'button';
      btn.innerHTML = heartSvg();
      btn.setAttribute('aria-label', tr('黑心'));
      node.append(btn);
      h.cover = { who, idx, node, btn };
      showTotals();
      say('遮挡');
      I.emit('bj', { state: 'cheat', kind: 'cover', who });
      animate(btn, [{ opacity: 0, scale: '2' }, { opacity: 1, scale: '1' }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (h.cover?.btn !== btn) return;
        h.cover = null;
        btn.remove();
        showTotals();
        const p = centerOf(node);
        // 点到黑心：和诱饵一样恍惚一阵（fx.js 的混乱）
        I.emit('challenge', { state: 'decoy', kind: '诱饵', x: p.x, y: p.y, seconds: Math.max(1, Number(c.confuse) || 4) });
        say('遮挡-点掉');
        I.emit('bj', { state: 'caught', kind: 'cover' });
        if (Math.random() < (c.act ?? 0.5)) setTimeout(() => G.hand === h && h.turn && spawnAct(c.actKinds ?? { 点击: 1 }, c.actTime), 700);
      });
    }
    /** 遮挡没点掉：她说那张是什么——你的说成最坏的（能爆就爆，不然最小），她的说成能比你大的 */
    async function declare(token) {
      const h = G.hand;
      const cv = h.cover;
      if (!cv) return;
      h.cover = null;
      let fake;
      if (cv.who === 'p') {
        const others = h.p.filter((_, i) => i !== cv.idx);
        const bustR = RANKS.filter((r) => total([...others, { r, s: '♠' }]) > 21);
        fake = card(bustR.length ? pickOne(bustR) : '2');
        h.p[cv.idx] = fake;
      } else {
        const goal = Math.min(21, Math.max(17, total(h.p) + 1));
        fake = rigCard([h.d[1]], goal);
        h.d[0] = fake;
        h.rigged = goal;
      }
      say('遮挡-宣称', { c: fake.r });
      await call(tr('那张是 {c} 哦♥', { c: fake.r }), tr('黑心盖着的牌，荷官小姐说了算'), { tone: 'lose', ms: 1000 });
      if (token !== G.token) return;
      animate(cv.btn, [{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'translateY(-30px) scale(1.4)' }], { duration: 260, fill: 'forwards' });
      setTimeout(() => cv.btn.remove(), 270);
      await flip(cv.node, fake);
      cv.node.classList.add('is-fake');
      G.landed++;
      showTotals();
      bump(cv.who === 'p' ? playerTotal : dealerTotal);
      await wait(400);
    }

    /** 想牌的时候出一道题（失手照常败北） */
    function spawnAct(kinds, time) {
      const entries = Object.entries(kinds ?? { 点击: 1 }).filter(([, w]) => w > 0);
      const sum = entries.reduce((a, [, w]) => a + w, 0);
      let r = Math.random() * sum;
      const key = (entries.find(([, w]) => (r -= w) <= 0) ?? entries[0])?.[0] ?? '点击';
      return !!I.challenge?.spawn?.(key, { cue: time ? { time } : {} });
    }

    /** 小丑（交出护符以后）：长按想丢掉——丢不掉，只会被诱惑 */
    function wireJoker(n) {
      let timer = 0;
      n.classList.add('is-joker');
      n.addEventListener('pointerdown', (e) => {
        if (!G.hand?.turn) return;
        e.preventDefault();
        timer = setTimeout(() => {
          jolt(n);
          tempt(['eyes', 'lips', 'hips'], 2.4);
          say('小丑-丢不掉');
          popAt(n, tr('丢不掉'), { dx: -30, dy: -24, tone: 'lose' });
        }, 600);
      });
      const up = () => clearTimeout(timer);
      n.addEventListener('pointerup', up);
      n.addEventListener('pointercancel', up);
      n.addEventListener('pointerleave', up);
    }

    // 保险的价钱：真实赌场里保险押原来那一注的一半——这里一手输了最多罚 21 秒，一半就是 10 秒
    const insuranceCost = () => Math.max(1, Math.round(Number(bjCfg().insuranceCost) || 10));

    /** 这一手的结果：赢了记一手；输了 / 爆牌罚秒数（数到 0 再发下一手）；平局直接下一手 */
    async function settle(kind, { dealerNatural = false } = {}) {
      const h = G.hand;
      const token = G.token;
      if (!h) return;
      h.over = true;
      h.turn = false;
      rest(true);
      acts(false);
      const win = kind === 'win' || kind === 'natural';
      const lose = kind === 'lose' || kind === 'bust' || kind === 'surrender';
      const mult = h.doubled ? 2 : 1;
      let pen = 0;
      if (kind === 'lose' && !(dealerNatural && h.insured)) pen = total(h.d) * mult;
      if (kind === 'bust') pen = total(h.p) * mult;
      if (kind === 'surrender') pen = surrenderCost();
      pen = Math.round(pen * G.per);
      // 保险没用上（她不是天生 21 点）：另罚几秒
      const insLost = h.insured && !dealerNatural ? insuranceCost() : 0;
      I.emit('bj', { state: kind, hand: G.hands, penalty: pen + insLost });
      if (win) {
        const before = G.wins;
        G.wins = Math.min(G.need, G.wins + mult);
        I.play?.('挑战命中');
        say(kind === 'natural' ? '天胡-玩家' : '输-庄家');
        showWins(G.wins - before);
        const sub = !Number.isFinite(G.need)
          ? [kind === 'natural' ? tr('天生 21 点') : '', tr('一共赢了 {n} 手', { n: G.wins })].filter(Boolean).join(' · ')
          : kind === 'natural' ? tr('天生 21 点 · 赢 {w} / {n}', { w: G.wins, n: G.need }) : tr('赢 {w} / {n}', { w: G.wins, n: G.need });
        await call(tr('赢了'), h.doubled ? `${tr('加倍')} · ${sub}` : sub, { tone: 'win', big: true, ms: 1200 });
      } else if (lose) {
        G.losses++;
        G.runLost++;
        I.play?.('挑战失手');
        I.shake?.();
        // 爆牌已经有那一下（bustFx）；别的输法放集中线
        if (kind !== 'bust') I.emit('cue', { cue: { fx: '集中线' } });
        say(G.magic ? '小丑-输' : kind === 'bust' ? '爆牌' : kind === 'surrender' ? '投降' : dealerNatural ? '天胡-庄家' : '赢-庄家');
        const word = kind === 'bust' ? tr('爆牌') : kind === 'surrender' ? tr('投降') : dealerNatural ? tr('荷官小姐 21 点') : tr('输了');
        const sub = !pen ? tr('买了保险 · 不罚') : kind === 'surrender' ? tr('认输 · 罚 {n} 秒', { n: pen }) : kind === 'bust' ? tr('你 {p} 点 · 罚 {n} 秒', { p: total(h.p), n: pen }) : tr('荷官小姐 {d} 点 · 罚 {n} 秒', { d: total(h.d), n: pen });
        await call(word, h.doubled && pen ? `${tr('加倍')} · ${sub}` : sub, { tone: 'lose', big: true, ms: 1300 });
      } else {
        say('平局');
        await call(tr('平局'), tr('不罚 · 再来一手'), { big: true, ms: 1100 });
      }
      if (!alive(token)) return;
      if (win && G.wins >= G.need) {
        // 赢够了：这一组过
        G.active = false;
        G.penalty = 0;
        rest(false);
        S.bjTarget = null;
        S.bjPenFrom = null;
        G.pscript = null;
        S.elapsed = I.target();
        I.clockText?.('0');
        I.toFinish?.();
        return;
      }
      const sum = pen + insLost;
      if (sum > 0) return penalty(token, sum, kind === 'bust' ? playerTotal : kind === 'lose' && pen ? dealerTotal : null, { insurance: insLost > 0 && !pen, bust: kind === 'bust' });
      await wait(300);
      if (alive(token)) deal();
    }

    /** 分牌的结果：每一手各自比，赢几手记几胜；输了的罚她的点数、爆了的罚自己的点数，加起来一起罚 */
    async function settleSplit() {
      const h = G.hand;
      const token = G.token;
      h.over = true;
      h.turn = false;
      rest(true);
      acts(false);
      const d = total(h.d);
      let won = 0;
      let lost = 0;
      let pen = 0;
      let busted = false;
      seats().forEach((n, i) => {
        const p = total(h.splits[i].p);
        const r = p > 21 ? 'bust' : d > 21 || p > d ? 'win' : p < d ? 'lose' : 'push';
        if (r === 'win') won++;
        else if (r === 'lose' || r === 'bust') {
          lost++;
          pen += r === 'bust' ? p : d;
          busted ||= r === 'bust';
        }
        const t = el('b', `bj-seat-tag sticker bj-seat-tag--${r}`);
        I.sticker(t, tr({ win: '赢', lose: '输', push: '平', bust: '爆' }[r]));
        n.append(t);
        animate(t, [{ opacity: 0, scale: '2' }, { opacity: 1, scale: '1' }], { duration: 260, delay: i * 120, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'backwards' });
      });
      pen = Math.round(pen * G.per);
      const insLost = h.insured ? insuranceCost() : 0;
      I.emit('bj', { state: 'split-result', won, lost, penalty: pen + insLost });
      const before = G.wins;
      G.wins = Math.min(G.need, G.wins + won);
      G.losses += lost;
      G.runLost += lost;
      if (won) showWins(G.wins - before);
      if (lost) {
        I.play?.('挑战失手');
        I.shake?.();
      } else if (won) I.play?.('挑战命中');
      say(won && !lost ? '输-庄家' : lost && !won ? '赢-庄家' : '平局');
      const word = won && !lost ? tr('赢了') : lost && !won ? tr('输了') : won && lost ? tr('一胜一负') : tr('平局');
      const sub = [won ? tr('赢 {w} 手', { w: won }) : '', pen ? tr('罚 {n} 秒', { n: pen }) : '', !won && !pen ? tr('不罚 · 再来一手') : ''].filter(Boolean).join(' · ');
      await call(word, sub, { tone: won && !lost ? 'win' : lost && !won ? 'lose' : '', big: true, ms: 1300 });
      if (!alive(token)) return;
      if (G.wins >= G.need) {
        G.active = false;
        G.penalty = 0;
        rest(false);
        S.bjTarget = null;
        S.bjPenFrom = null;
        G.pscript = null;
        S.elapsed = I.target();
        I.clockText?.('0');
        I.toFinish?.();
        return;
      }
      const sum = pen + insLost;
      if (sum > 0) return penalty(token, sum, busted ? playerTotal : dealerTotal, { bust: busted });
      await wait(300);
      if (alive(token)) deal();
    }

    /** 罚时：秒数从点数飞到左下、一格一格涨上去，然后照常握着跟节奏撑（输了中速、爆牌快速），数到 0 发下一手 */
    async function penalty(token, sec, from, { insurance = false, bust = false } = {}) {
      G.penalty = sec;
      G.penTotal += sec;
      G.runPen += sec;
      G.pens++;
      S.bjPhase = bust ? 'late' : 'mid';
      I.setPhase?.(S.bjPhase);
      app.removeAttribute('data-bj-rest');
      await flyToClock(from ?? (insurance ? dealerTotal : null), `+${sec}`);
      await countUp(sec);
      if (!alive(token)) return;
      say(bust ? '罚时-爆牌' : '罚时', { n: sec });
      call(tr('罚时 {n} 秒', { n: sec }), insurance ? tr('保险没用上 · 撑到 0 才发下一手') : tr('撑到 0 才发下一手'), { tone: 'lose', ms: 1100 });
      I.emit('bj', { state: 'penalty', seconds: sec, bust });
      I.play?.('开始');
      S.bjTarget = S.elapsed + sec;
      // 镜头（game.js 的 bjCamera）和定时演出都从这一刻算第几秒
      S.bjPenFrom = S.elapsed;
      G.pscript = penaltyScript(bust ? 'late' : 'mid', sec);
      rest(false);
      penaltyFx(token, sec, bust);
    }
    /**
     * 罚时里的定时演出（blackjack.penaltyScripts.mid / late：几套 [{ at, fx, … }]，写法同 sets[n].script）：
     * 每次罚时挑一套（不连着挑同一套），at＝这次罚时第几秒，离数到 0 不到 2 秒的不放
     */
    function penaltyScript(kind, sec) {
      const sets = B().penaltyScripts?.[kind];
      if (!Array.isArray(sets) || !sets.length) return [];
      let i = rand(sets.length);
      if (sets.length > 1 && i === G.lastScript?.[kind]) i = (i + 1 + rand(sets.length - 1)) % sets.length;
      G.lastScript = { ...G.lastScript, [kind]: i };
      return (sets[i] ?? []).filter((c) => c?.fx && (Number(c.at) || 0) <= sec - 2).sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
    }
    /**
     * 罚时里的视频（一次罚时最多一段）：clap 鼓掌——鼓掌那一下飞出一两枚「点！」（失手照常败北；第 2 组起，各组的 clap 写概率）；
     * sway 扭一段（输了的罚时，各组的 sway 写概率）。都排在罚时中间，离数到 0 至少留几秒
     */
    function penaltyFx(token, sec, bust) {
      const cfg = bjCfg();
      const r = Math.random();
      const clapP = Number(cfg.clap) || 0;
      const swayP = bust ? 0 : Number(cfg.sway) || 0;
      const at = (lo, room) => (lo + Math.random() * Math.max(0, sec - room - lo)) * 1000;
      const live = () => alive(token) && G.penalty && S.bjTarget - S.elapsed > 3;
      if (r < clapP && sec >= 9) {
        setTimeout(() => {
          if (!live() || !clip('clap')) return;
          clapBeats(B().clips?.clap ?? {}, live);
        }, at(1.5, 7));
      } else if (r < clapP + swayP && sec >= 8) setTimeout(() => live() && clip('sway'), at(2, 6));
    }
    /**
     * 鼓掌视频里拍手的那几下（clips.clap.beats：片子里第几秒，站主 2026-10-26）：每拍一下砸一枚「点！」，其中 decoys [少, 多] 枚换成黑心诱饵（别点，点了恍惚 confuse 秒）。
     * 盯着正在放的那段视频的进度卡点：放到第一下（提前 0.12 秒，章砸下来那一下落在拍手上）一次出整波，一枚隔一拍（拍子是平均间隔）错开砸下来；
     * 每枚从出现起限时 tapTime 秒，漏点一枚照常败北
     */
    function clapBeats(c, live) {
      const beats = (Array.isArray(c.beats) ? c.beats : []).map(Number).filter((t) => t >= 0).sort((a, b) => a - b);
      if (!beats.length || !c.src) return;
      const n = beats.length;
      const rate = Number(c.rate) || 1;
      const gap = n > 1 ? (beats[n - 1] - beats[0]) / (n - 1) / rate : 0;
      const [lo, hi] = Array.isArray(c.decoys) ? c.decoys : [c.decoys ?? 0, c.decoys ?? 0];
      const nd = Math.max(0, Math.min(n - 1, Math.round(lo) + rand(Math.max(0, Math.round(hi) - Math.round(lo)) + 1)));
      const kinds = Array(n).fill('点击');
      // 第一下总是真的（先教会「跟着拍子点」），诱饵落在后面几下
      const slots = Array.from({ length: n - 1 }, (_, i) => i + 1).sort(() => Math.random() - 0.5).slice(0, nd);
      for (const i of slots) kinds[i] = '诱饵';
      const cue = { time: Number(c.tapTime) || 1.2, stagger: gap, confuse: Number(c.confuse) || 3.5 };
      const t0 = performance.now();
      let fired = false;
      const timer = setInterval(() => {
        if (fired || !live() || performance.now() - t0 > 9000) return clearInterval(timer);
        const v = app.querySelector('.vclip video');
        if (!v || !decodeURI(v.src).endsWith(c.src) || v.paused) return;
        if (v.currentTime < beats[0] - 0.12 * rate) return;
        // 晚了半拍以上（卡住了）就不出了，免得对不上拍
        if (v.currentTime > beats[0] + 0.3) return clearInterval(timer);
        if (I.challenge?.spawn?.(kinds.join('+'), { cue })) {
          fired = true;
          clearInterval(timer);
          I.emit('bj', { state: 'clap', taps: n - nd, decoys: nd });
        }
      }, 25);
    }

    /** 罚时数到 0（game.js 的 holdTick 问这里）：回到前段（慢）、发下一手。这一组还在打就一律接住，别让 game.9a7df4cb23.js 当成「数到 0 过关」 */
    I.bjZero = () => {
      if (!G.active) return false;
      rest(true);
      if (!G.penalty) return true;
      G.penalty = 0;
      G.pscript = null;
      S.bjPenFrom = null;
      S.bjPhase = 'early';
      I.setPhase?.('early');
      const token = G.token;
      I.emit('bj', { state: 'next' });
      say('撑住了');
      (async () => {
        await kissReward();
        if (alive(token)) deal();
      })();
      return true;
    };
    /**
     * 罚时撑完的奖励（站主 2026-10-26：原来只有一条「撑住了」，换成诱惑）：嘴唇特写嘟一下（撑住了-特写），
     * 唇印「啾」地落在左下数到 0 的秒数上、魅惑闪光，然后发下一手
     */
    async function kissReward() {
      if (reduce.matches) return wait(500);
      I.emit('cue', { cue: { fx: '特写-唇', hold: 1.3, ...(I.hasPool('撑住了-特写') ? { pool: '撑住了-特写' } : {}) } });
      await wait(750);
      const c = clockNode();
      const p = c ? centerOf(c) : null;
      I.fx?.('魅惑闪光');
      I.fx?.('唇印', { color: '红', ...(p ? { point: { x: p.x + 14, y: p.y - 6 } } : {}) });
      await wait(1150);
    }

    /** 保险：她的明牌是 A，问你买不买 */
    function insurance(cfg) {
      return new Promise((ok) => {
        const cost = insuranceCost();
        const box = el('div', 'bj-offer bj-offer--small');
        box.innerHTML = '<span class="stamp-tag"></span><p class="bj-offer-text"></p><div class="bj-offer-acts"><button type="button" class="bj-offer-yes"></button><button type="button" class="bj-offer-no"></button></div><i class="bj-offer-bar"></i>';
        box.querySelector('.stamp-tag').textContent = tr('保险');
        box.querySelector('.bj-offer-text').textContent = tr('赌荷官小姐是天生 21 点：是的话这一手不罚，不是的话罚 {n} 秒', { n: cost });
        box.querySelector('.bj-offer-yes').textContent = tr('买');
        box.querySelector('.bj-offer-no').textContent = tr('不买');
        app.append(box);
        say('保险-问');
        const secs = Math.max(2.5, Number(cfg.insuranceSeconds) || 5);
        animate(box.querySelector('.bj-offer-bar'), [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: secs * 1000, easing: 'linear', fill: 'forwards' });
        let done = false;
        const end = (v) => {
          if (done) return;
          done = true;
          box.classList.add('is-off');
          setTimeout(() => box.remove(), 260);
          I.play?.('选择');
          ok(v);
        };
        box.querySelector('.bj-offer-yes').addEventListener('click', () => end(true));
        box.querySelector('.bj-offer-no').addEventListener('click', () => end(false));
        setTimeout(() => end(false), secs * 1000);
      });
    }

    // 轮到你的时候：思考时间往下走（按真实时间，掉帧也不变慢；切到后台、回来倒数的时候不走）；
    // 到点放诱惑（B / C）、塞牌、出题；她隔一阵劝你要牌；时间到自动停牌（C 的那一次是替你要牌）
    const prevAfter = I.MV.afterFrame;
    let lastT = 0;
    I.MV.afterFrame = (dt) => {
      prevAfter?.(dt);
      const now = performance.now() / 1000;
      const step = Math.min(0.5, Math.max(0, now - lastT));
      lastT = now;
      // 魔力碎片：能用的时候护符发亮、名牌换成「点我 +1」
      const usable = canShard();
      if (usable !== amulet.classList.contains('is-usable')) {
        amulet.classList.toggle('is-usable', usable);
        if (!amulet.classList.contains('is-call')) amuletName.textContent = usable ? tr('点我 +1') : tr('Aschan的护符');
      }
      // 罚时里的定时演出：按这次罚时走了几秒放（暂停、后台回来倒数的时候秒数不走，也就不放）
      if (G.pscript?.length && G.penalty && S.bjPenFrom != null && S.screen === 'hold' && !S.freeze && !(S.resumeLeft > 0)) {
        const u = S.elapsed - S.bjPenFrom;
        while (G.pscript.length && (Number(G.pscript[0].at) || 0) <= u) {
          const { at, ...cue } = G.pscript.shift();
          I.emit('cue', { cue });
        }
      }
      const h = G.hand;
      const k = G.think;
      if (!G.active || !h?.turn || !k || S.screen !== 'hold' || S.resumeLeft > 0) return;
      // B：特写开着的时候思考时间流得飞快。想牌时出的题不停表（站主 2026-10-26：题就是用来干扰思考的）
      let speed = 1;
      if (h.drain && h.drain.left > 0) {
        h.drain.left -= step;
        speed = h.drain.k;
      }
      k.left = Math.max(0, k.left - step * speed);
      thinkBar(k.left / k.total);
      const used = k.total - k.left;
      const busy = I.challenge?.active?.() || G.slipDone;
      if (h.lure && used >= h.lure.at && !busy) {
        const l = h.lure;
        h.lure = null;
        lure(l.kind, l.c);
      }
      if (h.slipAt != null && used >= h.slipAt && !I.challenge?.active?.()) {
        h.slipAt = null;
        slip();
      }
      if (h.act && used >= h.act.at && !busy) {
        if (spawnAct(h.act.c.kinds, h.act.c.time)) h.act = null;
        else h.act.at = used + 0.5;
      }
      if (!h.tempted && used > 3 && total(h.p) <= 13 && !h.doubled && !G.magic) {
        h.tempted = true;
        say('要牌-劝');
      }
      if (k.left <= 0 && !G.slipDone) {
        if (h.lureHit) {
          // C：这一次时间到算「要牌」，没爆就再给 4 秒
          h.lureHit = false;
          think.dataset.lure = '';
          unlock(standBtn);
          hit({ forced: true });
          if (h.turn && !h.over) k.left = Math.min(4, k.total);
        } else stand({ timeout: true });
      }
    };

    // ---------- 跟着游戏走 ----------
    T.on('run', ({ state, set }) => {
      if (state === 'retry' && G.setStart?.[set]) {
        G.amulet = G.setStart[set].amulet;
        G.shards = G.setStart[set].shards ?? maxShards();
        G.runShards = G.setStart[set].runShards ?? 0;
        G.landed = G.setStart[set].landed;
        G.runPen = G.setStart[set].runPen ?? 0;
        G.runLost = G.setStart[set].runLost ?? 0;
      } else {
        G.amulet = 'on';
        G.shards = maxShards();
        G.runShards = 0;
        G.landed = 0;
        G.runPen = 0;
        G.runLost = 0;
        G.setStart = {};
        G.hinted.clear();
      }
      amuletState();
      shardPips();
    });
    T.on('screen', ({ screen }) => {
      if (screen === 'prep' && !S.endless && !G.setStart?.[S.set]) (G.setStart ??= {})[S.set] = { amulet: G.amulet, shards: G.shards, runShards: G.runShards ?? 0, landed: G.landed, runPen: G.runPen, runLost: G.runLost };
      if (screen === 'hold' || (screen === 'endless' && B().endless)) {
        // toHold 先归零秒数再换画面：等它把这一组的字写完再开局（无尽战斗写了 blackjack.endless 也一样）
        setTimeout(() => S.screen === screen && beginSet(), 0);
      } else {
        if (screen !== 'pass') {
          G.active = false;
          G.token++;
          G.penalty = 0;
          G.think = null;
          S.bjTarget = null;
          S.bjPenFrom = null;
          G.pscript = null;
          S.bjPhase = null;
          acts(false);
          table.classList.remove('is-on');
        }
        app.removeAttribute('data-bj-rest');
        amulet.classList.remove('is-hexed', 'is-call');
        app.toggleAttribute('data-bj-dance', false);
        if (screen !== 'pass') hexSpiral(false);
        for (const n of app.querySelectorAll('.bj-offer, .bj-call, .bj-fly, .bj-zoom, .bj-mheart, .bj-beam')) n.remove();
        callNode = null;
      }
      const show = !['brief', 'story', 'choice', 'victory', 'end'].includes(screen);
      amulet.classList.toggle('is-shown', show);
    });
    // 奖杯「火眼金睛」：这一局她的出千（换牌、塞牌、遮挡）一次都没得逞（when: "bjClean"，game.js 的 awardTrophies）
    I.bjClean = () => G.landed === 0;
    // 奖杯「全身而退」（when: "bjPenalty"）：整局罚时加起来不超过多少秒；隐藏奖杯（when: "bjStreak"）：一手都没输就通关
    I.bjRunPenalty = () => G.runPen;
    I.bjRunLost = () => G.runLost;
    I.bjRunShards = () => G.runShards ?? 0;
    // 暂停画面：这一组赢了几手、一共罚了几秒
    I.bjSummary = () => ({ wins: G.wins, need: G.need, hands: G.hands, penalty: Math.round(G.penTotal) });

    G.shards = maxShards();
    amuletState();
    shardPips();
    T.tune.bj = {
      /** 调试：现在这一手 */
      state: () => ({ active: G.active, wins: G.wins, need: G.need, losses: G.losses, pens: G.pens, hands: G.hands, amulet: G.amulet, magic: G.magic, plan: G.hand?.plan ?? null, landed: G.landed, runPen: G.runPen, runLost: G.runLost, splits: G.hand?.splits?.map((sp) => sp.p.map((c) => c.r)) ?? null, p: G.hand?.p.map((c) => (c.joker ? '0' : c.r)), d: G.hand?.d.map((c) => c.r), cover: G.hand?.cover?.who ?? null, turn: !!G.hand?.turn, think: G.think?.left, penalty: G.penalty, target: S.bjTarget, elapsed: S.elapsed, phase: S.bjPhase }),
      hit: () => hit(),
      stand: () => stand(),
      /** 用一枚魔力碎片 */
      shard: () => useShard(),
      /** 罚时直接数完 */
      zero: () => {
        if (S.bjTarget > 0) S.elapsed = S.bjTarget;
      },
      /** 下一手发这几张：rig(['10', '8'], ['9', '7']) */
      rig: (p, d) => (G.rig = { p, d }),
      /** 马上来一样诱惑：'stand' | 'bust' | 'slip' | 'cover' | 'act' */
      lure: (kind) => {
        const h = G.hand;
        if (!h) return;
        const c = bjCfg().lures?.[kind] ?? {};
        if (kind === 'stand' || kind === 'bust') lure(kind, c);
        else if (kind === 'slip') slip();
        else if (kind === 'cover') cover(c);
        else if (kind === 'act') spawnAct(c.kinds, c.time);
      },
      /** 对她的明牌放一次魔法（护符在身上就要点护符挡） */
      magic: () => magic(dealerCards.children[0], G.hand?.d[0], { blockable: G.amulet === 'on', to: card('K') }),
      /** 放一段视频 cut-in：clip('swap') */
      clip: (name) => clip(name),
    };
  };

  if (window.tobatsu?.ready) start();
  else window.addEventListener('tobatsu:ready', start, { once: true });
})();
