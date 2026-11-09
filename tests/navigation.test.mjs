import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/interface.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('  function nativeRouter()'),source.indexOf('  function libraryEntry'));
function run(router,href,node) {
 const calls=[];
 const context={window:{next:router?{router}:undefined},location:{href:'https://music.yandex.ru/',origin:'https://music.yandex.ru',protocol:'https:',assign(){throw Error('Document reload forbidden');}},URL,Promise,document:{querySelectorAll:()=>[]},root:{setAttribute(){}},scheduleChrome(){},bridge:{showToast:m=>calls.push(m)},own:()=>false,safeHref:()=>'',entry:{href,node}};
 vm.runInNewContext(code+';follow(entry)',context);return calls;
}
test('saved playlist uses the client router without document navigation',()=>{
 let target;run({push:(...args)=>{target=args;}},'https://music.yandex.ru/playlists/123');assert.equal(target[0],'/playlists/123');
});
test('missing or throwing router reports failure without reloading',()=>{
 assert.equal(run(null,'https://music.yandex.ru/playlists/123').length,1);
 assert.equal(run({push(){throw Error('unavailable');}},'https://music.yandex.ru/playlists/123').length,1);
});
test('native links are preferred and external URLs are rejected',()=>{
 let clicked=0,pushed=0;const router={push(){pushed++;}};
 run(router,'https://music.yandex.ru/playlists/123',{isConnected:true,click(){clicked++;}});
 run(router,'https://example.org/playlists/123');assert.equal(clicked,1);assert.equal(pushed,0);
});
