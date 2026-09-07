import * as admin from 'firebase-admin';
admin.initializeApp();

export { onLocationUpdate } from './geofence';
export { onMemberWrite } from './members';
export { onMemberWriteProjectRoster, onGamePhaseProjectRoster } from './roster';
export { createGame, cloneGame, joinGameByCode, deleteGame, undoDeleteGame, sweepDeletedGames, resetPracticeGame, transferGmOrEndGame } from './games';
export { onBroadcastCreate } from './broadcasts';
export { cleanupRationPhotosOnGameEnd } from './cleanup';
export { onGameCleanupStart, onGameReopen } from './cleanupPhase';
export { runScheduledEvents } from './runsheet';
export { submitRation } from './rations';
export { rationPings } from './rationPings';
export { starvationSweep } from './starvation';
export { fireRunbookEntry } from './runbook';
export { rearmCheckpoint } from './rearm';
export { onGameStartProjectMarkers } from './markers';
export { onGameMediaWrite } from './media';
export { sweepOrphanedGames } from './orphans';
