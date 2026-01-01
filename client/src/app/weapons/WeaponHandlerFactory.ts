import { IWeaponHandler } from './IWeaponHandler';
import { SwordHandler } from './SwordHandler';
import { SpearHandler } from './SpearHandler';
import { BowHandler } from './BowHandler';
import { PlayerMeshService } from '../services/player-mesh.service';

/**
 * Factory per creare handler di armi.
 * Applica il pattern Factory per incapsulare la creazione degli handler.
 */
export class WeaponHandlerFactory {
  private static swordHandler: SwordHandler | null = null;
  private static spearHandler: SpearHandler | null = null;
  private static bowHandler: BowHandler | null = null;

  /**
   * Crea l'handler appropriato per il tipo di arma.
   * Usa il pattern Singleton per riutilizzare gli handler.
   */
  static createHandler(
    weaponType: 'SWORD' | 'SPEAR' | 'BOW',
    playerMeshService: PlayerMeshService
  ): IWeaponHandler {
    switch (weaponType) {
      case 'SWORD':
        if (!this.swordHandler) {
          this.swordHandler = new SwordHandler(playerMeshService);
        }
        return this.swordHandler;

      case 'SPEAR':
        if (!this.spearHandler) {
          this.spearHandler = new SpearHandler(playerMeshService);
        }
        return this.spearHandler;

      case 'BOW':
        if (!this.bowHandler) {
          this.bowHandler = new BowHandler(playerMeshService);
        }
        return this.bowHandler;

      default:
        throw new Error(`Unknown weapon type: ${weaponType}`);
    }
  }

  /**
   * Pulisce tutti gli handler (se necessario).
   */
  static cleanup(): void {
    this.swordHandler = null;
    this.spearHandler = null;
    this.bowHandler = null;
  }
}
