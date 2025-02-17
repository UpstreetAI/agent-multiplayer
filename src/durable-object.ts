import {DataClient, NetworkedDataClient} from "./lib/data-client.mjs";
import {NetworkedIrcClient} from "./lib/irc-client.mjs";
import {NetworkedCrdtClient} from "./lib/crdt-client.mjs";
import {NetworkedLockClient} from "./lib/lock-client.mjs";
import {handlesMethod as networkedAudioClientHandlesMethod} from "./lib/audio/networked-audio-client-utils.mjs";
import {handlesMethod as networkedVideoClientHandlesMethod} from "./lib/video/networked-video-client-utils.mjs";
import {parseUpdateObject, serializeMessage} from "./lib/util.mjs";
import {UPDATE_METHODS} from "./lib/update-types.mjs";
import {handleErrors} from "./lib/errors.mjs";

//

const readCrdtFromStorage = async (storage, arrayNames) => {
  const crdt = new Map();
  for (const arrayId of arrayNames) {
    const array = await storage.get(arrayId) ?? {};
    crdt.set(arrayId, array);

    for (const arrayIndexId in array) {
      const val = await storage.get(arrayIndexId) ?? [
        0,
        {},
      ];
      crdt.set(arrayIndexId, val);
    }
  }
  return crdt;
};
const dataClientPromises = new Map();
const crdtClientPromises = new Map();
const lockClientPromises = new Map();

//

