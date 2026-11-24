"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),se=require("@opencode/plugin/gui"),r=require("solid-js"),we=require("effect");function ie(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function ue(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(l){const i=t(l);return i?{issues:[{message:i}]}:{value:l}}}}}function ge(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(l){const i=l===void 0?{}:l;if(!ie(i))return{issues:[{message:"input must be an object"}]};const S=t(i);return S?{issues:[{message:S}]}:{value:i}}}}}const ze={id:"local.opencode-swarm",methods:{getBoardInfo:{input:ge(()=>null),output:ue(t=>ie(t)&&typeof t.url=="string"&&typeof t.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:ge(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ue(t=>ie(t)&&Array.isArray(t.members)&&Array.isArray(t.board_posts)&&Array.isArray(t.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:ge(t=>t.limit!==void 0&&typeof t.limit!="number"?"limit must be a number":null),output:ue(t=>ie(t)&&Array.isArray(t.swarms)?null:"output must contain swarms array")},completeSwarm:{input:ge(t=>typeof t.swarmId!="string"?"swarmId must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":t.exitSession!==void 0&&typeof t.exitSession!="boolean"?"exitSession must be a boolean":t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":null),output:ue(t=>ie(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:ge(t=>typeof t.swarmId!="string"?"swarmId must be a string":typeof t.handle!="string"?"handle must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ue(t=>ie(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:ge(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ue(t=>ie(t)&&ie(t.roleModels)&&Array.isArray(t.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:ge(t=>typeof t.role!="string"?"role must be a string":typeof t.model!="string"?"model must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":null),output:ue(t=>ie(t)&&typeof t.ok=="boolean"?null:"output must be SetRoleModelResult")},setAutoSpawnVerifier:{input:ge(t=>typeof t.enabled=="boolean"?null:"enabled must be a boolean"),output:ue(t=>ie(t)&&typeof t.ok=="boolean"&&typeof t.autoSpawnVerifier=="boolean"?null:"output must contain ok and autoSpawnVerifier booleans")},previewUninstall:{input:ge(()=>null),output:ue(t=>ie(t)&&Array.isArray(t.categories)&&Array.isArray(t.preserved)?null:"output must be UninstallPlan")},executeUninstall:{input:ge(t=>t.categories!==void 0&&!ie(t.categories)?"categories must be an object":null),output:ue(t=>ie(t)&&typeof t.ok=="boolean"&&Array.isArray(t.verification)?null:"output must be UninstallResult")}},events:{changed:{schema:ue(t=>ie(t)&&typeof t.swarmId=="string"&&typeof t.reason=="string"?null:"event must contain swarmId and reason")}}},Pe=`
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
  gap: 12px;
  padding: 6px 4px 4px;
  color: var(--text-base, #b5b4b0);
  font-size: 13px;
}

.swarm-overlay-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-radius: 10px;
  background: var(--surface-raised-base, #1d1d1c);
  border: 1px solid var(--border-weak-base, #2f2f2d);
}

.swarm-overlay-top.is-buzzing {
  border-color: rgba(74, 222, 128, 0.35);
  background: linear-gradient(135deg, rgba(74, 222, 128, 0.07), var(--surface-raised-base, #1d1d1c) 60%);
}

.swarm-overlay-top.is-alert {
  border-color: rgba(245, 166, 35, 0.45);
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
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--surface-base-hover, #262625);
  color: var(--text-strong, #ededec);
  white-space: nowrap;
}

.swarm-overlay-badge.is-buzzing {
  background: rgba(74, 222, 128, 0.14);
  color: #86efac;
}

.swarm-overlay-dot {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--text-weak, #8a8984);
}

.swarm-overlay-badge.is-buzzing .swarm-overlay-dot {
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.7);
}

.swarm-overlay-meta {
  display: flex;
  flex-direction: column;
  min-width: 0;
  gap: 4px;
}

.swarm-overlay-meta strong {
  color: var(--text-strong, #ededec);
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swarm-overlay-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.swarm-overlay-stat {
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--background-base, #141413);
  border: 1px solid var(--border-weak-base, #2f2f2d);
  color: var(--text-weak, #8a8984);
}

.swarm-overlay-stat.is-warn {
  color: #f5b942;
  border-color: rgba(245, 166, 35, 0.4);
}

.swarm-overlay-stat.is-danger {
  color: var(--icon-critical-base, #e05252);
  border-color: rgba(224, 82, 82, 0.4);
}

.swarm-overlay-roster {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  border-radius: 8px;
  background: var(--background-base, #141413);
  border: 1px solid var(--border-weak-base, #2f2f2d);
  max-height: 76px;
  overflow-y: auto;
}

.swarm-overlay-member-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  background: var(--surface-raised-base, #1d1d1c);
  border: 1px solid var(--border-weak-base, #2f2f2d);
  color: var(--text-base, #b5b4b0);
}

.swarm-overlay-member-chip.is-working {
  border-color: rgba(74, 222, 128, 0.4);
  color: var(--text-strong, #ededec);
}

.swarm-overlay-member-chip.is-killed {
  opacity: 0.45;
}

.swarm-overlay-member-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--text-weak, #8a8984);
}

.swarm-overlay-member-chip.is-working .swarm-overlay-member-dot {
  background: #4ade80;
}

.swarm-overlay-member-handle {
  font-weight: 600;
}

.swarm-overlay-member-model {
  font-family: var(--font-family-mono, monospace);
  font-size: 10px;
  color: var(--text-weak, #8a8984);
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
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.swarm-overlay-role-card {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-raised-base, #1d1d1c);
  border: 1px solid var(--border-weak-base, #2f2f2d);
  min-width: 0;
}

.swarm-overlay-role-card.is-dirty {
  border-color: rgba(245, 166, 35, 0.6);
  background: linear-gradient(180deg, rgba(245, 166, 35, 0.06), var(--surface-raised-base, #1d1d1c) 55%);
}

.swarm-overlay-role-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.swarm-overlay-role-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.swarm-overlay-role-title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.swarm-overlay-role-title strong {
  color: var(--text-strong, #ededec);
  font-size: 13px;
}

.swarm-overlay-role-badges {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.swarm-overlay-dirty-pill {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 999px;
  background: rgba(245, 166, 35, 0.16);
  color: #f5b942;
}

.swarm-overlay-role-count {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--surface-base-hover, #262625);
  color: var(--text-weak, #8a8984);
}

.swarm-overlay-role-count.is-working {
  background: rgba(74, 222, 128, 0.14);
  color: #86efac;
}

.swarm-overlay-role-sub {
  font-size: 11px;
  color: var(--text-weak, #8a8984);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.swarm-overlay-role-warn {
  font-size: 11px;
  color: #f5b942;
}

.swarm-overlay-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.swarm-overlay-select-wrap {
  width: 100%;
  min-width: 0;
}

.swarm-overlay-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-top: 8px;
  border-top: 1px solid var(--border-weak-base, #2f2f2d);
}

.swarm-overlay-footer-note {
  font-size: 11px;
  color: var(--text-weak, #8a8984);
}

.swarm-overlay-footer-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
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

.swarm-overlay-exit-confirm {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid rgba(224, 82, 82, 0.45);
  background: rgba(224, 82, 82, 0.1);
  color: var(--text-strong, #ededec);
  font-size: 12px;
}

.swarm-overlay-exit-confirm-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}
`,Se={coordinator:{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination",displayLabel:"Muse Spark 1.3 · xhigh",patterns:[/^muse-spark-1\.3/i,/muse[\s._-]*spark[\s._-]*1\.3/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"xhigh",fallbackSpec:"opencode-go/muse-spark-1.3-contributor#xhigh"},worker:{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · high",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"high",fallbackSpec:"opencode-go/deepseek-v4.1-flash#high"},verifier:{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · max",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"max",fallbackSpec:"opencode-go/deepseek-v4.1-flash#max"},monitor:{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads",displayLabel:"GLM 5.3 Flash · default",patterns:[/^glm-5\.3-flash$/i,/glm[\s._-]*5\.3[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:void 0,fallbackSpec:"opencode-go/glm-5.3-flash"}};function Me(t,l){const i={};for(const S of["coordinator","worker","verifier","monitor"]){const w=Se[S];let C;for(const x of w.preferredProviders)if(C=t.find(o=>o.providerID.toLowerCase()===x.toLowerCase()&&w.patterns.some(g=>g.test(o.id)||(o.name?g.test(o.name):!1))),C)break;if(C||(C=t.find(x=>w.patterns.some(o=>o.test(x.id)||(x.name?o.test(x.name):!1)))),C){const x=`${C.providerID}/${C.id}`;if(w.preferredVariant){const o=(C.variants??[]).find(g=>g.toLowerCase()===w.preferredVariant.toLowerCase());i[S]=o?`${x}#${o}`:x}else i[S]=x}else{const x=l?.[S];i[S]=x&&x.trim()?x.trim():w.fallbackSpec}}return i}function Le(t,l,i){const S=[],w=new Set;for(const o of t){const g=`${o.providerID}/${o.id}`;w.has(g)||(w.add(g),S.push({spec:g,label:o.name?`${g} (${o.name})`:g}));for(const D of o.variants??[]){const y=`${g}#${D}`;w.has(y)||(w.add(y),S.push({spec:y,label:y}))}}if(l&&!w.has(l)&&(w.add(l),S.push({spec:l,label:l})),i&&!w.has(i)&&(w.add(i),S.push({spec:i,label:i})),S.sort((o,g)=>o.label.localeCompare(g.label,void 0,{sensitivity:"base",numeric:!0})),!i)return S;let C;const x=[];for(const o of S)o.spec===i?C={...o,isRecommended:!0}:x.push(o);return C?[C,...x]:x}var Ue=e.template('<div role=listbox><div class=swarm-model-select-search-wrap><input type=search class=swarm-model-select-search placeholder="Search models..."></div><div class=swarm-model-select-list>'),Oe=e.template("<div class=swarm-model-select><button type=button class=swarm-model-select-trigger aria-haspopup=listbox><span class=swarm-model-select-value></span><span class=swarm-model-select-caret aria-hidden=true>▾"),De=e.template("<div class=swarm-model-select-empty>No matching models"),Ve=e.template("<span class=swarm-model-select-badge>Recommended"),Fe=e.template("<span class=swarm-model-select-check aria-hidden=true>✓"),je=e.template("<button type=button role=option><span class=swarm-model-select-item-label></span><span class=swarm-model-select-item-right>");function Be(t){const[l,i]=r.createSignal(!1),[S,w]=r.createSignal("");let C,x;const o=r.createMemo(()=>{const y=S().trim().toLowerCase();if(!y)return t.options;const L=y.split(/\s+/).filter(Boolean);return t.options.filter(O=>{const n=`${O.label} ${O.spec}`.toLowerCase();return L.every(u=>n.includes(u))})}),g=r.createMemo(()=>{const y=t.value;if(!y)return t.placeholder??"Select model...";const L=t.options.find(O=>O.spec===y);return L?L.label:y});r.createEffect(()=>{if(!l())return;w(""),queueMicrotask(()=>{x?.focus()});const y=O=>{C&&!C.contains(O.target)&&i(!1)},L=O=>{O.key==="Escape"&&(O.stopPropagation(),i(!1))};document.addEventListener("mousedown",y),document.addEventListener("keydown",L,!0),r.onCleanup(()=>{document.removeEventListener("mousedown",y),document.removeEventListener("keydown",L,!0)})});const D=y=>{i(!1),w(""),y!==t.value&&t.onChange(y)};return(()=>{var y=Oe(),L=y.firstChild,O=L.firstChild,n=C;return typeof n=="function"?e.use(n,y):C=y,L.$$click=()=>{t.disabled||i(u=>!u)},e.insert(O,g),e.insert(y,e.createComponent(r.Show,{get when(){return l()},get children(){var u=Ue(),R=u.firstChild,c=R.firstChild,h=R.nextSibling;c.$$keydown=I=>{if(I.key==="Enter"){if(I.preventDefault(),S().trim().length>0){const V=o()[0];V&&D(V.spec)}}else I.key==="Escape"&&(I.preventDefault(),I.stopPropagation(),i(!1))},c.$$input=I=>w(I.currentTarget.value);var M=x;return typeof M=="function"?e.use(M,c):x=c,e.insert(h,e.createComponent(r.Show,{get when(){return o().length>0},get fallback(){return De()},get children(){return e.createComponent(r.For,{get each(){return o()},children:I=>{const V=()=>I.spec===t.value;return(()=>{var G=je(),p=G.firstChild,m=p.nextSibling;return G.$$click=()=>D(I.spec),e.insert(p,()=>I.label),e.insert(m,e.createComponent(r.Show,{get when(){return I.isRecommended},get children(){return Ve()}}),null),e.insert(m,e.createComponent(r.Show,{get when(){return V()},get children(){return Fe()}}),null),e.effect(k=>{var K=V(),W=`swarm-model-select-item${V()?" is-selected":""}`;return K!==k.e&&e.setAttribute(G,"aria-selected",k.e=K),W!==k.t&&e.className(G,k.t=W),k},{e:void 0,t:void 0}),G})()}})}})),e.effect(I=>{var V=`swarm-model-select-menu${t.menuUpward?" swarm-model-select-menu-upward":""}`,G=`${t.ariaLabel} options`;return V!==I.e&&e.className(u,I.e=V),G!==I.t&&e.setAttribute(u,"aria-label",I.t=G),I},{e:void 0,t:void 0}),e.effect(()=>c.value=S()),u}}),null),e.effect(u=>{var R=t.disabled,c=t.ariaLabel,h=l();return R!==u.e&&(L.disabled=u.e=R),c!==u.t&&e.setAttribute(L,"aria-label",u.t=c),h!==u.a&&e.setAttribute(L,"aria-expanded",u.a=h),u},{e:void 0,t:void 0,a:void 0}),y})()}e.delegateEvents(["click","input","keydown"]);function _e(){let t=!1;return r.onCleanup(()=>{t=!0}),()=>t}var Ne=e.template('<span class="swarm-overlay-stat is-danger">Quota paused'),We=e.template('<span class="swarm-overlay-stat is-warn">Stalled'),qe=e.template("<div class=swarm-overlay-exit-confirm><span>Stop active workers, release file locks, restore original composer, and remove all Swarm UI from this session?</span><div class=swarm-overlay-exit-confirm-actions>"),Te=e.template('<div class=swarm-overlay-roster aria-label="Active swarm members">'),Ge=e.template("<div class=swarm-overlay-error>"),Ke=e.template("<div class=swarm-overlay-roles>"),Qe=e.template("<span> role change<!> ready"),He=e.template("<div class=swarm-overlay-root><div><div class=swarm-overlay-status><span><span class=swarm-overlay-dot aria-hidden=true></span></span><div class=swarm-overlay-meta><strong></strong><div class=swarm-overlay-stats><span class=swarm-overlay-stat> active</span><span class=swarm-overlay-stat> waiting</span><span class=swarm-overlay-stat> posts</span></div></div></div><div class=swarm-overlay-actions></div></div><div class=swarm-overlay-footer><div class=swarm-overlay-footer-note></div><div class=swarm-overlay-footer-actions>"),Ze=e.template("<span class=swarm-overlay-member-model>"),Je=e.template("<span><span class=swarm-overlay-member-dot aria-hidden=true></span><span class=swarm-overlay-member-handle>@"),Ye=e.template("<div class=swarm-overlay-loading><span>Loading role models..."),Xe=e.template("<span class=swarm-overlay-dirty-pill>Modified"),et=e.template("<span>"),tt=e.template("<span class=swarm-overlay-role-warn>Applying will interrupt & rerun <!> working "),rt=e.template("<div><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><span class=swarm-overlay-role-title><span aria-hidden=true></span><strong></strong></span><div class=swarm-overlay-role-badges></div></div><span class=swarm-overlay-role-sub></span></div><div class=swarm-overlay-select-wrap>"),nt=e.template("<span>No pending model changes — running members are untouched.");const Ae=[{role:"coordinator",icon:"🧭",title:"Coordinator",subtitle:"Plans, spawns & coordinates the board"},{role:"worker",icon:"🛠️",title:"Worker",subtitle:"Executes assigned tasks & edits"},{role:"verifier",icon:"🛡️",title:"Verifier",subtitle:"Read-only independent PASS/FAIL gate"},{role:"monitor",icon:"📡",title:"Monitor",subtitle:"Detects stalls & nudges blocked threads"}];function at(t,l){if(!t)return"";const i=t.includes("/")?t.split("/").slice(1).join("/"):t;return l?`${i}#${l}`:i}function ot(t){const{Button:l,Dialog:i,Loader:S}=t.ctx.ui,[w,C]=r.createSignal(null),[x,o]=r.createSignal({}),[g,D]=r.createSignal(!0),[y,L]=r.createSignal(!1),[O,n]=r.createSignal(!1),[u,R]=r.createSignal(!1),[c,h]=r.createSignal(null),M=_e(),I=async()=>{D(!0),h(null);try{const f=await t.loadRoleConfig();if(M())return;C(f),f?.roleModels&&o({...f.roleModels})}catch(f){if(M())return;h(f instanceof Error?f.message:String(f))}finally{M()||D(!1)}};r.onMount(()=>{I()});const V=f=>w()?.roleModels[f]??"",G=f=>x()[f]??V(f),p=f=>Le(w()?.models??[],G(f)),m=f=>{const A=t.snapshot();if(!A)return{working:0,waiting:0};let E=0,$=0;for(const j of A.members){if((j.role??"").toLowerCase()!==f)continue;const v=j.state.toLowerCase();v==="working"||v==="active"?E++:(v==="waiting"||v==="idle")&&$++}return{working:E,waiting:$}},k=r.createMemo(()=>Ae.filter(f=>{const A=V(f.role),E=G(f.role);return!!E&&E!==A})),K=r.createMemo(()=>k().length>0),W=r.createMemo(()=>{let f=0;for(const A of k())A.role!=="coordinator"&&(f+=m(A.role).working);return f}),Q=(f,A)=>{A&&(h(null),o(E=>({...E,[f]:A})))},ee=()=>{const f=w()?.roleModels;f&&o({...f}),h(null)},re=async()=>{const f=k();if(f.length===0||y())return;L(!0),h(null);const A={...w()?.roleModels??{}},E=[],$=[],j=[];try{for(const v of f){const F=G(v.role),P=await t.onSetRoleModel(v.role,F);if(M())return;if(!P||!P.ok){j.push(`${v.title}: ${P?.error??"failed"}`);continue}A[v.role]=P.model,E.push(`${v.title} → ${P.model}`);for(const U of P.rerunMembers)$.includes(U)||$.push(U)}if(C(v=>v&&{...v,roleModels:{...v.roleModels,...A}}),j.length>0){const v=j.join("; ");h(v),t.ctx.toast.show({title:"Some role switches failed",description:v,variant:"error"})}else t.ctx.toast.show({title:`Updated ${E.length} role${E.length===1?"":"s"}`,description:$.length>0?`Switched & rerunning: ${$.map(v=>`@${v}`).join(", ")}`:E.join(" · "),variant:"success"})}catch(v){if(M())return;const F=v instanceof Error?v.message:String(v);h(F),t.ctx.toast.show({title:"Failed to apply role models",description:F,variant:"error"})}finally{M()||L(!1)}},J=r.createMemo(()=>t.snapshot()?.members??[]);return e.createComponent(i,{title:"🐝 Swarm Control",size:"large",get children(){var f=He(),A=f.firstChild,E=A.firstChild,$=E.firstChild;$.firstChild;var j=$.nextSibling,v=j.firstChild,F=v.nextSibling,P=F.firstChild,U=P.firstChild,H=P.nextSibling,ne=H.firstChild,ae=H.nextSibling,Z=ae.firstChild,te=E.nextSibling,N=A.nextSibling,q=N.firstChild,ce=q.nextSibling;return e.insert($,()=>t.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",null),e.insert(v,()=>t.snapshot()?.title??"No active swarm"),e.insert(P,()=>t.counts().active,U),e.insert(H,()=>t.counts().waiting,ne),e.insert(ae,()=>t.counts().posts,Z),e.insert(F,e.createComponent(r.Show,{get when(){return t.counts().paused},get children(){return Ne()}}),null),e.insert(F,e.createComponent(r.Show,{get when(){return e.memo(()=>!!t.counts().stalled)()&&!t.counts().paused},get children(){return We()}}),null),e.insert(te,e.createComponent(r.Show,{get when(){return t.onExitSwarmMode},get children(){return e.createComponent(l,{variant:"danger",size:"small",get disabled(){return y()||u()},onClick:async()=>{if(t.snapshot()?.status==="running"){n(!0);return}R(!0);try{await t.onExitSwarmMode?.(),M()||t.onClose()}finally{M()||R(!1)}},get children(){return e.memo(()=>!!u())()?"Exiting...":t.snapshot()?.status==="running"?"Stop & Exit":"Exit Swarm"}})}}),null),e.insert(te,e.createComponent(r.Show,{get when(){return t.onOpenSetupWizard},get children(){return e.createComponent(l,{variant:"ghost",size:"small",onClick:()=>t.onOpenSetupWizard?.(),children:"Setup Wizard"})}}),null),e.insert(te,e.createComponent(l,{variant:"contrast",size:"small",onClick:()=>{t.onOpenBoard(),t.onClose()},children:"Open Board"}),null),e.insert(f,e.createComponent(r.Show,{get when(){return O()},get children(){var z=qe(),B=z.firstChild,Y=B.nextSibling;return e.insert(Y,e.createComponent(l,{variant:"ghost",size:"small",get disabled(){return u()},onClick:()=>n(!1),children:"Cancel"}),null),e.insert(Y,e.createComponent(l,{variant:"danger",size:"small",get disabled(){return u()},onClick:async()=>{R(!0);try{await t.onExitSwarmMode?.(),M()||t.onClose()}finally{M()||R(!1)}},get children(){return u()?"Stopping...":"Confirm Stop & Exit"}}),null),z}}),N),e.insert(f,e.createComponent(r.Show,{get when(){return J().length>0},get children(){var z=Te();return e.insert(z,e.createComponent(r.For,{get each(){return J()},children:B=>{const Y=B.state.toLowerCase(),le=Y==="working"||Y==="active",fe=Y==="killed",be=at(B.model,B.variant);return(()=>{var a=Je(),s=a.firstChild,d=s.nextSibling;return d.firstChild,e.className(a,`swarm-overlay-member-chip${le?" is-working":""}${fe?" is-killed":""}`),e.insert(d,()=>B.handle,null),e.insert(a,e.createComponent(r.Show,{when:be,get children(){var b=Ze();return e.insert(b,be),b}}),null),a})()}})),z}}),N),e.insert(f,e.createComponent(r.Show,{get when(){return c()},get children(){var z=Ge();return e.insert(z,c),z}}),N),e.insert(f,e.createComponent(r.Show,{get when(){return!g()||w()!==null},get fallback(){return(()=>{var z=Ye(),B=z.firstChild;return e.insert(z,e.createComponent(S,{size:"normal"}),B),z})()},get children(){var z=Ke();return e.insert(z,e.createComponent(r.For,{each:Ae,children:(B,Y)=>{const le=()=>m(B.role),fe=()=>G(B.role),be=()=>!!fe()&&fe()!==V(B.role),a=r.createMemo(()=>p(B.role));return(()=>{var s=rt(),d=s.firstChild,b=d.firstChild,_=b.firstChild,oe=_.firstChild,X=oe.nextSibling,de=_.nextSibling,he=b.nextSibling,pe=d.nextSibling;return e.insert(oe,()=>B.icon),e.insert(X,()=>B.title),e.insert(de,e.createComponent(r.Show,{get when(){return be()},get children(){return Xe()}}),null),e.insert(de,e.createComponent(r.Show,{get when(){return le().working>0||le().waiting>0},get children(){var T=et();return e.insert(T,(()=>{var me=e.memo(()=>le().working>0);return()=>me()?`${le().working} working`:`${le().waiting} waiting`})()),e.effect(()=>e.className(T,`swarm-overlay-role-count${le().working>0?" is-working":""}`)),T}}),null),e.insert(he,()=>B.subtitle),e.insert(pe,e.createComponent(Be,{get value(){return fe()},get options(){return a()},get disabled(){return y()},get ariaLabel(){return`${B.title} model`},get menuUpward(){return Y()>=2},onChange:T=>Q(B.role,T)})),e.insert(s,e.createComponent(r.Show,{get when(){return e.memo(()=>!!(be()&&B.role!=="coordinator"))()&&le().working>0},get children(){var T=tt(),me=T.firstChild,ye=me.nextSibling;return ye.nextSibling,e.insert(T,()=>le().working,ye),e.insert(T,()=>B.role,null),e.insert(T,()=>le().working===1?"":"s",null),T}}),null),e.effect(()=>e.className(s,`swarm-overlay-role-card${be()?" is-dirty":""}`)),s})()}})),z}}),N),e.insert(q,e.createComponent(r.Show,{get when(){return K()},get fallback(){return nt()},get children(){var z=Qe(),B=z.firstChild,Y=B.nextSibling;return Y.nextSibling,e.insert(z,()=>k().length,B),e.insert(z,()=>k().length===1?"":"s",Y),e.insert(z,e.createComponent(r.Show,{get when(){return W()>0},get children(){return` · interrupts ${W()} working member${W()===1?"":"s"}`}}),null),z}})),e.insert(ce,e.createComponent(r.Show,{get when(){return K()},get children(){return e.createComponent(l,{variant:"ghost",size:"small",get disabled(){return y()},onClick:ee,children:"Reset"})}}),null),e.insert(ce,e.createComponent(l,{variant:"ghost",size:"small",get disabled(){return y()},onClick:()=>t.onClose(),children:"Close"}),null),e.insert(ce,e.createComponent(l,{variant:"contrast",size:"small",get disabled(){return!K()||y()},onClick:()=>{re()},get children(){return y()?"Applying...":"Apply Changes"}}),null),e.effect(z=>{var B=`swarm-overlay-top${t.isBuzzing()?" is-buzzing":""}${t.counts().paused||t.counts().stalled?" is-alert":""}`,Y=`swarm-overlay-badge${t.isBuzzing()?" is-buzzing":""}`;return B!==z.e&&e.className(A,z.e=B),Y!==z.t&&e.className($,z.t=Y),z},{e:void 0,t:void 0}),f}})}var st=e.template("<div class=swarm-overlay-error>"),it=e.template('<div class=swarm-onboard-intro><p class=swarm-onboard-question>Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?</p><div class=swarm-onboard-mode-cards><button type=button class="swarm-onboard-mode-card is-primary"><div class=swarm-onboard-option-top><strong>Use Recommended Models</strong><span class=swarm-model-select-badge>Recommended</span></div><p class=swarm-onboard-mode-desc>Apply tuned defaults for all 4 roles right away:</p><div class=swarm-onboard-rec-grid></div></button><button type=button class=swarm-onboard-mode-card><div class=swarm-onboard-option-top><strong>Pick Manually (4 Questions)</strong></div><p class=swarm-onboard-mode-desc>Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.</p></button></div><div class=swarm-onboard-footer><span>'),lt=e.template("<div class=swarm-onboard-root>"),dt=e.template("<div class=swarm-overlay-loading><span>Loading available models..."),ct=e.template("<div class=swarm-onboard-step><div class=swarm-onboard-step-head><span class=swarm-onboard-step-pill>Question <!> of </span><h3>Choose <!> Model</h3><p></p></div><div class=swarm-onboard-choices><button type=button><div class=swarm-onboard-option-top><strong>★ </strong><span class=swarm-model-select-badge>Recommended</span></div><span class=swarm-onboard-option-sub></span></button><div><div class=swarm-onboard-custom-head><strong>Pick from catalog (A–Z search)</strong><span>Type to filter by provider, model, or variant</span></div></div></div><div class=swarm-onboard-footer><div class=swarm-onboard-footer-right>"),mt=e.template("<div class=swarm-onboard-rec-row><span class=swarm-onboard-rec-role></span><span class=swarm-onboard-rec-spec>");const xe=["coordinator","worker","verifier","monitor"];function ut(t){const{Button:l,Dialog:i,Loader:S}=t.ctx.ui,[w,C]=r.createSignal(!0),[x,o]=r.createSignal(!1),[g,D]=r.createSignal(null),[y,L]=r.createSignal([]),[O,n]=r.createSignal(-1),[u,R]=r.createSignal({coordinator:Se.coordinator.fallbackSpec,worker:Se.worker.fallbackSpec,verifier:Se.verifier.fallbackSpec,monitor:Se.monitor.fallbackSpec}),c=r.createMemo(()=>Me(y())),h=_e();r.onMount(async()=>{C(!0),D(null);try{const p=await t.loadRoleConfig();if(h())return;const m=p?.models??[];L(m);const k=Me(m,p?.roleModels);R(k)}catch(p){if(h())return;D(p instanceof Error?p.message:String(p))}finally{h()||C(!1)}});const M=async p=>{o(!0),D(null);try{const m=await t.onApplyModels(p);if(h())return;if(!m.ok){const k=m.errors.join("; ")||"Failed to apply one or more role models.";D(k),t.ctx.toast.show({title:"Could not save all Swarm models",description:k,variant:"error"});return}t.ctx.toast.show({title:"Swarm role models configured",description:`Coordinator: ${p.coordinator}`,variant:"success"}),t.onComplete()}catch(m){if(h())return;const k=m instanceof Error?m.message:String(m);D(k)}finally{h()||o(!1)}},I=r.createMemo(()=>{const p=O();return p>=0&&p<xe.length?xe[p]:"coordinator"}),V=r.createMemo(()=>{const p=I();return Le(y(),u()[p],c()[p])}),G=(p,m)=>{R(k=>({...k,[p]:m}))};return e.createComponent(i,{title:"🐝 Swarm Model Setup",size:"large",get children(){var p=lt();return e.insert(p,e.createComponent(r.Show,{get when(){return g()},get children(){var m=st();return e.insert(m,g),m}}),null),e.insert(p,e.createComponent(r.Show,{get when(){return!w()},get fallback(){return(()=>{var m=dt(),k=m.firstChild;return e.insert(m,e.createComponent(S,{size:"normal"}),k),m})()},get children(){return e.createComponent(r.Show,{get when(){return O()===-1},get fallback(){const m=()=>O(),k=()=>I(),K=()=>Se[k()],W=()=>c()[k()],Q=()=>u()[k()],ee=()=>Q()===W();return(()=>{var re=ct(),J=re.firstChild,f=J.firstChild,A=f.firstChild,E=A.nextSibling;E.nextSibling;var $=f.nextSibling,j=$.firstChild,v=j.nextSibling;v.nextSibling;var F=$.nextSibling,P=J.nextSibling,U=P.firstChild,H=U.firstChild,ne=H.firstChild;ne.firstChild;var ae=H.nextSibling,Z=U.nextSibling;Z.firstChild;var te=P.nextSibling,N=te.firstChild;return e.insert(f,()=>m()+1,E),e.insert(f,()=>xe.length,null),e.insert($,()=>K().title,v),e.insert(F,()=>K().subtitle),U.$$click=()=>G(k(),W()),e.insert(ne,W,null),e.insert(ae,()=>K().displayLabel),e.insert(Z,e.createComponent(Be,{get value(){return Q()},get options(){return V()},get disabled(){return x()},get ariaLabel(){return`${K().title} model`},onChange:q=>G(k(),q)}),null),e.insert(te,e.createComponent(l,{variant:"ghost",get disabled(){return x()},onClick:()=>n(q=>Math.max(-1,q-1)),children:"Back"}),N),e.insert(N,e.createComponent(l,{variant:"ghost",get disabled(){return x()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.insert(N,e.createComponent(r.Show,{get when(){return m()<xe.length-1},get fallback(){return e.createComponent(l,{variant:"contrast",get disabled(){return x()},onClick:()=>{M(u())},get children(){return x()?"Saving...":"Save & Finish"}})},get children(){return e.createComponent(l,{variant:"contrast",get disabled(){return x()},onClick:()=>n(q=>q+1),get children(){return["Next (",e.memo(()=>m()+2),"/",e.memo(()=>xe.length),")"]}})}}),null),e.effect(q=>{var ce=`swarm-onboard-option-card${ee()?" is-selected":""}`,z=`swarm-onboard-custom-card${ee()?"":" is-selected"}`;return ce!==q.e&&e.className(U,q.e=ce),z!==q.t&&e.className(Z,q.t=z),q},{e:void 0,t:void 0}),re})()},get children(){var m=it(),k=m.firstChild,K=k.nextSibling,W=K.firstChild,Q=W.firstChild,ee=Q.nextSibling,re=ee.nextSibling,J=W.nextSibling,f=K.nextSibling;return f.firstChild,W.$$click=()=>{M(c())},e.insert(re,e.createComponent(r.For,{each:xe,children:A=>(()=>{var E=mt(),$=E.firstChild,j=$.nextSibling;return e.insert($,()=>Se[A].title),e.insert(j,()=>c()[A]),E})()})),J.$$click=()=>n(0),e.insert(f,e.createComponent(l,{variant:"ghost",get disabled(){return x()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.effect(A=>{var E=x(),$=x();return E!==A.e&&(W.disabled=A.e=E),$!==A.t&&(J.disabled=A.t=$),A},{e:void 0,t:void 0}),m}})}}),null),p}})}e.delegateEvents(["click"]);var pt=e.template("<div data-action=swarm-board.sidebarShow>"),gt=e.template("<div data-action=swarm-board.pillbarShow>"),wt=e.template("<div data-action=swarm-board.showWhenIdle>"),ft=e.template("<div data-action=swarm-board.composerPill>"),bt=e.template("<div data-action=swarm-board.bottomStrip>"),ht=e.template("<div data-action=swarm-board.withSidePanel>"),vt=e.template("<div data-action=swarm-board.toastEnabled>"),St=e.template("<div data-action=swarm-board.autoSpawnVerifier>"),xt=e.template("<div style=display:flex;gap:8px>"),yt=e.template("<div data-action=swarm-board.status>"),$t=e.template("<div data-action=swarm-board.uninstall>");function kt(t){const{SettingsLayout:l,SettingsSection:i,SettingsRow:S,Switch:w,Button:C}=t.ctx.ui;r.onMount(()=>{!t.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(t.target)}"]`)?.scrollIntoView({block:"start"})})});const x=()=>{const o=t.rpcStatus();if(o.state==="connected"){const g=t.activeSwarmCount();return`Connected to local.opencode-swarm (${g} swarm${g===1?"":"s"} recorded).`}return o.state==="unavailable"?"Server plugin (local.opencode-swarm) is not loaded for this workspace.":o.message?`RPC error: ${o.message}`:"Unable to reach local.opencode-swarm."};return e.createComponent(l,{title:"Swarm Board",get children(){return[e.createComponent(i,{title:"Surfaces",get children(){return[(()=>{var o=pt();return e.insert(o,e.createComponent(S,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent(w,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:g=>t.updateSetting("sidebarShow",g)})}})),o})(),(()=>{var o=gt();return e.insert(o,e.createComponent(S,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent(w,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:g=>t.updateSetting("pillbarShow",g)})}})),o})(),(()=>{var o=wt();return e.insert(o,e.createComponent(S,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return e.createComponent(w,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return t.settings().showWhenIdle},onChange:g=>t.updateSetting("showWhenIdle",g)})}})),o})(),(()=>{var o=ft();return e.insert(o,e.createComponent(S,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent(w,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:g=>t.updateSetting("composerPill",g)})}})),o})(),(()=>{var o=bt();return e.insert(o,e.createComponent(S,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent(w,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:g=>t.updateSetting("bottomStrip",g)})}})),o})(),(()=>{var o=ht();return e.insert(o,e.createComponent(S,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent(w,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:g=>t.updateSetting("withSidePanel",g)})}})),o})()]}}),e.createComponent(i,{title:"Notifications",get children(){var o=vt();return e.insert(o,e.createComponent(S,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent(w,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:g=>t.updateSetting("toastEnabled",g)})}})),o}}),e.createComponent(i,{title:"Verification",get children(){var o=St();return e.insert(o,e.createComponent(S,{title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish before allowing swarm completion",get children(){return e.createComponent(w,{label:"Auto-spawn verifier",hideLabel:!0,get checked(){return t.autoSpawnVerifier?.()??!0},onChange:g=>t.onToggleAutoSpawnVerifier?.(g)})}})),o}}),e.createComponent(i,{title:"Plugin Status & Actions",get children(){var o=yt();return e.insert(o,e.createComponent(S,{title:"Swarm Runtime",get description(){return x()},get children(){var g=xt();return e.insert(g,e.createComponent(C,{size:"small",variant:"ghost",get onClick(){return t.onRefresh},children:"Refresh"}),null),e.insert(g,(()=>{var D=e.memo(()=>!!t.onOpenSetupWizard);return()=>D()&&e.createComponent(C,{size:"small",variant:"ghost",get onClick(){return t.onOpenSetupWizard},children:"Setup Role Models"})})(),null),e.insert(g,e.createComponent(C,{size:"small",variant:"neutral",get onClick(){return t.onOpenPanel},children:"Open Swarm Board"}),null),g}})),o}}),e.memo(()=>e.memo(()=>!!t.onOpenUninstall)()&&e.createComponent(i,{title:"Uninstall",get children(){var o=$t();return e.insert(o,e.createComponent(S,{title:"Uninstall Swarm Plugin",description:"Review the full removal checklist and completely remove Swarm Runtime config, runtime data, worktrees, build artifacts, and temp files",get children(){return e.createComponent(C,{size:"small",variant:"ghost",get onClick(){return t.onOpenUninstall},children:"Uninstall..."})}})),o}}))]}})}var Ct=e.template("<div class=swarm-overlay-error>"),_t=e.template("<div class=swarm-uninstall-root>"),It=e.template("<div class=swarm-overlay-loading><span>Scanning config, git worktrees, runtime data, and temp files..."),zt=e.template("<div class=swarm-uninstall-section><strong>Errors</strong><ul class=swarm-uninstall-list>"),Mt=e.template("<div class=swarm-uninstall-section><strong>Final Host Reload Commands</strong><pre class=swarm-uninstall-code>"),At=e.template("<div class=swarm-uninstall-report><div><strong></strong><span> removed · <!> config(s) updated · <!> skipped · <!> error(s)</span></div><div class=swarm-uninstall-section><strong>Verification Checklist</strong><div class=swarm-uninstall-checks></div></div><div class=swarm-uninstall-footer><span>"),Et=e.template("<div><span></span><div><strong></strong><div class=swarm-uninstall-detail>"),Ee=e.template("<li>"),Rt=e.template("<div class=swarm-uninstall-plan><p class=swarm-uninstall-intro>Confirm what will be removed from this machine. Unchecked categories will be skipped; source code and backups remain untouched.</p><div class=swarm-uninstall-categories><div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong>6. Swarm GUI Settings Store</strong><span>Reset saved GUI preferences and onboarding state back to defaults.</span></div><span class=swarm-uninstall-count>1 store</span></label></div></div><div class=swarm-uninstall-preserved><strong>Preserved (Not Removed)</strong><ul></ul></div><div class=swarm-uninstall-footer>"),Lt=e.template("<ul class=swarm-uninstall-items>"),Bt=e.template("<div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong></strong><span></span></div><span class=swarm-uninstall-count>"),Pt=e.template("<div class=swarm-uninstall-empty>Nothing detected on disk"),Ut=e.template("<li><span class=swarm-uninstall-kind></span><code class=swarm-uninstall-path></code><span class=swarm-uninstall-detail>");function Ot(t){return typeof t!="number"||t<=0?"":t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:`${(t/(1024*1024)).toFixed(1)} MB`}function Dt(t){const{Button:l,Dialog:i,Loader:S}=t.ctx.ui,[w,C]=r.createSignal(!0),[x,o]=r.createSignal(!1),[g,D]=r.createSignal(null),[y,L]=r.createSignal(null),[O,n]=r.createSignal(null),[u,R]=r.createSignal(!0),[c,h]=r.createSignal({pluginRegistration:!0,gitWorktreesAndBranches:!0,runtimeData:!0,buildArtifacts:!0,tempFiles:!0}),M=_e();r.onMount(async()=>{C(!0),D(null);try{const p=await t.loadPlan();if(M())return;if(L(p),p){const m={...c()};for(const k of p.categories)m[k.id]=k.defaultChecked;h(m)}}catch(p){if(M())return;D(p instanceof Error?p.message:String(p))}finally{M()||C(!1)}});const I=r.createMemo(()=>{const p=c();return Object.values(p).filter(Boolean).length+(u()?1:0)}),V=p=>{h(m=>({...m,[p]:!m[p]}))},G=async()=>{o(!0),D(null);try{const p=await t.onExecute(c());if(M())return;u()&&t.onResetGuiStore(),n(p),p?.ok?t.ctx.toast.show({title:"Swarm plugin uninstalled",description:"Reload or restart OpenCode to finish unloading.",variant:"success"}):p&&t.ctx.toast.show({title:"Uninstall completed with warnings",description:`${p.errors.length} error(s) — check verification checklist.`,variant:"error"})}catch(p){if(M())return;D(p instanceof Error?p.message:String(p))}finally{M()||o(!1)}};return e.createComponent(i,{title:"Uninstall Swarm Plugin — Removal Checklist",size:"large",get children(){var p=_t();return e.insert(p,e.createComponent(r.Show,{get when(){return g()},get children(){var m=Ct();return e.insert(m,g),m}}),null),e.insert(p,e.createComponent(r.Show,{get when(){return!w()},get fallback(){return(()=>{var m=It(),k=m.firstChild;return e.insert(m,e.createComponent(S,{size:"normal"}),k),m})()},get children(){return e.createComponent(r.Show,{get when(){return O()===null},get fallback(){const m=()=>O();return(()=>{var k=At(),K=k.firstChild,W=K.firstChild,Q=W.nextSibling,ee=Q.firstChild,re=ee.nextSibling,J=re.nextSibling,f=J.nextSibling,A=f.nextSibling,E=A.nextSibling;E.nextSibling;var $=K.nextSibling,j=$.firstChild,v=j.nextSibling,F=$.nextSibling;return F.firstChild,e.insert(W,()=>m().ok?"All selected Swarm items removed and verified":"Uninstall completed with remaining items"),e.insert(Q,()=>m().removed.length,ee),e.insert(Q,()=>m().edited.length,re),e.insert(Q,()=>m().skipped.length,f),e.insert(Q,()=>m().errors.length,E),e.insert(v,e.createComponent(r.For,{get each(){return m().verification},children:P=>(()=>{var U=Et(),H=U.firstChild,ne=H.nextSibling,ae=ne.firstChild,Z=ae.nextSibling;return e.insert(H,()=>P.passed?"✓":"✗"),e.insert(ae,()=>P.label),e.insert(Z,()=>P.detail),e.effect(()=>e.className(U,`swarm-uninstall-check-row${P.passed?" is-pass":" is-fail"}`)),U})()})),e.insert(k,e.createComponent(r.Show,{get when(){return m().errors.length>0},get children(){var P=zt(),U=P.firstChild,H=U.nextSibling;return e.insert(H,e.createComponent(r.For,{get each(){return m().errors},children:ne=>(()=>{var ae=Ee();return e.insert(ae,ne),ae})()})),P}}),F),e.insert(k,e.createComponent(r.Show,{get when(){return m().nextSteps.length>0},get children(){var P=Mt(),U=P.firstChild,H=U.nextSibling;return e.insert(H,()=>m().nextSteps.join(`
`)),P}}),F),e.insert(F,e.createComponent(l,{variant:"contrast",onClick:()=>t.onClose(),children:"Close"}),null),e.effect(()=>e.className(K,`swarm-uninstall-banner${m().ok?" is-ok":" is-warn"}`)),k})()},get children(){return e.createComponent(r.Show,{get when(){return y()},children:m=>(()=>{var k=Rt(),K=k.firstChild,W=K.nextSibling,Q=W.firstChild,ee=Q.firstChild,re=ee.firstChild,J=W.nextSibling,f=J.firstChild,A=f.nextSibling,E=J.nextSibling;return e.insert(W,e.createComponent(r.For,{get each(){return m().categories},children:$=>{const j=()=>c()[$.id];return(()=>{var v=Bt(),F=v.firstChild,P=F.firstChild,U=P.nextSibling,H=U.firstChild,ne=H.nextSibling,ae=U.nextSibling;return P.addEventListener("change",()=>V($.id)),e.insert(H,()=>$.title),e.insert(ne,()=>$.description),e.insert(ae,(()=>{var Z=e.memo(()=>$.items.length===0);return()=>Z()?"Clean":`${$.items.length} item${$.items.length===1?"":"s"}`})()),e.insert(v,e.createComponent(r.Show,{get when(){return $.items.length>0},get fallback(){return Pt()},get children(){var Z=Lt();return e.insert(Z,e.createComponent(r.For,{get each(){return $.items},children:te=>(()=>{var N=Ut(),q=N.firstChild,ce=q.nextSibling,z=ce.nextSibling;return e.insert(q,()=>te.kind),e.insert(ce,()=>te.path),e.insert(z,()=>te.detail,null),e.insert(z,(()=>{var B=e.memo(()=>!!te.sizeBytes);return()=>B()?` (${Ot(te.sizeBytes)})`:""})(),null),N})()})),Z}}),null),e.effect(Z=>{var te=`swarm-uninstall-card${j()?" is-checked":""}`,N=x();return te!==Z.e&&e.className(v,Z.e=te),N!==Z.t&&(P.disabled=Z.t=N),Z},{e:void 0,t:void 0}),e.effect(()=>P.checked=j()),v})()}}),Q),re.addEventListener("change",()=>R($=>!$)),e.insert(A,e.createComponent(r.For,{get each(){return m().preserved},children:$=>(()=>{var j=Ee();return e.insert(j,$),j})()})),e.insert(E,e.createComponent(l,{variant:"ghost",get disabled(){return x()},onClick:()=>t.onClose(),children:"Cancel"}),null),e.insert(E,e.createComponent(l,{variant:"contrast",get disabled(){return x()||I()===0},onClick:()=>{G()},get children(){return x()?"Removing...":"Confirm & Remove Selected Items"}}),null),e.effect($=>{var j=`swarm-uninstall-card${u()?" is-checked":""}`,v=x();return j!==$.e&&e.className(Q,$.e=j),v!==$.t&&(re.disabled=$.t=v),$},{e:void 0,t:void 0}),e.effect(()=>re.checked=u()),k})()})}})}}),null),p}})}const Ce="swarm-board",Re=we.Schema.Struct({sidebarShow:we.Schema.Boolean,pillbarShow:we.Schema.Boolean,showWhenIdle:we.Schema.Boolean,composerPill:we.Schema.Boolean,bottomStrip:we.Schema.Boolean,withSidePanel:we.Schema.Boolean,toastEnabled:we.Schema.Boolean,onboardingComplete:we.Schema.Boolean}),$e={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0,onboardingComplete:!1};function Vt(t,l,i){return t!==l?!1:(i(),!0)}function ke(t){if(!t)return"";const l=t.posts.length>0?String(t.posts[t.posts.length-1]?.id??""):"",i=t.members.map(S=>`${S.handle}:${S.state}:${S.trackStatus??""}`).join("|");return[t.swarmId,t.status,t.boardUrl??"",t.stalled?"1":"0",t.verifierStatus??"",String(t.posts.length),l,i].join("\0")}function Ft(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(i=>({id:String(i.id??""),title:String(i.title??i.id??"Swarm"),status:String(i.status??"running"),activeCount:typeof i.activeCount=="number"?i.activeCount:void 0,waitingCount:typeof i.waitingCount=="number"?i.waitingCount:void 0,postCount:typeof i.postCount=="number"?i.postCount:typeof i.post_count=="number"?i.post_count:void 0,updatedAt:i.updatedAt??(typeof i.updated_at=="number"?new Date(i.updated_at).toISOString():void 0)}))}function jt(t){if(!t||typeof t!="object")return null;const l=t;if(typeof l.swarmId=="string"&&Array.isArray(l.posts))return l;const i=l.swarm;if(!i||typeof i!="object")return null;const S=Array.isArray(l.members)?l.members:[],w=Array.isArray(l.board_posts)?l.board_posts:Array.isArray(l.posts)?l.posts:[],C=Array.isArray(l.file_locks)?l.file_locks:Array.isArray(l.locks)?l.locks:[],x=S.map(n=>({handle:String(n.handle??n.name??""),role:typeof n.role=="string"?n.role:void 0,state:String(n.state??"waiting"),model:typeof n.model=="string"?n.model:void 0,variant:typeof n.variant=="string"?n.variant:void 0,trackStatus:typeof n.track_status=="string"?n.track_status:n.trackStatus,ownedGlobs:Array.isArray(n.owned_globs)?n.owned_globs:Array.isArray(n.ownedGlobs)?n.ownedGlobs:[],sessionId:typeof n.session_id=="string"?n.session_id:n.sessionId,session_id:typeof n.session_id=="string"?n.session_id:n.sessionId})),o=w.map(n=>({id:n.seq??n.id??0,seq:typeof n.seq=="number"?n.seq:void 0,author:String(n.author??""),body:String(n.body??""),createdAt:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.createdAt,created_at:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.created_at,mentions:Array.isArray(n.mentions)?n.mentions:[]})),g=C.map(n=>({glob:String(n.glob_pattern??n.glob??""),owner:String(n.owner_handle??n.owner??""),acquiredAt:typeof n.claimed_at=="number"?new Date(n.claimed_at).toISOString():n.acquiredAt})),D=S.some(n=>!!n.paused_quota),y=[...o].reverse().find(n=>n.author.replace(/^@/,"").toLowerCase()==="verifier"),L=y?/\bFAIL\b/i.test(y.body)?"FAIL":/\bPASS\b/i.test(y.body)?"PASS":void 0:void 0,O=[];for(const n of o)if(n.mentions&&n.mentions.length>0)for(const u of n.mentions)O.push({from:n.author,to:u.startsWith("@")?u:`@${u}`,summary:n.body.slice(0,80),at:n.createdAt});return{swarmId:String(i.id??""),title:String(i.title??i.id??"Swarm"),status:String(i.status??"running"),boardUrl:typeof l.boardUrl=="string"?l.boardUrl:void 0,pausedQuota:D,paused_quota:D,stalled:!!l.stalled,verifierStatus:L,members:x,posts:o,locks:g,handoffs:O}}var Nt=e.template("<span>"),Wt=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),qt=e.template("<div style=padding:12px>Loading Swarm Board...");const Tt=r.lazy(()=>Promise.resolve().then(()=>nr)),Gt=[{id:Ce,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"},{id:"swarm-board.autoSpawnVerifier",title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish",keywords:"swarm verifier auto spawn gate verification"},{id:"swarm-board.status",title:"Setup Role Models",description:"Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",keywords:"swarm models onboarding wizard setup"},{id:"swarm-board.uninstall",title:"Uninstall Swarm Plugin",description:"Review removal checklist and completely uninstall Swarm Runtime",keywords:"swarm uninstall remove cleanup reset"}],Kt=`
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`,Qt=se.Plugin.define({stores:{settings:se.Store.global(Re,$e)},setup(t){const l=t.stores?.settings??t.storage.store("swarm.settings",{schema:Re,initial:$e}),i=()=>l.value??$e,S=(a,s)=>{l.set({...i(),[a]:s})},w=(a,s)=>{try{return t.add(a,s)}catch(d){return console.warn("[opencode-swarm] OpenCode did not accept a GUI item:",d),()=>{}}};w(se.Style,Pe);const[C,x]=r.createSignal([]),[o,g]=r.createSignal(null),[D,y]=r.createSignal(null),[L,O]=r.createSignal(null),[n,u]=r.createSignal(null),[R,c]=r.createSignal(""),[h,M]=r.createSignal(void 0),[I,V]=r.createSignal({state:"connected"}),[G,p]=r.createSignal(!0);let m=!1,k="",K=!1,W="",Q=null,ee=0,re=null,J=ke(null);const f=new Map,A=()=>t.sessions.current()?.id??null,E=()=>n()!==null,$=()=>t.sessions.current()?.location?.directory??h(),j=(a,s)=>{a&&f.set(a,s||"*");const d=t.sessions.current();if(d)try{t.layout.hide(`${t.id}:swarm`,d)}catch{}u(null),O(null),J=ke(null),g(null),y(null),c("")},v=()=>t.client.rpc(ze),F=(a=8e3)=>{const s=t.sessions.current()?.location??(h()?{directory:h()}:void 0),d=AbortSignal.timeout(a);return s?{location:s,signal:d}:{signal:d}},P=a=>{if(!i().toastEnabled)return;const s=!!(a.pausedQuota??a.paused_quota);s&&!m&&t.toast.show({title:"Swarm paused on quota",description:a.title||a.swarmId,variant:"error"}),m=s;const d=(a.verifierStatus??"").toUpperCase();(d==="PASS"||d==="FAIL")&&d!==k&&t.toast.show({title:`@verifier ${d}`,description:a.title||a.swarmId,variant:d==="PASS"?"success":"error"}),k=d;const b=[...a.posts].reverse().find(_=>_.author.replace(/^@/,"").toLowerCase()==="monitor");a.stalled&&!K?t.toast.show({title:"@monitor stall nudge",description:b?.body??"Swarm appears stalled"}):b&&b.id!==Q&&Q!==null&&t.toast.show({title:"@monitor stall nudge",description:b.body}),K=!!a.stalled,b&&(Q=b.id),a.status==="completed"&&W!==a.swarmId&&(W=a.swarmId,t.toast.show({title:"Swarm completed",description:a.title||a.swarmId,variant:"success"}))},U=async()=>{const a=++ee;try{const s=v(),d=F(),b=await s.listSwarms({},d);if(a!==ee)return;const _=Ft(b);x(_);const oe=o();oe&&!_.some(ve=>ve.id===oe)&&(g(null),y(null));const X=A(),de=X?D():null,he=!!X&&!de,pe=await s.getSwarmSnapshot(de?{swarmId:de}:X?{sessionId:X}:{},d);if(a!==ee)return;pe&&typeof pe=="object"&&typeof pe.boardUrl=="string"&&pe.boardUrl&&c(pe.boardUrl);const T=jt(pe),me=X?f.get(X):void 0;if(he&&T&&me&&(me==="*"||me===T.swarmId)&&T.status!=="running")return;const ye=ke(T);ye!==J&&(J=ye,O(T)),he&&T&&(X&&me&&f.delete(X),u(T.swarmId)),I().state!=="connected"&&(V({state:"connected"}),Z()),s.getRoleConfig(de?{swarmId:de}:X?{sessionId:X}:{},d).then(ve=>{Vt(a,ee,()=>{const Ie=ve&&typeof ve=="object"&&"output"in ve?ve.output:ve;typeof Ie?.autoSpawnVerifier=="boolean"&&p(Ie.autoSpawnVerifier)})}).catch(()=>{}),T&&P(T)}catch(s){if(a!==ee)return;const b=typeof s=="object"&&s!==null&&"type"in s&&s.type==="rpc.unavailable"?{state:"unavailable"}:{state:"error",message:s instanceof Error?s.message:String(s)},_=I();_.state===b.state&&(b.state!=="error"||_.message===b.message)||V(b)}};r.createEffect(()=>{$();const a=A();t.sessions.current()?.pending,o(),a!==re&&(re=a,y(null),g(null),O(null),J=ke(null),u(null),c(""),x([])),U()});let H=null,ne;const ae=()=>{if(H!==t.client){ne?.abort(),H=t.client,ne=new AbortController;try{t.client.rpc(ze).events.on("changed",a=>{if(a&&typeof a=="object"&&a.reason==="session_exited"){const s=a.handle,d=a.swarmId,b=A();if(!s||s===b){j(b,d);return}}U()},{signal:ne.signal})}catch{}}};function Z(){try{ne?.abort(),H=null,ae()}catch{}}ae(),r.createEffect(()=>{try{const a=t.servers;if(!a)return;const d=a.list().map(_=>a.get(_)).find(_=>_?.builtin)?.data;if(!d||typeof d.on!="function")return;const b=d.on("session.tool.success",()=>{U()});r.onCleanup(()=>b())}catch{}});const te=setInterval(()=>{ae(),U()},2e3);r.onCleanup(()=>{ne?.abort(),clearInterval(te)});const N=r.createMemo(()=>{const a=L();if(!a)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let s=0,d=0;for(const b of a.members){const _=b.state.toLowerCase();_==="working"||_==="active"?s++:(_==="waiting"||_==="idle")&&d++}return{active:s,waiting:d,posts:a.posts.length,paused:!!(a.pausedQuota??a.paused_quota),stalled:!!a.stalled}}),q=(a=!1)=>{if(!i().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const s=t.sessions.current();if(!s){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const d=`${t.id}:swarm`;if(a&&t.layout.state(d,s)==="visible"){t.layout.hide(d,s);return}t.layout.open(d,s)},ce=()=>{t.layout.settings(Ce)},z=r.createMemo(()=>{const a=L(),s=N();return!!(a&&(s.active>0||a.status==="running"&&a.members.some(d=>d.state.toLowerCase()==="working")))});w(se.Style,()=>z()?Kt:void 0);const B=()=>{t.dialogs.open(a=>e.createComponent(ut,{ctx:t,loadRoleConfig:async()=>{const s=o(),d=t.sessions.current()?.id;return await v().getRoleConfig(s?{swarmId:s}:d?{sessionId:d}:{},F())},onApplyModels:async s=>{const d=[],b=o(),_=t.sessions.current()?.id;for(const oe of["coordinator","worker","verifier","monitor"]){const X=s[oe];if(!X)continue;const de=await v().setRoleModel({role:oe,model:X,...b?{swarmId:b}:{},..._?{sessionId:_}:{}},F());de?.ok||d.push(`${oe}: ${de?.error??"failed"}`)}return U(),{ok:d.length===0,errors:d}},onComplete:()=>{S("onboardingComplete",!0),a.close()},onSkip:()=>{S("onboardingComplete",!0),a.close()}}))},Y=async()=>{const a=A(),s=n()??L()?.swarmId??"";try{await v().completeSwarm({swarmId:s,exitSession:!0,...a?{sessionId:a}:{},summary:"Exited Swarm mode"},F())}catch{}j(a,s),t.toast.show({title:"Exited Swarm mode",description:"Swarm UI removed for this session. Back to the original composer."})},le=()=>{t.dialogs.open(a=>e.createComponent(ot,{ctx:t,snapshot:L,counts:N,isBuzzing:z,loadRoleConfig:async()=>{const s=o(),d=t.sessions.current()?.id;return await v().getRoleConfig(s?{swarmId:s}:d?{sessionId:d}:{},F())},onSetRoleModel:async(s,d)=>{const b=o(),_=t.sessions.current()?.id,oe=await v().setRoleModel({role:s,model:d,...b?{swarmId:b}:{},..._?{sessionId:_}:{}},F());return U(),oe},onOpenBoard:()=>q(!1),onOpenSetupWizard:()=>{a.close(),B()},onExitSwarmMode:Y,onClose:()=>a.close()}))},fe=()=>{t.dialogs.open(a=>e.createComponent(Dt,{ctx:t,loadPlan:async()=>await v().previewUninstall({},F(3e4)),onExecute:async s=>await v().executeUninstall({categories:s},F(12e4)),onResetGuiStore:()=>{l.set($e)},onClose:()=>a.close()}))};w(se.SettingsPage,()=>({id:Ce,title:"Swarm Board",icon:"dot-grid",entries:Gt,render:({target:a})=>e.createComponent(kt,{ctx:t,settings:i,updateSetting:S,rpcStatus:I,activeSwarmCount:()=>C().length,autoSpawnVerifier:G,onToggleAutoSpawnVerifier:async s=>{const d=G();p(s);try{const b=await v().setAutoSpawnVerifier({enabled:s},F()),_=b&&typeof b=="object"&&"output"in b?b.output:b;typeof _?.autoSpawnVerifier=="boolean"&&p(_.autoSpawnVerifier)}catch(b){p(d),t.toast.show({title:"Failed to update Auto-spawn verifier",description:b instanceof Error?b.message:String(b),variant:"error"})}},onOpenPanel:()=>q(!1),onOpenSetupWizard:B,onOpenUninstall:fe,onRefresh:()=>{U()},target:a})})),w(se.TitlebarItem,()=>{if(!E()||!i().pillbarShow)return;const a=L(),s=t.sessions.current(),d=s?t.layout.state(`${t.id}:swarm`,s)==="visible":!1,b=N(),_=b.paused||b.stalled?" ⚠":"";return{id:"swarm-open",label:z()?`🐝 Swarm: Buzzing (${b.active} active · ${b.posts} posts)${_}`:a?`🐝 Swarm: Dozing (${b.posts} posts)${_}`:"🐝 Swarm: Dozing",title:b.paused?"Swarm paused on quota — click to open Swarm Board":b.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:d,run:()=>q(!0)}}),w(se.ComposerPill,{id:"swarm-composer-pill",show(a){if(a.session.directory&&M(a.session.directory),!E()||!i().composerPill)return;const s=L(),d=N(),b=(s?.verifierStatus??"").toUpperCase();let _;return d.paused||b==="FAIL"?_="danger":d.stalled&&(_="warning"),{label:z()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",..._?{tone:_}:{},title:"Click to configure Swarm role models or open Board",run:()=>le()}}}),w(se.Slot,{at:"window.bottom",render:()=>{const a=()=>{if(!E()||!i().bottomStrip)return!1;const s=t.sessions.current();return!(s?t.layout.state(`${t.id}:swarm`,s)==="visible":!1)||i().withSidePanel};return e.createComponent(r.Show,{get when(){return a()},get children(){var s=Wt(),d=s.firstChild,b=d.firstChild,_=b.nextSibling,oe=_.nextSibling,X=oe.nextSibling,de=X.nextSibling,he=de.nextSibling,pe=he.nextSibling,T=pe.nextSibling;return T.nextSibling,s.$$click=()=>q(!0),e.insert(d,()=>L()?.title??"Idle",_),e.insert(d,()=>N().active,X),e.insert(d,()=>N().waiting,he),e.insert(d,()=>N().posts,T),e.insert(s,e.createComponent(r.Show,{get when(){return N().paused||N().stalled},get children(){var me=Nt();return e.insert(me,()=>N().paused?"Paused on quota":"Stalled"),me}}),null),s}})}}),w(se.MenuItem,()=>{if(!E())return;const a=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:a?t.layout.state(`${t.id}:swarm`,a)!=="closed":!1,run:()=>q(!1)}}),w(se.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>q(!1)})),w(se.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>ce()})),w(se.Command,()=>({id:"setup-models",title:"Swarm Model Setup Wizard",description:"Choose recommended or manual models for Swarm roles",group:"Swarm",section:"model",run:()=>B()})),w(se.Command,()=>({id:"exit-session",title:"Exit Swarm Mode (Current Session)",description:"Stop active swarm and remove all Swarm UI from the current session",group:"Swarm",section:"general",run:()=>{Y()}})),w(se.Command,()=>({id:"uninstall",title:"Uninstall Swarm Plugin",description:"Open the Swarm removal checklist and completely uninstall Swarm Runtime",group:"Swarm",section:"general",run:()=>fe()}));const be={id:"swarm",title:"Swarm",pinned:!1};w(se.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return E()&&i().sidebarShow?[be]:[]},render(a){return a.session.directory&&M(a.session.directory),e.createComponent(r.Suspense,{get fallback(){return qt()},get children(){return e.createComponent(Tt,{ctx:t,snapshot:L,boardUrl:R,swarms:C,selectedSwarmId:o,sessionId:()=>a.session.id,onSelectSwarm:s=>{y(s),g(s)},onRefresh:()=>{U()},onOpenSettings:ce,rpcError:()=>{const s=I();if(s.state==="unavailable")return"Server plugin (local.opencode-swarm) is not loaded for this workspace.";if(s.state==="error")return s.message},onCompleteSwarm:async s=>{await v().completeSwarm({swarmId:s},F()),await U()},onExitSwarmMode:Y,get server(){return a.session.server}})}})}})}});e.delegateEvents(["click"]);var Ht=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),Zt=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Stop all active workers, release file locks, restore the original composer, and remove all Swarm UI from this session?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),Jt=e.template("<option>"),Yt=e.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),Xt=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),er=e.template("<option> (<!>)"),tr=e.template("<div class=swarm-gui-empty>");function rr(t){const{Button:l,Dialog:i}=t.ctx.ui,[S,w]=r.createSignal(0);let C;const x=r.createMemo(()=>t.snapshot()?.boardUrl||t.boardUrl?.()||""),o=r.createMemo(()=>t.selectedSwarmId()??t.snapshot()?.swarmId??""),g=r.createMemo(()=>{const n=x();if(!n)return"";const u=o(),R=t.sessionId?.()??"",c=S();try{const h=new URL(n);return u&&h.searchParams.set("swarmId",u),R&&h.searchParams.set("conversationId",R),c>0&&h.searchParams.set("_r",String(c)),h.toString()}catch{return n}}),D=r.createMemo(()=>{const n=g();if(!n)return"";try{return new URL(n).origin}catch{return""}}),y=()=>{const n=C?.contentWindow,u=D();if(!n||!u)return;const R=t.ctx.appearance.mode(),c=typeof document<"u"?getComputedStyle(document.documentElement):null,h=V=>c?.getPropertyValue(V).trim()||"",M={},I=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[V,G]of I){const p=h(G);p&&(M[V]=p)}n.postMessage({type:"swarm:theme",mode:R,tokens:M},u)};if(r.createEffect(()=>{t.ctx.appearance.mode(),y()}),typeof window<"u"){const n=u=>{if(u.source!==C?.contentWindow)return;const R=D();if(R&&u.origin!==R)return;const c=u.data;if(c?.type==="swarm:open_session"&&typeof c.sessionID=="string"&&c.sessionID){const h=t.server,M=typeof h=="string"?h:h?.id??t.ctx.sessions.current()?.server.id;if(!M){t.ctx.toast.show({title:"No server context for member session"});return}t.ctx.tabs.open({server:M,id:c.sessionID},{focus:!0})}};window.addEventListener("message",n),r.onCleanup(()=>window.removeEventListener("message",n))}const L=()=>{const n=t.snapshot();n&&t.ctx.dialogs.open(u=>e.createComponent(i,{title:"Complete Swarm?",get children(){var R=Ht(),c=R.firstChild,h=c.firstChild,M=h.nextSibling,I=c.nextSibling;return e.insert(M,()=>n.title||n.swarmId),e.insert(I,e.createComponent(l,{variant:"ghost",onClick:()=>u.close(),children:"Cancel"}),null),e.insert(I,e.createComponent(l,{variant:"danger",onClick:async()=>{try{await t.onCompleteSwarm(n.swarmId),u.close()}catch(V){t.ctx.toast.show({title:"Failed to complete swarm",description:V instanceof Error?V.message:String(V),variant:"error"})}},children:"Complete Swarm"}),null),R}}))},O=()=>{if(t.onExitSwarmMode){if(t.snapshot()?.status!=="running"){t.onExitSwarmMode();return}t.ctx.dialogs.open(n=>e.createComponent(i,{title:"Stop & Exit Swarm Mode?",get children(){var u=Zt(),R=u.firstChild,c=R.nextSibling;return e.insert(c,e.createComponent(l,{variant:"ghost",onClick:()=>n.close(),children:"Cancel"}),null),e.insert(c,e.createComponent(l,{variant:"danger",onClick:async()=>{try{await t.onExitSwarmMode?.(),n.close()}catch(h){t.ctx.toast.show({title:"Failed to exit Swarm mode",description:h instanceof Error?h.message:String(h),variant:"error"})}},children:"Stop & Exit"}),null),u}}))}};return(()=>{var n=Xt(),u=n.firstChild,R=u.firstChild;return R.addEventListener("change",c=>t.onSelectSwarm(c.currentTarget.value)),e.insert(R,e.createComponent(r.Show,{get when(){return t.swarms().length===0},get children(){var c=Jt();return e.insert(c,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>c.value=t.snapshot()?.swarmId??""),c}}),null),e.insert(R,e.createComponent(r.For,{get each(){return t.swarms()},children:c=>(()=>{var h=er(),M=h.firstChild,I=M.nextSibling;return I.nextSibling,e.insert(h,()=>c.title||c.id,M),e.insert(h,()=>c.status,I),e.effect(()=>h.value=c.id),h})()}),null),e.insert(u,e.createComponent(l,{size:"small",variant:"ghost",onClick:()=>{t.onRefresh(),w(c=>c+1)},children:"Refresh"}),null),e.insert(u,e.createComponent(r.Show,{get when(){return t.snapshot()?.status==="running"},get children(){return e.createComponent(l,{size:"small",variant:"neutral",onClick:L,children:"Complete"})}}),null),e.insert(u,e.createComponent(r.Show,{get when(){return t.onExitSwarmMode},get children(){return e.createComponent(l,{size:"small",variant:"danger",onClick:O,children:"Exit Swarm"})}}),null),e.insert(u,e.createComponent(r.Show,{get when(){return t.onOpenSettings},get children(){return e.createComponent(l,{size:"small",variant:"ghost",onClick:()=>t.onOpenSettings?.(),children:"Settings"})}}),null),e.insert(n,e.createComponent(r.Show,{get when(){return g()},get fallback(){return(()=>{var c=tr();return e.insert(c,()=>t.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),c})()},get children(){var c=Yt();return c.addEventListener("load",()=>y()),e.use(h=>{C=h},c),e.effect(()=>e.setAttribute(c,"src",g())),c}}),null),e.effect(()=>R.value=o()),n})()}const nr=Object.freeze(Object.defineProperty({__proto__:null,default:rr},Symbol.toStringTag,{value:"Module"}));exports.default=Qt;
