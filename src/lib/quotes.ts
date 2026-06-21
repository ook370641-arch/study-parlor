export type Quote = {
  id: string
  text: string
  original?: string
  author: string
  authorOriginal?: string
  source?: string
}

export const quotes: Quote[] = [
  {
    id: 'blanchot-01',
    text: '写作，就是走向那个永不到来的终点。',
    original: "Écrire, c'est cheminer vers ce point où l'on n'arrive jamais.",
    author: '莫里斯·布朗肖',
    authorOriginal: 'Maurice Blanchot',
  },
  {
    id: 'kafka-01',
    text: '一本书必须像一把冰镐，击碎我们内心的冰海。',
    original: 'Ein Buch muß die Axt sein für das gefrorene Meer in uns.',
    author: '弗兰茨·卡夫卡',
    authorOriginal: 'Franz Kafka',
  },
  {
    id: 'borges-01',
    text: '天堂应该是图书馆的模样。',
    original: 'He imaginado el Paraíso bajo la especie de una biblioteca.',
    author: '豪尔赫·路易斯·博尔赫斯',
    authorOriginal: 'Jorge Luis Borges',
  },
  {
    id: 'calvino-01',
    text: '阅读即写作，每一次阅读都在重写文本。',
    author: '伊塔洛·卡尔维诺',
    authorOriginal: 'Italo Calvino',
  },
  {
    id: 'pessoa-01',
    text: '我的心略大于整个宇宙。',
    original: 'O meu coração é um pouco maior que o universo inteiro.',
    author: '费尔南多·佩索阿',
    authorOriginal: 'Fernando Pessoa',
  },
  {
    id: 'rilke-01',
    text: '你要爱你的寂寞。',
    original: 'Liebe deine Einsamkeit.',
    author: '赖内·马利亚·里尔克',
    authorOriginal: 'Rainer Maria Rilke',
  },
  {
    id: 'benjamin-01',
    text: '收藏是记忆对抗遗忘的斗争。',
    author: '瓦尔特·本雅明',
    authorOriginal: 'Walter Benjamin',
  },
  {
    id: 'wangzengqi-01',
    text: '人间烟火气，最抚凡人心。',
    author: '汪曾祺',
  },
]

export function pickRandomQuote(
  options: { excludeId?: string | null; pool?: Quote[] } = {}
): Quote | null {
  const pool = options.pool ?? quotes
  const excludeId = options.excludeId ?? null
  const filtered = excludeId ? pool.filter(q => q.id !== excludeId) : pool
  if (filtered.length === 0) return null
  return filtered[Math.floor(Math.random() * filtered.length)]
}
