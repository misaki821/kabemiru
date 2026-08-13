/* ==========================================================================
   symbols.js — 図に置く部品の絵(設計書5-5「簡略記号+凡例」方式)
   方針: 記号(コンセント等)は「読める固定サイズで描き、位置だけ実寸(mm)」。
        窓・ドア・家具の枠は実寸どおりの大きさで描く。
   どの関数も「SVGの文字列」を返すだけで、画面を直接いじらない。
   ========================================================================== */

import { switchVariantOf, DEFAULT_LIGHT_KIND } from './presets.js';

/** 記号の外形の大きさ(px)。当たり判定・選択枠の計算にも使う */
export const SYMBOL_SIZE = {
  outlet:        { w: 20, h: 32 },   // コンセント: 白い縦長四角
  'outlet-info': { w: 20, h: 32 },   // 情報コンセント: コンセントと同じ四角+下に TV/LAN/TEL の文字
  switch:        { w: 18, h: 18 },   // スイッチ: 白い正方形
  light:         { w: 24, h: 24 },   // 照明: 円+種別文字
  remote:        { w: 28, h: 14 },   // リモコン類: 細長い四角
  intercom:      { w: 24, h: 24 },   // インターホン: 円+「T」
  panel:         { w: 30, h: 24 },   // 分電盤・情報ボックス: 破線の四角
  vent:          { w: 22, h: 22 },   // 給気口・換気: 破線の四角+横線(ルーバー)
  other:         { w: 20, h: 20 },   // それ以外の受け皿: 白四角
};

const COLOR_NORMAL = '#111';
const COLOR_WARN   = '#cc0000';   // 確度=check(要営業確認)は赤で描く(設計書5-4)
const COLOR_GLASS  = '#eef4fa';   // 窓・ドアの内側の色(水色)

