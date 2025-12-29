# Copilot Prisma Instructions

## Rules
- Mantieni schema Prisma pulito e leggibile
- Aggiungi sempre relazioni chiare
- Usa enum quando possibile
- Aggiungi default sensati
- Usa migrations in modo coerente

## When Modifying Schema
- Non rompere compatibilità senza motivo
- Considera migrazioni lente
- Attenzione a cascade delete
- Documenta cambiamenti importanti

## Testing Requirement
- Genera sempre il corrispondente aggiornamento nei repository
- Aggiorna DTO / Typescript types se necessario

## Rilascio e Dev Experience
- Quando utilizzi una nuova dipendenza, assicurati di aggiornare i Dockerfile di conseguenza.
- Documenta setup locale per nuovi sviluppatori

## Contesto Progetto
Per il contesto completo del progetto e gli obiettivi funzionali,
fai riferimento a PROJECT_CONTEXT.md nel file /.github/PROJECT_CONTEXT.md del repository.
Segui le linee guida architetturali e le funzionalità indicate lì.