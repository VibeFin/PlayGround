async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({ error: `Server returned ${res.status}` }));
  return data;
}

export const api = {
  state: () => call("GET", "/api/state"),
  act: (action) => call("POST", "/api/action", action),
};
