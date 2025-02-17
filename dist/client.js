// src/lib/methods.mjs
var METHODS = {
  // handshake protocol
  SET_PLAYER_DATA: 1,
  // client -> server proxy
  INIT_PLAYERS: 2,
  // server -> client
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
  VIDEO_END: 12
};
var METHOD_NAMES = {};
for (const [key, value] of Object.entries(METHODS)) {
  METHOD_NAMES[value] = key;
}

// src/lib/util.ts
import * as u8 from "u8-encoder";
function parseMessage(uint8Array) {
  const o = u8.decode(uint8Array);
  const method = o == null ? void 0 : o.method;
  const args = o == null ? void 0 : o.args;
  if (typeof method === "number" && typeof args === "object" && args !== null) {
    return {
      method,
      args
    };
  } else {
    throw new Error("Invalid message");
  }
}
function serializeMessage({
  method,
  args
}) {
  return u8.encode({
    method,
    args
  });
}

// src/client.ts
var connect = async ({
  endpointUrl,
  room,
  signal
}) => {
  const ws = new WebSocket(`${endpointUrl}/api/rooms/${room}/websocket`);
  await new Promise((resolve, reject) => {
    const onopen = () => {
      resolve(null);
    };
    const onerror = (e) => {
      reject(e);
    };
    const onclose = () => {
      reject(new Error("WebSocket closed"));
    };
    ws.addEventListener("open", onopen);
    ws.addEventListener("error", onerror);
    ws.addEventListener("close", onclose);
  });
  if (signal == null ? void 0 : signal.aborted) {
    throw new Error("Connection aborted");
  }
  const result = new EventTarget();
  result.send = ({
    method,
    args
  }) => {
    ws.send(serializeMessage({ method, args }));
  };
  ws.addEventListener("message", (e) => {
    const { method, args } = parseMessage(e.data);
    const methodName = METHOD_NAMES[method];
    if (methodName) {
      result.dispatchEvent(new MessageEvent(methodName, { data: args }));
    } else {
      throw new Error(`Unknown method: ${method}`);
    }
  });
  ws.addEventListener("error", (e) => {
    result.dispatchEvent(new MessageEvent("error", { data: e }));
  });
  ws.addEventListener("close", () => {
    result.dispatchEvent(new MessageEvent("close"));
  });
  return result;
};
export {
  METHODS,
  METHOD_NAMES,
  connect
};
