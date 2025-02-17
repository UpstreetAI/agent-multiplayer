export {Room} from "./durable-object";
import {handleErrors} from "./lib/errors.mjs";

async function handleApiRequest(paths, request, env) {
  switch (paths[0]) {
    case 'rooms': {
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
    // /api/rooms/[room]/websocket
    return await handleErrors(request, async () => {
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