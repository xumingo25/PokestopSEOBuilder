export interface ParsedDescription {
  cleanText: string;
  summary: string;
  features: string[];
}

export function parseHtmlDescription(html: string): ParsedDescription {
  const template = document.createElement('template');
  template.innerHTML = html || '';

  const listItems = Array.from(template.content.querySelectorAll('li'))
    .map((item) => item.textContent?.trim() ?? '')
    .filter(Boolean);

  const text = (template.content.textContent ?? html)
    .replace(/\s+/g, ' ')
    .trim();

  return {
    cleanText: text,
    summary: truncateAtWord(text, 170),
    features: listItems.slice(0, 6)
  };
}

export function truncateAtWord(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  const slice = value.slice(0, maxLength - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const safeText = lastSpace > 80 ? slice.slice(0, lastSpace) : slice;

  return `${safeText.trim()}...`;
}
