// 操作の結果に応じた効果音。状態の差分から判断するので、core 側は音を知らなくてよい。

import type { Action } from '../core/game';
import type { GameState } from '../core/types';
import { play, type Sfx } from './sound';

function sfxFor(a: Action, prev: GameState, next: GameState): Sfx | null {
  const ses = next.session;
  switch (a.type) {
    case 'BEGIN_COUNTER':
    case 'NEXT_CUSTOMER':
      return 'bell';
    case 'USE_TOOL':
      return a.tool === 'scale' ? 'scale' : 'tool';
    case 'COMPARE':
      return ses?.chat.at(-1)?.text.startsWith('✔') ? 'match' : 'mismatch';
    case 'POINT_OUT':
    case 'OFFER':
      if (ses?.outcome === 'deal') return 'stamp';
      if (ses?.outcome === 'left') return 'refuse';
      return a.type === 'POINT_OUT' ? 'mismatch' : null;
    case 'ACCEPT_REQUEST':
    case 'BUY_UPGRADE':
    case 'WHOLESALE':
      return 'coin';
    case 'REFUSE':
      return 'refuse';
    case 'REPORT':
      return 'report';
    case 'CHOOSE':
    case 'SHELVE':
      return 'paper';
    case 'PAY_DEBT':
      return 'stamp';
    case 'CLOSE_SHOP':
      return 'night';
    case 'END_NIGHT':
      return next.phase === 'morning' && prev.phase === 'night' ? 'paper' : null;
    default:
      return null;
  }
}

export function feedback(a: Action, prev: GameState, next: GameState, failed: boolean): void {
  const sfx = failed ? 'error' : sfxFor(a, prev, next);
  if (sfx) play(sfx);
}
