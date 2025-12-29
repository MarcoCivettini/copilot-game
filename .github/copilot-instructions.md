# Copilot Global Instructions

## Project Overview
Questo progetto è composto da:
- Backend: Node.js + TypeScript + Colyseus per server multiplayer realtime
- Database: PostgreSQL utilizzando Prisma ORM
- Frontend Angular con ThreeJS per grafica 3D
L'obiettivo è sviluppare codice robusto, manutenibile e sicuro.

## General Coding Guidelines
- Usa TypeScript con tipizzazione forte
- Niente `any`, preferire tipi espliciti
- Usa async/await, evita callback annidate
- Segui principi SOLID e Clean Code
- Mantieni funzioni piccole e leggibili
- Commenti JSDoc per funzioni pubbliche e servizi che ha senso che commentare 

## Error Handling
- Usa errori strutturati
- Non nascondere gli errori
- Log chiari e utili
- Non loggare mai dati sensibili

## Security Requirements
- Nessun accesso diretto a request.raw
- Valida sempre input utente
- Non esporre stack trace in produzione
- Evita SQL injection (Prisma aiuta ma verifica)
- Mai stampare token / password / segreti

## Architecture Rules
- Separazione netta tra:
  - controller (HTTP / API)
  - service (business logic)
  - repository (database)
- Nessuna logica business nei controller

## Response Style Copilot
Quando rispondi:
- Preferisci codice funzionante e sicuro
- Spiega brevemente perché la soluzione è corretta
- Se esistono alternative, proponi 1–2 varianti con pro/contro
