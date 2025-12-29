# 🎮 Mini Battle Royale - ThreeJS Multiplayer Game

Un mini battle royale online lowpoly per max 16 giocatori, sviluppato con **ThreeJS** (frontend) e **Colyseus** (backend).

---

## 🏗️ Struttura del Progetto

```
/
├── client/          # Angular + ThreeJS (Frontend)
├── server/          # Node.js + TypeScript + Colyseus (Backend)
├── .github/         # Istruzioni e contesto del progetto
└── README.md
```

---

## 🚀 Quick Start

### Prerequisiti

- **Node.js** >= 18.x
- **npm** >= 9.x

### 1️⃣ Installazione Dipendenze

Dalla root del progetto:

```bash
npm run install:all
```

Questo comando installerà le dipendenze per:
- Root del progetto
- Server (Colyseus)
- Client (Angular)

### 2️⃣ Avviare il Progetto in Modalità Sviluppo

Dalla root del progetto:

```bash
npm run dev
```

Questo comando avvia **contemporaneamente**:
- **Server** su `http://localhost:2567`
- **Client** su `http://localhost:4200`

### Oppure avvia separatamente:

**Solo Server:**
```bash
npm run dev:server
# oppure
cd server && npm run dev
```

**Solo Client:**
```bash
npm run dev:client
# oppure
cd client && npm start
```

---

## 🎮 Come Giocare

1. Apri il browser su `http://localhost:4200`
2. Inserisci il tuo **nome**
3. Seleziona la tua **arma** (Spada, Lancia o Arco)
4. Entra nella **Lobby**
5. Aspetta altri giocatori (minimo 2, massimo 16)
6. Clicca **START** per iniziare la partita
7. Usa **WASD** per muoverti e **SPAZIO** per attaccare
8. Sopravvivi ed elimina gli avversari!

---

## ⚔️ Armi Disponibili

| Arma    | Distanza | Danno | Cooldown |
|---------|----------|-------|----------|
| Spada   | 1        | 2     | 1s       |
| Lancia  | 2.5      | 4     | 1s       |
| Arco    | 6        | 7     | 1s       |

---

## 🧩 Regole del Gioco

- Ogni giocatore ha **10 HP**
- La mappa è un **cerchio con raggio 30**
- Se esci dal cerchio → **eliminato**
- Countdown di **5 secondi** all'inizio della partita
- Quando rimane **1 solo giocatore** → partita finita
- Dopo 10 secondi tutti tornano alla pagina iniziale

---

## 🛠️ Comandi Disponibili

### Root

| Comando              | Descrizione                                    |
|----------------------|------------------------------------------------|
| `npm run install:all`| Installa tutte le dipendenze                   |
| `npm run dev`        | Avvia server + client in modalità sviluppo    |
| `npm run build`      | Build di server + client per produzione       |

### Server (`/server`)

| Comando              | Descrizione                                    |
|----------------------|------------------------------------------------|
| `npm run dev`        | Avvia il server Colyseus in modalità watch    |
| `npm run build`      | Compila TypeScript in JavaScript              |
| `npm start`          | Avvia il server compilato (produzione)        |

### Client (`/client`)

| Comando              | Descrizione                                    |
|----------------------|------------------------------------------------|
| `npm start`          | Avvia Angular dev server su porta 4200        |
| `npm run build`      | Build di produzione                            |
| `npm test`           | Esegue i test unitari                          |

---

## 🎨 Modelli 3D Low-Poly

Il gioco utilizza modelli **low-poly** placeholder generati con ThreeJS (BoxGeometry).

### 🔽 Dove trovare modelli low-poly gratuiti:

- **[Kenney.nl](https://kenney.nl/)** - Asset pack gratuiti low-poly
- **[Quaternius](https://quaternius.com/)** - Ultimate Low Poly Characters
- **[Poly Pizza](https://poly.pizza/)** - Archivio Google Poly
- **[Sketchfab](https://sketchfab.com/search?features=downloadable&licenses=322a749bcfa841b29dff1e8a1bb74b0b&sort_by=-relevance&type=models)** - Filtro CC0

### 📝 Come sostituire i modelli placeholder:

1. Scarica i modelli in formato `.glb` o `.gltf`
2. Posiziona i file in `client/src/assets/models/`
3. Modifica il file `client/src/app/services/game.service.ts`:
   - Cerca `// PLACEHOLDER: Sostituisci con modello 3D reale`
   - Usa `GLTFLoader` per caricare i tuoi modelli

**Esempio:**

```typescript
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';

const loader = new GLTFLoader();
loader.load('assets/models/player.glb', (gltf) => {
  const model = gltf.scene;
  this.scene.add(model);
});
```

---

## 🏛️ Architettura

### Backend (Colyseus)

- **LobbyRoom**: Gestisce la lobby di attesa e la selezione dei giocatori
- **BattleRoom**: Gestisce la logica di gioco in tempo reale
- **Schemas**: Definiscono lo stato sincronizzato tra server e client
- **Services**: Logica applicativa separata (gestione armi, danni, eliminazioni)

### Frontend (Angular + ThreeJS)

- **HomePage**: Selezione nome e arma
- **LobbyPage**: Attesa giocatori
- **GamePage**: Partita 3D con ThreeJS
- **GameService**: Gestione scena 3D, rendering, controlli
- **ColyseusService**: Connessione WebSocket con il server

---

## 📦 Dipendenze Principali

### Server
- `colyseus` - Framework multiplayer real-time
- `@colyseus/schema` - State synchronization
- `express` - Web server
- `typescript` - Type safety

### Client
- `@angular/core` - Framework frontend
- `three` - Libreria 3D
- `colyseus.js` - Client Colyseus
- `rxjs` - Reactive programming

---

## 🐛 Troubleshooting

### Il server non si avvia
```bash
cd server
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Il client non si avvia
```bash
cd client
rm -rf node_modules package-lock.json
npm install
npm start
```

### Errore di connessione WebSocket
- Verifica che il server sia avviato su `http://localhost:2567`
- Controlla che non ci siano firewall che bloccano la porta

---

## 📄 Licenza

MIT

---

## 👨‍💻 Sviluppo

Per maggiori dettagli sul contesto del progetto e le linee guida di sviluppo, consulta:

- `.github/PROJECT_CONTEXT.md` - Specifiche complete del gioco
- `.github/copilot-instructions.md` - Linee guida generali
- `.github/instructions/backend.instructions.md` - Convenzioni backend
- `.github/instructions/frontend.instructions.md` - Convenzioni frontend

---

**Buon divertimento! 🎮**
