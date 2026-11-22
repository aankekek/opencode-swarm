"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const t=require("solid-js/web"),F=require("@opencode/plugin/gui"),i=require("solid-js"),J=require("effect");function Q(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function X(e){return{"~standard":{version:1,vendor:"swarm-runtime",validate(c){const a=e(c);return a?{issues:[{message:a}]}:{value:c}}}}}function oe(e){return{"~standard":{version:1,vendor:"swarm-runtime",validate(c){const a=c===void 0?{}:c;if(!Q(a))return{issues:[{message:"input must be an object"}]};const h=e(a);return h?{issues:[{message:h}]}:{value:a}}}}}const ge={id:"local.swarm-runtime",methods:{getBoardInfo:{input:oe(()=>null),output:X(e=>Q(e)&&typeof e.url=="string"&&typeof e.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:oe(e=>e.sessionId!==void 0&&typeof e.sessionId!="string"?"sessionId must be a string":e.swarmId!==void 0&&typeof e.swarmId!="string"?"swarmId must be a string":null),output:X(e=>Q(e)&&Array.isArray(e.members)&&Array.isArray(e.board_posts)&&Array.isArray(e.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:oe(e=>e.limit!==void 0&&typeof e.limit!="number"?"limit must be a number":null),output:X(e=>Q(e)&&Array.isArray(e.swarms)?null:"output must contain swarms array")},completeSwarm:{input:oe(e=>typeof e.swarmId=="string"?null:"swarmId must be a string"),output:X(e=>Q(e)&&typeof e.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:oe(e=>typeof e.swarmId!="string"?"swarmId must be a string":typeof e.handle!="string"?"handle must be a string":null),output:X(e=>Q(e)&&typeof e.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:oe(e=>e.sessionId!==void 0&&typeof e.sessionId!="string"?"sessionId must be a string":e.swarmId!==void 0&&typeof e.swarmId!="string"?"swarmId must be a string":null),output:X(e=>Q(e)&&Q(e.roleModels)&&Array.isArray(e.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:oe(e=>typeof e.role!="string"?"role must be a string":typeof e.model!="string"?"model must be a string":e.swarmId!==void 0&&typeof e.swarmId!="string"?"swarmId must be a string":e.sessionId!==void 0&&typeof e.sessionId!="string"?"sessionId must be a string":null),output:X(e=>Q(e)&&typeof e.ok=="boolean"?null:"output must be SetRoleModelResult")}},events:{changed:{schema:X(e=>Q(e)&&typeof e.swarmId=="string"&&typeof e.reason=="string"?null:"event must contain swarmId and reason")}}},Se=`
.swarm-gui-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--background-base, #141413);
  color: var(--text-base, #b5b4b0);
  font-size: 12px;
}

.swarm-gui-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--surface-raised-base, #1d1d1c);
}

