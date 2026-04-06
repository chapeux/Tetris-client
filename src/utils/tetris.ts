export type Tetromino = {
  shape: (number | string)[][];
  color: string;
};

export const TETROMINOES: { [key: string]: Tetromino } = {
  0: { shape: [[0]], color: "transparent" },
  1: { shape: [[1]], color: "#ff0000" }, // garbage block
  I: {
    shape: [
      [0, "I", 0, 0],
      [0, "I", 0, 0],
      [0, "I", 0, 0],
      [0, "I", 0, 0]
    ],
    color: "#0ea5e9", // cyan/sky blue
  },
  J: {
    shape: [
      [0, "J", 0],
      [0, "J", 0],
      ["J", "J", 0]
    ],
    color: "#3b82f6", // blue
  },
  L: {
    shape: [
      [0, "L", 0],
      [0, "L", 0],
      [0, "L", "L"]
    ],
    color: "#f97316", // orange
  },
  O: {
    shape: [
      ["O", "O"],
      ["O", "O"]
    ],
    color: "#eab308", // yellow
  },
  S: {
    shape: [
      [0, "S", "S"],
      ["S", "S", 0],
      [0, 0, 0]
    ],
    color: "#22c55e", // green
  },
  T: {
    shape: [
      [0, 0, 0],
      ["T", "T", "T"],
      [0, "T", 0]
    ],
    color: "#a855f7", // purple
  },
  Z: {
    shape: [
      ["Z", "Z", 0],
      [0, "Z", "Z"],
      [0, 0, 0]
    ],
    color: "#ef4444", // red
  },
  C: {
    shape: [
      ["C", "C", "C", "C"],
      ["C", "C", "C", "C"],
      ["C", "C", "C", "C"],
      ["C", "C", "C", "C"]
    ],
    color: "#57534e", // concrete gray
  },
  W: { // Wildcard 1x1 block
    shape: [['W']],
    color: '#ffffff', // bright wildcard white
  }
};
export const randomTetromino = () => {
  const tetrominos = "IJLOSTZ";
  const randTetromino =
    tetrominos[Math.floor(Math.random() * tetrominos.length)];
  return TETROMINOES[randTetromino];
};

export const createBoard = (width = 10, height = 20) =>
  Array.from(Array(height), () =>
    new Array(width).fill([0, "clear"])
  );

export const checkCollision = (
  player: any,
  board: any,
  { x: moveX, y: moveY }: { x: number; y: number }
) => {
  for (let y = 0; y < player.tetromino.length; y += 1) {
    for (let x = 0; x < player.tetromino[y].length; x += 1) {
      // 1. Check that we're on an actual Tetromino cell
      if (player.tetromino[y][x] !== 0) {
        if (
          // 2. Check that our move is inside the game areas height (y)
          // We shouldn't go through the bottom of the play area
          !board[y + player.pos.y + moveY] ||
          // 3. Check that our move is inside the game areas width (x)
          !board[y + player.pos.y + moveY][x + player.pos.x + moveX] ||
          // 4. Check that the cell we're moving to isn't set to clear
          board[y + player.pos.y + moveY][x + player.pos.x + moveX][1] !== "clear"
        ) {
          return true;
        }
      }
    }
  }
  return false;
};
