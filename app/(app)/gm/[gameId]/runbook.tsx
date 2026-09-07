import { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useGame } from '@/context/GameContext';
import { Colors } from '@/constants/colors';
import { KIND_META, KIND_ORDER, TRIGGER_META, hexToRgba } from '@/components/checkpointForm';
import { isInertEntry } from '@/common/runbook';
import type { CheckpointKind, RunbookEntry, RunbookTriggerType } from '@/types';

/**
 * Read-only runbook for GMs working from a phone (ROADMAP #98b).
 *
 * Authoring stays on the web dashboard — this is the field view: 1–2 GMs run the game from
 * phones alongside one laptop, and "what happens at *this* site?" is a question they have
 * to answer standing in a wood, not at a desk. Filters mirror the web sidebar (#98a):
 * checkpoint, effect kind, trigger.
 *
 * Deliberately additive — it reads `runbookEntries`/`checkpoints` straight off GameContext
 * and writes nothing, so it cannot affect any existing screen.
 */

const TRIGGER_ORDER: RunbookTriggerType[] = ['fixed-order', 'always-on', 'timed', 'gm-prompted'];

/** Sort key for a timed entry's start, in minutes after game start (game-start = 0). */
function startMinutes(e: RunbookEntry): number {
  const b = e.startAt;
  if (!b || b.kind === 'game-start') return 0;
  if (b.kind === 'game-end') return Number.POSITIVE_INFINITY;
  return b.atMinute ?? 0;
}

function timedLabel(e: RunbookEntry): string {
  const lbl = (b: RunbookEntry['startAt'], fallback: string) => {
    if (!b) return fallback;
    if (b.kind === 'game-start') return 'start';
    if (b.kind === 'game-end') return 'end';
    return `+${b.atMinute ?? 0}m`;
  };
  return `${lbl(e.startAt, 'start')} → ${lbl(e.endAt, 'end')}`;
}

