'use strict';
const DATA = JSON.parse(document.getElementById('study-data').textContent);
const ASSETS = JSON.parse(document.getElementById('embedded-assets').textContent);
const $ = s => document.querySelector(s);
const escapeHTML = x => String(x ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const units = Object.fromEntries(DATA.units.map(u => [u.id,u]));
const questions = Object.fromEntries(DATA.questions.map(q => [q.id,q]));
const STATS = DATA.stats;
function matchesExam(q, exam) { return q.exam===exam || (q.additionalSources||[]).some(source=>source.exam===exam); }
const KEY = 'probability-review-v1';
let records = {}, selectedUnit = 'all', selectedView = 'bank', filtered = [], currentRandom = null, imageFiles = [], imagePosition = 0, pdfURL = null, toastTimer;
function cleanRecords(input) {
 const result = {};
 if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('紀錄格式不正確');
 for (const q of DATA.questions) {
  const r = input[q.id];
  if (r && typeof r === 'object' && !Array.isArray(r)) result[q.id] = {done:r.done===true,star:r.star===true,note:typeof r.note==='string'?r.note.slice(0,5000):''};
 }
 return result;
}
try { records = cleanRecords(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { $('#storageNote').style.display = 'block'; }
function getRecord(id) { return records[id] || {done:false,star:false,note:''}; }
function save() { try {localStorage.setItem(KEY,JSON.stringify(records));} catch {$('#storageNote').style.display='block';} }
function toast(message) {$('#toast').textContent=message;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),2600);}
function updateProgress() {
 const n=DATA.questions.filter(q=>getRecord(q.id).done).length;
 $('#masteredTotal').textContent=n;
 $('#progressText').textContent=`已熟練 ${n} / ${DATA.questions.length} 題`;
 $('#progressFill').style.width=`${n/DATA.questions.length*100}%`;
 $('#remainingLabel').textContent=n===0?'今天從一題開始':n===DATA.questions.length?'所有題目都已標記熟練！':`還有 ${DATA.questions.length-n} 題，照自己的步調`;
}
function renderNav() {
 const button = u => `<button data-unit="${u.id}" class="${selectedUnit===u.id?'active':''} ${u.id!=='all'&&!DATA.questions.some(q=>q.unit===u.id)?'no-direct':''}" aria-pressed="${selectedUnit===u.id}"><span class="unit-no">${escapeHTML(u.code)}</span><span class="nav-label">${escapeHTML(u.name)}</span><span class="nav-count">${u.id==='all'?DATA.questions.length:DATA.questions.filter(q=>q.unit===u.id).length}</span></button>`;
 $('#unitNav').innerHTML=button({id:'all',code:'∑',name:'全部考題'})+DATA.chapters.map(c=>`<div class="nav-chapter">第 ${c.number} 章 · ${escapeHTML(c.name)}</div>`+DATA.units.filter(u=>u.chapterNumber===c.number).map(button).join('')).join('')+`<div class="nav-chapter">教材節次以外</div>`+DATA.units.filter(u=>u.chapterNumber===null).map(button).join('');
}
function cardHTML(q,context='bank') {
 const u=units[q.unit],r=getRecord(q.id),memoID=`memo-${context}-${q.id}`;
 return `<article class="card" id="${context}-${q.id}" style="--unit-color:${u.color}" data-id="${q.id}">
 <div class="card-header"><span class="category">${escapeHTML(u.chapter)} · ${escapeHTML(u.name)}</span><button class="star ${r.star?'on':''}" data-action="star" data-id="${q.id}" aria-label="${r.star?'取消待加強':'標記待加強'}：${escapeHTML(q.title)}" aria-pressed="${r.star}" title="標記待加強">${r.star?'★':'☆'}</button></div>
 <div class="section-english">${escapeHTML(u.english)}</div><div class="origin">${escapeHTML(q.exam)} · 第 ${q.num} 題 · 資料夾 ${q.folder}</div>${(q.additionalSources||[]).map(source=>`<div class="origin">另收錄：${escapeHTML(source.exam)} · 第 ${escapeHTML(source.num)} 題</div>`).join('')}<h3>${context==='midterm'?'第 '+escapeHTML(q.num)+' 題｜':''}${escapeHTML(q.title)}</h3><p class="body-text">${escapeHTML(q.body)}</p>
 <div class="tags">${q.tags.map(t=>`<span class="tag">${escapeHTML(t)}</span>`).join('')}${q.repeat?'<span class="tag repeat">同題再現</span>':''}${q.exam.includes('期中')?'<span class="tag repeat">期中考</span>':''}</div>
 <div class="section-reference"><strong>主要節次 ${escapeHTML(q.section)}</strong>${q.related.length?`<span>相關節次：${q.related.map(escapeHTML).join('、')}</span>`:''}</div>
 ${q.teaching?`<details class="exam-teaching ${q.teaching.warning?'needs-care':''}" ${context==='midterm'?'open':''}><summary>${q.teaching.warning?'這題的條件要先釐清':'先用白話看懂這題'}</summary><div class="detail-body"><p><strong>到底在問什麼：</strong>${escapeHTML(q.teaching.task)}</p><p><strong>為什麼這樣做：</strong>${escapeHTML(q.teaching.why)}</p><p><strong>最容易錯：</strong>${escapeHTML(q.teaching.trap)}</p></div></details>`:''}
 <details><summary>教材節次與分類依據</summary><div class="detail-body">${escapeHTML(q.classification)}${q.bookMatch?`<p class="book-match">教材對照：${escapeHTML(q.bookMatch)} · 印刷頁 ${q.sourcePage-21}<br><button data-book="${q.sourcePage}">查看教材對照頁 ↗</button></p>`:''}</div></details>
 <div class="question-lesson"><span>${escapeHTML(u.plain?.purpose||u.intro)}</span><button data-guide="${u.id}">不懂為什麼用這個公式？看 §${escapeHTML(u.code)} →</button></div>
 <details><summary>給我一個提示</summary><div class="detail-body">${escapeHTML(q.hint)}</div></details>
 <details class="solution" ${context==='midterm'?'open':''}><summary>${context==='midterm'?'逐步講解與選項判斷':'查看解答與思路'}</summary><div class="detail-body"><div class="answer">${escapeHTML(q.answer)}</div><ol>${q.steps.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}</ol>${q.options?`<p class="options">對照原題選項：${escapeHTML(q.options)}</p>`:''}${q.optionChecks?`<details class="option-checks"><summary>逐一核對原題選項</summary><div class="table-wrap"><table><thead><tr><th>選項</th><th>原題條件</th><th>判斷</th></tr></thead><tbody>${q.optionChecks.map(([letter,condition,result])=>`<tr><td>${escapeHTML(letter)}</td><td>${escapeHTML(condition)}</td><td>${escapeHTML(result)}</td></tr>`).join('')}</tbody></table></div></details>`:''}${q.note?`<p class="note">${escapeHTML(q.note)}</p>`:''}${q.repeat?`<p>重複出題：${escapeHTML(questions[q.repeat].exam)} 第 ${questions[q.repeat].num} 題。</p>`:''}<p><button data-book="${q.page||u.page||''}" ${!(q.page||u.page)?'hidden':''}>回到教材 ↗</button></p></div></details>
 <details><summary>我的複習筆記</summary><div class="detail-body"><label for="${memoID}">記下這題容易忘記的地方</label><textarea class="memo" id="${memoID}" data-note="${q.id}" maxlength="5000" placeholder="例如：CDF 要把 ≤ 的情況一起加總。">${escapeHTML(r.note)}</textarea><small>自動儲存在此瀏覽器，可在「來源整理」匯出備份。</small></div></details>
 <div class="card-footer"><button data-action="image" data-id="${q.id}">原題截圖 ${q.files.length>1?`· ${q.files.length} 張`:''} ↗</button><button data-action="done" data-id="${q.id}" class="${r.done?'mastered':''}" aria-pressed="${r.done}">${r.done?'✓ 已熟練':'○ 標記熟練'}</button></div></article>`;
}
function renderBank() {
 const term=$('#search').value.trim().toLocaleLowerCase(), exam=$('#exam').value, status=$('#status').value;
 filtered=DATA.questions.filter(q=>{
  const r=getRecord(q.id);
  return (selectedUnit==='all'||q.unit===selectedUnit)&&(exam==='all'||matchesExam(q,exam))&&(status==='all'||status==='done'&&r.done||status==='todo'&&!r.done||status==='star'&&r.star)&&(!term||[q.title,q.body,q.exam,q.tags.join(' '),units[q.unit].name,units[q.unit].english,q.section,q.related.join(' '),q.classification,q.files.join(' '),JSON.stringify(q.additionalSources||[]),q.note].join(' ').toLocaleLowerCase().includes(term));
 });
 const unit=units[selectedUnit];
 $('#unitOverview').innerHTML=unit?`<section class="unit-overview"><h2>${escapeHTML(unit.chapter)} ${escapeHTML(unit.name)}</h2><p class="section-original">${escapeHTML(unit.english)}</p><p>${escapeHTML(unit.plain?.purpose||unit.intro)}</p><button data-guide="${unit.id}">先看這節在幹嘛、什麼時候用 →</button></section>`:'';
 $('#resultTitle').innerHTML=`${unit?escapeHTML(unit.chapter)+' '+escapeHTML(unit.name):'依教材節次排列'}<span class="count">${filtered.length} / ${DATA.questions.length} 筆</span>`;
 const noDirect=unit&&!DATA.questions.some(q=>q.unit===unit.id);
 $('#cards').innerHTML=filtered.length?(selectedUnit==='all'?DATA.units.map(u=>{const group=filtered.filter(q=>q.unit===u.id);return group.length?`<div class="group-heading"><div><h3><span>${escapeHTML(u.code)}</span>${escapeHTML(u.name)}</h3><p>${escapeHTML(u.english)}</p></div><small>${group.length} 筆考題</small></div>`+group.map(q=>cardHTML(q)).join(''):'';}).join(''):filtered.map(q=>cardHTML(q)).join('')):`<div class="empty"><strong>${noDirect?'本節尚無直接對應考題':'目前沒有符合的題目'}</strong>${noDirect?'現有照片與教材重點已放在「白話教材」。相關先備概念不重複計入主要題數。':'試試其他關鍵字，或按「清除篩選」。'}</div>`;

 $('#random').disabled=filtered.length===0;
 updateProgress();
}
function switchView(view) {
 selectedView=view;
 document.querySelectorAll('.view').forEach(el=>el.classList.toggle('active',el.id===view));
 document.querySelectorAll('[role="tab"][data-view]').forEach(el=>{const active=el.dataset.view===view;el.classList.toggle('active',active);el.setAttribute('aria-selected',String(active));});
}
function chooseUnit(unit) {selectedUnit=unit;renderNav();renderBank();switchView('bank');history.replaceState(null,'','#bank');}
function renderMidterm() {
 const exam=DATA.featuredExam, container=$('#midtermCards');if(!exam||!container)return;
 const openStates=new Map(Array.from(container.querySelectorAll('.card'),c=>[c.dataset.id,Array.from(c.querySelectorAll('details'),d=>d.open)]));
 const qs=exam.questionIds.map(id=>questions[id]);
 $('#midtermIntro').innerHTML=`<div class="eyebrow">資料夾 9 · ${escapeHTML(exam.name)}</div><h2>${escapeHTML(exam.title)}</h2><p>照原題號讀，每題先說「在問什麼、為什麼這樣做」，再把計算和選項走一次。</p><div class="exam-metrics"><strong>${qs.length} 題已收錄</strong><span>第 ${exam.missing.join('、')} 題未提供</span><span>已熟練 ${qs.filter(q=>getRecord(q.id).done).length} / ${qs.length} 題</span></div><nav class="exam-jumps" aria-label="PB 1101 題號">${qs.map(q=>`<button data-midterm-question="${q.id}">第 ${q.num} 題 <small>§${escapeHTML(q.section)}</small></button>`).join('')}</nav><p class="exam-caution"><strong>第 2 題特別提醒：</strong>獨立不代表相關係數一定存在；題面讓 X 的變異數為無限大，講解會列出原因。以下解答為重新推導，原截圖的勾選不直接視為正解。</p>`;
 container.innerHTML=qs.map(q=>cardHTML(q,'midterm')).join('');
 for(const card of container.querySelectorAll('.card')){const state=openStates.get(card.dataset.id);if(state)card.querySelectorAll('details').forEach((d,i)=>d.open=state[i]===true);}
}
function jumpToMidtermQuestion(id) {
 if(!DATA.featuredExam.questionIds.includes(id))return;
 switchView('midterm');const card=$('#midterm-'+id);card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({behavior:'smooth',block:'start'});history.replaceState(null,'','#midterm-'+id);
}
function renderGuides() {
 if(!$('#guideStart').hasChildNodes())renderGuideStart();
 $('#guideList').innerHTML=DATA.units.map(u=>`<article class="guide" id="guide-${u.id}"><div class="guide-top"><div><div class="eyebrow">${u.chapterNumber===null?'SUPPLEMENT':'SECTION '+escapeHTML(u.code)}</div><h2>${escapeHTML(u.chapter)} ${escapeHTML(u.name)}</h2><p class="section-original">${escapeHTML(u.english)}</p><span class="chapter">${escapeHTML(u.chapter)}${u.page?` · 印刷頁 ${u.pages} · PDF 第 ${u.page} 頁起`:' · 數學先備'}</span></div>${u.page?`<button data-book="${u.page}">開啟教材 ↗</button>`:''}</div>${lessonHTML(u)}<details class="formula-reference"><summary>課本公式備查與補充重點</summary><p>${escapeHTML(u.intro)}</p><div class="formula-list">${u.formulas.map(f=>`<div class="formula">${escapeHTML(f)}</div>`).join('')}</div><ul class="tips">${u.tips.map(t=>`<li>${escapeHTML(t)}</li>`).join('')}</ul></details><button data-unit="${u.id}">本節考題 ${DATA.questions.filter(q=>q.unit===u.id).length} 題 →</button>${u.slides.length?`<div class="slides">${u.slides.map(f=>{const l=DATA.lectures.find(l=>l.file===f);return `<button class="slide" data-slide="${f}">${ASSETS[f]?`<img src="${ASSETS[f]}" loading="lazy" alt="${escapeHTML(l.title)}">`:'<span class="private-placeholder">教材載入中，點擊可查看狀態</span>'}<span>${escapeHTML(l.title)} ↗</span></button>`;}).join('')}</div>`:'<p class="chapter">此節未提供專屬上課照片，請搭配教材或上述重點複習。</p>'}</article>`).join('');
}
function renderSources() {
 const examRows=Object.entries(DATA.coverage).map(([exam,coverage])=>`<tr><td>${escapeHTML(exam)}</td><td>${DATA.questions.filter(q=>matchesExam(q,exam)).length}</td><td>${escapeHTML(coverage)}</td><td><button data-exam="${escapeHTML(exam)}">查看題目</button></td></tr>`).join('');
 $('#sources').innerHTML=`<div class="sources-box"><h2>這份題庫如何整理？</h2><ul><li><strong>嚴格依原文教材的節號順序排列。</strong>使用原書節號與原文節名，中文為輔助譯名；每題只計入一個主要節次，另列相關節次與分類依據。</li><li>目前資料涵蓋第 1–4 章的 ${STATS.sectionCount} 個節次，其中 ${STATS.testedSectionCount} 節有直接對應考題；2.1、2.2、2.5、3.1 保留教材與上課照片對照，主要題數為 0。微積分題另列「課外先備」。未列出的教材節次不代表不考，只代表現有資料未涵蓋。</li><li>逐一對照資料夾 1～9 與「複習網站/新增題目」的 <strong>${STATS.examScreenshots} 張考題截圖</strong>：${STATS.academicScreenshots} 張歸入 ${STATS.questionCount} 張學科題卡，另外 ${DATA.excluded.length} 張為點名代碼。單張截圖包含多題時，各題共用原圖。</li><li>目前 ${STATS.questionCount} 張題卡包含 <strong>${STATS.distinctCount} 道不同題目</strong>。偏幣題與獨立事件條件機率題保留各份試卷的題卡；2026-10-16 新增的密碼題併入既有題卡，另列截圖來源與題號。新增來源篩選會顯示這張合併題卡，所以來源表的題數不可直接加總。</li><li><strong>${STATS.lectureCount} 張上課照片</strong>已配到相關單元；原圖與完整教材由網站自動載入，不必另外匯入。教材共 812 個 PDF 頁面；前段正文的 PDF 頁碼 = 印刷頁碼 + 21。</li><li>資料夾編號是來源編號，並非單元編號；試卷名稱沿用截圖，不推定年份或考試日期。</li><li>題幹以中文整理，原始英文、選項與作答紀錄保留在原圖。展開的解答為重新推導；原圖「答題情況」是當時作答，不直接視為標準答案。</li></ul><div class="actions"><button class="primary" data-book="8">教材目錄預覽 ↗</button><button id="downloadPDF">下載教材 PDF</button></div></div>
 <div class="sources-box"><h2>試卷覆蓋範圍</h2><p>只收錄實際提供的截圖。未提供的題目不補造，也不推測其內容。</p><div class="table-wrap"><table><thead><tr><th>截圖試卷名稱</th><th>學科題數</th><th>資料完整性</th><th>複習</th></tr></thead><tbody>${examRows}</tbody></table></div></div>
 <div class="sources-box"><h2>需要特別留意的原始作答</h2><ul><li><strong>PB 1101 midterm：</strong>資料夾 9 已整理為專區，第 5 題未提供。第 2 題需檢查相關係數的存在條件；第 6 題答案為 1/4，選 C；第 7 題答案為 4/15，應選 C、D。</li><li><strong>PB 72 am 第 1 題：</strong>原作答為 0 分；方法數應為 500，選項要包含 D（>400）。</li><li><strong>PB 073 am 第 2 題：</strong>原作答為 0 分；三骰和為 16 的機率是 1/36，只符合 E（>0.02）。</li><li><strong>PB 709 am 第 1 題與 pm 第 5 題：</strong>同一道偏幣期望值題，選項字母不同。</li><li><strong>新增截圖第 1 題：</strong>密碼題機率為 1/26，A–E 皆成立；只選 C 不完整。</li><li><strong>新增截圖第 5 題：</strong>水果題機率為 1/2，正確選項為 D（>0.45），原選 C（<0.25）不成立。</li><li><strong>跨單元分類：</strong>抽球可延伸到 §5.3 超幾何分布，指數密度可延伸到 §6.6；主分類依原文教材節次；另以「相關節次」標記先備與延伸。</li></ul></div>
 <div class="sources-box"><h2>排除的點名題</h2><p>保留來源可供核對，不計入題數與熟練進度。</p>${DATA.excluded.map(e=>`<p>${escapeHTML(e.exam)} 第 ${e.num} 題 · ${escapeHTML(e.reason)} <button data-slide="${e.file}">查看原圖</button></p>`).join('')}</div>
 <div class="sources-box"><h2>我的複習紀錄</h2><p>iPhone：Safari → 分享 → 加入主畫面。題庫與教材分別儲存；看到「教材已儲存，可離線查看」後，原圖與課本也可離線使用。不同瀏覽器與主畫面 App 的儲存空間可能不同，第一次開啟時會自動下載。裝置清理網站資料後，請重新連線。</p><p>「已熟練」、待加強星號與筆記儲存在目前瀏覽器。換瀏覽器、搬動 HTML 或清除瀏覽資料時，請先匯出，再於新位置匯入。匯入會以檔案中的紀錄更新相同題目。</p><div class="actions"><button id="exportProgress">匯出進度 JSON</button><button id="importProgress">匯入進度</button><button id="printSources">列印目前內容</button></div></div>`;
}
function ensurePDF() {
 if (!pdfURL) {
  const encoded=$('#textbook-data').textContent.trim(),bytes=atob(encoded),chunks=[];
  for(let offset=0;offset<bytes.length;offset+=524288){const part=bytes.slice(offset,offset+524288);chunks.push(Uint8Array.from(part,c=>c.charCodeAt(0)));}
  pdfURL=URL.createObjectURL(new Blob(chunks,{type:'application/pdf'}));
 }
 return pdfURL;
}
function openBook(page) {if(!ASSETS[`book-${Number(page)||1}.jpg`]){requestMaterials(()=>openBook(page));return;}const n=Number(page)||1;$('#bookTitle').textContent=`教材 · PDF 第 ${n} 頁${n>=22?'（印刷頁 '+(n-21)+'）':''}`;$('#bookPreview').src=ASSETS[`book-${n}.jpg`];$('#bookPreview').alt=`教材 PDF 第 ${n} 頁`;if(!$('#bookDialog').open)$('#bookDialog').showModal();}
function downloadBlob(blob,name) {const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
function showImages(files,title) {
 if(files.some(file=>!ASSETS[file])){requestMaterials(()=>showImages(files,title));return;}
 imageFiles=files;imagePosition=0;$('#imageTitle').textContent=title;updateImage();
 if(!$('#imageDialog').open)$('#imageDialog').showModal();
}
function updateImage() {
 const file=imageFiles[imagePosition];$('#sourceImage').src=ASSETS[file];$('#sourceImage').alt=file+'：'+$('#imageTitle').textContent;$('#sourceImage').classList.remove('zoom');
 $('#imageIndex').textContent=`${imagePosition+1} / ${imageFiles.length}`;
 $('#prevImage').disabled=imagePosition===0;$('#nextImage').disabled=imagePosition===imageFiles.length-1;
 $('#downloadImage').href=ASSETS[file];$('#downloadImage').download=file.split('/').pop();
 $('#imageCaption').textContent=`來源：${file} · 點擊圖片可放大／縮小；原題截圖可能包含作答紀錄。`;
}
function showRandom() {
 if(!filtered.length){toast('目前篩選沒有題目');return;}
 let pool=filtered.filter(q=>q.id!==currentRandom);if(!pool.length)pool=filtered;
 const q=pool[Math.floor(Math.random()*pool.length)];currentRandom=q.id;
 $('#randomScope').textContent=`從目前篩選的 ${filtered.length} 筆題目抽選`;
 $('#randomCard').innerHTML=cardHTML(q,'random');
 if(!$('#randomDialog').open)$('#randomDialog').showModal();
}
function updateQuestionState(id,field) {
 const r=getRecord(id);records[id]={...r,[field]:!r[field]};save();renderBank();renderMidterm();
 if($('#randomDialog').open&&currentRandom===id){
  const card=$('#randomCard');const open=Array.from(card.querySelectorAll('details')).map(d=>d.open);card.innerHTML=cardHTML(questions[id],'random');card.querySelectorAll('details').forEach((d,i)=>d.open=open[i]);
 }
 toast(field==='done'?(records[id].done?'已標記熟練':'已改回尚未熟練'):(records[id].star?'已加入待加強':'已取消待加強'));
}
$('#unitNav').addEventListener('click',e=>{const b=e.target.closest('[data-unit]');if(b)chooseUnit(b.dataset.unit);});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.view){switchView(b.dataset.view);history.replaceState(null,'','#'+b.dataset.view);if(!b.matches('[role="tab"]'))$('#'+b.dataset.view).scrollIntoView({behavior:'smooth'});return;}
 if(b.dataset.close){$('#'+b.dataset.close).close();return;}
 if(b.dataset.book){openBook(b.dataset.book);return;}
 if(b.dataset.guide){jumpToGuide(b.dataset.guide);return;}
 if(b.dataset.question){jumpToQuestion(b.dataset.question);return;}
 if(b.dataset.midtermQuestion){jumpToMidtermQuestion(b.dataset.midtermQuestion);return;}
 if(b.dataset.unit&&!b.closest('#unitNav')){chooseUnit(b.dataset.unit);$('#bank').scrollIntoView({behavior:'smooth'});return;}
 if(b.dataset.slide){const l=DATA.lectures.find(l=>l.file===b.dataset.slide);showImages([b.dataset.slide],l?l.title:'原始點名題');return;}
 if(b.dataset.exam){selectedUnit='all';$('#exam').value=b.dataset.exam;$('#search').value='';$('#status').value='all';renderNav();renderBank();switchView('bank');$('#bank').scrollIntoView({behavior:'smooth'});return;}
 if(b.dataset.action){const q=questions[b.dataset.id];if(b.dataset.action==='image')showImages(q.files,`${q.exam} 第 ${q.num} 題 · ${q.title}`);else updateQuestionState(q.id,b.dataset.action);return;}
 if(b.id==='exportProgress')downloadBlob(new Blob([JSON.stringify({format:'probability-review-v1',exportedAt:new Date().toISOString(),records},null,2)],{type:'application/json'}),'機率統計_複習進度.json');
 if(b.id==='importProgress')$('#importFile').click();
 if(['downloadPDF','downloadPDFInDialog','downloadPDFInMaterials'].includes(b.id))downloadTextbook();
 if(['print','printSources'].includes(b.id))window.print();
});
document.addEventListener('input',e=>{
 if(e.target.matches('[data-note]')){
  const id=e.target.dataset.note;records[id]={...getRecord(id),note:e.target.value};save();
  document.querySelectorAll(`[data-note="${id}"]`).forEach(t=>{if(t!==e.target)t.value=e.target.value;});
 }
});
$('#search').addEventListener('input',renderBank);$('#exam').addEventListener('change',renderBank);$('#status').addEventListener('change',renderBank);
$('#clear').addEventListener('click',()=>{selectedUnit='all';$('#search').value='';$('#exam').value='all';$('#status').value='all';renderNav();renderBank();});
$('#random').addEventListener('click',showRandom);$('#nextRandom').addEventListener('click',showRandom);
$('#prevImage').addEventListener('click',()=>{if(imagePosition>0){imagePosition--;updateImage();}});$('#nextImage').addEventListener('click',()=>{if(imagePosition<imageFiles.length-1){imagePosition++;updateImage();}});
$('#sourceImage').addEventListener('click',()=>$('#sourceImage').classList.toggle('zoom'));
$('#sourceImage').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();$('#sourceImage').classList.toggle('zoom');}});
$('#imageDialog').addEventListener('keydown',e=>{if(e.key==='ArrowLeft')$('#prevImage').click();if(e.key==='ArrowRight')$('#nextImage').click();});
for(const d of document.querySelectorAll('dialog'))d.addEventListener('click',e=>{if(e.target===d){const r=d.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)d.close();}});
$('#importFile').addEventListener('change',async e=>{
 const file=e.target.files[0];if(!file)return;
 try{if(file.size>2000000)throw new Error('檔案過大');const data=JSON.parse(await file.text());if(data.format!=='probability-review-v1')throw new Error('請選擇此題庫匯出的進度檔');records={...records,...cleanRecords(data.records)};save();renderBank();renderMidterm();toast('複習進度已匯入');}catch(err){toast('匯入失敗：'+err.message);}finally{e.target.value='';}
});
$('#exam').insertAdjacentHTML('beforeend',Object.keys(DATA.coverage).map(e=>`<option value="${escapeHTML(e)}">${escapeHTML(e)}</option>`).join(''));
renderNav();renderBank();renderGuides();renderSources();renderMidterm();