const schemaArrayNames = [
  'worldApps',
];

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
    // `controller.storage` provides access to our durable storage. It provides a simple KV
    // get()/put() interface.
    this.storage = controller.storage;

    // `env` is our environment bindings (discussed earlier).
    this.env = env;

    // We will put the WebSocket objects for each client, along with some metadata, into
    // `sessions`.
    this.sessions = [];

    // We keep track of the last-seen message's timestamp just so that we can assign monotonically
    // increasing timestamps even if multiple messages arrive simultaneously (see below). There's
    // no need to store this to disk since we assume if the object is destroyed and recreated, much
    // more than a millisecond will have gone by.
    this.lastTimestamp = 0;
  }

  // The system will call fetch() whenever an HTTP request is sent to this Object. Such requests
  // can only be sent from other Worker code, such as the code above; these requests don't come
  // directly from the internet. In the future, we will support other formats than HTTP for these
  // communications, but we started with HTTP for its familiarity.
  async fetch(request) {
    return await handleErrors(request, async () => {
      let url = new URL(request.url);
      const match = url.pathname.match(/^\/([^\/]+?)\/([^\/]+?)$/);
      const roomName = match ? match[1] : '';
      const methodName = match ? match[2] : '';

      switch (methodName) {
        case 'websocket': {
          // The request is to `/api/room/<name>/websocket`. A client is trying to establish a new
          // WebSocket session.
          if (request.headers.get("Upgrade") != "websocket") {
            return new Response("expected websocket", {status: 400});
          }

          // Get the client's IP address for use with the rate limiter.
          let ip = request.headers.get("CF-Connecting-IP");

          // To accept the WebSocket request, we create a WebSocketPair (which is like a socketpair,
          // i.e. two WebSockets that talk to each other), we return one end of the pair in the
          // response, and we operate on the other end. Note that this API is not part of the
          // Fetch API standard; unfortunately, the Fetch API / Service Workers specs do not define
          // any way to act as a WebSocket server today.
          let pair = new WebSocketPair();

          // We're going to take pair[1] as our end, and return pair[0] to the client.
          await this.handleSession(pair[1], ip, roomName, url);

          // Now we return the other end of the pair to the client.
          return new Response(null, { status: 101, webSocket: pair[0] });
        }

        default:
          return new Response("Not found", {status: 404});
      }
    });
  }

  // handleSession() implements our WebSocket-based chat protocol.
  async handleSession(webSocket, ip, roomName, url) {
    // Accept our end of the WebSocket. This tells the runtime that we'll be terminating the
    // WebSocket in JavaScript, not sending it elsewhere.
    webSocket.accept();

    const playerId = url.searchParams.get('playerId') ?? null;

    const realm = {
      key: roomName,
    };

    let dataClientPromise = dataClientPromises.get(roomName);
    if (!dataClientPromise) {
      dataClientPromise = (async () => {
        const crdt = await readCrdtFromStorage(this.storage, schemaArrayNames);
        const dataClient = new DataClient({
          crdt,
          userData: {
            realm,
          },
        });
        return dataClient;
      })();
      dataClientPromises.set(roomName, dataClientPromise);
    }
    let crdtClientPromise = crdtClientPromises.get(roomName);
    if (!crdtClientPromise) {
      crdtClientPromise = (async () => {
        let initialUpdate = await this.storage.get('crdt');
        console.log('get room crdt', initialUpdate);
        const crdtClient = new NetworkedCrdtClient({
          initialUpdate,
        });
        crdtClient.addEventListener('update', async e => {
          const uint8array = crdtClient.getStateAsUpdate();
          // console.log('put room crdt', uint8array);
          await this.storage.put('crdt', uint8array);
        });
        return crdtClient;
      })();
      crdtClientPromises.set(roomName, crdtClientPromise);
    }
    let lockClientPromise = lockClientPromises.get(roomName);
    if (!lockClientPromise) {
      lockClientPromise = (async () => {
        const lockClient = new NetworkedLockClient();
        return lockClient;
      })();
      lockClientPromises.set(roomName, lockClientPromise);
    }

    const _resumeWebsocket = _pauseWebSocket(webSocket);

    const dataClient = await dataClientPromise;
    const crdtClient = await crdtClientPromise;
    const lockClient = await lockClientPromise;
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

    let session = {webSocket, playerId/*, blockedMessages: []*/};
    this.sessions.push(session);

    // send import
    webSocket.send(serializeMessage(dataClient.getImportMessage()));
    // send initial update
    webSocket.send(serializeMessage(crdtClient.getInitialUpdateMessage()));
    // send network init
    webSocket.send(serializeMessage(networkClient.getNetworkInitMessage()));

    // set up dead hands tracking
    const deadHands = new Map();
    // let triggered = false;
    const _triggerDeadHands = () => {
      for (const [key, {arrayId, arrayIndexId}] of deadHands.entries()) {
        const array = dataClient.getArray(arrayId, {
          listen: false,
        });
        if (arrayIndexId !== null) { // map mode
          if (array.hasKey(arrayIndexId)) {
            const map = array.getMap(arrayIndexId, {
              listen: false,
            });
            const removeMapUpdate = map.removeUpdate();
            const removeMapUpdateBuffer = serializeMessage(removeMapUpdate);
            proxyMessageToPeers(removeMapUpdateBuffer);
          }
        } else { // array mode
          // console.log('dead hand array', arrayId);

          for (const arrayIndexId of array.getKeys()) {
            const map = array.getMap(arrayIndexId, {
              listen: false,
            });
            const removeMessage = map.removeUpdate();
            const removeArrayUpdateBuffer = serializeMessage(removeMessage);
            proxyMessageToPeers(removeArrayUpdateBuffer);
          }
        }
        // console.log('iter end');
      }
    };
    const _triggerUnlocks = () => {
      lockClient.serverUnlockSession(session);
    };

    dataClient.addEventListener('deadhand', e => {
      const {keys, deadHand} = e.data;
      if (deadHand === playerId) {
        // const key = `${arrayId}:${arrayIndexId}`;
        for (const key of keys) {
          let match;
          if (match = key.match(/^([^\.]+?)\.([^\.]+)$/)) {
            const arrayId = match[1];
            const arrayIndexId = match[2];
            deadHands.set(key, {
              arrayId,
              arrayIndexId,
            });
          } else if (match = key.match(/^([^\.]+)$/)) {
            const arrayId = match[1];
            deadHands.set(key, {
              arrayId,
              arrayIndexId: null,
            });
          } else {
            throw new Error('invalid deadhand key: ' + key);
          }
        }
        // console.log('register dead hand', e.data, {arrayId, arrayIndexId, deadHand});
      }
    });
    dataClient.addEventListener('livehand', e => {
      const {keys, liveHand} = e.data;
      if (liveHand === playerId) {
        for (const key of keys) {
          deadHands.delete(key);
        }
        // console.log('register live hand', e.data, {arrayId, arrayIndexId, liveHand});
      }
    });

    // respond back to the client
    const respondToSelf = message => {
      session.webSocket.send(message);
    };

    // send a message to everyone on the list except us
    const proxyMessageToPeers = m => {
      for (const s of this.sessions) {
        if (s !== session) {
          s.webSocket.send(m);
        }
      }
    };
    // send a message to all peers
    const reflectMessageToPeers = m => {
      for (const s of this.sessions) {
        s.webSocket.send(m);
      }
    };

    const handleBinaryMessage = (arrayBuffer) => {
      const uint8Array = new Uint8Array(arrayBuffer);
      const updateObject = parseUpdateObject(uint8Array);

      const {method, args} = updateObject;
      if (NetworkedDataClient.handlesMethod(method)) {
        const {rollback, update} = dataClient.applyUint8Array(uint8Array);
        if (rollback) {
          const rollbackBuffer = serializeMessage(rollback);
          respondToSelf(rollbackBuffer);
        }
        if (update) {
          dataClient.emitUpdate(update);
          proxyMessageToPeers(uint8Array);
        }
      }
      if (NetworkedCrdtClient.handlesMethod(method)) {
        const [update] = args;
        crdtClient.update(update);
        proxyMessageToPeers(uint8Array);
      }
      if (NetworkedLockClient.handlesMethod(method)) {
        const m = (() => {
          const [lockName] = args;
          switch (method) {
            case UPDATE_METHODS.LOCK_REQUEST: {
              return new MessageEvent('lockRequest', {
                data: {
                  playerId,
                  lockName,
                },
              });
            }
            case UPDATE_METHODS.LOCK_RESPONSE: {
              return new MessageEvent('lockResponse', {
                data: {
                  playerId,
                  lockName,
                },
              });
            }
            case UPDATE_METHODS.LOCK_RELEASE: {
              return new MessageEvent('lockRelease', {
                data: {
                  playerId,
                  lockName,
                },
              });
            }
            default: {
              console.warn('unrecognized lock method', method);
              break
            }
          }
        })();
        lockClient.handle(m);
      }
      if (NetworkedIrcClient.handlesMethod(method)) {
        // console.log('route', method, args, this.sessions);
        reflectMessageToPeers(uint8Array);
      }
      if (
        networkedAudioClientHandlesMethod(method) ||
        networkedVideoClientHandlesMethod(method)
      ) {
        proxyMessageToPeers(uint8Array);
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
        dataClient.emitUpdate(joinMessage);
        proxyMessageToPeers(joinBuffer);
      }
    };
    _sendJoinMessage(playerId);

    // Set event handlers to receive messages.
    // let receivedUserInfo = false;
    webSocket.addEventListener("message", async msg => {
      try {
        if (session.quit) {
          // Whoops, when trying to send to this WebSocket in the past, it threw an exception and
          // we marked it broken. But somehow we got another message? I guess try sending a
          // close(), which might throw, in which case we'll try to send an error, which will also
          // throw, and whatever, at least we won't accept the message. (This probably can't
          // actually happen. This is defensive coding.)
          console.log('closing due to webasocket broken');
          webSocket.close(1011, "WebSocket broken.");
          return;
        }

        if (msg.data instanceof ArrayBuffer) {
          const arrayBuffer = msg.data;
          handleBinaryMessage(arrayBuffer);
        } else {
          // I guess we'll use JSON.
          throw new Error('got non-binary message');
        }
      } catch (err) {
        // Report any exceptions directly back to the client. As with our handleErrors() this
        // probably isn't what you'd want to do in production, but it's convenient when testing.
        console.warn(err);
        webSocket.send(JSON.stringify({error: err.stack}));
      }
    });

    // On "close" and "error" events, remove the WebSocket from the sessions list and broadcast
    // a quit message.
    let closeOrErrorHandler = evt => {
      try {
        session.quit = true;
        this.sessions = this.sessions.filter(member => member !== session);

        _triggerDeadHands();
        _triggerUnlocks();
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

    _resumeWebsocket();
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