import {METHODS} from '../methods.mjs';

export const handlesMethod = method => {
  return [
    METHODS.VIDEO,
    METHODS.VIDEO_START,
    METHODS.VIDEO_END,
  ].includes(method);
};