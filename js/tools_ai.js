'use strict';
/* KHALED AI SUITE — tools_ai.js: chat, image generator, translator, summarizer */

/* ---------- طبقات مصداقية المصادر — تصنيف حقيقي بسيط يفرّق موقعًا موثوقًا عن آخر مجهول ---------- */
const TRUSTED_TIER1=['wikipedia.org','.gov','.gov.sa','who.int','un.org','reuters.com','apnews.com','bbc.com','bbc.co.uk','nature.com','sciencedirect.com','.edu'];
const TRUSTED_TIER2=['aljazeera.net','cnn.com','theguardian.com','nytimes.com','bloomberg.com','forbes.com','aramco.com','spa.gov.sa'];
function sourceCredibility(url){
  const u=url.toLowerCase();
  if(TRUSTED_TIER1.some(d=>u.includes(d)))return 'عالية (مصدر رسمي/أكاديمي/إخباري كبير معروف)';
  if(TRUSTED_TIER2.some(d=>u.includes(d)))return 'متوسطة-عالية (مصدر إخباري معروف)';
  return 'غير مؤكدة — مصدر غير مصنّف، تعامل معه بحذر إضافي';
}

/* ---------- وضع "التأصيل الإجباري": يقلل الهلوسة بربط الإجابة بمصادر بحث حقيقية فقط ---------- */
async function chatFetchGroundingSources(query){
  const sources=[];
  try{
    const url='https://ar.wikipedia.org/w/api.php?action=query&list=search&srsearch='+encodeURIComponent(query)+'&format=json&origin=*&srlimit=3&srprop=snippet';
    const r=await fetch(url);const d=await r.json();
    (d.query&&d.query.search?d.query.search:[]).forEach(h=>sources.push({title:h.title,url:'https://ar.wikipedia.org/wiki/'+encodeURIComponent(h.title.replace(/ /g,'_')),snippet:stripHtml(h.snippet)}));
  }catch{}
  try{
    const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),15000);
    const r=await fetch('https://r.jina.ai/https://lite.duckduckgo.com/lite/?q='+encodeURIComponent(query),{signal:ctrl.signal});clearTimeout(t);
    if(r.ok){
      const md=await r.text();
      const re=/\d+\.\[([^\]]{5,150})\]\(https:\/\/duckduckgo\.com\/l\/\?uddg=([^&)]+)[^)]*\)([^\n]*)/g;
      let m,count=0;
      while((m=re.exec(md))!==null&&count<6){
        let u;try{u=decodeURIComponent(m[2])}catch{u=m[2]}
        if(/^https?:\/\//.test(u)){sources.push({title:m[1],url:u,snippet:(m[3]||'').replace(/\*\*/g,'').trim().slice(0,200)});count++}
      }
    }
  }catch{}
  // اقرأ الصفحة كاملة فعليًا (مو مجرد مقتطف بحث) لأعلى 4 مصادر، بترتيب حسب المصداقية أولًا
  sources.sort((a,b)=>{
    const rank=s=>sourceCredibility(s.url).startsWith('عالية')?0:sourceCredibility(s.url).startsWith('متوسطة')?1:2;
    return rank(a)-rank(b);
  });
  const toRead=sources.slice(0,4);
  await Promise.all(toRead.map(async s=>{
    const text=await fetchPageText(s.url,3000);
    if(text) s.fullText=text;
  }));
  sources.forEach(s=>{ s.credibility=sourceCredibility(s.url); });
  return sources;
}
async function callAIGrounded(userQuestion,history,opts={}){
  if(opts.onStatus)opts.onStatus('⏳ جارٍ البحث وتصنيف المصادر حسب المصداقية…');
  const sources=await chatFetchGroundingSources(userQuestion);
  if(!sources.length){
    if(opts.onStatus)opts.onStatus(null);
    return {text:await callAI([...history,{role:'user',content:userQuestion+'\n\n(تنبيه: لم يتوفر بحث حي لهذا السؤال — أجب بحذر وصرّح بعدم اليقين إن لم تكن متأكدًا تمامًا)'}],opts), sources:[]};
  }
  if(opts.onStatus)opts.onStatus('⏳ جارٍ قراءة أهم '+sources.filter(s=>s.fullText).length+' صفحة كاملة والتحقق من التطابق بينها…');
  const srcBlock=sources.map((s,i)=>'['+(i+1)+'] '+s.title+' — مصداقية المصدر: '+s.credibility+'\nرابط: '+s.url+'\n'+(s.fullText?'محتوى كامل مقروء فعليًا:\n'+s.fullText:'مقتطف فقط: '+s.snippet)).join('\n\n');
  const grounded='سؤال المستخدم: "'+userQuestion+'"\n\nمصادر بحث حقيقية (بعضها مقروء بالكامل، مصنّفة حسب المصداقية):\n\n'+srcBlock
    +'\n\nقواعد صارمة إجبارية:\n'
    +'1) أجب فقط بناءً على المصادر أعلاه — ممنوع إضافة أي معلومة من معرفتك الخاصة غير مذكورة فيها.\n'
    +'2) استخدم [1] [2] لعزو كل معلومة لمصدرها بدقة.\n'
    +'3) رجّح دائمًا المصادر عالية المصداقية عند التعارض، ووضّح صراحة إذا تعارضت مصادر مع بعضها.\n'
    +'4) لو مصدر مصداقيته "غير مؤكدة"، نبّه القارئ بذلك صراحة عند الاستشهاد به.\n'
    +'5) لو المصادر لا تكفي للإجابة كاملة، صرّح بذلك بدل التخمين. 6) لا تخترع أي رقم أو اسم أو تاريخ غير موجود حرفيًا بالمصادر.';
  if(opts.onStatus)opts.onStatus('⏳ جارٍ صياغة إجابة مؤصّلة ومتحقق من تطابقها بين المصادر…');
  const full=await callAI([...history,{role:'user',content:grounded}],{...opts});
  return {text:full, sources};
}

