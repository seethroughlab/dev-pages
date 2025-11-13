// Joe Frank Loop Player - Main Application JavaScript

// Configuration - Timing Controls
const MUSIC_LOOP_MIN_PLAYS = 5;     // Minimum times a music loop plays before changing
const MUSIC_LOOP_MAX_PLAYS = 10;    // Maximum times a music loop plays before changing
const STORY_PAUSE_MIN_MS = 30000;   // Minimum pause between stories (30 seconds)
const STORY_PAUSE_MAX_MS = 60000;   // Maximum pause between stories (60 seconds)
const MUSIC_TRANSITION_PAUSE_MIN_MS = 5000;   // Minimum pause between music loops (5 seconds)
const MUSIC_TRANSITION_PAUSE_MAX_MS = 10000;  // Maximum pause between music loops (10 seconds)
const MUSIC_FADE_OUT_DURATION_MS = 10000;     // Music fade out duration (10 seconds)
const MUSIC_FADE_IN_DURATION_S = 6;           // Music fade in duration in seconds
const EPISODE_DURATION_MS = 30 * 60 * 1000;   // Episode duration before auto-advance (30 minutes)

// Global audio variables
let musicPlayer = null; // Tone.js Player for music
let storyPlayer = null; // Tone.js Player for current story
let musicVolume = null; // Tone.js Volume node
let storyVolume = null; // Tone.js Volume node
let musicBuffers = [];
let storyBuffers = [];
let playedStories = []; // Track which stories have been played in current episode
let isPlaying = false;
let isPaused = false;
let storyTimeout = null;
let telephoneFilter = null; // Tone.js filter for telephone effect
let telephoneDistortion = null; // Tone.js distortion for telephone effect
let storyReverb = null; // Tone.js reverb for story
let masterCompressor = null; // Tone.js Compressor
let masterLimiter = null; // Tone.js Limiter
let masterVolume = null; // Tone.js Volume for master output

// NPR broadcast effects
let storyEQ = null; // EQ for broadcast story sound
let storyCompressor = null; // Story-specific compression
let roomAmbience = null; // Subtle room sound
let storyHighPass = null; // Remove low rumble
let storyGate = null; // Clean up silence

// FFT Analyzer
let fftAnalyzer = null;
let fftCanvas = null;
let fftCtx = null;
let animationId = null;

// Timer update interval
let timerUpdateInterval = null;

// Debug functionality
function logDebug(message) {
    if (!debugLog) return;
    
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = `[${timestamp}] ${message}\n`;
    
    debugLog.value += logEntry;
    // Auto-scroll to bottom
    debugLog.scrollTop = debugLog.scrollHeight;
}

// Cookie management
function setCookie(name, value, days) {
    const expires = new Date();
    expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
    const nameEQ = name + "=";
    const cookies = document.cookie.split(';');
    for (let cookie of cookies) {
        cookie = cookie.trim();
        if (cookie.indexOf(nameEQ) === 0) {
            return cookie.substring(nameEQ.length);
        }
    }
    return null;
}

// Initialize volume settings from cookies
function initVolumeSettings() {
    const savedMusicVolume = getCookie('musicVolume');
    const savedStoryVolume = getCookie('storyVolume');
    
    if (savedMusicVolume !== null) {
        musicVolumeSlider.value = savedMusicVolume;
        musicVolumeValue.textContent = `${savedMusicVolume}%`;
        logDebug(`Loaded music volume from cookie: ${savedMusicVolume}%`);
    }
    
    if (savedStoryVolume !== null) {
        storyVolumeSlider.value = savedStoryVolume;
        storyVolumeValue.textContent = `${savedStoryVolume}%`;
        logDebug(`Loaded story volume from cookie: ${savedStoryVolume}%`);
    }
}

// Initialize debug section visibility
function initDebugSection() {
    const debugVisible = getCookie('debugVisible') === 'true';
    
    if (debugVisible) {
        debugSection.classList.add('visible');
        toggleDebugBtn.textContent = 'Hide';
        if (showDebugBtn) showDebugBtn.style.display = 'none';
    } else {
        debugSection.classList.remove('visible');
        toggleDebugBtn.textContent = 'Show Debug';
        if (showDebugBtn) showDebugBtn.style.display = 'block';
    }
    
    logDebug('Debug log initialized');
}

// DOM elements
const playBtn = document.getElementById('playBtn');
const pauseBtn = document.getElementById('pauseBtn');
const stopBtn = document.getElementById('stopBtn');
const musicVolumeSlider = document.getElementById('musicVolume');
const musicVolumeValue = document.getElementById('musicVolumeValue');
const storyVolumeSlider = document.getElementById('storyVolume');
const storyVolumeValue = document.getElementById('storyVolumeValue');
const status = document.getElementById('status');
const episodeList = document.getElementById('episodeList');
const episodeProgressBar = document.getElementById('episodeProgressBar');
const currentTimeDisplay = document.getElementById('currentTime');
const totalTimeDisplay = document.getElementById('totalTime');
const episodeProgress = document.querySelector('.episode-progress');
const debugSection = document.getElementById('debugSection');
const debugLog = document.getElementById('debugLog');
const toggleDebugBtn = document.getElementById('toggleDebug');
const clearDebugBtn = document.getElementById('clearDebug');
const showDebugBtn = document.getElementById('showDebugBtn');
const playbackStatus = document.getElementById('playbackStatus');

// S3 bucket configuration
const s3BucketUrl = "https://frank-radio.s3.amazonaws.com";
const s3BucketUrlEast = "https://frank-radio.s3.us-east-1.amazonaws.com";
let selectedEpisode = ""; // Will be populated dynamically
let availableEpisodes = []; // List of all available episodes
let episodeStartTime = null; // Track when episode started
let episodeAutoAdvanceTimeout = null; // 30-minute timer

// Audio file paths - will be populated dynamically
let musicFiles = [];
let storyFiles = [];

