import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { Server } from "socket.io";
import { Http3Server } from "@fails-components/webtransport";
import { Player } from "./player.js";
import { TICK_RATE } from "./constant.js";

const key = await readFile("./privkey.pem");
const cert = await readFile("./cert.pem");
const options = {key,cert};
const httpsServer = createServer(options);
const port = process.env.PORT || 3001;

let gameState = {
  players: new Map(),
};
const inputQueue = [];
const snapshotHistory = [];

httpsServer.listen(port);

const io = new Server(httpsServer, {
  cors: {
    origin: "https://gamemagma.live",
    methods: ["GET", "POST"]
  },
  transports: ["polling", "websocket", "webtransport"]
});

io.on("connection", (socket) => {
  	console.log(`connected with transport ${socket.conn.transport.name}`);
	gameState.players.set(socket.id, new Player(socket.id, "Player", "#000000", 0, 0, 0));

	socket.on("input", (input) => {
		inputQueue.push(input);
	});

  	socket.on("disconnect", (reason) => {
    	console.log(`disconnected due to ${reason}`);
		gameState.players.delete(socket.id);
  	});
});

const h3Server = new Http3Server({
  port,
  host: "0.0.0.0",
  secret: "changeit",
  cert,
  privKey: key,
});

h3Server.startServer();

setInterval(() => {
	inputQueue.forEach((input) => {
		const player = gameState.players.get(input.socketId);
		if (player) {
			switch(input.type) {
				case "move":
					player.x += input.vx * PLAYER_MOVE_SPEED;
					player.y += input.vy * PLAYER_MOVE_SPEED;
					player.sequenceNumbers.push({
						sequenceNumber: input.sequenceNumber,
						x: player.x,
						y: player.y,
					});
					break;
				case "rotate":
					player.rotation += input.rotation;
					break;
				default:
					break;
			}
		}
	});
	inputQueue = [];
	io.emit("snapshot", gameState);
	//TODO: snapshot'i history'e gonder ve history kisminda temizlenmesi gereken bilgileri temizle
}, TICK_RATE);

(async () => {
  const stream = await h3Server.sessionStream("/socket.io/");
  const sessionReader = stream.getReader();

  while (true) {
    const { done, value } = await sessionReader.read();
    if (done) {
      break;
    }
    io.engine.onWebTransportSession(value);
  }
})();
