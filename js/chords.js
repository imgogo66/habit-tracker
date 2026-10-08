/* ============================================================
   chords.js · 和弦引擎
   - 和弦名稱解析 / 移調
   - 和弦譜整篇移調（只動和弦行，歌詞不動）
   - 指法推算（開放和弦優先，其餘用 E / A 型封閉和弦）
   - SVG 指板圖 + 六線譜數字
   無任何外部相依，可直接用 file:// 開啟。
   ============================================================ */
var Chords = (function () {
  'use strict';

  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT  = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var BASE  = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  /* 支援辨識的和弦性質，長的要排前面，否則 maj7 會被 m 先吃掉 */
  var QUAL_ALT = 'maj9|maj7|M7|m7b5|7sus4|sus2|sus4|add9|dim7|dim|aug|mMaj7|m11|m9|m7|m6|m|11|13|9|7|6|5';
  var CHORD_RE = new RegExp('^([A-G][#b♯♭]?)(' + QUAL_ALT + ')?(?:\\/([A-G][#b♯♭]?))?$');

  /* 譜面上常見、不該被當成和弦也不該被破壞的符號。
     中文吉他譜站很愛用 ** @@ ## %% 當段落／重複記號，這些都要跳過。 */
  var NEUTRAL_RE = /^(?:[|:/%*@#~=+\-–—.]+|[xX]\d+|\(\s*[xX]\d+\s*\)|N\.?C\.?)$/;

  /* 有畫指法圖的性質 */
  var DIAGRAM_QUALITIES = ['', 'm', '7', 'm7', 'maj7', 'sus4'];
  var QUALITY_LABEL = {
    '':     '大三和弦 Major',
    'm':    '小三和弦 minor',
    '7':    '屬七 7',
    'm7':   '小七 m7',
    'maj7': '大七 maj7',
    'sus4': '掛留四 sus4'
  };

  /* 可移動的封閉和弦型。frets 是相對把位，0 = 封閉那一格，-1 = 不彈 */
  var SHAPES = {
    E: {
      '':     { frets: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
      'm':    { frets: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
      '7':    { frets: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
      'm7':   { frets: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
      'maj7': { frets: [0, 2, 1, 1, 0, 0], fingers: [1, 4, 2, 3, 1, 1] },
      'sus4': { frets: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] }
    },
    A: {
      '':     { frets: [-1, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1] },
      'm':    { frets: [-1, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
      '7':    { frets: [-1, 0, 2, 0, 2, 0], fingers: [0, 1, 2, 1, 3, 1] },
      'm7':   { frets: [-1, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
      'maj7': { frets: [-1, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
      'sus4': { frets: [-1, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1] }
    }
  };

  /* 開放和弦（優先使用，比封閉和弦好按也好聽） */
  var OPEN = {
    'C':     { frets: [-1, 3, 2, 0, 1, 0],  fingers: [0, 3, 2, 0, 1, 0] },
    'C7':    { frets: [-1, 3, 2, 3, 1, 0],  fingers: [0, 3, 2, 4, 1, 0] },
    'Cmaj7': { frets: [-1, 3, 2, 0, 0, 0],  fingers: [0, 3, 2, 0, 0, 0] },
    'Csus4': { frets: [-1, 3, 3, 0, 1, 1],  fingers: [0, 2, 3, 0, 1, 1] },
    'D':     { frets: [-1, -1, 0, 2, 3, 2], fingers: [0, 0, 0, 1, 3, 2] },
    'Dm':    { frets: [-1, -1, 0, 2, 3, 1], fingers: [0, 0, 0, 2, 3, 1] },
    'D7':    { frets: [-1, -1, 0, 2, 1, 2], fingers: [0, 0, 0, 2, 1, 3] },
    'Dm7':   { frets: [-1, -1, 0, 2, 1, 1], fingers: [0, 0, 0, 2, 1, 1] },
    'Dmaj7': { frets: [-1, -1, 0, 2, 2, 2], fingers: [0, 0, 0, 1, 2, 3] },
    'Dsus4': { frets: [-1, -1, 0, 2, 3, 3], fingers: [0, 0, 0, 1, 3, 4] },
    'E':     { frets: [0, 2, 2, 1, 0, 0],   fingers: [0, 2, 3, 1, 0, 0] },
    'Em':    { frets: [0, 2, 2, 0, 0, 0],   fingers: [0, 2, 3, 0, 0, 0] },
    'E7':    { frets: [0, 2, 0, 1, 0, 0],   fingers: [0, 2, 0, 1, 0, 0] },
    'Em7':   { frets: [0, 2, 0, 0, 0, 0],   fingers: [0, 2, 0, 0, 0, 0] },
    'Emaj7': { frets: [0, 2, 1, 1, 0, 0],   fingers: [0, 3, 1, 2, 0, 0] },
    'Esus4': { frets: [0, 2, 2, 2, 0, 0],   fingers: [0, 1, 2, 3, 0, 0] },
    'G':     { frets: [3, 2, 0, 0, 0, 3],   fingers: [2, 1, 0, 0, 0, 3] },
    'G7':    { frets: [3, 2, 0, 0, 0, 1],   fingers: [3, 2, 0, 0, 0, 1] },
    'Gmaj7': { frets: [3, 2, 0, 0, 0, 2],   fingers: [3, 2, 0, 0, 0, 1] },
    'Gsus4': { frets: [3, 3, 0, 0, 1, 3],   fingers: [2, 3, 0, 0, 1, 4] },
    'A':     { frets: [-1, 0, 2, 2, 2, 0],  fingers: [0, 0, 1, 2, 3, 0] },
    'Am':    { frets: [-1, 0, 2, 2, 1, 0],  fingers: [0, 0, 2, 3, 1, 0] },
    'A7':    { frets: [-1, 0, 2, 0, 2, 0],  fingers: [0, 0, 2, 0, 3, 0] },
    'Am7':   { frets: [-1, 0, 2, 0, 1, 0],  fingers: [0, 0, 2, 0, 1, 0] },
    'Amaj7': { frets: [-1, 0, 2, 1, 2, 0],  fingers: [0, 0, 3, 1, 2, 0] },
    'Asus4': { frets: [-1, 0, 2, 2, 3, 0],  fingers: [0, 0, 1, 2, 3, 0] },
    'B7':    { frets: [-1, 2, 1, 2, 0, 2],  fingers: [0, 2, 1, 3, 0, 4] },
    'Bm7':   { frets: [-1, 2, 0, 2, 0, 2],  fingers: [0, 2, 0, 3, 0, 4] },
    'Fmaj7': { frets: [-1, -1, 3, 2, 1, 0], fingers: [0, 0, 3, 2, 1, 0] }
  };

  function mod12(n) { return ((n % 12) + 12) % 12; }

  function noteIndex(name) {
    var m = /^([A-G])([#b♯♭]?)$/.exec(name || '');
    if (!m) return -1;
    var i = BASE[m[1]];
    if (m[2] === '#' || m[2] === '♯') i += 1;
    if (m[2] === 'b' || m[2] === '♭') i -= 1;
    return mod12(i);
  }

  function noteName(idx, useFlat) { return (useFlat ? FLAT : SHARP)[mod12(idx)]; }

  function parse(name) {
    var m = CHORD_RE.exec((name || '').trim());
    if (!m) return null;
    var root = noteIndex(m[1]);
    if (root < 0) return null;
    return { root: root, quality: m[2] || '', bass: m[3] ? noteIndex(m[3]) : null };
  }

  function format(parsed, useFlat) {
    return noteName(parsed.root, useFlat) + parsed.quality +
      (parsed.bass === null ? '' : '/' + noteName(parsed.bass, useFlat));
  }

  function transposeChord(name, semitones, useFlat) {
    var p = parse(name);
    if (!p) return name;
    p.root = mod12(p.root + semitones);
    if (p.bass !== null) p.bass = mod12(p.bass + semitones);
    return format(p, useFlat);
  }

  /* ---------- 整篇譜移調 ---------- */

  /* 把 token 拆成「前綴符號 / 和弦本體 / 後綴符號」，例如 "**F" → ["**","F",""]。
     注意後綴不能收 #，否則 F# 的升記號會被當成裝飾砍掉。 */
  function splitAffix(token) {
    var m = /^([|([*@#%~=]*)(.*?)([|)\],.*@%~=]*)$/.exec(token);
    return m ? [m[1], m[2], m[3]] : ['', token, ''];
  }

  function isChordToken(token) {
    var core = splitAffix(token)[1];
    return !!core && CHORD_RE.test(core);
  }

  function isChordLine(line) {
    if (!line.trim()) return false;
    var tokens = line.trim().split(/\s+/);
    var chords = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (NEUTRAL_RE.test(tokens[i])) continue;
      if (isChordToken(tokens[i])) chords++;
      else return false;          // 出現非和弦的字 → 當成歌詞行，整行不動
    }
    return chords > 0;
  }

  /* 轉換和弦行，並盡量維持原本的欄位對齊 */
  function transposeChordLine(line, semitones, useFlat) {
    var re = /\S+/g, out = '', pos = 0, carry = 0, m;
    while ((m = re.exec(line)) !== null) {
      var gap = line.slice(pos, m.index);
      if (carry > 0) {                       // 新和弦變長了 → 吃掉後面的空白
        var eat = Math.min(carry, Math.max(0, gap.length - 1));
        gap = gap.slice(0, gap.length - eat);
        carry -= eat;
      } else if (carry < 0) {                // 變短了 → 補空白回去
        gap += new Array(-carry + 1).join(' ');
        carry = 0;
      }
      var parts = splitAffix(m[0]);
      var next = NEUTRAL_RE.test(m[0])
        ? m[0]
        : parts[0] + transposeChord(parts[1], semitones, useFlat) + parts[2];
      out += gap + next;
      carry += next.length - m[0].length;
      pos = m.index + m[0].length;
    }
    return out + line.slice(pos);
  }

  var BRACKET_RE = /\[([A-G][#b♯♭]?(?:maj9|maj7|M7|m7b5|7sus4|sus2|sus4|add9|dim7|dim|aug|mMaj7|m11|m9|m7|m6|m|11|13|9|7|6|5)?(?:\/[A-G][#b♯♭]?)?)\]/g;

  function transposeSheet(text, semitones, useFlat) {
    return String(text || '').split('\n').map(function (line) {
      if (BRACKET_RE.test(line)) {
        BRACKET_RE.lastIndex = 0;
        return line.replace(BRACKET_RE, function (_, c) {
          return '[' + transposeChord(c, semitones, useFlat) + ']';
        });
      }
      BRACKET_RE.lastIndex = 0;
      return isChordLine(line) ? transposeChordLine(line, semitones, useFlat) : line;
    }).join('\n');
  }

  /* 依序取出譜中出現的和弦（去重，保留出現順序） */
  function extractChords(text) {
    var seen = {}, list = [];
    function push(name) {
      var p = parse(name);
      if (!p) return;
      var key = format(p, false);
      if (seen[key]) return;
      seen[key] = true;
      list.push(name);
    }
    String(text || '').split('\n').forEach(function (line) {
      var m;
      BRACKET_RE.lastIndex = 0;
      if (BRACKET_RE.test(line)) {
        BRACKET_RE.lastIndex = 0;
        while ((m = BRACKET_RE.exec(line)) !== null) push(m[1]);
        return;
      }
      if (!isChordLine(line)) return;
      line.trim().split(/\s+/).forEach(function (t) {
        if (!NEUTRAL_RE.test(t)) push(splitAffix(t)[1]);
      });
    });
    return list;
  }

  /* 猜測原調：取第一個出現的和弦 */
  function guessKey(text) {
    var list = extractChords(text);
    return list.length ? list[0] : null;
  }

  /* ---------- 指法 ---------- */

  function buildBarre(shapeName, quality, fret) {
    var s = SHAPES[shapeName][quality];
    return {
      frets: s.frets.map(function (f) { return f < 0 ? -1 : f + fret; }),
      fingers: s.fingers.slice(),
      barre: { fret: fret, from: shapeName === 'E' ? 0 : 1, to: 5 },
      label: (shapeName === 'E' ? '6 弦根音' : '5 弦根音') + ' · 第 ' + fret + ' 格封閉'
    };
  }

  function openVoicing(data) {
    return { frets: data.frets.slice(), fingers: data.fingers.slice(), barre: null, label: '開放和弦' };
  }

  /* 回傳最多兩種指法：開放優先，其次把位最低的封閉和弦 */
  function voicings(root, quality) {
    if (DIAGRAM_QUALITIES.indexOf(quality) < 0) return [];
    var list = [];
    var openKey = SHARP[root] + quality;
    var openKeyFlat = FLAT[root] + quality;
    if (OPEN[openKey]) list.push(openVoicing(OPEN[openKey]));
    else if (OPEN[openKeyFlat]) list.push(openVoicing(OPEN[openKeyFlat]));

    var barres = [];
    var fretE = mod12(root - 4) || 12;
    var fretA = mod12(root - 9) || 12;
    if (fretE <= 9) barres.push(buildBarre('E', quality, fretE));
    if (fretA <= 9) barres.push(buildBarre('A', quality, fretA));
    barres.sort(function (a, b) { return a.barre.fret - b.barre.fret; });

    return list.concat(barres).slice(0, 2);
  }

  function get(name) {
    var p = parse(name);
    if (!p) return null;
    return {
      name: name,
      root: p.root,
      quality: p.quality,
      bass: p.bass,
      hasDiagram: DIAGRAM_QUALITIES.indexOf(p.quality) >= 0,
      voicings: voicings(p.root, p.quality)
    };
  }

  /* 六線譜數字，例如 "x32010" 或高把位的 "8-10-10-9-8-8" */
  function tabString(frets) {
    var wide = frets.some(function (f) { return f > 9; });
    var parts = frets.map(function (f) { return f < 0 ? 'x' : String(f); });
    return wide ? parts.join('-') : parts.join('');
  }

  /* ---------- SVG 指板圖 ---------- */

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function el(tag, attrs) {
    var node = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) {
      node.setAttribute(k, attrs[k]);
    }
    return node;
  }

  function renderDiagram(voicing, title) {
    var FRET_COUNT = 5, W = 128, TOP = 30, GAP_Y = 21;
    var H = TOP + GAP_Y * FRET_COUNT + 22;

    var frets = voicing.frets;
    var pressed = frets.filter(function (f) { return f > 0; });
    var maxF = pressed.length ? Math.max.apply(null, pressed) : 0;
    var minF = pressed.length ? Math.min.apply(null, pressed) : 1;
    var start = maxF <= FRET_COUNT ? 1 : minF;   // 低把位就畫上弦枕
    var showNut = start === 1;

    /* 高把位要在左邊留空間寫「第幾格」，否則標籤會被切掉 */
    var PAD_X = showNut ? 15 : 27;
    var GAP_X = (W - PAD_X - 15) / 5;

    var svg = el('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      role: 'img',
      'aria-label': (title || '和弦') + ' 指法圖，六線譜 ' + tabString(frets)
    });

    /* 弦（直線，左=第6弦低音E） */
    for (var s = 0; s < 6; s++) {
      svg.appendChild(el('line', {
        x1: PAD_X + GAP_X * s, y1: TOP, x2: PAD_X + GAP_X * s, y2: TOP + GAP_Y * FRET_COUNT,
        stroke: '#8C8072', 'stroke-width': 1
      }));
    }
    /* 琴衍（橫線） */
    for (var f = 0; f <= FRET_COUNT; f++) {
      svg.appendChild(el('line', {
        x1: PAD_X, y1: TOP + GAP_Y * f, x2: PAD_X + GAP_X * 5, y2: TOP + GAP_Y * f,
        stroke: '#8C8072', 'stroke-width': f === 0 && showNut ? 4 : 1,
        'stroke-linecap': 'round'
      }));
    }
    /* 高把位時標出起始格數 */
    if (!showNut) {
      var lbl = el('text', {
        x: PAD_X - 7, y: TOP + GAP_Y * 0.72, 'text-anchor': 'end',
        'font-size': 10, fill: '#8C8072', 'font-family': 'monospace'
      });
      lbl.textContent = start + 'fr';
      svg.appendChild(lbl);
    }

    /* 上方的 ○ 與 × */
    for (var i = 0; i < 6; i++) {
      var x = PAD_X + GAP_X * i;
      if (frets[i] === -1) {
        svg.appendChild(el('path', {
          d: 'M' + (x - 3.5) + ' ' + (TOP - 14) + ' l7 7 M' + (x + 3.5) + ' ' + (TOP - 14) + ' l-7 7',
          stroke: '#A6443A', 'stroke-width': 1.6, 'stroke-linecap': 'round', fill: 'none'
        }));
      } else if (frets[i] === 0) {
        svg.appendChild(el('circle', {
          cx: x, cy: TOP - 10.5, r: 3.6, fill: 'none', stroke: '#3C6B52', 'stroke-width': 1.6
        }));
      }
    }

    /* 封閉橫線 */
    if (voicing.barre && voicing.barre.fret >= start && voicing.barre.fret < start + FRET_COUNT) {
      var by = TOP + GAP_Y * (voicing.barre.fret - start + 0.5);
      svg.appendChild(el('rect', {
        x: PAD_X + GAP_X * voicing.barre.from - 6.5, y: by - 6.5,
        width: GAP_X * (voicing.barre.to - voicing.barre.from) + 13, height: 13,
        rx: 6.5, fill: '#A9703F'
      }));
    }

    /* 按弦點與手指編號 */
    for (var j = 0; j < 6; j++) {
      var fr = frets[j];
      if (fr <= 0) continue;
      var cx = PAD_X + GAP_X * j;
      var cy = TOP + GAP_Y * (fr - start + 0.5);
      var onBarre = voicing.barre && fr === voicing.barre.fret &&
        j >= voicing.barre.from && j <= voicing.barre.to;
      if (!onBarre) {
        svg.appendChild(el('circle', { cx: cx, cy: cy, r: 6.5, fill: '#A9703F' }));
      }
      var fg = voicing.fingers[j];
      if (fg) {
        var t = el('text', {
          x: cx, y: cy + 3.3, 'text-anchor': 'middle',
          'font-size': 9, fill: '#FFFCF5', 'font-family': 'sans-serif', 'font-weight': '700'
        });
        t.textContent = fg;
        svg.appendChild(t);
      }
    }

    /* 底部弦名 */
    var names = ['E', 'A', 'D', 'G', 'B', 'e'];
    for (var k = 0; k < 6; k++) {
      var n = el('text', {
        x: PAD_X + GAP_X * k, y: H - 7, 'text-anchor': 'middle',
        'font-size': 8.5, fill: '#B3A795', 'font-family': 'monospace'
      });
      n.textContent = names[k];
      svg.appendChild(n);
    }
    return svg;
  }

  /* ---------- 變調夾建議 ---------- */

  var EASY_KEYS = [0, 7, 2, 9, 4];   // C G D A E：開放和弦最多的調

  function capoSuggestions(targetRoot) {
    var out = [];
    for (var capo = 1; capo <= 7; capo++) {
      var shape = mod12(targetRoot - capo);
      if (EASY_KEYS.indexOf(shape) >= 0) out.push({ capo: capo, shapeKey: shape });
    }
    return out.slice(0, 3);
  }

  /* ---------- 級數表 ---------- */

  var DEGREES = ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii°'];
  var DEGREE_STEPS = [0, 2, 4, 5, 7, 9, 11];
  var DEGREE_QUALITY = ['', 'm', 'm', '', '', 'm', 'dim'];

  function degreeTable(useFlat) {
    return SHARP.map(function (_, keyIdx) {
      return {
        key: noteName(keyIdx, useFlat),
        keyIndex: keyIdx,
        chords: DEGREE_STEPS.map(function (step, d) {
          var r = mod12(keyIdx + step);
          return { root: r, name: noteName(r, useFlat) + DEGREE_QUALITY[d], degree: DEGREES[d] };
        })
      };
    });
  }

  return {
    SHARP: SHARP,
    FLAT: FLAT,
    DEGREES: DEGREES,
    DIAGRAM_QUALITIES: DIAGRAM_QUALITIES,
    QUALITY_LABEL: QUALITY_LABEL,
    noteName: noteName,
    noteIndex: noteIndex,
    mod12: mod12,
    parse: parse,
    get: get,
    transposeChord: transposeChord,
    transposeSheet: transposeSheet,
    extractChords: extractChords,
    guessKey: guessKey,
    tabString: tabString,
    renderDiagram: renderDiagram,
    capoSuggestions: capoSuggestions,
    degreeTable: degreeTable
  };
})();
