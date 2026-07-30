export function canonicalArticleUrl(value) {
  try {
    const url = new URL(String(value || ""));
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|oc|gclid|fbclid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

export function canonicalArticleTitle(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^(?:【?(?:速報|続報|独自|緊急)】?|\b(?:breaking|exclusive|update|live)\b)[\s　:：-]*/i, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function articleSourceKey(item) {
  const source = String(item?.source || "").normalize("NFKC").toLowerCase().replace(/\s+/g, " ").trim();
  if (/\bwhite house\b|whitehouse\.gov/.test(source)) return "whitehouse.gov";
  if (source) return source;
  try {
    const host = new URL(String(item?.url || "")).hostname.toLowerCase().replace(/^www\./, "");
    return host === "news.google.com" ? "" : host;
  } catch {
    return "";
  }
}

export function isSameArticle(left, right) {
  const leftUrl = left?.articleUrlKey || canonicalArticleUrl(left?.url);
  const rightUrl = right?.articleUrlKey || canonicalArticleUrl(right?.url);
  if (leftUrl && rightUrl && leftUrl === rightUrl) return true;

  const leftTitle = left?.articleTitleKey || canonicalArticleTitle(left?.title);
  const rightTitle = right?.articleTitleKey || canonicalArticleTitle(right?.title);
  if (!leftTitle || leftTitle !== rightTitle) return false;

  const leftSource = left?.articleSourceKey || articleSourceKey(left);
  const rightSource = right?.articleSourceKey || articleSourceKey(right);
  return Boolean(leftSource && leftSource === rightSource);
}
