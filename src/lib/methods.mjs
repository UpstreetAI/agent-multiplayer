export const METHODS = {
  // handshake protocol
  SET_PLAYER_DATA: 1, // client -> server proxy
  INIT_PLAYERS: 2, // server -> client
  // server -> client
  JOIN: 3,
  LEAVE: 4,
  // client -> server proxy to all peers
  LOG: 5,
  CHAT: 6,
  TYPING: 7,
  SPEAKING: 8,
  // client -> server proxy to all except self
  AUDIO: 9,
  AUDIO_START: 10,
  AUDIO_END: 11,
  VIDEO: 12,
  VIDEO_START: 13,
  VIDEO_END: 12,
};

export const METHOD_NAMES = {};
for (const [key, value] of Object.entries(METHODS)) {
  METHOD_NAMES[value] = key;
}