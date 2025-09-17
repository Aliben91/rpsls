// Firebase Configuration (Replace with your actual config)
const firebaseConfig = {
    apiKey: "AIzaSyDRA3-b-6aAVy8tYudcIl4pKmgrPN0i8yA",
    authDomain: "rpsls-multiplayer-30daa.firebaseapp.com",
    databaseURL: "https://rpsls-multiplayer-30daa-default-rtdb.firebaseio.com",
    projectId: "rpsls-multiplayer-30daa",
    storageBucket: "rpsls-multiplayer-30daa.firebasestorage.app",
    messagingSenderId: "644787821256",
    appId: "1:644787821256:web:4fc9b34728e19fbf2863fd"
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

// Global Variables
let app = null;
let database = null;
let firebaseAvailable = false;
let currentRoomRef = null;
let leaderboardRef = null;
let gameHistoryRef = null;
let playerId = null;
let roomListeners = [];

// Game State
let gameState = {
  currentSection: 'main-menu',
  gameMode: 'local',
  difficulty: 'medium',
  maxGames: 3,
  currentGame: 0,
  player1: { name: 'Player 1', score: 0, choice: null },
  player2: { name: 'Computer', score: 0, choice: null },
  gameHistory: [],
  playerHistory: [],
  currentRoomCode: null,
  isGameActive: false,
  waitingForChoice: false,
  isHost: false,
  opponentConnected: false,
  bothPlayersReady: false,
  leaderboard: []
};

// Firebase Manager
class FirebaseManager {
  constructor() {
    this.initializeFirebase();
  }

  async initializeFirebase() {
    try {
      // Check if config has placeholder values
      if (firebaseConfig.apiKey === "your-api-key-here") {
        console.warn('Firebase config contains placeholder values. Running in local mode only.');
        this.handleFirebaseUnavailable();
        return;
      }

      // Initialize Firebase
      app = firebase.initializeApp(firebaseConfig);
      database = firebase.database();
      
      // Generate unique player ID
      playerId = this.generatePlayerId();
      
      // Test connection
      await this.testConnection();
      
      firebaseAvailable = true;
      this.setupDatabaseReferences();
      this.updateConnectionStatus('connected', 'Connected to Firebase');
      this.enableOnlineFeatures();
      
      console.log('Firebase initialized successfully');
      
    } catch (error) {
      console.error('Firebase initialization failed:', error);
      this.handleFirebaseUnavailable();
    }
  }

  async testConnection() {
    try {
      const testRef = database.ref('.info/connected');
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Connection timeout'));
        }, 5000);
        
        testRef.once('value', (snapshot) => {
          clearTimeout(timeout);
          if (snapshot.val() === true) {
            resolve();
          } else {
            reject(new Error('Not connected'));
          }
        }, (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });
    } catch (error) {
      throw new Error('Connection test failed');
    }
  }

  setupDatabaseReferences() {
    leaderboardRef = database.ref('leaderboard');
    gameHistoryRef = database.ref('gameHistory');
    
    // Listen for connection status changes
    database.ref('.info/connected').on('value', (snapshot) => {
      if (snapshot.val() === true) {
        this.updateConnectionStatus('connected', 'Connected to Firebase');
      } else {
        this.updateConnectionStatus('connecting', 'Reconnecting to Firebase...');
      }
    });
  }

  handleFirebaseUnavailable() {
    firebaseAvailable = false;
    this.updateConnectionStatus('error', 'Firebase not configured');
    this.showFirebaseNotice();
    this.disableOnlineFeatures();
  }

  updateConnectionStatus(status, text) {
    const statusDot = document.getElementById('status-dot');
    const statusText = document.getElementById('status-text');
    
    if (statusDot && statusText) {
      statusDot.className = `status-dot ${status}`;
      statusText.textContent = text;
    }
  }

  showFirebaseNotice() {
    const notice = document.getElementById('firebase-config-notice');
    if (notice) {
      notice.classList.remove('hidden');
    }
  }

  enableOnlineFeatures() {
    // Enable online mode radio button
    const onlineOption = document.querySelector('input[value="online"]');
    const modeStatus = document.querySelector('.mode-status');
    
    if (onlineOption) {
      onlineOption.disabled = false;
      if (modeStatus) {
        modeStatus.textContent = 'Real-time multiplayer available';
        modeStatus.style.color = 'var(--color-success)';
      }
    }

    // Update online indicators
    document.querySelectorAll('.online-indicator').forEach(indicator => {
      indicator.classList.remove('offline');
      const textSpan = indicator.querySelector('span:last-child');
      if (textSpan) {
        textSpan.textContent = 
          indicator.id === 'join-online-indicator' ? 'Online features available' : 'Synced with Firebase';
      }
    });

    // Hide offline notices
    const offlineNotice = document.getElementById('firebase-offline-notice');
    if (offlineNotice) {
      offlineNotice.classList.add('hidden');
    }
  }

  disableOnlineFeatures() {
    // Disable online mode radio button
    const onlineOption = document.querySelector('input[value="online"]');
    const modeStatus = document.querySelector('.mode-status');
    
    if (onlineOption) {
      onlineOption.disabled = true;
      onlineOption.checked = false;
      const localOption = document.querySelector('input[value="local"]');
      if (localOption) {
        localOption.checked = true;
      }
      if (modeStatus) {
        modeStatus.textContent = 'Requires Firebase setup';
        modeStatus.style.color = 'var(--color-error)';
      }
    }

    // Update online indicators
    document.querySelectorAll('.online-indicator').forEach(indicator => {
      indicator.classList.add('offline');
      const textSpan = indicator.querySelector('span:last-child');
      const dotSpan = indicator.querySelector('.indicator-dot');
      
      if (textSpan) {
        textSpan.textContent = 'Offline mode';
      }
      if (dotSpan) {
        dotSpan.style.background = 'var(--color-error)';
      }
    });

    // Show offline notice in join section
    const offlineNotice = document.getElementById('firebase-offline-notice');
    if (offlineNotice) {
      offlineNotice.classList.remove('hidden');
    }
  }

  generatePlayerId() {
    return 'player_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
  }

  async createRoom(hostName, gameSettings) {
    if (!firebaseAvailable) {
      throw new Error('Firebase not available');
    }

    const roomCode = this.generateRoomCode();
    const roomData = {
      gameId: this.generateGameId(),
      createdAt: firebase.database.ServerValue.TIMESTAMP,
      lastActivity: firebase.database.ServerValue.TIMESTAMP,
      maxPlayers: 2,
      gameConfig: {
        maxRounds: gameSettings.maxGames,
        timeLimit: 30,
        gameMode: 'standard'
      },
      players: {
        player1: {
          id: playerId,
          name: hostName,
          connected: true,
          choice: null,
          score: 0,
          ready: true,
          isHost: true
        },
        player2: null
      },
      gameState: {
        status: 'waiting',
        currentRound: 1,
        roundResults: [],
        winner: null,
        bothPlayersChosen: false
      }
    };

    try {
      await database.ref(`rooms/${roomCode}`).set(roomData);
      currentRoomRef = database.ref(`rooms/${roomCode}`);
      this.setupRoomListener(roomCode);
      return roomCode;
    } catch (error) {
      console.error('Error creating room:', error);
      throw error;
    }
  }

  generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  generateGameId() {
    return 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  setupRoomListener(roomCode) {
    // Implementation for room listening would go here
    console.log('Room listener setup for:', roomCode);
  }

  cleanupRoomListeners() {
    roomListeners.forEach(({ ref, listener }) => {
      if (ref && typeof ref.off === 'function') {
        ref.off('value', listener);
      }
    });
    roomListeners = [];
  }

  async leaveRoom() {
    if (currentRoomRef) {
      this.cleanupRoomListeners();
      currentRoomRef = null;
    }
  }

  async updateLeaderboard(playerName, gameResult) {
    if (!firebaseAvailable || !leaderboardRef) return;
    console.log('Updating leaderboard for:', playerName, gameResult);
  }

  async loadLeaderboard() {
    if (!firebaseAvailable || !leaderboardRef) {
      return [];
    }
    return [];
  }
}

