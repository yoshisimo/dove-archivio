'use strict';

const DB_NAME = 'dove-archivio-v1';
const DB_VERSION = 1;
const $ = sel => document.querySelector(sel);
const esc = s => String(s ?? '').replace(/[&<>"']/g, x => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const uid = () => (globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`);
const normalized = s => String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('it').trim();
const state = {tab:'search',query:'',order:'alpha',itemsFilter:'',bulkSelecting:false,selectedItems:new Set(),locations:[],items:[],currentPlace:null,itemDetail:null,photoUrls:[],locationSaveNotice:null};
let db, toastTimeout, previewUrl;

function openDatabase() {
  return new Promise((resolve,reject)=>{
    const req = indexedDB.open(DB_NAME,DB_VERSION);
    req.onupgradeneeded = () => {
      const database=req.result;
      if(!database.objectStoreNames.contains('locations'))database.createObjectStore('locations',{keyPath:'id'});
      if(!database.objectStoreNames.contains('items'))database.createObjectStore('items',{keyPath:'id'});
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
    req.onblocked=()=>reject(new Error('Chiudi le altre schede dell’applicazione e riprova.'));
  });
}
function requestStore(store,method,data) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(store,'readwrite');
    const req=tx.objectStore(store)[method](data);
    tx.oncomplete=()=>resolve(req.result);
    tx.onerror=()=>reject(tx.error||new Error('Errore di salvataggio'));
    tx.onabort=()=>reject(tx.error||new Error('Operazione annullata'));
  });
}
function all(store){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readonly');const req=tx.objectStore(store).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
async function refresh(){[state.locations,state.items]=await Promise.all([all('locations'),all('items')]);render();}
const loc = id => state.locations.find(x=>x.id===id);
const item = id => state.items.find(x=>x.id===id);
function ancestors(id){
  const path=[],seen=new Set();let cursor=id;
  while(cursor){if(seen.has(cursor))break;seen.add(cursor);const p=loc(cursor);if(!p)break;path.unshift(p);cursor=p.parentId;}
  return path;
}
function pathOf(id){const names=ancestors(id).map(p=>p.name);return names.length?names.join(' → '):'Posizione non assegnata';}
function countWithin(id){const ids=new Set([id]);for(let i=0;i<state.locations.length+1;i++){for(const p of state.locations){if(ids.has(p.parentId))ids.add(p.id);}}return state.items.filter(x=>ids.has(x.locationId)).length;}
function sortedLocations(arr){return [...arr].sort((a,b)=>a.name.localeCompare(b.name,'it'));}
function sortedItems(arr){return [...arr].sort((a,b)=>a.name.localeCompare(b.name,'it'));}
function disposeUrls(){state.photoUrls.forEach(u=>URL.revokeObjectURL(u));state.photoUrls=[];}
function photoUrl(blob){if(!(blob instanceof Blob))return '';const url=URL.createObjectURL(blob);state.photoUrls.push(url);return url;}
function toast(msg){const e=$('#toast');e.textContent=msg;e.classList.add('show');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>e.classList.remove('show'),3500);}
function errorMessage(e){console.error(e);toast(e?.message||'Si è verificato un errore.');}
function buttonsForNav(){document.querySelectorAll('[data-tab]').forEach(b=>{b.classList.toggle('active',b.dataset.tab===state.tab);b.setAttribute('aria-current',b.dataset.tab===state.tab?'page':'false');});}
function render(){
  disposeUrls();buttonsForNav();
  const v=$('#view');
  if(state.itemDetail&&item(state.itemDetail)){renderDetail(v,item(state.itemDetail));return;}
  if(state.tab==='search'){renderSearch(v);return;}
  if(state.tab==='places'){renderPlaces(v);return;}
  if(state.tab==='items'){renderAllItems(v);return;}
  renderData(v);
}
function itemCard(x){return `<div class="item-card"><button class="result-button" data-action="item-detail" data-id="${esc(x.id)}"><div class="line"><div style="min-width:0"><p class="item-title">${esc(x.name)}</p><div class="item-path">${esc(pathOf(x.locationId))}</div>${(x.category||x.quantity!==1)?`<div class="item-meta">${x.category?esc(x.category):'Senza categoria'}${x.quantity!==1?' · Quantità: '+esc(x.quantity):''}</div>`:''}</div><span class="chevron">›</span></div></button></div>`;}
function empty(title,copy,action,label){return `<div class="empty"><div class="symbol" aria-hidden="true">⌕</div><h2>${esc(title)}</h2><p>${esc(copy)}</p>${action?`<button class="btn btn-primary" data-action="${esc(action)}">${esc(label)}</button>`:''}</div>`;}
function renderSearch(v){
  v.innerHTML=`<div class="eyebrow">Il tuo inventario personale</div><h1>Cosa stai cercando?</h1><p class="top-copy">Scrivi un nome per scoprire subito dove si trova.</p><label class="search-box"><span aria-hidden="true">⌕</span><input id="search-input" aria-label="Cerca un oggetto" autocomplete="off" placeholder="Es. cacciavite, caricatore…" value="${esc(state.query)}"></label><div id="search-results"></div>`;
  renderSearchResults();
  $('#search-input').addEventListener('input',e=>{state.query=e.target.value;renderSearchResults();});
}
function renderSearchResults(){
  const e=$('#search-results');if(!e)return;
  const q=normalized(state.query);
  if(!q){
    const recent=[...state.items].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,6);
    e.innerHTML=`<div class="section-line"><h2>${state.items.length?'Aggiunti di recente':'Comincia il tuo archivio'}</h2><span class="count">${state.items.length} oggetti</span></div>${recent.length?recent.map(itemCard).join(''):empty('Il tuo archivio è vuoto','Crea prima una posizione, ad esempio “Ripostiglio”, poi aggiungi un oggetto.','new-location','Crea una posizione')}<div class="action-row"><button class="btn btn-secondary" data-action="new-item">+ Oggetto</button><button class="btn btn-outline" data-action="new-location">+ Posizione</button></div>`;
    return;
  }
  const found=state.items.filter(x=>normalized([x.name,x.category||'',x.notes||'',pathOf(x.locationId)].join(' ')).includes(q))
    .sort((a,b)=>{const aa=normalized(a.name).includes(q),bb=normalized(b.name).includes(q);return Number(bb)-Number(aa)||a.name.localeCompare(b.name,'it');});
  e.innerHTML=`<div class="section-line"><h2>Risultati</h2><span class="count">${found.length} trovati</span></div>${found.length?found.map(itemCard).join(''):empty('Nessun risultato','Prova un altro termine oppure registra un nuovo oggetto.','new-item','Aggiungi oggetto')}`;
}
function filteredAndSortedItems(){
 const q=normalized(state.itemsFilter);
 const list=state.items.filter(x=>normalized([x.name,x.category||'',x.notes||'',pathOf(x.locationId)].join(' ')).includes(q));
 if(state.order==='category')list.sort((a,b)=>(a.category||'~').localeCompare(b.category||'~','it')||a.name.localeCompare(b.name,'it'));
 else if(state.order==='place')list.sort((a,b)=>pathOf(a.locationId).localeCompare(pathOf(b.locationId),'it')||a.name.localeCompare(b.name,'it'));
 else list.sort((a,b)=>a.name.localeCompare(b.name,'it'));
 return list;
}
function renderItemsList(){
 const results=$('#items-list');if(!results)return;
 const list=filteredAndSortedItems();
 results.innerHTML=list.length?list.map(x=>state.bulkSelecting?
  `<label class="bulk-item-row"><input type="checkbox" class="bulk-item-checkbox" value="${esc(x.id)}" ${state.selectedItems.has(x.id)?'checked':''}><span class="bulk-item-text"><strong>${esc(x.name)}</strong><small>${esc(pathOf(x.locationId))}</small>${x.category?`<small>${esc(x.category)}</small>`:''}</span></label>`:
  itemCard(x)).join(''):
  (state.items.length?'<p class="muted small">Nessun oggetto corrisponde al filtro.</p>':empty('Nessun oggetto','Quando ne aggiungi uno, comparirà qui.','new-item','Aggiungi il primo oggetto'));
 const resultsCount=$('#items-results-count');if(resultsCount)resultsCount.textContent=`${list.length} ${list.length===1?'risultato':'risultati'}`;
 const num=state.selectedItems.size;
 const selectionCount=$('#bulk-selection-count');if(selectionCount)selectionCount.textContent=`${num} ${num===1?'selezionato':'selezionati'}`;
 const move=$('#bulk-move');if(move){move.disabled=num===0;move.textContent=num?`Assegna posizione (${num})`:'Assegna posizione';}
 const selectAll=$('#bulk-select-visible');if(selectAll)selectAll.disabled=!list.length;
 const clear=$('#bulk-clear');if(clear)clear.disabled=!num;
}
function renderAllItems(v){
 v.innerHTML=`<div class="eyebrow">Inventario</div><h1>Tutti gli oggetti</h1><p class="top-copy">${state.items.length} registrati nel tuo archivio.</p>
 <div class="action-row"><button class="btn btn-primary" data-action="new-item">+ Aggiungi oggetto</button>${state.items.length?`<button class="btn ${state.bulkSelecting?'btn-secondary':'btn-outline'}" data-action="toggle-bulk">${state.bulkSelecting?'Termina selezione':'Seleziona più oggetti'}</button>`:''}</div>
 <div class="field"><label for="items-filter">Filtra oggetti</label><input class="control" type="search" id="items-filter" autocomplete="off" value="${esc(state.itemsFilter)}" placeholder="Es. hard disk, Seagate, elettronica"></div>
 <div class="section-line"><h2>Elenco</h2><div class="sort-row"><label for="sort-items">Ordina</label><select id="sort-items"><option value="alpha" ${state.order==='alpha'?'selected':''}>A–Z</option><option value="category" ${state.order==='category'?'selected':''}>Categoria</option><option value="place" ${state.order==='place'?'selected':''}>Posizione</option></select></div></div>
 <p id="items-results-count" class="form-help" aria-live="polite"></p>
 ${state.bulkSelecting?`<div class="bulk-tools"><button class="btn btn-outline" data-action="bulk-select-visible" id="bulk-select-visible">Seleziona tutti i risultati</button><button class="btn btn-text" data-action="bulk-clear" id="bulk-clear">Deseleziona tutti</button></div>`:''}
 <div id="items-list" ${state.bulkSelecting?'role="group" aria-label="Seleziona gli oggetti da spostare"':''}></div>
 ${state.bulkSelecting?`<div class="bulk-action-bar"><strong id="bulk-selection-count" aria-live="polite">0 selezionati</strong><button class="btn btn-primary" id="bulk-move" data-action="bulk-move" disabled>Assegna posizione</button></div>`:''}`;
 $('#sort-items').addEventListener('change',e=>{state.order=e.target.value;renderItemsList();});
 $('#items-filter').addEventListener('input',e=>{state.itemsFilter=e.target.value;renderItemsList();});
 if(state.bulkSelecting){$('#items-list').addEventListener('change',e=>{
  const box=e.target.closest('.bulk-item-checkbox');if(!box)return;
  if(box.checked)state.selectedItems.add(box.value);else state.selectedItems.delete(box.value);
  renderItemsList();
 });}
 renderItemsList();
}

