export const METHODS = {
  // handshake protocol
  INIT_PLAYER_ID: 1, // server -> client
  SET_PLAYER_DATA: 2, // client -> server proxy
  INIT_PLAYERS: 3, // server -> client
  // server -> client
  JOIN: 4,
  LEAVE: 5,
  // client -> server proxy
  CHAT: 6,
  LOG: 7,
  AUDIO: 8,
  AUDIO_START: 9,
  AUDIO_END: 10,
  VIDEO: 11,
  VIDEO_START: 12,
  VIDEO_END: 13,
};

export const METHOD_NAMES = {};
for (const [key, value] of Object.entries(METHODS)) {
  METHOD_NAMES[value] = key;
}