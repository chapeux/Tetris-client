import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useTetris } from './hooks/useTetris';
import { TETROMINOES, createBoard } from './utils/tetris';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';

const Cell = ({ type }: { type: any }) => {
  const color = type === 'G' ? 'rgba(100, 100, 100, 0.8)' : (TETROMINOES[type]?.color || 'transparent');
  return (
    <div className="cell" style={{ 
        backgroundColor: type === 0 ? 'rgba(0,0,0,0.5)' : color,
        border: type === 0 ? '1px solid rgba(255,255,255,0.05)' : '1px solid rgba(0,0,0,0.2)'
    }} />
  );
};

const Board = ({ stage }: { stage: any[][] }) => (
  <div className="board">
    {stage.map((row, y) => row.map((cell, x) => <Cell key={`${y}-${x}`} type={cell[0]} />))}
  </div>
);

function App() {
  const [socket, setSocket] = useState<any>(null);
  
  // Lobby States
  const [nickname, setNickname] = useState('');
  const [inputRoomId, setInputRoomId] = useState('');
  const [inRoom, setInRoom] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);
  
  // Game States
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [opponentsData, setOpponentsData] = useState<Record<string, any[][]>>({});
  const [gameMessage, setGameMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const baseSpeed = roomData?.config?.baseSpeed || 1000;

  const {
      stage, movePlayer, playerRotate, dropPlayer,
      setDropTime, startGame, gameOver, score, level
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

    return () => { newSocket.close(); };
  }, []);

  useEffect(() => {
    if (gameOver) {
      setIsPlaying(false);
      setGameMessage('Game Over');
    }
  }, [gameOver]);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!nickname.trim() || !inputRoomId.trim()) return;

    socket.emit('join_room', { roomId: inputRoomId, nickname }, (res: any) => {
      if (res.error) {
        setErrorMsg(res.error);
      } else {
        setInRoom(true);
      }
    });
  };

  const move = (e: KeyboardEvent) => {
    if (!isPlaying || isPaused) return;
    if ([37, 38, 39, 40].includes(e.keyCode)) e.preventDefault();

    if (e.keyCode === 37) movePlayer(-1);
    else if (e.keyCode === 39) movePlayer(1);
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

  const isAdmin = socket?.id === roomData?.adminId;

  // Admin Actions
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
          {errorMsg && <p className="error">{errorMsg}</p>}
        </form>
      </div>
    );
  }

  return (
    <div className="game-container">
      <div className="header">
        <h1 className="title">Tetris Multiplayer</h1>
        <p>Sala: <strong>{roomData?.id}</strong> | Jogadores: {roomData?.players?.length}/3</p>
        {isAdmin && <p className="admin-badge">Você é o Admin da Sala</p>}
      </div>

      {!isPlaying && !gameMessage && (
        <div className="lobby-panel">
          <h2>Jogadores na Sala</h2>
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
          <div className="board-wrapper active">
            <h2>Seu Jogo {isPaused && "(PAUSADO)"}</h2>
            <Board stage={stage} />
          </div>

          <div className="stats">
            <div className="stat-box"><div className="stat-label">Score</div><div className="stat-value">{score}</div></div>
            <div className="stat-box"><div className="stat-label">Level</div><div className="stat-value">{level}</div></div>

            {isAdmin && (
              <button className="start-button" onClick={handleTogglePause}>
                {isPaused ? '▶ Retomar' : '⏸ Pausar Todos'}
              </button>
            )}
          </div>

          {roomData?.players?.filter((p:any) => p.id !== socket.id).map((p:any) => (
            <div key={p.id} className="board-wrapper opponent-board-wrapper">
              <div className="opponent-name">{p.nickname}</div>
              <Board stage={opponentsData[p.id] || createBoard()} />
            </div>
          ))}
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
