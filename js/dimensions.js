/* ==========================================================================
   dimensions.js — 寸法線の自動生成(設計書2-1の機能5)
   ユーザーに寸法線を引かせない。JSONの数値から毎回自動で描く。
   px座標への換算はここでは行わず、render.jsから渡された変換関数 t() を使う
   (mm→pxの計算を1ヶ所に集約するため・設計書6-2)。
   ========================================================================== */

const COLOR = '#333';
const TICK = 6;   // 寸法線の端の斜線の長さ(px)

/** 3,520 のように3桁ごとにカンマを入れる */
export function formatMm(mm) {
  return Math.round(mm).toLocaleString('en-US');
}

/** mm → 「30cm」のような表示(画面では cm を主に使う・設計書3-5) */
export function cmText(mm) {
  const cm = mm / 10;
  return `${Math.round(cm * 10) / 10}cm`;
}

/* --------------------------------------------------------------------------
   壁そのものの寸法(幅・天井の高さ)。常に表示する。
   geo = { originX, originY, wallW, wallH }(すべてpx。originYは床の高さの位置)
   -------------------------------------------------------------------------- */
export function drawWallDims(wall, geo) {
  const { originX, originY, wallW, wallH } = geo;
  let svg = '<g class="dim-wall">';

  // --- 幅(壁の下側) ---
  const yDim = originY + 78;
  svg += extLine(originX, originY, originX, yDim + 8);
  svg += extLine(originX + wallW, originY, originX + wallW, yDim + 8);
  svg += hLine(originX, originX + wallW, yDim);
  svg += textCenter(originX + wallW / 2, yDim - 7, `幅 ${formatMm(wall.width)}`, 13);

  // --- 天井の高さ(壁の右側) ---
  const xDim = originX + wallW + 42;
  svg += extLine(originX + wallW, originY, xDim + 8, originY);
  svg += extLine(originX + wallW, originY - wallH, xDim + 8, originY - wallH);
  svg += vLine(originY, originY - wallH, xDim);
  svg += textVertical(xDim - 6, originY - wallH / 2, `天井の高さ ${formatMm(wall.height)}`, 13);

  svg += '</g>';
  return svg;
}

/* --------------------------------------------------------------------------
   選んでいる部品の寸法(左端からの距離・床からの高さ)
   記号は中心・窓/家具は左下が基準点(設計書4-1)。基準点のpxと mm を受け取る。
   -------------------------------------------------------------------------- */
export function drawElementDims(geo, px, py, xMm, hMm, hLabel = '床から') {
  const { originX, originY } = geo;
  let svg = '<g class="dim-selected">';

  // --- 左端から基準点まで(壁の下側・壁幅の寸法より内側の段) ---
  // 0mm(壁の左端ちょうど)のときは寸法線が潰れるので描かない
  if (Math.abs(px - originX) > 2) {
    const yDim = originY + 38;
    svg += extLine(px, py, px, yDim + 8, true);
    svg += extLine(originX, originY, originX, yDim + 8);
    svg += hLine(originX, px, yDim);
    svg += textCenter((originX + px) / 2, yDim - 7, `左から ${formatMm(xMm)}`, 13);
  }

  // --- 床から基準点まで(壁の左側)。0mm(床の上)のときは描かない ---
  if (Math.abs(py - originY) > 2) {
    const xDim = originX - 40;
    svg += extLine(px, py, xDim - 8, py, true);
    svg += extLine(originX, originY, xDim - 8, originY);
    svg += vLine(originY, py, xDim);
    svg += textVertical(xDim - 6, (originY + py) / 2, `${hLabel} ${formatMm(hMm)}`, 13);
  }

  svg += '</g>';
  // TODO(v2): 天井からの寸法・記号どうしの間隔寸法(寸法線の段組)も足せるようにする
  return svg;
}

/* --------------------------------------------------------------------------
   部品(小さな図形)
   -------------------------------------------------------------------------- */

/** 水平の寸法線(両端に斜線) */
function hLine(x1, x2, y) {
  return line(x1, y, x2, y, 1)
       + tick(x1, y) + tick(x2, y);
}

/** 垂直の寸法線(両端に斜線) */
function vLine(y1, y2, x) {
  return line(x, y1, x, y2, 1)
       + tick(x, y1) + tick(x, y2);
}

/** 寸法線と対象を結ぶ補助線。dashed=true なら点線 */
function extLine(x1, y1, x2, y2, dashed = false) {
  return line(x1, y1, x2, y2, 0.6, dashed ? '3 3' : null);
}

function line(x1, y1, x2, y2, w, dash) {
  const d = dash ? ` stroke-dasharray="${dash}"` : '';
  return `<line x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" `
       + `stroke="${COLOR}" stroke-width="${w}"${d}/>`;
}

/** 寸法線の端の斜線(45度) */
function tick(x, y) {
  return `<line x1="${r(x - TICK / 2)}" y1="${r(y + TICK / 2)}" x2="${r(x + TICK / 2)}" y2="${r(y - TICK / 2)}" `
       + `stroke="${COLOR}" stroke-width="1"/>`;
}

/** 中央そろえの文字 */
function textCenter(x, y, text, size) {
  return `<text x="${r(x)}" y="${r(y)}" font-size="${size}" text-anchor="middle" fill="${COLOR}">${text}</text>`;
}

/** 縦書き(90度回転)の文字 */
function textVertical(x, y, text, size) {
  return `<text x="${r(x)}" y="${r(y)}" font-size="${size}" text-anchor="middle" fill="${COLOR}" `
       + `transform="rotate(-90 ${r(x)} ${r(y)})">${text}</text>`;
}

function r(v) { return Math.round(v * 10) / 10; }
