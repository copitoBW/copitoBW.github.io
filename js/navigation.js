/**
 * navigation.js - SpeakNow Spanish Institute Navigation & Preferences
 * Handles mobile navigation, theme switching, language selection, and user preferences
 */

class NavigationController {
    constructor() {
        this.translations = {}; // Translation cache
        this.elements = {}; // DOM elements cache
        this.isInitialized = false;
        this.eventListeners = []; // Track event listeners for cleanup
        
        // Configuration
        this.config = {
            defaultLanguage: 'en',
            defaultTheme: 'light',
            defaultFontSize: 'medium',
            maxTranslationAttempts: 3,
            translationDelay: 100,
            fontSizes: {
                small: '14px',
                medium: '16px',
                large: '18px'
            }
        };
    }

    /**
     * Initialize the navigation controller
     */
    async init() {
        if (this.isInitialized) return;
        
        try {
            // Apply saved preferences immediately
            this.applySavedPreferences();
            
            // Wait for DOM to be ready
            if (document.readyState === 'loading') {
                await new Promise(resolve => {
                    document.addEventListener('DOMContentLoaded', resolve);
                });
            }
            
            // Wait for header to be injected
            await this.waitForElement('.hamburger');
            
            // Cache DOM elements
            this.cacheElements();
            
            // Setup all event listeners
            this.setupEventListeners();
            
            // Set active navigation link
            this.setActiveNavLink();
            
            // Load and apply saved language
            await this.loadSavedLanguage();
            
            this.isInitialized = true;
            console.log('Navigation controller initialized successfully');
            
        } catch (error) {
            console.error('Failed to initialize navigation controller:', error);
        }
    }

    /**
     * Cache frequently used DOM elements
     */
    cacheElements() {
        this.elements = {
            hamburger: document.querySelector('.hamburger'),
            navCenter: document.querySelector('.nav-center'),
            closeBtn: document.querySelector('.close-btn'),
            overlay: this.getOrCreateOverlay(),
            dropdown: document.querySelector('.dropdown'),
            dropbtn: document.querySelector('.dropbtn'),
            themeSelect: document.getElementById('theme-select'),
            fontSelect: document.getElementById('font-select'),
            langSelect: document.getElementById('lang-select'),
            navLinks: document.querySelectorAll('.nav-center a')
        };
    }

    /**
     * Get or create the overlay element
     */
    getOrCreateOverlay() {
        let overlay = document.querySelector('.overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.classList.add('overlay');
            overlay.setAttribute('aria-hidden', 'true');
            document.body.appendChild(overlay);
        }
        return overlay;
    }

    /**
     * Setup all event listeners
     */
    setupEventListeners() {
        // Mobile navigation
        this.setupMobileNavigation();
        
        // Dropdown functionality
        this.setupDropdown();
        
        // Preferences
        this.setupPreferences();
        
        // Close dropdown when clicking outside
        this.addEventListenerWithCleanup(document, 'click', (e) => {
            if (!e.target.closest('.dropdown')) {
                this.elements.dropdown?.classList.remove('show');
            }
        });

        // Handle escape key
        this.addEventListenerWithCleanup(document, 'keydown', (e) => {
            if (e.key === 'Escape') {
                this.closeMobileNav();
                this.elements.dropdown?.classList.remove('show');
            }
        });
    }

    /**
     * Setup mobile navigation event listeners
     */
    setupMobileNavigation() {
        const { hamburger, navCenter, closeBtn, overlay, navLinks } = this.elements;

        if (hamburger && navCenter) {
            // Open mobile menu
            this.addEventListenerWithCleanup(hamburger, 'click', () => {
                this.openMobileNav();
            });

            // Close with close button
            if (closeBtn) {
                this.addEventListenerWithCleanup(closeBtn, 'click', () => {
                    this.closeMobileNav();
                });
            }

            // Close when overlay clicked
            this.addEventListenerWithCleanup(overlay, 'click', () => {
                this.closeMobileNav();
            });

            // Close when clicking nav links (mobile)
            navLinks.forEach(link => {
                this.addEventListenerWithCleanup(link, 'click', () => {
                    this.closeMobileNav();
                });
            });
        }
    }

