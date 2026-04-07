import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useTetris } from './hooks/useTetris';
import { TETROMINOES, createBoard, randomTetromino } from './utils/tetris';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const Cell = ({ type }: { type: string | number }) => (
  <div className={`cell ${type !== 0 ? 'active' : ''}`} style={{ 
    backgroundColor: type !== 0 ? (TETROMINOES[type as string]?.color || '#555') : 'transparent',
    boxShadow: type !== 0 ? `inset 0 0 8px rgba(255,255,255,0.3)` : 'none'
  }} />
);

const GhostPiece = ({ type, className }: { type: string, className: string }) => {
  const shape = TETROMINOES[type].shape;
  const color = TETROMINOES[type].color;
  return (
    <div className={`ghost-piece ${className}`}>
      {shape.map((row: any, y: number) => (
        <div key={y} className="ghost-row">
          {row.map((cell: any, x: number) => (
            <div key={x} className="ghost-cell" style={{ 
              backgroundColor: cell === 0 ? 'transparent' : color,
              border: cell === 0 ? 'none' : '1px solid rgba(0,0,0,0.2)'
            }} />
          ))}
        </div>
      ))}
    </div>
  );
};

const Board = ({ stage, isFogged, isFlickering, isShaking, ghostShadows }: { 
  stage: any[][], isFogged?: boolean, isFlickering?: boolean, isShaking?: boolean, ghostShadows?: boolean 
}) => (
  <div className={`board ${isFogged ? 'fogged' : ''} ${isFlickering ? 'flicker' : ''} ${isShaking ? 'shake' : ''}`}>
    {stage.map((row, y) => row.map((cell, x) => (
        <Cell key={`${y}-${x}`} type={cell[0]} />
      )
    ))}
    {ghostShadows && (
      <div className="ghost-overlay">
        <GhostPiece type="L" className="g1" />
        <GhostPiece type="O" className="g2" />
        <GhostPiece type="I" className="g3" />
        <GhostPiece type="Z" className="g4" />
      </div>
    )}
  </div>
);

