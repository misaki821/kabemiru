/* ==========================================================================
   render.js — JSON(データ)からSVG(図)を丸ごと作る
   設計書6-1「JSON→全SVG再描画の一方通行」の中心。
   画面の一部だけを書き換えることはせず、操作のたびにここで図を作り直す。
   ========================================================================== */

import {
  drawFixture, drawOpening, drawFurnitureBox, drawBackingBox, hatchDefs, legendSymbol, sizeOf,
  escapeXml, isWarn, defaultName, isSensorSwitch,
  hRefOffsetPx, hRefSuffix, hRefDimLabel,
} from './symbols.js';
import { switchVariantOf } from './presets.js';
import { drawWallDims, drawElementDims, formatMm, cmText } from './dimensions.js';

/** 図の横幅(px)。SVGのviewBoxはこの幅で、画面幅に合わせて伸縮させる */
export const VIEW = { w: 1200 };

/** 文字のブロック(タイトル・メモ・凡例)を置く範囲 */
const AREA = { x: 150, y: 95, w: 900, h: 515 };

/**
 * 壁の絵を描く領域(この中に収まるように縮尺を自動で決める)。
 * 左右はAREAより広く取ってある(横長の壁ほど大きく描けるようにするため・検証B-4)。
 * 中心はAREAと同じ600pxなので、ふつうの縦横比の壁では見た目が変わらない。
 * maxH = 高さの上限。壁が横長で背が低くなるぶんは図全体を短くする(上半分が空白になるのを防ぐ)。
 */
const WALL_AREA = { x: 95, w: 1010, maxH: 515 };

/** 書き出し画像の透かし(設計書8-3。消せない仕様) */
const WATERMARK = '検討用概略図・正式図面ではありません｜カベミル kabemiru.com';

const FONT = "Meiryo, 'Yu Gothic', 'Hiragino Kaku Gothic ProN', sans-serif";
const COLOR_WARN = '#cc0000';
const COLOR_SELECT = '#ff8c00';   // 選択中の枠(オレンジ)。赤は「要営業確認」専用のため別の色にする
const MARGIN = 20;                // 文字を図の外にはみ出させないための左右の余白(px)

/* --------------------------------------------------------------------------
   ★ 座標変換(設計書6-2)★
   mm→px と px→mm の計算は、この2つの関数だけで行う。
   ・図面のX: 壁の左端から右向きが+
   ・図面の高さ: 床から上向きが+   / SVGのYは下向きが+ なので、ここで上下を反転する
   -------------------------------------------------------------------------- */

/** 直前の描画で使った縮尺と原点(px)。原点=壁の左下(床の高さ) */
let view = { originX: AREA.x, originY: AREA.y + AREA.h, scale: 0.25 };

/** mm(壁の左端からの距離・床からの高さ)→ SVGの座標(px) */
export function mmToPx(xMm, hMm) {
  return {
    x: view.originX + xMm * view.scale,
    y: view.originY - hMm * view.scale,   // ← ここでY軸を反転している
  };
}

/** SVGの座標(px)→ mm(壁の左端からの距離・床からの高さ)。クリック位置の判定に使う */
export function pxToMm(px, py) {
  return {
    x: (px - view.originX) / view.scale,
    h: (view.originY - py) / view.scale,  // ← 反転を元に戻す
  };
}

/** 直前の描画の縮尺・原点 */
export function getView() { return { ...view }; }

/**
 * 窓・ドア・家具の枠・下地のpx外形を求める(左下基準のデータ → 左上基準のpx)
 * @param {string} kind 'openings' / 'furniture' / 'backing'
 */
export function elementBox(kind, el) {
  const bottom = kind === 'openings' ? el.sillHeight : el.bottom;
  const topLeft = mmToPx(el.x, bottom + el.height);
  const bottomRight = mmToPx(el.x + el.width, bottom);
  return { x: topLeft.x, y: topLeft.y, w: bottomRight.x - topLeft.x, h: bottomRight.y - topLeft.y };
}

/* --------------------------------------------------------------------------
   図の作成(入口)
   -------------------------------------------------------------------------- */

/**
 * 壁1枚のSVGを文字列で作る。
 * @param {object} wall  壁のデータ(設計書4-3)
 * @param {object} opts  { selectedId: 選択中のid, forExport: 書き出し用ならtrue }
 */