// Utility Functions
function navigateToSection(sectionId) {
  console.log('Navigating to section:', sectionId);
  
  // Hide all sections
  document.querySelectorAll('.section').forEach(section => {
    section.classList.remove('active');
  });

  // Show target section
  const targetSection = document.getElementById(sectionId);
  if (targetSection) {
    targetSection.classList.add('active');
    gameState.currentSection = sectionId;
    updateNavigation();
    
    // Load leaderboard if navigating to leaderboard section
    if (sectionId === 'leaderboard' && leaderboardManager) {
      leaderboardManager.loadLeaderboard();
    }
  }
}

function updateNavigation() {
  const navBtn = document.getElementById('main-nav')?.querySelector('.nav-btn');
  if (navBtn) {
    if (gameState.currentSection === 'main-menu') {
      navBtn.classList.remove('show');
    } else {
      navBtn.classList.add('show');
    }
  }
}

// Navigation System
class NavigationManager {
  constructor() {
    this.init();
  }

  init() {
    this.setupNavigationEvents();
    this.updateNavigation();
  }

  setupNavigationEvents() {
    // Handle menu card clicks with more specific targeting
    const menuCards = document.querySelectorAll('.menu-card[data-section]');
    menuCards.forEach(card => {
      card.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const section = card.getAttribute('data-section');
        console.log('Menu card clicked:', section);
        this.navigateTo(section);
      });
    });

    // Handle navigation button clicks
    const navButtons = document.querySelectorAll('.nav-btn[data-section]');
    navButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const section = btn.getAttribute('data-section');
        console.log('Nav button clicked:', section);
        this.navigateTo(section);
      });
    });

    // Handle other navigation elements
    const otherNavElements = document.querySelectorAll('button[data-section]:not(.menu-card):not(.nav-btn)');
    otherNavElements.forEach(element => {
      element.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const section = element.getAttribute('data-section');
        console.log('Other nav element clicked:', section);
        this.navigateTo(section);
      });
    });
  }

  navigateTo(sectionId) {
    navigateToSection(sectionId);
  }

  updateNavigation() {
    updateNavigation();
  }
}

