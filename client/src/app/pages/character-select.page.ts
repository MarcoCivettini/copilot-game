import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { ColyseusService } from '../services/colyseus.service';

@Component({
  selector: 'app-character-select',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './character-select.page.html',
  styleUrls: ['./character-select.page.scss']
})
export class CharacterSelectPage {
  playerName = '';
  weapon: 'sword' | 'spear' | 'bow' = 'sword';
  error = '';

  constructor(private colyseus: ColyseusService, private router: Router) {}

  async joinLobby() {
    if (!this.playerName.trim()) {
      this.error = 'Inserisci un nome valido';
      return;
    }
    try {
      await this.colyseus.joinLobby(this.playerName, this.weapon);
      this.router.navigate(['/lobby']);
    } catch (e) {
      this.error = 'Errore di connessione alla lobby';
    }
  }
}
