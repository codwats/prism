/**
 * PRISM Card Processor
 * Handles card deduplication and stripe assignment across multiple decks
 */

import { normalizeCardName } from "./parser.js";

/**
 * Default color palette - paint pen colors
 * 15 distinct colors for maximum deck support
 */
export const DEFAULT_COLORS = [
	"#ecc933", // Yellow
	"#558CC1", // Blue
	"#6B5597", // Purple
	"#C73D2B", // Red
	"#70AF63", // Green
	"#EEEEEE", // White
	"#7A5E68", // Brown
	"#3C5890", // Navy
	"#C76B61", // Salmon
	"#A3C569", // Light-Green
	"#D69F5D", // Gold
	"#5A9FD7", // Light-Blue
	"#F5F4CF", // Cream
	"#AC638C", // Maroon
	"#CFD964", // Lime
	"#746BA9", // Grape
	"#D388B2", // Pink
	"#D4BC2E", // Dark Yellow
	"#569899", // Teal
	"#ECCAD7", // Pale-Pink
	"#CCA427", // Straw
	"#C2CCD2", // Silver
];

/**
 * Get a color name for display purposes
 * @param {string} hex - Hex color code
 * @returns {string} Human-readable color name
 */
export function getColorName(hex) {
	const colorNames = {
		"#ecc933": "Yellow",
		"#558CC1": "Blue",
		"#6B5597": "Purple",
		"#C73D2B": "Red",
		"#70AF63": "Green",
		"#EEEEEE": "White",
		"#7A5E68": "Brown",
		"#3C5890": "Navy",
		"#C76B61": "Salmon",
		"#A3C569": "Light-Green",
		"#D69F5D": "Gold",
		"#5A9FD7": "Light-Blue",
		"#F5F4CF": "Cream",
		"#AC638C": "Maroon",
		"#CFD964": "Lime",
		"#746BA9": "Grape",
		"#D388B2": "Pink",
		"#D4BC2E": "Dark Yellow",
		"#569899": "Teal",
		"#ECCAD7": "Pale-Pink",
		"#CCA427": "Straw",
		"#C2CCD2": "Silver",
	};
	return colorNames[hex.toUpperCase()] || hex;
}

/**
 * Generate a UUID v4
 * @returns {string} A UUID string
 */
