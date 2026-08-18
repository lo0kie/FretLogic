import{w as c,A as l,n as g}from"./index-sU2_sQDz.js";import{p as V,c as i,h as z,E as v,l as s,ag as d,e as b,_,g as y,O as B,a3 as r}from"./vue-87cIXE7t.js";/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const C=[["path",{d:"m15 18-6-6 6-6",key:"1wnfg3"}]],k=c("chevron-left",C);/**
 * @license @lucide/vue v1.17.0 - ISC
 *
 * This source code is licensed under the ISC license.
 * See the LICENSE file in the root directory of this source tree.
 */const N=[["path",{d:"m9 18 6-6-6-6",key:"mthhwq"}]],w=c("chevron-right",N),$={class:"page-indicator"},M=V({__name:"BasePagination",props:{modelValue:{},total:{},size:{default:"md"},step:{default:1},disabled:{type:Boolean,default:!1},formatter:{}},emits:["update:modelValue","change","prev","next"],setup(u,{emit:m}){const e=u,t=m,o=i(()=>{switch(e.size){case"sm":return 14;case"lg":return 18;case"md":default:return 16}}),p=i(()=>{const a=e.modelValue+1;if(e.formatter)return e.formatter(a,e.total);const n=e.step>1&&a<e.total?"-"+Math.min(e.modelValue+e.step,e.total):"";return`第 ${a}${n} / ${e.total} 页`}),h=()=>{if(e.disabled||e.modelValue<=0)return;const a=Math.max(0,e.modelValue-e.step);t("update:modelValue",a),t("prev",a),t("change",a)},f=()=>{if(e.disabled||e.modelValue+e.step>=e.total)return;const a=Math.min(e.total-1,e.modelValue+e.step);t("update:modelValue",a),t("next",a),t("change",a)};return(a,n)=>a.total>0?(B(),z("div",{key:0,class:v(["base-pagination",[`size-${a.size}`]])},[s(l,{size:a.size,variant:"ghost","icon-only":"",disabled:a.disabled||a.modelValue<=0,onClick:h},{default:d(()=>[s(r(k),{size:o.value},null,8,["size"])]),_:1},8,["size","disabled"]),b("span",$,_(p.value),1),s(l,{size:a.size,"icon-only":"",variant:"ghost",disabled:a.disabled||a.modelValue+a.step>=a.total,onClick:f},{default:d(()=>[s(r(w),{size:o.value},null,8,["size"])]),_:1},8,["size","disabled"])],2)):y("",!0)}}),A=g(M,[["__scopeId","data-v-8ab144f3"]]);export{A as B};
