/*
 * 讨伐任务 · 冒险者卡（等级）—— 007 公会柜台起
 *
 * 委托写了 "card" 段才有（别的委托一概不动）：
 *   card.start       起始等级。从头挑战回到它；「重来这一组」回到那一组开打时的等级
 *   card.xp          一级多少经验（卡上那条经验条的一格）
 *   card.drain       被动吸取：节奏滑块每撞一下底（「压」）吸走几点经验，按段写 { early, mid, late, endless }；
 *                    每组可以在 sets[n].card.drain 盖（只盖写了的段）
 *   card.held        卡被她拿走（夺卡）时，被动吸取乘几倍
 *   card.miss        题失手扣几级（演出表 challenge.onMiss 写 "card"，challenge.js 不败北、问这里扣几级）
 *   card.ranks       等级到多少以上是什么冒险者等级 [[25, "C"], [18, "D"], [10, "E"], [1, "见习"]]（从上往下找第一格够得着的）
 *   card.ledger      暂停画面的结算单 { gain 讨伐经验 +几级, fee 窗口手续费 −几级 }；每组可以 sets[n].card.ledger 盖。结算单不会把人算到 0（最少剩 1 级）
 *   card.collection  坏结局的收藏编号从几开始（再加上这台设备在这份委托里被收走过几张）
 *   card.titles      称号：交出去几级以上是什么称号 [[0, "新人冒险者"], [3, "…"], …]（交出去＝起始等级 − 现在的等级，从上往下找第一格够得着的）
 *   card.names       名字也跟着变：交出去几级以上卡上的名字换成什么 [[18, "M奴隶·{name}"], [26, "等级罐子 No.{no}"]]
 *                    （{name}＝登记的名字，{no}＝她的收藏编号＝这张卡被收走时会是第几号，五位数）
 *
 * 卡的样子跟着冒险者等级变（ranks 的第几格：0 干净的米色卡 → 1 印上粉色唇印 → 2 粉卡 + 两个唇印 → 3 紫黑的卡），
 * 往下掉一格时卡翻一下、她在卡上亲一口（站主 2026-10-17：卡也是被调教的一部分）。
 *
 * 卡上还写着冒险者的名字（开场剧情里登记的，game.js 的 input: name；没登记过是「新人」）。
 * 逗留（超时步骤 do: stay，game.js）：秒数到 0 之后留着不走，每数一格（−1、−2……）扣一级、调教进度 +1——这是 007 掉级的主轴。
 *
 * 等级跨组保留。战斗中降到 0＝败北（game.js 的 toFall，kind「等级」→「等级归零」）。
 * 败北处决：从当时的等级每数一下吸一截，数到 0 正好归零，卡上盖「回收」章，记一张收藏（tobatsu.q<编号>.cards）。
 * 无尽战斗：能降到负数（欠她的），记最深欠到多少（tobatsu.q<编号>.cardDebt）。
 *
 * 定时演出（sets[n].script）——这三样归这里接（fx.js 的 I.ownFx 让开）：
 *   吸取 { levels 吸几级, seconds 几秒内吸完（默认 2）, guard true＝这一阵能被「出在卡上的按住题」挡掉（做完那一刻剩下的不吸了）}
 *   交易 { cost 几级, text 交易单上的字, seconds 几秒内不点就当没答应（默认 5）, yes 按钮上的字（默认「成交」）,
 *          reward 答应了放的静图 cut-in（写法同「视频」：still / focus / zoom / hold / text / side / show / outro）,
 *          accept / refuse 答应 / 没答应时台词条换的那句（台词池名）}
 *   夺卡 { back: true＝还回来（不写就是拿走）}：拿走时卡飞到她手边，HUD 那一格写「保管中」，被动吸取乘 held 倍；
 *          出在卡上的题（place: "card"）做完＝把卡抢回来
 * 定时出题可以写 miss（失手扣几级，盖过 card.miss；挡吸取的按住题写 0——没挡住已经吃了整阵吸取）和 missTag（章上那枚小签）。
 * 交易答应了、连打打完多点到「接受榨取」（challenge.js 的 trap: "accept"）：走 drainShow——一级一级被吸到她嘴边，最后在卡上亲一口。
 *   鞋印 { count 几只, every 隔几秒一只, speed 走多快（1＝一步 0.62 秒）, steps 走几步到卡（不写按距离）, pool 第一只出来时她说的 }：
 *          一只只高跟鞋印从画面别处一步一步踩向冒险者卡；点掉就没事，踩到卡上扣一级（007 第 3 组起）
 * 台词里写 {lv} 换成现在的等级（game.js 的 pick）。
 */
