/* ==========================================================================
   ui-panel.js — 右パネル(選んだものの設定)を組み立てる
   下の FIELDS の表に1行足すと、その項目が右パネルの入力欄になる仕組み。
   選んでいるものの種類(壁/窓・ドア/コンセント/スイッチ/照明/家具/メモ)で
   表示する項目を切り替える。
   ========================================================================== */

import * as state from './state.js';
import {
  heightPresetsFor, confidenceOf, OPENING_KINDS, openingKindOf,
  DOOR_SWINGS, LIGHT_KINDS, SWITCH_VARIANTS, H_REFS, DEFAULT_H_REF,
  BACKING_BANDS, backingBandTop,
} from './presets.js';

/** 「床から(mm)」が記号のどこを指すかの選択肢(設計書4-3の hRef) */
const H_REF_FIELD = {
  key: 'hRef', label: '高さの基準', type: 'select', options: H_REFS, fallback: DEFAULT_H_REF,
  hint: '図面が「上端1,410」のように書かれているとき用',
};

/* --------------------------------------------------------------------------
   入力欄の定義
   key   : データのどこを直すか('x' や 'attrs.earth' のように . でつなげる)
   type  : number(数値) / text(文字) / textarea(長い文字) / select(選択) /
           check(チェックボックス) / preset(高さプリセット) /
           confidence(要営業確認) / doorSwing(ドアの開く向き) /
           backingBand(下地の高さ帯プリセット)
   when  : この条件を満たすときだけ表示する
   -------------------------------------------------------------------------- */
const FIELDS = {
  wall: [
    { key: 'room',       label: '部屋の名前',            type: 'text' },
    { key: 'floor',      label: '階',                   type: 'select', options: opts(['1F:1階', '2F:2階', '3F:3階']) },
    { key: 'face',       label: 'どちら側の壁か',        type: 'select', options: opts(['north:北の壁', 'south:南の壁', 'east:東の壁', 'west:西の壁']) },
    { key: 'faceLabel',  label: '補足(例: キッチン背面)', type: 'text' },
    { key: 'leftLabel',  label: '図の左はどちら側か',     type: 'text' },
    { key: 'rightLabel', label: '図の右はどちら側か',     type: 'text' },
  ],
  openings: [
    { key: 'kind',        label: '種類',              type: 'select', options: OPENING_KINDS.map((k) => ({ value: k.kind, label: k.name })), rebuild: true },
    { key: 'x',           label: '左から(mm)',        type: 'number', hint: '窓・ドアの左端まで' },
    { key: 'width',       label: '幅(mm)',            type: 'number' },
    { key: 'height',      label: '高さ(mm)',          type: 'number' },
    { key: 'sillHeight',  label: '床から下端(mm)',    type: 'number', hint: '腰窓は969・掃き出しは0' },
    { type: 'doorSwing',  label: 'ドアの開く向き',     when: (el) => el.kind === 'door' },
    { key: 'productCode', label: '型番メモ',          type: 'text', hint: '例: JM5971BNW' },
    { key: 'label',       label: '名前(図に表示)',    type: 'text' },
    { key: 'note',        label: 'メモ',              type: 'textarea', hint: '呼称寸法と実寸の違いなどはここへ' },
    { type: 'confidence' },
  ],
  outlet: [
    { key: 'x',            label: '左から(mm)', type: 'number' },
    { key: 'h',            label: '床から(mm)', type: 'number', hint: '既定は記号の中心の高さ' },
    H_REF_FIELD,
    { type: 'preset',      label: '高さプリセット' },
    { key: 'gangs',        label: '差し込み口の数', type: 'select', options: opts(['1:1口', '2:2口', '3:3口', '4:4口']), number: true },
    { key: 'attrs.earth',  label: 'アース付',       type: 'check' },
    { key: 'label',        label: 'メモ(図に表示)', type: 'text' },
    { type: 'confidence' },
  ],
  switch: [
    { key: 'x',              label: '左から(mm)', type: 'number' },
    { key: 'h',              label: '床から(mm)', type: 'number', hint: '既定は記号の中心の高さ' },
    H_REF_FIELD,
    { type: 'preset',        label: '高さプリセット' },
    { key: 'attrs.variant',  label: '種別', type: 'select', options: SWITCH_VARIANTS,
      hint: '記号の形は同じ。種別は図の文字で示します' },
    { key: 'gangs',          label: 'ボタンの数', type: 'select', options: opts(['1:1個', '2:2個', '3:3個', '4:4個']), number: true },
    { key: 'attrs.threeWay', label: '2ヶ所で入り切りできる(3路)', type: 'check' },
    { key: 'label',          label: 'メモ(図に表示)', type: 'text' },
    { type: 'confidence' },
  ],
  light: [
    { key: 'x',               label: '左から(mm)', type: 'number' },
    { key: 'h',               label: '床から(mm)', type: 'number', hint: '既定は記号の中心の高さ' },
    H_REF_FIELD,
    { key: 'attrs.lightKind', label: '種類',       type: 'select', options: LIGHT_KINDS },
    { key: 'label',           label: 'メモ(図に表示)', type: 'text' },
    { type: 'confidence' },
  ],
  other: [
    { key: 'x',     label: '左から(mm)', type: 'number' },
    { key: 'h',     label: '床から(mm)', type: 'number', hint: '既定は記号の中心の高さ' },
    H_REF_FIELD,
    { key: 'label', label: 'メモ(図に表示)', type: 'text' },
    { type: 'confidence' },
  ],
  furniture: [
    { key: 'x',      label: '左から(mm)',     type: 'number' },
    { key: 'width',  label: '幅(mm)',         type: 'number' },
    { key: 'bottom', label: '床から下端(mm)', type: 'number', hint: '床に置くなら0' },
    { key: 'height', label: '高さ(mm)',       type: 'number' },
    { key: 'label',  label: '名前(図に表示)', type: 'text', hint: '例: 冷蔵庫 W650×H1,820' },
    { type: 'confidence' },
  ],
  backing: [
    { type: 'backingBand', label: '高さ帯プリセット', hint: '選ぶと下端0・高さが入ります' },
    { key: 'x',      label: '左から(mm)',     type: 'number' },
    { key: 'width',  label: '幅(mm)',         type: 'number', hint: '1マス=910' },
    { key: 'bottom', label: '床から下端(mm)', type: 'number', hint: 'テレビ用なら600〜700など' },
    { key: 'height', label: '高さ(mm)',       type: 'number' },
    { key: 'label',  label: '名前(図に表示)', type: 'text', hint: '例: TV壁掛け用' },
    { key: 'note',   label: 'メモ',           type: 'textarea', hint: '用途・載せる物の重さなど' },
    { type: 'confidence' },
  ],
  notes: [
    { key: 'text',  label: 'メモの内容', type: 'textarea' },
    { key: 'level', label: '目立たせ方', type: 'select', options: opts(['info:ふつう', 'warning:⚠ 要確認(赤で表示)']) },
  ],
};

