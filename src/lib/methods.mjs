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
  AUDIO: 7,
  AUDIO_START: 8,
  AUDIO_END: 9,
  VIDEO: 10,
  VIDEO_START: 11,
  VIDEO_END: 12,
};

export const METHOD_NAMES = {};
for (const [key, value] of Object.entries(METHODS)) {
  METHOD_NAMES[value] = key;
}