const base = process.env.STAR_HOME_WEB ?? "http://127.0.0.1:3456";

async function call(path, { cookie, body, method } = {}) {
  const response = await fetch(base + path, {
    method: method ?? (body ? "POST" : "GET"),
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  const setCookie = response.headers.getSetCookie?.() ?? [];
  return { status: response.status, text, json, cookie: setCookie.map((item) => item.split(";")[0]).join("; ") };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const wrong = await call("/api/auth/login", { body: { login: "stanislav", password: "nope" } });
assert(wrong.status === 401, `wrong password ${wrong.status}`);

const anon = await call("/api/notifications");
assert(anon.status === 401, `notifications without session ${anon.status}`);

const login = await call("/api/auth/login", { body: { login: "stanislav", password: "resident" } });
assert(login.status === 200 && login.json?.redirectTo === "/home", "resident login");
const home = await call("/home", { cookie: login.cookie });
assert(home.status === 200 && home.text.includes("Дом №24") && home.text.includes("STAR HOME"), "resident home");

const notes = await call("/api/notifications", { cookie: login.cookie });
assert(notes.status === 200 && Array.isArray(notes.json?.notices), "notifications");

const admin = await call("/api/auth/login", { body: { login: "admin", password: "admin" } });
assert(admin.status === 200 && admin.json?.redirectTo === "/admin", "admin login");
const desk = await call("/admin", { cookie: admin.cookie });
assert(desk.status === 200 && desk.text.includes("Объекты") && desk.text.includes("ЖК Новый") && desk.text.includes("КП Новый"), "admin objects");

const unsigned = await fetch("http://127.0.0.1:3457/objects", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: "{}",
});
assert(unsigned.status === 401, `unsigned resource ${unsigned.status}`);

console.log("screens ok");
