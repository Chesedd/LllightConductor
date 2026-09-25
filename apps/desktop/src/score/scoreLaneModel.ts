import type { OutputChannel, Project } from '../domain/project';
import type { LightInterval } from './score';
import { orderScoreEvents } from './score';

export interface ScoreLane {
  costumeId: string;
  controllerId: string;
  channel: OutputChannel;
  events: LightInterval[];
}

/** Traverses topology order while joining score events exclusively by stable channel ID. */
export function buildScoreLaneModel(project: Project): ScoreLane[] {
  const byChannel = new Map<string, LightInterval[]>();
  for (const event of orderScoreEvents(project.score.events)) byChannel.set(event.channelId, [...(byChannel.get(event.channelId) ?? []), event]);
  return project.costumes.flatMap(costume => costume.master.slaves.flatMap(slave => slave.channels.map(channel => ({ costumeId: costume.id, controllerId: slave.id, channel, events: byChannel.get(channel.id) ?? [] }))));
}