/** 'north:北の壁' のような書き方を選択肢に変換する(定義を短く書くための補助) */
function opts(list) {
  return list.map((s) => {
    const i = s.indexOf(':');
    return { value: s.slice(0, i), label: s.slice(i + 1) };
  });
}

/** パネルの見出し */
const TITLES = {
  wall: '壁全体の設定', openings: '窓・ドア', outlet: 'コンセント', switch: 'スイッチ',
  light: '照明', other: 'その他の部品', furniture: '家具・棚の枠', backing: '下地(壁の補強)', notes: 'メモ',
};

/* -------------------------------------------------------------------------- */

let el = {};             // 画面の部品(ui.jsから渡す)
let signature = '';      // いま組み立てている内容の目印。変わったら作り直す
let snapshotTaken = false;   // 文字入力中に「元に戻す」用のコピーを取ったか

/** ui.jsから最初に1回呼ぶ */
export function initPanel(nodes) { el = nodes; }

/**
 * 選んでいるものに合わせて右パネルを作り直す/値を合わせる。
 * データが変わるたびに呼ばれる。
 */
export function syncPanel() {
  const sel = state.getSelected();
  const target = sel ? sel.item : state.getWall();
  const key = panelKeyOf(sel);
  const sign = [key, sel ? sel.item.id : 'wall', target.kind || '', target.type || ''].join('|');

  if (sign !== signature) {
    signature = sign;
    build(key, target);
  }
  fill(key, target);
  el.panelTitle.textContent = TITLES[key];
  el.wallExtra.hidden = key !== 'wall';
  el.btnDelete.hidden = !sel;
}

/** 選んでいるものの種類 → パネルの種類 */
function panelKeyOf(sel) {
  if (!sel) return 'wall';
  if (sel.kind !== 'fixtures') return sel.kind;          // openings / furniture / backing / notes
  return FIELDS[sel.item.type] ? sel.item.type : 'other';
}

/* --------------------------------------------------------------------------
   入力欄の組み立て
   -------------------------------------------------------------------------- */

function build(key, target) {
  el.fields.innerHTML = '';
  for (const def of FIELDS[key]) {
    if (def.when && !def.when(target)) continue;
    el.fields.appendChild(makeField(def, key));
  }
}

