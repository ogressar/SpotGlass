import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import * as nodeModule from 'node:module';
const raw=readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8').replace(/^import .*$/gm,'').replace('export default defineAddon','globalThis.addon = defineAddon');

test('initial RPC failures do not prevent startup; subsequent events restore state',{skip:!nodeModule.stripTypeScriptTypes},async()=>{
 const code=nodeModule.stripTypeScriptTypes(raw);
 let bridge,playerChanged,queueChanged;const cleanups=[];
 const ctx={defineAddon:x=>x,config:{id:'test',name:'test'},settings:{},startInterface:b=>{bridge=b;return ()=>{};}};
 vm.runInNewContext(code,ctx);
 await ctx.addon.start({signal:{aborted:false},onCleanup:f=>cleanups.push(f),logger:{warn(){}},settings:{},
  player:{onChange:f=>{playerChanged=f;return ()=>{};},onQueueChange:f=>{queueChanged=f;return ()=>{};},getSnapshot:async()=>{throw Error('starting');}},
  client:{getQueueSnapshot:async()=>{throw Error('starting');},getUserLogin:async()=>'user'},
 });
 assert.ok(bridge);assert.equal(bridge.getCurrentTrack(),undefined);assert.equal(bridge.getQueueSnapshot().items.length,0);
 playerChanged({track:{id:'42'},isPlaying:true});queueChanged({items:[{id:'42'}],currentIndex:0});
 assert.equal(bridge.getCurrentTrack().id,'42');assert.equal(bridge.getQueueSnapshot().items.length,1);
 for(const fn of cleanups)fn();
});
