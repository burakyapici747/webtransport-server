import { readFile } from "node:fs/promises";
import { createServer } from "node:https";
import { Server } from "socket.io";
import { Http3Server } from "@fails-components/webtransport";

// Game-specific constants
const COLORS = [
  '#ff0000', '#00ff00', '#0000ff', '#ffff00', 
  '#ff00ff', '#00ffff', '#ff8000', '#8000ff',
  '#0080ff', '#ff0080'
];

// Game state
const players = new Map();
const availableColors = [...COLORS];

const key = await readFile("./privkey.pem");
const cert = await readFile("./cert.pem");
const options = {key,cert};

const httpsServer = createServer(options);

const port = process.env.PORT || 3001;

httpsServer.listen(port, () => {
  console.log(`server listening at https://localhost:${port}`);
});

const io = new Server(httpsServer, {
  cors: {
    origin: "https://gamemagma.live",
    methods: ["GET", "POST"]
  },
  transports: ["polling", "websocket", "webtransport"]
});

function getRandomColor() {
  if (availableColors.length === 0) return '#' + Math.floor(Math.random()*16777215).toString(16);
  const randomIndex = Math.floor(Math.random() * availableColors.length);
  return availableColors.splice(randomIndex, 1)[0];
}

function returnColorToPool(color) {
  if (COLORS.includes(color) && !availableColors.includes(color)) {
    availableColors.push(color);
  }
}

io.on("connection", (socket) => {
  console.log(`connected with transport ${socket.conn.transport.name}`);

  // Handle ping
  socket.on('ping', () => {
    socket.emit('pong');
  });

  socket.on("player:join", (username) => {
    const playerColor = getRandomColor();
    const playerData = {
      id: socket.id,
      username,
      color: playerColor,
      x: Math.random() * 800,
      y: Math.random() * 600,
      rotation: 0
    };
    
    players.set(socket.id, playerData);
    
    // Send initial state to the new player
    socket.emit("game:init", {
      player: playerData,
      players: Array.from(players.values())
    });
    
    // Notify others about new player
    socket.broadcast.emit("player:new", playerData);
  });

  socket.on("player:move", (data) => {
    const player = players.get(socket.id);
    if (player) {
      player.x = data.x;
      player.y = data.y;
      player.rotation = data.rotation;
      socket.broadcast.emit("player:moved", player);
    }
  });

  socket.on("disconnect", (reason) => {
    const player = players.get(socket.id);
    if (player) {
      returnColorToPool(player.color);
      players.delete(socket.id);
      io.emit("player:left", socket.id);
    }
    console.log(`disconnected due to ${reason}`);
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
