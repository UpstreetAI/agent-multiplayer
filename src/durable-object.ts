import {NetworkedIrcClient} from "./lib/irc-client.mjs";
import {handlesMethod as networkedAudioClientHandlesMethod} from "./lib/audio/networked-audio-client-utils.mjs";
import {handlesMethod as networkedVideoClientHandlesMethod} from "./lib/video/networked-video-client-utils.mjs";
import {parseMessage, serializeMessage, type MethodArgs} from "./lib/util";
import {METHODS} from "./lib/methods.mjs";
import {handleErrors} from "./lib/errors.mjs";

// returns the resume function
/* const _pauseWebSocket = (ws) => {
  const queue: any[] = [];
  const onmessage = e => {
    queue.push(e.data);
  };
  ws.addEventListener('message', onmessage);
  return () => {
    for (const data of queue) {
      ws.dispatchEvent(new MessageEvent('message', {data}));
    }
    queue.length = 0;

    ws.removeEventListener('message', onmessage);
  };
}; */

const waitForMessageType = (webSocket: WebSocket, method: number): Promise<MethodArgs> => {
  return new Promise((resolve, reject) => {
    const onmessage = (e: MessageEvent) => {
      if (e.data instanceof ArrayBuffer) {
        const arrayBuffer = e.data as ArrayBuffer;
        const uint8Array = new Uint8Array(arrayBuffer);
        const o = parseMessage(uint8Array);
        if (o.method === method) {
          resolve(o);
          webSocket.removeEventListener('message', onmessage);
          webSocket.removeEventListener('close', onclose);
          webSocket.removeEventListener('error', onerror);
        }
      }
    };
    webSocket.addEventListener('message', onmessage);

    const onclose = () => {
      reject(new Error('WebSocket closed'));
    };
    webSocket.addEventListener('close', onclose);

    const onerror = (e: Event) => {
      reject(e);
    };
    webSocket.addEventListener('error', onerror);
  });
};

type Session = {
  webSocket: WebSocket;
  playerId: string;
  playerData: object;
};

// Durable Object Class
export class Room {
  storage: any;
  env: any;
  sessions: Session[];
  lastTimestamp: number;

  constructor(controller, env) {
    this.storage = controller.storage;
    this.env = env;
    this.sessions = [];
    this.lastTimestamp = 0;
  }

  async fetch(request) {
    return await handleErrors(request, async () => {
      let url = new URL(request.url);
      const match = url.pathname.match(/^\/([^\/]+?)\/([^\/]+?)$/);
      const roomName = match ? match[1] : '';
      const methodName = match ? match[2] : '';

      switch (methodName) {
        case 'websocket': {
          if (request.headers.get("Upgrade") != "websocket") {
            return new Response("expected websocket Upgrade header", {status: 400});
          }

          let ip = request.headers.get("CF-Connecting-IP");
          let pair = new WebSocketPair();
          await this.handleSession(pair[1], ip, roomName, url);
          return new Response(null, { status: 101, webSocket: pair[0] });
        }

        default:
          return new Response("Not found", {status: 404});
      }
    });
  }

  // handleSession() implements our WebSocket-based chat protocol.
  async handleSession(webSocket, ip, roomName, url) {
    webSocket.accept();

    // steps to initialize the session:
    // 1. wait for client to set playerData
    // 2. latch the new session and begin listening for messages
    // 3. send network init message to the client
    // 4. send join message to peers except us

    const {
      args: {
        playerData,
      },
    } = await waitForMessageType(webSocket, METHODS.SET_PLAYER_DATA);

    // const _resumeWebsocket = _pauseWebSocket(webSocket);

    const playerId = crypto.randomUUID();
    const session = {webSocket, playerId, playerData};
    this.sessions.push(session);

    // send network init
    webSocket.send(serializeMessage({
      method: METHODS.NETWORK_INIT,
      args: {
        playerId,
        players: this.sessions.map((s) => ({
          playerId: s.playerId,
          playerData: s.playerData,
        })),
      },
    }));

    // respond back to the client
    // const respondToSelf = message => {
    //   session.webSocket.send(message);
    // };

    // send a message to everyone on the list except us
    const proxyMessageToPeersExceptUs = (uint8Array: Uint8Array) => {
      for (const s of this.sessions) {
        if (s !== session) {
          s.webSocket.send(uint8Array);
        }
      }
    };
    // send a message to all peers
    const proxyMessageToPeersIncludingUs = (uint8Array: Uint8Array) => {
      for (const s of this.sessions) {
        s.webSocket.send(uint8Array);
      }
    };

    const handleBinaryMessage = (arrayBuffer: ArrayBuffer) => {
      const uint8Array = new Uint8Array(arrayBuffer);
      const o = parseMessage(uint8Array);

      // handle playerData updates
      if (o.method === METHODS.SET_PLAYER_DATA) {
        session.playerData = o.args.playerData;

        const uint8Array = serializeMessage({
          method: METHODS.SET_PLAYER_DATA,
          args: {
            playerId: session.playerId,
            playerData: session.playerData,
          },
        });
        proxyMessageToPeersIncludingUs(uint8Array);
      }

      // handle proxying messages to peers
      const {method} = o;
      if (NetworkedIrcClient.handlesMethod(method)) {
        proxyMessageToPeersIncludingUs(uint8Array);
      }
      if (
        networkedAudioClientHandlesMethod(method) ||
        networkedVideoClientHandlesMethod(method)
      ) {
        proxyMessageToPeersExceptUs(uint8Array);
      }
    };

    const _sendJoinMessageToPeersExceptUs = () => {
      proxyMessageToPeersExceptUs(serializeMessage({
        method: METHODS.JOIN,
        args: {
          playerId: session.playerId,
        },
      }));
    };
    const _sendLeaveMessageToPeersExceptUs = () => {
      proxyMessageToPeersExceptUs(serializeMessage({
        method: METHODS.LEAVE,
        args: {
          playerId: session.playerId,
        },
      }));
    };
    _sendJoinMessageToPeersExceptUs();

    webSocket.addEventListener("message", async (e: MessageEvent) => {
      try {
        if (e.data instanceof ArrayBuffer) {
          const arrayBuffer = e.data;
          handleBinaryMessage(arrayBuffer);
        } else {
          throw new Error('got non-binary message');
        }
      } catch (err) {
        console.warn(err);
        webSocket.send(JSON.stringify({error: err.stack}));
      }
    });

    const closeOrErrorHandler = (e: MessageEvent) => {
      try {
        this.sessions = this.sessions.filter(s => s !== session);
        _sendLeaveMessageToPeersExceptUs();
      } catch(err) {
        console.warn(err.stack);
        throw err;
      } finally {
        cleanup();
      }
    };
    webSocket.addEventListener("close", closeOrErrorHandler);
    webSocket.addEventListener("error", closeOrErrorHandler);

    const cleanup = () => {
      webSocket.removeEventListener("close", closeOrErrorHandler);
      webSocket.removeEventListener("error", closeOrErrorHandler);
    };

    // _resumeWebsocket();
  }
}