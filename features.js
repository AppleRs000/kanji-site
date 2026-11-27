/* 書き順の機能（外部の書き順データを使う機能）のオン・オフ。はじめはオフ。
   オフのあいだは、書き順に関する画面・ボタンをかくし、外部データも読みこまない。 */
(function () {
  'use strict';
  var KEY = 'kanji-site-features-v1';
  var DEFAULT_ON = false;   /* 公開版で最初からオンにしたいときは true */
  var on = DEFAULT_ON;
  try { var s = JSON.parse(localStorage.getItem(KEY)); if (s && typeof s.stroke === 'boolean') on = s.stroke; } catch (e) {}
  window.KFeat = {
    stroke: on,
    setStroke: function (v) { try { localStorage.setItem(KEY, JSON.stringify({ stroke: !!v })); } catch (e) {} }
  };
  var SHOW_SAVE_ALL = false;   /* 「書き順データをぜんぶ保存する」ボタンを出すか（公開版では隠す） */
  var root = document.documentElement;
  if (!SHOW_SAVE_ALL) root.classList.add('no-saveall');
  root.classList.add(on ? 'stroke-on' : 'stroke-off');
  /* オンのときだけ、書き順の表示ライブラリを読みこむ（同期で読みこみ、あとのスクリプトより先に使えるようにする） */
  if (on) document.write('<script src="https://cdn.jsdelivr.net/npm/hanzi-writer@3.5.0/dist/hanzi-writer.min.js"><\/script>');
})();