// Function to parse S3 XML response and extract episode folders
function parseS3Episodes(xmlText) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    
    console.log('Parsing S3 XML response...');
    
    // First try CommonPrefixes (when using delimiter)
    const prefixes = xmlDoc.getElementsByTagName("CommonPrefixes");
    const episodes = [];
    
    if (prefixes.length > 0) {
        console.log(`Found ${prefixes.length} CommonPrefixes`);
        for (let i = 0; i < prefixes.length; i++) {
            const prefix = prefixes[i].getElementsByTagName("Prefix")[0].textContent;
            // Extract episode name (e.g., "ep01/" becomes "ep01")
            const episodeName = prefix.replace(/\/$/, '');
            console.log(`Checking prefix: ${prefix}, episode name: ${episodeName}`);
            // Include folders that match various episode patterns:
            // - ep01, ep02, etc.
            // - s01-ep02, s01-ep03, etc.
            // - s01-e06, s01-e06-The_Balance_of_Ghosts, etc.
            // - any folder starting with 'ep' or containing 's' followed by numbers and 'e'
            if (/^ep\d+/i.test(episodeName) || /s\d+-e\d+/i.test(episodeName) || /s\d+-ep\d+/i.test(episodeName)) {
                episodes.push(episodeName);
            }
        }
    } else {
        // If no CommonPrefixes, try parsing Keys for folders
        console.log('No CommonPrefixes found, checking Keys...');
        const keys = xmlDoc.getElementsByTagName("Key");
        const folderSet = new Set();
        
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i].textContent;
            // Extract folder name from key, supporting various formats:
            // - "ep01/music/file.wav" -> "ep01"
            // - "s01-e06-The_Balance_of_Ghosts/music/file.wav" -> "s01-e06-The_Balance_of_Ghosts"
            const match = key.match(/^([^\/]+)\//);
            if (match) {
                const folderName = match[1];
                // Check if it matches episode patterns
                if (/^ep\d+/i.test(folderName) || /s\d+-e\d+/i.test(folderName) || /s\d+-ep\d+/i.test(folderName)) {
                    folderSet.add(folderName);
                }
            }
        }
        
        episodes.push(...Array.from(folderSet));
    }
    
    console.log('Episodes found:', episodes);
    return episodes.sort();
}

// Function to parse S3 XML response and extract file URLs
function parseS3XML(xmlText, prefix) {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");
    const keys = xmlDoc.getElementsByTagName("Key");
    const files = [];
    
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i].textContent;
        // Filter for WAV files only
        if (key.startsWith(prefix) && key.endsWith('.wav')) {
            files.push(`${s3BucketUrlEast}/${key}`);
        }
    }
    
    return files.sort(); // Sort alphabetically
}

// Function to load episode metadata from YAML file
async function loadEpisodeMetadata(episodeName) {
    try {
        // Try to find YAML files in the episode folder
        const response = await fetch(`${s3BucketUrl}/?prefix=${episodeName}/&delimiter=/`);
        if (!response.ok) {
            throw new Error(`Failed to list files in ${episodeName}: ${response.status}`);
        }
        
        const xmlText = await response.text();
        
        // Parse XML to find YAML files
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const keys = xmlDoc.getElementsByTagName("Key");
        
        let yamlFile = null;
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i].textContent;
            if (key.endsWith('.yaml') || key.endsWith('.yml')) {
                yamlFile = key;
                break;
            }
        }
        
        if (!yamlFile) {
            console.log(`No YAML metadata file found for ${episodeName}`);
            return null;
        }
        
        // Fetch the YAML file
        const yamlResponse = await fetch(`${s3BucketUrl}/${yamlFile}`);
        if (!yamlResponse.ok) {
            throw new Error(`Failed to fetch YAML file: ${yamlResponse.status}`);
        }
        
        const yamlContent = await yamlResponse.text();
        const metadata = jsyaml.load(yamlContent);
        
        console.log(`Loaded metadata for ${episodeName}:`, metadata);
        return metadata;
    } catch (error) {
        console.error(`Error loading metadata for ${episodeName}:`, error);
        return null;
    }
}

// Function to display episode metadata
function displayEpisodeMetadata(metadata) {
    const metadataDiv = document.getElementById('episodeMetadata');
    const titleElement = document.getElementById('episodeTitle');
    const descriptionElement = document.getElementById('episodeDescription');
    const authorElement = document.getElementById('episodeAuthor');
    
    if (!metadata || !metadata.episode) {
        metadataDiv.style.display = 'none';
        return;
    }
    
    const episode = metadata.episode;
    
    // Set title
    titleElement.textContent = episode.title || 'Untitled Episode';
    
    // Set description
    descriptionElement.textContent = episode.description || '';
    
    // Set author
    if (episode.author) {
        authorElement.textContent = `By: ${episode.author}`;
    } else {
        authorElement.textContent = 'By: Jeff Crouse';
    }
    
    // Show the metadata section
    metadataDiv.style.display = 'block';
}

// Function to fetch all episodes and populate the list
async function fetchAllEpisodes() {
    try {
        status.textContent = 'Discovering episodes...';
        status.className = 'status loading';
        
        console.log('Fetching from:', `${s3BucketUrl}/?delimiter=/`);
        
        // List root bucket with delimiter to get "folders"
        const response = await fetch(`${s3BucketUrl}/?delimiter=/`);
        console.log('Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`Failed to list episodes: ${response.status}`);
        }
        
        const xml = await response.text();
        console.log('XML response length:', xml.length);
        console.log('XML preview:', xml.substring(0, 500));
        
        availableEpisodes = parseS3Episodes(xml);
        
        if (availableEpisodes.length === 0) {
            throw new Error('No episodes found in S3 bucket');
        }
        
        console.log(`Found ${availableEpisodes.length} episodes:`, availableEpisodes);
        logDebug(`Found ${availableEpisodes.length} episodes: ${availableEpisodes.join(', ')}`);
        
        // Populate the episode dropdown
        populateEpisodeList();
        
        status.textContent = 'Episodes loaded';
        status.className = 'status';
        
        return true;
    } catch (error) {
        console.error('Error fetching episodes:', error);
        status.textContent = `Error: ${error.message}`;
        status.className = 'status error';
        return false;
    }
}

