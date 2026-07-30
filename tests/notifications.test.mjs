import assert from "node:assert/strict";
import test from "node:test";
import { isSameArticle } from "../scripts/article-identity.mjs";

const base = {
  title: "米中外相会談、首脳往来を協議",
  source: "NHK",
  url: "https://example.com/articles/123",
};

test("the same article is suppressed across repeated collection routes", () => {
  assert.equal(
    isSameArticle(base, {
      ...base,
      url: "https://example.com/articles/123?utm_source=alert",
    }),
    true,
  );
  assert.equal(
    isSameArticle(
      {
        title: "President Trump Announces New Export Controls on China",
        source: "White House · News",
        url: "https://www.whitehouse.gov/news/export-controls",
      },
      {
        title: "President Trump Announces New Export Controls on China",
        source: "The White House (.gov)",
        url: "https://news.google.com/rss/articles/white-house-copy",
      },
    ),
    true,
  );
  assert.equal(
    isSameArticle(base, {
      ...base,
      url: "https://news.google.com/rss/articles/different-route",
    }),
    true,
  );
});

test("separate publishers covering the same event remain separate alerts", () => {
  assert.equal(
    isSameArticle(base, {
      ...base,
      source: "Reuters",
      url: "https://reuters.com/world/another-story",
    }),
    false,
  );
});
