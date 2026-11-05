import { DurableObject } from 'cloudflare:workers';
export class UpdateRoom extends DurableObject {
  async fetch(request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({type:'connected'}));
      return new Response(null,{status:101,webSocket:client});
    }
    if (request.method === 'POST') {
      const {branch,sha}=await request.json();
      for(const socket of this.ctx.getWebSockets()){
        try{socket.send(JSON.stringify({type:'update',branch,sha}));}catch{}
      }
      return new Response('sent');
    }
    return new Response('not found',{status:404});
  }
  webSocketMessage(socket,message) {
    if(message==='ping')socket.send('pong');
  }
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==='/health')return Response.json({ok:true,service:'hexora-update-relay'});
    const id=env.UPDATE_ROOM.idFromName('hexora-develop');
    const room=env.UPDATE_ROOM.get(id);
    if(url.pathname==='/connect' && request.method==='GET' && request.headers.get('Upgrade')==='websocket')return room.fetch(request);
    if(url.pathname==='/notify' && request.method==='POST'){
      const secret=env.RELAY_SHARED_SECRET;
      const supplied=request.headers.get('Authorization')||'';
      if(!secret||supplied!==('Bearer '+secret))return new Response('unauthorized',{status:401});
      const payload=await request.json().catch(()=>null);
      if(!payload||payload.repository!=='anthonymes93/HexoraWorkspace'||payload.branch!=='develop'||!/^[a-f0-9]{40}$/.test(payload.sha||''))return new Response('invalid',{status:400});
      return room.fetch(new Request(request.url,{method:'POST',body:JSON.stringify({branch:payload.branch,sha:payload.sha})}));
    }
    return new Response('not found',{status:404});
  }
};
