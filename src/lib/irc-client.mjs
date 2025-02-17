import {METHODS} from './methods.mjs';

export class NetworkedIrcClient extends EventTarget {
  static handlesMethod(method) {
    return [
      METHODS.SET_PLAYER_DATA,
      METHODS.LOG,
      METHODS.CHAT,
      METHODS.TYPING,
      METHODS.SPEAKING,
    ].includes(method);
  }
}