/* ---------- التحكم بالمحركات مباشرة من الشات ---------- */
const ENGINE_ALIASES={
  groq:['groq','جروك'], gemini:['gemini','جيميني','جيمناي','جوجل'], openai:['chatgpt','gpt','openai','اوبن ای','تشات جي بي تي','شات جي بي تي'],
  deepseek:['deepseek','ديب سيك'], qwen:['qwen','كوين'], openrouter:['openrouter','اوبن راوتر'],
  mistral:['mistral','ميسترال'], together:['together','توجذر'], cohere:['cohere','كوهير'], pollinations:['pollinations','المجاني','بولينيشنز']
};
function chatParseEngineSwitch(text){
  const t=text.trim().toLowerCase();
  const isSwitchCmd=/^(استخدم|بدّل|بدل|شغّل|شغل|فعّل|فعل|غيّر|غير)(\s|$)/.test(t) || /^use(\s|$)/.test(t);
  if(!isSwitchCmd)return null;
  for(const [id,aliases] of Object.entries(ENGINE_ALIASES)){
    if(aliases.some(a=>t.includes(a))) return id;
  }
  return null;
}
async function chatTrySwitchEngine(text){
  const targetId=chatParseEngineSwitch(text);
  if(!targetId || !ENGINES[targetId]) return false;
  const st=getEngineState();
  const cfg=ENGINES[targetId];
  if(!cfg.keyless && !(st.id===targetId && st.key)){
    // نتحقق هل عندنا مفتاح محفوظ سابقًا لهذا المحرك تحديدًا
    const savedKey=lsGet('khaled_key_'+targetId,'');
    if(!savedKey){
      const els=chatAppendMessage('assistant','⚠ محرك **'+cfg.name+'** يحتاج مفتاح API ولا يوجد مفتاح محفوظ له. أضفه أولًا من ⚙ المحركات ثم اختره من هناك مرة، وبعدها أقدر أبدّل لك بينه وبين غيره من الشات مباشرة.');
      chatCurrent().messages.push({role:'assistant',content:els.bubble.textContent});chatPersist();
      return true;
    }
    setEngineState({id:targetId,key:savedKey,model:'',url:''});
  }else{
    setEngineState({id:targetId,key:st.id===targetId?st.key:(lsGet('khaled_key_'+targetId,'')),model:'',url:''});
  }
  updateEngineTag();
  const els=chatAppendMessage('assistant','✅ تم التبديل إلى محرك **'+cfg.name+'** — أي رسالة بعد كذا بتستخدمه.');
  chatCurrent().messages.push({role:'assistant',content:'تم التبديل إلى محرك '+cfg.name});chatPersist();
  return true;
}

/* ================= CHAT ================= */
let sessions=[],activeSessionId=null,isGenerating=false,abortController=null;
let pendingAttachment=null; // {kind:'file'|'image', name, text, dataUrl}
const CHAT_TEXT_EXT=['.txt','.md','.csv','.json','.js','.ts','.py','.html','.css','.log','.xml','.yaml','.yml'];

async function chatFetchLinkContext(text){
  const m=text.match(/https?:\/\/[^\s)]+/);
  if(!m)return '';
  const content=await fetchPageText(m[0],6000);
  if(!content)return '';
  return '\n\n--- محتوى الرابط ('+m[0]+') ---\n'+content+'\n--- نهاية محتوى الرابط ---\n';
}