(() => {
  'use strict';

  /**
   * 高跟鞋印（60 × 100）：尖头的鞋底（尖朝前的鞋头、宽的前掌、收细的鞋腰）+ 下面单独一块粉色的鞋跟，中间留一道缝；前掌里一颗心。
   * 站主 2026-10-18：原来那个像圆头鞋；10-19：鞋跟和鞋底连在一起了，分开（点的范围是整个按钮，分开不影响点）
   */
  const HEEL_SOLE = '<path d="M30 0C34 7 48 21 48 35C48 47 40 55 37 62C35 66 35 69 35.5 71Q30 74 24.5 71C25 69 25 66 23 62C20 55 12 47 12 35C12 21 26 7 30 0Z"/>';
  const HEEL_TIP = '<path d="M23.5 81H36.5L35.5 93C35.5 95.5 33 97 30 97C27 97 24.5 95.5 24.5 93Z"/>';
  const HEEL_SVG =
    '<svg viewBox="0 0 60 100" aria-hidden="true">' +
    `<g class="heel-shadow" transform="translate(3 4)">${HEEL_SOLE}${HEEL_TIP}</g>` +
    `<g class="heel-sole">${HEEL_SOLE}</g>` +
    `<g class="heel-tip">${HEEL_TIP}</g>` +
    '<path class="heel-heart" d="M30 44C22 38 20 33 22 29C24 25 28 25 30 29C32 25 36 25 38 29C40 33 38 38 30 44Z"/>' +
    '</svg>';

  const start = () => {
    const T = window.tobatsu;
    const I = T._;
    const { S, app, reduce, el, animate } = I;
    const Q = I.Q;
    const C = () => Q().card ?? null;
    if (!C()) return;

    const K = {
      lv: 0,
      frac: 1,
      setStart: {},
      held: false,
      burst: null,
      fell: false,
      execFrom: null,
      rank: '',
      shownLv: null,
      deal: null,
      stamp: '',
      given: 0,
      title: '',
      name: '',
      tier: null,
    };
    const store = (k) => `tobatsu.q${Q().quest.id}.${k}`;
    const readNum = (k) => {
      try {
        return Number(localStorage.getItem(store(k))) || 0;
      } catch {
        return 0;
      }
    };
    const writeNum = (k, v) => {
      try {
        localStorage.setItem(store(k), String(v));
      } catch {}
    };
    const xpPer = () => Math.max(1, Number(C().xp) || 10);
    const startLv = () => Math.max(1, Math.round(Number(C().start) || 30));
    const setCard = (n = S.set) => Q().sets?.[n - 1]?.card ?? {};
    const drainRate = () => {
      const phase = S.screen === 'endless' ? 'endless' : S.phase;
      const v = { ...(C().drain ?? {}), ...(S.screen === 'endless' ? {} : (setCard().drain ?? {})) }[phase];
      return Math.max(0, Number(v) || 0) * (K.held ? Math.max(1, Number(C().held) || 2) : 1);
    };
    /** 按「交出去几级」从一张表里挑：[[几级以上, 值], …]，从上往下找第一格够得着的 */
    const stepOf = (list, n) => {
      const rows = Array.isArray(list) ? [...list].sort((a, b) => b[0] - a[0]) : [];
      for (const [min, v] of rows) if (n >= min) return v;
      return null;
    };
    /** 这一局交出去几级（起始等级 − 现在的等级）：称号、名字按它换 */
    const lost = () => Math.max(0, startLv() - K.lv);
    /** 卡变了她顺口说一句（lines 里有这一池才说）：卡-降级-<第几档>、卡-改名-<第几次>；说完那几秒台词条不被各段换掉 */
    const remark = (pool) => {
      if (!T.pool?.(pool)?.length || !I.inBattle()) return;
      I.say(pool);
      S.nextLineAt = Math.max(S.nextLineAt ?? 0, S.elapsed + 3);
      if (S.over) S.over.lineAt = Math.max(S.over.lineAt ?? 0, S.elapsed + 3);
    };
    const titleOf = (n) => {
      const t = stepOf(C().titles, n);
      return t == null ? '' : I.tr(String(t));
    };
    const playerName = () => {
      try {
        return localStorage.getItem('tobatsu.player-name') || I.tr('新人');
      } catch {
        return I.tr('新人');
      }
    };
    /** 她的收藏编号（五位数）：这张卡被收走时会是第几号——等级罐子的编号、处决时盖的「回收 No.」是同一个数 */
    const jarNo = (extra = 1) => String(Math.max(0, Math.round(Number(C().collection) || 0)) + readNum('cards') + extra).padStart(5, '0');
    const nameOf = () => {
      const tpl = stepOf(C().names, lost());
      return tpl ? I.tr(String(tpl), { name: playerName(), no: K.collectedNo ?? jarNo() }) : playerName();
    };
    const rankList = () => (Array.isArray(C().ranks) ? C().ranks : []);
    const rankOf = (lv) => {
      for (const [min, name] of rankList()) if (lv >= min) return String(name);
      return rankList().length ? String(rankList().at(-1)[1]) : '';
    };
    /** 卡的样子是第几档：ranks 的第几格（0 最好）；归零、欠着的算最后一档 */
    const tierOf = (lv) => {
      const list = rankList();
      const i = list.findIndex(([min]) => lv >= min);
      return i < 0 ? Math.max(0, list.length - 1) : i;
    };

    // ---------- 卡 ----------
    const card = el('div', 'card-hud');
    card.innerHTML =
      '<div class="card-hud-body">' +
      '<p class="card-hud-head"><span class="card-hud-name"></span><b class="card-hud-rank"></b></p>' +
      '<p class="card-hud-title"></p>' +
      '<p class="card-hud-lv"><small>Lv</small><b class="card-hud-num"></b></p>' +
      '<div class="card-hud-bar"><i></i></div>' +
      '<span class="card-hud-marks"></span>' +
      '<span class="card-hud-heel"></span>' +
      '<span class="card-hud-stamp"></span>' +
      '</div>' +
      '<span class="card-hud-held"></span>';
    app.append(card);
    const $ = (s) => card.querySelector(s);
    $('.card-hud-held').textContent = I.tr('保管中');
    $('.card-hud-heel').innerHTML = HEEL_SVG;

    /**
     * 名字：交出去够多了换成「M奴隶·名字」、再往下连名字都没了，只剩「等级罐子 No.xxxxx」（card.names）。
     * 换的时候旧名字上划一道线、新的弹出来，卡上盖「改名」
     */
    function renderName(bump = false) {
      const n = nameOf();
      const node = $('.card-hud-name');
      if (n === K.name) return;
      const changed = K.name && bump && !reduce.matches;
      K.name = n;
      clearTimeout(K.nameTimer);
      // 长名字（「M奴隶·」前缀、「等级罐子 No.xxxxx」）字小一号，卡上放得下
      const long = (I.glyphLen?.(n) ?? n.length) > 6.5;
      if (!changed) {
        node.classList.remove('is-struck');
        node.classList.toggle('is-long', long);
        node.textContent = n;
        return;
      }
      node.classList.add('is-struck');
      K.nameTimer = setTimeout(() => {
        node.classList.remove('is-struck');
        node.classList.toggle('is-long', long);
        node.textContent = n;
        animate(node, [{ scale: '1.4', color: '#e0398a' }, { scale: '1' }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
      }, 460);
      stampOn(I.tr('改名'), 1500);
      remark(`卡-改名-${(C().names ?? []).filter(([min]) => lost() >= min).length}`);
      I.emit('card', { state: 'name', name: n, lost: lost() });
    }
    T.on('name', () => renderName());
    /** 称号：按这一局交出去几级换；换的时候卡上盖一下「称号变更」 */
    function renderTitle(bump = false) {
      const endless = card.classList.contains('is-endless');
      const t = endless && K.lv < 0 ? I.tr('欠下 {n} 级', { n: -K.lv }) : titleOf(lost());
      const node = $('.card-hud-title');
      node.hidden = !t;
      if (t === K.title) return;
      const changed = K.title && bump;
      K.title = t;
      // 英语不套「」
      node.textContent = !t ? '' : I.lang === 'en' ? t : `「${t}」`;
      if (changed) {
        stampOn(I.tr('称号变更'), 1500);
        if (!reduce.matches) animate(node, [{ scale: '1.3', color: '#8a3cff' }, { scale: '1' }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
        I.emit('card', { state: 'title', title: t, lost: lost() });
      }
    }
    /**
     * 卡的样子（data-tier）：往下掉一档时卡翻过去、翻回来已经是新的样子，她在卡上亲一口，卡上多一个唇印；
     * 往回（重来这一组、无尽重新开始）不演，直接换
     */
    const MARKS = ['粉', '紫', '黑'];
    function renderTier(bump = false) {
      const tier = tierOf(K.lv);
      if (tier === K.tier) return;
      const prev = K.tier;
      K.tier = tier;
      const apply = () => {
        card.dataset.tier = String(tier);
        const box = $('.card-hud-marks');
        // 每往下一档多一个唇印（1 档一个粉的、2 档再加紫的、3 档再加黑的）
        box.replaceChildren(
          ...MARKS.slice(0, tier).map((tone, i) => {
            const m = el('img', `card-hud-mark card-hud-mark--${i + 1}`);
            m.src = I.lipMark?.(tone) ?? '';
            m.alt = '';
            return m;
          }),
        );
        return box.lastElementChild;
      };
      if (!(bump && prev != null && tier > prev) || reduce.matches) {
        apply();
        return;
      }
      const body = $('.card-hud-body');
      animate(body, [{ transform: 'perspective(420px) rotateY(0deg) scale(1)' }, { transform: 'perspective(420px) rotateY(90deg) scale(1.12)', offset: 0.42 }, { transform: 'perspective(420px) rotateY(-14deg) scale(1.06)', offset: 0.74 }, { transform: 'perspective(420px) rotateY(0deg) scale(1)' }], {
        duration: 680,
        easing: 'cubic-bezier(.4,0,.3,1)',
      });
      setTimeout(() => {
        const mark = apply();
        if (mark) animate(mark, [{ scale: '2.4', opacity: 0 }, { scale: '0.9', opacity: 1, offset: 0.7 }, { scale: '1', opacity: 1 }], { duration: 320, easing: 'cubic-bezier(.3,.7,.3,1)' });
      }, 290);
      setTimeout(() => {
        const p = I.cardPoint();
        if (p) I.fx?.('唇印', { color: MARKS[Math.min(MARKS.length - 1, tier - 1)] ?? '粉', point: { x: p.x + 18, y: p.y - 6 } });
      }, 560);
      I.play?.('魅惑闪光');
      remark(`卡-降级-${tier}`);
      I.emit('card', { state: 'tier', tier, rank: rankOf(K.lv) });
    }
    /** 等级一变：样子、称号、名字跟着换 */
    function renderForm(bump = false) {
      renderTier(bump);
      renderTitle(bump);
      renderName(bump);
    }

    function render(bump = 0) {
      const lv = K.lv;
      // 无尽战斗里卡上的字照样换，只是不翻卡、不盖章、她不说（一直往下吸，不打断）
      const formBump = card.classList.contains('is-endless') ? 0 : bump;
      if (K.shownLv !== lv) {
        $('.card-hud-num').textContent = lv < 0 ? `−${-lv}` : String(lv);
        if (K.shownLv != null && bump && !reduce.matches) {
          animate($('.card-hud-num'), [{ scale: '1.45', color: '#c27bff' }, { scale: '1' }], { duration: 320, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
        }
        K.shownLv = lv;
      }
      $('.card-hud-bar i').style.transform = `scaleX(${Math.max(0, Math.min(1, K.frac)).toFixed(3)})`;
      const rank = rankOf(lv);
      if (rank !== K.rank) {
        const down = K.rank && rank !== K.rank;
        $('.card-hud-rank').textContent = card.classList.contains('is-endless') ? '∞' : I.tr(rank);
        K.rank = rank;
        if (down && formBump) stampOn(I.tr('降级'), 1400);
      }
      card.classList.toggle('is-low', lv > 0 && lv <= 5);
      card.classList.toggle('is-debt', lv < 0);
      renderForm(!!formBump);
    }
    function stampOn(text, ms = 0) {
      const s = $('.card-hud-stamp');
      s.textContent = text;
      card.classList.add('has-stamp');
      if (!reduce.matches) animate(s, [{ scale: '2.2', opacity: 0 }, { scale: '0.9', opacity: 1, offset: 0.7 }, { scale: '1', opacity: 1 }], { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1)' });
      clearTimeout(K.stampTimer);
      if (ms) K.stampTimer = setTimeout(() => card.classList.remove('has-stamp'), ms);
    }
    function stampOff() {
      clearTimeout(K.stampTimer);
      card.classList.remove('has-stamp');
    }
    const shown = (on) => card.classList.toggle('is-on', on);

    /** 卡的中心（出在卡上的题用）：在 HUD 上或者在她手边 */
    I.cardPoint = () => {
      if (!card.classList.contains('is-on')) return null;
      const b = card.querySelector('.card-hud-body').getBoundingClientRect();
      const a = app.getBoundingClientRect();
      return { x: b.left + b.width / 2 - a.left, y: b.top + b.height / 2 - a.top };
    };
    I.cardLv = () => K.lv;
    // 奖杯「没被吸过等级」（quest.trophies 的 when: untouched，game.js 的 awardTrophies）：通关那一刻等级还是满的
    I.cardFull = () => K.lv >= startLv();
    I.cardMiss = () => Math.max(0, Math.round(Number(C().miss) || 0));

    // ---------- 吸走的经验：紫色的光点从卡上飘到她身上 ----------
    function wisps(n = 3, from = null) {
      if (reduce.matches || !card.classList.contains('is-on')) return;
      const a = app.getBoundingClientRect();
      const src = from ?? I.cardPoint();
      if (!src) return;
      const to = { x: a.width * 0.56, y: a.height * 0.4 };
      for (let i = 0; i < n; i++) {
        const w = el('i', 'card-wisp');
        w.style.left = `${src.x}px`;
        w.style.top = `${src.y}px`;
        app.append(w);
        const dx = to.x - src.x + (Math.random() - 0.5) * 80;
        const dy = to.y - src.y + (Math.random() - 0.5) * 80;
        const mx = dx * 0.4 + (Math.random() - 0.5) * 120;
        const my = dy * 0.3 - 40 - Math.random() * 60;
        const anim = animate(
          w,
          [
            { translate: '0 0', scale: '0.6', opacity: 0 },
            { translate: `${mx}px ${my}px`, scale: '1.2', opacity: 1, offset: 0.35 },
            { translate: `${dx}px ${dy}px`, scale: '0.4', opacity: 0 },
          ],
          { duration: 700 + Math.random() * 400, delay: i * 90, easing: 'cubic-bezier(.4,0,.6,1)' },
        );
        if (anim) anim.onfinish = () => w.remove();
        else setTimeout(() => w.remove(), 1200);
      }
    }

    /**
     * 逗留里交出一级（站主 2026-10-17：要显眼、要有被吸走的感觉）：卡抖一下发紫光，
     * 「−1」从等级数字那里弹出来，被一道弧线吸到她身上，后面拖着几颗光点
     */
    function suck(target = null, { sound = true } = {}) {
      if (!card.classList.contains('is-on')) return;
      card.classList.remove('is-sucked');
      void card.offsetWidth;
      card.classList.add('is-sucked');
      clearTimeout(K.suckTimer);
      K.suckTimer = setTimeout(() => card.classList.remove('is-sucked'), 700);
      if (sound) I.play?.('接触');
      if (reduce.matches) return;
      const a = app.getBoundingClientRect();
      const n = $('.card-hud-num').getBoundingClientRect();
      const from = { x: n.left + n.width / 2 - a.left, y: n.top + n.height / 2 - a.top };
      const to = target ?? { x: a.width * 0.56, y: a.height * 0.38 };
      const tag = el('b', 'card-suck sticker');
      I.sticker(tag, '−1');
      tag.style.left = `${from.x}px`;
      tag.style.top = `${from.y}px`;
      app.append(tag);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const anim = animate(
        tag,
        [
          { translate: '0 0', scale: '0.5', opacity: 0 },
          { translate: '10px -30px', scale: '1.6', opacity: 1, offset: 0.2 },
          { translate: '14px -34px', scale: '1.45', opacity: 1, offset: 0.38 },
          { translate: `${dx * 0.55}px ${dy * 0.25 - 50}px`, scale: '1', opacity: 1, offset: 0.68 },
          { translate: `${dx}px ${dy}px`, scale: '0.25', opacity: 0 },
        ],
        { duration: 1150, easing: 'cubic-bezier(.45,0,.55,1)' },
      );
      if (anim) anim.onfinish = () => tag.remove();
      else setTimeout(() => tag.remove(), 1200);
      setTimeout(() => wisps(7, from), 360);
      animate($('.card-hud-num'), [{ scale: '1.9', rotate: '-8deg', color: '#c27bff' }, { scale: '0.9', rotate: '3deg', offset: 0.5 }, { scale: '1', rotate: '0deg' }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
    }

    // ---------- 加减 ----------
    /** 吸走 xp 点经验（被动吸取） */
    function drainXp(xp) {
      if (!(xp > 0)) return;
      K.frac -= xp / xpPer();
      let lost = 0;
      while (K.frac <= 0) {
        K.lv--;
        K.frac += 1;
        lost++;
      }
      render(lost);
      if (lost) {
        wisps(2 + lost);
        I.emit('card', { state: 'drain', lv: K.lv, lost });
      }
      check();
    }
    /** 一下子加减几级（失手、吸取、交易、结算单） */
    function addLv(n, { wisp = true, floor = null } = {}) {
      if (!n) return;
      K.lv += n;
      if (floor != null) K.lv = Math.max(floor, K.lv);
      render(n < 0 ? 1 : 0);
      if (n < 0 && wisp) wisps(Math.min(10, 2 - n));
      I.emit('card', { state: n < 0 ? 'drain' : 'gain', lv: K.lv, lost: Math.max(0, -n) });
      check();
    }
    /** 战斗中降到 0：败北。无尽战斗不算（欠着，记最深欠到多少） */
    function check() {
      if (S.screen === 'endless') {
        const debt = readNum('cardDebt');
        if (K.lv < 0 && -K.lv > debt) writeNum('cardDebt', -K.lv);
        return;
      }
      if (K.lv > 0 || K.fell || S.screen !== 'hold' || S.finishLeft > 0) return;
      K.lv = 0;
      K.frac = 0;
      render();
      K.fell = true;
      K.burst = null;
      S.freeze = true;
      stampOn(I.tr('归零'));
      I.emit('card', { state: 'zero' });
      setTimeout(() => I.toFall({ kind: '等级' }), 900);
    }

    // ---------- 一局 ----------
    T.on('run', ({ state, set }) => {
      K.fell = false;
      K.collectedNo = null;
      K.held = false;
      K.burst = null;
      printClear();
      card.classList.remove('is-held');
      stampOff();
      if (state === 'retry' && K.setStart[set] != null) {
        K.lv = K.setStart[set].lv;
        K.frac = K.setStart[set].frac;
        K.given = K.setStart[set].given ?? 0;
      } else {
        K.setStart = {};
        K.lv = startLv();
        K.frac = 1;
        K.given = 0;
      }
      render();
      renderForm();
    });

    T.on('screen', ({ screen }) => {
      // 离开战斗（通过、结算、处决……）：没吸完的那一阵作罢；卡在她手里的回到 HUD 那一格显示（结算画面的大标题在中间）
      if (screen !== 'hold' && screen !== 'endless') {
        K.burst = null;
        card.classList.remove('is-drain', 'is-held', 'is-moved');
        printClear();
      } else if (K.held) card.classList.add('is-held');
      if (screen !== 'execute' && screen !== 'executed') stageOff();
      if (screen === 'brief' || screen === 'story') {
        shown(false);
        return;
      }
      // 无尽战斗（准备、战斗、结算）用无尽版的卡
      const endless = !!S.endless && ['prep', 'endless', 'over'].includes(screen);
      if (endless !== card.classList.contains('is-endless')) {
        card.classList.toggle('is-endless', endless);
        K.rank = null;
        K.title = null;
      }
      if (screen === 'prep') {
        K.fell = false;
        dealClose(false);
        if (S.endless) {
          // 无尽战斗：从委托书直接进的、或者上一局已经归零的，从起始等级开始欠
          if (!(K.lv > 0)) {
            K.lv = startLv();
            K.frac = 1;
          }
        } else if (!K.setStart[S.set]) K.setStart[S.set] = { lv: K.lv, frac: K.frac, given: K.given };
        K.held = false;
        card.classList.remove('is-held');
        stampOff();
        render();
      }
      if (screen === 'pause') requestAnimationFrame(ledger);
      if (screen === 'clear' && !(I.fakeCfg?.() && S.set === I.fakeCfg().after)) stampOn(I.tr('保住'));
      shown(!['brief', 'story', 'choice', 'victory', 'end'].includes(screen));
    });

    // 被动吸取：每一下「压」
    T.on('rhythm', ({ edge }) => {
      if (edge !== 'bottom' || S.freeze || K.fell) return;
      if (S.screen !== 'hold' && S.screen !== 'endless') return;
      if (S.screen === 'hold' && S.finishLeft > 0) return;
      drainXp(drainRate());
    });

    // 逗留（game.js 的 do: stay）：秒数往下数一格＝交出一级，调教进度 +1
    T.on('clock', ({ kind }) => {
      if (kind !== 'stay' || K.fell) return;
      K.given++;
      addLv(-1, { wisp: false });
      suck();
    });

    // 题：失手扣级（challenge.js 已经在章上写了「−n 级」）；出在卡上的题做完＝挡住吸取 / 抢回卡；
    // 连打打完多点到「接受榨取」（trap: "accept"）＝被吸走 levels 级
    T.on('challenge', ({ state, drain, place, levels }) => {
      if (state === 'accept') return drainShow(levels);
      if (state === 'miss' && drain > 0) addLv(-drain);
      if (state === 'hit' && place === 'card') {
        if (K.burst?.guard) {
          K.burst = null;
          stampOn(I.tr('挡住了'), 1200);
          I.emit('card', { state: 'guard' });
        }
        if (K.held) giveBack(true);
      }
    });

    // ---------- 定时演出：吸取 / 交易 / 夺卡 ----------
    for (const name of ['吸取', '交易', '夺卡', '挪卡', '大鞋印']) I.ownFx.add(name);
    T.on('cue', ({ cue }) => {
      if (!cue || !I.inBattle()) return;
      if (cue.fx === '吸取') burst(cue);
      else if (cue.fx === '交易') deal(cue);
      else if (cue.fx === '夺卡') (cue.back ? giveBack() : takeCard());
      else if (cue.fx === '鞋印') printWave(cue);
      else if (cue.fx === '挪卡') moveCard(cue.to);
      else if (cue.fx === '大鞋印') bigHeel(cue);
    });

    function burst({ levels = 3, seconds = 2, guard = false } = {}) {
      const n = Math.max(0, Math.round(Number(levels) || 0));
      if (!n) return;
      K.burst = { left: n, every: Math.max(0.05, (Number(seconds) || 2) / n), t: 0, guard: !!guard };
      card.classList.add('is-drain');
      I.emit('card', { state: 'burst', levels: n, seconds: Number(seconds) || 2 });
    }
    function burstTick(dt) {
      const B = K.burst;
      if (!B) return card.classList.remove('is-drain');
      if (!I.inBattle()) {
        K.burst = null;
        return card.classList.remove('is-drain');
      }
      if (S.freeze || K.fell) return;
      B.t += dt;
      while (B.t >= B.every && B.left > 0) {
        B.t -= B.every;
        B.left--;
        addLv(-1);
        if (!K.burst) return;
      }
      if (B.left <= 0) {
        K.burst = null;
        card.classList.remove('is-drain');
      }
    }

    /**
     * 挪卡（007 第 4 组，站主 2026-10-19：原来的夺卡没什么意思）：趁大的特写挡住画面的时候把卡挪到别处——
     * 后面的鞋印就往新的位置去，没反应过来的人容易失手。to: [x, y]（卡的中心落在画面宽 / 高的几成）或 "back"（回原处）；
     * 离开战斗自己回原处
     */
    function moveCard(to) {
      if (!Array.isArray(to)) {
        card.classList.remove('is-moved');
        return;
      }
      // 按卡原来的位置算（外层那一格不动，挪的是里面的卡）
      const a = app.getBoundingClientRect();
      const o = card.getBoundingClientRect();
      card.style.setProperty('--move-x', `${Math.round(a.width * to[0] - (o.left - a.left + o.width / 2))}px`);
      card.style.setProperty('--move-y', `${Math.round(a.height * to[1] - (o.top - a.top + o.height / 2))}px`);
      card.classList.add('is-moved');
      I.emit('card', { state: 'move', to });
    }

    /** 大鞋印：一只占画面一大半的高跟鞋印从镜头前踩下来、落在正中，地面一震、扬一圈尘，停一下再淡掉（站主 2026-10-19：第 3 组打断的时候） */
    function bigHeel({ hold = 1.3, angle } = {}) {
      const a = app.getBoundingClientRect();
      const node = el('span', 'print print--big');
      node.innerHTML = HEEL_SVG;
      const w = Math.min(a.width * 0.62, 300);
      node.style.cssText = `left:${(a.width / 2).toFixed(1)}px;top:${(a.height * 0.46).toFixed(1)}px;width:${w.toFixed(0)}px;height:${(w * 1.6).toFixed(0)}px;margin:${(-w * 0.8).toFixed(0)}px 0 0 ${(-w / 2).toFixed(0)}px;rotate:${angle ?? (Math.random() < 0.5 ? -14 : 12)}deg`;
      PL.append(node);
      I.play?.('鞋跟');
      I.play?.('踩');
      setTimeout(() => I.shake?.(), reduce.matches ? 0 : 160);
      I.ono?.({ text: I.tr('踩'), point: { x: a.width * 0.5 + w * 0.42, y: a.height * 0.3 }, big: true });
      if (reduce.matches) {
        setTimeout(() => node.remove(), hold * 1000);
        return;
      }
      const anim = animate(node, [{ scale: '2.4', opacity: 0 }, { scale: '0.94', opacity: 1, offset: 0.14 }, { scale: '1', opacity: 1, offset: 0.2 }, { scale: '1', opacity: 1, offset: 0.8 }, { scale: '1.04', opacity: 0 }], { duration: (hold + 0.5) * 1000, easing: 'cubic-bezier(.3,.7,.3,1)' });
      if (anim) anim.onfinish = () => node.remove();
      else setTimeout(() => node.remove(), (hold + 0.5) * 1000);
      const dust = el('span', 'print-dust');
      dust.style.cssText = `left:${(a.width / 2).toFixed(1)}px;top:${(a.height * 0.46 + w * 0.6).toFixed(1)}px`;
      PL.append(dust);
      const d = animate(dust, [{ scale: '0.3', opacity: 0.9 }, { scale: '2.6', opacity: 0 }], { duration: 700, delay: 140, easing: 'ease-out' });
      if (d) d.onfinish = () => dust.remove();
      else setTimeout(() => dust.remove(), 900);
    }

    function takeCard() {
      if (K.held) return;
      K.held = true;
      // 飞到她手边：画面偏右上一点（卡在 HUD 左上角，按两边的位置算位移）
      const a = app.getBoundingClientRect();
      const r = card.getBoundingClientRect();
      card.style.setProperty('--held-x', `${Math.round(a.width * 0.58 - (r.left - a.left) - r.width / 2)}px`);
      card.style.setProperty('--held-y', `${Math.round(a.height * 0.3 - (r.top - a.top))}px`);
      card.classList.add('is-held');
      if (!reduce.matches) animate(card.querySelector('.card-hud-body'), [{ rotate: '0deg', scale: '1' }, { rotate: '-14deg', scale: '1.15', offset: 0.4 }, { rotate: '8deg', scale: '1' }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1)' });
      I.emit('card', { state: 'take' });
    }
    /** byPlayer：出在卡上的题做完、自己抢回来的（她说一句「夺卡-抢回来了」）；定时演出的 back 是她还回来 */
    function giveBack(byPlayer = false) {
      if (!K.held) return;
      K.held = false;
      card.classList.remove('is-held');
      if (byPlayer) {
        stampOn(I.tr('抢回来了'), 1200);
        remark('夺卡-抢回来了');
      }
      I.emit('card', { state: 'back' });
    }

    // 交易单：几秒内点「成交」＝花等级换一段奖励
    const slip = el('div', 'card-deal');
    slip.innerHTML =
      '<span class="stamp-tag"></span><p class="card-deal-text"></p><p class="card-deal-cost num"></p>' +
      '<button type="button" class="card-deal-yes"></button><i class="card-deal-timer"></i>';
    slip.hidden = true;
    app.append(slip);
    slip.querySelector('.stamp-tag').textContent = I.tr('交易');
    slip.querySelector('.card-deal-yes').addEventListener('click', () => dealClose(true));
    function deal(cue) {
      dealClose(false, true);
      const cost = Math.max(0, Math.round(Number(cue.cost) || 0));
      const secs = Math.max(1, Number(cue.seconds) || 5);
      K.deal = { cue, cost, until: performance.now() + secs * 1000, secs };
      slip.querySelector('.card-deal-text').textContent = cue.text ?? '';
      slip.querySelector('.card-deal-cost').textContent = cost ? `−${cost} Lv` : '';
      slip.querySelector('.card-deal-yes').textContent = I.tr(cue.yes ?? '成交');
      slip.hidden = false;
      slip.querySelector('.card-deal-timer').style.transform = 'scaleX(1)';
      if (!reduce.matches) animate(slip, [{ translate: '0 -30px', scale: '1.2', opacity: 0 }, { translate: '0 0', scale: '1', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
      I.emit('card', { state: 'deal', cost });
    }
    /** 交易单收掉：yes＝答应了；quiet＝不说话（换下一张、换画面） */
    function dealClose(yes, quiet = false) {
      const D = K.deal;
      if (!D) return;
      K.deal = null;
      slip.hidden = true;
      if (quiet || !I.inBattle()) return;
      if (yes) {
        // 先被吸（一级一级飞到她嘴边、最后在卡上亲一口），吸完才放奖励的静图
        drainShow(D.cost, { after: () => D.cue.reward && I.fx?.('视频', { ...D.cue.reward }) });
        if (D.cue.accept) I.say(D.cue.accept);
      } else if (D.cue.refuse) I.say(D.cue.refuse);
      I.emit('card', { state: yes ? 'accept' : 'refuse', cost: D.cost });
    }

    /**
     * 被榨取（交易答应了、连打打完多点到「接受榨取」）——站主 2026-10-17：点了要有等级榨取的特效，做得诱惑一点。
     * 画面泛粉、魅惑闪光；等级一级一级被吸到她嘴边（每级一枚「−1」顺着弧线飞过去，嘴边冒心）；吸完她嘴边「啾」，在卡上亲一口
     */
    function drainShow(n, { after } = {}) {
      n = Math.max(0, Math.round(Number(n) || 0));
      if (!n || K.fell || !I.inBattle()) return void after?.();
      const set = S.set;
      const a = app.getBoundingClientRect();
      const raw = I.anchorPoint?.('lips');
      // 镜头推到别处时嘴可能在画面外：收回画面里
      const lips = raw ? { x: Math.max(50, Math.min(a.width - 90, raw.x)), y: Math.max(90, Math.min(a.height * 0.62, raw.y)) } : null;
      I.charmBoost?.(0.3);
      I.fx?.('魅惑闪光');
      I.emit('card', { state: 'squeeze', levels: n });
      const gap = reduce.matches ? 0 : Math.max(150, Math.min(300, 1400 / n));
      const alive = () => !K.fell && I.inBattle() && S.set === set;
      K.streamUntil = performance.now() + 120 + n * gap + 900;
      for (let i = 0; i < n; i++) {
        setTimeout(() => {
          if (!alive()) return;
          addLv(-1, { wisp: false });
          suck(lips, { sound: i % 2 === 0 });
          if (lips && !reduce.matches) setTimeout(() => I.heartSpray?.(lips.x, lips.y, { count: 3, spread: 46, rise: 40, size: [8, 14] }), 900);
        }, 120 + i * gap);
      }
      setTimeout(() => {
        if (!alive()) return;
        if (lips) I.ono?.({ pool: '拟声-亲', point: { x: lips.x + 44, y: lips.y - 34 } });
        const p = I.cardPoint();
        if (p) I.fx?.('唇印', { color: '粉', point: { x: p.x + 12, y: p.y } });
        after?.();
      }, 120 + n * gap + 700);
    }

    // ---------- 鞋印（007 第 3 组起）：从画面别处一步一步踩向卡片；点掉就没事，踩到卡上扣一级 ----------
    const PL = el('div', 'print-layer');
    app.append(PL);
    const P = { list: [], queue: [] };
    for (const name of ['鞋印']) I.ownFx.add(name);
    function printWave(cue) {
      const count = Math.max(1, Math.round(Number(cue.count) || 1));
      const every = Math.max(0.1, Number(cue.every) || 0.8);
      const speed = Math.max(0.3, Number(cue.speed) || 1);
      for (let i = 0; i < count; i++) P.queue.push({ wait: i * every, speed, steps: cue.steps, set: S.set, around: !!cue.around, turn: i / count });
      if (cue.pool) I.say(cue.pool);
      I.emit('card', { state: 'prints', count });
    }
    /** 鞋印朝着卡的方向（图里前掌朝上） */
    function printAim(pr, target) {
      const ang = (Math.atan2(target.y - pr.pos.y, target.x - pr.pos.x) * 180) / Math.PI + 90;
      pr.node.style.left = `${pr.pos.x.toFixed(1)}px`;
      pr.node.style.top = `${pr.pos.y.toFixed(1)}px`;
      pr.node.style.rotate = `${ang.toFixed(1)}deg`;
    }
    function printSpawn(o) {
      const target = I.cardPoint();
      if (!target) return;
      const a = app.getBoundingClientRect();
      // 出生点：画面中下部、离卡够远；让开节奏轨（右边一条）、秒数、台词条、放弃按钮
      const avoid = ['#rhythm', '#say', '#quit-bar', '#quit-pill', '#clock']
        .map((s) => app.querySelector(s)?.getBoundingClientRect())
        .filter((r) => r?.width && r.height)
        .map((r) => ({ l: r.left - a.left - 34, t: r.top - a.top - 34, r: r.right - a.left + 34, b: r.bottom - a.top + 34 }));
      let pos = null;
      // around：绕着卡一圈，这一只从第 turn 圈的方向（加一点随机）出来，离卡 200–270px，收在画面里
      if (o.around) {
        const top = (app.querySelector('.hud')?.getBoundingClientRect().bottom ?? a.top + 48) - a.top + 30;
        for (let i = 0; i < 30 && !pos; i++) {
          const ang = (o.turn + Math.random() * 0.25) * Math.PI * 2 + i * 0.7;
          const r = 200 + Math.random() * 70;
          const x = Math.max(36, Math.min(a.width - 64, target.x + Math.cos(ang) * r));
          const y = Math.max(top, Math.min(a.height * 0.74, target.y + Math.sin(ang) * r));
          if (Math.hypot(x - target.x, y - target.y) < 150) continue;
          pos = { x, y };
        }
      }
      for (let i = 0; i < 50 && !pos; i++) {
        const x = 44 + Math.random() * (a.width - 88);
        const y = a.height * 0.28 + Math.random() * a.height * 0.46;
        if (Math.hypot(x - target.x, y - target.y) < Math.min(260, a.height * 0.32)) continue;
        if (avoid.some((q) => x > q.l && x < q.r && y > q.t && y < q.b)) continue;
        pos = { x, y };
      }
      pos ??= { x: a.width * 0.55, y: a.height * 0.58 };
      const steps = Math.max(3, Math.round(Number(o.steps) || Math.hypot(target.x - pos.x, target.y - pos.y) / 72));
      const node = el('button', 'print');
      node.type = 'button';
      node.setAttribute('aria-label', I.tr('鞋印'));
      node.innerHTML = HEEL_SVG;
      PL.append(node);
      const pr = { node, pos, left: steps, t: 0, every: 0.62 / o.speed, foot: Math.random() < 0.5 ? -1 : 1, set: o.set };
      printAim(pr, target);
      node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        printBreak(pr);
      });
      P.list.push(pr);
      I.play?.('鞋跟');
      if (!reduce.matches) animate(node, [{ scale: '1.9', opacity: 0 }, { scale: '0.92', opacity: 1, offset: 0.7 }, { scale: '1', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.3,.7,.3,1)' });
    }
    const printOff = (pr) => {
      P.list = P.list.filter((x) => x !== pr);
      pr.node.disabled = true;
    };
    /** 往卡那边走一步：旧位置留一个淡掉的印子，新位置「踩」下去 */
    function printHop(pr) {
      const target = I.cardPoint();
      if (!target) {
        printOff(pr);
        return pr.node.remove();
      }
      pr.left--;
      if (pr.left <= 0) return printStomp(pr, target);
      if (!reduce.matches) {
        const ghost = el('span', 'print print--ghost');
        ghost.innerHTML = HEEL_SVG;
        ghost.style.cssText = `left:${pr.pos.x.toFixed(1)}px;top:${pr.pos.y.toFixed(1)}px;rotate:${pr.node.style.rotate}`;
        PL.prepend(ghost);
        const g = animate(ghost, [{ opacity: 0.55 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
        if (g) g.onfinish = () => ghost.remove();
        else ghost.remove();
      }
      const dx = target.x - pr.pos.x;
      const dy = target.y - pr.pos.y;
      const d = Math.hypot(dx, dy) || 1;
      const step = d / (pr.left + 1);
      pr.foot = -pr.foot;
      // 左右脚交替：每一步往两边错开一点
      pr.pos = { x: pr.pos.x + (dx / d) * step - (dy / d) * pr.foot * 13, y: pr.pos.y + (dy / d) * step + (dx / d) * pr.foot * 13 };
      printAim(pr, target);
      I.play?.('鞋跟-轻');
      if (!reduce.matches) animate(pr.node, [{ scale: '1.35', opacity: 0.4 }, { scale: '0.9', opacity: 1, offset: 0.55 }, { scale: '1', opacity: 1 }], { duration: 200, easing: 'cubic-bezier(.3,.7,.3,1)' });
      // 最后两步越来越近：卡抖一下预警
      if (pr.left <= 1) card.classList.add('is-threat');
    }
    /** 点掉了：鞋印裂开、往外散 */
    function printBreak(pr) {
      if (!P.list.includes(pr)) return;
      printOff(pr);
      I.play?.('挑战命中');
      I.emit('card', { state: 'dodge' });
      if (reduce.matches) return pr.node.remove();
      pr.node.classList.add('is-broken');
      const b = animate(pr.node, [{ scale: '1', opacity: 1 }, { scale: '1.45', opacity: 0.9, offset: 0.35 }, { scale: '0.6', opacity: 0 }], { duration: 260, easing: 'ease-out', fill: 'forwards' });
      if (b) b.onfinish = () => pr.node.remove();
      else pr.node.remove();
    }
    /** 踩到卡上：卡被踩扁一下、卡上留一个鞋印、「踩」、扣一级 */
    function printStomp(pr, target) {
      printOff(pr);
      // 最后一步落到卡上：放大着踩下去、淡掉
      if (reduce.matches) pr.node.remove();
      else {
        pr.pos = { ...target };
        printAim(pr, { x: target.x, y: target.y - 1 });
        const s = animate(pr.node, [{ scale: '1.5', opacity: 1 }, { scale: '0.95', opacity: 1, offset: 0.45 }, { scale: '1', opacity: 0 }], { duration: 360, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
        if (s) s.onfinish = () => pr.node.remove();
        else pr.node.remove();
      }
      if (!P.list.some((x) => x.left <= 1)) card.classList.remove('is-threat');
      if (K.fell || !I.inBattle()) return;
      I.play?.('鞋跟');
      I.play?.('踩');
      I.shake?.();
      stompHit(target);
      card.classList.remove('is-stomped');
      void card.offsetWidth;
      card.classList.add('is-stomped');
      clearTimeout(K.stompTimer);
      K.stompTimer = setTimeout(() => card.classList.remove('is-stomped'), 1800);
      I.ono?.({ text: I.tr('踩中'), point: { x: target.x + 56, y: target.y + 44 }, big: true });
      // 无敌模式（题失手不算输）：鞋印是失手，最多踩到 Lv1——吸到 0 只能是自己留下来、答应交易、点了陷阱
      addLv(-1, { wisp: false, floor: S.invincible && S.screen !== 'endless' ? 1 : null });
      suck(null, { sound: false });
      I.emit('card', { state: 'stomp', lv: K.lv });
    }
    /**
     * 踩中了（站主 2026-10-19 第三批：原来只是普通地淡掉，没有「踩中了」的感觉）：卡不动——
     * 落点炸开一枚粉红的星形冲击 + 一圈往外扩的环 + 八道短线，卡上的鞋印砸下来（大 → 小 → 回弹一下）、卡面闪一下红；鞋印留在卡上一会儿再淡掉
     */
    function stompHit(target) {
      card.classList.remove('is-hit');
      void card.offsetWidth;
      card.classList.add('is-hit');
      if (reduce.matches) return;
      const heel = $('.card-hud-heel');
      animate(heel, [{ scale: '2.2', opacity: 0 }, { scale: '0.86', opacity: 1, offset: 0.42 }, { scale: '1.08', opacity: 1, offset: 0.7 }, { scale: '1', opacity: 0.9 }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1)' });
      const hit = el('span', 'print-hit');
      hit.style.cssText = `left:${target.x.toFixed(1)}px;top:${target.y.toFixed(1)}px`;
      const star = Array.from({ length: 24 }, (_, i) => {
        const a = (Math.PI * i) / 12 - Math.PI / 2;
        const r = i % 2 ? 26 : 50 + (i % 4 === 0 ? 8 : 0);
        return `${(60 + Math.cos(a) * r).toFixed(1)},${(60 + Math.sin(a) * r).toFixed(1)}`;
      }).join(' ');
      const lines = Array.from({ length: 8 }, (_, i) => {
        const a = (Math.PI * i) / 4 + Math.PI / 8;
        return `<line x1="${(60 + Math.cos(a) * 58).toFixed(1)}" y1="${(60 + Math.sin(a) * 58).toFixed(1)}" x2="${(60 + Math.cos(a) * 78).toFixed(1)}" y2="${(60 + Math.sin(a) * 78).toFixed(1)}"/>`;
      }).join('');
      hit.innerHTML = `<svg viewBox="-20 -20 160 160" aria-hidden="true"><circle class="print-hit-ring" cx="60" cy="60" r="44"/><polygon class="print-hit-star" points="${star}"/><g class="print-hit-lines">${lines}</g></svg>`;
      PL.append(hit);
      const svgEl = hit.firstElementChild;
      animate(svgEl.querySelector('.print-hit-star'), [{ scale: '0.3', opacity: 1 }, { scale: '1.1', opacity: 1, offset: 0.35 }, { scale: '1.25', opacity: 0 }], { duration: 420, easing: 'ease-out' });
      animate(svgEl.querySelector('.print-hit-ring'), [{ scale: '0.4', opacity: 0.95 }, { scale: '2', opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.7,.3,1)' });
      animate(svgEl.querySelector('.print-hit-lines'), [{ scale: '0.6', opacity: 1 }, { scale: '1.3', opacity: 0 }], { duration: 380, easing: 'ease-out' });
      setTimeout(() => hit.remove(), 600);
    }

    function printTick(dt) {
      if (!P.list.length && !P.queue.length) return;
      if (!I.inBattle() || S.finishLeft > 0) return printClear();
      if (S.freeze || K.fell) return;
      P.queue = P.queue.filter((q) => q.set === S.set);
      for (const q of [...P.queue]) {
        q.wait -= dt;
        if (q.wait > 0) continue;
        P.queue = P.queue.filter((x) => x !== q);
        printSpawn(q);
      }
      for (const pr of [...P.list]) {
        if (pr.set !== S.set) {
          printOff(pr);
          pr.node.remove();
          continue;
        }
        pr.t += dt;
        if (pr.t >= pr.every) {
          pr.t -= pr.every;
          printHop(pr);
        }
      }
    }
    function printClear() {
      P.list = [];
      P.queue = [];
      PL.replaceChildren();
      card.classList.remove('is-threat');
    }
    T.on('finish', printClear);
    function dealTick() {
      const D = K.deal;
      if (!D) return;
      if (!I.inBattle()) return dealClose(false, true);
      const left = (D.until - performance.now()) / 1000;
      slip.querySelector('.card-deal-timer').style.transform = `scaleX(${Math.max(0, left / D.secs).toFixed(3)})`;
      if (left <= 0) dealClose(false);
    }

    // ---------- 暂停画面：结算单 ----------
    function ledger() {
      if (S.screen !== 'pause') return;
      const L = { gain: 0, fee: 0, ...(C().ledger ?? {}), ...(setCard().ledger ?? {}) };
      const gain = Math.round(Number(L.gain) || 0);
      const fee = Math.round(Number(L.fee) || 0);
      if (!gain && !fee) return;
      const status = app.querySelector('#adv-status');
      if (!status || status.querySelector('.card-ledger')) return;
      const box = el('div', 'card-ledger');
      const row = (label, v, cls = '') => {
        const r = el('p', `card-ledger-row ${cls}`);
        r.append(el('span', '', label), el('b', 'num', v));
        return r;
      };
      const net = gain - fee;
      const fmt = (v) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v)}`;
      box.append(row(I.tr('讨伐经验'), fmt(gain)), row(I.tr('窗口手续费'), fmt(-fee), 'is-fee'), row(I.tr('合计'), `${fmt(net)} Lv`, 'is-sum'));
      status.append(box);
      // 结算单不会把人算到 0
      setTimeout(() => addLv(net, { floor: 1 }), reduce.matches ? 0 : 700);
    }

    // ---------- 败北处决：从当时的等级吸到 0 ----------
    /**
     * 清空（等级在战斗里被吸到 0，game.js 的 drained）：卡被端到画面正中、放大——
     * 她说第一句时 Lv0 一跳、最后一点光从卡里漏出去；第二句她在卡上亲一口；最后一句盖「清空」；归零那一刻卡被收走（回到原处、盖回收编号）
     */
    function stageOn() {
      stampOff();
      card.classList.add('is-stage');
      I.play?.('魅惑闪光');
    }
    function stageBeat(i, count) {
      if (!card.classList.contains('is-stage')) return;
      if (i === 0) {
        if (!reduce.matches) animate($('.card-hud-num'), [{ scale: '2.2', color: '#c27bff' }, { scale: '0.9', offset: 0.5 }, { scale: '1' }], { duration: 620, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
        wisps(10);
        I.play?.('接触');
      } else if (i < count - 1) {
        const p = I.cardPoint();
        if (p) I.fx?.('唇印', { color: '紫', point: { x: p.x + 20, y: p.y - 10 } });
      } else {
        // 最后一句：在卡上亲一口（只有两句的时候和盖章一起）、盖「清空」
        const p = I.cardPoint();
        if (p && count < 3) I.fx?.('唇印', { color: '紫', point: { x: p.x + 20, y: p.y - 10 } });
        stampOn(I.tr('清空'));
        I.shake?.();
        I.play?.('通过');
      }
    }
    function stageOff() {
      card.classList.remove('is-stage');
    }

    T.on('execute', ({ state, left, seconds, drained, index, count }) => {
      if (state === 'intro') {
        stampOff();
        shown(true);
        if (drained) stageOn();
      }
      if (state === 'line' && drained) stageBeat(index, count);
      if (state === 'start') K.execFrom = Math.max(0, K.lv);
      if (state === 'second' && K.execFrom != null && seconds > 0) {
        const to = Math.round((K.execFrom * left) / seconds);
        if (to < K.lv) {
          wisps(Math.min(8, 2 + K.lv - to));
          K.lv = to;
          K.frac = left > 0 ? 1 : 0;
          render(1);
        }
      }
      if (state === 'zero') {
        K.lv = 0;
        K.frac = 0;
        render(1);
        const n = readNum('cards') + 1;
        writeNum('cards', n);
        const no = Math.max(0, Math.round(Number(C().collection) || 0)) + n;
        K.collectedNo = String(no).padStart(5, '0');
        stampOn(I.tr('回收 No.{n}', { n: K.collectedNo }));
        renderName();
        I.emit('card', { state: 'collected', no, count: n });
        if (card.classList.contains('is-stage')) setTimeout(stageOff, reduce.matches ? 0 : 700);
      }
    });
    I.cardCollected = () => readNum('cards');
    // 查问题、调数值用：window.tobatsu.card.set(5) 把等级设成 5（不经过吸取的演出）
    T.card = {
      lv: () => K.lv,
      set: (n) => {
        K.lv = Math.round(Number(n) || 0);
        K.frac = 1;
        render();
        check();
      },
    };

    // ---------- 每帧 ----------
    let last = performance.now();
    const prevAfter = I.MV.afterFrame;
    I.MV.afterFrame = (dt) => {
      prevAfter?.(dt);
      const now = performance.now();
      const step = Math.min(0.1, (now - last) / 1000);
      last = now;
      burstTick(step);
      dealTick();
      printTick(step);
      streamTick(step, now);
    };

    /**
     * 被吸着的时候（逗留扣级那一段、被榨取那一阵、猛吸）：一颗颗紫色的光点不停地从卡上飘到她身上——
     * 和 fx.bd7dd87caa.js 的重影、暗角一起，是「等级正在被吸」的样子（站主 2026-10-18 要一个吸取专用的特效）
     */
    function streamTick(dt, now) {
      const on = (app.dataset.stay === 'drain' && S.screen === 'hold') || now < (K.streamUntil ?? 0) || !!K.burst;
      if (!on || K.fell) return;
      K.streamT = (K.streamT ?? 0) - dt;
      if (K.streamT > 0) return;
      K.streamT = 0.24 + Math.random() * 0.12;
      wisps(1);
    }

    render();
    renderForm();
  };

  if (window.tobatsu?.ready) start();
  else window.addEventListener('tobatsu:ready', start, { once: true });
})();