function renderPlaces(v){
 const here=state.currentPlace?loc(state.currentPlace):null;
 if(state.currentPlace&&!here)state.currentPlace=null;
 const id=here?.id||null,crumbs=here?ancestors(here.id):[];
 const notice=state.locationSaveNotice?.id===id?state.locationSaveNotice:null;
 const children=sortedLocations(state.locations.filter(p=>(p.parentId||null)===id));
 const contents=sortedItems(state.items.filter(x=>x.locationId===id));
 v.innerHTML=`<div class="eyebrow">Esplora l'archivio</div><h1>${here?esc(here.name):'Le tue posizioni'}</h1><p class="top-copy">${here?esc(here.notes||'Contenuto della posizione selezionata.'):'Stanze, mobili, cassetti e scatole.'}</p>
 ${notice?`<div class="save-confirmation" role="status"><span class="save-check" aria-hidden="true">✓</span><span><strong>${esc(notice.title)}</strong><small>${esc(notice.description)}</small></span></div>`:''}
 <div class="breadcrumbs"><button data-action="place" data-id="">Casa</button>${crumbs.map(p=>`<span>›</span><button data-action="place" data-id="${esc(p.id)}">${esc(p.name)}</button>`).join('')}</div>
 ${here?.photo?`<div class="photo-grid"><button class="photo-card" data-action="zoom" data-id="${esc(here.id)}"><img src="${photoUrl(here.photo)}" alt="Fotografia di ${esc(here.name)}"><span>Fotografia della posizione · Tocca per ingrandire</span></button></div>`:''}
 <div class="action-row"><button class="btn btn-primary" data-action="new-location" data-parent="${esc(id||'')}">+ Sottoposizione</button><button class="btn btn-secondary" data-action="new-item" data-parent="${esc(id||'')}">+ Oggetto qui</button></div>
 ${here?`<div class="action-row"><button class="btn btn-outline" data-action="add-existing-items" data-id="${esc(id)}">+ Aggiungi oggetti esistenti</button></div>`:''}
 ${here?`<div class="action-row"><button class="btn btn-outline" data-action="edit-location" data-id="${esc(id)}">Modifica questa posizione</button></div>`:''}
 <div class="section-line"><h2>Contenitori e stanze</h2><span class="count">${children.length}</span></div>
 ${children.length?children.map(p=>`<button class="place-row" data-action="place" data-id="${esc(p.id)}"><span class="place-icon" aria-hidden="true">${p.photo?'▧':'▤'}</span><span><span class="place-name">${esc(p.name)}</span><span class="place-count" style="display:block">${countWithin(p.id)} oggetti${p.photo?' · Foto disponibile':''}</span></span><span class="chevron">›</span></button>`).join(''):'<p class="muted small">Nessuna sottoposizione.</p>'}
 <div class="section-line"><h2>Oggetti qui</h2><span class="count">${contents.length}</span></div>${contents.length?contents.map(itemCard).join(''):'<p class="muted small">Nessun oggetto direttamente in questa posizione.</p>'}`;
}
function renderDetail(v,x){
 const stack=ancestors(x.locationId);
 const withPhoto=stack.filter(p=>p.photo);
 v.innerHTML=`<button class="btn btn-text" data-action="detail-back">← Indietro</button><div class="eyebrow" style="margin-top:15px">Scheda oggetto</div><div class="detail-panel"><h2>${esc(x.name)}</h2><p class="location-path">${esc(pathOf(x.locationId))}</p><div class="data-pair"><strong>Categoria</strong><span>${esc(x.category||'Non specificata')}</span></div><div class="data-pair"><strong>Quantità</strong><span>${esc(x.quantity)}</span></div>${x.notes?`<div class="data-pair"><strong>Note</strong><span class="note">${esc(x.notes)}</span></div>`:''}</div>
 <div class="action-row"><button class="btn btn-primary" data-action="edit-item" data-id="${esc(x.id)}">Modifica / Sposta</button><button class="btn btn-danger" data-action="delete-item" data-id="${esc(x.id)}">Elimina</button></div>
 <div class="section-line"><h2>Dove cercare</h2><span class="count">${withPhoto.length} foto</span></div>
 ${withPhoto.length?`<p class="muted small">Dalla stanza al contenitore: tocca una foto per ingrandirla.</p><div class="photo-grid">${withPhoto.map(p=>`<button class="photo-card" data-action="zoom" data-id="${esc(p.id)}"><img src="${photoUrl(p.photo)}" alt="Fotografia di ${esc(p.name)}"><span>${esc(p.name)}</span></button>`).join('')}</div>`:empty('Nessuna fotografia','Puoi aggiungere una foto della posizione per trovare subito il punto esatto.')}
 ${x.locationId?`<button class="btn btn-outline" data-action="open-item-location" data-id="${esc(x.locationId)}">Apri la posizione</button>`:''}`;
}
function renderData(v){
  v.innerHTML=`<div class="eyebrow">Gestione archivio</div><h1>I tuoi dati</h1><p class="top-copy">Tutte le informazioni sono conservate localmente su questo dispositivo.</p><div class="stats"><div class="stat-box"><strong>${state.items.length}</strong><span>Oggetti</span></div><div class="stat-box"><strong>${state.locations.length}</strong><span>Posizioni</span></div></div>
  <div class="settings-panel"><h2>Esporta backup</h2><p>Scarica un file JSON con oggetti, posizioni e fotografie. Conservalo fuori dall'app.</p><button class="btn btn-primary" data-action="export">↓ Scarica backup completo</button></div>
  <div class="settings-panel"><h2>Ripristina backup</h2><p>Importa un backup già esportato. <strong>Sostituisce tutti i dati attuali</strong> di questo dispositivo.</p><button class="btn btn-outline" data-action="import">↑ Importa backup</button></div>
  <div class="settings-panel"><h2>Proteggi la memoria locale</h2><p>Chiedi al browser di non eliminare automaticamente l'archivio quando lo spazio scarseggia. Non sostituisce il backup.</p><button class="btn btn-secondary" data-action="persist">Richiedi archiviazione persistente</button></div>
  <p class="small muted">Versione 0.4.2 · I dati non vengono sincronizzati online. Non cancellare i dati del sito senza aver esportato un backup.</p>`;
}
function locationOptions(selected,excludeId=null){
  const excluded=new Set();
  if(excludeId){excluded.add(excludeId);let changed=true;while(changed){changed=false;for(const p of state.locations){if(excluded.has(p.parentId)&&!excluded.has(p.id)){excluded.add(p.id);changed=true;}}}}
  return `<option value="">Casa (livello principale)</option>`+sortedLocations(state.locations.filter(p=>!excluded.has(p.id))).map(p=>`<option value="${esc(p.id)}" ${selected===p.id?'selected':''}>${esc(pathOf(p.id))}</option>`).join('');
}
function showDialog(html){$('#dialog-content').innerHTML=html;$('#form-dialog').showModal();}
function closeDialog(){$('#form-dialog').close();$('#dialog-content').innerHTML='';}
function itemForm(id=null,defaultLocation=null){
  const x=id?item(id):null;
  const parent=defaultLocation||x?.locationId||'';
  const select=locationOptions(parent);
  showDialog(`<div class="dialog-header"><h2>${x?'Modifica oggetto':'Nuovo oggetto'}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="Chiudi">×</button></div><form id="item-form">
  <div class="field"><label for="item-name">Nome dell'oggetto *</label><input class="control" id="item-name" name="name" value="${esc(x?.name||'')}" placeholder="Es. cacciavite a stella" required maxlength="150"></div>
  <div class="field"><label for="item-location">Posizione</label><select class="control" id="item-location" name="locationId">${select}</select></div>
  <div class="field"><label for="item-category">Categoria (facoltativa)</label><input class="control" id="item-category" name="category" list="category-list" value="${esc(x?.category||'')}" placeholder="Es. Attrezzi" maxlength="90"><datalist id="category-list"><option>Attrezzi</option><option>Elettronica</option><option>Documenti</option><option>Casa</option><option>Ricambi</option><option>Abbigliamento</option><option>Hobby</option><option>Altro</option></datalist></div>
  <div class="field"><label for="item-quantity">Quantità</label><input class="control" type="number" id="item-quantity" name="quantity" min="1" max="999999" step="1" value="${esc(x?.quantity||1)}" required></div>
  <div class="field"><label for="item-notes">Note (facoltative)</label><textarea class="control" id="item-notes" name="notes" rows="2" maxlength="3000" placeholder="Dettagli utili per riconoscerlo">${esc(x?.notes||'')}</textarea></div>
  <p class="form-help">Se non hai ancora creato la posizione, puoi salvare l'oggetto provvisoriamente senza posizione.</p>
  <div class="dialog-footer"><button class="btn btn-outline" type="button" data-action="close-dialog">Annulla</button><button class="btn btn-primary" type="submit">Salva oggetto</button></div></form>`);
  $('#item-form').addEventListener('submit',async e=>{
    e.preventDefault();const f=new FormData(e.currentTarget);const name=String(f.get('name')||'').trim();const quantity=Number(f.get('quantity'));
    if(!name||!Number.isSafeInteger(quantity)||quantity<1){toast('Inserisci un nome e una quantità valida.');return;}
    const row={id:x?.id||uid(),name,locationId:String(f.get('locationId')||'')||null,category:String(f.get('category')||'').trim(),quantity,notes:String(f.get('notes')||'').trim(),createdAt:x?.createdAt||Date.now(),updatedAt:Date.now()};
    try{await requestStore('items','put',row);closeDialog();state.itemDetail=null;await refresh();toast('Oggetto salvato.');}catch(err){errorMessage(err);}
  });
}
// Associa in un'unica operazione più oggetti esistenti a una posizione.
// Un oggetto può avere una sola posizione: non viene mai duplicato.
function addExistingItemsDialog(locationId){
 const destination=loc(locationId);
 if(!destination){toast('Posizione non trovata.');return;}
 const candidates=sortedItems(state.items.filter(x=>x.locationId!==locationId));
 if(!candidates.length){toast('Non ci sono altri oggetti da aggiungere a questa posizione.');return;}
 const selected=new Set();
 showDialog(`<div class="dialog-header"><h2>Aggiungi a ${esc(destination.name)}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="Chiudi">×</button></div>
  <p class="form-help">Seleziona gli oggetti già registrati che vuoi mettere in questa posizione. Se si trovano altrove, verranno spostati (non duplicati).</p>
  <div class="field"><label for="existing-item-search">Cerca negli oggetti</label><input class="control" id="existing-item-search" type="search" autocomplete="off" placeholder="Nome, categoria o posizione precedente"></div>
  <div id="existing-item-list" class="existing-item-list" role="group" aria-label="Oggetti disponibili"></div>
  <p id="existing-item-count" class="form-help" aria-live="polite">0 oggetti selezionati</p>
  <div class="dialog-footer"><button class="btn btn-outline" type="button" data-action="close-dialog">Annulla</button><button class="btn btn-primary" type="button" id="save-existing-items" disabled>Sposta selezionati</button></div>`);
 const input=$('#existing-item-search'),list=$('#existing-item-list'),save=$('#save-existing-items'),count=$('#existing-item-count');
 const draw=()=>{
  const q=normalized(input.value);
  const visible=candidates.filter(x=>normalized([x.name,x.category||'',x.notes||'',pathOf(x.locationId)].join(' ')).includes(q));
  list.innerHTML=visible.length?visible.map(x=>`<label class="existing-item-row"><input type="checkbox" value="${esc(x.id)}" ${selected.has(x.id)?'checked':''}><span class="existing-item-content"><strong>${esc(x.name)}</strong><small>${esc(pathOf(x.locationId))}</small></span></label>`).join(''):'<p class="muted small">Nessun oggetto corrispondente alla ricerca.</p>';
  const n=selected.size;
  count.textContent=`${n} ${n===1?'oggetto selezionato':'oggetti selezionati'}`;
  save.disabled=n===0;
  save.textContent=n===0?'Sposta selezionati':`Sposta ${n} ${n===1?'oggetto':'oggetti'}`;
 };
 input.addEventListener('input',draw);
 list.addEventListener('change',e=>{
  const box=e.target.closest('input[type="checkbox"]');
  if(!box)return;
  if(box.checked)selected.add(box.value);else selected.delete(box.value);
  draw();
 });
 save.addEventListener('click',async()=>{
  if(!selected.size)return;
  save.disabled=true;save.textContent='Spostamento…';
  const moved=candidates.filter(x=>selected.has(x.id));
  try{
   await new Promise((resolve,reject)=>{
    const tx=db.transaction('items','readwrite'),store=tx.objectStore('items'),now=Date.now();
    for(const x of moved)store.put({...x,locationId,updatedAt:now});
    tx.oncomplete=resolve;
    tx.onerror=()=>reject(tx.error||new Error('Errore durante lo spostamento.'));
    tx.onabort=()=>reject(tx.error||new Error('Spostamento annullato.'));
   });
   closeDialog();await refresh();
   toast(`${moved.length} ${moved.length===1?'oggetto spostato':'oggetti spostati'} in ${destination.name}.`);
  }catch(err){errorMessage(err);draw();}
 });
 draw();
}
// Spostamento atomico: mantiene nomi, note, categorie e fotografie delle posizioni.
async function moveItemsBatch(ids,destinationId){
 if(!loc(destinationId))throw new Error('La posizione di destinazione non esiste più.');
 const unique=[...new Set(ids)];
 const moving=unique.map(id=>item(id));
 if(!moving.length||moving.some(x=>!x))throw new Error('Uno o più oggetti non sono più disponibili.');
 await new Promise((resolve,reject)=>{
  const tx=db.transaction('items','readwrite'),store=tx.objectStore('items'),now=Date.now();
  for(const x of moving)store.put({...x,locationId:destinationId,updatedAt:now});
  tx.oncomplete=resolve;
  tx.onerror=()=>reject(tx.error||new Error('Errore durante lo spostamento.'));
  tx.onabort=()=>reject(tx.error||new Error('Spostamento annullato.'));
 });
 return moving.length;
}
function bulkMoveDialog(){
 const chosen=[...state.selectedItems].filter(id=>item(id));
 if(!chosen.length){toast('Seleziona almeno un oggetto.');return;}
 if(!state.locations.length){toast('Crea prima una posizione.');return;}
 const destOptions=sortedLocations(state.locations).map(p=>`<option value="${esc(p.id)}">${esc(pathOf(p.id))}</option>`).join('');
 showDialog(`<div class="dialog-header"><h2>Assegna una posizione</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="Chiudi">×</button></div>
  <p class="form-help">${chosen.length} ${chosen.length===1?'oggetto selezionato':'oggetti selezionati'}. Tutti verranno assegnati alla stessa posizione, senza creare duplicati.</p>
  <form id="bulk-move-form"><div class="field"><label for="bulk-destination">Posizione di destinazione *</label><select class="control" id="bulk-destination" required><option value="">Seleziona una posizione…</option>${destOptions}</select></div>
  <p class="form-help">Se un oggetto è in un'altra posizione, verrà spostato. Le altre informazioni non cambiano.</p>
  <div class="dialog-footer"><button type="button" class="btn btn-outline" data-action="close-dialog">Annulla</button><button type="submit" class="btn btn-primary">Conferma spostamento</button></div></form>`);
 $('#bulk-move-form').addEventListener('submit',async e=>{
  e.preventDefault();const destinationId=$('#bulk-destination').value;
  if(!destinationId){toast('Scegli una posizione.');return;}
  const button=e.currentTarget.querySelector('[type="submit"]');button.disabled=true;button.textContent='Spostamento…';
  try{
   const count=await moveItemsBatch(chosen,destinationId);
   const name=pathOf(destinationId);
   state.selectedItems.clear();state.bulkSelecting=false;
   closeDialog();await refresh();toast(`${count} ${count===1?'oggetto spostato':'oggetti spostati'} in ${name}.`);
  }catch(err){errorMessage(err);button.disabled=false;button.textContent='Conferma spostamento';}
 });
}
// v0.4.2: i comuni file JPEG/PNG/WEBP vengono salvati direttamente.
// L'anteprima non garantisce che una seconda decodifica tramite Image()+canvas
// riesca su tutti i browser Android. Non dipendiamo da tale decodifica per
// fotografie di dimensioni normali; questo preserva anche l'originale.
async function imageToJpeg(file){
  if(!file || file.size === 0)throw new Error('Il file selezionato è vuoto. Scegli nuovamente la fotografia.');
  if(file.size > 30*1024*1024)throw new Error('Fotografia troppo grande (massimo 30 MB).');
  const type = ({'image/jpg':'image/jpeg','image/pjpeg':'image/jpeg'}[file.type] || file.type || '').toLowerCase();
  const ext = (file.name || '').split('.').pop().toLowerCase();
  const normalizedType = ['image/jpeg','image/png','image/webp'].includes(type) ? type :
    (['jpg','jpeg'].includes(ext) ? 'image/jpeg' : ext==='png' ? 'image/png' : ext==='webp' ? 'image/webp' : type);
  const commonFormat = ['image/jpeg','image/png','image/webp'].includes(normalizedType);
  // Percorso affidabile per fotografie della galleria: nessuna conversione.
  if(commonFormat && file.size<=12*1024*1024){
    return new Blob([file],{type:normalizedType});
  }
  // Comprimi solo le fotografie molto grandi o i formati non comuni.
  const u=URL.createObjectURL(file);
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{
      img.onload=resolve;
      img.onerror=()=>reject(new Error('Impossibile leggere il formato della fotografia. Scegli un JPG o PNG.'));
      img.src=u;
    });
    if(!img.naturalWidth || !img.naturalHeight)throw new Error('La fotografia non ha dimensioni valide.');
    const scale=Math.min(1,1400/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));
    canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx)throw new Error('Impossibile preparare la fotografia su questo dispositivo.');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    return await new Promise((resolve,reject)=>{
      canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Conversione della fotografia non riuscita.')),'image/jpeg',.78);
    });
  }catch(err){
    // Se il browser non riesce a comprimere il file, il formato comune è
    // comunque salvabile come Blob, se c'è spazio sul dispositivo.
    if(commonFormat)return new Blob([file],{type:normalizedType});
    throw err;
  }finally{URL.revokeObjectURL(u);}
}
function locationSaveError(err,stage){
  console.error('Salvataggio posizione fallito:',stage,err);
  const code=err?.name||'';
  let detail=err?.message||'Errore sconosciuto.';
  if(code==='QuotaExceededError')detail='Lo spazio di archiviazione del browser potrebbe essere esaurito. Libera spazio e riprova.';
  else if(code==='SecurityError')detail='Chrome sta bloccando l’accesso alla memoria locale. Apri l’app normalmente, non in incognito.';
  else if(code==='NotReadableError')detail='Il file non è leggibile. Seleziona di nuovo la foto dalla galleria.';
  return `Salvataggio non riuscito durante ${stage}. ${detail}${code?` [${code}]`:''}`;
}