function chatSetAttachment(file){
  const name=file.name.toLowerCase();
  const isImage=file.type.startsWith('image/');
  const isText=CHAT_TEXT_EXT.some(ext=>name.endsWith(ext)) || file.type.startsWith('text/');
  if(isImage){
    const engineVision=ENGINES[getEngineState().id]&&ENGINES[getEngineState().id].vision;
    if(!engineVision){toast('المحرك الحالي لا يدعم تحليل الصور — فعّل Gemini من ⚙ المحركات أولًا');return}
    const reader=new FileReader();
    reader.onload=()=>{pendingAttachment={kind:'image',name:file.name,dataUrl:reader.result};chatRenderAttachmentChip()};
    reader.readAsDataURL(file);
  }else if(isText){
    if(file.size>300000){toast('الملف كبير جدًا (الحد 300 كيلوبايت للملفات النصية)');return}
    const reader=new FileReader();
    reader.onload=()=>{
      const raw=String(reader.result);
      const truncated=raw.length>12000;
      pendingAttachment={kind:'file',name:file.name,text:raw.slice(0,12000),truncated};
      chatRenderAttachmentChip();
      if(truncated) toast('⚠ الملف طويل — تم إرسال أول 12,000 حرف فقط من أصل '+raw.length.toLocaleString('ar'));
    };
    reader.readAsText(file);
  }else{
    toast('نوع الملف غير مدعوم هنا — يدعم الشات ملفات نصية (txt, md, json, csv…) والصور فقط');
  }
}
function chatRenderAttachmentChip(){
  const box=$('chatAttachChip');if(!box)return;
  if(!pendingAttachment){box.style.display='none';box.innerHTML='';return}
  box.style.display='flex';
  const icon=pendingAttachment.kind==='image'?'fa-image':'fa-file-lines';
  box.innerHTML='<i class="fa-solid '+icon+' me-1"></i><span></span><button type="button" id="chatAttachRemove" title="إزالة">✕</button>';
  box.querySelector('span').textContent=pendingAttachment.name+(pendingAttachment.truncated?' (⚠ سيُرسل أول جزء فقط — الملف أطول من الحد المدعوم)':'');
  box.querySelector('#chatAttachRemove').addEventListener('click',()=>{pendingAttachment=null;chatRenderAttachmentChip()});
}

