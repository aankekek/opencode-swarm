"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),P=require("@opencode/plugin/gui"),l=require("solid-js"),O=require("effect"),H=`
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
`;function Q(t){const{SettingsLayout:i,SettingsSection:o,SettingsRow:g,Switch:$}=t.ctx.ui;return e.createComponent(i,{title:"Swarm Board",get children(){return[e.createComponent(o,{title:"Surfaces",get children(){return[e.createComponent(g,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent($,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:S=>t.updateSetting("sidebarShow",S)})}}),e.createComponent(g,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent($,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:S=>t.updateSetting("pillbarShow",S)})}}),e.createComponent(g,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent($,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:S=>t.updateSetting("composerPill",S)})}}),e.createComponent(g,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent($,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:S=>t.updateSetting("bottomStrip",S)})}}),e.createComponent(g,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent($,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:S=>t.updateSetting("withSidePanel",S)})}})]}}),e.createComponent(o,{title:"Notifications",get children(){return e.createComponent(g,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent($,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:S=>t.updateSetting("toastEnabled",S)})}})}})]}})}const J=O.Schema.Struct({sidebarShow:O.Schema.Boolean,pillbarShow:O.Schema.Boolean,composerPill:O.Schema.Boolean,bottomStrip:O.Schema.Boolean,withSidePanel:O.Schema.Boolean,toastEnabled:O.Schema.Boolean}),U={sidebarShow:!0,pillbarShow:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0};function Y(t){return!t||typeof t!="object"?null:"output"in t?t.output:t}function Z(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(o=>({id:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),activeCount:typeof o.activeCount=="number"?o.activeCount:void 0,waitingCount:typeof o.waitingCount=="number"?o.waitingCount:void 0,postCount:typeof o.postCount=="number"?o.postCount:typeof o.post_count=="number"?o.post_count:void 0,updatedAt:o.updatedAt??(typeof o.updated_at=="number"?new Date(o.updated_at).toISOString():void 0)}))}function X(t){if(!t||typeof t!="object")return null;const i=t;if(typeof i.swarmId=="string"&&Array.isArray(i.posts))return i;const o=i.swarm;if(!o||typeof o!="object")return null;const g=Array.isArray(i.members)?i.members:[],$=Array.isArray(i.board_posts)?i.board_posts:Array.isArray(i.posts)?i.posts:[],S=Array.isArray(i.file_locks)?i.file_locks:Array.isArray(i.locks)?i.locks:[],L=g.map(n=>({handle:String(n.handle??n.name??""),role:typeof n.role=="string"?n.role:void 0,state:String(n.state??"waiting"),model:typeof n.model=="string"?n.model:void 0,variant:typeof n.variant=="string"?n.variant:void 0,trackStatus:typeof n.track_status=="string"?n.track_status:n.trackStatus,ownedGlobs:Array.isArray(n.owned_globs)?n.owned_globs:Array.isArray(n.ownedGlobs)?n.ownedGlobs:[],sessionId:typeof n.session_id=="string"?n.session_id:n.sessionId,session_id:typeof n.session_id=="string"?n.session_id:n.sessionId})),k=$.map(n=>({id:n.seq??n.id??0,seq:typeof n.seq=="number"?n.seq:void 0,author:String(n.author??""),body:String(n.body??""),createdAt:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.createdAt,created_at:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.created_at,mentions:Array.isArray(n.mentions)?n.mentions:[]})),B=S.map(n=>({glob:String(n.glob_pattern??n.glob??""),owner:String(n.owner_handle??n.owner??""),acquiredAt:typeof n.claimed_at=="number"?new Date(n.claimed_at).toISOString():n.acquiredAt})),A=g.some(n=>!!n.paused_quota),M=[...k].reverse().find(n=>n.author.replace(/^@/,"").toLowerCase()==="verifier"),I=M?/\bFAIL\b/i.test(M.body)?"FAIL":/\bPASS\b/i.test(M.body)?"PASS":void 0:void 0,q=[];for(const n of k)if(n.mentions&&n.mentions.length>0)for(const z of n.mentions)q.push({from:n.author,to:z.startsWith("@")?z:`@${z}`,summary:n.body.slice(0,80),at:n.createdAt});return{swarmId:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),boardUrl:typeof i.boardUrl=="string"?i.boardUrl:void 0,pausedQuota:A,paused_quota:A,verifierStatus:I,members:L,posts:k,locks:B,handoffs:q}}var ee=e.template("<span>"),te=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),re=e.template("<div style=padding:12px>Loading Swarm Board...");const ne=l.lazy(()=>Promise.resolve().then(()=>Ae)),ae=P.Plugin.define({setup(t){const i=t.storage.store("swarm.settings",{schema:J,initial:U}),o=()=>i.value??U,g=(r,s)=>{i.set({...o(),[r]:s})};t.add(P.Style,()=>H);const[$,S]=l.createSignal([]),[L,k]=l.createSignal(null),[B,A]=l.createSignal(null),[M,I]=l.createSignal(new Set);let q=!1,n="",z=!1,F="",p=null;const v=(r,s)=>{I(a=>{const c=new Set(a);return s?c.add(r):c.delete(r),c})},h=async(r,s={})=>{const a=t.sessions.current();if(!a)return null;const c=await a.server.client.rpc.call({rpcID:"local.swarm-runtime",method:r,location:a.location,input:s});return Y(c)},u=r=>{if(!o().toastEnabled)return;const s=!!(r.pausedQuota??r.paused_quota);s&&!q&&t.toast.show({title:"Swarm paused on quota",description:r.title||r.swarmId,variant:"error"}),q=s;const a=(r.verifierStatus??"").toUpperCase();(a==="PASS"||a==="FAIL")&&a!==n&&t.toast.show({title:`@verifier ${a}`,description:r.title||r.swarmId,variant:a==="PASS"?"success":"error"}),n=a;const c=[...r.posts].reverse().find(w=>w.author.replace(/^@/,"").toLowerCase()==="monitor");r.stalled&&!z?t.toast.show({title:"@monitor stall nudge",description:c?.body??"Swarm appears stalled"}):c&&c.id!==p&&p!==null&&t.toast.show({title:"@monitor stall nudge",description:c.body}),z=!!r.stalled,c&&(p=c.id),r.status==="completed"&&F!==r.swarmId&&(F=r.swarmId,t.toast.show({title:"Swarm completed",description:r.title||r.swarmId,variant:"success"}))},b=async()=>{try{const r=await h("listSwarms"),s=Z(r);s.length>0&&(S(s),L()||k(s[0].id));const a=L(),c=t.sessions.current()?.id,w=await h("getSwarmSnapshot",a?{swarmId:a}:c?{sessionId:c}:{}),y=X(w);y&&(A(y),u(y))}catch{}};l.createEffect(()=>{L(),t.sessions.current()?.id,b()});const m=t.events?.on?.("rpc.local.swarm-runtime.changed",()=>{b()}),d=setInterval(()=>{b()},4e3);l.onCleanup(()=>{m?.(),clearInterval(d)});const _=l.createMemo(()=>{const r=B();if(!r)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let s=0,a=0;for(const c of r.members){const w=c.state.toLowerCase();w==="working"||w==="active"?s++:(w==="waiting"||w==="idle")&&a++}return{active:s,waiting:a,posts:r.posts.length,paused:!!(r.pausedQuota??r.paused_quota),stalled:!!r.stalled}}),C=(r=!1)=>{if(!o().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const s=t.sessions.current();if(!s){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const a=`${t.id}:swarm`;if(r&&t.layout.state(a,s)==="visible"){t.layout.hide(a,s);return}v(s.key,!0),t.layout.open(a,s)};t.add(P.SettingsPage,()=>({id:"swarm-board",title:"Swarm Board",render:()=>e.createComponent(Q,{ctx:t,settings:o,updateSetting:g})})),t.add(P.TitlebarItem,()=>{if(!o().pillbarShow)return;const r=t.sessions.current(),s=r?t.layout.state(`${t.id}:swarm`,r)==="visible":!1,a=_(),c=a.paused||a.stalled?" ⚠":"";return{id:"swarm-open",label:`Swarm: ${a.active} active · ${a.waiting} waiting · ${a.posts} posts${c}`,title:a.paused?"Swarm paused on quota — click to open Swarm Board":a.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:s,run:()=>C(!0)}}),t.add(P.ComposerPill,()=>{if(!o().composerPill)return;const r=B();if(!r)return;const s=_(),a=r.members.filter(f=>["working","active"].includes(f.state.toLowerCase())).map(f=>`@${f.handle.replace(/^@/,"")}`),c=(r.verifierStatus??"").toUpperCase();let w="success";s.paused||c==="FAIL"?w="danger":s.stalled&&(w="warning");const y=a.length>0?`${a.slice(0,3).join(", ")}${a.length>3?` +${a.length-3}`:""}`:c?`Verifier: ${c}`:`Swarm: ${r.status}`;return{id:"swarm-composer-pill",show:()=>({label:y,tone:w,run:()=>C(!1)})}}),t.add(P.Slot,()=>{if(!o().bottomStrip)return;const r=t.sessions.current();if((r?t.layout.state(`${t.id}:swarm`,r)==="visible":!1)&&!o().withSidePanel)return;const a=_(),c=B();return{at:"window.bottom",render:()=>(()=>{var w=te(),y=w.firstChild,f=y.firstChild,j=f.nextSibling,W=j.nextSibling,E=W.nextSibling,K=E.nextSibling,T=K.nextSibling,N=T.nextSibling,V=N.nextSibling;return V.nextSibling,w.$$click=()=>C(!0),e.insert(y,()=>c?.title??"Idle",j),e.insert(y,()=>a.active,E),e.insert(y,()=>a.waiting,T),e.insert(y,()=>a.posts,V),e.insert(w,e.createComponent(l.Show,{get when(){return a.paused||a.stalled},get children(){var D=ee();return e.insert(D,()=>a.paused?"Paused on quota":"Stalled"),D}}),null),w})()}}),t.add(P.MenuItem,()=>{const r=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",description:"Open live Swarm Board",opened:r?t.layout.state(`${t.id}:swarm`,r)!=="closed":!1,run:()=>C(!1)}}),t.add(P.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>C(!1)}));const x={id:"swarm",title:"Swarm",closable:"hover"};t.add(P.Panel,()=>{if(o().sidebarShow)return{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list({session:r,open:s}){return s.includes("swarm")||M().has(r.key)?[x]:[]},close({session:r}){v(r.key,!1)},render(r){return e.createComponent(l.Suspense,{get fallback(){return re()},get children(){return e.createComponent(ne,{ctx:t,snapshot:B,swarms:$,selectedSwarmId:L,onSelectSwarm:s=>k(s),onRefresh:()=>{b()},onKillMember:async(s,a)=>{await h("killMember",{swarmId:s,handle:a}),await b()},onCompleteSwarm:async s=>{await h("completeSwarm",{swarmId:s}),await b()},get server(){return r.session.server}})}})}}})}});e.delegateEvents(["click"]);var se=e.template("<span class=swarm-gui-mention>"),R=e.template("<span>"),ie=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>This permanently terminates <strong></strong> and releases its locks.</div><div style=display:flex;justify-content:flex-end;gap:8px>'),oe=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),le=e.template("<option>"),de=e.template('<div class=swarm-gui-toolbar><input class=swarm-gui-input type=text placeholder="Filter by @handle or text...">'),G=e.template("<div class=swarm-gui-scroll>"),ce=e.template("<div class=swarm-gui-toolbar style=justify-content:space-between><span>Click a member to open its session"),ue=e.template("<div style=margin-top:8px;font-weight:600>Mention / Handoff Flow"),me=e.template("<div class=swarm-gui-scroll><table class=swarm-gui-table><thead><tr><th>Glob</th><th>Owner</th></tr></thead><tbody>"),pe=e.template("<div style=display:flex;flex-direction:column;flex:1;min-height:0><div class=swarm-gui-toolbar>"),ge=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),we=e.template("<option> (<!>)"),he=e.template('<iframe class=swarm-gui-iframe title="Swarm Board Web View">'),fe=e.template("<div class=swarm-gui-post><div class=swarm-gui-post-head><span class=swarm-gui-author>@</span><span class=swarm-gui-time></span></div><div class=swarm-gui-post-body>"),be=e.template("<span>· "),Se=e.template("<div class=swarm-gui-meta>Owns: "),ve=e.template("<div class=swarm-gui-member><div class=swarm-gui-member-head><div style=display:flex;align-items:center;gap:8px><span></span><span class=swarm-gui-author>@</span><span class=swarm-gui-time>[<!>]</span></div></div><div class=swarm-gui-meta>"),_e=e.template("<tr><td></td><td>@"),Ce=e.template("<span>(<!>)"),ye=e.template("<div class=swarm-gui-meta><span>@</span><span>→</span><span>@");function $e(t){const i=t.split(/(@[a-zA-Z0-9_-]+)/g);return e.createComponent(l.For,{each:i,children:o=>o.startsWith("@")?(()=>{var g=se();return e.insert(g,o),g})():(()=>{var g=R();return e.insert(g,o),g})()})}function xe(t){const i=t.toLowerCase();return i==="working"||i==="active"?"swarm-gui-dot swarm-gui-dot-working":i==="waiting"||i==="idle"?"swarm-gui-dot swarm-gui-dot-waiting":i.includes("paused")||i.includes("quota")||i==="stalled"?"swarm-gui-dot swarm-gui-dot-paused":"swarm-gui-dot swarm-gui-dot-killed"}function ke(t){const{Button:i,Dialog:o}=t.ctx.ui,[g,$]=l.createSignal("board"),[S,L]=l.createSignal(!1),[k,B]=l.createSignal(""),[A,M]=l.createSignal(!0);let I;const q=l.createMemo(()=>{const p=t.snapshot();if(!p)return[];const v=k().trim().toLowerCase();return v?p.posts.filter(h=>h.author.toLowerCase().includes(v)||h.body.toLowerCase().includes(v)||(h.mentions??[]).some(u=>u.toLowerCase().includes(v))):p.posts});l.createEffect(()=>{q(),A()&&I&&(I.scrollTop=I.scrollHeight)});const n=p=>{const v=p.session_id??p.sessionId;if(!v){t.ctx.toast.show({title:`No session linked for ${p.handle}`});return}const h=p.server??t.server;if(!h){t.ctx.toast.show({title:`No server context for ${p.handle}`});return}t.ctx.tabs.open({server:h,id:v},{focus:!0})},z=(p,v)=>{v.stopPropagation();const h=t.snapshot()?.swarmId;h&&t.ctx.dialogs.open(u=>e.createComponent(o,{get title(){return`Kill ${p.handle}?`},get children(){var b=ie(),m=b.firstChild,d=m.firstChild,_=d.nextSibling,C=m.nextSibling;return e.insert(_,()=>p.handle),e.insert(C,e.createComponent(i,{variant:"ghost",onClick:()=>u.close(),children:"Cancel"}),null),e.insert(C,e.createComponent(i,{variant:"danger",onClick:async()=>{await t.onKillMember(h,p.handle),u.close()},children:"Kill Member"}),null),b}}))},F=()=>{const p=t.snapshot();p&&t.ctx.dialogs.open(v=>e.createComponent(o,{title:"Complete Swarm?",get children(){var h=oe(),u=h.firstChild,b=u.firstChild,m=b.nextSibling,d=u.nextSibling;return e.insert(m,()=>p.title||p.swarmId),e.insert(d,e.createComponent(i,{variant:"ghost",onClick:()=>v.close(),children:"Cancel"}),null),e.insert(d,e.createComponent(i,{variant:"danger",onClick:async()=>{await t.onCompleteSwarm(p.swarmId),v.close()},children:"Complete Swarm"}),null),h}}))};return(()=>{var p=ge(),v=p.firstChild,h=v.firstChild;return h.addEventListener("change",u=>t.onSelectSwarm(u.currentTarget.value)),e.insert(h,e.createComponent(l.Show,{get when(){return t.swarms().length===0},get children(){var u=le();return e.insert(u,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>u.value=t.snapshot()?.swarmId??""),u}}),null),e.insert(h,e.createComponent(l.For,{get each(){return t.swarms()},children:u=>(()=>{var b=we(),m=b.firstChild,d=m.nextSibling;return d.nextSibling,e.insert(b,()=>u.title||u.id,m),e.insert(b,()=>u.status,d),e.effect(()=>b.value=u.id),b})()}),null),e.insert(v,e.createComponent(i,{size:"small",variant:"ghost",onClick:()=>t.onRefresh(),children:"Refresh"}),null),e.insert(v,e.createComponent(l.Show,{get when(){return t.snapshot()?.boardUrl},get children(){return e.createComponent(i,{size:"small",get variant(){return S()?"contrast":"ghost"},onClick:()=>L(!S()),children:"Pixel-Bee Web View"})}}),null),e.insert(p,e.createComponent(l.Show,{get when(){return!S()||!t.snapshot()?.boardUrl},get fallback(){return(()=>{var u=he();return e.effect(()=>e.setAttribute(u,"src",t.snapshot()?.boardUrl)),u})()},get children(){var u=pe(),b=u.firstChild;return e.insert(b,e.createComponent(i,{size:"small",get variant(){return g()==="board"?"contrast":"ghost"},onClick:()=>$("board"),get children(){return["Board (",e.memo(()=>t.snapshot()?.posts.length??0),")"]}}),null),e.insert(b,e.createComponent(i,{size:"small",get variant(){return g()==="members"?"contrast":"ghost"},onClick:()=>$("members"),get children(){return["Members (",e.memo(()=>t.snapshot()?.members.length??0),")"]}}),null),e.insert(b,e.createComponent(i,{size:"small",get variant(){return g()==="locks"?"contrast":"ghost"},onClick:()=>$("locks"),get children(){return["Locks / Graph (",e.memo(()=>t.snapshot()?.locks.length??0),")"]}}),null),e.insert(u,e.createComponent(l.Show,{get when(){return g()==="board"},get children(){return[(()=>{var m=de(),d=m.firstChild;return d.$$input=_=>B(_.currentTarget.value),e.insert(m,e.createComponent(i,{size:"small",get variant(){return A()?"neutral":"ghost"},onClick:()=>M(!A()),get children(){return A()?"Auto-scroll: On":"Auto-scroll: Off"}}),null),e.effect(()=>d.value=k()),m})(),(()=>{var m=G(),d=I;return typeof d=="function"?e.use(d,m):I=m,e.insert(m,e.createComponent(l.For,{get each(){return q()},children:_=>(()=>{var C=fe(),x=C.firstChild,r=x.firstChild;r.firstChild;var s=r.nextSibling,a=x.nextSibling;return e.insert(r,()=>_.author.replace(/^@/,""),null),e.insert(s,()=>_.createdAt??_.created_at??""),e.insert(a,()=>$e(_.body)),C})()})),m})()]}}),null),e.insert(u,e.createComponent(l.Show,{get when(){return g()==="members"},get children(){return[(()=>{var m=ce();return m.firstChild,e.insert(m,e.createComponent(l.Show,{get when(){return t.snapshot()?.status!=="completed"},get children(){return e.createComponent(i,{size:"small",variant:"neutral",onClick:F,children:"Complete Swarm"})}}),null),m})(),(()=>{var m=G();return e.insert(m,e.createComponent(l.For,{get each(){return t.snapshot()?.members??[]},children:d=>(()=>{var _=ve(),C=_.firstChild,x=C.firstChild,r=x.firstChild,s=r.nextSibling;s.firstChild;var a=s.nextSibling,c=a.firstChild,w=c.nextSibling;w.nextSibling;var y=C.nextSibling;return _.$$click=()=>n(d),e.insert(s,()=>d.handle.replace(/^@/,""),null),e.insert(a,()=>d.state,w),e.insert(C,e.createComponent(l.Show,{get when(){return e.memo(()=>d.handle!=="coordinator")()&&d.state!=="killed"},get children(){return e.createComponent(i,{size:"small",variant:"ghost",onClick:f=>z(d,f),children:"Kill"})}}),null),e.insert(y,e.createComponent(l.Show,{get when(){return d.model},get children(){var f=R();return e.insert(f,()=>d.model,null),e.insert(f,(()=>{var j=e.memo(()=>!!d.variant);return()=>j()?` (${d.variant})`:""})(),null),f}}),null),e.insert(y,e.createComponent(l.Show,{get when(){return d.trackStatus},get children(){var f=be();return f.firstChild,e.insert(f,()=>d.trackStatus,null),f}}),null),e.insert(_,e.createComponent(l.Show,{get when(){return(d.ownedGlobs??[]).length>0},get children(){var f=Se();return f.firstChild,e.insert(f,()=>(d.ownedGlobs??[]).join(", "),null),f}}),null),e.effect(()=>e.className(r,xe(d.state))),_})()})),m})()]}}),null),e.insert(u,e.createComponent(l.Show,{get when(){return g()==="locks"},get children(){var m=me(),d=m.firstChild,_=d.firstChild,C=_.nextSibling;return e.insert(C,e.createComponent(l.For,{get each(){return t.snapshot()?.locks??[]},children:x=>(()=>{var r=_e(),s=r.firstChild,a=s.nextSibling;return a.firstChild,e.insert(s,()=>x.glob),e.insert(a,()=>x.owner.replace(/^@/,""),null),r})()})),e.insert(m,e.createComponent(l.Show,{get when(){return(t.snapshot()?.handoffs??[]).length>0},get children(){return[ue(),e.createComponent(l.For,{get each(){return t.snapshot()?.handoffs??[]},children:x=>(()=>{var r=ye(),s=r.firstChild;s.firstChild;var a=s.nextSibling,c=a.nextSibling;return c.firstChild,e.insert(s,()=>x.from.replace(/^@/,""),null),e.insert(c,()=>x.to.replace(/^@/,""),null),e.insert(r,e.createComponent(l.Show,{get when(){return x.summary},get children(){var w=Ce(),y=w.firstChild,f=y.nextSibling;return f.nextSibling,e.insert(w,()=>x.summary,f),w}}),null),r})()})]}}),null),m}}),null),u}}),null),e.effect(()=>h.value=t.selectedSwarmId()??t.snapshot()?.swarmId??""),p})()}e.delegateEvents(["input","click"]);const Ae=Object.freeze(Object.defineProperty({__proto__:null,default:ke},Symbol.toStringTag,{value:"Module"}));exports.default=ae;