export function buildSvg(wall, opts = {}) {
  const { selectedId = null, forExport = false } = opts;

  // --- 縮尺と原点を決める(壁が領域に収まる大きさ。保存データには入れない) ---
  const scale = Math.min(WALL_AREA.w / wall.width, WALL_AREA.maxH / wall.height);
  const wallW = wall.width * scale;
  const wallH = wall.height * scale;
  view = {
    scale,
    originX: WALL_AREA.x + (WALL_AREA.w - wallW) / 2,   // 領域の中で左右中央に置く
    originY: AREA.y + wallH,                            // 床の高さ(壁の上端がAREA.yに来る位置)
  };

  // --- ラベルの位置を先に決める(重なりを避けて段をずらす・検証B-1) ---
  // 段をずらした結果ラベルが壁の上へはみ出すぶんは、図全体を下げて場所を空ける
  const labels = layoutLabels(wall, { ...view, wallW, wallH });
  const band = Math.max(0, LABEL_TOP - labels.minY);
  view.originY += band;
  labels.shift(band);
  const geo = { ...view, wallW, wallH };

  // --- 図の下側(メモ一覧→凡例→透かし)---
  // メモの行数・凡例の折り返し行数に応じて、図の高さが自動で伸びる
  const notesY = view.originY + 96;    // 壁の幅の寸法線より下から始める
  const notes = drawNotes(wall, notesY, selectedId, forExport);
  const legendY = notesY + notes.height;
  const legend = drawLegend(legendY, wall);
  const height = Math.ceil(legendY + legend.height + 34);

  const parts = [];
  parts.push(hatchDefs());   // 下地の斜線パターン(凡例でも使うので常に入れる)
  parts.push(`<rect x="0" y="0" width="${VIEW.w}" height="${height}" fill="#ffffff"/>`);
  parts.push(drawTitle(wall));
  parts.push(drawWallBody(wall, geo));
  parts.push(drawBacking(wall, labels, selectedId, forExport));   // 壁の中の補強=いちばん下に描く
  parts.push(drawOpenings(wall, labels, selectedId, forExport));
  parts.push(drawFurniture(wall, labels, selectedId, forExport));
  parts.push(drawFixtures(labels, selectedId, forExport));
  parts.push(drawWallDims(wall, geo));
  parts.push(drawSelectedDims(wall, geo, selectedId));
  parts.push(notes.svg);
  parts.push(legend.svg);
  parts.push(drawWatermark(height));

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${VIEW.w}" height="${height}" `
       + `viewBox="0 0 ${VIEW.w} ${height}" font-family="${FONT}">`
       + parts.join('\n') + '</svg>';
}

/* --------------------------------------------------------------------------
   タイトル帯
   -------------------------------------------------------------------------- */

const FACE_NAMES = { north: '北の壁', south: '南の壁', east: '東の壁', west: '西の壁' };

/** 壁の表示名(ヘッダー・図のタイトル・ファイル名に使う) */
export function wallTitle(wall) {
  const face = FACE_NAMES[wall.face] || '';
  const main = [wall.floor, wall.room, face].filter(Boolean).join(' ');
  return wall.faceLabel ? `${main}(${wall.faceLabel})` : main;
}

function drawTitle(wall) {
  const sub = `単位:mm ／ 床仕上げ面=±0 ／ 幅 ${formatMm(wall.width)} × 天井の高さ ${formatMm(wall.height)}`;
  return `<text x="${AREA.x}" y="36" font-size="20" fill="#111">${escapeXml(wallTitle(wall))}</text>`
       + `<text x="${AREA.x}" y="60" font-size="12" fill="#666">${escapeXml(sub)}</text>`;
}

/* --------------------------------------------------------------------------
   壁そのもの(外形・床の線・左右のラベル)
   -------------------------------------------------------------------------- */

function drawWallBody(wall, geo) {
  const { originX, originY, wallW, wallH } = geo;
  const top = originY - wallH;
  let svg = `<rect x="${r(originX)}" y="${r(top)}" width="${r(wallW)}" height="${r(wallH)}" `
          + `fill="#ffffff" stroke="#222" stroke-width="2.5"/>`;
  // 床の線は少し太くして「ここが床」と分かるようにする
  svg += `<line x1="${r(originX)}" y1="${r(originY)}" x2="${r(originX + wallW)}" y2="${r(originY)}" `
       + `stroke="#222" stroke-width="3.5"/>`;
  if (wall.leftLabel) {
    svg += `<text x="${r(originX)}" y="${r(top - 10)}" font-size="12" fill="#444">${escapeXml(wall.leftLabel)}</text>`;
  }
  if (wall.rightLabel) {
    svg += `<text x="${r(originX + wallW)}" y="${r(top - 10)}" font-size="12" fill="#444" `
         + `text-anchor="end">${escapeXml(wall.rightLabel)}</text>`;
  }
  // TODO(v2): floorZones(床の段差)の描画。いまは床を±0の一段として描いている
  return svg;
}

/* --------------------------------------------------------------------------
   窓・ドア / 家具の枠(絵そのものは symbols.js が描く)
   -------------------------------------------------------------------------- */

function drawOpenings(wall, labels, selectedId, forExport) {
  return wall.openings.map((op) => {
    const box = elementBox('openings', op);
    return pickable(op.id, drawOpening(op, box, labels.byId.get(op.id)), box, selectedId, forExport);
  }).join('\n');
}

