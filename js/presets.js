/* ==========================================================================
   presets.js — 数値の定義集(設計書5章)
   「高さプリセット」「確度ラベル」「窓・ドアの初期寸法」「サンプル壁」を置く。
   ここには画面や描画のコードは書かない(数字と文字だけのファイル)。
   ========================================================================== */

/** 1マスの寸法(mm)。一条のグリッドは910mm(設計書5-2) */
export const MASU_MM = 910;

/** 壁の厚さの既定値(mm)。HUGmeの内壁=120mm[公式](設計書3-6) */
export const DEFAULT_WALL_THICKNESS = 120;

/** ドラッグで動かすときの刻み(mm)。設計書3-6「10mm刻みスナップ」 */
export const SNAP_MM = 10;

/* --------------------------------------------------------------------------
   確度ラベル(設計書5-4)
   その数値がどれくらい確かなのかの4区分。check(要営業確認)だけ赤く表示する。
   -------------------------------------------------------------------------- */
export const CONFIDENCE = {
  measured: { key: 'measured', label: '実測',      warn: false },
  official: { key: 'official', label: '公式',      warn: false },
  nominal:  { key: 'nominal',  label: '一般値',    warn: false },
  check:    { key: 'check',    label: '要営業確認', warn: true  },
};

/** 確度ラベルの定義を取り出す(未知の値が来ても落ちないようにする) */
export function confidenceOf(key) {
  return CONFIDENCE[key] || CONFIDENCE.nominal;
}

/* --------------------------------------------------------------------------
   高さプリセット(設計書5-1)
   h = 記号の「中心」の床からの高さ(mm)。一条の「H=」は中心指定[公式]。
   for = このプリセットを出す記号の種類 / heightSource = 高さの根拠
   -------------------------------------------------------------------------- */
export const HEIGHT_PRESETS = [
  // --- コンセント系(低い順) ---
  { id: 'outlet-tv-low',  name: 'TV裏・機器用',   h: 200,  confidence: 'check',    heightSource: 'check',   for: ['outlet'] },
  { id: 'outlet-low',     name: '低め統一',       h: 250,  confidence: 'check',    heightSource: 'check',   for: ['outlet'], note: '20cmの実例あり/15cm以下は巾木干渉' },
  { id: 'outlet-std',     name: 'コンセント標準', h: 300,  confidence: 'official', heightSource: 'default', for: ['outlet'] },
  { id: 'outlet-kitchen', name: 'キッチン横',     h: 830,  confidence: 'measured', heightSource: 'default', for: ['outlet'] },
  { id: 'outlet-counter', name: 'カウンター上(キッチン背面)', h: 1000, confidence: 'measured', heightSource: 'default', for: ['outlet'] },
  { id: 'outlet-tv',      name: 'TV裏(壁掛けTVの中心)',      h: 1000, confidence: 'check',    heightSource: 'check',   for: ['outlet'] },
  { id: 'outlet-washer',  name: '洗濯機用',       h: 1350, confidence: 'official', heightSource: 'default', for: ['outlet'] },
  { id: 'outlet-aircon',  name: 'エアコン専用',   h: 1850, confidence: 'official', heightSource: 'default', for: ['outlet'], note: '〜210cmの実例あり' },
  { id: 'outlet-fridge',  name: '冷蔵庫用',       h: 2000, confidence: 'official', heightSource: 'default', for: ['outlet'] },
  { id: 'outlet-infobox', name: '情報ボックス',   h: 2100, confidence: 'measured', heightSource: 'default', for: ['outlet'] },
  // --- スイッチ・リモコン系 ---
  { id: 'switch-std',     name: 'スイッチ標準',   h: 1200, confidence: 'official', heightSource: 'default', for: ['switch'] },
  { id: 'remote-std',     name: 'リモコン類(床暖・給湯・インターホン)', h: 1400, confidence: 'official', heightSource: 'default', for: ['switch'] },
];

/** その種類の記号で使える高さプリセットだけを返す */
export function heightPresetsFor(type) {
  return HEIGHT_PRESETS.filter((p) => p.for.includes(type));
}

/* --------------------------------------------------------------------------
   天井の高さプリセット(設計書5-2)
   -------------------------------------------------------------------------- */
export const CEILING_PRESETS = [
  { h: 2400, name: '標準 240cm',   confidence: 'measured' },
  { h: 2150, name: 'トイレ 215cm', confidence: 'check'    },
];

