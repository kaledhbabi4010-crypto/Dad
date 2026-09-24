'use strict';
/* KHALED AI — tools_fix.js (v3): تشخيص جذري متعدد الملفات
   المستخدم يصف "المشكلة" فقط، والمحرك يحدد بنفسه أي الملفات تحتاج قراءة وتعديل. */
function fxRepo(){ const el=$('fxRepoInput'); return el && el.value.trim() ? el.value.trim() : 'kaledhbabi4010-crypto/Dad'; }
const FX_TEXT_EXT=['.html','.css','.js','.json','.py','.md','.txt','.yml','.yaml'];
async function fxListRepoFiles(token){
  try{
    const repoInfo=await fetch('https://api.github.com/repos/'+fxRepo(),{headers:{Authorization:'Bearer '+token,'Accept':'application/vnd.github+json'}});
    if(!repoInfo.ok) return null;
    const info=await repoInfo.json();
    const branch=info.default_branch||'main';
    const treeResp=await fetch('https://api.github.com/repos/'+fxRepo()+'/git/trees/'+branch+'?recursive=1',{headers:{Authorization:'Bearer '+token,'Accept':'application/vnd.github+json'}});
    if(!treeResp.ok) return null;
    const tree=await treeResp.json();
    if(!tree.tree) return null;
    return tree.tree.filter(n=>n.type==='blob' && FX_TEXT_EXT.some(ext=>n.path.endsWith(ext)) && !n.path.startsWith('.git')).map(n=>n.path).slice(0,150);
  }catch{ return null; }
}

const FX_FILES=['index.html','css/app.css','js/core.js','js/tools_ai.js','js/tools_knowledge.js','js/tools_util.js','js/tools_pro.js','js/tools_fix.js','llm_provider_config.json'];
let fxBatch=[];

function fxTok(){return (lsGet('khaled_gh_token','')||'').trim()}

