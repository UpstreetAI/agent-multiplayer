// import {MULTIPLAYER_PORT} from './constants.mjs';
import * as u8 from 'u8-encoder';
// import {UPDATE_METHODS} from './update-types.mjs';

// const alignN = n => index => {
//   const r = index % n;
//   return r === 0 ? index : (index + n - r);
// };
// const align4 = alignN(4);

// const parseUpdateObject = uint8Array => zbdecode(uint8Array);

/* function makeid(length) {
  var result = '';
  var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}
const makeId = () => makeid(10); */

export type MethodArgs = {
  method: number;
  args: any;
};

export function parseMessage(uint8Array: Uint8Array) {
  const o = u8.decode(uint8Array);
  const method = o?.method;
  const args = o?.args;

  if (typeof method === 'number' && typeof args === 'object' && args !== null) {
    return {
      method,
      args,
    };
  } else {
    throw new Error('Invalid message');
  }
}

export function serializeMessage({
  method,
  args,
}: MethodArgs) {
  return u8.encode({
    method,
    args,
  });
}

// const getEndpoint = () => {
//   const wss = 'wss://';
//   let hostname = 'multiplayer.webaverse.workers.dev';

//   // The local development server's WebSocket is provided at ws://localhost.
//   const isDevelopment = location.hostname === 'local.webaverse.com';
//   if (isDevelopment) {
//     // wss = 'ws://';
//     // hostname = `localhost:${MULTIPLAYER_PORT}`;
//     hostname = location.host;
//   }

//   return `${wss}${hostname}`;
// };
// const createWs = (endpoint, roomname, playerId) => {
//   const u = `${endpoint}/api/room/${roomname}/websocket${playerId ? `?playerId=${playerId}` : ''}`;
//   const ws = new WebSocket(u);
//   return ws;
// };

// const makePromise = () => {
//   let resolve;
//   let reject;
//   const promise = new Promise((res, rej) => {
//     resolve = res;
//     reject = rej;
//   });
//   promise.resolve = resolve;
//   promise.reject = reject;
//   return promise;
// };

// const zstringify = o => {
//   let result = '';
//   for (const k in o) {
//     if (result) {
//       result += '\n';
//     }

//     const v = o[k];
//     if (v instanceof Float32Array) {
//       result += `${JSON.stringify(k)}: Float32Array(${v.join(',')})`;
//     } else {
//       const s = JSON.stringify(v);
//       if (s.length >= 20 && v instanceof Object && v !== null) {
//         result += `${JSON.stringify(k)}:\n${zstringify(v)}`;
//       } else {
//         result += `${JSON.stringify(k)}: ${s}`;
//       }
//     }
//   }
//   return result;
// };

/* export {
  alignN,
  align4,
  parseUpdateObject,
  makeId,
  parseMessage,
  serializeMessage,
  getEndpoint,
  createWs,
  makePromise,
  zstringify,
}; */
