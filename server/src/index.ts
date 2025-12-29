import { Server } from 'colyseus';
import { createServer } from 'http';
import express from 'express';
import cors from 'cors';
import { LobbyRoom } from './rooms/LobbyRoom';
import { BattleRoom } from './rooms/BattleRoom';

/**
 * Server principale del gioco
 * Configura Express + Colyseus e registra le rooms
 */

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 2567;
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Crea il server HTTP
const httpServer = createServer(app);

// Crea il server Colyseus
const gameServer = new Server({
  server: httpServer,
  express: app
});

// Registra le rooms
gameServer.define('lobby', LobbyRoom);
gameServer.define('battle', BattleRoom);

// Avvia il server
gameServer.listen(PORT);

console.log(`🎮 Colyseus server listening on http://localhost:${PORT}`);
console.log(`📊 Monitor available at http://localhost:${PORT}/colyseus`);