async function fxCheckSyntax(file, content){
  const errors=[];
  if(file.endsWith('.js')){ try{ new Function(content);}catch(e){errors.push('خطأ JS: '+e.message)} }
  if(file.endsWith('.py')){
    const statusEl=$('fxStatus');
    const ready = typeof ensurePyodide==='function' ? await ensurePyodide(statusEl||{textContent:'',className:''}) : false;
    if(!ready){
      errors.push('تعذر تحميل بيئة بايثون للفحص — تحقق من الإنترنت (لن يُنشر الملف بدون فحص فعلي)');
    }else{
      try{
        pyodide.globals.set('__fx_src__', content);
        pyodide.runPython('compile(__fx_src__, "'+file+'", "exec")');
      }catch(e){
        const msg=(e && e.message) ? e.message.split('\n').slice(-3).join(' ') : String(e);
        errors.push('خطأ Python فعلي (SyntaxError حقيقي عبر مُصرّف بايثون نفسه): '+msg);
      }
    }
  }
  if(file.endsWith('.html')){
    [...content.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].forEach((m,i)=>{
      if(!m[1].trim())return;
      try{ new Function(m[1]);}catch(e){errors.push('خطأ JS داخل <script> #'+(i+1)+': '+e.message)}
    });
    ['div','section','script','style'].forEach(tag=>{
      const o=(content.match(new RegExp('<'+tag+'(\\s|>)','gi'))||[]).length;
      const c=(content.match(new RegExp('</'+tag+'>','gi'))||[]).length;
      if(o!==c) errors.push('اختلال توازن <'+tag+'>: فتح '+o+' / إغلاق '+c);
    });
  }
  if(file.endsWith('.json')){ try{ JSON.parse(content);}catch(e){errors.push('JSON غير صالح: '+e.message)} }
  return errors;
}
function fxExtractIdentifiers(c){
  return {ids:new Set([...c.matchAll(/\bid=["']([a-zA-Z0-9_-]+)["']/g)].map(m=>m[1])),
          fns:new Set([...c.matchAll(/\bfunction\s+([a-zA-Z0-9_$]+)\s*\(/g)].map(m=>m[1]))};
}
function fxCheckPreservation(orig, patched){
  const b=fxExtractIdentifiers(orig), a=fxExtractIdentifiers(patched);
  return {missingIds:[...b.ids].filter(x=>!a.ids.has(x)), missingFns:[...b.fns].filter(x=>!a.fns.has(x))};
}
function fxLineDiff(oldT,newT){
  const a=oldT.split('\n'), b=newT.split('\n'), n=a.length, m=b.length;
  const dp=Array.from({length:n+1},()=>new Uint32Array(m+1));
  for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--) dp[i][j]=a[i]===b[j]?dp[i+1][j+1]+1:Math.max(dp[i+1][j],dp[i][j+1]);
  const out=[];let i=0,j=0;
  while(i<n&&j<m){ if(a[i]===b[j]){i++;j++} else if(dp[i+1][j]>=dp[i][j+1]){out.push({t:'-',l:a[i]});i++} else{out.push({t:'+',l:b[j]});j++} }
  while(i<n){out.push({t:'-',l:a[i]});i++} while(j<m){out.push({t:'+',l:b[j]});j++}
  return out;
}
function fxRenderDiff(diffLines){
  const shown=diffLines.filter(d=>d.t!==' ').slice(0,300);
  if(!shown.length) return '(لا فرق ملموس)';
  return shown.map(d=>'<div class="'+(d.t==='+'?'fx-diff-add':'fx-diff-del')+'">'+(d.t==='+'?'+ ':'- ')+escapeHtmlText(d.l)+'</div>').join('');
}

async function fxSelectFiles(problem, token){
  const realFiles=token ? await fxListRepoFiles(token) : null;
  const usableFiles = (realFiles && realFiles.length) ? realFiles : FX_FILES;
  const list=usableFiles.map(f=>'- '+f).join('\n');
  const prompt='مستودع فيه هذي الملفات فعليًا:\n'+list+'\n\nوصف المشكلة: "'+problem+'"\n\nأي الملفات يجب قراءتها لتشخيص وحل هذي المشكلة من جذورها؟ اكتب أسماء الملفات فقط (من القائمة أعلاه بالضبط، بمسارها الكامل)، كل اسم بسطر، بدون أي شرح. لا تختر أكثر من 4 إلا لو ضروري.';
  const reply=await callAI([{role:'user',content:prompt}],{maxAttempts:3});
  const picked=reply.split('\n').map(l=>l.trim().replace(/^[-*]\s*/,'')).filter(l=>usableFiles.includes(l));
  return picked.length?[...new Set(picked)]:[usableFiles[0]];
}

async function fxDiagnoseAndFix(problem, filesContent){
  const block=Object.entries(filesContent).map(([f,c])=>'FILE: '+f+'\n```\n'+c+'\n```').join('\n\n');
  const prompt='أنت مهندس صيانة جذري لموقع ويب حقيقي. هذي الملفات ذات العلاقة:\n\n'+block
    +'\n\nمشكلة المستخدم: "'+problem+'"\n\n'
    +'شخّص السبب الجذري الحقيقي (مو فقط الأعراض)، ثم أصلحه — عدّل ملفات موجودة، أو **أنشئ ملفًا جديدًا كاملًا لو المشكلة فعلًا تحتاج ملفًا جديدًا** (مثلًا ميزة جديدة تستحق ملفها الخاص).\n\n'
    +'أجب بهذا الشكل بالضبط:\n\nROOT_CAUSE:\n(سببان أو ثلاثة أسطر تشرح السبب الجذري الحقيقي، بدليل من الكود نفسه)\n\n'
    +'ثم لكل ملف تحتاج تعديله أو إنشاءه (لا تكرر ملفات ما غيّرتها):\nFILE: (اسم الملف الكامل بمساره، سواء ملف موجود من القائمة أعلاه أو مسار ملف جديد منطقي)\n```\n(محتوى الملف كاملًا بعد التعديل أو الإنشاء، من أول سطر لآخر سطر، بدون اختصار)\n```\n\n'
    +'قواعد صارمة: 1) لا تحذف أي دالة/id إلا لو ضروري للحل 2) عدّل أقل عدد ملفات ممكن 3) لا تكتب أي شيء خارج ROOT_CAUSE وكتل FILE.';
  return await callAI([{role:'user',content:prompt}],{maxAttempts:4,onStatus:s=>{$('fxStatus').textContent='⏳ '+s}});
}

function fxParseMultiFile(reply){
  const rootMatch=reply.match(/ROOT_CAUSE:\s*([\s\S]*?)(?=FILE:|$)/i);
  const rootCause=rootMatch?rootMatch[1].trim():'(لم يوضح النموذج السبب الجذري بشكل منفصل)';
  const fileBlocks=[...reply.matchAll(/FILE:\s*([^\n]+)\n```[a-z]*\s*\n?([\s\S]*?)```/gi)];
  const files={};
  fileBlocks.forEach(m=>{
    const name=m[1].trim().replace(/^\/+/,'');
    // نقبل الملفات المعروفة، أو أي مسار جديد معقول يقترحه الموديل (ملف حقيقي جديد، مو مسار غريب)
    if(FX_FILES.includes(name) || /^[a-zA-Z0-9_.\-\/]+\.[a-zA-Z0-9]+$/.test(name)){
      files[name]=m[2].trim();
    }
  });
  return {rootCause, files};
}

async function fxTestConnection(){
  const token=fxTok(), st=$('fxStatus');
  if(!token){st.style.color='var(--accent-rose)';st.textContent='✗ الصق مفتاح GitHub أولًا';return}
  st.style.color='var(--accent-amber)';st.textContent='⏳ جارٍ التحقق من قدرة الوصول الفعلي لمستودع '+fxRepo()+'…';
  try{
    const r=await fetch('https://api.github.com/repos/'+fxRepo(),{headers:{Authorization:'Bearer '+token,'Accept':'application/vnd.github+json'}});
    if(r.status===401||r.status===403){st.style.color='var(--accent-rose)';st.textContent='✗ المفتاح مرفوض — تأكد من صلاحية Contents:Read/Write ومن أن المستودع صحيح';return}
    if(r.status===404){st.style.color='var(--accent-rose)';st.textContent='✗ المستودع '+fxRepo()+' غير موجود أو المفتاح لا يملك صلاحية رؤيته';return}
    if(!r.ok){st.style.color='var(--accent-rose)';st.textContent='✗ رد غير متوقع من GitHub (HTTP '+r.status+')';return}
    const info=await r.json();
    const rr=await fetch('https://api.github.com/repos/'+fxRepo()+'/contents/index.html',{headers:{Authorization:'Bearer '+token,'Accept':'application/vnd.github+json'}});
    const canReadFile = rr.ok;
    st.style.color='var(--accent-emerald)';
    st.textContent='✓ الاتصال مؤكد فعليًا: المستودع "'+info.full_name+'" ('+(info.private?'خاص':'عام')+') — قراءة الملفات: '+(canReadFile?'تعمل ✓':'فشلت ✗')+' — جاهز الآن لتشغيل الإصلاح';
  }catch(e){ st.style.color='var(--accent-rose)'; st.textContent='✗ تعذر الاتصال بـ GitHub — تحقق من إنترنتك'; }
}

async function fxRun(){
  const token=fxTok(), problem=$('fxCmd').value.trim();
  const st=$('fxStatus'), pv=$('fxPreview'), commitBtn=$('fxCommitBtn');
  commitBtn.style.display='none'; pv.style.display='none'; pv.innerHTML=''; fxBatch=[];

  if(!token){st.style.color='var(--accent-rose)';st.textContent='✗ الصق مفتاح GitHub أولًا';return}
  if(!problem){st.style.color='var(--accent-rose)';st.textContent='✗ اكتب وصف المشكلة اللي تواجهها';return}

  st.style.color='var(--accent-amber)'; st.textContent='⏳ 1/5 — تحديد الملفات ذات العلاقة بالمشكلة…';
  let targetFiles;
  try{ targetFiles=await fxSelectFiles(problem, token); }
  catch(e){ st.style.color='var(--accent-rose)'; st.textContent='✗ تعذر تحديد الملفات: '+friendlyError(e); return; }

  st.textContent='⏳ 2/5 — جارٍ قراءة '+targetFiles.length+' ملف من المستودع ('+targetFiles.join('، ')+')…';
  const filesContent={}, filesMeta={};
  for(const f of targetFiles){
    try{
      const r=await fetch('https://api.github.com/repos/'+fxRepo()+'/contents/'+f,{headers:{Authorization:'Bearer '+token,'Accept':'application/vnd.github+json'}});
      if(!r.ok){ st.style.color='var(--accent-rose)'; st.textContent='✗ تعذر قراءة '+f+' (HTTP '+r.status+')'; return; }
      const meta=await r.json();
      filesContent[f]=atob((meta.content||'').replace(/\n/g,''));
      filesMeta[f]=meta.sha;
    }catch(e){ st.style.color='var(--accent-rose)'; st.textContent='✗ تعذر الاتصال بـ GitHub عند قراءة '+f; return; }
  }

  st.textContent='⏳ 3/5 — جارٍ التشخيص الجذري وتوليد الحل…';
  let reply;
  try{ reply=await fxDiagnoseAndFix(problem, filesContent); }
  catch(e){ st.style.color='var(--accent-rose)'; st.textContent='✗ تعذر توليد الحل: '+friendlyError(e); return; }

  const {rootCause, files:patchedFiles}=fxParseMultiFile(reply);
  if(!Object.keys(patchedFiles).length){
    st.style.color='var(--accent-rose)'; st.textContent='✗ النموذج لم يُرجع أي ملف معدّل — أعد صياغة وصف المشكلة بتفصيل أكثر';
    pv.style.display='block'; pv.innerHTML='<div class="fx-plan"><strong>السبب المذكور:</strong><br>'+escapeHtmlText(rootCause)+'</div>';
    return;
  }

  st.textContent='⏳ 4/5 — التحقق الآلي من كل ملف (صحة الكود + بقاء الدوال)…';
  let reportHtml='<div class="fx-plan"><strong>🧭 السبب الجذري المكتشف:</strong><br>'+escapeHtmlText(rootCause).replace(/\n/g,'<br>')+'</div>';
  let anyPassed=false;

  for(const [file, patched] of Object.entries(patchedFiles)){
    const isNewFile = !(file in filesContent);
    const original = filesContent[file] || '';
    if(!patched || (!isNewFile && patched.length<original.length*0.5)){
      reportHtml+='<div class="fx-block" style="color:var(--accent-rose);margin-top:14px"><strong>🚫 '+file+' — رُفض (الملف انبتر: '+(patched?patched.length:0)+' من '+original.length+' حرفًا)</strong></div>';
      continue;
    }
    const synErrors=await fxCheckSyntax(file, patched);
    const preserve=isNewFile ? {missingIds:[],missingFns:[]} : fxCheckPreservation(original, patched);
    const blocking = synErrors.length>0 || preserve.missingFns.length>0;
    const diff=isNewFile ? patched.split('\n').map(l=>({t:'+',l})) : fxLineDiff(original, patched);

    reportHtml+='<div style="margin-top:16px;border-top:1px solid rgba(255,255,255,.12);padding-top:10px">'
      +'<strong>📄 '+file+' '+(isNewFile?'<span style="color:var(--accent-teal,#4fb8ae)">(ملف جديد)</span>':'')+' — '+(blocking?'<span style="color:var(--accent-rose)">فشل التحقق ✗</span>':'<span style="color:var(--accent-emerald)">اجتاز التحقق ✓</span>')+'</strong>';
    if(synErrors.length) reportHtml+='<div style="color:var(--accent-rose);margin-top:6px">أخطاء: '+synErrors.map(escapeHtmlText).join('<br>')+'</div>';
    if(preserve.missingFns.length) reportHtml+='<div style="color:var(--accent-rose);margin-top:6px">دوال اختفت: '+preserve.missingFns.join(', ')+'</div>';
    if(preserve.missingIds.length) reportHtml+='<div style="color:var(--accent-amber);margin-top:6px">⚠ معرّفات id اختفت (راجعها يدويًا): '+preserve.missingIds.join(', ')+'</div>';
    reportHtml+='<div class="fx-diff-box">'+fxRenderDiff(diff)+'</div></div>';

    if(!blocking){
      anyPassed=true;
      fxBatch.push({file, content:patched, sha:filesMeta[file], message:'fix-engine: '+(isNewFile?'إنشاء ':'')+problem.slice(0,80), passed:true, isNewFile});
    }
  }

  pv.style.display='block'; pv.innerHTML=reportHtml;
  st.textContent='⏳ 5/5 — جاهز للمراجعة';

  if(!anyPassed){
    st.style.color='var(--accent-rose)'; st.textContent='✗ ولا ملف اجتاز التحقق الآلي — لن يظهر زر النشر. راجع الأخطاء أعلاه';
    return;
  }
  st.style.color='var(--accent-emerald)';
  st.textContent='✓ '+fxBatch.length+' من '+Object.keys(patchedFiles).length+' ملف اجتاز التحقق — راجع الفرق ثم أكّد النشر (الملفات الفاشلة لن تُنشر تلقائيًا)';
  commitBtn.style.display='inline-block'; commitBtn.disabled=false;
}

async function fxCommit(){
  if(!fxBatch.length)return;
  const st=$('fxStatus'), token=fxTok();
  let okCount=0;
  for(const item of fxBatch){
    st.style.color='var(--accent-amber)'; st.textContent='⏳ جارٍ نشر '+item.file+'…';
    try{
      const b64=btoa(unescape(encodeURIComponent(item.content)));
      const r=await fetch('https://api.github.com/repos/'+fxRepo()+'/contents/'+item.file,{
        method:'PUT',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
        body:JSON.stringify({message:item.message,content:b64,sha:item.sha})});
      if(r.ok) okCount++;
      else{ let d='';try{d=(await r.json()).message||''}catch{}; st.style.color='var(--accent-rose)'; st.textContent='✗ فشل نشر '+item.file+' (HTTP '+r.status+') '+d; return; }
    }catch(e){ st.style.color='var(--accent-rose)'; st.textContent='✗ تعذر الاتصال بـ GitHub أثناء نشر '+item.file; return; }
  }
  st.style.color='var(--accent-emerald)';
  st.textContent='✅ تم نشر '+okCount+' ملف بنجاح! GitHub Pages سيحدّث الموقع خلال دقيقتين';
  fxBatch=[]; $('fxCommitBtn').style.display='none';
}

function initFixUI(){
  if(!$('fxRunBtn'))return;
  const saved=fxTok(); if(saved)$('fxToken').value=saved;
  $('fxToken').addEventListener('change',()=>lsSet('khaled_gh_token',$('fxToken').value.trim()));

  const savedRepo=lsGet('khaled_fx_repo','');
  if($('fxRepoInput')){
    $('fxRepoInput').value=savedRepo;
    $('fxRepoInput').addEventListener('change',()=>lsSet('khaled_fx_repo',$('fxRepoInput').value.trim()));
  }
  if($('fxEngineLabel')) $('fxEngineLabel').textContent=engineLabel();
  if($('fxChangeEngineBtn')) $('fxChangeEngineBtn').addEventListener('click',()=>showView('settings'));

  const sel=$('fxFile');
  if(sel){
    sel.innerHTML='';
    const autoOpt=document.createElement('option'); autoOpt.value='__auto__'; autoOpt.textContent='🔍 تحديد تلقائي حسب المشكلة (موصى به)';
    sel.appendChild(autoOpt);
    FX_FILES.forEach(f=>{const o=document.createElement('option'); o.value=f; o.textContent=f; sel.appendChild(o)});
  }
  const cmdBox=$('fxCmd');
  if(cmdBox) cmdBox.placeholder='صف مشكلتك بالتفصيل — مثال: "الشات ما يرد ويقول تعذر الاتصال بمحرك Groq" — المحرك يحدد بنفسه أي الملفات تحتاج فحص';

  $('fxRunBtn').addEventListener('click',fxRun);
  $('fxCommitBtn').addEventListener('click',fxCommit);
  if($('fxTestBtn')) $('fxTestBtn').addEventListener('click',fxTestConnection);

  if(!$('fxDiffStyles')){
    const style=document.createElement('style'); style.id='fxDiffStyles';
    style.textContent='.fx-diff-box{max-height:320px;overflow:auto;font-family:monospace;font-size:0.8rem;background:rgba(0,0,0,0.25);border-radius:8px;padding:10px;margin-top:6px}'
      +'.fx-diff-add{color:#4ade80;white-space:pre-wrap}.fx-diff-del{color:#f87171;white-space:pre-wrap;text-decoration:line-through;opacity:.75}'
      +'.fx-plan{background:rgba(255,255,255,0.04);border-radius:8px;padding:10px;font-size:0.85rem}';
    document.head.appendChild(style);
  }
}
