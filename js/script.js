document.addEventListener('DOMContentLoaded', () => {
    let maxPlayers = 6;
    let players = [];
    let startingLife = 40;
    let numActivePlayers = 4; // Valor por defecto

    const playerCardsContainer = document.getElementById('player-cards-container');
    const formatSelect = document.getElementById('format-select');
    const numPlayersSelect = document.getElementById('num-players-select');
    const resetGameBtn = document.getElementById('reset-game-btn');

    const defaultImages = ["img/default-card-bg1.jpg", "img/default-card-bg2.jpg"];

    function initializePlayers(count) {
        const newPlayers = [];
        const storedPlayers = JSON.parse(localStorage.getItem('mtgPlayers')) || [];
        const storedStartingLife = parseInt(localStorage.getItem('mtgStartingLife')) || startingLife;
        const storedNumPlayers = parseInt(localStorage.getItem('mtgNumPlayers')) || count;

        // Si el número de jugadores almacenado es diferente al actual, prioriza el actual
        // y descarta los jugadores almacenados para evitar inconsistencias.
        let useStoredPlayers = storedPlayers.length === count && count === storedNumPlayers;


        for (let i = 0; i < count; i++) {
            const playerId = `player${i + 1}`;
            let playerData;

            if (useStoredPlayers && storedPlayers[i]) {
                playerData = storedPlayers[i];
                // Asegurarse de que la estructura commanderDamageReceivedFrom existe
                if (!playerData.commanderDamageReceivedFrom) {
                    playerData.commanderDamageReceivedFrom = {};
                }
            } else {
                playerData = {
                    id: playerId,
                    name: `Jugador ${i + 1}`,
                    life: storedStartingLife, // Usar vida almacenada si existe, sino la del formato
                    poison: 0,
                    commanderDamageReceivedFrom: {}, // { opponentId: damage }
                    image: defaultImages[i % defaultImages.length],
                    isLoser: false
                };
            }
            // Inicializar commanderDamageReceivedFrom para todos los oponentes posibles si no está
            for (let j = 0; j < count; j++) {
                if (i === j) continue; // No contra sí mismo
                const opponentId = `player${j + 1}`;
                if (!(opponentId in playerData.commanderDamageReceivedFrom)) {
                    playerData.commanderDamageReceivedFrom[opponentId] = 0;
                }
            }
            newPlayers.push(playerData);
        }
        return newPlayers;
    }


    function saveState() {
        localStorage.setItem('mtgPlayers', JSON.stringify(players.slice(0, numActivePlayers)));
        localStorage.setItem('mtgStartingLife', startingLife.toString());
        localStorage.setItem('mtgNumPlayers', numActivePlayers.toString());
    }

    function checkLossCondition(player) {
        player.isLoser = false; // Reset before check
        if (player.life <= 0 || player.poison >= 10) {
            player.isLoser = true;
            return;
        }
        for (const opponentId in player.commanderDamageReceivedFrom) {
            if (player.commanderDamageReceivedFrom[opponentId] >= 21) {
                player.isLoser = true;
                return;
            }
        }
    }

    function renderPlayerCard(player, allActivePlayers) {
        const cardWrapper = document.createElement('div');
        cardWrapper.id = `${player.id}-card-wrapper`;
        cardWrapper.className = `player-card-wrapper rounded-xl shadow-2xl overflow-hidden transition-all duration-300 ${player.isLoser ? 'player-lost' : ''}`;
        cardWrapper.style.backgroundImage = `url('${player.image}')`;
        cardWrapper.style.backgroundSize = 'cover';
        cardWrapper.style.backgroundPosition = 'center';

        const cardContent = document.createElement('div');
        cardContent.className = 'player-card-content bg-black bg-opacity-70 p-3 md:p-4 flex flex-col justify-between relative'; // Reducido padding un poco

        // Sección Superior: Nombre e Imagen de fondo
        const topSection = document.createElement('div');
        const nameInput = document.createElement('input');
        nameInput.type = 'text';
        nameInput.value = player.name;
        nameInput.className = "text-xl md:text-2xl font-bold bg-transparent border-b-2 border-transparent focus:border-blue-500 focus:outline-none w-full text-center mb-1 truncate";
        nameInput.addEventListener('change', (e) => {
            player.name = e.target.value;
            saveState();
            renderAllCards(); // Re-render para actualizar nombres en secciones de daño de cmd
        });
        topSection.appendChild(nameInput);

        const imageInput = document.createElement('input');
        imageInput.type = 'file';
        imageInput.accept = 'image/*';
        imageInput.className = 'text-xs w-full max-w-[150px] mx-auto block mb-2';
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

        // Sección Central: Vidas
        const lifeSection = document.createElement('div');
        lifeSection.className = 'text-center my-2 md:my-3';
        const lifeDisplay = document.createElement('div');
        lifeDisplay.className = 'text-6xl md:text-7xl font-bold life-total';
        lifeDisplay.textContent = player.life;
        lifeSection.appendChild(lifeDisplay);

        const lifeButtons = document.createElement('div');
        lifeButtons.className = 'flex justify-center space-x-2 mt-1 md:mt-2';
        ['-5', '-1', '+1', '+5'].forEach(amount => {
            const btn = document.createElement('button');
            btn.textContent = amount;
            btn.className = 'bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 md:py-2 md:px-4 rounded-full text-base md:text-lg transition-colors';
            btn.addEventListener('click', () => {
                if (player.isLoser) return;
                player.life += parseInt(amount);
                checkLossCondition(player);
                renderAllCards();
                saveState();
            });
            lifeButtons.appendChild(btn);
        });
        lifeSection.appendChild(lifeButtons);
        cardContent.appendChild(lifeSection);

        // Sección Inferior: Contadores
        const countersSection = document.createElement('div');
        countersSection.className = 'space-y-2 text-xs md:text-sm overflow-y-auto max-h-[120px] pr-1'; // Scroll si hay muchos oponentes

        // Veneno
        const poisonDiv = document.createElement('div');
        poisonDiv.className = 'flex justify-between items-center';
        poisonDiv.innerHTML = `<span class="font-semibold">Veneno: <span class="poison-count text-lg">${player.poison}</span></span>`;
        const poisonButtons = document.createElement('div');
        poisonButtons.className = 'flex space-x-1';
        ['+1', '-1'].forEach(amountStr => {
            const btn = document.createElement('button');
            btn.textContent = amountStr;
            btn.className = 'bg-green-600 hover:bg-green-700 text-white py-1 px-2 rounded-md';
            btn.addEventListener('click', () => {
                if (player.isLoser) return;
                const amount = parseInt(amountStr);
                player.poison += amount;
                if (player.poison < 0) player.poison = 0;
                player.life -= amount; // REGLA DE CASA: Veneno también reduce vida
                checkLossCondition(player);
                renderAllCards();
                saveState();
            });
            poisonButtons.appendChild(btn);
        });
        poisonDiv.appendChild(poisonButtons);
        countersSection.appendChild(poisonDiv);

        // Daño de Comandante (de cada oponente)
        allActivePlayers.forEach(opponent => {
            if (opponent.id === player.id) return; // No mostrar daño de comandante de uno mismo

            const commanderDamageDiv = document.createElement('div');
            commanderDamageDiv.className = 'flex justify-between items-center text-xs'; // Texto más pequeño
            const damageFromThisOpponent = player.commanderDamageReceivedFrom[opponent.id] || 0;

            commanderDamageDiv.innerHTML = `<span class="font-semibold truncate max-w-[100px]" title="Cmd de ${opponent.name}">Cmd (${opponent.name.substring(0, 7)}..): <span class="commander-damage-count text-base">${damageFromThisOpponent}</span></span>`;

            const cmdDmgButtons = document.createElement('div');
            cmdDmgButtons.className = 'flex space-x-1';
            ['+1', '-1'].forEach(amountStr => {
                const btn = document.createElement('button');
                btn.textContent = amountStr;
                btn.className = 'bg-purple-600 hover:bg-purple-700 text-white py-0.5 px-1.5 rounded-md'; // Botones más pequeños
                btn.addEventListener('click', () => {
                    if (player.isLoser) return;
                    const amount = parseInt(amountStr);
                    player.commanderDamageReceivedFrom[opponent.id] = (player.commanderDamageReceivedFrom[opponent.id] || 0) + amount;
                    if (player.commanderDamageReceivedFrom[opponent.id] < 0) {
                        player.commanderDamageReceivedFrom[opponent.id] = 0;
                    }
                    player.life -= amount; // REGLA DE CASA: Daño de comandante también reduce vida
                    checkLossCondition(player);
                    renderAllCards();
                    saveState();
                });
                cmdDmgButtons.appendChild(btn);
            });
            commanderDamageDiv.appendChild(cmdDmgButtons);
            countersSection.appendChild(commanderDamageDiv);
        });
        cardContent.appendChild(countersSection);
        cardWrapper.appendChild(cardContent);

        // Overlay de Pérdida
        const lossOverlay = document.createElement('div');
        lossOverlay.className = 'loss-overlay absolute inset-0 bg-red-700 bg-opacity-80 items-center justify-center text-4xl md:text-5xl font-bold hidden z-10';
        lossOverlay.textContent = 'DERROTA';
        if (player.isLoser) lossOverlay.style.display = 'flex';
        cardWrapper.appendChild(lossOverlay);

        return cardWrapper;
    }

    function renderAllCards() {
        playerCardsContainer.innerHTML = '';
        const activePlayers = players.slice(0, numActivePlayers);
        activePlayers.forEach(p => {
            // Asegurarse de que todos los jugadores tengan una entrada para cada oponente activo
            activePlayers.forEach(opp => {
                if (p.id !== opp.id && !(opp.id in p.commanderDamageReceivedFrom)) {
                    p.commanderDamageReceivedFrom[opp.id] = 0;
                }
            });
            // Limpiar entradas de oponentes que ya no están activos
            for (const oppId in p.commanderDamageReceivedFrom) {
                if (!activePlayers.find(ap => ap.id === oppId) && p.id !== oppId) {
                    delete p.commanderDamageReceivedFrom[oppId];
                }
            }
            checkLossCondition(p); // Re-chequear por si acaso
        });

        activePlayers.forEach(p => {
            playerCardsContainer.appendChild(renderPlayerCard(p, activePlayers));
        });
        updateGridCols();
    }

    function updateGridCols() {
        playerCardsContainer.classList.remove('lg:grid-cols-2', 'lg:grid-cols-3');
        if (numActivePlayers <= 2) {
            playerCardsContainer.classList.add('md:grid-cols-2'); // Mantiene 2 columnas en md para 2 jugadores
        } else if (numActivePlayers === 3 || numActivePlayers === 4) {
            // sm:grid-cols-2 ya está. Para lg, podemos hacer lg:grid-cols-2 o lg:grid-cols-4.
            // Para 4 jugadores, lg:grid-cols-2 es más grande por tarjeta.
            // Para 3, lg:grid-cols-3.
            if (numActivePlayers === 3) playerCardsContainer.classList.add('lg:grid-cols-3');
            else playerCardsContainer.classList.add('lg:grid-cols-2'); // O 'lg:grid-cols-4' si se prefiere más compacto
        } else { // 5 o 6 jugadores
            playerCardsContainer.classList.add('lg:grid-cols-3');
        }
    }


    function resetPlayerStats(player, life) {
        player.life = life;
        player.poison = 0;
        player.commanderDamageReceivedFrom = {};
        players.slice(0, numActivePlayers).forEach(opponent => {
            if (opponent.id !== player.id) {
                player.commanderDamageReceivedFrom[opponent.id] = 0;
            }
        });
        player.isLoser = false;
    }

    function fullResetGame() {
        startingLife = parseInt(formatSelect.value);
        numActivePlayers = parseInt(numPlayersSelect.value);
        players = initializePlayers(numActivePlayers); // Reinicia completamente con valores por defecto
        renderAllCards();
        saveState();
    }

    function softResetGameCounters() {
        startingLife = parseInt(formatSelect.value); // Actualiza la vida base del formato
        players.slice(0, numActivePlayers).forEach(p => {
            resetPlayerStats(p, startingLife); // Resetea contadores, mantiene nombres/imágenes
        });
        renderAllCards();
        saveState();
    }


    // Event Listeners
    numPlayersSelect.addEventListener('change', (e) => {
        const newNumPlayers = parseInt(e.target.value);
        const oldNumPlayers = numActivePlayers;
        numActivePlayers = newNumPlayers;

        const currentPlayersData = JSON.parse(JSON.stringify(players.slice(0, oldNumPlayers)));

        players = initializePlayers(numActivePlayers); // Esto crea la estructura base

        // Intentar preservar datos de jugadores existentes si el número disminuye o se mantiene
        for (let i = 0; i < Math.min(newNumPlayers, oldNumPlayers); i++) {
            if (currentPlayersData[i]) {
                players[i].name = currentPlayersData[i].name;
                players[i].image = currentPlayersData[i].image;
                // La vida y contadores se reiniciarán con el formato actual o se cargarán si no hubo cambio de formato
                // Si el número de jugadores cambia, es buena idea resetear contadores para evitar datos de oponentes inválidos
                resetPlayerStats(players[i], startingLife);
            }
        }
        // Para nuevos jugadores (si newNumPlayers > oldNumPlayers), ya están inicializados por initializePlayers

        renderAllCards();
        saveState();
    });

    formatSelect.addEventListener('change', (e) => {
        startingLife = parseInt(e.target.value);
        players.slice(0, numActivePlayers).forEach(p => resetPlayerStats(p, startingLife));
        renderAllCards();
        saveState();
    });

    resetGameBtn.addEventListener('click', () => {
        // Preguntar al usuario si quiere un reset completo (nombres, imágenes) o solo contadores
        // Por ahora, haremos un reset de contadores pero manteniendo nombres e imágenes
        if (confirm("¿Reiniciar contadores de vida y daño? (Nombres e imágenes se mantendrán)")) {
            softResetGameCounters();
        } else if (confirm("¿Reiniciar TODO incluyendo nombres e imágenes por defecto?")) {
            // Para un reset total, también necesitaríamos limpiar localStorage de nombres/imágenes específicos si los guardamos
            // La actual `initializePlayers` carga de localStorage si existe, así que un reset total sería:
            localStorage.removeItem('mtgPlayers'); // Esto fuerza a initializePlayers a usar defaults
            fullResetGame(); // Esto recargará y usará defaults
        }
    });

    // Carga Inicial
    function loadInitialState() {
        const storedNum = localStorage.getItem('mtgNumPlayers');
        const storedLife = localStorage.getItem('mtgStartingLife');
        const storedPlayersData = localStorage.getItem('mtgPlayers');

        if (storedNum) {
            numActivePlayers = parseInt(storedNum);
            numPlayersSelect.value = numActivePlayers;
        } else {
            numActivePlayers = parseInt(numPlayersSelect.value);
        }

        if (storedLife) {
            startingLife = parseInt(storedLife);
            formatSelect.value = startingLife;
        } else {
            startingLife = parseInt(formatSelect.value);
        }

        // Initialize players based on stored/default numActivePlayers and startingLife
        players = initializePlayers(numActivePlayers);

        // Si había jugadores guardados Y el número de jugadores coincide, se usaron esos datos.
        // Si no, se usaron los defaults.
        // No es necesario hacer más aquí si initializePlayers maneja la carga.

        renderAllCards();
    }

    loadInitialState();
});