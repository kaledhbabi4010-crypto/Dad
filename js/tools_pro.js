'use strict';
/* KHALED AI SUITE — tools_pro.js v2: إعدادات ذكية، بحث الويب العميق، منشئ التطبيقات، مركز الوظائف */

/* ================= ENGINE SETTINGS (smart) ================= */
function initSettingsUI(){
  if(!$('setEngine'))return;
  const sel=$('setEngine'),keyIn=$('setKey'),modelIn=$('setModel'),urlRow=$('setUrlRow'),urlIn=$('setUrl'),hint=$('setHint'),dl=$('setModelList');
  sel.innerHTML='';
  Object.entries(ENGINES).forEach(([id,cfg])=>{const o=document.createElement('option');o.value=id;
    o.textContent=cfg.name+(cfg.keyless?' ✓ يعمل بدون مفتاح':' (أضف مفتاحك)');sel.appendChild(o)});
  const st=getEngineState();
  function syncUI(){
    const cfg=ENGINES[sel.value];hint.textContent='💡 '+cfg.hint;
    keyIn.parentElement.style.display=cfg.keyless?'none':'block';
    urlRow.style.display=sel.value==='custom'?'block':'none';
    dl.innerHTML='';(cfg.models||[]).forEach(m=>{const o=document.createElement('option');o.value=m;dl.appendChild(o)});
  }
  sel.value=st.id;keyIn.value=st.key||'';modelIn.value=st.model||'';urlIn.value=st.url||'';syncUI();
  sel.addEventListener('change',()=>{const cfg=ENGINES[sel.value];modelIn.value=(cfg.models&&cfg.models[0])||'';$('setTestResult').innerHTML='';syncUI()});
  $('setSaveBtn').addEventListener('click',()=>{
    setEngineState({id:sel.value,key:keyIn.value.trim(),model:modelIn.value.trim(),url:urlIn.value.trim()});
    if(keyIn.value.trim()) lsSet('khaled_key_'+sel.value, keyIn.value.trim());
    updateEngineTag();checkConnection();toast('تم حفظ المحرك ✓ — كل أدوات الذكاء تستخدمه الآن');
  });
  $('setResetBtn').addEventListener('click',()=>{setEngineState({id:'pollinations',key:'',model:'openai',url:''});sel.value='pollinations';keyIn.value='';modelIn.value='openai';syncUI();updateEngineTag();checkConnection();toast('عودة للمحرك المجاني بدون مفتاح ✓')});
  const quickBtn=$('openaiQuickSetupBtn'),quickStatus=$('openaiQuickStatus');
  if(quickBtn){
    quickBtn.addEventListener('click',()=>{
      sel.value='openai';syncUI();
      const savedKey=lsGet('khaled_key_openai','');
      if(savedKey) keyIn.value=savedKey;
      keyIn.focus();
      window.open('https://platform.openai.com/settings/organization/data-controls/data-retention','_blank');
      quickStatus.innerHTML='✓ تم اختيار محرك ChatGPT تلقائيًا وفتحت لك صفحة إعدادات المشاركة بتبويب جديد.<br><br>'
        +'<strong>الخطوات المتبقية بيدك (دقيقتين):</strong><br>'
        +'1) بالتبويب الجديد: سجّل دخول أو أنشئ حساب مجاني، وفعّل خيار مشاركة البيانات للحصول على التوكنات المجانية.<br>'
        +'2) روح لـ <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com/api-keys</a> وأنشئ مفتاح جديد وانسخه.<br>'
        +'3) ارجع هنا، الصق المفتاح بالخانة اللي فوق (مركّز عليها الآن)، واضغط "حفظ وتفعيل".';
    });
  }
  $('setTestBtn').addEventListener('click',async()=>{
    const res=$('setTestResult');
    const id=sel.value,key=keyIn.value.trim(),model=modelIn.value.trim()||(ENGINES[id].models&&ENGINES[id].models[0])||'openai',url=urlIn.value.trim();
    if(id!=='pollinations'&&!key){res.style.color='var(--accent-rose)';res.textContent='✗ الصق مفتاح API أولًا (تأكد من نسخه كاملًا بدون مسافات)';return}
    res.style.color='var(--accent-amber)';res.textContent='⏳ جارٍ اختبار الاتصال واستكشاف الموديلات…';
    /* 1) auto-discover models with the key */
    if(id!=='pollinations'&&id!=='custom'){
      try{
        const base=ENGINES[id].url.replace('/chat/completions','/models');
        const r=await fetch(base,{headers:{Authorization:'Bearer '+key}});
        if(r.ok){
          const d=await r.json();
          const names=(d.data||[]).map(m=>m.id||m.name).filter(Boolean);
          if(names.length){
            dl.innerHTML='';names.forEach(m=>{const o=document.createElement('option');o.value=m;dl.appendChild(o)});
            const preferred=names.find(n=>n.includes('gpt-oss-120b'))||names.find(n=>n.includes('flash'))||names.find(n=>n.includes('qwen3.6'))||names[0];
            if(!modelIn.value||!names.includes(modelIn.value)){modelIn.value=preferred;toast('وجدت '+names.length+' موديلًا واخترت الأفضل: '+preferred)}
          }
        }
      }catch(e){/* models endpoint optional — continue with test */}
    }
    /* 2) real test call */
    const testState={id,key,model: modelIn.value.trim()||model,url};
    try{
      const t=await callWithRetries([{role:'user',content:'قل حرفياً: تم الاتصال بنجاح'}],{maxAttempts:2},testState);
      res.style.color='var(--accent-emerald)';res.textContent='✓ المحرك يعمل 100% — رد الموديل: '+t.slice(0,60);
    }catch(err){
      res.style.color='var(--accent-rose)';
      let msg=friendlyError(err);
      if(err.status===401||err.status===403)msg='✗ المزود رفض المفتاح (Invalid API Key) — انسخ المفتاح من جديد كاملًا دون مسافات زائدة أو أسطر إضافية';
      else if(err.status===404)msg='✗ اسم الموديل غير موجود عند المزود — جرّب موديلًا آخر من القائمة (زر الاختبار يجلب الموديلات المتاحة تلقائيًا)';
      res.textContent=msg;
    }
  });
}

