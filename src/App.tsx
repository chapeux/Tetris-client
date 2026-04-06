import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useTetris } from './hooks/useTetris';
import { TETROMINOES, createBoard } from './utils/tetris';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const Cell = ({ type, isAcid }: { type: any, isAcid?: boolean }) => {
  let color = type === 'G' ? 'rgba(100, 100, 100, 0.8)' : (TETROMINOES[type]?.color || 'transparent');
  if (isAcid && type !== 0) color = '#84cc16'; // acid green override

  return (
    <div className={`cell ${isAcid && type !== 0 ? 'acid-glow' : ''}`} style={{ 
        backgroundColor: type === 0 ? 'rgba(0,0,0,0.5)' : color,
        border: type === 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.2)'
    }} />
  );
};

const Board = ({ stage, isFogged, player }: { stage: any[][], isFogged?: boolean, player?: any }) => (
  <div className={`board ${isFogged ? 'fogged' : ''}`}>
    {stage.map((row, y) => row.map((cell, x) => {
        // Evaluate if this specific cell is actively part of the sliding Acid block. 
        // This is tricky visually because merge happens later, but we can pass player isAcid status if player is present
        let isAcidCell = false;
        if (player && player.isAcid && cell[1] === 'clear' && cell[0] !== 0) {
          isAcidCell = true;
        }
        return <Cell key={`${y}-${x}`} type={cell[0]} isAcid={isAcidCell} />
      }
    ))}
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
  const [gameMessage, setGameMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Status effects
  const [isFogged, setIsFogged] = useState(false);
  const [isMirrored, setIsMirrored] = useState(false);

  // Cooldowns
  const [cooldowns, setCooldowns] = useState<Record<string, number>>({});

  const baseSpeed = roomData?.config?.baseSpeed || 1000;

  const {
      stage, movePlayer, playerRotate, dropPlayer,
      setDropTime, startGame, gameOver, score, level, setScore,
      activateSingleSwap, activateSonicBoom, activateAcidRain, setNextIsConcrete, player
  } = useTetris(socket, isPlaying, isPaused, baseSpeed);

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
      setIsFogged(false);
      setIsMirrored(false);
      setNextIsConcrete(false);
      setCooldowns({});
      startGame();
    });

    newSocket.on('game_paused', (paused: boolean) => {
      setIsPaused(paused);
    });

    newSocket.on('board_updated', (data) => {
      setOpponentsData(prev => ({ ...prev, [data.id]: data.board }));
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

    newSocket.on('receive_power', ({ type }) => {
      if (type === 'fog') {
        setIsFogged(true);
        setTimeout(() => setIsFogged(false), 7000);
      } else if (type === 'mirror') {
        setIsMirrored(true);
        setTimeout(() => setIsMirrored(false), 10000);
      } else if (type === 'concrete') {
        setNextIsConcrete(true);
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
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setInRoom(true);
        setInputRoomId(cleanRoom);
      }
    });
  };

  const usePower = (id: string, cost: number, cd_seconds: number, action: () => void, targetRemote: boolean = false) => {
    if (score < cost || (cooldowns[id] && cooldowns[id] > 0)) return;
    setScore(prev => prev - cost);
    setCooldowns(prev => ({ ...prev, [id]: cd_seconds }));
    if (targetRemote) socket.emit('use_power', id);
    action();
  };

  const move = (e: KeyboardEvent) => {
    if (!isPlaying || isPaused) return;
    
    // Number row bindings for powers!
    if (e.key === '1') usePower('swap', 100, 5, activateSingleSwap);
    if (e.key === '2') usePower('sonic', 700, 30, activateSonicBoom);
    if (e.key === '3') usePower('acid', 500, 30, activateAcidRain);
    if (e.key === '4') usePower('fog', 1000, 60, () => {}, true);
    if (e.key === '5') usePower('mirror', 500, 45, () => {}, true);
    if (e.key === '6') usePower('concrete', 1000, 90, () => {}, true);

    if ([37, 38, 39, 40].includes(e.keyCode)) e.preventDefault();

    let moveOffset = 0;
    if (e.keyCode === 37) moveOffset = -1;
    else if (e.keyCode === 39) moveOffset = 1;

    if (moveOffset !== 0) {
      if (isMirrored) moveOffset *= -1; // Invert controls!
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

  // Whenever stage changes and is alive, broadcast it
  useEffect(() => {
    if (isPlaying && !isPaused && socket) {
      socket.emit('update_board', { board: stage });
    }
  }, [stage]);

  const isAdmin = socket?.id === roomData?.adminId;

  const handleStart = () => { if (isAdmin) socket.emit('start_game'); };
  const handleTogglePause = () => { if (isAdmin) socket.emit('toggle_pause'); };
  const handleKick = (id: string) => { if (isAdmin) socket.emit('kick_player', id); };
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

  const powers = [
    { id: 'swap', name: 'Single Swap', cost: 100, cd: 5, action: activateSingleSwap, icon: '🔄', remote: false },
    { id: 'sonic', name: 'Sonic Boom', cost: 700, cd: 30, action: activateSonicBoom, icon: '💥', remote: false },
    { id: 'acid', name: 'Acid Rain', cost: 500, cd: 30, action: activateAcidRain, icon: '🧪', remote: false },
    { id: 'fog', name: 'Fog of War', cost: 1000, cd: 60, action: () => {}, icon: '🌫️', remote: true },
    { id: 'mirror', name: 'Mirror Move', cost: 500, cd: 45, action: () => {}, icon: '🪞', remote: true },
    { id: 'concrete', name: 'Concrete Piece', cost: 1000, cd: 90, action: () => {}, icon: '🧱', remote: true },
  ];

  return (
    <div className="game-container">
      <div className="header">
        <h1 className="title">Tetris Multiplayer</h1>
        {isMirrored && <div className="marquee-alert">CONTROLES INVERTIDOS! ESPELHO ATIVO!</div>}
      </div>

      {!isPlaying && !gameMessage && (
        <div className="lobby-panel">
          <h2>Jogadores na Sala ({roomData?.id})</h2>
          <ul className="player-list">
            {roomData?.players?.map((p: any) => (
              <li key={p.id}>
                {p.nickname} {p.id === roomData.adminId ? '(Admin)' : ''}
                {isAdmin && p.id !== socket.id && (
                  <button className="kick-btn" onClick={() => handleKick(p.id)}>Expulsar</button>
                )}
              </li>
            ))}
          </ul>

          {isAdmin ? (
            <div className="admin-controls">
              <label>Velocidade Inicial:</label>
              <select value={roomData?.config?.baseSpeed} onChange={handleChangeSpeed}>
                <option value={1000}>Normal</option>
                <option value={700}>Rápido</option>
                <option value={400}>Muito Rápido</option>
              </select>
              <button className="start-button" onClick={handleStart} disabled={roomData?.players?.length < 1}>
                Iniciar Jogo
              </button>
            </div>
          ) : (
            <p>Aguardando o administrador iniciar a partida...</p>
          )}
        </div>
      )}

      {isPlaying && (
        <div className="main-layout">
          {/* Menu de Poderes */}
          <div className="powers-panel">
            <h3>Poderes</h3>
            <p style={{fontSize: '0.8rem', color: '#aaa', margin: 0}}>Ative com o Score</p>
            <div className="powers-grid">
              {powers.map((pw, i) => {
                const canAfford = score >= pw.cost;
                const onCd = (cooldowns[pw.id] || 0) > 0;
                return (
                  <button 
                    key={pw.id} 
                    className={`power-btn ${(!canAfford && !onCd) ? 'locked' : ''} ${onCd ? 'cooldown' : ''}`}
                    disabled={!canAfford || onCd}
                    onClick={() => usePower(pw.id, pw.cost, pw.cd, pw.action, pw.remote)}
                    title={`Atalho: Tecla ${i+1}`}
                  >
                    <span className="power-icon">{pw.icon}</span>
                    <span className="power-name">{pw.name}</span>
                    <span className="power-cost">{pw.cost} pts</span>
                    {onCd && <div className="cooldown-overlay">{cooldowns[pw.id]}s</div>}
                    <div className="hotkey-badge">{i+1}</div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="board-wrapper active">
            <h2>Seu Jogo {isPaused && "(PAUSADO)"}</h2>
            <Board stage={stage} isFogged={isFogged} player={player} />
          </div>

          <div className="stats">
            <div className="stat-box"><div className="stat-label">Score</div><div className="stat-value">{score}</div></div>
            <div className="stat-box"><div className="stat-label">Level</div><div className="stat-value">{level}</div></div>

            {isAdmin && (
              <button className="start-button" onClick={handleTogglePause}>
                {isPaused ? '▶ Retomar' : '⏸ Pausar Todos'}
              </button>
            )}
            
            <div className="opponents-zone">
              {roomData?.players?.filter((p:any) => p.id !== socket.id).map((p:any) => (
                <div key={p.id} className="board-wrapper opponent-board-wrapper">
                  <div className="opponent-name">{p.nickname}</div>
                  <Board stage={opponentsData[p.id] || createBoard()} />
                </div>
              ))}
            </div>
          </div>

        </div>
      )}

      {gameMessage && (
        <div className="message-overlay">
          <div className="message-box">
            <h2>{gameMessage}</h2>
            {isAdmin ? (
              <button className="start-button" onClick={handleStart}>Jogar Novamente</button>
            ) : (
              <p>Aguardando Admin para reiniciar...</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
