import { createToolbarTint } from './toolbar-tint.js';
/* SpotGlass 1.0.1 — ogressar. Spotify-inspired styling for Yandex Music. */
export function startInterface(bridge) {
  'use strict';

  const root = document.documentElement;
  const toolbarTint = createToolbarTint();
  const sourceScript = null;
  const defaults = { enabled:true, wide:true, panel:true, compact:false, green:true, waveTile:true, hideAds:true, lrclib:true };
  let options = { ...defaults }, store, unsubscribe, timer, observer;
  const startupAt=Date.now();let libraryStartTimer,trackChangedAt=0;
  let trackUpdatePending=false;
  let trackOff, queueOff, syncTimer, cues=[], activeCue=-2, libraryLoading=false, libraryLoaded=false, libraryRetryAt=0;
  let dead = false, lastKey = '', panel, title, artist, album, art;
  let panelDismissed = false, attempts = 0, styleSeen = false, coverNode, lastCover = null;
  const ownedAttributes = ['data-spotglass','data-sg-wide','data-sg-panel','data-sg-compact','data-sg-native','data-sg-chrome','data-sg-wave-card','data-sg-search-ready','data-sg-hide-ads'];
  const previousAttributes = new Map(ownedAttributes.map(name=>[name,root.getAttribute(name)]));
  const previousAccent = [root.style.getPropertyValue('--sg-accent'),root.style.getPropertyPriority('--sg-accent')];
  const previousScale=new Map(['--sg-scale','--sg-font-base','--sg-content-zoom'].map(k=>[k,[root.style.getPropertyValue(k),root.style.getPropertyPriority(k)]]));
  const baseFont=parseFloat(getComputedStyle(root).fontSize)||16;
  let lastScaleWidth=-1;
  function updateScale(){if(lastScaleWidth===innerWidth)return;lastScaleWidth=innerWidth;root.style.setProperty('--sg-content-zoom',String(Math.min(.9,Math.max(.8,.8+(innerWidth-1280)/10000))));root.style.setProperty('--sg-scale',String(Math.min(1.4,Math.max(1,1+(innerWidth-1440)/1920))));root.style.setProperty('--sg-font-base',baseFont+'px');}
  function element(tag, className, text) {
    const el=document.createElement(tag); el.className=className;
    if(text!==undefined) el.textContent=text;
    return el;
  }
  function mount() {
    if(panel || !document.body) return;
    panel=element('aside','');panel.id='spotglass-panel';panel.setAttribute('aria-label','Сейчас играет');
    const heading=element('div','sg-heading','Сейчас играет');
    const close=element('button','sg-close','×');close.type='button';close.setAttribute('aria-label','Закрыть панель текущего трека');
    close.addEventListener('click',()=>{panelDismissed=true;apply();});heading.append(close);
    art=element('img','sg-art');art.alt='Обложка текущего трека';art.hidden=true;art.decoding='async';
    art.addEventListener('error',()=>{const fallback=nativeCover();if(fallback&&art.src!==fallback){art.src=fallback;}else art.hidden=true;});
    title=element('h2','','Включи музыку');artist=element('p','sg-artist','Здесь появится текущий трек');
    const details=element('div','sg-details');album=element('div','sg-album','—');
    details.append(element('div','sg-label','Альбом'),album);
    panel.append(heading,art,title,artist);mountExtras();panel.insertBefore(details,panel.querySelector('.sg-next-card'));
    document.body.append(panel);
  }
  function apply() {
    updateScale();
    root.setAttribute('data-spotglass',options.enabled?'on':'off');
    root.setAttribute('data-sg-wide',String(options.wide));
    root.setAttribute('data-sg-panel',String(options.enabled&&options.panel&&!panelDismissed));
    root.setAttribute('data-sg-compact',String(options.compact));root.setAttribute('data-sg-hide-ads',String(options.hideAds));
    root.style.setProperty('--sg-accent',options.green?'#1ed760':'#eeeeee');
    if(options.enabled&&options.panel) mount();
    if(options.enabled) {scheduleChrome();resumeLyrics();}
    else { lyricsDialog?.close();lyricsAbort?.abort();lyricsTrack='';navObserver?.disconnect();contentObserver?.disconnect();nativeNav=null;nativeContent=null; }
  }
  function receiveSettings(raw={}) {
    const next={};
    for(const [key,fallback] of Object.entries(defaults)) {
      const entry=raw?.[key];const value=entry&&typeof entry==='object'?(entry.value??entry.default):entry;
      next[key]=typeof value==='boolean'?value:fallback;
    }
    if(JSON.stringify(next)===JSON.stringify(options)) return;
    if(next.panel!==options.panel) panelDismissed=false;
    options=next;apply();
  }
  function bindSettings() {
    if(store) return;
    try {
      const candidate=bridge?.getSettings?.('SpotGlass');
      if(candidate?.getCurrent) {
        receiveSettings(candidate.getCurrent());store=candidate;
        unsubscribe=store.onChange?.(next=>{if(!dead)receiveSettings(next);});
      }
    } catch { /* The host may still be starting. */ }
  }
  function nativeCover() {
    if(!coverNode?.isConnected) coverNode=document.querySelector('[class^="PlayerBarMobile_cover__"], [class*=" PlayerBarMobile_cover__"], [class^="PlayerBarDesktopWithBackgroundProgressBar_cover__"], [class*=" PlayerBarDesktopWithBackgroundProgressBar_cover__"]');
    const image=coverNode?.tagName==='IMG'?coverNode:coverNode?.querySelector('img');
    const source=image?.currentSrc||image?.src;
    if(!source)return '';
    try{const u=new URL(source,document.baseURI);return ['https:','http:','blob:'].includes(u.protocol)?u.href:'';}catch{return '';}
  }
  function coverUrl(value, size=800) {
    if(typeof value!=='string'||!value)return '';
    try {
      let raw=value.startsWith('//')?'https:'+value:/^https?:/.test(value)?value:'https://'+value;
      const u=new URL(raw);
      if(u.protocol!=='https:'||!/^avatars\.(?:mds\.)?yandex\.(?:net|ru)$/.test(u.hostname))return '';
      u.pathname=u.pathname.replace(/(?:%%|%25%25|\d+x\d+)$/i,size+'x'+size);
      return u.href;
    }catch{return '';}
  }
  function safeCover(track) {return coverUrl(track.coverUri,800)||nativeCover();}
  function updateTrack() {
    if(!panel||!options.enabled||!options.panel||panelDismissed||window.innerWidth<1280) return;
    const track=bridge?.getCurrentTrack?.();
    if(!track||typeof track!=='object'||typeof track.then==='function') {renderQueue();return;}
    const data={id:String(track.id??''),title:String(track.title||'Без названия'),artist:Array.isArray(track.artists)?track.artists.map(x=>String(x.name||'')).filter(Boolean).join(', '):'',album:String(track.albums?.[0]?.title||'Сингл'),cover:String(track.coverUri||'')};
    const key=JSON.stringify(data);
    if(key!==lastKey) {lastKey=key;title.textContent=data.title;artist.textContent=data.artist;album.textContent=data.album;}
    updateExtras(track);
    const cover=safeCover(track);
    if(cover!==lastCover){lastCover=cover;art.hidden=true;art.removeAttribute('src');if(cover){art.src=cover;art.hidden=false;}}
  }
  function tick() {
    if(dead) return;
    try {
      // One CSS sentinel also detects host removal when currentScript is unavailable.
      const present=getComputedStyle(root).getPropertyValue('--sg-style-loaded').trim()==='1';
      if(present)styleSeen=true;
      if(styleSeen&&!present){destroy();return;}
      bindSettings();bindLive();
      if(!document.hidden){mount();updateTrack();if(cues.length&&!syncTimer)syncLyrics();if(options.enabled)bindPlayerIcons();if(options.enabled&&(!sidebar?.isConnected||!toolbar?.isConnected))scheduleChrome();}
    } catch(error) {if(attempts<1)console.debug('[SpotGlass] Host API is not ready',error);}
    attempts++;
    timer=setTimeout(tick,document.hidden?10000:2000);
  }
  function destroy() {
    if(dead)return;dead=true;clearTimeout(timer);clearTimeout(libraryStartTimer);clearTimeout(syncTimer);trackOff?.();queueOff?.();observer?.disconnect();
    try{if(typeof unsubscribe==='function')unsubscribe();}catch{}
    lyricsAbort?.abort();lyricsDialog?.remove();panel?.remove();teardownChrome();playerObserver?.disconnect();for(const [node,value] of glyphOriginal){if(value===null)node.removeAttribute("data-sg-glyph");else node.setAttribute("data-sg-glyph",value);}
    for(const [name,value] of previousAttributes){if(value===null)root.removeAttribute(name);else root.setAttribute(name,value);}
    if(previousAccent[0])root.style.setProperty('--sg-accent',...previousAccent);else root.style.removeProperty('--sg-accent');
    for(const [k,v] of previousScale){if(v[0])root.style.setProperty(k,...v);else root.style.removeProperty(k);}
    window.removeEventListener('pagehide',destroy);

  }
  let lyricsBody, lyricsExpand, lyricsDialog, lyricsAbort, lyricsTrack='', lyricsText='', lyricsState='', nativeLyricsRequested='', nextCard, nextKey='', sidePlay, sidePrev, sideNext;
  function nativeActionButton(kind) {
    const footer=document.querySelector(component('CommonLayout_compositePlayerBar'));
    if(!footer)return null;
    if(kind==='play')return footer.querySelector('button[data-sg-glyph="play"],button[data-sg-glyph="pause"]');
    return footer.querySelector('button[data-sg-glyph="'+kind+'"]');
  }
  function playerAction(kind) {
    const api=bridge;const method=({play:'togglePlayPause',next:'next',previous:'previous'})[kind];
    if(method&&typeof api?.[method]==='function'){try{Promise.resolve(api[method]()).catch(()=>{});}catch{}return;}
    const native=nativeActionButton(kind);if(native&&!native.disabled)native.click();
  }
  function mountExtras() {
    const lyrics=element('section','sg-lyrics-card');lyrics.hidden=true;const head=element('div','sg-card-heading');head.append(element('strong','','Предпросмотр текста'));
    lyricsExpand=button('Развернуть текст',null,openLyrics,'sg-card-link');lyricsExpand.textContent='Развернуть';lyricsExpand.disabled=true;head.append(lyricsExpand);
    lyricsBody=element('div','sg-lyrics-preview','Включи трек, чтобы увидеть текст.');
    lyrics.append(head,lyricsBody);panel.append(lyrics);
    const queue=element('section','sg-next-card');const queueHead=element('div','sg-card-heading');const open=button('Изменить очередь в плеере',null,()=>{const target=nativeActionButton('queue');if(target&&!target.disabled)target.click();else bridge.showToast('Кнопка очереди сейчас недоступна.');},'sg-card-link');open.textContent='Изменить';queueHead.append(element('strong','','Очередь воспроизведения'),open);
    lastQueueSnapshot=null;nextCard=element('div','sg-next-content','Включи музыку');queue.append(queueHead,nextCard);panel.append(queue);
  }
  function openLyrics() {
    if(!lyricsText)return;
    const expanded=lyricsExpand.getAttribute('aria-expanded')!=='true';
    lyricsExpand.setAttribute('aria-expanded',String(expanded));
    lyricsExpand.textContent=expanded?'Свернуть':'Развернуть';
    lyricsExpand.setAttribute('aria-label',expanded?'Свернуть текст':'Развернуть текст');
    lyricsBody.style.maxHeight=expanded?'var(--sg-lyrics-expanded-height)':'var(--sg-lyrics-preview-height)';
    lyricsBody.classList.toggle('sg-expanded',expanded);activeCue=-2;
  }
  function lyricsColor(track) {
    const card=lyricsBody.closest('.sg-lyrics-card');
    let color='';
    const native=document.querySelector('[class*="FullscreenPlayerMobile_root__"],[class*="FullscreenPlayerDesktop_root__"]');
    if(native&&native.getClientRects().length){const c=getComputedStyle(native).backgroundColor;if(c!=='rgba(0, 0, 0, 0)'&&c!=='transparent')color=c;}
    if(color){card.dataset.track=String(track.id);card.dataset.color=color;}
    else if(card.dataset.track===String(track.id))color=card.dataset.color;
    else {const c=track.derivedColors?.average;if(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c))color=c;}
    card.style.backgroundColor=color||'#333';
    // Choose readable foreground even if the native palette is unusually light.
    const probe=color?.match(/\d+(?:\.\d+)?/g);
    const rgb=color?.startsWith('#')?[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)):probe?.slice(0,3).map(Number);
    card.style.color=rgb&&rgb.length===3&&(rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722)>155?'#171717':'#f5f5f5';
  }
  function cleanLyrics(raw) {
    if(typeof raw!=='string')return '';
    return raw.slice(0,100000).split(/\r?\n/).map(line=>line.replace(/\[\d{1,3}:\d{2}(?:[.:]\d+)?\]/g,'').trim()).filter(line=>line&&!/^\[(?:ar|al|ti|by|offset|length):/i.test(line)).join('\n');
  }
  function parseCues(raw) {
    if(typeof raw!=='string')return [];
    const offset=Number(raw.match(/\[offset:([+-]?\d+)\]/i)?.[1]||0)/1000;
    const result=[];
    for(const line of raw.slice(0,100000).split(/\r?\n/)){
      const matches=[...line.matchAll(/\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]/g)];
      const text=line.replace(/\[\d{1,3}:\d{2}(?:[.:]\d{1,3})?\]/g,'').trim();
      for(const m of matches)result.push({time:Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||'0'))-offset,text});
    }
    return result.sort((a,b)=>a.time-b.time);
  }
  function showLyrics(raw) {
    lyricsText=cleanLyrics(raw);lyricsExpand.disabled=!lyricsText;cues=parseCues(raw);activeCue=-2;
    lyricsBody.closest('.sg-lyrics-card').hidden=!lyricsText;lyricsBody.replaceChildren();
    if(cues.length){for(const cue of cues)lyricsBody.append(element('div','sg-lyric-line',cue.text||'♪'));}
    else lyricsBody.textContent=lyricsText;
    syncLyrics();
  }
  function followLyric(index) {
    const line=lyricsBody.children[Math.max(0,index)];if(!line)return;
    const box=lyricsBody.getBoundingClientRect(), row=line.getBoundingClientRect();
    const top=lyricsBody.scrollTop+row.top-box.top-Math.max(16,(lyricsBody.clientHeight-row.height)*.35);
    lyricsBody.scrollTo({top:Math.max(0,top),behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
  }
  function syncLyrics() {
    clearTimeout(syncTimer);syncTimer=null;if(dead)return;
    if(options.enabled&&!document.hidden&&options.panel&&!panelDismissed&&innerWidth>=1280&&cues.length){
      const api=bridge;
      if(String(api?.getCurrentTrack?.()?.id??'')===lyricsTrack){
        const progress=api?.getProgress?.();const position=Number(typeof progress==='number'?progress:progress?.position);
        if(Number.isFinite(position)){
          let lo=0,hi=cues.length;while(lo<hi){const mid=(lo+hi)>>>1;if(cues[mid].time<=position)lo=mid+1;else hi=mid;}const index=lo-1;
          if(index!==activeCue){lyricsBody.children[activeCue]?.classList.remove('sg-current-line');lyricsBody.children[index]?.classList.add('sg-current-line');activeCue=index;
            followLyric(index);
          }
        }
      }
    }
    if(cues.length&&options.enabled&&options.panel&&!document.hidden&&!panelDismissed&&innerWidth>=1280)syncTimer=setTimeout(syncLyrics,200);
  }
  function scheduleTrackUpdate(){
    if(dead||trackUpdatePending)return;trackUpdatePending=true;
    queueMicrotask(()=>{trackUpdatePending=false;if(!dead&&options.enabled&&!document.hidden)updateTrack();});
  }
  function resumeLyrics(){if(!dead&&!document.hidden){scheduleTrackUpdate();if(cues.length)syncLyrics();}}
  function bindLive(){
    const api=bridge;
    if(!trackOff&&typeof api?.onCurrentTrackChange==='function')trackOff=api.onCurrentTrackChange(scheduleTrackUpdate);
    if(!queueOff&&typeof api?.onQueueChange==='function')queueOff=api.onQueueChange(scheduleTrackUpdate);
  }
  const lyricsCache=new Map();let lrclibAfter=0;
  function usableLyrics(raw){return /[\p{L}\p{N}]/u.test(cleanLyrics(raw).replace(/\[[^\]]*\]/g,''));}
  async function externalLyrics(track,signal){
    if(!options.lrclib||signal.aborted||Date.now()<lrclibAfter)return null;
    const params=new URLSearchParams({track_name:String(track.title||''),artist_name:(track.artists||[]).map(a=>a.name).filter(Boolean).join(', ')});
    if(!params.get('track_name')||!params.get('artist_name'))return null;
    if(track.albums?.[0]?.title)params.set('album_name',track.albums[0].title);
    const duration=Number(track.durationMs)/1000;if(duration>=1&&duration<=3600)params.set('duration',String(duration));
    const key=params.toString();const cached=lyricsCache.get(key);
    if(cached&&cached.until>Date.now())return cached.value;
    const controller=new AbortController();const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});
    const timeout=setTimeout(abort,8000);lrclibAfter=Date.now()+300;
    try{
      const response=await bridge.fetch('https://lrclib.net/api/get?'+key,{signal:controller.signal,credentials:'omit',headers:{'Lrclib-Client':'SpotGlass/1.0.1 (ogressar)'}});
      if(response.status===429||response.status===503){const retry=response.headers.get('Retry-After');const seconds=Number(retry);lrclibAfter=Math.max(Date.now()+60000,Number.isFinite(seconds)?Date.now()+seconds*1000:Date.parse(retry)||0);return null;}
      if(!response.ok&&response.status!==404)throw new Error('Lyrics request failed');
      const data=response.ok?await response.json():null;
      const raw=data&&!data.instrumental?(usableLyrics(data.syncedLyrics)?data.syncedLyrics:data.plainLyrics):null;
      const value=usableLyrics(raw)?{raw,source:'LRCLIB'}:null;
      if(signal.aborted)return null;
      lyricsCache.set(key,{value,until:Date.now()+(value?3600000:300000)});
      while(lyricsCache.size>60)lyricsCache.delete(lyricsCache.keys().next().value);
      return value;
    }finally{clearTimeout(timeout);signal.removeEventListener('abort',abort);}
  }
  async function loadTrackLyrics(track,id,signal){
    const api=bridge;
    if(typeof api?.getNativeLyrics==='function'&&/^[0-9]{1,16}(?::[0-9]{1,16})?$/.test(id)){
      for(const type of ['LRC','TEXT']){
        try{const raw=await api.getNativeLyrics(id,type,signal);if(signal.aborted)return null;if(usableLyrics(raw))return {raw,source:'Яндекс Музыка'};}catch(e){if(signal.aborted)return null;}
      }
    }
    return externalLyrics(track,signal);
  }
  function updateExtras(track) {
    const api=bridge;const id=String(track.id??'');
    lyricsColor(track);
    if(id!==lyricsTrack){trackChangedAt=Date.now();lyricsTrack=id;nativeLyricsRequested='';lyricsAbort?.abort();lyricsAbort=new AbortController();lyricsText='';cues=[];activeCue=-2;lyricsExpand.disabled=true;lyricsDialog?.close();lyricsState='loading';lyricsBody.textContent='';lyricsBody.closest('.sg-lyrics-card').hidden=true;lyricsBody.style.maxHeight='var(--sg-lyrics-preview-height)';lyricsBody.classList.remove('sg-expanded');lyricsExpand.setAttribute('aria-expanded','false');lyricsExpand.textContent='Развернуть';
      const controller=lyricsAbort;
      loadTrackLyrics(track,id,controller.signal).then(result=>{
        if(dead||controller.signal.aborted||lyricsTrack!==id)return;
        lyricsState='ready';showLyrics(result?.raw||'');
        let label=lyricsBody.parentElement.querySelector('.sg-lyrics-source');
        if(!label){label=element('div','sg-lyrics-source');lyricsBody.parentElement.append(label);}
        label.textContent=result?'Источник: '+result.source:'';
      }).catch(()=>{if(!dead&&!controller.signal.aborted&&lyricsTrack===id){lyricsState='ready';showLyrics('');}});
    }
    if(lyricsState==='fallback'&&nativeLyricsRequested===id){
      const lines=Array.from(document.querySelectorAll(component('SyncLyricsLine_root'))).map(el=>el.textContent.trim()).filter(Boolean);
      if(lines.length)showLyrics(lines.join('\n'));
    }
    renderQueue();
  }
  let queueLimit=50, lastQueueSnapshot=null, renderedQueueLimit=0;
  function renderQueue() {
    if(!nextCard)return;
    const snapshot=bridge.getQueueSnapshot?.();const items=snapshot?.items||[];const current=snapshot?.currentIndex;
    if(snapshot===lastQueueSnapshot&&queueLimit===renderedQueueLimit)return;
    lastQueueSnapshot=snapshot;renderedQueueLimit=queueLimit;
    const scroll=nextCard.scrollTop;nextCard.replaceChildren();nextCard.classList.add('sg-full-queue');
    if(!items.length){nextCard.textContent='Очередь пуста. Включи трек или плейлист.';return;}
    const start=Number.isInteger(current)&&current>=0?current:0;
    const summary=element('div','sg-queue-summary',`Далее: ${Math.max(0,items.length-start-1)} треков`);nextCard.append(summary);
    if(start>0){const past=element('details','sg-queue-past');past.append(element('summary','',`Уже прозвучало: ${start}`));past.addEventListener('toggle',()=>{if(past.open&&!past.dataset.loaded){past.dataset.loaded='true';for(let i=0;i<start;i++)past.append(queueRow(items[i],i,false));}},{once:false});nextCard.append(past);}
    for(let i=start;i<Math.min(items.length,start+queueLimit);i++)nextCard.append(queueRow(items[i],i,i===current));
    if(items.length>start+queueLimit){const more=button('Показать ещё 50 треков',null,()=>{queueLimit+=50;renderQueue();},'sg-card-link');more.textContent='Показать ещё';nextCard.append(more);}
    nextCard.scrollTop=scroll;
  }
  function queueRow(track,index,current) {
    const row=element('div','sg-queue-row');if(current)row.setAttribute('aria-current','true');
    const cover=coverUrl(track.coverUri,100);if(cover){const img=element('img','sg-next-cover');img.src=cover;img.alt='';img.loading='lazy';row.append(img);}
    const names=element('div','sg-next-names');names.append(element('strong','',String(track.title||'Без названия')),element('span','',(track.artists||[]).map(a=>a.name).join(', ')));
    if(current)names.append(element('span','sg-queue-current','Сейчас играет'));
    row.append(names);const seconds=Math.floor(Number(track.durationMs)/1000);
    if(seconds>0)row.append(element('span','sg-queue-duration',Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')));
    return row;
  }

  let playerObserver, playerTarget;
  const glyphOriginal=new Map();
  function bindPlayerIcons() {
    const target=document.querySelector('[class^="CommonLayout_compositePlayerBar__"],[class*=" CommonLayout_compositePlayerBar__"]');
    if(!target)return;
    if(target===playerTarget)return;
    if(target!==playerTarget){playerObserver?.disconnect();playerTarget=target;playerObserver=new MutationObserver(paintPlayerIcons);playerObserver.observe(target,{subtree:true,childList:true,attributes:true,attributeFilter:['href','xlink:href','aria-label','title']});}
    paintPlayerIcons();
  }
  function paintPlayerIcons() {
    if(dead||!options.enabled||!playerTarget)return;
    for(const [node] of glyphOriginal)if(!node.isConnected)glyphOriginal.delete(node);
    for(const b of playerTarget.querySelectorAll('button')){
      const use=b.querySelector('svg use');const ref=(use?.getAttribute('href')||use?.getAttribute('xlink:href')||'').split('#')[1]||'';
      const id=ref.replace(/_(xxxs|xxs|xs|s|m|l|xl)$/,'').toLowerCase();
      const label=(b.getAttribute('aria-label')||b.title||'').toLowerCase();
      let key=({play:'play',play_filled:'play',pause:'pause',pause_filled:'pause',next:'next',previous:'previous',shuffle:'shuffle',repeat:'repeat',repeat_one:'repeat-one',like:'like',like_filled:'like-filled',dislike:'dislike',dislike_filled:'dislike',text:'lyrics',lyrics:'lyrics',playqueue:'queue',queue:'queue',download:'download',cast:'devices',settings:'settings',gear:'settings',volume:'volume',volumeoff:'mute',volume_off:'mute',more:'more'})[id];
      if(!key){if(/текст|lyrics/.test(label))key='lyrics';else if(/очеред|queue/.test(label))key='queue';else if(/скачать|download/.test(label))key='download';else if(/устройств|станци|device/.test(label))key='devices';else if(/настройк|settings/.test(label))key='settings';}
      if(key&&b.querySelector('svg')){if(!glyphOriginal.has(b))glyphOriginal.set(b,b.getAttribute('data-sg-glyph'));if(b.dataset.sgGlyph!==key)b.dataset.sgGlyph=key;}
      else if(glyphOriginal.has(b)){const old=glyphOriginal.get(b);if(old===null)b.removeAttribute('data-sg-glyph');else b.setAttribute('data-sg-glyph',old);glyphOriginal.delete(b);}
    }
  }
  // The custom chrome forwards actions to real Yandex links. No demo library data.
  let sidebar, toolbar, shortcuts, nativeNav, nativeContent, navObserver, contentObserver, refreshTimer;
  let waveLink, homeLink, searchLink, collectionLink, libraryList, librarySearch, selectedFilter='all';
  let libraryKey='', shortcutsKey='', waveExpanded=false, searchTimer, initialHomeDone=false;
  const library = new Map();
  const pinsKey='spotglass:pins:v1:'+bridge.storageScope;
  const pins=new Map();
  try { for(const e of JSON.parse(localStorage.getItem(pinsKey)||'[]')) {
    const u=new URL(e.href,location.href);
    if(u.origin===location.origin&&/\/playlists?\//.test(u.pathname)&&typeof e.label==='string') {
      const entry={href:u.href,label:e.label.slice(0,180),kind:'playlist',cover:typeof e.cover==='string'&&/^https?:/.test(e.cover)?e.cover:''};
      pins.set(entry.href,entry); library.set(entry.href,entry);
    }
  }} catch {}
  let pinCurrent;
  function togglePin(entry) {
    const next=new Map(pins);
    if(next.has(entry.href))next.delete(entry.href);
    else next.set(entry.href,{href:entry.href,label:entry.label,kind:entry.kind,cover:entry.cover});
    try {localStorage.setItem(pinsKey,JSON.stringify([...next.values()]));}
    catch {bridge.showToast('Не удалось сохранить закрепления.');return;}
    pins.clear();for(const [key,value] of next)pins.set(key,value);
    library.set(entry.href,entry);libraryKey='';renderLibrary();syncPinButton();
  }
  function currentPlaylist() {
    if(!/\/playlists?\//.test(location.pathname))return null;
    // PageHeaderPlaylist_root is the controls block, not the whole page header.
    const header=nativeContent?.querySelector(component('PlaylistPageHeader_header'))||nativeContent;
    const titleNode=header?.querySelector(component('PageHeaderTitle_title'))||header?.querySelector('h1');
    const label=(titleNode?.textContent||'').trim();
    if(!label)return null;
    const img=header.querySelector('img');
    return {href:location.origin+location.pathname,label,kind:'playlist',cover:img?.currentSrc||img?.src||''};
  }
  function mountPinForm(section) {
    const add=button('Добавить плейлист по ссылке',null,()=>{form.hidden=!form.hidden;add.setAttribute('aria-expanded',String(!form.hidden));if(!form.hidden)url.focus();},'sg-pin-current');
    add.textContent='+ Добавить плейлист';add.setAttribute('aria-expanded','false');
    const form=element('form','sg-pin-form');form.hidden=true;
    const url=element('input','');url.type='url';url.required=true;url.placeholder='Ссылка на плейлист';url.setAttribute('aria-label','Ссылка на плейлист');
    const name=element('input','');name.required=true;name.maxLength=180;name.placeholder='Название плейлиста';name.setAttribute('aria-label','Название плейлиста');
    const error=element('div','sg-pin-error');error.setAttribute('role','alert');
    const save=button('Закрепить плейлист',null,()=>{},'sg-card-link');save.textContent='Закрепить';save.type='submit';
    form.append(url,name,save,error);form.addEventListener('submit',event=>{
      event.preventDefault();error.textContent='';
      let u;try{u=new URL(url.value.trim());}catch{error.textContent='Вставь полную ссылку на плейлист.';return;}
      if(!/^https?:$/.test(u.protocol)||!/(^|\.)music\.yandex\.(ru|com|kz|by|uz)$/.test(u.hostname)||!/^\/(?:playlists?\/[^/]+|users\/[^/]+\/playlists\/[^/]+)\/?$/.test(u.pathname)){
        error.textContent='Нужна ссылка на плейлист Яндекс Музыки.';return;
      }
      const entry={href:location.origin+u.pathname.replace(/\/$/,''),label:name.value.trim(),kind:'playlist',cover:''};
      if(!entry.label){error.textContent='Укажи название плейлиста.';return;}
      if(pins.has(entry.href)){error.textContent='Этот плейлист уже закреплён.';return;}
      togglePin(entry);
      if(pins.has(entry.href)){form.reset();form.hidden=true;add.setAttribute('aria-expanded','false');}
    });section.append(add,form);
  }

  function syncPinButton() {
    if(!pinCurrent)return; const entry=currentPlaylist();pinCurrent.hidden=!entry;
    pinCurrent.textContent=entry&&pins.has(entry.href)?'Открепить этот плейлист':'Закрепить этот плейлист';
  }
  const own = node => node?.nodeType===1 && (node.id?.startsWith('spotglass-') || node.closest?.('[data-sg-owned]'));
  const component = name => `[class^="${name}__"],[class*=" ${name}__"]`;
  const icons = {
    play:'m8 4 12 8-12 8Z',pause:'M8 5v14M16 5v14',previous:'M5 4v16M19 5 7 12l12 7Z',next:'M19 4v16M5 5l12 7-12 7Z',
    home:'M3 10 12 3l9 7v11h-6v-7H9v7H3Z',
    search:'M21 21l-5-5M18 10A8 8 0 1 1 2 10a8 8 0 0 1 16 0Z',
    library:'M4 3v18M9 3v18M14 3l6 18',
    back:'m15 5-7 7 7 7',forward:'m9 5 7 7-7 7',
    close:'m6 6 12 12M18 6 6 18',more:'M5 12h.01M12 12h.01M19 12h.01',
    pin:'M9 3h6l-1 6 4 4v2h-5v6h-2v-6H6v-2l4-4Z',
    panel:'M3 3h18v18H3ZM14 3v18',heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'
  };
  function icon(name) {
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');
    svg.setAttribute('fill','none');svg.setAttribute('stroke','currentColor');svg.setAttribute('stroke-width','1.8');
    svg.setAttribute('stroke-linecap','round');svg.setAttribute('stroke-linejoin','round');
    const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',icons[name]||icons.library);svg.append(path);return svg;
  }
  function button(label, glyph, action, className='sg-icon-button') {
    const b=element('button',className);b.type='button';b.title=label;b.setAttribute('aria-label',label);
    if(glyph)b.append(icon(glyph));b.addEventListener('click',action);return b;
  }
  function safeHref(a) {
    try {const raw=a.getAttribute('href');if(!raw||raw.startsWith('#'))return '';
      const url=new URL(raw,location.href);return url.origin===location.origin&&url.protocol===location.protocol?url.href:'';
    }catch{return '';}
  }
  function nativeRouter() {
    // Next exposes its client router in the desktop app. Never reload its URL:
    // the embedded host cannot serve arbitrary document routes.
    try {const router=window.next?.router;return typeof router?.push==='function'?router:null;}catch{return null;}
  }
  function follow(entry) {
    const href=entry?.href || (entry && safeHref(entry));if(!href)return;
    let url;try {url=new URL(href,location.href);}catch{return;}
    if(url.origin!==location.origin||url.protocol!==location.protocol)return;
    if(url.href===location.href)return;
    const failed=()=>bridge?.showToast?.('Не удалось открыть плейлист внутри приложения. Открой его через поиск Яндекс Музыки.');
    let a=entry?.node || entry;
    if(!a?.isConnected)a=Array.from(document.querySelectorAll('a[href]')).find(x=>!own(x)&&safeHref(x)===url.href);
    if(a?.isConnected&&typeof a.click==='function')a.click();
    else {
      const router=nativeRouter();
      if(!router){failed();return;}
      try {Promise.resolve(router.push(url.pathname+url.search+url.hash,{scroll:true})).catch(failed);}
      catch {failed();return;}
    }
    root.setAttribute('data-sg-native','false');scheduleChrome();
  }
  function libraryEntry(a) {
    const href=safeHref(a);if(!href)return null;
    const path=new URL(href).pathname;
    let kind=/\/artist\//.test(path)?'artist':/\/album\//.test(path)?'album':/\/playlists?\//.test(path)?'playlist':null;
    const label=(a.getAttribute('aria-label')||a.textContent||a.title||'').trim().replace(/\s+/g,' ');
    if(/Мне нравится|Liked Songs/i.test(label))kind='liked';
    if(!kind||!label||label.length>180)return null;
    const box=a.closest(['AlbumCard_root','PlaylistCard_root','ArtistCard_root','HorizontalCardContainer_root'].map(component).join(','))||a.closest('article')||a.parentElement;
    const image=box?.querySelector('img');
    let cover='';try {const u=new URL(image?.currentSrc||image?.src||'',location.href);if(['https:','http:','blob:'].includes(u.protocol)&&image)cover=coverUrl(u.href,200)||u.href;}catch{}
    return {href,label,kind,cover,node:a};
  }
  function loadLibrary() {} // Visible collection links are collected by refreshChrome.
  function renderLibrary() {
    if(!libraryList)return;
    const query=(librarySearch.value||'').toLocaleLowerCase();
    const entries=Array.from(library.values()).sort((a,b)=>Number(pins.has(b.href))-Number(pins.has(a.href))).filter(x=>(selectedFilter==='all'||x.kind===selectedFilter||(selectedFilter==='playlist'&&x.kind==='liked'))&&x.label.toLocaleLowerCase().includes(query));
    const key=JSON.stringify([!!collectionLink,entries.map(({href,label,kind,cover})=>[href,label,kind,cover,pins.has(href)])]);
    if(key===libraryKey)return;libraryKey=key;libraryList.replaceChildren();
    for(const entry of entries){
      const item=button(entry.label,null,()=>follow(entry),'sg-library-item');
      const tile=element('span','sg-library-cover '+(entry.kind==='liked'?'sg-liked':''));
      if(entry.cover){const image=element('img','');image.src=entry.cover;image.alt='';image.loading='lazy';tile.append(image);}else tile.append(icon(entry.kind==='liked'?'heart':'library'));
      const text=element('span','sg-library-meta');text.append(element('span','sg-library-name',entry.label),element('span','sg-library-kind',({playlist:'Плейлист',liked:'Любимые треки',album:'Альбом',artist:'Исполнитель'})[entry.kind]));
      item.append(tile,text);
      const row=element('div','sg-library-row');row.append(item);
      if(entry.kind==='playlist') {const pinned=pins.has(entry.href);const pin=button(pinned?'Открепить '+entry.label:'Закрепить '+entry.label,'pin',()=>togglePin(entry),'sg-pin-button');pin.setAttribute('aria-pressed',String(pinned));row.append(pin);}
      libraryList.append(row);
    }
    if(!entries.length){const empty=element('div','sg-library-empty',query?'Ничего не найдено':'Здесь появятся закреплённые плейлисты и музыка из открытой коллекции.');
      if(collectionLink){const open=button('Открыть коллекцию',null,()=>follow(collectionLink),'sg-open-library');open.textContent='Открыть коллекцию';empty.append(open);}libraryList.append(empty);}
  }
  function scheduleChrome() {if(!dead&&!refreshTimer)refreshTimer=requestAnimationFrame(()=>{refreshTimer=null;if(!dead&&options.enabled)refreshChrome();});}
  // Route transitions can replace both observed roots. Reattach before the next paint,
  // rather than waiting for the periodic API watchdog to notice disconnected chrome.
  const layoutObserver=new MutationObserver(()=>{
    if(!dead&&options.enabled&&!document.hidden&&(!sidebar?.isConnected||!toolbar?.isConnected))scheduleChrome();
  });
  if(document.body)layoutObserver.observe(document.body,{childList:true,subtree:true});
  function observeNative(target, kind) {
    if(!target)return;
    const obs=new MutationObserver(records=>{
      if(records.some(r=>!own(r.target)&&[...r.addedNodes,...r.removedNodes].some(n=>n.nodeType===1&&!own(n))))scheduleChrome();
    });obs.observe(target,{childList:true,subtree:true});
    if(kind==='nav'){navObserver?.disconnect();navObserver=obs;}else{contentObserver?.disconnect();contentObserver=obs;}
  }
  function toggleNative() {
    root.setAttribute('data-sg-native',root.getAttribute('data-sg-native')==='true'?'false':'true');
  }
  function mountChrome() {
    const nav=document.querySelector(component('Navbar_root'));
    const content=document.querySelector(component('CommonLayout_content'));
    if(nav&&nav!==nativeNav){nativeNav=nav;observeNative(nav,'nav');}
    if(content&&content!==nativeContent){nativeContent=content;observeNative(content,'content');}
    if(nativeNav&&!sidebar?.isConnected){
      sidebar=element('div','');sidebar.id='spotglass-sidebar';sidebar.setAttribute('data-sg-owned','');
      const top=element('div','sg-nav-top');
      const home=button('Главная','home',()=>follow(homeLink),'sg-nav-link');home.append(element('span','','Главная'));home.dataset.sgNav='home';
      const search=button('Поиск','search',()=>follow(searchLink),'sg-nav-link');search.append(element('span','','Поиск'));search.dataset.sgNav='search';top.append(home,search);
      const section=element('section','sg-library');const head=element('div','sg-library-heading');
      const open=button('Моя медиатека','library',()=>follow(collectionLink),'sg-library-title');open.append(element('span','','Моя медиатека'));
      const menu=button('Оригинальное меню Яндекс Музыки','more',()=>{toggleNative();});
      head.append(open,menu);section.append(head);
      pinCurrent=button('Закрепить этот плейлист',null,()=>{const entry=currentPlaylist();if(entry)togglePin(entry);},'sg-pin-current');pinCurrent.hidden=true;section.append(pinCurrent);mountPinForm(section);
      const filters=element('div','sg-filters');
      for(const [label,value] of [['Все','all'],['Плейлисты','playlist'],['Альбомы','album'],['Исполнители','artist']]){
        const b=button(label,null,()=>{selectedFilter=value;for(const x of filters.children)x.setAttribute('aria-pressed',String(x===b));libraryKey='';renderLibrary();},'sg-filter');b.textContent=label;b.setAttribute('aria-pressed',String(value==='all'));filters.append(b);
      }
      librarySearch=element('input','sg-library-search');librarySearch.type='search';librarySearch.placeholder='Поиск в медиатеке';librarySearch.setAttribute('aria-label','Поиск в боковой библиотеке');librarySearch.addEventListener('input',()=>renderLibrary());
      libraryList=element('div','sg-library-list');libraryKey='';section.append(filters,librarySearch,libraryList);sidebar.append(top,section);nativeNav.prepend(sidebar);root.setAttribute('data-sg-chrome','true');
    }
    if(nativeContent&&!toolbar?.isConnected){
      toolbar=element('div','');toolbar.id='spotglass-toolbar';toolbar.setAttribute('data-sg-owned','');
      const left=element('div','sg-toolbar-group');left.append(button('Назад','back',()=>history.back()),button('Вперёд','forward',()=>history.forward()));
      const right=element('div','sg-toolbar-group');right.append(button('Поиск','search',()=>follow(searchLink)),button('Показать или скрыть текущий трек','panel',()=>{panelDismissed=!panelDismissed;apply();}),button('Оригинальное меню','more',()=>toggleNative()));
      const searchForm=element('form','sg-global-search');searchForm.setAttribute('role','search');
      const searchInput=element('input','');searchInput.type='search';searchInput.placeholder='Что хочешь включить?';searchInput.setAttribute('aria-label','Поиск музыки');searchInput.maxLength=300;
      const submit=button('Найти музыку','search',()=>{});submit.type='submit';
      searchForm.append(submit,searchInput);searchInput.addEventListener('input',()=>{if(searchLink&&location.pathname===new URL(safeHref(searchLink)).pathname)submitSearch(searchInput.value,safeHref(searchLink));});
      searchForm.addEventListener('submit',event=>{event.preventDefault();const query=searchInput.value.trim();if(!query){if(searchLink)follow(searchLink);return;}
        const href=searchLink&&safeHref(searchLink);if(!href)return;
        submitSearch(query,href);
      });
      toolbar.append(left,searchForm,right);nativeContent.prepend(toolbar);
    }
  }
  function refreshChrome() {
    updateScale();
    mountChrome();toolbarTint.sync(nativeContent,toolbar);if(!nativeNav)return;
    const nativeLinks=Array.from(nativeNav.querySelectorAll('a[href]')).filter(a=>!own(a)&&safeHref(a));
    waveLink=nativeLinks.find(a=>/^(Главная|Home|Моя волна)$/i.test((a.textContent||a.getAttribute('aria-label')||'').trim()))||nativeLinks.find(a=>{try{return new URL(safeHref(a)).pathname==='/';}catch{return false;}});
    homeLink=nativeLinks.find(a=>/Для вас|For you|Тренды/i.test(a.textContent||a.getAttribute('aria-label')||''))||waveLink;
    if(!initialHomeDone&&homeLink&&waveLink){initialHomeDone=true;if(location.pathname===new URL(safeHref(waveLink)).pathname&&homeLink!==waveLink){follow(homeLink);return;}}
    searchLink=nativeLinks.find(a=>/\/search(?:\/|\?|$)/.test(a.getAttribute('href')||''));
    collectionLink=nativeLinks.find(a=>/\/collection(?:\/|\?|$)/.test(a.getAttribute('href')||''));
    for(const a of nativeLinks){const entry=libraryEntry(a);if(entry)library.set(entry.href,entry);}
    // Only capture library items from the collection page, not recommendations.
    if(/\/collection(?:\/|$)/.test(location.pathname)&&nativeContent){for(const a of Array.from(nativeContent.querySelectorAll('a[href]')).slice(0,300)){if(own(a))continue;const entry=libraryEntry(a);if(entry)library.set(entry.href,entry);}}
    while(library.size>5000)library.delete(library.keys().next().value);
    for(const [name,link] of [['home',homeLink],['search',searchLink]]){const b=sidebar.querySelector(`[data-sg-nav="${name}"]`);if(b){b.disabled=!link;b.setAttribute('aria-current',link&&new URL(safeHref(link)).pathname===location.pathname?'page':'false');}}
    loadLibrary();const libraryButton=sidebar.querySelector('.sg-library-title');if(libraryButton)libraryButton.disabled=!collectionLink;
    const searchInput=toolbar?.querySelector('.sg-global-search input');if(searchInput)searchInput.disabled=!searchLink;
    syncSearch();syncPinButton();renderLibrary();renderShortcuts();alignPanel();
  }
  function renderShortcuts() {
    const landing=nativeContent?.querySelector(component('LandingPage_root'));
    const heading=nativeContent?.querySelector(component('LandingPage_title'));
    const isForYou=/Для вас|Тренды|For you/i.test(heading?.textContent||'');
    const homeHref=homeLink&&safeHref(homeLink);
    const onHome=isForYou||!!(homeHref&&new URL(homeHref).pathname===location.pathname);
    const main=landing||nativeContent?.querySelector(component('MainPage_content'))||nativeContent?.querySelector(component('Content_main'))||nativeContent?.querySelector('main')||nativeContent;
    if(!main)return;
    root.setAttribute('data-sg-wave-card','false');
    if(!onHome){shortcuts?.remove();shortcuts=null;shortcutsKey='';return;}
    if(!shortcuts?.isConnected){shortcuts=element('section','');shortcuts.id='spotglass-shortcuts';shortcuts.setAttribute('data-sg-owned','');
      if(main===nativeContent&&toolbar?.parentNode===main)toolbar.after(shortcuts);else main.prepend(shortcuts);
      shortcutsKey='';}
    const useWave=options.waveTile;
    const key=String(useWave);if(key===shortcutsKey)return;
    shortcutsKey=key;shortcuts.replaceChildren();
    if(useWave){
      const b=button('Включить Мою волну',null,async()=>{
        if(b.disabled)return;b.disabled=true;
        try {
          const api=bridge;
          if(typeof api?.playVibe==='function')await api.playVibe({screen:'landing'});
          else {const native=findWave();if(native&&!native.disabled)native.click();else throw new Error('Vibe unavailable');}
        } catch {bridge?.showToast?.('Не удалось запустить Мою волну. Проверь обновление PulseSync.');}
        finally {b.disabled=false;}
      },'sg-wave-launch');
      b.append(icon('play'),element('span','','Моя волна'));shortcuts.append(b);
    }
  }

  function nativeSearchInput() {
    const box=document.querySelector(component('SearchPage_input'));
    return box?.matches('input')?box:box?.querySelector('input');
  }
  function syncSearch() {
    const input=nativeSearchInput();const ready=!!input&&!!searchLink&&location.pathname===new URL(safeHref(searchLink)).pathname;
    root.setAttribute('data-sg-search-ready',String(ready));
    const field=toolbar?.querySelector('.sg-global-search input');
    if(ready&&field&&document.activeElement!==field&&input.value)field.value=input.value;
    if(ready&&document.activeElement===input)field?.focus();
  }
  function submitSearch(query,href) {
    clearTimeout(searchTimer);
    if(location.pathname!==new URL(href).pathname)follow(searchLink);
    let tries=0;
    const transfer=()=>{
      if(dead||!options.enabled)return;
      const input=nativeSearchInput();
      if(input&&!input.disabled){
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,query);
        input.dispatchEvent(new Event('input',{bubbles:true}));
        input.dispatchEvent(new Event('change',{bubbles:true}));
        root.setAttribute('data-sg-search-ready','true');toolbar?.querySelector('.sg-global-search input')?.focus();
        return;
      }
      if(++tries<12)searchTimer=setTimeout(transfer,150);
      else {root.setAttribute('data-sg-search-ready','false');const field=toolbar?.querySelector('.sg-global-search input');if(field)field.title='Штатный поиск ещё загружается. Нажмите Enter повторно.';}
    };
    transfer();
  }
  function findWave() {
    const widget=nativeContent?.querySelector(component('MainPage_vibeWidgetContainer'));
    if(!widget)return null;
    return widget.querySelector(['VibePlayerControls_playButton','VibePlayerBar_playButton','VibeBlock_playButton'].map(component).join(','));
  }
  function alignPanel() {
    if(!panel||!nativeContent?.isConnected)return;
    const r=nativeContent.getBoundingClientRect();
    if(nativeNav&&sidebar){const n=nativeNav.getBoundingClientRect();const offset=Math.max(0,r.top-n.top);sidebar.style.paddingTop=offset+'px';sidebar.style.boxSizing='border-box';}
    if(r.height>0){panel.style.top=Math.max(8,r.top)+'px';panel.style.bottom=Math.max(8,innerHeight-r.bottom)+'px';}
  }
  window.addEventListener('resize',scheduleChrome);
  document.addEventListener('visibilitychange',resumeLyrics);
  window.addEventListener('resize',resumeLyrics);
  function teardownChrome() {
    toolbarTint.destroy();
    window.removeEventListener('resize',scheduleChrome);document.removeEventListener('visibilitychange',resumeLyrics);window.removeEventListener('resize',resumeLyrics);clearTimeout(searchTimer);cancelAnimationFrame(refreshTimer);layoutObserver.disconnect();navObserver?.disconnect();contentObserver?.disconnect();sidebar?.remove();toolbar?.remove();shortcuts?.remove();
    window.removeEventListener('popstate',scheduleChrome);document.removeEventListener('click',onNativeClick,true);
  }
  function onNativeClick(event){if(event.target?.closest?.('a[href]')&&!own(event.target))scheduleChrome();}
  window.addEventListener('popstate',scheduleChrome);document.addEventListener('click',onNativeClick,true);


  window.addEventListener('pagehide',destroy,{once:true});
  if(sourceScript?.parentNode){observer=new MutationObserver(()=>{if(!sourceScript.isConnected)destroy();});observer.observe(sourceScript.parentNode,{childList:true});}
  apply();tick();
  return destroy;
}
