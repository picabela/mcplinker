import test from 'node:test';
import assert from 'node:assert/strict';
import {movedDate,movablePost} from '../lib/calendar.mjs';
process.env.TZ='Europe/Warsaw';
test('moving across DST preserves local hour',()=>{assert.equal(movedDate('2026-10-24T10:30:00.000Z','2026-10-26'),'2026-10-26T11:30:00.000Z');});
test('invalid dates and nonexistent local hours are rejected',()=>{assert.throws(()=>movedDate('2026-03-28T01:30:00Z','2026-03-29'));assert.throws(()=>movedDate('2026-01-01T10:00:00Z','2026-02-30'));});
test('only pending dated posts can move',()=>{for(const status of ['processing','published','failed','uncertain','cancelled'])assert.equal(movablePost({status,scheduled_at:'2027-01-01T12:00:00Z'}),false);assert.equal(movablePost({status:'scheduled',scheduled_at:'2027-01-01T12:00:00Z'}),true);});
