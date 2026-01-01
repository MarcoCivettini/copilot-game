/**
 * Configurazione delle armi del gioco
 * Segue le specifiche del PROJECT_CONTEXT.md
 */

export enum WeaponType {
  SWORD = 'SWORD',
  SPEAR = 'SPEAR',
  BOW = 'BOW'
}

export interface WeaponConfig {
  type: WeaponType;
  name: string;
  damage: number;
  range: number;
  cooldown: number; // in millisecondi
  projectileSpeed?: number; // unità al secondo per armi ranged
}

export const WEAPONS: Record<WeaponType, WeaponConfig> = {
  [WeaponType.SWORD]: {
    type: WeaponType.SWORD,
    name: 'Spada',
    damage: 2,
    range: 1,
    cooldown: 1000
  },
  [WeaponType.SPEAR]: {
    type: WeaponType.SPEAR,
    name: 'Lancia',
    damage: 4,
    range: 2.5,
    cooldown: 1000
  },
  [WeaponType.BOW]: {
    type: WeaponType.BOW,
    name: 'Arco',
    damage: 7,
    range: 6, // distanza massima in metri
    cooldown: 1000,
    projectileSpeed: 1.714 // 6 metri in 3.5 secondi
  }
};

/**
 * Configurazione generale del gioco
 */
export const GAME_CONFIG = {
  MAX_PLAYERS: 16,
  MIN_PLAYERS_TO_START: 2,
  PLAYER_MAX_HP: 10,
  MAP_RADIUS: 30,
  COUNTDOWN_DURATION: 5, // secondi
  END_GAME_DELAY: 10000, // millisecondi (10 secondi)
  PLAYER_SPEED: 3.6,
  TICK_RATE: 60 // aggiornamenti al secondo
};