// Function to populate the episode dropdown
function populateEpisodeList() {
    console.log('Populating episode list with:', availableEpisodes);
    
    if (!episodeList) {
        console.error('Episode list element not found!');
        return;
    }
    
    episodeList.innerHTML = '';
    
    // Add "Random" option
    const randomOption = document.createElement('option');
    randomOption.value = 'random';
    randomOption.textContent = 'Random Episode';
    episodeList.appendChild(randomOption);
    
    // Sort episodes by season then episode number
    const sortedEpisodes = [...availableEpisodes].sort((a, b) => {
        // Extract season and episode numbers
        const aMatch = a.match(/^s(\d+)-e(?:p)?(\d+)/i);
        const bMatch = b.match(/^s(\d+)-e(?:p)?(\d+)/i);
        
        // If both have season/episode format
        if (aMatch && bMatch) {
            const aSeason = parseInt(aMatch[1]);
            const bSeason = parseInt(bMatch[1]);
            const aEpisode = parseInt(aMatch[2]);
            const bEpisode = parseInt(bMatch[2]);
            
            // Compare seasons first
            if (aSeason !== bSeason) {
                return aSeason - bSeason;
            }
            // Then compare episodes
            return aEpisode - bEpisode;
        }
        
        // Handle ep## format
        const aEpMatch = a.match(/^ep(\d+)/i);
        const bEpMatch = b.match(/^ep(\d+)/i);
        
        if (aEpMatch && bEpMatch) {
            return parseInt(aEpMatch[1]) - parseInt(bEpMatch[1]);
        }
        
        // If mixed formats, put season/episode format first
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        
        // Otherwise, sort alphabetically
        return a.localeCompare(b);
    });
    
    // Add all episodes
    sortedEpisodes.forEach(episode => {
        const option = document.createElement('option');
        option.value = episode;
        
        // Format the display name
        let displayName = episode;
        
        // Handle different formats:
        // s01-ep02 -> S01 E02
        // s01-e06-The_Balance_of_Ghosts -> S01 E06: The Balance of Ghosts
        const seasonEpisodeMatch = episode.match(/^s(\d+)-e(?:p)?(\d+)(?:-(.+))?$/i);
        if (seasonEpisodeMatch) {
            const [, season, episodeNum, title] = seasonEpisodeMatch;
            displayName = `S${season.padStart(2, '0')} E${episodeNum.padStart(2, '0')}`;
            if (title) {
                // Replace underscores with spaces in title
                const formattedTitle = title.replace(/_/g, ' ');
                displayName += `: ${formattedTitle}`;
            } else {
                // No title provided, show "Untitled"
                displayName += `: Untitled`;
            }
        } else if (/^ep\d+/i.test(episode)) {
            // ep07 -> Episode 07
            const epMatch = episode.match(/^ep(\d+)$/i);
            if (epMatch) {
                displayName = `Episode ${epMatch[1].padStart(2, '0')}`;
            }
        }
        
        option.textContent = displayName;
        episodeList.appendChild(option);
    });
    
    console.log('Episode list populated, total options:', episodeList.options.length);
}

// Function to select a specific episode or random one
async function selectEpisode(episodeName) {
    if (episodeName === 'random' || !episodeName) {
        // Select a random episode
        const randomIndex = Math.floor(Math.random() * availableEpisodes.length);
        selectedEpisode = availableEpisodes[randomIndex];
    } else {
        selectedEpisode = episodeName;
    }
    
    console.log(`Selected episode: ${selectedEpisode}`);
    logDebug(`Selected episode: ${selectedEpisode}`);
    
    // Update dropdown to show selected episode
    episodeList.value = selectedEpisode;
    
    // Reset episode timer
    startEpisodeTimer();
    
    // Load and display episode metadata
    const metadata = await loadEpisodeMetadata(selectedEpisode);
    displayEpisodeMetadata(metadata);
    
    status.textContent = `Selected episode: ${selectedEpisode}`;
    status.className = 'status';
    
    return true;
}

// Function to start the episode timer
function startEpisodeTimer() {
    episodeStartTime = Date.now();
    
    // Clear any existing timer
    if (episodeAutoAdvanceTimeout) {
        clearTimeout(episodeAutoAdvanceTimeout);
    }
    
    // Set 30-minute auto-advance timer
    episodeAutoAdvanceTimeout = setTimeout(() => {
        if (isPlaying) {
            advanceToNextEpisode();
        }
    }, EPISODE_DURATION_MS);
    
    // Update timer display
    updateTimerDisplay();
}

// Function to update the timer display
function updateTimerDisplay() {
    const totalSeconds = EPISODE_DURATION_MS / 1000; // Convert to seconds
    
    if (!episodeStartTime || !isPlaying) {
        // Reset display when not playing
        if (episodeProgressBar) episodeProgressBar.style.width = '0%';
        if (currentTimeDisplay) currentTimeDisplay.textContent = '0:00';
        return;
    }
    
    const elapsed = Math.floor((Date.now() - episodeStartTime) / 1000);
    const elapsedMinutes = Math.floor(elapsed / 60);
    const elapsedSeconds = elapsed % 60;
    
    // Update progress bar
    const progressPercent = Math.min((elapsed / totalSeconds) * 100, 100);
    if (episodeProgressBar) {
        episodeProgressBar.style.width = progressPercent + '%';
    }
    
    // Update current time display
    if (currentTimeDisplay) {
        currentTimeDisplay.textContent = `${elapsedMinutes}:${elapsedSeconds.toString().padStart(2, '0')}`;
    }
    
    // Check if time is up
    if (elapsed >= totalSeconds) {
        if (episodeProgressBar) episodeProgressBar.style.width = '100%';
        if (currentTimeDisplay) currentTimeDisplay.textContent = '30:00';
    }
}

// Function to advance to the next episode
async function advanceToNextEpisode() {
    const currentIndex = availableEpisodes.indexOf(selectedEpisode);
    const nextIndex = (currentIndex + 1) % availableEpisodes.length;
    const nextEpisode = availableEpisodes[nextIndex];
    
    console.log(`Advancing from ${selectedEpisode} to ${nextEpisode}`);
    
    // Stop current playback
    stopLoop();
    
    // Clear current files
    musicFiles = [];
    storyFiles = [];
    musicBuffers = [];
    storyBuffers = [];
    playedStories = []; // Reset played stories for new episode
    
    // Select next episode
    await selectEpisode(nextEpisode);
    
    // Load new files
    const filesLoaded = await loadS3FileLists();
    if (filesLoaded) {
        // Auto-play the new episode
        playLoop();
    }
}