function drawFurniture(wall, labels, selectedId, forExport) {
  return wall.furniture.map((fu) => {
    const box = elementBox('furniture', fu);
    // 家具・棚の枠だけ、選んでいるあいだは大きさを変えるつまみ(ハンドル)を出す
    const handles = fu.id === selectedId && !forExport ? resizeHandles(fu.id, box) : '';
    const body = drawFurnitureBox(fu, box, labels.byId.get(fu.id));
    return pickable(fu.id, body, box, selectedId, forExport, handles);
  }).join('\n');
}

/** 下地(壁の補強)。家具の枠と同じく、選んでいるあいだは大きさを変えるつまみを出す */
function drawBacking(wall, labels, selectedId, forExport) {
  return (wall.backing || []).map((bk) => {
    const box = elementBox('backing', bk);
    const handles = bk.id === selectedId && !forExport ? resizeHandles(bk.id, box) : '';
    const body = drawBackingBox(bk, box, labels.byId.get(bk.id));
    return pickable(bk.id, body, box, selectedId, forExport, handles);
  }).join('\n');
}

/**
 * 大きさを変えるつまみ(右端=幅・上端=高さ・右上=両方)。
 * data-handle を付けておき、ui.js側で「移動」ではなく「大きさ変更」だと判断する。
 * 書き出し(PNG/SVG)には入れない。
 */
function resizeHandles(id, box) {
  const spots = [
    { dir: 'e',  x: box.x + box.w,     y: box.y + box.h / 2, cursor: 'ew-resize' },
    { dir: 'n',  x: box.x + box.w / 2, y: box.y,             cursor: 'ns-resize' },
    { dir: 'ne', x: box.x + box.w,     y: box.y,             cursor: 'nesw-resize' },
  ];
  return spots.map((s) =>
    `<rect data-id="${escapeXml(id)}" data-handle="${s.dir}" x="${r(s.x - 5)}" y="${r(s.y - 5)}" `
    + `width="10" height="10" fill="#ffffff" stroke="${COLOR_SELECT}" stroke-width="2" `
    + `style="cursor:${s.cursor}"/>`).join('');
}

/* --------------------------------------------------------------------------
   電気記号 + 引き出し線 + ラベル
   -------------------------------------------------------------------------- */

/** ラベル1行の高さ(px) */
const LABEL_LINE_H = 15;
/** ラベルの折り返し幅(px)。長い注記が図の横幅いっぱいに伸びるのを防ぐ */
const LABEL_MAX_W = 300;
/** 重なりを避けるときに1段ずらす量(px) */
const LABEL_TIER = 18;
/** ラベルを上へ逃がせる限界(px)。タイトル帯の下 */
const LABEL_TOP = 80;
/** 記号の中心からラベルの基準点までの横の距離(px) */
const LABEL_GAP = 38;

/**
 * 直前の描画で自動的にずらしたラベルの量(mm)。id → {dx, dy}
 * ラベルをドラッグし始めたときに、この値を引き継いで labelOffset に書き込む
 * (つかんだ瞬間にラベルが元の位置へ飛ばないようにするため)。
 */
let lastLabelAuto = new Map();

/** 自動配置で使ったずらし量(mm)を返す。ui.js がラベルのドラッグ開始時に使う */
export function getAutoLabelOffset(id) {
  return lastLabelAuto.get(id) || { dx: 0, dy: 0 };
}

/**
 * ★ラベルの自動配置(検証B-1)★
 * 同じ壁の中でラベル同士(および窓・家具のラベル・記号そのもの)が重なる場合、
 * 上下に段をずらして重ならない場所を探す。完璧な最適配置は狙わず「読める」ことを優先する。
 * labelOffset(手動でずらした指定)があるラベルは、その位置を尊重して自動配置しない。
 * @returns {{ list: object[], byId: Map, minY: number }}
 */
