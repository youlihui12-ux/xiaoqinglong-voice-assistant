const http = require("http");

const checks = [
  ["frontdoor health", "http://127.0.0.1:43173/health"],
  ["mission control", "http://127.0.0.1:43173/api/mission-control"],
  ["control panel", "http://127.0.0.1:43174/"],
];

function get(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve({ ok: res.statusCode >= 200 && res.statusCode < 500, statusCode: res.statusCode });
    });
    req.on("error", (error) => resolve({ ok: false, error: error.message }));
    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ ok: false, error: "timeout" });
    });
  });
}

(async () => {
  let failed = false;
  for (const [name, url] of checks) {
    const result = await get(url);
    const mark = result.ok ? "ok" : "fail";
    console.log(mark + " " + name + " " + url + " " + (result.statusCode || result.error || ""));
    if (!result.ok) failed = true;
  }
  process.exit(failed ? 1 : 0);
})();