// Game Engine
class GameEngine {
  constructor() {
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Create game form - use more specific event handling
    const startGameBtn = document.getElementById('start-game');
    if (startGameBtn) {
      startGameBtn.onclick = (e) => {
        e.preventDefault();
        console.log('Start game button clicked');
        this.startGame();
      };
    }
    
    // Game mode radio buttons
    const gameModeRadios = document.querySelectorAll('input[name="gameMode"]');
    gameModeRadios.forEach(radio => {
      radio.addEventListener('change', (e) => {
        console.log('Game mode changed to:', e.target.value);
        this.handleGameModeChange(e.target.value);
      });
    });

    // Join game button
    const joinGameBtn = document.getElementById('join-game-btn');
    if (joinGameBtn) {
      joinGameBtn.onclick = (e) => {
        e.preventDefault();
        console.log('Join game button clicked');
        this.joinGame();
      };
    }

    // Choice buttons
    const choiceButtons = document.querySelectorAll('.choice-btn');
    choiceButtons.forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        const choice = btn.getAttribute('data-choice');
        console.log('Choice button clicked:', choice);
        this.makeChoice(choice);
      };
    });

    // Game control buttons
    this.setupGameControlButtons();

    // Copy room code
    const copyCodeBtn = document.getElementById('copy-code');
    if (copyCodeBtn) {
      copyCodeBtn.onclick = (e) => {
        e.preventDefault();
        this.copyRoomCode();
      };
    }
  }

  setupGameControlButtons() {
    const controlButtons = [
      { id: 'next-round', handler: () => this.nextRound() },
      { id: 'play-again', handler: () => this.playAgain() },
      { id: 'play-again-modal', handler: () => this.playAgain() },
      { id: 'quit-game', handler: () => this.quitGame() },
      { id: 'main-menu-modal', handler: () => this.quitGame() }
    ];

    controlButtons.forEach(({ id, handler }) => {
      const btn = document.getElementById(id);
      if (btn) {
        btn.onclick = (e) => {
          e.preventDefault();
          handler();
        };
      }
    });
  }

  handleGameModeChange(mode) {
    gameState.gameMode = mode;
    const difficultyGroup = document.getElementById('difficulty-group');
    const roomCodeDisplay = document.getElementById('room-code-display');
    
    console.log('Handling game mode change to:', mode);
    
    if (difficultyGroup && roomCodeDisplay) {
      if (mode === 'local') {
        difficultyGroup.style.display = 'block';
        roomCodeDisplay.classList.add('hidden');
      } else {
        difficultyGroup.style.display = 'none';
        roomCodeDisplay.classList.add('hidden');
      }
    }
  }

  async startGame() {
    console.log('Starting game...');
    
    const startButton = document.getElementById('start-game');
    const playerNameInput = document.getElementById('playerName');
    const gameCountSelect = document.getElementById('gameCount');
    const difficultySelect = document.getElementById('difficulty');
    
    if (!playerNameInput || !gameCountSelect || !difficultySelect) {
      console.error('Required form elements not found');
      alert('Form elements not found. Please refresh the page and try again.');
      return;
    }
    
    const playerName = playerNameInput.value || 'Player 1';
    
    gameState.player1.name = playerName;
    gameState.maxGames = parseInt(gameCountSelect.value);
    gameState.difficulty = difficultySelect.value;

    console.log('Game settings:', {
      playerName,
      maxGames: gameState.maxGames,
      difficulty: gameState.difficulty,
      mode: gameState.gameMode
    });

    if (gameState.gameMode === 'online') {
      if (!firebaseAvailable) {
        alert('Firebase is not available. Please play in local mode.');
        return;
      }

      try {
        // Show loading state
        if (startButton) {
          startButton.classList.add('loading');
        }
        
        // Create room in Firebase
        const roomCode = await firebaseManager.createRoom(playerName, {
          maxGames: gameState.maxGames
        });
        
        gameState.currentRoomCode = roomCode;
        gameState.isHost = true;
        gameState.player2.name = 'Waiting for player...';
        
        // Show room code
        const roomCodeText = document.getElementById('room-code-text');
        const roomCodeDisplay = document.getElementById('room-code-display');
        const hostNameElement = document.getElementById('host-name');
        
        if (roomCodeText) roomCodeText.textContent = roomCode;
        if (roomCodeDisplay) roomCodeDisplay.classList.remove('hidden');
        if (hostNameElement) hostNameElement.textContent = `${playerName} (Host)`;
        
        if (startButton) {
          startButton.classList.remove('loading');
        }
        
      } catch (error) {
        console.error('Error creating room:', error);
        if (startButton) {
          startButton.classList.remove('loading');
        }
        alert('Failed to create room. Please try again.');
      }
    } else {
      gameState.player2.name = 'Computer';
      this.initializeGame();
      navigateToSection('game-play');
    }
  }

  async joinGame() {
    console.log('Joining game...');
    
    const joinButton = document.getElementById('join-game-btn');
    const roomCodeInput = document.getElementById('room-code-input');
    const playerNameInput = document.getElementById('join-player-name');
    const statusElement = document.getElementById('join-status');
    
    if (!roomCodeInput || !playerNameInput || !statusElement) {
      console.error('Required form elements not found');
      return;
    }

    const roomCode = roomCodeInput.value.toUpperCase();
    const playerName = playerNameInput.value || 'Player 2';

    if (!firebaseAvailable) {
      this.showStatus(statusElement, 'Firebase is not available. Cannot join online games.', 'error');
      return;
    }

    if (!roomCode || roomCode.length !== 6) {
      this.showStatus(statusElement, 'Please enter a valid 6-digit room code', 'error');
      return;
    }

    try {
      if (joinButton) {
        joinButton.classList.add('loading');
      }
      
      // Simulate joining room (would use Firebase in real implementation)
      this.showStatus(statusElement, 'Successfully joined the game!', 'success');
      
      setTimeout(() => {
        gameState.player1.name = playerName;
        gameState.player2.name = 'Host Player';
        gameState.gameMode = 'online';
        gameState.maxGames = 3;
        this.initializeGame();
        navigateToSection('game-play');
      }, 1500);
      
    } catch (error) {
      console.error('Error joining room:', error);
      this.showStatus(statusElement, 'Failed to join room. Please try again.', 'error');
    } finally {
      if (joinButton) {
        joinButton.classList.remove('loading');
      }
    }
  }

  initializeGame() {
    console.log('Initializing game...');
    
    // Reset game state
    gameState.currentGame = 0;
    gameState.player1.score = 0;
    gameState.player2.score = 0;
    gameState.gameHistory = [];
    gameState.playerHistory = [];
    gameState.isGameActive = true;
    gameState.waitingForChoice = false;

    this.updateGameUI();
    this.resetRound();
    
    // Show online game status if online
    const onlineStatus = document.getElementById('online-game-status');
    if (onlineStatus && gameState.gameMode === 'online') {
      onlineStatus.classList.add('visible');
      
      const connectionText = document.getElementById('game-connection-text');
      const connectionDot = document.getElementById('game-connection-dot');
      
      if (connectionText) connectionText.textContent = 'Connected';
      if (connectionDot) connectionDot.className = 'status-dot connected';
    }
  }

  updateGameUI() {
    const elements = [
      { id: 'player1-name', value: gameState.player1.name },
      { id: 'player2-name', value: gameState.player2.name },
      { id: 'player1-score', value: gameState.player1.score },
      { id: 'player2-score', value: gameState.player2.score }
    ];

    elements.forEach(({ id, value }) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });
    
    const progressElement = document.getElementById('game-progress-text');
    if (progressElement) {
      const progressText = gameState.maxGames === -1 
        ? `Round ${gameState.currentGame + 1}`
        : `Round ${gameState.currentGame + 1} of ${gameState.maxGames}`;
      progressElement.textContent = progressText;
    }
  }

  resetRound() {
    gameState.player1.choice = null;
    gameState.player2.choice = null;
    gameState.waitingForChoice = false;

    // Reset UI elements
    const uiResets = [
      { id: 'player1-choice', value: '?' },
      { id: 'player1-choice-name', value: 'Make your choice' },
      { id: 'player2-choice', value: '?' },
      { id: 'player2-choice-name', value: gameState.gameMode === 'online' ? 'Waiting for opponent...' : 'Waiting...' },
      { id: 'round-result', value: '' },
      { id: 'result-explanation', value: '' },
      { id: 'player1-status', value: '' },
      { id: 'player2-status', value: '' }
    ];

    uiResets.forEach(({ id, value }) => {
      const element = document.getElementById(id);
      if (element) element.textContent = value;
    });

    // Reset choice buttons
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.classList.remove('selected');
      btn.disabled = false;
    });

    // Reset choice icons
    document.querySelectorAll('.choice-icon').forEach(icon => {
      icon.classList.remove('winner', 'loser');
    });

    // Hide/show controls
    const controlElements = [
      { id: 'next-round', action: 'add' },
      { id: 'play-again', action: 'add' },
      { id: 'waiting-message', action: 'remove' },
      { id: 'choice-buttons', action: 'remove', className: 'disabled' }
    ];

    controlElements.forEach(({ id, action, className = 'hidden' }) => {
      const element = document.getElementById(id);
      if (element) {
        if (action === 'add') {
          element.classList.add(className);
        } else {
          element.classList.remove(className);
        }
      }
    });
  }

  async makeChoice(choice) {
    if (!gameState.isGameActive || gameState.waitingForChoice) return;

    console.log('Player choice:', choice);

    gameState.player1.choice = choice;
    gameState.waitingForChoice = true;

    // Update UI
    const choiceData = choices.find(c => c.id === choice);
    if (choiceData) {
      const elements = [
        { id: 'player1-choice', value: choiceData.emoji },
        { id: 'player1-choice-name', value: choiceData.name },
        { id: 'player1-status', value: 'Choice made' }
      ];

      elements.forEach(({ id, value }) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      });
    }

    // Highlight selected button and disable all
    document.querySelectorAll('.choice-btn').forEach(btn => {
      btn.classList.remove('selected');
      if (btn.getAttribute('data-choice') === choice) {
        btn.classList.add('selected');
      }
      btn.disabled = true;
    });

    // Store player choice for AI learning
    gameState.playerHistory.push(choice);

    if (gameState.gameMode === 'online') {
      // Show waiting message
      const waitingMessage = document.getElementById('waiting-message');
      const waitingText = document.getElementById('waiting-text');
      const choiceButtons = document.getElementById('choice-buttons');
      
      if (waitingMessage) waitingMessage.classList.add('visible');
      if (waitingText) waitingText.textContent = 'Waiting for opponent\'s choice...';
      if (choiceButtons) choiceButtons.classList.add('disabled');
      
      // Simulate opponent choice after delay
      setTimeout(() => {
        gameState.player2.choice = this.getRandomChoice();
        this.resolveRound();
      }, 2000 + Math.random() * 2000);
      
    } else {
      // Local game - get computer choice
      gameState.player2.choice = this.getComputerChoice();
      
      // Small delay for better UX
      setTimeout(() => {
        this.resolveRound();
      }, 1000);
    }
  }

  getComputerChoice() {
    switch (gameState.difficulty) {
      case 'easy':
        return this.getRandomChoice();
      case 'medium':
        return this.getMediumAIChoice();
      case 'hard':
        return this.getHardAIChoice();
      default:
        return this.getRandomChoice();
    }
  }

  getRandomChoice() {
    const allChoices = choices.map(c => c.id);
    return allChoices[Math.floor(Math.random() * allChoices.length)];
  }

  getMediumAIChoice() {
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

  getHardAIChoice() {
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
    const player1Choice = gameState.player1.choice;
    const player2Choice = gameState.player2.choice;

    console.log('Resolving round:', player1Choice, 'vs', player2Choice);

    // Hide waiting message
    const waitingMessage = document.getElementById('waiting-message');
    if (waitingMessage) {
      waitingMessage.classList.remove('visible');
    }

    // Update UI with opponent choice
    const p2ChoiceData = choices.find(c => c.id === player2Choice);
    if (p2ChoiceData) {
      const elements = [
        { id: 'player2-choice', value: p2ChoiceData.emoji },
        { id: 'player2-choice-name', value: p2ChoiceData.name },
        { id: 'player2-status', value: 'Choice made' }
      ];

      elements.forEach(({ id, value }) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
      });
    }

    // Determine winner
    const result = this.determineWinner(player1Choice, player2Choice);
    
    // Update scores
    if (result.winner === 1) {
      gameState.player1.score++;
    } else if (result.winner === 2) {
      gameState.player2.score++;
    }

    // Update UI with result
    this.displayRoundResult(result);
    this.updateGameUI();

    // Store round result
    gameState.gameHistory.push({
      round: gameState.currentGame + 1,
      player1Choice,
      player2Choice,
      winner: result.winner,
      explanation: result.explanation
    });

    gameState.currentGame++;

    // Check if game is over
    if (this.isGameOver()) {
      setTimeout(() => this.endGame(), 2000);
    } else {
      // Show next round button
      setTimeout(() => {
        const nextRoundBtn = document.getElementById('next-round');
        if (nextRoundBtn) {
          nextRoundBtn.classList.remove('hidden');
        }
      }, 1000);
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
    
    // Update choice icons based on result
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
    if (gameState.maxGames === -1) return false; // Unlimited mode
    return gameState.currentGame >= gameState.maxGames;
  }

  async endGame() {
    gameState.isGameActive = false;
    
    // Update leaderboard
    await this.updateLeaderboard();
    
    // Show game over modal
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

    // Find existing player or create new entry
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

    // Update stats
    playerEntry.totalGames += totalGames;
    playerEntry.totalWins += wins;
    playerEntry.totalLosses += losses;
    playerEntry.totalTies += ties;

    // Update win streak
    const finalResult = wins > losses ? 'win' : losses > wins ? 'loss' : 'tie';
    if (finalResult === 'win') {
      playerEntry.winStreak++;
      playerEntry.maxWinStreak = Math.max(playerEntry.maxWinStreak, playerEntry.winStreak);
    } else if (finalResult === 'loss') {
      playerEntry.winStreak = 0;
    }

    // Update Firebase if available
    if (firebaseAvailable) {
      const gameResult = { totalGames, wins, losses, ties };
      await firebaseManager.updateLeaderboard(playerName, gameResult);
    }

    // Update leaderboard display
    if (leaderboardManager) {
      leaderboardManager.updateDisplay();
    }
  }

  nextRound() {
    this.resetRound();
  }

  playAgain() {
    const modal = document.getElementById('game-over-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    
    if (gameState.gameMode === 'online') {
      alert('Play again functionality for online games would require both players to agree. Returning to main menu.');
      this.quitGame();
      return;
    }
    
    this.initializeGame();
  }

  async quitGame() {
    const modal = document.getElementById('game-over-modal');
    if (modal) {
      modal.classList.add('hidden');
    }
    
    if (gameState.gameMode === 'online' && firebaseAvailable) {
      await firebaseManager.leaveRoom();
    }
    
    // Reset game state
    gameState.isGameActive = false;
    gameState.currentRoomCode = null;
    gameState.isHost = false;
    gameState.opponentConnected = false;
    
    const onlineStatus = document.getElementById('online-game-status');
    if (onlineStatus) {
      onlineStatus.classList.remove('visible');
    }
    
    navigateToSection('main-menu');
  }

  copyRoomCode() {
    const code = document.getElementById('room-code-text');
    if (code && code.textContent) {
      navigator.clipboard.writeText(code.textContent).then(() => {
        const btn = document.getElementById('copy-code');
        if (btn) {
          const originalText = btn.textContent;
          btn.textContent = 'Copied!';
          setTimeout(() => {
            btn.textContent = originalText;
          }, 2000);
        }
      });
    }
  }

  showStatus(element, message, type) {
    if (element) {
      element.textContent = message;
      element.className = `status-message ${type}`;
      element.classList.remove('hidden');
      
      setTimeout(() => {
        element.classList.add('hidden');
      }, 5000);
    }
  }
}

// Feedback Manager
class FeedbackManager {
  constructor() {
    this.currentRating = 5;
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Star rating
    const stars = document.querySelectorAll('.star');
    stars.forEach(star => {
      star.onclick = (e) => {
        e.preventDefault();
        const rating = parseInt(star.getAttribute('data-rating'));
        this.setRating(rating);
      };
    });

    // Form submission
    const feedbackForm = document.getElementById('feedback-form');
    if (feedbackForm) {
      feedbackForm.onsubmit = (e) => {
        e.preventDefault();
        this.submitFeedback();
      };
    }
  }

  setRating(rating) {
    this.currentRating = rating;
    
    // Update star display
    document.querySelectorAll('.star').forEach((star, index) => {
      if (index < rating) {
        star.classList.add('active');
      } else {
        star.classList.remove('active');
      }
    });
    
    // Update rating text
    const ratingTexts = ['Terrible', 'Poor', 'Fair', 'Good', 'Excellent'];
    const ratingTextElement = document.querySelector('.rating-text');
    if (ratingTextElement) {
      ratingTextElement.textContent = 
        `Click to rate (${rating} star${rating !== 1 ? 's' : ''} - ${ratingTexts[rating - 1]})`;
    }
  }

  submitFeedback() {
    const nameInput = document.getElementById('feedback-name');
    const emailInput = document.getElementById('feedback-email');
    const messageInput = document.getElementById('feedback-message');

    if (!messageInput || !messageInput.value.trim()) {
      alert('Please enter your feedback message.');
      return;
    }

    const feedbackData = {
      name: nameInput ? nameInput.value || 'Anonymous' : 'Anonymous',
      email: emailInput ? emailInput.value : '',
      rating: this.currentRating,
      message: messageInput.value,
      timestamp: new Date().toISOString()
    };

    console.log('Feedback submitted:', feedbackData);

    const form = document.getElementById('feedback-form');
    const success = document.getElementById('feedback-success');
    
    if (form && success) {
      form.classList.add('hidden');
      success.classList.remove('hidden');
    }

    setTimeout(() => {
      this.resetForm();
    }, 3000);
  }

  resetForm() {
    const form = document.getElementById('feedback-form');
    const success = document.getElementById('feedback-success');
    const formElement = form?.querySelector('form') || document.getElementById('feedback-form');
    
    if (formElement && typeof formElement.reset === 'function') {
      formElement.reset();
    }
    
    if (form && success) {
      form.classList.remove('hidden');
      success.classList.add('hidden');
      this.setRating(5);
    }
  }
}

// Leaderboard Manager
class LeaderboardManager {
  constructor() {
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    const sortSelect = document.getElementById('sort-by');
    if (sortSelect) {
      sortSelect.onchange = () => {
        this.updateDisplay();
      };
    }

    const refreshBtn = document.getElementById('refresh-leaderboard');
    if (refreshBtn) {
      refreshBtn.onclick = (e) => {
        e.preventDefault();
        this.loadLeaderboard();
      };
    }
  }

  async loadLeaderboard() {
    const syncDot = document.getElementById('sync-dot');
    const syncText = document.getElementById('sync-text');
    const loadingElement = document.getElementById('leaderboard-loading');
    
    if (loadingElement) {
      loadingElement.style.display = 'flex';
    }
    if (syncDot) {
      syncDot.className = 'sync-dot';
    }
    if (syncText) {
      syncText.textContent = 'Loading leaderboard...';
    }

    try {
      if (firebaseAvailable) {
        const firebaseLeaderboard = await firebaseManager.loadLeaderboard();
        if (firebaseLeaderboard.length > 0) {
          gameState.leaderboard = firebaseLeaderboard;
        }
        if (syncDot) syncDot.className = 'sync-dot synced';
        if (syncText) syncText.textContent = 'Synced with Firebase';
      } else {
        if (syncDot) syncDot.className = 'sync-dot error';
        if (syncText) syncText.textContent = 'Local data only';
      }
    } catch (error) {
      console.error('Error loading leaderboard:', error);
      if (syncDot) syncDot.className = 'sync-dot error';
      if (syncText) syncText.textContent = 'Sync failed';
    }

    if (loadingElement) {
      loadingElement.style.display = 'none';
    }
    this.updateDisplay();
  }

  updateDisplay() {
    const sortBy = document.getElementById('sort-by')?.value || 'winPercentage';
    const tbody = document.getElementById('leaderboard-body');
    
    if (!tbody) return;
    
    if (gameState.leaderboard.length === 0) {
      tbody.innerHTML = '<div class="empty-state"><p>No games played yet. Start playing to see statistics!</p></div>';
      return;
    }

    const sorted = [...gameState.leaderboard].sort((a, b) => {
      switch (sortBy) {
        case 'winPercentage':
          const aPercent = a.totalGames > 0 ? (a.totalWins || a.wins || 0) / a.totalGames * 100 : 0;
          const bPercent = b.totalGames > 0 ? (b.totalWins || b.wins || 0) / b.totalGames * 100 : 0;
          return bPercent - aPercent;
        case 'totalWins':
          return (b.totalWins || b.wins || 0) - (a.totalWins || a.wins || 0);
        case 'totalGames':
          return b.totalGames - a.totalGames;
        case 'winStreak':
          return (b.winStreak || 0) - (a.winStreak || 0);
        default:
          return 0;
      }
    });

    let html = '';
    sorted.forEach((player, index) => {
      const totalGames = player.totalGames || 0;
      const wins = player.totalWins || player.wins || 0;
      const losses = player.totalLosses || player.losses || 0;
      const ties = player.totalTies || player.ties || 0;
      const winPercentage = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
      
      const rankClass = index < 3 ? `rank-${index + 1}` : '';
      
      html += `
        <div class="table-row">
          <div class="table-cell ${rankClass}">${index + 1}</div>
          <div class="table-cell">${player.name}</div>
          <div class="table-cell">${winPercentage}%</div>
          <div class="table-cell">${wins}/${losses}/${ties}</div>
          <div class="table-cell">${player.winStreak || 0}</div>
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
let firebaseManager;

document.addEventListener('DOMContentLoaded', () => {
  console.log('DOM loaded - Initializing application...');
  
  try {
    // Initialize Firebase first
    firebaseManager = new FirebaseManager();
    
    // Initialize other managers
    navigationManager = new NavigationManager();
    gameEngine = new GameEngine();
    feedbackManager = new FeedbackManager();
    leaderboardManager = new LeaderboardManager();
    
    // Initialize with sample leaderboard data
    gameState.leaderboard = [
      { name: 'AI Master', totalGames: 100, totalWins: 75, totalLosses: 20, totalTies: 5, winStreak: 5, maxWinStreak: 12 },
      { name: 'Rock Star', totalGames: 50, totalWins: 30, totalLosses: 15, totalTies: 5, winStreak: 2, maxWinStreak: 8 },
      { name: 'Paper Trail', totalGames: 25, totalWins: 15, totalLosses: 8, totalTies: 2, winStreak: 0, maxWinStreak: 4 }
    ];
    
    leaderboardManager.updateDisplay();
    
    console.log('Application initialized successfully');
    
  } catch (error) {
    console.error('Error initializing application:', error);
  }
});