function layoutLabels(wall, geo) {
  const blockers = [];      // すでに場所が決まっている文字・記号(ここは避ける)
  const byId = new Map();
  let minY = Infinity;

  // --- 1. 記号そのもの。位置は動かせないので最初に押さえる ---
  const list = wall.fixtures.map((fx) => makePlacement(fx, geo));
  list.forEach((pl) => {
    const extra = pl.fx.type === 'outlet-info' ? 12 : 0;   // 記号の下に出る TV/LAN の文字ぶん
    blockers.push(grow(pl.symbolBox, 3, extra));
  });

  // --- 2. 窓・ドアのラベル(枠の中の上のほう。混んでいたら下へ逃がす) ---
  wall.openings.forEach((op) => {
    const box = elementBox('openings', op);
    // 長い名前は枠の幅に合わせて折り返す(隣の窓のラベルと重ならないようにするため)
    const lines = op.label ? wrapText(op.label, 12, Math.max(box.w - 4, 180)) : [];
    if (op.productCode) lines.push(op.productCode);
    if (!lines.length) return;
    const cx = box.x + box.w / 2;
    const make = (shift) => blockBox(cx, box.y + 16 + shift, lines, 12, LABEL_LINE_H);
    const shift = findShift(make, downShifts(), blockers);
    byId.set(op.id, { cx, lines, baselineY: box.y + 16 + shift });
    blockers.push(grow(make(shift), 2, 0));
  });

  // --- 3. 家具・棚のラベル(枠の中の下のほう。混んでいたら上へ逃がす) ---
  wall.furniture.forEach((fu) => {
    const box = elementBox('furniture', fu);
    const lines = fu.label ? wrapText(fu.label, 11, Math.max(box.w - 4, 180)) : [];
    if (!lines.length) return;
    // 長い名前が図の外で切れないように中心を寄せる
    const width = Math.max(...lines.map((l) => estimateTextWidth(l, 11))) * 1.06;
    const cx = clampCenterX(box.x + box.w / 2, width);
    const bottom = box.y + box.h - 10;                       // 最終行の文字の下端
    const first = (shift) => bottom - (lines.length - 1) * 14 + shift;
    const make = (shift) => blockBox(cx, first(shift), lines, 11, 14);
    const shift = findShift(make, upShifts(), blockers);
    byId.set(fu.id, { cx, lines, baselineY: first(shift) });
    blockers.push(grow(make(shift), 2, 0));
  });

  // --- 3'. 下地のラベル(枠の中央。記号などと重なるときは上下に逃がす) ---
  (wall.backing || []).forEach((bk) => {
    const box = elementBox('backing', bk);
    const lines = bk.label ? wrapText(bk.label, 11, Math.max(box.w - 4, 180)) : [];
    if (!lines.length) return;
    const width = Math.max(...lines.map((l) => estimateTextWidth(l, 11))) * 1.06;
    const cx = clampCenterX(box.x + box.w / 2, width);
    const first = (shift) => box.y + box.h / 2 + 4 - ((lines.length - 1) * 14) / 2 + shift;
    const make = (shift) => blockBox(cx, first(shift), lines, 11, 14);
    const shift = findShift(make, tierShifts(), blockers);
    byId.set(bk.id, { cx, lines, baselineY: first(shift) });
    blockers.push(grow(make(shift), 2, 0));
  });

  // --- 4. 記号のラベル。左にあるものから順に、重ならない段を探して置く ---
  [...list].sort((a, b) => a.px - b.px).forEach((pl) => {
    if (!pl.manual) {
      for (const shift of tierShifts()) {
        const box = labelBox(pl, shift);
        if (box.y + box.h > geo.originY + 26) continue;      // 床より下(寸法線の場所)には出さない
        if (!blockers.some((b) => overlaps(box, b))) { pl.autoDy = shift; break; }
      }
    }
    pl.anchorY += pl.autoDy;
    blockers.push(grow(labelBox(pl, 0), 2, 0));
    byId.set(pl.fx.id, pl);
    minY = Math.min(minY, labelBox(pl, 0).y);
  });

  // ドラッグ開始時に引き継げるよう、自動でずらした量をmmで覚えておく
  lastLabelAuto = new Map(list.map((pl) => [pl.fx.id, { dx: 0, dy: Math.round(pl.autoDy / view.scale) }]));

  /** 図全体を下へずらす(ラベルが上へはみ出したぶんの場所を空けるとき) */
  const shift = (band) => {
    if (!band) return;
    list.forEach((pl) => { pl.anchorY += band; pl.py += band; pl.symbolBox.y += band; });
    byId.forEach((pl) => { if (pl.baselineY != null) pl.baselineY += band; });
  };
  return { list, byId, shift, minY: Math.min(minY, geo.originY - geo.wallH) };
}

/**
 * 試す段のずらし量(px)。上を優先しつつ、上下に少しずつ広げていく。
 * 要素が多い壁では上へ大きく逃がすことになるが、その場合は図全体が下がって場所ができる。
 */
function tierShifts() {
  const shifts = [0];
  for (let i = 1; i <= 45; i++) shifts.push(-i * LABEL_TIER, i * LABEL_TIER);
  return shifts;
}

/** 下へ逃がす順(窓・ドアのラベル用) */
function downShifts() {
  const shifts = [];
  for (let i = 0; i <= 8; i++) shifts.push(i * LABEL_LINE_H);
  for (let i = 1; i <= 3; i++) shifts.push(-i * LABEL_LINE_H);
  return shifts;
}

/** 上へ逃がす順(家具・棚のラベル用) */
function upShifts() {
  const shifts = [];
  for (let i = 0; i <= 8; i++) shifts.push(-i * 14);
  for (let i = 1; i <= 3; i++) shifts.push(i * 14);
  return shifts;
}

