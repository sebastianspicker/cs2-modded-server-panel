import mapsConfig from '../cfg/maps.json';

export interface GameMode {
  exec: string;
  mapGroups: string[];
}

export interface GameType {
  gameModes: Record<string, GameMode>;
}

export interface MapGroup {
  displayName: string;
  maps: string[];
}

export interface MapsConfig {
  gameTypes: Record<string, GameType>;
  mapGroups: Record<string, MapGroup>;
}

const typedMapsConfig = mapsConfig as MapsConfig;

function getMapsForMode(gameType: string, gameMode: string): string[] {
  const gt = typedMapsConfig.gameTypes?.[gameType];
  const gm = gt?.gameModes?.[gameMode];
  if (!gm || !Array.isArray(gm.mapGroups)) return [];
  return gm.mapGroups.flatMap((mg) => typedMapsConfig.mapGroups?.[mg]?.maps ?? []);
}

export { getMapsForMode, typedMapsConfig as mapsConfig };
