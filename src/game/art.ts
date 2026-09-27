// Original pixel art for Bun Barrage. Every sprite here was drawn for this
// project: a steamed bun ("Bao") and a rice ball ("Nori"). No third-party art.
//
// Legend: '.' transparent, '#' outline 15, 'o' body 11, '-' pleat 4,
// 'n' seaweed 2, 'x' hole (opaque black), 'b' blush 4.

export const PIXEL: Record<string, number> = {
  '#': 15,
  'o': 11,
  '-': 4,
  'n': 2,
  'x': 0,
  'b': 4,
}

// Squat steamed bun: flat dome with pleats meeting in a knot. 17 x 15.
export const BAO = [
  '.................',
  '.................',
  '.................',
  '......#####......',
  '....##-o#o-##....',
  '...#o-oo#oo-o#...',
  '..#oo-oo#oo-oo#..',
  '.#ooooooooooooo#.',
  '#ooooooooooooooo#',
  '#ooooooooooooooo#',
  '#ooooooooooooooo#',
  '#ooooooooooooooo#',
  '#ooooooooooooooo#',
  '.#ooooooooooooo#.',
  '..#############..',
]

// Rice ball wrapped in a strip of seaweed. 17 x 15.
export const NORI = [
  '.......###.......',
  '......#ooo#......',
  '.....#ooooo#.....',
  '....#ooooooo#....',
  '...#ooooooooo#...',
  '..#ooooooooooo#..',
  '.#ooooooooooooo#.',
  '#ooooooooooooooo#',
  '#ooooooooooooooo#',
  '#ooooooooooooooo#',
  '#oooonnnnnnnoooo#',
  '#oooonnnnnnnoooo#',
  '#oooonnnnnnnoooo#',
  '.#ooonnnnnnnooo#.',
  '..#############..',
]

// Face anchor points in sprite coordinates (eyes are 2px tall).
export const FACE = {
  bao: { eyeY: 9, eyeL: 5, eyeR: 11, mouthY: 11, blushY: 11 },
  nori: { eyeY: 7, eyeL: 6, eyeR: 10, mouthY: 9, blushY: 9 },
} as const

export const HEART = [
  '.##.##.',
  '#######',
  '#######',
  '.#####.',
  '..###..',
  '...#...',
]

export const HEART_EMPTY = [
  '.##.##.',
  '#..#..#',
  '#.....#',
  '.#...#.',
  '..#.#..',
  '...#...',
]

// 3x5 pixel font, rows top to bottom.
const G: Record<string, string> = {
  'A': '.#. #.# ### #.# #.#',
  'B': '##. #.# ##. #.# ##.',
  'C': '.## #.. #.. #.. .##',
  'D': '##. #.# #.# #.# ##.',
  'E': '### #.. ##. #.. ###',
  'F': '### #.. ##. #.. #..',
  'G': '.## #.. #.# #.# .##',
  'H': '#.# #.# ### #.# #.#',
  'I': '### .#. .#. .#. ###',
  'J': '..# ..# ..# #.# .#.',
  'K': '#.# #.# ##. #.# #.#',
  'L': '#.. #.. #.. #.. ###',
  'M': '#.# ### ### #.# #.#',
  'N': '##. #.# #.# #.# #.#',
  'O': '.#. #.# #.# #.# .#.',
  'P': '##. #.# ##. #.. #..',
  'Q': '.#. #.# #.# ##. .##',
  'R': '##. #.# ##. #.# #.#',
  'S': '.## #.. .#. ..# ##.',
  'T': '### .#. .#. .#. .#.',
  'U': '#.# #.# #.# #.# ###',
  'V': '#.# #.# #.# #.# .#.',
  'W': '#.# #.# ### ### #.#',
  'X': '#.# #.# .#. #.# #.#',
  'Y': '#.# #.# .#. .#. .#.',
  'Z': '### ..# .#. #.. ###',
  '0': '### #.# #.# #.# ###',
  '1': '.#. ##. .#. .#. ###',
  '2': '##. ..# .#. #.. ###',
  '3': '##. ..# .#. ..# ##.',
  '4': '#.# #.# ### ..# ..#',
  '5': '### #.. ##. ..# ##.',
  '6': '.## #.. ### #.# ###',
  '7': '### ..# .#. .#. .#.',
  '8': '### #.# ### #.# ###',
  '9': '### #.# ### ..# ##.',
  ' ': '... ... ... ... ...',
  '-': '... ... ### ... ...',
  '+': '... .#. ### .#. ...',
  ':': '... .#. ... .#. ...',
  '.': '... ... ... ... .#.',
  '!': '.#. .#. .#. ... .#.',
  '?': '##. ..# .#. ... .#.',
  '/': '..# ..# .#. #.. #..',
  '<': '..# .#. #.. .#. ..#',
  '>': '#.. .#. ..# .#. #..',
  "'": '.#. .#. ... ... ...',
  '(': '.#. #.. #.. #.. .#.',
  ')': '.#. ..# ..# ..# .#.',
  '=': '... ### ... ### ...',
  '°': '.#. #.# .#. ... ...',
  '*': '... #.# .#. #.# ...',
  '%': '#.. ..# .#. #.. ..#',
}

export const FONT: Record<string, number[][]> = {}
for (const [ch, rows] of Object.entries(G)) {
  FONT[ch] = rows.split(' ').map((r) => [...r].map((c) => (c === '#' ? 1 : 0)))
}
