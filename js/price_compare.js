'use strict';
/* KHALED AI — price_compare.js: محرك مقارنة أسعار السوق السعودي
   يبحث فعليًا، يقرأ صفحات متاجر حقيقية، ويستخرج السعر فقط من نص الصفحة الفعلي —
   لا يخترع رقمًا أبدًا. لو ما لقى سعر مذكور صراحة بالنص، يستبعد ذاك المصدر. */

const KSA_STORES=['jarir.com','extra.com','amazon.sa','noon.com','jumia.com.sa','alsaif-gallery.com','saco.sa','b-tech.com.sa','stc.com.sa','xcite.com'];
const CONSTRUCTION_KEYWORDS=['حديد','اسمنت','إسمنت','خرسانة','رمل','طوب','بلوك','تسليح','حديد تسليح','باطون'];
const CONSTRUCTION_SOURCES=['argaam.com','maaal.com','saudicement.com.sa','yamamacement.com','hadeed.sabic.com','tadawul.com.sa','spa.gov.sa'];

function isConstructionQuery(q){
  return CONSTRUCTION_KEYWORDS.some(k=>q.includes(k));
}

async function priceSearchCandidates(query){
  const isConstruction=isConstructionQuery(query);
  const targetSources=isConstruction?CONSTRUCTION_SOURCES:KSA_STORES;
  const baseQuery=isConstruction ? query+' سعر طن اليوم السعودية' : query+' السعودية سعر';
  const queries=[baseQuery, ...targetSources.slice(0,6).map(s=>query+' site:'+s)];
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
    if(urls.size>=10)break;
  }
  return [...urls.entries()].slice(0,8).map(([url,title])=>({url,title}));
}

async function priceFetchPage(url){
  return await fetchPageText(url, 4000);
}

async function priceCompareRun(query,onStatus){
  const isConstruction=isConstructionQuery(query);
  onStatus && onStatus(isConstruction?'⏳ جارٍ البحث في مصادر أسعار مواد البناء والمؤشرات السعودية…':'⏳ جارٍ البحث في متاجر السوق السعودي…');
  const candidates=await priceSearchCandidates(query);
  if(!candidates.length) return {ok:false,reason:'لم يتوفر بحث حي الآن — تحقق من اتصال الإنترنت أو جرّب لاحقًا.'};

  onStatus && onStatus('⏳ جارٍ فتح '+candidates.length+' مصدر حقيقي وقراءته…');
  const pages=[];
  for(const c of candidates){
    const text=await priceFetchPage(c.url);
    if(text) pages.push({url:c.url,title:c.title,text});
  }
  if(!pages.length) return {ok:false,reason:'تعذر فتح أي مصدر فعليًا وقت البحث — جرّب مرة أخرى.',isConstruction};

  onStatus && onStatus('⏳ جارٍ استخراج الأسعار الحقيقية من النصوص (بدون أي تخمين)…');
  const block=pages.map((p,i)=>'--- مصدر ['+(i+1)+'] '+p.title+' ('+p.url+') ---\n'+p.text).join('\n\n');
  const materialNote=isConstruction
    ? '\n\nتنبيه مهم: هذا استعلام عن مادة بناء بالجملة (حديد/أسمنت). أسعار هذي المواد تُنشر عادة كـ"سعر مرجعي/مؤشر سوقي" (بالطن) من جهات مثل أرقام أو معال أو الشركات المصنّعة، وتختلف فعليًا حسب الكمية والمورد والمنطقة والتفاوض المباشر — هي ليست سعر بيع تجزئة ثابت زي منتج إلكتروني. وضّح هذا صراحة بالنتيجة النهائية.'
    : '';
  const prompt='أنت مستخرج بيانات صارم، لست باحثًا مبدعًا. هذي نصوص حقيقية مأخوذة الآن من صفحات '+(isConstruction?'مصادر أسعار مواد بناء ومؤشرات سوقية':'متاجر')+' بحثًا عن: "'+query+'"'+materialNote+'\n\n'+block
    +'\n\nقواعد صارمة إجبارية بلا استثناء:\n'
    +'1) استخرج فقط الأسعار المذكورة حرفيًا بالنص أعلاه — ممنوع تخمين أو تقدير أي سعر غير مكتوب صراحة.\n'
    +'2) لو مصدر ما فيه سعر واضح أو المادة غير موجودة فيه، استبعده تمامًا من القائمة — لا تخترع له سعرًا.\n'
    +'3) لو لقيت خصم أو عرض أو تاريخ نشر السعر مذكور صراحة بالنص، اذكره كما هو مكتوب بالضبط.\n'
    +'4) رتّب النتائج من الأرخص للأغلى.\n'
    +'5) أخرج JSON فقط بلا أي شرح خارجه، بهذا الشكل بالضبط:\n'
    +'{"results":[{"source":"اسم المصدر","price":"السعر كما ورد حرفيًا بالنص","note":"ملاحظة قصيرة (تاريخ النشر إن وجد، أو خصم، أو كونه سعرًا مرجعيًا بالجملة)","url":"الرابط"}],"warning":"أي تحذير مهم إن وجد، مثل عدم وضوح الأسعار بمعظم المصادر أو كون الأسعار مرجعية لا تجزئة"}';

  let reply;
  try{ reply=await callAI([{role:'user',content:prompt}],{maxAttempts:3}); }
  catch(e){ return {ok:false,reason:'تعذر تحليل الصفحات: '+(friendlyError?friendlyError(e):e.message),isConstruction}; }

  let parsed;
  try{
    const m=reply.match(/\{[\s\S]*\}/);
    parsed=JSON.parse(m?m[0]:reply);
  }catch{ return {ok:false,reason:'تعذر تفسير نتيجة الاستخراج — النص الخام:\n\n'+reply.slice(0,500),isConstruction}; }

  return {ok:true, results:parsed.results||[], warning:parsed.warning||'', sourcesChecked:pages.length, isConstruction};
}

function priceRenderReport(query,res){
  if(!res.ok) return '⚠ تعذر إكمال البحث: '+res.reason;
  if(!res.results.length) return '🔍 بحثت فعليًا في '+res.sourcesChecked+' مصدر حقيقي عن "'+query+'"، لكن ما لقيت سعرًا مذكورًا صراحة يقدر يُعتمد عليه في أي منها وقت البحث — بدل ما أخمّن، أفضّل أخبرك بالحقيقة. جرّب صياغة أدق أو تحقق يدويًا من نفس المصادر.';
  let out='### 💰 مقارنة أسعار حقيقية لـ"'+query+'" (استخرجتها الآن من '+res.sourcesChecked+' مصدر فعلي)\n\n';
  out+='| الترتيب | المصدر | السعر | ملاحظة |\n|---|---|---|---|\n';
  res.results.forEach((r,i)=>{
    out+='| '+(i+1)+' | ['+r.source+']('+r.url+') | '+r.price+' | '+(r.note||'—')+' |\n';
  });
  if(res.warning) out+='\n⚠ '+res.warning;
  if(res.isConstruction) out+='\n\n**⚠ تنبيه خاص بمواد البناء:** هذي أسعار مرجعية/مؤشرات سوقية منشورة، مو عروض بيع تجزئة ثابتة — السعر الفعلي عند الشراء يختلف حسب الكمية والمورد والتفاوض المباشر ومنطقتك. اتصل بموردين محليين للسعر الدقيق قبل أي قرار شراء فعلي.';
  out+='\n\n*الأسعار مستخرجة حرفيًا من المصادر وقت البحث — قد تتغير لاحقًا، تحقق من الرابط قبل أي قرار.*';
  return out;
}
