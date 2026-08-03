import assert from "node:assert/strict";
import test from "node:test";
import {
  extractCaptionTrackUrl,
  extractReportedExcerpt,
  extractYoutubeId,
  isSpokenEventTitle,
  parseCaptionBody,
  selectRelevantTranscript,
} from "../lib/spoken-signals.ts";

test("detects non-text presidential interviews and press gaggles", () => {
  assert.equal(isSpokenEventTitle("President Trump Gaggles with Press on Air Force One"), true);
  assert.equal(isSpokenEventTitle("トランプ大統領が機中で記者団の質問に答える"), true);
  assert.equal(isSpokenEventTitle("White House photo gallery"), false);
});

test("extracts media-quoted speech without treating the full article as a transcript", () => {
  assert.equal(
    extractReportedExcerpt("トランプ氏、日本は「助けを必要としていた」 日米協調為替介入巡り"),
    "助けを必要としていた",
  );
});

test("extracts YouTube video and caption-track identifiers from an official page", () => {
  assert.equal(extractYoutubeId('<iframe src="https://www.youtube.com/embed/6OyAg4YczaY?feature=oembed"></iframe>'), "6OyAg4YczaY");
  assert.equal(
    extractCaptionTrackUrl('{"captionTracks":[{"baseUrl":"https://www.youtube.com/api/timedtext?v=x\\u0026lang=en","name":{"simpleText":"English"}}]}'),
    "https://www.youtube.com/api/timedtext?v=x&lang=en",
  );
});

test("parses captions and keeps the policy-relevant exchange with context", () => {
  const body = JSON.stringify({ events: [
    { segs: [{ utf8: "REPORTER: Why did the United States help Japan? " }] },
    { segs: [{ utf8: "PRESIDENT TRUMP: Japan had a weakening yen and wanted a little bit of help. " }] },
    { segs: [{ utf8: "It was a signal of friendship and good for the world economy. " }] },
    { segs: [{ utf8: "Next question was about a domestic event." }] },
  ] });
  const selected = selectRelevantTranscript(parseCaptionBody(body));
  assert.match(selected, /help Japan/);
  assert.match(selected, /weakening yen/);
  assert.match(selected, /signal of friendship/);
  assert.doesNotMatch(selected, /domestic event/);
});
