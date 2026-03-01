const mapsConfig = require('../cfg/maps.json');

/**
 * Returns allowed map names for the given game_type and game_mode from maps.json.
 * @param {string} gameType
 * @param {string} gameMode
 * @returns {string[]}
 */
function getMapsForMode(gameType, gameMode) {
  const gt = mapsConfig.gameTypes?.[gameType];
  const gm = gt?.gameModes?.[gameMode];
  if (!gm || !Array.isArray(gm.mapGroups)) return [];
  let maps = [];
  for (const mg of gm.mapGroups) {
    const grp = mapsConfig.mapGroups?.[mg];
    if (grp && Array.isArray(grp.maps)) maps = maps.concat(grp.maps);
  }
  return maps;
}

module.exports = { getMapsForMode, mapsConfig };
