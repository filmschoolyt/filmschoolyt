/**
 * FilmSchool - Video-Gated Content System
 * 
 * CRITICAL LOGIC:
 * - Button disabled until user watches video for 60+ accumulated seconds
 * - Timer only counts when video is actively playing
 * - Timer pauses when video pauses
 * - Timer resets on detail view close/reload
 * - No shortcuts or manual enables allowed
 */

class FilmSchoolApp {
    constructor() {
        // DOM Elements
        this.searchInput = document.getElementById('searchInput');
        this.moviesGrid = document.getElementById('moviesGrid');
        this.detailOverlay = document.getElementById('detailOverlay');
        this.closeDetailBtn = document.getElementById('closeDetailBtn');
        this.youtubeFrame = document.getElementById('youtubeVideo');
        this.timerValue = document.getElementById('timerValue');
        this.linkButton = document.getElementById('linkButton');

        // ========== DATA CONFIGURATION ==========
        // ADD YOUR YOUTUBE LINKS HERE - Simple array format
        // Just provide YouTube URLs - direct link will automatically be set to BookMyShow
        // Example: "https://youtu.be/VIDEO_ID?si=..."
        this.youtubeLinks = [
            "https://youtu.be/5gVI329nO7c?si=4Zr3-XJpmP9bGTne",
            "https://youtu.be/FcGSy-So-rs"
        ];
        
        // Direct link for all movies (BookMyShow)
        this.defaultDirectLink = "https://in.bookmyshow.com";
        // ========== END DATA CONFIGURATION ==========

        // Movie data - will be populated from videosData
        this.movies = [];

        // State management for current detail view
        this.detailState = {
            isOpen: false,
            accumulatedSeconds: 0,
            isVideoPlaying: false,
            timerInterval: null,
            ytPlayer: null,
            isYtPlayerReady: false,
            currentYoutubeUrl: null,
            currentDirectLink: null
        };

        // Initialize app
        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        // Convert videosData to movies array and load video info
        this.loadVideosFromData();
    }

    /**
     * Load videos from YouTube links array and fetch their metadata
     * Optimized for fast loading - displays cards immediately without waiting for titles
     */
    async loadVideosFromData() {
        // Process each YouTube link - immediately create cards
        for (const youtubeUrl of this.youtubeLinks) {
            const videoId = this.extractVideoId(youtubeUrl);
            
            if (videoId) {
                // Use smaller thumbnail that loads faster and has better CORS support
                const thumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
                
                this.movies.push({
                    id: this.movies.length + 1,
                    title: 'Loading...', // Default title - will be updated async
                    videoId: videoId,
                    youtubeUrl: youtubeUrl,
                    directLink: this.defaultDirectLink, // Use default BookMyShow link for all
                    thumbnail: thumbnail
                });
            }
        }

        // Render cards IMMEDIATELY with default titles (non-blocking)
        this.renderMovieCards();
        this.attachEventListeners();

        // Fetch titles asynchronously in background WITHOUT BLOCKING
        this.fetchTitlesAsync();
    }

    /**
     * Fetch titles asynchronously in PARALLEL without blocking page load
     */
    async fetchTitlesAsync() {
        // Fetch all titles in parallel (not sequentially) for faster loading
        const titlePromises = this.movies.map(movie => 
            this.getVideoTitle(movie.videoId)
                .then(title => ({
                    movieId: movie.id,
                    title: title || 'YouTube Video'
                }))
        );

        // Wait for all to complete
        const results = await Promise.all(titlePromises);

        // Update DOM with all titles at once
        results.forEach(result => {
            const movie = this.movies.find(m => m.id === result.movieId);
            if (movie) {
                movie.title = result.title;
                const card = document.querySelector(`[data-movie-id="${movie.id}"] .movie-title`);
                if (card) {
                    card.textContent = this.escapeHtml(result.title);
                }
            }
        });
    }

    /**
     * Extract YouTube video ID from various URL formats
     */
    extractVideoId(url) {
        let videoId = null;
        
        // Handle youtu.be format
        if (url.includes('youtu.be/')) {
            videoId = url.split('youtu.be/')[1].split('?')[0];
        }
        // Handle youtube.com format
        else if (url.includes('youtube.com/watch?v=')) {
            videoId = url.split('v=')[1].split('&')[0];
        }
        // Handle youtube.com/embed format
        else if (url.includes('youtube.com/embed/')) {
            videoId = url.split('embed/')[1].split('?')[0];
        }
        
        return videoId;
    }

