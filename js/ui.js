/* ==========================================================================
   ui.js — 画面の操作(パレット・壁のサイズ・壁リスト・ボタン・図の上の操作)
   このファイルがアプリの入口。右パネルの中身は ui-panel.js が担当する。
   操作 → state.jsのデータを書き換える → 通知で図と画面を作り直す(設計書6-1)。
   ========================================================================== */

import * as state from './state.js';
import { initPanel, syncPanel } from './ui-panel.js';
import { buildSvg, pxToMm, wallTitle, getAutoLabelOffset } from './render.js';
import {
  exportPng, exportSvg, exportJson, readJsonFile, buildFileName, buildDataFileName,
} from './export.js';
import { escapeXml } from './symbols.js';
import {
  CEILING_PRESETS, OPENING_KINDS, newFixture, newOpening, newFurniture, newBacking,
  masuOptions, masuToWidth, confidenceOf, starterData, SNAP_MM, MASU_MM,
} from './presets.js';

const $ = (id) => document.getElementById(id);

/** 画面の部品(HTML側のid)。まとめて取っておき、以降は el.〜 で使う */
const el = {
  canvas: $('canvas-area'), canvasPane: document.querySelector('.pane-canvas'),
  wallList: $('wall-list'), saveState: $('save-state'),
  paletteOpening: $('palette-opening'), placeHint: $('place-hint'),
  masu: $('wall-masu'), width: $('wall-width'), widthHint: $('wall-width-hint'),
  ceiling: $('wall-ceiling'), height: $('wall-height'),
  panelTitle: $('panel-title'), fields: $('panel-fields'), wallExtra: $('panel-wall-extra'),
  wallThickness: $('wall-thickness'), btnDelete: $('btn-delete'),
  btnUndo: $('btn-undo'), fileInput: $('file-input'),
  intro: $('intro-dialog'), help: $('help-dialog'),
};

/**
 * アクセス解析(GA4)に「どの機能が使われたか」だけを送る。
 * 送るのはイベント名だけ。図の中身・座標・メモなど利用者が入力したデータは一切送らない(設計書8章の方針)。
 * gtagタグが読み込めていない環境(広告ブロック等)でも動くよう、存在確認をしてから呼ぶ。
 */
function track(name) {
  if (typeof gtag === 'function') gtag('event', name);
}

/** いま選んでいる「置くもの」。null なら配置モードではない */
let placing = null;   // 例 { kind:'fixtures', type:'outlet' } / { kind:'openings', openingKind:'window' } / { kind:'backing' }

/** パレットのボタン名がそのまま部品の種類(配列名)になるもの。家具の枠と下地 */
const BOX_KINDS = ['furniture', 'backing'];

/** パレットのボタン名 → 置くものの指定 */
function placingFor(name) {
  return BOX_KINDS.includes(name) ? { kind: name } : { kind: 'fixtures', type: name };
}

/** そのボタンが、いまの配置モードに対応しているか(ボタンの点灯判定) */
function matchesPlacing(next, name) {
  return !!next && (next.type === name || (BOX_KINDS.includes(name) && next.kind === name));
}

/** 壁の外をクリックしたときの案内を元に戻すためのタイマー */
let hintTimer = 0;

/** 数値欄を編集中に「元に戻す」用のコピーを取ったか(1回の編集=1回分にまとめる) */
let snapshotTaken = false;

/* ==========================================================================
   起動
   ========================================================================== */

function init() {
  state.load();
  buildSelectOptions();
  initPanel(el);
  setupBridge();          // スマホ橋渡し画面(図の縮尺を上書きしないよう最初に作る)
  bindEvents();
  state.subscribe(renderAll);
  renderAll();

  // 初回だけ免責ダイアログを出す(設計書8-2)。
  // 狭い画面ではスマホ橋渡し画面(編集できない)なので出さない。免責はその画面の下部に常時表示。
  if (!state.hasAgreed() && window.innerWidth >= 768) el.intro.showModal();
}