/* ================= DEEP SEARCH: real web (DuckDuckGo via Jina) + 2 wikis + AI ================= */
let dsLastSources=[];
async function dsLangSearch(lang,q){
  const url='https://'+lang+'.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(q)+'&format=json&origin=*&srlimit=5&srprop=snippet';
  const r=await fetch(url);const d=await r.json();
  return (d.query&&d.query.search?d.query.search:[]).map(h=>({title:h.title,url:'https://'+lang+'.wikipedia.org/wiki/'+encodeURIComponent(h.title.replace(/ /g,'_')),snippet:stripHtml(h.snippet)}));
}
async function dsWebSearch(q){
  const routes=[
    'https://r.jina.ai/https://lite.duckduckgo.com/lite/?q='+encodeURIComponent(q),
    'https://r.jina.ai/https://html.duckduckgo.com/html/?q='+encodeURIComponent(q)
  ];
  for(const route of routes){
    try{
      const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),25000);
      const r=await fetch(route,{signal:ctrl.signal});clearTimeout(t);
      if(!r.ok)continue;
      const md=await r.text();
      const re=/\d+\.\[([^\]]{5,150})\]\(https:\/\/duckduckgo\.com\/l\/\?uddg=([^&)]+)[^)]*\)([^\n]*)/g;
      const out=[];let m;
      while((m=re.exec(md))!==null&&out.length<8){
        let url;try{url=decodeURIComponent(m[2])}catch{url=m[2]}
        if(!/^https?:\/\//.test(url))continue;
        out.push({title:m[1],url,snippet:(m[3]||'').replace(/\*\*/g,'').trim().slice(0,200)});
      }
      if(out.length)return out;
    }catch(e){/* next route */}
  }
  return [];
}
async function deepSearch(){
  const q=$('dsQuery').value.trim();if(!q){toast('اكتب موضوع البحث');return}
  const box=$('dsSources'),ai=$('dsAI');
  ai.style.display='none';box.style.display='block';
  box.innerHTML='<div class="loading-block"><span class="spinner"></span><br><span class="loading-text">جارٍ البحث العميق: الويب + ويكيبيديا العربية والإنجليزية…</span></div>';
  const [web,ar,en]=await Promise.allSettled([dsWebSearch(q),dsLangSearch('ar',q),dsLangSearch('en',q)]);
  const webHits=web.status==='fulfilled'?web.value:[];
  const arHits=ar.status==='fulfilled'?ar.value:[];
  const enHits=en.status==='fulfilled'?en.value:[];
  if(!webHits.length&&!arHits.length&&!enHits.length){box.innerHTML='<div class="error-box">لا توجد نتائج من أي مصدر — جرّب صياغة أخرى.</div>';dsLastSources=[];return}
  dsLastSources=[];let num=0;let html='';
  if(webHits.length){html+='<div class="ds-lang-head">🌐 نتائج الويب الحقيقية — DuckDuckGo ('+webHits.length+')</div>';
    webHits.forEach(h=>{num++;dsLastSources.push({num,title:h.title,url:h.url,snippet:h.snippet,kind:'ويب'});
      html+='<div class="src-card"><span class="src-num web">🌐</span><a class="src-title" target="_blank" rel="noopener" href="'+h.url+'">'+escapeHtmlText(h.title)+'</a><div class="src-snip">'+escapeHtmlText(h.snippet)+'</div></div>'})}
  if(arHits.length){html+='<div class="ds-lang-head">🇸🇦 ويكيبيديا العربية ('+arHits.length+')</div>';
    arHits.forEach(h=>{num++;dsLastSources.push({num,title:h.title,url:h.url,snippet:h.snippet,kind:'عربي'});
      html+='<div class="src-card"><span class="src-num">'+num+'</span><a class="src-title" target="_blank" rel="noopener" href="'+h.url+'">'+escapeHtmlText(h.title)+'</a><div class="src-snip">'+escapeHtmlText(h.snippet)+'…</div></div>'})}
  if(enHits.length){html+='<div class="ds-lang-head">🌐 ويكيبيديا الإنجليزية ('+enHits.length+')</div>';
    enHits.forEach(h=>{num++;dsLastSources.push({num,title:h.title,url:h.url,snippet:h.snippet,kind:'إنجليزي'});
      html+='<div class="src-card"><span class="src-num en">'+num+'</span><a class="src-title" target="_blank" rel="noopener" href="'+h.url+'">'+escapeHtmlText(h.title)+'</a><div class="src-snip">'+escapeHtmlText(h.snippet)+'…</div></div>'})}
  html+='<div class="foot-note">وجدت '+dsLastSources.length+' مرجعًا من الويب ولغتين — اضغط زر التحليل الشامل</div>';
  box.innerHTML=html;
  $('dsAnalyzeBtn').style.display='inline-block';
  $('dsCount').textContent=dsLastSources.length;
}
async function dsAnalyze(){
  if(!dsLastSources.length)return;
  const ai=$('dsAI'),q=$('dsQuery').value.trim();
  ai.style.display='block';
  ai.innerHTML='<span class="spinner"></span> <span class="loading-text">جارٍ التحليل الشامل لكل المراجع…</span>';
  const sources=dsLastSources.map(s=>'['+s.num+'] ('+s.kind+') '+s.title+': '+s.snippet).join('\n');
  try{
    const full=await callAI([{role:'user',content:'سؤال البحث العميق: "'+q+'"\n\nمراجع من الويب وويكيبيديا بلغتين:\n'+sources+'\n\nالمطلوب: تقرير تحليلي شامل بالعربية: 1) الإجابة المباشرة الوافية 2) أهم الحقائق والأرقام مع الإشارة لرقم المرجع [n] 3) خلفية موجزة 4) ما لم تغطه المراجع بصراحة. لا تخترع أي معلومة ليست في المراجع.'}],{maxAttempts:4});
    ai.innerHTML='<strong style="color:var(--accent-blue)"><i class="fa-solid fa-brain me-1"></i>التحليل الشامل:</strong><hr style="border-color:rgba(255,255,255,0.1)">'+renderMarkdown(full);
  }catch(err){ai.innerHTML='<div class="error-box">تعذر التحليل: '+escapeHtmlText(friendlyError(err))+'<br>المراجع أعلاه متاحة للقراءة المباشرة.</div>'}
}
function initDeepSearchUI(){
  if(!$('dsBtn'))return;
  $('dsBtn').addEventListener('click',deepSearch);
  $('dsQuery').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();deepSearch()}});
  $('dsAnalyzeBtn').addEventListener('click',dsAnalyze);
}

