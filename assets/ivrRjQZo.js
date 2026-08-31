import{Z as c,u as D,v as I}from"./BPcgMyep.js";import{S as d,p as z,ab as v,c as B,ae as E,H as $,O as j,h as N,F as S,e as g,D as x,V as A,l as k,ag as T,C as F}from"./DkO90a2v.js";/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=[["path",{d:"M12 15V3",key:"m9g1x1"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["path",{d:"m7 10 5 5 5-5",key:"brsn70"}]],P=c("download",H);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const O=[["path",{d:"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21",key:"g5wo59"}],["path",{d:"m5.082 11.09 8.828 8.828",key:"1wx5vj"}]],X=c("eraser",O);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],Y=c("search",U);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],Z=c("trash-2",W),n=d(null),q=z({name:"ContextMenu",inheritAttrs:!1,__name:"ContextMenu",props:{items:{},title:{default:""},disabled:{type:Boolean,default:!1},size:{default:"md"}},setup(a,{expose:b}){const o=d(!1),u=d(0),r=d(0),f=v("popoverRef"),m=v("itemsRef"),p=v("triggerWrapperRef"),w=B(()=>({getBoundingClientRect(){return{x:u.value,y:r.value,top:r.value,left:u.value,bottom:r.value,right:u.value,width:0,height:0}}})),h=()=>{n.value===l&&(n.value=null)},l=()=>{f.value?.close(),h()},y=async(e,s,i)=>{a.disabled||!a.items?.length||(n.value&&n.value!==l&&n.value(),n.value=l,u.value=e,r.value=s,o.value=!0,await F(),f.value?.update(),m.value?.focusFirstItem())},M=e=>{a.disabled||(e.preventDefault(),e.stopPropagation(),y(e.clientX,e.clientY,p.value))},R=e=>{e.action?.(),l()},C=e=>{const s=m.value?.itemEls||[],i=s.findIndex(t=>t===document.activeElement);if(e.key==="ArrowDown"){e.preventDefault();let t=i+1;for(;t<a.items.length&&a.items[t]?.disabled;)t++;t>=a.items.length&&(t=a.items.findIndex(V=>!V.disabled)),t!==-1&&s[t]?.focus()}else if(e.key==="ArrowUp"){e.preventDefault();let t=i-1;for(;t>=0&&a.items[t]?.disabled;)t--;if(t<0)for(t=a.items.length-1;t>=0&&a.items[t]?.disabled;)t--;t!==-1&&s[t]?.focus()}else e.key==="Tab"&&(e.preventDefault(),l())};return E(o,e=>{!e&&n.value===l&&(n.value=null)}),$(()=>{n.value===l&&(n.value=null)}),b({openMenuAt:y,closeMenu:l}),(e,s)=>(j(),N(S,null,[g("div",{ref_key:"triggerWrapperRef",ref:p,class:x(["context-menu-trigger-wrapper contents",{"cursor-default":e.disabled}]),onContextmenu:M},[A(e.$slots,"default",{isOpen:o.value})],34),k(D,{ref_key:"popoverRef",ref:f,modelValue:o.value,"onUpdate:modelValue":s[0]||(s[0]=i=>o.value=i),"virtual-ref":w.value,placement:"bottom-start","offset-distance":6,disabled:e.disabled,"aria-label":"右键上下文菜单","panel-class":"context-menu-box",onClose:h},{default:T(()=>[g("div",{ref:"menuBoxRef",role:"menu",tabindex:"-1",class:x(["context-menu-inner flex flex-col gap-xs outline-none",`context-menu-size-${e.size}`]),onKeydown:C},[k(I,{ref_key:"itemsRef",ref:m,items:e.items,title:e.title,size:e.size,onSelect:R},null,8,["items","title","size"])],34)]),_:1},8,["modelValue","virtual-ref","disabled"])],64))}});export{P as D,X as E,Y as S,Z as T,q as _};
