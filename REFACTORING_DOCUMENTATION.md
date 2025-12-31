# Refactoring del Sistema di Attacco - Documentazione Tecnica

## Panoramica

Questo refactoring ha applicato il **Strategy Pattern** per separare la logica di gestione degli attacchi secondo i principi di **Clean Code** e **SOLID**, facilitando l'aggiunta futura di nuove armi.

## Architettura

### Pattern Applicati

1. **Strategy Pattern**: Ogni tipo di arma ha la propria strategia di attacco
2. **Factory Pattern**: Factory per creare istanze delle strategie
3. **Single Responsibility Principle**: Ogni classe ha una singola responsabilità ben definita
4. **Open/Closed Principle**: Facile aggiungere nuove armi senza modificare codice esistente

## Struttura Server-Side

### Interfacce e Strategie

```
server/src/weapons/
├── IWeaponStrategy.ts          # Interfaccia per strategie armi
├── MeleeWeaponStrategy.ts      # Strategia per armi da mischia (Spada, Lancia)
├── HitboxWeaponStrategy.ts     # Strategia per armi con hitbox animata (Spada)
├── RangedWeaponStrategy.ts     # Strategia per armi a distanza (Arco)
├── WeaponStrategyFactory.ts    # Factory per creare strategie
└── AttackHandler.ts            # Handler per gestire gli attacchi
```

### Responsabilità delle Classi

#### `IWeaponStrategy`
- Definisce il contratto per tutte le strategie di armi
- Metodi: `handleAttack()`, `canAttack()`

#### `MeleeWeaponStrategy`
- Gestisce attacchi corpo a corpo
- Verifica range e direzione dell'attacco
- Applica danno ai nemici nel range

#### `HitboxWeaponStrategy`
- Gestisce attacchi con hitbox durante l'animazione
- Previene colpi multipli sullo stesso nemico durante un singolo swing
- Traccia gli swing attivi per gestire il cooldown

#### `RangedWeaponStrategy`
- Gestisce creazione di proiettili
- Verifica cooldown prima di sparare

#### `WeaponStrategyFactory`
- Crea e gestisce istanze delle strategie
- Usa Singleton pattern per strategie stateless

#### `AttackHandler`
- Coordina le diverse strategie
- Gestisce attacchi standard e hitbox
- Applica danno ai nemici colpiti

## Struttura Client-Side

```
client/src/app/weapons/
├── IWeaponHandler.ts           # Interfaccia per handler armi
├── SwordHandler.ts             # Handler per animazione spada
├── SpearHandler.ts             # Handler per animazione lancia
├── BowHandler.ts               # Handler per animazione arco
└── WeaponHandlerFactory.ts     # Factory per creare handler
```

### Responsabilità delle Classi

#### `IWeaponHandler`
- Definisce il contratto per handler di armi
- Metodo: `handleAttack()`

#### `SwordHandler`
- Gestisce animazione swing della spada
- Invia posizioni dell'arma per collision detection

#### `SpearHandler`
- Gestisce animazione lancia
- Placeholder per futura animazione thrust

#### `BowHandler`
- Gestisce animazione arco
- Invia messaggio per creare proiettile

#### `WeaponHandlerFactory`
- Crea handler appropriati per tipo di arma
- Usa Singleton pattern per riutilizzare handler

## Modifiche al Codice Esistente

### BattleRoom (Server)
**Prima:**
- Logica di attacco mescolata con gestione room
- Switch/if per gestire diversi tipi di armi
- Gestione swing duplicata

**Dopo:**
- Delega attacchi all'`AttackHandler`
- Codice più pulito e leggibile
- Facile da estendere

### battle.page.ts (Client)
**Prima:**
- Logica di attacco nel component
- If/else per diversi tipi di armi

**Dopo:**
- Delega all'appropriato `WeaponHandler` via Factory
- Component focalizzato su UI e coordinamento

## Vantaggi del Refactoring

### Manutenibilità
- Codice organizzato in classi con responsabilità chiare
- Facile individuare e modificare comportamento di un'arma specifica

### Estensibilità
- Aggiungere nuove armi richiede solo:
  1. Nuova strategia nel server
  2. Nuovo handler nel client
  3. Registrazione nella factory
- Nessuna modifica al codice esistente

### Testabilità
- Ogni strategia può essere testata indipendentemente
- Mock facili da creare per unit testing

### Leggibilità
- Nomi chiari e descrittivi
- Separazione delle responsabilità
- Commenti JSDoc su classi e metodi pubblici

## Come Aggiungere una Nuova Arma

### Server-Side

1. Aggiungere configurazione in `game.config.ts`:
```typescript
export const WEAPONS: Record<WeaponType, WeaponConfig> = {
  // ...
  [WeaponType.HAMMER]: {
    type: WeaponType.HAMMER,
    name: 'Martello',
    damage: 5,
    range: 1.5,
    cooldown: 1500
  }
};
```

2. Creare strategia se necessario o riutilizzare esistente:
```typescript
// Se ha comportamento unico, creare HammerWeaponStrategy.ts
// Altrimenti usare MeleeWeaponStrategy con configurazione HAMMER
```

3. Registrare nella factory se strategia custom

### Client-Side

1. Creare handler in `weapons/HammerHandler.ts`:
```typescript
export class HammerHandler implements IWeaponHandler {
  handleAttack(playerMesh: PlayerMesh, room: Room): void {
    // Implementare animazione hammer
    room.send('playerAttack', { timestamp: Date.now() });
  }
}
```

2. Registrare nella factory:
```typescript
case 'HAMMER':
  if (!this.hammerHandler) {
    this.hammerHandler = new HammerHandler();
  }
  return this.hammerHandler;
```

## Retrocompatibilità

Il refactoring mantiene **100% retrocompatibilità**:
- Tutti i messaggi Colyseus rimangono invariati
- Logica di gioco identica
- Nessuna breaking change per i client

## Testing Effettuato

- ✅ Build server successful
- ✅ Build client successful
- ✅ Server starts without errors
- ✅ Client connects to server
- ✅ Lobby functionality works
- ✅ All three weapons (Sword, Spear, Bow) selectable

## Conclusione

Questo refactoring ha trasformato il codice da una struttura procedurale a un'architettura orientata agli oggetti seguendo i principi SOLID, rendendo il sistema di combattimento:

- **Più facile da capire**: Ogni classe ha uno scopo chiaro
- **Più facile da estendere**: Aggiungere armi è semplice e sicuro
- **Più facile da testare**: Componenti isolati e mockabili
- **Più manutenibile**: Modifiche localizzate, nessun side effect

Il codice è ora pronto per l'aggiunta di nuove armi come Lancia e Arco con modelli, animazioni e gestione del danno differenti.