function makeField(def, key) {
  if (def.type === 'confidence') return makeConfidence();
  const wrap = document.createElement('label');
  wrap.className = def.type === 'check' ? 'field field-check' : 'field';
  const caption = `<span>${def.label}${def.hint ? `<small>${def.hint}</small>` : ''}</span>`;

  let input;
  if (def.type === 'check') {
    input = elFrom('<input type="checkbox">');
    wrap.append(input, elFrom(caption));
  } else {
    if (['select', 'preset', 'doorSwing', 'backingBand'].includes(def.type)) {
      input = document.createElement('select');
      input.innerHTML = optionsFor(def, key);
    } else if (def.type === 'textarea') {
      input = document.createElement('textarea');
      input.rows = 2;
    } else {
      input = document.createElement('input');
      input.type = def.type === 'number' ? 'number' : 'text';
    }
    wrap.append(elFrom(caption), input);
  }

  input.dataset.field = def.key || def.type;
  // データに値が無いときに表示する既定値(例: hRef が未設定なら「中心」)
  if (def.fallback) input.dataset.fallback = def.fallback;
  bind(input, def);
  return wrap;
}

/** 選択肢のHTMLを作る */
function optionsFor(def, key) {
  if (def.type === 'preset') {
    const list = heightPresetsFor(key);
    return '<option value="">選ぶと高さが入ります</option>'
      + list.map((p) => `<option value="${p.id}">${p.name} 床から${p.h / 10}cm(${confText(p.confidence)})</option>`).join('');
  }
  if (def.type === 'backingBand') {
    return '<option value="">選ぶと高さ帯が入ります</option>'
      + BACKING_BANDS.map((b) => `<option value="${b.id}">${b.name}</option>`).join('');
  }
  const list = def.type === 'doorSwing' ? DOOR_SWINGS : def.options;
  return list.map((o) => `<option value="${o.value}">${o.label}</option>`).join('');
}

/** 要営業確認のチェックとバッジ */
function makeConfidence() {
  const box = document.createElement('div');
  box.innerHTML = '<label class="field field-check"><input type="checkbox" data-field="confidence">'
    + '<span>⚠ 要営業確認にする<small>図の中で赤く表示されます</small></span></label>'
    // 「なぜ赤いのか」が分からず戸惑う人が多いので、要営業確認のときだけ理由を1行出す(fillで出し入れ)
    + '<p class="hint conf-hint" data-conf-hint hidden>置いたばかりの部品は安全のため赤(要確認)で始まります。'
    + '高さプリセットを選ぶか、チェックを外すと黒になります。</p>'
    + '<p class="badge-line" data-badge>—</p>';
  const input = box.querySelector('input');
  input.addEventListener('change', () => {
    edit(true, (item) => {
      // チェックを外したときは「一般値(自分で入れた目安の値)」に戻す
      item.confidence = input.checked ? 'check' : 'nominal';
      if (input.checked && 'heightSource' in item) item.heightSource = 'check';
    });
  });
  return box;
}

/* --------------------------------------------------------------------------
   入力されたときの処理
   -------------------------------------------------------------------------- */

function bind(input, def) {
  if (def.type === 'preset') {
    input.addEventListener('change', () => applyPreset(input.value, input));
    return;
  }
  if (def.type === 'backingBand') {
    input.addEventListener('change', () => applyBackingBand(input.value, input));
    return;
  }
  if (def.type === 'doorSwing') {
    input.addEventListener('change', () => {
      const [hinge, swing] = input.value.split('|');
      edit(true, (item) => {
        item.panels = item.panels && item.panels.length
          ? item.panels : [{ kind: 'door', width: item.width }];
        item.panels[0].hinge = hinge;
        item.panels[0].swing = swing;
      });
    });
    return;
  }
  if (def.type === 'check') {
    input.addEventListener('change', () => edit(true, (item) => setValue(item, def.key, input.checked)));
    return;
  }
  if (def.type === 'select') {
    input.addEventListener('change', () => {
      const raw = def.number ? Number(input.value) : input.value;
      edit(true, (item) => {
        setValue(item, def.key, raw);
        if (def.key === 'kind') applyOpeningKind(item);   // 窓の種類を変えたとき
      });
      if (def.rebuild) { signature = ''; syncPanel(); }
    });
    return;
  }
  // 文字・数値の入力欄: 打っているあいだも図に反映する
  input.addEventListener('focus', () => { snapshotTaken = false; });
  input.addEventListener('input', () => {
    if (def.type === 'number') {
      const v = parseFloat(input.value);
      if (!isFinite(v)) return;                 // 入力途中(空欄など)は無視
      edit(!snapshotTaken, (item) => setValue(item, def.key, clamp(v, 0, 20000)));
    } else {
      edit(!snapshotTaken, (item) => setValue(item, def.key, input.value));
    }
    snapshotTaken = true;
  });
}

