import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolbarTint } from '../src/toolbar-tint.js';
let observer, pending;
globalThis.MutationObserver = class { constructor(fn) { this.fn=fn; observer=this; } observe() {} disconnect() {} };
globalThis.requestAnimationFrame = fn => { pending=fn; return 1; };
globalThis.cancelAnimationFrame = () => { pending=null; };
globalThis.CSS = { supports: (_, color) => /^#[a-f\d]{6}$/i.test(color) };
globalThis.getComputedStyle = node => ({getPropertyValue: () => node.color, display:'block', visibility:'visible', opacity:'1', backgroundImage:'linear-gradient(...)'});
function fixture(color) {
 const props=new Map(), attrs=new Map();
 const toolbar={isConnected:true,style:{getPropertyValue:k=>props.get(k)||'',setProperty:(k,v)=>props.set(k,v),removeProperty:k=>props.delete(k)},hasAttribute:k=>attrs.has(k),setAttribute:(k,v)=>attrs.set(k,v),removeAttribute:k=>attrs.delete(k)};
 const source={isConnected:true,className:'PlaylistPage_averageColorBackground__test',color,addEventListener(){},removeEventListener(){}};
 return {toolbar,source,props,attrs,content:{querySelector:()=>source}};
}
test('native color follows playlist changes, late updates, neutral pages, and teardown',()=>{
 const tint=createToolbarTint(), a=fixture('#204f30');
 tint.sync(a.content,a.toolbar); assert.equal(a.props.get('--sg-page-tint'),'#204f30');
 a.source.color='#542033'; observer.fn(); pending(); assert.equal(a.props.get('--sg-page-tint'),'#542033');
 a.source.color=''; observer.fn(); pending(); assert.equal(a.attrs.has('data-sg-tinted'),false);
 a.source.color='#204f30'; tint.sync(a.content,a.toolbar);
 tint.sync({querySelector:()=>null},a.toolbar); assert.equal(a.props.size,0);
 tint.sync(a.content,a.toolbar); tint.destroy(); assert.equal(a.props.size,0); assert.equal(a.attrs.size,0);
});