/** 選択肢(マス・天井高・窓の種類)を作る */
function buildSelectOptions() {
  const option = (value, text) => `<option value="${value}">${text}</option>`;
  el.masu.innerHTML = option('', '(mmで直接指定)')
    + masuOptions().map((m) => option(m, `${m}マス(${m * MASU_MM / 10}cm)`)).join('');
  el.ceiling.innerHTML = option('', '(mmで直接指定)')
    + CEILING_PRESETS.map((c) => option(c.h, `${c.name}(${confText(c.confidence)})`)).join('');
  el.paletteOpening.innerHTML = option('', '窓・ドアを選ぶ…')
    + OPENING_KINDS.map((k) => option(k.kind, k.name)).join('');
}

/** 確度ラベルの表示文字。要営業確認には⚠を付ける(設計書5-4) */
function confText(key) {
  const conf = confidenceOf(key);
  return conf.warn ? `⚠${conf.label}` : conf.label;
}

/* ==========================================================================
   画面の作り直し(データが変わるたびに呼ばれる)
   ========================================================================== */

function renderAll() {
  const wall = state.getWall();

  // ② 図(SVGを丸ごと作り直す)
  el.canvas.innerHTML = buildSvg(wall, { selectedId: state.getSelectedId() });

  // ヘッダー(壁リスト)
  el.wallList.innerHTML = state.getData().walls
    .map((w) => `<option value="${w.id}">${escapeXml(wallTitle(w))}</option>`).join('');
  el.wallList.value = state.getCurrentWallId();
  el.saveState.textContent = state.isSaving() ? '保存中…' : '✓ 保存済み';
  el.saveState.classList.toggle('saving', state.isSaving());

  syncWallInputs(wall);
  syncPanel();
  el.btnUndo.disabled = !state.canUndo();
}

/** ①左パネル(壁のサイズ)の表示を合わせる */
function syncWallInputs(wall) {
  const thickness = state.getData().meta.wallThickness;
  const masu = (wall.width + thickness) / MASU_MM;
  const matched = masuOptions().find((m) => Math.abs(m - masu) < 0.0001);

  setValue(el.masu, matched ? String(matched) : '');
  setValue(el.width, wall.width);
  setValue(el.height, wall.height);
  setValue(el.ceiling, CEILING_PRESETS.some((c) => c.h === wall.height) ? String(wall.height) : '');
  setValue(el.wallThickness, thickness);

  el.widthHint.textContent = matched
    ? `${matched}マス=芯々${(matched * MASU_MM).toLocaleString('en-US')}mm から壁の厚さ${thickness}mmを引いた幅です`
    : `いまの幅は ${wall.width / 10}cm です(1マス=91cm)`;
}

/** 入力欄の値を書き換える。入力中(フォーカス中)の欄は邪魔しない */
function setValue(node, value) {
  if (document.activeElement === node) return;
  node.value = value;
}

/* ==========================================================================
   イベントの登録
   ========================================================================== */