export function generateId() {
	return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
		const r = (Math.random() * 16) | 0;
		const v = c === "x" ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * Create a new deck object
 * @param {Object} params - Deck parameters
 * @returns {Object} A new deck object
 */
export function createDeck({
	name,
	commander,
	bracket,
	color,
	stripePosition,
	cards,
}) {
	const now = new Date().toISOString();
	return {
		id: generateId(),
		name,
		commander,
		bracket: parseInt(bracket, 10),
		color: color.toUpperCase(),
		stripePosition,
		cards,
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Create a new PRISM object
 * @param {string} name - Optional name for the PRISM
 * @returns {Object} A new PRISM object
 */
export function createPrism(name = "") {
	const now = new Date().toISOString();
	return {
		id: generateId(),
		name: name || `PRISM ${new Date().toLocaleDateString()}`,
		decks: [],
		markedCards: [], // Track which cards have been physically marked
		createdAt: now,
		updatedAt: now,
	};
}

/**
 * Process all decks in a PRISM to find shared cards and generate marking instructions
 * @param {Object} prism - The PRISM object containing decks
 * @returns {Array} Array of ProcessedCard objects sorted by deck count (descending) then name
 */
export function processCards(prism) {
	const { decks } = prism;

	if (!decks || decks.length === 0) {
		return [];
	}

	// Build a map of normalized card name -> card data
	const cardMap = new Map();

	for (const deck of decks) {
		for (const card of deck.cards) {
			const normalizedName = normalizeCardName(card.name);

			if (!cardMap.has(normalizedName)) {
				cardMap.set(normalizedName, {
					name: card.name, // Keep original display name from first occurrence
					isBasicLand: card.isBasicLand,
					quantities: new Map(), // deckId -> quantity
					stripes: [],
				});
			}

			const cardData = cardMap.get(normalizedName);

			// Track quantity per deck (for basics)
			cardData.quantities.set(deck.id, card.quantity);

			// Add stripe information
			cardData.stripes.push({
				position: deck.stripePosition,
				color: deck.color,
				deckName: deck.name,
				deckId: deck.id,
				bracket: deck.bracket,
				quantity: card.quantity,
			});
		}
	}

	// Convert map to array of ProcessedCard objects
	const processedCards = [];

	for (const [normalizedName, cardData] of cardMap) {
		// Calculate total quantity needed (max across decks for basics, 1 for others)
		let totalQuantity = 1;
		if (cardData.isBasicLand) {
			totalQuantity = Math.max(...cardData.quantities.values());
		}

		processedCards.push({
			name: cardData.name,
			normalizedName,
			isBasicLand: cardData.isBasicLand,
			totalQuantity,
			deckCount: cardData.stripes.length,
			stripes: cardData.stripes.sort((a, b) => a.position - b.position),
		});
	}

	// Sort: most decks first, then alphabetically
	processedCards.sort((a, b) => {
		if (b.deckCount !== a.deckCount) {
			return b.deckCount - a.deckCount;
		}
		return a.name.localeCompare(b.name);
	});

	return processedCards;
}

/**
 * Calculate overlap statistics between decks
 * @param {Object} prism - The PRISM object
 * @returns {Object} Overlap statistics
 */
export function calculateOverlap(prism) {
	const processedCards = processCards(prism);

	const totalUniqueCards = processedCards.length;
	const sharedCards = processedCards.filter((c) => c.deckCount > 1);
	const uniqueToOneDeck = processedCards.filter((c) => c.deckCount === 1);

	// Calculate pairwise overlap between decks
	const pairwiseOverlap = [];
	const decks = prism.decks;

	for (let i = 0; i < decks.length; i++) {
		for (let j = i + 1; j < decks.length; j++) {
			const deck1Cards = new Set(
				decks[i].cards.map((c) => normalizeCardName(c.name)),
			);
			const deck2Cards = new Set(
				decks[j].cards.map((c) => normalizeCardName(c.name)),
			);

			let overlap = 0;
			for (const card of deck1Cards) {
				if (deck2Cards.has(card)) overlap++;
			}

			pairwiseOverlap.push({
				deck1: decks[i].name,
				deck2: decks[j].name,
				overlapCount: overlap,
			});
		}
	}

	return {
		totalUniqueCards,
		sharedCardCount: sharedCards.length,
		uniqueCardCount: uniqueToOneDeck.length,
		sharedCards,
		pairwiseOverlap,
		// Cards shared by most decks
		mostShared: sharedCards.slice(0, 10),
	};
}

/**
 * Get the next available stripe position for a new deck
 * @param {Object} prism - The PRISM object
 * @returns {number} The next available position (1-15)
 */
export function getNextStripePosition(prism) {
	if (!prism.decks || prism.decks.length === 0) {
		return 1;
	}

	const usedPositions = new Set(prism.decks.map((d) => d.stripePosition));

	for (let i = 1; i <= 15; i++) {
		if (!usedPositions.has(i)) {
			return i;
		}
	}

	// All positions used (shouldn't happen with 15 limit)
	return prism.decks.length + 1;
}

/**
 * Get the next available color from the default palette
 * @param {Object} prism - The PRISM object
 * @returns {string} The next available hex color
 */
export function getNextColor(prism) {
	if (!prism.decks || prism.decks.length === 0) {
		return DEFAULT_COLORS[0];
	}

	const usedColors = new Set(prism.decks.map((d) => d.color.toUpperCase()));

	for (const color of DEFAULT_COLORS) {
		if (!usedColors.has(color.toUpperCase())) {
			return color;
		}
	}

	// All default colors used, return first one (user should pick different)
	return DEFAULT_COLORS[0];
}

/**
 * Check if a color is already used in the PRISM
 * @param {Object} prism - The PRISM object
 * @param {string} color - The hex color to check
 * @param {string} excludeDeckId - Optional deck ID to exclude from check (for editing)
 * @returns {Object|null} The deck using this color, or null if available
 */
export function isColorUsed(prism, color, excludeDeckId = null) {
	const normalizedColor = color.toUpperCase();

	for (const deck of prism.decks) {
		if (excludeDeckId && deck.id === excludeDeckId) continue;
		if (deck.color.toUpperCase() === normalizedColor) {
			return deck;
		}
	}

	return null;
}

/**
 * Reorder stripe positions for all decks
 * @param {Object} prism - The PRISM object
 * @param {Array} newOrder - Array of deck IDs in the new order
 * @returns {Object} Updated PRISM with new stripe positions
 */
export function reorderStripes(prism, newOrder) {
	const deckMap = new Map(prism.decks.map((d) => [d.id, d]));

	const updatedDecks = newOrder
		.map((deckId, index) => {
			const deck = deckMap.get(deckId);
			if (!deck) return null;

			return {
				...deck,
				stripePosition: index + 1,
				updatedAt: new Date().toISOString(),
			};
		})
		.filter(Boolean);

	return {
		...prism,
		decks: updatedDecks,
		updatedAt: new Date().toISOString(),
	};
}

/**
 * Add a deck to a PRISM
 * @param {Object} prism - The PRISM object
 * @param {Object} deck - The deck to add
 * @returns {Object} Updated PRISM
 */
export function addDeckToPrism(prism, deck) {
	return {
		...prism,
		decks: [...prism.decks, deck],
		updatedAt: new Date().toISOString(),
	};
}

/**
 * Remove a deck from a PRISM
 * @param {Object} prism - The PRISM object
 * @param {string} deckId - The ID of the deck to remove
 * @returns {Object} Updated PRISM
 */
export function removeDeckFromPrism(prism, deckId) {
	return {
		...prism,
		decks: prism.decks.filter((d) => d.id !== deckId),
		updatedAt: new Date().toISOString(),
	};
}

/**
 * Update a deck in a PRISM
 * @param {Object} prism - The PRISM object
 * @param {string} deckId - The ID of the deck to update
 * @param {Object} updates - The fields to update
 * @returns {Object} Updated PRISM
 */
export function updateDeckInPrism(prism, deckId, updates) {
	return {
		...prism,
		decks: prism.decks.map((d) => {
			if (d.id !== deckId) return d;
			return {
				...d,
				...updates,
				updatedAt: new Date().toISOString(),
			};
		}),
		updatedAt: new Date().toISOString(),
	};
}
