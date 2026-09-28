/**
 * 다음에 열 영업일의 지도 인자 (설계서 5-2): 씨앗 = hash(S.started, S.runs, 상권, 방향), 누적 영업일 = S.runs + 1.
 * 같은 영업일에 다시 열면 같은 지도, 영업일이 지나면 새 지도.
 */
import type { DistrictId, Orient } from '../data';
import { S } from '../state';
import { mapSeed } from './gen';

export function todayMap(orient: Orient, did: DistrictId = S.district): { seed: number; day: number } {
  return { seed: mapSeed(S.started, S.runs, did, orient), day: S.runs + 1 };
}

/** 한 프레임 쉬기(와이프가 덮고 있는 동안 생성과 굽기를 나눠서). 숨김 탭에서도 멈추지 않게 setTimeout 도 같이 */
export function breath(): Promise<void> {
  return new Promise((res) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      res();
    };
    requestAnimationFrame(go);
    setTimeout(go, 40);
  });
}
