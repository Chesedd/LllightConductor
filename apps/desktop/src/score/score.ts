export type ScoreEventId = string;
export interface ScoreEvent { id: ScoreEventId; channelId: string; startsAtMs: number; durationMs: number; value: number }
export interface Score { durationMs: number; events: ScoreEvent[] }

export const emptyScore = (): Score => ({ durationMs: 0, events: [] });
