// Firebase Configuration
const firebaseConfig = {
  apiKey: "AIzaSyB2wW6aQS6eausCrBikACIKmsD8gn4E0g4",
  authDomain: "rpsls-4e6db.firebaseapp.com",
  databaseURL: "https://rpsls-4e6db-default-rtdb.firebaseio.com",
  projectId: "rpsls-4e6db",
  storageBucket: "rpsls-4e6db.firebasestorage.app",
  messagingSenderId: "665715994571",
  appId: "1:665715994571:web:52d971ca41f55e052f104e",
};

// Game Data
const gameRules = {
  rock: { beats: ['lizard', 'scissors'], actions: ['crushes', 'crushes'] },
  paper: { beats: ['rock', 'spock'], actions: ['covers', 'disproves'] },
  scissors: { beats: ['paper', 'lizard'], actions: ['cuts', 'decapitates'] },
  lizard: { beats: ['spock', 'paper'], actions: ['poisons', 'eats'] },
  spock: { beats: ['scissors', 'rock'], actions: ['smashes', 'vaporizes'] }
};

const choices = [
  { id: 'rock', name: 'Rock', emoji: '🗿' },
  { id: 'paper', name: 'Paper', emoji: '📄' },
  { id: 'scissors', name: 'Scissors', emoji: '✂️' },
  { id: 'lizard', name: 'Lizard', emoji: '🦎' },
  { id: 'spock', name: 'Spock', emoji: '🖖' }
];

// Initialize Firebase
let app, database;
try {
  app = firebase.initializeApp(firebaseConfig);
  database = firebase.database();
  console.log('Firebase initialized successfully');
} catch (error) {
  console.error('Firebase initialization failed:', error);
}

// Game State
let gameState = {
  currentSection: 'main-menu',
  gameMode: 'local',
  difficulty: 'medium',
  maxGames: 3,
  currentGame: 0,
  player1: { name: 'Player 1', score: 0, choice: null, id: null },
  player2: { name: 'Computer', score: 0, choice: null, id: null },
  gameHistory: [],
  playerHistory: [],
  currentRoomCode: null,
  isGameActive: false,
  waitingForChoice: false,
  leaderboard: [],
  isHost: false,
  connectionRef: null,
  roomListeners: []
};

// Firebase Game Manager - Real Implementation
class FirebaseGameManager {
  constructor() {
    this.database = database;
    this.connectionRef = null;
    this.presenceRef = null;
    this.setupPresenceSystem();
  }