/** 重ならない場所が見つかるまで、ずらし量を順に試す(見つからなければ0=元の位置) */
function findShift(makeBox, shifts, blockers) {
  for (const shift of shifts) {
    if (!blockers.some((b) => overlaps(makeBox(shift), b))) return shift;
  }
  return 0;
}

/** ラベル1つぶんの内容と、ずらす前の位置を作る */
function makePlacement(fx, geo) {
  const warn = isWarn(fx);
  const p = mmToPx(fx.x, fx.h);
  const size = sizeOf(fx);
  const cy = p.y + hRefOffsetPx(fx);                        // hRef(上端/下端指定)を反映した記号の中心
  const symbolBox = { x: p.x - size.w / 2, y: cy - size.h / 2, w: size.w, h: size.h };

  // 壁の右半分にある記号はラベルを左に出す(図からはみ出さないように)
  const side = p.x < geo.originX + geo.wallW / 2 ? 1 : -1;
  const off = fx.labelOffset || {};

  // 1行目(名前・メモ)は長いことがあるので折り返す
  const lines = wrapText(fx.label || defaultName(fx, 'fixtures'), 13, LABEL_MAX_W).map((t) => ({ text: t, size: 13 }));
  lines.push({ text: `床から${cmText(fx.h)}${hRefSuffix(fx)}`, size: 12 });
  if (warn) lines.push({ text: '⚠要営業確認', size: 12 });

  // いちばん長い行の幅を見積もり、文字が図の外に出ない位置まで寄せる
  // (見積もりは概算なので、少し余分に見ておく)
  const textW = Math.max(...lines.map((l) => estimateTextWidth(l.text, l.size))) * 1.06;
  return {
    fx, side, lines, textW, symbolBox, px: p.x, py: cy,
    color: warn ? COLOR_WARN : '#111',
    manual: !!fx.labelOffset,        // 手動でずらしたラベルは自動配置しない
    autoDy: 0,
    anchorX: clampLabelX(p.x + side * LABEL_GAP + (off.dx || 0) * view.scale, side, textW),
    anchorY: cy - 32 + (off.dy || 0) * view.scale,
  };
}

/** ラベルの外形(px)。shift は段をずらす量 */
function labelBox(pl, shift) {
  return {
    x: pl.side === 1 ? pl.anchorX : pl.anchorX - pl.textW,
    y: pl.anchorY + shift - 12,          // 1行目の文字の上端
    w: pl.textW,
    h: pl.lines.length * LABEL_LINE_H,
  };
}

function drawFixtures(labels, selectedId, forExport) {
  return labels.list.map((pl) => {
    const { svg: symbol, box } = drawFixture(pl.fx, pl.px, pl.py);
    const label = drawFixtureLabel(pl, selectedId, forExport);
    return pickable(pl.fx.id, symbol + label, box, selectedId, forExport);
  }).join('\n');
}

/**
 * 記号のラベル(名前・床からの高さ・要営業確認)と引き出し線。
 * 位置は layoutLabels が決めたもの(自動の段組み+ labelOffset の手動ずらし)。
 * labelOffset の dx/dy は mm。dx=右向き+、dy=下向き+ で図の上をずらす。
 */
function drawFixtureLabel(pl, selectedId, forExport) {
  const box = labelBox(pl, 0);
  let svg = '';

  // 引き出し線: ラベルが記号から離れているときだけ描く(すぐ横なら線は不要)
  if (boxGap(pl.symbolBox, box) > 10) {
    const fromX = pl.px + pl.side * pl.symbolBox.w / 2;
    const fromY = pl.py;
    const toX = pl.side === 1 ? box.x - 4 : box.x + box.w + 4;
    const toY = clamp(fromY, box.y + 4, box.y + box.h - 2);
    svg += `<line x1="${r(fromX)}" y1="${r(fromY)}" x2="${r(toX)}" y2="${r(toY)}" `
         + `stroke="${pl.color}" stroke-width="0.8"/>`;
  }

  const align = pl.side === 1 ? 'start' : 'end';
  pl.lines.forEach((line, i) => {
    svg += `<text x="${r(pl.anchorX)}" y="${r(pl.anchorY + i * LABEL_LINE_H)}" font-size="${line.size}" `
         + `text-anchor="${align}" fill="${pl.color}">${escapeXml(line.text)}</text>`;
  });

  // 選んでいるあいだは、ラベルだけをドラッグでずらせる(data-label が目印)
  if (pl.fx.id === selectedId && !forExport) {
    svg += `<rect data-id="${escapeXml(pl.fx.id)}" data-label="1" `
         + `x="${r(box.x - 3)}" y="${r(box.y - 3)}" width="${r(box.w + 6)}" height="${r(box.h + 6)}" `
         + `fill="transparent" stroke="${COLOR_SELECT}" stroke-width="1" stroke-dasharray="3 3" `
         + `style="cursor:move"/>`;
  }
  return svg;
}

