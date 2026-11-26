(function () {
  'use strict';
  var PER_SHEET = 20;   /* 1枚の最大問題数（横10列 × 縦2段） */
  var PER_ROW = 10;
  var ANS_PER_SHEET = 50;

  var $ = function (id) { return document.getElementById(id); };
  var ALL = (window.KANJI_DATA || []).map(function (e) {
    return { k:e[0], grade:e[1], on:e[2], kun:e[3], words:(e[4] || []).map(function (w) { return { w:w[0], r:w[1], p:w[2] }; }) };
  });
  var selectedGrade = 3;
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
    for (var i = 0; i < p.length && out.length < count; i++) {
      var e = p[i];
      var words = e.words.filter(function (w) { return w.w && w.r && w.p; });
      if (!words.length) continue;
      out.push({ entry: e, word: words[Math.floor(Math.random() * words.length)], type: 'write' });
    }
    return out;
  }

  /* 1枚ごとに「上の段／下の段」へ振り分ける。両方のときは 上＝読み・下＝書き */
  function assignTypes(qs, type) {
    var pages = [];
    for (var off = 0; off < qs.length; off += PER_SHEET) {
      var chunk = qs.slice(off, off + PER_SHEET);
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
  function writeCell(q, no, answers, practice, trace) {
    var s = splitWord(q, selectedGrade);
    var inline = answers === 'inline';
    var tg = Array.from(q.word.p).map(function (c) { return '<span class="ch tg">' + esc(c) + '</span>'; }).join('');
    var word = s.found ? vt(s.pre) + tg + vt(s.post) : vt(q.word.w);
    var len = s.found ? (s.pre + q.word.p + s.post).length : q.word.w.length;
    var sz = sizeClass(len);
    var pr = '';
    for (var i = 0; i < practice; i++) pr += '<span class="kbox">' + (i === 0 && trace ? '<span class="trace-ghost">' + esc(q.entry.k) + '</span>' : '') + '</span>';
    return '<div class="cell write-cell"><div class="q-number">' + no + '</div>' +
      '<div class="vt-body write"><div class="read-word ' + sz + '">' + word + '</div>' +
      '<div class="w-ans"><span class="kbox">' + (inline ? '<span class="ans">' + esc(q.entry.k) + '</span>' : '') + '</span>' +
      (pr ? '<div class="practice">' + pr + '</div>' : '') + '</div></div></div>';
  }
  function readCell(q, no, answers) {
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
    return '<section class="print-sheet ' + (o.cls || '') + '">' +
      '<div class="sheet-top"><h2 class="sheet-title">' + o.title + '<small>' + o.sub + '</small></h2>' +
      '<div class="sheet-fields">' +
        '<span class="field">名前<span class="name-line"></span></span>' +
        '<span class="field date-field">日付　　　月　　　日</span>' +
        (o.score ? '<span class="field">点<span class="score-box">／ ' + o.score + '</span></span>' : '') +
      '</div></div>' + o.body + '</section>';
  }

  function questionSheet(chunk, startNo, pageNo, pageTotal, type, answers, practice, total, trace) {
    var no = startNo;
    var reads = chunk.filter(function (q) { return q.type === 'read'; });
    var writes = chunk.filter(function (q) { return q.type === 'write'; });
    var rowsHtml = '';
    /* 10問以下のときは、1段5問にして、ますや字を大きくする */
    var big = chunk.length <= 10;
    var perRow = big ? 5 : PER_ROW;
    function row(list, label, builder) {
      if (!list.length) return;
      var cells = list.map(function (q) { return builder(q, no++); }).join('');
      for (var i = list.length; i < perRow; i++) cells += '<div class="cell empty"></div>';
      rowsHtml += '<div class="q-row-wrap">' + (label ? '<p class="row-label">' + label + '</p>' : '') + '<div class="q-row" style="grid-template-columns:repeat(' + perRow + ',1fr)">' + cells + '</div></div>';
    }
    /* 1段に入るのは、ふつう10問（大きいときは5問）。20問は上下2段に分ける */
    function rowsOf(list) { var a = []; for (var i = 0; i < list.length; i += perRow) a.push(list.slice(i, i + perRow)); return a; }
    var isMix = type === 'mix';
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
    var kb = Math.min(big ? 22 : 14, (rowH - 11 - 1.5 * nBox) / nBox);
    kb = Math.max(8, Math.floor(kb * 2) / 2);
    var instruction = '';
    if (type === 'read') instruction = '下線の漢字の読みを、ひらがなで書きましょう。';
    if (type === 'write') instruction = '線の部分を、左のますに漢字で書きましょう。（送りがなは書きません）';
    var body = (instruction ? '<p class="sheet-instruction">' + instruction + '</p>' : '') + '<div class="q-rows' + (big ? ' big' : '') + '" style="--kb:' + kb + 'mm">' + rowsHtml + '</div>';
    var typeName = type === 'write' ? '書き' : type === 'read' ? '読み' : '読み・書き';
    var title = type === 'write' ? '漢字のれんしゅう（書き）' : type === 'read' ? '漢字のれんしゅう（読み）' : '漢字のれんしゅう（読み・書き）';
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
        var small = q.type === 'write' ? shownWord : shownWord;
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

  function build() {
    var qs = makeQuestions();
    if (!qs.length) { $('status').textContent = '出題できる漢字がありません。範囲を確認してください。'; return false; }
    var type = radio('ptype'), answers = radio('answers');
    var practice = parseInt(radio('practice'), 10) || 0;
    var trace = $('traceFirst').checked;
    var pages = assignTypes(qs, type);
    var html = '', no = 1;
    pages.forEach(function (chunk, i) {
      html += questionSheet(chunk, no, i + 1, pages.length, type, answers, practice, qs.length, trace);
      no += chunk.length;
    });
    if (answers === 'separate') html += answerSheets(pages, type);
    $('paperOutput').innerHTML = html;
    $('settings').hidden = true; $('preview').hidden = false;
    fitPreview(); window.scrollTo(0, 0);
    return true;
  }

  /* ---------- ボタンの配線 ---------- */
  $('makeBtn').addEventListener('click', build);
  $('regenBtn').addEventListener('click', build);
  $('printBtn').addEventListener('click', function () { clearZoom(); window.print(); setTimeout(fitPreview, 300); });
  $('editBtn').addEventListener('click', function () { $('preview').hidden = true; $('settings').hidden = false; window.scrollTo(0, 0); });
  window.addEventListener('beforeprint', clearZoom);
  window.addEventListener('afterprint', fitPreview);
  window.addEventListener('resize', fitPreview);

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
})();
