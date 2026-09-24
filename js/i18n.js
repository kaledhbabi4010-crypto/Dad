'use strict';
/* KHALED AI — i18n.js: تبديل الواجهة بين العربية والإنجليزية فقط (لا لغات أخرى) */
function applyLang(lang){
  lang = lang==='en' ? 'en' : 'ar';
  document.documentElement.lang = lang;
  document.documentElement.dir = lang==='en' ? 'ltr' : 'rtl';
  document.querySelectorAll('[data-i18n-ar]').forEach(el=>{
    const ar = el.getAttribute('data-i18n-ar');
    const en = el.getAttribute('data-i18n-en');
    if(!en) return;
    if(el.hasAttribute('data-i18n-br')){
      const arParts=ar.split('|'), enParts=en.split('|');
      el.innerHTML = (lang==='en'?enParts:arParts).join('<br>');
    }else{
      el.textContent = lang==='en' ? en : ar;
    }
  });
  const btn=document.getElementById('langToggle');
  if(btn) btn.innerHTML='<i class="fa-solid fa-language me-1"></i>'+(lang==='en'?'AR':'EN');
  lsSet('khaled_lang', lang);
}
function initLangToggle(){
  const btn=document.getElementById('langToggle');
  if(!btn) return;
  applyLang(lsGet('khaled_lang','ar'));
  btn.addEventListener('click', ()=>{
    applyLang(lsGet('khaled_lang','ar')==='ar' ? 'en' : 'ar');
  });
}
