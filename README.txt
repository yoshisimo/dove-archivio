DOV'È? — VERSIONE 0.4
======================

Un piccolo archivio personale per Android e computer.
Funzioni: ricerca, posizioni annidate, oggetti, fotografie dei luoghi,
spostamento, eliminazione, backup e ripristino.
NOVITÀ v0.3: nella sezione Oggetti puoi filtrare, selezionare più
oggetti insieme e assegnarli tutti alla stessa posizione.
Rimane disponibile la selezione multipla anche da una posizione.

IMPORTANTISSIMO
L'app conserva OGGETTI E FOTO SOLO NEL BROWSER/DISPOSITIVO su cui
la usi. NON si sincronizza tra telefono e PC. Se cancelli i dati del
sito, disinstalli o cambi telefono, potresti perdere l'archivio.
ESPORTA PERIODICAMENTE IL BACKUP dalla sezione "Dati" e custodisci
il file JSON al di fuori dell'app (es. cartella documenti o memoria esterna).

COME INSTALLARLA SU ANDROID (Chrome)
1. Estrai lo ZIP sul computer.
2. Pubblica tutti i file in una cartella su un servizio HTTPS per siti
   statici (es. GitHub Pages), mantenendo la cartella icons.
   Esempio GitHub Pages:
   - Crea un repository GitHub (pubblico per usare Pages gratuitamente).
   - Carica nel repository i FILE DENTRO la cartella dove-app.
   - Apri Settings > Pages > Deploy from a branch > main > /(root).
   - Attendi che GitHub mostri l'indirizzo HTTPS del sito.
3. Apri il sito HTTPS da Chrome su Android.
4. Menu ⋮ > "Installa app" o "Aggiungi a schermata Home".
5. Avvia una prima volta mentre sei connesso: poi i file dell'app sono
   disponibili anche offline.

Le sole risorse pubbliche sul sito sono i file dell'APPLICAZIONE; i dati
che inserisci e le foto rimangono nel database locale del browser.
Per impostazione predefinita non viene effettuato alcun invio dei tuoi
dati a un server. Se apri l'app su un altro dispositivo, l'archivio
inizialmente sarà vuoto.

TEST SU COMPUTER
Nella cartella dove-app, esegui:
    python3 -m http.server 8000
poi apri http://localhost:8000/ nel browser.

APERTURA DIRETTA COME FILE
Non aprire index.html tramite file:// per la versione definitiva: le
funzionalità offline/archiviazione possono comportarsi diversamente.
Per l'installazione da Chrome serve un'origine HTTPS o localhost.

BACKUP
Da Dati > Esporta backup scarichi UN file JSON che include anche le foto.
Per ripristinarlo: Dati > Importa backup. Attenzione: l'importazione
SOSTITUISCE i dati locali già presenti nel browser.

AGGIORNAMENTO DA v0.1 / v0.2 SU GITHUB PAGES
1. Dall’app già installata fai prima Dati > Esporta backup.
2. Sostituisci su GitHub tutti i file con quelli di questa versione.
3. Attendi la pubblicazione su GitHub Pages.
4. Ricarica l’app su Android (se necessario chiudi e riapri due volte).
5. Non cancellare i dati del sito e non disinstallare l’app.
   Il database rimane lo stesso; il backup è una precauzione importante.

PROSSIME VERSIONI POSSIBILI
- Categorie predefinite personalizzabili
- Più foto per ogni posizione
- Evidenziazione di scatole direttamente sulle foto
- QR code su scatole/cassetti

SELEZIONE MULTIPLA DA OGGETTI (v0.4)
1. Apri Oggetti e tocca «Seleziona più oggetti».
2. Filtra con «hard disk» per mostrare solo gli hard disk.
3. Selezionali singolarmente o tocca «Seleziona tutti i risultati».
4. Tocca «Assegna posizione».
5. Seleziona «Cassettiera → Cassetto inferiore → Scatola nera».
6. Conferma. Gli oggetti vengono SPOSTATI, non duplicati.
   Nome, categoria, quantità e note rimangono invariati.
La selezione può comprendere anche oggetti nascosti dal filtro corrente.
Usa «Deseleziona tutti» per azzerare completamente la selezione.


NOVITÀ VERSIONE 0.4
------------------
- Anteprima immediata della fotografia selezionata nella modifica posizione.
- Distinzione evidente tra foto ancora da salvare e foto già nell'archivio.
- Messaggio «Fotografia salvata correttamente» dopo la conferma IndexedDB.
- Conferma verde permanente nella scheda della posizione con la fotografia caricata.
- Eventuali errori di salvataggio sono mostrati anche nel modulo.
- Dopo il salvataggio viene aperta la scheda della posizione, anche per quelle nuove.

La versione 0.4 continua a usare lo stesso database locale delle versioni precedenti.
Esportare un backup JSON prima di aggiornare; non cancellare dati del sito o app.
