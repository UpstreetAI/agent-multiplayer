export {Room} from "./durable-object";

async function handleErrors(request, func) {
  try {
    return await func();
  } catch (err) {
    if (request.headers.get("Upgrade") == "websocket") {
      let pair = new WebSocketPair();
      pair[1].accept();
      pair[1].send(JSON.stringify({error: err.stack}));
      pair[1].close(1011, "Uncaught exception during session setup");
      return new Response(null, { status: 101, webSocket: pair[0] });
    } else {
      return new Response(err.stack, {status: 500});
    }
  }
}

async function handleApiRequest(paths, request, env) {
  switch (paths[0]) {
    case "room": {
      let name = paths[1];
      let id;
      if (name.length <= 128) {
        id = env.rooms.idFromName(name);
      } else {
        return new Response("Room name too long", {status: 404});
      }

      const roomObject = env.rooms.get(id);
      let newUrl = new URL(request.url);
      newUrl.pathname = "/" + name + "/" + paths.slice(2).join("/");
      return roomObject.fetch(newUrl, request);
    }

    default:
      return new Response("Not found", {status: 404});
  }
}

export default {
  async fetch(request, env, ctx) {
    return await handleErrors(request, async () => {
      // We have received an HTTP request! Parse the URL and route the request.

      let url = new URL(request.url);
      const paths = url.pathname.slice(1).split('/');
      switch (paths[0]) {
        case 'api':
          return handleApiRequest(paths.slice(1), request, env);
        default:
          return new Response("Not found", {status: 404});
      }
    });
  }
};