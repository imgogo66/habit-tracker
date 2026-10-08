/* ============================================================
   coach.js · 今日狀態教練
   輸入「今天的身心狀態」，輸出兩軌各自「今天做到這樣就夠了」的具體建議。
   純規則運算，沒有連網、沒有 AI、不會亂講話。

   設計原則：累的時候不是叫你休息，而是把門檻降到你一定做得到的高度，
   因為「連續天數」靠的是不要斷，不是每天都很猛。
   ============================================================ */
var Coach = (function () {
  'use strict';

  /* ============================================================
     每次打開隨機跳一句。想改就直接動這個陣列，加減都可以。
     ============================================================ */
  var SLOGANS = [
    '明天的你永遠比今天的你老一天。所以去做吧，不要等。',
    '「等我有空」是這世界上最長的等待。',
    '你不會因為想了很久就變強，你只會因為做了很多次。',
    '三個月後的你，會希望你今天有開始。',
    '動機不會先來。動機是動起來之後才出現的。',
    '做五分鐘和做一小時，對「沒有斷掉」來說是同一件事。',
    '完美的開始時機不存在，現在就是最好的那個。',
    '不是每天都要進步，是每天都要出現。',
    '狀態差的日子你怎麼做，才決定你三年後長什麼樣子。',
    '最難的從來不是最後一下，是換上鞋走出門那一步。',
    '沒有人後悔練完，只有人後悔沒去。',
    '肌肉不看你的藉口，它只看你的次數。',
    '重量不會自己變輕，是你變強。',
    '今天的痠痛，是明天的理所當然。',
    '那個卡住的和弦，只會輸給比它更固執的手指。',
    '慢慢彈對，比快快彈錯有用一百倍。',
    '你現在覺得難的段落，三個月後會變成暖身。',
    '繭會長回來，但手感不會自己回來。',
    '每一首你會彈的歌，都曾經是你彈不出來的歌。',
    '一邊練力氣，一邊練耳朵。兩件事都急不得，但都怕停。',
    '槓鈴和吉他有個共通點：都不理會你今天心情好不好。',
    '身體和手指都一樣，記得的是次數，不是你多努力。',
    '今天不練，明天就要用更差的狀態練同一件事。',
    '你的待看清單不會因為你今天練完就變長。',
    '計畫是寫給未來的自己看的，但只有現在的自己能動手。',
    '「我明天一定」—— 你昨天也是這樣說的。',
    '沒有天份這種東西，只有還沒累積夠的次數。',
    '做不到一百分，做二十分也遠遠好過零分。',
    '今天只要比完全沒做好一點點，就算贏。',
    '會讓你放棄的從來不是太難，是太久沒看到變化。再撐一下。',
    '你羨慕的那個人，只是比你早開始，而且沒有停。',
    '練不好很正常，不練才是真的不會好。'
  ];

  var LAST_KEY = 'dualtrack.lastSlogan';

  /* 隨機挑一句，盡量不要跟上一句重複 */
  function pickSlogan() {
    var last = -1;
    try { last = parseInt(localStorage.getItem(LAST_KEY), 10); } catch (e) { /* 無所謂 */ }
    var i = Math.floor(Math.random() * SLOGANS.length);
    if (SLOGANS.length > 1 && i === last) i = (i + 1 + Math.floor(Math.random() * (SLOGANS.length - 1))) % SLOGANS.length;
    try { localStorage.setItem(LAST_KEY, String(i)); } catch (e) { /* 無所謂 */ }
    return SLOGANS[i];
  }

  var ENERGY = [
    { id: 'great', icon: '⚡',        label: '精力充沛' },
    { id: 'ok',    icon: '🙂',  label: '還可以' },
    { id: 'tired', icon: '😮',  label: '有點累' },
    { id: 'spent', icon: '🫠',  label: '很累' },
    { id: 'sick',  icon: '🤒',  label: '生病／受傷' }
  ];

  var FLAGS = [
    { id: 'busy',    label: '今天很忙' },
    { id: 'sore',    label: '肌肉痠痛' },
    { id: 'fingers', label: '手指痛／繭破' },
    { id: 'low',     label: '心情低落' }
  ];

  /* 各狀態的基礎處方 */
  var PLAN = {
    great: {
      headline: '狀態好的日子不多，拿來推進度。',
      fitness: {
        minutes: 60, parts: ['腿', '背'], intensity: 5,
        title: '大重量日',
        detail: '動態暖身 10 分鐘，然後挑一個複合動作（深蹲、硬舉或臥推）做 5 組重的，' +
                '再補兩個輔助動作。想破 PR 就挑今天，別挑你很累的那天。'
      },
      guitar: {
        minutes: 45, focus: ['暖身音階', '練歌'],
        title: '啃硬骨頭',
        detail: '爬格子暖手 5 分鐘。然後把整首裡最卡的那 8 小節單獨抓出來，' +
                '開節拍器用慢到不會錯的速度彈，每彈對 3 次就 +5 BPM。最後完整走一遍。'
      }
    },
    ok: {
      headline: '不用勉強自己超常發揮，照課表走就是進步。',
      fitness: {
        minutes: 45, parts: ['胸', '手臂'], intensity: 3,
        title: '照課表走',
        detail: '暖身 5 分鐘，主訓練 3 個動作各 3～4 組。每組留 1～2 下的餘力，不要練到力竭，' +
                '明天才有辦法再來。'
      },
      guitar: {
        minutes: 30, focus: ['和弦轉換', '練歌'],
        title: '穩穩累積',
        detail: '前 10 分鐘練和弦轉換：挑兩個最卡的和弦來回換，60 秒一輪、做 5 輪。' +
                '剩下 20 分鐘練正在學的那首。'
      }
    },
    tired: {
      headline: '累的時候降強度，不要降頻率 —— 斷掉比練少傷更大。',
      fitness: {
        minutes: 30, parts: ['核心', '有氧'], intensity: 2,
        title: '降重量，拉次數',
        detail: '重量砍掉三成、次數拉到 12～15 下，組間多休息。真的提不起勁就直接改成' +
                '20 分鐘快走或腳踏車。今天的目的是讓身體動起來，不是變強。'
      },
      guitar: {
        minutes: 20, focus: ['和弦轉換', '節奏刷扣'],
        title: '只練肌肉記憶',
        detail: '彈已經會的東西就好：和弦轉換、右手節奏、或整首用慢速過一遍。' +
                '今天不要開新譜，腦袋累的時候學新東西效率很差，只會讓你覺得自己很爛。'
      }
    },
    spent: {
      headline: '今天唯一的目標是「不要斷掉」。做五分鐘，就算數。',
      fitness: {
        minutes: 15, parts: ['全身'], intensity: 1,
        title: '只做伸展與活動度',
        detail: '貓牛式、髖關節繞環、胸椎旋轉，各做 2 分鐘，再加 5 分鐘慢走。' +
                '不要碰槓鈴，疲勞時動作會跑掉，受傷的機率比平常高很多。'
      },
      guitar: {
        minutes: 5, focus: ['練歌'],
        title: '五分鐘就夠了',
        detail: '坐著，彈你最熟的那一首，一遍。彈完就放下琴。' +
                '對「連續天數」來說，五分鐘和一小時是同一件事。'
      }
    },
    sick: {
      headline: '生病或受傷硬練，只會讓你更晚回到場上。',
      fitness: {
        minutes: 0, parts: [], intensity: 0,
        title: '今天請休息',
        detail: '不要訓練。真的想動就散步 10 分鐘，不要做會讓心率衝高的動作。' +
                '休息也是課表的一部分，這天不打卡不代表你失敗。'
      },
      guitar: {
        minutes: 5, focus: ['樂理', '聽歌抓歌'],
        title: '不用抱琴也能練',
        detail: '改成聽歌抓和弦、看譜、或讀五分鐘樂理。手不動，耳朵跟腦袋還是在進步。'
      }
    }
  };

  function round5(n) { return Math.max(0, Math.round(n / 5) * 5); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  /* 把附加狀況套到基礎處方上 */
  var MODIFIERS = {
    busy: function (s) {
      ['fitness', 'guitar'].forEach(function (t) {
        if (s[t].minutes > 0) s[t].minutes = Math.max(5, round5(s[t].minutes * 0.4));
      });
      s._shrunk = true;
      s.notes.push('時間不夠就砍時長，不要砍掉整件事。把上面的內容挑最重要的一項做完就好。');
    },
    sore: function (s) {
      s.fitness.parts = ['核心', '有氧'];
      s.fitness.minutes = Math.max(10, round5(s.fitness.minutes * 0.7));
      s.fitness.title = '避開痠痛部位';
      s.fitness.detail = '痠痛的部位今天放過它，改練沒練到的地方，或做 15～20 分鐘的輕有氧' +
                         '幫助血液循環。延遲性痠痛通常 48 小時內會退。';
    },
    fingers: function (s) {
      s.guitar.focus = ['樂理', '聽歌抓歌'];
      s.guitar.minutes = Math.min(s.guitar.minutes, 10);
      s.guitar.title = '今天別壓弦';
      s.guitar.detail = '指尖破皮或很痛就不要硬彈，繭要時間長。改成看譜、聽歌抓和弦、' +
                        '或純右手練節奏（左手只輕輕悶弦）。';
    },
    low: function (s) {
      ['fitness', 'guitar'].forEach(function (t) {
        if (s[t].minutes > 0) s[t].minutes = Math.max(5, round5(s[t].minutes * 0.5));
      });
      s._minimal = true;
      s.notes.push('心情差的時候把門檻放到最低：換上球鞋出門走十分鐘、或拿起吉他刷一個和弦，' +
                   '就算完成。動起來之後通常會想多做一點，但沒有也沒關係。');
    }
  };

  /* ctx 可帶 { fitnessStreak, guitarStreak }，用來提醒「做多少能保住連續紀錄」 */
  function suggest(energyId, flagIds, ctx) {
    var base = PLAN[energyId] || PLAN.ok;
    var s = {
      energy: energyId,
      headline: base.headline,
      fitness: clone(base.fitness),
      guitar: clone(base.guitar),
      notes: []
    };

    (flagIds || []).forEach(function (f) {
      if (MODIFIERS[f]) MODIFIERS[f](s);
    });

    /* 時間被砍掉之後，標題不能還寫「大重量日」這種跟份量矛盾的話 */
    if (s._minimal || s._shrunk) {
      var prefix = s._minimal ? '最低門檻 · ' : '精簡版 · ';
      ['fitness', 'guitar'].forEach(function (t) {
        if (s[t].minutes <= 0) return;
        s[t].title = prefix + s[t].title;
        s[t].detail += '（今天只抓得出 ' + s[t].minutes +
          ' 分鐘，從上面挑最重要的一項做完就好，其餘直接跳過，不要有罪惡感。）';
      });
    }
    delete s._minimal; delete s._shrunk;

    ctx = ctx || {};
    if (ctx.fitnessStreak > 1 && s.fitness.minutes > 0) {
      s.fitness.streakNote = '你健身已經連續 ' + ctx.fitnessStreak + ' 天，做完這 ' +
        s.fitness.minutes + ' 分鐘就保住了。';
    }
    if (ctx.guitarStreak > 1 && s.guitar.minutes > 0) {
      s.guitar.streakNote = '你吉他已經連續 ' + ctx.guitarStreak + ' 天，做完這 ' +
        s.guitar.minutes + ' 分鐘就保住了。';
    }
    return s;
  }

  function energyLabel(id) {
    for (var i = 0; i < ENERGY.length; i++) if (ENERGY[i].id === id) return ENERGY[i].label;
    return '';
  }

  return { ENERGY: ENERGY, FLAGS: FLAGS, SLOGANS: SLOGANS,
           suggest: suggest, energyLabel: energyLabel, pickSlogan: pickSlogan };
})();
