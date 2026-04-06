import { useState, useEffect, useCallback, useRef } from 'react';
import { createBoard, randomTetromino, checkCollision, TETROMINOES } from '../utils/tetris';

export const useTetris = (socket: any, isPlaying: boolean, isPaused: boolean, baseSpeed: number) => {
  const [player, setPlayer] = useState<any>({
    pos: { x: 0, y: 0 },
    tetromino: TETROMINOES[0].shape,
    collided: false,
  });

  const [stage, setStage] = useState(createBoard());
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const lastScoreRef = useRef(0);

  // Auto-clear 2 garbage lines every 200 points
  useEffect(() => {
    const scoreDiff = score - lastScoreRef.current;
    if (scoreDiff >= 200) {
      setStage(prev => {
        const newStage = [...prev];
        let cleared = 0;
        // Remove up to 2 'G' rows from the bottom
        for (let i = newStage.length - 1; i >= 0 && cleared < 2; i--) {
          if (newStage[i].some(cell => cell[0] === 'G')) {
            newStage.splice(i, 1);
            newStage.unshift(new Array(10).fill([0, 'clear']));
            cleared++;
            i++; // check same index again as it shifted
          }
        }
        return newStage;
      });
      lastScoreRef.current = score - (score % 200);
    }
  }, [score]);

  // Power states
  const [nextIsConcrete, setNextIsConcrete] = useState(false);
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);

  const resetPlayer = useCallback((forceConcrete = false) => {
    setPlayer({
      pos: { x: 10 / 2 - 2, y: 0 },
      tetromino: forceConcrete ? TETROMINOES['C'].shape : randomTetromino().shape,
      collided: false,
    });
  }, []);

  const activateSingleSwap = () => {
    resetPlayer(); // Spawn new randomly
  };

  const activateWildcard = () => {
    setPlayer((prev: any) => ({
      ...prev,
      tetromino: TETROMINOES['W'].shape,
      // Adjust position if it was out of bounds for 1x1 somehow, but usually fine
    }));
  };

  const activateSonicBoom = () => {
    setStage(prev => {
      const newStage = [...prev];
      newStage.splice(newStage.length - 2, 2);
      newStage.unshift(new Array(10).fill([0, 'clear']), new Array(10).fill([0, 'clear']));
      return newStage;
    });
  };

  const sweepRows = (newStage: any[][]) => {
    let rowsCleared = 0;
    const finalStage = newStage.reduce((ack, row) => {
      if (row.findIndex((cell: any) => cell[0] === 0 || cell[0] === 'G') === -1) {
        rowsCleared += 1;
        ack.unshift(new Array(newStage[0].length).fill([0, 'clear']));
        return ack;
      }
      ack.push(row);
      return ack;
    }, [] as any[][]);

    if(rowsCleared > 0) {
      setScore(prev => prev + rowsCleared * 100);
      setLevel(prev => prev + 1);
      setDropTime(baseSpeed / (level + 1) + 200);
      socket?.emit('score_lines', rowsCleared);
    }
    return finalStage;
  };

  const updatePlayerPos = ({ x, y, collided }: { x: number; y: number; collided: boolean }) => {
    setPlayer((prev: any) => ({
      ...prev,
      pos: { x: prev.pos.x + x, y: prev.pos.y + y },
      collided,
    }));
  };

  useEffect(() => {
    if (!isPlaying) return;
    setStage(prev => {
      const newStage = prev.map(row => row.map(cell => (cell[1] === 'clear' ? [0, 'clear'] : cell)));

      player.tetromino.forEach((row: any[], y: number) => {
        row.forEach((value: any, x: number) => {
          if (value !== 0) {
            newStage[y + player.pos.y][x + player.pos.x] = [value, `${player.collided ? 'merged' : 'clear'}`];
          }
        });
      });

      if (player.collided) {
        if (nextIsConcrete) {
          resetPlayer(true);
          setNextIsConcrete(false); // consume
        } else {
          resetPlayer();
        }
        return sweepRows(newStage);
      }
      return newStage;
    });
  }, [player, resetPlayer, isPlaying, nextIsConcrete]);

  const drop = () => {
    if (isPaused) return;
    if (!checkCollision(player, stage, { x: 0, y: 1 })) {
      updatePlayerPos({ x: 0, y: 1, collided: false });
    } else {
      if (player.pos.y < 1) {
        setGameOver(true);
        setDropTime(null);
        socket?.emit('game_over');
      }
      updatePlayerPos({ x: 0, y: 0, collided: true });
    }
  };

  const dropRef = useRef(drop);
  useEffect(() => {
    dropRef.current = drop;
  }, [drop]);

  useEffect(() => {
    if (!dropTime || isPaused) return;
    const interval = setInterval(() => { dropRef.current(); }, dropTime);
    return () => clearInterval(interval);
  }, [dropTime, isPaused]);

  const startGame = () => {
    setStage(createBoard());
    setDropTime(baseSpeed / (level + 1) + 200);
    resetPlayer();
    setGameOver(false);
    setScore(0);
    setLevel(0);
    lastScoreRef.current = 0;
    setNextIsConcrete(false);
  };

  const movePlayer = (dir: number) => {
    if (!checkCollision(player, stage, { x: dir, y: 0 })) updatePlayerPos({ x: dir, y: 0, collided: false });
  };

  const playerRotate = (stage: any[][], dir: number) => {
    if (player.tetromino.length === 1 && player.tetromino[0].length === 1) return; // Don't rotate 1x1

    const clonedPlayer = JSON.parse(JSON.stringify(player));
    clonedPlayer.tetromino = clonedPlayer.tetromino[0].map((_: any, index: number) =>
      clonedPlayer.tetromino.map((column: any[]) => column[index])
    );
    if (dir > 0) clonedPlayer.tetromino.forEach((row: any[]) => row.reverse());
    else clonedPlayer.tetromino.reverse();

    const pos = clonedPlayer.pos.x;
    let offset = 1;
    while (checkCollision(clonedPlayer, stage, { x: 0, y: 0 })) {
      clonedPlayer.pos.x += offset;
      offset = -(offset + (offset > 0 ? 1 : -1));
      if (offset > clonedPlayer.tetromino[0].length) {
        clonedPlayer.pos.x = pos;
        return;
      }
    }
    setPlayer(clonedPlayer);
  };

  const dropPlayer = () => {
    setDropTime(null);
    dropRef.current();
  };

  useEffect(() => {
    if (!socket) return;
    const handleGarbage = ({ lines }: { lines: number }) => {
      setStage(prev => {
        const newStage = [...prev];
        for(let i=0; i<lines; i++) {
          newStage.shift();
          const holeIdx = Math.floor(Math.random() * 10);
          const garbRow = new Array(10).fill(['G', 'merged']);
          garbRow[holeIdx] = [0, 'clear'];
          newStage.push(garbRow);
        }
        return newStage;
      });
    };
    socket.on('receive_garbage', handleGarbage);
    return () => { socket.off('receive_garbage', handleGarbage); };
  }, [socket]);

  return { 
    stage, movePlayer, playerRotate, dropPlayer, 
    setDropTime, startGame, gameOver, score, level, setScore,
    activateSingleSwap, activateSonicBoom, activateWildcard, setNextIsConcrete, player
  };
};