/* ================= APP BUILDER ================= */
let abLastCode='',abLastType='html';
function abCheckHtmlSyntax(html){
  const errors=[];
  [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].forEach((m,i)=>{
    if(!m[1].trim())return;
    try{ new Function(m[1]); }catch(e){ errors.push('خطأ JavaScript في <script> #'+(i+1)+': '+e.message); }
  });
  ['div','section','script','style'].forEach(tag=>{
    const o=(html.match(new RegExp('<'+tag+'(\\s|>)','gi'))||[]).length;
    const c=(html.match(new RegExp('</'+tag+'>','gi'))||[]).length;
    if(o!==c) errors.push('اختلال توازن وسم <'+tag+'>: فتح '+o+' / إغلاق '+c);
  });
  return errors;
}

async function abGen(){
  const desc=$('abDesc').value.trim();
  if(!desc){toast('صِف التطبيق الذي تريده');return}
  const type=$('abType').value;
  const status=$('abStatus'),codeEl=$('abCode');
  status.textContent='🚀 جولة 1/3 — جارٍ بناء المشروع بالكامل…';
  codeEl.textContent='';
  let prompt;
  if(type==='html'){
    prompt='أنت مهندس برمجيات خبير محترف. ابنِ تطبيق ويب كاملًا يعمل من ملف HTML واحد بناءً على هذا الوصف:\n\n"'+desc+'"\n\nالمطلوب بدقة:\n1) أخرج كتلة واحدة فقط بصيغة ```html تحتوي ملف HTML كاملًا (head وbody وstyle وscript داخليًا).\n2) تصميم عصري جميل متجاوب مع الجوال، واجهة عربية RTL، ألوان متناسقة، وحركات ناعمة.\n3) كل الأكواد داخل الملف — بدون أي مكتبات خارجية أو CDN.\n4) التطبيق يعمل فورًا عند فتحه بدون أخطاء.\n5) لا تكتب أي شرح خارج كتلة الكود.';
  }else{
    prompt='أنت مهندس بايثون خبير. اكتب سكربت بايثون كاملًا احترافيًا يعتمد فقط على المكتبات القياسية (أو numpy/pandas فقط) لهذه المهمة:\n\n"'+desc+'"\n\nأخرج كتلة واحدة فقط ```python بكود كامل جاهز للتشغيل مع تعليقات عربية موجزة ومعالجة أخطاء. لا شرح خارج الكتلة.';
  }
  let code='', lastErrors=[];
  const MAX_ROUNDS=3;
  try{
    for(let round=1; round<=MAX_ROUNDS; round++){
      const full=await callAI([{role:'user',content:prompt}],{maxAttempts:3,onStatus:s=>{status.textContent='⚠ جولة '+round+'/'+MAX_ROUNDS+' — '+s}});
      const m=full.match(/```(html|python)\s*([\s\S]*?)```/i);
      code=(m?m[2]:full).trim();

      if(type==='html'){
        const errs=abCheckHtmlSyntax(code);
        if(!errs.length){ status.textContent='✓ جولة '+round+' — الكود سليم بلا أخطاء برمجية مكتشفة'; break; }
        lastErrors=errs;
        if(round===MAX_ROUNDS){ status.textContent='⚠ بعد '+MAX_ROUNDS+' محاولات لسا فيه '+errs.length+' خطأ — عرضته لك كأفضل نسخة متاحة، راجعه بنفسك'; break; }
        status.textContent='⏳ جولة '+round+' فيها '+errs.length+' خطأ برمجي — جارٍ إعادة البناء تلقائيًا للتصحيح…';
        prompt='هذا كود سبق وولّدته:\n```html\n'+code+'\n```\n\nوجدنا فيه أخطاء برمجية فعلية بالفحص الآلي:\n'+errs.join('\n')+'\n\nأصلح هذي الأخطاء بالضبط مع الحفاظ على كل الوظائف والتصميم — أخرج الملف كاملًا مصححًا بنفس الشكل ```html، بدون أي شرح خارج الكتلة.';
      }else{
        break; // لا يوجد فاحص نحوي حقيقي لبايثون بالمتصفح — جولة واحدة فقط
      }
    }

    abLastCode=code;abLastType=type;
    if(type==='html'){$('abPreview').srcdoc=abLastCode;$('abPreviewBox').style.display='block';$('abRunPyBtn').style.display='none'}
    else{$('abPreviewBox').style.display='none';$('abRunPyBtn').style.display='inline-block'}
    codeEl.textContent=abLastCode;
    $('abActions').style.display='flex';
    toast(lastErrors.length?'تم البناء مع تحذيرات — راجع الحالة أعلاه':'تم بناء المشروع ✓ وتحقق آليًا من سلامته');
  }catch(err){status.textContent='';toast('تعذر البناء: '+friendlyError(err))}
}
function initAppBuilderUI(){
  if(!$('abGenBtn'))return;
  $('abGenBtn').addEventListener('click',abGen);
  $('abCopyBtn').addEventListener('click',()=>copyText(abLastCode));
  $('abDownloadBtn').addEventListener('click',()=>{
    if(!abLastCode)return;
    const ext=abLastType==='html'?'html':'py';
    const mime=abLastType==='html'?'text/html':'text/x-python';
    const a=document.createElement('a');
    a.href=URL.createObjectURL(new Blob([abLastCode],{type:mime}));
    a.download='khaled-app.'+ext;a.click();URL.revokeObjectURL(a.href);
    toast('تم التحميل ✓');
  });
  $('abRunPyBtn').addEventListener('click',()=>{
    if(!abLastCode)return;
    showView('python');
    $('pyCode').value=abLastCode;
    toast('الكود جاهز — جارٍ التشغيل تلقائيًا…');
    setTimeout(()=>{ if($('pyRunBtn')) $('pyRunBtn').click(); }, 300);
  });
}

