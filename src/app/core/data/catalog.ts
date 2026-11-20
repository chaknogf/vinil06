import { PublicOption, RoundPack, Track, VinilTrack } from '../models/game.models';

type TrackSeed = readonly [
  id: string,
  title: string,
  artist: string,
  year: number,
  from: string,
  to: string,
  previewUrl: string
];

const T = (
  packId: string,
  genre: string,
  decade: string,
  seed: TrackSeed,
  index: number
): Track => ({
  id: seed[0] ?? `${packId}-${index}`,
  title: seed[1] ?? '',
  artist: seed[2] ?? '',
  genre,
  year: seed[3] ?? 2000,
  decade,
  bpm: 0,
  palette: [seed[4] ?? '#10b981', seed[5] ?? '#064e3b'],
  motif: index % 4,
  // Preview de iTunes verificado: la carta y el audio son la MISMA pista.
  ...(seed[6] ? { previewUrl: seed[6] } : {})
});

function makePack(
  id: string,
  genre: string,
  decade: string,
  label: string,
  bpm: number,
  seeds: readonly TrackSeed[]
): RoundPack {
  return {
    id,
    genre,
    decade,
    label,
    bpm,
    tracks: seeds.map((seed, i) => ({ ...T(id, genre, decade, seed, i), bpm }))
  };
}

/**
 * Biblioteca curada de 48 canciones en español: pop/bandas, rancheras,
 * baladas y rock en español. Cada pista trae su preview de iTunes verificado
 * (sin login ni clave), asi que la carta y el audio coinciden siempre.
 * 12 grupos de 4 => ninguna pista se repite en 12 rondas.
 */