function bindEvents() {
  // --- ① 置くもの ---
  document.querySelectorAll('[data-place]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.dataset.place;
      setPlacing(matchesPlacing(placing, name) ? null : placingFor(name));
    });
  });
  el.paletteOpening.addEventListener('change', () => {
    const kind = el.paletteOpening.value;
    setPlacing(kind ? { kind: 'openings', openingKind: kind } : null);
  });
  $('btn-add-note').addEventListener('click', addNote);

  // --- ① 壁のサイズ ---
  el.masu.addEventListener('change', () => {
    const masu = parseFloat(el.masu.value);
    if (!masu) return;
    const thickness = state.getData().meta.wallThickness;
    state.update(() => { state.getWall().width = masuToWidth(masu, thickness); });
  });
  bindNumber(el.width, (v) => { state.getWall().width = clamp(v, 500, 20000); });
  bindNumber(el.height, (v) => { state.getWall().height = clamp(v, 1000, 5000); });
  bindNumber(el.wallThickness, (v) => { state.getData().meta.wallThickness = clamp(v, 0, 500); });
  el.ceiling.addEventListener('change', () => {
    const h = parseInt(el.ceiling.value, 10);
    if (h) state.update(() => { state.getWall().height = h; });
  });

  // --- 壁リスト(複数壁面・設計書3-3) ---
  el.wallList.addEventListener('change', () => state.setCurrentWall(el.wallList.value));
  $('btn-add-wall').addEventListener('click', () => {
    const name = prompt('新しい壁の部屋名を入力してください(例: 洗面所)', '');
    if (name === null) return;                     // キャンセル
    state.addWall(name.trim());
    setPlacing(null);
  });
  $('btn-duplicate-wall').addEventListener('click', () => state.duplicateWall());
  $('btn-delete-wall').addEventListener('click', deleteCurrentWall);

  // --- ③ 削除 ---
  el.btnDelete.addEventListener('click', deleteSelected);

  // --- ツールバー ---
  el.btnUndo.addEventListener('click', () => state.undo());
  $('btn-png').addEventListener('click', savePng);
  $('btn-svg').addEventListener('click', saveSvg);
  $('btn-save-json').addEventListener('click', saveJson);
  $('btn-open-json').addEventListener('click', () => el.fileInput.click());
  el.fileInput.addEventListener('change', openJson);

  // --- ダイアログ ---
  $('btn-help').addEventListener('click', () => el.help.showModal());
  $('btn-show-intro').addEventListener('click', () => { el.help.close(); el.intro.showModal(); });
  el.intro.addEventListener('close', () => {
    // 初回の「同意して使いはじめる」だけを数える(2回目以降の読み直しは数えない)
    if (!state.hasAgreed()) track('consent_start');
    state.setAgreed();
  });

  // --- ② 図の上の操作 ---
  el.canvas.addEventListener('pointerdown', onCanvasPointerDown);
}

/** 数値欄の共通処理: 入力のたびに反映しつつ、「元に戻す」は1回の編集で1回分にする */
function bindNumber(node, apply) {
  node.addEventListener('focus', () => { snapshotTaken = false; });
  node.addEventListener('input', () => {
    const v = parseFloat(node.value);
    if (!isFinite(v)) return;      // 入力途中(空欄など)は無視
    state.update(() => apply(v), { snapshot: !snapshotTaken });
    snapshotTaken = true;
  });
}

/* ==========================================================================
   置く・選ぶ・動かす(設計書3-1の「操作概念は3つだけ」)
   ========================================================================== */

/** 配置モードの切り替え */
function setPlacing(next) {
  placing = next;
  document.querySelectorAll('[data-place]').forEach((btn) => {
    btn.classList.toggle('active', matchesPlacing(next, btn.dataset.place));
  });
  if (!next || next.kind !== 'openings') el.paletteOpening.value = '';
  el.canvasPane.classList.toggle('placing', !!next);
  clearTimeout(hintTimer);                       // 出しかけの案内があれば取り消す
  el.placeHint.classList.remove('hint-warn');
  updatePlaceHint();
}

/** ヒント欄の文言を、いまの配置モードに合ったものに戻す */
function updatePlaceHint() {
  el.placeHint.textContent = placing
    ? '図の中の置きたい位置をクリックしてください(もう一度ボタンを押すと取り消し)'
    : 'ボタンを押してから、中央の図をクリックすると置けます。';
}

/** ヒント欄に注意色で一時的なお知らせを出す(3秒後に元の文言に戻す) */
function flashHint(text) {
  clearTimeout(hintTimer);
  el.placeHint.textContent = text;
  el.placeHint.classList.add('hint-warn');
  hintTimer = setTimeout(() => {
    el.placeHint.classList.remove('hint-warn');
    updatePlaceHint();
  }, 3000);
}