// Plain-language explanations appear before the formula reference.
function lessonHTML(u) {
 const p=u.plain;
 if(!p)return '';
 const list=(items,tag='ul')=>`<${tag}>${items.map(s=>`<li>${escapeHTML(s)}</li>`).join('')}</${tag}>`;
 return `<div class="lesson-purpose"><span>這節在幹嘛？</span><p>${escapeHTML(p.purpose)}</p></div>
 <p class="lesson-scene">${escapeHTML(p.scene)}</p>
 ${p.meaning?`<p>${escapeHTML(p.meaning)}</p>`:''}
 <div class="lesson-cues"><h3>看到什麼，就想到這節？</h3>${list(p.cues)}</div>
 ${p.steps?`<div class="lesson-steps"><h3>拿到題目，照這個順序做</h3>${list(p.steps,'ol')}</div>`:''}
 ${p.choices?`<div class="formula-decisions"><h3>題目問不同的事，公式就不同</h3>${p.choices.map(([ask,formula,why])=>`<div class="formula-decision"><h4>${escapeHTML(ask)}</h4><div class="formula">${escapeHTML(formula)}</div><p>${escapeHTML(why)}</p></div>`).join('')}</div>`:''}
 ${p.examples?`<div class="worked-examples"><h3>把公式用在一題裡</h3>${p.examples.map((e,i)=>`<details class="worked" ${i===0?'open':''}><summary>${escapeHTML(e.title)}</summary><div class="lesson-detail">${list(e.steps,'ol')}<div class="answer">${escapeHTML(e.result)}</div><p class="result-meaning"><strong>這個答案在說：</strong>${escapeHTML(e.meaning)}</p>${e.qid?`<button data-question="${e.qid}">自己做這道考古題 →</button>`:''}</div></details>`).join('')}</div>`:''}
 ${p.traps?`<details class="lesson-extra"><summary>最容易套錯的地方</summary><div class="lesson-detail">${list(p.traps)}</div></details>`:''}
 ${p.check?`<div class="lesson-check"><h3>先別算，確認你有懂</h3><p>${escapeHTML(p.check[0])}</p><details><summary>看白話答案</summary><p>${escapeHTML(p.check[1])}</p></details></div>`:''}`;
}

