import { Routes } from '@angular/router';
import { CharacterSelectPage } from './pages/character-select.page';
import { LobbyPage } from './pages/lobby.page';
import { BattlePage } from './pages/battle.page';

export const routes: Routes = [
  { path: '', component: CharacterSelectPage },
  { path: 'lobby', component: LobbyPage },
  { path: 'battle', component: BattlePage },
  { path: '**', redirectTo: '' }
];
