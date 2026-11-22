export const SWARM_GUI_STYLES = `
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
`;
