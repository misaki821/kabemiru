/* ==========================================================================
   state.js — データ(JSON)の保持・変更・自動保存・元に戻す
   設計書6-1「JSON→全SVG再描画の一方通行」の“JSON側”を担当する。
   画面を直接いじるコードはここには書かない(変更を通知するだけ)。
   ========================================================================== */

import {
  starterData, DEFAULT_WALL_THICKNESS, DEFAULT_SWITCH_VARIANT, ATTR_ALIASES,
} from './presets.js';

/** localStorage(ブラウザ内の保存領域)のキー名 */
const KEY_DATA = 'kabemiru:data';   // 家全体のJSON
const KEY_UI   = 'kabemiru:ui';     // 画面の状態(免責の既読など)。JSONファイルには含めない

/** 自動保存のまとめ書き待ち時間(ms)。連打しても書き込みは0.5秒に1回(設計書6-5) */
const SAVE_DELAY = 500;

let data = null;          // 家全体のJSON(このアプリで唯一の保存データ)
let undoSnapshot = null;  // 直前1回分のコピー(文字列)。設計書6-4のスナップショット方式
let selectedId = null;    // いま選んでいる部品のid(画面の状態。保存データには入れない)
let currentWallId = null; // いま表示している壁のid(画面の状態)
let saveTimer = null;
let saving = false;
const listeners = [];     // データが変わったときに呼ぶ関数の一覧

/* --------------------------------------------------------------------------
   読み込み・初期化
   -------------------------------------------------------------------------- */

/** 起動時に呼ぶ。保存データがあれば復元し、無ければサンプル壁を開く */
export function load() {
  let restored = null;
  try {
    const raw = localStorage.getItem(KEY_DATA);
    if (raw) restored = JSON.parse(raw);
  } catch (e) {
    // 壊れたデータが入っていた場合は無視してサンプル壁から始める
    console.warn('保存データを読めませんでした:', e);
  }
  data = isUsable(restored) ? restored : starterData();
  fillDefaults(data);
  // 前回見ていた壁から再開する(設計書6-5)
  const lastId = readUiState().currentWallId;
  currentWallId = data.walls.some((w) => w.id === lastId) ? lastId : data.walls[0].id;
  return data;
}

/** 最低限の形になっているか(壁が1枚以上あるか)を確かめる */
function isUsable(d) {
  return !!d && Array.isArray(d.walls) && d.walls.length > 0;
}

/** 古いデータ・欠けている項目を既定値で埋める(設計書4章のスキーマに合わせる) */
function fillDefaults(d) {
  d.schemaVersion = d.schemaVersion || 1;
  d.meta = d.meta || {};
  d.meta.app = 'kabemiru';
  d.meta.title = d.meta.title || 'わが家の壁面図';
  d.meta.createdAt = d.meta.createdAt || today();
  if (typeof d.meta.wallThickness !== 'number') d.meta.wallThickness = DEFAULT_WALL_THICKNESS;
  for (const w of d.walls) {
    w.openings  = w.openings  || [];
    w.fixtures  = w.fixtures  || [];
    w.furniture = w.furniture || [];
    w.backing   = w.backing   || [];   // 下地(2026-08-22追加)。古いデータには無いので空で補う
    w.notes     = w.notes     || [];
    w.fixtures.forEach(migrateFixture);
  }
}

/**
 * 古いデータ・手書きJSONの引っ越し(設計書4-3の attrs 正式キーに揃える)。
 * ・別名のキー(例 `way: 3`)を正式キー(`threeWay: true`)に読み替える → 読み替え表は presets.js の ATTR_ALIASES
 * ・スイッチの「人感」の持ち方を attrs.variant に統一する(以前は attrs.sensor / attrs.motion の true)
 * 読み込んだファイルそのものは書き換えず、アプリの中のデータだけを揃える。
 */
function migrateFixture(fx) {
  fx.attrs = fx.attrs || {};
  for (const rule of ATTR_ALIASES) {
    if (!(rule.from in fx.attrs)) continue;
    const value = rule.convert ? rule.convert(fx.attrs[rule.from]) : fx.attrs[rule.from];
    delete fx.attrs[rule.from];
    if (value !== undefined && value !== false) fx.attrs[rule.to] = value;
  }
  if (fx.type === 'switch' && !fx.attrs.variant) fx.attrs.variant = DEFAULT_SWITCH_VARIANT;
}