export const TRACK_PACKS: readonly RoundPack[] = [
  makePack('pk01', 'Pop en Español', '1990s', 'Pop en Español · Bandas', 118, [
    ['es01', 'Rayando el Sol', 'Maná', 1990, '#0ea5e9', '#1e1b4b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/b6/da/75/b6da75b3-1ad4-e98a-3840-b08e5fa87b95/mzaf_3539486135978944992.plus.aac.p.m4a'],
    ['es02', 'Oye Mi Amor', 'Maná', 1997, '#0ea5e9', '#1e1b4b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/90/ca/ae/90caae3e-906e-e180-87f9-5e6595e91104/mzaf_14056589342577674040.plus.aac.p.m4a'],
    ['es03', 'Vivir Sin Aire', 'Maná', 1998, '#0ea5e9', '#1e1b4b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ea/34/20/ea3420e2-9ca5-81cf-6092-bfb0ea8ad107/mzaf_17571325398997973351.plus.aac.p.m4a'],
    ['es07', 'Torero', 'Chayanne', 1999, '#0ea5e9', '#1e1b4b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f1/de/e0/f1dee091-2f3c-262f-a16c-ab0fdbb6e6b1/mzaf_819356996339502348.plus.aac.p.m4a']
  ]),
  makePack('pk02', 'Pop Latino', '2000s', 'Pop Latino · 2000s', 116, [
    ['es04', 'La Camisa Negra', 'Juanes', 2005, '#10b981', '#064e3b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f2/16/c1/f216c1fa-ddc7-a9a1-4f68-e69b26585195/mzaf_11408188001312469777.plus.aac.p.m4a'],
    ['es05', 'A Dios le Pido', 'Juanes', 2002, '#10b981', '#064e3b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/c0/a6/31/c0a631e9-2699-0659-420f-b070cbd57986/mzaf_9234358422951205271.plus.aac.p.m4a'],
    ['es06', 'Fotografía', 'Juanes', 2002, '#10b981', '#064e3b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/06/87/42/0687421a-2177-77c0-a752-b304a64a3249/mzaf_4226900691019473495.plus.aac.p.m4a'],
    ['es08', 'Livin\' la Vida Loca', 'Ricky Martin', 1999, '#10b981', '#064e3b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/08/a7/cb/08a7cb6d-0618-3c01-6b80-2b92aaca7406/mzaf_15654413058067067771.plus.aac.p.m4a']
  ]),
  makePack('pk03', 'Pop Latino', '2010s', 'Pop Latino · 2010s', 108, [
    ['es09', 'Bailando', 'Enrique Iglesias', 2014, '#f43f5e', '#4c0519', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/7a/ca/26/7aca26e2-4714-547f-1a5e-5021dd46b4ef/mzaf_1366453414026826794.plus.aac.p.m4a'],
    ['es10', 'La Bicicleta', 'Carlos Vives & Shakira', 2016, '#f43f5e', '#4c0519', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/cf/20/03/cf200302-b52d-33f2-9b24-ec2e0e666a7e/mzaf_8806975677447196178.plus.aac.p.m4a'],
    ['es11', 'Vivir Mi Vida', 'Marc Anthony', 2013, '#f43f5e', '#4c0519', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/75/fd/9e/75fd9e68-a73f-35c6-66ef-0dc055432887/mzaf_6065202081604806796.plus.aac.p.m4a'],
    ['es12', 'Suerte', 'Shakira', 2001, '#f43f5e', '#4c0519', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/70/2a/34/702a34d1-5cb8-d7ed-d9d8-5f048443cf85/mzaf_8632474165195497463.plus.aac.p.m4a']
  ]),
  makePack('pk04', 'Ranchera', '1990s', 'Rancheras Clásicas', 96, [
    ['es13', 'El Rey', 'Vicente Fernández', 1994, '#f59e0b', '#451a03', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/17/cb/9b/17cb9bb6-bfef-8622-4dd2-1365cb2a97f3/mzaf_15943127848695173612.plus.aac.p.m4a'],
    ['es14', 'Volver, Volver', 'Vicente Fernández', 1990, '#f59e0b', '#451a03', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/93/6f/b7/936fb77e-eb28-81be-6cc8-0f7ce21cb0c9/mzaf_14979206124320543359.plus.aac.p.m4a'],
    ['es15', 'Estos Celos', 'Vicente Fernández', 2000, '#f59e0b', '#451a03', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/c9/1c/67/c91c6777-3551-660f-70b4-c1ab721ae98d/mzaf_6869464134850689849.plus.aac.p.m4a'],
    ['es16', 'Jefe de Jefes', 'Los Tigres del Norte', 2001, '#f59e0b', '#451a03', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/6d/18/48/6d18488d-a406-b1d2-c9ca-ad8c4fe7c656/mzaf_16859594890034153362.plus.aac.p.m4a']
  ]),
  makePack('pk05', 'Ranchera', '2000s', 'Rancheras y Corridos', 100, [
    ['es17', 'Contrabando y Traición', 'Los Tigres del Norte', 1998, '#ec4899', '#3b0764', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/41/ca/d0/41cad082-e361-5f31-248e-014ce098ffbe/mzaf_2369515448559641717.plus.aac.p.m4a'],
    ['es18', 'El Viajero', 'Luis Miguel', 2002, '#ec4899', '#3b0764', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/08/3b/f7/083bf752-14e3-47fe-e4b3-64a9a1ccfb70/mzaf_3589972807316630490.plus.aac.p.m4a'],
    ['es19', 'Como Quien Pierde una Estrella', 'Alejandro Fernández', 1998, '#ec4899', '#3b0764', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/ba/ac/93/baac9371-3928-0514-f310-f4faa377b66b/mzaf_17245420888255756369.plus.aac.p.m4a'],
    ['es20', 'Por Mujeres Como Tú', 'Pepe Aguilar', 2000, '#ec4899', '#3b0764', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/4a/ee/c1/4aeec16e-bc5a-d0fc-9df8-f62f1f94e81a/mzaf_6473851016880103805.plus.aac.p.m4a']
  ]),
  makePack('pk06', 'Ranchera', '2000s', 'Banda y Rancheras', 105, [
    ['es21', 'Hermoso Cariño', 'Banda Rancho Viejo de Julio Arámburo', 2005, '#14b8a6', '#042f2e', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview122/v4/a6/32/6b/a6326b23-b60c-9171-ea91-21c4b9398956/mzaf_1497553370568468163.plus.aac.p.m4a'],
    ['es22', 'Secreto de Amor', 'Joan Sebastian', 2000, '#14b8a6', '#042f2e', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/78/24/61/782461c5-538c-7b51-f1d6-47f3db6d1eb5/mzaf_1011051549015327300.plus.aac.p.m4a'],
    ['es23', 'La Puerta Negra', 'Los Tigres del Norte', 2005, '#14b8a6', '#042f2e', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/c6/41/bf/c641bf65-ce0e-c2ec-6d28-8dfe047ecc84/mzaf_8929789596018272020.plus.aac.p.m4a'],
    ['es24', 'El Sinaloense', 'Banda El Recodo', 2000, '#14b8a6', '#042f2e', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/6c/96/26/6c9626cd-82c1-95b6-f718-26ae2267a358/mzaf_1025647949205667489.plus.aac.p.m4a']
  ]),
  makePack('pk07', 'Balada', '1990s', 'Baladas en Español · 90s', 92, [
    ['es25', 'La Incondicional', 'Luis Miguel', 1990, '#6366f1', '#1e1b4b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/a2/d6/5e/a2d65ea2-9499-a8a1-42cf-eb8936541f06/mzaf_9722074846622436262.plus.aac.p.m4a'],
    ['es26', 'Ayer', 'Luis Miguel', 1993, '#6366f1', '#1e1b4b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/d3/f1/19/d3f11918-bc1f-8729-c888-e18eefb30d3a/mzaf_13289794715193042596.plus.aac.p.m4a'],
    ['es27', 'Corazón Partío', 'Alejandro Sanz', 1997, '#6366f1', '#1e1b4b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/82/70/a0/8270a04d-a979-49cf-7a72-bf33882481a1/mzaf_316092880046968071.plus.aac.p.m4a'],
    ['es28', 'Mi Soledad y Yo', 'Alejandro Sanz', 1995, '#6366f1', '#1e1b4b', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/6a/a0/06/6aa006a8-eff3-9212-2df7-4e5be94c59ae/mzaf_5230753564366991033.plus.aac.p.m4a']
  ]),
  makePack('pk08', 'Balada', '1980s', 'Baladas Románticas', 88, [
    ['es29', 'Experiencia Religiosa', 'Enrique Iglesias', 1996, '#d97706', '#311606', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/63/ab/42/63ab422f-394c-7511-67d3-bf49c0fb3f5e/mzaf_3493085592046519743.plus.aac.p.m4a'],
    ['es30', 'El Triste', 'José José', 1980, '#d97706', '#311606', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/a8/7f/d5/a87fd57e-2afc-2be7-59f8-20f716733ca6/mzaf_14106197806223623594.plus.aac.p.m4a'],
    ['es31', 'Vuelve', 'Ricky Martin', 1998, '#d97706', '#311606', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ba/df/c7/badfc740-6642-d843-1428-39dbb2cc1bcb/mzaf_9062245046215460176.plus.aac.p.m4a'],
    ['es32', 'Amor Eterno', 'Juan Gabriel', 1995, '#d97706', '#311606', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/44/32/a2/4432a284-6bb1-a482-dfe2-2aeae22e7c31/mzaf_3411974389889665103.plus.aac.p.m4a']
  ]),
  makePack('pk09', 'Balada', '1990s', 'Baladas en Español', 94, [
    ['es33', 'No Basta', 'Franco De Vita', 1992, '#8b5cf6', '#2e1065', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/c7/a6/2b/c7a62b00-443f-2e3e-ef01-f9e237c2993d/mzaf_2582111391947441833.plus.aac.p.m4a'],
    ['es34', 'Mujeres', 'Ricardo Arjona', 1994, '#8b5cf6', '#2e1065', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/43/42/62/434262e7-8ab5-287c-483e-ec3b11f67ddf/mzaf_9901606721822881687.plus.aac.p.m4a'],
    ['es35', 'Me olvidé de vivir', 'Julio Iglesias', 1988, '#8b5cf6', '#2e1065', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/27/4e/ec/274eece8-48d2-fd90-04ab-024de3ea8ede/mzaf_18095064519649855975.plus.aac.p.m4a'],
    ['es36', 'Un Siglo Sin Ti', 'Chayanne', 1999, '#8b5cf6', '#2e1065', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/c1/61/2f/c1612f8f-d211-e99d-c125-3df2ad5314f5/mzaf_8518661757131938498.plus.aac.p.m4a']
  ]),
  makePack('pk10', 'Rock en Español', '1990s', 'Rock en Español · 90s', 124, [
    ['es37', 'De Música Ligera', 'Soda Stereo', 1990, '#3b82f6', '#0f172a', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/95/6e/1a/956e1a22-49ff-3714-b5b9-c0e93be9e977/mzaf_4047724057514631474.plus.aac.p.m4a'],
    ['es38', 'Signos', 'Soda Stereo', 1986, '#3b82f6', '#0f172a', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/7e/7b/ff/7e7bffe1-544a-b1c9-1f1f-33fe80c5accb/mzaf_12016720987884945416.plus.aac.p.m4a'],
    ['es39', 'Persiana Americana', 'Soda Stereo', 1987, '#3b82f6', '#0f172a', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/45/8f/6b/458f6b6a-a1f6-e7a3-3ad4-d605bfda8ef7/mzaf_1608050626101804857.plus.aac.p.m4a'],
    ['es40', 'Nada Personal', 'Soda Stereo', 1984, '#3b82f6', '#0f172a', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/f8/71/2b/f8712b45-1f8b-f653-a68d-0de443b48ea8/mzaf_16182475010727726340.plus.aac.p.m4a']
  ]),
  makePack('pk11', 'Rock en Español', '1990s', 'Rock en Español · Clásicos', 120, [
    ['es41', 'Lamento Boliviano', 'Los Enanitos Verdes', 1994, '#dc2626', '#450a0a', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/e1/49/1d/e1491d20-3d33-abc4-5f44-6c40e4f1ff7c/mzaf_13365413838881411225.plus.aac.p.m4a'],
    ['es42', 'La Flaca', 'Jarabe de Palo', 1996, '#dc2626', '#450a0a', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/59/8f/f1/598ff10e-0c1c-d1e1-6528-133f108188af/mzaf_1557029401913856762.plus.aac.p.m4a'],
    ['es43', 'Depende', 'Jarabe de Palo', 1997, '#dc2626', '#450a0a', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/96/d8/c3/96d8c3fe-cb7d-35a2-e76d-516ad12a985d/mzaf_11537661405233311863.plus.aac.p.m4a'],
    ['es44', 'Avalancha', 'Héroes del Silencio', 1995, '#dc2626', '#450a0a', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview115/v4/ed/f9/b0/edf9b012-a8ee-d19c-88a1-02d2b0df7aad/mzaf_184528612545041730.plus.aac.p.m4a']
  ]),
  makePack('pk12', 'Rock en Español', '2000s', 'Rock Alternativo en Español', 128, [
    ['es45', 'Bolero Falaz', 'Aterciopelados', 1994, '#eab308', '#3f2e05', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/82/49/5f/82495f22-5f22-0225-98e8-500759eca8d0/mzaf_2653437483458542530.plus.aac.p.m4a'],
    ['es46', 'Matador', 'Los Fabulosos Cadillacs', 1994, '#eab308', '#3f2e05', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/5e/02/80/5e02801d-a567-1a73-63dd-b901f4dc27e3/mzaf_2001579713373822712.plus.aac.p.m4a'],
    ['es47', 'Gimme Tha Power', 'Molotov', 2003, '#eab308', '#3f2e05', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview221/v4/8c/25/e9/8c25e940-ef14-6871-10d2-ac532107a8eb/mzaf_16900766185282388623.plus.aac.p.m4a'],
    ['es48', 'Eres', 'Café Tacvba', 1996, '#eab308', '#3f2e05', 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview211/v4/ca/b6/88/cab68811-39fe-97bb-47da-7903fb274e07/mzaf_4817666131173906366.plus.aac.p.m4a']
  ])
];

export const GENRES: readonly string[] = [...new Set(TRACK_PACKS.map((p) => p.genre))];
export const DECADES: readonly string[] = [...new Set(TRACK_PACKS.map((p) => p.decade))];

export const KARAOKE_CHALLENGES: readonly string[] = [
  'Canta el estribillo con la misma energía que el original',
  'Canta una estrofa sin parar de respirar',
  'Imita el estilo vocal del artista durante 15 segundos',
  'Canta con el volumen al máximo y haz un gesto final',
  'Canta la canción como si fuera una balada lenta',
  'Canta y baila a la vez sin perder el ritmo'
];

export function trackToOption(track: Track | VinilTrack): PublicOption {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    palette: track.palette,
    motif: track.motif,
    ...('cover' in track && track.cover ? { cover: track.cover } : {}),
    ...(track.spotifyUri ? { spotifyUri: track.spotifyUri } : {}),
    ...(track.youtubeVideoId ? { youtubeVideoId: track.youtubeVideoId } : {})
  };
}