(function initChat(){
  sessions=lsGet('khaled_sessions_v2',[]);
  activeSessionId=lsGet('khaled_active_session_v2',null);
  if(!Array.isArray(sessions))sessions=[];
  if(!sessions.length)chatCreateSession('محادثة جديدة',false);
  if(!activeSessionId||!sessions.find(s=>s.id===activeSessionId))activeSessionId=sessions[0].id;
})();
function chatPersist(){lsSet('khaled_sessions_v2',sessions.slice(0,40));lsSet('khaled_active_session_v2',activeSessionId)}
function chatCurrent(){return sessions.find(s=>s.id===activeSessionId)}
function chatCreateSession(title,save=true){const s={id:'s_'+Date.now()+'_'+Math.random().toString(36).slice(2,7),title:title||'محادثة جديدة',messages:[],created:Date.now()};sessions.unshift(s);activeSessionId=s.id;if(save){chatPersist();chatRenderSessions();chatRenderMessages()}return s}
function chatDeleteSession(id){sessions=sessions.filter(s=>s.id!==id);if(activeSessionId===id)activeSessionId=sessions[0]?.id||null;if(!sessions.length)chatCreateSession('محادثة جديدة',false);chatPersist();chatRenderSessions();chatRenderMessages()}
function chatRenderSessions(){
  const list=$('sessionsList');if(!list)return;list.innerHTML='';
  sessions.forEach(s=>{const div=document.createElement('div');div.className='session-item'+(s.id===activeSessionId?' active':'');
    div.innerHTML='<span class="session-title"></span><button class="session-del" title="حذف"><i class="fa-solid fa-xmark"></i></button>';
    div.querySelector('.session-title').textContent=s.title;
    div.addEventListener('click',e=>{if(e.target.closest('.session-del'))return;activeSessionId=s.id;chatPersist();chatRenderSessions();chatRenderMessages();if(window.innerWidth<=768)$('chatSidebar').classList.add('hidden')});
    div.querySelector('.session-del').addEventListener('click',()=>chatDeleteSession(s.id));list.appendChild(div)});
}
function chatBuildWelcome(){
  const div=document.createElement('div');div.className='welcome-hero';
  div.innerHTML='<div class="hero-icon"><i class="fa-solid fa-robot"></i></div><h2 style="font-weight:800;font-size:1.4rem;margin-bottom:0.5rem">أهلاً بك 👋</h2><p style="color:var(--text-muted);font-size:0.9rem;line-height:1.8;margin-bottom:0.6rem">اسألني أي شيء — مع إعادة محاولة تلقائية ذكية عند انشغال الخدمة.</p><div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.35);border-radius:10px;padding:0.5rem 0.8rem;font-size:0.78rem;color:#fbbf24;margin-bottom:1.2rem;line-height:1.7">💡 لم تصلك الردود؟ المحرك المجاني مزدحم (طلب واحد لكل IP وإنترنت الجوال مشترك بين مئات المستخدمين) — الحل الدائم: مفتاح Groq مجاني بـ30 ثانية من زر «المحركات ⚙» بالأعلى.</div><div class="welcome-suggestions"></div>';
  const sug=div.querySelector('.welcome-suggestions');
  [['🧠 اشرح لي','الفرق بين الذكاء الاصطناعي والتعلم العميق'],['💻 اكتب كود','كود بايثون يحلل ملف CSV'],['✍️ قصيدة','قصيدة قصيرة عن الطموح والأمل'],['📚 خطة دراسة','خطة دراسة للرياضيات في شهر']].forEach(([t,p])=>{
    const c=document.createElement('div');c.className='suggestion-card';
    c.innerHTML='<div class="s-title"></div><div class="s-desc"></div>';
    c.querySelector('.s-title').textContent=t;c.querySelector('.s-desc').textContent=p;
    c.addEventListener('click',()=>chatSend(p));sug.appendChild(c)});
  return div;
}
function chatRenderMessages(){
  const el=$('chatMessages');if(!el)return;el.innerHTML='';
  const s=chatCurrent();
  if(!s||!s.messages.length){el.appendChild(chatBuildWelcome())}
  else{s.messages.forEach(m=>chatAppendMessage(m.role,m.content,{animate:false}));chatScroll(false)}
}
function chatAttachTools(bubble,finalText){
  if(!bubble||bubble.parentNode.querySelector('.msg-tools'))return;
  const tools=document.createElement('div');tools.className='msg-tools';
  tools.innerHTML='<button class="tool-chip tts-btn"><i class="fa-solid fa-volume-high me-1"></i>استمع</button><button class="tool-chip"><i class="fa-regular fa-copy me-1"></i>نسخ</button>';
  const btns=tools.querySelectorAll('.tool-chip');
  btns[0].addEventListener('click',()=>speakText(finalText));
  btns[1].addEventListener('click',()=>copyText(finalText));
  bubble.parentNode.appendChild(tools);
}
function chatAppendMessage(role,content,opts={}){
  const el=$('chatMessages');if(!el)return null;
  const hero=el.querySelector('.welcome-hero');if(hero)hero.remove();
  const row=document.createElement('div');row.className='msg-row '+role;
  row.innerHTML='<div class="avatar-box '+(role==='user'?'avatar-user':'avatar-ai')+'"><i class="fa-solid '+(role==='user'?'fa-user':'fa-robot')+'"></i></div><div class="msg-body"><div class="msg-sender">'+(role==='user'?'أنت':'KHALED AI')+'</div><div class="msg-bubble"></div></div>';
  const bubble=row.querySelector('.msg-bubble');
  if(opts.raw){bubble.innerHTML=content}
  else{bubble.innerHTML=renderMarkdown(content);enhanceCodeBlocks(bubble)}
  if(role==='assistant'&&!opts.raw){
    const tools=document.createElement('div');tools.className='msg-tools';
    tools.innerHTML='<button class="tool-chip tts-btn"><i class="fa-solid fa-volume-high me-1"></i>استمع</button><button class="tool-chip"><i class="fa-regular fa-copy me-1"></i>نسخ</button>';
    const btns=tools.querySelectorAll('.tool-chip');
    btns[0].addEventListener('click',()=>speakText(content));
    btns[1].addEventListener('click',()=>copyText(content));
    bubble.parentNode.appendChild(tools);
  }
  if(!opts.animate)row.style.animation='none';
  el.appendChild(row);
  if(opts.scroll!==false)chatScroll();
  return{row,bubble};
}
function chatScroll(smooth=true){const el=$('chatMessages');if(el)el.scrollTo({top:el.scrollHeight,behavior:smooth?'smooth':'auto'})}
function chatSetGeneratingUI(g){
  const sendBtn=$('sendBtn');if(!sendBtn)return;
  sendBtn.disabled=g;
  if(g){sendBtn.innerHTML='<i class="fa-solid fa-stop"></i>';sendBtn.classList.remove('btn-send');sendBtn.classList.add('btn-stop');
    sendBtn.onclick=e=>{e.preventDefault();if(abortController)abortController.abort()}}
  else{sendBtn.innerHTML='<i class="fa-solid fa-paper-plane"></i>';sendBtn.classList.add('btn-send');sendBtn.classList.remove('btn-stop');sendBtn.onclick=null}
}
async function chatSend(text){
  if(isGenerating)return;
  let prompt=(text!==undefined?text:$('userInput').value).trim();
  const attach=pendingAttachment;
  if(!prompt&&!attach)return;
  if(prompt.length>MAX_INPUT_CHARS){toast('النص طويل جدًا (الحد '+MAX_INPUT_CHARS+' حرفًا)');return}

  const priceIntent=/^(قارن|ابحث عن)?\s*(سعر|اسعار|أسعار|ارخص|أرخص)(\s|$)/.test(prompt) && !attach;
  if(!priceIntent && !attach && chatParseEngineSwitch(prompt)){
    const s0=chatCurrent()||chatCreateSession('محادثة');
    s0.messages.push({role:'user',content:prompt});
    chatAppendMessage('user',prompt);
    $('userInput').value='';$('userInput').style.height='auto';chatUpdateCount();
    chatPersist();chatRenderSessions();
    await chatTrySwitchEngine(prompt);
    chatScroll();
    return;
  }
  if(priceIntent){
    const s=chatCurrent()||chatCreateSession('محادثة');
    isGenerating=true;abortController=new AbortController();chatSetGeneratingUI(true);
    s.messages.push({role:'user',content:prompt});
    if(s.messages.length===1)s.title=prompt.slice(0,40);
    chatAppendMessage('user',prompt);
    $('userInput').value='';$('userInput').style.height='auto';chatUpdateCount();
    chatPersist();chatRenderSessions();
    const els=chatAppendMessage('assistant','',{raw:true});const bubble=els.bubble;
    bubble.innerHTML='<span class="typing-cursor"></span><span style="color:var(--text-muted);font-size:0.85rem"> 🛒 وضع مقارنة الأسعار الحقيقية مفعّل تلقائيًا…</span>';
    const productQuery=prompt.replace(/^(قارن|ابحث عن)?\s*(سعر|اسعار|أسعار|ارخص|أرخص)\b/,'').trim()||prompt;
    try{
      const res=await priceCompareRun(productQuery, status=>{
        bubble.innerHTML='<span class="typing-cursor"></span><div class="auto-retry-note">'+escapeHtmlText(status)+'</div>';
      });
      const report=priceRenderReport(productQuery,res);
      bubble.innerHTML=renderMarkdown(report);enhanceCodeBlocks(bubble);chatAttachTools(bubble,report);
      s.messages.push({role:'assistant',content:report});chatPersist();chatScroll();
    }catch(e){
      bubble.innerHTML='<span style="color:var(--accent-rose)">✗ تعذر تشغيل محرك مقارنة الأسعار: '+escapeHtmlText(friendlyError(e))+'</span>';
    }finally{
      isGenerating=false;abortController=null;chatSetGeneratingUI(false);chatScroll();
    }
    return;
  }
  const s=chatCurrent()||chatCreateSession('محادثة');
  isGenerating=true;abortController=new AbortController();chatSetGeneratingUI(true);

  let displayContent=prompt;
  if(attach&&attach.kind==='file'){ displayContent+= (displayContent?'\n':'') + '📎 '+attach.name; }
  if(attach&&attach.kind==='image'){ displayContent+= (displayContent?'\n':'') + '🖼️ '+attach.name; }
  s.messages.push({role:'user',content:displayContent||('📎 '+(attach?attach.name:''))});
  if(s.messages.length===1)s.title=(prompt||attach.name).slice(0,40)+((prompt||attach.name).length>40?'…':'');
  chatAppendMessage('user',displayContent);
  $('userInput').value='';$('userInput').style.height='auto';chatUpdateCount();
  pendingAttachment=null;chatRenderAttachmentChip();
  chatPersist();chatRenderSessions();
  const els=chatAppendMessage('assistant','',{raw:true});const bubble=els.bubble;
  bubble.innerHTML='<span class="typing-cursor"></span><span style="color:var(--text-muted);font-size:0.85rem"> يفكر…</span>';

  // ابنِ محتوى آخر رسالة فعليًا يُرسل للذكاء الاصطناعي (قد يختلف عمّا يظهر في الفقاعة)
  let sentText=prompt;
  if(attach&&attach.kind==='file'){
    sentText += '\n\n--- محتوى الملف المرفق ('+attach.name+') ---\n'+attach.text+'\n--- نهاية الملف ---';
  }
  if(!attach||attach.kind!=='image'){
    bubble.innerHTML='<span class="typing-cursor"></span><span style="color:var(--text-muted);font-size:0.85rem"> جارٍ التحقق من أي رابط بالرسالة…</span>';
    const linkCtx=await chatFetchLinkContext(prompt);
    if(linkCtx) sentText += linkCtx;
    bubble.innerHTML='<span class="typing-cursor"></span><span style="color:var(--text-muted);font-size:0.85rem"> يفكر…</span>';
  }

  const context=s.messages.slice(0,-1).slice(-15).map(m=>({role:m.role,content:m.content}));
  const profCtx=(typeof profileContext==='function')?profileContext():'';
  let lastUserMsg;
  if(attach&&attach.kind==='image'){
    lastUserMsg={role:'user',content:[{type:'text',text:(sentText||'صف هذي الصورة بالتفصيل')+profCtx},{type:'image_url',image_url:{url:attach.dataUrl}}]};
  }else{
    lastUserMsg={role:'user',content:sentText+profCtx};
  }
  context.push(lastUserMsg);

  const smart=lsGet('khaled_smart_mode',false);
  const grounded=lsGet('khaled_grounded_mode',false) && (!attach || attach.kind!=='image');
  try{
    let full, groundSources=[];
    if(grounded){
      const res=await callAIGrounded(sentText, context.slice(0,-1), {signal:abortController.signal,onStatus:status=>{
        bubble.innerHTML='<span class="typing-cursor"></span><div class="auto-retry-note">'+escapeHtmlText(status||'')+'</div>'
      }});
      full=res.text; groundSources=res.sources;
      let srcHtml='';
      if(groundSources.length){
        srcHtml='<div class="grounding-sources" style="margin-top:0.6rem;font-size:0.78rem;opacity:0.85"><strong>📚 المصادر:</strong><br>'+groundSources.map((s,i)=>'['+(i+1)+'] <a href="'+s.url+'" target="_blank" rel="noopener">'+escapeHtmlText(s.title)+'</a>').join('<br>')+'</div>';
      }
      bubble.innerHTML=renderMarkdown(full)+srcHtml;enhanceCodeBlocks(bubble);chatAttachTools(bubble,full);
    }else if(smart){
      full=await callAISmart(context,{signal:abortController.signal,onStatus:status=>{
        bubble.innerHTML='<span class="typing-cursor"></span><div class="auto-retry-note">'+escapeHtmlText(status)+'</div>'
      }});
      bubble.innerHTML=renderMarkdown(full);enhanceCodeBlocks(bubble);chatAttachTools(bubble,full);
    }else{
      full=await callAI(context,{signal:abortController.signal,onChunk:partial=>{
        bubble.innerHTML=renderMarkdown(partial)+'<span class="typing-cursor"></span>';enhanceCodeBlocks(bubble);chatScroll(false)
      },onStatus:status=>{
        bubble.innerHTML='<span class="typing-cursor"></span><div class="auto-retry-note">'+escapeHtmlText(status)+'</div>'
      }});
      bubble.innerHTML=renderMarkdown(full);enhanceCodeBlocks(bubble);chatAttachTools(bubble,full);
    }
    s.messages.push({role:'assistant',content:full});chatPersist();chatScroll();
  }catch(err){
    if(err.name==='AbortError'){bubble.innerHTML='<div class="error-box">⏹ تم إيقاف توليد الرد.</div>'}
    else{
      bubble.innerHTML='<div class="error-box"><strong>تعذر الحصول على رد:</strong> '+escapeHtmlText(friendlyError(err))+'<br><span class="retry-link">↻ أعد المحاولة</span> — أو <span class="retry-link" id="goEngines">⚙ فعّل محركًا أقوى مجانًا (مفتاح Groq بـ30 ثانية)</span></div>';
      const r=bubble.querySelector('.retry-link');
      if(r)r.addEventListener('click',()=>{bubble.closest('.msg-row').remove();s.messages.pop();chatPersist();isGenerating=false;abortController=null;chatSetGeneratingUI(false);chatSend(prompt)});
      const ge=bubble.querySelector('#goEngines');if(ge)ge.addEventListener('click',()=>showView('settings'));
    }
  }finally{isGenerating=false;abortController=null;chatSetGeneratingUI(false)}
}
function chatUpdateCount(){const c=$('charCount');if(c)c.textContent=$('userInput').value.length+' / '+MAX_INPUT_CHARS}
function initChatUI(){
  const ui=$('userInput');if(!ui)return;
  const smartToggle=$('smartModeToggle');
  if(smartToggle){
    smartToggle.checked=lsGet('khaled_smart_mode',false);
    smartToggle.addEventListener('change',()=>lsSet('khaled_smart_mode',smartToggle.checked));
  }
  const groundedToggle=$('groundedModeToggle');
  if(groundedToggle){
    groundedToggle.checked=lsGet('khaled_grounded_mode',false);
    groundedToggle.addEventListener('change',()=>lsSet('khaled_grounded_mode',groundedToggle.checked));
  }
  const attachBtn=$('chatAttachBtn'),fileInput=$('chatFileInput');
  if(attachBtn&&fileInput){
    attachBtn.addEventListener('click',()=>fileInput.click());
    fileInput.addEventListener('change',()=>{ if(fileInput.files[0]) chatSetAttachment(fileInput.files[0]); fileInput.value=''; });
  }
  ui.addEventListener('input',()=>{chatUpdateCount();ui.style.height='auto';ui.style.height=Math.min(ui.scrollHeight,140)+'px'});
  ui.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();$('chatForm').dispatchEvent(new Event('submit'))}});
  $('chatForm').addEventListener('submit',e=>{e.preventDefault();chatSend()});
  $('quickChips').addEventListener('click',e=>{const chip=e.target.closest('.quick-chip');if(!chip)return;chatSend(chip.dataset.prompt)});
  $('newChatBtn').addEventListener('click',()=>{chatCreateSession('محادثة جديدة');if(window.innerWidth<=768)$('chatSidebar').classList.add('hidden')});
  $('sidebarToggle').addEventListener('click',()=>$('chatSidebar').classList.toggle('hidden'));
  /* voice input in chat */
  const micBtn=$('micBtn');const rec=createRecognizer('ar-SA');
  if(rec&&micBtn){let recording=false;
    micBtn.style.display='flex';
    micBtn.addEventListener('click',()=>{if(recording){rec.stop();return}try{rec.start();recording=true;micBtn.classList.add('recording')}catch{}});
    rec.onresult=e=>{let final='';for(let i=0;i<e.results.length;i++){if(e.results[i].isFinal)final+=e.results[i][0].transcript}
      if(final){ui.value=(ui.value+' '+final).trim();chatUpdateCount()}};
    rec.onend=()=>{recording=false;micBtn.classList.remove('recording')};
    rec.onerror=()=>{recording=false;micBtn.classList.remove('recording')};
  }
}

