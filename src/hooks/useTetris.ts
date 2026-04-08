import { useState, useEffect, useCallback, useRef } from 'react';
import { createBoard, randomTetromino, checkCollision, TETROMINOES } from '../utils/tetris';

export const useTetris = (socket: any, isPlaying: boolean, isPaused: boolean, baseSpeed: number, isSpectator: boolean = false) => {
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
  const [, setIsMetamorphActive] = useState(false);
  const [bouncyPiecesLeft, setBouncyPiecesLeft] = useState(0);
  const metamorphRef = useRef(false);
  const [windDirection, setWindDirection] = useState(0); // -1 left, 0 none, 1 right
  const [pointRainLeft, setPointRainLeft] = useState(0); // 1x1 pieces left

  // === NEWEST POWER STATES ===
  const [isParalyzed, setIsParalyzed] = useState(false);
  const [isPuppeteering, setIsPuppeteering] = useState(false);
  const [isUnderMarionette, setIsUnderMarionette] = useState(false);
  const [isGiroLoucoActive, setIsGiroLoucoActive] = useState(false);
  const [laserActive, setLaserActive] = useState(false);

  // Power states
  const [nextIsConcrete, setNextIsConcrete] = useState(false);
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);

  // Dual piece (scatter bomb)
  const [dualPiece, setDualPiece] = useState<any>(null);

  // Seeded Random Pieces
  const [gameSeed, setGameSeed] = useState<number>(0.5);
  const pieceIndexRef = useRef(0);

  const seededRandom = (seed: number) => {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  };

  const getNextPiece = useCallback(() => {
    const types = "IJLOSTZ";
    const nextSeed = seededRandom(gameSeed + pieceIndexRef.current);
    const type = types[Math.floor(nextSeed * types.length)];
    pieceIndexRef.current++;
    return TETROMINOES[type];
  }, [gameSeed]);

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
    if (isSpectator) return;

    // Point Rain: force 1x1 pieces
    if (pointRainLeft > 0 && !forceConcrete) {
      setPlayer({
        pos: { x: 10 / 2 - 1, y: 0 },
        tetromino: TETROMINOES['W'].shape,
        collided: false,
      });
      setPointRainLeft(prev => prev - 1);
      setNextTetromino(getNextPiece());
      return;
    }

    let nextPiece = nextTetromino;

    // Tetris Curse: only Z pieces for next N pieces
    let finalShape = nextPiece.shape;
    if ((isCurseActive || cursePiecesLeft > 0) && !forceConcrete) {
        finalShape = TETROMINOES['Z'].shape;
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
      tetromino: forceConcrete ? TETROMINOES['C'].shape : finalShape,
      collided: false,
    });

    setNextTetromino(getNextPiece());
  }, [nextTetromino, isCurseActive, cursePiecesLeft, frozenPiecesLeft, stickyPiecesLeft, pointRainLeft, getNextPiece, isSpectator]);

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

  const activateLaser = () => {
    setLaserActive(true);
  };

  const activateEarthquake = () => {
    setStage(prev => {
      const newStage = prev.map(row => {
        const hasBlocks = row.some(cell => cell[0] !== 0);
        if (!hasBlocks) return [...row];
        const dir = Math.random() > 0.5 ? 1 : -1;
        const newRow = new Array(10).fill([0, 'clear']);
        row.forEach((cell, x) => {
          if (cell[0] !== 0) {
            const newX = (x + dir + 10) % 10;
            newRow[newX] = [...cell];
          }
        });
        return newRow;
      });
      return newStage;
    });
  };

  const activateVirus = () => {
    setStage(prev => {
      const newStage = prev.map(row => [...row]);
      // Find a random occupied cell
      const occupied = [];
      for (let y = 0; y < 20; y++) {
        for (let x = 0; x < 10; x++) {
          if (newStage[y][x][0] !== 0) occupied.push({ x, y });
        }
      }
      if (occupied.length > 0) {
        const target = occupied[Math.floor(Math.random() * occupied.length)];
        newStage[target.y][target.x] = ['V', 'merged']; // 'V' for virus
        
        // Virus explosion after 10s
        setTimeout(() => {
          setStage(current => {
            const s = current.map(r => [...r]);
            const tx = target.x;
            const ty = target.y;
            const coords = [{x:tx,y:ty}, {x:tx+1,y:ty}, {x:tx-1,y:ty}, {x:tx,y:ty+1}, {x:tx,y:ty-1}];
            coords.forEach(c => {
              if (s[c.y] && s[c.y][c.x]) s[c.y][c.x] = [0, 'clear'];
            });
            return s;
          });
        }, 10000);
      }
      return newStage;
    });
  };

  const activateLixoFalso = () => {
    setStage(prev => {
      const newStage = [...prev];
      for (let i = 0; i < 3; i++) {
        newStage.shift();
        const garbRow = new Array(10).fill(['G', 'phantom']); // 'phantom' tag
        newStage.push(garbRow);
      }
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

    if (rowsCleared > 0) {
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
    if (!metamorphRef.current) return;
    if (player.pos.y >= 8 && !player.collided) {
      const newPiece = randomTetromino();
      const newX = Math.min(player.pos.x, 10 - newPiece.shape[0].length);
      setPlayer((prev: any) => ({
        ...prev,
        pos: { x: Math.max(0, newX), y: prev.pos.y },
        tetromino: newPiece.shape,
      }));
      metamorphRef.current = false;
      setIsMetamorphActive(false);
    }
  }, [player.pos.y, player.collided]);

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

      // Render main player piece
      player.tetromino.forEach((row: any[], y: number) => {
        row.forEach((value: any, x: number) => {
          if (value !== 0) {
            if (newStage[y + player.pos.y] && newStage[y + player.pos.y][x + player.pos.x]) {
              newStage[y + player.pos.y][x + player.pos.x] = [value, `${player.collided ? 'merged' : 'clear'}`];
            }
          }
        });
      });

      // Render dual piece if active
      if (dualPiece && !dualPiece.collided) {
        dualPiece.tetromino.forEach((row: any[], y: number) => {
          row.forEach((value: any, x: number) => {
            if (value !== 0) {
              const py = y + dualPiece.pos.y;
              const px = x + dualPiece.pos.x;
              if (newStage[py] && newStage[py][px] && newStage[py][px][1] === 'clear') {
                newStage[py][px] = [value, 'clear'];
              }
            }
          });
        });
      }

      if (player.collided) {
        // Laser logic
        if (laserActive) {
          const colX = player.pos.x + Math.floor(player.tetromino[0].length / 2);
          for (let y = 0; y < 20; y++) {
            newStage[y][colX] = [0, 'clear'];
          }
          setLaserActive(false);
          return newStage;
        }

        // Phantom garbage disappearance
        newStage.forEach((row) => {
          row.forEach((cell) => {
            if (cell[1] === 'phantom') {
              // If any piece landed adjacent or on it, it vanishes? 
              // Simplest: if it's merged, it vanishes.
            }
          });
        });

        // Bouncy: piece jumps up before locking
        if (bouncyPiecesLeft > 0) {
          setBouncyPiecesLeft(prev => prev - 1);
          setPlayer((prev: any) => ({
            ...prev,
            pos: { x: prev.pos.x, y: Math.max(0, prev.pos.y - 2) },
            collided: false,
          }));
          return prev;
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
  }, [player, isPlaying, nextIsConcrete, dualPiece]);

  const drop = () => {
    if (isPaused) return;
    
    // Check for phantom collision first
    const collision = checkCollision(player, stage, { x: 0, y: 1 });
    if (collision) {
      // Check if colliding with phantom
      let hitPhantom = false;
      player.tetromino.forEach((row: any[], y: number) => {
        row.forEach((value: any, x: number) => {
          if (value !== 0) {
            const ny = y + player.pos.y + 1;
            const nx = x + player.pos.x;
            if (stage[ny] && stage[ny][nx] && stage[ny][nx][1] === 'phantom') {
              hitPhantom = true;
            }
          }
        });
      });

      if (hitPhantom) {
        setStage(prev => prev.map(row => row.map(cell => cell[1] === 'phantom' ? [0, 'clear'] : cell)));
        // No lock, just continue
        return;
      }

      if (player.pos.y < 1) {
        setGameOver(true);
        setDropTime(null);
        socket?.emit('game_over');
      }
      updatePlayerPos({ x: 0, y: 0, collided: true });
    } else {
      updatePlayerPos({ x: 0, y: 1, collided: false });
    }

    // Auto-drop dual piece
    if (dualPiece && !dualPiece.collided) {
      const dp = dualPiece;
      const canMove = !checkCollision({ tetromino: dp.tetromino, pos: dp.pos }, stage, { x: 0, y: 1 });
      if (canMove) {
        setDualPiece({ ...dp, pos: { x: dp.pos.x, y: dp.pos.y + 1 } });
      } else {
        // Merge dual piece into stage
        setStage(prev => {
          const ns = prev.map(row => [...row]);
          dp.tetromino.forEach((row: any[], y: number) => {
            row.forEach((val: any, x: number) => {
              if (val !== 0) {
                const py = y + dp.pos.y;
                const px = x + dp.pos.x;
                if (ns[py] && ns[py][px]) ns[py][px] = [val, 'merged'];
              }
            });
          });
          return sweepRows(ns);
        });
        setDualPiece(null);
      }
    }
  };

  const dropRef = useRef(drop);
  useEffect(() => {
    dropRef.current = drop;
  }, [drop]);

  useEffect(() => {
    if (!dropTime || isPaused || isSpectator) return;
    const interval = setInterval(() => { dropRef.current(); }, dropTime);
    return () => clearInterval(interval);
  }, [dropTime, isPaused, isSpectator]);

  const startGame = (seed?: number) => {
    if (seed !== undefined) {
      setGameSeed(seed);
      pieceIndexRef.current = 0;
    }
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
    metamorphRef.current = false;
    setBouncyPiecesLeft(0);
    setWindDirection(0);
    setPointRainLeft(0);
    setDualPiece(null);
    setIsParalyzed(false);
    setIsPuppeteering(false);
    setIsUnderMarionette(false);
    setIsGiroLoucoActive(false);
    setLaserActive(false);
  };

  const movePlayer = (dir: number) => {
    if (isParalyzed || isUnderMarionette) return;
    if (isPuppeteering) {
      socket?.emit('marionette_move', { dir });
    }

    const actualDir = isStickyActive ? dir * 2 : dir; // sticky = double movement
    if (!checkCollision(player, stage, { x: dir, y: 0 })) {
      updatePlayerPos({ x: dir, y: 0, collided: false });
    }
    // Sticky: try second move
    if (isStickyActive && !checkCollision(player, stage, { x: actualDir, y: 0 })) {
      updatePlayerPos({ x: dir, y: 0, collided: false });
    }
  };

  useEffect(() => {
    if (!socket) return;
    const handleMarionette = ({ dir, rotate, drop }: any) => {
      if (dir) movePlayer(dir);
      if (rotate) playerRotate(stage, rotate);
      if (drop) dropPlayer();
    };
    socket.on('receive_marionette', handleMarionette);
    return () => { socket.off('receive_marionette', handleMarionette); };
  }, [socket, stage, isParalyzed]);

  const playerRotate = (stage: any[][], dir: number) => {
    if (isFrozen || isParalyzed || isUnderMarionette) return; // Frozen or Paralyzed power!
    if (player.tetromino.length === 1 && player.tetromino[0].length === 1) return;

    if (isPuppeteering) socket?.emit('marionette_move', { rotate: dir });

    if (isGiroLoucoActive) {
      setPlayer((prev: any) => ({
        ...prev,
        tetromino: randomTetromino().shape,
      }));
      return;
    }

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
    if (isParalyzed || isUnderMarionette) return;
    if (isPuppeteering) socket?.emit('marionette_move', { drop: true });
    setDropTime(null);
    dropRef.current();
  };

  useEffect(() => {
    if (!socket) return;
    const handleGarbage = ({ lines }: { lines: number }) => {
      setStage(prev => {
        const newStage = [...prev];
        for (let i = 0; i < lines; i++) {
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
    setIsMetamorphActive, setBouncyPiecesLeft, setWindDirection, activatePointRain,
    metamorphRef, setDualPiece, activateLaser, activateEarthquake, activateVirus, activateLixoFalso,
    setIsParalyzed, setIsPuppeteering, setIsUnderMarionette, setIsGiroLoucoActive,
  };
};