function renderGuideStart() {
 $('#guideStart').innerHTML=`<section class="lesson-start" aria-labelledby="lessonStartTitle"><div class="eyebrow">先看懂，再選公式</div><h2 id="lessonStartTitle">先問：我到底要算什麼？</h2><p>同一個 f(x)，問機率、平均、波動，做法完全不同。先看題目最後一句，再看給了什麼資料。</p>
 <div class="chapter-map"><div><span>第 3 章 · 機率</span><strong>某種結果，多容易發生？</strong><p>3.1 把結果變成數字 → 3.2 離散型加機率 → 3.3 連續型算面積 → 3.4 同時看兩個量。</p></div><div><span>第 4 章 · 平均與波動</span><strong>長期平均多少？上下差多少？</strong><p>4.1 算平均 → 4.2 算波動與共同變動 → 4.3 算加總、倍數後的結果 → 4.4 只靠平均和波動，保證機率範圍。</p></div></div>
 <div class="symbol-key"><strong>符號先翻成人話</strong><p>X 是「你在量的東西」；x 是它的一個可能值。Σ 是「一項項加起來」；∫ 是「連續地累加」。E 是「算平均」；Var 是「量波動」；P 是「算機率」。</p><p><strong>f(x) 要先看類型：</strong>離散型是 X=x 這一格的機率；連續型是密度高度，要乘上小段寬度再累加成面積，才是機率。F(x) 一律是「累積到 x 為止」的機率。</p><p>下方的 ∫[a,b] 表示「從 a 積到 b」；C(n,r) 表示「從 n 個選 r 個，不計順序」。</p></div>
 <div class="formula-picker"><label for="formulaQuestion">題目最後在問什麼？</label><select id="formulaQuestion"><option value="">選一種問法，看看第一步該做什麼</option>${DATA.formulaRoutes.map(r=>`<option value="${r.id}">${escapeHTML(r.label)}</option>`).join('')}</select><div id="formulaAdvice" aria-live="polite"><p class="picker-hint">先選問法，再到對應節次看示範。不必一開始就背整排公式。</p></div></div>
 <nav class="lesson-jumps" aria-label="白話教材節次">${DATA.units.map(u=>`<button data-guide="${u.id}">${escapeHTML(u.code)} ${escapeHTML(u.name)}</button>`).join('')}</nav>
 <p class="lesson-scope">目前依你提供的題目整理第 1–4 章，白話詳解重點為 §3.1–4.4。以下仍照原文教材順序；補充小例子不計入考古題數。</p></section>`;
}

