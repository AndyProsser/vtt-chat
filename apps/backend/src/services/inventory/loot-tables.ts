/**
 * D&D 5e SRD Loot Tables
 * Static data for /loot-random command.
 * Item lists are drawn from the D&D 5e SRD 5.1 (CC-BY 4.0).
 * Coin tables mirror the DMG Individual Treasure and Treasure Hoard tables.
 */

export type LootRarity =
  | 'mundane'
  | 'common'
  | 'uncommon'
  | 'rare'
  | 'very-rare'
  | 'legendary'
  | 'artifact'

export interface LootTableItem {
  name: string
  srdKey: string
  rarity: LootRarity
}

export const RARITY_ORDER: LootRarity[] = [
  'mundane',
  'common',
  'uncommon',
  'rare',
  'very-rare',
  'legendary',
  'artifact',
]

// ─── Mundane items (SRD equipment list) ──────────────────────────────────────

export const MUNDANE_ITEMS: LootTableItem[] = [
  // Weapons
  { name: 'Dagger', srdKey: 'dagger', rarity: 'mundane' },
  { name: 'Handaxe', srdKey: 'handaxe', rarity: 'mundane' },
  { name: 'Shortsword', srdKey: 'shortsword', rarity: 'mundane' },
  { name: 'Longsword', srdKey: 'longsword', rarity: 'mundane' },
  { name: 'Battleaxe', srdKey: 'battleaxe', rarity: 'mundane' },
  { name: 'Greataxe', srdKey: 'greataxe', rarity: 'mundane' },
  { name: 'Greatsword', srdKey: 'greatsword', rarity: 'mundane' },
  { name: 'Rapier', srdKey: 'rapier', rarity: 'mundane' },
  { name: 'Spear', srdKey: 'spear', rarity: 'mundane' },
  { name: 'Quarterstaff', srdKey: 'quarterstaff', rarity: 'mundane' },
  { name: 'Mace', srdKey: 'mace', rarity: 'mundane' },
  { name: 'Warhammer', srdKey: 'warhammer', rarity: 'mundane' },
  { name: 'Morningstar', srdKey: 'morningstar', rarity: 'mundane' },
  { name: 'Scimitar', srdKey: 'scimitar', rarity: 'mundane' },
  { name: 'Light Crossbow', srdKey: 'crossbow-light', rarity: 'mundane' },
  { name: 'Heavy Crossbow', srdKey: 'crossbow-heavy', rarity: 'mundane' },
  { name: 'Shortbow', srdKey: 'shortbow', rarity: 'mundane' },
  { name: 'Longbow', srdKey: 'longbow', rarity: 'mundane' },
  { name: 'Trident', srdKey: 'trident', rarity: 'mundane' },
  { name: 'War Pick', srdKey: 'war-pick', rarity: 'mundane' },
  { name: 'Whip', srdKey: 'whip', rarity: 'mundane' },
  { name: 'Javelin', srdKey: 'javelin', rarity: 'mundane' },
  { name: 'Lance', srdKey: 'lance', rarity: 'mundane' },
  { name: 'Flail', srdKey: 'flail', rarity: 'mundane' },
  { name: 'Sickle', srdKey: 'sickle', rarity: 'mundane' },
  { name: 'Hand Crossbow', srdKey: 'crossbow-hand', rarity: 'mundane' },
  // Armor
  { name: 'Leather Armor', srdKey: 'leather', rarity: 'mundane' },
  { name: 'Studded Leather Armor', srdKey: 'studded-leather', rarity: 'mundane' },
  { name: 'Hide Armor', srdKey: 'hide', rarity: 'mundane' },
  { name: 'Chain Shirt', srdKey: 'chain-shirt', rarity: 'mundane' },
  { name: 'Scale Mail', srdKey: 'scale-mail', rarity: 'mundane' },
  { name: 'Breastplate', srdKey: 'breastplate', rarity: 'mundane' },
  { name: 'Half Plate Armor', srdKey: 'half-plate', rarity: 'mundane' },
  { name: 'Ring Mail', srdKey: 'ring-mail', rarity: 'mundane' },
  { name: 'Chain Mail', srdKey: 'chain-mail', rarity: 'mundane' },
  { name: 'Splint Armor', srdKey: 'splint', rarity: 'mundane' },
  { name: 'Shield', srdKey: 'shield', rarity: 'mundane' },
  // Adventuring gear
  { name: 'Rope (50 ft., Hempen)', srdKey: 'rope-hempen-50-feet', rarity: 'mundane' },
  { name: 'Rope (50 ft., Silk)', srdKey: 'rope-silk-50-feet', rarity: 'mundane' },
  { name: 'Thieves\' Tools', srdKey: 'thieves-tools', rarity: 'mundane' },
  { name: 'Healer\'s Kit', srdKey: 'healers-kit', rarity: 'mundane' },
  { name: 'Climber\'s Kit', srdKey: 'climbers-kit', rarity: 'mundane' },
  { name: 'Tinderbox', srdKey: 'tinderbox', rarity: 'mundane' },
  { name: 'Crowbar', srdKey: 'crowbar', rarity: 'mundane' },
  { name: 'Grappling Hook', srdKey: 'grappling-hook', rarity: 'mundane' },
  { name: 'Hooded Lantern', srdKey: 'lantern-hooded', rarity: 'mundane' },
  { name: 'Oil Flask', srdKey: 'oil', rarity: 'mundane' },
  { name: 'Spyglass', srdKey: 'spyglass', rarity: 'mundane' },
  { name: 'Tent (Two-Person)', srdKey: 'tent-two-person', rarity: 'mundane' },
  { name: 'Pouch', srdKey: 'pouch', rarity: 'mundane' },
  { name: 'Backpack', srdKey: 'backpack', rarity: 'mundane' },
  { name: 'Compass', srdKey: 'compass', rarity: 'mundane' },
  { name: 'Arrow (20)', srdKey: 'arrows', rarity: 'mundane' },
  { name: 'Crossbow Bolt (20)', srdKey: 'crossbow-bolts', rarity: 'mundane' },
]

