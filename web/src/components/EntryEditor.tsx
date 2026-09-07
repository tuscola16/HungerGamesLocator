import { useState } from 'react';
import { deleteField } from 'firebase/firestore';
import {
  addRunbookEntry, updateRunbookEntry, deleteRunbookEntry, fireRunbookEntry,
} from '@/services/gameService';
import { KIND_META, KIND_ORDER, TRIGGER_META, ordinalLabel } from '@/services/checkpointKinds';
import { friendlyError } from '@/services/errorUtils';
import type {
  RunbookEntry, RunbookEffect, RunbookTriggerType, CheckpointKind, NotifyAudience, TimedBound,
  RunbookRevealScope,
} from '@shared/types';

// The runbook entry editor (ROADMAP #60/#80), extracted from RunbookScreen so it can be
// mounted from two places: the full-page runbook, and the checkpoint modal opened by
// clicking a marker on the game map — authoring an entry without leaving the map.

const labelStyle = { fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.5 } as const;

/**
 * #97: a trap-kit code, from the same alphabet as the game join codes — no 0/O/1/I/L,
 * because it gets hand-written on a card and read in the dark.
 *
 * Generated with `crypto.getRandomValues` rather than `Math.random`: this is a secret
 * from the *players*, and the whole mechanic depends on a player not being able to arm a
 * trap they never found. Collisions inside one game are astronomically unlikely at 32^6,
 * and `armPlayerTrap` resolves by exact match, so a collision would at worst let one card
 * arm the wrong pre-set trap.
 */
const KIT_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function generateKitCode(): string {
  const bytes = new Uint32Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => KIT_ALPHABET[b % KIT_ALPHABET.length]).join('');
}

// --- Effect editor ---

function cleanEffect(e: RunbookEffect): RunbookEffect {
  const out: RunbookEffect = { kind: e.kind };
  if (e.kind !== 'gm-notify' && e.message?.trim()) out.message = e.message.trim();
  if (e.kind === 'notify' && e.audience === 'all-players') out.audience = 'all-players';
  return out;
}

function KindChips({ value, onChange }: { value: CheckpointKind; onChange: (k: CheckpointKind) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {KIND_ORDER.map((k) => {
        const meta = KIND_META[k];
        const active = k === value;
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: `1px solid ${active ? meta.color : 'var(--border)'}`, background: active ? `${meta.color}26` : 'transparent', color: active ? meta.color : 'var(--text-secondary)' }}>
            <span>{meta.emoji}</span>{meta.label}
          </button>
        );
      })}
    </div>
  );
}