/* --- 重なり判定の小道具 --- */

/** 中央そろえ・複数行の文字の外形(px)。baselineY は1行目の文字の下端 */
function blockBox(cx, baselineY, lines, fontSize, lineH) {
  const w = Math.max(...lines.map((l) => estimateTextWidth(l, fontSize))) * 1.06;
  return { x: cx - w / 2, y: baselineY - fontSize, w, h: (lines.length - 1) * lineH + fontSize + 4 };
}

/** 四角を少し大きくする(pad=四方向・extraBottom=下だけ余分に) */
function grow(box, pad, extraBottom) {
  return { x: box.x - pad, y: box.y - pad, w: box.w + pad * 2, h: box.h + pad * 2 + extraBottom };
}

function overlaps(a, b) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** 2つの四角の間のすき間(px)。重なっていれば0 */
function boxGap(a, b) {
  const dx = Math.max(0, Math.max(a.x - (b.x + b.w), b.x - (a.x + a.w)));
  const dy = Math.max(0, Math.max(a.y - (b.y + b.h), b.y - (a.y + a.h)));
  return Math.max(dx, dy);
}

/**
 * ラベルの位置を「文字が図の外にはみ出さない範囲」に収める。
 * anchorX は文字の基準点で、side=1(左そろえ)は右へ、side=-1(右そろえ)は左へ文字が伸びるため、
 * 文字の幅ぶんを見込んで寄せないと、書き出したPNGで文字が切れてしまう。
 */
function clampLabelX(x, side, textWidth) {
  const min = side === 1 ? MARGIN : MARGIN + textWidth;
  const max = side === 1 ? VIEW.w - MARGIN - textWidth : VIEW.w - MARGIN;
  if (min > max) return side === 1 ? MARGIN : VIEW.w - MARGIN;   // 図の幅より長いラベルはこれ以上寄せられない
  return clamp(x, min, max);
}

/** 中央そろえの文字(家具の枠の名前)が図の外に出ないように、中心のXを寄せる */
function clampCenterX(cx, textWidth) {
  const half = textWidth / 2;
  const min = MARGIN + half;
  const max = VIEW.w - MARGIN - half;
  return min > max ? VIEW.w / 2 : clamp(cx, min, max);
}

/* --------------------------------------------------------------------------
   メモ(notes)— 位置を持たないので図の下部に一覧で出す(設計書3-1)
   -------------------------------------------------------------------------- */

function drawNotes(wall, y0, selectedId, forExport) {
  if (!wall.notes.length) return { svg: '', height: 0 };
  const lineH = 17;
  const maxW = AREA.w - 24;      // 枠からはみ出さない幅
  let svg = `<text x="${AREA.x}" y="${y0 + 14}" font-size="11" fill="#666">メモ</text>`;
  let lineY = y0 + 31;

  wall.notes.forEach((note) => {
    const warn = note.level === 'warning';
    const color = warn ? COLOR_WARN : '#333';
    // 長いメモは幅に合わせて折り返す
    const lines = wrapText(`${warn ? '⚠ ' : '・'}${note.text}`, 12, maxW);
    const inner = lines.map((line, i) =>
      `<text x="${AREA.x + 10}" y="${r(lineY + i * lineH)}" font-size="12" fill="${color}">`
      + `${escapeXml(line)}</text>`).join('');
    const box = { x: AREA.x + 6, y: lineY - 13, w: AREA.w - 12, h: lines.length * lineH };
    svg += pickable(note.id, inner, box, selectedId, forExport);
    lineY += lines.length * lineH;
  });
  return { svg, height: lineY - y0 + 8 };   // 凡例との間に少し余白を残す
}

/* --------------------------------------------------------------------------
   選択中の部品まわり(寸法・当たり判定・選択枠)
   -------------------------------------------------------------------------- */

/** 選んでいる部品の寸法(左から・床から)を描く */
function drawSelectedDims(wall, geo, selectedId) {
  if (!selectedId) return '';
  const fx = wall.fixtures.find((f) => f.id === selectedId);
  if (fx) {
    // hRef が上端/下端のときは、その位置を指したまま見出しを「上端 床から」に変える(検証B-3)
    const p = mmToPx(fx.x, fx.h);
    return drawElementDims(geo, p.x, p.y, fx.x, fx.h, hRefDimLabel(fx));
  }
  // 窓・ドア・家具は左下の角を基準に寸法を出す(設計書4-1)
  const op = wall.openings.find((o) => o.id === selectedId);
  if (op) {
    const p = mmToPx(op.x, op.sillHeight);
    return drawElementDims(geo, p.x, p.y, op.x, op.sillHeight, '下端 床から');
  }
  const fu = wall.furniture.find((f) => f.id === selectedId);
  if (fu) {
    const p = mmToPx(fu.x, fu.bottom);
    return drawElementDims(geo, p.x, p.y, fu.x, fu.bottom, '下端 床から');
  }
  const bk = (wall.backing || []).find((b) => b.id === selectedId);
  if (bk) {
    const p = mmToPx(bk.x, bk.bottom);
    return drawElementDims(geo, p.x, p.y, bk.x, bk.bottom, '下端 床から');
  }
  return '';   // メモには位置が無いので寸法も無い
}

