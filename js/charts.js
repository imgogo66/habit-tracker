/* ============================================================
   charts.js · 視覺化
   月曆熱力圖（HTML grid）、週進度條、12 週趨勢折線（手寫 SVG）
   沒有用任何圖表套件，離線也能跑。
   ============================================================ */
var Charts = (function () {
  'use strict';

  var FIT = '#3C6B52', GTR = '#A9703F';
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    var n = document.createElementNS(SVG_NS, tag);
    for (var k in attrs) if (Object.prototype.hasOwnProperty.call(attrs, k)) n.setAttribute(k, attrs[k]);
    return n;
  }

  /* 分鐘數 → 透明度。有練就至少看得見 */
  function intensity(minutes, max) {
    if (!minutes) return 0;
    return 0.35 + 0.65 * Math.min(1, minutes / Math.max(max, 30));
  }

  /* ---------- 月曆熱力圖 ---------- */

  function renderHeatmap(container, year, month, onPick) {
    container.innerHTML = '';
    var grid = document.createElement('div');
    grid.className = 'hm';

    ['一', '二', '三', '四', '五', '六', '日'].forEach(function (d) {
      var h = document.createElement('div');
      h.className = 'hm-head';
      h.textContent = d;
      grid.appendChild(h);
    });

    var first = new Date(year, month, 1);
    var lead = (first.getDay() + 6) % 7;          // 以星期一開頭
    var total = new Date(year, month + 1, 0).getDate();
    var max = Store.monthMax(year, month);
    var todayKey = Store.today();

    for (var i = 0; i < lead; i++) {
      var pad = document.createElement('div');
      pad.className = 'hm-cell empty';
      grid.appendChild(pad);
    }

    for (var d = 1; d <= total; d++) {
      var key = Store.ymd(new Date(year, month, d));
      var fm = Store.minutesOf(key, 'fitness');
      var gm = Store.minutesOf(key, 'guitar');

      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'hm-cell' + (key === todayKey ? ' today' : '');
      cell.dataset.date = key;

      var parts = [];
      if (fm) parts.push('健身 ' + fm + ' 分');
      if (gm) parts.push('吉他 ' + gm + ' 分');
      cell.title = key + (parts.length ? '：' + parts.join('、') : '：沒有紀錄');
      cell.setAttribute('aria-label', cell.title);

      var bars = document.createElement('div');
      bars.className = 'hm-bars';
      var left = document.createElement('span');
      left.style.background = FIT;
      left.style.opacity = intensity(fm, max.fitness);
      var right = document.createElement('span');
      right.style.background = GTR;
      right.style.opacity = intensity(gm, max.guitar);
      bars.appendChild(left);
      bars.appendChild(right);

      var num = document.createElement('span');
      num.className = 'hm-num';
      num.textContent = d;

      cell.appendChild(bars);
      cell.appendChild(num);
      if (onPick) {
        cell.addEventListener('click', (function (k) {
          return function () { onPick(k); };
        })(key));
      }
      grid.appendChild(cell);
    }

    container.appendChild(grid);
  }

  /* ---------- 週進度條 ---------- */

  function renderWeekBars(container) {
    container.innerHTML = '';
    [
      { track: 'fitness', label: '🏋️ 健身', cls: 'wbar-fit' },
      { track: 'guitar',  label: '🎸 吉他', cls: 'wbar-gtr' }
    ].forEach(function (cfg) {
      var w = Store.weekStats(cfg.track);
      var todayKey = Store.today();

      var box = document.createElement('div');
      box.className = 'wbar ' + cfg.cls;

      var top = document.createElement('div');
      top.className = 'wbar-top';
      top.innerHTML = '<span>' + cfg.label + '</span>' +
        '<span><strong>' + w.sessions + '</strong> / ' + w.goalSessions + ' 次' +
        '<span class="muted"> · ' + w.minutes + ' 分鐘</span></span>';

      var track = document.createElement('div');
      track.className = 'wbar-track';
      var fill = document.createElement('div');
      fill.className = 'wbar-fill';
      fill.style.width = w.pct + '%';
      track.appendChild(fill);

      var days = document.createElement('div');
      days.className = 'wbar-days';
      ['一', '二', '三', '四', '五', '六', '日'].forEach(function (name, i) {
        var dd = w.days[i];
        var cell = document.createElement('div');
        cell.className = 'wbar-day' + (dd.date === todayKey ? ' today' : '');
        cell.title = dd.date + (dd.done ? '：' + dd.minutes + ' 分鐘' : '：休息');
        var dot = document.createElement('span');
        dot.className = 'wbar-dot' + (dd.done ? ' on' : '');
        cell.appendChild(dot);
        cell.appendChild(document.createTextNode(name));
        days.appendChild(cell);
      });

      box.appendChild(top);
      box.appendChild(track);
      box.appendChild(days);
      container.appendChild(box);
    });
  }

  /* ---------- 12 週趨勢折線 ---------- */

  function renderTrend(container, weeks) {
    container.innerHTML = '';
    weeks = weeks || 12;

    var fit = Store.weeklySeries('fitness', weeks);
    var gtr = Store.weeklySeries('guitar', weeks);
    var peak = Math.max(30, Math.max.apply(null,
      fit.map(function (p) { return p.minutes; }).concat(gtr.map(function (p) { return p.minutes; }))));
    /* 挑一個能被 4 等分、讀起來順眼的上限（0/60/120/180/240 這種） */
    var NICE = [15, 30, 45, 60, 90, 120, 150, 180, 240, 300, 420, 600, 900];
    var step = 0;
    for (var si = 0; si < NICE.length; si++) {
      if (NICE[si] * 4 >= peak) { step = NICE[si]; break; }
    }
    if (!step) step = Math.ceil(peak / 4 / 60) * 60;
    var top = step * 4;

    var W = 680, H = 230, L = 42, R = 14, T = 16, B = 34;
    var innerW = W - L - R, innerH = H - T - B;
    var stepX = weeks > 1 ? innerW / (weeks - 1) : 0;

    var svg = svgEl('svg', {
      viewBox: '0 0 ' + W + ' ' + H, role: 'img',
      'aria-label': '近 ' + weeks + ' 週每週練習分鐘數趨勢圖'
    });

    /* 格線與 Y 軸刻度 */
    var ticks = 4;
    for (var t = 0; t <= ticks; t++) {
      var val = Math.round(top * t / ticks);
      var y = T + innerH - innerH * t / ticks;
      svg.appendChild(svgEl('line', {
        x1: L, y1: y, x2: W - R, y2: y,
        stroke: '#EFE6D5', 'stroke-width': 1
      }));
      var lbl = svgEl('text', {
        x: L - 8, y: y + 4, 'text-anchor': 'end',
        'font-size': 11, fill: '#8C8072', 'font-family': 'sans-serif'
      });
      lbl.textContent = val;
      svg.appendChild(lbl);
    }

    function pointsOf(series) {
      return series.map(function (p, i) {
        return [L + stepX * i, T + innerH - innerH * (p.minutes / top)];
      });
    }

    function drawLine(series, color) {
      var pts = pointsOf(series);
      var d = pts.map(function (p, i) {
        return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1);
      }).join(' ');

      var area = d + ' L' + pts[pts.length - 1][0].toFixed(1) + ' ' + (T + innerH) +
        ' L' + pts[0][0].toFixed(1) + ' ' + (T + innerH) + ' Z';
      svg.appendChild(svgEl('path', { d: area, fill: color, opacity: .1 }));
      svg.appendChild(svgEl('path', {
        d: d, fill: 'none', stroke: color, 'stroke-width': 2.2,
        'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }));
      pts.forEach(function (p, i) {
        var c = svgEl('circle', { cx: p[0].toFixed(1), cy: p[1].toFixed(1), r: 3.2, fill: color });
        var tt = svgEl('title');
        tt.textContent = series[i].weekStart + ' 那週：' + series[i].minutes + ' 分鐘';
        c.appendChild(tt);
        svg.appendChild(c);
      });
    }

    drawLine(fit, FIT);
    drawLine(gtr, GTR);

    /* X 軸：每隔幾週標一次日期 */
    var every = weeks > 8 ? 3 : 2;
    fit.forEach(function (p, i) {
      if (i % every !== 0 && i !== weeks - 1) return;
      var tx = svgEl('text', {
        x: L + stepX * i, y: H - 12, 'text-anchor': 'middle',
        'font-size': 10.5, fill: '#8C8072', 'font-family': 'sans-serif'
      });
      tx.textContent = p.weekStart.slice(5).replace('-', '/');
      svg.appendChild(tx);
    });

    container.appendChild(svg);

    var legend = document.createElement('div');
    legend.className = 'legend';
    legend.innerHTML =
      '<span class="legend-item"><i class="swatch sw-fit"></i>健身</span>' +
      '<span class="legend-item"><i class="swatch sw-gtr"></i>吉他</span>' +
      '<span class="legend-item muted">滑過圓點可以看該週的數字</span>';
    container.appendChild(legend);
  }

  return {
    renderHeatmap: renderHeatmap,
    renderWeekBars: renderWeekBars,
    renderTrend: renderTrend
  };
})();