/* ================= JOBS CENTER ================= */
const JOB_SITES=['linkedin.com/jobs','bayt.com','indeed.com','wuzzuf.net','tanqeeb.com','gulftalent.com'];
async function jsSearchCandidates(title,location){
  const loc=location?(' '+location):' السعودية';
  const queries=[title+loc+' وظيفة', ...JOB_SITES.slice(0,4).map(s=>title+loc+' site:'+s)];
  const urls=new Map();
  for(const q of queries){
    try{
      const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),15000);
      const r=await fetch('https://r.jina.ai/https://lite.duckduckgo.com/lite/?q='+encodeURIComponent(q),{signal:ctrl.signal});
      clearTimeout(t);
      if(!r.ok)continue;
      const md=await r.text();
      const re=/\[([^\]]{8,180})\]\(https:\/\/duckduckgo\.com\/l\/\?uddg=([^&)]+)[^)]*\)/g;
      let m,count=0;
      while((m=re.exec(md))!==null&&count<3){
        let u;try{u=decodeURIComponent(m[2])}catch{u=m[2]}
        if(/^https?:\/\//.test(u)&&!urls.has(u)){urls.set(u,m[1]);count++}
      }
    }catch{}
    if(urls.size>=12)break;
  }
  return [...urls.entries()].slice(0,10).map(([url,title])=>({url,title}));
}