function renderFormulaAdvice(id) {
 const r=DATA.formulaRoutes.find(r=>r.id===id);
 if(!r){$('#formulaAdvice').innerHTML='<p class="picker-hint">先選問法，再到對應節次看示範。不必一開始就背整排公式。</p>';return;}
 const u=DATA.units.find(u=>u.code===r.section);
 $('#formulaAdvice').innerHTML=`<div class="formula-advice"><strong>先看 §${escapeHTML(r.section)}：${escapeHTML(u.plain.purpose)}</strong><p>${escapeHTML(r.explanation)}</p><div class="formula">${escapeHTML(r.formula)}</div><div class="actions"><button data-guide="${u.id}">看這節怎麼做 →</button>${r.qid?`<button data-question="${r.qid}">練對應考題 →</button>`:''}</div></div>`;
}

function jumpToQuestion(id) {
 const q=questions[id];if(!q)return;
 if($('#randomDialog').open)$('#randomDialog').close();
 $('#search').value='';$('#exam').value='all';$('#status').value='all';
 chooseUnit(q.unit);
 const card=$('#bank-'+id);card.tabIndex=-1;card.focus({preventScroll:true});card.scrollIntoView({behavior:'smooth',block:'start'});
 history.replaceState(null,'','#question-'+id);
}

