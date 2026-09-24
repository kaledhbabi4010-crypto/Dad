'use strict';
/* KHALED AI — profile.js: ذاكرة شخصية واحدة تشاركها كل الأدوات
   تُحفظ محليًا في متصفحك فقط، وتُحقن تلقائيًا كسياق لأي طلب ذكاء اصطناعي. */

function getProfile(){
  return lsGet('khaled_profile_v1',{name:'',field:'',style:'',lang:''});
}
function setProfile(p){ lsSet('khaled_profile_v1',p); }

/* نص سياق جاهز يُضاف تلقائيًا لأي prompt — فارغ لو المستخدم ما عبّى شيء */
function profileContext(){
  const p=getProfile();
  const parts=[];
  if(p.name) parts.push('اسم المستخدم: '+p.name);
  if(p.field) parts.push('مجاله/تخصصه: '+p.field);
  if(p.style) parts.push('أسلوب الرد المفضل له: '+p.style);
  if(p.lang) parts.push('يفضّل التواصل بـ: '+p.lang);
  if(!parts.length) return '';
  return '\n\n[معلومات عن المستخدم لتخصيص الرد بشكل أنسب — استخدمها بذكاء وبدون إفراط: '+parts.join('، ')+']';
}

function initProfileUI(){
  const fcIn=$('firecrawlKeyInput'),fcSave=$('firecrawlSaveBtn'),fcClear=$('firecrawlClearBtn'),fcStatus=$('firecrawlStatus');
  if(fcIn){
    fcIn.value=lsGet('khaled_firecrawl_key','');
    fcSave.addEventListener('click',()=>{
      lsSet('khaled_firecrawl_key',fcIn.value.trim());
      fcStatus.style.color='var(--accent-emerald)';
      fcStatus.textContent=fcIn.value.trim()?'✓ محفوظ — أدوات القراءة تستخدم Firecrawl الآن تلقائيًا':'✓ فاضي — سيستخدم jina.ai المجاني';
    });
    fcClear.addEventListener('click',()=>{
      fcIn.value='';lsSet('khaled_firecrawl_key','');
      fcStatus.style.color='var(--accent-amber)';fcStatus.textContent='رجعنا لـjina.ai المجاني بدون أي مفتاح';
    });
  }
  const nameEl=$('profName'),fieldEl=$('profField'),styleEl=$('profStyle'),langEl=$('profLang'),saveBtn=$('profSaveBtn'),resetBtn=$('profResetBtn'),status=$('profStatus');
  if(!nameEl)return;
  const p=getProfile();
  nameEl.value=p.name||'';fieldEl.value=p.field||'';styleEl.value=p.style||'';langEl.value=p.lang||'';
  saveBtn.addEventListener('click',()=>{
    setProfile({name:nameEl.value.trim(),field:fieldEl.value.trim(),style:styleEl.value.trim(),lang:langEl.value.trim()});
    status.style.color='var(--accent-emerald)';status.textContent='✓ تم الحفظ — كل الأدوات (الشات، منشئ التطبيقات، التلخيص...) بتستخدمها تلقائيًا من الآن';
    toast('تم حفظ ملفك الشخصي ✓');
  });
  resetBtn.addEventListener('click',()=>{
    setProfile({name:'',field:'',style:'',lang:''});
    nameEl.value='';fieldEl.value='';styleEl.value='';langEl.value='';
    status.style.color='var(--accent-amber)';status.textContent='تم مسح كل البيانات الشخصية المحفوظة';
    toast('تم المسح ✓');
  });
}