/**
 * クリックで選べるようにグループで包む。
 * ・data-id を付けておき、ui.js側でクリックされた部品を特定する
 * ・透明な四角を重ねて、細い線でもつまみやすくする
 * ・選択中はオレンジの枠を描く(書き出し画像には入れない)
 */
function pickable(id, innerSvg, box, selectedId, forExport, overlaySvg = '') {
  const frame = (fill, extra) =>
    `<rect x="${r(box.x - 5)}" y="${r(box.y - 5)}" width="${r(box.w + 10)}" height="${r(box.h + 10)}" `
    + `fill="${fill}"${extra}/>`;
  let svg = `<g data-id="${escapeXml(id)}" style="cursor:move">`;
  if (!forExport) svg += frame('transparent', '');
  svg += innerSvg;
  if (id === selectedId && !forExport) {
    svg += frame('none', ` stroke="${COLOR_SELECT}" stroke-width="2" rx="3"`);
  }
  return svg + overlaySvg + '</g>';   // ハンドルは選択枠より上に描く
}

/* --------------------------------------------------------------------------
   凡例・透かし(設計書5-5・8-3。書き出し画像にも必ず入れる)
   -------------------------------------------------------------------------- */

/**
 * 図の中で使っているスイッチ種別を1行にまとめる(設計書5-5)。
 * 記号の絵柄は種別で変えないため、凡例に文字で書いて区別できるようにする。
 * ※「かってに(人感)」だけは▲の記号で区別できるので、この行には入れない。
 */
function switchVariantLine(wall) {
  const names = [];
  wall.fixtures.forEach((fx) => {
    if (fx.type !== 'switch' || isSensorSwitch(fx)) return;
    const variant = switchVariantOf((fx.attrs || {}).variant);
    if (variant.value !== 'standard' && !names.includes(variant.name)) names.push(variant.name);
  });
  return names.length
    ? `スイッチの種別: ${names.join('・')} ／ 記号の形は同じで、種別は図の文字で示しています`
    : '';
}

/**
 * パレットに無い記号6種の凡例(設計書5-5)。使っている壁だけ行を足す。
 * ここに1行足すと、その記号を使っている壁の凡例に自動で出る。
 */
const EXTRA_LEGEND = [
  { kind: 'outlet-info', text: '情報コンセント(下の文字=TV/LAN/TEL)' },
  { kind: 'remote',      text: 'リモコン類(床暖・給湯など)' },
  { kind: 'intercom',    text: 'インターホン(円+T)' },
  { kind: 'panel',       text: '分電盤・情報ボックス(破線の四角)' },
  { kind: 'vent',        text: '給気口・換気(破線+横線)' },
  { kind: 'other',       text: 'その他(上のどれにも当てはまらないもの)' },
];

/**
 * 凡例。項目を左から並べ、幅に収まらなくなったら次の行へ折り返す(流し込み方式)。
 * 列数を固定しないので、長い項目があっても枠からはみ出さない。
 * 戻り値の height は枠の高さ(行数で変わる)。
 */