// Function to load file lists from S3
async function loadS3FileLists() {
    try {
        // Ensure an episode is selected
        if (!selectedEpisode) {
            throw new Error('No episode selected');
        }
        
        status.textContent = `Loading files for ${selectedEpisode}...`;
        status.className = 'status loading';
        
        // Fetch music files
        const musicResponse = await fetch(`${s3BucketUrl}/?prefix=${selectedEpisode}/music/&delimiter=/`);
        if (!musicResponse.ok) {
            throw new Error(`Failed to fetch music files: ${musicResponse.status}`);
        }
        const musicXML = await musicResponse.text();
        musicFiles = parseS3XML(musicXML, `${selectedEpisode}/music/`);
        
        // Fetch story files
        const storyResponse = await fetch(`${s3BucketUrl}/?prefix=${selectedEpisode}/story/&delimiter=/`);
        if (!storyResponse.ok) {
            throw new Error(`Failed to fetch story files: ${storyResponse.status}`);
        }
        const storyXML = await storyResponse.text();
        storyFiles = parseS3XML(storyXML, `${selectedEpisode}/story/`);
        
        console.log('Loaded music files:', musicFiles);
        console.log('Loaded story files:', storyFiles);
        logDebug(`Loaded ${musicFiles.length} music files from ${selectedEpisode}/music/`);
        logDebug(`Loaded ${storyFiles.length} story files from ${selectedEpisode}/story/`);
        
        if (musicFiles.length === 0 || storyFiles.length === 0) {
            throw new Error('No audio files found in S3 bucket');
        }
        
        status.textContent = `Loaded ${musicFiles.length} music and ${storyFiles.length} story files from ${selectedEpisode}`;
        status.className = 'status';
        
        return true;
    } catch (error) {
        console.error('Error loading S3 file lists:', error);
        status.textContent = `Error loading files: ${error.message}`;
        status.className = 'status error';
        return false;
    }
}


// Music loop management
let currentMusicIndex = -1;
let musicFadeTimeout = null;
let musicPauseTimeout = null;
let currentLoopCount = 0;
let targetLoopCount = 0;

// Story management
let currentStoryIndex = 0;
let storyWasPlaying = false;
let storyRemainingTime = 0;

// Initialize audio with Tone.js
async function initAudio() {
    console.log('initAudio called');
    
    // Start Tone.js if needed
    if (Tone.context.state !== 'running') {
        console.log('Starting Tone.js context');
        await Tone.start();
        // Ensure Transport is started for better timing
        Tone.Transport.start();
    }
    
    if (!masterVolume) {
        // Create volume nodes
        musicVolume = new Tone.Volume(-10); // Start at -10dB
        storyVolume = new Tone.Volume(-10); // Reduced from -6dB to prevent clipping
        
        // Create master compressor (gentler settings)
        masterCompressor = new Tone.Compressor({
            threshold: -16,    // Lower threshold for earlier, gentler compression
            ratio: 6,          // Reduced from 10
            attack: 0.01,      // Slower attack
            release: 0.3,      // Slightly slower release
            knee: 4            // Softer knee
        });
        
        // Create limiter
        masterLimiter = new Tone.Limiter(-3); // Limit at -3dB
        
        // Create master volume for overall level control
        masterVolume = new Tone.Volume(-6); // Increased reduction to -6dB for more headroom
        
        // Route: sources → compressor → limiter → volume → destination
        masterCompressor.connect(masterLimiter);
        masterLimiter.connect(masterVolume);
        masterVolume.toDestination();
        
        // Connect music volume to compressor
        musicVolume.connect(masterCompressor);
        
        // NPR Broadcast Effects Chain
        
        // High-pass filter to remove rumble and plosives
        storyHighPass = new Tone.Filter({
            frequency: 80, // Cut below 80Hz
            type: "highpass",
            rolloff: -12
        });
        
        // Gate to clean up audio noise (adjusted to prevent pops)
        storyGate = new Tone.Gate({
            threshold: -50,    // Lower threshold (was -40dB)
            attack: 0.01,      // Slower attack to prevent pops (was 0.005)
            release: 0.1,      // Slower release to prevent cut-offs (was 0.05)
            smoothing: 0.1     // Add smoothing to prevent clicks
        });
        
        // Story-specific compressor for consistent levels (gentler settings)
        storyCompressor = new Tone.Compressor({
            threshold: -20,    // Lower threshold
            ratio: 3,          // Gentler ratio (was 4)
            attack: 0.01,      // Slower attack
            release: 0.15,     // Slower release
            knee: 4            // Softer knee
        });
        
        // EQ for NPR broadcast sound
        storyEQ = new Tone.EQ3({
            low: -2,      // Slight cut in lows
            mid: 3,       // Boost mids for clarity
            high: 2,      // Slight high boost for presence
            lowFrequency: 200,
            highFrequency: 3500
        });
        
        // Subtle room ambience (much less than before)
        roomAmbience = new Tone.Reverb({
            decay: 0.3,      // Very short decay
            preDelay: 0.005,
            wet: 0.05        // Only 5% wet signal - very subtle
        });
        roomAmbience.generate();
        
        // Chain the broadcast effects (bypassing gate to fix popping)
        storyHighPass.connect(storyCompressor);
        // storyGate.connect(storyCompressor); // Gate disabled
        storyCompressor.connect(storyEQ);
        storyEQ.connect(roomAmbience);
        roomAmbience.connect(masterCompressor);
        
        // Create telephone effect using Tone.js (reduced by 25%)
        // Use a Filter for bandpass effect (telephone frequency range)
        telephoneFilter = new Tone.Filter({
            frequency: 1700, // Center frequency for telephone band
            type: "bandpass",
            Q: 1.5, // Reduced from 2 to 1.5 (25% less extreme)
            rolloff: -12 // Reduced from -24 to -12 (gentler rolloff)
        }).connect(masterCompressor); // Connect directly to compressor, no reverb
        
        // Add distortion for telephone effect
        telephoneDistortion = new Tone.Distortion({
            distortion: 0.6, // Reduced from 0.6 to 0.45 (25% less)
            oversample: "2x"
        }).connect(telephoneFilter);
        
        
        // Create FFT Analyzer
        fftAnalyzer = new Tone.FFT(256); // 256 bins for good resolution
        masterVolume.connect(fftAnalyzer); // Analyze the final output
        
        // Set up canvas for visualization
        fftCanvas = document.getElementById('fftCanvas');
        fftCtx = fftCanvas.getContext('2d');
        
        // Set initial volumes based on sliders (which now load from cookies)
        const bgVolumeDb = Tone.gainToDb((musicVolumeSlider.value / 100) * 0.7);
        const storyVolumeDb = Tone.gainToDb((storyVolumeSlider.value / 100) * 0.8);
        musicVolume.volume.value = bgVolumeDb;
        storyVolume.volume.value = storyVolumeDb;
    }
    
    if (musicBuffers.length === 0 || storyBuffers.length === 0) {
        // First, fetch all episodes if not already done
        if (availableEpisodes.length === 0) {
            const episodesFetched = await fetchAllEpisodes();
            if (!episodesFetched) {
                playBtn.disabled = true;
                throw new Error('Failed to fetch episodes');
            }
        }
        
        // Then select an episode if not already selected
        if (!selectedEpisode) {
            await selectEpisode('random');
        }
        
        // Then, load file lists from S3 if not already loaded
        if (musicFiles.length === 0 || storyFiles.length === 0) {
            const filesLoaded = await loadS3FileLists();
            if (!filesLoaded) {
                playBtn.disabled = true;
                throw new Error('Failed to load file lists from S3');
            }
        }
        
        status.textContent = 'Loading audio files...';
        status.className = 'status loading';
        
        try {
            // For Tone.js, we'll just store the file URLs
            // Tone.Player will load them when needed
            musicBuffers = musicFiles;
            storyBuffers = storyFiles;
            
            status.textContent = 'Audio loaded successfully';
            status.className = 'status';
            
            setTimeout(() => {
                status.textContent = 'Ready to play';
            }, 2000);
            
        } catch (error) {
            console.error('Error loading audio:', error);
            status.textContent = `Error: ${error.message}`;
            status.className = 'status error';
            playBtn.disabled = true;
            throw error; // Re-throw to be caught by playLoop
        }
    }
}