// ─── Common magic items (SRD 5.1) ────────────────────────────────────────────

export const COMMON_ITEMS: LootTableItem[] = [
  { name: 'Potion of Healing', srdKey: 'potion-of-healing', rarity: 'common' },
  { name: 'Potion of Climbing', srdKey: 'potion-of-climbing', rarity: 'common' },
  { name: 'Spell Scroll (Cantrip)', srdKey: 'spell-scroll-0', rarity: 'common' },
  { name: 'Spell Scroll (1st Level)', srdKey: 'spell-scroll-1', rarity: 'common' },
  { name: 'Ammunition +1', srdKey: 'ammunition-1', rarity: 'common' },
]

// ─── Uncommon magic items (SRD 5.1) ──────────────────────────────────────────

export const UNCOMMON_ITEMS: LootTableItem[] = [
  { name: 'Alchemy Jug', srdKey: 'alchemy-jug', rarity: 'uncommon' },
  { name: 'Bag of Holding', srdKey: 'bag-of-holding', rarity: 'uncommon' },
  { name: 'Boots of Elvenkind', srdKey: 'boots-of-elvenkind', rarity: 'uncommon' },
  { name: 'Boots of Striding and Springing', srdKey: 'boots-of-striding-and-springing', rarity: 'uncommon' },
  { name: 'Bracers of Archery', srdKey: 'bracers-of-archery', rarity: 'uncommon' },
  { name: 'Brooch of Shielding', srdKey: 'brooch-of-shielding', rarity: 'uncommon' },
  { name: 'Broom of Flying', srdKey: 'broom-of-flying', rarity: 'uncommon' },
  { name: 'Cloak of Elvenkind', srdKey: 'cloak-of-elvenkind', rarity: 'uncommon' },
  { name: 'Cloak of Protection', srdKey: 'cloak-of-protection', rarity: 'uncommon' },
  { name: 'Eyes of Charming', srdKey: 'eyes-of-charming', rarity: 'uncommon' },
  { name: 'Gloves of Missile Snaring', srdKey: 'gloves-of-missile-snaring', rarity: 'uncommon' },
  { name: 'Gloves of Swimming and Climbing', srdKey: 'gloves-of-swimming-and-climbing', rarity: 'uncommon' },
  { name: 'Gloves of Thievery', srdKey: 'gloves-of-thievery', rarity: 'uncommon' },
  { name: 'Hat of Disguise', srdKey: 'hat-of-disguise', rarity: 'uncommon' },
  { name: 'Headband of Intellect', srdKey: 'headband-of-intellect', rarity: 'uncommon' },
  { name: 'Helm of Telepathy', srdKey: 'helm-of-telepathy', rarity: 'uncommon' },
  { name: 'Immovable Rod', srdKey: 'immovable-rod', rarity: 'uncommon' },
  { name: 'Javelin of Lightning', srdKey: 'javelin-of-lightning', rarity: 'uncommon' },
  { name: 'Periapt of Wound Closure', srdKey: 'periapt-of-wound-closure', rarity: 'uncommon' },
  { name: 'Pipes of Haunting', srdKey: 'pipes-of-haunting', rarity: 'uncommon' },
  { name: 'Quiver of Ehlonna', srdKey: 'quiver-of-ehlonna', rarity: 'uncommon' },
  { name: 'Ring of Jumping', srdKey: 'ring-of-jumping', rarity: 'uncommon' },
  { name: 'Ring of Mind Shielding', srdKey: 'ring-of-mind-shielding', rarity: 'uncommon' },
  { name: 'Ring of Warmth', srdKey: 'ring-of-warmth', rarity: 'uncommon' },
  { name: 'Ring of Water Walking', srdKey: 'ring-of-water-walking', rarity: 'uncommon' },
  { name: 'Rope of Climbing', srdKey: 'rope-of-climbing', rarity: 'uncommon' },
  { name: 'Saddle of the Cavalier', srdKey: 'saddle-of-the-cavalier', rarity: 'uncommon' },
  { name: 'Sending Stones', srdKey: 'sending-stones', rarity: 'uncommon' },
  { name: 'Slippers of Spider Climbing', srdKey: 'slippers-of-spider-climbing', rarity: 'uncommon' },
  { name: 'Wand of Magic Detection', srdKey: 'wand-of-magic-detection', rarity: 'uncommon' },
  { name: 'Wand of Secrets', srdKey: 'wand-of-secrets', rarity: 'uncommon' },
  { name: 'Potion of Greater Healing', srdKey: 'potion-of-greater-healing', rarity: 'uncommon' },
  { name: 'Spell Scroll (2nd Level)', srdKey: 'spell-scroll-2', rarity: 'uncommon' },
  { name: 'Spell Scroll (3rd Level)', srdKey: 'spell-scroll-3', rarity: 'uncommon' },
  { name: 'Weapon +1', srdKey: 'weapon-1', rarity: 'uncommon' },
  { name: 'Ammunition +2', srdKey: 'ammunition-2', rarity: 'uncommon' },
]

