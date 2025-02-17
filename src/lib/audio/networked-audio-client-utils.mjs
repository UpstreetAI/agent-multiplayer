import {METHODS} from '../methods.mjs';

export const handlesMethod = method => {
  return [
    METHODS.AUDIO,
    METHODS.AUDIO_START,
    METHODS.AUDIO_END,
  ].includes(method);
};