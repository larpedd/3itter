// Pride flags. "rainbow" and "transgender" are Twemoji graphics (CC-BY 4.0, Twitter Inc. and contributors);
// the rest are drawn for 3itter in the same style, because Twemoji only ships Unicode emoji.
export const FLAGS = [
  { id: 'rainbow', label: 'Rainbow pride', twemoji: true, emoji: '🏳️‍🌈' },
  { id: 'transgender', label: 'Transgender pride', twemoji: true, emoji: '🏳️‍⚧️' },
  { id: 'progress', label: 'Progress pride' },
  { id: 'lesbian', label: 'Lesbian' },
  { id: 'gay', label: 'Gay men' },
  { id: 'bisexual', label: 'Bisexual' },
  { id: 'pansexual', label: 'Pansexual' },
  { id: 'polysexual', label: 'Polysexual' },
  { id: 'asexual', label: 'Asexual' },
  { id: 'demisexual', label: 'Demisexual' },
  { id: 'aromantic', label: 'Aromantic' },
  { id: 'aroace', label: 'Aroace' },
  { id: 'nonbinary', label: 'Non-binary' },
  { id: 'genderfluid', label: 'Genderfluid' },
  { id: 'genderqueer', label: 'Genderqueer' },
  { id: 'agender', label: 'Agender' },
  { id: 'intersex', label: 'Intersex' },
];
export const FLAG_BY_ID = new Map(FLAGS.map((f) => [f.id, f]));
export const MAX_FLAGS = 4;
export const flagSrc = (id) => `/flags/${id}.svg`;