// ─── Rare magic items (SRD 5.1) ──────────────────────────────────────────────

export const RARE_ITEMS: LootTableItem[] = [
  { name: 'Amulet of Health', srdKey: 'amulet-of-health', rarity: 'rare' },
  { name: 'Belt of Giant Strength (Hill)', srdKey: 'belt-of-hill-giant-strength', rarity: 'rare' },
  { name: 'Boots of Levitation', srdKey: 'boots-of-levitation', rarity: 'rare' },
  { name: 'Boots of Speed', srdKey: 'boots-of-speed', rarity: 'rare' },
  { name: 'Bracers of Defense', srdKey: 'bracers-of-defense', rarity: 'rare' },
  { name: 'Cape of the Mountebank', srdKey: 'cape-of-the-mountebank', rarity: 'rare' },
  { name: 'Carpet of Flying', srdKey: 'carpet-of-flying', rarity: 'rare' },
  { name: 'Cloak of Displacement', srdKey: 'cloak-of-displacement', rarity: 'rare' },
  { name: 'Cloak of the Bat', srdKey: 'cloak-of-the-bat', rarity: 'rare' },
  { name: 'Cube of Force', srdKey: 'cube-of-force', rarity: 'rare' },
  { name: 'Dagger of Venom', srdKey: 'dagger-of-venom', rarity: 'rare' },
  { name: 'Dragon Slayer', srdKey: 'dragon-slayer', rarity: 'rare' },
  { name: 'Elven Chain', srdKey: 'elven-chain', rarity: 'rare' },
  { name: 'Flame Tongue', srdKey: 'flame-tongue', rarity: 'rare' },
  { name: 'Gem of Seeing', srdKey: 'gem-of-seeing', rarity: 'rare' },
  { name: 'Giant Slayer', srdKey: 'giant-slayer', rarity: 'rare' },
  { name: 'Glamoured Studded Leather', srdKey: 'glamoured-studded-leather', rarity: 'rare' },
  { name: 'Helm of Teleportation', srdKey: 'helm-of-teleportation', rarity: 'rare' },
  { name: 'Mace of Disruption', srdKey: 'mace-of-disruption', rarity: 'rare' },
  { name: 'Mace of Smiting', srdKey: 'mace-of-smiting', rarity: 'rare' },
  { name: 'Necklace of Fireballs', srdKey: 'necklace-of-fireballs', rarity: 'rare' },
  { name: 'Necklace of Prayer Beads', srdKey: 'necklace-of-prayer-beads', rarity: 'rare' },
  { name: 'Periapt of Proof against Poison', srdKey: 'periapt-of-proof-against-poison', rarity: 'rare' },
  { name: 'Ring of Animal Influence', srdKey: 'ring-of-animal-influence', rarity: 'rare' },
  { name: 'Ring of Evasion', srdKey: 'ring-of-evasion', rarity: 'rare' },
  { name: 'Ring of Feather Falling', srdKey: 'ring-of-feather-falling', rarity: 'rare' },
  { name: 'Ring of Free Action', srdKey: 'ring-of-free-action', rarity: 'rare' },
  { name: 'Ring of Protection', srdKey: 'ring-of-protection', rarity: 'rare' },
  { name: 'Ring of Spell Storing', srdKey: 'ring-of-spell-storing', rarity: 'rare' },
  { name: 'Robe of Eyes', srdKey: 'robe-of-eyes', rarity: 'rare' },
  { name: 'Rod of Rulership', srdKey: 'rod-of-rulership', rarity: 'rare' },
  { name: 'Rope of Entanglement', srdKey: 'rope-of-entanglement', rarity: 'rare' },
  { name: 'Staff of Charming', srdKey: 'staff-of-charming', rarity: 'rare' },
  { name: 'Staff of Healing', srdKey: 'staff-of-healing', rarity: 'rare' },
  { name: 'Staff of the Woodlands', srdKey: 'staff-of-the-woodlands', rarity: 'rare' },
  { name: 'Sun Blade', srdKey: 'sun-blade', rarity: 'rare' },
  { name: 'Sword of Life Stealing', srdKey: 'sword-of-life-stealing', rarity: 'rare' },
  { name: 'Sword of Wounding', srdKey: 'sword-of-wounding', rarity: 'rare' },
  { name: 'Vicious Weapon', srdKey: 'vicious-weapon', rarity: 'rare' },
  { name: 'Wand of Binding', srdKey: 'wand-of-binding', rarity: 'rare' },
  { name: 'Wand of Fear', srdKey: 'wand-of-fear', rarity: 'rare' },
  { name: 'Wand of Fireballs', srdKey: 'wand-of-fireballs', rarity: 'rare' },
  { name: 'Wand of Lightning Bolts', srdKey: 'wand-of-lightning-bolts', rarity: 'rare' },
  { name: 'Wings of Flying', srdKey: 'wings-of-flying', rarity: 'rare' },
  { name: 'Potion of Superior Healing', srdKey: 'potion-of-superior-healing', rarity: 'rare' },
  { name: 'Potion of Giant Strength (Hill)', srdKey: 'potion-of-hill-giant-strength', rarity: 'rare' },
  { name: 'Spell Scroll (4th Level)', srdKey: 'spell-scroll-4', rarity: 'rare' },
  { name: 'Spell Scroll (5th Level)', srdKey: 'spell-scroll-5', rarity: 'rare' },
  { name: 'Weapon +2', srdKey: 'weapon-2', rarity: 'rare' },
  { name: 'Armor +1', srdKey: 'armor-1', rarity: 'rare' },
  { name: 'Shield +2', srdKey: 'shield-2', rarity: 'rare' },
]

