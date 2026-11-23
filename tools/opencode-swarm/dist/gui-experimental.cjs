"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),Z=require("@opencode/plugin/gui"),r=require("solid-js"),le=require("effect");function J(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function ne(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(u){const o=t(u);return o?{issues:[{message:o}]}:{value:u}}}}}function oe(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(u){const o=u===void 0?{}:u;if(!J(o))return{issues:[{message:"input must be an object"}]};const f=t(o);return f?{issues:[{message:f}]}:{value:o}}}}}const xe={id:"local.opencode-swarm",methods:{getBoardInfo:{input:oe(()=>null),output:ne(t=>J(t)&&typeof t.url=="string"&&typeof t.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:oe(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ne(t=>J(t)&&Array.isArray(t.members)&&Array.isArray(t.board_posts)&&Array.isArray(t.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:oe(t=>t.limit!==void 0&&typeof t.limit!="number"?"limit must be a number":null),output:ne(t=>J(t)&&Array.isArray(t.swarms)?null:"output must contain swarms array")},completeSwarm:{input:oe(t=>typeof t.swarmId!="string"?"swarmId must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ne(t=>J(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:oe(t=>typeof t.swarmId!="string"?"swarmId must be a string":typeof t.handle!="string"?"handle must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ne(t=>J(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:oe(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ne(t=>J(t)&&J(t.roleModels)&&Array.isArray(t.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:oe(t=>typeof t.role!="string"?"role must be a string":typeof t.model!="string"?"model must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":null),output:ne(t=>J(t)&&typeof t.ok=="boolean"?null:"output must be SetRoleModelResult")},setAutoSpawnVerifier:{input:oe(t=>typeof t.enabled=="boolean"?null:"enabled must be a boolean"),output:ne(t=>J(t)&&typeof t.ok=="boolean"&&typeof t.autoSpawnVerifier=="boolean"?null:"output must contain ok and autoSpawnVerifier booleans")},previewUninstall:{input:oe(()=>null),output:ne(t=>J(t)&&Array.isArray(t.categories)&&Array.isArray(t.preserved)?null:"output must be UninstallPlan")},executeUninstall:{input:oe(t=>t.categories!==void 0&&!J(t.categories)?"categories must be an object":null),output:ne(t=>J(t)&&typeof t.ok=="boolean"&&Array.isArray(t.verification)?null:"output must be UninstallResult")}},events:{changed:{schema:ne(t=>J(t)&&typeof t.swarmId=="string"&&typeof t.reason=="string"?null:"event must contain swarmId and reason")}}},ze=`
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
`,me={coordinator:{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination",displayLabel:"Muse Spark 1.3 · xhigh",patterns:[/^muse-spark-1\.3/i,/muse[\s._-]*spark[\s._-]*1\.3/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"xhigh",fallbackSpec:"opencode-go/muse-spark-1.3-contributor#xhigh"},worker:{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · high",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"high",fallbackSpec:"opencode-go/deepseek-v4.1-flash#high"},verifier:{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · max",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"max",fallbackSpec:"opencode-go/deepseek-v4.1-flash#max"},monitor:{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads",displayLabel:"GLM 5.3 Flash · default",patterns:[/^glm-5\.3-flash$/i,/glm[\s._-]*5\.3[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:void 0,fallbackSpec:"opencode-go/glm-5.3-flash"}};function ye(t,u){const o={};for(const f of["coordinator","worker","verifier","monitor"]){const g=me[f];let $;for(const b of g.preferredProviders)if($=t.find(a=>a.providerID.toLowerCase()===b.toLowerCase()&&g.patterns.some(m=>m.test(a.id)||(a.name?m.test(a.name):!1))),$)break;if($||($=t.find(b=>g.patterns.some(a=>a.test(b.id)||(b.name?a.test(b.name):!1)))),$){const b=`${$.providerID}/${$.id}`;if(g.preferredVariant){const a=($.variants??[]).find(m=>m.toLowerCase()===g.preferredVariant.toLowerCase());o[f]=a?`${b}#${a}`:b}else o[f]=b}else{const b=u?.[f];o[f]=b&&b.trim()?b.trim():g.fallbackSpec}}return o}function _e(t,u,o){const f=[],g=new Set;for(const a of t){const m=`${a.providerID}/${a.id}`;g.has(m)||(g.add(m),f.push({spec:m,label:a.name?`${m} (${a.name})`:m}));for(const L of a.variants??[]){const y=`${m}#${L}`;g.has(y)||(g.add(y),f.push({spec:y,label:y}))}}if(u&&!g.has(u)&&(g.add(u),f.push({spec:u,label:u})),o&&!g.has(o)&&(g.add(o),f.push({spec:o,label:o})),f.sort((a,m)=>a.label.localeCompare(m.label,void 0,{sensitivity:"base",numeric:!0})),!o)return f;let $;const b=[];for(const a of f)a.spec===o?$={...a,isRecommended:!0}:b.push(a);return $?[$,...b]:b}var Me=e.template('<div role=listbox><div class=swarm-model-select-search-wrap><input type=search class=swarm-model-select-search placeholder="Search models..."></div><div class=swarm-model-select-list>'),Re=e.template("<div class=swarm-model-select><button type=button class=swarm-model-select-trigger aria-haspopup=listbox><span class=swarm-model-select-value></span><span class=swarm-model-select-caret aria-hidden=true>▾"),Ee=e.template("<div class=swarm-model-select-empty>No matching models"),Le=e.template("<span class=swarm-model-select-badge>Recommended"),Pe=e.template("<span class=swarm-model-select-check aria-hidden=true>✓"),Be=e.template("<button type=button role=option><span class=swarm-model-select-item-label></span><span class=swarm-model-select-item-right>");function Ie(t){const[u,o]=r.createSignal(!1),[f,g]=r.createSignal("");let $,b;const a=r.createMemo(()=>{const y=f().trim().toLowerCase();if(!y)return t.options;const z=y.split(/\s+/).filter(Boolean);return t.options.filter(h=>{const n=`${h.label} ${h.spec}`.toLowerCase();return z.every(w=>n.includes(w))})}),m=r.createMemo(()=>{const y=t.value;if(!y)return t.placeholder??"Select model...";const z=t.options.find(h=>h.spec===y);return z?z.label:y});r.createEffect(()=>{if(!u())return;g(""),queueMicrotask(()=>{b?.focus()});const y=h=>{$&&!$.contains(h.target)&&o(!1)},z=h=>{h.key==="Escape"&&(h.stopPropagation(),o(!1))};document.addEventListener("mousedown",y),document.addEventListener("keydown",z,!0),r.onCleanup(()=>{document.removeEventListener("mousedown",y),document.removeEventListener("keydown",z,!0)})});const L=y=>{o(!1),g(""),y!==t.value&&t.onChange(y)};return(()=>{var y=Re(),z=y.firstChild,h=z.firstChild,n=$;return typeof n=="function"?e.use(n,y):$=y,z.$$click=()=>{t.disabled||o(w=>!w)},e.insert(h,m),e.insert(y,e.createComponent(r.Show,{get when(){return u()},get children(){var w=Me(),v=w.firstChild,d=v.firstChild,M=v.nextSibling;d.$$keydown=S=>{if(S.key==="Enter"){S.preventDefault();const _=a()[0];_&&L(_.spec)}else S.key==="Escape"&&(S.preventDefault(),S.stopPropagation(),o(!1))},d.$$input=S=>g(S.currentTarget.value);var C=b;return typeof C=="function"?e.use(C,d):b=d,e.insert(M,e.createComponent(r.Show,{get when(){return a().length>0},get fallback(){return Ee()},get children(){return e.createComponent(r.For,{get each(){return a()},children:S=>{const _=()=>S.spec===t.value;return(()=>{var s=Be(),c=s.firstChild,k=c.nextSibling;return s.$$click=()=>L(S.spec),e.insert(c,()=>S.label),e.insert(k,e.createComponent(r.Show,{get when(){return S.isRecommended},get children(){return Le()}}),null),e.insert(k,e.createComponent(r.Show,{get when(){return _()},get children(){return Pe()}}),null),e.effect(O=>{var D=_(),F=`swarm-model-select-item${_()?" is-selected":""}`;return D!==O.e&&e.setAttribute(s,"aria-selected",O.e=D),F!==O.t&&e.className(s,O.t=F),O},{e:void 0,t:void 0}),s})()}})}})),e.effect(S=>{var _=`swarm-model-select-menu${t.menuUpward?" swarm-model-select-menu-upward":""}`,s=`${t.ariaLabel} options`;return _!==S.e&&e.className(w,S.e=_),s!==S.t&&e.setAttribute(w,"aria-label",S.t=s),S},{e:void 0,t:void 0}),e.effect(()=>d.value=f()),w}}),null),e.effect(w=>{var v=t.disabled,d=t.ariaLabel,M=u();return v!==w.e&&(z.disabled=w.e=v),d!==w.t&&e.setAttribute(z,"aria-label",w.t=d),M!==w.a&&e.setAttribute(z,"aria-expanded",w.a=M),w},{e:void 0,t:void 0,a:void 0}),y})()}e.delegateEvents(["click","input","keydown"]);var Oe=e.template("<div class=swarm-overlay-error>"),Ue=e.template("<div class=swarm-overlay-roles>"),Ve=e.template("<div class=swarm-overlay-root><div class=swarm-overlay-top><div class=swarm-overlay-status><span class=swarm-overlay-badge></span><div class=swarm-overlay-meta><strong></strong><span> active · <!> waiting · <!> posts</span></div></div><div class=swarm-overlay-actions>"),De=e.template("<div class=swarm-overlay-loading><span>Loading role models..."),Fe=e.template("<span class=swarm-overlay-role-count>"),je=e.template("<div class=swarm-overlay-role-row><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><strong></strong></div><span class=swarm-overlay-role-sub></span></div><div class=swarm-overlay-select-wrap>");const $e=[{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination"},{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)"},{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)"},{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads"}];function qe(t){const{Button:u,Dialog:o,Loader:f}=t.ctx.ui,[g,$]=r.createSignal(null),[b,a]=r.createSignal(!0),[m,L]=r.createSignal(null),[y,z]=r.createSignal(null),h=async()=>{a(!0),z(null);try{const d=await t.loadRoleConfig();$(d)}catch(d){z(d instanceof Error?d.message:String(d))}finally{a(!1)}};r.onMount(()=>{h()});const n=d=>{const M=g()?.roleModels[d]??"";return _e(g()?.models??[],M)},w=d=>{const M=t.snapshot();if(!M)return{working:0,waiting:0};let C=0,S=0;for(const _ of M.members){if((_.role??"").toLowerCase()!==d)continue;const s=_.state.toLowerCase();s==="working"||s==="active"?C++:(s==="waiting"||s==="idle")&&S++}return{working:C,waiting:S}},v=async(d,M)=>{if(M){L(d),z(null);try{const C=await t.onSetRoleModel(d,M);if(!C||!C.ok){const _=C?.error??`Failed to switch ${d} model`;z(_),t.ctx.toast.show({title:`Failed to switch ${d}`,description:_,variant:"error"});return}$(_=>_&&{..._,roleModels:{..._.roleModels,[d]:C.model}});const S=C.rerunMembers.length>0?`Stopped, switched & rerunning: ${C.rerunMembers.map(_=>`@${_}`).join(", ")}`:C.switchedMembers.length>0?`Updated: ${C.switchedMembers.map(_=>`@${_}`).join(", ")}`:`Default saved for next ${d}`;t.ctx.toast.show({title:`${d} → ${C.model}`,description:S,variant:"success"})}catch(C){const S=C instanceof Error?C.message:String(C);z(S),t.ctx.toast.show({title:`Failed to switch ${d}`,description:S,variant:"error"})}finally{L(null)}}};return e.createComponent(o,{title:"🐝 Swarm Control",size:"large",get children(){var d=Ve(),M=d.firstChild,C=M.firstChild,S=C.firstChild,_=S.nextSibling,s=_.firstChild,c=s.nextSibling,k=c.firstChild,O=k.nextSibling,D=O.nextSibling,F=D.nextSibling;F.nextSibling;var Q=C.nextSibling;return e.insert(S,()=>t.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing"),e.insert(s,()=>t.snapshot()?.title??"No active swarm"),e.insert(c,()=>t.counts().active,k),e.insert(c,()=>t.counts().waiting,O),e.insert(c,()=>t.counts().posts,F),e.insert(Q,e.createComponent(r.Show,{get when(){return t.onOpenSetupWizard},get children(){return e.createComponent(u,{variant:"ghost",size:"small",onClick:()=>t.onOpenSetupWizard?.(),children:"Setup Wizard"})}}),null),e.insert(Q,e.createComponent(u,{variant:"contrast",onClick:()=>{t.onOpenBoard(),t.onClose()},children:"Board"}),null),e.insert(d,e.createComponent(r.Show,{get when(){return y()},get children(){var P=Oe();return e.insert(P,y),P}}),null),e.insert(d,e.createComponent(r.Show,{get when(){return!b()||g()!==null},get fallback(){return(()=>{var P=De(),V=P.firstChild;return e.insert(P,e.createComponent(f,{size:"normal"}),V),P})()},get children(){var P=Ue();return e.insert(P,e.createComponent(r.For,{each:$e,children:(V,G)=>{const j=()=>w(V.role),q=()=>g()?.roleModels[V.role]??"",I=()=>m()===V.role,B=r.createMemo(()=>n(V.role));return(()=>{var U=je(),Y=U.firstChild,R=Y.firstChild,W=R.firstChild,N=R.nextSibling,X=Y.nextSibling;return e.insert(W,()=>V.title),e.insert(R,e.createComponent(r.Show,{get when(){return j().working>0||j().waiting>0},get children(){var H=Fe();return e.insert(H,(()=>{var E=e.memo(()=>j().working>0);return()=>E()?`${j().working} working`:`${j().waiting} waiting`})()),H}}),null),e.insert(N,()=>V.subtitle),e.insert(X,e.createComponent(Ie,{get value(){return q()},get options(){return B()},get disabled(){return I()},get ariaLabel(){return`${V.title} model`},get menuUpward(){return G()>=$e.length-1},onChange:H=>{v(V.role,H)}})),U})()}})),P}}),null),d}})}var We=e.template("<div class=swarm-overlay-error>"),Ne=e.template('<div class=swarm-onboard-intro><p class=swarm-onboard-question>Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?</p><div class=swarm-onboard-mode-cards><button type=button class="swarm-onboard-mode-card is-primary"><div class=swarm-onboard-option-top><strong>Use Recommended Models</strong><span class=swarm-model-select-badge>Recommended</span></div><p class=swarm-onboard-mode-desc>Apply tuned defaults for all 4 roles right away:</p><div class=swarm-onboard-rec-grid></div></button><button type=button class=swarm-onboard-mode-card><div class=swarm-onboard-option-top><strong>Pick Manually (4 Questions)</strong></div><p class=swarm-onboard-mode-desc>Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.</p></button></div><div class=swarm-onboard-footer><span>'),Te=e.template("<div class=swarm-onboard-root>"),Ge=e.template("<div class=swarm-overlay-loading><span>Loading available models..."),Ke=e.template("<div class=swarm-onboard-step><div class=swarm-onboard-step-head><span class=swarm-onboard-step-pill>Question <!> of </span><h3>Choose <!> Model</h3><p></p></div><div class=swarm-onboard-choices><button type=button><div class=swarm-onboard-option-top><strong>★ </strong><span class=swarm-model-select-badge>Recommended</span></div><span class=swarm-onboard-option-sub></span></button><div><div class=swarm-onboard-custom-head><strong>Pick from catalog (A–Z search)</strong><span>Type to filter by provider, model, or variant</span></div></div></div><div class=swarm-onboard-footer><div class=swarm-onboard-footer-right>"),Qe=e.template("<div class=swarm-onboard-rec-row><span class=swarm-onboard-rec-role></span><span class=swarm-onboard-rec-spec>");const pe=["coordinator","worker","verifier","monitor"];function He(t){const{Button:u,Dialog:o,Loader:f}=t.ctx.ui,[g,$]=r.createSignal(!0),[b,a]=r.createSignal(!1),[m,L]=r.createSignal(null),[y,z]=r.createSignal([]),[h,n]=r.createSignal(-1),[w,v]=r.createSignal({coordinator:me.coordinator.fallbackSpec,worker:me.worker.fallbackSpec,verifier:me.verifier.fallbackSpec,monitor:me.monitor.fallbackSpec}),d=r.createMemo(()=>ye(y()));r.onMount(async()=>{$(!0),L(null);try{const s=await t.loadRoleConfig(),c=s?.models??[];z(c);const k=ye(c,s?.roleModels);v(k)}catch(s){L(s instanceof Error?s.message:String(s))}finally{$(!1)}});const M=async s=>{a(!0),L(null);try{const c=await t.onApplyModels(s);if(!c.ok){const k=c.errors.join("; ")||"Failed to apply one or more role models.";L(k),t.ctx.toast.show({title:"Could not save all Swarm models",description:k,variant:"error"});return}t.ctx.toast.show({title:"Swarm role models configured",description:`Coordinator: ${s.coordinator}`,variant:"success"}),t.onComplete()}catch(c){const k=c instanceof Error?c.message:String(c);L(k)}finally{a(!1)}},C=r.createMemo(()=>{const s=h();return s>=0&&s<pe.length?pe[s]:"coordinator"}),S=r.createMemo(()=>{const s=C();return _e(y(),w()[s],d()[s])}),_=(s,c)=>{v(k=>({...k,[s]:c}))};return e.createComponent(o,{title:"🐝 Swarm Model Setup",size:"large",get children(){var s=Te();return e.insert(s,e.createComponent(r.Show,{get when(){return m()},get children(){var c=We();return e.insert(c,m),c}}),null),e.insert(s,e.createComponent(r.Show,{get when(){return!g()},get fallback(){return(()=>{var c=Ge(),k=c.firstChild;return e.insert(c,e.createComponent(f,{size:"normal"}),k),c})()},get children(){return e.createComponent(r.Show,{get when(){return h()===-1},get fallback(){const c=()=>h(),k=()=>C(),O=()=>me[k()],D=()=>d()[k()],F=()=>w()[k()],Q=()=>F()===D();return(()=>{var P=Ke(),V=P.firstChild,G=V.firstChild,j=G.firstChild,q=j.nextSibling;q.nextSibling;var I=G.nextSibling,B=I.firstChild,U=B.nextSibling;U.nextSibling;var Y=I.nextSibling,R=V.nextSibling,W=R.firstChild,N=W.firstChild,X=N.firstChild;X.firstChild;var H=N.nextSibling,E=W.nextSibling;E.firstChild;var K=R.nextSibling,ee=K.firstChild;return e.insert(G,()=>c()+1,q),e.insert(G,()=>pe.length,null),e.insert(I,()=>O().title,U),e.insert(Y,()=>O().subtitle),W.$$click=()=>_(k(),D()),e.insert(X,D,null),e.insert(H,()=>O().displayLabel),e.insert(E,e.createComponent(Ie,{get value(){return F()},get options(){return S()},get disabled(){return b()},get ariaLabel(){return`${O().title} model`},onChange:T=>_(k(),T)}),null),e.insert(K,e.createComponent(u,{variant:"ghost",get disabled(){return b()},onClick:()=>n(T=>Math.max(-1,T-1)),children:"Back"}),ee),e.insert(ee,e.createComponent(u,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.insert(ee,e.createComponent(r.Show,{get when(){return c()<pe.length-1},get fallback(){return e.createComponent(u,{variant:"contrast",get disabled(){return b()},onClick:()=>{M(w())},get children(){return b()?"Saving...":"Save & Finish"}})},get children(){return e.createComponent(u,{variant:"contrast",get disabled(){return b()},onClick:()=>n(T=>T+1),get children(){return["Next (",e.memo(()=>c()+2),"/",e.memo(()=>pe.length),")"]}})}}),null),e.effect(T=>{var se=`swarm-onboard-option-card${Q()?" is-selected":""}`,ce=`swarm-onboard-custom-card${Q()?"":" is-selected"}`;return se!==T.e&&e.className(W,T.e=se),ce!==T.t&&e.className(E,T.t=ce),T},{e:void 0,t:void 0}),P})()},get children(){var c=Ne(),k=c.firstChild,O=k.nextSibling,D=O.firstChild,F=D.firstChild,Q=F.nextSibling,P=Q.nextSibling,V=D.nextSibling,G=O.nextSibling;return G.firstChild,D.$$click=()=>{M(d())},e.insert(P,e.createComponent(r.For,{each:pe,children:j=>(()=>{var q=Qe(),I=q.firstChild,B=I.nextSibling;return e.insert(I,()=>me[j].title),e.insert(B,()=>d()[j]),q})()})),V.$$click=()=>n(0),e.insert(G,e.createComponent(u,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.effect(j=>{var q=b(),I=b();return q!==j.e&&(D.disabled=j.e=q),I!==j.t&&(V.disabled=j.t=I),j},{e:void 0,t:void 0}),c}})}}),null),s}})}e.delegateEvents(["click"]);var Ze=e.template("<div data-action=swarm-board.sidebarShow>"),Je=e.template("<div data-action=swarm-board.pillbarShow>"),Ye=e.template("<div data-action=swarm-board.showWhenIdle>"),Xe=e.template("<div data-action=swarm-board.composerPill>"),et=e.template("<div data-action=swarm-board.bottomStrip>"),tt=e.template("<div data-action=swarm-board.withSidePanel>"),rt=e.template("<div data-action=swarm-board.toastEnabled>"),nt=e.template("<div data-action=swarm-board.autoSpawnVerifier>"),at=e.template("<div style=display:flex;gap:8px>"),ot=e.template("<div data-action=swarm-board.status>"),st=e.template("<div data-action=swarm-board.uninstall>");function it(t){const{SettingsLayout:u,SettingsSection:o,SettingsRow:f,Switch:g,Button:$}=t.ctx.ui;r.onMount(()=>{!t.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(t.target)}"]`)?.scrollIntoView({block:"start"})})});const b=()=>{const a=t.rpcStatus();if(a.state==="connected"){const m=t.activeSwarmCount();return`Connected to local.opencode-swarm (${m} swarm${m===1?"":"s"} recorded).`}return a.state==="unavailable"?"Server plugin (local.opencode-swarm) is not loaded for this workspace.":a.message?`RPC error: ${a.message}`:"Unable to reach local.opencode-swarm."};return e.createComponent(u,{title:"Swarm Board",get children(){return[e.createComponent(o,{title:"Surfaces",get children(){return[(()=>{var a=Ze();return e.insert(a,e.createComponent(f,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent(g,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:m=>t.updateSetting("sidebarShow",m)})}})),a})(),(()=>{var a=Je();return e.insert(a,e.createComponent(f,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent(g,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:m=>t.updateSetting("pillbarShow",m)})}})),a})(),(()=>{var a=Ye();return e.insert(a,e.createComponent(f,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return e.createComponent(g,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return t.settings().showWhenIdle},onChange:m=>t.updateSetting("showWhenIdle",m)})}})),a})(),(()=>{var a=Xe();return e.insert(a,e.createComponent(f,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent(g,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:m=>t.updateSetting("composerPill",m)})}})),a})(),(()=>{var a=et();return e.insert(a,e.createComponent(f,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent(g,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:m=>t.updateSetting("bottomStrip",m)})}})),a})(),(()=>{var a=tt();return e.insert(a,e.createComponent(f,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent(g,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:m=>t.updateSetting("withSidePanel",m)})}})),a})()]}}),e.createComponent(o,{title:"Notifications",get children(){var a=rt();return e.insert(a,e.createComponent(f,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent(g,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:m=>t.updateSetting("toastEnabled",m)})}})),a}}),e.createComponent(o,{title:"Verification",get children(){var a=nt();return e.insert(a,e.createComponent(f,{title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish before allowing swarm completion",get children(){return e.createComponent(g,{label:"Auto-spawn verifier",hideLabel:!0,get checked(){return t.autoSpawnVerifier?.()??!0},onChange:m=>t.onToggleAutoSpawnVerifier?.(m)})}})),a}}),e.createComponent(o,{title:"Plugin Status & Actions",get children(){var a=ot();return e.insert(a,e.createComponent(f,{title:"Swarm Runtime",get description(){return b()},get children(){var m=at();return e.insert(m,e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onRefresh},children:"Refresh"}),null),e.insert(m,(()=>{var L=e.memo(()=>!!t.onOpenSetupWizard);return()=>L()&&e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onOpenSetupWizard},children:"Setup Role Models"})})(),null),e.insert(m,e.createComponent($,{size:"small",variant:"neutral",get onClick(){return t.onOpenPanel},children:"Open Swarm Board"}),null),m}})),a}}),e.memo(()=>e.memo(()=>!!t.onOpenUninstall)()&&e.createComponent(o,{title:"Uninstall",get children(){var a=st();return e.insert(a,e.createComponent(f,{title:"Uninstall Swarm Plugin",description:"Review the full removal checklist and completely remove Swarm Runtime config, runtime data, worktrees, build artifacts, and temp files",get children(){return e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onOpenUninstall},children:"Uninstall..."})}})),a}}))]}})}var lt=e.template("<div class=swarm-overlay-error>"),dt=e.template("<div class=swarm-uninstall-root>"),ct=e.template("<div class=swarm-overlay-loading><span>Scanning config, git worktrees, runtime data, and temp files..."),ut=e.template("<div class=swarm-uninstall-section><strong>Errors</strong><ul class=swarm-uninstall-list>"),mt=e.template("<div class=swarm-uninstall-section><strong>Final Host Reload Commands</strong><pre class=swarm-uninstall-code>"),pt=e.template("<div class=swarm-uninstall-report><div><strong></strong><span> removed · <!> config(s) updated · <!> skipped · <!> error(s)</span></div><div class=swarm-uninstall-section><strong>Verification Checklist</strong><div class=swarm-uninstall-checks></div></div><div class=swarm-uninstall-footer><span>"),gt=e.template("<div><span></span><div><strong></strong><div class=swarm-uninstall-detail>"),ke=e.template("<li>"),wt=e.template("<div class=swarm-uninstall-plan><p class=swarm-uninstall-intro>Confirm what will be removed from this machine. Unchecked categories will be skipped; source code and backups remain untouched.</p><div class=swarm-uninstall-categories><div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong>6. Swarm GUI Settings Store</strong><span>Reset saved GUI preferences and onboarding state back to defaults.</span></div><span class=swarm-uninstall-count>1 store</span></label></div></div><div class=swarm-uninstall-preserved><strong>Preserved (Not Removed)</strong><ul></ul></div><div class=swarm-uninstall-footer>"),ft=e.template("<ul class=swarm-uninstall-items>"),bt=e.template("<div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong></strong><span></span></div><span class=swarm-uninstall-count>"),ht=e.template("<div class=swarm-uninstall-empty>Nothing detected on disk"),vt=e.template("<li><span class=swarm-uninstall-kind></span><code class=swarm-uninstall-path></code><span class=swarm-uninstall-detail>");function St(t){return typeof t!="number"||t<=0?"":t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:`${(t/(1024*1024)).toFixed(1)} MB`}function xt(t){const{Button:u,Dialog:o,Loader:f}=t.ctx.ui,[g,$]=r.createSignal(!0),[b,a]=r.createSignal(!1),[m,L]=r.createSignal(null),[y,z]=r.createSignal(null),[h,n]=r.createSignal(null),[w,v]=r.createSignal(!0),[d,M]=r.createSignal({pluginRegistration:!0,gitWorktreesAndBranches:!0,runtimeData:!0,buildArtifacts:!0,tempFiles:!0});r.onMount(async()=>{$(!0),L(null);try{const s=await t.loadPlan();if(z(s),s){const c={...d()};for(const k of s.categories)c[k.id]=k.defaultChecked;M(c)}}catch(s){L(s instanceof Error?s.message:String(s))}finally{$(!1)}});const C=r.createMemo(()=>{const s=d();return Object.values(s).filter(Boolean).length+(w()?1:0)}),S=s=>{M(c=>({...c,[s]:!c[s]}))},_=async()=>{a(!0),L(null);try{const s=await t.onExecute(d());w()&&t.onResetGuiStore(),n(s),s?.ok?t.ctx.toast.show({title:"Swarm plugin uninstalled",description:"Reload or restart OpenCode to finish unloading.",variant:"success"}):s&&t.ctx.toast.show({title:"Uninstall completed with warnings",description:`${s.errors.length} error(s) — check verification checklist.`,variant:"error"})}catch(s){L(s instanceof Error?s.message:String(s))}finally{a(!1)}};return e.createComponent(o,{title:"Uninstall Swarm Plugin — Removal Checklist",size:"large",get children(){var s=dt();return e.insert(s,e.createComponent(r.Show,{get when(){return m()},get children(){var c=lt();return e.insert(c,m),c}}),null),e.insert(s,e.createComponent(r.Show,{get when(){return!g()},get fallback(){return(()=>{var c=ct(),k=c.firstChild;return e.insert(c,e.createComponent(f,{size:"normal"}),k),c})()},get children(){return e.createComponent(r.Show,{get when(){return h()===null},get fallback(){const c=()=>h();return(()=>{var k=pt(),O=k.firstChild,D=O.firstChild,F=D.nextSibling,Q=F.firstChild,P=Q.nextSibling,V=P.nextSibling,G=V.nextSibling,j=G.nextSibling,q=j.nextSibling;q.nextSibling;var I=O.nextSibling,B=I.firstChild,U=B.nextSibling,Y=I.nextSibling;return Y.firstChild,e.insert(D,()=>c().ok?"All selected Swarm items removed and verified":"Uninstall completed with remaining items"),e.insert(F,()=>c().removed.length,Q),e.insert(F,()=>c().edited.length,P),e.insert(F,()=>c().skipped.length,G),e.insert(F,()=>c().errors.length,q),e.insert(U,e.createComponent(r.For,{get each(){return c().verification},children:R=>(()=>{var W=gt(),N=W.firstChild,X=N.nextSibling,H=X.firstChild,E=H.nextSibling;return e.insert(N,()=>R.passed?"✓":"✗"),e.insert(H,()=>R.label),e.insert(E,()=>R.detail),e.effect(()=>e.className(W,`swarm-uninstall-check-row${R.passed?" is-pass":" is-fail"}`)),W})()})),e.insert(k,e.createComponent(r.Show,{get when(){return c().errors.length>0},get children(){var R=ut(),W=R.firstChild,N=W.nextSibling;return e.insert(N,e.createComponent(r.For,{get each(){return c().errors},children:X=>(()=>{var H=ke();return e.insert(H,X),H})()})),R}}),Y),e.insert(k,e.createComponent(r.Show,{get when(){return c().nextSteps.length>0},get children(){var R=mt(),W=R.firstChild,N=W.nextSibling;return e.insert(N,()=>c().nextSteps.join(`
`)),R}}),Y),e.insert(Y,e.createComponent(u,{variant:"contrast",onClick:()=>t.onClose(),children:"Close"}),null),e.effect(()=>e.className(O,`swarm-uninstall-banner${c().ok?" is-ok":" is-warn"}`)),k})()},get children(){return e.createComponent(r.Show,{get when(){return y()},children:c=>(()=>{var k=wt(),O=k.firstChild,D=O.nextSibling,F=D.firstChild,Q=F.firstChild,P=Q.firstChild,V=D.nextSibling,G=V.firstChild,j=G.nextSibling,q=V.nextSibling;return e.insert(D,e.createComponent(r.For,{get each(){return c().categories},children:I=>{const B=()=>d()[I.id];return(()=>{var U=bt(),Y=U.firstChild,R=Y.firstChild,W=R.nextSibling,N=W.firstChild,X=N.nextSibling,H=W.nextSibling;return R.addEventListener("change",()=>S(I.id)),e.insert(N,()=>I.title),e.insert(X,()=>I.description),e.insert(H,(()=>{var E=e.memo(()=>I.items.length===0);return()=>E()?"Clean":`${I.items.length} item${I.items.length===1?"":"s"}`})()),e.insert(U,e.createComponent(r.Show,{get when(){return I.items.length>0},get fallback(){return ht()},get children(){var E=ft();return e.insert(E,e.createComponent(r.For,{get each(){return I.items},children:K=>(()=>{var ee=vt(),T=ee.firstChild,se=T.nextSibling,ce=se.nextSibling;return e.insert(T,()=>K.kind),e.insert(se,()=>K.path),e.insert(ce,()=>K.detail,null),e.insert(ce,(()=>{var we=e.memo(()=>!!K.sizeBytes);return()=>we()?` (${St(K.sizeBytes)})`:""})(),null),ee})()})),E}}),null),e.effect(E=>{var K=`swarm-uninstall-card${B()?" is-checked":""}`,ee=b();return K!==E.e&&e.className(U,E.e=K),ee!==E.t&&(R.disabled=E.t=ee),E},{e:void 0,t:void 0}),e.effect(()=>R.checked=B()),U})()}}),F),P.addEventListener("change",()=>v(I=>!I)),e.insert(j,e.createComponent(r.For,{get each(){return c().preserved},children:I=>(()=>{var B=ke();return e.insert(B,I),B})()})),e.insert(q,e.createComponent(u,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onClose(),children:"Cancel"}),null),e.insert(q,e.createComponent(u,{variant:"contrast",get disabled(){return b()||C()===0},onClick:()=>{_()},get children(){return b()?"Removing...":"Confirm & Remove Selected Items"}}),null),e.effect(I=>{var B=`swarm-uninstall-card${w()?" is-checked":""}`,U=b();return B!==I.e&&e.className(F,I.e=B),U!==I.t&&(P.disabled=I.t=U),I},{e:void 0,t:void 0}),e.effect(()=>P.checked=w()),k})()})}})}}),null),s}})}const ve="swarm-board",Ce=le.Schema.Struct({sidebarShow:le.Schema.Boolean,pillbarShow:le.Schema.Boolean,showWhenIdle:le.Schema.Boolean,composerPill:le.Schema.Boolean,bottomStrip:le.Schema.Boolean,withSidePanel:le.Schema.Boolean,toastEnabled:le.Schema.Boolean,onboardingComplete:le.Schema.Boolean}),be={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0,onboardingComplete:!1};function yt(t,u,o){return t!==u?!1:(o(),!0)}function he(t){if(!t)return"";const u=t.posts.length>0?String(t.posts[t.posts.length-1]?.id??""):"",o=t.members.map(f=>`${f.handle}:${f.state}:${f.trackStatus??""}`).join("|");return[t.swarmId,t.status,t.boardUrl??"",t.stalled?"1":"0",t.verifierStatus??"",String(t.posts.length),u,o].join("\0")}function $t(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(o=>({id:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),activeCount:typeof o.activeCount=="number"?o.activeCount:void 0,waitingCount:typeof o.waitingCount=="number"?o.waitingCount:void 0,postCount:typeof o.postCount=="number"?o.postCount:typeof o.post_count=="number"?o.post_count:void 0,updatedAt:o.updatedAt??(typeof o.updated_at=="number"?new Date(o.updated_at).toISOString():void 0)}))}function kt(t){if(!t||typeof t!="object")return null;const u=t;if(typeof u.swarmId=="string"&&Array.isArray(u.posts))return u;const o=u.swarm;if(!o||typeof o!="object")return null;const f=Array.isArray(u.members)?u.members:[],g=Array.isArray(u.board_posts)?u.board_posts:Array.isArray(u.posts)?u.posts:[],$=Array.isArray(u.file_locks)?u.file_locks:Array.isArray(u.locks)?u.locks:[],b=f.map(n=>({handle:String(n.handle??n.name??""),role:typeof n.role=="string"?n.role:void 0,state:String(n.state??"waiting"),model:typeof n.model=="string"?n.model:void 0,variant:typeof n.variant=="string"?n.variant:void 0,trackStatus:typeof n.track_status=="string"?n.track_status:n.trackStatus,ownedGlobs:Array.isArray(n.owned_globs)?n.owned_globs:Array.isArray(n.ownedGlobs)?n.ownedGlobs:[],sessionId:typeof n.session_id=="string"?n.session_id:n.sessionId,session_id:typeof n.session_id=="string"?n.session_id:n.sessionId})),a=g.map(n=>({id:n.seq??n.id??0,seq:typeof n.seq=="number"?n.seq:void 0,author:String(n.author??""),body:String(n.body??""),createdAt:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.createdAt,created_at:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.created_at,mentions:Array.isArray(n.mentions)?n.mentions:[]})),m=$.map(n=>({glob:String(n.glob_pattern??n.glob??""),owner:String(n.owner_handle??n.owner??""),acquiredAt:typeof n.claimed_at=="number"?new Date(n.claimed_at).toISOString():n.acquiredAt})),L=f.some(n=>!!n.paused_quota),y=[...a].reverse().find(n=>n.author.replace(/^@/,"").toLowerCase()==="verifier"),z=y?/\bFAIL\b/i.test(y.body)?"FAIL":/\bPASS\b/i.test(y.body)?"PASS":void 0:void 0,h=[];for(const n of a)if(n.mentions&&n.mentions.length>0)for(const w of n.mentions)h.push({from:n.author,to:w.startsWith("@")?w:`@${w}`,summary:n.body.slice(0,80),at:n.createdAt});return{swarmId:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),boardUrl:typeof u.boardUrl=="string"?u.boardUrl:void 0,pausedQuota:L,paused_quota:L,stalled:!!u.stalled,verifierStatus:z,members:b,posts:a,locks:m,handoffs:h}}var Ct=e.template("<span>"),_t=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),It=e.template("<div style=padding:12px>Loading Swarm Board...");const At=r.lazy(()=>Promise.resolve().then(()=>Dt)),zt=[{id:ve,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"},{id:"swarm-board.autoSpawnVerifier",title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish",keywords:"swarm verifier auto spawn gate verification"},{id:"swarm-board.status",title:"Setup Role Models",description:"Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",keywords:"swarm models onboarding wizard setup"},{id:"swarm-board.uninstall",title:"Uninstall Swarm Plugin",description:"Review removal checklist and completely uninstall Swarm Runtime",keywords:"swarm uninstall remove cleanup reset"}],Mt=`
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`,Rt=Z.Plugin.define({stores:{settings:Z.Store.global(Ce,be)},setup(t){const u=t.stores?.settings??t.storage.store("swarm.settings",{schema:Ce,initial:be}),o=()=>u.value??be,f=(i,l)=>{u.set({...o(),[i]:l})},g=(i,l)=>{try{return t.add(i,l)}catch(p){return console.warn("[opencode-swarm] OpenCode did not accept a GUI item:",p),()=>{}}};g(Z.Style,ze);const[$,b]=r.createSignal([]),[a,m]=r.createSignal(null),[L,y]=r.createSignal(null),[z,h]=r.createSignal(null),[n,w]=r.createSignal(null),[v,d]=r.createSignal(""),[M,C]=r.createSignal(void 0),[S,_]=r.createSignal({state:"connected"}),[s,c]=r.createSignal(!0);let k=!1,O="",D=!1,F="",Q=null,P=0,V=null,G=he(null);const j=()=>t.sessions.current()?.id??null,q=()=>n()!==null,I=()=>t.sessions.current()?.location?.directory??M(),B=()=>t.client.rpc(xe),U=(i=8e3)=>{const l=t.sessions.current()?.location??(M()?{directory:M()}:void 0),p=AbortSignal.timeout(i);return l?{location:l,signal:p}:{signal:p}},Y=i=>{if(!o().toastEnabled)return;const l=!!(i.pausedQuota??i.paused_quota);l&&!k&&t.toast.show({title:"Swarm paused on quota",description:i.title||i.swarmId,variant:"error"}),k=l;const p=(i.verifierStatus??"").toUpperCase();(p==="PASS"||p==="FAIL")&&p!==O&&t.toast.show({title:`@verifier ${p}`,description:i.title||i.swarmId,variant:p==="PASS"?"success":"error"}),O=p;const x=[...i.posts].reverse().find(A=>A.author.replace(/^@/,"").toLowerCase()==="monitor");i.stalled&&!D?t.toast.show({title:"@monitor stall nudge",description:x?.body??"Swarm appears stalled"}):x&&x.id!==Q&&Q!==null&&t.toast.show({title:"@monitor stall nudge",description:x.body}),D=!!i.stalled,x&&(Q=x.id),i.status==="completed"&&F!==i.swarmId&&(F=i.swarmId,t.toast.show({title:"Swarm completed",description:i.title||i.swarmId,variant:"success"}))},R=async()=>{const i=++P;try{const l=B(),p=U(),x=await l.listSwarms({},p);if(i!==P)return;const A=$t(x);b(A);const te=a();te&&!A.some(ue=>ue.id===te)&&(m(null),y(null));const re=j(),ae=re?L():null,fe=!!re&&!ae,de=await l.getSwarmSnapshot(ae?{swarmId:ae}:re?{sessionId:re}:{},p);if(i!==P)return;de&&typeof de=="object"&&typeof de.boardUrl=="string"&&de.boardUrl&&d(de.boardUrl);const ie=kt(de),ge=he(ie);ge!==G&&(G=ge,h(ie)),fe&&ie&&w(ie.swarmId),S().state!=="connected"&&_({state:"connected"}),l.getRoleConfig(ae?{swarmId:ae}:re?{sessionId:re}:{},p).then(ue=>{yt(i,P,()=>{const Se=ue&&typeof ue=="object"&&"output"in ue?ue.output:ue;typeof Se?.autoSpawnVerifier=="boolean"&&c(Se.autoSpawnVerifier)})}).catch(()=>{}),ie&&Y(ie)}catch(l){if(i!==P)return;const x=typeof l=="object"&&l!==null&&"type"in l&&l.type==="rpc.unavailable"?{state:"unavailable"}:{state:"error",message:l instanceof Error?l.message:String(l)},A=S();A.state===x.state&&(x.state!=="error"||A.message===x.message)||_(x)}};r.createEffect(()=>{I();const i=j();t.sessions.current()?.pending,a(),i!==V&&(V=i,y(null),m(null),h(null),G=he(null),w(null),d(""),b([])),R()});let W=null,N;const X=()=>{if(W!==t.client){N?.abort(),W=t.client,N=new AbortController;try{t.client.rpc(xe).events.on("changed",()=>{R()},{signal:N.signal})}catch{}}};X(),r.createEffect(()=>{try{const i=t.servers;if(!i)return;const p=i.list().map(A=>i.get(A)).find(A=>A?.builtin)?.data;if(!p||typeof p.on!="function")return;const x=p.on("session.tool.success",()=>{R()});r.onCleanup(()=>x())}catch{}});const H=setInterval(()=>{X(),R()},2e3);r.onCleanup(()=>{N?.abort(),clearInterval(H)});const E=r.createMemo(()=>{const i=z();if(!i)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let l=0,p=0;for(const x of i.members){const A=x.state.toLowerCase();A==="working"||A==="active"?l++:(A==="waiting"||A==="idle")&&p++}return{active:l,waiting:p,posts:i.posts.length,paused:!!(i.pausedQuota??i.paused_quota),stalled:!!i.stalled}}),K=(i=!1)=>{if(!o().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const l=t.sessions.current();if(!l){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const p=`${t.id}:swarm`;if(i&&t.layout.state(p,l)==="visible"){t.layout.hide(p,l);return}t.layout.open(p,l)},ee=()=>{t.layout.settings(ve)},T=r.createMemo(()=>{const i=z(),l=E();return!!(i&&(l.active>0||i.status==="running"&&i.members.some(p=>p.state.toLowerCase()==="working")))});g(Z.Style,()=>T()?Mt:void 0);const se=()=>{t.dialogs.open(i=>e.createComponent(He,{ctx:t,loadRoleConfig:async()=>{const l=a(),p=t.sessions.current()?.id;return await B().getRoleConfig(l?{swarmId:l}:p?{sessionId:p}:{},U())},onApplyModels:async l=>{const p=[],x=a(),A=t.sessions.current()?.id;for(const te of["coordinator","worker","verifier","monitor"]){const re=l[te];if(!re)continue;const ae=await B().setRoleModel({role:te,model:re,...x?{swarmId:x}:{},...A?{sessionId:A}:{}},U());ae?.ok||p.push(`${te}: ${ae?.error??"failed"}`)}return R(),{ok:p.length===0,errors:p}},onComplete:()=>{f("onboardingComplete",!0),i.close()},onSkip:()=>{f("onboardingComplete",!0),i.close()}}))},ce=()=>{t.dialogs.open(i=>e.createComponent(qe,{ctx:t,snapshot:z,counts:E,isBuzzing:T,loadRoleConfig:async()=>{const l=a(),p=t.sessions.current()?.id;return await B().getRoleConfig(l?{swarmId:l}:p?{sessionId:p}:{},U())},onSetRoleModel:async(l,p)=>{const x=a(),A=t.sessions.current()?.id,te=await B().setRoleModel({role:l,model:p,...x?{swarmId:x}:{},...A?{sessionId:A}:{}},U());return R(),te},onOpenBoard:()=>K(!1),onOpenSetupWizard:()=>{i.close(),se()},onClose:()=>i.close()}))},we=()=>{t.dialogs.open(i=>e.createComponent(xt,{ctx:t,loadPlan:async()=>await B().previewUninstall({},U(3e4)),onExecute:async l=>await B().executeUninstall({categories:l},U(12e4)),onResetGuiStore:()=>{u.set(be)},onClose:()=>i.close()}))};g(Z.SettingsPage,()=>({id:ve,title:"Swarm Board",icon:"dot-grid",entries:zt,render:({target:i})=>e.createComponent(it,{ctx:t,settings:o,updateSetting:f,rpcStatus:S,activeSwarmCount:()=>$().length,autoSpawnVerifier:s,onToggleAutoSpawnVerifier:async l=>{const p=s();c(l);try{const x=await B().setAutoSpawnVerifier({enabled:l},U()),A=x&&typeof x=="object"&&"output"in x?x.output:x;typeof A?.autoSpawnVerifier=="boolean"&&c(A.autoSpawnVerifier)}catch(x){c(p),t.toast.show({title:"Failed to update Auto-spawn verifier",description:x instanceof Error?x.message:String(x),variant:"error"})}},onOpenPanel:()=>K(!1),onOpenSetupWizard:se,onOpenUninstall:we,onRefresh:()=>{R()},target:i})})),g(Z.TitlebarItem,()=>{if(!q()||!o().pillbarShow)return;const i=z(),l=t.sessions.current(),p=l?t.layout.state(`${t.id}:swarm`,l)==="visible":!1,x=E(),A=x.paused||x.stalled?" ⚠":"";return{id:"swarm-open",label:T()?`🐝 Swarm: Buzzing (${x.active} active · ${x.posts} posts)${A}`:i?`🐝 Swarm: Dozing (${x.posts} posts)${A}`:"🐝 Swarm: Dozing",title:x.paused?"Swarm paused on quota — click to open Swarm Board":x.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:p,run:()=>K(!0)}}),g(Z.ComposerPill,{id:"swarm-composer-pill",show(i){if(i.session.directory&&C(i.session.directory),!q()||!o().composerPill)return;const l=z(),p=E(),x=(l?.verifierStatus??"").toUpperCase();let A;return p.paused||x==="FAIL"?A="danger":p.stalled&&(A="warning"),{label:T()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",...A?{tone:A}:{},title:"Click to configure Swarm role models or open Board",run:()=>ce()}}}),g(Z.Slot,{at:"window.bottom",render:()=>{const i=()=>{if(!q()||!o().bottomStrip)return!1;const l=t.sessions.current();return!(l?t.layout.state(`${t.id}:swarm`,l)==="visible":!1)||o().withSidePanel};return e.createComponent(r.Show,{get when(){return i()},get children(){var l=_t(),p=l.firstChild,x=p.firstChild,A=x.nextSibling,te=A.nextSibling,re=te.nextSibling,ae=re.nextSibling,fe=ae.nextSibling,de=fe.nextSibling,ie=de.nextSibling;return ie.nextSibling,l.$$click=()=>K(!0),e.insert(p,()=>z()?.title??"Idle",A),e.insert(p,()=>E().active,re),e.insert(p,()=>E().waiting,fe),e.insert(p,()=>E().posts,ie),e.insert(l,e.createComponent(r.Show,{get when(){return E().paused||E().stalled},get children(){var ge=Ct();return e.insert(ge,()=>E().paused?"Paused on quota":"Stalled"),ge}}),null),l}})}}),g(Z.MenuItem,()=>{if(!q())return;const i=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:i?t.layout.state(`${t.id}:swarm`,i)!=="closed":!1,run:()=>K(!1)}}),g(Z.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>K(!1)})),g(Z.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>ee()})),g(Z.Command,()=>({id:"setup-models",title:"Swarm Model Setup Wizard",description:"Choose recommended or manual models for Swarm roles",group:"Swarm",section:"model",run:()=>se()})),g(Z.Command,()=>({id:"uninstall",title:"Uninstall Swarm Plugin",description:"Open the Swarm removal checklist and completely uninstall Swarm Runtime",group:"Swarm",section:"general",run:()=>we()}));const Ae={id:"swarm",title:"Swarm",pinned:!1};g(Z.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return q()&&o().sidebarShow?[Ae]:[]},render(i){return i.session.directory&&C(i.session.directory),e.createComponent(r.Suspense,{get fallback(){return It()},get children(){return e.createComponent(At,{ctx:t,snapshot:z,boardUrl:v,swarms:$,selectedSwarmId:a,sessionId:()=>i.session.id,onSelectSwarm:l=>{y(l),m(l)},onRefresh:()=>{R()},onOpenSettings:ee,rpcError:()=>{const l=S();if(l.state==="unavailable")return"Server plugin (local.opencode-swarm) is not loaded for this workspace.";if(l.state==="error")return l.message},onCompleteSwarm:async l=>{await B().completeSwarm({swarmId:l},U()),await R()},get server(){return i.session.server}})}})}})}});e.delegateEvents(["click"]);var Et=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),Lt=e.template("<option>"),Pt=e.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),Bt=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),Ot=e.template("<option> (<!>)"),Ut=e.template("<div class=swarm-gui-empty>");function Vt(t){const{Button:u,Dialog:o}=t.ctx.ui,[f,g]=r.createSignal(0);let $;const b=r.createMemo(()=>t.snapshot()?.boardUrl||t.boardUrl?.()||""),a=r.createMemo(()=>t.selectedSwarmId()??t.snapshot()?.swarmId??""),m=r.createMemo(()=>{const h=b();if(!h)return"";const n=a(),w=t.sessionId?.()??"",v=f();try{const d=new URL(h);return n&&d.searchParams.set("swarmId",n),w&&d.searchParams.set("conversationId",w),v>0&&d.searchParams.set("_r",String(v)),d.toString()}catch{return h}}),L=r.createMemo(()=>{const h=m();if(!h)return"";try{return new URL(h).origin}catch{return""}}),y=()=>{const h=$?.contentWindow,n=L();if(!h||!n)return;const w=t.ctx.appearance.mode(),v=typeof document<"u"?getComputedStyle(document.documentElement):null,d=S=>v?.getPropertyValue(S).trim()||"",M={},C=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[S,_]of C){const s=d(_);s&&(M[S]=s)}h.postMessage({type:"swarm:theme",mode:w,tokens:M},n)};if(r.createEffect(()=>{t.ctx.appearance.mode(),y()}),typeof window<"u"){const h=n=>{if(n.source!==$?.contentWindow)return;const w=L();if(w&&n.origin!==w)return;const v=n.data;if(v?.type==="swarm:open_session"&&typeof v.sessionID=="string"&&v.sessionID){const d=t.server,M=typeof d=="string"?d:d?.id??t.ctx.sessions.current()?.server.id;if(!M){t.ctx.toast.show({title:"No server context for member session"});return}t.ctx.tabs.open({server:M,id:v.sessionID},{focus:!0})}};window.addEventListener("message",h),r.onCleanup(()=>window.removeEventListener("message",h))}const z=()=>{const h=t.snapshot();h&&t.ctx.dialogs.open(n=>e.createComponent(o,{title:"Complete Swarm?",get children(){var w=Et(),v=w.firstChild,d=v.firstChild,M=d.nextSibling,C=v.nextSibling;return e.insert(M,()=>h.title||h.swarmId),e.insert(C,e.createComponent(u,{variant:"ghost",onClick:()=>n.close(),children:"Cancel"}),null),e.insert(C,e.createComponent(u,{variant:"danger",onClick:async()=>{try{await t.onCompleteSwarm(h.swarmId),n.close()}catch(S){t.ctx.toast.show({title:"Failed to complete swarm",description:S instanceof Error?S.message:String(S),variant:"error"})}},children:"Complete Swarm"}),null),w}}))};return(()=>{var h=Bt(),n=h.firstChild,w=n.firstChild;return w.addEventListener("change",v=>t.onSelectSwarm(v.currentTarget.value)),e.insert(w,e.createComponent(r.Show,{get when(){return t.swarms().length===0},get children(){var v=Lt();return e.insert(v,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>v.value=t.snapshot()?.swarmId??""),v}}),null),e.insert(w,e.createComponent(r.For,{get each(){return t.swarms()},children:v=>(()=>{var d=Ot(),M=d.firstChild,C=M.nextSibling;return C.nextSibling,e.insert(d,()=>v.title||v.id,M),e.insert(d,()=>v.status,C),e.effect(()=>d.value=v.id),d})()}),null),e.insert(n,e.createComponent(u,{size:"small",variant:"ghost",onClick:()=>{t.onRefresh(),g(v=>v+1)},children:"Refresh"}),null),e.insert(n,e.createComponent(r.Show,{get when(){return t.snapshot()?.status==="running"},get children(){return e.createComponent(u,{size:"small",variant:"neutral",onClick:z,children:"Complete"})}}),null),e.insert(n,e.createComponent(r.Show,{get when(){return t.onOpenSettings},get children(){return e.createComponent(u,{size:"small",variant:"ghost",onClick:()=>t.onOpenSettings?.(),children:"Settings"})}}),null),e.insert(h,e.createComponent(r.Show,{get when(){return m()},get fallback(){return(()=>{var v=Ut();return e.insert(v,()=>t.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),v})()},get children(){var v=Pt();return v.addEventListener("load",()=>y()),e.use(d=>{$=d},v),e.effect(()=>e.setAttribute(v,"src",m())),v}}),null),e.effect(()=>w.value=a()),h})()}const Dt=Object.freeze(Object.defineProperty({__proto__:null,default:Vt},Symbol.toStringTag,{value:"Module"}));exports.default=Rt;
