/* ============================================================
   app.js · 介面控制
   綁定所有互動，串起 Store / Charts / Chords
   ============================================================ */
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = {
    view: 'dashboard',
    logDate: Store.today(),
    month: new Date(),
    songFilter: 'all',
    mealDate: Store.today(),
    slot: null,
    slotManual: false,
    semitones: 0,
    sheetSource: '',
    prefill: null
  };

  /* ---------- 小工具 ---------- */

  var toastTimer = null;
  function toast(msg, gold) {
    var t = $('toast');
    t.textContent = msg;
    t.className = 'toast show' + (gold ? ' gold' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = 'toast'; }, gold ? 3200 : 2000);
  }

  function useFlat() { return Store.get().settings.accidental === 'flat'; }

  var WEEKDAY = ['日', '一', '二', '三', '四', '五', '六'];
  function prettyDate(key) {
    var d = Store.parseYmd(key);
    return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日（週' + WEEKDAY[d.getDay()] + '）';
  }

  /* ---------- 分頁切換 ---------- */

  function showView(name) {
    state.view = name;
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.classList.toggle('is-active', v.id === 'view-' + name);
    });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('is-active', b.dataset.view === name);
    });
    if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (name === 'dashboard') renderDashboard();
    if (name === 'log') renderLogForm();
    if (name === 'songs') renderSongs();
    if (name === 'food') renderFood();
  }

  /* 每次開啟換一句。只在載入時抽一次，不然在頁面上操作時會一直跳。 */
  function renderSlogan() { $('sloganText').textContent = Coach.pickSlogan(); }
  $('sloganReroll').addEventListener('click', renderSlogan);

  $('tabs').addEventListener('click', function (e) {
    var b = e.target.closest('.tab');
    if (b) showView(b.dataset.view);
  });

  /* ============================================================
     總覽
     ============================================================ */

  function renderDashboard() {
    var todayKey = Store.today();
    $('todayLabel').textContent = prettyDate(todayKey);

    var day = Store.getDay(todayKey);
    var bits = [];
    if (day.fitness.done) bits.push('健身 ' + day.fitness.minutes + ' 分');
    if (day.guitar.done) bits.push('吉他 ' + day.guitar.minutes + ' 分');
    $('todaySummary').textContent = bits.length ? '今天已經完成：' + bits.join('、') : '今天還沒有紀錄，動一下吧。';

    var qf = document.querySelector('[data-quick="fitness"]');
    var qg = document.querySelector('[data-quick="guitar"]');
    qf.classList.toggle('is-done', day.fitness.done);
    qg.classList.toggle('is-done', day.guitar.done);
    $('quickStateFitness').textContent = day.fitness.done ? '已完成 ✓' : '未完成';
    $('quickStateGuitar').textContent = day.guitar.done ? '已完成 ✓' : '未完成';

    var ft = Store.totals('fitness'), gt = Store.totals('guitar');
    renderStreak('fit', 'fitness', ft);
    renderStreak('gtr', 'guitar', gt);

    /* 完全沒有紀錄時，不要讓人看一整面的 0 */
    var isEmpty = Object.keys(Store.get().logs).length === 0;
    $('emptyState').hidden = !isEmpty;
    ['statsGrid', 'weekCard', 'heatCard', 'trendCard'].forEach(function (id) {
      $(id).hidden = isEmpty;
    });
    if (isEmpty) {
      $('badgeCount').textContent = 0;
      $('badgeTotal').textContent = Store.badgeCount;
      renderBadges();
      renderCoach();
      return;
    }

    var w = Store.weekStats('fitness');
    $('weekRange').textContent = w.start.slice(5).replace('-', '/') + ' – ' + w.end.slice(5).replace('-', '/');
    Charts.renderWeekBars($('weekBars'));

    renderCoach();
    renderMonth();
    Charts.renderTrend($('trendChart'), 12);
    renderBadges();
  }

  /* prefix: 'fit' | 'gtr'，track: 'fitness' | 'guitar' */
  function renderStreak(prefix, track, totals) {
    var cur = Store.currentStreak(track);
    var best = Store.bestStreak(track);
    $(prefix + 'Streak').textContent = cur;
    $(prefix + 'Best').textContent = best;
    $(prefix + 'Total').textContent = totals.count;
    $(prefix + 'Hours').textContent = totals.hours;

    var pct = best > 0 ? Math.min(100, Math.round(cur / best * 100)) : (cur > 0 ? 100 : 0);
    $(prefix + 'Bar').style.width = pct + '%';

    var note = $(prefix + 'Note2');
    note.classList.remove('record');
    if (cur === 0) {
      note.textContent = best > 0 ? '斷掉了，今天做一次就重新開始。' : '今天做一次就開始了。';
    } else if (cur >= best) {
      note.textContent = '🔥 這就是你的最長紀錄，別停。';
      note.classList.add('record');
    } else {
      note.textContent = '再 ' + (best - cur + 1) + ' 天就破紀錄。';
    }
  }

  function renderMonth() {
    var y = state.month.getFullYear(), m = state.month.getMonth();
    $('monthLabel').textContent = y + ' 年 ' + (m + 1) + ' 月';
    Charts.renderHeatmap($('heatmap'), y, m, function (dateKey) {
      state.logDate = dateKey;
      showView('log');
    });
  }

  $('monthPrev').addEventListener('click', function () {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() - 1, 1);
    renderMonth();
  });
  $('monthNext').addEventListener('click', function () {
    state.month = new Date(state.month.getFullYear(), state.month.getMonth() + 1, 1);
    renderMonth();
  });

  function renderBadges() {
    var result = Store.checkBadges();
    var box = $('badges');
    box.innerHTML = '';
    var earned = 0;
    result.list.forEach(function (b) {
      if (b.earned) earned++;
      var d = document.createElement('div');
      d.className = 'badge' + (b.earned ? ' earned' : '');
      d.title = b.earned ? '取得於 ' + b.at : '尚未取得';
      d.innerHTML = '<span class="badge-ico">' + b.icon + '</span>' +
        '<span class="badge-name">' + b.name + '</span>' +
        '<span class="badge-desc">' + b.desc + '</span>';
      box.appendChild(d);
    });
    $('badgeCount').textContent = earned;
    $('badgeTotal').textContent = Store.badgeCount;
    if (result.newlyEarned.length) {
      toast('🎉 解鎖徽章：' + result.newlyEarned.map(function (b) { return b.name; }).join('、'), true);
    }
  }

  $('emptyState').addEventListener('click', function (e) {
    var b = e.target.closest('[data-go]');
    if (!b) return;
    if (b.dataset.go === 'log') { state.logDate = Store.today(); showView('log'); }
    else if (b.dataset.go === 'settings') showView('settings');
    else if (b.dataset.go === 'coach') {
      $('coachCard').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  document.querySelector('.quick-actions').addEventListener('click', function (e) {
    var b = e.target.closest('[data-quick]');
    if (!b) return;
    state.logDate = Store.today();
    state.focusTrack = b.dataset.quick;
    showView('log');
  });

  /* ============================================================
     今天狀態教練
     ============================================================ */

  function renderCoach() {
    var today = Store.today();
    var mood = Store.getMood(today);

    var row = $('energyRow');
    if (!row.children.length) {
      Coach.ENERGY.forEach(function (e) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'energy-btn';
        b.dataset.energy = e.id;
        b.setAttribute('role', 'radio');
        b.innerHTML = '<span class="energy-ico" aria-hidden="true">' + e.icon + '</span>' +
          '<span class="energy-lbl"></span>';
        b.querySelector('.energy-lbl').textContent = e.label;
        b.addEventListener('click', function () { pickEnergy(e.id); });
        row.appendChild(b);
      });
    }
    Array.prototype.forEach.call(row.children, function (b) {
      var on = !!mood && b.dataset.energy === mood.energy;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });

    var flagRow = $('flagRow');
    if (!flagRow.children.length) {
      Coach.FLAGS.forEach(function (f) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'chip';
        b.dataset.flag = f.id;
        b.textContent = f.label;
        b.addEventListener('click', function () {
          b.classList.toggle('on');
          b.setAttribute('aria-pressed', b.classList.contains('on'));
          saveMood();
        });
        flagRow.appendChild(b);
      });
    }
    Array.prototype.forEach.call(flagRow.children, function (b) {
      var on = !!mood && mood.flags.indexOf(b.dataset.flag) >= 0;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });

    $('flagField').hidden = !mood;
    renderSuggestion(mood);
  }

  function currentFlags() {
    return Array.prototype.map.call($('flagRow').querySelectorAll('.chip.on'), function (b) {
      return b.dataset.flag;
    });
  }

  function pickEnergy(id) {
    var mood = Store.getMood(Store.today());
    if (mood && mood.energy === id) {       // 再點一次 = 取消
      Store.setMood(Store.today(), null);
    } else {
      Store.setMood(Store.today(), id, currentFlags());
    }
    renderCoach();
  }

  function saveMood() {
    var mood = Store.getMood(Store.today());
    if (!mood) return;
    Store.setMood(Store.today(), mood.energy, currentFlags());
    renderCoach();
  }

  function renderSuggestion(mood) {
    var box = $('coachResult');
    box.innerHTML = '';
    if (!mood) {
      var hint = document.createElement('p');
      hint.className = 'muted';
      hint.style.marginTop = '12px';
      hint.textContent = '選一個狀態，我會告訴你今天該做什麼、做多少。很累的日子也有對應的做法。';
      box.appendChild(hint);
      return;
    }

    var s = Coach.suggest(mood.energy, mood.flags, {
      fitnessStreak: Store.currentStreak('fitness'),
      guitarStreak: Store.currentStreak('guitar')
    });

    var head = document.createElement('p');
    head.className = 'rx-head';
    head.innerHTML = '<b>' + Coach.energyLabel(mood.energy) + '</b> — ';
    head.appendChild(document.createTextNode(s.headline));
    box.appendChild(head);

    var grid = document.createElement('div');
    grid.className = 'rx';
    grid.appendChild(rxBlock('fitness', '🏋️ 健身', s.fitness, Store.isDone(Store.today(), 'fitness')));
    grid.appendChild(rxBlock('guitar', '🎸 吉他', s.guitar, Store.isDone(Store.today(), 'guitar')));
    box.appendChild(grid);

    s.notes.forEach(function (n) {
      var p = document.createElement('p');
      p.className = 'rx-note';
      p.textContent = n;
      box.appendChild(p);
    });
  }

  function rxBlock(track, label, rx, alreadyDone) {
    var el = document.createElement('div');
    el.className = 'rx-block track-' + (track === 'fitness' ? 'fit' : 'gtr');

    var top = document.createElement('div');
    top.className = 'rx-top';
    var h = document.createElement('p');
    h.className = 'rx-title';
    h.textContent = label + '：' + rx.title;
    var min = document.createElement('span');
    min.className = 'rx-min';
    min.textContent = rx.minutes > 0 ? rx.minutes + ' 分鐘' : '休息';
    top.appendChild(h);
    top.appendChild(min);
    el.appendChild(top);

    var d = document.createElement('p');
    d.className = 'rx-detail';
    d.textContent = rx.detail;
    el.appendChild(d);

    var tags = (track === 'fitness' ? rx.parts : rx.focus) || [];
    if (tags.length) {
      var tagBox = document.createElement('div');
      tagBox.className = 'rx-tags';
      tags.forEach(function (t) {
        var sp = document.createElement('span');
        sp.className = 'rx-tag';
        sp.textContent = t;
        tagBox.appendChild(sp);
      });
      el.appendChild(tagBox);
    }

    if (rx.streakNote && !alreadyDone) {
      var sn = document.createElement('p');
      sn.className = 'rx-streak';
      sn.textContent = '🔥 ' + rx.streakNote;
      el.appendChild(sn);
    }

    var actions = document.createElement('div');
    actions.className = 'rx-actions';
    if (rx.minutes <= 0) {
      var rest = document.createElement('p');
      rest.className = 'rx-rest';
      rest.textContent = '今天不打卡也沒關係，休息不算失敗。';
      el.appendChild(rest);
    } else if (alreadyDone) {
      var done = document.createElement('span');
      done.className = 'muted';
      done.textContent = '今天這一軌已經完成了 ✓';
      actions.appendChild(done);
      el.appendChild(actions);
    } else {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-primary';
      btn.textContent = '就照這樣打卡';
      btn.addEventListener('click', function () {
        state.prefill = { track: track, minutes: rx.minutes, tags: tags, intensity: rx.intensity || 0 };
        state.logDate = Store.today();
        showView('log');
      });
      actions.appendChild(btn);
      el.appendChild(actions);
    }
    return el;
  }

  /* ============================================================
     打卡
     ============================================================ */

  function buildChips(container, options, selected) {
    container.innerHTML = '';
    options.forEach(function (opt) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (selected.indexOf(opt) >= 0 ? ' on' : '');
      b.textContent = opt;
      b.dataset.value = opt;
      b.setAttribute('aria-pressed', selected.indexOf(opt) >= 0);
      b.addEventListener('click', function () {
        var on = b.classList.toggle('on');
        b.setAttribute('aria-pressed', on);
      });
      container.appendChild(b);
    });
  }

  function chipValues(container) {
    return Array.prototype.map.call(container.querySelectorAll('.chip.on'), function (b) {
      return b.dataset.value;
    });
  }

  function buildStars(container, value) {
    container.innerHTML = '';
    for (var i = 1; i <= 5; i++) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'star' + (i <= value ? ' on' : '');
      b.textContent = '🔥';
      b.dataset.value = i;
      b.setAttribute('aria-label', '強度 ' + i);
      b.addEventListener('click', function (e) {
        var v = +e.currentTarget.dataset.value;
        var cur = +container.dataset.value || 0;
        setStars(container, v === cur ? 0 : v);
      });
      container.appendChild(b);
    }
    container.dataset.value = value;
  }

  function setStars(container, value) {
    container.dataset.value = value;
    Array.prototype.forEach.call(container.querySelectorAll('.star'), function (s) {
      s.classList.toggle('on', +s.dataset.value <= value);
    });
  }

  function renderLogForm() {
    var key = state.logDate;
    $('logDate').value = key;
    var day = Store.getDay(key);

    $('fitDone').checked = day.fitness.done;
    buildChips($('fitParts'), Store.FITNESS_PARTS, day.fitness.parts || []);
    $('fitMinutes').value = day.fitness.minutes || Store.get().settings.goals.fitness.minutes;
    $('fitMinutesOut').textContent = $('fitMinutes').value;
    buildStars($('fitIntensity'), day.fitness.intensity || 0);
    $('fitNote').value = day.fitness.note || '';

    $('gtrDone').checked = day.guitar.done;
    buildChips($('gtrFocus'), Store.GUITAR_FOCUS, day.guitar.focus || []);
    $('gtrMinutes').value = day.guitar.minutes || Store.get().settings.goals.guitar.minutes;
    $('gtrMinutesOut').textContent = $('gtrMinutes').value;
    var songTitles = Store.get().songs.map(function (s) { return s.title; });
    buildChips($('gtrSongs'), songTitles, day.guitar.songs || []);
    $('gtrNote').value = day.guitar.note || '';

    if (state.prefill) {
      applyPrefill(state.prefill);
      state.prefill = null;
    }

    if (state.focusTrack) {
      var cb = state.focusTrack === 'fitness' ? $('fitDone') : $('gtrDone');
      if (!cb.checked) cb.checked = true;
      cb.closest('fieldset').scrollIntoView({ behavior: 'smooth', block: 'center' });
      state.focusTrack = null;
    }
  }

  /* 把 chips 設成指定的那幾個（其餘取消） */
  function setChips(container, values) {
    Array.prototype.forEach.call(container.querySelectorAll('.chip'), function (b) {
      var on = values.indexOf(b.dataset.value) >= 0;
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on);
    });
  }

  /* 從「就照這樣打卡」帶過來的建議，直接填好表單 */
  function applyPrefill(p) {
    if (p.track === 'fitness') {
      $('fitDone').checked = true;
      $('fitMinutes').value = p.minutes;
      $('fitMinutesOut').textContent = p.minutes;
      setChips($('fitParts'), p.tags);
      if (p.intensity) setStars($('fitIntensity'), p.intensity);
      $('fitDone').closest('fieldset').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      $('gtrDone').checked = true;
      $('gtrMinutes').value = p.minutes;
      $('gtrMinutesOut').textContent = p.minutes;
      setChips($('gtrFocus'), p.tags);
      $('gtrDone').closest('fieldset').scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    toast('已經照建議填好了，確認後按「儲存這天」');
  }

  $('fitMinutes').addEventListener('input', function (e) { $('fitMinutesOut').textContent = e.target.value; });
  $('gtrMinutes').addEventListener('input', function (e) { $('gtrMinutesOut').textContent = e.target.value; });

  $('logDate').addEventListener('change', function (e) {
    if (e.target.value) { state.logDate = e.target.value; renderLogForm(); }
  });
  $('dayPrev').addEventListener('click', function () {
    state.logDate = Store.ymd(Store.addDays(Store.parseYmd(state.logDate), -1));
    renderLogForm();
  });
  $('dayNext').addEventListener('click', function () {
    state.logDate = Store.ymd(Store.addDays(Store.parseYmd(state.logDate), 1));
    renderLogForm();
  });
  $('dayToday').addEventListener('click', function () {
    state.logDate = Store.today();
    renderLogForm();
  });

  $('logForm').addEventListener('submit', function (e) {
    e.preventDefault();
    Store.setDay(state.logDate, {
      fitness: {
        done: $('fitDone').checked,
        minutes: +$('fitMinutes').value,
        parts: chipValues($('fitParts')),
        intensity: +$('fitIntensity').dataset.value || 0,
        note: $('fitNote').value
      },
      guitar: {
        done: $('gtrDone').checked,
        minutes: +$('gtrMinutes').value,
        focus: chipValues($('gtrFocus')),
        songs: chipValues($('gtrSongs')),
        note: $('gtrNote').value
      }
    });
    toast(Store.isAvailable() ? '已儲存 ' + prettyDate(state.logDate) : '瀏覽器不讓我存檔，資料只在這次有效');
    showView('dashboard');
  });

  $('logClear').addEventListener('click', function () {
    if (!confirm('確定要刪掉 ' + prettyDate(state.logDate) + ' 的紀錄嗎？')) return;
    Store.clearDay(state.logDate);
    renderLogForm();
    toast('已清除這天的紀錄');
  });

  /* ============================================================
     吃什麼
     ============================================================ */

  function renderFood() {
    var key = state.mealDate;
    $('mealDate').value = key;
    var meals = Store.getMeals(key);
    var isToday = key === Store.today();

    /* 下一餐的選擇列 */
    var pick = $('slotPick');
    if (!pick.children.length) {
      Meals.SLOTS.forEach(function (sl) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'slot-btn';
        b.dataset.slot = sl.id;
        b.setAttribute('role', 'radio');
        b.innerHTML = '<span class="slot-ico" aria-hidden="true">' + sl.icon + '</span>';
        b.appendChild(document.createTextNode(sl.label));
        b.addEventListener('click', function () {
          state.slot = sl.id;
          state.slotManual = true;    // 自己選過之後就不要再自動跳
          renderFood();
        });
        pick.appendChild(b);
      });
    }
    /* 沒有自己選過的話，每次都依「已經填了哪幾餐 + 現在幾點」重新判斷 */
    if (!state.slotManual || !state.slot) state.slot = Meals.guessSlot(meals);
    Array.prototype.forEach.call(pick.children, function (b) {
      var on = b.dataset.slot === state.slot;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on);
    });

    var now = new Date();
    $('foodClock').textContent = isToday
      ? '現在 ' + String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
      : '看的是 ' + key;

    renderMealInputs(key, meals);
    renderAdvice(meals);
    renderTally(meals);
  }

  function renderMealInputs(key, meals) {
    var box = $('mealInputs');
    box.innerHTML = '';
    Meals.SLOTS.forEach(function (sl) {
      var row = document.createElement('div');
      row.className = 'meal-row';

      var lab = document.createElement('label');
      lab.className = 'meal-label';
      lab.setAttribute('for', 'meal-' + sl.id);
      lab.appendChild(document.createTextNode(sl.icon + ' ' + sl.label));
      var parsed = document.createElement('span');
      parsed.className = 'meal-parsed';
      lab.appendChild(parsed);

      var ta = document.createElement('textarea');
      ta.id = 'meal-' + sl.id;
      ta.rows = 2;
      ta.value = meals[sl.id] || '';
      ta.placeholder = {
        breakfast: '例如：兩顆蛋、一片吐司、無糖豆漿',
        lunch: '例如：雞腿便當，菜不多',
        snack: '例如：一杯拿鐵跟餅乾',
        dinner: '例如：鮭魚、糙米飯、燙青菜'
      }[sl.id];

      function refresh() {
        var r = Meals.parseText(ta.value);
        if (r.empty) parsed.textContent = '';
        else if (r.skipped) parsed.textContent = '這餐沒吃';
        else if (r.unknown) parsed.textContent = '認不出食物，換個講法試試';
        else parsed.textContent = r.items.join('、') +
          (r.pMax > 0 ? '　·　蛋白質約 ' + r.pMin + '–' + r.pMax + ' g' : '');
      }
      refresh();

      var timer = null;
      ta.addEventListener('input', function () {
        refresh();
        clearTimeout(timer);
        timer = setTimeout(function () {
          Store.setMeal(key, sl.id, ta.value);
          var fresh = Store.getMeals(key);
          if (!state.slotManual) {
            var next = Meals.guessSlot(fresh);
            if (next !== state.slot) {
              state.slot = next;
              Array.prototype.forEach.call($('slotPick').children, function (b) {
                var on = b.dataset.slot === next;
                b.classList.toggle('on', on);
                b.setAttribute('aria-checked', on);
              });
            }
          }
          renderAdvice(fresh);
          renderTally(fresh);
        }, 450);
      });

      row.appendChild(lab);
      row.appendChild(ta);
      box.appendChild(row);
    });
  }

  function renderAdvice(meals) {
    var box = $('adviceBox');
    box.innerHTML = '';
    var cfg = Store.get().settings;
    var a = Meals.advise(meals, state.slot, {
      weight: cfg.weight,
      proteinPerKg: cfg.proteinPerKg,
      trainedToday: Store.isDone(Store.today(), 'fitness'),
      hour: new Date().getHours()
    });

    var diag = document.createElement('div');
    diag.className = 'diag';
    a.summary.forEach(function (line) {
      var p = document.createElement('p');
      if (/油炸|含糖/.test(line)) p.className = 'diag-warn';
      p.textContent = line;
      diag.appendChild(p);
    });
    if (!cfg.weight) {
      var p2 = document.createElement('p');
      p2.className = 'muted';
      p2.textContent = '到「設定」填體重，就能算出今天的蛋白質目標。';
      diag.appendChild(p2);
    }
    box.appendChild(diag);

    var head = document.createElement('p');
    head.className = 'rx-head';
    head.innerHTML = '<b>' + a.slotLabel + '</b> 可以考慮：';
    box.appendChild(head);

    var ul = document.createElement('ul');
    ul.className = 'picks';
    a.picks.forEach(function (it) {
      var li = document.createElement('li');
      li.className = 'pick';
      var top = document.createElement('div');
      top.className = 'pick-top';
      var t = document.createElement('span');
      t.className = 'pick-text';
      t.textContent = it.text;
      var add = document.createElement('span');
      add.className = 'pick-add';
      add.textContent = it.add;
      top.appendChild(t);
      top.appendChild(add);
      var why = document.createElement('p');
      why.className = 'pick-why';
      why.textContent = it.why;
      li.appendChild(top);
      li.appendChild(why);
      ul.appendChild(li);
    });
    box.appendChild(ul);
  }

  function dots(n, max) {
    var out = '';
    for (var i = 0; i < max; i++) out += i < n ? '\u25CF' : '<i>\u25CF</i>';
    return out;
  }

  function renderTally(meals) {
    var box = $('dayTally');
    var t = Meals.parseDay(meals);
    var cfg = Store.get().settings;
    var target = cfg.weight > 0 ? Math.round(cfg.weight * cfg.proteinPerKg) : null;
    box.className = 'tally';
    box.innerHTML =
      '<div class="tally-item"><span class="tally-k">蛋白質（粗估）</span>' +
        '<span class="tally-v">' + t.pMin + '–' + t.pMax + '<small>g</small></span>' +
        (target ? '<span class="tally-sub">目標 ' + target + ' g' +
          (t.pMax >= target ? '　已達標 ✓' : '　還差 ' + (target - t.pMax) + ' g') + '</span>' : '') +
      '</div>' +
      '<div class="tally-item"><span class="tally-k">蔬菜</span>' +
        '<span class="tally-v dots">' + dots(Math.min(4, t.veg), 4) + '</span></div>' +
      '<div class="tally-item"><span class="tally-k">澱粉</span>' +
        '<span class="tally-v dots">' + dots(Math.min(4, t.carb), 4) + '</span></div>' +
      '<div class="tally-item"><span class="tally-k">記錄了幾餐</span>' +
        '<span class="tally-v">' + t.logged + '<small>/ 4</small></span></div>';
  }

  $('mealDate').addEventListener('change', function (e) {
    if (e.target.value) { state.mealDate = e.target.value; state.slot = null; state.slotManual = false; renderFood(); }
  });
  $('mealPrev').addEventListener('click', function () {
    state.mealDate = Store.ymd(Store.addDays(Store.parseYmd(state.mealDate), -1));
    state.slot = null; state.slotManual = false;
    renderFood();
  });
  $('mealToday').addEventListener('click', function () {
    state.mealDate = Store.today();
    state.slot = null; state.slotManual = false;
    renderFood();
  });

  /* ============================================================
     曲目
     ============================================================ */

  var LEVEL_TEXT = ['還沒開始', '看譜摸索', '卡卡能彈', '順一半', '大致能彈', '可以上台'];

  function renderSongs() {
    var box = $('songList');
    box.innerHTML = '';
    var songs = Store.get().songs.filter(function (s) {
      return state.songFilter === 'all' || s.status === state.songFilter;
    });

    if (!songs.length) {
      var p = document.createElement('p');
      p.className = 'empty-note';
      p.textContent = state.songFilter === 'all'
        ? '還沒有曲目。上面加一首你正在練的歌吧。'
        : '這個分類還沒有曲目。';
      box.appendChild(p);
      return;
    }

    songs.forEach(function (s) {
      var row = document.createElement('div');
      row.className = 'song' + (s.status === 'done' ? ' is-done' : '');

      var main = document.createElement('div');
      main.className = 'song-main';
      main.innerHTML = '<div class="song-title"></div><div class="song-meta"></div>';
      main.querySelector('.song-title').textContent = s.title;
      var meta = main.querySelector('.song-meta');
      meta.textContent = (s.artist || '未填演唱者') + ' · ' + LEVEL_TEXT[s.level || 0];
      if (s.key) {
        var k = document.createElement('span');
        k.className = 'song-key';
        k.textContent = s.key;
        meta.appendChild(k);
      }

      var stars = document.createElement('div');
      stars.className = 'rating';
      for (var i = 1; i <= 5; i++) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'star' + (i <= (s.level || 0) ? ' on' : '');
        b.textContent = '⭐';
        b.dataset.value = i;
        b.setAttribute('aria-label', s.title + ' 熟練度 ' + i);
        b.addEventListener('click', (function (song, val) {
          return function () {
            var next = song.level === val ? val - 1 : val;
            Store.updateSong(song.id, { level: next, status: next >= 5 ? 'done' : 'learning' });
            renderSongs();
            renderBadges();
          };
        })(s, i));
        stars.appendChild(b);
      }

      var actions = document.createElement('div');
      actions.className = 'song-actions';
      var toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'link-btn';
      toggle.textContent = s.status === 'done' ? '改回練習中' : '標記完成';
      toggle.addEventListener('click', function () {
        var done = s.status === 'done';
        Store.updateSong(s.id, { status: done ? 'learning' : 'done', level: done ? 4 : 5 });
        renderSongs();
        renderBadges();
      });
      var del = document.createElement('button');
      del.type = 'button';
      del.className = 'link-btn';
      del.textContent = '刪除';
      del.addEventListener('click', function () {
        if (!confirm('刪除「' + s.title + '」？')) return;
        Store.removeSong(s.id);
        renderSongs();
      });
      actions.appendChild(toggle);
      actions.appendChild(del);

      row.appendChild(main);
      row.appendChild(stars);
      row.appendChild(actions);
      box.appendChild(row);
    });
  }

  $('songForm').addEventListener('submit', function (e) {
    e.preventDefault();
    var title = $('songTitle').value.trim();
    if (!title) return;
    Store.addSong(title, $('songArtist').value, $('songKey').value);
    $('songTitle').value = $('songArtist').value = $('songKey').value = '';
    renderSongs();
    toast('已加入「' + title + '」');
  });

  $('songFilter').addEventListener('click', function (e) {
    var b = e.target.closest('.pill');
    if (!b) return;
    state.songFilter = b.dataset.filter;
    Array.prototype.forEach.call(this.querySelectorAll('.pill'), function (p) {
      p.classList.toggle('is-active', p === b);
    });
    renderSongs();
  });

  /* ============================================================
     和弦工具
     ============================================================ */

  var SAMPLE = [
    '[Verse]',
    'C          G          Am         F',
    '天空很藍   風也剛好   我們坐著   什麼都好',
    'C          G          F          G',
    '時間慢慢   走得很好   先別長大   再等一下',
    '',
    '[Chorus]',
    '| Am  | F  | C  | G  |',
    '| Am  | F  | Dm7 | G7 |'
  ].join('\n');

  function chordCard(name) {
    var info = Chords.get(name);
    var card = document.createElement('div');
    card.className = 'chord-card';

    var h = document.createElement('h4');
    h.textContent = name;
    card.appendChild(h);

    if (!info || !info.voicings.length) {
      var p = document.createElement('p');
      p.className = 'muted';
      p.textContent = info ? '這個和弦還沒收錄指法' : '看不懂這個和弦';
      card.appendChild(p);
      return card;
    }

    info.voicings.forEach(function (v, i) {
      var wrap = document.createElement('div');
      if (i > 0) wrap.className = 'chord-alt';
      wrap.appendChild(Chords.renderDiagram(v, name));
      var tab = document.createElement('div');
      tab.className = 'chord-tab';
      tab.textContent = Chords.tabString(v.frets);
      var pos = document.createElement('div');
      pos.className = 'chord-pos';
      pos.textContent = v.label;
      wrap.appendChild(tab);
      wrap.appendChild(pos);
      card.appendChild(wrap);
    });

    if (info.bass !== null) {
      var note = document.createElement('p');
      note.className = 'chord-pos';
      note.textContent = '低音彈 ' + Chords.noteName(info.bass, useFlat());
      card.appendChild(note);
    }
    return card;
  }

  function renderSheet() {
    var src = state.sheetSource;
    var semi = state.semitones;
    var flat = useFlat();
    var out = Chords.transposeSheet(src, semi, flat);

    $('semiLabel').textContent = (semi > 0 ? '+' : '') + semi;

    var origKey = Chords.guessKey(src);
    var hint = '';
    if (origKey) {
      var newKey = Chords.transposeChord(origKey, semi, flat);
      hint = '（' + origKey + ' → ' + newKey + '）';
    }
    $('keyHint').textContent = hint;

    /* 和弦上色顯示 */
    var pre = $('sheetOutput');
    pre.innerHTML = '';
    if (!src.trim()) {
      pre.textContent = '移調後的譜會出現在這裡。';
    } else {
      out.split('\n').forEach(function (line, idx) {
        if (idx) pre.appendChild(document.createTextNode('\n'));
        appendColoredLine(pre, line);
      });
    }

    renderCapo(origKey, semi, flat);
    renderUsedChords(out);
  }

  /* 把和弦塗色，其餘原文照搬（用 textNode，不會有 HTML 注入問題） */
  function appendColoredLine(pre, line) {
    var re = /\[[^\]\n]+\]|\S+/g, pos = 0, m;
    var isChordRow = Chords.extractChords(line).length > 0 && !/\[/.test(line);
    while ((m = re.exec(line)) !== null) {
      pre.appendChild(document.createTextNode(line.slice(pos, m.index)));
      var token = m[0];
      var bracket = token.charAt(0) === '[' && Chords.parse(token.slice(1, -1));
      if (bracket || (isChordRow && Chords.parse(token.replace(/^[|([]+|[|)\],.]+$/g, '')))) {
        var span = document.createElement('span');
        span.className = 'c';
        span.textContent = token;
        pre.appendChild(span);
      } else {
        pre.appendChild(document.createTextNode(token));
      }
      pos = m.index + token.length;
    }
    pre.appendChild(document.createTextNode(line.slice(pos)));
  }

  function renderCapo(origKey, semi, flat) {
    var box = $('capoBox');
    box.innerHTML = '';
    if (!origKey) return;

    var parsed = Chords.parse(origKey);
    if (!parsed) return;
    var targetRoot = Chords.mod12(parsed.root + semi);
    var lines = [];

    if (semi > 0 && semi <= 7) {
      lines.push('最快的做法：<b>夾第 ' + semi + ' 格</b>，和弦指法完全照原本的按，聽起來就是移調後的調。');
    }
    var sugg = Chords.capoSuggestions(targetRoot);
    if (sugg.length) {
      lines.push('想用開放和弦彈的話：' + sugg.map(function (s) {
        return '<b>夾 ' + s.capo + ' 格</b>當 ' + Chords.noteName(s.shapeKey, flat) + ' 調彈';
      }).join('、') + '。');
    }
    box.innerHTML = lines.map(function (l) { return '<p style="margin:4px 0">🎚️ ' + l + '</p>'; }).join('');
  }

  function renderUsedChords(sheetText) {
    var list = Chords.extractChords(sheetText);
    var box = $('usedChords');
    box.innerHTML = '';
    $('usedCount').textContent = list.length ? list.length + ' 個' : '';
    if (!list.length) {
      var p = document.createElement('p');
      p.className = 'muted chord-miss';
      p.textContent = '上面貼譜之後，這裡會自動列出指法圖。';
      box.appendChild(p);
      return;
    }
    list.forEach(function (name) { box.appendChild(chordCard(name)); });
  }

  $('sheetInput').addEventListener('input', function (e) {
    state.sheetSource = e.target.value;
    state.semitones = 0;
    renderSheet();
  });
  $('semiUp').addEventListener('click', function () {
    state.semitones = Chords.mod12(state.semitones + 1);
    renderSheet();
  });
  $('semiDown').addEventListener('click', function () {
    state.semitones = Chords.mod12(state.semitones - 1);
    renderSheet();
  });
  $('semiReset').addEventListener('click', function () {
    state.semitones = 0;
    renderSheet();
  });
  $('sheetSample').addEventListener('click', function () {
    $('sheetInput').value = SAMPLE;
    state.sheetSource = SAMPLE;
    state.semitones = 0;
    renderSheet();
  });
  $('sheetCopy').addEventListener('click', function () {
    var text = Chords.transposeSheet(state.sheetSource, state.semitones, useFlat());
    if (!text.trim()) { toast('還沒有東西可以複製'); return; }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(
        function () { toast('已複製移調後的譜'); },
        function () { toast('複製失敗，請手動選取'); }
      );
    } else {
      toast('這個瀏覽器不支援一鍵複製，請手動選取');
    }
  });

  /* ---------- 單一和弦查詢 ---------- */

  function fillLookupSelects() {
    var rootSel = $('lookupRoot');
    rootSel.innerHTML = '';
    (useFlat() ? Chords.FLAT : Chords.SHARP).forEach(function (n, i) {
      var o = document.createElement('option');
      o.value = i;
      o.textContent = n;
      rootSel.appendChild(o);
    });
    var qSel = $('lookupQuality');
    if (!qSel.options.length) {
      Chords.DIAGRAM_QUALITIES.forEach(function (q) {
        var o = document.createElement('option');
        o.value = q;
        o.textContent = Chords.QUALITY_LABEL[q];
        qSel.appendChild(o);
      });
    }
  }

  function renderLookup() {
    var root = +$('lookupRoot').value || 0;
    var q = $('lookupQuality').value;
    var name = Chords.noteName(root, useFlat()) + q;
    var box = $('lookupResult');
    box.innerHTML = '';
    box.appendChild(chordCard(name));
    renderKeyTable(root);
  }

  function renderKeyTable(highlightRoot) {
    var table = $('keyTable');
    table.innerHTML = '';
    var flat = useFlat();
    var head = document.createElement('tr');
    head.innerHTML = '<th>調</th>' + Chords.DEGREES.map(function (d) {
      return '<th>' + d + '</th>';
    }).join('');
    table.appendChild(head);

    Chords.degreeTable(flat).forEach(function (row) {
      var tr = document.createElement('tr');
      var th = document.createElement('th');
      th.textContent = row.key + ' 大調';
      tr.appendChild(th);
      row.chords.forEach(function (c) {
        var td = document.createElement('td');
        td.textContent = c.name;
        if (c.root === highlightRoot) td.className = 'hit';
        tr.appendChild(td);
      });
      table.appendChild(tr);
    });
  }

  $('lookupRoot').addEventListener('change', renderLookup);
  $('lookupQuality').addEventListener('change', renderLookup);

  /* ============================================================
     設定
     ============================================================ */

  function renderSettings() {
    var g = Store.get().settings.goals;
    $('goalFitSessions').value = g.fitness.sessions;
    $('goalFitMinutes').value = g.fitness.minutes;
    $('goalGtrSessions').value = g.guitar.sessions;
    $('goalGtrMinutes').value = g.guitar.minutes;
    $('setWeight').value = Store.get().settings.weight || '';
    $('setProteinPerKg').value = Store.get().settings.proteinPerKg;
    var acc = Store.get().settings.accidental;
    Array.prototype.forEach.call(document.querySelectorAll('[name=accidental]'), function (r) {
      r.checked = r.value === acc;
    });
    $('storageInfo').textContent = Store.isAvailable()
      ? '目前共有 ' + Object.keys(Store.get().logs).length + ' 天的紀錄、' + Store.get().songs.length + ' 首曲目。'
      : '⚠️ 這個瀏覽器不允許存檔（可能是無痕模式），資料關掉就會不見。';
  }

  $('goalSave').addEventListener('click', function () {
    var g = Store.get().settings.goals;
    g.fitness.sessions = Math.max(0, +$('goalFitSessions').value || 0);
    g.fitness.minutes = Math.max(0, +$('goalFitMinutes').value || 0);
    g.guitar.sessions = Math.max(0, +$('goalGtrSessions').value || 0);
    g.guitar.minutes = Math.max(0, +$('goalGtrMinutes').value || 0);
    Store.save();
    toast('目標已更新');
    renderDashboard();
  });

  Array.prototype.forEach.call(document.querySelectorAll('[name=accidental]'), function (r) {
    r.addEventListener('change', function () {
      Store.get().settings.accidental = r.value;
      Store.save();
      fillLookupSelects();
      renderLookup();
      renderSheet();
      toast('已切換為' + (r.value === 'flat' ? '降記號' : '升記號'));
    });
  });

  ['setWeight', 'setProteinPerKg'].forEach(function (id) {
    $(id).addEventListener('change', function () {
      var cfg = Store.get().settings;
      cfg.weight = Math.max(0, +$('setWeight').value || 0);
      cfg.proteinPerKg = Math.min(3, Math.max(0.8, +$('setProteinPerKg').value || 1.6));
      $('setProteinPerKg').value = cfg.proteinPerKg;
      Store.save();
      toast(cfg.weight ? '蛋白質目標設為 ' + Math.round(cfg.weight * cfg.proteinPerKg) + ' g / 天' : '已清除體重');
      renderSettings();
    });
  });

  /* ---------- 自動備份到資料夾 ---------- */

  var backupTimer = null;

  function scheduleBackup() {
    if (Backup.state() !== 'ready') return;
    clearTimeout(backupTimer);
    backupTimer = setTimeout(function () {
      Backup.write(Store.exportJson(), Store.today()).catch(function (e) {
        console.warn('自動備份失敗：', e);
        renderBackup();
      });
    }, 1500);
  }

  function renderBackup() {
    var st = Backup.status();
    var box = $('backupStatus');
    var acts = $('backupActions');
    box.innerHTML = '';
    acts.innerHTML = '';

    var row = document.createElement('div');
    var cls, msg;
    if (st.state === 'unsupported') { cls = 'bk-off'; msg = st.reason; }
    else if (st.state === 'off') { cls = 'bk-off'; msg = '還沒設定。選一個資料夾就會開始自動備份。'; }
    else if (st.state === 'needs-permission') {
      cls = 'bk-warn';
      msg = '已經記住資料夾「' + st.folder + '」，但瀏覽器需要你重新授權一次。';
    } else {
      cls = st.lastError ? 'bk-bad' : 'bk-ready';
      msg = st.lastError
        ? '備份失敗：' + st.lastError
        : '自動備份中 → 資料夾「' + st.folder + '」的 ' + st.file;
    }
    row.className = 'bk ' + cls;
    row.innerHTML = '<span class="bk-dot"></span>';
    row.appendChild(document.createTextNode(msg));
    if (st.lastAt) {
      var meta = document.createElement('span');
      meta.className = 'bk-meta';
      meta.textContent = '上次寫入 ' + new Date(st.lastAt).toLocaleString('zh-TW');
      row.appendChild(meta);
    }
    box.appendChild(row);

    function btn(label, cls2, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn ' + cls2;
      b.textContent = label;
      b.addEventListener('click', fn);
      acts.appendChild(b);
      return b;
    }

    if (st.state === 'unsupported') return;

    if (st.state === 'off') {
      btn('選擇備份資料夾', 'btn-primary', function () {
        Backup.chooseFolder()
          .then(function () {
            toast('已連結資料夾，正在寫入第一份備份');
            return Backup.write(Store.exportJson(), Store.today());
          })
          .then(renderBackup)
          .catch(function (e) {
            if (e && e.name === 'AbortError') return;   // 使用者自己取消
            toast('設定失敗：' + e.message);
            renderBackup();
          });
      });
      return;
    }

    if (st.state === 'needs-permission') {
      btn('重新授權', 'btn-primary', function () {
        Backup.reauthorize()
          .then(function () { return Backup.write(Store.exportJson(), Store.today()); })
          .then(function () { toast('已恢復自動備份'); renderBackup(); })
          .catch(function (e) { toast(e.message); renderBackup(); });
      });
    } else {
      btn('立即備份一次', 'btn-primary', function () {
        Backup.write(Store.exportJson(), Store.today())
          .then(function () { toast('已寫入備份'); renderBackup(); })
          .catch(function (e) { toast('備份失敗：' + e.message); renderBackup(); });
      });
    }

    btn('從資料夾還原', 'btn-ghost', function () {
      if (!confirm('這會用資料夾裡的備份「覆蓋」目前的資料。\n確定要還原嗎？')) return;
      Backup.readLatest()
        .then(function (text) {
          Store.importJson(text);
          state.slot = null; state.slotManual = false;
          renderSettings(); renderSongs(); renderFood(); renderDashboard();
          showView('dashboard');
          toast('已從備份還原');
        })
        .catch(function (e) { alert('還原失敗：' + e.message); });
    });

    btn('停用自動備份', 'btn-ghost', function () {
      Backup.disconnect().then(function () {
        toast('已停用（資料夾裡的檔案不會被刪除）');
        renderBackup();
      });
    });
  }

  $('exportBtn').addEventListener('click', function () {
    var blob = new Blob([Store.exportJson()], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '雙軌練習誌-備份-' + Store.today() + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    toast('備份已下載');
  });

  $('importFile').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        Store.importJson(String(reader.result));
        toast('匯入成功');
        state.month = new Date();
        state.slot = null; state.slotManual = false;
        renderSettings();
        renderSongs();
        renderFood();
        renderDashboard();
        showView('dashboard');
      } catch (err) {
        alert('匯入失敗：' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  $('resetBtn').addEventListener('click', function () {
    if (!confirm('這會刪掉所有打卡紀錄、曲目和徽章，而且無法復原。\n建議先按「匯出 JSON 備份」。\n\n確定要清除嗎？')) return;
    if (!confirm('真的確定？最後一次確認。')) return;
    Store.reset();
    state.slot = null; state.slotManual = false;
    renderSettings();
    renderSongs();
    renderFood();
    renderDashboard();
    showView('dashboard');
    toast('已清空，重新開始');
  });

  /* ============================================================
     啟動
     ============================================================ */

  renderSlogan();
  fillLookupSelects();
  renderLookup();
  renderSettings();
  renderSongs();
  renderFood();
  renderLogForm();
  renderSheet();
  renderDashboard();

  Backup.onChange(renderBackup);
  Backup.init().then(renderBackup);
  Backup.requestPersistent().then(function (ok) {
    if (ok === false) console.info('瀏覽器沒有把這個網站的資料標記為「持久」，空間不足時可能被清掉。記得設定自動備份。');
  });
  Store.onSave(scheduleBackup);

  var initial = location.hash.slice(1);
  showView(['dashboard', 'log', 'food', 'songs', 'chords', 'settings'].indexOf(initial) >= 0 ? initial : 'dashboard');

  if (!Store.isAvailable()) {
    toast('⚠️ 瀏覽器不允許存檔，這次的紀錄不會被保存');
  }
})();
