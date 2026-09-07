import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';
import { KIND_META } from '@/components/checkpointForm';
import type { Arrival, EntryTrip } from '@/types';

/**
 * The mobile GM feed (ROADMAP #83).
 *
 * **It splits alerts from history, and the split is not cosmetic.** Since #83, a confirmed
 * crossing that fires nothing writes its `arrivals` doc and sends *no* push. This feed
 * listed every arrival regardless, so what a GM saw here did not match what their phone had
 * done — the pushes that needed a response were buried in routine traffic, which is the
 * complaint the item started from.
 *
 * So the default list is **alerts**: `entryTrips`, the authoritative log of runbook entries
 * that actually fired, mirroring exactly what buzzed. Plain "reached <checkpoint>" crossings
 * live one tap away behind the arrival count, so a GM still has the cue that crossings are
 * happening at all. The web dashboard has done this since 2026-09-06; this is the same split
 * on the surface 1–2 GMs actually work from in the field.
 */

interface AlertFeedProps {
  arrivals: Arrival[];
  /** Runbook entries that actually fired (#67/#73) — the alerts half. */
  entryTrips?: EntryTrip[];
}

function formatTime(timestamp: any): string {
  try {
    const date: Date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '—';
  }
}

function ArrivalItem({ arrival }: { arrival: Arrival }) {
  return (
    <View style={styles.item}>
      <View style={styles.iconWrapper}>
        <Ionicons name="location" size={18} color={Colors.primary} />
      </View>
      <View style={styles.content}>
        <Text style={styles.playerName}>{arrival.playerName}</Text>
        <Text style={styles.checkpointName}>reached {arrival.checkpointName}</Text>
      </View>
      <Text style={styles.time}>{formatTime(arrival.timestamp)}</Text>
    </View>
  );
}

function TripItem({ trip }: { trip: EntryTrip }) {
  const meta = KIND_META[trip.effectKind ?? 'gm-notify'];
  return (
    <View style={[styles.item, { borderLeftWidth: 3, borderLeftColor: meta.color }]}>
      <View style={styles.iconWrapper}>
        <Ionicons name={meta.icon} size={18} color={meta.color} />
      </View>
      <View style={styles.content}>
        <Text style={styles.playerName}>{trip.playerName ?? 'A player'}</Text>
        <Text style={styles.checkpointName} numberOfLines={2}>
          {trip.message || `${meta.label} at ${trip.checkpointName ?? 'a site'}`}
        </Text>
      </View>
      <Text style={styles.time}>{formatTime(trip.trippedAt)}</Text>
    </View>
  );
}

export function AlertFeed({ arrivals, entryTrips = [] }: AlertFeedProps) {
  const [showArrivals, setShowArrivals] = useState(false);

  const toggle = (
    <TouchableOpacity
      style={styles.toggle}
      onPress={() => setShowArrivals((v) => !v)}
      activeOpacity={0.7}
    >
      <Ionicons
        name={showArrivals ? 'notifications-outline' : 'location-outline'}
        size={15}
        color={Colors.textSecondary}
      />
      <Text style={styles.toggleText}>
        {showArrivals
          ? `Back to alerts${entryTrips.length ? ` (${entryTrips.length})` : ''}`
          : `See all ${arrivals.length} checkpoint arrival${arrivals.length === 1 ? '' : 's'}`}
      </Text>
      <Ionicons name="chevron-forward" size={15} color={Colors.textMuted} />
    </TouchableOpacity>
  );

  if (showArrivals) {
    return (
      <View style={{ flex: 1 }}>
        {toggle}
        {arrivals.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="location-outline" size={32} color={Colors.textMuted} />
            <Text style={styles.emptyText}>No checkpoint arrivals yet.</Text>
          </View>
        ) : (
          <FlatList
            data={arrivals}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => <ArrivalItem arrival={item} />}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {entryTrips.length === 0 ? (
        <View style={styles.empty}>
          <Ionicons name="radio-outline" size={32} color={Colors.textMuted} />
          <Text style={styles.emptyText}>
            Nothing has fired yet.{'\n'}
            <Text style={styles.emptySub}>
              This lists what actually alerted you — a plain arrival is recorded quietly.
            </Text>
          </Text>
        </View>
      ) : (
        <FlatList
          data={entryTrips}
          keyExtractor={(item) => item.id ?? `${item.playerId}_${item.entryId}`}
          renderItem={({ item }) => <TripItem trip={item} />}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
      )}
      {toggle}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingVertical: 8,
  },
  toggle: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingVertical: 12, paddingHorizontal: 16,
    borderTopWidth: 1, borderTopColor: Colors.border,
  },
  toggleText: { flex: 1, color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  iconWrapper: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { flex: 1 },
  playerName: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  checkpointName: { color: Colors.textSecondary, fontSize: 13, marginTop: 1 },
  time: { color: Colors.textMuted, fontSize: 12 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
  emptyText: { color: Colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptySub: { color: Colors.textMuted, fontSize: 12 },
});
