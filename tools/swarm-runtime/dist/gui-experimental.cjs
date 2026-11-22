"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const t=require("solid-js/web"),O=require("@opencode/plugin/gui"),l=require("solid-js"),N=require("effect");function U(e){return typeof e=="object"&&e!==null&&!Array.isArray(e)}function V(e){return{"~standard":{version:1,vendor:"swarm-runtime",validate(u){const a=e(u);return a?{issues:[{message:a}]}:{value:u}}}}}function Y(e){return{"~standard":{version:1,vendor:"swarm-runtime",validate(u){const a=u===void 0?{}:u;if(!U(a))return{issues:[{message:"input must be an object"}]};const C=e(a);return C?{issues:[{message:C}]}:{value:a}}}}}const ce={id:"local.swarm-runtime",methods:{getBoardInfo:{input:Y(()=>null),output:V(e=>U(e)&&typeof e.url=="string"&&typeof e.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:Y(e=>e.sessionId!==void 0&&typeof e.sessionId!="string"?"sessionId must be a string":e.swarmId!==void 0&&typeof e.swarmId!="string"?"swarmId must be a string":null),output:V(e=>U(e)&&Array.isArray(e.members)&&Array.isArray(e.board_posts)&&Array.isArray(e.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:Y(e=>e.limit!==void 0&&typeof e.limit!="number"?"limit must be a number":null),output:V(e=>U(e)&&Array.isArray(e.swarms)?null:"output must contain swarms array")},completeSwarm:{input:Y(e=>typeof e.swarmId=="string"?null:"swarmId must be a string"),output:V(e=>U(e)&&typeof e.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:Y(e=>typeof e.swarmId!="string"?"swarmId must be a string":typeof e.handle!="string"?"handle must be a string":null),output:V(e=>U(e)&&typeof e.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:Y(e=>e.sessionId!==void 0&&typeof e.sessionId!="string"?"sessionId must be a string":e.swarmId!==void 0&&typeof e.swarmId!="string"?"swarmId must be a string":null),output:V(e=>U(e)&&U(e.roleModels)&&Array.isArray(e.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:Y(e=>typeof e.role!="string"?"role must be a string":typeof e.model!="string"?"model must be a string":e.swarmId!==void 0&&typeof e.swarmId!="string"?"swarmId must be a string":e.sessionId!==void 0&&typeof e.sessionId!="string"?"sessionId must be a string":null),output:V(e=>U(e)&&typeof e.ok=="boolean"?null:"output must be SetRoleModelResult")}},events:{changed:{schema:V(e=>U(e)&&typeof e.swarmId=="string"&&typeof e.reason=="string"?null:"event must contain swarmId and reason")}}},me=`
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

