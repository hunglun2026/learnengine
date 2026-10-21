// 房間連線 hook。前端只要拿到 state / questions / you 就能畫畫面，
// 斷線重連、狀態合併這些髒活都在這裡處理掉。
import { useCallback, useEffect, useRef, useState } from "react";
import type { ClientMessage, Player, PublicQuestion, Question, RoomState, ServerMessage } from "../types.ts";

export type ConnStatus = "connecting" | "open" | "closed";

export interface UseRoomOptions {
  /** worker 的網址，例如 https://quiz.hunglun.com */
  host: string;
  roomId: string;
  /** 老師端帶 hostToken；學生端帶 playerId + name */
  identity:
    | { role: "host"; hostToken: string }
    | { role: "player"; playerId: string; name: string; linkedUserId?: string | null };
}

export function useRoom({ host, roomId, identity }: UseRoomOptions) {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [state, setState] = useState<RoomState | null>(null);
  const [questions, setQuestions] = useState<PublicQuestion[]>([]);
  const [you, setYou] = useState<Player | null>(null);
  /** 交卷或結束後才拿得到的正解 */
  const [revealed, setRevealed] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const retryRef = useRef(0);
  const closedByUs = useRef(false);

  const send = useCallback((msg: ClientMessage) => {
    const s = socketRef.current;
    if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(msg));
  }, []);

  useEffect(() => {
    if (!host || !roomId) return;
    closedByUs.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const url = new URL(host);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.pathname = `/parties/quiz-room/${roomId}`;
      const ws = new WebSocket(url.toString());
      socketRef.current = ws;
      setStatus("connecting");

      ws.onopen = () => {
        setStatus("open");
        retryRef.current = 0;
        const id = identityRef.current;
        send(
          id.role === "host"
            ? { type: "JOIN", role: "host", hostToken: id.hostToken }
            : {
                type: "JOIN",
                role: "player",
                playerId: id.playerId,
                name: id.name,
                linkedUserId: id.linkedUserId ?? null,
              }
        );
      };

      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        switch (msg.type) {
          case "STATE":
            setState(msg.state);
            setQuestions(msg.questions);
            if (msg.you) setYou(msg.you);
            break;
          case "PLAYER_UPDATE":
            // 老師端要更新名單裡的那一個人；學生端更新的是自己
            setState((prev) =>
              prev ? { ...prev, players: { ...prev.players, [msg.player.id]: msg.player } } : prev
            );
            setYou((prev) => (prev && prev.id === msg.player.id ? msg.player : prev));
            break;
          case "REVEAL":
            setRevealed(msg.questions);
            break;
          case "ERROR":
            setError(msg.message);
            break;
        }
      };

      ws.onclose = () => {
        setStatus("closed");
        if (closedByUs.current) return;
        // 上課現場的網路會抖，退避重連而不是放棄
        const delay = Math.min(10_000, 500 * 2 ** retryRef.current);
        retryRef.current += 1;
        timer = setTimeout(connect, delay);
      };
    };

    connect();
    return () => {
      closedByUs.current = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
    };
  }, [host, roomId, send]);

  return { status, state, questions, you, revealed, error, setError, send };
}

/** 學生的 playerId 要跟著這台裝置，重整或換分頁都是同一個人 */
export function getOrCreatePlayerId(storageKey = "learnengine_player_id"): string {
  const saved = localStorage.getItem(storageKey);
  if (saved) return saved;
  const id = crypto.randomUUID();
  localStorage.setItem(storageKey, id);
  return id;
}