// ─── Very rare magic items (SRD 5.1) ─────────────────────────────────────────

export const VERY_RARE_ITEMS: LootTableItem[] = [
  { name: 'Amulet of the Planes', srdKey: 'amulet-of-the-planes', rarity: 'very-rare' },
  { name: 'Animated Shield', srdKey: 'animated-shield', rarity: 'very-rare' },
  { name: 'Arrow of Slaying', srdKey: 'arrow-of-slaying', rarity: 'very-rare' },
  { name: 'Belt of Giant Strength (Stone)', srdKey: 'belt-of-stone-giant-strength', rarity: 'very-rare' },
  { name: 'Belt of Giant Strength (Frost)', srdKey: 'belt-of-frost-giant-strength', rarity: 'very-rare' },
  { name: 'Cloak of Arachnida', srdKey: 'cloak-of-arachnida', rarity: 'very-rare' },
  { name: 'Crystal Ball', srdKey: 'crystal-ball', rarity: 'very-rare' },
  { name: 'Dancing Sword', srdKey: 'dancing-sword', rarity: 'very-rare' },
  { name: 'Dragon Scale Mail', srdKey: 'dragon-scale-mail', rarity: 'very-rare' },
  { name: 'Dwarven Plate', srdKey: 'dwarven-plate', rarity: 'very-rare' },
  { name: 'Dwarven Thrower', srdKey: 'dwarven-thrower', rarity: 'very-rare' },
  { name: 'Efreeti Bottle', srdKey: 'efreeti-bottle', rarity: 'very-rare' },
  { name: 'Frost Brand', srdKey: 'frost-brand', rarity: 'very-rare' },
  { name: 'Helm of Brilliance', srdKey: 'helm-of-brilliance', rarity: 'very-rare' },
  { name: 'Iron Flask', srdKey: 'iron-flask', rarity: 'very-rare' },
  { name: 'Luck Blade', srdKey: 'luck-blade', rarity: 'very-rare' },
  { name: 'Mirror of Life Trapping', srdKey: 'mirror-of-life-trapping', rarity: 'very-rare' },
  { name: 'Nine Lives Stealer', srdKey: 'nine-lives-stealer', rarity: 'very-rare' },
  { name: 'Oathbow', srdKey: 'oathbow', rarity: 'very-rare' },
  { name: 'Ring of Regeneration', srdKey: 'ring-of-regeneration', rarity: 'very-rare' },
  { name: 'Ring of Shooting Stars', srdKey: 'ring-of-shooting-stars', rarity: 'very-rare' },
  { name: 'Ring of Telekinesis', srdKey: 'ring-of-telekinesis', rarity: 'very-rare' },
  { name: 'Robe of Scintillating Colors', srdKey: 'robe-of-scintillating-colors', rarity: 'very-rare' },
  { name: 'Robe of Stars', srdKey: 'robe-of-stars', rarity: 'very-rare' },
  { name: 'Rod of Absorption', srdKey: 'rod-of-absorption', rarity: 'very-rare' },
  { name: 'Rod of Alertness', srdKey: 'rod-of-alertness', rarity: 'very-rare' },
  { name: 'Staff of Fire', srdKey: 'staff-of-fire', rarity: 'very-rare' },
  { name: 'Staff of Frost', srdKey: 'staff-of-frost', rarity: 'very-rare' },
  { name: 'Staff of Power', srdKey: 'staff-of-power', rarity: 'very-rare' },
  { name: 'Staff of Thunder and Lightning', srdKey: 'staff-of-thunder-and-lightning', rarity: 'very-rare' },
  { name: 'Sword of Sharpness', srdKey: 'sword-of-sharpness', rarity: 'very-rare' },
  { name: 'Tome of Clear Thought', srdKey: 'tome-of-clear-thought', rarity: 'very-rare' },
  { name: 'Tome of Leadership and Influence', srdKey: 'tome-of-leadership-and-influence', rarity: 'very-rare' },
  { name: 'Tome of Understanding', srdKey: 'tome-of-understanding', rarity: 'very-rare' },
  { name: 'Potion of Supreme Healing', srdKey: 'potion-of-supreme-healing', rarity: 'very-rare' },
  { name: 'Spell Scroll (6th Level)', srdKey: 'spell-scroll-6', rarity: 'very-rare' },
  { name: 'Spell Scroll (7th Level)', srdKey: 'spell-scroll-7', rarity: 'very-rare' },
  { name: 'Weapon +3', srdKey: 'weapon-3', rarity: 'very-rare' },
  { name: 'Armor +2', srdKey: 'armor-2', rarity: 'very-rare' },
  { name: 'Shield +3', srdKey: 'shield-3', rarity: 'very-rare' },
]