.swarm-overlay-select {
  flex: 0 0 260px;
  max-width: 260px;
  height: 30px;
}
`;var pe=t.template("<div class=swarm-overlay-error>"),we=t.template("<div class=swarm-overlay-roles>"),ge=t.template("<div class=swarm-overlay-root><div class=swarm-overlay-top><div class=swarm-overlay-status><span class=swarm-overlay-badge></span><div class=swarm-overlay-meta><strong></strong><span> active · <!> waiting · <!> posts"),fe=t.template("<div class=swarm-overlay-loading><span>Loading role models..."),be=t.template("<span class=swarm-overlay-role-count>"),he=t.template("<option value>No models available"),Se=t.template('<div class=swarm-overlay-role-row><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><strong></strong></div><span class=swarm-overlay-role-sub></span></div><select class="swarm-gui-select swarm-overlay-select">'),ve=t.template("<option>");const ye=[{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination"},{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)"},{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)"},{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads"}];function $e(e){const{Button:u,Dialog:a,Loader:C}=e.ctx.ui,[h,k]=l.createSignal(null),[D,i]=l.createSignal(!0),[m,q]=l.createSignal(null),[A,x]=l.createSignal(null),g=async()=>{i(!0),x(null);try{const c=await e.loadRoleConfig();k(c)}catch(c){x(c instanceof Error?c.message:String(c))}finally{i(!1)}};l.onMount(()=>{g()});const r=l.createMemo(()=>{const c=h(),b=[],p=new Set;for(const $ of c?.models??[]){const f=`${$.providerID}/${$.id}`;p.has(f)||(p.add(f),b.push({spec:f,label:$.name?`${f} (${$.name})`:f}));for(const M of $.variants??[]){const P=`${f}#${M}`;p.has(P)||(p.add(P),b.push({spec:P,label:P}))}}return b}),y=c=>{const b=h()?.roleModels[c]??"",p=r();return b&&!p.some($=>$.spec===b)?[{spec:b,label:`${b} (current)`},...p]:p},d=c=>{const b=e.snapshot();if(!b)return{working:0,waiting:0};let p=0,$=0;for(const f of b.members){if((f.role??"").toLowerCase()!==c)continue;const M=f.state.toLowerCase();M==="working"||M==="active"?p++:(M==="waiting"||M==="idle")&&$++}return{working:p,waiting:$}},v=async(c,b)=>{if(b){q(c),x(null);try{const p=await e.onSetRoleModel(c,b);if(!p||!p.ok){const f=p?.error??`Failed to switch ${c} model`;x(f),e.ctx.toast.show({title:`Failed to switch ${c}`,description:f,variant:"error"});return}k(f=>f&&{...f,roleModels:{...f.roleModels,[c]:p.model}});const $=p.rerunMembers.length>0?`Stopped, switched & rerunning: ${p.rerunMembers.map(f=>`@${f}`).join(", ")}`:p.switchedMembers.length>0?`Updated: ${p.switchedMembers.map(f=>`@${f}`).join(", ")}`:`Default saved for next ${c}`;e.ctx.toast.show({title:`${c} → ${p.model}`,description:$,variant:"success"})}catch(p){const $=p instanceof Error?p.message:String(p);x($),e.ctx.toast.show({title:`Failed to switch ${c}`,description:$,variant:"error"})}finally{q(null)}}};return t.createComponent(a,{title:"🐝 Swarm Control",size:"large",get children(){var c=ge(),b=c.firstChild,p=b.firstChild,$=p.firstChild,f=$.nextSibling,M=f.firstChild,P=M.nextSibling,G=P.firstChild,K=G.nextSibling,te=K.nextSibling,re=te.nextSibling;return re.nextSibling,t.insert($,()=>e.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing"),t.insert(M,()=>e.snapshot()?.title??"No active swarm"),t.insert(P,()=>e.counts().active,G),t.insert(P,()=>e.counts().waiting,K),t.insert(P,()=>e.counts().posts,re),t.insert(b,t.createComponent(u,{variant:"contrast",onClick:()=>{e.onOpenBoard(),e.onClose()},children:"Board"}),null),t.insert(c,t.createComponent(l.Show,{get when(){return A()},get children(){var B=pe();return t.insert(B,A),B}}),null),t.insert(c,t.createComponent(l.Show,{get when(){return!D()||h()!==null},get fallback(){return(()=>{var B=fe(),I=B.firstChild;return t.insert(B,t.createComponent(C,{size:"normal"}),I),B})()},get children(){var B=we();return t.insert(B,t.createComponent(l.For,{each:ye,children:I=>{const Q=()=>d(I.role),E=()=>h()?.roleModels[I.role]??"",ne=()=>m()===I.role;return(()=>{var J=Se(),X=J.firstChild,Z=X.firstChild,z=Z.firstChild,F=Z.nextSibling,T=X.nextSibling;return t.insert(z,()=>I.title),t.insert(Z,t.createComponent(l.Show,{get when(){return Q().working>0||Q().waiting>0},get children(){var _=be();return t.insert(_,(()=>{var R=t.memo(()=>Q().working>0);return()=>R()?`${Q().working} working`:`${Q().waiting} waiting`})()),_}}),null),t.insert(F,()=>I.subtitle),T.addEventListener("change",_=>{v(I.role,_.currentTarget.value)}),t.insert(T,t.createComponent(l.Show,{get when(){return y(I.role).length===0},get children(){return he()}}),null),t.insert(T,t.createComponent(l.For,{get each(){return y(I.role)},children:_=>(()=>{var R=ve();return t.insert(R,()=>_.label),t.effect(()=>R.selected=_.spec===E()),t.effect(()=>R.value=_.spec),R})()}),null),t.effect(_=>{var R=ne(),se=`${I.title} model`;return R!==_.e&&(T.disabled=_.e=R),se!==_.t&&t.setAttribute(T,"aria-label",_.t=se),_},{e:void 0,t:void 0}),t.effect(()=>T.value=E()),J})()}})),B}}),null),c}})}var Ce=t.template("<div data-action=swarm-board.sidebarShow>"),_e=t.template("<div data-action=swarm-board.pillbarShow>"),xe=t.template("<div data-action=swarm-board.showWhenIdle>"),Ie=t.template("<div data-action=swarm-board.composerPill>"),ke=t.template("<div data-action=swarm-board.bottomStrip>"),Ae=t.template("<div data-action=swarm-board.withSidePanel>"),Be=t.template("<div data-action=swarm-board.toastEnabled>"),Pe=t.template("<div style=display:flex;gap:8px>"),Me=t.template("<div data-action=swarm-board.status>");function ze(e){const{SettingsLayout:u,SettingsSection:a,SettingsRow:C,Switch:h,Button:k}=e.ctx.ui;l.onMount(()=>{!e.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(e.target)}"]`)?.scrollIntoView({block:"start"})})});const D=()=>{const i=e.rpcStatus();if(i.state==="connected"){const m=e.activeSwarmCount();return`Connected to local.swarm-runtime (${m} swarm${m===1?"":"s"} recorded).`}return i.state==="unavailable"?"Server plugin (local.swarm-runtime) is not loaded for this workspace.":i.message?`RPC error: ${i.message}`:"Unable to reach local.swarm-runtime."};return t.createComponent(u,{title:"Swarm Board",get children(){return[t.createComponent(a,{title:"Surfaces",get children(){return[(()=>{var i=Ce();return t.insert(i,t.createComponent(C,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return t.createComponent(h,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return e.settings().sidebarShow},onChange:m=>e.updateSetting("sidebarShow",m)})}})),i})(),(()=>{var i=_e();return t.insert(i,t.createComponent(C,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return t.createComponent(h,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return e.settings().pillbarShow},onChange:m=>e.updateSetting("pillbarShow",m)})}})),i})(),(()=>{var i=xe();return t.insert(i,t.createComponent(C,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return t.createComponent(h,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return e.settings().showWhenIdle},onChange:m=>e.updateSetting("showWhenIdle",m)})}})),i})(),(()=>{var i=Ie();return t.insert(i,t.createComponent(C,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return t.createComponent(h,{label:"Show composer pill",hideLabel:!0,get checked(){return e.settings().composerPill},onChange:m=>e.updateSetting("composerPill",m)})}})),i})(),(()=>{var i=ke();return t.insert(i,t.createComponent(C,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return t.createComponent(h,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return e.settings().bottomStrip},onChange:m=>e.updateSetting("bottomStrip",m)})}})),i})(),(()=>{var i=Ae();return t.insert(i,t.createComponent(C,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return t.createComponent(h,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return e.settings().withSidePanel},onChange:m=>e.updateSetting("withSidePanel",m)})}})),i})()]}}),t.createComponent(a,{title:"Notifications",get children(){var i=Be();return t.insert(i,t.createComponent(C,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return t.createComponent(h,{label:"Event toasts",hideLabel:!0,get checked(){return e.settings().toastEnabled},onChange:m=>e.updateSetting("toastEnabled",m)})}})),i}}),t.createComponent(a,{title:"Plugin Status & Actions",get children(){var i=Me();return t.insert(i,t.createComponent(C,{title:"Swarm Runtime",get description(){return D()},get children(){var m=Pe();return t.insert(m,t.createComponent(k,{size:"small",variant:"ghost",get onClick(){return e.onRefresh},children:"Refresh"}),null),t.insert(m,t.createComponent(k,{size:"small",variant:"neutral",get onClick(){return e.onOpenPanel},children:"Open Swarm Board"}),null),m}})),i}})]}})}const de="swarm-board",ue=N.Schema.Struct({sidebarShow:N.Schema.Boolean,pillbarShow:N.Schema.Boolean,showWhenIdle:N.Schema.Boolean,composerPill:N.Schema.Boolean,bottomStrip:N.Schema.Boolean,withSidePanel:N.Schema.Boolean,toastEnabled:N.Schema.Boolean}),le={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0};function Ee(e){return(Array.isArray(e)?e:e&&typeof e=="object"&&Array.isArray(e.swarms)?e.swarms:[]).map(a=>({id:String(a.id??""),title:String(a.title??a.id??"Swarm"),status:String(a.status??"running"),activeCount:typeof a.activeCount=="number"?a.activeCount:void 0,waitingCount:typeof a.waitingCount=="number"?a.waitingCount:void 0,postCount:typeof a.postCount=="number"?a.postCount:typeof a.post_count=="number"?a.post_count:void 0,updatedAt:a.updatedAt??(typeof a.updated_at=="number"?new Date(a.updated_at).toISOString():void 0)}))}function Re(e){if(!e||typeof e!="object")return null;const u=e;if(typeof u.swarmId=="string"&&Array.isArray(u.posts))return u;const a=u.swarm;if(!a||typeof a!="object")return null;const C=Array.isArray(u.members)?u.members:[],h=Array.isArray(u.board_posts)?u.board_posts:Array.isArray(u.posts)?u.posts:[],k=Array.isArray(u.file_locks)?u.file_locks:Array.isArray(u.locks)?u.locks:[],D=C.map(r=>({handle:String(r.handle??r.name??""),role:typeof r.role=="string"?r.role:void 0,state:String(r.state??"waiting"),model:typeof r.model=="string"?r.model:void 0,variant:typeof r.variant=="string"?r.variant:void 0,trackStatus:typeof r.track_status=="string"?r.track_status:r.trackStatus,ownedGlobs:Array.isArray(r.owned_globs)?r.owned_globs:Array.isArray(r.ownedGlobs)?r.ownedGlobs:[],sessionId:typeof r.session_id=="string"?r.session_id:r.sessionId,session_id:typeof r.session_id=="string"?r.session_id:r.sessionId})),i=h.map(r=>({id:r.seq??r.id??0,seq:typeof r.seq=="number"?r.seq:void 0,author:String(r.author??""),body:String(r.body??""),createdAt:typeof r.created_at=="number"?new Date(r.created_at).toISOString():r.createdAt,created_at:typeof r.created_at=="number"?new Date(r.created_at).toISOString():r.created_at,mentions:Array.isArray(r.mentions)?r.mentions:[]})),m=k.map(r=>({glob:String(r.glob_pattern??r.glob??""),owner:String(r.owner_handle??r.owner??""),acquiredAt:typeof r.claimed_at=="number"?new Date(r.claimed_at).toISOString():r.acquiredAt})),q=C.some(r=>!!r.paused_quota),A=[...i].reverse().find(r=>r.author.replace(/^@/,"").toLowerCase()==="verifier"),x=A?/\bFAIL\b/i.test(A.body)?"FAIL":/\bPASS\b/i.test(A.body)?"PASS":void 0:void 0,g=[];for(const r of i)if(r.mentions&&r.mentions.length>0)for(const y of r.mentions)g.push({from:r.author,to:y.startsWith("@")?y:`@${y}`,summary:r.body.slice(0,80),at:r.createdAt});return{swarmId:String(a.id??""),title:String(a.title??a.id??"Swarm"),status:String(a.status??"running"),boardUrl:typeof u.boardUrl=="string"?u.boardUrl:void 0,pausedQuota:q,paused_quota:q,verifierStatus:x,members:D,posts:i,locks:m,handoffs:g}}var Le=t.template("<span>"),Oe=t.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),De=t.template("<div style=padding:12px>Loading Swarm Board...");const qe=l.lazy(()=>Promise.resolve().then(()=>Qe)),Ue=[{id:de,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"}],Te=O.Plugin.define({stores:{settings:O.Store.global(ue,le)},setup(e){const u=e.stores?.settings??e.storage.store("swarm.settings",{schema:ue,initial:le}),a=()=>u.value??le,C=(n,s)=>{u.set({...a(),[n]:s})},h=(n,s)=>{try{return e.add(n,s)}catch(o){return console.warn("[swarm-runtime] OpenCode did not accept a GUI item:",o),()=>{}}};h(O.Style,me);const[k,D]=l.createSignal([]),[i,m]=l.createSignal(null),[q,A]=l.createSignal(null),[x,g]=l.createSignal(null),[r,y]=l.createSignal(""),[d,v]=l.createSignal(void 0),[c,b]=l.createSignal({state:"connected"});let p=!1,$="",f=!1,M="",P=null,G=0,K=null,te;const re=()=>e.sessions.current()?.location?.directory??d(),B=()=>e.client.rpc(ce),I=()=>{const n=e.sessions.current()?.location??(d()?{directory:d()}:void 0),s=AbortSignal.timeout(8e3);return n?{location:n,signal:s}:{signal:s}},Q=n=>{if(!a().toastEnabled)return;const s=!!(n.pausedQuota??n.paused_quota);s&&!p&&e.toast.show({title:"Swarm paused on quota",description:n.title||n.swarmId,variant:"error"}),p=s;const o=(n.verifierStatus??"").toUpperCase();(o==="PASS"||o==="FAIL")&&o!==$&&e.toast.show({title:`@verifier ${o}`,description:n.title||n.swarmId,variant:o==="PASS"?"success":"error"}),$=o;const w=[...n.posts].reverse().find(S=>S.author.replace(/^@/,"").toLowerCase()==="monitor");n.stalled&&!f?e.toast.show({title:"@monitor stall nudge",description:w?.body??"Swarm appears stalled"}):w&&w.id!==P&&P!==null&&e.toast.show({title:"@monitor stall nudge",description:w.body}),f=!!n.stalled,w&&(P=w.id),n.status==="completed"&&M!==n.swarmId&&(M=n.swarmId,e.toast.show({title:"Swarm completed",description:n.title||n.swarmId,variant:"success"}))},E=async(n=!1)=>{const s=++G;try{const o=B(),w=I(),S=await o.listSwarms({},w);if(s!==G)return;const j=Ee(S);D(j);const L=j.find(ie=>ie.status==="running"||ie.status==="completing")??null;L&&(L.id!==K||n)?(K=L.id,A(null),m(L.id)):L||(K=null);const ae=i();ae&&!j.some(ie=>ie.id===ae)&&(m(null),A(null)),(!i()||L&&!q()&&i()!==L.id)&&m(L?.id??j[0]?.id??null);const ee=i(),oe=e.sessions.current()?.id,W=await o.getSwarmSnapshot(ee?{swarmId:ee}:oe?{sessionId:oe}:{},w);if(s!==G)return;W&&typeof W=="object"&&typeof W.boardUrl=="string"&&W.boardUrl&&y(W.boardUrl);const H=Re(W);g(H),b({state:"connected"}),H&&Q(H)}catch(o){if(s!==G)return;const w=typeof o=="object"&&o!==null&&"type"in o&&o.type==="rpc.unavailable";b(w?{state:"unavailable"}:{state:"error",message:o instanceof Error?o.message:String(o)})}};l.createEffect(()=>{const n=re();e.sessions.current()?.id,e.sessions.current()?.pending,i(),n!==te&&(te=n,K=null,A(null),m(null),g(null),D([])),E()});let ne=null,J;const X=()=>{if(ne!==e.client){J?.abort(),ne=e.client,J=new AbortController;try{e.client.rpc(ce).events.on("changed",()=>{E()},{signal:J.signal})}catch{}}};X(),l.createEffect(()=>{try{const n=e.servers;if(!n)return;const o=n.list().map(S=>n.get(S)).find(S=>S?.builtin)?.data;if(!o||typeof o.on!="function")return;const w=o.on("session.tool.success",()=>{E()});l.onCleanup(()=>w())}catch{}});const Z=setInterval(()=>{X(),E()},2e3);l.onCleanup(()=>{J?.abort(),clearInterval(Z)});const z=l.createMemo(()=>{const n=x();if(!n)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let s=0,o=0;for(const w of n.members){const S=w.state.toLowerCase();S==="working"||S==="active"?s++:(S==="waiting"||S==="idle")&&o++}return{active:s,waiting:o,posts:n.posts.length,paused:!!(n.pausedQuota??n.paused_quota),stalled:!!n.stalled}}),F=(n=!1)=>{if(!a().sidebarShow){e.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const s=e.sessions.current();if(!s){e.toast.show({title:"Open a session first to view the Swarm Board."});return}const o=`${e.id}:swarm`;if(n&&e.layout.state(o,s)==="visible"){e.layout.hide(o,s);return}e.layout.open(o,s)},T=()=>{e.layout.settings(de)},_=l.createMemo(()=>{const n=x(),s=z();return!!(n&&(s.active>0||n.status==="running"&&n.members.some(o=>o.state.toLowerCase()==="working")))}),R=()=>{e.dialogs.open(n=>t.createComponent($e,{ctx:e,snapshot:x,counts:z,isBuzzing:_,loadRoleConfig:async()=>{const s=i(),o=e.sessions.current()?.id;return await B().getRoleConfig(s?{swarmId:s}:o?{sessionId:o}:{},I())},onSetRoleModel:async(s,o)=>{const w=i(),S=e.sessions.current()?.id,j=await B().setRoleModel({role:s,model:o,...w?{swarmId:w}:{},...S?{sessionId:S}:{}},I());return E(),j},onOpenBoard:()=>F(!1),onClose:()=>n.close()}))};h(O.SettingsPage,()=>({id:de,title:"Swarm Board",icon:"dot-grid",entries:Ue,render:({target:n})=>t.createComponent(ze,{ctx:e,settings:a,updateSetting:C,rpcStatus:c,activeSwarmCount:()=>k().length,onOpenPanel:()=>F(!1),onRefresh:()=>{E()},target:n})})),h(O.TitlebarItem,()=>{if(!a().pillbarShow)return;const n=x();if(!n&&!a().showWhenIdle)return;const s=e.sessions.current(),o=s?e.layout.state(`${e.id}:swarm`,s)==="visible":!1,w=z(),S=w.paused||w.stalled?" ⚠":"";return{id:"swarm-open",label:_()?`🐝 Swarm: Buzzing (${w.active} active · ${w.posts} posts)${S}`:n?`🐝 Swarm: Dozing (${w.posts} posts)${S}`:"🐝 Swarm: Dozing",title:w.paused?"Swarm paused on quota — click to open Swarm Board":w.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:o,run:()=>F(!0)}}),h(O.ComposerPill,{id:"swarm-composer-pill",show(n){if(n.session.directory&&v(n.session.directory),!a().composerPill)return;const s=x();if(!s&&!a().showWhenIdle)return;const o=z(),w=(s?.verifierStatus??"").toUpperCase();let S;return o.paused||w==="FAIL"?S="danger":o.stalled&&(S="warning"),{label:_()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",...S?{tone:S}:{},title:"Click to configure Swarm role models or open Board",run:()=>R()}}}),h(O.Slot,{at:"window.bottom",render:()=>{const n=()=>{if(!a().bottomStrip)return!1;const s=e.sessions.current();return!(s?e.layout.state(`${e.id}:swarm`,s)==="visible":!1)||a().withSidePanel};return t.createComponent(l.Show,{get when(){return n()},get children(){var s=Oe(),o=s.firstChild,w=o.firstChild,S=w.nextSibling,j=S.nextSibling,L=j.nextSibling,ae=L.nextSibling,ee=ae.nextSibling,oe=ee.nextSibling,W=oe.nextSibling;return W.nextSibling,s.$$click=()=>F(!0),t.insert(o,()=>x()?.title??"Idle",S),t.insert(o,()=>z().active,L),t.insert(o,()=>z().waiting,ee),t.insert(o,()=>z().posts,W),t.insert(s,t.createComponent(l.Show,{get when(){return z().paused||z().stalled},get children(){var H=Le();return t.insert(H,()=>z().paused?"Paused on quota":"Stalled"),H}}),null),s}})}}),h(O.MenuItem,()=>{const n=e.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:n?e.layout.state(`${e.id}:swarm`,n)!=="closed":!1,run:()=>F(!1)}}),h(O.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>F(!1)})),h(O.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>T()}));const se={id:"swarm",title:"Swarm",pinned:!0};h(O.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return a().sidebarShow?[se]:[]},render(n){return n.session.directory&&v(n.session.directory),t.createComponent(l.Suspense,{get fallback(){return De()},get children(){return t.createComponent(qe,{ctx:e,snapshot:x,boardUrl:r,swarms:k,selectedSwarmId:i,sessionId:()=>n.session.id,onSelectSwarm:s=>{A(s),m(s)},onRefresh:()=>{E(!0)},onOpenSettings:T,rpcError:()=>{const s=c();if(s.state==="unavailable")return"Server plugin (local.swarm-runtime) is not loaded for this workspace.";if(s.state==="error")return s.message},onCompleteSwarm:async s=>{await B().completeSwarm({swarmId:s},I()),await E()},get server(){return n.session.server}})}})}})}});t.delegateEvents(["click"]);var je=t.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),We=t.template("<option>"),Fe=t.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),Ne=t.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),Ve=t.template("<option> (<!>)"),Ge=t.template("<div class=swarm-gui-empty>");function Ke(e){const{Button:u,Dialog:a}=e.ctx.ui,[C,h]=l.createSignal(0);let k;const D=l.createMemo(()=>e.snapshot()?.boardUrl||e.boardUrl?.()||""),i=l.createMemo(()=>e.selectedSwarmId()??e.snapshot()?.swarmId??""),m=l.createMemo(()=>{const g=D();if(!g)return"";const r=i(),y=e.sessionId?.()??"",d=C();try{const v=new URL(g);return r&&v.searchParams.set("swarmId",r),y&&v.searchParams.set("conversationId",y),d>0&&v.searchParams.set("_r",String(d)),v.toString()}catch{return g}}),q=l.createMemo(()=>{const g=m();if(!g)return"";try{return new URL(g).origin}catch{return""}}),A=()=>{const g=k?.contentWindow,r=q();if(!g||!r)return;const y=e.ctx.appearance.mode(),d=typeof document<"u"?getComputedStyle(document.documentElement):null,v=p=>d?.getPropertyValue(p).trim()||"",c={},b=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[p,$]of b){const f=v($);f&&(c[p]=f)}g.postMessage({type:"swarm:theme",mode:y,tokens:c},r)};if(l.createEffect(()=>{e.ctx.appearance.mode(),A()}),typeof window<"u"){const g=r=>{if(r.source!==k?.contentWindow)return;const y=q();if(y&&r.origin!==y)return;const d=r.data;if(d?.type==="swarm:open_session"&&typeof d.sessionID=="string"&&d.sessionID){const v=e.server,c=typeof v=="string"?v:v?.id??e.ctx.sessions.current()?.server.id;if(!c){e.ctx.toast.show({title:"No server context for member session"});return}e.ctx.tabs.open({server:c,id:d.sessionID},{focus:!0})}};window.addEventListener("message",g),l.onCleanup(()=>window.removeEventListener("message",g))}const x=()=>{const g=e.snapshot();g&&e.ctx.dialogs.open(r=>t.createComponent(a,{title:"Complete Swarm?",get children(){var y=je(),d=y.firstChild,v=d.firstChild,c=v.nextSibling,b=d.nextSibling;return t.insert(c,()=>g.title||g.swarmId),t.insert(b,t.createComponent(u,{variant:"ghost",onClick:()=>r.close(),children:"Cancel"}),null),t.insert(b,t.createComponent(u,{variant:"danger",onClick:async()=>{await e.onCompleteSwarm(g.swarmId),r.close()},children:"Complete Swarm"}),null),y}}))};return(()=>{var g=Ne(),r=g.firstChild,y=r.firstChild;return y.addEventListener("change",d=>e.onSelectSwarm(d.currentTarget.value)),t.insert(y,t.createComponent(l.Show,{get when(){return e.swarms().length===0},get children(){var d=We();return t.insert(d,()=>e.snapshot()?.title??"No active swarm"),t.effect(()=>d.value=e.snapshot()?.swarmId??""),d}}),null),t.insert(y,t.createComponent(l.For,{get each(){return e.swarms()},children:d=>(()=>{var v=Ve(),c=v.firstChild,b=c.nextSibling;return b.nextSibling,t.insert(v,()=>d.title||d.id,c),t.insert(v,()=>d.status,b),t.effect(()=>v.value=d.id),v})()}),null),t.insert(r,t.createComponent(u,{size:"small",variant:"ghost",onClick:()=>{e.onRefresh(),h(d=>d+1)},children:"Refresh"}),null),t.insert(r,t.createComponent(l.Show,{get when(){return e.snapshot()?.status==="running"},get children(){return t.createComponent(u,{size:"small",variant:"neutral",onClick:x,children:"Complete"})}}),null),t.insert(r,t.createComponent(l.Show,{get when(){return e.onOpenSettings},get children(){return t.createComponent(u,{size:"small",variant:"ghost",onClick:()=>e.onOpenSettings?.(),children:"Settings"})}}),null),t.insert(g,t.createComponent(l.Show,{get when(){return m()},get fallback(){return(()=>{var d=Ge();return t.insert(d,()=>e.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),d})()},get children(){var d=Fe();return d.addEventListener("load",()=>A()),t.use(v=>{k=v},d),t.effect(()=>t.setAttribute(d,"src",m())),d}}),null),t.effect(()=>y.value=i()),g})()}const Qe=Object.freeze(Object.defineProperty({__proto__:null,default:Ke},Symbol.toStringTag,{value:"Module"}));exports.default=Te;
