import{Y as c,t as I,u as V}from"./CEXRypVf.js";import{R as d,p as z,aa as v,c as D,ad as E,G as N,N as $,h as j,F as A,e as x,C as g,U as S,l as k,af as T,B as F}from"./DtpZ49hL.js";/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const U=[["path",{d:"M12 15V3",key:"m9g1x1"}],["path",{d:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4",key:"ih7n3h"}],["path",{d:"m7 10 5 5 5-5",key:"brsn70"}]],P=c("download",U);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const H=[["path",{d:"M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21",key:"g5wo59"}],["path",{d:"m5.082 11.09 8.828 8.828",key:"1wx5vj"}]],Y=c("eraser",H);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const W=[["path",{d:"m21 21-4.34-4.34",key:"14j7rj"}],["circle",{cx:"11",cy:"11",r:"8",key:"4ej97u"}]],G=c("search",W);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const K=[["path",{d:"M10 11v6",key:"nco0om"}],["path",{d:"M14 11v6",key:"outv1u"}],["path",{d:"M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",key:"miytrc"}],["path",{d:"M3 6h18",key:"d0wm0j"}],["path",{d:"M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",key:"e791ji"}]],X=c("trash-2",K),n=d(null),q=z({name:"ContextMenu",inheritAttrs:!1,__name:"ContextMenu",props:{items:{},title:{default:""},disabled:{type:Boolean,default:!1},size:{default:"md"}},setup(a,{expose:b}){const o=d(!1),u=d(0),r=d(0),f=v("popoverRef"),m=v("itemsRef"),p=v("triggerWrapperRef"),w=D(()=>({getBoundingClientRect(){return{x:u.value,y:r.value,top:r.value,left:u.value,bottom:r.value,right:u.value,width:0,height:0}}})),h=()=>{n.value===l&&(n.value=null)},l=()=>{f.value?.close(),h()},y=async(e,s,i)=>{a.disabled||!a.items?.length||(n.value&&n.value!==l&&n.value(),n.value=l,u.value=e,r.value=s,o.value=!0,await F(),f.value?.update(),m.value?.focusFirstItem())},M=e=>{a.disabled||(e.preventDefault(),e.stopPropagation(),y(e.clientX,e.clientY,p.value))},R=e=>{e.action?.(),l()},C=e=>{const s=m.value?.itemEls||[],i=s.findIndex(t=>t===document.activeElement);if(e.key==="ArrowDown"){e.preventDefault();let t=i+1;for(;t<a.items.length&&a.items[t]?.disabled;)t++;t>=a.items.length&&(t=a.items.findIndex(B=>!B.disabled)),t!==-1&&s[t]?.focus()}else if(e.key==="ArrowUp"){e.preventDefault();let t=i-1;for(;t>=0&&a.items[t]?.disabled;)t--;if(t<0)for(t=a.items.length-1;t>=0&&a.items[t]?.disabled;)t--;t!==-1&&s[t]?.focus()}else e.key==="Tab"&&(e.preventDefault(),l())};return E(o,e=>{!e&&n.value===l&&(n.value=null)}),N(()=>{n.value===l&&(n.value=null)}),b({openMenuAt:y,closeMenu:l}),(e,s)=>($(),j(A,null,[x("div",{ref_key:"triggerWrapperRef",ref:p,class:g(["context-menu-trigger-wrapper contents",{"cursor-default":e.disabled}]),onContextmenu:M},[S(e.$slots,"default",{isOpen:o.value})],34),k(I,{ref_key:"popoverRef",ref:f,modelValue:o.value,"onUpdate:modelValue":s[0]||(s[0]=i=>o.value=i),"virtual-ref":w.value,placement:"bottom-start","offset-distance":6,disabled:e.disabled,"aria-label":"右键上下文菜单","panel-class":"context-menu-box",onClose:h},{default:T(()=>[x("div",{ref:"menuBoxRef",role:"menu",tabindex:"-1",class:g(["context-menu-inner flex flex-col gap-xs outline-none",`context-menu-size-${e.size}`]),onKeydown:C},[k(V,{ref_key:"itemsRef",ref:m,items:e.items,title:e.title,size:e.size,onSelect:R},null,8,["items","title","size"])],34)]),_:1},8,["modelValue","virtual-ref","disabled"])],64))}});export{P as D,Y as E,G as S,X as T,q as _};