  generatePlayerId() {
    return 'player_' + Math.random().toString(36).substr(2, 9);
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  setupPresenceSystem() {
    if (!this.database) return;

    try {
      const connectedRef = this.database.ref('info/connected');
      connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
          this.updateConnectionStatus(true);
        } else {
          this.updateConnectionStatus(false);
        }
      });
    } catch (error) {
      console.error('Failed to setup presence system:', error);
      this.updateConnectionStatus(false);
    }
  }

  updateConnectionStatus(connected) {
    const statusElement = document.getElementById('connection-status');
    const statusSpan = statusElement?.querySelector('.status');
    
    if (statusSpan) {
      if (connected) {
        statusSpan.textContent = 'Connected';
        statusSpan.className = 'status status--success';
      } else {
        statusSpan.textContent = 'Connection Lost';
        statusSpan.className = 'status status--error';
      }
    }
  }

  async createRoom(gameConfig) {
    if (!this.database) {
      throw new Error('Firebase not initialized');
    }

    try {
      const roomCode = this.generateRoomCode();
      const playerId = this.generatePlayerId();
      const roomData = {
        gameId: roomCode + '_' + Date.now(),
        createdAt: Date.now(),
        maxPlayers: 2,
        gameConfig: {
          maxGames: gameConfig.maxGames,
          difficulty: gameConfig.difficulty || 'medium'
        },
        players: {
          [playerId]: {
            id: playerId,
            name: gameConfig.hostName,
            connected: true,
            score: 0,
            choice: null,
            joinedAt: Date.now(),
            isHost: true
          }
        },
        gameState: {
          status: 'waiting',
          currentRound: 0,
          bothPlayersReady: false,
          roundResults: []
        }
      };

      await this.database.ref(`rooms/${roomCode}`).set(roomData);
      
      // Setup presence for host
      const presenceRef = this.database.ref(`rooms/${roomCode}/players/${playerId}/connected`);
      presenceRef.onDisconnect().set(false);
      
      // Set up room cleanup on disconnect
      const roomRef = this.database.ref(`rooms/${roomCode}`);
      roomRef.onDisconnect().remove();

      gameState.player1.id = playerId;
      gameState.isHost = true;
      this.connectionRef = presenceRef;

      return { roomCode, playerId };
    } catch (error) {
      console.error('Failed to create room:', error);
      throw new Error('Failed to create room: ' + error.message);
    }
  }

  async joinRoom(roomCode, playerName) {
    if (!this.database) {
      throw new Error('Firebase not initialized');
    }

    try {
      const roomSnapshot = await this.database.ref(`rooms/${roomCode}`).once('value');
      if (!roomSnapshot.exists()) {
        throw new Error('Room not found');
      }

      const roomData = roomSnapshot.val();
      const playerCount = Object.keys(roomData.players || {}).length;
      
      if (playerCount >= 2) {
        throw new Error('Room is full');
      }

      const playerId = this.generatePlayerId();
      await this.database.ref(`rooms/${roomCode}/players/${playerId}`).set({
        id: playerId,
        name: playerName,
        connected: true,
        score: 0,
        choice: null,
        joinedAt: Date.now(),
        isHost: false
      });

      // Setup presence for guest
      const presenceRef = this.database.ref(`rooms/${roomCode}/players/${playerId}/connected`);
      presenceRef.onDisconnect().set(false);
      
      // Clean up player on disconnect
      const playerRef = this.database.ref(`rooms/${roomCode}/players/${playerId}`);
      playerRef.onDisconnect().remove();

      gameState.player1.id = playerId;
      gameState.isHost = false;
      this.connectionRef = presenceRef;

      return { playerId, hostName: Object.values(roomData.players)[0].name };
    } catch (error) {
      console.error('Failed to join room:', error);
      throw error;
    }
  }

  async submitChoice(roomCode, playerId, choice) {
    if (!this.database) {
      throw new Error('Firebase not initialized');
    }

    try {
      await this.database.ref(`rooms/${roomCode}/players/${playerId}/choice`).set(choice);
      
      // Check if both players have made choices
      const roomSnapshot = await this.database.ref(`rooms/${roomCode}`).once('value');
      const roomData = roomSnapshot.val();
      const players = Object.values(roomData.players || {});
      
      if (players.length === 2 && players.every(p => p.choice !== null)) {
        await this.database.ref(`rooms/${roomCode}/gameState/bothPlayersReady`).set(true);
      }
    } catch (error) {
      console.error('Failed to submit choice:', error);
      throw new Error('Failed to submit choice: ' + error.message);
    }
  }

  async updateGameState(roomCode, updates) {
    if (!this.database) {
      throw new Error('Firebase not initialized');
    }

    try {
      await this.database.ref(`rooms/${roomCode}/gameState`).update(updates);
    } catch (error) {
      console.error('Failed to update game state:', error);
      throw new Error('Failed to update game state: ' + error.message);
    }
  }

  async updatePlayerScore(roomCode, playerId, score) {
    if (!this.database) {
      throw new Error('Firebase not initialized');
    }

    try {
      await this.database.ref(`rooms/${roomCode}/players/${playerId}/score`).set(score);
    } catch (error) {
      console.error('Failed to update score:', error);
      throw new Error('Failed to update score: ' + error.message);
    }
  }

  setupRealTimeListeners(roomCode, playerId) {
    if (!this.database) return;

    try {
      // Listen for room changes
      const roomRef = this.database.ref(`rooms/${roomCode}`);
      const roomListener = roomRef.on('value', (snapshot) => {
        if (!snapshot.exists()) {
          this.handleRoomRemoved();
          return;
        }

        const roomData = snapshot.val();
        this.handleRoomUpdate(roomData, playerId);
      });

      gameState.roomListeners.push({ ref: roomRef, listener: roomListener });

      // Listen for player connections
      const playersRef = this.database.ref(`rooms/${roomCode}/players`);
      const playersListener = playersRef.on('value', (snapshot) => {
        const players = snapshot.val() || {};
        this.handlePlayersUpdate(players, playerId);
      });

      gameState.roomListeners.push({ ref: playersRef, listener: playersListener });

      // Listen for game state changes
      const gameStateRef = this.database.ref(`rooms/${roomCode}/gameState`);
      const gameStateListener = gameStateRef.on('value', (snapshot) => {
        const gameStateData = snapshot.val() || {};
        this.handleGameStateUpdate(gameStateData);
      });

      gameState.roomListeners.push({ ref: gameStateRef, listener: gameStateListener });

    } catch (error) {
      console.error('Failed to setup listeners:', error);
    }
  }

  handleRoomUpdate(roomData, currentPlayerId) {
    const players = Object.values(roomData.players || {});
    
    if (players.length === 2) {
      const currentPlayer = players.find(p => p.id === currentPlayerId);
      const opponent = players.find(p => p.id !== currentPlayerId);
      
      if (currentPlayer && opponent) {
        // Update UI with current game state
        gameState.player1.name = currentPlayer.name;
        gameState.player1.score = currentPlayer.score;
        gameState.player2.name = opponent.name;
        gameState.player2.score = opponent.score;
        
        if (window.gameEngine) {
          window.gameEngine.updateGameUI();
        }

        // Check if both players have made choices
        if (currentPlayer.choice && opponent.choice && roomData.gameState.bothPlayersReady) {
          this.handleBothChoicesMade(currentPlayer, opponent);
        }

        // Check opponent connection
        this.handleOpponentConnection(opponent.connected);
      }
    }
  }

  handlePlayersUpdate(players, currentPlayerId) {
    const playerCount = Object.keys(players).length;
    
    if (playerCount === 2) {
      const roomStatus = document.getElementById('room-status');
      if (roomStatus) {
        roomStatus.textContent = 'Player joined! Starting game...';
        roomStatus.className = 'status status--success';
        
        setTimeout(() => {
          if (window.gameEngine) {
            window.gameEngine.initializeOnlineGame();
            window.navigationManager.navigateTo('game-play');
          }
        }, 2000);
      }
    } else if (playerCount === 1) {
      const roomStatus = document.getElementById('room-status');
      if (roomStatus) {
        roomStatus.textContent = 'Waiting for player to join...';
        roomStatus.className = 'status status--info';
      }
    }
  }

  handleGameStateUpdate(gameStateData) {
    if (gameStateData.status === 'finished') {
      setTimeout(() => {
        if (window.gameEngine) {
          window.gameEngine.endGame();
        }
      }, 1000);
    }
  }

  handleBothChoicesMade(currentPlayer, opponent) {
    gameState.player1.choice = currentPlayer.choice;
    gameState.player2.choice = opponent.choice;
    
    setTimeout(() => {
      if (window.gameEngine) {
        window.gameEngine.resolveOnlineRound();
      }
    }, 1000);
  }

  handleOpponentConnection(connected) {
    const statusElement = document.getElementById('connection-status');
    const statusSpan = statusElement?.querySelector('.status');
    
    if (statusSpan && gameState.gameMode === 'online') {
      if (!connected) {
        statusSpan.textContent = 'Opponent Disconnected';
        statusSpan.className = 'status status--warning';
      } else {
        statusSpan.textContent = 'Connected';
        statusSpan.className = 'status status--success';
      }
    }
  }

  handleRoomRemoved() {
    if (gameState.gameMode === 'online' && gameState.isGameActive) {
      alert('Game room was closed. Returning to main menu.');
      if (window.gameEngine) {
        window.gameEngine.quitGame();
      }
    }
  }

  async handlePlayerDisconnection(roomCode, playerId) {
    if (!this.database) return;

    try {
      // Remove player from room
      await this.database.ref(`rooms/${roomCode}/players/${playerId}`).remove();
      
      // Check if room is empty and clean up
      const roomSnapshot = await this.database.ref(`rooms/${roomCode}`).once('value');
      if (roomSnapshot.exists()) {
        const roomData = roomSnapshot.val();
        const playerCount = Object.keys(roomData.players || {}).length;
        
        if (playerCount === 0) {
          await this.database.ref(`rooms/${roomCode}`).remove();
        }
      }
    } catch (error) {
      console.error('Failed to handle player disconnection:', error);
    }
  }

  async saveToLeaderboard(playerData) {
    if (!this.database) return;

    try {
      const leaderboardRef = this.database.ref(`leaderboard/${playerData.id}`);
      const snapshot = await leaderboardRef.once('value');
      
      let existingData = snapshot.val() || {
        name: playerData.name,
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        totalTies: 0,
        winStreak: 0,
        maxWinStreak: 0
      };

      existingData.totalGames += playerData.totalGames;
      existingData.totalWins += playerData.totalWins;
      existingData.totalLosses += playerData.totalLosses;
      existingData.totalTies += playerData.totalTies;

      if (playerData.won) {
        existingData.winStreak++;
        existingData.maxWinStreak = Math.max(existingData.maxWinStreak, existingData.winStreak);
      } else if (playerData.lost) {
        existingData.winStreak = 0;
      }

      await leaderboardRef.set(existingData);
    } catch (error) {
      console.error('Failed to save to leaderboard:', error);
    }
  }

  async loadLeaderboard() {
    if (!this.database) return [];

    try {
      const snapshot = await this.database.ref('leaderboard').once('value');
      const data = snapshot.val() || {};
      return Object.values(data);
    } catch (error) {
      console.error('Failed to load leaderboard:', error);
      return [];
    }
  }

  cleanup() {
    // Remove all listeners
    gameState.roomListeners.forEach(({ ref, listener }) => {
      ref.off('value', listener);
    });
    gameState.roomListeners = [];

    // Remove presence
    if (this.connectionRef) {
      this.connectionRef.off();
      this.connectionRef = null;
    }
  }
}

