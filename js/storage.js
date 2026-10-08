/* ============================================================
   storage.js · 資料層
   所有資料存在 localStorage，鍵名 dualtrack.v1
   另含統計計算（連續天數、週進度、徽章）
   ============================================================ */
var Store = (function () {
  'use strict';

  var KEY = 'dualtrack.v1';

  var FITNESS_PARTS = ['胸', '背', '腿', '肩', '手臂', '核心', '有氧', '全身'];
  var GUITAR_FOCUS = ['暖身音階', '和弦轉換', '節奏刷扣', '指彈', '樂理', '練歌', '即興', '聽歌抓歌'];

  function defaults() {
    return {
      version: 1,
      settings: {
        goals: {
          fitness: { sessions: 3, minutes: 45 },
          guitar:  { sessions: 5, minutes: 30 }
        },
        accidental: 'sharp',
        weight: 0,            // 體重 kg，0 = 沒填
        proteinPerKg: 1.6     // 每公斤體重的蛋白質目標
      },
      logs: {},     // "YYYY-MM-DD" -> { fitness:{...}, guitar:{...} }
      moods: {},    // "YYYY-MM-DD" -> { energy, flags:[] }   今天狀態，給 Coach 用
      meals: {},    // "YYYY-MM-DD" -> { breakfast, lunch, snack, dinner }  三餐文字紀錄
      songs: [],    // { id, title, artist, key, level, status }
      badges: {}    // badgeId -> 取得日期
    };
  }

  var data = defaults();
  var available = true;

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) data = migrate(JSON.parse(raw));
    } catch (e) {
      available = false;
      console.warn('讀不到 localStorage，這次的紀錄不會被保存：', e);
    }
    return data;
  }

  function migrate(obj) {
    var base = defaults();
    if (!obj || typeof obj !== 'object') return base;
    base.settings.goals.fitness = Object.assign(base.settings.goals.fitness,
      (obj.settings && obj.settings.goals && obj.settings.goals.fitness) || {});
    base.settings.goals.guitar = Object.assign(base.settings.goals.guitar,
      (obj.settings && obj.settings.goals && obj.settings.goals.guitar) || {});
    if (obj.settings && obj.settings.accidental) base.settings.accidental = obj.settings.accidental;
    if (obj.settings && obj.settings.weight > 0) base.settings.weight = +obj.settings.weight;
    if (obj.settings && obj.settings.proteinPerKg > 0) base.settings.proteinPerKg = +obj.settings.proteinPerKg;
    if (obj.logs && typeof obj.logs === 'object') base.logs = obj.logs;
    if (obj.moods && typeof obj.moods === 'object') base.moods = obj.moods;
    if (obj.meals && typeof obj.meals === 'object') base.meals = obj.meals;
    if (Array.isArray(obj.songs)) base.songs = obj.songs;
    if (obj.badges && typeof obj.badges === 'object') base.badges = obj.badges;
    return base;
  }

  var saveHooks = [];
  function onSave(fn) { saveHooks.push(fn); }

  function save() {
    if (!available) return false;
    try {
      localStorage.setItem(KEY, JSON.stringify(data));
      saveHooks.forEach(function (fn) { try { fn(); } catch (e) { /* 備份失敗不能擋住存檔 */ } });
      return true;
    } catch (e) {
      console.warn('存檔失敗：', e);
      return false;
    }
  }

  function get() { return data; }
  function isAvailable() { return available; }

  /* ---------- 日期工具 ---------- */

  function ymd(d) {
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }
  function parseYmd(s) {
    var p = String(s).split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }
  function addDays(d, n) {
    var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    x.setDate(x.getDate() + n);
    return x;
  }
  function today() { return ymd(new Date()); }

  /* 以星期一為一週的開始 */
  function weekStart(d) {
    var day = d.getDay();             // 0=日
    return addDays(d, day === 0 ? -6 : 1 - day);
  }

  /* ---------- 讀寫一天 ---------- */

  function emptyDay() {
    return {
      fitness: { done: false, minutes: 0, parts: [], intensity: 0, note: '' },
      guitar:  { done: false, minutes: 0, focus: [], songs: [], note: '' }
    };
  }

  function getDay(dateStr) {
    var d = data.logs[dateStr];
    var base = emptyDay();
    if (!d) return base;
    return {
      fitness: Object.assign(base.fitness, d.fitness || {}),
      guitar:  Object.assign(base.guitar, d.guitar || {})
    };
  }

  function setDay(dateStr, entry) {
    if (!entry.fitness.done && !entry.guitar.done) {
      delete data.logs[dateStr];
    } else {
      var clean = { fitness: null, guitar: null };
      clean.fitness = entry.fitness.done ? {
        done: true,
        minutes: Math.max(0, +entry.fitness.minutes || 0),
        parts: entry.fitness.parts.slice(),
        intensity: +entry.fitness.intensity || 0,
        note: String(entry.fitness.note || '').slice(0, 500)
      } : { done: false, minutes: 0, parts: [], intensity: 0, note: '' };
      clean.guitar = entry.guitar.done ? {
        done: true,
        minutes: Math.max(0, +entry.guitar.minutes || 0),
        focus: entry.guitar.focus.slice(),
        songs: entry.guitar.songs.slice(),
        note: String(entry.guitar.note || '').slice(0, 500)
      } : { done: false, minutes: 0, focus: [], songs: [], note: '' };
      data.logs[dateStr] = clean;
    }
    save();
  }

  function clearDay(dateStr) {
    delete data.logs[dateStr];
    save();
  }

  function isDone(dateStr, track) {
    var d = data.logs[dateStr];
    return !!(d && d[track] && d[track].done);
  }
  function minutesOf(dateStr, track) {
    var d = data.logs[dateStr];
    return d && d[track] && d[track].done ? (+d[track].minutes || 0) : 0;
  }

  /* ---------- 今天的狀態 ---------- */

  function getMood(dateStr) {
    var m = data.moods[dateStr];
    return m ? { energy: m.energy, flags: (m.flags || []).slice() } : null;
  }

  function setMood(dateStr, energy, flags) {
    if (!energy) delete data.moods[dateStr];
    else data.moods[dateStr] = { energy: energy, flags: (flags || []).slice() };
    save();
  }

  /* ---------- 三餐 ---------- */

  function getMeals(dateStr) {
    var m = data.meals[dateStr] || {};
    return {
      breakfast: m.breakfast || '', lunch: m.lunch || '',
      snack: m.snack || '', dinner: m.dinner || ''
    };
  }

  function setMeal(dateStr, slot, text) {
    var day = data.meals[dateStr] || {};
    var v = String(text || '').slice(0, 300).trim();
    if (v) day[slot] = v; else delete day[slot];
    if (Object.keys(day).length) data.meals[dateStr] = day;
    else delete data.meals[dateStr];
    save();
  }

  /* ---------- 統計 ---------- */

  /* 連續天數：從今天往回數；今天還沒打卡時，從昨天起算（還有機會補上） */
  function currentStreak(track) {
    var cursor = new Date();
    if (!isDone(ymd(cursor), track)) {
      cursor = addDays(cursor, -1);
      if (!isDone(ymd(cursor), track)) return 0;
    }
    var n = 0;
    while (isDone(ymd(cursor), track)) {
      n++;
      cursor = addDays(cursor, -1);
    }
    return n;
  }

  function bestStreak(track) {
    var days = Object.keys(data.logs).filter(function (k) { return isDone(k, track); }).sort();
    var best = 0, run = 0, prev = null;
    days.forEach(function (k) {
      if (prev && ymd(addDays(parseYmd(prev), 1)) === k) run++;
      else run = 1;
      if (run > best) best = run;
      prev = k;
    });
    return best;
  }

  function totals(track) {
    var count = 0, minutes = 0;
    Object.keys(data.logs).forEach(function (k) {
      if (!isDone(k, track)) return;
      count++;
      minutes += minutesOf(k, track);
    });
    return { count: count, minutes: minutes, hours: Math.round(minutes / 6) / 10 };
  }

  function weekStats(track, refDate) {
    var start = weekStart(refDate || new Date());
    var days = [], sessions = 0, minutes = 0;
    for (var i = 0; i < 7; i++) {
      var key = ymd(addDays(start, i));
      var done = isDone(key, track);
      if (done) { sessions++; minutes += minutesOf(key, track); }
      days.push({ date: key, done: done, minutes: minutesOf(key, track) });
    }
    var goal = data.settings.goals[track];
    return {
      start: ymd(start), end: ymd(addDays(start, 6)),
      days: days, sessions: sessions, minutes: minutes,
      goalSessions: goal.sessions, goalMinutes: goal.sessions * goal.minutes,
      pct: goal.sessions > 0 ? Math.min(100, Math.round(sessions / goal.sessions * 100)) : 0
    };
  }

  /* 近 n 週的每週分鐘數，舊到新 */
  function weeklySeries(track, weeks) {
    var start = weekStart(new Date());
    var out = [];
    for (var w = weeks - 1; w >= 0; w--) {
      var ws = addDays(start, -7 * w), sum = 0;
      for (var i = 0; i < 7; i++) sum += minutesOf(ymd(addDays(ws, i)), track);
      out.push({ weekStart: ymd(ws), minutes: sum });
    }
    return out;
  }

  function monthMax(year, month) {
    var max = { fitness: 1, guitar: 1 };
    var days = new Date(year, month + 1, 0).getDate();
    for (var d = 1; d <= days; d++) {
      var key = ymd(new Date(year, month, d));
      max.fitness = Math.max(max.fitness, minutesOf(key, 'fitness'));
      max.guitar = Math.max(max.guitar, minutesOf(key, 'guitar'));
    }
    return max;
  }

  /* ---------- 曲目 ---------- */

  function addSong(title, artist, key) {
    var song = {
      id: 's' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: String(title).trim().slice(0, 80),
      artist: String(artist || '').trim().slice(0, 60),
      key: String(key || '').trim().slice(0, 8),
      level: 0,
      status: 'learning'
    };
    data.songs.push(song);
    save();
    return song;
  }

  function updateSong(id, patch) {
    var s = data.songs.find(function (x) { return x.id === id; });
    if (!s) return null;
    Object.assign(s, patch);
    if (s.level >= 5) s.status = 'done';
    save();
    return s;
  }

  function removeSong(id) {
    data.songs = data.songs.filter(function (x) { return x.id !== id; });
    save();
  }

  /* ---------- 徽章 ---------- */

  var BADGES = [
    { id: 'first',      icon: '🌱', name: '踏出第一步', desc: '完成第一次打卡',
      test: function (s) { return s.fit.count + s.gtr.count >= 1; } },
    { id: 'fit7',       icon: '🔥', name: '健身 7 連', desc: '健身連續 7 天',
      test: function (s) { return s.fitBest >= 7; } },
    { id: 'gtr7',       icon: '🎵', name: '吉他 7 連', desc: '吉他連續 7 天',
      test: function (s) { return s.gtrBest >= 7; } },
    { id: 'fit30',      icon: '🏆', name: '健身 30 連', desc: '健身連續 30 天',
      test: function (s) { return s.fitBest >= 30; } },
    { id: 'gtr30',      icon: '🎸', name: '吉他 30 連', desc: '吉他連續 30 天',
      test: function (s) { return s.gtrBest >= 30; } },
    { id: 'both10',     icon: '⚡', name: '雙修十日', desc: '有 10 天兩軌都完成',
      test: function (s) { return s.bothDays >= 10; } },
    { id: 'fit50h',     icon: '💪', name: '鐵人 50 小時', desc: '健身累積 50 小時',
      test: function (s) { return s.fit.minutes >= 3000; } },
    { id: 'gtr100h',    icon: '🎼', name: '琴齡 100 小時', desc: '吉他累積 100 小時',
      test: function (s) { return s.gtr.minutes >= 6000; } },
    { id: 'songs5',     icon: '🎤', name: '會五首歌', desc: '完成 5 首曲目',
      test: function (s) { return s.songsDone >= 5; } },
    { id: 'month20',    icon: '📅', name: '月勤二十', desc: '單月打卡滿 20 天',
      test: function (s) { return s.bestMonth >= 20; } },
    { id: 'perfectWeek', icon: '⭐', name: '完美一週', desc: '一週內兩軌都達成目標',
      test: function (s) { return s.perfectWeek; } },
    { id: 'total100',   icon: '👑', name: '百日練習生', desc: '累積打卡滿 100 天',
      test: function (s) { return s.activeDays >= 100; } }
  ];

  function badgeStats() {
    var fit = totals('fitness'), gtr = totals('guitar');
    var bothDays = 0, activeDays = 0, byMonth = {};
    Object.keys(data.logs).forEach(function (k) {
      var f = isDone(k, 'fitness'), g = isDone(k, 'guitar');
      if (f && g) bothDays++;
      if (f || g) {
        activeDays++;
        var m = k.slice(0, 7);
        byMonth[m] = (byMonth[m] || 0) + 1;
      }
    });
    var bestMonth = Object.keys(byMonth).reduce(function (a, m) {
      return Math.max(a, byMonth[m]);
    }, 0);

    /* 完美一週：掃過有紀錄的每一週 */
    var perfectWeek = false;
    var seenWeeks = {};
    Object.keys(data.logs).forEach(function (k) {
      var ws = ymd(weekStart(parseYmd(k)));
      if (seenWeeks[ws]) return;
      seenWeeks[ws] = true;
      var f = weekStats('fitness', parseYmd(ws));
      var g = weekStats('guitar', parseYmd(ws));
      if (f.goalSessions > 0 && g.goalSessions > 0 &&
          f.sessions >= f.goalSessions && g.sessions >= g.goalSessions) perfectWeek = true;
    });

    return {
      fit: fit, gtr: gtr,
      fitBest: bestStreak('fitness'), gtrBest: bestStreak('guitar'),
      bothDays: bothDays, activeDays: activeDays, bestMonth: bestMonth,
      perfectWeek: perfectWeek,
      songsDone: data.songs.filter(function (s) { return s.status === 'done'; }).length
    };
  }

  /* 回傳 { list, newlyEarned } */
  function checkBadges() {
    var s = badgeStats();
    var newly = [];
    var list = BADGES.map(function (b) {
      var earned = !!data.badges[b.id];
      if (!earned && b.test(s)) {
        data.badges[b.id] = today();
        earned = true;
        newly.push(b);
      }
      return { id: b.id, icon: b.icon, name: b.name, desc: b.desc, earned: earned, at: data.badges[b.id] || null };
    });
    if (newly.length) save();
    return { list: list, newlyEarned: newly };
  }

  /* ---------- 匯出 / 匯入 ---------- */

  function exportJson() {
    return JSON.stringify({ app: 'dualtrack', exportedAt: new Date().toISOString(), data: data }, null, 2);
  }

  function importJson(text) {
    var parsed = JSON.parse(text);
    var payload = parsed && parsed.data ? parsed.data : parsed;
    if (!payload || typeof payload !== 'object' || !payload.logs) {
      throw new Error('這個檔案看起來不是本程式匯出的備份');
    }
    data = migrate(payload);
    save();
    return data;
  }

  function reset() {
    data = defaults();
    try { localStorage.removeItem(KEY); } catch (e) { /* 忽略 */ }
  }

  load();

  return {
    FITNESS_PARTS: FITNESS_PARTS,
    GUITAR_FOCUS: GUITAR_FOCUS,
    get: get, save: save, onSave: onSave, isAvailable: isAvailable,
    ymd: ymd, parseYmd: parseYmd, addDays: addDays, today: today, weekStart: weekStart,
    getDay: getDay, setDay: setDay, clearDay: clearDay, isDone: isDone, minutesOf: minutesOf,
    getMood: getMood, setMood: setMood,
    getMeals: getMeals, setMeal: setMeal,
    currentStreak: currentStreak, bestStreak: bestStreak, totals: totals,
    weekStats: weekStats, weeklySeries: weeklySeries, monthMax: monthMax,
    addSong: addSong, updateSong: updateSong, removeSong: removeSong,
    checkBadges: checkBadges, badgeCount: BADGES.length,
    exportJson: exportJson, importJson: importJson, reset: reset
  };
})();
