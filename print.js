(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var ALL = (window.KANJI_DATA || []).map(function (e) {
    return { k:e[0], grade:e[1], on:e[2], kun:e[3], words:(e[4] || []).map(function(w){return {w:w[0],r:w[1],p:w[2]};}) };
  });
  var selectedGrade = 3;
  var selected = new Set();
  var STORAGE_KEY = 'kanji-site-v1';
  var weak = {};
  try { var saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); weak = saved.miss || {}; } catch(e) {}

  function esc(s) { return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function shuffle(a) { for(var i=a.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=a[i];a[i]=a[j];a[j]=t;} return a; }
  function radio(name) { var el=document.querySelector('input[name="'+name+'"]:checked'); return el ? el.value : ''; }
  function pool() {
    var scope=radio('scope');
    if(scope==='grade') return ALL.filter(function(e){return e.grade===selectedGrade;});
    if(scope==='review') return ALL.filter(function(e){return e.grade<=selectedGrade;});
    if(scope==='weak') return ALL.filter(function(e){return e.grade<=selectedGrade && (weak[e.k]||0)>0;});
    return ALL.filter(function(e){return selected.has(e.k) && e.grade<=selectedGrade;});
  }
  function renderGrades() {
    var box=$('gradeSelect'); box.innerHTML='';
    for(var g=1;g<=6;g++){
      var b=document.createElement('button'); b.type='button'; b.className='choice'+(g===selectedGrade?' selected':'');
      b.innerHTML='<span class="main">'+g+'年生</span><span class="sub">'+ALL.filter(function(e){return e.grade===g;}).length+'字</span>';
      b.addEventListener('click',function(n){return function(){selectedGrade=n;renderGrades();renderKanji();updateStatus();};}(g));
      box.appendChild(b);
    }
  }
  function renderKanji() {
    var box=$('kanjiList'); box.innerHTML='';
    ALL.filter(function(e){return e.grade<=selectedGrade;}).forEach(function(e){
      var label=document.createElement('label'); label.className='kanji-item';
      var cb=document.createElement('input'); cb.type='checkbox'; cb.checked=selected.has(e.k); cb.value=e.k;
      cb.addEventListener('change',function(){if(cb.checked)selected.add(e.k);else selected.delete(e.k);updateStatus();});
      label.appendChild(cb); label.appendChild(document.createTextNode(e.k)); box.appendChild(label);
    });
  }
  function updateStatus() {
    var p=pool(); $('status').textContent='出題できる漢字：'+p.length+'字';
  }
  function makeQuestions() {
    var p=shuffle(pool().slice());
    var type=radio('ptype');
    var count=radio('count')==='custom' ? parseInt($('customCount').value,10) : parseInt(radio('count'),10);
    if(!Number.isFinite(count)||count<1) count=10;
    count=Math.min(count,200);
    if(!p.length) return [];
    var out=[];
    for(var i=0;i<count;i++){
      var e=p[i%p.length];
      var words=e.words.filter(function(w){return w.w && w.r && w.p;});
      if(!words.length) continue;
      var w=words[Math.floor(Math.random()*words.length)];
      var t=type==='mix' ? (i%2===0?'write':'read') : type;
      out.push({entry:e,word:w,type:t});
    }
    return out;
  }
  function writeItem(q,i,answers) {
    var prompt=q.word.p;
    return '<div class="write-item"><div class="q-number">'+(i+1)+'</div><div class="write-content"><div class="write-prompt">'+esc(prompt)+'</div><div class="practice-box"></div>'+(answers==='inline'?'<span class="inline-answer">答え：'+esc(q.entry.k)+'</span>':'')+'</div></div>';
  }
  function readItem(q,i,answers) {
    var w=q.word.w, k=q.entry.k, pos=w.indexOf(k);
    var shown=pos<0?esc(w):esc(w.slice(0,pos))+'<u>'+esc(k)+'</u>'+esc(w.slice(pos+1));
    return '<div class="read-item"><span class="read-number">('+ (i+1) +')</span><span class="read-word">'+shown+'</span>　（<span class="read-blank"></span>）'+(answers==='inline'?'<span class="inline-answer">答え：'+esc(q.word.r)+'</span>':'')+'</div>';
  }
  function page(title,sub,content,extra) {
    return '<section class="print-sheet '+(extra||'')+'"><h2 class="sheet-title">'+title+'</h2><div class="sheet-meta"><span>'+sub+'</span><span>日付：　　月　　日</span></div><div class="sheet-meta"><span>名前：<span class="name-line"></span></span></div>'+content+'</section>';
  }
  function renderPrint(qs) {
    var answers=radio('answers'), type=radio('ptype');
    var isWrite=type==='write', isRead=type==='read';
    var title=isWrite?'漢字のれんしゅう':isRead?'漢字の読み':'漢字の読み書き';
    var instruction=isWrite?'ひらがなを漢字に直して、ていねいに書きましょう。':isRead?'漢字の読みを、ひらがなで書きましょう。':'問題に合わせて、読みや漢字を書きましょう。';
    var chunkSize=isWrite?7:(isRead?18:8);
    var pages=[];
    for(var offset=0;offset<qs.length;offset+=chunkSize){
      var chunk=qs.slice(offset,offset+chunkSize);
      var content='<div class="worksheet-body"><p class="instruction">'+instruction+'</p>';
      if(isWrite) content+='<div class="write-grid">'+chunk.map(function(q,j){return writeItem(q,offset+j,answers);}).join('')+'</div>';
      else if(isRead) content+='<div class="read-grid">'+chunk.map(function(q,j){return readItem(q,offset+j,answers);}).join('')+'</div>';
      else {
        content+='<div class="write-grid">'+chunk.map(function(q,j){return q.type==='write'?writeItem(q,offset+j,answers):readItem(q,offset+j,answers);}).join('')+'</div>';
      }
      content+='</div>';\n      pages.push(page(title,selectedGrade+'年生・'+(isWrite?'書き':isRead?'読み':'読み書き')+'　全'+qs.length+'問',content,''));
    }
    var html=pages.join('');
    if(answers==='separate'){
      var rows=qs.map(function(q,i){return '<div class="answer-row"><strong>'+(i+1)+'.</strong>'+esc(q.type==='write'?q.entry.k:q.word.r)+'</div>';}).join('');
      html+=page('解答',selectedGrade+'年生・解答', '<div class="answer-list">'+rows+'</div>','answer-sheet');
    }
    $('paperOutput').innerHTML=html;
    $('settings').hidden=true; $('preview').hidden=false; window.scrollTo(0,0);
  }
  $('makeBtn').addEventListener('click',function(){
    var qs=makeQuestions();
    if(!qs.length){$('status').textContent='出題できる漢字がありません。範囲を確認してください。';return;}
    renderPrint(qs);
  });
  $('printBtn').addEventListener('click',function(){window.print();});
  $('editBtn').addEventListener('click',function(){$('preview').hidden=true;$('settings').hidden=false;window.scrollTo(0,0);});
  document.querySelectorAll('input[name="scope"]').forEach(function(el){el.addEventListener('change',function(){$('kanjiPicker').hidden=radio('scope')!=='custom';updateStatus();});});
  document.querySelectorAll('input[name="ptype"]').forEach(function(el){el.addEventListener('change',updateStatus);});
  document.querySelectorAll('input[name="count"]').forEach(function(el){el.addEventListener('change',function(){$('customCount').disabled=radio('count')!=='custom';});});
  $('customCount').disabled=true;
  $('customCount').addEventListener('input',function(){var r=document.querySelector('input[name="count"][value="custom"]'); if(r)r.checked=true;});
  var custom=document.createElement('input'); custom.type='radio'; custom.name='count'; custom.value='custom'; custom.id='customCountRadio';
  var label=document.querySelector('.custom-count'); label.insertBefore(custom,label.firstChild);
  custom.addEventListener('change',function(){$('customCount').disabled=false;});
  $('selectAll').addEventListener('click',function(){ALL.filter(function(e){return e.grade<=selectedGrade;}).forEach(function(e){selected.add(e.k);});renderKanji();updateStatus();});
  $('clearAll').addEventListener('click',function(){selected.clear();renderKanji();updateStatus();});
  renderGrades(); renderKanji(); updateStatus();
})();