/** 壁の幅で選べるマス数(1〜10マス・半マス刻み) */
export function masuOptions() {
  const list = [];
  for (let m = 1; m <= 10; m += 0.5) list.push(m);
  return list;
}

/** マス数 → 壁面の幅(mm)。芯々寸法から壁の厚さを引く(設計書3-6) */
export function masuToWidth(masu, wallThickness) {
  return Math.round(masu * MASU_MM - wallThickness);
}

/* --------------------------------------------------------------------------
   窓・ドアの汎用パーツ5種(設計書5-3)
   幅・高さ・下端の初期値は「自宅で実在確認できた値」。ユーザーは数値を直すだけ。
   置いた直後の確度は check(要営業確認)から始める(設計書5-4)。
   -------------------------------------------------------------------------- */
export const OPENING_KINDS = [
  {
    kind: 'window', name: '開き窓',
    width: 575, height: 1272, sillHeight: 969,
    note: 'JK2042相当(呼称606×1,272・実測開口幅570〜580)。上端は呼称値のため要確認',
  },
  {
    kind: 'slidingWindow', name: '引違い窓',
    width: 1637, height: 1272, sillHeight: 969,
    note: 'J5942相当(呼称1,790×1,272・実測開口幅1,637)',
  },
  {
    kind: 'fix', name: 'FIX窓(はめ殺し)',
    width: 600, height: 900, sillHeight: 969,
    note: '実例データなし。図面に合わせて数値を直してください',
  },
  {
    kind: 'terrace', name: '掃き出し窓',
    width: 1643, height: 2150, sillHeight: 0,
    panels: [
      { kind: 'fix',  width: 640 },
      { kind: 'door', width: 1003, hinge: 'right', swing: 'out' },
    ],
    note: 'JM5971BNW相当(呼称1,790×2,150・実測開口幅1,643)。下枠の納まりは要確認',
  },
  {
    kind: 'door', name: '室内ドア',
    width: 718, height: 2030, sillHeight: 0,
    panels: [{ kind: 'door', width: 718, hinge: 'left', swing: 'in' }],
    note: 'S33開き戸相当(有効幅560×有効高2,030・開口幅713〜723)。引戸(S300)は開口幅755',
  },
];

/** 窓・ドアの種類の定義を取り出す */
export function openingKindOf(kind) {
  return OPENING_KINDS.find((k) => k.kind === kind) || OPENING_KINDS[0];
}

/**
 * ドアの開く向きの選択肢(設計書3-5「吊元・開き勝手」は画面に出さない言い換え)
 * データは panels[0] の hinge(左右)と swing(手前/向こう/引戸)で持つ。
 */
export const DOOR_SWINGS = [
  { value: 'left|in',     label: '左が軸・手前に開く' },
  { value: 'left|out',    label: '左が軸・向こうに開く' },
  { value: 'right|in',    label: '右が軸・手前に開く' },
  { value: 'right|out',   label: '右が軸・向こうに開く' },
  { value: 'left|slide',  label: '引戸(左へ開く)' },
  { value: 'right|slide', label: '引戸(右へ開く)' },
];

/** 照明の種別(設計書5-5。円の中に書く文字) */
export const LIGHT_KINDS = [
  { value: 'D', label: 'ダウンライト' },
  { value: 'S', label: 'シーリング(天井付け)' },
  { value: 'P', label: 'ペンダント(吊り下げ)' },
  { value: 'B', label: 'ブラケット(壁付け)' },
];

/** 新しく置く照明の既定の種別。壁面図に載る照明は壁付き=ブラケットが基本(設計書5-5) */
export const DEFAULT_LIGHT_KIND = 'B';

/* --------------------------------------------------------------------------
   スイッチの種別(設計書5-5)
   value = データに入る値(attrs.variant) / label = 右パネルの選択肢の文字
   name  = 図中のラベル・凡例に出す呼び名(ラベル未入力のときに使う)
   記号の絵柄は種別で変えない(白い四角+黒点のまま)。
   例外は「かってに(人感)」で、これだけ大きめの黒点1つで描く。
   -------------------------------------------------------------------------- */
export const SWITCH_VARIANTS = [
  { value: 'standard',    label: '標準(片切)',       name: 'スイッチ' },
  { value: 'hotaru',      label: 'ほたる',           name: 'ほたるスイッチ' },
  { value: 'pilot',       label: 'パイロット',       name: 'パイロットスイッチ' },
  { value: 'pilotHotaru', label: 'パイロットほたる', name: 'パイロットほたるスイッチ' },
  { value: 'onoff',       label: '入切表示',         name: '入切表示スイッチ' },
  { value: 'name',        label: 'ネーム',           name: 'ネームスイッチ' },
  { value: 'sensor',      label: 'かってに(人感)',   name: 'かってにスイッチ(人感)' },
  { value: 'dimmer',      label: '調光',             name: '調光スイッチ' },
];