/* ================= IMAGE GENERATOR ================= */
let imgSize={w:1024,h:1024},lastImg={url:'',prompt:''};
function imgGen(prompt,seed){
  if(!prompt)return;
  seed=seed||Math.floor(Math.random()*1e6);
  const url='https://image.pollinations.ai/prompt/'+encodeURIComponent(prompt)+'?width='+imgSize.w+'&height='+imgSize.h+'&model=flux&nologo=true&seed='+seed;
  const area=$('imgResult');
  area.className='result-area';
  area.innerHTML='<div><span class="spinner"></span><br><span class="loading-text" id="imgTimerText">جارٍ رسم الصورة… 0 ثانية</span></div>';
  let sec=0;const timer=setInterval(()=>{sec++;const el=$('imgTimerText');if(el)el.textContent='جارٍ رسم الصورة… '+sec+' ثانية'},1000);
  const img=new Image();img.crossOrigin='anonymous';
  const timeout=setTimeout(()=>{clearInterval(timer);img.src='';area.innerHTML='<div class="error-box">استغرق التوليد وقتًا طويلًا. <span class="retry-link" id="imgRetry">أعد المحاولة</span></div>';const r=$('imgRetry');if(r)r.addEventListener('click',()=>imgGen(prompt))},90000);
  img.onload=()=>{clearTimeout(timeout);clearInterval(timer);area.className='result-area has-img';area.innerHTML='';img.style.maxWidth='100%';img.style.borderRadius='12px';area.appendChild(img);lastImg={url,prompt};$('imgActions').style.display='flex';imgSaveGallery(url,prompt)};
  img.onerror=()=>{clearTimeout(timeout);clearInterval(timer);area.innerHTML='<div class="error-box">تعذر توليد الصورة — حاول مرة أخرى. <span class="retry-link" id="imgRetry2">↻</span></div>';const r=$('imgRetry2');if(r)r.addEventListener('click',()=>imgGen(prompt))};
  img.src=url;
}
function imgSaveGallery(url,prompt){let g=lsGet('khaled_gallery',[]);g.unshift({url,prompt,ts:Date.now()});lsSet('khaled_gallery',g.slice(0,12));imgRenderGallery()}
function imgRenderGallery(){
  const g=lsGet('khaled_gallery',[]);const card=$('galleryCard');const grid=$('galleryGrid');if(!card||!grid)return;
  if(!g.length){card.style.display='none';return}
  card.style.display='block';grid.innerHTML='';
  g.forEach(item=>{const d=document.createElement('div');d.className='gallery-item';
    d.innerHTML='<img loading="lazy" alt=""><div class="g-label"></div>';
    d.querySelector('img').src=item.url;d.querySelector('.g-label').textContent=item.prompt;
    d.addEventListener('click',()=>{$('imgPrompt').value=item.prompt;imgGen(item.prompt)});
    grid.appendChild(d)});
}
function initImageUI(){
  if(!$('imgGenBtn'))return;
  $('sizePresets').addEventListener('click',e=>{const chip=e.target.closest('.preset-chip');if(!chip)return;$$('#sizePresets .preset-chip').forEach(c=>c.classList.remove('active'));chip.classList.add('active');imgSize={w:+chip.dataset.w,h:+chip.dataset.h}});
  $('imgGenBtn').addEventListener('click',()=>{const p=$('imgPrompt').value.trim();if(!p){toast('اكتب وصفًا للصورة أولًا');return}imgGen(p)});
  $('imgPrompt').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('imgGenBtn').click()}});
  $('imgVariation').addEventListener('click',()=>{if(lastImg.prompt)imgGen(lastImg.prompt)});
  $('imgDownload').addEventListener('click',()=>{if(!lastImg.url)return;
    fetch(lastImg.url).then(r=>r.blob()).then(b=>{const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download='khaled-ai-image.jpg';a.click();URL.revokeObjectURL(a.href)}).catch(()=>window.open(lastImg.url,'_blank'))});
  imgRenderGallery();
}