function App() {
  const [socket, setSocket] = useState<any>(null);
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);
  const [opponentsData, setOpponentsData] = useState<{ [key: string]: any }>({});
  const opponentsDataRef = useRef<{ [key: string]: any }>({});
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [baseSpeed, setBaseSpeed] = useState(1000);
  const [cooldowns, setCooldowns] = useState<{ [key: string]: number }>({});
  
  // Power visual states
  const [isFogged, setIsFogged] = useState(false);
  const [isFlickering, setIsFlickering] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [hasGhostShadows, setHasGhostShadows] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  const {
      stage, movePlayer, playerRotate, dropPlayer,
      setDropTime, startGame, gameOver, score, level, setScore,
      activateSingleSwap, activateSonicBoom, activateWildcard, setNextIsConcrete,
      nextTetromino, setIsFrozen, setIsCurseActive, clearTwoLinesManually, setStage, player,
      setFrozenPiecesLeft, setCursePiecesLeft, setIsStickyActive, setStickyPiecesLeft,
      setIsMetamorphActive, setBouncyPiecesLeft, setWindDirection, activatePointRain,
      metamorphRef, setDualPiece,
  } = useTetris(socket, isPlaying, isPaused, baseSpeed);

  const powers = [
    { id: 'swap', name: 'Single Swap', cost: 100, cd: 5, action: activateSingleSwap, icon: '🔄', remote: false },
    { id: 'sonic', name: 'Sonic Boom', cost: 700, cd: 30, action: activateSonicBoom, icon: '💥', remote: false },
    { id: 'wildcard', name: 'Wildcard', cost: 200, cd: 30, action: activateWildcard, icon: '🃏', remote: false },
    { id: 'share_wealth', name: 'Share Wealth', cost: 400, cd: 60, action: clearTwoLinesManually, icon: '💰', remote: true },
    { id: 'fog', name: 'Fog of War', cost: 1000, cd: 60, action: () => {}, icon: '🌫️', remote: true },
    { id: 'mirror', name: 'Mirror Move', cost: 500, cd: 45, action: () => {}, icon: '🪞', remote: true },
    { id: 'frozen', name: 'Frozen', cost: 300, cd: 40, action: () => {}, icon: '❄️', remote: true },
    { id: 'flicker', name: 'Flicker', cost: 300, cd: 90, action: () => {}, icon: '💡', remote: true },
    { id: 'curse', name: 'Curse', cost: 400, cd: 60, action: () => {}, icon: '💀', remote: true },
    { id: 'concrete', name: 'Concrete', cost: 1000, cd: 90, action: () => {}, icon: '🧱', remote: true },
    { id: 'swap_board', name: 'Swap Board', cost: 500, cd: 120, action: () => {}, icon: '↔️', remote: true },
    { id: 'gift_box', name: 'Gift Box', cost: 500, cd: 200, action: () => {}, icon: '🎁', remote: true },
    { id: 'garbage_rain', name: 'Chuva Lixo', cost: 400, cd: 60, action: () => {}, icon: '🗑️', remote: true },
    { id: 'sticky', name: 'Grudento', cost: 400, cd: 60, action: () => {}, icon: '🍯', remote: true },
    { id: 'metamorph', name: 'Metamorfose', cost: 400, cd: 60, action: () => {}, icon: '🦎', remote: true },
    { id: 'ghost_shadows', name: 'Sombras', cost: 300, cd: 60, action: () => {}, icon: '👻', remote: true },
    { id: 'point_rain', name: 'Chuva Pts', cost: 400, cd: 120, action: activatePointRain, icon: '🧩', remote: false },
    { id: 'brittle', name: 'Quebradiça', cost: 500, cd: 45, action: () => {}, icon: '💔', remote: true },
    { id: 'anistia', name: 'Anistia', cost: 3000, cd: 300, action: () => {}, icon: '⚖️', remote: true },
    { id: 'popup', name: 'Pop-up', cost: 400, cd: 60, action: () => {}, icon: '📢', remote: true },
    { id: 'shake', name: 'Tela Tremida', cost: 200, cd: 120, action: () => {}, icon: '📳', remote: true },
    { id: 'wind', name: 'Ventania', cost: 500, cd: 60, action: () => {}, icon: '🌪️', remote: true },
    { id: 'bouncy', name: 'Quicante', cost: 400, cd: 60, action: () => {}, icon: '🏀', remote: true },
    { id: 'scatter_bomb', name: 'Dispersão', cost: 500, cd: 60, action: () => {}, icon: '💣', remote: true },
  ];

  useEffect(() => {
    opponentsDataRef.current = opponentsData;
  }, [opponentsData]);

  useEffect(() => {
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('room_update', (data: any) => setRoomData(data));
    newSocket.on('opponent_update', ({ id, data }: any) => {
      setOpponentsData(prev => ({ ...prev, [id]: data }));
    });
    newSocket.on('game_started', (config: any) => {
      setBaseSpeed(config.baseSpeed);
      startGame();
      setIsPlaying(true);
      setIsPaused(false);
    });
    newSocket.on('game_ended', () => {
      setIsPlaying(false);
      setDropTime(null);
    });

    newSocket.on('swap_boards', ({ from, to }) => {
      // FIX: Use ref to get latest opponentsData
      if (from === newSocket.id || to === newSocket.id) {
        const victimId = (from === newSocket.id) ? to : from;
        const victimBoard = opponentsDataRef.current[victimId]?.stage;
        if (victimBoard) {
          setStage(JSON.parse(JSON.stringify(victimBoard)));
        }
      }
    });

    newSocket.on('receive_power', ({ type, id }) => {
      if (type === 'fog') {
        setIsFogged(true);
        setTimeout(() => setIsFogged(false), 10000);
      } else if (type === 'flicker') {
        setIsFlickering(true);
        setTimeout(() => setIsFlickering(false), 3000);
      } else if (type === 'frozen') {
        setIsFrozen(true);
        setFrozenPiecesLeft(3);
      } else if (type === 'curse') {
        setIsCurseActive(true);
        setCursePiecesLeft(5);
      } else if (type === 'sticky') {
        setIsStickyActive(true);
        setStickyPiecesLeft(2);
        setTimeout(() => { setIsStickyActive(false); setStickyPiecesLeft(0); }, 30000);
      } else if (type === 'metamorph') {
        setIsMetamorphActive(true);
        metamorphRef.current = true;
      } else if (type === 'ghost_shadows') {
        setHasGhostShadows(true);
        setTimeout(() => setHasGhostShadows(false), 8000);
      } else if (type === 'anistia') {
        setStage(prev => {
          const newStage = [...prev];
          const toRemove = Math.min(8, newStage.length);
          newStage.splice(newStage.length - toRemove, toRemove);
          for (let i = 0; i < toRemove; i++) newStage.unshift(new Array(10).fill([0, 'clear']));
          return newStage;
        });
        setScore(0);
      } else if (type === 'popup') {
        setShowPopup(true);
      } else if (type === 'shake') {
        setIsShaking(true);
        setTimeout(() => setIsShaking(false), 8000);
      } else if (type === 'wind') {
        const dir = Math.random() > 0.5 ? 1 : -1;
        setWindDirection(dir);
        setTimeout(() => setWindDirection(0), 8000);
      } else if (type === 'bouncy') {
        setBouncyPiecesLeft(3);
      } else if (type === 'scatter_bomb') {
        const piece = randomTetromino();
        setDualPiece({ pos: { x: Math.floor(Math.random() * 7), y: 0 }, tetromino: piece.shape, collided: false });
      }
    });

    return () => { newSocket.close(); };
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setCooldowns(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(key => {
          if (next[key] > 0) next[key] -= 1;
          else delete next[key];
        });
        return next;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const isAdmin = socket?.id === roomData?.adminId;
  const isGodMode = nickname.toLowerCase() === 'schappoxd' && isAdmin;

  const usePower = (pwId: string, cost: number, cd: number, action?: () => void, remote: boolean = false) => {
    if (!isGodMode && (score < cost || (cooldowns[pwId] || 0) > 0)) return;
    if (!isGodMode) setScore(prev => prev - cost);
    if (!isGodMode) setCooldowns(prev => ({ ...prev, [pwId]: cd }));

    if (remote) socket.emit('use_power', { type: pwId, cost });
    else if (action) action();
  };

  const handleJoin = () => { if (nickname && roomId) socket.emit('join_room', { nickname, roomId }); setInRoom(true); };
  const handleStart = () => { if (isAdmin) socket.emit('start_game'); };
  
  if (!inRoom) return (
    <div className="game-container login-screen">
      <h1 className="title">TETRIS ARCADE</h1>
      <div className="login-box">
        <input placeholder="Nickname" value={nickname} onChange={e => setNickname(e.target.value)} />
        <input placeholder="Room ID" value={roomId} onChange={e => setRoomId(e.target.value)} />
        <button className="start-button" onClick={handleJoin}>Entrar</button>
      </div>
    </div>
  );

  return (
    <div className="game-container">
      <div className="header">
        <h1 className="title">Multiplayer Tetris</h1>
        {roomData && <p className="room-id">Sala: {roomData.id} | Jogadores: {roomData.players.length}/4</p>}
      </div>

      <div className="main-layout">
        <div className="board-wrapper active">
          <div className="player-stats-header">
             <div className="stat-item"><span className="stat-label">SCORE</span><span className="stat-value">{score}</span></div>
             <div className="stat-item"><span className="stat-label">LEVEL</span><span className="stat-value">{level}</span></div>
          </div>
          <Board stage={stage} isFogged={isFogged} isFlickering={isFlickering} isShaking={isShaking} ghostShadows={hasGhostShadows} />
          {gameOver && <div className="game-over-overlay"><h1>GAME OVER</h1>{isAdmin && <button onClick={handleStart}>Restart</button>}</div>}
        </div>

        <div className="side-panel">
          <div className="next-piece-box">
            <h3>PRÓXIMA</h3>
            <div className="next-piece-grid">
               {nextTetromino.shape.map((row: any[], y: number) => row.map((cell: any, x: number) => (
                 <div key={`${y}-${x}`} className={`cell ${cell !== 0 ? 'active' : ''}`} style={{ backgroundColor: cell !== 0 ? nextTetromino.color : 'transparent' }} />
               )))}
            </div>
          </div>

          <div className="powers-panel">
            <h3>PODERES</h3>
            <div className="powers-grid">
              {powers.map(pw => {
                const canAfford = score >= pw.cost;
                const onCd = (cooldowns[pw.id] || 0) > 0;
                const isDisabled = isGodMode ? false : (!canAfford || onCd);
                return (
                  <button key={pw.id} className={`power-btn ${(!canAfford && !onCd && !isGodMode) ? 'locked' : ''} ${(onCd && !isGodMode) ? 'cooldown' : ''}`}
                    disabled={isDisabled} onClick={() => usePower(pw.id, pw.cost, pw.cd, pw.action, pw.remote)}>
                    <span className="power-icon">{pw.icon}</span>
                    <span className="power-name">{pw.name}</span>
                    <span className="power-cost">{pw.cost}p</span>
                    {onCd && <div className="cooldown-overlay">{cooldowns[pw.id]}s</div>}
                  </button>
                );
              })}
            </div>
            {isAdmin && <button className="start-button" onClick={handleStart}>Reiniciar 🔄</button>}
          </div>
        </div>

        <div className="opponents-panel">
          {roomData?.players.filter((p: any) => p.id !== socket?.id).map((p: any) => (
             <div key={p.id} className="opponent-wrapper">
                <h4>{p.nickname} {p.isAlive ? '' : '(MORREU)'}</h4>
                <div className="stat-row"><span>Pts: {p.score}</span></div>
                <div className="opponent-board-mini">
                   <Board stage={opponentsData[p.id]?.stage || createBoard()} />
                </div>
             </div>
          ))}
        </div>
      </div>

      {showPopup && <div className="popup-scare" onClick={() => setShowPopup(false)}><div className="popup-content"><h2>GANHEI 1 MILHÃO!</h2><p>Clique para fechar</p></div></div>}
    </div>
  );
}

export default App;
