// node web/near/live.test.mjs
import assert from "node:assert/strict";
import { toCycle } from "./live.js";
const s = n => String(BigInt(n) * 1000000000n);
const { now, cycle } = toCycle({
  id: 7, status: "open", now: s(100), opens_at: s(0), ends_at: s(160), pool: "2500000000000000000000000",
  gesture_count: 3, current_cost: "1", last_gesturer: "a.testnet", last_gesture_at: s(90), seed: "ab",
  players: [{ account_id: "a.testnet", volume: "2000000000000000000000000", gestures: 2, held_ns: s(25) },
            { account_id: "b.testnet", volume: "500000000000000000000000", gestures: 1, held_ns: s(40) }],
});
assert.equal(now, 100); assert.equal(cycle.endsAt, 160); assert.equal(cycle.pool, 2.5);
assert.equal(cycle.players[0].held, 15); // 25 s minus the 10 s live hold the page adds back
assert.equal(cycle.players[1].held, 40); assert.equal(cycle.players[1].volume, 0.5);
console.log("live.test ok");

import { validName } from "./live.js";
for (const ok of ["alice", "a1", "bob-the_3", "x".repeat(56)]) assert.ok(validName(ok, ".testnet"), ok);
for (const bad of ["a", "Alice", "-bob", "bob-", "bo--b", "b_-b", "al.ice", "al ice", "x".repeat(57)]) assert.ok(!validName(bad, ".testnet"), bad);
console.log("validName ok");

import { yocto } from "./live.js";
assert.equal(yocto("2"), "2000000000000000000000000");
assert.equal(yocto("0.01"), "10000000000000000000000");
assert.equal(yocto(1.5), "1500000000000000000000000");
assert.equal(yocto("0.123456789012345678901234567"), "123456789012345678901234"); // extra digits dropped
console.log("yocto ok");
