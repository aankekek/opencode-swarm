"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),J=require("@opencode/plugin/gui"),n=require("solid-js"),ae=require("effect");function ee(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function re(t){return{"~standard":{version:1,vendor:"swarm-runtime",validate(u){const o=t(u);return o?{issues:[{message:o}]}:{value:u}}}}}function se(t){return{"~standard":{version:1,vendor:"swarm-runtime",validate(u){const o=u===void 0?{}:u;if(!ee(o))return{issues:[{message:"input must be an object"}]};const v=t(o);return v?{issues:[{message:v}]}:{value:o}}}}}const we={id:"local.swarm-runtime",methods:{getBoardInfo:{input:se(()=>null),output:re(t=>ee(t)&&typeof t.url=="string"&&typeof t.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:se(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:re(t=>ee(t)&&Array.isArray(t.members)&&Array.isArray(t.board_posts)&&Array.isArray(t.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:se(t=>t.limit!==void 0&&typeof t.limit!="number"?"limit must be a number":null),output:re(t=>ee(t)&&Array.isArray(t.swarms)?null:"output must contain swarms array")},completeSwarm:{input:se(t=>typeof t.swarmId!="string"?"swarmId must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:re(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:se(t=>typeof t.swarmId!="string"?"swarmId must be a string":typeof t.handle!="string"?"handle must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:re(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:se(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:re(t=>ee(t)&&ee(t.roleModels)&&Array.isArray(t.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:se(t=>typeof t.role!="string"?"role must be a string":typeof t.model!="string"?"model must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":null),output:re(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must be SetRoleModelResult")},previewUninstall:{input:se(()=>null),output:re(t=>ee(t)&&Array.isArray(t.categories)&&Array.isArray(t.preserved)?null:"output must be UninstallPlan")},executeUninstall:{input:se(t=>t.categories!==void 0&&!ee(t.categories)?"categories must be an object":null),output:re(t=>ee(t)&&typeof t.ok=="boolean"&&Array.isArray(t.verification)?null:"output must be UninstallResult")}},events:{changed:{schema:re(t=>ee(t)&&typeof t.swarmId=="string"&&typeof t.reason=="string"?null:"event must contain swarmId and reason")}}},ye=`
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

.swarm-uninstall-root,
.swarm-uninstall-plan,
.swarm-uninstall-report {
  display: flex;
  flex-direction: column;
  gap: 12px;
  color: var(--text-base, #b5b4b0);
  font-size: 12px;
}

.swarm-uninstall-intro {
  margin: 0;
  color: var(--text-base, #b5b4b0);
}

.swarm-uninstall-categories {
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 360px;
  overflow-y: auto;
  padding-right: 4px;
}

.swarm-uninstall-card {
  border-radius: 8px;
  border: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--surface-raised-base, #1d1d1c);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.swarm-uninstall-card.is-checked {
  border-color: rgba(245, 166, 35, 0.45);
}

.swarm-uninstall-card-head {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  cursor: pointer;
}

.swarm-uninstall-card-title {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.swarm-uninstall-card-title strong {
  color: var(--text-strong, #ededec);
  font-size: 13px;
}

.swarm-uninstall-card-title span {
  color: var(--text-weak, #8a8984);
  font-size: 11px;
}

.swarm-uninstall-count {
  font-size: 11px;
  padding: 2px 7px;
  border-radius: 999px;
  background: var(--surface-base-hover, #262625);
  color: var(--text-weak, #8a8984);
  white-space: nowrap;
}

.swarm-uninstall-empty {
  font-size: 11px;
  color: var(--text-weak, #8a8984);
  padding-left: 24px;
}

.swarm-uninstall-items {
  margin: 0;
  padding-left: 24px;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 5px;
  max-height: 120px;
  overflow-y: auto;
}

.swarm-uninstall-items li {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
  font-size: 11px;
}

.swarm-uninstall-kind {
  padding: 1px 5px;
  border-radius: 4px;
  background: var(--background-base, #141413);
  border: 1px solid var(--border-weak-base, #2f2f2d);
  color: var(--text-weak, #8a8984);
  font-size: 10px;
}

.swarm-uninstall-path {
  color: var(--text-strong, #ededec);
  font-family: var(--font-family-mono, monospace);
  word-break: break-all;
}

.swarm-uninstall-detail {
  color: var(--text-weak, #8a8984);
  font-size: 11px;
}

.swarm-uninstall-preserved {
  border-radius: 8px;
  border: 1px solid var(--border-weak-base, #2f2f2d);
  background: var(--background-base, #141413);
  padding: 10px 12px;
}

.swarm-uninstall-preserved strong {
  color: var(--text-strong, #ededec);
  display: block;
  margin-bottom: 4px;
}

.swarm-uninstall-preserved ul,
.swarm-uninstall-list {
  margin: 0;
  padding-left: 18px;
  color: var(--text-weak, #8a8984);
  font-size: 11px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.swarm-uninstall-banner {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-weak-base, #2f2f2d);
}

.swarm-uninstall-banner.is-ok {
  background: rgba(74, 222, 128, 0.1);
  border-color: rgba(74, 222, 128, 0.35);
}

.swarm-uninstall-banner.is-warn {
  background: rgba(224, 82, 82, 0.12);
  border-color: rgba(224, 82, 82, 0.4);
}

.swarm-uninstall-banner strong {
  color: var(--text-strong, #ededec);
}

.swarm-uninstall-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.swarm-uninstall-section strong {
  color: var(--text-strong, #ededec);
}

.swarm-uninstall-checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.swarm-uninstall-check-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  background: var(--surface-raised-base, #1d1d1c);
}

.swarm-uninstall-check-row.is-pass > span {
  color: #4ade80;
  font-weight: 700;
}

.swarm-uninstall-check-row.is-fail > span {
  color: var(--icon-critical-base, #e05252);
  font-weight: 700;
}

.swarm-uninstall-code {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: var(--background-base, #141413);
  border: 1px solid var(--border-weak-base, #2f2f2d);
  color: var(--text-strong, #ededec);
  font-family: var(--font-family-mono, monospace);
  font-size: 11px;
  white-space: pre-wrap;
}

.swarm-uninstall-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
`,ie={coordinator:{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination",displayLabel:"Muse Spark 1.3 · xhigh",patterns:[/^muse-spark-1\.3/i,/muse[\s._-]*spark[\s._-]*1\.3/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"xhigh",fallbackSpec:"opencode-go/muse-spark-1.3-contributor#xhigh"},worker:{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · high",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"high",fallbackSpec:"opencode-go/deepseek-v4.1-flash#high"},verifier:{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · max",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"max",fallbackSpec:"opencode-go/deepseek-v4.1-flash#max"},monitor:{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads",displayLabel:"GLM 5.3 Flash · default",patterns:[/^glm-5\.3-flash$/i,/glm[\s._-]*5\.3[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:void 0,fallbackSpec:"opencode-go/glm-5.3-flash"}};function fe(t,u){const o={};for(const v of["coordinator","worker","verifier","monitor"]){const g=ie[v];let $;for(const b of g.preferredProviders)if($=t.find(a=>a.providerID.toLowerCase()===b.toLowerCase()&&g.patterns.some(p=>p.test(a.id)||(a.name?p.test(a.name):!1))),$)break;if($||($=t.find(b=>g.patterns.some(a=>a.test(b.id)||(b.name?a.test(b.name):!1)))),$){const b=`${$.providerID}/${$.id}`;if(g.preferredVariant){const a=($.variants??[]).find(p=>p.toLowerCase()===g.preferredVariant.toLowerCase());o[v]=a?`${b}#${a}`:b}else o[v]=b}else{const b=u?.[v];o[v]=b&&b.trim()?b.trim():g.fallbackSpec}}return o}function Se(t,u,o){const v=[],g=new Set;for(const a of t){const p=`${a.providerID}/${a.id}`;g.has(p)||(g.add(p),v.push({spec:p,label:a.name?`${p} (${a.name})`:p}));for(const L of a.variants??[]){const x=`${p}#${L}`;g.has(x)||(g.add(x),v.push({spec:x,label:x}))}}if(u&&!g.has(u)&&(g.add(u),v.push({spec:u,label:u})),o&&!g.has(o)&&(g.add(o),v.push({spec:o,label:o})),v.sort((a,p)=>a.label.localeCompare(p.label,void 0,{sensitivity:"base",numeric:!0})),!o)return v;let $;const b=[];for(const a of v)a.spec===o?$={...a,isRecommended:!0}:b.push(a);return $?[$,...b]:b}var $e=e.template('<div role=listbox><div class=swarm-model-select-search-wrap><input type=search class=swarm-model-select-search placeholder="Search models..."></div><div class=swarm-model-select-list>'),ke=e.template("<div class=swarm-model-select><button type=button class=swarm-model-select-trigger aria-haspopup=listbox><span class=swarm-model-select-value></span><span class=swarm-model-select-caret aria-hidden=true>▾"),Ce=e.template("<div class=swarm-model-select-empty>No matching models"),_e=e.template("<span class=swarm-model-select-badge>Recommended"),Ie=e.template("<span class=swarm-model-select-check aria-hidden=true>✓"),Ae=e.template("<button type=button role=option><span class=swarm-model-select-item-label></span><span class=swarm-model-select-item-right>");function xe(t){const[u,o]=n.createSignal(!1),[v,g]=n.createSignal("");let $,b;const a=n.createMemo(()=>{const x=v().trim().toLowerCase();if(!x)return t.options;const I=x.split(/\s+/).filter(Boolean);return t.options.filter(h=>{const r=`${h.label} ${h.spec}`.toLowerCase();return I.every(f=>r.includes(f))})}),p=n.createMemo(()=>{const x=t.value;if(!x)return t.placeholder??"Select model...";const I=t.options.find(h=>h.spec===x);return I?I.label:x});n.createEffect(()=>{if(!u())return;g(""),queueMicrotask(()=>{b?.focus()});const x=h=>{$&&!$.contains(h.target)&&o(!1)},I=h=>{h.key==="Escape"&&(h.stopPropagation(),o(!1))};document.addEventListener("mousedown",x),document.addEventListener("keydown",I,!0),n.onCleanup(()=>{document.removeEventListener("mousedown",x),document.removeEventListener("keydown",I,!0)})});const L=x=>{o(!1),g(""),x!==t.value&&t.onChange(x)};return(()=>{var x=ke(),I=x.firstChild,h=I.firstChild,r=$;return typeof r=="function"?e.use(r,x):$=x,I.$$click=()=>{t.disabled||o(f=>!f)},e.insert(h,p),e.insert(x,e.createComponent(n.Show,{get when(){return u()},get children(){var f=$e(),w=f.firstChild,l=w.firstChild,z=w.nextSibling;l.$$keydown=S=>{if(S.key==="Enter"){S.preventDefault();const _=a()[0];_&&L(_.spec)}else S.key==="Escape"&&(S.preventDefault(),S.stopPropagation(),o(!1))},l.$$input=S=>g(S.currentTarget.value);var k=b;return typeof k=="function"?e.use(k,l):b=l,e.insert(z,e.createComponent(n.Show,{get when(){return a().length>0},get fallback(){return Ce()},get children(){return e.createComponent(n.For,{get each(){return a()},children:S=>{const _=()=>S.spec===t.value;return(()=>{var i=Ae(),m=i.firstChild,y=m.nextSibling;return i.$$click=()=>L(S.spec),e.insert(m,()=>S.label),e.insert(y,e.createComponent(n.Show,{get when(){return S.isRecommended},get children(){return _e()}}),null),e.insert(y,e.createComponent(n.Show,{get when(){return _()},get children(){return Ie()}}),null),e.effect(P=>{var O=_(),D=`swarm-model-select-item${_()?" is-selected":""}`;return O!==P.e&&e.setAttribute(i,"aria-selected",P.e=O),D!==P.t&&e.className(i,P.t=D),P},{e:void 0,t:void 0}),i})()}})}})),e.effect(S=>{var _=`swarm-model-select-menu${t.menuUpward?" swarm-model-select-menu-upward":""}`,i=`${t.ariaLabel} options`;return _!==S.e&&e.className(f,S.e=_),i!==S.t&&e.setAttribute(f,"aria-label",S.t=i),S},{e:void 0,t:void 0}),e.effect(()=>l.value=v()),f}}),null),e.effect(f=>{var w=t.disabled,l=t.ariaLabel,z=u();return w!==f.e&&(I.disabled=f.e=w),l!==f.t&&e.setAttribute(I,"aria-label",f.t=l),z!==f.a&&e.setAttribute(I,"aria-expanded",f.a=z),f},{e:void 0,t:void 0,a:void 0}),x})()}e.delegateEvents(["click","input","keydown"]);var ze=e.template("<div class=swarm-overlay-error>"),Me=e.template("<div class=swarm-overlay-roles>"),Re=e.template("<div class=swarm-overlay-root><div class=swarm-overlay-top><div class=swarm-overlay-status><span class=swarm-overlay-badge></span><div class=swarm-overlay-meta><strong></strong><span> active · <!> waiting · <!> posts</span></div></div><div class=swarm-overlay-actions>"),Ee=e.template("<div class=swarm-overlay-loading><span>Loading role models..."),Le=e.template("<span class=swarm-overlay-role-count>"),Pe=e.template("<div class=swarm-overlay-role-row><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><strong></strong></div><span class=swarm-overlay-role-sub></span></div><div class=swarm-overlay-select-wrap>");const be=[{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination"},{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)"},{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)"},{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads"}];function Be(t){const{Button:u,Dialog:o,Loader:v}=t.ctx.ui,[g,$]=n.createSignal(null),[b,a]=n.createSignal(!0),[p,L]=n.createSignal(null),[x,I]=n.createSignal(null),h=async()=>{a(!0),I(null);try{const l=await t.loadRoleConfig();$(l)}catch(l){I(l instanceof Error?l.message:String(l))}finally{a(!1)}};n.onMount(()=>{h()});const r=l=>{const z=g()?.roleModels[l]??"";return Se(g()?.models??[],z)},f=l=>{const z=t.snapshot();if(!z)return{working:0,waiting:0};let k=0,S=0;for(const _ of z.members){if((_.role??"").toLowerCase()!==l)continue;const i=_.state.toLowerCase();i==="working"||i==="active"?k++:(i==="waiting"||i==="idle")&&S++}return{working:k,waiting:S}},w=async(l,z)=>{if(z){L(l),I(null);try{const k=await t.onSetRoleModel(l,z);if(!k||!k.ok){const _=k?.error??`Failed to switch ${l} model`;I(_),t.ctx.toast.show({title:`Failed to switch ${l}`,description:_,variant:"error"});return}$(_=>_&&{..._,roleModels:{..._.roleModels,[l]:k.model}});const S=k.rerunMembers.length>0?`Stopped, switched & rerunning: ${k.rerunMembers.map(_=>`@${_}`).join(", ")}`:k.switchedMembers.length>0?`Updated: ${k.switchedMembers.map(_=>`@${_}`).join(", ")}`:`Default saved for next ${l}`;t.ctx.toast.show({title:`${l} → ${k.model}`,description:S,variant:"success"})}catch(k){const S=k instanceof Error?k.message:String(k);I(S),t.ctx.toast.show({title:`Failed to switch ${l}`,description:S,variant:"error"})}finally{L(null)}}};return e.createComponent(o,{title:"🐝 Swarm Control",size:"large",get children(){var l=Re(),z=l.firstChild,k=z.firstChild,S=k.firstChild,_=S.nextSibling,i=_.firstChild,m=i.nextSibling,y=m.firstChild,P=y.nextSibling,O=P.nextSibling,D=O.nextSibling;D.nextSibling;var K=k.nextSibling;return e.insert(S,()=>t.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing"),e.insert(i,()=>t.snapshot()?.title??"No active swarm"),e.insert(m,()=>t.counts().active,y),e.insert(m,()=>t.counts().waiting,P),e.insert(m,()=>t.counts().posts,D),e.insert(K,e.createComponent(n.Show,{get when(){return t.onOpenSetupWizard},get children(){return e.createComponent(u,{variant:"ghost",size:"small",onClick:()=>t.onOpenSetupWizard?.(),children:"Setup Wizard"})}}),null),e.insert(K,e.createComponent(u,{variant:"contrast",onClick:()=>{t.onOpenBoard(),t.onClose()},children:"Board"}),null),e.insert(l,e.createComponent(n.Show,{get when(){return x()},get children(){var F=ze();return e.insert(F,x),F}}),null),e.insert(l,e.createComponent(n.Show,{get when(){return!b()||g()!==null},get fallback(){return(()=>{var F=Ee(),R=F.firstChild;return e.insert(F,e.createComponent(v,{size:"normal"}),R),F})()},get children(){var F=Me();return e.insert(F,e.createComponent(n.For,{each:be,children:(R,W)=>{const q=()=>f(R.role),B=()=>g()?.roleModels[R.role]??"",C=()=>p()===R.role,j=n.createMemo(()=>r(R.role));return(()=>{var T=Pe(),Y=T.firstChild,M=Y.firstChild,U=M.firstChild,G=M.nextSibling,Q=Y.nextSibling;return e.insert(U,()=>R.title),e.insert(M,e.createComponent(n.Show,{get when(){return q().working>0||q().waiting>0},get children(){var V=Le();return e.insert(V,(()=>{var N=e.memo(()=>q().working>0);return()=>N()?`${q().working} working`:`${q().waiting} waiting`})()),V}}),null),e.insert(G,()=>R.subtitle),e.insert(Q,e.createComponent(xe,{get value(){return B()},get options(){return j()},get disabled(){return C()},get ariaLabel(){return`${R.title} model`},get menuUpward(){return W()>=be.length-1},onChange:V=>{w(R.role,V)}})),T})()}})),F}}),null),l}})}var Oe=e.template("<div class=swarm-overlay-error>"),Ue=e.template('<div class=swarm-onboard-intro><p class=swarm-onboard-question>Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?</p><div class=swarm-onboard-mode-cards><button type=button class="swarm-onboard-mode-card is-primary"><div class=swarm-onboard-option-top><strong>Use Recommended Models</strong><span class=swarm-model-select-badge>Recommended</span></div><p class=swarm-onboard-mode-desc>Apply tuned defaults for all 4 roles right away:</p><div class=swarm-onboard-rec-grid></div></button><button type=button class=swarm-onboard-mode-card><div class=swarm-onboard-option-top><strong>Pick Manually (4 Questions)</strong></div><p class=swarm-onboard-mode-desc>Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.</p></button></div><div class=swarm-onboard-footer><span>'),De=e.template("<div class=swarm-onboard-root>"),Fe=e.template("<div class=swarm-overlay-loading><span>Loading available models..."),We=e.template("<div class=swarm-onboard-step><div class=swarm-onboard-step-head><span class=swarm-onboard-step-pill>Question <!> of </span><h3>Choose <!> Model</h3><p></p></div><div class=swarm-onboard-choices><button type=button><div class=swarm-onboard-option-top><strong>★ </strong><span class=swarm-model-select-badge>Recommended</span></div><span class=swarm-onboard-option-sub></span></button><div><div class=swarm-onboard-custom-head><strong>Pick from catalog (A–Z search)</strong><span>Type to filter by provider, model, or variant</span></div></div></div><div class=swarm-onboard-footer><div class=swarm-onboard-footer-right>"),qe=e.template("<div class=swarm-onboard-rec-row><span class=swarm-onboard-rec-role></span><span class=swarm-onboard-rec-spec>");const de=["coordinator","worker","verifier","monitor"];function je(t){const{Button:u,Dialog:o,Loader:v}=t.ctx.ui,[g,$]=n.createSignal(!0),[b,a]=n.createSignal(!1),[p,L]=n.createSignal(null),[x,I]=n.createSignal([]),[h,r]=n.createSignal(-1),[f,w]=n.createSignal({coordinator:ie.coordinator.fallbackSpec,worker:ie.worker.fallbackSpec,verifier:ie.verifier.fallbackSpec,monitor:ie.monitor.fallbackSpec}),l=n.createMemo(()=>fe(x()));n.onMount(async()=>{$(!0),L(null);try{const i=await t.loadRoleConfig(),m=i?.models??[];I(m);const y=fe(m,i?.roleModels);w(y)}catch(i){L(i instanceof Error?i.message:String(i))}finally{$(!1)}});const z=async i=>{a(!0),L(null);try{const m=await t.onApplyModels(i);if(!m.ok){const y=m.errors.join("; ")||"Failed to apply one or more role models.";L(y),t.ctx.toast.show({title:"Could not save all Swarm models",description:y,variant:"error"});return}t.ctx.toast.show({title:"Swarm role models configured",description:`Coordinator: ${i.coordinator}`,variant:"success"}),t.onComplete()}catch(m){const y=m instanceof Error?m.message:String(m);L(y)}finally{a(!1)}},k=n.createMemo(()=>{const i=h();return i>=0&&i<de.length?de[i]:"coordinator"}),S=n.createMemo(()=>{const i=k();return Se(x(),f()[i],l()[i])}),_=(i,m)=>{w(y=>({...y,[i]:m}))};return e.createComponent(o,{title:"🐝 Swarm Model Setup",size:"large",get children(){var i=De();return e.insert(i,e.createComponent(n.Show,{get when(){return p()},get children(){var m=Oe();return e.insert(m,p),m}}),null),e.insert(i,e.createComponent(n.Show,{get when(){return!g()},get fallback(){return(()=>{var m=Fe(),y=m.firstChild;return e.insert(m,e.createComponent(v,{size:"normal"}),y),m})()},get children(){return e.createComponent(n.Show,{get when(){return h()===-1},get fallback(){const m=()=>h(),y=()=>k(),P=()=>ie[y()],O=()=>l()[y()],D=()=>f()[y()],K=()=>D()===O();return(()=>{var F=We(),R=F.firstChild,W=R.firstChild,q=W.firstChild,B=q.nextSibling;B.nextSibling;var C=W.nextSibling,j=C.firstChild,T=j.nextSibling;T.nextSibling;var Y=C.nextSibling,M=R.nextSibling,U=M.firstChild,G=U.firstChild,Q=G.firstChild;Q.firstChild;var V=G.nextSibling,N=U.nextSibling;N.firstChild;var H=M.nextSibling,te=H.firstChild;return e.insert(W,()=>m()+1,B),e.insert(W,()=>de.length,null),e.insert(C,()=>P().title,T),e.insert(Y,()=>P().subtitle),U.$$click=()=>_(y(),O()),e.insert(Q,O,null),e.insert(V,()=>P().displayLabel),e.insert(N,e.createComponent(xe,{get value(){return D()},get options(){return S()},get disabled(){return b()},get ariaLabel(){return`${P().title} model`},onChange:s=>_(y(),s)}),null),e.insert(H,e.createComponent(u,{variant:"ghost",get disabled(){return b()},onClick:()=>r(s=>Math.max(-1,s-1)),children:"Back"}),te),e.insert(te,e.createComponent(u,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.insert(te,e.createComponent(n.Show,{get when(){return m()<de.length-1},get fallback(){return e.createComponent(u,{variant:"contrast",get disabled(){return b()},onClick:()=>{z(f())},get children(){return b()?"Saving...":"Save & Finish"}})},get children(){return e.createComponent(u,{variant:"contrast",get disabled(){return b()},onClick:()=>r(s=>s+1),get children(){return["Next (",e.memo(()=>m()+2),"/",e.memo(()=>de.length),")"]}})}}),null),e.effect(s=>{var d=`swarm-onboard-option-card${K()?" is-selected":""}`,c=`swarm-onboard-custom-card${K()?"":" is-selected"}`;return d!==s.e&&e.className(U,s.e=d),c!==s.t&&e.className(N,s.t=c),s},{e:void 0,t:void 0}),F})()},get children(){var m=Ue(),y=m.firstChild,P=y.nextSibling,O=P.firstChild,D=O.firstChild,K=D.nextSibling,F=K.nextSibling,R=O.nextSibling,W=P.nextSibling;return W.firstChild,O.$$click=()=>{z(l())},e.insert(F,e.createComponent(n.For,{each:de,children:q=>(()=>{var B=qe(),C=B.firstChild,j=C.nextSibling;return e.insert(C,()=>ie[q].title),e.insert(j,()=>l()[q]),B})()})),R.$$click=()=>r(0),e.insert(W,e.createComponent(u,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.effect(q=>{var B=b(),C=b();return B!==q.e&&(O.disabled=q.e=B),C!==q.t&&(R.disabled=q.t=C),q},{e:void 0,t:void 0}),m}})}}),null),i}})}e.delegateEvents(["click"]);var Ne=e.template("<div data-action=swarm-board.sidebarShow>"),Ve=e.template("<div data-action=swarm-board.pillbarShow>"),Te=e.template("<div data-action=swarm-board.showWhenIdle>"),Ge=e.template("<div data-action=swarm-board.composerPill>"),Ke=e.template("<div data-action=swarm-board.bottomStrip>"),Qe=e.template("<div data-action=swarm-board.withSidePanel>"),He=e.template("<div data-action=swarm-board.toastEnabled>"),Ze=e.template("<div style=display:flex;gap:8px>"),Je=e.template("<div data-action=swarm-board.status>"),Ye=e.template("<div data-action=swarm-board.uninstall>");function Xe(t){const{SettingsLayout:u,SettingsSection:o,SettingsRow:v,Switch:g,Button:$}=t.ctx.ui;n.onMount(()=>{!t.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(t.target)}"]`)?.scrollIntoView({block:"start"})})});const b=()=>{const a=t.rpcStatus();if(a.state==="connected"){const p=t.activeSwarmCount();return`Connected to local.swarm-runtime (${p} swarm${p===1?"":"s"} recorded).`}return a.state==="unavailable"?"Server plugin (local.swarm-runtime) is not loaded for this workspace.":a.message?`RPC error: ${a.message}`:"Unable to reach local.swarm-runtime."};return e.createComponent(u,{title:"Swarm Board",get children(){return[e.createComponent(o,{title:"Surfaces",get children(){return[(()=>{var a=Ne();return e.insert(a,e.createComponent(v,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent(g,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:p=>t.updateSetting("sidebarShow",p)})}})),a})(),(()=>{var a=Ve();return e.insert(a,e.createComponent(v,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent(g,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:p=>t.updateSetting("pillbarShow",p)})}})),a})(),(()=>{var a=Te();return e.insert(a,e.createComponent(v,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return e.createComponent(g,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return t.settings().showWhenIdle},onChange:p=>t.updateSetting("showWhenIdle",p)})}})),a})(),(()=>{var a=Ge();return e.insert(a,e.createComponent(v,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent(g,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:p=>t.updateSetting("composerPill",p)})}})),a})(),(()=>{var a=Ke();return e.insert(a,e.createComponent(v,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent(g,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:p=>t.updateSetting("bottomStrip",p)})}})),a})(),(()=>{var a=Qe();return e.insert(a,e.createComponent(v,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent(g,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:p=>t.updateSetting("withSidePanel",p)})}})),a})()]}}),e.createComponent(o,{title:"Notifications",get children(){var a=He();return e.insert(a,e.createComponent(v,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent(g,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:p=>t.updateSetting("toastEnabled",p)})}})),a}}),e.createComponent(o,{title:"Plugin Status & Actions",get children(){var a=Je();return e.insert(a,e.createComponent(v,{title:"Swarm Runtime",get description(){return b()},get children(){var p=Ze();return e.insert(p,e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onRefresh},children:"Refresh"}),null),e.insert(p,(()=>{var L=e.memo(()=>!!t.onOpenSetupWizard);return()=>L()&&e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onOpenSetupWizard},children:"Setup Role Models"})})(),null),e.insert(p,e.createComponent($,{size:"small",variant:"neutral",get onClick(){return t.onOpenPanel},children:"Open Swarm Board"}),null),p}})),a}}),e.memo(()=>e.memo(()=>!!t.onOpenUninstall)()&&e.createComponent(o,{title:"Uninstall",get children(){var a=Ye();return e.insert(a,e.createComponent(v,{title:"Uninstall Swarm Plugin",description:"Review the full removal checklist and completely remove Swarm Runtime config, runtime data, worktrees, build artifacts, and temp files",get children(){return e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onOpenUninstall},children:"Uninstall..."})}})),a}}))]}})}var et=e.template("<div class=swarm-overlay-error>"),tt=e.template("<div class=swarm-uninstall-root>"),rt=e.template("<div class=swarm-overlay-loading><span>Scanning config, git worktrees, runtime data, and temp files..."),nt=e.template("<div class=swarm-uninstall-section><strong>Errors</strong><ul class=swarm-uninstall-list>"),at=e.template("<div class=swarm-uninstall-section><strong>Final Host Reload Commands</strong><pre class=swarm-uninstall-code>"),st=e.template("<div class=swarm-uninstall-report><div><strong></strong><span> removed · <!> config(s) updated · <!> skipped · <!> error(s)</span></div><div class=swarm-uninstall-section><strong>Verification Checklist</strong><div class=swarm-uninstall-checks></div></div><div class=swarm-uninstall-footer><span>"),ot=e.template("<div><span></span><div><strong></strong><div class=swarm-uninstall-detail>"),he=e.template("<li>"),it=e.template("<div class=swarm-uninstall-plan><p class=swarm-uninstall-intro>Confirm what will be removed from this machine. Unchecked categories will be skipped; source code and backups remain untouched.</p><div class=swarm-uninstall-categories><div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong>6. Swarm GUI Settings Store</strong><span>Reset saved GUI preferences and onboarding state back to defaults.</span></div><span class=swarm-uninstall-count>1 store</span></label></div></div><div class=swarm-uninstall-preserved><strong>Preserved (Not Removed)</strong><ul></ul></div><div class=swarm-uninstall-footer>"),lt=e.template("<ul class=swarm-uninstall-items>"),dt=e.template("<div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong></strong><span></span></div><span class=swarm-uninstall-count>"),ct=e.template("<div class=swarm-uninstall-empty>Nothing detected on disk"),mt=e.template("<li><span class=swarm-uninstall-kind></span><code class=swarm-uninstall-path></code><span class=swarm-uninstall-detail>");function ut(t){return typeof t!="number"||t<=0?"":t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:`${(t/(1024*1024)).toFixed(1)} MB`}function pt(t){const{Button:u,Dialog:o,Loader:v}=t.ctx.ui,[g,$]=n.createSignal(!0),[b,a]=n.createSignal(!1),[p,L]=n.createSignal(null),[x,I]=n.createSignal(null),[h,r]=n.createSignal(null),[f,w]=n.createSignal(!0),[l,z]=n.createSignal({pluginRegistration:!0,gitWorktreesAndBranches:!0,runtimeData:!0,buildArtifacts:!0,tempFiles:!0});n.onMount(async()=>{$(!0),L(null);try{const i=await t.loadPlan();if(I(i),i){const m={...l()};for(const y of i.categories)m[y.id]=y.defaultChecked;z(m)}}catch(i){L(i instanceof Error?i.message:String(i))}finally{$(!1)}});const k=n.createMemo(()=>{const i=l();return Object.values(i).filter(Boolean).length+(f()?1:0)}),S=i=>{z(m=>({...m,[i]:!m[i]}))},_=async()=>{a(!0),L(null);try{const i=await t.onExecute(l());f()&&t.onResetGuiStore(),r(i),i?.ok?t.ctx.toast.show({title:"Swarm plugin uninstalled",description:"Reload or restart OpenCode to finish unloading.",variant:"success"}):i&&t.ctx.toast.show({title:"Uninstall completed with warnings",description:`${i.errors.length} error(s) — check verification checklist.`,variant:"error"})}catch(i){L(i instanceof Error?i.message:String(i))}finally{a(!1)}};return e.createComponent(o,{title:"Uninstall Swarm Plugin — Removal Checklist",size:"large",get children(){var i=tt();return e.insert(i,e.createComponent(n.Show,{get when(){return p()},get children(){var m=et();return e.insert(m,p),m}}),null),e.insert(i,e.createComponent(n.Show,{get when(){return!g()},get fallback(){return(()=>{var m=rt(),y=m.firstChild;return e.insert(m,e.createComponent(v,{size:"normal"}),y),m})()},get children(){return e.createComponent(n.Show,{get when(){return h()===null},get fallback(){const m=()=>h();return(()=>{var y=st(),P=y.firstChild,O=P.firstChild,D=O.nextSibling,K=D.firstChild,F=K.nextSibling,R=F.nextSibling,W=R.nextSibling,q=W.nextSibling,B=q.nextSibling;B.nextSibling;var C=P.nextSibling,j=C.firstChild,T=j.nextSibling,Y=C.nextSibling;return Y.firstChild,e.insert(O,()=>m().ok?"All selected Swarm items removed and verified":"Uninstall completed with remaining items"),e.insert(D,()=>m().removed.length,K),e.insert(D,()=>m().edited.length,F),e.insert(D,()=>m().skipped.length,W),e.insert(D,()=>m().errors.length,B),e.insert(T,e.createComponent(n.For,{get each(){return m().verification},children:M=>(()=>{var U=ot(),G=U.firstChild,Q=G.nextSibling,V=Q.firstChild,N=V.nextSibling;return e.insert(G,()=>M.passed?"✓":"✗"),e.insert(V,()=>M.label),e.insert(N,()=>M.detail),e.effect(()=>e.className(U,`swarm-uninstall-check-row${M.passed?" is-pass":" is-fail"}`)),U})()})),e.insert(y,e.createComponent(n.Show,{get when(){return m().errors.length>0},get children(){var M=nt(),U=M.firstChild,G=U.nextSibling;return e.insert(G,e.createComponent(n.For,{get each(){return m().errors},children:Q=>(()=>{var V=he();return e.insert(V,Q),V})()})),M}}),Y),e.insert(y,e.createComponent(n.Show,{get when(){return m().nextSteps.length>0},get children(){var M=at(),U=M.firstChild,G=U.nextSibling;return e.insert(G,()=>m().nextSteps.join(`
`)),M}}),Y),e.insert(Y,e.createComponent(u,{variant:"contrast",onClick:()=>t.onClose(),children:"Close"}),null),e.effect(()=>e.className(P,`swarm-uninstall-banner${m().ok?" is-ok":" is-warn"}`)),y})()},get children(){return e.createComponent(n.Show,{get when(){return x()},children:m=>(()=>{var y=it(),P=y.firstChild,O=P.nextSibling,D=O.firstChild,K=D.firstChild,F=K.firstChild,R=O.nextSibling,W=R.firstChild,q=W.nextSibling,B=R.nextSibling;return e.insert(O,e.createComponent(n.For,{get each(){return m().categories},children:C=>{const j=()=>l()[C.id];return(()=>{var T=dt(),Y=T.firstChild,M=Y.firstChild,U=M.nextSibling,G=U.firstChild,Q=G.nextSibling,V=U.nextSibling;return M.addEventListener("change",()=>S(C.id)),e.insert(G,()=>C.title),e.insert(Q,()=>C.description),e.insert(V,(()=>{var N=e.memo(()=>C.items.length===0);return()=>N()?"Clean":`${C.items.length} item${C.items.length===1?"":"s"}`})()),e.insert(T,e.createComponent(n.Show,{get when(){return C.items.length>0},get fallback(){return ct()},get children(){var N=lt();return e.insert(N,e.createComponent(n.For,{get each(){return C.items},children:H=>(()=>{var te=mt(),s=te.firstChild,d=s.nextSibling,c=d.nextSibling;return e.insert(s,()=>H.kind),e.insert(d,()=>H.path),e.insert(c,()=>H.detail,null),e.insert(c,(()=>{var A=e.memo(()=>!!H.sizeBytes);return()=>A()?` (${ut(H.sizeBytes)})`:""})(),null),te})()})),N}}),null),e.effect(N=>{var H=`swarm-uninstall-card${j()?" is-checked":""}`,te=b();return H!==N.e&&e.className(T,N.e=H),te!==N.t&&(M.disabled=N.t=te),N},{e:void 0,t:void 0}),e.effect(()=>M.checked=j()),T})()}}),D),F.addEventListener("change",()=>w(C=>!C)),e.insert(q,e.createComponent(n.For,{get each(){return m().preserved},children:C=>(()=>{var j=he();return e.insert(j,C),j})()})),e.insert(B,e.createComponent(u,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onClose(),children:"Cancel"}),null),e.insert(B,e.createComponent(u,{variant:"contrast",get disabled(){return b()||k()===0},onClick:()=>{_()},get children(){return b()?"Removing...":"Confirm & Remove Selected Items"}}),null),e.effect(C=>{var j=`swarm-uninstall-card${f()?" is-checked":""}`,T=b();return j!==C.e&&e.className(D,C.e=j),T!==C.t&&(F.disabled=C.t=T),C},{e:void 0,t:void 0}),e.effect(()=>F.checked=f()),y})()})}})}}),null),i}})}const ge="swarm-board",ve=ae.Schema.Struct({sidebarShow:ae.Schema.Boolean,pillbarShow:ae.Schema.Boolean,showWhenIdle:ae.Schema.Boolean,composerPill:ae.Schema.Boolean,bottomStrip:ae.Schema.Boolean,withSidePanel:ae.Schema.Boolean,toastEnabled:ae.Schema.Boolean,onboardingComplete:ae.Schema.Boolean}),pe={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0,onboardingComplete:!1};function gt(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(o=>({id:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),activeCount:typeof o.activeCount=="number"?o.activeCount:void 0,waitingCount:typeof o.waitingCount=="number"?o.waitingCount:void 0,postCount:typeof o.postCount=="number"?o.postCount:typeof o.post_count=="number"?o.post_count:void 0,updatedAt:o.updatedAt??(typeof o.updated_at=="number"?new Date(o.updated_at).toISOString():void 0)}))}function wt(t){if(!t||typeof t!="object")return null;const u=t;if(typeof u.swarmId=="string"&&Array.isArray(u.posts))return u;const o=u.swarm;if(!o||typeof o!="object")return null;const v=Array.isArray(u.members)?u.members:[],g=Array.isArray(u.board_posts)?u.board_posts:Array.isArray(u.posts)?u.posts:[],$=Array.isArray(u.file_locks)?u.file_locks:Array.isArray(u.locks)?u.locks:[],b=v.map(r=>({handle:String(r.handle??r.name??""),role:typeof r.role=="string"?r.role:void 0,state:String(r.state??"waiting"),model:typeof r.model=="string"?r.model:void 0,variant:typeof r.variant=="string"?r.variant:void 0,trackStatus:typeof r.track_status=="string"?r.track_status:r.trackStatus,ownedGlobs:Array.isArray(r.owned_globs)?r.owned_globs:Array.isArray(r.ownedGlobs)?r.ownedGlobs:[],sessionId:typeof r.session_id=="string"?r.session_id:r.sessionId,session_id:typeof r.session_id=="string"?r.session_id:r.sessionId})),a=g.map(r=>({id:r.seq??r.id??0,seq:typeof r.seq=="number"?r.seq:void 0,author:String(r.author??""),body:String(r.body??""),createdAt:typeof r.created_at=="number"?new Date(r.created_at).toISOString():r.createdAt,created_at:typeof r.created_at=="number"?new Date(r.created_at).toISOString():r.created_at,mentions:Array.isArray(r.mentions)?r.mentions:[]})),p=$.map(r=>({glob:String(r.glob_pattern??r.glob??""),owner:String(r.owner_handle??r.owner??""),acquiredAt:typeof r.claimed_at=="number"?new Date(r.claimed_at).toISOString():r.acquiredAt})),L=v.some(r=>!!r.paused_quota),x=[...a].reverse().find(r=>r.author.replace(/^@/,"").toLowerCase()==="verifier"),I=x?/\bFAIL\b/i.test(x.body)?"FAIL":/\bPASS\b/i.test(x.body)?"PASS":void 0:void 0,h=[];for(const r of a)if(r.mentions&&r.mentions.length>0)for(const f of r.mentions)h.push({from:r.author,to:f.startsWith("@")?f:`@${f}`,summary:r.body.slice(0,80),at:r.createdAt});return{swarmId:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),boardUrl:typeof u.boardUrl=="string"?u.boardUrl:void 0,pausedQuota:L,paused_quota:L,stalled:!!u.stalled,verifierStatus:I,members:b,posts:a,locks:p,handoffs:h}}var ft=e.template("<span>"),bt=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),ht=e.template("<div style=padding:12px>Loading Swarm Board...");const vt=n.lazy(()=>Promise.resolve().then(()=>Mt)),St=[{id:ge,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"},{id:"swarm-board.status",title:"Setup Role Models",description:"Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",keywords:"swarm models onboarding wizard setup"},{id:"swarm-board.uninstall",title:"Uninstall Swarm Plugin",description:"Review removal checklist and completely uninstall Swarm Runtime",keywords:"swarm uninstall remove cleanup reset"}],xt=`
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`,yt=J.Plugin.define({stores:{settings:J.Store.global(ve,pe)},setup(t){const u=t.stores?.settings??t.storage.store("swarm.settings",{schema:ve,initial:pe}),o=()=>u.value??pe,v=(s,d)=>{u.set({...o(),[s]:d})},g=(s,d)=>{try{return t.add(s,d)}catch(c){return console.warn("[swarm-runtime] OpenCode did not accept a GUI item:",c),()=>{}}};g(J.Style,ye);const[$,b]=n.createSignal([]),[a,p]=n.createSignal(null),[L,x]=n.createSignal(null),[I,h]=n.createSignal(null),[r,f]=n.createSignal(""),[w,l]=n.createSignal(void 0),[z,k]=n.createSignal({state:"connected"});let S=!1,_="",i=!1,m="",y=null,P=0,O=null,D,K=!1;const F=()=>t.sessions.current()?.location?.directory??w(),R=()=>t.client.rpc(we),W=(s=8e3)=>{const d=t.sessions.current()?.location??(w()?{directory:w()}:void 0),c=AbortSignal.timeout(s);return d?{location:d,signal:c}:{signal:c}},q=s=>{if(!o().toastEnabled)return;const d=!!(s.pausedQuota??s.paused_quota);d&&!S&&t.toast.show({title:"Swarm paused on quota",description:s.title||s.swarmId,variant:"error"}),S=d;const c=(s.verifierStatus??"").toUpperCase();(c==="PASS"||c==="FAIL")&&c!==_&&t.toast.show({title:`@verifier ${c}`,description:s.title||s.swarmId,variant:c==="PASS"?"success":"error"}),_=c;const A=[...s.posts].reverse().find(E=>E.author.replace(/^@/,"").toLowerCase()==="monitor");s.stalled&&!i?t.toast.show({title:"@monitor stall nudge",description:A?.body??"Swarm appears stalled"}):A&&A.id!==y&&y!==null&&t.toast.show({title:"@monitor stall nudge",description:A.body}),i=!!s.stalled,A&&(y=A.id),s.status==="completed"&&m!==s.swarmId&&(m=s.swarmId,t.toast.show({title:"Swarm completed",description:s.title||s.swarmId,variant:"success"}))},B=async(s=!1)=>{const d=++P;try{const c=R(),A=W(),E=await c.listSwarms({},A);if(d!==P)return;const X=gt(E);b(X);const Z=X.find(ue=>ue.status==="running"||ue.status==="completing")??null;Z&&(Z.id!==O||s)?(O=Z.id,x(null),p(Z.id)):Z||(O=null);const oe=a();oe&&!X.some(ue=>ue.id===oe)&&(p(null),x(null)),(!a()||Z&&!L()&&a()!==Z.id)&&p(Z?.id??X[0]?.id??null);const ce=a(),me=t.sessions.current()?.id,ne=await c.getSwarmSnapshot(ce?{swarmId:ce}:me?{sessionId:me}:{},A);if(d!==P)return;ne&&typeof ne=="object"&&typeof ne.boardUrl=="string"&&ne.boardUrl&&f(ne.boardUrl);const le=wt(ne);h(le),k({state:"connected"}),!o().onboardingComplete&&!K&&(K=!0,queueMicrotask(()=>V())),le&&q(le)}catch(c){if(d!==P)return;const A=typeof c=="object"&&c!==null&&"type"in c&&c.type==="rpc.unavailable";k(A?{state:"unavailable"}:{state:"error",message:c instanceof Error?c.message:String(c)})}};n.createEffect(()=>{const s=F();t.sessions.current()?.id,t.sessions.current()?.pending,a(),s!==D&&(D=s,O=null,x(null),p(null),h(null),b([])),B()});let C=null,j;const T=()=>{if(C!==t.client){j?.abort(),C=t.client,j=new AbortController;try{t.client.rpc(we).events.on("changed",()=>{B()},{signal:j.signal})}catch{}}};T(),n.createEffect(()=>{try{const s=t.servers;if(!s)return;const c=s.list().map(E=>s.get(E)).find(E=>E?.builtin)?.data;if(!c||typeof c.on!="function")return;const A=c.on("session.tool.success",()=>{B()});n.onCleanup(()=>A())}catch{}});const Y=setInterval(()=>{T(),B()},2e3);n.onCleanup(()=>{j?.abort(),clearInterval(Y)});const M=n.createMemo(()=>{const s=I();if(!s)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let d=0,c=0;for(const A of s.members){const E=A.state.toLowerCase();E==="working"||E==="active"?d++:(E==="waiting"||E==="idle")&&c++}return{active:d,waiting:c,posts:s.posts.length,paused:!!(s.pausedQuota??s.paused_quota),stalled:!!s.stalled}}),U=(s=!1)=>{if(!o().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const d=t.sessions.current();if(!d){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const c=`${t.id}:swarm`;if(s&&t.layout.state(c,d)==="visible"){t.layout.hide(c,d);return}t.layout.open(c,d)},G=()=>{t.layout.settings(ge)},Q=n.createMemo(()=>{const s=I(),d=M();return!!(s&&(d.active>0||s.status==="running"&&s.members.some(c=>c.state.toLowerCase()==="working")))});g(J.Style,()=>Q()?xt:void 0);const V=()=>{t.dialogs.open(s=>e.createComponent(je,{ctx:t,loadRoleConfig:async()=>{const d=a(),c=t.sessions.current()?.id;return await R().getRoleConfig(d?{swarmId:d}:c?{sessionId:c}:{},W())},onApplyModels:async d=>{const c=[],A=a(),E=t.sessions.current()?.id;for(const X of["coordinator","worker","verifier","monitor"]){const Z=d[X];if(!Z)continue;const oe=await R().setRoleModel({role:X,model:Z,...A?{swarmId:A}:{},...E?{sessionId:E}:{}},W());oe?.ok||c.push(`${X}: ${oe?.error??"failed"}`)}return B(),{ok:c.length===0,errors:c}},onComplete:()=>{v("onboardingComplete",!0),s.close()},onSkip:()=>{v("onboardingComplete",!0),s.close()}}))},N=()=>{t.dialogs.open(s=>e.createComponent(Be,{ctx:t,snapshot:I,counts:M,isBuzzing:Q,loadRoleConfig:async()=>{const d=a(),c=t.sessions.current()?.id;return await R().getRoleConfig(d?{swarmId:d}:c?{sessionId:c}:{},W())},onSetRoleModel:async(d,c)=>{const A=a(),E=t.sessions.current()?.id,X=await R().setRoleModel({role:d,model:c,...A?{swarmId:A}:{},...E?{sessionId:E}:{}},W());return B(),X},onOpenBoard:()=>U(!1),onOpenSetupWizard:()=>{s.close(),V()},onClose:()=>s.close()}))},H=()=>{t.dialogs.open(s=>e.createComponent(pt,{ctx:t,loadPlan:async()=>await R().previewUninstall({},W(3e4)),onExecute:async d=>await R().executeUninstall({categories:d},W(12e4)),onResetGuiStore:()=>{u.set(pe)},onClose:()=>s.close()}))};g(J.SettingsPage,()=>({id:ge,title:"Swarm Board",icon:"dot-grid",entries:St,render:({target:s})=>e.createComponent(Xe,{ctx:t,settings:o,updateSetting:v,rpcStatus:z,activeSwarmCount:()=>$().length,onOpenPanel:()=>U(!1),onOpenSetupWizard:V,onOpenUninstall:H,onRefresh:()=>{B()},target:s})})),g(J.TitlebarItem,()=>{if(!o().pillbarShow)return;const s=I();if(!s&&!o().showWhenIdle)return;const d=t.sessions.current(),c=d?t.layout.state(`${t.id}:swarm`,d)==="visible":!1,A=M(),E=A.paused||A.stalled?" ⚠":"";return{id:"swarm-open",label:Q()?`🐝 Swarm: Buzzing (${A.active} active · ${A.posts} posts)${E}`:s?`🐝 Swarm: Dozing (${A.posts} posts)${E}`:"🐝 Swarm: Dozing",title:A.paused?"Swarm paused on quota — click to open Swarm Board":A.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:c,run:()=>U(!0)}}),g(J.ComposerPill,{id:"swarm-composer-pill",show(s){if(s.session.directory&&l(s.session.directory),!o().composerPill)return;const d=I();if(!d&&!o().showWhenIdle)return;const c=M(),A=(d?.verifierStatus??"").toUpperCase();let E;return c.paused||A==="FAIL"?E="danger":c.stalled&&(E="warning"),{label:Q()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",...E?{tone:E}:{},title:"Click to configure Swarm role models or open Board",run:()=>N()}}}),g(J.Slot,{at:"window.bottom",render:()=>{const s=()=>{if(!o().bottomStrip)return!1;const d=t.sessions.current();return!(d?t.layout.state(`${t.id}:swarm`,d)==="visible":!1)||o().withSidePanel};return e.createComponent(n.Show,{get when(){return s()},get children(){var d=bt(),c=d.firstChild,A=c.firstChild,E=A.nextSibling,X=E.nextSibling,Z=X.nextSibling,oe=Z.nextSibling,ce=oe.nextSibling,me=ce.nextSibling,ne=me.nextSibling;return ne.nextSibling,d.$$click=()=>U(!0),e.insert(c,()=>I()?.title??"Idle",E),e.insert(c,()=>M().active,Z),e.insert(c,()=>M().waiting,ce),e.insert(c,()=>M().posts,ne),e.insert(d,e.createComponent(n.Show,{get when(){return M().paused||M().stalled},get children(){var le=ft();return e.insert(le,()=>M().paused?"Paused on quota":"Stalled"),le}}),null),d}})}}),g(J.MenuItem,()=>{const s=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:s?t.layout.state(`${t.id}:swarm`,s)!=="closed":!1,run:()=>U(!1)}}),g(J.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>U(!1)})),g(J.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>G()})),g(J.Command,()=>({id:"setup-models",title:"Swarm Model Setup Wizard",description:"Choose recommended or manual models for Swarm roles",group:"Swarm",section:"model",run:()=>V()})),g(J.Command,()=>({id:"uninstall",title:"Uninstall Swarm Plugin",description:"Open the Swarm removal checklist and completely uninstall Swarm Runtime",group:"Swarm",section:"general",run:()=>H()}));const te={id:"swarm",title:"Swarm",pinned:!0};g(J.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return o().sidebarShow?[te]:[]},render(s){return s.session.directory&&l(s.session.directory),e.createComponent(n.Suspense,{get fallback(){return ht()},get children(){return e.createComponent(vt,{ctx:t,snapshot:I,boardUrl:r,swarms:$,selectedSwarmId:a,sessionId:()=>s.session.id,onSelectSwarm:d=>{x(d),p(d)},onRefresh:()=>{B(!0)},onOpenSettings:G,rpcError:()=>{const d=z();if(d.state==="unavailable")return"Server plugin (local.swarm-runtime) is not loaded for this workspace.";if(d.state==="error")return d.message},onCompleteSwarm:async d=>{await R().completeSwarm({swarmId:d},W()),await B()},get server(){return s.session.server}})}})}})}});e.delegateEvents(["click"]);var $t=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),kt=e.template("<option>"),Ct=e.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),_t=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),It=e.template("<option> (<!>)"),At=e.template("<div class=swarm-gui-empty>");function zt(t){const{Button:u,Dialog:o}=t.ctx.ui,[v,g]=n.createSignal(0);let $;const b=n.createMemo(()=>t.snapshot()?.boardUrl||t.boardUrl?.()||""),a=n.createMemo(()=>t.selectedSwarmId()??t.snapshot()?.swarmId??""),p=n.createMemo(()=>{const h=b();if(!h)return"";const r=a(),f=t.sessionId?.()??"",w=v();try{const l=new URL(h);return r&&l.searchParams.set("swarmId",r),f&&l.searchParams.set("conversationId",f),w>0&&l.searchParams.set("_r",String(w)),l.toString()}catch{return h}}),L=n.createMemo(()=>{const h=p();if(!h)return"";try{return new URL(h).origin}catch{return""}}),x=()=>{const h=$?.contentWindow,r=L();if(!h||!r)return;const f=t.ctx.appearance.mode(),w=typeof document<"u"?getComputedStyle(document.documentElement):null,l=S=>w?.getPropertyValue(S).trim()||"",z={},k=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[S,_]of k){const i=l(_);i&&(z[S]=i)}h.postMessage({type:"swarm:theme",mode:f,tokens:z},r)};if(n.createEffect(()=>{t.ctx.appearance.mode(),x()}),typeof window<"u"){const h=r=>{if(r.source!==$?.contentWindow)return;const f=L();if(f&&r.origin!==f)return;const w=r.data;if(w?.type==="swarm:open_session"&&typeof w.sessionID=="string"&&w.sessionID){const l=t.server,z=typeof l=="string"?l:l?.id??t.ctx.sessions.current()?.server.id;if(!z){t.ctx.toast.show({title:"No server context for member session"});return}t.ctx.tabs.open({server:z,id:w.sessionID},{focus:!0})}};window.addEventListener("message",h),n.onCleanup(()=>window.removeEventListener("message",h))}const I=()=>{const h=t.snapshot();h&&t.ctx.dialogs.open(r=>e.createComponent(o,{title:"Complete Swarm?",get children(){var f=$t(),w=f.firstChild,l=w.firstChild,z=l.nextSibling,k=w.nextSibling;return e.insert(z,()=>h.title||h.swarmId),e.insert(k,e.createComponent(u,{variant:"ghost",onClick:()=>r.close(),children:"Cancel"}),null),e.insert(k,e.createComponent(u,{variant:"danger",onClick:async()=>{try{await t.onCompleteSwarm(h.swarmId),r.close()}catch(S){t.ctx.toast.show({title:"Failed to complete swarm",description:S instanceof Error?S.message:String(S),variant:"error"})}},children:"Complete Swarm"}),null),f}}))};return(()=>{var h=_t(),r=h.firstChild,f=r.firstChild;return f.addEventListener("change",w=>t.onSelectSwarm(w.currentTarget.value)),e.insert(f,e.createComponent(n.Show,{get when(){return t.swarms().length===0},get children(){var w=kt();return e.insert(w,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>w.value=t.snapshot()?.swarmId??""),w}}),null),e.insert(f,e.createComponent(n.For,{get each(){return t.swarms()},children:w=>(()=>{var l=It(),z=l.firstChild,k=z.nextSibling;return k.nextSibling,e.insert(l,()=>w.title||w.id,z),e.insert(l,()=>w.status,k),e.effect(()=>l.value=w.id),l})()}),null),e.insert(r,e.createComponent(u,{size:"small",variant:"ghost",onClick:()=>{t.onRefresh(),g(w=>w+1)},children:"Refresh"}),null),e.insert(r,e.createComponent(n.Show,{get when(){return t.snapshot()?.status==="running"},get children(){return e.createComponent(u,{size:"small",variant:"neutral",onClick:I,children:"Complete"})}}),null),e.insert(r,e.createComponent(n.Show,{get when(){return t.onOpenSettings},get children(){return e.createComponent(u,{size:"small",variant:"ghost",onClick:()=>t.onOpenSettings?.(),children:"Settings"})}}),null),e.insert(h,e.createComponent(n.Show,{get when(){return p()},get fallback(){return(()=>{var w=At();return e.insert(w,()=>t.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),w})()},get children(){var w=Ct();return w.addEventListener("load",()=>x()),e.use(l=>{$=l},w),e.effect(()=>e.setAttribute(w,"src",p())),w}}),null),e.effect(()=>f.value=a()),h})()}const Mt=Object.freeze(Object.defineProperty({__proto__:null,default:zt},Symbol.toStringTag,{value:"Module"}));exports.default=yt;
