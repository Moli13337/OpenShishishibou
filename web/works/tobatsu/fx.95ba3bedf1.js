/*
 * 讨伐任务 · 插入演出
 *
 * game.6051d2b93f.js 管流程和立绘，这里管「插进来的一下」：
 *   拟声词贴纸 / 浮现台词（耳语、气泡、大字、竖排、思绪，文字样式有预设）/ 魅了层（粉紫暗角 + 粉紫黑心形粒子 + 放大的半透明幻象）/
 *   倒计时诱惑 / 胸部特写 cut-in（纵：上下，循环按呼吸；横：左右摆；都可循环）/ 臀部特写（截突出的半边、往那边扭；可循环）/ 眼神特写（久留的魅惑残影 + 心形环）/ 魅惑闪光（轻闪 + 晃 + 放大残影）/
 *   心章（发光纹章）/ 唇印（程序画的口红印）/ 集中线 / 命令（集中线 + 叫玩家在现实里做的动作）/ 吐息
 *
 * 触发：
 *   - 演出表：战斗中按 quest-<编号>.jsonc 的 stage（各段每隔几秒、切阶段、到顶到底、心跳、最后几秒、松手）从那一格里按权重抽
 *   - 事件：大幅摇动 → 拟声「摇」；后段心跳 → 拟声「心跳」；长按放弃又松手 → 魅了加深 + 大字；倒计时最后几秒 → 倒计时诱惑
 *   - 剧情：story-<编号>.jsonc 某句写 "fx": "魅惑闪光"（或数组）、"float": "耳语"（或 { "style": "大字", "text": "…" }）
 *   - 调节器：window.tobatsu.tune.fx.play(名字)
 *
 * 所有文字从 lines-common.jsonc / lines-<编号>.jsonc 的池里取（拟声-*、浮现-*、倒计时、特写-*、集中线、命令）。
 * 减少动态时：浮现文字静态出现再消失，其余演出不放；魅了层只留暗角。
 */
