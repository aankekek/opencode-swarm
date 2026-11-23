"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),X=require("@opencode/plugin/gui"),r=require("solid-js"),le=require("effect");function ee(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function ae(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(l){const o=t(l);return o?{issues:[{message:o}]}:{value:l}}}}}function se(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(l){const o=l===void 0?{}:l;if(!ee(o))return{issues:[{message:"input must be an object"}]};const h=t(o);return h?{issues:[{message:h}]}:{value:o}}}}}const $e={id:"local.opencode-swarm",methods:{getBoardInfo:{input:se(()=>null),output:ae(t=>ee(t)&&typeof t.url=="string"&&typeof t.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:se(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ae(t=>ee(t)&&Array.isArray(t.members)&&Array.isArray(t.board_posts)&&Array.isArray(t.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:se(t=>t.limit!==void 0&&typeof t.limit!="number"?"limit must be a number":null),output:ae(t=>ee(t)&&Array.isArray(t.swarms)?null:"output must contain swarms array")},completeSwarm:{input:se(t=>typeof t.swarmId!="string"?"swarmId must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ae(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:se(t=>typeof t.swarmId!="string"?"swarmId must be a string":typeof t.handle!="string"?"handle must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ae(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:se(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ae(t=>ee(t)&&ee(t.roleModels)&&Array.isArray(t.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:se(t=>typeof t.role!="string"?"role must be a string":typeof t.model!="string"?"model must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":null),output:ae(t=>ee(t)&&typeof t.ok=="boolean"?null:"output must be SetRoleModelResult")},setAutoSpawnVerifier:{input:se(t=>typeof t.enabled=="boolean"?null:"enabled must be a boolean"),output:ae(t=>ee(t)&&typeof t.ok=="boolean"&&typeof t.autoSpawnVerifier=="boolean"?null:"output must contain ok and autoSpawnVerifier booleans")},previewUninstall:{input:se(()=>null),output:ae(t=>ee(t)&&Array.isArray(t.categories)&&Array.isArray(t.preserved)?null:"output must be UninstallPlan")},executeUninstall:{input:se(t=>t.categories!==void 0&&!ee(t.categories)?"categories must be an object":null),output:ae(t=>ee(t)&&typeof t.ok=="boolean"&&Array.isArray(t.verification)?null:"output must be UninstallResult")}},events:{changed:{schema:ae(t=>ee(t)&&typeof t.swarmId=="string"&&typeof t.reason=="string"?null:"event must contain swarmId and reason")}}},Me=`
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
`,pe={coordinator:{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination",displayLabel:"Muse Spark 1.3 · xhigh",patterns:[/^muse-spark-1\.3/i,/muse[\s._-]*spark[\s._-]*1\.3/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"xhigh",fallbackSpec:"opencode-go/muse-spark-1.3-contributor#xhigh"},worker:{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · high",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"high",fallbackSpec:"opencode-go/deepseek-v4.1-flash#high"},verifier:{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · max",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"max",fallbackSpec:"opencode-go/deepseek-v4.1-flash#max"},monitor:{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads",displayLabel:"GLM 5.3 Flash · default",patterns:[/^glm-5\.3-flash$/i,/glm[\s._-]*5\.3[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:void 0,fallbackSpec:"opencode-go/glm-5.3-flash"}};function ke(t,l){const o={};for(const h of["coordinator","worker","verifier","monitor"]){const g=pe[h];let _;for(const v of g.preferredProviders)if(_=t.find(a=>a.providerID.toLowerCase()===v.toLowerCase()&&g.patterns.some(u=>u.test(a.id)||(a.name?u.test(a.name):!1))),_)break;if(_||(_=t.find(v=>g.patterns.some(a=>a.test(v.id)||(v.name?a.test(v.name):!1)))),_){const v=`${_.providerID}/${_.id}`;if(g.preferredVariant){const a=(_.variants??[]).find(u=>u.toLowerCase()===g.preferredVariant.toLowerCase());o[h]=a?`${v}#${a}`:v}else o[h]=v}else{const v=l?.[h];o[h]=v&&v.trim()?v.trim():g.fallbackSpec}}return o}function Ae(t,l,o){const h=[],g=new Set;for(const a of t){const u=`${a.providerID}/${a.id}`;g.has(u)||(g.add(u),h.push({spec:u,label:a.name?`${u} (${a.name})`:u}));for(const E of a.variants??[]){const C=`${u}#${E}`;g.has(C)||(g.add(C),h.push({spec:C,label:C}))}}if(l&&!g.has(l)&&(g.add(l),h.push({spec:l,label:l})),o&&!g.has(o)&&(g.add(o),h.push({spec:o,label:o})),h.sort((a,u)=>a.label.localeCompare(u.label,void 0,{sensitivity:"base",numeric:!0})),!o)return h;let _;const v=[];for(const a of h)a.spec===o?_={...a,isRecommended:!0}:v.push(a);return _?[_,...v]:v}var Re=e.template('<div role=listbox><div class=swarm-model-select-search-wrap><input type=search class=swarm-model-select-search placeholder="Search models..."></div><div class=swarm-model-select-list>'),Ee=e.template("<div class=swarm-model-select><button type=button class=swarm-model-select-trigger aria-haspopup=listbox><span class=swarm-model-select-value></span><span class=swarm-model-select-caret aria-hidden=true>▾"),Le=e.template("<div class=swarm-model-select-empty>No matching models"),Pe=e.template("<span class=swarm-model-select-badge>Recommended"),Be=e.template("<span class=swarm-model-select-check aria-hidden=true>✓"),Oe=e.template("<button type=button role=option><span class=swarm-model-select-item-label></span><span class=swarm-model-select-item-right>");function ze(t){const[l,o]=r.createSignal(!1),[h,g]=r.createSignal("");let _,v;const a=r.createMemo(()=>{const C=h().trim().toLowerCase();if(!C)return t.options;const z=C.split(/\s+/).filter(Boolean);return t.options.filter(w=>{const n=`${w.label} ${w.spec}`.toLowerCase();return z.every(b=>n.includes(b))})}),u=r.createMemo(()=>{const C=t.value;if(!C)return t.placeholder??"Select model...";const z=t.options.find(w=>w.spec===C);return z?z.label:C});r.createEffect(()=>{if(!l())return;g(""),queueMicrotask(()=>{v?.focus()});const C=w=>{_&&!_.contains(w.target)&&o(!1)},z=w=>{w.key==="Escape"&&(w.stopPropagation(),o(!1))};document.addEventListener("mousedown",C),document.addEventListener("keydown",z,!0),r.onCleanup(()=>{document.removeEventListener("mousedown",C),document.removeEventListener("keydown",z,!0)})});const E=C=>{o(!1),g(""),C!==t.value&&t.onChange(C)};return(()=>{var C=Ee(),z=C.firstChild,w=z.firstChild,n=_;return typeof n=="function"?e.use(n,C):_=C,z.$$click=()=>{t.disabled||o(b=>!b)},e.insert(w,u),e.insert(C,e.createComponent(r.Show,{get when(){return l()},get children(){var b=Re(),S=b.firstChild,y=S.firstChild,f=S.nextSibling;y.$$keydown=m=>{if(m.key==="Enter"){m.preventDefault();const R=a()[0];R&&E(R.spec)}else m.key==="Escape"&&(m.preventDefault(),m.stopPropagation(),o(!1))},y.$$input=m=>g(m.currentTarget.value);var M=v;return typeof M=="function"?e.use(M,y):v=y,e.insert(f,e.createComponent(r.Show,{get when(){return a().length>0},get fallback(){return Le()},get children(){return e.createComponent(r.For,{get each(){return a()},children:m=>{const R=()=>m.spec===t.value;return(()=>{var I=Oe(),d=I.firstChild,c=d.nextSibling;return I.$$click=()=>E(m.spec),e.insert(d,()=>m.label),e.insert(c,e.createComponent(r.Show,{get when(){return m.isRecommended},get children(){return Pe()}}),null),e.insert(c,e.createComponent(r.Show,{get when(){return R()},get children(){return Be()}}),null),e.effect(k=>{var j=R(),F=`swarm-model-select-item${R()?" is-selected":""}`;return j!==k.e&&e.setAttribute(I,"aria-selected",k.e=j),F!==k.t&&e.className(I,k.t=F),k},{e:void 0,t:void 0}),I})()}})}})),e.effect(m=>{var R=`swarm-model-select-menu${t.menuUpward?" swarm-model-select-menu-upward":""}`,I=`${t.ariaLabel} options`;return R!==m.e&&e.className(b,m.e=R),I!==m.t&&e.setAttribute(b,"aria-label",m.t=I),m},{e:void 0,t:void 0}),e.effect(()=>y.value=h()),b}}),null),e.effect(b=>{var S=t.disabled,y=t.ariaLabel,f=l();return S!==b.e&&(z.disabled=b.e=S),y!==b.t&&e.setAttribute(z,"aria-label",b.t=y),f!==b.a&&e.setAttribute(z,"aria-expanded",b.a=f),b},{e:void 0,t:void 0,a:void 0}),C})()}e.delegateEvents(["click","input","keydown"]);function xe(){let t=!1;return r.onCleanup(()=>{t=!0}),()=>t}var Ue=e.template("<div class=swarm-overlay-error>"),De=e.template("<div class=swarm-overlay-roles>"),Ve=e.template("<div class=swarm-overlay-root><div class=swarm-overlay-top><div class=swarm-overlay-status><span class=swarm-overlay-badge></span><div class=swarm-overlay-meta><strong></strong><span> active · <!> waiting · <!> posts</span></div></div><div class=swarm-overlay-actions>"),Fe=e.template("<div class=swarm-overlay-loading><span>Loading role models..."),je=e.template("<span class=swarm-overlay-role-count>"),qe=e.template("<div class=swarm-overlay-role-row><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><strong></strong></div><span class=swarm-overlay-role-sub></span></div><div class=swarm-overlay-select-wrap>");const Ce=[{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination"},{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)"},{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)"},{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads"}];function We(t){const{Button:l,Dialog:o,Loader:h}=t.ctx.ui,[g,_]=r.createSignal(null),[v,a]=r.createSignal(!0),[u,E]=r.createSignal(null),[C,z]=r.createSignal(null),w=xe(),n=async()=>{a(!0),z(null);try{const f=await t.loadRoleConfig();if(w())return;_(f)}catch(f){if(w())return;z(f instanceof Error?f.message:String(f))}finally{w()||a(!1)}};r.onMount(()=>{n()});const b=f=>{const M=g()?.roleModels[f]??"";return Ae(g()?.models??[],M)},S=f=>{const M=t.snapshot();if(!M)return{working:0,waiting:0};let m=0,R=0;for(const I of M.members){if((I.role??"").toLowerCase()!==f)continue;const d=I.state.toLowerCase();d==="working"||d==="active"?m++:(d==="waiting"||d==="idle")&&R++}return{working:m,waiting:R}},y=async(f,M)=>{if(M){E(f),z(null);try{const m=await t.onSetRoleModel(f,M);if(w())return;if(!m||!m.ok){const I=m?.error??`Failed to switch ${f} model`;z(I),t.ctx.toast.show({title:`Failed to switch ${f}`,description:I,variant:"error"});return}_(I=>I&&{...I,roleModels:{...I.roleModels,[f]:m.model}});const R=m.rerunMembers.length>0?`Stopped, switched & rerunning: ${m.rerunMembers.map(I=>`@${I}`).join(", ")}`:m.switchedMembers.length>0?`Updated: ${m.switchedMembers.map(I=>`@${I}`).join(", ")}`:`Default saved for next ${f}`;t.ctx.toast.show({title:`${f} → ${m.model}`,description:R,variant:"success"})}catch(m){if(w())return;const R=m instanceof Error?m.message:String(m);z(R),t.ctx.toast.show({title:`Failed to switch ${f}`,description:R,variant:"error"})}finally{w()||E(null)}}};return e.createComponent(o,{title:"🐝 Swarm Control",size:"large",get children(){var f=Ve(),M=f.firstChild,m=M.firstChild,R=m.firstChild,I=R.nextSibling,d=I.firstChild,c=d.nextSibling,k=c.firstChild,j=k.nextSibling,F=j.nextSibling,W=F.nextSibling;W.nextSibling;var T=m.nextSibling;return e.insert(R,()=>t.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing"),e.insert(d,()=>t.snapshot()?.title??"No active swarm"),e.insert(c,()=>t.counts().active,k),e.insert(c,()=>t.counts().waiting,j),e.insert(c,()=>t.counts().posts,W),e.insert(T,e.createComponent(r.Show,{get when(){return t.onOpenSetupWizard},get children(){return e.createComponent(l,{variant:"ghost",size:"small",onClick:()=>t.onOpenSetupWizard?.(),children:"Setup Wizard"})}}),null),e.insert(T,e.createComponent(l,{variant:"contrast",onClick:()=>{t.onOpenBoard(),t.onClose()},children:"Board"}),null),e.insert(f,e.createComponent(r.Show,{get when(){return C()},get children(){var V=Ue();return e.insert(V,C),V}}),null),e.insert(f,e.createComponent(r.Show,{get when(){return!v()||g()!==null},get fallback(){return(()=>{var V=Fe(),B=V.firstChild;return e.insert(V,e.createComponent(h,{size:"normal"}),B),V})()},get children(){var V=De();return e.insert(V,e.createComponent(r.For,{each:Ce,children:(B,Q)=>{const L=()=>S(B.role),G=()=>g()?.roleModels[B.role]??"",$=()=>u()===B.role,P=r.createMemo(()=>b(B.role));return(()=>{var H=qe(),N=H.firstChild,O=N.firstChild,q=O.firstChild,Z=O.nextSibling,te=N.nextSibling;return e.insert(q,()=>B.title),e.insert(O,e.createComponent(r.Show,{get when(){return L().working>0||L().waiting>0},get children(){var U=je();return e.insert(U,(()=>{var D=e.memo(()=>L().working>0);return()=>D()?`${L().working} working`:`${L().waiting} waiting`})()),U}}),null),e.insert(Z,()=>B.subtitle),e.insert(te,e.createComponent(ze,{get value(){return G()},get options(){return P()},get disabled(){return $()},get ariaLabel(){return`${B.title} model`},get menuUpward(){return Q()>=Ce.length-1},onChange:U=>{y(B.role,U)}})),H})()}})),V}}),null),f}})}var Ne=e.template("<div class=swarm-overlay-error>"),Te=e.template('<div class=swarm-onboard-intro><p class=swarm-onboard-question>Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?</p><div class=swarm-onboard-mode-cards><button type=button class="swarm-onboard-mode-card is-primary"><div class=swarm-onboard-option-top><strong>Use Recommended Models</strong><span class=swarm-model-select-badge>Recommended</span></div><p class=swarm-onboard-mode-desc>Apply tuned defaults for all 4 roles right away:</p><div class=swarm-onboard-rec-grid></div></button><button type=button class=swarm-onboard-mode-card><div class=swarm-onboard-option-top><strong>Pick Manually (4 Questions)</strong></div><p class=swarm-onboard-mode-desc>Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.</p></button></div><div class=swarm-onboard-footer><span>'),Ge=e.template("<div class=swarm-onboard-root>"),Ke=e.template("<div class=swarm-overlay-loading><span>Loading available models..."),Qe=e.template("<div class=swarm-onboard-step><div class=swarm-onboard-step-head><span class=swarm-onboard-step-pill>Question <!> of </span><h3>Choose <!> Model</h3><p></p></div><div class=swarm-onboard-choices><button type=button><div class=swarm-onboard-option-top><strong>★ </strong><span class=swarm-model-select-badge>Recommended</span></div><span class=swarm-onboard-option-sub></span></button><div><div class=swarm-onboard-custom-head><strong>Pick from catalog (A–Z search)</strong><span>Type to filter by provider, model, or variant</span></div></div></div><div class=swarm-onboard-footer><div class=swarm-onboard-footer-right>"),He=e.template("<div class=swarm-onboard-rec-row><span class=swarm-onboard-rec-role></span><span class=swarm-onboard-rec-spec>");const ge=["coordinator","worker","verifier","monitor"];function Ze(t){const{Button:l,Dialog:o,Loader:h}=t.ctx.ui,[g,_]=r.createSignal(!0),[v,a]=r.createSignal(!1),[u,E]=r.createSignal(null),[C,z]=r.createSignal([]),[w,n]=r.createSignal(-1),[b,S]=r.createSignal({coordinator:pe.coordinator.fallbackSpec,worker:pe.worker.fallbackSpec,verifier:pe.verifier.fallbackSpec,monitor:pe.monitor.fallbackSpec}),y=r.createMemo(()=>ke(C())),f=xe();r.onMount(async()=>{_(!0),E(null);try{const d=await t.loadRoleConfig();if(f())return;const c=d?.models??[];z(c);const k=ke(c,d?.roleModels);S(k)}catch(d){if(f())return;E(d instanceof Error?d.message:String(d))}finally{f()||_(!1)}});const M=async d=>{a(!0),E(null);try{const c=await t.onApplyModels(d);if(f())return;if(!c.ok){const k=c.errors.join("; ")||"Failed to apply one or more role models.";E(k),t.ctx.toast.show({title:"Could not save all Swarm models",description:k,variant:"error"});return}t.ctx.toast.show({title:"Swarm role models configured",description:`Coordinator: ${d.coordinator}`,variant:"success"}),t.onComplete()}catch(c){if(f())return;const k=c instanceof Error?c.message:String(c);E(k)}finally{f()||a(!1)}},m=r.createMemo(()=>{const d=w();return d>=0&&d<ge.length?ge[d]:"coordinator"}),R=r.createMemo(()=>{const d=m();return Ae(C(),b()[d],y()[d])}),I=(d,c)=>{S(k=>({...k,[d]:c}))};return e.createComponent(o,{title:"🐝 Swarm Model Setup",size:"large",get children(){var d=Ge();return e.insert(d,e.createComponent(r.Show,{get when(){return u()},get children(){var c=Ne();return e.insert(c,u),c}}),null),e.insert(d,e.createComponent(r.Show,{get when(){return!g()},get fallback(){return(()=>{var c=Ke(),k=c.firstChild;return e.insert(c,e.createComponent(h,{size:"normal"}),k),c})()},get children(){return e.createComponent(r.Show,{get when(){return w()===-1},get fallback(){const c=()=>w(),k=()=>m(),j=()=>pe[k()],F=()=>y()[k()],W=()=>b()[k()],T=()=>W()===F();return(()=>{var V=Qe(),B=V.firstChild,Q=B.firstChild,L=Q.firstChild,G=L.nextSibling;G.nextSibling;var $=Q.nextSibling,P=$.firstChild,H=P.nextSibling;H.nextSibling;var N=$.nextSibling,O=B.nextSibling,q=O.firstChild,Z=q.firstChild,te=Z.firstChild;te.firstChild;var U=Z.nextSibling,D=q.nextSibling;D.firstChild;var J=O.nextSibling,Y=J.firstChild;return e.insert(Q,()=>c()+1,G),e.insert(Q,()=>ge.length,null),e.insert($,()=>j().title,H),e.insert(N,()=>j().subtitle),q.$$click=()=>I(k(),F()),e.insert(te,F,null),e.insert(U,()=>j().displayLabel),e.insert(D,e.createComponent(ze,{get value(){return W()},get options(){return R()},get disabled(){return v()},get ariaLabel(){return`${j().title} model`},onChange:K=>I(k(),K)}),null),e.insert(J,e.createComponent(l,{variant:"ghost",get disabled(){return v()},onClick:()=>n(K=>Math.max(-1,K-1)),children:"Back"}),Y),e.insert(Y,e.createComponent(l,{variant:"ghost",get disabled(){return v()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.insert(Y,e.createComponent(r.Show,{get when(){return c()<ge.length-1},get fallback(){return e.createComponent(l,{variant:"contrast",get disabled(){return v()},onClick:()=>{M(b())},get children(){return v()?"Saving...":"Save & Finish"}})},get children(){return e.createComponent(l,{variant:"contrast",get disabled(){return v()},onClick:()=>n(K=>K+1),get children(){return["Next (",e.memo(()=>c()+2),"/",e.memo(()=>ge.length),")"]}})}}),null),e.effect(K=>{var ue=`swarm-onboard-option-card${T()?" is-selected":""}`,de=`swarm-onboard-custom-card${T()?"":" is-selected"}`;return ue!==K.e&&e.className(q,K.e=ue),de!==K.t&&e.className(D,K.t=de),K},{e:void 0,t:void 0}),V})()},get children(){var c=Te(),k=c.firstChild,j=k.nextSibling,F=j.firstChild,W=F.firstChild,T=W.nextSibling,V=T.nextSibling,B=F.nextSibling,Q=j.nextSibling;return Q.firstChild,F.$$click=()=>{M(y())},e.insert(V,e.createComponent(r.For,{each:ge,children:L=>(()=>{var G=He(),$=G.firstChild,P=$.nextSibling;return e.insert($,()=>pe[L].title),e.insert(P,()=>y()[L]),G})()})),B.$$click=()=>n(0),e.insert(Q,e.createComponent(l,{variant:"ghost",get disabled(){return v()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.effect(L=>{var G=v(),$=v();return G!==L.e&&(F.disabled=L.e=G),$!==L.t&&(B.disabled=L.t=$),L},{e:void 0,t:void 0}),c}})}}),null),d}})}e.delegateEvents(["click"]);var Je=e.template("<div data-action=swarm-board.sidebarShow>"),Ye=e.template("<div data-action=swarm-board.pillbarShow>"),Xe=e.template("<div data-action=swarm-board.showWhenIdle>"),et=e.template("<div data-action=swarm-board.composerPill>"),tt=e.template("<div data-action=swarm-board.bottomStrip>"),rt=e.template("<div data-action=swarm-board.withSidePanel>"),nt=e.template("<div data-action=swarm-board.toastEnabled>"),at=e.template("<div data-action=swarm-board.autoSpawnVerifier>"),ot=e.template("<div style=display:flex;gap:8px>"),st=e.template("<div data-action=swarm-board.status>"),it=e.template("<div data-action=swarm-board.uninstall>");function lt(t){const{SettingsLayout:l,SettingsSection:o,SettingsRow:h,Switch:g,Button:_}=t.ctx.ui;r.onMount(()=>{!t.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(t.target)}"]`)?.scrollIntoView({block:"start"})})});const v=()=>{const a=t.rpcStatus();if(a.state==="connected"){const u=t.activeSwarmCount();return`Connected to local.opencode-swarm (${u} swarm${u===1?"":"s"} recorded).`}return a.state==="unavailable"?"Server plugin (local.opencode-swarm) is not loaded for this workspace.":a.message?`RPC error: ${a.message}`:"Unable to reach local.opencode-swarm."};return e.createComponent(l,{title:"Swarm Board",get children(){return[e.createComponent(o,{title:"Surfaces",get children(){return[(()=>{var a=Je();return e.insert(a,e.createComponent(h,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent(g,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:u=>t.updateSetting("sidebarShow",u)})}})),a})(),(()=>{var a=Ye();return e.insert(a,e.createComponent(h,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent(g,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:u=>t.updateSetting("pillbarShow",u)})}})),a})(),(()=>{var a=Xe();return e.insert(a,e.createComponent(h,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return e.createComponent(g,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return t.settings().showWhenIdle},onChange:u=>t.updateSetting("showWhenIdle",u)})}})),a})(),(()=>{var a=et();return e.insert(a,e.createComponent(h,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent(g,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:u=>t.updateSetting("composerPill",u)})}})),a})(),(()=>{var a=tt();return e.insert(a,e.createComponent(h,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent(g,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:u=>t.updateSetting("bottomStrip",u)})}})),a})(),(()=>{var a=rt();return e.insert(a,e.createComponent(h,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent(g,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:u=>t.updateSetting("withSidePanel",u)})}})),a})()]}}),e.createComponent(o,{title:"Notifications",get children(){var a=nt();return e.insert(a,e.createComponent(h,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent(g,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:u=>t.updateSetting("toastEnabled",u)})}})),a}}),e.createComponent(o,{title:"Verification",get children(){var a=at();return e.insert(a,e.createComponent(h,{title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish before allowing swarm completion",get children(){return e.createComponent(g,{label:"Auto-spawn verifier",hideLabel:!0,get checked(){return t.autoSpawnVerifier?.()??!0},onChange:u=>t.onToggleAutoSpawnVerifier?.(u)})}})),a}}),e.createComponent(o,{title:"Plugin Status & Actions",get children(){var a=st();return e.insert(a,e.createComponent(h,{title:"Swarm Runtime",get description(){return v()},get children(){var u=ot();return e.insert(u,e.createComponent(_,{size:"small",variant:"ghost",get onClick(){return t.onRefresh},children:"Refresh"}),null),e.insert(u,(()=>{var E=e.memo(()=>!!t.onOpenSetupWizard);return()=>E()&&e.createComponent(_,{size:"small",variant:"ghost",get onClick(){return t.onOpenSetupWizard},children:"Setup Role Models"})})(),null),e.insert(u,e.createComponent(_,{size:"small",variant:"neutral",get onClick(){return t.onOpenPanel},children:"Open Swarm Board"}),null),u}})),a}}),e.memo(()=>e.memo(()=>!!t.onOpenUninstall)()&&e.createComponent(o,{title:"Uninstall",get children(){var a=it();return e.insert(a,e.createComponent(h,{title:"Uninstall Swarm Plugin",description:"Review the full removal checklist and completely remove Swarm Runtime config, runtime data, worktrees, build artifacts, and temp files",get children(){return e.createComponent(_,{size:"small",variant:"ghost",get onClick(){return t.onOpenUninstall},children:"Uninstall..."})}})),a}}))]}})}var dt=e.template("<div class=swarm-overlay-error>"),ct=e.template("<div class=swarm-uninstall-root>"),ut=e.template("<div class=swarm-overlay-loading><span>Scanning config, git worktrees, runtime data, and temp files..."),mt=e.template("<div class=swarm-uninstall-section><strong>Errors</strong><ul class=swarm-uninstall-list>"),pt=e.template("<div class=swarm-uninstall-section><strong>Final Host Reload Commands</strong><pre class=swarm-uninstall-code>"),gt=e.template("<div class=swarm-uninstall-report><div><strong></strong><span> removed · <!> config(s) updated · <!> skipped · <!> error(s)</span></div><div class=swarm-uninstall-section><strong>Verification Checklist</strong><div class=swarm-uninstall-checks></div></div><div class=swarm-uninstall-footer><span>"),wt=e.template("<div><span></span><div><strong></strong><div class=swarm-uninstall-detail>"),_e=e.template("<li>"),ft=e.template("<div class=swarm-uninstall-plan><p class=swarm-uninstall-intro>Confirm what will be removed from this machine. Unchecked categories will be skipped; source code and backups remain untouched.</p><div class=swarm-uninstall-categories><div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong>6. Swarm GUI Settings Store</strong><span>Reset saved GUI preferences and onboarding state back to defaults.</span></div><span class=swarm-uninstall-count>1 store</span></label></div></div><div class=swarm-uninstall-preserved><strong>Preserved (Not Removed)</strong><ul></ul></div><div class=swarm-uninstall-footer>"),bt=e.template("<ul class=swarm-uninstall-items>"),ht=e.template("<div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong></strong><span></span></div><span class=swarm-uninstall-count>"),vt=e.template("<div class=swarm-uninstall-empty>Nothing detected on disk"),St=e.template("<li><span class=swarm-uninstall-kind></span><code class=swarm-uninstall-path></code><span class=swarm-uninstall-detail>");function xt(t){return typeof t!="number"||t<=0?"":t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:`${(t/(1024*1024)).toFixed(1)} MB`}function yt(t){const{Button:l,Dialog:o,Loader:h}=t.ctx.ui,[g,_]=r.createSignal(!0),[v,a]=r.createSignal(!1),[u,E]=r.createSignal(null),[C,z]=r.createSignal(null),[w,n]=r.createSignal(null),[b,S]=r.createSignal(!0),[y,f]=r.createSignal({pluginRegistration:!0,gitWorktreesAndBranches:!0,runtimeData:!0,buildArtifacts:!0,tempFiles:!0}),M=xe();r.onMount(async()=>{_(!0),E(null);try{const d=await t.loadPlan();if(M())return;if(z(d),d){const c={...y()};for(const k of d.categories)c[k.id]=k.defaultChecked;f(c)}}catch(d){if(M())return;E(d instanceof Error?d.message:String(d))}finally{M()||_(!1)}});const m=r.createMemo(()=>{const d=y();return Object.values(d).filter(Boolean).length+(b()?1:0)}),R=d=>{f(c=>({...c,[d]:!c[d]}))},I=async()=>{a(!0),E(null);try{const d=await t.onExecute(y());if(M())return;b()&&t.onResetGuiStore(),n(d),d?.ok?t.ctx.toast.show({title:"Swarm plugin uninstalled",description:"Reload or restart OpenCode to finish unloading.",variant:"success"}):d&&t.ctx.toast.show({title:"Uninstall completed with warnings",description:`${d.errors.length} error(s) — check verification checklist.`,variant:"error"})}catch(d){if(M())return;E(d instanceof Error?d.message:String(d))}finally{M()||a(!1)}};return e.createComponent(o,{title:"Uninstall Swarm Plugin — Removal Checklist",size:"large",get children(){var d=ct();return e.insert(d,e.createComponent(r.Show,{get when(){return u()},get children(){var c=dt();return e.insert(c,u),c}}),null),e.insert(d,e.createComponent(r.Show,{get when(){return!g()},get fallback(){return(()=>{var c=ut(),k=c.firstChild;return e.insert(c,e.createComponent(h,{size:"normal"}),k),c})()},get children(){return e.createComponent(r.Show,{get when(){return w()===null},get fallback(){const c=()=>w();return(()=>{var k=gt(),j=k.firstChild,F=j.firstChild,W=F.nextSibling,T=W.firstChild,V=T.nextSibling,B=V.nextSibling,Q=B.nextSibling,L=Q.nextSibling,G=L.nextSibling;G.nextSibling;var $=j.nextSibling,P=$.firstChild,H=P.nextSibling,N=$.nextSibling;return N.firstChild,e.insert(F,()=>c().ok?"All selected Swarm items removed and verified":"Uninstall completed with remaining items"),e.insert(W,()=>c().removed.length,T),e.insert(W,()=>c().edited.length,V),e.insert(W,()=>c().skipped.length,Q),e.insert(W,()=>c().errors.length,G),e.insert(H,e.createComponent(r.For,{get each(){return c().verification},children:O=>(()=>{var q=wt(),Z=q.firstChild,te=Z.nextSibling,U=te.firstChild,D=U.nextSibling;return e.insert(Z,()=>O.passed?"✓":"✗"),e.insert(U,()=>O.label),e.insert(D,()=>O.detail),e.effect(()=>e.className(q,`swarm-uninstall-check-row${O.passed?" is-pass":" is-fail"}`)),q})()})),e.insert(k,e.createComponent(r.Show,{get when(){return c().errors.length>0},get children(){var O=mt(),q=O.firstChild,Z=q.nextSibling;return e.insert(Z,e.createComponent(r.For,{get each(){return c().errors},children:te=>(()=>{var U=_e();return e.insert(U,te),U})()})),O}}),N),e.insert(k,e.createComponent(r.Show,{get when(){return c().nextSteps.length>0},get children(){var O=pt(),q=O.firstChild,Z=q.nextSibling;return e.insert(Z,()=>c().nextSteps.join(`
`)),O}}),N),e.insert(N,e.createComponent(l,{variant:"contrast",onClick:()=>t.onClose(),children:"Close"}),null),e.effect(()=>e.className(j,`swarm-uninstall-banner${c().ok?" is-ok":" is-warn"}`)),k})()},get children(){return e.createComponent(r.Show,{get when(){return C()},children:c=>(()=>{var k=ft(),j=k.firstChild,F=j.nextSibling,W=F.firstChild,T=W.firstChild,V=T.firstChild,B=F.nextSibling,Q=B.firstChild,L=Q.nextSibling,G=B.nextSibling;return e.insert(F,e.createComponent(r.For,{get each(){return c().categories},children:$=>{const P=()=>y()[$.id];return(()=>{var H=ht(),N=H.firstChild,O=N.firstChild,q=O.nextSibling,Z=q.firstChild,te=Z.nextSibling,U=q.nextSibling;return O.addEventListener("change",()=>R($.id)),e.insert(Z,()=>$.title),e.insert(te,()=>$.description),e.insert(U,(()=>{var D=e.memo(()=>$.items.length===0);return()=>D()?"Clean":`${$.items.length} item${$.items.length===1?"":"s"}`})()),e.insert(H,e.createComponent(r.Show,{get when(){return $.items.length>0},get fallback(){return vt()},get children(){var D=bt();return e.insert(D,e.createComponent(r.For,{get each(){return $.items},children:J=>(()=>{var Y=St(),K=Y.firstChild,ue=K.nextSibling,de=ue.nextSibling;return e.insert(K,()=>J.kind),e.insert(ue,()=>J.path),e.insert(de,()=>J.detail,null),e.insert(de,(()=>{var he=e.memo(()=>!!J.sizeBytes);return()=>he()?` (${xt(J.sizeBytes)})`:""})(),null),Y})()})),D}}),null),e.effect(D=>{var J=`swarm-uninstall-card${P()?" is-checked":""}`,Y=v();return J!==D.e&&e.className(H,D.e=J),Y!==D.t&&(O.disabled=D.t=Y),D},{e:void 0,t:void 0}),e.effect(()=>O.checked=P()),H})()}}),W),V.addEventListener("change",()=>S($=>!$)),e.insert(L,e.createComponent(r.For,{get each(){return c().preserved},children:$=>(()=>{var P=_e();return e.insert(P,$),P})()})),e.insert(G,e.createComponent(l,{variant:"ghost",get disabled(){return v()},onClick:()=>t.onClose(),children:"Cancel"}),null),e.insert(G,e.createComponent(l,{variant:"contrast",get disabled(){return v()||m()===0},onClick:()=>{I()},get children(){return v()?"Removing...":"Confirm & Remove Selected Items"}}),null),e.effect($=>{var P=`swarm-uninstall-card${b()?" is-checked":""}`,H=v();return P!==$.e&&e.className(W,$.e=P),H!==$.t&&(V.disabled=$.t=H),$},{e:void 0,t:void 0}),e.effect(()=>V.checked=b()),k})()})}})}}),null),d}})}const Se="swarm-board",Ie=le.Schema.Struct({sidebarShow:le.Schema.Boolean,pillbarShow:le.Schema.Boolean,showWhenIdle:le.Schema.Boolean,composerPill:le.Schema.Boolean,bottomStrip:le.Schema.Boolean,withSidePanel:le.Schema.Boolean,toastEnabled:le.Schema.Boolean,onboardingComplete:le.Schema.Boolean}),be={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0,onboardingComplete:!1};function $t(t,l,o){return t!==l?!1:(o(),!0)}function ve(t){if(!t)return"";const l=t.posts.length>0?String(t.posts[t.posts.length-1]?.id??""):"",o=t.members.map(h=>`${h.handle}:${h.state}:${h.trackStatus??""}`).join("|");return[t.swarmId,t.status,t.boardUrl??"",t.stalled?"1":"0",t.verifierStatus??"",String(t.posts.length),l,o].join("\0")}function kt(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(o=>({id:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),activeCount:typeof o.activeCount=="number"?o.activeCount:void 0,waitingCount:typeof o.waitingCount=="number"?o.waitingCount:void 0,postCount:typeof o.postCount=="number"?o.postCount:typeof o.post_count=="number"?o.post_count:void 0,updatedAt:o.updatedAt??(typeof o.updated_at=="number"?new Date(o.updated_at).toISOString():void 0)}))}function Ct(t){if(!t||typeof t!="object")return null;const l=t;if(typeof l.swarmId=="string"&&Array.isArray(l.posts))return l;const o=l.swarm;if(!o||typeof o!="object")return null;const h=Array.isArray(l.members)?l.members:[],g=Array.isArray(l.board_posts)?l.board_posts:Array.isArray(l.posts)?l.posts:[],_=Array.isArray(l.file_locks)?l.file_locks:Array.isArray(l.locks)?l.locks:[],v=h.map(n=>({handle:String(n.handle??n.name??""),role:typeof n.role=="string"?n.role:void 0,state:String(n.state??"waiting"),model:typeof n.model=="string"?n.model:void 0,variant:typeof n.variant=="string"?n.variant:void 0,trackStatus:typeof n.track_status=="string"?n.track_status:n.trackStatus,ownedGlobs:Array.isArray(n.owned_globs)?n.owned_globs:Array.isArray(n.ownedGlobs)?n.ownedGlobs:[],sessionId:typeof n.session_id=="string"?n.session_id:n.sessionId,session_id:typeof n.session_id=="string"?n.session_id:n.sessionId})),a=g.map(n=>({id:n.seq??n.id??0,seq:typeof n.seq=="number"?n.seq:void 0,author:String(n.author??""),body:String(n.body??""),createdAt:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.createdAt,created_at:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.created_at,mentions:Array.isArray(n.mentions)?n.mentions:[]})),u=_.map(n=>({glob:String(n.glob_pattern??n.glob??""),owner:String(n.owner_handle??n.owner??""),acquiredAt:typeof n.claimed_at=="number"?new Date(n.claimed_at).toISOString():n.acquiredAt})),E=h.some(n=>!!n.paused_quota),C=[...a].reverse().find(n=>n.author.replace(/^@/,"").toLowerCase()==="verifier"),z=C?/\bFAIL\b/i.test(C.body)?"FAIL":/\bPASS\b/i.test(C.body)?"PASS":void 0:void 0,w=[];for(const n of a)if(n.mentions&&n.mentions.length>0)for(const b of n.mentions)w.push({from:n.author,to:b.startsWith("@")?b:`@${b}`,summary:n.body.slice(0,80),at:n.createdAt});return{swarmId:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),boardUrl:typeof l.boardUrl=="string"?l.boardUrl:void 0,pausedQuota:E,paused_quota:E,stalled:!!l.stalled,verifierStatus:z,members:v,posts:a,locks:u,handoffs:w}}var _t=e.template("<span>"),It=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),At=e.template("<div style=padding:12px>Loading Swarm Board...");const zt=r.lazy(()=>Promise.resolve().then(()=>Ft)),Mt=[{id:Se,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"},{id:"swarm-board.autoSpawnVerifier",title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish",keywords:"swarm verifier auto spawn gate verification"},{id:"swarm-board.status",title:"Setup Role Models",description:"Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",keywords:"swarm models onboarding wizard setup"},{id:"swarm-board.uninstall",title:"Uninstall Swarm Plugin",description:"Review removal checklist and completely uninstall Swarm Runtime",keywords:"swarm uninstall remove cleanup reset"}],Rt=`
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`,Et=X.Plugin.define({stores:{settings:X.Store.global(Ie,be)},setup(t){const l=t.stores?.settings??t.storage.store("swarm.settings",{schema:Ie,initial:be}),o=()=>l.value??be,h=(s,i)=>{l.set({...o(),[s]:i})},g=(s,i)=>{try{return t.add(s,i)}catch(p){return console.warn("[opencode-swarm] OpenCode did not accept a GUI item:",p),()=>{}}};g(X.Style,Me);const[_,v]=r.createSignal([]),[a,u]=r.createSignal(null),[E,C]=r.createSignal(null),[z,w]=r.createSignal(null),[n,b]=r.createSignal(null),[S,y]=r.createSignal(""),[f,M]=r.createSignal(void 0),[m,R]=r.createSignal({state:"connected"}),[I,d]=r.createSignal(!0);let c=!1,k="",j=!1,F="",W=null,T=0,V=null,B=ve(null);const Q=()=>t.sessions.current()?.id??null,L=()=>n()!==null,G=()=>t.sessions.current()?.location?.directory??f(),$=()=>t.client.rpc($e),P=(s=8e3)=>{const i=t.sessions.current()?.location??(f()?{directory:f()}:void 0),p=AbortSignal.timeout(s);return i?{location:i,signal:p}:{signal:p}},H=s=>{if(!o().toastEnabled)return;const i=!!(s.pausedQuota??s.paused_quota);i&&!c&&t.toast.show({title:"Swarm paused on quota",description:s.title||s.swarmId,variant:"error"}),c=i;const p=(s.verifierStatus??"").toUpperCase();(p==="PASS"||p==="FAIL")&&p!==k&&t.toast.show({title:`@verifier ${p}`,description:s.title||s.swarmId,variant:p==="PASS"?"success":"error"}),k=p;const x=[...s.posts].reverse().find(A=>A.author.replace(/^@/,"").toLowerCase()==="monitor");s.stalled&&!j?t.toast.show({title:"@monitor stall nudge",description:x?.body??"Swarm appears stalled"}):x&&x.id!==W&&W!==null&&t.toast.show({title:"@monitor stall nudge",description:x.body}),j=!!s.stalled,x&&(W=x.id),s.status==="completed"&&F!==s.swarmId&&(F=s.swarmId,t.toast.show({title:"Swarm completed",description:s.title||s.swarmId,variant:"success"}))},N=async()=>{const s=++T;try{const i=$(),p=P(),x=await i.listSwarms({},p);if(s!==T)return;const A=kt(x);v(A);const re=a();re&&!A.some(me=>me.id===re)&&(u(null),C(null));const ne=Q(),oe=ne?E():null,fe=!!ne&&!oe,ce=await i.getSwarmSnapshot(oe?{swarmId:oe}:ne?{sessionId:ne}:{},p);if(s!==T)return;ce&&typeof ce=="object"&&typeof ce.boardUrl=="string"&&ce.boardUrl&&y(ce.boardUrl);const ie=Ct(ce),we=ve(ie);we!==B&&(B=we,w(ie)),fe&&ie&&b(ie.swarmId),m().state!=="connected"&&R({state:"connected"}),i.getRoleConfig(oe?{swarmId:oe}:ne?{sessionId:ne}:{},p).then(me=>{$t(s,T,()=>{const ye=me&&typeof me=="object"&&"output"in me?me.output:me;typeof ye?.autoSpawnVerifier=="boolean"&&d(ye.autoSpawnVerifier)})}).catch(()=>{}),ie&&H(ie)}catch(i){if(s!==T)return;const x=typeof i=="object"&&i!==null&&"type"in i&&i.type==="rpc.unavailable"?{state:"unavailable"}:{state:"error",message:i instanceof Error?i.message:String(i)},A=m();A.state===x.state&&(x.state!=="error"||A.message===x.message)||R(x)}};r.createEffect(()=>{G();const s=Q();t.sessions.current()?.pending,a(),s!==V&&(V=s,C(null),u(null),w(null),B=ve(null),b(null),y(""),v([])),N()});let O=null,q;const Z=()=>{if(O!==t.client){q?.abort(),O=t.client,q=new AbortController;try{t.client.rpc($e).events.on("changed",()=>{N()},{signal:q.signal})}catch{}}};Z(),r.createEffect(()=>{try{const s=t.servers;if(!s)return;const p=s.list().map(A=>s.get(A)).find(A=>A?.builtin)?.data;if(!p||typeof p.on!="function")return;const x=p.on("session.tool.success",()=>{N()});r.onCleanup(()=>x())}catch{}});const te=setInterval(()=>{Z(),N()},2e3);r.onCleanup(()=>{q?.abort(),clearInterval(te)});const U=r.createMemo(()=>{const s=z();if(!s)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let i=0,p=0;for(const x of s.members){const A=x.state.toLowerCase();A==="working"||A==="active"?i++:(A==="waiting"||A==="idle")&&p++}return{active:i,waiting:p,posts:s.posts.length,paused:!!(s.pausedQuota??s.paused_quota),stalled:!!s.stalled}}),D=(s=!1)=>{if(!o().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const i=t.sessions.current();if(!i){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const p=`${t.id}:swarm`;if(s&&t.layout.state(p,i)==="visible"){t.layout.hide(p,i);return}t.layout.open(p,i)},J=()=>{t.layout.settings(Se)},Y=r.createMemo(()=>{const s=z(),i=U();return!!(s&&(i.active>0||s.status==="running"&&s.members.some(p=>p.state.toLowerCase()==="working")))});g(X.Style,()=>Y()?Rt:void 0);const K=()=>{t.dialogs.open(s=>e.createComponent(Ze,{ctx:t,loadRoleConfig:async()=>{const i=a(),p=t.sessions.current()?.id;return await $().getRoleConfig(i?{swarmId:i}:p?{sessionId:p}:{},P())},onApplyModels:async i=>{const p=[],x=a(),A=t.sessions.current()?.id;for(const re of["coordinator","worker","verifier","monitor"]){const ne=i[re];if(!ne)continue;const oe=await $().setRoleModel({role:re,model:ne,...x?{swarmId:x}:{},...A?{sessionId:A}:{}},P());oe?.ok||p.push(`${re}: ${oe?.error??"failed"}`)}return N(),{ok:p.length===0,errors:p}},onComplete:()=>{h("onboardingComplete",!0),s.close()},onSkip:()=>{h("onboardingComplete",!0),s.close()}}))},ue=()=>{t.dialogs.open(s=>e.createComponent(We,{ctx:t,snapshot:z,counts:U,isBuzzing:Y,loadRoleConfig:async()=>{const i=a(),p=t.sessions.current()?.id;return await $().getRoleConfig(i?{swarmId:i}:p?{sessionId:p}:{},P())},onSetRoleModel:async(i,p)=>{const x=a(),A=t.sessions.current()?.id,re=await $().setRoleModel({role:i,model:p,...x?{swarmId:x}:{},...A?{sessionId:A}:{}},P());return N(),re},onOpenBoard:()=>D(!1),onOpenSetupWizard:()=>{s.close(),K()},onClose:()=>s.close()}))},de=()=>{t.dialogs.open(s=>e.createComponent(yt,{ctx:t,loadPlan:async()=>await $().previewUninstall({},P(3e4)),onExecute:async i=>await $().executeUninstall({categories:i},P(12e4)),onResetGuiStore:()=>{l.set(be)},onClose:()=>s.close()}))};g(X.SettingsPage,()=>({id:Se,title:"Swarm Board",icon:"dot-grid",entries:Mt,render:({target:s})=>e.createComponent(lt,{ctx:t,settings:o,updateSetting:h,rpcStatus:m,activeSwarmCount:()=>_().length,autoSpawnVerifier:I,onToggleAutoSpawnVerifier:async i=>{const p=I();d(i);try{const x=await $().setAutoSpawnVerifier({enabled:i},P()),A=x&&typeof x=="object"&&"output"in x?x.output:x;typeof A?.autoSpawnVerifier=="boolean"&&d(A.autoSpawnVerifier)}catch(x){d(p),t.toast.show({title:"Failed to update Auto-spawn verifier",description:x instanceof Error?x.message:String(x),variant:"error"})}},onOpenPanel:()=>D(!1),onOpenSetupWizard:K,onOpenUninstall:de,onRefresh:()=>{N()},target:s})})),g(X.TitlebarItem,()=>{if(!L()||!o().pillbarShow)return;const s=z(),i=t.sessions.current(),p=i?t.layout.state(`${t.id}:swarm`,i)==="visible":!1,x=U(),A=x.paused||x.stalled?" ⚠":"";return{id:"swarm-open",label:Y()?`🐝 Swarm: Buzzing (${x.active} active · ${x.posts} posts)${A}`:s?`🐝 Swarm: Dozing (${x.posts} posts)${A}`:"🐝 Swarm: Dozing",title:x.paused?"Swarm paused on quota — click to open Swarm Board":x.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:p,run:()=>D(!0)}}),g(X.ComposerPill,{id:"swarm-composer-pill",show(s){if(s.session.directory&&M(s.session.directory),!L()||!o().composerPill)return;const i=z(),p=U(),x=(i?.verifierStatus??"").toUpperCase();let A;return p.paused||x==="FAIL"?A="danger":p.stalled&&(A="warning"),{label:Y()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",...A?{tone:A}:{},title:"Click to configure Swarm role models or open Board",run:()=>ue()}}}),g(X.Slot,{at:"window.bottom",render:()=>{const s=()=>{if(!L()||!o().bottomStrip)return!1;const i=t.sessions.current();return!(i?t.layout.state(`${t.id}:swarm`,i)==="visible":!1)||o().withSidePanel};return e.createComponent(r.Show,{get when(){return s()},get children(){var i=It(),p=i.firstChild,x=p.firstChild,A=x.nextSibling,re=A.nextSibling,ne=re.nextSibling,oe=ne.nextSibling,fe=oe.nextSibling,ce=fe.nextSibling,ie=ce.nextSibling;return ie.nextSibling,i.$$click=()=>D(!0),e.insert(p,()=>z()?.title??"Idle",A),e.insert(p,()=>U().active,ne),e.insert(p,()=>U().waiting,fe),e.insert(p,()=>U().posts,ie),e.insert(i,e.createComponent(r.Show,{get when(){return U().paused||U().stalled},get children(){var we=_t();return e.insert(we,()=>U().paused?"Paused on quota":"Stalled"),we}}),null),i}})}}),g(X.MenuItem,()=>{if(!L())return;const s=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:s?t.layout.state(`${t.id}:swarm`,s)!=="closed":!1,run:()=>D(!1)}}),g(X.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>D(!1)})),g(X.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>J()})),g(X.Command,()=>({id:"setup-models",title:"Swarm Model Setup Wizard",description:"Choose recommended or manual models for Swarm roles",group:"Swarm",section:"model",run:()=>K()})),g(X.Command,()=>({id:"uninstall",title:"Uninstall Swarm Plugin",description:"Open the Swarm removal checklist and completely uninstall Swarm Runtime",group:"Swarm",section:"general",run:()=>de()}));const he={id:"swarm",title:"Swarm",pinned:!1};g(X.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return L()&&o().sidebarShow?[he]:[]},render(s){return s.session.directory&&M(s.session.directory),e.createComponent(r.Suspense,{get fallback(){return At()},get children(){return e.createComponent(zt,{ctx:t,snapshot:z,boardUrl:S,swarms:_,selectedSwarmId:a,sessionId:()=>s.session.id,onSelectSwarm:i=>{C(i),u(i)},onRefresh:()=>{N()},onOpenSettings:J,rpcError:()=>{const i=m();if(i.state==="unavailable")return"Server plugin (local.opencode-swarm) is not loaded for this workspace.";if(i.state==="error")return i.message},onCompleteSwarm:async i=>{await $().completeSwarm({swarmId:i},P()),await N()},get server(){return s.session.server}})}})}})}});e.delegateEvents(["click"]);var Lt=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),Pt=e.template("<option>"),Bt=e.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),Ot=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),Ut=e.template("<option> (<!>)"),Dt=e.template("<div class=swarm-gui-empty>");function Vt(t){const{Button:l,Dialog:o}=t.ctx.ui,[h,g]=r.createSignal(0);let _;const v=r.createMemo(()=>t.snapshot()?.boardUrl||t.boardUrl?.()||""),a=r.createMemo(()=>t.selectedSwarmId()??t.snapshot()?.swarmId??""),u=r.createMemo(()=>{const w=v();if(!w)return"";const n=a(),b=t.sessionId?.()??"",S=h();try{const y=new URL(w);return n&&y.searchParams.set("swarmId",n),b&&y.searchParams.set("conversationId",b),S>0&&y.searchParams.set("_r",String(S)),y.toString()}catch{return w}}),E=r.createMemo(()=>{const w=u();if(!w)return"";try{return new URL(w).origin}catch{return""}}),C=()=>{const w=_?.contentWindow,n=E();if(!w||!n)return;const b=t.ctx.appearance.mode(),S=typeof document<"u"?getComputedStyle(document.documentElement):null,y=m=>S?.getPropertyValue(m).trim()||"",f={},M=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[m,R]of M){const I=y(R);I&&(f[m]=I)}w.postMessage({type:"swarm:theme",mode:b,tokens:f},n)};if(r.createEffect(()=>{t.ctx.appearance.mode(),C()}),typeof window<"u"){const w=n=>{if(n.source!==_?.contentWindow)return;const b=E();if(b&&n.origin!==b)return;const S=n.data;if(S?.type==="swarm:open_session"&&typeof S.sessionID=="string"&&S.sessionID){const y=t.server,f=typeof y=="string"?y:y?.id??t.ctx.sessions.current()?.server.id;if(!f){t.ctx.toast.show({title:"No server context for member session"});return}t.ctx.tabs.open({server:f,id:S.sessionID},{focus:!0})}};window.addEventListener("message",w),r.onCleanup(()=>window.removeEventListener("message",w))}const z=()=>{const w=t.snapshot();w&&t.ctx.dialogs.open(n=>e.createComponent(o,{title:"Complete Swarm?",get children(){var b=Lt(),S=b.firstChild,y=S.firstChild,f=y.nextSibling,M=S.nextSibling;return e.insert(f,()=>w.title||w.swarmId),e.insert(M,e.createComponent(l,{variant:"ghost",onClick:()=>n.close(),children:"Cancel"}),null),e.insert(M,e.createComponent(l,{variant:"danger",onClick:async()=>{try{await t.onCompleteSwarm(w.swarmId),n.close()}catch(m){t.ctx.toast.show({title:"Failed to complete swarm",description:m instanceof Error?m.message:String(m),variant:"error"})}},children:"Complete Swarm"}),null),b}}))};return(()=>{var w=Ot(),n=w.firstChild,b=n.firstChild;return b.addEventListener("change",S=>t.onSelectSwarm(S.currentTarget.value)),e.insert(b,e.createComponent(r.Show,{get when(){return t.swarms().length===0},get children(){var S=Pt();return e.insert(S,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>S.value=t.snapshot()?.swarmId??""),S}}),null),e.insert(b,e.createComponent(r.For,{get each(){return t.swarms()},children:S=>(()=>{var y=Ut(),f=y.firstChild,M=f.nextSibling;return M.nextSibling,e.insert(y,()=>S.title||S.id,f),e.insert(y,()=>S.status,M),e.effect(()=>y.value=S.id),y})()}),null),e.insert(n,e.createComponent(l,{size:"small",variant:"ghost",onClick:()=>{t.onRefresh(),g(S=>S+1)},children:"Refresh"}),null),e.insert(n,e.createComponent(r.Show,{get when(){return t.snapshot()?.status==="running"},get children(){return e.createComponent(l,{size:"small",variant:"neutral",onClick:z,children:"Complete"})}}),null),e.insert(n,e.createComponent(r.Show,{get when(){return t.onOpenSettings},get children(){return e.createComponent(l,{size:"small",variant:"ghost",onClick:()=>t.onOpenSettings?.(),children:"Settings"})}}),null),e.insert(w,e.createComponent(r.Show,{get when(){return u()},get fallback(){return(()=>{var S=Dt();return e.insert(S,()=>t.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),S})()},get children(){var S=Bt();return S.addEventListener("load",()=>C()),e.use(y=>{_=y},S),e.effect(()=>e.setAttribute(S,"src",u())),S}}),null),e.effect(()=>b.value=a()),w})()}const Ft=Object.freeze(Object.defineProperty({__proto__:null,default:Vt},Symbol.toStringTag,{value:"Module"}));exports.default=Et;
