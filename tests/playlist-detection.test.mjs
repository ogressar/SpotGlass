import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/interface.js',import.meta.url),'utf8');
const fn=source.slice(source.indexOf('  function currentPlaylist()'),source.indexOf('  function mountPinForm('));
function detect(path,content){return vm.runInNewContext(fn+';currentPlaylist()',{
 location:{pathname:path,origin:'https://music.yandex.ru'},nativeContent:content,component:name=>name
});}
test('title outside the playlist controls is detected in the outer header',()=>{
 const header={querySelector:s=>s==='PageHeaderTitle_title'?{textContent:'Плейлист дня'}:null};
 const controls={querySelector:()=>null};
 const page={querySelector:s=>s==='PlaylistPageHeader_header'?header:s==='PageHeaderPlaylist_root'?controls:null};
 assert.equal(detect('/playlists/123',page).label,'Плейлист дня');
});
test('unknown header classes can use the page h1; non-playlist pages are ignored',()=>{
 const page={querySelector:s=>s==='h1'?{textContent:'Любимое'}:null};
 assert.equal(detect('/users/test/playlists/42',page).label,'Любимое');
 assert.equal(detect('/search',page),null);
 assert.equal(detect('/playlists/123',{querySelector:()=>null}),null);
});