// ─── Legendary magic items (SRD 5.1) ─────────────────────────────────────────

export const LEGENDARY_ITEMS: LootTableItem[] = [
  { name: 'Armor of Invulnerability', srdKey: 'armor-of-invulnerability', rarity: 'legendary' },
  { name: 'Belt of Giant Strength (Cloud)', srdKey: 'belt-of-cloud-giant-strength', rarity: 'legendary' },
  { name: 'Belt of Giant Strength (Storm)', srdKey: 'belt-of-storm-giant-strength', rarity: 'legendary' },
  { name: 'Cloak of Invisibility', srdKey: 'cloak-of-invisibility', rarity: 'legendary' },
  { name: 'Cubic Gate', srdKey: 'cubic-gate', rarity: 'legendary' },
  { name: 'Deck of Many Things', srdKey: 'deck-of-many-things', rarity: 'legendary' },
  { name: 'Defender', srdKey: 'defender', rarity: 'legendary' },
  { name: 'Holy Avenger', srdKey: 'holy-avenger', rarity: 'legendary' },
  { name: 'Plate Armor of Etherealness', srdKey: 'plate-armor-of-etherealness', rarity: 'legendary' },
  { name: 'Ring of Djinni Summoning', srdKey: 'ring-of-djinni-summoning', rarity: 'legendary' },
  { name: 'Ring of Elemental Command', srdKey: 'ring-of-elemental-command', rarity: 'legendary' },
  { name: 'Ring of Invisibility', srdKey: 'ring-of-invisibility', rarity: 'legendary' },
  { name: 'Ring of Spell Turning', srdKey: 'ring-of-spell-turning', rarity: 'legendary' },
  { name: 'Ring of Three Wishes', srdKey: 'ring-of-three-wishes', rarity: 'legendary' },
  { name: 'Robe of the Archmagi', srdKey: 'robe-of-the-archmagi', rarity: 'legendary' },
  { name: 'Rod of Lordly Might', srdKey: 'rod-of-lordly-might', rarity: 'legendary' },
  { name: 'Scarab of Protection', srdKey: 'scarab-of-protection', rarity: 'legendary' },
  { name: 'Sphere of Annihilation', srdKey: 'sphere-of-annihilation', rarity: 'legendary' },
  { name: 'Staff of the Magi', srdKey: 'staff-of-the-magi', rarity: 'legendary' },
  { name: 'Talisman of Pure Good', srdKey: 'talisman-of-pure-good', rarity: 'legendary' },
  { name: 'Talisman of Ultimate Evil', srdKey: 'talisman-of-ultimate-evil', rarity: 'legendary' },
  { name: 'Vorpal Sword', srdKey: 'vorpal-sword', rarity: 'legendary' },
  { name: 'Well of Many Worlds', srdKey: 'well-of-many-worlds', rarity: 'legendary' },
  { name: 'Spell Scroll (8th Level)', srdKey: 'spell-scroll-8', rarity: 'legendary' },
  { name: 'Spell Scroll (9th Level)', srdKey: 'spell-scroll-9', rarity: 'legendary' },
  { name: 'Armor +3', srdKey: 'armor-3', rarity: 'legendary' },
]