/** 高さプリセットを当てる(設計書5-1) */
function applyPreset(presetId, input) {
  const sel = state.getSelected();
  if (!sel) return;
  const preset = heightPresetsFor(sel.item.type).find((p) => p.id === presetId);
  if (!preset) return;
  edit(true, (item) => {
    item.h = preset.h;
    item.heightSource = preset.heightSource;
    item.confidence = preset.confidence;
  });
  input.value = presetId;
}

/** 下地の高さ帯プリセットを当てる(設計書5-2)。下端を床(0)に揃え、上端までの高さを入れる */
function applyBackingBand(bandId, input) {
  const band = BACKING_BANDS.find((b) => b.id === bandId);
  if (!band) return;
  const top = backingBandTop(band, state.getWall().height);
  edit(true, (item) => { item.bottom = 0; item.height = top; });
  input.value = bandId;
}

/** いまの下端・高さに一致する高さ帯プリセット(無ければ undefined) */
function backingBandOf(item) {
  const wallH = state.getWall().height;
  return BACKING_BANDS.find((b) => item.bottom === 0 && item.height === backingBandTop(b, wallH));
}

/** 窓・ドアの種類を変えたら、その種類のパネル構成(FIX+ドアなど)に合わせる */
function applyOpeningKind(item) {
  const def = openingKindOf(item.kind);
  if (!def.panels) { delete item.panels; return; }
  // 既定のパネル幅を、いまの幅に合わせて比例配分する
  const total = def.panels.reduce((sum, p) => sum + p.width, 0);
  item.panels = def.panels.map((p) => ({ ...p, width: Math.round((p.width / total) * item.width) }));
}

/** 選んでいるもの(または壁)を書き換える */
function edit(snapshot, mutator) {
  const sel = state.getSelected();
  state.update(() => mutator(sel ? state.getSelected().item : state.getWall()), { snapshot });
}

/* --------------------------------------------------------------------------
   値を画面に反映する
   -------------------------------------------------------------------------- */

function fill(key, target) {
  el.fields.querySelectorAll('[data-field]').forEach((input) => {
    const name = input.dataset.field;
    if (document.activeElement === input) return;      // 入力中の欄は邪魔しない
    if (name === 'confidence') {
      input.checked = target.confidence === 'check';
      return;
    }
    if (name === 'preset') {
      const hit = heightPresetsFor(key).find((p) => p.h === target.h);
      input.value = hit ? hit.id : '';
      return;
    }
    if (name === 'backingBand') {
      const hit = backingBandOf(target);
      input.value = hit ? hit.id : '';
      return;
    }
    if (name === 'doorSwing') {
      const panel = (target.panels || [])[0] || {};
      input.value = `${panel.hinge || 'left'}|${panel.swing || 'in'}`;
      return;
    }
    const value = getValue(target, name) ?? input.dataset.fallback;
    if (input.type === 'checkbox') input.checked = !!value;
    else input.value = value == null ? '' : value;
  });

  // 確度のバッジ
  const badge = el.fields.querySelector('[data-badge]');
  if (badge) {
    const conf = confidenceOf(target.confidence);
    badge.innerHTML = `確度: <span class="badge${conf.warn ? ' warn' : ''}">`
      + `${conf.warn ? '⚠ ' : ''}${conf.label}</span>`;
  }

  // 「赤で始まる」理由の1行は、要営業確認のときだけ出す
  const confHint = el.fields.querySelector('[data-conf-hint]');
  if (confHint) confHint.hidden = target.confidence !== 'check';
}

/* --------------------------------------------------------------------------
   小さな道具
   -------------------------------------------------------------------------- */

/** 'attrs.earth' のような指定でデータを読む */
function getValue(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/** 'attrs.earth' のような指定でデータを書く(途中のオブジェクトが無ければ作る) */
function setValue(obj, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  let node = obj;
  for (const k of keys) {
    if (typeof node[k] !== 'object' || node[k] === null) node[k] = {};
    node = node[k];
  }
  node[last] = value;
}

function confText(key) {
  const conf = confidenceOf(key);
  return conf.warn ? `⚠${conf.label}` : conf.label;
}

/** HTMLの文字列から要素を1個作る */
function elFrom(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstChild;
}

function clamp(v, min, max) { return Math.min(max, Math.max(min, Math.round(v))); }