/* --------------------------------------------------------------------------
   データの取り出し
   -------------------------------------------------------------------------- */

export function getData() { return data; }

/** いま編集している壁を返す(見つからなければ1枚目) */
export function getWall() {
  return data.walls.find((w) => w.id === currentWallId) || data.walls[0];
}

export function getSelectedId() { return selectedId; }

/** 選択を変える(データそのものは変わらないので保存はしない) */
export function setSelectedId(id) {
  if (selectedId === id) return;
  selectedId = id;
  notify();
}

/** 壁の中の部品リストの種類(データのフィールド名) */
export const ELEMENT_KINDS = ['fixtures', 'openings', 'furniture', 'backing', 'notes'];

/** 新しい部品のidの頭文字(種類ごと)。例: f3, op2, fur1, bk1, n4 */
export const ID_PREFIX = { fixtures: 'f', openings: 'op', furniture: 'fur', backing: 'bk', notes: 'n' };

/**
 * idから部品を探す。戻り値 { kind: 'fixtures'|'openings'|'furniture'|'backing'|'notes', item: {...} }
 * 見つからなければ null
 */
export function findElement(id) {
  if (!id) return null;
  const wall = getWall();
  for (const kind of ELEMENT_KINDS) {
    const item = wall[kind].find((el) => el.id === id);
    if (item) return { kind, item };
  }
  return null;
}

/** いま選んでいる部品を返す(無ければ null) */
export function getSelected() { return findElement(selectedId); }

/** 重複しないidを作る(例: f3, op2)。壁をまたいでも重ならないよう全部から探す */
export function nextId(prefix) {
  const used = new Set();
  for (const wall of data.walls) {
    for (const kind of ELEMENT_KINDS) wall[kind].forEach((el) => used.add(el.id));
  }
  let n = 1;
  while (used.has(prefix + n)) n++;
  return prefix + n;
}

/* --------------------------------------------------------------------------
   データの変更
   -------------------------------------------------------------------------- */

/**
 * データを書き換える唯一の入口。
 * @param {function} mutator     dataを受け取って書き換える関数
 * @param {object}   options
 *   - snapshot: true なら「元に戻す」用のコピーを取ってから変更する。
 *     ドラッグ中の連続変更では false にして、つかんだ瞬間だけ true にする。
 */
export function update(mutator, options = {}) {
  const { snapshot = true } = options;
  if (snapshot) undoSnapshot = JSON.stringify(data);
  mutator(data);
  data.meta.updatedAt = today();
  scheduleSave();
  notify();
}

/**
 * 元に戻す(直前1回・設計書6-4)。
 * いまのデータとコピーを入れ替えるだけなので、もう一度押すと「やり直し」になる。
 */
export function undo() {
  if (!undoSnapshot) return;
  const current = JSON.stringify(data);
  data = JSON.parse(undoSnapshot);
  undoSnapshot = current;
  fillDefaults(data);
  // 戻した結果、選んでいた部品が消えている場合は選択を外す
  if (selectedId && !findElement(selectedId)) selectedId = null;
  scheduleSave();
  notify();
}

export function canUndo() { return undoSnapshot !== null; }

/* --------------------------------------------------------------------------
   壁の管理(複数壁面・設計書3-3)
   -------------------------------------------------------------------------- */

export function getCurrentWallId() { return currentWallId; }

/** 表示する壁を切り替える(データは変わらないので保存は画面状態だけ) */
export function setCurrentWall(id) {
  if (!data.walls.some((w) => w.id === id)) return;
  currentWallId = id;
  selectedId = null;
  saveUiState({ currentWallId });
  notify();
}

/** 空の壁を1枚追加して、その壁に切り替える */
export function addWall(room) {
  const id = nextWallId();
  update((d) => {
    d.walls.push({
      id, floor: '1F', room: room || '新しい部屋', face: 'north',
      faceLabel: '', leftLabel: '', rightLabel: '',
      width: 3520, height: 2400,
      floorZones: [{ from: 0, to: 3520, level: 0, label: '床±0' }],
      openings: [], fixtures: [], furniture: [], backing: [], notes: [],
    });
  });
  setCurrentWall(id);
  return id;
}