// Navigation System
class NavigationManager {
  constructor() {
    this.init();
  }

  init() {
    // Wait for DOM to be ready
    setTimeout(() => {
      this.setupEventListeners();
      this.updateNavigation();
    }, 100);
  }

  setupEventListeners() {
    document.querySelectorAll('[data-section]').forEach(element => {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const section = e.currentTarget.dataset.section;
        console.log('Navigating to:', section);
        this.navigateTo(section);
      });
    });
  }

  navigateTo(sectionId) {
    console.log('NavigationManager: navigating to', sectionId);
    
    // Hide all sections
    document.querySelectorAll('.section').forEach(section => {
      section.classList.remove('active');
    });

    // Show target section
    const targetSection = document.getElementById(sectionId);
    if (targetSection) {
      targetSection.classList.add('active');
      gameState.currentSection = sectionId;
      this.updateNavigation();
      
      // Hide connection status on non-game sections
      const connectionStatus = document.getElementById('connection-status');
      if (connectionStatus) {
        if (sectionId !== 'game-play') {
          connectionStatus.classList.add('hidden');
        } else {
          connectionStatus.classList.remove('hidden');
        }
      }
    }
  }

  updateNavigation() {
    const navBtn = document.querySelector('#main-nav .nav-btn');
    if (navBtn) {
      if (gameState.currentSection === 'main-menu') {
        navBtn.classList.remove('show');
      } else {
        navBtn.classList.add('show');
      }
    }
  }
}

