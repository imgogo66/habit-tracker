/* ============================================================
   meals.js · 三餐紀錄與下一餐建議
   你用中文打「早上吃了鮪魚三明治跟無糖豆漿」，它會：
     1. 用關鍵字字典比對出食物
     2. 粗估蛋白質公克數、蔬菜與澱粉份量
     3. 依「下一餐是哪一餐 / 今天有沒有訓練 / 已經吃了什麼」挑建議

   ⚠️ 這是關鍵字比對，不是營養分析，數字只能當方向參考，不是醫療或營養建議。
   ============================================================ */
var Meals = (function () {
  'use strict';

  var SLOTS = [
    { id: 'breakfast', label: '早餐', icon: '🌾', until: 10.5 },
    { id: 'lunch',     label: '午餐', icon: '🍱', until: 14 },
    { id: 'snack',     label: '點心', icon: '🍎', until: 17.5 },
    { id: 'dinner',    label: '晚餐', icon: '🍲', until: 24 }
  ];

  /* 食物字典。p = 一份大約的蛋白質公克範圍；veg/carb/fat/sugar 是 0–3 的粗略份量。
     fallback 的項目只有在沒比對到其他蛋白質來源時才算，避免「雞腿便當」重複加。 */
  var FOODS = [
    // ── 肉與海鮮 ──
    { k: ['雞胸'],                 p: [30, 40] },
    { k: ['雞腿'],                 p: [25, 32], fat: 1 },
    { k: ['雞排', '鹹酥雞', '鹽酥雞', '炸雞'], p: [22, 30], fat: 3, fried: true },
    { k: ['雞肉', '烤雞', '白斬雞'], p: [22, 30] },
    { k: ['牛排'],                 p: [30, 45], fat: 2 },
    { k: ['牛肉'],                 p: [22, 30], fat: 1 },
    { k: ['豬排', '里肌'],          p: [22, 30], fat: 1 },
    { k: ['豬肉', '肉片', '五花'],   p: [18, 25], fat: 2 },
    { k: ['滷肉', '爌肉', '焢肉'],   p: [10, 15], fat: 3 },
    { k: ['鮭魚'],                 p: [28, 36], fat: 2 },
    { k: ['鯖魚', '鱈魚', '虱目魚', '秋刀魚'], p: [25, 33], fat: 2 },
    { k: ['鮪魚'],                 p: [20, 28] },
    { k: ['魚'],                   p: [22, 30] },
    { k: ['蝦', '花枝', '透抽', '蛤蜊'], p: [16, 24] },
    { k: ['火腿', '培根', '香腸', '熱狗', '貢丸'], p: [8, 12], fat: 3, processed: true },
    // ── 蛋奶豆 ──
    { k: ['蛋'],                   p: [6, 8], each: true },
    { k: ['蛋餅'],                 p: [10, 14], carb: 2 },
    { k: ['無糖豆漿', '豆漿'],       p: [7, 10] },
    { k: ['豆腐', '豆花'],          p: [10, 14] },
    { k: ['豆乾', '豆干'],          p: [12, 16] },
    { k: ['毛豆'],                 p: [10, 14], veg: 1 },
    { k: ['優格', '優酪乳'],        p: [10, 18] },
    { k: ['牛奶', '鮮奶', '拿鐵'],   p: [8, 10] },
    { k: ['起司', '乳酪'],          p: [6, 8], fat: 2 },
    { k: ['乳清', '高蛋白', '蛋白粉'], p: [20, 25] },
    { k: ['堅果', '杏仁', '腰果'],   p: [5, 8], fat: 2 },
    // ── 澱粉 ──
    { k: ['糙米飯', '白飯', '米飯', '糙米', '飯'], carb: 3 },
    { k: ['地瓜'],                 carb: 2, veg: 1 },
    { k: ['馬鈴薯'],               carb: 2 },
    { k: ['義大利麵', '陽春麵', '拉麵', '麵線', '意麵', '麵'], carb: 3 },
    { k: ['米粉', '冬粉', '河粉'],  carb: 2 },
    { k: ['吐司', '貝果'],          carb: 2 },
    { k: ['麵包'],                 carb: 2 },
    { k: ['饅頭'],                 carb: 3 },
    { k: ['包子'],                 carb: 2, p: [5, 8] },
    { k: ['水餃', '鍋貼'],          carb: 3, p: [12, 18], fat: 1 },
    { k: ['粥'],                   carb: 2 },
    { k: ['燕麥', '麥片'],          carb: 2, p: [5, 8] },
    { k: ['玉米'],                 carb: 2 },
    { k: ['薯條'],                 carb: 2, fat: 3, fried: true },
    { k: ['泡麵'],                 carb: 3, fat: 3, processed: true },
    { k: ['三明治'],               carb: 2, p: [8, 14], fallback: true },
    { k: ['漢堡'],                 carb: 2, p: [15, 20], fat: 2, fallback: true },
    { k: ['披薩'],                 carb: 3, p: [12, 18], fat: 3, fallback: true },
    { k: ['便當'],                 carb: 3, p: [18, 25], fallback: true },
    // ── 蔬菜 ──
    { k: ['沙拉', '生菜'],          veg: 3 },
    { k: ['燙青菜', '炒青菜', '青菜', '蔬菜'], veg: 2 },
    { k: ['花椰菜', '青花菜', '高麗菜', '菠菜', '地瓜葉', '空心菜', '油菜'], veg: 2 },
    { k: ['番茄', '小黃瓜', '紅蘿蔔', '洋蔥'], veg: 1 },
    { k: ['香菇', '金針菇', '菇'],   veg: 1 },
    { k: ['海帶', '紫菜', '海苔'],   veg: 1 },
    // ── 水果 ──
    { k: ['香蕉'],                 fruit: true, carb: 1 },
    { k: ['蘋果', '芭樂', '藍莓', '橘子', '奇異果', '木瓜', '水果'], fruit: true },
    // ── 糖與甜點 ──
    { k: ['珍奶', '珍珠奶茶', '奶茶', '手搖'], sugar: 3 },
    { k: ['可樂', '汽水', '運動飲料'], sugar: 3 },
    { k: ['蛋糕', '甜點', '巧克力', '冰淇淋', '布丁', '甜甜圈'], sugar: 3, fat: 2 },
    { k: ['餅乾', '洋芋片', '零食'], sugar: 2, fat: 2, processed: true }
  ];

  /* 攤平成 (關鍵字, 食物) 並依字數由長到短排序 */
  var PAIRS = [];
  FOODS.forEach(function (f, fi) {
    f.k.forEach(function (kw) { PAIRS.push({ kw: kw, food: f, fi: fi }); });
  });
  PAIRS.sort(function (a, b) { return b.kw.length - a.kw.length; });

  var SKIP_RE = /(沒吃|沒有吃|不吃|跳過|空腹|略過|忘記吃)/;
  var NUM = { '一': 1, '兩': 2, '二': 2, '三': 3, '四': 4, '五': 5, '半': 1 };

  /* 關鍵字前面 4 個字內找數量詞，例如「兩顆蛋」「3 顆蛋」 */
  function countBefore(text, idx) {
    var head = text.slice(Math.max(0, idx - 7), idx);
    /* 數量詞和食物中間可能隔著形容詞，例如「3 顆水煮蛋」 */
    var tail = '\\s*[顆個片隻碗份杯盒把根條塊]?[\\u4e00-\\u9fff]{0,3}$';
    var m = new RegExp('(\\d+)' + tail).exec(head);
    if (m) return Math.min(5, Math.max(1, parseInt(m[1], 10)));
    var m2 = new RegExp('([一兩二三四五])' + tail).exec(head);
    if (m2) return NUM[m2[1]];
    return 1;
  }

  /* 解析一段文字，回傳這一餐的粗估內容 */
  function parseText(text) {
    var t = String(text || '').trim();
    var res = {
      text: t, empty: !t, skipped: SKIP_RE.test(t),
      pMin: 0, pMax: 0, veg: 0, carb: 0, fat: 0, sugar: 0,
      fried: false, processed: false, fruit: false,
      items: [], unknown: !t ? false : true
    };
    if (!t || res.skipped) { res.unknown = false; return res; }

    var hasProtein = false;
    var pending = [];
    var usedFood = {};
    var consumed = [];               // 已經被某個關鍵字佔用的字元範圍

    function overlaps(a, b) {
      return consumed.some(function (r) { return a < r[1] && b > r[0]; });
    }

    /* PAIRS 是長詞排前面，所以「鮭魚」會先吃掉字，後面的「魚」就不會重複算 */
    PAIRS.forEach(function (pair) {
      if (usedFood[pair.fi]) return;
      var from = 0, idx;
      while ((idx = t.indexOf(pair.kw, from)) >= 0) {
        var end = idx + pair.kw.length;
        if (!overlaps(idx, end)) {
          consumed.push([idx, end]);
          usedFood[pair.fi] = true;
          var f = pair.food;
          var hit = {
            name: pair.kw, food: f,
            n: f.each ? countBefore(t, idx) : 1,
            /* 「無糖奶茶」不要算成糖 */
            noSugar: !!f.sugar && /無糖/.test(t.slice(Math.max(0, idx - 3), idx))
          };
          if (f.fallback) pending.push(hit);
          else {
            apply(res, hit);
            if (f.p) hasProtein = true;
          }
          return;
        }
        from = idx + 1;
      }
    });

    pending.forEach(function (hit) {
      if (hasProtein) { hit.food = Object.assign({}, hit.food, { p: null }); }
      apply(res, hit);
    });

    res.unknown = res.items.length === 0;
    res.pMin = Math.round(res.pMin);
    res.pMax = Math.round(res.pMax);
    return res;
  }

  function apply(res, hit) {
    var f = hit.food;
    if (f.p) { res.pMin += f.p[0] * hit.n; res.pMax += f.p[1] * hit.n; }
    res.veg += f.veg || 0;
    res.carb += f.carb || 0;
    res.fat += f.fat || 0;
    if (f.sugar && !hit.noSugar) res.sugar += f.sugar;
    if (f.fried) res.fried = true;
    if (f.processed) res.processed = true;
    if (f.fruit) res.fruit = true;
    res.items.push(hit.n > 1 ? hit.n + ' × ' + hit.name : hit.name);
  }

  /* 把一整天四餐加總 */
  function parseDay(day) {
    var total = { pMin: 0, pMax: 0, veg: 0, carb: 0, fat: 0, sugar: 0,
                  fried: false, processed: false, fruit: false, logged: 0, bySlot: {} };
    SLOTS.forEach(function (s) {
      var r = parseText(day ? day[s.id] : '');
      total.bySlot[s.id] = r;
      if (r.empty || r.skipped) return;
      total.logged++;
      total.pMin += r.pMin; total.pMax += r.pMax;
      total.veg += r.veg; total.carb += r.carb; total.fat += r.fat; total.sugar += r.sugar;
      total.fried = total.fried || r.fried;
      total.processed = total.processed || r.processed;
      total.fruit = total.fruit || r.fruit;
    });
    return total;
  }

  /* ---------- 建議 ---------- */

  /* needs：protein 蛋白質不足 / veg 蔬菜不足 / light 今天油糖已經夠多 / carb 需要補碳水 */
  var IDEAS = [
    { slots: ['snack'], needs: ['protein'], add: '約 15 g 蛋白質',
      text: '無糖豆漿 + 茶葉蛋',
      why: '超商就有，蛋白質補得到又不會脹到吃不下晚餐。' },
    { slots: ['snack'], needs: ['protein'], add: '約 15 g 蛋白質',
      text: '無糖希臘優格 + 一根香蕉',
      why: '優格補蛋白質，香蕉的碳水好吸收，下午不會更累。' },
    { slots: ['snack'], needs: ['protein'], add: '約 12 g 蛋白質',
      text: '一盒毛豆',
      why: '蛋白質和纖維一起補，熱量低，咀嚼久比較有飽足感。' },
    { slots: ['snack'], needs: ['protein', 'postWorkout'], add: '約 20 g 蛋白質',
      text: '乳清一匙 + 一根香蕉',
      why: '剛練完的話這組吸收最快；但如果一兩小時後就吃晚餐，優先選真食物。' },
    { slots: ['snack'], needs: ['veg'], add: '補一點蔬菜',
      text: '一盒小番茄或小黃瓜',
      why: '今天蔬菜掛零，點心時段補最沒壓力。' },
    { slots: ['snack'], needs: ['light'], add: '不再加糖',
      text: '無糖茶或黑咖啡，真的餓再加一顆茶葉蛋',
      why: '今天的油和糖已經偏多了，下午這餐讓它過去就好。' },
    { slots: ['snack'], needs: [], add: '墊一下',
      text: '一小把堅果（約一個手掌心）',
      why: '油脂會讓飽足感撐久一點，但份量不要超過一把。' },
    { slots: ['snack'], needs: [], add: '低負擔',
      text: '一份水果（香蕉、芭樂或蘋果）',
      why: '今天吃得還不錯，點心用水果收就好，不用再加什麼。' },
    { slots: ['snack'], needs: [], add: '幾乎零負擔',
      text: '一杯無糖豆漿或無糖茶',
      why: '如果只是嘴饞不是真餓，先喝點東西等十分鐘，通常就過去了。' },

    { slots: ['lunch', 'dinner'], needs: ['protein', 'veg'], add: '約 30 g 蛋白質 + 兩份蔬菜',
      text: '自助餐：一個主菜（魚或雞腿）+ 兩樣青菜 + 半碗到一碗飯',
      why: '最便宜好執行的組合，蛋白質和蔬菜一次補齊。' },
    { slots: ['lunch', 'dinner'], needs: ['protein'], add: '約 35 g 蛋白質',
      text: '雞胸肉或鮭魚 + 一碗飯',
      why: '今天蛋白質還差一截，這餐直接把主菜份量拉滿。' },
    { slots: ['lunch', 'dinner'], needs: ['protein', 'veg'], add: '約 30 g 蛋白質 + 蔬菜',
      text: '雞胸沙拉 + 一顆水煮蛋 + 一片吐司',
      why: '沙拉單吃容易餓，加蛋和一點澱粉才撐得住。' },
    { slots: ['lunch', 'dinner'], needs: ['veg'], add: '兩份蔬菜',
      text: '原本想吃的 + 加點一份燙青菜和一碗味噌湯',
      why: '不用改主餐，加一盤青菜就補起來了。' },
    { slots: ['lunch', 'dinner'], needs: ['light'], add: '清淡收尾',
      text: '清湯麵或粥 + 燙青菜 + 一顆滷蛋',
      why: '今天已經有油炸或甜食，這餐清一點讓腸胃喘口氣。' },
    { slots: ['lunch', 'dinner'], needs: ['postWorkout'], add: '補碳水 + 蛋白質',
      text: '牛肉或雞腿 + 一碗飯 + 青菜',
      why: '今天有訓練，碳水不要刻意少吃，肌肉修復需要它。' },
    { slots: ['dinner'], needs: ['late'], add: '輕量',
      text: '蒸蛋或豆腐 + 燙青菜，澱粉減半',
      why: '太晚吃大份量容易影響睡眠，蛋白質留著、澱粉收斂一點。' },
    { slots: ['lunch', 'dinner'], needs: [], add: '維持就好',
      text: '一份主菜（手掌大）+ 一碗飯 + 一到兩份青菜',
      why: '沒什麼缺口，照這個比例吃就很穩。' },

    { slots: ['breakfast'], needs: ['protein'], add: '約 20 g 蛋白質',
      text: '蛋餅加蛋 + 無糖豆漿',
      why: '早餐店版本的高蛋白組合，比單吃吐司撐得久很多。' },
    { slots: ['breakfast'], needs: ['protein'], add: '約 25 g 蛋白質',
      text: '兩顆水煮蛋 + 無糖優格 + 一份水果',
      why: '早上先把蛋白質墊起來，整天比較不會到晚上才在追進度。' },
    { slots: ['breakfast'], needs: [], add: '穩定開場',
      text: '燕麥 + 牛奶 + 一根香蕉',
      why: '碳水和蛋白質都有，準備要訓練的日子特別適合。' }
  ];

  /* 依時間猜下一餐 */
  function guessSlot(day, now) {
    var h = (now || new Date()).getHours() + (now || new Date()).getMinutes() / 60;
    for (var i = 0; i < SLOTS.length; i++) {
      var s = SLOTS[i];
      var filled = day && day[s.id] && day[s.id].trim();
      if (!filled && h < s.until) return s.id;
    }
    for (var j = 0; j < SLOTS.length; j++) {
      if (!(day && day[SLOTS[j].id] && day[SLOTS[j].id].trim())) return SLOTS[j].id;
    }
    return 'snack';
  }

  /* ctx: { weight, proteinPerKg, trainedToday, hour } */
  function advise(day, slotId, ctx) {
    ctx = ctx || {};
    var total = parseDay(day);
    var hour = typeof ctx.hour === 'number' ? ctx.hour : new Date().getHours();
    var target = ctx.weight > 0 ? Math.round(ctx.weight * (ctx.proteinPerKg || 1.6)) : null;

    /* 到這個時間點「應該」已經吃進多少比例的蛋白質 */
    var expectedRatio = slotId === 'breakfast' ? 0
      : slotId === 'lunch' ? 0.3
      : slotId === 'snack' ? 0.55
      : 0.65;

    var needs = [];
    var lowProtein = target
      ? total.pMax < target * expectedRatio
      : (total.logged > 0 && total.pMax < 25 * total.logged);
    if (lowProtein || total.logged === 0) needs.push('protein');
    if (total.veg < 2) needs.push('veg');
    if (total.fried || total.sugar >= 3) needs.push('light');
    if (ctx.trainedToday) needs.push('postWorkout');
    if (slotId === 'dinner' && hour >= 20) needs.push('late');

    /* 挑建議：命中的 needs 越多分數越高 */
    var scored = IDEAS.filter(function (it) { return it.slots.indexOf(slotId) >= 0; })
      .map(function (it) {
        var hits = it.needs.filter(function (n) { return needs.indexOf(n) >= 0; }).length;
        var missed = it.needs.filter(function (n) { return needs.indexOf(n) < 0; }).length;
        return { idea: it, score: hits * 10 - missed * 4 };
      })
      .sort(function (a, b) { return b.score - a.score; });

    var picks = scored
      .filter(function (x) { return x.score >= 0; })
      .slice(0, 3)
      .map(function (x) { return x.idea; });

    /* 至少要給兩個選擇，不然畫面看起來像壞掉 */
    for (var i = 0; picks.length < 2 && i < scored.length; i++) {
      if (picks.indexOf(scored[i].idea) < 0) picks.push(scored[i].idea);
    }

    return {
      slot: slotId,
      slotLabel: slotLabel(slotId),
      total: total,
      target: target,
      needs: needs,
      summary: buildSummary(total, target, needs, slotId),
      picks: picks
    };
  }

  function buildSummary(total, target, needs, slotId) {
    var parts = [];
    if (total.logged === 0) {
      parts.push('今天還沒記錄任何一餐。先把吃過的打上去，建議會準很多。');
      return parts;
    }
    if (total.pMax > 0) {
      if (target) {
        var left = target - total.pMax;
        parts.push('目前粗估吃進 ' + total.pMin + '～' + total.pMax + ' g 蛋白質，目標 ' +
          target + ' g' + (left > 5 ? '，大約還差 ' + left + ' g。' : '，已經差不多了。'));
      } else {
        parts.push('目前粗估吃進 ' + total.pMin + '～' + total.pMax + ' g 蛋白質。');
      }
    }
    if (needs.indexOf('veg') >= 0) {
      parts.push(total.veg === 0 ? '蔬菜今天還是零。' : '蔬菜偏少，再補一份會比較好。');
    }
    if (total.fried) parts.push('有吃到油炸的東西。');
    if (total.sugar >= 3) parts.push('含糖的份量偏高。');
    if (needs.indexOf('postWorkout') >= 0) parts.push('今天有訓練，蛋白質和碳水都別省。');
    return parts;
  }

  function slotLabel(id) {
    for (var i = 0; i < SLOTS.length; i++) if (SLOTS[i].id === id) return SLOTS[i].label;
    return id;
  }

  return {
    SLOTS: SLOTS,
    parseText: parseText,
    parseDay: parseDay,
    guessSlot: guessSlot,
    advise: advise,
    slotLabel: slotLabel
  };
})();
