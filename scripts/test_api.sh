#!/usr/bin/env zsh
# Test the Apps Script web app. Prompts for URL and token so they never land in shell history.
# Prints only a summary (no quantities / costs) to avoid leaking asset data into terminal logs.
read "URL?Web app URL: "
read -s "TOKEN?Token: "
echo
# Body via stdin keeps the token out of the process list.
# --data with -L: curl follows Apps Script's 302 redirect as GET, which is what it expects.
printf '{"token":"%s"}' "$TOKEN" |
  curl -sL -H 'Content-Type: text/plain' --data-binary @- "$URL" |
  node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      let r;
      try { r = JSON.parse(s); } catch { return console.log("Non-JSON response:", s.slice(0, 200)); }
      if (!r.ok) return console.log("ERROR:", r.error);
      console.log("ok        :", r.ok);
      console.log("updated_at:", r.updated_at);
      console.log("holdings  :", r.holdings.length, "rows");
      for (const [id, q] of Object.entries(r.quotes)) {
        console.log(" ", id.padEnd(12), q ? `price=${q.price} ${q.currency}` : "NO QUOTE (fallback to sheet_price)");
      }
    });'
unset TOKEN
