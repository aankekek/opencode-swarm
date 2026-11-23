"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),Z=require("@opencode/plugin/gui"),r=require("solid-js"),le=require("effect");function J(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function ne(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(u){const s=t(u);return s?{issues:[{message:s}]}:{value:u}}}}}function se(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(u){const s=u===void 0?{}:u;if(!J(s))return{issues:[{message:"input must be an object"}]};const v=t(s);return v?{issues:[{message:v}]}:{value:s}}}}}const ve={id:"local.opencode-swarm",methods:{getBoardInfo:{input:se(()=>null),output:ne(t=>J(t)&&typeof t.url=="string"&&typeof t.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:se(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ne(t=>J(t)&&Array.isArray(t.members)&&Array.isArray(t.board_posts)&&Array.isArray(t.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:se(t=>t.limit!==void 0&&typeof t.limit!="number"?"limit must be a number":null),output:ne(t=>J(t)&&Array.isArray(t.swarms)?null:"output must contain swarms array")},completeSwarm:{input:se(t=>typeof t.swarmId!="string"?"swarmId must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ne(t=>J(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:se(t=>typeof t.swarmId!="string"?"swarmId must be a string":typeof t.handle!="string"?"handle must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ne(t=>J(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:se(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ne(t=>J(t)&&J(t.roleModels)&&Array.isArray(t.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:se(t=>typeof t.role!="string"?"role must be a string":typeof t.model!="string"?"model must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":null),output:ne(t=>J(t)&&typeof t.ok=="boolean"?null:"output must be SetRoleModelResult")},setAutoSpawnVerifier:{input:se(t=>typeof t.enabled=="boolean"?null:"enabled must be a boolean"),output:ne(t=>J(t)&&typeof t.ok=="boolean"&&typeof t.autoSpawnVerifier=="boolean"?null:"output must contain ok and autoSpawnVerifier booleans")},previewUninstall:{input:se(()=>null),output:ne(t=>J(t)&&Array.isArray(t.categories)&&Array.isArray(t.preserved)?null:"output must be UninstallPlan")},executeUninstall:{input:se(t=>t.categories!==void 0&&!J(t.categories)?"categories must be an object":null),output:ne(t=>J(t)&&typeof t.ok=="boolean"&&Array.isArray(t.verification)?null:"output must be UninstallResult")}},events:{changed:{schema:ne(t=>J(t)&&typeof t.swarmId=="string"&&typeof t.reason=="string"?null:"event must contain swarmId and reason")}}},Ie=`
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
`,me={coordinator:{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination",displayLabel:"Muse Spark 1.3 · xhigh",patterns:[/^muse-spark-1\.3/i,/muse[\s._-]*spark[\s._-]*1\.3/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"xhigh",fallbackSpec:"opencode-go/muse-spark-1.3-contributor#xhigh"},worker:{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · high",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"high",fallbackSpec:"opencode-go/deepseek-v4.1-flash#high"},verifier:{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · max",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"max",fallbackSpec:"opencode-go/deepseek-v4.1-flash#max"},monitor:{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads",displayLabel:"GLM 5.3 Flash · default",patterns:[/^glm-5\.3-flash$/i,/glm[\s._-]*5\.3[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:void 0,fallbackSpec:"opencode-go/glm-5.3-flash"}};function Se(t,u){const s={};for(const v of["coordinator","worker","verifier","monitor"]){const g=me[v];let y;for(const f of g.preferredProviders)if(y=t.find(a=>a.providerID.toLowerCase()===f.toLowerCase()&&g.patterns.some(m=>m.test(a.id)||(a.name?m.test(a.name):!1))),y)break;if(y||(y=t.find(f=>g.patterns.some(a=>a.test(f.id)||(f.name?a.test(f.name):!1)))),y){const f=`${y.providerID}/${y.id}`;if(g.preferredVariant){const a=(y.variants??[]).find(m=>m.toLowerCase()===g.preferredVariant.toLowerCase());s[v]=a?`${f}#${a}`:f}else s[v]=f}else{const f=u?.[v];s[v]=f&&f.trim()?f.trim():g.fallbackSpec}}return s}function ke(t,u,s){const v=[],g=new Set;for(const a of t){const m=`${a.providerID}/${a.id}`;g.has(m)||(g.add(m),v.push({spec:m,label:a.name?`${m} (${a.name})`:m}));for(const L of a.variants??[]){const x=`${m}#${L}`;g.has(x)||(g.add(x),v.push({spec:x,label:x}))}}if(u&&!g.has(u)&&(g.add(u),v.push({spec:u,label:u})),s&&!g.has(s)&&(g.add(s),v.push({spec:s,label:s})),v.sort((a,m)=>a.label.localeCompare(m.label,void 0,{sensitivity:"base",numeric:!0})),!s)return v;let y;const f=[];for(const a of v)a.spec===s?y={...a,isRecommended:!0}:f.push(a);return y?[y,...f]:f}var Ae=e.template('<div role=listbox><div class=swarm-model-select-search-wrap><input type=search class=swarm-model-select-search placeholder="Search models..."></div><div class=swarm-model-select-list>'),ze=e.template("<div class=swarm-model-select><button type=button class=swarm-model-select-trigger aria-haspopup=listbox><span class=swarm-model-select-value></span><span class=swarm-model-select-caret aria-hidden=true>▾"),Me=e.template("<div class=swarm-model-select-empty>No matching models"),Re=e.template("<span class=swarm-model-select-badge>Recommended"),Ee=e.template("<span class=swarm-model-select-check aria-hidden=true>✓"),Le=e.template("<button type=button role=option><span class=swarm-model-select-item-label></span><span class=swarm-model-select-item-right>");function Ce(t){const[u,s]=r.createSignal(!1),[v,g]=r.createSignal("");let y,f;const a=r.createMemo(()=>{const x=v().trim().toLowerCase();if(!x)return t.options;const A=x.split(/\s+/).filter(Boolean);return t.options.filter(b=>{const n=`${b.label} ${b.spec}`.toLowerCase();return A.every(w=>n.includes(w))})}),m=r.createMemo(()=>{const x=t.value;if(!x)return t.placeholder??"Select model...";const A=t.options.find(b=>b.spec===x);return A?A.label:x});r.createEffect(()=>{if(!u())return;g(""),queueMicrotask(()=>{f?.focus()});const x=b=>{y&&!y.contains(b.target)&&s(!1)},A=b=>{b.key==="Escape"&&(b.stopPropagation(),s(!1))};document.addEventListener("mousedown",x),document.addEventListener("keydown",A,!0),r.onCleanup(()=>{document.removeEventListener("mousedown",x),document.removeEventListener("keydown",A,!0)})});const L=x=>{s(!1),g(""),x!==t.value&&t.onChange(x)};return(()=>{var x=ze(),A=x.firstChild,b=A.firstChild,n=y;return typeof n=="function"?e.use(n,x):y=x,A.$$click=()=>{t.disabled||s(w=>!w)},e.insert(b,m),e.insert(x,e.createComponent(r.Show,{get when(){return u()},get children(){var w=Ae(),h=w.firstChild,d=h.firstChild,z=h.nextSibling;d.$$keydown=S=>{if(S.key==="Enter"){S.preventDefault();const _=a()[0];_&&L(_.spec)}else S.key==="Escape"&&(S.preventDefault(),S.stopPropagation(),s(!1))},d.$$input=S=>g(S.currentTarget.value);var C=f;return typeof C=="function"?e.use(C,d):f=d,e.insert(z,e.createComponent(r.Show,{get when(){return a().length>0},get fallback(){return Me()},get children(){return e.createComponent(r.For,{get each(){return a()},children:S=>{const _=()=>S.spec===t.value;return(()=>{var i=Le(),c=i.firstChild,$=c.nextSibling;return i.$$click=()=>L(S.spec),e.insert(c,()=>S.label),e.insert($,e.createComponent(r.Show,{get when(){return S.isRecommended},get children(){return Re()}}),null),e.insert($,e.createComponent(r.Show,{get when(){return _()},get children(){return Ee()}}),null),e.effect(O=>{var V=_(),F=`swarm-model-select-item${_()?" is-selected":""}`;return V!==O.e&&e.setAttribute(i,"aria-selected",O.e=V),F!==O.t&&e.className(i,O.t=F),O},{e:void 0,t:void 0}),i})()}})}})),e.effect(S=>{var _=`swarm-model-select-menu${t.menuUpward?" swarm-model-select-menu-upward":""}`,i=`${t.ariaLabel} options`;return _!==S.e&&e.className(w,S.e=_),i!==S.t&&e.setAttribute(w,"aria-label",S.t=i),S},{e:void 0,t:void 0}),e.effect(()=>d.value=v()),w}}),null),e.effect(w=>{var h=t.disabled,d=t.ariaLabel,z=u();return h!==w.e&&(A.disabled=w.e=h),d!==w.t&&e.setAttribute(A,"aria-label",w.t=d),z!==w.a&&e.setAttribute(A,"aria-expanded",w.a=z),w},{e:void 0,t:void 0,a:void 0}),x})()}e.delegateEvents(["click","input","keydown"]);var Pe=e.template("<div class=swarm-overlay-error>"),Be=e.template("<div class=swarm-overlay-roles>"),Oe=e.template("<div class=swarm-overlay-root><div class=swarm-overlay-top><div class=swarm-overlay-status><span class=swarm-overlay-badge></span><div class=swarm-overlay-meta><strong></strong><span> active · <!> waiting · <!> posts</span></div></div><div class=swarm-overlay-actions>"),Ue=e.template("<div class=swarm-overlay-loading><span>Loading role models..."),De=e.template("<span class=swarm-overlay-role-count>"),Ve=e.template("<div class=swarm-overlay-role-row><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><strong></strong></div><span class=swarm-overlay-role-sub></span></div><div class=swarm-overlay-select-wrap>");const xe=[{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination"},{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)"},{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)"},{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads"}];function Fe(t){const{Button:u,Dialog:s,Loader:v}=t.ctx.ui,[g,y]=r.createSignal(null),[f,a]=r.createSignal(!0),[m,L]=r.createSignal(null),[x,A]=r.createSignal(null),b=async()=>{a(!0),A(null);try{const d=await t.loadRoleConfig();y(d)}catch(d){A(d instanceof Error?d.message:String(d))}finally{a(!1)}};r.onMount(()=>{b()});const n=d=>{const z=g()?.roleModels[d]??"";return ke(g()?.models??[],z)},w=d=>{const z=t.snapshot();if(!z)return{working:0,waiting:0};let C=0,S=0;for(const _ of z.members){if((_.role??"").toLowerCase()!==d)continue;const i=_.state.toLowerCase();i==="working"||i==="active"?C++:(i==="waiting"||i==="idle")&&S++}return{working:C,waiting:S}},h=async(d,z)=>{if(z){L(d),A(null);try{const C=await t.onSetRoleModel(d,z);if(!C||!C.ok){const _=C?.error??`Failed to switch ${d} model`;A(_),t.ctx.toast.show({title:`Failed to switch ${d}`,description:_,variant:"error"});return}y(_=>_&&{..._,roleModels:{..._.roleModels,[d]:C.model}});const S=C.rerunMembers.length>0?`Stopped, switched & rerunning: ${C.rerunMembers.map(_=>`@${_}`).join(", ")}`:C.switchedMembers.length>0?`Updated: ${C.switchedMembers.map(_=>`@${_}`).join(", ")}`:`Default saved for next ${d}`;t.ctx.toast.show({title:`${d} → ${C.model}`,description:S,variant:"success"})}catch(C){const S=C instanceof Error?C.message:String(C);A(S),t.ctx.toast.show({title:`Failed to switch ${d}`,description:S,variant:"error"})}finally{L(null)}}};return e.createComponent(s,{title:"🐝 Swarm Control",size:"large",get children(){var d=Oe(),z=d.firstChild,C=z.firstChild,S=C.firstChild,_=S.nextSibling,i=_.firstChild,c=i.nextSibling,$=c.firstChild,O=$.nextSibling,V=O.nextSibling,F=V.nextSibling;F.nextSibling;var Q=C.nextSibling;return e.insert(S,()=>t.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing"),e.insert(i,()=>t.snapshot()?.title??"No active swarm"),e.insert(c,()=>t.counts().active,$),e.insert(c,()=>t.counts().waiting,O),e.insert(c,()=>t.counts().posts,F),e.insert(Q,e.createComponent(r.Show,{get when(){return t.onOpenSetupWizard},get children(){return e.createComponent(u,{variant:"ghost",size:"small",onClick:()=>t.onOpenSetupWizard?.(),children:"Setup Wizard"})}}),null),e.insert(Q,e.createComponent(u,{variant:"contrast",onClick:()=>{t.onOpenBoard(),t.onClose()},children:"Board"}),null),e.insert(d,e.createComponent(r.Show,{get when(){return x()},get children(){var P=Pe();return e.insert(P,x),P}}),null),e.insert(d,e.createComponent(r.Show,{get when(){return!f()||g()!==null},get fallback(){return(()=>{var P=Ue(),D=P.firstChild;return e.insert(P,e.createComponent(v,{size:"normal"}),D),P})()},get children(){var P=Be();return e.insert(P,e.createComponent(r.For,{each:xe,children:(D,K)=>{const j=()=>w(D.role),q=()=>g()?.roleModels[D.role]??"",I=()=>m()===D.role,B=r.createMemo(()=>n(D.role));return(()=>{var U=Ve(),Y=U.firstChild,R=Y.firstChild,W=R.firstChild,N=R.nextSibling,X=Y.nextSibling;return e.insert(W,()=>D.title),e.insert(R,e.createComponent(r.Show,{get when(){return j().working>0||j().waiting>0},get children(){var H=De();return e.insert(H,(()=>{var E=e.memo(()=>j().working>0);return()=>E()?`${j().working} working`:`${j().waiting} waiting`})()),H}}),null),e.insert(N,()=>D.subtitle),e.insert(X,e.createComponent(Ce,{get value(){return q()},get options(){return B()},get disabled(){return I()},get ariaLabel(){return`${D.title} model`},get menuUpward(){return K()>=xe.length-1},onChange:H=>{h(D.role,H)}})),U})()}})),P}}),null),d}})}var je=e.template("<div class=swarm-overlay-error>"),qe=e.template('<div class=swarm-onboard-intro><p class=swarm-onboard-question>Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?</p><div class=swarm-onboard-mode-cards><button type=button class="swarm-onboard-mode-card is-primary"><div class=swarm-onboard-option-top><strong>Use Recommended Models</strong><span class=swarm-model-select-badge>Recommended</span></div><p class=swarm-onboard-mode-desc>Apply tuned defaults for all 4 roles right away:</p><div class=swarm-onboard-rec-grid></div></button><button type=button class=swarm-onboard-mode-card><div class=swarm-onboard-option-top><strong>Pick Manually (4 Questions)</strong></div><p class=swarm-onboard-mode-desc>Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.</p></button></div><div class=swarm-onboard-footer><span>'),We=e.template("<div class=swarm-onboard-root>"),Ne=e.template("<div class=swarm-overlay-loading><span>Loading available models..."),Te=e.template("<div class=swarm-onboard-step><div class=swarm-onboard-step-head><span class=swarm-onboard-step-pill>Question <!> of </span><h3>Choose <!> Model</h3><p></p></div><div class=swarm-onboard-choices><button type=button><div class=swarm-onboard-option-top><strong>★ </strong><span class=swarm-model-select-badge>Recommended</span></div><span class=swarm-onboard-option-sub></span></button><div><div class=swarm-onboard-custom-head><strong>Pick from catalog (A–Z search)</strong><span>Type to filter by provider, model, or variant</span></div></div></div><div class=swarm-onboard-footer><div class=swarm-onboard-footer-right>"),Ge=e.template("<div class=swarm-onboard-rec-row><span class=swarm-onboard-rec-role></span><span class=swarm-onboard-rec-spec>");const pe=["coordinator","worker","verifier","monitor"];function Ke(t){const{Button:u,Dialog:s,Loader:v}=t.ctx.ui,[g,y]=r.createSignal(!0),[f,a]=r.createSignal(!1),[m,L]=r.createSignal(null),[x,A]=r.createSignal([]),[b,n]=r.createSignal(-1),[w,h]=r.createSignal({coordinator:me.coordinator.fallbackSpec,worker:me.worker.fallbackSpec,verifier:me.verifier.fallbackSpec,monitor:me.monitor.fallbackSpec}),d=r.createMemo(()=>Se(x()));r.onMount(async()=>{y(!0),L(null);try{const i=await t.loadRoleConfig(),c=i?.models??[];A(c);const $=Se(c,i?.roleModels);h($)}catch(i){L(i instanceof Error?i.message:String(i))}finally{y(!1)}});const z=async i=>{a(!0),L(null);try{const c=await t.onApplyModels(i);if(!c.ok){const $=c.errors.join("; ")||"Failed to apply one or more role models.";L($),t.ctx.toast.show({title:"Could not save all Swarm models",description:$,variant:"error"});return}t.ctx.toast.show({title:"Swarm role models configured",description:`Coordinator: ${i.coordinator}`,variant:"success"}),t.onComplete()}catch(c){const $=c instanceof Error?c.message:String(c);L($)}finally{a(!1)}},C=r.createMemo(()=>{const i=b();return i>=0&&i<pe.length?pe[i]:"coordinator"}),S=r.createMemo(()=>{const i=C();return ke(x(),w()[i],d()[i])}),_=(i,c)=>{h($=>({...$,[i]:c}))};return e.createComponent(s,{title:"🐝 Swarm Model Setup",size:"large",get children(){var i=We();return e.insert(i,e.createComponent(r.Show,{get when(){return m()},get children(){var c=je();return e.insert(c,m),c}}),null),e.insert(i,e.createComponent(r.Show,{get when(){return!g()},get fallback(){return(()=>{var c=Ne(),$=c.firstChild;return e.insert(c,e.createComponent(v,{size:"normal"}),$),c})()},get children(){return e.createComponent(r.Show,{get when(){return b()===-1},get fallback(){const c=()=>b(),$=()=>C(),O=()=>me[$()],V=()=>d()[$()],F=()=>w()[$()],Q=()=>F()===V();return(()=>{var P=Te(),D=P.firstChild,K=D.firstChild,j=K.firstChild,q=j.nextSibling;q.nextSibling;var I=K.nextSibling,B=I.firstChild,U=B.nextSibling;U.nextSibling;var Y=I.nextSibling,R=D.nextSibling,W=R.firstChild,N=W.firstChild,X=N.firstChild;X.firstChild;var H=N.nextSibling,E=W.nextSibling;E.firstChild;var G=R.nextSibling,ee=G.firstChild;return e.insert(K,()=>c()+1,q),e.insert(K,()=>pe.length,null),e.insert(I,()=>O().title,U),e.insert(Y,()=>O().subtitle),W.$$click=()=>_($(),V()),e.insert(X,V,null),e.insert(H,()=>O().displayLabel),e.insert(E,e.createComponent(Ce,{get value(){return F()},get options(){return S()},get disabled(){return f()},get ariaLabel(){return`${O().title} model`},onChange:T=>_($(),T)}),null),e.insert(G,e.createComponent(u,{variant:"ghost",get disabled(){return f()},onClick:()=>n(T=>Math.max(-1,T-1)),children:"Back"}),ee),e.insert(ee,e.createComponent(u,{variant:"ghost",get disabled(){return f()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.insert(ee,e.createComponent(r.Show,{get when(){return c()<pe.length-1},get fallback(){return e.createComponent(u,{variant:"contrast",get disabled(){return f()},onClick:()=>{z(w())},get children(){return f()?"Saving...":"Save & Finish"}})},get children(){return e.createComponent(u,{variant:"contrast",get disabled(){return f()},onClick:()=>n(T=>T+1),get children(){return["Next (",e.memo(()=>c()+2),"/",e.memo(()=>pe.length),")"]}})}}),null),e.effect(T=>{var ie=`swarm-onboard-option-card${Q()?" is-selected":""}`,ue=`swarm-onboard-custom-card${Q()?"":" is-selected"}`;return ie!==T.e&&e.className(W,T.e=ie),ue!==T.t&&e.className(E,T.t=ue),T},{e:void 0,t:void 0}),P})()},get children(){var c=qe(),$=c.firstChild,O=$.nextSibling,V=O.firstChild,F=V.firstChild,Q=F.nextSibling,P=Q.nextSibling,D=V.nextSibling,K=O.nextSibling;return K.firstChild,V.$$click=()=>{z(d())},e.insert(P,e.createComponent(r.For,{each:pe,children:j=>(()=>{var q=Ge(),I=q.firstChild,B=I.nextSibling;return e.insert(I,()=>me[j].title),e.insert(B,()=>d()[j]),q})()})),D.$$click=()=>n(0),e.insert(K,e.createComponent(u,{variant:"ghost",get disabled(){return f()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.effect(j=>{var q=f(),I=f();return q!==j.e&&(V.disabled=j.e=q),I!==j.t&&(D.disabled=j.t=I),j},{e:void 0,t:void 0}),c}})}}),null),i}})}e.delegateEvents(["click"]);var Qe=e.template("<div data-action=swarm-board.sidebarShow>"),He=e.template("<div data-action=swarm-board.pillbarShow>"),Ze=e.template("<div data-action=swarm-board.showWhenIdle>"),Je=e.template("<div data-action=swarm-board.composerPill>"),Ye=e.template("<div data-action=swarm-board.bottomStrip>"),Xe=e.template("<div data-action=swarm-board.withSidePanel>"),et=e.template("<div data-action=swarm-board.toastEnabled>"),tt=e.template("<div data-action=swarm-board.autoSpawnVerifier>"),rt=e.template("<div style=display:flex;gap:8px>"),nt=e.template("<div data-action=swarm-board.status>"),at=e.template("<div data-action=swarm-board.uninstall>");function ot(t){const{SettingsLayout:u,SettingsSection:s,SettingsRow:v,Switch:g,Button:y}=t.ctx.ui;r.onMount(()=>{!t.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(t.target)}"]`)?.scrollIntoView({block:"start"})})});const f=()=>{const a=t.rpcStatus();if(a.state==="connected"){const m=t.activeSwarmCount();return`Connected to local.opencode-swarm (${m} swarm${m===1?"":"s"} recorded).`}return a.state==="unavailable"?"Server plugin (local.opencode-swarm) is not loaded for this workspace.":a.message?`RPC error: ${a.message}`:"Unable to reach local.opencode-swarm."};return e.createComponent(u,{title:"Swarm Board",get children(){return[e.createComponent(s,{title:"Surfaces",get children(){return[(()=>{var a=Qe();return e.insert(a,e.createComponent(v,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent(g,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:m=>t.updateSetting("sidebarShow",m)})}})),a})(),(()=>{var a=He();return e.insert(a,e.createComponent(v,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent(g,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:m=>t.updateSetting("pillbarShow",m)})}})),a})(),(()=>{var a=Ze();return e.insert(a,e.createComponent(v,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return e.createComponent(g,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return t.settings().showWhenIdle},onChange:m=>t.updateSetting("showWhenIdle",m)})}})),a})(),(()=>{var a=Je();return e.insert(a,e.createComponent(v,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent(g,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:m=>t.updateSetting("composerPill",m)})}})),a})(),(()=>{var a=Ye();return e.insert(a,e.createComponent(v,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent(g,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:m=>t.updateSetting("bottomStrip",m)})}})),a})(),(()=>{var a=Xe();return e.insert(a,e.createComponent(v,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent(g,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:m=>t.updateSetting("withSidePanel",m)})}})),a})()]}}),e.createComponent(s,{title:"Notifications",get children(){var a=et();return e.insert(a,e.createComponent(v,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent(g,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:m=>t.updateSetting("toastEnabled",m)})}})),a}}),e.createComponent(s,{title:"Verification",get children(){var a=tt();return e.insert(a,e.createComponent(v,{title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish before allowing swarm completion",get children(){return e.createComponent(g,{label:"Auto-spawn verifier",hideLabel:!0,get checked(){return t.autoSpawnVerifier?.()??!0},onChange:m=>t.onToggleAutoSpawnVerifier?.(m)})}})),a}}),e.createComponent(s,{title:"Plugin Status & Actions",get children(){var a=nt();return e.insert(a,e.createComponent(v,{title:"Swarm Runtime",get description(){return f()},get children(){var m=rt();return e.insert(m,e.createComponent(y,{size:"small",variant:"ghost",get onClick(){return t.onRefresh},children:"Refresh"}),null),e.insert(m,(()=>{var L=e.memo(()=>!!t.onOpenSetupWizard);return()=>L()&&e.createComponent(y,{size:"small",variant:"ghost",get onClick(){return t.onOpenSetupWizard},children:"Setup Role Models"})})(),null),e.insert(m,e.createComponent(y,{size:"small",variant:"neutral",get onClick(){return t.onOpenPanel},children:"Open Swarm Board"}),null),m}})),a}}),e.memo(()=>e.memo(()=>!!t.onOpenUninstall)()&&e.createComponent(s,{title:"Uninstall",get children(){var a=at();return e.insert(a,e.createComponent(v,{title:"Uninstall Swarm Plugin",description:"Review the full removal checklist and completely remove Swarm Runtime config, runtime data, worktrees, build artifacts, and temp files",get children(){return e.createComponent(y,{size:"small",variant:"ghost",get onClick(){return t.onOpenUninstall},children:"Uninstall..."})}})),a}}))]}})}var st=e.template("<div class=swarm-overlay-error>"),it=e.template("<div class=swarm-uninstall-root>"),lt=e.template("<div class=swarm-overlay-loading><span>Scanning config, git worktrees, runtime data, and temp files..."),dt=e.template("<div class=swarm-uninstall-section><strong>Errors</strong><ul class=swarm-uninstall-list>"),ct=e.template("<div class=swarm-uninstall-section><strong>Final Host Reload Commands</strong><pre class=swarm-uninstall-code>"),ut=e.template("<div class=swarm-uninstall-report><div><strong></strong><span> removed · <!> config(s) updated · <!> skipped · <!> error(s)</span></div><div class=swarm-uninstall-section><strong>Verification Checklist</strong><div class=swarm-uninstall-checks></div></div><div class=swarm-uninstall-footer><span>"),mt=e.template("<div><span></span><div><strong></strong><div class=swarm-uninstall-detail>"),ye=e.template("<li>"),pt=e.template("<div class=swarm-uninstall-plan><p class=swarm-uninstall-intro>Confirm what will be removed from this machine. Unchecked categories will be skipped; source code and backups remain untouched.</p><div class=swarm-uninstall-categories><div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong>6. Swarm GUI Settings Store</strong><span>Reset saved GUI preferences and onboarding state back to defaults.</span></div><span class=swarm-uninstall-count>1 store</span></label></div></div><div class=swarm-uninstall-preserved><strong>Preserved (Not Removed)</strong><ul></ul></div><div class=swarm-uninstall-footer>"),gt=e.template("<ul class=swarm-uninstall-items>"),wt=e.template("<div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong></strong><span></span></div><span class=swarm-uninstall-count>"),ft=e.template("<div class=swarm-uninstall-empty>Nothing detected on disk"),bt=e.template("<li><span class=swarm-uninstall-kind></span><code class=swarm-uninstall-path></code><span class=swarm-uninstall-detail>");function ht(t){return typeof t!="number"||t<=0?"":t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:`${(t/(1024*1024)).toFixed(1)} MB`}function vt(t){const{Button:u,Dialog:s,Loader:v}=t.ctx.ui,[g,y]=r.createSignal(!0),[f,a]=r.createSignal(!1),[m,L]=r.createSignal(null),[x,A]=r.createSignal(null),[b,n]=r.createSignal(null),[w,h]=r.createSignal(!0),[d,z]=r.createSignal({pluginRegistration:!0,gitWorktreesAndBranches:!0,runtimeData:!0,buildArtifacts:!0,tempFiles:!0});r.onMount(async()=>{y(!0),L(null);try{const i=await t.loadPlan();if(A(i),i){const c={...d()};for(const $ of i.categories)c[$.id]=$.defaultChecked;z(c)}}catch(i){L(i instanceof Error?i.message:String(i))}finally{y(!1)}});const C=r.createMemo(()=>{const i=d();return Object.values(i).filter(Boolean).length+(w()?1:0)}),S=i=>{z(c=>({...c,[i]:!c[i]}))},_=async()=>{a(!0),L(null);try{const i=await t.onExecute(d());w()&&t.onResetGuiStore(),n(i),i?.ok?t.ctx.toast.show({title:"Swarm plugin uninstalled",description:"Reload or restart OpenCode to finish unloading.",variant:"success"}):i&&t.ctx.toast.show({title:"Uninstall completed with warnings",description:`${i.errors.length} error(s) — check verification checklist.`,variant:"error"})}catch(i){L(i instanceof Error?i.message:String(i))}finally{a(!1)}};return e.createComponent(s,{title:"Uninstall Swarm Plugin — Removal Checklist",size:"large",get children(){var i=it();return e.insert(i,e.createComponent(r.Show,{get when(){return m()},get children(){var c=st();return e.insert(c,m),c}}),null),e.insert(i,e.createComponent(r.Show,{get when(){return!g()},get fallback(){return(()=>{var c=lt(),$=c.firstChild;return e.insert(c,e.createComponent(v,{size:"normal"}),$),c})()},get children(){return e.createComponent(r.Show,{get when(){return b()===null},get fallback(){const c=()=>b();return(()=>{var $=ut(),O=$.firstChild,V=O.firstChild,F=V.nextSibling,Q=F.firstChild,P=Q.nextSibling,D=P.nextSibling,K=D.nextSibling,j=K.nextSibling,q=j.nextSibling;q.nextSibling;var I=O.nextSibling,B=I.firstChild,U=B.nextSibling,Y=I.nextSibling;return Y.firstChild,e.insert(V,()=>c().ok?"All selected Swarm items removed and verified":"Uninstall completed with remaining items"),e.insert(F,()=>c().removed.length,Q),e.insert(F,()=>c().edited.length,P),e.insert(F,()=>c().skipped.length,K),e.insert(F,()=>c().errors.length,q),e.insert(U,e.createComponent(r.For,{get each(){return c().verification},children:R=>(()=>{var W=mt(),N=W.firstChild,X=N.nextSibling,H=X.firstChild,E=H.nextSibling;return e.insert(N,()=>R.passed?"✓":"✗"),e.insert(H,()=>R.label),e.insert(E,()=>R.detail),e.effect(()=>e.className(W,`swarm-uninstall-check-row${R.passed?" is-pass":" is-fail"}`)),W})()})),e.insert($,e.createComponent(r.Show,{get when(){return c().errors.length>0},get children(){var R=dt(),W=R.firstChild,N=W.nextSibling;return e.insert(N,e.createComponent(r.For,{get each(){return c().errors},children:X=>(()=>{var H=ye();return e.insert(H,X),H})()})),R}}),Y),e.insert($,e.createComponent(r.Show,{get when(){return c().nextSteps.length>0},get children(){var R=ct(),W=R.firstChild,N=W.nextSibling;return e.insert(N,()=>c().nextSteps.join(`
`)),R}}),Y),e.insert(Y,e.createComponent(u,{variant:"contrast",onClick:()=>t.onClose(),children:"Close"}),null),e.effect(()=>e.className(O,`swarm-uninstall-banner${c().ok?" is-ok":" is-warn"}`)),$})()},get children(){return e.createComponent(r.Show,{get when(){return x()},children:c=>(()=>{var $=pt(),O=$.firstChild,V=O.nextSibling,F=V.firstChild,Q=F.firstChild,P=Q.firstChild,D=V.nextSibling,K=D.firstChild,j=K.nextSibling,q=D.nextSibling;return e.insert(V,e.createComponent(r.For,{get each(){return c().categories},children:I=>{const B=()=>d()[I.id];return(()=>{var U=wt(),Y=U.firstChild,R=Y.firstChild,W=R.nextSibling,N=W.firstChild,X=N.nextSibling,H=W.nextSibling;return R.addEventListener("change",()=>S(I.id)),e.insert(N,()=>I.title),e.insert(X,()=>I.description),e.insert(H,(()=>{var E=e.memo(()=>I.items.length===0);return()=>E()?"Clean":`${I.items.length} item${I.items.length===1?"":"s"}`})()),e.insert(U,e.createComponent(r.Show,{get when(){return I.items.length>0},get fallback(){return ft()},get children(){var E=gt();return e.insert(E,e.createComponent(r.For,{get each(){return I.items},children:G=>(()=>{var ee=bt(),T=ee.firstChild,ie=T.nextSibling,ue=ie.nextSibling;return e.insert(T,()=>G.kind),e.insert(ie,()=>G.path),e.insert(ue,()=>G.detail,null),e.insert(ue,(()=>{var ge=e.memo(()=>!!G.sizeBytes);return()=>ge()?` (${ht(G.sizeBytes)})`:""})(),null),ee})()})),E}}),null),e.effect(E=>{var G=`swarm-uninstall-card${B()?" is-checked":""}`,ee=f();return G!==E.e&&e.className(U,E.e=G),ee!==E.t&&(R.disabled=E.t=ee),E},{e:void 0,t:void 0}),e.effect(()=>R.checked=B()),U})()}}),F),P.addEventListener("change",()=>h(I=>!I)),e.insert(j,e.createComponent(r.For,{get each(){return c().preserved},children:I=>(()=>{var B=ye();return e.insert(B,I),B})()})),e.insert(q,e.createComponent(u,{variant:"ghost",get disabled(){return f()},onClick:()=>t.onClose(),children:"Cancel"}),null),e.insert(q,e.createComponent(u,{variant:"contrast",get disabled(){return f()||C()===0},onClick:()=>{_()},get children(){return f()?"Removing...":"Confirm & Remove Selected Items"}}),null),e.effect(I=>{var B=`swarm-uninstall-card${w()?" is-checked":""}`,U=f();return B!==I.e&&e.className(F,I.e=B),U!==I.t&&(P.disabled=I.t=U),I},{e:void 0,t:void 0}),e.effect(()=>P.checked=w()),$})()})}})}}),null),i}})}const be="swarm-board",$e=le.Schema.Struct({sidebarShow:le.Schema.Boolean,pillbarShow:le.Schema.Boolean,showWhenIdle:le.Schema.Boolean,composerPill:le.Schema.Boolean,bottomStrip:le.Schema.Boolean,withSidePanel:le.Schema.Boolean,toastEnabled:le.Schema.Boolean,onboardingComplete:le.Schema.Boolean}),fe={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0,onboardingComplete:!1};function St(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(s=>({id:String(s.id??""),title:String(s.title??s.id??"Swarm"),status:String(s.status??"running"),activeCount:typeof s.activeCount=="number"?s.activeCount:void 0,waitingCount:typeof s.waitingCount=="number"?s.waitingCount:void 0,postCount:typeof s.postCount=="number"?s.postCount:typeof s.post_count=="number"?s.post_count:void 0,updatedAt:s.updatedAt??(typeof s.updated_at=="number"?new Date(s.updated_at).toISOString():void 0)}))}function xt(t){if(!t||typeof t!="object")return null;const u=t;if(typeof u.swarmId=="string"&&Array.isArray(u.posts))return u;const s=u.swarm;if(!s||typeof s!="object")return null;const v=Array.isArray(u.members)?u.members:[],g=Array.isArray(u.board_posts)?u.board_posts:Array.isArray(u.posts)?u.posts:[],y=Array.isArray(u.file_locks)?u.file_locks:Array.isArray(u.locks)?u.locks:[],f=v.map(n=>({handle:String(n.handle??n.name??""),role:typeof n.role=="string"?n.role:void 0,state:String(n.state??"waiting"),model:typeof n.model=="string"?n.model:void 0,variant:typeof n.variant=="string"?n.variant:void 0,trackStatus:typeof n.track_status=="string"?n.track_status:n.trackStatus,ownedGlobs:Array.isArray(n.owned_globs)?n.owned_globs:Array.isArray(n.ownedGlobs)?n.ownedGlobs:[],sessionId:typeof n.session_id=="string"?n.session_id:n.sessionId,session_id:typeof n.session_id=="string"?n.session_id:n.sessionId})),a=g.map(n=>({id:n.seq??n.id??0,seq:typeof n.seq=="number"?n.seq:void 0,author:String(n.author??""),body:String(n.body??""),createdAt:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.createdAt,created_at:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.created_at,mentions:Array.isArray(n.mentions)?n.mentions:[]})),m=y.map(n=>({glob:String(n.glob_pattern??n.glob??""),owner:String(n.owner_handle??n.owner??""),acquiredAt:typeof n.claimed_at=="number"?new Date(n.claimed_at).toISOString():n.acquiredAt})),L=v.some(n=>!!n.paused_quota),x=[...a].reverse().find(n=>n.author.replace(/^@/,"").toLowerCase()==="verifier"),A=x?/\bFAIL\b/i.test(x.body)?"FAIL":/\bPASS\b/i.test(x.body)?"PASS":void 0:void 0,b=[];for(const n of a)if(n.mentions&&n.mentions.length>0)for(const w of n.mentions)b.push({from:n.author,to:w.startsWith("@")?w:`@${w}`,summary:n.body.slice(0,80),at:n.createdAt});return{swarmId:String(s.id??""),title:String(s.title??s.id??"Swarm"),status:String(s.status??"running"),boardUrl:typeof u.boardUrl=="string"?u.boardUrl:void 0,pausedQuota:L,paused_quota:L,stalled:!!u.stalled,verifierStatus:A,members:f,posts:a,locks:m,handoffs:b}}var yt=e.template("<span>"),$t=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),kt=e.template("<div style=padding:12px>Loading Swarm Board...");const Ct=r.lazy(()=>Promise.resolve().then(()=>Ot)),_t=[{id:be,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"},{id:"swarm-board.autoSpawnVerifier",title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish",keywords:"swarm verifier auto spawn gate verification"},{id:"swarm-board.status",title:"Setup Role Models",description:"Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",keywords:"swarm models onboarding wizard setup"},{id:"swarm-board.uninstall",title:"Uninstall Swarm Plugin",description:"Review removal checklist and completely uninstall Swarm Runtime",keywords:"swarm uninstall remove cleanup reset"}],It=`
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`,At=Z.Plugin.define({stores:{settings:Z.Store.global($e,fe)},setup(t){const u=t.stores?.settings??t.storage.store("swarm.settings",{schema:$e,initial:fe}),s=()=>u.value??fe,v=(l,o)=>{u.set({...s(),[l]:o})},g=(l,o)=>{try{return t.add(l,o)}catch(p){return console.warn("[opencode-swarm] OpenCode did not accept a GUI item:",p),()=>{}}};g(Z.Style,Ie);const[y,f]=r.createSignal([]),[a,m]=r.createSignal(null),[L,x]=r.createSignal(null),[A,b]=r.createSignal(null),[n,w]=r.createSignal(null),[h,d]=r.createSignal(""),[z,C]=r.createSignal(void 0),[S,_]=r.createSignal({state:"connected"}),[i,c]=r.createSignal(!0);let $=!1,O="",V=!1,F="",Q=null,P=0,D,K=null;const j=()=>t.sessions.current()?.id??null,q=()=>S().state==="connected"&&n()!==null,I=()=>t.sessions.current()?.location?.directory??z(),B=()=>t.client.rpc(ve),U=(l=8e3)=>{const o=t.sessions.current()?.location??(z()?{directory:z()}:void 0),p=AbortSignal.timeout(l);return o?{location:o,signal:p}:{signal:p}},Y=l=>{if(!s().toastEnabled)return;const o=!!(l.pausedQuota??l.paused_quota);o&&!$&&t.toast.show({title:"Swarm paused on quota",description:l.title||l.swarmId,variant:"error"}),$=o;const p=(l.verifierStatus??"").toUpperCase();(p==="PASS"||p==="FAIL")&&p!==O&&t.toast.show({title:`@verifier ${p}`,description:l.title||l.swarmId,variant:p==="PASS"?"success":"error"}),O=p;const k=[...l.posts].reverse().find(M=>M.author.replace(/^@/,"").toLowerCase()==="monitor");l.stalled&&!V?t.toast.show({title:"@monitor stall nudge",description:k?.body??"Swarm appears stalled"}):k&&k.id!==Q&&Q!==null&&t.toast.show({title:"@monitor stall nudge",description:k.body}),V=!!l.stalled,k&&(Q=k.id),l.status==="completed"&&F!==l.swarmId&&(F=l.swarmId,t.toast.show({title:"Swarm completed",description:l.title||l.swarmId,variant:"success"}))},R=async()=>{const l=++P;try{const o=B(),p=U(),k=await o.listSwarms({},p);if(l!==P)return;const M=St(k);f(M);const re=a();re&&!M.some(oe=>oe.id===re)&&(m(null),x(null));const te=j(),ae=te?L():null,we=!!te&&!ae,de=await o.getSwarmSnapshot(ae?{swarmId:ae}:te?{sessionId:te}:{},p);if(l!==P)return;de&&typeof de=="object"&&typeof de.boardUrl=="string"&&de.boardUrl?d(de.boardUrl):d("");const ce=xt(de);b(ce),we&&w(ce?ce.swarmId:null),_({state:"connected"}),o.getRoleConfig(ae?{swarmId:ae}:te?{sessionId:te}:{},p).then(oe=>{const he=oe&&typeof oe=="object"&&"output"in oe?oe.output:oe;typeof he?.autoSpawnVerifier=="boolean"&&c(he.autoSpawnVerifier)}).catch(()=>{}),ce&&Y(ce)}catch(o){if(l!==P)return;const p=typeof o=="object"&&o!==null&&"type"in o&&o.type==="rpc.unavailable";_(p?{state:"unavailable"}:{state:"error",message:o instanceof Error?o.message:String(o)})}};r.createEffect(()=>{const l=I(),o=j();t.sessions.current()?.pending,a(),(l!==D||o!==K)&&(D=l,K=o,x(null),m(null),b(null),w(null),d(""),f([])),R()});let W=null,N;const X=()=>{if(W!==t.client){N?.abort(),W=t.client,N=new AbortController;try{t.client.rpc(ve).events.on("changed",()=>{R()},{signal:N.signal})}catch{}}};X(),r.createEffect(()=>{try{const l=t.servers;if(!l)return;const p=l.list().map(M=>l.get(M)).find(M=>M?.builtin)?.data;if(!p||typeof p.on!="function")return;const k=p.on("session.tool.success",()=>{R()});r.onCleanup(()=>k())}catch{}});const H=setInterval(()=>{X(),R()},2e3);r.onCleanup(()=>{N?.abort(),clearInterval(H)});const E=r.createMemo(()=>{const l=A();if(!l)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let o=0,p=0;for(const k of l.members){const M=k.state.toLowerCase();M==="working"||M==="active"?o++:(M==="waiting"||M==="idle")&&p++}return{active:o,waiting:p,posts:l.posts.length,paused:!!(l.pausedQuota??l.paused_quota),stalled:!!l.stalled}}),G=(l=!1)=>{if(!s().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const o=t.sessions.current();if(!o){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const p=`${t.id}:swarm`;if(l&&t.layout.state(p,o)==="visible"){t.layout.hide(p,o);return}t.layout.open(p,o)},ee=()=>{t.layout.settings(be)},T=r.createMemo(()=>{const l=A(),o=E();return!!(l&&(o.active>0||l.status==="running"&&l.members.some(p=>p.state.toLowerCase()==="working")))});g(Z.Style,()=>T()?It:void 0);const ie=()=>{t.dialogs.open(l=>e.createComponent(Ke,{ctx:t,loadRoleConfig:async()=>{const o=a(),p=t.sessions.current()?.id;return await B().getRoleConfig(o?{swarmId:o}:p?{sessionId:p}:{},U())},onApplyModels:async o=>{const p=[],k=a(),M=t.sessions.current()?.id;for(const re of["coordinator","worker","verifier","monitor"]){const te=o[re];if(!te)continue;const ae=await B().setRoleModel({role:re,model:te,...k?{swarmId:k}:{},...M?{sessionId:M}:{}},U());ae?.ok||p.push(`${re}: ${ae?.error??"failed"}`)}return R(),{ok:p.length===0,errors:p}},onComplete:()=>{v("onboardingComplete",!0),l.close()},onSkip:()=>{v("onboardingComplete",!0),l.close()}}))},ue=()=>{t.dialogs.open(l=>e.createComponent(Fe,{ctx:t,snapshot:A,counts:E,isBuzzing:T,loadRoleConfig:async()=>{const o=a(),p=t.sessions.current()?.id;return await B().getRoleConfig(o?{swarmId:o}:p?{sessionId:p}:{},U())},onSetRoleModel:async(o,p)=>{const k=a(),M=t.sessions.current()?.id,re=await B().setRoleModel({role:o,model:p,...k?{swarmId:k}:{},...M?{sessionId:M}:{}},U());return R(),re},onOpenBoard:()=>G(!1),onOpenSetupWizard:()=>{l.close(),ie()},onClose:()=>l.close()}))},ge=()=>{t.dialogs.open(l=>e.createComponent(vt,{ctx:t,loadPlan:async()=>await B().previewUninstall({},U(3e4)),onExecute:async o=>await B().executeUninstall({categories:o},U(12e4)),onResetGuiStore:()=>{u.set(fe)},onClose:()=>l.close()}))};g(Z.SettingsPage,()=>({id:be,title:"Swarm Board",icon:"dot-grid",entries:_t,render:({target:l})=>e.createComponent(ot,{ctx:t,settings:s,updateSetting:v,rpcStatus:S,activeSwarmCount:()=>y().length,autoSpawnVerifier:i,onToggleAutoSpawnVerifier:async o=>{const p=i();c(o);try{const k=await B().setAutoSpawnVerifier({enabled:o},U()),M=k&&typeof k=="object"&&"output"in k?k.output:k;typeof M?.autoSpawnVerifier=="boolean"&&c(M.autoSpawnVerifier)}catch(k){c(p),t.toast.show({title:"Failed to update Auto-spawn verifier",description:k instanceof Error?k.message:String(k),variant:"error"})}},onOpenPanel:()=>G(!1),onOpenSetupWizard:ie,onOpenUninstall:ge,onRefresh:()=>{R()},target:l})})),g(Z.TitlebarItem,()=>{if(!q()||!s().pillbarShow)return;const l=A(),o=t.sessions.current(),p=o?t.layout.state(`${t.id}:swarm`,o)==="visible":!1,k=E(),M=k.paused||k.stalled?" ⚠":"";return{id:"swarm-open",label:T()?`🐝 Swarm: Buzzing (${k.active} active · ${k.posts} posts)${M}`:l?`🐝 Swarm: Dozing (${k.posts} posts)${M}`:"🐝 Swarm: Dozing",title:k.paused?"Swarm paused on quota — click to open Swarm Board":k.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:p,run:()=>G(!0)}}),g(Z.ComposerPill,{id:"swarm-composer-pill",show(l){if(l.session.directory&&C(l.session.directory),!q()||!s().composerPill)return;const o=A(),p=E(),k=(o?.verifierStatus??"").toUpperCase();let M;return p.paused||k==="FAIL"?M="danger":p.stalled&&(M="warning"),{label:T()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",...M?{tone:M}:{},title:"Click to configure Swarm role models or open Board",run:()=>ue()}}}),g(Z.Slot,{at:"window.bottom",render:()=>{const l=()=>{if(!q()||!s().bottomStrip)return!1;const o=t.sessions.current();return!(o?t.layout.state(`${t.id}:swarm`,o)==="visible":!1)||s().withSidePanel};return e.createComponent(r.Show,{get when(){return l()},get children(){var o=$t(),p=o.firstChild,k=p.firstChild,M=k.nextSibling,re=M.nextSibling,te=re.nextSibling,ae=te.nextSibling,we=ae.nextSibling,de=we.nextSibling,ce=de.nextSibling;return ce.nextSibling,o.$$click=()=>G(!0),e.insert(p,()=>A()?.title??"Idle",M),e.insert(p,()=>E().active,te),e.insert(p,()=>E().waiting,we),e.insert(p,()=>E().posts,ce),e.insert(o,e.createComponent(r.Show,{get when(){return E().paused||E().stalled},get children(){var oe=yt();return e.insert(oe,()=>E().paused?"Paused on quota":"Stalled"),oe}}),null),o}})}}),g(Z.MenuItem,()=>{if(!q())return;const l=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:l?t.layout.state(`${t.id}:swarm`,l)!=="closed":!1,run:()=>G(!1)}}),g(Z.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>G(!1)})),g(Z.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>ee()})),g(Z.Command,()=>({id:"setup-models",title:"Swarm Model Setup Wizard",description:"Choose recommended or manual models for Swarm roles",group:"Swarm",section:"model",run:()=>ie()})),g(Z.Command,()=>({id:"uninstall",title:"Uninstall Swarm Plugin",description:"Open the Swarm removal checklist and completely uninstall Swarm Runtime",group:"Swarm",section:"general",run:()=>ge()}));const _e={id:"swarm",title:"Swarm",pinned:!1};g(Z.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return q()&&s().sidebarShow?[_e]:[]},render(l){return l.session.directory&&C(l.session.directory),e.createComponent(r.Suspense,{get fallback(){return kt()},get children(){return e.createComponent(Ct,{ctx:t,snapshot:A,boardUrl:h,swarms:y,selectedSwarmId:a,sessionId:()=>l.session.id,onSelectSwarm:o=>{x(o),m(o)},onRefresh:()=>{R()},onOpenSettings:ee,rpcError:()=>{const o=S();if(o.state==="unavailable")return"Server plugin (local.opencode-swarm) is not loaded for this workspace.";if(o.state==="error")return o.message},onCompleteSwarm:async o=>{await B().completeSwarm({swarmId:o},U()),await R()},get server(){return l.session.server}})}})}})}});e.delegateEvents(["click"]);var zt=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),Mt=e.template("<option>"),Rt=e.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),Et=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),Lt=e.template("<option> (<!>)"),Pt=e.template("<div class=swarm-gui-empty>");function Bt(t){const{Button:u,Dialog:s}=t.ctx.ui,[v,g]=r.createSignal(0);let y;const f=r.createMemo(()=>t.snapshot()?.boardUrl||t.boardUrl?.()||""),a=r.createMemo(()=>t.selectedSwarmId()??t.snapshot()?.swarmId??""),m=r.createMemo(()=>{const b=f();if(!b)return"";const n=a(),w=t.sessionId?.()??"",h=v();try{const d=new URL(b);return n&&d.searchParams.set("swarmId",n),w&&d.searchParams.set("conversationId",w),h>0&&d.searchParams.set("_r",String(h)),d.toString()}catch{return b}}),L=r.createMemo(()=>{const b=m();if(!b)return"";try{return new URL(b).origin}catch{return""}}),x=()=>{const b=y?.contentWindow,n=L();if(!b||!n)return;const w=t.ctx.appearance.mode(),h=typeof document<"u"?getComputedStyle(document.documentElement):null,d=S=>h?.getPropertyValue(S).trim()||"",z={},C=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[S,_]of C){const i=d(_);i&&(z[S]=i)}b.postMessage({type:"swarm:theme",mode:w,tokens:z},n)};if(r.createEffect(()=>{t.ctx.appearance.mode(),x()}),typeof window<"u"){const b=n=>{if(n.source!==y?.contentWindow)return;const w=L();if(w&&n.origin!==w)return;const h=n.data;if(h?.type==="swarm:open_session"&&typeof h.sessionID=="string"&&h.sessionID){const d=t.server,z=typeof d=="string"?d:d?.id??t.ctx.sessions.current()?.server.id;if(!z){t.ctx.toast.show({title:"No server context for member session"});return}t.ctx.tabs.open({server:z,id:h.sessionID},{focus:!0})}};window.addEventListener("message",b),r.onCleanup(()=>window.removeEventListener("message",b))}const A=()=>{const b=t.snapshot();b&&t.ctx.dialogs.open(n=>e.createComponent(s,{title:"Complete Swarm?",get children(){var w=zt(),h=w.firstChild,d=h.firstChild,z=d.nextSibling,C=h.nextSibling;return e.insert(z,()=>b.title||b.swarmId),e.insert(C,e.createComponent(u,{variant:"ghost",onClick:()=>n.close(),children:"Cancel"}),null),e.insert(C,e.createComponent(u,{variant:"danger",onClick:async()=>{try{await t.onCompleteSwarm(b.swarmId),n.close()}catch(S){t.ctx.toast.show({title:"Failed to complete swarm",description:S instanceof Error?S.message:String(S),variant:"error"})}},children:"Complete Swarm"}),null),w}}))};return(()=>{var b=Et(),n=b.firstChild,w=n.firstChild;return w.addEventListener("change",h=>t.onSelectSwarm(h.currentTarget.value)),e.insert(w,e.createComponent(r.Show,{get when(){return t.swarms().length===0},get children(){var h=Mt();return e.insert(h,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>h.value=t.snapshot()?.swarmId??""),h}}),null),e.insert(w,e.createComponent(r.For,{get each(){return t.swarms()},children:h=>(()=>{var d=Lt(),z=d.firstChild,C=z.nextSibling;return C.nextSibling,e.insert(d,()=>h.title||h.id,z),e.insert(d,()=>h.status,C),e.effect(()=>d.value=h.id),d})()}),null),e.insert(n,e.createComponent(u,{size:"small",variant:"ghost",onClick:()=>{t.onRefresh(),g(h=>h+1)},children:"Refresh"}),null),e.insert(n,e.createComponent(r.Show,{get when(){return t.snapshot()?.status==="running"},get children(){return e.createComponent(u,{size:"small",variant:"neutral",onClick:A,children:"Complete"})}}),null),e.insert(n,e.createComponent(r.Show,{get when(){return t.onOpenSettings},get children(){return e.createComponent(u,{size:"small",variant:"ghost",onClick:()=>t.onOpenSettings?.(),children:"Settings"})}}),null),e.insert(b,e.createComponent(r.Show,{get when(){return m()},get fallback(){return(()=>{var h=Pt();return e.insert(h,()=>t.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),h})()},get children(){var h=Rt();return h.addEventListener("load",()=>x()),e.use(d=>{y=d},h),e.effect(()=>e.setAttribute(h,"src",m())),h}}),null),e.effect(()=>w.value=a()),b})()}const Ot=Object.freeze(Object.defineProperty({__proto__:null,default:Bt},Symbol.toStringTag,{value:"Module"}));exports.default=At;