// ─── Artifact items (SRD 5.1) ────────────────────────────────────────────────

export const ARTIFACT_ITEMS: LootTableItem[] = [
  { name: 'Eye of Vecna', srdKey: 'eye-of-vecna', rarity: 'artifact' },
  { name: 'Hand of Vecna', srdKey: 'hand-of-vecna', rarity: 'artifact' },
  { name: 'Orb of Dragonkind', srdKey: 'orb-of-dragonkind', rarity: 'artifact' },
  { name: 'Axe of the Dwarvish Lords', srdKey: 'axe-of-the-dwarvish-lords', rarity: 'artifact' },
  { name: 'Book of Exalted Deeds', srdKey: 'book-of-exalted-deeds', rarity: 'artifact' },
  { name: 'Book of Vile Darkness', srdKey: 'book-of-vile-darkness', rarity: 'artifact' },
  { name: 'Crystal Ball of True Clairvoyance', srdKey: 'crystal-ball-true-clairvoyance', rarity: 'artifact' },
]

export const ALL_ITEMS_BY_RARITY: Record<LootRarity, LootTableItem[]> = {
  mundane: MUNDANE_ITEMS,
  common: COMMON_ITEMS,
  uncommon: UNCOMMON_ITEMS,
  rare: RARE_ITEMS,
  'very-rare': VERY_RARE_ITEMS,
  legendary: LEGENDARY_ITEMS,
  artifact: ARTIFACT_ITEMS,
}