    /**
     * Setup dropdown functionality
     */
    setupDropdown() {
        const { dropbtn, dropdown } = this.elements;
        
        if (dropbtn && dropdown) {
            this.addEventListenerWithCleanup(dropbtn, 'click', (e) => {
                e.stopPropagation();
                dropdown.classList.toggle('show');
                
                // Update ARIA attributes
                const isOpen = dropdown.classList.contains('show');
                dropbtn.setAttribute('aria-expanded', isOpen);
            });
        }
    }

    /**
     * Setup preference controls (theme, font, language)
     */
    setupPreferences() {
        this.setupThemeControl();
        this.setupFontControl();
        this.setupLanguageControl();
    }

    /**
     * Setup theme switching
     */
    setupThemeControl() {
        const { themeSelect } = this.elements;
        
        if (themeSelect) {
            this.addEventListenerWithCleanup(themeSelect, 'change', (e) => {
                const theme = e.target.value;
                this.setTheme(theme);
                this.savePreference('theme', theme);
            });

            // Set saved theme value
            const savedTheme = this.getPreference('theme') || this.config.defaultTheme;
            themeSelect.value = savedTheme;
        }
    }

    /**
     * Setup font size control
     */
    setupFontControl() {
        const { fontSelect } = this.elements;
        
        if (fontSelect) {
            this.addEventListenerWithCleanup(fontSelect, 'change', (e) => {
                const fontSize = e.target.value;
                this.setFontSize(fontSize);
                this.savePreference('fontSize', fontSize);
            });

            // Set saved font size value
            const savedFontSize = this.getPreference('fontSize') || this.config.defaultFontSize;
            fontSelect.value = savedFontSize;
        }
    }

    /**
     * Setup language control
     */
    setupLanguageControl() {
        const { langSelect } = this.elements;
        
        if (langSelect) {
            this.addEventListenerWithCleanup(langSelect, 'change', async (e) => {
                const language = e.target.value;
                this.savePreference('language', language);
                await this.applyTranslations(language);
            });
        }
    }

    /**
     * Open mobile navigation
     */
    openMobileNav() {
        const { navCenter, overlay, hamburger } = this.elements;
        
        navCenter?.classList.add('show');
        overlay?.classList.add('show');
        
        // Update ARIA attributes
        hamburger?.setAttribute('aria-expanded', 'true');
        navCenter?.setAttribute('aria-hidden', 'false');
        
        // Prevent body scrolling
        document.body.style.overflow = 'hidden';
    }

    /**
     * Close mobile navigation
     */
    closeMobileNav() {
        const { navCenter, overlay, hamburger } = this.elements;
        
        navCenter?.classList.remove('show');
        overlay?.classList.remove('show');
        
        // Update ARIA attributes
        hamburger?.setAttribute('aria-expanded', 'false');
        navCenter?.setAttribute('aria-hidden', 'true');
        
        // Restore body scrolling
        document.body.style.overflow = '';
    }

