(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ALL = (window.KANJI_DATA || []).map(function (e) {
    return { k: e[0], grade: e[1], on: e[2], kun: e[3], words: (e[4] || []).map(function (w) { return { w: w[0], r: w[1], p: w[2] }; }) };
  });
  var DONE_KEY = 'kanji-site-trace-v1';
  var SOURCES = [
    'https://cdn.jsdelivr.net/npm/@k1low/hanzi-writer-data-jp@0/',
    'https://unpkg.com/@k1low/hanzi-writer-data-jp@latest/',
    'https://cdn.jsdelivr.net/npm/hanzi-writer-data-jp@0/',
    'https://unpkg.com/hanzi-writer-data-jp@0/'
  ];
  var cache = {};      /* 漢字 → 書き順データ */
  var grade = 3, cur = null, writer = null, mode = 'idle', token = 0;
  var done = {};
  try { done = JSON.parse(localStorage.getItem(DONE_KEY) || '{}') || {}; } catch (e) { done = {}; }
  function saveDone() { try { localStorage.setItem(DONE_KEY, JSON.stringify(done)); } catch (e) {} }

  function gradeList(g) { return ALL.filter(function (e) { return e.grade === g; }); }
  function find(k) { for (var i = 0; i < ALL.length; i++) if (ALL[i].k === k) return ALL[i]; return null; }
  function say(text, cls) { var m = $('traceMsg'); m.textContent = text; m.className = 'trace-msg' + (cls ? ' ' + cls : ''); }

  /* ---------- 書き順データ（ネットから読みこむ） ---------- */
  function loadData(k) {
    if (cache[k]) return Promise.resolve(cache[k]);
    var i = 0;
    function next() {
      if (i >= SOURCES.length) return Promise.reject(new Error('load failed'));
      var url = SOURCES[i++] + encodeURIComponent(k) + '.json';
      return fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }).catch(next);
    }
    return next().then(function (d) { cache[k] = d; return d; });
  }
  function charDataLoader(char, onLoad, onError) { loadData(char).then(onLoad, onError); }

  /* ---------- 画面 ---------- */
  function renderGrades() {
    var box = $('gradeSelect'); box.innerHTML = '';
    for (var g = 1; g <= 6; g++) {
      var o = document.createElement('option'); o.value = String(g);
      o.textContent = g + '年生（' + gradeList(g).length + '字）'; box.appendChild(o);
    }
    box.value = String(grade);
    box.addEventListener('change', function () { grade = parseInt(box.value, 10); renderList(); select(gradeList(grade)[0].k); });
  }
  function renderList() {
    var box = $('kanjiList'); box.innerHTML = '';
    gradeList(grade).forEach(function (e) {
      var b = document.createElement('button'); b.type = 'button'; b.className = 't-kanji'; b.textContent = e.k; b.dataset.k = e.k;
      b.setAttribute('aria-label', e.k);
      if (done[e.k]) b.classList.add('done');
      b.addEventListener('click', function () { select(e.k); });
      box.appendChild(b);
    });
    markCurrent();
  }
  function markCurrent() {
    Array.prototype.forEach.call(document.querySelectorAll('.t-kanji'), function (b) {
      b.classList.toggle('current', cur && b.dataset.k === cur.k);
      b.classList.toggle('done', !!done[b.dataset.k]);
    });
    var c = document.querySelector('.t-kanji.current');
    if (c && c.scrollIntoView) { try { c.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {} }
  }

  function readingHtml(e) {
    var parts = [];
    if (e.on && e.on !== '-') parts.push('音　<b>' + esc(e.on.split('・').join('、')) + '</b>');
    if (e.kun && e.kun !== '-') parts.push('訓　<b>' + esc(e.kun.split('・').join('、')) + '</b>');
    return parts.join('<br>');
  }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function destroyWriter() {
    if (writer) { try { writer.cancelQuiz(); } catch (e) {} }
    writer = null; $('writer').innerHTML = '';
  }

  function select(k) {
    var e = find(k); if (!e) return;
    cur = e; mode = 'idle'; token++;
    if (e.grade !== grade) { grade = e.grade; $('gradeSelect').value = String(grade); renderList(); }
    markCurrent();
    $('bigKanji').textContent = e.k;
    $('infoReading').innerHTML = readingHtml(e);
    $('infoWords').textContent = e.words.slice(0, 3).map(function (w) { return w.w + '（' + w.r + '）'; }).join('　');
    $('infoStrokes').textContent = '';
    $('strip').innerHTML = '';
    destroyWriter();
    if (typeof HanziWriter === 'undefined') { say('書き順の部品（Hanzi Writer）を読みこめませんでした。インターネットにつないで、ページを開きなおしてね。', 'warn'); return; }
    say('よみこみ中…');
    var my = token;
    writer = HanziWriter.create('writer', e.k, {
      width: $('writer').clientWidth || 300, height: $('writer').clientHeight || 300, padding: 14,
      showOutline: true, showCharacter: true,
      strokeColor: '#222', outlineColor: '#d8d8d8', highlightColor: '#2f7d6d', drawingColor: '#2f7d6d', drawingWidth: 9,
      strokeAnimationSpeed: 1.1, delayBetweenStrokes: 300, delayBetweenLoops: 900,
      charDataLoader: charDataLoader,
      onLoadCharDataError: function () { if (my === token) say('書き順データを読みこめませんでした。インターネットにつながっているか、たしかめてね。', 'warn'); },
      onLoadCharDataSuccess: function () { if (my === token) say('「みてみよう」で書き順を見てから、なぞってみよう。'); }
    });
    loadData(e.k).then(function (d) {
      if (my !== token) return;
      $('infoStrokes').textContent = (d.strokes ? d.strokes.length : '?') + '画';
      renderStrip(d);
    }, function () {});
  }

  /* ---------- 書き順の一覧（1画ずつ増えていく） ---------- */
  function renderStrip(d) {
    var box = $('strip'); box.innerHTML = '';
    if (!d || !d.strokes) return;
    var NS = 'http://www.w3.org/2000/svg';
    d.strokes.forEach(function (_, n) {
      var frame = document.createElement('div'); frame.className = 'stroke-frame';
      var svg = document.createElementNS(NS, 'svg'); svg.setAttribute('viewBox', '0 0 1024 1024');
      var g = document.createElementNS(NS, 'g'); g.setAttribute('transform', 'translate(0, 900) scale(1, -1)');
      d.strokes.forEach(function (p, i) {
        if (i > n) return;
        var path = document.createElementNS(NS, 'path'); path.setAttribute('d', p);
        path.setAttribute('fill', i === n ? '#d9534f' : '#333'); g.appendChild(path);
      });
      svg.appendChild(g); frame.appendChild(svg);
      var no = document.createElement('span'); no.textContent = String(n + 1); frame.appendChild(no);
      box.appendChild(frame);
    });
  }

  /* ---------- ボタン ---------- */
  function ready() { if (!writer) { say('書き順の部品を読みこめていません。インターネットにつないでね。', 'warn'); return false; } return true; }
  function stopAll() { try { writer.cancelQuiz(); } catch (e) {} try { writer.pauseAnimation && writer.pauseAnimation(); } catch (e) {} }

  function watch() {
    if (!ready()) return;
    stopAll(); mode = 'watch';
    writer.showOutline(); writer.hideCharacter();
    say('書き順を見てね。');
    var my = token;
    writer.animateCharacter({ onComplete: function () { if (my === token) { writer.showCharacter(); say('こんな順番で書くよ。つぎは「なぞってみよう」！'); } } });
  }
  function quiz(withOutline) {
    if (!ready()) return;
    stopAll(); mode = withOutline ? 'trace' : 'free';
    writer.hideCharacter();
    if (withOutline) writer.showOutline(); else writer.hideOutline();
    say(withOutline ? 'うすい字を、画の順になぞってね。' : '書き順をおもい出して、書いてみよう。まちがえたら、ヒントが出るよ。');
    var my = token, e = cur;
    writer.quiz({
      showOutline: withOutline, leniency: 1.2, showHintAfterMisses: withOutline ? 1 : 3, highlightOnComplete: true,
      onCorrectStroke: function (s) { if (my === token) say((s.strokeNum + 1) + '画め、いいね！' + (s.strokesRemaining ? ' つぎの画を書いてね。' : ''), 'good'); },
      onMistake: function (s) { if (my === token) say('おしい！ もういちど、' + (s.strokeNum + 1) + '画めを書いてみよう。', 'warn'); },
      onComplete: function (s) {
        if (my !== token) return;
        var miss = s && s.totalMistakes || 0;
        say(miss === 0 ? 'ぜんぶ せいかい！ よくできました！' : '書けたね！ まちがいは ' + miss + 'かい。もういちど やってみよう。', 'good');
        if (miss === 0 || withOutline) { done[e.k] = 1; saveDone(); markCurrent(); }
        writer.showOutline();
      }
    });
  }
  function step(d) {
    var list = gradeList(grade), i = list.findIndex(function (e) { return e.k === cur.k; });
    i = (i + d + list.length) % list.length; select(list[i].k);
  }

  $('watchBtn').addEventListener('click', watch);
  $('traceBtn').addEventListener('click', function () { quiz(true); });
  $('freeBtn').addEventListener('click', function () { quiz(false); });
  $('prevBtn').addEventListener('click', function () { step(-1); });
  $('nextBtn').addEventListener('click', function () { step(1); });

  renderGrades();
  var q = new URLSearchParams(location.search).get('k');
  var start = q && find(q.charAt(0));
  if (start) grade = start.grade;
  $('gradeSelect').value = String(grade);
  renderList();
  select(start ? start.k : gradeList(grade)[0].k);
})();