// Game Logic
class GameEngine {
  constructor() {
    this.firebaseManager = new FirebaseGameManager();
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Wait for DOM to be ready
    setTimeout(() => {
      this.setupAllEventListeners();
    }, 100);
  }

  setupAllEventListeners() {
    const startGameBtn = document.getElementById('start-game');
    if (startGameBtn) {
      startGameBtn.addEventListener('click', (e) => {
        e.preventDefault();
        console.log('Start game clicked');
        this.startGame();
      });
    }
    
    document.querySelectorAll('input[name="gameMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => this.handleGameModeChange(e.target.value));
    });

    const joinGameBtn = document.getElementById('join-game-btn');
    if (joinGameBtn) {
      joinGameBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.joinGame();
      });
    }

    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.makeChoice(e.currentTarget.dataset.choice);
      });
    });

    const nextRoundBtn = document.getElementById('next-round');
    if (nextRoundBtn) {
      nextRoundBtn.addEventListener('click', () => this.nextRound());
    }

    const playAgainBtn = document.getElementById('play-again');
    if (playAgainBtn) {
      playAgainBtn.addEventListener('click', () => this.playAgain());
    }

    const playAgainModalBtn = document.getElementById('play-again-modal');
    if (playAgainModalBtn) {
      playAgainModalBtn.addEventListener('click', () => this.playAgain());
    }

    const quitGameBtn = document.getElementById('quit-game');
    if (quitGameBtn) {
      quitGameBtn.addEventListener('click', () => this.quitGame());
    }

    const mainMenuModalBtn = document.getElementById('main-menu-modal');
    if (mainMenuModalBtn) {
      mainMenuModalBtn.addEventListener('click', () => this.quitGame());
    }

    const copyCodeBtn = document.getElementById('copy-code');
    if (copyCodeBtn) {
      copyCodeBtn.addEventListener('click', () => this.copyRoomCode());
    }
  }

  handleGameModeChange(mode) {
    gameState.gameMode = mode;
    const difficultyGroup = document.getElementById('difficulty-group');
    const roomCodeDisplay = document.getElementById('room-code-display');
    
    if (mode === 'local') {
      if (difficultyGroup) difficultyGroup.style.display = 'block';
      if (roomCodeDisplay) roomCodeDisplay.classList.add('hidden');
    } else {
      if (difficultyGroup) difficultyGroup.style.display = 'none';
      if (roomCodeDisplay) roomCodeDisplay.classList.remove('hidden');
    }
  }

  copyRoomCode() {
    const codeElement = document.getElementById('room-code-text');
    if (codeElement) {
      const code = codeElement.textContent;
      navigator.clipboard.writeText(code).then(() => {
        const btn = document.getElementById('copy-code');
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      });
    }
  }

  async joinGame() {
    const roomCodeInput = document.getElementById('room-code-input');
    const playerNameInput = document.getElementById('join-player-name');
    const statusElement = document.getElementById('join-status');
    
    if (!roomCodeInput || !playerNameInput || !statusElement) return;

    const roomCode = roomCodeInput.value.toUpperCase();
    const playerName = playerNameInput.value || 'Player 2';

    if (!roomCode || roomCode.length !== 6) {
      this.showStatus(statusElement, 'Please enter a valid 6-digit room code', 'error');
      return;
    }

    try {
      this.showStatus(statusElement, 'Joining game...', 'info');
      
      const result = await this.firebaseManager.joinRoom(roomCode, playerName);
      gameState.currentRoomCode = roomCode;
      gameState.player1.name = playerName;
      gameState.player2.name = result.hostName;
      gameState.gameMode = 'online';

      this.firebaseManager.setupRealTimeListeners(roomCode, result.playerId);
      
      this.showStatus(statusElement, 'Successfully joined the game!', 'success');
      
    } catch (error) {
      this.showStatus(statusElement, error.message, 'error');
    }
  }

  async startGame() {
    console.log('Starting game with mode:', gameState.gameMode);
    
    const playerNameInput = document.getElementById('playerName');
    const gameCountSelect = document.getElementById('gameCount');
    const difficultySelect = document.getElementById('difficulty');
    
    if (playerNameInput) {
      gameState.player1.name = playerNameInput.value || 'Player 1';
    }
    if (gameCountSelect) {
      gameState.maxGames = parseInt(gameCountSelect.value);
    }
    if (difficultySelect) {
      gameState.difficulty = difficultySelect.value;
    }

    if (gameState.gameMode === 'local') {
      gameState.player2.name = 'Computer';
      this.initializeGame();
      window.navigationManager.navigateTo('game-play');
    } else {
      try {
        const result = await this.firebaseManager.createRoom({
          hostName: gameState.player1.name,
          maxGames: gameState.maxGames,
          difficulty: gameState.difficulty
        });
        
        gameState.currentRoomCode = result.roomCode;
        const roomCodeText = document.getElementById('room-code-text');
        if (roomCodeText) {
          roomCodeText.textContent = result.roomCode;
        }
        
        this.firebaseManager.setupRealTimeListeners(result.roomCode, result.playerId);
        
      } catch (error) {
        alert('Failed to create room: ' + error.message);
      }
    }
  }

  initializeOnlineGame() {
    this.initializeGame();
  }

  initializeGame() {
    gameState.currentGame = 0;
    gameState.player1.score = 0;
    gameState.player2.score = 0;
    gameState.gameHistory = [];
    gameState.playerHistory = [];
    gameState.isGameActive = true;
    gameState.waitingForChoice = false;

    this.updateGameUI();
    this.resetRound();
  }

  updateGameUI() {
    const player1NameEl = document.getElementById('player1-name');
    const player2NameEl = document.getElementById('player2-name');
    const player1ScoreEl = document.getElementById('player1-score');
    const player2ScoreEl = document.getElementById('player2-score');
    const progressEl = document.getElementById('game-progress-text');
    
    if (player1NameEl) player1NameEl.textContent = gameState.player1.name;
    if (player2NameEl) player2NameEl.textContent = gameState.player2.name;
    if (player1ScoreEl) player1ScoreEl.textContent = gameState.player1.score;
    if (player2ScoreEl) player2ScoreEl.textContent = gameState.player2.score;
    
    if (progressEl) {
      const progressText = gameState.maxGames === -1 
        ? `Round ${gameState.currentGame + 1}`
        : `Round ${gameState.currentGame + 1} of ${gameState.maxGames}`;
      progressEl.textContent = progressText;
    }
  }

  resetRound() {
    gameState.player1.choice = null;
    gameState.player2.choice = null;
    gameState.waitingForChoice = false;

    const elements = {
      player1Choice: document.getElementById('player1-choice'),
      player1ChoiceName: document.getElementById('player1-choice-name'),
      player2Choice: document.getElementById('player2-choice'),
      player2ChoiceName: document.getElementById('player2-choice-name'),
      roundResult: document.getElementById('round-result'),
      resultExplanation: document.getElementById('result-explanation'),
      nextRound: document.getElementById('next-round'),
      playAgain: document.getElementById('play-again')
    };

    if (elements.player1Choice) elements.player1Choice.textContent = '?';
    if (elements.player1ChoiceName) elements.player1ChoiceName.textContent = 'Make your choice';
    if (elements.player2Choice) elements.player2Choice.textContent = '?';
    if (elements.player2ChoiceName) elements.player2ChoiceName.textContent = 'Waiting...';
    if (elements.roundResult) elements.roundResult.textContent = '';
    if (elements.resultExplanation) elements.resultExplanation.textContent = '';

    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.classList.remove('selected');
      btn.disabled = false;
    });

    document.querySelectorAll('.choice-icon').forEach(icon => {
      icon.classList.remove('winner', 'loser');
    });

    if (elements.nextRound) elements.nextRound.classList.add('hidden');
    if (elements.playAgain) elements.playAgain.classList.add('hidden');
  }

  async makeChoice(choice) {
    if (!gameState.isGameActive || gameState.waitingForChoice) return;

    gameState.player1.choice = choice;
    gameState.waitingForChoice = true;

    const choiceData = choices.find(c => c.id === choice);
    const player1Choice = document.getElementById('player1-choice');
    const player1ChoiceName = document.getElementById('player1-choice-name');
    
    if (player1Choice) player1Choice.textContent = choiceData.emoji;
    if (player1ChoiceName) player1ChoiceName.textContent = choiceData.name;

    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.classList.remove('selected');
      if (btn.dataset.choice === choice) {
        btn.classList.add('selected');
      }
      btn.disabled = true;
    });

    gameState.playerHistory.push(choice);

    if (gameState.gameMode === 'local') {
      gameState.player2.choice = this.getComputerChoice();
      setTimeout(() => {
        this.resolveRound();
      }, 1000);
    } else {
      try {
        await this.firebaseManager.submitChoice(
          gameState.currentRoomCode,
          gameState.player1.id,
          choice
        );
      } catch (error) {
        console.error('Failed to submit choice:', error);
      }
    }
  }

  getComputerChoice() {
    const allChoices = choices.map(c => c.id);
    
    switch (gameState.difficulty) {
      case 'easy':
        return this.getRandomChoice();
      case 'medium':
        return this.getMediumAIChoice(allChoices);
      case 'hard':
        return this.getHardAIChoice(allChoices);
      default:
        return this.getRandomChoice();
    }
  }

  getRandomChoice() {
    const allChoices = choices.map(c => c.id);
    return allChoices[Math.floor(Math.random() * allChoices.length)];
  }

  getMediumAIChoice(allChoices) {
    if (gameState.playerHistory.length < 3) {
      return this.getRandomChoice();
    }

    const recent = gameState.playerHistory.slice(-3);
    const mostCommon = this.getMostCommonChoice(recent);
    
    if (mostCommon && Math.random() < 0.6) {
      return this.getCounterChoice(mostCommon);
    }
    
    return this.getRandomChoice();
  }

  getHardAIChoice(allChoices) {
    if (gameState.playerHistory.length < 2) {
      return this.getRandomChoice();
    }

    const recent = gameState.playerHistory.slice(-5);
    const sequence = this.findSequencePattern(recent);
    
    if (sequence && Math.random() < 0.7) {
      return this.getCounterChoice(sequence);
    }
    
    const mostCommon = this.getMostCommonChoice(recent);
    if (mostCommon && Math.random() < 0.8) {
      return this.getCounterChoice(mostCommon);
    }
    
    return this.getRandomChoice();
  }

  getMostCommonChoice(choices) {
    const counts = {};
    choices.forEach(choice => {
      counts[choice] = (counts[choice] || 0) + 1;
    });
    
    return Object.keys(counts).reduce((a, b) => 
      counts[a] > counts[b] ? a : b
    );
  }

  findSequencePattern(choices) {
    if (choices.length < 4) return null;
    
    const lastTwo = choices.slice(-2);
    for (let i = 0; i < choices.length - 3; i++) {
      if (choices[i] === lastTwo[0] && choices[i + 1] === lastTwo[1]) {
        if (i + 2 < choices.length) {
          return choices[i + 2];
        }
      }
    }
    
    return null;
  }

  getCounterChoice(choice) {
    const allChoices = choices.map(c => c.id);
    const counters = allChoices.filter(c => 
      gameRules[c].beats.includes(choice)
    );
    
    if (counters.length > 0) {
      return counters[Math.floor(Math.random() * counters.length)];
    }
    
    return this.getRandomChoice();
  }

  resolveRound() {
    this.processRoundResult();
  }

  resolveOnlineRound() {
    this.processRoundResult();
    this.updateFirebaseScores();
  }

  async updateFirebaseScores() {
    if (gameState.gameMode === 'online' && gameState.currentRoomCode) {
      try {
        await this.firebaseManager.updatePlayerScore(
          gameState.currentRoomCode,
          gameState.player1.id,
          gameState.player1.score
        );

        if (this.isGameOver()) {
          await this.firebaseManager.updateGameState(gameState.currentRoomCode, {
            status: 'finished'
          });
        } else {
          await this.firebaseManager.updateGameState(gameState.currentRoomCode, {
            currentRound: gameState.currentGame,
            bothPlayersReady: false
          });

          // Clear choices for next round
          const players = await database.ref(`rooms/${gameState.currentRoomCode}/players`).once('value');
          const playersData = players.val() || {};
          
          for (let playerId of Object.keys(playersData)) {
            await database.ref(`rooms/${gameState.currentRoomCode}/players/${playerId}/choice`).set(null);
          }
        }
      } catch (error) {
        console.error('Failed to update Firebase scores:', error);
      }
    }
  }

  processRoundResult() {
    const player1Choice = gameState.player1.choice;
    const player2Choice = gameState.player2.choice;

    const p2ChoiceData = choices.find(c => c.id === player2Choice);
    const player2ChoiceEl = document.getElementById('player2-choice');
    const player2ChoiceNameEl = document.getElementById('player2-choice-name');
    
    if (player2ChoiceEl) player2ChoiceEl.textContent = p2ChoiceData.emoji;
    if (player2ChoiceNameEl) player2ChoiceNameEl.textContent = p2ChoiceData.name;

    const result = this.determineWinner(player1Choice, player2Choice);
    
    if (result.winner === 1) {
      gameState.player1.score++;
    } else if (result.winner === 2) {
      gameState.player2.score++;
    }

    this.displayRoundResult(result);
    this.updateGameUI();

    gameState.gameHistory.push({
      round: gameState.currentGame + 1,
      player1Choice,
      player2Choice,
      winner: result.winner,
      explanation: result.explanation
    });

    gameState.currentGame++;

    if (this.isGameOver()) {
      setTimeout(() => this.endGame(), 2000);
    } else {
      const nextRoundBtn = document.getElementById('next-round');
      if (nextRoundBtn) nextRoundBtn.classList.remove('hidden');
    }
  }

  determineWinner(choice1, choice2) {
    if (choice1 === choice2) {
      return { winner: 0, explanation: "It's a tie!" };
    }

    const choice1Rules = gameRules[choice1];
    const choice1Data = choices.find(c => c.id === choice1);
    const choice2Data = choices.find(c => c.id === choice2);

    if (choice1Rules.beats.includes(choice2)) {
      const actionIndex = choice1Rules.beats.indexOf(choice2);
      const action = choice1Rules.actions[actionIndex];
      return {
        winner: 1,
        explanation: `${choice1Data.name} ${action} ${choice2Data.name}`
      };
    } else {
      const choice2Rules = gameRules[choice2];
      const actionIndex = choice2Rules.beats.indexOf(choice1);
      const action = choice2Rules.actions[actionIndex];
      return {
        winner: 2,
        explanation: `${choice2Data.name} ${action} ${choice1Data.name}`
      };
    }
  }

  displayRoundResult(result) {
    const resultElement = document.getElementById('round-result');
    const explanationElement = document.getElementById('result-explanation');
    const player1Icon = document.getElementById('player1-choice');
    const player2Icon = document.getElementById('player2-choice');
    
    if (resultElement) {
      if (result.winner === 1) {
        resultElement.textContent = 'You Win!';
        resultElement.className = 'win';
        if (player1Icon) player1Icon.classList.add('winner');
        if (player2Icon) player2Icon.classList.add('loser');
      } else if (result.winner === 2) {
        resultElement.textContent = `${gameState.player2.name} Wins!`;
        resultElement.className = 'lose';
        if (player1Icon) player1Icon.classList.add('loser');
        if (player2Icon) player2Icon.classList.add('winner');
      } else {
        resultElement.textContent = "It's a Tie!";
        resultElement.className = 'tie';
      }
    }
    
    if (explanationElement) {
      explanationElement.textContent = result.explanation;
    }
  }

  isGameOver() {
    if (gameState.maxGames === -1) return false;
    return gameState.currentGame >= gameState.maxGames;
  }

  async endGame() {
    gameState.isGameActive = false;
    
    await this.updateLeaderboard();
    
    const modal = document.getElementById('game-over-modal');
    const title = document.getElementById('game-over-title');
    const finalScore = document.getElementById('final-score');
    
    if (!modal || !title || !finalScore) return;
    
    const p1Score = gameState.player1.score;
    const p2Score = gameState.player2.score;
    
    if (p1Score > p2Score) {
      title.textContent = '🎉 You Win!';
      title.style.color = 'var(--color-success)';
    } else if (p2Score > p1Score) {
      title.textContent = `😔 ${gameState.player2.name} Wins!`;
      title.style.color = 'var(--color-error)';
    } else {
      title.textContent = "🤝 It's a Tie!";
      title.style.color = 'var(--color-warning)';
    }
    
    finalScore.innerHTML = `
      <div class="final-score-display">
        <div class="score-row">
          <span>${gameState.player1.name}: ${p1Score}</span>
        </div>
        <div class="score-row">
          <span>${gameState.player2.name}: ${p2Score}</span>
        </div>
      </div>
    `;
    
    modal.classList.remove('hidden');
  }

  async updateLeaderboard() {
    const playerName = gameState.player1.name;
    const totalGames = gameState.currentGame;
    const wins = gameState.player1.score;
    const losses = gameState.player2.score;
    const ties = totalGames - wins - losses;

    if (gameState.gameMode === 'online' && gameState.player1.id) {
      // Save to Firebase leaderboard
      try {
        await this.firebaseManager.saveToLeaderboard({
          id: gameState.player1.id,
          name: playerName,
          totalGames,
          totalWins: wins,
          totalLosses: losses,
          totalTies: ties,
          won: wins > losses,
          lost: losses > wins
        });
      } catch (error) {
        console.error('Failed to save to leaderboard:', error);
      }
    } else {
      // Local storage for local games
      let playerEntry = gameState.leaderboard.find(p => p.name === playerName);
      
      if (!playerEntry) {
        playerEntry = {
          name: playerName,
          totalGames: 0,
          totalWins: 0,
          totalLosses: 0,
          totalTies: 0,
          winStreak: 0,
          maxWinStreak: 0
        };
        gameState.leaderboard.push(playerEntry);
      }

      playerEntry.totalGames += totalGames;
      playerEntry.totalWins += wins;
      playerEntry.totalLosses += losses;
      playerEntry.totalTies += ties;

      const finalResult = wins > losses ? 'win' : losses > wins ? 'loss' : 'tie';
      if (finalResult === 'win') {
        playerEntry.winStreak++;
        playerEntry.maxWinStreak = Math.max(playerEntry.maxWinStreak, playerEntry.winStreak);
      } else if (finalResult === 'loss') {
        playerEntry.winStreak = 0;
      }
    }

    if (window.leaderboardManager) {
      window.leaderboardManager.updateDisplay();
    }
  }

  nextRound() {
    this.resetRound();
  }

  playAgain() {
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.classList.add('hidden');
    this.initializeGame();
  }

  quitGame() {
    const modal = document.getElementById('game-over-modal');
    if (modal) modal.classList.add('hidden');
    
    if (gameState.gameMode === 'online' && gameState.currentRoomCode) {
      this.firebaseManager.handlePlayerDisconnection(
        gameState.currentRoomCode,
        gameState.player1.id
      );
      this.firebaseManager.cleanup();
    }
    
    gameState.isGameActive = false;
    gameState.currentRoomCode = null;
    gameState.gameMode = 'local';
    
    window.navigationManager.navigateTo('main-menu');
  }

  showStatus(element, message, type) {
    if (!element) return;
    
    element.textContent = message;
    element.className = `status-message ${type}`;
    element.classList.remove('hidden');
    
    setTimeout(() => {
      element.classList.add('hidden');
    }, 5000);
  }
}