function getRandomPause() {
    const range = STORY_PAUSE_MAX_MS - STORY_PAUSE_MIN_MS;
    return Math.floor(Math.random() * range) + STORY_PAUSE_MIN_MS;
}

function getRandomMusicIndex(excludeIndex) {
    if (musicBuffers.length <= 1) {
        return 0; // Only one buffer available
    }
    
    let newIndex;
    do {
        newIndex = Math.floor(Math.random() * musicBuffers.length);
    } while (newIndex === excludeIndex);
    
    console.log(`Selecting new music: excluding ${excludeIndex}, selected ${newIndex}`);
    return newIndex;
}

function fadeOutMusic(duration = MUSIC_FADE_IN_DURATION_S) {
    if (musicVolume) {
        musicVolume.volume.rampTo(-Infinity, duration);
    }
}

function fadeInMusic(duration = MUSIC_FADE_IN_DURATION_S) {
    if (musicVolume) {
        const targetDb = Tone.gainToDb((musicVolumeSlider.value / 100) * 0.7);
        musicVolume.volume.rampTo(targetDb, duration);
    }
}

function duckMusic(duration = 0.5) {
    if (musicVolume) {
        // Cancel any ongoing fade operations
        musicVolume.volume.cancelScheduledValues(Tone.now());
        
        // Duck to 50% of current volume
        const currentSliderValue = musicVolumeSlider.value / 100;
        const duckedDb = Tone.gainToDb((currentSliderValue * 0.7) * 0.5); // 50% of current volume
        musicVolume.volume.rampTo(duckedDb, duration);
    }
}

function restoreMusic(duration = 0.5) {
    if (musicVolume) {
        // Cancel any ongoing fade operations
        musicVolume.volume.cancelScheduledValues(Tone.now());
        
        // Restore to full slider volume
        const targetDb = Tone.gainToDb((musicVolumeSlider.value / 100) * 0.7);
        musicVolume.volume.rampTo(targetDb, duration);
    }
}

function playMusicLoop(index) {
    if (!isPlaying || !musicBuffers.length) return;
    
    // Stop any existing music player
    if (musicPlayer) {
        musicPlayer.stop();
        musicPlayer.dispose();
    }
    
    currentMusicIndex = index;
    
    // Reset loop counter and set new target if this is a new music loop
    if (currentLoopCount === 0 || currentLoopCount >= targetLoopCount) {
        currentLoopCount = 0;
        targetLoopCount = Math.floor(Math.random() * (MUSIC_LOOP_MAX_PLAYS - MUSIC_LOOP_MIN_PLAYS + 1)) + MUSIC_LOOP_MIN_PLAYS;
        console.log(`New music loop ${index + 1} will play ${targetLoopCount} times before changing`);
        logDebug(`Music: Starting loop ${index + 1} (will play ${targetLoopCount} times)`);
    }
    
    // Reset volume to -Infinity before starting
    musicVolume.volume.value = -Infinity;
    
    // Create new player with pre-configured loop settings
    musicPlayer = new Tone.Player({
        url: musicBuffers[index],
        loop: true,
        fadeIn: 0.005, // Very small fade to prevent clicks
        fadeOut: 0.005,
        onload: () => {
            console.log('Music buffer loaded, starting playback');
            // Use Tone.now() for precise timing
            musicPlayer.start(Tone.now());
            
            // Check if story is currently playing and apply ducking if needed
            const isStoryPlaying = storyPlayer && storyPlayer.state === 'started';
            if (isStoryPlaying) {
                // Apply ducking immediately without fade
                const currentSliderValue = musicVolumeSlider.value / 100;
                const duckedDb = Tone.gainToDb((currentSliderValue * 0.7) * 0.5); // 50% of current volume
                musicVolume.volume.value = duckedDb;
                logDebug('Music: Starting ducked because story is playing');
            } else {
                // Fade in normally
                fadeInMusic();
            }
            
            // Get loop duration for scheduling
            const loopDuration = musicPlayer.buffer.duration * 1000; // Convert to milliseconds
            
            // Schedule loop completion check
            scheduleLoopTransition(loopDuration);
        }
    }).connect(musicVolume);
}

function scheduleLoopTransition(loopDuration) {
    if (musicFadeTimeout) {
        clearTimeout(musicFadeTimeout);
    }
    
    musicFadeTimeout = setTimeout(() => {
        if (isPlaying && !isPaused) {
            currentLoopCount++;
            console.log(`Loop ${currentMusicIndex + 1} completed ${currentLoopCount}/${targetLoopCount} times`);
            logDebug(`Music: Loop ${currentMusicIndex + 1} completed ${currentLoopCount}/${targetLoopCount} times`);
            
            if (currentLoopCount >= targetLoopCount) {
                // Time to transition to a new loop
                transitionToNewLoop();
            } else {
                // Continue with current loop, schedule next check
                scheduleLoopTransition(loopDuration);
            }
        }
    }, loopDuration);
}

