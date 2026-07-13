// 카카오맵 SDK 로더 + 주소→좌표(geocoding) 유틸. (#270 회사 위치 지도)
// NEXT_PUBLIC_KAKAO_MAP_KEY 가 있어야 동작한다(공개 JavaScript 키, 클라이언트 노출 OK).

const KAKAO_KEY = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;

interface KakaoLatLng {
  getLat(): number;
  getLng(): number;
}
interface KakaoGeocoderResult {
  x: string;
  y: string;
}
interface KakaoGeocoder {
  addressSearch(
    address: string,
    callback: (result: KakaoGeocoderResult[], status: string) => void,
  ): void;
}
interface KakaoMapInstance {
  setCenter(latlng: KakaoLatLng): void;
}
interface KakaoMaps {
  load(callback: () => void): void;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMapInstance;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  Marker: new (options: { position: KakaoLatLng; map?: KakaoMapInstance }) => unknown;
  services: {
    Geocoder: new () => KakaoGeocoder;
    Status: { OK: string };
  };
}
declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

export function isKakaoMapConfigured(): boolean {
  return Boolean(KAKAO_KEY);
}

let loadPromise: Promise<KakaoMaps> | null = null;

export function loadKakaoMaps(): Promise<KakaoMaps> {
  if (!KAKAO_KEY) return Promise.reject(new Error("kakao map key missing"));
  if (typeof window === "undefined") return Promise.reject(new Error("window unavailable"));
  if (window.kakao?.maps?.Map) return Promise.resolve(window.kakao.maps);
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<KakaoMaps>((resolve, reject) => {
    const onReady = () => {
      if (!window.kakao?.maps) {
        reject(new Error("kakao maps unavailable"));
        return;
      }
      window.kakao.maps.load(() => resolve(window.kakao!.maps));
    };
    const existing = document.querySelector<HTMLScriptElement>("script[data-kakao-maps]");
    if (existing) {
      existing.addEventListener("load", onReady);
      existing.addEventListener("error", () => reject(new Error("kakao maps load failed")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${KAKAO_KEY}&autoload=false&libraries=services`;
    script.async = true;
    script.dataset.kakaoMaps = "true";
    script.onload = onReady;
    script.onerror = () => reject(new Error("kakao maps load failed"));
    document.head.appendChild(script);
  });
  return loadPromise;
}

// 주소를 위경도로 변환한다. 키가 없거나 실패하면 null.
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  if (!address.trim()) return null;
  try {
    const maps = await loadKakaoMaps();
    return await new Promise((resolve) => {
      const geocoder = new maps.services.Geocoder();
      geocoder.addressSearch(address, (result, status) => {
        if (status === maps.services.Status.OK && result[0]) {
          resolve({ lat: Number(result[0].y), lng: Number(result[0].x) });
        } else {
          resolve(null);
        }
      });
    });
  } catch {
    return null;
  }
}