(() => {
  'use strict';

  const start = () => {
    const T = window.tobatsu;
    const I = T._;
    const { S, MV, app, reduce, play, pick, el, animate } = I;
    const Q = I.Q;
    const cfg = () => Q().fx ?? {};
    const rand = (a, b) => a + Math.random() * (b - a);
    const randInt = (a, b) => Math.floor(rand(a, b + 1));
    const choice = (arr) => arr[Math.floor(Math.random() * arr.length)];
    const PINK = '#ff6fae';

    // ---------- 图层 ----------
    // 魅了层压在立绘上、HUD 和台词条下面；演出层压在所有东西上面（剧情对话框也在它下面）
    const charm = el('div', 'charm');
    charm.innerHTML = '<div class="charm-vignette"></div><canvas class="charm-hearts"></canvas>';
    app.querySelector('.stage').after(charm);
    const vignette = charm.firstElementChild;
    const heartsCanvas = charm.lastElementChild;
    const layer = el('div', 'fx-layer');
    app.append(layer);

    const appRect = () => app.getBoundingClientRect();

    // ---------- 锚点：屏幕上她的胸 / 脸 / 眼 / 嘴在哪 ----------

    /** 现在屏幕上显示着的那张她的图，和它在 app 里的位置（css px） */
    function visibleStandee() {
      const ar = appRect();
      const inBox = (img, boxEl) => {
        if (!img?.naturalWidth || !boxEl) return null;
        const br = boxEl.getBoundingClientRect();
        if (!br.width || !br.height) return null;
        const [x, y, w, h] = img.classList.contains('framed')
          ? [parseFloat(img.style.left) || 0, parseFloat(img.style.top) || 0, parseFloat(img.style.width) || 0, parseFloat(img.style.height) || 0]
          : I.imageRect(img);
        if (!w || !h) return null;
        return { img, rect: [br.left - ar.left + x, br.top - ar.top + y, w, h] };
      };
      const adv = app.querySelector('#adv');
      if (adv && getComputedStyle(adv).display !== 'none') {
        const box = app.querySelector('#stand-her');
        if (box?.dataset.state === 'on') return inBox(box.querySelector('img'), box);
        return null;
      }
      return inBox(app.querySelector('#art-img img'), app.querySelector('#art'));
    }

    function anchorImagePoint(name, img) {
      const a = cfg().anchors ?? {};
      if (Array.isArray(a[name])) return a[name];
      if (name === 'chest' && MV.chest) return MV.chest;
      const w = img?.naturalWidth ?? 1000;
      const h = img?.naturalHeight ?? 1500;
      return { chest: [w / 2, h * 0.28], face: [w / 2, h * 0.12], eyes: [w / 2, h * 0.11], lips: [w / 2, h * 0.14] }[name] ?? [w / 2, h / 3];
    }

    /** 锚点在 app 里的屏幕坐标；看不到图就给画面中间偏上 */
    function anchor(name) {
      const v = visibleStandee();
      const ar = appRect();
      if (!v) return { x: ar.width / 2, y: ar.height * 0.38 };
      const [ix, iy] = anchorImagePoint(name, v.img);
      const [x, y, w, h] = v.rect;
      return { x: x + (ix / v.img.naturalWidth) * w, y: y + (iy / v.img.naturalHeight) * h };
    }

    // 右边留出节奏滑轨的宽度
    const clampX = (x, margin = 40) => Math.max(margin, Math.min(appRect().width - margin - 40, x));
    const clampY = (y, margin = 60) => Math.max(margin, Math.min(appRect().height - margin, y));

    function place(node, x, y) {
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      layer.append(node);
      return node;
    }

    /** 放完动画就删 */
    function run(node, frames, opts) {
      if (reduce.matches) {
        setTimeout(() => node.remove(), opts.duration + (opts.delay ?? 0));
        return null;
      }
      const a = node.animate(frames, { fill: 'both', ...opts });
      a.onfinish = a.oncancel = () => node.remove();
      return a;
    }

    /** 从池里取一句；池里可以写 {n} 占位 */
    const line = (pool, vars = {}) => String(pick(pool)).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    /**
     * 放的地方小（大字、拟声）：从池里多取几次，挑不超过 max 个字的；都太长就用最短的那句。
     * 字数按字宽算（I.glyphLen：汉字、假名 1，拉丁字母约 0.55），英语句子才量得对
     */
    const wide = (t) => I.glyphLen(t);
    function shortLine(pool, max) {
      let best = line(pool);
      for (let k = 0; k < 8 && wide(best) > max; k++) {
        const t = line(pool);
        if (wide(t) < wide(best)) best = t;
      }
      return best;
    }
    /** 她说的浮现文字没指定池时从哪取：common.jsonc 的 speech.floats（默认按权重混言责三类）；没配就用老的「浮现-*」池 */
    const speechPool = (style) => Q().speech?.floats?.[style] ?? `浮现-${style}`;

    // ---------- 拟声词贴纸 ----------

    const ONO_COLORS = [
      ['#ff6fae', '#fff5e1'],
      ['#fff5e1', '#ff6fae'],
      ['#c9a0ff', '#fff5e1'],
      ['#ff4a2a', '#fff5e1'],
    ];

    /**
     * 拟声词：pool＝lines-*.jsonc 的池名（拟声-摇 / 拟声-心跳 / 拟声-吐息 / 拟声-亲 / 拟声-魅惑）或直接给 text。
     * 每个字单独一枚贴纸，字号、倾角、颜色、出场方式随机；「摇」类的字会各自抖
     */
    function ono({ pool = '拟声-魅惑', text, at = 'chest', big = false, point } = {}) {
      const word = text ?? shortLine(pool, 6);
      const p = point ?? anchor(at);
      const [fill] = choice(ONO_COLORS);
      // 言责池里的句子会比拟声词长：超过 4 个字按字数缩小，别撑出屏
      const size = (big ? rand(46, 62) : rand(30, 44)) * Math.min(1, 4 / Math.max(4, wide(word)));
      const node = el('div', 'ono');
      node.style.fontSize = `${size}px`;
      node.style.setProperty('--ono-fill', fill);
      const tilt = rand(-18, 18);
      node.style.rotate = `${tilt}deg`;
      const wobbly = /摇|抖|晃|臀/.test(pool);
      [...word].forEach((ch, i) => {
        const c = el('span', 'sticker sticker--large ono-ch');
        // 英语的拟声有空格（Thump thump）：行内块里的空格会缩成 0 宽，换成不折行的空格
        I.sticker(c, ch === ' ' ? String.fromCharCode(160) : ch);
        c.style.setProperty('--i', i);
        if (!reduce.matches) {
          c.animate(
            [
              { transform: 'translateY(14px) scale(0.2)', opacity: 0 },
              { transform: `translateY(${-rand(4, 12)}px) scale(1.25)`, opacity: 1, offset: 0.55 },
              { transform: 'translateY(0) scale(1)', opacity: 1 },
            ],
            { duration: 260, delay: i * 55, easing: 'cubic-bezier(.3,.7,.3,1.3)', fill: 'backwards' },
          );
          if (wobbly) {
            c.animate([{ rotate: '-9deg' }, { rotate: '9deg' }], { duration: 90 + i * 10, delay: 260 + i * 55, iterations: 8, direction: 'alternate', easing: 'ease-in-out' });
          }
        }
        node.append(c);
      });
      const side = Math.random() < 0.5 ? -1 : 1;
      const x = clampX(point ? p.x + rand(-20, 20) : p.x + side * rand(50, 120), 60);
      const y = clampY(point ? p.y : p.y - rand(20, 90), 90);
      place(node, x, y);
      run(
        node,
        [
          { translate: '-50% -50%', opacity: 1 },
          { translate: `calc(-50% + ${side * 8}px) calc(-50% - 10px)`, opacity: 1, offset: 0.7 },
          { translate: `calc(-50% + ${side * 16}px) calc(-50% - 34px)`, opacity: 0 },
        ],
        { duration: 1500 + word.length * 80, easing: 'ease-in' },
      );
    }

    // ---------- 浮现台词 ----------

    /**
     * 文字样式：common.jsonc 的 fx.looks 是若干套预设（颜色 / 描边 / 外发光），fx.floatLook 给每种浮现文字选一套和字号。
     * 剧情里 float 可以另写 "look"、"size"。调节器存的本机样式（localStorage）盖在 common.jsonc 上面
     */
    const LOOK_KEY = 'tobatsu.fx-looks';
    try {
      const saved = JSON.parse(localStorage.getItem(LOOK_KEY) || 'null');
      if (saved?.floatLook) Object.assign(((Q().fx ??= {}).floatLook ??= {}), saved.floatLook);
    } catch {}

    const LOOK_DEFAULT = { color: '#fff0f7', stroke: '#0b0b12', strokeWidth: 1.2, glow: '#ff6fae', glowSize: 10 };
    function applyLook(node, style, opts = {}, baseSize = 19) {
      const f = cfg();
      const def = (f.floatLook ?? {})[style] ?? {};
      const looks = f.looks ?? {};
      const L = { ...LOOK_DEFAULT, ...(looks[opts.look ?? def.look] ?? looks[Object.keys(looks)[0]] ?? {}) };
      node.style.setProperty('--fl-color', L.color);
      node.style.setProperty('--fl-stroke', L.stroke);
      node.style.setProperty('--fl-sw', `${L.strokeWidth}px`);
      node.style.setProperty('--fl-glow', L.glow);
      node.style.setProperty('--fl-glow-size', `${L.glowSize}px`);
      if (L.weight) node.style.fontWeight = String(L.weight);
      const size = opts.size ?? def.size ?? baseSize;
      node.style.fontSize = `${size}px`;
      return size;
    }

    /**
     * 断行：超过 max 个字就分成几行、每行差不多长（不是塞满第一行、剩一两个字掉到下一行）；
     * 标点和言责的尾巴（w ~ ♥ … ？！）跟着前一个字，不会自己掉到行首。
     * 日语的长音、小假名也跟着前一个字；英语、韩语按词断（一个词连同后面的空格算一块；韩语的尾巴 ㅋ 跟着前一个字），字数按字宽算
     */
    const SPACED = I.lang === 'en' || I.lang === 'ko';
    const GLUE = SPACED
      ? /^[~♥♡…?!.,;:'’"\sㅋ]$/
      : /^[w～~〜♥♡…？！?!。，、」』）\sーぁぃぅぇぉっゃゅょゎァィゥェォッャュョヮヵヶ]$/;
    /** 一个词里的字：拉丁字母、数字，和谚文（音节、字母） */
    const WORDY = /[A-Za-z0-9'’\-가-힣ᄀ-ᇿㄱ-ㆎ]/;
    /** 正字：尾巴、标点、空格不算（「好啦~~♥♥♥」算 2 个字） */
    const coreLen = (t) => [...t].filter((ch) => !GLUE.test(ch)).length;
    function balancedLines(words, max) {
      const chars = [...words];
      if (wide(words) <= max) return [words];
      const units = [];
      for (const ch of chars) {
        const prev = units.at(-1);
        // 不折行的空格（韩语「{name} 군」）后面那个字也粘着
        if (prev && (GLUE.test(ch) || prev.endsWith(' ') || (WORDY.test(ch) && WORDY.test(prev.at(-1))))) units[units.length - 1] += ch;
        else units.push(ch);
      }
      const len = (arr) => arr.reduce((a, u) => a + wide(u), 0);
      const core = (arr) => arr.reduce((a, u) => a + coreLen(u), 0);
      const n = Math.ceil(wide(words) / max);
      if (n === 2) {
        // 两行：挑一个断点，两行尽量一样长；空格、逗号后面断最自然，~ … 后面次之（减分）；每行不超出太多、每行至少 2 个正字
        let best = null;
        for (let k = 1; k < units.length; k++) {
          const a = units.slice(0, k);
          const b = units.slice(k);
          if (core(b) < 2 || core(a) < 2 || len(a) > max + 2 || len(b) > max + 2) continue;
          const tail = units[k - 1];
          const natural = core(a) < 3 || core(b) < 3 ? 0 : /[\s，、。]$/.test(tail) ? 6 : /[~～…]$/.test(tail) ? 2 : 0;
          const cost = Math.abs(len(a) - len(b)) - natural;
          if (!best || cost < best.cost) best = { k, cost };
        }
        if (best) return [units.slice(0, best.k).join('').trimEnd(), units.slice(best.k).join('')];
      }
      // 三行以上（或挑不出来）：按平均字数往下排，最后一行太短就从上一行挪一个字下来
      const per = Math.ceil(wide(words) / n);
      const lines = [[]];
      for (const u of units) {
        const cur = lines.at(-1);
        if (cur.length && len(cur) + wide(u) > per && lines.length < n) lines.push([]);
        lines.at(-1).push(u);
      }
      const last = lines.at(-1);
      const prev = lines.at(-2);
      while (prev && core(last) < 2 && prev.length > 1) last.unshift(prev.pop());
      return lines.map((l) => l.join('').trimEnd());
    }

    /** 逐字浮出的一串 span；给了 max 就先按上面断好行，一行一个不换行的块 */
    function charsInto(node, words, delay, step, max = 0) {
      let i = 0;
      for (const text of max ? balancedLines(words, max) : [words]) {
        const row = max ? el('div', 'fl-line') : node;
        for (const ch of text) {
          // 逐字的 span 是行内块：光一个空格会缩成 0 宽（英语的词就粘在一起了），换成不折行的空格
          const c = el('span', '', ch === ' ' ? String.fromCharCode(160) : ch);
          c.style.animationDelay = `${delay + i++ * step}ms`;
          row.append(c);
        }
        if (row !== node) node.append(row);
      }
    }

    /** 耳语：逐字浮出的小字，贴着脸边往上飘 */
    function whisper({ text, at = 'face', delay = 0, hold = 2600, style = '耳语', look, size } = {}) {
      const words = text ?? line(speechPool('耳语'));
      const p = anchor(at);
      const node = el('div', 'fl-text fl-whisper');
      applyLook(node, style, { look, size });
      charsInto(node, words, delay, 55, 10);
      const side = Math.random() < 0.5 ? -1 : 1;
      place(node, clampX(p.x + side * rand(70, 130), 110), clampY(p.y + rand(-50, 40), 80));
      node.style.rotate = `${rand(-6, 6)}deg`;
      run(
        node,
        [
          { translate: '-50% -50%', opacity: 1 },
          { translate: '-50% calc(-50% - 10px)', opacity: 1, offset: 0.75 },
          { translate: '-50% calc(-50% - 26px)', opacity: 0 },
        ],
        { duration: hold + words.length * 55, delay, easing: 'ease-in' },
      );
      return node;
    }

    /**
     * 气泡的形状：本体和尾巴画在同一张 SVG 里分四层（投影 / 粉圈 / ink 描边 / 米白填充），
     * 每层都是「本体 + 尾巴」一起画，米白层最后盖上去——描边只露在两者合起来的外轮廓上，接缝处没有线
     */
    function bubbleShape(tailSide) {
      // 尾巴：底边从 x 22–46 出发，尖在 (6, 26)；两条边沿原方向往本体里多伸 14px，被米白层盖住
      const pts = tailSide === 'left' ? '30.6,-14 67.5,-14 6,26' : '-30.6,-14 -67.5,-14 -6,26';
      const tx = tailSide === 'left' ? '0' : '100%';
      const g = (cls, extra = '') =>
        `<g class="${cls}"${extra}><rect width="100%" height="100%" rx="20" ry="20"/><svg x="${tx}" y="100%" overflow="visible"><polygon points="${pts}"/></svg></g>`;
      return `<svg class="fl-bubble-shape" aria-hidden="true">${g('shadow', ' transform="translate(4 5)"')}${g('ring')}${g('ink')}${g('fill')}</svg>`;
    }

    /** 气泡：放在嘴的一侧，尾巴在靠嘴的那一角、尖朝嘴 */
    function bubble({ text } = {}) {
      const words = text ?? line(speechPool('气泡'));
      const p = anchor('lips');
      const r = appRect();
      const side = p.x > (r.width - 48) / 2 ? -1 : 1; // 哪边地方大放哪边
      const tailSide = side > 0 ? 'left' : 'right';
      const node = el('div', 'fl-bubble');
      node.innerHTML = bubbleShape(tailSide);
      // 断好行再放（white-space: pre-line），尾巴不会单独掉到下一行
      // 日语、英语的字比中文宽：一行少放一个字宽，不然 CSS 会再折一次，尾巴（w ♥）掉到下一行
      node.append(el('span', '', balancedLines(words, I.lang === 'zh' ? 12 : 11).join('\n')));
      node.style.visibility = 'hidden';
      layer.append(node);
      const w = node.offsetWidth;
      const h = node.offsetHeight;
      const tipX = p.x + side * 56;
      const tipY = p.y - 6;
      const left = Math.max(8, Math.min(r.width - w - 56, side > 0 ? tipX - 6 : tipX + 6 - w));
      const top = Math.max(48, tipY - 26 - h);
      Object.assign(node.style, { left: `${left}px`, top: `${top}px`, visibility: '' });
      node.style.transformOrigin = tailSide === 'left' ? `6px ${h + 26}px` : `${w - 6}px ${h + 26}px`;
      run(
        node,
        [
          { transform: 'scale(0.2)', opacity: 0 },
          { transform: 'scale(1.08)', opacity: 1, offset: 0.12 },
          { transform: 'scale(1)', opacity: 1, offset: 0.2 },
          { transform: 'scale(1)', opacity: 1, offset: 0.85 },
          { transform: 'translateY(-12px) scale(0.96)', opacity: 0 },
        ],
        { duration: 2800, easing: 'ease-out' },
      );
    }

    /** 大字：压迫感的贴纸大字，砸下来、抖一阵、淡掉 */
    function shout({ text, dark = false } = {}) {
      const words = text ?? shortLine(speechPool('大字'), 8);
      const node = el('div', dark ? 'fl-shout fl-shout--fall' : 'fl-shout');
      const s = el('span', 'sticker sticker--large');
      I.sticker(s, words);
      node.append(s);
      const r = appRect();
      place(node, r.width / 2, r.height * rand(0.32, 0.46));
      node.style.rotate = `${rand(-8, 8)}deg`;
      if (reduce.matches) return run(node, [], { duration: 1600 });
      const a = node.animate(
        [
          { transform: 'translate(-50%, -50%) scale(2.6) skewX(-12deg)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.92) skewX(0)', opacity: 1, offset: 0.12 },
          { transform: 'translate(calc(-50% - 3px), calc(-50% + 2px)) scale(1)', opacity: 1, offset: 0.2 },
          { transform: 'translate(calc(-50% + 3px), calc(-50% - 2px)) scale(1)', opacity: 1, offset: 0.28 },
          { transform: 'translate(calc(-50% - 2px), -50%) scale(1)', opacity: 1, offset: 0.36 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.8 },
          { transform: 'translate(-50%, -50%) scale(1.15)', opacity: 0 },
        ],
        { duration: 1900, easing: 'ease-out', fill: 'both' },
      );
      a.onfinish = () => node.remove();
    }

    /**
     * 竖排＝主人公（你）的心声，专门和她说的话分开：墨色竖条 + 米白描边字，底下拖一串往画面下方越来越小的思考泡泡（CSS 画的），不发光。
     * 魅了越深，字越往粉里染、泛起粉光、开始发抖——心声被她染上颜色。
     * 靠左边放（右边是节奏轨）；左边已经有一条就放到右边节奏轨里侧。台词池默认 speech.floats.竖排（委托可以混自己的心声池），没写就是「心声」；look 不管用（样式固定），size 管字号
     */
    function vertical({ text, size, x, y } = {}) {
      const words = text ?? line(Q().speech?.floats?.竖排 ?? '心声');
      const corrupt = Math.min(1, Math.max(0, ((CH.level ?? 0) - 0.15) / 0.6));
      const mix = (a, b) => Math.round(a + (b - a) * corrupt);
      const node = el('div', 'fl-heart');
      const body = el('div', 'fl-text fl-heart-text');
      body.style.setProperty('--fl-color', `rgb(${mix(255, 255)} ${mix(245, 158)} ${mix(225, 205)})`);
      body.style.setProperty('--fl-stroke', '#0b0b12');
      body.style.setProperty('--fl-sw', '1.3px');
      body.style.setProperty('--fl-glow', `rgb(255 111 174 / ${(corrupt * 0.85).toFixed(2)})`);
      body.style.setProperty('--fl-glow-size', `${Math.round(corrupt * 11)}px`);
      body.style.fontSize = `${size ?? (cfg().floatLook ?? {})['竖排']?.size ?? 19}px`;
      // 英语字母多：逐字的间隔缩短，整句浮出来的时间和中文差不多
      charsInto(body, words, 180, I.lang === 'en' ? 60 : 110);
      node.append(body);
      node.style.setProperty('--corrupt', corrupt.toFixed(2));
      if (corrupt > 0.45) node.dataset.tremble = '1';
      const r = appRect();
      // x / y：指定放哪儿（分岔里心声一句接一句涌出来的时候铺满上半屏）；不写就左右两边轮着放
      const side = x != null ? (x < r.width / 2 ? 'left' : 'right') : [...layer.querySelectorAll('.fl-heart')].some((n) => n.dataset.side === 'left') ? 'right' : 'left';
      node.dataset.side = side;
      place(node, x ?? (side === 'left' ? rand(30, 42) : r.width - rand(94, 104)), y ?? r.height * rand(0.13, 0.22));
      run(
        node,
        [
          { scale: '1 0', opacity: 1 },
          { scale: '1 1', opacity: 1, offset: 0.05 },
          { scale: '1 1', opacity: 1, offset: 0.86 },
          { scale: '1 1', opacity: 0 },
        ],
        { duration: 3400 + wide(words) * 110, easing: 'ease-out' },
      );
    }

    /** 思绪：几句话接连在画面各处浮现、叠在一起再一起淡掉——像念头被她塞进来 */
    function thoughts({ lines, text, look, size } = {}) {
      let group = lines ?? (text ?? textFor('思绪', speechPool('思绪'))).split(/[／/]/);
      if (!Array.isArray(group)) group = String(group).split(/[／/]/);
      const r = appRect();
      group.forEach((t, i) => {
        const node = el('div', 'fl-text fl-thought');
        const base = applyLook(node, '思绪', { look, size }, 18);
        node.style.fontSize = `${base * rand(0.85, 1.2)}px`;
        charsInto(node, t, i * 650, 45);
        place(node, rand(r.width * 0.25, r.width * 0.7), rand(r.height * 0.18, r.height * 0.62));
        node.style.rotate = `${rand(-10, 10)}deg`;
        run(
          node,
          [
            { translate: '-50% -50%', opacity: 0.92 },
            { translate: '-50% -50%', opacity: 0.92, offset: 0.8 },
            { translate: '-50% calc(-50% - 14px)', opacity: 0 },
          ],
          { duration: 2600 + (group.length - i) * 650, delay: 0, easing: 'ease-in' },
        );
      });
    }

    const FLOATS = { 耳语: whisper, 气泡: bubble, 大字: shout, 竖排: vertical, 思绪: thoughts };

    // ---------- 心形（实心 / 环；粉、玫红、紫、黑）----------

    const HEART_D = 'M50 88 C22 70 6 52 6 32 C6 17 17 7 30 7 C39 7 46 12 50 20 C54 12 61 7 70 7 C83 7 94 17 94 32 C94 52 78 70 50 88 Z';
    const HEART_PATH = new Path2D(HEART_D);
    const TONES = {
      pink: { fill: '#ff6fae', glow: 'rgb(255 111 174 / 0.9)' },
      rose: { fill: '#ff3d8b', glow: 'rgb(255 61 139 / 0.85)' },
      purple: { fill: '#a86bff', glow: 'rgb(160 90 255 / 0.9)' },
      black: { fill: '#1c0b1e', glow: 'rgb(255 70 160 / 0.95)', edge: '#ff6fae' },
    };

    /** 按 fx.heartTones 的权重挑颜色 */
    function heartTone() {
      const exec = S.screen === 'execute' || S.screen === 'executed';
      const w = exec ? { pink: 1, rose: 1, purple: 4, black: 4 } : (cfg().heartTones ?? { pink: 4, rose: 1, purple: 3, black: 2 });
      let r = Math.random() * Object.values(w).reduce((a, b) => a + b, 0);
      for (const [k, v] of Object.entries(w)) if ((r -= v) <= 0 && TONES[k]) return k;
      return 'pink';
    }

    function heartEl({ size = 24, ring = Math.random() < 0.4, tone = heartTone() } = {}) {
      const t = TONES[tone] ?? TONES.pink;
      const n = el('div', 'fx-h');
      n.style.width = `${size}px`;
      n.style.height = `${size}px`;
      const glow = I.perf().glow;
      if (glow !== 'none') n.style.filter = `drop-shadow(0 0 ${Math.max(glow === 'light' ? 2 : 3, Math.round(size / (glow === 'light' ? 8 : 5)))}px ${t.glow})`;
      const edge = (w) => (t.edge ? `<path d="${HEART_D}" fill="none" stroke="${t.edge}" stroke-width="${w}"/>` : '');
      const body = ring
        ? `<path d="${HEART_D}" fill="none" stroke="${t.fill}" stroke-width="9" stroke-linejoin="round"/>${edge(2.5)}`
        : `<path d="${HEART_D}" fill="${t.fill}"/>${t.edge ? edge(3.5) : '<ellipse cx="31" cy="30" rx="11" ry="6" transform="rotate(-35 31 30)" fill="#fff" opacity=".5"/>'}`;
      n.innerHTML = `<svg viewBox="-8 -8 116 112">${body}</svg>`;
      return n;
    }

    /** 一把心从 (x, y) 撒出去：spread 半径、rise 往上飘多少、dir 横向偏向（-1 左 / 1 右 / 0 四散） */
    function heartSpray(x, y, { count = 8, spread = 90, rise = 60, dir = 0, size = [12, 28], duration = [900, 1500], delay = 0, tones } = {}) {
      if (reduce.matches) return;
      count = Math.max(1, Math.round(count * I.perf().particles));
      for (let i = 0; i < count; i++) {
        const h = heartEl({ size: rand(size[0], size[1]), ...(tones ? { tone: choice(tones) } : {}) });
        place(h, x, y);
        const a = dir ? (dir > 0 ? rand(-0.9, 0.5) : Math.PI + rand(-0.5, 0.9)) : rand(0, Math.PI * 2);
        const d = rand(spread * 0.4, spread);
        const dx = Math.cos(a) * d;
        const dy = Math.sin(a) * d * 0.6 - rand(rise * 0.5, rise);
        run(
          h,
          [
            { transform: `translate(-50%, -50%) scale(0.2) rotate(${rand(-30, 30)}deg)`, opacity: 0 },
            { transform: `translate(calc(-50% + ${dx * 0.4}px), calc(-50% + ${dy * 0.3}px)) scale(1)`, opacity: 1, offset: 0.25 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.8) rotate(${rand(-20, 20)}deg)`, opacity: 0 },
          ],
          { duration: rand(duration[0], duration[1]), delay: delay + i * rand(20, 60), easing: 'cubic-bezier(.2,.7,.3,1)' },
        );
      }
    }

    /** 心形环从 (x, y) 扩散 */
    function heartRing(x, y, { size = 60, to = 3, delay = 0, duration = 900, tone } = {}) {
      if (reduce.matches) return;
      const h = heartEl({ size, ring: true, tone: tone ?? heartTone() });
      place(h, x, y);
      run(
        h,
        [
          { transform: 'translate(-50%, -50%) scale(0.3)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.8)', opacity: 0.95, offset: 0.2 },
          { transform: `translate(-50%, -50%) scale(${to})`, opacity: 0 },
        ],
        { duration, delay, easing: 'cubic-bezier(.2,.6,.3,1)' },
      );
    }

    // ---------- 魅了层 ----------

    const CH = { level: 0, boost: 0, override: null, hearts: [], beat: 0, visionAt: 0 };
    // 分岔题（fork 事件）：k 往奖励走了多少、pass 往通过走了多少、pink 画面染粉的程度（魅了底色也跟着涨）
    const FK = { k: 0, last: 0, side: null, pass: 0, pink: 0, active: false, fired: new Set(), talkAt: 0, talkN: 0, phantomAt: 0, el: null, wake: 0, wakeEl: null, gazeEl: null, ghosts: [] };

    function charmTarget() {
      const c = cfg().charm ?? {};
      if (c.enabled === false) return 0;
      const baseBy = c.base ?? { early: 0.05, mid: 0.2, late: 0.4, endless: 0.5 };
      let base = 0;
      // 战斗各段的底色在演出表（这一组的 stage.<段>.charm），没写才用 fx.charm.base
      const cellCharm = (name) => I.stageCell(name).charm ?? baseBy[name];
      if (S.screen === 'hold' || S.screen === 'pass') base = cellCharm(S.phase) ?? 0;
      else if (S.screen === 'endless') base = cellCharm('endless') ?? 0.5;
      else if (S.screen === 'prep') base = (cellCharm(S.phase) ?? 0) * 0.5;
      else if (S.screen === 'pause') base = baseBy.pause ?? 0.15;
      else if (S.screen === 'execute' || S.screen === 'executed') base = 1;
      return Math.min(1, base + CH.boost + FK.pink * 0.6);
    }

    function charmBoost(amount) {
      CH.boost = Math.min(0.8, CH.boost + amount);
    }

    /** 立绘原图（幻象、特写都用它）：先用战斗画面上那张，没有就载 battleStandee */
    let standeeImg = null;
    function standee() {
      const live = MV.img;
      if (live?.naturalWidth) return live;
      const src = Q().art?.battleStandee?.src;
      if (!src) return null;
      if (!standeeImg) {
        standeeImg = new Image();
        standeeImg.src = src;
      }
      return standeeImg.naturalWidth ? standeeImg : null;
    }

    /**
     * 幻象：魅了够深时，时不时把她身上的一块（胸 / 嘴 / 眼）放大到占满大半屏，半透明地浮现、慢慢推近、再淡掉。
     * 参数在 fx.charm.visions
     */
    function vision(lv) {
      if (!I.perf().visions) return;
      const v = (cfg().charm ?? {}).visions ?? {};
      const img = standee();
      if (!img) return;
      const from = v.from ?? 0.3;
      const k = Math.min(1, Math.max(0, (lv - from) / Math.max(0.01, 1 - from)));
      const part = choice(v.parts ?? ['chest', 'lips', 'eyes']);
      const [ix, iy] = anchorImagePoint(part, img);
      const r = appRect();
      const showW = (v.zoom ?? {})[part] ?? 520; // 屏幕宽度里露出原图多宽
      const scale = (r.width * rand(1, 1.25)) / showW;
      const cx = r.width * rand(0.3, 0.62);
      const cy = r.height * rand(0.22, 0.55);
      const box = el('div', 'charm-vision');
      const pic = el('img');
      pic.src = img.currentSrc || img.src;
      pic.alt = '';
      Object.assign(pic.style, {
        width: `${img.naturalWidth * scale}px`,
        height: `${img.naturalHeight * scale}px`,
        left: `${cx - ix * scale}px`,
        top: `${cy - iy * scale}px`,
        transformOrigin: `${ix * scale}px ${iy * scale}px`,
      });
      const mask = `radial-gradient(ellipse ${r.width * 0.55}px ${r.height * 0.3}px at ${cx}px ${cy}px, #000 0%, rgb(0 0 0 / 0.6) 45%, transparent 100%)`;
      box.style.maskImage = mask;
      box.style.webkitMaskImage = mask;
      box.append(pic);
      charm.insertBefore(box, heartsCanvas);
      const peak = (v.opacity ?? 0.3) * (0.6 + 0.4 * k);
      const dur = rand(3400, 4600);
      const dx = rand(-24, 24);
      const dy = rand(-30, 10);
      pic.animate([{ transform: 'scale(1.14)' }, { transform: `translate(${dx}px, ${dy}px) scale(1)` }], { duration: dur, easing: 'ease-out', fill: 'both' });
      const a = box.animate([{ opacity: 0 }, { opacity: peak, offset: 0.35 }, { opacity: peak * 0.8, offset: 0.7 }, { opacity: 0 }], { duration: dur, fill: 'both' });
      a.onfinish = () => box.remove();
    }

    function charmFrame(dt) {
      const c = cfg().charm ?? {};
      CH.boost = Math.max(0, CH.boost - dt * (c.decay ?? 0.08));
      const target = CH.override ?? charmTarget();
      CH.level += (target - CH.level) * Math.min(1, dt * 2.5);
      CH.beat = Math.max(0, CH.beat - dt * 3);
      const lv = CH.level;
      vignette.style.opacity = String(Math.min(1, lv * 1.1 + CH.beat * lv * 0.5));

      // 幻象：强度越高越频繁
      const v = c.visions ?? {};
      const now = performance.now() / 1000;
      const showing = ['hold', 'pass', 'endless', 'prep', 'execute', 'executed'].includes(S.screen);
      if (v.enabled === false || reduce.matches || !showing || lv < (v.from ?? 0.3)) CH.visionAt = 0;
      else if (!CH.visionAt) CH.visionAt = now + rand(1.5, 3.5);
      else if (now >= CH.visionAt) {
        const [slow, fast] = v.every ?? [9, 3.5];
        const k = Math.min(1, (lv - (v.from ?? 0.3)) / Math.max(0.01, 1 - (v.from ?? 0.3)));
        CH.visionAt = now + (slow + (fast - slow) * k) * rand(0.8, 1.25) * (S.screen === 'execute' ? 0.5 : 1);
        vision(lv);
      }

      // 心形粒子：从下面和两边往上飘；粉、玫红、紫、黑混着
      const ctx = heartsCanvas.getContext('2d');
      const dpr = I.pixelRatio();
      const w = heartsCanvas.clientWidth;
      const h = heartsCanvas.clientHeight;
      if (heartsCanvas.width !== Math.round(w * dpr)) heartsCanvas.width = Math.round(w * dpr);
      if (heartsCanvas.height !== Math.round(h * dpr)) heartsCanvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (reduce.matches || lv < 0.03) {
        CH.hearts.length = 0;
        return;
      }
      const rate = lv * (c.hearts ?? 9) * I.perf().particles;
      if (Math.random() < rate * dt) {
        const edge = Math.random();
        CH.hearts.push({
          x: edge < 0.5 ? rand(0, w) : edge < 0.75 ? rand(0, w * 0.15) : rand(w * 0.85, w),
          y: edge < 0.5 ? h + 20 : rand(h * 0.3, h),
          vy: -rand(22, 60),
          size: rand(8, 24),
          phase: rand(0, 6.28),
          sway: rand(6, 18),
          life: 0,
          max: rand(2.5, 5),
          tone: heartTone(),
          ring: Math.random() < 0.3,
        });
      }
      for (let i = CH.hearts.length - 1; i >= 0; i--) {
        const p = CH.hearts[i];
        p.life += dt;
        p.y += p.vy * dt;
        if (p.life > p.max || p.y < -30) {
          CH.hearts.splice(i, 1);
          continue;
        }
        const t = TONES[p.tone] ?? TONES.pink;
        const k = p.life / p.max;
        const alpha = Math.sin(Math.PI * k) * (p.tone === 'black' ? 0.8 : 0.6) * Math.min(1, lv * 1.6);
        const x = p.x + Math.sin(p.phase + p.life * 2) * p.sway;
        ctx.save();
        ctx.translate(x, p.y);
        ctx.rotate(Math.sin(p.phase + p.life) * 0.3);
        const s = (p.size / 100) * (1 + 0.15 * Math.sin(p.life * 6));
        ctx.scale(s, s);
        ctx.translate(-50, -50);
        ctx.globalAlpha = alpha;
        ctx.shadowColor = t.glow;
        ctx.shadowBlur = 16;
        if (p.ring) {
          ctx.lineWidth = 10;
          ctx.lineJoin = 'round';
          ctx.strokeStyle = t.fill;
          ctx.stroke(HEART_PATH);
        } else {
          ctx.fillStyle = t.fill;
          ctx.fill(HEART_PATH);
        }
        if (t.edge) {
          ctx.shadowBlur = 0;
          ctx.lineWidth = 4;
          ctx.strokeStyle = t.edge;
          ctx.stroke(HEART_PATH);
        }
        ctx.restore();
      }
    }

    // ---------- 主画面效果：闪光、残影（交给 game.6051d2b93f.js 的 drawStandee）----------

    const MAIN = { flash: 0, echo: [1, 0, 1, 0] };
    // region / spiral：催眠（006）——怀表那一层绕手摆、螺旋垫在身后或透叠在她身上（见下面「催眠」一节；别的委托两样都是空的）
    MV.mainFx = () => ({ flash: MAIN.flash, echo: MAIN.echo, region: hypnoWatch(), spiral: hypnoSpiral() ?? undefined });

    function tween(duration, onUpdate, onDone) {
      const t0 = performance.now();
      const step = (now) => {
        const k = Math.min(1, (now - t0) / duration);
        onUpdate(k);
        if (k < 1) requestAnimationFrame(step);
        else onDone?.();
      };
      requestAnimationFrame(step);
    }

    /** 残影的时间曲线：两层错开，放大、滤色叠加、淡掉。strength 越大越亮，linger 越大留得越久 */
    function echoCurve(k, { strength = 1, grow = [0.16, 0.26], linger = 1 } = {}) {
      const e1 = Math.min(1, k / 0.8);
      const e2 = Math.max(0, Math.min(1, (k - 0.2) / 0.8));
      const fade = (e) => Math.pow(1 - e, 1 + 0.6 / linger);
      return [1 + grow[0] * Math.sqrt(e1), (k > 0.01 ? 0.42 : 0) * strength * fade(e1), 1 + grow[1] * Math.sqrt(e2), (k > 0.2 ? 0.3 : 0) * strength * fade(e2)];
    }

    /** 魅惑闪光：轻闪一下、晃一下、同一张图放大半透明发散出去（两层错开），立绘本身一直看得见 */
    function allure() {
      if (reduce.matches) return;
      const a = cfg().allure ?? {};
      play('魅惑闪光');
      I.shake();
      charmBoost(0.12);
      if (MV.active) {
        tween(
          a.duration ?? 1000,
          (k) => {
            const peak = a.flash ?? 0.14;
            MAIN.flash = k < 0.08 ? (k / 0.08) * peak : Math.max(0, peak * (1 - (k - 0.08) / 0.25));
            MAIN.echo = echoCurve(k, { strength: a.echo ?? 1 });
          },
          () => {
            MAIN.flash = 0;
            MAIN.echo = [1, 0, 1, 0];
          },
        );
        return;
      }
      // 没有 WebGL（或剧情画面）：复制屏幕上那张图做残影
      const v = visibleStandee();
      if (!v) return;
      const [x, y, w, h] = v.rect;
      [0, 180].forEach((delay, i) => {
        const g = el('img', 'fx-ghost');
        g.src = v.img.currentSrc || v.img.src;
        Object.assign(g.style, { left: `${x}px`, top: `${y}px`, width: `${w}px`, height: `${h}px` });
        layer.append(g);
        const [cx, cy] = anchorImagePoint('chest', v.img);
        g.style.transformOrigin = `${(cx / v.img.naturalWidth) * 100}% ${(cy / v.img.naturalHeight) * 100}%`;
        run(g, [{ transform: 'scale(1)', opacity: i ? 0.3 : 0.42 }, { transform: `scale(${i ? 1.26 : 1.16})`, opacity: 0 }], { duration: 900, delay, easing: 'ease-out' });
      });
      const flash = el('div', 'fx-flash');
      layer.append(flash);
      run(flash, [{ opacity: 0 }, { opacity: a.flash ?? 0.14, offset: 0.15 }, { opacity: 0 }], { duration: 380 });
    }

    // ---------- 特写 cut-in（胸纵 / 胸横 / 臀 / 眼；除眼以外各有一次性和循环两种）----------

    /**
     * 特写有自己的一套摇动（CU.osc，阻尼弹簧），不借主画面的：
     *   一次性：切进来给一下冲量，晃几下停住；
     *   循环：弹簧追一个平滑来回的目标，一直往复，直到收起（到时间、调节器点收起、剧情走到下一句、换画面）。
     * 三种动法（mode）：
     *   y     胸·纵：上下，循环按呼吸的节奏、往上时同步放大（遮罩 R + 整张图跟着起伏）
     *   x     胸·横：整个身体左右摆、胸多甩出去一点，循环走两头上翘的弧线、到两边略放大
     *   twist 臀：只截臀部突出的那一半，往那一边扭——臀部区域（遮罩 2 的 R，没画就用椭圆）绕腰转一点、往外往上推，整张图稍微跟过去
     */
    const CU = {
      R: null,
      box: null,
      canvas: null,
      img: null,
      open: false,
      target: 'chest', // 取景的部位：chest / hips / eyes
      key: 'chest', // 参数：closeup.chest / chestSide / hips / eyes
      mode: 'y',
      loop: false,
      ok: null,
      echo: [1, 0, 1, 0],
      flash: 0,
      osc: { x: 0, y: 0, vx: 0, vy: 0, t: 0, dir: 0 },
      close: null, // 收起：调用它提前结束停留
      done: null, // 收起完成的 Promise
      closeOnLine: false,
      pinned: false, // 定时演出里一直停到这组结束的特写：开着的时候各段照样抽别的演出
    };
    /** 演出名 → 参数名 + 是否循环 */
    const CLOSEUPS = {
      '特写-胸': ['chest', false],
      '特写-胸-循环': ['chest', true],
      '特写-胸-横': ['chestSide', false],
      '特写-胸-横-循环': ['chestSide', true],
      '特写-臀': ['hips', false],
      '特写-臀-循环': ['hips', true],
      '特写-眼': ['eyes', false],
      // 嘴唇（008）：和眼睛一样是一张定住的近景，对着 anchors.lips；出来时亲一下（唇印 + 心）
      '特写-唇': ['lips', false],
      '特写-腿': ['legs', false],
      '特写-腿-循环': ['legs', true],
      // 怀表（006）：借晃腿那一套——遮罩 2 的 G 当成单独一层，绕 anchors.knee（链子挂在手上的那一点）摆，取景对着 anchors.legs（表）；
      // 摆角不走自己的弹簧，和主画面的怀表同一个（watchAngle：跟节奏滑块同拍）
      '特写-怀表': ['watch', false],
      '特写-怀表-循环': ['watch', true],
    };
    const KEY_PART = { chest: 'chest', chestSide: 'chest', hips: 'hips', eyes: 'eyes', lips: 'lips', legs: 'legs', watch: 'legs' };
    const KEY_MODE = { chest: 'y', chestSide: 'x', hips: 'twist', eyes: null, lips: null, legs: 'swing', watch: 'swing' };
    const CU_POOL = { chest: '特写-胸', hips: '特写-臀', eyes: '特写-眼', lips: '特写-唇', legs: '特写-腿' };
    /** 按参数名另取台词池的（部位相同、说的话不同） */
    const CU_POOL_KEY = { watch: '特写-怀表' };
    /** 静图特写（005）：演出名 → 立绘档案 fx.closeup 里的键；「特写-双格」上下两格 */
    // 凝视（006）：眼睛发光的那张脸
    const STILL_CU = { '特写-嘴': 'mouth', '特写-靴底': 'sole', '特写-凝视': 'gaze' };
    /** 每种静图特写没写的时候：框下面那行字的池、从哪边进、跟着节奏怎么动、收尾 */
    const STILL_DEF = {
      mouth: { pool: '特写-嘴', side: 'right', beat: 'lick', outro: 'kiss' },
      sole: { pool: '特写-靴底', side: 'left', beat: 'stomp' },
      gaze: { pool: '特写-凝视', side: 'left', beat: 'glow' },
    };
    const isStill = (n) => n in STILL_CU || n === '特写-双格';
    /** 占大半屏的框：胸 / 臀 / 眼特写、静图特写、视频 */
    const isBig = (n) => !!CLOSEUPS[n] || isStill(n) || n === '视频';
    /**
     * 接下来 sec 秒内有没有定时的大框（这一组的 script、超时各步的 script）要出来：有就先别随机抽大框，
     * 不然随机那个刚探出来就被定时的顶掉（站主 2026-09-23）
     */
    function bigCueSoon(sec = 2.6) {
      if (S.screen !== 'hold') return false;
      const now = S.elapsed;
      const near = (at) => at >= now - 0.05 && at <= now + sec;
      const set = I.setCfg() ?? {};
      if ((set.script ?? []).some((c) => isBig(c?.fx) && near(Number(c.at) || 0))) return true;
      if (S.over) return (S.over.cues ?? []).some((c) => !c.done && isBig(c.fx) && near(c.at));
      let t = I.target();
      for (const st of Array.isArray(set.overtime) ? set.overtime : []) {
        for (const c of Array.isArray(st?.script) ? st.script : []) if (isBig(c?.fx) && near(t + (Number(c.at) || 0))) return true;
        if (!(st?.seconds > 0) || (st.do !== 'words' && st.do !== 'hold')) break;
        t += st.seconds;
      }
      return false;
    }

    /**
     * 第一次要特写时建画框；每次要特写时确认传进去的是现在这张战斗图（委托里某几组会换图，game.js 的 syncStandee）。
     * 几个特写同时要的话等同一次初始化 / 同一次传图，不会有一个直接落空
     */
    async function closeupReady() {
      CU.ready ??= closeupInit();
      if (!(await CU.ready)) return false;
      const src = Q().art?.battleStandee?.src;
      if (!src) return false;
      if (CU.loading?.src !== src) CU.loading = { src, done: closeupImage(src) };
      return CU.loading.done;
    }
    async function closeupInit() {
      CU.ok = false;
      if (reduce.matches || !Q().art?.battleStandee?.src) return false;
      try {
        const box = el('div', 'closeup');
        box.innerHTML = '<div class="closeup-edge"></div><div class="closeup-media"><canvas></canvas></div><p class="closeup-line"><span class="sticker sticker--large"></span></p>';
        layer.after(box); // 盖在演出层下面一层，拟声词和心能压在它上面
        box.after(layer);
        box.hidden = true;
        const canvas = box.querySelector('canvas');
        const R = I.createRenderer(canvas);
        Object.assign(CU, { R, box, canvas, ok: true, maskKey: null });
      } catch (e) {
        I.emit('fx', { error: `特写初始化失败：${e.message}` });
      }
      return CU.ok;
    }
    /** 把这张图传进特写的画布（换图了才传），遮罩跟着重传 */
    async function closeupImage(src) {
      try {
        // 用 onload 不用 decode()：页面在后台时 decode() 可能一直不回来，特写就再也开不了（2026-10-18 测 007 时发现）
        const img = await new Promise((ok, no) => {
          const im = new Image();
          im.onload = () => ok(im);
          im.onerror = () => no(new Error(`读不到 ${src}`));
          im.src = src;
        });
        I.upload(CU.R.texImg, img, { premultiply: true }, CU.R.gl);
        CU.img = img;
        CU.maskKey = null;
        await closeupMasks();
        return true;
      } catch (e) {
        I.emit('fx', { error: `特写读图失败：${e.message}` });
        CU.loading = null;
        return false;
      }
    }

    /** 特写用的遮罩：本机草稿（调节器画的）优先，其次立绘档案的 mask / mask2；草稿换了、图换了就重新传 */
    async function closeupMasks() {
      const bs = Q().art?.battleStandee ?? {};
      const img = CU.img;
      if (!img) return;
      const draft = MV.draftMask && MV.draftFor && new URL(MV.draftFor, location.href).href === img.src;
      const key = draft ? `draft:${MV.draftVersion}` : `file:${img.src}`;
      if (CU.maskKey === key) return;
      CU.maskKey = key;
      const gl = CU.R.gl;
      const mask = draft ? MV.draftMask : bs.mask ? await I.loadMaskImage(bs.mask).catch(() => null) : null;
      if (mask) {
        I.upload(CU.R.texMask, mask, { premultiply: false }, gl);
        if (!MV.chest) MV.chest = I.chestCenter(mask, img.naturalWidth, img.naturalHeight);
      }
      const mask2 = draft ? MV.draftMask2 : bs.mask2 ? await I.loadMaskImage(bs.mask2).catch(() => null) : null;
      if (mask2) I.upload(CU.R.texMask2, mask2, { premultiply: false }, gl);
      CU.R.hasMask2 = !!mask2;
    }

    /**
     * 特写取景（height / offset / side / sideOffset）可以在调节器「演出」页调，存在这台设备、按立绘档案分开存；
     * 载入时盖到参数上。调好了导出发给 Claude Code 写进那份委托的 standee
     */
    const FRAME_FIELDS = ['height', 'offset', 'side', 'sideOffset'];
    const framingKey = () => `tobatsu.fx-closeup.${Q().standeeActive ?? 'default'}`;
    const closeupCfg = () => ((Q().fx ??= {}).closeup ??= {});
    function loadFraming() {
      try {
        const saved = JSON.parse(localStorage.getItem(framingKey()) || 'null');
        for (const [key, v] of Object.entries(saved ?? {})) Object.assign((closeupCfg()[key] ??= {}), v);
      } catch {}
    }
    loadFraming();
    T.on('standee', ({ first }) => {
      standeeImg = null;
      if (first) loadFraming();
    });
    function framing() {
      const out = {};
      for (const key of ['chest', 'hips', 'eyes', 'legs']) {
        const c = closeupCfg()[key] ?? {};
        out[key] = Object.fromEntries(FRAME_FIELDS.filter((f) => c[f] !== undefined).map((f) => [f, c[f]]));
      }
      return out;
    }

    /** 参数：closeup.<key>，循环时再盖上 .loop；胸·横没写取景就沿用胸的 height / offset */
    function closeupParams(key = CU.key, loop = CU.loop) {
      const all = cfg().closeup ?? {};
      let c = all[key] ?? {};
      if (key === 'chestSide') c = { height: all.chest?.height, offset: all.chest?.offset, ...c };
      return loop ? { ...c, ...(c.loop ?? {}) } : c;
    }
    // tight（定时演出写的，007 吸取中那一个）：比平时拉近这么多倍
    const closeupVisible = (c) => (c.height ?? { eyes: 190, lips: 200, hips: 560, legs: 620 }[CU.target] ?? 480) / (CU.tight || 1);
    /** 臀部突出的是哪一边：1 右（画面右边）/ -1 左 */
    const hipSide = (c) => (c.side === 'left' ? -1 : 1);
    function closeupCenter(c) {
      const [ax, ay] = anchorImagePoint(CU.target, CU.img);
      const sx = CU.target === 'hips' ? hipSide(c) * (c.sideOffset ?? 250) : 0;
      return [ax + sx + (c.offset?.[0] ?? 0), ay + (c.offset?.[1] ?? 0)];
    }

    /** 特写画框里：原图的某一点 (ix, iy) 在 app 里的屏幕坐标 */
    function closeupPoint(ix, iy) {
      const c = closeupParams();
      const mr = CU.canvas.getBoundingClientRect();
      const ar = appRect();
      const [ax, ay] = closeupCenter(c);
      const scale = mr.height / closeupVisible(c);
      return { x: mr.left - ar.left + mr.width / 2 + (ix - ax) * scale, y: mr.top - ar.top + mr.height / 2 + (iy - ay) * scale };
    }

    const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

    /**
     * 特写 cut-in。key＝chest / chestSide / hips / eyes；loop＝一直往复直到收起；
     * hold＝停几秒（不写用 common.jsonc 的；循环时 0＝一直停到被收起，最长 60 秒）
     */
    async function closeup(key = 'chest', { text, loop = false, hold, untilLine = false, pinned = false, tight = 1 } = {}) {
      if (VC.open) return;
      if (CU.open) {
        if (!CU.closing) return;
        await CU.done;
      }
      // 晃腿只有翘着腿的图有（立绘档案写了 anchors.knee，遮罩 2 的 G 画了那条小腿），别的图上跳过
      if (KEY_PART[key] === 'legs' && !Array.isArray(cfg().anchors?.knee)) return;
      if (!(await closeupReady()) || CU.open) return;
      await closeupMasks();
      const part = KEY_PART[key] ?? 'chest';
      CU.open = true;
      CU.closing = false;
      CU.pinned = pinned;
      CU.tight = Math.max(0.5, Math.min(3, Number(tight) || 1));
      if (CU.tight > 1) CU.box.dataset.tight = ''; else delete CU.box.dataset.tight;
      CU.key = key;
      CU.target = part;
      CU.mode = KEY_MODE[key];
      CU.loop = loop && part !== 'eyes' && part !== 'lips';
      const c = closeupParams(key, CU.loop);
      let finish;
      CU.done = new Promise((ok) => (finish = ok));
      MV.extraUsers = (MV.extraUsers ?? 0) + 1;
      Object.assign(CU.osc, { x: 0, y: 0, vx: 0, vy: 0, t: 0, dir: 0 });
      const box = CU.box;
      const side = part === 'eyes' || part === 'lips' || part === 'legs' ? 'left' : part === 'hips' ? (hipSide(c) > 0 ? 'right' : 'left') : 'right';
      box.dataset.part = part;
      box.dataset.side = side;
      box.hidden = false;
      SPOT.at = performance.now();
      const lineNode = box.querySelector('.closeup-line');
      I.sticker(lineNode.firstElementChild, text ?? line(CU_POOL_KEY[key] ?? CU_POOL[part]));
      const from = side === 'right' ? 'translateX(110%)' : 'translateX(-110%)';
      box.animate([{ transform: from }, { transform: 'translateX(0)' }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      lineNode.animate([{ opacity: 0, transform: 'skewX(-14deg)' }, { opacity: 1, transform: 'skewX(0)' }], { duration: 200, delay: 180, fill: 'both' });
      const ar = appRect();
      if (part === 'eyes') {
        play('魅惑闪光');
        const [cx, cy] = closeupCenter(c);
        CU.echoC = [cx, cy];
        tween(
          (c.echoSeconds ?? 2.2) * 1000,
          (k) => {
            CU.flash = k < 0.05 ? (k / 0.05) * 0.12 : Math.max(0, 0.12 * (1 - (k - 0.05) / 0.2));
            CU.echo = echoCurve(k, { strength: 1.15, grow: [0.3, 0.5], linger: 2.5 });
          },
          () => (CU.echo = [1, 0, 1, 0]),
        );
        // 两只眼睛各扩散心形环，再从眼睛往外撒心
        setTimeout(() => {
          const spread = c.eyeSpread ?? 95;
          for (const dx of [-spread, spread]) {
            const p = closeupPoint(cx + dx, cy);
            heartRing(p.x, p.y, { size: 34, to: 3.2, duration: 1000 });
            heartRing(p.x, p.y, { size: 34, to: 2.4, duration: 1000, delay: 260 });
            heartSpray(p.x, p.y, { count: 6, spread: 110, rise: 40, dir: dx < 0 ? -1 : 1, size: [10, 26], delay: 120 });
          }
        }, 240);
      } else if (part === 'lips') {
        // 嘴唇：亲一下——唇印印在画框里、从嘴唇撒心
        play('接触');
        const [cx, cy] = closeupCenter(c);
        setTimeout(() => {
          const p = closeupPoint(cx, cy);
          heartSpray(p.x, p.y, { count: 7, spread: 120, rise: 50, size: [10, 24], delay: 80 });
        }, 280);
      } else if (part === 'legs') {
        // 晃腿：不出声、不给冲量，closeupStep 从静止慢慢晃起来
      } else {
        play(part === 'hips' ? '特写臀' : '特写摇');
        // 冲量：一次性默认有；循环默认没有（平滑地开始）
        const own = (cfg().closeup ?? {})[key] ?? {};
        const v = CU.loop ? (own.loop?.impulse ?? 0) : (own.impulse ?? 600);
        if (v) {
          setTimeout(() => {
            if (CU.mode === 'y') CU.osc.vy -= v;
            else if (CU.mode === 'x') CU.osc.vx += v * (Math.random() < 0.5 ? -1 : 1);
            else CU.osc.vx += v;
          }, 200);
        }
        setTimeout(() => {
          const b = box.getBoundingClientRect();
          const fx = side === 'right' ? 0.3 : 0.68;
          ono({ pool: part === 'hips' ? '拟声-臀' : '拟声-摇', big: true, point: { x: b.left - ar.left + b.width * fx, y: b.top - ar.top + b.height * 0.28 } });
        }, 420);
      }
      // 停留：一次性按 hold；循环按 hold（0＝等收起）；剧情里的循环停到下一句
      const wait = hold ?? (CU.loop ? (c.hold ?? 6) : (c.hold ?? (part === 'legs' ? 3.2 : 1.6)));
      const closed = new Promise((ok) => (CU.close = ok));
      CU.closeOnLine = CU.loop && untilLine;
      await Promise.race([closed, sleep(260 + (CU.loop && !wait ? 60 : wait) * 1000)]);
      CU.close = null;
      CU.closeOnLine = false;
      CU.pinned = false;
      CU.closing = true;
      box.animate([{ transform: 'translateX(0)' }, { transform: from }], { duration: 220, easing: 'ease-in', fill: 'both' });
      await sleep(230);
      box.hidden = true;
      CU.echo = [1, 0, 1, 0];
      CU.flash = 0;
      MV.extraUsers = Math.max(0, (MV.extraUsers ?? 1) - 1);
      CU.open = false;
      CU.closing = false;
      finish();
    }

    /** 收起正在停留的特写（循环的就停在这里） */
    const closeupClose = () => CU.close?.();
    I.closeupOpen = () => !!(CU.open && !CU.closing);
    /** 开着的特写画框的中心（app 坐标）：007 第 2 组的拖动题从卡拖到这里；没开、正在进出、不是胸就是 null */
    I.closeupAim = () => {
      if (!CU.open || CU.closing || !CU.canvas || CU.target !== 'chest' || performance.now() - SPOT.at < 320) return null;
      const mr = CU.canvas.getBoundingClientRect();
      const ar = appRect();
      return { x: mr.left - ar.left + mr.width / 2, y: mr.top - ar.top + mr.height * 0.5 };
    };

    /**
     * 特写自己的弹簧：一次性追 0；循环追一个平滑来回的目标（见 CU 上面的三种 mode）。
     * turnKick（默认 0）＞0 时，每到尽头顺着原方向补一点冲量、多甩出去一下。返回位移（原图像素）和放大倍数
     */
    function closeupStep(dt, c) {
      const o = CU.osc;
      o.t += dt;
      const mode = CU.mode;
      let tx = 0;
      let ty = 0;
      let zoom = 1;
      if (CU.loop || mode === 'swing') {
        const ph = o.t * Math.PI * 2 * (c.freq ?? { y: 0.27, x: 0.45, twist: 0.5, swing: 1.1 }[mode]);
        const s = Math.sin(ph);
        const amp = c.amp ?? 30;
        if (mode === 'y') {
          ty = -amp * s; // 负＝往上：吸气
          zoom = 1 + (c.zoom ?? 0.035) * s;
        } else if (mode === 'swing') {
          // 晃腿一次性的也一直晃（停 hold 秒）：半秒多慢慢晃起来；加一点倍频，脚尖往上踢的那一下快一点，不像钟摆
          const ramp = Math.min(1, o.t / 0.6);
          tx = amp * ramp * (s + (c.kick ?? 0.3) * Math.sin(2 * ph + 0.8));
        } else if (mode === 'x') {
          tx = amp * s;
          ty = -amp * (c.lift ?? 0.35) * s * s;
          zoom = 1 + (c.zoom ?? 0.04) * s * s;
        } else {
          const out = (1 - Math.cos(ph)) / 2; // 0 → 1 → 0：扭出去再回来
          tx = amp * out;
          zoom = 1 + (c.zoom ?? 0.03) * out;
        }
        const dir = Math.sign(Math.cos(ph));
        if ((c.turnKick ?? 0) > 0 && o.dir && dir && dir !== o.dir) {
          const kick = c.turnKick * o.dir;
          if (mode === 'y') o.vy -= kick;
          else o.vx += kick;
        }
        o.dir = dir;
      }
      const k = c.stiffness ?? 90;
      const damp = c.damping ?? 7;
      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        o.vx += (k * (tx - o.x) - damp * o.vx) * h;
        o.vy += (k * (ty - o.y) - damp * o.vy) * h;
        o.x += o.vx * h;
        o.y += o.vy * h;
      }
      const max = c.maxOffset ?? 70;
      return { x: max * Math.tanh(o.x / max), y: max * Math.tanh(o.y / max), zoom };
    }

    function closeupFrame(dt) {
      if (!CU.open || !CU.R) return;
      // 调节器里正在画遮罩：草稿一换，特写也跟着用新的
      if (CU.draftVersion !== MV.draftVersion) {
        CU.draftVersion = MV.draftVersion;
        closeupMasks();
      }
      const img = CU.img;
      const c = closeupParams();
      const w = CU.canvas.clientWidth;
      const h = CU.canvas.clientHeight;
      const [cx, cy] = closeupCenter(c);
      let scale = h / closeupVisible(c);
      const base = MV.pose ?? { showX: 0, showY: 0, breathS: 0, hair: 0, upper: 0 };
      const fx = { upperScale: 0, flash: CU.flash, echo: CU.echo, echoC: CU.echoC ?? [cx, cy] };
      let dx = 0;
      let dy = 0;
      if (CU.target === 'eyes' || CU.target === 'lips') {
        fx.pose = { ...base, upper: 0 };
      } else {
        const m = closeupStep(Math.min(0.05, Math.max(0, dt)), c);
        CU.zoom = m.zoom;
        scale *= m.zoom;
        fx.echoC = [cx, cy];
        if (CU.mode === 'y') {
          // 胸·纵：胸（遮罩 R）上下，整张图跟着起伏
          const follow = c.follow ?? 0.7;
          const jiggle = c.jiggle ?? 1;
          fx.pose = { ...base, showX: m.x * jiggle, showY: m.y * jiggle, upper: 0 };
          dx = m.x * follow * 0.5 * scale;
          dy = m.y * follow * scale;
        } else if (CU.mode === 'swing') {
          // 晃腿：翘起来的那条小腿（遮罩 2 的 G）当成单独一层，绕膝盖（anchors.knee）来回转，别的地方不动；没有遮罩 2 时退回按 radius 的椭圆位移
          const knee = cfg().anchors?.knee ?? [cx, cy];
          fx.pose = { ...base, showX: 0, showY: 0, upper: 0 };
          fx.region = { c: knee, r: c.radius ?? [320, 380], shake: [0, 0], rot: CU.key === 'watch' ? (cfg().watch ? watchRest(cfg().watch) : 0) + watchAngle() * (c.gain ?? 1) : m.x * (c.turn ?? 0.0016), pivot: knee, ch: [0, 1, 0], layer: true };
        } else if (CU.mode === 'x') {
          // 胸·横：整个身体左右摆（follow），胸再多甩出去一点（jiggle）
          const follow = c.follow ?? 0.8;
          const jiggle = c.jiggle ?? 0.35;
          fx.pose = { ...base, showX: m.x * jiggle, showY: m.y * jiggle * 0.5, upper: 0 };
          dx = m.x * follow * scale;
          dy = m.y * follow * scale;
        } else {
          // 臀：身体先动——整张图绕脚往那一边转（bodyTwist），腰线以上反着转回来一点（torsoCounter），胯送出去、上半身收回来；
          // 臀部区域在这之上再绕腰多扭一点（twist）、往外往上推一点（jiggle / lift）；整张图的平移只留一点点（follow）
          const sd = hipSide(c);
          const [hx, hy] = anchorImagePoint('hips', img);
          const anchors = cfg().anchors ?? {};
          const waist = Array.isArray(anchors.waist) ? anchors.waist : [hx, hy - 280];
          const feet = Array.isArray(anchors.feet) ? anchors.feet : [hx, img.naturalHeight * 0.97];
          const bodyRot = sd * m.x * (c.bodyTwist ?? 0.001);
          const jiggle = c.jiggle ?? 0.2;
          fx.pose = { ...base, showX: 0, showY: 0, upper: 0 };
          fx.body = { rot: bodyRot, pivot: feet, torsoRot: -bodyRot * (c.torsoCounter ?? 1.6), torsoPivot: waist };
          fx.region = {
            c: [hx, hy],
            r: c.radius ?? [470, 300],
            shake: [sd * m.x * jiggle, -m.x * jiggle * (c.lift ?? 0.4)],
            rot: -sd * m.x * (c.twist ?? 0.0012),
            pivot: waist,
          };
          const follow = c.follow ?? 0.1;
          dx = sd * m.x * follow * scale;
          dy = -m.x * follow * 0.3 * scale;
        }
      }
      I.drawStandee(CU.R, img, [w / 2 - cx * scale + dx, h / 2 - cy * scale + dy, img.naturalWidth * scale, img.naturalHeight * scale], fx);
    }

    // ---------- 吸取中的重影（007）----------

    /**
     * 等级正在被吸的时候（逗留里扣级的那一段、交易答应 / 接受榨取的那一阵、夺卡的猛吸）：
     * 站主 2026-10-18「还是一样的循环乳摇，但是用低一点的不透明度放在全屏，有一个重影一样」——
     * 她的胸一直在循环晃，铺满全屏、滤色叠在画面上、偏紫，比主画面大一圈、慢慢往前顶；每吸走一级亮一下、往前一冲。
     * 四周一圈紫色暗角跟着一起亮（.drain-veil）。自己一块画布（另一个 WebGL，按一半分辨率画——糊一点正好像重影）；
     * 性能档关了幻象（perf.visions）时只留暗角；减少动态时都不出
     */
    const DG = { on: false, hold: false, until: 0, pulse: 0, t: 0, alpha: 0, src: null };
    async function ghostReady() {
      DG.ready ??= (async () => {
        try {
          const box = el('div', 'drain-ghost');
          box.innerHTML = '<canvas></canvas>';
          const veil = el('div', 'drain-veil');
          box.hidden = veil.hidden = true;
          // 压在魅了层上面一点、HUD 和特写框下面
          const charm = app.querySelector('.charm');
          if (charm) charm.after(box, veil);
          else app.append(box, veil);
          DG.R = I.createRenderer(box.querySelector('canvas'));
          Object.assign(DG, { box, veil, canvas: box.querySelector('canvas') });
          return true;
        } catch (e) {
          I.emit('fx', { error: `重影初始化失败：${e.message}` });
          return false;
        }
      })();
      if (!(await DG.ready)) return false;
      const bs = Q().art?.battleStandee ?? {};
      if (!bs.src) return false;
      if (DG.src !== bs.src) {
        DG.src = bs.src;
        DG.img = null;
        DG.loading = (async () => {
          // 用 onload 不用 decode()：页面在后台时 decode() 可能一直不回来
          const img = await new Promise((ok, no) => {
            const im = new Image();
            im.onload = () => ok(im);
            im.onerror = no;
            im.src = bs.src;
          });
          const gl = DG.R.gl;
          I.upload(DG.R.texImg, img, { premultiply: true }, gl);
          const mask = bs.mask ? await I.loadMaskImage(bs.mask).catch(() => null) : null;
          if (mask) I.upload(DG.R.texMask, mask, { premultiply: false }, gl);
          const mask2 = bs.mask2 ? await I.loadMaskImage(bs.mask2).catch(() => null) : null;
          if (mask2) I.upload(DG.R.texMask2, mask2, { premultiply: false }, gl);
          DG.R.hasMask2 = !!mask2;
          DG.chest = mask ? I.chestCenter(mask, img.naturalWidth, img.naturalHeight) : null;
          DG.img = img;
          return true;
        })().catch(() => {
          DG.src = null;
          return false;
        });
      }
      return DG.loading;
    }
    /** seconds：亮这么久（交易、陷阱、猛吸）；hold：一直亮到 ghostOff（逗留扣级那一段） */
    function ghostOn({ seconds = 0, hold = false } = {}) {
      if (reduce.matches || !I.inBattle()) return;
      if (hold) DG.hold = true;
      if (seconds > 0) DG.until = Math.max(DG.until, performance.now() + seconds * 1000);
      if (!DG.on) {
        DG.on = true;
        DG.t = 0;
      }
      ghostReady();
    }
    function ghostOff() {
      DG.hold = false;
      DG.until = 0;
    }
    /** 吸走一级：亮一下、往前一冲 */
    function ghostPulse() {
      if (DG.on) DG.pulse = 1;
    }
    function ghostFrame(dt) {
      if (!DG.on) return;
      const want = (DG.hold || performance.now() < DG.until) && I.inBattle();
      DG.alpha += ((want ? 1 : 0) - DG.alpha) * Math.min(1, dt * (want ? 2.5 : 3.5));
      DG.pulse = Math.max(0, DG.pulse - dt * 1.8);
      const { box, veil } = DG;
      if (!box) return;
      if (!want && DG.alpha < 0.01) {
        DG.on = false;
        DG.alpha = 0;
        box.hidden = veil.hidden = true;
        return;
      }
      const ghost = !!(DG.img && I.perf().visions);
      box.hidden = !ghost;
      veil.hidden = false;
      veil.style.opacity = (DG.alpha * (0.5 + 0.5 * DG.pulse)).toFixed(3);
      if (!ghost) return;
      box.style.opacity = (DG.alpha * (0.24 + 0.3 * DG.pulse)).toFixed(3);
      DG.t += dt;
      const img = DG.img;
      const W = DG.canvas.clientWidth;
      const H = DG.canvas.clientHeight;
      const chest = DG.chest ?? MV.chest ?? [img.naturalWidth / 2, img.naturalHeight / 3];
      // 比特写看得宽一点（特写取景的 1.5 倍高），一直慢慢往前顶；循环乳摇＝胸上下往复 + 一点倍频，吸走一级那一下摇得更大、整张往前一冲
      const visible = (cfg().closeup?.chest?.height ?? 420) * 1.5;
      const ph = DG.t * Math.PI * 2 * 0.62;
      const s = Math.sin(ph);
      const amp = 14 + 12 * DG.pulse;
      const showY = -amp * s - 5 * Math.sin(2 * ph + 0.6);
      const zoom = 1 + 0.03 * s + 0.1 * DG.pulse + 0.05 * Math.min(1, DG.t / 8);
      const scale = (H / visible) * zoom;
      const base = MV.pose ?? { showX: 0, showY: 0, breathS: 0, hair: 0, upper: 0 };
      I.drawStandee(DG.R, img, [W / 2 - chest[0] * scale, H * 0.46 - chest[1] * scale + showY * 0.5 * scale, img.naturalWidth * scale, img.naturalHeight * scale], {
        pose: { ...base, showX: 0, showY, upper: 0 },
        upperScale: 0,
      });
    }
    // 逗留：开始扣级一直亮到走掉 / 输掉；每扣一级亮一下。卡（card.js）：被榨取那一阵、猛吸那一阵亮着，每掉一级亮一下
    T.on('stay', ({ state }) => {
      if (state === 'drain' || (state === 'start' && app.dataset.stay === 'drain')) ghostOn({ hold: true });
      else if (state === 'pass') ghostOff();
    });
    T.on('clock', ({ kind }) => kind === 'stay' && ghostPulse());
    T.on('card', ({ state, levels, seconds }) => {
      if (state === 'squeeze') ghostOn({ seconds: (Number(levels) || 1) * 0.3 + 2.2 });
      else if (state === 'burst') ghostOn({ seconds: (Number(seconds) || 2) + 1 });
      else if (state === 'drain') ghostPulse();
    });
    T.on('screen', ({ screen }) => screen !== 'hold' && ghostOff());
    I.drainGhost = (seconds) => ghostOn({ seconds: Number(seconds) || 3 });

    // ---------- 心章 / 唇印 / 集中线 / 命令 / 吐息 ----------

    /**
     * 心章：她身上浮现一枚心形纹章，笔画是一条条会扭转的光带（彩带）。
     * 站主（2026-09-17）：原来那版有描边、外圈法阵，像带框的徽章，怪；要纯粹像彩带。
     * 所以现在没有轮廓色、没有法阵、没有宝石：每一笔宽度沿全长起伏（窄的地方＝带子翻过去），一道细亮线贴着带子的一边走、每翻一次换边；
     * 颜色沿笔画从浅粉到玫红到紫，底下垫一层同样颜色的模糊光。中间一团软的心形光。
     * 从中心往外一条条飘出来 → 亮两下 → 扩散心形环 → 淡掉。贴在 fx.anchors.crest（下腹），被挡住时贴胸口
     */
    const CREST = { w: 300, h: 230, cx: 150 };

    /** 三次贝塞尔 → 点列 */
    function bez(p0, p1, p2, p3, n = 26) {
      const pts = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const c = 3 * u * t * t;
        const d = t * t * t;
        pts.push([a * p0[0] + b * p1[0] + c * p2[0] + d * p3[0], a * p0[1] + b * p1[1] + c * p2[1] + d * p3[1]]);
      }
      return pts;
    }

    /** 往里收的螺线：从 (x0, y0) 绕 (cx, cy) 转 turns 圈，半径缩到 shrink 倍；dir 1 顺时针（屏幕坐标） */
    function spiral(x0, y0, cx, cy, turns, dir = 1, shrink = 0.2, n = 26) {
      const r0 = Math.hypot(x0 - cx, y0 - cy);
      const a0 = Math.atan2(y0 - cy, x0 - cx);
      return Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n;
        const a = a0 + dir * turns * Math.PI * 2 * t;
        const r = r0 * Math.pow(shrink, t);
        return [cx + Math.cos(a) * r, cy + Math.sin(a) * r];
      });
    }

    /**
     * 点列 → 一条扭转的光带：band 带子本体、sheen 贴着一边走的亮线。
     * 宽度＝两头尖的包络（同 taper）×（0.2 + 0.8 × |cos|），twists 全长翻几次、phase 从哪翻起
     */
    function ribbon(pts, width, { peak = 0.35, start = 0, end = 0, twists = 1.5, phase = 0.5 } = {}) {
      const L = [];
      const R = [];
      const SL = [];
      const SR = [];
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        const [px, py] = pts[Math.max(0, i - 1)];
        const [qx, qy] = pts[Math.min(n - 1, i + 1)];
        let tx = qx - px;
        let ty = qy - py;
        const len = Math.hypot(tx, ty) || 1;
        tx /= len;
        ty /= len;
        const rise = t < peak ? Math.sin((t / peak) * Math.PI * 0.5) : Math.cos(((t - peak) / (1 - peak)) * Math.PI * 0.5);
        const floor = t < peak ? start : end;
        const env = (width / 2) * (floor + (1 - floor) * Math.pow(Math.max(0, rise), 0.8));
        const c = Math.cos(t * Math.PI * twists + phase);
        const w = env * (0.2 + 0.8 * Math.abs(c));
        const side = c >= 0 ? 1 : -1;
        const [x, y] = pts[i];
        const nx = -ty;
        const ny = tx;
        L.push([x + nx * w, y + ny * w]);
        R.push([x - nx * w, y - ny * w]);
        // 亮线：在带子靠 side 那一边、宽度的 25%–60% 之间
        SL.push([x + nx * w * side * 0.6, y + ny * w * side * 0.6]);
        SR.push([x + nx * w * side * 0.25, y + ny * w * side * 0.25]);
      }
      const f = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
      const shape = (a, b) => `M${a.map(f).join('L')}L${b.reverse().map(f).join('L')}Z`;
      return { band: shape(L, R), sheen: shape(SL, SR) };
    }

    const mirrorPts = (pts) => pts.map(([x, y]) => [CREST.w - x, y]);

    /** 纹章的笔画表（左半边，右半边镜像）：[点列, 宽度, taper 选项]；step＝第几拍描出来（从心往外） */
    function crestStrokes() {
      const cat = (...parts) => parts.reduce((a, b) => a.concat(b.slice(1)));
      const left = [
        // 心框：凹口 → 左瓣 → 下尖
        [cat(bez([150, 80], [132, 56], [100, 64], [104, 94]), bez([104, 94], [108, 112], [134, 122], [150, 136])), 6, { peak: 0.4, step: 0 }],
        // 凹口上方的两个小卷
        [cat(bez([146, 66], [132, 58], [124, 42], [134, 32]), spiral(134, 32, 140, 36, 0.7, 1, 0.35, 12)), 3.8, { peak: 0.3, end: 0.2, step: 1 }],
        // 子宫状的臂：从心的肩膀往外上方弯出去，末端往里卷
        [cat(bez([126, 84], [102, 58], [66, 52], [50, 78]), spiral(50, 78, 64, 88, 0.95, -1, 0.22)), 8, { peak: 0.3, end: 0.12, step: 2 }],
        // 长翼：从心的腰往外甩出去，尖端上挑
        [bez([112, 106], [80, 124], [36, 112], [8, 78]), 6.5, { peak: 0.28, step: 3 }],
        // 臂上的两根刺
        [bez([92, 62], [90, 50], [84, 40], [74, 32]), 4.5, { peak: 0.2, step: 4 }],
        [bez([70, 58], [60, 50], [48, 48], [36, 46]), 3.5, { peak: 0.2, step: 4 }],
        // 下翼：更细，末端小卷
        [cat(bez([124, 120], [96, 146], [56, 150], [34, 136]), spiral(34, 136, 40, 128, 0.8, 1, 0.3, 14)), 4.5, { peak: 0.3, end: 0.15, step: 4 }],
        // 下方的须
        [cat(bez([140, 132], [126, 152], [118, 172], [128, 188]), spiral(128, 188, 136, 184, 0.7, -1, 0.35, 12)), 4, { peak: 0.25, end: 0.2, step: 5 }],
      ];
      const center = [
        // 顶上的尖
        [bez([150, 70], [150, 54], [150, 40], [150, 20]), 4, { peak: 0.2, step: 1 }],
        // 垂饰
        [bez([150, 134], [150, 160], [150, 180], [150, 202]), 5, { peak: 0.2, step: 5 }],
      ];
      return [...left.flatMap(([p, w, o]) => [[p, w, o], [mirrorPts(p), w, o]]), ...center];
    }

    /**
     * 纹章的 SVG（彩带版）。「画出来」靠遮罩：每一笔配一条沿中线走的粗线当遮罩，动画把遮罩线从头描到尾，带子就跟着飘出来。
     * 每一笔自己一道渐变（从笔画起点到终点：浅粉 → 玫红 → 紫）；底下一层同样的带子整组模糊当光晕（不另加轮廓色）。
     * uid 让同时出现的两枚纹章各用各的遮罩、渐变和滤镜
     */
    let crestGeo = null;
    function crestSvg(uid) {
      if (!crestGeo) {
        crestGeo = crestStrokes().map(([p, w, o], i) => ({
          ...ribbon(p, w * 1.25, { ...o, twists: 1 + (i % 3) * 0.5, phase: 0.3 + i * 0.7 }),
          line: `M${p.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join('L')}`,
          from: p[0],
          to: p.at(-1),
          w,
          step: o.step ?? 0,
        }));
      }
      const id = (name) => `${name}-${uid}`;
      const glow = I.perf().glow !== 'none';
      const masks = crestGeo
        .map(
          (s, i) =>
            `<mask id="${id(`cm${i}`)}" maskUnits="userSpaceOnUse" x="-30" y="-30" width="360" height="290"><path d="${s.line}" fill="none" stroke="#fff" stroke-width="${s.w * 1.25 + 12}" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1 1" stroke-dashoffset="1" data-step="${s.step}"/></mask>`,
        )
        .join('');
      const grads = crestGeo
        .map(
          (s, i) =>
            `<linearGradient id="${id(`cg${i}`)}" gradientUnits="userSpaceOnUse" x1="${s.from[0].toFixed(1)}" y1="${s.from[1].toFixed(1)}" x2="${s.to[0].toFixed(1)}" y2="${s.to[1].toFixed(1)}"><stop offset="0" stop-color="#ffd9ee"/><stop offset=".45" stop-color="#ff5aae"/><stop offset="1" stop-color="#b458ff"/></linearGradient>`,
        )
        .join('');
      const bands = crestGeo.map((s, i) => `<g mask="url(#${id(`cm${i}`)})"><path d="${s.band}" fill="url(#${id(`cg${i}`)})"/></g>`).join('');
      const sheens = crestGeo.map((s, i) => `<g mask="url(#${id(`cm${i}`)})"><path class="crest-sheen" d="${s.sheen}"/></g>`).join('');
      const heart = `M150 124 C132 114 118 103 118 89 C118 79 125 72 134 72 C141 72 147 76 150 82 C153 76 159 72 166 72 C175 72 182 79 182 89 C182 103 168 114 150 124 Z`;
      const star = (x, y, s) => `<path class="crest-star" d="M${x} ${y - s} Q${x} ${y} ${x + s} ${y} Q${x} ${y} ${x} ${y + s} Q${x} ${y} ${x - s} ${y} Q${x} ${y} ${x} ${y - s}Z"/>`;
      return `<svg viewBox="0 0 ${CREST.w} ${CREST.h}" overflow="visible">
        <defs>
          ${grads}
          <radialGradient id="${id('heart')}" cx="50%" cy="45%" r="60%">
            <stop offset="0" stop-color="#fff4fa" stop-opacity=".95"/><stop offset=".45" stop-color="#ff8cc6" stop-opacity=".7"/><stop offset="1" stop-color="#ff3d9e" stop-opacity="0"/>
          </radialGradient>
          <filter id="${id('halo')}" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="7"/></filter>
          <filter id="${id('soft')}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter>
          ${masks}
        </defs>
        ${glow ? `<g class="crest-halo" filter="url(#${id('halo')})">${bands}</g>` : ''}
        <path class="crest-heart" d="${heart}" fill="url(#${id('heart')})"${glow ? ` filter="url(#${id('soft')})"` : ''}/>
        <g class="crest-body">${bands}${sheens}</g>
        ${star(150, 14, 7)}${star(40, 96, 5)}${star(260, 96, 5)}${star(150, 214, 5)}
      </svg>`;
    }

    let crestCount = 0;
    function heartStamp() {
      play('心章');
      charmBoost(0.1);
      const r = appRect();
      // 下腹被秒数、台词条、剧情对话框挡住（画面下 40%）就改贴胸口
      let p = anchor('crest');
      if (p.y > r.height * 0.6 || p.y < 60) p = anchor('chest');
      const x = clampX(p.x, 120);
      const y = clampY(p.y, 110);
      const node = el('div', 'fx-crest');
      node.innerHTML = crestSvg(++crestCount);
      const size = cfg().crestSize ?? 230;
      node.style.width = `${size}px`;
      place(node, x, y);
      if (reduce.matches) {
        for (const m of node.querySelectorAll('mask path')) m.setAttribute('stroke-dashoffset', '0');
        return run(node, [], { duration: 1600 });
      }
      // 一笔一笔描出来：从心往外，一拍 150ms，每笔 520ms
      const beat = 150;
      for (const m of node.querySelectorAll('mask path')) {
        m.animate([{ strokeDashoffset: '1' }, { strokeDashoffset: '0' }], {
          duration: 520,
          delay: 80 + Number(m.dataset.step) * beat,
          easing: 'cubic-bezier(.45,0,.25,1)',
          fill: 'both',
        });
      }
      const drawn = 80 + 5 * beat + 520;
      // 中间那团心形光：先亮起来，跟着纹章一起呼吸两下
      node.querySelector('.crest-heart').animate(
        [
          { opacity: 0, transform: 'scale(0.4)' },
          { opacity: 1, transform: 'scale(1.15)', offset: 0.25 },
          { opacity: 0.8, transform: 'scale(1)', offset: 0.5 },
          { opacity: 1, transform: 'scale(1.1)', offset: 0.7 },
          { opacity: 0.85, transform: 'scale(1)' },
        ],
        { duration: 2000, delay: 200, easing: 'ease-in-out', fill: 'both' },
      );
      for (const [i, s] of [...node.querySelectorAll('.crest-star')].entries()) {
        s.animate([{ opacity: 0, transform: 'scale(0.2)' }, { opacity: 1, transform: 'scale(1.3)', offset: 0.4 }, { opacity: 0, transform: 'scale(0.4)' }], { duration: 700, delay: drawn - 300 + i * 200, fill: 'both' });
      }
      run(
        node,
        [
          { transform: 'translate(-50%, -50%)', opacity: 1, filter: 'brightness(1)', offset: 0 },
          { opacity: 1, filter: 'brightness(1)', offset: 0.36 },
          { opacity: 1, filter: 'brightness(1.6)', offset: 0.44 },
          { opacity: 0.85, filter: 'brightness(1)', offset: 0.54 },
          { opacity: 1, filter: 'brightness(1.45)', offset: 0.64 },
          { opacity: 0.9, filter: 'brightness(1)', offset: 0.82 },
          { transform: 'translate(-50%, -50%)', opacity: 0, filter: 'brightness(1)' },
        ],
        { duration: 3400, easing: 'ease-in-out' },
      );
      const hy = y - size * 0.07;
      heartRing(x, hy, { size: 46, to: 4.2, delay: drawn, duration: 1200, tone: 'rose' });
      heartRing(x, hy, { size: 46, to: 3, delay: drawn + 400, duration: 1000, tone: 'purple' });
      heartSpray(x, hy, { count: 10, spread: 140, rise: 30, delay: drawn + 60 });
      setTimeout(() => ono({ pool: '拟声-心章', point: { x: x + size * 0.42, y: y - size * 0.38 } }), drawn);
    }

    /**
     * 唇印：程序画的口红印（参考站主给的样子）——上唇两个峰、右边的峰更高、整体微微往右上斜，
     * 下唇饱满，两片之间一道中间宽两头尖的唇缝；颜色饱和、不描边，
     * 满是顺着唇纹方向的白色裂纹、边缘毛糙、外面带一点飞溅。形状（alpha）只算一次，各颜色染色后缓存
     */
    const LIP_COLORS = { 红: '#e8344e', 粉: '#ff3f9a', 紫: '#9d3cf0', 黑: '#1d0a16' };
    let lipAlphaCanvas = null;

    /** 过点的平滑闭合曲线（Catmull-Rom 转贝塞尔）；sharp 里的下标是尖角（唇角） */
    function smoothClosed(pts, sharp = []) {
      const n = pts.length;
      const P = (i) => pts[(i + n) % n];
      let d = `M${P(0)[0]} ${P(0)[1]}`;
      for (let i = 0; i < n; i++) {
        const p0 = sharp.includes(i) ? P(i) : P(i - 1);
        const p1 = P(i);
        const p2 = P(i + 1);
        const p3 = sharp.includes((i + 1) % n) ? P(i + 1) : P(i + 2);
        const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
        const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
        d += `C${c1[0].toFixed(1)} ${c1[1].toFixed(1)} ${c2[0].toFixed(1)} ${c2[1].toFixed(1)} ${p2[0]} ${p2[1]}`;
      }
      return new Path2D(`${d}Z`);
    }

    function lipAlpha() {
      if (lipAlphaCanvas) return lipAlphaCanvas;
      const W = 500;
      const H = 272;
      const pad = (pts) => pts.map(([x, y]) => [x + 10, y + 10]);
      const cv = document.createElement('canvas');
      cv.width = W;
      cv.height = H;
      const g = cv.getContext('2d');
      // 轮廓：左右对称。上唇两个圆峰、中间凹下去，唇角尖、往两边拉长；下唇比上唇薄一些；
      // 两片中间是一道中间宽两头尖的唇缝，缝的上沿中间有个小小的唇珠。上下两块在唇角那一段叠 4px，免得接缝
      const upper = smoothClosed(
        pad([[12, 160], [60, 146], [108, 112], [140, 70], [170, 34], [198, 26], [224, 40], [250, 64], [276, 40], [302, 26], [330, 34], [360, 70], [392, 112], [440, 146], [488, 160], [385, 157], [330, 133], [285, 125], [262, 129], [250, 136], [238, 129], [215, 125], [170, 133], [115, 157]]),
        [0, 14, 15, 23],
      );
      const lower = smoothClosed(
        pad([[12, 160], [115, 153], [170, 167], [215, 175], [250, 177], [285, 175], [330, 167], [385, 153], [488, 160], [440, 176], [385, 204], [320, 236], [250, 248], [180, 236], [115, 204], [60, 176]]),
        [0, 1, 7, 8],
      );
      const inside = (x, y) => g.isPointInPath(upper, x, y) || g.isPointInPath(lower, x, y);
      g.fillStyle = '#000';
      g.fill(upper);
      g.fill(lower);
      // 贴着边的点：里面是唇、往某个方向挪几像素就出去了
      const nearEdge = (x, y, d) => {
        const c = inside(x, y);
        return inside(x + d, y) !== c || inside(x - d, y) !== c || inside(x, y + d) !== c || inside(x, y - d) !== c;
      };
      // 飞溅：边外一圈小点
      for (let i = 0; i < 2600; i++) {
        const x = rand(4, W - 4);
        const y = rand(2, H - 2);
        if (inside(x, y) || !nearEdge(x, y, 9)) continue;
        if (Math.random() > 0.35) continue;
        g.beginPath();
        g.ellipse(x, y, rand(0.6, 2.4), rand(0.5, 1.4), rand(0, Math.PI), 0, Math.PI * 2);
        g.fill();
      }
      g.globalCompositeOperation = 'destination-out';
      // 一道裂纹：沿方向 ang 的细长尖梭形，边上带一点抖
      const crack = (x, y, ang, len, wid) => {
        const cx = Math.cos(ang);
        const cy = Math.sin(ang);
        const seg = 7;
        const left = [];
        const right = [];
        for (let k = 0; k <= seg; k++) {
          const t = k / seg;
          const bend = Math.sin(t * Math.PI) * len * rand(-0.06, 0.06);
          const w = wid * Math.sin(t * Math.PI) * rand(0.4, 1.3);
          const px = x + cx * len * t - cy * bend;
          const py = y + cy * len * t + cx * bend;
          left.push([px - cy * w, py + cx * w]);
          right.push([px + cy * w, py - cx * w]);
        }
        g.beginPath();
        [...left, ...right.reverse()].forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py)));
        g.fill();
      };
      for (let i = 0; i < 620; i++) {
        const x = rand(6, W - 6);
        const y = rand(4, H - 4);
        const inU = g.isPointInPath(upper, x, y);
        const inL = !inU && g.isPointInPath(lower, x, y);
        if (!inU && !inL) continue;
        // 方向：大致垂直唇缝往外（上唇朝上、下唇朝下），越靠两边越往外张，整体往右上斜一点
        // 方向：垂直唇缝往外（上唇朝上、下唇朝下），越靠唇角越往两边张开；左右对称
        const spread = ((x - 250) / 250) * 0.75;
        const ang = inU ? -Math.PI / 2 + spread + rand(-0.22, 0.22) : Math.PI / 2 - spread + rand(-0.22, 0.22);
        const len = 6 + 62 * Math.pow(Math.random(), 2.6);
        crack(x, y, ang, len, rand(0.6, 2.8));
      }
      // 颗粒和毛糙的边
      for (let i = 0; i < 4200; i++) {
        const x = rand(4, W - 4);
        const y = rand(2, H - 2);
        if (!inside(x, y)) continue;
        const edge = nearEdge(x, y, 4);
        if (!edge && Math.random() > 0.06) continue;
        g.beginPath();
        g.ellipse(x, y, rand(0.5, edge ? 3.2 : 1.6), rand(0.4, edge ? 1.8 : 1), rand(0, Math.PI), 0, Math.PI * 2);
        g.fill();
      }
      lipAlphaCanvas = cv;
      return cv;
    }

    const lipCache = new Map();
    function lipMark(color) {
      if (lipCache.has(color)) return lipCache.get(color);
      const src = lipAlpha();
      const cv = document.createElement('canvas');
      cv.width = src.width;
      cv.height = src.height;
      const g = cv.getContext('2d');
      g.drawImage(src, 0, 0);
      g.globalCompositeOperation = 'source-in';
      g.fillStyle = color;
      g.fillRect(0, 0, cv.width, cv.height);
      const url = cv.toDataURL('image/png');
      lipCache.set(color, url);
      return url;
    }

    /** 唇印；color＝指定颜色（红 / 粉 / 紫 / 黑，或者 #色值），不写就按 fx.lipColors 的权重随机 */
    function lips({ color, point } = {}) {
      play('接触');
      const p = point ?? anchor(choice(['chest', 'chest', 'face']));
      const tones = cfg().lipColors ?? { 红: 3, 粉: 3, 紫: 2, 黑: 1 };
      let roll = Math.random() * Object.values(tones).reduce((a, b) => a + b, 0);
      let tone = color || '红';
      if (!color) for (const [k, v] of Object.entries(tones)) if ((roll -= v) <= 0) {
        tone = k;
        break;
      }
      const node = el('img', 'fx-lips');
      node.src = lipMark(LIP_COLORS[tone] ?? tone);
      node.alt = '';
      if (tone === '黑') node.classList.add('fx-lips--dark');
      const x = point ? p.x : clampX(p.x + rand(-60, 60), 70);
      const y = point ? p.y : clampY(p.y + rand(-40, 40), 80);
      place(node, x, y);
      node.style.rotate = `${rand(-28, 28)}deg`;
      run(
        node,
        [
          { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.98)', opacity: 1, offset: 0.08 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0.95, offset: 0.75 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 },
        ],
        { duration: 2600, easing: 'ease-out' },
      );
      heartSpray(x, y - 10, { count: 4, spread: 60, rise: 50, size: [10, 18], delay: 120 });
      setTimeout(() => ono({ pool: '拟声-亲', point: { x: x + 64, y: y - 42 } }), 120);
    }

    /** 集中线的线：一圈往中间扎的黑三角（每五根一根粉），duration 毫秒淡出 */
    function focusRays(duration = 1300) {
      const node = el('div', 'fx-focus');
      const rays = Array.from({ length: 64 }, (_, i) => {
        const a = (i / 64) * Math.PI * 2 + rand(-0.03, 0.03);
        const r0 = rand(34, 46);
        const r1 = 80;
        const wdt = rand(0.4, 1.4);
        const x0 = 50 + Math.cos(a) * r0;
        const y0 = 50 + Math.sin(a) * r0;
        const xa = 50 + Math.cos(a - wdt / 60) * r1;
        const ya = 50 + Math.sin(a - wdt / 60) * r1;
        const xb = 50 + Math.cos(a + wdt / 60) * r1;
        const yb = 50 + Math.sin(a + wdt / 60) * r1;
        return `<polygon points="${x0.toFixed(1)},${y0.toFixed(1)} ${xa.toFixed(1)},${ya.toFixed(1)} ${xb.toFixed(1)},${yb.toFixed(1)}" fill="${i % 5 === 0 ? PINK : '#0b0b12'}"/>`;
      }).join('');
      node.innerHTML = `<svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">${rays}</svg>`;
      layer.append(node);
      const k = 1300 / duration; // 拉长时进场和退场照旧快，中间停得久
      run(node, [{ opacity: 0, transform: 'scale(1.3)' }, { opacity: 0.9, transform: 'scale(1)', offset: 0.15 * k }, { opacity: 0.75, transform: 'scale(1.03)', offset: 1 - 0.3 * k }, { opacity: 0, transform: 'scale(1.08)' }], { duration, easing: 'ease-out' });
      return node;
    }

    function focusLines({ text } = {}) {
      play('集中线');
      I.shake();
      charmBoost(0.08);
      focusRays();
      setTimeout(() => shout({ text: text ?? line('集中线') }), 80);
    }

    /**
     * 命令：叫玩家在现实里做一个动作（握紧一点～、深呼吸～、换另一只手♥……）。
     * 集中线停得更久 + 正中一枚 cream 底大字，头上顶一枚墨色「命令」小签，停 hold 秒（默认 2.8）好读完照做。
     * 没写 text 从台词池「命令」取（这份委托没有这个池就用「集中线」）。
     * 委托写了 reward.cutins：大字下面多一枚「遵命」按钮（多停 1.2 秒），点了放一段奖励 cut-in（平时不放）；点不点都行。点了记进遵命计数（game.js obeyRender）。
     * 闭眼、寸止、呼吸借它喊开场的那句（reward: false，不带按钮）。
     * sound: false 不出声（和响指一起下的命令：别盖住那一声）；y 大字放在画面多高（0–1，默认 0.4；怀表上出题的时候往上让）。
     * 委托的 fx.command { dim, beat }（006）：命令砸上来的那一下，周围的画面一下压暗（dim 0–1 多暗），过一拍（beat 秒）再亮回来——强制感。
     *   压在命令的字和集中线下面、别的演出上面；题（怀表上的环）在更上面一层，不跟着暗
     */
    function command({ text, hold = 2.8, reward = true, sound, y = 0.4 } = {}) {
      if (sound !== false) play(sound ?? '集中线');
      I.shake();
      charmBoost(0.05);
      const withReward = reward !== false && rewardCutins().length > 0;
      const ms = (Number(hold) || 2.8) * 1000 + (withReward ? 1200 : 0);
      // 上一条命令还挂着：先收掉，不叠两条
      for (const old of layer.querySelectorAll('.fl-order, .fx-focus--order')) {
        if (reduce.matches) old.remove();
        else old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, fill: 'forwards', composite: 'replace' }).onfinish = () => old.remove();
      }
      const rays = focusRays(ms);
      rays.classList.add('fx-focus--order');
      const dim = cfg().command ?? {};
      if (dim.dim > 0) {
        const shade = el('div', 'fx-order-dim');
        layer.insertBefore(shade, rays);
        const k = Math.min(0.9, Number(dim.dim) || 0.6);
        const beat = Math.max(0.3, Number(dim.beat) || 0.8) * 1000;
        // 减少动态：不闪，暗着停一拍直接撤
        if (reduce.matches) {
          shade.style.opacity = String(k);
          setTimeout(() => shade.remove(), beat);
        } else {
          run(shade, [{ opacity: 0 }, { opacity: k, offset: 60 / (beat + 380) }, { opacity: k, offset: beat / (beat + 380) }, { opacity: 0 }], { duration: beat + 380, easing: 'linear' });
        }
      }
      const words = text ?? line(I.hasPool('命令') ? '命令' : '集中线');
      const node = el('div', 'fl-order');
      const tag = el('span', 'fl-order-tag', I.tr('命令'));
      const s = el('span', 'sticker sticker--large');
      I.sticker(s, words);
      node.append(tag, s);
      if (withReward) {
        node.append(rewardButton(node, rays));
        I.emit('order');
      }
      const r = appRect();
      place(node, r.width / 2, r.height * (Number(y) || 0.4));
      node.style.rotate = `${rand(-4, 4)}deg`;
      if (reduce.matches) return run(node, [], { duration: ms });
      run(
        node,
        [
          { transform: 'translate(-50%, -50%) scale(2.2)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.94)', opacity: 1, offset: 0.06 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.1 },
          { transform: 'translate(-50%, -50%) scale(1.02)', opacity: 1, offset: 0.92 },
          { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0 },
        ],
        { duration: ms, easing: 'ease-out' },
      );
    }

    // ---------- 奖励：命令下面的「遵命」按钮 → 奖励 cut-in ----------
    // 委托的 reward.cutins 按顺序轮着放（写法同定时演出「视频」，静图可以写 focus 对准一点）；平时不放，只有点了按钮才放
    const RW = { n: 0 };
    const rewardCutins = () => (Array.isArray(Q().reward?.cutins) ? Q().reward.cutins.filter((c) => c && (c.src || c.still)) : []);
    function rewardButton(node, rays) {
      const b = el('button', 'fl-order-reward');
      b.type = 'button';
      const label = el('span', 'sticker');
      I.sticker(label, I.tr('遵命'));
      b.append(label);
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        if (b.disabled) return;
        b.disabled = true;
        I.emit('obey');
        const br = b.getBoundingClientRect();
        const ar = appRect();
        heartSpray(br.left - ar.left + br.width / 2, br.top - ar.top + br.height / 2, { count: 10, spread: 120, rise: 90, size: [12, 26], duration: [700, 1200] });
        // 命令和集中线先收掉，再放奖励
        for (const n of [node, rays]) {
          if (!n?.isConnected) continue;
          if (reduce.matches) n.remove();
          else n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards', composite: 'replace' }).onfinish = () => n.remove();
        }
        setTimeout(rewardCutin, 220);
      });
      return b;
    }
    function rewardCutin() {
      const list = rewardCutins();
      if (!list.length || !I.inBattle()) return;
      const c = list[RW.n++ % list.length];
      const text = c.text ?? (c.pool && I.hasPool(c.pool) ? line(c.pool) : undefined);
      charmBoost(0.2);
      // 开着的特写不收（第 4 组那种停到结束的特写），奖励的框压在上面，放完特写还在
      vclip({ ...c, text, keepCloseup: true, reward: true });
    }

    /** 『』括起来的词垫粉框（game.js markChips：挨着的并成一个框、括号外侧收紧；英语去掉括号） */
    const marked = (node, text) => I.markChips(node, text);

    // ---------- 闭眼（定时演出「闭眼」）----------
    // 「闭上眼睛～」命令 → 画面慢慢暗下来（节奏轨也盖住），只剩「提」「压」的声音带着动；hold 秒后「好了，睁开眼睛吧～」、暗幕退掉。
    // 没开声音：暗幕浅一点、节奏轨留在暗幕上面（看着它动）。每到一端，暗幕里那句字轻轻一跳
    const BL = { node: null, token: 0 };
    async function blind({ text, hold = 6 } = {}) {
      const token = ++BL.token;
      command({ text: text ?? line('闭眼-开始'), hold: 1.8, reward: false });
      await sleep(1500);
      if (BL.token !== token || !I.inBattle()) return;
      const sound = I.soundOn();
      if (!BL.node) {
        BL.node = el('div', 'fx-blind');
        BL.node.append(el('p', 'fx-blind-text'));
      }
      const p = BL.node.firstElementChild;
      marked(p, line(sound ? '闭眼-提示' : '闭眼-没声音'));
      app.append(BL.node);
      app.dataset.blind = sound ? 'dark' : 'peek';
      // 暗下来之前开着的特写（停到这组结束的那种除外）先收掉
      if (CU.open && !CU.pinned) closeupClose();
      requestAnimationFrame(() => BL.node.classList.add('is-on'));
      await sleep((Number(hold) || 6) * 1000);
      if (BL.token !== token) return;
      marked(p, line('闭眼-结束'));
      if (!reduce.matches) p.animate([{ scale: '1.25', opacity: 0 }, { scale: '1', opacity: 1 }], { duration: 300, easing: 'ease-out' });
      await sleep(1300);
      if (BL.token !== token) return;
      blindEnd();
    }
    function blindEnd() {
      BL.token++;
      BL.node?.classList.remove('is-on');
      delete app.dataset.blind;
    }

    // ---------- 寸止（定时演出「寸止」）----------
    // 节奏轨下一次到顶就停在「提」上 hold 秒（秒数照走）：停住那一刻「停！不准动～」命令，滑块左边一个接一个砸倒数（3、2、1），
    // 每一下滑块外面扩一圈粉环；停完节奏接着往下走，她在耳边说「……好，继续♥」
    async function edge({ text, hold = 3, snap: withSnap = false, quiet = false } = {}) {
      const secs = Math.max(1, Number(hold) || 3);
      const c = I.rhEdge(secs);
      // 等太久（画面上的题一直没做完）就不停了：免得题做到一半、或者决胜题出来之后才喊停
      const ok = await Promise.race([c.started, sleep(4000).then(() => null)]);
      if (!ok || !I.inBattle()) {
        if (I.RH.edge === c) I.rhRelease();
        return;
      }
      // snap：停住那一刻打一声响指（006 的暗示「听到响指，手就停下」）；quiet：不喊「停」——暗示已经种下了，响指一响手自己停
      // 响指那一声要听得见（站主 2026-10-02：没听到响指）：喊话不出声、旁边的倒数晚半拍再开始砸
      if (withSnap) snap({});
      if (!quiet) command({ text: text ?? line('寸止-开始'), hold: Math.min(secs, 2.4), reward: false, sound: withSnap ? false : undefined });
      const n = Math.max(1, Math.round(secs));
      let stopped = false;
      c.done.then(() => (stopped = true));
      const lead = withSnap ? Math.min(0.5, secs * 0.2) : 0;
      if (lead) await Promise.race([sleep(lead * 1000), c.done]);
      for (let i = n; i >= 1 && !stopped; i--) {
        edgeCount(i);
        await Promise.race([sleep(((secs - lead) / n) * 1000), c.done]);
      }
      await c.done;
      if (!I.inBattle()) return;
      if (!quiet) whisper({ text: line('寸止-结束'), at: 'lips', hold: 1800 });
    }
    function edgeCount(n) {
      play('倒数');
      const knob = app.querySelector('#rh-knob-body');
      if (!knob) return;
      const kr = knob.getBoundingClientRect();
      const ar = appRect();
      const x = kr.left - ar.left + kr.width / 2;
      const y = kr.top - ar.top + kr.height / 2;
      pulseRing(x, y, { size: 40, end: 150, duration: 700, color: '#ff6fae', width: 3 });
      const node = el('div', 'fx-edge-count');
      const st = el('span', 'sticker sticker--large');
      I.sticker(st, String(n));
      node.append(st);
      place(node, x - 74, y + 8);
      if (reduce.matches) return run(node, [], { duration: 980 });
      run(
        node,
        [
          { transform: 'translate(-50%, -50%) scale(2)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(0.9)', opacity: 1, offset: 0.14 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.24 },
          { transform: 'translate(-50%, -50%) scale(1)', opacity: 1, offset: 0.86 },
          { transform: 'translate(-50%, -50%) scale(0.8)', opacity: 0 },
        ],
        { duration: 980, easing: 'ease-out' },
      );
    }

    // ---------- 呼吸（定时演出「呼吸」）----------
    // 「一起深呼吸～」命令；节奏轨下一次到底开始，滑块跟着呼吸走：吸 in 秒往上、呼 out 秒往下，count 次（节奏就按这个放慢），
    // 画面四周一圈粉光跟着一胀一缩（吸气往里涨、呼气退回去），画面中间偏下浮着「吸——」「呼——」
    const BR = { token: 0 };
    async function breathSync({ text, count = 2, in: inhale = 3, out: exhale = 3 } = {}) {
      const token = ++BR.token;
      command({ text: text ?? line('呼吸-开始'), hold: 2.2, reward: false });
      const c = I.rhBreath({ inhale, exhale, count });
      const ok = await Promise.race([c.started, sleep(6000).then(() => null)]);
      if (!ok || BR.token !== token || !I.inBattle()) {
        if (I.RH.breath === c) I.rhRelease();
        return;
      }
      const glow = el('div', 'fx-breath');
      const word = el('div', 'fx-breath-word');
      const ws = el('span', 'sticker sticker--large');
      word.append(ws);
      layer.append(glow, word);
      const r = appRect();
      word.style.left = `${r.width * 0.42}px`;
      word.style.top = `${r.height * 0.6}px`;
      let phase = '';
      let live = true;
      c.done.then(() => (live = false));
      const tick = () => {
        const b = I.RH.breath;
        if (!live || !b || b.t == null) return;
        // 吸气：粉光从四边往里涨（opacity 起来、框往里收）；呼气：退回去
        const v = b.phase === 'in' ? b.k : 1 - b.k;
        const e = v * v * (3 - 2 * v);
        glow.style.opacity = (0.25 + e * 0.75).toFixed(3);
        glow.style.transform = `scale(${(1.14 - e * 0.14).toFixed(4)})`;
        if (b.phase !== phase) {
          phase = b.phase;
          I.sticker(ws, line(phase === 'in' ? '呼吸-吸' : '呼吸-呼'));
          if (!reduce.matches) word.animate([{ opacity: 0, transform: 'translate(-50%, -30%)' }, { opacity: 1, transform: 'translate(-50%, -50%)' }], { duration: 380, easing: 'ease-out', fill: 'both' });
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      await c.done;
      for (const n of [glow, word]) {
        if (reduce.matches) n.remove();
        else n.animate([{ opacity: getComputedStyle(n).opacity }, { opacity: 0 }], { duration: 500, fill: 'forwards' }).onfinish = () => n.remove();
      }
    }

    function breath() {
      play('吐息');
      charmBoost(0.06);
      const p = anchor('lips');
      const side = p.x > appRect().width / 2 ? -1 : 1;
      for (let i = 0; i < 5; i++) {
        const puff = el('div', 'fx-mist');
        const size = rand(90, 170);
        Object.assign(puff.style, { width: `${size}px`, height: `${size}px` });
        place(puff, p.x, p.y);
        run(
          puff,
          [
            { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
            { transform: `translate(calc(-50% + ${side * rand(40, 80)}px), calc(-50% + ${rand(-20, 20)}px)) scale(0.8)`, opacity: 0.7, offset: 0.3 },
            { transform: `translate(calc(-50% + ${side * rand(150, 240)}px), calc(-50% + ${rand(-60, 30)}px)) scale(1.4)`, opacity: 0 },
          ],
          { duration: rand(1600, 2200), delay: i * 110, easing: 'ease-out' },
        );
      }
      // 心跟着气飘出去
      heartSpray(p.x + side * 20, p.y, { count: 7, spread: 200, rise: 50, dir: side, size: [10, 24], duration: [1400, 2000], delay: 180 });
      setTimeout(() => whisper({ text: line('拟声-吐息'), at: 'lips', size: 22, hold: 1400 }), 150);
    }

    // ---------- 倒计时诱惑 ----------

    function countdownTick(left) {
      const c = I.stageCell('countdown');
      const from = c.from ?? 0;
      // stamp：剩这么多秒起每秒砸一个报数（005：最后 10 秒）；定时演出的报数正在报时不重复
      if (c.stamp > 0 && left > 0 && left <= c.stamp && !BAO.left) countStamp(String(left), { big: left <= 3 });
      const clock = app.querySelector('#clock');
      if (left > from || left <= 0) {
        clock?.classList.remove('clock--allure');
        return;
      }
      clock?.classList.add('clock--allure');
      if (clock && !reduce.matches) {
        clock.animate([{ scale: '1.35' }, { scale: '0.95', offset: 0.5 }, { scale: '1' }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
      }
      charmBoost(c.boost ?? 0.07);
      play('心跳');
      CH.beat = 1;
      const base = ((cfg().floatLook ?? {})['倒计时'] ?? {}).size ?? 17;
      if (c.line) whisper({ text: line(c.line, { n: left }), at: 'face', style: '倒计时', size: base + (from - left) * 1.5, hold: 900 });
      if ((c.at ?? [1]).includes(left)) fire(c, 'countdown');
    }

    // ---------- 报数（005）：每跳一个秒数，数字砸在滑块刚到的那一头 ----------
    // 节拍锁（档位写 lock）保证每跳一个秒数滑块都正好停在一头，数字就盖在那一头上——拍子落在哪儿，一眼看得见。
    //   style  clock＝报还剩几秒（和左下角同一个数，最后 3 下变大变红）；cheer＝啦啦队的八拍「1、2……8」，数到 8 彩带炸一下
    //   seconds 报几下；whisper 台词池，每 whisperEvery 下她在嘴边跟着数一声（{n}＝这个数）
    const BAO = { left: 0, k: 0, style: 'clock', whisper: null, every: 2 };
    function baoshu(c = {}) {
      BAO.left = Math.max(1, Math.round(Number(c.seconds) || 8));
      BAO.k = 0;
      BAO.style = c.style === 'cheer' ? 'cheer' : 'clock';
      BAO.whisper = c.whisper ?? null;
      BAO.every = Math.max(1, Math.round(Number(c.whisperEvery) || 2));
    }
    T.on('second', ({ left }) => {
      if (BAO.left <= 0 || left == null || !I.inBattle()) return;
      BAO.left--;
      BAO.k++;
      const cheer = BAO.style === 'cheer';
      const n = cheer ? ((BAO.k - 1) % 8) + 1 : left;
      countStamp(String(n), { big: cheer ? n === 8 : left <= 3, cheer });
      if (BAO.whisper && BAO.k % BAO.every === 0) whisper({ text: line(BAO.whisper, { n }), at: 'lips', style: '倒计时', hold: 700 });
    });
    T.on('screen', () => (BAO.left = 0));
    function countStamp(text, { big = false, cheer = false } = {}) {
      play('报数');
      const knob = app.querySelector('#rh-knob-body');
      if (!knob) return;
      const kr = knob.getBoundingClientRect();
      const ar = appRect();
      const x = kr.left - ar.left + kr.width / 2;
      const y = kr.top - ar.top + kr.height / 2;
      pulseRing(x, y, { size: 26, end: big ? 170 : 110, duration: 600, color: cheer ? '#5aa9ff' : '#fff5e1', core: 'rgb(0 0 0 / 0)', width: 3 });
      const node = el('div', `fx-count${big ? ' fx-count--big' : ''}${cheer ? ' fx-count--cheer' : ''}`);
      const st = el('span', 'sticker sticker--large');
      I.sticker(st, text);
      node.append(st);
      const tilt = rand(-9, 9);
      place(node, x - (big ? 72 : 58), y);
      if (big && cheer) confetti(x - 50, y);
      if (reduce.matches) return run(node, [], { duration: 700 });
      run(
        node,
        [
          { transform: `translate(-50%, -50%) scale(1.8) rotate(${tilt - 12}deg)`, opacity: 0 },
          { transform: `translate(-50%, -50%) scale(0.92) rotate(${tilt}deg)`, opacity: 1, offset: 0.16 },
          { transform: `translate(-50%, -50%) scale(1) rotate(${tilt}deg)`, opacity: 1, offset: 0.3 },
          { transform: `translate(calc(-50% - 28px), -50%) scale(0.96) rotate(${tilt}deg)`, opacity: 0 },
        ],
        { duration: big ? 900 : 700, easing: 'cubic-bezier(.2,.8,.3,1)' },
      );
    }
    /** 啦啦队的彩带：蓝、白、粉、荧光绿的小纸片往上炸开再飘下来 */
    function confetti(x, y, n = 16) {
      if (reduce.matches) return;
      const tones = ['#5aa9ff', '#fff5e1', PINK, '#c8ff2e'];
      for (let i = 0; i < n; i++) {
        const p = el('div', 'fx-confetti');
        p.style.background = choice(tones);
        place(p, x, y);
        const a = rand(-Math.PI * 0.95, -Math.PI * 0.05);
        const d = rand(60, 160);
        const dx = Math.cos(a) * d;
        const dy = Math.sin(a) * d;
        run(
          p,
          [
            { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
            { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) rotate(${rand(-360, 360)}deg)`, opacity: 1, offset: 0.55 },
            { transform: `translate(calc(-50% + ${dx * 1.25}px), calc(-50% + ${dy + 70}px)) rotate(${rand(-540, 540)}deg)`, opacity: 0 },
          ],
          { duration: rand(750, 1150), easing: 'cubic-bezier(.2,.7,.4,1)' },
        );
      }
    }

    // ---------- 分岔（challenge.js buildFork，005）----------
    // 往「奖励」走得越深：魅了越浓、心从滑块上冒得越多；被拽回来那一下：奖励那头炸一串心、她在耳边劝你回头；
    // 选定：奖励＝粉光铺满、心章；通过＝什么也不加（斩的那一下 challenge.e79d111f0f.js 自己放）
    /*
     * 分岔（challenge.js 的 fork 事件）。站主 2026-09-23：两头的特效都太轻——
     *   往「通过」走：每被拽回一次冒心、耳语、奖励那头一圈粉环；走到 20% / 45% / 70% 各切进来一个 cut-in（嘴·心形 / 靴底·砸 / 双格），
     *     cut-in 压在题下面（题在更上一层），轨道照样看得见、拖得动
     *   往「奖励」走：越往里画面越粉（魅了底色一起涨）、他的心声和她的台词越来越密、她的幻影一次次浮上来（forkFrame）
     */
    const PASS_LURES = [
      [0.2, () => stillCloseup('mouth', { variant: '心形', hold: 1.9, text: line('分岔-诱惑') }) ?? closeup('chest', { hold: 1.6 })],
      [0.45, () => stillCloseup('sole', { variant: '砸', hold: 1.7, text: line('分岔-诱惑') }) ?? stillCloseup('gaze', { variant: '横条', hold: 1.7, text: line('分岔-诱惑') }) ?? closeup('hips', { hold: 1.6 })],
      [0.7, () => splitCloseup({ hold: 2.4, text: line('分岔-诱惑') }) ?? closeup('chestSide', { hold: 1.6 })],
    ];
    /**
     * 委托自己写的那几个（hypno.fork.lures：[{ at 走到几成, fx 特写的演出名, variant, hold, pool 框下那行字 }]）。
     * 和默认的不同：前一个特写还开着就先不切下一个（等它放完、滑块再动的时候才放）——006 第一个是摇镜头的，要放完整
     */
    function forkLures() {
      const list = hy()?.fork?.lures;
      if (!Array.isArray(list)) return null;
      return list
        .filter((l) => l && l.fx && l.at >= 0)
        .map((l) => [l.at, () => trigger(l.fx, { ...(l.variant ? { variant: l.variant } : {}), ...(l.hold > 0 ? { hold: l.hold } : {}), text: line(l.pool ?? hy().fork.whispers ?? '分岔-诱惑') })]);
    }
    function forkReset() {
      Object.assign(FK, { k: 0, side: null, pass: 0, active: false, talkAt: 0, talkN: 0, phantomAt: 0 });
      FK.fired = new Set();
    }
    T.on('fork', ({ k, side, lure, done, pool, x, y, heartHit }) => {
      if (!I.inBattle()) return;
      if (heartHit) {
        play('接触');
        heartSpray(x, y, { count: 8, spread: 70, rise: 60, size: [10, 22], tones: ['pink', 'rose', 'pink'] });
        heartRing(x, y, { size: 30, to: 3, duration: 700 });
        charmBoost(0.05);
        return;
      }
      if (lure) {
        heartSpray(x, y, { count: 9 + Math.round(FK.pass * 10), spread: 110, rise: 80, size: [12, 28] });
        charmBoost(0.08 + FK.pass * 0.1);
        whisper({ text: line(pool ?? '分岔-诱惑'), at: 'lips', hold: 1300 });
        heartRing(x, y, { size: 44, to: 3 + FK.pass * 3, duration: 900 });
        if (FK.pass > 0.35) {
          play('魅惑闪光');
          pulseRing(x, y, { size: 40, end: 320, duration: 800, color: PINK, width: 3 });
        }
        return;
      }
      if (done) {
        forkReset();
        if (done === 'reward') {
          charmBoost(0.5);
          play('心章');
          heartSpray(x, y, { count: 14, spread: 150, rise: 120, size: [14, 34] });
          const f = el('div', 'fx-flash');
          layer.append(f);
          run(f, [{ opacity: 0 }, { opacity: 0.28, offset: 0.15 }, { opacity: 0 }], { duration: 520 });
        }
        return;
      }
      FK.active = true;
      FK.side = side === undefined ? 'reward' : side;
      FK.k = FK.side === 'reward' ? (k ?? 0) : 0;
      FK.pass = FK.side === 'pass' ? (k ?? 0) : 0;
      if (FK.side === 'pass') {
        if (hy()?.fork) charmBoost(0.012 + FK.pass * 0.05);
        const own = forkLures();
        for (const [at, go] of own ?? PASS_LURES) {
          if (FK.pass < at || FK.fired.has(at)) continue;
          if (own && (VC.open || CU.open)) break;
          FK.fired.add(at);
          go();
          heartSpray(x, y, { count: 10, spread: 120, rise: 90, size: [12, 30] });
          charmBoost(0.12);
        }
        return;
      }
      if (FK.k <= 0) return;
      charmBoost(0.02 + FK.k * 0.06);
      const now = performance.now();
      if (now - FK.last > 520 - FK.k * 360) {
        FK.last = now;
        heartSpray(x, y, { count: 1 + Math.round(FK.k * 4), spread: 50 + FK.k * 60, rise: 40 + FK.k * 50, size: [10, 20 + FK.k * 12] });
      }
    });

    /**
     * 终场（超时演完才落到 0，005 的言责词之后）。站主 2026-09-24：从言责词变成 0 那一下太平淡、注意力不在左下——
     * 长哨一声；0 从三倍大砸下来、打颤；从秒数那里炸开冲击环和一圈粉环；集中线；整屏一闪一震；旁边蹦「终场！」。
     * 声音和字可以按委托换：立绘档案 / 委托的 fx.finish.final { sound 音效名, text 蹦的字 }（006：催眠术师不吹哨子，打一个响指「啪！」）
     */
    function finalBlow() {
      const fin = cfg().finish?.final ?? {};
      const clock = app.querySelector('#clock');
      const r = appRect();
      const cr = clock?.getBoundingClientRect();
      const cx = cr ? cr.left - r.left + cr.width / 2 : r.width * 0.2;
      const cy = cr ? cr.top - r.top + cr.height / 2 : r.height * 0.7;
      play(fin.sound ?? '哨子-长');
      I.shake();
      setTimeout(() => I.shake(), 140);
      CH.beat = 1;
      clock?.animate(
        [
          { scale: '3.2', rotate: '-14deg', filter: 'brightness(2.2)' },
          { scale: '0.86', rotate: '4deg', filter: 'brightness(1.4)', offset: 0.28 },
          { scale: '1.12', rotate: '-3deg', filter: 'brightness(1.1)', offset: 0.5 },
          { scale: '1', rotate: '0deg', filter: 'brightness(1)' },
        ],
        { duration: 620, easing: 'cubic-bezier(.3,.8,.3,1)' },
      );
      pulseRing(cx, cy, { size: 60, end: r.width * 1.5, duration: 800, color: '#fff6d8', core: 'rgb(0 0 0 / 0)', width: 6 });
      pulseRing(cx, cy, { size: 50, end: r.width * 1.1, duration: 900, delay: 120, color: PINK, width: 4 });
      // 集中线挪到秒数那里（整片平移；线从离中心 34% 起，挪到角上照样铺满画面）
      const rays = focusRays(900);
      rays.style.translate = `${cx - r.width / 2}px ${cy - r.height / 2}px`;
      const f = el('div', 'fx-flash');
      layer.append(f);
      run(f, [{ opacity: 0 }, { opacity: 0.45, offset: 0.12 }, { opacity: 0 }], { duration: 520 });
      ono({ text: I.tr(fin.text ?? '终场！'), point: { x: Math.min(r.width - 90, cx + 120), y: cy - 70 }, big: true });
    }

    /**
     * 分岔往「醒来」那头走（006，站主 2026-10-03）：委托写了 hypno.fork 才有——越往外走越浓。
     *   pink 粉色滤镜到多浓、gaze 背后那张半透明的注视（gazeOpacity）、ghost 晃在前面的两张她（混乱那一套，淡淡的；ghostOpacity、focusY）、
     *   thoughts 他涌出来的心声（池）、whispers 她在耳边劝的（池）。返回现在走了多远（缓过的 0–1）
     */
    function forkWake(dt, live) {
      const hf = hy()?.fork;
      const want = live && hf && FK.side === 'pass' ? FK.pass : 0;
      FK.wake += (want - FK.wake) * Math.min(1, dt * 3);
      if (!hf || (FK.wake < 0.005 && !want)) {
        FK.wake = 0;
        FK.wakeEl?.remove();
        FK.wakeEl = FK.gazeEl = null;
        FK.ghosts = [];
        return 0;
      }
      if (!FK.wakeEl) {
        const box = el('div', 'fx-fork-wake');
        if (hf.gaze) {
          FK.gazeEl = el('img', 'fx-fork-gaze');
          FK.gazeEl.src = hf.gaze;
          FK.gazeEl.alt = '';
          box.append(FK.gazeEl);
        }
        const src = hf.ghost ?? Q().art?.standee?.her?.faces?.normal;
        const fy = Math.max(0, Math.min(100, Number(hf.focusY ?? hy().confuse?.focusY) || 50));
        if (src && !reduce.matches) {
          for (const side of [-1, 1]) {
            const g = el('img', 'fx-fork-ghost');
            g.src = src;
            g.alt = '';
            g.style.transformOrigin = `50% ${fy}%`;
            box.append(g);
            g.animate(
              [
                { transform: `translate(-50%, -${fy}%) translateX(${side * 80}px) scale(1.9) rotate(${side * -5}deg)` },
                { transform: `translate(-50%, -${fy}%) translateX(${side * -40}px) scale(2.1) rotate(${side * 4}deg)` },
              ],
              { duration: side < 0 ? 1200 : 1600, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
            );
            FK.ghosts.push(g);
          }
        }
        charm.insertBefore(box, heartsCanvas);
        FK.wakeEl = box;
      }
      const w = FK.wake;
      if (FK.gazeEl) FK.gazeEl.style.opacity = (w * (hf.gazeOpacity ?? 0.5)).toFixed(3);
      // 晃的那两张过了三成才慢慢出来
      const go = Math.max(0, (w - 0.3) / 0.7) * (hf.ghostOpacity ?? 0.35);
      for (const g of FK.ghosts) g.style.opacity = go.toFixed(3);
      // 他的心声一句接一句（越往外越密、同时在场的越多），隔几句她在耳边劝一句
      if (want > 0.06) {
        const now = performance.now();
        if (now >= FK.talkAt) {
          FK.talkAt = now + Math.max(240, 1300 - want * 1200) * rand(0.8, 1.2);
          const n = FK.talkN++;
          const r = appRect();
          if (n % 4 === 3) whisper({ text: line(hf.whispers ?? '分岔-诱惑'), at: choice(['face', 'lips', 'chest']), hold: 1500 });
          else if (layer.querySelectorAll('.fl-heart').length < 2 + Math.round(want * 4)) vertical({ text: hf.thoughts ? line(hf.thoughts) : undefined, x: r.width * rand(0.04, 0.84), y: r.height * rand(0.1, 0.42) });
        }
      }
      return w;
    }

    /** 分岔往「奖励」走：每帧——画面染粉、心声和台词越来越密、她的幻影浮上来（越往里越密越浓） */
    function forkFrame(dt) {
      const live = FK.active && !!app.querySelector('.chal-fork');
      if (!live && FK.active) forkReset();
      const wake = forkWake(dt, live);
      const want = Math.max(live && FK.side === 'reward' ? FK.k : 0, wake * (hy()?.fork?.pink ?? 0.8));
      FK.pink += (want - FK.pink) * Math.min(1, dt * 3);
      if (FK.pink < 0.005 && !live) {
        FK.pink = 0;
        if (FK.el) FK.el.hidden = true;
        return;
      }
      if (!FK.el) {
        FK.el = el('div', 'fx-fork-pink');
        charm.insertBefore(FK.el, heartsCanvas);
      }
      FK.el.hidden = false;
      FK.el.style.opacity = Math.min(1, FK.pink * 1.1).toFixed(3);
      if (!live || FK.side !== 'reward' || FK.k < 0.04) return;
      const now = performance.now();
      if (now >= FK.talkAt) {
        FK.talkAt = now + Math.max(300, 1500 - FK.k * 1250) * rand(0.8, 1.2);
        const n = FK.talkN++;
        // 他的心声（竖排，最多同时三条）和她的台词轮着来，池按这份委托的 speech.floats 混；走得越深越常冒念头
        if (n % 2 === 0 && layer.querySelectorAll('.fl-heart').length < 3) vertical();
        else if (FK.k > 0.55 && n % 5 === 3) thoughts();
        else if (n % 3 === 1) bubble();
        else whisper({ at: choice(['face', 'lips', 'chest']), hold: 1500 });
      }
      if (FK.k > 0.18 && now >= FK.phantomAt) {
        FK.phantomAt = now + Math.max(700, 2600 - FK.k * 1900);
        phantom(FK.k);
        if (FK.k > 0.5) heartSpray(appRect().width / 2, appRect().height * 0.45, { count: 6, spread: 200, rise: 90, size: [12, 26] });
      }
    }

    /** 她的幻影（分岔往奖励走）：半透明的她从一边浮上来、慢慢飘向中间再淡掉；k 越大越浓 */
    function phantom(k) {
      const img = standee();
      if (!img || reduce.matches) return;
      const bs = Q().art?.battleStandee ?? {};
      const fr = bs.frames?.idle ?? [0, img.naturalHeight];
      const r = appRect();
      const scale = (r.height * rand(0.85, 1.1)) / Math.max(1, fr[1] - fr[0]);
      const fromLeft = Math.random() < 0.5;
      const cx = r.width * (fromLeft ? rand(0.18, 0.34) : rand(0.66, 0.82));
      const ix = bs.centerX ?? img.naturalWidth / 2;
      const node = el('img', 'fx-phantom');
      node.src = img.currentSrc || img.src;
      node.alt = '';
      Object.assign(node.style, { width: `${img.naturalWidth * scale}px`, height: `${img.naturalHeight * scale}px`, left: `${cx - ix * scale}px`, top: `${r.height * 0.06 - fr[0] * scale}px` });
      charm.insertBefore(node, heartsCanvas);
      const peak = 0.2 + 0.35 * k;
      const dx = (fromLeft ? 1 : -1) * r.width * 0.14;
      const dur = rand(2400, 3200);
      node.animate(
        [
          { opacity: 0, transform: 'scale(1.1)' },
          { opacity: peak, transform: `translate(${dx * 0.5}px, -8px) scale(1.03)`, offset: 0.35 },
          { opacity: 0, transform: `translate(${dx}px, -16px) scale(0.98)` },
        ],
        { duration: dur, easing: 'ease-out', fill: 'both' },
      ).onfinish = () => node.remove();
      setTimeout(() => node.remove(), dur + 300);
    }

    /** 爱心爆发（005）：画面正中炸开一大片心，粉光一闪、几圈心形环、心跳一声、魅了往上冲——靴底踩上来之后那一下 */
    function heartBurst({ count = 46 } = {}) {
      const r = appRect();
      const x = r.width / 2;
      const y = r.height * 0.42;
      play('心章');
      I.shake();
      charmBoost(0.35);
      CH.beat = 1;
      heartSpray(x, y, { count, spread: r.width * 0.95, rise: r.height * 0.35, size: [14, 40], duration: [1100, 1900], tones: ['pink', 'rose', 'purple', 'pink'] });
      heartSpray(x, y + 80, { count: 18, spread: r.width * 0.7, rise: r.height * 0.25, size: [10, 24], delay: 180 });
      for (let i = 0; i < 3; i++) heartRing(x, y, { size: 80, to: 5 + i, duration: 900, delay: i * 160 });
      pulseRing(x, y, { size: 80, end: r.width * 1.6, duration: 900, color: PINK, width: 4 });
      const f = el('div', 'fx-flash');
      layer.append(f);
      run(f, [{ opacity: 0 }, { opacity: 0.35, offset: 0.15 }, { opacity: 0 }], { duration: 600 });
      ono({ pool: '拟声-心跳', at: 'chest', big: true });
    }

    /** 哨子（005）：下指令、啦啦队的一声。count 2＝「哔、哔——」，long＝长长的一声；画面上蹦一个拟声字 */
    function whistle({ count = 1, long = false, text } = {}) {
      play(long ? '哨子-长' : count >= 2 ? '哨子' : '哨子-短');
      ono({ text: text ?? (I.hasPool('拟声-哨子') ? line('拟声-哨子') : I.tr('哔——！')), at: 'face', big: true });
    }

    // ---------- 催眠（006 催眠术师）：螺旋、怀表、洗脑进度、开关面板、暗示 ----------
    // 委托写了 "hypno" 段才有这些（别的委托一概不动）：
    //   hypno.spiral   螺旋的默认样子 { c1, c2, mode, arms, twist, soft, speed }；什么时候多浓、转多快写在每组的 sets[n].spiral
    //                  关键帧里 [{ at 秒, alpha 垫在她身后的浓度, wash 透叠到她身上, speed 每秒几圈, twist, center "eyes" / "watch" / [x, y] }]，
    //                  两帧之间平滑过去；无尽战斗 endless.spiral、败北处决 execute.spiral 同样写法。画在立绘那块画布里（game.js 的着色器）
    //   怀表           跟着战斗图走，写在立绘档案里（换图时一起换）：
    //                  fx.watch { pivot 链子挂在手上的那一点, amp 摆幅（弧度；可以按段写）, free 没在打的时候自己晃多大, rest 不写＝自动 }——图里画着的那只：
    //                    遮罩 2 的 G 那一块绕 pivot 摆。原图里它不是垂直挂着的（006 往左偏 8.7°），rest 把它先掰正再左右对称地摆
    //                  fx.pendulum { src 单独的怀表图, pivot 图上链子挂点 [x, y], length 挂点到表盘中心（那张图的像素）,
    //                    at 挂点放在战斗图的哪儿（原图像素，可以在图外面）, reach 挂点到表盘中心在战斗图上多长, amp, free }——叠在战斗图前面的那只（006 的近景）
    //                  两种都和节奏滑块同拍（滑块到顶摆到一头、到底摆到另一头）
    //   hypno.progress 洗脑进度 { sets 每组打完时到百分之几, obey 点一次「遵命」加几, label / done 条上的字 }：
    //                  不一直挂着——组间、点了遵命、定时演出「进度」时从上面弹下来报个数；败北处决里一路涨到 100，盖「洗脑完成」的章
    //   hypno.switches 开关面板的几行 [{ key 名字, on 一开始开不开 }]；每组开头是什么状态写 sets[n].switches { 名字: true / false }
    // 定时演出：「响指」「空白」「进度」「开关」「变速」「环字」「字墙」，寸止可以写 snap / quiet（响指一响就停、不喊话）
    const hy = () => Q().hypno ?? null;
    const HY = {
      sp: { alpha: 0, wash: 0, speed: 0.4, twist: 4, soft: 0, phase: 0, mode: 0, arms: 2, center: null, c1: null, c2: null, last: 0, keep: null },
      watch: { a: 0, last: 0, mask2: '' },
      wash: { shown: 0, until: 0, obey: 0, done: false, el: null, execFrom: null, stamp: 0 },
      sw: { state: {}, el: null, timer: 0, set: 0 },
      ring: null,
      wall: null,
      // 催眠状态（剧情里数到 0 之后）：剧情 / 暂停 / 选项画面的立绘上螺旋多浓（0＝没有）
      trance: 0,
    };
    const hexRgb = (hex, fallback) => {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? ''));
      if (!m) return fallback;
      const n = parseInt(m[1], 16);
      return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    };
    const lerp = (a, b, k) => a + (b - a) * k;
    /** 螺旋中心：锚点名（eyes / watch / chest……）或原图坐标 */
    function hyPoint(v) {
      if (Array.isArray(v) && v.length === 2) return v;
      const a = cfg().anchors ?? {};
      // "pendulum"：垂在镜头前面的那只表停着的位置（屏幕上的点换回原图坐标）；这会儿没放下来就用眼睛
      if (v === 'pendulum') {
        const vs = PD.shown && PD.at ? visibleStandee() : null;
        if (vs) {
          const [x, y, w, h] = vs.rect;
          return [((PD.at[0] - x) / w) * vs.img.naturalWidth, ((PD.at[1] + PD.reach - y) / h) * vs.img.naturalHeight];
        }
        return Array.isArray(a.eyes) ? a.eyes : null;
      }
      if (typeof v === 'string' && Array.isArray(a[v])) return a[v];
      return Array.isArray(a.eyes) ? a.eyes : null;
    }
    /** 关键帧取值：list 可以是一帧（对象）或按 at 排的几帧；loop＝按最后一帧的秒数循环（无尽战斗） */
    function spiralKey(list, t, loop = false) {
      const base = hy()?.spiral ?? {};
      const full = (k) => ({
        alpha: Number(k?.alpha ?? 0),
        wash: Number(k?.wash ?? 0),
        speed: Number(k?.speed ?? base.speed ?? 0.5),
        twist: Number(k?.twist ?? base.twist ?? 4),
        soft: Number(k?.soft ?? base.soft ?? 0),
        mode: Number(k?.mode ?? base.mode ?? 0),
        arms: Number(k?.arms ?? base.arms ?? 2),
        center: hyPoint(k?.center ?? base.center),
        c1: hexRgb(k?.c1 ?? base.c1, [1, 0.37, 0.66]),
        c2: hexRgb(k?.c2 ?? base.c2, [0.043, 0.043, 0.07]),
      });
      if (!list) return null;
      if (!Array.isArray(list)) return full(list);
      const keys = list.filter((k) => k && typeof k === 'object').sort((a, b) => (a.at ?? 0) - (b.at ?? 0));
      if (!keys.length) return null;
      const period = keys.at(-1).at ?? 0;
      if (loop && period > 0) t %= period;
      const i = keys.findIndex((k) => (k.at ?? 0) > t);
      if (i === -1) return full(keys.at(-1));
      if (i === 0) return full(keys[0]);
      const a = full(keys[i - 1]);
      const b = full(keys[i]);
      const k = Math.min(1, Math.max(0, (t - (keys[i - 1].at ?? 0)) / Math.max(0.001, (keys[i].at ?? 0) - (keys[i - 1].at ?? 0))));
      const mix3 = (x, y) => [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)];
      return {
        alpha: lerp(a.alpha, b.alpha, k),
        wash: lerp(a.wash, b.wash, k),
        speed: lerp(a.speed, b.speed, k),
        twist: lerp(a.twist, b.twist, k),
        soft: lerp(a.soft, b.soft, k),
        // 图案、臂数不能渐变：过半再换
        mode: k < 0.5 ? a.mode : b.mode,
        arms: k < 0.5 ? a.arms : b.arms,
        center: a.center && b.center ? [lerp(a.center[0], b.center[0], k), lerp(a.center[1], b.center[1], k)] : (b.center ?? a.center),
        c1: mix3(a.c1, b.c1),
        c2: mix3(a.c2, b.c2),
      };
    }
    /** 这一刻螺旋该是什么样（按画面）；不在战斗里就淡掉 */
    function spiralTarget() {
      const scr = S.screen;
      // I.hypnoForce（008：交出护符以后背景换成心形螺旋）：战斗里一直是它
      if (HY.force && (scr === 'hold' || scr === 'pass')) return HY.force;
      if (scr === 'hold') return spiralKey(I.setCfg().spiral, S.elapsed);
      if (scr === 'prep') return spiralKey(S.endless ? Q().endless?.spiral : I.setCfg().spiral, 0, false);
      if (scr === 'pass') return HY.sp.keep;
      if (scr === 'endless') return spiralKey(Q().endless?.spiral, S.elapsed, true);
      if (scr === 'execute' || scr === 'executed') return spiralKey(exCfg().spiral ?? { alpha: 1, wash: 0.8, speed: 1.1 }, scr === 'executed' ? 1e6 : S.exec?.stage === 'count' ? S.elapsed : 0);
      return null;
    }
    /** 每画一帧立绘要一次（MV.mainFx）：往目标慢慢靠、相位按转速往前走。返回 drawStandee 的 fx.spiral */
    function hypnoSpiral() {
      if (reduce.matches || (!hy()?.spiral && !HY.force && HY.sp.alpha + HY.sp.wash < 0.006)) return null;
      const sp = HY.sp;
      const now = performance.now();
      const dt = sp.last ? Math.min(0.1, (now - sp.last) / 1000) : 0;
      sp.last = now;
      const tgt = spiralTarget();
      if (tgt && S.screen !== 'pass') sp.keep = tgt;
      const k = Math.min(1, dt * 3.5);
      sp.alpha = lerp(sp.alpha, tgt?.alpha ?? 0, k);
      sp.wash = lerp(sp.wash, tgt?.wash ?? 0, k);
      if (tgt) {
        sp.speed = lerp(sp.speed, tgt.speed, k);
        sp.twist = lerp(sp.twist, tgt.twist, k);
        sp.soft = lerp(sp.soft, tgt.soft, k);
        sp.mode = tgt.mode;
        sp.arms = tgt.arms;
        sp.c1 = sp.c1 ? sp.c1.map((v, i) => lerp(v, tgt.c1[i], k)) : tgt.c1;
        sp.c2 = sp.c2 ? sp.c2.map((v, i) => lerp(v, tgt.c2[i], k)) : tgt.c2;
        if (tgt.center) {
          // 螺旋还没露出来的时候中心直接到位，露着的时候滑过去
          const ck = sp.center && sp.alpha + sp.wash > 0.03 ? Math.min(1, dt * 5) : 1;
          sp.center = sp.center ? [lerp(sp.center[0], tgt.center[0], ck), lerp(sp.center[1], tgt.center[1], ck)] : tgt.center;
        }
      }
      sp.phase = (sp.phase + dt * sp.speed) % 1000;
      if (sp.alpha < 0.003 && sp.wash < 0.003) return null;
      // 脸上扫得浅的范围跟着这张图里脸的大小走：按眼睛到嘴的距离算（全身那张约 40–340 像素，近景那张脸大一倍，范围也大一倍）
      const a = cfg().anchors ?? {};
      const d = Array.isArray(a.eyes) && Array.isArray(a.lips) ? Math.hypot(a.eyes[0] - a.lips[0], a.eyes[1] - a.lips[1]) : 42;
      return { alpha: sp.alpha, wash: sp.wash, phase: sp.phase, mode: sp.mode, arms: sp.arms, twist: sp.twist, soft: sp.soft, center: sp.center, eyes: hyPoint('eyes'), face: [d, d * 8], c1: sp.c1 ?? [1, 0.37, 0.66], c2: sp.c2 ?? [0.04, 0.04, 0.07] };
    }
    /** 别的脚本硬塞一个螺旋（写法同 sets[n].spiral 的一帧：alpha、wash、speed、mode、arms、twist、center、c1、c2）；null＝撤掉、慢慢淡出 */
    I.hypnoForce = (k) => (HY.force = k ? spiralKey(k) : null);
    /** 螺旋中心现在在屏幕上哪儿（环字跟着它） */
    function spiralPoint() {
      const v = visibleStandee();
      const c = HY.sp.center ?? hyPoint('eyes');
      const ar = appRect();
      if (!v || !c) return { x: ar.width / 2, y: ar.height * 0.38 };
      const [x, y, w, h] = v.rect;
      return { x: x + (c[0] / v.img.naturalWidth) * w, y: y + (c[1] / v.img.naturalHeight) * h };
    }

    // 怀表：主画面那块画布平时不传遮罩 2（只有特写用），这里补传一次
    async function watchMask() {
      const src = Q().art?.battleStandee?.mask2;
      if (!src || !MV.ok || !MV.gl || HY.watch.mask2 === src) return;
      HY.watch.mask2 = src;
      try {
        const img = await I.loadMaskImage(src);
        I.upload(MV.texMask2, img, { premultiply: false }, MV.gl);
        MV.hasMask2 = true;
      } catch {
        HY.watch.mask2 = '';
      }
    }
    /**
     * 怀表这一刻摆到哪（弧度，正＝往左）。w＝fx.watch 或 fx.pendulum，st＝这只表自己的摆角记录，lag＝比正拍晚几秒（幻影用）。
     * 战斗里按这一组的秒数匀速摆——两秒一个来回，双数秒在一头、单数秒在另一头，正好是节奏档位「前段」的那一拍；
     * 滑块加快（中后段、变速）怀表也不跟着快（站主 2026-10-03：加速之后摆得太快不好看），快出来的那几拍由幻影补上（pendulumFrame）。
     * 别的时候自己轻轻晃；剧情里的怀表特写摆得大一点（story）
     */
    function watchAngle(w = cfg().watch ?? cfg().pendulum, st = HY.watch, lag = 0) {
      if (!w) return 0;
      const now = performance.now();
      const dt = st.last ? Math.min(0.1, (now - st.last) / 1000) : 0;
      st.last = now;
      const run = I.RH.active && ['hold', 'endless', 'execute'].includes(S.screen);
      const amp = typeof w.amp === 'number' ? w.amp : (w.amp?.early ?? 0.2);
      const beat = S.screen === 'execute' && S.exec?.stage !== 'count' ? now / 1000 : S.elapsed;
      // 没在打：自己晃。剧情里（开场她提着表给你看）摆得大一点、一秒一下（story，站主 2026-10-02：原来太小）
      const story = S.screen === 'story' && w.story > 0;
      const want = run ? amp * Math.cos(Math.PI * (beat - lag)) : (story ? w.story : (w.free ?? 0.06)) * Math.sin((now / 1000 - lag) * ((Math.PI * 2) / (story ? 2 : 2.6)));
      st.a += (want - st.a) * Math.min(1, dt * 14);
      return st.a;
    }
    /** drawStandee 的 fx.region：遮罩 2 的 G（表和那一小截链子）当成单独一层绕 pivot 转 */
    function hypnoWatch() {
      const w = cfg().watch;
      if (!w || !Array.isArray(w.pivot) || reduce.matches) return undefined;
      watchMask();
      if (!MV.hasMask2) return undefined;
      return { c: w.pivot, r: [1, 1], shake: [0, 0], rot: watchRest(w) + watchAngle(w), pivot: w.pivot, ch: [0, 1, 0], layer: true };
    }
    /** 图里的怀表本来歪多少：按挂点和表盘中心（anchors.watch）算，转回垂直要的角度（rest 写了就用写的） */
    function watchRest(w) {
      if (typeof w.rest === 'number') return w.rest;
      const c = cfg().anchors?.watch;
      if (!Array.isArray(c)) return 0;
      return -Math.atan2(w.pivot[0] - c[0], c[1] - w.pivot[1]);
    }

    // 垂在镜头前面的怀表（fx.pendulum）：一张单独的怀表图，绕挂点摆。两种挂法——
    //   screen [x, y]（占画面宽 / 高的比例）：表盘固定停在画面的那一点，链子从 HUD 下面垂下来（top＝挂点离画面顶多少像素，负的在画面外，越往外表越大）
    //   at [x, y] + reach（原图像素）：挂点钉在战斗图的某一点上，跟着镜头一起缩放；at 的 y 写 "top"＝挂点跟着镜头的上沿走、表盘停在 rest 那一行
    // 出不出现（站主 2026-10-03：怀表出现之后这一组就别再消失，换立绘、放 cut-in 都不影响——持续的催眠感）：
    //   hidden: true 的图上平时收着；镜头关键帧写 "pendulum": true 放下来（game.js 的 S.pend）；没写 hidden 的图（近景）一露面就带着它。
    //   一旦在这一组里放下来过（S.pendLatch），到这一组结束都留着，之后镜头怎么切、关键帧写不写都不管。
    //   有题要出在怀表上（challenge.js）会先把它叫出来（watchSummon）。
    // 画在特写、cut-in 的上面、演出层（浮现文字、命令）的下面；装在一个从 HUD 下缘起的框里，链子露不到 HUD 上面去。
    // 幻影：怀表自己始终按一秒一下摆；节奏是「前段」的 n 倍时（中后段、变速）多出 n − 1 只半透明的幻影，一只比一只晚 1 / n 秒——
    //   每一拍都有一只表正好摆到头，拍子对得上，表本身不用变快
    const PD = { box: null, node: null, ghosts: [], src: '', at: null, reach: 0, angle: 0, shown: false, summonUntil: 0, swing: { a: 0, last: 0 } };
    const PEND_SCREENS = ['prep', 'hold', 'pass', 'endless', 'execute', 'executed'];
    function pendulumFrame() {
      const p = cfg().pendulum;
      const live = p && MV.active && !reduce.matches && PEND_SCREENS.includes(S.screen);
      const v = live ? visibleStandee() : null;
      if (!v || !(p.length > 0) || !(Array.isArray(p.screen) || Array.isArray(p.at))) {
        if (PD.box) PD.box.hidden = true;
        PD.shown = false;
        return;
      }
      if (!PD.box) {
        PD.box = el('div', 'hy-pend-box');
        PD.node = el('img', 'hy-pend');
        PD.node.alt = '';
        PD.node.decoding = 'async';
        PD.node.style.opacity = '0';
        PD.box.append(PD.node);
        app.insertBefore(PD.box, layer);
      }
      if (PD.src !== p.src) {
        PD.src = p.src;
        PD.node.src = p.src;
        for (const g of PD.ghosts) g.node.src = p.src;
      }
      const img = PD.node;
      PD.box.hidden = false;
      if (!img.naturalWidth) return;
      const ar = appRect();
      const top = PD.box.offsetTop; // 框的上沿（HUD 下缘）：里面的坐标都要减掉它
      const summoned = performance.now() < PD.summonUntil && S.screen === 'hold';
      let px;
      let py;
      let reach;
      let want = summoned || !!S.pendLatch || (S.pend ?? !p.hidden);
      if (Array.isArray(p.screen) || !Array.isArray(p.at)) {
        const sc = p.screen ?? [0.42, 0.57];
        px = ar.width * sc[0];
        py = Number(p.top) || 26;
        reach = ar.height * sc[1] - py;
      } else {
        const [x, y, w] = v.rect;
        const k = w / v.img.naturalWidth; // 战斗图：原图 1 像素＝屏幕上多少
        const auto = p.at[1] === 'top';
        const atY = auto ? ((p.inset ?? 26) - y) / k : p.at[1];
        px = x + p.at[0] * k;
        py = y + atY * k;
        reach = (auto ? (p.rest ?? 600) - atY : (p.reach ?? p.length)) * k;
        // 镜头只拍脸的时候（表盘停的位置落到台词条下面去了）：收掉，不让一条链子横在她脸上
        if (py + reach > ar.height * 0.8 || reach < 60) want = false;
      }
      // 这一组里放下来过：记住，之后一直留着（game.js 每组开头清掉）
      if (want && S.screen === 'hold' && !summoned) S.pendLatch = true;
      const s = reach / p.length; // 怀表图：1 像素＝屏幕上多少
      const pv = p.pivot ?? [img.naturalWidth / 2, 0];
      const geom = {
        width: `${(img.naturalWidth * s).toFixed(1)}px`,
        left: `${(px - pv[0] * s).toFixed(1)}px`,
        top: `${(py - top - pv[1] * s).toFixed(1)}px`,
        transformOrigin: `${(pv[0] * s).toFixed(1)}px ${(pv[1] * s).toFixed(1)}px`,
      };
      const a = watchAngle(p, PD.swing);
      Object.assign(img.style, geom, { transform: `rotate(${a.toFixed(4)}rad)`, opacity: want ? '1' : '0' });
      // 幻影
      const n = want && I.RH.active && ['hold', 'endless', 'execute'].includes(S.screen) ? Math.max(1, Math.min(4, Math.round(I.rhRate?.() ?? 1))) : 1;
      while (PD.ghosts.length < 3) {
        const g = el('img', 'hy-pend hy-pend--ghost');
        g.alt = '';
        g.src = p.src;
        g.style.opacity = '0';
        PD.box.insertBefore(g, img);
        PD.ghosts.push({ node: g, swing: { a: 0, last: 0 } });
      }
      PD.ghosts.forEach((g, i) => {
        const on = i < n - 1;
        // 没露面的幻影也跟着算摆角：露出来的那一刻已经在该在的位置上
        const ga = watchAngle(p, g.swing, (i + 1) / Math.max(n, i + 2));
        Object.assign(g.node.style, geom, { transform: `rotate(${ga.toFixed(4)}rad)`, opacity: on ? String(0.34 - i * 0.06) : '0' });
      });
      Object.assign(PD, { at: [px, py], reach, angle: a, shown: want, face: (p.face ?? p.length * 0.135) * s });
    }
    /** 把怀表叫出来 sec 秒（没在画面上就放下来）：出在怀表上的题用；这张图没配怀表就返回 false */
    function watchSummon(sec = 0.7) {
      if (!cfg().pendulum) return false;
      PD.summonUntil = Math.max(PD.summonUntil, performance.now() + sec * 1000);
      return true;
    }
    I.watchSummon = watchSummon;

    /**
     * 怀表的表盘现在在屏幕上哪儿、多大（app 坐标，r＝表盘半径）：叠在前面的那只（fx.pendulum）优先，其次图里画着的那只（fx.watch，face＝表盘半径，原图像素）。
     * 看不到（镜头没拍到、被收掉了）返回 null。出在怀表上的题（challenge.js 的 place: "watch"）每帧来问
     */
    function watchPoint() {
      const ar = appRect();
      const inView = (q) => (q.x > 10 && q.x < ar.width - 10 && q.y > 56 && q.y < ar.height - 110 ? q : null);
      if (cfg().pendulum && PD.box && !PD.box.hidden && PD.shown) {
        return inView({ x: PD.at[0] - PD.reach * Math.sin(PD.angle), y: PD.at[1] + PD.reach * Math.cos(PD.angle), r: PD.face });
      }
      const w = cfg().watch;
      const c = cfg().anchors?.watch;
      const v = w && Array.isArray(w.pivot) && Array.isArray(c) && MV.active ? visibleStandee() : null;
      if (!v) return null;
      const [x, y, wd] = v.rect;
      const k = wd / v.img.naturalWidth;
      const a = watchRest(w) + HY.watch.a;
      const [dx, dy] = [c[0] - w.pivot[0], c[1] - w.pivot[1]];
      const ix = w.pivot[0] + dx * Math.cos(a) - dy * Math.sin(a);
      const iy = w.pivot[1] + dx * Math.sin(a) + dy * Math.cos(a);
      return inView({ x: x + ix * k, y: y + iy * k, r: (w.face ?? 28) * k });
    }
    I.watchPoint = watchPoint;

    /** 响指：下暗示、触发暗示的那一声「啪」——白光一闪、画面一震、螺旋猛转一下 */
    function snap({ text } = {}) {
      play('响指');
      I.shake();
      HY.sp.phase += 0.35;
      const f = el('div', 'fx-flash fx-flash--white');
      layer.append(f);
      run(f, [{ opacity: 0 }, { opacity: 0.55, offset: 0.12 }, { opacity: 0 }], { duration: 320 });
      // text 写 ""＝不蹦字（剧情里的倒数、被命令的选择：画面上已经有大字了）
      if (text !== '') ono({ text: text ?? (I.hasPool('拟声-响指') ? line('拟声-响指') : I.tr('啪！')), at: 'face', big: true });
    }

    // ----- 催眠状态、剧情里的倒数、被命令的选择、幻化 -----
    // 催眠状态（站主 2026-10-03：组与组之间不要把螺旋加在立绘上，加在背景上）：剧情 / 暂停 / 选项画面里，她身后的背景上转着螺旋。
    // 画法和战斗里是同一个着色器（game.js 的立绘着色器：给它一张 1×1 的透明图，只剩背景那层螺旋）——按设备像素现画，没有锯齿
    // （站主 2026-10-03：原来是一张 2D 画布画好再放大着转，边缘有锯齿）。中心跟着她的眼睛，浓度＝HY.trance
    const AS = { R: null, ok: null, x: null, y: null, phase: 0, k: 0 };
    function advSpiralInit() {
      AS.ok = false;
      try {
        const cv = document.createElement('canvas');
        cv.className = 'hy-adv-spiral';
        const R = I.createRenderer(cv);
        const dot = document.createElement('canvas');
        dot.width = dot.height = 1;
        I.upload(R.texImg, dot, { premultiply: true }, R.gl);
        I.upload(R.texMask, dot, { premultiply: false }, R.gl);
        AS.R = R;
        AS.ok = true;
      } catch (e) {
        I.emit('fx', { error: `剧情背景的螺旋初始化失败：${e.message}` });
      }
      return AS.ok;
    }
    function advSpiralFrame(dt) {
      const scr = S.screen;
      const on = !!hy() && HY.trance > 0 && !reduce.matches && (scr === 'story' || scr === 'pause' || scr === 'choice');
      if (!on && !AS.R) return;
      if (AS.ok === null && !advSpiralInit()) return;
      if (!AS.ok) return;
      const cv = AS.R.canvas;
      if (!cv.isConnected) {
        const adv = app.querySelector('#adv');
        adv?.insertBefore(cv, adv.querySelector('#stand-her'));
      }
      AS.k += ((on ? Math.min(0.8, HY.trance * 1.6) : 0) - AS.k) * Math.min(1, dt * 4);
      cv.hidden = AS.k < 0.004;
      if (cv.hidden) return;
      const v = visibleStandee();
      const p = v ? anchor('eyes') : { x: appRect().width / 2, y: appRect().height * 0.3 };
      const k = AS.x === null ? 1 : Math.min(1, dt * 6);
      AS.x = (AS.x ?? p.x) + (p.x - (AS.x ?? p.x)) * k;
      AS.y = (AS.y ?? p.y) + (p.y - (AS.y ?? p.y)) * k;
      AS.phase = (AS.phase + dt * 0.3) % 1000;
      const base = hy().spiral ?? {};
      I.drawStandee(AS.R, { naturalWidth: 1, naturalHeight: 1 }, [AS.x - 0.5, AS.y - 0.5, 1, 1], {
        pose: { showX: 0, showY: 0, breathS: 0, hair: 0, upper: 0 },
        spiral: {
          alpha: AS.k, wash: 0, phase: AS.phase, mode: base.mode ?? 0, arms: base.arms ?? 2, twist: base.twist ?? 4, soft: base.soft ?? 0,
          center: [0.5, 0.5], eyes: [0.5, 0.5], face: [0, 0],
          c1: hexRgb(base.c1, [1, 0.37, 0.66]), c2: hexRgb(base.c2, [0.043, 0.043, 0.07]),
        },
      });
    }
    T.on('trance', ({ wash }) => (HY.trance = Math.max(0, Math.min(1, Number(wash) || 0))));
    T.on('screen', ({ screen }) => {
      if (!hy()) return;
      if (screen === 'brief') HY.trance = 0;
      // 进了战斗就算催眠状态（重来、直接进无尽战斗的没看开场，暂停画面照样带着螺旋）
      if (screen === 'prep' && hy().trance > 0) HY.trance = Math.max(HY.trance, hy().trance);
    });
    /**
     * 剧情里的倒数（game.js storyCount）：每个数——心跳、数字那里一圈粉环、魅了往上推、她在耳边数（池「开场-倒数」，没有用「倒计时」）；
     * 数到 0：响指、整屏一闪、心形环扩开，从这一刻起是催眠状态（她身上的螺旋）
     */
    T.on('storycount', ({ left, from, trance }) => {
      const r = appRect();
      const x = r.width / 2;
      const y = r.height * 0.3;
      CH.beat = 1;
      if (left > 0) {
        // 数的时候怀表的特写不收（数到 0 那一句才收）
        if (CU.open && CU.loop) CU.keepLine = true;
        play('心跳');
        charmBoost(0.1);
        pulseRing(x, y, { size: 90, end: 300 + (from - left) * 40, duration: 900, color: '#ff6fae', core: 'rgb(43 13 51 / 0.45)', width: 3 });
        const pool = I.hasPool('开场-倒数') ? '开场-倒数' : '倒计时';
        whisper({ text: line(pool, { n: left }), at: 'face', style: '倒计时', size: 20 + (from - left) * 2, hold: 1000 });
        return;
      }
      snap({ text: '' });
      charmBoost(0.4);
      HY.trance = trance === undefined || trance === true ? Math.max(0.3, hy()?.trance ?? 0) : Math.max(0, Number(trance) || 0);
      HY.sp.center = hyPoint('eyes');
      pulseRing(x, y, { size: 90, end: r.width * 1.6, duration: 900, color: '#fff6d8', core: 'rgb(0 0 0 / 0)', width: 5 });
      heartRing(x, y, { size: 80, to: 6, duration: 1300, tone: 'rose' });
      heartRing(x, y, { size: 80, to: 4, delay: 200, duration: 1100, tone: 'purple' });
      heartSpray(x, y, { count: 14, spread: 220, rise: 160, size: [12, 28], duration: [1000, 1600], delay: 100 });
    });
    /**
     * 被命令的选择（game.js toFakeChoice 的 forced）：响指 +「命令」大字（order），洗脑进度冲到 100% 盖章；
     * willing＝命令还没下玩家就自己选了饶过——不放命令，进度照样到 100%
     */
    T.on('forced', ({ order, willing }) => {
      if (hy()?.progress) {
        HY.wash.forced = true;
        washPop({ hold: 6 });
      }
      HY.trance = Math.max(HY.trance, 0.45);
      if (willing) return;
      snap({ text: '' });
      charmBoost(0.5);
      if (order) command({ text: order, hold: 3.2, reward: false, sound: false, y: 0.3 });
    });
    /**
     * 幻化（定时演出，006）：把按钮上的字换掉——字抖几下、糊开、换成新的。现在只做放弃按钮：
     *   { fx: "幻化", text: "长按获胜", pill: "获胜", rule: { quit: 0.6 } }——整条上的字 / 前段小药丸上的字 / 顺手改的规则；
     * 换了之后规则 quitWin 生效（按下去照样是放弃，她的台词换成笑你的那几池）。这一组结束自己变回来
     */
    /**
     * 这份委托的混乱长什么样（hypno.confuse { ghost, focusY, back }，006）：ghost 晃在前面的那几张用哪张图（不写＝全身立绘——
     * 在近景里点到诱饵时不能用近景，放大三倍是一整片肤色）、focusY 对准原图高度的百分之几、back 背后叠的那张图。别的委托返回空，照原样
     */
    const confuseLook = () => {
      const c = hy()?.confuse;
      return c ? { ghost: c.ghost ?? Q().art?.standee?.her?.faces?.normal, focusY: c.focusY, back: c.back, ghostOpacity: c.ghostOpacity } : {};
    };
    const MQ = { saved: null };
    const quitLabels = () => [app.querySelector('#quit-bar .slab-body .sticker'), app.querySelector('#quit-pill > span')];
    function morphNode(node, swap, ms = 560) {
      if (!node) return;
      if (reduce.matches) return void swap();
      node.animate(
        [
          { translate: '0 0', filter: 'blur(0) hue-rotate(0deg)', scale: '1' },
          { translate: '-3px 1px', offset: 0.1 },
          { translate: '3px -1px', offset: 0.2 },
          { translate: '-3px 0', offset: 0.3 },
          { translate: '2px 1px', filter: 'blur(3px) hue-rotate(70deg)', scale: '1.12', offset: 0.46 },
          { translate: '-2px -1px', filter: 'blur(3px) hue-rotate(-70deg)', scale: '1.12', offset: 0.56 },
          { translate: '0 0', filter: 'blur(0) hue-rotate(0deg)', scale: '1' },
        ],
        { duration: ms, easing: 'ease-in-out' },
      );
      setTimeout(swap, ms * 0.5);
    }
    function morphQuit({ text, pill, rule } = {}) {
      if (!text || S.screen !== 'hold') return;
      lureOff();
      const [bar, small] = quitLabels();
      MQ.saved ??= [bar?.textContent ?? '', small?.textContent ?? ''];
      play('魅惑闪光');
      charmBoost(0.15);
      morphNode(bar, () => bar && I.sticker(bar, String(text)));
      morphNode(small, () => small && (small.textContent = String(pill ?? text)));
      app.querySelector('#quit')?.setAttribute('data-morph', '');
      I.setRules({ ...(rule && typeof rule === 'object' ? rule : {}), quitWin: true });
      const r = app.querySelector(app.querySelector('#quit')?.dataset.state === 'pill' ? '#quit-pill' : '#quit-bar')?.getBoundingClientRect();
      const ar = appRect();
      if (r?.width) pulseRing(r.left - ar.left + r.width / 2, r.top - ar.top + r.height / 2, { size: r.width * 0.5, end: r.width * 1.4, duration: 900, color: '#ff6fae', core: 'rgb(255 61 139 / 0.25)', width: 3, squash: Math.max(0.25, r.height / r.width) * 1.6 });
    }
    function morphQuitOff() {
      if (!MQ.saved) return;
      lureOff();
      const [bar, small] = quitLabels();
      if (bar) I.sticker(bar, MQ.saved[0]);
      if (small) small.textContent = MQ.saved[1];
      MQ.saved = null;
      app.querySelector('#quit')?.removeAttribute('data-morph');
    }
    T.on('screen', ({ screen }) => screen !== 'hold' && morphQuitOff());
    T.on('set', () => morphQuitOff());
    // 假装无尽的揭穿（站主 2026-10-03：原来是突然黑屏，太突兀）：幻觉散掉——和第 3 组把数字幻化成字是同一个手法。
    //   pre（露出真面目前 0.35 秒）：HUD 的 ∞、「无尽模式」牌、秒数一起抖、糊开；糊得最厉害的那一下 game.6051d2b93f.js 换成真的（4/4、倒数）
    //   off：模式牌的位置砸一枚 reveal 的字（「第 4 组」），秒数弹一下、一圈粉环
    //   skip（站主 2026-10-03：整组都装成无尽，秒数时不时跳大一截）：pre 只糊秒数；到点秒数弹一下、一圈粉环。
    //   不标「+35」这种跳了多少的字（站主：直接跳一下就行，更像中间那段记忆没了）
    T.on('guise', ({ state, reveal, skip }) => {
      if (S.screen !== 'hold') return;
      if (state === 'skip') {
        const p = clockPoint();
        clockPop(1.6);
        CH.beat = 1;
        charmBoost(0.12);
        pulseRing(p.x, p.y, { size: 50, end: 260, duration: 700, color: '#ff6fae', width: 3 });
        return;
      }
      if (state === 'pre') {
        play('魅惑闪光');
        charmBoost(skip ? 0.08 : 0.2);
        if (reduce.matches) return;
        const frames = [
          { translate: '0 0', filter: 'blur(0) hue-rotate(0deg)' },
          { translate: '-3px 1px', offset: 0.12 },
          { translate: '3px -1px', offset: 0.24 },
          { translate: '-3px 0', filter: 'blur(1px) hue-rotate(20deg)', offset: 0.36 },
          { translate: '2px 1px', filter: 'blur(5px) hue-rotate(80deg)', offset: 0.5 },
          { translate: '-2px -1px', filter: 'blur(3px) hue-rotate(-60deg)', offset: 0.64 },
          { translate: '0 0', filter: 'blur(0) hue-rotate(0deg)' },
        ];
        if (!skip) for (const sel of ['#hud-set', '.mode-tag']) app.querySelector(sel)?.animate(frames, { duration: 700, easing: 'ease-in-out' });
        // 秒数自己靠 translate 定位：只糊、不挪
        app.querySelector('#clock')?.animate(frames.map(({ translate, ...rest }) => rest), { duration: 700, easing: 'ease-in-out' });
        return;
      }
      if (state !== 'off') return;
      const p = clockPoint();
      clockPop(1.7);
      CH.beat = 1;
      pulseRing(p.x, p.y, { size: 50, end: 300, duration: 800, color: '#ff6fae', width: 3 });
      if (reveal) ono({ text: String(reveal), point: { x: 104, y: (app.querySelector('.hud')?.getBoundingClientRect().bottom ?? 48) - appRect().top + 52 }, big: true });
    });
    // 出在怀表上的题：照命令点了＝服从一次（洗脑进度涨一点）；诱饵点了＝上钩——全屏混乱 seconds 秒（顺序题里点到诱饵的那一套，
    // 站主 2026-10-03：后面的顺序题难，要难在这阵混乱上，不是靠多几个数字和翻面），忍住了她哼一声
    T.on('challenge', ({ state, phrase, watch, x, y, seconds }) => {
      if (!hy()) return;
      // 题出在怀表上：开着的特写、cut-in 先收掉，别把表挡住
      if (state === 'show' && watch) {
        closeupClose();
        if (VC.open) vclipLeave();
      }
      if (state === 'obeyed' && hy()?.progress) {
        HY.wash.obey++;
        washPop({ hold: 1.8 });
      }
      if (state === 'lured') {
        if (hy()?.progress) {
          HY.wash.obey += 2;
          washPop({ hold: 2.6 });
        }
        charmBoost(0.35);
        confuse(x ?? appRect().width / 2, y ?? appRect().height / 2, Math.max(1, Number(seconds) || 9), confuseLook());
        if (I.hasPool('诱饵-上钩')) setTimeout(() => S.screen === 'hold' && shout({ text: line('诱饵-上钩') }), 300);
      }
      if (state === 'resisted' && I.hasPool('诱饵-忍住')) whisper({ text: line('诱饵-忍住'), at: 'lips', hold: 1600 });
      // 文字顺序题点完：那句话变成他自己的心声
      // 纯数字的（008 的「3、2、1」）不算一句话，不冒
      if (state === 'hit' && phrase && !/^\d+$/.test(phrase)) vertical({ text: `${phrase}……` });
      if (state === 'morph') {
        const f = el('div', 'fx-flash');
        layer.append(f);
        run(f, [{ opacity: 0 }, { opacity: 0.3, offset: 0.2 }, { opacity: 0 }], { duration: 420 });
      }
    });
    I.command = command;
    /** 空白（记忆断片）：响指一响，眼前黑掉 hold 秒再亮回来——这段时间里秒数被动了手脚（超时的 rewind / count 另写） */
    const BK = { node: null, token: 0 };
    async function blank({ hold = 1.2, text } = {}) {
      const token = ++BK.token;
      snap({});
      if (!BK.node) BK.node = el('div', 'fx-blank');
      BK.node.replaceChildren();
      if (text) BK.node.append(el('p', 'fx-blank-text', String(text)));
      app.append(BK.node);
      requestAnimationFrame(() => BK.node.classList.add('is-on'));
      await sleep(Math.max(0.3, Number(hold) || 1.2) * 1000);
      if (BK.token !== token) return;
      BK.node.classList.remove('is-on');
    }
    T.on('screen', () => {
      BK.token++;
      BK.node?.classList.remove('is-on');
    });

    /** 变速：seconds 秒里滑块（和怀表）比平时快——暗示被触发了。节奏轨泛粉、旁边一枚「加速」小签 */
    function boost({ mult = 2, hold = 4, text } = {}) {
      const b = I.rhBoost({ mult, seconds: hold });
      if (!b) return;
      const rail = app.querySelector('#rhythm');
      rail?.classList.add('rhythm--boost');
      if (text) whisper({ text, at: 'lips', hold: 1600 });
    }
    T.on('boost', ({ state }) => state === 'end' && app.querySelector('#rhythm')?.classList.remove('rhythm--boost'));
    T.on('screen', () => app.querySelector('#rhythm')?.classList.remove('rhythm--boost'));

    // ----- 洗脑进度 -----
    /** 现在到百分之几：这一组开头到结尾在 progress.sets 的两格之间走，加上点「遵命」攒的；没被处决之前最多 99 */
    function washValue() {
      const p = hy()?.progress;
      if (!p) return 0;
      const W = HY.wash;
      if (S.screen === 'executed' || W.done || W.forced) return 100;
      if (W.broken) return 0;
      const sets = Array.isArray(p.sets) ? p.sets : [];
      const n = Math.max(1, S.set || 1);
      const from = sets[n - 2] ?? 0;
      const to = sets[n - 1] ?? from;
      const tgt = I.target() || 1;
      const k = S.screen === 'hold' ? Math.min(1, S.elapsed / tgt) : S.screen === 'pass' || S.screen === 'pause' || S.screen === 'clear' ? 1 : 0;
      let base = Math.min(99, from + (to - from) * k + W.obey * (p.obey ?? 2));
      // 输掉之后（结算、处决）不退回这一组开头：停在打到的那个数上
      if (['hold', 'pass', 'pause', 'clear'].includes(S.screen)) W.reach = base;
      else if (['fall', 'lose', 'retreat', 'execute'].includes(S.screen) && W.reach != null) base = W.reach;
      if (S.screen === 'execute') {
        W.execFrom ??= base;
        const secs = exCfg().seconds ?? 10;
        const e = S.exec?.stage === 'count' ? Math.min(1, S.elapsed / secs) : 0;
        return W.execFrom + (100 - W.execFrom) * e * e;
      }
      return base;
    }
    function washEl() {
      const W = HY.wash;
      if (W.el) return W.el;
      const p = hy()?.progress ?? {};
      const box = el('div', 'hy-bar');
      box.innerHTML = '<p class="hy-bar-head"><span class="hy-bar-label"></span><b class="hy-bar-pct">0%</b></p><div class="hy-bar-track"><i></i></div><span class="hy-bar-stamp"></span>';
      box.querySelector('.hy-bar-label').textContent = I.tr(p.label ?? '洗脑进度');
      box.querySelector('.hy-bar-stamp').textContent = I.tr(p.done ?? '洗脑完成');
      app.append(box);
      W.el = box;
      return box;
    }
    /** 弹出来 hold 秒 */
    function washPop({ hold = 2.6 } = {}) {
      if (!hy()?.progress) return;
      washEl();
      HY.wash.until = Math.max(HY.wash.until, performance.now() + Math.max(0.6, Number(hold) || 2.6) * 1000);
    }
    function washFrame(dt) {
      const W = HY.wash;
      if (!W.el) return;
      const now = performance.now();
      const always = S.screen === 'execute' && S.exec?.stage === 'count';
      const on = always || S.screen === 'executed' || now < W.until;
      const v = washValue();
      W.shown += (v - W.shown) * Math.min(1, dt * (always ? 12 : 4));
      W.el.classList.toggle('is-on', on);
      if (!on && W.el.dataset.pct === undefined) return;
      const pct = Math.round(Math.min(100, W.shown));
      if (W.el.dataset.pct !== String(pct)) {
        W.el.dataset.pct = String(pct);
        W.el.querySelector('.hy-bar-pct').textContent = `${pct}%`;
        W.el.querySelector('i').style.transform = `scaleX(${(pct / 100).toFixed(3)})`;
      }
      // 盖「洗脑完成」的章：败北处决数到 0，或者假通关里被命令的那一下（forced）；真的打完最后一组＝解除（broken，条退回 0）
      const done = S.screen === 'executed' || !!W.forced;
      const state = done ? 'done' : W.broken ? 'broken' : '';
      if (state !== (W.state ?? '')) {
        W.state = state;
        W.done = S.screen === 'executed';
        W.el.classList.toggle('is-done', done);
        W.el.classList.toggle('is-broken', state === 'broken');
        const p = hy()?.progress ?? {};
        if (done) W.shown = 100;
        W.el.querySelector('.hy-bar-label').textContent = I.tr(done ? (p.done ?? '洗脑完成') : state === 'broken' ? (p.broken ?? '洗脑解除') : (p.label ?? '洗脑进度'));
      }
    }
    T.on('obey', () => {
      if (!hy()?.progress) return;
      HY.wash.obey++;
      washPop({ hold: 2.2 });
    });
    T.on('pass', () => washPop({ hold: 3 }));
    T.on('screen', ({ screen }) => {
      if (!hy()) return;
      const W = HY.wash;
      if (screen === 'pause') washPop({ hold: 5 });
      if (screen === 'execute') {
        W.execFrom = null;
        washEl();
      }
      if (screen === 'prep') W.reach = null;
      // 真的全部通过（假通关之后的那几组也打完了）：洗脑解除，条退回 0
      if (screen === 'clear' && I.revealed() && W.forced) {
        W.forced = false;
        W.broken = true;
        washPop({ hold: 5 });
      }
      // 新的一趟：从头攒
      if (screen === 'brief' || (screen === 'prep' && S.set === 1 && !S.endless)) {
        W.obey = 0;
        W.shown = 0;
        W.until = 0;
        W.execFrom = null;
        W.forced = false;
        W.broken = false;
      }
    });

    // ----- 开关面板 -----
    const swDefs = () => (Array.isArray(hy()?.switches) ? hy().switches.filter((d) => d && typeof d.key === 'string') : []);
    /** 这一组开头的状态：面板默认的，盖上 sets[n].switches */
    function swReset() {
      const init = Object.fromEntries(swDefs().map((d) => [d.key, !!d.on]));
      const over = S.endless ? Q().endless?.switches : I.setCfg().switches;
      HY.sw.state = { ...init, ...(over && typeof over === 'object' ? over : {}) };
    }
    function swEl() {
      const SW = HY.sw;
      if (!SW.el) {
        SW.el = el('div', 'hy-sw');
        app.append(SW.el);
      }
      const rows = swDefs()
        .map((d) => `<p class="hy-sw-row" data-key="${d.key}" data-state="${SW.state[d.key] ? 'on' : 'off'}"><span>${I.tr(d.key)}</span><b class="hy-chip hy-chip--on">ON</b><b class="hy-chip hy-chip--off">OFF</b></p>`)
        .join('');
      SW.el.innerHTML = `<p class="hy-sw-head"><i></i>${I.tr(hy()?.panel ?? '催眠 · 执行中')}</p>${rows}<p class="hy-sw-read"><span>${I.tr('催眠深度')}</span><b>Lv.${Math.max(1, S.set || 1)}</b></p>`;
      return SW.el;
    }
    /**
     * 拨一个开关：面板从左边滑出来，那一行亮起、咔地翻过去，停 hold 秒收回。
     * rule＝这一拨改的规则（game.js 的 setRules：swap 常识替换 / quit 放弃要按多久的倍数 / shame 心声变多），text 她顺口说的那句
     */
    function switchFlip({ key, on = true, rule, hold = 3, text } = {}) {
      if (!swDefs().some((d) => d.key === key)) return;
      const SW = HY.sw;
      const box = swEl();
      clearTimeout(SW.timer);
      box.classList.add('is-on');
      const row = [...box.querySelectorAll('.hy-sw-row')].find((r) => r.dataset.key === key);
      setTimeout(() => {
        if (!row?.isConnected) return;
        play('开关');
        SW.state[key] = !!on;
        row.dataset.state = on ? 'on' : 'off';
        row.classList.add('is-hot');
        if (!reduce.matches) row.animate([{ scale: '1.12' }, { scale: '1' }], { duration: 300, easing: 'ease-out' });
        if (rule && typeof rule === 'object') I.setRules(rule);
        charmBoost(0.12);
        CH.beat = 1;
        if (text) whisper({ text, at: 'lips', hold: 1800 });
      }, 520);
      SW.timer = setTimeout(() => box.classList.remove('is-on'), 520 + Math.max(1, Number(hold) || 3) * 1000);
    }
    T.on('screen', ({ screen }) => {
      if (!hy()) return;
      if (screen === 'prep') swReset();
      if (screen !== 'hold' && screen !== 'endless') {
        clearTimeout(HY.sw.timer);
        HY.sw.el?.classList.remove('is-on');
      }
    });

    // ----- 环字、字墙 -----
    /** 取几句短的拼成一圈 / 一行：池不写用委托的 hypno.words，再没有用「言责-勾引」 */
    const hyWords = (pool, n, max = 6) => Array.from({ length: n }, () => shortLine(pool ?? hy()?.words ?? '言责-勾引', max));
    /** 环字：两圈字绕着螺旋中心反着转，停 hold 秒（0＝到这一组结束） */
    function ringText({ text, pool, hold = 8 } = {}) {
      if (reduce.matches) return;
      HY.ring?.node.remove();
      const node = el('div', 'hy-ring');
      const a = text ? Array(6).fill(String(text)) : hyWords(pool, 5);
      const b = text ? Array(8).fill(String(text)) : hyWords(pool, 7);
      node.innerHTML = `<svg viewBox="-100 -100 200 200"><defs><path id="hy-ring-a" d="M0,-46 a46,46 0 1,1 -0.01,0"/><path id="hy-ring-b" d="M0,-68 a68,68 0 1,1 -0.01,0"/></defs>
        <g class="hy-ring-ga"><text class="hy-ring-ta"><textPath href="#hy-ring-a">${a.join(' ・ ')} ・ </textPath></text></g>
        <g class="hy-ring-gb"><text class="hy-ring-tb"><textPath href="#hy-ring-b">${b.join(' ・ ')} ・ </textPath></text></g></svg>`;
      charm.insertBefore(node, heartsCanvas);
      HY.ring = { node, until: Number(hold) > 0 ? performance.now() + Number(hold) * 1000 : Infinity };
      requestAnimationFrame(() => node.classList.add('is-on'));
    }
    /** 字墙：同一个词铺满整屏，五行各往各的方向跑，停 hold 秒 */
    function wallText({ text, pool, hold = 3.2 } = {}) {
      if (reduce.matches) return;
      HY.wall?.node.remove();
      const word = text ? String(text) : hyWords(pool, 1, 5)[0];
      const node = el('div', 'hy-wall');
      node.innerHTML = Array.from({ length: 5 }, (_, i) => `<p class="hy-wall-row" style="--dir:${i % 2 ? 1 : -1};--dur:${7 + i * 1.3}s"><span>${`${word}　`.repeat(8)}</span><span>${`${word}　`.repeat(8)}</span></p>`).join('');
      charm.insertBefore(node, heartsCanvas);
      HY.wall = { node, until: performance.now() + Math.max(0.8, Number(hold) || 3.2) * 1000 };
      play('魅惑闪光');
      requestAnimationFrame(() => node.classList.add('is-on'));
    }
    function fadeOut(slot) {
      const o = HY[slot];
      if (!o) return;
      HY[slot] = null;
      o.node.classList.remove('is-on');
      setTimeout(() => o.node.remove(), 500);
    }
    T.on('screen', () => {
      fadeOut('ring');
      fadeOut('wall');
    });

    /** 每帧：进度条、环字跟着螺旋中心、到点收掉 */
    function hypnoFrame(dt) {
      if (hy()) {
        pendulumFrame();
        advSpiralFrame(dt);
        washFrame(dt);
      } else if (!HY.ring && !HY.wall) return;
      // 环字、字墙不只催眠用：008 罚时里的定时演出也放（没有 hypno 配置，环字绕着她的眼睛转）
      const now = performance.now();
      if (HY.ring) {
        const p = spiralPoint();
        HY.ring.node.style.left = `${p.x.toFixed(1)}px`;
        HY.ring.node.style.top = `${p.y.toFixed(1)}px`;
        if (now >= HY.ring.until) fadeOut('ring');
      }
      if (HY.wall && now >= HY.wall.until) fadeOut('wall');
      // 同一时刻只有一个主角：有题在场时环字、字墙退到很淡（别盖住章），字墙在场时环字让一让
      const busy = !!I.challenge?.active?.();
      HY.ring?.node.classList.toggle('is-dim', busy || !!HY.wall);
      HY.wall?.node.classList.toggle('is-dim', busy);
    }

    // ---------- 总表 ----------

    const EFFECTS = {
      拟声: (o = {}) => ono({ pool: choice(['拟声-魅惑', '拟声-吐息', '拟声-心跳']), at: choice(['chest', 'face']), ...o }),
      耳语: () => whisper(),
      气泡: () => bubble(),
      大字: () => shout(),
      竖排: () => vertical(),
      思绪: () => thoughts(),
      魅惑闪光: () => allure(),
      '特写-胸': () => closeup('chest'),
      '特写-胸-循环': () => closeup('chest', { loop: true }),
      '特写-胸-横': () => closeup('chestSide'),
      '特写-胸-横-循环': () => closeup('chestSide', { loop: true }),
      '特写-臀': () => closeup('hips'),
      '特写-臀-循环': () => closeup('hips', { loop: true }),
      '特写-眼': () => closeup('eyes'),
      '特写-唇': () => closeup('lips'),
      '特写-腿': () => closeup('legs'),
      '特写-腿-循环': () => closeup('legs', { loop: true }),
      心章: () => heartStamp(),
      唇印: (o = {}) => lips(o),
      集中线: (o = {}) => focusLines(o),
      命令: (o = {}) => command(o),
      闭眼: (o = {}) => blind(o),
      寸止: (o = {}) => edge(o),
      呼吸: (o = {}) => breathSync(o),
      奖励: () => rewardCutin(),
      吐息: () => breath(),
      // 只在定时演出（script）里用的：视频 cut-in、换台词条、放弃按钮上挂一个「0」
      报数: (o = {}) => baoshu(o),
      '特写-嘴': (o = {}) => stillCloseup('mouth', o),
      '特写-靴底': (o = {}) => stillCloseup('sole', o),
      '特写-凝视': (o = {}) => stillCloseup('gaze', o),
      '特写-双格': (o = {}) => splitCloseup(o),
      爱心爆发: (o = {}) => heartBurst(o),
      // 双轨（005「同时用两只手~」）：左边复制一条导轨，mode sync 同步 / offset 左右错开，到这一组结束
      双轨: (o = {}) => I.rhMirror(o.mode === 'offset' ? 'offset' : 'sync'),
      哨子: (o = {}) => whistle(o),
      // 催眠（006）
      '特写-怀表': () => closeup('watch'),
      '特写-怀表-循环': () => closeup('watch', { loop: true }),
      响指: (o = {}) => snap(o),
      空白: (o = {}) => blank(o),
      变速: (o = {}) => boost(o),
      进度: (o = {}) => washPop(o),
      开关: (o = {}) => switchFlip(o),
      环字: (o = {}) => ringText(o),
      字墙: (o = {}) => wallText(o),
      幻化: (o = {}) => morphQuit(o),
      视频: (o = {}) => vclip(o),
      台词条: (o = {}) => I.sayCue(o),
      '诱惑-放弃': (o = {}) => quitLure(o),
    };

    // 别的脚本自己接的定时演出（card.js：吸取 / 交易 / 夺卡）：这里不放、也不报「没有这个演出」
    I.ownFx = new Set();
    // 给别的脚本放演出用（card.js 用它放交易的奖励静图）
    I.fx = (name, opts) => trigger(name, opts);
    // card.js（007）借的几样：她身上某个锚点在画面上的位置、唇印的图（卡上留着的口红印）、一撮心、拟声字、魅了临时加深
    I.anchorPoint = (name) => anchor(name);
    I.lipMark = (tone) => lipMark(LIP_COLORS[tone] ?? tone);
    I.heartSpray = (x, y, opts) => heartSpray(x, y, opts);
    /** 一颗带光的心（滑块到顶那种；tone: pink / rose / purple / black）——21 点的魔法拿去飞 */
    I.heartEl = (opts) => heartEl(opts);
    I.ono = (opts) => ono(opts);
    I.charmBoost = (amount) => charmBoost(amount);

    function trigger(name, opts = {}) {
      const known = EFFECTS[name] || name.startsWith('拟声-');
      if (!known) return I.emit('fx', { error: `没有这个演出：${name}` });
      I.emit('fx', { name });
      if (FLOATS[name]) return FLOATS[name](opts);
      if (CLOSEUPS[name]) return closeup(CLOSEUPS[name][0], { loop: CLOSEUPS[name][1], ...opts });
      if (name.startsWith('拟声-')) return ono({ pool: name, ...opts });
      return EFFECTS[name](opts);
    }

    // ---------- 演出表：从一格里抽一个放 ----------

    /** fx 按权重抽一个名字；写的是组名（fx.groups）就在那一组里平均再挑一个 */
    function pickFx(weights) {
      // 挑战在场（challenge.js）：不开始新的特写——特写框占大半屏，会把题挡住。组里的特写也跳过；
      // 已经开着一个特写（定时演出里停着的那种）时也不抽特写，抽了也放不出来
      // 定时的大框几秒内要来也不抽（bigCueSoon），免得刚出来就被顶掉
      const noCloseup = I.challenge?.active?.() || CU.open || VC.open || bigCueSoon();
      const groups = cfg().groups ?? {};
      const members = (n) => (Array.isArray(groups[n]) && groups[n].length ? groups[n] : null);
      // 同一种浮现文字叠太多会糊成一片：气泡、大字同时只留一个，竖排（心声）最多两条
      const crowded = { 气泡: '.fl-bubble', 大字: '.fl-shout' };
      const usable = (n) =>
        !(noCloseup && isBig(n)) &&
        !(crowded[n] && layer.querySelector(crowded[n])) &&
        !(n === '竖排' && layer.querySelectorAll('.fl-heart').length >= 2);
      const entries = Object.entries(weights ?? {}).filter(([n, w]) => w > 0 && (members(n) ? members(n).some(usable) : usable(n)));
      const total = entries.reduce((a, [, w]) => a + w, 0);
      if (!total) return null;
      let r = Math.random() * total;
      let name = entries.at(-1)[0];
      for (const [n, w] of entries) {
        r -= w;
        if (r <= 0) {
          name = n;
          break;
        }
      }
      return members(name) ? choice(members(name).filter(usable)) : name;
    }

    /** 各个时机里拟声词放在哪、大不大，抽中之后默认等多久（格里写了 delay 就用格里的） */
    const FIRE_CTX = {
      director: { delay: 0, ono: {} },
      phase: { delay: 500, ono: { at: 'chest', big: true } },
      rhythm: { delay: 0, ono: { at: 'chest' } },
      beat: { delay: 0, ono: { at: 'chest' } },
      countdown: { delay: 350, ono: { at: 'face', big: true } },
      release: { delay: 200, ono: {} },
      talk: { delay: 0, ono: {} },
    };

    /**
     * 按台词池取演出的字。池可以写一个池名 / 几个池名的数组 / { 池名: 权重 }（game.js 的 pick 认这三种，言责池会加后缀）。
     * 思绪要几句：池里一项本来就是「／」隔开的一组就用它，不是（比如言责池）就从池里连取三句
     */
    function textFor(name, spec) {
      if (name === '大字') return shortLine(spec, 8);
      if (name !== '思绪') return line(spec);
      const first = String(I.pick(spec));
      if (/[／/]/.test(first)) return first;
      const group = [first];
      for (let k = 0; k < 6 && group.length < 3; k++) {
        const t = String(I.pick(spec));
        if (!group.includes(t)) group.push(t);
      }
      return group.join('／');
    }

    /** 按一格放：抽演出、套这一格的台词池（pools）和文字样式（looks）、等 delay 毫秒 */
    function fire(cell, ctx = 'director') {
      // 闭眼的时候不抽（暗幕盖着，放了也白放；声音还会吵）
      if (app.dataset.blind) return null;
      const name = pickFx(cell?.fx);
      if (!name) return null;
      const c = FIRE_CTX[ctx] ?? FIRE_CTX.director;
      const pool = cell.pools?.[name];
      let opts = {};
      if (name.startsWith('拟声')) opts = { ...c.ono, ...(pool ? { pool } : {}) };
      else if (pool && (FLOATS[name] || CLOSEUPS[name] || name === '集中线' || name === '命令')) opts = { text: textFor(name, pool) };
      if (cell.looks?.[name] && FLOATS[name]) opts.look = cell.looks[name];
      const delay = cell.delay ?? c.delay;
      if (delay > 0) setTimeout(() => I.inBattle() && trigger(name, opts), delay);
      else trigger(name, opts);
      return name;
    }

    /**
     * 定时演出的一条（quest-<编号>.jsonc 的 sets[n - 1].script）：fx 演出名；text 直接写的字（优先）/ pool 台词池（一个或几个）；
     * look / size 浮现文字的样式和字号；color 唇印颜色；hold 特写停几秒——带「循环」的写 0＝一直停到这组结束，开着时各段照样抽别的演出。
     * 已经开着别的特写时，定时的特写先把它收起再切进来
     */
    async function playCue(cue, set = S.set, waited = 0) {
      const name = cue?.fx;
      if (!name || !I.inBattle() || S.set !== set) return;
      // 定时出题（挑战-点击 / 挑战-按住 / 挑战-拖动）归 challenge.js；别的脚本自己接的（I.ownFx）归它们
      if (name.startsWith('挑战-') || I.ownFx.has(name)) return;
      // 挑战在场时特写不切进来：等题做完再放（还在这一组的话）
      // 等了 6 秒题还在：这一条不放了（拖到很后面才冒出来反而不对劲）
      if ((CLOSEUPS[name] || isStill(name)) && I.challenge?.active?.()) return void (waited < 6 && setTimeout(() => playCue(cue, set, waited + 0.4), 400));
      const opts = {};
      const pool = cue.pool;
      if (cue.text) opts.text = String(cue.text);
      else if (pool && name.startsWith('拟声')) opts.pool = pool;
      else if (pool) opts.text = textFor(name, pool);
      for (const k of ['look', 'size', 'color']) if (cue[k] !== undefined) opts[k] = cue[k];
      if (SCRIPT_ONLY.has(name)) {
        for (const k of ['src', 'still', 'focus', 'zoom', 'pan', 'ease', 'show', 'hitAt', 'side', 'hold', 'sound', 'soundAt', 'pool', 'outro', 'count', 'in', 'out', 'style', 'seconds', 'whisper', 'whisperEvery', 'mode', 'long', 'peakHit', 'vframe', 'vcam', 'rate', 'snap', 'quiet', 'key', 'on', 'rule', 'mult', 'pill']) if (cue[k] !== undefined) opts[k] = cue[k];
        // 环字：写了 pool 就一圈里放几句不同的（不用上面按池取的那一句）
        if (name === '环字' && !cue.text) delete opts.text;
        if (name === '台词条' && !cue.text && pool) opts.text = line(pool);
        if (name === '诱惑-放弃') delete opts.text;
      }
      if (name.startsWith('拟声')) Object.assign(opts, { at: 'chest', big: true, ...opts });
      if (name === '命令' && cue.sound) opts.sound = cue.sound;
      if (name === '命令') for (const k of ['hold', 'y']) if (cue[k] !== undefined) opts[k] = cue[k];
      // 视频写了 hitAt：按这一组的秒数换成绝对时刻对齐——片子里踩中那一帧落在 at + hitAt 秒上（开播慢一拍也校得回来）
      if (name === '视频' && cue.src && cue.hitAt != null && Number.isFinite(cue.at)) opts.sync = { at: performance.now() + (cue.at + cue.hitAt - S.elapsed) * 1000, t: cue.hitAt };
      // then：大框（特写、视频）放到头的那一刻接着放的几条（at＝之后几秒；挑战也行）——比写死秒数稳，前面被题拖住也不会错位
      if ((isStill(name) || name === '视频') && Array.isArray(cue.then)) opts.onPeak = () => thenCues(cue.then, set);
      // 嘴 / 靴底特写（静图，005）：点名哪种呈现（variant）、停几秒、推近、取景、摇镜头、哪边进、音效都能单独写
      if (isStill(name)) for (const k of ['variant', 'show', 'pan', 'ease', 'hold', 'zoom', 'focus', 'side', 'sound', 'peakHit']) if (cue[k] !== undefined) opts[k] = cue[k];
      if (CLOSEUPS[name]) {
        if (cue.hold !== undefined) opts.hold = cue.hold;
        if (cue.tight !== undefined) opts.tight = cue.tight;
        if (CLOSEUPS[name][1] && cue.hold === 0) opts.pinned = true;
        // 开着别的大框：等它露够（spotWait），视频 / 静图往一边退出去，特写收起，再切进来
        if (CU.open || VC.open) {
          const w = spotWait();
          if (w > 0) {
            await sleep(w);
            if (!I.inBattle() || S.set !== set) return;
          }
          if (VC.open) vclipLeave();
          if (CU.open) {
            closeupClose();
            await CU.done;
            if (!I.inBattle()) return;
          }
        }
      }
      trigger(name, opts);
      // 刚放了定时的，随机抽的先让一让
      D.busyUntil = Math.max(D.busyUntil, performance.now() / 1000 + 1.5);
    }

    function thenCues(list, set) {
      for (const c of list) setTimeout(() => I.inBattle() && S.set === set && I.emit('cue', { cue: c }), Math.max(0, Number(c?.at) || 0) * 1000);
    }

    // ---------- 各段：战斗中每隔几秒从演出表那一格抽一个 ----------

    // 各段（early / mid / late / endless）每隔 every 秒从那一格抽一个；first 进战斗后多久开始、jitter 间隔随机浮动（stage 顶上）
    const D = { enabled: true, next: 0, busyUntil: 0, beats: 0, top: 0, bottom: 0 };
    /** 这一格现在几秒抽一个：写了 everyTo 就从这一段开头的 every 慢慢变到段末的 everyTo（越来越密） */
    function everyNow(cell) {
      if (!(cell.everyTo > 0) || S.screen !== 'hold') return cell.every;
      const b = I.bounds();
      const [s, e] = { early: [0, b.early], mid: [b.early, b.mid], late: [b.mid, 1] }[S.phase] ?? [0, 1];
      const k = Math.min(1, Math.max(0, (S.elapsed / I.target() - s) / Math.max(0.001, e - s)));
      return cell.every + (cell.everyTo - cell.every) * k;
    }
    /**
     * 言责（各段格里的 talk）：和上面抽演出分开的一条线，专放台词类的浮现（耳语 / 气泡 / 大字 / 竖排 / 思绪 / 拟声）。
     * 每 every 秒（写了 everyTo 就越来越密）抽一个；特写开着也照样说（字压在特写上面），cut-in、长按放弃、余韵时停
     */
    const TK = { next: 0 };
    function talkFrame() {
      // 超时里出的题（描「0」这种占大半个画面的）在场时也不抽，别盖住轨道
      if (!D.enabled || !I.inBattle() || S.freeze || S.press || S.cutinBusy || S.finishLeft > 0 || VC.open || (S.over && I.challenge?.active?.())) return;
      const talk = I.stageCell(S.screen === 'endless' ? 'endless' : S.phase).talk;
      const now = performance.now() / 1000;
      if (!(talk?.every > 0)) {
        TK.next = 0;
        return;
      }
      if (!TK.next) TK.next = now + Math.min(2.5, talk.every);
      if (now < TK.next) return;
      const jitter = Q().stage?.jitter ?? 0.35;
      TK.next = now + everyNow(talk) * rand(1 - jitter, 1 + jitter);
      fire(talk, 'talk');
      // 羞耻心关掉了（006 的规则开关 shame）：她每说一句，他自己的心声也跟着冒一句
      if (S.rules?.shame && layer.querySelectorAll('.fl-heart').length < 2) setTimeout(() => I.inBattle() && vertical(), 500);
    }
    function directorFrame(dt) {
      if (!D.enabled || !I.inBattle() || S.freeze || S.press || S.cutinBusy || (CU.open && !CU.pinned) || S.finishLeft > 0 || VC.open || (S.over && I.challenge?.active?.())) return;
      const st = Q().stage ?? {};
      const cell = I.stageCell(S.screen === 'endless' ? 'endless' : S.phase);
      const now = performance.now() / 1000;
      if (!D.next) D.next = now + (st.first ?? 4);
      if (now < D.next || now < D.busyUntil) return;
      const jitter = st.jitter ?? 0.35;
      D.next = now + (cell.every > 0 ? everyNow(cell) : 8) * rand(1 - jitter, 1 + jitter);
      if (!(cell.every > 0)) return;
      if (fire(cell, 'director')) D.busyUntil = now + 1.5;
    }

    // ---------- 接事件 ----------

    const on = T.on;
    // 闭眼：每到一端，暗幕里那句字轻轻一跳
    on('rhythm', () => {
      const p = app.dataset.blind && BL.node?.firstElementChild;
      if (p && !reduce.matches) p.animate([{ scale: '1.06' }, { scale: '1' }], { duration: 260, easing: 'ease-out' });
    });
    // 换画面（组结束、暂停、结算）：闭眼的暗幕退掉，寸止 / 呼吸交还节奏轨
    on('screen', () => {
      blindEnd();
      BR.token++;
      I.rhRelease();
    });
    on('screen', ({ screen }) => {
      D.next = 0;
      TK.next = 0;
      D.top = 0;
      D.bottom = 0;
      if (screen !== 'hold') app.querySelector('#clock')?.classList.remove('clock--allure');
      if (screen === 'brief') CH.boost = 0;
      // 选项画面（开场选择、最后一击）：剧情最后一句带的特写还停着的话会挡住按钮，一起收起
      if (CU.loop || screen === 'choice') closeupClose();
    });
    // 剧情走到下一句：收起停着的循环特写（这一句自己的 fx 在 line 之后才触发，不会被收掉）
    // 下一句写的还是同一个循环特写（keepLine，见下面 storyfx）：不收，一直停着
    on('line', ({ who }) => {
      if (!who) return;
      if (CU.keepLine) return void (CU.keepLine = false);
      if (CU.closeOnLine) closeupClose();
    });
    // 切阶段（演出表 toMid / toLate）：cut-in 切进来时冒 ono 那个池的拟声词，切阶段那一刻按格抽 fx
    const phaseCell = () => I.stageCell(S.phase === 'mid' ? 'toMid' : 'toLate');
    on('cutin', ({ state }) => {
      const pool = phaseCell().ono;
      if (state === 'in' && pool) setTimeout(() => ono({ pool, at: 'chest' }), 300);
    });
    on('phase', ({ phase }) => phase !== 'early' && fire(phaseCell(), 'phase'));
    // 节奏到顶 / 到底（stage.top / bottom）：每 every 下、按 chance 抽一个
    on('rhythm', ({ edge }) => {
      if (!I.inBattle()) return;
      const cell = I.stageCell(edge === 'top' ? 'top' : 'bottom');
      if (!(cell.every > 0)) return;
      const n = edge === 'top' ? ++D.top : ++D.bottom;
      if (n % cell.every === 0 && Math.random() < (cell.chance ?? 1)) fire(cell, 'rhythm');
    });
    // 心跳（stage.beat）：in 那几段里，每 every 下抽一个
    on('beat', ({ phase }) => {
      if (S.screen === 'execute') return void (CH.beat = 1);
      const cell = I.stageCell('beat');
      if (!(cell.in ?? ['late']).includes(phase)) return;
      CH.beat = 1;
      if (cell.every > 0 && ++D.beats % cell.every === 0) fire(cell, 'beat');
    });
    // 长按放弃又松手（stage.release）：按到 min 以上才算差点放弃——魅了加深 boost、按格抽 fx
    on('press', ({ state, progress }) => {
      const cell = I.stageCell('release');
      if (state === 'release' && progress >= (cell.min ?? 0.2)) {
        charmBoost(cell.boost ?? 0.3);
        fire(cell, 'release');
      }
    });
    on('second', ({ left }) => left !== undefined && S.screen === 'hold' && countdownTick(left));
    // 定时演出（sets[n - 1].script）：到点放那一条
    on('cue', ({ cue }) => playCue(cue));
    // 挑战：练习题失手也会被趁虚而入——魅了加深
    on('challenge', ({ state, practice, kind, x, y }) => {
      if (state === 'miss' && practice) charmBoost(Q().challenge?.practiceBoost ?? 0.2);
      if (state === 'hit' && kind === '顺序' && x !== undefined) zeroHearts(x, y);
    });
    on('challenge', ({ state, x, y, seconds }) => state === 'decoy' && confuse(x, y, seconds, confuseLook()));
    on('screen', () => clearConfuse());

    /**
     * 点到顺序题的诱饵：全屏「混乱」seconds 秒（默认 6.4：站主 2026-09-18 说 3.2 秒太短、碰不到下一波，加倍）（站主 2026-09-17：不直接输，给一段很强的干扰；
     * 第二版站主：认不清也没关系，点到诱饵本来就相当于输了，做强一点）。
     *   一下紫色硬闪 + 画面一震
     *   紫黑暗角罩住整个画面，像心跳一样一胀一缩
     *   三张半透明的她（战斗图放大、紫调、滤色叠加）：左右两张挡在最前面来回晃，正中一张更大、贴着脸和胸慢慢推
     *   整个画面重度紫色模糊（最重 4px）、发艳、对比拉高、色相来回偏（起头最重，慢慢轻一点）
     *   题目那一层大幅左右上下晃、转——手指要追着章点
     * 限时照走；混乱压在题的上面但不挡手指。再点到诱饵从那一下重新算。减少动态时只有紫色罩子
     */
    const CF = { box: null, anims: [], timer: 0 };
    function clearConfuse() {
      clearTimeout(CF.timer);
      for (const a of CF.anims) a.cancel();
      CF.anims = [];
      CF.box?.remove();
      CF.box = null;
    }
    function confuse(x, y, seconds = 6.4, { ghost, focusY = 50, back, ghostOpacity = 1 } = {}) {
      charmBoost(Q().challenge?.['顺序']?.decoyCharm ?? 0.25);
      play('心跳');
      heartSpray(x, y, { count: 18, spread: 150, rise: 40, size: [12, 30], duration: [600, 1100], tones: ['purple', 'black', 'purple'] });
      pulseRing(x, y, { size: 30, end: 320, duration: 700, color: '#a86bff', core: 'rgb(43 13 51 / 0.6)', width: 4 });
      clearConfuse();
      const ms = seconds * 1000;
      const inAt = Math.min(0.3, 160 / ms);
      const outAt = Math.max(inAt + 0.05, 1 - 600 / ms);
      const box = el('div', 'fx-confuse');
      const tint = el('div', 'fx-confuse-tint');
      box.append(tint);
      // ghost：晃在前面的那几张她用哪张图（不写＝现在的战斗图。006 在近景里点到诱饵时传全身那张：近景放大三倍是一整片肤色，把题全盖没了）
      // focusY：那几张图以原图高度的百分之几为中心放大（不写＝正中，全身立绘就是胯；006 写 27＝胸口）；
      // back：最底下再叠一张半透明的图慢慢推近（006：眼睛发光的那张脸，催眠感）
      const src = ghost || app.querySelector('#art .framed')?.currentSrc;
      const fy = Math.max(0, Math.min(100, Number(focusY) || 50));
      let backImg = null;
      if (back) {
        backImg = el('img', 'fx-confuse-back');
        backImg.src = back;
        backImg.alt = '';
        box.append(backImg);
      }
      // [立绘, 左右, 起止放大, 透明度]：左右两张挡在前面晃，正中一张更大
      const ghosts = [];
      if (src && !reduce.matches) {
        for (const [side, scale, opacity] of [[0, [2.6, 3], 0.38], [-1, [1.85, 2.1], 0.55], [1, [1.9, 2.15], 0.5]]) {
          const g = el('img', 'fx-confuse-ghost');
          g.src = src;
          g.alt = '';
          // ghostOpacity：这几张图整体再淡多少（对准胸口时是一大片亮色，滤色叠上去会把题盖白）
          g.style.opacity = String(opacity * (Number(ghostOpacity) || 1));
          g.style.transformOrigin = `50% ${fy}%`;
          box.append(g);
          ghosts.push([g, side, scale]);
        }
      }
      app.append(box);
      CF.box = box;
      const anims = [box.animate([{ opacity: 0 }, { opacity: 1, offset: inAt }, { opacity: 1, offset: outAt }, { opacity: 0 }], { duration: ms, fill: 'both' })];
      if (!reduce.matches) {
        I.shake();
        const flash = place(el('div', 'fx-strobe'), 0, 0);
        run(flash, [{ opacity: 0, background: '#6b2fb3' }, { opacity: 0.55, offset: 0.12 }, { opacity: 0 }], { duration: 380, easing: 'ease-out' });
        anims.push(tint.animate([{ opacity: 0.8 }, { opacity: 1 }], { duration: 560, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));
        if (backImg) anims.push(backImg.animate([{ transform: 'translate(-50%, -50%) scale(1)' }, { transform: 'translate(-50%, -50%) scale(1.16)' }], { duration: ms, easing: 'ease-out', fill: 'both' }));
        for (const [g, side, [s0, s1]] of ghosts) {
          const frames = side
            ? [
                { transform: `translate(-50%, -${fy}%) translateX(${side * 90}px) scale(${s0}) rotate(${side * -6}deg)` },
                { transform: `translate(-50%, -${fy}%) translateX(${side * -45}px) scale(${s1}) rotate(${side * 5}deg)` },
              ]
            : [{ transform: `translate(-50%, -${fy - 4}%) scale(${s0}) rotate(-2deg)` }, { transform: `translate(-50%, -${fy + 4}%) scale(${s1}) rotate(2deg)` }];
          anims.push(g.animate(frames, { duration: side < 0 ? 1100 : side > 0 ? 1450 : 1900, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' }));
        }
        anims.push(
          app.animate(
            [
              { filter: 'none' },
              { filter: 'blur(4px) hue-rotate(-45deg) saturate(2.1) contrast(1.15)', offset: inAt },
              { filter: 'blur(3.4px) hue-rotate(40deg) saturate(1.9) contrast(1.1)', offset: (inAt + outAt) / 2 },
              { filter: 'blur(2.6px) hue-rotate(-25deg) saturate(1.7)', offset: outAt },
              { filter: 'none' },
            ],
            { duration: ms, easing: 'ease-in-out' },
          ),
        );
        const chal = app.querySelector('.chal-layer');
        if (chal) {
          anims.push(
            chal.animate(
              [{ transform: 'none' }, { transform: 'translate(20px, -11px) rotate(3.5deg)', offset: 0.3 }, { transform: 'translate(-18px, 12px) rotate(-3deg)', offset: 0.7 }, { transform: 'none' }],
              { duration: 780, iterations: Math.max(1, Math.round(ms / 780)), easing: 'ease-in-out' },
            ),
          );
        }
      }
      CF.anims = anims;
      CF.timer = setTimeout(() => CF.box === box && clearConfuse(), ms + 60);
    }
    /**
     * 顺序题点到最后的「0」：从那枚章上炸开一波爱心（站主 2026-09-17：点到 0 要有诱惑的感觉）。
     * 粉色冲击环 + 两圈心形环 + 一大把心 + 画面下缘往上飘的小心；魅了加深 challenge.顺序.charm。
     * 再「被魅惑干扰一下下」（站主：想要粉色的闪，但不要晃眼睛）：不整屏闪白，改成——
     *   粉色从画面四边往里渗两下（像心跳「咚、咚」，中间一直是透明的，亮度不跳）
     *   同时整个画面失焦、发艳两下（blur 1.4px + 饱和度），立绘出一层双影
     * 眼睛不会被刺到（没有整屏变亮），但手指正要点下一题时画面糊了一下，就是那一下干扰
     */
    function zeroHearts(x, y) {
      charmBoost(Q().challenge?.['顺序']?.charm ?? 0.08);
      play('心跳');
      if (reduce.matches) return;
      const r = appRect();
      zeroDaze();
      pulseRing(x, y, { size: 30, end: 340, duration: 760, color: '#ff6fae', core: 'rgb(255 61 139 / 0.32)', width: 4 });
      pulseRing(x, y, { size: 30, end: 210, delay: 120, duration: 660, color: '#ffffff', core: 'rgb(255 159 203 / 0.22)', width: 2 });
      // 章的位置先弹出一颗大实心心：鼓起来、跳一下、淡掉
      const big = heartEl({ size: 120, ring: false, tone: 'pink' });
      place(big, x, y);
      run(
        big,
        [
          { transform: 'translate(-50%, -50%) scale(0.2)', opacity: 0 },
          { transform: 'translate(-50%, -50%) scale(1.25)', opacity: 1, offset: 0.25 },
          { transform: 'translate(-50%, -50%) scale(0.95)', opacity: 1, offset: 0.45 },
          { transform: 'translate(-50%, -50%) scale(1.1)', opacity: 0.9, offset: 0.6 },
          { transform: 'translate(-50%, -62%) scale(1.5)', opacity: 0 },
        ],
        { duration: 900, easing: 'cubic-bezier(.3,.7,.3,1)' },
      );
      heartRing(x, y, { size: 80, to: 3.4, delay: 60, duration: 860, tone: 'pink' });
      heartRing(x, y, { size: 56, to: 4.6, delay: 220, duration: 980, tone: 'rose' });
      heartSpray(x, y, { count: 26, spread: 200, rise: 110, size: [16, 40], duration: [850, 1500], tones: ['pink', 'rose', 'pink', 'purple'] });
      for (let i = 0; i < 7; i++) {
        heartSpray(r.width * (0.1 + (0.8 * i) / 6) + rand(-20, 20), r.height + 10, { count: 1, spread: 20, rise: r.height * rand(0.35, 0.6), size: [12, 22], duration: [1300, 1900], delay: 80 + i * 70, tones: ['pink', 'rose'] });
      }
      CH.beat = Math.max(CH.beat, 0.6);
    }

    function zeroDaze() {
      const beats = [{ opacity: 0 }, { opacity: 0.85, offset: 0.16 }, { opacity: 0.25, offset: 0.36 }, { opacity: 0.7, offset: 0.52 }, { opacity: 0 }];
      run(place(el('div', 'fx-daze'), 0, 0), beats, { duration: 1100, easing: 'ease-in-out' });
      app.animate(
        [
          { filter: 'none' },
          { filter: 'blur(1.4px) saturate(1.35)', offset: 0.16 },
          { filter: 'blur(0.3px) saturate(1.1)', offset: 0.36 },
          { filter: 'blur(1.1px) saturate(1.3)', offset: 0.52 },
          { filter: 'none' },
        ],
        { duration: 1000, easing: 'ease-in-out' },
      );
      if (MV.active) {
        tween(
          1100,
          (k) => (MAIN.echo = echoCurve(k, { strength: 0.9, grow: [0.05, 0.1], linger: 1 })),
          () => (MAIN.echo = [1, 0, 1, 0]),
        );
      }
    }
    on('pass', () => {
      app.querySelector('#clock')?.classList.remove('clock--allure');
      if ((cfg().countdown ?? {}).burstOnPass === true) setTimeout(allure, 60);
    });
    // ---------- 视频 / 静图 cut-in（定时演出「视频」）----------
    // 竖的视频片段（包里的 clip-*.mp4，静音）或一张静图（still，慢慢推近）装进和特写一样的斜切大框里，从一边切进来，放完收回去。
    // cue：{ "fx": "视频", "src": "clip-003-kiss1.15f8d14b34.mp4" 或 "still": "clip-003-head.517aebb21a.webp", "zoom": [起, 止]（静图推近，默认 [1, 1.1]）,
    //        "text": 框下面的字, "side": "right" | "left", "hold": 最多停几秒（静图就是停几秒）, "sound": 音效槽, "soundAt": 第几秒响, "outro": "kiss"（收尾时框上印唇印） }
    // 框从 HUD 下面一直到台词条上面（比胸 / 臀特写大）；开着时秒数和节奏轨压在框上面
    // 开着的时候不开特写、不抽随机演出；已经开着的特写先收掉。
    // 视频直接用文件地址放（线上的 CSP 只许同站地址，blob: 会被拦掉，只剩一个空框——站主 2026-09-17 发现）；进委托先把文件请求一遍，落进浏览器缓存
    const SCRIPT_ONLY = new Set(['视频', '台词条', '诱惑-放弃', '闭眼', '寸止', '呼吸', '报数', '双轨', '哨子', '响指', '空白', '变速', '进度', '开关', '环字', '字墙', '幻化']);
    const VC = { box: null, box2: null, open: false, token: 0, req: 0, parts: [], warmed: new Set() };
    // 大框的露脸下限（站主 2026-09-23：可以一个没放完下一个就来，但不要前一个刚探出来一瞬间就被盖住）：
    // 胸 / 臀 / 眼特写（CU）和视频、静图 cut-in（VC）都是占大半屏的框，同一时间只露一个。新来的定时大框等前一个露够
    // fx.cutinMin 秒（默认 1.8）再进，前一个往自己那一边退出去、新的同时切进来；随机抽的看到几秒内有定时的大框要来就不抽（bigCueSoon）
    const SPOT = { at: 0 };
    function spotWait() {
      if (!VC.open && !CU.open) return 0;
      return Math.max(0, SPOT.at + (cfg().cutinMin ?? 1.8) * 1000 - performance.now());
    }
    function clipSources() {
      const q = Q();
      const out = new Set();
      const take = (c) => {
        if (c?.fx !== '视频') return;
        if (c.src) out.add(c.src);
        if (c.still) out.add(c.still);
      };
      for (const set of q.sets ?? []) {
        for (const c of set?.script ?? []) take(c);
        for (const st of Array.isArray(set?.overtime) ? set.overtime : []) {
          for (const c of st?.script ?? []) take(c);
          take(st?.rewardCue);
        }
      }
      for (const c of rewardCutins()) out.add(c.src ?? c.still);
      for (const key of Object.keys(STILL_DEF)) if ((cfg().closeup ?? {})[key]?.still) out.add(cfg().closeup[key].still);
      if (q.execute?.finale?.src) out.add(q.execute.finale.src);
      return [...out].filter(Boolean);
    }
    function preloadClips() {
      for (const src of clipSources()) {
        if (VC.warmed.has(src)) continue;
        VC.warmed.add(src);
        fetch(src).then((r) => r.blob()).catch(() => {});
      }
    }
    /*
     * 视频 / 静图 cut-in 的呈现（show，站主 2026-09-23：cut-in 多几种不同的出法）：
     *   slide  默认：斜切大框从 side 那一边滑进来
     *   slam   砸进来：框从镜头前放大着砸下来、白光一闪、画面震一下（靴底）
     *   band   横条：一道斜切的宽横条横穿画面，只露焦点那一小块（贴得最近）
     *   heart  心形窗：从中间「啵」地弹出一个心形的窗，里面是画面
     *   split  上下双格：上格一张（从右边进）、下格一张（从左边进，晚 0.2 秒），中间一道斜缝——second 写下格
     *   full   整屏：框铺满 HUD 下面到放弃按钮上面、左右到边，边框加粗，砸进来（站主 2026-09-24：第 2 组的靴底要更有冲击力）
     * peakHit：静图放到头的那一刻重重地「踩中」一下（vclipHit big）；sync { at: 绝对时刻 ms, t: 片子里的秒数 }：
     *   视频开播后把进度校到「at 那一刻正好放到 t」，音效和踩中那一下也按 at 放（处决收尾：踩到底正好落在数到 0）
     * 静图还能写 pan：一串焦点 [[x, y], [x, y, 时刻 0–1], …]（原图像素），镜头沿着它们摇过去；zoom [起, 止] 同时推近 / 拉远；
     * ease 推近 / 摇的快慢（in 越来越快（逼近）、out 先快后慢、inout、linear）
     */
    async function vclip({ src, still, zoom = [1, 1.1], focus, pan, ease, text, side = 'right', hold, sound, soundAt = 0, hitAt, outro, keepCloseup = false, reward = false, beat, show = 'slide', second, onPeak, peakHit = false, sync, vframe, vcam, rate, stompAt } = {}) {
      if (!src && !still) return;
      // 露脸下限（SPOT）：前一个大框露出来还不到 cutinMin 秒，等够了再进；等的时候又来了新的，新的顶上、这一条作罢
      const req = ++VC.req;
      const screen = S.screen;
      const wait = VC.open || (CU.open && !keepCloseup) ? spotWait() : 0;
      if (wait > 0) {
        await sleep(wait);
        if (VC.req !== req || S.screen !== screen) return;
      }
      // 写了 hitAt 的视频（踩中要对准秒数的）：晚进来的那一截从片子里跳过，踩中、音效还落在定好的秒数上；别的视频从头放
      const late = src && wait > 0 && hitAt != null ? Math.min(wait / 1000, 1.2) : 0;
      if (CU.open && !keepCloseup) {
        closeupClose();
        await CU.done;
        if (VC.req !== req) return;
      }
      // 前一个还开着（已经露够了）：它往自己那一边退出去，新的同时切进来——叠一下，不是一下子换掉
      if (VC.open) vclipLeave();
      const token = ++VC.token;
      const split = show === 'split' && !!(second?.still || second?.src);
      const parts = [{ box: vcBox(0), src, still, focus, zoom, pan, ease, beat, side, show: split ? 'split-a' : show, text, beats: 0, vframe, vcam, rate, stompAt }];
      if (split) parts.push({ box: vcBox(1), zoom: [1, 1.1], ...second, side: 'left', show: 'split-b', text: null, beats: 0 });
      else if (VC.box2) VC.box2.hidden = true;
      for (const p of parts) vcLoad(p, { reward, late });
      VC.open = true;
      VC.parts = parts;
      for (const p of parts) p.box.hidden = false;
      SPOT.at = performance.now();
      app.dataset.vclip = '';
      await Promise.all(parts.map(vcFit));
      if (VC.token !== token) return;
      parts.forEach(vcEnter);
      CH.boost = Math.min(0.8, CH.boost + 0.15);
      if (sync && src) {
        // 按绝对时刻对齐：音效和踩中那一下在 sync.at 放；视频开播后把进度校过去（手机上开播慢一拍也能对上）
        const wait = Math.max(0, sync.at - performance.now());
        if (sound) setTimeout(() => VC.token === token && play(sound), wait);
        setTimeout(() => VC.token === token && vclipHit(parts[0].box, { big: true }), wait);
        const video = parts[0].box.querySelector('video');
        const align = () => {
          if (VC.token !== token) return;
          const want = sync.t - (sync.at - performance.now()) / 1000;
          if (want >= 0 && want < (video.duration || 99) && Math.abs(video.currentTime - want) > 0.05) video.currentTime = want;
        };
        video.addEventListener('playing', align, { once: true });
        setTimeout(align, 350);
        setTimeout(align, Math.max(0, wait - 250));
      } else {
        if (sound) setTimeout(() => VC.token === token && play(sound), Math.max(0, soundAt - late) * 1000);
        // hitAt：片子里「踩中」那一下（秒）——框往镜头冲、白光、画面震
        if (hitAt != null) setTimeout(() => VC.token === token && vclipHit(parts[0].box, { big: true }), Math.max(0, hitAt - late) * 1000);
      }
      const limit = Math.max(0.3, (hold ?? (src ? 8 : 3)) - late) * 1000;
      for (const p of parts) stillMotion(p, limit);
      if (src) {
        // 不等 play()：放不出来（省电模式、后台）时它可能一直不返回，框也得按时收
        const video = parts[0].box.querySelector('video');
        video.play().catch(() => {});
        vcamRun(video, parts[0].vcam, parts[0].rate);
        const ended = new Promise((ok) => (video.onended = ok));
        await Promise.race([ended, sleep(limit)]);
      } else await sleep(limit);
      if (VC.token !== token) return;
      // 放到头的那一刻（收尾之前）：peakHit 重重踩一下；定时演出写的 then 从这里接着放
      if (peakHit) vclipHit(parts[0].box, { big: true });
      onPeak?.();
      // 收尾（站主：放完卡一下就消失太生硬）：粉光一闪，画面往外鼓一下化成残影散开，心从框里涌出来、一圈粉环；亲的片段在框上印一个唇印
      if (!reduce.matches) await Promise.all(parts.map((p, i) => vclipOutro(p.box, { video: p.src ? p.box.querySelector('video') : null, kiss: i === 0 && outro === 'kiss', quiet: i > 0 })));
      if (VC.token !== token) return;
      for (const p of parts) {
        p.box.hidden = true;
        p.box.querySelector('video')?.pause();
      }
      VC.open = false;
      VC.parts = [];
      VC.keepFor = null;
      delete app.dataset.vclip;
    }

    /**
     * 视频的运镜（008 起）：vcam 是一串关键帧 [{ at 片子里第几秒, zoom 放大, x, y 往哪边挪（框宽高的 %，负＝往左 / 往上挪画面，露出右边 / 下面）, ease }]，
     * 按片子的时间推近、摇过去（rate 放慢的话跟着拉长）。和 vframe 叠着用：vframe 是起始的取景，vcam 在它上面动
     */
    function vcamRun(video, vcam, rate = 1) {
      if (!Array.isArray(vcam) || vcam.length < 2 || reduce.matches) return;
      const keys = vcam.filter((k) => k && Number.isFinite(Number(k.at))).sort((a, b) => a.at - b.at);
      const end = Number(keys.at(-1).at) || 1;
      const tf = (k) => `translate(${Number(k.x) || 0}%, ${Number(k.y) || 0}%) scale(${Math.max(0.5, Number(k.zoom) || 1)})`;
      const frames = keys.map((k) => ({ offset: Math.min(1, Math.max(0, k.at / end)), transform: tf(k), easing: k.ease ?? 'ease-in-out' }));
      if (frames[0].offset > 0) frames.unshift({ offset: 0, transform: tf(keys[0]) });
      video.style.transformOrigin = '50% 50%';
      video.animate(frames, { duration: (end / Math.max(0.25, Number(rate) || 1)) * 1000, fill: 'forwards' });
    }

    /** cut-in 的框：0 是主框，1 是双格的下格；第一次要时建 */
    function vcBox(n) {
      const key = n ? 'box2' : 'box';
      if (!VC[key]) {
        const box = el('div', 'vclip');
        box.hidden = true;
        box.innerHTML =
          '<div class="closeup-edge"></div><div class="closeup-media"><video muted playsinline preload="auto" disablepictureinpicture></video><img class="vclip-still" alt="" hidden></div><p class="closeup-line"><span class="sticker sticker--large"></span></p>';
        app.append(box);
        VC[key] = box;
      }
      return VC[key];
    }
    /** 往框里装这一格的东西（先不露：visibility hidden，量好取景、入场动画开始时才露） */
    function vcLoad(p, { reward, late }) {
      const { box } = p;
      const video = box.querySelector('video');
      const img = box.querySelector('.vclip-still');
      const lineNode = box.querySelector('.closeup-line');
      box.getAnimations().forEach((a) => a.cancel());
      img.getAnimations().forEach((a) => a.cancel());
      box.dataset.side = p.side === 'left' ? 'left' : 'right';
      box.dataset.show = p.show ?? 'slide';
      box.toggleAttribute('data-reward', !!reward);
      box.style.visibility = 'hidden';
      lineNode.hidden = !p.text;
      if (p.text) I.sticker(lineNode.firstElementChild, String(p.text));
      p.f = Array.isArray(p.focus) ? p.focus : Array.isArray(p.pan?.[0]) ? p.pan[0] : null;
      img._fit = null;
      if (p.src) {
        img.hidden = true;
        video.hidden = false;
        video.muted = true;
        video.getAnimations().forEach((a) => a.cancel());
        video.src = p.src;
        // rate：放慢 / 放快（008）；换 src 会把 playbackRate 重置成 defaultPlaybackRate，两个都设
        video.defaultPlaybackRate = video.playbackRate = Math.max(0.25, Math.min(3, Number(p.rate) || 1));
        video.currentTime = late || 0;
        // vframe { zoom, x, y, pos }：视频在框里的取景——放大 zoom 倍（居中），再挪 x / y（框宽高的 %），pos 是 object-position（上下有富余时用它挪）
        const vf = p.vframe;
        const z = Math.max(1, Number(vf?.zoom) || 1);
        Object.assign(
          video.style,
          vf
            ? { position: 'absolute', width: `${z * 100}%`, height: `${z * 100}%`, left: `${(1 - z) * 50 + (Number(vf.x) || 0)}%`, top: `${(1 - z) * 50 + (Number(vf.y) || 0)}%`, objectPosition: vf.pos ?? '' }
            : { position: '', width: '', height: '', left: '', top: '', objectPosition: '' },
        );
      } else {
        video.pause();
        video.hidden = true;
        img.removeAttribute('style');
        img.classList.toggle('vclip-still--focus', !!p.f);
        img.src = p.still;
        img.hidden = false;
      }
    }
    /** 静图按焦点取景（横条、双格把焦点放在正中，别的放在框的 40% 高） */
    async function vcFit(p) {
      if (p.src || !p.f) return;
      const img = p.box.querySelector('.vclip-still');
      // 等图读好（不用 decode()：页面在后台时它可能一直不回来）
      if (!img.complete || !img.naturalWidth) {
        await new Promise((ok) => {
          img.addEventListener('load', ok, { once: true });
          img.addEventListener('error', ok, { once: true });
          setTimeout(ok, 3000);
        });
      }
      const mid = p.show === 'band' || String(p.show).startsWith('split');
      focusStill(img, p.f, p.zoom?.[0] ?? 1, mid ? 0.5 : 0.4);
    }
    /**
     * 靴底特写的鞋底在画面上现在在哪（立绘档案 fx.closeup.sole.stompAt，原图像素；007 起）：按图此刻的位置算，推近、摇镜头都跟着走。
     * 没写 stompAt、图没按 focus 摆（视频）就是 undefined（照旧落在框中间偏下）；鞋底已经摇出框外是 null（这一下不扬尘）
     */
    function stompPoint(p) {
      if (!Array.isArray(p?.stompAt)) return undefined;
      const img = p.box?.querySelector('.vclip-still--focus');
      if (!img?.naturalWidth) return undefined;
      const r = img.getBoundingClientRect();
      const b = p.box.getBoundingClientRect();
      const x = r.left + (p.stompAt[0] / img.naturalWidth) * r.width;
      const y = r.top + (p.stompAt[1] / img.naturalHeight) * r.height;
      if (x < b.left || x > b.right || y < b.top || y > b.bottom) return null;
      const ar = appRect();
      return { x: x - ar.left, y: y - ar.top };
    }
    function boxCenter(box) {
      const r = box.getBoundingClientRect();
      const ar = appRect();
      return { x: r.left - ar.left + r.width / 2, y: r.top - ar.top + r.height / 2, w: r.width, h: r.height };
    }
    /** 入场：按 show 各有各的出法；双格的下格晚 0.2 秒 */
    function vcEnter(p, i) {
      const { box, show, side } = p;
      box.style.visibility = '';
      if (reduce.matches) return;
      const lineNode = box.querySelector('.closeup-line');
      const delay = i * 200;
      if (show === 'slam' || show === 'full') {
        box.animate([{ transform: 'scale(1.34)', opacity: 0 }, { transform: 'scale(0.97)', opacity: 1, offset: 0.7 }, { transform: 'scale(1)', opacity: 1 }], { duration: 230, easing: 'cubic-bezier(.4,0,.3,1)', fill: 'both' });
        setTimeout(() => vclipHit(box), 170);
      } else if (show === 'heart') {
        box.animate([{ transform: 'scale(0.12) rotate(-14deg)', opacity: 0 }, { transform: 'scale(1.08) rotate(3deg)', opacity: 1, offset: 0.62 }, { transform: 'scale(1) rotate(0deg)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'both' });
        setTimeout(() => {
          const c = boxCenter(box);
          play('魅惑闪光');
          heartRing(c.x, c.y, { size: 70, to: 4, duration: 900 });
          heartSpray(c.x, c.y, { count: 10, spread: c.w * 0.6, rise: 90, size: [12, 26], tones: ['pink', 'rose', 'pink'] });
        }, 220);
      } else {
        const from = side === 'left' ? 'translateX(-110%)' : 'translateX(110%)';
        box.animate([{ transform: from }, { transform: 'translateX(0)' }], { duration: show === 'band' ? 220 : 260, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'both' });
      }
      if (!lineNode.hidden) lineNode.animate([{ opacity: 0, transform: 'skewX(-14deg)' }, { opacity: 1, transform: 'skewX(0)' }], { duration: 200, delay: 180 + delay, fill: 'both' });
    }

    /**
     * 踩中那一下（hitAt、砸进来）：框往镜头冲一下、白光一闪、画面震、框下面扬起一圈尘。
     * big（踩到底：处决收尾、第 2 组的猛踩）：冲得更狠、白光更久、整屏闪一下、两圈尘加一圈粉环、「咚！」
     */
    function vclipHit(box, { big = false } = {}) {
      if (!box || box.hidden) return;
      I.shake();
      CH.beat = 1;
      if (big) {
        charmBoost(0.2);
        setTimeout(() => I.shake(), 120);
      }
      if (reduce.matches) return;
      box.animate(
        big ? [{ scale: '1' }, { scale: '1.12', offset: 0.18 }, { scale: '0.97', offset: 0.5 }, { scale: '1' }] : [{ scale: '1' }, { scale: '1.06', offset: 0.25 }, { scale: '1' }],
        { duration: big ? 460 : 320, easing: 'cubic-bezier(.3,.7,.3,1)' },
      );
      const flash = el('i', 'vclip-bloom vclip-bloom--white');
      box.querySelector('.closeup-media')?.append(flash);
      flash.animate([{ opacity: big ? 1 : 0.9 }, { opacity: 0 }], { duration: big ? 520 : 280, easing: 'ease-out' }).onfinish = () => flash.remove();
      setTimeout(() => flash.remove(), 800);
      const c = boxCenter(box);
      const sp = stompPoint(VC.parts?.find((q) => q.box === box));
      // 鞋底在框里：尘圈从鞋底扬起来；没写 stompAt 照旧在框中间偏下
      const dust = sp ? { x: sp.x, y: sp.y, y2: sp.y } : { x: c.x, y: c.y + c.h * 0.15, y2: c.y + c.h * 0.2 };
      if (sp !== null) pulseRing(dust.x, dust.y, { size: 60, end: c.w * 1.1, duration: 700, color: '#e6e3dc', core: 'rgb(0 0 0 / 0)', width: 3, squash: 0.45 });
      if (!big) return;
      if (sp !== null) pulseRing(dust.x, dust.y2, { size: 90, end: c.w * 1.8, duration: 900, delay: 90, color: '#e6e3dc', core: 'rgb(0 0 0 / 0)', width: 5, squash: 0.4 });
      pulseRing(c.x, c.y, { size: 80, end: c.w * 1.6, duration: 850, color: PINK, width: 4 });
      const f = el('div', 'fx-flash');
      layer.append(f);
      run(f, [{ opacity: 0 }, { opacity: 0.5, offset: 0.1 }, { opacity: 0 }], { duration: 480 });
      ono({ text: I.tr('咚！'), point: { x: c.x, y: c.y + c.h * 0.3 }, big: true });
    }

    /** 框的一份不动的拷贝（视频画进画布、静图带上现在的推近和位置），给残影 / 让位用 */
    function snapshotBox(box, cls) {
      const ghost = box.cloneNode(true);
      ghost.classList.add(cls);
      ghost.style.visibility = '';
      const video = box.querySelector('video');
      const gv = ghost.querySelector('video');
      if (gv) {
        if (!video.hidden && video.videoWidth) {
          const cv = document.createElement('canvas');
          cv.width = video.videoWidth;
          cv.height = video.videoHeight;
          try {
            cv.getContext('2d').drawImage(video, 0, 0);
          } catch {}
          cv.className = 'vclip-canvas';
          cv.style.cssText = video.style.cssText;
          gv.replaceWith(cv);
        } else gv.remove();
      }
      const img = box.querySelector('.vclip-still');
      const gi = ghost.querySelector('.vclip-still');
      if (gi && !img.hidden) {
        const cs = getComputedStyle(img);
        gi.style.scale = cs.scale;
        gi.style.translate = cs.translate;
      }
      ghost.querySelector('.closeup-line')?.remove();
      return ghost;
    }

    /** 正开着的 cut-in 让位给下一个：残影往自己那一边滑出去、淡掉（新的压在它上面切进来），框马上空出来 */
    function vclipLeave() {
      for (const p of VC.parts ?? []) {
        const box = p.box;
        if (!box || box.hidden) continue;
        if (!reduce.matches) {
          const ghost = snapshotBox(box, 'vclip-leave');
          box.before(ghost);
          const to = box.dataset.side === 'left' ? 'translateX(-70%)' : 'translateX(70%)';
          ghost.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: to, opacity: 0 }], { duration: 320, easing: 'cubic-bezier(.5,0,.8,.4)', fill: 'both' }).onfinish = () => ghost.remove();
          setTimeout(() => ghost.remove(), 600);
        }
        box.hidden = true;
        box.querySelector('video')?.pause();
      }
      VC.token++;
      VC.open = false;
      VC.parts = [];
      delete app.dataset.vclip;
    }

    /*
     * 特写框跟着节奏（005 的嘴 / 靴底特写，vclip 的 beat；双格两格各跟各的）：
     *   stomp 每到一次「压」框往镜头冲一下、抖一下，闷响「踩」，鞋底那儿扬起一圈尘——她一下一下踩下来
     *   lick  每到一次「提」框轻轻一颤、粉光一闪、冒两颗心，隔一下「啾」一声
     * 框本身的滑入用的是 transform，这里只动 scale / translate，互不打架
     */
    on('rhythm', ({ edge }) => {
      if (!VC.open || reduce.matches) return;
      for (const p of VC.parts ?? []) {
        const box = p.box;
        if (!p.beat || !box || box.hidden) continue;
        const r = box.getBoundingClientRect();
        const ar = appRect();
        const x = r.left - ar.left + r.width / 2;
        const y = r.top - ar.top + r.height * 0.42;
        if (p.beat === 'stomp' && edge === 'bottom') {
          p.beats++;
          play('踩');
          box.animate([{ scale: '1', translate: '0 0' }, { scale: '1.07', translate: '0 6px', offset: 0.22 }, { scale: '0.99', translate: '0 -2px', offset: 0.6 }, { scale: '1', translate: '0 0' }], { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1)' });
          const sp = stompPoint(p);
          if (sp !== null) pulseRing(sp?.x ?? x, sp?.y ?? y + r.height * 0.12, { size: 50, end: 260, duration: 650, color: '#e6e3dc', core: 'rgb(0 0 0 / 0)', width: 3, squash: 0.45 });
          CH.beat = 1;
          charmBoost(0.02);
        } else if (p.beat === 'lick' && edge === 'top') {
          p.beats++;
          if (p.beats % 2 === 1) play('接触');
          const s = p.show === 'heart' ? '1.06' : '1.035';
          box.animate([{ scale: '1' }, { scale: s, offset: 0.3 }, { scale: '1' }], { duration: 360, easing: 'ease-out' });
          heartSpray(x, y, { count: 3, spread: 60, rise: 50, size: [10, 20], duration: [700, 1000] });
          charmBoost(0.02);
        } else if (p.beat === 'glow' && edge === 'top') {
          // 凝视（006）：每到一次「提」眼睛亮一下——整框提亮、发艳，一圈粉环从框中间扩出去
          p.beats++;
          box.animate([{ filter: 'brightness(1) saturate(1)' }, { filter: 'brightness(1.28) saturate(1.4)', offset: 0.25 }, { filter: 'brightness(1) saturate(1)' }], { duration: 460, easing: 'ease-out' });
          if (p.beats % 2 === 1) pulseRing(x, y, { size: 40, end: r.width * 0.9, duration: 700, color: PINK, core: 'rgb(0 0 0 / 0)', width: 2 });
          CH.beat = 1;
          charmBoost(0.02);
        }
      }
    });

    /**
     * 静图特写（005）：嘴 / 靴底。图和取景在立绘档案的 fx.closeup.mouth / sole（still 图、focus 原图像素的焦点、zoom [起, 止]、hold、side、pool），
     * variants 是几种呈现（show / pan / zoom / ease / hold 盖在上面，name 给定时演出点名用）：随机的时候挑一种、不连着两次同一种；
     * 定时演出那一条写的字段盖在最上面。跟着节奏踩 / 舔（见上面）
     */
    const STILL_LAST = {};
    function stillVariant(key, o) {
      const vars = ((cfg().closeup ?? {})[key]?.variants ?? []).filter((v) => v && typeof v === 'object');
      if (o.variant) return vars.find((v) => v.name === o.variant) ?? null;
      if (!vars.length || o.show || o.pan) return null;
      const pool = vars.length > 1 ? vars.filter((v) => v.name !== STILL_LAST[key]) : vars;
      return choice(pool.length ? pool : vars);
    }
    function stillCloseup(key, o = {}) {
      const base = (cfg().closeup ?? {})[key] ?? {};
      const v = stillVariant(key, o);
      if (v) STILL_LAST[key] = v.name;
      const c = { ...base, ...(v ?? {}), ...o };
      if (!c.still) return;
      const def = STILL_DEF[key] ?? STILL_DEF.mouth;
      return vclip({
        still: c.still,
        focus: Array.isArray(c.pan?.[0]) ? c.pan[0].slice(0, 2) : c.focus,
        pan: c.pan,
        ease: c.ease,
        show: c.show ?? 'slide',
        zoom: c.zoom ?? [1.2, 1.36],
        side: c.side ?? def.side,
        hold: c.hold ?? 3.2,
        text: c.text ?? line(c.pool ?? def.pool),
        beat: c.beat ?? def.beat,
        sound: c.sound,
        outro: c.outro ?? def.outro,
        onPeak: c.onPeak,
        peakHit: !!c.peakHit,
        stompAt: c.stompAt,
      });
    }

    /**
     * 上下双格（「特写-双格」）：立绘档案的 fx.closeup.split { a 上格, b 下格（mouth / sole）, hold, pool, first / second 各格再盖的取景 }，
     * 上格从右边进、下格从左边进，嘴那一格跟「提」舔、靴底那一格跟「压」踩——滑块一上一下，两格轮流动
     */
    function splitCloseup(o = {}) {
      const all = cfg().closeup ?? {};
      const sp = { a: 'mouth', b: 'sole', ...(all.split ?? {}), ...o };
      const cell = (key, over) => {
        const c = { ...(all[key] ?? {}), ...(over ?? {}) };
        return { still: c.still, focus: Array.isArray(c.pan?.[0]) ? c.pan[0].slice(0, 2) : c.focus, zoom: c.zoom, pan: c.pan, ease: c.ease, beat: key === 'sole' ? 'stomp' : 'lick', stompAt: c.stompAt };
      };
      const A = cell(sp.a, sp.first);
      const B = cell(sp.b, sp.second);
      if (!A.still || !B.still) return;
      return vclip({ ...A, show: 'split', side: 'right', hold: sp.hold ?? 5, text: sp.text ?? line(sp.pool ?? '特写-双格'), outro: sp.outro ?? (sp.a === 'mouth' ? 'kiss' : undefined), second: B, onPeak: sp.onPeak });
    }

    /**
     * 静图按 focus（原图像素 [x, y]）取景：放大 z0 倍铺满框，那一点尽量放在框里 (50%, aimY)（铺不满就往回收），
     * 之后的推近以那一点为中心；摇镜头（stillMotion）用 _fit.shift 算每一点要平移多少
     */
    function focusStill(img, focus, z0 = 1, aimY = 0.4) {
      const media = img.parentElement;
      const W = media.clientWidth;
      const H = media.clientHeight;
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      if (!W || !H || !w || !h) return;
      const c = Math.max(W / w, H / h) * Math.max(1, Number(z0) || 1);
      const fx = focus[0] * c;
      const fy = focus[1] * c;
      const left = Math.min(0, Math.max(W - w * c, W * 0.5 - fx));
      const top = Math.min(0, Math.max(H - h * c, H * aimY - fy));
      Object.assign(img.style, { width: `${w * c}px`, height: `${h * c}px`, left: `${left}px`, top: `${top}px`, transformOrigin: `${fx}px ${fy}px` });
      // 原图上的点 pt、绕焦点放大到 s 倍时，要平移多少才落在框的 (50%, aimY)——夹住，不露出图外面
      const keep = (t, pos, f, size, box, s) => Math.min(-(pos + f - s * f), Math.max(box - (pos + f + s * (size - f)), t));
      img._fit = {
        shift(pt, s) {
          const tx = W * 0.5 - left - fx - s * (pt[0] * c - fx);
          const ty = H * aimY - top - fy - s * (pt[1] * c - fy);
          return [keep(tx, left, fx, w * c, W, s), keep(ty, top, fy, h * c, H, s)];
        },
      };
    }

    /** 静图在框里怎么动：推近（zoom 起 → 止）；写了 pan 就沿着那一串焦点摇过去 */
    const STILL_EASE = { in: 'cubic-bezier(.55,0,.9,.45)', out: 'ease-out', inout: 'ease-in-out', linear: 'linear' };
    function stillMotion(p, ms) {
      if (reduce.matches || p.src) return;
      const img = p.box.querySelector('.vclip-still');
      const zoom = Array.isArray(p.zoom) ? p.zoom : [1, 1.1];
      const panned = Array.isArray(p.pan) && p.pan.length >= 2;
      const easing = STILL_EASE[p.ease] ?? (panned ? 'ease-in-out' : 'ease-out');
      const fit = img._fit;
      if (!fit) {
        img.animate([{ scale: String(zoom[0]) }, { scale: String(zoom[1]) }], { duration: ms + 700, easing, fill: 'both' });
        return;
      }
      const pts = panned ? p.pan : [p.f, p.f];
      const frames = pts.map((pt, i) => {
        const k = Math.min(1, Math.max(0, pt[2] ?? i / (pts.length - 1)));
        const s = 1 + (zoom[1] / zoom[0] - 1) * k;
        const [tx, ty] = fit.shift(pt, s);
        return { translate: `${tx.toFixed(1)}px ${ty.toFixed(1)}px`, scale: s.toFixed(4), offset: k };
      });
      frames[0].offset = 0;
      frames[frames.length - 1].offset = 1;
      img.animate(frames, { duration: ms + (panned ? 300 : 700), easing, fill: 'both' });
    }

    async function vclipOutro(box, { video, kiss, quiet = false }) {
      const r = box.getBoundingClientRect();
      const ar = appRect();
      const cx = r.left - ar.left + r.width / 2;
      const cy = r.top - ar.top + r.height * 0.45;
      if (!quiet) {
        play('魅惑闪光');
        charmBoost(0.15);
      }
      // 残影：同一个框复制一份（视频的话把最后一帧画进画布），往外放大、变淡
      const ghost = snapshotBox(box, 'vclip-ghost');
      box.after(ghost);
      ghost.animate([{ scale: '1', opacity: 0.7 }, { scale: '1.32', opacity: 0 }], { duration: 760, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }).onfinish = () => ghost.remove();
      setTimeout(() => ghost.remove(), 1000);
      // 粉光一闪
      const bloom = el('i', 'vclip-bloom');
      box.querySelector('.closeup-media')?.append(bloom);
      bloom.animate([{ opacity: 0 }, { opacity: 0.85, offset: 0.3 }, { opacity: 0 }], { duration: 600, easing: 'ease-out' }).onfinish = () => bloom.remove();
      setTimeout(() => bloom.remove(), 900);
      if (kiss) lips({ color: '粉', point: { x: cx, y: cy } });
      if (!quiet) {
        heartSpray(cx, cy, { count: 14, spread: r.width * 0.55, rise: 150, size: [12, 30], duration: [900, 1500], tones: ['pink', 'rose', 'purple', 'pink'] });
        pulseRing(cx, r.top - ar.top + r.height / 2, { size: r.width * 0.5, end: r.width * 1.7, duration: 850, color: '#ff6fae', width: 3, squash: r.height / r.width });
      }
      // 框本身：往外鼓一下、变亮，再放大淡掉
      const a = box.animate(
        [
          { transform: 'translateX(0) scale(1)', opacity: 1, filter: 'brightness(1)' },
          { transform: 'translateX(0) scale(1.05)', opacity: 1, filter: 'brightness(1.35) saturate(1.25)', offset: 0.3 },
          { transform: 'translateX(0) scale(1.16)', opacity: 0, filter: 'brightness(1.7) saturate(1.3)' },
        ],
        { duration: 640, easing: 'ease-in', fill: 'both' },
      );
      await Promise.race([a.finished.catch(() => {}), sleep(700)]);
    }
    function vclipClose() {
      VC.keepFor = null;
      VC.req++;
      if (!VC.open) return;
      VC.token++;
      for (const p of VC.parts ?? []) {
        p.box.hidden = true;
        p.box.querySelector('video')?.pause();
      }
      VC.open = false;
      VC.parts = [];
      delete app.dataset.vclip;
    }
    on('screen', ({ screen }) => {
      // 处决收尾的片子（execute.finale）要跨过「数到 0」接着放：换到 executed 不关
      if (screen !== 'hold' && VC.keepFor !== screen) vclipClose();
      if (screen === 'brief') preloadClips();
    });
    preloadClips();

    // ---------- 诱惑放弃（定时演出「诱惑-放弃」）----------
    // 「想要数到 0 的话，去点放弃，里面就有呀~」：长按放弃的按钮整个变成粉色、一下一下地鼓动发光，后面转着粉色的光芒，
    // 一道光从按钮上扫过去，按钮上「长按放弃」几个字一个接一个跳起来（一圈一圈循环），不断冒心、往外扩粉色的环，她在按钮边上小声勾你（pool，不写就不说）。
    // 站主：右上角那个「0」作用不明确，去掉（2026-09-17）
    // hold 秒后收（不写＝到这一组结束）。站主：原来只冒一个「0」不明显、没有诱惑感（2026-09-17）
    const lure = el('div', 'quit-lure');
    lure.hidden = true;
    lure.innerHTML =
      '<i class="ql-rays"></i><i class="ql-glow"></i><i class="ql-sparks"><b></b><b></b><b></b><b></b><b></b><b></b></i>';
    app.append(lure);
    const LR = { until: 0, pool: null, ringAt: 0, heartAt: 0, wordAt: 0 };
    function quitLure({ hold, pool } = {}) {
      LR.until = hold > 0 ? performance.now() + hold * 1000 : Infinity;
      LR.pool = pool ?? null;
      LR.ringAt = LR.heartAt = 0;
      LR.wordAt = performance.now() + 900;
      lure.hidden = false;
      app.querySelector('#quit')?.setAttribute('data-lure', '');
      hopText(true);
      play('魅惑闪光');
      charmBoost(0.2);
      if (!reduce.matches) lure.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: 'ease-out' });
    }
    function lureOff() {
      if (lure.hidden) return;
      lure.hidden = true;
      app.querySelector('#quit')?.removeAttribute('data-lure');
      hopText(false);
    }
    /** 按钮上的字拆成一个字一个 span（各自带描边），CSS 让它们按顺序跳；收起时换回原来的一整段 */
    function hopText(on) {
      const targets = [app.querySelector('#quit-bar .slab-body'), app.querySelector('#quit-pill > span')].filter(Boolean);
      for (const node of targets) {
        if (on) {
          if (node.dataset.hopOrig !== undefined) continue;
          node.dataset.hopOrig = node.innerHTML;
          const sticker = node.querySelector('.sticker');
          const text = (sticker ?? node).textContent;
          const word = el('span', 'ql-word');
          [...text].forEach((ch, i) => {
            const c = el('span', sticker ? 'sticker ql-ch' : 'ql-ch');
            c.textContent = ch;
            if (sticker) c.dataset.text = ch;
            c.style.setProperty('--i', i);
            word.append(c);
          });
          node.replaceChildren(word);
        } else if (node.dataset.hopOrig !== undefined) {
          node.innerHTML = node.dataset.hopOrig;
          delete node.dataset.hopOrig;
        }
      }
    }
    function lureFrame() {
      if (lure.hidden) return;
      const quit = app.querySelector('#quit');
      const pill = quit?.dataset.state === 'pill';
      const btn = pill ? quit.querySelector('#quit-pill') : quit?.querySelector('#quit-bar');
      const r = btn?.getBoundingClientRect();
      const now = performance.now();
      if (S.screen !== 'hold' || !r?.width || now > LR.until) return lureOff();
      const ar = appRect();
      const x = r.left - ar.left;
      const y = r.top - ar.top;
      Object.assign(lure.style, { left: `${x}px`, top: `${y}px`, width: `${r.width}px`, height: `${r.height}px` });
      lure.dataset.shape = pill ? 'pill' : 'bar';
      if (reduce.matches || S.press) return;
      const cx = x + r.width / 2;
      const cy = y + r.height / 2;
      // 一下一下往外扩粉色的环（扁的，贴着按钮的形状）
      if (now >= LR.ringAt) {
        LR.ringAt = now + 1100;
        pulseRing(cx, cy, { size: r.width * 0.6, end: r.width * 1.5, duration: 1000, color: '#ff6fae', core: 'rgb(255 61 139 / 0.25)', width: 2, squash: Math.max(0.25, r.height / r.width) * 1.6 });
      }
      // 按钮上冒心
      if (now >= LR.heartAt) {
        LR.heartAt = now + 650;
        heartSpray(x + rand(0.15, 0.85) * r.width, y + 6, { count: 2, spread: 40, rise: 110, size: [10, 20], duration: [900, 1400], tones: ['pink', 'rose', 'pink'] });
      }
      // 她在按钮边上小声勾你
      if (LR.pool && now >= LR.wordAt) {
        LR.wordAt = now + 2600;
        ono({ text: shortLine(LR.pool, 6), point: { x: cx + rand(-0.3, 0.3) * r.width, y: y - rand(70, 100) } });
      }
    }
    on('set', () => {
      lureOff();
      app.querySelector('#clock')?.classList.remove('clock--allure');
    });
    on('screen', ({ screen }) => screen !== 'hold' && lureOff());

    // ---------- 超时的秒数（game.js「超时」：卡在 1、数小数、往回涨、往上数）----------
    function clockPop(scale = 1.4) {
      const clock = app.querySelector('#clock');
      if (clock && !reduce.matches) clock.animate([{ scale: String(scale) }, { scale: '0.95', offset: 0.5 }, { scale: '1' }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1.3)' });
    }
    on('clock', ({ kind, text, whisper: pool, up, pop, seconds }) => {
      if (kind === 'strain') return strainFx(seconds);
      if (kind === 'tick') {
        // 又数了一次「1」：秒数弹一下、心跳、粉色冲击环、耳边说（{n}＝数字）
        const p = clockPoint();
        clockPop(1.5);
        CH.beat = 1;
        charmBoost(0.06);
        play('心跳');
        pulseRing(p.x, p.y, { size: 40, end: 220, duration: 800, color: '#ff6fae', core: 'rgb(43 13 51 / 0.5)', width: 2 });
        if (pool) whisper({ text: line(pool, { n: text }), at: 'face', style: '倒计时', hold: 900 });
        return;
      }
      if (kind === 'count') {
        const p = clockPoint();
        clockPop(up ? 1.3 : 1.25);
        // 往上数：秒数染成粉色（数反了）
        if (up) app.querySelector('#clock')?.classList.add('clock--allure');
        CH.beat = 0.7;
        play('心跳');
        if (up && pop) ono({ text: String(pop), point: { x: p.x + rand(40, 80), y: p.y - rand(50, 80) } });
        if (pool) whisper({ text: line(pool, { n: text }), at: 'face', style: '倒计时', hold: 900 });
        return;
      }
      if (kind === 'word') {
        // 数到 1 之后秒数那一格换成言责词（005）：一拍砸一个，粉色冲击环，心跳，魅了往上推一点
        const p = clockPoint();
        clockPop(1.55);
        CH.beat = 1;
        charmBoost(0.05);
        play('心跳');
        pulseRing(p.x, p.y, { size: 36, end: 200, duration: 700, color: '#ff6fae', core: 'rgb(43 13 51 / 0.45)', width: 2 });
        if (pool) whisper({ text: line(pool, { n: text }), at: 'face', style: '倒计时', hold: 800 });
        return;
      }
      if (kind === 'rewind') rewindFx(seconds);
    });
    /**
     * 卡住的那一下：秒数像憋住了一样越胀越大、越抖越厉害、染成粉色，憋到头「噗」地弹回原状（冲击环 + 心跳）。
     * 站主：停住的时间太短、玩家可能没意识到数字停了（2026-09-17）
     */
    function strainFx(seconds = 1.8) {
      const clock = app.querySelector('#clock');
      if (!clock) return;
      const ms = seconds * 1000;
      clock.classList.add('clock--strain');
      setTimeout(() => clock.classList.remove('clock--strain'), ms);
      play('心跳');
      CH.beat = 1;
      if (reduce.matches) return;
      const jit = (a) => `${rand(-a, a).toFixed(1)}deg`;
      const frames = [{ scale: '1', rotate: '0deg', offset: 0 }];
      const steps = 16;
      for (let i = 1; i < steps; i++) {
        const k = i / steps;
        const grow = 1 + 0.62 * Math.pow(k / 0.82, 1.4);
        frames.push({ scale: String(Math.min(1.62, grow).toFixed(3)), rotate: jit(1 + 6 * k), offset: 0.82 * k });
      }
      frames.push({ scale: '1.66', rotate: '0deg', offset: 0.84 });
      frames.push({ scale: '0.82', rotate: '-4deg', offset: 0.9 });
      frames.push({ scale: '1.08', rotate: '2deg', offset: 0.95 });
      frames.push({ scale: '1', rotate: '0deg', offset: 1 });
      clock.animate(frames, { duration: ms, easing: 'linear' });
      // 憋到头弹回来的那一下
      setTimeout(() => {
        if (S.screen !== 'hold') return;
        const p = clockPoint();
        play('心跳');
        I.shake();
        pulseRing(p.x, p.y, { size: 60, end: 320, duration: 900, color: '#ff6fae', width: 3 });
        heartSpray(p.x, p.y, { count: 6, spread: 120, rise: 90, size: [10, 20], tones: ['pink', 'rose'] });
      }, ms * 0.86);
    }

    /** 往回涨：她亲一下秒数、画面上倒带的横纹往上刷、秒数旁边「◀◀」闪 */
    function rewindFx(seconds = 1.6) {
      const ms = seconds * 1000;
      const p = clockPoint();
      lips({ color: '粉', point: { x: p.x + 10, y: p.y - 6 } });
      charmBoost(0.2);
      I.shake();
      if (reduce.matches) return;
      const scan = place(el('div', 'fx-rewind'), 0, 0);
      run(scan, [{ opacity: 0 }, { opacity: 1, offset: 0.15 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }], { duration: ms, easing: 'linear' });
      const mark = el('div', 'fx-rewind-mark');
      mark.innerHTML = '<span class="sticker sticker--large">◀◀</span>';
      place(mark, p.x + 70, p.y - 40);
      run(mark, [{ opacity: 0, scale: '1.6' }, { opacity: 1, scale: '1', offset: 0.12 }, { opacity: 0.35, offset: 0.3 }, { opacity: 1, offset: 0.45 }, { opacity: 0.35, offset: 0.6 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }], { duration: ms, easing: 'steps(1, end)' });
      app.querySelector('#art')?.animate([{ filter: 'none' }, { filter: 'hue-rotate(-20deg) saturate(1.3) contrast(1.1)', offset: 0.2 }, { filter: 'hue-rotate(-20deg) saturate(1.3) contrast(1.1)', offset: 0.8 }, { filter: 'none' }], { duration: ms });
    }

    // ---------- 败北处决（game.js toExecute / toExecuted）----------
    // 数的时候：每一秒一道紫色冲击环从秒数扩开、心跳、她在耳边数（处决-倒数），剩几秒冒一句心声（处决-心声），最后三秒环变粉黑、立绘一下一下泛光。
    // 数到 0：暗幕压下来（一明一暗地喘）、硬闪、两道冲击环、画面染一下紫、紫色放射光慢慢转（结算前淡掉）、紫黑大字（处决-归零）、
    // 黑 / 紫唇印印在她身上、胸部特写（循环）、第二波轻闪和冲击环、心跳一下比一下慢、残影两段、幻象。结算出来之后余韵还在走（站主：心形环廉价，换掉）
    // 数值在 common.jsonc 的 execute
    const exCfg = () => Q().execute ?? {};

    /** 冲击环：细亮边 + 外面一圈暗色厚边 + 辉光，从 size 扩到 end（px），比心形环利落 */
    function pulseRing(x, y, { size = 60, end = 400, delay = 0, duration = 1000, color = '#a86bff', core = 'rgb(43 13 51 / 0.7)', width = 3, squash = 1 } = {}) {
      if (reduce.matches) return;
      const n = el('div', 'fx-pulse');
      n.style.setProperty('--pulse-color', color);
      n.style.setProperty('--pulse-core', core);
      n.style.setProperty('--pulse-w', `${width}px`);
      place(n, x, y);
      const mid = size + (end - size) * 0.3;
      run(
        n,
        [
          { width: `${size}px`, height: `${size * squash}px`, opacity: 0 },
          { width: `${mid}px`, height: `${mid * squash}px`, opacity: 1, offset: 0.15 },
          { width: `${end}px`, height: `${end * squash}px`, opacity: 0 },
        ],
        { duration, delay, easing: 'cubic-bezier(.15,.7,.25,1)' },
      );
    }
    function clockPoint() {
      const r = appRect();
      const cr = app.querySelector('#clock')?.getBoundingClientRect();
      return cr?.width ? { x: cr.left - r.left + cr.width / 2, y: cr.top - r.top + cr.height / 2 } : { x: r.width * 0.2, y: r.height * 0.6 };
    }
    on('execute', ({ state, left, seconds, hold, drained }) => {
      if (state === 'intro') {
        closeupClose();
        CH.boost = 0.5;
        return;
      }
      if (state === 'line') {
        // 前言每说一句：心一跳，脸边冒一小撮紫黑的心
        CH.beat = 1;
        const f = anchor('face');
        heartSpray(f.x, f.y, { count: 5, spread: 110, rise: 90, size: [10, 22], tones: ['purple', 'black', 'rose'] });
        return;
      }
      if (state === 'cutin') {
        if (MV.active && !reduce.matches) tween(500, (k) => (MAIN.flash = 0.18 * Math.sin(Math.PI * k)), () => (MAIN.flash = 0));
        return;
      }
      if (state === 'start') {
        const p = clockPoint();
        CH.beat = 1;
        play('心跳');
        pulseRing(p.x, p.y, { size: 50, end: 360, duration: 1100, color: '#c9a0ff', width: 3 });
        if (!reduce.matches) setTimeout(() => S.screen === 'execute' && vision(1), 500);
        return;
      }
      if (state === 'second') {
        if (!(left > 0)) return;
        const p = clockPoint();
        const last = left <= 3;
        CH.beat = 1;
        play('心跳');
        pulseRing(p.x, p.y, { size: 40, end: 170 + (seconds - left) * 22, duration: 900, color: last ? '#ff6fae' : '#a86bff', core: last ? 'rgb(12 4 14 / 0.9)' : 'rgb(43 13 51 / 0.55)', width: last ? 3 : 2 });
        if (left % (exCfg().whisperEvery ?? 1) === 0 || last) {
          whisper({ text: line('处决-倒数', { n: left }), look: last ? '黑' : '幽', size: last ? 24 : 20, hold: 1300 });
        }
        if ((exCfg().thoughtAt ?? [7, 3]).includes(left)) vertical({ text: line('处决-心声') });
        // 剩几秒喊一句现实里的命令（execute.orders：{ left, text 或 pool, hold }），不带「遵命」按钮
        for (const o of exCfg().orders ?? []) {
          if (o?.left === left) command({ text: o.text ?? line(o.pool ?? '处决-命令'), hold: o.hold ?? 2, reward: false });
        }
        if ((exCfg().visionAt ?? [6, 2]).includes(left)) vision(1);
        // 收尾的片子（execute.finale，005 的靴底）：lead＝片子里「踩中」那一帧在第几秒，提前开播，让踩中正好落在数到 0
        const fin = exCfg().finale;
        const lead = Number(fin?.lead) || 1.5;
        if (fin?.src && left === Math.ceil(lead)) {
          // 这一刻离数到 0 正好 ceil(lead) 秒：记下数到 0 的绝对时刻，片子开播后按它校进度（踩到底那一帧落在 0 上，站主 2026-09-24）
          const zeroAt = performance.now() + Math.ceil(lead) * 1000;
          setTimeout(() => {
            if (S.screen !== 'execute' && S.screen !== 'executed') return;
            VC.keepFor = 'executed';
            vclip({ src: fin.src, side: fin.side ?? 'left', show: fin.show, hold: fin.hold ?? 7, text: fin.text ?? (fin.pool ? line(fin.pool) : undefined), sound: fin.sound, sync: { at: zeroAt, t: lead } });
          }, (Math.ceil(lead) - lead) * 1000);
        }
        if (last && MV.active && !reduce.matches) {
          tween(420, (k) => (MAIN.flash = 0.16 * Math.sin(Math.PI * k)), () => (MAIN.flash = 0));
        }
        return;
      }
      if (state === 'zero') executedFx(hold, drained);
    });
    /** drained（007 等级归零的那一场）：喊「清空-归零」、放 execute.drained.zero（没写就用 zero） */
    function executedFx(hold, drained = false) {
      const ms = hold * 1000;
      const p = clockPoint();
      const r = appRect();
      const mx = r.width / 2;
      const my = r.height * 0.42;
      const later = (t, fn) => setTimeout(() => S.screen === 'executed' && fn(), t);
      CH.beat = 1;
      setTimeout(() => shout({ text: line(drained && I.hasPool('清空-归零') ? '清空-归零' : '处决-归零'), dark: true }), reduce.matches ? 0 : 380);
      // 暗幕：压下来之后一明一暗地喘，留到结算、换画面才撤（在魅了层里，压在立绘上、结算字和按钮下面）
      for (const n of charm.querySelectorAll('.fx-fall, .fx-rays')) n.remove();
      const fall = el('div', 'fx-fall');
      charm.insertBefore(fall, heartsCanvas);
      if (reduce.matches) return;
      fall.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 900, easing: 'ease-out', fill: 'forwards' }).onfinish = () => {
        if (fall.isConnected) fall.animate([{ opacity: 1 }, { opacity: 0.7 }], { duration: 1700, direction: 'alternate', iterations: Infinity, easing: 'ease-in-out' });
      };
      // 堕落的光：紫色细光线从画面中间放射出去、慢慢转；结算出来之前淡掉（站主：不要留在「彻底败北」画面上）
      const rays = el('div', 'fx-rays');
      charm.insertBefore(rays, heartsCanvas);
      rays.animate(
        [{ opacity: 0 }, { opacity: 1, offset: Math.min(0.4, 1600 / ms) }, { opacity: 1, offset: Math.max(0.5, 1 - 1300 / ms) }, { opacity: 0 }],
        { duration: ms, delay: 250, easing: 'ease-out', fill: 'forwards' },
      ).onfinish = () => rays.remove();
      rays.animate([{ rotate: '0deg' }, { rotate: '360deg' }], { duration: 80000, iterations: Infinity });
      // 硬闪：黑 → 玫红 → 黑 → 紫
      const strobe = (frames, duration) => run(place(el('div', 'fx-strobe'), 0, 0), frames, { duration, easing: 'steps(1, end)' });
      strobe(
        [
          { opacity: 0, background: '#0b0b12' },
          { opacity: 0.92, background: '#12040f', offset: 0.06 },
          { opacity: 0, offset: 0.16 },
          { opacity: 0.7, background: '#ff3d8b', offset: 0.24 },
          { opacity: 0, offset: 0.34 },
          { opacity: 0.88, background: '#0b0b12', offset: 0.46 },
          { opacity: 0, offset: 0.58 },
          { opacity: 0.45, background: '#a86bff', offset: 0.72 },
          { opacity: 0 },
        ],
        1150,
      );
      // 冲击环：秒数那里一道粉的、画面中间一道紫的（横着扁一点）
      const far = Math.hypot(r.width, r.height) * 2.2;
      pulseRing(p.x, p.y, { size: 60, end: far, duration: 1400, color: '#ff6fae', core: 'rgb(12 4 14 / 0.85)', width: 4 });
      pulseRing(mx, my, { size: 90, end: far * 0.8, delay: 200, duration: 1700, color: '#a86bff', width: 3, squash: 0.78 });
      // 画面染一下：更艳、偏紫、对比更强，再慢慢退回来
      app.querySelector('#art')?.animate(
        [
          { filter: 'none' },
          { filter: 'saturate(1.7) hue-rotate(-26deg) contrast(1.18) brightness(0.92)', offset: 0.15 },
          { filter: 'saturate(1.25) hue-rotate(-10deg)', offset: 0.6 },
          { filter: 'none' },
        ],
        { duration: 2600, easing: 'ease-out' },
      );
      // 黑紫的心只撒一小把（粒子层的心本来就偏紫黑）
      heartSpray(p.x, p.y, { count: 10, spread: 200, rise: 210, size: [12, 28], duration: [1600, 2600], delay: 120, tones: ['black', 'purple', 'black', 'rose'] });
      // 唇印：黑的、紫的各印一个在她身上
      later(800, () => lips({ color: '黑' }));
      later(2800, () => lips({ color: '紫' }));
      // 胸部特写（循环，用这张立绘自己的取景）：结算出来之前收起
      // execute.zero：数到 0 之后放的那一条换成委托自己的（006：眼睛发光的脸铺满整屏）；不写＝胸部循环特写
      const zero = (drained && exCfg().drained?.zero) || exCfg().zero;
      if (zero?.fx) later(Math.max(0, Number(zero.at) || 1.2) * 1000, () => trigger(zero.fx, { ...zero, fx: undefined, at: undefined }));
      else later(1200, () => closeup('chest', { loop: true, hold: Math.max(1, hold - 1.9) }));
      // 第二波：轻闪一下紫黑、再一道细冲击环
      later(2000, () => {
        strobe([{ opacity: 0, background: '#a86bff' }, { opacity: 0.32, offset: 0.1 }, { opacity: 0, offset: 0.3 }, { opacity: 0.4, background: '#0b0b12', offset: 0.45 }, { opacity: 0 }], 700);
        pulseRing(mx, my, { size: 80, end: far * 0.7, duration: 2000, color: '#c9a0ff', width: 2, squash: 0.78 });
      });
      // 心跳：一下比一下慢、一下比一下轻
      for (const [t, k] of [[900, 1], [2100, 0.8], [3700, 0.6], [5700, 0.4]]) {
        later(t, () => {
          CH.beat = k;
          play('心跳');
        });
      }
      // 幻影：立绘拖着久久不散的残影，先强后弱两段；幻象开头一次、特写收起之后一次
      if (MV.active) {
        const reset = () => {
          MAIN.flash = 0;
          MAIN.echo = [1, 0, 1, 0];
        };
        tween(
          3600,
          (k) => {
            MAIN.flash = 0.1 * Math.max(0, Math.sin(Math.PI * Math.min(1, k * 4)));
            MAIN.echo = echoCurve(k, { strength: 1.8, grow: [0.1, 0.2], linger: 3.2 });
          },
          () => {
            reset();
            if (S.screen !== 'executed') return;
            tween(4200, (k) => (MAIN.echo = echoCurve(k, { strength: 1.1, grow: [0.14, 0.26], linger: 4 })), reset);
          },
        );
      }
      for (const t of [0, ms - 150]) later(t, () => vision(1));
    }
    on('screen', ({ screen }) => {
      if (screen !== 'executed') for (const n of charm.querySelectorAll('.fx-fall, .fx-rays')) n.remove();
    });

    // 数到 0 的余韵：「0」往外扩散两圈心形环、立绘留一个慢慢散开的残影、心从秒数那里往上飘、画面一层柔光（fx.finish）
    on('finish', ({ hold, grand, final }) => {
      const f = cfg().finish ?? {};
      if (f.enabled === false || reduce.matches) return;
      if (grand) grandFinish(hold);
      if (final) finalBlow();
      app.querySelector('#clock')?.classList.remove('clock--allure');
      const ms = hold * 1000;
      const r = appRect();
      const cr = app.querySelector('#clock')?.getBoundingClientRect();
      const cx = cr ? cr.left - r.left + cr.width / 2 : r.width * 0.2;
      const cy = cr ? cr.top - r.top + cr.height / 2 : r.height * 0.6;
      charmBoost(f.charm ?? 0.15);
      CH.beat = 1;
      heartRing(cx, cy, { size: 70, to: f.ring ?? 7, duration: ms * 0.9, tone: 'rose' });
      heartRing(cx, cy, { size: 70, to: (f.ring ?? 7) * 0.7, delay: 220, duration: ms * 0.75, tone: 'purple' });
      heartSpray(cx, cy, { count: f.hearts ?? 14, spread: 170, rise: 200, size: [12, 30], duration: [ms * 0.7, ms], delay: 120 });
      // 柔光：从秒数那里铺开一层粉色的光，再慢慢退
      const glow = el('div', 'fx-afterglow');
      glow.style.setProperty('--gx', `${cx}px`);
      glow.style.setProperty('--gy', `${cy}px`);
      layer.append(glow);
      run(glow, [{ opacity: 0 }, { opacity: f.glow ?? 0.5, offset: 0.25 }, { opacity: 0 }], { duration: ms, easing: 'ease-out' });
      // 立绘：慢慢散开的残影，不闪不抖
      if (MV.active) {
        tween(
          ms,
          (k) => {
            MAIN.flash = 0.06 * Math.sin(Math.PI * Math.min(1, k * 2));
            MAIN.echo = echoCurve(k, { strength: f.echo ?? 0.9, grow: [0.07, 0.13], linger: 2.5 });
          },
          () => {
            MAIN.flash = 0;
            MAIN.echo = [1, 0, 1, 0];
          },
        );
      }
    });
    /**
     * 大号余韵（sets[n].finish = "grand"，003 最后终于数到 0 的那一下；站主：要更丰富更强）：
     * 「0」砸下来、三个「0」的残影往外扩；粉白两下闪；秒数那里爆出粉金色的光芒；粉 / 白 / 金几圈冲击环接连扩开；
     * 画面各处像烟花一样一簇一簇地炸心；上面飘下粉色和金色的星星；正中印一个大唇印（奖励）；立绘强残影 + 心跳三下越来越轻
     */
    function grandFinish(hold) {
      const ms = hold * 1000;
      const r = appRect();
      const p = clockPoint();
      const later = (t, fn) => setTimeout(() => S.screen === 'hold' && S.finishLeft > 0 && fn(), t);
      const clock = app.querySelector('#clock');
      charmBoost(0.5);
      CH.beat = 1;
      play('魅惑闪光');
      I.shake();
      // 「0」砸下来 + 三个残影
      clock?.animate([{ scale: '2.4', opacity: 0.4 }, { scale: '0.9', opacity: 1, offset: 0.5 }, { scale: '1.12', offset: 0.75 }, { scale: '1', opacity: 1 }], { duration: 520, easing: 'cubic-bezier(.3,.7,.3,1.2)' });
      [0, 160, 320].forEach((d, i) => {
        if (!clock) return;
        const cr = clock.getBoundingClientRect();
        const ghost = clock.cloneNode(true);
        ghost.removeAttribute('id');
        ghost.className = `${clock.className} fx-zero-ghost`;
        Object.assign(ghost.style, { position: 'absolute', left: `${cr.left - r.left}px`, top: `${cr.top - r.top}px`, translate: 'none', margin: '0' });
        layer.append(ghost);
        run(ghost, [{ scale: '1', opacity: 0.8 }, { scale: String(2.2 + i * 0.9), opacity: 0 }], { duration: 900 + i * 200, delay: d, easing: 'cubic-bezier(.15,.7,.3,1)' });
      });
      // 粉白两下闪
      const flash = place(el('div', 'fx-strobe'), 0, 0);
      run(flash, [{ opacity: 0, background: '#fff5fa' }, { opacity: 0.85, offset: 0.08 }, { opacity: 0, offset: 0.3 }, { opacity: 0.55, background: '#ff9fcb', offset: 0.42 }, { opacity: 0 }], { duration: 900, easing: 'ease-out' });
      // 粉金色光芒从秒数那里爆开
      const rays = place(el('div', 'fx-grand-rays'), p.x, p.y);
      run(rays, [{ opacity: 0, scale: '0.3', rotate: '0deg' }, { opacity: 1, scale: '1', offset: 0.18 }, { opacity: 0.8, offset: 0.6 }, { opacity: 0, scale: '1.25', rotate: '40deg' }], { duration: ms, easing: 'ease-out' });
      // 冲击环
      const far = Math.hypot(r.width, r.height) * 1.8;
      pulseRing(p.x, p.y, { size: 60, end: far, duration: 1100, color: '#ffffff', core: 'rgb(255 111 174 / 0.35)', width: 4 });
      pulseRing(p.x, p.y, { size: 60, end: far * 0.8, delay: 180, duration: 1300, color: '#ff6fae', core: 'rgb(255 61 139 / 0.3)', width: 3 });
      pulseRing(p.x, p.y, { size: 60, end: far * 0.6, delay: 380, duration: 1500, color: '#ffd76a', core: 'rgb(255 180 60 / 0.25)', width: 2 });
      // 烟花一样一簇一簇地炸心
      for (let i = 0; i < 6; i++) {
        later(250 + i * 420, () => {
          const x = r.width * rand(0.15, 0.8);
          const y = r.height * rand(0.15, 0.6);
          play('心跳');
          pulseRing(x, y, { size: 20, end: rand(140, 220), duration: 700, color: choice(['#ff6fae', '#ffd76a', '#ffffff']), width: 2 });
          heartSpray(x, y, { count: 9, spread: 120, rise: 60, size: [10, 24], duration: [700, 1200], tones: ['pink', 'rose', 'pink', 'purple'] });
        });
      }
      // 飘下来的星星
      for (let i = 0; i < 26; i++) {
        const star = el('div', 'fx-star');
        star.style.setProperty('--star', choice(['#ff6fae', '#ffd76a', '#fff0f7', '#ff9fcb']));
        place(star, rand(0, r.width), rand(-40, r.height * 0.2));
        const fall = rand(r.height * 0.5, r.height * 0.9);
        run(star, [{ opacity: 0, translate: '0 0', rotate: '0deg', scale: String(rand(0.6, 1.3)) }, { opacity: 1, offset: 0.15 }, { opacity: 0, translate: `${rand(-40, 40)}px ${fall}px`, rotate: `${rand(-270, 270)}deg` }], { duration: rand(ms * 0.6, ms), delay: rand(0, 900), easing: 'ease-in' });
      }
      // 正中印一个大唇印
      later(700, () => lips({ color: '粉', point: { x: r.width * 0.5, y: r.height * 0.36 } }));
      // 立绘强残影
      if (MV.active) {
        tween(
          ms,
          (k) => {
            MAIN.flash = 0.16 * Math.max(0, Math.sin(Math.PI * Math.min(1, k * 3)));
            MAIN.echo = echoCurve(k, { strength: 1.6, grow: [0.12, 0.24], linger: 3 });
          },
          () => {
            MAIN.flash = 0;
            MAIN.echo = [1, 0, 1, 0];
          },
        );
      }
      for (const [t, k] of [[0, 1], [1100, 0.7], [2300, 0.45]]) later(t, () => (CH.beat = k));
    }

    on('storyfx', ({ fx, float }) => {
      // 剧情里的循环特写：一直停着，走到下一句才收起
      for (const name of [].concat(fx ?? [])) {
        // 连着几句都写同一个循环特写（006 开场的怀表）：已经开着就接着停，不收了再开
        if (CLOSEUPS[name]?.[1] && CU.open && !CU.closing && CU.loop && CU.key === CLOSEUPS[name][0]) {
          CU.keepLine = true;
          continue;
        }
        trigger(name, CLOSEUPS[name]?.[1] ? { hold: 0, untilLine: true } : {});
      }
      // float 可以写一条，也可以写几条的数组（同一句里接连浮出来，隔 0.9 秒一条）
      [].concat(float ?? []).forEach((one, i) => {
        const f = typeof one === 'string' ? { style: one } : one;
        const { style = '耳语', ...opts } = f;
        if (i === 0) trigger(style, opts);
        else setTimeout(() => trigger(style, opts), i * 900);
      });
    });

    // ---------- 最坏情况（地址 ?stress=1，给真机测帧数和发热）----------
    // 魅了层锁在最高；胸纵 / 臀 / 胸横的循环特写一个接一个不停；别的演出不管特写开没开，每 2.5 秒叠一个
    if (I.pageParam('stress') === '1') {
      CH.override = 1;
      const loops = ['特写-胸-循环', '特写-臀-循环', '特写-胸-横-循环'];
      let n = 0;
      const nextLoop = async () => {
        const [key] = CLOSEUPS[loops[n++ % loops.length]];
        await closeup(key, { loop: true, hold: 8 });
        setTimeout(nextLoop, 600);
      };
      setTimeout(nextLoop, 1500);
      const extras = ['拟声', '耳语', '思绪', '心章', '唇印', '吐息', '魅惑闪光', '集中线', '竖排', '气泡'];
      setInterval(() => !document.hidden && trigger(choice(extras)), 2500);
    }

    // ---------- 委托单上的眼部黑条 ----------
    // 委托单画面（brief）背后的立绘，眼睛上贴一条黑条：开战前的剧情里才第一次看清她的脸（站主，2026-09-17）。跟着立绘的呼吸一起动。
    // 位置跟着立绘档案的 fx.eyeBar（{ center: [x, y], size: [宽, 高], angle: 度 }，原图像素）；没写就按 anchors.eyes 和特写的 eyeSpread 估
    /**
     * 眼部黑条的样子（w × h 原图像素，跟着图缩放）：ink 矩形 + 中间一个 cream 的英文「UNKNOWN」（还不知道她是谁）。
     * 字是 Lilita One（fonts-src/LilitaOne-Regular.ttf，字距 90）转好的轮廓，不依赖字体文件；
     * 任务墙封面导入时贴的是同一个样子（scripts/import/assets.mjs 的 barSvg），改了两边一起改
     */
    const UNKNOWN_W = 5381;
    const UNKNOWN_D = 'M377 -680Q377 -700 486 -700Q594 -700 594 -680L594 -221Q594 -119 521 -54Q448 10 320 10Q191 10 111 -56Q30 -123 30 -236L30 -679Q30 -699 139 -699Q247 -699 247 -679L247 -228Q247 -208 268 -196Q290 -184 314 -184Q338 -184 358 -195Q377 -206 377 -228ZM1316 -22Q1316 -1 1222 -1Q1128 -1 1120 -16L953 -328L953 -17Q953 1 861 1Q768 1 768 -17L768 -686Q768 -701 847 -701Q878 -701 920 -695Q961 -690 970 -675L1130 -367L1130 -681Q1130 -700 1223 -700Q1316 -700 1316 -681ZM1706 -14Q1706 1 1612 1L1556 -2Q1506 -6 1506 -16L1506 -687Q1506 -704 1606 -704Q1706 -704 1706 -687L1706 -431L1828 -687Q1835 -701 1908 -701Q2041 -701 2048 -678Q2048 -676 2047 -674L1873 -360L2075 -81Q2075 -79 2056 -64Q2010 -24 1948 -1Q1929 6 1910 6L1886 4Q1854 -4 1836 -37L1722 -255L1706 -255ZM2764 -22Q2764 -1 2670 -1Q2576 -1 2568 -16L2401 -328L2401 -17Q2401 1 2309 1Q2216 1 2216 -17L2216 -686Q2216 -701 2295 -701Q2326 -701 2368 -695Q2409 -690 2418 -675L2578 -367L2578 -681Q2578 -700 2671 -700Q2764 -700 2764 -681ZM3252 10Q3252 10 3181 10Q3111 10 3023 -82Q2934 -174 2934 -350Q2934 -527 3024 -618Q3113 -709 3255 -709Q3396 -709 3483 -619Q3570 -530 3570 -348Q3570 -167 3481 -78Q3392 10 3252 10ZM3252 -517Q3252 -517 3228 -517Q3204 -517 3172 -473Q3139 -429 3139 -349Q3139 -270 3170 -227Q3201 -185 3252 -185Q3302 -185 3334 -228Q3365 -271 3365 -351Q3365 -431 3333 -474Q3300 -517 3252 -517ZM3711 -690Q3708 -701 3812 -701Q3927 -701 3930 -682L3979 -261L4085 -687Q4090 -702 4163 -702Q4236 -702 4241 -688L4345 -259L4403 -684Q4405 -695 4449 -699Q4493 -703 4520 -703Q4625 -703 4622 -689L4501 -26Q4497 -11 4444 -4Q4391 3 4358 3Q4234 3 4228 -25L4160 -300L4086 -26Q4082 -8 4016 0Q3982 3 3948 3L3884 0Q3818 -7 3814 -25ZM5331 -22Q5331 -1 5237 -1Q5143 -1 5135 -16L4968 -328L4968 -17Q4968 1 4876 1Q4783 1 4783 -17L4783 -686Q4783 -701 4862 -701Q4893 -701 4935 -695Q4976 -690 4985 -675L5145 -367L5145 -681Q5145 -700 5238 -700Q5331 -700 5331 -681Z';
    function eyeBarSvg(w, h) {
      const q = Math.min((h * 0.42) / 709, (w * 0.78) / UNKNOWN_W);
      const tx = (w - UNKNOWN_W * q) / 2;
      const ty = h / 2 + 349.5 * q;
      return `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><rect width="${w}" height="${h}" fill="#0b0b12"/><path transform="translate(${tx.toFixed(1)} ${ty.toFixed(1)}) scale(${q.toFixed(4)})" fill="#fff5e1" d="${UNKNOWN_D}"/></svg>`;
    }
    const eyeBar = el('div', 'eye-bar');
    eyeBar.hidden = true;
    let eyeBarSize = '';
    function eyeBarFrame() {
      const conf = cfg().eyeBar;
      const img = S.screen === 'brief' && conf !== false ? app.querySelector('#art-img img.framed') : null;
      const box = img?.parentElement;
      const w = parseFloat(img?.style.width) || 0;
      if (!img?.naturalWidth || !box || !w) {
        eyeBar.hidden = true;
        return;
      }
      // 和立绘放在同一个框里、按立绘自己的坐标摆：整图呼吸（.art-img 缩放）、震动都一起动
      if (eyeBar.parentElement !== box) box.append(eyeBar);
      const spread = cfg().closeup?.eyes?.eyeSpread ?? 95;
      const [ix, iy] = conf?.center ?? anchorImagePoint('eyes', img);
      const [bw, bh] = conf?.size ?? [spread * 4.4, spread * 1.3];
      const k = w / img.naturalWidth;
      const size = `${bw}x${bh}`;
      if (size !== eyeBarSize) {
        eyeBar.innerHTML = eyeBarSvg(bw, bh);
        eyeBarSize = size;
      }
      Object.assign(eyeBar.style, {
        left: `${(parseFloat(img.style.left) || 0) + ix * k}px`,
        top: `${(parseFloat(img.style.top) || 0) + iy * k}px`,
        width: `${bw * k}px`,
        height: `${bh * k}px`,
        transform: `translate(-50%, -50%) rotate(${conf?.angle ?? 0}deg)`,
      });
      eyeBar.hidden = false;
    }

    // 每帧：魅了层、特写、各段抽演出
    const prevAfter = MV.afterFrame;
    MV.afterFrame = (dt) => {
      prevAfter?.(dt);
      charmFrame(Math.min(0.05, Math.max(0, dt)));
      closeupFrame(dt);
      ghostFrame(Math.min(0.1, Math.max(0, dt)));
      forkFrame(Math.min(0.1, Math.max(0, dt)));
      eyeBarFrame();
      lureFrame();
      hypnoFrame(Math.min(0.1, Math.max(0, dt)));
      directorFrame(dt);
      talkFrame();
    };
    // 主画面没开 WebGL 的时候，afterFrame 仍由 game.6051d2b93f.js 每帧调

    T.tune.fx = {
      list: () => Object.keys(EFFECTS).concat(['拟声-摇', '拟声-心跳', '拟声-吐息', '拟声-亲', '拟声-魅惑', '拟声-心章', '拟声-臀']),
      play: (name, opts) => trigger(name, opts),
      charm: (level) => (CH.override = level === null || level === undefined ? null : Math.max(0, Math.min(1, level))),
      charmLevel: () => CH.level,
      director: (on) => {
        D.enabled = !!on;
      },
      /** 按演出表的一格放一次（调节器试放）：name＝格名，ctx 同 fire */
      fireCell: (name, ctx) => fire(I.stageCell(name), ctx),
      /** 放一条定时演出（调节器试放；要在战斗画面里） */
      cue: (cue) => playCue(cue),
      countdown: (n) => countdownTick(n),
      closeupClose: () => closeupClose(),
      /** 特写取景：读 / 改（只这一页）/ 存本机 / 清本机 / 预览（胸、臀循环着停住，眼停 60 秒，点收起才走） */
      framing: () => ({ standee: Q().standeeActive ?? null, ...framing() }),
      setFraming: (key, patch) => Object.assign((closeupCfg()[key] ??= {}), patch),
      saveFraming: () => {
        try {
          localStorage.setItem(framingKey(), JSON.stringify(framing()));
        } catch {}
      },
      clearFraming: () => {
        try {
          localStorage.removeItem(framingKey());
        } catch {}
      },
      previewCloseup: async (key) => {
        if (CU.open) {
          closeupClose();
          await CU.done;
        }
        closeup(key, key === 'eyes' ? { hold: 60 } : { loop: true, hold: 0 });
      },
      /** 心章的 SVG（画好的样子，调试看外观用：遮罩全开） */
      crestSvg: () => crestSvg('preview').replace(/stroke-dashoffset="1"/g, 'stroke-dashoffset="0"'),
      closeupState: () => ({ open: CU.open, part: CU.target, key: CU.key, loop: CU.loop, x: Math.round(CU.osc.x), y: Math.round(CU.osc.y), zoom: Number((CU.zoom ?? 1).toFixed(3)) }),
      /** 文字样式：预设表、每种浮现文字现在用哪套；set 只改这一页，save 存到这台设备 */
      looks: () => ({ looks: cfg().looks ?? {}, floatLook: cfg().floatLook ?? {} }),
      setLook: (style, patch) => {
        const fl = ((Q().fx ??= {}).floatLook ??= {});
        fl[style] = { ...(fl[style] ?? {}), ...patch };
      },
      saveLooks: () => {
        try {
          localStorage.setItem(LOOK_KEY, JSON.stringify({ floatLook: cfg().floatLook ?? {} }));
        } catch {}
      },
      clearLooks: () => {
        try {
          localStorage.removeItem(LOOK_KEY);
        } catch {}
      },
    };
  };

  if (window.tobatsu?.ready) start();
  else window.addEventListener('tobatsu:ready', start, { once: true });
})();