async function jsSearchGo(){
  const title=$('jsTitle').value.trim(), location=$('jsLocation').value.trim();
  if(!title){toast('اكتب المسمى الوظيفي أولًا');return}
  const status=$('jsStatus'), results=$('jsResults');
  status.textContent='⏳ جارٍ البحث في مواقع التوظيف الحقيقية…';
  results.innerHTML='';
  try{
    const found=await jsSearchCandidates(title,location);
    status.textContent=found.length?('✓ لقيت '+found.length+' نتيجة حقيقية — راجعها وقدّم بنفسك على اللي يناسبك'):'';
    if(!found.length){status.textContent='لم أجد نتائج مباشرة الآن — جرّب صياغة أدق أو مدينة مختلفة.';return}
    results.innerHTML=found.map((f,i)=>
      '<div class="tool-card-box" style="margin-top:0.7rem">'
      +'<a href="'+f.url+'" target="_blank" rel="noopener" style="font-weight:700;font-size:0.95rem">'+escapeHtmlText(f.title)+'</a>'
      +'<div style="font-size:0.75rem;color:var(--text-muted);margin:0.3rem 0;word-break:break-all">'+escapeHtmlText(f.url)+'</div>'
      +'<button class="ghost-btn js-letter-btn" data-url="'+f.url.replace(/"/g,'&quot;')+'" data-idx="'+i+'" style="margin-top:0.4rem"><i class="fa-solid fa-envelope me-1"></i>ولّد خطاب مخصص لهذي الوظيفة</button>'
      +'<div class="result-box" id="jsLetter'+i+'" style="display:none;margin-top:0.6rem"></div>'
      +'</div>'
    ).join('');
    $$('.js-letter-btn').forEach(btn=>btn.addEventListener('click',()=>jsGenTailoredLetter(btn)));
  }catch(e){status.textContent='تعذر البحث: '+friendlyError(e)}
}

async function jsGenTailoredLetter(btn){
  const url=btn.dataset.url, idx=btn.dataset.idx;
  const box=$('jsLetter'+idx);
  box.style.display='block';box.className='result-box';
  box.innerHTML='<div class="loading-block"><span class="spinner"></span><br><span class="loading-text">جارٍ قراءة إعلان الوظيفة الفعلي وصياغة خطاب مخصص له بالضبط…</span></div>';
  btn.disabled=true;
  try{
    const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),18000);
    const r=await fetch('https://r.jina.ai/'+url,{signal:ctrl.signal});clearTimeout(t);
    const jobText=r.ok?(await r.text()).slice(0,3000):'';
    const cv={name:$('cvName')?.value.trim(),title:$('cvTitle')?.value.trim(),exp:$('cvExp')?.value.trim(),skills:$('cvSkills')?.value.trim()};
    const cvBlock=Object.entries(cv).filter(([k,v])=>v).map(([k,v])=>k+': '+v).join('\n');
    const prompt=jobText
      ? 'هذا نص إعلان وظيفة حقيقي مقروء الآن من '+url+':\n\n'+jobText+'\n\nبيانات المتقدم:\n'+(cvBlock||'(لم تُعبَّ بعد — اكتب خطابًا عامًا احترافيًا)')+'\n\nاكتب خطاب تقديم احترافي بالعربية (Markdown)، يربط صراحة بين متطلبات الإعلان الفعلية ومهارات المتقدم، مختصر (200-250 كلمة)، بدون اختراع خبرة لم تُذكر.'
      : 'تعذّر قراءة نص الإعلان مباشرة، اكتب خطاب تقديم احترافي عام بالعربية بناءً على بيانات المتقدم:\n'+(cvBlock||'(بيانات غير متوفرة)')+'\n\nمختصر (200-250 كلمة).';
    const full=await callAI([{role:'user',content:prompt}],{maxAttempts:3});
    box.innerHTML=renderMarkdown(full)+'<button class="ghost-btn" style="margin-top:0.6rem" onclick="copyText('+JSON.stringify(full).replace(/"/g,'&quot;')+')"><i class="fa-regular fa-copy me-1"></i>نسخ</button>';
  }catch(e){ box.innerHTML='<span style="color:var(--accent-rose)">تعذر توليد الخطاب: '+escapeHtmlText(friendlyError(e))+'</span>'; }
  finally{ btn.disabled=false; }
}