function transitionToNewLoop() {
    if (!isPlaying) return;
    
    // Clear any existing transition timeout
    if (musicFadeTimeout) {
        clearTimeout(musicFadeTimeout);
        musicFadeTimeout = null;
    }
    
    // Reset loop counter for the new music
    currentLoopCount = 0;
    
    if (playbackStatus) playbackStatus.textContent = 'Transitioning to new music loop...';
    
    // Fade out current loop
    fadeOutMusic();
    
    // Stop current player after fade
    setTimeout(() => {
        if (musicPlayer) {
            musicPlayer.stop();
            musicPlayer.dispose();
            musicPlayer = null;
        }
        
        // Pause duration
        const pauseDuration = Math.floor(Math.random() * (MUSIC_TRANSITION_PAUSE_MAX_MS - MUSIC_TRANSITION_PAUSE_MIN_MS)) + MUSIC_TRANSITION_PAUSE_MIN_MS;
        if (playbackStatus) playbackStatus.textContent = `Music paused for ${(pauseDuration / 1000).toFixed(1)} seconds...`;
        
        // Clear any existing pause timeout
        if (musicPauseTimeout) {
            clearTimeout(musicPauseTimeout);
        }
        
        musicPauseTimeout = setTimeout(() => {
            if (isPlaying) {
                // Select and play new loop (exclude the index that was playing before transition)
                const previousIndex = currentMusicIndex;
                const newIndex = getRandomMusicIndex(previousIndex);
                
                // Check if story is playing to update status appropriately
                const isStoryPlaying = storyPlayer && storyPlayer.state === 'started';
                if (isStoryPlaying) {
                    if (playbackStatus) playbackStatus.textContent = `Playing music loop ${newIndex + 1} (ducked)...`;
                } else {
                    if (playbackStatus) playbackStatus.textContent = `Playing music loop ${newIndex + 1}...`;
                }
                
                playMusicLoop(newIndex);
            }
        }, pauseDuration);
    }, MUSIC_FADE_OUT_DURATION_MS); // Wait for fade out
}

function playStory() {
    if (!isPlaying || isPaused || !storyBuffers.length) return;
    
    // Stop and dispose previous story player if exists
    if (storyPlayer) {
        storyPlayer.stop();
        storyPlayer.dispose();
    }
    
    // Select a story that hasn't been played yet
    let availableStories = [];
    for (let i = 0; i < storyBuffers.length; i++) {
        if (!playedStories.includes(i)) {
            availableStories.push(i);
        }
    }
    
    // If all stories have been played, reset and allow all stories again
    if (availableStories.length === 0) {
        logDebug('Story: All stories have been played, resetting played list');
        playedStories = [];
        availableStories = Array.from({length: storyBuffers.length}, (_, i) => i);
    }
    
    // Select a random story from available ones
    const randomIndex = Math.floor(Math.random() * availableStories.length);
    currentStoryIndex = availableStories[randomIndex];
    
    // Track this story as played
    playedStories.push(currentStoryIndex);
    
    logDebug(`Story: Selected clip ${currentStoryIndex + 1} (${storyBuffers[currentStoryIndex]}) - ${playedStories.length}/${storyBuffers.length} played`);
    
    // 75% chance to apply telephone effect
    const useTelephoneEffect = Math.random() < 0.75;
    
    // Disconnect story volume from any previous connection
    storyVolume.disconnect();
    
    // Connect through telephone effect or NPR broadcast chain
    if (useTelephoneEffect) {
        // Route: story → volume → distortion → filter → compressor
        storyVolume.connect(telephoneDistortion);
    } else {
        // NPR broadcast route: story → volume → highpass → compressor → EQ → ambience → master
        storyVolume.connect(storyHighPass);
    }
    
    // Create new player for current story with fade settings
    storyPlayer = new Tone.Player({
        url: storyBuffers[currentStoryIndex],
        fadeIn: 0.05,  // 50ms fade in (increased from 20ms)
        fadeOut: 0.05, // 50ms fade out (increased from 20ms)
        onload: () => {
            console.log('Story buffer loaded, starting playback');
            
            // Apply extra gain reduction for story_03.wav specifically
            if (currentStoryIndex === 2) { // story_03 is index 2
                storyVolume.volume.value = -15; // Extra 5dB reduction for this file
            } else {
                storyVolume.volume.value = -10; // Normal volume for other files
            }
            
            // Duck the music volume when story starts
            duckMusic();
            
            // Start playing when buffer is loaded
            storyPlayer.start();
            
            const effectStatus = useTelephoneEffect ? ' (telephone effect)' : '';
            if (playbackStatus) playbackStatus.textContent = `Playing story ${currentStoryIndex + 1}${effectStatus}...`;
            logDebug(`Story: Playing clip ${currentStoryIndex + 1}${effectStatus}, duration: ${(storyPlayer.buffer.duration).toFixed(2)}s`);
            
            // Get actual buffer duration
            const storyDuration = storyPlayer.buffer.duration * 1000; // Convert to milliseconds
            console.log(`Story ${currentStoryIndex + 1} duration: ${storyDuration}ms`);
            
            // Clear any existing story timeout
            if (storyTimeout) {
                clearTimeout(storyTimeout);
            }
            
            // Schedule what happens after story naturally completes
            storyTimeout = setTimeout(() => {
                if (isPlaying && !isPaused) {
                    console.log('Story completed naturally');
                    logDebug('Story: Clip completed, restoring music volume');
                    
                    // Restore music volume when story ends
                    restoreMusic();
                    
                    // Disconnect story volume node
                    storyVolume.disconnect();
                    
                    // Clean up the player
                    if (storyPlayer) {
                        storyPlayer.dispose();
                        storyPlayer = null;
                    }
                    
                    // NOW determine the pause duration AFTER story has fully completed
                    const pauseDuration = getRandomPause();
                    const pauseSeconds = (pauseDuration / 1000).toFixed(1);
                    if (playbackStatus) playbackStatus.textContent = `Next story in ${pauseSeconds} seconds...`;
                    logDebug(`Story: Waiting ${pauseSeconds} seconds before next clip`);
                    
                    // Schedule the next story
                    storyTimeout = setTimeout(() => {
                        if (isPlaying && !isPaused) {
                            playStory();
                        }
                    }, pauseDuration);
                }
            }, storyDuration + 100); // Add 100ms buffer to ensure story has fully completed
        }
    }).connect(storyVolume);
}