export default function RunbookScreen() {
  const { gameId } = useLocalSearchParams<{ gameId: string }>();
  const { checkpoints, runbookEntries, loadGame } = useGame();
  const router = useRouter();

  useEffect(() => {
    if (gameId) loadGame(gameId, 'gm');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // #98b: an empty set means "no constraint on this axis", not "match nothing". Not
  // persisted — the filters reset with every visit, same as the web sidebar.
  const [cpFilter, setCpFilter] = useState<string>('all');
  const [kindFilter, setKindFilter] = useState<Set<CheckpointKind>>(() => new Set());
  const [triggerFilter, setTriggerFilter] = useState<Set<RunbookTriggerType>>(() => new Set());
  const filtersActive = cpFilter !== 'all' || kindFilter.size > 0 || triggerFilter.size > 0;

  function clearFilters() {
    setCpFilter('all');
    setKindFilter(new Set());
    setTriggerFilter(new Set());
  }

  /** Sets live in state, so never mutate — swap in a fresh one. */
  function toggled<T>(set: Set<T>, v: T): Set<T> {
    const next = new Set(set);
    if (next.has(v)) next.delete(v); else next.add(v);
    return next;
  }

  // #97: an unarmed trap kit has no site yet — the arming player chooses it by standing
  // there. Say so, rather than showing it as a broken reference to a missing checkpoint.
  const cpName = (id: string | undefined) =>
    !id ? 'Not placed yet' : checkpoints.find((c) => c.id === id)?.name ?? 'Unknown checkpoint';

  const visible = useMemo(() => {
    const byPriority = (a: RunbookEntry, b: RunbookEntry) => (b.priority ?? 0) - (a.priority ?? 0);
    return runbookEntries
      .filter((e) =>
        (cpFilter === 'all' || e.checkpointId === cpFilter)
        && (kindFilter.size === 0 || kindFilter.has(e.effect?.kind ?? 'gm-notify'))
        && (triggerFilter.size === 0 || triggerFilter.has(e.trigger))
      )
      // Highest priority first — the one that actually fires on a crossing sits at the top,
      // which is the order a GM reasons in. Timed entries then read chronologically.
      .sort((a, b) => byPriority(a, b) || startMinutes(a) - startMinutes(b));
  }, [runbookEntries, cpFilter, kindFilter, triggerFilter]);

  function renderEntry({ item }: { item: RunbookEntry }) {
    const kind = item.effect?.kind ?? 'gm-notify';
    const meta = KIND_META[kind];
    const trig = TRIGGER_META[item.trigger];
    const targeted = (item.playerIds?.length ?? 0) > 0;
    // #96: an entry authored during setup can be targeted with nobody assigned yet. That is
    // the opposite outcome from "targeted at N players" — it fires for nobody — so it gets
    // its own chip rather than silently reading as untargeted.
    const inert = isInertEntry(item);
    return (
      <View style={[styles.entry, { borderLeftColor: meta.color }]}>
        <View style={styles.entryTop}>
          <View style={[styles.kindChip, { backgroundColor: hexToRgba(meta.color, 0.16) }]}>
            <Ionicons name={meta.icon} size={13} color={meta.color} />
            <Text style={[styles.kindChipText, { color: meta.color }]}>{meta.label}</Text>
          </View>
          <Text style={styles.priority}>P{item.priority ?? 0}</Text>
        </View>

        <Text style={styles.entryName}>{item.name || '(unnamed)'}</Text>
        <Text style={styles.entryCp}>{cpName(item.checkpointId)}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name={trig.icon} size={12} color={Colors.textSecondary} />
            <Text style={styles.metaChipText}>{trig.label}</Text>
          </View>
          {item.trigger === 'timed' && (
            <View style={styles.metaChip}>
              <Ionicons name="time-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.metaChipText}>{timedLabel(item)}</Text>
            </View>
          )}
          {inert ? (
            <View style={styles.metaChip}>
              <Ionicons name="person-add-outline" size={12} color={Colors.warning} />
              <Text style={[styles.metaChipText, { color: Colors.warning }]}>Needs players</Text>
            </View>
          ) : targeted ? (
            <View style={styles.metaChip}>
              <Ionicons name="person-outline" size={12} color={Colors.secondary} />
              <Text style={[styles.metaChipText, { color: Colors.secondary }]}>
                {item.playerIds!.length} player{item.playerIds!.length !== 1 ? 's' : ''}
              </Text>
            </View>
          ) : null}
          {/* #97: a trap kit reads differently depending on whether a player has deployed
              it yet. Unarmed shows the code, because a GM working from a phone in the field
              is often the person writing it on the card. */}
          {item.trapKitCode && (
            <View style={styles.metaChip}>
              <Ionicons
                name={item.armedAt ? 'flash' : 'card-outline'}
                size={12}
                color={item.armedAt ? Colors.danger : Colors.textSecondary}
              />
              <Text style={[styles.metaChipText, item.armedAt ? { color: Colors.danger } : null]}>
                {item.armedAt
                  ? `Armed by ${item.armedByName ?? 'a player'}`
                  : `Kit ${item.trapKitCode}`}
              </Text>
            </View>
          )}
          {item.revealOnFire && item.revealOnFire !== 'none' && (
            <View style={styles.metaChip}>
              <Ionicons name="eye-outline" size={12} color={Colors.textSecondary} />
              <Text style={styles.metaChipText}>Reveals</Text>
            </View>
          )}
        </View>

        {!!item.effect?.message && (
          <Text style={styles.message} numberOfLines={3}>“{item.effect.message}”</Text>
        )}
      </View>
    );
  }

  const chip = (on: boolean, key: string, label: string, icon: keyof typeof Ionicons.glyphMap, color: string, onPress: () => void) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      style={[styles.filterChip, on ? { borderColor: color, backgroundColor: hexToRgba(color, 0.16) } : null]}
    >
      <Ionicons name={icon} size={13} color={on ? color : Colors.textSecondary} />
      <Text style={[styles.filterChipText, on ? { color: Colors.text } : null]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Runbook</Text>
        <Text style={styles.count}>
          {filtersActive ? `${visible.length} of ${runbookEntries.length}` : `${runbookEntries.length}`}
        </Text>
      </View>

      {runbookEntries.length > 0 && (
        <View style={styles.filters}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {chip(cpFilter === 'all', 'cp-all', 'All sites', 'apps-outline', Colors.primary, () => setCpFilter('all'))}
            {checkpoints.map((c) =>
              chip(cpFilter === c.id, `cp-${c.id}`, c.name || '(unnamed)', 'location-outline', Colors.primary,
                () => setCpFilter(cpFilter === c.id ? 'all' : c.id)))}
          </ScrollView>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            {KIND_ORDER.map((k) =>
              chip(kindFilter.has(k), `k-${k}`, KIND_META[k].label, KIND_META[k].icon, KIND_META[k].color,
                () => setKindFilter(toggled(kindFilter, k))))}
            {TRIGGER_ORDER.map((t) =>
              chip(triggerFilter.has(t), `t-${t}`, TRIGGER_META[t].label, TRIGGER_META[t].icon, Colors.textSecondary,
                () => setTriggerFilter(toggled(triggerFilter, t))))}
          </ScrollView>

          {filtersActive && (
            <TouchableOpacity onPress={clearFilters} style={styles.clearBtn}>
              <Ionicons name="close-circle-outline" size={14} color={Colors.textSecondary} />
              <Text style={styles.clearText}>Clear filters</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      <FlatList
        data={visible}
        keyExtractor={(e) => e.id}
        contentContainerStyle={styles.list}
        renderItem={renderEntry}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="book-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>
              {runbookEntries.length === 0
                ? 'No runbook entries yet. Author them on the web dashboard.'
                : 'Nothing matches these filters.'}
            </Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12, gap: 12,
  },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: Colors.text },
  count: { fontSize: 14, color: Colors.textSecondary, fontVariant: ['tabular-nums'] },

  filters: { gap: 8, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: Colors.border },
  filterRow: { paddingHorizontal: 16, gap: 6 },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999,
    borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.surface,
  },
  filterChipText: { fontSize: 12, color: Colors.textSecondary, fontWeight: '600' },
  clearBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 16 },
  clearText: { fontSize: 12, color: Colors.textSecondary },

  list: { padding: 16, gap: 10 },
  entry: {
    backgroundColor: Colors.surface, borderRadius: 12, padding: 14, gap: 6,
    borderWidth: 1, borderColor: Colors.border, borderLeftWidth: 4,
  },
  entryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  kindChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999 },
  kindChipText: { fontSize: 11, fontWeight: '800' },
  priority: { fontSize: 11, color: Colors.textMuted, fontVariant: ['tabular-nums'] },
  entryName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  entryCp: { fontSize: 12, color: Colors.textSecondary },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  metaChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 3, paddingHorizontal: 7, borderRadius: 6,
    backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border,
  },
  metaChipText: { fontSize: 11, color: Colors.textSecondary, fontWeight: '600' },
  message: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic', lineHeight: 18, marginTop: 2 },

  empty: { alignItems: 'center', gap: 10, paddingTop: 48, paddingHorizontal: 32 },
  emptyText: { fontSize: 14, color: Colors.textMuted, textAlign: 'center', lineHeight: 20 },
});