function drawLegend(y, wall) {
  const PAD = 14;              // 枠の左右の余白
  const GAP = 26;              // 項目どうしの最小の間隔
  const SYMBOL_W = 32;         // 記号の絵に使う幅
  const LINE_H = 32;           // 1行の高さ
  const FONT = 11;
  const maxW = AREA.w - PAD * 2;

  const items = [
    { kind: 'outlet',    text: 'コンセント(点=差し込み口の数/E=アース付)' },
    { kind: 'switch',    text: 'スイッチ(点=ボタンの数/3=3路)' },
    { kind: 'light',     text: '照明(D=ダウン/S=シーリング/P=ペンダント/B=ブラケット)' },
    { kind: 'opening',   text: '窓・ドア' },
    { kind: 'furniture', text: '家具・棚の置き予定' },
    // 下地は使っている壁にだけ出す(使わない人の凡例を長くしないため)
    ...((wall.backing || []).length ? [{ kind: 'backing', text: '下地(壁の中の補強板)の希望範囲' }] : []),
    // 下の6種はパレットには無い記号。その壁で使っているものだけ行を足す(設計書5-5)
    ...EXTRA_LEGEND.filter((item) => wall.fixtures.some((fx) => fx.type === item.kind)),
    { kind: 'outlet',    text: '赤い記号=⚠要営業確認(担当者への確認が必要)', warn: true },
  ];

  // --- 各項目を行に振り分ける ---
  const rows = [[]];
  let rowW = 0;
  for (const item of items) {
    const width = SYMBOL_W + 6 + estimateTextWidth(item.text, FONT);
    const start = rowW ? rowW + GAP : 0;
    if (rowW && start + width > maxW) {        // 入りきらないので次の行へ
      rows.push([]);
      rowW = 0;
      rows[rows.length - 1].push({ ...item, x: 0, width });
      rowW = width;
    } else {
      rows[rows.length - 1].push({ ...item, x: start, width });
      rowW = start + width;
    }
  }

  // --- 説明の追加行(使っている記号があるときだけ)。長ければ折り返す ---
  const extras = [];
  if (wall.fixtures.some((fx) => fx.type === 'switch' && isSensorSwitch(fx))) {
    extras.push(...wrapText('▲ = かってにスイッチ(人感)。ほかのスイッチの黒点はボタンの数です', FONT, maxW));
  }
  const variantLine = switchVariantLine(wall);
  if (variantLine) extras.push(...wrapText(variantLine, FONT, maxW));

  // --- 高さを決めて描く ---
  const firstRowY = 42;        // 「凡例」の見出しと重ならない位置から始める
  const lastRowBottom = firstRowY + (rows.length - 1) * LINE_H + 16;
  const height = extras.length ? lastRowBottom + 12 + extras.length * 17 + 6 : lastRowBottom + 10;

  let svg = `<rect x="${AREA.x}" y="${y}" width="${AREA.w}" height="${r(height)}" `
          + `fill="#fafafa" stroke="#dddddd" stroke-width="1"/>`;
  svg += `<text x="${AREA.x + PAD}" y="${y + 15}" font-size="11" fill="#666">凡例</text>`;

  rows.forEach((row, ri) => {
    const cy = y + firstRowY + ri * LINE_H;
    row.forEach((item) => {
      const cx = AREA.x + PAD + item.x + SYMBOL_W / 2;
      svg += legendSymbol(item.kind, cx, cy, item.warn);
      svg += legendText(cx + SYMBOL_W / 2 + 6, cy + 4, item.text);
    });
  });
  extras.forEach((line, i) => {
    svg += legendText(AREA.x + PAD, y + lastRowBottom + 20 + i * 17, line);
  });
  return { svg, height };
}

function legendText(x, y, text) {
  return `<text x="${r(x)}" y="${r(y)}" font-size="11" fill="#333">${escapeXml(text)}</text>`;
}

/* --------------------------------------------------------------------------
   文字幅の見積もりと折り返し
   SVGの文字は描いてみないと正確な幅が分からないため、
   「全角=フォントサイズ×1.0/半角=×0.55」で概算する(はみ出し防止用の目安)。
   -------------------------------------------------------------------------- */

function estimateTextWidth(text, fontSize) {
  let width = 0;
  for (const ch of String(text)) {
    // ASCII(英数字・記号)と半角カナは半角、それ以外(日本語など)は全角として数える
    width += /[ -~｡-ﾟ]/.test(ch) ? fontSize * 0.55 : fontSize;
  }
  return width;
}

/** 英数字のかたまり(例「1,400」「CAT6A」「W1400×H450」)の一部かどうか */
function isWordChar(ch) { return /[0-9A-Za-z,./×=-]/.test(ch); }

/**
 * 指定した幅に収まるように文字列を分ける(日本語はどこでも折り返せる前提)。
 * ただし「1,400」のような英数字のかたまりの途中では切らない(読み間違いを防ぐため)。
 */
function wrapText(text, fontSize, maxWidth) {
  const lines = [];
  let line = '';
  for (const ch of String(text)) {
    if (line && estimateTextWidth(line + ch, fontSize) > maxWidth) {
      let cut = line.length;
      if (isWordChar(ch)) {
        // 英数字の途中なので、そのかたまりの手前まで戻して改行する
        while (cut > 0 && isWordChar(line[cut - 1])) cut--;
        // 戻しすぎる(行がほとんど空になる)ときは諦めてそのまま切る
        if (cut === 0 || line.length - cut > 20) cut = line.length;
      }
      lines.push(line.slice(0, cut));
      line = line.slice(cut);
    }
    line += ch;
  }
  if (line) lines.push(line);
  return lines;
}

function drawWatermark(height) {
  return `<text x="${VIEW.w - AREA.x}" y="${height - 12}" font-size="12" text-anchor="end" fill="#888">`
       + `${escapeXml(WATERMARK)}</text>`;
}

/* -------------------------------------------------------------------------- */

function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
function r(v) { return Math.round(v * 10) / 10; }