/** 文字をSVGに埋め込む前に、記号としての意味を持つ文字を無害化する */
export function escapeXml(text) {
  return String(text == null ? '' : text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** その部品を赤で描くか(要営業確認かどうか) */
export function isWarn(element) {
  return !!element && element.confidence === 'check';
}

/** 記号の種類ごとの大きさを返す */
export function sizeOf(fixture) {
  return SYMBOL_SIZE[fixture.type] || SYMBOL_SIZE.other;
}

/* --------------------------------------------------------------------------
   高さの基準(hRef・設計書4-3)
   h は既定では記号の「中心」の高さだが、図面に「上端1,410」のように書かれている場合は
   hRef="top"(または "bottom")で持つ。描画とラベルの文言をここで合わせる。
   -------------------------------------------------------------------------- */

/** hRefに応じて、記号の中心を h の位置から何pxずらすか(SVGのYは下向きが+) */
export function hRefOffsetPx(fx) {
  const size = sizeOf(fx);
  if (fx.hRef === 'top')    return size.h / 2;    // 上端が h の位置 → 中心はその下
  if (fx.hRef === 'bottom') return -size.h / 2;   // 下端が h の位置 → 中心はその上
  return 0;
}

/** ラベルに付ける但し書き(例「床から141cm(上端)」) */
export function hRefSuffix(fx) {
  if (fx.hRef === 'top')    return '(上端)';
  if (fx.hRef === 'bottom') return '(下端)';
  return '';
}

/** 寸法線の見出し(例「上端 床から 1,410」) */
export function hRefDimLabel(fx) {
  if (fx.hRef === 'top')    return '上端 床から';
  if (fx.hRef === 'bottom') return '下端 床から';
  return '床から';
}

/* ==========================================================================
   電気記号(fixtures)
   ========================================================================== */

/**
 * 記号1個を描く。
 * @param {object} fx  fixture(設計書4-3)
 * @param {number} cx  記号の中心のX(px)  ← 位置だけがmmから換算された値
 * @param {number} cy  記号の中心のY(px)
 * @returns {{svg: string, box: {x,y,w,h}}}  絵の文字列と、外形の四角(px)
 */
export function drawFixture(fx, cx, cy) {
  const color = isWarn(fx) ? COLOR_WARN : COLOR_NORMAL;
  const size = sizeOf(fx);
  const box = { x: cx - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h };
  const attrs = fx.attrs || {};
  let svg = '';

  if (fx.type === 'outlet') {
    // コンセント: 白い縦長四角 + 黒点×口数(+ アース付なら「E」)
    svg = box4(box, '#fff', color, 1.6) + dots(cx, cy - 4, clamp(fx.gangs || 1, 1, 4), color);
    if (attrs.earth) svg += text(cx, cy + 12, 'E', 9, color, 'middle');
  } else if (fx.type === 'outlet-info') {
    // 情報コンセント: コンセントと同じ四角 + 下に種別の文字(TV/LAN/TEL)
    svg = box4(box, '#fff', color, 1.6) + dots(cx, cy - 4, clamp(fx.gangs || 1, 1, 4), color);
    if (attrs.earth) svg += text(cx, cy + 12, 'E', 9, color, 'middle');
    const kinds = infoKinds(attrs);
    if (kinds) svg += text(cx, cy + box.h / 2 + 9, escapeXml(kinds), 9, color, 'middle');
  } else if (fx.type === 'remote') {
    // リモコン類(床暖・給湯など): 細長い四角。中に横線を1本入れて操作面らしく見せる
    svg = box4(box, '#fff', color, 1.4)
        + line(cx - box.w / 2 + 5, cy, cx + box.w / 2 - 5, cy, color, 1);
  } else if (fx.type === 'intercom') {
    // インターホン: 円+「T」(設計書5-5)
    svg = `<circle cx="${r(cx)}" cy="${r(cy)}" r="11" fill="#fff" stroke="${color}" stroke-width="1.6"/>`
        + text(cx, cy + 4, 'T', 12, color, 'middle');
  } else if (fx.type === 'panel') {
    // 分電盤・情報ボックス等: 破線の四角(外形寸法は要営業確認なので点線で「概略」を示す)
    svg = box4(box, '#fff', color, 1.4, '4 3');
  } else if (fx.type === 'vent') {
    // 給気口・換気: 破線の四角 + 横線2本(ルーバー)。分電盤との違いは中の横線
    svg = box4(box, '#fff', color, 1.4, '3 2');
    for (const dy of [-4, 0, 4]) {
      svg += line(cx - box.w / 2 + 4, cy + dy, cx + box.w / 2 - 4, cy + dy, color, 0.9);
    }
  } else if (fx.type === 'switch') {
    // スイッチ: 白い正方形 + 黒点×連数(3路は「3」を併記)
    // ※ 種別(ほたる・調光など)で絵柄は変えない。種別はラベルの文字で示す(設計書5-5)。
    //    例外は「かってに(人感)」で、これだけ大きめの黒点1つで描く。
    svg = box4(box, '#fff', color, 1.6);
    svg += isSensorSwitch(fx)
      ? triangle(cx, cy, color)      // かってに(人感)は黒い▲(黒点=ボタンの数との混同を避ける)
      : dots(cx, cy, clamp(fx.gangs || 1, 1, 4), color);
    if (attrs.threeWay) svg += text(cx + 15, cy - 6, '3', 11, color, 'middle');
  } else if (fx.type === 'light') {
    // 照明: 円 + 種別文字(D=ダウンライト/S=シーリング/P=ペンダント/B=ブラケット)
    svg = `<circle cx="${r(cx)}" cy="${r(cy)}" r="11" fill="#fff" stroke="${color}" stroke-width="1.6"/>`
        + text(cx, cy + 4, escapeXml(attrs.lightKind || DEFAULT_LIGHT_KIND), 12, color, 'middle');
  } else {
    svg = box4(box, '#fff', color, 1.4);
  }
  return { svg, box };
}

/** 情報コンセントの種別を「TV/LAN/TEL」の形にまとめる(attrsの正式キーは presets.js の ATTR_KEYS) */
function infoKinds(attrs) {
  return ['tv', 'lan', 'tel'].filter((k) => attrs[k]).map((k) => k.toUpperCase()).join('/');
}

/**
 * 「かってに(人感)」スイッチか。
 * 旧データ(attrs.sensor / attrs.motion が true)もここで面倒を見る。
 */
export function isSensorSwitch(fx) {
  const attrs = fx.attrs || {};
  return attrs.variant === 'sensor' || attrs.sensor === true || attrs.motion === true;
}

/** 黒い▲(かってに=人感スイッチの印。設計書5-5) */
function triangle(cx, cy, color) {
  const points = `${r(cx)},${r(cy - 5.5)} ${r(cx - 5.5)},${r(cy + 4.5)} ${r(cx + 5.5)},${r(cy + 4.5)}`;
  return `<polygon points="${points}" fill="${color}"/>`;
}

/** 黒点を縦に並べる(口数・連数の表現) */
function dots(cx, cy, count, color) {
  const gap = 6;
  const top = cy - ((count - 1) * gap) / 2;
  let out = '';
  for (let i = 0; i < count; i++) {
    out += `<circle cx="${r(cx)}" cy="${r(top + i * gap)}" r="1.9" fill="${color}"/>`;
  }
  return out;
}

/* ==========================================================================
   窓・ドア(openings) — 実寸の四角で描く。位置は左下基準(設計書4-1)
   ========================================================================== */

/**
 * 窓・ドア1つを描く。
 * @param {object} op    opening(設計書4-3)
 * @param {object} box   pxの外形 {x, y, w, h}(左上が原点)
 * @param {object} label ラベルの置き場所 { cx, lines, baselineY }(render.jsのlayoutLabelsが決める)
 *                       省略すると枠の中央上に1行で描く(従来どおり)
 */
export function drawOpening(op, box, label) {
  const color = isWarn(op) ? COLOR_WARN : '#222';
  let svg = box4(box, COLOR_GLASS, color, 1.8);

  // パネル(FIX部・ドア部)の区切り線。幅の比率で位置を出す
  let acc = 0;
  (op.panels || []).slice(0, -1).forEach((panel) => {
    acc += panel.width;
    const px = box.x + (acc / op.width) * box.w;
    svg += line(px, box.y, px, box.y + box.h, color, 1.2);
  });

  // 種類ごとの印
  if (op.kind === 'slidingWindow') {
    // 引違い窓: 中央の縦線と左右の矢印(横にスライドする窓)
    const mid = box.x + box.w / 2;
    const y = box.y + box.h * 0.6;
    svg += line(mid, box.y, mid, box.y + box.h, color, 1.2);
    svg += arrowH(mid - 8, box.x + box.w * 0.15, y, color, -1);
    svg += arrowH(mid + 8, box.x + box.w * 0.85, y, color, 1);
  } else if (op.kind === 'door') {
    svg += doorMark(op, box, color);
  } else if (op.kind === 'fix') {
    svg += text(box.x + box.w / 2, box.y + box.h - 8, 'FIX', 10, color, 'middle');
  }

  // ラベル(名前・型番)は枠の中の上のほうに置く。長い名前は折り返して複数行になる
  if (label) {
    const last = label.lines.length - 1;
    label.lines.forEach((line, i) => {
      // 型番(productCode)は最後の行。少し小さく灰色で描く
      const isCode = op.productCode && i === last;
      svg += text(label.cx, label.baselineY + i * 15, escapeXml(line),
                  isCode ? 11 : 12, isCode ? '#666' : color, 'middle');
    });
  } else if (op.label) {
    svg += text(box.x + box.w / 2, box.y + 16, escapeXml(op.label), 12, color, 'middle');
  }
  return svg;
}

/** ドアの開く向きの印(開き戸=破線の三角 / 引戸=矢印) */
function doorMark(op, box, color) {
  const panel = (op.panels || [])[0] || {};
  const hinge = panel.hinge === 'right' ? 'right' : 'left';
  if (panel.swing === 'slide') {
    // 引戸: 開く方向へ矢印
    const dir = hinge === 'right' ? 1 : -1;
    const y = box.y + box.h * 0.5;
    return arrowH(box.x + box.w * (dir === 1 ? 0.3 : 0.7),
                  box.x + box.w * (dir === 1 ? 0.85 : 0.15), y, color, dir);
  }
  // 開き戸: 軸(吊元)側の上下から、反対側の中央へ破線(開き勝手の略記)
  const hx = hinge === 'right' ? box.x + box.w : box.x;
  const ox = hinge === 'right' ? box.x : box.x + box.w;
  return line(hx, box.y, ox, box.y + box.h / 2, color, 0.8, '4 3')
       + line(hx, box.y + box.h, ox, box.y + box.h / 2, color, 0.8, '4 3');
}

/* ==========================================================================
   家具・棚の枠(furniture) — 点線の四角+ラベル
   ========================================================================== */

/**
 * @param {object} label ラベルの置き場所 { cx, lines, baselineY }(render.jsのlayoutLabelsが決める)。
 *                       長い名前が図の外で切れたり、他のラベルと重なったりしない位置に寄せてある。
 *                       省略すると枠の中央下に1行で描く。
 */
export function drawFurnitureBox(fu, box, label) {
  const color = isWarn(fu) ? COLOR_WARN : '#333';
  let svg = `<rect x="${r(box.x)}" y="${r(box.y)}" width="${r(box.w)}" height="${r(box.h)}" `
          + `fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="6 4"/>`;
  if (label) {
    label.lines.forEach((line, i) => {
      svg += text(label.cx, label.baselineY + i * 14, escapeXml(line), 11, color, 'middle');
    });
  } else if (fu.label) {
    svg += text(box.x + box.w / 2, box.y + box.h - 10, escapeXml(fu.label), 11, color, 'middle');
  }
  return svg;
}

/* ==========================================================================
   凡例用の小さい絵(設計書5-5「凡例を必ず含める」)
   ========================================================================== */

export function legendSymbol(kind, cx, cy, warn = false) {
  const conf = warn ? 'check' : 'official';
  // 電気記号は本物と同じ関数で描く(凡例と図の絵柄が食い違わないように)
  const sample = {
    outlet:        { type: 'outlet', gangs: 2 },
    'outlet-info': { type: 'outlet-info', gangs: 2, attrs: { tv: true } },
    switch:        { type: 'switch', gangs: 2 },
    light:         { type: 'light' },
    remote:        { type: 'remote' },
    intercom:      { type: 'intercom' },
    panel:         { type: 'panel' },
    vent:          { type: 'vent' },
    other:         { type: 'other' },
  }[kind];
  if (sample) return drawFixture({ attrs: {}, ...sample, confidence: conf }, cx, cy).svg;
  if (kind === 'opening') return box4({ x: cx - 13, y: cy - 10, w: 26, h: 20 }, COLOR_GLASS, '#222', 1.4);
  // 家具・棚の枠
  return `<rect x="${r(cx - 13)}" y="${r(cy - 10)}" width="26" height="20" fill="none" `
       + `stroke="#333" stroke-width="1.3" stroke-dasharray="4 3"/>`;
}

/* ==========================================================================
   名前(ラベルが空のときに図へ出す既定の呼び名)
   ========================================================================== */

export function defaultName(el, kind) {
  if (kind === 'fixtures') {
    const attrs = el.attrs || {};
    if (el.type === 'outlet') return `コンセント ${el.gangs || 1}口${attrs.earth ? '・アース付' : ''}`;
    if (el.type === 'switch') {
      // 種別の呼び名(ほたるスイッチ 等)をそのまま名前にする
      const name = switchVariantOf(isSensorSwitch(el) ? 'sensor' : attrs.variant).name;
      return `${name} ${el.gangs || 1}個${attrs.threeWay ? '・3路' : ''}`;
    }
    if (el.type === 'light')  return '照明';
    // パレットには無いが、読み込んだデータに入っている種別(設計書5-5)
    if (el.type === 'outlet-info') return `情報コンセント${infoKinds(attrs) ? `(${infoKinds(attrs)})` : ''}`;
    if (el.type === 'remote')   return 'リモコン';
    if (el.type === 'intercom') return 'インターホン';
    if (el.type === 'panel')    return '分電盤・情報ボックス';
    if (el.type === 'vent')     return '給気口・換気';
    return 'その他の部品';
  }
  if (kind === 'openings')  return '窓・ドア';
  if (kind === 'furniture') return '家具・棚の枠';
  return 'メモ';
}

/* ==========================================================================
   小さな部品
   ========================================================================== */

/** 四角(枠付き)。dash を渡すと破線になる */
function box4(box, fill, stroke, width, dash) {
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<rect x="${r(box.x)}" y="${r(box.y)}" width="${r(box.w)}" height="${r(box.h)}" `
       + `fill="${fill}" stroke="${stroke}" stroke-width="${width}"${d}/>`;
}

function line(x1, y1, x2, y2, color, width, dash) {
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" `
       + `stroke="${color}" stroke-width="${width}"${d}/>`;
}

function text(x, y, body, size, color, anchor) {
  return `<text x="${r(x)}" y="${r(y)}" font-size="${size}" fill="${color}" `
       + `text-anchor="${anchor}">${body}</text>`;
}

/** 横向きの矢印(dir=1で右向き) */
function arrowH(from, to, y, color, dir) {
  return line(from, y, to, y, color, 1)
       + line(to, y, to - dir * 6, y - 3, color, 1)
       + line(to, y, to - dir * 6, y + 3, color, 1);
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }

/** 座標を小数1桁に丸める(SVGの文字列を短く読みやすくするため) */
function r(v) { return Math.round(v * 10) / 10; }
