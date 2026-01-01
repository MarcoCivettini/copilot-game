import { Room, Client, matchMaker } from 'colyseus';
import { LobbyState, LobbyPlayer } from '../schemas/LobbyState';
import { GAME_CONFIG, WeaponType } from '../config/game.config';
import { ValidationService } from '../services/validation.service';

/**
 * Messaggi ricevuti dai client
 */
interface JoinLobbyMessage {
  name: string;
  weaponType: WeaponType;
}

/**
 * LobbyRoom - Gestisce la lobby di attesa prima della partita
 * 
 * Flow:
 * 1. I giocatori si connettono e inviano nome + arma
 * 2. Aspettano che ci siano almeno MIN_PLAYERS_TO_START giocatori
 * 3. Quando qualcuno clicca START, la partita inizia
 * 4. Tutti i client vengono reindirizzati alla BattleRoom
 */
export class LobbyRoom extends Room<LobbyState> {
  maxClients = GAME_CONFIG.MAX_PLAYERS;

  onCreate(): void {
    this.setState(new LobbyState());
    console.info(`[LobbyRoom] Room ${this.roomId} created`);

    // Gestisce la richiesta di avvio partita
    this.onMessage('startGame', (client: Client) => {
      this.handleStartGame(client);
    });

    // Gestisce l'aggiornamento delle informazioni del giocatore
    this.onMessage('updatePlayer', (client: Client, message: JoinLobbyMessage) => {
      this.updatePlayerInfo(client, message);
    });
  }

  onJoin(client: Client, options: JoinLobbyMessage): void {
    console.info(`[LobbyRoom] Client ${client.sessionId} joined`);

    // Valida input usando ValidationService
    const validation = ValidationService.validateJoinData(options);
    if (!validation.valid) {
      console.warn('[LobbyRoom] Invalid join options:', validation.error);
      client.error(400, validation.error || 'Dati non validi');
      return;
    }

    // Crea il giocatore nella lobby
    const player = new LobbyPlayer();
    player.sessionId = client.sessionId;
    player.name = ValidationService.sanitizeName(options.name);
    player.weaponType = options.weaponType;
    player.isReady = true;

    this.state.players.set(client.sessionId, player);
    this.state.playerCount = this.state.players.size;

    console.debug(
      `[LobbyRoom] Player ${player.name} joined with weapon ${player.weaponType}. Total players: ${this.state.playerCount}`
    );

    // Invia la lista completa dei giocatori a tutti i client
    this.broadcastPlayerList();
  }

  onLeave(client: Client, consented: boolean): void {
    console.info(
      `[LobbyRoom] Client ${client.sessionId} left (consented: ${consented})`
    );

    this.state.players.delete(client.sessionId);
    this.state.playerCount = this.state.players.size;

    // Se la partita è già iniziata, non fare nulla
    if (this.state.gameStarted) {
      return;
    }

    // Invia la lista aggiornata a tutti
    this.broadcastPlayerList();
  }

  onDispose(): void {
    console.info(`[LobbyRoom] Room ${this.roomId} disposed`);
  }

  /**
   * Invia la lista completa dei giocatori a tutti i client
   */
  private broadcastPlayerList(): void {
    const playersList: Array<{
      sessionId: string;
      name: string;
      weaponType: string;
      isReady: boolean;
    }> = [];

    this.state.players.forEach(player => {
      playersList.push({
        sessionId: player.sessionId,
        name: player.name,
        weaponType: player.weaponType,
        isReady: player.isReady
      });
    });

    this.broadcast('playerList', { players: playersList });
    console.debug(`[LobbyRoom] Broadcasted player list with ${playersList.length} players`);
  }

  /**
   * Gestisce la richiesta di avvio partita
   */
  private async handleStartGame(client: Client): Promise<void> {
    // Verifica che il giocatore sia nella lobby
    if (!this.state.players.has(client.sessionId)) {
      client.error(400, 'Non sei nella lobby');
      return;
    }

    // Verifica numero minimo di giocatori
    if (this.state.playerCount < GAME_CONFIG.MIN_PLAYERS_TO_START) {
      client.send('gameStartError', {
        message: `Servono almeno ${GAME_CONFIG.MIN_PLAYERS_TO_START} giocatori per iniziare`
      });
      return;
    }

    // Evita avvio multiplo
    if (this.state.gameStarted) {
      return;
    }

    this.state.gameStarted = true;

    console.log(`[LobbyRoom] Game starting with ${this.state.playerCount} players`);

    // Crea una BattleRoom usando matchMaker
    const battleRoom = await matchMaker.createRoom('battle', {});
    console.log(`[LobbyRoom] Created BattleRoom with ID: ${battleRoom.roomId}`);

    // Prepara i dati dei giocatori per la BattleRoom
    const playersData: Array<{
      sessionId: string;
      name: string;
      weaponType: string;
    }> = [];

    this.state.players.forEach(player => {
      playersData.push({
        sessionId: player.sessionId,
        name: player.name,
        weaponType: player.weaponType
      });
    });

    // Notifica tutti i client di passare alla BattleRoom specifica
    this.broadcast('gameStarting', {
      battleRoomId: battleRoom.roomId,
      players: playersData
    });

    // Chiudi la lobby dopo un breve delay per permettere ai client di disconnettersi
    this.clock.setTimeout(() => {
      this.disconnect();
    }, 2000);
  }

  /**
   * Aggiorna le informazioni di un giocatore (nome o arma)
   */
  private updatePlayerInfo(client: Client, message: JoinLobbyMessage): void {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;

    if (message.name) {
      player.name = ValidationService.sanitizeName(message.name);
    }

    if (message.weaponType && ValidationService.isValidWeapon(message.weaponType)) {
      player.weaponType = message.weaponType;
    }
  }
}
