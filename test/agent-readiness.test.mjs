import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("..", import.meta.url);
const fromRoot = (path) => new URL(path, root);

async function text(path) {
  return readFile(fromRoot(path), "utf8");
}

async function assetResponse(request) {
  const url = new URL(request.url);
  const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  try {
    const body = await text(file);
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": file.endsWith(".md") ? "text/markdown; charset=utf-8" : "text/html; charset=utf-8" }
    });
  } catch {
    return new Response("not found", { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}

test("homepage declares a machine-readable Organization identity", async () => {
  const homepage = await text("index.html");
  const match = homepage.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/);
  assert.ok(match, "homepage must contain JSON-LD");

  const identity = JSON.parse(match[1]);
  assert.equal(identity["@context"], "https://schema.org");
  assert.equal(identity["@type"], "Organization");
  assert.equal(identity.name, "Commerce Infrastructure");
  assert.equal(identity.url, "https://commerce-infrastructure.com/");
  assert.match(identity.description, /ecommerce platform/i);
  assert.match(homepage, /rel="canonical" href="https:\/\/commerce-infrastructure\.com\//);
});

test("agent discovery files contain an actionable when-to-use guide", async () => {
  const llms = await text("llms.txt");
  const sitemap = await text("sitemap.xml");
  const robots = await text("robots.txt");

  assert.match(llms, /^# Commerce Infrastructure/m);
  assert.match(llms, /^## When to use Commerce Infrastructure/m);
  assert.match(llms, /pre-close diligence/i);
  assert.match(llms, /post-close stabilization/i);
  assert.match(llms, /jhill@commerce-infrastructure\.com/);
  assert.match(sitemap, /https:\/\/commerce-infrastructure\.com\//);
  assert.match(robots, /Sitemap: https:\/\/commerce-infrastructure\.com\/sitemap\.xml/);
});

test("static 404 page gives human visitors recovery links", async () => {
  const notFound = await text("404.html");
  assert.match(notFound, /href="\/"/);
  assert.match(notFound, /href="\/llms\.txt"/);
  assert.match(notFound, /href="\/sitemap\.xml"/);
});

test("worker negotiates markdown and returns recoverable 404s", async () => {
  const { default: worker, preferredRepresentation } = await import(fromRoot("src/worker.js"));
  const env = { ASSETS: { fetch: assetResponse } };

  assert.equal(preferredRepresentation("text/markdown;q=1, text/html;q=0.9"), "markdown");
  assert.equal(preferredRepresentation("text/html, text/markdown"), "html");
  assert.equal(preferredRepresentation("text/markdown, text/html"), "markdown");
  assert.equal(preferredRepresentation("*/*"), "html");

  const markdownHome = await worker.fetch(new Request("https://commerce-infrastructure.com/", { headers: { Accept: "text/markdown" } }), env);
  assert.equal(markdownHome.status, 200);
  assert.equal(markdownHome.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.match(markdownHome.headers.get("Vary"), /Accept/);
  assert.match(await markdownHome.text(), /^# Commerce Infrastructure/m);

  const htmlHome = await worker.fetch(new Request("https://commerce-infrastructure.com/", { headers: { Accept: "text/html" } }), env);
  assert.equal(htmlHome.status, 200);
  assert.equal(htmlHome.headers.get("Content-Type"), "text/html; charset=utf-8");
  assert.match(htmlHome.headers.get("Vary"), /Accept/);

  const markdown404 = await worker.fetch(new Request("https://commerce-infrastructure.com/not-a-real-page", { headers: { Accept: "text/markdown" } }), env);
  assert.equal(markdown404.status, 404);
  assert.equal(markdown404.headers.get("Content-Type"), "text/markdown; charset=utf-8");
  assert.match(await markdown404.text(), /^# Page not found/m);

  const html404 = await worker.fetch(new Request("https://commerce-infrastructure.com/not-a-real-page"), env);
  assert.equal(html404.status, 404);
  assert.match(html404.headers.get("Vary"), /Accept/);

  const unacceptable = await worker.fetch(new Request("https://commerce-infrastructure.com/", { headers: { Accept: "application/json" } }), env);
  assert.equal(unacceptable.status, 406);
  assert.match(unacceptable.headers.get("Vary"), /Accept/);
});
