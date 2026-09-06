import type {
  CheckpointKind, CheckpointVisibility, RunbookEntry, RunbookTriggerType,
} from '@shared/types';

/**
 * Per-kind presentation for runbook effects (ROADMAP #60), mirroring the mobile
 * KIND_META. Colors are the web COLORS palette.
 */
export const KIND_META: Record<
  CheckpointKind,
  { label: string; emoji: string; color: string; placeholder: string }
> = {
  hazard: {
    label: 'Hazard', emoji: '⚠️', color: '#e8402a',
    placeholder: 'e.g. A beast attacks! Defend or flee.',
  },
  boon: {
    label: 'Boon', emoji: '✨', color: '#6b8f5e',
    placeholder: 'e.g. You found a hidden cache. Claim it.',
  },
  notify: {
    label: 'Notify', emoji: '📢', color: '#4fc3f7',
    placeholder: 'e.g. The storm is closing in — head for high ground.',
  },
  'gm-notify': {
    label: 'GM only', emoji: '📍', color: '#999999',
    placeholder: '',
  },
};

export const KIND_ORDER: CheckpointKind[] = ['hazard', 'boon', 'notify', 'gm-notify'];

/** The representative kind for a checkpoint's map-pin color: the highest-priority entry's
 * effect kind, else `gm-notify` when it has no runbook entries (#60). */
export function checkpointKind(entries: RunbookEntry[]): CheckpointKind {
  if (!entries || entries.length === 0) return 'gm-notify';
  const top = [...entries].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  return top.effect?.kind ?? 'gm-notify';
}

/** Player-visibility presentation (#60), mirroring the mobile checkpoint editor. */
export const VIS_META: Record<CheckpointVisibility, { label: string; emoji: string; hint: string }> = {
  hidden: { label: 'Hidden', emoji: '🙈', hint: 'Only you see it. Players never see this checkpoint.' },
  shown: { label: 'Always shown', emoji: '📍', hint: 'Players see this location from the start — but not what it does until they cross it.' },
  'shown-on-trigger': { label: 'Reveal later', emoji: '⏱️', hint: 'Hidden until a reveal trigger fires (trap, timed/triggered drop, or sponsor drop).' },
};

export const VIS_ORDER: CheckpointVisibility[] = ['hidden', 'shown', 'shown-on-trigger'];

/** Runbook trigger presentation (#60).
 *
 * `hint` exists because every trigger here is **crossing-gated** — a runbook entry only
 * ever fires when a player is at its checkpoint. "Timed" was read as "fires at this time"
 * in the 2026-09-06 field test and silently did nothing, so the label says *window* and the
 * hint says the quiet part out loud. Clock-fired, checkpoint-less messages are the run
 * sheet's job (Scheduled announcements), not the runbook's. */
export const TRIGGER_META: Record<RunbookTriggerType, { label: string; emoji: string; hint: string }> = {
  'fixed-order': {
    label: 'Fixed order', emoji: '🔢',
    hint: 'Fires on a crossing, picking its effect by the arriver’s place in line (1st, 2nd, …).',
  },
  'always-on': {
    label: 'Always on', emoji: '♾️',
    hint: 'Fires on every crossing, for the whole game.',
  },
  timed: {
    label: 'Time window', emoji: '⏱️',
    hint: 'Only gates a crossing — it never fires on its own. A player has to reach the checkpoint while the window is open, or nothing happens at all.',
  },
  'gm-prompted': {
    label: 'GM prompted', emoji: '✋',
    hint: 'Never fires on a crossing. You fire it by hand and choose who it reaches.',
  },
};

export const TRIGGER_ORDER: RunbookTriggerType[] = ['fixed-order', 'always-on', 'timed', 'gm-prompted'];

/** One-line summary of a checkpoint's runbook (#60). */
export function behaviorSummary(entries: RunbookEntry[]): string {
  if (!entries || entries.length === 0) return 'No behavior yet';
  if (entries.length === 1) return KIND_META[entries[0].effect?.kind ?? 'gm-notify'].label;
  return `${entries.length} runbook entries`;
}

/** Emoji map for the icon picker. Keys match mobile CHECKPOINT_ICONS[].key. */
export const CHECKPOINT_ICON_EMOJIS: Record<string, string> = {
  flag: '🚩', pin: '📍', skull: '💀', cache: '🎁', water: '💧',
  fire: '🔥', forest: '🌿', mountain: '⛰️', base: '🏠', trophy: '🏆',
  medic: '🩺', star: '⭐',
};

export const DEFAULT_CHECKPOINT_ICON = 'flag';

export function checkpointIconEmoji(key?: string): string {
  return CHECKPOINT_ICON_EMOJIS[key ?? ''] ?? '📍';
}

export function ordinalLabel(i: number): string {
  const n = i + 1;
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix} arriver`;
}