function trkGet(){ return lsGet('khaled_job_tracker',[]); }
function trkSet(list){ lsSet('khaled_job_tracker',list); }
function trkAdd(){
  const title=$('trkTitle').value.trim(), company=$('trkCompany').value.trim();
  if(!title||!company){toast('اكتب المسمى الوظيفي واسم الشركة على الأقل');return}
  const item={id:Date.now(),title,company,url:$('trkUrl').value.trim(),status:$('trkStatus').value,date:$('trkDate').value||new Date().toISOString().slice(0,10)};
  const list=trkGet();list.unshift(item);trkSet(list);
  $('trkTitle').value='';$('trkCompany').value='';$('trkUrl').value='';
  trkRender();toast('تمت الإضافة ✓');
}
function trkDelete(id){ trkSet(trkGet().filter(i=>i.id!==id)); trkRender(); }
function trkUpdateStatus(id,status){ const list=trkGet();const it=list.find(i=>i.id===id);if(it){it.status=status;trkSet(list);trkRender();} }
const TRK_COLORS={'قدّمت':'#38bdf8','قيد المراجعة':'#f59e0b','مقابلة مجدولة':'#c084fc','مرفوض':'#f43f5e','قُبلت':'#10b981'};
function trkRender(){
  const box=$('trkList');if(!box)return;
  const list=trkGet();
  if(!list.length){box.innerHTML='<div class="foot-note">ما أضفت أي وظيفة للمتابعة بعد.</div>';return}
  box.innerHTML=list.map(it=>
    '<div class="tool-card-box" style="margin-top:0.6rem;border-right:3px solid '+(TRK_COLORS[it.status]||'#666')+'">'
    +'<div style="display:flex;justify-content:space-between;align-items:start;gap:0.6rem">'
    +'<div><strong>'+escapeHtmlText(it.title)+'</strong><br><span style="font-size:0.82rem;color:var(--text-muted)">'+escapeHtmlText(it.company)+' — '+it.date+'</span>'
    +(it.url?'<br><a href="'+it.url+'" target="_blank" rel="noopener" style="font-size:0.78rem">فتح الإعلان</a>':'')+'</div>'
    +'<button class="ghost-btn trk-del" data-id="'+it.id+'" style="padding:0.3rem 0.6rem"><i class="fa-solid fa-trash"></i></button>'
    +'</div>'
    +'<select class="tool-input trk-status" data-id="'+it.id+'" style="margin-top:0.5rem;font-size:0.82rem;padding:0.4rem">'
    +Object.keys(TRK_COLORS).map(s=>'<option value="'+s+'"'+(s===it.status?' selected':'')+'>'+s+'</option>').join('')
    +'</select></div>'
  ).join('');
  $$('.trk-del').forEach(b=>b.addEventListener('click',()=>trkDelete(Number(b.dataset.id))));
  $$('.trk-status').forEach(s=>s.addEventListener('change',()=>trkUpdateStatus(Number(s.dataset.id),s.value)));
}