// ─── DMG Individual Treasure Table (per monster CR band) ─────────────────────
// Each row: { roll: [min, max], cp, sp, ep, gp, pp }
// All multiplied per roll — roll d100 to select the row.

export type DmgCoinRow = { roll: [number, number]; cp: number; sp: number; ep: number; gp: number; pp: number }

/** Returns the DMG individual treasure coin result for a given CR and d100 roll. */
export function resolveIndividualTreasureCoin(cr: number, d100: number, rollFn: (sides: number) => number): { cp: number; sp: number; ep: number; gp: number; pp: number } {
  if (cr <= 4) {
    if (d100 <= 30) return { cp: roll(6, 5, rollFn), sp: 0, ep: 0, gp: 0, pp: 0 }
    if (d100 <= 60) return { cp: 0, sp: roll(6, 4, rollFn), ep: 0, gp: 0, pp: 0 }
    if (d100 <= 70) return { cp: 0, sp: 0, ep: roll(6, 3, rollFn), gp: 0, pp: 0 }
    if (d100 <= 95) return { cp: 0, sp: 0, ep: 0, gp: roll(6, 3, rollFn), pp: 0 }
    return { cp: 0, sp: 0, ep: 0, gp: 0, pp: roll(6, 1, rollFn) }
  }
  if (cr <= 10) {
    if (d100 <= 30) return { cp: roll(6, 4, rollFn) * 100, sp: 0, ep: roll(6, 1, rollFn) * 10, gp: 0, pp: 0 }
    if (d100 <= 60) return { cp: 0, sp: roll(6, 6, rollFn) * 10, ep: 0, gp: roll(6, 2, rollFn) * 10, pp: 0 }
    if (d100 <= 70) return { cp: 0, sp: 0, ep: roll(6, 3, rollFn) * 10, gp: roll(6, 2, rollFn) * 10, pp: 0 }
    if (d100 <= 95) return { cp: 0, sp: 0, ep: 0, gp: roll(6, 4, rollFn) * 10, pp: 0 }
    return { cp: 0, sp: 0, ep: 0, gp: roll(6, 2, rollFn) * 10, pp: roll(6, 3, rollFn) }
  }
  if (cr <= 16) {
    if (d100 <= 20) return { cp: 0, sp: roll(6, 4, rollFn) * 100, ep: roll(6, 1, rollFn) * 100, gp: 0, pp: 0 }
    if (d100 <= 35) return { cp: 0, sp: 0, ep: roll(6, 1, rollFn) * 100, gp: roll(6, 1, rollFn) * 100, pp: 0 }
    if (d100 <= 75) return { cp: 0, sp: 0, ep: 0, gp: roll(6, 2, rollFn) * 100, pp: roll(6, 1, rollFn) * 10 }
    return { cp: 0, sp: 0, ep: 0, gp: roll(6, 2, rollFn) * 100, pp: roll(6, 2, rollFn) * 10 }
  }
  // CR 17+
  if (d100 <= 15) return { cp: 0, sp: 0, ep: roll(6, 2, rollFn) * 1000, gp: roll(6, 8, rollFn) * 100, pp: 0 }
  if (d100 <= 55) return { cp: 0, sp: 0, ep: 0, gp: roll(6, 1, rollFn) * 1000, pp: roll(6, 1, rollFn) * 100 }
  return { cp: 0, sp: 0, ep: 0, gp: roll(6, 1, rollFn) * 1000, pp: roll(6, 2, rollFn) * 100 }
}

