"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const e=require("solid-js/web"),ae=require("@opencode/plugin/gui"),r=require("solid-js"),me=require("effect");function oe(t){return typeof t=="object"&&t!==null&&!Array.isArray(t)}function ce(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(l){const o=t(l);return o?{issues:[{message:o}]}:{value:l}}}}}function ue(t){return{"~standard":{version:1,vendor:"opencode-swarm",validate(l){const o=l===void 0?{}:l;if(!oe(o))return{issues:[{message:"input must be an object"}]};const b=t(o);return b?{issues:[{message:b}]}:{value:o}}}}}const ke={id:"local.opencode-swarm",methods:{getBoardInfo:{input:ue(()=>null),output:ce(t=>oe(t)&&typeof t.url=="string"&&typeof t.swarmId=="string"?null:"output must be SwarmBoardInfo")},getSwarmSnapshot:{input:ue(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ce(t=>oe(t)&&Array.isArray(t.members)&&Array.isArray(t.board_posts)&&Array.isArray(t.file_locks)?null:"output must be SwarmSnapshot")},listSwarms:{input:ue(t=>t.limit!==void 0&&typeof t.limit!="number"?"limit must be a number":null),output:ce(t=>oe(t)&&Array.isArray(t.swarms)?null:"output must contain swarms array")},completeSwarm:{input:ue(t=>typeof t.swarmId!="string"?"swarmId must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ce(t=>oe(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},killMember:{input:ue(t=>typeof t.swarmId!="string"?"swarmId must be a string":typeof t.handle!="string"?"handle must be a string":t.callerSessionId!==void 0&&typeof t.callerSessionId!="string"?"callerSessionId must be a string":null),output:ce(t=>oe(t)&&typeof t.ok=="boolean"?null:"output must contain ok boolean")},getRoleConfig:{input:ue(t=>t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":null),output:ce(t=>oe(t)&&oe(t.roleModels)&&Array.isArray(t.models)?null:"output must be SwarmRoleConfig")},setRoleModel:{input:ue(t=>typeof t.role!="string"?"role must be a string":typeof t.model!="string"?"model must be a string":t.swarmId!==void 0&&typeof t.swarmId!="string"?"swarmId must be a string":t.sessionId!==void 0&&typeof t.sessionId!="string"?"sessionId must be a string":null),output:ce(t=>oe(t)&&typeof t.ok=="boolean"?null:"output must be SetRoleModelResult")},setAutoSpawnVerifier:{input:ue(t=>typeof t.enabled=="boolean"?null:"enabled must be a boolean"),output:ce(t=>oe(t)&&typeof t.ok=="boolean"&&typeof t.autoSpawnVerifier=="boolean"?null:"output must contain ok and autoSpawnVerifier booleans")},previewUninstall:{input:ue(()=>null),output:ce(t=>oe(t)&&Array.isArray(t.categories)&&Array.isArray(t.preserved)?null:"output must be UninstallPlan")},executeUninstall:{input:ue(t=>t.categories!==void 0&&!oe(t.categories)?"categories must be an object":null),output:ce(t=>oe(t)&&typeof t.ok=="boolean"&&Array.isArray(t.verification)?null:"output must be UninstallResult")}},events:{changed:{schema:ce(t=>oe(t)&&typeof t.swarmId=="string"&&typeof t.reason=="string"?null:"event must contain swarmId and reason")}}},Re=`
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
`,fe={coordinator:{role:"coordinator",title:"Coordinator",subtitle:"@coordinator — leads planning, spawning & board coordination",displayLabel:"Muse Spark 1.3 · xhigh",patterns:[/^muse-spark-1\.3/i,/muse[\s._-]*spark[\s._-]*1\.3/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"xhigh",fallbackSpec:"opencode-go/muse-spark-1.3-contributor#xhigh"},worker:{role:"worker",title:"Worker",subtitle:"@worker — executes tasks (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · high",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"high",fallbackSpec:"opencode-go/deepseek-v4.1-flash#high"},verifier:{role:"verifier",title:"Verifier",subtitle:"@verifier — independent verification gate (changing mid-swarm stops, switches & reruns)",displayLabel:"DeepSeek V4.1 Flash · max",patterns:[/^deepseek-v4\.1-flash$/i,/deepseek[\s._-]*v?4\.1[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:"max",fallbackSpec:"opencode-go/deepseek-v4.1-flash#max"},monitor:{role:"monitor",title:"Monitor",subtitle:"@monitor — watches stalls and nudges blocked threads",displayLabel:"GLM 5.3 Flash · default",patterns:[/^glm-5\.3-flash$/i,/glm[\s._-]*5\.3[\s._-]*flash/i],preferredProviders:["opencode-go","opencode"],preferredVariant:void 0,fallbackSpec:"opencode-go/glm-5.3-flash"}};function Ce(t,l){const o={};for(const b of["coordinator","worker","verifier","monitor"]){const p=fe[b];let I;for(const v of p.preferredProviders)if(I=t.find(a=>a.providerID.toLowerCase()===v.toLowerCase()&&p.patterns.some(m=>m.test(a.id)||(a.name?m.test(a.name):!1))),I)break;if(I||(I=t.find(v=>p.patterns.some(a=>a.test(v.id)||(v.name?a.test(v.name):!1)))),I){const v=`${I.providerID}/${I.id}`;if(p.preferredVariant){const a=(I.variants??[]).find(m=>m.toLowerCase()===p.preferredVariant.toLowerCase());o[b]=a?`${v}#${a}`:v}else o[b]=v}else{const v=l?.[b];o[b]=v&&v.trim()?v.trim():p.fallbackSpec}}return o}function Ae(t,l,o){const b=[],p=new Set;for(const a of t){const m=`${a.providerID}/${a.id}`;p.has(m)||(p.add(m),b.push({spec:m,label:a.name?`${m} (${a.name})`:m}));for(const D of a.variants??[]){const $=`${m}#${D}`;p.has($)||(p.add($),b.push({spec:$,label:$}))}}if(l&&!p.has(l)&&(p.add(l),b.push({spec:l,label:l})),o&&!p.has(o)&&(p.add(o),b.push({spec:o,label:o})),b.sort((a,m)=>a.label.localeCompare(m.label,void 0,{sensitivity:"base",numeric:!0})),!o)return b;let I;const v=[];for(const a of b)a.spec===o?I={...a,isRecommended:!0}:v.push(a);return I?[I,...v]:v}var Le=e.template('<div role=listbox><div class=swarm-model-select-search-wrap><input type=search class=swarm-model-select-search placeholder="Search models..."></div><div class=swarm-model-select-list>'),Ee=e.template("<div class=swarm-model-select><button type=button class=swarm-model-select-trigger aria-haspopup=listbox><span class=swarm-model-select-value></span><span class=swarm-model-select-caret aria-hidden=true>▾"),Pe=e.template("<div class=swarm-model-select-empty>No matching models"),Be=e.template("<span class=swarm-model-select-badge>Recommended"),Oe=e.template("<span class=swarm-model-select-check aria-hidden=true>✓"),Ue=e.template("<button type=button role=option><span class=swarm-model-select-item-label></span><span class=swarm-model-select-item-right>");function Me(t){const[l,o]=r.createSignal(!1),[b,p]=r.createSignal("");let I,v;const a=r.createMemo(()=>{const $=b().trim().toLowerCase();if(!$)return t.options;const E=$.split(/\s+/).filter(Boolean);return t.options.filter(h=>{const n=`${h.label} ${h.spec}`.toLowerCase();return E.every(g=>n.includes(g))})}),m=r.createMemo(()=>{const $=t.value;if(!$)return t.placeholder??"Select model...";const E=t.options.find(h=>h.spec===$);return E?E.label:$});r.createEffect(()=>{if(!l())return;p(""),queueMicrotask(()=>{v?.focus()});const $=h=>{I&&!I.contains(h.target)&&o(!1)},E=h=>{h.key==="Escape"&&(h.stopPropagation(),o(!1))};document.addEventListener("mousedown",$),document.addEventListener("keydown",E,!0),r.onCleanup(()=>{document.removeEventListener("mousedown",$),document.removeEventListener("keydown",E,!0)})});const D=$=>{o(!1),p(""),$!==t.value&&t.onChange($)};return(()=>{var $=Ee(),E=$.firstChild,h=E.firstChild,n=I;return typeof n=="function"?e.use(n,$):I=$,E.$$click=()=>{t.disabled||o(g=>!g)},e.insert(h,m),e.insert($,e.createComponent(r.Show,{get when(){return l()},get children(){var g=Le(),S=g.firstChild,k=S.firstChild,R=S.nextSibling;k.$$keydown=z=>{if(z.key==="Enter"){if(z.preventDefault(),b().trim().length>0){const W=a()[0];W&&D(W.spec)}}else z.key==="Escape"&&(z.preventDefault(),z.stopPropagation(),o(!1))},k.$$input=z=>p(z.currentTarget.value);var F=v;return typeof F=="function"?e.use(F,k):v=k,e.insert(R,e.createComponent(r.Show,{get when(){return a().length>0},get fallback(){return Pe()},get children(){return e.createComponent(r.For,{get each(){return a()},children:z=>{const W=()=>z.spec===t.value;return(()=>{var G=Ue(),u=G.firstChild,d=u.nextSibling;return G.$$click=()=>D(z.spec),e.insert(u,()=>z.label),e.insert(d,e.createComponent(r.Show,{get when(){return z.isRecommended},get children(){return Be()}}),null),e.insert(d,e.createComponent(r.Show,{get when(){return W()},get children(){return Oe()}}),null),e.effect(_=>{var Q=W(),q=`swarm-model-select-item${W()?" is-selected":""}`;return Q!==_.e&&e.setAttribute(G,"aria-selected",_.e=Q),q!==_.t&&e.className(G,_.t=q),_},{e:void 0,t:void 0}),G})()}})}})),e.effect(z=>{var W=`swarm-model-select-menu${t.menuUpward?" swarm-model-select-menu-upward":""}`,G=`${t.ariaLabel} options`;return W!==z.e&&e.className(g,z.e=W),G!==z.t&&e.setAttribute(g,"aria-label",z.t=G),z},{e:void 0,t:void 0}),e.effect(()=>k.value=b()),g}}),null),e.effect(g=>{var S=t.disabled,k=t.ariaLabel,R=l();return S!==g.e&&(E.disabled=g.e=S),k!==g.t&&e.setAttribute(E,"aria-label",g.t=k),R!==g.a&&e.setAttribute(E,"aria-expanded",g.a=R),g},{e:void 0,t:void 0,a:void 0}),$})()}e.delegateEvents(["click","input","keydown"]);function ye(){let t=!1;return r.onCleanup(()=>{t=!0}),()=>t}var De=e.template('<span class="swarm-overlay-stat is-danger">Quota paused'),Ve=e.template('<span class="swarm-overlay-stat is-warn">Stalled'),Fe=e.template('<div class=swarm-overlay-roster aria-label="Active swarm members">'),je=e.template("<div class=swarm-overlay-error>"),Ne=e.template("<div class=swarm-overlay-roles>"),We=e.template("<span> role change<!> ready"),qe=e.template("<div class=swarm-overlay-root><div><div class=swarm-overlay-status><span><span class=swarm-overlay-dot aria-hidden=true></span></span><div class=swarm-overlay-meta><strong></strong><div class=swarm-overlay-stats><span class=swarm-overlay-stat> active</span><span class=swarm-overlay-stat> waiting</span><span class=swarm-overlay-stat> posts</span></div></div></div><div class=swarm-overlay-actions></div></div><div class=swarm-overlay-footer><div class=swarm-overlay-footer-note></div><div class=swarm-overlay-footer-actions>"),Te=e.template("<span class=swarm-overlay-member-model>"),Ge=e.template("<span><span class=swarm-overlay-member-dot aria-hidden=true></span><span class=swarm-overlay-member-handle>@"),Ke=e.template("<div class=swarm-overlay-loading><span>Loading role models..."),Qe=e.template("<span class=swarm-overlay-dirty-pill>Modified"),He=e.template("<span>"),Ze=e.template("<span class=swarm-overlay-role-warn>Applying will interrupt & rerun <!> working "),Je=e.template("<div><div class=swarm-overlay-role-info><div class=swarm-overlay-role-head><span class=swarm-overlay-role-title><span aria-hidden=true></span><strong></strong></span><div class=swarm-overlay-role-badges></div></div><span class=swarm-overlay-role-sub></span></div><div class=swarm-overlay-select-wrap>"),Ye=e.template("<span>No pending model changes — running members are untouched.");const _e=[{role:"coordinator",icon:"🧭",title:"Coordinator",subtitle:"Plans, spawns & coordinates the board"},{role:"worker",icon:"🛠️",title:"Worker",subtitle:"Executes assigned tasks & edits"},{role:"verifier",icon:"🛡️",title:"Verifier",subtitle:"Read-only independent PASS/FAIL gate"},{role:"monitor",icon:"📡",title:"Monitor",subtitle:"Detects stalls & nudges blocked threads"}];function Xe(t,l){if(!t)return"";const o=t.includes("/")?t.split("/").slice(1).join("/"):t;return l?`${o}#${l}`:o}function et(t){const{Button:l,Dialog:o,Loader:b}=t.ctx.ui,[p,I]=r.createSignal(null),[v,a]=r.createSignal({}),[m,D]=r.createSignal(!0),[$,E]=r.createSignal(!1),[h,n]=r.createSignal(null),g=ye(),S=async()=>{D(!0),n(null);try{const w=await t.loadRoleConfig();if(g())return;I(w),w?.roleModels&&a({...w.roleModels})}catch(w){if(g())return;n(w instanceof Error?w.message:String(w))}finally{g()||D(!1)}};r.onMount(()=>{S()});const k=w=>p()?.roleModels[w]??"",R=w=>v()[w]??k(w),F=w=>Ae(p()?.models??[],R(w)),z=w=>{const L=t.snapshot();if(!L)return{working:0,waiting:0};let O=0,V=0;for(const T of L.members){if((T.role??"").toLowerCase()!==w)continue;const x=T.state.toLowerCase();x==="working"||x==="active"?O++:(x==="waiting"||x==="idle")&&V++}return{working:O,waiting:V}},W=r.createMemo(()=>_e.filter(w=>{const L=k(w.role),O=R(w.role);return!!O&&O!==L})),G=r.createMemo(()=>W().length>0),u=r.createMemo(()=>{let w=0;for(const L of W())L.role!=="coordinator"&&(w+=z(L.role).working);return w}),d=(w,L)=>{L&&(n(null),a(O=>({...O,[w]:L})))},_=()=>{const w=p()?.roleModels;w&&a({...w}),n(null)},Q=async()=>{const w=W();if(w.length===0||$())return;E(!0),n(null);const L={...p()?.roleModels??{}},O=[],V=[],T=[];try{for(const x of w){const j=R(x.role),f=await t.onSetRoleModel(x.role,j);if(g())return;if(!f||!f.ok){T.push(`${x.title}: ${f?.error??"failed"}`);continue}L[x.role]=f.model,O.push(`${x.title} → ${f.model}`);for(const U of f.rerunMembers)V.includes(U)||V.push(U)}if(I(x=>x&&{...x,roleModels:{...x.roleModels,...L}}),T.length>0){const x=T.join("; ");n(x),t.ctx.toast.show({title:"Some role switches failed",description:x,variant:"error"})}else t.ctx.toast.show({title:`Updated ${O.length} role${O.length===1?"":"s"}`,description:V.length>0?`Switched & rerunning: ${V.map(x=>`@${x}`).join(", ")}`:O.join(" · "),variant:"success"})}catch(x){if(g())return;const j=x instanceof Error?x.message:String(x);n(j),t.ctx.toast.show({title:"Failed to apply role models",description:j,variant:"error"})}finally{g()||E(!1)}},q=r.createMemo(()=>t.snapshot()?.members??[]);return e.createComponent(o,{title:"🐝 Swarm Control",size:"large",get children(){var w=qe(),L=w.firstChild,O=L.firstChild,V=O.firstChild;V.firstChild;var T=V.nextSibling,x=T.firstChild,j=x.nextSibling,f=j.firstChild,U=f.firstChild,X=f.nextSibling,Z=X.firstChild,N=X.nextSibling,K=N.firstChild,Y=O.nextSibling,ee=L.nextSibling,re=ee.firstChild,P=re.nextSibling;return e.insert(V,()=>t.isBuzzing()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",null),e.insert(x,()=>t.snapshot()?.title??"No active swarm"),e.insert(f,()=>t.counts().active,U),e.insert(X,()=>t.counts().waiting,Z),e.insert(N,()=>t.counts().posts,K),e.insert(j,e.createComponent(r.Show,{get when(){return t.counts().paused},get children(){return De()}}),null),e.insert(j,e.createComponent(r.Show,{get when(){return e.memo(()=>!!t.counts().stalled)()&&!t.counts().paused},get children(){return Ve()}}),null),e.insert(Y,e.createComponent(r.Show,{get when(){return t.onOpenSetupWizard},get children(){return e.createComponent(l,{variant:"ghost",size:"small",onClick:()=>t.onOpenSetupWizard?.(),children:"Setup Wizard"})}}),null),e.insert(Y,e.createComponent(l,{variant:"contrast",size:"small",onClick:()=>{t.onOpenBoard(),t.onClose()},children:"Open Board"}),null),e.insert(w,e.createComponent(r.Show,{get when(){return q().length>0},get children(){var C=Fe();return e.insert(C,e.createComponent(r.For,{get each(){return q()},children:M=>{const B=M.state.toLowerCase(),H=B==="working"||B==="active",se=B==="killed",de=Xe(M.model,M.variant);return(()=>{var pe=Ge(),s=pe.firstChild,i=s.nextSibling;return i.firstChild,e.className(pe,`swarm-overlay-member-chip${H?" is-working":""}${se?" is-killed":""}`),e.insert(i,()=>M.handle,null),e.insert(pe,e.createComponent(r.Show,{when:de,get children(){var c=Te();return e.insert(c,de),c}}),null),pe})()}})),C}}),ee),e.insert(w,e.createComponent(r.Show,{get when(){return h()},get children(){var C=je();return e.insert(C,h),C}}),ee),e.insert(w,e.createComponent(r.Show,{get when(){return!m()||p()!==null},get fallback(){return(()=>{var C=Ke(),M=C.firstChild;return e.insert(C,e.createComponent(b,{size:"normal"}),M),C})()},get children(){var C=Ne();return e.insert(C,e.createComponent(r.For,{each:_e,children:(M,B)=>{const H=()=>z(M.role),se=()=>R(M.role),de=()=>!!se()&&se()!==k(M.role),pe=r.createMemo(()=>F(M.role));return(()=>{var s=Je(),i=s.firstChild,c=i.firstChild,y=c.firstChild,A=y.firstChild,ne=A.nextSibling,te=y.nextSibling,le=c.nextSibling,be=i.nextSibling;return e.insert(A,()=>M.icon),e.insert(ne,()=>M.title),e.insert(te,e.createComponent(r.Show,{get when(){return de()},get children(){return Qe()}}),null),e.insert(te,e.createComponent(r.Show,{get when(){return H().working>0||H().waiting>0},get children(){var J=He();return e.insert(J,(()=>{var ie=e.memo(()=>H().working>0);return()=>ie()?`${H().working} working`:`${H().waiting} waiting`})()),e.effect(()=>e.className(J,`swarm-overlay-role-count${H().working>0?" is-working":""}`)),J}}),null),e.insert(le,()=>M.subtitle),e.insert(be,e.createComponent(Me,{get value(){return se()},get options(){return pe()},get disabled(){return $()},get ariaLabel(){return`${M.title} model`},get menuUpward(){return B()>=2},onChange:J=>d(M.role,J)})),e.insert(s,e.createComponent(r.Show,{get when(){return e.memo(()=>!!(de()&&M.role!=="coordinator"))()&&H().working>0},get children(){var J=Ze(),ie=J.firstChild,ge=ie.nextSibling;return ge.nextSibling,e.insert(J,()=>H().working,ge),e.insert(J,()=>M.role,null),e.insert(J,()=>H().working===1?"":"s",null),J}}),null),e.effect(()=>e.className(s,`swarm-overlay-role-card${de()?" is-dirty":""}`)),s})()}})),C}}),ee),e.insert(re,e.createComponent(r.Show,{get when(){return G()},get fallback(){return Ye()},get children(){var C=We(),M=C.firstChild,B=M.nextSibling;return B.nextSibling,e.insert(C,()=>W().length,M),e.insert(C,()=>W().length===1?"":"s",B),e.insert(C,e.createComponent(r.Show,{get when(){return u()>0},get children(){return` · interrupts ${u()} working member${u()===1?"":"s"}`}}),null),C}})),e.insert(P,e.createComponent(r.Show,{get when(){return G()},get children(){return e.createComponent(l,{variant:"ghost",size:"small",get disabled(){return $()},onClick:_,children:"Reset"})}}),null),e.insert(P,e.createComponent(l,{variant:"ghost",size:"small",get disabled(){return $()},onClick:()=>t.onClose(),children:"Close"}),null),e.insert(P,e.createComponent(l,{variant:"contrast",size:"small",get disabled(){return!G()||$()},onClick:()=>{Q()},get children(){return $()?"Applying...":"Apply Changes"}}),null),e.effect(C=>{var M=`swarm-overlay-top${t.isBuzzing()?" is-buzzing":""}${t.counts().paused||t.counts().stalled?" is-alert":""}`,B=`swarm-overlay-badge${t.isBuzzing()?" is-buzzing":""}`;return M!==C.e&&e.className(L,C.e=M),B!==C.t&&e.className(V,C.t=B),C},{e:void 0,t:void 0}),w}})}var tt=e.template("<div class=swarm-overlay-error>"),rt=e.template('<div class=swarm-onboard-intro><p class=swarm-onboard-question>Welcome to Swarm! How would you like to configure models for your 4 Swarm roles?</p><div class=swarm-onboard-mode-cards><button type=button class="swarm-onboard-mode-card is-primary"><div class=swarm-onboard-option-top><strong>Use Recommended Models</strong><span class=swarm-model-select-badge>Recommended</span></div><p class=swarm-onboard-mode-desc>Apply tuned defaults for all 4 roles right away:</p><div class=swarm-onboard-rec-grid></div></button><button type=button class=swarm-onboard-mode-card><div class=swarm-onboard-option-top><strong>Pick Manually (4 Questions)</strong></div><p class=swarm-onboard-mode-desc>Step through Coordinator, Worker, Verifier, and Monitor one by one with recommended defaults pinned at the top and A–Z model search.</p></button></div><div class=swarm-onboard-footer><span>'),nt=e.template("<div class=swarm-onboard-root>"),at=e.template("<div class=swarm-overlay-loading><span>Loading available models..."),ot=e.template("<div class=swarm-onboard-step><div class=swarm-onboard-step-head><span class=swarm-onboard-step-pill>Question <!> of </span><h3>Choose <!> Model</h3><p></p></div><div class=swarm-onboard-choices><button type=button><div class=swarm-onboard-option-top><strong>★ </strong><span class=swarm-model-select-badge>Recommended</span></div><span class=swarm-onboard-option-sub></span></button><div><div class=swarm-onboard-custom-head><strong>Pick from catalog (A–Z search)</strong><span>Type to filter by provider, model, or variant</span></div></div></div><div class=swarm-onboard-footer><div class=swarm-onboard-footer-right>"),st=e.template("<div class=swarm-onboard-rec-row><span class=swarm-onboard-rec-role></span><span class=swarm-onboard-rec-spec>");const he=["coordinator","worker","verifier","monitor"];function it(t){const{Button:l,Dialog:o,Loader:b}=t.ctx.ui,[p,I]=r.createSignal(!0),[v,a]=r.createSignal(!1),[m,D]=r.createSignal(null),[$,E]=r.createSignal([]),[h,n]=r.createSignal(-1),[g,S]=r.createSignal({coordinator:fe.coordinator.fallbackSpec,worker:fe.worker.fallbackSpec,verifier:fe.verifier.fallbackSpec,monitor:fe.monitor.fallbackSpec}),k=r.createMemo(()=>Ce($())),R=ye();r.onMount(async()=>{I(!0),D(null);try{const u=await t.loadRoleConfig();if(R())return;const d=u?.models??[];E(d);const _=Ce(d,u?.roleModels);S(_)}catch(u){if(R())return;D(u instanceof Error?u.message:String(u))}finally{R()||I(!1)}});const F=async u=>{a(!0),D(null);try{const d=await t.onApplyModels(u);if(R())return;if(!d.ok){const _=d.errors.join("; ")||"Failed to apply one or more role models.";D(_),t.ctx.toast.show({title:"Could not save all Swarm models",description:_,variant:"error"});return}t.ctx.toast.show({title:"Swarm role models configured",description:`Coordinator: ${u.coordinator}`,variant:"success"}),t.onComplete()}catch(d){if(R())return;const _=d instanceof Error?d.message:String(d);D(_)}finally{R()||a(!1)}},z=r.createMemo(()=>{const u=h();return u>=0&&u<he.length?he[u]:"coordinator"}),W=r.createMemo(()=>{const u=z();return Ae($(),g()[u],k()[u])}),G=(u,d)=>{S(_=>({..._,[u]:d}))};return e.createComponent(o,{title:"🐝 Swarm Model Setup",size:"large",get children(){var u=nt();return e.insert(u,e.createComponent(r.Show,{get when(){return m()},get children(){var d=tt();return e.insert(d,m),d}}),null),e.insert(u,e.createComponent(r.Show,{get when(){return!p()},get fallback(){return(()=>{var d=at(),_=d.firstChild;return e.insert(d,e.createComponent(b,{size:"normal"}),_),d})()},get children(){return e.createComponent(r.Show,{get when(){return h()===-1},get fallback(){const d=()=>h(),_=()=>z(),Q=()=>fe[_()],q=()=>k()[_()],w=()=>g()[_()],L=()=>w()===q();return(()=>{var O=ot(),V=O.firstChild,T=V.firstChild,x=T.firstChild,j=x.nextSibling;j.nextSibling;var f=T.nextSibling,U=f.firstChild,X=U.nextSibling;X.nextSibling;var Z=f.nextSibling,N=V.nextSibling,K=N.firstChild,Y=K.firstChild,ee=Y.firstChild;ee.firstChild;var re=Y.nextSibling,P=K.nextSibling;P.firstChild;var C=N.nextSibling,M=C.firstChild;return e.insert(T,()=>d()+1,j),e.insert(T,()=>he.length,null),e.insert(f,()=>Q().title,X),e.insert(Z,()=>Q().subtitle),K.$$click=()=>G(_(),q()),e.insert(ee,q,null),e.insert(re,()=>Q().displayLabel),e.insert(P,e.createComponent(Me,{get value(){return w()},get options(){return W()},get disabled(){return v()},get ariaLabel(){return`${Q().title} model`},onChange:B=>G(_(),B)}),null),e.insert(C,e.createComponent(l,{variant:"ghost",get disabled(){return v()},onClick:()=>n(B=>Math.max(-1,B-1)),children:"Back"}),M),e.insert(M,e.createComponent(l,{variant:"ghost",get disabled(){return v()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.insert(M,e.createComponent(r.Show,{get when(){return d()<he.length-1},get fallback(){return e.createComponent(l,{variant:"contrast",get disabled(){return v()},onClick:()=>{F(g())},get children(){return v()?"Saving...":"Save & Finish"}})},get children(){return e.createComponent(l,{variant:"contrast",get disabled(){return v()},onClick:()=>n(B=>B+1),get children(){return["Next (",e.memo(()=>d()+2),"/",e.memo(()=>he.length),")"]}})}}),null),e.effect(B=>{var H=`swarm-onboard-option-card${L()?" is-selected":""}`,se=`swarm-onboard-custom-card${L()?"":" is-selected"}`;return H!==B.e&&e.className(K,B.e=H),se!==B.t&&e.className(P,B.t=se),B},{e:void 0,t:void 0}),O})()},get children(){var d=rt(),_=d.firstChild,Q=_.nextSibling,q=Q.firstChild,w=q.firstChild,L=w.nextSibling,O=L.nextSibling,V=q.nextSibling,T=Q.nextSibling;return T.firstChild,q.$$click=()=>{F(k())},e.insert(O,e.createComponent(r.For,{each:he,children:x=>(()=>{var j=st(),f=j.firstChild,U=f.nextSibling;return e.insert(f,()=>fe[x].title),e.insert(U,()=>k()[x]),j})()})),V.$$click=()=>n(0),e.insert(T,e.createComponent(l,{variant:"ghost",get disabled(){return v()},onClick:()=>t.onSkip(),children:"Skip for now"}),null),e.effect(x=>{var j=v(),f=v();return j!==x.e&&(q.disabled=x.e=j),f!==x.t&&(V.disabled=x.t=f),x},{e:void 0,t:void 0}),d}})}}),null),u}})}e.delegateEvents(["click"]);var lt=e.template("<div data-action=swarm-board.sidebarShow>"),dt=e.template("<div data-action=swarm-board.pillbarShow>"),ct=e.template("<div data-action=swarm-board.showWhenIdle>"),ut=e.template("<div data-action=swarm-board.composerPill>"),mt=e.template("<div data-action=swarm-board.bottomStrip>"),pt=e.template("<div data-action=swarm-board.withSidePanel>"),gt=e.template("<div data-action=swarm-board.toastEnabled>"),wt=e.template("<div data-action=swarm-board.autoSpawnVerifier>"),ft=e.template("<div style=display:flex;gap:8px>"),bt=e.template("<div data-action=swarm-board.status>"),ht=e.template("<div data-action=swarm-board.uninstall>");function vt(t){const{SettingsLayout:l,SettingsSection:o,SettingsRow:b,Switch:p,Button:I}=t.ctx.ui;r.onMount(()=>{!t.target||typeof document>"u"||queueMicrotask(()=>{document.querySelector(`[data-action="${CSS.escape(t.target)}"]`)?.scrollIntoView({block:"start"})})});const v=()=>{const a=t.rpcStatus();if(a.state==="connected"){const m=t.activeSwarmCount();return`Connected to local.opencode-swarm (${m} swarm${m===1?"":"s"} recorded).`}return a.state==="unavailable"?"Server plugin (local.opencode-swarm) is not loaded for this workspace.":a.message?`RPC error: ${a.message}`:"Unable to reach local.opencode-swarm."};return e.createComponent(l,{title:"Swarm Board",get children(){return[e.createComponent(o,{title:"Surfaces",get children(){return[(()=>{var a=lt();return e.insert(a,e.createComponent(b,{title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",get children(){return e.createComponent(p,{label:"Show Swarm side tab",hideLabel:!0,get checked(){return t.settings().sidebarShow},onChange:m=>t.updateSetting("sidebarShow",m)})}})),a})(),(()=>{var a=dt();return e.insert(a,e.createComponent(b,{title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",get children(){return e.createComponent(p,{label:"Show titlebar status pill",hideLabel:!0,get checked(){return t.settings().pillbarShow},onChange:m=>t.updateSetting("pillbarShow",m)})}})),a})(),(()=>{var a=ct();return e.insert(a,e.createComponent(b,{title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",get children(){return e.createComponent(p,{label:"Show titlebar pill when idle",hideLabel:!0,get checked(){return t.settings().showWhenIdle},onChange:m=>t.updateSetting("showWhenIdle",m)})}})),a})(),(()=>{var a=ut();return e.insert(a,e.createComponent(b,{title:"Show composer pill",description:"Show active handles and verifier status above the message composer",get children(){return e.createComponent(p,{label:"Show composer pill",hideLabel:!0,get checked(){return t.settings().composerPill},onChange:m=>t.updateSetting("composerPill",m)})}})),a})(),(()=>{var a=mt();return e.insert(a,e.createComponent(b,{title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",get children(){return e.createComponent(p,{label:"Show bottom summary strip",hideLabel:!0,get checked(){return t.settings().bottomStrip},onChange:m=>t.updateSetting("bottomStrip",m)})}})),a})(),(()=>{var a=pt();return e.insert(a,e.createComponent(b,{title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",get children(){return e.createComponent(p,{label:"Keep bottom strip when side panel is open",hideLabel:!0,get checked(){return t.settings().withSidePanel},onChange:m=>t.updateSetting("withSidePanel",m)})}})),a})()]}}),e.createComponent(o,{title:"Notifications",get children(){var a=gt();return e.insert(a,e.createComponent(b,{title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",get children(){return e.createComponent(p,{label:"Event toasts",hideLabel:!0,get checked(){return t.settings().toastEnabled},onChange:m=>t.updateSetting("toastEnabled",m)})}})),a}}),e.createComponent(o,{title:"Verification",get children(){var a=wt();return e.insert(a,e.createComponent(b,{title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish before allowing swarm completion",get children(){return e.createComponent(p,{label:"Auto-spawn verifier",hideLabel:!0,get checked(){return t.autoSpawnVerifier?.()??!0},onChange:m=>t.onToggleAutoSpawnVerifier?.(m)})}})),a}}),e.createComponent(o,{title:"Plugin Status & Actions",get children(){var a=bt();return e.insert(a,e.createComponent(b,{title:"Swarm Runtime",get description(){return v()},get children(){var m=ft();return e.insert(m,e.createComponent(I,{size:"small",variant:"ghost",get onClick(){return t.onRefresh},children:"Refresh"}),null),e.insert(m,(()=>{var D=e.memo(()=>!!t.onOpenSetupWizard);return()=>D()&&e.createComponent(I,{size:"small",variant:"ghost",get onClick(){return t.onOpenSetupWizard},children:"Setup Role Models"})})(),null),e.insert(m,e.createComponent(I,{size:"small",variant:"neutral",get onClick(){return t.onOpenPanel},children:"Open Swarm Board"}),null),m}})),a}}),e.memo(()=>e.memo(()=>!!t.onOpenUninstall)()&&e.createComponent(o,{title:"Uninstall",get children(){var a=ht();return e.insert(a,e.createComponent(b,{title:"Uninstall Swarm Plugin",description:"Review the full removal checklist and completely remove Swarm Runtime config, runtime data, worktrees, build artifacts, and temp files",get children(){return e.createComponent(I,{size:"small",variant:"ghost",get onClick(){return t.onOpenUninstall},children:"Uninstall..."})}})),a}}))]}})}var St=e.template("<div class=swarm-overlay-error>"),xt=e.template("<div class=swarm-uninstall-root>"),yt=e.template("<div class=swarm-overlay-loading><span>Scanning config, git worktrees, runtime data, and temp files..."),$t=e.template("<div class=swarm-uninstall-section><strong>Errors</strong><ul class=swarm-uninstall-list>"),kt=e.template("<div class=swarm-uninstall-section><strong>Final Host Reload Commands</strong><pre class=swarm-uninstall-code>"),Ct=e.template("<div class=swarm-uninstall-report><div><strong></strong><span> removed · <!> config(s) updated · <!> skipped · <!> error(s)</span></div><div class=swarm-uninstall-section><strong>Verification Checklist</strong><div class=swarm-uninstall-checks></div></div><div class=swarm-uninstall-footer><span>"),_t=e.template("<div><span></span><div><strong></strong><div class=swarm-uninstall-detail>"),Ie=e.template("<li>"),It=e.template("<div class=swarm-uninstall-plan><p class=swarm-uninstall-intro>Confirm what will be removed from this machine. Unchecked categories will be skipped; source code and backups remain untouched.</p><div class=swarm-uninstall-categories><div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong>6. Swarm GUI Settings Store</strong><span>Reset saved GUI preferences and onboarding state back to defaults.</span></div><span class=swarm-uninstall-count>1 store</span></label></div></div><div class=swarm-uninstall-preserved><strong>Preserved (Not Removed)</strong><ul></ul></div><div class=swarm-uninstall-footer>"),zt=e.template("<ul class=swarm-uninstall-items>"),At=e.template("<div><label class=swarm-uninstall-card-head><input type=checkbox><div class=swarm-uninstall-card-title><strong></strong><span></span></div><span class=swarm-uninstall-count>"),Mt=e.template("<div class=swarm-uninstall-empty>Nothing detected on disk"),Rt=e.template("<li><span class=swarm-uninstall-kind></span><code class=swarm-uninstall-path></code><span class=swarm-uninstall-detail>");function Lt(t){return typeof t!="number"||t<=0?"":t<1024?`${t} B`:t<1024*1024?`${(t/1024).toFixed(1)} KB`:`${(t/(1024*1024)).toFixed(1)} MB`}function Et(t){const{Button:l,Dialog:o,Loader:b}=t.ctx.ui,[p,I]=r.createSignal(!0),[v,a]=r.createSignal(!1),[m,D]=r.createSignal(null),[$,E]=r.createSignal(null),[h,n]=r.createSignal(null),[g,S]=r.createSignal(!0),[k,R]=r.createSignal({pluginRegistration:!0,gitWorktreesAndBranches:!0,runtimeData:!0,buildArtifacts:!0,tempFiles:!0}),F=ye();r.onMount(async()=>{I(!0),D(null);try{const u=await t.loadPlan();if(F())return;if(E(u),u){const d={...k()};for(const _ of u.categories)d[_.id]=_.defaultChecked;R(d)}}catch(u){if(F())return;D(u instanceof Error?u.message:String(u))}finally{F()||I(!1)}});const z=r.createMemo(()=>{const u=k();return Object.values(u).filter(Boolean).length+(g()?1:0)}),W=u=>{R(d=>({...d,[u]:!d[u]}))},G=async()=>{a(!0),D(null);try{const u=await t.onExecute(k());if(F())return;g()&&t.onResetGuiStore(),n(u),u?.ok?t.ctx.toast.show({title:"Swarm plugin uninstalled",description:"Reload or restart OpenCode to finish unloading.",variant:"success"}):u&&t.ctx.toast.show({title:"Uninstall completed with warnings",description:`${u.errors.length} error(s) — check verification checklist.`,variant:"error"})}catch(u){if(F())return;D(u instanceof Error?u.message:String(u))}finally{F()||a(!1)}};return e.createComponent(o,{title:"Uninstall Swarm Plugin — Removal Checklist",size:"large",get children(){var u=xt();return e.insert(u,e.createComponent(r.Show,{get when(){return m()},get children(){var d=St();return e.insert(d,m),d}}),null),e.insert(u,e.createComponent(r.Show,{get when(){return!p()},get fallback(){return(()=>{var d=yt(),_=d.firstChild;return e.insert(d,e.createComponent(b,{size:"normal"}),_),d})()},get children(){return e.createComponent(r.Show,{get when(){return h()===null},get fallback(){const d=()=>h();return(()=>{var _=Ct(),Q=_.firstChild,q=Q.firstChild,w=q.nextSibling,L=w.firstChild,O=L.nextSibling,V=O.nextSibling,T=V.nextSibling,x=T.nextSibling,j=x.nextSibling;j.nextSibling;var f=Q.nextSibling,U=f.firstChild,X=U.nextSibling,Z=f.nextSibling;return Z.firstChild,e.insert(q,()=>d().ok?"All selected Swarm items removed and verified":"Uninstall completed with remaining items"),e.insert(w,()=>d().removed.length,L),e.insert(w,()=>d().edited.length,O),e.insert(w,()=>d().skipped.length,T),e.insert(w,()=>d().errors.length,j),e.insert(X,e.createComponent(r.For,{get each(){return d().verification},children:N=>(()=>{var K=_t(),Y=K.firstChild,ee=Y.nextSibling,re=ee.firstChild,P=re.nextSibling;return e.insert(Y,()=>N.passed?"✓":"✗"),e.insert(re,()=>N.label),e.insert(P,()=>N.detail),e.effect(()=>e.className(K,`swarm-uninstall-check-row${N.passed?" is-pass":" is-fail"}`)),K})()})),e.insert(_,e.createComponent(r.Show,{get when(){return d().errors.length>0},get children(){var N=$t(),K=N.firstChild,Y=K.nextSibling;return e.insert(Y,e.createComponent(r.For,{get each(){return d().errors},children:ee=>(()=>{var re=Ie();return e.insert(re,ee),re})()})),N}}),Z),e.insert(_,e.createComponent(r.Show,{get when(){return d().nextSteps.length>0},get children(){var N=kt(),K=N.firstChild,Y=K.nextSibling;return e.insert(Y,()=>d().nextSteps.join(`
`)),N}}),Z),e.insert(Z,e.createComponent(l,{variant:"contrast",onClick:()=>t.onClose(),children:"Close"}),null),e.effect(()=>e.className(Q,`swarm-uninstall-banner${d().ok?" is-ok":" is-warn"}`)),_})()},get children(){return e.createComponent(r.Show,{get when(){return $()},children:d=>(()=>{var _=It(),Q=_.firstChild,q=Q.nextSibling,w=q.firstChild,L=w.firstChild,O=L.firstChild,V=q.nextSibling,T=V.firstChild,x=T.nextSibling,j=V.nextSibling;return e.insert(q,e.createComponent(r.For,{get each(){return d().categories},children:f=>{const U=()=>k()[f.id];return(()=>{var X=At(),Z=X.firstChild,N=Z.firstChild,K=N.nextSibling,Y=K.firstChild,ee=Y.nextSibling,re=K.nextSibling;return N.addEventListener("change",()=>W(f.id)),e.insert(Y,()=>f.title),e.insert(ee,()=>f.description),e.insert(re,(()=>{var P=e.memo(()=>f.items.length===0);return()=>P()?"Clean":`${f.items.length} item${f.items.length===1?"":"s"}`})()),e.insert(X,e.createComponent(r.Show,{get when(){return f.items.length>0},get fallback(){return Mt()},get children(){var P=zt();return e.insert(P,e.createComponent(r.For,{get each(){return f.items},children:C=>(()=>{var M=Rt(),B=M.firstChild,H=B.nextSibling,se=H.nextSibling;return e.insert(B,()=>C.kind),e.insert(H,()=>C.path),e.insert(se,()=>C.detail,null),e.insert(se,(()=>{var de=e.memo(()=>!!C.sizeBytes);return()=>de()?` (${Lt(C.sizeBytes)})`:""})(),null),M})()})),P}}),null),e.effect(P=>{var C=`swarm-uninstall-card${U()?" is-checked":""}`,M=v();return C!==P.e&&e.className(X,P.e=C),M!==P.t&&(N.disabled=P.t=M),P},{e:void 0,t:void 0}),e.effect(()=>N.checked=U()),X})()}}),w),O.addEventListener("change",()=>S(f=>!f)),e.insert(x,e.createComponent(r.For,{get each(){return d().preserved},children:f=>(()=>{var U=Ie();return e.insert(U,f),U})()})),e.insert(j,e.createComponent(l,{variant:"ghost",get disabled(){return v()},onClick:()=>t.onClose(),children:"Cancel"}),null),e.insert(j,e.createComponent(l,{variant:"contrast",get disabled(){return v()||z()===0},onClick:()=>{G()},get children(){return v()?"Removing...":"Confirm & Remove Selected Items"}}),null),e.effect(f=>{var U=`swarm-uninstall-card${g()?" is-checked":""}`,X=v();return U!==f.e&&e.className(w,f.e=U),X!==f.t&&(O.disabled=f.t=X),f},{e:void 0,t:void 0}),e.effect(()=>O.checked=g()),_})()})}})}}),null),u}})}const xe="swarm-board",ze=me.Schema.Struct({sidebarShow:me.Schema.Boolean,pillbarShow:me.Schema.Boolean,showWhenIdle:me.Schema.Boolean,composerPill:me.Schema.Boolean,bottomStrip:me.Schema.Boolean,withSidePanel:me.Schema.Boolean,toastEnabled:me.Schema.Boolean,onboardingComplete:me.Schema.Boolean}),ve={sidebarShow:!0,pillbarShow:!0,showWhenIdle:!0,composerPill:!0,bottomStrip:!1,withSidePanel:!1,toastEnabled:!0,onboardingComplete:!1};function Pt(t,l,o){return t!==l?!1:(o(),!0)}function Se(t){if(!t)return"";const l=t.posts.length>0?String(t.posts[t.posts.length-1]?.id??""):"",o=t.members.map(b=>`${b.handle}:${b.state}:${b.trackStatus??""}`).join("|");return[t.swarmId,t.status,t.boardUrl??"",t.stalled?"1":"0",t.verifierStatus??"",String(t.posts.length),l,o].join("\0")}function Bt(t){return(Array.isArray(t)?t:t&&typeof t=="object"&&Array.isArray(t.swarms)?t.swarms:[]).map(o=>({id:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),activeCount:typeof o.activeCount=="number"?o.activeCount:void 0,waitingCount:typeof o.waitingCount=="number"?o.waitingCount:void 0,postCount:typeof o.postCount=="number"?o.postCount:typeof o.post_count=="number"?o.post_count:void 0,updatedAt:o.updatedAt??(typeof o.updated_at=="number"?new Date(o.updated_at).toISOString():void 0)}))}function Ot(t){if(!t||typeof t!="object")return null;const l=t;if(typeof l.swarmId=="string"&&Array.isArray(l.posts))return l;const o=l.swarm;if(!o||typeof o!="object")return null;const b=Array.isArray(l.members)?l.members:[],p=Array.isArray(l.board_posts)?l.board_posts:Array.isArray(l.posts)?l.posts:[],I=Array.isArray(l.file_locks)?l.file_locks:Array.isArray(l.locks)?l.locks:[],v=b.map(n=>({handle:String(n.handle??n.name??""),role:typeof n.role=="string"?n.role:void 0,state:String(n.state??"waiting"),model:typeof n.model=="string"?n.model:void 0,variant:typeof n.variant=="string"?n.variant:void 0,trackStatus:typeof n.track_status=="string"?n.track_status:n.trackStatus,ownedGlobs:Array.isArray(n.owned_globs)?n.owned_globs:Array.isArray(n.ownedGlobs)?n.ownedGlobs:[],sessionId:typeof n.session_id=="string"?n.session_id:n.sessionId,session_id:typeof n.session_id=="string"?n.session_id:n.sessionId})),a=p.map(n=>({id:n.seq??n.id??0,seq:typeof n.seq=="number"?n.seq:void 0,author:String(n.author??""),body:String(n.body??""),createdAt:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.createdAt,created_at:typeof n.created_at=="number"?new Date(n.created_at).toISOString():n.created_at,mentions:Array.isArray(n.mentions)?n.mentions:[]})),m=I.map(n=>({glob:String(n.glob_pattern??n.glob??""),owner:String(n.owner_handle??n.owner??""),acquiredAt:typeof n.claimed_at=="number"?new Date(n.claimed_at).toISOString():n.acquiredAt})),D=b.some(n=>!!n.paused_quota),$=[...a].reverse().find(n=>n.author.replace(/^@/,"").toLowerCase()==="verifier"),E=$?/\bFAIL\b/i.test($.body)?"FAIL":/\bPASS\b/i.test($.body)?"PASS":void 0:void 0,h=[];for(const n of a)if(n.mentions&&n.mentions.length>0)for(const g of n.mentions)h.push({from:n.author,to:g.startsWith("@")?g:`@${g}`,summary:n.body.slice(0,80),at:n.createdAt});return{swarmId:String(o.id??""),title:String(o.title??o.id??"Swarm"),status:String(o.status??"running"),boardUrl:typeof l.boardUrl=="string"?l.boardUrl:void 0,pausedQuota:D,paused_quota:D,stalled:!!l.stalled,verifierStatus:E,members:v,posts:a,locks:m,handoffs:h}}var Ut=e.template("<span>"),Dt=e.template("<div class=swarm-gui-bottom-strip style=cursor:pointer><span>Swarm: <!> · <!> active · <!> waiting · <!> posts"),Vt=e.template("<div style=padding:12px>Loading Swarm Board...");const Ft=r.lazy(()=>Promise.resolve().then(()=>Jt)),jt=[{id:xe,title:"Swarm Board",description:"Configure Swarm Board side tab, pills, bottom strip, and event toasts",keywords:"swarm board agents coordinator verifier"},{id:"swarm-board.sidebarShow",title:"Show Swarm side tab",description:"Display the Swarm Board panel in the session side pane",keywords:"swarm sidebar panel tab"},{id:"swarm-board.pillbarShow",title:"Show titlebar status pill",description:"Show live active, waiting, and post counts in the window titlebar",keywords:"swarm titlebar pill status"},{id:"swarm-board.showWhenIdle",title:"Show titlebar pill when idle",description:"Keep a subtle Swarm: Idle pill in the titlebar when no swarm is active",keywords:"swarm titlebar idle"},{id:"swarm-board.composerPill",title:"Show composer pill",description:"Show active handles and verifier status above the message composer",keywords:"swarm composer pill"},{id:"swarm-board.bottomStrip",title:"Show bottom summary strip",description:"Display a compact one-line swarm summary bar at the bottom of the window",keywords:"swarm bottom strip status bar"},{id:"swarm-board.withSidePanel",title:"Keep bottom strip when side panel is open",description:"Show the bottom summary strip even while the Swarm side panel is visible",keywords:"swarm bottom strip side panel"},{id:"swarm-board.toastEnabled",title:"Event toasts",description:"Show toast alerts for quota pauses, @verifier PASS/FAIL, @monitor stall nudges, and swarm completion",keywords:"swarm toast notifications"},{id:"swarm-board.autoSpawnVerifier",title:"Auto-spawn verifier",description:"Automatically spawn or wake @verifier when all worker tracks finish",keywords:"swarm verifier auto spawn gate verification"},{id:"swarm-board.status",title:"Setup Role Models",description:"Choose recommended or custom models for Coordinator, Worker, Verifier, and Monitor",keywords:"swarm models onboarding wizard setup"},{id:"swarm-board.uninstall",title:"Uninstall Swarm Plugin",description:"Review removal checklist and completely uninstall Swarm Runtime",keywords:"swarm uninstall remove cleanup reset"}],Nt=`
[data-component="session-activity-chips"],
[data-slot="session-activity-chip"] {
  display: none !important;
}
`,Wt=ae.Plugin.define({stores:{settings:ae.Store.global(ze,ve)},setup(t){const l=t.stores?.settings??t.storage.store("swarm.settings",{schema:ze,initial:ve}),o=()=>l.value??ve,b=(s,i)=>{l.set({...o(),[s]:i})},p=(s,i)=>{try{return t.add(s,i)}catch(c){return console.warn("[opencode-swarm] OpenCode did not accept a GUI item:",c),()=>{}}};p(ae.Style,Re);const[I,v]=r.createSignal([]),[a,m]=r.createSignal(null),[D,$]=r.createSignal(null),[E,h]=r.createSignal(null),[n,g]=r.createSignal(null),[S,k]=r.createSignal(""),[R,F]=r.createSignal(void 0),[z,W]=r.createSignal({state:"connected"}),[G,u]=r.createSignal(!0);let d=!1,_="",Q=!1,q="",w=null,L=0,O=null,V=Se(null);const T=()=>t.sessions.current()?.id??null,x=()=>n()!==null,j=()=>t.sessions.current()?.location?.directory??R(),f=()=>t.client.rpc(ke),U=(s=8e3)=>{const i=t.sessions.current()?.location??(R()?{directory:R()}:void 0),c=AbortSignal.timeout(s);return i?{location:i,signal:c}:{signal:c}},X=s=>{if(!o().toastEnabled)return;const i=!!(s.pausedQuota??s.paused_quota);i&&!d&&t.toast.show({title:"Swarm paused on quota",description:s.title||s.swarmId,variant:"error"}),d=i;const c=(s.verifierStatus??"").toUpperCase();(c==="PASS"||c==="FAIL")&&c!==_&&t.toast.show({title:`@verifier ${c}`,description:s.title||s.swarmId,variant:c==="PASS"?"success":"error"}),_=c;const y=[...s.posts].reverse().find(A=>A.author.replace(/^@/,"").toLowerCase()==="monitor");s.stalled&&!Q?t.toast.show({title:"@monitor stall nudge",description:y?.body??"Swarm appears stalled"}):y&&y.id!==w&&w!==null&&t.toast.show({title:"@monitor stall nudge",description:y.body}),Q=!!s.stalled,y&&(w=y.id),s.status==="completed"&&q!==s.swarmId&&(q=s.swarmId,t.toast.show({title:"Swarm completed",description:s.title||s.swarmId,variant:"success"}))},Z=async()=>{const s=++L;try{const i=f(),c=U(),y=await i.listSwarms({},c);if(s!==L)return;const A=Bt(y);v(A);const ne=a();ne&&!A.some(we=>we.id===ne)&&(m(null),$(null));const te=T(),le=te?D():null,be=!!te&&!le,J=await i.getSwarmSnapshot(le?{swarmId:le}:te?{sessionId:te}:{},c);if(s!==L)return;J&&typeof J=="object"&&typeof J.boardUrl=="string"&&J.boardUrl&&k(J.boardUrl);const ie=Ot(J),ge=Se(ie);ge!==V&&(V=ge,h(ie)),be&&ie&&g(ie.swarmId),z().state!=="connected"&&(W({state:"connected"}),ee()),i.getRoleConfig(le?{swarmId:le}:te?{sessionId:te}:{},c).then(we=>{Pt(s,L,()=>{const $e=we&&typeof we=="object"&&"output"in we?we.output:we;typeof $e?.autoSpawnVerifier=="boolean"&&u($e.autoSpawnVerifier)})}).catch(()=>{}),ie&&X(ie)}catch(i){if(s!==L)return;const y=typeof i=="object"&&i!==null&&"type"in i&&i.type==="rpc.unavailable"?{state:"unavailable"}:{state:"error",message:i instanceof Error?i.message:String(i)},A=z();A.state===y.state&&(y.state!=="error"||A.message===y.message)||W(y)}};r.createEffect(()=>{j();const s=T();t.sessions.current()?.pending,a(),s!==O&&(O=s,$(null),m(null),h(null),V=Se(null),g(null),k(""),v([])),Z()});let N=null,K;const Y=()=>{if(N!==t.client){K?.abort(),N=t.client,K=new AbortController;try{t.client.rpc(ke).events.on("changed",()=>{Z()},{signal:K.signal})}catch{}}};function ee(){try{K?.abort(),N=null,Y()}catch{}}Y(),r.createEffect(()=>{try{const s=t.servers;if(!s)return;const c=s.list().map(A=>s.get(A)).find(A=>A?.builtin)?.data;if(!c||typeof c.on!="function")return;const y=c.on("session.tool.success",()=>{Z()});r.onCleanup(()=>y())}catch{}});const re=setInterval(()=>{Y(),Z()},2e3);r.onCleanup(()=>{K?.abort(),clearInterval(re)});const P=r.createMemo(()=>{const s=E();if(!s)return{active:0,waiting:0,posts:0,paused:!1,stalled:!1};let i=0,c=0;for(const y of s.members){const A=y.state.toLowerCase();A==="working"||A==="active"?i++:(A==="waiting"||A==="idle")&&c++}return{active:i,waiting:c,posts:s.posts.length,paused:!!(s.pausedQuota??s.paused_quota),stalled:!!s.stalled}}),C=(s=!1)=>{if(!o().sidebarShow){t.toast.show({title:"Swarm side tab is disabled in Swarm Board settings."});return}const i=t.sessions.current();if(!i){t.toast.show({title:"Open a session first to view the Swarm Board."});return}const c=`${t.id}:swarm`;if(s&&t.layout.state(c,i)==="visible"){t.layout.hide(c,i);return}t.layout.open(c,i)},M=()=>{t.layout.settings(xe)},B=r.createMemo(()=>{const s=E(),i=P();return!!(s&&(i.active>0||s.status==="running"&&s.members.some(c=>c.state.toLowerCase()==="working")))});p(ae.Style,()=>B()?Nt:void 0);const H=()=>{t.dialogs.open(s=>e.createComponent(it,{ctx:t,loadRoleConfig:async()=>{const i=a(),c=t.sessions.current()?.id;return await f().getRoleConfig(i?{swarmId:i}:c?{sessionId:c}:{},U())},onApplyModels:async i=>{const c=[],y=a(),A=t.sessions.current()?.id;for(const ne of["coordinator","worker","verifier","monitor"]){const te=i[ne];if(!te)continue;const le=await f().setRoleModel({role:ne,model:te,...y?{swarmId:y}:{},...A?{sessionId:A}:{}},U());le?.ok||c.push(`${ne}: ${le?.error??"failed"}`)}return Z(),{ok:c.length===0,errors:c}},onComplete:()=>{b("onboardingComplete",!0),s.close()},onSkip:()=>{b("onboardingComplete",!0),s.close()}}))},se=()=>{t.dialogs.open(s=>e.createComponent(et,{ctx:t,snapshot:E,counts:P,isBuzzing:B,loadRoleConfig:async()=>{const i=a(),c=t.sessions.current()?.id;return await f().getRoleConfig(i?{swarmId:i}:c?{sessionId:c}:{},U())},onSetRoleModel:async(i,c)=>{const y=a(),A=t.sessions.current()?.id,ne=await f().setRoleModel({role:i,model:c,...y?{swarmId:y}:{},...A?{sessionId:A}:{}},U());return Z(),ne},onOpenBoard:()=>C(!1),onOpenSetupWizard:()=>{s.close(),H()},onClose:()=>s.close()}))},de=()=>{t.dialogs.open(s=>e.createComponent(Et,{ctx:t,loadPlan:async()=>await f().previewUninstall({},U(3e4)),onExecute:async i=>await f().executeUninstall({categories:i},U(12e4)),onResetGuiStore:()=>{l.set(ve)},onClose:()=>s.close()}))};p(ae.SettingsPage,()=>({id:xe,title:"Swarm Board",icon:"dot-grid",entries:jt,render:({target:s})=>e.createComponent(vt,{ctx:t,settings:o,updateSetting:b,rpcStatus:z,activeSwarmCount:()=>I().length,autoSpawnVerifier:G,onToggleAutoSpawnVerifier:async i=>{const c=G();u(i);try{const y=await f().setAutoSpawnVerifier({enabled:i},U()),A=y&&typeof y=="object"&&"output"in y?y.output:y;typeof A?.autoSpawnVerifier=="boolean"&&u(A.autoSpawnVerifier)}catch(y){u(c),t.toast.show({title:"Failed to update Auto-spawn verifier",description:y instanceof Error?y.message:String(y),variant:"error"})}},onOpenPanel:()=>C(!1),onOpenSetupWizard:H,onOpenUninstall:de,onRefresh:()=>{Z()},target:s})})),p(ae.TitlebarItem,()=>{if(!x()||!o().pillbarShow)return;const s=E(),i=t.sessions.current(),c=i?t.layout.state(`${t.id}:swarm`,i)==="visible":!1,y=P(),A=y.paused||y.stalled?" ⚠":"";return{id:"swarm-open",label:B()?`🐝 Swarm: Buzzing (${y.active} active · ${y.posts} posts)${A}`:s?`🐝 Swarm: Dozing (${y.posts} posts)${A}`:"🐝 Swarm: Dozing",title:y.paused?"Swarm paused on quota — click to open Swarm Board":y.stalled?"Swarm stalled — click to open Swarm Board":"Open Swarm Board",pressed:c,run:()=>C(!0)}}),p(ae.ComposerPill,{id:"swarm-composer-pill",show(s){if(s.session.directory&&F(s.session.directory),!x()||!o().composerPill)return;const i=E(),c=P(),y=(i?.verifierStatus??"").toUpperCase();let A;return c.paused||y==="FAIL"?A="danger":c.stalled&&(A="warning"),{label:B()?"🐝 Swarm: Buzzing":"🐝 Swarm: Dozing",...A?{tone:A}:{},title:"Click to configure Swarm role models or open Board",run:()=>se()}}}),p(ae.Slot,{at:"window.bottom",render:()=>{const s=()=>{if(!x()||!o().bottomStrip)return!1;const i=t.sessions.current();return!(i?t.layout.state(`${t.id}:swarm`,i)==="visible":!1)||o().withSidePanel};return e.createComponent(r.Show,{get when(){return s()},get children(){var i=Dt(),c=i.firstChild,y=c.firstChild,A=y.nextSibling,ne=A.nextSibling,te=ne.nextSibling,le=te.nextSibling,be=le.nextSibling,J=be.nextSibling,ie=J.nextSibling;return ie.nextSibling,i.$$click=()=>C(!0),e.insert(c,()=>E()?.title??"Idle",A),e.insert(c,()=>P().active,te),e.insert(c,()=>P().waiting,be),e.insert(c,()=>P().posts,ie),e.insert(i,e.createComponent(r.Show,{get when(){return P().paused||P().stalled},get children(){var ge=Ut();return e.insert(ge,()=>P().paused?"Paused on quota":"Stalled"),ge}}),null),i}})}}),p(ae.MenuItem,()=>{if(!x())return;const s=t.sessions.current();return{menu:"session.panel",id:"open-swarm",title:"Swarm",icon:"dot-grid",description:"Open live Swarm Board",opened:s?t.layout.state(`${t.id}:swarm`,s)!=="closed":!1,run:()=>C(!1)}}),p(ae.Command,()=>({id:"open",title:"Open Swarm Board",description:"Open the live Antigravity-style Swarm Board side panel",group:"Swarm",section:"navigation",bind:"mod+shift+s",slash:{name:"swarm-board"},run:()=>C(!1)})),p(ae.Command,()=>({id:"settings",title:"Swarm Board Settings",description:"Configure Swarm Board surfaces and notifications",group:"Swarm",section:"general",run:()=>M()})),p(ae.Command,()=>({id:"setup-models",title:"Swarm Model Setup Wizard",description:"Choose recommended or manual models for Swarm roles",group:"Swarm",section:"model",run:()=>H()})),p(ae.Command,()=>({id:"uninstall",title:"Uninstall Swarm Plugin",description:"Open the Swarm removal checklist and completely uninstall Swarm Runtime",group:"Swarm",section:"general",run:()=>de()}));const pe={id:"swarm",title:"Swarm",pinned:!1};p(ae.Panel,{id:"board",region:"side",width:480,mobile:{title:"Swarm",order:50,kind:"tab",cached:!0},list(){return x()&&o().sidebarShow?[pe]:[]},render(s){return s.session.directory&&F(s.session.directory),e.createComponent(r.Suspense,{get fallback(){return Vt()},get children(){return e.createComponent(Ft,{ctx:t,snapshot:E,boardUrl:S,swarms:I,selectedSwarmId:a,sessionId:()=>s.session.id,onSelectSwarm:i=>{$(i),m(i)},onRefresh:()=>{Z()},onOpenSettings:M,rpcError:()=>{const i=z();if(i.state==="unavailable")return"Server plugin (local.opencode-swarm) is not loaded for this workspace.";if(i.state==="error")return i.message},onCompleteSwarm:async i=>{await f().completeSwarm({swarmId:i},U()),await Z()},get server(){return s.session.server}})}})}})}});e.delegateEvents(["click"]);var qt=e.template('<div style="padding:12px 16px;display:flex;flex-direction:column;gap:12px"><div>Mark swarm <strong></strong> as completed?</div><div style=display:flex;justify-content:flex-end;gap:8px>'),Tt=e.template("<option>"),Gt=e.template('<iframe class=swarm-gui-iframe title="Swarm Board">'),Kt=e.template("<div class=swarm-gui-panel><div class=swarm-gui-header><select class=swarm-gui-select>"),Qt=e.template("<option> (<!>)"),Ht=e.template("<div class=swarm-gui-empty>");function Zt(t){const{Button:l,Dialog:o}=t.ctx.ui,[b,p]=r.createSignal(0);let I;const v=r.createMemo(()=>t.snapshot()?.boardUrl||t.boardUrl?.()||""),a=r.createMemo(()=>t.selectedSwarmId()??t.snapshot()?.swarmId??""),m=r.createMemo(()=>{const h=v();if(!h)return"";const n=a(),g=t.sessionId?.()??"",S=b();try{const k=new URL(h);return n&&k.searchParams.set("swarmId",n),g&&k.searchParams.set("conversationId",g),S>0&&k.searchParams.set("_r",String(S)),k.toString()}catch{return h}}),D=r.createMemo(()=>{const h=m();if(!h)return"";try{return new URL(h).origin}catch{return""}}),$=()=>{const h=I?.contentWindow,n=D();if(!h||!n)return;const g=t.ctx.appearance.mode(),S=typeof document<"u"?getComputedStyle(document.documentElement):null,k=z=>S?.getPropertyValue(z).trim()||"",R={},F=[["--background","--background-base"],["--card","--surface-raised-base"],["--secondary","--surface-base-hover"],["--foreground","--text-strong"],["--secondary-foreground","--text-base"],["--muted-foreground","--text-weak"],["--border","--border-weak-base"],["--card-border","--border-weak-base"],["--primary","--text-interactive-base"],["--sw-success","--icon-success-base"],["--sw-warning","--icon-warning-base"],["--sw-error","--icon-critical-base"],["--font-family","--font-family-sans"],["--editor-font-family","--font-family-mono"]];for(const[z,W]of F){const G=k(W);G&&(R[z]=G)}h.postMessage({type:"swarm:theme",mode:g,tokens:R},n)};if(r.createEffect(()=>{t.ctx.appearance.mode(),$()}),typeof window<"u"){const h=n=>{if(n.source!==I?.contentWindow)return;const g=D();if(g&&n.origin!==g)return;const S=n.data;if(S?.type==="swarm:open_session"&&typeof S.sessionID=="string"&&S.sessionID){const k=t.server,R=typeof k=="string"?k:k?.id??t.ctx.sessions.current()?.server.id;if(!R){t.ctx.toast.show({title:"No server context for member session"});return}t.ctx.tabs.open({server:R,id:S.sessionID},{focus:!0})}};window.addEventListener("message",h),r.onCleanup(()=>window.removeEventListener("message",h))}const E=()=>{const h=t.snapshot();h&&t.ctx.dialogs.open(n=>e.createComponent(o,{title:"Complete Swarm?",get children(){var g=qt(),S=g.firstChild,k=S.firstChild,R=k.nextSibling,F=S.nextSibling;return e.insert(R,()=>h.title||h.swarmId),e.insert(F,e.createComponent(l,{variant:"ghost",onClick:()=>n.close(),children:"Cancel"}),null),e.insert(F,e.createComponent(l,{variant:"danger",onClick:async()=>{try{await t.onCompleteSwarm(h.swarmId),n.close()}catch(z){t.ctx.toast.show({title:"Failed to complete swarm",description:z instanceof Error?z.message:String(z),variant:"error"})}},children:"Complete Swarm"}),null),g}}))};return(()=>{var h=Kt(),n=h.firstChild,g=n.firstChild;return g.addEventListener("change",S=>t.onSelectSwarm(S.currentTarget.value)),e.insert(g,e.createComponent(r.Show,{get when(){return t.swarms().length===0},get children(){var S=Tt();return e.insert(S,()=>t.snapshot()?.title??"No active swarm"),e.effect(()=>S.value=t.snapshot()?.swarmId??""),S}}),null),e.insert(g,e.createComponent(r.For,{get each(){return t.swarms()},children:S=>(()=>{var k=Qt(),R=k.firstChild,F=R.nextSibling;return F.nextSibling,e.insert(k,()=>S.title||S.id,R),e.insert(k,()=>S.status,F),e.effect(()=>k.value=S.id),k})()}),null),e.insert(n,e.createComponent(l,{size:"small",variant:"ghost",onClick:()=>{t.onRefresh(),p(S=>S+1)},children:"Refresh"}),null),e.insert(n,e.createComponent(r.Show,{get when(){return t.snapshot()?.status==="running"},get children(){return e.createComponent(l,{size:"small",variant:"neutral",onClick:E,children:"Complete"})}}),null),e.insert(n,e.createComponent(r.Show,{get when(){return t.onOpenSettings},get children(){return e.createComponent(l,{size:"small",variant:"ghost",onClick:()=>t.onOpenSettings?.(),children:"Settings"})}}),null),e.insert(h,e.createComponent(r.Show,{get when(){return m()},get fallback(){return(()=>{var S=Ht();return e.insert(S,()=>t.rpcError?.()??"No swarm active in this workspace. Run /swarm <task> to start one."),S})()},get children(){var S=Gt();return S.addEventListener("load",()=>$()),e.use(k=>{I=k},S),e.effect(()=>e.setAttribute(S,"src",m())),S}}),null),e.effect(()=>g.value=a()),h})()}const Jt=Object.freeze(Object.defineProperty({__proto__:null,default:Zt},Symbol.toStringTag,{value:"Module"}));exports.default=Wt;
