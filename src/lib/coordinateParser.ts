export interface ParsedCoordinates {
  lat: number | null;
  lng: number | null;
}

const INVALID_COORDS: ParsedCoordinates = { lat: NaN, lng: NaN };

const toNumber = (value: string) => {
  const trimmed = value.trim();
  if (trimmed.includes(",")) {
    return Number(trimmed.replace(/\./g, "").replace(",", "."));
  }

  const dotParts = trimmed.split(".");
  if (dotParts.length > 2 || (dotParts.length === 2 && dotParts[1].length === 3 && dotParts[0].length > 2)) {
    return Number(trimmed.replace(/\./g, ""));
  }

  return Number(trimmed);
};

const isValidLatLng = (lat: number, lng: number) =>
  Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;

const looksLikeBrazilLat = (value: number) => value >= -35 && value <= 8;
const looksLikeBrazilLng = (value: number) => value >= -75 && value <= -30;

const directionSign = (direction: string) => {
  const normalized = direction.toUpperCase();
  return normalized === "S" || normalized === "W" || normalized === "O" ? -1 : 1;
};

const parseDirectionalCoordinates = (input: string): ParsedCoordinates | null => {
  const matches = Array.from(
    input.matchAll(
      /(\d{1,3}(?:[.,]\d+)?)(?:\s*[°º]\s*(\d{1,2}(?:[.,]\d+)?)?)?(?:\s*['’′]\s*(\d{1,2}(?:[.,]\d+)?)?)?(?:\s*(?:"|”|″))?\s*([NSEWOL])/gi,
    ),
  );

  if (!matches.length) return null;

  let lat: number | null = null;
  let lng: number | null = null;

  for (const match of matches) {
    const degrees = toNumber(match[1]);
    const minutes = match[2] ? toNumber(match[2]) : 0;
    const seconds = match[3] ? toNumber(match[3]) : 0;
    const direction = match[4].toUpperCase();
    const decimal = directionSign(direction) * (degrees + minutes / 60 + seconds / 3600);

    if (direction === "N" || direction === "S") lat = decimal;
    if (direction === "E" || direction === "W" || direction === "O" || direction === "L") lng = decimal;
  }

  return lat !== null && lng !== null && isValidLatLng(lat, lng) ? { lat, lng } : null;
};

const utmToLatLng = (zone: number, zoneLetter: string, easting: number, northing: number): ParsedCoordinates | null => {
  if (zone < 1 || zone > 60 || easting < 100000 || easting > 900000 || northing < 0 || northing > 10000000) {
    return null;
  }

  const a = 6378137;
  const eccSquared = 0.00669438;
  const k0 = 0.9996;
  const eccPrimeSquared = eccSquared / (1 - eccSquared);
  const e1 = (1 - Math.sqrt(1 - eccSquared)) / (1 + Math.sqrt(1 - eccSquared));
  const x = easting - 500000;
  let y = northing;

  if (zoneLetter.toUpperCase() < "N") y -= 10000000;

  const longOrigin = (zone - 1) * 6 - 180 + 3;
  const m = y / k0;
  const mu = m / (a * (1 - eccSquared / 4 - (3 * eccSquared ** 2) / 64 - (5 * eccSquared ** 3) / 256));

  const phi1Rad =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu);

  const n1 = a / Math.sqrt(1 - eccSquared * Math.sin(phi1Rad) ** 2);
  const t1 = Math.tan(phi1Rad) ** 2;
  const c1 = eccPrimeSquared * Math.cos(phi1Rad) ** 2;
  const r1 = (a * (1 - eccSquared)) / (1 - eccSquared * Math.sin(phi1Rad) ** 2) ** 1.5;
  const d = x / (n1 * k0);

  const latRad =
    phi1Rad -
    ((n1 * Math.tan(phi1Rad)) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * eccPrimeSquared) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 ** 2 - 252 * eccPrimeSquared - 3 * c1 ** 2) * d ** 6) / 720);

  const lngRad =
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 ** 2 + 8 * eccPrimeSquared + 24 * t1 ** 2) * d ** 5) / 120) /
    Math.cos(phi1Rad);

  const lat = (latRad * 180) / Math.PI;
  const lng = longOrigin + (lngRad * 180) / Math.PI;

  return isValidLatLng(lat, lng) ? { lat, lng } : null;
};

const parseUtmCoordinates = (input: string): ParsedCoordinates | null => {
  const zoneMatch = input.match(/\b([1-9]|[1-5]\d|60)\s*([C-HJ-NP-X])\b/i);
  if (!zoneMatch) return null;

  const zone = Number(zoneMatch[1]);
  const zoneLetter = zoneMatch[2].toUpperCase();
  const values = Array.from(input.matchAll(/[-+]?\d[\d.,]*/g))
    .map((match) => toNumber(match[0]))
    .filter((value) => Number.isFinite(value) && value > 1000);

  const easting = values.find((value) => value >= 100000 && value <= 900000);
  const northing = values.find((value) => value !== easting && value >= 0 && value <= 10000000);

  return easting && northing ? utmToLatLng(zone, zoneLetter, easting, northing) : null;
};

export function parseCoordinatesInput(input: string): ParsedCoordinates {
  const value = input.trim();
  if (!value) return { lat: null, lng: null };

  const directional = parseDirectionalCoordinates(value);
  if (directional) return directional;

  const utm = parseUtmCoordinates(value);
  if (utm) return utm;

  const numbers = Array.from(value.matchAll(/[-+]?\d+(?:[.,]\d+)?/g)).map((match) => toNumber(match[0]));
  if (numbers.length < 2) return INVALID_COORDS;

  const [first, second] = numbers;

  if (looksLikeBrazilLng(first) && looksLikeBrazilLat(second)) {
    return { lat: second, lng: first };
  }

  if (isValidLatLng(first, second)) {
    return { lat: first, lng: second };
  }

  if (isValidLatLng(second, first)) {
    return { lat: second, lng: first };
  }

  return INVALID_COORDS;
}