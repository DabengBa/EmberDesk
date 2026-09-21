/**
 * @typedef {Object} Scraper
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} iconClass
 * @property {boolean} iconAvailable
 * @property {() => Promise<void>} [init=null]
 * @property {() => Promise<boolean>} isAvailable
 * @property {() => Promise<File[]>} scrape
 */

/**
 * @typedef {Object} ScraperInfo
 * @property {string} id
 * @property {string} name
 * @property {string} description
 * @property {string} iconClass
 * @property {boolean} iconAvailable
 */

export class ScraperManager {
    /**
     * @type {Scraper[]}
     */
    static #scrapers = [];

    /**
     * Register a scraper to be used by the Data Bank.
     * @param {Scraper} scraper Instance of a scraper to register
     */
    static async registerDataBankScraper(scraper) {
        if (ScraperManager.#scrapers.some(s => s.id === scraper.id)) {
            console.warn(`Scraper with ID ${scraper.id} already registered`);
            return;
        }

        if (scraper.init) {
            await scraper.init();
        }

        ScraperManager.#scrapers.push(scraper);
    }

    /**
     * Gets a list of scrapers available for the Data Bank.
     * @returns {ScraperInfo[]} List of scrapers available for the Data Bank
     */
    static getDataBankScrapers() {
        return ScraperManager.#scrapers.map(s => ({ id: s.id, name: s.name, description: s.description, iconClass: s.iconClass, iconAvailable: s.iconAvailable }));
    }

    /**
     * Run a scraper to scrape data into the Data Bank.
     * @param {string} scraperId ID of the scraper to run
     * @returns {Promise<File[]>} List of files scraped by the scraper
     */
    static runDataBankScraper(scraperId) {
        const scraper = ScraperManager.#scrapers.find(s => s.id === scraperId);
        if (!scraper) {
            console.warn(`Scraper with ID ${scraperId} not found`);
            return;
        }
        return scraper.scrape();
    }

    /**
     * Check if a scraper is available.
     * @param {string} scraperId ID of the scraper to check
     * @returns {Promise<boolean>} Whether the scraper is available
     */
    static isScraperAvailable(scraperId) {
        const scraper = ScraperManager.#scrapers.find(s => s.id === scraperId);
        if (!scraper) {
            console.warn(`Scraper with ID ${scraperId} not found`);
            return;
        }
        return scraper.isAvailable();
    }
}

