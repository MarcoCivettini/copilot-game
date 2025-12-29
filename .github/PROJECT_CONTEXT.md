### ThreeJS Online Low-poly Mini Battle Royale

---

## Visione del progetto

Questo progetto è un **gioco multiplayer online** sviluppato in **ThreeJS**, stile *battle royale lowpoly*, ma in versione ridotta e semplice.
Lo scopo è creare un’esperienza immediata, leggera, giocabile via browser, con match brevi e chiari.

Target:

* giocatori casual
* sessioni veloci
* nessuna complessità eccessiva

---

## Struttura generale del progetto

Il progetto è composto da:

### Frontend

* gestione gioco client-side (movimento, animazioni, rendering)
* sincronizzazione con server in tempo reale

### Backend

* server realtime (es. WebSocket)
* gestione lobby
* sincronizzazione stato dei player
* validazione eventi
* calcolo hit / eliminazioni / winner

### Nessun salvataggio permanente richiesto

* nessun account
* nessun database obbligatorio (se non logging eventuale)

---

## Flow di gioco (UX / Pagine)

---

### 1. Pagina Iniziale – Selezione Personaggio

Quando l’utente entra nel sito:

**UI**

* sfondo: video a schermo intero
* centro pagina:

  * input testo → nome personaggio
* sotto:

  * 3 box arma selezionabile (solo una)
  * icona pixel art arma:

    * Spada
    * Lancia
    * Arco

**Vincoli**

* nome obbligatorio
* arma obbligatoria
* se torna indietro dalla lobby il nome precedentemente inserito deve rimanere compilato

---

### 2. Lobby di Attesa

Dopo la selezione si entra nella lobby.

**Regole lobby**

* max 16 giocatori
* minimo 2 per avviare match

**UI**

* lista giocatori presenti:

  * nome
  * icona arma selezionata
* pulsanti in basso:

  * START → avvia partita (solo se condizioni minime)
  * INDIETRO → lascia lobby → torna a pagina iniziale (nome precompilato)

---

### 3. Inizio Partita

Quando la partita inizia:

* ogni giocatore viene spawnato in un punto casuale della mappa
* **mappa = cerchio raggio 30**
* se esci dal cerchio → eliminato
* countdown 5 secondi a schermo (centrale, grande)
* dopo countdown → gioco attivo

---

## Personaggi

Grafica:

* modello lowpoly
* semplicemente un rettangolo
* arma lowpoly in mano

Ogni giocatore vede:

* gli altri in realtime
* collisioni attive (non attraversabili)

---

## Controlli

* movimento:

  * W A S D
* attacco:

  * SPACE

---

## Sistema Armi & Attacchi

### Spada

* attacco: swing frontale
* distanza: 1
* danno: 2
* cooldown: 1s

### Lancia

* attacco: colpo frontale lungo
* distanza: 2.5
* danno: 4
* cooldown: 1s

### Arco

* attacco: proiettile
* distanza: 6
* danno: 7
* cooldown: 1s

---

## Danni & Feedback

Quando un colpo va a segno:

* particelle rosse “sangue”
* durata → 1 secondo
* hitbox deve coincidere col modello del player

---

## Sistema Vita

Ogni giocatore:

* 10 HP

Barra vita sopra ogni personaggio:

* verde piena a vita max
* diventa rossa da destra verso sinistra man mano che diminuisce

---

## Eliminazione

Quando HP = 0:

* personaggio sparisce
* il giocatore diventa spettatore
* visuale laterale della mappa
* può continuare a guardare

---

## Vittoria

Quando rimane 1 solo player:

* messaggio: **“Partita Finita”**
* dopo 10 secondi:

  * tutti vengono riportati alla pagina iniziale
  * nome precompilato
  * arma da riselezionare

---

## Requisiti Funzionali Chiave

* realtime multiplayer
* sincronizzazione movimento
* sincronizzazione attacchi
* gestione lobby
* gestione eliminazioni
* gestione vittoria

---

## Non Goals (cose da NON implementare per ora)

* nessun inventario
* nessun power-up
* nessuna progressione
* niente matchmaking avanzato
* niente ranking
* niente skin
* niente modalità multiple

---

## Quality Requirements

* gioco fluido
* risposta veloce attacchi
* movimenti smooth
* sincronizzazione affidabile
* niente lag estremo se possibile
* nessun bug logico tipo:

  * colpi che colpiscono fuori range
  * morte senza motivo
  * player immortali

---

## Regole Tecniche

* ThreeJS per grafica
* hit detection chiara e consistente
* evitare over-engineering
* mantenere codice leggibile e modulare

---
