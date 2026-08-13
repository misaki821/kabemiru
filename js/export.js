/* ==========================================================================
   export.js — 図の書き出し(設計書7章)
   プロトタイプではPNG(画像)のみ。外部サービスは使わず、ブラウザの中だけで
   SVG → canvas(画像描画機能) → PNGファイル と変換する。
   ========================================================================== */

/** 書き出す画像の倍率。2にすると印刷しても粗くなりにくい */
const PIXEL_RATIO = 2;

/**
 * SVGの文字列をPNGにして保存(ダウンロード)する。
 * @param {string} svgText  render.jsが作ったSVGの文字列(透かし・凡例込み)
 * @param {string} fileName 保存するファイル名(.png付き)
 * @returns {Promise<void>}
 */
export function exportPng(svgText, fileName) {
  return new Promise((resolve, reject) => {
    // SVGの文字列を「ブラウザの中だけで使えるURL」に変換して<img>に読ませる
    const blob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      const w = img.naturalWidth || 1200;
      const h = img.naturalHeight || 820;
      const canvas = document.createElement('canvas');
      canvas.width = w * PIXEL_RATIO;
      canvas.height = h * PIXEL_RATIO;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';                       // 背景を白で塗る(透明だと印刷で困るため)
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      canvas.toBlob((pngBlob) => {
        if (!pngBlob) { reject(new Error('画像に変換できませんでした')); return; }
        downloadBlob(pngBlob, fileName);
        resolve();
      }, 'image/png');
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('図の読み込みに失敗しました'));
    };
    img.src = url;
  });
}

/** ファイルとして保存する(見えないリンクをクリックする仕組み) */
function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // すぐ消すとダウンロードが始まらない環境があるので、少し待ってから片付ける
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * 図をSVGファイルとして保存する(拡大しても粗れない図。設計書7章)
 * 画面に出しているSVGの文字列をそのまま保存するだけ。
 */
export function exportSvg(svgText, fileName) {
  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' + svgText;
  downloadBlob(new Blob([xml], { type: 'image/svg+xml;charset=utf-8' }), fileName);
}

/**
 * 家全体のデータをJSONファイルとして保存する(バックアップ・引っ越し用)
 * localStorageはブラウザ履歴の削除やPC買い替えで消えるため、これが救済手段(設計書6-5)。
 */
export function exportJson(data, fileName) {
  const text = JSON.stringify(data, null, 2);   // 人が読める形(2文字下げ)で保存
  downloadBlob(new Blob([text], { type: 'application/json;charset=utf-8' }), fileName);
}

/**
 * 選んでもらったJSONファイルを読み込んで、中身(オブジェクト)を返す。
 * 中身がカベミルのデータかどうかの確認は state.replaceData が行う。
 */
export function readJsonFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        resolve(JSON.parse(reader.result));
      } catch (e) {
        reject(new Error('ファイルの形式が壊れているようです(JSONとして読めません)。'));
      }
    };
    reader.onerror = () => reject(new Error('ファイルを読み込めませんでした。'));
    reader.readAsText(file);
  });
}

/**
 * 書き出しのファイル名を作る(例: kabemiru_LDK北_2026-08-03.png)
 * ファイル名に使えない文字は取り除く。
 */
export function buildFileName(wall, ext) {
  const faceChar = { north: '北', south: '南', east: '東', west: '西' }[wall.face] || '';
  const name = `${wall.room || '壁'}${faceChar}`.replace(/[\\/:*?"<>|\s]/g, '');
  return `kabemiru_${name}_${todayText()}.${ext}`;
}

/** データファイルの名前(家全体なので壁の名前は付けない) */
export function buildDataFileName() {
  return `kabemiru_データ_${todayText()}.json`;
}

function todayText() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* --------------------------------------------------------------------------
   TODO(次のバージョン・設計書7章)
   - 印刷用の書き出し(正確な縮尺での印刷)はv2。いまはPNGを各自で印刷してもらう
   -------------------------------------------------------------------------- */