function AudienceToggle({ value, onChange }: { value: NotifyAudience; onChange: (a: NotifyAudience) => void }) {
  return (
    <div style={{ display: 'flex', gap: 8 }}>
      {([{ v: 'crossing-player', label: 'Crossing player' }, { v: 'all-players', label: 'All players' }] as { v: NotifyAudience; label: string }[]).map((o) => (
        <button key={o.v} type="button" className={value === o.v ? 'btn' : 'btn btn--ghost'} style={{ flex: 1, padding: '8px 12px' }} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

function EffectEditor({ value, onChange }: { value: RunbookEffect; onChange: (e: RunbookEffect) => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <KindChips value={value.kind} onChange={(k) => onChange({ ...value, kind: k })} />
      {value.kind !== 'gm-notify' && (
        <textarea className="input" rows={2} value={value.message ?? ''} onChange={(e) => onChange({ ...value, message: e.target.value })} placeholder={KIND_META[value.kind].placeholder} style={{ resize: 'vertical' }} />
      )}
      {value.kind === 'notify' && (
        <AudienceToggle value={value.audience ?? 'crossing-player'} onChange={(a) => onChange({ ...value, audience: a })} />
      )}
      {value.kind === 'gm-notify' && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Only you (the GM) are alerted. The player sees nothing.</span>}
    </div>
  );
}

// --- Entry editor ---

/** #80: reveal-on-fire options, in authoring order. */
const REVEAL_SCOPES: { v: RunbookRevealScope; label: string; emoji: string }[] = [
  { v: 'none', label: 'Stays hidden', emoji: '🙈' },
  { v: 'triggerer', label: 'The player who trips it', emoji: '🧭' },
  { v: 'targeted', label: 'The targeted players', emoji: '🎯' },
  { v: 'all', label: 'Everyone', emoji: '🌐' },
];

function revealScopeHint(scope: RunbookRevealScope, targeted: boolean): string {
  switch (scope) {
    case 'triggerer':
      return 'When this entry fires, the checkpoint appears on that player’s map — name and location only — and stays there for the rest of the game.';
    case 'targeted':
      return targeted
        ? 'When this entry fires, the checkpoint appears on every targeted player’s map for the rest of the game.'
        : 'This entry isn’t targeted, so this reveals to whoever trips it.';
    case 'all':
      return 'When this entry fires, the checkpoint appears on every player’s map for the rest of the game.';
    default:
      return 'Firing this entry doesn’t put the checkpoint on anyone’s map.';
  }
}

export function EntryEditor({
  gameId, entry, newCheckpointId, checkpoints, players, onSaved, onDeleted, showHeading = true,
  onOpenScheduled,
}: {
  gameId: string;
  entry: RunbookEntry | null;
  newCheckpointId: string | null;
  checkpoints: { id: string; name: string }[];
  players: { userId: string; displayName: string }[];
  onSaved: (id: string) => void;
  onDeleted: () => void;
  /** Off when the surrounding shell already names the entry (the checkpoint modal). */
  showHeading?: boolean;
  /** Opens the run sheet's Scheduled-announcements modal. Supplied by the Runbook screen;
   * omitted where no such modal is in reach (the checkpoint modal), which falls back to
   * telling the GM where to find it. */
  onOpenScheduled?: () => void;
}) {
  const [checkpointId, setCheckpointId] = useState(entry?.checkpointId ?? newCheckpointId ?? checkpoints[0]?.id ?? '');
  const [name, setName] = useState(entry?.name ?? '');
  const [priority, setPriority] = useState(String(entry?.priority ?? 0));
  const [trigger, setTrigger] = useState<RunbookTriggerType>(entry?.trigger ?? 'always-on');
  const [effect, setEffect] = useState<RunbookEffect>(entry?.effect ?? { kind: 'gm-notify' });
  const [slots, setSlots] = useState<(RunbookEffect | null)[]>(entry?.queueSlots ?? []);
  const [defaultNone, setDefaultNone] = useState(entry?.defaultNone ?? false);
  const [startAt, setStartAt] = useState<TimedBound>(entry?.startAt ?? { kind: 'game-start' });
  const [endAt, setEndAt] = useState<TimedBound>(entry?.endAt ?? { kind: 'game-end' });
  // #80: player targeting + reveal-on-fire.
  // #96: an entry can be targeted with nobody assigned yet, so the flag is the source of
  // truth and the list length is only the legacy fallback for entries saved before it.
  const [targeted, setTargeted] = useState(
    entry?.targeted === true || (entry?.playerIds ?? []).length > 0
  );
  const [playerIds, setPlayerIds] = useState<string[]>(entry?.playerIds ?? []);
  const [revealOnFire, setRevealOnFire] = useState<RunbookRevealScope>(entry?.revealOnFire ?? 'none');
  // #97: player-armed trap kit. The code is printed on a physical card; a player who finds
  // it arms this trap where they choose, and picks who is spared. Everything else stays the
  // GM's — the effect, the text, the victim cap, and whether springing it reveals the site.
  const [trapKitCode, setTrapKitCode] = useState<string | null>(entry?.trapKitCode ?? null);
  const [maxVictims, setMaxVictims] = useState(String(entry?.maxVictims ?? 1));
  const isKit = !!trapKitCode;
  const armed = !!entry?.armedAt;
  const [busy, setBusy] = useState(false);
  const togglePlayer = (id: string) =>
    setPlayerIds((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));

  // GM-prompted fire
  const [fireTargets, setFireTargets] = useState<string[]>([]);
  const toggleFire = (id: string) => setFireTargets((r) => (r.includes(id) ? r.filter((x) => x !== id) : [...r, id]));
  // #80: firing can only narrow a targeted entry's audience, so offer just those players.
  // Read from the *saved* entry — unsaved target edits aren't what the server will resolve.
  const savedTargets = entry?.playerIds ?? [];
  const fireCandidates = savedTargets.length > 0
    ? players.filter((p) => savedTargets.includes(p.userId))
    : players;

  async function save() {
    if (!checkpointId) { window.alert('Pick a checkpoint.'); return; }
    if (!name.trim()) { window.alert('Name this runbook entry.'); return; }
    const prio = Math.round(Number(priority) || 0);

    // #96: the "pick at least one player" guard is GONE. It existed only because the server
    // read an empty `playerIds` as "anyone", so an unassigned targeted entry would have
    // fired for the whole field — which pushed all targeted authoring into the minutes
    // before Start. The semantics were fixed instead of the dialog: `targeted: true` with an
    // empty list is now an explicit INERT state that crossing resolution skips entirely, so
    // an entry can be written during setup and assigned later, including during play.

    const base: Record<string, unknown> = {
      checkpointId,
      name: name.trim(),
      priority: prio,
      trigger,
      effect: cleanEffect(effect),
      // #80: who may trip it, and whether firing puts the checkpoint on their map.
      // #96: `targeted` carries the intent even while the list is empty.
      targeted,
      playerIds: targeted ? playerIds : null,
      revealOnFire,
    };
    // #97: an UNARMED kit is inert and unplaced — it has no site until a player stands
    // somewhere and enters the code, and it must not fire in the meantime. `armPlayerTrap`
    // stamps the site and clears `targeted` when it deploys, so this only ever describes
    // the pre-deployment state; an already-armed kit's placement is left alone.
    if (isKit) {
      base.trapKitCode = trapKitCode;
      base.maxVictims = Math.max(1, Math.round(Number(maxVictims) || 1));
      if (!armed) {
        base.targeted = true;
        base.playerIds = [];
        // Same shape as the other trigger-specific clears above: drop the key on an update,
        // omit it on a create (the create path filters `undefined` out). `deleteField()`
        // cannot be used with a non-merging write.
        base.checkpointId = entry ? deleteField() : undefined;
      }
    } else if (entry?.trapKitCode) {
      base.trapKitCode = deleteField();
      base.maxVictims = deleteField();
    }
    // Trigger-specific fields (set the relevant ones; clear the rest on update).
    if (trigger === 'fixed-order') {
      base.queueSlots = slots.map((s) => (s ? cleanEffect(s) : null));
      base.defaultNone = defaultNone;
    } else {
      base.queueSlots = entry ? deleteField() : undefined;
      base.defaultNone = entry ? deleteField() : undefined;
    }
    if (trigger === 'timed') {
      base.startAt = cleanBound(startAt);
      base.endAt = cleanBound(endAt);
    } else {
      base.startAt = entry ? deleteField() : undefined;
      base.endAt = entry ? deleteField() : undefined;
    }

    setBusy(true);
    try {
      if (entry) {
        await updateRunbookEntry(gameId, entry.id, base);
        onSaved(entry.id);
      } else {
        const cleaned = Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined));
        const id = await addRunbookEntry(gameId, cleaned as unknown as Omit<RunbookEntry, 'id' | 'createdAt'>);
        onSaved(id);
      }
    } catch (err) { window.alert(friendlyError(err)); }
    finally { setBusy(false); }
  }

  /**
   * #97: disarm a trap a player set, and re-issue a fresh code so the spent card can be
   * replaced. Clearing `armedBy`/`armedAt` alone would leave the old code valid and the
   * trap live at the site the player picked, so this puts the kit fully back on the shelf:
   * unplaced, inert (#96), with no exclusions and a new code.
   */
  async function disarm() {
    if (!entry) return;
    if (!window.confirm(
      `Disarm the trap ${entry.armedByName ?? 'a player'} set?\n\nIt stops being live, and the kit gets a new code — the old card is dead. Print the new one before you put it back out.`
    )) return;
    const next = generateKitCode();
    setBusy(true);
    try {
      await updateRunbookEntry(gameId, entry.id, {
        trapKitCode: next,
        armedBy: null,
        armedByName: null,
        armedAt: null,
        excludePlayerIds: null,
        checkpointId: deleteField(),
        targeted: true,
        playerIds: [],
      } as unknown as Partial<RunbookEntry>);
      setTrapKitCode(next);
    } catch (err) { window.alert(friendlyError(err)); }
    finally { setBusy(false); }
  }

  async function remove() {
    if (!entry) { onDeleted(); return; }
    if (!window.confirm(`Delete "${entry.name}"?`)) return;
    setBusy(true);
    try { await deleteRunbookEntry(gameId, entry.id); onDeleted(); }
    catch (err) { window.alert(friendlyError(err)); setBusy(false); }
  }

  async function fire() {
    if (!entry) return;
    setBusy(true);
    try {
      await fireRunbookEntry(gameId, entry.id, fireTargets.length > 0 ? fireTargets : undefined);
      window.alert(`Fired “${entry.name}” to ${fireTargets.length > 0 ? `${fireTargets.length} player(s)` : 'all players'}.`);
    } catch (err) { window.alert(friendlyError(err)); }
    finally { setBusy(false); }
  }

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
      {showHeading && <h2 style={{ margin: 0 }}>{entry ? 'Edit entry' : 'New entry'}</h2>}

      <div className="field">
        <label>Checkpoint</label>
        <select className="input" value={checkpointId} onChange={(e) => setCheckpointId(e.target.value)}>
          {checkpoints.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 12 }}>
        <div className="field" style={{ flex: 1 }}>
          <label>Name</label>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sponsor drop" />
        </div>
        <div className="field" style={{ width: 110 }}>
          <label>Priority</label>
          <input className="input" type="number" value={priority} onChange={(e) => setPriority(e.target.value)} />
        </div>
      </div>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -8 }}>
        On a crossing, the highest-priority matching entry wins.
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={labelStyle}>Trigger</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {(['fixed-order', 'always-on', 'timed', 'gm-prompted'] as RunbookTriggerType[]).map((t) => (
            <button key={t} type="button" className={trigger === t ? 'btn' : 'btn btn--ghost'} style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setTrigger(t)}>
              {TRIGGER_META[t].emoji} {TRIGGER_META[t].label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{TRIGGER_META[trigger].hint}</span>
        {trigger === 'timed' && (
          // The 2026-09-06 field test authored three "timed" traps expecting clock-fired
          // announcements; two never fired because nobody stood on the checkpoint inside the
          // window. Point at the tool that actually does that, from where the GM already is.
          <div style={{
            fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', background: 'var(--surface-elevated)',
            border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px',
          }}>
            Want this to reach <strong>everyone at a set time</strong>, with no checkpoint involved?
            That’s a scheduled announcement, not a runbook entry.{' '}
            {onOpenScheduled ? (
              <button
                type="button"
                onClick={onOpenScheduled}
                style={{
                  background: 'none', border: 'none', padding: 0, font: 'inherit',
                  color: 'var(--primary)', textDecoration: 'underline', cursor: 'pointer',
                }}
              >
                Open ⏰ Scheduled
              </button>
            ) : (
              <>Open the Runbook screen and use <strong>⏰ Scheduled</strong>.</>
            )}
          </div>
        )}
      </div>

      {/* Who can trip it (#80) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={labelStyle}>Who can trip it</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className={!targeted ? 'btn' : 'btn btn--ghost'} style={{ flex: 1, padding: '8px 12px' }} onClick={() => setTargeted(false)}>Any player</button>
          <button type="button" className={targeted ? 'btn' : 'btn btn--ghost'} style={{ flex: 1, padding: '8px 12px' }} onClick={() => setTargeted(true)}>Specific players</button>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {trigger === 'gm-prompted'
            ? targeted
              ? 'Firing this entry reaches these players by default.'
              : 'Firing this entry reaches every living player by default.'
            : targeted
              ? 'Only these players trip it on a crossing. Anyone else falls through to the next entry.'
              : 'Anyone who crosses the checkpoint can trip it.'}
        </span>
        {targeted && (
          players.length === 0 ? (
            // #96: this is now a normal, saveable state rather than a dead end. Say what it
            // means, because "inert" is the whole point: the entry exists and fires for
            // nobody until someone is assigned to it.
            <span style={{ fontSize: 12, color: 'var(--warning, #D4893F)' }}>
              No players have joined yet — save it anyway. Until you assign someone it stays
              inert and fires for nobody, and you can assign them any time, including mid-game.
            </span>
          ) : (
            <>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {players.map((p) => (
                  <label key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={playerIds.includes(p.userId)} onChange={() => togglePlayer(p.userId)} />
                    <span>{p.displayName}</span>
                  </label>
                ))}
              </div>
              {playerIds.length === 0 && (
                <span style={{ fontSize: 12, color: 'var(--warning, #D4893F)' }}>
                  Nobody assigned — this entry is inert and fires for nobody until you pick someone.
                </span>
              )}
            </>
          )
        )}
      </div>

      {/* #97: player-armed trap kit. */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={labelStyle}>Player-armed trap kit</span>
        {!isKit ? (
          <>
            <button
              type="button"
              className="btn btn--ghost"
              style={{ padding: '6px 12px', fontSize: 13, alignSelf: 'flex-start' }}
              onClick={() => setTrapKitCode(generateKitCode())}
            >
              🪤 Make this a trap kit
            </button>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Prints a code you put on a physical card. A player who finds the card arms
              this trap where they choose, and picks who is spared — you keep the effect,
              the text, and everything below. They never learn if it fires, or on whom.
            </span>
          </>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <code style={{
                fontSize: 22, fontWeight: 800, letterSpacing: 5, padding: '6px 14px',
                borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card)',
              }}>
                {trapKitCode}
              </code>
              {!armed && (
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: '6px 12px', fontSize: 13 }}
                  onClick={() => setTrapKitCode(null)}
                >
                  Not a kit
                </button>
              )}
            </div>
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              Write this on the card. Single-use — once someone arms it, that code is spent.
              The number of traps in play is however many cards you actually put out.
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <span>Can catch</span>
              <input
                className="input"
                type="number"
                min={1}
                style={{ width: 70, padding: '4px 8px' }}
                value={maxVictims}
                onChange={(e) => setMaxVictims(e.target.value)}
              />
              <span>player(s), all arriving within 15 seconds of the first.</span>
            </label>
            {armed && (
              // #97: the GM must be able to see and undo what players armed. This is the
              // first feature where one player's action changes what another player runs
              // into, so it is deliberately visible and reversible.
              <div
                className="card"
                style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 8 }}
              >
                <strong style={{ fontSize: 13 }}>
                  🪤 Armed by {entry?.armedByName ?? 'a player'}
                  {entry?.armedAt ? ` · ${entry.armedAt.toDate().toLocaleTimeString()}` : ''}
                </strong>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {(entry?.excludePlayerIds?.length ?? 0) > 0
                    ? `Sparing ${entry!.excludePlayerIds!.length} player(s) — plus the armer, always.`
                    : 'Sparing nobody but the armer.'}
                  {' '}Site: {checkpoints.find((c) => c.id === entry?.checkpointId)?.name ?? 'unknown'}.
                </span>
                <button
                  type="button"
                  className="btn btn--ghost"
                  style={{ padding: '6px 12px', fontSize: 13, alignSelf: 'flex-start', color: 'var(--danger)' }}
                  onClick={disarm}
                  disabled={busy}
                >
                  Disarm and re-issue the code
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Reveal the checkpoint when it fires (#80) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={labelStyle}>Reveal the checkpoint</span>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {REVEAL_SCOPES.map((o) => (
            <button key={o.v} type="button" className={revealOnFire === o.v ? 'btn' : 'btn btn--ghost'} style={{ padding: '6px 12px', fontSize: 13 }} onClick={() => setRevealOnFire(o.v)}>
              {o.emoji} {o.label}
            </button>
          ))}
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {revealScopeHint(revealOnFire, targeted)}
        </span>
      </div>

      {/* Effect (the default for fixed-order) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={labelStyle}>{trigger === 'fixed-order' ? 'Default effect' : 'Effect'}</span>
        {trigger === 'fixed-order' && (
          <>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: -4 }}>
              Fires for arrivers past the slots below, and for anyone who revisits.
            </span>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={defaultNone} onChange={(e) => setDefaultNone(e.target.checked)} />
              Nothing fires by default
            </label>
          </>
        )}
        {!(trigger === 'fixed-order' && defaultNone) && (
          <EffectEditor value={effect} onChange={setEffect} />
        )}
      </div>

      {/* Trigger-specific */}
      {trigger === 'fixed-order' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={labelStyle}>Per-arrival slots</span>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            The Nth arriver gets their slot; unlisted arrivers get the default effect above.
          </span>
          {slots.map((slot, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: 13 }}>{ordinalLabel(i)}</strong>
                <button type="button" onClick={() => setSlots((s) => s.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 18 }}>✕</button>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input type="checkbox" checked={slot == null} onChange={(e) => setSlots((s) => s.map((x, idx) => (idx === i ? (e.target.checked ? null : { kind: 'gm-notify' }) : x)))} />
                Nothing fires for this arriver
              </label>
              {slot != null && (
                <EffectEditor value={slot} onChange={(eff) => setSlots((s) => s.map((x, idx) => (idx === i ? eff : x)))} />
              )}
            </div>
          ))}
          <button type="button" className="btn btn--ghost" onClick={() => setSlots((s) => [...s, { kind: 'hazard' }])}>+ Add slot</button>
        </div>
      )}

      {trigger === 'timed' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <BoundEditor label="Starts" value={startAt} onChange={setStartAt} anchorLabel="Game start" anchorKind="game-start" />
          <BoundEditor label="Ends" value={endAt} onChange={setEndAt} anchorLabel="Game end" anchorKind="game-end" />
        </div>
      )}

      {trigger === 'gm-prompted' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--border)', borderRadius: 10, padding: 12 }}>
          <span style={labelStyle}>Fire now</span>
          {effect.kind === 'gm-notify' && (
            // #74: a gm-notify effect is GM-only by design, so firing it shows the player
            // nothing — the #1 reason a "GM-prompted message didn't reach the player".
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--danger)' }}>
              ⚠ This effect is “GM only” — players see nothing when you fire it. Pick Hazard,
              Boon, or Message above to reach the player.
            </span>
          )}
          {!entry ? (
            <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Save the entry first, then fire it from here.</span>
          ) : (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {/* #80: a targeted entry already has a recipient set — picking here narrows it. */}
                {savedTargets.length > 0
                  ? 'Leave all unchecked to send to this entry’s targeted players.'
                  : 'Leave all unchecked to send to every living player.'}
              </span>
              {fireCandidates.length === 0 ? (
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>No players have joined yet.</span>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {fireCandidates.map((p) => (
                    <label key={p.userId} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                      <input type="checkbox" checked={fireTargets.includes(p.userId)} onChange={() => toggleFire(p.userId)} />
                      <span>{p.displayName}</span>
                    </label>
                  ))}
                </div>
              )}
              <button type="button" className="btn btn--secondary" onClick={fire} disabled={busy}>⚡ Fire entry</button>
            </>
          )}
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
        <button className="btn btn--ghost" style={{ flex: 1 }} onClick={onDeleted}>Cancel</button>
        <button className="btn" style={{ flex: 1 }} onClick={save} disabled={busy}>Save entry</button>
      </div>
      {entry && <button className="btn btn--danger" onClick={remove} disabled={busy}>Delete entry</button>}
    </div>
  );
}

function cleanBound(b: TimedBound): TimedBound {
  if (b.kind === 'time') return { kind: 'time', atMinute: Math.max(0, Math.round(b.atMinute ?? 0)) };
  return { kind: b.kind };
}

function BoundEditor({
  label, value, onChange, anchorLabel, anchorKind,
}: {
  label: string;
  value: TimedBound;
  onChange: (b: TimedBound) => void;
  anchorLabel: string;
  anchorKind: 'game-start' | 'game-end';
}) {
  const isTime = value.kind === 'time';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={labelStyle}>{label}</span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button type="button" className={!isTime ? 'btn' : 'btn btn--ghost'} style={{ padding: '8px 12px' }} onClick={() => onChange({ kind: anchorKind })}>{anchorLabel}</button>
        <button type="button" className={isTime ? 'btn' : 'btn btn--ghost'} style={{ padding: '8px 12px' }} onClick={() => onChange({ kind: 'time', atMinute: isTime ? value.atMinute : 0 })}>At minute</button>
        {isTime && (
          <input className="input" type="number" style={{ width: 100 }} value={value.atMinute ?? 0} onChange={(e) => onChange({ kind: 'time', atMinute: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
        )}
        {isTime && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>min after start</span>}
      </div>
    </div>
  );
}
