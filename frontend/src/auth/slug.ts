/** "SVMIT College!" -> "svmit-college". Mirrors the backend's slug rule. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD') // split accents off letters: "é" -> "e" + accent
    .replace(/[̀-ͯ]/g, '') // drop the accents
    .replace(/[^a-z0-9]+/g, '-') // anything else becomes a hyphen
    .replace(/^-+|-+$/g, '') // no hyphens at the ends
    .slice(0, 50)
    .replace(/-+$/g, '')
}
