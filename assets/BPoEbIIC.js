import{Y as r,g as V,m as D,t as I}from"./CTdeYSYb.js";import{R as p,p as N,ab as f,c as j,ae as B,N as E,h as T,F as A,e as y,D as g,U as H,l as k,ag as $,C as F}from"./BS6eCQEA.js";/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const S=[["path",{d:"M12 15V3",key:"m9g1x1"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["path",{d:"m7 10 5 5 5-5",key:"brsn70"}]],X=r("download",S);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=[["path",{d:"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21",key:"g5wo59"}],["path",{d:"m5.082 11.09 8.828 8.828",key:"1wx5vj"}]],q=r("eraser",O);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=[["path",{d:"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z",key:"1oefj6"}],["path",{d:"M14 2v5a1 1 0 0 0 1 1h5",key:"wfsgrz"}],["path",{d:"M10 9H8",key:"b1mrlr"}],["path",{d:"M16 13H8",key:"t4e002"}],["path",{d:"M16 17H8",key:"z1uh3a"}]],G=r("file-text",U);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],J=r("search",W);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],Q=r("trash-2",K),n=p(null),L=N({name:"ContextMenu",inheritAttrs:!1,__name:"ContextMenu",props:{items:{},title:{default:""},disabled:{type:Boolean,default:!1},size:{default:"md"}},setup(x,{expose:b}){const a=x,o=p(!1),d=p(0),u=p(0),c=f("popoverRef"),m=f("itemsRef"),M=f("triggerWrapperRef"),w=j(()=>({getBoundingClientRect(){return{x:d.value,y:u.value,top:u.value,left:d.value,bottom:u.value,right:d.value,width:0,height:0}}})),l=()=>{c.value?.close(),n.value===l&&(n.value=null)},v=async(e,s,i)=>{a.disabled||!a.items?.length||(n.value&&n.value!==l&&n.value(),d.value=e,u.value=s,n.value=l,o.value?(await F(),c.value?.update()):c.value?.open(i))},_=e=>{a.disabled||!a.items||a.items.length===0||(e.preventDefault(),e.stopPropagation(),v(e.clientX,e.clientY,e.currentTarget))},R=e=>{e.action(),l()},C=e=>{const s=m.value?.itemEls;if(!o.value||!s)return;const i=document.activeElement,h=s.indexOf(i);if(e.key==="ArrowDown"){e.preventDefault();let t=h+1;for(;t<a.items.length&&a.items[t]?.disabled;)t++;t>=a.items.length&&(t=a.items.findIndex(z=>!z.disabled)),t!==-1&&s[t]?.focus()}else if(e.key==="ArrowUp"){e.preventDefault();let t=h-1;for(;t>=0&&a.items[t]?.disabled;)t--;if(t<0)for(t=a.items.length-1;t>=0&&a.items[t]?.disabled;)t--;t!==-1&&s[t]?.focus()}else e.key==="Tab"&&(e.preventDefault(),l())};return B(o,e=>{!e&&n.value===l&&(n.value=null)}),b({openMenuAt:v,closeMenu:l}),(e,s)=>(E(),T(A,null,[y("div",{ref_key:"triggerWrapperRef",ref:M,class:g(["context-menu-trigger-wrapper",{"is-disabled":e.disabled}]),onContextmenu:_},[H(e.$slots,"default",{isOpen:o.value},void 0,!0)],34),k(V,{ref_key:"popoverRef",ref:c,modelValue:o.value,"onUpdate:modelValue":s[0]||(s[0]=i=>o.value=i),"virtual-ref":w.value,placement:"bottom-start","offset-distance":6,disabled:e.disabled,"aria-label":"右键上下文菜单","panel-class":"context-menu-box"},{default:$(()=>[y("div",{ref:"menuBoxRef",role:"menu",tabindex:"-1",class:g(["context-menu-inner",`size-${e.size}`]),onKeydown:C},[k(D,{ref_key:"itemsRef",ref:m,items:e.items,title:e.title,size:e.size,onSelect:R},null,8,["items","title","size"])],34)]),_:1},8,["modelValue","virtual-ref","disabled"])],64))}}),Z=I(L,[["__scopeId","data-v-9dd887bf"]]);export{Z as C,X as D,q as E,G as F,J as S,Q as T};
