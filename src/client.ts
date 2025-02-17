import { METHODS, METHOD_NAMES } from "./lib/methods.mjs";
import { parseMessage, serializeMessage, type MethodArgs } from "./lib/util.ts";
export {
  METHODS,
  METHOD_NAMES,
};

export type AgentMultiplayerApi = EventTarget & {
  send: (methodArgs: MethodArgs) => void;
};

export const connect = async ({
  endpointUrl,
  room,
  signal,
}: {
  endpointUrl: string,
  room: string,
  signal?: AbortSignal,
}): Promise<AgentMultiplayerApi> => {
  const ws = new WebSocket(`${endpointUrl}/api/rooms/${room}/websocket`);

  await new Promise((resolve, reject) => {
    const onopen = () => {
      resolve(null);
    };
    const onerror = (e) => {
      reject(e);
    };
    const onclose = () => {
      reject(new Error('WebSocket closed'));
    };

    ws.addEventListener('open', onopen);
    ws.addEventListener('error', onerror);
    ws.addEventListener('close', onclose);
  });

  if (signal?.aborted) {
    throw new Error('Connection aborted');
  }

  const result = new EventTarget() as AgentMultiplayerApi;
  result.send = ({
    method,
    args,
  }: MethodArgs) => {
    ws.send(serializeMessage({method, args}));
  };

  ws.addEventListener('message', (e) => {
    const {method, args} = parseMessage(e.data);
    const methodName = METHOD_NAMES[method];
    if (methodName) {
      result.dispatchEvent(new MessageEvent(methodName, {data: args}));
    } else {
      throw new Error(`Unknown method: ${method}`);
    }
  });
  ws.addEventListener('error', (e) => {
    result.dispatchEvent(new MessageEvent('error', {data: e}));
  });
  ws.addEventListener('close', () => {
    result.dispatchEvent(new MessageEvent('close'));
  });

  return result;
};
