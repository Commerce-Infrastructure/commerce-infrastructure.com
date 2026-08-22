const MARKDOWN_CONTENT_TYPE = "text/markdown; charset=utf-8";
const HTML_CONTENT_TYPE = "text/html; charset=utf-8";
const NEGOTIATED_PATHS = new Set(["/", "/index.html"]);

const markdownNotFound = `# Page not found

The page you requested does not exist or has moved.

Try one of these starting points:

- [Homepage](/)
- [Agent guidance (llms.txt)](/llms.txt)
- [Sitemap](/sitemap.xml)
`;

function acceptedMediaRange(header, target) {
  const [targetType, targetSubtype] = target.split("/");

  return header
    .split(",")
    .map((part, index) => {
      const [mediaType, ...parameters] = part.trim().toLowerCase().split(";");
      const [type, subtype] = mediaType.trim().split("/");
      const qParameter = parameters.find((parameter) => parameter.trim().startsWith("q="));
      const quality = qParameter ? Number.parseFloat(qParameter.trim().slice(2)) : 1;
      const specificity = type === "*" ? 0 : subtype === "*" ? 1 : 2;
      const matches = (type === "*" || type === targetType) && (subtype === "*" || subtype === targetSubtype);

      return { index, quality: Number.isFinite(quality) ? quality : 0, specificity, matches };
    })
    .filter((range) => range.matches)
    .sort((left, right) => right.quality - left.quality || right.specificity - left.specificity || left.index - right.index)[0];
}

export function preferredRepresentation(accept) {
  if (!accept || accept.trim() === "") return "html";

  const markdown = acceptedMediaRange(accept, "text/markdown");
  const html = acceptedMediaRange(accept, "text/html");
  const markdownQuality = markdown?.quality ?? 0;
  const htmlQuality = html?.quality ?? 0;

  if (markdownQuality === 0 && htmlQuality === 0) return "none";
  if (markdownQuality > htmlQuality) return "markdown";
  if (htmlQuality > markdownQuality) return "html";

  // A wildcard is not a preference for Markdown; keep browser-safe HTML as default.
  if (markdown?.specificity === 0 && html?.specificity === 0) return "html";
  return markdown.index < html.index ? "markdown" : "html";
}

function varyByAccept(response, contentType) {
  const headers = new Headers(response.headers);
  headers.set("Content-Type", contentType);
  headers.set("Vary", "Accept, Accept-Encoding");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function notAcceptable() {
  return new Response("Not Acceptable\n", {
    status: 406,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Vary": "Accept, Accept-Encoding"
    }
  });
}

function markdown404() {
  return new Response(markdownNotFound, {
    status: 404,
    headers: {
      "Content-Type": MARKDOWN_CONTENT_TYPE,
      "Vary": "Accept, Accept-Encoding"
    }
  });
}

function assetRequest(request, pathname) {
  const url = new URL(request.url);
  url.pathname = pathname;
  return new Request(url, request);
}

async function html404(request, env) {
  const response = await env.ASSETS.fetch(assetRequest(request, "/404.html"));
  const headers = new Headers(response.headers);
  headers.set("Content-Type", HTML_CONTENT_TYPE);
  headers.set("Vary", "Accept, Accept-Encoding");
  return new Response(response.body, { status: 404, headers });
}

async function markdownHome(request, env) {
  const response = await env.ASSETS.fetch(assetRequest(request, "/index.md"));
  return varyByAccept(response, MARKDOWN_CONTENT_TYPE);
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    const representation = preferredRepresentation(request.headers.get("Accept"));

    if (NEGOTIATED_PATHS.has(pathname)) {
      if (representation === "none") return notAcceptable();
      if (representation === "markdown") return markdownHome(request, env);

      const response = await env.ASSETS.fetch(request);
      return response.status === 404 ? html404(request, env) : varyByAccept(response, HTML_CONTENT_TYPE);
    }

    if (pathname === "/index.md") {
      const response = await env.ASSETS.fetch(request);
      return varyByAccept(response, MARKDOWN_CONTENT_TYPE);
    }

    const response = await env.ASSETS.fetch(request);
    if (response.status !== 404) return response;
    return representation === "markdown" ? markdown404() : html404(request, env);
  }
};
