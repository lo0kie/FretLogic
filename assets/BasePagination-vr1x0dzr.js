import{G as c,L as z,w as l,E as V,a3 as g,J as s,A as i,aQ as d,x as v,al as b,z as y,aa as B,ao as r,m as C}from"./index-eTkfGYMT.js";/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const _=[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]],k=c("chevron-left",_);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],w=c("chevron-right",N),$={class:"page-indicator"},L=z({__name:"BasePagination",props:{modelValue:{},total:{},size:{default:"md"},step:{default:1},disabled:{type:Boolean,default:!1},formatter:{}},emits:["update:modelValue","change","prev","next"],setup(u,{emit:m}){const e=u,t=m,o=l(()=>{switch(e.size){case"sm":return 14;case"lg":return 18;case"md":default:return 16}}),p=l(()=>{const a=e.modelValue+1;if(e.formatter)return e.formatter(a,e.total);const n=e.step>1&&a<e.total?"-"+Math.min(e.modelValue+e.step,e.total):"";return`第 ${a}${n} / ${e.total} 页`}),h=()=>{if(e.disabled||e.modelValue<=0)return;const a=Math.max(0,e.modelValue-e.step);t("update:modelValue",a),t("prev",a),t("change",a)},f=()=>{if(e.disabled||e.modelValue+e.step>=e.total)return;const a=Math.min(e.total-1,e.modelValue+e.step);t("update:modelValue",a),t("next",a),t("change",a)};return(a,n)=>a.total>0?(B(),V("div",{key:0,class:g(["base-pagination",[`size-${a.size}`]])},[s(i,{size:a.size,variant:"ghost","icon-only":"",disabled:a.disabled||a.modelValue<=0,onClick:h},{default:d(()=>[s(r(k),{size:o.value},null,8,["size"])]),_:1},8,["size","disabled"]),v("span",$,b(p.value),1),s(i,{size:a.size,"icon-only":"",variant:"ghost",disabled:a.disabled||a.modelValue+a.step>=a.total,onClick:f},{default:d(()=>[s(r(w),{size:o.value},null,8,["size"])]),_:1},8,["size","disabled"])],2)):y("",!0)}}),P=C(L,[["__scopeId","data-v-8ab144f3"]]);export{P as B};
