'use strict';
/* KHALED AI — obd_diagnose.js: تشخيص أكواد فحص السيارة (OBD) بالاعتماد على مصادر حقيقية فقط
   نفس مبدأ محرك مقارنة الأسعار: يقرأ صفحات تشخيص سيارات حقيقية، ويمنع الموديل من التخمين. */

const OBD_SOURCES=['obd-codes.com','repairpal.com','yourmechanic.com','carparts.com','autocodes.com'];

async function obdSearchCandidates(code,vehicle){
  const vq = vehicle ? (' '+vehicle) : '';
  const queries=[code+vq+' meaning causes fix', ...OBD_SOURCES.map(s=>code+' site:'+s)];
  const urls=new Map();
  for(const q of queries){
    try{
      const ctrl=new AbortController();const t=setTimeout(()=>ctrl.abort(),15000);
      const r=await fetch('https://r.jina.ai/https://lite.duckduckgo.com/lite/?q='+encodeURIComponent(q),{signal:ctrl.signal});
      clearTimeout(t);
      if(!r.ok)continue;
      const md=await r.text();
      const re=/\[([^\]]{5,150})\]\(https:\/\/duckduckgo\.com\/l\/\?uddg=([^&)]+)[^)]*\)/g;
      let m,count=0;
      while((m=re.exec(md))!==null&&count<3){
        let u;try{u=decodeURIComponent(m[2])}catch{u=m[2]}
        if(/^https?:\/\//.test(u)&&!urls.has(u)){urls.set(u,m[1]);count++}
      }
    }catch{}
    if(urls.size>=8)break;
  }
  return [...urls.entries()].slice(0,6).map(([url,title])=>({url,title}));
}

async function obdFetchPage(url){
  return await fetchPageText(url, 3500);
}

async function obdDiagnoseRun(code,vehicle,onStatus){
  const cleanCode=(code||'').trim().toUpperCase();
  if(!/^[PBCU]\d{4}$/.test(cleanCode)){
    return {ok:false,reason:'رقم الكود غير صحيح الصيغة — يجب أن يكون بالشكل P0301 أو B1234 أو C0035 أو U0100 (حرف + 4 أرقام).'};
  }
  onStatus && onStatus('⏳ جارٍ البحث في مصادر تشخيص سيارات حقيقية عن '+cleanCode+'…');
  const candidates=await obdSearchCandidates(cleanCode,vehicle);
  if(!candidates.length) return {ok:false,reason:'لم يتوفر بحث حي الآن — تحقق من الإنترنت أو جرّب لاحقًا.'};

  onStatus && onStatus('⏳ جارٍ قراءة '+candidates.length+' صفحة تشخيص حقيقية…');
  const pages=[];
  for(const c of candidates){
    const text=await obdFetchPage(c.url);
    if(text) pages.push({url:c.url,title:c.title,text});
  }
  if(!pages.length) return {ok:false,reason:'تعذر فتح أي مصدر تشخيصي فعليًا الآن — جرّب مرة أخرى.'};

  onStatus && onStatus('⏳ جارٍ تحليل السبب وخطوات الحل من نصوص حقيقية فقط…');
  const block=pages.map((p,i)=>'--- مصدر ['+(i+1)+'] '+p.title+' ('+p.url+') ---\n'+p.text).join('\n\n');
  const vehicleNote=vehicle?('\nنوع السيارة المحدد: '+vehicle+' — رجّح المعلومات الخاصة بهذي السيارة تحديدًا لو وُجدت، ونبّه لو المصادر عامة وغير خاصة بهذا الموديل.'):'\nلم يُحدَّد نوع سيارة — أعطِ معلومات عامة عن الكود وانصح بالتأكد من الفروقات حسب الموديل.';
  const prompt='أنت فاحص سيارات خبير، لكن ممنوع تخترع أي معلومة من ذاكرتك. هذي نصوص حقيقية من مواقع تشخيص سيارات معروفة عن كود '+cleanCode+':\n\n'+block+vehicleNote
    +'\n\nقواعد صارمة:\n1) استخرج فقط المعنى والأسباب وخطوات الحل المذكورة صراحة بالنصوص أعلاه — لا تكمل من معرفتك العامة عن أكواد OBD إلا لو المصادر ما ذكرت شيء وأنت متأكد 100% من معلومة أساسية معروفة عالميًا (وضّح هذا صراحة لو صار).\n2) لو المصادر متعارضة، وضّح التعارض.\n3) رتّب الأسباب من الأكثر شيوعًا للأقل.\n4) نبّه دائمًا إذا كان العطل يتطلب فحص مختص فعليًا (خصوصًا أكواد تتعلق بالسلامة كالفرامل أو الوسادات الهوائية) بدل محاولة الإصلاح الذاتي.\n\n'
    +'أخرج بالتنسيق التالي بالعربية (Markdown):\n### المعنى\n...\n### الأسباب المحتملة (الأشيع أولًا)\n1. ...\n### خطوات التشخيص والحل\n1. ...\n### تنبيه\n(إن وجد خطر أو حاجة لمختص)';

  let reply;
  try{ reply=await callAI([{role:'user',content:prompt}],{maxAttempts:3,onStatus}); }
  catch(e){ return {ok:false,reason:'تعذر التحليل: '+(friendlyError?friendlyError(e):e.message)}; }

  return {ok:true, code:cleanCode, report:reply, sources:pages.map(p=>({title:p.title,url:p.url}))};
}

function obdRenderReport(res){
  if(!res.ok) return '⚠ '+res.reason;
  let out='## 🔧 تشخيص كود '+res.code+'\n\n'+res.report;
  out+='\n\n---\n**المصادر المستخدمة فعليًا:**\n'+res.sources.map((s,i)=>'['+(i+1)+'] ['+s.title+']('+s.url+')').join('\n');
  out+='\n\n*هذا تشخيص استرشادي من مصادر عامة، مو بديلاً عن فاحص سيارات معتمد لأي عطل يتعلق بالسلامة.*';
  return out;
}
