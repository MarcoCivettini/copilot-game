# Copilot Backend Instructions

## Technologies
- Node.js
- TypeScript
- Express / NestJS (specifica quello che usi)
- Prisma
- PostgreSQL
- SocketIO (se serve scambio in tempo reale)
- Colyseus (framework per multiplayer)

## Backend Conventions
- Controller: solo gestione request/response
- Services: logica applicativa
- Repository: interazione DB
- Evitare accessi diretti a Prisma fuori dai repository

## Prisma Usage Guidelines
- Usa `prismaClient` condiviso
- Evita query non tipizzate
- Gestisci transazioni quando modifichi più entità
- Considera race conditions
- Usa `select` e `include` consapevolmente (no over-fetching)

## API Design
- REST chiaro
- Validazione input
- Status code corretti
- Errori strutturati

## COLYSEUS / WEBSOCKET Guidelines
- Gestione connessioni/disconnessioni
- Sincronizzazione stato giocatori
- Rate limiting se necessario


## Testing Backend
- Unit test per services
- Integration test per controller
- Fake DB o test DB separato