async function playLoop() {
    console.log('playLoop called');
    try {
        await initAudio();
        console.log('Audio initialized');
        
        if (!musicBuffers.length || !storyBuffers.length) {
            console.error('No buffers loaded:', { 
                musicBuffers: musicBuffers.length, 
                storyBuffers: storyBuffers.length 
            });
            return;
        }
    
    isPlaying = true;
    
    // Start playing a random music loop
    const initialIndex = Math.floor(Math.random() * musicBuffers.length);
    if (playbackStatus) playbackStatus.textContent = `Playing music loop ${initialIndex + 1}...`;
    playMusicLoop(initialIndex);
    
    const initialPause = getRandomPause() / 2; // Half the normal pause for the first story
    const pauseSeconds = (initialPause / 1000).toFixed(1);
    if (playbackStatus) playbackStatus.textContent = `Music playing. First story in ${pauseSeconds} seconds...`;
    logDebug(`Story: Waiting ${pauseSeconds} seconds before first clip`);
    
    storyTimeout = setTimeout(() => {
        playStory();
    }, initialPause);
    
    playBtn.disabled = true;
    pauseBtn.disabled = false;
    stopBtn.disabled = false;
    
    // Start FFT visualization
    startVisualization();
    
    // Show progress bar
    if (episodeProgress) {
        episodeProgress.classList.remove('hidden');
    }
    
    // Start timer update interval
    if (timerUpdateInterval) {
        clearInterval(timerUpdateInterval);
    }
    timerUpdateInterval = setInterval(updateTimerDisplay, 1000);
    } catch (error) {
        console.error('Error in playLoop:', error);
        status.textContent = 'Error starting playback';
        playBtn.disabled = false;
    }
}

function stopLoop() {
    if (musicPlayer) {
        musicPlayer.stop();
        musicPlayer.dispose();
        musicPlayer = null;
    }
    
    if (storyPlayer) {
        storyPlayer.stop();
        storyPlayer.dispose();
        storyPlayer = null;
        // Restore music volume if story was playing
        restoreMusic();
    }
    
    if (storyTimeout) {
        clearTimeout(storyTimeout);
        storyTimeout = null;
    }
    
    if (musicFadeTimeout) {
        clearTimeout(musicFadeTimeout);
        musicFadeTimeout = null;
    }
    
    if (musicPauseTimeout) {
        clearTimeout(musicPauseTimeout);
        musicPauseTimeout = null;
    }
    
    // Clear episode timer
    if (episodeAutoAdvanceTimeout) {
        clearTimeout(episodeAutoAdvanceTimeout);
        episodeAutoAdvanceTimeout = null;
    }
    if (timerUpdateInterval) {
        clearInterval(timerUpdateInterval);
        timerUpdateInterval = null;
    }
    episodeStartTime = null;
    updateTimerDisplay();
    
    // Hide progress bar
    if (episodeProgress) {
        episodeProgress.classList.add('hidden');
    }
    
    // Reset music volume
    if (musicVolume) {
        const targetDb = Tone.gainToDb((musicVolumeSlider.value / 100) * 0.7);
        musicVolume.volume.value = targetDb;
    }
    
    isPlaying = false;
    isPaused = false;
    currentMusicIndex = -1;
    currentStoryIndex = 0; // Reset to first story
    playedStories = []; // Reset played stories tracking
    currentLoopCount = 0; // Reset loop counter
    targetLoopCount = 0;
    storyWasPlaying = false;
    storyRemainingTime = 0;
    playBtn.disabled = false;
    pauseBtn.disabled = true;
    pauseBtn.textContent = 'Pause';
    stopBtn.disabled = true;
    status.textContent = 'Stopped';
    status.className = 'status';
    if (playbackStatus) playbackStatus.textContent = '';
    
    // Hide episode metadata
    const metadataDiv = document.getElementById('episodeMetadata');
    if (metadataDiv) {
        metadataDiv.style.display = 'none';
    }
    
    // Stop FFT visualization
    stopVisualization();
}

function pauseLoop() {
    if (!isPlaying) return;
    
    if (isPaused) {
        // Resume
        isPaused = false;
        pauseBtn.textContent = 'Pause';
        status.textContent = 'Resuming...';
        
        // Resume visualization
        startVisualization();
        
        // Restart music if it was playing
        if (currentMusicIndex >= 0) {
            fadeInMusic();
        }
        
        // Resume story based on previous state
        if (storyWasPlaying && storyRemainingTime > 0) {
            // Restore story volume
            if (storyVolume) {
                const targetDb = Tone.gainToDb((storyVolumeSlider.value / 100) * 0.8);
                storyVolume.volume.value = targetDb;
            }
            // Story was actively playing, restart it
            playStory();
        } else if (storyRemainingTime > 0) {
            // Story was waiting to play, restart the timeout
            storyTimeout = setTimeout(() => {
                playStory();
            }, storyRemainingTime);
        }
        
    } else {
        // Pause
        isPaused = true;
        pauseBtn.textContent = 'Resume';
        status.textContent = 'Paused';
        if (playbackStatus) playbackStatus.textContent = 'Paused';
        
        // Pause visualization
        stopVisualization();
        
        // Check if story is currently playing
        storyWasPlaying = storyPlayer && storyPlayer.state === 'started';
        
        // Stop story if playing
        if (storyWasPlaying && storyPlayer) {
            // Store remaining time based on buffer duration
            const elapsed = Tone.now() - storyPlayer._startTime;
            const totalDuration = storyPlayer.buffer.duration;
            storyRemainingTime = Math.max(0, (totalDuration - elapsed) * 1000);
            
            // Fade out story before stopping
            if (storyVolume) {
                storyVolume.volume.rampTo(-Infinity, 0.3);
                setTimeout(() => {
                    if (storyPlayer) {
                        storyPlayer.stop();
                        storyPlayer.dispose();
                        storyPlayer = null;
                    }
                }, 300);
            }
        } else {
            // Story was not playing, store timeout remaining time
            storyRemainingTime = getRandomPause(); // Default pause time
        }
        
        // Fade out music
        if (musicVolume) {
            musicVolume.volume.rampTo(-Infinity, 0.5);
        }
        
        // Clear story timeout
        if (storyTimeout) {
            clearTimeout(storyTimeout);
            storyTimeout = null;
        }
    }
}

