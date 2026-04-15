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
		"#ECC933": "Yellow",
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
	id,
	splitGroupId = null,
	createdAt,
	updatedAt,
}) {
	const now = new Date().toISOString();
	return {
		id: id || generateId(),
		name,
		commander,
		bracket: parseInt(bracket, 10),
		color: color.toUpperCase(),
		stripePosition,
		splitGroupId,
		cards,
		createdAt: createdAt || now,
		updatedAt: updatedAt || now,
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
		splitGroups: [], // Split group definitions for deck variants
		markedCards: [], // Track which cards have been physically marked
		removedCards: [], // Track cards removed from decks that need marks removed
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
	const { decks, splitGroups = [] } = prism;

	if (!decks || decks.length === 0) {
		return [];
	}

	// Build split group lookup
	const groupMap = new Map(splitGroups.map((g) => [g.id, g]));

	// Build a map of normalized card name -> card data
	const cardMap = new Map();

	for (const deck of decks) {
		const group = deck.splitGroupId ? groupMap.get(deck.splitGroupId) : null;

		for (const card of deck.cards) {
			const normalizedName = normalizeCardName(card.name);

			if (!cardMap.has(normalizedName)) {
				cardMap.set(normalizedName, {
					name: card.name, // Keep original display name from first occurrence
					isBasicLand: card.isBasicLand,
					quantities: new Map(), // deckId -> quantity
					stripes: [],
					sideAGroups: new Set(), // Track which split groups already have a Side A stripe
					deckIds: new Set(), // Track unique deck IDs for deckCount
				});
			}

			const cardData = cardMap.get(normalizedName);

			// Track quantity per deck (for basics)
			cardData.quantities.set(deck.id, card.quantity);
			cardData.deckIds.add(deck.id);

			if (group) {
				// Split deck: add Side A stripe (deduplicated per group) + Side B stripe
				if (!cardData.sideAGroups.has(group.id)) {
					cardData.sideAGroups.add(group.id);
					cardData.stripes.push({
						position: group.sideAPosition,
						color: group.sideAColor,
						side: "a",
						deckName: group.name,
						deckId: null, // Side A is a group-level mark, not deck-specific
						groupId: group.id,
						bracket: null,
						quantity: null,
					});
				}
				// Side B mark for this specific split (stripe or dot depending on group style)
				const isDotStyle = (group.splitStyle || 'stripes') === 'dots';
				const dotIndex = isDotStyle ? group.childDeckIds.indexOf(deck.id) : -1;
				cardData.stripes.push({
					position: isDotStyle ? group.sideAPosition : deck.stripePosition,
					color: deck.color,
					side: "b",
					deckName: deck.name,
					deckId: deck.id,
					groupId: group.id,
					bracket: deck.bracket,
					quantity: card.quantity,
					markType: isDotStyle ? 'dot' : 'stripe',
					dotIndex: isDotStyle ? dotIndex : undefined,
				});
			} else {
				// Standalone deck: single Side A stripe
				cardData.stripes.push({
					position: deck.stripePosition,
					color: deck.color,
					side: "a",
					deckName: deck.name,
					deckId: deck.id,
					groupId: null,
					bracket: deck.bracket,
					quantity: card.quantity,
				});
			}
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

		// Sort stripes: Side A first (by position), then Side B (by position)
		const sortedStripes = cardData.stripes.sort((a, b) => {
			if (a.side !== b.side) return a.side === "a" ? -1 : 1;
			return a.position - b.position;
		});

		// Logical deck count: standalone decks + split groups each count as 1.
		// A card shared only among variants of the same split group = logicalDeckCount 1 (core, not pool).
		const standaloneIds = new Set();
		const splitGroupIds = new Set();
		for (const stripe of sortedStripes) {
			if (stripe.groupId) {
				splitGroupIds.add(stripe.groupId);
			} else if (stripe.deckId) {
				standaloneIds.add(stripe.deckId);
			}
		}
		const logicalDeckCount = standaloneIds.size + splitGroupIds.size;

		processedCards.push({
			name: cardData.name,
			normalizedName,
			isBasicLand: cardData.isBasicLand,
			totalQuantity,
			deckCount: cardData.deckIds.size, // Number of actual decks, not stripe count
			logicalDeckCount, // Standalone decks + split groups (variants of same group = 1)
			stripes: sortedStripes,
		});
	}

	// Sort: most logical decks first, then alphabetically
	processedCards.sort((a, b) => {
		if (b.logicalDeckCount !== a.logicalDeckCount) {
			return b.logicalDeckCount - a.logicalDeckCount;
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
	const sharedCards = processedCards.filter((c) => c.logicalDeckCount > 1);
	const uniqueToOneDeck = processedCards.filter((c) => c.logicalDeckCount === 1);

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
 * Get all used stripe positions in a PRISM (from decks AND split group Side A positions)
 * @param {Object} prism - The PRISM object
 * @returns {Set<number>} Set of used position numbers
 */
export function getUsedPositions(prism) {
	const used = new Set();
	if (prism.decks) {
		for (const d of prism.decks) {
			used.add(d.stripePosition);
		}
	}
	if (prism.splitGroups) {
		for (const g of prism.splitGroups) {
			used.add(g.sideAPosition);
		}
	}
	return used;
}

/**
 * Get a map of all occupied stripe positions with their occupant info
 * @param {Object} prism - The PRISM object
 * @returns {Map<number, {type: string, id: string, name: string, color: string}>}
 */
export function getPositionOccupants(prism) {
	const occupants = new Map();

	// Add split group Side A positions
	if (prism.splitGroups) {
		for (const group of prism.splitGroups) {
			occupants.set(group.sideAPosition, {
				type: 'group',
				id: group.id,
				name: group.name,
				color: group.sideAColor,
			});
		}
	}

	// Add deck positions (skip split group children for Side A — they share the group's position)
	if (prism.decks) {
		for (const deck of prism.decks) {
			// Don't overwrite a group's Side A entry with a child deck
			if (!occupants.has(deck.stripePosition)) {
				occupants.set(deck.stripePosition, {
					type: 'deck',
					id: deck.id,
					name: deck.name,
					color: deck.color,
				});
			}
		}
	}

	return occupants;
}

/**
 * Move a deck's stripe to a specific position, swapping with any occupant
 * @param {Object} prism - The PRISM object
 * @param {string} deckId - The deck ID to move
 * @param {number} targetPosition - The target slot number
 * @returns {{prism: Object, swapped: boolean, swappedWithName: string|null}}
 */
export function moveStripeToPosition(prism, deckId, targetPosition) {
	const now = new Date().toISOString();
	const deck = prism.decks.find((d) => d.id === deckId);
	if (!deck) return { prism, swapped: false, swappedWithName: null };

	const currentPosition = deck.stripePosition;
	if (currentPosition === targetPosition) {
		return { prism, swapped: false, swappedWithName: null };
	}

	// Check if a split group owns this deck's current position (Side A)
	const ownerGroup = prism.splitGroups?.find(
		(g) => g.sideAPosition === currentPosition && g.childDeckIds.includes(deckId),
	);

	// Find what's at the target position
	const targetDeck = prism.decks.find(
		(d) => d.id !== deckId && d.stripePosition === targetPosition,
	);
	const targetGroup = prism.splitGroups?.find(
		(g) => g.sideAPosition === targetPosition,
	);

	let swappedWithName = null;

	// Update decks
	const updatedDecks = prism.decks.map((d) => {
		if (d.id === deckId) {
			return { ...d, stripePosition: targetPosition, updatedAt: now };
		}
		// Swap: move the target occupant to the current position
		if (targetDeck && d.id === targetDeck.id) {
			swappedWithName = d.name;
			return { ...d, stripePosition: currentPosition, updatedAt: now };
		}
		return d;
	});

	// Update split groups if needed
	const updatedGroups = (prism.splitGroups || []).map((g) => {
		if (ownerGroup && g.id === ownerGroup.id) {
			return { ...g, sideAPosition: targetPosition };
		}
		if (targetGroup && g.id === targetGroup.id && !ownerGroup) {
			swappedWithName = swappedWithName || g.name;
			return { ...g, sideAPosition: currentPosition };
		}
		return g;
	});

	return {
		prism: {
			...prism,
			decks: updatedDecks,
			splitGroups: updatedGroups,
			updatedAt: now,
		},
		swapped: swappedWithName !== null,
		swappedWithName,
	};
}

/**
 * Get the next available stripe position for a new deck
 * @param {Object} prism - The PRISM object
 * @param {string} side - 'a' for Side A (1-24 preferred), 'b' for Side B (25-48 preferred)
 * @returns {number} The next available position (1-48)
 */
export function getNextStripePosition(prism, side = "a") {
	const usedPositions = getUsedPositions(prism);

	if (side === "b") {
		// Side B: prefer 25-48, overflow to 1-24
		for (let i = 25; i <= 48; i++) {
			if (!usedPositions.has(i)) return i;
		}
		for (let i = 1; i <= 24; i++) {
			if (!usedPositions.has(i)) return i;
		}
	} else {
		// Side A: prefer 1-24, overflow to 25-48
		for (let i = 1; i <= 24; i++) {
			if (!usedPositions.has(i)) return i;
		}
		for (let i = 25; i <= 48; i++) {
			if (!usedPositions.has(i)) return i;
		}
	}

	// All 48 positions used (shouldn't happen with 32 deck limit)
	return (prism.decks?.length || 0) + 1;
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

/**
 * Calculate which cards were removed from a deck (old cards not in new list)
 * @param {Array} oldCards - Previous card list
 * @param {Array} newCards - New card list
 * @returns {Array} Array of removed card names
 */
export function calculateRemovedCards(oldCards, newCards) {
	const newCardNames = new Set(newCards.map((c) => normalizeCardName(c.name)));
	const removedCards = [];

	for (const card of oldCards) {
		const normalizedName = normalizeCardName(card.name);
		if (!newCardNames.has(normalizedName)) {
			removedCards.push({
				name: card.name,
				normalizedName,
				isBasicLand: card.isBasicLand,
			});
		}
	}

	return removedCards;
}

/**
 * Check if a card is still used in any other deck besides the specified one
 * @param {Object} prism - The PRISM object
 * @param {string} cardName - The card name to check
 * @param {string} excludeDeckId - The deck ID to exclude from check
 * @returns {boolean} True if the card is used in another deck
 */
export function isCardInOtherDecks(prism, cardName, excludeDeckId) {
	const normalizedName = normalizeCardName(cardName);

	for (const deck of prism.decks) {
		if (deck.id === excludeDeckId) continue;

		for (const card of deck.cards) {
			if (normalizeCardName(card.name) === normalizedName) {
				return true;
			}
		}
	}

	return false;
}

// ============================================================================
// Split Group Functions
// ============================================================================

/**
 * Create a new split group
 * @param {Object} params - Split group parameters
 * @returns {Object} A new split group object
 */
export function createSplitGroup({ name, sideAPosition, sideAColor, splitStyle = 'stripes' }) {
	return {
		id: generateId(),
		name,
		sideAPosition,
		sideAColor: sideAColor.toUpperCase(),
		childDeckIds: [],
		splitStyle,
	};
}

/**
 * Split a standalone deck into N variants.
 * The original deck becomes the first child, and N-1 duplicates are created.
 * A split group is created to hold them all.
 * @param {Object} prism - The PRISM object
 * @param {string} deckId - The ID of the deck to split
 * @param {number} splitCount - Number of splits (2-8)
 * @returns {Object} Updated PRISM with split group and child decks
 */
export function splitDeck(prism, deckId, splitCount, splitStyle = 'stripes') {
	const deck = prism.decks.find((d) => d.id === deckId);
	if (!deck || deck.splitGroupId) return prism; // Can't split a deck that's already in a group

	// The original deck's position becomes the split group's Side A position
	const group = createSplitGroup({
		name: deck.name,
		sideAPosition: deck.stripePosition,
		sideAColor: deck.color,
		splitStyle,
	});

	const now = new Date().toISOString();
	const updatedDecks = [];
	const childDeckIds = [];

	for (const d of prism.decks) {
		if (d.id === deckId) {
			// Convert original deck to first split child with a Side B position
			const sideBPosition = getNextStripePosition(
				{ ...prism, splitGroups: [...(prism.splitGroups || []), group] },
				"b",
			);
			const firstChild = {
				...d,
				name: `${d.name} (1)`,
				stripePosition: sideBPosition,
				splitGroupId: group.id,
				updatedAt: now,
			};
			updatedDecks.push(firstChild);
			childDeckIds.push(firstChild.id);

			// Track used positions for subsequent children
			// Include all other decks (not the one being split) so their positions are reserved
			const otherDecks = prism.decks.filter((d) => d.id !== deckId);
			const tempPrism = {
				decks: [...otherDecks, ...updatedDecks],
				splitGroups: [...(prism.splitGroups || []), group],
			};

			// Create N-1 duplicate children
			for (let i = 2; i <= splitCount; i++) {
				const childPosition = getNextStripePosition(tempPrism, "b");
				const childColor = getNextColor(tempPrism);
				const child = createDeck({
					name: `${deck.name} (${i})`,
					commander: deck.commander,
					bracket: deck.bracket,
					color: childColor,
					stripePosition: childPosition,
					splitGroupId: group.id,
					cards: deck.cards.map((c) => ({ ...c })), // Deep copy cards
				});
				updatedDecks.push(child);
				childDeckIds.push(child.id);
				tempPrism.decks.push(child);
			}
		} else {
			updatedDecks.push(d);
		}
	}

	group.childDeckIds = childDeckIds;

	return {
		...prism,
		decks: updatedDecks,
		splitGroups: [...(prism.splitGroups || []), group],
		updatedAt: now,
	};
}

/**
 * Add a new split to an existing split group
 * @param {Object} prism - The PRISM object
 * @param {string} groupId - The split group ID
 * @returns {Object} Updated PRISM with the new split child added
 */
export function addSplitToGroup(prism, groupId) {
	const group = (prism.splitGroups || []).find((g) => g.id === groupId);
	if (!group) return prism;

	// Find an existing child to copy from (use the first one)
	const templateDeck = prism.decks.find((d) => d.id === group.childDeckIds[0]);
	if (!templateDeck) return prism;

	const now = new Date().toISOString();
	const childPosition = getNextStripePosition(prism, "b");
	const childColor = getNextColor(prism);
	const splitNumber = group.childDeckIds.length + 1;

	const newChild = createDeck({
		name: `${group.name} (${splitNumber})`,
		commander: templateDeck.commander,
		bracket: templateDeck.bracket,
		color: childColor,
		stripePosition: childPosition,
		splitGroupId: group.id,
		cards: templateDeck.cards.map((c) => ({ ...c })), // Deep copy cards
	});

	const updatedGroups = prism.splitGroups.map((g) => {
		if (g.id !== groupId) return g;
		return { ...g, childDeckIds: [...g.childDeckIds, newChild.id] };
	});

	return {
		...prism,
		decks: [...prism.decks, newChild],
		splitGroups: updatedGroups,
		updatedAt: now,
	};
}

/**
 * Unsplit a split group — merge back into a single standalone deck.
 * Uses the first child's card list and the group's Side A position/color.
 * @param {Object} prism - The PRISM object
 * @param {string} groupId - The split group ID
 * @returns {Object} Updated PRISM with the group removed and a standalone deck restored
 */
export function unsplitGroup(prism, groupId) {
	const group = (prism.splitGroups || []).find((g) => g.id === groupId);
	if (!group) return prism;

	const now = new Date().toISOString();
	const childIds = new Set(group.childDeckIds);
	const firstChild = prism.decks.find((d) => d.id === group.childDeckIds[0]);

	// Convert first child back to standalone at the group's Side A position
	const updatedDecks = prism.decks
		.filter((d) => !childIds.has(d.id) || d.id === group.childDeckIds[0])
		.map((d) => {
			if (d.id !== group.childDeckIds[0]) return d;
			return {
				...d,
				name: group.name,
				stripePosition: group.sideAPosition,
				color: group.sideAColor,
				splitGroupId: null,
				updatedAt: now,
			};
		});

	return {
		...prism,
		decks: updatedDecks,
		splitGroups: prism.splitGroups.filter((g) => g.id !== groupId),
		updatedAt: now,
	};
}

/**
 * Remove a single split child from a group.
 * If only 1 child remains, auto-unsplit the group.
 * @param {Object} prism - The PRISM object
 * @param {string} deckId - The child deck ID to remove
 * @returns {Object} Updated PRISM
 */
export function removeSplitChild(prism, deckId) {
	const deck = prism.decks.find((d) => d.id === deckId);
	if (!deck || !deck.splitGroupId) {
		// Not a split child, use normal remove
		return removeDeckFromPrism(prism, deckId);
	}

	const group = (prism.splitGroups || []).find(
		(g) => g.id === deck.splitGroupId,
	);
	if (!group) return removeDeckFromPrism(prism, deckId);

	const remainingChildIds = group.childDeckIds.filter((id) => id !== deckId);

	// If only 1 child would remain, auto-unsplit
	if (remainingChildIds.length === 1) {
		// First remove the deck, then unsplit
		const withoutDeck = {
			...prism,
			decks: prism.decks.filter((d) => d.id !== deckId),
			splitGroups: prism.splitGroups.map((g) => {
				if (g.id !== group.id) return g;
				return { ...g, childDeckIds: remainingChildIds };
			}),
		};
		return unsplitGroup(withoutDeck, group.id);
	}

	// Multiple children remain — just remove this one
	return {
		...prism,
		decks: prism.decks.filter((d) => d.id !== deckId),
		splitGroups: prism.splitGroups.map((g) => {
			if (g.id !== group.id) return g;
			return { ...g, childDeckIds: remainingChildIds };
		}),
		updatedAt: new Date().toISOString(),
	};
}

/**
 * Get the side label for a stripe position
 * @param {number} position - The stripe position
 * @returns {string} 'A' or 'B'
 */
export function getPositionSide(position) {
	return position <= 24 ? "A" : "B";
}

/**
 * Format a slot label with side information
 * @param {number} position - The stripe position
 * @param {string} side - Optional explicit side ('a' or 'b')
 * @returns {string} Formatted label like "Side A - Slot 3"
 */
export function formatSlotLabel(position, side) {
	const sideLabel = side ? side.toUpperCase() : getPositionSide(position);
	return `Side ${sideLabel} - Slot ${position}`;
}
