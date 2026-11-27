(function () {
  'use strict';
  var PER_SHEET = 20;   /* 1枚の最大問題数（横10列 × 縦2段） */
  var perSheet = PER_SHEET;   /* 短文のときは10問 */
  var PER_ROW = 10;
  var ANS_PER_SHEET = 50;

  var $ = function (id) { return document.getElementById(id); };
  var ALL = (window.KANJI_DATA || []).map(function (e) {
    return { k:e[0], grade:e[1], on:e[2], kun:e[3], words:(e[4] || []).map(function (w) { return { w:w[0], r:w[1], p:w[2] }; }) };
  });
  var selectedGrade = 3;
  var isTest = false;
  var selected = new Set();
  var STORAGE_KEY = 'kanji-site-v1';
  var weak = {};
  try { var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); weak = saved.miss || {}; } catch (e) {}

  /* ---------- 小さな道具 ---------- */
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]; }); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function radio(name) { var el = document.querySelector('input[name="' + name + '"]:checked'); return el ? el.value : ''; }

  /* ---------- まだ習っていない漢字は、ひらがなで見せる（app.js と同じ考え方） ---------- */
  var G1 = '一右雨円王音下火花貝学気九休玉金空月犬見五口校左三山子四糸字耳七車手十出女小上森人水正生青夕石赤千川先早草足村大男竹中虫町天田土二日入年白八百文木本名目立力林六';
  var gradeOf = {};
  ALL.forEach(function (e) { gradeOf[e.k] = e.grade; });
  function isKanji(c) { return /[一-鿿]/.test(c); }
  function unlearned(c, grade) {
    if (!isKanji(c)) return false;
    if (gradeOf[c] !== undefined) return gradeOf[c] > grade;
    return G1.indexOf(c) < 0;
  }
  function hasUnlearned(s, grade) { for (var i = 0; i < s.length; i++) if (unlearned(s.charAt(i), grade)) return true; return false; }
  function hasKanji(s) { for (var i = 0; i < s.length; i++) if (isKanji(s.charAt(i))) return true; return false; }

  /* 例語を「漢字の前（pre）」と「うしろ（post＝送りがななど）」に分ける */
  function splitWord(q, grade) {
    var w = q.word.w, k = q.entry.k, r = q.word.r, p = q.word.p;
    var i = w.indexOf(k);
    if (i < 0) return { pre: w, post: '', found: false };
    var pre = w.slice(0, i), post = w.slice(i + 1);
    var plain = { pre: pre, post: post, found: true };
    if (!hasUnlearned(pre, grade) && !hasUnlearned(post, grade)) return plain;
    var j = r.indexOf(p);
    while (j >= 0) {
      var rPre = r.slice(0, j), rPost = r.slice(j + p.length);
      var okPre = hasKanji(pre) || pre === rPre;
      var okPost = hasKanji(post) || post === rPost;
      if (okPre && okPost) {
        return { pre: hasUnlearned(pre, grade) ? rPre : pre, post: hasUnlearned(post, grade) ? rPost : post, found: true };
      }
      j = r.indexOf(p, j + 1);
    }
    return plain;
  }

  /* ---------- 範囲・設定 ---------- */
  function pool() {
    var scope = radio('scope');
    if (scope === 'grade') return ALL.filter(function (e) { return e.grade === selectedGrade; });
    if (scope === 'review') return ALL.filter(function (e) { return e.grade <= selectedGrade; });
    if (scope === 'weak') return ALL.filter(function (e) { return e.grade <= selectedGrade && (weak[e.k] || 0) > 0; });
    return ALL.filter(function (e) { return selected.has(e.k) && e.grade <= selectedGrade; });
  }
  function wantedCount() {
    var c = radio('count') === 'custom' ? parseInt($('customCount').value, 10) : parseInt(radio('count'), 10);
    if (!isFinite(c) || c < 1) c = 10;
    return Math.min(c, 100);
  }
  function renderGrades() {
    var box = $('gradeSelect');
    box.innerHTML = '';
    for (var g = 1; g <= 6; g++) {
      var option = document.createElement('option');
      option.value = String(g);
      option.textContent = g + '年生（' + ALL.filter(function (e) { return e.grade === g; }).length + '字）';
      box.appendChild(option);
    }
    box.value = String(selectedGrade);
    box.addEventListener('change', function () {
      selectedGrade = parseInt(box.value, 10);
      renderKanji();
      updateStatus();
    });
  }
  function renderKanji() {
    var box = $('kanjiList'); box.innerHTML = '';
    ALL.filter(function (e) { return e.grade <= selectedGrade; }).forEach(function (e) {
      var label = document.createElement('label'); label.className = 'kanji-item';
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = selected.has(e.k); cb.value = e.k;
      cb.addEventListener('change', function () { if (cb.checked) selected.add(e.k); else selected.delete(e.k); updateStatus(); });
      label.appendChild(cb); label.appendChild(document.createTextNode(e.k)); box.appendChild(label);
    });
  }
  function updateStatus() {
    var n = pool().length, want = wantedCount();
    var t = '出題できる漢字：' + n + '字';
    if (n && want > n) t += '（問題数は ' + n + '問になります）';
    $('status').textContent = t;
  }

  /* ---------- 問題づくり ---------- */
  function makeQuestions() {
    var p = shuffle(pool().slice());
    var count = Math.min(wantedCount(), p.length);
    var out = [];
    var sentForm = radio('qform') === 'sentence';
    for (var i = 0; i < p.length && out.length < count; i++) {
      var e = p[i];
      var sd = sentForm && window.KANJI_SENT && window.KANJI_SENT[e.k];
      if (sd) {
        var sw = e.words.filter(function (w) { return w.w === sd[0] && w.r && w.p; })[0];
        if (sw && sd[1].indexOf(sw.w) >= 0) { out.push({ entry: e, word: sw, sent: { text: sd[1], word: sw.w }, type: 'write' }); continue; }
      }
      var words = e.words.filter(function (w) { return w.w && w.r && w.p; });
      if (!words.length) continue;
      out.push({ entry: e, word: words[Math.floor(Math.random() * words.length)], type: 'write' });
    }
    return out;
  }

  /* 1枚ごとに「上の段／下の段」へ振り分ける。両方のときは 上＝読み・下＝書き */
  function assignTypes(qs, type) {
    var pages = [];
    for (var off = 0; off < qs.length; off += perSheet) {
      var chunk = qs.slice(off, off + perSheet);
      var nRead = type === 'read' ? chunk.length : type === 'write' ? 0 : Math.ceil(chunk.length / 2);
      chunk.forEach(function (q, i) { q.type = i < nRead ? 'read' : 'write'; });
      pages.push(chunk);
    }
    return pages;
  }

  /* ---------- 1問ぶんの HTML ---------- */
  /* 縦書きは1文字ずつ積む（フォントや印刷環境に左右されない） */
  function vt(s) { return Array.from(s).map(function (c) { return '<span class="ch">' + esc(c) + '</span>'; }).join(''); }
  function sizeClass(len) { return len <= 2 ? 'sz-l' : len === 3 ? 'sz-m' : len === 4 ? 'sz-s' : len <= 6 ? 'sz-xs' : 'sz-xxs'; }
  /* 十字のますの線は、SVGで描く（印刷で細い点線が消えないように） */
  var CROSS = '<svg class="kx" viewBox="0 0 10 10" preserveAspectRatio="none" aria-hidden="true"><line x1="0" y1="5" x2="10" y2="5"/><line x1="5" y1="0" x2="5" y2="10"/></svg>';
  function kbox(inner) { return '<span class="kbox">' + CROSS + (inner || '') + '</span>'; }
  /* 短文：文の中の「ことば」の漢字を、下線の部分（書き＝ひらがな／読み＝漢字）にして、縦に並べる */
  function sentChars(q, mode) {
    var S = q.sent, i = S.text.indexOf(S.word);
    var s = splitWord(q, selectedGrade);
    var chars = [];
    function add(str, tg) { Array.from(str).forEach(function (c) { chars.push({ c: c, tg: tg }); }); }
    add(S.text.slice(0, i), false);
    if (s.found) { add(s.pre, false); if (mode === 'write') add(q.word.p, true); else add(q.entry.k, true); add(s.post, false); }
    else add(S.word, false);
    add(S.text.slice(i + S.word.length), false);
    return chars;
  }
  /* 1枚の中の字の大きさをそろえる（いちばん長い文に合わせる。2列まで） */
  var sentFs = 7;
  function setSentFs(chunk) {
    var fs = 8.5;
    chunk.forEach(function (q) {
      if (!q.sent) return;
      var n = sentChars(q, q.type).length, L = Math.ceil(n / (n <= 8 ? 1 : 2));
      fs = Math.min(fs, 66 / (Math.max(L, 8) * 1.12));
    });
    sentFs = Math.floor(fs * 10) / 10;
  }
  function sentCols(q, mode) {
    var chars = sentChars(q, mode);
    var perCol = Math.max(1, Math.floor(66 / (sentFs * 1.12)));
    var lines = Math.min(2, Math.ceil(chars.length / perCol)), L = Math.ceil(chars.length / lines);
    var cols = '';
    for (var l = 0; l < lines; l++) {
      cols += '<div class="read-word sent-col">' + chars.slice(l * L, (l + 1) * L).map(function (x) {
        var cls = 'ch' + (x.tg ? ' tg' : '') + ('。、'.indexOf(x.c) >= 0 ? ' pn' : '') + (x.c === 'ー' ? ' lv' : '');
        return '<span class="' + cls + '">' + esc(x.c) + '</span>';
      }).join('') + '</div>';
    }
    return '<div class="sent-cols" style="--sf:' + sentFs + 'mm">' + cols + '</div>';
  }
  function writeCell(q, no, answers, practice, trace) {
    if (q.sent) {
      var inl = answers === 'inline', prs = '';
      for (var pi = 0; pi < practice; pi++) prs += kbox(pi === 0 && trace ? '<span class="trace-ghost">' + esc(q.entry.k) + '</span>' : '');
      return '<div class="cell write-cell"><div class="q-number">' + no + '</div>' +
        '<div class="vt-body write">' + sentCols(q, 'write') +
        '<div class="w-ans">' + kbox(inl ? '<span class="ans">' + esc(q.entry.k) + '</span>' : '') +
        (prs ? '<div class="practice">' + prs + '</div>' : '') + '</div></div></div>';
    }
    var s = splitWord(q, selectedGrade);
    var inline = answers === 'inline';
    var tg = Array.from(q.word.p).map(function (c) { return '<span class="ch tg">' + esc(c) + '</span>'; }).join('');
    var word = s.found ? vt(s.pre) + tg + vt(s.post) : vt(q.word.w);
    var len = s.found ? (s.pre + q.word.p + s.post).length : q.word.w.length;
    var sz = sizeClass(len);
    var pr = '';
    for (var i = 0; i < practice; i++) pr += kbox(i === 0 && trace ? '<span class="trace-ghost">' + esc(q.entry.k) + '</span>' : '');
    return '<div class="cell write-cell"><div class="q-number">' + no + '</div>' +
      '<div class="vt-body write"><div class="read-word ' + sz + '">' + word + '</div>' +
      '<div class="w-ans">' + kbox(inline ? '<span class="ans">' + esc(q.entry.k) + '</span>' : '') +
      (pr ? '<div class="practice">' + pr + '</div>' : '') + '</div></div></div>';
  }
  function readCell(q, no, answers) {
    if (q.sent) {
      return '<div class="cell read-cell"><div class="q-number">' + no + '</div>' +
        '<div class="vt-body read">' + sentCols(q, 'read') +
        '<div class="read-ans-box">' + (answers === 'inline' ? '<span class="ans">' + vt(q.word.p) + '</span>' : '') + '</div></div></div>';
    }
    var s = splitWord(q, selectedGrade);
    var shown = s.found ? vt(s.pre) + '<span class="ch tg">' + esc(q.entry.k) + '</span>' + vt(s.post) : vt(q.word.w);
    var len = (s.pre + q.entry.k + s.post).length;
    var sz = sizeClass(len);
    return '<div class="cell read-cell"><div class="q-number">' + no + '</div>' +
      '<div class="vt-body read"><div class="read-word ' + sz + '">' + shown + '</div>' +
      '<div class="read-ans-box">' + (answers === 'inline' ? '<span class="ans">' + vt(q.word.p) + '</span>' : '') + '</div></div></div>';
  }

  /* ---------- 1枚ぶんの HTML ---------- */
  function sheetHtml(o) {
    return '<div class="sheet-wrap"><section class="print-sheet ' + (o.cls || '') + '">' +
      '<div class="sheet-top"><h2 class="sheet-title">' + o.title + '<small>' + o.sub + '</small></h2>' +
      '<div class="sheet-fields">' +
        '<span class="field">名前<span class="name-line"></span></span>' +
        '<span class="field date-field">日付　　　月　　　日</span>' +
        (o.score ? '<span class="field">点<span class="score-box">／ ' + o.score + '</span></span>' : '') +
      '</div></div>' + o.body + '</section></div>';
  }

  function questionSheet(chunk, startNo, pageNo, pageTotal, type, answers, practice, total, trace) {
    var no = startNo;
    setSentFs(chunk);
    var reads = chunk.filter(function (q) { return q.type === 'read'; });
    var writes = chunk.filter(function (q) { return q.type === 'write'; });
    var rowsHtml = '';
    /* 1段の問題数：10問以下は5問ずつ（大きく）。それより多いときは上下2段に等分する */
    var isMix = type === 'mix';
    var maxList = isMix ? Math.max(reads.length, writes.length) : chunk.length;
    var perRow = chunk.length <= 10 ? 5 : Math.max(5, Math.ceil(maxList / Math.ceil(maxList / PER_ROW)));
    var big = perRow <= 6;
    function row(list, label, builder) {
      if (!list.length) return;
      var cells = list.map(function (q) { return builder(q, no++); }).join('');
      for (var i = list.length; i < perRow; i++) cells += '<div class="cell empty"></div>';
      rowsHtml += '<div class="q-row-wrap">' + (label ? '<p class="row-label">' + label + '</p>' : '') + '<div class="q-row" style="grid-template-columns:repeat(' + perRow + ',1fr)">' + cells + '</div></div>';
    }
    /* 1段に入るのは、ふつう10問（大きいときは5問）。20問は上下2段に分ける */
    function rowsOf(list) { var a = []; for (var i = 0; i < list.length; i += perRow) a.push(list.slice(i, i + perRow)); return a; }
    var nRows = rowsOf(reads).length + rowsOf(writes).length;
    rowsOf(reads).forEach(function (r, i) {
      row(r, isMix ? '【読み】下線の漢字の読みを、ひらがなで書きましょう。' : '', function (q, n) { return readCell(q, n, answers); });
    });
    rowsOf(writes).forEach(function (r, i) {
      row(r, isMix ? '【書き】線の部分を、左のますに漢字で書きましょう。（送りがなは書きません）' : '', function (q, n) { return writeCell(q, n, answers, practice, trace); });
    });
    /* 練習ますの大きさ：幅と高さの両方に収まる大きさにする（mm） */
    var rowH = (193 - 18 - (isMix ? 0 : 8) - 2 * (nRows - 1)) / nRows - (isMix ? 6 : 0);
    var nBox = 1 + practice;
    var cellW = (277 - 1.6 * (perRow - 1)) / perRow - 2;
    var capW = Math.floor(cellW - (big ? 14 : 9) - (big ? 4 : 2) - 2);
    var kb = Math.min(22, Math.max(14, capW), (rowH - 11 - 1.5 * nBox) / nBox);
    kb = Math.max(8, Math.floor(kb * 2) / 2);
    var instruction = '';
    if (type === 'read') instruction = '下線の漢字の読みを、ひらがなで書きましょう。';
    if (type === 'write') instruction = '線の部分を、左のますに漢字で書きましょう。（送りがなは書きません）';
    var body = (instruction ? '<p class="sheet-instruction">' + instruction + '</p>' : '') + '<div class="q-rows' + (big ? ' big' : '') + '" style="--kb:' + kb + 'mm">' + rowsHtml + '</div>';
    var typeName = type === 'write' ? '書き' : type === 'read' ? '読み' : '読み・書き';
    var base = isTest ? '漢字テスト' : '漢字のれんしゅう';
    var title = type === 'write' ? base + '（書き）' : type === 'read' ? base + '（読み）' : base + '（読み・書き）';
    var sub = selectedGrade + '年生' + (pageTotal > 1 ? '　' + pageNo + '／' + pageTotal + '枚目' : '');
    return sheetHtml({ title: title, sub: sub, body: body, score: chunk.length });
  }

  function answerSheets(pages, type, startPage) {
    var flat = [];
    pages.forEach(function (c) { c.forEach(function (q) { flat.push(q); }); });
    var html = '', n = Math.ceil(flat.length / ANS_PER_SHEET);
    for (var off = 0; off < flat.length; off += ANS_PER_SHEET) {
      var rows = flat.slice(off, off + ANS_PER_SHEET).map(function (q, i) {
        var s = splitWord(q, selectedGrade);
        var shownWord = s.found ? s.pre + q.entry.k + s.post : q.word.w;
        var main = q.type === 'write' ? q.entry.k : q.word.p;
        var small = q.sent ? q.sent.text : shownWord;
        return '<div class="answer-row"><strong>' + (off + i + 1) + '.</strong><span class="ans-main">' + esc(main) + '</span><small>' + esc(small) + '</small></div>';
      }).join('');
      html += sheetHtml({ title: '解答', sub: selectedGrade + '年生' + (n > 1 ? '　' + (off / ANS_PER_SHEET + 1) + '／' + n : ''), cls: 'answer-sheet',
        body: '<div class="answer-list">' + rows + '</div>' });
    }
    return html;
  }

  /* ---------- 画面に出す ---------- */
  function fitPreview() {
    var out = $('paperOutput');
    var sheets = out.querySelectorAll('.print-sheet');
    if (!sheets.length) return;
    var px = 297 / 25.4 * 96;
    var z = Math.min(1, (out.clientWidth || px) / px);
    Array.prototype.forEach.call(sheets, function (s) { s.style.zoom = z; });
  }
  function clearZoom() { Array.prototype.forEach.call(document.querySelectorAll('.print-sheet'), function (s) { s.style.zoom = ''; }); }

  /* ---------- 書き順の一覧（1画ずつ増える図）：データはネットから読みこむ ---------- */
  var DATA_SOURCES = ['https://cdn.jsdelivr.net/npm/@k1low/hanzi-writer-data-jp@0/', 'https://unpkg.com/@k1low/hanzi-writer-data-jp@latest/', 'https://cdn.jsdelivr.net/npm/hanzi-writer-data-jp@0/', 'https://unpkg.com/hanzi-writer-data-jp@0/'];
  var strokeCache = {};
  function loadStrokes(k) {
    if (strokeCache[k]) return Promise.resolve(strokeCache[k]);
    var i = 0;
    function next() {
      if (i >= DATA_SOURCES.length) return Promise.resolve(null);
      var url = DATA_SOURCES[i++] + encodeURIComponent(k) + '.json';
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(next);
    }
    return next().then(function (d) { if (d && d.strokes) strokeCache[k] = d; return d && d.strokes ? d : null; });
  }
  function loadMany(ks) {
    return Promise.all(ks.map(function (k) { return loadStrokes(k).then(function (d) { return [k, d]; }); })).then(function (list) {
      var map = {}, bad = 0;
      list.forEach(function (x) { map[x[0]] = x[1]; if (!x[1]) bad++; });
      return { map: map, bad: bad };
    });
  }
  var NS = 'http://www.w3.org/2000/svg';
  function frameHtml(strokes, n) {
    var paths = '';
    for (var i = 0; i <= n; i++) paths += '<path d="' + strokes[i] + '" fill="' + (i === n ? '#d9534f' : '#333') + '"/>';
    return '<div class="o-frame"><svg viewBox="0 0 1024 1024"><g transform="translate(0,900) scale(1,-1)">' + paths + '</g></svg><i>' + (n + 1) + '</i></div>';
  }
  var O_PER_ROW = 19, O_ROWS_PER_SHEET = 10;
  function pracCell(k, ghost) { return '<div class="o-frame o-prac">' + CROSS + (ghost ? '<span class="trace-ghost">' + esc(k) + '</span>' : '') + '</div>'; }
  /* withPractice：書き順の図のあとに、なぞる練習ます（1つ目はうすい字）を並べる */
  function orderSheets(kanjis, map, withPractice, title) {
    var rows = [];
    kanjis.forEach(function (k) {
      var d = map[k];
      if (!d) { rows.push('<div class="o-row"><div class="o-label">' + esc(k) + '</div><span class="o-fail">書き順データを読みこめませんでした</span></div>'); return; }
      for (var off = 0; off < d.strokes.length; off += O_PER_ROW) {
        var cells = off === 0 ? '<div class="o-label">' + esc(k) + '</div>' : '<div class="o-label o-blank"></div>';
        var end = Math.min(d.strokes.length, off + O_PER_ROW);
        for (var n = off; n < end; n++) cells += frameHtml(d.strokes, n);
        if (withPractice && end === d.strokes.length) {
          var rest = O_PER_ROW - (end - off);
          if (rest >= 2) for (var r = 0; r < rest; r++) cells += pracCell(k, r === 0 && withPractice === 'ghost');
        }
        rows.push('<div class="o-row">' + cells + '</div>');
      }
    });
    var html = '', total = Math.ceil(rows.length / O_ROWS_PER_SHEET);
    for (var p = 0; p < total; p++) {
      html += sheetHtml({ title: title || '書き順の一覧', sub: selectedGrade + '年生' + (total > 1 ? '　' + (p + 1) + '／' + total : ''), cls: 'order-sheet',
        body: (withPractice ? '<p class="sheet-instruction">書き順を見て、うすい字をなぞってから、ますに書きましょう。</p>' : '') + '<div class="order-list">' + rows.slice(p * O_ROWS_PER_SHEET, (p + 1) * O_ROWS_PER_SHEET).join('') + '</div>' });
    }
    return html;
  }

  var building = false;
  /* 書き順プリント：問題は作らず、漢字ごとに「書き順の図＋なぞる練習ます」を並べる */
  function buildOrderOnly() {
    var p = pool().slice(), ks;
    if (!p.length) { $('status').textContent = '出題できる漢字がありません。範囲を確認してください。'; return false; }
    if (radio('scope') === 'custom') { ks = p.map(function (e) { return e.k; }).slice(0, 100); }
    else {
      var order = {}; ALL.forEach(function (e, i) { order[e.k] = i; });
      ks = shuffle(p).slice(0, Math.min(wantedCount(), p.length)).map(function (e) { return e.k; }).sort(function (a, b) { return order[a] - order[b]; });
    }
    isTest = false;
    var withPractice = 'ghost';
    building = true; $('makeBtn').disabled = true; $('status').textContent = '書き順データを読みこみ中…';
    loadMany(ks).then(function (r) {
      show(orderSheets(ks, r.map, withPractice, '書き順プリント'));
      if (r.bad) alert('書き順データを読みこめなかった漢字が ' + r.bad + ' 字あります。インターネットにつながっているか、たしかめてください。');
    }).then(function () { building = false; $('makeBtn').disabled = false; updateStatus(); },
            function () { building = false; $('makeBtn').disabled = false; });
    return true;
  }
  function show(html) {
    $('paperOutput').innerHTML = html;
    $('settings').hidden = true; $('preview').hidden = false;
    fitPreview(); window.scrollTo(0, 0);
  }
  function build() {
    if (building) return false;
    if (radio('pmode') === 'order') return buildOrderOnly();
    perSheet = radio('qform') === 'sentence' ? 10 : PER_SHEET;
    var qs = makeQuestions();
    if (!qs.length) { $('status').textContent = '出題できる漢字がありません。範囲を確認してください。'; return false; }
    var type = radio('ptype'), answers = radio('answers');
    isTest = radio('pmode') === 'test';
    var practice = isTest ? 0 : (parseInt(radio('practice'), 10) || 0);
    var trace = !isTest && $('traceFirst').checked;
    var pages = assignTypes(qs, type);
    var html = '', no = 1;
    pages.forEach(function (chunk, i) {
      html += questionSheet(chunk, no, i + 1, pages.length, type, answers, practice, qs.length, trace);
      no += chunk.length;
    });
    var tail = answers === 'separate' ? answerSheets(pages, type) : '';
    if (!$('orderSheet').checked) { show(html + tail); return true; }
    /* 書き順の一覧つき：データを読みこんでから出す */
    var ks = [];
    qs.forEach(function (q) { if (ks.indexOf(q.entry.k) < 0) ks.push(q.entry.k); });
    building = true; $('makeBtn').disabled = true; $('status').textContent = '書き順データを読みこみ中…';
    loadMany(ks).then(function (r) {
      show(html + orderSheets(ks, r.map, false) + tail);
      if (r.bad) alert('書き順データを読みこめなかった漢字が ' + r.bad + ' 字あります。インターネットにつながっているか、たしかめてください。');
    }).then(function () { building = false; $('makeBtn').disabled = false; updateStatus(); },
            function () { building = false; $('makeBtn').disabled = false; });
    return true;
  }

  /* ---------- ボタンの配線 ---------- */
  $('makeBtn').addEventListener('click', build);
  $('regenBtn').addEventListener('click', build);
  /* iPhone・iPad（Safari）は「横向き」の指定が効かず、縦向きの用紙に出てしまう。
     そのときは、紙を縦向きにして、内容を90度まわして印刷する */
  function setPageRule() {
    var rot = $('rotPrint').checked;
    document.body.classList.toggle('rot-print', rot);
    var st = $('pageRule');
    if (!st) { st = document.createElement('style'); st.id = 'pageRule'; document.head.appendChild(st); }
    st.textContent = '@page { size: ' + (rot ? 'A4 portrait' : 'A4 landscape') + '; margin: 0; }';
  }
  try { if (/iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) $('rotPrint').checked = true; } catch (e) {}
  $('rotPrint').addEventListener('change', setPageRule);
  $('printBtn').addEventListener('click', function () { setPageRule(); clearZoom(); window.print(); setTimeout(fitPreview, 300); });
  $('editBtn').addEventListener('click', function () { $('preview').hidden = true; $('settings').hidden = false; window.scrollTo(0, 0); });
  window.addEventListener('beforeprint', clearZoom);
  window.addEventListener('afterprint', fitPreview);
  window.addEventListener('resize', fitPreview);

  document.querySelectorAll('input[name="pmode"]').forEach(function (el) {
    el.addEventListener('change', function () {
      var m = radio('pmode');
      $('practiceBlock').hidden = m !== 'practice';
      $('typeBlock').hidden = m === 'order'; $('orderBlock').hidden = m === 'order'; $('answersBlock').hidden = m === 'order';
      $('countTitle').textContent = m === 'order' ? '5. 漢字の数（「漢字を選んで範囲を指定」のときは、選んだ漢字すべて）' : '5. 問題数（1枚20問まで。超えると2枚目以降に続きます）';
    });
  });
  document.querySelectorAll('input[name="scope"]').forEach(function (el) {
    el.addEventListener('change', function () { $('kanjiPicker').hidden = radio('scope') !== 'custom'; updateStatus(); });
  });
  document.querySelectorAll('input[name="count"]').forEach(function (el) { el.addEventListener('change', updateStatus); });
  $('customCount').addEventListener('input', function () {
    var r = document.querySelector('input[name="count"][value="custom"]'); if (r) r.checked = true; updateStatus();
  });
  $('selectAll').addEventListener('click', function () { ALL.filter(function (e) { return e.grade <= selectedGrade; }).forEach(function (e) { selected.add(e.k); }); renderKanji(); updateStatus(); });
  $('clearAll').addEventListener('click', function () { selected.clear(); renderKanji(); updateStatus(); });
  renderGrades(); renderKanji(); updateStatus();
  /* にがて漢字のページから来たとき：範囲を「にがて漢字」にする */
  try {
    if (new URLSearchParams(location.search).get('weak')) {
      var mg = ALL.reduce(function (m, e) { return (weak[e.k] || 0) > 0 ? Math.max(m, e.grade) : m; }, 0);
      if (mg) {
        selectedGrade = mg; $('gradeSelect').value = String(mg);
        var wr = document.querySelector('input[name="scope"][value="weak"]'); if (wr) wr.checked = true;
        renderKanji(); updateStatus();
      }
    }
  } catch (e) {}
})();
