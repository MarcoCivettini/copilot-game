# Copilot Global Instructions

## Project Overview
Multiplayer Battle Royale game (max 16 players) con architettura client-server:
- **Backend**: Node.js + TypeScript + Colyseus (realtime multiplayer framework) su porta 2567
- **Frontend**: Angular 17 + ThreeJS per rendering 3D su porta 4200
- **Database**: PostgreSQL con Prisma ORM (configurato ma non ancora utilizzato attivamente)
- **Monorepo**: workspace npm con `server/` e `client/` come sottoprogetti

Always use Context7 MCP when I need library/API documentation, code generation, setup or configuration steps without me having to explicitly ask.


## Quick Start Commands
```bash
# Installa tutto
npm run install:all

# Dev mode (avvia server + client contemporaneamente)
npm run dev

# Solo server o client
npm run dev:server  # oppure: cd server && npm run dev
npm run dev:client  # oppure: cd client && npm start
```

## Architecture Pattern: Colyseus Rooms + Schema Synchronization

### Server-Side (Colyseus Rooms)
- **Entry point**: `server/src/index.ts` registra le rooms `lobby` e `battle`
- **Rooms** (`server/src/rooms/`): gestiscono ciclo di vita, messaggi e game loop
  - `LobbyRoom`: raccolta giocatori prima della partita
  - `BattleRoom`: partita attiva con game loop a 60 FPS (`TICK_RATE`)
- **State Schemas** (`server/src/schemas/`): classi con decoratori `@type()` da `@colyseus/schema`
  - Sincronizzazione automatica dello stato ai client connessi
  - Esempio: `BattleState` con `MapSchema<Player>` e `MapSchema<Projectile>`
- **Services** (`server/src/services/`): logica pura senza dipendenze da Colyseus
  - `CombatService`: calcoli collisioni armi (line-sphere intersection)
  - `MapService`: spawn positions e boundary checks
  - `ValidationService`: input sanitization

### Client-Side (Angular + ThreeJS)
- **ColyseusService** (`client/src/app/services/colyseus.service.ts`): singleton per connessioni WebSocket
  - Usa `colyseus.js` client per join/create rooms
  - Mantiene riferimento a `Room<BattleState>` o `Room<LobbyState>`
- **Schema Mirror** (`client/src/app/schemas/`): DEVE corrispondere esattamente agli schema del server
  - Usa stessi decoratori `@type()` per deserializzazione automatica
  - Ogni modifica server-side richiede aggiornamento client-side
- **ThreeJS Services**:
  - `ThreeJsSceneService`: setup scena, luce, terreno
  - `PlayerMeshService`: crea/aggiorna mesh 3D dei giocatori
  - `CameraService`: gestione camera (terza persona follow)
  - `InputService`: tastiera (WASD + SPACE) → invia messaggi Colyseus

### Message-Based Communication Pattern
Invece di sincronizzare tutto via schema, alcune comunicazioni usano messaggi custom:
- **Client → Server**: `room.send('playerMove', { x, z, rotation })`
- **Server → Client**: `room.send('playerList', { players: [...] })` per aggiornamenti bulk
- Esempio in `BattleRoom.ts`: `handlePlayerMove()`, `handlePlayerAttack()`, `handleWeaponSwing()`

## Game Configuration (`server/src/config/game.config.ts`)
**Single Source of Truth** per costanti di gioco:
- `WEAPONS`: damage, range, cooldown per SWORD/SPEAR/BOW
- `GAME_CONFIG`: MAX_PLAYERS (16), PLAYER_MAX_HP (10), MAP_RADIUS (30), TICK_RATE (60)
- Usa sempre queste costanti, non valori hardcoded

## Critical Patterns

### 1. Schema Synchronization Rule
Quando modifichi uno schema:
1. Aggiorna `server/src/schemas/*.ts`
2. Copia esattamente in `client/src/app/schemas/*.ts`
3. Verifica che decoratori `@type()` corrispondano
4. Se aggiungi proprietà, considera retrocompatibilità

### 2. Service Layer Pattern
- **NO business logic in Rooms**: usa services per logica riutilizzabile
- Services sono stateless (metodi statici o dependency injection)
- Esempio: `CombatService.lineIntersectsSphere()` è puro calcolo matematico

### 3. ThreeJS Lifecycle (Battle Page)
```typescript
ngAfterViewInit() → setupThreeJS() → animate() loop
- updatePlayerMeshes() ogni frame
- camera follows myPlayer
- cleanup in ngOnDestroy() con renderer.dispose()
```

### 4. Weapon Attack Flow
**Melee (Sword/Spear)**:
1. Client: `room.send('playerAttack')`
2. Server: `BattleRoom.handlePlayerAttack()` → `CombatService.handleMeleeAttack()`
3. Server: invia `room.send('playerList')` con HP aggiornati
4. Client: aggiorna mesh e HUD

**Ranged (Bow)**:
1. Server: crea `Projectile` in `state.projectiles`
2. Game loop: `ProjectileService.updateProjectiles()` calcola movimento
3. Client: `ThreeJsSceneService` renderizza projectile in tempo reale

## Code Style & Conventions
- **TypeScript strict**: no `any`, tipi espliciti sempre
- **Async/await**: preferire a callbacks o Promises annidate
- **JSDoc**: solo per API pubbliche complesse (non ovvie)
- **Nomi file**: `kebab-case.service.ts`, `PascalCase.ts` per schema/rooms

## Security & Validation
- **Server è authority**: non fidarsi mai di input client
- Usa `ValidationService` per sanitizzare coordinate, nomi, weaponType
- No stack traces in produzione (Colyseus di default logga errori server-side)

## Debugging Tips
- Colyseus monitor: `http://localhost:2567/colyseus` (vedi rooms attive)
- Server logs: cerca `[BattleRoom]` o `[LobbyRoom]` per trace
- Client: `room.onMessage('*', (type, msg) => console.log(type, msg))` per debug messaggi

## Common Pitfalls
1. **Dimenticare schema sync**: se aggiungi campo server-side ma non client-side → undefined
2. **Cooldown bypass**: validare `lastAttackTime` server-side, non fidarsi del client
3. **Memory leaks**: sempre `leave()` room e dispose ThreeJS objects in `ngOnDestroy()`
4. **Race conditions**: Colyseus è single-threaded per room, ma attenzione a timing tra messaggi

## File Reference
- Project context: `.github/PROJECT_CONTEXT.md`
- Game rules: `README.md` (tabella armi, regole HP, mappa)
- Additional instructions: `.github/instructions/{backend,frontend,prisma}.instructions.md`
