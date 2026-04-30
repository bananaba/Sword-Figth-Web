export interface CreditEntry {
  category: string;
  files: string;
  source: string;
  author: string;
  license: string;
  url?: string;
}

export const AUDIO_CREDITS: CreditEntry[] = [
  {
    category: "BGM",
    files: "bgm_title / bgm_match / bgm_victory / bgm_defeat",
    source: "Tallbeard Studios — FREE Music Loop Bundle",
    author: "Abstraction Music + Tallbeard Studios",
    license: "CC0 1.0 Universal",
    url: "https://tallbeard.itch.io/music-loop-bundle",
  },
  {
    category: "Arena ambient",
    files: "ambient_chamber",
    source: "Freesound.org",
    author: "—",
    license: "CC0 / CC-BY (see raw file metadata)",
    url: "https://freesound.org/",
  },
  {
    category: "Round bell",
    files: "bell_round_start",
    source: "Pixabay Sound Effects",
    author: "—",
    license: "Pixabay License",
    url: "https://pixabay.com/sound-effects/",
  },
  {
    category: "Pit impale / KO",
    files: "pit_impale",
    source: "Pixabay Sound Effects",
    author: "—",
    license: "Pixabay License",
    url: "https://pixabay.com/sound-effects/",
  },
  {
    category: "Block (sword vs sword)",
    files: "block_a · block_b",
    source: "344 Audio — Historical Weapons Vol. 2 (Sonniss GDC 2026)",
    author: "344 Audio",
    license: "Sonniss GDC bundle — royalty-free, no attribution required",
    url: "https://sonniss.com/gdc-bundle-license/",
  },
  {
    category: "Pierce impact",
    files: "pierce",
    source: "David Dumais Audio — Melee Weapons Pack 2 (Sonniss GDC 2026)",
    author: "David Dumais",
    license: "Sonniss GDC bundle — royalty-free, no attribution required",
    url: "https://sonniss.com/gdc-bundle-license/",
  },
  {
    category: "Hit impact (cinematic)",
    files: "hit_a",
    source: "David Dumais Audio — Melee Weapons Pack 2 (Sonniss GDC 2026)",
    author: "David Dumais",
    license: "Sonniss GDC bundle — royalty-free, no attribution required",
    url: "https://sonniss.com/gdc-bundle-license/",
  },
  {
    category: "Hit impact (cinematic)",
    files: "hit_b",
    source: "344 Audio — Cinematic Fight Vol. 1 (Sonniss GDC 2026)",
    author: "344 Audio",
    license: "Sonniss GDC bundle — royalty-free, no attribution required",
    url: "https://sonniss.com/gdc-bundle-license/",
  },
  {
    category: "Saber swings (cinematic)",
    files: "saber_swing_a · saber_swing_b · saber_swing_c",
    source:
      "David Dumais Audio — Melee Weapons Pack 2 / Epic Stock Media — Tower Defense Game (Sonniss GDC 2026)",
    author: "David Dumais · Epic Stock Media",
    license: "Sonniss GDC bundle — royalty-free, no attribution required",
    url: "https://sonniss.com/gdc-bundle-license/",
  },
  {
    category: "Windup · counter-open",
    files: "windup · counter_open",
    source: "Kenney — Sci-fi Sounds",
    author: "Kenney",
    license: "CC0 1.0 Universal",
    url: "https://kenney.nl/assets/sci-fi-sounds",
  },
  {
    category: "Footsteps",
    files: "footstep_a · footstep_b · footstep_c",
    source: "Kenney — Impact Sounds",
    author: "Kenney",
    license: "CC0 1.0 Universal",
    url: "https://kenney.nl/assets/impact-sounds",
  },
  {
    category: "UI / countdown",
    files:
      "ui_hover · ui_click · ui_back · ui_match_found · countdown_beep",
    source: "Kenney — UI Audio",
    author: "Kenney",
    license: "CC0 1.0 Universal",
    url: "https://kenney.nl/assets/ui-audio",
  },
];
