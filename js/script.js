document.addEventListener('DOMContentLoaded', () => {
    let players = [];
    let startingLife = 40;
    let numActivePlayers = 2;
    let matchHistory = [];
    let gameTimerInterval;
    let elapsedSeconds = 0;
    let gameInProgress = false;
    let gameWon = false;

    // Constantes para el "hold" de botones de vida
    const HOLD_START_DELAY = 500; // ms antes de que empiece el conteo rápido
    const HOLD_INCREMENT_INTERVAL = 1500; // ms para CADA incremento/decremento del preview
    const HOLD_CHECK_INTERVAL = 100; // ms para chequear mouseup y actualizar el tiempo para el incremento

    // Variables para el "hold"
    let lifeChangePreviewValue = 0;
    let lifeChangeHoldInterval;
    let lifeChangeInitialTimeout;
    let lastHoldIncrementTime = 0;


    const playerCardsContainer = document.getElementById('player-cards-container');
    const formatSelect = document.getElementById('format-select');
    const numPlayersSelect = document.getElementById('num-players-select');
    const resetGameBtn = document.getElementById('reset-game-btn'); // Soft reset
    const hardResetBtn = document.getElementById('hard-reset-btn'); // Hard reset
    const timerDisplay = document.getElementById('timer-display');
    const matchHistoryBody = document.getElementById('match-history-body');
    const clearHistoryBtn = document.getElementById('clear-history-btn');

    const defaultImages = [
        "img/default-card-bg1.jpg", "img/default-card-bg2.jpg",
        "img/default-card-bg1.jpg", "img/default-card-bg2.jpg",
        "img/default-card-bg1.jpg", "img/default-card-bg2.jpg"
    ];

    // --- INICIALIZACIÓN Y ESTADO ---
    function initializePlayers(count, isHardReset = false) {
        const newPlayers = [];
        const storedPlayerData = JSON.parse(localStorage.getItem('mtgPlayersData'));
        const storedPlayersArray = storedPlayerData?.players || [];
        const currentStartingLife = parseInt(formatSelect.value);

        for (let i = 0; i < count; i++) {
            const playerId = `player${i + 1}`;
            let playerData;
            // Intentar encontrar un jugador guardado si no es un hard reset
            const existingStoredPlayer = !isHardReset ? storedPlayersArray.find(p => p.id === playerId) : null;

            if (existingStoredPlayer) {
                playerData = { ...existingStoredPlayer }; // Copia datos guardados (nombre, imagen)
                // Resetea stats de juego
                playerData.life = currentStartingLife;
                playerData.poison = 0;
                playerData.commanderDamageReceivedFrom = {};
                playerData.isLoser = false;
                playerData.isWinner = false;
            } else { // Si es hard reset o no hay datos guardados para este ID
                playerData = {
                    id: playerId,
                    name: `Jugador ${i + 1}`,
                    image: defaultImages[i % defaultImages.length],
                    life: currentStartingLife,
                    poison: 0,
                    commanderDamageReceivedFrom: {},
                    isLoser: false,
                    isWinner: false,
                };
            }
            // Asegurar que commanderDamageReceivedFrom está inicializado para oponentes actuales
            for (let j = 0; j < count; j++) {
                if (i === j) continue;
                const opponentIdForCmd = `player${j + 1}`;
                if (!(opponentIdForCmd in playerData.commanderDamageReceivedFrom)) {
                    playerData.commanderDamageReceivedFrom[opponentIdForCmd] = 0;
                }
            }
            newPlayers.push(playerData);
        }
        return newPlayers;
    }

    function saveState() {
        const stateToSave = {
            // Guardar solo nombres e imágenes para persistir personalizaciones
            players: players.slice(0, numActivePlayers).map(p => ({
                id: p.id,
                name: p.name,
                image: p.image,
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
            formatSelect.value = storedData.selectedFormat || 40; // Default Commander
            matchHistory = storedData.matchHistory || [];
        }
        // El resto (numActivePlayers, startingLife, players) se configura en softResetGame
        // que se llama después de loadState.
        renderMatchHistory();
    }

    // --- LÓGICA DEL JUEGO ---
    function checkGameEndConditions() {
        if (gameWon) return;

        let activePlayersList = players.slice(0, numActivePlayers);
        let nonLosers = [];

        activePlayersList.forEach(player => {
            if (player.isLoser) return; // Ya está marcado

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
            if (lostThisCheck) player.isLoser = true;

            if (!player.isLoser) nonLosers.push(player);
        });

        if (nonLosers.length === 1 && activePlayersList.length > 1) {
            nonLosers[0].isWinner = true;
            gameWon = true;
            stopTimer();
            logMatchResult("Victoria: " + nonLosers[0].name);
        } else if (nonLosers.length === 0 && activePlayersList.length > 0) {
            gameWon = true;
            stopTimer();
            logMatchResult("Empate / Todos pierden");
        }
        renderAllCards(); // Siempre renderizar para mostrar cambios
    }

    function resetGameLogic(isHardReset) {
        if (gameInProgress && !gameWon) {
            logMatchResult("No Terminada"); // Loguear si se interrumpe una partida
        }
        gameWon = false;
        stopTimer();
        elapsedSeconds = 0;
        updateTimerDisplay();

        startingLife = parseInt(formatSelect.value);
        numActivePlayers = parseInt(numPlayersSelect.value);

        players = initializePlayers(numActivePlayers, isHardReset);

        renderAllCards();
        startTimer();
        gameInProgress = true;
        saveState(); // Guardar el estado (nombres, imágenes) después de inicializar
    }

    function softResetGame() { // Reiniciar partida (mantiene nombres/imágenes)
        resetGameLogic(false);
    }

    function hardResetGame() { // Reiniciar todo (nombres/imágenes por defecto)
        if (confirm("¿Estás seguro de que quieres reiniciar nombres, imágenes y contadores a los valores por defecto?")) {
            resetGameLogic(true);
        }
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
                life: p.life, // Guardar la vida final
                isWinner: p.isWinner,
                isLoser: p.isLoser
            })),
            duration: timerDisplay.textContent,
            status: status
        };
        matchHistory.push(matchData);
        renderMatchHistory();
        saveState();
        gameInProgress = false;
    }

    function renderMatchHistory() {
        matchHistoryBody.innerHTML = '';
        if (matchHistory.length === 0) {
            matchHistoryBody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-gray-500">No hay partidas registradas.</td></tr>`;
            return;
        }
        matchHistory.slice().reverse().forEach((match) => { // Mostrar más recientes primero
            const row = matchHistoryBody.insertRow();
            row.insertCell().textContent = match.id;

            const playersCell = row.insertCell();
            playersCell.className = "px-3 py-2 text-xs whitespace-nowrap";
            match.players.forEach(p => {
                const statusClass = p.isWinner ? "text-blue-400 font-bold" : (p.isLoser ? "text-red-400" : "text-gray-300");
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
        cardWrapper.className = `player-card-wrapper rounded-xl shadow-2xl overflow-hidden transition-all duration-300 relative ${player.isWinner ? 'player-winner' : ''} ${player.isLoser ? 'player-lost' : ''}`;
        cardWrapper.style.backgroundImage = `url('${player.image}')`;
        cardWrapper.style.backgroundSize = 'cover';
        cardWrapper.style.backgroundPosition = 'center';

        const contentWrapper = document.createElement('div');
        contentWrapper.className = 'player-card-content-wrapper relative';

        const cardContent = document.createElement('div');
        cardContent.className = 'player-card-content bg-black bg-opacity-75 p-3 md:p-4 flex flex-col justify-between min-h-[380px] sm:min-h-[420px]';

        const topSection = document.createElement('div');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = player.name;
        nameInput.className = "text-xl md:text-2xl font-['MedievalSharp'] bg-transparent border-b-2 border-transparent focus:border-red-500 focus:outline-none w-full text-center mb-1 truncate";
        nameInput.addEventListener('change', (e) => {
            player.name = e.target.value;
            saveState();
            renderAllCards();
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
                    saveState();
                }
                reader.readAsDataURL(file);
            }
        });
        topSection.appendChild(imageInput);
        cardContent.appendChild(topSection);

        const lifeSection = document.createElement('div');
        lifeSection.className = 'text-center my-2 md:my-3';
        const lifeDisplay = document.createElement('div');
        lifeDisplay.className = 'text-6xl md:text-7xl font-bold life-total';
        lifeDisplay.textContent = player.life;
        lifeSection.appendChild(lifeDisplay);

        const lifeButtonsContainer = document.createElement('div');
        lifeButtonsContainer.className = 'flex justify-center space-x-2 mt-1 md:mt-2 relative';

        ['-', '+'].forEach(op => {
            const btn = document.createElement('button');
            btn.textContent = op + "1"; // Texto inicial del botón
            const baseColor = op === '+' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-600 hover:bg-red-700';
            btn.className = `${baseColor} text-white font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-full text-base md:text-lg transition-colors`;

            const previewElement = document.createElement('div');
            previewElement.className = 'life-change-preview hidden';
            btn.appendChild(previewElement); // El preview es hijo del botón para posicionamiento relativo

            const handleLifeChange = (amount) => {
                if (player.isLoser || player.isWinner || gameWon) return;
                player.life += amount;
                checkGameEndConditions(); // Esto llamará a renderAllCards
            };

            const startHold = () => {
                if (player.isLoser || player.isWinner || gameWon) return;

                // Aplicar el +1/-1 inicial inmediatamente
                handleLifeChange((op === '+') ? 1 : -1);

                lifeChangePreviewValue = 0; // El preview del hold empieza en 0
                lastHoldIncrementTime = Date.now(); // Para el primer incremento del hold
                previewElement.textContent = `${op}${Math.abs(lifeChangePreviewValue)}`;
                previewElement.classList.remove('hidden');

                // Intervalo que CHEQUEA si debe incrementar el preview
                lifeChangeHoldInterval = setInterval(() => {
                    const now = Date.now();
                    if (now - lastHoldIncrementTime >= HOLD_INCREMENT_INTERVAL) {
                        lifeChangePreviewValue += (op === '+') ? 1 : -1;
                        previewElement.textContent = `${op}${Math.abs(lifeChangePreviewValue)}`;
                        lastHoldIncrementTime = now;
                    }
                }, HOLD_CHECK_INTERVAL); // Chequea frecuentemente
            };

            const stopHold = () => {
                clearTimeout(lifeChangeInitialTimeout);
                clearInterval(lifeChangeHoldInterval);
                previewElement.classList.add('hidden');

                if (lifeChangePreviewValue !== 0) {
                    handleLifeChange(lifeChangePreviewValue); // Aplicar el acumulado del hold
                }
                lifeChangePreviewValue = 0; // Reset para la próxima
            };

            btn.addEventListener('mousedown', (e) => {
                if (e.button !== 0) return; // Solo botón izquierdo
                // El +1/-1 inicial se aplica DESPUÉS del delay, o al hacer click y soltar rápido
                lifeChangeInitialTimeout = setTimeout(startHold, HOLD_START_DELAY);
            });

            btn.addEventListener('mouseup', (e) => {
                if (e.button !== 0) return;
                clearTimeout(lifeChangeInitialTimeout); // Cancela el inicio del hold si se suelta antes

                // Si el hold estaba activo (intervalo corriendo)
                if (lifeChangeHoldInterval) {
                    stopHold();
                } else { // Si fue un click rápido (no se activó el hold)
                    if (!player.isLoser && !player.isWinner && !gameWon) { // Evitar doble aplicación
                        handleLifeChange((op === '+') ? 1 : -1); // Aplicar el +1/-1 del click rápido
                    }
                }
            });
            btn.addEventListener('mouseleave', () => { // Si el mouse se va mientras está presionado
                clearTimeout(lifeChangeInitialTimeout);
                if (lifeChangeHoldInterval) {
                    stopHold();
                }
            });
            btn.addEventListener('contextmenu', (e) => e.preventDefault()); // Evitar menú contextual

            lifeButtonsContainer.appendChild(btn);
        });
        lifeSection.appendChild(lifeButtonsContainer);
        cardContent.appendChild(lifeSection);

        const countersSection = document.createElement('div');
        countersSection.className = 'space-y-1 text-xs md:text-sm overflow-y-auto max-h-[100px] sm:max-h-[120px] pr-1 scrollbar-thin';

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
                checkGameEndConditions();
            });
            poisonButtons.appendChild(btn);
        });
        poisonDiv.appendChild(poisonButtons);
        countersSection.appendChild(poisonDiv);

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
                    player.life -= amount; // Daño de comandante SÍ reduce vida
                    checkGameEndConditions();
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
        if (numActivePlayers <= 1) { // Para 1 jugador (si se implementara) o por si acaso
            playerCardsContainer.classList.add('sm:grid-cols-1');
        } else if (numActivePlayers === 2) {
            playerCardsContainer.classList.add('sm:grid-cols-2');
        } else if (numActivePlayers === 3) {
            playerCardsContainer.classList.add('sm:grid-cols-2', 'lg:grid-cols-3');
        } else if (numActivePlayers === 4) {
            playerCardsContainer.classList.add('sm:grid-cols-2', 'lg:grid-cols-2');
        } else { // 5 o 6
            playerCardsContainer.classList.add('sm:grid-cols-2', 'lg:grid-cols-3');
        }
    }

    // --- MANEJADORES DE EVENTOS ---
    numPlayersSelect.addEventListener('change', () => softResetGame());
    formatSelect.addEventListener('change', () => softResetGame());
    resetGameBtn.addEventListener('click', () => softResetGame());
    hardResetBtn.addEventListener('click', () => hardResetGame());
    clearHistoryBtn.addEventListener('click', clearMatchHistory);

    // --- INICIO ---
    loadState();
    softResetGame(); // Iniciar la primera partida al cargar

});