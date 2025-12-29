import { WeaponType } from '../config/game.config';

/**
 * Service per validazione e sanitizzazione input utente.
 */
export class ValidationService {
  /**
   * Sanitizza il nome del giocatore.
   * Rimuove spazi extra e limita lunghezza.
   */
  static sanitizeName(name: string): string {
    if (!name || typeof name !== 'string') {
      return 'Player';
    }
    return name.trim().substring(0, 20) || 'Player';
  }

  /**
   * Verifica se un'arma è valida.
   */
  static isValidWeapon(weaponType: string): weaponType is WeaponType {
    return Object.values(WeaponType).includes(weaponType as WeaponType);
  }

  /**
   * Valida i dati di join alla lobby.
   */
  static validateJoinData(data: { name?: string; weaponType?: string }): {
    valid: boolean;
    error?: string;
  } {
    if (!data.name || typeof data.name !== 'string') {
      return { valid: false, error: 'Nome mancante o non valido' };
    }

    if (!data.weaponType || !this.isValidWeapon(data.weaponType)) {
      return { valid: false, error: 'Tipo di arma non valido' };
    }

    return { valid: true };
  }
}