function locationForm(id=null,defaultParent=null){
 const p=id?loc(id):null;const parent=defaultParent||p?.parentId||'';
 showDialog(`<div class="dialog-header"><h2>${p?'Modifica posizione':'Nuova posizione'}</h2><button class="dialog-close" type="button" data-action="close-dialog" aria-label="Chiudi">×</button></div><form id="location-form">
 <div class="field"><label for="loc-name">Nome posizione *</label><input class="control" id="loc-name" name="name" value="${esc(p?.name||'')}" placeholder="Es. Scatola arancione" maxlength="150" required></div>
 <div class="field"><label for="loc-parent">Si trova dentro</label><select class="control" id="loc-parent" name="parentId">${locationOptions(parent,id)}</select></div>
 <div class="field"><label for="loc-notes">Descrizione (facoltativa)</label><textarea class="control" name="notes" id="loc-notes" rows="2" maxlength="1500" placeholder="Es. Primo scaffale dall'alto">${esc(p?.notes||'')}</textarea></div>
 <div class="field"><label for="loc-photo">Fotografia (facoltativa)</label><input class="control" id="loc-photo" name="photo" type="file" accept="image/*"></div>
 <div class="photo-preview" id="loc-photo-preview" aria-live="polite"></div>
 ${p?.photo?`<label class="small photo-remove"><input id="loc-remove-photo" type="checkbox" name="removePhoto"> Rimuovi la fotografia attuale</label>`:''}
 <p class="file-hint">La foto nuova viene salvata solo dopo aver premuto «Salva posizione».</p>
 <p class="form-save-feedback" id="save-location-status" role="status" aria-live="polite"></p>
 <div class="dialog-footer"><button class="btn btn-outline" type="button" data-action="close-dialog">Annulla</button><button class="btn btn-primary" type="submit">Salva posizione</button></div></form>${p?`<div class="separator"></div><button class="btn btn-danger" data-action="delete-location" data-id="${esc(p.id)}">Elimina posizione vuota</button>`:''}`);
 const photoInput=$('#loc-photo'),removeInput=$('#loc-remove-photo'),preview=$('#loc-photo-preview'),saveStatus=$('#save-location-status');
 let currentPreviewUrl=null;
 const clearPreviewUrl=()=>{if(currentPreviewUrl){URL.revokeObjectURL(currentPreviewUrl);currentPreviewUrl=null;}};
 $('#form-dialog').addEventListener('close',clearPreviewUrl,{once:true});
 function showPhotoPreview(){
   clearPreviewUrl();preview.replaceChildren();
   const file=photoInput.files?.[0];
   const removed=Boolean(removeInput?.checked);
   const blob=file||(!removed?p?.photo:null);
   if(blob){
     currentPreviewUrl=URL.createObjectURL(blob);
     const image=document.createElement('img');image.src=currentPreviewUrl;
     image.alt=file?'Anteprima della fotografia selezionata':'Fotografia attualmente salvata';
     const caption=document.createElement('div');caption.className='photo-preview-label';
     const title=document.createElement('strong');title.textContent=file?'Anteprima della nuova fotografia':'Fotografia attualmente salvata';
     const description=document.createElement('span');description.textContent=file?'Non ancora salvata · '+file.name:'Già presente nell’archivio';
     caption.append(title,description);preview.append(image,caption);
   }else{
     const hint=document.createElement('p');hint.className='photo-preview-empty';
     hint.textContent=removed?'La fotografia attuale sarà rimossa quando salvi.':'Nessuna fotografia associata alla posizione.';
     preview.append(hint);
   }
 }
 photoInput.addEventListener('change',()=>{if(photoInput.files?.length&&removeInput)removeInput.checked=false;saveStatus.textContent='';showPhotoPreview();});
 removeInput?.addEventListener('change',()=>{if(removeInput.checked)photoInput.value='';saveStatus.textContent='';showPhotoPreview();});
 showPhotoPreview();
 $('#location-form').addEventListener('submit',async e=>{
   e.preventDefault();
   const form=e.currentTarget;
   const f=new FormData(form);
   const name=String(f.get('name')||'').trim();
   if(!name){toast('Inserisci un nome.');return;}
   const parentId=String(f.get('parentId')||'')||null;
   if(id&&parentId&&(parentId===id||ancestors(parentId).some(l=>l.id===id))){toast('Non puoi inserire una posizione dentro se stessa.');return;}
   const btn=form.querySelector('[type="submit"]');
   btn.disabled=true;btn.textContent='Salvataggio…';
   saveStatus.className='form-save-feedback';saveStatus.textContent='Preparazione del salvataggio…';
   let stage='lettura dei dati';
   let saved=false;
   let row;
   let title;
   try{
     // Leggiamo il file direttamente dal campo: è più affidabile di FormData
     // sui browser mobili, specialmente quando si usano galleria e fotocamera.
     const file=photoInput.files?.[0]||null;
     const hasNewPhoto=Boolean(file&&file.size>0);
     const removePhoto=Boolean(removeInput?.checked)&&!hasNewPhoto;
     let photo=p?.photo||null;
     if(removePhoto)photo=null;
     if(hasNewPhoto){
       stage='elaborazione della fotografia';
       btn.textContent='Elaborazione foto…';
       saveStatus.textContent='Elaborazione della fotografia in corso…';
       photo=await imageToJpeg(file);
     }
     row={id:p?.id||uid(),name,parentId,notes:String(f.get('notes')||'').trim(),photo,createdAt:p?.createdAt||Date.now(),updatedAt:Date.now()};
     stage='scrittura nella memoria locale';
     btn.textContent='Salvataggio…';
     saveStatus.textContent='Salvataggio nella memoria del telefono…';
     await requestStore('locations','put',row);
     // Arriviamo qui solo dopo che la transazione IndexedDB è completata.
     saved=true;
     title=hasNewPhoto?'Fotografia salvata correttamente':removePhoto?'Fotografia rimossa correttamente':'Posizione salvata correttamente';
     const description=hasNewPhoto?'La foto è ora associata a questa posizione.':removePhoto?'La posizione non ha più una fotografia.':photo?'La fotografia esistente è stata mantenuta.':'La posizione è stata aggiornata.';
     state.locationSaveNotice={id:row.id,title,description};
   }catch(err){
     const message=locationSaveError(err,stage);
     saveStatus.className='form-save-feedback form-save-error';
     saveStatus.textContent=message;
     btn.disabled=false;btn.textContent='Riprova salvataggio';
     return;
   }
   // Non confondiamo un problema di aggiornamento dell'interfaccia con
   // un fallimento del salvataggio: il database è già stato aggiornato.
   if(saved){
     state.tab='places';state.currentPlace=row.id;state.itemDetail=null;
     try{closeDialog();await refresh();toast(title);}
     catch(err){
       console.error('Posizione salvata, ma vista non aggiornata:',err);
       alert('La posizione è stata salvata, ma la schermata non si è aggiornata. Chiudi e riapri l’app.');
     }
   }
 });
}
async function deleteItem(id){const x=item(id);if(!x||!confirm(`Eliminare “${x.name}” dall'archivio?`))return;try{await requestStore('items','delete',id);state.itemDetail=null;await refresh();toast('Oggetto eliminato.');}catch(err){errorMessage(err);}}
async function deleteLocation(id){const p=loc(id);if(!p)return;
 if(state.locations.some(x=>x.parentId===id)||state.items.some(x=>x.locationId===id)){toast('Prima sposta o elimina gli oggetti e le sottoposizioni contenuti.');return;}
 if(!confirm(`Eliminare la posizione vuota “${p.name}”?`))return;
 try{await requestStore('locations','delete',id);closeDialog();state.currentPlace=p.parentId||null;await refresh();toast('Posizione eliminata.');}catch(err){errorMessage(err);}
}
function zoom(id){const p=loc(id);if(!p?.photo)return;previewUrl=URL.createObjectURL(p.photo);$('#photo-full').src=previewUrl;$('#photo-full').alt=`Fotografia di ${p.name}`;$('#photo-dialog').showModal();}
function closeZoom(){const dialog=$('#photo-dialog');if(dialog.open)dialog.close();if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}$('#photo-full').removeAttribute('src');}
function blobToDataURL(blob){return new Promise((resolve,reject)=>{const f=new FileReader();f.onload=()=>resolve(f.result);f.onerror=()=>reject(f.error);f.readAsDataURL(blob);});}
function dataURLToBlob(url){
 if(typeof url!=='string'||!/^data:image\/(jpeg|png|webp);base64,/.test(url))throw new Error('Fotografia di backup non valida.');
 const [meta,b64]=url.split(',');const bin=atob(b64);const bytes=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)bytes[i]=bin.charCodeAt(i);return new Blob([bytes],{type:meta.split(':')[1].split(';')[0]});
}
async function exportData(){
 try{
   const positions=[];
   for(const p of state.locations)positions.push({...p,photo:p.photo?await blobToDataURL(p.photo):null});
   const content={app:'dove-archivio',schema:1,exportedAt:new Date().toISOString(),locations:positions,items:state.items};
   const file=new Blob([JSON.stringify(content)],{type:'application/json'});
   const url=URL.createObjectURL(file);const a=document.createElement('a');a.href=url;a.download=`dove-backup-${new Date().toISOString().slice(0,10)}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('Backup creato: conserva il file al sicuro.');
 }catch(err){errorMessage(err);}
}
function validateImport(data){
 if(data?.app!=='dove-archivio'||data?.schema!==1||!Array.isArray(data.locations)||!Array.isArray(data.items))throw new Error('Il file non è un backup Dov’è? valido.');
 if(data.locations.length>100000||data.items.length>100000)throw new Error('Il file contiene troppi dati.');
 const ids=new Set(),itemIds=new Set();
 for(const p of data.locations){if(!p||typeof p.id!=='string'||typeof p.name!=='string'||!p.name.trim()||ids.has(p.id))throw new Error('Posizioni non valide nel backup.');ids.add(p.id);}
 for(const p of data.locations){if(p.parentId&&!ids.has(p.parentId))throw new Error('Un contenitore fa riferimento a una posizione mancante.');}
 for(const x of data.items){if(!x||typeof x.id!=='string'||typeof x.name!=='string'||!x.name.trim()||itemIds.has(x.id)||x.locationId&&!ids.has(x.locationId))throw new Error('Oggetti non validi nel backup.');itemIds.add(x.id);}
 for(const p of data.locations){let curr=p,seen=new Set();while(curr?.parentId){if(seen.has(curr.id))throw new Error('Posizioni cicliche nel backup.');seen.add(curr.id);curr=data.locations.find(x=>x.id===curr.parentId);}}
}
async function importData(file){
 if(!file)return;
 try{
   const raw=await file.text();const data=JSON.parse(raw);validateImport(data);
   if(!confirm(`Il backup contiene ${data.items.length} oggetti e ${data.locations.length} posizioni. Vuoi SOSTITUIRE completamente l'archivio su questo dispositivo?`))return;
   const positions=data.locations.map(p=>({...p,photo:p.photo?dataURLToBlob(p.photo):null}));
   // Una sola transazione: evita cancellazioni parziali in caso di errore.
   await new Promise((resolve,reject)=>{
     const tx=db.transaction(['items','locations'],'readwrite');
     tx.objectStore('items').clear();tx.objectStore('locations').clear();
     for(const p of positions)tx.objectStore('locations').put(p);
     for(const x of data.items)tx.objectStore('items').put(x);
     tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
   });
   state.itemDetail=null;state.currentPlace=null;state.tab='search';state.query='';state.bulkSelecting=false;state.selectedItems.clear();state.itemsFilter='';await refresh();toast('Archivio ripristinato correttamente.');
 }catch(err){errorMessage(err);}
 finally{$('#import-file').value='';}
}
async function requestPersist(){
 if(!navigator.storage?.persist){toast('Questo browser non supporta la richiesta. Usa comunque i backup.');return;}
 try{const granted=await navigator.storage.persist();toast(granted?'Memoria persistente autorizzata.':'Richiesta non autorizzata: esporta periodicamente un backup.');}catch(err){errorMessage(err);}
}
function onAction(button){
 const action=button.dataset.action,id=button.dataset.id||null;
 switch(action){
  case 'new-item':itemForm(null,button.dataset.parent||null);break;
  case 'new-location':locationForm(null,button.dataset.parent||null);break;
  case 'add-existing-items':addExistingItemsDialog(id);break;
  case 'toggle-bulk':state.bulkSelecting=!state.bulkSelecting;state.selectedItems.clear();render();break;
  case 'bulk-select-visible':for(const x of filteredAndSortedItems())state.selectedItems.add(x.id);renderItemsList();break;
  case 'bulk-clear':state.selectedItems.clear();renderItemsList();break;
  case 'bulk-move':bulkMoveDialog();break;
  case 'edit-item':itemForm(id);break;
  case 'edit-location':locationForm(id);break;
  case 'delete-item':deleteItem(id);break;
  case 'delete-location':deleteLocation(id);break;
  case 'item-detail':state.itemDetail=id;render();window.scrollTo(0,0);break;
  case 'detail-back':state.itemDetail=null;render();break;
  case 'place':state.itemDetail=null;state.tab='places';state.currentPlace=id;render();window.scrollTo(0,0);break;
  case 'open-item-location':state.itemDetail=null;state.tab='places';state.currentPlace=id;render();window.scrollTo(0,0);break;
  case 'zoom':zoom(id);break;
  case 'close-dialog':closeDialog();break;
  case 'export':exportData();break;
  case 'import':$('#import-file').click();break;
  case 'persist':requestPersist();break;
 }
}
async function init(){
 try{
  db=await openDatabase();
  document.body.addEventListener('click',e=>{const button=e.target.closest('[data-action]');if(button)onAction(button);});
  document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>{if(state.tab!==b.dataset.tab){state.bulkSelecting=false;state.selectedItems.clear();}state.tab=b.dataset.tab;state.itemDetail=null;render();window.scrollTo(0,0);}));
  $('#top-add').addEventListener('click',()=>itemForm(null,state.currentPlace));
  $('#photo-close').addEventListener('click',closeZoom);
  $('#photo-dialog').addEventListener('close',()=>{if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null;}$('#photo-full').removeAttribute('src');});
  $('#import-file').addEventListener('change',e=>importData(e.target.files?.[0]));
  await refresh();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(err => console.info('Offline non disponibile:', err));
  }
 }catch(err){
  console.error(err);
  $('#view').innerHTML=`<div class="empty"><h2>Impossibile aprire l'archivio locale</h2><p>${esc(err.message||'Controlla che il browser consenta IndexedDB.')}</p><p>Apri l'app da Chrome tramite un indirizzo HTTPS, evitando la modalità in incognito.</p></div>`;
 }
}
init();