function jumpToGuide(unit) {
 if(!units[unit])return;
 if($('#randomDialog').open)$('#randomDialog').close();
 switchView('guides');
 const section=$('#guide-'+unit);section.tabIndex=-1;section.focus({preventScroll:true});section.scrollIntoView({behavior:'smooth',block:'start'});
 history.replaceState(null,'','#guide-'+unit);
}

function openLinkedView() {
 const hash=location.hash.slice(1);
 if(hash.startsWith('guide-'))jumpToGuide(hash.slice(6));
 else if(hash.startsWith('midterm-'))jumpToMidtermQuestion(hash.slice(8));
 else if(hash.startsWith('question-'))jumpToQuestion(hash.slice(9));
 else if(['bank','guides','sources','midterm'].includes(hash)){switchView(hash);$('#'+hash).scrollIntoView();}
}

document.addEventListener('change',e=>{if(e.target.id==='formulaQuestion')renderFormulaAdvice(e.target.value);});
window.addEventListener('hashchange',openLinkedView);
openLinkedView();

// Hosted materials are downloaded once; study notes and progress stay local.
let pendingMaterialAction = null;
let materialImportInProgress = false;
let materialDownload = null;
let loadedPack = null;
function materialStatus(title,message) {
 $('#materialsState').textContent=title;
 $('#materialsDescription').textContent=message;
 $('#materialsMessage').textContent=title+'。'+message;
}
function requestMaterials(action) {
 pendingMaterialAction = action || null;
 if(!action){if(!$('#materialsDialog').open)$('#materialsDialog').showModal();return;}
 toast('教材載入中，完成後會自動開啟');
 loadHostedMaterials().catch(()=>{if(!$('#materialsDialog').open)$('#materialsDialog').showModal();});
}
function materialDatabase() {
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('probability-review-private-materials-v1',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('materials');
  request.onsuccess=()=>resolve(request.result);
  request.onerror=()=>reject(request.error);
 });
}
async function materialStore(mode,value) {
 const db=await materialDatabase();
 try {
  return await new Promise((resolve,reject)=>{
   const transaction=db.transaction('materials',mode);
   const objectStore=transaction.objectStore('materials');
   const request=mode==='readonly'?objectStore.get('pack'):objectStore.put(value,'pack');
   let result;
   request.onsuccess=()=>{result=request.result;};
   transaction.oncomplete=()=>resolve(result);
   transaction.onerror=()=>reject(transaction.error);
   transaction.onabort=()=>reject(transaction.error||new Error('儲存中止'));
  });
 } finally {db.close();}
}
function validateMaterialPack(pack) {
 if (!pack || pack.format!=='probability-review-materials-v1' || !pack.assets || typeof pack.assets!=='object' || Array.isArray(pack.assets)) throw new Error('請選擇機率統計的教材包 JSON');
 const assets=Object.create(null);
 for (const file of DATA.privateAssetKeys) {
  const value=Object.prototype.hasOwnProperty.call(pack.assets,file)?pack.assets[file]:null;
  if (typeof value!=='string' || !/^data:image\/(?:png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(value) || value.length>20000000) throw new Error('教材包缺少圖片或版本不符，請使用最新教材包');
  assets[file]=value;
 }
 if (typeof pack.pdf!=='string' || !pack.pdf.startsWith('JVBERi0') || !/^[A-Za-z0-9+/=]+$/.test(pack.pdf) || pack.pdf.length>30000000) throw new Error('教材包的 PDF 格式不正確');
 return {format:'probability-review-materials-v1',assets,pdf:pack.pdf,revision:typeof pack.revision==='string'?pack.revision:''};
}
function applyMaterialPack(pack) {
 loadedPack=pack;
 Object.assign(ASSETS,pack.assets);
 $('#textbook-data').textContent=pack.pdf;
 if(pdfURL){URL.revokeObjectURL(pdfURL);pdfURL=null;}
 renderGuides();
}
function finishMaterialAction() {
 const action=pendingMaterialAction;pendingMaterialAction=null;
 if(action){$('#materialsDialog').close();action();}
}
async function loadHostedMaterials() {
 if(materialDownload)return materialDownload;
 materialDownload=(async()=>{
  $('#retryMaterials').disabled=true;
  materialStatus('正在下載教材…',`首次約 ${Math.round(DATA.materialBundle.bytes/1000000)} MB；你可以先閱讀題目與白話教材。`);
  try {
   if(!('DecompressionStream' in window))throw new Error('此瀏覽器無法解壓教材，請更新瀏覽器或使用本機 JSON 匯入');
   const bundle=DATA.materialBundle;
   const response=await fetch(bundle.url+'?v='+bundle.revision);
   if(!response.ok)throw new Error('下載失敗（HTTP '+response.status+'），請稍後重試');
   const bytes=new Uint8Array(await response.arrayBuffer());
   const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
   if(digest!==bundle.revision)throw new Error('教材下載不完整或版本尚未更新，請稍後重試');
   materialStatus('正在整理教材…','下載已完成，正在解壓並儲存到這個裝置。');
   const unpacked=new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
   const pack=validateMaterialPack(await new Response(unpacked).json());pack.revision=bundle.revision;
   let saved=true;
   try{await materialStore('readwrite',pack);}catch{saved=false;}
   applyMaterialPack(pack);
   materialStatus(saved?'教材已儲存，可離線查看':'教材已載入（僅本次使用）',saved?'原題、上課照片及完整課本已備妥，下次不必再匯入。':'裝置未能保存教材，下次開啟會重新下載。');
   finishMaterialAction();
  } catch(error) {
   materialStatus(loadedPack?'新教材未能下載，仍可使用已載入版本':'教材下載未完成',error.message+'；請在「教材與下載」重試。');
   throw error;
  } finally {$('#retryMaterials').disabled=false;}
 })().finally(()=>{materialDownload=null;});
 return materialDownload;
}
function downloadTextbook() {
 if(!$('#textbook-data').textContent.trim()){requestMaterials(downloadTextbook);return;}
 const a=document.createElement('a');a.href=ensurePDF();a.download='機率與統計.pdf';a.click();
}
$('#materialsOpen').addEventListener('click',()=>requestMaterials());
$('#retryMaterials').addEventListener('click',()=>loadHostedMaterials().catch(()=>{}));
$('#exportMaterials').addEventListener('click',function exportMaterials(){
 if(!loadedPack){requestMaterials(exportMaterials);return;}
 const pack={format:loadedPack.format,assets:loadedPack.assets,pdf:loadedPack.pdf};
 downloadBlob(new Blob([JSON.stringify(pack)],{type:'application/json'}),'機率統計_教材包.json');
});
$('#chooseMaterials').addEventListener('click',()=>$('#materialsFile').click());
$('#materialsDialog').addEventListener('close',()=>{
 if(!materialImportInProgress&&!materialDownload)pendingMaterialAction=null;
});
$('#materialsFile').addEventListener('change',async event=>{
 const file=event.target.files[0];if(!file)return;
 if(materialDownload){toast('網站教材正在下載，請等完成後再匯入');event.target.value='';return;}
 materialImportInProgress=true;$('#chooseMaterials').disabled=true;
 $('#materialsMessage').textContent='正在讀取教材包…';
 try{
  if(file.size>100000000)throw new Error('教材包超過大小限制');
  const pack=validateMaterialPack(JSON.parse(await file.text()));pack.revision=DATA.materialBundle.revision;
  let saved=true;
  try{await materialStore('readwrite',pack);}catch{saved=false;}
  applyMaterialPack(pack);
  materialStatus(saved?'教材已儲存，可離線查看':'教材已載入（僅本次使用）',saved?'已從本機教材包載入，選取的檔案未上傳。':'裝置未能保存教材包；重新開啟後請再次載入。');
  const action=pendingMaterialAction;pendingMaterialAction=null;
  $('#materialsDialog').close();
  toast(saved?'教材已儲存在此裝置，未上傳':'已載入；此裝置無法持續保存教材包');
  if(action)action();
 }catch(error){$('#materialsMessage').textContent='匯入失敗：'+error.message;}
 finally{materialImportInProgress=false;$('#chooseMaterials').disabled=false;event.target.value='';}
});
async function restoreMaterials() {
 try{
  const stored=await materialStore('readonly');
  if(stored){const pack=validateMaterialPack(stored);applyMaterialPack(pack);materialStatus('教材已儲存，可離線查看','原題、上課照片及完整課本已從此裝置載入。');if(pack.revision===DATA.materialBundle.revision){finishMaterialAction();return;}}
 }catch{}
 await loadHostedMaterials().catch(()=>{});
}
restoreMaterials();
if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='127.0.0.1' || location.hostname==='localhost')) {
 window.addEventListener('load',async()=>{
  try{
   await navigator.serviceWorker.register('./sw.js');
   await navigator.serviceWorker.ready;
   $('#offlineState').textContent='題庫已可離線開啟';
  }catch{$('#offlineState').textContent='線上複習 · 進度存於本機';}
 });
}