/** 新しく置くスイッチの既定の種別 */
export const DEFAULT_SWITCH_VARIANT = 'standard';

/** スイッチ種別の定義を取り出す(未知の値・未設定なら標準として扱う) */
export function switchVariantOf(value) {
  return SWITCH_VARIANTS.find((v) => v.value === value) || SWITCH_VARIANTS[0];
}

/* --------------------------------------------------------------------------
   高さの基準(hRef・設計書4-3)
   h(床からの高さ)が記号のどこを指しているか。既定は中心(一条の「H=」は中心指定[公式])。
   -------------------------------------------------------------------------- */
export const H_REFS = [
  { value: 'center', label: '中心(既定)' },
  { value: 'top',    label: '上端' },
  { value: 'bottom', label: '下端' },
];

/** 高さの基準の既定値 */
export const DEFAULT_H_REF = 'center';

/* --------------------------------------------------------------------------
   ★ attrs(記号ごとの属性)の正式なキー名 ★(設計書4-3)
   attrs はtypeごとに自由度を持たせるフィールドだが、**アプリが解釈するキー名はここが唯一の定義**。
   図に反映されるのは「アプリが見るキー」だけなので、名前がずれると図に出ない(検証B-5)。
   新しい属性を足すときは、まずこの表に1行足すこと。
   -------------------------------------------------------------------------- */
export const ATTR_KEYS = {
  // --- コンセント(outlet / outlet-info) ---
  earth:      'earth',      // アース付(E)          : true / false     → 記号に「E」を描く
  dedicated:  'dedicated',  // 専用回路              : true / false     → いまは図に出さない(ラベルに書く)
  voltage:    'voltage',    // 電圧                  : 100 / 200        → いまは図に出さない(ラベルに書く)
  waterproof: 'waterproof', // 防水                  : true / false     → いまは図に出さない(ラベルに書く)
  // --- 情報コンセント(outlet-info) ---
  tv:         'tv',         // TV端子                : true / 種別の文字 → 記号の下に「TV」
  lan:        'lan',        // LAN端子               : true / "CAT6A"等  → 記号の下に「LAN」
  tel:        'tel',        // 電話端子              : true / 種別の文字 → 記号の下に「TEL」
  // --- スイッチ(switch) ---
  variant:    'variant',    // 種別                  : SWITCH_VARIANTS の value(standard/hotaru/sensor…)
  threeWay:   'threeWay',   // 3路(2ヶ所で入り切り) : true / false     → 記号に「3」を描く
  // --- 照明(light) ---
  lightKind:  'lightKind',  // 種別                  : LIGHT_KINDS の value(D/S/P/B)
  // --- 分電盤・情報ボックス(panel) ---
  contents:   'contents',   // 中に入るものメモ      : 文字列
};

/**
 * 旧いデータ・手書きJSONでよくある別名 → 正式キーへの読み替え表(読み込み時に吸収する)。
 * convert は値の変換(省略時はそのまま)。値が undefined になった項目は捨てる。
 * 例: `{"way": 3}`(3路スイッチ)→ `{"threeWay": true}`
 */
export const ATTR_ALIASES = [
  { from: 'way',      to: 'threeWay',  convert: (v) => Number(v) >= 3 || v === true },
  { from: 'threeway', to: 'threeWay',  convert: (v) => !!v },
  { from: '3way',     to: 'threeWay',  convert: (v) => !!v },
  { from: 'ground',   to: 'earth',     convert: (v) => !!v },
  { from: 'volt',     to: 'voltage',   convert: (v) => Number(v) || undefined },
  { from: 'kind',     to: 'lightKind' },
  // 人感スイッチの旧形式(attrs.sensor / attrs.motion = true)は variant にまとめる
  { from: 'sensor',   to: 'variant',   convert: (v) => (v === true ? 'sensor' : undefined) },
  { from: 'motion',   to: 'variant',   convert: (v) => (v === true ? 'sensor' : undefined) },
];

/** 家具・棚の枠を置くときの初期値 */
export const FURNITURE_DEFAULT = { width: 900, height: 1800, label: '家具・棚' };