// Feedback System
class FeedbackManager {
  constructor() {
    this.currentRating = 5;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    setTimeout(() => {
      this.setupEventListeners();
    }, 100);
  }

  setupEventListeners() {
    document.querySelectorAll('.star').forEach(star => {
      star.addEventListener('click', (e) => this.setRating(parseInt(e.target.dataset.rating)));
    });

    const feedbackForm = document.getElementById('feedback-form');
    if (feedbackForm) {
      feedbackForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.submitFeedback();
      });
    }
  }

  setRating(rating) {
    this.currentRating = rating;
    
    document.querySelectorAll('.star').forEach((star, index) => {
      if (index < rating) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });
    
    const ratingTexts = ['Terrible', 'Poor', 'Fair', 'Good', 'Excellent'];
    const ratingTextEl = document.querySelector('.rating-text');
    if (ratingTextEl) {
      ratingTextEl.textContent = 
        `Click to rate (${rating} star${rating !== 1 ? 's' : ''} - ${ratingTexts[rating - 1]})`;
    }
  }

  async submitFeedback() {
    const nameEl = document.getElementById('feedback-name');
    const emailEl = document.getElementById('feedback-email');
    const messageEl = document.getElementById('feedback-message');

    const name = nameEl ? nameEl.value : '';
    const email = emailEl ? emailEl.value : '';
    const message = messageEl ? messageEl.value : '';

    if (!message.trim()) {
      alert('Please enter your feedback message.');
      return;
    }

    try {
      if (database) {
        await database.ref('feedback').push({
          name: name || 'Anonymous',
          email,
          rating: this.currentRating,
          message,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error('Failed to save feedback:', error);
    }

    const formEl = document.getElementById('feedback-form');
    const successEl = document.getElementById('feedback-success');
    
    if (formEl) formEl.classList.add('hidden');
    if (successEl) successEl.classList.remove('hidden');

    setTimeout(() => {
      this.resetForm();
    }, 3000);
  }

  resetForm() {
    const formEl = document.getElementById('feedback-form');
    const successEl = document.getElementById('feedback-success');
    
    if (formEl) {
      formEl.reset();
      formEl.classList.remove('hidden');
    }
    if (successEl) successEl.classList.add('hidden');
    
    this.setRating(5);
  }
}

// Leaderboard Manager
class LeaderboardManager {
  constructor() {
    this.initializeEventListeners();
    this.loadData();
  }

  initializeEventListeners() {
    setTimeout(() => {
      const sortBy = document.getElementById('sort-by');
      if (sortBy) {
        sortBy.addEventListener('change', () => {
          this.updateDisplay();
        });
      }
    }, 100);
  }

  async loadData() {
    if (database && window.gameEngine) {
      try {
        const firebaseData = await window.gameEngine.firebaseManager?.loadLeaderboard() || [];
        gameState.leaderboard = [...gameState.leaderboard, ...firebaseData];
        this.updateDisplay();
      } catch (error) {
        console.error('Failed to load leaderboard:', error);
        this.updateDisplay();
      }
    } else {
      this.updateDisplay();
    }
  }

  updateDisplay() {
    const sortByEl = document.getElementById('sort-by');
    const tbody = document.getElementById('leaderboard-body');
    
    if (!tbody) return;
    
    const sortBy = sortByEl ? sortByEl.value : 'winPercentage';
    
    if (gameState.leaderboard.length === 0) {
      tbody.innerHTML = '<div class="empty-state"><p>No games played yet. Start playing to see statistics!</p></div>';
      return;
    }

    const sorted = [...gameState.leaderboard].sort((a, b) => {
      switch (sortBy) {
        case 'winPercentage':
          const aPercent = a.totalGames > 0 ? (a.totalWins / a.totalGames) * 100 : 0;
          const bPercent = b.totalGames > 0 ? (b.totalWins / b.totalGames) * 100 : 0;
          return bPercent - aPercent;
        case 'totalWins':
          return b.totalWins - a.totalWins;
        case 'totalGames':
          return b.totalGames - a.totalGames;
        case 'winStreak':
          return b.winStreak - a.winStreak;
        default:
          return 0;
      }
    });

    let html = '';
    sorted.forEach((player, index) => {
      const winPercentage = player.totalGames > 0 
        ? Math.round((player.totalWins / player.totalGames) * 100)
        : 0;
      
      const rankClass = index < 3 ? `rank-${index + 1}` : '';
      
      html += `
        <div class="table-row">
          <div class="table-cell ${rankClass}">${index + 1}</div>
          <div class="table-cell">${player.name}</div>
          <div class="table-cell">${winPercentage}%</div>
          <div class="table-cell">${player.totalWins}/${player.totalLosses}/${player.totalTies}</div>
          <div class="table-cell">${player.winStreak}</div>
        </div>
      `;
    });

    tbody.innerHTML = html;
  }
}

// Initialize Application
let navigationManager;
let gameEngine;
let feedbackManager;
let leaderboardManager;

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded, initializing app...');
  
  navigationManager = new NavigationManager();
  gameEngine = new GameEngine();
  feedbackManager = new FeedbackManager();
  leaderboardManager = new LeaderboardManager();
  
  // Make instances globally available
  window.navigationManager = navigationManager;
  window.gameEngine = gameEngine;
  window.feedbackManager = feedbackManager;
  window.leaderboardManager = leaderboardManager;
  
  // Initialize with some sample leaderboard data for local games
  gameState.leaderboard = [
    { name: 'AI Master', totalGames: 100, totalWins: 75, totalLosses: 20, totalTies: 5, winStreak: 5, maxWinStreak: 12 },
    { name: 'Rock Star', totalGames: 50, totalWins: 30, totalLosses: 15, totalTies: 5, winStreak: 2, maxWinStreak: 8 },
    { name: 'Paper Trail', totalGames: 25, totalWins: 15, totalLosses: 8, totalTies: 2, winStreak: 0, maxWinStreak: 4 }
  ];
  
  console.log('App initialized successfully');
});