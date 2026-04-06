import { useState, useEffect, useCallback, useRef } from 'react';
import { createBoard, randomTetromino, checkCollision, TETROMINOES } from '../utils/tetris';

export const useTetris = (socket: any, isPlaying: boolean, isPaused: boolean, baseSpeed: number) => {
  const [dropTime, setDropTime] = useState<number | null>(null);
  const [gameOver, setGameOver] = useState(false);

  const [player, setPlayer] = useState({
    pos: { x: 0, y: 0 },
    tetromino: TETROMINOES[0].shape,
    collided: false,
  });

  const [stage, setStage] = useState(createBoard());
  const [score, setScore] = useState(0);
  const [rows, setRows] = useState(0);
  const [level, setLevel] = useState(0);

  useEffect(() => {
    if (!socket) return;
    const handleGarbage = ({ lines }: { lines: number }) => {
      setStage(prev => {
        const newStage = [...prev];
        for(let i=0; i<lines; i++) {
          newStage.shift();
          const holeIdx = Math.floor(Math.random() * 10);
          const garbageRow = Array.from({length: 10}, (_, idx) => 
               idx === holeIdx ? [0, 'clear'] : ['G', 'merged']
          );
          newStage.push(garbageRow);
        }
        return newStage;
      });
    };
    socket.on('receive_garbage', handleGarbage);
    return () => { socket.off('receive_garbage', handleGarbage); };
  }, [socket]);

  useEffect(() => {
    if (socket && isPlaying && !gameOver) {
      socket.emit('update_board', { board: stage });
    }
  }, [stage, isPlaying, gameOver, socket]);

  const updatePlayerPos = ({ x, y, collided }: { x: number, y: number, collided: boolean }) => {
    setPlayer(prev => ({
      ...prev,
      pos: { x: (prev.pos.x + x), y: (prev.pos.y + y) },
      collided,
    }));
  };

  const resetPlayer = useCallback(() => {
    setPlayer({
      pos: { x: 10 / 2 - 2, y: 0 },
      tetromino: randomTetromino().shape,
      collided: false,
    });
  }, []);

  const rotate = (matrix: any[][], dir: number) => {
    const rotatedTetro = matrix.map((_, index) => matrix.map(col => col[index]));
    if (dir > 0) return rotatedTetro.map(row => row.reverse());
    return rotatedTetro.reverse();
  };

  const playerRotate = (stage: any[][], dir: number) => {
    const clonedPlayer = JSON.parse(JSON.stringify(player));
    clonedPlayer.tetromino = rotate(clonedPlayer.tetromino, dir);
    const pos = clonedPlayer.pos.x;
    let offset = 1;
    while (checkCollision(clonedPlayer, stage, { x: 0, y: 0 })) {
      clonedPlayer.pos.x += offset;
      offset = -(offset + (offset > 0 ? 1 : -1));
      if (offset > clonedPlayer.tetromino[0].length) {
        rotate(clonedPlayer.tetromino, -dir);
        clonedPlayer.pos.x = pos;
        return;
      }
    }
    setPlayer(clonedPlayer);
  };

  useEffect(() => {
    setStage(prev => {
      const newStage = prev.map(row =>
        row.map(cell => (cell[1] === 'clear' ? [0, 'clear'] : cell)),
      );

      player.tetromino.forEach((row: any[], y: number) => {
        row.forEach((value: any, x: number) => {
          if (value !== 0) {
            const vy = y + player.pos.y;
            const vx = x + player.pos.x;
            if (vy >= 0 && vy < newStage.length && vx >= 0 && vx < newStage[0].length) {
               newStage[vy][vx] = [value, player.collided ? 'merged' : 'clear'];
            }
          }
        });
      });

      if (player.collided) {
        resetPlayer();
        return sweepRows(newStage);
      }
      return newStage;
    });
  }, [player, resetPlayer]);

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
      setRows(prev => prev + rowsCleared);
      setLevel(prev => prev + 1);
      setDropTime(baseSpeed / (level + 1) + 200);
      socket?.emit('score_lines', rowsCleared);
    }
    return finalStage;
  };

  const drop = () => {
    if (isPaused) return; // Don't drop if paused
    if (!checkCollision(player, stage, { x: 0, y: 1 })) {
      updatePlayerPos({ x: 0, y: 1, collided: false });
    } else {
      if (player.pos.y < 1) {
        setGameOver(true);
        setDropTime(null);
        socket?.emit('game_over');
      } else {
        updatePlayerPos({ x: 0, y: 0, collided: true });
      }
    }
  };

  const dropPlayer = () => {
    if (isPaused) return;
    setDropTime(null);
    drop();
  };

  const movePlayer = (dir: number) => {
    if (isPaused) return;
    if (!checkCollision(player, stage, { x: dir, y: 0 })) {
      updatePlayerPos({ x: dir, y: 0, collided: false });
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
    setDropTime(baseSpeed);
    resetPlayer();
    setGameOver(false);
    setScore(0);
    setRows(0);
    setLevel(0);
  };

  return { player, stage, setStage, movePlayer, playerRotate, dropPlayer, drop, dropTime, setDropTime, startGame, gameOver, score, level };
};
