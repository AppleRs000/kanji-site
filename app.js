(function () {
  'use strict';

  var STORAGE_KEY = 'kanji-site-v1';
  var GRADES = [1, 2, 3, 4, 5, 6];

  /* ---------- データ ---------- */
  var ALL = (window.KANJI_DATA || []).map(function (e) {
    return {
      k: e[0], grade: e[1], on: e[2], kun: e[3],
      words: e[4].map(function (x) { return { w: x[0], r: x[1], p: x[2] }; })
    };
  });
  var gradeCount = {};
  ALL.forEach(function (e) { gradeCount[e.grade] = (gradeCount[e.grade] || 0) + 1; });

  /* ---------- 保存（にがて漢字・前回の設定） ---------- */
  var store = { miss: {}, settings: {} };
  try {
    var saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && typeof saved === 'object') {
      if (saved.miss && typeof saved.miss === 'object') store.miss = saved.miss;
      if (saved.settings && typeof saved.settings === 'object') store.settings = saved.settings;
    }
  } catch (err) { /* 保存できない環境でも動くようにする */ }

  function saveStore() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (err) { /* 無視 */ }
  }

  /* ---------- 状態 ---------- */
  var state = { grade: null, range: 'only', type: 'read', count: 10 };
  (function restore() {
    var s = store.settings;
    if (s.grade && gradeCount[s.grade]) state.grade = s.grade;
    if (['only', 'review', 'weak'].indexOf(s.range) >= 0) state.range = s.range;
    if (['read', 'write', 'mix'].indexOf(s.type) >= 0) state.type = s.type;
    if ([5, 10, 20].indexOf(s.count) >= 0) state.count = s.count;
  })();
  var quiz = null;

  /* ---------- 小さな道具 ---------- */
  function $(id) { return document.getElementById(id); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function shuffle(a) {
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function kata2hira(s) {
    return s.replace(/[\u30a1-\u30f6]/g, function (c) {
      return String.fromCharCode(c.charCodeAt(0) - 0x60);
    });
  }

  /* ---------- まだ習っていない漢字は、ひらがなで見せる ---------- */
  var G1 = '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六';
  var gradeOf = {};
  ALL.forEach(function (e) { gradeOf[e.k] = e.grade; });

  function isKanji(c) { return /[一-鿿]/.test(c); }

  function unlearned(c, grade) {
    if (!isKanji(c)) return false;
    if (gradeOf[c] !== undefined) return gradeOf[c] > grade;
    return G1.indexOf(c) < 0;
  }

  function hasUnlearned(s, grade) {
    for (var i = 0; i < s.length; i++) if (unlearned(s.charAt(i), grade)) return true;
    return false;
  }

  function hasKanji(s) {
    for (var i = 0; i < s.length; i++) if (isKanji(s.charAt(i))) return true;
    return false;
  }

  /* 例語を「出題する漢字の前」と「うしろ」に分け、習っていない漢字はその読みに直す */
  function splitWord(q, grade) {
    var w = q.word.w, k = q.entry.k, r = q.word.r, p = q.word.p;
    var i = w.indexOf(k);
    if (i < 0) return { pre: w, post: '' };
    var pre = w.slice(0, i), post = w.slice(i + 1);
    var plain = { pre: pre, post: post };
    if (!hasUnlearned(pre, grade) && !hasUnlearned(post, grade)) return plain;

    var j = r.indexOf(p);
    while (j >= 0) {
      var rPre = r.slice(0, j), rPost = r.slice(j + p.length);
      var okPre = hasKanji(pre) || pre === rPre;
      var okPost = hasKanji(post) || post === rPost;
      if (okPre && okPost) {
        return {
          pre: hasUnlearned(pre, grade) ? rPre : pre,
          post: hasUnlearned(post, grade) ? rPost : post
        };
      }
      j = r.indexOf(p, j + 1);
    }
    return plain;
  }

  function shownWord(q) {
    var s = splitWord(q, quiz.grade);
    return q.word.w.indexOf(q.entry.k) < 0 ? q.word.w : s.pre + q.entry.k + s.post;
  }

  function show(name) {
    ['setup', 'quiz', 'result'].forEach(function (id) { $(id).hidden = id !== name; });
    window.scrollTo(0, 0);
  }

  function readingTokens(e) {
    var out = [];
    e.on.split('・').forEach(function (s) { if (s && s !== '-') out.push(kata2hira(s)); });
    e.kun.split('・').forEach(function (s) { if (s && s !== '-') out.push(s.split('(')[0]); });
    return out;
  }

  /* ---------- 出題する漢字のなかみ ---------- */
  function missCount(k) { return store.miss[k] || 0; }

  function poolFor(grade, range) {
    if (range === 'only') return ALL.filter(function (e) { return e.grade === grade; });
    if (range === 'review') return ALL.filter(function (e) { return e.grade <= grade; });
    if (range === 'weak') return ALL.filter(function (e) { return e.grade <= grade && missCount(e.k) > 0; });
    return [];
  }

  function rangeInfo(g) {
    var lower = ALL.filter(function (e) { return e.grade < g; }).length;
    var only = poolFor(g, 'only').length;
    var review = poolFor(g, 'review').length;
    var weak = poolFor(g, 'weak').length;
    return {
      only: { n: only, ok: only > 0 },
      review: { n: review, ok: g > 1 && lower > 0 },
      weak: { n: weak, ok: weak > 0 }
    };
  }

  function rangeAvailable(r) {
    return !!state.grade && rangeInfo(state.grade)[r].ok;
  }

  function weightOf(e) {
    var w = 1;
    if (state.range === 'review' && e.grade === state.grade) w += 1; /* 選んだ学年をやや多めに */
    if (missCount(e.k) > 0) w += 2;                                  /* にがてを多めに */
    return w;
  }

  function pickWeighted(pool, n) {
    var items = pool.slice();
    var out = [];
    while (out.length < n && items.length) {
      var total = 0, i;
      for (i = 0; i < items.length; i++) total += weightOf(items[i]);
      var r = Math.random() * total;
      for (i = 0; i < items.length; i++) {
        r -= weightOf(items[i]);
        if (r <= 0) break;
      }
      if (i >= items.length) i = items.length - 1;
      out.push(items.splice(i, 1)[0]);
    }
    return out;
  }

  /* ---------- 問題づくり ---------- */
  function readDistractors(word) {
    var seen = {};
    var same = [], near = [], far = [];
    seen[word.r] = true;
    ALL.forEach(function (e) {
      e.words.forEach(function (x) {
        if (seen[x.r]) return;
        seen[x.r] = true;
        var d = Math.abs(x.r.length - word.r.length);
        if (d === 0) same.push(x.r);
        else if (d === 1) near.push(x.r);
        else far.push({ r: x.r, d: d });
      });
    });
    shuffle(same); shuffle(near); shuffle(far);
    far.sort(function (a, b) { return a.d - b.d; });
    var farR = far.map(function (x) { return x.r; });
    return same.concat(near, farR).slice(0, 3);
  }

  function writeDistractors(entry, p) {
    var fits = function (c) { return readingTokens(c).indexOf(p) < 0; };
    var same = ALL.filter(function (c) { return c.grade === entry.grade && c.k !== entry.k && fits(c); });
    var rest = ALL.filter(function (c) { return c.grade !== entry.grade && c.grade <= state.grade && fits(c); });
    shuffle(same); shuffle(rest);
    return same.concat(rest).slice(0, 3).map(function (c) { return c.k; });
  }

  function makeQuestion(entry) {
    var word = entry.words[Math.floor(Math.random() * entry.words.length)];
    var type = state.type === 'mix' ? (Math.random() < 0.5 ? 'read' : 'write') : state.type;
    if (type === 'read') {
      return {
        type: 'read', entry: entry, word: word, answer: word.r,
        choices: shuffle([word.r].concat(readDistractors(word)))
      };
    }
    return {
      type: 'write', entry: entry, word: word, answer: entry.k,
      choices: shuffle([entry.k].concat(writeDistractors(entry, word.p)))
    };
  }

  /* ---------- 設定画面 ---------- */
  function makeChoice(label, sub, selected, disabled) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'choice' + (selected ? ' selected' : '');
    b.disabled = !!disabled;
    b.setAttribute('aria-pressed', selected ? 'true' : 'false');
    var m = document.createElement('span');
    m.className = 'main';
    m.textContent = label;
    b.appendChild(m);
    if (sub) {
      var t = document.createElement('span');
      t.className = 'sub';
      t.textContent = sub;
      b.appendChild(t);
    }
    return b;
  }

  function renderGrades() {
    var box = $('gradeButtons');
    box.innerHTML = '';
    GRADES.forEach(function (g) {
      var n = gradeCount[g] || 0;
      var b = makeChoice(g + '年生', n ? n + '字' : 'じゅんび中', state.grade === g, !n);
      if (n) {
        b.addEventListener('click', function () {
          state.grade = g;
          if (!rangeAvailable(state.range)) state.range = 'only';
          renderAll();
        });
      }
      box.appendChild(b);
    });
  }

  function renderRanges() {
    var box = $('rangeButtons');
    box.innerHTML = '';
    if (!state.grade) { $('rangeBlock').hidden = true; return; }
    $('rangeBlock').hidden = false;

    var g = state.grade;
    var info = rangeInfo(g);
    var grades = ALL.filter(function (e) { return e.grade <= g; }).map(function (e) { return e.grade; });
    var minG = grades.length ? Math.min.apply(null, grades) : 1;
    var defs =[{ id: 'only', label: g + '年生だけ', sub: info.only.n + '字' }];
    if (g > 1) {
      defs.push({
        id: 'review',
        label: minG + '〜' + g + '年生 ふくしゅう',
        sub: info.review.ok ? info.review.n + '字' : 'まえの がくねんは じゅんび中'
      });
    }
    defs.push({
      id: 'weak',
      label: 'にがて かんじ',
      sub: info.weak.ok ? info.weak.n + '字' : 'まちがえると ここに たまるよ'
    });

    defs.forEach(function (d) {
      var b = makeChoice(d.label, d.sub, state.range === d.id, !info[d.id].ok);
      b.addEventListener('click', function () { state.range = d.id; renderAll(); });
      box.appendChild(b);
    });
  }

  function markSelected(id, key) {
    Array.prototype.forEach.call($(id).children, function (b) {
      var on = String(b.dataset[key]) === String(state[key]);
      b.classList.toggle('selected', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
  }

  function persist() {
    store.settings = { grade: state.grade, range: state.range, type: state.type, count: state.count };
    saveStore();
  }

  function renderAll() {
    renderGrades();
    renderRanges();
    markSelected('typeButtons', 'type');
    markSelected('countButtons', 'count');

    var pool = state.grade ? poolFor(state.grade, state.range) : [];
    $('startBtn').disabled = !pool.length;
    if (!state.grade) {
      $('setupNote').textContent = 'まず がくねんを えらんでね';
    } else if (!pool.length) {
      $('setupNote').textContent = 'この はんいには かんじが ないよ';
    } else {
      $('setupNote').textContent = Math.min(state.count, pool.length) + 'もん でるよ（ぜんぶで ' + pool.length + '字）';
    }
    persist();
  }

  /* ---------- クイズ ---------- */
  function start() {
    if (!state.grade) return;
    var pool = poolFor(state.grade, state.range);
    if (!pool.length) return;
    var picked = pickWeighted(pool, Math.min(state.count, pool.length));
    quiz = { questions: picked.map(makeQuestion), index: 0, score: 0, misses: [], grade: state.grade };
    show('quiz');
    renderQuestion();
  }

  function wordHtml(q) {
    var w = q.word.w;
    var k = q.entry.k;
    var i = w.indexOf(k);
    if (i < 0) return '<span class="word">' + esc(w) + '</span>';
    var s = splitWord(q, quiz.grade);
    var before = esc(s.pre);
    var after = esc(s.post);
    if (q.type === 'read') {
      return '<span class="word">' + before + '<span class="focus">' + esc(k) + '</span>' + after + '</span>';
    }
    return '<span class="word">' + before + '<span class="blank">' + esc(q.word.p) + '</span>' + after + '</span>';
  }

  function renderQuestion() {
    var q = quiz.questions[quiz.index];
    q.done = false;
    $('progressText').textContent = (quiz.index + 1) + ' / ' + quiz.questions.length;
    $('barFill').style.width = (quiz.index / quiz.questions.length * 100) + '%';
    $('feedback').hidden = true;

    $('qLabel').textContent = q.type === 'read'
      ? 'あかい かんじを ふくむ ことばの よみかたは？'
      : 'ひらがなの ところを かんじに すると？';
    $('qCard').innerHTML = wordHtml(q);

    var box = $('choices');
    box.innerHTML = '';
    var long = q.choices.some(function (c) { return c.length > 4; });
    box.className = 'choice-grid ' + (long ? 'cols-1' : 'cols-2');
    q.choices.forEach(function (c) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'choice answer' + (q.type === 'write' ? ' kanji-choice' : '');
      b.textContent = c;
      b.addEventListener('click', function () { onAnswer(q, c, b); });
      box.appendChild(b);
    });
  }

  function record(entry, ok) {
    var m = missCount(entry.k);
    if (ok) { if (m > 0) m--; } else { m = Math.min(m + 1, 5); }
    if (m > 0) store.miss[entry.k] = m; else delete store.miss[entry.k];
    saveStore();
  }

  function onAnswer(q, value, btn) {
    if (q.done) return;
    q.done = true;
    var ok = value === q.answer;

    Array.prototype.forEach.call($('choices').children, function (b) {
      b.classList.add('locked');
      if (b.textContent === q.answer) b.classList.add('correct');
    });
    if (!ok) btn.classList.add('wrong');

    record(q.entry, ok);
    if (ok) {
      quiz.score++;
    } else if (!quiz.misses.some(function (m) { return m.entry.k === q.entry.k; })) {
      quiz.misses.push(q);
    }

    var e = q.entry, w = q.word;
    var info = [];
    if (e.on !== '-') info.push('おん ' + e.on.replace(/・/g, '、'));
    if (e.kun !== '-') info.push('くん ' + e.kun.replace(/・/g, '、'));

    var fb = $('feedback');
    fb.className = 'feedback ' + (ok ? 'ok' : 'ng');
    $('feedbackMark').textContent = ok ? '○' : '×';
    $('feedbackText').innerHTML =
      '<strong>' + (ok ? 'せいかい！' : 'ざんねん… せいかいは「' + esc(q.answer) + '」') + '</strong>' +
      '<div class="detail"><span class="kanji">' + esc(e.k) + '</span>' + esc(info.join('　')) +
      '<br>' + esc(shownWord(q)) + '（' + esc(w.r) + '）</div>';
    $('nextBtn').textContent = quiz.index + 1 < quiz.questions.length ? 'つぎへ' : 'けっかを みる';
    fb.hidden = false;
    try { fb.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); } catch (err) { /* 無視 */ }
  }

  function next() {
    quiz.index++;
    if (quiz.index >= quiz.questions.length) showResult();
    else renderQuestion();
  }

  /* ---------- 結果 ---------- */
  function showResult() {
    var total = quiz.questions.length;
    var rate = quiz.score / total;
    $('scoreBig').innerHTML = '<span class="num">' + quiz.score + '</span> / ' + total;
    $('scoreMsg').textContent =
      rate === 1 ? 'ぜんぶ せいかい！ まんてん！' :
      rate >= 0.8 ? 'すごい！ よく できました' :
      rate >= 0.5 ? 'いいちょうし！ もうすこし！' :
      'まちがえた かんじを ふくしゅうしよう';

    var list = $('missList');
    list.innerHTML = '';
    if (quiz.misses.length) {
      var title = document.createElement('div');
      title.className = 'miss-title';
      title.textContent = 'まちがえた かんじ';
      list.appendChild(title);
      quiz.misses.forEach(function (q) {
        var d = document.createElement('div');
        d.className = 'miss-item';
        d.innerHTML = '<span class="kanji">' + esc(q.entry.k) + '</span>' +
          '<span class="miss-text">' + esc(shownWord(q)) + '（' + esc(q.word.r) + '）</span>';
        list.appendChild(d);
      });
    }
    $('weakBtn').hidden = poolFor(state.grade, 'weak').length === 0;
    show('result');
  }

  /* ---------- ボタンの配線 ---------- */
  $('typeButtons').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b || !b.dataset.type) return;
    state.type = b.dataset.type;
    renderAll();
  });
  $('countButtons').addEventListener('click', function (ev) {
    var b = ev.target.closest('button');
    if (!b || !b.dataset.count) return;
    state.count = parseInt(b.dataset.count, 10);
    renderAll();
  });
  $('startBtn').addEventListener('click', start);
  $('nextBtn').addEventListener('click', next);
  $('quitBtn').addEventListener('click', function () {
    if (window.confirm('れんしゅうを やめますか？')) { show('setup'); renderAll(); }
  });
  $('againBtn').addEventListener('click', start);
  $('weakBtn').addEventListener('click', function () {
    if (rangeAvailable('weak')) { state.range = 'weak'; start(); }
  });
  $('topBtn').addEventListener('click', function () { show('setup'); renderAll(); });

  renderAll();
  show('setup');
})();
