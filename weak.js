(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var STORAGE_KEY = 'kanji-site-v1';
  var ALL = (window.KANJI_DATA || []).map(function (e) { return { k: e[0], grade: e[1] }; });
  var gradeOf = {}; ALL.forEach(function (e) { gradeOf[e.k] = e.grade; });
  var store = { miss: {}, settings: {} };
  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      if (s && typeof s === 'object') store = s;
    } catch (e) {}
    if (!store.miss || typeof store.miss !== 'object') store.miss = {};
    if (!store.settings || typeof store.settings !== 'object') store.settings = {};
    /* 知らない漢字・0回以下は捨てる */
    Object.keys(store.miss).forEach(function (k) { if (gradeOf[k] === undefined || !(store.miss[k] > 0)) delete store.miss[k]; });
  }
  function save() { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(store)); } catch (e) {} }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function weakList() {
    return ALL.filter(function (e) { return store.miss[e.k] > 0; });
  }
  function chip(e) {
    return '<span class="weak-chip"><a href="trace.html?k=' + encodeURIComponent(e.k) + '" aria-label="' + esc(e.k) + 'の書き順">' + esc(e.k) + '</a>' +
      '<span class="cnt">×' + store.miss[e.k] + '</span>' +
      '<button type="button" class="x" data-k="' + esc(e.k) + '" aria-label="' + esc(e.k) + 'を消す">✕</button></span>';
  }
  function render() {
    var list = weakList();
    $('weakSummary').textContent = list.length ? 'にがて漢字：' + list.length + '字' : 'にがて漢字は まだ ありません';
    $('quizBtn').disabled = $('printBtn').disabled = $('clearBtn').disabled = !list.length;
    var box = $('weakList');
    if (!list.length) {
      box.innerHTML = '<p class="weak-empty">クイズでまちがえた漢字が、ここに たまります。</p>';
    } else if (document.querySelector('input[name="sort"]:checked').value === 'count') {
      var by = list.slice().sort(function (a, b) { return store.miss[b.k] - store.miss[a.k] || a.grade - b.grade; });
      box.innerHTML = '<div class="weak-chips">' + by.map(chip).join('') + '</div>';
    } else {
      var html = '';
      for (var g = 1; g <= 6; g++) {
        var gl = list.filter(function (e) { return e.grade === g; });
        if (gl.length) html += '<div class="weak-grade">' + g + '年生（' + gl.length + '字）</div><div class="weak-chips">' + gl.map(chip).join('') + '</div>';
      }
      box.innerHTML = html;
    }
    $('exportBox').value = makeCode();
  }

  /* ---------- クイズ・プリントへ ---------- */
  function maxGrade() { return weakList().reduce(function (m, e) { return Math.max(m, e.grade); }, 1); }
  $('quizBtn').addEventListener('click', function () {
    store.settings.grade = maxGrade(); store.settings.range = 'weak'; save();
    location.href = 'index.html';
  });
  $('printBtn').addEventListener('click', function () { location.href = 'print.html?weak=1'; });

  $('weakList').addEventListener('click', function (ev) {
    var b = ev.target.closest ? ev.target.closest('.x') : null;
    if (!b) return;
    delete store.miss[b.getAttribute('data-k')]; save(); render();
  });
  $('clearBtn').addEventListener('click', function () {
    if (!window.confirm('にがて漢字の記録を、ぜんぶ消します。よろしいですか？')) return;
    store.miss = {}; save(); render();
  });
  Array.prototype.forEach.call(document.querySelectorAll('input[name="sort"]'), function (r) { r.addEventListener('change', render); });

  /* ---------- 書き出し・読みこみ ---------- */
  function makeCode() {
    var json = JSON.stringify({ v: 1, miss: store.miss });
    try { return 'KJ1:' + btoa(unescape(encodeURIComponent(json))); } catch (e) { return json; }
  }
  function parseCode(text) {
    text = String(text || '').trim();
    if (!text) throw new Error('empty');
    var json = text;
    if (text.indexOf('KJ1:') === 0) json = decodeURIComponent(escape(atob(text.slice(4).replace(/\s+/g, ''))));
    var o = JSON.parse(json);
    if (!o || typeof o.miss !== 'object') throw new Error('format');
    return o.miss;
  }
  function msg(t) { $('backupMsg').textContent = t; }
  function doImport(text) {
    var m;
    try { m = parseCode(text); } catch (e) { msg('読みこめませんでした。コードを、まるごと貼りつけたか確かめてください。'); return; }
    var added = 0, up = 0;
    Object.keys(m).forEach(function (k) {
      var n = Math.min(5, Math.floor(Number(m[k])));
      if (gradeOf[k] === undefined || !(n > 0)) return;
      if (!(store.miss[k] > 0)) { store.miss[k] = n; added++; }
      else if (n > store.miss[k]) { store.miss[k] = n; up++; }
    });
    save(); render();
    msg(added + '字を足しました' + (up ? '（' + up + '字は回数を更新）' : '') + '。');
  }
  $('importBtn').addEventListener('click', function () { doImport($('importBox').value); });
  $('importFile').addEventListener('change', function () {
    var f = this.files && this.files[0]; if (!f) return;
    var r = new FileReader(); r.onload = function () { doImport(r.result); }; r.readAsText(f);
    this.value = '';
  });
  $('copyBtn').addEventListener('click', function () {
    var t = $('exportBox').value;
    function fallback() { var b = $('exportBox'); b.focus(); b.select(); try { document.execCommand('copy'); msg('コピーしました。'); } catch (e) { msg('コードを長押ししてコピーしてください。'); } }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(function () { msg('コピーしました。'); }, fallback);
    else fallback();
  });
  $('dlBtn').addEventListener('click', function () {
    var blob = new Blob([JSON.stringify({ v: 1, miss: store.miss }, null, 1)], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'kanji-nigate.json';
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    msg('ファイルを保存しました。');
  });

  load(); render();
})();