/** DMG Treasure Hoard coins for a CR band (single combined roll). */
export function resolveHoardTreasureCoin(cr: number, rollFn: (sides: number) => number): { cp: number; sp: number; ep: number; gp: number; pp: number } {
  if (cr <= 4) {
    return { cp: roll(6, 6, rollFn) * 100, sp: roll(6, 3, rollFn) * 100, ep: 0, gp: roll(6, 2, rollFn) * 10, pp: 0 }
  }
  if (cr <= 10) {
    return { cp: roll(6, 2, rollFn) * 100, sp: roll(6, 2, rollFn) * 1000, ep: 0, gp: roll(6, 6, rollFn) * 100, pp: roll(6, 3, rollFn) * 10 }
  }
  if (cr <= 16) {
    return { cp: 0, sp: 0, ep: roll(6, 4, rollFn) * 1000, gp: roll(6, 4, rollFn) * 1000, pp: roll(6, 3, rollFn) * 100 }
  }
  // CR 17+
  return { cp: 0, sp: 0, ep: 0, gp: roll(6, 12, rollFn) * 1000, pp: roll(6, 8, rollFn) * 1000 }
}

function roll(sides: number, count: number, rollFn: (sides: number) => number): number {
  let total = 0
  for (let i = 0; i < count; i++) total += rollFn(sides)
  return total
}
