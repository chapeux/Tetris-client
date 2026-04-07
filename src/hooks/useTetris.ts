import { useState, useEffect, useCallback, useRef } from 'react';
import { createBoard, randomTetromino, checkCollision, TETROMINOES } from '../utils/tetris';

export const useTetris = (socket: any, isPlaying: boolean, isPaused: boolean, baseSpeed: number) => {
  const [player, setPlayer] = useState<any>({
    pos: { x: 0, y: 0 },
    tetromino: TETROMINOES[0].shape,
    collided: false,
  });

  const [nextTetromino, setNextTetromino] = useState(randomTetromino());
  const [stage, setStage] = useState(createBoard());
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(0);
  const lastScoreRef = useRef(0);

  // Status effects
  const [isFrozen, setIsFrozen] = useState(false);
  const [frozenPiecesLeft, setFrozenPiecesLeft] = useState(0); // frozen lasts N pieces
  const [isCurseActive, setIsCurseActive] = useState(false);
  const [cursePiecesLeft, setCursePiecesLeft] = useState(0); // curse lasts N pieces
  const [isStickyActive, setIsStickyActive] = useState(false);
  const [stickyPiecesLeft, setStickyPiecesLeft] = useState(0);
  const [isMetamorphActive, setIsMetamorphActive] = useState(false);
  const [isBouncyActive, setIsBouncyActive] = useState(false);
  const [windDirection, setWindDirection] = useState(0); // -1 left, 0 none, 1 right
  const [pointRainLeft, setPointRainLeft] = useState(0); // 1x1 pieces left

  // Power states
  const [nextIsConcrete, setNextIsConcrete] = useState(false);
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);

  // Auto-clear 2 garbage lines every 200 points
  useEffect(() => {
    const scoreDiff = score - lastScoreRef.current;
    if (scoreDiff >= 200) {
      setStage(prev => {
        const newStage = [...prev];
        let cleared = 0;
        for (let i = newStage.length - 1; i >= 0 && cleared < 2; i--) {
          if (newStage[i].some(cell => cell[0] === 'G')) {
            newStage.splice(i, 1);
            newStage.unshift(new Array(10).fill([0, 'clear']));
            cleared++;
            i++; 
          }
        }
        return newStage;
      });
      lastScoreRef.current = score - (score % 200);
    }
  }, [score]);

  const resetPlayer = useCallback((forceConcrete = false) => {
    // Point Rain: force 1x1 pieces
    if (pointRainLeft > 0 && !forceConcrete) {
      setPlayer({
        pos: { x: 10 / 2 - 1, y: 0 },
        tetromino: TETROMINOES['W'].shape,
        collided: false,
      });
      setPointRainLeft(prev => prev - 1);
      setNextTetromino(randomTetromino());
      return;
    }

    let nextPiece = nextTetromino;
    
    // Tetris Curse: only Z pieces for next N pieces
    if ((isCurseActive || cursePiecesLeft > 0) && !forceConcrete) {
      nextPiece = TETROMINOES['Z'];
      if (cursePiecesLeft > 0) setCursePiecesLeft(prev => prev - 1);
    }

    // Frozen: count down pieces
    if (frozenPiecesLeft > 0) {
      setFrozenPiecesLeft(prev => prev - 1);
      if (frozenPiecesLeft <= 1) setIsFrozen(false);
    }

    // Sticky: count down pieces
    if (stickyPiecesLeft > 0) {
      setStickyPiecesLeft(prev => prev - 1);
      if (stickyPiecesLeft <= 1) setIsStickyActive(false);
    }

    setPlayer({
      pos: { x: 10 / 2 - 2, y: 0 },
      tetromino: forceConcrete ? TETROMINOES['C'].shape : nextPiece.shape,
      collided: false,
    });

    setNextTetromino(randomTetromino());
  }, [nextTetromino, isCurseActive, cursePiecesLeft, frozenPiecesLeft, stickyPiecesLeft, pointRainLeft]);

  const activateSingleSwap = () => {
    resetPlayer(); 
  };

  const activateWildcard = () => {
    setPlayer((prev: any) => ({
      ...prev,
      tetromino: TETROMINOES['W'].shape,
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

  const clearTwoLinesManually = () => {
    setStage(prev => {
        const newStage = [...prev];
        newStage.splice(newStage.length - 2, 2);
        newStage.unshift(new Array(10).fill([0, 'clear']), new Array(10).fill([0, 'clear']));
        return newStage;
    });
  };

  const activatePointRain = () => {
    setPointRainLeft(3 + Math.floor(Math.random() * 3)); // 3-5 pieces
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

  // Metamorph: when piece crosses midpoint, transform it
  useEffect(() => {
    if (!isMetamorphActive) return;
    if (player.pos.y >= 10 && !player.collided) { // halfway
      const newPiece = randomTetromino();
      setPlayer((prev: any) => ({
        ...prev,
        tetromino: newPiece.shape,
      }));
      setIsMetamorphActive(false);
    }
  }, [player.pos.y, isMetamorphActive, player.collided]);

  // Wind effect: push piece sideways periodically
  useEffect(() => {
    if (windDirection === 0 || !isPlaying || isPaused) return;
    const interval = setInterval(() => {
      if (!checkCollision(player, stage, { x: windDirection, y: 0 })) {
        updatePlayerPos({ x: windDirection, y: 0, collided: false });
      }
    }, 400);
    return () => clearInterval(interval);
  }, [windDirection, isPlaying, isPaused, player, stage]);

  useEffect(() => {
    if (!isPlaying) return;
    setStage(prev => {
      const newStage = prev.map(row => row.map(cell => (cell[1] === 'clear' ? [0, 'clear'] : cell)));

      player.tetromino.forEach((row: any[], y: number) => {
        row.forEach((value: any, x: number) => {
          if (value !== 0) {
            if(newStage[y + player.pos.y] && newStage[y + player.pos.y][x + player.pos.x]) {
                newStage[y + player.pos.y][x + player.pos.x] = [value, `${player.collided ? 'merged' : 'clear'}`];
            }
          }
        });
      });

      if (player.collided) {
        // Bouncy: piece jumps up before locking
        if (isBouncyActive) {
          setIsBouncyActive(false);
          // Don't actually collide - bounce up 2 rows
          setPlayer((prev: any) => ({
            ...prev,
            pos: { x: prev.pos.x, y: Math.max(0, prev.pos.y - 2) },
            collided: false,
          }));
          return prev; // return original stage, don't merge yet
        }

        if (nextIsConcrete) {
          resetPlayer(true);
          setNextIsConcrete(false); 
        } else {
          resetPlayer();
        }
        return sweepRows(newStage);
      }
      return newStage;
    });
  }, [player, isPlaying, nextIsConcrete]);

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
    setIsFrozen(false);
    setFrozenPiecesLeft(0);
    setIsCurseActive(false);
    setCursePiecesLeft(0);
    setIsStickyActive(false);
    setStickyPiecesLeft(0);
    setIsMetamorphActive(false);
    setIsBouncyActive(false);
    setWindDirection(0);
    setPointRainLeft(0);
  };

  const movePlayer = (dir: number) => {
    const actualDir = isStickyActive ? dir * 2 : dir; // sticky = double movement
    if (!checkCollision(player, stage, { x: dir, y: 0 })) {
      updatePlayerPos({ x: dir, y: 0, collided: false });
    }
    // Sticky: try second move
    if (isStickyActive && !checkCollision(player, stage, { x: actualDir, y: 0 })) {
      updatePlayerPos({ x: dir, y: 0, collided: false });
    }
  };

  const playerRotate = (stage: any[][], dir: number) => {
    if (isFrozen) return; // Frozen power!
    if (player.tetromino.length === 1 && player.tetromino[0].length === 1) return; 

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

    // Sticky: rotate again
    if (isStickyActive) {
      const cloned2 = JSON.parse(JSON.stringify(clonedPlayer));
      cloned2.tetromino = cloned2.tetromino[0].map((_: any, index: number) =>
        cloned2.tetromino.map((column: any[]) => column[index])
      );
      if (dir > 0) cloned2.tetromino.forEach((row: any[]) => row.reverse());
      else cloned2.tetromino.reverse();
      if (!checkCollision(cloned2, stage, { x: 0, y: 0 })) {
        setPlayer(cloned2);
      }
    }
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
    activateSingleSwap, activateSonicBoom, activateWildcard, setNextIsConcrete,
    nextTetromino, setIsFrozen, setIsCurseActive, clearTwoLinesManually, setStage, player,
    setFrozenPiecesLeft, setCursePiecesLeft, setIsStickyActive, setStickyPiecesLeft,
    setIsMetamorphActive, setIsBouncyActive, setWindDirection, activatePointRain,
  };
};
