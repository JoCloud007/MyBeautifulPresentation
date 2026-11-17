import { JSDOM } from "jsdom";
const REQUEST_TIMEOUT = 10000;
async function fetchWithTimeout(url, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
            },
        });
        return response;
    }
    finally {
        clearTimeout(timer);
    }
}
async function webSearch(query, maxResults = 3) {
    const searchUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    const response = await fetchWithTimeout(searchUrl, REQUEST_TIMEOUT);
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const dom = new JSDOM(html);
    const doc = dom.window.document;
    const results = [];
    for (const el of Array.from(doc.querySelectorAll(".result")).slice(0, maxResults)) {
        const titleEl = el.querySelector(".result__a");
        const snippetEl = el.querySelector(".result__snippet");
        const title = titleEl?.textContent?.trim();
        let url = titleEl?.getAttribute("href") || "";
        const snippet = snippetEl?.textContent?.trim() || "";
        if (url.startsWith("//"))
            url = `https:${url}`;
        else if (!url.startsWith("http"))
            url = `https://duckduckgo.com${url}`;
        if (title)
            results.push({ title, url, snippet });
    }
    return results;
}
async function webFetch(url) {
    const response = await fetchWithTimeout(url, REQUEST_TIMEOUT);
    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const dom = new JSDOM(html, { url });
    const doc = dom.window.document;
    for (const tag of ["script", "style", "nav", "footer", "header", "aside"]) {
        for (const el of Array.from(doc.querySelectorAll(tag))) {
            el.remove();
        }
    }
    const title = doc.querySelector("title")?.textContent?.trim() || "";
    const contentEl = doc.querySelector("main") || doc.querySelector("article") || doc.body;
    let content = "";
    if (contentEl) {
        const parts = [];
        for (const el of Array.from(contentEl.querySelectorAll("p, h1, h2, h3"))) {
            const text = el.textContent?.trim();
            if (text && text.length > 20)
                parts.push(text);
        }
        content = parts.join("\n\n");
    }
    return { title, content: content.slice(0, 500) + "..." };
}
async function main() {
    console.log("Testing web_search...");
    const results = await webSearch("Debian history");
    console.log(`Found ${results.length} results`);
    for (const r of results) {
        console.log(`- ${r.title}: ${r.url}`);
    }
    if (results.length > 0) {
        console.log("\nTesting web_fetch on first result...");
        const fetchResult = await webFetch(results[0].url);
        console.log(`Title: ${fetchResult.title}`);
        console.log(`Content preview: ${fetchResult.content.slice(0, 200)}...`);
    }
}
main().catch(console.error);