function onCanvasPointerDown(e) {
  const svg = el.canvas.querySelector('svg');
  if (!svg) return;
  const mm = pxToMm(...clientToSvg(svg, e.clientX, e.clientY));

  // 1. 置くもの選択中 → クリックした位置に置く
  if (placing) { placeElement(mm); return; }

  // 2. 大きさを変えるつまみの上 → リサイズ(家具・棚の枠と下地だけ)
  const handle = e.target.closest('[data-handle]');
  if (handle) { startResize(handle.dataset.id, handle.dataset.handle, mm); return; }

  // 2'. 選んでいる記号のラベルの上 → ラベルだけをずらす(記号は動かさない)
  const labelBox = e.target.closest('[data-label]');
  if (labelBox) { startLabelDrag(labelBox.dataset.id, mm); return; }

  // 3. 部品の上 → 選んでドラッグ開始 / 4. 何もない所 → 選択解除
  const group = e.target.closest('[data-id]');
  if (!group) { state.setSelectedId(null); return; }
  const id = group.dataset.id;
  state.setSelectedId(id);
  startDrag(id, mm);
}

/**
 * クリックした位置に新しい部品を置く。
 * 部品の中身(初期値)は presets.js の new〜 関数が作る。
 */
function placeElement(mm) {
  const wall = state.getWall();
  // 壁の外(図の余白)は置けないので、配置モードのまま案内だけ出す
  if (mm.x < 0 || mm.x > wall.width || mm.h < 0 || mm.h > wall.height) {
    flashHint('壁の白い四角の中をクリックしてください');
    return;
  }
  const x = snap(mm.x);
  const kind = placing.kind;
  const id = state.nextId(state.ID_PREFIX[kind]);

  state.update(() => {
    const w = state.getWall();
    if (kind === 'fixtures') w.fixtures.push(newFixture(id, placing.type, x, snap(mm.h)));
    else if (kind === 'openings') w.openings.push(newOpening(id, placing.openingKind, x, w.width));
    else if (kind === 'backing') w.backing.push(newBacking(id, x, w.width));
    else w.furniture.push(newFurniture(id, x, w.width));
  });
  state.setSelectedId(id);
  setPlacing(null);
  track('part_place');
}

/** メモを追加する(位置を持たないので図の下部に並ぶ・設計書3-1) */
function addNote() {
  const id = state.nextId('n');
  state.update(() => {
    state.getWall().notes.push({ id, text: '(メモを入力してください)', level: 'info' });
  });
  state.setSelectedId(id);
  setPlacing(null);
  track('part_place');
  // 右パネルのメモ欄にすぐ書けるようにする
  const box = el.fields.querySelector('textarea');
  if (box) { box.focus(); box.select(); }
}

/**
 * 部品の位置(mm)を読む・書く。
 * 記号は中心、窓・ドア・家具の枠・下地は左下が基準(設計書4-1)。
 */
function getPos(kind, item) {
  if (kind === 'fixtures') return { x: item.x, h: item.h };
  if (kind === 'openings') return { x: item.x, h: item.sillHeight };
  return { x: item.x, h: item.bottom };
}
function setPos(kind, item, x, h) {
  item.x = x;
  if (kind === 'fixtures') item.h = h;
  else if (kind === 'openings') item.sillHeight = h;
  else item.bottom = h;
}

