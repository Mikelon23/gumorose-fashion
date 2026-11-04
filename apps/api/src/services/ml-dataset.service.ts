/**
 * Servicio de autenticación, perfilado y Dataset Machine Learning.
 * Registra filas del dataset, sincroniza el UserProfile y calcula
 * recomendaciones con computeMlGarmentAffinity (coseno + KNN ponderado).
 */
import { randomUUID } from 'node:crypto';
import { computeMlGarmentAffinity, round2, topStyleTag } from '@gumorose/shared';
import type {
  GarmentCategory,
  MlDatasetCluster,
  MlProductRecommendation,
  MlRegisterOrLoginInput,
  MlUserPreferenceRecord,
} from '@gumorose/shared';
import type { Store } from '../store.js';

export function registerOrLoginMlUser(
  store: Store,
  input: MlRegisterOrLoginInput,
): MlUserPreferenceRecord {
  const existingById = input.userId ? store.mlPreferences.get(input.userId) : undefined;
  const existingByDocument =
    existingById ??
    [...store.mlPreferences.values()].find((r) => r.cedulaOrRuc === input.cedulaOrRuc);
  const userId = existingByDocument?.userId ?? input.userId ?? randomUUID();
  const styleDnaVector: Record<string, number> = { ...(input.styleDnaVector ?? {}) };
  if (Object.keys(styleDnaVector).length === 0 && input.stylePreferences?.length) {
    const pct = Math.round(100 / input.stylePreferences.length);
    for (const tag of input.stylePreferences) styleDnaVector[tag] = pct;
  }
  const record: MlUserPreferenceRecord = {
    userId,
    cedulaOrRuc: input.cedulaOrRuc,
    age: input.age,
    genderFit: input.genderFit,
    region: input.region,
    city: input.city,
    climateTempC: input.climateTempC,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    preferredFit: input.preferredFit,
    favoriteColorsHex: input.favoriteColorsHex.map((c) => c.toUpperCase()),
    preferredCategories: input.preferredCategories ?? [],
    styleDnaVector,
    totalPurchases: input.totalPurchases ?? existingByDocument?.totalPurchases ?? 0,
    avgTicketUsd: input.avgTicketUsd ?? existingByDocument?.avgTicketUsd ?? 0,
    registeredAt: existingByDocument?.registeredAt ?? new Date().toISOString(),
    fullName: input.fullName,
    name: input.fullName,
    email: input.email,
    phone: input.phone,
  };
  store.mlPreferences.set(userId, record);
  store.users.set(userId, {
    id: userId,
    currentRegion: record.region,
    city: record.city,
    styleDna: record.styleDnaVector,
    styleShuffleVotes: store.users.get(userId)?.styleShuffleVotes,
    bodyAnchors: store.users.get(userId)?.bodyAnchors,
    fullBodyPhotoUrl: store.users.get(userId)?.fullBodyPhotoUrl,
  });
  return record;
}

export function getMlRecommendations(
  store: Store,
  userId: string,
): { user: MlUserPreferenceRecord; recommendations: MlProductRecommendation[] } | null {
  const user = store.mlPreferences.get(userId);
  if (!user) return null;
  const recommendations = [...store.garments.values()]
    .filter((g) => g.active)
    .map((garment) => computeMlGarmentAffinity(user, garment))
    .sort((a, b) => b.affinityScorePct - a.affinityScorePct);
  return { user, recommendations };
}

export function getMlDataset(store: Store): {
  total: number;
  records: MlUserPreferenceRecord[];
  clusters: MlDatasetCluster[];
  metrics: Record<string, unknown>;
} {
  const records = [...store.mlPreferences.values()];
  const groups = new Map<string, MlUserPreferenceRecord[]>();
  for (const record of records) {
    const key = `${record.region}-${record.preferredFit}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  const clusters: MlDatasetCluster[] = [...groups.entries()].map(([key, rows]) => {
    const categories = new Map<GarmentCategory, number>();
    const colors = new Map<string, number>();
    const dna: Record<string, number> = {};
    for (const row of rows) {
      for (const category of row.preferredCategories) {
        categories.set(category, (categories.get(category) ?? 0) + 1);
      }
      for (const color of row.favoriteColorsHex) colors.set(color, (colors.get(color) ?? 0) + 1);
      for (const [tag, pct] of Object.entries(row.styleDnaVector)) {
        dna[tag] = (dna[tag] ?? 0) + pct / rows.length;
      }
    }
    return {
      key,
      region: rows[0]!.region,
      dominantFit: rows[0]!.preferredFit,
      dominantStyleTag: topStyleTag(dna),
      userCount: rows.length,
      avgAge: round2(rows.reduce((acc, r) => acc + r.age, 0) / rows.length),
      avgTicketUsd: round2(rows.reduce((acc, r) => acc + r.avgTicketUsd, 0) / rows.length),
      topCategories: [...categories.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
      topColorsHex: [...colors.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c),
    };
  });
  const byRegion: Record<string, number> = {};
  for (const record of records) byRegion[record.region] = (byRegion[record.region] ?? 0) + 1;
  return {
    total: records.length,
    records,
    clusters,
    metrics: {
      totalUsers: records.length,
      clusters: clusters.length,
      byRegion,
      avgAge: records.length
        ? round2(records.reduce((acc, r) => acc + r.age, 0) / records.length)
        : 0,
      avgTicketUsd: records.length
        ? round2(records.reduce((acc, r) => acc + r.avgTicketUsd, 0) / records.length)
        : 0,
    },
  };
}

const CSV_COLUMNS: Array<keyof MlUserPreferenceRecord> = [
  'userId',
  'cedulaOrRuc',
  'age',
  'genderFit',
  'region',
  'city',
  'climateTempC',
  'heightCm',
  'weightKg',
  'preferredFit',
  'favoriteColorsHex',
  'preferredCategories',
  'styleDnaVector',
  'totalPurchases',
  'avgTicketUsd',
  'registeredAt',
  'fullName',
  'email',
  'phone',
];

function csvCell(value: unknown): string {
  const text =
    value === undefined || value === null
      ? ''
      : Array.isArray(value)
        ? value.join(';')
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function mlDatasetToCsv(records: MlUserPreferenceRecord[]): string {
  const header = CSV_COLUMNS.join(',');
  const lines = records.map((record) =>
    CSV_COLUMNS.map((column) => csvCell(record[column])).join(','),
  );
  return [header, ...lines].join('\n');
}