// Event listeners
playBtn.addEventListener('click', playLoop);
pauseBtn.addEventListener('click', pauseLoop);
stopBtn.addEventListener('click', stopLoop);

// Episode selector event listener
episodeList.addEventListener('change', async (e) => {
    const selectedValue = e.target.value;
    if (selectedValue && selectedValue !== selectedEpisode) {
        // Stop current playback
        const wasPlaying = isPlaying;
        if (isPlaying) {
            stopLoop();
        }
        
        // Clear current files
        musicFiles = [];
        storyFiles = [];
        musicBuffers = [];
        storyBuffers = [];
        playedStories = []; // Reset played stories for new episode
        
        // Select new episode
        await selectEpisode(selectedValue);
        
        // Load new files
        const filesLoaded = await loadS3FileLists();
        if (filesLoaded && wasPlaying) {
            // Auto-play if it was playing before
            playLoop();
        }
    }
});

musicVolumeSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    musicVolumeValue.textContent = `${value}%`;
    
    // Save to cookie
    setCookie('musicVolume', value, 365);
    
    if (musicVolume) {
        // Check if story is currently playing
        const isDucked = storyPlayer && storyPlayer.state === 'started';
        const volumeMultiplier = isDucked ? 0.5 : 1.0; // 50% if ducked, 100% if not
        const targetDb = Tone.gainToDb((value / 100) * 0.7 * volumeMultiplier);
        musicVolume.volume.rampTo(targetDb, 0.1);
    }
});

storyVolumeSlider.addEventListener('input', (e) => {
    const value = e.target.value;
    storyVolumeValue.textContent = `${value}%`;
    
    // Save to cookie
    setCookie('storyVolume', value, 365);
    
    if (storyVolume) {
        const targetDb = Tone.gainToDb((value / 100) * 0.8);
        storyVolume.volume.rampTo(targetDb, 0.1);
    }
});

// Keyboard controls
document.addEventListener('keydown', (e) => {
    if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
            stopLoop();
        } else {
            playLoop();
        }
    }
});

// Debug button event listeners
if (toggleDebugBtn) {
    toggleDebugBtn.addEventListener('click', () => {
        const isVisible = debugSection.classList.contains('visible');
        
        if (isVisible) {
            debugSection.classList.remove('visible');
            toggleDebugBtn.textContent = 'Show Debug';
            setCookie('debugVisible', 'false', 365);
            if (showDebugBtn) showDebugBtn.style.display = 'block';
            logDebug('Debug section hidden');
        } else {
            debugSection.classList.add('visible');
            toggleDebugBtn.textContent = 'Hide';
            setCookie('debugVisible', 'true', 365);
            if (showDebugBtn) showDebugBtn.style.display = 'none';
            logDebug('Debug section shown');
        }
    });
}

if (showDebugBtn) {
    showDebugBtn.addEventListener('click', (e) => {
        e.preventDefault();
        debugSection.classList.add('visible');
        toggleDebugBtn.textContent = 'Hide';
        setCookie('debugVisible', 'true', 365);
        showDebugBtn.style.display = 'none';
        logDebug('Debug section shown via link');
    });
}

if (clearDebugBtn) {
    clearDebugBtn.addEventListener('click', () => {
        if (debugLog) {
            debugLog.value = '';
            logDebug('Debug log cleared');
        }
    });
}

// Initialize on page load
window.addEventListener('load', async () => {
    console.log('Page loaded, initializing...');
    
    // Initialize debug section
    initDebugSection();
    
    // Initialize volume settings from cookies
    initVolumeSettings();
    
    // Fetch episodes
    try {
        logDebug('Fetching episodes from S3...');
        await fetchAllEpisodes();
    } catch (error) {
        console.error('Failed to fetch episodes on page load:', error);
        logDebug(`Error fetching episodes: ${error.message}`);
        // Show error in dropdown
        episodeList.innerHTML = '<option value="">Error loading episodes</option>';
    }
});

// FFT Visualization
function drawFFT() {
    if (!isPlaying || isPaused || !fftAnalyzer || !fftCtx) {
        return;
    }
    
    // Schedule next frame
    animationId = requestAnimationFrame(drawFFT);
    
    // Get frequency data
    const values = fftAnalyzer.getValue();
    
    // Clear canvas
    fftCtx.fillStyle = '#2a2a2a';
    fftCtx.fillRect(0, 0, fftCanvas.width, fftCanvas.height);
    
    // Draw frequency bars
    const barWidth = fftCanvas.width / values.length;
    const gradient = fftCtx.createLinearGradient(0, fftCanvas.height, 0, 0);
    gradient.addColorStop(0, '#4ecdc4');
    gradient.addColorStop(0.5, '#44a3aa');
    gradient.addColorStop(1, '#ff6b6b');
    
    for (let i = 0; i < values.length; i++) {
        // Convert dB to positive scale (values are typically -Infinity to 0)
        const dbValue = values[i];
        const normalizedValue = Math.max(0, (dbValue + 100) / 100); // Normalize from -100dB to 0dB
        const barHeight = normalizedValue * fftCanvas.height * 0.8;
        
        fftCtx.fillStyle = gradient;
        fftCtx.fillRect(
            i * barWidth, 
            fftCanvas.height - barHeight, 
            barWidth - 1, 
            barHeight
        );
    }
    
    // Draw center line
    fftCtx.strokeStyle = '#666';
    fftCtx.lineWidth = 1;
    fftCtx.beginPath();
    fftCtx.moveTo(0, fftCanvas.height / 2);
    fftCtx.lineTo(fftCanvas.width, fftCanvas.height / 2);
    fftCtx.stroke();
}

function startVisualization() {
    if (!animationId) {
        drawFFT();
    }
}

function stopVisualization() {
    if (animationId) {
        cancelAnimationFrame(animationId);
        animationId = null;
        
        // Clear canvas
        if (fftCtx) {
            fftCtx.fillStyle = '#2a2a2a';
            fftCtx.fillRect(0, 0, fftCanvas.width, fftCanvas.height);
        }
    }
}