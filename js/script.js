document.addEventListener('DOMContentLoaded', () => {
    let players = [];
    let startingLife = 40;
    let numActivePlayers = 2;
    let matchHistory = [];
    let gameTimerInterval;
    let elapsedSeconds = 0;
    let gameInProgress = false; // Para saber si hay una partida activa
    let gameWon = false; // Para controlar el estado de victoria

    // Para la funcionalidad de mantener presionado
    let lifeChangeAmount = 0;
    let lifeChangeInterval;
    let lifeChangeTimeout; // Para iniciar el conteo después de un breve delay
    const HOLD_DELAY = 500; // ms antes de que empiece el conteo rápido
    const HOLD_INTERVAL_SPEED = 100; // ms para cada incremento/decremento al mantener presionado

    const playerCardsContainer = document.getElementById('player-cards-container');
    const formatSelect = document.getElementById('format-select');
    const numPlayersSelect = document.getElementById('num-players-select');
    const resetGameBtn = document.getElementById('reset-game-btn');
    const timerDisplay = document.getElementById('timer-display');
    const matchHistoryBody = document.getElementById('match-history-body');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    const defaultImages = ["img/default-card-bg1.jpg", "img/default-card-bg2.jpg", "img/default-card-bg1.jpg", "img/default-card-bg2.jpg", "img/default-card-bg1.jpg", "img/default-card-bg2.jpg"]; // Añade más si quieres variedad

    // --- INICIALIZACIÓN Y ESTADO ---
    function initializePlayers(count) {
        const newPlayers = [];
        const storedPlayers = JSON.parse(localStorage.getItem('mtgPlayersData'))?.players || [];
        const currentStartingLife = parseInt(formatSelect.value);

        for (let i = 0; i < count; i++) {
            const playerId = `player${i + 1}`;
            let playerData;
            const storedP = storedPlayers.find(p => p.id === playerId);

            if (storedP && storedPlayers.length === count) { // Solo usar si el número de jugadores no cambió
                playerData = { ...storedP };
                playerData.life = currentStartingLife; // Siempre resetea la vida al formato actual
                playerData.poison = 0;
                playerData.commanderDamageReceivedFrom = {};
                // Reinicializar commanderDamage para oponentes correctos
                for (let j = 0; j < count; j++) {
                    if (i === j) continue;
                    const opponentIdForCmd = `player${j + 1}`;
                    playerData.commanderDamageReceivedFrom[opponentIdForCmd] = 0;
                }
                playerData.isLoser = false;
                playerData.isWinner = false;
            } else {
                playerData = {
                    id: playerId,
                    name: `Jugador ${i + 1}`,
                    life: currentStartingLife,
                    poison: 0,
                    commanderDamageReceivedFrom: {}, // { opponentId: damage }
                    image: defaultImages[i % defaultImages.length],
                    isLoser: false,
                    isWinner: false,
                };
                for (let j = 0; j < count; j++) {
                    if (i === j) continue;
                    const opponentIdForCmd = `player${j + 1}`;
                    playerData.commanderDamageReceivedFrom[opponentIdForCmd] = 0;
                }
            }
            newPlayers.push(playerData);
        }
        return newPlayers;
    }

    function saveState() {
        const stateToSave = {
            players: players.slice(0, numActivePlayers).map(p => ({
                id: p.id,
                name: p.name,
                image: p.image,
                // No guardamos vida, veneno, cmd, isLoser, isWinner para que siempre inicien frescos
            })),
            numActivePlayers: numActivePlayers,
            selectedFormat: formatSelect.value,
            matchHistory: matchHistory,
        };
        localStorage.setItem('mtgPlayersData', JSON.stringify(stateToSave));
    }

    function loadState() {
        const storedData = JSON.parse(localStorage.getItem('mtgPlayersData'));
        if (storedData) {
            numPlayersSelect.value = storedData.numActivePlayers || 2;
            formatSelect.value = storedData.selectedFormat || 40;
            matchHistory = storedData.matchHistory || [];

            numActivePlayers = parseInt(numPlayersSelect.value);
            startingLife = parseInt(formatSelect.value);
            players = initializePlayers(numActivePlayers); // Esto usa nombres/imágenes guardados si es aplicable

        } else {
            numActivePlayers = parseInt(numPlayersSelect.value);
            startingLife = parseInt(formatSelect.value);
            players = initializePlayers(numActivePlayers);
        }
        renderAllCards();
        renderMatchHistory();
    }

    // --- LÓGICA DEL JUEGO ---
    function checkGameEndConditions() {
        if (gameWon) return; // Si ya ganó alguien, no hacer nada más

        let activePlayersList = players.slice(0, numActivePlayers);
        let nonLosers = [];

        activePlayersList.forEach(player => {
            if (player.isLoser) return; // Si ya está marcado como perdedor, no re-evaluar

            let lostThisCheck = false;
            if (player.life <= 0 || player.poison >= 10) {
                lostThisCheck = true;
            }
            for (const opponentId in player.commanderDamageReceivedFrom) {
                if (player.commanderDamageReceivedFrom[opponentId] >= 21) {
                    lostThisCheck = true;
                    break;
                }
            }
            if (lostThisCheck) {
                player.isLoser = true;
            }

            if (!player.isLoser) {
                nonLosers.push(player);
            }
        });

        if (nonLosers.length === 1 && activePlayersList.length > 1) {
            nonLosers[0].isWinner = true;
            gameWon = true;
            stopTimer();
            logMatchResult("Victoria: " + nonLosers[0].name);
            renderAllCards(); // Para mostrar el estado de victoria
        } else if (nonLosers.length === 0 && activePlayersList.length > 0) {
            // Empate o todos pierden simultáneamente
            gameWon = true; // Consideramos el juego terminado
            stopTimer();
            logMatchResult("Empate / Todos pierden");
            renderAllCards();
        }
        else {
            renderAllCards(); // Actualizar para mostrar perdedores
        }
    }

    function resetGame(isFullReset = true) {
        if (gameInProgress && !gameWon && isFullReset) { // Si se reinicia una partida no terminada
            logMatchResult("No Terminada");
        }
        gameWon = false;
        stopTimer();
        elapsedSeconds = 0;
        updateTimerDisplay();

        startingLife = parseInt(formatSelect.value);
        numActivePlayers = parseInt(numPlayersSelect.value);

        // Si no es un full reset (ej. cambio de formato/jugadores sin tocar botón),
        // se intenta mantener nombres/imágenes. initializePlayers lo maneja.
        players = initializePlayers(numActivePlayers); // Esto resetea vidas, contadores, y estados de victoria/derrota

        renderAllCards();
        startTimer();
        gameInProgress = true;
        if (isFullReset) saveState(); // Guardar solo en reset explícito para no sobreescribir nombres/imágenes muy rápido
    }


    // --- TEMPORIZADOR ---
    function startTimer() {
        if (gameTimerInterval) clearInterval(gameTimerInterval);
        gameInProgress = true;
        gameTimerInterval = setInterval(() => {
            elapsedSeconds++;
            updateTimerDisplay();
        }, 1000);
    }

    function stopTimer() {
        clearInterval(gameTimerInterval);
        gameTimerInterval = null;
        // gameInProgress se maneja en resetGame o checkGameEndConditions
    }

    function updateTimerDisplay() {
        const hours = Math.floor(elapsedSeconds / 3600);
        const minutes = Math.floor((elapsedSeconds % 3600) / 60);
        const seconds = elapsedSeconds % 60;
        timerDisplay.textContent =
            `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }

    // --- HISTORIAL DE PARTIDAS ---
    function logMatchResult(status) {
        const matchData = {
            id: matchHistory.length + 1,
            players: players.slice(0, numActivePlayers).map(p => ({
                name: p.name,
                life: p.life,
                isWinner: p.isWinner,
                isLoser: p.isLoser
            })),
            duration: timerDisplay.textContent,
            status: status
        };
        matchHistory.push(matchData);
        renderMatchHistory();
        saveState(); // Guardar historial
        gameInProgress = false; // La partida actual ha concluido
    }

    function renderMatchHistory() {
        matchHistoryBody.innerHTML = '';
        if (matchHistory.length === 0) {
            matchHistoryBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">No hay partidas registradas.</td></tr>`;
            return;
        }
        matchHistory.forEach((match, index) => {
            const row = matchHistoryBody.insertRow();
            row.insertCell().textContent = match.id;

            const playersCell = row.insertCell();
            playersCell.className = "px-3 py-2 text-xs";
            match.players.forEach(p => {
                const statusClass = p.isWinner ? "text-blue-400" : (p.isLoser ? "text-red-400" : "text-gray-300");
                playersCell.innerHTML += `<span class="${statusClass}">${p.name} (${p.life})</span><br>`;
            });

            row.insertCell().textContent = match.duration;
            row.insertCell().textContent = match.status;
        });
    }

    function clearMatchHistory() {
        if (confirm("¿Estás seguro de que quieres borrar todo el historial de partidas?")) {
            matchHistory = [];
            renderMatchHistory();
            saveState();
        }
    }


    // --- RENDERIZADO DE TARJETAS ---
    function renderPlayerCard(player, allActivePlayers) {
        const cardWrapper = document.createElement('div');
        cardWrapper.id = `${player.id}-card-wrapper`;
        // Aplicar clases de ganador/perdedor al wrapper para que el ::after funcione correctamente
        cardWrapper.className = `player-card-wrapper rounded-xl shadow-2xl overflow-hidden transition-all duration-300 relative ${player.isWinner ? 'player-winner' : ''} ${player.isLoser ? 'player-lost' : ''}`;
        cardWrapper.style.backgroundImage = `url('${player.image}')`;
        cardWrapper.style.backgroundSize = 'cover';
        cardWrapper.style.backgroundPosition = 'center';

        // Nuevo div interno para que el ::after del overlay no oculte el contenido si usamos opacidad en cardContent
        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'player-card-content-wrapper relative'; // Necesario para el ::after

        const cardContent = document.createElement('div');
        cardContent.className = 'player-card-content bg-black bg-opacity-75 p-3 md:p-4 flex flex-col justify-between min-h-[380px] sm:min-h-[420px]';

        // Sección Superior: Nombre e Imagen
        const topSection = document.createElement('div');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = player.name;
        nameInput.className = "text-xl md:text-2xl font-['MedievalSharp'] bg-transparent border-b-2 border-transparent focus:border-red-500 focus:outline-none w-full text-center mb-1 truncate";
        nameInput.addEventListener('change', (e) => {
            player.name = e.target.value;
            saveState(); // Guardar solo el nombre
            renderAllCards(); // Para actualizar nombres en daño de cmd
        });
        topSection.appendChild(nameInput);

        const imageInput = document.createElement('input');
        imageInput.type = 'file';
        imageInput.accept = 'image/*';
        imageInput.className = 'text-xs w-full max-w-[100px] mx-auto block mb-2';
        imageInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    player.image = event.target.result;
                    cardWrapper.style.backgroundImage = `url('${player.image}')`;
                    saveState(); // Guardar la imagen
                }
                reader.readAsDataURL(file);
            }
        });
        topSection.appendChild(imageInput);
        cardContent.appendChild(topSection);

        // Sección Central: Vidas
        const lifeSection = document.createElement('div');
        lifeSection.className = 'text-center my-2 md:my-3';
        const lifeDisplay = document.createElement('div');
        lifeDisplay.className = 'text-6xl md:text-7xl font-bold life-total';
        lifeDisplay.textContent = player.life;
        lifeSection.appendChild(lifeDisplay);

        const lifeButtonsContainer = document.createElement('div');
        lifeButtonsContainer.className = 'flex justify-center space-x-2 mt-1 md:mt-2 relative'; // Relative for preview

        ['-', '+'].forEach(op => {
            const btn = document.createElement('button');
            btn.textContent = op + "1";
            btn.className = `bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-full text-base md:text-lg transition-colors ${op === '+' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700'}`;

            const previewCounter = document.createElement('div');
            previewCounter.className = 'life-change-preview hidden';
            btn.appendChild(previewCounter); // Adjuntar al botón

            btn.addEventListener('mousedown', (e) => {
                if (player.isLoser || player.isWinner || gameWon) return;
                lifeChangeAmount = (op === '+') ? 1 : -1;
                player.life += lifeChangeAmount; // Aplicar el primer cambio
                checkGameEndConditions(); // Chequear después de cada cambio
                // renderAllCards(); // Ya se llama en checkGameEndConditions si es necesario

                lifeChangeTimeout = setTimeout(() => {
                    lifeChangeAmount = 0; // Reset para el contador de "hold"
                    previewCounter.textContent = `${op}0`;
                    previewCounter.classList.remove('hidden');

                    lifeChangeInterval = setInterval(() => {
                        lifeChangeAmount += (op === '+') ? 1 : -1;
                        previewCounter.textContent = `${op}${Math.abs(lifeChangeAmount)}`;
                    }, HOLD_INTERVAL_SPEED); // Incremento rápido
                }, HOLD_DELAY); // Delay antes de que empiece el modo "hold"
            });

            const stopLifeChange = () => {
                clearTimeout(lifeChangeTimeout);
                clearInterval(lifeChangeInterval);
                previewCounter.classList.add('hidden');
                if (lifeChangeAmount !== 0 && !(op === '+' && lifeChangeAmount === 1) && !(op === '-' && lifeChangeAmount === -1)) {
                    // Si lifeChangeAmount es distinto del +1/-1 inicial y no es cero
                    // (El primer +1/-1 ya se aplicó en mousedown)
                    // Necesitamos aplicar la diferencia acumulada por el "hold"
                    // La lógica actual aplica el +1/-1 al click, y luego el hold empieza desde 0.
                    // Si lifeChangeAmount no es 0 después del hold, significa que se acumuló.
                    // Ejemplo: click es +1. Hold acumula +5. Total aplicado = +1 (click) + +5 (hold)
                    // La vida ya tiene el +1 del mousedown. Solo aplicamos el resto.
                    // player.life += lifeChangeAmount; // El amount aquí es el acumulado del hold
                }
                // El `lifeChangeAmount` del hold ya se aplicó al display, pero no a la vida del jugador.
                // La vida del jugador se actualiza con cada tick del renderAllCards llamado desde checkGameEndConditions
                // Esta parte necesita ser más clara:
                // En mousedown: player.life += (op === '+') ? 1 : -1;
                // En mouseup/leave (después del hold): player.life += lifeChangeAmount (donde lifeChangeAmount es el acumulado del hold)
                // La vida se actualiza en renderAllCards() llamado por checkGameEndConditions().
                // La clave es que el lifeChangeAmount sea el *adicional* del hold
                if (previewCounter.textContent && previewCounter.textContent !== `${op}0`) { // Si hubo hold y no fue solo el click inicial
                    const holdValue = parseInt(previewCounter.textContent.substring(1)) * (op === '+' ? 1 : -1);
                    if (!isNaN(holdValue) && holdValue !== 0) { // Solo si hubo un valor de hold
                        player.life += holdValue;
                    }
                }

                lifeChangeAmount = 0; // Reset
                checkGameEndConditions();
                // renderAllCards(); // Ya se llama
            };

            btn.addEventListener('mouseup', stopLifeChange);
            btn.addEventListener('mouseleave', stopLifeChange); // Si el mouse se va del botón

            lifeButtonsContainer.appendChild(btn);
        });
        lifeSection.appendChild(lifeButtonsContainer);
        cardContent.appendChild(lifeSection);

        // Sección Inferior: Contadores
        const countersSection = document.createElement('div');
        countersSection.className = 'space-y-1 text-xs md:text-sm overflow-y-auto max-h-[100px] sm:max-h-[120px] pr-1 scrollbar-thin';

        // Veneno
        const poisonDiv = document.createElement('div');
        poisonDiv.className = 'flex justify-between items-center';
        poisonDiv.innerHTML = `<span class="font-semibold">Veneno: <span class="poison-count text-base">${player.poison}</span></span>`;
        const poisonButtons = document.createElement('div');
        poisonButtons.className = 'flex space-x-1';
        ['+1', '-1'].forEach(amountStr => {
            const btn = document.createElement('button');
            btn.textContent = amountStr;
            btn.className = 'bg-green-600 hover:bg-green-700 text-white py-0.5 px-1.5 rounded-md';
            btn.addEventListener('click', () => {
                if (player.isLoser || player.isWinner || gameWon) return;
                const amount = parseInt(amountStr);
                player.poison += amount;
                if (player.poison < 0) player.poison = 0;
                // player.life -= amount; // Según reglas oficiales, veneno NO reduce vida. Lo quito.
                checkGameEndConditions();
                // renderAllCards();
            });
            poisonButtons.appendChild(btn);
        });
        poisonDiv.appendChild(poisonButtons);
        countersSection.appendChild(poisonDiv);

        // Daño de Comandante
        allActivePlayers.forEach(opponent => {
            if (opponent.id === player.id) return;

            const commanderDamageDiv = document.createElement('div');
            commanderDamageDiv.className = 'flex justify-between items-center text-xs';
            const damageFromThisOpponent = player.commanderDamageReceivedFrom[opponent.id] || 0;

            commanderDamageDiv.innerHTML = `<span class="font-semibold truncate max-w-[80px] sm:max-w-[100px]" title="Cmd de ${opponent.name}">Cmd (${opponent.name.substring(0, 6)}..): <span class="commander-damage-count text-sm">${damageFromThisOpponent}</span></span>`;

            const cmdDmgButtons = document.createElement('div');
            cmdDmgButtons.className = 'flex space-x-1';
            ['+1', '-1'].forEach(amountStr => {
                const btn = document.createElement('button');
                btn.textContent = amountStr;
                btn.className = 'bg-purple-600 hover:bg-purple-700 text-white py-0.5 px-1 rounded-sm';
                btn.addEventListener('click', () => {
                    if (player.isLoser || player.isWinner || gameWon) return;
                    const amount = parseInt(amountStr);
                    player.commanderDamageReceivedFrom[opponent.id] = (player.commanderDamageReceivedFrom[opponent.id] || 0) + amount;
                    if (player.commanderDamageReceivedFrom[opponent.id] < 0) {
                        player.commanderDamageReceivedFrom[opponent.id] = 0;
                    }
                    player.life -= amount; // REGLA: Daño de comandante SÍ reduce vida.
                    checkGameEndConditions();
                    // renderAllCards();
                });
                cmdDmgButtons.appendChild(btn);
            });
            commanderDamageDiv.appendChild(cmdDmgButtons);
            countersSection.appendChild(commanderDamageDiv);
        });
        cardContent.appendChild(countersSection);

        contentWrapper.appendChild(cardContent);
        cardWrapper.appendChild(contentWrapper);

        return cardWrapper;
    }

    function renderAllCards() {
        playerCardsContainer.innerHTML = '';
        const activePlayersToRender = players.slice(0, numActivePlayers);

        activePlayersToRender.forEach(p => {
            // Asegurar que el objeto commanderDamageReceivedFrom está bien
            p.commanderDamageReceivedFrom = p.commanderDamageReceivedFrom || {};
            activePlayersToRender.forEach(opp => {
                if (p.id !== opp.id && !(opp.id in p.commanderDamageReceivedFrom)) {
                    p.commanderDamageReceivedFrom[opp.id] = 0;
                }
            });
            for (const oppId in p.commanderDamageReceivedFrom) {
                if (!activePlayersToRender.find(ap => ap.id === oppId) && p.id !== oppId) {
                    delete p.commanderDamageReceivedFrom[oppId];
                }
            }
        });

        activePlayersToRender.forEach(p => {
            playerCardsContainer.appendChild(renderPlayerCard(p, activePlayersToRender));
        });
        updateGridCols();
    }

    function updateGridCols() {
        playerCardsContainer.classList.remove('sm:grid-cols-1', 'sm:grid-cols-2', 'lg:grid-cols-2', 'lg:grid-cols-3');
        if (numActivePlayers <= 2) {
            playerCardsContainer.classList.add('sm:grid-cols-2');
        } else if (numActivePlayers === 3) {
            playerCardsContainer.classList.add('sm:grid-cols-2', 'lg:grid-cols-3');
        } else if (numActivePlayers === 4) {
            playerCardsContainer.classList.add('sm:grid-cols-2', 'lg:grid-cols-2'); // O lg:grid-cols-4 para más pequeñas
        }
        else { // 5 o 6
            playerCardsContainer.classList.add('sm:grid-cols-2', 'lg:grid-cols-3');
        }
    }

    // --- MANEJADORES DE EVENTOS ---
    numPlayersSelect.addEventListener('change', () => resetGame(false)); // No es un full reset, es cambio de config
    formatSelect.addEventListener('change', () => resetGame(false));    // No es un full reset
    resetGameBtn.addEventListener('click', () => resetGame(true));      // Es un full reset
    clearHistoryBtn.addEventListener('click', clearMatchHistory);


    // --- INICIO ---
    loadState(); // Cargar estado previo
    if (!gameInProgress && players.length > 0 && !gameWon) { // Si no hay juego en progreso al cargar (ej. todos los jugadores perdieron o se ganó)
        resetGame(true); // Iniciar una nueva partida automáticamente
    } else if (gameInProgress) { // Si el estado cargado indica juego en progreso (esto es más difícil de manejar bien sin guardar el timer)
        startTimer(); // Continuar timer (elapsedSeconds se debería guardar/cargar)
    }

    // Pequeña corrección para la lógica de mantener presionado el botón de vida
    // La lógica actual de 'mousedown' para los botones de vida es un poco compleja con el 'hold'.
    // Simplificación de la lógica de 'hold':
    // Mousedown: aplicar +/- 1. Iniciar un timeout.
    // Timeout fires: Iniciar un interval. En cada tick del interval, aplicar +/-1 y actualizar el preview.
    // Mouseup/mouseleave: Detener timeout e interval. El valor total ya fue aplicado incrementalmente.

    // Re-escribiendo la parte de los botones de vida para mayor claridad y corrección del 'hold'
    // Esta parte ya está integrada arriba, pero el comentario de "re-escribiendo" es para enfatizar que la lógica del hold es tricky.
    // La clave es que el cambio de vida y el check de condiciones se hagan en cada tick del hold o en el click.
    // La versión en `renderPlayerCard` intenta esto. El `lifeChangeAmount` en el `stopLifeChange` es lo que se debe aplicar adicionalmente.
    // Pero si los cambios se aplican en cada tick del interval, entonces al soltar no hay que hacer nada más.
    // Voy a ajustar la lógica de `renderPlayerCard` para que los cambios se apliquen en cada tick del hold.

    // **Ajuste en `renderPlayerCard` para `btn.addEventListener('mousedown', ...)` y `stopLifeChange`**:
    // He modificado la lógica dentro de `renderPlayerCard` para que `lifeChangeAmount` represente el *total acumulado por el hold*
    // y se aplique *después* de soltar el botón. El +/-1 inicial ocurre al hacer clic.
    // En `stopLifeChange`, el `lifeChangeAmount` es el valor *adicional* que se suma/resta.
    // **CORRECCIÓN FINAL EN `renderPlayerCard` para el hold:**
    // - `mousedown`: aplica el primer +/-1. player.life += singleDelta;
    // - `setTimeout`: inicia el `lifeChangeInterval`.
    // - `lifeChangeInterval`: *solo* actualiza `lifeChangeAmount` (el acumulado del hold) y el `previewCounter`. *No* modifica `player.life` aquí.
    // - `mouseup/mouseleave`: `player.life += lifeChangeAmount;` (aplica el total acumulado del hold). Resetea `lifeChangeAmount`.
    // Esta es la lógica que intenté implementar arriba en `renderPlayerCard`. La parte `if (previewCounter.textContent && ...)` en `stopLifeChange` hace esto.

});
