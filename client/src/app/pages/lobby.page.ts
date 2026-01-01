import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ColyseusService } from '../services/colyseus.service';

interface PlayerDisplay {
  sessionId: string;
  name: string;
  weaponType: string;
  isReady: boolean;
}

@Component({
  selector: 'app-lobby',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './lobby.page.html',
  styleUrls: ['./lobby.page.scss']
})
export class LobbyPage implements OnInit, OnDestroy {
  players: PlayerDisplay[] = [];
  roomId = '';
  isOwner = false;

  constructor(private colyseus: ColyseusService, private router: Router) {}

  ngOnInit() {
    const room = this.colyseus.getRoom();
    if (!room) {
      // Se non c'è una room, torna alla home
      console.error('[LobbyPage] No room found, redirecting to home');
      this.router.navigate(['/']);
      return;
    }

    this.roomId = room.roomId;
    console.log('[LobbyPage] Room ID:', this.roomId);

    // Per ora tutti sono owner (semplificazione)
    this.isOwner = true;

    // Ascolta la lista dei giocatori inviata dal server
    room.onMessage('playerList', (data: { players: PlayerDisplay[] }) => {
      console.log('[LobbyPage] Received player list:', data.players);
      this.players = data.players;
      console.log('[LobbyPage] Total players:', this.players.length);
    });

    // Ascolta il messaggio di avvio partita
    room.onMessage('gameStarting', async (data: { battleRoomId: string, players: any[] }) => {
      console.log('[LobbyPage] Game starting, battle room ID:', data.battleRoomId);
      
      // Lascia la lobby
      await room.leave();
      
      // Connettiti alla battle room specifica
      try {
        await this.colyseus.joinBattleById(data.battleRoomId);
        this.router.navigate(['/battle']);
      } catch (error) {
        console.error('[LobbyPage] Error joining battle:', error);
        this.router.navigate(['/']);
      }
    });
  }

  ngOnDestroy() {
    // Cleanup se necessario
  }

  getWeaponIcon(weaponType: string): string {
    const icons: { [key: string]: string } = {
      'SWORD': '⚔️',
      'SPEAR': '🔱',
      'BOW': '🏹'
    };
    return icons[weaponType.toUpperCase()] || '🗡️';
  }

  getWeaponImage(weaponType: string): string {
    const images: { [key: string]: string } = {
      'SWORD': 'assets/images/spada.png',
      'SPEAR': 'assets/images/lancia.png',
      'BOW': 'assets/images/arco.png'
    };
    return images[weaponType.toUpperCase()] || '';
  }

  onImageError(event: Event, weaponType: string): void {
    const img = event.target as HTMLImageElement;
    const images: { [key: string]: string } = {
      'SWORD': 'assets/images/sword.png',
      'SPEAR': 'assets/images/spear.png',
      'BOW': 'assets/images/bow.png'
    };
    img.src = images[weaponType.toUpperCase()] || '';
  }

  startGame() {
    const room = this.colyseus.getRoom();
    if (room) {
      room.send('startGame');
    }
  }

  leaveLobby() {
    this.colyseus.leaveRoom();
    this.router.navigate(['/']);
  }
}
