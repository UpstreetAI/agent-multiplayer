import {NetworkedIrcClient} from "./lib/irc-client.mjs";
import {handlesMethod as networkedAudioClientHandlesMethod} from "./lib/audio/networked-audio-client-utils.mjs";
import {handlesMethod as networkedVideoClientHandlesMethod} from "./lib/video/networked-video-client-utils.mjs";
import {parseUpdateObject, serializeMessage} from "./lib/util.mjs";
import {handleErrors} from "./lib/errors.mjs";

// returns the resume function
const _pauseWebSocket = (ws) => {
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
};

// Durable Object Class
export class Room {
  storage: any;
  env: any;
  sessions: any[];
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
    // 1. generate playerId and send it to the client
    // 2. wait for client to set playerData
    // 3. latch the new session and begin listening for messages
    // 4. send network init message to the client
    // 5. send join message to peers except us

    const playerId = url.searchParams.get('playerId') ?? null;

    // const _resumeWebsocket = _pauseWebSocket(webSocket);

    const networkClient = {
      getNetworkInitMessage: () => {
        return new MessageEvent('networkinit', {
          data: {
            playerIds: this.sessions
              .map((session) => session.playerId)
              .filter((playerId) => playerId !== null),
          },
        });
      },
    };

    let session = {webSocket, playerId};
    this.sessions.push(session);

    // send network init
    webSocket.send(serializeMessage(networkClient.getNetworkInitMessage()));

    // respond back to the client
    // const respondToSelf = message => {
    //   session.webSocket.send(message);
    // };

    // send a message to everyone on the list except us
    const proxyMessageToPeersExceptUs = m => {
      for (const s of this.sessions) {
        if (s !== session) {
          s.webSocket.send(m);
        }
      }
    };
    // send a message to all peers
    const proxyMessageToPeersIncludingUs = m => {
      for (const s of this.sessions) {
        s.webSocket.send(m);
      }
    };

    const handleBinaryMessage = (arrayBuffer) => {
      const uint8Array = new Uint8Array(arrayBuffer);
      const updateObject = parseUpdateObject(uint8Array);

      const {method} = updateObject;
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

    const _sendJoinMessage = (playerId) => {
      if (playerId) {
        const joinMessage = new MessageEvent('join', {
          data: {
            playerId,
          },
        });
        const joinBuffer = serializeMessage(joinMessage);
        proxyMessageToPeersExceptUs(joinBuffer);
      }
    };
    _sendJoinMessage(playerId);

    webSocket.addEventListener("message", async msg => {
      try {
        if (msg.data instanceof ArrayBuffer) {
          const arrayBuffer = msg.data;
          handleBinaryMessage(arrayBuffer);
        } else {
          throw new Error('got non-binary message');
        }
      } catch (err) {
        console.warn(err);
        webSocket.send(JSON.stringify({error: err.stack}));
      }
    });

    let closeOrErrorHandler = evt => {
      try {
        this.sessions = this.sessions.filter(s => s !== session);
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

  // broadcast() broadcasts a message to all clients.
  broadcast(message) {
    // Apply JSON if we weren't given a string to start with.
    if (typeof message !== 'string') {
      message = JSON.stringify(message);
    }

    try {
      for (const session of this.sessions) {
        session.webSocket.send(message);
      }
    } catch (err) {
      console.warn(err.stack);
    }
  }
}