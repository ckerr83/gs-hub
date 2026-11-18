import test from "node:test";
import assert from "node:assert/strict";
import {
  requestSignInLink,
  finishSignIn,
  confirmationProof,
  accessError,
  sameOriginPost,
  signInRequestError,
} from "../lib/flow.ts";
function mockClient({
  error = null,
  user = { id: "approved-id" },
  access = true,
  accessError = null,
} = {}) {
  const calls = [];
  return {
    calls,
    auth: {
      async signInWithOtp(input) {
        calls.push(["request", input]);
        return { error };
      },
      async exchangeCodeForSession(input) {
        calls.push(["exchange", input]);
        return { error };
      },
      async verifyOtp(input) {
        calls.push(["verify", input]);
        return { error };
      },
      async getUser() {
        calls.push(["user"]);
        return { data: { user }, error: null };
      },
    },
    async rpc(name) {
      calls.push(["rpc", name]);
      return { data: access, error: accessError };
    },
  };
}
test("email sign-in cannot create accounts and uses a fixed same-origin callback", async () => {
  const client = mockClient();
  assert.equal(
    await requestSignInLink(
      client,
      " chris@gsimport.co.th ",
      "https://hub.example",
    ),
    null,
  );
  assert.deepEqual(client.calls, [
    [
      "request",
      {
        email: "chris@gsimport.co.th",
        options: {
          shouldCreateUser: false,
          emailRedirectTo: "https://hub.example/auth/callback",
        },
      },
    ],
  ]);
  assert.equal(
    await requestSignInLink(client, "bad-address", "https://hub.example"),
    "email",
  );
  assert.equal(client.calls.length, 1);
  assert.equal(
    await requestSignInLink(client, "a@example.com", "javascript:alert(1)"),
    "unavailable",
  );
  assert.equal(client.calls.length, 1);
});
test("email request failures and rate limits never appear successful", async () => {
  assert.equal(
    await requestSignInLink(
      mockClient({ error: { code: "signup_disabled" } }),
      "a@example.com",
      "https://hub.example",
    ),
    "invitation",
  );
  assert.equal(
    await requestSignInLink(
      mockClient({ error: { status: 429 } }),
      "a@example.com",
      "https://hub.example",
    ),
    "rate-limit",
  );
  const client = mockClient();
  client.auth.signInWithOtp = async () => {
    throw Error("network");
  };
  assert.equal(
    await requestSignInLink(client, "a@example.com", "https://hub.example"),
    "unavailable",
  );
});
test("callback verifies identity and membership before opening the wine database", async () => {
  const client = mockClient();
  assert.equal(
    await finishSignIn(client, { code: "valid-code" }),
    "/wine-database",
  );
  assert.deepEqual(client.calls, [
    ["exchange", "valid-code"],
    ["user"],
    ["rpc", "wine_can_read"],
  ]);
  const denied = mockClient({ access: false });
  assert.equal(
    await finishSignIn(denied, { code: "valid-code" }),
    "/sign-in?error=unapproved",
  );
  const unavailable = mockClient({
    accessError: { message: "not configured" },
  });
  assert.equal(
    await finishSignIn(unavailable, { code: "valid-code" }),
    "/sign-in?error=unavailable",
  );
  const anonymous = mockClient({ user: null });
  assert.equal(
    await finishSignIn(anonymous, { code: "valid-code" }),
    "/sign-in?error=unavailable",
  );
  assert.ok(!anonymous.calls.some(([name]) => name === "rpc"));
});
test("expired links fail before access checks and destinations cannot be supplied by a link", async () => {
  const client = mockClient({ error: { code: "otp_expired" } });
  assert.equal(
    await finishSignIn(client, {
      code: "expired",
      next: "https://attacker.example",
    }),
    "/sign-in?error=expired",
  );
  assert.deepEqual(client.calls, [["exchange", "expired"]]);
  const valid = mockClient();
  assert.equal(
    await finishSignIn(valid, { code: "good", next: "//attacker.example" }),
    "/wine-database",
  );
  const malformed = mockClient();
  assert.equal(
    await finishSignIn(malformed, { code: "" }),
    "/sign-in?error=expired",
  );
  assert.deepEqual(malformed.calls, []);
});
test("only email and invitation proof types are accepted", async () => {
  const token = "a".repeat(64);
  assert.equal(confirmationProof(token, "recovery"), null);
  assert.equal(confirmationProof(token, "signup"), null);
  assert.equal(confirmationProof("invalid", "invite"), null);
  for (const type of ["email", "invite"]) {
    const client = mockClient(),
      proof = confirmationProof(token, type);
    assert.deepEqual(proof, { token_hash: token, type });
    assert.equal(await finishSignIn(client, proof), "/wine-database");
    assert.deepEqual(client.calls[0], ["verify", proof]);
  }
});
test("confirmation POSTs require the app origin; error query strings are allowlisted", () => {
  const url = "https://hub.example/auth/verify";
  assert.equal(
    sameOriginPost(
      new Request(url, {
        method: "POST",
        headers: {
          origin: "https://hub.example",
          "sec-fetch-site": "same-origin",
        },
      }),
    ),
    true,
  );
  assert.equal(
    sameOriginPost(
      new Request(url, {
        method: "POST",
        headers: { origin: "https://attacker.example" },
      }),
    ),
    false,
  );
  assert.equal(sameOriginPost(new Request(url, { method: "POST" })), false);
  assert.equal(
    sameOriginPost(
      new Request(url, {
        method: "POST",
        headers: {
          origin: "https://hub.example",
          "sec-fetch-site": "cross-site",
        },
      }),
    ),
    false,
  );
  assert.equal(accessError("unapproved"), "unapproved");
  assert.equal(accessError("<script>alert(1)</script>"), null);
  assert.equal(accessError(["expired"]), null);
});

test("provider failures distinguish invitation, email delivery and service setup without guessing from messages", () => {
  for (const [code, expected] of [
    ["otp_disabled", "invitation"],
    ["signup_disabled", "invitation"],
    ["user_not_found", "invitation"],
    ["email_address_not_authorized", "email-delivery"],
    ["email_provider_disabled", "email-disabled"],
    ["email_address_invalid", "email"],
    ["user_banned", "account-blocked"],
  ])
    assert.equal(signInRequestError({ code }), expected);
  assert.equal(
    signInRequestError({ status: 500, code: "unexpected_failure" }),
    "email-service",
  );
  assert.equal(
    signInRequestError({ status: 400, code: "future_error" }),
    "send",
  );
});
test("error diagnostics contain only safe provider codes and HTTP status", async () => {
  const received = [];
  const client = mockClient({
    error: {
      code: "email_address_not_authorized",
      status: 403,
      message: "private token should not escape",
      token: "secret",
    },
  });
  assert.equal(
    await requestSignInLink(
      client,
      "a@example.com",
      "https://hub.example",
      (value) => received.push(value),
    ),
    "email-delivery",
  );
  assert.deepEqual(received, [
    { code: "email_address_not_authorized", status: 403 },
  ]);
  const unsafe = mockClient({
    error: {
      code: "<script>private-token</script>",
      status: 900,
      message: "secret",
    },
  });
  await requestSignInLink(
    unsafe,
    "a@example.com",
    "https://hub.example",
    (value) => received.push(value),
  );
  assert.deepEqual(received[1], { code: undefined, status: undefined });
});