/* ================= TRANSLATOR ================= */
const LANGS=[['auto','تلقائي (كشف اللغة)'],['ar','العربية'],['en','الإنجليزية'],['fr','الفرنسية'],['es','الإسبانية'],['de','الألمانية'],['tr','التركية'],['ur','الأردية'],['id','الإندونيسية'],['ru','الروسية'],['zh','الصينية'],['ja','اليابانية'],['hi','الهندية']];
function fillLangSelect(sel,withAuto){
  LANGS.forEach(([code,name])=>{if(code==='auto'&&!withAuto)return;const o=document.createElement('option');o.value=code;o.textContent=name;sel.appendChild(o)});
}
async function translateGo(){
  const text=$('trText').value.trim();if(!text){toast('اكتب نصًا للترجمة');return}
  const from=$('trFrom').value,to=$('trTo').value;
  if(from===to){toast('اختر لغتين مختلفتين');return}
  const out=$('trResult');out.className='result-box';out.innerHTML='<div class="loading-block"><span class="spinner"></span><br><span class="loading-text">جارٍ الترجمة…</span></div>';
  const fromName=(LANGS.find(l=>l[0]===from)||['',''])[1],toName=(LANGS.find(l=>l[0]===to)||['',''])[1];
  try{
    const full=await callAI([{role:'user',content:'ترجم النص التالي من '+fromName+' إلى '+toName+'. أخرج الترجمة فقط بدون أي شرح أو مقدمات:\n\n'+text}],{maxAttempts:4});
    out.className='result-box';out.textContent=full;
    const copyBtn=$('trCopy');if(copyBtn)copyBtn.style.display='inline-block';
  }catch(err){out.className='result-box';out.innerHTML='<div class="error-box">'+escapeHtmlText(friendlyError(err))+'</div>'}
}
function initTranslateUI(){
  if(!$('trGoBtn'))return;
  fillLangSelect($('trFrom'),true);fillLangSelect($('trTo'),false);
  $('trFrom').value='auto';$('trTo').value='en';
  $('trGoBtn').addEventListener('click',translateGo);
  $('trCopy').addEventListener('click',()=>copyText($('trResult').textContent));
}

