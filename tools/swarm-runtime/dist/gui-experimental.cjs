"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),P=require("@opencode/plugin/gui"),d=require("solid-js"),z=require("effect");function j(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function R(t){return{"~standard":{version:1,vendor:"swarm-runtime",validate(n){const s=t(n);return s?{issues:[{message:s}]}:{value:n}}}}}function W(t){return{"~standard":{version:1,vendor:"swarm-runtime",validate(n){const s=n===void 0?{}:n;if(!j(s))return{issues:[{message:"input must be an object"}]};const g=t(s);return g?{issues:[{message:g}]}:{value:s}}}}}const Z={id:"local.swarm-runtime",methods:{getBoardInfo:{input:W(()=>null),output:R(t=>j(t)&&typeof t.url=="string"&&typeof t.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:W(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:R(t=>j(t)&&Array.isArray(t.members)&&Array.isArray(t.board_posts)&&Array.isArray(t.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:W(t=>t.limit!==void 0&&typeof t.limit!="number"?"limit must be a number":null),output:R(t=>j(t)&&Array.isArray(t.swarms)?null:"output must contain swarms array")},completeSwarm:{input:W(t=>typeof t.swarmId=="string"?null:"swarmId must be a string"),output:R(t=>j(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:W(t=>typeof t.swarmId!="string"?"swarmId must be a string":typeof t.handle!="string"?"handle must be a string":null),output:R(t=>j(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")}},events:{changed:{schema:R(t=>j(t)&&typeof t.swarmId=="string"&&typeof t.reason=="string"?null:"event must contain swarmId and reason")}}},X=`
.swarm-gui-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: var(--surface-base, #111318);
  color: var(--text-base, #e5e7eb);
  font-size: 12px;
}

.swarm-gui-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-weak-base, rgba(255, 255, 255, 0.08));
  background: var(--surface-raised-base, rgba(255, 255, 255, 0.02));
}

.swarm-gui-select {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-weak-base, rgba(255, 255, 255, 0.12));
  background: var(--surface-base, #111318);
  color: inherit;
  font-size: 12px;
}

.swarm-gui-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.swarm-gui-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  border-bottom: 1px solid var(--border-weak-base, rgba(255, 255, 255, 0.06));
}

.swarm-gui-input {
  flex: 1;
  min-width: 0;
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-weak-base, rgba(255, 255, 255, 0.12));
  background: var(--surface-base, #111318);
  color: inherit;
  font-size: 12px;
}

.swarm-gui-post {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-weak-base, rgba(255, 255, 255, 0.08));
  background: var(--surface-raised-base, rgba(255, 255, 255, 0.03));
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.swarm-gui-post-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.swarm-gui-author {
  font-weight: 600;
  color: var(--text-strong, #f9fafb);
}

.swarm-gui-time {
  font-size: 11px;
  color: var(--text-weak, #9ca3af);
}

.swarm-gui-post-body {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.45;
}

.swarm-gui-mention {
  color: var(--icon-info-base, #60a5fa);
  font-weight: 600;
}

.swarm-gui-member {
  padding: 8px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-weak-base, rgba(255, 255, 255, 0.08));
  background: var(--surface-raised-base, rgba(255, 255, 255, 0.03));
  display: flex;
  flex-direction: column;
  gap: 6px;
  cursor: pointer;
}

.swarm-gui-member:hover {
  border-color: var(--border-strong-base, rgba(255, 255, 255, 0.2));
}

.swarm-gui-member-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.swarm-gui-dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  display: inline-block;
  flex-shrink: 0;
}

.swarm-gui-dot-working { background: var(--icon-success-base, #22c55e); }
.swarm-gui-dot-waiting { background: var(--icon-warning-base, #eab308); }
.swarm-gui-dot-paused { background: var(--icon-critical-base, #ef4444); }
.swarm-gui-dot-killed { background: var(--text-weak, #6b7280); }

.swarm-gui-meta {
  font-size: 11px;
  color: var(--text-weak, #9ca3af);
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.swarm-gui-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 11px;
}

.swarm-gui-table th,
.swarm-gui-table td {
  text-align: left;
  padding: 6px 8px;
  border-bottom: 1px solid var(--border-weak-base, rgba(255, 255, 255, 0.08));
}

.swarm-gui-bottom-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 12px;
  font-size: 11px;
  border-top: 1px solid var(--border-weak-base, rgba(255, 255, 255, 0.08));
  background: var(--surface-raised-base, rgba(255, 255, 255, 0.02));
  color: var(--text-weak, #9ca3af);
}

.swarm-gui-iframe {
  width: 100%;
  height: 100%;
  border: 0;
  flex: 1;
}
`;var ee=e.template("<div data-action=swarm-board.sidebarShow>"),te=e.template("<div data-action=swarm-board.pillbarShow>"),re=e.template("<div data-action=swarm-board.showWhenIdle>"),ae=e.template("<div data-action=swarm-board.composerPill>"),ne=e.template("<div data-action=swarm-board.bottomStrip>"),se=e.template("<div data-action=swarm-board.withSidePanel>"),ie=e.template("<div data-action=swarm-board.toastEnabled>"),oe=e.template("<div style=display:flex;gap:8px>"),le=e.template("<div data-action=swarm-board.status>");function de(t){const{SettingsLayout:n,SettingsSection:s,SettingsRow:g,Switch:f,Button:A}=t.ctx.ui;d.onMount(()=>{!t.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(t.target)}"]`)?.scrollIntoView({block:"start"})})});const M=()=>{const o=t.rpcStatus();if(o.state==="connected"){const h=t.activeSwarmCount();return`Connected to local.swarm-runtime (${h} swarm${h===1?"":"s"} recorded).`}return o.state==="unavailable"?"Server plugin (local.swarm-runtime) is not loaded for this workspace.":o.message?`RPC error: ${o.message}`:"Unable to reach local.swarm-runtime."};return e.createComponent(n,{title:"Swarm Board",get children(){return[e.createComponent(s,{title:"Surfaces",get children(){return[(()=>{var o=ee();return e.insert(o,e.createComponent(g,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent(f,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:h=>t.updateSetting("sidebarShow",h)})}})),o})(),(()=>{var o=te();return e.insert(o,e.createComponent(g,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent(f,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:h=>t.updateSetting("pillbarShow",h)})}})),o})(),(()=>{var o=re();return e.insert(o,e.createComponent(g,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return e.createComponent(f,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return t.settings().showWhenIdle},onChange:h=>t.updateSetting("showWhenIdle",h)})}})),o})(),(()=>{var o=ae();return e.insert(o,e.createComponent(g,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent(f,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:h=>t.updateSetting("composerPill",h)})}})),o})(),(()=>{var o=ne();return e.insert(o,e.createComponent(g,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent(f,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:h=>t.updateSetting("bottomStrip",h)})}})),o})(),(()=>{var o=se();return e.insert(o,e.createComponent(g,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent(f,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:h=>t.updateSetting("withSidePanel",h)})}})),o})()]}}),e.createComponent(s,{title:"Notifications",get children(){var o=ie();return e.insert(o,e.createComponent(g,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent(f,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:h=>t.updateSetting("toastEnabled",h)})}})),o}}),e.createComponent(s,{title:"Plugin Status & Actions",get children(){var o=le();return e.insert(o,e.createComponent(g,{title:"Swarm Runtime",get description(){return M()},get children(){var h=oe();return e.insert(h,e.createComponent(A,{size:"small",variant:"ghost",get onClick(){return t.onRefresh},children:"Refresh"}),null),e.insert(h,e.createComponent(A,{size:"small",variant:"neutral",get onClick(){return t.onOpenPanel},children:"Open Swarm Board"}),null),h}})),o}})]}})}const G="swarm-board",H=z.Schema.Struct({sidebarShow:z.Schema.Boolean,pillbarShow:z.Schema.Boolean,showWhenIdle:z.Schema.Boolean,composerPill:z.Schema.Boolean,bottomStrip:z.Schema.Boolean,withSidePanel:z.Schema.Boolean,toastEnabled:z.Schema.Boolean}),V={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0};function ce(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(s=>({id:String(s.id??""),title:String(s.title??s.id??"Swarm"),status:String(s.status??"running"),activeCount:typeof s.activeCount=="number"?s.activeCount:void 0,waitingCount:typeof s.waitingCount=="number"?s.waitingCount:void 0,postCount:typeof s.postCount=="number"?s.postCount:typeof s.post_count=="number"?s.post_count:void 0,updatedAt:s.updatedAt??(typeof s.updated_at=="number"?new Date(s.updated_at).toISOString():void 0)}))}function ue(t){if(!t||typeof t!="object")return null;const n=t;if(typeof n.swarmId=="string"&&Array.isArray(n.posts))return n;const s=n.swarm;if(!s||typeof s!="object")return null;const g=Array.isArray(n.members)?n.members:[],f=Array.isArray(n.board_posts)?n.board_posts:Array.isArray(n.posts)?n.posts:[],A=Array.isArray(n.file_locks)?n.file_locks:Array.isArray(n.locks)?n.locks:[],M=g.map(a=>({handle:String(a.handle??a.name??""),role:typeof a.role=="string"?a.role:void 0,state:String(a.state??"waiting"),model:typeof a.model=="string"?a.model:void 0,variant:typeof a.variant=="string"?a.variant:void 0,trackStatus:typeof a.track_status=="string"?a.track_status:a.trackStatus,ownedGlobs:Array.isArray(a.owned_globs)?a.owned_globs:Array.isArray(a.ownedGlobs)?a.ownedGlobs:[],sessionId:typeof a.session_id=="string"?a.session_id:a.sessionId,session_id:typeof a.session_id=="string"?a.session_id:a.sessionId})),o=f.map(a=>({id:a.seq??a.id??0,seq:typeof a.seq=="number"?a.seq:void 0,author:String(a.author??""),body:String(a.body??""),createdAt:typeof a.created_at=="number"?new Date(a.created_at).toISOString():a.createdAt,created_at:typeof a.created_at=="number"?new Date(a.created_at).toISOString():a.created_at,mentions:Array.isArray(a.mentions)?a.mentions:[]})),h=A.map(a=>({glob:String(a.glob_pattern??a.glob??""),owner:String(a.owner_handle??a.owner??""),acquiredAt:typeof a.claimed_at=="number"?new Date(a.claimed_at).toISOString():a.acquiredAt})),I=g.some(a=>!!a.paused_quota),q=[...o].reverse().find(a=>a.author.replace(/^@/,"").toLowerCase()==="verifier"),B=q?/\bFAIL\b/i.test(q.body)?"FAIL":/\bPASS\b/i.test(q.body)?"PASS":void 0:void 0,L=[];for(const a of o)if(a.mentions&&a.mentions.length>0)for(const E of a.mentions)L.push({from:a.author,to:E.startsWith("@")?E:`@${E}`,summary:a.body.slice(0,80),at:a.createdAt});return{swarmId:String(s.id??""),title:String(s.title??s.id??"Swarm"),status:String(s.status??"running"),boardUrl:typeof n.boardUrl=="string"?n.boardUrl:void 0,pausedQuota:I,paused_quota:I,verifierStatus:B,members:M,posts:o,locks:h,handoffs:L}}var me=e.template("<span>"),pe=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),we=e.template("<div style=padding:12px>Loading Swarm Board...");const ge=d.lazy(()=>Promise.resolve().then(()=>We)),he=[{id:G,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"}],be=P.Plugin.define({stores:{settings:P.Store.global(H,V)},setup(t){const n=t.stores?.settings??t.storage.store("swarm.settings",{schema:H,initial:V}),s=()=>n.value??V,g=(r,i)=>{n.set({...s(),[r]:i})},f=(r,i)=>{try{return t.add(r,i)}catch(l){return console.warn("[swarm-runtime] OpenCode did not accept a GUI item:",l),()=>{}}};f(P.Style,X);const[A,M]=d.createSignal([]),[o,h]=d.createSignal(null),[I,q]=d.createSignal(null),[B,L]=d.createSignal({state:"connected"});let a=!1,E="",D=!1,b="",v=null;const S=()=>t.client.rpc(Z),m=()=>{const r=t.sessions.current()?.location;return r?{location:r}:{}},$=r=>{if(!s().toastEnabled)return;const i=!!(r.pausedQuota??r.paused_quota);i&&!a&&t.toast.show({title:"Swarm paused on quota",description:r.title||r.swarmId,variant:"error"}),a=i;const l=(r.verifierStatus??"").toUpperCase();(l==="PASS"||l==="FAIL")&&l!==E&&t.toast.show({title:`@verifier ${l}`,description:r.title||r.swarmId,variant:l==="PASS"?"success":"error"}),E=l;const w=[...r.posts].reverse().find(u=>u.author.replace(/^@/,"").toLowerCase()==="monitor");r.stalled&&!D?t.toast.show({title:"@monitor stall nudge",description:w?.body??"Swarm appears stalled"}):w&&w.id!==v&&v!==null&&t.toast.show({title:"@monitor stall nudge",description:w.body}),D=!!r.stalled,w&&(v=w.id),r.status==="completed"&&b!==r.swarmId&&(b=r.swarmId,t.toast.show({title:"Swarm completed",description:r.title||r.swarmId,variant:"success"}))},c=async()=>{try{const r=S(),i=m(),l=await r.listSwarms({},i),w=ce(l);M(w),w.length>0&&!o()&&h(w[0].id);const u=o(),T=t.sessions.current()?.id,O=await r.getSwarmSnapshot(u?{swarmId:u}:T?{sessionId:T}:{},i),F=ue(O);q(F),L({state:"connected"}),F&&$(F)}catch(r){const i=typeof r=="object"&&r!==null&&"type"in r&&r.type==="rpc.unavailable";L(i?{state:"unavailable"}:{state:"error",message:r instanceof Error?r.message:String(r)})}};d.createEffect(()=>{o(),t.sessions.current()?.id,c()});const p=new AbortController;try{S().events.on("changed",()=>{c()},{signal:p.signal})}catch{}const C=setInterval(()=>{c()},4e3);d.onCleanup(()=>{p.abort(),clearInterval(C)});const y=d.createMemo(()=>{const r=I();if(!r)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let i=0,l=0;for(const w of r.members){const u=w.state.toLowerCase();u==="working"||u==="active"?i++:(u==="waiting"||u==="idle")&&l++}return{active:i,waiting:l,posts:r.posts.length,paused:!!(r.pausedQuota??r.paused_quota),stalled:!!r.stalled}}),_=(r=!1)=>{if(!s().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const i=t.sessions.current();if(!i){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const l=`${t.id}:swarm`;if(r&&t.layout.state(l,i)==="visible"){t.layout.hide(l,i);return}t.layout.open(l,i)},x=()=>{t.layout.settings(G)};f(P.SettingsPage,()=>({id:G,title:"Swarm Board",icon:"dot-grid",entries:he,render:({target:r})=>e.createComponent(de,{ctx:t,settings:s,updateSetting:g,rpcStatus:B,activeSwarmCount:()=>A().length,onOpenPanel:()=>_(!1),onRefresh:()=>{c()},target:r})})),f(P.TitlebarItem,()=>{if(!s().pillbarShow)return;const r=I();if(!r&&!s().showWhenIdle)return;const i=t.sessions.current(),l=i?t.layout.state(`${t.id}:swarm`,i)==="visible":!1,w=y(),u=w.paused||w.stalled?" ⚠":"";return{id:"swarm-open",icon:w.paused||w.stalled?"warning":"dot-grid",label:r?`Swarm: ${w.active} active · ${w.waiting} waiting · ${w.posts} posts${u}`:"Swarm: Idle",title:w.paused?"Swarm paused on quota — click to open Swarm Board":w.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:l,run:()=>_(!0)}}),f(P.ComposerPill,{id:"swarm-composer-pill",show(){if(!s().composerPill)return;const r=I();if(!r)return;const i=y(),l=r.members.filter(O=>["working","active"].includes(O.state.toLowerCase())).map(O=>`@${O.handle.replace(/^@/,"")}`),w=(r.verifierStatus??"").toUpperCase();let u="success";return i.paused||w==="FAIL"?u="danger":i.stalled&&(u="warning"),{icon:"dot-grid",label:l.length>0?`${l.slice(0,3).join(", ")}${l.length>3?` +${l.length-3}`:""}`:w?`Verifier: ${w}`:`Swarm: ${r.status}`,tone:u,run:()=>_(!1)}}}),f(P.Slot,{at:"window.bottom",render:()=>{const r=()=>{if(!s().bottomStrip)return!1;const i=t.sessions.current();return!(i?t.layout.state(`${t.id}:swarm`,i)==="visible":!1)||s().withSidePanel};return e.createComponent(d.Show,{get when(){return r()},get children(){var i=pe(),l=i.firstChild,w=l.firstChild,u=w.nextSibling,T=u.nextSibling,O=T.nextSibling,F=O.nextSibling,U=F.nextSibling,Y=U.nextSibling,K=Y.nextSibling;return K.nextSibling,i.$$click=()=>_(!0),e.insert(l,()=>I()?.title??"Idle",u),e.insert(l,()=>y().active,O),e.insert(l,()=>y().waiting,U),e.insert(l,()=>y().posts,K),e.insert(i,e.createComponent(d.Show,{get when(){return y().paused||y().stalled},get children(){var N=me();return e.insert(N,()=>y().paused?"Paused on quota":"Stalled"),N}}),null),i}})}}),f(P.MenuItem,()=>{const r=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:r?t.layout.state(`${t.id}:swarm`,r)!=="closed":!1,run:()=>_(!1)}}),f(P.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>_(!1)})),f(P.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>x()}));const k={id:"swarm",title:"Swarm",pinned:!0};f(P.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return s().sidebarShow?[k]:[]},render(r){return e.createComponent(d.Suspense,{get fallback(){return we()},get children(){return e.createComponent(ge,{ctx:t,snapshot:I,swarms:A,selectedSwarmId:o,onSelectSwarm:i=>h(i),onRefresh:()=>{c()},onOpenSettings:x,rpcError:()=>{const i=B();if(i.state==="unavailable")return"Server plugin (local.swarm-runtime) is not loaded for this workspace.";if(i.state==="error")return i.message},onKillMember:async(i,l)=>{await S().killMember({swarmId:i,handle:l},m()),await c()},onCompleteSwarm:async i=>{await S().completeSwarm({swarmId:i},m()),await c()},get server(){return r.session.server}})}})}})}});e.delegateEvents(["click"]);var fe=e.template("<span class=swarm-gui-mention>"),J=e.template("<span>"),Se=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>This permanently terminates <strong></strong> and releases its locks.</div><div style=display:flex;justify-content:flex-end;gap:8px>'),ve=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),ye=e.template("<option>"),_e=e.template('<div style="padding:8px 12px;font-size:11px;color:var(--text-weak, #9ca3af);border-bottom:1px solid var(--border-weak-base, rgba(255, 255, 255, 0.06))">'),Ce=e.template('<div class=swarm-gui-toolbar><input class=swarm-gui-input type=text placeholder="Filter by @handle or text...">'),Q=e.template("<div class=swarm-gui-scroll>"),$e=e.template("<div class=swarm-gui-toolbar style=justify-content:space-between><span>Click a member to open its session"),xe=e.template("<div style=margin-top:8px;font-weight:600>Mention / Handoff Flow"),ke=e.template("<div class=swarm-gui-scroll><table class=swarm-gui-table><thead><tr><th>Glob</th><th>Owner</th></tr></thead><tbody>"),Ie=e.template("<div style=display:flex;flex-direction:column;flex:1;min-height:0><div class=swarm-gui-toolbar>"),Ae=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),Pe=e.template("<option> (<!>)"),Be=e.template('<iframe class=swarm-gui-iframe title="Swarm Board Web View">'),Le=e.template("<div class=swarm-gui-post><div class=swarm-gui-post-head><span class=swarm-gui-author>@</span><span class=swarm-gui-time></span></div><div class=swarm-gui-post-body>"),Ee=e.template("<span>· "),Oe=e.template("<div class=swarm-gui-meta>Owns: "),ze=e.template("<div class=swarm-gui-member><div class=swarm-gui-member-head><div style=display:flex;align-items:center;gap:8px><span></span><span class=swarm-gui-author>@</span><span class=swarm-gui-time>[<!>]</span></div></div><div class=swarm-gui-meta>"),Me=e.template("<tr><td></td><td>@"),qe=e.template("<span>(<!>)"),Te=e.template("<div class=swarm-gui-meta><span>@</span><span>→</span><span>@");function je(t){const n=t.split(/(@[a-zA-Z0-9_-]+)/g);return e.createComponent(d.For,{each:n,children:s=>s.startsWith("@")?(()=>{var g=fe();return e.insert(g,s),g})():(()=>{var g=J();return e.insert(g,s),g})()})}function Re(t){const n=t.toLowerCase();return n==="working"||n==="active"?"swarm-gui-dot swarm-gui-dot-working":n==="waiting"||n==="idle"?"swarm-gui-dot swarm-gui-dot-waiting":n.includes("paused")||n.includes("quota")||n==="stalled"?"swarm-gui-dot swarm-gui-dot-paused":"swarm-gui-dot swarm-gui-dot-killed"}function Fe(t){const{Button:n,Dialog:s}=t.ctx.ui,[g,f]=d.createSignal("board"),[A,M]=d.createSignal(!1),[o,h]=d.createSignal(""),[I,q]=d.createSignal(!0);let B;const L=d.createMemo(()=>{const b=t.snapshot();if(!b)return[];const v=o().trim().toLowerCase();return v?b.posts.filter(S=>S.author.toLowerCase().includes(v)||S.body.toLowerCase().includes(v)||(S.mentions??[]).some(m=>m.toLowerCase().includes(v))):b.posts});d.createEffect(()=>{L(),I()&&B&&(B.scrollTop=B.scrollHeight)});const a=b=>{const v=b.session_id??b.sessionId;if(!v){t.ctx.toast.show({title:`No session linked for ${b.handle}`});return}const S=b.server??t.server;if(!S){t.ctx.toast.show({title:`No server context for ${b.handle}`});return}t.ctx.tabs.open({server:S,id:v},{focus:!0})},E=(b,v)=>{v.stopPropagation();const S=t.snapshot()?.swarmId;S&&t.ctx.dialogs.open(m=>e.createComponent(s,{get title(){return`Kill ${b.handle}?`},get children(){var $=Se(),c=$.firstChild,p=c.firstChild,C=p.nextSibling,y=c.nextSibling;return e.insert(C,()=>b.handle),e.insert(y,e.createComponent(n,{variant:"ghost",onClick:()=>m.close(),children:"Cancel"}),null),e.insert(y,e.createComponent(n,{variant:"danger",onClick:async()=>{await t.onKillMember(S,b.handle),m.close()},children:"Kill Member"}),null),$}}))},D=()=>{const b=t.snapshot();b&&t.ctx.dialogs.open(v=>e.createComponent(s,{title:"Complete Swarm?",get children(){var S=ve(),m=S.firstChild,$=m.firstChild,c=$.nextSibling,p=m.nextSibling;return e.insert(c,()=>b.title||b.swarmId),e.insert(p,e.createComponent(n,{variant:"ghost",onClick:()=>v.close(),children:"Cancel"}),null),e.insert(p,e.createComponent(n,{variant:"danger",onClick:async()=>{await t.onCompleteSwarm(b.swarmId),v.close()},children:"Complete Swarm"}),null),S}}))};return(()=>{var b=Ae(),v=b.firstChild,S=v.firstChild;return S.addEventListener("change",m=>t.onSelectSwarm(m.currentTarget.value)),e.insert(S,e.createComponent(d.Show,{get when(){return t.swarms().length===0},get children(){var m=ye();return e.insert(m,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>m.value=t.snapshot()?.swarmId??""),m}}),null),e.insert(S,e.createComponent(d.For,{get each(){return t.swarms()},children:m=>(()=>{var $=Pe(),c=$.firstChild,p=c.nextSibling;return p.nextSibling,e.insert($,()=>m.title||m.id,c),e.insert($,()=>m.status,p),e.effect(()=>$.value=m.id),$})()}),null),e.insert(v,e.createComponent(n,{size:"small",variant:"ghost",onClick:()=>t.onRefresh(),children:"Refresh"}),null),e.insert(v,e.createComponent(d.Show,{get when(){return t.onOpenSettings},get children(){return e.createComponent(n,{size:"small",variant:"ghost",onClick:()=>t.onOpenSettings?.(),children:"Settings"})}}),null),e.insert(v,e.createComponent(d.Show,{get when(){return t.snapshot()?.boardUrl},get children(){return e.createComponent(n,{size:"small",get variant(){return A()?"contrast":"ghost"},onClick:()=>M(!A()),children:"Pixel-Bee Web View"})}}),null),e.insert(b,e.createComponent(d.Show,{get when(){return!t.snapshot()},get children(){var m=_e();return e.insert(m,()=>t.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),m}}),null),e.insert(b,e.createComponent(d.Show,{get when(){return!A()||!t.snapshot()?.boardUrl},get fallback(){return(()=>{var m=Be();return e.effect(()=>e.setAttribute(m,"src",t.snapshot()?.boardUrl)),m})()},get children(){var m=Ie(),$=m.firstChild;return e.insert($,e.createComponent(n,{size:"small",get variant(){return g()==="board"?"contrast":"ghost"},onClick:()=>f("board"),get children(){return["Board (",e.memo(()=>t.snapshot()?.posts.length??0),")"]}}),null),e.insert($,e.createComponent(n,{size:"small",get variant(){return g()==="members"?"contrast":"ghost"},onClick:()=>f("members"),get children(){return["Members (",e.memo(()=>t.snapshot()?.members.length??0),")"]}}),null),e.insert($,e.createComponent(n,{size:"small",get variant(){return g()==="locks"?"contrast":"ghost"},onClick:()=>f("locks"),get children(){return["Locks / Graph (",e.memo(()=>t.snapshot()?.locks.length??0),")"]}}),null),e.insert(m,e.createComponent(d.Show,{get when(){return g()==="board"},get children(){return[(()=>{var c=Ce(),p=c.firstChild;return p.$$input=C=>h(C.currentTarget.value),e.insert(c,e.createComponent(n,{size:"small",get variant(){return I()?"neutral":"ghost"},onClick:()=>q(!I()),get children(){return I()?"Auto-scroll: On":"Auto-scroll: Off"}}),null),e.effect(()=>p.value=o()),c})(),(()=>{var c=Q(),p=B;return typeof p=="function"?e.use(p,c):B=c,e.insert(c,e.createComponent(d.For,{get each(){return L()},children:C=>(()=>{var y=Le(),_=y.firstChild,x=_.firstChild;x.firstChild;var k=x.nextSibling,r=_.nextSibling;return e.insert(x,()=>C.author.replace(/^@/,""),null),e.insert(k,()=>C.createdAt??C.created_at??""),e.insert(r,()=>je(C.body)),y})()})),c})()]}}),null),e.insert(m,e.createComponent(d.Show,{get when(){return g()==="members"},get children(){return[(()=>{var c=$e();return c.firstChild,e.insert(c,e.createComponent(d.Show,{get when(){return t.snapshot()?.status!=="completed"},get children(){return e.createComponent(n,{size:"small",variant:"neutral",onClick:D,children:"Complete Swarm"})}}),null),c})(),(()=>{var c=Q();return e.insert(c,e.createComponent(d.For,{get each(){return t.snapshot()?.members??[]},children:p=>(()=>{var C=ze(),y=C.firstChild,_=y.firstChild,x=_.firstChild,k=x.nextSibling;k.firstChild;var r=k.nextSibling,i=r.firstChild,l=i.nextSibling;l.nextSibling;var w=y.nextSibling;return C.$$click=()=>a(p),e.insert(k,()=>p.handle.replace(/^@/,""),null),e.insert(r,()=>p.state,l),e.insert(y,e.createComponent(d.Show,{get when(){return e.memo(()=>p.handle!=="coordinator")()&&p.state!=="killed"},get children(){return e.createComponent(n,{size:"small",variant:"ghost",onClick:u=>E(p,u),children:"Kill"})}}),null),e.insert(w,e.createComponent(d.Show,{get when(){return p.model},get children(){var u=J();return e.insert(u,()=>p.model,null),e.insert(u,(()=>{var T=e.memo(()=>!!p.variant);return()=>T()?` (${p.variant})`:""})(),null),u}}),null),e.insert(w,e.createComponent(d.Show,{get when(){return p.trackStatus},get children(){var u=Ee();return u.firstChild,e.insert(u,()=>p.trackStatus,null),u}}),null),e.insert(C,e.createComponent(d.Show,{get when(){return(p.ownedGlobs??[]).length>0},get children(){var u=Oe();return u.firstChild,e.insert(u,()=>(p.ownedGlobs??[]).join(", "),null),u}}),null),e.effect(()=>e.className(x,Re(p.state))),C})()})),c})()]}}),null),e.insert(m,e.createComponent(d.Show,{get when(){return g()==="locks"},get children(){var c=ke(),p=c.firstChild,C=p.firstChild,y=C.nextSibling;return e.insert(y,e.createComponent(d.For,{get each(){return t.snapshot()?.locks??[]},children:_=>(()=>{var x=Me(),k=x.firstChild,r=k.nextSibling;return r.firstChild,e.insert(k,()=>_.glob),e.insert(r,()=>_.owner.replace(/^@/,""),null),x})()})),e.insert(c,e.createComponent(d.Show,{get when(){return(t.snapshot()?.handoffs??[]).length>0},get children(){return[xe(),e.createComponent(d.For,{get each(){return t.snapshot()?.handoffs??[]},children:_=>(()=>{var x=Te(),k=x.firstChild;k.firstChild;var r=k.nextSibling,i=r.nextSibling;return i.firstChild,e.insert(k,()=>_.from.replace(/^@/,""),null),e.insert(i,()=>_.to.replace(/^@/,""),null),e.insert(x,e.createComponent(d.Show,{get when(){return _.summary},get children(){var l=qe(),w=l.firstChild,u=w.nextSibling;return u.nextSibling,e.insert(l,()=>_.summary,u),l}}),null),x})()})]}}),null),c}}),null),m}}),null),e.effect(()=>S.value=t.selectedSwarmId()??t.snapshot()?.swarmId??""),b})()}e.delegateEvents(["input","click"]);const We=Object.freeze(Object.defineProperty({__proto__:null,default:Fe},Symbol.toStringTag,{value:"Module"}));exports.default=be;
