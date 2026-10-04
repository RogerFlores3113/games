"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { DevAutoplayScopeSchema } from "@games/schema";
import type { ClientMessage, DevAutoplayScope, DevCommand, DevShortcutWire, RoomView } from "@games/schema";
import { useDevStore } from "../../lib/dev/dev-store";
import {
  listSnapshots,
  removeSnapshot,
  saveSnapshot,
  type DevSnapshot,
} from "../../lib/dev/dev-snapshots";
import { withSeatLabels } from "../../lib/dev/seat-labels";

export interface DevPanelProps {
  view: RoomView;
  send: (message: ClientMessage) => void;
  disabled: boolean;
}

type Field = DevShortcutWire["fields"][number];

const AUTOPLAY_DEFAULT_STEPS = 500;

const controlClass =
  "rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-1.5 py-1 text-xs text-[var(--color-text)] disabled:opacity-50";
const buttonClass =
  "cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs font-semibold text-[var(--color-text)] hover:bg-[var(--color-surface)] disabled:cursor-not-allowed disabled:opacity-50";

function fieldInitial(field: Field): string {
  if (field.kind === "choice") return field.options[0]?.value ?? "";
  return String(field.initial);
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-1.5 border-t border-[var(--color-border)] pt-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function DevPanel({ view, send, disabled }: DevPanelProps) {
  const [open, setOpen] = useState(false);
  const devState = useDevStore((s) => s.state);
  const devResult = useDevStore((s) => s.result);
  const busy = useDevStore((s) => s.pending.length > 0);

  const [scope, setScope] = useState<DevAutoplayScope>("bots");
  const [stopAtMilestone, setStopAtMilestone] = useState(false);
  const [steps, setSteps] = useState(String(AUTOPLAY_DEFAULT_STEPS));
  const [botsAuto, setBotsAuto] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [json, setJson] = useState("");
  const [jsonEdited, setJsonEdited] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState("");
  const [snapshots, setSnapshots] = useState<DevSnapshot[]>([]);
  const lastAutoGame = useRef<string | null>(null);

  function sendDev(command: DevCommand) {
    useDevStore.getState().sent(command.kind);
    send({ type: "dev", command });
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "`" || event.ctrlKey || event.metaKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      event.preventDefault();
      setOpen((current) => !current);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    // A dropped socket never answers what it had in flight.
    if (disabled) useDevStore.setState({ pending: [] });
  }, [disabled]);

  useEffect(() => {
    if (!open || disabled) return;
    sendDev({ kind: "snapshot" });
    // `send` is re-created every render; the trigger is the open flag and a fresh view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view, disabled]);

  useEffect(() => {
    if (!botsAuto || disabled || view.status !== "in_progress") return;
    const fingerprint = JSON.stringify(view.game);
    if (fingerprint === lastAutoGame.current) return;
    lastAutoGame.current = fingerprint;
    sendDev({ kind: "autoplay", scope: "bots", maxSteps: AUTOPLAY_DEFAULT_STEPS, stopAtMilestone: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [botsAuto, view, disabled]);

  useEffect(() => {
    if (!botsAuto) lastAutoGame.current = null;
  }, [botsAuto]);

  useEffect(() => {
    if (devState && !jsonEdited) {
      setJson(JSON.stringify(devState.game, null, 2));
      setJsonError(null);
    }
  }, [devState, jsonEdited]);

  useEffect(() => {
    if (open) setSnapshots(listSnapshots(view.gameId));
  }, [open, view.gameId]);

  const groups = useMemo(() => {
    const byGroup = new Map<string, DevShortcutWire[]>();
    for (const shortcut of devState?.shortcuts ?? []) {
      byGroup.set(shortcut.group, [...(byGroup.get(shortcut.group) ?? []), shortcut]);
    }
    return [...byGroup.entries()];
  }, [devState?.shortcuts]);

  function fieldValue(shortcutId: string, field: Field): string {
    return fieldValues[`${shortcutId}:${field.name}`] ?? fieldInitial(field);
  }

  function runShortcut(shortcut: DevShortcutWire) {
    const params: Record<string, string | number> = {};
    for (const field of shortcut.fields) {
      const value = fieldValue(shortcut.id, field);
      params[field.name] = field.kind === "number" ? Number(value) : value;
    }
    sendDev({ kind: "shortcut", id: shortcut.id, params });
  }

  function applyJson() {
    let state: unknown;
    try {
      state = JSON.parse(json);
    } catch (error) {
      setJsonError(error instanceof Error ? error.message : "Invalid JSON");
      return;
    }
    setJsonError(null);
    setJsonEdited(false);
    sendDev({ kind: "load-state", state });
  }

  function saveCurrent() {
    const name = snapshotName.trim();
    if (!name || !devState) return;
    saveSnapshot(view.gameId, name, devState.game);
    setSnapshots(listSnapshots(view.gameId));
    setSnapshotName("");
  }

  const inControl = disabled || busy;

  return (
    <>
      <button
        type="button"
        data-testid="dev-toggle"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="fixed bottom-2 left-2 z-[1000] cursor-pointer rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] font-bold tracking-wider text-[var(--color-text-muted)] opacity-70 hover:opacity-100"
      >
        DEV
      </button>
      {open && (
        <aside
          data-testid="dev-panel"
          className="fixed bottom-0 right-0 top-0 z-[1000] flex w-[22rem] max-w-full flex-col gap-2 overflow-y-auto border-l border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs text-[var(--color-text)] shadow-2xl"
        >
          <p
            data-testid="dev-result"
            className="min-h-4 break-words"
            style={{
              color:
                devResult && !devResult.ok ? "var(--color-destructive)" : "var(--color-text-muted)",
            }}
          >
            {devResult?.message ?? "Dev panel ready."}
            {devState?.milestone ? ` (${devState.milestone})` : ""}
          </p>

          {view.status === "lobby" && (
            <Section title="Lobby">
              <button
                type="button"
                data-testid="dev-add-bot"
                className={buttonClass}
                disabled={inControl}
                onClick={() => sendDev({ kind: "add-bot" })}
              >
                Add bot
              </button>
            </Section>
          )}

          <Section title="Autoplay">
            <div className="flex flex-wrap items-center gap-1.5">
              <select
                data-testid="dev-autoplay-scope"
                className={controlClass}
                value={scope}
                onChange={(e) => setScope(DevAutoplayScopeSchema.catch("bots").parse(e.target.value))}
              >
                <option value="bots">Bots</option>
                <option value="others">Everyone but me</option>
                <option value="everyone">Everyone (me too)</option>
              </select>
              <select
                data-testid="dev-autoplay-stop"
                className={controlClass}
                value={stopAtMilestone ? "milestone" : "decision"}
                onChange={(e) => setStopAtMilestone(e.target.value === "milestone")}
              >
                <option value="decision">My decision</option>
                <option value="milestone">End of camp</option>
              </select>
              <input
                data-testid="dev-autoplay-steps"
                type="number"
                min={1}
                className={`${controlClass} w-16`}
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
              />
              <button
                type="button"
                data-testid="dev-autoplay-run"
                className={buttonClass}
                disabled={inControl}
                onClick={() =>
                  sendDev({
                    kind: "autoplay",
                    scope,
                    maxSteps: Math.max(1, Math.floor(Number(steps)) || AUTOPLAY_DEFAULT_STEPS),
                    stopAtMilestone,
                  })
                }
              >
                Run
              </button>
            </div>
            <label className="flex items-center gap-1.5">
              <input
                data-testid="dev-bots-auto"
                type="checkbox"
                checked={botsAuto}
                onChange={(e) => setBotsAuto(e.target.checked)}
              />
              Bots act automatically
            </label>
          </Section>

          <Section title="Shortcuts">
            {groups.length === 0 && (
              <p className="text-[var(--color-text-muted)]">None for this game.</p>
            )}
            {groups.map(([group, shortcuts]) => (
              <div key={group} className="flex flex-col gap-1.5">
                <h4 className="font-semibold">{group}</h4>
                {shortcuts.map((shortcut) => (
                  <div key={shortcut.id} className="flex flex-wrap items-center gap-1.5">
                    {shortcut.fields.map((field) => {
                      const testId = `dev-field-${shortcut.id}-${field.name}`;
                      const set = (value: string) =>
                        setFieldValues((current) => ({
                          ...current,
                          [`${shortcut.id}:${field.name}`]: value,
                        }));
                      return (
                        <label key={field.name} className="flex items-center gap-1">
                          <span className="text-[var(--color-text-muted)]">{field.label}</span>
                          {field.kind === "choice" ? (
                            <select
                              data-testid={testId}
                              className={controlClass}
                              value={fieldValue(shortcut.id, field)}
                              onChange={(e) => set(e.target.value)}
                            >
                              {field.options.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {withSeatLabels(option.label, view.seats)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <input
                              data-testid={testId}
                              type={field.kind === "number" ? "number" : "text"}
                              min={field.kind === "number" ? field.min : undefined}
                              max={field.kind === "number" ? field.max : undefined}
                              className={`${controlClass} ${field.kind === "number" ? "w-16" : "w-28"}`}
                              value={fieldValue(shortcut.id, field)}
                              onChange={(e) => set(e.target.value)}
                            />
                          )}
                        </label>
                      );
                    })}
                    <button
                      type="button"
                      data-testid={`dev-shortcut-${shortcut.id}`}
                      className={buttonClass}
                      disabled={inControl}
                      onClick={() => runShortcut(shortcut)}
                    >
                      {shortcut.label}
                    </button>
                  </div>
                ))}
              </div>
            ))}
          </Section>

          <Section title="Reveal">
            <label className="flex items-center gap-1.5">
              <input
                data-testid="dev-reveal"
                type="checkbox"
                checked={reveal}
                onChange={(e) => setReveal(e.target.checked)}
              />
              Reveal all hands
            </label>
            {reveal && (
              <div data-testid="dev-inspect" className="flex flex-col gap-1.5">
                {(devState?.inspect ?? []).map((section) => (
                  <div key={section.title}>
                    <h4 className="font-semibold">{section.title}</h4>
                    <pre className="whitespace-pre-wrap break-words text-[11px] text-[var(--color-text-muted)]">
                      {withSeatLabels(section.lines.join("\n"), view.seats)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="State">
            <textarea
              data-testid="dev-state-json"
              spellCheck={false}
              className={`${controlClass} h-48 w-full font-mono text-[11px]`}
              value={json}
              onChange={(e) => {
                setJson(e.target.value);
                setJsonEdited(true);
              }}
            />
            {jsonError && (
              <p role="alert" className="break-words" style={{ color: "var(--color-destructive)" }}>
                Not valid JSON: {jsonError}
              </p>
            )}
            <div className="flex gap-1.5">
              <button
                type="button"
                data-testid="dev-apply-state"
                className={buttonClass}
                disabled={inControl}
                onClick={applyJson}
              >
                Apply
              </button>
              <button
                type="button"
                className={buttonClass}
                disabled={!devState}
                onClick={() => {
                  setJsonEdited(false);
                  setJsonError(null);
                  setJson(devState ? JSON.stringify(devState.game, null, 2) : "");
                }}
              >
                Reload
              </button>
            </div>
          </Section>

          <Section title="Snapshots">
            <div className="flex gap-1.5">
              <input
                data-testid="dev-snapshot-name"
                className={`${controlClass} min-w-0 flex-1`}
                placeholder="Snapshot name"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
              />
              <button
                type="button"
                data-testid="dev-snapshot-save"
                className={buttonClass}
                disabled={!devState || snapshotName.trim() === ""}
                onClick={saveCurrent}
              >
                Save
              </button>
            </div>
            <ul data-testid="dev-snapshot-list" className="flex flex-col gap-1">
              {snapshots.map((snapshot) => (
                <li key={snapshot.name} className="flex items-center gap-1.5">
                  <span className="min-w-0 flex-1 truncate">{snapshot.name}</span>
                  <button
                    type="button"
                    className={buttonClass}
                    disabled={inControl}
                    onClick={() => sendDev({ kind: "load-state", state: snapshot.state })}
                  >
                    Load
                  </button>
                  <button
                    type="button"
                    className={buttonClass}
                    onClick={() => {
                      removeSnapshot(view.gameId, snapshot.name);
                      setSnapshots(listSnapshots(view.gameId));
                    }}
                  >
                    Delete
                  </button>
                </li>
              ))}
            </ul>
          </Section>
        </aside>
      )}
    </>
  );
}