/** ドラッグで動かす(10mm刻み・設計書3-6) */
function startDrag(id, startMm) {
  const found = state.findElement(id);
  if (!found || found.kind === 'notes') return;   // メモは位置を持たないので動かせない
  const pos = getPos(found.kind, found.item);
  const offset = { x: pos.x - startMm.x, h: pos.h - startMm.h };
  let moved = false;

  const onMove = (ev) => {
    const svg = el.canvas.querySelector('svg');
    if (!svg) return;
    const mm = pxToMm(...clientToSvg(svg, ev.clientX, ev.clientY));
    const wall = state.getWall();
    const target = state.findElement(id);
    if (!target) return;
    const now = getPos(target.kind, target.item);
    const nx = clamp(snap(mm.x + offset.x), 0, wall.width);
    const nh = clamp(snap(mm.h + offset.h), 0, wall.height);
    if (nx === now.x && nh === now.h) return;
    // つかんだ最初の1回だけ「元に戻す」用のコピーを取る
    state.update(() => {
      const t = state.findElement(id);
      if (t) setPos(t.kind, t.item, nx, nh);
    }, { snapshot: !moved });
    moved = true;
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointercancel', onUp);   // 途中で中断されたときの後始末
  // 図は動かすたびに作り直されるので、監視はwindowに付ける(要素が消えても届くように)
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/**
 * ラベルだけをドラッグしてずらす(設計書4-3の labelOffset に記録・検証B-1)。
 * ・ずらし量は mm で持つ(データに残る=保存され、「元に戻す」でも戻せる)
 * ・つかんだ瞬間は、自動配置でずらされていたぶんを引き継ぐ(ラベルが飛ばないように)
 * ・dy は「図の下向きが+」。図のY(下向き)と高さmm(上向き)は逆なので符号を反転する
 */
function startLabelDrag(id, startMm) {
  const found = state.findElement(id);
  if (!found || found.kind !== 'fixtures') return;
  const base = found.item.labelOffset || getAutoLabelOffset(id);
  const from = { dx: base.dx || 0, dy: base.dy || 0 };
  let moved = false;

  const onMove = (ev) => {
    const svg = el.canvas.querySelector('svg');
    if (!svg) return;
    const mm = pxToMm(...clientToSvg(svg, ev.clientX, ev.clientY));
    const next = {
      dx: Math.round(from.dx + (mm.x - startMm.x)),
      dy: Math.round(from.dy - (mm.h - startMm.h)),
    };
    const target = state.findElement(id);
    if (!target) return;
    const now = target.item.labelOffset || {};
    if (now.dx === next.dx && now.dy === next.dy) return;
    // つかんだ最初の1回だけ「元に戻す」用のコピーを取る
    state.update(() => {
      const t = state.findElement(id);
      if (t) t.item.labelOffset = next;
    }, { snapshot: !moved });
    moved = true;
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointercancel', onUp);
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/** 家具・棚の枠・下地の大きさの最小値(mm)。これより小さくはできない */
const MIN_SIZE_MM = 100;

/**
 * つまみをドラッグして家具・棚の枠・下地の大きさを変える(10mm刻み)。
 * 左下(x・下端)は動かさず、右端で幅・上端で高さを変える。
 * 正確な数値は右パネルのmm欄で直せる(ドラッグ中も右パネルの数値は連動する)。
 */
function startResize(id, dir, startMm) {
  const found = state.findElement(id);
  if (!found || !BOX_KINDS.includes(found.kind)) return;
  let moved = false;

  const onMove = (ev) => {
    const svg = el.canvas.querySelector('svg');
    if (!svg) return;
    const mm = pxToMm(...clientToSvg(svg, ev.clientX, ev.clientY));
    const target = state.findElement(id);
    if (!target) return;
    const item = target.item;
    const width = dir.includes('e') ? clamp(snap(mm.x - item.x), MIN_SIZE_MM, 20000) : item.width;
    const height = dir.includes('n') ? clamp(snap(mm.h - item.bottom), MIN_SIZE_MM, 20000) : item.height;
    if (width === item.width && height === item.height) return;
    // つかんだ最初の1回だけ「元に戻す」用のコピーを取る
    state.update(() => {
      const t = state.findElement(id);
      if (t) { t.item.width = width; t.item.height = height; }
    }, { snapshot: !moved });
    moved = true;
  };
  const onUp = () => {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointercancel', onUp);   // 途中で中断されたときの後始末
  window.addEventListener('pointermove', onMove);
  window.addEventListener('pointerup', onUp);
}

/** 選んでいる部品を削除する */
function deleteSelected() {
  const sel = state.getSelected();
  if (!sel) return;
  const id = sel.item.id;
  state.update(() => {
    const wall = state.getWall();
    wall[sel.kind] = wall[sel.kind].filter((item) => item.id !== id);
  });
  state.setSelectedId(null);
}

/** いま表示している壁を削除する(確認ダイアログ必須・設計書3-3) */
function deleteCurrentWall() {
  if (state.getData().walls.length <= 1) {
    alert('壁が1枚だけのときは削除できません。先に別の壁を追加してください。');
    return;
  }
  const name = wallTitle(state.getWall());
  if (!confirm(`「${name}」を削除します。\nこの壁に置いた部品もすべて消えます。よろしいですか?`)) return;
  state.deleteWall();
}

/* ==========================================================================
   書き出し・読み込み(設計書7章)
   ========================================================================== */

/** 書き出し用のSVG(選択中のオレンジ枠は入れず、寸法・凡例・透かしは入れる) */
function exportSvgText() {
  return buildSvg(state.getWall(), { selectedId: state.getSelectedId(), forExport: true });
}

async function savePng() {
  const btn = $('btn-png');
  btn.disabled = true;
  try {
    await exportPng(exportSvgText(), buildFileName(state.getWall(), 'png'));
    track('export_png');
  } catch (err) {
    alert('画像の保存に失敗しました。もう一度お試しください。\n' + err.message);
  } finally {
    btn.disabled = false;
    renderAll();   // 画面のSVGを元(選択枠つき)に戻す
  }
}

function saveSvg() {
  exportSvg(exportSvgText(), buildFileName(state.getWall(), 'svg'));
  track('export_svg');
  renderAll();
}

function saveJson() {
  exportJson(state.getData(), buildDataFileName());
  track('save_json');
}

/** データファイル(JSON)を開く */
async function openJson(e) {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const incoming = await readJsonFile(file);
    const error = state.replaceData(incoming);
    if (error) alert(error + '\n\nカベミルの「データを保存」で作ったファイルを選んでください。');
    else { setPlacing(null); track('load_json'); }
  } catch (err) {
    alert(err.message);
  }
  e.target.value = '';   // 同じファイルをもう一度選べるようにする
}

/* ==========================================================================
   スマホ橋渡し画面(設計書3-4)
   ========================================================================== */

function setupBridge() {
  // 完成例として、サンプル壁の図をそのまま出す(画像ファイルを持たなくて済む)
  $('bridge-preview').innerHTML = buildSvg(starterData().walls[0], { forExport: true });

  const url = location.href;
  const text = `カベミル(壁面図エディタ) ${url}`;
  $('bridge-line').href = `https://line.me/R/msg/text/?${encodeURIComponent(text)}`;
  $('bridge-mail').href = `mailto:?subject=${encodeURIComponent('カベミル(壁面図エディタ)')}`
    + `&body=${encodeURIComponent(`パソコンでこのURLを開いてください:\n${url}`)}`;
  $('bridge-line').addEventListener('click', () => track('bridge_line'));
  $('bridge-copy').addEventListener('click', async () => {
    track('bridge_copy');
    try {
      await navigator.clipboard.writeText(url);
      $('bridge-copied').hidden = false;
    } catch (err) {
      prompt('このURLをコピーしてください', url);   // コピーが使えない環境向け
    }
  });
}

/* ==========================================================================
   小さな道具
   ========================================================================== */

/**
 * 画面上のクリック位置(ブラウザの座標)→ SVGの中の座標。
 * SVGはCSSで拡大縮小しているため、この変換が必要(mm換算は render.js の pxToMm が担当)。
 */
function clientToSvg(svg, clientX, clientY) {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const p = point.matrixTransform(svg.getScreenCTM().inverse());
  return [p.x, p.y];
}

/** 10mm刻みに丸める */
function snap(mm) { return Math.round(mm / SNAP_MM) * SNAP_MM; }

function clamp(v, min, max) { return Math.min(max, Math.max(min, Math.round(v))); }

init();
