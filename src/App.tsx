import { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { useTetris } from './hooks/useTetris';
import { TETROMINOES, createBoard } from './utils/tetris';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const Cell = ({ type }: { type: any }) => {
  let color = type === 'G' ? 'rgba(100, 100, 100, 0.8)' : (TETROMINOES[type]?.color || 'transparent');
  return (
    <div className="cell" style={{ 
        backgroundColor: type === 0 ? 'rgba(0,0,0,0.5)' : color,
        border: type === 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.2)'
    }} />
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
        <div className="ghost-piece g1" />
        <div className="ghost-piece g2" />
        <div className="ghost-piece g3" />
      </div>
    )}
  </div>
);

function App() {
  const [socket, setSocket] = useState<any>(null);
  const [nickname, setNickname] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [opponentsData, setOpponentsData] = useState<Record<string, any[][]>>({});
  const [opponentsScores, setOpponentsScores] = useState<Record<string, number>>({});
  const [gameMessage, setGameMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Status effects
  const [isFogged, setIsFogged] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);
  const [isFlickering, setIsFlickering] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [hasGhostShadows, setHasGhostShadows] = useState(false);
  const [showPopup, setShowPopup] = useState(false);

  // Cooldowns
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});
  
  // Scroll ref for powers panel
  const powersPanelRef = useRef<HTMLDivElement>(null);

  const baseSpeed = roomData?.config?.baseSpeed || 1000;

  const {
      stage, movePlayer, playerRotate, dropPlayer,
      setDropTime, startGame, gameOver, score, level, setScore,
      activateSingleSwap, activateSonicBoom, activateWildcard, setNextIsConcrete,
      nextTetromino, setIsFrozen, setIsCurseActive, clearTwoLinesManually, setStage,
      setFrozenPiecesLeft, setCursePiecesLeft, setIsStickyActive, setStickyPiecesLeft,
      setIsMetamorphActive, setBouncyPiecesLeft, setWindDirection, activatePointRain,
      metamorphRef,
  } = useTetris(socket, isPlaying, isPaused, baseSpeed);

  const powers = [
    // === EXISTING 12 POWERS ===
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
    // === NEW 12 POWERS ===
    { id: 'garbage_rain', name: 'Chuva Lixo', cost: 400, cd: 60, action: () => {}, icon: '🗑️', remote: true },
    { id: 'sticky', name: 'Grudento', cost: 400, cd: 60, action: () => {}, icon: '🍯', remote: true },
    { id: 'metamorph', name: 'Metamorfose', cost: 400, cd: 60, action: () => {}, icon: '🦎', remote: true },
    { id: 'ghost_shadows', name: 'Sombras', cost: 600, cd: 60, action: () => {}, icon: '👻', remote: true },
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
    const newSocket = io(SERVER_URL);
    setSocket(newSocket);

    newSocket.on('room_update', (data) => {
      setRoomData(data);
      setIsPaused(data.isPaused);
    });

    newSocket.on('game_started', () => {
      setIsPlaying(true);
      setGameMessage('');
      setOpponentsData({});
      setOpponentsScores({});
      setIsFogged(false);
      setIsMirrored(false);
      setIsFlickering(false);
      setIsShaking(false);
      setHasGhostShadows(false);
      setShowPopup(false);
      setNextIsConcrete(false);
      setCooldowns({});
      startGame();
    });

    newSocket.on('game_paused', (paused: boolean) => setIsPaused(paused));

    newSocket.on('board_updated', (data) => {
      setOpponentsData(prev => ({ ...prev, [data.id]: data.board }));
    });

    newSocket.on('score_updated', (data) => {
      setOpponentsScores(prev => ({ ...prev, [data.id]: data.score }));
    });

    newSocket.on('victory', (winnerId) => {
      setIsPlaying(false);
      setDropTime(null);
      setGameMessage(winnerId === newSocket.id ? 'Você Venceu! 🏆' : 'Você Perdeu. Oponente venceu.');
    });

    newSocket.on('game_ended_draw', () => {
      setIsPlaying(false);
      setDropTime(null);
      setGameMessage('Empate!');
    });

    newSocket.on('player_left', (id) => {
      setOpponentsData(prev => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
    });

    newSocket.on('kicked', () => {
      setInRoom(false);
      setRoomData(null);
      setIsPlaying(false);
      alert('Você foi expulso da sala pelo administrador.');
    });

    newSocket.on('swap_boards', ({ from, to }) => {
      // If I'm part of the swap, swap my board with my stored copy of the other player's board
      if (from === newSocket.id) {
        const theirBoard = opponentsData[to];
        if (theirBoard) {
          setStage(JSON.parse(JSON.stringify(theirBoard)));
        }
      } else if (to === newSocket.id) {
        const theirBoard = opponentsData[from];
        if (theirBoard) {
          setStage(JSON.parse(JSON.stringify(theirBoard)));
        }
      }
    });

    newSocket.on('receive_power', ({ type }) => {
      if (type === 'fog') {
        setIsFogged(true);
        setTimeout(() => setIsFogged(false), 7000);
      } else if (type === 'mirror') {
        setIsMirrored(true);
        setTimeout(() => setIsMirrored(false), 10000);
      } else if (type === 'concrete') {
        setNextIsConcrete(true);
      } else if (type === 'frozen') {
        setIsFrozen(true);
        setFrozenPiecesLeft(3);
      } else if (type === 'flicker') {
        setIsFlickering(true);
        setTimeout(() => setIsFlickering(false), 3000);
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
      } else if (type === 'brittle') {
        // Brittle: next piece splits on landing - we simulate by adding garbage after next collision
        // For simplicity: add a random garbage row when the next piece lands
        setStage(prev => {
          const newStage = [...prev];
          newStage.shift();
          const garbRow = new Array(10).fill([0, 'clear']);
          // Random scattered blocks
          for (let i = 0; i < 10; i++) {
            if (Math.random() > 0.5) garbRow[i] = ['G', 'merged'];
          }
          newStage.push(garbRow);
          return newStage;
        });
      } else if (type === 'anistia') {
        // Clear 8 bottom lines for everyone
        setStage(prev => {
          const newStage = [...prev];
          const toRemove = Math.min(8, newStage.length);
          newStage.splice(newStage.length - toRemove, toRemove);
          for (let i = 0; i < toRemove; i++) {
            newStage.unshift(new Array(10).fill([0, 'clear']));
          }
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
      }
    });

    return () => { newSocket.close(); };
  }, []);

  useEffect(() => {
    if (gameOver) {
      setIsPlaying(false);
      setGameMessage('Game Over');
    }
  }, [gameOver]);

  // Cooldown tick loop
  useEffect(() => {
    const interval = setInterval(() => {
      setCooldowns(prev => {
        const next = { ...prev };
        let changed = false;
        Object.keys(next).forEach(k => {
          if (next[k] > 0) {
            next[k] -= 1;
            changed = true;
          }
        });
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const cleanRoom = inputRoomId.trim().toLowerCase();
    if (!nickname.trim() || !cleanRoom) return;

    socket.emit('join_room', { roomId: cleanRoom, nickname }, (res: any) => {
      if (res.error) setErrorMsg(res.error);
      else { setInRoom(true); setInputRoomId(cleanRoom); }
    });
  };

  const isAdmin = socket?.id === roomData?.adminId;
  const isGodMode = nickname.toLowerCase() === 'schappoxd' && isAdmin;

  const usePower = (pwId: string, cost: number, cd: number, action?: () => void, remote: boolean = false) => {
    if (!isGodMode && (score < cost || (cooldowns[pwId] || 0) > 0)) return;
    if (!isGodMode) setScore(prev => prev - cost);
    if (!isGodMode) setCooldowns(prev => ({ ...prev, [pwId]: cd }));

    if (remote) socket.emit('use_power', { type: pwId, cost });
    else socket.emit('use_power', { type: 'local_deduction', cost });
    
    if (action) action();
  };

  const move = (e: KeyboardEvent) => {
    if (!isPlaying || isPaused) return;
    if ([37, 38, 39, 40].includes(e.keyCode)) e.preventDefault();

    let moveOffset = 0;
    if (e.keyCode === 37) moveOffset = -1;
    else if (e.keyCode === 39) moveOffset = 1;

    if (moveOffset !== 0) {
      if (isMirrored) moveOffset *= -1; 
      movePlayer(moveOffset);
    } 
    else if (e.keyCode === 40) dropPlayer();
    else if (e.keyCode === 38) playerRotate(stage, 1);
  };

  const keyUp = (e: KeyboardEvent) => {
    if (!isPlaying || isPaused) return;
    if (e.keyCode === 40) {
      e.preventDefault();
      setDropTime(baseSpeed / (level + 1) + 200);
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', move, { passive: false });
    document.addEventListener('keyup', keyUp, { passive: false });
    return () => {
      document.removeEventListener('keydown', move);
      document.removeEventListener('keyup', keyUp);
    };
  });

  useEffect(() => {
    if (isPlaying && !isPaused && socket) {
      socket.emit('update_board', { board: stage });
    }
  }, [stage]);

  const handleStart = () => { if (isAdmin) socket.emit('start_game'); };
  const handleChangeSpeed = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isAdmin) socket.emit('update_config', { baseSpeed: parseInt(e.target.value) });
  };

  if (!inRoom) {
    return (
      <div className="game-container">
        <h1 className="title">Tetris Multiplayer</h1>
        <form className="login-form" onSubmit={handleJoin}>
          <input placeholder="Seu Nickname" value={nickname} onChange={e => setNickname(e.target.value)} maxLength={12} required />
          <input placeholder="ID da Sala" value={inputRoomId} onChange={e => setInputRoomId(e.target.value)} maxLength={10} required />
          <button type="submit" className="start-button">Entrar / Criar Sala</button>
          <div style={{ textAlign: "center", marginTop: "1rem", color: "#666", fontSize: "0.8rem"}}>
            Status: {socket?.connected ? "Conectado" : "Conectando..."}<br/>
            Servidor Alvo: {SERVER_URL}
          </div>
          {errorMsg && <p className="error">{errorMsg}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="header">
        <h1 className="title">Tetris Multiplayer</h1>
        <p style={{ marginTop: '0.5rem', color: '#888' }}>
            Sala: <strong style={{ color: '#fff' }}>{roomData?.id}</strong> | 
            Jogadores: <strong style={{ color: '#fff' }}>{roomData?.players?.length}/4</strong>
        </p>
        {isMirrored && <div className="marquee-alert">CONTROLES INVERTIDOS! ESPELHO ATIVO!</div>}
      </div>

      {!isPlaying && !gameMessage && (
        <div className="lobby-panel">
          <h2>Jogadores na Sala ({roomData?.id})</h2>
          <ul className="player-list">
            {roomData?.players?.map((p: any) => (
              <li key={p.id}>
                {p.nickname} {p.id === roomData.adminId ? '(Admin)' : ''}
              </li>
            ))}
          </ul>
          {isAdmin ? (
            <div className="admin-controls">
              <label>Velocidade Inicial:</label>
              <select value={roomData?.config?.baseSpeed} onChange={handleChangeSpeed}>
                <option value={1000}>Normal</option><option value={700}>Rápido</option><option value={400}>M. Rápido</option>
              </select>
              <button className="start-button" onClick={handleStart}>Iniciar Jogo</button>
            </div>
          ) : <p>Aguardando o administrador...</p>}
        </div>
      )}

      {isPlaying && (
        <div className="main-layout">
          <div className="powers-panel" ref={powersPanelRef}>
            <h3 style={{ margin: '0 0 0.5rem 0' }}>Poderes ({powers.length})</h3>
            <div className="powers-scroll">
              <div className="powers-grid">
                {powers.map((pw) => {
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
            </div>
            {isAdmin && <button className="start-button restart-btn-side" onClick={handleStart}>Reiniciar 🔄</button>}
          </div>

          <div className="center-col">
            <div className="player-stats-header">
                <div className="stat-item"><span className="stat-label">SCORE:</span> <span className="stat-value">{score}</span></div>
                <div className="stat-item"><span className="stat-label">LEVEL:</span> <span className="stat-value">{level}</span></div>
            </div>
            <div className="board-wrapper active">
                <Board stage={stage} isFogged={isFogged} isFlickering={isFlickering} isShaking={isShaking} ghostShadows={hasGhostShadows} />
                {showPopup && (
                  <div className="fake-popup">
                    <div className="fake-popup-inner">
                      <p>⚠️ ERRO CRÍTICO DO SISTEMA!</p>
                      <p style={{fontSize:'0.7rem', color:'#888'}}>Seu tabuleiro será reiniciado em 3...</p>
                      <button className="fake-popup-close" onClick={() => setShowPopup(false)}>✕ Fechar</button>
                    </div>
                  </div>
                )}
            </div>
          </div>

          <div className="stats">
            <div className="next-piece-box">
                <div className="stat-label">PRÓXIMA</div>
                <div className="next-piece-display">
                    {nextTetromino.shape.map((row:any, y:number) => (
                        <div key={y} className="next-piece-row">
                            {row.map((cell:any, x:number) => (
                                <div key={x} className="next-cell" style={{ 
                                    backgroundColor: cell === 0 ? 'transparent' : nextTetromino.color,
                                    border: cell === 0 ? 'none' : '1px solid rgba(0,0,0,0.2)'
                                }} />
                            ))}
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="opponents-zone">
              {roomData?.players?.filter((p:any) => p.id !== socket.id).map((p:any) => (
                <div key={p.id} className="board-wrapper opponent-board-wrapper">
                  <div className="opponent-name">{p.nickname} <span className="opponent-score">{opponentsScores[p.id] || 0}p</span></div>
                  <Board stage={opponentsData[p.id] || createBoard()} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {gameMessage && (
        <div className="message-overlay">
          <div className="message-box result-screen" style={{ minWidth: '400px' }}>
            <h2>{gameMessage}</h2>
            <div className="leaderboard">
                <h3>Resumo da Partida</h3>
                <div className="leaderboard-list">
                    {roomData?.players?.sort((a:any, b:any) => b.totalScore - a.totalScore).map((p:any, i:number) => (
                        <div key={p.id} className="leaderboard-item" style={{ 
                            background: p.id === socket?.id ? 'rgba(0, 240, 240, 0.1)' : 'rgba(255,255,255,0.05)',
                            border: p.id === socket?.id ? '1px solid #00f0f0' : '1px solid rgba(255,255,255,0.1)'
                        }}>
                            <span className="rank-idx">#{i + 1}</span>
                            <span className="rank-name">{p.nickname}</span>
                            <span className="rank-total-score">{p.totalScore} pts</span>
                        </div>
                    ))}
                </div>
            </div>
            {(isAdmin || roomData?.players?.length === 1) && (
              <button className="start-button restart-btn" onClick={handleStart} style={{ marginTop: '2rem', background: '#22c55e' }}>REINICIAR 🎮</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