/* ================= SUMMARIZER ================= */
async function summarizeGo(){
  const text=$('sumInput').value.trim();
  if(!text){toast('الصق نصًا أولًا');return}
  if(text.length<50){toast('النص قصير جدًا للتلخيص');return}
  const style=$('sumStyle').value;
  const prompts={'short':'لخص في 3 نقاط رئيسية كحد أقصى','medium':'لخص في فقرة واحدة موجزة (5-7 أسطر)','bullets':'لخص في نقاط منظمة مع عنوان لكل نقطة'};
  const out=$('sumResult');
  out.className='result-box';out.innerHTML='<div class="loading-block"><span class="spinner"></span><br><span class="loading-text">جارٍ التلخيص الذكي…</span></div>';
  try{
    const full=await callAI([{role:'user',content:prompts[style]+' بالنص التالي:\n\n'+text.slice(0,6000)}],{maxAttempts:4});
    out.className='result-box';out.innerHTML=renderMarkdown(full);
  }catch(err){out.className='result-box';out.innerHTML='<div class="error-box">'+escapeHtmlText(friendlyError(err))+'</div>'}
}
function initSummarizerUI(){
  if(!$('sumGoBtn'))return;
  $('sumGoBtn').addEventListener('click',summarizeGo);
  $('sumCopy').addEventListener('click',()=>copyText($('sumResult').textContent));
}
