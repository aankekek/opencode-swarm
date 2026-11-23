"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),X=require("@opencode/plugin/gui"),n=require("solid-js"),ie=require("effect");function ee(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function ne(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(m){const o=t(m);return o?{issues:[{message:o}]}:{value:m}}}}}function oe(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(m){const o=m===void 0?{}:m;if(!ee(o))return{issues:[{message:"input must be an object"}]};const v=t(o);return v?{issues:[{message:v}]}:{value:o}}}}}const he={id:"local.opencode-swarm",methods:{getBoardInfo:{input:oe(()=>null),output:ne(t=>ee(t)&&typeof t.url=="string"&&typeof t.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:oe(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ne(t=>ee(t)&&Array.isArray(t.members)&&Array.isArray(t.board_posts)&&Array.isArray(t.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:oe(t=>t.limit!==void 0&&typeof t.limit!="number"?"limit must be a number":null),output:ne(t=>ee(t)&&Array.isArray(t.swarms)?null:"output must contain swarms array")},completeSwarm:{input:oe(t=>typeof t.swarmId!="string"?"swarmId must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ne(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:oe(t=>typeof t.swarmId!="string"?"swarmId must be a string":typeof t.handle!="string"?"handle must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ne(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:oe(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ne(t=>ee(t)&&ee(t.roleModels)&&Array.isArray(t.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:oe(t=>typeof t.role!="string"?"role must be a string":typeof t.model!="string"?"model must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":null),output:ne(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must be SetRoleModelResult")},setAutoSpawnVerifier:{input:oe(t=>typeof t.enabled=="boolean"?null:"enabled must be a boolean"),output:ne(t=>ee(t)&&typeof t.ok=="boolean"&&typeof t.autoSpawnVerifier=="boolean"?null:"output must contain ok and autoSpawnVerifier booleans")},previewUninstall:{input:oe(()=>null),output:ne(t=>ee(t)&&Array.isArray(t.categories)&&Array.isArray(t.preserved)?null:"output must be UninstallPlan")},executeUninstall:{input:oe(t=>t.categories!==void 0&&!ee(t.categories)?"categories must be an object":null),output:ne(t=>ee(t)&&typeof t.ok=="boolean"&&Array.isArray(t.verification)?null:"output must be UninstallResult")}},events:{changed:{schema:ne(t=>ee(t)&&typeof t.swarmId=="string"&&typeof t.reason=="string"?null:"event must contain swarmId and reason")}}},Ce=`
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
`,ue={coordinator:{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination",displayLabel:"Muse Spark 1.3 · xhigh",patterns:[/^muse-spark-1\.3/i,/muse[\s._-]*spark[\s._-]*1\.3/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"xhigh",fallbackSpec:"opencode-go/muse-spark-1.3-contributor#xhigh"},worker:{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · high",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"high",fallbackSpec:"opencode-go/deepseek-v4.1-flash#high"},verifier:{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · max",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"max",fallbackSpec:"opencode-go/deepseek-v4.1-flash#max"},monitor:{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads",displayLabel:"GLM 5.3 Flash · default",patterns:[/^glm-5\.3-flash$/i,/glm[\s._-]*5\.3[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:void 0,fallbackSpec:"opencode-go/glm-5.3-flash"}};function ve(t,m){const o={};for(const v of["coordinator","worker","verifier","monitor"]){const g=ue[v];let $;for(const b of g.preferredProviders)if($=t.find(a=>a.providerID.toLowerCase()===b.toLowerCase()&&g.patterns.some(p=>p.test(a.id)||(a.name?p.test(a.name):!1))),$)break;if($||($=t.find(b=>g.patterns.some(a=>a.test(b.id)||(b.name?a.test(b.name):!1)))),$){const b=`${$.providerID}/${$.id}`;if(g.preferredVariant){const a=($.variants??[]).find(p=>p.toLowerCase()===g.preferredVariant.toLowerCase());o[v]=a?`${b}#${a}`:b}else o[v]=b}else{const b=m?.[v];o[v]=b&&b.trim()?b.trim():g.fallbackSpec}}return o}function $e(t,m,o){const v=[],g=new Set;for(const a of t){const p=`${a.providerID}/${a.id}`;g.has(p)||(g.add(p),v.push({spec:p,label:a.name?`${p} (${a.name})`:p}));for(const E of a.variants??[]){const y=`${p}#${E}`;g.has(y)||(g.add(y),v.push({spec:y,label:y}))}}if(m&&!g.has(m)&&(g.add(m),v.push({spec:m,label:m})),o&&!g.has(o)&&(g.add(o),v.push({spec:o,label:o})),v.sort((a,p)=>a.label.localeCompare(p.label,void 0,{sensitivity:"base",numeric:!0})),!o)return v;let $;const b=[];for(const a of v)a.spec===o?$={...a,isRecommended:!0}:b.push(a);return $?[$,...b]:b}var _e=e.template('<div role=listbox><div class=swarm-model-select-search-wrap><input type=search class=swarm-model-select-search placeholder="Search models..."></div><div class=swarm-model-select-list>'),Ie=e.template("<div class=swarm-model-select><button type=button class=swarm-model-select-trigger aria-haspopup=listbox><span class=swarm-model-select-value></span><span class=swarm-model-select-caret aria-hidden=true>▾"),Ae=e.template("<div class=swarm-model-select-empty>No matching models"),ze=e.template("<span class=swarm-model-select-badge>Recommended"),Me=e.template("<span class=swarm-model-select-check aria-hidden=true>✓"),Re=e.template("<button type=button role=option><span class=swarm-model-select-item-label></span><span class=swarm-model-select-item-right>");function ke(t){const[m,o]=n.createSignal(!1),[v,g]=n.createSignal("");let $,b;const a=n.createMemo(()=>{const y=v().trim().toLowerCase();if(!y)return t.options;const A=y.split(/\s+/).filter(Boolean);return t.options.filter(h=>{const r=`${h.label} ${h.spec}`.toLowerCase();return A.every(f=>r.includes(f))})}),p=n.createMemo(()=>{const y=t.value;if(!y)return t.placeholder??"Select model...";const A=t.options.find(h=>h.spec===y);return A?A.label:y});n.createEffect(()=>{if(!m())return;g(""),queueMicrotask(()=>{b?.focus()});const y=h=>{$&&!$.contains(h.target)&&o(!1)},A=h=>{h.key==="Escape"&&(h.stopPropagation(),o(!1))};document.addEventListener("mousedown",y),document.addEventListener("keydown",A,!0),n.onCleanup(()=>{document.removeEventListener("mousedown",y),document.removeEventListener("keydown",A,!0)})});const E=y=>{o(!1),g(""),y!==t.value&&t.onChange(y)};return(()=>{var y=Ie(),A=y.firstChild,h=A.firstChild,r=$;return typeof r=="function"?e.use(r,y):$=y,A.$$click=()=>{t.disabled||o(f=>!f)},e.insert(h,p),e.insert(y,e.createComponent(n.Show,{get when(){return m()},get children(){var f=_e(),w=f.firstChild,l=w.firstChild,z=w.nextSibling;l.$$keydown=S=>{if(S.key==="Enter"){S.preventDefault();const _=a()[0];_&&E(_.spec)}else S.key==="Escape"&&(S.preventDefault(),S.stopPropagation(),o(!1))},l.$$input=S=>g(S.currentTarget.value);var C=b;return typeof C=="function"?e.use(C,l):b=l,e.insert(z,e.createComponent(n.Show,{get when(){return a().length>0},get fallback(){return Ae()},get children(){return e.createComponent(n.For,{get each(){return a()},children:S=>{const _=()=>S.spec===t.value;return(()=>{var i=Re(),c=i.firstChild,k=c.nextSibling;return i.$$click=()=>E(S.spec),e.insert(c,()=>S.label),e.insert(k,e.createComponent(n.Show,{get when(){return S.isRecommended},get children(){return ze()}}),null),e.insert(k,e.createComponent(n.Show,{get when(){return _()},get children(){return Me()}}),null),e.effect(B=>{var V=_(),O=`swarm-model-select-item${_()?" is-selected":""}`;return V!==B.e&&e.setAttribute(i,"aria-selected",B.e=V),O!==B.t&&e.className(i,B.t=O),B},{e:void 0,t:void 0}),i})()}})}})),e.effect(S=>{var _=`swarm-model-select-menu${t.menuUpward?" swarm-model-select-menu-upward":""}`,i=`${t.ariaLabel} options`;return _!==S.e&&e.className(f,S.e=_),i!==S.t&&e.setAttribute(f,"aria-label",S.t=i),S},{e:void 0,t:void 0}),e.effect(()=>l.value=v()),f}}),null),e.effect(f=>{var w=t.disabled,l=t.ariaLabel,z=m();return w!==f.e&&(A.disabled=f.e=w),l!==f.t&&e.setAttribute(A,"aria-label",f.t=l),z!==f.a&&e.setAttribute(A,"aria-expanded",f.a=z),f},{e:void 0,t:void 0,a:void 0}),y})()}e.delegateEvents(["click","input","keydown"]);var Ee=e.template("<div class=swarm-overlay-error>"),Le=e.template("<div class=swarm-overlay-roles>"),Pe=e.template("<div class=swarm-overlay-root><div class=swarm-overlay-top><div class=swarm-overlay-status><span class=swarm-overlay-badge></span><div class=swarm-overlay-meta><strong></strong><span> active · <!> waiting · <!> posts</span></div></div><div class=swarm-overlay-actions>"),Be=e.template("<div class=swarm-overlay-loading><span>Loading role models..."),Oe=e.template("<span class=swarm-overlay-role-count>"),Ue=e.template("<div class=swarm-overlay-role-row><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><strong></strong></div><span class=swarm-overlay-role-sub></span></div><div class=swarm-overlay-select-wrap>");const Se=[{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination"},{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)"},{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)"},{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads"}];function De(t){const{Button:m,Dialog:o,Loader:v}=t.ctx.ui,[g,$]=n.createSignal(null),[b,a]=n.createSignal(!0),[p,E]=n.createSignal(null),[y,A]=n.createSignal(null),h=async()=>{a(!0),A(null);try{const l=await t.loadRoleConfig();$(l)}catch(l){A(l instanceof Error?l.message:String(l))}finally{a(!1)}};n.onMount(()=>{h()});const r=l=>{const z=g()?.roleModels[l]??"";return $e(g()?.models??[],z)},f=l=>{const z=t.snapshot();if(!z)return{working:0,waiting:0};let C=0,S=0;for(const _ of z.members){if((_.role??"").toLowerCase()!==l)continue;const i=_.state.toLowerCase();i==="working"||i==="active"?C++:(i==="waiting"||i==="idle")&&S++}return{working:C,waiting:S}},w=async(l,z)=>{if(z){E(l),A(null);try{const C=await t.onSetRoleModel(l,z);if(!C||!C.ok){const _=C?.error??`Failed to switch ${l} model`;A(_),t.ctx.toast.show({title:`Failed to switch ${l}`,description:_,variant:"error"});return}$(_=>_&&{..._,roleModels:{..._.roleModels,[l]:C.model}});const S=C.rerunMembers.length>0?`Stopped, switched & rerunning: ${C.rerunMembers.map(_=>`@${_}`).join(", ")}`:C.switchedMembers.length>0?`Updated: ${C.switchedMembers.map(_=>`@${_}`).join(", ")}`:`Default saved for next ${l}`;t.ctx.toast.show({title:`${l} → ${C.model}`,description:S,variant:"success"})}catch(C){const S=C instanceof Error?C.message:String(C);A(S),t.ctx.toast.show({title:`Failed to switch ${l}`,description:S,variant:"error"})}finally{E(null)}}};return e.createComponent(o,{title:"🐝 Swarm Control",size:"large",get children(){var l=Pe(),z=l.firstChild,C=z.firstChild,S=C.firstChild,_=S.nextSibling,i=_.firstChild,c=i.nextSibling,k=c.firstChild,B=k.nextSibling,V=B.nextSibling,O=V.nextSibling;O.nextSibling;var T=C.nextSibling;return e.insert(S,()=>t.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing"),e.insert(i,()=>t.snapshot()?.title??"No active swarm"),e.insert(c,()=>t.counts().active,k),e.insert(c,()=>t.counts().waiting,B),e.insert(c,()=>t.counts().posts,O),e.insert(T,e.createComponent(n.Show,{get when(){return t.onOpenSetupWizard},get children(){return e.createComponent(m,{variant:"ghost",size:"small",onClick:()=>t.onOpenSetupWizard?.(),children:"Setup Wizard"})}}),null),e.insert(T,e.createComponent(m,{variant:"contrast",onClick:()=>{t.onOpenBoard(),t.onClose()},children:"Board"}),null),e.insert(l,e.createComponent(n.Show,{get when(){return y()},get children(){var F=Ee();return e.insert(F,y),F}}),null),e.insert(l,e.createComponent(n.Show,{get when(){return!b()||g()!==null},get fallback(){return(()=>{var F=Be(),j=F.firstChild;return e.insert(F,e.createComponent(v,{size:"normal"}),j),F})()},get children(){var F=Le();return e.insert(F,e.createComponent(n.For,{each:Se,children:(j,H)=>{const R=()=>f(j.role),L=()=>g()?.roleModels[j.role]??"",I=()=>p()===j.role,P=n.createMemo(()=>r(j.role));return(()=>{var N=Ue(),Z=N.firstChild,U=Z.firstChild,q=U.firstChild,D=U.nextSibling,G=Z.nextSibling;return e.insert(q,()=>j.title),e.insert(U,e.createComponent(n.Show,{get when(){return R().working>0||R().waiting>0},get children(){var K=Oe();return e.insert(K,(()=>{var W=e.memo(()=>R().working>0);return()=>W()?`${R().working} working`:`${R().waiting} waiting`})()),K}}),null),e.insert(D,()=>j.subtitle),e.insert(G,e.createComponent(ke,{get value(){return L()},get options(){return P()},get disabled(){return I()},get ariaLabel(){return`${j.title} model`},get menuUpward(){return H()>=Se.length-1},onChange:K=>{w(j.role,K)}})),N})()}})),F}}),null),l}})}var Ve=e.template("<div class=swarm-overlay-error>"),Fe=e.template('<div class=swarm-onboard-intro><p class=swarm-onboard-question>Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?</p><div class=swarm-onboard-mode-cards><button type=button class="swarm-onboard-mode-card is-primary"><div class=swarm-onboard-option-top><strong>Use Recommended Models</strong><span class=swarm-model-select-badge>Recommended</span></div><p class=swarm-onboard-mode-desc>Apply tuned defaults for all 4 roles right away:</p><div class=swarm-onboard-rec-grid></div></button><button type=button class=swarm-onboard-mode-card><div class=swarm-onboard-option-top><strong>Pick Manually (4 Questions)</strong></div><p class=swarm-onboard-mode-desc>Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.</p></button></div><div class=swarm-onboard-footer><span>'),je=e.template("<div class=swarm-onboard-root>"),We=e.template("<div class=swarm-overlay-loading><span>Loading available models..."),qe=e.template("<div class=swarm-onboard-step><div class=swarm-onboard-step-head><span class=swarm-onboard-step-pill>Question <!> of </span><h3>Choose <!> Model</h3><p></p></div><div class=swarm-onboard-choices><button type=button><div class=swarm-onboard-option-top><strong>★ </strong><span class=swarm-model-select-badge>Recommended</span></div><span class=swarm-onboard-option-sub></span></button><div><div class=swarm-onboard-custom-head><strong>Pick from catalog (A–Z search)</strong><span>Type to filter by provider, model, or variant</span></div></div></div><div class=swarm-onboard-footer><div class=swarm-onboard-footer-right>"),Ne=e.template("<div class=swarm-onboard-rec-row><span class=swarm-onboard-rec-role></span><span class=swarm-onboard-rec-spec>");const ge=["coordinator","worker","verifier","monitor"];function Te(t){const{Button:m,Dialog:o,Loader:v}=t.ctx.ui,[g,$]=n.createSignal(!0),[b,a]=n.createSignal(!1),[p,E]=n.createSignal(null),[y,A]=n.createSignal([]),[h,r]=n.createSignal(-1),[f,w]=n.createSignal({coordinator:ue.coordinator.fallbackSpec,worker:ue.worker.fallbackSpec,verifier:ue.verifier.fallbackSpec,monitor:ue.monitor.fallbackSpec}),l=n.createMemo(()=>ve(y()));n.onMount(async()=>{$(!0),E(null);try{const i=await t.loadRoleConfig(),c=i?.models??[];A(c);const k=ve(c,i?.roleModels);w(k)}catch(i){E(i instanceof Error?i.message:String(i))}finally{$(!1)}});const z=async i=>{a(!0),E(null);try{const c=await t.onApplyModels(i);if(!c.ok){const k=c.errors.join("; ")||"Failed to apply one or more role models.";E(k),t.ctx.toast.show({title:"Could not save all Swarm models",description:k,variant:"error"});return}t.ctx.toast.show({title:"Swarm role models configured",description:`Coordinator: ${i.coordinator}`,variant:"success"}),t.onComplete()}catch(c){const k=c instanceof Error?c.message:String(c);E(k)}finally{a(!1)}},C=n.createMemo(()=>{const i=h();return i>=0&&i<ge.length?ge[i]:"coordinator"}),S=n.createMemo(()=>{const i=C();return $e(y(),f()[i],l()[i])}),_=(i,c)=>{w(k=>({...k,[i]:c}))};return e.createComponent(o,{title:"🐝 Swarm Model Setup",size:"large",get children(){var i=je();return e.insert(i,e.createComponent(n.Show,{get when(){return p()},get children(){var c=Ve();return e.insert(c,p),c}}),null),e.insert(i,e.createComponent(n.Show,{get when(){return!g()},get fallback(){return(()=>{var c=We(),k=c.firstChild;return e.insert(c,e.createComponent(v,{size:"normal"}),k),c})()},get children(){return e.createComponent(n.Show,{get when(){return h()===-1},get fallback(){const c=()=>h(),k=()=>C(),B=()=>ue[k()],V=()=>l()[k()],O=()=>f()[k()],T=()=>O()===V();return(()=>{var F=qe(),j=F.firstChild,H=j.firstChild,R=H.firstChild,L=R.nextSibling;L.nextSibling;var I=H.nextSibling,P=I.firstChild,N=P.nextSibling;N.nextSibling;var Z=I.nextSibling,U=j.nextSibling,q=U.firstChild,D=q.firstChild,G=D.firstChild;G.firstChild;var K=D.nextSibling,W=q.nextSibling;W.firstChild;var J=U.nextSibling,re=J.firstChild;return e.insert(H,()=>c()+1,L),e.insert(H,()=>ge.length,null),e.insert(I,()=>B().title,N),e.insert(Z,()=>B().subtitle),q.$$click=()=>_(k(),V()),e.insert(G,V,null),e.insert(K,()=>B().displayLabel),e.insert(W,e.createComponent(ke,{get value(){return O()},get options(){return S()},get disabled(){return b()},get ariaLabel(){return`${B().title} model`},onChange:Q=>_(k(),Q)}),null),e.insert(J,e.createComponent(m,{variant:"ghost",get disabled(){return b()},onClick:()=>r(Q=>Math.max(-1,Q-1)),children:"Back"}),re),e.insert(re,e.createComponent(m,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.insert(re,e.createComponent(n.Show,{get when(){return c()<ge.length-1},get fallback(){return e.createComponent(m,{variant:"contrast",get disabled(){return b()},onClick:()=>{z(f())},get children(){return b()?"Saving...":"Save & Finish"}})},get children(){return e.createComponent(m,{variant:"contrast",get disabled(){return b()},onClick:()=>r(Q=>Q+1),get children(){return["Next (",e.memo(()=>c()+2),"/",e.memo(()=>ge.length),")"]}})}}),null),e.effect(Q=>{var le=`swarm-onboard-option-card${T()?" is-selected":""}`,s=`swarm-onboard-custom-card${T()?"":" is-selected"}`;return le!==Q.e&&e.className(q,Q.e=le),s!==Q.t&&e.className(W,Q.t=s),Q},{e:void 0,t:void 0}),F})()},get children(){var c=Fe(),k=c.firstChild,B=k.nextSibling,V=B.firstChild,O=V.firstChild,T=O.nextSibling,F=T.nextSibling,j=V.nextSibling,H=B.nextSibling;return H.firstChild,V.$$click=()=>{z(l())},e.insert(F,e.createComponent(n.For,{each:ge,children:R=>(()=>{var L=Ne(),I=L.firstChild,P=I.nextSibling;return e.insert(I,()=>ue[R].title),e.insert(P,()=>l()[R]),L})()})),j.$$click=()=>r(0),e.insert(H,e.createComponent(m,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.effect(R=>{var L=b(),I=b();return L!==R.e&&(V.disabled=R.e=L),I!==R.t&&(j.disabled=R.t=I),R},{e:void 0,t:void 0}),c}})}}),null),i}})}e.delegateEvents(["click"]);var Ge=e.template("<div data-action=swarm-board.sidebarShow>"),Ke=e.template("<div data-action=swarm-board.pillbarShow>"),Qe=e.template("<div data-action=swarm-board.showWhenIdle>"),He=e.template("<div data-action=swarm-board.composerPill>"),Ze=e.template("<div data-action=swarm-board.bottomStrip>"),Je=e.template("<div data-action=swarm-board.withSidePanel>"),Ye=e.template("<div data-action=swarm-board.toastEnabled>"),Xe=e.template("<div data-action=swarm-board.autoSpawnVerifier>"),et=e.template("<div style=display:flex;gap:8px>"),tt=e.template("<div data-action=swarm-board.status>"),rt=e.template("<div data-action=swarm-board.uninstall>");function nt(t){const{SettingsLayout:m,SettingsSection:o,SettingsRow:v,Switch:g,Button:$}=t.ctx.ui;n.onMount(()=>{!t.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(t.target)}"]`)?.scrollIntoView({block:"start"})})});const b=()=>{const a=t.rpcStatus();if(a.state==="connected"){const p=t.activeSwarmCount();return`Connected to local.opencode-swarm (${p} swarm${p===1?"":"s"} recorded).`}return a.state==="unavailable"?"Server plugin (local.opencode-swarm) is not loaded for this workspace.":a.message?`RPC error: ${a.message}`:"Unable to reach local.opencode-swarm."};return e.createComponent(m,{title:"Swarm Board",get children(){return[e.createComponent(o,{title:"Surfaces",get children(){return[(()=>{var a=Ge();return e.insert(a,e.createComponent(v,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent(g,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:p=>t.updateSetting("sidebarShow",p)})}})),a})(),(()=>{var a=Ke();return e.insert(a,e.createComponent(v,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent(g,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:p=>t.updateSetting("pillbarShow",p)})}})),a})(),(()=>{var a=Qe();return e.insert(a,e.createComponent(v,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return e.createComponent(g,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return t.settings().showWhenIdle},onChange:p=>t.updateSetting("showWhenIdle",p)})}})),a})(),(()=>{var a=He();return e.insert(a,e.createComponent(v,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent(g,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:p=>t.updateSetting("composerPill",p)})}})),a})(),(()=>{var a=Ze();return e.insert(a,e.createComponent(v,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent(g,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:p=>t.updateSetting("bottomStrip",p)})}})),a})(),(()=>{var a=Je();return e.insert(a,e.createComponent(v,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent(g,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:p=>t.updateSetting("withSidePanel",p)})}})),a})()]}}),e.createComponent(o,{title:"Notifications",get children(){var a=Ye();return e.insert(a,e.createComponent(v,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent(g,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:p=>t.updateSetting("toastEnabled",p)})}})),a}}),e.createComponent(o,{title:"Verification",get children(){var a=Xe();return e.insert(a,e.createComponent(v,{title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish before allowing swarm completion",get children(){return e.createComponent(g,{label:"Auto-spawn verifier",hideLabel:!0,get checked(){return t.autoSpawnVerifier?.()??!0},onChange:p=>t.onToggleAutoSpawnVerifier?.(p)})}})),a}}),e.createComponent(o,{title:"Plugin Status & Actions",get children(){var a=tt();return e.insert(a,e.createComponent(v,{title:"Swarm Runtime",get description(){return b()},get children(){var p=et();return e.insert(p,e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onRefresh},children:"Refresh"}),null),e.insert(p,(()=>{var E=e.memo(()=>!!t.onOpenSetupWizard);return()=>E()&&e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onOpenSetupWizard},children:"Setup Role Models"})})(),null),e.insert(p,e.createComponent($,{size:"small",variant:"neutral",get onClick(){return t.onOpenPanel},children:"Open Swarm Board"}),null),p}})),a}}),e.memo(()=>e.memo(()=>!!t.onOpenUninstall)()&&e.createComponent(o,{title:"Uninstall",get children(){var a=rt();return e.insert(a,e.createComponent(v,{title:"Uninstall Swarm Plugin",description:"Review the full removal checklist and completely remove Swarm Runtime config, runtime data, worktrees, build artifacts, and temp files",get children(){return e.createComponent($,{size:"small",variant:"ghost",get onClick(){return t.onOpenUninstall},children:"Uninstall..."})}})),a}}))]}})}var at=e.template("<div class=swarm-overlay-error>"),ot=e.template("<div class=swarm-uninstall-root>"),st=e.template("<div class=swarm-overlay-loading><span>Scanning config, git worktrees, runtime data, and temp files..."),it=e.template("<div class=swarm-uninstall-section><strong>Errors</strong><ul class=swarm-uninstall-list>"),lt=e.template("<div class=swarm-uninstall-section><strong>Final Host Reload Commands</strong><pre class=swarm-uninstall-code>"),dt=e.template("<div class=swarm-uninstall-report><div><strong></strong><span> removed · <!> config(s) updated · <!> skipped · <!> error(s)</span></div><div class=swarm-uninstall-section><strong>Verification Checklist</strong><div class=swarm-uninstall-checks></div></div><div class=swarm-uninstall-footer><span>"),ct=e.template("<div><span></span><div><strong></strong><div class=swarm-uninstall-detail>"),xe=e.template("<li>"),ut=e.template("<div class=swarm-uninstall-plan><p class=swarm-uninstall-intro>Confirm what will be removed from this machine. Unchecked categories will be skipped; source code and backups remain untouched.</p><div class=swarm-uninstall-categories><div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong>6. Swarm GUI Settings Store</strong><span>Reset saved GUI preferences and onboarding state back to defaults.</span></div><span class=swarm-uninstall-count>1 store</span></label></div></div><div class=swarm-uninstall-preserved><strong>Preserved (Not Removed)</strong><ul></ul></div><div class=swarm-uninstall-footer>"),mt=e.template("<ul class=swarm-uninstall-items>"),pt=e.template("<div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong></strong><span></span></div><span class=swarm-uninstall-count>"),gt=e.template("<div class=swarm-uninstall-empty>Nothing detected on disk"),wt=e.template("<li><span class=swarm-uninstall-kind></span><code class=swarm-uninstall-path></code><span class=swarm-uninstall-detail>");function ft(t){return typeof t!="number"||t<=0?"":t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:`${(t/(1024*1024)).toFixed(1)} MB`}function bt(t){const{Button:m,Dialog:o,Loader:v}=t.ctx.ui,[g,$]=n.createSignal(!0),[b,a]=n.createSignal(!1),[p,E]=n.createSignal(null),[y,A]=n.createSignal(null),[h,r]=n.createSignal(null),[f,w]=n.createSignal(!0),[l,z]=n.createSignal({pluginRegistration:!0,gitWorktreesAndBranches:!0,runtimeData:!0,buildArtifacts:!0,tempFiles:!0});n.onMount(async()=>{$(!0),E(null);try{const i=await t.loadPlan();if(A(i),i){const c={...l()};for(const k of i.categories)c[k.id]=k.defaultChecked;z(c)}}catch(i){E(i instanceof Error?i.message:String(i))}finally{$(!1)}});const C=n.createMemo(()=>{const i=l();return Object.values(i).filter(Boolean).length+(f()?1:0)}),S=i=>{z(c=>({...c,[i]:!c[i]}))},_=async()=>{a(!0),E(null);try{const i=await t.onExecute(l());f()&&t.onResetGuiStore(),r(i),i?.ok?t.ctx.toast.show({title:"Swarm plugin uninstalled",description:"Reload or restart OpenCode to finish unloading.",variant:"success"}):i&&t.ctx.toast.show({title:"Uninstall completed with warnings",description:`${i.errors.length} error(s) — check verification checklist.`,variant:"error"})}catch(i){E(i instanceof Error?i.message:String(i))}finally{a(!1)}};return e.createComponent(o,{title:"Uninstall Swarm Plugin — Removal Checklist",size:"large",get children(){var i=ot();return e.insert(i,e.createComponent(n.Show,{get when(){return p()},get children(){var c=at();return e.insert(c,p),c}}),null),e.insert(i,e.createComponent(n.Show,{get when(){return!g()},get fallback(){return(()=>{var c=st(),k=c.firstChild;return e.insert(c,e.createComponent(v,{size:"normal"}),k),c})()},get children(){return e.createComponent(n.Show,{get when(){return h()===null},get fallback(){const c=()=>h();return(()=>{var k=dt(),B=k.firstChild,V=B.firstChild,O=V.nextSibling,T=O.firstChild,F=T.nextSibling,j=F.nextSibling,H=j.nextSibling,R=H.nextSibling,L=R.nextSibling;L.nextSibling;var I=B.nextSibling,P=I.firstChild,N=P.nextSibling,Z=I.nextSibling;return Z.firstChild,e.insert(V,()=>c().ok?"All selected Swarm items removed and verified":"Uninstall completed with remaining items"),e.insert(O,()=>c().removed.length,T),e.insert(O,()=>c().edited.length,F),e.insert(O,()=>c().skipped.length,H),e.insert(O,()=>c().errors.length,L),e.insert(N,e.createComponent(n.For,{get each(){return c().verification},children:U=>(()=>{var q=ct(),D=q.firstChild,G=D.nextSibling,K=G.firstChild,W=K.nextSibling;return e.insert(D,()=>U.passed?"✓":"✗"),e.insert(K,()=>U.label),e.insert(W,()=>U.detail),e.effect(()=>e.className(q,`swarm-uninstall-check-row${U.passed?" is-pass":" is-fail"}`)),q})()})),e.insert(k,e.createComponent(n.Show,{get when(){return c().errors.length>0},get children(){var U=it(),q=U.firstChild,D=q.nextSibling;return e.insert(D,e.createComponent(n.For,{get each(){return c().errors},children:G=>(()=>{var K=xe();return e.insert(K,G),K})()})),U}}),Z),e.insert(k,e.createComponent(n.Show,{get when(){return c().nextSteps.length>0},get children(){var U=lt(),q=U.firstChild,D=q.nextSibling;return e.insert(D,()=>c().nextSteps.join(`
`)),U}}),Z),e.insert(Z,e.createComponent(m,{variant:"contrast",onClick:()=>t.onClose(),children:"Close"}),null),e.effect(()=>e.className(B,`swarm-uninstall-banner${c().ok?" is-ok":" is-warn"}`)),k})()},get children(){return e.createComponent(n.Show,{get when(){return y()},children:c=>(()=>{var k=ut(),B=k.firstChild,V=B.nextSibling,O=V.firstChild,T=O.firstChild,F=T.firstChild,j=V.nextSibling,H=j.firstChild,R=H.nextSibling,L=j.nextSibling;return e.insert(V,e.createComponent(n.For,{get each(){return c().categories},children:I=>{const P=()=>l()[I.id];return(()=>{var N=pt(),Z=N.firstChild,U=Z.firstChild,q=U.nextSibling,D=q.firstChild,G=D.nextSibling,K=q.nextSibling;return U.addEventListener("change",()=>S(I.id)),e.insert(D,()=>I.title),e.insert(G,()=>I.description),e.insert(K,(()=>{var W=e.memo(()=>I.items.length===0);return()=>W()?"Clean":`${I.items.length} item${I.items.length===1?"":"s"}`})()),e.insert(N,e.createComponent(n.Show,{get when(){return I.items.length>0},get fallback(){return gt()},get children(){var W=mt();return e.insert(W,e.createComponent(n.For,{get each(){return I.items},children:J=>(()=>{var re=wt(),Q=re.firstChild,le=Q.nextSibling,s=le.nextSibling;return e.insert(Q,()=>J.kind),e.insert(le,()=>J.path),e.insert(s,()=>J.detail,null),e.insert(s,(()=>{var d=e.memo(()=>!!J.sizeBytes);return()=>d()?` (${ft(J.sizeBytes)})`:""})(),null),re})()})),W}}),null),e.effect(W=>{var J=`swarm-uninstall-card${P()?" is-checked":""}`,re=b();return J!==W.e&&e.className(N,W.e=J),re!==W.t&&(U.disabled=W.t=re),W},{e:void 0,t:void 0}),e.effect(()=>U.checked=P()),N})()}}),O),F.addEventListener("change",()=>w(I=>!I)),e.insert(R,e.createComponent(n.For,{get each(){return c().preserved},children:I=>(()=>{var P=xe();return e.insert(P,I),P})()})),e.insert(L,e.createComponent(m,{variant:"ghost",get disabled(){return b()},onClick:()=>t.onClose(),children:"Cancel"}),null),e.insert(L,e.createComponent(m,{variant:"contrast",get disabled(){return b()||C()===0},onClick:()=>{_()},get children(){return b()?"Removing...":"Confirm & Remove Selected Items"}}),null),e.effect(I=>{var P=`swarm-uninstall-card${f()?" is-checked":""}`,N=b();return P!==I.e&&e.className(O,I.e=P),N!==I.t&&(F.disabled=I.t=N),I},{e:void 0,t:void 0}),e.effect(()=>F.checked=f()),k})()})}})}}),null),i}})}const fe="swarm-board",ye=ie.Schema.Struct({sidebarShow:ie.Schema.Boolean,pillbarShow:ie.Schema.Boolean,showWhenIdle:ie.Schema.Boolean,composerPill:ie.Schema.Boolean,bottomStrip:ie.Schema.Boolean,withSidePanel:ie.Schema.Boolean,toastEnabled:ie.Schema.Boolean,onboardingComplete:ie.Schema.Boolean}),we={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0,onboardingComplete:!1};function ht(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(o=>({id:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),activeCount:typeof o.activeCount=="number"?o.activeCount:void 0,waitingCount:typeof o.waitingCount=="number"?o.waitingCount:void 0,postCount:typeof o.postCount=="number"?o.postCount:typeof o.post_count=="number"?o.post_count:void 0,updatedAt:o.updatedAt??(typeof o.updated_at=="number"?new Date(o.updated_at).toISOString():void 0)}))}function vt(t){if(!t||typeof t!="object")return null;const m=t;if(typeof m.swarmId=="string"&&Array.isArray(m.posts))return m;const o=m.swarm;if(!o||typeof o!="object")return null;const v=Array.isArray(m.members)?m.members:[],g=Array.isArray(m.board_posts)?m.board_posts:Array.isArray(m.posts)?m.posts:[],$=Array.isArray(m.file_locks)?m.file_locks:Array.isArray(m.locks)?m.locks:[],b=v.map(r=>({handle:String(r.handle??r.name??""),role:typeof r.role=="string"?r.role:void 0,state:String(r.state??"waiting"),model:typeof r.model=="string"?r.model:void 0,variant:typeof r.variant=="string"?r.variant:void 0,trackStatus:typeof r.track_status=="string"?r.track_status:r.trackStatus,ownedGlobs:Array.isArray(r.owned_globs)?r.owned_globs:Array.isArray(r.ownedGlobs)?r.ownedGlobs:[],sessionId:typeof r.session_id=="string"?r.session_id:r.sessionId,session_id:typeof r.session_id=="string"?r.session_id:r.sessionId})),a=g.map(r=>({id:r.seq??r.id??0,seq:typeof r.seq=="number"?r.seq:void 0,author:String(r.author??""),body:String(r.body??""),createdAt:typeof r.created_at=="number"?new Date(r.created_at).toISOString():r.createdAt,created_at:typeof r.created_at=="number"?new Date(r.created_at).toISOString():r.created_at,mentions:Array.isArray(r.mentions)?r.mentions:[]})),p=$.map(r=>({glob:String(r.glob_pattern??r.glob??""),owner:String(r.owner_handle??r.owner??""),acquiredAt:typeof r.claimed_at=="number"?new Date(r.claimed_at).toISOString():r.acquiredAt})),E=v.some(r=>!!r.paused_quota),y=[...a].reverse().find(r=>r.author.replace(/^@/,"").toLowerCase()==="verifier"),A=y?/\bFAIL\b/i.test(y.body)?"FAIL":/\bPASS\b/i.test(y.body)?"PASS":void 0:void 0,h=[];for(const r of a)if(r.mentions&&r.mentions.length>0)for(const f of r.mentions)h.push({from:r.author,to:f.startsWith("@")?f:`@${f}`,summary:r.body.slice(0,80),at:r.createdAt});return{swarmId:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),boardUrl:typeof m.boardUrl=="string"?m.boardUrl:void 0,pausedQuota:E,paused_quota:E,stalled:!!m.stalled,verifierStatus:A,members:b,posts:a,locks:p,handoffs:h}}var St=e.template("<span>"),xt=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),yt=e.template("<div style=padding:12px>Loading Swarm Board...");const $t=n.lazy(()=>Promise.resolve().then(()=>Pt)),kt=[{id:fe,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"},{id:"swarm-board.autoSpawnVerifier",title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish",keywords:"swarm verifier auto spawn gate verification"},{id:"swarm-board.status",title:"Setup Role Models",description:"Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",keywords:"swarm models onboarding wizard setup"},{id:"swarm-board.uninstall",title:"Uninstall Swarm Plugin",description:"Review removal checklist and completely uninstall Swarm Runtime",keywords:"swarm uninstall remove cleanup reset"}],Ct=`
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`,_t=X.Plugin.define({stores:{settings:X.Store.global(ye,we)},setup(t){const m=t.stores?.settings??t.storage.store("swarm.settings",{schema:ye,initial:we}),o=()=>m.value??we,v=(s,d)=>{m.set({...o(),[s]:d})},g=(s,d)=>{try{return t.add(s,d)}catch(u){return console.warn("[opencode-swarm] OpenCode did not accept a GUI item:",u),()=>{}}};g(X.Style,Ce);const[$,b]=n.createSignal([]),[a,p]=n.createSignal(null),[E,y]=n.createSignal(null),[A,h]=n.createSignal(null),[r,f]=n.createSignal(""),[w,l]=n.createSignal(void 0),[z,C]=n.createSignal({state:"connected"}),[S,_]=n.createSignal(!0);let i=!1,c="",k=!1,B="",V=null,O=0,T=null,F,j=!1;const H=()=>t.sessions.current()?.location?.directory??w(),R=()=>t.client.rpc(he),L=(s=8e3)=>{const d=t.sessions.current()?.location??(w()?{directory:w()}:void 0),u=AbortSignal.timeout(s);return d?{location:d,signal:u}:{signal:u}},I=s=>{if(!o().toastEnabled)return;const d=!!(s.pausedQuota??s.paused_quota);d&&!i&&t.toast.show({title:"Swarm paused on quota",description:s.title||s.swarmId,variant:"error"}),i=d;const u=(s.verifierStatus??"").toUpperCase();(u==="PASS"||u==="FAIL")&&u!==c&&t.toast.show({title:`@verifier ${u}`,description:s.title||s.swarmId,variant:u==="PASS"?"success":"error"}),c=u;const x=[...s.posts].reverse().find(M=>M.author.replace(/^@/,"").toLowerCase()==="monitor");s.stalled&&!k?t.toast.show({title:"@monitor stall nudge",description:x?.body??"Swarm appears stalled"}):x&&x.id!==V&&V!==null&&t.toast.show({title:"@monitor stall nudge",description:x.body}),k=!!s.stalled,x&&(V=x.id),s.status==="completed"&&B!==s.swarmId&&(B=s.swarmId,t.toast.show({title:"Swarm completed",description:s.title||s.swarmId,variant:"success"}))},P=async(s=!1)=>{const d=++O;try{const u=R(),x=L(),M=await u.listSwarms({},x);if(d!==O)return;const te=ht(M);b(te);const Y=te.find(ae=>ae.status==="running"||ae.status==="completing")??null;Y&&(Y.id!==T||s)?(T=Y.id,y(null),p(Y.id)):Y||(T=null);const de=a();de&&!te.some(ae=>ae.id===de)&&(p(null),y(null)),(!a()||Y&&!E()&&a()!==Y.id)&&p(Y?.id??te[0]?.id??null);const ce=a(),me=t.sessions.current()?.id,se=await u.getSwarmSnapshot(ce?{swarmId:ce}:me?{sessionId:me}:{},x);if(d!==O)return;se&&typeof se=="object"&&typeof se.boardUrl=="string"&&se.boardUrl&&f(se.boardUrl);const pe=vt(se);h(pe),C({state:"connected"}),u.getRoleConfig(ce?{swarmId:ce}:me?{sessionId:me}:{},x).then(ae=>{const be=ae&&typeof ae=="object"&&"output"in ae?ae.output:ae;typeof be?.autoSpawnVerifier=="boolean"&&_(be.autoSpawnVerifier)}).catch(()=>{}),!o().onboardingComplete&&!j&&(j=!0,queueMicrotask(()=>J())),pe&&I(pe)}catch(u){if(d!==O)return;const x=typeof u=="object"&&u!==null&&"type"in u&&u.type==="rpc.unavailable";C(x?{state:"unavailable"}:{state:"error",message:u instanceof Error?u.message:String(u)})}};n.createEffect(()=>{const s=H();t.sessions.current()?.id,t.sessions.current()?.pending,a(),s!==F&&(F=s,T=null,y(null),p(null),h(null),b([])),P()});let N=null,Z;const U=()=>{if(N!==t.client){Z?.abort(),N=t.client,Z=new AbortController;try{t.client.rpc(he).events.on("changed",()=>{P()},{signal:Z.signal})}catch{}}};U(),n.createEffect(()=>{try{const s=t.servers;if(!s)return;const u=s.list().map(M=>s.get(M)).find(M=>M?.builtin)?.data;if(!u||typeof u.on!="function")return;const x=u.on("session.tool.success",()=>{P()});n.onCleanup(()=>x())}catch{}});const q=setInterval(()=>{U(),P()},2e3);n.onCleanup(()=>{Z?.abort(),clearInterval(q)});const D=n.createMemo(()=>{const s=A();if(!s)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let d=0,u=0;for(const x of s.members){const M=x.state.toLowerCase();M==="working"||M==="active"?d++:(M==="waiting"||M==="idle")&&u++}return{active:d,waiting:u,posts:s.posts.length,paused:!!(s.pausedQuota??s.paused_quota),stalled:!!s.stalled}}),G=(s=!1)=>{if(!o().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const d=t.sessions.current();if(!d){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const u=`${t.id}:swarm`;if(s&&t.layout.state(u,d)==="visible"){t.layout.hide(u,d);return}t.layout.open(u,d)},K=()=>{t.layout.settings(fe)},W=n.createMemo(()=>{const s=A(),d=D();return!!(s&&(d.active>0||s.status==="running"&&s.members.some(u=>u.state.toLowerCase()==="working")))});g(X.Style,()=>W()?Ct:void 0);const J=()=>{t.dialogs.open(s=>e.createComponent(Te,{ctx:t,loadRoleConfig:async()=>{const d=a(),u=t.sessions.current()?.id;return await R().getRoleConfig(d?{swarmId:d}:u?{sessionId:u}:{},L())},onApplyModels:async d=>{const u=[],x=a(),M=t.sessions.current()?.id;for(const te of["coordinator","worker","verifier","monitor"]){const Y=d[te];if(!Y)continue;const de=await R().setRoleModel({role:te,model:Y,...x?{swarmId:x}:{},...M?{sessionId:M}:{}},L());de?.ok||u.push(`${te}: ${de?.error??"failed"}`)}return P(),{ok:u.length===0,errors:u}},onComplete:()=>{v("onboardingComplete",!0),s.close()},onSkip:()=>{v("onboardingComplete",!0),s.close()}}))},re=()=>{t.dialogs.open(s=>e.createComponent(De,{ctx:t,snapshot:A,counts:D,isBuzzing:W,loadRoleConfig:async()=>{const d=a(),u=t.sessions.current()?.id;return await R().getRoleConfig(d?{swarmId:d}:u?{sessionId:u}:{},L())},onSetRoleModel:async(d,u)=>{const x=a(),M=t.sessions.current()?.id,te=await R().setRoleModel({role:d,model:u,...x?{swarmId:x}:{},...M?{sessionId:M}:{}},L());return P(),te},onOpenBoard:()=>G(!1),onOpenSetupWizard:()=>{s.close(),J()},onClose:()=>s.close()}))},Q=()=>{t.dialogs.open(s=>e.createComponent(bt,{ctx:t,loadPlan:async()=>await R().previewUninstall({},L(3e4)),onExecute:async d=>await R().executeUninstall({categories:d},L(12e4)),onResetGuiStore:()=>{m.set(we)},onClose:()=>s.close()}))};g(X.SettingsPage,()=>({id:fe,title:"Swarm Board",icon:"dot-grid",entries:kt,render:({target:s})=>e.createComponent(nt,{ctx:t,settings:o,updateSetting:v,rpcStatus:z,activeSwarmCount:()=>$().length,autoSpawnVerifier:S,onToggleAutoSpawnVerifier:async d=>{const u=S();_(d);try{const x=await R().setAutoSpawnVerifier({enabled:d},L()),M=x&&typeof x=="object"&&"output"in x?x.output:x;typeof M?.autoSpawnVerifier=="boolean"&&_(M.autoSpawnVerifier)}catch(x){_(u),t.toast.show({title:"Failed to update Auto-spawn verifier",description:x instanceof Error?x.message:String(x),variant:"error"})}},onOpenPanel:()=>G(!1),onOpenSetupWizard:J,onOpenUninstall:Q,onRefresh:()=>{P()},target:s})})),g(X.TitlebarItem,()=>{if(!o().pillbarShow)return;const s=A();if(!s&&!o().showWhenIdle)return;const d=t.sessions.current(),u=d?t.layout.state(`${t.id}:swarm`,d)==="visible":!1,x=D(),M=x.paused||x.stalled?" ⚠":"";return{id:"swarm-open",label:W()?`🐝 Swarm: Buzzing (${x.active} active · ${x.posts} posts)${M}`:s?`🐝 Swarm: Dozing (${x.posts} posts)${M}`:"🐝 Swarm: Dozing",title:x.paused?"Swarm paused on quota — click to open Swarm Board":x.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:u,run:()=>G(!0)}}),g(X.ComposerPill,{id:"swarm-composer-pill",show(s){if(s.session.directory&&l(s.session.directory),!o().composerPill)return;const d=A();if(!d&&!o().showWhenIdle)return;const u=D(),x=(d?.verifierStatus??"").toUpperCase();let M;return u.paused||x==="FAIL"?M="danger":u.stalled&&(M="warning"),{label:W()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",...M?{tone:M}:{},title:"Click to configure Swarm role models or open Board",run:()=>re()}}}),g(X.Slot,{at:"window.bottom",render:()=>{const s=()=>{if(!o().bottomStrip)return!1;const d=t.sessions.current();return!(d?t.layout.state(`${t.id}:swarm`,d)==="visible":!1)||o().withSidePanel};return e.createComponent(n.Show,{get when(){return s()},get children(){var d=xt(),u=d.firstChild,x=u.firstChild,M=x.nextSibling,te=M.nextSibling,Y=te.nextSibling,de=Y.nextSibling,ce=de.nextSibling,me=ce.nextSibling,se=me.nextSibling;return se.nextSibling,d.$$click=()=>G(!0),e.insert(u,()=>A()?.title??"Idle",M),e.insert(u,()=>D().active,Y),e.insert(u,()=>D().waiting,ce),e.insert(u,()=>D().posts,se),e.insert(d,e.createComponent(n.Show,{get when(){return D().paused||D().stalled},get children(){var pe=St();return e.insert(pe,()=>D().paused?"Paused on quota":"Stalled"),pe}}),null),d}})}}),g(X.MenuItem,()=>{const s=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:s?t.layout.state(`${t.id}:swarm`,s)!=="closed":!1,run:()=>G(!1)}}),g(X.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>G(!1)})),g(X.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>K()})),g(X.Command,()=>({id:"setup-models",title:"Swarm Model Setup Wizard",description:"Choose recommended or manual models for Swarm roles",group:"Swarm",section:"model",run:()=>J()})),g(X.Command,()=>({id:"uninstall",title:"Uninstall Swarm Plugin",description:"Open the Swarm removal checklist and completely uninstall Swarm Runtime",group:"Swarm",section:"general",run:()=>Q()}));const le={id:"swarm",title:"Swarm",pinned:!0};g(X.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return o().sidebarShow?[le]:[]},render(s){return s.session.directory&&l(s.session.directory),e.createComponent(n.Suspense,{get fallback(){return yt()},get children(){return e.createComponent($t,{ctx:t,snapshot:A,boardUrl:r,swarms:$,selectedSwarmId:a,sessionId:()=>s.session.id,onSelectSwarm:d=>{y(d),p(d)},onRefresh:()=>{P(!0)},onOpenSettings:K,rpcError:()=>{const d=z();if(d.state==="unavailable")return"Server plugin (local.opencode-swarm) is not loaded for this workspace.";if(d.state==="error")return d.message},onCompleteSwarm:async d=>{await R().completeSwarm({swarmId:d},L()),await P()},get server(){return s.session.server}})}})}})}});e.delegateEvents(["click"]);var It=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),At=e.template("<option>"),zt=e.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),Mt=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),Rt=e.template("<option> (<!>)"),Et=e.template("<div class=swarm-gui-empty>");function Lt(t){const{Button:m,Dialog:o}=t.ctx.ui,[v,g]=n.createSignal(0);let $;const b=n.createMemo(()=>t.snapshot()?.boardUrl||t.boardUrl?.()||""),a=n.createMemo(()=>t.selectedSwarmId()??t.snapshot()?.swarmId??""),p=n.createMemo(()=>{const h=b();if(!h)return"";const r=a(),f=t.sessionId?.()??"",w=v();try{const l=new URL(h);return r&&l.searchParams.set("swarmId",r),f&&l.searchParams.set("conversationId",f),w>0&&l.searchParams.set("_r",String(w)),l.toString()}catch{return h}}),E=n.createMemo(()=>{const h=p();if(!h)return"";try{return new URL(h).origin}catch{return""}}),y=()=>{const h=$?.contentWindow,r=E();if(!h||!r)return;const f=t.ctx.appearance.mode(),w=typeof document<"u"?getComputedStyle(document.documentElement):null,l=S=>w?.getPropertyValue(S).trim()||"",z={},C=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[S,_]of C){const i=l(_);i&&(z[S]=i)}h.postMessage({type:"swarm:theme",mode:f,tokens:z},r)};if(n.createEffect(()=>{t.ctx.appearance.mode(),y()}),typeof window<"u"){const h=r=>{if(r.source!==$?.contentWindow)return;const f=E();if(f&&r.origin!==f)return;const w=r.data;if(w?.type==="swarm:open_session"&&typeof w.sessionID=="string"&&w.sessionID){const l=t.server,z=typeof l=="string"?l:l?.id??t.ctx.sessions.current()?.server.id;if(!z){t.ctx.toast.show({title:"No server context for member session"});return}t.ctx.tabs.open({server:z,id:w.sessionID},{focus:!0})}};window.addEventListener("message",h),n.onCleanup(()=>window.removeEventListener("message",h))}const A=()=>{const h=t.snapshot();h&&t.ctx.dialogs.open(r=>e.createComponent(o,{title:"Complete Swarm?",get children(){var f=It(),w=f.firstChild,l=w.firstChild,z=l.nextSibling,C=w.nextSibling;return e.insert(z,()=>h.title||h.swarmId),e.insert(C,e.createComponent(m,{variant:"ghost",onClick:()=>r.close(),children:"Cancel"}),null),e.insert(C,e.createComponent(m,{variant:"danger",onClick:async()=>{try{await t.onCompleteSwarm(h.swarmId),r.close()}catch(S){t.ctx.toast.show({title:"Failed to complete swarm",description:S instanceof Error?S.message:String(S),variant:"error"})}},children:"Complete Swarm"}),null),f}}))};return(()=>{var h=Mt(),r=h.firstChild,f=r.firstChild;return f.addEventListener("change",w=>t.onSelectSwarm(w.currentTarget.value)),e.insert(f,e.createComponent(n.Show,{get when(){return t.swarms().length===0},get children(){var w=At();return e.insert(w,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>w.value=t.snapshot()?.swarmId??""),w}}),null),e.insert(f,e.createComponent(n.For,{get each(){return t.swarms()},children:w=>(()=>{var l=Rt(),z=l.firstChild,C=z.nextSibling;return C.nextSibling,e.insert(l,()=>w.title||w.id,z),e.insert(l,()=>w.status,C),e.effect(()=>l.value=w.id),l})()}),null),e.insert(r,e.createComponent(m,{size:"small",variant:"ghost",onClick:()=>{t.onRefresh(),g(w=>w+1)},children:"Refresh"}),null),e.insert(r,e.createComponent(n.Show,{get when(){return t.snapshot()?.status==="running"},get children(){return e.createComponent(m,{size:"small",variant:"neutral",onClick:A,children:"Complete"})}}),null),e.insert(r,e.createComponent(n.Show,{get when(){return t.onOpenSettings},get children(){return e.createComponent(m,{size:"small",variant:"ghost",onClick:()=>t.onOpenSettings?.(),children:"Settings"})}}),null),e.insert(h,e.createComponent(n.Show,{get when(){return p()},get fallback(){return(()=>{var w=Et();return e.insert(w,()=>t.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),w})()},get children(){var w=zt();return w.addEventListener("load",()=>y()),e.use(l=>{$=l},w),e.effect(()=>e.setAttribute(w,"src",p())),w}}),null),e.effect(()=>f.value=a()),h})()}const Pt=Object.freeze(Object.defineProperty({__proto__:null,default:Lt},Symbol.toStringTag,{value:"Module"}));exports.default=_t;
