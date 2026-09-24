/**
 * 저장소 — localStorage.
 *
 * 주의: file:// 로 연 경우 크롬은 모든 로컬 HTML 파일이 localStorage 한 칸을 같이 쓴다(origin 이 "file://").
 * 다른 로컬 HTML 과 키가 겹치지 않게 반드시 PREFIX 를 붙여 쓴다. 파일 이름·위치를 바꿔도 저장은 유지된다.
 * 브라우저가 다르면(크롬↔엣지) 저장도 따로다.
 */
const PREFIX = 'sikdae-tycoon:';

export const storage = {
  save(key: string, data: unknown): void {
    try {
      localStorage.setItem(PREFIX + key, JSON.stringify(data));
    } catch (e) {
      console.warn('[storage] save 실패', key, e);
    }
  },
  load<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw == null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  remove(key: string): void {
    try {
      localStorage.removeItem(PREFIX + key);
    } catch {
      /* 무시 */
    }
  },
};