.swarm-gui-select {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--background-base, #141413);
  color: var(--text-strong, #ededec);
  font-size: 12px;
}

.swarm-gui-empty {
  padding: 16px 14px;
  font-size: 12px;
  color: var(--text-weak, #8a8984);
}

.swarm-gui-bottom-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 12px;
  font-size: 11px;
  border-top: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--surface-raised-base, #1d1d1c);
  color: var(--text-weak, #8a8984);
}

.swarm-gui-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  flex: 1;
}

.swarm-overlay-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 8px 4px 4px;
  color: var(--text-base, #b5b4b0);
  font-size: 13px;
}

.swarm-overlay-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface-raised-base, #1d1d1c);
  border: 1px solid var(--border-weak-base, #2f2f2d);
}

.swarm-overlay-status {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.swarm-overlay-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--surface-base-hover, #262625);
  color: var(--text-strong, #ededec);
  white-space: nowrap;
}

.swarm-overlay-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 2px;
}

.swarm-overlay-meta strong {
  color: var(--text-strong, #ededec);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swarm-overlay-meta span {
  color: var(--text-weak, #8a8984);
  font-size: 11px;
}

.swarm-overlay-error {
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--icon-critical-base, #e05252);
  background: rgba(224, 82, 82, 0.12);
}

.swarm-overlay-loading {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 16px 8px;
  color: var(--text-weak, #8a8984);
}

.swarm-overlay-roles {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.swarm-overlay-role-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 10px 12px;
  border-radius: 8px;
  background: var(--surface-raised-base, #1d1d1c);
  border: 1px solid var(--border-weak-base, #2f2f2d);
}

.swarm-overlay-role-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
  flex: 1;
}

.swarm-overlay-role-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.swarm-overlay-role-head strong {
  color: var(--text-strong, #ededec);
  font-size: 13px;
}

.swarm-overlay-role-count {
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-base-hover, #262625);
  color: var(--text-weak, #8a8984);
}

.swarm-overlay-role-sub {
  font-size: 11px;
  color: var(--text-weak, #8a8984);
}

.swarm-overlay-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.swarm-overlay-select-wrap {
  flex: 0 0 280px;
  max-width: 280px;
  min-width: 220px;
}

.swarm-model-select {
  position: relative;
  width: 100%;
}

.swarm-model-select-trigger {
  width: 100%;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 10px;
  border-radius: 6px;
  border: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--background-base, #141413);
  color: var(--text-strong, #ededec);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.swarm-model-select-trigger:hover:not(:disabled) {
  border-color: var(--text-weak, #8a8984);
}

.swarm-model-select-trigger:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.swarm-model-select-value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.swarm-model-select-caret {
  font-size: 11px;
  color: var(--text-weak, #8a8984);
  flex-shrink: 0;
}

.swarm-model-select-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  border-radius: 8px;
  border: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--background-base, #141413);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.45);
  overflow: hidden;
}

.swarm-model-select-menu-upward {
  top: auto;
  bottom: calc(100% + 4px);
}

.swarm-model-select-search-wrap {
  padding: 6px;
  border-bottom: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--surface-raised-base, #1d1d1c);
}

.swarm-model-select-search {
  width: 100%;
  box-sizing: border-box;
  padding: 5px 8px;
  border-radius: 5px;
  border: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--background-base, #141413);
  color: var(--text-strong, #ededec);
  font-size: 12px;
  outline: none;
}

.swarm-model-select-search:focus {
  border-color: var(--text-weak, #8a8984);
}

.swarm-model-select-list {
  max-height: 220px;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.swarm-model-select-item {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-base, #b5b4b0);
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}

.swarm-model-select-item:hover,
.swarm-model-select-item.is-selected {
  background: var(--surface-base-hover, #262625);
  color: var(--text-strong, #ededec);
}

.swarm-model-select-item-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
}

.swarm-model-select-item-right {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.swarm-model-select-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(245, 166, 35, 0.16);
  color: #f5b942;
  white-space: nowrap;
}

.swarm-model-select-check {
  font-size: 11px;
  color: var(--text-strong, #ededec);
}

.swarm-model-select-empty {
  padding: 12px 8px;
  text-align: center;
  font-size: 12px;
  color: var(--text-weak, #8a8984);
}

.swarm-onboard-root {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 6px 4px 4px;
  color: var(--text-base, #b5b4b0);
  font-size: 13px;
}

.swarm-onboard-question {
  margin: 0 0 12px;
  color: var(--text-strong, #ededec);
  font-size: 13px;
}

.swarm-onboard-mode-cards,
.swarm-onboard-choices {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.swarm-onboard-mode-card,
.swarm-onboard-option-card,
.swarm-onboard-custom-card {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--surface-raised-base, #1d1d1c);
  color: var(--text-base, #b5b4b0);
  text-align: left;
  cursor: pointer;
}

.swarm-onboard-mode-card:hover:not(:disabled),
.swarm-onboard-option-card:hover {
  background: var(--surface-base-hover, #262625);
  border-color: var(--text-weak, #8a8984);
}

.swarm-onboard-option-card.is-selected,
.swarm-onboard-custom-card.is-selected,
.swarm-onboard-mode-card.is-primary {
  border-color: rgba(245, 166, 35, 0.55);
}

.swarm-onboard-custom-card {
  cursor: default;
  gap: 8px;
}

.swarm-onboard-option-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-strong, #ededec);
}

.swarm-onboard-mode-desc,
.swarm-onboard-option-sub,
.swarm-onboard-custom-head span {
  margin: 0;
  font-size: 12px;
  color: var(--text-weak, #8a8984);
}

.swarm-onboard-custom-head {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.swarm-onboard-custom-head strong {
  color: var(--text-strong, #ededec);
  font-size: 12px;
}

.swarm-onboard-rec-grid {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--background-base, #141413);
}

.swarm-onboard-rec-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
}

.swarm-onboard-rec-role {
  color: var(--text-weak, #8a8984);
  font-weight: 600;
}

.swarm-onboard-rec-spec {
  color: var(--text-strong, #ededec);
  font-family: var(--font-family-mono, monospace);
}

.swarm-onboard-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.swarm-onboard-step-head h3 {
  margin: 6px 0 4px;
  font-size: 15px;
  color: var(--text-strong, #ededec);
}

.swarm-onboard-step-head p {
  margin: 0;
  font-size: 12px;
  color: var(--text-weak, #8a8984);
}

.swarm-onboard-step-pill {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  background: var(--surface-base-hover, #262625);
  color: var(--text-strong, #ededec);
}

.swarm-onboard-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}

.swarm-onboard-footer-right {
  display: flex;
  align-items: center;
  gap: 8px;
}
`,ne={coordinator:{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination",displayLabel:"Muse Spark 1.3 · xhigh",patterns:[/^muse-spark-1\.3/i,/muse[\s._-]*spark[\s._-]*1\.3/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"xhigh",fallbackSpec:"opencode-go/muse-spark-1.3-contributor#xhigh"},worker:{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · high",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"high",fallbackSpec:"opencode-go/deepseek-v4.1-flash#high"},verifier:{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · max",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"max",fallbackSpec:"opencode-go/deepseek-v4.1-flash#max"},monitor:{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads",displayLabel:"GLM 5.3 Flash · default",patterns:[/^glm-5\.3-flash$/i,/glm[\s._-]*5\.3[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:void 0,fallbackSpec:"opencode-go/glm-5.3-flash"}};function we(e,c){const a={};for(const h of["coordinator","worker","verifier","monitor"]){const u=ne[h];let y;for(const b of u.preferredProviders)if(y=e.find(o=>o.providerID.toLowerCase()===b.toLowerCase()&&u.patterns.some(m=>m.test(o.id)||(o.name?m.test(o.name):!1))),y)break;if(y||(y=e.find(b=>u.patterns.some(o=>o.test(b.id)||(b.name?o.test(b.name):!1)))),y){const b=`${y.providerID}/${y.id}`;if(u.preferredVariant){const o=(y.variants??[]).find(m=>m.toLowerCase()===u.preferredVariant.toLowerCase());a[h]=o?`${b}#${o}`:b}else a[h]=b}else{const b=c?.[h];a[h]=b&&b.trim()?b.trim():u.fallbackSpec}}return a}function he(e,c,a){const h=[],u=new Set;for(const o of e){const m=`${o.providerID}/${o.id}`;u.has(m)||(u.add(m),h.push({spec:m,label:o.name?`${m} (${o.name})`:m}));for(const z of o.variants??[]){const v=`${m}#${z}`;u.has(v)||(u.add(v),h.push({spec:v,label:v}))}}if(c&&!u.has(c)&&(u.add(c),h.push({spec:c,label:c})),a&&!u.has(a)&&(u.add(a),h.push({spec:a,label:a})),h.sort((o,m)=>o.label.localeCompare(m.label,void 0,{sensitivity:"base",numeric:!0})),!a)return h;let y;const b=[];for(const o of h)o.spec===a?y={...o,isRecommended:!0}:b.push(o);return y?[y,...b]:b}var ye=t.template('<div role=listbox><div class=swarm-model-select-search-wrap><input type=search class=swarm-model-select-search placeholder="Search models..."></div><div class=swarm-model-select-list>'),xe=t.template("<div class=swarm-model-select><button type=button class=swarm-model-select-trigger aria-haspopup=listbox><span class=swarm-model-select-value></span><span class=swarm-model-select-caret aria-hidden=true>▾"),$e=t.template("<div class=swarm-model-select-empty>No matching models"),Ce=t.template("<span class=swarm-model-select-badge>Recommended"),ke=t.template("<span class=swarm-model-select-check aria-hidden=true>✓"),_e=t.template("<button type=button role=option><span class=swarm-model-select-item-label></span><span class=swarm-model-select-item-right>");function ve(e){const[c,a]=i.createSignal(!1),[h,u]=i.createSignal("");let y,b;const o=i.createMemo(()=>{const v=h().trim().toLowerCase();if(!v)return e.options;const _=v.split(/\s+/).filter(Boolean);return e.options.filter(g=>{const r=`${g.label} ${g.spec}`.toLowerCase();return _.every(f=>r.includes(f))})}),m=i.createMemo(()=>{const v=e.value;if(!v)return e.placeholder??"Select model...";const _=e.options.find(g=>g.spec===v);return _?_.label:v});i.createEffect(()=>{if(!c())return;u(""),queueMicrotask(()=>{b?.focus()});const v=g=>{y&&!y.contains(g.target)&&a(!1)},_=g=>{g.key==="Escape"&&(g.stopPropagation(),a(!1))};document.addEventListener("mousedown",v),document.addEventListener("keydown",_,!0),i.onCleanup(()=>{document.removeEventListener("mousedown",v),document.removeEventListener("keydown",_,!0)})});const z=v=>{a(!1),u(""),v!==e.value&&e.onChange(v)};return(()=>{var v=xe(),_=v.firstChild,g=_.firstChild,r=y;return typeof r=="function"?t.use(r,v):y=v,_.$$click=()=>{e.disabled||a(f=>!f)},t.insert(g,m),t.insert(v,t.createComponent(i.Show,{get when(){return c()},get children(){var f=ye(),p=f.firstChild,l=p.firstChild,I=p.nextSibling;l.$$keydown=S=>{if(S.key==="Enter"){S.preventDefault();const k=o()[0];k&&z(k.spec)}else S.key==="Escape"&&(S.preventDefault(),S.stopPropagation(),a(!1))},l.$$input=S=>u(S.currentTarget.value);var x=b;return typeof x=="function"?t.use(x,l):b=l,t.insert(I,t.createComponent(i.Show,{get when(){return o().length>0},get fallback(){return $e()},get children(){return t.createComponent(i.For,{get each(){return o()},children:S=>{const k=()=>S.spec===e.value;return(()=>{var w=_e(),$=w.firstChild,M=$.nextSibling;return w.$$click=()=>z(S.spec),t.insert($,()=>S.label),t.insert(M,t.createComponent(i.Show,{get when(){return S.isRecommended},get children(){return Ce()}}),null),t.insert(M,t.createComponent(i.Show,{get when(){return k()},get children(){return ke()}}),null),t.effect(R=>{var P=k(),V=`swarm-model-select-item${k()?" is-selected":""}`;return P!==R.e&&t.setAttribute(w,"aria-selected",R.e=P),V!==R.t&&t.className(w,R.t=V),R},{e:void 0,t:void 0}),w})()}})}})),t.effect(S=>{var k=`swarm-model-select-menu${e.menuUpward?" swarm-model-select-menu-upward":""}`,w=`${e.ariaLabel} options`;return k!==S.e&&t.className(f,S.e=k),w!==S.t&&t.setAttribute(f,"aria-label",S.t=w),S},{e:void 0,t:void 0}),t.effect(()=>l.value=h()),f}}),null),t.effect(f=>{var p=e.disabled,l=e.ariaLabel,I=c();return p!==f.e&&(_.disabled=f.e=p),l!==f.t&&t.setAttribute(_,"aria-label",f.t=l),I!==f.a&&t.setAttribute(_,"aria-expanded",f.a=I),f},{e:void 0,t:void 0,a:void 0}),v})()}t.delegateEvents(["click","input","keydown"]);var Ie=t.template("<div class=swarm-overlay-error>"),Ae=t.template("<div class=swarm-overlay-roles>"),Me=t.template("<div class=swarm-overlay-root><div class=swarm-overlay-top><div class=swarm-overlay-status><span class=swarm-overlay-badge></span><div class=swarm-overlay-meta><strong></strong><span> active · <!> waiting · <!> posts</span></div></div><div class=swarm-overlay-actions>"),ze=t.template("<div class=swarm-overlay-loading><span>Loading role models..."),Le=t.template("<span class=swarm-overlay-role-count>"),Re=t.template("<div class=swarm-overlay-role-row><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><strong></strong></div><span class=swarm-overlay-role-sub></span></div><div class=swarm-overlay-select-wrap>");const fe=[{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination"},{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)"},{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)"},{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads"}];function Ee(e){const{Button:c,Dialog:a,Loader:h}=e.ctx.ui,[u,y]=i.createSignal(null),[b,o]=i.createSignal(!0),[m,z]=i.createSignal(null),[v,_]=i.createSignal(null),g=async()=>{o(!0),_(null);try{const l=await e.loadRoleConfig();y(l)}catch(l){_(l instanceof Error?l.message:String(l))}finally{o(!1)}};i.onMount(()=>{g()});const r=l=>{const I=u()?.roleModels[l]??"";return he(u()?.models??[],I)},f=l=>{const I=e.snapshot();if(!I)return{working:0,waiting:0};let x=0,S=0;for(const k of I.members){if((k.role??"").toLowerCase()!==l)continue;const w=k.state.toLowerCase();w==="working"||w==="active"?x++:(w==="waiting"||w==="idle")&&S++}return{working:x,waiting:S}},p=async(l,I)=>{if(I){z(l),_(null);try{const x=await e.onSetRoleModel(l,I);if(!x||!x.ok){const k=x?.error??`Failed to switch ${l} model`;_(k),e.ctx.toast.show({title:`Failed to switch ${l}`,description:k,variant:"error"});return}y(k=>k&&{...k,roleModels:{...k.roleModels,[l]:x.model}});const S=x.rerunMembers.length>0?`Stopped, switched & rerunning: ${x.rerunMembers.map(k=>`@${k}`).join(", ")}`:x.switchedMembers.length>0?`Updated: ${x.switchedMembers.map(k=>`@${k}`).join(", ")}`:`Default saved for next ${l}`;e.ctx.toast.show({title:`${l} → ${x.model}`,description:S,variant:"success"})}catch(x){const S=x instanceof Error?x.message:String(x);_(S),e.ctx.toast.show({title:`Failed to switch ${l}`,description:S,variant:"error"})}finally{z(null)}}};return t.createComponent(a,{title:"🐝 Swarm Control",size:"large",get children(){var l=Me(),I=l.firstChild,x=I.firstChild,S=x.firstChild,k=S.nextSibling,w=k.firstChild,$=w.nextSibling,M=$.firstChild,R=M.nextSibling,P=R.nextSibling,V=P.nextSibling;V.nextSibling;var G=x.nextSibling;return t.insert(S,()=>e.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing"),t.insert(w,()=>e.snapshot()?.title??"No active swarm"),t.insert($,()=>e.counts().active,M),t.insert($,()=>e.counts().waiting,R),t.insert($,()=>e.counts().posts,V),t.insert(G,t.createComponent(i.Show,{get when(){return e.onOpenSetupWizard},get children(){return t.createComponent(c,{variant:"ghost",size:"small",onClick:()=>e.onOpenSetupWizard?.(),children:"Setup Wizard"})}}),null),t.insert(G,t.createComponent(c,{variant:"contrast",onClick:()=>{e.onOpenBoard(),e.onClose()},children:"Board"}),null),t.insert(l,t.createComponent(i.Show,{get when(){return v()},get children(){var D=Ie();return t.insert(D,v),D}}),null),t.insert(l,t.createComponent(i.Show,{get when(){return!b()||u()!==null},get fallback(){return(()=>{var D=ze(),L=D.firstChild;return t.insert(D,t.createComponent(h,{size:"normal"}),L),D})()},get children(){var D=Ae();return t.insert(D,t.createComponent(i.For,{each:fe,children:(L,q)=>{const B=()=>f(L.role),E=()=>u()?.roleModels[L.role]??"",W=()=>m()===L.role,K=i.createMemo(()=>r(L.role));return(()=>{var Y=Re(),ae=Y.firstChild,O=ae.firstChild,j=O.firstChild,ee=O.nextSibling,H=ae.nextSibling;return t.insert(j,()=>L.title),t.insert(O,t.createComponent(i.Show,{get when(){return B().working>0||B().waiting>0},get children(){var N=Le();return t.insert(N,(()=>{var te=t.memo(()=>B().working>0);return()=>te()?`${B().working} working`:`${B().waiting} waiting`})()),N}}),null),t.insert(ee,()=>L.subtitle),t.insert(H,t.createComponent(ve,{get value(){return E()},get options(){return K()},get disabled(){return W()},get ariaLabel(){return`${L.title} model`},get menuUpward(){return q()>=fe.length-1},onChange:N=>{p(L.role,N)}})),Y})()}})),D}}),null),l}})}var Pe=t.template("<div class=swarm-overlay-error>"),Be=t.template('<div class=swarm-onboard-intro><p class=swarm-onboard-question>Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?</p><div class=swarm-onboard-mode-cards><button type=button class="swarm-onboard-mode-card is-primary"><div class=swarm-onboard-option-top><strong>Use Recommended Models</strong><span class=swarm-model-select-badge>Recommended</span></div><p class=swarm-onboard-mode-desc>Apply tuned defaults for all 4 roles right away:</p><div class=swarm-onboard-rec-grid></div></button><button type=button class=swarm-onboard-mode-card><div class=swarm-onboard-option-top><strong>Pick Manually (4 Questions)</strong></div><p class=swarm-onboard-mode-desc>Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.</p></button></div><div class=swarm-onboard-footer><span>'),Oe=t.template("<div class=swarm-onboard-root>"),De=t.template("<div class=swarm-overlay-loading><span>Loading available models..."),qe=t.template("<div class=swarm-onboard-step><div class=swarm-onboard-step-head><span class=swarm-onboard-step-pill>Question <!> of </span><h3>Choose <!> Model</h3><p></p></div><div class=swarm-onboard-choices><button type=button><div class=swarm-onboard-option-top><strong>★ </strong><span class=swarm-model-select-badge>Recommended</span></div><span class=swarm-onboard-option-sub></span></button><div><div class=swarm-onboard-custom-head><strong>Pick from catalog (A–Z search)</strong><span>Type to filter by provider, model, or variant</span></div></div></div><div class=swarm-onboard-footer><div class=swarm-onboard-footer-right>"),We=t.template("<div class=swarm-onboard-rec-row><span class=swarm-onboard-rec-role></span><span class=swarm-onboard-rec-spec>");const ie=["coordinator","worker","verifier","monitor"];function Ue(e){const{Button:c,Dialog:a,Loader:h}=e.ctx.ui,[u,y]=i.createSignal(!0),[b,o]=i.createSignal(!1),[m,z]=i.createSignal(null),[v,_]=i.createSignal([]),[g,r]=i.createSignal(-1),[f,p]=i.createSignal({coordinator:ne.coordinator.fallbackSpec,worker:ne.worker.fallbackSpec,verifier:ne.verifier.fallbackSpec,monitor:ne.monitor.fallbackSpec}),l=i.createMemo(()=>we(v()));i.onMount(async()=>{y(!0),z(null);try{const w=await e.loadRoleConfig(),$=w?.models??[];_($);const M=we($,w?.roleModels);p(M)}catch(w){z(w instanceof Error?w.message:String(w))}finally{y(!1)}});const I=async w=>{o(!0),z(null);try{const $=await e.onApplyModels(w);if(!$.ok){const M=$.errors.join("; ")||"Failed to apply one or more role models.";z(M),e.ctx.toast.show({title:"Could not save all Swarm models",description:M,variant:"error"});return}e.ctx.toast.show({title:"Swarm role models configured",description:`Coordinator: ${w.coordinator}`,variant:"success"}),e.onComplete()}catch($){const M=$ instanceof Error?$.message:String($);z(M)}finally{o(!1)}},x=i.createMemo(()=>{const w=g();return w>=0&&w<ie.length?ie[w]:"coordinator"}),S=i.createMemo(()=>{const w=x();return he(v(),f()[w],l()[w])}),k=(w,$)=>{p(M=>({...M,[w]:$}))};return t.createComponent(a,{title:"🐝 Swarm Model Setup",size:"large",get children(){var w=Oe();return t.insert(w,t.createComponent(i.Show,{get when(){return m()},get children(){var $=Pe();return t.insert($,m),$}}),null),t.insert(w,t.createComponent(i.Show,{get when(){return!u()},get fallback(){return(()=>{var $=De(),M=$.firstChild;return t.insert($,t.createComponent(h,{size:"normal"}),M),$})()},get children(){return t.createComponent(i.Show,{get when(){return g()===-1},get fallback(){const $=()=>g(),M=()=>x(),R=()=>ne[M()],P=()=>l()[M()],V=()=>f()[M()],G=()=>V()===P();return(()=>{var D=qe(),L=D.firstChild,q=L.firstChild,B=q.firstChild,E=B.nextSibling;E.nextSibling;var W=q.nextSibling,K=W.firstChild,Y=K.nextSibling;Y.nextSibling;var ae=W.nextSibling,O=L.nextSibling,j=O.firstChild,ee=j.firstChild,H=ee.firstChild;H.firstChild;var N=ee.nextSibling,te=j.nextSibling;te.firstChild;var de=O.nextSibling,n=de.firstChild;return t.insert(q,()=>$()+1,E),t.insert(q,()=>ie.length,null),t.insert(W,()=>R().title,Y),t.insert(ae,()=>R().subtitle),j.$$click=()=>k(M(),P()),t.insert(H,P,null),t.insert(N,()=>R().displayLabel),t.insert(te,t.createComponent(ve,{get value(){return V()},get options(){return S()},get disabled(){return b()},get ariaLabel(){return`${R().title} model`},onChange:s=>k(M(),s)}),null),t.insert(de,t.createComponent(c,{variant:"ghost",get disabled(){return b()},onClick:()=>r(s=>Math.max(-1,s-1)),children:"Back"}),n),t.insert(n,t.createComponent(c,{variant:"ghost",get disabled(){return b()},onClick:()=>e.onSkip(),children:"Skip for now"}),null),t.insert(n,t.createComponent(i.Show,{get when(){return $()<ie.length-1},get fallback(){return t.createComponent(c,{variant:"contrast",get disabled(){return b()},onClick:()=>{I(f())},get children(){return b()?"Saving...":"Save & Finish"}})},get children(){return t.createComponent(c,{variant:"contrast",get disabled(){return b()},onClick:()=>r(s=>s+1),get children(){return["Next (",t.memo(()=>$()+2),"/",t.memo(()=>ie.length),")"]}})}}),null),t.effect(s=>{var d=`swarm-onboard-option-card${G()?" is-selected":""}`,C=`swarm-onboard-custom-card${G()?"":" is-selected"}`;return d!==s.e&&t.className(j,s.e=d),C!==s.t&&t.className(te,s.t=C),s},{e:void 0,t:void 0}),D})()},get children(){var $=Be(),M=$.firstChild,R=M.nextSibling,P=R.firstChild,V=P.firstChild,G=V.nextSibling,D=G.nextSibling,L=P.nextSibling,q=R.nextSibling;return q.firstChild,P.$$click=()=>{I(l())},t.insert(D,t.createComponent(i.For,{each:ie,children:B=>(()=>{var E=We(),W=E.firstChild,K=W.nextSibling;return t.insert(W,()=>ne[B].title),t.insert(K,()=>l()[B]),E})()})),L.$$click=()=>r(0),t.insert(q,t.createComponent(c,{variant:"ghost",get disabled(){return b()},onClick:()=>e.onSkip(),children:"Skip for now"}),null),t.effect(B=>{var E=b(),W=b();return E!==B.e&&(P.disabled=B.e=E),W!==B.t&&(L.disabled=B.t=W),B},{e:void 0,t:void 0}),$}})}}),null),w}})}t.delegateEvents(["click"]);var Ve=t.template("<div data-action=swarm-board.sidebarShow>"),je=t.template("<div data-action=swarm-board.pillbarShow>"),Te=t.template("<div data-action=swarm-board.showWhenIdle>"),Fe=t.template("<div data-action=swarm-board.composerPill>"),Ne=t.template("<div data-action=swarm-board.bottomStrip>"),Ge=t.template("<div data-action=swarm-board.withSidePanel>"),Ke=t.template("<div data-action=swarm-board.toastEnabled>"),Qe=t.template("<div style=display:flex;gap:8px>"),He=t.template("<div data-action=swarm-board.status>");function Ze(e){const{SettingsLayout:c,SettingsSection:a,SettingsRow:h,Switch:u,Button:y}=e.ctx.ui;i.onMount(()=>{!e.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(e.target)}"]`)?.scrollIntoView({block:"start"})})});const b=()=>{const o=e.rpcStatus();if(o.state==="connected"){const m=e.activeSwarmCount();return`Connected to local.swarm-runtime (${m} swarm${m===1?"":"s"} recorded).`}return o.state==="unavailable"?"Server plugin (local.swarm-runtime) is not loaded for this workspace.":o.message?`RPC error: ${o.message}`:"Unable to reach local.swarm-runtime."};return t.createComponent(c,{title:"Swarm Board",get children(){return[t.createComponent(a,{title:"Surfaces",get children(){return[(()=>{var o=Ve();return t.insert(o,t.createComponent(h,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return t.createComponent(u,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return e.settings().sidebarShow},onChange:m=>e.updateSetting("sidebarShow",m)})}})),o})(),(()=>{var o=je();return t.insert(o,t.createComponent(h,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return t.createComponent(u,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return e.settings().pillbarShow},onChange:m=>e.updateSetting("pillbarShow",m)})}})),o})(),(()=>{var o=Te();return t.insert(o,t.createComponent(h,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return t.createComponent(u,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return e.settings().showWhenIdle},onChange:m=>e.updateSetting("showWhenIdle",m)})}})),o})(),(()=>{var o=Fe();return t.insert(o,t.createComponent(h,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return t.createComponent(u,{label:"Show composer pill",hideLabel:!0,get checked(){return e.settings().composerPill},onChange:m=>e.updateSetting("composerPill",m)})}})),o})(),(()=>{var o=Ne();return t.insert(o,t.createComponent(h,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return t.createComponent(u,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return e.settings().bottomStrip},onChange:m=>e.updateSetting("bottomStrip",m)})}})),o})(),(()=>{var o=Ge();return t.insert(o,t.createComponent(h,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return t.createComponent(u,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return e.settings().withSidePanel},onChange:m=>e.updateSetting("withSidePanel",m)})}})),o})()]}}),t.createComponent(a,{title:"Notifications",get children(){var o=Ke();return t.insert(o,t.createComponent(h,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return t.createComponent(u,{label:"Event toasts",hideLabel:!0,get checked(){return e.settings().toastEnabled},onChange:m=>e.updateSetting("toastEnabled",m)})}})),o}}),t.createComponent(a,{title:"Plugin Status & Actions",get children(){var o=He();return t.insert(o,t.createComponent(h,{title:"Swarm Runtime",get description(){return b()},get children(){var m=Qe();return t.insert(m,t.createComponent(y,{size:"small",variant:"ghost",get onClick(){return e.onRefresh},children:"Refresh"}),null),t.insert(m,(()=>{var z=t.memo(()=>!!e.onOpenSetupWizard);return()=>z()&&t.createComponent(y,{size:"small",variant:"ghost",get onClick(){return e.onOpenSetupWizard},children:"Setup Role Models"})})(),null),t.insert(m,t.createComponent(y,{size:"small",variant:"neutral",get onClick(){return e.onOpenPanel},children:"Open Swarm Board"}),null),m}})),o}})]}})}const pe="swarm-board",be=J.Schema.Struct({sidebarShow:J.Schema.Boolean,pillbarShow:J.Schema.Boolean,showWhenIdle:J.Schema.Boolean,composerPill:J.Schema.Boolean,bottomStrip:J.Schema.Boolean,withSidePanel:J.Schema.Boolean,toastEnabled:J.Schema.Boolean,onboardingComplete:J.Schema.Boolean}),ue={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0,onboardingComplete:!1};function Je(e){return(Array.isArray(e)?e:e&&typeof e=="object"&&Array.isArray(e.swarms)?e.swarms:[]).map(a=>({id:String(a.id??""),title:String(a.title??a.id??"Swarm"),status:String(a.status??"running"),activeCount:typeof a.activeCount=="number"?a.activeCount:void 0,waitingCount:typeof a.waitingCount=="number"?a.waitingCount:void 0,postCount:typeof a.postCount=="number"?a.postCount:typeof a.post_count=="number"?a.post_count:void 0,updatedAt:a.updatedAt??(typeof a.updated_at=="number"?new Date(a.updated_at).toISOString():void 0)}))}function Ye(e){if(!e||typeof e!="object")return null;const c=e;if(typeof c.swarmId=="string"&&Array.isArray(c.posts))return c;const a=c.swarm;if(!a||typeof a!="object")return null;const h=Array.isArray(c.members)?c.members:[],u=Array.isArray(c.board_posts)?c.board_posts:Array.isArray(c.posts)?c.posts:[],y=Array.isArray(c.file_locks)?c.file_locks:Array.isArray(c.locks)?c.locks:[],b=h.map(r=>({handle:String(r.handle??r.name??""),role:typeof r.role=="string"?r.role:void 0,state:String(r.state??"waiting"),model:typeof r.model=="string"?r.model:void 0,variant:typeof r.variant=="string"?r.variant:void 0,trackStatus:typeof r.track_status=="string"?r.track_status:r.trackStatus,ownedGlobs:Array.isArray(r.owned_globs)?r.owned_globs:Array.isArray(r.ownedGlobs)?r.ownedGlobs:[],sessionId:typeof r.session_id=="string"?r.session_id:r.sessionId,session_id:typeof r.session_id=="string"?r.session_id:r.sessionId})),o=u.map(r=>({id:r.seq??r.id??0,seq:typeof r.seq=="number"?r.seq:void 0,author:String(r.author??""),body:String(r.body??""),createdAt:typeof r.created_at=="number"?new Date(r.created_at).toISOString():r.createdAt,created_at:typeof r.created_at=="number"?new Date(r.created_at).toISOString():r.created_at,mentions:Array.isArray(r.mentions)?r.mentions:[]})),m=y.map(r=>({glob:String(r.glob_pattern??r.glob??""),owner:String(r.owner_handle??r.owner??""),acquiredAt:typeof r.claimed_at=="number"?new Date(r.claimed_at).toISOString():r.acquiredAt})),z=h.some(r=>!!r.paused_quota),v=[...o].reverse().find(r=>r.author.replace(/^@/,"").toLowerCase()==="verifier"),_=v?/\bFAIL\b/i.test(v.body)?"FAIL":/\bPASS\b/i.test(v.body)?"PASS":void 0:void 0,g=[];for(const r of o)if(r.mentions&&r.mentions.length>0)for(const f of r.mentions)g.push({from:r.author,to:f.startsWith("@")?f:`@${f}`,summary:r.body.slice(0,80),at:r.createdAt});return{swarmId:String(a.id??""),title:String(a.title??a.id??"Swarm"),status:String(a.status??"running"),boardUrl:typeof c.boardUrl=="string"?c.boardUrl:void 0,pausedQuota:z,paused_quota:z,verifierStatus:_,members:b,posts:o,locks:m,handoffs:g}}var Xe=t.template("<span>"),et=t.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),tt=t.template("<div style=padding:12px>Loading Swarm Board...");const rt=i.lazy(()=>Promise.resolve().then(()=>pt)),ot=[{id:pe,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"},{id:"swarm-board.status",title:"Setup Role Models",description:"Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",keywords:"swarm models onboarding wizard setup"}],nt=`
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`,at=F.Plugin.define({stores:{settings:F.Store.global(be,ue)},setup(e){const c=e.stores?.settings??e.storage.store("swarm.settings",{schema:be,initial:ue}),a=()=>c.value??ue,h=(n,s)=>{c.set({...a(),[n]:s})},u=(n,s)=>{try{return e.add(n,s)}catch(d){return console.warn("[swarm-runtime] OpenCode did not accept a GUI item:",d),()=>{}}};u(F.Style,Se);const[y,b]=i.createSignal([]),[o,m]=i.createSignal(null),[z,v]=i.createSignal(null),[_,g]=i.createSignal(null),[r,f]=i.createSignal(""),[p,l]=i.createSignal(void 0),[I,x]=i.createSignal({state:"connected"});let S=!1,k="",w=!1,$="",M=null,R=0,P=null,V,G=!1;const D=()=>e.sessions.current()?.location?.directory??p(),L=()=>e.client.rpc(ge),q=()=>{const n=e.sessions.current()?.location??(p()?{directory:p()}:void 0),s=AbortSignal.timeout(8e3);return n?{location:n,signal:s}:{signal:s}},B=n=>{if(!a().toastEnabled)return;const s=!!(n.pausedQuota??n.paused_quota);s&&!S&&e.toast.show({title:"Swarm paused on quota",description:n.title||n.swarmId,variant:"error"}),S=s;const d=(n.verifierStatus??"").toUpperCase();(d==="PASS"||d==="FAIL")&&d!==k&&e.toast.show({title:`@verifier ${d}`,description:n.title||n.swarmId,variant:d==="PASS"?"success":"error"}),k=d;const C=[...n.posts].reverse().find(A=>A.author.replace(/^@/,"").toLowerCase()==="monitor");n.stalled&&!w?e.toast.show({title:"@monitor stall nudge",description:C?.body??"Swarm appears stalled"}):C&&C.id!==M&&M!==null&&e.toast.show({title:"@monitor stall nudge",description:C.body}),w=!!n.stalled,C&&(M=C.id),n.status==="completed"&&$!==n.swarmId&&($=n.swarmId,e.toast.show({title:"Swarm completed",description:n.title||n.swarmId,variant:"success"}))},E=async(n=!1)=>{const s=++R;try{const d=L(),C=q(),A=await d.listSwarms({},C);if(s!==R)return;const T=Je(A);b(T);const U=T.find(me=>me.status==="running"||me.status==="completing")??null;U&&(U.id!==P||n)?(P=U.id,v(null),m(U.id)):U||(P=null);const re=o();re&&!T.some(me=>me.id===re)&&(m(null),v(null)),(!o()||U&&!z()&&o()!==U.id)&&m(U?.id??T[0]?.id??null);const le=o(),ce=e.sessions.current()?.id,Z=await d.getSwarmSnapshot(le?{swarmId:le}:ce?{sessionId:ce}:{},C);if(s!==R)return;Z&&typeof Z=="object"&&typeof Z.boardUrl=="string"&&Z.boardUrl&&f(Z.boardUrl);const se=Ye(Z);g(se),x({state:"connected"}),!a().onboardingComplete&&!G&&(G=!0,queueMicrotask(()=>N())),se&&B(se)}catch(d){if(s!==R)return;const C=typeof d=="object"&&d!==null&&"type"in d&&d.type==="rpc.unavailable";x(C?{state:"unavailable"}:{state:"error",message:d instanceof Error?d.message:String(d)})}};i.createEffect(()=>{const n=D();e.sessions.current()?.id,e.sessions.current()?.pending,o(),n!==V&&(V=n,P=null,v(null),m(null),g(null),b([])),E()});let W=null,K;const Y=()=>{if(W!==e.client){K?.abort(),W=e.client,K=new AbortController;try{e.client.rpc(ge).events.on("changed",()=>{E()},{signal:K.signal})}catch{}}};Y(),i.createEffect(()=>{try{const n=e.servers;if(!n)return;const d=n.list().map(A=>n.get(A)).find(A=>A?.builtin)?.data;if(!d||typeof d.on!="function")return;const C=d.on("session.tool.success",()=>{E()});i.onCleanup(()=>C())}catch{}});const ae=setInterval(()=>{Y(),E()},2e3);i.onCleanup(()=>{K?.abort(),clearInterval(ae)});const O=i.createMemo(()=>{const n=_();if(!n)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let s=0,d=0;for(const C of n.members){const A=C.state.toLowerCase();A==="working"||A==="active"?s++:(A==="waiting"||A==="idle")&&d++}return{active:s,waiting:d,posts:n.posts.length,paused:!!(n.pausedQuota??n.paused_quota),stalled:!!n.stalled}}),j=(n=!1)=>{if(!a().sidebarShow){e.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const s=e.sessions.current();if(!s){e.toast.show({title:"Open a session first to view the Swarm Board."});return}const d=`${e.id}:swarm`;if(n&&e.layout.state(d,s)==="visible"){e.layout.hide(d,s);return}e.layout.open(d,s)},ee=()=>{e.layout.settings(pe)},H=i.createMemo(()=>{const n=_(),s=O();return!!(n&&(s.active>0||n.status==="running"&&n.members.some(d=>d.state.toLowerCase()==="working")))});u(F.Style,()=>H()?nt:void 0);const N=()=>{e.dialogs.open(n=>t.createComponent(Ue,{ctx:e,loadRoleConfig:async()=>{const s=o(),d=e.sessions.current()?.id;return await L().getRoleConfig(s?{swarmId:s}:d?{sessionId:d}:{},q())},onApplyModels:async s=>{const d=[],C=o(),A=e.sessions.current()?.id;for(const T of["coordinator","worker","verifier","monitor"]){const U=s[T];if(!U)continue;const re=await L().setRoleModel({role:T,model:U,...C?{swarmId:C}:{},...A?{sessionId:A}:{}},q());re?.ok||d.push(`${T}: ${re?.error??"failed"}`)}return E(),{ok:d.length===0,errors:d}},onComplete:()=>{h("onboardingComplete",!0),n.close()},onSkip:()=>{h("onboardingComplete",!0),n.close()}}))},te=()=>{e.dialogs.open(n=>t.createComponent(Ee,{ctx:e,snapshot:_,counts:O,isBuzzing:H,loadRoleConfig:async()=>{const s=o(),d=e.sessions.current()?.id;return await L().getRoleConfig(s?{swarmId:s}:d?{sessionId:d}:{},q())},onSetRoleModel:async(s,d)=>{const C=o(),A=e.sessions.current()?.id,T=await L().setRoleModel({role:s,model:d,...C?{swarmId:C}:{},...A?{sessionId:A}:{}},q());return E(),T},onOpenBoard:()=>j(!1),onOpenSetupWizard:()=>{n.close(),N()},onClose:()=>n.close()}))};u(F.SettingsPage,()=>({id:pe,title:"Swarm Board",icon:"dot-grid",entries:ot,render:({target:n})=>t.createComponent(Ze,{ctx:e,settings:a,updateSetting:h,rpcStatus:I,activeSwarmCount:()=>y().length,onOpenPanel:()=>j(!1),onOpenSetupWizard:N,onRefresh:()=>{E()},target:n})})),u(F.TitlebarItem,()=>{if(!a().pillbarShow)return;const n=_();if(!n&&!a().showWhenIdle)return;const s=e.sessions.current(),d=s?e.layout.state(`${e.id}:swarm`,s)==="visible":!1,C=O(),A=C.paused||C.stalled?" ⚠":"";return{id:"swarm-open",label:H()?`🐝 Swarm: Buzzing (${C.active} active · ${C.posts} posts)${A}`:n?`🐝 Swarm: Dozing (${C.posts} posts)${A}`:"🐝 Swarm: Dozing",title:C.paused?"Swarm paused on quota — click to open Swarm Board":C.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:d,run:()=>j(!0)}}),u(F.ComposerPill,{id:"swarm-composer-pill",show(n){if(n.session.directory&&l(n.session.directory),!a().composerPill)return;const s=_();if(!s&&!a().showWhenIdle)return;const d=O(),C=(s?.verifierStatus??"").toUpperCase();let A;return d.paused||C==="FAIL"?A="danger":d.stalled&&(A="warning"),{label:H()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",...A?{tone:A}:{},title:"Click to configure Swarm role models or open Board",run:()=>te()}}}),u(F.Slot,{at:"window.bottom",render:()=>{const n=()=>{if(!a().bottomStrip)return!1;const s=e.sessions.current();return!(s?e.layout.state(`${e.id}:swarm`,s)==="visible":!1)||a().withSidePanel};return t.createComponent(i.Show,{get when(){return n()},get children(){var s=et(),d=s.firstChild,C=d.firstChild,A=C.nextSibling,T=A.nextSibling,U=T.nextSibling,re=U.nextSibling,le=re.nextSibling,ce=le.nextSibling,Z=ce.nextSibling;return Z.nextSibling,s.$$click=()=>j(!0),t.insert(d,()=>_()?.title??"Idle",A),t.insert(d,()=>O().active,U),t.insert(d,()=>O().waiting,le),t.insert(d,()=>O().posts,Z),t.insert(s,t.createComponent(i.Show,{get when(){return O().paused||O().stalled},get children(){var se=Xe();return t.insert(se,()=>O().paused?"Paused on quota":"Stalled"),se}}),null),s}})}}),u(F.MenuItem,()=>{const n=e.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:n?e.layout.state(`${e.id}:swarm`,n)!=="closed":!1,run:()=>j(!1)}}),u(F.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>j(!1)})),u(F.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>ee()})),u(F.Command,()=>({id:"setup-models",title:"Swarm Model Setup Wizard",description:"Choose recommended or manual models for Swarm roles",group:"Swarm",section:"model",run:()=>N()}));const de={id:"swarm",title:"Swarm",pinned:!0};u(F.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return a().sidebarShow?[de]:[]},render(n){return n.session.directory&&l(n.session.directory),t.createComponent(i.Suspense,{get fallback(){return tt()},get children(){return t.createComponent(rt,{ctx:e,snapshot:_,boardUrl:r,swarms:y,selectedSwarmId:o,sessionId:()=>n.session.id,onSelectSwarm:s=>{v(s),m(s)},onRefresh:()=>{E(!0)},onOpenSettings:ee,rpcError:()=>{const s=I();if(s.state==="unavailable")return"Server plugin (local.swarm-runtime) is not loaded for this workspace.";if(s.state==="error")return s.message},onCompleteSwarm:async s=>{await L().completeSwarm({swarmId:s},q()),await E()},get server(){return n.session.server}})}})}})}});t.delegateEvents(["click"]);var st=t.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),it=t.template("<option>"),lt=t.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),dt=t.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),ct=t.template("<option> (<!>)"),mt=t.template("<div class=swarm-gui-empty>");function ut(e){const{Button:c,Dialog:a}=e.ctx.ui,[h,u]=i.createSignal(0);let y;const b=i.createMemo(()=>e.snapshot()?.boardUrl||e.boardUrl?.()||""),o=i.createMemo(()=>e.selectedSwarmId()??e.snapshot()?.swarmId??""),m=i.createMemo(()=>{const g=b();if(!g)return"";const r=o(),f=e.sessionId?.()??"",p=h();try{const l=new URL(g);return r&&l.searchParams.set("swarmId",r),f&&l.searchParams.set("conversationId",f),p>0&&l.searchParams.set("_r",String(p)),l.toString()}catch{return g}}),z=i.createMemo(()=>{const g=m();if(!g)return"";try{return new URL(g).origin}catch{return""}}),v=()=>{const g=y?.contentWindow,r=z();if(!g||!r)return;const f=e.ctx.appearance.mode(),p=typeof document<"u"?getComputedStyle(document.documentElement):null,l=S=>p?.getPropertyValue(S).trim()||"",I={},x=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[S,k]of x){const w=l(k);w&&(I[S]=w)}g.postMessage({type:"swarm:theme",mode:f,tokens:I},r)};if(i.createEffect(()=>{e.ctx.appearance.mode(),v()}),typeof window<"u"){const g=r=>{if(r.source!==y?.contentWindow)return;const f=z();if(f&&r.origin!==f)return;const p=r.data;if(p?.type==="swarm:open_session"&&typeof p.sessionID=="string"&&p.sessionID){const l=e.server,I=typeof l=="string"?l:l?.id??e.ctx.sessions.current()?.server.id;if(!I){e.ctx.toast.show({title:"No server context for member session"});return}e.ctx.tabs.open({server:I,id:p.sessionID},{focus:!0})}};window.addEventListener("message",g),i.onCleanup(()=>window.removeEventListener("message",g))}const _=()=>{const g=e.snapshot();g&&e.ctx.dialogs.open(r=>t.createComponent(a,{title:"Complete Swarm?",get children(){var f=st(),p=f.firstChild,l=p.firstChild,I=l.nextSibling,x=p.nextSibling;return t.insert(I,()=>g.title||g.swarmId),t.insert(x,t.createComponent(c,{variant:"ghost",onClick:()=>r.close(),children:"Cancel"}),null),t.insert(x,t.createComponent(c,{variant:"danger",onClick:async()=>{await e.onCompleteSwarm(g.swarmId),r.close()},children:"Complete Swarm"}),null),f}}))};return(()=>{var g=dt(),r=g.firstChild,f=r.firstChild;return f.addEventListener("change",p=>e.onSelectSwarm(p.currentTarget.value)),t.insert(f,t.createComponent(i.Show,{get when(){return e.swarms().length===0},get children(){var p=it();return t.insert(p,()=>e.snapshot()?.title??"No active swarm"),t.effect(()=>p.value=e.snapshot()?.swarmId??""),p}}),null),t.insert(f,t.createComponent(i.For,{get each(){return e.swarms()},children:p=>(()=>{var l=ct(),I=l.firstChild,x=I.nextSibling;return x.nextSibling,t.insert(l,()=>p.title||p.id,I),t.insert(l,()=>p.status,x),t.effect(()=>l.value=p.id),l})()}),null),t.insert(r,t.createComponent(c,{size:"small",variant:"ghost",onClick:()=>{e.onRefresh(),u(p=>p+1)},children:"Refresh"}),null),t.insert(r,t.createComponent(i.Show,{get when(){return e.snapshot()?.status==="running"},get children(){return t.createComponent(c,{size:"small",variant:"neutral",onClick:_,children:"Complete"})}}),null),t.insert(r,t.createComponent(i.Show,{get when(){return e.onOpenSettings},get children(){return t.createComponent(c,{size:"small",variant:"ghost",onClick:()=>e.onOpenSettings?.(),children:"Settings"})}}),null),t.insert(g,t.createComponent(i.Show,{get when(){return m()},get fallback(){return(()=>{var p=mt();return t.insert(p,()=>e.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),p})()},get children(){var p=lt();return p.addEventListener("load",()=>v()),t.use(l=>{y=l},p),t.effect(()=>t.setAttribute(p,"src",m())),p}}),null),t.effect(()=>f.value=o()),g})()}const pt=Object.freeze(Object.defineProperty({__proto__:null,default:ut},Symbol.toStringTag,{value:"Module"}));exports.default=at;