/** いまの壁をまるごと複製する(中の部品のidも付け直す) */
export function duplicateWall() {
  const source = getWall();
  const id = nextWallId();
  update((d) => {
    const copy = JSON.parse(JSON.stringify(source));
    copy.id = id;
    copy.room = `${source.room}のコピー`;
    // 部品のidが元の壁と重ならないように付け直す
    for (const kind of ELEMENT_KINDS) {
      copy[kind].forEach((el, i) => { el.id = `${id}-${ID_PREFIX[kind]}${i + 1}`; });
    }
    d.walls.push(copy);
  });
  setCurrentWall(id);
  return id;
}

/** いまの壁を削除する(最後の1枚は消せない)。確認はui.js側で取る */
export function deleteWall() {
  if (data.walls.length <= 1) return false;
  const id = currentWallId;
  update((d) => { d.walls = d.walls.filter((w) => w.id !== id); });
  setCurrentWall(data.walls[0].id);
  return true;
}

function nextWallId() {
  const used = new Set(data.walls.map((w) => w.id));
  let n = 1;
  while (used.has('w' + n)) n++;
  return 'w' + n;
}

/* --------------------------------------------------------------------------
   データファイル(JSON)の読み込み
   -------------------------------------------------------------------------- */

/**
 * 読み込んだJSONでデータをまるごと入れ替える。
 * 入れ替え前のデータは「元に戻す」で戻せる。
 * @returns {string|null} 問題があればエラーメッセージ、正常ならnull
 */
export function replaceData(incoming) {
  if (!incoming || typeof incoming !== 'object') {
    return 'ファイルの中身を読み取れませんでした。';
  }
  if (!incoming.meta || incoming.meta.app !== 'kabemiru') {
    return 'カベミルで保存したデータファイルではないようです。';
  }
  if (Number(incoming.schemaVersion) > 1) {
    return 'このファイルは新しい版のカベミルで作られています。カベミルを最新の状態で開き直してください。';
  }
  if (!isUsable(incoming)) {
    return '壁のデータが入っていないファイルです。';
  }
  undoSnapshot = JSON.stringify(data);   // 読み込み前に戻せるようにする
  data = incoming;
  fillDefaults(data);
  currentWallId = data.walls[0].id;
  selectedId = null;
  saveUiState({ currentWallId });
  scheduleSave();
  notify();
  return null;
}

/* --------------------------------------------------------------------------
   自動保存(localStorage)
   -------------------------------------------------------------------------- */

function scheduleSave() {
  saving = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY_DATA, JSON.stringify(data));
    } catch (e) {
      console.warn('自動保存に失敗しました:', e);
    }
    saving = false;
    notify();
  }, SAVE_DELAY);
}

/** 保存中かどうか(ヘッダーの「✓保存済み」表示に使う) */
export function isSaving() { return saving; }

/* --------------------------------------------------------------------------
   画面の状態(免責の既読フラグなど)
   ※ データ(JSON)とは別に保存する(設計書6-5)
   -------------------------------------------------------------------------- */

function readUiState() {
  try { return JSON.parse(localStorage.getItem(KEY_UI)) || {}; }
  catch (e) { return {}; }
}

function writeUiState(obj) {
  try { localStorage.setItem(KEY_UI, JSON.stringify(obj)); }
  catch (e) { /* プライベートモード等で保存できない場合は何もしない */ }
}

/** 画面状態を一部だけ書き換えて保存する */
function saveUiState(patch) {
  writeUiState({ ...readUiState(), ...patch });
}

/** 初回の免責ダイアログに同意済みか */
export function hasAgreed() { return readUiState().agreed === true; }

/** 免責に同意したことを記録する */
export function setAgreed() { saveUiState({ agreed: true }); }

/* --------------------------------------------------------------------------
   変更の通知(データが変わったら画面を作り直す)
   -------------------------------------------------------------------------- */

export function subscribe(fn) { listeners.push(fn); }

function notify() { listeners.forEach((fn) => fn()); }

/** 今日の日付を "2026-08-03" の形で返す */
function today() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