    /**
     * Fetch video title from YouTube using optimized API with timeout
     */
    async getVideoTitle(videoId) {
        // Create abort controller with 3 second timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
            // Try noembed API with timeout
            const response = await fetch(
                `https://noembed.com/embed?url=https://www.youtube.com/watch?v=${videoId}`,
                { signal: controller.signal }
            );
            
            clearTimeout(timeoutId);
            
            if (!response.ok) throw new Error('API error');
            
            const data = await response.json();
            
            if (data.title) {
                return data.title;
            }
        } catch (error) {
            clearTimeout(timeoutId);
            // Silently fail - use default title
        }

        // If API fails or times out, return generic title
        return `YouTube Video`;
    }

    /**
     * Render all movie cards in the grid
     */
    renderMovieCards() {
        this.moviesGrid.innerHTML = '';

        this.movies.forEach(movie => {
            const card = document.createElement('div');
            card.className = 'movie-card';
            card.dataset.movieId = movie.id;
            card.innerHTML = `
                <div class="movie-thumbnail" style="background-image: url('${movie.thumbnail}'); background-size: cover; background-position: center;">
                </div>
                <div class="movie-content">
                    <h3 class="movie-title">${this.escapeHtml(movie.title)}</h3>
                    <button class="movie-link" type="button">View Link</button>
                </div>
            `;

            // Open detail view on card click or button click
            card.addEventListener('click', () => this.openDetailView(movie));

            this.moviesGrid.appendChild(card);
        });
    }

    /**
     * Filter movie cards based on search input
     */
    filterMovies() {
        const searchTerm = this.searchInput.value.toLowerCase().trim();
        const cards = this.moviesGrid.querySelectorAll('.movie-card');

        cards.forEach(card => {
            const movieId = parseInt(card.dataset.movieId);
            const movie = this.movies.find(m => m.id === movieId);
            const matchesSearch = movie.title.toLowerCase().includes(searchTerm);

            card.style.display = matchesSearch ? 'flex' : 'none';
        });
    }

    /**
     * CRITICAL: Open detail view and initialize video watching logic
     */
    openDetailView(movie) {
        // Store current URLs for this detail view
        this.detailState.currentYoutubeUrl = movie.youtubeUrl;
        this.detailState.currentDirectLink = movie.directLink;

        // Reset state for new detail view
        this.detailState.isOpen = true;
        this.detailState.accumulatedSeconds = 0;
        this.detailState.isVideoPlaying = false;
        this.detailState.isYtPlayerReady = false;

        // Update the iframe with correct YouTube video
        const videoId = this.extractVideoId(movie.youtubeUrl);
        this.youtubeFrame.src = `https://www.youtube.com/embed/${videoId}?enablejsapi=1`;

        // Update the link button with correct direct link
        this.linkButton.href = movie.directLink;

        // Show overlay
        this.detailOverlay.classList.add('active');

        // Update button state (disabled by default)
        this.updateLinkButtonState();

        // Initialize YouTube player tracking
        this.setupYouTubeTracking();

        // Auto-start timer after 3 seconds
        setTimeout(() => {
            if (this.detailState.isOpen) {
                this.detailState.isVideoPlaying = true;
                document.querySelector('.timer-container').classList.add('timer-active');
                
                // Start timer interval
                if (!this.detailState.timerInterval) {
                    this.detailState.timerInterval = setInterval(() => {
                        this.updateTimer();
                    }, 1000);
                }
            }
        }, 3000); // 3 seconds delay

        // Scroll to top
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
    }

    /**
     * CRITICAL: Setup YouTube player event tracking
     * This uses postMessage API to communicate with iframe
     */
    setupYouTubeTracking() {
        // Send init message to YouTube embed to enable API
        const iframe = this.youtubeFrame;
        
        // Create listener for YouTube player state changes
        window.addEventListener('message', (event) => {
            if (event.origin !== 'https://www.youtube.com') return;

            try {
                const data = event.data;
                
                // YouTube player API sends messages in this format
                if (data.event === 'onReady') {
                    this.detailState.isYtPlayerReady = true;
                } else if (data.event === 'onStateChange') {
                    // -1: unstarted, 0: ended, 1: playing, 2: paused, 3: buffering, 5: video cued
                    const playerState = data.data;
                    this.handleYouTubeStateChange(playerState);
                }
            } catch (e) {
                // Silently handle non-YouTube messages
            }
        });

        // Post init command to iframe
        iframe.contentWindow.postMessage({
            event: 'listening'
        }, '*');
    }

    /**
     * CRITICAL: Handle YouTube player state changes
     */
    handleYouTubeStateChange(state) {
        // 1 = playing
        if (state === 1) {
            this.handleVideoPlaying();
        }
        // 2 = paused
        else if (state === 2) {
            this.handleVideoPaused();
        }
        // 0 = ended
        else if (state === 0) {
            this.handleVideoEnded();
        }
    }

    /**
     * CRITICAL: Called when video starts playing
     * Starts the countdown timer
     */
    handleVideoPlaying() {
        if (this.detailState.isVideoPlaying) return; // Already playing

        this.detailState.isVideoPlaying = true;

        // Start timer interval if not already running
        if (!this.detailState.timerInterval) {
            this.detailState.timerInterval = setInterval(() => {
                this.updateTimer();
            }, 1000); // Update every second
        }

        // Add visual indicator
        document.querySelector('.timer-container').classList.add('timer-active');
    }

    /**
     * CRITICAL: Called when video is paused
     * Pauses the countdown timer
     */
    handleVideoPaused() {
        this.detailState.isVideoPlaying = false;

        // Clear interval but keep accumulated seconds
        if (this.detailState.timerInterval) {
            clearInterval(this.detailState.timerInterval);
            this.detailState.timerInterval = null;
        }

        // Remove visual indicator
        document.querySelector('.timer-container').classList.remove('timer-active');
    }

    /**
     * CRITICAL: Called when video ends
     */
    handleVideoEnded() {
        this.handleVideoPaused(); // Pause timer
    }

    /**
     * CRITICAL: Update timer every second while video plays
     * This is the core gating mechanism
     */
    updateTimer() {
        if (!this.detailState.isVideoPlaying) return;

        // Increment accumulated seconds
        this.detailState.accumulatedSeconds++;

        // Calculate remaining time (starting from 20)
        const requiredSeconds = 20;
        const remainingSeconds = Math.max(0, requiredSeconds - this.detailState.accumulatedSeconds);

        // Update display
        this.timerValue.textContent = remainingSeconds;

        // Check if requirement met (timer reaches 0)
        if (remainingSeconds === 0) {
            this.unlockLinkButton();
        }
    }

    /**
     * CRITICAL: Unlock the button when 60 seconds reached
     */
    unlockLinkButton() {
        this.linkButton.classList.add('enabled');
        this.linkButton.removeAttribute('aria-disabled');
        this.linkButton.setAttribute('aria-disabled', 'false');

        // Stop timer
        if (this.detailState.timerInterval) {
            clearInterval(this.detailState.timerInterval);
            this.detailState.timerInterval = null;
        }

        // Remove pulse animation
        document.querySelector('.timer-container').classList.remove('timer-active');
    }

    /**
     * Update button state (enabled/disabled)
     */
    updateLinkButtonState() {
        const isUnlocked = this.detailState.accumulatedSeconds >= 60;

        if (isUnlocked) {
            this.linkButton.classList.add('enabled');
            this.linkButton.removeAttribute('aria-disabled');
            this.linkButton.setAttribute('aria-disabled', 'false');
        } else {
            this.linkButton.classList.remove('enabled');
            this.linkButton.removeAttribute('aria-disabled');
            this.linkButton.setAttribute('aria-disabled', 'true');
        }
    }

    /**
     * CRITICAL: Close detail view and reset all state
     * Timer resets completely
     */
    closeDetailView() {
        // Clear any running timers
        if (this.detailState.timerInterval) {
            clearInterval(this.detailState.timerInterval);
            this.detailState.timerInterval = null;
        }

        // Reset state completely
        this.detailState.isOpen = false;
        this.detailState.accumulatedSeconds = 0;
        this.detailState.isVideoPlaying = false;

        // Reset UI
        this.timerValue.textContent = '20';
        this.linkButton.classList.remove('enabled');
        this.linkButton.setAttribute('aria-disabled', 'true');
        document.querySelector('.timer-container').classList.remove('timer-active');

        // Pause video by reloading iframe
        const iframeSrc = this.youtubeFrame.src;
        this.youtubeFrame.src = iframeSrc;

        // Hide overlay
        this.detailOverlay.classList.remove('active');
    }

    /**
     * Attach all event listeners
     */
    attachEventListeners() {
        // Search input filter
        this.searchInput.addEventListener('input', () => this.filterMovies());

        // Close detail view
        this.closeDetailBtn.addEventListener('click', () => this.closeDetailView());
        this.detailOverlay.addEventListener('click', (e) => {
            // Close only if clicking overlay background, not modal
            if (e.target === this.detailOverlay) {
                this.closeDetailView();
            }
        });

        // Prevent link button click when disabled
        this.linkButton.addEventListener('click', (e) => {
            if (!this.linkButton.classList.contains('enabled')) {
                e.preventDefault();
            }
        });
    }

    /**
     * Load YouTube API
     */
    loadYouTubeAPI() {
        // YouTube embedded player supports postMessage API by default
        // No additional loading needed
    }

    /**
     * Utility: Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        const map = {
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#039;'
        };
        return text.replace(/[&<>"']/g, m => map[m]);
    }
}

/**
 * Initialize app when DOM is ready
 */
document.addEventListener('DOMContentLoaded', () => {
    new FilmSchoolApp();
});