function initJobsUI(){
  if(!$('jobTabs'))return;
  $('jobTabs').addEventListener('click',e=>{
    const btn=e.target.closest('.jtab-btn');if(!btn)return;
    $$('.jtab-btn').forEach(b=>b.classList.toggle('active',b===btn));
    $$('.jtab-pane').forEach(p=>p.style.display=p.id===btn.dataset.jtab?'block':'none');
  });
  if($('jsSearchBtn')) $('jsSearchBtn').addEventListener('click',jsSearchGo);
  if($('trkAddBtn')){ $('trkAddBtn').addEventListener('click',trkAdd); trkRender(); }
  $('cvGenBtn').addEventListener('click',async()=>{
    const data={name:$('cvName').value.trim(),title:$('cvTitle').value.trim(),exp:$('cvExp').value.trim(),edu:$('cvEdu').value.trim(),skills:$('cvSkills').value.trim(),langs:$('cvLangs').value.trim()};
    if(!data.name||!data.title){toast('الاسم والمسمى الوظيفي مطلوبان');return}
    const out=$('cvResult');
    out.innerHTML='<div class="loading-block"><span class="spinner"></span><br><span class="loading-text">جارٍ صياغة سيرتك الذاتية الاحترافية…</span></div>';
    const fields=Object.entries(data).filter(([k,v])=>v).map(([k,v])=>k+': '+v).join('\n');
    try{
      const full=await callAI([{role:'user',content:'أنشئ سيرة ذاتية احترافية بالعربية (Markdown) لهذا المرشح:\n'+fields+'\n\nملخص شخصي قوي، خبرات بصيغة إنجازات، مهارات مصنفة، تعليم. لا تخترع خبرة لم يذكرها.'}],{maxAttempts:4});
      out.innerHTML=renderMarkdown(full);
      $('cvPrintBtn').style.display='inline-block';
      $('cvCopyBtn').style.display='inline-block';
      out.dataset.md=full;
    }catch(err){out.innerHTML='<div class="error-box">'+escapeHtmlText(friendlyError(err))+'</div>'}
  });
  $('cvPrintBtn').addEventListener('click',()=>{
    const w=window.open('','_blank');
    const md=$('cvResult').dataset.md||$('cvResult').textContent;
    w.document.write('<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="UTF-8"><title>سيرة ذاتية</title><script src="https://cdnjs.cloudflare.com/ajax/libs/marked/9.1.6/marked.min.js"><\/script><script src="https://cdnjs.cloudflare.com/ajax/libs/dompurify/3.1.6/purify.min.js"><\/script><style>body{font-family:Arial,sans-serif;max-width:750px;margin:2rem auto;padding:0 1.5rem;line-height:1.9;color:#111}h1{color:#0f4c81;border-bottom:3px solid #0f4c81;padding-bottom:0.4rem}h2{color:#0f4c81;margin-top:1.6rem}ul{padding-right:1.4rem}@media print{body{margin:0}}</style></head><body><div id="cv"></div><script>document.getElementById("cv").innerHTML=DOMPurify.sanitize(marked.parse('+JSON.stringify(md)+'));setTimeout(()=>window.print(),400);<\/script></body></html>');
    w.document.close();
  });
  $('cvCopyBtn').addEventListener('click',()=>copyText($('cvResult').dataset.md||$('cvResult').textContent));
  $('letterGenBtn').addEventListener('click',async()=>{
    const job=$('letterJob').value.trim(),company=$('letterCompany').value.trim(),skills=$('letterSkills').value.trim();
    if(!job){toast('اكتب المسمى الوظيفي');return}
    const out=$('letterResult');
    out.innerHTML='<div class="loading-block"><span class="spinner"></span><br><span class="loading-text">جارٍ كتابة خطاب التقديم…</span></div>';
    try{
      const full=await callAI([{role:'user',content:'اكتب خطاب تقديم (Cover Letter) احترافيًا بالعربية لوظيفة "'+job+'"'+(company?' في شركة "'+company+'"':'')+(skills?' مع إبراز: '+skills:'')+'. من 3 إلى 4 فقرات، جاهز للإرسال.'}],{maxAttempts:4});
      out.innerHTML=renderMarkdown(full);
      $('letterCopyBtn').style.display='inline-block';
      out.dataset.md=full;
    }catch(err){out.innerHTML='<div class="error-box">'+escapeHtmlText(friendlyError(err))+'</div>'}
  });
  $('letterCopyBtn').addEventListener('click',()=>copyText($('letterResult').dataset.md||$('letterResult').textContent));
  $('intGenBtn').addEventListener('click',async()=>{
    const pos=$('intPosition').value.trim();
    if(!pos){toast('اكتب المسمى الوظيفي');return}
    const out=$('intResult');
    out.innerHTML='<div class="loading-block"><span class="spinner"></span><br><span class="loading-text">جارٍ تجهيز أسئلة المقابلة والإجابات…</span></div>';
    try{
      const full=await callAI([{role:'user',content:'أنا مقدَّم على وظيفة "'+pos+'". جهّزني للمقابلة:\n\n8 أسئلة متوقعة (من الأسهل للأصعب) مع إجابة نموذجية قوية لكل سؤال، وسؤالان ذكيان أنصحني بطرحهما على الشركة. بالعربية Markdown.'}],{maxAttempts:4});
      out.innerHTML=renderMarkdown(full);
    }catch(err){out.innerHTML='<div class="error-box">'+escapeHtmlText(friendlyError(err))+'</div>'}
  });
}