    /**
     * Load translations for a specific language
     */
    async loadTranslations(language) {
        if (this.translations[language]) {
            return this.translations[language];
        }

        let attempts = 0;
        while (attempts < this.config.maxTranslationAttempts) {
            try {
                const response = await fetch(`js/translations/${language}.json`);
                
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const data = await response.json();
                
                // Validate translation data
                if (typeof data !== 'object' || data === null) {
                    throw new Error('Invalid translation data format');
                }
                
                this.translations[language] = data;
                return data;
                
            } catch (error) {
                attempts++;
                console.error(`Attempt ${attempts} - Error loading ${language} translations:`, error);
                
                if (attempts >= this.config.maxTranslationAttempts) {
                    console.error(`Failed to load ${language} translations after ${attempts} attempts`);
                    return {};
                }
                
                // Wait before retrying
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
        
        return {};
    }

    /**
     * Apply translations to the page
     */
    async applyTranslations(language) {
        try {
            // Update document language
            document.documentElement.setAttribute('lang', language);
            
            // Load translations
            const translations = await this.loadTranslations(language);
            
            // Apply translations to elements with data-i18n
            const elements = document.querySelectorAll('[data-i18n]');
            elements.forEach(element => {
                const key = element.getAttribute('data-i18n');
                const translation = translations[key];
                
                if (translation && typeof translation === 'string') {
                    element.innerHTML = translation;
                } else if (!translation) {
                    console.warn(`Missing translation for key: ${key} in language: ${language}`);
                }
            });
            
            // Apply translations to placeholder attributes
            const placeholderElements = document.querySelectorAll('[data-i18n-placeholder]');
            placeholderElements.forEach(element => {
                const key = element.getAttribute('data-i18n-placeholder');
                const translation = translations[key];
                
                if (translation && typeof translation === 'string') {
                    element.setAttribute('placeholder', translation);
                } else if (!translation) {
                    console.warn(`Missing placeholder translation for key: ${key} in language: ${language}`);
                }
            });
            
        } catch (error) {
            console.error('Error applying translations:', error);
        }
    }

    /**
     * Apply saved preferences immediately
     */
    applySavedPreferences() {
        // Apply theme
        const savedTheme = this.getPreference('theme');
        if (savedTheme) {
            this.setTheme(savedTheme);
        }

        // Apply font size
        const savedFontSize = this.getPreference('fontSize');
        if (savedFontSize) {
            this.setFontSize(savedFontSize);
        }
    }

    /**
     * Load and apply saved language
     */
    async loadSavedLanguage() {
        const { langSelect } = this.elements;
        
        const savedLanguage = this.getPreference('language') || this.config.defaultLanguage;
        
        if (langSelect) {
            langSelect.value = savedLanguage;
        }
        
        // Apply translations with a small delay to ensure DOM is ready
        setTimeout(() => this.applyTranslations(savedLanguage), this.config.translationDelay);
    }

    /**
     * Set theme
     */
    setTheme(theme) {
        if (theme === 'dark') {
            document.body.classList.add('dark-theme');
        } else {
            document.body.classList.remove('dark-theme');
        }
    }

    /**
     * Set font size
     */
    setFontSize(size) {
        const fontSize = this.config.fontSizes[size] || this.config.fontSizes.medium;
        document.documentElement.style.fontSize = fontSize;
    }

    /**
     * Set active navigation link based on current page
     */
    setActiveNavLink() {
        const currentPage = window.location.pathname.split('/').pop() || 'index.html';
        const { navLinks } = this.elements;
        
        // Remove active class from all links
        navLinks.forEach(link => link.classList.remove('active'));
        
        // Add active class to current page link
        navLinks.forEach(link => {
            const linkHref = link.getAttribute('href');
            if (this.isCurrentPage(linkHref, currentPage)) {
                link.classList.add('active');
                link.setAttribute('aria-current', 'page');
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    /**
     * Check if link matches current page
     */
    isCurrentPage(linkHref, currentPage) {
        return linkHref === currentPage || 
               (currentPage === '' && linkHref === 'index.html') ||
               (currentPage === 'index.html' && linkHref === 'index.html');
    }

    /**
     * Save preference to localStorage with error handling
     */
    savePreference(key, value) {
        try {
            localStorage.setItem(key, value);
        } catch (error) {
            console.error(`Error saving preference ${key}:`, error);
        }
    }

    /**
     * Get preference from localStorage with error handling
     */
    getPreference(key) {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.error(`Error getting preference ${key}:`, error);
            return null;
        }
    }

    /**
     * Wait for element to appear in DOM
     */
    async waitForElement(selector, timeout = 5000) {
        const startTime = Date.now();
        
        while (Date.now() - startTime < timeout) {
            const element = document.querySelector(selector);
            if (element) {
                return element;
            }
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        throw new Error(`Element ${selector} not found within ${timeout}ms`);
    }

    /**
     * Add event listener with cleanup tracking
     */
    addEventListenerWithCleanup(element, event, handler, options = {}) {
        if (!element) return;
        
        element.addEventListener(event, handler, options);
        this.eventListeners.push({ element, event, handler, options });
    }

    /**
     * Clean up all event listeners
     */
    cleanup() {
        this.eventListeners.forEach(({ element, event, handler, options }) => {
            element.removeEventListener(event, handler, options);
        });
        this.eventListeners = [];
        this.isInitialized = false;
    }

    /**
     * Handle page visibility changes to pause/resume functionality
     */
    handleVisibilityChange() {
        if (document.hidden) {
            // Pause any ongoing operations when page is hidden
            this.closeMobileNav();
        }
    }
}

// Create global instance
const navigationController = new NavigationController();

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => navigationController.init());
} else {
    navigationController.init();
}

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
    navigationController.handleVisibilityChange();
});

// Clean up when page unloads
window.addEventListener('beforeunload', () => {
    navigationController.cleanup();
});

// Export for potential external use
if (typeof module !== 'undefined' && module.exports) {
    module.exports = NavigationController;
} else {
    window.NavigationController = NavigationController;
    window.navigationController = navigationController;
}