/* --------------------------------------------------------------------------
   新しく置く部品の中身を作る(スキーマは設計書4-3)
   置いたばかりのものは confidence="check"(要営業確認・赤)から始める(設計書5-4)
   -------------------------------------------------------------------------- */

/** 電気記号(コンセント/スイッチ/照明)。x・hは記号の中心(mm) */
export function newFixture(id, type, x, h) {
  const attrs = {};
  if (type === 'light') attrs.lightKind = DEFAULT_LIGHT_KIND;
  if (type === 'switch') attrs.variant = DEFAULT_SWITCH_VARIANT;
  return {
    id, type, x, h, hBase: 'fl',
    gangs: type === 'outlet' ? 2 : 1,
    attrs, label: '',
    heightSource: 'check', confidence: 'check',
  };
}

/** 窓・ドア。centerX(mm)を中央にして置き、壁からはみ出さないようにする */
export function newOpening(id, kind, centerX, wallWidth) {
  const def = openingKindOf(kind);
  const x = Math.min(Math.max(centerX - def.width / 2, 0), Math.max(0, wallWidth - def.width));
  return {
    id, kind: def.kind, x: Math.round(x),
    width: def.width, height: def.height, sillHeight: def.sillHeight,
    productCode: '', label: def.name,
    ...(def.panels ? { panels: JSON.parse(JSON.stringify(def.panels)) } : {}),
    confidence: 'check', note: def.note,
  };
}

/** 家具・棚の枠。床(下端0)に置く */
export function newFurniture(id, centerX, wallWidth) {
  const def = FURNITURE_DEFAULT;
  const x = Math.min(Math.max(centerX - def.width / 2, 0), Math.max(0, wallWidth - def.width));
  return {
    id, x: Math.round(x), width: def.width, bottom: 0, height: def.height,
    style: 'dashed', label: def.label, confidence: 'check',
  };
}

/* --------------------------------------------------------------------------
   サンプル壁(スターターJSON・設計書4-5)
   保存データが無いときはこれを開く。「白紙から始めさせない」ための初期データ。
   ※ 毎回コピーを返す(元データを画面の操作で書き換えないようにするため)
   -------------------------------------------------------------------------- */
const STARTER_DATA = {
  schemaVersion: 1,
  meta: {
    title: 'わが家の壁面図',
    createdAt: '2026-08-03',
    app: 'kabemiru',
    wallThickness: DEFAULT_WALL_THICKNESS,
  },
  walls: [
    {
      id: 'w1',
      floor: '1F', room: 'LDK', face: 'north',
      faceLabel: 'キッチン背面',
      leftLabel: '西(玄関ホール側)', rightLabel: '東(外壁側)',
      width: 3520, height: 2400,
      floorZones: [{ from: 0, to: 3520, level: 0, label: '床±0' }],
      openings: [
        {
          id: 'op1', kind: 'terrace',
          x: 934, width: 1643, sillHeight: 0, height: 2150,
          productCode: 'JM5971BNW',
          label: '掃き出し(テラスドア+FIX)',
          panels: [
            { kind: 'fix',  width: 640 },
            { kind: 'door', width: 1003, hinge: 'right', swing: 'out' },
          ],
          confidence: 'nominal',
          note: '呼称値。下枠の納まりは要確認',
        },
      ],
      fixtures: [
        {
          id: 'f1', type: 'outlet',
          x: 294, h: 2000, hBase: 'fl',
          gangs: 2, attrs: { earth: true, dedicated: true, voltage: 100 },
          label: '冷蔵庫用コンセント(E付)',
          heightSource: 'default', confidence: 'check',
          labelOffset: { dx: 100, dy: -70 },
        },
        {
          id: 'f2', type: 'switch',
          x: 3300, h: 1200, hBase: 'fl',
          gangs: 2, attrs: {},
          label: 'キッチン照明スイッチ',
          heightSource: 'default', confidence: 'official',
        },
      ],
      furniture: [
        {
          id: 'fur1', x: 0, width: 650, bottom: 0, height: 1820,
          style: 'dashed', label: '冷蔵庫 W650×H1,820', confidence: 'check',
        },
      ],
      notes: [
        { id: 'n1', text: '横方向寸法は図面グリッド実測・要営業確認', level: 'warning' },
      ],
    },
  ],
};

/** サンプル壁のデータをコピーして返す */
export function starterData() {
  return JSON.parse(JSON.stringify(STARTER_DATA));
}
